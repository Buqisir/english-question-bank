import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { NCK1_OCR_CONFIRMATION_SCHEMA_VERSION } from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import { runFinalizeWorker } from '../server/import-review/runFinalizeWorker.mjs'
import { acquireRevisionUpload } from '../server/import-review/reviewUploadLocks.mjs'
import {
  buildNck1OcrReviewProjection, validateNck1OcrReviewConfirmation, buildAgentOcrCorrectionReport,
} from '../server/import-review/revisionProjection.mjs'

const previous = process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
let fixtureFunctions
try {
  process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = '1'
  fixtureFunctions = await import('./verify-import-review-ocr-confirmation.mjs')
} finally {
  if (previous === undefined) delete process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
  else process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = previous
}
const { writeSyntheticSource, reviewManifest, uploadRevision } = fixtureFunctions
const root = mkdtempSync(path.join(tmpdir(), 'eqb-ocr-worker-'))
let server
try {
  const staging = path.join(root, 'staging')
  mkdirSync(staging)
  const { evidence } = writeSyntheticSource(staging, { imageSize: '1200x1680' })
  const configPath = path.join(staging, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    ...JSON.parse(readFileSync(configPath)), importProfile: 'public-paper-v1',
  }))
  const manifest = reviewManifest(staging)
  const confirmation = {
    schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
    paperId: manifest.paperId, sourceSetDigest: evidence.sourceSetDigest,
    evidenceDigest: evidence.evidenceDigest, confirmed: true,
    documents: evidence.documents.map(document => ({
      documentId: document.documentId,
      pages: document.pages.map(page => ({
        page: page.page,
        orderedItems: page.observations.map(observation => ({
          itemId: `item:${observation.observationId}`,
          observationIds: [observation.observationId], text: observation.text,
        })),
        furnitureObservationIds: [],
        visualClassifications: page.regions.filter(region => region.kind === 'visual')
          .map(region => ({ regionId: region.regionId, classification: 'furniture' })),
      })),
    })),
  }
  const input = { bundleDigest: manifest.bundleDigest, confirmation, correctionNotes: [] }
  async function uploaded(name) {
    const options = {
      dbPath: path.join(root, name, 'review.sqlite'), filesRoot: path.join(root, name, 'files'),
      rendererBuildId: 'ocr-worker-test',
    }
    const store = createImportReviewStore(options)
    const created = store.createRevision(manifest)
    uploadRevision(store, created, staging, manifest.files)
    const revision = await store.finalizeUploadedRevision(created.revision.id)
    // Cold process: confirmation must not depend on the finalizer's memory cache.
    return { store: createImportReviewStore(options), revision, options }
  }
  const stages = {}
  let before = performance.now()
  const projection = buildNck1OcrReviewProjection(staging)
  stages.projectionMs = performance.now() - before
  before = performance.now()
  validateNck1OcrReviewConfirmation(projection, confirmation)
  stages.confirmationMs = performance.now() - before
  before = performance.now()
  buildAgentOcrCorrectionReport(projection, confirmation, [])
  stages.reportIncludingSecondConfirmationMs = performance.now() - before
  const sync = await uploaded('sync')
  const startedSync = performance.now()
  const syncReceipt = sync.store.confirmOcrRevision(manifest.paperId, sync.revision.id, input, 'agent',
    { reviewerKind: 'import_agent' })
  const synchronousMs = performance.now() - startedSync
  const asyncCase = await uploaded('worker')
  await assert.rejects(runFinalizeWorker(staging, asyncCase.revision, {
    operation: 'ocr-confirmation', input, reviewerKind: 'import_agent', timeoutMs: 1,
  }), { code: 'IMPORT_REVIEW_FINALIZE_TIMEOUT' })
  const store = process.argv.includes('--sync-baseline') ? {
    ...asyncCase.store,
    confirmUploadedOcrRevision: (...args) => asyncCase.store.confirmOcrRevision(...args),
  } : asyncCase.store
  const routes = createImportReviewRoutes({ getStore: () => store, agentToken: 'synthetic-token' })
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/api/health') { response.end('ok'); return }
    const handled = await runRoutes(routes, {
      request, response, url, context: {
        session: { role: 'member', accountKind: 'import_agent', username: 'agent' },
        readJsonBody: readJsonRouteBody,
        sendJson(target, status, body) {
          target.writeHead(status, { 'content-type': 'application/json' })
          target.end(JSON.stringify(body))
        },
      },
    })
    if (!handled) { response.writeHead(404); response.end() }
  })
  server.keepAliveTimeout = 60_000
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  await fetch(`${origin}/api/health`)
  const delays = []
  const health = []
  let lastTick = performance.now()
  const interval = setInterval(() => {
    const now = performance.now()
    delays.push(now - lastTick)
    lastTick = now
  }, 10)
  let done = false
  let during = 0
  let response
  const started = performance.now()
  try {
    const pending = fetch(`${origin}/api/import-agent-reviews/papers/${manifest.paperId}`
      + `/revisions/${asyncCase.revision.id}/proofread-ocr`, {
      method: 'POST', headers: {
        authorization: 'Bearer synthetic-token', 'content-type': 'application/json',
      }, body: JSON.stringify(input),
    }).then(async result => {
      assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
      return result.json()
    }).finally(() => { done = true })
    while (!done) {
      const before = performance.now()
      assert.equal(await (await fetch(`${origin}/api/health`)).text(), 'ok')
      health.push(performance.now() - before)
      if (!done) during++
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    response = await pending
  } finally { clearInterval(interval) }
  const metrics = {
    check: 'ocr-confirmation-worker', stages, synchronousMs, workerMs: performance.now() - started,
    healthSamples: health.length, healthDuringConfirmation: during,
    maxHealthMs: Math.max(...health), maxEventLoopDelayMs: Math.max(...delays),
  }
  console.log(JSON.stringify(metrics))
  assert(during > 0, 'health must respond while OCR confirmation is computing')
  assert(Math.max(...delays) < 1000, 'OCR confirmation event-loop delay must stay below 1 second')
  assert(Math.max(...health) < 1000, 'OCR confirmation health requests must stay below 1 second')
  const normalize = receipt => ({
    ...receipt, revisionId: 'normalized', confirmationId: 'normalized', confirmedAt: 'normalized',
  })
  assert.deepEqual(normalize(response.receipt), normalize(syncReceipt))
  assert.deepEqual(asyncCase.store.getRevision(asyncCase.revision.id).approval, response.receipt)
  const submit = body => asyncCase.store.confirmUploadedOcrRevision(
    manifest.paperId, asyncCase.revision.id, body, 'agent', { reviewerKind: 'import_agent' },
  )
  assert.deepEqual(await submit(input), response.receipt, 'confirmation replay is idempotent')
  for (const body of [
    { ...input, bundleDigest: `sha256:${'0'.repeat(64)}`, confirmation: null },
    { ...input, correctionNotes: null },
  ]) {
    let expected
    try { sync.store.confirmOcrRevision(manifest.paperId, sync.revision.id, body, 'agent',
      { reviewerKind: 'import_agent' }) } catch (error) { expected = error }
    assert(expected, 'synchronous control must reject invalid input')
    await assert.rejects(submit(body), error => error.code === expected.code
      && error.message === expected.message && error.status === expected.status)
  }
  // Hold the real FIFO slot so concurrent DB changes happen while confirmation
  // is awaiting computation. The transaction must read the live state.
  async function concurrentChange(change, code) {
    const release = await acquireRevisionUpload('import-review-finalize-worker')
    const pending = assert.rejects(submit(input), { code })
    try {
      await new Promise(resolve => setImmediate(resolve))
      const db = new DatabaseSync(asyncCase.options.dbPath)
      try { change(db) } finally { db.close() }
    } finally { release() }
    await pending
  }
  await concurrentChange(db => db.prepare(`INSERT INTO import_review_shipping_guards
    (id, paper_id, revision_id, approval_id, acquired_by, acquired_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('test-guard', manifest.paperId, asyncCase.revision.id, 'test-approval', 'test', 'test'),
  'IMPORT_REVIEW_SHIPPING_IN_PROGRESS')
  const db = new DatabaseSync(asyncCase.options.dbPath)
  try { db.exec('DELETE FROM import_review_shipping_guards') } finally { db.close() }
  await concurrentChange(db => db.prepare(
    'UPDATE import_review_papers SET latest_revision_id = NULL WHERE paper_id = ?',
  ).run(manifest.paperId), 'IMPORT_REVIEW_STALE_REVISION')
  const filePath = path.join(asyncCase.options.filesRoot, asyncCase.revision.id, 'config.json')
  const original = readFileSync(filePath)
  const changed = Buffer.from(original)
  changed[0] ^= 1
  writeFileSync(filePath, changed)
  await assert.rejects(submit(input), { code: 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH' })
  assert.deepEqual(asyncCase.store.getRevision(asyncCase.revision.id).approval, response.receipt,
    'rejections must never rewrite the existing receipt')
  console.log('verify-import-review-ocr-worker: PASS (receipt deep-strict-equal)')
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  rmSync(root, { recursive: true, force: true })
}
