#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import {
  LISTENING_SEGMENT_RULE, LISTENING_EQUIVALENCES, evaluateListeningEngine, reconcileListeningEngines,
} from './lib-listening-segment-rule.mjs'

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
const scripts = import.meta.dirname

export function assertListeningDiskSpace(directory) {
  const disk = statfsSync(directory)
  if (disk.bavail * disk.bsize < 10_000_000_000) {
    throw Object.assign(new Error('磁盘少于 10 GB，暂停听力处理'), { code: 'LISTENING_DISK_PAUSE' })
  }
}

export function parseListeningPauses(stderr, durationSeconds) {
  const pauses = []
  let start = null
  for (const match of String(stderr).matchAll(/silence_(start|end):\s*(-?[\d.]+)/gu)) {
    if (match[1] === 'start') start = Math.max(0, Number(match[2]))
    else if (start !== null) {
      pauses.push({ startSeconds: start, endSeconds: Math.min(durationSeconds, Number(match[2])) })
      start = null
    }
  }
  if (start !== null && start < durationSeconds) pauses.push({ startSeconds: start, endSeconds: durationSeconds })
  return pauses.filter(p => p.endSeconds > p.startSeconds)
}

function engineDescriptor(file, bytes, record, durationSeconds) {
  const engine = record.engine || {}
  const failed = Boolean(record.error) || !(record.result?.segments || record.segments)?.length
  return { path: file, sha256: digest(bytes), byteLength: bytes.length,
    kind: failed ? 'review_notes' : 'asr_window',
    window: failed ? null : { startSeconds: record.startSeconds ?? 0,
      endSeconds: Math.min(durationSeconds, record.endSeconds ?? durationSeconds) },
    settings: failed ? null : { engine: typeof engine === 'string' ? engine : `${engine.name}/${engine.version || 'not_exposed'}`,
      model: engine.modelSnapshot || engine.model || 'not_exposed',
      language: engine.actualLocale || record.language || 'en', vad: false,
      computeType: engine.computeType || 'not_exposed' } }
}

