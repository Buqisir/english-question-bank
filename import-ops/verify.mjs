#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANALYSIS_KEYS,
  homeLists,
  isOpsVisible,
  listOpsPapers,
  probePaper,
  qaLinks,
  shipPrompt,
  statusOf,
} from './lib/probe.mjs'
import {
  SHIP_COMMAND,
  evaluateShip,
  writeShipFailedReceipt,
  writeShippedReceipt,
} from '../scripts/import-pipeline/ship-checklist.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const html = readFileSync(path.join(here, 'public/index.html'), 'utf8')
const serverSrc = readFileSync(path.join(here, 'server.mjs'), 'utf8')

function paperDir(root, id) {
  const dir = path.join(root, 'scripts/import-pipeline/papers', id)
  mkdirSync(dir, { recursive: true })
  mkdirSync(path.join(dir, 'signals'), { recursive: true })
  return dir
}

function writeConfig(dir, paperId, paperName) {
  writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ paperId, provenance: { paperName } }),
  )
}

function writeLatest(root, paperId) {
  const latest = path.join(root, 'app/public/paper-assets', paperId, 'latest')
  mkdirSync(latest, { recursive: true })
  writeFileSync(path.join(latest, '.keep'), '')
}

const root = mkdtempSync(path.join(tmpdir(), 'eqb-import-ops-'))

const queuedId = 'paper-queued'
mkdirSync(path.join(root, 'scripts/import-pipeline/papers', queuedId), { recursive: true })
writeFileSync(path.join(root, 'scripts/import-pipeline/papers', queuedId, 'source.docx'), 'x')

const importingDir = paperDir(root, 'paper-importing')
writeConfig(importingDir, 'paper-importing', '导入中卷')
writeFileSync(path.join(importingDir, 'groups.json'), '{}')
for (const key of ANALYSIS_KEYS) {
  writeFileSync(path.join(importingDir, `analyze-${key}-combined.txt`), 'x')
  writeFileSync(path.join(importingDir, `analysis-${key}.json`), '{}')
}

const format1Dir = paperDir(root, 'paper-format1-blocked')
writeConfig(format1Dir, 'paper-format1-blocked', '格式①缺口')
writeFileSync(
  path.join(format1Dir, 'signals/blocked.json'),
  JSON.stringify({ code: 'canonical_unavailable', note: '禁止 --publish' }),
)

const qaDir = paperDir(root, 'paper-awaiting-qa')
writeConfig(qaDir, 'paper-awaiting-qa', '待 QA 卷')
writeFileSync(
  path.join(qaDir, 'signals/ai-answer-check.json'),
  JSON.stringify({ ok: true, method: 'source-markings-vs-answerKey' }),
)
writeLatest(root, 'paper-awaiting-qa')

const readyDir = paperDir(root, 'paper-ready')
writeConfig(readyDir, 'paper-ready', '可上线卷')
writeFileSync(path.join(readyDir, 'signals/ai-answer-check.json'), JSON.stringify({ ok: true }))
writeFileSync(path.join(readyDir, 'signals/qa-accepted.json'), JSON.stringify({ by: 'owner' }))
writeLatest(root, 'paper-ready')

const shippedDir = paperDir(root, 'paper-shipped')
writeConfig(shippedDir, 'paper-shipped', '已上线卷')
writeFileSync(path.join(shippedDir, 'signals/shipped.json'), JSON.stringify({ command: 'push' }))
writeLatest(root, 'paper-shipped')

const shipFailedDir = paperDir(root, 'paper-ship-failed')
writeConfig(shipFailedDir, 'paper-ship-failed', '上线失败卷')
writeFileSync(path.join(shipFailedDir, 'signals/ai-answer-check.json'), JSON.stringify({ ok: true }))
writeFileSync(path.join(shipFailedDir, 'signals/qa-accepted.json'), JSON.stringify({ by: 'owner' }))
writeFileSync(
  path.join(shipFailedDir, 'signals/blocked.json'),
  JSON.stringify({ code: 'ship_failed', note: 'push 中途失败' }),
)
writeLatest(root, 'paper-ship-failed')

const legacyDir = paperDir(root, 'paper-legacy')
writeConfig(legacyDir, 'paper-legacy', '库内旧卷')
writeLatest(root, 'paper-legacy')

