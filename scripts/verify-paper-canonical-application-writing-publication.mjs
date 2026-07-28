#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import {
  applicationWritingReferenceHashes,
  makeApplicationWritingReferenceFixture,
} from '../test-fixtures/paper-canonical/applicationWritingReferenceFixture.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

function makeCanonicalOnlyApplicationFixture() {
  const fixture = makeReadyCanonicalFixture()
  const group = fixture.source.groups.find((candidate) => candidate.slotId === 'writing.application')
  const promptBlockId = 'paragraph:application:prompt'
  const promptInlineId = 'text:application:prompt'
  const absenceObservationId = 'observation:application:answer-region-empty'
  const wordObservationId = 'observation:application:word-count'
  const responseObservationId = 'observation:application:response'
  fixture.source.observations.push(
    {
      observationId: absenceObservationId,
      kind: 'application_answer_region_absence',
      documentInputKey: 'questions',
      value: { groupId: group.groupId, answerRegionRef: 'writing.application-box' },
      span: { start: 0, end: 1 },
    },
    {
      observationId: wordObservationId,
      kind: 'application_word_count_ruling',
      documentInputKey: 'questions',
      value: { groupId: group.groupId, target: 80, countScope: 'student_authored_only' },
      span: { start: 0, end: 1 },
    },
    {
      observationId: responseObservationId,
      kind: 'application_response_binding',
      documentInputKey: 'questions',
      value: {
        groupId: group.groupId,
        writingTaskId: 'writing-task:application:fixture',
        answerRegionRef: 'writing.application-box',
      },
      span: { start: 0, end: 1 },
    },
  )
  group.content = {
    blocks: [{
      kind: 'paragraph',
      nodeId: promptBlockId,
      inlines: [{ kind: 'text', nodeId: promptInlineId, text: 'Write a short notice of about 80 words for the school event.' }],
    }],
  }
  const promptRef = { blockId: promptBlockId, inlineNodeIds: [promptInlineId] }
  group.variant = {
    family: 'application-writing',
    writingTaskId: 'writing-task:application:fixture',
    promptBlockRefs: [promptBlockId],
    situation: {
      writerRole: promptRef,
      audienceOrDestination: promptRef,
      deliverable: promptRef,
      communicativePurpose: promptRef,
    },
    contentRequirements: [{
      requirementId: 'requirement:application:fixture:1',
      contentRef: promptRef,
    }],
    wordCountRuling: {
      kind: 'approximate_target',
      target: 80,
      countScope: 'student_authored_only',
      sourceRef: promptRef,
      authorityObservationRef: wordObservationId,
    },
    givenSkeleton: {
      presence: 'none',
      answerRegionAbsenceAssertionRef: absenceObservationId,
    },
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'group_level_written_response',
      answerRegionRef: 'writing.application-box',
      authorityObservationRef: responseObservationId,
    },
  }
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(fixture.source)).byteLength
    for (const observation of fixture.source.observations) {
      if (observation.documentInputKey === 'questions') observation.span.end = byteLength
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(fixture.source))
  fixture.request.evidence.documents[0].bytes = bytes
  fixture.sourceAsset = bytes
  return fixture
}

const fixture = makeCanonicalOnlyApplicationFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')
const applicationGroup = compilation.artifacts.canonicalPaper.questionGroups
  .find((group) => group.variant.family === 'application-writing')
assert.deepEqual(applicationGroup.questionRefs, [])
assert.deepEqual(applicationGroup.blankRefs, [])
assert.equal(applicationGroup.variant.wordCountRuling.countScope, 'student_authored_only')

const projected = projectCanonicalPaper({
  plan: compilation.artifacts.canonicalPaper.paperPlan,
  groups: compilation.artifacts.canonicalPaper.questionGroups,
  sourceCapture: compilation.artifacts.sourceCapture,
})
const occurrence = projected.nodes.find((node) => node.kind === 'group' && node.familyContractId === 'application-writing')
assert.equal(occurrence.writingTaskId, 'writing-task:application:fixture')
assert.equal(occurrence.answerRegion.answerRegionRef, 'writing.application-box')
assert.equal(occurrence.answerRegion.responseSlotId, 'writing.application')
assert.deepEqual(occurrence.answerRegion.givenTop, [])
assert.deepEqual(occurrence.answerRegion.givenBottom, [])

function project(compilationValue) {
  return projectCanonicalPaper({
    plan: compilationValue.artifacts.canonicalPaper.paperPlan,
    groups: compilationValue.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilationValue.artifacts.sourceCapture,
  })
}

