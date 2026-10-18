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

import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { nck1MaterializationHistoricalAuthorityRef62 } from '../shared/paper-canonical/authority.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { buildNck1ReviewConsumption } from '../server/import-review/revisionProjection.mjs'
import historicalScreen from '../standards/paper-canonical/consumers/screen-v46.json' with { type: 'json' }
import {
  extractDocxDocumentText,
  extractDocxDocumentParagraphs,
  extractDocxDocumentStructure,
  extractDocxParagraphEmphasis,
} from '../server/paper-canonical/docxSourceAdapter.mjs'
import {
  NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
  nck1DocxProducerSourceDigest,
  produceNck1DocxMaterialization,
  produceNck1MaterializationFromStructures,
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
// Zhenhai's source has a title abbreviation in the stem and a dotted subject name.
// Neither Mrs. nor P. E. can steal the genuine A./B./C./D. option boundaries.
for (const options of ['A. Math.  B. Drama.  C. Physics.  D. English.']) {
  const titledFixture = makeSyntheticNck1DocxFixture({
    transformXml: xml => xml.replace('21. Which choice fits item 21?', '21. Which subject does Mrs. Green probably teach?')
      .replace('A. Alpha  B. Bravo  C. Charlie  D. Delta', options),
  })
  const titled = produceNck1DocxMaterialization({ paperId: titledFixture.paperId, documents: titledFixture.sourceDocuments })
  assert.equal(titled.disposition, 'ready_for_verification')
  const question = titled.materialization.groups.flatMap(group => group.questions).find(q => q.sourceNumber === 21)
  assert.deepEqual(question.options.map(option => option.label), ['A', 'B', 'C', 'D'])
  assert.equal(question.options[2].text, 'Physics.')
  assert.equal(question.stem, 'Which subject does Mrs. Green probably teach?')
}
const subjectFixture = makeSyntheticNck1DocxFixture({ listening: true, transformXml: xml => xml
  .replace('1. Which listening choice fits item 1?', '1. Which subject does Mrs. Green probably teach?')
  .replace('A. Alpha  B. Bravo  C. Charlie', 'A. Math.  B. Drama.  C. P. E.') })
const subjectProduced = produceNck1DocxMaterialization({ paperId: subjectFixture.paperId, documents: subjectFixture.sourceDocuments })
assert.equal(subjectProduced.disposition, 'ready_for_verification')
assert.equal(subjectProduced.materialization.listening.questions[0].stem, 'Which subject does Mrs. Green probably teach?')
assert.deepEqual(subjectProduced.materialization.listening.questions[0].options.map(option => option.text), ['Math.', 'Drama.', 'P. E.'])
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
for (const marker of ['_65__', '_65_', '__65__']) {
  const numberedFixture = makeSyntheticNck1DocxFixture({
    transformXml: xml => xml.replace('65._____(word)', `${marker}(word)`),
  })
  const numbered = produceNck1DocxMaterialization({
    paperId: numberedFixture.paperId, documents: numberedFixture.sourceDocuments,
  })
  assert.equal(numbered.disposition, 'ready_for_verification')
  const inlines = numbered.materialization.groups.find(group => group.family === 'grammar-fill')
    .blocks.flatMap(block => block.content)
  const index = inlines.findIndex(node => node.blankId?.endsWith(':65'))
  assert.equal(inlines[index - 1].text, '(learn) and ', 'numbered blank decoration is not prose')
  assert.equal(inlines[index + 1].text, '(word).', 'the prompt following the blank is preserved')
}
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

const writingMediaFixture = makeSyntheticNck1DocxFixture({
  mediaLayout: true,
  transformXml: xml => {
    const drawing = xml.match(/<w:p><w:pPr><w:jc[^]*?<\/w:p>/u)?.[0]
    return drawing ? xml.replace(drawing, '').replace(
      '<w:p><w:r><w:t xml:space="preserve">内容包括：',
      `${drawing}<w:p><w:r><w:t xml:space="preserve">内容包括：`,
    ) : xml
  },
})
const writingMedia = produceNck1DocxMaterialization({
  paperId: writingMediaFixture.paperId, documents: writingMediaFixture.sourceDocuments,
})
assert.equal(writingMedia.disposition, 'ready_for_verification')
const writingBlocks = writingMedia.materialization.groups.find(group => group.slotId === 'writing.application').blocks
assert.equal(writingBlocks[0].content[0].text, 'Write a short notice for the reading club.')
assert.equal(writingBlocks[1].kind, 'figure', 'A drawing-only writing paragraph retains its source position')
assert.equal(writingBlocks[2].content[0].text, '内容包括：')
assert.equal(writingMedia.mediaFiles.length, 3, 'All source media survive writing-group assembly')

const writingMediaInput = {
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(writingMedia.materialization)),
  documents: writingMediaFixture.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
  media: writingMedia.mediaFiles,
}
const writingCandidate = importCanonicalCandidate(writingMediaInput)
assert.deepEqual(writingCandidate.issues, [])
const writingPreview = compileNck1MaterializationCandidatePreview(writingCandidate.candidate)
assert(writingPreview.compilation)
const writingConsumption = buildNck1ReviewConsumption(writingCandidate.candidate, writingPreview.compilation)
const applicationId = writingMedia.materialization.groups.find(group => group.slotId === 'writing.application').groupId
const projectApplication = consumption => projectCanonicalConsumerGroup({
  consumption, familyContractId: 'application-writing', groupId: applicationId,
})
const application = projectApplication(writingConsumption)
assert.equal(application.promptBlocks[1].kind, 'figure')
assert.equal(application.promptBlocks[1].media.sha256, writingMedia.materialization.media[0].sha256)
const oldConsumerRef = { id: historicalScreen.consumerId, version: historicalScreen.version, digest: historicalScreen.contractDigest }
assert.throws(() => projectApplication({ ...writingConsumption, consumerContractRef: oldConsumerRef }),
  /prompt-figure consumer capability/u)
