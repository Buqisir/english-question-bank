import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { retainOwnerListening } from './lib-finish-owner-listening.mjs'

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
