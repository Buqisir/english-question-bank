import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, openSync, closeSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-file-hash-'))
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
try {
  const store = createImportReviewStore({
    dbPath: path.join(root, 'review.sqlite'), filesRoot: path.join(root, 'files'), rendererBuildId: 'hash-fixture',
  })
  const sizes = [0, 1, 65535, 65536, 65537, ...Array(3).fill(32 * 1024 * 1024)]
  const files = sizes.map((size, index) => {
    const bytes = Buffer.alloc(size, index)
    return { path: `source/input-${index}.bin`, sha256: digest(bytes), byteLength: size,
      mediaType: 'application/octet-stream', role: 'source' }
  })
  const identity = digest(Buffer.from('hash-fixture'))
  const manifest = {
    schemaVersion: 'web-import-review-bundle-v1', paperId: 'paper-hash-fixture', paperName: 'Hash fixture',
    sourceDigest: identity, candidateDigest: identity, visibleStructureDigest: identity, analysisDigest: identity,
    producerBuildId: 'hash-fixture', files,
  }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  const { revision } = store.createRevision(manifest)
  for (const [index, file] of files.entries()) {
    const { destination } = store.fileForUpload(revision.id, file.path)
    mkdirSync(path.dirname(destination), { recursive: true })
    // Keep setup memory bounded to one file, like the production uploader.
    const bytes = Buffer.alloc(file.byteLength, index)
    writeFileSync(destination, bytes)
    store.completeFileUpload(revision.id, file.path, file)
  }
  async function observe(finalize) {
    let last = performance.now()
    const delays = []
    const interval = setInterval(() => {
      const now = performance.now()
      delays.push(now - last)
      last = now
    }, 1)
    let failure
    try { await finalize() } catch (error) { failure = error }
    await new Promise(resolve => setTimeout(resolve, 5))
    clearInterval(interval)
    return { failure, maxDelayMs: Math.max(...delays), samples: delays.length }
  }
  const synchronous = await observe(() => store.finalizeRevision(revision.id))
  const asynchronous = await observe(() => store.finalizeUploadedRevision(revision.id))
  for (const { failure } of [synchronous, asynchronous]) {
    // Deliberately no config: both paths must accept every file's exact digest,
    // then fail identically at projection without committing any revision.
    assert.equal(failure.code, 'IMPORT_REVIEW_CANDIDATE_INVALID')
    assert.equal(failure.metrics.failedStage, 'projection')
  }
  assert.equal(asynchronous.failure.message, synchronous.failure.message)
  // Event-loop delay is reported, not asserted: shared CI runners can invert a
  // single wall-clock comparison through scheduling, GC or worker start-up.
  assert.equal(store.getRevision(revision.id).state, 'uploading')

  const changedFile = files.at(-1)
  const changedPath = store.fileForUpload(revision.id, changedFile.path).destination
  const descriptor = openSync(changedPath, 'r+')
  try { writeSync(descriptor, Buffer.from([255]), 0, 1, 0) } finally { closeSync(descriptor) }
  let synchronousError
  try { store.finalizeRevision(revision.id) } catch (error) { synchronousError = error }
  await assert.rejects(store.finalizeUploadedRevision(revision.id), error =>
    error.code === synchronousError.code && error.message === synchronousError.message
    && error.metrics.failedStage === 'fileHash')
  assert.equal(synchronousError.code, 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
  assert.equal(store.getRevision(revision.id).state, 'uploading')
  console.log(JSON.stringify({
    check: 'review-file-hash', bytes: sizes.reduce((sum, size) => sum + size, 0),
    sizes, synchronousMaxDelayMs: synchronous.maxDelayMs, streamingMaxDelayMs: asynchronous.maxDelayMs,
    synchronousHashMs: synchronous.failure.metrics.durationsMs.fileHash,
    streamingHashMs: asynchronous.failure.metrics.durationsMs.fileHash,
    digestAndFailureSemantics: 'identical',
  }))
} finally {
  rmSync(root, { recursive: true, force: true })
}
