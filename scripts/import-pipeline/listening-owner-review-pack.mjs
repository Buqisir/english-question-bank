#!/usr/bin/env node
// Read-only derivative of retained attempts; never an attestation or sidecar writer.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeListeningText, padListeningWordEdges, projectListeningSpokenText } from './lib-listening-segment-rule.mjs'
import { loadListeningResult } from './lib-listening-evidence.mjs'

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..')
const sha = file => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
const fail = (code, detail) => { throw new Error(`${code}: ${detail}`) }
const inside = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)) }
const round = n => Math.round(n * 1e6) / 1e6
const esc = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const safeId = value => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(value)

// Resolve existing ancestors too: an external-looking symlink cannot write into a paper.
function physical(file) {
  if (existsSync(file)) return realpathSync(file)
  const parent = path.dirname(file)
  if (parent === file) return file
  return path.join(physical(parent), path.basename(file))
}

export function reviewCuts({ wordStartSeconds: start, wordEndSeconds: end, pauses, durationSeconds }) {
  if (![start, end, durationSeconds].every(Number.isFinite) || start < 0 || end <= start || end > durationSeconds) {
    fail('REVIEW_PACK_INVALID_WORD_EDGES', `${start}–${end}/${durationSeconds}`)
  }
  const valid = pauses.filter(p => Number.isFinite(p.startSeconds) && Number.isFinite(p.endSeconds)
    && p.startSeconds >= 0 && p.startSeconds < p.endSeconds && p.endSeconds <= durationSeconds)
  const before = valid.filter(p => p.endSeconds <= start + 0.001 && p.endSeconds >= start - 0.3)
    .sort((a, b) => b.endSeconds - a.endSeconds)[0]
  const after = valid.filter(p => p.startSeconds >= end - 0.001 && p.startSeconds <= end + 0.3)
    .sort((a, b) => a.startSeconds - b.startSeconds)[0]
  if (!before || !after) fail('REVIEW_PACK_PAUSE_MISSING', `${start}–${end}`)
  const leadingMidpoint = (before.startSeconds + before.endSeconds) / 2
  const trailingMidpoint = (after.startSeconds + after.endSeconds) / 2
  const padded = padListeningWordEdges({wordStartSeconds: start, wordEndSeconds: end,
    durationSeconds, leadingMidpoint, trailingMidpoint})
  if (!padded) fail('REVIEW_PACK_INVALID_PAUSE', `${start}–${end}`)
  const {startSeconds: a, endSeconds: z} = padded
  return { wordStartSeconds: start, wordEndSeconds: end, startSeconds: round(a), endSeconds: round(z),
    requestedBufferSeconds: padded.requestedBufferSeconds,
    actualLeadingBufferSeconds: round(start - a), actualTrailingBufferSeconds: round(z - end),
    signalEvidence: { leadingPause: before, trailingPause: after, leadingMidpoint, trailingMidpoint },
    clips: [
      { kind: 'exact', sourceStartSeconds: round(a), sourceEndSeconds: round(z) },
      { kind: 'context', sourceStartSeconds: round(Math.max(0, a - 3)), sourceEndSeconds: round(Math.min(durationSeconds, z + 3)) },
    ] }
}

// Source display remains literal; sentence segmentation must not split Mr. / 3 p.m.
export function edgeSentences(source) {
  const sentences = [], boundary = /[.!?](?=\s|$)/gu
  let start = 0
  for (const match of source.matchAll(boundary)) {
    const prefix = source.slice(0, match.index + 1)
    if (/\b(?:Mr|Mrs|Ms|Dr|a|p)\.$/iu.test(prefix)) continue
    if (/\b[ap]\.m\.$/iu.test(prefix) && !/^\s+[A-Z]/u.test(source.slice(match.index + 1))) continue
    sentences.push(source.slice(start, match.index + 1)); start = match.index + 1
  }
  sentences.push(source.slice(start))
  const clean = sentences.map(s => s.replace(/^\s*(?:[MW]:\s*|\(\d+\)\s*)/u, '').trim()).filter(s => /[a-z]/iu.test(s))
  if (!clean.length) fail('REVIEW_PACK_SOURCE_MISSING', '无英文首末句')
  return [clean[0], clean.at(-1)]
}

