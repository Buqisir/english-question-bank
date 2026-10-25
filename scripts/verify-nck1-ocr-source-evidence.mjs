#!/usr/bin/env node
// verify-resource: browser-render

import assert from 'node:assert/strict'
import childProcess, { execFileSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef66 } from '../shared/paper-canonical/authority.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { buildNck1ReviewConsumption, loadNck1ReviewSource } from '../server/import-review/revisionProjection.mjs'
import { reviewPrintHtml } from '../server/import-review/reviewPagination.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { prepareSpellingReview, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
import { inspectNck1Materialization, runNck1MaterializationJob } from './import-pipeline/nck1-docx-materialize.mjs'
import {
  nck1OcrProducerSourceDigest,
  produceNck1OcrMaterialization,
} from '../server/paper-import/nck1OcrMaterializationProducer.mjs'
import {
  buildNck1OcrSourceEvidence,
  captureNck1OcrPageRasters,
  nck1OcrEvidenceDigest,
  resolveConfirmedNck1OcrEvidence,
} from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  extractNck1PdfTextStructure,
  Nck1PdfTextStructureError,
} from '../server/paper-import/nck1PdfTextSourceAdapter.mjs'
import {
  cloneJson,
  makeSyntheticNck1OcrFixture,
} from '../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { verifyReadingStemFigures } from '../test-fixtures/paper-import/nck1-ocr-evidence-v1/stem-figures.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { replaceOcrStructuredAnswerRegions } from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { validateNck1SourceMaterialization } from '../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../shared/paper-canonical/sourcePresentation.mjs'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const paperId = `paper-synthetic-ocr-evidence-${process.pid}`
execFileSync(process.execPath, [path.join(root, 'scripts/generate-paper-ocr-emphasis-authority.mjs'), '--check'], {
  cwd: root,
  stdio: 'inherit',
})
// Public capture seam: exact content reuse must preserve every invalidation
// boundary, and returned metadata must never mutate the private cache.
{
  const bytes = productPdfBytes(1, 'OCR cache regression')
  const document = { documentId: 'cache-test', role: 'question_source', mediaType: 'application/pdf',
    bytes, sha256: sha256(bytes), byteLength: bytes.length, pageCount: 1 }
  const nativeExec = childProcess.execFileSync
  const nativeSpawn = childProcess.spawnSync
  let replays = 0
  let toolVariant = '', fingerprintAvailable = true, failReplay = false
  childProcess.execFileSync = function(command, args) {
    if (command === 'pdftoppm' && args[0] !== '-v') {
      replays++
      if (failReplay) throw new Error('synthetic raster failure')
    }
    return nativeExec.apply(this, arguments)
  }
  childProcess.spawnSync = function(command, args) {
    const result = nativeSpawn.apply(this, arguments)
    if ((command === 'pdftoppm' && args[0] === '-v') || (command === 'magick' && args[0] === '-version')) {
      if (!fingerprintAvailable) return { ...result, status: 1 }
      return { ...result, stdout: `${result.stdout || ''}${toolVariant}` }
    }
    return result
  }
  syncBuiltinESMExports()
  try {
    const first = captureNck1OcrPageRasters([document])
    const copied = { ...document, documentId: 'different-id', bytes: new Uint8Array(bytes) }
    const second = captureNck1OcrPageRasters([copied])
    assert.deepEqual(second[0].pages, first[0].pages)
    assert.equal(replays, 1, 'same actual content across byte copies/IDs must replay once')
    first[0].pages[0].raster.recipe.region.width = 0.1
    first[0].pages[0].raster.sha256 = 'mutated-result'
    assert.deepEqual(captureNck1OcrPageRasters([document])[0].pages, second[0].pages,
      'returned metadata cannot poison the private cache')
    document.bytes[document.bytes.length - 1] ^= 1
    assert.throws(() => captureNck1OcrPageRasters([document]),
      /cannot close/, 'mutating the same byte object must fail the source digest check')
    document.sha256 = sha256(document.bytes)
    captureNck1OcrPageRasters([document])
    assert.equal(replays, 2, 'new actual content with the same object/ID must reraster')
    toolVariant = ' synthetic-new-tool-version'
    captureNck1OcrPageRasters([document])
    assert.equal(replays, 3, 'tool version changes must reraster the same content')
    fingerprintAvailable = false
    captureNck1OcrPageRasters([document])
    captureNck1OcrPageRasters([document])
    assert.equal(replays, 5, 'unavailable fingerprints disable reuse without changing successful admission')
    fingerprintAvailable = true
    const freshBytes = productPdfBytes(1, 'OCR cache failed replay')
    const fresh = { ...document, bytes: freshBytes, sha256: sha256(freshBytes), byteLength: freshBytes.length }
    failReplay = true
    assert.throws(() => captureNck1OcrPageRasters([fresh]), /synthetic raster failure/)
    failReplay = false
    captureNck1OcrPageRasters([fresh])
    assert.equal(replays, 7, 'failed replays must never populate the cache')
    console.log('PASS exact-content raster reuse, detached results, mutable input rehash, tool version invalidation, unavailable fingerprints and failed replays')
  } finally {
    childProcess.execFileSync = nativeExec
    childProcess.spawnSync = nativeSpawn
    syncBuiltinESMExports()
  }
}
const fixture = await makeSyntheticNck1OcrFixture({ paperId })
await verifyReadingStemFigures(fixture)

// A table survives as one source object. Its exact final item is a legal
// after-table boundary, even though its cell prose is consumed by that object.
for (const documentIndex of [0, 1]) {
  const evidence = cloneJson(fixture.evidence)
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const page = confirmation.documents[documentIndex].pages[0]
  const observed = evidence.documents[documentIndex].pages[0]
  const ids = page.orderedItems.map(item => item.itemId)
  observed.regions.push({ regionId: 'anchor-table', kind: 'visual',
    region: { x: 0, y: 0, width: 1, height: 1 } },
  { regionId: 'after-table-image', kind: 'visual', region: { x: .98, y: .8, width: .01, height: .01 } })
  page.visualClassifications.push({ regionId: 'anchor-table', classification: 'semantic_table',
    rows: [{ header: false, cells: [[ids[0]], ids.slice(1)] }] },
  { regionId: 'after-table-image', classification: 'content_media', itemIds: [], afterItemId: ids.at(-1) })
  rebound(evidence)
  confirmation.evidenceDigest = evidence.evidenceDigest
  const resolve = (value, sourceEvidence = evidence) => resolveConfirmedNck1OcrEvidence({ paperId,
    documents: fixture.sourceDocuments, evidence: sourceEvidence, confirmation: value })
  const result = resolve(confirmation)
  assert.deepEqual(result.issues, [], 'image after the exact surviving table boundary')
  assert.equal(result.structures.get(fixture.sourceDocuments[documentIndex].documentId).body[0].kind, 'table')
  const reversed = cloneJson(confirmation)
  reversed.documents[documentIndex].pages[0].visualClassifications.reverse()
  assert.deepEqual(resolve(reversed), result, 'boundary does not depend on visual array order')
  const interior = cloneJson(confirmation)
  interior.documents[documentIndex].pages[0].visualClassifications.at(-1).afterItemId = ids[0]
  assert(resolve(interior).issues.some(issue => /anchor cannot be consumed/u.test(issue.message)),
    'a table interior cannot position an image')
  const imageAnchor = cloneJson(confirmation)
  imageAnchor.documents[documentIndex].pages[0].visualClassifications.splice(-2, 1,
    { regionId: 'anchor-table', classification: 'content_media', itemIds: ids.slice(1), afterItemId: ids[0] })
  const imageEvidence = cloneJson(evidence)
  const imagePage = imageEvidence.documents[documentIndex].pages[0]
  const consumed = new Set(page.orderedItems.slice(1).flatMap(item => item.observationIds))
  const boxes = imagePage.observations.filter(item => consumed.has(item.observationId)).map(item => item.region)
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y))
  imagePage.regions.find(region => region.regionId === 'anchor-table').region = {
    x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x,
    height: Math.max(...boxes.map(box => box.y + box.height)) - y,
  }
  rebound(imageEvidence)
  imageAnchor.evidenceDigest = imageEvidence.evidenceDigest
  assert(resolve(imageAnchor, imageEvidence).issues.some(issue => /anchor cannot be consumed/u.test(issue.message)),
    'a consumed image item cannot serve as another image anchor')
}
console.log('PASS exact after-table image boundary, visual-order independence, and rejected interior/image anchors')

function validRegion(region) {
  return region
    && [region.x, region.y, region.width, region.height].every(Number.isFinite)
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x + region.width <= 1.000001
    && region.y + region.height <= 1.000001
}

function assertLocatedIssue(item) {
  assert.equal(typeof item.source?.documentId, 'string')
  assert(Number.isInteger(item.source?.page) && item.source.page > 0)
  assert(validRegion(item.source?.region))
}

function imported(produced, ocrSourceBytes = null, documents = fixture.sourceDocuments) {
  return importCanonicalCandidate({
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
    ...(ocrSourceBytes ? { ocrSourceBytes } : {}),
    documents: documents.map((document) => ({
      documentId: document.documentId,
      bytes: document.bytes,
    })),
    media: produced.mediaFiles || [],
  })
}

function rebound(evidence) {
  evidence.evidenceDigest = nck1OcrEvidenceDigest(evidence)
  return evidence
}

function expectedReview(evidence, expectedCode) {
  const produced = produceNck1OcrMaterialization({
    paperId,
    documents: fixture.sourceDocuments,
    evidence,
  })
  assert.equal(produced.disposition, 'needs_agent_review')
  const issue = produced.review.required.find((item) => item.code === expectedCode)
  assert(issue, `${expectedCode} is required`)
  assertLocatedIssue(issue)
  assert.equal(
    imported(produced).candidate?.interpretation,
    null,
    `${expectedCode} cannot derive a usable Candidate`,
  )
}

for (const document of fixture.sourceDocuments) {
  assert.throws(
    () => extractNck1PdfTextStructure(document.bytes, {
      documentId: document.documentId,
      expectedPageCount: document.pageCount,
    }),
    (error) => {
      assert(error instanceof Nck1PdfTextStructureError)
      assert.equal(error.code, 'NCK1_PDF_TEXT_LAYER_MISSING')
      assertLocatedIssue({ source: { documentId: document.documentId, ...error.evidence } })
      return true
    },
  )
}

const unconfirmed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: fixture.evidence,
})
assert.equal(unconfirmed.disposition, 'needs_agent_review')
assert(unconfirmed.review.required.some((item) => item.code === 'NCK1_OCR_TEXT_LAYER_REQUIRED'))
assert(unconfirmed.review.required.some((item) =>
  item.code === 'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED'))
unconfirmed.review.required
  .filter((item) => item.code.startsWith('NCK1_OCR_'))
  .forEach(assertLocatedIssue)
assert.equal(imported(unconfirmed).candidate?.interpretation, null)

const confirmed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: fixture.evidence,
  confirmation: fixture.confirmation,
})
assert.equal(confirmed.disposition, 'ready_for_verification')
assert.deepEqual(confirmed.review.required, [])
assert.deepEqual(
  confirmed.materialization.groups.map((group) => group.slotId),
  [
    'reading.a',
    'reading.b',
    'reading.c',
    'reading.d',
    'seven-choices',
    'cloze',
    'grammar-fill',
    'writing.application',
    'writing.continuation',
  ],
)
assert.equal(confirmed.materialization.answers.length, 45)
assert.equal(
  JSON.stringify(confirmed.materialization).includes('deliberately untrusted explanation'),
  false,
  'answer explanations remain outside Canonical and teacher-facing content',
)
assert.equal(JSON.stringify(confirmed.materialization).includes('synthetic-fixed-ocr'), false)
assert.equal(JSON.stringify(confirmed.materialization).includes('confidence'), false)
assert.equal(JSON.stringify(confirmed.materialization).includes('data:image'), false)

const blocks = confirmed.materialization.groups.flatMap((group) => group.blocks)
const questions = confirmed.materialization.groups.flatMap((group) => group.questions)
const readingQuestions = confirmed.materialization.groups
  .filter((group) => group.family === 'reading')
  .flatMap((group) => group.questions)
const clozeQuestions = confirmed.materialization.groups
  .find((group) => group.family === 'cloze')
  .questions
const questionEvidence = fixture.evidence.documents
  .find((document) => document.documentId === fixture.sourceDocuments
    .find((document) => document.role === 'question_source').documentId)
const q41Page = questionEvidence.pages.find((page) =>
  page.observations.some((observation) => /^41[.．、]/u.test(observation.text)))
const q41Observation = q41Page.observations.find((observation) =>
  /^41[.．、]/u.test(observation.text))
const q41Source = clozeQuestions[0].source
assert.equal(q41Source.kind, 'page_region')
assert.equal(q41Source.documentId, questionEvidence.documentId)
assert.equal(q41Source.page, q41Page.page)
for (const key of ['x', 'y', 'width', 'height']) {
  assert(Math.abs(q41Source.region[key] - q41Observation.region[key]) <= Number.EPSILON,
    `a cloze question locator must preserve the source option-row ${key}`)
}
assert.equal(readingQuestions[0].stem, 'Which choice fits item 21?')
assert(readingQuestions.every((question) => question.options.every((option) =>
  !question.stem.includes(option.text))),
'reading stems must not repeat their separately structured option text')
for (const locator of [
  ...blocks.map((block) => block.source),
  ...questions.map((question) => question.source),
  ...confirmed.materialization.answers.map((answer) => answer.authority),
]) {
  assert.equal(locator?.kind, 'page_region')
  assert(Number.isInteger(locator.page) && locator.page > 0)
  assert(validRegion(locator.region))
}
assert.deepEqual(confirmed.materialization.sourceCoverage.visuals, [{
  visualId: `visual:${paperId}:ocr-question-source-1:synthetic-visual`,
  page: fixture.questionVisualPage,
  region: { x: 0.974, y: 0.01, width: 0.01, height: 0.01 },
  disposition: 'furniture',
  targetId: null,
}])

