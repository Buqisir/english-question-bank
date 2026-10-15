import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  canonicalAuthorityRef,
  nck1MaterializationCandidateAuthorityRef,
  nck1MaterializationHistoricalAuthorityRef54,
  nck1MaterializationHistoricalAuthorityRef58,
  nck1MaterializationHistoricalAuthorityRef61,
  resolveCanonicalAuthority,
  trustedDocxCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import {
  compileCanonicalPaper,
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { validateContinuationWritingContract } from '../shared/paper-canonical/continuationWriting.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../shared/paper-canonical/sourcePresentation.mjs'
import { projectListeningGroupPresentation } from '../shared/paper-canonical/listeningPresentation.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { assertCanonicalConsumptionVisibleStructure } from '../shared/paper-canonical/visibleStructure.mjs'
import manifestV46 from '../standards/paper-canonical/manifest-v46.json' with { type: 'json' }
import oldScreenContract from '../standards/paper-canonical/consumers/screen-v45.json' with { type: 'json' }
import oldPrintContract from '../standards/paper-canonical/consumers/print-pdf-v46.json' with { type: 'json' }
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { admitCanonicalPaperImport, loadPaperForConsumptionSync, publicationFileName } from '../server/paper-canonical/publication.mjs'
import {
  NCK1_MATERIALIZATION_REQUEST_FILE_NAME,
  materializeNck1CanonicalRequest,
} from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  deriveNck1MaterializationBundle,
  paragraphMatchesOneDocxParagraph,
  resolveDocxParagraphSelector,
  sourceOrderedParagraphEntries,
  validateDocxParagraphBindings,
} from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { extractDocxDocumentParagraphs } from '../server/paper-canonical/docxSourceAdapter.mjs'
import { applySpellingReview, enumerateSpellingTargets, loadSpellingReview, prepareSpellingReview, verifyTerminalWhitespaceSourceEvidence, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V2, TEXT_REVIEW_POLICY_V4 } from '../server/paper-import/spellingReview.mjs'
import { buildNck1ReviewConsumption, loadNck1ReviewSource } from '../server/import-review/revisionProjection.mjs'
import { buildPreprocessingReport } from '../server/paper-import/preprocessingReport.mjs'
import { canonicalizeVisibleEnglishTypography as typography } from '../shared/paper-canonical/visibleTypography.mjs'
import { replayCanonicalVisibleTypography as replayTypography } from '../shared/paper-canonical/visibleTypographyReplay.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'

const textEncoder = new TextEncoder()
const mediaDocumentBytesFixture = new Uint8Array(Buffer.from(
  'UEsDBBQAAAAAAGBBG10rh3kcJgEAACYBAAAVAAAAd29yZC9tZWRpYS9pbWFnZTEucG5niVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oIGwgLAVaDsf4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMjdUMDg6MTE6MDErMDA6MDCMMSViAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTI3VDA4OjExOjAxKzAwOjAw/Wyd3gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0yN1QwODoxMTowMSswMDowMKp5vAEAAAAKSURBVAjXY2AAAAACAAHiIbwzAAAAAElFTkSuQmCCUEsBAhQDFAAAAAAAYEEbXSuHeRwmAQAAJgEAABUAAAAAAAAAAAAAAIABAAAAAHdvcmQvbWVkaWEvaW1hZ2UxLnBuZ1BLBQYAAAAAAQABAEMAAABZAQAAAAA=',
  'base64',
))
const mediaBytesFixture = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oIGwgLAVaDsf4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMjdUMDg6MTE6MDErMDA6MDCMMSViAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTI3VDA4OjExOjAxKzAwOjAw/Wyd3gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0yN1QwODoxMTowMSswMDowMKp5vAEAAAAKSURBVAjXY2AAAAACAAHiIbwzAAAAAElFTkSuQmCC',
  'base64',
))

