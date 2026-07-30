#!/usr/bin/env node

import assert from 'node:assert/strict'
import manifestV1 from '../standards/paper-canonical/manifest-v1.json' with { type: 'json' }
import manifestV13 from '../standards/paper-canonical/manifest-v13.json' with { type: 'json' }
import applicationWritingRhythmV2Conformance from '../test-fixtures/paper-canonical/application-writing-rhythm-v2-conformance.json' with { type: 'json' }
import clozeRhythmV2Conformance from '../test-fixtures/paper-canonical/cloze-rhythm-v2-conformance.json' with { type: 'json' }
import continuationWritingRhythmV2Conformance from '../test-fixtures/paper-canonical/continuation-writing-rhythm-v2-conformance.json' with { type: 'json' }
import grammarFillRhythmV4Conformance from '../test-fixtures/paper-canonical/grammar-fill-rhythm-v4-conformance.json' with { type: 'json' }
import grammarFillPublicGeometryFixturesV8Conformance from '../test-fixtures/paper-canonical/grammar-fill-public-geometry-fixtures-v8-conformance.json' with { type: 'json' }
import sevenChoicesRhythmV3Conformance from '../test-fixtures/paper-canonical/seven-choices-rhythm-v3-conformance.json' with { type: 'json' }

import { canonicalAuthorityRef, compileCanonicalPaper, stableStringify, validateExactTransformationRecords } from '../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority, slotsForProfile, validateAuthorityClosure } from '../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { resolveGrammarFillPublicGeometryFixture } from '../shared/paper-canonical/grammarFillPublicGeometryFixtures.mjs'
import { validateGrammarFillPromptProvision } from '../shared/paper-canonical/grammarFillPromptContract.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const readyFixture = makeReadyCanonicalFixture()
const source = readyFixture.source
const profileInstructionEvidenceDocuments =
  readyFixture.request.evidence.documents.slice(1)
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
        ...profileInstructionEvidenceDocuments,
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
const applicationWritingRhythmV2 =
  closure.artifacts['renderer-application-writing-rhythm']
assert.deepEqual(
  {
    schemaVersion: applicationWritingRhythmV2?.schemaVersion,
    id: applicationWritingRhythmV2?.id,
    version: applicationWritingRhythmV2?.version,
  },
  applicationWritingRhythmV2Conformance.authority,
)
const continuationWritingRhythmV2 =
  closure.artifacts['renderer-continuation-writing-rhythm']
assert.deepEqual(
  {
    schemaVersion: continuationWritingRhythmV2?.schemaVersion,
    id: continuationWritingRhythmV2?.id,
    version: continuationWritingRhythmV2?.version,
  },
  continuationWritingRhythmV2Conformance.authority,
)
const grammarFillPromptProvisionV2 =
  closure.schemas['grammar-fill-prompt-provision-v2']
