#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import {
  extractDocxDocumentText,
  extractDocxDocumentParagraphs,
  extractDocxDocumentStructure,
  extractDocxParagraphEmphasis,
} from '../server/paper-canonical/docxSourceAdapter.mjs'
import {
  nck1DocxProducerSourceDigest,
  produceNck1DocxMaterialization,
} from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import {
  inspectNck1Materialization,
  paperWriterLockPath,
  runNck1DocxMaterializationJob,
  withPaperWriterLock,
} from './import-pipeline/nck1-docx-materialize.mjs'
import {
  makeSyntheticNck1DocxFixture,
} from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'

const fixture = makeSyntheticNck1DocxFixture()
const produced = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments,
})

assert.equal(produced.disposition, 'ready_for_verification')
assert.deepEqual(produced.review.required, [])
for (const group of produced.materialization.groups.filter(group => group.family === 'reading')) {
  assert.equal(group.blocks[0].role, 'body', 'a passage slot marker does not make its first prose paragraph a title')
  assert.match(group.blocks[0].content[0].text, /passage keeps one small promise\./u)
}
for (const block of produced.materialization.groups.find(group => group.family === 'seven-choices').blocks) {
  assert.equal(block.content[0].text, 'A short guide has ', 'trim paragraph exterior, not the space facing the blank')
  assert.equal(block.content.at(-1).text, ' for learners.', 'retain the source separator after the blank')
}
const datedFixture = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml
    .replace('40._____ for learners.', 'arrived in September 2024. ___40___ for learners.')
    .replaceAll('注意：', '注意 :'),
})
const datedProduced = produceNck1DocxMaterialization({
  paperId: datedFixture.paperId, documents: datedFixture.sourceDocuments,
})
assert.equal(datedProduced.disposition, 'ready_for_verification')
const datedSeven = datedProduced.materialization.groups.find(group => group.family === 'seven-choices')
assert.equal(datedSeven.questions[4].sourceNumber, 40, 'a preceding year must not become the blank number')
assert.equal(datedSeven.blocks[4].content[0].text, 'A short guide has arrived in September 2024. ',
  'blank extraction must preserve all four digits of a preceding year')
const chineseNoticeFixture = makeSyntheticNck1DocxFixture({ chineseNoticeNumbering: true })
const chineseNoticeProduced = produceNck1DocxMaterialization({
  paperId: chineseNoticeFixture.paperId, documents: chineseNoticeFixture.sourceDocuments,
})
assert.equal(chineseNoticeProduced.disposition, 'ready_for_verification')
const chineseNoticeTask = chineseNoticeProduced.materialization.groups.find(group => group.slotId === 'writing.application').writingTask
assert.equal(chineseNoticeTask.wordCountTarget, 80)
assert.deepEqual(chineseNoticeTask.givenSkeleton, [{ text: 'Should We Join the Reading Club?', role: 'title' }])
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
assert.deepEqual(
  produced.materialization.answers.slice(0, 4).map((answer) => answer.value),
  ['A', 'B', 'C', 'D'],
  'glued adjacent answer ranges must retain source-backed answer order',
)
assert.equal(produced.materialization.answers[35].value, 'walked')
assert.equal(produced.materialization.answers[37].value, 'on')
assert.equal(produced.materialization.answers.at(-1).value, 'note')
assert.equal(produced.materialization.listening.state, 'not_supplied')
assert.equal(
  produced.materialization.groups[0].blocks.some((block) =>
    block.kind === 'table' && block.columnCount === 2 && block.rows.length === 2),
  true,
  'a DOCX semantic table must remain a semantic grid',
)
const paragraphLocators = produced.materialization.groups.flatMap((group) =>
  group.blocks.filter((block) => block.kind === 'paragraph').map((block) =>
    block.source.selector))
assert(paragraphLocators.length > 20)
assert(paragraphLocators.every((selector) =>
  /^\(\/w:document\/w:body\/\/w:p\)\[\d+\]$/u.test(selector)))
assert.equal(new Set(paragraphLocators).size, paragraphLocators.length)
assert.deepEqual(
  produced.review.agentTasks.map((task) => task.kind),
  ['reading_source_roles', 'reading_source_roles', 'reading_source_roles', 'reading_source_roles', 'writing_analysis', 'writing_analysis'],
  'source role review must precede summaries; paragraph order cannot establish titles',
)
assert.deepEqual(produced.review.agentTasks.slice(0, 4).map(task => task.slotId),
  ['reading.a', 'reading.b', 'reading.c', 'reading.d'])
