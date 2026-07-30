#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import { makeSevenChoicesCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/sevenChoicesReferenceFixture.mjs'

function sevenChoicesGroup(compilation) {
  return compilation.artifacts.canonicalPaper.questionGroups.find((candidate) => candidate.variant.family === 'seven-choices')
}

function project(compilation) {
  return projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
    authorityClosure: resolveCanonicalAuthority(compilation.artifacts.canonicalPaper.paperPlan.authorityRef).closure,
  })
}

async function exercisePublicSeams(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready', `${fixture.paperId || fixture.source.paperId} compiles from immutable evidence`)
  const group = sevenChoicesGroup(compilation)
  assert.ok(group, `${fixture.paperId || fixture.source.paperId} publishes its Seven Choices Group`)
  assert.equal(group.variant.members.length, 5)
  assert.equal(group.variant.choiceOwnership.options.length, 7)
  const projected = project(compilation)
  const occurrence = projected.nodes.find((node) => node.kind === 'group' && node.familyContractId === 'seven-choices')
  assert.equal(occurrence.questionBlankPairs.length, 5)
  assert.equal(occurrence.choices.options.length, 7)
  assert.equal(Object.hasOwn(occurrence.choices, 'sets'), false)
  assert.equal(occurrence.anchors.questionIds.length, 5)
  assert.equal(occurrence.anchors.blankIds.length, 5)
  assert.equal(occurrence.anchors.optionIds.length, 7)
  assert.equal(new Set(occurrence.anchors.contentNodeIds).size, occurrence.anchors.contentNodeIds.length)
  const sealed = sealCanonicalPublication({
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  const reopened = validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  })
  assert.equal(reopened.groups.find((candidate) => candidate.variant.family === 'seven-choices').semanticDigest, group.semanticDigest)
  assert.deepEqual(reopened.projected.nodes.find((node) => node.kind === 'group' && node.familyContractId === 'seven-choices'), occurrence)

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-seven-choices-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    const published = publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    assert.equal(published.status, 'published')
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [consumerContractRefs.screen, consumerContractRefs.print_pdf]) {
      const loaded = await loadPaperForConsumption({
        paperId: fixture.paperId || fixture.source.paperId,
        consumerContract,
      }, store)
      assert.equal(loaded.disposition, 'ready')
      const selection = loaded.selections.find((candidate) => candidate.familyContractId === 'seven-choices')
      assert.equal(selection.mode, 'canonical')
      assert.equal(selection.groupIds.length, 1)
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
  return compilation
}

function requestWithEvidence(fixture, mutator) {
  const request = structuredClone(fixture.request)
  const evidence = Object.fromEntries(
    request.evidence.documents
      .filter((document) =>
        document.declared.mediaType.includes('json'),
      )
      .map((document) => [
        document.inputKey,
        JSON.parse(new TextDecoder().decode(document.bytes)),
      ]),
  )
  mutator(evidence)
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(evidence.canonical_mapping)).byteLength
    for (const observation of evidence.canonical_mapping.observations) {
      if (observation.documentInputKey === 'canonical_mapping') observation.span.end = mappingLength
    }
  }
  for (const document of request.evidence.documents) {
    if (Object.hasOwn(evidence, document.inputKey)) {
      document.bytes = new TextEncoder().encode(
        JSON.stringify(evidence[document.inputKey]),
      )
    }
  }
  return request
}

function assertBlocked(fixture, mutator, disposition, code) {
  const blocked = compileCanonicalPaper(requestWithEvidence(fixture, mutator))
  assert.equal(blocked.disposition, disposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === code), true)
}

