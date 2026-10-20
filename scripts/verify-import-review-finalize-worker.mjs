import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { buildImportReviewProjection, reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'
import { finalizeInventory } from '../server/import-review/finalizeComputation.mjs'
import { runFinalizeWorker } from '../server/import-review/runFinalizeWorker.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { buildProductPreviewPayload } from '../server/import-review/reviewSubject.mjs'
import { saveProductPreview as legacySaveProductPreview } from '../test-fixtures/review-compatibility/legacy-preview-6dc7530b.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
let makeReviewRoot
try {
  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  ;({ makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs'))
} finally {
  if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
}

const root = mkdtempSync(path.join(tmpdir(), 'eqb-finalize-worker-'))
let server
try {
  const fixture = makeReviewRoot(path.join(root, 'fixture'), 'paper-finalize-worker', undefined, { listening: true })
  const directory = fixture.reviewRoot
  const options = { reviewKind: 'candidate', requireAnalyses: true }
  const synchronous = buildImportReviewProjection(directory, options)
  assert.equal(sha256(Buffer.from(legacySaveProductPreview.toString())),
    'sha256:95f750c91a3d18504a1f7eb41746fc5cc8f3af1415803d425b96059f19f97660')
  let legacyJson
  const previewRevision = { id: 'rev-preview-byte-parity', bundleDigest: synchronous.candidateDigest }
  legacySaveProductPreview({ prepare: () => ({ run: (...values) => { legacyJson = values[4] } }) },
    previewRevision, 'legacy-renderer', synchronous)
  const currentJson = JSON.stringify(buildProductPreviewPayload(previewRevision, synchronous))
  assert.deepEqual(Buffer.from(currentJson), Buffer.from(legacyJson),
    'preview JSON bytes must match the actual 6dc7530b constructor on the same listening fixture')
  console.log('PASS preview payload JSON bytes match original 6dc7530b constructor')
  const revision = { reviewKind: 'candidate', candidateDigest: synchronous.candidateDigest }
  const worker = await runFinalizeWorker(directory, revision)
  assert.deepEqual(worker.projection, synchronous, 'every field and binary byte must match the synchronous projection')
  assert.deepEqual(worker.expectedFiles, finalizeInventory(directory, revision))
  assert.equal(worker.inventoryError, undefined)

  await assert.rejects(runFinalizeWorker(path.join(root, 'missing'), revision), error =>
    error.code && error.message.includes('config'))
  await assert.rejects(runFinalizeWorker(directory, revision, { timeoutMs: 1 }),
    { code: 'IMPORT_REVIEW_FINALIZE_TIMEOUT' })
  // Failure/termination must release the shared slot, including queued work.
  const concurrent = await Promise.all([
    runFinalizeWorker(directory, revision, { timeoutMs: 1 }).catch(error => error.code),
    runFinalizeWorker(directory, revision),
  ])
  assert.equal(concurrent[0], 'IMPORT_REVIEW_FINALIZE_TIMEOUT')
  assert.deepEqual(concurrent[1].projection, synchronous)

  const files = reviewBundleFilePaths(directory).map(file => {
    const bytes = readFileSync(path.join(directory, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  })
  const manifest = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId: synchronous.paperId, paperName: synchronous.paperName,
    sourceDigest: synchronous.sourceDigest, candidateDigest: synchronous.candidateDigest,
    visibleStructureDigest: synchronous.visibleStructureDigest, analysisDigest: synchronous.analysisDigest,
    producerBuildId: 'finalize-worker-test', files,
  }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  function upload(name, input = manifest) {
    const dbPath = path.join(root, name, 'review.sqlite')
    const store = createImportReviewStore({
      dbPath, filesRoot: path.join(root, name, 'revisions'), rendererBuildId: 'finalize-worker-test',
    })
    const { revision } = store.createRevision(input)
    for (const file of input.files) {
      const target = store.fileForUpload(revision.id, file.path)
      mkdirSync(path.dirname(target.destination), { recursive: true })
      writeFileSync(target.destination, readFileSync(path.join(directory, file.path)))
      store.completeFileUpload(revision.id, file.path, file)
    }
    return { store, revision, dbPath }
  }

  const sync = upload('sync')
  await sync.store.ready()
  const startedSync = performance.now()
  const syncResult = sync.store.finalizeRevision(sync.revision.id)
  const synchronousMs = performance.now() - startedSync
  const asyncCase = upload('async')
  server = createServer((request, response) => {
    assert.equal(request.url, '/api/health')
    response.end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/health`
  await fetch(url)
  const delays = []
  const health = []
  let lastTick = performance.now()
  const interval = setInterval(() => {
    const now = performance.now()
    delays.push(now - lastTick)
    lastTick = now
  }, 10)
  let done = false
  let healthDuringFinalize = 0
  const startedWorker = performance.now()
  // Diagnostic control: this must fail the responsiveness assertion.
  const pending = (process.argv.includes('--sync-baseline')
    ? Promise.resolve().then(() => asyncCase.store.finalizeRevision(asyncCase.revision.id))
    : asyncCase.store.finalizeUploadedRevision(asyncCase.revision.id))
    .finally(() => { done = true })
  while (!done) {
    const before = performance.now()
    assert.equal(await (await fetch(url)).text(), 'ok')
    health.push(performance.now() - before)
    if (!done) healthDuringFinalize++
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  const asyncResult = await pending
  clearInterval(interval)
  const workerMs = performance.now() - startedWorker
  assert(healthDuringFinalize > 0, 'health must respond while finalize is still computing')
  assert(delays.length > 0, 'finalize must yield to the main event loop before completing')
  assert(Math.max(...delays) < 1000, 'finalize event-loop delay must stay below 1 second')
  assert(Math.max(...health) < 1000, 'concurrent health requests must stay below 1 second')
  for (const field of ['state', 'sourceDigest', 'candidateDigest', 'visibleStructureDigest', 'analysisDigest', 'rendererBuildId']) {
    assert.deepEqual(asyncResult[field], syncResult[field], field)
  }
  assert.deepEqual(asyncCase.store.productPreviewForRevision(asyncResult.id).preview,
    buildProductPreviewPayload(asyncResult, synchronous))
  assert.equal(asyncCase.store.compatibilityForRevision(asyncResult.id).reasonCode, 'MISSING_FROZEN_PRODUCTS')
  assert.equal(asyncCase.store.listPapers()[0].compatibility.reasonCode, 'MISSING_FROZEN_PRODUCTS')
  assert.throws(() => asyncCase.store.projectionForRevision(asyncResult.id),
    { code: 'IMPORT_REVIEW_RENDERER_STALE', reasonCode: 'MISSING_FROZEN_PRODUCTS' },
    'a legacy fixture without frozen products retains its original preview but cannot derive live content')
  const evidenceDb = new DatabaseSync(asyncCase.dbPath)
  try {
    const evidence = evidenceDb.prepare('SELECT evidence_json FROM review_compatibility WHERE revision_id=?')
      .get(asyncResult.id).evidence_json
    evidenceDb.prepare('UPDATE review_compatibility SET evidence_json=? WHERE revision_id=?')
      .run('{}', asyncResult.id)
    assert.equal(asyncCase.store.compatibilityForRevision(asyncResult.id).reasonCode, 'BASELINE_UNTRUSTED',
      'unknown diagnostics without a subject still require intact evidence')
    evidenceDb.prepare('UPDATE review_compatibility SET evidence_json=? WHERE revision_id=?')
      .run(evidence, asyncResult.id)
  } finally { evidenceDb.close() }
  function preview(dbPath) {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare('SELECT * FROM import_review_product_previews').get()
      return JSON.parse(row.payload_json)
    } finally { db.close() }
  }
  // The playback URL embeds the independently allocated revision ID.
  const syncPreview = preview(sync.dbPath)
  const asyncPreview = preview(asyncCase.dbPath)
  syncPreview.consumption.listeningAudio.url = syncPreview.consumption.listeningAudio.url
    .replace(syncResult.id, asyncResult.id)
  assert.deepEqual(asyncPreview, syncPreview)

  // A valid hash with an invalid inventory must never partially finalize.
  writeFileSync(path.join(directory, 'extra.json'), '{}')
  const bad = { ...manifest, files: [...files, {
    path: 'extra.json', mediaType: 'application/json', role: 'source', sha256: sha256(Buffer.from('{}')), byteLength: 2,
  }] }
  bad.bundleDigest = reviewBundleDigest(bad)
  const rejected = upload('rejected', bad)
  await assert.rejects(rejected.store.finalizeUploadedRevision(rejected.revision.id),
    { code: 'IMPORT_REVIEW_FILES_INVALID' })
  assert.equal(rejected.store.getRevision(rejected.revision.id).state, 'uploading')
  const rejectedDb = new DatabaseSync(rejected.dbPath, { readOnly: true })
  try {
    assert.equal(rejectedDb.prepare('SELECT COUNT(*) AS n FROM import_review_product_previews').get().n, 0)
  } finally { rejectedDb.close() }
  const configPath = path.join(directory, 'config.json')
  writeFileSync(configPath, '{invalid JSON')
  const invalidSource = { ...manifest, files: files.map(file => file.path !== 'config.json' ? file : {
    ...file, sha256: sha256(readFileSync(configPath)), byteLength: readFileSync(configPath).length,
  }) }
  invalidSource.bundleDigest = reviewBundleDigest(invalidSource)
  const broken = upload('broken-projection', invalidSource)
  await assert.rejects(broken.store.finalizeUploadedRevision(broken.revision.id), error =>
    error.metrics.failedStage === 'projection')
  assert.equal(broken.store.getRevision(broken.revision.id).state, 'uploading')
  console.log(JSON.stringify({
    check: 'finalize-worker', synchronousMs, workerMs,
    healthSamples: health.length, healthDuringFinalize, maxHealthMs: Math.max(...health),
    eventLoopSamples: delays.length, maxEventLoopDelayMs: Math.max(...delays),
    projectionAndInventory: 'deep-strict-equal', persistedPreview: 'deep-strict-equal',
  }))
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  rmSync(root, { recursive: true, force: true })
}
