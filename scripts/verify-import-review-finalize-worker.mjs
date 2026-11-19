import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { buildImportReviewProjection, buildNck1SealedReviewProjection, reviewBundleFilePaths,
  reviewBundleFilePathsForProjection } from '../server/import-review/revisionProjection.mjs'
import { finalizeContentSubject, finalizeInventory } from '../server/import-review/finalizeComputation.mjs'
import { runFinalizeWorker } from '../server/import-review/runFinalizeWorker.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { freezeReviewFixture, reviewFixtureManifest } from './lib/reviewPublicationFixture.mjs'
import { buildProductPreviewPayload } from '../server/import-review/reviewSubject.mjs'
import { saveProductPreview as legacySaveProductPreview } from '../test-fixtures/review-compatibility/legacy-preview-6dc7530b.mjs'
import { prebindReviewFixtureReferences, removeOwnedReviewReferences } from './lib/syntheticReviewAnswerFixture.mjs'
import { listeningReviewSubject } from '../server/paper-import/listeningReview.mjs'
import { LISTENING_AUDIO_PATHS } from '../server/paper-import/listeningAudioEvidence.mjs'
import { configuredBlobStore } from '../server/paper-import/blobStore.mjs'
import { productInputDigest, PRODUCT_MANIFEST } from '../server/paper-import/frozenProducts.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
let makeReviewRoot, writeStagedAnalyses
try {
  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  ;({ makeReviewRoot, writeStagedAnalyses } = await import('./verify-universal-nck1-publish.mjs'))
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
  function assertByteTypes(value) {
    if (value instanceof Uint8Array) assert.equal(value.constructor, Uint8Array,
      'native Review source bytes retain their public Uint8Array type')
    else if (value && typeof value === 'object') Object.values(value).forEach(assertByteTypes)
  }
  assertByteTypes(synchronous.sourceInput)
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
  assert.equal(asyncCase.store.compatibilityForRevision(asyncResult.id).eligible, false)
  assert.equal(asyncCase.store.listPapers()[0].compatibility.eligible, false)
  const frozenApproval = asyncCase.store.approveRevision(asyncResult.paperId, asyncResult.id,
    { bundleDigest: asyncResult.bundleDigest }, 'owner')
  assert.equal(frozenApproval.revisionId, asyncResult.id)
  const frozenRequest = asyncCase.store.registerPublicationRequest(asyncResult.paperId, {
    revisionId: asyncResult.id, requestId: 'publication-request-00000000-0000-4000-8000-000000000001',
    secretHash: sha256('missing-products'),
  }, 'agent')
  assert.equal(asyncCase.store.grantPublicationRequest(frozenRequest.requestId, 'owner').state, 'granted')
  assert.equal(asyncCase.store.getRevision(asyncResult.id).approval.approvalId, frozenApproval.approvalId,
    'unknown compatibility allows frozen review approval while publication remains guarded')
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
    // Historical production manifests may omit `files`; the fallback guard must
    // treat that as missing frozen products instead of failing the whole list.
    const manifestJson = evidenceDb.prepare('SELECT manifest_json FROM import_review_revisions WHERE id=?')
      .get(asyncResult.id).manifest_json
    const { files: _files, ...withoutFiles } = JSON.parse(manifestJson)
    for (const [label, files] of [['missing'], ['null', null], ['object', {}], ['string', 'files'], ['number', 1]]) {
      const malformed = label === 'missing' ? withoutFiles : { ...withoutFiles, files }
      evidenceDb.prepare('UPDATE import_review_revisions SET manifest_json=? WHERE id=?')
        .run(JSON.stringify(malformed), asyncResult.id)
      const listed = asyncCase.store.listPapers()[0]
      assert.equal(listed.compatibility.eligible, false,
        `a candidate manifest with ${label} files lists as ineligible instead of throwing`)
      assert.equal(listed.hasMediaCandidates, false, label)
      assert.equal(asyncCase.store.compatibilityForRevision(asyncResult.id).eligible, false, label)
      assert.equal(asyncCase.store.agentPaperStatus(asyncResult.paperId).compatibility.eligible, false, label)
      assert.deepEqual(finalizeContentSubject(root, asyncCase.store.getRevision(asyncResult.id), synchronous),
        { ok: false, reasonCode: 'MISSING_FROZEN_PRODUCTS' }, label)
      assert.throws(() => asyncCase.store.verifiedFileForRead(asyncResult.id, 'products/manifest-v1.json'),
        { code: 'IMPORT_REVIEW_NOT_FOUND', status: 404 }, label)
    }
    evidenceDb.prepare('UPDATE import_review_revisions SET manifest_json=? WHERE id=?')
      .run(manifestJson, asyncResult.id)
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
  const sealedSource = makeReviewRoot(path.join(root, 'sealed-source'), 'paper-finalize-sealed', undefined, { listening: true })
  const initial = freezeReviewFixture(sealedSource.reviewRoot)
  const readJson = (directory, file) => JSON.parse(readFileSync(path.join(directory, file)))
  const writeJson = (directory, file, value) => writeFileSync(path.join(directory, file), JSON.stringify(value))
  const listeningPath = 'listening-review-v1.json'
  const windowPath = 'listening-review-evidence/window.json'
  const windowBytes = Buffer.from(JSON.stringify({ segments: [] }))
  mkdirSync(path.join(sealedSource.reviewRoot, path.dirname(windowPath)))
  writeFileSync(path.join(sealedSource.reviewRoot, windowPath), windowBytes)
  const originalListening = {
    schemaVersion: 'listening-review-v1', subject: listeningReviewSubject(initial, initial.candidate),
    method: 'asr_source_comparison', reviewedBy: 'import_agent', reviewedAt: '2026-09-02T00:00:00Z',
    untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [{ path: windowPath, sha256: sha256(windowBytes), byteLength: windowBytes.length,
      kind: 'asr_window', window: { startSeconds: 0, endSeconds: 8 },
      settings: { engine: 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' } }],
    groups: initial.materialization.listening.transcript.map(({ segmentId, questionNumbers }, index) => ({
      segmentId, questionNumbers, decision: index < 2 ? 'usable' : 'review_required',
      reason: 'Synthetic navigation check', limits: [],
      playback: index < 2 ? { startSeconds: 1 + index * 3, endSeconds: 3 + index * 3 } : null,
      occurrences: index < 2 ? [{ startSeconds: 1 + index * 3, endSeconds: 3 + index * 3,
        evidencePaths: [windowPath] }] : [],
    })),
  }
  writeJson(sealedSource.reviewRoot, listeningPath, originalListening)
  const sealedProjection = buildImportReviewProjection(sealedSource.reviewRoot, options)
  const sealedManifest = reviewFixtureManifest(sealedSource.reviewRoot, sealedProjection)
  const sealedDb = path.join(root, 'sealed.sqlite')
  const sealedStore = createImportReviewStore({ dbPath: sealedDb, filesRoot: path.join(root, 'sealed-files'),
    rendererBuildId: 'finalize-worker-test', deduplicateSealedFiles: true })
  const sealedDraft = sealedStore.createRevision(sealedManifest).revision
  for (const file of sealedManifest.files) {
    const { destination } = sealedStore.fileForUpload(sealedDraft.id, file.path)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, readFileSync(path.join(sealedSource.reviewRoot, file.path)))
    sealedStore.completeFileUpload(sealedDraft.id, file.path, file)
  }
  const blobRoot = path.join(root, 'sealed-blobs')
  const blobPath = digest => path.join(blobRoot, 'eqb-blobs/v1/sha256', digest.slice(7))
  const localStorage = { QUESTION_BANK_BLOB_ROOT: blobRoot, QUESTION_BANK_FILE_STORE: 'local' }
  const previousStorage = Object.fromEntries(Object.keys(localStorage).map(key => [key, process.env[key]]))
  const playbackPath = 'listening/playback.mp3'
  const playback = await configuredBlobStore(localStorage).put(
    readFileSync(path.join(sealedSource.reviewRoot, LISTENING_AUDIO_PATHS.playback)),
  )
  const playbackInode = statSync(blobPath(playback.sha256)).ino
  try {
    Object.assign(process.env, localStorage)
    await sealedStore.finalizeUploadedRevision(sealedDraft.id)
  } finally {
    for (const [key, value] of Object.entries(previousStorage)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  const sealedCommitment = sealedStore.sealedPublicationCommitmentForRevision(sealedDraft.id)
  const sealedDirectory = path.join(sealedStore.revisionDirectory(sealedDraft.id), 'sealed-publication')
  const sealedBytes = readFileSync(path.join(sealedDirectory, 'manifest.json'))
  const sealed = JSON.parse(sealedBytes)
  assert.equal(sha256(sealedBytes), sealedCommitment.commitment)
  assert.equal(sealed.payloadDigest, digestJson(sealedStore.productPreviewForRevision(sealedDraft.id).preview))
  assert.equal(sealedStore.getRevision(sealedDraft.id).state, 'awaiting_review')
  for (const file of sealed.files.filter(file => file.origin === 'sealed')) {
    const bytes = readFileSync(path.join(sealedDirectory, file.path))
    assert.equal(sha256(bytes), file.sha256)
    assert.equal(bytes.length, file.byteLength)
  }
  assert(sealed.files.some(file => file.origin === 'revision' && file.path === 'products/manifest-v1.json'))
  assert(sealed.files.some(file => file.path === 'canonical/source-asset.bin'))
  assert(sealed.files.some(file => file.path === 'listening/playback.mp3'))
  assert.equal(statSync(path.join(sealedDirectory, playbackPath)).ino, playbackInode)
  const sourceAsset = sealed.files.find(file => file.path === 'canonical/source-asset.bin')
  const sourceInode = statSync(path.join(sealedDirectory, sourceAsset.path)).ino
  assert.notEqual(sourceInode, playbackInode)
  assert.equal(statSync(blobPath(sourceAsset.sha256)).ino, sourceInode, 'previously unseen bytes are adopted')
  console.log('PASS worker finalize atomically commits complete sealed bytes, preview digest and awaiting_review without duplicating PDFs')

  const repair = path.join(root, 'local-repair')
  cpSync(sealedSource.reviewRoot, repair, { recursive: true })
  const originalRevision = sealedStore.getRevision(sealedDraft.id)
  const originalDirectory = sealedStore.revisionDirectory(originalRevision.id)
  const evidenceBase = { revision: originalRevision, directory: originalDirectory }
  const sourceManifest = readJson(repair, 'universal-source-manifest.json')
  const raw = readJson(repair, sourceManifest.materializationPath)
  const targetQuestion = raw.groups.find(group => group.slotId === 'reading.a').questions[0]
  const answer = raw.answers.find(entry => entry.questionId === targetQuestion.questionId)
  answer.value = targetQuestion.options.find(option => option.label !== answer.value).label
  writeJson(repair, sourceManifest.materializationPath, raw)
  writeStagedAnalyses(repair, raw)
  // Rebind the derived references; the source answer PDF is unchanged.
  assert(removeOwnedReviewReferences(repair))
  rmSync(path.join(repair, listeningPath))
  prebindReviewFixtureReferences(repair)
  writeJson(repair, listeningPath, originalListening)
  const products = readJson(repair, PRODUCT_MANIFEST)
  rmSync(path.join(repair, PRODUCT_MANIFEST))

  const bin = path.join(root, 'no-raster')
  mkdirSync(bin)
  writeFileSync(path.join(bin, 'pdftoppm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const originalPath = process.env.PATH
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`
  try {
    const edited = buildImportReviewProjection(repair, options, evidenceBase)
    assert.notEqual(edited.candidateDigest, sealedProjection.candidateDigest)
    assert.deepEqual(edited.materialization.answers, sealedProjection.materialization.answers
      .map(entry => entry.questionId === targetQuestion.questionId ? { ...entry, value: answer.value } : entry))
    assert.deepEqual(edited.materialization.groups, sealedProjection.materialization.groups)
    assert.deepEqual(edited.reviewedListening.review.groups, originalListening.groups)
    assert.equal(edited.reviewedListening.review.subject.candidateDigest, edited.candidateDigest)
    assert.throws(() => buildImportReviewProjection(repair, options), /raster|page pixels/i)

    const ocrPath = 'materialization/nck1-ocr-source-evidence-v1.json'
    for (const [directory, missing] of [[repair, false], [repair, true], [originalDirectory, true]]) {
      const absolute = path.join(directory, ocrPath)
      const bytes = readFileSync(absolute)
      try {
        if (missing) rmSync(absolute)
        else writeFileSync(absolute, Buffer.concat([bytes, Buffer.from('\n')]))
        assert.throws(() => buildImportReviewProjection(repair, options, evidenceBase))
      } finally { writeFileSync(absolute, bytes) }
    }
    const pdf = sourceManifest.documents.find(file => file.role === 'question_source')
    const originalPdf = readFileSync(path.join(repair, pdf.path))
    const changedPdf = Buffer.concat([originalPdf, Buffer.from('\n% replacement source\n')])
    const pdfIdentity = { sha256: sha256(changedPdf), byteLength: changedPdf.length }
    const sourceFile = 'universal-source-manifest.json'
    try {
      writeFileSync(path.join(repair, pdf.path), changedPdf)
      writeJson(repair, sourceFile, { ...sourceManifest, documents: sourceManifest.documents.map(file =>
        file === pdf ? { ...file, ...pdfIdentity } : file) })
      writeJson(repair, sourceManifest.materializationPath, { ...raw, documents: raw.documents.map(file =>
        file.documentId === pdf.documentId ? { ...file, ...pdfIdentity } : file) })
      assert.throws(() => buildImportReviewProjection(repair, options, evidenceBase),
        /OCR evidence is not bound to the current immutable source/)
    } finally {
      writeFileSync(path.join(repair, pdf.path), originalPdf)
      writeJson(repair, sourceFile, sourceManifest)
      writeJson(repair, sourceManifest.materializationPath, raw)
    }
    for (const missing of [false, true]) {
      const absolute = path.join(repair, windowPath)
      try {
        if (missing) rmSync(absolute)
        else writeFileSync(absolute, Buffer.from('{}'))
        assert.throws(() => buildImportReviewProjection(repair, options, evidenceBase), /Listening review/)
      } finally { writeFileSync(absolute, windowBytes) }
    }

    const changed = structuredClone(originalListening)
    changed.groups[0].playback.endSeconds -= 0.2
    changed.groups[0].occurrences[0].endSeconds -= 0.2
    writeJson(repair, listeningPath, changed)
    assert.throws(() => buildImportReviewProjection(repair, { ...options,
      expectedCandidateDigest: edited.candidateDigest }, evidenceBase), /invalid subject/)
    changed.subject = edited.reviewedListening.review.subject
    writeJson(repair, listeningPath, changed)
    const rebound = buildImportReviewProjection(repair, options, evidenceBase)
    assert.deepEqual(rebound.reviewedListening.review, changed)
    assert.deepEqual(rebound.reviewedListening.review.groups.slice(1), originalListening.groups.slice(1))
    assert.deepEqual(rebound.reviewedListening.review.evidence, originalListening.evidence)

    // Seal the answer-only repair with the untouched listening review. The
    // Worker can only borrow the earlier revision from the store.
    writeJson(repair, listeningPath, originalListening)
    products.inputDigest = productInputDigest(repair, reviewBundleFilePathsForProjection(repair, edited),
      edited.reviewedListening)
    writeJson(repair, PRODUCT_MANIFEST, products)
    const projection = buildImportReviewProjection(repair, options, evidenceBase)
    const repairedManifest = { ...sealedManifest, expectedBaseRevisionId: originalRevision.id,
      sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
      visibleStructureDigest: projection.visibleStructureDigest, analysisDigest: projection.analysisDigest,
      files: reviewBundleFilePathsForProjection(repair, projection).map(file => {
        const bytes = readFileSync(path.join(repair, file.path))
        return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
      }),
    }
    repairedManifest.bundleDigest = reviewBundleDigest(repairedManifest)
    const repairDraft = sealedStore.createRevision(repairedManifest).revision
    for (const file of repairedManifest.files) {
      const { destination } = sealedStore.fileForUpload(repairDraft.id, file.path)
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, readFileSync(path.join(repair, file.path)))
      sealedStore.completeFileUpload(repairDraft.id, file.path, file)
    }
    const completed = await sealedStore.finalizeUploadedRevision(repairDraft.id)
    assert.equal(completed.state, 'awaiting_review')
    assert(sealedStore.sealedPublicationCommitmentForRevision(completed.id).commitment)
    const sealedReplay = buildNck1SealedReviewProjection(sealedStore.revisionDirectory(completed.id), completed)
    assert.deepEqual(sealedReplay.reviewedListening.review.groups, originalListening.groups)
    assert.deepEqual(sealedReplay.materialization.answers, edited.materialization.answers)
  } finally { process.env.PATH = originalPath }
  console.log('PASS sealed answer repair, raster fallback on changed evidence and source, and selective listening changes')

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
