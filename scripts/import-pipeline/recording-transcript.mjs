import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_REVIEW_VERSION, LISTENING_RULE_EVIDENCE_VERSION } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { RECORDING_TRANSCRIPT_ID, RECORDING_TRANSCRIPT_TITLE } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { appleSource, localEngines, parakeet, remoteEngine, withWork } from './listening-transcript-check-engines.mjs'
import { align, timedReading, units } from './listening-transcript-check-alignment.mjs'
import { withPaperWriterLock } from './nck1-docx-materialize.mjs'

export function recordingCuts(cuts, paperId, audioSha256, duration) {
  const groups = cuts?.groups
  if (cuts?.paperId !== paperId || cuts.playbackAudioSha256 !== audioSha256 || !Number.isFinite(duration)
    || !Array.isArray(groups) || groups.length !== 10
    || groups.flatMap(g => g?.questionNumbers).join(',') !== Array.from({ length: 20 }, (_, i) => i + 1).join(',')
    || groups.some((group, i) => {
      const { startSeconds, endSeconds } = group?.playback || {}
      return group?.segmentId !== `listening-text-${i + 1}`
        || !Array.isArray(group.questionNumbers) || group.questionNumbers.some(n => !Number.isInteger(n))
        || group.questionNumbers.length < 1 || (i < 5 && group.questionNumbers.length !== 1)
        || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0
        || startSeconds < (groups[i - 1]?.playback?.endSeconds ?? 0) || endSeconds <= startSeconds || endSeconds > duration
    })) throw new Error('录音转写需要本卷播放音频 SHA-256 和十段有序切点，覆盖第 1–20 题')
  return groups.map(({ playback, questionNumbers }, i) => ({
    key: String(i + 1).padStart(2, '0'),
    occurrence: { startSeconds: playback.startSeconds, endSeconds: playback.endSeconds }, questionNumbers,
  }))
}

export function recordingReviewCuts(review, paperId, audioSha256, duration, ruleNotes) {
  if (!['listening-review-v1', LISTENING_REVIEW_VERSION].includes(review?.schemaVersion)
    || review.subject?.durationSeconds !== duration
    || !Array.isArray(review.groups) || review.groups.some(group => group?.decision !== 'usable'
      || !group.playback || !Array.isArray(group.occurrences) || !group.occurrences[0]
      || group.occurrences[0].startSeconds < group.playback?.startSeconds
      || group.occurrences[0].endSeconds > group.playback?.endSeconds)) {
    throw new Error('录音转写需要十段均可用的听力分段 review.json')
  }
  const groups = review.groups.map(group => {
    const first = group.occurrences[0]
    const notes = ruleNotes?.groups.find(item => item.segmentId === group.segmentId)
    const tails = notes?.anchorEvidence?.tails ?? []
    // The current rule reports one outer occurrence spanning all readings.
    // The first retained tail marks the end of the first complete reading.
    if (group.occurrences.length === 1 && tails.length > 1) {
      const end = tails[0].endSeconds
      if (!(end > first.startSeconds && end < tails[1].startSeconds && end < first.endSeconds)) {
        throw new Error(`单遍切点无法确认 · ${group.segmentId}`)
      }
      return { ...group, playback: { startSeconds: first.startSeconds, endSeconds: Math.min(end + 0.15, first.endSeconds) } }
    }
    if (group.occurrences.length === 1 && notes?.readingCountEvidence?.observedReadings > 1) {
      throw new Error(`单遍切点无法确认 · ${group.segmentId}`)
    }
    return { ...group, playback: first }
  })
  return recordingCuts({ ...review.subject, groups }, paperId, audioSha256, duration)
}

async function mergeReadings(group, engines, remote) {
  const [apple, parakeet] = Object.values(engines).map(engine => timedReading(engine[group.key] || [], []))
  const exact = (a, b) => a.token === b.token
  const { changes } = align(apple.words, parakeet.words, exact)
  if (!apple.words.length || !parakeet.words.length) throw new Error(`本地转写缺段 · Text ${group.key}`)
  let text = apple.text
  for (const site of changes.reverse()) {
    const { start, end, heardStart, heardEnd } = site
    const left = Math.max(0, start - 2), right = Math.min(apple.words.length, end + 2)
    const reference = apple.words.slice(left, right)
    const context = reference.concat(parakeet.words.slice(Math.max(0, heardStart - 2), heardEnd + 2))
    const origin = group.occurrence.startSeconds
    const range = { startSeconds: Math.max(origin, origin + Math.min(...context.map(w => w.startSeconds)) - 0.2),
      endSeconds: Math.min(group.occurrence.endSeconds, origin + Math.max(...context.map(w => w.endSeconds)) + 0.2) }
    if (range.endSeconds > range.startSeconds && range.endSeconds - range.startSeconds <= 12) {
      const clip = (await remote(range)).text
      const heard = units(clip)
      const { matches } = align(reference, heard, exact)
      const before = start === 0 ? 0 : matches.find(m => m.end === start - left)?.heardEnd
      const after = end === apple.words.length ? heard.length : matches.find(m => m.start === end - left)?.heardStart
      if (heard.length && Number.isInteger(before) && Number.isInteger(after) && after >= before) {
        const replacement = before === after ? '' : clip.slice(heard[before].start, heard[after - 1].end)
        const from = apple.words[start]?.start ?? apple.words.at(-1).end
        const to = start === end ? from : apple.words[end - 1].end
        const inserted = from === to && replacement ? (start === apple.words.length ? ` ${replacement}` : `${replacement} `) : replacement
        text = text.slice(0, from) + inserted + text.slice(to)
        continue
      }
    }
    throw new Error(`分歧片段无法按共同上下文复核 · Text ${group.key}`)
  }
  return text.replace(/\s+/gu, ' ').trim()
}

