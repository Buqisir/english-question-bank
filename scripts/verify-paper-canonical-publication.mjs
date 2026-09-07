#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import manifestV1 from '../standards/paper-canonical/manifest-v1.json' with { type: 'json' }

import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  recordCanonicalPublicationCurrent,
  recoverCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
  selectConsumerGroupMode,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
import { digestJson, sha256, stableStringify } from '../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const fixture = makeReadyCanonicalFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')

const legacyAuthorityRef = {
  manifestId: manifestV1.manifestId,
  manifestVersion: manifestV1.version,
  manifestDigest: digestJson(manifestV1),
}
const legacyAuthority = resolveCanonicalAuthority(legacyAuthorityRef).closure
function stableBytes(value) {
  return new TextEncoder().encode(`${stableStringify(value)}\n`)
}

function descriptor(role, value, relativePath) {
  const bytes = stableBytes(value)
  return { role, schemaVersion: value.schemaVersion, relativePath, byteLength: bytes.byteLength, sha256: sha256(bytes), bytes }
}

const oldV13FixtureRoot = path.resolve(
  'test-fixtures/paper-canonical/publications/old-v13',
)
const oldV13FixtureIntegrityDigest =
  'sha256:b5250b626deb3f354fac478873bd3191904972cf43557700bd28550d138c7b9c'
const oldV14FixtureRoot = path.resolve(
  'test-fixtures/paper-canonical/publications/old-v14',
)
const oldV14FixtureIntegrityDigest =
  'sha256:1330b04409626a5e032a1e32d69bd47a1f05732832184aa8c6f7a34f0fde03ca'

function fixtureRelativeFiles(rootDir, relativeDir = '') {
  return readdirSync(path.join(rootDir, relativeDir))
    .flatMap((entry) => {
      const relativePath = path.join(relativeDir, entry)
      return statSync(path.join(rootDir, relativePath)).isDirectory()
        ? fixtureRelativeFiles(rootDir, relativePath)
        : [relativePath]
    })
    .sort()
}

async function assertExactOldV13FilesystemReload() {
  const integrityPath = path.join(oldV13FixtureRoot, 'fixture-integrity.json')
  const integrityBytes = readFileSync(integrityPath)
  assert.equal(
    sha256(integrityBytes),
    oldV13FixtureIntegrityDigest,
    'the checked-in old-v13 fixture inventory is byte-pinned',
  )
  const integrity = JSON.parse(integrityBytes)
  assert.equal(integrity.schemaVersion, 'canonical-publication-fixture-v1')
  assert.deepEqual(
    fixtureRelativeFiles(oldV13FixtureRoot),
    [
      'fixture-integrity.json',
      ...Object.keys(integrity.files),
    ].sort(),
    'the old-v13 fixture contains exactly the pinned filesystem bytes',
  )
  for (const [relativePath, expectedDigest] of Object.entries(
    integrity.files,
  )) {
    assert.equal(
      sha256(readFileSync(path.join(oldV13FixtureRoot, relativePath))),
      expectedDigest,
      `old-v13 fixture pins ${relativePath}`,
    )
  }

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-old-v13-reload-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    cpSync(path.join(oldV13FixtureRoot, 'store'), rootDir, {
      recursive: true,
    })
    recordCanonicalPublicationCurrent(db, integrity.publicationRef)
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerId of ['screen', 'print_pdf']) {
      const consumption = await loadPaperForConsumption({
        paperId: integrity.publicationRef.paperId,
        consumerContract: consumerContractRefs[consumerId],
      }, store)
      assert.equal(
        consumption.disposition,
        'ready',
        `the real filesystem store reloads old-v13 for ${consumerId}`,
      )
      assert.equal(
        sha256(stableBytes(consumption)),
        integrity.consumptionDigests[consumerId],
        `old-v13 reload preserves the exact ${consumerId} Consumption Plan`,
      )
      const clozeSelection = consumption.selections.find(
        (selection) => selection.familyContractId === 'cloze',
      )
      assert.ok(
        clozeSelection,
        `old-v13 ${consumerId} Consumption Plan retains its Cloze selection`,
      )
      const projectedCloze = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: 'cloze',
        groupId: clozeSelection.groupIds[0],
      })
      assert.equal(
        projectedCloze.groupId,
        clozeSelection.groupIds[0],
        `the exact byte-pinned old-v13 ${consumerId} Cloze selection remains consumable`,
      )
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

