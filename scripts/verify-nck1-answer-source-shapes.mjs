#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import {
  produceNck1DocxMaterialization,
} from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import {
  produceNck1PdfMaterialization,
} from '../server/paper-import/nck1PdfMaterializationProducer.mjs'
import {
  makeSyntheticNck1DocxFixture,
} from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import {
  makeSyntheticNck1PdfFixture,
} from '../test-fixtures/paper-import/nck1-pdf-materialization-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')

function sourceInput(produced, documents) {
  return {
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
    documents: documents.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media: [],
  }
}

function answerValues(produced) {
  return produced.materialization.answers.map(({ canonicalNumber, value }) => ({
    canonicalNumber,
    value,
  }))
}

const expectedWritingSamples = {
  application: 'Should We Join the Reading Club?\nJoin us on Friday to read and share ideas.',
  continuation: 'Mia carried the notebook to the school office. The teacher found its owner.\nThe next morning, a student came to thank her. They became friends.',
}

function assertReady(produced, documents, forbiddenText, writingSamples = null) {
  assert.equal(produced.disposition, 'ready_for_verification')
  assert.deepEqual(produced.review.required, [])
  assert.equal(produced.materialization.answers.length, 45)
  const writingGroups = produced.materialization.groups
    .filter((group) => group.writingTask)
  assert.deepEqual(
    writingGroups.map((group) => group.writingTask.officialModelAnswer),
    writingSamples
      ? [writingSamples.application, writingSamples.continuation]
      : [null, null],
  )
  const materializationText = JSON.stringify(produced.materialization)
  assert.equal(materializationText.includes(forbiddenText), false)

  const imported = importCanonicalCandidate(sourceInput(produced, documents))
  assert.deepEqual(imported.issues, [])
  assert.equal(imported.candidate?.interpretation.assertions.length, 45)
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues, null, 2))
  assert.equal(JSON.stringify(preview.compilation).includes(forbiddenText), false)
  return preview
}

function assertRejected(produced, documents, code) {
  assert.equal(produced.disposition, 'needs_agent_review')
  assert(produced.review.required.some((issue) => issue.code === code))
  const imported = importCanonicalCandidate(sourceInput(produced, documents))
  assert.equal(imported.candidate?.interpretation, null)
  assert(imported.issues.length > 0)
}

