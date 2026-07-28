#!/usr/bin/env node

import assert from 'node:assert/strict'
import manifestV1 from '../standards/paper-canonical/manifest-v1.json' with { type: 'json' }

import { canonicalAuthorityRef, compileCanonicalPaper, stableStringify, validateExactTransformationRecords } from '../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority, slotsForProfile, validateAuthorityClosure } from '../shared/paper-canonical/authority.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const source = makeReadyCanonicalFixture().source
function makeRequest(value, extraDocuments = []) {
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
        ...extraDocuments,
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
const legacyAuthorityRef = { manifestId: manifestV1.manifestId, manifestVersion: manifestV1.version, manifestDigest: digestJson(manifestV1) }
assert.equal(legacyAuthorityRef.manifestDigest, 'sha256:0aa486d62ba5d7ce9158bf45287d421c9534775118040dbacdfa81dad1e08b6b')
assert.equal(resolveCanonicalAuthority(legacyAuthorityRef).ok, true)
const legacyDirectRequest = makeRequest(source)
legacyDirectRequest.authority = legacyAuthorityRef
const legacyDirect = compileCanonicalPaper(legacyDirectRequest)
assert.equal(legacyDirect.disposition, 'unsupported')
assert.equal(legacyDirect.artifacts.normalizationReport.schemaVersion, 'normalization-report-v1')
assert.equal(Object.hasOwn(legacyDirect.artifacts.normalizationReport, 'reviewDecisions'), false)
assert.equal(Object.hasOwn(legacyDirect.artifacts, 'canonicalPaper'), false)
const legacyClosure = resolveCanonicalAuthority(legacyAuthorityRef).closure
const legacyTransformationGroup = source.groups[0]
const legacyObservation = first.artifacts.sourceCapture.observations.find((observation) => observation.sourceSpanId === legacyTransformationGroup.sourceSpanId)
const legacyV1Ledger = validateExactTransformationRecords([{
  recordId: 'record:legacy-exact',
  sequence: 1,
  ruleId: 'direct-projection',
  ruleVersion: '1',
  target: { identity: legacyTransformationGroup.groupId, path: 'content.blocks' },
  operation: 'direct_projection',
  inputSourceSpanIds: [legacyObservation.sourceSpanId],
  before: { extracted: legacyObservation.value },
  after: { canonical: legacyObservation.value },
  certainty: 'exact',
  preconditions: {},
  outputDigest: digestJson({ canonical: legacyObservation.value }),
}], first.artifacts.sourceCapture, legacyClosure)
assert.equal(legacyV1Ledger.diagnostics.length, 0)
assert.deepEqual(legacyV1Ledger.records.map((record) => record.recordId), ['record:legacy-exact'])
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
assert.equal(projectedSevenChoices.questionBlankPairs.length, 5)
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
assertBlocked((value) => value.observations.push({ ...value.observations[0], value: 'ambiguous duplicate observation identity' }), 'incomplete_source')
assertBlocked((value) => value.assertions.push({ ...value.assertions[0], assertionId: 'answer:conflict', answer: 'B' }), 'answer_conflict')
const exactTransformation = structuredClone(source)
const transformedGroup = exactTransformation.groups[0]
const compiledCapture = first.artifacts.sourceCapture
const transformedObservation = compiledCapture.observations.find((observation) => observation.sourceSpanId === transformedGroup.sourceSpanId)
exactTransformation.transformations = [{
  recordId: 'record:exact',
  sequence: 1,
  ruleId: 'direct-projection',
  ruleVersion: '2',
  target: { identity: transformedGroup.groupId, path: 'content.blocks' },
  operation: 'direct_projection',
  inputSourceSpanIds: [transformedGroup.sourceSpanId],
  before: transformedObservation.value,
  after: transformedObservation.value,
  certainty: 'exact',
  preconditions: { sourceObservationIds: [transformedObservation.observationId], sourceValueDigests: [digestJson(transformedObservation.value)] },
  outputDigest: digestJson(transformedObservation.value),
}]
const transformed = compileCanonicalPaper(makeRequest(exactTransformation))
assert.equal(transformed.disposition, 'ready')
assert.equal(transformed.artifacts.normalizationReport.transformationRecords.length, 1)
for (const rule of closure.artifacts.normalization.rules) {
  for (const operation of rule.allowedOperations) {
    if (operation === 'structural_tokenization') continue // Covered with real source replay by verify-paper-canonical-cloze-grammar-publication.mjs.
    if (operation === 'profile_instruction_correction') continue // Covered with hash-bound source evidence by verify-paper-canonical-continuation-writing-rendered-behavior.mjs.
    const operationFixture = structuredClone(exactTransformation)
    const record = operationFixture.transformations[0]
    record.ruleId = rule.ruleId
    record.ruleVersion = rule.version
    record.operation = operation
    const proof = rule.operationProofs[operation]
    const observations = proof.kind === 'source_identity'
      ? [transformedObservation]
      : compiledCapture.observations.slice(0, 2)
    const sourceObservationIds = observations.map((observation) => observation.observationId)
    const sourceValueDigests = observations.map((observation) => digestJson(observation.value))
    record.inputSourceSpanIds = observations.map((observation) => observation.sourceSpanId)
    record.preconditions = { sourceObservationIds, sourceValueDigests }
    if (proof.kind === 'unique_observation_join') {
      const joinValue = { sourceObservationIds, sourceValueDigests }
      record.target = { identity: `source-join:${digestJson(joinValue).slice('sha256:'.length, 28)}`, path: 'source_join' }
      record.before = joinValue
      record.after = joinValue
    } else {
      record.before = transformedObservation.value
      record.after = transformedObservation.value
    }
    record.outputDigest = digestJson(record.after)
    assert.equal(compileCanonicalPaper(makeRequest(operationFixture)).disposition, 'ready', `${rule.ruleId}@${rule.version}/${operation}`)
  }
}
const nonExactTransformation = structuredClone(exactTransformation)
nonExactTransformation.transformations[0].certainty = 'heuristic'
assert.equal(compileCanonicalPaper(makeRequest(nonExactTransformation)).disposition, 'needs_review')
const unregisteredOperation = structuredClone(exactTransformation)
unregisteredOperation.transformations[0].operation = 'erase_source_semantics'
assert.equal(compileCanonicalPaper(makeRequest(unregisteredOperation)).disposition, 'needs_review')
const unprovenExactJoin = structuredClone(exactTransformation)
unprovenExactJoin.transformations[0].operation = 'exact_join'
unprovenExactJoin.transformations[0].before = 'unrelated source value'
unprovenExactJoin.transformations[0].after = 'fabricated canonical relation'
unprovenExactJoin.transformations[0].preconditions = { claimed: true }
unprovenExactJoin.transformations[0].outputDigest = digestJson(unprovenExactJoin.transformations[0].after)
assert.equal(compileCanonicalPaper(makeRequest(unprovenExactJoin)).disposition, 'needs_review')
const arbitraryJoinTarget = structuredClone(exactTransformation)
const joinObservations = compiledCapture.observations.slice(0, 2)
const joinValue = {
  sourceObservationIds: joinObservations.map((observation) => observation.observationId),
  sourceValueDigests: joinObservations.map((observation) => digestJson(observation.value)),
}
arbitraryJoinTarget.transformations[0] = {
  ...arbitraryJoinTarget.transformations[0],
  operation: 'exact_join',
  inputSourceSpanIds: joinObservations.map((observation) => observation.sourceSpanId),
  before: joinValue,
  after: joinValue,
  preconditions: joinValue,
  outputDigest: digestJson(joinValue),
}
assert.equal(compileCanonicalPaper(makeRequest(arbitraryJoinTarget)).disposition, 'needs_review')

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
const alternateReviewedRequest = structuredClone(reviewedRequest)
alternateReviewedRequest.reviewDecisions[0].selectedCandidateId = 'candidate:one'
const alternateReviewed = compileCanonicalPaper(alternateReviewedRequest)
assert.equal(alternateReviewed.disposition, 'ready')
assert.notEqual(alternateReviewed.artifacts.canonicalPaper.paperPlan.sourceConformance.reviewDecisionDigest, reviewed.artifacts.canonicalPaper.paperPlan.sourceConformance.reviewDecisionDigest)
assert.notEqual(alternateReviewed.artifacts.normalizationReport.semanticDigest, reviewed.artifacts.normalizationReport.semanticDigest)
const badAuthority = compileCanonicalPaper({ ...request, authority: { ...canonicalAuthorityRef, manifestDigest: 'sha256:not-the-manifest' } })
assert.equal(badAuthority.disposition, 'unsupported')
assert.equal(badAuthority.artifacts.sourceCapture.schemaVersion, 'source-capture-v1')

const richSource = structuredClone(source)
const richGroup = richSource.groups.find((group) => group.family === 'reading')
const richMediaBytes = new TextEncoder().encode('foundation source-linked figure')
const richMediaDigest = sha256(richMediaBytes)
const richMediaArtifactId = `source-document:${digestJson({ sha256: richMediaDigest }).slice('sha256:'.length, 28)}`
richGroup.media = [{ mediaId: 'media:fixture', mimeType: 'image/png', sha256: richMediaDigest, pixelWidth: 10, pixelHeight: 5, sourceArtifactRef: { artifactId: richMediaArtifactId } }]
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
const richResult = compileCanonicalPaper(makeRequest(richSource, [{
  inputKey: 'rich-media',
  roles: ['source_media'],
  bytes: richMediaBytes,
  declared: { mediaType: 'image/png' },
}]))
assert.equal(richResult.disposition, 'ready')
const richArtifact = richResult.artifacts.canonicalPaper.questionGroups.find((group) => group.identity.groupId === richGroup.groupId)
assert.equal(richArtifact.media[0].sourceArtifactRef.captureId, richResult.artifacts.sourceCapture.captureId)
const invalidTable = structuredClone(richSource)
invalidTable.groups.find((group) => group.groupId === richGroup.groupId).content.blocks[1].rows[1].cells[1].columnStart = 0
assert.equal(compileCanonicalPaper(makeRequest(invalidTable, [{
  inputKey: 'rich-media',
  roles: ['source_media'],
  bytes: richMediaBytes,
  declared: { mediaType: 'image/png' },
}])).disposition, 'needs_review')

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
