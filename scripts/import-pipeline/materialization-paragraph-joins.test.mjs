import assert from 'node:assert/strict'
import test from 'node:test'
import { makeFixture } from '../verify-nck1-source-materialization.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { resolveCrossPageParagraphJoins } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'
import { verifyCrossPageParagraphJoinEvidence } from '../../server/paper-import/crossPageParagraphJoinEvidence.mjs'
import { planMaterializationParagraphJoin, applyMaterializationParagraphJoinPlan } from './materialization-paragraph-joins.mjs'
import { restoreOcrSourcePresentation } from './materialization-presentation.mjs'
import { confirmMaterializationWritingGivens } from './materialization-writing-givens.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../../shared/paper-canonical/sourcePresentation.mjs'
const encode = value => new TextEncoder().encode(JSON.stringify(value))
const hash = value => sha256(encode(value))
function fixture() {
  const m = makeFixture(), group = m.groups[0]
  group.blocks[0].content = [{ kind: 'text', text: 'This paragraph continues with' }]
  group.blocks[1].content = [{ kind: 'text', text: 'the same sentence on the next page.' }]
  group.blocks.forEach((block, index) => {
    block.source = { ...block.source, page: index + 1, region: { x: 0.1, y: 0.7 - index * 0.6, width: 0.7, height: 0.05 } }
    // Match the source resolver's floating-point union exactly.
    block.source.region.height = block.source.region.y + 0.05 - block.source.region.y
  })
  const pages = group.blocks.map((block, index) => ({ page: index + 1,
    orderedItems: [{ itemId: `paper:item-${index + 1}`, observationIds: [`word-${index + 1}`], text: block.content[0].text }],
    furnitureObservationIds: [], visualClassifications: [] }))
  const evidence = { paperId: m.paperId, sourceSetDigest: hash('sources'), evidenceDigest: hash('evidence'),
    documents: [{ documentId: 'paper', pages: pages.map((page, index) => ({
      page: page.page, observations: [{ observationId: `word-${index + 1}`, region: group.blocks[index].source.region }],
    })) }] }
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3', paperId: m.paperId,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest, confirmed: true,
    documents: [{ documentId: 'paper', pages }] }
  const receipt = { paperId: m.paperId, revisionId: 'rev-one', confirmationId: 'confirmation-one',
    reviewerKind: 'import_agent', sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest, confirmation }
  const input = { materializationBytes: encode(m), documents: [{ documentId: 'paper', bytes: encode('source') }],
    ocrSourceBytes: { evidenceBytes: encode(evidence), confirmationBytes: encode(confirmation) } }
  const receiptBytes = encode(receipt)
  const options = { groupId: group.groupId, itemIds: pages.map(page => page.orderedItems[0].itemId), reason: '原页续行不缩进；属于同一自然段' }
  const plan = planMaterializationParagraphJoin(input, receiptBytes, options)
  const result = applyMaterializationParagraphJoinPlan(input, receiptBytes, plan, { confirmed: true }).materialization
  const proof = { evidence, confirmation, confirmationBytes: input.ocrSourceBytes.confirmationBytes,
    expected: structuredClone(m), resolved: { issues: [], structures: new Map([['paper', {
      body: group.blocks.map(block => ({ kind: 'paragraph', text: block.content[0].text, sourceIndex: block.source })),
    }]]) } }
  return { m, input, receiptBytes, options, plan, result, proof }
}

test('explicit plan keeps every source block/text/pointer; unselected legacy input stays closed', () => {
  const f = fixture()
  assert.deepEqual(validateNck1SourceMaterialization(f.m), [])
  assert.deepEqual(validateNck1SourceMaterialization(f.result), [])
  assert.deepEqual(f.result.groups, f.m.groups)
  assert.deepEqual(f.result.documents, f.m.documents)
  assert.equal(resolveCrossPageParagraphJoins(f.result).length, 1)
  assert.equal(verifyCrossPageParagraphJoinEvidence(f.result, f.proof).length, 1)
  for (let v = 1; v <= 7; v++) {
    const old = { ...f.result, schemaVersion: `nck1-source-materialization-v${v}` }
    assert(validateNck1SourceMaterialization(old).some(issue => issue.code === 'MATERIALIZATION_ROOT_INVALID'))
  }
})

test('confirmation, plan and all bound bytes fail closed before mutation', () => {
  const f = fixture(), original = structuredClone(f.input)
  for (const confirmed of [undefined, false, 'true', 1]) {
    assert.throws(() => applyMaterializationParagraphJoinPlan(f.input, f.receiptBytes, f.plan, { confirmed }), /explicit/)
  }
  for (const change of [
    input => { input.materializationBytes = encode({ ...f.m, paperId: 'paper-other' }) },
    input => { input.ocrSourceBytes.evidenceBytes = encode({ ...f.proof.evidence, extra: true }) },
    input => { input.ocrSourceBytes.confirmationBytes = encode({ ...f.proof.confirmation, extra: true }) },
    input => { input.documents[0].bytes = encode('changed source') },
  ]) {
    const input = structuredClone(f.input); change(input)
    assert.throws(() => applyMaterializationParagraphJoinPlan(input, f.receiptBytes, f.plan, { confirmed: true }))
  }
  const changed = structuredClone(f.plan); changed.before[0] += ' altered'
  assert.throws(() => applyMaterializationParagraphJoinPlan(f.input, f.receiptBytes, changed, { confirmed: true }), /digest/)
  const forged = structuredClone(f.plan); forged.relation.separator = '\n'
  const { planDigest, ...body } = forged
  forged.planDigest = digestJson(body)
  assert.throws(() => applyMaterializationParagraphJoinPlan(f.input, f.receiptBytes, forged, { confirmed: true }), /differs/)
  assert.deepEqual(f.input, original)
})