const canonical = imported(confirmed)
assert.deepEqual(canonical.issues, [])
assert.equal(canonical.candidate?.interpretation.groups.length, 9)
assert.equal(canonical.candidate?.interpretation.assertions.length, 45)

// v3 content classification preserves confirmed text in cells instead of
// pretending it is furniture. Exercise the public resolver, including the
// official-answer carrier, without authoring a second copy of cell text.
for (const documentIndex of [0, 1]) {
  const evidence = cloneJson(fixture.evidence)
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const page = confirmation.documents[documentIndex].pages[0]
  const observed = evidence.documents[documentIndex].pages[0]
  const ids = page.orderedItems.map(item => item.itemId)
  assert(ids.length >= 2)
  observed.regions.push({ regionId: 'table-layout', kind: 'visual',
    region: { x: 0, y: 0, width: 1, height: 1 } })
  page.visualClassifications.push({ regionId: 'table-layout', classification: 'semantic_table',
    rows: [{ header: true, cells: [[ids[0]], ids.slice(1)] }] })
  // A watermark inside the table is accounted for as furniture, not a cell.
  const watermark = { ...cloneJson(observed.observations[0]),
    observationId: 'table-watermark', regionId: 'table-watermark-text',
    text: 'SYNTHETIC WATERMARK' }
  observed.observations.push(watermark)
  observed.regions.push({ regionId: watermark.regionId, kind: 'text', region: cloneJson(watermark.region) })
  page.furnitureObservationIds.push(watermark.observationId)
  rebound(evidence)
  confirmation.evidenceDigest = evidence.evidenceDigest
  const resolve = value => resolveConfirmedNck1OcrEvidence({ paperId,
    documents: fixture.sourceDocuments, evidence, confirmation: value })
  const result = resolve(confirmation)
  assert.deepEqual(result.issues, [])
  const table = result.structures.get(fixture.sourceDocuments[documentIndex].documentId).tables[0]
  assert.deepEqual(table.rows[0].cells.map(cell => cell.text),
    [page.orderedItems[0].text, page.orderedItems.slice(1).map(item => item.text).join('\n')])
  assert.equal(table.columnCount, 2)
  for (const change of [
    value => { value.documents[documentIndex].pages[0].furnitureObservationIds = [] },
    value => { value.documents[documentIndex].pages[0].visualClassifications.at(-1).rows[0].cells[1].pop() },
    value => { value.documents[documentIndex].pages[0].visualClassifications.at(-1).rows[0].cells[0][0] = 'foreign-item' },
    value => { value.documents[documentIndex].pages[0].visualClassifications.at(-1).rows[0].cells[1].push(ids[0]) },
    value => { value.schemaVersion = 'nck1-ocr-source-confirmation-v2' },
  ]) {
    const invalid = cloneJson(confirmation)
    change(invalid)
    assert(resolve(invalid).issues.some(issue => issue.code === 'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED'))
  }
  const doubleClaimed = cloneJson(confirmation)
  doubleClaimed.documents[documentIndex].pages[0].furnitureObservationIds.push(page.orderedItems[0].observationIds[0])
  assert(resolve(doubleClaimed).issues.some(issue => issue.code === 'NCK1_OCR_CONFIRMATION_STALE'))
}

// Exercise actual producer -> immutable crop/table -> Canonical preview, not
// only the layout resolver. The source region contains one passage paragraph.
for (const classification of ['semantic_table', 'content_media']) {
  const evidence = cloneJson(fixture.evidence)
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const page = confirmation.documents[0].pages.find(page => page.orderedItems.some(item => item.text === 'C passage keeps one small promise.'))
  const index = page.orderedItems.findIndex(item => item.text === 'C passage keeps one small promise.')
  assert(index > 0)
  const item = page.orderedItems[index]
  const observed = evidence.documents[0].pages.find(value => value.page === page.page)
  const observation = observed.observations.find(value => item.observationIds.includes(value.observationId))
  assert.equal(item.observationIds.length, 1)
  if (classification === 'semantic_table') {
    item.text = `\t${item.text}\n`
    observation.text = item.text
  }
  observed.regions.push({ regionId: 'content-layout', kind: 'visual', region: cloneJson(observation.region) })
  page.visualClassifications.push({ regionId: 'content-layout', classification,
    ...(classification === 'semantic_table'
      ? { rows: [{ header: false, cells: [[item.itemId]] }] }
      : { itemIds: [item.itemId], afterItemId: page.orderedItems[index - 1].itemId }) })
  rebound(evidence)
  confirmation.evidenceDigest = evidence.evidenceDigest
  const produced = produceNck1OcrMaterialization({ paperId, documents: fixture.sourceDocuments, evidence, confirmation })
  assert.deepEqual(produced.review.required, [], JSON.stringify(produced.review.required))
  assert.equal(produced.review.producerVersion, 'nck1-ocr-materialization-producer-v28')
  if (classification === 'semantic_table') {
    assert.equal(produced.materialization.groups.find(group => group.slotId === 'reading.c')
      .blocks.find(block => block.kind === 'table').rows[0].cells[0].content[0].text,
    '\tC passage keeps one small promise.\n', 'cell edge tabs/newlines follow the producer, not a second trim policy')
  }
  const sourceBytes = { evidenceBytes: new TextEncoder().encode(JSON.stringify(evidence)),
    confirmationBytes: new TextEncoder().encode(JSON.stringify(confirmation)) }
  const candidate = imported(produced, sourceBytes)
  assert.deepEqual(candidate.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(candidate.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const content = preview.compilation.artifacts.canonicalPaper.questionGroups.find(group => group.identity.groupId.endsWith('reading-c')).content
  assert(content.blocks.some(block => block.kind === (classification === 'semantic_table' ? 'table' : 'figure')))
  const tampered = cloneJson(produced.materialization)
  const blocks = tampered.groups.find(group => group.slotId === 'reading.c').blocks
  if (classification === 'semantic_table') blocks.find(block => block.kind === 'table').rows[0].cells[0].content[0].text = 'Invented cell'
  else blocks.splice(blocks.findIndex(block => block.kind === 'figure'), 1)
  const rejected = imported({ ...produced, materialization: tampered }, sourceBytes)
  assert(rejected.issues.length > 0, 'dropping or rewriting a confirmed source visual must not compile')
  for (const change of ['wrong-group', 'wrong-anchor', 'answer-table']) {
    const moved = cloneJson(produced.materialization)
    const owner = moved.groups.find(group => group.slotId === 'reading.c')
    const destination = moved.groups.find(group => group.slotId === 'reading.d')
    if (change === 'wrong-group') {
      const visualIndex = owner.blocks.findIndex(block => ['table', 'figure'].includes(block.kind))
      destination.blocks.push(owner.blocks.splice(visualIndex, 1)[0])
      owner.blocks.push(cloneJson(confirmed.materialization.groups.find(group => group.slotId === 'reading.c').blocks[0]))
    } else if (change === 'wrong-anchor') {
      owner.blocks.unshift(cloneJson(confirmed.materialization.groups.find(group => group.slotId === 'reading.c').blocks[0]))
    } else {
      if (classification !== 'semantic_table') continue
      const table = cloneJson(owner.blocks.find(block => block.kind === 'table'))
      table.blockId += '-answer-leak'
      table.source = { kind: 'page_region', documentId: fixture.sourceDocuments[1].documentId,
        page: 1, region: { x: 0, y: 0, width: 1, height: 1 } }
      destination.blocks.push(table)
      moved.sourceCoverage.visuals.push({ visualId: 'visual:answer-leak', page: 1,
        region: table.source.region, disposition: 'semantic_table', targetId: table.blockId })
    }
    const invalid = imported({ ...produced, materialization: moved }, sourceBytes)
    assert(invalid.issues.some(issue => /confirmed question-source groups/.test(issue.message)),
      `${change}: intact visuals must retain question-source ownership and placement: ${JSON.stringify(invalid.issues)}`)
  }
}

// A confirmed template can change representation, but cannot invent its text,
// provenance, owner or content inventory.
{
  const evidence = cloneJson(fixture.evidence)
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const page = confirmation.documents[0].pages.find(page =>
    page.orderedItems.some(item => item.text === 'Should We Join the Reading Club?'))
  const index = page.orderedItems.findIndex(item => item.text === 'Should We Join the Reading Club?')
  const label = page.orderedItems[index]
  label.text = '（做图处）'
  const observed = evidence.documents[0].pages.find(value => value.page === page.page)
  const labelObservation = observed.observations.find(value => label.observationIds.includes(value.observationId))
  const extras = ['This is my logo.', 'Li Hua'].map((text, i) => {
    const id = `structured-template-${i}`
    const { x, y, width, height } = labelObservation.region
    const region = { x: x + width * .05, y: y + height * (.1 + i * .3),
      width: width * .4, height: height * .2 }
    observed.regions.push({ regionId: id, kind: 'text', region })
    observed.observations.push({ ...cloneJson(labelObservation), observationId: id, regionId: id, text, region })
    return { itemId: id, observationIds: [id], text }
  })
  page.orderedItems.splice(index + 1, 0, ...extras)
  const region = cloneJson(labelObservation.region)
  observed.regions.push({ regionId: 'structured-template', kind: 'visual', region })
  page.visualClassifications.push({ regionId: 'structured-template', classification: 'content_media',
    itemIds: [label.itemId, ...extras.map(item => item.itemId)], afterItemId: page.orderedItems[index - 1].itemId })
  rebound(evidence)
  confirmation.evidenceDigest = evidence.evidenceDigest
  const produced = produceNck1OcrMaterialization({ paperId, documents: fixture.sourceDocuments, evidence, confirmation })
  const expected = cloneJson(produced.materialization)
  // These synthetic OCR items share a confirmed content_media region. The
  // producer retains its crop, not a second transcription or an empty title.
  // The v5/v6 path below is an optional, source-checked representation change.
  assert.deepEqual(produced.review.required, [])
  assert.deepEqual(produced.materialization.issues, [])
  assert.deepEqual(validateNck1SourceMaterialization(produced.materialization), [])
  const application = produced.materialization.groups.find(group => group.family === 'application-writing')
  assert.deepEqual(application.writingTask.givenSkeleton, [])
  const sourceFigure = application.blocks.find(block => block.kind === 'figure')
  assert(sourceFigure)
  assert.equal(sourceFigure.role, undefined)
  assert.equal(sourceFigure.caption, '')
  assert.deepEqual(sourceFigure.source, { kind: 'page_region', documentId: fixture.sourceDocuments[0].documentId,
    page: page.page, region })
  const sourceMedia = produced.materialization.media.find(media => media.mediaId === sourceFigure.mediaId)
  const sourceFile = produced.mediaFiles.find(file => file.mediaId === sourceFigure.mediaId)
  const crop = rasterPdfRegion({ pdfBytes: fixture.sourceDocuments[0].bytes, page: page.page, region, density: 144 })
  assert.deepEqual(sourceFile.bytes, crop.bytes, 'the figure retains the complete immutable source crop')
  assert.equal(sourceMedia.sha256, sha256(crop.bytes))
  assert.deepEqual(produced.materialization.sourceCoverage.visuals.filter(visual =>
    visual.disposition === 'content_media').map(visual => visual.targetId), [sourceFigure.mediaId])
  const original = cloneJson(expected)
  const unchanged = replaceOcrStructuredAnswerRegions(produced.materialization, expected)
  assert.strictEqual(unchanged.expected, expected)
  assert.deepEqual(expected, original, 'no structured visuals leaves the old comparison input byte-for-byte unchanged')
  assert.equal(unchanged.replacements.size, 0)
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents: fixture.sourceDocuments, evidence, confirmation })
  assert.deepEqual(resolved.issues, [])
  const carrier = resolved.structures.get(fixture.sourceDocuments[0].documentId).body
    .find(item => item.materializedMedia?.mediaId === sourceFigure.mediaId)
  assert.equal(carrier.text, '', 'confirmed image text is represented by the crop, not silently retyped as givens')
  for (const name of ['unclaimed-text', 'outside-region']) {
    const ev = cloneJson(evidence)
    const conf = cloneJson(confirmation)
    const ep = ev.documents[0].pages.find(value => value.page === page.page)
    const cp = conf.documents[0].pages.find(value => value.page === page.page)
    if (name === 'unclaimed-text') {
      cp.visualClassifications.find(value => value.regionId === 'structured-template').itemIds.pop()
    } else {
      const moved = ep.observations.find(value => value.observationId === extras[1].observationIds[0])
      moved.region.x = region.x + region.width + .001
      ep.regions.find(value => value.regionId === moved.regionId).region = cloneJson(moved.region)
    }
    rebound(ev)
    conf.evidenceDigest = ev.evidenceDigest
    const invalid = produceNck1OcrMaterialization({
      paperId, documents: fixture.sourceDocuments, evidence: ev, confirmation: conf,
    })
    const message = name === 'unclaimed-text'
      ? /Every text observation inside a content visual must be accounted for/
      : /Visual text observations must lie within the classified source region/
    assert(invalid.review.required.some(issue => issue.code === 'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED'
      && message.test(issue.message)), `${name}: ${JSON.stringify(invalid.review.required)}`)
  }
  // Real text outside the selected crop is still response-box content. It
  // must survive next to the figure with its own source, order and role.
  {
    const ev = cloneJson(evidence)
    const conf = cloneJson(confirmation)
    const ep = ev.documents[0].pages.find(value => value.page === page.page)
    const cp = conf.documents[0].pages.find(value => value.page === page.page)
    const givens = [
      { role: 'salutation', text: 'Dear students,' },
      { role: 'opening', text: 'This is the real opening.' },
      { role: 'closing', text: 'Yours,' },
      { role: 'signature', text: 'Li Hua' },
    ]
    const items = givens.map((given, i) => {
      const id = `outside-template-${i}`
      const box = { x: region.x, y: region.y + region.height + .001 * (i + 1),
        width: region.width * .4, height: .0005 }
      ep.regions.push({ regionId: id, kind: 'text', region: box })
      ep.observations.push({ ...cloneJson(labelObservation), observationId: id,
        regionId: id, text: given.text, region: box })
      return { itemId: id, observationIds: [id], text: given.text }
    })
    cp.orderedItems.splice(index + 1 + extras.length, 0, ...items)
    rebound(ev)
    conf.evidenceDigest = ev.evidenceDigest
    const withGivens = produceNck1OcrMaterialization({
      paperId, documents: fixture.sourceDocuments, evidence: ev, confirmation: conf,
    })
    assert.deepEqual(withGivens.review.required, [])
    const owner = withGivens.materialization.groups.find(group => group.family === 'application-writing')
    assert.deepEqual(owner.writingTask.givenSkeleton, givens)
    for (const [i, given] of givens.entries()) {
      const blocks = owner.blocks.filter(block => block.kind === 'paragraph'
        && block.content.map(value => value.text).join('') === given.text)
      assert.equal(blocks.length, 1)
      const box = ep.observations.find(value => value.observationId === items[i].observationIds[0]).region
      assert.deepEqual(blocks[0].source, { kind: 'page_region',
        documentId: fixture.sourceDocuments[0].documentId, page: page.page,
        region: { x: box.x, y: box.y, width: box.x + box.width - box.x, height: box.y + box.height - box.y } })
    }
    assert.deepEqual(withGivens.mediaFiles, produced.mediaFiles)
    assert.deepEqual(imported(withGivens, {
      evidenceBytes: new TextEncoder().encode(JSON.stringify(ev)),
      confirmationBytes: new TextEncoder().encode(JSON.stringify(conf)),
    }).issues, [])
  }
  const changed = cloneJson(produced.materialization)
  changed.schemaVersion = 'nck1-source-materialization-v5'
  const group = changed.groups.find(group => group.family === 'application-writing')
  const figureIndex = group.blocks.findIndex(block => block.kind === 'figure')
  const figure = group.blocks[figureIndex]
  assert(figure)
  const mediaId = figure.mediaId
  const paragraphs = [label, ...extras].map((item, i) => {
    const observation = observed.observations.find(value => value.observationId === item.observationIds[0])
    const { x, y, width, height } = observation.region
    return { kind: 'paragraph', blockId: `block:structured-template-${i}`, role: 'body',
      content: [{ kind: 'text', text: item.text }],
      source: { kind: 'page_region', documentId: fixture.sourceDocuments[0].documentId, page: page.page,
        region: { x, y, width: x + width - x, height: y + height - y } } }
  })
  group.blocks.splice(figureIndex, 1, ...paragraphs)
  group.writingTask.drawingArea = { placement: 'top_right', labelBlockRef: paragraphs[0].blockId,
    source: cloneJson(figure.source) }
  group.writingTask.givenSkeleton = extras.map((item, i) => ({ role: i ? 'signature' : 'opening', text: item.text }))
  const instructionBlock = changed.groups.find(value => value.slotId === 'reading.a').blocks.find(value => value.kind === 'paragraph')
  changed.sourcePresentation = {
    instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS)
      .filter(slot => !slot.startsWith('listening.') || changed.listening.state !== 'not_supplied')
      .map(slotId => ({ slotId, text: instructionBlock.content.map(value => value.text).join(''),
        source: cloneJson(instructionBlock.source) })),
    listeningExample: changed.listening.state === 'not_supplied' ? null
      : { state: 'not_supplied', source: cloneJson(instructionBlock.source) },
  }
  const visual = changed.sourceCoverage.visuals.find(value => value.targetId === mediaId)
  visual.disposition = 'structured_answer_region'
  visual.targetId = group.groupId
  changed.media.find(media => media.mediaId === mediaId).usage = 'visual_proof'
  assert.deepEqual(validateNck1SourceMaterialization(changed), [])
  const sourceBytes = { evidenceBytes: new TextEncoder().encode(JSON.stringify(evidence)),
    confirmationBytes: new TextEncoder().encode(JSON.stringify(confirmation)) }
  assert.deepEqual(imported(produced, sourceBytes).issues, [], 'unchanged source figure is independently admissible')
  const importChanged = materialization => imported({ ...produced, materialization,
    mediaFiles: produced.mediaFiles.filter(file => materialization.media.some(media => media.mediaId === file.mediaId)) }, sourceBytes)
  assert.deepEqual(importChanged(changed).issues, [], 'confirmed figure -> structured region with retained proof')
  const withoutProof = cloneJson(changed)
  withoutProof.media = withoutProof.media.filter(media => media.mediaId !== mediaId)
  assert.deepEqual(importChanged(withoutProof).issues, [], 'confirmed template media may also be omitted')
  for (const materialization of [changed, withoutProof]) {
    const successor = cloneJson(materialization)
    successor.schemaVersion = 'nck1-source-materialization-v6'
    assert.deepEqual(validateNck1SourceMaterialization(successor), [])
    assert.deepEqual(importChanged(successor).issues, [], 'v6 inherits the controlled OCR structured answer replacement')
  }
  const immutableRaw = cloneJson(changed)
  const transformed = replaceOcrStructuredAnswerRegions(changed, cloneJson(produced.materialization), resolved, confirmation, evidence)
  assert.deepEqual(changed, immutableRaw, 'only the expected side is rewritten')
  assert.equal(transformed.replacements.size, 1)
  assert(!transformed.expected.groups.find(value => value.groupId === group.groupId).blocks.some(value => value.kind === 'figure'))
  for (const name of ['region', 'group', 'multiple', 'content', 'drawing', 'text', 'source', 'given-text', 'given-source']) {
    const raw = cloneJson(changed)
    const exp = cloneJson(produced.materialization)
    const owner = raw.groups.find(value => value.groupId === group.groupId)
    if (name === 'region') raw.sourceCoverage.visuals.find(value => value.disposition === 'structured_answer_region').region.width -= .000001
    if (name === 'group') owner.slotId = 'wrong-slot'
    if (name === 'multiple') exp.groups.find(value => value.groupId === group.groupId).blocks.push(cloneJson(figure))
    if (name === 'content') owner.blocks.push(cloneJson(figure))
    if (name === 'drawing') delete owner.writingTask.drawingArea
    if (name === 'text') owner.blocks.find(value => value.blockId === paragraphs[0].blockId).content[0].text = 'Invented label'
    if (name === 'source') owner.blocks.find(value => value.blockId === paragraphs[0].blockId).source.region.x += .001
    if (name === 'given-text') {
      owner.writingTask.givenSkeleton[0].text = 'Invented opening'
      owner.blocks.find(value => value.blockId === paragraphs[1].blockId).content[0].text = 'Invented opening'
    }
    if (name === 'given-source') owner.blocks.find(value => value.blockId === paragraphs[1].blockId).source.region.x += .001
    const suffix = { content: 'CONTENT_CONFLICT', text: 'TEXT_UNCONFIRMED', source: 'TEXT_SOURCE_INVALID',
      'given-text': 'TEXT_UNCONFIRMED', 'given-source': 'TEXT_SOURCE_INVALID' }[name] || 'UNMATCHED'
    for (const version of [5, 6]) {
      raw.schemaVersion = `nck1-source-materialization-v${version}`
      assert.throws(() => replaceOcrStructuredAnswerRegions(raw, cloneJson(exp), resolved, confirmation, evidence),
        error => error.code === `OCR_STRUCTURED_ANSWER_REGION_${suffix}`, `v${version} ${name}`)
    }
  }
  console.log('PASS OCR-v3 source crop and real givens, visual text closure, controlled v5/v6 replacement: exact owner/region/text/source, proof/absence, closed media and unchanged legacy path')
}