// LCS ratio permits internal ASR differences, but the actual first/last word must match.
function similarity(a, b) {
  let row = Array(b.length + 1).fill(0)
  for (const token of a) {
    const next = [0]
    for (let j = 0; j < b.length; j++) next.push(token === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]))
    row = next
  }
  return 2 * row.at(-1) / (a.length + b.length)
}

export function anchors(streams, text, low, high, kind) {
  const source = normalizeListeningText(text.replace(/(?:^|(?<=[.!?\n])\s*)[MW]:/gmu, ''))
  const needle = kind === 'head' ? source.slice(0, 6) : source.slice(-6)
  if (needle.length < 3) fail('REVIEW_PACK_SOURCE_TOO_SHORT', text)
  const hits = [], compoundHits = []
  for (const stream of streams) {
    const positions = new WeakMap()
    const words = stream.words.flatMap(w => normalizeListeningText(w.token ?? w.rawRunText ?? '')
      .map(token => ({ ...w, token }))).map((w, index) => { positions.set(w, index); return w })
      .filter(w => Number.isFinite(w.startSeconds) && Number.isFinite(w.endSeconds)
        && w.startSeconds >= low && w.endSeconds <= high && w.endSeconds >= w.startSeconds)
    for (let i = 0; i < words.length; i++) {
      for (let n = Math.max(3, needle.length - 2); n <= needle.length + 2; n++) {
        const block = words.slice(i, i + n)
        if (block.length !== n || block.at(-1).endSeconds - block[0].startSeconds > Math.max(9, n * 1.4)) continue
        let sourceTokens = needle, observedTokens = block.map(w => w.token)
        const head = kind === 'head'
        const sourceEdge = head ? needle[0] : needle.at(-1)
        const observedEdge = head ? block[0] : block.at(-1)
        const compound = sourceEdge !== observedEdge.token
        if (compound) {
          const adjacent = head ? block[1] : block.at(-2)
          const sourcePair = head ? needle.slice(0, 2) : needle.slice(-2)
          const observedPair = head ? block.slice(0, 2) : block.slice(-2)
          if (adjacent && positions.get(observedPair[1]) === positions.get(observedPair[0]) + 1
              && observedPair.map(w => w.token).join('') === sourceEdge) {
            observedTokens = head ? [sourceEdge, ...observedTokens.slice(2)] : [...observedTokens.slice(0, -2), sourceEdge]
          } else if (sourcePair.join('') === observedEdge.token) {
            sourceTokens = head ? [observedEdge.token, ...needle.slice(2)] : [...needle.slice(0, -2), observedEdge.token]
          } else continue
        }
        const score = similarity(sourceTokens, observedTokens)
        if (score < 0.72) continue
        ;(compound ? compoundHits : hits).push({ score, start: block[0].startSeconds, end: block.at(-1).endSeconds,
          engine: stream.engine, evidencePaths: stream.evidencePaths, words: block })
      }
    }
  }
  const kept = [], field = kind === 'head' ? 'start' : 'end'
  const quality = h => h.score + (h.engine === 'Whisper raw' ? 0.025 : /whisper/iu.test(h.engine) ? 0.015 : 0)
  for (const h of hits.sort((a, b) => quality(b) - quality(a))) {
    if (!kept.some(k => Math.abs(h[field] - k[field]) < 4)) kept.push(h)
  }
  // A compound match is duplicate evidence only when its interval overlaps
  // an already retained hit. Never let it bridge distinct ordinary hits.
  for (const h of compoundHits.sort((a, b) => quality(b) - quality(a))) {
    if (!kept.some(k => h.start < k.end && k.start < h.end)) kept.push(h)
  }
  return kept.sort((a, b) => a.start - b.start)
}

