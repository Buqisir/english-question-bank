import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { applySpellingReview, listeningEditEvidenceMatch, listeningEditSpeakerLabels as speakerLabels,
  listeningEditWords, touchesListeningSpeakerBoundary } from '../../server/paper-import/spellingReview.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { appleSource, localEngines, parakeet, readJson, remoteEngine, withWork } from './listening-transcript-check-engines.mjs'
import { align, nearProperName, observation, sites, timedReading, units } from './listening-transcript-check-alignment.mjs'
import { questionMarkerSpan, sentenceSites } from './listening-transcript-check-sentences.mjs'
import { rewriteTurns } from './listening-transcript-check-turns.mjs'

const wordText = (words, separator = ' ') => words.map(word => word.token).join(separator)
const sameWords = (first, second) => wordText(first.words) === wordText(second.words)

function editSpan(text, source, site, { value, punctuation }) {
  const next = source[site.start]
  const prev = source[site.start - 1]
  let start = next?.start ?? text.trimEnd().length
  if (site.start === site.end) {
    const rawGap = text.slice(prev?.end ?? 0, start)
    const newline = rawGap.indexOf('\n')
    if (prev && newline >= 0 && /[.!?]/u.test(punctuation)) {
      return { start: prev.end + newline, before: '', after: ` ${value}${punctuation}` }
    }
    if (!next) return { start, before: '', after: ` ${value}${punctuation}` }
    return { start, before: '', after: `${value}${punctuation} ` }
  }
  let end = source[site.end - 1].end
  if (!value) {
    const trailingSpace = text.slice(end).match(/^[ \t]+/u)?.[0].length ?? 0
    if (trailingSpace) end += trailingSpace
    else if (prev && /^[ \t]+$/u.test(text.slice(prev.end, start))) start = prev.end
  }
  return { start, before: text.slice(start, end), after: value }
}

function evidenceRange(occurrence, votes) {
  const words = votes.flatMap(vote => vote.context)
    .filter(word => Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds))
  const { startSeconds, endSeconds } = occurrence
  if (!words.length) return null
  const start = Math.max(startSeconds, Math.floor((startSeconds + Math.min(...words.map(w => w.startSeconds)) - 0.35) * 100) / 100)
  const end = Math.min(endSeconds, Math.ceil((startSeconds + Math.max(...words.map(w => w.endSeconds)) + 0.35) * 100) / 100)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { startSeconds: start, endSeconds: end } : null
}

function uniqueEvidence(text, span, vote) {
  const { availableLeft, availableRight, window } = vote
  const spoken = listeningEditWords(vote.value).length
  let left = 0, right = 0
  while (left < availableLeft && listeningEditWords(window(left, 0).evidence).length < spoken + 2) left++
  while (right < availableRight && listeningEditWords(window(0, right).evidence).length < spoken + 2) right++
  const pending = [[left, right]]
  const visited = new Set()
  for (const [l, r] of pending) {
    if (visited.has(`${l}:${r}`)) continue
    visited.add(`${l}:${r}`)
    const sample = window(l, r)
    const match = listeningEditEvidenceMatch(text, span, sample.evidence)
    if (match === 'unique') return { engine: vote.engine, ...sample }
    if (match !== 'ambiguous') continue
    if (l < availableLeft) pending.push([l + 1, r])
    if (r < availableRight) pending.push([l, r + 1])
  }
  return null
}

function remoteObservation(text, source, site) {
  const start = Math.max(0, site.start - 3)
  const reference = source.slice(start, site.end + 3)
  const words = units(text)
  if (!words.length) return null
  const result = align(reference, words)
  const localSite = { start: site.start - start, end: site.end - start }
  // Clip edges may contain partial words. Require shared context adjacent to the edit.
  if (!reference.length || result.changes.some(change => change.start < localSite.start && change.end >= localSite.start
    || change.start <= localSite.end && change.end > localSite.end)) return null
  return { ...observation({ ...result, words, text }, localSite), evidence: text }
}

