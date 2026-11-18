#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { prepareNck1AnalyzedPackageReview } from '../server/paper-import/analyzedPackage.mjs'
import { readSourceReferencePublication } from '../server/paper-import/sourceReferencePublication.mjs'
import { validateSourceReferences } from '../server/paper-import/sourceReferences.mjs'
import { buildAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { enumerateParagraphSummaryTargets } from '../server/paper-import-ai/paragraphSummaries.mjs'
import { runRoutes } from '../server/router/index.mjs'
import { finalizeReviewFixture, freezeReviewFixture } from './lib/reviewPublicationFixture.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot, makeExternalAnalyzedPackage, publicMetadataFixture } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-eligibility-'))
const repository = path.resolve(import.meta.dirname, '..')
const json = (file, value) => writeFileSync(file, JSON.stringify(value))
let checks = 0
const pass = label => { checks++; console.log(`PASS ${label}`) }
const dbRun = (file, callback) => {
  const db = new DatabaseSync(file)
  try { return callback(db) } finally { db.close() }
}
try {
  const output = path.join(root, 'guards')
  const native = makeReviewRoot(path.join(root, 'native'), 'paper-eligibility-native', undefined, { listening: true })
  const projection = freezeReviewFixture(native.reviewRoot)
  const { store, revision, approval, dbPath } = finalizeReviewFixture({ directory: native.reviewRoot, output, projection })
  const originalPreview = store.productPreviewForRevision(revision.id).preview
  const requestId = `publication-request-${randomUUID()}`
  const secretHash = sha256('synthetic-grant')
  store.registerPublicationRequest(revision.paperId, { requestId, revisionId: revision.id, secretHash }, 'agent')
  store.grantPublicationRequest(requestId, 'owner')
  dbRun(dbPath, db => {
    // Even a retained equal row cannot stand in for a sealed publication.
    db.exec(`INSERT INTO review_compatibility (revision_id, target_build_id, comparator_version, attempt_no,
      subject_digest, bundle_digest, result, reason_code, evidence_digest, evidence_json, checked_at)
      SELECT revision_id, 'sha256:' || printf('%064d', 1), 'review-comparator-v1', 1,
      subject_digest, bundle_digest, 'equal', 'CONTENT_EQUAL', subject_digest, '{}', created_at FROM review_subject`)
    db.prepare('UPDATE import_review_product_previews SET sealed_publication_manifest_digest=NULL WHERE revision_id=?').run(revision.id)
  })
  const denied = { code: 'IMPORT_REVIEW_RENDERER_STALE', reasonCode: 'SEALED_PUBLICATION_REQUIRED', message: '此版本需重新送审' }
  for (const operation of [
    () => store.beginPromotion(revision.paperId, { ...approval, intent: 'ship' }, 'owner'),
    () => store.beginScopedPromotion(revision.paperId, requestId, secretHash, 'agent'),
    () => store.acquireShippingGuard(revision.paperId, approval, 'ship-agent'),
    () => store.projectionForRevision(revision.id),
  ]) assert.throws(operation, denied)
  assert.equal(store.latestPromotion(revision.paperId), null)
  assert.equal(store.listPapers()[0].rendererStale, true)
  assert.equal(store.paperDetail(revision.paperId).rendererStale, true)
  assert.deepEqual(store.productPreviewForRevision(revision.id).preview, originalPreview)
  dbRun(dbPath, db => db.prepare("UPDATE import_review_revisions SET state='awaiting_review', approval_receipt_json=NULL WHERE id=?").run(revision.id))
  assert.throws(() => store.approveRevision(revision.paperId, revision.id,
    { bundleDigest: revision.bundleDigest }, 'owner'), denied)
  pass('unsealed Candidate cannot be approved or published even with retained equal')
  const routes = createImportReviewRoutes({ getStore: () => store, buildPrintHtml() { throw new Error('Must not derive pending content') } })
  async function readRoute(suffix) {
    const result = { headers: {} }
    const response = { setHeader(key, value) { result.headers[key] = value },
      writeHead(status, headers) { result.status = status; Object.assign(result.headers, headers) },
      end(body) { result.body ??= body } }
    await runRoutes(routes, { request: { method: 'GET' }, response,
      url: new URL(`http://fixture/api/import-review-preview/revisions/${revision.id}/${suffix}`),
      context: { session: { role: 'owner' }, sendJson(_response, status, body) { Object.assign(result, { status, body }) } } })
    return result
  }
  for (const suffix of ['consumption', 'asset/paper-asset.json', 'products', 'pdf?edition=economy8', 'print?edition=economy8']) {
    const value = await readRoute(suffix)
    assert.equal(value.status, 200, suffix)
    if (suffix === 'consumption') assert.equal(value.headers['x-eqb-review-compatibility'], 'unknown')
  }
  for (const suffix of ['pagination', 'print', 'pdf']) {
    const value = await readRoute(suffix)
    assert.equal(value.status, 409, suffix)
    assert.equal(value.body.reasonCode, 'SEALED_PUBLICATION_REQUIRED')
  }
  pass('cached payload and frozen originals remain readable; live routes expose the resubmission error')
  dbRun(dbPath, db => db.prepare('DELETE FROM import_review_product_previews WHERE revision_id=?').run(revision.id))
  assert.equal((await readRoute('consumption')).body.code, 'IMPORT_REVIEW_PREVIEW_NOT_PREPARED')
  assert.equal(dbRun(dbPath, db => db.prepare('SELECT count(*) n FROM import_review_product_previews').get().n), 0)
  pass('missing original Screen is rejected without creating a replacement')

  for (const profile of ['external', 'public']) {
    const directory = path.join(root, profile)
    const native = makeReviewRoot(directory, `paper-eligibility-${profile}`, undefined, { listening: true })
    let source = native.reviewRoot
    if (profile === 'external') {
      const packageRoot = path.join(directory, 'package')
      makeExternalAnalyzedPackage(source, packageRoot)
      source = path.join(directory, 'external-review')
      await prepareNck1AnalyzedPackageReview({ sourcePath: packageRoot, destinationDir: source,
        expectedPaperId: `paper-eligibility-${profile}` })
    } else {
      const configPath = path.join(source, 'config.json')
      json(configPath, { ...JSON.parse(readFileSync(configPath)), importProfile: 'public-paper-v1' })
      const projection = native.projection
      json(path.join(source, 'paragraph-summaries-v1.json'), {
        schemaVersion: 'paragraph-summaries-v1', paperId: projection.paperId,
        sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
        groups: [...Map.groupBy(enumerateParagraphSummaryTargets(projection.materialization), target => target.groupId)]
          .map(([groupId, values]) => ({ groupId, paragraphs: values.map(({ paragraphId }) => ({ paragraphId, summary: `摘要 ${paragraphId}` })) })),
      })
      json(path.join(source, 'public-search-metadata-v1.json'), publicMetadataFixture(projection.materialization,
        projection.sourceDigest, projection.candidateDigest))
    }
    const projection = freezeReviewFixture(source)
    if (profile === 'external') {
      const input = { sidecar: projection.sourceReferences, materialization: projection.materialization,
        sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest, sourceInput: projection.sourceInput }
      assert.deepEqual(validateSourceReferences(input), [])
      for (const mutate of [
        source => { source.documentSha256 = sha256('wrong official member') },
        source => { source.locator.pointer = '/missing-official-reference' },
        source => { source.locator.pointer = '/__proto__' },
        source => {
          const content = projection.sourceInput.members.find(member => member.role === 'content')
          source.documentSha256 = sha256(content.bytes)
          source.locator.documentId = content.memberId
        },
      ]) {
        const sidecar = structuredClone(projection.sourceReferences)
        mutate(sidecar.groups[0].essays.evidence[0])
        assert.ok(validateSourceReferences({ ...input, sidecar }).length)
      }
      const sourceInput = structuredClone(projection.sourceInput)
      const official = sourceInput.members.find(member => member.role === 'official_answers')
      official.bytes = Buffer.from(`${Buffer.from(official.bytes)} `)
      assert.ok(validateSourceReferences({ ...input, sourceInput }).length)
      pass('external answer references reject wrong SHA, missing/inherited pointer, wrong role and altered sealed member')
    }
    const fixture = finalizeReviewFixture({ directory: source, output: path.join(directory, 'reviewed'), projection })
    const bank = path.join(directory, 'bank.sqlite')
    dbRun(bank, db => db.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8')))
    const service = createSinglePaperPromotionService({ getStore: () => fixture.store,
      openDatabase: () => new DatabaseSync(bank), paperAssetsDir: path.join(directory, 'assets'),
      blobStore: (await import('../server/paper-import/blobStore.mjs')).createBlobStore({ rootDir: path.join(directory, 'blobs') }) })
    const result = await service.promote(projection.paperId, { ...fixture.approval, intent: 'ship' }, 'synthetic-owner')
    assert.equal(result.promotion.state, 'published', JSON.stringify(result))
    const consumption = Object.values(result.consumers)[0]
    const sourceReferences = dbRun(bank, db => readSourceReferencePublication({ db, paperAssetsDir: path.join(directory, 'assets'), consumption }))
    assert.match(buildAnswerOnlyHtml(sourceReferences), /data-answer-section="keys"/)
    for (const file of projection.frozenProducts.manifest.files) assert.deepEqual(readFileSync(
      path.join(directory, 'assets', projection.paperId, 'versions/v1', file.path)), projection.frozenProducts.bytes[file.path])
    assert.equal(JSON.stringify(fixture.store.getRevision(fixture.revision.id).approval), JSON.stringify(fixture.approval))
    pass(`${profile} real finalize/seal/approval/archive/admission/writer/DB/answer-source replay preserves frozen bytes and original approval`)
  }
  console.log(`PASS ${checks} review eligibility checks`)
} finally { rmSync(root, { recursive: true, force: true }) }
