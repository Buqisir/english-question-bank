import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  canonicalAuthorityRef,
  nck1MaterializationCandidateAuthorityRef,
  resolveCanonicalAuthority,
  trustedDocxCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import {
  compileCanonicalPaper,
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import manifestV46 from '../standards/paper-canonical/manifest-v46.json' with { type: 'json' }
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import {
  NCK1_MATERIALIZATION_REQUEST_FILE_NAME,
  materializeNck1CanonicalRequest,
} from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  paragraphMatchesOneDocxParagraph,
  resolveDocxParagraphSelector,
  sourceOrderedParagraphEntries,
  validateDocxParagraphBindings,
} from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

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
assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(trustedDocxCandidateAuthorityRef.manifestVersion, '37')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '47')
assert.equal(resolveCanonicalAuthority({
  manifestId: manifestV46.manifestId,
  manifestVersion: manifestV46.version,
  manifestDigest: digestJson(manifestV46),
}).ok, true, 'immutable NCK1 Candidate authority v46 remains resolvable')
const first = importCanonicalCandidate(input)
const second = importCanonicalCandidate(input)
assert(first.candidate)
assert.deepEqual(first.issues, [])
assert.equal(first.candidate.candidateDigest, second.candidate.candidateDigest)
assert.equal(first.candidate.interpretation.groups.length, 9)
assert.equal(first.candidate.interpretation.assertions.length, 65)
assert.equal(first.candidate.interpretation.inactiveSourceClosures.length, 2)
assert.equal(first.candidate.interpretation.groups[0].media.length, 1)
assert.deepEqual(
  first.candidate.interpretation.groups[0].content.blocks
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

const publicV47 = compileCanonicalPaper({
  authority: nck1MaterializationCandidateAuthorityRef,
  evidence: { documents: [] },
})
assert(publicV47.artifacts.normalizationReport.diagnostics.some((item) =>
  item.code === 'AUTHORITY_RETIRED'))

const confirmed = rederiveConfirmedCanonicalCandidate(
  first.candidate,
  confirmation(first.candidate),
)
assert(confirmed.compilation?.artifacts?.canonicalPaper)
assert.equal(
  confirmed.compilation.artifacts.canonicalPaper.questionGroups.length,
  9,
)
assert.deepEqual(
  confirmed.compilation.artifacts.canonicalPaper.questionGroups[0].content.blocks
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
assert.deepEqual(
  projected.nodes.find((node) =>
    node.kind === 'group' && node.familyContractId === 'seven-choices')
    .passageBlockRoles,
  [{ nodeId: 'block:seven-choices:title', role: 'title' }],
  'Canonical projector retains source-proven Seven Choices passage roles',
)
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

console.log('verify-paper-canonical-nck1-materialization-candidate: PASS')