assert(importCanonicalCandidate(writingMediaInput, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef62,
}).issues.some(issue => issue.code === 'MATERIALIZATION_APPLICATION_PROMPT_UNRESOLVED'))
for (const alter of [
  consumption => { consumption.mediaArtifacts = [] },
  consumption => { consumption.mediaArtifacts.find(item => item.mediaId === application.promptBlocks[1].mediaId).encodedBytes = 'AAAA' },
  consumption => { consumption.mediaArtifacts.push(structuredClone(consumption.mediaArtifacts[0])) },
  consumption => {
    const occurrence = consumption.selections.find(item => item.familyContractId === 'application-writing').projectedOccurrences[0]
    occurrence.prompt.blocks.splice(2, 0, structuredClone(occurrence.prompt.blocks[1]))
  },
  consumption => {
    const occurrence = consumption.selections.find(item => item.familyContractId === 'application-writing').projectedOccurrences[0]
    occurrence.prompt.blocks.push(...occurrence.prompt.blocks.splice(1, 1))
  },
  consumption => {
    const occurrence = consumption.selections.find(item => item.familyContractId === 'application-writing').projectedOccurrences[0]
    occurrence.prompt.blocks.splice(0, 1)
  },
]) {
  const invalid = structuredClone(writingConsumption)
  alter(invalid)
  assert.throws(() => projectApplication(invalid), /Canonical/u)
}
// Moving the raw default must not change the paragraph-only semantic projection
// or make the previously-current v62 Candidate impossible to reconstruct.
const currentParagraphCandidate = importCanonicalCandidate(input)
const oldParagraphCandidate = importCanonicalCandidate(input, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef62,
})
assert.deepEqual(oldParagraphCandidate.issues, [])
const paragraphProjection = candidate => {
  const preview = compileNck1MaterializationCandidatePreview(candidate)
  assert(preview.compilation)
  return buildNck1ReviewConsumption(candidate, preview.compilation)
}
const oldParagraphConsumption = paragraphProjection(oldParagraphCandidate.candidate)
oldParagraphConsumption.consumerContractRef = oldConsumerRef
assert.deepEqual(projectApplication(paragraphProjection(currentParagraphCandidate.candidate)),
  projectApplication(oldParagraphConsumption))

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