assert(produced.review.agentTasks.every((task) => task.parallelizableRead === true))
assert.equal(produced.review.singleWriter.paperId, fixture.paperId)

const input = {
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(
    produced.materialization,
  )),
  documents: fixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    bytes: document.bytes,
  })),
  media: [],
}
const imported = importCanonicalCandidate(input)
assert.deepEqual(imported.issues, [])
assert.equal(imported.candidate?.interpretation.groups.length, 9)
assert.equal(imported.candidate?.interpretation.assertions.length, 45)

const mediaFixture = makeSyntheticNck1DocxFixture({ mediaLayout: true })
const mediaProduced = produceNck1DocxMaterialization({
  paperId: mediaFixture.paperId,
  documents: mediaFixture.sourceDocuments,
})
assert.equal(mediaProduced.disposition, 'ready_for_verification')
assert.equal(
  mediaProduced.materialization.schemaVersion,
  'nck1-source-materialization-v2',
)
assert.deepEqual(
  mediaProduced.materialization.media.map((media) => media.presentation),
  [
    {
      alignment: 'left',
      widthRatio: 0.4,
      spacingBefore: 'compact',
      spacingAfter: 'none',
    },
    {
      alignment: 'center',
      widthRatio: 0.6,
      spacingBefore: 'none',
      spacingAfter: 'normal',
    },
    {
      alignment: 'left',
      widthRatio: 0.1,
      spacingBefore: 'none',
      spacingAfter: 'none',
    },
  ],
  'DOCX relationship, extent, alignment, and spacing become one shared layout intent',
)
assert.deepEqual(
  mediaProduced.materialization.groups[0].blocks.map((block) => block.kind),
  ['paragraph', 'figure', 'figure', 'table'],
)
assert.equal(mediaProduced.mediaFiles.length, 3)
const importedMedia = importCanonicalCandidate({
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(
    mediaProduced.materialization,
  )),
  documents: mediaFixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    bytes: document.bytes,
  })),
  media: mediaProduced.mediaFiles,
})
assert.deepEqual(importedMedia.issues, [])
assert.equal(importedMedia.candidate?.interpretation.groups[0].media.length, 3)

// Drawing coordinates and field instructions are not visible Word text.
// Keep identical numbers in w:t, XML entities, run separators and media intact.
const drawingCoordinates = '<wp:positionH><wp:posOffset>-6350</wp:posOffset></wp:positionH><wp:positionV><wp:posOffset>1905</wp:posOffset></wp:positionV>'
const fieldInstruction = '<w:instrText xml:space="preserve"> HYPERLINK "https://example.test/" </w:instrText>'
const contaminatedFixture = makeSyntheticNck1DocxFixture({
  mediaLayout: true,
  transformXml: (xml) => xml
    .replaceAll('<wp:inline>', `<wp:inline>${drawingCoordinates}`)
    .replace('<w:t>Monday</w:t>', `${fieldInstruction}<w:t>Monday</w:t>`)
    .replace('A passage keeps one small promise.', 'A passage keeps one </w:t></w:r><w:r><w:rPr><w:b/><w:u/></w:rPr>' + fieldInstruction + '<w:t>small</w:t></w:r><w:r><w:t> promise.'),
})
const contaminatedProduced = produceNck1DocxMaterialization({
  paperId: contaminatedFixture.paperId, documents: contaminatedFixture.sourceDocuments,
})
assert.deepEqual(contaminatedProduced.materialization.groups, mediaProduced.materialization.groups,
  'non-visible XML must not change paragraph/table materialization or media references')
assert.deepEqual(contaminatedProduced.mediaFiles, mediaProduced.mediaFiles)
const cleanBytes = mediaFixture.sourceDocuments[0].bytes
const contaminatedBytes = contaminatedFixture.sourceDocuments[0].bytes
assert.match(extractDocxDocumentText(contaminatedBytes), /-63501905/u,
  'historical whole-document envelope extraction keeps its frozen bytes')
assert.deepEqual(extractDocxDocumentParagraphs(contaminatedBytes), extractDocxDocumentParagraphs(cleanBytes))
assert.deepEqual(extractDocxDocumentStructure(contaminatedBytes), extractDocxDocumentStructure(cleanBytes))
const markedParagraph = extractDocxParagraphEmphasis(contaminatedBytes)
  .find((paragraph) => paragraph.text === 'A passage keeps one small promise.')