async function exercisePublicSeams(referenceFixture) {
  const compiled = compileCanonicalPaper(referenceFixture.request)
  assert.equal(compiled.disposition, 'ready')
  const projected = project(compiled)
  const projectedApplication = projected.nodes
    .filter((node) => node.kind === 'group' && node.familyContractId === 'application-writing')
  assert.equal(projectedApplication.length, 1)
  assert.equal(projectedApplication[0].answerRegion.responseSlotId, 'writing.application')

  const sealed = sealCanonicalPublication({
    compilation: compiled,
    sourceAssetVersion: 1,
    sourceAsset: referenceFixture.sourceAsset,
  })
  const reopened = validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  })
  assert.deepEqual(
    reopened.projected.nodes.filter((node) => node.kind === 'group' && node.familyContractId === 'application-writing'),
    projectedApplication,
  )

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-application-writing-publication-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    assert.equal(publishCanonicalPaperPublication({
      rootDir,
      db,
      request: referenceFixture.request,
      sourceAssetVersion: 1,
      sourceAsset: referenceFixture.sourceAsset,
    }).status, 'published')
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [
      consumerContractRefs.screen,
      consumerContractRefs.print_pdf,
    ]) {
      const loaded = await loadPaperForConsumption({
        paperId: referenceFixture.paperId,
        consumerContract,
      }, store)
      assert.equal(loaded.disposition, 'ready')
      const selection = loaded.selections.find((candidate) => candidate.familyContractId === 'application-writing')
      assert.equal(selection.mode, 'canonical')
      assert.deepEqual(selection.groupIds, [projectedApplication[0].groupId])
      assert.deepEqual(selection.projectedOccurrences, projectedApplication)
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
  return { compiled, occurrence: projectedApplication[0] }
}

function requestWithApplicationCapture(referenceFixture, mutator) {
  const request = structuredClone(referenceFixture.request)
  const captureDocument = request.evidence.documents.find((document) => document.inputKey === 'application_writing_capture')
  const capture = JSON.parse(new TextDecoder().decode(captureDocument.bytes))
  mutator(capture)
  captureDocument.bytes = new TextEncoder().encode(JSON.stringify(capture))
  return request
}

function assertBlocked(referenceFixture, mutator, disposition, code) {
  const blocked = compileCanonicalPaper(requestWithApplicationCapture(referenceFixture, mutator))
  assert.equal(blocked.disposition, disposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(
    blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === code),
    true,
    `Expected ${code}; received ${blocked.artifacts.normalizationReport.diagnostics.map((item) => item.code).join(', ')}`,
  )
}

const absentFixture = makeApplicationWritingReferenceFixture('paper-zj-2020-jan')
const absent = await exercisePublicSeams(absentFixture)
assert.equal(absent.occurrence.answerRegion.givenTop.length, 0)
assert.equal(absent.occurrence.answerRegion.givenBottom.length, 0)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-zj-2020-jan'].capture),
  true,
)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-zj-2020-jan'].importMeta),
  true,
)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-zj-2020-jan'].transcription),
  true,
)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-zj-2020-jan'].source),
  true,
)

const providedFixture = makeApplicationWritingReferenceFixture('paper-2026-i')
const provided = await exercisePublicSeams(providedFixture)
assert.deepEqual(provided.occurrence.answerRegion.givenTop.map((part) => part.role), ['title'])
assert.equal(provided.occurrence.answerRegion.givenBottom.length, 0)
const providedGroup = provided.compiled.artifacts.canonicalPaper.questionGroups
  .find((group) => group.variant.family === 'application-writing')
const providedPart = providedGroup.variant.givenSkeleton.parts[0]
const providedPartMap = providedGroup.sourceMap.entries
  .find((entry) => entry.target.kind === 'given_part' && entry.target.id === providedPart.givenPartId)
const providedObservation = provided.compiled.artifacts.sourceCapture.observations
  .find((observation) => observation.observationId === providedPart.authorityAssertionRef)
assert.deepEqual(providedPartMap.sourceSpanRefs, [providedObservation.sourceSpanId])
assert.equal(
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].capture),
  true,
)
assert.equal(
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].importMeta),
  true,
)
assert.equal(
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].transcription),
  true,
)
assert.equal(
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].source),
  true,
)
const missingOriginalSourceRequest = structuredClone(providedFixture.request)
missingOriginalSourceRequest.evidence.documents = missingOriginalSourceRequest.evidence.documents
  .filter((document) => document.inputKey !== 'original_question_source')
