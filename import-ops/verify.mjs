#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANALYSIS_KEYS,
  format2ComparisonFile,
  format2QaArtifactFile,
  homeLists,
  isOpsVisible,
  listOpsPapers,
  probePaper,
  qaLinks,
  shipPrompt,
  statusOf,
} from './lib/probe.mjs'
import {
  createFormat2ImportJobRuntime,
} from '../server/paper-import/internal/format2ImportJobRuntime.mjs'
import {
  makeFormat2ImportJobFixture,
} from '../test-fixtures/paper-import/format2-import-job-v1/fixture.mjs'
import {
  SHIP_COMMAND,
  evaluateShip,
  writeShipFailedReceipt,
  writeShippedReceipt,
} from '../scripts/import-pipeline/ship-checklist.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const html = readFileSync(path.join(here, 'public/index.html'), 'utf8')
const serverSrc = readFileSync(path.join(here, 'server.mjs'), 'utf8')

async function freePort() {
  const server = createNetServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  assert.ok(port)
  return port
}

async function waitForHealth(origin) {
  let lastError = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw lastError || new Error('import-ops server did not become healthy')
}

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

const format2Fixture = makeFormat2ImportJobFixture({
  sourceDir: path.join(root, 'format2-fixture-sources'),
})
const format2Result = createFormat2ImportJobRuntime({ repositoryRoot: root })
  .startOrContinueFormat2ImportJob(format2Fixture.input)
assert.equal(format2Result.lifecycle, 'importing')

const format2QaFixture = makeFormat2ImportJobFixture({
  sourceDir: path.join(root, 'format2-qa-fixture-sources'),
  paperId: 'paper-format2-qa',
  writerId: 'import-ops-format2-qa-writer',
})
const format2QaRuntime = createFormat2ImportJobRuntime({ repositoryRoot: root })
const format2QaStart = format2QaRuntime.startOrContinueFormat2ImportJob(
  format2QaFixture.input,
)
const format2QaCandidate = JSON.parse(readFileSync(path.join(
  root,
  'scripts/import-pipeline/papers',
  format2QaFixture.input.paperId,
  format2QaStart.artifacts.candidatePackage.relativePath,
), 'utf8'))
const format2QaResult = format2QaRuntime.resumeFormat2ImportJob({
  paperId: format2QaFixture.input.paperId,
  jobId: format2QaStart.jobId,
  teacherConfirmation: {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: format2QaCandidate.packageDigest,
    decisions: format2QaCandidate.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: structuredClone(observation.owner),
      disposition: 'confirmed',
      selectedCandidateDigest: format2QaCandidate.candidates.find(
        (candidate) => candidate.observationId === observation.observationId,
      ).candidateDigest,
    })),
  },
})
assert.equal(format2QaResult.lifecycle, 'awaiting_qa')

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
const format2Importing = probePaper({
  repoRoot: root,
  paperId: format2Fixture.input.paperId,
})
const format2AwaitingQa = probePaper({
  repoRoot: root,
  paperId: format2QaFixture.input.paperId,
})

assert.equal(queued.status, 'queued')
assert.equal(importing.status, 'importing')
assert.equal(importing.analyses, true)
assert.equal(importing.writingReady, true, 'historical papers do not require staged writing analysis')
assert.equal(format2Importing.status, 'importing')
assert.equal(format2Importing.source, true)
assert.deepEqual(format2Importing.format2Stop, {
  lifecycle: 'importing',
  stopCode: 'exact_teacher_confirmation_required',
  packageDigest: format2Result.artifacts.candidatePackage.packageDigest,
  comparisonEntryPoint: '/papers/paper-format2-synthetic/format2-comparison',
  resumeInstruction: format2Result.humanEntryPoints.resumeInstruction,
})
assert.equal(JSON.stringify(format2Importing.format2Stop).includes('Short synthetic passage'), false)
assert.equal(JSON.stringify(format2Importing.format2Stop).includes('officialAnswers'), false)
assert.equal(format2AwaitingQa.status, 'awaiting_qa')
assert.equal(format2AwaitingQa.format2Stop, null)
assert.equal(format2AwaitingQa.format2Qa.lifecycle, 'awaiting_qa')
assert.equal(format2AwaitingQa.format2Qa.publication.publicationDigest,
  format2QaResult.canonicalPublication.publicationDigest)
