#!/usr/bin/env node

import assert from 'node:assert/strict'

import { canonicalAuthorityRef, compileCanonicalPaper, stableStringify } from '../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority, slotsForProfile, validateAuthorityClosure } from '../shared/paper-canonical/authority.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

function option(label) {
  return { optionId: `option:${label}`, label, content: [{ kind: 'text', nodeId: `text:${label}`, text: label }] }
}

function makeChoiceOwnership(family, questionIds) {
  if (family === 'seven-choices') {
    return { ownership: 'shared_bank', bankId: 'bank:fixture', options: 'ABCDEFG'.split('').map(option) }
  }
  if (family === 'reading' || family === 'cloze') {
    return {
      ownership: 'per_question',
      sets: questionIds.map((questionId) => ({ questionId, options: 'ABCD'.split('').map(option) })),
    }
  }
  return { ownership: 'none' }
}

function makeReadySource() {
  const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const profile = closure.profiles.get('nck1')
  const observations = []
  const groups = []
  const assertions = []
  const inactiveSlots = {}
  for (const slot of slotsForProfile(profile)) {
    const observationId = `observation:${slot.slotId}`
    observations.push({
      observationId,
      kind: 'fixture_section',
      documentInputKey: 'questions',
      value: slot.slotId,
      span: { start: 0, end: 1 },
    })
    const sourceSpanId = `source-span:${observationId}`
    if (slot.activation === 'inactive_source') {
      inactiveSlots[slot.slotId] = [sourceSpanId]
      continue
    }
    const count = slot.questionCardinality.count
    const questionIds = Array.from({ length: count }, (_, index) => `question:${slot.slotId}:${index + 1}`)
    const blankIds = slot.familyContractRef.id === 'grammar-fill' || slot.familyContractRef.id === 'cloze' || slot.familyContractRef.id === 'seven-choices'
      ? questionIds.map((_, index) => `blank:${slot.slotId}:${index + 1}`)
      : []
    groups.push({
      groupId: `group:${slot.slotId}`,
      slotId: slot.slotId,
      family: slot.familyContractRef.id,
      questionIds,
      blankIds,
      sourceSpanId,
      content: { blocks: [] },
      media: [],
      variant: { family: slot.familyContractRef.id, choiceOwnership: makeChoiceOwnership(slot.familyContractRef.id, questionIds) },
    })
    for (const questionId of questionIds) {
      assertions.push({ assertionId: `answer:${questionId}`, questionId, answer: 'A', authority: 'official', sourceSpanId })
    }
  }
  const source = { paperId: 'paper-canonical-fixture', profileId: 'nck1', sourceAssetVersion: 1, observations, assertions, groups, inactiveSlots }
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of observations) observation.span.end = byteLength
  }
  return source
}

const source = makeReadySource()
function makeRequest(value) {
  return {
    authority: canonicalAuthorityRef,
    evidence: {
      documents: [
        {
          inputKey: 'questions',
          roles: ['question_source', 'official_answer_source'],
          bytes: new TextEncoder().encode(JSON.stringify(value)),
          declared: {
            mediaType: 'application/vnd.eqb.canonical-fixture+json',
          },
        },
      ],
    },
  }
}

const request = makeRequest(source)

const requestBefore = stableStringify(request)
const first = compileCanonicalPaper(request)
const second = compileCanonicalPaper(request)

assert.equal(first.disposition, 'ready')
assert.deepEqual(second, first)
assert.equal(stableStringify(request), requestBefore)
assert.equal('canonicalPaper' in first.artifacts, true)
assert.equal('semanticDigest' in first.artifacts.normalizationReport, true)
assert.equal(first.artifacts.canonicalPaper.paperPlan.completeness.status, 'complete')
assert.equal(first.artifacts.canonicalPaper.questionGroups.length, 9)

const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
assert.deepEqual(
  ['nck1', 'zhejiang-legacy', 'national-legacy'].map((profileId) => {
    const slots = slotsForProfile(closure.profiles.get(profileId))
    return [profileId, slots.filter((slot) => slot.activation === 'canonical_group').length, slots.filter((slot) => slot.activation === 'inactive_source').length]
  }),
  [
    ['nck1', 9, 2],
    ['zhejiang-legacy', 8, 2],
    ['national-legacy', 7, 4],
  ],
)

