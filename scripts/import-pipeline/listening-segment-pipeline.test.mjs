import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { segmentListening } from './listening-segment.mjs'
import { assertImportSubmissionReady } from './lib-import-submit-gate.mjs'
import { validateListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const fixture = JSON.parse(readFileSync(new URL('./fixtures/listening-apple-run-v2.json', import.meta.url), 'utf8'))
const group = { segmentId: 'listening-text-1', questionNumbers: [1],
  text: 'M: Could you bring the blue folder to the station before the morning train leaves?\nW: Yes I will meet you there at seven.' }
const pauses = [{ startSeconds: 0, endSeconds: 1.9 }, { startSeconds: 6.9, endSeconds: 10 }]
function workspace(t, primary) {
  const scratch = path.resolve('.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'listening-v2-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const audio = Buffer.from('synthetic audio hash binding; no actual decoder needed in frozen-output test')
  mkdirSync(path.join(dir, 'materialization/listening-audio'), { recursive: true })
  writeFileSync(path.join(dir, 'materialization/listening-audio/playback.mp3'), audio)
  const materialization = { paperId: 'paper-synthetic', listening: { state: 'captured', transcript: [group] },
    sourcePresentation: { instructions: [{ slotId: 'listening.short-dialogue', text: '每段录音读一遍。' }] } }
  writeFileSync(path.join(dir, 'source.json'), JSON.stringify(materialization))
  writeFileSync(path.join(dir, 'universal-source-manifest.json'), JSON.stringify({ materializationPath: 'source.json' }))
  const subject = { paperId: 'paper-synthetic', playbackAudioSha256: hash(audio), durationSeconds: 30,
    transcriptDigest: digestJson([group]) }
  const report = { schemaVersion: 'listening-review-v1', subject, reviewedBy: 'import_agent',
    reviewedAt: null, method: 'asr_source_comparison', untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [], groups: [] }
  const request = { transcript: [group], sourceInstructions: materialization.sourcePresentation.instructions, report }
  const appleEvidence = path.join(dir, 'apple.json')
  writeFileSync(appleEvidence, JSON.stringify({ ...primary, audioSha256: hash(audio) }))
  return { dir, subject, options: { paperDir: dir, request, appleEvidence, output: path.join(dir, 'attempts'),
    pauses, whisperPython: 'unused', whisperModel: 'frozen-synthetic' } }
}
test('successful frozen Apple evidence produces a sidecar accepted by the unchanged server contract', t => {
  const { dir, subject, options } = workspace(t, fixture)
  const result = segmentListening({ ...options, runWhisper: () => assert.fail('usable primary must not run fallback') })
  const review = JSON.parse(readFileSync(result.review, 'utf8'))
  assert.equal(result.usable, 1)
  assert.equal(result.fallbackGroups, 0)
  assert.equal(validateListeningReview(result.attempt, review, subject, [group]).review.groups[0].decision, 'usable')
  writeFileSync(path.join(dir, 'listening-review-v1.json'), JSON.stringify(review))
  assert.equal(assertImportSubmissionReady(dir).status, 'PASS')
})
test('failed primary gets exactly one fallback; reruns append attempts without changing old evidence', t => {
  const { options, subject } = workspace(t, { ...fixture, error: 'Apple fixture engine failed', result: { segments: [] } })
  let calls = 0
  const runWhisper = () => { calls++; return { ...fixture, engine: { name: 'faster-whisper', version: 'frozen' } } }
  const first = segmentListening({ ...options, runWhisper })
  assert.equal(calls, 1)
  const bytes = readFileSync(first.review)
  const review = JSON.parse(bytes)
  assert.equal(review.groups[0].decision, 'usable')
  assert.equal(validateListeningReview(first.attempt, review, subject, [group]).review.evidence.length, 3)
  const oldFiles = readdirSync(path.join(first.attempt, 'listening-review-evidence'))
  const before = oldFiles.map(f => hash(readFileSync(path.join(first.attempt, 'listening-review-evidence', f))))
  const second = segmentListening({ ...options, runWhisper })
  assert.equal(calls, 2)
  assert.notEqual(first.attempt, second.attempt)
  assert.equal(hash(readFileSync(first.review)), hash(bytes))
  assert.deepEqual(oldFiles.map(f => hash(readFileSync(path.join(first.attempt, 'listening-review-evidence', f)))), before)
})
test('both failures remain retained and submit fails closed', t => {
  const { dir, options } = workspace(t, { error: 'Apple unavailable' })
  let calls = 0
  const result = segmentListening({ ...options, runWhisper: () => { calls++; throw new Error('Whisper unavailable') } })
  assert.equal(calls, 1)
  const review = JSON.parse(readFileSync(result.review, 'utf8'))
  assert.equal(review.groups[0].decision, 'review_required')
  assert.equal(review.evidence.length, 3)
  writeFileSync(path.join(dir, 'listening-review-v1.json'), JSON.stringify(review))
  assert.throws(() => assertImportSubmissionReady(dir), { code: 'IMPORT_SUBMIT_LISTENING_NOT_USABLE' })
})
test('submit guard reads current source on every call, including after prior success', t => {
  const { dir } = workspace(t, fixture)
  writeFileSync(path.join(dir, 'listening-review-v1.json'), JSON.stringify({ groups: [{ ...group, decision: 'usable' }] }))
  assert.equal(assertImportSubmissionReady(dir).status, 'PASS')
  const sourceFile = path.join(dir, 'source.json')
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'))
  source.groups = [{ stem: '要点：(1) 经历' }]
  writeFileSync(sourceFile, JSON.stringify(source))
  assert.throws(() => assertImportSubmissionReady(dir), { code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING' })
})
test('fallback crop end respects ffprobe duration when canonical PCM duration rounds upward', t => {
  const { options } = workspace(t, { ...fixture, endSeconds: 29.9999, error: 'Apple failed' })
  let called = false
  const result = segmentListening({ ...options, runWhisper: ({ endSeconds }) => {
    called = true
    assert.equal(endSeconds, 29.9999)
    return fixture
  } })
  assert.equal(called, true)
  assert.equal(result.usable, 1)
})
test('request text is bound to its reviewed transcript digest, including reviewed spelling fixes', t => {
  const { dir, options } = workspace(t, fixture)
  const source = JSON.parse(readFileSync(path.join(dir, 'source.json'), 'utf8'))
  source.listening.transcript[0].text = source.listening.transcript[0].text.replace('blue', 'bule')
  writeFileSync(path.join(dir, 'source.json'), JSON.stringify(source))
  assert.equal(segmentListening(options).usable, 1)
  const changed = structuredClone(options.request)
  changed.transcript[0].text += ' altered'
  assert.throws(() => segmentListening({ ...options, request: changed }), /LISTENING_REQUEST_TRANSCRIPT_STALE/u)
})
test('two readings sharing one silence produce nonoverlapping occurrences accepted by the server', t => {
  const primary = structuredClone(fixture)
  const second = structuredClone(primary.result.segments[0])
  second.start += 5.2
  second.end += 5.2
  for (const run of second.runs) { run.start += 5.2; run.end += 5.2 }
  primary.result.segments.push(second)
  const { subject, options } = workspace(t, primary)
  options.request.sourceInstructions[0].text = '每段录音读两遍。'
  const result = segmentListening({ ...options,
    pauses: [{ startSeconds: 0, endSeconds: 1.9 }, { startSeconds: 7.11, endSeconds: 7.39 },
      { startSeconds: 12.1, endSeconds: 14 }] })
  assert.equal(result.usable, 1)
  const review = JSON.parse(readFileSync(result.review, 'utf8'))
  assert.ok(review.groups[0].occurrences[0].endSeconds <= review.groups[0].occurrences[1].startSeconds)
  assert.equal(validateListeningReview(result.attempt, review, subject, [group]).review.groups[0].decision, 'usable')
})
test('missing first tail falls back once to two complete readings; critical partial evidence still blocks submit', t => {
  for (const critical of [false, true]) {
    const full = structuredClone(fixture)
    const second = structuredClone(full.result.segments[0])
    second.start += 10
    second.end += 10
    for (const run of second.runs) { run.start += 10; run.end += 10 }
    full.result.segments.push(second)
    const primary = structuredClone(full)
    primary.result.segments[0].runs.at(-2).text = 'beside'
    if (critical) primary.result.segments[0].runs[8].text = 'station not'
    const {dir, subject, options} = workspace(t, primary)
    options.request.sourceInstructions[0].text = '每段录音读两遍。'
    let calls = 0
    const result = segmentListening({...options,
      pauses: [{startSeconds: 0, endSeconds: 1.9}, {startSeconds: 6.9, endSeconds: 10},
        {startSeconds: 11, endSeconds: 11.9}, {startSeconds: 16.9, endSeconds: 19}],
      runWhisper: () => { calls++; return {...full, engine: {name: 'faster-whisper'}} }})
    assert.equal(calls, 1)
    const review = JSON.parse(readFileSync(result.review, 'utf8'))
    validateListeningReview(result.attempt, review, subject, [group])
    writeFileSync(path.join(dir, 'listening-review-v1.json'), JSON.stringify(review))
    if (critical) {
      assert.equal(result.usable, 0)
      assert.equal(review.groups[0].playback, null)
      assert.throws(() => assertImportSubmissionReady(dir), {code: 'IMPORT_SUBMIT_LISTENING_NOT_USABLE'})
    } else {
      assert.equal(result.usable, 1)
      assert.equal(review.groups[0].occurrences.length, 2)
      const rules = JSON.parse(readFileSync(path.join(result.attempt, 'rule-result.json'), 'utf8'))
      assert.equal(rules.groups[0].selectedEngine, 'faster-whisper')
      assert.equal(rules.groups[0].engineAttempts[0].occurrences.length, 1)
      assert.equal(assertImportSubmissionReady(dir).status, 'PASS')
    }
  }
})
test('fallback crop ignores a failed neighbor with a partial occurrence', t => {
  const { options, dir, subject } = workspace(t, fixture)
  const other = { segmentId: 'listening-text-2', questionNumbers: [2], instruction: '本段读两遍',
    text: 'Fresh apples grow around this quiet village and our neighbors deliver baskets every summer.' }
  const groups = [{ ...group, instruction: '本段读两遍' }, other]
  options.request.transcript = groups
  subject.transcriptDigest = digestJson(groups)
  const tokens = other.text.toLowerCase().replace('.', '').split(' ')
  const primary = JSON.parse(readFileSync(options.appleEvidence, 'utf8'))
  primary.result.segments.push({ text: other.text, start: 15, end: 18,
    words: tokens.map((word, i) => ({ word, start: 15 + i * 0.2, end: 15 + (i + 1) * 0.2 })) })
  writeFileSync(options.appleEvidence, JSON.stringify(primary))
  const source = JSON.parse(readFileSync(path.join(dir, 'source.json'), 'utf8'))
  source.listening.transcript = groups
  writeFileSync(path.join(dir, 'source.json'), JSON.stringify(source))
  const calls = []
  segmentListening({ ...options, pauses: [...pauses, { startSeconds: 14, endSeconds: 14.9 },
    { startSeconds: 18.1, endSeconds: 19 }], runWhisper: args => {
    calls.push([args.group.segmentId, args.startSeconds, args.endSeconds])
    throw new Error('frozen fallback intentionally unavailable')
  } })
  assert.deepEqual(calls, [['listening-text-1', 0, 30]], 'identical raw window is inferred once')
})

// Exercise the real pipeline invocation, files, receipts and persistent cache
// without loading an ASR model. Wrapper process semantics are tested separately.
function offlineRunner(dir) {
  const config = path.join(dir, 'runner-config.json'), count = path.join(dir, 'runner-count.json')
  const executable = path.join(dir, 'offline-runner')
  const model = path.join(dir, 'model')
  mkdirSync(model)
  writeFileSync(path.join(model, 'model.bin'), 'frozen-model')
  writeFileSync(config, JSON.stringify({ mode: 'finished' }))
  writeFileSync(executable, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path')
const config = JSON.parse(fs.readFileSync(${JSON.stringify(config)}))
const counter = ${JSON.stringify(count)}
fs.writeFileSync(counter, JSON.stringify((fs.existsSync(counter) ? JSON.parse(fs.readFileSync(counter)) : 0) + 1))
const binding = JSON.parse(process.env.EQB_ASR_JOB_BINDING)
if (process.env.EQB_ASR_CONCURRENCY !== '1' || process.env.ASR_RUN_TIMEOUT !== '900') throw Error('single slot and 900s run budget required')
const rows = [{ phase: 'started', binding, inferenceStarted: false }]
if (config.mode !== 'queue_timeout') rows.push({ phase: 'acquired', binding, inferenceStarted: false })
if (config.mode !== 'unknown') rows.push({ phase: config.mode === 'finished' ? 'finished' : 'timeout',
  binding, inferenceStarted: config.mode !== 'queue_timeout',
  code: config.mode === 'queue_timeout' ? 'ASR_QUEUE_TIMEOUT' : config.mode === 'run_timeout' ? 'ASR_RUN_TIMEOUT' : null })
if (config.mode === 'wrong_binding') rows.forEach(r => r.binding = { ...binding, audioSha256: 'wrong-audio' })
fs.writeFileSync(process.env.EQB_ASR_RECEIPT, rows.map(r => JSON.stringify(r)).join('\\n') + '\\n')
if (config.mode !== 'finished') process.exit(1)
const output = process.argv[process.argv.indexOf('--model-snapshot') - 1]
fs.mkdirSync(output)
const record = ${JSON.stringify(fixture)}
record.language = 'en'
record.sampleSha256 = 'sha256:frozen'
for (const [name, value] of Object.entries({
  'input.json': { engine: { name: 'faster-whisper', modelSnapshot: 'frozen', version: 'offline' } },
  'settings.json': { language: 'en', vad_filter: false },
  'completed.json': { inputsUnchanged: true, windows: [{ path: 'window.json' }] },
  'window.json': record
})) fs.writeFileSync(path.join(output, name), JSON.stringify(value))
`)
  chmodSync(executable, 0o755)
  return { options: { whisperPython: executable, whisperModel: model },
    calls: () => JSON.parse(readFileSync(count)), mode: mode => writeFileSync(config, JSON.stringify({ mode })) }
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

test('completed fallback is reused across attempts only for identical audio, model and effective window', t => {
  const { dir, options } = workspace(t, { ...fixture, error: 'primary unavailable' })
  const runner = offlineRunner(dir)
  const first = segmentListening({ ...options, ...runner.options })
  const bytes = readFileSync(first.review)
  assert.equal(first.usable, 1)
  const second = segmentListening({ ...options, ...runner.options })
  assert.equal(second.usable, 1)
  assert.equal(runner.calls(), 1, 'same model/audio/window must not infer again')
  assert.deepEqual(readFileSync(first.review), bytes)
  const input = readJson(path.join(second.attempt, 'whisper-1/job-input.json'))
  assert.equal(input.reusedFrom, path.join(first.attempt, 'whisper-1'))
  assert.equal(input.binding.settings.vad_filter, false)
  assert.equal(input.binding.settings.language, 'en')
  const primary = readJson(options.appleEvidence)
  primary.endSeconds = 29.9999
  writeFileSync(options.appleEvidence, JSON.stringify(primary))
  segmentListening({ ...options, ...runner.options })
  assert.equal(runner.calls(), 2, 'a changed effective raw window is distinct work')
  writeFileSync(path.join(runner.options.whisperModel, 'model.bin'), 'different-model')
  segmentListening({ ...options, ...runner.options })
  assert.equal(runner.calls(), 3, 'a changed model digest cannot hit cache')
  const audio = Buffer.from('changed synthetic audio')
  writeFileSync(path.join(dir, 'materialization/listening-audio/playback.mp3'), audio)
  primary.audioSha256 = hash(audio)
  options.request.report.subject.playbackAudioSha256 = hash(audio)
  writeFileSync(options.appleEvidence, JSON.stringify(primary))
  segmentListening({ ...options, ...runner.options })
  assert.equal(runner.calls(), 4, 'a changed audio digest cannot hit cache')
})

test('queue timeout remains scheduling evidence and a later attempt may resume without spending fallback budget', t => {
  const { dir, options } = workspace(t, { ...fixture, error: 'primary unavailable' })
  const runner = offlineRunner(dir)
  runner.mode('queue_timeout')
  const first = segmentListening({ ...options, ...runner.options })
  const rules = readJson(path.join(first.attempt, 'rule-result.json'))
  const failure = readJson(path.join(first.attempt, 'whisper-1/failure.json'))
  assert.equal(failure.code, 'ASR_QUEUE_TIMEOUT')
  assert.equal(failure.inferenceStarted, false)
  assert.equal(failure.fallbackBudgetConsumed, false)
  assert.equal(rules.groups[0].engineAttempts.length, 1, 'queue timeout is not a second engine empty result')
  assert.ok(rules.groups[0].issues.includes('ASR_QUEUE_TIMEOUT'))
  assert.equal(first.usable, 0)
  const review = readJson(first.review)
  assert.ok(review.evidence.some(e => e.path.endsWith('-slot.json') && e.kind === 'review_notes'))
  runner.mode('finished')
  assert.equal(segmentListening({ ...options, ...runner.options }).usable, 1)
  assert.equal(runner.calls(), 2)
})

test('run timeout, acquired UNKNOWN and mismatched receipts cannot silently replay a started job', t => {
  for (const mode of ['run_timeout', 'unknown', 'wrong_binding']) {
    const { dir, options } = workspace(t, { ...fixture, error: 'primary unavailable' })
    const runner = offlineRunner(dir)
    runner.mode(mode)
    const first = segmentListening({ ...options, ...runner.options })
    const failure = readJson(path.join(first.attempt, 'whisper-1/failure.json'))
    assert.equal(failure.fallbackBudgetConsumed, true, mode)
    if (mode === 'run_timeout') assert.equal(failure.code, 'ASR_RUN_TIMEOUT')
    else assert.equal(readJson(path.join(first.attempt, 'rule-result.json')).groups[0].engineAttempts.length, 1,
      'UNKNOWN is not an empty second-engine result')
    runner.mode('finished')
    const second = segmentListening({ ...options, ...runner.options })
    assert.equal(second.usable, 0, mode)
    assert.equal(runner.calls(), 1, `${mode} requires reconciliation before replay`)
  }
})

test('corrupt cached raw evidence fails closed instead of starting another inference', t => {
  const { dir, options } = workspace(t, { ...fixture, error: 'primary unavailable' })
  const runner = offlineRunner(dir)
  const first = segmentListening({ ...options, ...runner.options })
  writeFileSync(path.join(first.attempt, 'whisper-1/cached-0.json'), '{}')
  const second = segmentListening({ ...options, ...runner.options })
  assert.equal(second.usable, 0)
  assert.equal(runner.calls(), 1)
  assert.match(readJson(path.join(second.attempt, 'whisper-1/failure.json')).error, /ASR_CACHE_EVIDENCE_CHANGED/u)
})

test('sharing an identical raw fallback window preserves independent judgments for each group', t => {
  const { dir, options, subject } = workspace(t, { ...fixture, error: 'primary unavailable' })
  const other = { segmentId: 'listening-text-2', questionNumbers: [2],
    text: 'Fresh apples grow around this quiet village and our neighbors deliver baskets every summer.' }
  const groups = [group, other]
  options.request.transcript = groups
  subject.transcriptDigest = digestJson(groups)
  const source = readJson(path.join(dir, 'source.json'))
  source.listening.transcript = groups
  writeFileSync(path.join(dir, 'source.json'), JSON.stringify(source))
  const tokens = other.text.toLowerCase().replace('.', '').split(' ')
  const raw = structuredClone(fixture)
  raw.result.segments.push({ start: 15, end: 15 + tokens.length * 0.2, text: other.text,
    words: tokens.map((word, i) => ({ word, start: 15 + i * 0.2, end: 15 + (i + 1) * 0.2 })) })
  let calls = 0
  const result = segmentListening({ ...options, pauses: [...pauses,
    { startSeconds: 14, endSeconds: 14.9 }, { startSeconds: 18.3, endSeconds: 20 }],
    runWhisper: () => { calls++; return raw } })
  assert.equal(calls, 1)
  assert.equal(result.usable, 2)
  const rules = readJson(path.join(result.attempt, 'rule-result.json'))
  assert.deepEqual(rules.groups.map(g => g.questionNumbers), [[1], [2]])
  assert.notEqual(rules.groups[0].playback.startSeconds, rules.groups[1].playback.startSeconds)
})