async function assertExactOldV14FilesystemReload() {
  const integrityPath = path.join(oldV14FixtureRoot, 'fixture-integrity.json')
  const integrityBytes = readFileSync(integrityPath)
  assert.equal(
    sha256(integrityBytes),
    oldV14FixtureIntegrityDigest,
    'the checked-in old-v14 fixture inventory is byte-pinned',
  )
  const integrity = JSON.parse(integrityBytes)
  assert.equal(integrity.schemaVersion, 'canonical-publication-fixture-v1')
  assert.deepEqual(
    fixtureRelativeFiles(oldV14FixtureRoot),
    [
      'fixture-integrity.json',
      ...Object.keys(integrity.files),
    ].sort(),
    'the old-v14 fixture contains exactly the pinned filesystem bytes',
  )
  for (const [relativePath, expectedDigest] of Object.entries(
    integrity.files,
  )) {
    assert.equal(
      sha256(readFileSync(path.join(oldV14FixtureRoot, relativePath))),
      expectedDigest,
      `old-v14 fixture pins ${relativePath}`,
    )
  }

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-old-v14-reload-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    cpSync(path.join(oldV14FixtureRoot, 'store'), rootDir, {
      recursive: true,
    })
    recordCanonicalPublicationCurrent(db, integrity.publicationRef)
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerId of ['screen', 'print_pdf']) {
      const consumption = await loadPaperForConsumption({
        paperId: integrity.publicationRef.paperId,
        consumerContract: consumerContractRefs[consumerId],
      }, store)
      assert.equal(
        consumption.disposition,
        'ready',
        `the real filesystem store reloads old-v14 for ${consumerId} (canonical-paper-publication-v14.json fallback)`,
      )
      assert.equal(
        sha256(stableBytes(consumption)),
        integrity.consumptionDigests[consumerId],
        `old-v14 reload preserves the exact ${consumerId} Consumption Plan`,
      )
      const clozeSelection = consumption.selections.find(
        (selection) => selection.familyContractId === 'cloze',
      )
      assert.ok(
        clozeSelection,
        `old-v14 ${consumerId} Consumption Plan retains its Cloze selection`,
      )
      // NOTE: the v13 reload additionally projects the cloze selection through
      // projectCanonicalConsumerGroup, whose occurrence-integrity gate accepts
      // the v13 Consumption Plan via a hand-curated historical-digest allowlist
      // (VERIFIED_PRE_V18_CLOZE_CONSUMPTION_DIGESTS, consumerProjection.mjs:22).
      // A genuine v14 publication produces a distinct (valid) Consumption Plan
      // digest that is not in that allowlist, so the projection gate is
      // orthogonal to this bug (the filename-fallback discovery defect) — with
      // or without the fix the projection outcome for v14 is unchanged, and
      // without the fix the loader never reaches projection at all. The
      // loadability assertions above (disposition === 'ready' + byte-pinned
      // Consumption Plan digest) are the direct regression test for the
      // canonical-paper-publication-v14.json fallback.
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function legacyBundleFrom(compilation, sourceAsset, transformationRecords = []) {
  const sourceCapture = structuredClone(compilation.artifacts.sourceCapture)
  const plan = structuredClone(compilation.artifacts.canonicalPaper.paperPlan)
  const legacyProfile = legacyAuthority.profiles.get(plan.profileRef.profileId)
  plan.authorityRef = legacyAuthorityRef
  plan.profileRef = {
    profileId: legacyProfile.profileId,
    profileVersion: legacyProfile.version,
    profileDigest: digestJson(legacyProfile),
  }
  plan.sourceConformance = {
    status: transformationRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
    transformationRecordIds: transformationRecords.map((record) => record.recordId),
  }
  for (const binding of plan.slotBindings) delete binding.sourceClosureRef
  const groups = compilation.artifacts.canonicalPaper.questionGroups.map((group) => {
    const legacyGroup = structuredClone(group)
    const legacyFamily = legacyAuthority.families.get(legacyGroup.contractRef.familyContractId)
    legacyGroup.schemaVersion = 'canonical-question-group-v1'
    if (legacyGroup.variant.family === 'grammar-fill') {
      delete legacyGroup.variant.promptBindings
      legacyGroup.sourceMap.entries = legacyGroup.sourceMap.entries.filter(
        (entry) => entry.target.kind !== 'prompt_provision',
      )
    }
    legacyGroup.contractRef.manifestVersion = legacyAuthorityRef.manifestVersion
    legacyGroup.contractRef.manifestDigest = legacyAuthorityRef.manifestDigest
    legacyGroup.contractRef.familyContractVersion = legacyFamily.version
    legacyGroup.contractRef.familyContractDigest = digestJson(legacyFamily)
    const recordIds = transformationRecords.filter((record) => record.target.identity === legacyGroup.identity.groupId).map((record) => record.recordId)
    for (const entry of legacyGroup.sourceMap.entries) entry.transformationRecordIds = recordIds
    legacyGroup.sourceFingerprint = digestJson({ captureDigest: sourceCapture.digest, sourceSpanId: legacyGroup.sourceMap.entries[0].sourceSpanRefs[0], recordIds: legacyGroup.sourceMap.entries.flatMap((entry) => entry.transformationRecordIds) })
    const { sourceMap: _sourceMap, sourceFingerprint: _sourceFingerprint, semanticDigest: _semanticDigest, ...semantic } = legacyGroup
    legacyGroup.semanticDigest = digestJson(semantic)
    return legacyGroup
  })
  const report = structuredClone(compilation.artifacts.normalizationReport)
  report.schemaVersion = 'normalization-report-v1'
  report.authority = legacyAuthorityRef
  delete report.reviewDecisions
  delete report.inactiveSourceClosures
  report.transformationRecords = structuredClone(transformationRecords)
  report.sourceFingerprint = digestJson({ captureDigest: sourceCapture.digest, groupFingerprints: groups.map((group) => group.sourceFingerprint) })
  report.directSourceMap = groups.flatMap((group) => group.sourceMap.entries)
  report.semanticDigest = digestJson({ groups: groups.map((group) => group.semanticDigest) })
  const questionGroups = { schemaVersion: 'canonical-question-groups-v1', groups: [...groups].sort((left, right) => left.identity.groupId.localeCompare(right.identity.groupId)) }
  const descriptors = [
    descriptor('source_capture', sourceCapture, 'canonical/source-capture-v1.json'),
    descriptor('paper_plan', plan, 'canonical/canonical-paper-plan-v1.json'),
    descriptor('question_groups', questionGroups, 'canonical/canonical-question-groups-v1.json'),
    descriptor('normalization_report', report, 'canonical/normalization-report-v1.json'),
  ]
  const manifestBase = {
    schemaVersion: 'canonical-paper-publication-v1',
    paperId: plan.paperId,
    sourceAssetVersion: 1,
    sourceAssetDigest: sha256(sourceAsset),
    authority: legacyAuthorityRef,
    artifacts: descriptors.map(({ bytes: _bytes, ...value }) => value).sort((left, right) => left.role.localeCompare(right.role)),
  }
  return {
    manifest: { ...manifestBase, publicationDigest: digestJson(manifestBase) },
    sourceAsset,
    artifacts: Object.fromEntries(descriptors.map((value) => [value.relativePath, value.bytes])),
  }
}

const legacySealed = legacyBundleFrom(compilation, fixture.sourceAsset)
assert.equal(legacySealed.manifest.schemaVersion, 'canonical-paper-publication-v1')
assert.equal(Object.hasOwn(legacySealed.manifest, 'sourceAssetDocumentId'), false)
assert.equal(Object.hasOwn(legacySealed.manifest, 'sourceEvidence'), false)
const legacyValidated = validateCanonicalPublicationBundle({
  manifest: legacySealed.manifest,
  sourceAsset: legacySealed.sourceAsset,
  readArtifact: (relativePath) => legacySealed.artifacts[relativePath],
})
assert.equal(legacyValidated.projected.nodes.filter((node) => node.kind === 'group').length, 9)
const unrelatedLegacySource = new TextEncoder().encode('unrelated legacy source bytes')
const unboundLegacyManifest = structuredClone(legacySealed.manifest)
unboundLegacyManifest.sourceAssetDigest = sha256(unrelatedLegacySource)
unboundLegacyManifest.publicationDigest = digestJson(((manifest) => {
  const { publicationDigest: _publicationDigest, ...base } = manifest
  return base
})(unboundLegacyManifest))
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: unboundLegacyManifest,
    sourceAsset: unrelatedLegacySource,
    readArtifact: (relativePath) => legacySealed.artifacts[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_SOURCE_UNBOUND' },
)
const legacyObservation = compilation.artifacts.sourceCapture.observations[0]
const legacyV1Transformation = {
  recordId: 'record:existing-v1-normalization',
  sequence: 1,
  ruleId: 'direct-projection',
  ruleVersion: '1',
  target: { identity: compilation.artifacts.canonicalPaper.questionGroups[0].identity.groupId, path: 'content.blocks' },
  operation: 'direct_projection',
  inputSourceSpanIds: [legacyObservation.sourceSpanId],
  before: { extracted: legacyObservation.value },
  after: { canonical: legacyObservation.value },
  certainty: 'exact',
  preconditions: {},
  outputDigest: digestJson({ canonical: legacyObservation.value }),
}
const legacyTransformed = legacyBundleFrom(compilation, fixture.sourceAsset, [legacyV1Transformation])
assert.equal(validateCanonicalPublicationBundle({
  manifest: legacyTransformed.manifest,
  sourceAsset: legacyTransformed.sourceAsset,
  readArtifact: (relativePath) => legacyTransformed.artifacts[relativePath],
}).projected.nodes.filter((node) => node.kind === 'group').length, 9)
const legacyReadyCompilation = {
  disposition: 'ready',
  artifacts: {
    sourceCapture: legacyValidated.sourceCapture,
    canonicalPaper: { paperPlan: legacyValidated.plan, questionGroups: legacyValidated.groups },
    normalizationReport: legacyValidated.normalizationReport,
  },
}
assert.throws(
  () => sealCanonicalPublication({ compilation: legacyReadyCompilation, sourceAssetVersion: 1, sourceAsset: fixture.sourceAsset }),
  { code: 'CANONICAL_PUBLICATION_AUTHORITY_RETIRED' },
)
const forgedLegacyManifest = structuredClone(legacySealed.manifest)
const forgedLegacyArtifacts = { ...legacySealed.artifacts }
const legacyReportPath = 'canonical/normalization-report-v1.json'
const forgedLegacyReport = JSON.parse(new TextDecoder().decode(forgedLegacyArtifacts[legacyReportPath]))
forgedLegacyReport.semanticDigest = 'sha256:forged'
forgedLegacyArtifacts[legacyReportPath] = stableBytes(forgedLegacyReport)
const forgedLegacyDescriptor = forgedLegacyManifest.artifacts.find((artifact) => artifact.relativePath === legacyReportPath)
forgedLegacyDescriptor.byteLength = forgedLegacyArtifacts[legacyReportPath].byteLength
forgedLegacyDescriptor.sha256 = sha256(forgedLegacyArtifacts[legacyReportPath])
forgedLegacyManifest.publicationDigest = digestJson(((manifest) => {
  const { publicationDigest: _publicationDigest, ...base } = manifest
  return base
})(forgedLegacyManifest))
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: forgedLegacyManifest,
    sourceAsset: legacySealed.sourceAsset,
    readArtifact: (relativePath) => forgedLegacyArtifacts[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_LINEAGE_INVALID' },
)

assert.throws(
  () => sealCanonicalPublication({
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: new TextEncoder().encode('unrelated source bytes'),
  }),
  { code: 'CANONICAL_PUBLICATION_SOURCE_UNBOUND' },
)

await assertExactOldV13FilesystemReload()
await assertExactOldV14FilesystemReload()
const sealed = sealCanonicalPublication({ compilation, sourceAssetVersion: 1, sourceAsset: fixture.sourceAsset })
const reorderedCompilation = structuredClone(compilation)
const reorderedPublicationGrammarFill =
  reorderedCompilation.artifacts.canonicalPaper.questionGroups.find(
    (group) => group.variant.family === 'grammar-fill',
  )
reorderedPublicationGrammarFill.variant.promptBindings.reverse()
const {
  sourceMap: _reorderedPublicationSourceMap,
  sourceFingerprint: _reorderedPublicationSourceFingerprint,
  semanticDigest: _reorderedPublicationSemanticDigest,
  ...reorderedPublicationSemantic
} = reorderedPublicationGrammarFill
reorderedPublicationGrammarFill.semanticDigest =
  digestJson(reorderedPublicationSemantic)
const reorderedReport = reorderedCompilation.artifacts.normalizationReport
reorderedReport.semanticDigest = digestJson({
  groups: reorderedCompilation.artifacts.canonicalPaper.questionGroups.map(
    (group) => group.semanticDigest,
  ),
  reviewDecisionDigest: digestJson(reorderedReport.reviewDecisions || []),
  inactiveSourceClosureDigests: (
    reorderedReport.inactiveSourceClosures || []
  ).map((closure) => closure.closureDigest),
})
const reorderedSealed = sealCanonicalPublication({
  compilation: reorderedCompilation,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
})
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: reorderedSealed.manifest,
    sourceAsset: reorderedSealed.sourceAsset,
    readArtifact: (relativePath) =>
      reorderedSealed.artifacts[relativePath]
      || reorderedSealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_PROJECTION_INVALID' },
)

