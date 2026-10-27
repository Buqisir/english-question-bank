import assert from 'node:assert/strict'
import test from 'node:test'
import { makeSyntheticNck1OcrFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { produceNck1OcrMaterialization } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { deriveNck1MaterializationBundle } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1OcrOptionEmphasisAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { paragraphJoinSourceLocator } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'
import { projectCanonicalConsumerGroup } from '../../shared/paper-canonical/consumerProjection.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'
import { sealCanonicalPublication, validateCanonicalPublicationBundle } from '../../server/paper-canonical/publication.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport,
  isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { planMaterializationParagraphJoin, applyMaterializationParagraphJoinPlan } from './materialization-paragraph-joins.mjs'

const encode = value => new TextEncoder().encode(JSON.stringify(value))
const decode = value => JSON.parse(new TextDecoder().decode(value))
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
  assert.equal(consumption.authorityRef.manifestVersion, '78')
  const request = materializeNck1CanonicalRequest(joinedInput, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
  const historical = structuredClone(applied.materialization)
  historical.schemaVersion = 'nck1-source-materialization-v8'
  historical.paragraphJoins[0].schemaVersion = 'cross-page-paragraph-join-v1'
  const historicalCandidate = importCanonicalCandidate({ ...input, materializationBytes: encode(historical) })
  assert.deepEqual(historicalCandidate.issues, [])
  assert.equal(compileNck1MaterializationCandidatePreview(historicalCandidate.candidate).compilation.artifacts.canonicalPaper.paperPlan.authorityRef.manifestVersion, '74')
  assert.deepEqual(historicalCandidate.candidate.interpretation.groups.find(g => g.slotId === 'reading.a').content.blocks, blocks)
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

test('sealed v2 Reading/cloze/grammar joins preserve blanks, marks, pointers and public consumer integrity', async () => {
  const fixture = await makeSyntheticNck1OcrFixture({ crossPageParagraph: true, crossPageBlanks: true })
  const confirmation = { ...fixture.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v2' }
  const produced = produceNck1OcrMaterialization({ paperId: fixture.paperId,
    documents: fixture.sourceDocuments, evidence: fixture.evidence, confirmation })
  assert.equal(produced.disposition, 'ready_for_verification', JSON.stringify(produced.issues))
  const m = produced.materialization
  const sourceItems = confirmation.documents.flatMap(document => document.pages.flatMap(page => {
    const observations = fixture.evidence.documents.find(d => d.documentId === document.documentId).pages.find(p => p.page === page.page).observations
    return page.orderedItems.map(item => ({ item, source: paragraphJoinSourceLocator(document.documentId, page.page, item, observations) }))
  }))
  const grammar = m.groups.find(g => g.family === 'grammar-fill')
  assert.equal(grammar.blocks[1].content[0].kind, 'blank_ref', 'right starts with blank61')
  const readingRight = sourceItems.find(value => value.item.text === 'a battery that lasts up to 14 days.').item
  readingRight.sourceEmphasis = [{ start: 2, end: 9, marks: ['underline'] }]
  const alpha = sourceItems.find(value => value.item.text.startsWith('21.')).item
  const alphaStart = alpha.text.indexOf('Alpha')
  alpha.sourceEmphasis = [{ start: alphaStart, end: alphaStart + 5, marks: ['underline'] }]
  let input = { kind: 'nck1-source-materialization', materializationBytes: encode({ ...m, schemaVersion: 'nck1-source-materialization-v11' }),
    documents: fixture.sourceDocuments.map(d => ({ documentId: d.documentId, bytes: d.bytes })),
    media: produced.mediaFiles, ocrSourceBytes: { evidenceBytes: encode(fixture.evidence), confirmationBytes: encode(confirmation) } }
  const receipt = encode({ paperId: m.paperId, revisionId: 'retained-v2-revision', confirmationId: 'retained-v2-confirmation',
    reviewerKind: 'import_agent', sourceSetDigest: confirmation.sourceSetDigest, evidenceDigest: confirmation.evidenceDigest, confirmation })
  const immutable = structuredClone({ documents: input.documents, ocrSourceBytes: input.ocrSourceBytes, receipt })
  const original = deriveNck1MaterializationBundle(input)
  assert.deepEqual(original.issues, [])
  const relations = []
  let previous = null
  for (const slot of ['reading.a', 'cloze', 'grammar-fill']) {
    const group = m.groups.find(g => g.slotId === slot)
    assert.equal(group.blocks.length, 2, slot)
    const items = group.blocks.map(block => sourceItems.find(value => digestJson(value.source) === digestJson(block.source)).item)
    const plan = planMaterializationParagraphJoin(input, receipt,
      { groupId: group.groupId, itemIds: items.map(item => item.itemId), reason: `合成原页 ${slot} 续行不缩进，属于同一自然段` })
    assert.deepEqual(plan.before, items.map(item => item.text))
    assert.equal(plan.binding.materializationSha256, sha256(input.materializationBytes))
    const applied = applyMaterializationParagraphJoinPlan(input, receipt, plan, { confirmed: true })
    assert.deepEqual(applied.materialization.groups, m.groups)
    if (previous) assert.throws(() => applyMaterializationParagraphJoinPlan(input, receipt, previous, { confirmed: true }), /stale/)
    input = { ...input, materializationBytes: applied.materializationBytes }
    relations.push(plan.relation); previous = plan
  }
  const imported = importCanonicalCandidate(input)
  assert.deepEqual(imported.issues, [])
  const derived = deriveNck1MaterializationBundle(input)
  assert.deepEqual(derived.issues, [])
  for (const group of derived.source.groups.filter(g => !relations.some(r => r.groupId === g.groupId))) {
    assert.deepEqual(group.content, original.source.groups.find(g => g.groupId === group.groupId).content,
      'ordinary paragraphs outside the explicitly selected relations remain separate')
  }
  for (const relation of relations) {
    const raw = m.groups.find(g => g.groupId === relation.groupId)
    const group = derived.source.groups.find(g => g.groupId === relation.groupId)
    assert.equal(group.content.blocks.length, 1)
    const paragraph = group.content.blocks[0]
    const originalGroup = original.source.groups.find(g => g.groupId === relation.groupId)
    for (const node of originalGroup.content.blocks.flatMap(block => block.inlines)) {
      assert.deepEqual(paragraph.inlines.find(value => value.nodeId === node.nodeId), node,
        'joining preserves every original inline ID, text, mark and blank identity')
    }
    const rawBlankIds = raw.blocks.flatMap(block => block.content.filter(node => node.kind === 'blank_ref').map(node => node.blankId))
    assert.deepEqual(paragraph.inlines.filter(node => node.kind === 'blank_ref').map(node => node.blankId), rawBlankIds)
    assert.equal(new Set(rawBlankIds).size, rawBlankIds.length)
    assert.equal(group.sourceSpanRefsByTarget[`content_node:${paragraph.nodeId}`].length, 2)
    assert(!Object.hasOwn(group.sourceSpanRefsByTarget, `content_node:${raw.blocks[1].blockId}`))
    for (const [index, fragment] of relation.fragments.entries()) {
      const observation = derived.source.observations.find(o => o.observationId === `observation:paragraph-join:${relation.joinId}:${index + 1}`)
      assert.equal(observation.extraction.version, '16')
      assert.equal(observation.value.text, sourceItems.find(value => value.item.itemId === fragment.itemId).item.text)
      for (const part of raw.blocks[index].content) {
        if (part.kind !== 'blank_ref') continue
        const node = paragraph.inlines.find(node => node.blankId === part.blankId)
        assert.equal(node.nodeId, `blank-ref:${part.blankId}`)
        assert(group.sourceSpanRefsByTarget[`content_node:${node.nodeId}`].includes(`source-span:${observation.observationId}`))
      }
    }
  }
  const reading = derived.source.groups.find(g => g.slotId === 'reading.a')
  assert.deepEqual(reading.content.blocks[0].inlines.filter(n => n.marks?.includes('underline')).map(n => n.text), ['battery'])
  assert.deepEqual(reading.variant.choiceOwnership.sets[0].options[0].content.filter(n => n.marks?.includes('underline')).map(n => n.text), ['Alpha'])
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
  for (const selection of consumption.selections) {
    if (selection.familyContractId === 'continuation-writing') assert(selection.projectedOccurrenceDigests.length)
    for (const groupId of selection.groupIds) assert(projectCanonicalConsumerGroup({ consumption, familyContractId: selection.familyContractId, groupId }))
  }
  const request = materializeNck1CanonicalRequest(input, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
  const sealed = sealCanonicalPublication({ compilation: admitted.compilation, sourceAsset: admitted.sourceAsset,
    sourceAssetVersion: 1, nck1MaterializationConfirmationProof: admitted.proof })
  const published = validateCanonicalPublicationBundle({ manifest: sealed.manifest, sourceAsset: sealed.sourceAsset,
    readArtifact: path => sealed.artifacts[path] ?? sealed.sourceEvidence[path] })
  assert.equal(published.manifest.authority.manifestVersion, '78')
  for (const relation of relations) {
    const group = published.groups.find(g => g.identity.groupId === relation.groupId)
    assert.deepEqual(group.content, preview.compilation.artifacts.canonicalPaper.questionGroups.find(g => g.identity.groupId === relation.groupId).content,
      'sealed publication roundtrip preserves exact joined content')
  }
  assert.deepEqual({ documents: input.documents, ocrSourceBytes: input.ocrSourceBytes, receipt }, immutable)
  for (const ref of [nck1ParagraphJoinAuthorityRef, nck1OcrOptionEmphasisAuthorityRef]) {
    assert(importCanonicalCandidate(input, undefined, { materializationAuthorityRef: ref }).issues.length)
  }
  const rejected = raw => assert(importCanonicalCandidate({ ...input, materializationBytes: encode(raw) }).issues.length)
  for (const mutate of [
    group => { const refs = group.blocks[1].content.filter(n => n.kind === 'blank_ref'); [refs[0].blankId, refs[1].blankId] = [refs[1].blankId, refs[0].blankId] },
    group => { group.blocks[1].content[0].blankId = group.blocks[1].content.findLast(n => n.kind === 'blank_ref').blankId },
    group => { group.blocks[1].content.shift() },
    group => { group.blocks[1].content[0].blankId = 'blank:foreign:61' },
    group => { group.blocks[1].content[0] = { kind: 'text', text: '__61__' } },
    group => { group.questions[5].sourceNumber = 62 },
    group => { group.questions[5].canonicalNumber = 62 },
    group => { group.questions[5].questionId = group.questions[6].questionId },
    group => { group.questions[5].blankId = group.questions[6].blankId },
  ]) {
    const raw = decode(input.materializationBytes); mutate(raw.groups.find(g => g.family === 'grammar-fill')); rejected(raw)
  }
  for (const version of ['nck1-source-materialization-v8', 'nck1-source-materialization-v11', 'nck1-source-materialization-v13']) {
    rejected({ ...decode(input.materializationBytes), schemaVersion: version })
  }
  for (const version of ['nck1-ocr-source-confirmation-v1', 'nck1-ocr-source-confirmation-v4']) {
    const bad = { ...input, ocrSourceBytes: { ...input.ocrSourceBytes, confirmationBytes: encode({ ...confirmation, schemaVersion: version }) } }
    assert(importCanonicalCandidate(bad).issues.length)
  }
  const visual = structuredClone(confirmation)
  visual.documents[0].pages.find(page => page.visualClassifications.length).visualClassifications[0].classification = 'content_media'
  assert(importCanonicalCandidate({ ...input, ocrSourceBytes: { ...input.ocrSourceBytes, confirmationBytes: encode(visual) } }).issues.length)
  const split = structuredClone(confirmation)
  const splitItems = split.documents.flatMap(document => document.pages.flatMap(page => page.orderedItems))
  const grammarJoin = relations.find(relation => relation.groupId === grammar.groupId)
  const splitLeft = splitItems.find(item => item.itemId === grammarJoin.fragments[0].itemId)
  const splitRight = splitItems.find(item => item.itemId === grammarJoin.fragments[1].itemId)
  assert(splitRight.text.startsWith('61._____'))
  splitLeft.text += ' 61.__'; splitRight.text = splitRight.text.slice('61.__'.length)
  const splitProduced = produceNck1OcrMaterialization({ paperId: fixture.paperId,
    documents: fixture.sourceDocuments, evidence: fixture.evidence, confirmation: split })
  assert(splitProduced.materialization.issues.length, 'the existing producer rejects the split token without repairing it')
  const splitRaw = decode(input.materializationBytes)
  for (const relation of splitRaw.paragraphJoins) relation.confirmationSha256 = sha256(encode(split))
  assert(importCanonicalCandidate({ ...input, materializationBytes: encode(splitRaw),
    ocrSourceBytes: { ...input.ocrSourceBytes, confirmationBytes: encode(split) } }).issues.length)
})
