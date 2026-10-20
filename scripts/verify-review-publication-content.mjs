#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { deserialize } from 'node:v8'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { publishUniversalNck1Import } from '../server/paper-import/publisher.mjs'
import { buildPaperImportOutputInventory, writePaperImportVersion } from '../server/paper-import/storage.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { archiveReviewFiles, createBlobStore } from '../server/paper-import/blobStore.mjs'
import { manifestProductFiles } from '../server/paper-import/pdfProductSet.mjs'
import { productInputDigest } from '../server/paper-import/frozenProducts.mjs'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-publication-'))
const json = (file, value) => writeFileSync(file, JSON.stringify(value))
const readJson = file => JSON.parse(readFileSync(file))
function outputFiles(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const file = `${prefix}${entry.name}`
    return entry.isDirectory() ? outputFiles(directory, `${file}/`) : [file]
  }).sort()
}
function assertSameOutput(expectedDir, actualDir) {
  const files = outputFiles(expectedDir)
  assert.deepEqual(outputFiles(actualDir), files)
  for (const file of files) assert.ok(readFileSync(path.join(expectedDir, file))
    .equals(readFileSync(path.join(actualDir, file))), `output bytes differ: ${file}`)
  return files.length
}
function changeText(value) {
  if (value?.kind === 'text' && typeof value.text === 'string') { value.text += ' Changed question.'; return true }
  return value && typeof value === 'object' && Object.values(value).some(changeText)
}
let checks = 0
const pass = label => { checks++; console.log(`PASS ${label}`) }