// Prepare immutable native page fixtures once for the media-negative matrix.
// Only exact PDF page renders and exact PNG -> RGBA decodes are reused; each
// crop, hash/dimension check, import and preview still runs through production.
// Keys include actual input bytes and command/options, never caller digests.
// The original A4 carriers and every negative assertion remain unchanged.
function prepareNativePageFixtures() {
  const nativeExecFileSync = childProcess.execFileSync
  const cache = new Map()
  const maxBytes = 64 * 1024 * 1024
  let retainedBytes = 0
  const counts = { renders: 0, renderHits: 0, decodes: 0, decodeHits: 0 }
  childProcess.execFileSync = (command, args, options) => {
    const pdf = command === 'pdftoppm' && args?.length === 10
      && args.slice(0, 8).filter((_, index) => [0, 2, 4, 5, 7].includes(index)).join(' ')
        === '-f -l -singlefile -r -png'
    const rgba = command === 'magick' && args?.length === 2 && args[1] === 'rgba:-'
    if ((!pdf && !rgba) || Object.keys(options || {}).some(key => key !== 'maxBuffer')) {
      return nativeExecFileSync(command, args, options)
    }
    const input = readFileSync(pdf ? args.at(-2) : args[0])
    const parameters = pdf ? args.slice(0, -2) : args.slice(1)
    const key = JSON.stringify([command, sha256(input), parameters, options])
    const cached = cache.get(key)
    if (cached) {
      if (pdf) {
        writeFileSync(`${args.at(-1)}.png`, cached.image)
        counts.renderHits += 1
      } else counts.decodeHits += 1
      return Buffer.from(cached.stdout)
    }
    const stdout = nativeExecFileSync(command, args, options)
    const image = pdf ? readFileSync(`${args.at(-1)}.png`) : null
    const size = stdout.byteLength + (image?.byteLength || 0)
    if (retainedBytes + size <= maxBytes) {
      cache.set(key, { stdout: Buffer.from(stdout), image })
      retainedBytes += size
    }
    counts[pdf ? 'renders' : 'decodes'] += 1
    return stdout
  }
  // Production modules hold live ESM imports of this builtin. Scope the native
  // preparation cache to this matrix and restore it before DOCX/CLI checks.
  syncBuiltinESMExports()
  return () => {
    childProcess.execFileSync = nativeExecFileSync
    syncBuiltinESMExports()
    cache.clear()
    console.log(`OCR NATIVE FIXTURES ${JSON.stringify({ ...counts, retainedBytes })}`)
  }
}
const restoreNativePageFixtures = prepareNativePageFixtures()
try {

// Original ordinary body figure with a separately transcribed heading whose
// last pixel enters the parent crop. All changes below are synthetic/in-memory.
// Exercise the public import and complete Canonical preview, not a helper.
{
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const engineDocuments = cloneJson(fixture.evidence.documents)
  const page = confirmation.documents[0].pages.find(value =>
    value.orderedItems.some(item => item.text === 'C passage keeps one small promise.'))
  const index = page.orderedItems.findIndex(item => item.text === 'C passage keeps one small promise.')
  const item = page.orderedItems[index]
  const observed = engineDocuments[0].pages.find(value => value.page === page.page)
  const observation = observed.observations.find(value => value.observationId === item.observationIds[0])
  const rasterPage = fixture.evidence.documents[0].pages.find(value => value.page === page.page).raster
  const { pixelWidth, pixelHeight } = rasterPage
  const headingBottom = Math.floor(observation.region.y * pixelHeight) - 4
  // A fractional normalized bottom also supplies a regression where equal
  // normalized bottoms produce different independently rounded raster edges.
  const figureBottom = (Math.ceil((observation.region.y + observation.region.height) * pixelHeight) + 2.4) / pixelHeight
  const parentRegion = { x: observation.region.x, y: (headingBottom - 1) / pixelHeight,
    width: observation.region.width, height: figureBottom - (headingBottom - 1) / pixelHeight }
  const childRegion = { ...parentRegion, y: headingBottom / pixelHeight,
    height: figureBottom - headingBottom / pixelHeight }
  const heading = { ...cloneJson(observation), observationId: 'synthetic-figure-heading-observation',
    regionId: 'synthetic-figure-heading-text', text: 'Chart summary',
    region: { x: parentRegion.x, y: (headingBottom - 12) / pixelHeight,
      width: Math.min(parentRegion.width, 0.15), height: 12 / pixelHeight } }
  const headingItem = { itemId: 'synthetic-figure-heading-item',
    observationIds: [heading.observationId], text: heading.text }
  const tableObservation = { ...cloneJson(observation), observationId: 'synthetic-adjacent-table-observation',
    regionId: 'synthetic-adjacent-table-text', text: 'Total: 3',
    region: { x: parentRegion.x, y: figureBottom + 1 / pixelHeight,
      width: 80 / pixelWidth, height: 8 / pixelHeight } }
  const tableItem = { itemId: 'synthetic-adjacent-table-item',
    observationIds: [tableObservation.observationId], text: tableObservation.text }
  observed.observations.splice(observed.observations.indexOf(observation), 0, heading)
  observed.observations.splice(observed.observations.indexOf(observation) + 1, 0, tableObservation)
  observed.regions.push({ regionId: heading.regionId, kind: 'text', region: cloneJson(heading.region) },
    { regionId: 'synthetic-body-figure', kind: 'visual', region: cloneJson(parentRegion) },
    { regionId: tableObservation.regionId, kind: 'text', region: cloneJson(tableObservation.region) },
    { regionId: 'synthetic-adjacent-table', kind: 'visual', region: cloneJson(tableObservation.region) })
  observed.readingOrderEdges = observed.observations.slice(1).map((value, i) =>
    ({ before: observed.observations[i].observationId, after: value.observationId }))
  page.orderedItems.splice(index, 0, headingItem)
  page.orderedItems.splice(index + 2, 0, tableItem)
  page.visualClassifications.push({ regionId: 'synthetic-body-figure', classification: 'content_media',
    afterItemId: headingItem.itemId, itemIds: [item.itemId] },
    { regionId: 'synthetic-adjacent-table', classification: 'semantic_table',
      rows: [{ header: false, cells: [[tableItem.itemId]] }] })

  const { default: playwright } = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  const sourceDocuments = fixture.sourceDocuments.map(document => ({ ...document }))
  try {
    const view = await browser.newPage()
    const pages = Array.from({ length: sourceDocuments[0].pageCount }, (_, i) => {
      const raster = rasterPdfRegion({ pdfBytes: sourceDocuments[0].bytes, page: i + 1,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      // Draw the original heading and adjacent native table in blank gaps.
      // No source pixels are erased or whitened.
      const overlay = i + 1 === page.page
        ? `<svg viewBox="0 0 ${pixelWidth} ${pixelHeight}" style="position:absolute;inset:0;width:100%;height:100%">
          <text x="${heading.region.x * pixelWidth}" y="${headingBottom - 2}" font-family="Arial" font-size="12">${heading.text}</text>
          <path d="M ${heading.region.x * pixelWidth} ${headingBottom - 0.5} h ${heading.region.width * pixelWidth}" stroke="black" stroke-width="1"/>
          <rect x="${tableObservation.region.x * pixelWidth}" y="${tableObservation.region.y * pixelHeight}" width="80" height="8" fill="none" stroke="black" stroke-width="0.5"/>
          <text x="${tableObservation.region.x * pixelWidth + 1}" y="${tableObservation.region.y * pixelHeight + 6}" font-family="Arial" font-size="6">${tableObservation.text}</text></svg>`
        : ''
      return `<section><img src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}">${overlay}</section>`
    })
    await view.setContent(`<style>@page{size:A4;margin:0}body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{width:100%;height:100%;display:block}</style>${pages.join('')}`)
    const bytes = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    sourceDocuments[0] = { ...sourceDocuments[0], bytes, sha256: sha256(bytes), byteLength: bytes.byteLength }
  } finally {
    await browser.close()
  }
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents: sourceDocuments,
    engine: { name: 'synthetic-body-top-trim', version: '1' }, confidenceThreshold: 0.97, engineDocuments })
  confirmation.sourceSetDigest = evidence.sourceSetDigest
  confirmation.evidenceDigest = evidence.evidenceDigest
  const produced = produceNck1OcrMaterialization({ paperId, documents: sourceDocuments, evidence, confirmation })
  assert.deepEqual(produced.review.required, [])
  const sourceBytes = { evidenceBytes: new TextEncoder().encode(JSON.stringify(evidence)),
    confirmationBytes: new TextEncoder().encode(JSON.stringify(confirmation)) }
  const materialization = cloneJson(produced.materialization)
  materialization.schemaVersion = 'nck1-source-materialization-v3'
  delete materialization.sourcePresentation
  const owner = materialization.groups.find(group => group.slotId === 'reading.c')
  const figure = owner.blocks.find(block => block.kind === 'figure')
  assert(figure)
  assert.equal(owner.blocks[owner.blocks.indexOf(figure) - 1].content.map(part => part.text).join(''), heading.text)
  const mediaId = figure.mediaId
  const recrop = (value, region) => {
    const media = value.materialization.media.find(media => media.mediaId === mediaId)
    media.extraction.region = cloneJson(region)
    const raster = rasterPdfRegion({ pdfBytes: sourceDocuments.find(document =>
      document.documentId === media.extraction.documentId).bytes, ...media.extraction })
    media.sha256 = sha256(raster.bytes)
    media.pixelWidth = raster.pixelWidth
    media.pixelHeight = raster.pixelHeight
    media.publication = { selection: 'source_crop', sourceSha256: media.sha256 }
    value.mediaFiles[value.mediaFiles.findIndex(file => file.mediaId === mediaId)] = { mediaId, bytes: raster.bytes }
    value.materialization.groups.flatMap(group => group.blocks).find(block =>
      block.kind === 'figure' && block.mediaId === mediaId).source = {
      kind: 'page_region', documentId: media.extraction.documentId, page: media.extraction.page,
      region: cloneJson(region),
    }
    const coverage = value.materialization.sourceCoverage.visuals.find(visual => visual.targetId === mediaId)
    coverage.page = media.extraction.page
    coverage.region = cloneJson(region)
  }
  const trimmed = { materialization, mediaFiles: produced.mediaFiles.map(file => ({ ...file })) }
  recrop(trimmed, childRegion)
  // The old untrimmed path remains independently usable.
  const unchanged = imported(produced, sourceBytes, sourceDocuments)
  assert.deepEqual(unchanged.issues, [])
  assert(compileNck1MaterializationCandidatePreview(unchanged.candidate).compilation)
  for (const version of [3, 4]) {
    const mat = cloneJson(materialization)
    mat.schemaVersion = `nck1-source-materialization-v${version}`
    if (version === 4) {
      const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents: sourceDocuments, evidence, confirmation })
      mat.sourcePresentation = { listeningExample: null, instructions: [
        ['reading.a', '阅读下列短文，从每题所给的四个选项中选出最佳选项。'],
        ['seven-choices', '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'],
        ['cloze', '阅读下面短文，从每题所给的四个选项中选出最佳选项。'],
        ['grammar-fill', '阅读下面材料，在空白处填入适当的单词或括号内单词的正确形式。'],
      ].map(([slotId, text]) => {
        const paragraphs = resolved.structures.get(sourceDocuments[0].documentId).paragraphs.filter(value => value.text === text)
        assert.equal(paragraphs.length, 1)
        return { slotId, text, source: cloneJson(paragraphs[0].sourceIndex) }
      }) }
    }
    const candidate = imported({ ...trimmed, materialization: mat }, sourceBytes, sourceDocuments)
    assert.deepEqual(candidate.issues, [], JSON.stringify(candidate.issues))
    const preview = compileNck1MaterializationCandidatePreview(candidate.candidate)
    assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
    const compiled = preview.compilation.artifacts.canonicalPaper.questionGroups
      .find(group => group.identity.groupId === owner.groupId)
    assert.equal(compiled.content.blocks.filter(block => block.kind === 'figure' && block.mediaId === mediaId).length, 1)
    assert.equal(compiled.content.blocks.find(block => block.kind === 'figure').nodeId, figure.blockId)
    assert.equal(compiled.content.blocks[compiled.content.blocks.findIndex(block => block.kind === 'figure') + 1].kind, 'table',
      'an adjacent native table retains the trimmed figure as its projected before anchor')
    console.log(`PASS OCR ordinary figure top-trim public import+preview: v${version}`)
  }

  const cases = [
    'cut-body-observation', 'missing-items', 'empty-items', 'duplicate-items', 'missing-item',
    'empty-observations', 'missing-observation', 'duplicate-observations',
    'empty-anchor-observations', 'missing-anchor-observation', 'multiple-parent-candidates',
    'no-heading-intrusion', 'no-horizontal-intrusion', 'past-heading-bottom', 'wrong-anchor',
    'changed-anchor-text', 'paragraph-source-alias', 'changed-group-slot', 'changed-group-id',
    'changed-family', 'changed-block-id', 'move-before-anchor', 'changed-after',
    'changed-left', 'changed-width', 'changed-bottom', 'same-normalized-different-raster-bottom',
    'same-raster-top', 'changed-density', 'outside-parent', 'cross-page', 'cross-document',
    'changed-media-id', 'duplicate-media-id', 'extra-child', 'parent-plus-trimmed-child', 'duplicate-reference',
    'coverage-duplicate', 'coverage-extra', 'coverage-page', 'coverage-region', 'visual-proof',
    'wrong-bytes', 'wrong-hash', 'wrong-dimensions', 'wrong-recipe',
  ]
  for (const name of cases) {
    const invalid = { materialization: cloneJson(materialization),
      mediaFiles: trimmed.mediaFiles.map(file => ({ ...file, bytes: new Uint8Array(file.bytes) })) }
    const mat = invalid.materialization
    const group = mat.groups.find(group => group.groupId === owner.groupId)
    const block = group.blocks.find(block => block.mediaId === mediaId)
    const blockIndex = group.blocks.indexOf(block)
    const media = mat.media.find(media => media.mediaId === mediaId)
    const coverage = mat.sourceCoverage.visuals.find(visual => visual.targetId === mediaId)
    const changedEvidence = cloneJson(evidence)
    const changedConfirmation = cloneJson(confirmation)
    const cp = changedConfirmation.documents[0].pages.find(value => value.page === page.page)
    const ep = changedEvidence.documents[0].pages.find(value => value.page === page.page)
    const visual = cp.visualClassifications.find(value => value.regionId === 'synthetic-body-figure')
    const contentItem = cp.orderedItems.find(value => value.itemId === item.itemId)
    const anchorItem = cp.orderedItems.find(value => value.itemId === headingItem.itemId)
    const region = cloneJson(childRegion)
    let cropChanged = false
    if (name === 'cut-body-observation') {
      region.y = observation.region.y + observation.region.height / 2
      region.height = figureBottom - region.y
      cropChanged = true
    } else if (name === 'missing-items') delete visual.itemIds
    else if (name === 'empty-items') visual.itemIds = []
    else if (name === 'duplicate-items') visual.itemIds.push(item.itemId)
    else if (name === 'missing-item') visual.itemIds = ['synthetic-missing-item']
    else if (name === 'empty-observations') contentItem.observationIds = []
    else if (name === 'missing-observation') contentItem.observationIds = ['synthetic-missing-observation']
    else if (name === 'duplicate-observations') contentItem.observationIds.push(contentItem.observationIds[0])
    else if (name === 'empty-anchor-observations') anchorItem.observationIds = []
    else if (name === 'missing-anchor-observation') anchorItem.observationIds = ['synthetic-missing-anchor-observation']
    else if (name === 'multiple-parent-candidates') {
      ep.regions.push({ regionId: 'synthetic-second-parent', kind: 'visual', region: cloneJson(parentRegion) })
      cp.visualClassifications.push({ regionId: 'synthetic-second-parent', classification: 'content_media',
        afterItemId: headingItem.itemId, itemIds: [] })
    } else if (['no-heading-intrusion', 'no-horizontal-intrusion'].includes(name)) {
      const anchorObservation = ep.observations.find(value => value.observationId === heading.observationId)
      if (name === 'no-heading-intrusion') anchorObservation.region.y -= 20 / pixelHeight
      else anchorObservation.region.x = parentRegion.x + parentRegion.width + 0.01
      ep.regions.find(value => value.regionId === heading.regionId).region = cloneJson(anchorObservation.region)
    } else if (name === 'past-heading-bottom') {
      region.y += 1 / pixelHeight
      region.height = figureBottom - region.y
      cropChanged = true
    } else if (name === 'wrong-anchor') visual.afterItemId = page.orderedItems[index - 1].itemId
    else if (name === 'changed-anchor-text') anchorItem.text += ' changed'
    else if (name === 'paragraph-source-alias') group.blocks[blockIndex - 1].source = cloneJson(block.source)
    else if (name === 'changed-group-slot') group.slotId = 'reading.d'
    else if (name === 'changed-group-id') group.groupId += '-forged'
    else if (name === 'changed-family') group.family = 'cloze'
    else if (name === 'changed-block-id') block.blockId += '-forged'
    else if (name === 'move-before-anchor') {
      group.blocks.splice(blockIndex, 1)
      group.blocks.splice(blockIndex - 1, 0, block)
    } else if (name === 'changed-after') {
      group.blocks.splice(blockIndex + 1, 0, { ...cloneJson(group.blocks[blockIndex - 1]),
        blockId: 'synthetic-extra-after-anchor' })
    } else if (name === 'changed-left') {
      region.x += 1 / pixelWidth
      region.width -= 1 / pixelWidth
      cropChanged = true
    } else if (name === 'changed-width') {
      region.width -= 1 / pixelWidth
      cropChanged = true
    } else if (name === 'changed-bottom') {
      region.height -= 1 / pixelHeight
      cropChanged = true
    } else if (name === 'same-normalized-different-raster-bottom') {
      region.y = (headingBottom - 0.4) / pixelHeight
      region.height = figureBottom - region.y
      assert(Math.abs(region.y + region.height - parentRegion.y - parentRegion.height) <= 1e-9)
      const rasterBottom = value => Math.round(value.y * pixelHeight) + Math.round(value.height * pixelHeight)
      assert.notEqual(rasterBottom(region), rasterBottom(parentRegion))
      cropChanged = true
    } else if (name === 'same-raster-top') {
      region.y = parentRegion.y + 0.1 / pixelHeight
      region.height = figureBottom - region.y
      cropChanged = true
    } else if (name === 'changed-density') {
      media.extraction.density = 145
      cropChanged = true
    } else if (name === 'outside-parent') {
      region.y = parentRegion.y - 1 / pixelHeight
      region.height = figureBottom - region.y
      cropChanged = true
    } else if (name === 'cross-page') {
      media.extraction.page = page.page === 1 ? 2 : 1
      cropChanged = true
    } else if (name === 'cross-document') {
      media.extraction.documentId = sourceDocuments[1].documentId
      media.extraction.page = 1
      cropChanged = true
    } else if (name === 'changed-media-id') {
      media.mediaId = block.mediaId = coverage.targetId = 'synthetic-renamed-figure'
      invalid.mediaFiles.find(file => file.mediaId === mediaId).mediaId = media.mediaId
    } else if (name === 'duplicate-media-id') {
      mat.media.push(cloneJson(media))
      invalid.mediaFiles.push({ ...invalid.mediaFiles.find(file => file.mediaId === mediaId) })
    } else if (name === 'extra-child' || name === 'parent-plus-trimmed-child') {
      const extra = cloneJson(media)
      extra.mediaId = 'synthetic-extra-child'
      mat.media.push(extra)
      invalid.mediaFiles.push({ ...invalid.mediaFiles.find(file => file.mediaId === mediaId), mediaId: extra.mediaId })
      group.blocks.push({ ...cloneJson(block), blockId: 'synthetic-extra-child-block', mediaId: extra.mediaId })
      mat.sourceCoverage.visuals.push({ ...cloneJson(coverage), visualId: 'visual:extra-child', targetId: extra.mediaId })
      if (name === 'parent-plus-trimmed-child') recrop(invalid, parentRegion)
    } else if (name === 'duplicate-reference') group.blocks.push({ ...cloneJson(block), blockId: 'synthetic-duplicate-reference' })
    else if (name === 'coverage-duplicate') mat.sourceCoverage.visuals.push({ ...cloneJson(coverage), visualId: 'visual:duplicate-trim' })
    else if (name === 'coverage-extra') mat.sourceCoverage.visuals.push({ ...cloneJson(coverage),
      visualId: 'visual:unconsumed-trim', targetId: 'synthetic-unconsumed-media' })
    else if (name === 'coverage-page') coverage.page = page.page === 1 ? 2 : 1
    else if (name === 'coverage-region') coverage.region.y += 0.0001
    else if (name === 'visual-proof') media.usage = 'visual_proof'
    else if (name === 'wrong-bytes') {
      const fullPage = rasterPdfRegion({ pdfBytes: sourceDocuments[0].bytes, page: page.page,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      invalid.mediaFiles.find(file => file.mediaId === mediaId).bytes = fullPage.bytes
      media.sha256 = media.publication.sourceSha256 = sha256(fullPage.bytes)
      media.pixelWidth = fullPage.pixelWidth
      media.pixelHeight = fullPage.pixelHeight
    } else if (name === 'wrong-hash') media.sha256 = media.publication.sourceSha256 = `sha256:${'0'.repeat(64)}`
    else if (name === 'wrong-dimensions') media.pixelHeight += 1
    else if (name === 'wrong-recipe') media.extraction.region.y += 1 / pixelHeight
    if (cropChanged) recrop(invalid, region)
    rebound(changedEvidence)
    changedConfirmation.evidenceDigest = changedEvidence.evidenceDigest
    const rejected = imported(invalid, {
      evidenceBytes: new TextEncoder().encode(JSON.stringify(changedEvidence)),
      confirmationBytes: new TextEncoder().encode(JSON.stringify(changedConfirmation)),
    }, sourceDocuments)
    assert(rejected.issues.length > 0, `${name} top-trim must fail the public import`)
    const preview = compileNck1MaterializationCandidatePreview(rejected.candidate)
    assert(!preview.compilation, `${name} top-trim cannot compile a usable preview`)
    assert(preview.unresolvedIssues?.length > 0, `${name} top-trim preview must retain blocking issues`)
    if (name === 'wrong-bytes') assert(rejected.issues.some(issue => issue.code === 'MATERIALIZATION_MEDIA_RECIPE_MISMATCH'))
    console.log(`PASS OCR ordinary figure top-trim rejection: ${name}`)
  }
}

// Original synthetic scanned source: replace one MCQ row with a stem and four
// distinct drawings. No commercial paper, source text, hash or crop is embedded.
{
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const engineDocuments = cloneJson(fixture.evidence.documents)
  const page = confirmation.documents[0].pages.find(page =>
    page.orderedItems.some(item => item.text.startsWith('30. ')))
  const itemIndex = page.orderedItems.findIndex(item => item.text.startsWith('30. '))
  const stem = page.orderedItems[itemIndex]
  const observed = engineDocuments[0].pages.find(value => value.page === page.page)
  const observation = observed.observations.find(value => stem.observationIds.includes(value.observationId))
  assert.equal(stem.observationIds.length, 1)
  const original = cloneJson(observation.region)
  const parentRegion = { ...original, y: original.y + original.height * 0.35, height: original.height * 0.65 }
  stem.text = observation.text = '30. Which drawing has three dots?'
  observation.region.height = original.height * 0.25
  observed.regions.find(value => value.regionId === observation.regionId).region = cloneJson(observation.region)
  const labels = { ...cloneJson(observation), observationId: 'synthetic-bank-labels',
    regionId: 'synthetic-bank-label-text', text: 'A. B. C. D.', region: cloneJson(parentRegion) }
  observed.observations.splice(observed.observations.indexOf(observation) + 1, 0, labels)
  observed.regions.push({ regionId: labels.regionId, kind: 'text', region: cloneJson(labels.region) },
    { regionId: 'synthetic-option-bank', kind: 'visual', region: cloneJson(parentRegion) })
  observed.readingOrderEdges = observed.observations.slice(1).map((value, index) =>
    ({ before: observed.observations[index].observationId, after: value.observationId }))
  const labelItem = { itemId: 'synthetic-option-label-item', observationIds: [labels.observationId], text: labels.text }
  page.orderedItems.splice(itemIndex + 1, 0, labelItem)
  page.visualClassifications.push({ regionId: 'synthetic-option-bank', classification: 'content_media',
    afterItemId: stem.itemId, itemIds: [labelItem.itemId] })

  // Keep an ordinary confirmed image too, so losing it cannot be hidden by
  // accepting the four children in place of a different parent.
  const ordinaryPage = confirmation.documents[0].pages.find(value =>
    value.orderedItems.some(item => item.text === 'C passage keeps one small promise.'))
  const ordinaryIndex = ordinaryPage.orderedItems.findIndex(item => item.text === 'C passage keeps one small promise.')
  const ordinaryItem = ordinaryPage.orderedItems[ordinaryIndex]
  const ordinaryObserved = engineDocuments[0].pages.find(value => value.page === ordinaryPage.page)
  const ordinaryObservation = ordinaryObserved.observations.find(value => ordinaryItem.observationIds.includes(value.observationId))
  ordinaryObserved.regions.push({ regionId: 'synthetic-ordinary-image', kind: 'visual', region: cloneJson(ordinaryObservation.region) })
  ordinaryPage.visualClassifications.push({ regionId: 'synthetic-ordinary-image', classification: 'content_media',
    afterItemId: ordinaryPage.orderedItems[ordinaryIndex - 1].itemId, itemIds: [ordinaryItem.itemId] })

  const { default: playwright } = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  const sourceDocuments = fixture.sourceDocuments.map(document => ({ ...document }))
  try {
    const view = await browser.newPage()
    const pages = Array.from({ length: sourceDocuments[0].pageCount }, (_, index) => {
      const raster = rasterPdfRegion({ pdfBytes: sourceDocuments[0].bytes, page: index + 1,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      const overlay = index + 1 === page.page
        ? `<svg viewBox="0 0 400 100" preserveAspectRatio="none" style="position:absolute;left:${original.x * 100}%;top:${original.y * 100}%;width:${original.width * 100}%;height:${original.height * 100}%">
          <rect width="400" height="100" fill="white"/><text x="0" y="20" font-size="18">${stem.text}</text>
          ${[1, 2, 3, 4].map((count, i) => `<g transform="translate(${i * 100 + 10} 45)">
            <rect width="70" height="30" fill="none" stroke="black" stroke-width="2"/>
            ${Array.from({ length: count }, (_, j) => `<circle cx="${10 + j * 15}" cy="15" r="4"/>`).join('')}
            <text x="30" y="50" font-size="15">${'ABCD'[i]}.</text></g>`).join('')}</svg>`
        : ''
      return `<section><img src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}">${overlay}</section>`
    })
    await view.setContent(`<style>@page{size:A4;margin:0}body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{width:100%;height:100%;display:block}</style>${pages.join('')}`)
    const bytes = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    sourceDocuments[0] = { ...sourceDocuments[0], bytes, sha256: sha256(bytes), byteLength: bytes.byteLength }
  } finally {
    await browser.close()
  }
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents: sourceDocuments,
    engine: { name: 'synthetic-option-bank', version: '1' }, confidenceThreshold: 0.97, engineDocuments })
  confirmation.sourceSetDigest = evidence.sourceSetDigest
  confirmation.evidenceDigest = evidence.evidenceDigest
  const produced = produceNck1OcrMaterialization({ paperId, documents: sourceDocuments, evidence, confirmation })
  assert(produced.review.required.some(issue => issue.code === 'NCK1_OCR_OPTIONS_AMBIGUOUS'))
  assert(produced.review.required.every(issue =>
    ['NCK1_OCR_OPTIONS_AMBIGUOUS', 'NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS'].includes(issue.code)),
  `only the synthetic picture bank may need materialization repair: ${JSON.stringify(produced.review.required)}`)
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents: sourceDocuments, evidence, confirmation })
  assert.deepEqual(resolved.issues, [])
  const parent = resolved.contentMedia.find(value => value.source.page === page.page
    && JSON.stringify(value.source.region) === JSON.stringify(parentRegion))
  assert(parent)
  const materialization = cloneJson(produced.materialization)
  materialization.schemaVersion = 'nck1-source-materialization-v3'
  delete materialization.sourcePresentation
  // The producer deliberately cannot parse picture options; repair only that
  // derived question and its media inventory, retaining the immutable closure.
  materialization.issues = []
  const group = materialization.groups.find(value => value.questions.some(question => question.canonicalNumber === 30))
  const question = group.questions.find(value => value.canonicalNumber === 30)
  question.stem = 'Which drawing has three dots?'
  // A bank after a question is intentionally absent from passage blocks, so
  // the producer also omits its unassociated crop from selected media.
  const parentMedia = { ...cloneJson(materialization.media[0]), mediaId: parent.mediaId,
    extraction: { ...cloneJson(parent.source), kind: 'pdf_crop', density: 144 } }
  const mediaFiles = produced.mediaFiles.filter(value => value.mediaId !== parent.mediaId)
  materialization.media = materialization.media.filter(value => value.mediaId !== parent.mediaId)
  materialization.sourceCoverage.visuals = materialization.sourceCoverage.visuals.filter(value => value.targetId !== parent.mediaId)
  const children = []
  const crop = (media, region = media.extraction.region) => {
    media.extraction.region = cloneJson(region)
    const raster = rasterPdfRegion({ pdfBytes: sourceDocuments.find(value => value.documentId === media.extraction.documentId).bytes,
      ...media.extraction })
    media.sha256 = sha256(raster.bytes)
    media.pixelWidth = raster.pixelWidth
    media.pixelHeight = raster.pixelHeight
    media.publication = { selection: 'source_crop', sourceSha256: media.sha256 }
    return { mediaId: media.mediaId, bytes: raster.bytes }
  }
  const parentFile = crop(parentMedia)
  for (let index = 0; index < 4; index += 1) {
    const media = cloneJson(parentMedia)
    media.mediaId = `synthetic-option-${'ABCD'[index]}`
    const region = { x: parentRegion.x + parentRegion.width * (index / 4 + 0.02),
      y: parentRegion.y, width: parentRegion.width * 0.21, height: parentRegion.height }
    mediaFiles.push(crop(media, region))
    children.push(media)
    materialization.media.push(media)
    materialization.sourceCoverage.visuals.push({ visualId: `visual:${media.mediaId}`, page: page.page,
      region: cloneJson(region), disposition: 'content_media', targetId: media.mediaId })
  }
  question.options = children.map((media, index) => ({ label: 'ABCD'[index], figure: { mediaId: media.mediaId } }))
  const sourceBytes = { evidenceBytes: new TextEncoder().encode(JSON.stringify(evidence)),
    confirmationBytes: new TextEncoder().encode(JSON.stringify(confirmation)) }
  const bank = { materialization, mediaFiles }
  const accepted = imported(bank, sourceBytes, sourceDocuments)
  assert.deepEqual(accepted.issues, [], JSON.stringify(accepted.issues))
  const preview = compileNck1MaterializationCandidatePreview(accepted.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  assert.equal(new Set(mediaFiles.filter(value => children.some(child => child.mediaId === value.mediaId))
    .map(value => sha256(value.bytes))).size, 4, 'four distinct PDF drawings, not one image repeated four times')
  const compiledGroup = preview.compilation.artifacts.canonicalPaper.questionGroups
    .find(value => value.identity.groupId === group.groupId)
  assert.equal(compiledGroup.variant.choiceOwnership.sets.find(value => value.questionId === question.questionId)
    .options.filter(value => value.figure).length, 4)
  const v4 = cloneJson(materialization)
  v4.schemaVersion = 'nck1-source-materialization-v4'
  v4.sourcePresentation = { listeningExample: null, instructions: [
    ['reading.a', '阅读下列短文，从每题所给的四个选项中选出最佳选项。'],
    ['seven-choices', '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'],
    ['cloze', '阅读下面短文，从每题所给的四个选项中选出最佳选项。'],
    ['grammar-fill', '阅读下面材料，在空白处填入适当的单词或括号内单词的正确形式。'],
  ].map(([slotId, text]) => {
    const paragraphs = resolved.structures.get(sourceDocuments[0].documentId).paragraphs.filter(value => value.text === text)
    assert.equal(paragraphs.length, 1)
    return { slotId, text, source: cloneJson(paragraphs[0].sourceIndex) }
  }) }
  const v4Candidate = imported({ ...bank, materialization: v4 }, sourceBytes, sourceDocuments)
  assert.deepEqual(v4Candidate.issues, [])
  const v4Preview = compileNck1MaterializationCandidatePreview(v4Candidate.candidate)
  assert(v4Preview.compilation, JSON.stringify(v4Preview.unresolvedIssues))

  // Retaining the bank's original ID must not turn it into an ordinary body
  // image or provide a shortcut around the four-option consumption proof.
  {
    const mat = cloneJson(materialization)
    const childIds = new Set(children.map(child => child.mediaId))
    mat.media = mat.media.filter(media => !childIds.has(media.mediaId))
    mat.sourceCoverage.visuals = mat.sourceCoverage.visuals.filter(visual => !childIds.has(visual.targetId))
    const media = cloneJson(parentMedia)
    const pageRaster = evidence.documents[0].pages.find(value => value.page === page.page).raster
    const region = { ...cloneJson(parentRegion), y: parentRegion.y + 1 / pageRaster.pixelHeight,
      height: parentRegion.height - 1 / pageRaster.pixelHeight }
    const file = crop(media, region)
    mat.media.push(media)
    const owner = mat.groups.find(value => value.groupId === group.groupId)
    owner.questions.find(value => value.questionId === question.questionId).options =
      'ABCD'.split('').map(label => ({ label, text: `${label} synthetic replacement` }))
    owner.blocks.push({ kind: 'figure', blockId: 'synthetic-bank-disguised-as-body',
      mediaId: parent.mediaId, caption: '', source: { ...cloneJson(parent.source), region } })
    mat.sourceCoverage.visuals.push({ ...cloneJson(resolved.sourceVisuals.find(value => value.targetId === parent.mediaId)),
      region: cloneJson(region) })
    const rejected = imported({ materialization: mat,
      mediaFiles: [...mediaFiles.filter(value => !childIds.has(value.mediaId)), file] }, sourceBytes, sourceDocuments)
    assert(rejected.issues.length > 0, 'ordinary top-trim cannot consume an A-D bank')
    const preview = compileNck1MaterializationCandidatePreview(rejected.candidate)
    assert(!preview.compilation)
    assert(preview.unresolvedIssues?.length > 0)
    console.log('PASS OCR figure-option rejection: bank-disguised-as-ordinary-top-trim')
  }

  const cases = [
    'unconfirmed-parent', 'outside-parent', 'old-D-two-pixels-outside', 'cross-parent', 'cross-page', 'cross-document',
    'cross-group', 'changed-group-id', 'same-page-question', 'changed-id-retains-source',
    'changed-question-source', 'changed-source-number', 'overlap', 'duplicate-id', 'same-region-new-id', 'not-one-row',
    'swap-A-D', 'parent-and-children', 'parent-consumed-twice', 'child-in-body', 'missing-ordinary',
    'missing-option', 'extra-media', 'coverage-target', 'coverage-page', 'coverage-region', 'coverage-duplicate',
    'parent-not-labels', 'parent-only-A-label',
    'tampered-bytes', 'tampered-bytes-and-hash',
  ]
  for (const name of cases) {
    const invalid = { materialization: cloneJson(materialization),
      mediaFiles: mediaFiles.map(value => ({ ...value, bytes: new Uint8Array(value.bytes) })) }
    const mat = invalid.materialization
    const owner = mat.groups.find(value => value.groupId === group.groupId)
    const target = owner.questions.find(value => value.questionId === question.questionId)
    let invalidSourceBytes = sourceBytes
    const first = mat.media.find(value => value.mediaId === children[0].mediaId)
    const visual = mat.sourceCoverage.visuals.find(value => value.targetId === first.mediaId)
    const recrop = media => {
      invalid.mediaFiles[invalid.mediaFiles.findIndex(value => value.mediaId === media.mediaId)] = crop(media)
      const coverage = mat.sourceCoverage.visuals.find(value => value.targetId === media.mediaId)
      coverage.page = media.extraction.page
      coverage.region = cloneJson(media.extraction.region)
    }
    if (name === 'unconfirmed-parent') {
      children.forEach(child => {
        const media = mat.media.find(value => value.mediaId === child.mediaId)
        media.extraction.region.y = 0.01
        recrop(media)
      })
    } else if (['outside-parent', 'old-D-two-pixels-outside'].includes(name)) {
      const last = mat.media.find(value => value.mediaId === children[3].mediaId)
      last.extraction.region.width = parentRegion.x + parentRegion.width - last.extraction.region.x
        + (name === 'outside-parent' ? 0.001 : 2 / (210 / 25.4 * 144))
      recrop(last)
    } else if (name === 'cross-parent') {
      first.extraction = cloneJson(mat.media.find(value => value.mediaId !== first.mediaId
        && !children.some(child => child.mediaId === value.mediaId)).extraction)
      recrop(first)
    } else if (name === 'cross-page') {
      first.extraction.page = page.page === 1 ? 2 : 1
      recrop(first)
    } else if (name === 'cross-document') {
      first.extraction.documentId = sourceDocuments[1].documentId
      first.extraction.page = 1
      recrop(first)
    } else if (name === 'cross-group') {
      const other = mat.groups.find(value => value.family === 'reading' && value.groupId !== owner.groupId)
      ;[target.options, other.questions[0].options] = [other.questions[0].options, target.options]
    } else if (name === 'changed-group-id') {
      owner.groupId += '-forged'
    } else if (name === 'same-page-question') {
      const other = owner.questions.find(value => value.questionId !== target.questionId && value.source.page === target.source.page)
      assert(other, 'fixture must exercise a same-page move')
      ;[target.options, other.options] = [other.options, target.options]
    } else if (name === 'changed-id-retains-source') {
      const answer = mat.answers.find(value => value.questionId === target.questionId)
      target.questionId += '-forged'
      answer.questionId = target.questionId
    } else if (name === 'changed-question-source') {
      target.source.region.x += 0.001
    } else if (name === 'changed-source-number') {
      target.sourceNumber += 1
    } else if (name === 'overlap' || name === 'same-region-new-id') {
      const next = mat.media.find(value => value.mediaId === children[1].mediaId)
      next.extraction.region = cloneJson(first.extraction.region)
      if (name === 'overlap') next.extraction.region.x += next.extraction.region.width / 2
      recrop(next)
    } else if (name === 'not-one-row') {
      for (const [index, child] of children.entries()) {
        const media = mat.media.find(value => value.mediaId === child.mediaId)
        media.extraction.region.y += index % 2 ? parentRegion.height * 0.6 : 0
        media.extraction.region.height = parentRegion.height * 0.3
        recrop(media)
      }
    } else if (name === 'duplicate-id') target.options[1].figure.mediaId = first.mediaId
    else if (name === 'swap-A-D') {
      ;[target.options[0].figure, target.options[3].figure] = [target.options[3].figure, target.options[0].figure]
    } else if (name === 'parent-and-children') {
      mat.media.push(cloneJson(parentMedia))
      invalid.mediaFiles.push(parentFile)
      owner.blocks.push({ kind: 'figure', blockId: 'synthetic-parent-retained', mediaId: parent.mediaId,
        caption: '', source: cloneJson(parent.source) })
      mat.sourceCoverage.visuals.push(resolved.sourceVisuals.find(value => value.targetId === parent.mediaId))
    } else if (name === 'parent-consumed-twice') {
      owner.questions.find(value => value.questionId !== target.questionId).options = cloneJson(target.options)
    } else if (name === 'child-in-body') {
      owner.blocks.push({ kind: 'figure', blockId: 'synthetic-child-reused', mediaId: first.mediaId,
        caption: '', source: { kind: 'page_region', documentId: first.extraction.documentId,
          page: first.extraction.page, region: cloneJson(first.extraction.region) } })
    } else if (name === 'missing-ordinary') {
      const ordinary = mat.media.find(value => !children.some(child => child.mediaId === value.mediaId))
      assert(ordinary)
      mat.media = mat.media.filter(value => value.mediaId !== ordinary.mediaId)
      invalid.mediaFiles = invalid.mediaFiles.filter(value => value.mediaId !== ordinary.mediaId)
      owner.blocks = owner.blocks.filter(value => value.mediaId !== ordinary.mediaId)
      mat.sourceCoverage.visuals = mat.sourceCoverage.visuals.filter(value => value.targetId !== ordinary.mediaId)
    } else if (name === 'missing-option') target.options.pop()
    else if (name === 'extra-media') {
      const extra = cloneJson(first)
      extra.mediaId = 'synthetic-unused-extra'
      mat.media.push(extra)
      invalid.mediaFiles.push({ ...invalid.mediaFiles.find(value => value.mediaId === first.mediaId), mediaId: extra.mediaId })
      mat.sourceCoverage.visuals.push({ ...cloneJson(visual), visualId: 'visual:extra', targetId: extra.mediaId })
    } else if (name === 'coverage-target') visual.targetId = children[1].mediaId
    else if (name === 'coverage-page') visual.page = page.page === 1 ? 2 : 1
    else if (name === 'coverage-region') visual.region.x += 0.0001
    else if (name === 'coverage-duplicate') mat.sourceCoverage.visuals.push({ ...cloneJson(visual), visualId: 'visual:duplicate' })
    else if (['parent-not-labels', 'parent-only-A-label'].includes(name)) {
      const changed = cloneJson(confirmation)
      changed.documents[0].pages.find(value => value.page === page.page).orderedItems
        .find(value => value.itemId === labelItem.itemId).text = name === 'parent-only-A-label'
          ? 'A.' : 'A. an ordinary illustration B. C. D.'
      invalidSourceBytes = { ...sourceBytes, confirmationBytes: new TextEncoder().encode(JSON.stringify(changed)) }
    } else {
      const supplied = invalid.mediaFiles.find(value => value.mediaId === first.mediaId)
      // A valid PNG from a different drawing exercises PDF recipe replay even
      // when its declared digest and dimensions are updated consistently.
      supplied.bytes = new Uint8Array(invalid.mediaFiles.find(value => value.mediaId === children[1].mediaId).bytes)
      if (name === 'tampered-bytes-and-hash') {
        first.sha256 = sha256(supplied.bytes)
        first.pixelWidth = children[1].pixelWidth
        first.pixelHeight = children[1].pixelHeight
        first.publication.sourceSha256 = first.sha256
      }
    }
    const rejected = imported(invalid, invalidSourceBytes, sourceDocuments)
    assert(rejected.issues.length > 0, `${name} must fail the public import`)
    const rejectedPreview = compileNck1MaterializationCandidatePreview(rejected.candidate)
    assert(!rejectedPreview.compilation, `${name} cannot compile a usable preview`)
    assert(rejectedPreview.unresolvedIssues?.length > 0, `${name} preview must retain blocking issues`)
    if (name === 'tampered-bytes-and-hash') assert(rejected.issues.some(value => value.code === 'MATERIALIZATION_MEDIA_RECIPE_MISMATCH'))
    console.log(`PASS OCR figure-option rejection: ${name}`)
  }
  console.log(`PASS OCR figure-option public import+preview: v3/v4, ${cases.length} rejections`)
}

} finally {
  restoreNativePageFixtures()
}

