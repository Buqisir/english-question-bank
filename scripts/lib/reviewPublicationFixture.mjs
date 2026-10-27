import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { createImportReviewStore, reviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import { buildNck1ReviewProjection, loadNck1ReviewSource, reviewBundleFilePaths } from '../../server/import-review/revisionProjection.mjs'
import { manifestProductFiles, ABSENT_BY_EXAM_DESIGN } from '../../server/paper-import/pdfProductSet.mjs'
import { productInputDigest, PRODUCT_MANIFEST } from '../../server/paper-import/frozenProducts.mjs'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../../server/paper-import/sourceReferences.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { syntheticReviewReferences } from './syntheticReviewAnswerFixture.mjs'

const json = (file, value) => writeFileSync(file, JSON.stringify(value))
const read = file => JSON.parse(readFileSync(file))

// Invented PDFs, but real product/source-reference validation and real finalize.
// Call after fixture edits and before constructing the reviewed manifest.
export function freezeReviewFixture(directory, { expectedCandidateDigest } = {}) {
  const configPath = path.join(directory, 'config.json')
  const config = read(configPath)
  const loaded = loadNck1ReviewSource(directory)
  if (loaded.materialization.listening?.state !== 'captured') config.listening = ABSENT_BY_EXAM_DESIGN
  if (existsSync(path.join(directory, PRODUCT_MANIFEST))) unlinkSync(path.join(directory, PRODUCT_MANIFEST))
  config.pdfProductsRequired = true
  config.provenance.year ??= 2026
  config.provenance.month ??= 10
  json(configPath, config)
  const options = { expectedCandidateDigest, requireAnalyses: true }
  const projection = buildNck1ReviewProjection(directory, options)
  if (!existsSync(path.join(directory, SOURCE_REFERENCES_FILE))) {
    const references = syntheticReviewReferences(projection) || prepareSourceReferences(projection)
    const documents = projection.materialization.documents || []
    const evidence = documents.filter(file => file.role === 'official_answers').map(file => ({
      documentSha256: file.sha256, locator: { kind: 'page_region', documentId: file.documentId,
        page: 1, region: { x: 0, y: 0, width: 1, height: 1 } },
    }))
    if (!evidence.length) evidence.push(...(projection.sourceInput.members || [])
      .filter(member => member.role === 'official_answers').map(member => ({
        documentSha256: sha256(member.bytes),
        locator: { kind: 'package_json_pointer', documentId: member.memberId, pointer: '' },
      })))
    for (const group of references.groups) for (const kind of ['essays', 'scoring']) {
      // prepareSourceReferences already supplies the original package's provenance.
      if (evidence.length && group[kind].state === 'unprocessed') group[kind] = { state: 'not_supplied', evidence, entries: [] }
    }
    json(path.join(directory, SOURCE_REFERENCES_FILE), references)
  }
  mkdirSync(path.join(directory, 'products'), { recursive: true })
  const noListening = projection.materialization.listening?.state !== 'captured'
  const manifest = { schemaVersion: noListening ? 'paper-pdf-products-v3' : 'paper-pdf-products-v1',
    ...(noListening ? { listening: ABSENT_BY_EXAM_DESIGN, economyPageLimit: 8 } : {}),
    paperId: projection.paperId, paperName: projection.paperName,
    examDate: { year: config.provenance.year, month: config.provenance.month },
    inputDigest: productInputDigest(directory, reviewBundleFilePaths(directory)), files: [] }
  for (const [index, file] of manifestProductFiles(manifest).entries()) {
    const pageCount = (noListening ? [10, 8, 2] : [12, 10, 8, 2])[index]
    const bytes = productPdfBytes(pageCount, file.path)
    writeFileSync(path.join(directory, file.path), bytes)
    manifest.files.push({ ...file, pageCount, sha256: sha256(bytes), byteLength: bytes.length })
  }
  json(path.join(directory, PRODUCT_MANIFEST), manifest)
  return buildNck1ReviewProjection(directory, options)
}

export function reviewFixtureManifest(directory, projection) {
  const manifest = { schemaVersion: projection.importProfile ? 'web-import-review-bundle-v2' : 'web-import-review-bundle-v1',
    paperId: projection.paperId, paperName: projection.paperName,
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    ...(projection.importProfile ? { importProfile: projection.importProfile,
      paragraphSummariesDigest: projection.paragraphSummariesDigest,
      publicSearchMetadataDigest: projection.publicSearchMetadataDigest } : {}),
    ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}),
    producerBuildId: 'reviewed-publication-fixture', resolvesIssueIds: [],
    files: reviewBundleFilePaths(directory).map(file => {
      const bytes = readFileSync(path.join(directory, file.path))
      return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
    }) }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  return manifest
}