export function recordingDocx(paragraphs, work) {
  mkdirSync(path.join(work, 'word'))
  mkdirSync(path.join(work, '_rels'))
  const body = paragraphs.map(text => `<w:p><w:r><w:t>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</w:t></w:r></w:p>`).join('')
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  }
  for (const [file, xml] of Object.entries(files)) {
    writeFileSync(path.join(work, file), xml)
    utimesSync(path.join(work, file), 946684800, 946684800)
  }
  return execFileSync('zip', ['-q', '-X', '-', ...Object.keys(files)], { cwd: work, env: { ...process.env, TZ: 'UTC' } })
}

export async function stageRecordingTranscript(paperDir, cutsPath) {
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const audio = path.join(paperDir, 'materialization/listening-audio/playback.mp3')
  const segments = JSON.parse(readFileSync(path.join(path.dirname(audio), 'segments-v1.json'), 'utf8'))
  const audioSha256 = sha256(readFileSync(audio))
  if (segments.paperId !== manifest.paperId || segments.playbackAudioSha256 !== audioSha256) throw new Error('播放录音与本卷不匹配')
  const review = JSON.parse(readFileSync(cutsPath, 'utf8'))
  const ruleNotes = (review.evidence ?? []).filter(item => item.kind === 'review_notes'
    && /^listening-review-evidence\/[^/\\]+-rule\.json$/u.test(item.path)).map(item => {
    const bytes = readFileSync(path.join(path.dirname(cutsPath), item.path))
    if (sha256(bytes) !== item.sha256) throw new Error('听力切段规则证据已变化')
    return JSON.parse(bytes)
  }).find(item => item.schemaVersion === LISTENING_RULE_EVIDENCE_VERSION && item.input.audioSha256 === audioSha256)
  if (review.schemaVersion === LISTENING_REVIEW_VERSION && !ruleNotes) throw new Error('缺少与本卷录音绑定的听力切段规则证据')
  const groups = recordingReviewCuts(review, manifest.paperId, audioSha256, segments.durationSeconds, ruleNotes)
  if (!existsSync(parakeet)) throw new Error('未找到 BUB-237 的 Parakeet v2 运行器')
  const input = { audioSha256, groups, apple: sha256(readFileSync(appleSource)), parakeet: sha256(readFileSync(parakeet)) }
  const evidence = digestJson(input)
  const cache = path.join(path.dirname(audio), 'recording-transcript', evidence.slice(7))
  mkdirSync(cache, { recursive: true })
  const bytes = await withWork(async (work, env) => {
    const engines = await localEngines(audio, groups, cache, work, env)
    const paragraphs = [RECORDING_TRANSCRIPT_TITLE, `录音 SHA-256：${audioSha256}`,
      `ASR attempt：${evidence}`, `evidence.json：${evidence}；摘要：Apple SpeechAnalyzer、Parakeet v2 与短片复核`]
    for (const [index, group] of groups.entries()) {
      const text = await mergeReadings(group, engines, range => remoteEngine(audio, range, cache))
      if (!units(text).length) throw new Error(`转写为空 · Text ${index + 1}`)
      paragraphs.push(`Text ${index + 1} | 题号：${group.questionNumbers.join(',')} | 据录音整理 | ${text}`)
    }
    return recordingDocx(paragraphs, work)
  })
  writeFileSync(path.join(cache, 'evidence.json'), stableStringify(input))
  withPaperWriterLock({ paperDir, paperId: manifest.paperId }, () => {
    const current = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (sha256(readFileSync(audio)) !== audioSha256 || digestJson(current) !== digestJson(manifest)) {
      throw new Error('转写期间播放录音或 Source Manifest 已变化')
    }
    const digest = sha256(bytes)
    const relative = `source/recording-transcript-${digest.slice(7)}.docx`
    const file = path.join(paperDir, relative)
    const existing = current.documents.find(document => document.documentId === RECORDING_TRANSCRIPT_ID)
    if (existing && existing.sha256 !== digest) throw new Error('本卷已封存另一份录音转写')
    if (!existsSync(file)) writeFileSync(file, bytes, { flag: 'wx' })
    if (sha256(readFileSync(file)) !== digest) throw new Error('已封存的录音转写文件已变化')
    if (existing) return
    current.documents.push({ documentId: RECORDING_TRANSCRIPT_ID, role: 'unofficial_listening', path: relative,
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sha256: digest,
      byteLength: bytes.length, pageCount: 1 })
    writeFileSync(`${manifestPath}.recording.tmp`, `${JSON.stringify(current, null, 2)}\n`)
    renameSync(`${manifestPath}.recording.tmp`, manifestPath)
  })
}