// The OCR-only closure must not impose confirmed-PDF-parent requirements on
// the existing native DOCX figure-option route.
{
  const { makeSyntheticNck1DocxFixture } = await import('../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs')
  const { produceNck1DocxMaterialization } = await import('../server/paper-import/nck1DocxMaterializationProducer.mjs')
  const docx = makeSyntheticNck1DocxFixture({ mediaLayout: true })
  const produced = produceNck1DocxMaterialization({ paperId: docx.paperId, documents: docx.sourceDocuments })
  assert.equal(produced.disposition, 'ready_for_verification')
  const mat = cloneJson(produced.materialization)
  mat.schemaVersion = 'nck1-source-materialization-v3'
  const figures = 'ABCD'.split('').map(label => ({ ...cloneJson(mat.media[0]), mediaId: `docx-option-${label}` }))
  mat.media.push(...figures)
  mat.groups[0].questions[0].options = figures.map((media, index) =>
    ({ label: 'ABCD'[index], figure: { mediaId: media.mediaId } }))
  mat.sourceCoverage.visuals.push(...figures.map(media =>
    ({ visualId: `visual:${media.mediaId}`, page: 1, disposition: 'content_media', targetId: media.mediaId })))
  // This legacy test checks transport only; the new OCR bank above uses four
  // distinct original drawings with individually replayed PDF crops.
  const candidate = imported({ materialization: mat, mediaFiles: [...produced.mediaFiles,
    ...figures.map(media => ({ mediaId: media.mediaId, bytes: produced.mediaFiles[0].bytes }))] }, null, docx.sourceDocuments)
  assert.deepEqual(candidate.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(candidate.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
}

// Previously confirmed text-only v59 candidates must not be upgraded on replay.
const historical = importCanonicalCandidate(canonical.candidate.sourceInput, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef59,
})
assert.deepEqual(historical.issues, [])
assert.notEqual(historical.candidate.candidateDigest, canonical.candidate.candidateDigest)
const historicalRequest = materializeNck1CanonicalRequest(historical.candidate.sourceInput, {
  schemaVersion: 'teacher-confirmation-v1', confirmed: true,
  candidateDigest: historical.candidate.candidateDigest,
  sourceDigest: historical.candidate.source.sha256,
})
assert.equal(historicalRequest.request.authority.manifestVersion, '59')
assert.equal(admitLiveConfirmedNck1MaterializationImport(historicalRequest.request).compilation.disposition, 'ready')

// Source-checked OCR ranges are original UTF-16 positions, not a word search.
const markedConfirmation = cloneJson(fixture.confirmation)
markedConfirmation.schemaVersion = 'nck1-ocr-source-confirmation-v2'
const markedItems = markedConfirmation.documents[0].pages.flatMap((page) => page.orderedItems)
const markedParagraph = markedItems.find((item) => item.text === 'C passage keeps one small promise.')
const markedStem = markedItems.find((item) => item.text.startsWith('30. Which choice fits item 30?\n'))
assert(markedParagraph && markedStem)
markedParagraph.sourceEmphasis = [{ start: 20, end: 25, marks: ['bold', 'underline'] }]
markedStem.sourceEmphasis = [{ start: 10, end: 16, marks: ['underline'] }]
const markedProduced = produceNck1OcrMaterialization({
  paperId, documents: fixture.sourceDocuments, evidence: fixture.evidence, confirmation: markedConfirmation,
})
assert.equal(markedProduced.disposition, 'ready_for_verification')
const ocrSourceBytes = {
  evidenceBytes: new TextEncoder().encode(JSON.stringify(fixture.evidence)),
  confirmationBytes: new TextEncoder().encode(JSON.stringify(markedConfirmation)),
}
const marked = imported(markedProduced, ocrSourceBytes)
assert.deepEqual(marked.issues, [])
const markedReading = marked.candidate.interpretation.groups.find((group) => group.slotId === 'reading.c')
assert.deepEqual(markedReading.content.blocks[0].inlines.map(({ text, marks }) => ({ text, ...(marks ? { marks } : {}) })), [
  { text: 'C passage keeps one ' }, { text: 'small', marks: ['bold', 'underline'] }, { text: ' promise.' },
])
const question30 = markedReading.variant.questions.find((question) => question.questionId.endsWith(':30'))
assert.deepEqual(question30.stem.map(({ text, marks }) => ({ text, ...(marks ? { marks } : {}) })), [
  { text: 'Which ' }, { text: 'choice', marks: ['underline'] }, { text: ' fits item 30?' },
])
const markedPreview = compileNck1MaterializationCandidatePreview(marked.candidate)
assert(markedPreview.compilation, JSON.stringify(markedPreview.unresolvedIssues))
// Writing marks split referenced prompt inlines without invalidating their
// semantic bindings. Answer-source marks must never decorate question text.
const writingConfirmation = cloneJson(markedConfirmation)
const applicationPrompt = markedProduced.materialization.groups
  .find(group => group.family === 'application-writing').writingTask.prompt
const writingParagraph = writingConfirmation.documents[0].pages.flatMap(page => page.orderedItems)
  .find(item => item.text === applicationPrompt)
assert(writingParagraph)
writingParagraph.sourceEmphasis = [{ start: 0, end: 3, marks: ['bold'] }]
const writingMarks = [{ family: 'application', text: applicationPrompt.slice(0, 3), mark: 'bold' }]
for (const [family, needle, mark] of [
  ['application', '80', 'underline'],
  ['continuation', '150', 'bold'],
  ['continuation', 'lost notebook', 'underline'],
]) {
  const item = writingConfirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text.includes(needle))
  assert(item, `synthetic writing source must include ${needle}`)
  const start = item.text.indexOf(needle)
  item.sourceEmphasis = [{ start, end: start + needle.length, marks: [mark] }]
  writingMarks.push({ family, text: needle, mark })
}
const answerParagraph = writingConfirmation.documents[1].pages.flatMap(page => page.orderedItems)
  .find(item => item.text.length > 3)