const leftoverDir = paperDir(root, 'paper-leftover-config')
writeConfig(leftoverDir, 'paper-leftover-config', '仅有 config 的旧目录')

const queued = probePaper({ repoRoot: root, paperId: queuedId })
const importing = probePaper({ repoRoot: root, paperId: 'paper-importing' })
const blocked = probePaper({ repoRoot: root, paperId: 'paper-format1-blocked' })
const awaiting = probePaper({ repoRoot: root, paperId: 'paper-awaiting-qa' })
const ready = probePaper({ repoRoot: root, paperId: 'paper-ready' })
const shipped = probePaper({ repoRoot: root, paperId: 'paper-shipped' })
const shipFailed = probePaper({ repoRoot: root, paperId: 'paper-ship-failed' })
const legacy = probePaper({ repoRoot: root, paperId: 'paper-legacy' })
const leftover = probePaper({ repoRoot: root, paperId: 'paper-leftover-config' })

assert.equal(queued.status, 'queued')
assert.equal(importing.status, 'importing')
assert.equal(importing.analyses, true)
assert.equal(blocked.status, 'failed')
assert.equal(blocked.latest, false, '格式①无 latest 不得进 awaiting_qa')
assert.equal(blocked.blocked.code, 'canonical_unavailable')
assert.equal(awaiting.status, 'awaiting_qa')
assert.equal(ready.status, 'ready_to_ship')
assert.equal(shipped.status, 'shipped')
assert.equal(shipFailed.status, 'failed')
assert.equal(shipFailed.blocked.code, 'ship_failed')
assert.equal(legacy.status, 'importing')
assert.equal(isOpsVisible(legacy), false, '库内无 signals 的旧卷不进导题后台')
assert.equal(isOpsVisible(leftover), false, '仅有 config、无源/切卷/信号的旧目录不进后台')
assert.equal(isOpsVisible(queued), true)
assert.equal(isOpsVisible(blocked), true)
assert.equal(isOpsVisible(shipFailed), true)

const lists = homeLists(
  [queued, importing, blocked, awaiting, ready, shipped, shipFailed].filter(isOpsVisible),
)
assert.deepEqual(lists.awaitingQa.map((p) => p.paperId), ['paper-awaiting-qa'])
assert.deepEqual(lists.failed.map((p) => p.paperId).sort(), [
  'paper-format1-blocked',
  'paper-ship-failed',
])

const qa = qaLinks(awaiting, 'http://127.0.0.1:5173')
assert.match(qa.screen, /view=paper-browse/)
assert.match(qa.screen, /paper-awaiting-qa/)
assert.equal(qaLinks(blocked, 'http://127.0.0.1:5173').screen, null)

assert.equal(html.includes('pull-run-push'), false)
assert.equal(html.includes('无生产按钮'), true)
assert.equal(html.includes('这里没有按钮'), true)
assert.equal(html.includes('Screen 预览'), true)
assert.equal(html.includes('Student Print'), true)
assert.equal(html.includes('Teacher Print'), true)
assert.equal(html.includes('不对答案表'), true)
assert.equal(html.includes('重试上线'), true)
assert.equal(html.includes('未到可上线'), true)
assert.equal(/push<\/button>/.test(html), false)
assert.equal(serverSrc.includes("request.method !== 'GET'"), true)
assert.equal(statusOf({ shipped: true, blocked: { code: 'x' } }), 'shipped')

const contract = readFileSync(path.join(here, '../docs/import/agent-contract.md'), 'utf8')
assert.equal(contract.includes('上线清单见后续切片'), false)
assert.equal(contract.includes('本切片不做'), false)
assert.equal(contract.includes('ship-checklist.mjs'), true)
assert.equal(contract.includes('--owner-said-ship'), true)

assert.deepEqual(listOpsPapers(root).map((p) => p.paperId).sort(), [
  'paper-awaiting-qa',
  'paper-format1-blocked',
  'paper-importing',
  'paper-queued',
  'paper-ready',
  'paper-ship-failed',
  'paper-shipped',
])

assert.deepEqual(shipPrompt(ready), { kind: 'ship', say: '上线 paper-ready' })
assert.deepEqual(shipPrompt(shipFailed), { kind: 'retry', say: '重试上线 paper-ship-failed' })
assert.equal(shipPrompt(awaiting).say, null)
assert.equal(shipPrompt(shipped).say, null)