assert.deepEqual(
  validateGrammarFillPromptProvision(
    {
      blankId: 'blank:prompted',
      provision: 'source_prompt',
      prompt: 'hold',
    },
    grammarFillPromptProvisionV2,
  ),
  [],
  'the v2 provision contract accepts source_prompt with prompt',
)
assert.deepEqual(
  validateGrammarFillPromptProvision(
    {
      blankId: 'blank:unprompted',
      provision: 'source_proven_none',
    },
    grammarFillPromptProvisionV2,
  ),
  [],
  'the v2 provision contract accepts source_proven_none without prompt',
)
for (const contradictoryProvision of [
  {
    blankId: 'blank:prompted',
    provision: 'source_prompt',
  },
  {
    blankId: 'blank:unprompted',
    provision: 'source_proven_none',
    prompt: 'contradictory-source-prompt',
  },
]) {
  assert.equal(
    validateGrammarFillPromptProvision(
      contradictoryProvision,
      grammarFillPromptProvisionV2,
    ).some((issue) => issue.code === 'SCHEMA_ONE_OF'),
    true,
    'the v2 provision contract closes prompt presence by provision kind',
  )
}
const clozeRhythmV2 = closure.artifacts['renderer-cloze-rhythm']
assert.deepEqual(
  {
    schemaVersion: clozeRhythmV2.schemaVersion,
    id: clozeRhythmV2.id,
    version: clozeRhythmV2.version,
  },
  clozeRhythmV2Conformance.authority,
)
function assertRendererAuthorityMutationRejected(
  rendererId,
  conformance,
  caseId,
  mutate,
) {
  const artifacts = structuredClone(closure.artifacts)
  mutate(artifacts[rendererId])
  const manifest = structuredClone(closure.manifest)
  manifest.artifacts.find(
    (descriptor) => descriptor.id === rendererId,
  ).sha256 = digestJson(artifacts[rendererId])
  const validation = validateAuthorityClosure({
    manifest,
    artifacts,
    schemas: closure.schemas,
  })
  assert.equal(validation.ok, false, caseId)
  for (const expectedIssueCode of conformance.expectedIssueCodes) {
    assert.equal(
      validation.issues.some(
        (issue) => issue.code === expectedIssueCode,
      ),
      true,
      `${caseId} reports ${expectedIssueCode}`,
    )
  }
}
for (const attack of applicationWritingRhythmV2Conformance.semanticAttacks) {
  assertRendererAuthorityMutationRejected(
    'renderer-application-writing-rhythm',
    applicationWritingRhythmV2Conformance,
    attack.caseId,
    (artifact) => {
      let target = artifact
      if (attack.operation === 'duplicate-array-entry') {
        for (const key of attack.path) target = target[key]
        target.push(structuredClone(target[attack.sourceIndex]))
        return
      }
      for (const key of attack.path.slice(0, -1)) target = target[key]
      target[attack.path.at(-1)] = attack.invalidValue
    },
  )
}
for (const attack of continuationWritingRhythmV2Conformance.semanticAttacks) {
  assertRendererAuthorityMutationRejected(
    'renderer-continuation-writing-rhythm',
    continuationWritingRhythmV2Conformance,
    attack.caseId,
    (artifact) => {
      let target = artifact
      if (attack.operation === 'duplicate-array-entry') {
        for (const key of attack.path) target = target[key]
        target.push(structuredClone(target[attack.sourceIndex]))
        return
      }
      for (const key of attack.path.slice(0, -1)) target = target[key]
      target[attack.path.at(-1)] = attack.invalidValue
    },
  )
}
for (const attack of clozeRhythmV2Conformance.semanticAttacks) {
  assertRendererAuthorityMutationRejected(
    'renderer-cloze-rhythm',
    clozeRhythmV2Conformance,
    attack.caseId,
    (artifact) => {
    let target = artifact
    if (attack.operation === 'duplicate-array-entry') {
      for (const key of attack.path) target = target[key]
      target.push(structuredClone(target[attack.sourceIndex]))
      return
    }
    for (const key of attack.path.slice(0, -1)) target = target[key]
    if (attack.operation === 'delete') {
      delete target[attack.path.at(-1)]
    } else {
      target[attack.path.at(-1)] = attack.invalidValue
    }
    },
  )
}
function visitAuthorityFields(value, path = [], fields = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      visitAuthorityFields(entry, [...path, index], fields))
    return fields
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      fields.push([...path, key])
      visitAuthorityFields(entry, [...path, key], fields)
    }
  }
  return fields
}
for (const fieldPath of visitAuthorityFields(clozeRhythmV2)) {
  assertRendererAuthorityMutationRejected(
    'renderer-cloze-rhythm',
    clozeRhythmV2Conformance,
    `complete-field-closure:${fieldPath.join('.')}`,
    (artifact) => {
      let target = artifact
      for (const key of fieldPath.slice(0, -1)) target = target[key]
      delete target[fieldPath.at(-1)]
    },
  )
}
function visitAuthorityLeaves(value, path = [], leaves = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      visitAuthorityLeaves(entry, [...path, index], leaves))
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      visitAuthorityLeaves(entry, [...path, key], leaves))
  } else {
    leaves.push(path)
  }
  return leaves
}
for (const leafPath of visitAuthorityLeaves(clozeRhythmV2)) {
  assertRendererAuthorityMutationRejected(
    'renderer-cloze-rhythm',
    clozeRhythmV2Conformance,
    `complete-value-closure:${leafPath.join('.')}`,
    (artifact) => {
      let target = artifact
      for (const key of leafPath.slice(0, -1)) target = target[key]
      const key = leafPath.at(-1)
      const value = target[key]
      target[key] = typeof value === 'string'
        ? `${value}:poisoned`
        : typeof value === 'number'
          ? value + 999
          : !value
    },
  )
}
const grammarFillRhythmV4 =
  closure.artifacts['renderer-grammar-fill-rhythm']
