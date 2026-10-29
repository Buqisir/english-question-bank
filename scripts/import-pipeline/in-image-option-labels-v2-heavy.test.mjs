// Deferred heavy public acceptance. This file invokes browser/PDF/raster work.
// Run only when the owner-assigned heavy slot is available.
import assert from 'node:assert/strict'
import test from 'node:test'
import { makeInImageOptionLabelsV2Fixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/in-image-option-labels-v2-heavy.mjs'
import { planInImageOptionLabels, applyInImageOptionLabelsPlan } from './in-image-option-labels.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport,
  isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { nck1InImageOptionLabelsAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { projectCanonicalConsumerGroup } from '../../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { sealCanonicalPublication, validateCanonicalPublicationBundle } from '../../server/paper-canonical/publication.mjs'
import { nck1OcrEvidenceDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { digestJson, withoutKey } from '../../shared/paper-canonical/stable.mjs'
import { assertCanonicalConsumptionVisibleStructure } from '../../shared/paper-canonical/visibleStructure.mjs'
import manifestV80 from '../../standards/paper-canonical/manifest-v80.json' with { type: 'json' }

const encode = value => Buffer.from(JSON.stringify(value))
function resign(raw) {
  const d = raw.inImageOptionLabels[0]
  const q = raw.groups.find(g => g.groupId === d.groupId).questions.find(q => q.questionId === d.questionId)
  const layout = q.figureLayout
  layout.measurementEvidenceBody.labelEvidence.decisionDigest = digestJson(d)
  layout.intent.measurementEvidence.evidenceDigest = digestJson(layout.measurementEvidenceBody)
  layout.intent.intentDigest = digestJson(withoutKey(layout.intent, 'intentDigest'))
}
for (const shared of [false, true]) test(`native plan/apply, full replay, compilation, live admission and consumer; shared=${shared}`, async () => {
  const fixture = await makeInImageOptionLabelsV2Fixture({ shared })
  assert.equal(fixture.nativeWordCount, 0)
  const before = structuredClone(fixture.input)
  const plan = planInImageOptionLabels(fixture.input, fixture.selection)
  const applied = applyInImageOptionLabelsPlan(fixture.input, plan, { confirmed: true })
  const input = { ...fixture.input, materializationBytes: applied.materializationBytes }
  const imported = importCanonicalCandidate(input)
  assert.deepEqual(imported.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const paper = preview.compilation.artifacts.canonicalPaper
  assert.equal(paper.paperPlan.authorityRef.manifestDigest, nck1InImageOptionLabelsV2AuthorityRef.manifestDigest)
  const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
  // Exercise the actual v81 Review registry, including exact historical/future
  // authority and closed Profile boundaries rather than an alias to v80.
  assert.deepEqual(consumption.authorityRef, nck1InImageOptionLabelsV2AuthorityRef)
  assert.doesNotThrow(() => assertCanonicalConsumptionVisibleStructure(consumption))
  const historical = structuredClone(consumption)
  historical.authorityRef = { manifestId: manifestV80.manifestId, manifestVersion: manifestV80.version,
    manifestDigest: digestJson(manifestV80) }
  assert.doesNotThrow(() => assertCanonicalConsumptionVisibleStructure(historical))
  for (const mutate of [
    c => { c.authorityRef.manifestDigest = historical.authorityRef.manifestDigest },
    c => { c.authorityRef.manifestVersion = '82' },
    c => { c.authorityRef.manifestDigest = `sha256:${'f'.repeat(64)}` },
    c => { c.profileRef.profileVersion = '17' },
    c => { c.profileRef.profileDigest = `sha256:${'f'.repeat(64)}` },
    c => { c.profileRef.extra = true },
    c => { c.visibleStructureDigest = `sha256:${'f'.repeat(64)}` },
  ]) {
    const bad = structuredClone(consumption); mutate(bad)
    assert.throws(() => assertCanonicalConsumptionVisibleStructure(bad),
      error => error.code === 'CANONICAL_CONSUMPTION_REJECTED')
  }
  const staleHistorical = structuredClone(historical)
  staleHistorical.profileRef.profileVersion = '17'
  assert.throws(() => assertCanonicalConsumptionVisibleStructure(staleHistorical))
  const consumerInput = { consumption, familyContractId: 'reading', groupId: fixture.selection.groupId }
  const projected = projectCanonicalConsumerGroup(consumerInput)
  const q = projected.questions.find(q => q.questionId === fixture.selection.questionId)
  assert.deepEqual(q.options.map(o => [o.label, o.figure.mediaId]), fixture.selection.labels.map(l => [l.label, l.childMediaId]))
  assert.deepEqual(q.figureLayout, applied.materialization.groups.find(g => g.groupId === fixture.selection.groupId)
    .questions.find(q => q.questionId === fixture.selection.questionId).figureLayout.intent)
  assert.equal(q.stemFigures?.length || 0, shared ? 1 : 0)
  assert.deepEqual(applied.materialization.answers, fixture.materialization.answers)
  assert.deepEqual(structuredClone(fixture.input), before)
  const request = materializeNck1CanonicalRequest(input, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))

  const sealed = sealCanonicalPublication({ compilation: admitted.compilation, sourceAssetVersion: 1,
    sourceAsset: admitted.sourceAsset, nck1MaterializationConfirmationProof: admitted.proof })
  const reopened = validateCanonicalPublicationBundle({ manifest: sealed.manifest, sourceAsset: sealed.sourceAsset,
    readArtifact: name => sealed.artifacts[name] || sealed.sourceEvidence[name] })
  assert.equal(reopened.plan.authorityRef.manifestDigest, nck1InImageOptionLabelsV2AuthorityRef.manifestDigest)

  assert(deriveNck1MaterializationBundle(input, nck1InImageOptionLabelsAuthorityRef).issues.length)
  const oldConsumption = structuredClone(consumption); oldConsumption.authorityRef = nck1InImageOptionLabelsAuthorityRef
  assert.throws(() => projectCanonicalConsumerGroup({ ...consumerInput, consumption: oldConsumption }))
  const tampered = structuredClone(consumption)
  tampered.selections.find(s => s.familyContractId === 'reading').projectedOccurrences
    .find(g => g.groupId === fixture.selection.groupId).questions.find(q => q.questionId === fixture.selection.questionId)
    .figureLayout.measurementEvidenceBody.labelEvidence.pageRasterDigest = `sha256:${'f'.repeat(64)}`
  assert.throws(() => projectCanonicalConsumerGroup({ ...consumerInput, consumption: tampered }))
  const changedPaper = structuredClone(paper)
  changedPaper.questionGroups.find(g => g.identity.groupId === fixture.selection.groupId).variant.questions
    .find(q => q.questionId === fixture.selection.questionId).figureLayout.measurementEvidenceBody.pageWidthPt += 1
  assert.throws(() => projectCanonicalPaper({ plan: changedPaper.paperPlan, groups: changedPaper.questionGroups,
    sourceCapture: preview.compilation.artifacts.sourceCapture }))

  const reject = (raw, extra = {}) => {
    const candidate = importCanonicalCandidate({ ...input, ...extra, materializationBytes: encode(raw) })
    assert(candidate.issues.length)
    assert(!compileNck1MaterializationCandidatePreview(candidate.candidate).compilation)
  }
  for (const mutate of [
    raw => { raw.inImageOptionLabels = [] },
    raw => { raw.schemaVersion = 'nck1-source-materialization-v11' },
    raw => { delete raw.inImageOptionLabels[0].sourceReview.reviewedPageRasterDigest },
    raw => { raw.inImageOptionLabels[0].itemOwnership = [] },
    raw => { raw.inImageOptionLabels[0].itemOwnership[0].fragments[0].target.label = 'C' },
    raw => { raw.media.find(m => m.mediaId === fixture.selection.labels[0].childMediaId).extraction.density = 72 },
    raw => { raw.inImageOptionLabels.push(structuredClone(raw.inImageOptionLabels[0])) },
  ]) { const raw = structuredClone(applied.materialization); mutate(raw); reject(raw) }
  reject(applied.materialization, { ocrSourceBytes: undefined })
  reject(applied.materialization, { media: input.media.map((m, i) => i ? m : { ...m, bytes: Buffer.from('foreign crop') }) })
  withNck1MaterializationSourceCache(() => {
    assert.deepEqual(deriveNck1MaterializationBundle(input).issues, [])
    // Keep every JSON digest consistent while falsifying sealed pixel evidence.
    // Only the independent raster replay can establish this final obligation.
    const evidence = structuredClone(fixture.evidence), confirmation = structuredClone(fixture.confirmation)
    const page = evidence.documents.find(d => d.documentId === fixture.selection.parentSource.documentId)
      .pages.find(p => p.page === fixture.selection.parentSource.page)
    page.raster.sha256 = `sha256:${'f'.repeat(64)}`
    evidence.evidenceDigest = nck1OcrEvidenceDigest(evidence)
    confirmation.evidenceDigest = evidence.evidenceDigest
    const raw = structuredClone(applied.materialization), d = raw.inImageOptionLabels[0]
    d.evidenceDigest = evidence.evidenceDigest; d.confirmationDigest = digestJson(confirmation)
    d.sourceReview.reviewedPageRasterDigest = digestJson(page.raster)
    raw.groups.find(g => g.groupId === d.groupId).questions.find(q => q.questionId === d.questionId)
      .figureLayout.measurementEvidenceBody.labelEvidence.pageRasterDigest = digestJson(page.raster)
    resign(raw)
    reject(raw, { ocrSourceBytes: { evidenceBytes: encode(evidence), confirmationBytes: encode(confirmation) } })
    assert.deepEqual(deriveNck1MaterializationBundle(input).issues, [])
  })
})