const missingOriginalSource = compileCanonicalPaper(missingOriginalSourceRequest)
assert.equal(missingOriginalSource.disposition, 'incomplete_source')
assert.equal(
  missingOriginalSource.artifacts.normalizationReport.diagnostics
    .some((item) => item.code === 'APPLICATION_SOURCE_PROVENANCE_INVALID'),
  true,
)

const supplemented = compileCanonicalPaper({
  ...providedFixture.request,
  supplements: {
    analysis: { rewrittenPrompt: 'forged', wordCountTarget: 200 },
    modelAnswer: { text: 'forged' },
    reviewCard: { requirements: ['forged'] },
    highlights: ['forged'],
    generatorAudit: { answerRegionRef: 'forged' },
  },
})
assert.equal(supplemented.disposition, 'ready')
assert.deepEqual(supplemented.artifacts.canonicalPaper, provided.compiled.artifacts.canonicalPaper)
assert.deepEqual(supplemented.artifacts.normalizationReport, provided.compiled.artifacts.normalizationReport)

assertBlocked(absentFixture, (capture) => {
  const group = capture.group
  group.variant.givenSkeleton.answerRegionAbsenceAssertionRef = 'observation:missing'
}, 'incomplete_source', 'APPLICATION_GIVEN_ABSENCE_UNPROVEN')
assertBlocked(absentFixture, (capture) => {
  const group = capture.group
  group.variant.promptBlockRefs = []
}, 'incomplete_source', 'APPLICATION_PROMPT_INCOMPLETE')
assertBlocked(absentFixture, (capture) => {
  const group = capture.group
  group.variant.wordCountRuling.kind = 'minimum'
}, 'incomplete_source', 'APPLICATION_SOURCE_VARIANT_INVALID')
assertBlocked(absentFixture, (capture) => {
  capture.group.variant.wordCountRuling.target = 200
  const sourceRef = capture.group.variant.wordCountRuling.sourceRef
  const sourceBlock = capture.group.content.blocks.find((block) => block.nodeId === sourceRef.blockId)
  for (const inline of sourceBlock.inlines) {
    if (sourceRef.inlineNodeIds.includes(inline.nodeId)) inline.text = inline.text.replace('80', '200')
  }
}, 'needs_review', 'APPLICATION_SOURCE_TRANSCRIPTION_CONFLICT')
assertBlocked(providedFixture, (capture) => {
  const group = capture.group
  const titleBlockId = group.variant.givenSkeleton.parts[0].blockRef
  group.content.blocks = group.content.blocks.filter((block) => block.nodeId !== titleBlockId)
  group.observations = group.observations.filter((observation) => observation.kind !== 'application_given_part')
  group.variant.givenSkeleton = {
    presence: 'none',
    answerRegionAbsenceAssertionRef: `observation:application:${group.groupId}:answer-region-empty`,
  }
  group.observations.push({
    observationId: group.variant.givenSkeleton.answerRegionAbsenceAssertionRef,
    kind: 'application_answer_region_absence',
    value: {
      groupId: group.groupId,
      answerRegionRef: 'writing.application-box',
    },
  })
}, 'needs_review', 'APPLICATION_SOURCE_TRANSCRIPTION_CONFLICT')
assertBlocked(providedFixture, (capture) => {
  const group = capture.group
  const blockRef = `paragraph:${group.groupId}:given:closing`
  const givenPartId = `given-part:${group.groupId}:closing`
  const authorityAssertionRef = `observation:application:${group.groupId}:given:closing`
  group.content.blocks.push({
    kind: 'paragraph',
    nodeId: blockRef,
    inlines: [{ kind: 'text', nodeId: `text:${blockRef}`, text: 'Fixed closing.' }],
  })
  group.variant.givenSkeleton.parts.unshift({
    givenPartId,
    role: 'closing',
    placement: 'answer_region_bottom',
    blockRef,
    authorityAssertionRef,
  })
  group.observations.push({
    observationId: authorityAssertionRef,
    kind: 'application_given_part',
    value: {
      groupId: group.groupId,
      givenPartId,
      role: 'closing',
      placement: 'answer_region_bottom',
      blockRef,
    },
  })
}, 'needs_review', 'APPLICATION_SOURCE_TRANSCRIPTION_CONFLICT')
assertBlocked(providedFixture, (capture) => {
  const group = capture.group
  group.variant.givenSkeleton.parts[0].role = 'date_line'
}, 'unsupported', 'APPLICATION_GIVEN_ROLE_UNSUPPORTED')

console.log('paper canonical Application Writing publication verification passed')
