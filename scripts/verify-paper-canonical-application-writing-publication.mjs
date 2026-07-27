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
  fixture.source.observations.push({
    observationId: absenceObservationId,
    kind: 'application_answer_region_absence',
    documentInputKey: 'questions',
    value: { groupId: group.groupId, answerRegionRef: 'writing.application-box' },
    span: { start: 0, end: 1 },
  })
  group.content = {
    blocks: [{
      kind: 'paragraph',
      nodeId: promptBlockId,
      inlines: [{ kind: 'text', nodeId: promptInlineId, text: 'Write a short notice for the school event.' }],
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
    },
    givenSkeleton: {
      presence: 'none',
      answerRegionAbsenceAssertionRef: absenceObservationId,
    },
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'group_level_written_response',
      answerRegionRef: 'writing.application-box',
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
      compilation: compiled,
      sourceAssetVersion: 1,
      sourceAsset: referenceFixture.sourceAsset,
    }).status, 'published')
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [
      consumerContractRefs.screen,
      consumerContractRefs.print_pdf,
      consumerContractRefs.docx,
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

function requestWithSource(referenceFixture, mutator) {
  const request = structuredClone(referenceFixture.request)
  const mappingDocument = request.evidence.documents.find((document) => document.inputKey === 'canonical_mapping')
  const source = JSON.parse(new TextDecoder().decode(mappingDocument.bytes))
  mutator(source)
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.documentInputKey === 'canonical_mapping') observation.span.end = mappingLength
    }
  }
  mappingDocument.bytes = new TextEncoder().encode(JSON.stringify(source))
  return request
}

function assertBlocked(referenceFixture, mutator, disposition, code) {
  const blocked = compileCanonicalPaper(requestWithSource(referenceFixture, mutator))
  assert.equal(blocked.disposition, disposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === code), true)
}

const absentFixture = makeApplicationWritingReferenceFixture('paper-2020-i')
const absent = await exercisePublicSeams(absentFixture)
assert.equal(absent.occurrence.answerRegion.givenTop.length, 0)
assert.equal(absent.occurrence.answerRegion.givenBottom.length, 0)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2020-i'].paperAsset),
  true,
)
assert.equal(
  absent.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2020-i'].importMeta),
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
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].paperAsset),
  true,
)
assert.equal(
  provided.compiled.artifacts.sourceCapture.documents.some((document) => document.sha256 === applicationWritingReferenceHashes['paper-2026-i'].importMeta),
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

assertBlocked(absentFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
  group.variant.givenSkeleton.answerRegionAbsenceAssertionRef = 'observation:missing'
}, 'incomplete_source', 'APPLICATION_GIVEN_ABSENCE_UNPROVEN')
assertBlocked(absentFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
  group.variant.promptBlockRefs = []
}, 'incomplete_source', 'APPLICATION_PROMPT_INCOMPLETE')
assertBlocked(absentFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
  group.variant.wordCountRuling.kind = 'minimum'
}, 'unsupported', 'APPLICATION_WORD_RULING_UNSUPPORTED')
assertBlocked(absentFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
  source.ambiguities = [{
    ambiguityId: 'application-word-ruling',
    candidates: ['about-80', 'at-least-80'],
    sourceSpanRefs: [group.sourceSpanId],
  }]
}, 'needs_review', 'AMBIGUOUS_SOURCE_SEMANTICS')
assertBlocked(providedFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
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
  source.observations.push({
    observationId: authorityAssertionRef,
    kind: 'application_given_part',
    documentInputKey: 'canonical_mapping',
    value: {
      groupId: group.groupId,
      givenPartId,
      role: 'closing',
      placement: 'answer_region_bottom',
      blockRef,
    },
    span: { start: 0, end: 1 },
  })
}, 'needs_review', 'APPLICATION_GIVEN_PART_ORDER_AMBIGUOUS')
assertBlocked(providedFixture, (source) => {
  const group = source.groups.find((candidate) => candidate.slotId === 'writing.application')
  group.variant.givenSkeleton.parts[0].role = 'date_line'
}, 'unsupported', 'APPLICATION_GIVEN_ROLE_UNSUPPORTED')

console.log('paper canonical Application Writing publication verification passed')
