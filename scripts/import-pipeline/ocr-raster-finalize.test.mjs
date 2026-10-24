import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import '../lib/reviewTestLockRoot.mjs'
import { createImportReviewStore, ocrReviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../../server/import-review/importReviewRoutes.mjs'
import { buildNck1OcrReviewProjection } from '../../server/import-review/revisionProjection.mjs'
import { nck1OcrEvidenceDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { runRoutes } from '../../server/router/index.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

const previous = process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
let fixtures
try {
  process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = '1'
  fixtures = await import('../verify-import-review-ocr-confirmation.mjs')
} finally {
  if (previous === undefined) delete process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
  else process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = previous
}

test('OCR finalize rejects a digest-closed raster mismatch with 422 through the real worker and route', async () => {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'raster-finalize-'))
  try {
    const staging = path.join(dir, 'staging')
    mkdirSync(staging)
    const { evidence } = fixtures.writeSyntheticSource(staging)
    const manifest = fixtures.reviewManifest(staging)
    assert(buildNck1OcrReviewProjection(staging), 'unmodified evidence replays')
    const evidencePath = 'materialization/nck1-ocr-source-evidence-v1.json'
    const originalEvidenceBytes = readFileSync(path.join(staging, evidencePath))
    const validManifest = structuredClone(manifest)
    evidence.documents[0].pages[0].raster.sha256 = sha256(new TextEncoder().encode('different pixels'))
    evidence.evidenceDigest = nck1OcrEvidenceDigest(evidence)
    writeFileSync(path.join(staging, evidencePath), JSON.stringify(evidence))
    const changedBytes = readFileSync(path.join(staging, evidencePath))
    Object.assign(manifest.files.find(file => file.path === evidencePath), {
      sha256: sha256(changedBytes), byteLength: changedBytes.length,
    })
    manifest.evidenceDigest = evidence.evidenceDigest
    manifest.bundleDigest = ocrReviewBundleDigest(manifest)
    const store = createImportReviewStore({ dbPath: path.join(dir, 'review.sqlite'),
      filesRoot: path.join(dir, 'files'), rendererBuildId: 'raster-finalize-test' })
    const created = store.createRevision(manifest)
    fixtures.uploadRevision(store, created, staging, manifest.files)
    let result
    const routes = createImportReviewRoutes({ getStore: () => store, agentToken: 'fixture-token' })
    const handled = await runRoutes(routes, {
      request: { method: 'POST', headers: { authorization: 'Bearer fixture-token' } }, response: {},
      url: new URL(`http://127.0.0.1/api/import-agent-reviews/revisions/${created.revision.id}/finalize`),
      context: { sendJson: (_response, status, body) => { result = { status, body } } },
    })
    assert(handled)
    assert.equal(result.status, 422, JSON.stringify(result.body))
    assert.equal(result.body.code, 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE')
    assert.match(result.body.error, /OCR page raster no longer replays from the immutable source/)
    assert.match(result.body.error, /documents\.question-source-1\.pages\.1\.raster/)
    assert.equal(store.getRevision(created.revision.id).state, 'uploading')
    assert.equal(store.getRevision(created.revision.id).finalizedAt, null)
    assert.equal(store.createRevision(manifest).revision.id, created.revision.id, 'same bundle resumes the existing upload')
    writeFileSync(path.join(staging, evidencePath), originalEvidenceBytes)
    const newManifest = { ...validManifest, producerBuildId: 'new-producer' }
    newManifest.bundleDigest = ocrReviewBundleDigest(newManifest)
    const next = store.createRevision(newManifest)
    assert.notEqual(next.revision.id, created.revision.id, 'a different bundle may coexist with an old uploading revision')
    fixtures.uploadRevision(store, next, staging, newManifest.files)
    assert.equal((await store.finalizeUploadedRevision(next.revision.id)).state, 'awaiting_review',
      'a valid replacement can finalize without deleting the failed upload')
    assert.equal(store.getRevision(created.revision.id).state, 'uploading', 'old evidence remains immutable')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
