#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createImportReviewStore,
  reviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import { evaluateShip } from '../scripts/import-pipeline/ship-checklist.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function fixtureProjection(rootDir) {
  const identity = JSON.parse(readFileSync(path.join(rootDir, 'projection.json'), 'utf8'))
  return {
    ...identity,
    consumption: {
      visibleStructure: [{
        kind: 'group',
        slotId: 'reading.a',
        groupId: identity.groupId,
        familyContractId: 'reading',
      }],
    },
  }
}

function manifest({
  paperId = 'paper-mock-review-2026-m1',
  candidate = 'a',
  groupId = 'group:reading-a',
  resolvesIssueIds = [],
} = {}) {
  const identity = {
    paperId,
    paperName: '网页审核测试卷',
    sourceDigest: `sha256:${'1'.repeat(64)}`,
    candidateDigest: `sha256:${candidate.repeat(64)}`,
    visibleStructureDigest: `sha256:${(
      candidate === 'a' ? '2' : candidate === 'b' ? '3' : candidate === 'c' ? '4' : '5'
    ).repeat(64)}`,
    groupId,
  }
  const bytes = Buffer.from(`${JSON.stringify(identity)}\n`)
  const input = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId,
    paperName: identity.paperName,
    sourceDigest: identity.sourceDigest,
    candidateDigest: identity.candidateDigest,
    visibleStructureDigest: identity.visibleStructureDigest,
    producerBuildId: `producer-${candidate}`,
    files: [{
      path: 'projection.json',
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      mediaType: 'application/json',
      role: 'materialization',
    }],
    resolvesIssueIds,
  }
  return { bytes, input: { ...input, bundleDigest: reviewBundleDigest(input) } }
}

function upload(store, created, bytes) {
  const target = store.fileForUpload(created.revision.id, 'projection.json')
  writeFileSync(target.destination, bytes)
  store.completeFileUpload(created.revision.id, 'projection.json', {
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  })
}

