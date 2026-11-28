import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { loadListeningResult, writeListeningEvidence } from './lib-listening-evidence.mjs'
import { assertListeningUploadBudget } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { readListeningReview, readSealedListeningReview, RETAINED_LISTENING_NAVIGATION,
  validateListeningReview, verifyRetainedListeningNavigation } from '../../server/paper-import/listeningReview.mjs'
import { reviewSubjectBundleDigest } from '../../server/import-review/reviewSubject.mjs'
import { withListeningRuleFixture } from '../lib/listeningRuleEvidenceFixture.mjs'

const write = (file, data) => writeFileSync(file, JSON.stringify(data))

test('transcript repair can rebind identities while retaining exact playback, occurrences and evidence', () => {
  const base = { method: 'agent_asr_comparison',
    subject: { candidateDigest: 'old', sourceDigest: 'old source', transcriptDigest: 'old text', playbackAudioSha256: 'audio' },
    evidence: [{ path: 'apple', sha256: 'evidence' }],
    groups: [{ segmentId: 's1', playback: { startSeconds: 1, endSeconds: 5 },
      occurrences: [{ startSeconds: 1, endSeconds: 5, evidencePaths: ['apple'] }] }],
  }
  const repair = { ...structuredClone(base), method: RETAINED_LISTENING_NAVIGATION,
    subject: { ...base.subject, candidateDigest: 'new', sourceDigest: 'new source', transcriptDigest: 'new text' } }
  assert.doesNotThrow(() => verifyRetainedListeningNavigation(repair, () => base))
  assert.throws(() => verifyRetainedListeningNavigation(repair, () => null), /finalized base/u)
  for (const mutate of [
    value => { value.groups[0].playback.endSeconds -= 0.36 },
    value => { value.groups[0].occurrences[0].endSeconds -= 0.36 },
    value => { value.subject.playbackAudioSha256 = 'different audio' },
    value => { value.evidence[0].sha256 = 'different evidence' },
  ]) {
    const changed = structuredClone(repair)
    mutate(changed)
    assert.throws(() => verifyRetainedListeningNavigation(changed, () => base), /finalized base/u)
  }
})

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
function navigation(root, { extraWords = [], extraSegments = [], windowStart = 0 } = {}) {
  mkdirSync(path.join(root, 'listening-review-evidence'))
  const words = [
    { word: 'Synthetic', start: 1, end: 1.2 }, { word: 'source.', start: 2.8, end: 3 },
    { word: 'SOURCE!', start: 3.5, end: 3.7 }, ...extraWords,
  ].sort((a, b) => a.start - b.start)
    .map(({ word, start, end }) => ({ word, start: start - windowStart, end: end - windowStart }))
  const bytes = Buffer.from(JSON.stringify({ result: { segments: [{ words }, ...extraSegments] } }))
  writeFileSync(path.join(root, 'listening-review-evidence/raw.json'), bytes)
  const transcript = [{ segmentId: 's1', questionNumbers: [1], text: 'Synthetic source.' }]
  const subject = { paperId: 'paper-synthetic', sourceDigest: sha256('source'),
    candidateDigest: sha256('candidate'), playbackAudioSha256: sha256('audio'), durationSeconds: 10 }
  const review = withListeningRuleFixture(root, { subject, reviewedBy: 'import_agent', reviewedAt: '2026-10-27T00:00:00Z',
    method: 'asr_source_comparison', untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [{ path: 'listening-review-evidence/raw.json', sha256: sha256(bytes), byteLength: bytes.length,
      kind: 'asr_window', window: { startSeconds: windowStart, endSeconds: 10 },
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

function agentNavigation(t, machineDecision = 'review_required', asrOptions) {
  const root = workspace(t), { review, subject, transcript } = navigation(root, asrOptions)
  transcript.push({ segmentId: 's2', questionNumbers: [2], text: 'Another source.' })
  review.groups.push({ ...structuredClone(review.groups[0]), segmentId: 's2', questionNumbers: [2],
    playback: { startSeconds: 5, endSeconds: 7 },
    occurrences: [{ startSeconds: 5, endSeconds: 7, evidencePaths: [review.evidence[0].path] }] })
  if (machineDecision === 'review_required') {
    Object.assign(review.groups[0], { decision: 'review_required', playback: null, occurrences: [] })
  }
  // Bind the machine word edges separately from the padded playback range.
  const agent = withListeningRuleFixture(root, review, transcript)
  if (machineDecision === 'usable') {
    const descriptor = agent.evidence.at(-1), file = path.join(root, descriptor.path)
    const summary = JSON.parse(readFileSync(file))
    Object.assign(summary.groups[0].occurrences[0], { startSeconds: 1, endSeconds: 3 })
    const bytes = Buffer.from(JSON.stringify(summary))
    writeFileSync(file, bytes)
    Object.assign(descriptor, { sha256: sha256(bytes), byteLength: bytes.length })
  }
  agent.method = 'agent_asr_comparison'
  Object.assign(agent.groups[0], { decision: 'usable', playback: { startSeconds: 1, endSeconds: 4 },
    occurrences: [{ startSeconds: 1, endSeconds: 4, evidencePaths: [agent.evidence[0].path] }] })
  const edge = (sourceText, text, startSeconds) => ({ sourceText,
    words: [{ text, startSeconds, endSeconds: startSeconds + 0.2, evidencePath: agent.evidence[0].path }] })
  agent.groups[0].boundaryJudgment = {
    start: edge('Synthetic', 'Synthetic', 1), end: edge('source.', 'SOURCE!', 3.5),
  }
  return { root, agent, subject, transcript }
}
test('agent ASR can adjust machine playback with retained word-time basis', t => {
  const { root, agent, subject, transcript } = agentNavigation(t)
  assert.equal(validateListeningReview(root, agent, subject, transcript).review, agent)
})
test('agent ASR adjustment requires boundary basis', t => {
  const { root, agent, subject, transcript } = agentNavigation(t)
  delete agent.groups[0].boundaryJudgment
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /boundary basis/u)
})
test('agent ASR adjustment cannot overlap its adjacent group', t => {
  const { root, agent, subject, transcript } = agentNavigation(t)
  agent.groups[0].playback.endSeconds = 5.1
  agent.groups[0].occurrences[0].endSeconds = 5.1
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /overlapping playback/u)
})
test('agent ASR can widen a machine usable group over a same-word echo with retained boundary basis', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable',
    { extraWords: [{ word: 'SYNTHETIC!', start: 0.5, end: 0.7 }] })
  const group = agent.groups[0]
  group.playback.startSeconds = group.occurrences[0].startSeconds = 0.5
  assert.equal(validateListeningReview(root, agent, subject, transcript).review, agent)
  delete group.boundaryJudgment
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /boundary basis/u)
  agent.method = 'asr_source_comparison'
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /navigation differs from rule/u)
})
test('a supplemental source word explains a cropped recognition only at the same time', t => {
  for (const [text, start, allowed] of [['sauce', 3.52, true], ['Text', 3.52, false],
    ['Another', 3.52, false], ['sauce', 3.48, false], ['sauce', 3.85, false]]) {
    const { root, agent, subject, transcript } = agentNavigation(t, 'usable', {
      extraWords: [{ word: text, start, end: Math.max(start, 3.66) }],
    })
    const relative = 'listening-review-evidence/supplement.json'
    const bytes = Buffer.from(JSON.stringify({ segments: [{ words: [{ word: 'source', start: 3.5, end: 3.7 }] }] }))
    writeFileSync(path.join(root, relative), bytes)
    agent.evidence.push({ ...agent.evidence[0], path: relative, sha256: sha256(bytes), byteLength: bytes.length })
    Object.assign(agent.groups[0].boundaryJudgment.end.words[0], { text: 'source', evidencePath: relative })
    const validate = () => validateListeningReview(root, agent, subject, transcript)
    if (allowed) assert.doesNotThrow(validate)
    else assert.throws(validate, /widened range contains other speech/u)
  }
})
test('agent ASR cannot start a machine usable occurrence at a repeated word inside it', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable',
    { extraWords: [{ word: 'Synthetic', start: 1.5, end: 1.7 }] })
  const group = agent.groups[0]
  group.playback.startSeconds = group.occurrences[0].startSeconds = 1.5
  Object.assign(group.boundaryJudgment.start.words[0], { startSeconds: 1.5, endSeconds: 1.7 })
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /usable adjustment must only widen/u)
})
test('agent ASR cannot widen machine usable playback by more than a second per edge', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable')
  const group = agent.groups[0]
  group.playback.endSeconds = 4.01
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /more than 1 second per edge/u)
  group.occurrences[0].endSeconds = 4.01
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /more than 1 second per edge/u)
})
test('agent ASR cannot widen a machine usable occurrence over a spoken announcement', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable', {
    extraWords: [{ word: 'Text', start: 3.1, end: 3.2 }, { word: 'two', start: 3.2, end: 3.4 }],
  })
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /widened range contains other speech/u)
  agent.groups[0].occurrences[0].endSeconds = 3
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /widened range contains other speech/u)
})
test('agent ASR rejects words overlapping either widened edge even if their onset was outside it', t => {
  const after = agentNavigation(t, 'usable', { extraWords: [{ word: 'Next', start: 3, end: 3.2 }] })
  assert.throws(() => validateListeningReview(after.root, after.agent, after.subject, after.transcript),
    /end: widened range contains other speech/u)
  const before = agentNavigation(t, 'usable', { extraWords: [{ word: 'Previous', start: 0.4, end: 0.6 }] })
  const group = before.agent.groups[0]
  group.playback.startSeconds = group.occurrences[0].startSeconds = 0.5
  assert.throws(() => validateListeningReview(before.root, before.agent, before.subject, before.transcript),
    /start: widened range contains other speech/u)
})
test('agent ASR rejects a zero-length ASR word inside widened playback', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable', {
    extraSegments: [{ text: ' Deal. Next', words: [{ word: ' Deal.', start: 3.2, end: 3.2 }, { word: ' Next', start: 5, end: 5.2 }] }],
  })
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /widened range contains other speech/u)
})
test('agent ASR checks timed announcements and ASR segments without word timestamps in widened playback', t => {
  for (const segment of [
    { text: '第二段', words: [{ word: '第二段', start: 3.1, end: 3.3 }] },
    { text: '请看第二题', words: [{ word: '请看第二题', start: 3.1, end: 3.3 }] },
    { text: 'Next dialogue', start: 3.1, end: 3.3 },
  ]) {
    const { root, agent, subject, transcript } = agentNavigation(t, 'usable', { extraSegments: [segment] })
    assert.throws(() => validateListeningReview(root, agent, subject, transcript), /widened range contains other speech/u)
  }
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable', {
    extraSegments: [{ text: 'SOURCE!', start: 3.1, end: 3.3 }],
  })
  assert.equal(validateListeningReview(root, agent, subject, transcript).review, agent)
})
test('agent ASR requires continuous ASR coverage when only group playback widens', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable', { windowStart: 0.25 })
  agent.groups[0].playback.startSeconds = 0
  agent.groups[0].occurrences[0].endSeconds = agent.groups[0].playback.endSeconds = 3
  Object.assign(agent.groups[0].boundaryJudgment.end.words[0], { text: 'source.', startSeconds: 2.8, endSeconds: 3 })
  assert.throws(() => validateListeningReview(root, agent, subject, transcript),
    /ASR evidence does not cover the widened range/u)
})
test('agent ASR cannot change the occurrence count of a machine usable group', t => {
  const { root, agent, subject, transcript } = agentNavigation(t, 'usable')
  agent.groups[0].occurrences = []
  assert.throws(() => validateListeningReview(root, agent, subject, transcript), /preserve occurrence count/u)
})
test('agent ASR rejects invented words, mismatched timestamps and distant boundary words', t => {
  const { root, agent, subject, transcript } = agentNavigation(t)
  for (const mutate of [
    v => { v.groups[0].boundaryJudgment.start.words[0].text = 'invented' },
    v => { v.groups[0].boundaryJudgment.start.words[0].endSeconds += 0.06 },
    v => { v.groups[0].playback.endSeconds = 5.21 },
  ]) {
    const next = structuredClone(agent)
    mutate(next)
    assert.throws(() => validateListeningReview(root, next, subject, transcript), /boundary word missing or far/u)
  }
})
