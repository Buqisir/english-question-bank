import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { finalizeInventory, finalizeProjection } from '../server/import-review/finalizeComputation.mjs'
import { reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
let makeReviewRoot
try {
  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  ;({ makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs'))
} finally {
  if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
}
const root = fs.mkdtempSync(path.join(tmpdir(), 'eqb-bundle-reuse-'))
const originalRead = fs.readFileSync
try {
  const { reviewRoot } = makeReviewRoot(path.join(root, 'fixture'), 'paper-bundle-reuse', undefined, { listening: true })
  const revision = { reviewKind: 'candidate' }
  const manifestPath = path.join(reviewRoot, 'universal-source-manifest.json')
  let sourceLoads = 0
  fs.readFileSync = function (file, ...args) {
    // PDF input digests also read these bytes; count source parsing separately.
    if (String(file) === manifestPath && args[0] === 'utf8') sourceLoads++
    return originalRead.call(this, file, ...args)
  }
  syncBuiltinESMExports()
  const projection = finalizeProjection(reviewRoot, revision)
  const inventory = finalizeInventory(reviewRoot, revision, projection)
  assert.equal(sourceLoads, 1, 'one finalize must load and validate its source bundle only once')
  fs.readFileSync = originalRead
  syncBuiltinESMExports()
  assert.deepEqual(inventory, reviewBundleFilePaths(reviewRoot, projection.candidate)
    .map(({ path, mediaType, role }) => `${path}\0${mediaType}\0${role}`).sort())
  // A second request must validate disk again; a previous projection is no cache.
  fs.writeFileSync(path.join(reviewRoot, 'config.json'), '{invalid')
  assert.throws(() => finalizeProjection(reviewRoot, revision), { code: 'IMPORT_REVIEW_CANDIDATE_INVALID' })
  console.log('PASS bundle reuse: one source load, identical inventory, fresh-request fail-closed')
} finally {
  fs.readFileSync = originalRead
  syncBuiltinESMExports()
  fs.rmSync(root, { recursive: true, force: true })
}