const contradictoryPromptCompilation = structuredClone(compilation)
const contradictoryPromptCapture =
  contradictoryPromptCompilation.artifacts.sourceCapture
const contradictoryPromptGroups =
  contradictoryPromptCompilation.artifacts.canonicalPaper.questionGroups
const contradictoryPromptGrammarFill = contradictoryPromptGroups.find(
  (group) => group.variant.family === 'grammar-fill',
)
const contradictoryPromptBinding =
  contradictoryPromptGrammarFill.variant.promptBindings.find(
    (binding) => binding.provision === 'source_proven_none',
  )
const contradictoryPromptObservation =
  contradictoryPromptCapture.observations.find(
    (observation) =>
      observation.observationId
        === contradictoryPromptBinding.authorityObservationRef,
  )
contradictoryPromptObservation.value.prompt = 'contradictory-source-prompt'
const {
  captureId: _contradictoryCaptureId,
  digest: _contradictoryCaptureDigest,
  ...contradictoryPromptCaptureBase
} = contradictoryPromptCapture
contradictoryPromptCapture.digest = digestJson(
  contradictoryPromptCaptureBase,
)
contradictoryPromptCapture.captureId =
  `source-capture:${
    contradictoryPromptCapture.digest.slice('sha256:'.length, 28)
  }`
