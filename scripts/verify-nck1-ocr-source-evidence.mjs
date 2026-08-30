#!/usr/bin/env node

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

import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import {
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

function imported(produced) {
  return importCanonicalCandidate({
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
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

const lowConfidence = cloneJson(fixture.evidence)
const lowObservation = lowConfidence.documents[0].pages
  .flatMap((page) => page.observations)[0]
lowObservation.confidence = 0.4
lowObservation.alternatives = [{ text: `${lowObservation.text}?`, confidence: 0.39 }]
expectedReview(rebound(lowConfidence), 'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED')

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
  writeFileSync(confirmationPath, `${JSON.stringify(fixture.confirmation, null, 2)}\n`)
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
    '--source', `question_source=${questionPath}`,
    '--source', `official_answers=${answerPath}`,
  ), /INITIALIZED/u)
  assert.match(run('stage-ocr', paperId, evidencePath), /"state": "written"/u)
  assert.match(run('materialize', paperId), /"disposition": "needs_agent_review"/u)
  assert.match(run('confirm-ocr', paperId, confirmationPath), /"confirmedItems":/u)
  assert.match(run('materialize', paperId), /"disposition": "ready_for_verification"/u)
  assert.match(run('verify', paperId), /"groups": 9/u)
  assert.match(run('verify', paperId), /"assertions": 45/u)
  assert.match(run('build', paperId), /BUILT CANDIDATE/u)
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