assert(answerParagraph)
answerParagraph.sourceEmphasis = [{ start: 0, end: 3, marks: ['underline'] }]
const writing = imported(markedProduced, { ...ocrSourceBytes,
  confirmationBytes: new TextEncoder().encode(JSON.stringify(writingConfirmation)) })
assert.deepEqual(writing.issues, [])
const writingGroup = writing.candidate.interpretation.groups.find(group => group.family === 'application-writing')
const writingBlock = writingGroup.content.blocks.find(block => block.inlines?.map(item => item.text).join('') === applicationPrompt)
assert.deepEqual(writingBlock.inlines.map(({ text, marks }) => ({ text, ...(marks ? { marks } : {}) })), [
  { text: applicationPrompt.slice(0, 3), marks: ['bold'] }, { text: applicationPrompt.slice(3) },
])
const writingPreview = compileNck1MaterializationCandidatePreview(writing.candidate)
assert(writingPreview.compilation, JSON.stringify(writingPreview.unresolvedIssues))
// Observe both actual writing surfaces, including normalized split notices.
// A compilation-only check cannot detect a renderer dropping source marks.
{
  const consumption = buildNck1ReviewConsumption(writing.candidate, writingPreview.compilation)
  const html = reviewPrintHtml({ consumption, paperId, paperName: 'Source emphasis regression', paperAsset: {} }, 'student', buildPrintHtml)
  const { createServer } = await import('../app/node_modules/vite/dist/node/index.js')
  const { default: playwright } = await import('../app/node_modules/playwright/index.js')
  const vite = await createServer({ root: path.join(root, 'app'), server: { host: '127.0.0.1', port: 0 } })
  await vite.listen()
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  const artifacts = process.env.EQB_WRITING_MARK_ARTIFACTS
  if (artifacts) mkdirSync(artifacts, { recursive: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    for (const family of ['application', 'continuation']) {
      await page.route(`**/qa/canonical-${family}-writing-consumption.json`, route => route.fulfill({
        contentType: 'application/json', body: JSON.stringify(consumption),
      }))
      const groupId = consumption.selections.find(selection => selection.familyContractId === `${family}-writing`).groupIds[0]
      await page.goto(`${vite.resolvedUrls.local[0]}canonical-${family}-writing-qa.html?groupId=${encodeURIComponent(groupId)}`)
      await page.locator('[data-canonical-response-slot-id]').waitFor()
      await page.evaluate(() => document.fonts.ready)
      for (const expected of writingMarks.filter(item => item.family === family)) {
        const marked = page.locator(`[data-source-marks~="${expected.mark}"]`).filter({ hasText: expected.text })
        assert.equal(await marked.count(), 1, `${family} Screen retains ${expected.text} emphasis exactly once`)
        assert.equal(await marked.evaluate((element, mark) => mark === 'bold'
          ? getComputedStyle(element).fontWeight === '700'
          : getComputedStyle(element).textDecorationLine.includes('underline'), expected.mark), true)
      }
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `${family}-screen.png`), fullPage: true })
    }
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    for (const expected of writingMarks) {
      const marked = page.locator(`[data-source-marks~="${expected.mark}"]`).filter({ hasText: expected.text })
      assert.equal(await marked.count(), 1, `Print retains ${expected.text} emphasis exactly once`)
    }
    if (artifacts) {
      writeFileSync(path.join(artifacts, 'print.html'), html)
      await page.pdf({ path: path.join(artifacts, 'writing-emphasis.pdf'), printBackground: true, preferCSSPageSize: true })
      for (const family of ['application', 'continuation']) {
        await page.locator(`.canonical-${family}-writing`).first().screenshot({ path: path.join(artifacts, `${family}-print.png`) })
      }
    }
  } finally {
    await browser.close()
    await vite.close()
  }
}
assert(importCanonicalCandidate(writing.candidate.sourceInput, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef66,
}).issues.some(issue => issue.code === 'MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED'))
const markedRequest = materializeNck1CanonicalRequest(marked.candidate.sourceInput, {
  schemaVersion: 'teacher-confirmation-v1', confirmed: true,
  candidateDigest: marked.candidate.candidateDigest, sourceDigest: marked.candidate.source.sha256,
})
assert.equal(admitLiveConfirmedNck1MaterializationImport(markedRequest.request).compilation.disposition, 'ready')
for (const change of ['out-of-range', 'option', 'stale-evidence']) {
  const invalid = cloneJson(markedConfirmation)
  const paragraph = invalid.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.itemId === markedParagraph.itemId)
  const stem = invalid.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.itemId === markedStem.itemId)
  if (change === 'out-of-range') paragraph.sourceEmphasis[0].end = paragraph.text.length + 1
  if (change === 'option') stem.sourceEmphasis = [{ start: stem.text.indexOf('A.'), end: stem.text.length, marks: ['bold'] }]
  if (change === 'stale-evidence') invalid.evidenceDigest = `sha256:${'0'.repeat(64)}`
  const rejected = imported(markedProduced, { ...ocrSourceBytes,
    confirmationBytes: new TextEncoder().encode(JSON.stringify(invalid)) })
  assert(rejected.issues.some(issue => issue.code === 'MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED'), change)
}