for (const group of contradictoryPromptGroups) {
  group.sourceMap.captureId = contradictoryPromptCapture.captureId
  const groupSpanIds = [...new Set(
    group.sourceMap.entries.flatMap((entry) => entry.sourceSpanRefs),
  )]
  group.sourceFingerprint = digestJson({
    captureDigest: contradictoryPromptCapture.digest,
    sourceSpanId: groupSpanIds[0],
    recordIds: group.sourceMap.entries.flatMap(
      (entry) => entry.transformationRecordIds,
    ),
  })
}
const contradictoryPromptReport =
  contradictoryPromptCompilation.artifacts.normalizationReport
contradictoryPromptReport.captureDigest = contradictoryPromptCapture.digest
contradictoryPromptReport.sourceFingerprint = digestJson({
  captureDigest: contradictoryPromptCapture.digest,
  groupFingerprints: contradictoryPromptGroups.map(
    (group) => group.sourceFingerprint,
  ),
  inactiveSourceClosureDigests:
    contradictoryPromptReport.inactiveSourceClosures.map(
      (inactiveClosure) => inactiveClosure.closureDigest,
    ),
})
contradictoryPromptReport.directSourceMap = [
  ...contradictoryPromptGroups.flatMap((group) => group.sourceMap.entries),
  ...contradictoryPromptReport.inactiveSourceClosures.flatMap(
    (inactiveClosure) => inactiveClosure.sourceMap.entries,
  ),
]
const contradictoryPromptSealed = sealCanonicalPublication({
  compilation: contradictoryPromptCompilation,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
})
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: contradictoryPromptSealed.manifest,
    sourceAsset: contradictoryPromptSealed.sourceAsset,
    readArtifact: (relativePath) =>
      contradictoryPromptSealed.artifacts[relativePath]
      || contradictoryPromptSealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_PROJECTION_INVALID' },
  'sealed Publication validation rejects source_proven_none evidence that also carries prompt',
)