assert.equal(format2AwaitingQa.format2Qa.entryPoints.firstFocusState.paperId,
  format2QaFixture.input.paperId)
const exactComparisonPath = path.join(
  root,
  'scripts/import-pipeline/papers',
  format2Fixture.input.paperId,
  format2Result.artifacts.comparison.relativePath,
)
assert.equal(
  format2ComparisonFile({ repoRoot: root, paperId: format2Fixture.input.paperId }),
  exactComparisonPath,
)
const exactComparisonBytes = readFileSync(exactComparisonPath)
writeFileSync(exactComparisonPath, Buffer.concat([exactComparisonBytes, Buffer.from('tampered')]))
assert.equal(
  format2ComparisonFile({ repoRoot: root, paperId: format2Fixture.input.paperId }),
  null,
  'console must not serve a comparison page whose exact receipt digest changed',
)
writeFileSync(exactComparisonPath, exactComparisonBytes)
assert.equal(format2ComparisonFile({ repoRoot: root, paperId: '../unsafe' }), null)

const format3Dir = paperDir(root, 'paper-format3-writing')
writeFileSync(
  path.join(format3Dir, 'config.json'),
  JSON.stringify({ paperId: 'paper-format3-writing', format: '3', provenance: { paperName: '格式③写作锁' } }),
)
writeFileSync(path.join(format3Dir, 'groups.json'), '{}')
const format3Missing = probePaper({ repoRoot: root, paperId: 'paper-format3-writing' })
assert.equal(format3Missing.format3, true)
assert.equal(format3Missing.writingReady, false, 'format ③ without writing drafts is not ready')
for (const key of ['application', 'continuation']) {
  writeFileSync(path.join(format3Dir, `analysis-${key}.json`), '{}')
}
const format3Staged = probePaper({ repoRoot: root, paperId: 'paper-format3-writing' })
assert.equal(format3Staged.writingAnalyses, true)
assert.equal(format3Staged.writingReady, true, 'format ③ with both writing drafts is ready before publish')
writeLatest(root, 'paper-format3-writing')
const format3PublishedMissing = probePaper({ repoRoot: root, paperId: 'paper-format3-writing' })
assert.equal(format3PublishedMissing.writingReady, false, 'format ③ latest without writing-analysis-v1 is not ready')
mkdirSync(path.join(root, 'app/public/paper-assets/paper-format3-writing/latest/analyses'), { recursive: true })
writeFileSync(
  path.join(root, 'app/public/paper-assets/paper-format3-writing/latest/analyses/writing-analysis-v1.json'),
  '{}',
)
const format3Published = probePaper({ repoRoot: root, paperId: 'paper-format3-writing' })
assert.equal(format3Published.writingReady, true)
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
const format2Qa = qaLinks(format2AwaitingQa, 'http://127.0.0.1:5173')
assert.equal(format2Qa.screen,
  'http://127.0.0.1:5173/?view=paper-browse&paperId=paper-format2-qa')
