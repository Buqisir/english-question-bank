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
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  produceNck1PdfMaterialization,
} from '../server/paper-import/nck1PdfMaterializationProducer.mjs'
import {
  extractNck1PdfTextStructure,
  Nck1PdfTextStructureError,
} from '../server/paper-import/nck1PdfTextSourceAdapter.mjs'
import {
  makeSyntheticNck1PdfFixture,
} from '../test-fixtures/paper-import/nck1-pdf-materialization-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const fixture = await makeSyntheticNck1PdfFixture()

const produced = produceNck1PdfMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments,
})
assert.equal(produced.disposition, 'ready_for_verification')
assert.equal(produced.review.schemaVersion, 'nck1-pdf-materialization-review-v1')
assert.deepEqual(produced.review.required, [])
assert.deepEqual(
  produced.materialization.groups.map((group) => group.slotId),
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
assert.equal(produced.materialization.answers.length, 45)
assert.equal(
  JSON.stringify(produced.materialization).includes('deliberately untrusted explanation'),
  false,
  'answer explanations must not enter Canonical or teacher-facing materialization content',
)

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

function assertPageRegion(value) {
  assert.equal(value?.kind, 'page_region')
  assert(Number.isInteger(value.page) && value.page > 0)
  assert(validRegion(value.region))
}

const blocks = produced.materialization.groups.flatMap((group) => group.blocks)
const questions = produced.materialization.groups.flatMap((group) => group.questions)
assert(blocks.length > 20)
blocks.forEach((block) => assertPageRegion(block.source))
questions.forEach((question) => assertPageRegion(question.source))
produced.materialization.answers.forEach((answer) => assertPageRegion(answer.authority))

const orderedQuestions = questions
  .filter((question) => Number.isInteger(question.canonicalNumber))
  .sort((left, right) => left.canonicalNumber - right.canonicalNumber)
assert.equal(orderedQuestions.length, 45)
for (let index = 1; index < orderedQuestions.length; index += 1) {
  const previous = orderedQuestions[index - 1].source
  const current = orderedQuestions[index].source
  assert(
    current.page > previous.page
      || (current.page === previous.page && current.region.y >= previous.region.y),
    'source question order must replay from page-region locators',
  )
}

const semanticTable = blocks.find((block) =>
  block.kind === 'table' && block.columnCount === 2 && block.rows.length === 2)
assert(semanticTable, 'a simple PDF table must remain a semantic table')
assertPageRegion(semanticTable.source)
assert.deepEqual(produced.materialization.sourceCoverage.visuals, [{
  visualId: `visual:${fixture.paperId}:table-1`,
  page: semanticTable.source.page,
  disposition: 'semantic_table',
  targetId: semanticTable.blockId,
  region: semanticTable.source.region,
}])

const imported = importCanonicalCandidate({
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
  documents: fixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    bytes: document.bytes,
  })),
  media: [],
})
assert.deepEqual(imported.issues, [])
assert.equal(imported.candidate?.interpretation.groups.length, 9)
assert.equal(imported.candidate?.interpretation.assertions.length, 45)

const failureCases = [
  ['imageOnly', 'NCK1_PDF_TEXT_LAYER_MISSING'],
  ['incomplete', 'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE'],
  ['multiColumn', 'NCK1_PDF_MULTI_COLUMN_UNSUPPORTED'],
  ['overlap', 'NCK1_PDF_READING_ORDER_AMBIGUOUS'],
  ['alignedNonTable', 'NCK1_PDF_READING_ORDER_AMBIGUOUS'],
  ['embeddedImage', 'NCK1_PDF_VISUAL_REVIEW_REQUIRED'],
]
for (const [name, expectedCode] of failureCases) {
  const negative = fixture.negative[name]
  const documentId = `negative-${name.replaceAll(/[A-Z]/gu, (letter) =>
    `-${letter.toLowerCase()}`)}`
  assert.throws(
    () => extractNck1PdfTextStructure(negative.bytes, {
      documentId,
      expectedPageCount: negative.pageCount,
    }),
    (error) => {
      assert(error instanceof Nck1PdfTextStructureError)
      assert.equal(error.code, expectedCode)
      assert(Number.isInteger(error.evidence?.page))
      assert(validRegion(error.evidence?.region))
      return true
    },
  )
  const negativeDocument = {
    ...fixture.sourceDocuments[0],
    documentId,
    bytes: negative.bytes,
    sha256: sha256(negative.bytes),
    byteLength: negative.bytes.byteLength,
    pageCount: negative.pageCount,
  }
  const rejected = produceNck1PdfMaterialization({
    paperId: fixture.paperId,
    documents: [negativeDocument, fixture.sourceDocuments[1]],
  })
  assert.equal(rejected.disposition, 'needs_agent_review')
  assert(rejected.review.required.some((issue) => issue.code === expectedCode))
  const rejectedImport = importCanonicalCandidate({
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(rejected.materialization)),
    documents: [negativeDocument, fixture.sourceDocuments[1]].map((document) => ({
      documentId: document.documentId,
      bytes: document.bytes,
    })),
    media: [],
  })
  assert.equal(
    rejectedImport.candidate?.interpretation,
    null,
    `${expectedCode} must not derive a usable Candidate interpretation`,
  )
  assert(rejectedImport.issues.length > 0)
}

const ambiguousSet = produceNck1PdfMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments.slice(0, 1),
})
assert.equal(ambiguousSet.disposition, 'needs_agent_review')
assert(ambiguousSet.review.required.some((issue) =>
  issue.code === 'NCK1_PDF_SOURCE_SET_AMBIGUOUS'))

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-pdf-cli-'))
const cliPaperId = `paper-synthetic-pdf-text-${process.pid}`
const cliPaperDir = path.join(
  root,
  'scripts/import-pipeline/papers',
  cliPaperId,
)
try {
  const questionPath = path.join(tempRoot, 'question.pdf')
  const answerPath = path.join(tempRoot, 'answers.pdf')
  writeFileSync(questionPath, fixture.questionBytes)
  writeFileSync(answerPath, fixture.answerBytes)
  const run = (...args) => execFileSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.match(run(
    'init',
    cliPaperId,
    '--paper-name', 'Synthetic NCK1 PDF',
    '--provenance', 'anonymous synthetic fixture',
    '--source', `question_source=${questionPath}`,
    '--source', `official_answers=${answerPath}`,
  ), /INITIALIZED/u)
  const materializeOutput = run('materialize', cliPaperId)
  assert.match(materializeOutput, /"disposition": "ready_for_verification"/u)
  assert.match(run('verify', cliPaperId), /"groups": 9/u)
  assert.match(run('verify', cliPaperId), /"assertions": 45/u)
  assert.match(run('build', cliPaperId), /BUILT CANDIDATE/u)
  const publicMaterialization = JSON.parse(readFileSync(path.join(
    cliPaperDir,
    fixture.manifest.materializationPath,
  ), 'utf8'))
  assert.equal(publicMaterialization.groups.length, 9)
  assert.equal(publicMaterialization.answers.length, 45)
  assert(existsSync(path.join(
    cliPaperDir,
    'materialization/nck1-pdf-materialization-review-v1.json',
  )))
  assert(existsSync(path.join(
    cliPaperDir,
    'materialization/nck1-pdf-materialization-producer-receipt-v1.json',
  )))
  assert(existsSync(path.join(cliPaperDir, 'canonical-evidence/candidate-summary.json')))
} finally {
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-nck1-pdf-materialization-producer: PASS')
