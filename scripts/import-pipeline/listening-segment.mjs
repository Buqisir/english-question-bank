#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statfsSync, writeFileSync } from 'node:fs'
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
const whisperSettings = Object.freeze({ language: 'en', beam_size: 5, temperature: 0,
  condition_on_previous_text: false, vad_filter: false, word_timestamps: true,
  device: 'cpu', compute_type: 'int8', cpu_threads: 4, num_workers: 1,
  window_seconds: 180, stride_seconds: 175 })

function fileDigest(file) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
  const fd = openSync(file, 'r')
  try {
    let n
    while ((n = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n))
    return `sha256:${hash.digest('hex')}`
  } finally { closeSync(fd) }
}

function asrTimeout(name) {
  const seconds = Number(process.env[name] ?? 900)
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${name} must be finite and positive`)
  return seconds
}

const jobBinding = input => ({ attemptId: input.attemptId, jobId: input.jobId, ...input.binding })

function slotState(receipt, expectedBinding) {
  if (!existsSync(receipt)) return { code: 'ASR_STATUS_UNKNOWN', inferenceStarted: null }
  const rows = readFileSync(receipt, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  if (!rows.length || rows[0].phase !== 'started'
    || rows.some(row => digestJson(row.binding) !== digestJson(expectedBinding))) {
    return { code: 'ASR_STATUS_UNKNOWN', inferenceStarted: null }
  }
  const last = rows.at(-1)
  if (last?.phase === 'timeout' && last.code === 'ASR_QUEUE_TIMEOUT' && !rows.some(r => r.phase === 'acquired')) {
    return { code: 'ASR_QUEUE_TIMEOUT', inferenceStarted: false }
  }
  return { code: last?.code || (last?.phase === 'finished' && Number.isInteger(last.exit)
    ? last.exit === 0 ? 'ASR_OUTPUT_INCOMPLETE' : 'ASR_ENGINE_FAILED' : 'ASR_STATUS_UNKNOWN'),
    inferenceStarted: rows.some(r => r.phase === 'acquired') ? true : null }
}

// Only completed, hash-bound raw results are reusable. A queue timeout proves
// that inference never started; acquired/missing/truncated receipts do not.
function previousFallback(output, binding) {
  for (const entry of readdirSync(output).filter(name => name.startsWith('attempt-')).sort().reverse()) {
    const directory = path.join(output, entry)
    for (const name of readdirSync(directory).filter(name => /^whisper-\d+$/u.test(name))) {
      const job = path.join(directory, name)
      if (!existsSync(path.join(job, 'job-input.json'))) continue
      const input = json(path.join(job, 'job-input.json'))
      if (digestJson(input.binding) !== digestJson(binding)) continue
      const resultFile = path.join(job, 'job-result.json')
      if (existsSync(resultFile)) {
        const result = json(resultFile)
        if (result.state === 'queue_timeout') {
          const origin = input.reusedFrom || job
          const originInput = json(path.join(origin, 'job-input.json'))
          if (digestJson(originInput.binding) === digestJson(binding)
            && slotState(path.join(origin, 'slot-receipt.jsonl'), jobBinding(originInput)).code === 'ASR_QUEUE_TIMEOUT') continue
          return { state: 'unknown', files: [], priorJob: job }
        }
        const files = result.files.map(item => {
          const file = path.join(job, item.path)
          if (fileDigest(file) !== item.sha256) throw new Error('ASR_CACHE_EVIDENCE_CHANGED')
          return file
        })
        return { ...result, files, priorJob: job }
      }
      // Reconcile a response loss before any replay.
      if (slotState(path.join(job, 'slot-receipt.jsonl'), jobBinding(input)).code === 'ASR_QUEUE_TIMEOUT') continue
      return { state: 'unknown', files: [], priorJob: job }
    }
  }
  return null
}

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

// One attempt, one retained primary. Identical raw fallback work is shared;
// every group still receives an independent source comparison.
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
    normalizationAlgorithm: 'listening-equivalences-v4; source-preserving listening-spoken-projection-v1 (recorded exclusions and source locations); finite spelling aliases and negative/positive auxiliary contractions; context-bound s/d expansions (ambiguous s/d retained); integers 0..999999; $/£ and .xx cents; ordinals 1st..31st; AM/PM; HH:MM, explicit-meridiem H.MM/HMM, half past 1..12; typed year/time/cardinal/ordinal expressions; year equivalence requires a four-digit literal and an explicit word reading (2001..2099), standalone or in year context; shared source/ASR character spans, original acoustic run boundaries',
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
  const scheduled = new Map()
  let modelSha256
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
    const receipt = path.join(fallbackDir, 'slot-receipt.jsonl')
    let state = 'finished', inferenceStarted = false
    let reused = null, input = null
    const retainedFiles = []
    try {
      if (!(startSeconds < endSeconds)) throw new Error('LISTENING_FALLBACK_CROP_UNRESOLVED')
      modelSha256 ??= runWhisper ? 'injected-offline-runner' : fileDigest(path.join(whisperModel, 'model.bin'))
      const binding = { audioSha256: audioHash, materializationSha256: digest(materializationBytes),
        modelSnapshot: path.resolve(whisperModel), modelSha256, pythonExecutable: path.resolve(whisperPython),
        settings: whisperSettings,
        adapterSha256: fileDigest(path.join(scripts, 'transcribe-listening-windows.py')),
        startSeconds, endSeconds }
      const key = digestJson(binding)
      // Injected fixture callbacks have no installed model/version authority;
      // share them within this invocation only, never across process attempts.
      reused = scheduled.get(key) || (!runWhisper ? previousFallback(output, binding) : null)
      input = { attemptId, jobId: `${attemptId}/whisper-${index + 1}`,
        segmentId: failed.segmentId, binding, reusedFrom: reused?.priorJob ?? null }
      write(path.join(fallbackDir, 'job-input.json'), input)
      if (reused?.state === 'unknown') throw Object.assign(new Error('ASR_PRIOR_ATTEMPT_REQUIRES_RECONCILIATION'),
        { code: 'ASR_STATUS_UNKNOWN', inferenceStarted: null })
      if (reused) {
        state = reused.state
        inferenceStarted = state !== 'queue_timeout'
        for (const [n, file] of reused.files.entries()) {
          windows.push(retain(file, `whisper-${index + 1}-${n}`))
          retainedFiles.push(file)
        }
      } else if (runWhisper) {
        inferenceStarted = true
        const raw = runWhisper({ group: failed, startSeconds, endSeconds, output: fallbackDir })
        for (const [n, record] of (Array.isArray(raw) ? raw : [raw]).entries()) {
          const file = path.join(fallbackDir, `raw-${n}.json`)
          write(file, record)
          windows.push(retain(file, `whisper-${index + 1}-${n}`))
          retainedFiles.push(file)
        }
      } else {
        const queueSeconds = asrTimeout('ASR_QUEUE_TIMEOUT'), runSeconds = asrTimeout('ASR_RUN_TIMEOUT')
        execFileSync(whisperPython, [path.join(scripts, 'asr-slot.py'), whisperPython,
          path.join(scripts, 'transcribe-listening-windows.py'), audio, sourceFile,
          path.join(fallbackDir, 'raw'), '--model-snapshot', whisperModel, '--language', 'en',
          '--start', String(startSeconds), '--end', String(endSeconds)],
        { encoding: 'utf8', timeout: (queueSeconds + runSeconds + 30) * 1000, killSignal: 'SIGTERM',
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, TMPDIR: fallbackDir, EQB_ASR_CONCURRENCY: '1',
            ASR_QUEUE_TIMEOUT: String(queueSeconds), ASR_RUN_TIMEOUT: String(runSeconds),
            EQB_ASR_RECEIPT: receipt,
            EQB_ASR_JOB_BINDING: JSON.stringify(jobBinding(input)) } })
        inferenceStarted = true
        const completed = json(path.join(fallbackDir, 'raw/completed.json'))
        if (completed.inputsUnchanged !== true) throw new Error('ASR_COMPLETION_INPUTS_UNPROVEN')
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
          retainedFiles.push(withMetadata)
        }
      }
      // Store local immutable copies so reuse never depends on another
      // attempt's future location, and verify their bytes before later reuse.
      const files = retainedFiles.map((file, n) => {
        const target = path.join(fallbackDir, `cached-${n}.json`)
        copyFileSync(file, target)
        return { path: path.basename(target), sha256: fileDigest(target) }
      })
      write(path.join(fallbackDir, 'job-result.json'), { state, inferenceStarted, files })
      scheduled.set(key, { state, files: files.map(f => path.join(fallbackDir, f.path)), priorJob: fallbackDir })
    } catch (error) {
      let classification
      try { classification = slotState(receipt, input ? jobBinding(input) : null) }
      catch { classification = { code: 'ASR_STATUS_UNKNOWN', inferenceStarted: null } }
      const code = error.code === 'ASR_QUEUE_TIMEOUT' || error.code === 'ASR_STATUS_UNKNOWN'
        ? error.code : classification.code === 'ASR_QUEUE_TIMEOUT' || classification.code === 'ASR_RUN_TIMEOUT'
          ? classification.code : error.code || classification.code
      inferenceStarted = error.inferenceStarted !== undefined ? error.inferenceStarted
        : inferenceStarted || classification.inferenceStarted
      state = code === 'ASR_QUEUE_TIMEOUT' && inferenceStarted === false ? 'queue_timeout'
        : code === 'ASR_STATUS_UNKNOWN' || inferenceStarted === null ? 'unknown' : 'failed'
      const file = path.join(fallbackDir, 'failure.json')
      write(file, { engine: { name: 'faster-whisper', modelSnapshot: whisperModel, version: 'not_exposed',
        requestedLocale: 'en', actualLocale: 'not_exposed',
        apiOptions: { language: 'en', beam_size: 5, temperature: 0, condition_on_previous_text: false,
          vad_filter: false, word_timestamps: true } },
        error: error.message, code, inferenceStarted, fallbackBudgetConsumed: inferenceStarted !== false,
        attemptId, jobId: `${attemptId}/whisper-${index + 1}`, receipt: existsSync(receipt) ? 'slot-receipt.jsonl' : null,
        reusedFrom: reused?.priorJob ?? null, stderr: String(error.stderr || ''), startSeconds, endSeconds,
        platform: primaryWindow.platform || { system: process.platform, architecture: process.arch,
          macOSVersion: 'not_applicable', macOSBuild: 'not_applicable' },
        adapterSha256: digest(readFileSync(path.join(scripts, 'transcribe-listening-windows.py'))),
        pcm: { sampleRate: 16000, channels: 1, encoding: 'signed_16_bit_little_endian',
          cropOffsetSeconds: startSeconds, sha256: 'not_exposed' },
        audioSha256: audioHash, retryPolicy: state === 'queue_timeout'
          ? 'inference not started; a later schedule may resume this work item'
          : 'started or unknown; reconcile retained receipts before any replay' })
      windows.push(retain(file, `whisper-${index + 1}-failure`))
      write(path.join(fallbackDir, 'job-result.json'), { state, inferenceStarted,
        files: [{ path: 'failure.json', sha256: fileDigest(file) }] })
      if (existsSync(path.join(fallbackDir, 'job-input.json'))) {
        const key = digestJson(json(path.join(fallbackDir, 'job-input.json')).binding)
        scheduled.set(key, { state, files: [file], priorJob: fallbackDir })
      }
    }
    if (existsSync(receipt)) {
      const file = path.join(fallbackDir, 'slot-receipts.json')
      write(file, { raw: readFileSync(receipt, 'utf8'), job: input })
      retain(file, `whisper-${index + 1}-slot`)
    }
    if (state === 'queue_timeout' || state === 'unknown') {
      // Scheduling did not supply engine observations. Do not turn queue
      // starvation into ASR_NO_TIMED_WORDS or consume the inference budget.
      failed.issues.push(state === 'queue_timeout' ? 'ASR_QUEUE_TIMEOUT' : 'ASR_STATUS_UNKNOWN')
      continue
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