function makeStore(root) {
  return createImportReviewStore({
    dbPath: path.join(root, 'review.sqlite'),
    filesRoot: path.join(root, 'files'),
    rendererBuildId: 'renderer-test',
    projectRevision: fixtureProjection,
  })
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-import-review-'))
try {
  const store = makeStore(tempRoot)
  const first = manifest()
  const traversal = structuredClone(first.input)
  traversal.files[0].path = '../projection.json'
  assert.throws(
    () => store.createRevision(traversal),
    (error) => error.code === 'IMPORT_REVIEW_PATH_INVALID',
    'manifest path traversal fails closed',
  )

  const createdFirst = store.createRevision(first.input)
  assert.equal(createdFirst.created, true)
  assert.deepEqual(createdFirst.missingFiles, ['projection.json'])
  assert.throws(
    () => store.finalizeRevision(createdFirst.revision.id),
    (error) => error.code === 'IMPORT_REVIEW_UPLOAD_INCOMPLETE',
    'incomplete upload cannot finalize',
  )
  const idempotent = store.createRevision(first.input)
  assert.equal(idempotent.created, false)
  assert.equal(idempotent.revision.id, createdFirst.revision.id)

  const firstTarget = store.fileForUpload(createdFirst.revision.id, 'projection.json')
  writeFileSync(firstTarget.destination, first.bytes)
  assert.throws(
    () => store.completeFileUpload(createdFirst.revision.id, 'projection.json', {
      sha256: `sha256:${'f'.repeat(64)}`,
      byteLength: first.bytes.byteLength,
    }),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'wrong upload digest is rejected',
  )
  store.completeFileUpload(createdFirst.revision.id, 'projection.json', {
    sha256: sha256(first.bytes),
    byteLength: first.bytes.byteLength,
  })
  const finalizedFirst = store.finalizeRevision(createdFirst.revision.id)
  assert.equal(finalizedFirst.state, 'awaiting_review')
  assert.equal(finalizedFirst.rendererBuildId, 'renderer-test')
  assert.throws(
    () => store.fileForUpload(createdFirst.revision.id, 'projection.json'),
    (error) => error.code === 'IMPORT_REVIEW_REVISION_IMMUTABLE',
    'finalized revision is immutable',
  )
  assert.equal(store.paperDetail(first.input.paperId).visibleStructure[0].groupId, 'group:reading-a')

  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedFirst.id,
      surface: 'screen',
      message: '没有定位',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_TARGET_REQUIRED',
    'an issue requires a semantic target or page',
  )
  let detail = store.createIssue(first.input.paperId, {
    revisionId: finalizedFirst.id,
    surface: 'screen',
    groupId: 'group:reading-a',
    message: '第 1 段漏了一句',
  }, 'owner')
  const issueId = detail.issues[0].id
  assert.equal(detail.latest.state, 'changes_requested')
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedFirst.id,
      { bundleDigest: finalizedFirst.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_ISSUES_UNRESOLVED',
    'open issues block approval',
  )
  detail = store.addIssueMessage(
    first.input.paperId,
    issueId,
    { message: '我会按原文补回。' },
    'import-agent',
    'agent',
  )
  assert.equal(detail.issueMessages[0].authorKind, 'agent')

  const second = manifest({ candidate: 'b', resolvesIssueIds: [issueId] })
  const createdSecond = store.createRevision(second.input)
  upload(store, createdSecond, second.bytes)
  const finalizedSecond = store.finalizeRevision(createdSecond.revision.id)
  detail = store.paperDetail(first.input.paperId)
  assert.equal(detail.revisions.find((revision) => revision.id === finalizedFirst.id).state, 'superseded')
  assert.equal(detail.issues[0].state, 'fixed_pending_review')
  assert.equal(detail.issues[0].resolutionRevisionId, finalizedSecond.id)
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedSecond.id,
      { bundleDigest: finalizedSecond.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_ISSUES_UNRESOLVED',
    'Agent-marked fixes still require Owner verification',
  )
  store.updateIssue(first.input.paperId, issueId, { action: 'close' })
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedSecond.id,
      { bundleDigest: first.input.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_STALE_REVISION',
    'approval must carry the browser-visible current digest',
  )
  const approval = store.approveRevision(
    first.input.paperId,
    finalizedSecond.id,
    { bundleDigest: finalizedSecond.bundleDigest },
    'owner',
  )
  assert.equal(approval.candidateDigest, second.input.candidateDigest)
  assert.equal(store.agentPaperStatus(first.input.paperId).approval.approvalId, approval.approvalId)

  detail = store.createIssue(first.input.paperId, {
    revisionId: finalizedSecond.id,
    surface: 'teacher_print',
    pageNumber: 2,
    message: '教师版页尾需要再核对',
  }, 'owner')
  const secondIssueId = detail.issues.find((issue) => issue.id !== issueId).id
  assert.equal(detail.latest.approval, null, 'a new issue invalidates approval')
  store.updateIssue(first.input.paperId, secondIssueId, { action: 'dismiss' })
  const renewed = store.approveRevision(
    first.input.paperId,
    finalizedSecond.id,
    { bundleDigest: finalizedSecond.bundleDigest },
    'owner',
  )
  assert.notEqual(renewed.approvalId, approval.approvalId)

  const third = manifest({ candidate: 'c', groupId: 'group:reading-b' })
  const shippingGuard = store.acquireShippingGuard(
    first.input.paperId,
    renewed,
    'import-agent-token',
  )
  assert.equal(shippingGuard.revisionId, finalizedSecond.id)
  assert.throws(
    () => store.createRevision(third.input),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks a new revision after the deployment check',
  )
  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedSecond.id,
      surface: 'screen',
      questionId: 'question:22',
      message: '上线锁持有期间不能撤销认可',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks issue creation that would revoke approval',
  )
  assert.throws(
    () => store.updateIssue(first.input.paperId, secondIssueId, { action: 'reopen' }),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks issue-state changes that would revoke approval',
  )
  assert.throws(
    () => store.releaseShippingGuard(
      first.input.paperId,
      shippingGuard.id,
      'another-agent',
    ),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_GUARD_MISMATCH',
    'only the acquiring Agent can release a shipping guard',
  )
  assert.deepEqual(
    store.releaseShippingGuard(first.input.paperId, shippingGuard.id, 'import-agent-token'),
    { released: true },
  )
  const createdThird = store.createRevision(third.input)
  upload(store, createdThird, third.bytes)
  store.finalizeRevision(createdThird.revision.id)
  assert.equal(store.agentPaperStatus(first.input.paperId).approval, null)
  assert.equal(store.paperDetail(first.input.paperId).latest.id, createdThird.revision.id)
  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedSecond.id,
      surface: 'screen',
      questionId: 'question:21',
      message: '不能补记到旧 revision',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_STALE_REVISION',
    'issue creation rechecks the latest revision inside its write transaction',
  )

  const concurrentPaperId = 'paper-mock-review-concurrent'
  const slowerEarlier = manifest({ paperId: concurrentPaperId, candidate: 'b' })
  const fasterLater = manifest({ paperId: concurrentPaperId, candidate: 'c' })
  const createdEarlier = store.createRevision(slowerEarlier.input)
  const createdLater = store.createRevision(fasterLater.input)
  upload(store, createdEarlier, slowerEarlier.bytes)
  upload(store, createdLater, fasterLater.bytes)
  const finalizedLater = store.finalizeRevision(createdLater.revision.id)
  const finalizedEarlier = store.finalizeRevision(createdEarlier.revision.id)
  assert.equal(finalizedLater.revisionNumber, 2)
  assert.equal(finalizedEarlier.state, 'superseded')
  assert.equal(
    store.paperDetail(concurrentPaperId).latest.id,
    finalizedLater.id,
    'an earlier upload finalized late cannot replace a higher finalized revision',
  )

  const tampered = manifest({ candidate: 'd', groupId: 'group:reading-c' })
  const createdTampered = store.createRevision(tampered.input)
  upload(store, createdTampered, tampered.bytes)
  writeFileSync(
    path.join(store.revisionDirectory(createdTampered.revision.id), 'projection.json'),
    Buffer.from('tampered'),
  )
  assert.throws(
    () => store.finalizeRevision(createdTampered.revision.id),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'finalize rechecks bytes after the upload handshake',
  )

  writeFileSync(
    path.join(store.revisionDirectory(finalizedFirst.id), 'projection.json'),
    Buffer.from('tampered after finalize'),
  )
  assert.throws(
    () => store.projectionForRevision(finalizedFirst.id),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'every preview read rechecks immutable file bytes even when projection is cached',
  )

  let activeRendererBuildId = 'renderer-test'
  const dynamicRendererStore = createImportReviewStore({
    dbPath: path.join(tempRoot, 'review.sqlite'),
    filesRoot: path.join(tempRoot, 'files'),
    rendererBuildId: () => activeRendererBuildId,
    projectRevision: fixtureProjection,
  })
  dynamicRendererStore.approveRevision(
    first.input.paperId,
    createdThird.revision.id,
    { bundleDigest: third.input.bundleDigest },
    'owner',
  )
  activeRendererBuildId = 'renderer-test-2'
  const rendererStaleStatus = dynamicRendererStore.agentPaperStatus(first.input.paperId)
  assert.equal(rendererStaleStatus.rendererStale, true)
  assert.equal(rendererStaleStatus.approval, null, 'renderer changes invalidate current Agent acceptance')
  assert.throws(
    () => dynamicRendererStore.approveRevision(
      first.input.paperId,
      createdThird.revision.id,
      { bundleDigest: third.input.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_RENDERER_STALE',
    'a renderer deployment invalidates approval of an older review revision',
  )
  const refreshedForRenderer = dynamicRendererStore.createRevision(third.input)
  assert.equal(
    refreshedForRenderer.created,
    true,
    'the same content bundle can become a fresh revision after the renderer changes',
  )
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const html = readFileSync(path.join(repoRoot, 'import-ops/public/index.html'), 'utf8')
const css = readFileSync(path.join(repoRoot, 'import-ops/public/styles.css'), 'utf8')
const client = readFileSync(path.join(repoRoot, 'import-ops/public/app.js'), 'utf8')
const screen = readFileSync(
  path.join(repoRoot, 'app/src/features/paper-browse/PaperBrowsePage.tsx'),
  'utf8',
)
assert.match(html, /<body>\s*<!--[\s\S]*THESIS:/, 'direction contract is the first body child')
assert.match(client, /accountKind === 'import_agent'/, 'real import_agent account gets its own inbox mode')
assert.match(client, /reviewRevision=/, 'review Screen URL binds the immutable revision')
assert.match(client, /认可不是部署授权/, 'approval UI states the deployment boundary')
assert.doesNotMatch(client, /pull-run-push|deploy\(/, 'review UI has no deployment action')
assert.match(screen, /import-review-preview\/revisions/, 'PaperBrowsePage switches only its review data source')
assert.match(css, /grid-template-columns: 280px minmax\(520px, 1fr\) 360px/, 'desktop uses the agreed three-pane workbench')
assert.match(css, /@media \(max-width: 760px\)/, 'mobile composition collapses structurally')

const shipRoot = mkdtempSync(path.join(tmpdir(), 'eqb-web-review-ship-'))
try {
  const paperId = 'paper-mock-web-review-ship'
  const paperDir = path.join(shipRoot, 'scripts/import-pipeline/papers', paperId)
  const evidenceDir = path.join(paperDir, 'canonical-evidence')
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(evidenceDir, { recursive: true })
  mkdirSync(signalsDir, { recursive: true })
  mkdirSync(path.join(shipRoot, 'app/public/paper-assets', paperId, 'latest'), { recursive: true })
  const sourceDigest = `sha256:${'4'.repeat(64)}`
  const candidateDigest = `sha256:${'5'.repeat(64)}`
  const visibleStructureDigest = `sha256:${'8'.repeat(64)}`
  const bundleDigest = `sha256:${'6'.repeat(64)}`
  const approvalId = 'approval-mock-current'
  const revisionId = 'rev-mock-current'
  writeFileSync(path.join(paperDir, 'config.json'), JSON.stringify({
    paperId,
    format: 'universal-nck1',
    provenance: { paperName: '待上线审核卷' },
  }))
  writeFileSync(path.join(signalsDir, 'ai-answer-check.json'), JSON.stringify({ ok: true }))
  writeFileSync(path.join(evidenceDir, 'candidate-summary.json'), JSON.stringify({
    paperId,
    sourceDigest,
    candidateDigest,
  }))
  writeFileSync(path.join(evidenceDir, 'teacher-confirmation-v1.json'), JSON.stringify({
    schemaVersion: 'teacher-confirmation-v1',
    sourceDigest,
    candidateDigest,
    confirmed: true,
  }))
  const webApproval = {
    schemaVersion: 'web-import-review-approval-v1',
    approvalId,
    paperId,
    revisionId,
    sourceDigest,
    candidateDigest,
    visibleStructureDigest,
    bundleDigest,
  }
  const qaReceipt = {
    schemaVersion: 'web-import-review-qa-accepted-v1',
    approvalId,
    revisionId,
    sourceDigest,
    candidateDigest,
    visibleStructureDigest,
    bundleDigest,
  }
  const webReviewStatus = {
    paperId,
    latestRevisionId: revisionId,
    latest: { id: revisionId, state: 'approved', bundleDigest },
    approval: webApproval,
  }
  writeFileSync(
    path.join(evidenceDir, 'web-review-approval-v1.json'),
    JSON.stringify(webApproval),
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify(qaReceipt))
  assert.equal(
    evaluateShip({ repoRoot: shipRoot, paperId, ownerSaid: 'ship', webReviewStatus }).ok,
    true,
    'exact current universal web review receipt permits the existing verbal ship checklist',
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify({
    ...qaReceipt,
    candidateDigest: `sha256:${'7'.repeat(64)}`,
  }))
  assert.equal(
    evaluateShip({ repoRoot: shipRoot, paperId, ownerSaid: 'ship', webReviewStatus }).code,
    'review_receipt_stale',
    'ship checklist rejects a stale universal review receipt',
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify(qaReceipt))
  assert.equal(
    evaluateShip({
      repoRoot: shipRoot,
      paperId,
      ownerSaid: 'ship',
      webReviewStatus: {
        paperId,
        latestRevisionId: 'rev-mock-newer',
        latest: { id: 'rev-mock-newer', state: 'awaiting_review', bundleDigest },
        approval: null,
      },
    }).code,
    'review_receipt_stale',
    'a newer Review service revision invalidates a retained local QA receipt',
  )
} finally {
  rmSync(shipRoot, { recursive: true, force: true })
}

console.log('PASS import review immutable revisions, issue workflow, account UI, and digest-bound ship gate')
