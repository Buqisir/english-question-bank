#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
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
  statusOf,
} from './lib/probe.mjs'

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
assert.equal(legacy.status, 'importing')
assert.equal(isOpsVisible(legacy), false, '库内无 signals 的旧卷不进导题后台')
assert.equal(isOpsVisible(leftover), false, '仅有 config、无源/切卷/信号的旧目录不进后台')
assert.equal(isOpsVisible(queued), true)
assert.equal(isOpsVisible(blocked), true)

const lists = homeLists(
  [queued, importing, blocked, awaiting, ready, shipped].filter(isOpsVisible),
)
assert.deepEqual(lists.awaitingQa.map((p) => p.paperId), ['paper-awaiting-qa'])
assert.deepEqual(lists.failed.map((p) => p.paperId), ['paper-format1-blocked'])

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
assert.equal(/push<\/button>/.test(html), false)
assert.equal(serverSrc.includes("request.method !== 'GET'"), true)
assert.equal(statusOf({ shipped: true, blocked: { code: 'x' } }), 'shipped')

assert.deepEqual(listOpsPapers(root).map((p) => p.paperId).sort(), [
  'paper-awaiting-qa',
  'paper-format1-blocked',
  'paper-importing',
  'paper-queued',
  'paper-ready',
  'paper-shipped',
])

console.log('PASS import-ops six-state probes, visibility, QA links, read-only UI')