const detailedDocx = makeSyntheticNck1DocxFixture()
const keyOnlyDocx = makeSyntheticNck1DocxFixture({ answerShape: 'key_only' })
const detailedDocxResult = produceNck1DocxMaterialization({
  paperId: detailedDocx.paperId,
  documents: detailedDocx.sourceDocuments,
})
const keyOnlyDocxResult = produceNck1DocxMaterialization({
  paperId: keyOnlyDocx.paperId,
  documents: keyOnlyDocx.sourceDocuments,
})
assertReady(
  detailedDocxResult,
  detailedDocx.sourceDocuments,
  'DETAIL_TOKEN_MUST_NOT_LEAK',
  expectedWritingSamples,
)
assertReady(keyOnlyDocxResult, keyOnlyDocx.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK')
assert.deepEqual(answerValues(detailedDocxResult), answerValues(keyOnlyDocxResult))

const combinedDocx = makeSyntheticNck1DocxFixture({ combined: true })
const combinedDocxResult = produceNck1DocxMaterialization({
  paperId: combinedDocx.paperId,
  documents: combinedDocx.sourceDocuments,
})
assertReady(
  combinedDocxResult,
  combinedDocx.sourceDocuments,
  'DETAIL_TOKEN_MUST_NOT_LEAK',
  expectedWritingSamples,
)
assert.deepEqual(answerValues(combinedDocxResult), answerValues(detailedDocxResult))
assert(combinedDocxResult.materialization.documents.some((document) =>
  document.role === 'question_and_answers'))
assert.equal(
  JSON.stringify(combinedDocxResult.materialization.groups).includes('Synthetic official answers'),
  false,
)

for (const combinedBoundary of ['missing', 'duplicate']) {
  const fixture = makeSyntheticNck1DocxFixture({ combined: true, combinedBoundary })
  const produced = produceNck1DocxMaterialization({
    paperId: fixture.paperId,
    documents: fixture.sourceDocuments,
  })
  assertRejected(
    produced,
    fixture.sourceDocuments,
    'NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS',
  )
}

const ambiguousDocx = makeSyntheticNck1DocxFixture({
  answerShape: 'key_only',
  ambiguousTextAnswer: true,
})
assertRejected(
  produceNck1DocxMaterialization({
    paperId: ambiguousDocx.paperId,
    documents: ambiguousDocx.sourceDocuments,
  }),
  ambiguousDocx.sourceDocuments,
  'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS',
)

const listeningMaterialsDocx = makeSyntheticNck1DocxFixture({
  listening: true,
  listeningHeading: '答案及听力材料',
})
const listeningMaterialsResult = produceNck1DocxMaterialization({
  paperId: listeningMaterialsDocx.paperId,
  documents: listeningMaterialsDocx.sourceDocuments,
})
assert.equal(listeningMaterialsResult.disposition, 'ready_for_verification')
assert.equal(listeningMaterialsResult.materialization.listening.state, 'captured')
assert.equal(listeningMaterialsResult.materialization.listening.transcript.length, 10)

const pdfFixture = await makeSyntheticNck1PdfFixture({
  includeAnswerShapes: true,
  includeTable: false,
})
const detailedPdfResult = produceNck1PdfMaterialization({
  paperId: pdfFixture.paperId,
  documents: pdfFixture.sourceDocuments,
})
const keyOnlyPdfResult = produceNck1PdfMaterialization({
  paperId: pdfFixture.paperId,
  documents: pdfFixture.answerShapes.keyOnlyDocuments,
})
assertReady(
  detailedPdfResult,
  pdfFixture.sourceDocuments,
  'deliberately untrusted explanation',
  expectedWritingSamples,
)
assertReady(
  keyOnlyPdfResult,
  pdfFixture.answerShapes.keyOnlyDocuments,
  'deliberately untrusted explanation',
)
assert.deepEqual(answerValues(detailedPdfResult), answerValues(keyOnlyPdfResult))

const combinedPdfResult = produceNck1PdfMaterialization({
  paperId: pdfFixture.paperId,
  documents: pdfFixture.answerShapes.combinedDocuments,
})
assertReady(
  combinedPdfResult,
  pdfFixture.answerShapes.combinedDocuments,
  'deliberately untrusted explanation',
  expectedWritingSamples,
)
assert.deepEqual(answerValues(combinedPdfResult), answerValues(detailedPdfResult))
assert.equal(
  JSON.stringify(combinedPdfResult.materialization.groups).includes('Synthetic official answers'),
  false,
)

for (const documents of [
  pdfFixture.answerShapes.combinedMissingBoundaryDocuments,
  pdfFixture.answerShapes.combinedDuplicateBoundaryDocuments,
]) {
  assertRejected(
    produceNck1PdfMaterialization({ paperId: pdfFixture.paperId, documents }),
    documents,
    'NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS',
  )
}
assertRejected(
  produceNck1PdfMaterialization({
    paperId: pdfFixture.paperId,
    documents: pdfFixture.answerShapes.ambiguousDocuments,
  }),
  pdfFixture.answerShapes.ambiguousDocuments,
  'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS',
)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-combined-answer-'))
const cliPaperId = `paper-synthetic-combined-answer-${process.pid}`
const cliPaperDir = path.join(root, 'scripts/import-pipeline/papers', cliPaperId)
try {
  const combinedPath = path.join(tempRoot, 'question-and-answers.pdf')
  writeFileSync(combinedPath, pdfFixture.answerShapes.combinedDocuments[0].bytes)
  const run = (...args) => execFileSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.match(run(
    'init', cliPaperId,
    '--paper-name', 'Synthetic combined question and answers',
    '--provenance', 'anonymous synthetic fixture',
    '--source', `question_and_answers=${combinedPath}`,
  ), /INITIALIZED/u)
  assert.match(run('materialize', cliPaperId), /"disposition": "ready_for_verification"/u)
  assert.match(run('verify', cliPaperId), /"assertions": 45/u)
  assert.match(run('build', cliPaperId), /BUILT CANDIDATE/u)
  const materialization = JSON.parse(readFileSync(path.join(
    cliPaperDir,
    'materialization/nck1-source-materialization-v1.json',
  ), 'utf8'))
  assert.equal(materialization.documents[0].role, 'question_and_answers')
  assert.equal(materialization.answers.length, 45)
  assert.equal(
    JSON.stringify(materialization).includes('deliberately untrusted explanation'),
    false,
  )
} finally {
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-nck1-answer-source-shapes: PASS')
