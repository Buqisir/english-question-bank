import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createImportReviewStore } from '../../server/import-review/importReviewStore.mjs'
import { createPromotionWorkerService } from '../../server/import-review/runPromotionWorker.mjs'
import { createPromotionOperationStore } from '../../server/import-review/promotionOperationStore.mjs'
import { freezeReviewFixture, finalizeReviewFixture } from '../../scripts/lib/reviewPublicationFixture.mjs'
import { createPaperSurfaceAnalysisAvailability } from '../../server/search/paperSurfaceAvailability.mjs'
import { createTeachingFacetIndex } from '../../server/search/teachingFacets.mjs'
import { createSimilarQuestionsStore } from '../../server/search/similarQuestions.mjs'

async function pendingLeaseProof() {
  const { acquireReviewCompatibilityLeader, beginReviewCompatibilityWork } = await import('../../server/import-review/reviewCompatibilityScheduling.mjs')
  const { reviewProcessIdentity, matchingReviewProcess, reviewProcessGroupMembers } = await import('../../server/import-review/reviewProcessTree.mjs')
  const { runReviewCompatibilityWorker } = await import('../../server/import-review/runReviewCompatibilityWorker.mjs')
  const root = process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
  assert.ok(root && path.isAbsolute(root), 'pending lease regression requires an isolated lock root')
  const records = () => readdirSync(root)
    .filter(name => /^\.compatibility-(?:work|closed)-/.test(name))
    .map(name => path.join(root, name, 'worker.json')).filter(existsSync)
    .map(file => JSON.parse(readFileSync(file, 'utf8')))
  const wait = async (predicate, label) => {
    for (let i = 0; i < 400; i++) {
      if (await predicate()) return
      await yieldFor(25)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const leader = acquireReviewCompatibilityLeader()
  assert.ok(leader)
  let custody, old, identity, finished = false
  const proof = {}
  try {
    custody = beginReviewCompatibilityWork(leader.lease)
    assert.ok(custody)
    old = spawn(process.execPath, ['-e', 'const {spawn}=require("node:child_process");spawn(process.execPath,["-e","Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0)"],{stdio:"ignore"});setTimeout(()=>process.exit(0),1000)'],
      { detached: true, stdio: 'ignore' })
    const exited = new Promise(resolve => old.once('exit', resolve))
    identity = await reviewProcessIdentity(old.pid)
    assert.ok(identity)
    custody.record(identity)
    await exited
    proof.oldState = await matchingReviewProcess(identity)
    proof.nativeGroupBefore = (await reviewProcessGroupMembers(old.pid)).length
    assert.equal(proof.oldState, 'dead')
    assert.ok(proof.nativeGroupBefore > 0, 'old parent exited but its native group must survive')
    proof.finishRefused = !(await custody.finish())
    assert.equal(proof.finishRefused, true)
    proof.recordsBefore = records().length
    const input = { mode: 'compatibility', targetBuildId: 'pending-lease-diagnostic' }
    const blocked = await runReviewCompatibilityWorker(input, { leaderLease: leader.lease })
    proof.busyReason = blocked.comparison.reasonCode
    proof.recordsAfter = records().length
    proof.nativeGroupAfter = (await reviewProcessGroupMembers(old.pid)).length
    // These assertions precede any explicit cleanup and the finally block.
    assert.equal(proof.busyReason, 'LEADER_BUSY')
    assert.equal(proof.recordsAfter, proof.recordsBefore, 'retained group must prevent a new fork')
    assert.ok(proof.nativeGroupAfter > 0, 'admission must preserve the original native group')
    process.kill(-old.pid, 'SIGKILL')
    await wait(async () => !(await reviewProcessGroupMembers(old.pid)).length, 'owned old native group death')
    proof.oldGroupDead = true
    proof.finishAfterDeath = await custody.finish()
    assert.equal(proof.finishAfterDeath, true)
    finished = true
    const readmitted = await runReviewCompatibilityWorker(input, { leaderLease: leader.lease })
    proof.readmittedReason = readmitted.comparison.reasonCode
    proof.recordsReadmitted = records().length
    assert.equal(proof.readmittedReason, 'TARGET_IDENTITY_MISMATCH')
    assert.equal(proof.recordsReadmitted, proof.recordsBefore + 1)
    for (const record of records()) {
      assert.equal(await matchingReviewProcess(record), 'dead')
      assert.deepEqual(await reviewProcessGroupMembers(record.pid), [])
    }
    proof.allOwnedGroupsDead = true
  } finally {
    if (old?.pid) {
      try { process.kill(-old.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
      await wait(async () => !(await reviewProcessGroupMembers(old.pid)).length, 'owned group exit before leader release')
    }
    if (custody && !finished && identity) assert.equal(await custody.finish(), true)
    for (const record of records()) {
      assert.equal(await matchingReviewProcess(record), 'dead')
      assert.deepEqual(await reviewProcessGroupMembers(record.pid), [])
    }
    leader.release()
    proof.leaderReleased = !existsSync(path.join(root, 'leader'))
    assert.equal(proof.leaderReleased, true)
  }
  return proof
}

const store = createImportReviewStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB,
  filesRoot: process.env.QUESTION_BANK_IMPORT_OPS_ROOT, rendererBuildId: 'fixture-original-renderer',
  initializeSchema: false, busyTimeoutMs: 0 })
const operations = createPromotionOperationStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB })
let invalidations = 0
const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
const availability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir })
const facets = createTeachingFacetIndex({ paperAssetsDir })
const similar = createSimilarQuestionsStore({ paperAssetsDir, getTeachingFacetIndex: () => facets.getIndex() })
let primedCaches
const cacheInvalidations = { similar: 0, facets: 0, availability: 0 }
function consumeCaches() {
  return { similar: similar.__promotionFixtureRawIndex(), facets: facets.getIndex(), availability: availability.getByGroupId() }
}
const service = createPromotionWorkerService({ getStore: () => store, afterPublish() {
  invalidations++
  similar.invalidate(); cacheInvalidations.similar++
  facets.invalidate(); cacheInvalidations.facets++
  availability.invalidate(); cacheInvalidations.availability++
} })
let httpServer
function start(message) {
  return message.mode === 'owner_publish'
    ? service.promoteOwner(message.paperId, message.input.revisionId, message.input, 'synthetic-owner')
    : message.mode === 'scoped'
      ? service.promoteScoped(message.paperId, message.input.requestId, message.input.secretHash, 'synthetic-agent')
      : service.promote(message.paperId, message.input, 'synthetic-ship')
}
process.send({ type: 'ready' })
process.on('message', async message => {
  try {
    let result
    if (message.type === 'start') {
      result = await start(message)
    } else if (message.type === 'http-listen') {
      assert.equal(httpServer, undefined)
      httpServer = createServer(async (request, response) => {
        try {
          let body = ''
          for await (const bytes of request) body += bytes
          const published = await start(JSON.parse(body))
          response.writeHead(201, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ result: published, invalidations }))
        } catch (error) {
          response.writeHead(409, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ code: error.code, operationId: error.operationId }))
        }
      })
      await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
      result = { port: httpServer.address().port }
    } else if (message.type === 'cache-prime') {
      primedCaches = consumeCaches()
      result = { primed: true, sizes: { similar: primedCaches.similar.paperMetaByGroupId.size,
        facets: primedCaches.facets.size, availability: primedCaches.availability.size } }
    } else if (message.type === 'cache-consume') {
      const current = consumeCaches()
      result = { invalidations: cacheInvalidations,
        refreshed: Object.fromEntries(Object.keys(current).map(key => [key, current[key] !== primedCaches[key]])),
        sizes: { similar: current.similar.paperMetaByGroupId.size, facets: current.facets.size, availability: current.availability.size } }
    } else if (message.type === 'pending-lease') result = await pendingLeaseProof()
    else if (message.type === 'reconcile') result = await service.reconcile()
    else if (message.type === 'legacy-start') {
      const { createSinglePaperPromotionService } = await import('../../server/import-review/singlePaperPromotion.mjs')
      const { promotionBootstrap, openPromotionBank } = await import('../../server/import-review/promotionBootstrap.mjs')
      const config = promotionBootstrap()
      await store.ready()
      const legacy = createSinglePaperPromotionService({ getStore: () => store,
        openDatabase: options => openPromotionBank(config, options), paperAssetsDir: config.paperAssetsDir })
      result = await legacy.promote(message.paperId, message.input, 'synthetic-ship')
    }
    else if (message.type === 'compatibility') {
      const { runReviewCompatibilityWorker } = await import('../../server/import-review/runReviewCompatibilityWorker.mjs')
      result = await runReviewCompatibilityWorker({ mode: 'compatibility', targetBuildId: 'test' })
    } else if (message.type === 'new-revision') {
      const directory = path.join(path.dirname(process.env.QUESTION_BANK_IMPORT_OPS_DB), 'new-revision')
      cpSync(store.revisionDirectory(message.revisionId), directory, { recursive: true })
      const configPath = path.join(directory, 'config.json')
      const config = JSON.parse(readFileSync(configPath))
      config.provenance.month = config.provenance.month === 2 ? 3 : 2
      writeFileSync(configPath, JSON.stringify(config))
      const projection = freezeReviewFixture(directory)
      result = finalizeReviewFixture({ directory, output: path.dirname(directory), projection, store }).approval
    }
    else if (message.type === 'compete') {
      const { runReviewCompatibilityWorker, runReviewCompatibilityBatch } = await import('../../server/import-review/runReviewCompatibilityWorker.mjs')
      const { backfillReviewSubjects } = await import('../../server/import-review/reviewSubjectBackfill.mjs')
      const { createAutomaticReviewSubjectBackfillStore } = await import('../../server/import-review/automaticReviewSubjectBackfill.mjs')
      result = {
        single: await runReviewCompatibilityWorker({ mode: 'compatibility', targetBuildId: 'test' }),
        scan: await runReviewCompatibilityBatch({}),
        manual: await backfillReviewSubjects({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB,
          filesRoot: process.env.QUESTION_BANK_IMPORT_OPS_ROOT }),
        automatic: await createAutomaticReviewSubjectBackfillStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB,
          filesRoot: process.env.QUESTION_BANK_IMPORT_OPS_ROOT }).runBatch(),
      }
    }
    else if (message.type === 'operation') result = operations.unresolved()
    else if (message.type === 'stop') {
      service.stop()
      httpServer?.close()
      process.disconnect(); return
    }
    process.send({ type: 'result', requestId: message.requestId, result, invalidations })
  } catch (error) {
    process.send({ type: 'error', requestId: message.requestId, code: error.code,
      operationId: error.operationId, error: error.message })
  }
})