test('structural boundaries reject cross-group, skipped pages, duplicate consumption and changed locators', () => {
  const changes = [
    m => { m.paragraphJoins[0].groupId = m.groups[1].groupId },
    m => { m.groups[0].blocks[1].source.page = 3; m.paragraphJoins[0].fragments[1].source.page = 3 },
    m => { m.paragraphJoins.push(structuredClone(m.paragraphJoins[0])) },
    m => { m.paragraphJoins[0].fragments.reverse() },
    m => { m.paragraphJoins[0].fragments[0].source.region.x += 0.01 },
    m => { m.paragraphJoins[0].separator = '  ' },
    m => { m.paragraphJoins[0].sourceReview.sameNaturalParagraph = false },
    m => { m.groups[0].blocks[0].content[0].text += ' ' },
    m => { m.groups[1].blocks.push({ ...structuredClone(m.groups[0].blocks[0]), blockId: 'duplicate-source' }) },
    m => { m.groups[0].blocks.splice(1, 0, { ...structuredClone(m.groups[1].blocks[0]), blockId: 'intervening' }) },
    m => { m.paragraphJoins = [] },
    m => { m.paragraphJoins[0].fragments[1] = null },
  ]
  for (const change of changes) {
    const { result } = fixture(); change(result)
    assert(validateNck1SourceMaterialization(result).length > 0)
  }
})

test('immutable stream rejects intervening item/image, wrong ownership, observation, text and digest', () => {
  const changes = [
    f => { f.result.paragraphJoins[0].evidenceDigest = hash('other') },
    f => { f.result.paragraphJoins[0].fragments[0].observationIds = ['other'] },
    f => { f.proof.confirmation.documents[0].pages[0].orderedItems.push({ itemId: 'later', text: 'not furniture' }) },
    f => { f.proof.resolved.structures.get('paper').body.splice(1, 0, { kind: 'paragraph', materializedMedia: { mediaId: 'image' } }) },
    f => { f.proof.expected.groups[0].family = 'cloze' },
    f => { f.result.groups[0].blocks[0].content[0].text += ' changed' },
    f => { f.proof.confirmation.documents[0].pages[0].visualClassifications.push({ classification: 'content_media', itemIds: ['paper:item-1'] }) },
  ]
  for (const change of changes) {
    const f = fixture(); change(f)
    assert.throws(() => verifyCrossPageParagraphJoinEvidence(f.result, f.proof))
  }
})

test('existing explicit givens and cached presentation preserve v8 relations', () => {
  const f = fixture()
  const withGivens = confirmMaterializationWritingGivens(f.result, {
    groupId: f.result.groups[7].groupId, givenBlockRefs: ['block:application-salutation'], confirmed: true,
  })
  assert.equal(withGivens.schemaVersion, 'nck1-source-materialization-v8')
  assert.deepEqual(withGivens.paragraphJoins, f.result.paragraphJoins)
  withGivens.sourcePresentation = {
    instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS).filter(slot => !slot.startsWith('listening.'))
      .map(slotId => ({ slotId, text: `Source direction ${slotId}`, source: f.result.groups[0].blocks[0].source })),
    listeningExample: null,
  }
  assert.deepEqual(validateNck1SourceMaterialization(withGivens), [])
  assert.deepEqual(restoreOcrSourcePresentation({ materialization: withGivens, evidence: f.proof.evidence,
    confirmation: f.proof.confirmation }), withGivens)
})

test('v11 authoring retains the successor when joining paragraphs and confirming writing givens', () => {
  const f = fixture()
  const raw = { ...f.m, schemaVersion: 'nck1-source-materialization-v11' }
  const input = { ...f.input, materializationBytes: encode(raw) }
  const plan = planMaterializationParagraphJoin(input, f.receiptBytes, f.options)
  const joined = applyMaterializationParagraphJoinPlan(input, f.receiptBytes, plan, { confirmed: true }).materialization
  assert.equal(joined.schemaVersion, raw.schemaVersion)
  assert.deepEqual(joined.groups, raw.groups)
  const withGivens = confirmMaterializationWritingGivens(joined, {
    groupId: joined.groups[7].groupId, givenBlockRefs: ['block:application-salutation'], confirmed: true,
  })
  assert.equal(withGivens.schemaVersion, raw.schemaVersion)
  assert.deepEqual(withGivens.paragraphJoins, joined.paragraphJoins)
  assert.deepEqual(validateNck1SourceMaterialization(withGivens), [])
})
