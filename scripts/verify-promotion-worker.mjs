#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createPromotionWorkerService } from '../server/import-review/runPromotionWorker.mjs'
import { createPromotionOperationStore, ensurePromotionOperationShape } from '../server/import-review/promotionOperationStore.mjs'
import { reviewProcessIdentity, matchingReviewProcess, reviewProcessGroupMembers } from '../server/import-review/reviewProcessTree.mjs'
import { freezeReviewFixture, finalizeReviewFixture } from './lib/reviewPublicationFixture.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { verifyPromotionWorkerMatrix } from '../test-fixtures/promotion-worker/verify.mjs'
import { verifyProcessExitSampling } from '../test-fixtures/promotion-worker/process-exit-sampling.mjs'

const onDemandOnly = process.argv.includes('--on-demand-only')
if (!onDemandOnly) await verifyProcessExitSampling()
const disk = statfsSync(tmpdir())
assert.ok(disk.bavail * disk.bsize >= 10_000_000_000, 'DISK_STOP_BELOW_10_GB')
const root = mkdtempSync(path.join(tmpdir(), 'eqb-promotion-worker-'))
{
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE idx_review_promotion_unresolved(id)')
  assert.throws(() => ensurePromotionOperationShape(db))
  assert.equal(db.isTransaction, false)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='import_review_promotion_operations'").get().n, 0)
  db.exec('DROP TABLE idx_review_promotion_unresolved')
  ensurePromotionOperationShape(db); ensurePromotionOperationShape(db)
  db.close()
  const self = await reviewProcessIdentity()
  assert.equal(await matchingReviewProcess({ ...self, startId: 'reused-pid-fixture' }), 'different')
  console.log('PASS interrupted additive migration rolls back atomically and reopens idempotently; reused PID is ambiguous')
}
const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
process.env.QUESTION_BANK_DB = path.join(root, 'bank.sqlite')
process.env.QUESTION_BANK_IMPORT_OPS_DB = path.join(root, 'review.sqlite')
process.env.QUESTION_BANK_IMPORT_OPS_ROOT = path.join(root, 'files')
process.env.QUESTION_BANK_PAPER_ASSET_ROOT = path.join(root, 'assets')
process.env.QUESTION_BANK_BLOB_ROOT = path.join(root, 'blobs')
process.env.QUESTION_BANK_FILE_STORE = 'local'
process.env.QUESTION_BANK_BUILD_ID = 'fixture-original-renderer'
process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN = '0'
let service, passed = false
try {
  const store = createImportReviewStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB,
    filesRoot: process.env.QUESTION_BANK_IMPORT_OPS_ROOT, rendererBuildId: 'fixture-original-renderer', busyTimeoutMs: 0 })
  await store.ready()
  const fixture = makeReviewRoot(path.join(root, 'source'), 'paper-promotion-worker-a')
  const projection = freezeReviewFixture(fixture.reviewRoot)
  const reviewed = finalizeReviewFixture({ directory: fixture.reviewRoot, output: root, projection, store })
  const secondFixture = makeReviewRoot(path.join(root, 'source-b'), 'paper-promotion-worker-b')
  const secondProjection = freezeReviewFixture(secondFixture.reviewRoot)
  const second = finalizeReviewFixture({ directory: secondFixture.reviewRoot, output: root, projection: secondProjection, store })
  const thirdFixture = makeReviewRoot(path.join(root, 'source-c'), 'paper-promotion-worker-c')
  const thirdProjection = freezeReviewFixture(thirdFixture.reviewRoot)
  const third = finalizeReviewFixture({ directory: thirdFixture.reviewRoot, output: root, projection: thirdProjection, store, approve: false })
  const requestId = `publication-request-${randomUUID()}`
  const secretHash = sha256('synthetic-scoped-capability')
  store.registerPublicationRequest(second.manifest.paperId, { requestId, secretHash,
    revisionId: second.revision.id, ttlSeconds: 3600 }, 'synthetic-agent')
  store.grantPublicationRequest(requestId, 'synthetic-owner')
  const seedDb = path.join(root, 'seed.sqlite')
  copyFileSync(process.env.QUESTION_BANK_IMPORT_OPS_DB, seedDb)
  const db = new DatabaseSync(process.env.QUESTION_BANK_DB)
  db.exec(readFileSync(new URL('../data/sql/schema.sql', import.meta.url), 'utf8'))
  db.close()
  mkdirSync(process.env.QUESTION_BANK_PAPER_ASSET_ROOT)
  let invalidations = 0
  service = createPromotionWorkerService({ getStore: () => store, afterPublish() { invalidations++ } })
  {
    const reviewDb = new DatabaseSync(process.env.QUESTION_BANK_IMPORT_OPS_DB)
    reviewDb.prepare('DELETE FROM review_compatibility WHERE revision_id IN (?, ?, ?)')
      .run(reviewed.revision.id, second.revision.id, third.revision.id)
    reviewDb.close()
    assert.equal(store.compatibilityForRevision(third.revision.id).pending, true)
    const approval = store.approveRevision(third.manifest.paperId, third.revision.id,
      { bundleDigest: third.revision.bundleDigest }, 'synthetic-owner')
    assert.equal(approval.revisionId, third.revision.id)
    assert.equal(store.compatibilityForRevision(third.revision.id).pending, true)
    console.log('PASS pending compatibility allows exact-revision approval without computing a target result')
    assert.deepEqual(store.agentPaperStatus(third.manifest.paperId).approval, approval)
    const pendingRequest = { requestId: `publication-request-${randomUUID()}`,
      revisionId: third.revision.id, secretHash: sha256('pending-capability'), ttlSeconds: 3600 }
    store.registerPublicationRequest(third.manifest.paperId, pendingRequest, 'synthetic-agent')
    assert.equal(store.registerPublicationRequest(third.manifest.paperId, pendingRequest, 'synthetic-agent').state, 'pending')
    assert.equal(store.grantPublicationRequest(pendingRequest.requestId, 'synthetic-owner').state, 'granted')
    assert.equal(store.compatibilityForRevision(third.revision.id).pending, true)
    console.log('PASS pending preserves exact Agent approval and permits exact delegation registration/replay/grant')
    const missingDb = new DatabaseSync(process.env.QUESTION_BANK_IMPORT_OPS_DB)
    missingDb.prepare('DELETE FROM review_subject WHERE revision_id=?').run(third.revision.id)
    missingDb.close()
    await assert.rejects(service.promote(third.manifest.paperId,
      { ...approval, intent: 'ship' }, 'synthetic-ship'), error => {
      assert.equal(error.compatibility.result, 'unknown')
      assert.equal(error.retryable, true)
      assert.equal(error.status, 503)
      return true
    })
    assert.equal(store.latestPromotion(third.manifest.paperId), null)
    console.log('PASS unknown rejects publication with an explicit retryable result')
    const changedFile = path.join(store.revisionDirectory(second.revision.id), 'config.json')
    const originalFile = readFileSync(changedFile)
    writeFileSync(changedFile, `${originalFile.toString('utf8')}\n`)
    await assert.rejects(service.promote(second.manifest.paperId,
      { ...second.approval, intent: 'ship' }, 'synthetic-ship'), error => {
      assert.equal(error.code, 'IMPORT_REVIEW_PUBLICATION_COMPATIBILITY_REJECTED')
      assert.equal(error.compatibility.result, 'different')
      assert.ok(error.compatibility.differences.some(pointer => pointer.includes('config.json')),
        JSON.stringify(error.compatibility))
      assert.equal(error.retryable, false)
      return true
    })
    assert.equal(store.latestPromotion(second.manifest.paperId), null)
    const bank = new DatabaseSync(process.env.QUESTION_BANK_DB, { readOnly: true })
    try {
      const table = bank.prepare("SELECT 1 FROM sqlite_master WHERE name='paper_asset_versions'").get()
      assert.equal(table ? bank.prepare('SELECT count(*) n FROM paper_asset_versions WHERE paper_id=?')
        .get(second.manifest.paperId).n : 0, 0)
    } finally { bank.close() }
    writeFileSync(changedFile, originalFile)
    console.log('PASS on-demand different returns structured locations without a promotion or published version')
  }
  const result = await service.promote(reviewed.manifest.paperId, { ...reviewed.approval, intent: 'ship' }, 'synthetic-ship')
  assert.equal(result.status, 'published')
  assert.equal(invalidations, 1)
  assert.equal(store.compatibilityForRevision(reviewed.revision.id).result, 'equal')
  console.log('PASS on-demand equal continues through the original publisher')
  const operations = createPromotionOperationStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB })
  const operation = operations.get(result.operationId)
  assert.equal(operation.state, 'completed')
  assert.equal(operation.promotion_id, result.promotion.promotionId)
  assert.notEqual(operation.worker_pid, process.pid)
  assert.notEqual(operation.supervisor_pid, process.pid)
  assert.equal(await matchingReviewProcess({ bootId: operation.owner_boot_id,
    pid: operation.worker_pid, startId: operation.worker_start_id }), 'dead')
  assert.deepEqual(await reviewProcessGroupMembers(operation.process_group_id), [])
  const replay = await service.promote(reviewed.manifest.paperId, { ...reviewed.approval, intent: 'ship' }, 'synthetic-ship')
  assert.equal(replay.operationId, result.operationId)
  assert.equal(invalidations, 1)
  console.log('PASS promotion executes through independent supervisor/executor, durable receipt, cache invalidation and exact replay')
  {
    // Recreate the durable state of a legacy writer lost after bank commit but
    // before marking Review published, with no operation association.
    const reviewDb = new DatabaseSync(process.env.QUESTION_BANK_IMPORT_OPS_DB)
    try {
      reviewDb.prepare('DELETE FROM import_review_promotion_operations WHERE promotion_id=?').run(result.promotion.promotionId)
      reviewDb.prepare("UPDATE import_review_promotions SET state='publishing', published_at=NULL WHERE id=?")
        .run(result.promotion.promotionId)
      reviewDb.prepare(`INSERT INTO import_review_shipping_guards
        (id,paper_id,revision_id,approval_id,acquired_by,acquired_at) VALUES (?,?,?,?,?,?)`)
        .run(result.promotion.guardId, reviewed.manifest.paperId, reviewed.revision.id,
          reviewed.approval.approvalId, 'legacy-ship', new Date().toISOString())
      reviewDb.prepare('DELETE FROM review_compatibility WHERE revision_id=?').run(reviewed.revision.id)
    } finally { reviewDb.close() }
    const recovered = await service.promote(reviewed.manifest.paperId,
      { ...store.agentPaperStatus(reviewed.manifest.paperId).approval, intent: 'retry_ship' }, 'synthetic-ship')
    assert.equal(recovered.status, 'idempotent')
    assert.equal(recovered.promotion.promotionId, result.promotion.promotionId)
    assert.equal(recovered.promotion.assetVersion, result.promotion.assetVersion)
    assert.equal(operations.get(recovered.operationId).state, 'completed')
    assert.equal(store.compatibilityForRevision(reviewed.revision.id).pending, true)
    const bank = new DatabaseSync(process.env.QUESTION_BANK_DB, { readOnly: true })
    try { assert.equal(bank.prepare('SELECT count(*) n FROM paper_asset_versions').get().n, 1) }
    finally { bank.close() }
    console.log('PASS legacy unlinked publishing reconciles exact committed target before pending compatibility without a new version')
  }
  {
    const approval = store.agentPaperStatus(third.manifest.paperId).approval
    const legacy = store.beginPromotion(third.manifest.paperId, { ...approval, intent: 'ship' }, 'legacy-ship')
    await assert.rejects(service.promote(third.manifest.paperId, { ...approval, intent: 'retry_ship' }, 'synthetic-ship'))
    assert.equal(store.latestPromotion(third.manifest.paperId).promotionId, legacy.promotion.promotionId)
    assert.equal(store.latestPromotion(third.manifest.paperId).state, 'publishing')
    const bank = new DatabaseSync(process.env.QUESTION_BANK_DB, { readOnly: true })
    try { assert.equal(bank.prepare('SELECT count(*) n FROM paper_asset_versions').get().n, 1) }
    finally { bank.close() }
    console.log('PASS uncommitted legacy recovery cannot use renderer fallback to write without current equal')
  }
  if (!onDemandOnly) await verifyPromotionWorkerMatrix({ root, seedDb, ship: reviewed.approval,
    scoped: { paperId: second.manifest.paperId, requestId, secretHash },
    owner: { paperId: third.manifest.paperId, revisionId: third.revision.id, intent: 'publish',
      bundleDigest: third.revision.bundleDigest, rendererBuildId: third.revision.rendererBuildId } })
  passed = true
} catch (error) {
  console.error({ root, error: String(error) })
  const db = new DatabaseSync(process.env.QUESTION_BANK_IMPORT_OPS_DB, { readOnly: true })
  try { console.error(JSON.stringify({ operations: db.prepare('SELECT id,state,outcome_json FROM import_review_promotion_operations').all() })) }
  catch (readError) { console.error(String(readError)) }
  finally { db.close() }
  throw error
} finally {
  service?.stop()
  if (passed) rmSync(root, { recursive: true, force: true })
}