function assertRealEvidenceClosure(fixture, compilation) {
  const capture = compilation.artifacts.sourceCapture
  const paperDocument = capture.documents.find((document) => document.inputKey === 'paper_asset')
  assert.equal(paperDocument.sha256, fixture.hashes.paperAsset)
  assert.deepEqual(new Uint8Array(Buffer.from(paperDocument.encodedBytes, 'base64')), fixture.sourceAsset)
  const sourceMeta = JSON.parse(new TextDecoder().decode(fixture.request.evidence.documents.find((document) => document.inputKey === 'source_provenance').bytes))
  assert.equal(`sha256:${sourceMeta.sourceFileSha256}`, fixture.hashes.source)
  const paper = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
  const sourceGroup = Object.values(paper.content.groups).find((candidate) => candidate.groupType === 'sevenChoices')
  const group = sevenChoicesGroup(compilation)
  const spanById = new Map(capture.sourceSpans.map((span) => [span.sourceSpanId, span]))
  const documentById = new Map(capture.documents.map((document) => [document.documentId, document]))
  const markerByBlank = new Map(capture.observations
    .filter((observation) => observation.kind === 'seven_choices_marker')
    .map((observation) => [observation.value.blankId, observation]))
  for (const [index, block] of group.content.blocks.entries()) {
    const reconstructed = block.inlines.map((inline) => inline.kind === 'text' ? inline.text : markerByBlank.get(inline.blankId).value.marker).join('')
    assert.equal(reconstructed, sourceGroup.passage.paragraphs[index].text, 'literal punctuation and spacing reconstruct exact source text')
  }
  for (const blank of group.blankRefs) {
    const mapEntry = group.sourceMap.entries.find((entry) => entry.target.kind === 'blank' && entry.target.id === blank.blankId)
    assert.equal(mapEntry.sourceSpanRefs.length, 1)
    const span = spanById.get(mapEntry.sourceSpanRefs[0])
    const document = documentById.get(span.documentId)
    const bytes = new Uint8Array(Buffer.from(document.encodedBytes, 'base64'))
    assert.equal(new TextDecoder().decode(bytes.slice(span.coordinate.start, span.coordinate.end)), markerByBlank.get(blank.blankId).value.marker)
  }
  assert.deepEqual(group.variant.choiceOwnership.options.map((option) => option.content[0].text), sourceGroup.optionBank.map((option) => option.text))
  for (const member of group.variant.members) {
    const option = group.variant.choiceOwnership.options.find((candidate) => candidate.optionId === member.answer.optionId)
    const assertion = capture.assertions.find((candidate) => candidate.assertionId === member.answer.authorityAssertionRef)
    assert.equal(option.label, assertion.answer)
    const questionMap = group.sourceMap.entries.find((entry) => entry.target.kind === 'question' && entry.target.id === member.questionId)
    assert.equal(questionMap.sourceSpanRefs.length, 2)
  }
}