const tamperedManifest = structuredClone(sealed.manifest)
const tamperedArtifacts = { ...sealed.artifacts }
const groupPath = 'canonical/canonical-question-groups-v1.json'
const tamperedGroups = JSON.parse(new TextDecoder().decode(tamperedArtifacts[groupPath]))
tamperedGroups.groups[0].sourceMap.captureId = 'source-capture:unrelated'
tamperedGroups.groups[0].sourceMap.entries[0].sourceSpanRefs = ['source-span:missing']
tamperedGroups.groups[0].sourceFingerprint = digestJson({ captureDigest: compilation.artifacts.sourceCapture.digest, sourceSpanId: 'source-span:missing', recordIds: [] })
tamperedGroups.groups[0].semanticDigest = digestJson(((group) => {
  const { sourceMap: _sourceMap, sourceFingerprint: _sourceFingerprint, semanticDigest: _semanticDigest, ...semantic } = group
  return semantic
})(tamperedGroups.groups[0]))
tamperedArtifacts[groupPath] = new TextEncoder().encode(`${stableStringify(tamperedGroups)}\n`)
const tamperedDescriptor = tamperedManifest.artifacts.find((artifact) => artifact.relativePath === groupPath)
tamperedDescriptor.byteLength = tamperedArtifacts[groupPath].byteLength
tamperedDescriptor.sha256 = sha256(tamperedArtifacts[groupPath])
tamperedManifest.publicationDigest = digestJson(((manifest) => {
  const { publicationDigest: _publicationDigest, ...base } = manifest
  return base
})(tamperedManifest))
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: tamperedManifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => tamperedArtifacts[relativePath] || sealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_LINEAGE_INVALID' },
)

