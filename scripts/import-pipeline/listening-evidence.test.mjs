import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { loadListeningResult, writeListeningEvidence } from './lib-listening-evidence.mjs'
import { assertListeningUploadBudget } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { readListeningReview, readSealedListeningReview, validateListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { reviewSubjectBundleDigest } from '../../server/import-review/reviewSubject.mjs'
import { withListeningRuleFixture } from '../lib/listeningRuleEvidenceFixture.mjs'

const write = (file, data) => writeFileSync(file, JSON.stringify(data))
function workspace(t) {
  const parent = path.resolve('.scratch')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(path.join(parent, 'compact-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
function diagnostic(root) {
  const observations = Array.from({ length: 2000 }, (_, i) => ({ token: `word${i}`, startSeconds: i, endSeconds: i + 1 }))
  const group = { segmentId: 's1', questionNumbers: [1], decision: 'review_required',
    sourceText: 'Synthetic source.', expectedReadings: 2, issues: ['CRITICAL_WORD_DIFFERENCE'],
    playback: null, occurrences: [], boundarySpeechRuns: observations,
    observedWindows: [{ startSeconds: 0, endSeconds: 2001, words: observations, evidencePaths: ['raw.json'] }],
    partialOccurrences: [{ startSeconds: 0, anchorEndSeconds: 5, words: observations }],
    engineConflicts: ['critical contradiction'], engineNotes: ['retain mismatch'],
    engineAttempts: [{ engine: 'failed', decision: 'blocked', issues: ['BODY_ALIGNMENT_LOW'],
      observedWindows: [{ words: observations }], occurrences: [] }] }
  const resolved = { rule: { version: 'fixture' }, groups: [group] }, apple = { groups: [group] }
  return { resolved, apple, summary: writeListeningEvidence({ attempt: root, resolved, apple,
    input: { normalization: {} }, rawEvidence: [] }) }
}
test('summary stays small; lossless reader restores every failed observation and engine conflict', t => {
  const root = workspace(t), { resolved, apple, summary } = diagnostic(root)
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 10_000)
  assert.ok(!JSON.stringify(summary).includes('"token":"word'))
  const tracked = []
  assert.deepEqual(loadListeningResult(path.join(root, 'rule-result.json'), { track: file => tracked.push(file) }), resolved)
  assert.deepEqual(loadListeningResult(path.join(root, 'apple-rule.json')), apple)
  assert.ok(tracked.includes(path.join(root, 'diagnostics.json.gz')))
  const legacy = path.join(root, 'legacy.json')
  write(legacy, resolved)
  const before = readFileSync(legacy)
  assert.deepEqual(loadListeningResult(legacy), resolved)
  assert.deepEqual(readFileSync(legacy), before)
})
test('missing, corrupt, escaping, oversized and unknown diagnostics fail closed', t => {
  const root = workspace(t)
  diagnostic(root)
  const file = path.join(root, 'rule-result.json'), original = JSON.parse(readFileSync(file))
  const bytes = readFileSync(path.join(root, 'diagnostics.json.gz'))
  for (const mutate of [
    v => { v.schemaVersion = 'unknown' },
    v => { v.diagnostic.path = '../diagnostics.json.gz' },
    v => { v.diagnostic.schemaVersion = 'unknown' },
    v => { v.diagnostic.decodedByteLength = 256 * 1024 ** 2 + 1 },
    v => { v.diagnostic.decodedByteLength = 1 },
    v => { v.diagnostic.sha256 = sha256('changed') },
    v => { v.diagnostic.decodedSha256 = sha256('changed') },
    v => { v.groups[0].issues = [] },
  ]) {
    const v = structuredClone(original); mutate(v); write(file, v)
    assert.throws(() => loadListeningResult(file))
  }
  write(file, original)
  writeFileSync(path.join(root, 'diagnostics.json.gz'), bytes.subarray(0, bytes.length - 2))
  assert.throws(() => loadListeningResult(file))
  rmSync(path.join(root, 'diagnostics.json.gz'))
  assert.throws(() => loadListeningResult(file))
  const outside = workspace(t)
  writeFileSync(path.join(outside, 'diagnostics.json.gz'), bytes)
  symlinkSync(path.join(outside, 'diagnostics.json.gz'), path.join(root, 'diagnostics.json.gz'))
  assert.throws(() => loadListeningResult(file), /escapes/u)
  rmSync(path.join(root, 'diagnostics.json.gz'))
  const decoded = Buffer.from(stableStringify({ schemaVersion: 'unknown', apple: {}, resolved: {} }))
  const bad = gzipSync(decoded)
  writeFileSync(path.join(root, 'diagnostics.json.gz'), bad)
  write(file, { ...original, diagnostic: { ...original.diagnostic, sha256: sha256(bad), byteLength: bad.length,
    decodedSha256: sha256(decoded), decodedByteLength: decoded.length } })
  assert.throws(() => loadListeningResult(file), /payload version/u)
})
function navigation(root) {
  mkdirSync(path.join(root, 'listening-review-evidence'))
  const bytes = Buffer.from('{"synthetic":true}')
  writeFileSync(path.join(root, 'listening-review-evidence/raw.json'), bytes)
  const transcript = [{ segmentId: 's1', questionNumbers: [1], text: 'Synthetic source.' }]
  const subject = { paperId: 'paper-synthetic', sourceDigest: sha256('source'),
    candidateDigest: sha256('candidate'), playbackAudioSha256: sha256('audio'), durationSeconds: 10 }
  const review = withListeningRuleFixture(root, { subject, reviewedBy: 'import_agent', reviewedAt: '2026-10-27T00:00:00Z',
    method: 'asr_source_comparison', untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [{ path: 'listening-review-evidence/raw.json', sha256: sha256(bytes), byteLength: bytes.length,
      kind: 'asr_window', window: { startSeconds: 0, endSeconds: 10 },
      settings: { engine: 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' } }],
    groups: [{ segmentId: 's1', questionNumbers: [1], decision: 'usable', reason: 'Synthetic attestation', limits: [],
      playback: { startSeconds: 1, endSeconds: 3 }, occurrences: [{ startSeconds: 1, endSeconds: 3,
        evidencePaths: ['listening-review-evidence/raw.json'] }] }] }, transcript)
  return { review, subject, transcript }
}
test('first admission accepts v1/v2 and rejects stripped/unknown schemas and hidden second rule', t => {
  const root = workspace(t), { review, subject, transcript } = navigation(root)
  assert.equal(validateListeningReview(root, review, subject, transcript).review, review)
  // A real v1 review carries no rule summary and is validated by v1 rules.
  const v1 = structuredClone(review)
  v1.schemaVersion = 'listening-review-v1'
  v1.evidence = v1.evidence.filter(file => file.path !== 'listening-review-evidence/fixture-rule.json')
  assert.equal(validateListeningReview(root, v1, subject, transcript).review, v1)
  // Stripped, missing or future versions still fail closed.
  for (const version of [undefined, null, 'listening-review-v3', 'listening-review-v99']) {
    assert.throws(() => validateListeningReview(root, { ...review, schemaVersion: version }, subject, transcript))
  }
  // Extra options never authorize a stripped/forged schema.
  assert.throws(() => validateListeningReview(root, { ...review, schemaVersion: undefined,
    allowLegacy: true, revisionId: 'forged', bundleDigest: sha256('fake') }, subject, transcript))
  const rule = review.evidence.at(-1), summary = JSON.parse(readFileSync(path.join(root, rule.path)))
  for (const change of [
    v => { delete v.schemaVersion },
    v => { v.schemaVersion = 'listening-rule-evidence-v1' },
    v => { v.input.subject.paperId = 'another-paper' },
    v => { v.rawEvidence[0].sha256 = sha256('different ASR') },
    v => { v.groups[0].playback.endSeconds = 4 },
    v => { v.groups[0].decision = 'blocked' },
    v => { v.groups[0].observedWindows = [] },
  ]) {
    const next = structuredClone(review), v = structuredClone(summary); change(v)
    const bytes = Buffer.from(JSON.stringify(v))
    writeFileSync(path.join(root, rule.path), bytes)
    Object.assign(next.evidence.at(-1), { sha256: sha256(bytes), byteLength: bytes.length })
    assert.throws(() => validateListeningReview(root, next, subject, transcript))
  }
  write(path.join(root, rule.path), summary)
  const extra = Buffer.from('{"rule":{"version":"old"},"groups":[]}')
  writeFileSync(path.join(root, 'listening-review-evidence/other.json'), extra)
  review.evidence.push({ path: 'listening-review-evidence/other.json', sha256: sha256(extra), byteLength: extra.length,
    kind: 'review_notes', window: null, settings: null })
  assert.throws(() => validateListeningReview(root, review, subject, transcript), /legacy/u)
  const disguised = withListeningRuleFixture(root, { ...review, evidence: [
    review.evidence[0], { ...review.evidence[0], path: 'listening-review-evidence/other.json',
      sha256: sha256(extra), byteLength: extra.length },
  ] }, transcript)
  assert.throws(() => validateListeningReview(root, disguised, subject, transcript), /rule evidence cannot claim ASR/u)
})
test('sealed v1 is readable only with the original manifest identity and exact sidecar/ASR bytes', t => {
  const root = workspace(t), { review, subject, transcript } = navigation(root)
  review.schemaVersion = 'listening-review-v1'
  review.evidence.pop() // A real legacy fixture has no compact rule summary.
  const sidecar = path.join(root, 'listening-review-v1.json')
  write(sidecar, review)
  const bytes = readFileSync(sidecar)
  const manifest = { schemaVersion: 'web-import-review-bundle-v1', ...subject, paperName: 'Fixture',
    visibleStructureDigest: sha256('structure'), producerBuildId: 'historical',
    files: [{ path: 'listening-review-v1.json', sha256: sha256(bytes), byteLength: bytes.length,
      role: 'listening_review', mediaType: 'application/json' },
    ...review.evidence.map(file => ({ path: file.path, sha256: file.sha256, byteLength: file.byteLength,
      role: 'listening_review_evidence', mediaType: 'application/json' }))] }
  manifest.bundleDigest = reviewSubjectBundleDigest(manifest)
  const revision = { id: 'rev-original', state: 'awaiting_review', ...subject,
    bundleDigest: manifest.bundleDigest, manifest }
  // First admission now accepts the same v1 review under its own rules.
  assert.deepEqual(readListeningReview(root, subject, transcript).review, review)
  assert.deepEqual(readSealedListeningReview(root, subject, transcript, revision).review, review)
  assert.deepEqual(readFileSync(sidecar), bytes)
  for (const mutate of [
    v => { v.state = 'uploading' },
    v => { delete v.id },
    v => { v.paperId = 'another' },
    v => { v.candidateDigest = sha256('another') },
    v => { v.manifest.files[0].sha256 = sha256('another') },
  ]) {
    const next = structuredClone(revision); mutate(next)
    assert.throws(() => readSealedListeningReview(root, subject, transcript, next))
  }
  writeFileSync(sidecar, `${bytes}\n`)
  assert.throws(() => readSealedListeningReview(root, subject, transcript, revision), /sidecar/u)
  writeFileSync(sidecar, bytes)
  writeFileSync(path.join(root, review.evidence[0].path), '{"changed":true}')
  assert.throws(() => readSealedListeningReview(root, subject, transcript, revision), /changed evidence/u)
})
test('local upload preflight names oversize files and refuses total budget overflow', () => {
  assert.throws(() => assertListeningUploadBudget([{ path: 'large.json', byteLength: 64 * 1024 ** 2 + 1 }]), /large.json/u)
  assert.throws(() => assertListeningUploadBudget(Array.from({ length: 5 }, (_, i) => ({
    path: `file-${i}.json`, byteLength: 64 * 1024 ** 2 }))), /bundle/u)
})