assert.deepEqual(
  {
    schemaVersion: grammarFillRhythmV4.schemaVersion,
    id: grammarFillRhythmV4.id,
    version: grammarFillRhythmV4.version,
  },
  grammarFillRhythmV4Conformance.authority,
)
for (const attack of grammarFillRhythmV4Conformance.semanticAttacks) {
  assertRendererAuthorityMutationRejected(
    'renderer-grammar-fill-rhythm',
    grammarFillRhythmV4Conformance,
    attack.caseId,
    (artifact) => {
      let target = artifact
      if (attack.operation === 'duplicate-array-entry') {
        for (const key of attack.path) target = target[key]
        target.push(structuredClone(target[attack.sourceIndex]))
        return
      }
      for (const key of attack.path.slice(0, -1)) target = target[key]
      if (attack.operation === 'delete') {
        delete target[attack.path.at(-1)]
      } else {
        target[attack.path.at(-1)] = attack.invalidValue
      }
    },
  )
}
for (const fieldPath of visitAuthorityFields(grammarFillRhythmV4)) {
  assertRendererAuthorityMutationRejected(
    'renderer-grammar-fill-rhythm',
    grammarFillRhythmV4Conformance,
    `grammar-fill-complete-field-closure:${fieldPath.join('.')}`,
    (artifact) => {
      let target = artifact
      for (const key of fieldPath.slice(0, -1)) target = target[key]
      delete target[fieldPath.at(-1)]
    },
  )
}
for (const leafPath of visitAuthorityLeaves(grammarFillRhythmV4)) {
  assertRendererAuthorityMutationRejected(
    'renderer-grammar-fill-rhythm',
    grammarFillRhythmV4Conformance,
    `grammar-fill-complete-value-closure:${leafPath.join('.')}`,
    (artifact) => {
      let target = artifact
      for (const key of leafPath.slice(0, -1)) target = target[key]
      const key = leafPath.at(-1)
      const value = target[key]
      target[key] = typeof value === 'string'
        ? `${value}:poisoned`
        : typeof value === 'number'
          ? value + 999
          : !value
    },
  )
}
const grammarFillPublicGeometryFixturesV8 =
  closure.artifacts['renderer-grammar-fill-public-geometry-fixtures']
assert.equal(
  grammarFillPublicGeometryFixturesV8.schemaVersion,
  'grammar-fill-public-geometry-fixtures-v8',
)
assert.deepEqual(
  Object.keys(grammarFillPublicGeometryFixturesV8.variants).sort(),
  [...grammarFillPublicGeometryFixturesV8Conformance.positive.variantIds]
    .sort(),
)
assertRendererAuthorityMutationRejected(
  'renderer-grammar-fill-public-geometry-fixtures',
  grammarFillPublicGeometryFixturesV8Conformance,
  'grammar-fill-public-geometry-fixtures-complete-value-closure',
  (artifact) => {
    artifact.variants['screen-wrapped-line']
      .paragraphWidths[0].usableWidthEm += 999
  },
)
for (const attack of grammarFillPublicGeometryFixturesV8Conformance
  .shadowGeometryAttacks) {
  assertRendererAuthorityMutationRejected(
    'renderer-grammar-fill-public-geometry-fixtures',
    grammarFillPublicGeometryFixturesV8Conformance,
    attack.caseId,
    (artifact) => {
      artifact.variants['screen-wrapped-line'][attack.fieldName] =
        attack.invalidValue
    },
  )
}
const fixtureRemovalManifest = structuredClone(closure.manifest)
fixtureRemovalManifest.artifacts = fixtureRemovalManifest.artifacts.filter(
  (descriptor) =>
    descriptor.id
      !== 'renderer-grammar-fill-public-geometry-fixtures',
)
fixtureRemovalManifest.schemas = fixtureRemovalManifest.schemas.filter(
  (descriptor) =>
    descriptor.id !== 'grammar-fill-public-geometry-fixtures-v4',
)
const fixtureRemovalArtifacts = structuredClone(closure.artifacts)
delete fixtureRemovalArtifacts[
  'renderer-grammar-fill-public-geometry-fixtures'
]
const fixtureRemovalSchemas = structuredClone(closure.schemas)
delete fixtureRemovalSchemas['grammar-fill-public-geometry-fixtures-v4']
const fixtureRemovalValidation = validateAuthorityClosure({
  manifest: fixtureRemovalManifest,
  artifacts: fixtureRemovalArtifacts,
  schemas: fixtureRemovalSchemas,
})
assert.equal(
  fixtureRemovalValidation.ok,
  false,
  'coordinated fixture descriptor/schema/artifact removal fails closed',
)
assert.equal(
  fixtureRemovalValidation.issues.some(
    (issue) =>
      issue.code
        === 'RENDERER_GRAMMAR_FILL_PUBLIC_GEOMETRY_FIXTURES_MISSING',
  ),
  true,
  'coordinated removal reports the exact missing fixture authority',
)
const screenFixtureConsumption = {
  disposition: 'ready',
  paperId: 'paper-2026-i',
  authorityRef: canonicalAuthorityRef,
  consumerContractRef: consumerContractRefs.screen,
  selections: [{
    mode: 'canonical',
    familyContractId: 'grammar-fill',
    groupIds: ['group-2026-i-grammar-fill'],
  }],
}
for (const [caseId, consumption] of [
  ['copied-refs-only-plan', screenFixtureConsumption],
  ['absent-plan', null],
  [
    'historical-plan',
    {
      ...screenFixtureConsumption,
      authorityRef: {
        manifestId: manifestV13.manifestId,
        manifestVersion: manifestV13.version,
        manifestDigest: digestJson(manifestV13),
      },
    },
  ],
  [
    'mismatched-consumer',
    {
      ...screenFixtureConsumption,
      consumerContractRef: consumerContractRefs.print_pdf,
    },
  ],
]) {
  assert.throws(
    () => resolveGrammarFillPublicGeometryFixture(
      'screen-wrapped-line',
      'screen',
      consumption,
    ),
    (error) =>
      error?.code
        === 'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED',
    caseId,
  )
}
const sevenChoicesRhythmV3 =
  closure.artifacts['renderer-seven-choices-rhythm']
