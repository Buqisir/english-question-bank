import assert from 'node:assert/strict'
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { syncBuiltinESMExports } from 'node:module'
import crypto, { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createBlobStore } from '../server/paper-import/blobStore.mjs'
import { createImportReviewStore, ocrReviewBundleDigest, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { runRoutes } from '../server/router/index.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-reuse-'))
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const bytes = Buffer.from('synthetic large asset bytes')
const file = { path: 'source/audio.mp3', sha256: digest(bytes), byteLength: bytes.length, mediaType: 'audio/mpeg', role: 'source' }
const jsonBytes = Buffer.from('{}')
const json = { path: 'marker.json', sha256: digest(jsonBytes), byteLength: 2, mediaType: 'application/json', role: 'source' }
const manifests = new Map()
const phases = ['status', 'fileHash', 'projection', 'identityAndReport', 'inventory', 'transactionAndPreview']
let projectionFailure = null
let identityFailure = false
const logs = []
const originalLog = console.info
console.info = line => logs.push(JSON.parse(line))

try {
  const dbPath = path.join(root, 'review.sqlite')
  const filesRoot = path.join(root, 'revisions')
  const blob = createBlobStore({ rootDir: path.join(root, 'blobs') })
  const store = createImportReviewStore({
    dbPath, filesRoot, rendererBuildId: 'reuse-test',
    projectRevision(directory) {
      if (projectionFailure) throw projectionFailure
      const manifest = manifests.get(directory)
      return {
        paperId: identityFailure ? 'paper-wrong' : manifest.paperId,
        sourceSetDigest: manifest.sourceSetDigest, evidenceDigest: manifest.evidenceDigest,
        reviewStructureDigest: manifest.reviewStructureDigest,
      }
    },
  })
  let serial = 0
  function manifest(kind = 'ocr', paperId = 'paper-reuse-test', files = [file, json]) {
    const result = { schemaVersion: kind === 'ocr' ? 'web-import-ocr-review-bundle-v1' : 'web-import-review-bundle-v1',
      paperId, paperName: 'Synthetic reuse', producerBuildId: `test-${++serial}`, files,
      ...(kind === 'ocr' ? { sourceSetDigest: file.sha256, evidenceDigest: digest(String(serial)), reviewStructureDigest: json.sha256 }
        : { sourceDigest: file.sha256, candidateDigest: digest(String(serial)), visibleStructureDigest: json.sha256, analysisDigest: json.sha256 }) }
    result.bundleDigest = (kind === 'ocr' ? ocrReviewBundleDigest : reviewBundleDigest)(result)
    return result
  }
  async function create(input, backend = blob) {
    const result = await store.createRevisionUpload(input, { blobStore: backend, actor: 'reuse-test-agent' })
    manifests.set(store.revisionDirectory(result.revision.id), input)
    return result
  }
  function destination(revision, descriptor = file) {
    return path.join(store.revisionDirectory(revision.id), descriptor.path)
  }
  async function upload(revision, descriptor = json, content = jsonBytes) {
    const lease = await store.beginFileUpload(revision.id, descriptor.path)
    try {
      mkdirSync(path.dirname(lease.destination), { recursive: true })
      writeFileSync(lease.destination, content)
      store.completeFileUpload(revision.id, descriptor.path, descriptor)
    } finally { lease.release() }
  }
  function checkMetrics(metrics, outcome = 'succeeded', failedStage = null, expectedPhases = phases) {
    assert.equal(metrics.outcome, outcome)
    assert.equal(metrics.failedStage, failedStage)
    assert.deepEqual(Object.keys(metrics.durationsMs), expectedPhases)
    assert(Object.values(metrics.durationsMs).every(value => Number.isFinite(value) && value >= 0))
    const sum = Object.values(metrics.durationsMs).reduce((a, b) => a + b, 0)
    assert(Math.abs(sum - metrics.totalMs) < 0.00001, 'phase durations close over total time')
  }
  function failsAt(revision, stage, code) {
    assert.throws(() => store.finalizeRevision(revision.id), error => {
      checkMetrics(error.metrics, 'failed', stage)
      return !code || error.code === code
    })
  }
  const originalInput = manifest()
  const first = await create(originalInput)
  assert.deepEqual(first.missingFiles, [json.path, file.path])
  const staged = path.join(root, 'staged')
  writeFileSync(staged, bytes)
  await blob.adoptLocalFile(staged, file)
  await upload(first.revision, file, bytes)
  await upload(first.revision)
  const initialMetrics = {}
  store.finalizeRevision(first.revision.id, { metrics: initialMetrics })
  checkMetrics(initialMetrics)
  const replayMetrics = {}
  store.finalizeRevision(first.revision.id, { metrics: replayMetrics })
  checkMetrics(replayMetrics)
  assert.equal(replayMetrics.durationsMs.fileHash, 0)
  assert.equal((await create(originalInput)).revision.id, first.revision.id, 'completed manifest replay remains compatible')

  const redoInput = manifest()
  const redo = await create(redoInput)
  const candidate = await create(manifest('candidate'))
  for (const result of [redo, candidate]) {
    assert.deepEqual(result.missingFiles, [json.path], 'OCR redo and OCR to Candidate reuse assets, never JSON')
    assert.equal(statSync(destination(result.revision)).ino,
      statSync(path.join(root, 'blobs/eqb-blobs/v1/sha256', file.sha256.slice(7))).ino)
    assert.equal(result.revision.approval, null)
  }
  rmSync(store.revisionDirectory(first.revision.id), { recursive: true })
  assert.deepEqual(readFileSync(destination(redo.revision)), bytes, 'removing an older revision keeps linked bytes readable')
  assert((await create(manifest('ocr', 'paper-other'))).missingFiles.includes(file.path), 'cross-paper reuse is forbidden')
  assert((await create(manifest(), {})).missingFiles.includes(file.path), 'no local adoption backend falls back to upload')
  for (const mediaType of ['image/png', 'application/pdf', 'application/octet-stream']) {
    const asset = { ...file, path: `source/${mediaType.split('/')[1]}`, mediaType }
    const result = await create(manifest('candidate', 'paper-reuse-test', [asset, json]))
    assert.equal(result.missingFiles.includes(asset.path), mediaType === 'application/octet-stream')
  }
  const unuploaded = manifest('ocr', 'paper-not-uploaded')
  await create(unuploaded, {})
  assert((await create(manifest('candidate', 'paper-not-uploaded'))).missingFiles.includes(file.path),
    'same-paper record without uploaded_at is not reuse authority')
  const exdevInput = manifest()
  await assert.rejects(() => create(exdevInput, {
    reuseLocalFile() { throw Object.assign(new Error('synthetic EXDEV'), { code: 'EXDEV' }) },
  }), error => error.code === 'EXDEV' && error.metrics.failedStage === 'reuse')
  assert((await create(exdevInput, {})).missingFiles.includes(file.path), 'EXDEV never marks or silently copies')

  // Blob absence, equal-length damage, and symlinks must fall back, not mark.
  const blobPath = path.join(root, 'blobs/eqb-blobs/v1/sha256', file.sha256.slice(7))
  unlinkSync(blobPath)
  assert((await create(manifest())).missingFiles.includes(file.path))
  writeFileSync(blobPath, Buffer.alloc(bytes.length, 0x78))
  assert((await create(manifest())).missingFiles.includes(file.path))
  unlinkSync(blobPath)
  symlinkSync(destination(redo.revision), blobPath)
  assert((await create(manifest())).missingFiles.includes(file.path))
  unlinkSync(blobPath)
  mkdirSync(blobPath)
  assert((await create(manifest())).missingFiles.includes(file.path), 'non-regular blobs fall back to upload')
  rmSync(blobPath, { recursive: true })
  await blob.put(bytes, file.mediaType)

  // Reconcile a file already installed before uploaded_at was recorded.
  const installedInput = manifest()
  const installed = await create(installedInput, {})
  assert(blob.reuseLocalFile(destination(installed.revision), file))
  assert(store.uploadStatus(installed.revision.id).missingFiles.includes(file.path))
  assert.deepEqual((await create(installedInput)).missingFiles, [json.path])

  // Source bytes are actually hashed exactly once; same-inode links must not
  // create additional SHA contexts. Equal-length corruption above detects a
  // removed byte check; this assertion also detects a removed or repeated hash.
  const originalCreateHash = crypto.createHash
  let hashCalls = 0
  crypto.createHash = (...args) => { hashCalls++; return originalCreateHash(...args) }
  syncBuiltinESMExports()
  try {
    assert(blob.reuseLocalFile(path.join(root, 'counted/audio.mp3'), file))
    assert.equal(hashCalls, 1)
    hashCalls = 0
    assert(blob.reuseLocalFile(path.join(root, 'counted/audio.mp3'), file))
    assert.equal(hashCalls, 1, 'existing same-inode destination needs no second hash')
    const independent = path.join(root, 'counted/independent.mp3')
    writeFileSync(independent, bytes)
    const inode = statSync(independent).ino
    hashCalls = 0
    assert(blob.reuseLocalFile(independent, file))
    assert.equal(hashCalls, 2, 'different-inode destination must be independently hashed')
    assert.equal(statSync(independent).ino, inode, 'valid existing bytes are never overwritten')
  } finally {
    crypto.createHash = originalCreateHash
    syncBuiltinESMExports()
  }

  const wrongInput = manifest()
  const wrong = await create(wrongInput, {})
  const wrongPath = destination(wrong.revision)
  mkdirSync(path.dirname(wrongPath), { recursive: true })
  writeFileSync(wrongPath, Buffer.alloc(bytes.length))
  assert((await create(wrongInput)).missingFiles.includes(file.path), 'existing unequal destination is never replaced')
  assert.deepEqual(readFileSync(wrongPath), Buffer.alloc(bytes.length))
  unlinkSync(wrongPath)
  symlinkSync(destination(redo.revision), wrongPath)
  assert((await create(wrongInput)).missingFiles.includes(file.path), 'existing symlink is never accepted')

  const changedStateInput = manifest()
  const changedState = await create(changedStateInput, {})
  await assert.rejects(() => create(changedStateInput, { reuseLocalFile(target, descriptor) {
    const installed = blob.reuseLocalFile(target, descriptor)
    const changedDb = new DatabaseSync(dbPath)
    try {
      changedDb.prepare("UPDATE import_review_revisions SET state = 'superseded' WHERE id = ?")
        .run(changedState.revision.id)
    } finally { changedDb.close() }
    return installed
  } }), { code: 'IMPORT_REVIEW_REVISION_IMMUTABLE' })
  assert(store.uploadStatus(changedState.revision.id).missingFiles.includes(file.path),
    'state is rechecked after hashing/installing, before uploaded_at is marked')

  const busyInput = manifest()
  const busy = await create(busyInput, {})
  const lease = await store.beginFileUpload(busy.revision.id, file.path)
  let acquired = false
  const queuedPut = store.beginFileUpload(busy.revision.id, file.path).then(value => { acquired = true; return value })
  const queuedReuse = create(busyInput)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(acquired, false, 'same-path PUT and reuse await the active writer')
  failsAt(busy.revision, 'status', 'IMPORT_REVIEW_UPLOAD_BUSY')
  lease.release()
  const secondLease = await queuedPut
  assert.equal(acquired, true)
  secondLease.release()
  assert.deepEqual((await queuedReuse).missingFiles, [json.path])
  failsAt(busy.revision, 'status', 'IMPORT_REVIEW_UPLOAD_INCOMPLETE')
  await upload(busy.revision)
  projectionFailure = new Error('synthetic projection failure')
  failsAt(busy.revision, 'projection')
  projectionFailure = null
  identityFailure = true
  failsAt(busy.revision, 'identityAndReport', 'IMPORT_REVIEW_PROJECTION_MISMATCH')
  identityFailure = false
  // Abort an actual SQLite write in the transaction/preview stage.
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TRIGGER synthetic_finalize_failure BEFORE UPDATE OF state ON import_review_revisions
    BEGIN SELECT RAISE(ABORT, 'synthetic transaction failure'); END`)
  failsAt(busy.revision, 'transactionAndPreview')
  db.exec('DROP TRIGGER synthetic_finalize_failure')
  db.close()
  const success = {}
  store.finalizeRevision(busy.revision.id, { metrics: success })
  checkMetrics(success)
  await upload(redo.revision)
  chmodSync(destination(redo.revision), 0o600)
  writeFileSync(destination(redo.revision), Buffer.alloc(bytes.length))
  failsAt(redo.revision, 'fileHash', 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
  writeFileSync(destination(redo.revision), bytes)

  // Exercise actual route responses and a PUT paused while reuse/finalize run.
  const routes = createImportReviewRoutes({ getStore: () => store, getBlobStore: () => blob, agentToken: 'test' })
  async function call(method, routePath, request = Readable.from([]), input = null) {
    Object.assign(request, { method, headers: { authorization: 'Bearer test' } })
    const output = {}
    assert(await runRoutes(routes, { request, response: {}, url: new URL(`http://localhost${routePath}`),
      context: { readJsonBody: async () => input, sendJson(_response, status, body) { Object.assign(output, { status, body }) } } }))
    return output
  }
  for (const id of [busy.revision.id, 'rev-00000000-0000-0000-0000-000000000000']) {
    const response = await call('POST', `/api/import-agent-reviews/revisions/${id}/finalize`)
    checkMetrics(response.body.metrics, response.status === 200 ? 'succeeded' : 'failed', response.status === 200 ? null : 'status')
    if (response.status === 200) assert(!('metrics' in response.body.revision))
  }
  const pendingInput = manifest()
  const pending = await create(pendingInput, {})
  const failedPut = await call('PUT', `/api/import-agent-reviews/revisions/${pending.revision.id}/files?path=${file.path}`,
    Readable.from([Buffer.alloc(bytes.length)]))
  assert.equal(failedPut.status, 400)
  assert.equal(failedPut.body.metrics.failedStage, 'receive')
  let resume
  const waiting = new Promise(resolve => { resume = resolve })
  const request = Readable.from((async function* () { await waiting; yield bytes })())
  const uploading = call('PUT', `/api/import-agent-reviews/revisions/${pending.revision.id}/files?path=${file.path}`, request)
  await new Promise(resolve => setImmediate(resolve))
  let registered = false
  const registering = create(pendingInput).then(result => { registered = true; return result })
  let finalized = false
  const finalizing = call('POST', `/api/import-agent-reviews/revisions/${pending.revision.id}/finalize`)
    .then(result => { finalized = true; return result })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(registered, false)
  assert.equal(finalized, false)
  resume()
  const putResponse = await uploading
  assert.equal(putResponse.status, 200)
  checkMetrics(putResponse.body.metrics, 'succeeded', null, ['status', 'receive', 'adoption', 'installationAndMark'])
  assert.deepEqual((await registering).missingFiles, [json.path])
  assert.equal((await finalizing).body.code, 'IMPORT_REVIEW_UPLOAD_INCOMPLETE')
  const putReplay = await call('PUT', `/api/import-agent-reviews/revisions/${pending.revision.id}/files?path=${file.path}`)
  checkMetrics(putReplay.body.metrics, 'succeeded', null, ['status', 'receive', 'adoption', 'installationAndMark'])

  // Hold reuse asynchronously: finalize must wait; separate revisions may
  // enter the same blob concurrently without sharing a revision mutex.
  const together = [manifest(), manifest()]
  let resumeReuse
  const reuseWait = new Promise(resolve => { resumeReuse = resolve })
  let entered = 0
  const delayedBlob = { async reuseLocalFile(target, descriptor) {
    entered++
    await reuseWait
    return blob.reuseLocalFile(target, descriptor)
  } }
  const reusing = together.map(input => create(input, delayedBlob))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(entered, 2, 'two revisions reuse the same blob concurrently')
  const heldRevision = store.createRevision(together[0]).revision
  let reuseFinalized = false
  const afterReuse = store.finalizeUploadedRevision(heldRevision.id).then(
    () => { throw new Error('JSON remains missing') },
    error => { reuseFinalized = true; return error },
  )
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reuseFinalized, false, 'finalize awaits active reuse')
  resumeReuse()
  const reused = await Promise.all(reusing)
  assert(reused.every(result => !result.missingFiles.includes(file.path)))
  assert.equal((await afterReuse).code, 'IMPORT_REVIEW_UPLOAD_INCOMPLETE')
  assert.equal(statSync(destination(reused[0].revision)).ino, statSync(destination(reused[1].revision)).ino)
  const registrationInput = manifest()
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await call('POST', '/api/import-agent-reviews/revisions', Readable.from([]), registrationInput)
    assert.equal(response.status, 201)
    checkMetrics(response.body.metrics, 'succeeded', null, ['registration', 'reuse'])
    assert(!('metrics' in response.body.revision))
  }
  assert(logs.some(log => log.event === 'import-review-blob-reused' && log.actor === 'reuse-test-agent'
    && log.sourceRevisionId && log.sourcePath && log.verifiedAt && log.sha256 === file.sha256))
  assert(logs.some(log => log.metrics?.operation === 'put' && log.metrics.outcome === 'succeeded'))
  assert(logs.some(log => log.metrics?.operation === 'register' && log.metrics.durationsMs.reuse >= 0))
  console.info = originalLog
  console.info('PASS import-review upload reuse, async mutex, single source hash, and response metrics')
} finally {
  console.info = originalLog
  rmSync(root, { recursive: true, force: true })
}
