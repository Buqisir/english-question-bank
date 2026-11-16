import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { retainOwnerListening } from './lib-finish-owner-listening.mjs'
import { withListeningRuleFixture } from '../lib/listeningRuleEvidenceFixture.mjs'
import { validateListeningReview } from '../../server/paper-import/listeningReview.mjs'

function setup(t, { changed = false, sidecar = true } = {}) {
  const scratch = path.resolve('.scratch')
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(path.join(scratch, 'finish-owner-listening-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const paperDir = path.join(root, 'paper'), attempt = path.join(root, 'attempt')
  const evidence = (dir, value) => {
    const name = 'listening-review-evidence/rule.json'
    mkdirSync(path.join(dir, 'listening-review-evidence'), { recursive: true })
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 'listening-rule-evidence-v2', value }))
    writeFileSync(path.join(dir, name), bytes)
    return { path: name, kind: 'review_notes', sha256: sha256(bytes), byteLength: bytes.length }
  }
  const owner = { method: 'audio_source_comparison', subject: { audio: 'same' },
    evidence: [evidence(paperDir, 'old')], groups: [{ decision: 'usable' }] }
  const report = { ...owner, method: 'asr_source_comparison', evidence: [evidence(attempt, changed ? 'new' : 'old')] }
  const file = path.join(paperDir, 'listening-review-v1.json')
  if (sidecar) writeFileSync(file, JSON.stringify(owner))
  return { paperDir, attempt, report, file }
}

for (const scenario of [
  { name: '相同切分保留已验证的 Owner 结果', retain: true },
  { name: '切分变化时记录失效并安装机器结果', changed: true },
  { name: '没有 sidecar 时安装机器结果', sidecar: false },
]) {
  test(scenario.name, async t => {
    const fixture = setup(t, scenario), logs = []
    let verified = 0, installed = 0
    const original = scenario.sidecar === false ? null : readFileSync(fixture.file)
    const result = await retainOwnerListening({ ...fixture, log: message => logs.push(message), verify: async () => { verified++ } })
    if (!result) { installed++; writeFileSync(fixture.file, JSON.stringify(fixture.report)) }
    assert.equal(installed, scenario.retain ? 0 : 1)
    assert.equal(verified, scenario.retain ? 1 : 0)
    if (scenario.retain) assert.deepEqual(readFileSync(fixture.file), original)
    if (scenario.changed) assert.match(logs.join('\n'), /旧 Owner 听核结论已失效/u)
  })
}

test('校验失败时保留 Owner sidecar 并停止', async t => {
  const fixture = setup(t), original = readFileSync(fixture.file)
  await assert.rejects(retainOwnerListening({ ...fixture, log: () => {}, verify: async () => { throw new Error('invalid') } }), /invalid/u)
  assert.deepEqual(readFileSync(fixture.file), original)
})

test('缺少切分绑定时停止而不覆盖', async t => {
  const fixture = setup(t), original = readFileSync(fixture.file)
  fixture.report.evidence = []
  await assert.rejects(retainOwnerListening({ ...fixture, log: () => {}, verify: async () => assert.fail() }), /无法确认/u)
  assert.deepEqual(readFileSync(fixture.file), original)
})

function agentFixture(t) {
  const fixture = setup(t)
  const relative = 'listening-review-evidence/asr.json', bytes = Buffer.from(JSON.stringify({
    result: { segments: [{ words: [{ word: 'Hello', start: 1, end: 1.2 },
      { word: 'world.', start: 3.5, end: 3.7 }] }] },
  }))
  for (const dir of [fixture.paperDir, fixture.attempt]) writeFileSync(path.join(dir, relative), bytes)
  const subject = { durationSeconds: 10, playbackAudioSha256: sha256('audio') }
  const transcript = [{ segmentId: 's1', questionNumbers: [1], text: 'Hello world.' },
    { segmentId: 's2', questionNumbers: [2], text: 'Second source.' }]
  const report = withListeningRuleFixture(fixture.attempt, { subject, method: 'asr_source_comparison',
    reviewedBy: 'import_agent', reviewedAt: '2026-11-16T00:00:00Z', untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [{ path: relative, sha256: sha256(bytes), byteLength: bytes.length, kind: 'asr_window',
      window: { startSeconds: 0, endSeconds: 10 },
      settings: { engine: 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' } }],
    groups: transcript.map((g, i) => ({ segmentId: g.segmentId, questionNumbers: g.questionNumbers,
      decision: i === 0 ? 'review_required' : 'usable', reason: 'fixture', limits: [],
      playback: i === 0 ? null : { startSeconds: i * 4 + 1, endSeconds: i * 4 + 3 },
      occurrences: i === 0 ? [] : [{ startSeconds: i * 4 + 1, endSeconds: i * 4 + 3, evidencePaths: [relative] }] })),
  }, transcript)
  for (const file of report.evidence) writeFileSync(path.join(fixture.paperDir, file.path),
    readFileSync(path.join(fixture.attempt, file.path)))
  const agent = structuredClone(report)
  agent.method = 'agent_asr_comparison'
  Object.assign(agent.groups[0], { decision: 'usable', playback: { startSeconds: 1, endSeconds: 4 },
    occurrences: [{ startSeconds: 1, endSeconds: 4, evidencePaths: [relative] }] })
  const edge = (sourceText, startSeconds) => ({ sourceText,
    words: [{ text: sourceText, startSeconds, endSeconds: startSeconds + 0.2, evidencePath: relative }] })
  agent.groups[0].boundaryJudgment = { start: edge('Hello', 1), end: edge('world.', 3.5) }
  return { ...fixture, report, agent, subject, transcript }
}
for (const scenario of ['valid', 'missing basis', 'overlap']) {
  test(`finish preserves agent judgement only after validation: ${scenario}`, async t => {
    const fixture = agentFixture(t), logs = []
    if (scenario === 'missing basis') delete fixture.agent.groups[0].boundaryJudgment
    if (scenario === 'overlap') fixture.agent.groups[0].playback.endSeconds = 5.1
    writeFileSync(fixture.file, JSON.stringify(fixture.agent))
    const before = readFileSync(fixture.file)
    const result = retainOwnerListening({ ...fixture, log: message => logs.push(message),
      verify: async () => validateListeningReview(fixture.paperDir, JSON.parse(readFileSync(fixture.file)),
        fixture.subject, fixture.transcript) })
    if (scenario === 'valid') {
      const retained = await result
      assert.equal(retained.retainedOwnerReview, false)
      assert.equal(retained.retainedAgentReview, true)
      assert.match(logs.join('\n'), /AI 对照 ASR 判定/u)
      assert.doesNotMatch(logs.join('\n'), /Owner/u)
    } else await assert.rejects(result, scenario === 'overlap' ? /overlapping playback/u : /boundary basis/u)
    assert.deepEqual(readFileSync(fixture.file), before)
  })
}