assert.deepEqual(
  {
    schemaVersion: sevenChoicesRhythmV3.schemaVersion,
    id: sevenChoicesRhythmV3.id,
    version: sevenChoicesRhythmV3.version,
  },
  sevenChoicesRhythmV3Conformance.authority,
)
assert.deepEqual(
  sevenChoicesRhythmV3.visibleGeometryAdjustments,
  sevenChoicesRhythmV3Conformance.visibleGeometryAdjustments,
)
assert.deepEqual(
  validateAuthorityClosure({
    manifest: closure.manifest,
    artifacts: closure.artifacts,
    schemas: closure.schemas,
  }),
  { ok: true, issues: [] },
)
for (const attack of [
  ...sevenChoicesRhythmV3Conformance.schemaAttacks,
  ...sevenChoicesRhythmV3Conformance.semanticAttacks,
]) {
  const artifacts = structuredClone(closure.artifacts)
  let target = artifacts['renderer-seven-choices-rhythm']
  for (const key of attack.path.slice(0, -1)) target = target[key]
  target[attack.path.at(-1)] = attack.invalidValue
  const manifest = structuredClone(closure.manifest)
  manifest.artifacts.find(
    (descriptor) => descriptor.id === 'renderer-seven-choices-rhythm',
  ).sha256 = digestJson(artifacts['renderer-seven-choices-rhythm'])
  const validation = validateAuthorityClosure({
    manifest,
    artifacts,
    schemas: closure.schemas,
  })
  assert.equal(validation.ok, false, attack.caseId)
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === attack.expectedIssueCode,
    ),
    true,
    attack.caseId,
  )
}
const legacyAuthorityRef = { manifestId: manifestV1.manifestId, manifestVersion: manifestV1.version, manifestDigest: digestJson(manifestV1) }
assert.equal(legacyAuthorityRef.manifestDigest, 'sha256:0aa486d62ba5d7ce9158bf45287d421c9534775118040dbacdfa81dad1e08b6b')
assert.equal(resolveCanonicalAuthority(legacyAuthorityRef).ok, true)
const immutableV13AuthorityRef = {
  manifestId: manifestV13.manifestId,
  manifestVersion: manifestV13.version,
  manifestDigest: digestJson(manifestV13),
}
assert.equal(
  immutableV13AuthorityRef.manifestDigest,
  'sha256:f51bd73617d2c3566594070d0a56fdc67d30e7ef7a7d6d3678182226b18ff1c4',
)
assert.equal(resolveCanonicalAuthority(immutableV13AuthorityRef).ok, true)
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

