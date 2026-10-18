import assert from 'node:assert/strict'
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  function create(input, backend = blob) {
    const result = store.createRevision(input, { blobStore: backend, actor: 'reuse-test-agent' })
    manifests.set(store.revisionDirectory(result.revision.id), input)
    return result
  }
  function destination(revision, descriptor = file) {
    return path.join(store.revisionDirectory(revision.id), descriptor.path)
  }
  function upload(revision, descriptor = json, content = jsonBytes) {
    const lease = store.beginFileUpload(revision.id, descriptor.path)
    try {
      mkdirSync(path.dirname(lease.destination), { recursive: true })
      writeFileSync(lease.destination, content)
      store.completeFileUpload(revision.id, descriptor.path, descriptor)
    } finally { lease.release() }
  }
  function checkMetrics(metrics, outcome = 'succeeded', failedStage = null) {
    assert.equal(metrics.outcome, outcome)
    assert.equal(metrics.failedStage, failedStage)
    assert.deepEqual(Object.keys(metrics.durationsMs), phases)
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
  const first = create(originalInput)
  assert.deepEqual(first.missingFiles, [json.path, file.path])
  const staged = path.join(root, 'staged')
  writeFileSync(staged, bytes)
  await blob.adoptLocalFile(staged, file)
  upload(first.revision, file, bytes)
  upload(first.revision)
  const initialMetrics = {}
  store.finalizeRevision(first.revision.id, { metrics: initialMetrics })
  checkMetrics(initialMetrics)
  const replayMetrics = {}
  store.finalizeRevision(first.revision.id, { metrics: replayMetrics })
  checkMetrics(replayMetrics)
  assert.equal(replayMetrics.durationsMs.fileHash, 0)
  assert.equal(create(originalInput).revision.id, first.revision.id, 'completed manifest replay remains compatible')

  const redoInput = manifest()
  const redo = create(redoInput)
  const candidate = create(manifest('candidate'))
  for (const result of [redo, candidate]) {
    assert.deepEqual(result.missingFiles, [json.path], 'OCR redo and OCR to Candidate reuse assets, never JSON')
    assert.equal(statSync(destination(result.revision)).ino,
      statSync(path.join(root, 'blobs/eqb-blobs/v1/sha256', file.sha256.slice(7))).ino)
    assert.equal(result.revision.approval, null)
  }
  rmSync(store.revisionDirectory(first.revision.id), { recursive: true })
  assert.deepEqual(readFileSync(destination(redo.revision)), bytes, 'removing an older revision keeps linked bytes readable')
  assert(create(manifest('ocr', 'paper-other')).missingFiles.includes(file.path), 'cross-paper reuse is forbidden')
  assert(create(manifest(), {}).missingFiles.includes(file.path), 'no local adoption backend falls back to upload')
  for (const mediaType of ['image/png', 'application/pdf', 'application/octet-stream']) {
    const asset = { ...file, path: `source/${mediaType.split('/')[1]}`, mediaType }
    const result = create(manifest('candidate', 'paper-reuse-test', [asset, json]))
    assert.equal(result.missingFiles.includes(asset.path), mediaType === 'application/octet-stream')
  }
  const unuploaded = manifest('ocr', 'paper-not-uploaded')
  create(unuploaded, {})
  assert(create(manifest('candidate', 'paper-not-uploaded')).missingFiles.includes(file.path),
    'same-paper record without uploaded_at is not reuse authority')
  const exdevInput = manifest()
  assert.throws(() => create(exdevInput, {
    reuseLocalFile() { throw Object.assign(new Error('synthetic EXDEV'), { code: 'EXDEV' }) },
  }), error => error.code === 'EXDEV' && error.metrics.failedStage === 'reuse')
  assert(create(exdevInput, {}).missingFiles.includes(file.path), 'EXDEV never marks or silently copies')

  // Blob absence, equal-length damage, and symlinks must fall back, not mark.
  const blobPath = path.join(root, 'blobs/eqb-blobs/v1/sha256', file.sha256.slice(7))
  unlinkSync(blobPath)
  assert(create(manifest()).missingFiles.includes(file.path))
  writeFileSync(blobPath, Buffer.alloc(bytes.length, 0x78))
  assert(create(manifest()).missingFiles.includes(file.path))
  unlinkSync(blobPath)
  symlinkSync(destination(redo.revision), blobPath)
  assert(create(manifest()).missingFiles.includes(file.path))
  unlinkSync(blobPath)
  mkdirSync(blobPath)
  assert(create(manifest()).missingFiles.includes(file.path), 'non-regular blobs fall back to upload')
  rmSync(blobPath, { recursive: true })
  await blob.put(bytes, file.mediaType)

  // Installed before a crash/mark: a dead worker's lease is recovered and its
  // already-present destination is verified before uploaded_at is repaired.
  const crashedInput = manifest()
  const crashed = create(crashedInput, {})
  const worker = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createImportReviewStore } from ${JSON.stringify(new URL('../server/import-review/importReviewStore.mjs', import.meta.url).href)};
    import { createBlobStore } from ${JSON.stringify(new URL('../server/paper-import/blobStore.mjs', import.meta.url).href)};
    const store = createImportReviewStore(${JSON.stringify({ dbPath, filesRoot, rendererBuildId: 'reuse-test' })});
    const lease = store.beginFileUpload(${JSON.stringify(crashed.revision.id)}, ${JSON.stringify(file.path)});
    createBlobStore({ rootDir: ${JSON.stringify(path.join(root, 'blobs'))} }).reuseLocalFile(lease.destination, ${JSON.stringify(file)});
    process.exit(0);
  `], { encoding: 'utf8' })
  assert.equal(worker.status, 0, worker.stderr)
  assert(store.uploadStatus(crashed.revision.id).missingFiles.includes(file.path))
  assert.deepEqual(create(crashedInput).missingFiles, [json.path])

  const wrongInput = manifest()
  const wrong = create(wrongInput, {})
  const wrongPath = destination(wrong.revision)
  mkdirSync(path.dirname(wrongPath), { recursive: true })
  writeFileSync(wrongPath, Buffer.alloc(bytes.length))
  assert(create(wrongInput).missingFiles.includes(file.path), 'existing unequal destination is never replaced')
  assert.deepEqual(readFileSync(wrongPath), Buffer.alloc(bytes.length))
  unlinkSync(wrongPath)
  symlinkSync(destination(redo.revision), wrongPath)
  assert(create(wrongInput).missingFiles.includes(file.path), 'existing symlink is never accepted')

  const changedStateInput = manifest()
  const changedState = create(changedStateInput, {})
  assert.throws(() => create(changedStateInput, { reuseLocalFile(target, descriptor) {
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
  const busy = create(busyInput, {})
  const lease = store.beginFileUpload(busy.revision.id, file.path)
  assert.throws(() => store.beginFileUpload(busy.revision.id, file.path), { code: 'IMPORT_REVIEW_UPLOAD_BUSY' })
  const contender = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createImportReviewStore } from ${JSON.stringify(new URL('../server/import-review/importReviewStore.mjs', import.meta.url).href)};
    const store = createImportReviewStore(${JSON.stringify({ dbPath, filesRoot, rendererBuildId: 'reuse-test' })});
    assert.throws(() => store.beginFileUpload(${JSON.stringify(busy.revision.id)}, ${JSON.stringify(file.path)}), { code: 'IMPORT_REVIEW_UPLOAD_BUSY' });
    assert.throws(() => store.finalizeRevision(${JSON.stringify(busy.revision.id)}), { code: 'IMPORT_REVIEW_UPLOAD_BUSY' });
  `], { encoding: 'utf8' })
  assert.equal(contender.status, 0, contender.stderr)
  assert(create(busyInput).missingFiles.includes(file.path), 'registration skips a path with active PUT')
  failsAt(busy.revision, 'status', 'IMPORT_REVIEW_UPLOAD_BUSY')
  lease.release()
  assert.deepEqual(create(busyInput).missingFiles, [json.path])
  failsAt(busy.revision, 'status', 'IMPORT_REVIEW_UPLOAD_INCOMPLETE')
  upload(busy.revision)
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
  upload(redo.revision)
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
  const pending = create(pendingInput, {})
  const failedPut = await call('PUT', `/api/import-agent-reviews/revisions/${pending.revision.id}/files?path=${file.path}`,
    Readable.from([Buffer.alloc(bytes.length)]))
  assert.equal(failedPut.status, 400)
  assert.equal(failedPut.body.metrics.failedStage, 'receive')
  let resume
  const waiting = new Promise(resolve => { resume = resolve })
  const request = Readable.from((async function* () { await waiting; yield bytes })())
  const uploading = call('PUT', `/api/import-agent-reviews/revisions/${pending.revision.id}/files?path=${file.path}`, request)
  await new Promise(resolve => setImmediate(resolve))
  assert(create(pendingInput).missingFiles.includes(file.path))
  const blocked = await call('POST', `/api/import-agent-reviews/revisions/${pending.revision.id}/finalize`)
  assert.equal(blocked.body.code, 'IMPORT_REVIEW_UPLOAD_BUSY')
  resume()
  assert.equal((await uploading).status, 200)
  assert.deepEqual(create(pendingInput).missingFiles, [json.path])
  assert(logs.some(log => log.event === 'import-review-blob-reused' && log.actor === 'reuse-test-agent'
    && log.sourceRevisionId && log.sourcePath && log.verifiedAt && log.sha256 === file.sha256))
  assert(logs.some(log => log.metrics?.operation === 'put' && log.metrics.outcome === 'succeeded'))
  assert(logs.some(log => log.metrics?.operation === 'register' && log.metrics.durationsMs.reuse >= 0))
  console.info = originalLog
  console.info('PASS import-review upload reuse, locks, crash recovery, and metrics')
} finally {
  console.info = originalLog
  rmSync(root, { recursive: true, force: true })
}