function locate(group, streams, pauses, durationSeconds) {
  const low = group.orderEvidence?.afterSeconds ?? 0, high = group.orderEvidence?.beforeSeconds ?? durationSeconds
  // Find pause spans in the literal source, then mask only those spans in a
  // retained projection. Reprojecting masked text could turn spoken "(Text 1)"
  // after a removed speaker label into a heading. Historical bytes stay intact.
  const projection = projectListeningSpokenText({ ...group, text: group.sourceText })
  let text = group.sourceProjection?.text ?? projection.text
  for (const span of projection.exclusions.filter(e => e.reason === 'pause_duration_direction')) {
    text = text.slice(0, span.start) + projection.text.slice(span.start, span.end) + text.slice(span.end)
  }
  const heads = anchors(streams, text, low, high, 'head'), tails = anchors(streams, text, low, high, 'tail')
  if (!Number.isInteger(group.expectedReadings) || group.expectedReadings < 1 || heads.length !== group.expectedReadings) {
    fail('REVIEW_PACK_READING_COUNT_AMBIGUOUS', `${group.segmentId}: expected ${group.expectedReadings}, found ${heads.length}`)
  }
  return heads.map((head, i) => {
    const matching = tails.filter(t => t.end > head.end && t.end <= (heads[i + 1]?.start ?? high))
    if (matching.length !== 1) fail('REVIEW_PACK_TAIL_AMBIGUOUS', `${group.segmentId} 第 ${i + 1} 遍: ${matching.length}`)
    const tail = matching[0], first = head.words[0], last = tail.words.at(-1)
    let start = first.startSeconds, end = last.endSeconds
    // Retained ASR can absorb silence into an edge word. Retain both clocks.
    const leading = pauses.filter(p => p.endSeconds - p.startSeconds >= 0.25
      && ((first.startSeconds - 0.5 <= p.endSeconds && p.endSeconds <= first.endSeconds - 0.02)
        || (p.startSeconds <= first.startSeconds && first.startSeconds <= p.endSeconds && p.endSeconds < head.end)))
      .sort((a, b) => Math.abs(a.endSeconds - start) - Math.abs(b.endSeconds - start))[0]
    const trailing = pauses.filter(p => p.endSeconds - p.startSeconds >= 0.25
      && Math.max(last.startSeconds + 0.04, end - 1.5) <= p.startSeconds && p.startSeconds <= end + 0.8)
      .sort((a, b) => Math.abs(a.startSeconds - end) - Math.abs(b.startSeconds - end))[0]
    if (leading) start = leading.endSeconds
    if (trailing) end = trailing.startSeconds
    return { reading: i + 1, status: 'located', ...reviewCuts({ wordStartSeconds: start, wordEndSeconds: end, pauses, durationSeconds }),
      headEvidence: head, tailEvidence: tail, asrFirstWord: first, asrLastWord: last }
  })
}