export async function adjudicate(group, text, engines, remote, audioSha256) {
  const { key, segmentId, occurrence } = group
  const source = units(text.replace(speakerLabels, label => ' '.repeat(label.length)))
  const readings = Object.entries(engines).map(([engine, results]) => {
    const reading = timedReading(results[key] ?? [], source)
    return { engine, ...reading, ...align(source, reading.words) }
  })
  if (!source.length || readings.some(reading => reading.similarity < 0.55)) {
    return { edits: [], review: [{ segmentId, occurrence, reason: '本地转写与该段大范围对不上，请先听核段号。' }] }
  }
  const edits = [], review = []
  const atSpeakerChange = site => touchesListeningSpeakerBoundary(text,
    editSpan(text, source, site, { value: ' ', punctuation: '' }))
  const canJoin = (left, right) => !atSpeakerChange(left) && !atSpeakerChange(right)
  const parakeet = readings.find(reading => reading.engine === 'parakeet-v2')
  const plan = sentenceSites(text, source, sites(readings, canJoin), parakeet)
  if (plan.rewritten) return rewriteTurns(group, text, readings, engines, audioSha256)
  for (const site of plan.sites) {
    const votes = readings.map(reading => ({ engine: reading.engine, ...observation(reading, site) }))
    const sourceWords = source.slice(site.start, site.end)
    if (votes.every(vote => wordText(vote.words, '') === wordText(sourceWords, ''))) continue
    const interval = evidenceRange(occurrence, votes)
    const localAgree = sameWords(votes[0], votes[1])
    if (!localAgree && interval && interval.endSeconds - interval.startSeconds <= 12) {
      const { text: heard } = await remote(interval)
      const vote = remoteObservation(heard, source, site)
      if (vote) votes.push({ engine: 'gpt-transcribe', ...vote })
      else votes.push({ engine: 'gpt-transcribe', evidence: heard, words: [], unaligned: true })
    }
    const evidence = Object.fromEntries(votes.filter(vote => vote.evidence.trim()).map(vote => [vote.engine, vote.evidence]))
    const original = { words: sourceWords }
    const winner = votes.find(vote => !vote.unaligned && votes.filter(peer => !peer.unaligned && sameWords(vote, peer)).length >= 2)
    if (winner && (sameWords(winner, original) || wordText(winner.words, '') === wordText(sourceWords, ''))) continue
    if (winner && nearProperName(sourceWords, winner.words)) {
      const { before } = editSpan(text, source, site, { value: ' ', punctuation: '' })
      review.push({ segmentId, occurrence, ...interval, before, evidence, reason: '专有名词读音相近，保留原拼写待听核。' })
      continue
    }
    if (atSpeakerChange(site)) {
      const { before } = editSpan(text, source, site, { value: ' ', punctuation: '' })
      review.push({ segmentId, occurrence, ...interval, before, evidence, reason: '更正位置碰到说话人换行，请听核归属。' })
      continue
    }
    if (winner && interval) {
      const candidates = votes.filter(vote => !vote.unaligned && sameWords(vote, winner))
      let span, support
      for (const vote of candidates) {
        if (site.sentenceStart !== undefined && vote.engine !== 'parakeet-v2') continue
        const draft = site.sentenceStart === undefined ? editSpan(text, source, site, vote) : plan.sentenceSpan(site, vote)
        const candidate = draft && questionMarkerSpan(text, draft)
        if (!candidate || candidate.before === candidate.after || candidate.before.match(speakerLabels)
          || touchesListeningSpeakerBoundary(text, candidate)) continue
        const samples = candidates.map(peer => uniqueEvidence(text, candidate, peer)).filter(Boolean)
        if (samples.length < 2) continue
        span = candidate
        support = samples
        break
      }
      const previous = edits.at(-1)
      if (span && (!previous || previous.start !== span.start && previous.start + previous.before.length <= span.start)) {
        const expanded = evidenceRange(occurrence, support)
        for (const sample of support) evidence[sample.engine] = sample.evidence
        edits.push({ segmentId, ...span, audioSha256, occurrence,
          startSeconds: Math.min(interval.startSeconds, expanded?.startSeconds ?? interval.startSeconds),
          endSeconds: Math.max(interval.endSeconds, expanded?.endSeconds ?? interval.endSeconds), evidence,
          reason: site.sentenceStart !== undefined ? '改写密集，按两家录音共识整句替换。'
            : localAgree ? 'Apple 与 Parakeet v2 独立转写一致。' : '本地引擎有分歧，短片复核后两家转写一致。' })
        continue
      }
    }
    const { before } = editSpan(text, source, site, { value: '', punctuation: '' })
    review.push({ segmentId, occurrence, ...interval, before, evidence, reason: site.sentenceStart !== undefined
      ? '该句改写密集，录音共识或句界不足，请整句听核。' : '转写或相邻词未能共同证实同一处更正。' })
  }
  return { edits, review }
}