try {
  // Optional differential acceptance against exact inputs and files captured
  // from the pre-fix writer, including its original report timestamps/receipts.
  const oldOutput = process.env.EQB_REVIEW_PUBLICATION_OUTPUT_BASELINE
  if (oldOutput) {
    const input = deserialize(readFileSync(path.join(oldOutput, 'input.bin')))
    const inventory = buildPaperImportOutputInventory(input)
    const oldFiles = outputFiles(path.join(oldOutput, 'files'))
    assert.deepEqual(inventory.files.map(file => file.path).sort(), oldFiles)
    for (const file of inventory.files) assert.ok(file.bytes.equals(
      readFileSync(path.join(oldOutput, 'files', file.path))), `inventory differs from old writer: ${file.path}`)
    const written = writePaperImportVersion({ ...input, outputInventory: inventory,
      paperAssetsDir: path.join(root, 'baseline-replay') })
    const count = assertSameOutput(path.join(oldOutput, 'files'), written.versionDir)
    pass(`pre-fix writer and shared inventory have identical ${count} paths and bytes`)
  }
  // Real native NCK1 profile, all six analysis families, listening audio,
  // authoritative source references, explicit header and four frozen products.
  // Only invented source text is used; no browser, OCR, ASR or AI service.
  const { reviewRoot: source } = makeReviewRoot(root, 'paper-review-publication-2026', undefined, { listening: true })
  const config = readJson(path.join(source, 'config.json'))
  Object.assign(config, { pdfProductsRequired: true, headerTitle: config.provenance.paperName })
  config.provenance.month = 10
  json(path.join(source, 'config.json'), config)
  let projection = buildNck1ReviewProjection(source)
  json(path.join(source, 'pagination-plan.json'), {
    schemaVersion: 'paper-pagination-plan-v1', paperId: projection.paperId,
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    editions: { friendly8: { targetPages: 8, includeListening: false, omitCover: true,
      coverGapsPt: null, breakSlotIds: [], allowSplitOptionBank: false } },
  })
  const references = prepareSourceReferences(projection)
  const evidence = projection.materialization.documents.filter(file => file.role === 'official_answers').map(file => ({
    documentSha256: file.sha256, locator: { kind: 'page_region', documentId: file.documentId,
      page: 1, region: { x: 0, y: 0, width: 1, height: 1 } },
  }))
  for (const group of references.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', evidence, entries: [] }
  }
  json(path.join(source, SOURCE_REFERENCES_FILE), references)
  mkdirSync(path.join(source, 'products'))
  const products = { schemaVersion: 'paper-pdf-products-v1',
    paperId: projection.paperId, paperName: projection.paperName,
    examDate: { year: 2026, month: 10 }, inputDigest: productInputDigest(source, reviewBundleFilePaths(source)), files: [] }
  for (const [index, file] of manifestProductFiles(products).entries()) {
    const pageCount = [12, 10, 8, 2][index]
    const bytes = productPdfBytes(pageCount, file.path)
    writeFileSync(path.join(source, file.path), bytes)
    products.files.push({ ...file, pageCount, sha256: sha256(bytes), byteLength: bytes.length })
  }
  json(path.join(source, 'products/manifest-v1.json'), products)
  projection = buildNck1ReviewProjection(source)
  const files = reviewBundleFilePaths(source).map(file => {
    const bytes = readFileSync(path.join(source, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  })
  const manifest = { schemaVersion: 'web-import-review-bundle-v1', paperId: projection.paperId,
    paperName: projection.paperName, sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest, visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest, producerBuildId: 'fixture', files }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  const reviewDb = path.join(root, 'review.sqlite')
  const store = createImportReviewStore({ dbPath: reviewDb, filesRoot: path.join(root, 'revisions'),
    rendererBuildId: 'publication-fixture-renderer' })
  const revision = store.createRevision(manifest).revision
  for (const file of files) {
    const { destination } = store.fileForUpload(revision.id, file.path)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, readFileSync(path.join(source, file.path)))
    store.completeFileUpload(revision.id, file.path, file)
  }
  store.finalizeRevision(revision.id)
  const approval = store.approveRevision(projection.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'fixture-owner')
  const dbRun = callback => {
    const db = new DatabaseSync(reviewDb)
    try { return callback(db) } finally { db.close() }
  }
  const subject = dbRun(db => JSON.parse(db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?').get(revision.id).subject_json))
  assert.equal(Object.keys(subject.components.consumer.analysisSidecars).length, 6)
  assert.equal(subject.components.products.files.length, 4)
  const blobStore = createBlobStore({ rootDir: path.join(root, 'blobs') })
  const fileStorage = await archiveReviewFiles({ rootDir: source, manifest, blobStore })
  const canonicalRequest = materializeNck1CanonicalRequest(projection.sourceInput, {
    schemaVersion: 'teacher-confirmation-v1', candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest, confirmed: true,
  }).request
  const bankPath = path.join(root, 'bank.sqlite')
  const openDatabase = () => new DatabaseSync(bankPath)
  {
    const db = openDatabase()
    db.exec(readFileSync(new URL('../data/sql/schema.sql', import.meta.url), 'utf8'))
    db.close()
  }
  function publish(label, mutate = null) {
    const db = openDatabase()
    try {
      return publishUniversalNck1Import({ reviewRootDir: source, approvedManifest: manifest,
        approvedIdentity: approval, approvedReviewSubject: subject, fileStorage,
        canonicalRequest, db, paperAssetsDir: path.join(root, label),
        withPreparedReviewSubject(snapshot, write) {
          if (mutate) {
            const before = JSON.stringify(snapshot)
            mutate(snapshot)
            assert.notEqual(JSON.stringify(snapshot), before, 'counterexample must really alter the actual writer snapshot')
          }
          return write()
        },
      })
    } finally { db.close() }
  }
  const rejected = (label, mutate, reason = 'SUBJECT_CHANGED') => {
    const bankRows = () => {
      const db = openDatabase()
      try {
        return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all().map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n])
          .filter(([, count]) => count > 0))
      } finally { db.close() }
    }
    const beforeBank = bankRows()
    let mutated = false
    assert.throws(() => publish(label, snapshot => { mutate(snapshot); mutated = true }), error => {
      assert.equal(error.reasonCode, reason, JSON.stringify({ code: error.code, reason: error.reasonCode, differences: error.differences }))
      return true
    })
    assert.equal(mutated, true, 'the rejection must follow the deliberate mutation, not a failing normal preflight')
    assert.deepEqual(bankRows(), beforeBank, 'rejection must not insert any formal bank rows')
    assert.equal(existsSync(path.join(root, label)), false, 'rejection must precede staging, journal and version writes')
    assert.equal(dbRun(db => db.prepare('SELECT COUNT(*) AS n FROM review_subject').get().n), 1)
    pass(label)
  }
  rejected('preview unchanged but actual admission consumer changes a question', ({ admission }) => {
    const selection = admission.consumers.screen.selections.find(item => item.familyContractId === 'reading')
    assert.equal(changeText(selection.projectedOccurrences[0].questions[0].stem), true)
  })
  rejected('actual writer adds an unmapped display field', ({ packageData }) => {
    packageData.unmappedDisplay = 'unreviewed'
  }, 'UNSUPPORTED_PUBLICATION_MAPPING')
  rejected('actual formal compilation changes a question independently of preview and consumers', ({ admission }) => {
    const group = admission.compilation.artifacts.canonicalPaper.questionGroups.find(item => item.contractRef.familyContractId === 'reading')
    assert.equal(changeText(group.variant.questions[0].stem), true)
    // Maintain the Canonical Group's own integrity envelope, so the public
    // projector must inspect the altered meaning rather than reject bad hashes.
    const { sourceMap, sourceFingerprint, semanticDigest, ...meaning } = group
    group.semanticDigest = digestJson(meaning)
  })
  rejected('actual persisted publication report changes the approval receipt', ({ publishReport }) => {
    publishReport.pdfProducts = { ...publishReport.pdfProducts, approvalId: 'another-approval' }
  }, 'UNSUPPORTED_PUBLICATION_MAPPING')
  rejected('frozen PDF snapshot is replaced after preflight', ({ packageData }) => {
    packageData.frozenProducts.bytes['products/economy8.pdf'] = Buffer.from('%PDF-replaced')
  })
  rejected('actual pagination plan changes after Review', ({ packageData }) => {
    packageData.paginationPlan.editions.friendly8.allowSplitOptionBank = true
  })
  rejected('actual pagination binding changes its canonical source', ({ packageData }) => {
    packageData.paginationPlanBinding.canonicalSourceDigest = sha256('different canonical source')
  }, 'UNSUPPORTED_PUBLICATION_MAPPING')
  rejected('source identity receipt cannot be widened', ({ packageData }) => {
    packageData.sourceReferenceApproval.approvalId = 'another-approval'
  }, 'UNSUPPORTED_PUBLICATION_MAPPING')
  rejected('storage inventory cannot omit frozen bytes', ({ packageData }) => {
    packageData.fileStorage = structuredClone(packageData.fileStorage)
    delete packageData.fileStorage.files['products/economy8.pdf']
  }, 'UNSUPPORTED_PUBLICATION_MAPPING')
  rejected('Astra sourceEvidence cannot overwrite the reviewed answer key', ({ admission, packageData }) => {
    admission.sealed.sourceEvidence['answer-key.json'] = Buffer.from(JSON.stringify({
      ...packageData.answerKey, answers: { unreviewed: 'B' },
    }))
  }, 'PUBLICATION_OUTPUT_PATH_CONFLICT')
  rejected('sealed collections cannot share a path', ({ admission }) => {
    const [file, bytes] = Object.entries(admission.sealed.artifacts)[0]
    admission.sealed.sourceEvidence[file] = Buffer.from(bytes)
  }, 'PUBLICATION_OUTPUT_PATH_CONFLICT')
  rejected('sealed artifacts cannot add an undeclared output', ({ admission }) => {
    admission.sealed.artifacts['canonical/unreviewed.json'] = Buffer.from('{}')
  }, 'UNDECLARED_PUBLICATION_OUTPUT')
  rejected('source evidence cannot add an undeclared output', ({ admission }) => {
    admission.sealed.sourceEvidence['source-evidence/unreviewed.bin'] = Buffer.from('unreviewed')
  }, 'UNDECLARED_PUBLICATION_OUTPUT')
  rejected('playback derivatives cannot add an undeclared output', ({ admission }) => {
    admission.sealed.playbackDerivatives['listening/unreviewed.json'] = Buffer.from('{}')
  }, 'UNDECLARED_PUBLICATION_OUTPUT')
  rejected('sealed artifact bytes must match their descriptor', ({ admission }) => {
    admission.sealed.artifacts[Object.keys(admission.sealed.artifacts)[0]] = Buffer.from('{}')
  }, 'PUBLICATION_OUTPUT_DESCRIPTOR_MISMATCH')
  rejected('declared source evidence cannot be omitted', ({ admission }) => {
    delete admission.sealed.sourceEvidence[Object.keys(admission.sealed.sourceEvidence)[0]]
  }, 'MISSING_PUBLICATION_OUTPUT')
  const published = publish('normal-envelope')
  assert.equal(published.ok, true)
  assert.equal(published.publish.assetVersion, 1)
  const second = publish('normal-envelope-v2')
  assert.equal(second.ok, true)
  assert.equal(second.publish.assetVersion, 2)
  pass('real listening profile covers all fields and ordinary version/status/source/audio envelopes')
  const frozenPath = path.join(source, 'products/economy8.pdf')
  const frozenBytes = readFileSync(frozenPath)
  try {
    writeFileSync(frozenPath, Buffer.from('%PDF-changed-before-snapshot'))
    assert.notEqual(sha256(readFileSync(frozenPath)), sha256(frozenBytes))
    assert.throws(() => publish('changed-sealed-pdf'), { reasonCode: 'SEALED_FILE_CHANGED' })
  } finally { writeFileSync(frozenPath, frozenBytes) }
  pass('replaced sealed PDF is rejected before publisher projection or writing')

  // Promotion exercises the real store guard around the same publisher.
  const intent = { ...approval, intent: 'ship' }
  let archived = 0
  let changedRevision = false
  const archiveRace = { identity: blobStore.identity, async put(bytes, mediaType) {
    const result = await blobStore.put(bytes, mediaType)
    if (!changedRevision) {
      changedRevision = true
      dbRun(db => db.prepare('UPDATE import_review_revisions SET updated_at=? WHERE id=?').run('race-changed', revision.id))
    }
    archived++
    return result
  } }
  const service = options => createSinglePaperPromotionService({ getStore: () => store, openDatabase,
    paperAssetsDir: path.join(root, 'promoted'), blobStore, ...options })
  const oldUpdatedAt = store.getRevision(revision.id).updatedAt
  await assert.rejects(Promise.resolve().then(() => service({ blobStore: archiveRace }).promote(projection.paperId, intent, 'fixture')), {
    code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'CAS_CHANGED',
  })
  assert.ok(archived > 0)
  assert.equal(store.latestPromotion(projection.paperId).assetVersion, null)
  assert.equal(store.latestPromotion(projection.paperId).state, 'publishing')
  dbRun(db => db.prepare('UPDATE import_review_revisions SET updated_at=? WHERE id=?').run(oldUpdatedAt, revision.id))
  pass('asynchronous archive revision race rejects and retains guard/evidence without publishing')

  const beforeOrigin = process.env.QUESTION_BANK_PUBLIC_ORIGIN
  let changedTarget = false
  const targetRace = { identity: blobStore.identity, async put(bytes, mediaType) {
    const result = await blobStore.put(bytes, mediaType)
    if (!changedTarget) {
      changedTarget = true
      process.env.QUESTION_BANK_PUBLIC_ORIGIN = 'https://review-target.invalid'
    }
    return result
  } }
  try {
    await assert.rejects(Promise.resolve().then(() => service({ blobStore: targetRace })
      .promote(projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture')),
    { code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'TARGET_CHANGED' })
    assert.equal(store.latestPromotion(projection.paperId).assetVersion, null)
  } finally {
    if (beforeOrigin === undefined) delete process.env.QUESTION_BANK_PUBLIC_ORIGIN
    else process.env.QUESTION_BANK_PUBLIC_ORIGIN = beforeOrigin
  }
  pass('asynchronous archive target identity race rejects')
  const originalPreviewDigest = dbRun(db => db.prepare(
    'SELECT payload_digest FROM import_review_product_previews WHERE revision_id=?',
  ).get(revision.id).payload_digest)
  try {
    const changedDigest = sha256('corrupted original preview record')
    assert.notEqual(changedDigest, originalPreviewDigest)
    dbRun(db => db.prepare('UPDATE import_review_product_previews SET payload_digest=? WHERE revision_id=?').run(changedDigest, revision.id))
    await assert.rejects(Promise.resolve().then(() => service().promote(
      projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture',
    )), { code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'BASELINE_UNTRUSTED' })
  } finally {
    dbRun(db => db.prepare('UPDATE import_review_product_previews SET payload_digest=? WHERE revision_id=?').run(originalPreviewDigest, revision.id))
  }
  pass('cached equal cannot hide a damaged original preview record')
  try {
    await assert.rejects(Promise.resolve().then(() => service({
      publish(options) {
        return publishUniversalNck1Import({ ...options, onPrepared(target) {
          options.onPrepared(target)
          process.env.QUESTION_BANK_PUBLIC_ORIGIN = 'https://review-target-after-prepared.invalid'
        } })
      },
    }).promote(projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture')),
    { code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'TARGET_CHANGED' })
  } finally {
    if (beforeOrigin === undefined) delete process.env.QUESTION_BANK_PUBLIC_ORIGIN
    else process.env.QUESTION_BANK_PUBLIC_ORIGIN = beforeOrigin
  }
  pass('target change after prepared callback is rejected by the final transaction before writing')
  await assert.rejects(Promise.resolve().then(() => service({
    publish(options) {
      return publishUniversalNck1Import({ ...options, withPreparedReviewSubject(snapshot, write) {
        return options.withPreparedReviewSubject(snapshot, () => {
          snapshot.packageData.paperAsset.paper.title += ' changed after prepared'
          return write()
        })
      } })
    },
  }).promote(projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture')),
  { code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'SUBJECT_CHANGED' })
  assert.equal(store.latestPromotion(projection.paperId).state, 'failed')
  assert.equal(dbRun(db => db.prepare('SELECT COUNT(*) AS n FROM import_review_shipping_guards').get().n), 0)
  pass('proven pre-write content rejection records failure and releases its guard')
  let crashed = false
  await assert.rejects(Promise.resolve().then(() => service({ afterPublish() {
    crashed = true
    throw new Error('fixture crash after bank commit before Review receipt')
  } }).promote(projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture')), /fixture crash/)
  assert.equal(crashed, true)
  const versions = () => readdirSync(path.join(root, 'promoted', projection.paperId, 'versions'))
  const beforeVersions = versions()
  const recovered = await service().promote(projection.paperId, { ...intent, intent: 'retry_ship' }, 'fixture')
  assert.equal(recovered.status, 'idempotent')
  assert.deepEqual(versions(), beforeVersions)
  assert.equal(store.latestPromotion(projection.paperId).state, 'published')
  pass('committed crash reconciliation records the existing target without another publication')
  console.log(`PASS review publication content: ${checks} checks`)
} finally { rmSync(root, { recursive: true, force: true }) }