function page(segments) {
  let body = '<h1>逐遍听核</h1><p>先听精确剪辑，有疑问再听上下文；所有片段保持原速。回复卷名、段号、第几遍及首尾／正文情况。</p>'
  for (const e of segments) {
    body += `<section><h2>${esc(e.paperName)} · ${esc(e.segmentId)}</h2>`
    for (const r of e.readings) {
      body += `<article><h3>第 ${r.reading} 遍</h3><div class="sentences"><small>应听首句</small><p>${esc(e.expectedFirstSentence)}</p><small>应听末句</small><p>${esc(e.expectedLastSentence)}</p></div><div class="players">`
      for (const c of r.clips) {
        const label = c.kind === 'exact' ? '精确剪辑' : '上下文 · 前后各多 3 秒'
        body += `<div><strong>${label}</strong><audio controls preload="metadata" aria-label="${esc(e.paperName + ' ' + e.segmentId + ' 第 ' + r.reading + ' 遍 ' + label)}" data-start="${c.sourceStartSeconds}" src="${esc(c.clipPath)}"></audio><div class="clock">片段内 0.00 秒 · 整录音 ${c.sourceStartSeconds.toFixed(2)} 秒</div><small>整录音 ${c.sourceStartSeconds.toFixed(3)}–${c.sourceEndSeconds.toFixed(3)} 秒</small></div>`
      }
      body += `</div><p>回复示例：${esc(e.paperName)} ${esc(e.segmentId)} 第 ${r.reading} 遍：首尾完整／开头缺 __／结尾缺 __／多了报题；正文差异 __</p></article>`
    }
    body += `<details><summary>查看完整官方原文</summary><pre>${esc(e.sourceText)}</pre></details></section>`
  }
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>逐遍听核</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f3f6f0;color:#191d18;font:14px/1.65 -apple-system,"PingFang SC",sans-serif}main{max-width:1080px;margin:auto;padding:32px 24px}h1{font-size:28px}h2{font-size:20px}h3{font-size:17px}section{background:#fafcf8;padding:24px;border-radius:12px;margin:24px 0;box-shadow:0 0 0 1px #191d180d,0 1px 2px #191d180f}article{padding:24px 0;border-top:1px solid #d5dacf}.sentences,pre{font:18px/1.7 Georgia,"Times New Roman",serif}small,.clock{font:12px/1.5 -apple-system,"PingFang SC",sans-serif;color:#60665c}.players{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.players>div{min-width:0}audio{display:block;width:100%;margin:8px 0}pre{white-space:pre-wrap}summary{cursor:pointer}:focus-visible{outline:2px solid #191d18;outline-offset:3px}@media(max-width:700px){.players{grid-template-columns:1fr}main{padding:24px 16px}}</style>
<main>${body}<footer>词首尾前后各加最多 0.8 秒，不越过相邻停顿中点；上下文从精切前后各扩 3 秒，受录音端点限制。机器定位尚未经 Owner 听审，本包不能认定 usable。</footer></main>
<script>const aa=[...document.querySelectorAll('audio')];aa.forEach(a=>{a.addEventListener('play',()=>aa.forEach(b=>{if(a!==b)b.pause()}));a.addEventListener('timeupdate',()=>{a.nextElementSibling.textContent='片段内 '+a.currentTime.toFixed(2)+' 秒 · 整录音 '+(Number(a.dataset.start)+a.currentTime).toFixed(2)+' 秒'})})</script></html>`
}

export function buildReviewPack({ root = DEFAULT_ROOT, papers, attempts = {}, selections = [], output }) {
  root = realpathSync(root)
  if (!output || !papers?.length || new Set(papers).size !== papers.length || papers.some(p => !safeId(p))) {
    fail('REVIEW_PACK_ARGUMENT', '需要唯一 paperId 和 --output')
  }
  output = physical(path.resolve(output))
  if (inside(root, output) || inside(realpathSync(DEFAULT_ROOT), output)) fail('REVIEW_PACK_OUTPUT_INSIDE_SOURCE', output)
  if (existsSync(output)) fail('REVIEW_PACK_OUTPUT_EXISTS', output)
  const inputSha256 = {}, segments = [], usedSelections = new Set()
  const track = file => {
    file = realpathSync(file)
    const digest = sha(file)
    if (inputSha256[file] && inputSha256[file] !== digest) fail('REVIEW_PACK_SOURCE_CHANGED', file)
    inputSha256[file] = digest
    return file
  }
  const read = file => JSON.parse(readFileSync(track(file), 'utf8'))
  track(fileURLToPath(import.meta.url))
  track(path.join(import.meta.dirname, 'lib-listening-segment-rule.mjs'))
  track(path.join(import.meta.dirname, 'lib-listening-evidence.mjs'))
  if (Object.keys(attempts).some(p => !papers.includes(p))) fail('REVIEW_PACK_ARGUMENT', '--attempt 卷号未列入输入')
  for (const selection of selections) {
    if (!papers.some(p => selection.startsWith(`${p}:`))) fail('REVIEW_PACK_SELECTION_INVALID', selection)
  }
  for (const paperId of papers) {
    const paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
    const base = path.join(root, 'imports/ocr-proofread', paperId, 'fast/listening-segment-attempts')
    const attempt = realpathSync(attempts[paperId] ?? path.join(base,
      readdirSync(base).filter(n => n.startsWith('attempt-') && existsSync(path.join(base, n, 'rule-result.json'))).sort().at(-1) ?? 'missing'))
    if (inside(attempt, output) || inside(realpathSync(paperDir), output)) fail('REVIEW_PACK_OUTPUT_INSIDE_SOURCE', output)
    const input = read(path.join(attempt, 'input.json'))
    const rule = loadListeningResult(path.join(attempt, 'rule-result.json'), { track })
    if (input.subject?.paperId && input.subject.paperId !== paperId) fail('REVIEW_PACK_ATTEMPT_MISMATCH', paperId)
    const configFile = path.join(paperDir, 'config.json')
    const config = existsSync(configFile) ? read(configFile) : {}
    const silencePath = path.join(attempt, 'silence.json'), silence = read(silencePath)
    const durationSeconds = input.subject?.durationSeconds
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || silence.status !== 0 || !Array.isArray(silence.pauses)) {
      fail('REVIEW_PACK_SIGNAL_INVALID', attempt)
    }
    const audio = track(path.join(paperDir, 'materialization/listening-audio/playback.mp3'))
    if (inputSha256[audio] !== input.audioSha256) fail('REVIEW_PACK_AUDIO_CHANGED', paperId)
    const selectedGroups = rule.groups.filter(g => selections.length
      ? selections.some(s => s.startsWith(`${paperId}:${g.segmentId}:`)) : g.decision !== 'usable')
    const rawStreams = []
    for (const directory of readdirSync(attempt).filter(n => /^whisper-\d+$/u.test(n))) {
      for (const name of readdirSync(path.join(attempt, directory)).filter(n => /^metadata-.*\.json$/u.test(n)).sort()) {
        const file = path.join(attempt, directory, name), raw = read(file)
        rawStreams.push({ engine: 'Whisper raw', evidencePaths: [file], words: (raw.segments ?? raw.result?.segments ?? [])
          .flatMap(s => (s.words ?? []).map(w => ({ token: w.word, rawRunText: w.word,
            startSeconds: raw.startSeconds + w.start, endSeconds: raw.startSeconds + w.end }))) })
      }
    }
    for (const group of selectedGroups) {
      if (!safeId(group.segmentId)) fail('REVIEW_PACK_SEGMENT_INVALID', group.segmentId)
      const streams = [group, ...(group.engineAttempts ?? [])].flatMap(g => (g.observedWindows ?? [])
        .filter(w => w.words?.length).map(w => ({ engine: g.engine ?? 'unknown', words: w.words,
          evidencePaths: (w.evidencePaths ?? []).map(p => track(path.resolve(attempt, p))) })))
      const readings = locate(group, [...rawStreams, ...streams], silence.pauses, durationSeconds).filter(r => {
        if (!selections.length) return true
        const key = `${paperId}:${group.segmentId}:${r.reading}`, all = `${paperId}:${group.segmentId}:all`
        if (selections.includes(key)) usedSelections.add(key)
        if (selections.includes(all)) usedSelections.add(all)
        return selections.includes(key) || selections.includes(all)
      })
      const [expectedFirstSentence, expectedLastSentence] = edgeSentences(group.sourceText)
      segments.push({ paperId, paperName: config.provenance?.paperName ?? input.subject?.paperName ?? paperId, segmentId: group.segmentId,
        questionNumbers: group.questionNumbers, attemptPath: attempt,
        sourceText: group.sourceText, sourceTextEvidence: `${attempt}/rule-result.json#groups[${rule.groups.indexOf(group)}].sourceText`,
        expectedFirstSentence, expectedLastSentence, sourceAudioPath: audio, sourceAudioSha256: input.audioSha256,
        sourceAudioDurationSeconds: durationSeconds, expectedReadings: group.expectedReadings,
        machineIssues: group.issues ?? [], readings: readings.map(r => ({ ...r,
          signalEvidence: { path: silencePath, ...r.signalEvidence } })) })
    }
  }
  if (!segments.length) fail('REVIEW_PACK_NOTHING_SELECTED', '没有不确定段；可显式 --select')
  if (selections.some(s => !usedSelections.has(s))) fail('REVIEW_PACK_SELECTION_INVALID', selections.filter(s => !usedSelections.has(s)).join(', '))
  // Validate every selection before creating anything, and never overwrite an old package.
  mkdirSync(path.dirname(output), { recursive: true })
  mkdirSync(output)
  mkdirSync(path.join(output, 'clips'))
  for (const e of segments) for (const r of e.readings) for (const c of r.clips) {
    c.clipPath = `clips/${e.paperId}-${e.segmentId}-r${r.reading}-${c.kind}.mp3`
    const dest = path.join(output, c.clipPath)
    c.requestedDurationSeconds = round(c.sourceEndSeconds - c.sourceStartSeconds)
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-n', '-ss', String(c.sourceStartSeconds),
      '-i', e.sourceAudioPath, '-t', String(c.requestedDurationSeconds), '-map_metadata', '-1',
      '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', dest], { stdio: 'pipe' })
    c.probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', dest], { encoding: 'utf8' }))
    c.ffprobeDurationSeconds = Number(c.probe.format.duration)
    if (!Number.isFinite(c.ffprobeDurationSeconds) || Math.abs(c.ffprobeDurationSeconds - c.requestedDurationSeconds) >= 0.08) {
      fail('REVIEW_PACK_CLIP_DURATION', c.clipPath)
    }
    c.sha256 = sha(dest)
  }
  for (const [file, digest] of Object.entries(inputSha256)) if (sha(file) !== digest) fail('REVIEW_PACK_SOURCE_CHANGED', file)
  const manifest = { schema: 'listening-owner-review-pack-v1', createdAt: new Date().toISOString(),
    timebase: 'normalized_playback_seconds', rule: 'word edges -> +/-0.8s clipped at adjacent pause midpoints; context exact cut +/-3s',
    rules: { bufferSeconds: 0.8, contextSeconds: 3, pauseMidpointGuard: true, playbackRate: 1,
      edgeAnchorMinimumRatio: 0.72, exactEdgeTokenRequired: true, normalizedTokenSource: 'lib-listening-segment-rule.mjs' },
    ownerReviewed: false, asrAdded: false, sourceFingerprintCheck: 'PASS', inputSha256, segments }
  writeFileSync(path.join(output, 'index.html'), page(segments), { flag: 'wx' })
  writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  return manifest
}