assert.equal(markedParagraph.exact, true)
assert.deepEqual(markedParagraph.ranges, [{ start: 20, end: 25, marks: ['bold', 'underline'] }])
const separatorFixture = makeSyntheticNck1DocxFixture({ transformXml: (xml) => xml.replace(
  '<w:body>', '<w:body><w:p><w:r><w:t xml:space="preserve"> -6350 &amp; 1905 </w:t><w:tab/><w:t>&lt;visible&gt;</w:t><w:br/><w:t>next</w:t><w:cr/><w:t>&#x1F600;&#33;</w:t></w:r></w:p>',
) })
assert.equal(extractDocxDocumentParagraphs(separatorFixture.sourceDocuments[0].bytes)[0].text,
  ' -6350 & 1905 \t<visible>\nnext\n😀!')

const anchoredMedia = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    mediaLayout: true,
    anchoredMedia: true,
  }).sourceDocuments,
})
assert.equal(anchoredMedia.disposition, 'needs_agent_review')
assert(anchoredMedia.review.required.some((item) =>
  item.code === 'NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED'))

const orphanMedia = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    mediaLayout: true,
    orphanMedia: true,
  }).sourceDocuments,
})
assert.equal(orphanMedia.disposition, 'needs_agent_review')
assert(orphanMedia.review.required.some((item) =>
  item.code === 'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS'))

const uncertain = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    duplicateReadingHeading: true,
  }).sourceDocuments,
})
assert.equal(uncertain.disposition, 'needs_agent_review')
assert(uncertain.review.required.some((item) =>
  item.code === 'NCK1_DOCX_SECTION_AMBIGUOUS'))
assert(uncertain.materialization.issues.length > 0)

const duplicateQuestion = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    duplicateReadingQuestion: true,
  }).sourceDocuments,
})
assert.equal(duplicateQuestion.disposition, 'needs_agent_review')
assert(duplicateQuestion.review.required.some((item) =>
  item.code === 'NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE'))

const missingAnswer = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ missingAnswer: true }).sourceDocuments,
})
assert.equal(missingAnswer.disposition, 'needs_agent_review')
assert(missingAnswer.review.required.some((item) =>
  item.code === 'NCK1_DOCX_ANSWER_MISSING'))

const missingSource = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments.filter((document) =>
    document.role !== 'official_answers'),
})
assert.equal(missingSource.disposition, 'needs_agent_review')
assert(missingSource.review.required.some((item) =>
  item.code === 'NCK1_DOCX_SOURCE_SET_AMBIGUOUS'))