for (const key of ['studentPrint', 'teacherPrint', 'pdf']) {
  const entry = format2Qa[key]
  assert.equal(entry.kind, 'artifact_url')
  assert.equal(entry.method, 'GET')
  assert.equal(new URL(entry.href).origin, format2QaResult.humanEntryPoints.service.qaArtifactOrigin)
  assert.equal(entry.sha256, format2QaResult.artifacts.qa[key].sha256)
  assert.equal(entry.byteLength, format2QaResult.artifacts.qa[key].byteLength)
  assert.equal(entry.mediaType, format2QaResult.artifacts.qa[key].mediaType)
}
assert.match(format2Qa.studentPrint.mediaType, /^text\/html/u)
assert.match(format2Qa.teacherPrint.mediaType, /^text\/html/u)
assert.equal(format2Qa.pdf.mediaType, 'application/pdf')
assert.deepEqual(format2Qa.firstFocusState, format2QaResult.humanEntryPoints.firstFocusState)
assert.equal(format2Qa.gateSummary, format2QaResult.humanEntryPoints.gateSummary)
assert.deepEqual(format2Qa.service, format2QaResult.humanEntryPoints.service)
assert.deepEqual(format2Qa.qaAcceptance, format2QaResult.humanEntryPoints.qaAcceptance)
assert.match(format2Qa.note, /不写 Owner QA 收据/u)
assert.equal(qaLinks(blocked, 'http://127.0.0.1:5173').screen, null)