const questionByNumber = (result, number) =>
  result.materialization.groups.flatMap((group) => group.questions || [])
    .find((question) => question.sourceNumber === number)
const abbreviationStem = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ abbreviationStem: true }).sourceDocuments,
})
assert.equal(abbreviationStem.disposition, 'ready_for_verification')
assert.equal(questionByNumber(abbreviationStem, 24).stem, 'What did the class visit in Washington D. C.?')
assert.deepEqual(questionByNumber(abbreviationStem, 24).options.map((option) => option.text), ['Alpha', 'Bravo', 'Charlie', 'Delta'])

const abbreviationOption = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ abbreviationOption: true }).sourceDocuments,
})
assert.equal(abbreviationOption.disposition, 'ready_for_verification')
assert.deepEqual(questionByNumber(abbreviationOption, 25).options.map((option) => option.text), ['Alpha', 'A trip to D. C.', 'Charlie', 'Delta'])

// "D. C." must not end the options early when the real D label sits in the next paragraph.
const abbreviationSplitOption = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ abbreviationSplitOption: true }).sourceDocuments,
})
assert.equal(abbreviationSplitOption.disposition, 'ready_for_verification')
assert.deepEqual(questionByNumber(abbreviationSplitOption, 27).options.map((option) => option.text), ['Alpha', 'Bravo', 'Washington D. C.', 'Delta'])

// A dotted capital that is not part of an abbreviation might be a real label, so it stays a review item.
const dottedNameStem = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ dottedNameStem: true }).sourceDocuments,
})
assert.equal(dottedNameStem.disposition, 'needs_agent_review')
assert(dottedNameStem.review.required.some((item) =>
  item.code === 'NCK1_DOCX_OPTIONS_AMBIGUOUS' && item.path === 'questions.26.options'))