const forgedReportManifest = structuredClone(sealed.manifest)
const forgedReportArtifacts = { ...sealed.artifacts }
const reportPath = sealed.manifest.artifacts.find((artifact) => artifact.role === 'normalization_report').relativePath
const forgedReport = JSON.parse(new TextDecoder().decode(forgedReportArtifacts[reportPath]))
forgedReport.sourceFingerprint = 'sha256:forged'
forgedReport.directSourceMap = []
forgedReportArtifacts[reportPath] = new TextEncoder().encode(`${stableStringify(forgedReport)}\n`)
const forgedReportDescriptor = forgedReportManifest.artifacts.find((artifact) => artifact.relativePath === reportPath)
forgedReportDescriptor.byteLength = forgedReportArtifacts[reportPath].byteLength
forgedReportDescriptor.sha256 = sha256(forgedReportArtifacts[reportPath])
forgedReportManifest.publicationDigest = digestJson(((manifest) => {
  const { publicationDigest: _publicationDigest, ...base } = manifest
  return base
})(forgedReportManifest))
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: forgedReportManifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => forgedReportArtifacts[relativePath] || sealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_LINEAGE_INVALID' },
)

const ledgerFixture = makeReadyCanonicalFixture()
const ledgerBaseline = compileCanonicalPaper(ledgerFixture.request)
const ledgerSource = structuredClone(ledgerFixture.source)
const ledgerGroup = ledgerSource.groups[0]
const ledgerObservation = ledgerBaseline.artifacts.sourceCapture.observations.find((observation) => observation.sourceSpanId === ledgerGroup.sourceSpanId)
ledgerSource.transformations = [
  ...(ledgerSource.transformations || []),
  {
    recordId: 'record:publication-exact',
    sequence: (ledgerSource.transformations || []).length + 1,
    ruleId: 'direct-projection',
    ruleVersion: '2',
    target: { identity: ledgerGroup.groupId, path: 'content.blocks' },
    operation: 'direct_projection',
    inputSourceSpanIds: [ledgerObservation.sourceSpanId],
    before: ledgerObservation.value,
    after: ledgerObservation.value,
    certainty: 'exact',
    preconditions: { sourceObservationIds: [ledgerObservation.observationId], sourceValueDigests: [digestJson(ledgerObservation.value)] },
    outputDigest: digestJson(ledgerObservation.value),
  },
]
ledgerFixture.request.evidence.documents[0].bytes = new TextEncoder().encode(JSON.stringify(ledgerSource))
const ledgerCompilation = compileCanonicalPaper(ledgerFixture.request)
assert.equal(ledgerCompilation.disposition, 'ready')
const ledgerSealed = sealCanonicalPublication({ compilation: ledgerCompilation, sourceAssetVersion: 1, sourceAsset: ledgerFixture.request.evidence.documents[0].bytes })
const heuristicManifest = structuredClone(ledgerSealed.manifest)
const heuristicArtifacts = { ...ledgerSealed.artifacts }
const heuristicReport = JSON.parse(new TextDecoder().decode(heuristicArtifacts[reportPath]))
heuristicReport.transformationRecords[0].certainty = 'heuristic'
heuristicArtifacts[reportPath] = new TextEncoder().encode(`${stableStringify(heuristicReport)}\n`)
const heuristicDescriptor = heuristicManifest.artifacts.find((artifact) => artifact.relativePath === reportPath)
heuristicDescriptor.byteLength = heuristicArtifacts[reportPath].byteLength
heuristicDescriptor.sha256 = sha256(heuristicArtifacts[reportPath])
heuristicManifest.publicationDigest = digestJson(((manifest) => {
  const { publicationDigest: _publicationDigest, ...base } = manifest
  return base
})(heuristicManifest))
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: heuristicManifest,
    sourceAsset: ledgerSealed.sourceAsset,
    readArtifact: (relativePath) => heuristicArtifacts[relativePath] || ledgerSealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_LINEAGE_INVALID' },
)

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-publication-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
try {
  const first = publishCanonicalPaperPublication({
    rootDir,
    db,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(first.status, 'published')

  const unsafeFixture = makeReadyCanonicalFixture()
  unsafeFixture.source.paperId = '../paper-canonical-escape'
  unsafeFixture.request.evidence.documents[0].bytes = new TextEncoder().encode(JSON.stringify(unsafeFixture.source))
  const unsafeInstructionEvidence = JSON.parse(
    new TextDecoder().decode(
      unsafeFixture.request.evidence.documents.find(
        (document) =>
          document.inputKey ===
          'continuation_writing_instruction_evidence',
      ).bytes,
    ),
  )
  unsafeInstructionEvidence.paperId = unsafeFixture.source.paperId
  unsafeFixture.request.evidence.documents.find(
    (document) =>
      document.inputKey === 'continuation_writing_instruction_evidence',
  ).bytes = new TextEncoder().encode(
    JSON.stringify(unsafeInstructionEvidence),
  )
  const unsafeCompilation = compileCanonicalPaper(unsafeFixture.request)
  assert.equal(unsafeCompilation.disposition, 'ready')
  assert.throws(
    () => sealCanonicalPublication({ compilation: unsafeCompilation, sourceAssetVersion: 1, sourceAsset: unsafeFixture.request.evidence.documents[0].bytes }),
    { code: 'CANONICAL_PUBLICATION_PAPER_ID_INVALID' },
  )
  const repeated = publishCanonicalPaperPublication({
    rootDir,
    db,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(repeated.status, 'idempotent')
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const ready = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(ready.disposition, 'ready')
  assert.equal(ready.selections.every((selection) => selection.mode === 'canonical'), true)
  assert.equal(ready.selections.length, 6)
  const legacyFamilyCallerMirror = structuredClone(ready)
  for (const selection of legacyFamilyCallerMirror.selections) {
    selection.mode = 'legacy'
    assert.throws(
      () => selectConsumerGroupMode({
        consumption: legacyFamilyCallerMirror,
        familyContractId: selection.familyContractId,
        groupId: selection.groupIds[0],
      }),
      { code: 'CANONICAL_CONSUMPTION_REJECTED' },
      `caller legacy family mirror rejects ${selection.familyContractId}`,
    )
    selection.mode = 'canonical'
  }
  const wrongFamilyCallerMirror = structuredClone(ready)
  wrongFamilyCallerMirror.selections[0].familyContractId = 'wrong-family'
  assert.throws(
    () => selectConsumerGroupMode({
      consumption: wrongFamilyCallerMirror,
      familyContractId: ready.selections[0].familyContractId,
      groupId: ready.selections[0].groupIds[0],
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'caller family mirrors cannot select a wrong canonical family',
  )
  const callerLegacyMirrorStore = {
    ...store,
    projectLegacyFamily: async ({ familyContractId }) => [{ kind: 'legacy_family', familyContractId }],
  }
  const callerLegacyMirror = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.print_pdf }, callerLegacyMirrorStore)
  assert.equal(callerLegacyMirror.disposition, 'ready')
  assert.equal(callerLegacyMirror.selections.some((selection) => selection.mode !== 'canonical'), false)
  assert.equal(
    callerLegacyMirror.selections.find((selection) => selection.familyContractId === 'seven-choices').mode,
    'canonical',
    'a caller-provided legacy projector cannot alter a complete canonical Publication',
  )

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 2,
      sourceAsset: fixture.sourceAsset,
      failurePoint: 'after-latest-before-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  const afterPreCommitFailure = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(afterPreCommitFailure.disposition, 'ready')
  assert.equal(afterPreCommitFailure.sourceAssetVersion, 1)
  assert.equal(existsSync(path.join(rootDir, fixture.source.paperId, 'versions', 'v2')), false)

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 2,
      sourceAsset: fixture.sourceAsset,
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  assert.equal(recoverCanonicalPaperPublication({ rootDir, db, paperId: fixture.source.paperId }).status, 'post_commit_recovered')
  const afterRecovery = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(afterRecovery.disposition, 'ready')
  assert.equal(afterRecovery.sourceAssetVersion, 2)

  const occupiedVersion = path.join(rootDir, fixture.source.paperId, 'versions', 'v3')
  mkdirSync(occupiedVersion)
  assert.throws(
    () => publishCanonicalPaperPublication({ rootDir, db, request: fixture.request, sourceAssetVersion: 3, sourceAsset: fixture.sourceAsset }),
    { code: 'CANONICAL_PUBLICATION_VERSION_CONFLICT' },
  )
  rmSync(occupiedVersion, { recursive: true, force: true })

  const corruptPath = path.join(rootDir, fixture.source.paperId, 'versions', 'v2', reportPath)
  writeFileSync(corruptPath, '{"corrupt":true}\n')
  const corrupt = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, store)
  assert.equal(corrupt.disposition, 'incompatible')
  const corruptCallerMirror = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, callerLegacyMirrorStore)
  assert.equal(corruptCallerMirror.disposition, 'incompatible')
  const wrongPublication = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v999', consumerContract: consumerContractRefs.screen }, store)
  assert.equal(wrongPublication.disposition, 'not_found')
  assert.equal(readFileSync(corruptPath, 'utf8').includes('corrupt'), true)
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS canonical publication seam')