function markdown(edits, review, rewritten) {
  const details = ({ segmentId, startSeconds, endSeconds, before, after, evidence, reason }) => [
    `### ${segmentId}${startSeconds === undefined ? '' : ` · ${startSeconds}–${endSeconds} 秒`}`,
    `- 改前 \`${before?.trim() || '（空）'}\``,
    ...(after === undefined ? [] : [`- 改后 \`${after.trim() || '（删除）'}\``]),
    ...Object.entries(evidence ?? {}).map(([engine, heard]) => `- ${engine} · ${heard.replace(/\r?\n/gu, ' ')}`),
    `- ${reason}`, '',
  ].join('\n')
  return ['# 听力原文稿核对', '',
    ...(rewritten.length ? ['## 整段改写版', '', ...rewritten.map(({ segmentId, reason }) => `- ${segmentId} · ${reason}`), ''] : []),
    `## 建议更正（${edits.length}）`, '', ...edits.map(details),
    `## 人工听核（${review.length}）`, '', ...review.map(details)].join('\n')
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { 'spelling-review': { type: 'string' } } })
  if (positionals.length !== 4) {
    throw new Error('用法：node listening-transcript-check.mjs <playback.mp3> <listening-review-v1.json> <transcript.json> <输出目录> [--spelling-review <spelling-review-v1.json>]')
  }
  const [audio, reviewFile, transcriptFile, output] = positionals.map(value => path.resolve(value))
  const [audioBytes, review, transcriptBytes] = await Promise.all([readFile(audio), readJson(reviewFile), readFile(transcriptFile)])
  const audioSha256 = sha256(audioBytes)
  if (review.subject.playbackAudioSha256 !== audioSha256) throw new Error('播放音频与分段的哈希不一致')
  const audioBinding = { sha256: audioSha256, durationSeconds: review.subject.durationSeconds }
  let transcript = JSON.parse(transcriptBytes)
  if (values['spelling-review']) {
    const report = JSON.parse(await readFile(values['spelling-review'], 'utf8'))
    delete report.listeningEdits
    transcript = applySpellingReview(transcriptBytes, Buffer.from(JSON.stringify(report)), audioBinding)
  }
  if (transcript.paperId && transcript.paperId !== review.subject.paperId) throw new Error('原文稿与分段卷号不一致')
  const texts = new Map((transcript.listening?.transcript ?? transcript).map(item => [item.segmentId, item.text]))
  const groups = review.groups.filter(group => group.decision === 'usable').map((group, index) => {
    const occurrence = group.occurrences.find(o => o.startSeconds === group.playback.startSeconds && o.endSeconds === group.playback.endSeconds)
    if (!occurrence || !texts.has(group.segmentId) || !Number.isFinite(occurrence.startSeconds)
      || !Number.isFinite(occurrence.endSeconds) || occurrence.startSeconds < 0
      || occurrence.endSeconds <= occurrence.startSeconds || occurrence.endSeconds > audioBinding.durationSeconds) {
      throw new Error(`缺少有效原文稿或分段 · ${group.segmentId}`)
    }
    return { key: String(index + 1).padStart(2, '0'), segmentId: group.segmentId,
      occurrence: { startSeconds: occurrence.startSeconds, endSeconds: occurrence.endSeconds } }
  })
  if (!groups.length) throw new Error('没有可核对的听力分段')
  const cache = path.join(output, digestJson({ audioSha256, groups,
    apple: sha256(await readFile(appleSource)), parakeet: sha256(await readFile(parakeet)) }).slice(7))
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const engines = await withWork((work, env) => localEngines(audio, groups, cache, work, env))
  const listeningEdits = [], rewritten = [], needsReview = review.groups.filter(group => group.decision !== 'usable')
    .map(({ segmentId }) => ({ segmentId, reason: '缺少可用 occurrence，请先听核段号。' }))
  for (const group of groups) {
    const { edits, review, rewrite } = await adjudicate(group, texts.get(group.segmentId), engines,
      interval => remoteEngine(audio, interval, cache), audioSha256)
    listeningEdits.push(...edits)
    needsReview.push(...review)
    if (rewrite) rewritten.push(rewrite)
  }
  await Promise.all([
    writeFile(path.join(output, 'listening-edits.json'), `${JSON.stringify({ listeningEdits }, null, 2)}\n`, { mode: 0o600 }),
    writeFile(path.join(output, 'listening-edits.md'), markdown(listeningEdits, needsReview, rewritten), { mode: 0o600 }),
  ])
  console.log(`建议更正 ${listeningEdits.length} 处，人工听核 ${needsReview.length} 处。${output}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