const canonicalOnly = makeReadyCanonicalFixture()
const canonicalOnlyCompilation = await exercisePublicSeams(canonicalOnly)
const canonicalOnlyGroup = sevenChoicesGroup(canonicalOnlyCompilation)
const corruptCanonicalOnly = structuredClone(canonicalOnlyCompilation.artifacts.canonicalPaper.questionGroups)
const corruptSevenChoices = corruptCanonicalOnly.find((group) => group.variant.family === 'seven-choices')
corruptSevenChoices.variant.members[1].blankId = corruptSevenChoices.variant.members[0].blankId
corruptSevenChoices.semanticDigest = digestJson((({ sourceMap: _a, sourceFingerprint: _b, semanticDigest: _c, ...semantic }) => semantic)(corruptSevenChoices))
assert.throws(
  () => projectCanonicalPaper({
    plan: canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan,
    groups: corruptCanonicalOnly,
    sourceCapture: canonicalOnlyCompilation.artifacts.sourceCapture,
    authorityClosure: resolveCanonicalAuthority(canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan.authorityRef).closure,
  }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
)
const foreignBankGroups = structuredClone(canonicalOnlyCompilation.artifacts.canonicalPaper.questionGroups)
const foreignBankGroup = foreignBankGroups.find((group) => group.variant.family === 'seven-choices')
foreignBankGroup.variant.choiceOwnership.bankId = 'bank:another-group'
foreignBankGroup.semanticDigest = digestJson((({ sourceMap: _a, sourceFingerprint: _b, semanticDigest: _c, ...semantic }) => semantic)(foreignBankGroup))
assert.throws(
  () => projectCanonicalPaper({
    plan: canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan,
    groups: foreignBankGroups,
    sourceCapture: canonicalOnlyCompilation.artifacts.sourceCapture,
    authorityClosure: resolveCanonicalAuthority(canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan.authorityRef).closure,
  }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
)
const conflictingProjectionCapture = structuredClone(canonicalOnlyCompilation.artifacts.sourceCapture)
const canonicalOnlyMember = canonicalOnlyGroup.variant.members[0]
conflictingProjectionCapture.assertions.find((assertion) => assertion.assertionId === canonicalOnlyMember.answer.authorityAssertionRef).answer = 'B'
assert.throws(
  () => projectCanonicalPaper({
    plan: canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan,
    groups: canonicalOnlyCompilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: conflictingProjectionCapture,
    authorityClosure: resolveCanonicalAuthority(canonicalOnlyCompilation.artifacts.canonicalPaper.paperPlan.authorityRef).closure,
  }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
)

for (const paperId of ['paper-2026-i']) {
  const fixture = makeSevenChoicesCanonicalReferenceFixture(paperId)
  const compilation = await exercisePublicSeams(fixture)
  assertRealEvidenceClosure(fixture, compilation)
  const supplemented = compileCanonicalPaper({ ...fixture.request, supplements: { analysis: { answers: ['forged'] }, renderer: { optionBank: [] } } })
  assert.equal(supplemented.disposition, 'ready')
  assert.deepEqual(supplemented.artifacts.canonicalPaper, compilation.artifacts.canonicalPaper)
  assert.deepEqual(supplemented.artifacts.normalizationReport, compilation.artifacts.normalizationReport)
}
const missingGrammarPromptAuthority =
  makeSevenChoicesCanonicalReferenceFixture('paper-960d0f8d')
const missingGrammarPromptCompilation = compileCanonicalPaper(
  missingGrammarPromptAuthority.request,
)
assert.equal(
  missingGrammarPromptCompilation.disposition,
  'incomplete_source',
  'a Seven Choices reference paper cannot publish a partial whole-paper Plan when Grammar Fill prompt authority is absent',
)
assert.equal(
  missingGrammarPromptCompilation.artifacts.normalizationReport.diagnostics
    .some(
      (diagnostic) =>
        diagnostic.code === 'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_REQUIRED',
    ),
  true,
)

const negativeFixture = makeSevenChoicesCanonicalReferenceFixture('paper-2026-i')
const sevenGroup = (evidence) => evidence.paper_asset.content.groups['group-2026-i-seven-choices']
const ordinalRequest = requestWithEvidence(negativeFixture, (evidence) => {
  for (const [index, paragraph] of sevenGroup(evidence).passage.paragraphs.entries()) {
    paragraph.text = paragraph.text.replace(`__${36 + index}__`, `(${index + 1})`)
  }
})
const ordinalSourceAsset = ordinalRequest.evidence.documents.find((document) => document.inputKey === 'paper_asset').bytes
const ordinalCompilation = await exercisePublicSeams({
  ...negativeFixture,
  request: ordinalRequest,
  sourceAsset: ordinalSourceAsset,
})
assert.equal(
  ordinalCompilation.artifacts.sourceCapture.observations.filter((observation) => observation.kind === 'seven_choices_marker').every((observation) => observation.value.dialectId === 'source-local-parenthesized-ordinal-v1'),
  true,
)
assertBlocked(negativeFixture, (evidence) => {
  sevenGroup(evidence).passage.paragraphs[0].text = sevenGroup(evidence).passage.paragraphs[0].text.replace('__36__', '___36___')
}, 'unsupported', 'SEVEN_CHOICES_DIALECT_UNSUPPORTED')
assertBlocked(negativeFixture, (evidence) => {
  sevenGroup(evidence).passage.paragraphs[4].text = sevenGroup(evidence).passage.paragraphs[4].text.replace('__40__', '')
}, 'incomplete_source', 'SEVEN_CHOICES_MARKER_EVIDENCE_INCOMPLETE')
assertBlocked(negativeFixture, (evidence) => {
  sevenGroup(evidence).optionBank.pop()
}, 'incomplete_source', 'SEVEN_CHOICES_BANK_EVIDENCE_INCOMPLETE')
assertBlocked(negativeFixture, (evidence) => {
  sevenGroup(evidence).passage.paragraphs[0].text = sevenGroup(evidence).passage.paragraphs[0].text.replace('__36__', '__36__(1)')
}, 'needs_review', 'SEVEN_CHOICES_STRAY_ORDINAL')
assertBlocked(negativeFixture, (evidence) => {
  sevenGroup(evidence).blankIds[1] = sevenGroup(evidence).blankIds[0]
}, 'needs_review', 'SEVEN_CHOICES_IDENTITY_AMBIGUOUS')
assertBlocked(negativeFixture, (evidence) => {
  delete evidence.official_answers.answers['q-2026-i-036']
}, 'incomplete_source', 'REFERENCE_QUESTION_EVIDENCE_INCOMPLETE')
assertBlocked(negativeFixture, (evidence) => {
  const sourceSpanId = `source-span:${evidence.canonical_mapping.observations[0].observationId}`
  evidence.canonical_mapping.assertions.push({
    assertionId: 'answer:q-2026-i-036:conflict',
    questionId: 'q-2026-i-036',
    answer: 'A',
    authority: 'official',
    sourceSpanId,
  })
}, 'answer_conflict', 'OFFICIAL_ANSWER_CONFLICT')
assertBlocked(negativeFixture, (evidence) => {
  evidence.paper_asset.content.questions['q-2026-i-036'].options = [{ label: 'A', text: 'forbidden fallback' }]
}, 'needs_review', 'SEVEN_CHOICES_PER_QUESTION_OPTIONS_FORBIDDEN')

console.log('PASS Seven Choices canonical publication')