const checklistSrc = readFileSync(
  path.join(here, '../scripts/import-pipeline/ship-checklist.mjs'),
  'utf8',
)
assert.equal(checklistSrc.includes('spawnSync'), false)
assert.equal(checklistSrc.includes('execFile'), false)
assert.equal(checklistSrc.includes('child_process'), false)
assert.equal(checklistSrc.includes(SHIP_COMMAND), true)
assert.match(checklistSrc, /本清单不执行 push/)

const refusedNotReady = evaluateShip({
  repoRoot: root,
  paperId: 'paper-awaiting-qa',
  ownerSaid: 'ship',
})
assert.equal(refusedNotReady.ok, false)
assert.equal(refusedNotReady.code, 'not_ready_to_ship')
assert.match(refusedNotReady.message, /拒绝 push/)

const refusedNoVerbal = evaluateShip({
  repoRoot: root,
  paperId: 'paper-ready',
  ownerSaid: null,
})
assert.equal(refusedNoVerbal.ok, false)
assert.equal(refusedNoVerbal.code, 'requires_verbal_ship')

const allowed = evaluateShip({
  repoRoot: root,
  paperId: 'paper-ready',
  ownerSaid: 'ship',
})
assert.equal(allowed.ok, true)
assert.equal(allowed.command, SHIP_COMMAND)
assert.match(allowed.disclosure, /question-bank\.sqlite/)
assert.match(allowed.disclosure, /bak\.<stamp>/)
assert.match(allowed.disclosure, /无自动回滚/)
assert.match(allowed.disclosure, /本机其他未上线改动会一并上去/)
assert.match(allowed.disclosure, /go-live-record/)
assert.match(allowed.disclosure, /不是 deploy\.sh/)
assert.match(allowed.message, /不执行 push/)

const refusedWrongRetryToken = evaluateShip({
  repoRoot: root,
  paperId: 'paper-ship-failed',
  ownerSaid: 'ship',
})
assert.equal(refusedWrongRetryToken.ok, false)
assert.equal(refusedWrongRetryToken.code, 'retry_requires_verbal')

const retryAllowed = evaluateShip({
  repoRoot: root,
  paperId: 'paper-ship-failed',
  ownerSaid: 'retry-ship',
})
assert.equal(retryAllowed.ok, true)

const checklistPath = path.join(here, '../scripts/import-pipeline/ship-checklist.mjs')
const cliRefuse = spawnSync(
  process.execPath,
  [checklistPath, 'check', 'paper-awaiting-qa', '--owner-said-ship'],
  { env: { ...process.env, EQB_ROOT: root }, encoding: 'utf8' },
)
assert.notEqual(cliRefuse.status, 0)
assert.match(`${cliRefuse.stdout}${cliRefuse.stderr}`, /not_ready_to_ship|不是 ready_to_ship/)
assert.doesNotMatch(`${cliRefuse.stdout}${cliRefuse.stderr}`, /push complete/)

const cliAllow = spawnSync(
  process.execPath,
  [checklistPath, 'check', 'paper-ready', '--owner-said-ship'],
  { env: { ...process.env, EQB_ROOT: root }, encoding: 'utf8' },
)
assert.equal(cliAllow.status, 0)
assert.match(cliAllow.stdout, /允许/)
assert.match(cliAllow.stdout, /本清单不执行/)
assert.equal(cliAllow.stdout.includes('spawn'), false)

const recordTarget = 'paper-ready'
const failedWrite = writeShipFailedReceipt({
  repoRoot: root,
  paperId: recordTarget,
  note: 'fixture ship_failed',
})
assert.equal(failedWrite.ok, true)
const afterFail = probePaper({ repoRoot: root, paperId: recordTarget })
assert.equal(afterFail.status, 'failed')
assert.equal(afterFail.blocked.code, 'ship_failed')

const shippedWrite = writeShippedReceipt({ repoRoot: root, paperId: recordTarget })
assert.equal(shippedWrite.ok, true)
assert.equal(probePaper({ repoRoot: root, paperId: recordTarget }).status, 'shipped')

const refuseFailedReceipt = writeShipFailedReceipt({
  repoRoot: root,
  paperId: 'paper-awaiting-qa',
})
assert.equal(refuseFailedReceipt.ok, false)
assert.equal(refuseFailedReceipt.code, 'not_ready_to_ship')

console.log('PASS import-ops six-state probes, visibility, QA links, read-only UI, ship checklist refuse')