assert(paragraphMatchesOneDocxParagraph({
  content: [{ kind: 'text', text: 'First source paragraph.' }],
}, ['First source paragraph.', 'Second source paragraph.']))
assert.equal(paragraphMatchesOneDocxParagraph({
  content: [{ kind: 'text', text: 'First source paragraph. Second source paragraph.' }],
}, ['First source paragraph.', 'Second source paragraph.']), false)
const sourceParagraphs = [
  { sourceIndex: 1, text: 'First source paragraph.' },
  { sourceIndex: 2, text: 'Repeated source paragraph.' },
  { sourceIndex: 3, text: 'Repeated source paragraph.' },
]
assert.deepEqual(
  resolveDocxParagraphSelector('//w:p[contains(.,"First source")]', sourceParagraphs),
  [sourceParagraphs[0]],
)
assert.equal(
  resolveDocxParagraphSelector('//w:p[contains(.,"Repeated source")]', sourceParagraphs).length,
  2,
  'ambiguous DOCX paragraph selectors must remain detectable',
)
assert.deepEqual(
  resolveDocxParagraphSelector('//w:p[contains(.,"Repeated source")][2]', sourceParagraphs),
  [sourceParagraphs[2]],
  'an occurrence qualifier must bind repeated source text deterministically',
)
assert.deepEqual(
  resolveDocxParagraphSelector('//w:p[normalize-space(.)="First source paragraph."]', sourceParagraphs),
  [sourceParagraphs[0]],
)
assert.deepEqual(
  resolveDocxParagraphSelector('//w:p[1]', sourceParagraphs),
  [],
  'unsupported DOCX paragraph selector syntax must fail closed',
)
const paragraphBlock = (blockId, text, selector) => ({
  kind: 'paragraph',
  blockId,
  content: [{ kind: 'text', text }],
  source: { selector },
})
const bindingIssues = (blocks) => validateDocxParagraphBindings(
  blocks.map((block, index) => ({ block, path: `$.blocks[${index}]` })),
  sourceParagraphs,
)
assert.deepEqual(bindingIssues([
  paragraphBlock('first', 'First source paragraph.', '//w:p[contains(.,"First source")]'),
  paragraphBlock('repeated-2', 'Repeated source paragraph.', '//w:p[contains(.,"Repeated source")][2]'),
]), [])
assert(bindingIssues([
  paragraphBlock('ambiguous', 'Repeated source paragraph.', '//w:p[contains(.,"Repeated source")]'),
]).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_SELECTOR_INVALID'))
assert(bindingIssues([
  paragraphBlock('mismatch', 'Wrong paragraph.', '//w:p[contains(.,"First source")]'),
]).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'))
const fidelitySourceParagraphs = [
  { sourceIndex: 11, text: 'He said “Ａ B”.' },
  { sourceIndex: 12, text: 'Use ＿＿＿ now.' },
  { sourceIndex: 13, text: 'Fill __56__ now.' },
  { sourceIndex: 14, text: '\tTabbed edge.' },
  { sourceIndex: 15, text: 'Line edge.\n' },
  { sourceIndex: 16, text: 'Before\n__57__after.' },
  { sourceIndex: 17, text: 'Before __58__\tafter.' },
]
const fidelityIssues = (block) => validateDocxParagraphBindings(
  [{ block, path: '$.blocks[0]' }],
  fidelitySourceParagraphs,
)
for (const [label, block] of [
  ['curly quotes', paragraphBlock('quotes', 'He said "Ａ B".', '//w:p[contains(.,"He said")]')],
  ['full-width character', paragraphBlock('width', 'He said “A B”.', '//w:p[contains(.,"He said")]')],
  ['internal whitespace', paragraphBlock('space', 'He said “ＡB”.', '//w:p[contains(.,"He said")]')],
  ['ordinary full-width underscores', paragraphBlock('underline', 'Use now.', '//w:p[contains(.,"Use")]')],
  ['leading tab', paragraphBlock('leading-tab', 'Tabbed edge.', '//w:p[contains(.,"Tabbed edge")]')],
  ['trailing line break', paragraphBlock('trailing-break', 'Line edge.', '//w:p[contains(.,"Line edge")]')],
]) {
  assert(
    fidelityIssues(block).some((issue) =>
      issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'),
    `${label} changes must fail strict DOCX paragraph fidelity`,
  )
}
const blankParagraph = {
  ...paragraphBlock('blank', '', '//w:p[contains(.,"Fill")]'),
  content: [
    { kind: 'text', text: 'Fill ' },
    { kind: 'blank_ref', blankId: 'blank-56' },
    { kind: 'text', text: ' now.' },
  ],
}
assert.deepEqual(
  fidelityIssues(blankParagraph),
  [],
  'one explicit blank_ref may consume one source blank token',
)
assert(
  fidelityIssues(paragraphBlock('blank-missing', 'Fill now.', '//w:p[contains(.,"Fill")]'))
    .some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'),
  'a missing blank_ref must fail strict DOCX paragraph fidelity',
)
assert(
  fidelityIssues({
    ...blankParagraph,
    blockId: 'blank-misplaced',
    content: [
      { kind: 'text', text: 'Fill now. ' },
      { kind: 'blank_ref', blankId: 'blank-56' },
    ],
  }).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'),
  'a misplaced blank_ref must fail strict DOCX paragraph fidelity',
)
for (const [label, selector, before, blankId, after] of [
  ['line break before blank', '//w:p[contains(.,"Before")][1]', 'Before ', 'blank-57', 'after.'],
  ['tab after blank', '//w:p[contains(.,"Before")][2]', 'Before ', 'blank-58', ' after.'],
]) {
  assert(
    fidelityIssues({
      ...paragraphBlock(label, '', selector),
      content: [
        { kind: 'text', text: before },
        { kind: 'blank_ref', blankId },
        { kind: 'text', text: after },
      ],
    }).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'),
    `${label} must not be consumed as blank-adjacent spacing`,
  )
}
assert(bindingIssues([
  paragraphBlock('repeat-1', 'Repeated source paragraph.', '//w:p[contains(.,"Repeated source")][1]'),
  paragraphBlock('repeat-1-again', 'Repeated source paragraph.', '//w:p[contains(.,"Repeated source")][1]'),
]).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_PLACEMENT_DUPLICATE'))
assert(bindingIssues([
  paragraphBlock('repeat-2', 'Repeated source paragraph.', '//w:p[contains(.,"Repeated source")][2]'),
  paragraphBlock('first', 'First source paragraph.', '//w:p[contains(.,"First source")]'),
]).some((issue) => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_SOURCE_ORDER_INVALID'))
const nestedParagraph = paragraphBlock(
  'nested',
  'First source paragraph.',
  '//w:p[contains(.,"First source")]',
)
assert.deepEqual(sourceOrderedParagraphEntries([{
  kind: 'framed_columns',
  columns: [
    { blocks: [nestedParagraph] },
    { blocks: [] },
  ],
}], '$.blocks'), [{
  block: nestedParagraph,
  path: '$.blocks[0].columns[0].blocks[0]',
}], 'nested framed-column paragraphs must enter DOCX binding validation')

function sourceInput({ listening = true, mixedTable = true } = {}) {
  const materialization = makeFixture({ listening, mixedTable })
  const questionBytes = textEncoder.encode(
    '%PDF-1.7 deterministic NCK1 question source'.padEnd(100, 'q'),
  )
  const answerBytes = textEncoder.encode(
    '%PDF-1.7 deterministic official answer source'.padEnd(100, 'a'),
  )
  const mediaDocumentBytes = mediaDocumentBytesFixture.slice()
  const mediaBytes = mediaBytesFixture.slice()
  for (const [documentId, bytes] of [
    ['paper', questionBytes],
    ['answers', answerBytes],
  ]) {
    const document = materialization.documents.find((item) =>
      item.documentId === documentId)
    document.sha256 = sha256(bytes)
    document.byteLength = bytes.byteLength
  }
  if (mixedTable) {
    materialization.documents.push({
      documentId: 'media-source',
      role: 'question_source',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sha256: sha256(mediaDocumentBytes),
      byteLength: mediaDocumentBytes.byteLength,
      pageCount: 1,
    })
    materialization.media[0].sha256 = sha256(mediaBytes)
    materialization.media[0].pixelWidth = 1
    materialization.media[0].pixelHeight = 1
    materialization.media[0].extraction = {
      kind: 'docx_media',
      documentId: 'media-source',
      entryName: 'word/media/image1.png',
    }
  }
  return {
    kind: 'nck1-source-materialization',
    materializationBytes: textEncoder.encode(JSON.stringify(materialization)),
    documents: [
      { documentId: 'paper', bytes: questionBytes },
      { documentId: 'answers', bytes: answerBytes },
      ...(mixedTable
        ? [{ documentId: 'media-source', bytes: mediaDocumentBytes }]
        : []),
    ],
    media: mixedTable
      ? [{ mediaId: 'media:warning-icon', bytes: mediaBytes }]
      : [],
  }
}

function confirmation(candidate) {
  return {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
}

const input = sourceInput()
const noSpaceGrammarPromptInput = sourceInput()
const noSpaceGrammarMaterialization = JSON.parse(new TextDecoder().decode(
  noSpaceGrammarPromptInput.materializationBytes,
))
const noSpaceGrammarText = noSpaceGrammarMaterialization.groups
  .find((group) => group.slotId === 'grammar-fill')
  .blocks[0].content.find((item) => item.kind === 'text' && item.text.includes('(word)'))
noSpaceGrammarText.text = noSpaceGrammarText.text.replace(' (word)', '(word)')
noSpaceGrammarPromptInput.materializationBytes = textEncoder.encode(
  JSON.stringify(noSpaceGrammarMaterialization),
)
assert.deepEqual(
  importCanonicalCandidate(noSpaceGrammarPromptInput).issues,
  [],
  'Grammar Fill source prompts may immediately follow the blank marker without a space',
)
const misplacedDirectionInput = sourceInput()
const misplacedDirectionMaterialization = JSON.parse(new TextDecoder().decode(
  misplacedDirectionInput.materializationBytes,
))
misplacedDirectionMaterialization.groups.find((group) => group.slotId === 'cloze').blocks.unshift({
  kind: 'paragraph',
  blockId: 'block:misplaced-direction',
  role: 'body',
  content: [{ kind: 'text', text: '请阅读下面短文，从每题所给的四个选项中选出最佳选项。' }],
  source: {
    kind: 'page_region',
    documentId: 'paper',
    page: 1,
    region: { x: 0, y: 0, width: 1, height: 1 },
  },
})
misplacedDirectionInput.materializationBytes = textEncoder.encode(
  JSON.stringify(misplacedDirectionMaterialization),
)
const misplacedDirectionCandidate = importCanonicalCandidate(misplacedDirectionInput)
assert(misplacedDirectionCandidate.issues.some((item) =>
  item.code === 'MATERIALIZATION_PASSAGE_INSTRUCTION_SUSPECTED'))
const misplacedDirectionConfirmation = rederiveConfirmedCanonicalCandidate(
  misplacedDirectionCandidate.candidate,
  confirmation(misplacedDirectionCandidate.candidate),
)
assert.equal(Boolean(misplacedDirectionConfirmation.compilation), false,
  'a suspected passage instruction blocks confirmed compilation')
assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(trustedDocxCandidateAuthorityRef.manifestVersion, '37')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '62')
assert.equal(nck1MaterializationHistoricalAuthorityRef58.manifestVersion, '58')
assert.equal(resolveCanonicalAuthority({
  manifestId: manifestV46.manifestId,
  manifestVersion: manifestV46.version,
  manifestDigest: digestJson(manifestV46),
}).ok, true, 'immutable NCK1 Candidate authority v46 remains resolvable')
const first = importCanonicalCandidate(input)
const second = importCanonicalCandidate(input)
const historical = importCanonicalCandidate(input, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef58,
})
assert.deepEqual(historical.issues, [])
assert.notEqual(historical.candidate.candidateDigest, first.candidate.candidateDigest)
assert.equal(historical.candidate.authority.manifestVersion, '58')
assert(first.candidate)
assert.deepEqual(first.issues, [])
assert.equal(first.candidate.candidateDigest, second.candidate.candidateDigest)
assert.equal(first.candidate.interpretation.groups.length, 11)
assert.equal(first.candidate.interpretation.assertions.length, 65)
assert.equal(first.candidate.interpretation.inactiveSourceClosures.length, 0)
const listeningCandidateGroups = first.candidate.interpretation.groups.filter((group) =>
  group.family === 'listening')
assert.deepEqual(
  listeningCandidateGroups.map((group) => group.slotId),
  ['listening.short-dialogue', 'listening.long-form'],
)
assert.deepEqual(
  listeningCandidateGroups.flatMap((group) => group.questionIds),
  Array.from({ length: 20 }, (_, index) => `question:listening:${index + 1}`),
)
assert(listeningCandidateGroups.every((group) =>
  group.variant.transcriptSegments.length === 5
  && group.variant.transcriptSegments.every((segment) =>
    group.sourceSpanRefsByTarget[`transcript_segment:${segment.segmentId}`]?.length > 0)))
assert.equal(first.candidate.interpretation.groups.find((group) =>
  group.slotId === 'reading.a').media.length, 1)
assert.deepEqual(
  first.candidate.interpretation.groups.find((group) =>
    group.slotId === 'reading.a').content.blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => block.nodeId),
  ['block:reading-a', 'block:reading-a:second-paragraph'],
  'NCK1 Candidate must preserve source paragraph blocks one-for-one',
)
assert.deepEqual(first.candidate.authority, nck1MaterializationCandidateAuthorityRef)
assert.deepEqual(
  first.candidate.interpretation.groups
    .find((group) => group.family === 'seven-choices')
    .variant.passageBlockRoles,
  [{ nodeId: 'block:seven-choices:title', role: 'title' }],
  'NCK1 Candidate binds source-proven Seven Choices passage roles',
)
assert.equal(
  first.candidate.interpretation.groups
    .find((group) => group.family === 'continuation-writing')
    .variant.sourceInstruction.text,
  'continuation-writing prompt',
  'NCK1 Candidate retains the source-exact continuation instruction',
)

const publicV50 = compileCanonicalPaper({
  authority: nck1MaterializationCandidateAuthorityRef,
  evidence: { documents: [] },
})
assert(publicV50.artifacts.normalizationReport.diagnostics.some((item) =>
  item.code === 'AUTHORITY_RETIRED'))

const confirmed = rederiveConfirmedCanonicalCandidate(
  first.candidate,
  confirmation(first.candidate),
)
assert(confirmed.compilation?.artifacts?.canonicalPaper, JSON.stringify(confirmed.unresolvedIssues))
assert.equal(
  confirmed.compilation.artifacts.canonicalPaper.questionGroups.length,
  11,
)
assert.deepEqual(
  confirmed.compilation.artifacts.canonicalPaper.questionGroups.find((group) =>
    group.contractRef.familyContractId === 'reading').content.blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => block.nodeId),
  ['block:reading-a', 'block:reading-a:second-paragraph'],
  'confirmed Canonical Paper must preserve source paragraph blocks one-for-one',
)
const confirmedPackage = {
  plan: confirmed.compilation.artifacts.canonicalPaper.paperPlan,
  groups: confirmed.compilation.artifacts.canonicalPaper.questionGroups,
  sourceCapture: confirmed.compilation.artifacts.sourceCapture,
  authorityClosure: resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure,
}
const projected = projectCanonicalPaper(confirmedPackage)
const projectedGroups = projected.nodes.filter((node) => node.kind === 'group')
assert.deepEqual(
  projectedGroups.slice(0, 2).map((group) => ({
    slotId: group.slotId,
    questionNumbers: group.numbering.map(({ number }) => number),
  })),
  [
    { slotId: 'listening.short-dialogue', questionNumbers: [1, 2, 3, 4, 5] },
    {
      slotId: 'listening.long-form',
      questionNumbers: Array.from({ length: 15 }, (_, index) => index + 6),
    },
  ],
  'Listening Questions must lead the projected paper in canonical order',
)
const listeningOccurrences = projectedGroups.filter((group) =>
  group.familyContractId === 'listening')
const listeningConsumption = {
  disposition: 'ready',
  paperId: confirmedPackage.plan.paperId,
  authorityRef: confirmedPackage.plan.authorityRef,
  selections: [{
    mode: 'canonical',
    familyContractId: 'listening',
    groupIds: listeningOccurrences.map(({ groupId }) => groupId),
    projectedOccurrences: listeningOccurrences,
    projectedOccurrenceDigests: listeningOccurrences.map((occurrence) => ({
      groupId: occurrence.groupId,
      digest: digestJson(occurrence),
    })),
  }],
}
for (const mutation of ['missing-digest', 'changed-question']) {
  const tampered = structuredClone(listeningConsumption)
  const selection = tampered.selections[0]
  if (mutation === 'missing-digest') delete selection.projectedOccurrenceDigests
  else selection.projectedOccurrences[0].questions[0].stem[0].text = 'Unbound replacement question'
  assert.throws(() => projectCanonicalConsumerGroup({
    consumption: tampered,
    familyContractId: 'listening',
    groupId: listeningOccurrences[0].groupId,
  }), /projected occurrence integrity/, mutation)
}
const studentListening = projectCanonicalConsumerGroup({
  consumption: listeningConsumption,
  familyContractId: 'listening',
  groupId: listeningOccurrences[0].groupId,
})
assert.equal(studentListening.questions.length, 5)
assert.equal(Object.hasOwn(studentListening, 'transcriptSegments'), false)
assert(studentListening.questions.every((question) =>
  !Object.hasOwn(question, 'correctOptionId')
  && !Object.hasOwn(question, 'officialAnswer')))
assert.deepEqual(
  projected.nodes.find((node) =>
    node.kind === 'group' && node.familyContractId === 'seven-choices')
    .passageBlockRoles,
  [{ nodeId: 'block:seven-choices:title', role: 'title' }],
  'Canonical projector retains source-proven Seven Choices passage roles',
)
const canonicalContinuationGroup = confirmedPackage.groups.find((group) =>
  group.contractRef.familyContractId === 'continuation-writing')
const projectedContinuationGroup = projected.nodes.find((node) =>
  node.kind === 'group' && node.familyContractId === 'continuation-writing')
assert.equal(
  projected.nodes.find((node) =>
    node.kind === 'instruction'
    && node.instructionId === 'writing.continuation.prompt').text,
  'continuation-writing prompt',
  'top-level projection replaces the Profile default with the source instruction',
)
assert.equal(
  projectedContinuationGroup.paperChrome.instructions.find((instruction) =>
    instruction.instructionId === 'writing.continuation.prompt').text,
  'continuation-writing prompt',
  'Continuation paper chrome uses the same source-exact instruction',
)
const visibleStructure = projected.nodes.flatMap((node) => {
  if (['part', 'section', 'instruction'].includes(node.kind)) return [node]
  if (node.kind !== 'group') return []
  return [{
    kind: 'group',
    slotId: node.slotId,
    groupId: node.groupId,
    familyContractId: node.familyContractId,
  }]
})
const groupsByFamily = new Map()
for (const group of confirmedPackage.groups) {
  const familyContractId = group.contractRef.familyContractId
  const groupIds = groupsByFamily.get(familyContractId) || []
  groupIds.push(group.identity.groupId)
  groupsByFamily.set(familyContractId, groupIds)
}
assert.deepEqual(
  assertCanonicalConsumptionVisibleStructure({
    authorityRef: confirmedPackage.plan.authorityRef,
    profileRef: confirmedPackage.plan.profileRef,
    visibleStructure,
    visibleStructureDigest: digestJson(visibleStructure),
    selections: [...groupsByFamily].map(([familyContractId, groupIds]) => {
      const projectedOccurrences = projected.nodes.filter((node) =>
        node.kind === 'group' && groupIds.includes(node.groupId))
      return {
        mode: 'canonical',
        familyContractId,
        groupIds,
        projectedOccurrences,
        ...(familyContractId === 'continuation-writing'
          ? {
              projectedOccurrenceDigests: projectedOccurrences.map(
                (occurrence) => ({
                  groupId: occurrence.groupId,
                  digest: digestJson(occurrence),
                }),
              ),
            }
          : {}),
      }
    }),
  }),
  visibleStructure,
  'visible structure accepts source-backed Profile instruction text',
)
const continuationValidationInput = {
  groupId: canonicalContinuationGroup.identity.groupId,
  profileId: 'nck1',
  questionIds: canonicalContinuationGroup.questionRefs.map(({ questionId }) =>
    questionId),
  blankIds: canonicalContinuationGroup.blankRefs.map(({ blankId }) => blankId),
  content: canonicalContinuationGroup.content,
  variant: canonicalContinuationGroup.variant,
  sourceCapture: confirmedPackage.sourceCapture,
}
assert.deepEqual(
  validateContinuationWritingContract(continuationValidationInput),
  [],
  'source-exact continuation instruction authority validates before projection',
)
for (const [label, mutate] of [
  ['text', (variant) => { variant.sourceInstruction.text = 'rewritten prompt' }],
  ['observation ref', (variant) => {
    variant.sourceInstruction.authorityObservationRef = 'observation:unbound'
  }],
]) {
  const variant = structuredClone(canonicalContinuationGroup.variant)
  mutate(variant)
  assert(
    validateContinuationWritingContract({
      ...continuationValidationInput,
      variant,
    }).some((issue) =>
      issue.code === 'CONTINUATION_SOURCE_INSTRUCTION_UNPROVEN'),
    `tampered continuation source instruction ${label} must fail closed`,
  )
}
const invalidRolePackage = structuredClone(confirmedPackage)
invalidRolePackage.groups.find((group) =>
  group.contractRef.familyContractId === 'seven-choices')
  .variant.passageBlockRoles[0].nodeId = 'block:unbound-title'
assert.throws(
  () => projectCanonicalPaper(invalidRolePackage),
  (error) =>
    error?.code === 'CANONICAL_PROJECTION_REJECTED'
    && error.issues?.some((issue) =>
      issue.code === 'SEVEN_CHOICES_ROLE_MAP_INVALID'),
  'unbound Seven Choices role references fail closed before projection',
)

const noListening = importCanonicalCandidate(sourceInput({ listening: false }))
assert(noListening.candidate)
assert.deepEqual(noListening.issues, [])
assert.equal(noListening.candidate.interpretation.groups.length, 9)
const confirmedNoListening = rederiveConfirmedCanonicalCandidate(
  noListening.candidate,
  confirmation(noListening.candidate),
)
assert(confirmedNoListening.compilation?.artifacts?.canonicalPaper)
const noListeningPaper = confirmedNoListening.compilation.artifacts.canonicalPaper
assert.deepEqual(
  noListeningPaper.paperPlan.slotBindings.filter(({ state }) => state === 'omitted'),
  [
    {
      slotId: 'listening.short-dialogue',
      state: 'omitted',
      sourceState: 'not_supplied',
    },
    {
      slotId: 'listening.long-form',
      state: 'omitted',
      sourceState: 'not_supplied',
    },
  ],
)
assert.deepEqual(
  noListeningPaper.paperPlan.completeness.optionalOmissions,
  ['listening.short-dialogue', 'listening.long-form'],
)
const noListeningProjection = projectCanonicalPaper({
  plan: noListeningPaper.paperPlan,
  groups: noListeningPaper.questionGroups,
  sourceCapture: confirmedNoListening.compilation.artifacts.sourceCapture,
  authorityClosure: resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure,
})
assert.equal(noListeningProjection.nodes.some((node) =>
  node.slotId?.startsWith('listening.')
  || node.familyContractId === 'listening'), false)

const callerSemantics = importCanonicalCandidate(input, { groups: [] })
assert.equal(callerSemantics.candidate, null)
assert(callerSemantics.issues.some((issue) =>
  issue.code === 'CALLER_SEMANTICS_REJECTED'))

const staleConfirmation = confirmation(first.candidate)
staleConfirmation.candidateDigest = `sha256:${'0'.repeat(64)}`
assert(rederiveConfirmedCanonicalCandidate(first.candidate, staleConfirmation)
  .unresolvedIssues.some((issue) =>
    issue.code === 'CONFIRMATION_CANDIDATE_MISMATCH'))
assert(rederiveConfirmedCanonicalCandidate(first.candidate, {
  ...confirmation(first.candidate),
  confirmed: false,
}).unresolvedIssues.some((issue) =>
  issue.code === 'TEACHER_CONFIRMATION_REQUIRED'))

const tamperedCandidate = structuredClone(first.candidate)
tamperedCandidate.sourceInput.documents[0].bytes[0] ^= 1
assert(rederiveConfirmedCanonicalCandidate(
  tamperedCandidate,
  confirmation(first.candidate),
).unresolvedIssues.some((issue) =>
  issue.code === 'CANDIDATE_BINDING_MISMATCH'))

const tamperedDocument = sourceInput()
tamperedDocument.documents[0].bytes[0] ^= 1
assert(importCanonicalCandidate(tamperedDocument).issues.some((issue) =>
  issue.code === 'MATERIALIZATION_SOURCE_DOCUMENT_MISMATCH'))

const tamperedMedia = sourceInput()
tamperedMedia.media[0].bytes[0] ^= 1
assert(importCanonicalCandidate(tamperedMedia).issues.some((issue) =>
  issue.code === 'MATERIALIZATION_SOURCE_MEDIA_MISMATCH'))

const tamperedRecipe = sourceInput()
const recipeMaterialization = JSON.parse(new TextDecoder().decode(
  tamperedRecipe.materializationBytes,
))
recipeMaterialization.media[0].extraction.entryName = 'word/media/missing.png'
tamperedRecipe.materializationBytes = textEncoder.encode(
  JSON.stringify(recipeMaterialization),
)
assert(importCanonicalCandidate(tamperedRecipe).issues.some((issue) =>
  issue.code === 'MATERIALIZATION_MEDIA_RECIPE_UNAVAILABLE'))

const tamperedDimensions = sourceInput()
const dimensionsMaterialization = JSON.parse(new TextDecoder().decode(
  tamperedDimensions.materializationBytes,
))
dimensionsMaterialization.media[0].pixelWidth = 2
tamperedDimensions.materializationBytes = textEncoder.encode(
  JSON.stringify(dimensionsMaterialization),
)
assert(importCanonicalCandidate(tamperedDimensions).issues.some((issue) =>
  issue.code === 'MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH'))

const tamperedMaterialization = sourceInput()
const parsed = JSON.parse(new TextDecoder().decode(
  tamperedMaterialization.materializationBytes,
))
parsed.answers.pop()
tamperedMaterialization.materializationBytes = textEncoder.encode(
  JSON.stringify(parsed),
)
assert(importCanonicalCandidate(tamperedMaterialization).issues.some((issue) =>
  issue.code === 'MATERIALIZATION_ANSWERS_INCOMPLETE'))

const materialized = materializeNck1CanonicalRequest(
  input,
  confirmation(first.candidate),
)
const historicalMaterialized = materializeNck1CanonicalRequest(
  input,
  confirmation(historical.candidate),
)
assert.equal(historicalMaterialized.request.authority.manifestVersion, '58')
assert.equal(historicalMaterialized.candidateDigest, historical.candidate.candidateDigest)
const rawNoListeningInput = sourceInput({ listening: false })
const rawNoListeningCandidate = importCanonicalCandidate(rawNoListeningInput).candidate
const rawNoListeningRequest = materializeNck1CanonicalRequest(
  rawNoListeningInput,
  confirmation(rawNoListeningCandidate),
)
const rawAdmission = admitCanonicalPaperImport({
  request: rawNoListeningRequest.request,
  sourceAssetVersion: 1,
})
assert.equal(rawAdmission.ok, true,
  `raw v62 admission and consumers remain valid: ${JSON.stringify(rawAdmission.diagnostics)}`)
assert.equal(rawAdmission.sealed.manifest.authority.manifestVersion, '62')
const replay61 = importCanonicalCandidate(rawNoListeningInput, undefined, {
  materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef61,
})
assert.deepEqual(replay61.issues, [])
const request61 = materializeNck1CanonicalRequest(rawNoListeningInput, confirmation(replay61.candidate))
assert.equal(request61.request.authority.manifestVersion, '61')
assert.equal(compileCanonicalPaper(request61.request).disposition, 'ready')

// A pre-v62 client must not silently discard source-owned directions/examples.
for (const sourceOwned of [false, true]) {
  const source = sourceInput({ listening: false, mixedTable: false })
  const materialization = JSON.parse(new TextDecoder().decode(source.materializationBytes))
  if (sourceOwned) {
    materialization.schemaVersion = 'nck1-source-materialization-v4'
    materialization.sourcePresentation = { listeningExample: null,
      instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS).filter(slot => !slot.startsWith('listening.'))
        .map(slotId => ({ slotId, text: `Source direction for ${slotId}.`, source: materialization.groups[0].blocks[0].source })) }
    source.materializationBytes = textEncoder.encode(JSON.stringify(materialization))
  }
  const candidate = importCanonicalCandidate(source).candidate
  const request = materializeNck1CanonicalRequest(source, confirmation(candidate)).request
  const admission = admitCanonicalPaperImport({ request, sourceAssetVersion: 1 })
  assert.equal(admission.ok, true, JSON.stringify(admission.diagnostics))
  const { sealed } = admission
  const ref = { paperId: sealed.manifest.paperId, versionName: 'v1', sourceAssetVersion: 1,
    publicationDigest: sealed.manifest.publicationDigest }
  const store = {
    readPublishedRefs: () => ({ current: ref, latest: ref }),
    readSourceAsset: () => sealed.sourceAsset,
    readVersionArtifact: (_ref, relativePath) => relativePath === `canonical/${publicationFileName}`
      ? textEncoder.encode(JSON.stringify(sealed.manifest))
      : sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath] || null,
  }
  for (const old of [oldScreenContract, oldPrintContract]) {
    const result = loadPaperForConsumptionSync({ paperId: ref.paperId, version: ref.versionName,
      consumerContract: { id: old.consumerId, version: old.version, digest: old.contractDigest } }, store)
    assert.equal(result.disposition, sourceOwned ? 'incompatible' : 'ready', JSON.stringify(result.diagnostics))
    if (sourceOwned) assert.equal(result.diagnostics[0].code, 'CANONICAL_CONSUMER_SOURCE_PRESENTATION_UNAVAILABLE')
  }
}

// Raw v4 directions/example presence survive the same canonical path as Questions.
for (const exampleState of ['not_supplied', 'provided']) {
  const source = sourceInput({ listening: true, mixedTable: false })
  const materialization = JSON.parse(new TextDecoder().decode(source.materializationBytes))
  const locator = materialization.groups[0].source ?? materialization.groups[0].blocks[0].source
  materialization.schemaVersion = 'nck1-source-materialization-v4'
  materialization.sourcePresentation = {
    instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS).map(slotId => ({ slotId,
      text: `Source direction for ${slotId}.`, source: structuredClone(locator) })),
    listeningExample: { state: exampleState, source: structuredClone(locator),
      ...(exampleState === 'provided' ? { stem: 'When does the bus leave?',
        options: [{ label: 'A', text: '8:20' }, { label: 'B', text: '9:40' }, { label: 'C', text: '10:15' }], answer: 'B' } : {}) },
  }
  source.materializationBytes = textEncoder.encode(JSON.stringify(materialization))
  const candidate = importCanonicalCandidate(source)
  assert.deepEqual(candidate.issues, [])
  const compilation = rederiveConfirmedCanonicalCandidate(candidate.candidate, confirmation(candidate.candidate)).compilation
  assert(compilation?.artifacts.canonicalPaper, 'source presentation must compile, not disappear silently')
  assertCanonicalConsumptionVisibleStructure(buildNck1ReviewConsumption(candidate.candidate, compilation))
  const pack = { plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture }
  const projection = projectCanonicalPaper(pack)
  for (const entry of materialization.sourcePresentation.instructions) {
    assert.equal(projection.nodes.find(node => node.kind === 'instruction'
      && node.instructionId === SOURCE_INSTRUCTION_SLOTS[entry.slotId]).text, entry.text)
  }
  const occurrences = projection.nodes.filter(node => node.kind === 'group' && node.familyContractId === 'listening')
  const consumption = { disposition: 'ready', paperId: materialization.paperId,
    authorityRef: pack.plan.authorityRef, selections: [{ mode: 'canonical', familyContractId: 'listening',
      groupIds: occurrences.map(item => item.groupId), projectedOccurrences: occurrences,
      projectedOccurrenceDigests: occurrences.map(item => ({ groupId: item.groupId, digest: digestJson(item) })) }] }
  const group = projectCanonicalConsumerGroup({ consumption, groupId: occurrences[0].groupId, familyContractId: 'listening' })
  const presentation = projectListeningGroupPresentation(group)
  assert.equal(presentation.instruction, 'Source direction for listening.short-dialogue.')
  assert.equal(presentation.example?.answer ?? null, exampleState === 'provided' ? 'B' : null)
  assert.equal(presentation.example?.stem ?? null, exampleState === 'provided' ? 'When does the bus leave?' : null)
  assert.equal(JSON.stringify(group).includes('correctOptionId'), false, 'example answer does not disclose formal Question answers')
  const tampered = structuredClone(pack)
  tampered.groups.find(item => item.sourcePresentation).sourcePresentation.instruction.text = 'Unbound instruction'
  assert.throws(() => projectCanonicalPaper(tampered), /Source presentation/)
  const missing = structuredClone(materialization)
  missing.sourcePresentation.instructions.pop()
  assert(importCanonicalCandidate({ ...source, materializationBytes: textEncoder.encode(JSON.stringify(missing)) }).issues.length)
  const wrongSource = structuredClone(materialization)
  wrongSource.sourcePresentation.listeningExample.source.documentId = 'answers'
  assert(importCanonicalCandidate({ ...source, materializationBytes: textEncoder.encode(JSON.stringify(wrongSource)) }).issues.length)
  assert(importCanonicalCandidate(source, undefined, { materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef61 }).issues
    .some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
}
assert.equal(projectListeningGroupPresentation(studentListening).example.answer, 'C', 'legacy input keeps historical opening')
for (const side of ['left', 'right']) {
  const missingInput = sourceInput({ listening: false, mixedTable: false })
  const missing = JSON.parse(new TextDecoder().decode(missingInput.materializationBytes))
  const content = missing.groups.find(group => group.family === 'cloze').blocks[0].content
  if (side === 'left') content[0].text = content[0].text.trimEnd()
  else content[2].text = content[2].text.trimStart()
  missingInput.materializationBytes = textEncoder.encode(JSON.stringify(missing))
  const derived = importCanonicalCandidate(missingInput)
  assert.deepEqual(derived.issues, [], 'historical Candidate derivation remains unchanged')
  const request = materializeNck1CanonicalRequest(missingInput, confirmation(derived.candidate)).request
  assert.equal(compileCanonicalPaper(request).disposition, 'ready', 'signed confirmation replay remains valid')
  const rejected = admitCanonicalPaperImport({ request, sourceAssetVersion: 1 })
  assert.equal(rejected.ok, false)
  assert(rejected.diagnostics.some(issue => issue.code === 'INLINE_BLANK_SEPARATOR_MISSING'
    && issue.groupId === 'group:cloze' && issue.blockId === 'block:cloze'
    && issue.blankId === 'blank:41' && issue.questionId === 'question:41' && issue.side === side
    && issue.path.endsWith('.inlines[1]')),
    `freshly bound ${side}-missing source must fail spacing admission, not digest verification`)
}
assert.throws(
  () => materializeNck1CanonicalRequest(input),
  { code: 'TEACHER_CONFIRMATION_REQUIRED' },
)
const requestDirectory = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-request-'))
try {
  for (const [relativePath, bytes] of materialized.outputs) {
    writeFileSync(path.join(requestDirectory, relativePath), bytes)
  }
  const loaded = loadCanonicalImportRequest(path.join(
    requestDirectory,
    NCK1_MATERIALIZATION_REQUEST_FILE_NAME,
  ))
  const compilation = compileCanonicalPaper(loaded)
  assert(compilation.artifacts?.canonicalPaper)
  assert.deepEqual(
    compilation.artifacts.canonicalPaper,
    materialized.canonicalPaper,
  )
  const staleLoadedRequest = structuredClone(loaded)
  staleLoadedRequest.nck1MaterializationConfirmation.candidateDigest =
    `sha256:${'0'.repeat(64)}`
  const staleCompilation = compileCanonicalPaper(staleLoadedRequest)
  assert.equal(staleCompilation.disposition, 'unsupported')
} finally {
  rmSync(requestDirectory, { recursive: true, force: true })
}

// Spelling is an overlay, never a rewrite of the captured native document.
const spellingInput = sourceInput({ listening: false, mixedTable: false })
const spellingOriginal = JSON.parse(new TextDecoder().decode(spellingInput.materializationBytes))
const typo = 'Their fanily business is very much good. Zephyron stayed.'
const nativeBytes = new Uint8Array(execFileSync('python3', ['-c', `
import io, sys, zipfile
b = io.BytesIO()
with zipfile.ZipFile(b, 'w') as z:
    z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${typo}</w:t></w:r></w:p></w:body></w:document>')
sys.stdout.buffer.write(b.getvalue())
`]))
spellingInput.documents.push({ documentId: 'spelling-native', bytes: nativeBytes })
spellingOriginal.documents.push({ documentId: 'spelling-native', role: 'question_source',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sha256: sha256(nativeBytes), byteLength: nativeBytes.byteLength, pageCount: 1 })
spellingOriginal.groups[0].blocks[0].content = [{ kind: 'text', text: typo }]
spellingOriginal.groups[0].blocks[0].source = { kind: 'docx_part', documentId: 'spelling-native',
  part: 'word/document.xml', selector: '//w:p[contains(.,"Their fanily")]' }
spellingInput.materializationBytes = textEncoder.encode(JSON.stringify(spellingOriginal))
const report = prepareSpellingReview(spellingInput.materializationBytes)
assert(report.targets.every(target => target.decision === 'pending'), 'preparation never invents completed review')
report.reviewedBy = 'import_agent'
report.reviewedAt = '2026-09-21T00:00:00Z'
report.targets.forEach(target => { target.decision = 'unchanged' })
const correctedTarget = report.targets.find(target => target.before === typo)
correctedTarget.decision = 'uncertain'
correctedTarget.note = 'Zephyron may be a proper name; preserve it and continue to final preview.'
correctedTarget.corrections = [{ start: 6, before: 'fanily', after: 'family', category: 'spelling',
  certainty: 'unambiguous', reason: 'The context is a family-owned business; the source misspells family.' }]
spellingInput.spellingReviewBytes = textEncoder.encode(JSON.stringify(report))
const spellingDerived = deriveNck1MaterializationBundle(spellingInput)
assert.deepEqual(spellingDerived.issues, [])
assert.equal(spellingDerived.materialization.groups[0].blocks[0].content[0].text,
  'Their family business is very much good. Zephyron stayed.', 'repair spelling, preserve awkward grammar and doubtful name')
assert.equal(JSON.parse(new TextDecoder().decode(spellingInput.materializationBytes)).groups[0].blocks[0].content[0].text, typo)
assert.deepEqual(spellingInput.documents.at(-1).bytes, nativeBytes)
const spellingCandidate = importCanonicalCandidate(spellingInput)
assert.deepEqual(spellingCandidate.issues, [])
const spellingRequest = materializeNck1CanonicalRequest(spellingInput, confirmation(spellingCandidate.candidate))
assert.equal(compileCanonicalPaper(spellingRequest.request).disposition, 'ready', 'uncertainty must not block final candidate replay')
assert(JSON.stringify(spellingRequest.canonicalPaper).includes('Their family business'))
assert(spellingRequest.request.evidence.documents.some(document => document.inputKey === 'spelling_review'))
const spellingAdmission = admitCanonicalPaperImport({ request: spellingRequest.request, sourceAssetVersion: 1 })
assert.equal(spellingAdmission.ok, true, `spelling evidence must survive publication admission: ${JSON.stringify(spellingAdmission.diagnostics)}`)
const noOverlay = structuredClone(spellingInput)
delete noOverlay.spellingReviewBytes
assert.notEqual(importCanonicalCandidate(noOverlay).candidate.candidateDigest, spellingCandidate.candidate.candidateDigest)
const badOriginal = structuredClone(spellingInput)
const driftedOriginal = structuredClone(spellingOriginal)
driftedOriginal.groups[0].blocks[0].content[0].text = typo.replace('fanily', 'family')
badOriginal.materializationBytes = textEncoder.encode(JSON.stringify(driftedOriginal))
assert(importCanonicalCandidate(badOriginal).issues.some(issue => issue.code === 'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID'),
  'an overlay cannot bypass fidelity of the original DOCX transcription')
const preserveDoubts = structuredClone(report)
preserveDoubts.targets[0].corrections = []
assert.deepEqual(applySpellingReview(spellingInput.materializationBytes, textEncoder.encode(JSON.stringify(preserveDoubts))),
  spellingOriginal, 'a review containing only doubts continues with byte-for-byte unchanged text')
for (const mutate of [
  r => { r.materializationSha256 = `sha256:${'0'.repeat(64)}` },
  r => { r.targets.pop() },
  r => { r.targets[1] = r.targets[0] },
  r => { r.targets[0].decision = 'pending' },
  r => { r.targets[0].before += ' drift' },
  r => { r.targets[0].sourceLocator.documentId = 'wrong' },
  r => { r.targets[0].corrections[0].category = 'grammar' },
  r => { r.targets[0].corrections[0].after = 'better family' },
  r => { r.targets[0].corrections[0].start = 7; r.targets[0].corrections[0].before = 'anily' },
  r => { r.targets[0].corrections.push(r.targets[0].corrections[0]) },
]) {
  const invalid = structuredClone(report)
  mutate(invalid)
  assert.throws(() => applySpellingReview(spellingInput.materializationBytes, textEncoder.encode(JSON.stringify(invalid))))
}
const coverageFixture = { groups: [{ blocks: [{ columns: [{ blocks: [{ content: [{ text: 'nested prose' }] }] }] },
  { rows: [{ cells: [{ content: [{ text: 'table text' }] }] }] }, { caption: 'figure caption' }],
  questions: [{ stem: 'question stem', prompt: 'given word', options: [{ text: 'option text', label: 'A' }] }],
  optionBank: [{ text: 'bank choice' }], writingTask: { prompt: 'writing prompt', material: ['source story'],
    starters: ['starter line'], givenSkeleton: [{ text: 'Dear editor' }], officialModelAnswer: 'model answer' },
  groupId: 'never edit identity', source: { selector: 'never edit selector' } }],
  answers: [{ value: 'has  made' }, { value: 'A' }],
  listening: { questions: [{ stem: 'spoken question', options: [{ text: 'spoken option' }] }], transcript: [{ text: 'transcript text' }] } }
assert.deepEqual(enumerateSpellingTargets(coverageFixture).map(target => target.before), [
  'nested prose', 'table text', 'figure caption', 'question stem', 'given word', 'option text', 'bank choice',
  'writing prompt', 'source story', 'starter line', 'Dear editor', 'model answer', 'has  made',
  'spoken question', 'spoken option', 'transcript text',
], 'cover all schema text roles, excluding choice letters and identity/provenance')
const variableText = { groups: [{ questions: [{ options: [{ text: 'We accomodate fanily.' }] }] }], answers: [{ value: 'has  made' }] }
const variableBytes = textEncoder.encode(JSON.stringify(variableText))
const variableReport = prepareSpellingReview(variableBytes)
variableReport.reviewedBy = 'import_agent'
variableReport.reviewedAt = report.reviewedAt
variableReport.targets.forEach(target => { target.decision = 'unchanged' })
variableReport.targets[0].decision = 'correct'
variableReport.targets[0].corrections = [
  { ...correctedTarget.corrections[0], start: 3, before: 'accomodate', after: 'accommodate' },
  { ...correctedTarget.corrections[0], start: 14 },
]
const variableResult = applySpellingReview(variableBytes, textEncoder.encode(JSON.stringify(variableReport)))
assert.equal(variableResult.groups[0].questions[0].options[0].text, 'We accommodate family.',
  'later offsets refer to original text, even after a length-changing correction; options are not exempt')
assert.equal(variableResult.answers[0].value, 'has  made', 'untouched answer spacing stays exact')
const textReviewSource = { groups: [{ blocks: [{ content: [{ text: '😀 He braved trails and hardships.' }] }] }],
  answers: [{ value: 'has  made' }], listening: { questions: [{ stem: 'What problem does children have?' }] } }
const textReviewBytes = textEncoder.encode(JSON.stringify(textReviewSource))
const textReview = prepareSpellingReview(textReviewBytes, TEXT_REVIEW_POLICY_V2)
textReview.reviewedBy = 'import_agent'
textReview.reviewedAt = report.reviewedAt
textReview.targets.forEach(target => { target.decision = 'correct' })
textReview.targets[0].corrections = [{ start: 13, before: 'trails', after: 'trials', category: 'spelling', certainty: 'unambiguous', reason: '考验与磨难；真实单词也可能来自笔误。' }]
textReview.targets[1].corrections = [{ start: 3, before: '  ', after: ' ', category: 'whitespace', certainty: 'unambiguous', reason: '重复空格合并为一个，答案单词不变。' }]
textReview.targets[2].corrections = [{ start: 13, before: 'does', after: 'do', category: 'grammar', certainty: 'unambiguous', reason: '复数主语 children 应搭配 do。' }]
const applyTextReview = value => applySpellingReview(textReviewBytes, textEncoder.encode(JSON.stringify(value)))
const textReviewResult = applyTextReview(textReview)
assert.equal(textReviewResult.groups[0].blocks[0].content[0].text, '😀 He braved trials and hardships.', 'UTF-16 offset after astral character')
assert.equal(textReviewResult.answers[0].value, 'has made', 'authorized whitespace correction reaches answer projection')
assert.equal(textReviewResult.listening.questions[0].stem, 'What problem do children have?')
assert.equal(JSON.parse(new TextDecoder().decode(textReviewBytes)).answers[0].value, 'has  made', 'raw answer remains immutable')
for (const mutate of [
  r => { r.schemaVersion = 'spelling-only-v1' },
  r => { r.targets[0].corrections[0].start = 12 },
  r => { r.targets[1].corrections[0].before = ' ' },
  r => { r.targets[1].corrections[0].after = '' },
  r => { r.targets[1].corrections[0].after = '\t' },
  r => { r.targets[2].corrections[0].category = 'style' },
  r => { r.targets[2].corrections[0].after = 'do,' },
  r => { r.targets[2].corrections[0].before = 'oes'; r.targets[2].corrections[0].start = 14 },
  r => { r.targets[2].corrections.push(r.targets[2].corrections[0]) },
]) {
  const invalid = structuredClone(textReview)
  mutate(invalid)
  assert.throws(() => applyTextReview(invalid))
}
const phraseReview = structuredClone(textReview)
phraseReview.targets[2].corrections[0].before = 'does children'
phraseReview.targets[2].corrections[0].after = 'do children'
assert.deepEqual(applyTextReview(phraseReview), textReviewResult, 'grammar admits exact word phrases, without punctuation edits')
const v2Input = { ...spellingInput, spellingReviewBytes: textEncoder.encode(JSON.stringify({ ...report, schemaVersion: TEXT_REVIEW_POLICY_V2 })) }
const v2Candidate = importCanonicalCandidate(v2Input)
assert.deepEqual(v2Candidate.issues, [])
const v2Request = materializeNck1CanonicalRequest(v2Input, confirmation(v2Candidate.candidate))
assert.equal(compileCanonicalPaper(v2Request.request).disposition, 'ready', 'v2 evidence survives canonical replay')
assert.equal(admitCanonicalPaperImport({ request: v2Request.request, sourceAssetVersion: 1 }).ok, true)
// v3 admits only the bounded punctuation operations. Keep v2's exact policy
// and replay, and reject wording changes disguised as punctuation fixes.
const punctuationCases = [
  ['😀 extreme“poverty training”method', '😀 extreme “poverty training” method'],
  ['The term“Silk Road”', 'The term “Silk Road”'],
  ['“He just reacted. ”', '“He just reacted.”'],
  ['“ School Is Out—Play Is In”?', '“School Is Out – Play Is In”?'],
  ['silk—then a rare fabric—was', 'silk – then a rare fabric – was'],
  ['a (toilet)—particularly useful', 'a (toilet) – particularly useful'],
  ['in 2024—his first year', 'in 2024 – his first year'],
]
for (const [before, after] of punctuationCases) {
  const bytes = textEncoder.encode(JSON.stringify({ groups: [{ blocks: [{ content: [{ text: before }] }] }] }))
  const reviewed = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
  reviewed.reviewedBy = 'import_agent'
  reviewed.reviewedAt = report.reviewedAt
  reviewed.targets[0].decision = 'correct'
  reviewed.targets[0].corrections = [{ start: 0, before, after, category: 'punctuation', certainty: 'unambiguous', reason: '仅修正英文标点与空格，词句不变。' }]
  const apply = value => applySpellingReview(bytes, textEncoder.encode(JSON.stringify(value)))
  assert.equal(apply(reviewed).groups[0].blocks[0].content[0].text, after)
  assert.throws(() => apply({ ...reviewed, schemaVersion: TEXT_REVIEW_POLICY_V2 }), /only exact/)
  assert.throws(() => apply({ ...reviewed, schemaVersion: 'spelling-only-v1' }), /only exact/)
  for (const replacement of [after + ' changed', after.replace('“', '"'), after.replace('”?', '” ?')]) {
    if (replacement === after) continue
    const invalid = structuredClone(reviewed)
    invalid.targets[0].corrections[0].after = replacement
    assert.throws(() => apply(invalid), /only exact/)
  }
}
for (const [before, after] of [
  ['cookie-dough', 'cookie – dough'],
  ['Group（CPG）,', 'Group (CPG),'],
  ['It is “fine”.', 'It is “fine” .'],
  ['said “yes”', 'said “no”'],
  ['Range 1—3', 'Range 1 – 3'],
  ['Note 中文—中文', 'Note 中文 – 中文'],
  ['word—中文', 'word – 中文'],
  ['中文—word', '中文 – word'],
  ['Bare —', 'Bare  – '],
]) {
  const bytes = textEncoder.encode(JSON.stringify({ groups: [{ blocks: [{ content: [{ text: before }] }] }] }))
  const reviewed = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
  reviewed.reviewedBy = 'import_agent'
  reviewed.reviewedAt = report.reviewedAt
  reviewed.targets[0].decision = 'correct'
  reviewed.targets[0].corrections = [{ start: 0, before, after, category: 'punctuation', certainty: 'unambiguous', reason: '故意越界的回归用例。' }]
  assert.throws(() => applySpellingReview(bytes, textEncoder.encode(JSON.stringify(reviewed))), /only exact/)
}
const v3Input = { ...spellingInput, spellingReviewBytes: textEncoder.encode(JSON.stringify({ ...report, schemaVersion: TEXT_REVIEW_POLICY })) }
const v3Candidate = importCanonicalCandidate(v3Input)
assert.deepEqual(v3Candidate.issues, [])
const v3Request = materializeNck1CanonicalRequest(v3Input, confirmation(v3Candidate.candidate))
assert.equal(compileCanonicalPaper(v3Request.request).disposition, 'ready', 'v3 evidence survives canonical replay')
assert.equal(admitCanonicalPaperImport({ request: v3Request.request, sourceAssetVersion: 1 }).ok, true)

const tabbedSource = { groups: [{ questions: [{ options: [{ text: 'Imaginary. \t\t' }] }] }], answers: [{ value: 'has  made' }] }
const tabbedBytes = textEncoder.encode(JSON.stringify(tabbedSource))
const terminalReview = prepareSpellingReview(tabbedBytes, TEXT_REVIEW_POLICY_V4)
terminalReview.reviewedBy = 'import_agent'
terminalReview.reviewedAt = report.reviewedAt
terminalReview.targets.forEach(target => { target.decision = 'unchanged' })
terminalReview.targets[0].decision = 'correct'
terminalReview.targets[0].corrections = [{
  start: 10, before: ' \t\t', after: '', category: 'terminal_whitespace',
  certainty: 'unambiguous', reason: '原 DOCX 选项段末的制表符不是可见选项文字。',
  sourceParagraphLocator: 'word/document.xml#w:p[158]',
}]
const applyTerminalReview = value => applySpellingReview(tabbedBytes, textEncoder.encode(JSON.stringify(value)))
assert.equal(applyTerminalReview(terminalReview).groups[0].questions[0].options[0].text, 'Imaginary.')
assert.equal(applyTerminalReview(terminalReview).answers[0].value, 'has  made', 'answer text is outside the correction')
assert.equal(JSON.parse(new TextDecoder().decode(tabbedBytes)).groups[0].questions[0].options[0].text,
  'Imaginary. \t\t', 'raw materialization stays unchanged')
assert.throws(() => applyTerminalReview({ ...terminalReview, schemaVersion: TEXT_REVIEW_POLICY }), /only exact/)
for (const mutate of [
  r => { r.targets[0].corrections[0].start = 9 },
  r => { r.targets[0].corrections[0].before = '\t\t' },
  r => { r.targets[0].corrections[0].after = ' ' },
  r => { r.targets[0].corrections[0].reason = 'English only' },
  r => { r.targets[0].corrections[0].sourceParagraphLocator = 'word/document.xml#w:p[0]' },
  r => { delete r.targets[0].corrections[0].sourceParagraphLocator },
  r => { r.targets[1].decision = 'correct'; r.targets[1].corrections = [structuredClone(r.targets[0].corrections[0])] },
]) {
  const invalid = structuredClone(terminalReview)
  mutate(invalid)
  assert.throws(() => applyTerminalReview(invalid), /only exact/, 'v4 accepts only the complete option tail with a DOCX paragraph locator')
}
const docxFixture = makeSyntheticNck1DocxFixture({
  transformXml: xml => xml.replace('A. Alpha  B.', 'A. Alpha \t\tB.'),
})
const docxParagraphs = extractDocxDocumentParagraphs(docxFixture.questionBytes)
const optionParagraphIndex = docxParagraphs.findIndex(paragraph => paragraph.text.includes('A. Alpha \t\tB.')) + 1
assert(optionParagraphIndex > 1, 'synthetic DOCX has a distinct question stem and option paragraph')
const nativeOptionSource = {
  documents: [docxFixture.manifest.documents[0]],
  groups: [{ questions: [{
    source: { kind: 'docx_part', documentId: 'question-source-1', part: 'word/document.xml', selector: `(/w:document/w:body//w:p)[${optionParagraphIndex - 1}]` },
    options: [{ label: 'A', text: 'Alpha \t\t' }],
  }] }],
}
const nativeOptionBytes = textEncoder.encode(JSON.stringify(nativeOptionSource))
const nativeReview = prepareSpellingReview(nativeOptionBytes, TEXT_REVIEW_POLICY_V4)
nativeReview.reviewedBy = 'import_agent'
nativeReview.reviewedAt = report.reviewedAt
nativeReview.targets[0].decision = 'correct'
nativeReview.targets[0].corrections = [{ ...terminalReview.targets[0].corrections[0], start: 5,
  sourceParagraphLocator: `word/document.xml#w:p[${optionParagraphIndex}]` }]
const nativeReviewBytes = textEncoder.encode(JSON.stringify(nativeReview))
assert.equal(applySpellingReview(nativeOptionBytes, nativeReviewBytes).groups[0].questions[0].options[0].text, 'Alpha')
assert.doesNotThrow(() => verifyTerminalWhitespaceSourceEvidence(nativeOptionBytes, nativeReviewBytes, docxFixture.sourceDocuments))
for (const mutate of [
  r => { r.targets[0].corrections[0].sourceParagraphLocator = 'word/document.xml#w:p[999999]' },
  r => { r.targets[0].corrections[0].sourceParagraphLocator = `word/document.xml#w:p[${optionParagraphIndex - 1}]` },
  r => { r.targets[0].before = 'Bravo \t\t' },
  r => { r.targets[0].sourceLocator.documentId = 'official-answers-2' },
]) {
  const invalid = structuredClone(nativeReview)
  mutate(invalid)
  assert.throws(() => verifyTerminalWhitespaceSourceEvidence(nativeOptionBytes, textEncoder.encode(JSON.stringify(invalid)), docxFixture.sourceDocuments), /Spelling review:/)
}
assert.throws(() => verifyTerminalWhitespaceSourceEvidence(nativeOptionBytes, nativeReviewBytes, []), /source DOCX is unavailable/)
const duplicateDocxFixture = makeSyntheticNck1DocxFixture({
  transformXml: xml => xml.replace('A. Alpha  B.', 'A. Alpha \t\tB.')
    .replace('</w:body>', '<w:p><w:r><w:t>A. Alpha \t\tB.</w:t></w:r></w:p></w:body>'),
})
const duplicateSource = structuredClone(nativeOptionSource)
duplicateSource.documents = [duplicateDocxFixture.manifest.documents[0]]
const duplicateBytes = textEncoder.encode(JSON.stringify(duplicateSource))
const duplicateReview = prepareSpellingReview(duplicateBytes, TEXT_REVIEW_POLICY_V4)
duplicateReview.reviewedBy = 'import_agent'
duplicateReview.reviewedAt = report.reviewedAt
duplicateReview.targets[0].decision = 'correct'
duplicateReview.targets[0].corrections = structuredClone(nativeReview.targets[0].corrections)
assert.throws(() => verifyTerminalWhitespaceSourceEvidence(
  duplicateBytes, textEncoder.encode(JSON.stringify(duplicateReview)), duplicateDocxFixture.sourceDocuments,
), /source paragraph does not contain the exact option/, 'matching text in another DOCX paragraph cannot impersonate the option')
const narrativeDocxFixture = makeSyntheticNck1DocxFixture({
  transformXml: xml => xml.replace('A. Alpha  B.', 'Do not select A. Alpha \t\tB. in this example'),
})
const narrativeSource = structuredClone(nativeOptionSource)
narrativeSource.documents = [narrativeDocxFixture.manifest.documents[0]]
const narrativeBytes = textEncoder.encode(JSON.stringify(narrativeSource))
const narrativeReview = prepareSpellingReview(narrativeBytes, TEXT_REVIEW_POLICY_V4)
narrativeReview.reviewedBy = 'import_agent'
narrativeReview.reviewedAt = report.reviewedAt
narrativeReview.targets[0].decision = 'correct'
narrativeReview.targets[0].corrections = structuredClone(nativeReview.targets[0].corrections)
assert.throws(() => verifyTerminalWhitespaceSourceEvidence(
  narrativeBytes, textEncoder.encode(JSON.stringify(narrativeReview)), narrativeDocxFixture.sourceDocuments,
), /source paragraph does not contain the exact option/, 'an unrelated prose paragraph cannot impersonate an option line')
const tamperedSpellingRequest = structuredClone(spellingRequest.request)
tamperedSpellingRequest.evidence.documents.find(document => document.inputKey === 'spelling_review').bytes[0] ^= 1
const tamperedSpellingCompilation = compileCanonicalPaper(tamperedSpellingRequest)
assert.notEqual(tamperedSpellingCompilation.disposition, 'ready', 'replay must reject a changed report')
assert(!tamperedSpellingCompilation.artifacts?.canonicalPaper, 'changed evidence cannot produce a paper')

// Exercise real local CLI prepare/finalize/verify and the downstream loader.
const spellingDir = path.join(import.meta.dirname, `import-pipeline/papers/paper-spelling-test-${process.pid}`)
mkdirSync(spellingDir)
try {
  const paperId = path.basename(spellingDir)
  const localOriginal = { ...spellingOriginal, paperId }
  const localBytes = textEncoder.encode(JSON.stringify(localOriginal))
  writeFileSync(path.join(spellingDir, 'materialization.json'), localBytes)
  writeFileSync(path.join(spellingDir, 'config.json'), JSON.stringify({ paperId,
    importProfile: 'public-paper-v1', spellingReview: 'spelling-only-v1' }))
  writeFileSync(path.join(spellingDir, 'universal-source-manifest.json'), JSON.stringify({
    schemaVersion: 'universal-nck1-source-manifest-v1', paperId, materializationPath: 'materialization.json',
    mediaDirectory: 'media', documents: localOriginal.documents.map(doc => ({ ...doc, path: `${doc.documentId}.bin` })),
  }))
  for (const document of spellingInput.documents) writeFileSync(path.join(spellingDir, `${document.documentId}.bin`), document.bytes)
  assert.throws(() => loadNck1ReviewSource(spellingDir), /required review is missing/)
  assert.equal(loadSpellingReview(spellingDir, {}), null, 'historical workspaces remain compatible')
  const cli = (...args) => execFileSync(process.execPath, [path.join(import.meta.dirname, 'import-pipeline/review.mjs'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const requestPath = path.join(spellingDir, 'request.json')
  cli('prepare-spelling', paperId, '--output', requestPath)
  const prepared = JSON.parse(readFileSync(requestPath, 'utf8'))
  assert.equal(prepared.report.reviewedBy, null)
  const localReport = { ...report, materializationSha256: sha256(localBytes) }
  writeFileSync(path.join(spellingDir, 'authored.json'), JSON.stringify(localReport))
  const finalized = JSON.parse(cli('finalize-spelling', paperId, '--input', path.join(spellingDir, 'authored.json')))
  assert.equal(finalized.status, 'PASS')
  assert.equal(finalized.nonBlockingDoubts.length, 1)
  assert.equal(finalized.corrections, 1)
  assert.equal(JSON.parse(cli('verify-spelling', paperId)).candidateDigest, finalized.candidateDigest)
  assert.equal(loadNck1ReviewSource(spellingDir).materialization.groups[0].blocks[0].content[0].text,
    'Their family business is very much good. Zephyron stayed.')
  assert.deepEqual(loadNck1ReviewSource(spellingDir).spellingReviewSummary, {
    corrections: 1, nonBlockingDoubts: finalized.nonBlockingDoubts,
  }, 'final push handoff re-derives doubts from retained evidence, without relying on earlier logs')
  assert.equal(sha256(new Uint8Array(readFileSync(path.join(spellingDir, 'materialization.json')))), sha256(localBytes))
  assert(readFileSync(path.join(spellingDir, SPELLING_REVIEW_FILE), 'utf8').includes('fanily'))
  writeFileSync(path.join(spellingDir, 'config.json'), JSON.stringify({ paperId, importProfile: 'public-paper-v1', spellingReview: TEXT_REVIEW_POLICY }))
  assert.throws(() => loadNck1ReviewSource(spellingDir), /policy differs/, 'new policy cannot silently accept old attestations')
  assert.throws(() => cli('finalize-spelling', paperId, '--input', path.join(spellingDir, 'authored.json')), /policy differs/)
  cli('prepare-spelling', paperId, '--output', path.join(spellingDir, 'request-v2.json'))
  const preparedV2 = JSON.parse(readFileSync(path.join(spellingDir, 'request-v2.json'), 'utf8'))
  assert.equal(preparedV2.report.schemaVersion, TEXT_REVIEW_POLICY)
  assert(preparedV2.instructions.includes('obvious grammar errors'))
  writeFileSync(path.join(spellingDir, 'authored-v2.json'), JSON.stringify({ ...localReport, schemaVersion: TEXT_REVIEW_POLICY }))
  const oldReviewBytes = readFileSync(path.join(spellingDir, SPELLING_REVIEW_FILE))
  const finalizedV2 = JSON.parse(cli('finalize-spelling', paperId, '--input', path.join(spellingDir, 'authored-v2.json')))
  const archivedPath = path.join(spellingDir, 'spelling-review-history', `${sha256(new Uint8Array(oldReviewBytes)).slice(7)}.json`)
  assert.deepEqual(readFileSync(archivedPath), oldReviewBytes, 'finalization preserves exact old attestation before replacing active sidecar')
  cli('finalize-spelling', paperId, '--input', path.join(spellingDir, 'authored-v2.json'))
  assert.deepEqual(readFileSync(archivedPath), oldReviewBytes, 'same-byte finalization never rewrites old evidence')
  assert.equal(JSON.parse(cli('verify-spelling', paperId)).candidateDigest, finalizedV2.candidateDigest)
  writeFileSync(path.join(spellingDir, 'config.json'), JSON.stringify({ paperId, importProfile: 'public-paper-v1', spellingReview: TEXT_REVIEW_POLICY_V4 }))
  assert.throws(() => loadNck1ReviewSource(spellingDir), /policy differs/, 'v4 cannot silently reinterpret v3 review')
  cli('prepare-spelling', paperId, '--output', path.join(spellingDir, 'request-v4.json'))
  const preparedV4 = JSON.parse(readFileSync(path.join(spellingDir, 'request-v4.json'), 'utf8'))
  assert.equal(preparedV4.report.schemaVersion, TEXT_REVIEW_POLICY_V4)
  assert(preparedV4.instructions.includes('terminal_whitespace'))
  writeFileSync(path.join(spellingDir, 'authored-v4.json'), JSON.stringify({ ...localReport, schemaVersion: TEXT_REVIEW_POLICY_V4 }))
  const v3ReviewBytes = readFileSync(path.join(spellingDir, SPELLING_REVIEW_FILE))
  const finalizedV4 = JSON.parse(cli('finalize-spelling', paperId, '--input', path.join(spellingDir, 'authored-v4.json')))
  assert.deepEqual(readFileSync(path.join(spellingDir, 'spelling-review-history', `${sha256(new Uint8Array(v3ReviewBytes)).slice(7)}.json`)), v3ReviewBytes)
  assert.equal(JSON.parse(cli('verify-spelling', paperId)).candidateDigest, finalizedV4.candidateDigest)
  mkdirSync(path.join(spellingDir, 'replay'))
  for (const [name, bytes] of spellingRequest.outputs) writeFileSync(path.join(spellingDir, 'replay', name), bytes)
  assert.equal(compileCanonicalPaper(loadCanonicalImportRequest(path.join(spellingDir, 'replay', NCK1_MATERIALIZATION_REQUEST_FILE_NAME))).disposition, 'ready')
} finally {
  rmSync(spellingDir, { recursive: true, force: true })
}

const reportDir = mkdtempSync(path.join(tmpdir(), 'preprocessing-report-'))
try {
  const projection = { paperId: 'paper-report-test', sourceDigest: sha256(spellingInput.materializationBytes),
    candidateDigest: sha256(textEncoder.encode('corrected candidate')),
    sourceInput: { spellingReviewBytes: textEncoder.encode(JSON.stringify(report)) } }
  const evidence = { schemaVersion: 'preprocessing-handoff-evidence-v1',
    paperId: projection.paperId, sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest }
  const reviewStatus = { paperId: projection.paperId, revisions: [{ id: 'rev-current',
    paperId: projection.paperId, reviewKind: 'candidate', state: 'awaiting_review',
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest }] }
  const render = (value, status = reviewStatus) => buildPreprocessingReport(projection, value, {
    baseDirectory: reportDir, reviewStatus: status,
  })
  const markdown = render(evidence)
  assert(markdown.includes('fanily') && markdown.includes('family'))
  assert(markdown.includes('保留原文的疑点') && markdown.includes(report.targets.find(t => t.decision === 'uncertain').note))
  assert(markdown.includes('尚未齐全') && markdown.includes('未检查'), 'missing evidence is not a pass')
  const modernMarkdown = buildPreprocessingReport({ ...projection, sourceInput: { spellingReviewBytes: textEncoder.encode(JSON.stringify(textReview)) } }, evidence)
  assert(modernMarkdown.includes('明确语法及重复空格审校') && modernMarkdown.includes('| ␠␠ | ␠ |'))
  assert(modernMarkdown.includes('| 明确语法 | does | do |'))
  assert(!modernMarkdown.includes('不地道表达、语法润色'), 'modern report does not claim obvious grammar is out of scope')
  assert.throws(() => render({ ...evidence, candidateDigest: sha256(textEncoder.encode('old')) }), /stale candidateDigest/)
  const screen = { revisionId: 'rev-current', url: 'https://example.onamp.dev/?view=paper-browse&paperId=paper-report-test&reviewRevision=rev-current' }
  assert(render({ ...evidence, screen }).includes('打开 Screen'))
  for (const url of [screen.url + '&token=secret', screen.url.replace('paper-report-test', 'other'),
    screen.url.replace('rev-current', 'rev-old'), screen.url.replace('https://', 'https://user:secret@')]) {
    assert.throws(() => render({ ...evidence, screen: { ...screen, url } }), /Screen URL/)
  }
  writeFileSync(path.join(reportDir, 'proof.txt'), 'checked source')
  const proof = { path: 'proof.txt', sha256: sha256(new Uint8Array(readFileSync(path.join(reportDir, 'proof.txt')))) }
  const checks = { sourceExtraction: { status: 'pass', detail: 'Source compared', checkedAt: '2026-09-21T00:00:00Z', files: [proof] } }
  assert(render({ ...evidence, checks }).includes('已完成（Agent 检查记录）'))
  writeFileSync(path.join(reportDir, 'proof.txt'), 'changed source')
  assert.throws(() => render({ ...evidence, checks }), /file evidence changed/)
  assert.throws(() => render({ ...evidence, checks: { sourceExtraction: { status: 'pass', detail: 'claim only' } } }), /dated retained evidence/)
  // Minimal valid blank PDFs exercise actual pdfinfo page counting without rendering.
  function pdfFixture(pages, edition = 'cover8') {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`,
      ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>')]
    let bytes = `%PDF-1.4\n% ${edition}\n`
    const offsets = [0]
    objects.forEach((object, i) => { offsets.push(Buffer.byteLength(bytes)); bytes += `${i + 1} 0 obj\n${object}\nendobj\n` })
    const xref = Buffer.byteLength(bytes)
    bytes += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const fileName = `${edition}.pdf`
    writeFileSync(path.join(reportDir, fileName), bytes)
    return { edition, path: fileName, sha256: sha256(new Uint8Array(Buffer.from(bytes))) }
  }
  assert(render({ ...evidence, pdfs: [pdfFixture(8)] }).includes('1/4 份'))
  assert.throws(() => render({ ...evidence, pdfs: [pdfFixture(9)] }), /page count differs/)
  const longEvidence = { ...evidence, schemaVersion: 'preprocessing-handoff-evidence-v2' }
  assert(render({ ...longEvidence, pdfs: [pdfFixture(9, 'cover-long10')] }).includes('9 |'))
  assert.throws(() => render({ ...longEvidence, pdfs: [pdfFixture(11, 'cover-long10')] }), /page count differs/)
  assert(render({ ...longEvidence, pdfs: [pdfFixture(12, 'cover-long12')] }).includes('12 |'))
  assert.throws(() => render({ ...longEvidence, pdfs: [pdfFixture(13, 'cover-long12')] }), /page count differs/)
  assert.throws(() => render({ ...evidence, pdfs: [pdfFixture(9, 'cover-long10')] }), /invalid or duplicate PDF editions/)
  const longPdfs = [pdfFixture(9, 'cover-long10'), pdfFixture(12, 'cover-long12'),
    pdfFixture(9, 'no-cover-long10'), pdfFixture(11, 'no-cover-long12')]
  assert.throws(() => render({ ...longEvidence, pdfs: longPdfs }), /pdfContent PASS must bind every delivered PDF/)
  const pdfCheck = { status: 'pass', detail: '逐版核对内容与同页性',
    checkedAt: '2026-09-23T00:00:00Z', files: longPdfs }
  const completeLongEvidence = { ...longEvidence, pdfs: longPdfs,
    checks: { pdfContent: pdfCheck, pdfVisual: pdfCheck } }
  assert(render(completeLongEvidence).includes('4/4 份'))
  assert.throws(() => render({ ...completeLongEvidence, checks: {
    ...completeLongEvidence.checks, pdfVisual: { ...pdfCheck, files: longPdfs.slice(0, 3) },
  } }), /pdfVisual PASS must bind every delivered PDF/)
  assert.throws(() => render({ ...completeLongEvidence, pdfs: [longPdfs[0],
    { ...longPdfs[1], sha256: longPdfs[0].sha256 }, ...longPdfs.slice(2)] }), /distinct PDF bytes/)
  const productEvidence = { ...evidence, schemaVersion: 'preprocessing-handoff-evidence-v3' }
  assert(render(productEvidence).includes('0/3 份'))
  for (const [edition, pages, accepted] of [
    ['economy8', 7, false], ['economy8', 8, true], ['economy8', 9, false],
    ['largeNoListening', 9, true], ['largeNoListening', 10, true], ['largeNoListening', 11, false],
    ['largeComplete', 11, true], ['largeComplete', 12, true], ['largeComplete', 13, false],
  ]) {
    const input = { ...productEvidence, pdfs: [pdfFixture(pages, edition)] }
    if (accepted) assert(render(input).includes(`${pages} |`))
    else assert.throws(() => render(input), /page count differs/)
  }
  assert.throws(() => render({ ...evidence, pdfs: [pdfFixture(8, 'economy8')] }), /invalid or duplicate PDF editions/)
  assert.throws(() => render({ ...productEvidence, pdfs: [pdfFixture(8, 'cover8')] }), /invalid or duplicate PDF editions/)
  const productPdfs = [pdfFixture(8, 'economy8'), pdfFixture(9, 'largeNoListening'), pdfFixture(11, 'largeComplete')]
  assert.throws(() => render({ ...productEvidence, pdfs: productPdfs }), /pdfContent PASS must bind every delivered PDF/)
  const productCheck = { ...pdfCheck, files: productPdfs }
  const completeProducts = { ...productEvidence, pdfs: productPdfs,
    checks: { pdfContent: productCheck, pdfVisual: productCheck } }
  assert(render(completeProducts).includes('三版 PDF 与 Screen'))
  assert(render(completeProducts).includes('3/3 份'))
  assert.throws(() => render({ ...completeProducts, checks: {
    ...completeProducts.checks, pdfVisual: { ...productCheck, files: productPdfs.slice(0, 2) },
  } }), /pdfVisual PASS must bind every delivered PDF/)
  assert.throws(() => render({ ...productEvidence, pdfs: [productPdfs[0], productPdfs[0]] }), /invalid or duplicate PDF editions/)
  const fourEvidence = { ...evidence, schemaVersion: 'preprocessing-handoff-evidence-v4' }
  const fourPdfs = [...productPdfs, pdfFixture(13, 'answerOnly')]
  const fourCheck = { ...pdfCheck, files: fourPdfs }
  const fourComplete = { ...fourEvidence, pdfs: fourPdfs,
    checks: { pdfContent: fourCheck, pdfVisual: fourCheck } }
  assert(render(fourComplete).includes('4/4 份'))
  assert(render(fourComplete).includes('纯答案版'))
  assert(render({ ...fourEvidence, pdfs: productPdfs }).includes('尚未齐全'))
  assert.throws(() => render({ ...fourComplete, checks: {
    ...fourComplete.checks, pdfVisual: productCheck,
  } }), /pdfVisual PASS must bind every delivered PDF/)
  assert.throws(() => render({ ...productEvidence, pdfs: [fourPdfs[3]] }), /invalid or duplicate PDF editions/,
    'historical three-product reports retain their version contract')
  const staleScreen = { revisionId: 'rev-old', url: screen.url.replace('rev-current', 'rev-old') }
  assert.throws(() => render({ ...fourEvidence, screen: staleScreen }), /Screen revision/,
    'matching caller-supplied revision strings do not prove a current Candidate binding')
  assert.throws(() => render({ ...fourEvidence, screen }, null), /Screen revision/)
  for (const change of [{ sourceDigest: 'stale-source' }, { candidateDigest: 'stale-candidate' },
    { paperId: 'paper-other' }, { reviewKind: 'ocr' }, { state: 'uploading' }]) {
    assert.throws(() => render({ ...fourEvidence, screen }, { ...reviewStatus,
      revisions: [{ ...reviewStatus.revisions[0], ...change }] }), /Screen revision/)
  }
  for (const host of ['127.0.0.1:51778', '[::1]:51778', 'localhost:51778']) {
    const localScreen = { ...screen, url: screen.url.replace('https://example.onamp.dev', `http://${host}`) }
    assert(render({ ...fourEvidence, screen: localScreen }).includes('本机 loopback'))
    assert.throws(() => render({ ...productEvidence, screen: localScreen }), /Screen URL/)
    for (const url of [localScreen.url + '&token=secret', localScreen.url + '&reviewRevision=rev-current',
      localScreen.url.replace('rev-current', 'rev-old'), localScreen.url.replace('http://', 'http://user:secret@'),
      localScreen.url + '#secret']) {
      assert.throws(() => render({ ...fourEvidence, screen: { ...localScreen, url } }), /Screen URL/)
    }
  }
  for (const host of ['example.com', 'localhost.example.com', '192.168.1.10', '0.0.0.0']) {
    assert.throws(() => render({ ...fourEvidence, screen: { ...screen,
      url: screen.url.replace('https://example.onamp.dev', `http://${host}`) } }), /Screen URL/)
  }
} finally {
  rmSync(reportDir, { recursive: true, force: true })
}

const glossExamples = [
  ['amid（在……之中）the', 'amid (在……之中) the'],
  ['word（𠀀、﨑、〇）next', 'word (𠀀、﨑、〇) next'],
  ['metaphorical(比喻性的)title', 'metaphorical (比喻性的) title'],
  ['word  （  甲、乙；丙—丁  ）  next', 'word (甲、乙；丙—丁) next'],
  ['word(释义)2026', 'word (释义) 2026'],
  ['word (释义)   ', 'word (释义)'],
  ['word（释义）—next', 'word (释义)—next'],
  ['word（释义）  – next', 'word (释义)  – next'],
  ['well-being（幸福）matters', 'well-being (幸福) matters'],
  ["one's（某人的）work", 'one’s (某人的) work'],
  ['word（释义）next（下一项）end', 'word (释义) next (下一项) end'],
  ...['这是（中文）说明。', 'word(hold)', '(1) First', 'word（译文 mixed）next',
    'word（图1）next', 'word（…）next', 'word（释义)next', 'word（释（义））next',
    'word\n（释义）next', 'word（释\n义）next', '中文word（释义）next', '𠀀word（释义）next']
    .map(text => [text, text]),
  ...[',', '.', ';', ':', '!', '?'].map(mark => [`word（释义）  ${mark} next`, `word (释义)${mark} next`]),
]
for (const [before, after] of glossExamples) {
  assert.equal(typography(before, '3'), after, before)
  assert.equal(replayTypography(before, '3'), after, `independent replay: ${before}`)
  assert.equal(typography(after, '3'), after, `idempotence: ${before}`)
}
assert.equal(typography('amid（在……之中）the'), 'amid（在……之中）the', 'v2 remains immutable')
assert.equal(replayTypography('word（释义）next', '2'), 'word (释义)next')
assert.equal(replayTypography('这是（中文）说明。', '1'), '这是(中文)说明。')
const glossInput = sourceInput({ listening: false, mixedTable: false })
const glossMaterialization = JSON.parse(new TextDecoder().decode(glossInput.materializationBytes))
const glossBefore = 'Walk amid（在……之中）trees; metaphorical(比喻性的)title.'
glossMaterialization.groups[0].blocks[0].content = [{ kind: 'text', text: glossBefore }]
glossInput.materializationBytes = textEncoder.encode(JSON.stringify(glossMaterialization))
const glossCandidate = importCanonicalCandidate(glossInput).candidate
const glossRequest = materializeNck1CanonicalRequest(glossInput, confirmation(glossCandidate))
const glossCompiled = compileCanonicalPaper(glossRequest.request)
assert.equal(glossCompiled.disposition, 'ready')
assert(JSON.stringify(glossCompiled.artifacts.canonicalPaper).includes('Walk amid (在……之中) trees; metaphorical (比喻性的) title.'))
assert(glossCompiled.artifacts.normalizationReport.transformationRecords.some(record =>
  record.ruleId === 'canonical-visible-typography' && record.ruleVersion === '3' && record.before === glossBefore))
// Reconstruct the historical Candidate identity, not a new request relabelled v54.
const { candidateDigest: _digest, sourceInput: _input, ...historicalBody } = glossCandidate
historicalBody.authority = nck1MaterializationHistoricalAuthorityRef54
const historicalCandidate = { ...historicalBody, candidateDigest: digestJson(historicalBody), sourceInput: glossInput }
const historicalRequest = { ...glossRequest.request, authority: nck1MaterializationHistoricalAuthorityRef54,
  nck1MaterializationConfirmation: confirmation(historicalCandidate) }
const historicalCompiled = compileCanonicalPaper(historicalRequest)
assert.equal(historicalCompiled.disposition, 'ready', JSON.stringify(historicalCompiled.artifacts.normalizationReport.diagnostics))
assert(JSON.stringify(historicalCompiled.artifacts.canonicalPaper).includes(glossBefore), 'v54 preserves the old unhandled cases')
assert.equal(admitCanonicalPaperImport({ request: historicalRequest, sourceAssetVersion: 1 }).ok, true)
assert.equal(compileCanonicalPaper({ ...glossRequest.request, authority: nck1MaterializationHistoricalAuthorityRef54 }).disposition, 'unsupported', 'authority substitution cannot reuse a current confirmation')

await import('./verify-docx-source-emphasis.mjs')
console.log('verify-paper-canonical-nck1-materialization-candidate: PASS (spelling/report evidence; gloss v3 boundaries, idempotence, compiled lineage and historical replay)')