// One attempt, one retained raw primary, at most one Whisper invocation per
// failed group. Both engine results and failures survive every rerun.
export function segmentListening({ paperDir, request, appleEvidence, output, whisperPython, whisperModel, pauses = null,
  runWhisper = null, fuzzyAnchors = LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled }) {
  mkdirSync(output, { recursive: true })
  assertListeningDiskSpace(output)
  const attemptId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`
  const attempt = path.join(output, `attempt-${attemptId}`)
  mkdirSync(attempt)
  const evidenceDir = path.join(attempt, 'listening-review-evidence')
  mkdirSync(evidenceDir)
  const audio = path.join(paperDir, 'materialization/listening-audio/playback.mp3')
  const manifest = json(path.join(paperDir, 'universal-source-manifest.json'))
  const sourceFile = path.resolve(paperDir, manifest.materializationPath)
  const materializationBytes = readFileSync(sourceFile)
  const materialization = JSON.parse(materializationBytes)
  const groups = request.transcript || materialization.listening.transcript
  // Review requests contain the source after already-reviewed spelling fixes;
  // raw Materialization may intentionally differ. Bind the exact reviewed text.
  if (digestJson(groups) !== request.report.subject.transcriptDigest) {
    throw new Error('LISTENING_REQUEST_TRANSCRIPT_STALE')
  }
  const instructions = request.sourceInstructions || materialization.sourcePresentation?.instructions || []
  const audioHash = digest(readFileSync(audio))
  const subject = request.report.subject
  if (audioHash !== subject.playbackAudioSha256) throw new Error('LISTENING_AUDIO_BINDING_MISMATCH')
  const durationSeconds = subject.durationSeconds
  const evidence = []
  function retain(rawFile, name) {
    const target = path.join(evidenceDir, `${attemptId}-${name}.json`)
    copyFileSync(rawFile, target)
    const record = json(target)
    const relative = `listening-review-evidence/${path.basename(target)}`
    evidence.push(engineDescriptor(relative, readFileSync(target), record, durationSeconds))
    return { ...record, evidencePaths: [relative] }
  }
  const primaryWindow = retain(appleEvidence, 'apple')
  if (primaryWindow.audioSha256 !== audioHash) throw new Error('LISTENING_APPLE_INPUT_BINDING_MISMATCH')
  const playbackEndSeconds = Math.min(durationSeconds, primaryWindow.endSeconds ?? durationSeconds)
  write(path.join(attempt, 'input.json'), {
    rule: { ...LISTENING_SEGMENT_RULE, fuzzyAnchorsEnabled: fuzzyAnchors }, normalization: LISTENING_EQUIVALENCES,
    normalizationAlgorithm: 'listening-equivalences-v2; finite spelling aliases; integers 0..999999; $/£ and .xx cents; ordinals 1st..31st; AM/PM; HH:MM, explicit-meridiem H.MM/HMM, half past 1..12; typed year/time/cardinal/ordinal expressions; year equivalence requires a four-digit literal and an explicit word reading (2001..2099), standalone or in year context; shared source/ASR character spans, original acoustic run boundaries',
    sourceTextSha256: digest(Buffer.from(JSON.stringify(groups))),
    materializationSha256: digest(materializationBytes), audioSha256: audioHash,
    ruleCodeSha256: digest(readFileSync(path.join(scripts, 'lib-listening-segment-rule.mjs'))),
    adapterSha256: digest(readFileSync(fileURLToPath(import.meta.url))), subject,
  })
  if (pauses === null) {
    // Keep full stderr, including silence detections, under this immutable attempt.
    const detected = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', audio,
      '-af', `silencedetect=noise=${LISTENING_SEGMENT_RULE.silenceThresholdDb}dB:d=${LISTENING_SEGMENT_RULE.minimumSilenceSeconds}`,
      '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    write(path.join(attempt, 'silence.json'), { status: detected.status, error: detected.error?.message || null,
      stderr: detected.stderr || '', method: { noiseDb: LISTENING_SEGMENT_RULE.silenceThresholdDb,
        minimumSilenceSeconds: LISTENING_SEGMENT_RULE.minimumSilenceSeconds } })
    pauses = detected.status === 0 ? parseListeningPauses(detected.stderr, durationSeconds) : []
  }
  const base = { groups, instructions, pauses, durationSeconds, fuzzyAnchors,
    questions: materialization.listening.questions, globalAnchorWindows: [primaryWindow] }
  const apple = evaluateListeningEngine({ ...base, windows: [primaryWindow] })
  write(path.join(attempt, 'apple-rule.json'), apple)
  const fallback = []
  for (const [index, failed] of apple.groups.entries()) {
    if (failed.decision === 'usable') continue
    assertListeningDiskSpace(attempt)
    const previous = apple.groups.slice(0, index).filter(g => g.independentlyAnchored && g.decision === 'usable').flatMap(g => g.occurrences)
    const next = apple.groups.slice(index + 1).filter(g => g.independentlyAnchored && g.decision === 'usable').flatMap(g => g.occurrences)
    const startSeconds = Math.max(0, ...previous.map(o => o.endSeconds))
    // The canonical PCM duration can exceed ffprobe's MP3 format duration by a
    // fraction of a millisecond. Never pass the rounded-up value to a crop CLI.
    const endSeconds = Math.min(playbackEndSeconds, ...next.map(o => o.startSeconds))
    const fallbackDir = path.join(attempt, `whisper-${index + 1}`)
    mkdirSync(fallbackDir)
    const windows = []
    try {
      if (!(startSeconds < endSeconds)) throw new Error('LISTENING_FALLBACK_CROP_UNRESOLVED')
      if (runWhisper) {
        const raw = runWhisper({ group: failed, startSeconds, endSeconds, output: fallbackDir })
        for (const [n, record] of (Array.isArray(raw) ? raw : [raw]).entries()) {
          const file = path.join(fallbackDir, `raw-${n}.json`)
          write(file, record)
          windows.push(retain(file, `whisper-${index + 1}-${n}`))
        }
      } else {
        execFileSync(whisperPython, [path.join(scripts, 'asr-slot.py'), whisperPython,
          path.join(scripts, 'transcribe-listening-windows.py'), audio, sourceFile,
          path.join(fallbackDir, 'raw'), '--model-snapshot', whisperModel, '--language', 'en',
          '--start', String(startSeconds), '--end', String(endSeconds)],
        { encoding: 'utf8', timeout: 900_000, maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, TMPDIR: fallbackDir } })
        const completed = json(path.join(fallbackDir, 'raw/completed.json'))
        const settings = json(path.join(fallbackDir, 'raw/input.json')).engine
        write(path.join(fallbackDir, 'engine.json'), settings)
        for (const [n, item] of completed.windows.entries()) {
          const rawFile = path.join(fallbackDir, 'raw', item.path)
          const raw = json(rawFile)
          const withMetadata = path.join(fallbackDir, `metadata-${n}.json`)
          write(withMetadata, { ...raw, engine: { ...settings, requestedLocale: 'en', actualLocale: raw.language,
            apiOptions: json(path.join(fallbackDir, 'raw/settings.json')) }, audioSha256: audioHash,
            platform: primaryWindow.platform, adapterSha256: digest(readFileSync(path.join(scripts, 'transcribe-listening-windows.py'))),
            pcm: { sampleRate: 16000, channels: 1, encoding: 'signed_16_bit_little_endian',
              cropOffsetSeconds: raw.startSeconds, sha256: raw.sampleSha256 } })
          windows.push(retain(withMetadata, `whisper-${index + 1}-${n}`))
        }
      }
    } catch (error) {
      const file = path.join(fallbackDir, 'failure.json')
      write(file, { engine: { name: 'faster-whisper', modelSnapshot: whisperModel, version: 'not_exposed',
        requestedLocale: 'en', actualLocale: 'not_exposed',
        apiOptions: { language: 'en', beam_size: 5, temperature: 0, condition_on_previous_text: false,
          vad_filter: false, word_timestamps: true } },
        error: error.message, stderr: String(error.stderr || ''), startSeconds, endSeconds,
        platform: primaryWindow.platform || { system: process.platform, architecture: process.arch,
          macOSVersion: 'not_applicable', macOSBuild: 'not_applicable' },
        adapterSha256: digest(readFileSync(path.join(scripts, 'transcribe-listening-windows.py'))),
        pcm: { sampleRate: 16000, channels: 1, encoding: 'signed_16_bit_little_endian',
          cropOffsetSeconds: startSeconds, sha256: 'not_exposed' },
        audioSha256: audioHash, retryPolicy: 'one fallback only; retained; no automatic retry' })
      windows.push(retain(file, `whisper-${index + 1}-failure`))
    }
    const result = evaluateListeningEngine({ ...base,
      groups: [groups.find(g => g.segmentId === failed.segmentId)], corpus: groups, windows,
      requireWholePaper: false, engine: 'faster-whisper' })
    fallback.push(...result.groups)
  }
  const resolved = reconcileListeningEngines(apple, { groups: fallback })
  const effectiveRule = { ...LISTENING_SEGMENT_RULE, fuzzyAnchorsEnabled: fuzzyAnchors }
  write(path.join(attempt, 'rule-result.json'), { rule: effectiveRule, groups: resolved })
  const notes = `listening-review-evidence/${attemptId}-rule.json`
  const notesFile = path.join(attempt, notes)
  write(notesFile, { rule: effectiveRule, normalization: LISTENING_EQUIVALENCES,
    input: json(path.join(attempt, 'input.json')), groups: resolved })
  const bytes = readFileSync(notesFile)
  evidence.push({ path: notes, sha256: digest(bytes), byteLength: bytes.length, kind: 'review_notes', window: null, settings: null })
  const review = { ...request.report, reviewedAt: new Date().toISOString(),
    method: 'asr_source_comparison', evidence,
    groups: resolved.map(group => ({
      segmentId: group.segmentId, questionNumbers: group.questionNumbers, decision: group.decision,
      reason: group.decision === 'usable' ? `${LISTENING_SEGMENT_RULE.version}：正文、次数、顺序及完整播放边界有证据`
        : `${LISTENING_SEGMENT_RULE.version}：${group.issues.join(', ')}`,
      limits: ['仅 ASR 与权威原文对照；非直接听审、逐字认证或全录音安全认证。'],
      playback: group.playback,
      occurrences: group.decision === 'usable' ? group.occurrences.map(o => ({
        ...o.playback, evidencePaths: o.evidencePaths,
      })) : [],
    })),
  }
  if (digest(readFileSync(audio)) !== audioHash || digest(readFileSync(sourceFile)) !== digest(materializationBytes)) {
    throw new Error('LISTENING_INPUT_CHANGED')
  }
  write(path.join(attempt, 'review.json'), review)
  return { attempt, review: path.join(attempt, 'review.json'), groups: resolved.length,
    usable: resolved.filter(g => g.decision === 'usable').length,
    reviewRequired: resolved.filter(g => g.decision !== 'usable').length, fallbackGroups: fallback.length }
}

// Kept outside the pure rule module so Linux fixture tests need no Apple APIs.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => process.argv[process.argv.indexOf(name) + 1]
  const required = ['--paper-dir', '--request', '--apple-evidence', '--output']
  if (required.some(name => !process.argv.includes(name))) throw new Error(`Required: ${required.join(' ')}`)
  const venv = process.env.EQB_ASR_VENV || path.join(homedir(), '.local/share/eqbank-listening-asr')
  const model = process.env.EQB_ASR_MODEL || path.join(homedir(),
    '.cache/huggingface/hub/models--Systran--faster-whisper-small.en/snapshots/d1d751a5f8271d482d14ca55d9e2deeebbae577f')
  console.log(JSON.stringify(segmentListening({ paperDir: path.resolve(option('--paper-dir')),
    request: json(option('--request')), appleEvidence: path.resolve(option('--apple-evidence')),
    output: path.resolve(option('--output')), whisperPython: path.join(venv, 'bin/python'), whisperModel: model,
    fuzzyAnchors: process.argv.includes('--no-fuzzy-anchors') ? false
      : process.argv.includes('--fuzzy-anchors') ? true : LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled }), null, 2))
}