const suppliedListeningTiming = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    listening: true,
    listeningTiming: true,
  }).sourceDocuments,
})
assert.equal(suppliedListeningTiming.disposition, 'needs_agent_review')
assert.equal(suppliedListeningTiming.materialization.listening.questions.length, 20)
assert(suppliedListeningTiming.review.required.some((item) =>
  item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'))

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-docx-producer-'))
try {
  for (const document of fixture.sourceDocuments) {
    const manifestDocument = fixture.manifest.documents.find((candidate) =>
      candidate.documentId === document.documentId)
    const outputPath = path.join(tempRoot, manifestDocument.path)
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, document.bytes)
  }
  const writerLock = paperWriterLockPath(tempRoot)
  const readyPath = path.join(tempRoot, 'concurrent-writer-ready')
  const lockModuleUrl = new URL('./import-pipeline/nck1-docx-materialize.mjs', import.meta.url).href
  const concurrentWriter = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { writeFileSync } from 'node:fs'
    import { withPaperWriterLock } from ${JSON.stringify(lockModuleUrl)}
    withPaperWriterLock(
      { paperDir: ${JSON.stringify(tempRoot)}, paperId: ${JSON.stringify(fixture.paperId)} },
      () => {
        writeFileSync(${JSON.stringify(readyPath)}, 'ready')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750)
      },
    )
  `], { stdio: ['ignore', 'pipe', 'pipe'] })
  const concurrentWriterExit = once(concurrentWriter, 'exit')
  for (let attempt = 0; attempt < 300 && !existsSync(readyPath); attempt += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  assert.equal(existsSync(readyPath), true, 'a real concurrent writer must acquire the paper lock')
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /already has a writer/u,
    'the same paperId cannot have concurrent materialization writers',
  )
  const [concurrentWriterCode] = await concurrentWriterExit
  assert.equal(concurrentWriterCode, 0)
  assert.equal(existsSync(writerLock), false, 'a successful writer releases the paper lock')

  assert.throws(
    () => withPaperWriterLock(
      { paperDir: tempRoot, paperId: fixture.paperId },
      () => { throw new Error('synthetic writer failure') },
    ),
    /synthetic writer failure/u,
  )
  assert.equal(existsSync(writerLock), false, 'a failed writer releases the paper lock')
  const first = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(first.cached, false)
  assert.equal(first.disposition, 'ready_for_verification')
  const outputPath = path.join(tempRoot, fixture.manifest.materializationPath)
  const firstBytes = readFileSync(outputPath)
  const second = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(second.cached, true)
  assert.equal(second.outputState, 'producer_output_unchanged')
  assert.deepEqual(readFileSync(outputPath), firstBytes)

  writeFileSync(outputPath, Buffer.concat([firstBytes, Buffer.from('\n')]))
  const resumed = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(resumed.cached, true)
  assert.equal(resumed.outputState, 'agent_modified')
  assert.equal(readFileSync(outputPath).byteLength, firstBytes.byteLength + 1)

  const receiptBytes = readFileSync(first.receiptPath)
  const reviewBytes = readFileSync(first.reviewPath)
  const historicalVersion = 'nck1-docx-materialization-producer-v9'
  const historicalDigest = nck1DocxProducerSourceDigest(fixture.sourceDocuments, { producerVersion: historicalVersion })
  const historicalReceipt = { ...JSON.parse(receiptBytes), producerVersion: historicalVersion, sourceDigest: historicalDigest }
  const historicalReview = { ...JSON.parse(reviewBytes), producerVersion: historicalVersion, sourceDigest: historicalDigest }
  writeFileSync(first.receiptPath, JSON.stringify(historicalReceipt))
  writeFileSync(first.reviewPath, JSON.stringify(historicalReview))
  const historical = inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest })
  assert.equal(historical.producerState, 'historical')
  assert.equal(historical.outputState, 'agent_modified')
  assert.throws(() => runNck1DocxMaterializationJob({ paperDir: tempRoot, manifest: fixture.manifest }), /refusing to overwrite/u)
  assert.equal(readFileSync(outputPath).byteLength, firstBytes.byteLength + 1)
  const changedReview = { ...historicalReview, required: [{ code: 'original-producer-issue' }] }
  writeFileSync(first.reviewPath, JSON.stringify(changedReview))
  const retainedPaths = [outputPath, first.receiptPath, first.reviewPath]
  const retainedBytes = retainedPaths.map((file) => readFileSync(file))
  const corrected = inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest })
  assert.equal(corrected.producerState, 'historical')
  assert.equal(corrected.outputState, 'agent_modified')
  retainedPaths.forEach((file, index) => assert.deepEqual(readFileSync(file), retainedBytes[index]))
  writeFileSync(outputPath, firstBytes)
  assert.throws(() => inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest }), /does not bind the current issues/u)
  writeFileSync(outputPath, retainedBytes[0])
  writeFileSync(first.reviewPath, JSON.stringify(historicalReview))
  for (const patch of [{ producerVersion: 'unknown' }, { sourceDigest: 'sha256:stale' }]) {
    writeFileSync(first.receiptPath, JSON.stringify({ ...historicalReceipt, ...patch }))
    assert.throws(() => inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest }), /not bound/u)
  }
  writeFileSync(first.receiptPath, JSON.stringify(historicalReceipt))
  writeFileSync(first.reviewPath, reviewBytes)
  assert.throws(() => inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest }), /not bound/u)
  writeFileSync(first.receiptPath, receiptBytes)
  rmSync(first.receiptPath)
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /refusing to overwrite/u,
    'an unbound existing Materialization is never overwritten',
  )
  assert.equal(readFileSync(outputPath).byteLength, firstBytes.byteLength + 1)
  writeFileSync(first.receiptPath, receiptBytes)

  const questionPath = path.join(tempRoot, fixture.manifest.documents[0].path)
  writeFileSync(questionPath, Buffer.concat([
    readFileSync(questionPath),
    Buffer.from('source changed'),
  ]))
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /create a new Source Capture/u,
    'changed source bytes cannot reuse or overwrite a digest-bound output',
  )
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-nck1-docx-materialization-producer: PASS')
