#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statfsSync } from 'node:fs'
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

await verifyProcessExitSampling()
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
  const result = await service.promote(reviewed.manifest.paperId, { ...reviewed.approval, intent: 'ship' }, 'synthetic-ship')
  assert.equal(result.status, 'published')
  assert.equal(invalidations, 1)
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
  await verifyPromotionWorkerMatrix({ root, seedDb, ship: reviewed.approval,
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
