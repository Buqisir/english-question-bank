import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'
import { reviewPaginationMetadata } from '../server/import-review/reviewPagination.mjs'
import { reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { ABSENT_BY_EXAM_DESIGN, NO_LISTENING_PRODUCT_SCHEMA, manifestProductFiles, sourceProductEditions } from '../server/paper-import/pdfProductSet.mjs'
import { LARGE_PAGE_LIMIT_AUTHORIZATION } from '../server/paper-import/pdfPageLimits.mjs'
import { PRODUCT_MANIFEST, frozenProductResult, productInputDigest, readFrozenProducts, loadStoredProducts } from '../server/paper-import/frozenProducts.mjs'
import { buildPreprocessingReport } from '../server/paper-import/preprocessingReport.mjs'
import { SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { syntheticReviewReferences } from './lib/syntheticReviewAnswerFixture.mjs'
import { publishUniversalNck1Import } from '../server/paper-import/publisher.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { archiveReviewFiles, createBlobStore } from '../server/paper-import/blobStore.mjs'
import { prepareNck1AnalyzedPackageReview } from '../server/paper-import/analyzedPackage.mjs'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { finalizeReviewFixture, publicationFixtureInput } from './lib/reviewPublicationFixture.mjs'
import { reviewBuildIdentityProvider } from '../server/import-review/reviewBuildIdentity.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot, makeExternalAnalyzedPackage } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous

const previewRoot = process.env.EQB_NO_LISTENING_PREVIEW_DIR
const directory = previewRoot ? path.resolve(previewRoot) : mkdtempSync(path.join(tmpdir(), 'eqb-no-listening-products-'))
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2))
const db = new DatabaseSync(':memory:')
try {
  await reviewBuildIdentityProvider().ready()
  assert.throws(() => sourceProductEditions({}, 0), /听力声明/)
  assert.throws(() => sourceProductEditions({ listening: ABSENT_BY_EXAM_DESIGN }, 2), /听力声明/)
  assert.throws(() => sourceProductEditions({}, 1), /听力声明/)
  assert.throws(() => sourceProductEditions({ listening: 'missing-audio' }, 0), /听力声明/)
  const fixture = makeReviewRoot(directory, 'paper-no-listening-contract')
  const root = fixture.reviewRoot
  const packageRoot = path.join(directory, 'historical-package')
  const historicalRoot = path.join(directory, 'historical-review')
  makeExternalAnalyzedPackage(root, packageRoot)
  await prepareNck1AnalyzedPackageReview({
    sourcePath: packageRoot, destinationDir: historicalRoot, expectedPaperId: fixture.projection.paperId,
  })
  const historicalConfig = JSON.parse(readFileSync(path.join(historicalRoot, 'config.json')))
  delete historicalConfig.listening
  delete historicalConfig.pdfProductsRequired
  json(path.join(historicalRoot, 'config.json'), historicalConfig)
  assert.doesNotThrow(() => buildNck1ReviewProjection(historicalRoot),
    'historical analyzed packages without any PDF commitment retain their source-only contract')
  mkdirSync(path.join(historicalRoot, 'products'))
  for (const schemaVersion of ['paper-pdf-products-v1', 'paper-pdf-products-v2']) {
    const historicalManifest = { schemaVersion, paperId: fixture.projection.paperId,
      paperName: historicalConfig.provenance.paperName, inputDigest: sha256(Buffer.from('historical fixture')),
      ...(schemaVersion.endsWith('v2') ? { economyPageLimit: 9 } : {}), files: [] }
    for (const [index, edition] of ['largeComplete', 'largeNoListening', 'economy8', 'answerOnly'].entries()) {
      const pageCount = [12, 10, schemaVersion.endsWith('v2') ? 9 : 8, 2][index]
      const bytes = productPdfBytes(pageCount, edition)
      const file = { path: `products/${edition}.pdf`, mediaType: 'application/pdf', role: 'pdf_product',
        pageCount, byteLength: bytes.length, sha256: sha256(bytes) }
      writeFileSync(path.join(historicalRoot, file.path), bytes)
      historicalManifest.files.push(file)
    }
    json(path.join(historicalRoot, PRODUCT_MANIFEST), historicalManifest)
    assert.throws(() => buildNck1ReviewProjection(historicalRoot), /听力声明/,
      `${schemaVersion} removes the historical package exemption even when pdfProductsRequired is absent`)
  }
  const configPath = path.join(root, 'config.json')
  const config = JSON.parse(readFileSync(configPath))
  delete config.listening
  json(configPath, config)
  assert.throws(() => buildNck1ReviewProjection(root), /听力声明/)
  config.listening = ABSENT_BY_EXAM_DESIGN
  config.pdfProductsRequired = true
  config.provenance = { ...config.provenance, year: 2026, month: 4 }
  json(configPath, config)
  const projection = buildNck1ReviewProjection(root)
  assert.deepEqual(reviewPaginationMetadata(projection).editions.map(entry => entry.edition),
    ['largeNoListening', 'economy8', 'answerOnly'])
  const references = syntheticReviewReferences(projection)
  assert(references, 'expected the synthetic answer PDF')
  json(path.join(root, SOURCE_REFERENCES_FILE), references)
  if (previewRoot) {
    // The tiny fixture needs explicit group breaks to exercise strict eight pages.
    json(path.join(root, 'pagination-plan.json'), {
      schemaVersion: 'paper-pagination-plan-v4', paperId: projection.paperId,
      sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
      editions: { economy8: { targetPages: 8, includeListening: false, omitCover: false,
        coverGapsPt: null, allowSplitOptionBank: false,
        breakSlotIds: projection.paginationSlotBindings.filter(entry =>
          !['reading.a', 'writing.application'].includes(entry.slotId)).map(entry => entry.slotId),
        layout: { profile: 'student-friendly-v1', fontSizePt: 12, figureLayout: 'natural',
          answerBoxHeightsMm: { application: 65, continuation: 57 } } } },
    })
    execFileSync(process.execPath, ['scripts/import-pipeline/freeze-products.mjs', '--paper-dir', root],
      { cwd: path.resolve(import.meta.dirname, '..'), timeout: 180_000, stdio: 'inherit' })
  } else {
    mkdirSync(path.join(root, 'products'))
    const manifest = { schemaVersion: NO_LISTENING_PRODUCT_SCHEMA, listening: ABSENT_BY_EXAM_DESIGN,
      economyPageLimit: 8, paperId: projection.paperId, paperName: projection.paperName,
      examDate: { year: 2026, month: 4 }, inputDigest: productInputDigest(root, reviewBundleFilePaths(root)), files: [] }
    for (const [index, file] of manifestProductFiles(manifest).entries()) {
      const pageCount = [10, 8, 2][index]
      const bytes = productPdfBytes(pageCount, file.path)
      writeFileSync(path.join(root, file.path), bytes)
      manifest.files.push({ ...file, pageCount, byteLength: bytes.length, sha256: sha256(bytes) })
    }
    json(path.join(root, PRODUCT_MANIFEST), manifest)
  }
  let frozen = buildNck1ReviewProjection(root)
  assert.equal(frozen.frozenProducts.manifest.schemaVersion, NO_LISTENING_PRODUCT_SCHEMA)
  assert.throws(() => frozenProductResult(frozen.frozenProducts, 'largeComplete'), /产品不存在/)
  const pdfs = frozen.frozenProducts.manifest.files.map(file => ({
    edition: path.basename(file.path, '.pdf'), path: file.path, sha256: file.sha256,
  }))
  const check = { status: 'pass', detail: '合成测试文件的绑定检查，不代表真实试卷内容验收',
    checkedAt: '2026-10-19T00:00:00Z', files: pdfs }
  const reportEvidence = { schemaVersion: 'preprocessing-handoff-evidence-v5',
    paperId: projection.paperId, sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    pdfs, checks: { pdfContent: check, pdfVisual: check } }
  assert.match(buildPreprocessingReport(frozen, reportEvidence, { baseDirectory: root }), /3\/3 份/)
  assert.throws(() => buildPreprocessingReport({ ...frozen, config: {} }, reportEvidence), /explicit/)
  assert.throws(() => buildPreprocessingReport(frozen, { ...reportEvidence,
    pdfs: [...pdfs, { ...pdfs[0], edition: 'largeComplete' }] }), /invalid or duplicate PDF/)
  let manifest = frozen.frozenProducts.manifest
  const read = changed => file => file === PRODUCT_MANIFEST ? Buffer.from(JSON.stringify(changed)) : frozen.frozenProducts.bytes[file]
  assert.throws(() => readFrozenProducts(root, { readArtifact: read({ ...manifest, schemaVersion: 'paper-pdf-products-v1' }) }), /版本或听力声明/)
  assert.throws(() => readFrozenProducts(root, { readArtifact: read({ ...manifest, files: manifest.files.slice(1) }) }), /文件清单/)
  assert.throws(() => readFrozenProducts(root, { config: {}, listeningCount: 0 }), /听力声明/)
  assert.throws(() => readFrozenProducts(root, { config, listeningCount: 2 }), /听力声明/)
  if (!previewRoot) {
    // Keep the historical v3 checks above, then publish a v6/v4 successor through
    // the same exact Review/store seam; a manifest alone cannot opt the paper in.
    const entry = { targetPages: 11, includeListening: false, omitCover: false,
      coverGapsPt: null, allowSplitOptionBank: false, breakSlotIds: [],
      layout: { profile: 'student-friendly-v1', fontSizePt: 12, figureLayout: 'natural',
        answerBoxHeightsMm: { application: 65, continuation: 57 } } }
    const plan = { schemaVersion: 'paper-pagination-plan-v6', paperId: projection.paperId,
      sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
      pageLimitAuthorization: LARGE_PAGE_LIMIT_AUTHORIZATION, editions: { largeNoListening: entry } }
    const extended = { ...manifest, schemaVersion: 'paper-pdf-products-v4',
      pageLimits: { largeCompletePageLimit: 12, largeNoListeningPageLimit: 11, economyPageLimit: 8 },
      pageLimitAuthorization: LARGE_PAGE_LIMIT_AUTHORIZATION }
    delete extended.economyPageLimit
    extended.files = extended.files.map(file => {
      if (file.path !== 'products/largeNoListening.pdf') return file
      const bytes = productPdfBytes(11, file.path)
      writeFileSync(path.join(root, file.path), bytes)
      return { ...file, pageCount: 11, sha256: sha256(bytes), byteLength: bytes.length }
    })
    json(path.join(root, PRODUCT_MANIFEST), extended)
    assert.throws(() => buildNck1ReviewProjection(root), /文件清单/,
      'a v4 manifest cannot expand an undeclared paper')
    json(path.join(root, 'pagination-plan.json'), plan)
    extended.inputDigest = productInputDigest(root, reviewBundleFilePaths(root))
    json(path.join(root, PRODUCT_MANIFEST), extended)
    frozen = buildNck1ReviewProjection(root)
    manifest = frozen.frozenProducts.manifest
    assert.equal(reviewPaginationMetadata(frozen).editions[0].targetPages, 11)
    assert.equal(manifest.files[0].pageCount, 11)
    assert.deepEqual(frozen.paginationPlan.pageLimitAuthorization, LARGE_PAGE_LIMIT_AUTHORIZATION)
  }
  const files = reviewBundleFilePaths(root).map(file => {
    const bytes = readFileSync(path.join(root, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  })
  assert.equal(files.filter(file => file.role === 'pdf_product').length, 3)
  const approvedManifest = { schemaVersion: 'web-import-review-bundle-v1', paperId: projection.paperId,
    paperName: projection.paperName, sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest, analysisDigest: projection.analysisDigest,
    producerBuildId: 'no-listening-verifier', files, resolvesIssueIds: [] }
  approvedManifest.bundleDigest = reviewBundleDigest(approvedManifest)
  const blobStore = createBlobStore({ rootDir: path.join(directory, 'blobs') })
  const fileStorage = await archiveReviewFiles({ rootDir: root, manifest: approvedManifest, blobStore })
  db.exec(readFileSync(new URL('../data/sql/schema.sql', import.meta.url), 'utf8'))
  const paperAssetsDir = path.join(directory, 'published')
  const reviewed = finalizeReviewFixture({ directory: root, output: path.join(directory, 'reviewed'),
    manifest: approvedManifest, projection: frozen })
  const result = publishUniversalNck1Import({ reviewRootDir: root, approvedManifest, fileStorage,
    ...publicationFixtureInput(reviewed), fileStorage,
    canonicalRequest: loadCanonicalImportRequest(fixture.requestPath), db, paperAssetsDir })
  assert.equal(result.ok, true)
  const stored = await loadStoredProducts({ db, paperAssetsDir, blobStore,
    consumption: Object.values(result.publish.consumers)[0] })
  assert.equal(stored.manifest.files.length, 3)
  for (const file of manifest.files) assert.deepEqual(stored.bytes[file.path], frozen.frozenProducts.bytes[file.path])
  console.log(`PASS explicit no-listening declaration, three-product freeze/validation/report/publication/storage${previewRoot ? `; real PDFs retained at ${root}/products` : ''}`)
} finally {
  db.close()
  if (!previewRoot) rmSync(directory, { recursive: true, force: true })
}