const lowConfidence = cloneJson(fixture.evidence)
const lowObservation = lowConfidence.documents[0].pages
  .flatMap((page) => page.observations)[0]
lowObservation.confidence = 0.4
lowObservation.alternatives = [{ text: `${lowObservation.text}?`, confidence: 0.39 }]
rebound(lowConfidence)
const lowConfidenceUnconfirmed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: lowConfidence,
})
assert.equal(lowConfidenceUnconfirmed.disposition, 'needs_agent_review')
assert(lowConfidenceUnconfirmed.review.required.some((item) =>
  item.code === 'NCK1_OCR_TEXT_LAYER_REQUIRED'))
assert.equal(lowConfidenceUnconfirmed.review.required.some((item) =>
  item.code === 'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED'), false)
const lowConfidenceConfirmation = cloneJson(fixture.confirmation)
lowConfidenceConfirmation.evidenceDigest = lowConfidence.evidenceDigest
const lowConfidenceClosed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: lowConfidence,
  confirmation: lowConfidenceConfirmation,
})
assert.equal(lowConfidenceClosed.disposition, 'ready_for_verification')
assert.deepEqual(lowConfidenceClosed.review.required, [])

const ambiguousOrder = cloneJson(fixture.evidence)
const ambiguousPage = ambiguousOrder.documents[0].pages.find((page) =>
  page.observations.length > 1)
