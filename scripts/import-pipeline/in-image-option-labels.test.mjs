import assert from 'node:assert/strict'
import test from 'node:test'
import { makeInImageOptionLabelsFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/in-image-option-labels.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { nck1ParagraphJoinAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport,
  isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { planInImageOptionLabels, applyInImageOptionLabelsPlan } from './in-image-option-labels.mjs'

const encode = value => Buffer.from(JSON.stringify(value))
const fixture = await makeInImageOptionLabelsFixture()
const { input, selection } = fixture
const before = { materialization: Buffer.from(input.materializationBytes), evidence: Buffer.from(input.ocrSourceBytes.evidenceBytes),
  confirmation: Buffer.from(input.ocrSourceBytes.confirmationBytes), media: input.media.map(media => Buffer.from(media.bytes)) }
const plan = planInImageOptionLabels(input, selection)
const applied = applyInImageOptionLabelsPlan(input, plan, { confirmed: true })
const joined = { ...input, materializationBytes: applied.materializationBytes }

test('explicit image-only A-D proof admits, compiles and projects four unchanged source crops', () => {
  const legacy = deriveNck1MaterializationBundle(input)
  assert(legacy.issues.some(issue => /confirmed ordered A-D labels/u.test(issue.message)))
  const imported = importCanonicalCandidate(joined)
  assert.deepEqual(imported.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const compiled = preview.compilation.artifacts.canonicalPaper
  const group = compiled.questionGroups.find(group => group.identity.groupId === selection.groupId)
  const options = group.variant.choiceOwnership.sets.find(set => set.questionId === selection.questionId).options
  assert.deepEqual(options.map(option => [option.label, option.figure.mediaId]), selection.labels.map(label => [label.label, label.childMediaId]))
  const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
  assert.equal(consumption.disposition, 'ready')
  assert.equal(compiled.paperPlan.authorityRef.manifestVersion, '75')
  const request = materializeNck1CanonicalRequest(joined, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
  assert.deepEqual(applied.materialization.media, fixture.materialization.media)
  assert.deepEqual(Buffer.from(input.materializationBytes), before.materialization)
  assert.deepEqual(Buffer.from(input.ocrSourceBytes.evidenceBytes), before.evidence)
  assert.deepEqual(Buffer.from(input.ocrSourceBytes.confirmationBytes), before.confirmation)
  assert.deepEqual(input.media.map(media => Buffer.from(media.bytes)), before.media)
  const oldAuthority = deriveNck1MaterializationBundle(joined, nck1ParagraphJoinAuthorityRef)
  assert(oldAuthority.issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
})

test('v11 image-label authoring retains the option-emphasis successor and replays publicly', () => {
  const raw = { ...fixture.materialization, schemaVersion: 'nck1-source-materialization-v11' }
  const successor = { ...input, materializationBytes: encode(raw) }
  const selected = planInImageOptionLabels(successor, selection)
  const result = applyInImageOptionLabelsPlan(successor, selected, { confirmed: true })
  assert.equal(result.materialization.schemaVersion, raw.schemaVersion)
  const imported = importCanonicalCandidate({ ...successor, materializationBytes: result.materializationBytes })
  assert.deepEqual(imported.issues, [])
  assert(compileNck1MaterializationCandidatePreview(imported.candidate).compilation)
})

test('author plan requires original-image confirmation and exact materialization/OCR/PDF generation', () => {
  assert.throws(() => applyInImageOptionLabelsPlan(input, plan), /agent-confirmed/u)
  for (const field of ['materializationSha256', 'evidenceSha256', 'confirmationSha256']) {
    const changed = structuredClone(plan)
    changed.binding[field] = `sha256:${'0'.repeat(64)}`
    assert.throws(() => applyInImageOptionLabelsPlan(input, changed, { confirmed: true }), /stale/u, field)
  }
  const changed = { ...input, documents: input.documents.map((document, index) => index ? document
    : { ...document, bytes: Buffer.from('different original PDF') }) }
  assert.throws(() => applyInImageOptionLabelsPlan(changed, plan, { confirmed: true }), /original PDFs/u)
  const edited = structuredClone(plan); edited.decision.labels[0].labelRegion.x += .001
  assert.throws(() => applyInImageOptionLabelsPlan(input, edited, { confirmed: true }), /plan digest/u)
})

const mutations = {
  'missing label': m => { m.inImageOptionLabels[0].labels.pop() },
  'duplicate label': m => { m.inImageOptionLabels[0].labels[1].label = 'A' },
  'label outside parent': m => { m.inImageOptionLabels[0].labels[0].labelRegion.x = .99 },
  'label inside parent but outside its child': m => { m.inImageOptionLabels[0].labels[0].labelRegion = m.inImageOptionLabels[0].labels[1].labelRegion },
  'child does not match option': m => { m.inImageOptionLabels[0].labels[0].childMediaId = m.inImageOptionLabels[0].labels[1].childMediaId },
  'child crop changed': m => { m.inImageOptionLabels[0].labels[0].childRegion.width /= 2 },
  'child bytes digest changed': m => { m.inImageOptionLabels[0].labels[0].childSha256 = `sha256:${'0'.repeat(64)}` },
  'sealed evidence digest drift': m => { m.inImageOptionLabels[0].evidenceDigest = `sha256:${'0'.repeat(64)}` },
  'confirmation digest drift': m => { m.inImageOptionLabels[0].confirmationDigest = `sha256:${'0'.repeat(64)}` },
  'source PDF digest drift': m => { m.inImageOptionLabels[0].sourceDocumentSha256 = `sha256:${'0'.repeat(64)}` },
  'wrong source anchor': m => { m.inImageOptionLabels[0].anchorItemId += '-wrong' },
  'wrong parent region identity': m => { m.inImageOptionLabels[0].parentRegionId += '-wrong' },
  'wrong parent region geometry': m => { m.inImageOptionLabels[0].parentSource.region.width += .001 },
  'unreviewed original image': m => { m.inImageOptionLabels[0].sourceReview.labelsInParentPixels = false },
  'duplicate decision consumption': m => { m.inImageOptionLabels.push(structuredClone(m.inImageOptionLabels[0])) },
  'missing decision': m => { m.inImageOptionLabels = [] },
  'downgraded envelope': m => { m.schemaVersion = 'nck1-source-materialization-v3' },
  'foreign Reading owner': m => { m.inImageOptionLabels[0].questionId = m.groups[0].questions[0].questionId },
  'listening masquerade': m => { m.groups.find(group => group.groupId === selection.groupId).family = 'listening' },
  'missing ordinary figure': m => { m.media = m.media.filter(media => selection.labels.some(label => label.childMediaId === media.mediaId)) },
  'duplicated child placement': m => { m.groups.find(group => group.groupId === selection.groupId).blocks.push({
    kind: 'figure', blockId: 'duplicate-child', mediaId: selection.labels[0].childMediaId, caption: '', source: selection.parentSource }) },
}
for (const [name, mutate] of Object.entries(mutations)) {
  test(`public import rejects ${name}`, () => withNck1MaterializationSourceCache(() => {
    const bad = structuredClone(applied.materialization); mutate(bad)
    const rejected = importCanonicalCandidate({ ...joined, materializationBytes: encode(bad) })
    assert(rejected.issues.length > 0, name)
    assert(!compileNck1MaterializationCandidatePreview(rejected.candidate).compilation, name)
  }))
}

test('re-digested author plan cannot launder a foreign source anchor', () => {
  const changed = structuredClone(plan); changed.decision.anchorItemId += '-wrong'
  const { planDigest: _, ...body } = changed
  changed.planDigest = digestJson(body)
  assert.throws(() => applyInImageOptionLabelsPlan(input, changed, { confirmed: true }), /source-order anchor/u)
})
