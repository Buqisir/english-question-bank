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

import { prepareSpellingReview, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
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
  assert.equal(imported.candidate?.interpretation.assertions.length,
    produced.materialization.listening.state === 'captured' ? 65 : 45)
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

const multilineDocx = makeSyntheticNck1DocxFixture({ answerShape: 'key_only', multilineAnswers: true })
const multilineDocxResult = produceNck1DocxMaterialization({
  paperId: multilineDocx.paperId,
  documents: multilineDocx.sourceDocuments,
})
assertReady(multilineDocxResult, multilineDocx.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK')
assert.deepEqual(answerValues(multilineDocxResult), answerValues(keyOnlyDocxResult))

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

for (const listeningHeading of ['答案及听力材料', '听力原文（录音稿）', '附：听力原文']) {
  const fixture = makeSyntheticNck1DocxFixture({ listening: true, listeningHeading })
  const result = produceNck1DocxMaterialization({
    paperId: fixture.paperId, documents: fixture.sourceDocuments,
  })
  assertReady(result, fixture.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK', expectedWritingSamples)
  assert.equal(result.materialization.listening.state, 'captured')
  assert.equal(result.materialization.listening.transcript.length, 10)
}

const proseListeningHeading = makeSyntheticNck1DocxFixture({
  listening: true, listeningHeading: '下面是听力原文的解释。',
})
assertRejected(produceNck1DocxMaterialization({
  paperId: proseListeningHeading.paperId, documents: proseListeningHeading.sourceDocuments,
}), proseListeningHeading.sourceDocuments, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS')

// Different school/year titles must share a parser, not a paper registry.
for (const title of ['示例市2028年英语试题答案', '某校秋季英语试卷参考答案：']) {
  const fixture = makeSyntheticNck1DocxFixture({
    combined: true,
    listening: true,
    listeningHeading: '英语听力录音稿',
    transformXml: (xml) => xml
      .replace('参考答案及解析', title)
      .replaceAll('  B.', ' B.').replaceAll('  C.', ' C.').replaceAll('  D.', ' D.')
      .replace('第一节：应用文（满分15分）', '第一节 One possible version:')
      .replace('第二节：读后续写（满分25分）', '第二节 One possible version:'),
  })
  const result = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
  assertReady(result, fixture.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK', expectedWritingSamples)
  assert.equal(result.materialization.listening.transcript.length, 10)
  assert.deepEqual(answerValues(result), answerValues(detailedDocxResult))
}

const underlinedFixture = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml.replace(/(\d{2})\._____/gu,
    '</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">  $1  </w:t></w:r><w:r><w:t xml:space="preserve">'),
})
const underlinedResult = produceNck1DocxMaterialization({
  paperId: underlinedFixture.paperId, documents: underlinedFixture.sourceDocuments,
})
assertReady(underlinedResult, underlinedFixture.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK', expectedWritingSamples)
const driftedUnderline = structuredClone(underlinedResult)
const blankBlock = driftedUnderline.materialization.groups.find((group) => group.slotId === 'seven-choices').blocks[0]
blankBlock.content.find((item) => item.kind === 'text').text += ' invented text'
assert(importCanonicalCandidate(sourceInput(driftedUnderline, underlinedFixture.sourceDocuments)).issues
  .some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'))
const plainNumbers = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml.replace(/(\d{2})\._____/gu, '  $1  '),
})
assertRejected(produceNck1DocxMaterialization({
  paperId: plainNumbers.paperId, documents: plainNumbers.sourceDocuments,
}), plainNumbers.sourceDocuments, 'NCK1_DOCX_BLANK_SEQUENCE_INCOMPLETE')

const bareUnderlinedNumbers = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml.replace(/(\d{2})\._____/gu,
    '</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>$1</w:t></w:r><w:r><w:t xml:space="preserve">'),
})
const bareUnderlinedResult = produceNck1DocxMaterialization({
  paperId: bareUnderlinedNumbers.paperId, documents: bareUnderlinedNumbers.sourceDocuments,
})
assertRejected(bareUnderlinedResult, bareUnderlinedNumbers.sourceDocuments,
  'NCK1_DOCX_BLANK_SEQUENCE_INCOMPLETE')
const inventedBlanks = structuredClone(underlinedResult)
inventedBlanks.materialization.documents = bareUnderlinedResult.materialization.documents
assert(importCanonicalCandidate(sourceInput(inventedBlanks, bareUnderlinedNumbers.sourceDocuments)).issues
  .some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'))

const letterFixture = makeSyntheticNck1DocxFixture({
  // Keep the current shared notice parser while recognizing letter givens.
  chineseNoticeNumbering: true,
  transformXml: (xml) => xml.replace(
    '<w:p><w:r><w:t xml:space="preserve">Should We Join the Reading Club?</w:t></w:r></w:p>',
    ['\tDear Alex,', '\tWelcome to our club.', '\tYours sincerely,', '\tSam']
      .map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join(''),
  ),
})
const letterResult = produceNck1DocxMaterialization({ paperId: letterFixture.paperId, documents: letterFixture.sourceDocuments })
assert.equal(letterResult.disposition, 'ready_for_verification')
assert.deepEqual(letterResult.materialization.groups.find((group) => group.slotId === 'writing.application')
  .writingTask.givenSkeleton.map((item) => item.role), ['salutation', 'opening', 'closing', 'signature'])
assert.deepEqual(importCanonicalCandidate(sourceInput(letterResult, letterFixture.sourceDocuments)).issues, [])

const boxFixture = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml.replace(
    /(<w:p><w:r><w:t xml:space="preserve">Mia carried the notebook to the school office\.<\/w:t><\/w:r><\/w:p>)(<w:p><w:r><w:t xml:space="preserve">The next morning, a student came to thank her\.<\/w:t><\/w:r><\/w:p>)/u,
    '<w:tbl><w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc>$1$2</w:tc></w:tr></w:tbl>',
  ),
})
const boxResult = produceNck1DocxMaterialization({ paperId: boxFixture.paperId, documents: boxFixture.sourceDocuments })
assertReady(boxResult, boxFixture.sourceDocuments, 'DETAIL_TOKEN_MUST_NOT_LEAK', expectedWritingSamples)
assert.deepEqual(boxResult.materialization.groups.at(-1).writingTask.starters,
  detailedDocxResult.materialization.groups.at(-1).writingTask.starters)
assert.equal(boxResult.materialization.groups.at(-1).blocks.some((block) => block.kind === 'table'), false)

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
    '--year', '2025', '--month', '12',
    '--source', `question_and_answers=${combinedPath}`,
  ), /INITIALIZED/u)
  assert.match(run('materialize', cliPaperId), /"disposition": "ready_for_verification"/u)
  assert.throws(() => run('verify', cliPaperId), /required review is missing/u)
  // Complete the new preprocessing stage for known synthetic test content.
  const spellingReview = prepareSpellingReview(new Uint8Array(readFileSync(path.join(cliPaperDir, 'materialization/nck1-source-materialization-v1.json'))), TEXT_REVIEW_POLICY)
  spellingReview.reviewedBy = 'import_agent'
  spellingReview.reviewedAt = '2026-09-21T00:00:00Z'
  spellingReview.targets.forEach(target => { target.decision = 'unchanged' })
  writeFileSync(path.join(cliPaperDir, SPELLING_REVIEW_FILE), JSON.stringify(spellingReview))
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