export function finalizeReviewFixture({ directory, output, manifest, projection,
  rendererBuildId = 'fixture-original-renderer', store: suppliedStore, approve = true }) {
  if (!projection && !manifest) projection = buildNck1ReviewProjection(directory)
  manifest ||= reviewFixtureManifest(directory, projection)
  const dbPath = path.join(output, 'review.sqlite')
  const store = suppliedStore || createImportReviewStore({ dbPath, filesRoot: path.join(output, 'files'), rendererBuildId })
  const revision = store.createRevision(manifest).revision
  for (const file of manifest.files) {
    const upload = store.fileForUpload(revision.id, file.path)
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, readFileSync(path.join(directory, file.path)))
    store.completeFileUpload(revision.id, file.path, file)
  }
  store.finalizeRevision(revision.id)
  const approval = approve ? store.approveRevision(manifest.paperId, revision.id, {
    bundleDigest: revision.bundleDigest, ...(manifest.importProfile ? { approvalScope: 'layout_only' } : {}),
  }, 'synthetic-owner') : null
  return { store, revision: store.getRevision(revision.id), approval, manifest, projection, dbPath }
}

// Existing universal verifier has synchronous failure/recovery probes. Archive
// in a short child using the production async archiver, retaining real blobs.
export function publicationFixtureInput(fixture) {
  if (fixture.publicationInput) return fixture.publicationInput
  const { store, revision, approval, manifest, dbPath } = fixture
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let approvedReviewSubject
  try { approvedReviewSubject = JSON.parse(db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?')
    .get(revision.id).subject_json) } finally { db.close() }
  const rootDir = store.revisionDirectory(revision.id)
  const program = `
    import { archiveReviewFiles, createBlobStore } from ${JSON.stringify(new URL('../../server/paper-import/blobStore.mjs', import.meta.url).href)};
    import { readFileSync } from 'node:fs';
    const [rootDir, manifestPath, blobs] = process.argv.slice(1);
    console.log(JSON.stringify(await archiveReviewFiles({ rootDir, manifest: JSON.parse(readFileSync(manifestPath)),
      blobStore: createBlobStore({ rootDir: blobs }) })));
  `
  const manifestPath = path.join(path.dirname(dbPath), 'approved-manifest.json')
  json(manifestPath, manifest)
  const fileStorage = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program,
    rootDir, manifestPath, path.join(path.dirname(dbPath), 'blobs')], { encoding: 'utf8', timeout: 120_000 }))
  const begun = store.beginPromotion(manifest.paperId, { ...approval, intent: 'ship' }, 'synthetic-owner')
  return fixture.publicationInput = { approvedManifest: manifest, approvedIdentity: approval, approvedReviewSubject, fileStorage,
    onPrepared(target) {
      store.recordPromotionTarget(manifest.paperId, begun.promotion.promotionId, target)
    },
    withPreparedReviewSubject(snapshot, write) {
      return store.withPromotionContentGuard(manifest.paperId, begun.promotion.promotionId, begun.contentBinding, context => {
        if (context.promotion.assetVersion !== snapshot.version
          || context.promotion.canonicalPublicationDigest !== snapshot.admission.sealed.manifest.publicationDigest) {
          throw new Error('Fixture publication differs from its recorded promotion target')
        }
        return write()
      })
    } }
}