const projected = projectCanonicalPaper({
  plan: first.artifacts.canonicalPaper.paperPlan,
  groups: first.artifacts.canonicalPaper.questionGroups,
  sourceCapture: first.artifacts.sourceCapture,
  authorityClosure: closure,
})
assert.equal(projected.nodes.filter((node) => node.kind === 'group').length, 9)
const projectedSevenChoices = projected.nodes.find((node) => node.kind === 'group' && node.familyContractId === 'seven-choices')
assert.deepEqual(Object.keys(projectedSevenChoices.choices).sort(), ['bankId', 'options', 'ownership'])
assert.equal(projected.nodes.some((node) => node.slotId?.startsWith('listening.')), false)

const corruptSharedBank = structuredClone(first.artifacts.canonicalPaper.questionGroups)
const shared = corruptSharedBank.find((group) => group.variant.family === 'seven-choices')
shared.variant.choiceOwnership.sets = []
shared.semanticDigest = shared.semanticDigest
assert.throws(
  () => projectCanonicalPaper({ plan: first.artifacts.canonicalPaper.paperPlan, groups: corruptSharedBank, sourceCapture: first.artifacts.sourceCapture, authorityClosure: closure }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
)

function assertBlocked(mutator, expectedDisposition) {
  const blockedSource = structuredClone(source)
  mutator(blockedSource)
  const result = compileCanonicalPaper(makeRequest(blockedSource))
  assert.equal(result.disposition, expectedDisposition)
  assert.equal('canonicalPaper' in result.artifacts, false)
  assert.equal('semanticDigest' in result.artifacts.normalizationReport, false)
}

assertBlocked((value) => value.ambiguities = ['two plausible boundaries'], 'needs_review')
assertBlocked((value) => value.unsupportedFeatures = ['unmodeled source feature'], 'unsupported')
assertBlocked((value) => value.assertions.pop(), 'incomplete_source')
assertBlocked((value) => value.assertions.push({ ...value.assertions[0], assertionId: 'answer:conflict', answer: 'B' }), 'answer_conflict')
const exactTransformation = structuredClone(source)
const transformedGroup = exactTransformation.groups[0]
exactTransformation.transformations = [{
  recordId: 'record:exact',
  sequence: 1,
  ruleId: 'direct-projection',
  ruleVersion: '1',
  target: { identity: transformedGroup.groupId, path: 'content.blocks' },
  operation: 'direct_projection',
  inputSourceSpanIds: [transformedGroup.sourceSpanId],
  before: 'fixture',
  after: 'fixture',
  certainty: 'exact',
  preconditions: { direct: true },
  outputDigest: digestJson('fixture'),
}]
const transformed = compileCanonicalPaper(makeRequest(exactTransformation))
assert.equal(transformed.disposition, 'ready')
assert.equal(transformed.artifacts.normalizationReport.transformationRecords.length, 1)
const nonExactTransformation = structuredClone(exactTransformation)
nonExactTransformation.transformations[0].certainty = 'heuristic'
assert.equal(compileCanonicalPaper(makeRequest(nonExactTransformation)).disposition, 'needs_review')
const unregisteredOperation = structuredClone(exactTransformation)
unregisteredOperation.transformations[0].operation = 'erase_source_semantics'
assert.equal(compileCanonicalPaper(makeRequest(unregisteredOperation)).disposition, 'needs_review')

const reviewedAmbiguity = structuredClone(source)
reviewedAmbiguity.ambiguities = [{
  ambiguityId: 'ambiguity:fixture-boundary',
  candidates: ['candidate:one', 'candidate:two'],
  sourceSpanRefs: [reviewedAmbiguity.groups[0].sourceSpanId],
}]
const reviewedRequest = makeRequest(reviewedAmbiguity)
reviewedRequest.reviewDecisions = [{
  decisionId: 'review:fixture-boundary',
  ambiguityId: 'ambiguity:fixture-boundary',
  selectedCandidateId: 'candidate:two',
  sourceSpanRefs: [reviewedAmbiguity.groups[0].sourceSpanId],
}]
const reviewed = compileCanonicalPaper(reviewedRequest)
assert.equal(reviewed.disposition, 'ready')
assert.deepEqual(reviewed.artifacts.normalizationReport.reviewDecisions, reviewedRequest.reviewDecisions)
const badAuthority = compileCanonicalPaper({ ...request, authority: { ...canonicalAuthorityRef, manifestDigest: 'sha256:not-the-manifest' } })
assert.equal(badAuthority.disposition, 'unsupported')
assert.equal(badAuthority.artifacts.sourceCapture.schemaVersion, 'source-capture-v1')

const richSource = structuredClone(source)
const richGroup = richSource.groups.find((group) => group.family === 'reading')
richGroup.media = [{ mediaId: 'media:fixture', mimeType: 'image/png', sha256: 'sha256:fixture-image', pixelWidth: 10, pixelHeight: 5, sourceArtifactRef: { artifactId: 'artifact:fixture-image' } }]
richGroup.content = {
  blocks: [
    { kind: 'paragraph', nodeId: 'paragraph:fixture', inlines: [{ kind: 'text', nodeId: 'text:fixture', text: 'Literal punctuation.' }] },
    { kind: 'table', nodeId: 'table:fixture', columnCount: 2, rows: [
      { rowId: 'row:head', cells: [{ cellId: 'cell:h1', columnStart: 0, columnSpan: 1, rowSpan: 1, role: 'header', inlines: [{ kind: 'text', nodeId: 'text:h1', text: 'H1' }] }, { cellId: 'cell:h2', columnStart: 1, columnSpan: 1, rowSpan: 1, role: 'header', inlines: [{ kind: 'text', nodeId: 'text:h2', text: 'H2' }] }] },
      { rowId: 'row:data', cells: [{ cellId: 'cell:d1', columnStart: 0, columnSpan: 1, rowSpan: 1, role: 'data', inlines: [{ kind: 'text', nodeId: 'text:d1', text: 'D1' }] }, { cellId: 'cell:d2', columnStart: 1, columnSpan: 1, rowSpan: 1, role: 'data', inlines: [{ kind: 'text', nodeId: 'text:d2', text: 'D2' }] }] },
    ] },
    { kind: 'figure', nodeId: 'figure:fixture', mediaId: 'media:fixture', caption: [{ kind: 'text', nodeId: 'caption:fixture', text: 'Source-linked figure.' }] },
  ],
}
const richResult = compileCanonicalPaper(makeRequest(richSource))
assert.equal(richResult.disposition, 'ready')
const richArtifact = richResult.artifacts.canonicalPaper.questionGroups.find((group) => group.identity.groupId === richGroup.groupId)
assert.equal(richArtifact.media[0].sourceArtifactRef.captureId, richResult.artifacts.sourceCapture.captureId)
const invalidTable = structuredClone(richSource)
invalidTable.groups.find((group) => group.groupId === richGroup.groupId).content.blocks[1].rows[1].cells[1].columnStart = 0
assert.equal(compileCanonicalPaper(makeRequest(invalidTable)).disposition, 'needs_review')

const badManifest = structuredClone(closure.manifest)
badManifest.unrecognized = true
assert.equal(validateAuthorityClosure({ manifest: badManifest, artifacts: closure.artifacts, schemas: closure.schemas }).ok, false)
const duplicateOwnerManifest = structuredClone(closure.manifest)
duplicateOwnerManifest.factOwners[5].owner = 'core'
assert.equal(validateAuthorityClosure({ manifest: duplicateOwnerManifest, artifacts: closure.artifacts, schemas: closure.schemas }).ok, false)
const mismatchedArtifacts = structuredClone(closure.artifacts)
mismatchedArtifacts.core.id = 'tampered'
assert.equal(validateAuthorityClosure({ manifest: closure.manifest, artifacts: mismatchedArtifacts, schemas: closure.schemas }).ok, false)
const nestedUnknownArtifacts = structuredClone(closure.artifacts)
nestedUnknownArtifacts['profile-nck1'].parts[0].unrecognized = true
const nestedUnknownManifest = structuredClone(closure.manifest)
const nestedUnknownDescriptor = nestedUnknownManifest.artifacts.find((artifact) => artifact.id === 'profile-nck1')
nestedUnknownDescriptor.sha256 = digestJson(nestedUnknownArtifacts['profile-nck1'])
assert.equal(validateAuthorityClosure({ manifest: nestedUnknownManifest, artifacts: nestedUnknownArtifacts, schemas: closure.schemas }).ok, false)

console.log('PASS paper canonical foundation compiler seam')