function main(args) {
  const options = { papers: [], attempts: {}, selections: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help') {
      console.log('用法：node scripts/import-pipeline/listening-owner-review-pack.mjs <paperId> [paperId ...] --output <新建的仓库外目录> [--root <仓库>] [--attempt <paperId=attempt目录>] [--select <paperId:listening-text-N:遍数或all>]\n默认选择最新已完成 attempt 中 decision != usable 的所有段／所有遍；不运行 ASR，不安装审查结论。')
      return
    }
    if (['--output', '--root', '--attempt', '--select'].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith('--')) fail('REVIEW_PACK_ARGUMENT', arg)
      if (arg === '--attempt') {
        const eq = value.indexOf('=')
        if (eq < 1) fail('REVIEW_PACK_ARGUMENT', arg)
        options.attempts[value.slice(0, eq)] = path.resolve(value.slice(eq + 1))
      } else if (arg === '--select') options.selections.push(value)
      else options[arg.slice(2)] = path.resolve(value)
    } else if (arg.startsWith('-')) fail('REVIEW_PACK_ARGUMENT', arg)
    else options.papers.push(arg)
  }
  const manifest = buildReviewPack(options)
  console.log(JSON.stringify({ output: options.output, segments: manifest.segments.length,
    readings: manifest.segments.reduce((n, e) => n + e.readings.length, 0), ownerReviewed: false }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
