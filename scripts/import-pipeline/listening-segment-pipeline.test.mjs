import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
  assert.deepEqual(calls, [['listening-text-1', 0, 30], ['listening-text-2', 0, 30]])
})