const reversedPromptBindings = structuredClone(
  first.artifacts.canonicalPaper.questionGroups,
)
const reorderedGrammarFill = reversedPromptBindings.find(
  (group) => group.variant.family === 'grammar-fill',
)
reorderedGrammarFill.variant.promptBindings.reverse()
const {
  sourceMap: _reorderedSourceMap,
  sourceFingerprint: _reorderedSourceFingerprint,
  semanticDigest: _reorderedSemanticDigest,
  ...reorderedGrammarFillSemantic
} = reorderedGrammarFill
reorderedGrammarFill.semanticDigest = digestJson(reorderedGrammarFillSemantic)
assert.throws(
  () => projectCanonicalPaper({
    plan: first.artifacts.canonicalPaper.paperPlan,
    groups: reversedPromptBindings,
    sourceCapture: first.artifacts.sourceCapture,
    authorityClosure: closure,
  }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
)

const contradictoryPromptProjectionCapture = structuredClone(
  first.artifacts.sourceCapture,
)
const contradictoryPromptProjectionGroups = structuredClone(
  first.artifacts.canonicalPaper.questionGroups,
)
const contradictoryPromptProjectionGrammarFill =
  contradictoryPromptProjectionGroups.find(
    (group) => group.variant.family === 'grammar-fill',
  )
const contradictoryPromptProjectionBinding =
  contradictoryPromptProjectionGrammarFill.variant.promptBindings.find(
    (binding) => binding.provision === 'source_proven_none',
  )
const contradictoryPromptProjectionObservation =
  contradictoryPromptProjectionCapture.observations.find(
    (observation) =>
      observation.observationId
        === contradictoryPromptProjectionBinding.authorityObservationRef,
  )
contradictoryPromptProjectionObservation.value.prompt =
  'contradictory-source-prompt'
assert.throws(
  () => projectCanonicalPaper({
    plan: first.artifacts.canonicalPaper.paperPlan,
    groups: contradictoryPromptProjectionGroups,
    sourceCapture: contradictoryPromptProjectionCapture,
    authorityClosure: closure,
  }),
  { code: 'CANONICAL_PROJECTION_REJECTED' },
  'canonical projection rejects source_proven_none evidence that also carries prompt',
)

const ordinaryParentheticalGroups = structuredClone(
  first.artifacts.canonicalPaper.questionGroups,
)
const ordinaryParentheticalGrammarFill = ordinaryParentheticalGroups.find(
  (group) => group.variant.family === 'grammar-fill',
)
const sourceProvenNoneBinding =
  ordinaryParentheticalGrammarFill.variant.promptBindings.find(
    (binding) => binding.provision === 'source_proven_none',
  )
const ordinaryParentheticalBlock =
  ordinaryParentheticalGrammarFill.content.blocks.find((block) =>
    block.inlines?.some(
      (inline) =>
        inline.kind === 'blank_ref'
        && inline.blankId === sourceProvenNoneBinding.blankId,
    ))
const ordinaryParentheticalBlankIndex =
  ordinaryParentheticalBlock.inlines.findIndex(
    (inline) =>
      inline.kind === 'blank_ref'
      && inline.blankId === sourceProvenNoneBinding.blankId,
  )
ordinaryParentheticalBlock.inlines[
  ordinaryParentheticalBlankIndex + 1
].text = ` (ordinary aside),${
  ordinaryParentheticalBlock.inlines[
    ordinaryParentheticalBlankIndex + 1
  ].text
}`
const {
  sourceMap: _ordinaryParentheticalSourceMap,
  sourceFingerprint: _ordinaryParentheticalSourceFingerprint,
  semanticDigest: _ordinaryParentheticalSemanticDigest,
  ...ordinaryParentheticalSemantic
} = ordinaryParentheticalGrammarFill
ordinaryParentheticalGrammarFill.semanticDigest =
  digestJson(ordinaryParentheticalSemantic)
const ordinaryParentheticalProjection = projectCanonicalPaper({
  plan: first.artifacts.canonicalPaper.paperPlan,
  groups: ordinaryParentheticalGroups,
  sourceCapture: first.artifacts.sourceCapture,
  authorityClosure: closure,
})
const ordinaryParentheticalOccurrence =
  ordinaryParentheticalProjection.nodes.find(
    (node) =>
      node.kind === 'group'
      && node.familyContractId === 'grammar-fill',
  )
assert.equal(
  ordinaryParentheticalOccurrence.blanks.find(
    (blank) => blank.blankId === sourceProvenNoneBinding.blankId,
  ).prompt,
  null,
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
exactTransformation.transformations = [
  ...(exactTransformation.transformations || []),
  {
    recordId: 'record:exact',
    sequence: (exactTransformation.transformations || []).length + 1,
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
  },
]
const transformed = compileCanonicalPaper(makeRequest(exactTransformation))
assert.equal(transformed.disposition, 'ready')
assert.equal(
  transformed.artifacts.normalizationReport.transformationRecords.length,
  first.artifacts.normalizationReport.transformationRecords.length + 1,
)
assert.equal(
  transformed.artifacts.normalizationReport.transformationRecords.some(
    (record) => record.recordId === 'record:exact',
  ),
  true,
)
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