const dialogueSeconds = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ listening: true, listeningSeconds: 'dialogue' }).sourceDocuments,
})
assert.equal(dialogueSeconds.disposition, 'ready_for_verification')
assert(!dialogueSeconds.review.required.some((item) =>
  item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'))

const bracketedSeconds = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ listening: true, listeningSeconds: 'metadata' }).sourceDocuments,
})
assert.equal(bracketedSeconds.disposition, 'needs_agent_review')
assert(bracketedSeconds.review.required.some((item) =>
  item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'))

const unlabelledDuration = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ listening: true, listeningSeconds: 'duration' }).sourceDocuments,
})
assert.equal(unlabelledDuration.disposition, 'needs_agent_review')
assert(unlabelledDuration.review.required.some((item) =>
  item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'))

// Metadata labels and repeated pause/replay instructions look like speaker labels but must not
// exempt the duration.
for (const listeningSeconds of ['note', 'compound', 'instructions', 'replay']) {
  const labelledDuration = produceNck1DocxMaterialization({
    paperId: fixture.paperId,
    documents: makeSyntheticNck1DocxFixture({ listening: true, listeningSeconds }).sourceDocuments,
  })
  assert.equal(labelledDuration.disposition, 'needs_agent_review', listeningSeconds)
  assert(labelledDuration.review.required.some((item) =>
    item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'), listeningSeconds)
}

const produceWith = (options) => produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture(options).sourceDocuments,
})
const answerValues = (result) => result.materialization.answers.map((answer) => answer.value)
const writingSample = (result, family) => result.materialization.groups
  .find((candidate) => candidate.family === family)?.writingTask.officialModelAnswer ?? null
const baselineAnswers = answerValues(produced)
const baselineApplication = writingSample(produced, 'application-writing')
const baselineContinuation = writingSample(produced, 'continuation-writing')
assert.equal(baselineApplication, 'Should We Join the Reading Club?\nJoin us on Friday to read and share ideas.')

// Answer keys printed without periods, as number/answer grids (lines or
// tables), or with list separators and an optional in-word letter.
for (const answerFormat of ['unpunctuated', 'gridLines', 'gridTable', 'separators']) {
  const result = produceWith({ answerFormat })
  const expected = answerFormat === 'separators'
    ? [...baselineAnswers.slice(0, -1), 'no(t) e'] : baselineAnswers
  assert.deepEqual(answerValues(result), expected, answerFormat)
  // DOCX answer tables keep their whole-document confirmation gate.
  assert.deepEqual(result.review.required.map((item) => item.code),
    answerFormat === 'gridTable' ? ['NCK1_DOCX_ANSWER_TABLE_REVIEW_REQUIRED'] : [], answerFormat)
}
const tableAnswers = produceWith({ answerFormat: 'gridTable' })
assert.equal(tableAnswers.materialization.answers[1].authority.selector, '(/w:document/w:body/w:tbl)[1]',
  'a table answer keeps its table as the authority')
assert.equal(tableAnswers.materialization.answers.at(-1).authority.selector, '(/w:document/w:body/w:tbl)[2]')

// OCR answer tables are Agent-confirmed page regions and carry no DOCX table
// gate: the shared structure parser reads them and cites the table region.
{
  const shaped = makeSyntheticNck1DocxFixture({ answerFormat: 'gridTable' })
  const [questionDocument, rendition, answerDocument] = shaped.sourceDocuments
  const region = { x: 0.1, y: 0.2, width: 0.8, height: 0.2 }
  const answerStructure = extractDocxDocumentStructure(answerDocument.bytes)
  answerStructure.body = answerStructure.body.map((item) => item.kind === 'table'
    ? { ...item, source: { kind: 'page_region', documentId: answerDocument.documentId, page: 1, region } }
    : item)
  const result = produceNck1MaterializationFromStructures({
    paperId: shaped.paperId, documents: shaped.sourceDocuments,
    question: questionDocument, answer: answerDocument, coverage: rendition,
    questionStructure: extractDocxDocumentStructure(questionDocument.bytes), answerStructure,
    issues: [], codePrefix: 'NCK1_DOCX', producerVersion: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
    reviewSchemaVersion: 'nck1-docx-materialization-review-v1',
    sourceDigest: nck1DocxProducerSourceDigest(shaped.sourceDocuments),
  })
  assert.deepEqual(result.review.required, [], JSON.stringify(result.review.required))
  assert.deepEqual(answerValues(result), baselineAnswers)
  assert.deepEqual(result.materialization.answers.at(-1).authority,
    { kind: 'page_region', documentId: answerDocument.documentId, page: 1, region })
}

// Explanations that restate a keyed answer, or say "同64题解析", are not a
// second answer and must not raise a conflict.
const restated = produceWith({ restatedExplanations: true })
assert.equal(restated.disposition, 'ready_for_verification')
assert.deepEqual(answerValues(restated), baselineAnswers)
for (const restatedExplanations of ['labelledSame', 'repeatedLead']) {
  const result = produceWith({ restatedExplanations })
  assert.equal(result.disposition, 'ready_for_verification', restatedExplanations)
  assert.deepEqual(answerValues(result), baselineAnswers, restatedExplanations)
}
for (const [restatedExplanations, code] of [
  ['conflict', 'NCK1_DOCX_ANSWER_CONFLICT'],
  ['labelledConflict', 'NCK1_DOCX_ANSWER_CONFLICT'],
  ['labelledColonConflict', 'NCK1_DOCX_ANSWER_CONFLICT'],
  ['labelledUnseparable', 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS'],
  ['extendedLead', 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS'],
  ['labelledExtension', 'NCK1_DOCX_ANSWER_CONFLICT'],
  ['splitWord', 'NCK1_DOCX_ANSWER_CONFLICT'],
]) {
  const result = produceWith({ restatedExplanations })
  assert.equal(result.disposition, 'needs_agent_review', restatedExplanations)
  assert(result.review.required.some((item) => item.code === code && item.path === 'answers.56'),
    restatedExplanations)
}

// A complete key ends answer parsing at the explanation heading.
const explained = produceWith({ explanationAfterKey: true })
assert.equal(explained.disposition, 'ready_for_verification')
assert.deepEqual(answerValues(explained), baselineAnswers)

// A one-word grid line cannot hold a multi-word answer; it stays a review item.
const ambiguousGrid = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ answerFormat: 'gridLines', transformXml: (xml) =>
    xml.replace('答案| walked quickly', '答案| have walked quickly') }).sourceDocuments,
})
assert.equal(ambiguousGrid.disposition, 'needs_agent_review')
assert(ambiguousGrid.review.required.some((item) =>
  item.code === 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS' && item.path === 'answers.56-65'))

// Bare part headings, type-only headings and Chinese sample labels all bound
// the same samples; scoring before or after a label stays out of the sample.
for (const writingShape of ['bare', 'typed', 'typedNoSection', 'chineseLabel', 'typedWithBareExplanations', 'stackedLabels']) {
  const result = produceWith({ writingShape })
  assert.equal(result.disposition, 'ready_for_verification', writingShape)
  assert.equal(writingSample(result, 'application-writing'), baselineApplication, writingShape)
  assert.equal(writingSample(result, 'continuation-writing'), baselineContinuation, writingShape)
}
for (const writingShape of ['bareScoringFirst', 'typedScoringOnly', 'missingSection']) {
  const result = produceWith({ writingShape })
  assert.equal(result.disposition, 'needs_agent_review', writingShape)
  assert(result.review.required.some((item) =>
    item.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'), writingShape)
  assert.equal(writingSample(result, 'application-writing'), null, writingShape)
}

// Listening transcript title aliases and "Text 1:" markers.
for (const [listeningHeading, listeningMarkerSuffix] of [['录音文稿', ''], ['听力试题原文', ''], ['听力原文', '：']]) {
  const result = produceWith({ listening: true, listeningHeading, listeningMarkerSuffix })
  assert.equal(result.disposition, 'ready_for_verification', `${listeningHeading}${listeningMarkerSuffix}`)
  assert.equal(result.materialization.listening.transcript.length, 10)
}

// A source may stack a section heading and its short title before one sample.
for (const between of ['', '<w:p/>']) {
  const result = produceWith({ transformXml: xml => xml.replace(
    '第二节：读后续写（满分25分）</w:t></w:r></w:p>',
    `第二节：读后续写（满分25分）</w:t></w:r></w:p>${between}<w:p><w:r><w:t>读后续写</w:t></w:r></w:p>`,
  ) })
  assert.equal(result.disposition, 'ready_for_verification')
  assert.equal(writingSample(result, 'continuation-writing'), baselineContinuation)
  assert.equal(writingSample(result, 'application-writing'), baselineApplication)
}
const separatedContinuation = produceWith({ transformXml: xml => xml.replace(
  '第二节：读后续写（满分25分）</w:t></w:r></w:p>',
  '第二节：读后续写（满分25分）</w:t></w:r></w:p><w:p><w:r><w:t>A separate sample.</w:t></w:r></w:p><w:p><w:r><w:t>读后续写</w:t></w:r></w:p>',
) })
assert(separatedContinuation.review.required.some(item =>
  item.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
const noWritingPartTitle = produceWith({ writingShape: 'typedNoSection', transformXml: xml => xml.replace(
  '读后续写:</w:t></w:r></w:p>',
  '第二节 读后续写</w:t></w:r></w:p><w:p><w:r><w:t>读后续写:</w:t></w:r></w:p>',
) })
assert.equal(noWritingPartTitle.disposition, 'ready_for_verification')
assert.equal(writingSample(noWritingPartTitle, 'continuation-writing'), baselineContinuation)

// Only a complete pair/range of question numbers may omit 第 after 回答.
for (const range of ['6、7', '6至7', '6-7']) {
  const result = produceWith({ listening: true, transformXml: xml =>
    xml.replace('回答第6、7题。', `回答${range}题。`) })
  assert.equal(result.disposition, 'ready_for_verification', range)
  assert.deepEqual(result.materialization.listening.transcript[5].questionNumbers, [6, 7])
}
for (const range of ['6、题', '6、7', '6和7题', '6、7题外文字']) {
  const result = produceWith({ listening: true, transformXml: xml =>
    xml.replace('回答第6、7题。', `回答${range}。`) })
  assert(result.review.required.some(item => item.code === 'NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS'), range)
}

// Parenthesized Chinese notes belong to marker metadata, never transcript prose.
for (const listeningMarkerSuffix of ['（第6题为主旨题）', '(第6题为主旨题)', '（比较 Text 3 的主旨）',
  ' 打听一位画家（第10题为推断题）', ' AI对艺术家的影响']) {
  const result = produceWith({ listening: true, listeningMarkerSuffix })
  assert.equal(result.disposition, 'ready_for_verification', listeningMarkerSuffix)
  assert.equal(result.materialization.listening.transcript.length, 10)
  assert.equal(result.materialization.listening.transcript[5].text, 'Synthetic transcript 6.')
}
const noteOnlyText = produceWith({ listening: true, transformXml: xml =>
  xml.replace('Text 6</w:t>', '（第6题说明 Text 6）</w:t>') })
assert(noteOnlyText.review.required.some(item =>
  item.code === 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS'))

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
  for (const remove of [false, true]) {
    const tampered = JSON.parse(reviewBytes)
    if (remove) delete tampered.listeningSourcePartition
    else tampered.listeningSourcePartition.disposition = 'altered'
    writeFileSync(first.reviewPath, JSON.stringify(tampered))
    assert.throws(() => runNck1DocxMaterializationJob({ paperDir: tempRoot, manifest: fixture.manifest }), /listening partition/u)
  }
  writeFileSync(first.reviewPath, reviewBytes)
  const historicalBaseReceipt = JSON.parse(receiptBytes)
  const historicalBaseReview = JSON.parse(reviewBytes)
  delete historicalBaseReceipt.listeningSourcePartitionDigest
  delete historicalBaseReview.listeningSourcePartition
  writeFileSync(first.receiptPath, JSON.stringify(historicalBaseReceipt))
  assert.throws(() => inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest }), /listening partition/u,
    'removing the current receipt audit digest must not bypass the partition check')
  const previousVersion = 'nck1-docx-materialization-producer-v11'
  const previousDigest = nck1DocxProducerSourceDigest(fixture.sourceDocuments, { producerVersion: previousVersion })
  writeFileSync(first.receiptPath, JSON.stringify({ ...historicalBaseReceipt, producerVersion: previousVersion, sourceDigest: previousDigest }))
  writeFileSync(first.reviewPath, JSON.stringify({ ...historicalBaseReview, producerVersion: previousVersion, sourceDigest: previousDigest }))
  const previousPaths = [outputPath, first.receiptPath, first.reviewPath]
  const previousBytes = previousPaths.map(file => readFileSync(file))
  assert.equal(inspectNck1Materialization({ paperDir: tempRoot, manifest: fixture.manifest }).producerState,
    'historical', 'pre-fix output remains inspectable but cannot masquerade as the new parser')
  assert.throws(() => runNck1DocxMaterializationJob({ paperDir: tempRoot, manifest: fixture.manifest }), /refusing to overwrite/u)
  previousPaths.forEach((file, index) => assert.deepEqual(readFileSync(file), previousBytes[index]))
  const historicalVersion = 'nck1-docx-materialization-producer-v9'
  const historicalDigest = nck1DocxProducerSourceDigest(fixture.sourceDocuments, { producerVersion: historicalVersion })
  const historicalReceipt = { ...historicalBaseReceipt, producerVersion: historicalVersion, sourceDigest: historicalDigest }
  const historicalReview = { ...historicalBaseReview, producerVersion: historicalVersion, sourceDigest: historicalDigest }
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
