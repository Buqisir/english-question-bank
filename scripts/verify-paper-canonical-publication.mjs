#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import manifestV1 from '../standards/paper-canonical/manifest-v1.json' with { type: 'json' }

import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
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
function stableBytes(value) {
  return new TextEncoder().encode(`${stableStringify(value)}\n`)
}

function descriptor(role, value, relativePath) {
  const bytes = stableBytes(value)
  return { role, schemaVersion: value.schemaVersion, relativePath, byteLength: bytes.byteLength, sha256: sha256(bytes), bytes }
}

function legacyBundleFrom(compilation, sourceAsset, transformationRecords = []) {
  const sourceCapture = structuredClone(compilation.artifacts.sourceCapture)
  const plan = structuredClone(compilation.artifacts.canonicalPaper.paperPlan)
  plan.authorityRef = legacyAuthorityRef
  plan.sourceConformance = {
    status: transformationRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
    transformationRecordIds: transformationRecords.map((record) => record.recordId),
  }
  const groups = compilation.artifacts.canonicalPaper.questionGroups.map((group) => {
    const legacyGroup = structuredClone(group)
    legacyGroup.contractRef.manifestVersion = legacyAuthorityRef.manifestVersion
    legacyGroup.contractRef.manifestDigest = legacyAuthorityRef.manifestDigest
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

const sealed = sealCanonicalPublication({ compilation, sourceAssetVersion: 1, sourceAsset: fixture.sourceAsset })
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
const reportPath = 'canonical/normalization-report-v2.json'
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
ledgerSource.transformations = [{
  recordId: 'record:publication-exact',
  sequence: 1,
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
}]
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
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(first.status, 'published')

  const unsafeFixture = makeReadyCanonicalFixture()
  unsafeFixture.source.paperId = '../paper-canonical-escape'
  unsafeFixture.request.evidence.documents[0].bytes = new TextEncoder().encode(JSON.stringify(unsafeFixture.source))
  const unsafeCompilation = compileCanonicalPaper(unsafeFixture.request)
  assert.equal(unsafeCompilation.disposition, 'ready')
  assert.throws(
    () => publishCanonicalPaperPublication({ rootDir, db, compilation: unsafeCompilation, sourceAssetVersion: 1, sourceAsset: unsafeFixture.request.evidence.documents[0].bytes }),
    { code: 'CANONICAL_PUBLICATION_PAPER_ID_INVALID' },
  )
  const repeated = publishCanonicalPaperPublication({
    rootDir,
    db,
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(repeated.status, 'idempotent')
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const ready = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(ready.disposition, 'ready')
  assert.equal(ready.selections.every((selection) => selection.mode === 'canonical'), true)
  assert.equal(ready.selections.length, 6)
  const legacyStore = {
    ...store,
    projectLegacyFamily: async ({ familyContractId }) => [{ kind: 'legacy_family', familyContractId }],
  }
  const familyFallback = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.print_pdf }, legacyStore)
  assert.equal(familyFallback.disposition, 'ready')
  assert.equal(familyFallback.selections.filter((selection) => selection.mode === 'legacy').length, 1)
  assert.equal(familyFallback.selections.find((selection) => selection.mode === 'legacy').familyContractId, 'seven-choices')

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation,
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
      compilation,
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
    () => publishCanonicalPaperPublication({ rootDir, db, compilation, sourceAssetVersion: 3, sourceAsset: fixture.sourceAsset }),
    { code: 'CANONICAL_PUBLICATION_VERSION_CONFLICT' },
  )
  rmSync(occupiedVersion, { recursive: true, force: true })

  const corruptPath = path.join(rootDir, fixture.source.paperId, 'versions', 'v2', 'canonical', 'normalization-report-v2.json')
  writeFileSync(corruptPath, '{"corrupt":true}\n')
  const corrupt = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, store)
  assert.equal(corrupt.disposition, 'incompatible')
  const corruptFallback = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, legacyStore)
  assert.equal(corruptFallback.disposition, 'ready')
  assert.equal(corruptFallback.selections.every((selection) => selection.mode === 'legacy'), true)
  assert.equal(corruptFallback.selections.length, 6)
  assert.equal(readFileSync(corruptPath, 'utf8').includes('corrupt'), true)
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS canonical publication seam')
