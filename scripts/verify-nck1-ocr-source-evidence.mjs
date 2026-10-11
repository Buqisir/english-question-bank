#!/usr/bin/env node
// verify-resource: browser-render

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { nck1MaterializationHistoricalAuthorityRef59 } from '../shared/paper-canonical/authority.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { loadNck1ReviewSource } from '../server/import-review/revisionProjection.mjs'
import { prepareSpellingReview, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
import { inspectNck1Materialization } from './import-pipeline/nck1-docx-materialize.mjs'
import {
  nck1OcrProducerSourceDigest,
  produceNck1OcrMaterialization,
} from '../server/paper-import/nck1OcrMaterializationProducer.mjs'
import {
  nck1OcrEvidenceDigest,
} from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  extractNck1PdfTextStructure,
  Nck1PdfTextStructureError,
} from '../server/paper-import/nck1PdfTextSourceAdapter.mjs'
import {
  cloneJson,
  makeSyntheticNck1OcrFixture,
} from '../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const paperId = `paper-synthetic-ocr-evidence-${process.pid}`
execFileSync(process.execPath, [path.join(root, 'scripts/generate-paper-ocr-emphasis-authority.mjs'), '--check'], {
  cwd: root,
  stdio: 'inherit',
})
const fixture = await makeSyntheticNck1OcrFixture({ paperId })

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

function imported(produced, ocrSourceBytes = null) {
  return importCanonicalCandidate({
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
    ...(ocrSourceBytes ? { ocrSourceBytes } : {}),
    documents: fixture.sourceDocuments.map((document) => ({
      documentId: document.documentId,
      bytes: document.bytes,
    })),
    media: [],
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
  writeFileSync(receiptPath, JSON.stringify({ ...readyReceipt, producerVersion: historicalVersion, sourceDigest: historicalDigest }))
  writeFileSync(reviewPath, JSON.stringify({ ...JSON.parse(readyReviewBytes), producerVersion: historicalVersion, sourceDigest: historicalDigest }))
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