ambiguousPage.readingOrderEdges = []
expectedReview(rebound(ambiguousOrder), 'NCK1_OCR_READING_ORDER_AMBIGUOUS')

const unclassifiedVisual = cloneJson(fixture.evidence)
unclassifiedVisual.documents[0].pages
  .flatMap((page) => page.regions)
  .find((region) => region.kind === 'visual').kind = 'unclassified'
expectedReview(rebound(unclassifiedVisual), 'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED')

const missingPage = cloneJson(fixture.evidence)
missingPage.documents[0].pages.pop()
expectedReview(rebound(missingPage), 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE')

const rasterDrift = cloneJson(fixture.evidence)
rasterDrift.documents[0].pages[0].raster.sha256 = `sha256:${'0'.repeat(64)}`
expectedReview(rebound(rasterDrift), 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE')

const changedEvidence = cloneJson(fixture.evidence)
changedEvidence.documents[0].pages[0].observations[0].text += ' corrected'
rebound(changedEvidence)
const stale = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: changedEvidence,
  confirmation: fixture.confirmation,
})
assert.equal(stale.disposition, 'needs_agent_review')
const staleIssue = stale.review.required.find((item) =>
  item.code === 'NCK1_OCR_CONFIRMATION_STALE')
assert(staleIssue)
assertLocatedIssue(staleIssue)
assert.equal(imported(stale).candidate?.interpretation, null)

// Regression: bare answer-side issues that entered OCR materialization with
// only `{ documentId }` (no page/region) — e.g. a legitimately-missing numbered
// answer key — must keep the official-answers documentId after `closeIssueSource`
// fabricates the missing page/region. They must not be re-attributed to the
// question-source document. See `closeIssueSource` in nck1OcrMaterializationProducer.mjs.
const answerDocId = fixture.sourceDocuments.find((d) => d.role === 'official_answers').documentId
const questionDocId = fixture.sourceDocuments.find((d) => d.role === 'question_source').documentId
const omitted21 = cloneJson(fixture.confirmation)
const omitted21AnswerDoc = omitted21.documents.find((d) => d.documentId === answerDocId)
let omitted21RangeEdits = 0
let omitted21LabelEdits = 0
for (const page of omitted21AnswerDoc.pages) {
  for (const item of page.orderedItems) {
    if (/21-23ABC/u.test(item.text)) {
      item.text = item.text.replace(/21-23ABC/u, '22-23BC')
      omitted21RangeEdits += 1
    }
    if (/^21\.\s*A\s*【解析】/u.test(item.text)) {
      item.text = item.text.replace(/^21\.\s*A\s*/u, '')
      omitted21LabelEdits += 1
    }
  }
}
assert.equal(omitted21RangeEdits, 1, 'repro must drop the 21-23ABC answer range')
assert.equal(omitted21LabelEdits, 1, 'repro must drop the standalone 21. A answer label')
const omitted21Produced = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: fixture.evidence,
  confirmation: omitted21,
})
assert.equal(omitted21Produced.disposition, 'needs_agent_review')
assert.equal(omitted21Produced.materialization.answers.length, 44,
  'omitting answer 21 yields 44 authoritative answers (22-65)')