const opsPort = await freePort()
const opsOrigin = `http://127.0.0.1:${opsPort}`
const initialCurrentPath = path.join(
  root,
  'scripts/import-pipeline/papers',
  format2QaFixture.input.paperId,
  'job/current.json',
)
const initialCurrentBytes = readFileSync(initialCurrentPath)
const studentArtifactPath = path.join(
  root,
  'scripts/import-pipeline/papers',
  format2QaFixture.input.paperId,
  format2QaResult.artifacts.qa.studentPrint.relativePath,
)
const exactStudentBytes = readFileSync(studentArtifactPath)
const opsServer = spawn(process.execPath, [path.join(here, 'server.mjs')], {
  cwd: path.join(here, '..'),
  env: { ...process.env, EQB_ROOT: root, IMPORT_OPS_PORT: String(opsPort) },
  stdio: 'ignore',
})
try {
  await waitForHealth(opsOrigin)
  for (const key of ['studentPrint', 'teacherPrint', 'pdf']) {
    const entry = format2Qa[key]
    const url = new URL(entry.href)
    const response = await fetch(`${opsOrigin}${url.pathname}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), entry.mediaType)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.byteLength, entry.byteLength)
    assert.deepEqual(bytes, readFileSync(path.join(
      root,
      'scripts/import-pipeline/papers',
      format2QaFixture.input.paperId,
      format2QaResult.artifacts.qa[key].relativePath,
    )))
    if (key === 'studentPrint') {
      assert.equal(bytes.toString('utf8').includes('<strong>【答案】</strong>'), false)
      assert.equal(bytes.toString('utf8').includes('Analysis sentinel'), false)
    } else if (key === 'teacherPrint') {
      assert.equal(bytes.toString('utf8').includes('<strong>【答案】</strong>'), true)
    } else {
      assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
    }
  }
  const support = format2QaResult.artifacts.qa.support[0]
  if (support) {
    const supportResponse = await fetch(`${opsOrigin}/papers/${format2QaFixture.input.paperId}/format2-qa/${support.fileName}`)
    assert.equal(supportResponse.status, 200)
    assert.equal(supportResponse.headers.get('content-type'), support.mediaType)
    assert.deepEqual(
      Buffer.from(await supportResponse.arrayBuffer()),
      readFileSync(path.join(root, 'scripts/import-pipeline/papers', format2QaFixture.input.paperId, support.relativePath)),
    )
  }
  assert.equal(
    (await fetch(`${opsOrigin}/papers/${format2QaFixture.input.paperId}/format2-qa/%2e%2e%2fcurrent.json`)).status,
    404,
  )
  try {
    writeFileSync(studentArtifactPath, Buffer.concat([exactStudentBytes, Buffer.from('tampered')]))
    assert.equal(
      (await fetch(`${opsOrigin}/papers/${format2QaFixture.input.paperId}/format2-qa/student-print`)).status,
      404,
      'artifact GET rejects wrong bytes for the receipt digest',
    )
  } finally {
    writeFileSync(studentArtifactPath, exactStudentBytes)
  }
  try {
    const staleCurrent = JSON.parse(initialCurrentBytes)
    staleCurrent.result.jobId = 'format2-job:stale-receipt-fixture'
    writeFileSync(initialCurrentPath, `${JSON.stringify(staleCurrent, null, 2)}\n`)
    assert.equal(
      (await fetch(`${opsOrigin}/papers/${format2QaFixture.input.paperId}/format2-qa/student-print`)).status,
      404,
      'artifact GET rejects a stale Job receipt identity',
    )
  } finally {
    writeFileSync(initialCurrentPath, initialCurrentBytes)
  }
} finally {
  opsServer.kill('SIGTERM')
  await new Promise((resolve) => opsServer.once('exit', resolve))
}

assert.equal(format2QaArtifactFile({
  repoRoot: root,
  paperId: format2QaFixture.input.paperId,
  artifactName: '../current.json',
}), null)
writeFileSync(studentArtifactPath, Buffer.concat([exactStudentBytes, Buffer.from('tampered')]))
assert.equal(format2QaArtifactFile({
  repoRoot: root,
  paperId: format2QaFixture.input.paperId,
  artifactName: 'student-print',
}), null, 'artifact GET must reject an exact digest mismatch')
writeFileSync(studentArtifactPath, exactStudentBytes)

const initialQaReceipt = {
  ...format2QaResult.humanEntryPoints.qaAcceptance.expectedReceipt,
  acceptedAt: '2026-08-25T00:00:00.000Z',
}
const format2QaPaperDir = path.join(
  root,
  'scripts/import-pipeline/papers',
  format2QaFixture.input.paperId,
)
const qaAcceptedPath = path.join(format2QaPaperDir, 'signals/qa-accepted.json')
writeFileSync(qaAcceptedPath, `${JSON.stringify(initialQaReceipt, null, 2)}\n`)
assert.equal(probePaper({ repoRoot: root, paperId: format2QaFixture.input.paperId }).status, 'ready_to_ship')
writeFileSync(studentArtifactPath, Buffer.concat([exactStudentBytes, Buffer.from('tampered')]))
const tamperedQaProbe = probePaper({ repoRoot: root, paperId: format2QaFixture.input.paperId })
assert.equal(tamperedQaProbe.qaAccepted, false)
assert.equal(tamperedQaProbe.status, 'awaiting_qa')
assert.equal(tamperedQaProbe.gatesGreen, false)
writeFileSync(studentArtifactPath, exactStudentBytes)
assert.equal(probePaper({ repoRoot: root, paperId: format2QaFixture.input.paperId }).status, 'ready_to_ship')

const changedQaInput = structuredClone(format2QaFixture.input)
const sourceVisual = changedQaInput.transcription.visuals[0]
sourceVisual.alternatives.push({
  method: 'vector_authored',
  trigger: { kind: 'owner_request', note: 'Fixture requests one unselected comparison candidate.' },
  artifact: structuredClone(changedQaInput.transcription.visuals[1].sourceCrop),
  sourceTruthChecklist: structuredClone(sourceVisual.sourceTruthChecklist),
  reproducibility: {
    editableVector: '<svg viewBox="0 0 1 1"></svg>',
    tool: 'deterministic-fixture-exporter-v1',
    exportSettings: 'PNG fixture export',
  },
})
const changedQaStart = format2QaRuntime.startOrContinueFormat2ImportJob(changedQaInput)
assert.equal(changedQaStart.lifecycle, 'importing')
assert.notEqual(changedQaStart.jobId, format2QaResult.jobId)
assert.equal(
  existsSync(qaAcceptedPath),
  false,
  'a new Job identity removes the old Owner QA receipt before confirmation',
)
const changedQaCandidate = JSON.parse(readFileSync(path.join(
  format2QaPaperDir,
  changedQaStart.artifacts.candidatePackage.relativePath,
), 'utf8'))
const changedQaResult = format2QaRuntime.resumeFormat2ImportJob({
  paperId: changedQaInput.paperId,
  jobId: changedQaStart.jobId,
  teacherConfirmation: {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: changedQaCandidate.packageDigest,
    decisions: changedQaCandidate.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: structuredClone(observation.owner),
      disposition: 'confirmed',
      selectedCandidateDigest: changedQaCandidate.candidates.find((candidate) => (
        candidate.observationId === observation.observationId
        && candidate.method === 'source_crop'
      )).candidateDigest,
    })),
  },
})
assert.equal(changedQaResult.lifecycle, 'awaiting_qa')
writeFileSync(qaAcceptedPath, `${JSON.stringify(initialQaReceipt, null, 2)}\n`)
const staleQaProbe = probePaper({ repoRoot: root, paperId: format2QaFixture.input.paperId })
assert.equal(staleQaProbe.qaAccepted, false)
assert.equal(staleQaProbe.status, 'awaiting_qa')
assert.notEqual(
  changedQaResult.humanEntryPoints.qaAcceptance.expectedReceipt.qaIdentityDigest,
  initialQaReceipt.qaIdentityDigest,
)
assert.equal(format2QaArtifactFile({
  repoRoot: root,
  paperId: format2QaFixture.input.paperId,
  artifactName: 'student-print',
})?.filePath.endsWith('student-print.html'), true)
const changedCurrentBytes = readFileSync(initialCurrentPath)
writeFileSync(initialCurrentPath, '{ invalid current receipt')
const invalidCurrentProbe = probePaper({ repoRoot: root, paperId: format2QaFixture.input.paperId })
assert.equal(invalidCurrentProbe.qaAccepted, false)
assert.equal(invalidCurrentProbe.status, 'awaiting_qa')
writeFileSync(initialCurrentPath, changedCurrentBytes)
unlinkSync(qaAcceptedPath)

assert.equal(html.includes('pull-run-push'), false)
assert.equal(html.includes('无生产按钮'), true)
assert.equal(html.includes('这里没有按钮'), true)
assert.equal(html.includes('Screen 预览'), true)
assert.equal(html.includes('Student Print'), true)
assert.equal(html.includes('Teacher Print'), true)
assert.equal(html.includes("qaAction('PDF', qa.pdf)"), true)
assert.equal(html.includes('<strong>Service</strong>'), true)
assert.equal(html.includes('<strong>First focus state</strong>'), true)
assert.equal(html.includes('<strong>Gate summary</strong>'), true)
assert.equal(html.includes('entry.mediaType'), true)
assert.equal(html.includes('entry.sha256'), true)
assert.equal(html.includes('不对答案表'), true)
assert.equal(html.includes('重试上线'), true)
assert.equal(html.includes('未到可上线'), true)
assert.equal(html.includes('Exact Teacher Confirmation'), true)
assert.equal(html.includes('按正常尺寸比较'), true)
assert.equal(/push<\/button>/.test(html), false)
assert.equal(serverSrc.includes("request.method !== 'GET'"), true)
assert.equal(serverSrc.includes('format2ComparisonFile'), true)
assert.equal(serverSrc.includes('format2QaArtifactFile'), true)
assert.equal(serverSrc.includes('format2-qa'), true)
assert.equal(serverSrc.includes('sendBytes'), true)
assert.equal(statusOf({ shipped: true, blocked: { code: 'x' } }), 'shipped')

const contract = readFileSync(path.join(here, '../docs/import/agent-contract.md'), 'utf8')
assert.equal(contract.includes('上线清单见后续切片'), false)
assert.equal(contract.includes('本切片不做'), false)
assert.equal(contract.includes('ship-checklist.mjs'), true)
assert.equal(contract.includes('--owner-said-ship'), true)

assert.deepEqual(listOpsPapers(root).map((p) => p.paperId).sort(), [
  'paper-awaiting-qa',
  'paper-format1-blocked',
  'paper-format2-qa',
  'paper-format2-synthetic',
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
