import assert from 'node:assert/strict'
import test from 'node:test'
import { makeSyntheticNck1OcrFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { produceNck1OcrMaterialization } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { deriveNck1MaterializationBundle } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { nck1WritingGivenRefsAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport,
  isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { planMaterializationParagraphJoin, applyMaterializationParagraphJoinPlan } from './materialization-paragraph-joins.mjs'

const encode = value => new TextEncoder().encode(JSON.stringify(value))
test('confirmed cross-page relation joins only Canonical, survives public admission and rejects tampering/old authority', async () => {
  const fixture = await makeSyntheticNck1OcrFixture({ crossPageParagraph: true })
  const confirmation = { ...fixture.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v3' }
  const produced = produceNck1OcrMaterialization({ paperId: fixture.paperId,
    documents: fixture.sourceDocuments, evidence: fixture.evidence, confirmation })
  assert.equal(produced.disposition, 'ready_for_verification')
  const m = produced.materialization
  const group = m.groups.find(g => g.slotId === 'reading.a')
  assert.equal(group.blocks.length, 2)
  assert.equal(group.blocks[1].source.page, group.blocks[0].source.page + 1)
  const items = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .filter(item => group.blocks.some(block => block.content.map(inline => inline.text).join('') === item.text))
  assert.equal(items.length, 2)
  // Keep an emphasis range on the second fragment: its source offset stays
  // local to that historical item after the paragraphs are combined.
  items[1].sourceEmphasis = [{ start: 2, end: 9, marks: ['underline'] }]
  const input = { kind: 'nck1-source-materialization', materializationBytes: encode(m),
    documents: fixture.sourceDocuments.map(d => ({ documentId: d.documentId, bytes: d.bytes })),
    media: produced.mediaFiles, ocrSourceBytes: { evidenceBytes: encode(fixture.evidence), confirmationBytes: encode(confirmation) } }
  const receipt = encode({ paperId: m.paperId, revisionId: 'sealed-ocr-revision', confirmationId: 'sealed-confirmation',
    reviewerKind: 'import_agent', sourceSetDigest: confirmation.sourceSetDigest, evidenceDigest: confirmation.evidenceDigest, confirmation })
  const old = importCanonicalCandidate(input)
  assert.deepEqual(old.issues, [])
  const original = old.candidate.interpretation.groups.find(g => g.slotId === 'reading.a').content.blocks
  assert.equal(original.length, 2)
  const plan = planMaterializationParagraphJoin(input, receipt,
    { groupId: group.groupId, itemIds: items.map(item => item.itemId), reason: '原页续行未缩进，同一自然段' })
  const applied = applyMaterializationParagraphJoinPlan(input, receipt, plan, { confirmed: true })
  assert.deepEqual(applied.materialization.groups, m.groups)
  const joinedInput = { ...input, materializationBytes: applied.materializationBytes }
  const imported = importCanonicalCandidate(joinedInput)
  assert.deepEqual(imported.issues, [])
  const blocks = imported.candidate.interpretation.groups.find(g => g.slotId === 'reading.a').content.blocks
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].inlines.map(inline => inline.text).join(''),
    'A small device can locate your dog accurately, with a battery that lasts up to 14 days.')
  assert.deepEqual(blocks[0].inlines.filter(inline => inline.marks?.includes('underline')).map(inline => inline.text), ['battery'])
  for (const inline of original.flatMap(block => block.inlines)) {
    assert(inline.nodeId)
    assert(blocks[0].inlines.some(joined => joined.nodeId === inline.nodeId && joined.text === inline.text))
  }
  const derived = deriveNck1MaterializationBundle(joinedInput)
  const derivedGroup = derived.source.groups.find(g => g.slotId === 'reading.a')
  assert.equal(derived.source.observations.filter(o => o.kind === 'source_cross_page_paragraph_fragment').length, 2)
  assert.equal(derivedGroup.sourceSpanRefsByTarget[`content_node:${blocks[0].nodeId}`].length, 2)
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
  assert.equal(consumption.authorityRef.manifestVersion, '74')
  const request = materializeNck1CanonicalRequest(joinedInput, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
  const legacy = importCanonicalCandidate(joinedInput, undefined, { materializationAuthorityRef: nck1WritingGivenRefsAuthorityRef })
  assert(legacy.issues.length > 0, 'v73 cannot admit the new relation')
  for (const mutate of [
    value => { value.paragraphJoins[0].confirmationSha256 = `sha256:${'0'.repeat(64)}` },
    value => { value.paragraphJoins[0].fragments[0].observationIds = ['forged-observation'] },
    value => { value.groups[0].blocks[0].content[0].text += ' forged' },
    value => { value.paragraphJoins[0].fragments.reverse() },
  ]) {
    const bad = structuredClone(applied.materialization); mutate(bad)
    const rejected = importCanonicalCandidate({ ...joinedInput, materializationBytes: encode(bad) })
    assert(rejected.issues.length > 0)
    assert(!compileNck1MaterializationCandidatePreview(rejected.candidate).compilation)
  }
})