for (const list of [
  omitted21Produced.materialization.issues,
  omitted21Produced.review.required,
]) {
  const missing21 = list.find((item) =>
    item.code === 'NCK1_OCR_ANSWER_MISSING' && item.path === 'answers.21')
  assert(missing21, 'NCK1_OCR_ANSWER_MISSING for answers.21 must be emitted')
  assertLocatedIssue(missing21)
  assert.equal(missing21.source.documentId, answerDocId,
    `NCK1_OCR_ANSWER_MISSING at answers.21 must point at ${answerDocId} (the answer doc),`
    + ` not ${questionDocId} (the question doc)`)
}
assert.equal(imported(omitted21Produced).candidate?.interpretation, null,
  'an answer-side missing-key issue cannot derive a usable Candidate')

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-ocr-cli-'))
const cliPaperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
try {
  const questionPath = path.join(tempRoot, 'question.pdf')
  const answerPath = path.join(tempRoot, 'answers.pdf')
  const evidencePath = path.join(tempRoot, 'evidence.json')
  const confirmationPath = path.join(tempRoot, 'confirmation.json')
  writeFileSync(questionPath, fixture.sourceDocuments[0].bytes)
  writeFileSync(answerPath, fixture.sourceDocuments[1].bytes)
  writeFileSync(evidencePath, `${JSON.stringify(fixture.evidence, null, 2)}\n`)
  writeFileSync(confirmationPath, `${JSON.stringify(markedConfirmation, null, 2)}\n`)
  const run = (...args) => execFileSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.match(run(
    'init',
    paperId,
    '--paper-name', 'Synthetic NCK1 OCR evidence',
    '--provenance', 'anonymous synthetic fixture',
    '--year', '2025', '--month', '12',
    '--source', `question_source=${questionPath}`,
    '--source', `official_answers=${answerPath}`,
  ), /INITIALIZED/u)
  const v3Dir = path.join(tempRoot, 'confirmation-v3')
  cpSync(cliPaperDir, v3Dir, { recursive: true })
  mkdirSync(path.join(v3Dir, 'materialization'), { recursive: true })
  writeFileSync(path.join(v3Dir, 'materialization/nck1-ocr-source-evidence-v1.json'), JSON.stringify(fixture.evidence))
  writeFileSync(path.join(v3Dir, 'materialization/nck1-ocr-source-confirmation-v1.json'),
    JSON.stringify({ ...fixture.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v3' }))
  const v3Job = { paperDir: v3Dir, manifest: JSON.parse(readFileSync(path.join(v3Dir, 'universal-source-manifest.json'))) }
  assert.equal(runNck1MaterializationJob(v3Job).disposition, 'ready_for_verification')
  assert.equal(inspectNck1Materialization(v3Job).producerVersion, 'nck1-ocr-materialization-producer-v28')
  assert.equal(runNck1MaterializationJob(v3Job).cached, true, 'v3 output, review and receipt must agree on the current producer')
  const v3ReviewFile = path.join(v3Dir, 'materialization/nck1-ocr-materialization-review-v1.json')
  const v3ReviewBytes = readFileSync(v3ReviewFile)
  writeFileSync(v3ReviewFile, JSON.stringify({ ...JSON.parse(v3ReviewBytes), producerVersion: 'nck1-ocr-materialization-producer-v6' }))
  assert.throws(() => inspectNck1Materialization(v3Job), /not bound/u)
  assert.throws(() => runNck1MaterializationJob(v3Job), /not bound/u,
    'a current receipt cannot mask a stale producer review on cache hits')
  writeFileSync(v3ReviewFile, v3ReviewBytes)
  const v3Paths = [path.join(v3Dir, v3Job.manifest.materializationPath),
    path.join(v3Dir, 'materialization/nck1-ocr-materialization-producer-receipt-v1.json'), v3ReviewFile]
  for (const version of [8, 10, 6, 7, 9]) {
    const producerVersion = `nck1-ocr-materialization-producer-v${version}`
    const sourceDigest = nck1OcrProducerSourceDigest(fixture.sourceDocuments, {
      evidence: fixture.evidence, confirmation: { ...fixture.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v3' },
      producerVersion,
    })
    for (const file of v3Paths.slice(1)) {
      const value = JSON.parse(readFileSync(file, 'utf8'))
      delete value.listeningSourcePartition
      delete value.listeningSourcePartitionDigest
      writeFileSync(file, JSON.stringify({ ...value, producerVersion, sourceDigest }))
    }
    const retained = v3Paths.map(file => readFileSync(file))
    if (version === 8 || version === 10) {
      assert.equal(inspectNck1Materialization(v3Job).producerState, 'historical')
    } else {
      assert.throws(() => inspectNck1Materialization(v3Job), /not bound/u,
        'pre-v3 producers cannot attest confirmation v3 even with matching recomputed digests')
    }
    assert.throws(() => runNck1MaterializationJob(v3Job), /refusing to overwrite/u,
      'a previous parser must never supply a current cache hit or be overwritten')
    v3Paths.forEach((file, index) => assert.deepEqual(readFileSync(file), retained[index]))
  }
  assert.match(run('materialize', paperId), /"disposition": "needs_agent_review"/u)
  const failedOutputPath = path.join(cliPaperDir, fixture.manifest.materializationPath)
  const pdfReceiptPath = path.join(cliPaperDir, 'materialization/nck1-pdf-materialization-producer-receipt-v1.json')
  const pdfReviewPath = path.join(cliPaperDir, 'materialization/nck1-pdf-materialization-review-v1.json')
  const failedBytes = readFileSync(failedOutputPath)
  const pdfReceiptBytes = readFileSync(pdfReceiptPath)
  const pdfReviewBytes = readFileSync(pdfReviewPath)
  assert.match(run('stage-ocr', paperId, evidencePath), /"state": "written"/u)
  const assertSwitchRefused = () => {
    assert.throws(() => run('materialize', paperId), (error) =>
      /refusing to overwrite/u.test(String(error.stderr)))
  }
  writeFileSync(failedOutputPath, Buffer.concat([failedBytes, Buffer.from('\n')]))
  assertSwitchRefused()
  assert.deepEqual(readFileSync(failedOutputPath), Buffer.concat([failedBytes, Buffer.from('\n')]))
  writeFileSync(failedOutputPath, failedBytes)
  for (const patch of [{ disposition: 'ready_for_verification' }, { sourceDigest: 'sha256:stale' }, { paperId: 'paper-other' }]) {
    writeFileSync(pdfReceiptPath, JSON.stringify({ ...JSON.parse(pdfReceiptBytes), ...patch }))
    assertSwitchRefused()
    assert.deepEqual(readFileSync(failedOutputPath), failedBytes)
  }
  writeFileSync(pdfReceiptPath, pdfReceiptBytes)
  assert.match(run('materialize', paperId), /"disposition": "needs_agent_review"/u)
  const archive = path.join(cliPaperDir, 'materialization/producer-history',
    JSON.parse(pdfReceiptBytes).outputDigest.replace('sha256:', ''))
  for (const [original, bytes] of [[failedOutputPath, failedBytes], [pdfReceiptPath, pdfReceiptBytes], [pdfReviewPath, pdfReviewBytes]]) {
    assert.deepEqual(readFileSync(path.join(archive, path.basename(original))), bytes)
  }
  assert.deepEqual(readFileSync(pdfReceiptPath), pdfReceiptBytes)
  assert.deepEqual(readFileSync(pdfReviewPath), pdfReviewBytes)
  assert.match(run('confirm-ocr', paperId, confirmationPath), /"confirmedItems":/u)
  assert.match(run('materialize', paperId), /"disposition": "ready_for_verification"/u)
  const spellingReview = prepareSpellingReview(new Uint8Array(readFileSync(path.join(cliPaperDir, fixture.manifest.materializationPath))), TEXT_REVIEW_POLICY)
  spellingReview.reviewedBy = 'import_agent'
  spellingReview.reviewedAt = '2026-09-21T00:00:00Z'
  spellingReview.targets.forEach(target => { target.decision = 'unchanged' })
  writeFileSync(path.join(cliPaperDir, SPELLING_REVIEW_FILE), JSON.stringify(spellingReview))
  assert.match(run('verify', paperId), /"groups": 9/u)
  assert.match(run('verify', paperId), /"assertions": 45/u)
  assert.match(run('build', paperId), /BUILT CANDIDATE/u)
  const reloaded = importCanonicalCandidate(loadNck1ReviewSource(cliPaperDir).sourceInput)
  assert.deepEqual(reloaded.issues, [])
  const reloadedReading = reloaded.candidate.interpretation.groups.find(group => group.slotId === 'reading.c')
  assert.deepEqual(reloadedReading.content.blocks[0].inlines, markedReading.content.blocks[0].inlines)
  assert.deepEqual(reloadedReading.variant.questions.find(question => question.questionId.endsWith(':30')).stem, question30.stem)
  const stagedEvidencePath = path.join(
    cliPaperDir,
    'materialization/nck1-ocr-source-evidence-v1.json',
  )
  const stagedConfirmationPath = path.join(
    cliPaperDir,
    'materialization/nck1-ocr-source-confirmation-v1.json',
  )
  const outputPath = path.join(cliPaperDir, fixture.manifest.materializationPath)
  const receiptPath = path.join(
    cliPaperDir,
    'materialization/nck1-ocr-materialization-producer-receipt-v1.json',
  )
  const readyBytes = readFileSync(outputPath)
  const readyReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const reviewPath = path.join(cliPaperDir, 'materialization/nck1-ocr-materialization-review-v1.json')
  const readyReviewBytes = readFileSync(reviewPath)
  const historicalVersion = 'nck1-ocr-materialization-producer-v6'
  const historicalDigest = nck1OcrProducerSourceDigest(fixture.sourceDocuments, {
    evidence: fixture.evidence, confirmation: markedConfirmation, producerVersion: historicalVersion,
  })
  const historicalReceipt = { ...readyReceipt, producerVersion: historicalVersion, sourceDigest: historicalDigest }
  const historicalReview = { ...JSON.parse(readyReviewBytes), producerVersion: historicalVersion, sourceDigest: historicalDigest }
  delete historicalReceipt.listeningSourcePartitionDigest
  delete historicalReview.listeningSourcePartition
  writeFileSync(receiptPath, JSON.stringify(historicalReceipt))
  writeFileSync(reviewPath, JSON.stringify(historicalReview))
  const cliManifest = JSON.parse(readFileSync(path.join(cliPaperDir, 'universal-source-manifest.json')))
  const historical = inspectNck1Materialization({ paperDir: cliPaperDir, manifest: cliManifest })
  assert.equal(historical.producerState, 'historical')
  assert.equal(historical.outputState, 'producer_output_unchanged')
  const historicalBytes = [outputPath, receiptPath, reviewPath].map(file => readFileSync(file))
  const refuseHistoricalWriter = () => {
    assert.throws(() => run('materialize', paperId), error => /refusing to overwrite/u.test(String(error.stderr)))
    for (const [index, file] of [outputPath, receiptPath, reviewPath].entries()) assert.deepEqual(readFileSync(file), historicalBytes[index])
  }
  refuseHistoricalWriter()
  const correctedEvidence = cloneJson(fixture.evidence)
  const correctedObservation = correctedEvidence.documents[0].pages[0].observations[5]
  correctedObservation.region.y += 0.001
  correctedEvidence.documents[0].pages[0].regions
    .find((region) => region.regionId === correctedObservation.regionId)
    .region = cloneJson(correctedObservation.region)
  rebound(correctedEvidence)
  const correctedConfirmation = cloneJson(markedConfirmation)
  correctedConfirmation.evidenceDigest = correctedEvidence.evidenceDigest
  writeFileSync(stagedEvidencePath, `${JSON.stringify(correctedEvidence, null, 2)}\n`)
  writeFileSync(stagedConfirmationPath, `${JSON.stringify(correctedConfirmation, null, 2)}\n`)
  assert.throws(() => inspectNck1Materialization({ paperDir: cliPaperDir, manifest: cliManifest }), /not bound/u)
  refuseHistoricalWriter()
  // Only a same-version input correction may replace an untouched output.
  writeFileSync(receiptPath, JSON.stringify(readyReceipt))
  writeFileSync(reviewPath, readyReviewBytes)
  assert.match(run('materialize', paperId), /"cached": false/u)
  const correctedBytes = readFileSync(outputPath)
  const correctedReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  assert.notDeepEqual(correctedBytes, readyBytes)
  assert.notEqual(correctedReceipt.sourceDigest, readyReceipt.sourceDigest)
  assert.equal(correctedReceipt.producerVersion, readyReceipt.producerVersion)

  const guardedEvidence = cloneJson(correctedEvidence)
  const guardedObservation = guardedEvidence.documents[0].pages[0].observations[5]
  guardedObservation.region.y += 0.001
  guardedEvidence.documents[0].pages[0].regions
    .find((region) => region.regionId === guardedObservation.regionId)
    .region = cloneJson(guardedObservation.region)
  rebound(guardedEvidence)
  const guardedConfirmation = cloneJson(correctedConfirmation)
  guardedConfirmation.evidenceDigest = guardedEvidence.evidenceDigest
  writeFileSync(stagedEvidencePath, `${JSON.stringify(guardedEvidence, null, 2)}\n`)
  writeFileSync(stagedConfirmationPath, `${JSON.stringify(guardedConfirmation, null, 2)}\n`)
  const agentModifiedBytes = Buffer.concat([correctedBytes, Buffer.from('\n')])
  writeFileSync(outputPath, agentModifiedBytes)
  let rematerializeError
  try {
    run('materialize', paperId)
  } catch (error) {
    rematerializeError = error
  }
  assert.match(String(rematerializeError?.stderr), /refusing to overwrite/u)
  assert.deepEqual(readFileSync(outputPath), agentModifiedBytes)

  const materialization = JSON.parse(readFileSync(path.join(
    cliPaperDir,
    fixture.manifest.materializationPath,
  ), 'utf8'))
  assert.equal(materialization.groups.length, 9)
  assert.equal(materialization.answers.length, 45)
  for (const relativePath of [
    'materialization/nck1-ocr-source-evidence-v1.json',
    'materialization/nck1-ocr-source-confirmation-v1.json',
    'materialization/nck1-ocr-materialization-review-v1.json',
    'materialization/nck1-ocr-materialization-producer-receipt-v1.json',
    'canonical-evidence/candidate-summary.json',
  ]) assert(existsSync(path.join(cliPaperDir, relativePath)), relativePath)
} finally {
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-nck1-ocr-source-evidence: PASS')
