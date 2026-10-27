import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveOcrContentVisual } from './nck1OcrContentVisuals.mjs'
import { buildNck1OcrSourceEvidence, nck1OcrEvidenceDigest, resolveConfirmedNck1OcrEvidence } from './nck1OcrSourceEvidence.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

function fixture(imageOnly = false) {
  const observations = [
    { observationId: 'header', region: { x: .1, y: .01, width: .5, height: .03 } },
    ...(!imageOnly ? [{ observationId: 'label', region: { x: .2, y: .2, width: .3, height: .1 } }] : []),
    { observationId: 'body', region: { x: .1, y: .6, width: .8, height: .1 } },
  ]
  const visual = { regionId: 'figure', classification: 'content_media',
    itemIds: imageOnly ? [] : ['label'], afterItemId: null }
  return { paperId: 'paper-page-top', document: {
    documentId: 'question', role: 'question_source', mediaType: 'application/pdf',
  }, page: { page: 3, observations, furnitureObservationIds: ['header'],
    orderedItems: [...(!imageOnly ? [{ itemId: 'label', text: 'WIN!', observationIds: ['label'] }] : []),
      { itemId: 'body', text: 'Question below.', observationIds: ['body'] }],
    visualClassifications: [visual],
  }, visual, region: { regionId: 'figure', region: { x: .1, y: .1, width: .8, height: .3 } },
  claimedItems: new Set() }
}

for (const imageOnly of [false, true]) {
  test(`question page-top figure (${imageOnly ? 'imageOnly' : 'OCR text'}) follows explicit furniture`, () => {
    const f = fixture(imageOnly)
    const result = resolveOcrContentVisual(f)
    assert.equal(result.insertAt, 0)
    assert.deepEqual(result.itemIds, f.visual.itemIds)
    assert.deepEqual(result.media.source, { kind: 'page_region', documentId: 'question', page: 3,
      region: f.region.region })
    assert.equal(result.item.materializedMedia.mediaId, result.media.mediaId)
    assert.deepEqual(result.visual, { visualId: result.media.mediaId.replace('media:', 'visual:'),
      page: 3, region: f.region.region, disposition: 'content_media', targetId: result.media.mediaId })
  })
}

for (const [name, mutate] of [
  ['preceding content item', f => f.page.orderedItems.unshift({ itemId: 'extra', text: 'Earlier', observationIds: ['header'] })],
  ['unexplained text above crop', f => { f.page.furnitureObservationIds = [] }],
  ['cross-page anchor', f => { f.visual.afterItemId = 'previous-page:item' }],
  ['missing explicit boundary', f => { delete f.visual.afterItemId }],
  ['answer page-top image', f => { f.document.role = 'official_answers' }],
  ['merged source', f => { f.document.role = 'question_and_answers' }],
  ['duplicate boundary', f => { f.page.visualClassifications.push({ ...f.visual, regionId: 'other' }) }],
  ['non-contiguous text', f => { f.visual.itemIds.push('third'); f.page.orderedItems.push({
    itemId: 'third', text: 'Third', observationIds: ['third'],
  }) }],
  ['claimed text', f => f.claimedItems.add('label')],
  ['unaccounted crop text', f => f.page.observations.push({ observationId: 'unknown',
    region: { x: .3, y: .25, width: .1, height: .05 } })],
  ['out-of-crop text', f => { f.region.region.height = .05 }],
]) {
  test(`page-top rejects ${name}`, () => {
    const f = fixture()
    mutate(f)
    assert.throws(() => resolveOcrContentVisual(f))
  })
}

test('imageOnly cannot precede unexplained source content above its crop', () => {
  const f = fixture(true)
  f.page.observations.find(o => o.observationId === 'body').region.y = .05
  assert.throws(() => resolveOcrContentVisual(f))
})

test('nonempty same-page anchors keep identical image IDs and output', () => {
  const f = fixture()
  f.visual.afterItemId = 'before'
  f.page.orderedItems.unshift({ itemId: 'before', text: 'Before', observationIds: ['header'] })
  f.page.furnitureObservationIds = []
  const old = resolveOcrContentVisual(f)
  const top = fixture()
  assert.deepEqual(old, { ...resolveOcrContentVisual(top), insertAt: 1 })
})

// Exercise the public closure, including the immutable PDF raster and OCR
// evidence digest, rather than assuming visual resolver output is trusted.
function adjacentFixture(role = 'question_source') {
  const bytes = productPdfBytes(1, 'Adjacent visual fixture')
  const document = { documentId: 'source', role, mediaType: 'application/pdf',
    bytes, sha256: sha256(bytes), byteLength: bytes.length, pageCount: 1 }
  const items = [
    ['before', 'Before.', .05, .1], ['a1', 'Ingredients one', .12, .25],
    ['a2', 'Ingredients two', .12, .3], ['b1', 'Method one', .62, .25],
    ['b2', 'Method two', .62, .3], ['title', 'The healthy bit', .1, .7],
  ]
  const observations = items.map(([id, text, x, y]) => ({ observationId: `obs-${id}`, regionId: `text-${id}`,
    text, region: { x, y, width: .1, height: .02 }, confidence: 1, alternatives: [] }))
  const regions = observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region }))
  regions.push({ regionId: 'image-a', kind: 'visual', region: { x: .1, y: .2, width: .3, height: .2 } },
    { regionId: 'image-b', kind: 'visual', region: { x: .6, y: .2, width: .3, height: .2 } })
  const paperId = 'paper-adjacent-visual'
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents: [document],
    engine: { name: 'synthetic', version: '1' }, confidenceThreshold: .97,
    engineDocuments: [{ documentId: 'source', pages: [{ page: 1, observations, regions,
      readingOrderEdges: observations.slice(1).map((o, i) => ({ before: observations[i].observationId, after: o.observationId })) }] }] })
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3', paperId, confirmed: true,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest,
    documents: [{ documentId: 'source', pages: [{ page: 1, furnitureObservationIds: [],
      orderedItems: items.map(([id, text]) => ({ itemId: id, observationIds: [`obs-${id}`], text })),
      visualClassifications: [
        { regionId: 'image-a', classification: 'content_media', itemIds: ['a1', 'a2'], afterItemId: 'before' },
        { regionId: 'image-b', classification: 'content_media', itemIds: ['b1', 'b2'], afterItemId: 'a2' },
      ] }] }] }
  return { paperId, documents: [document], evidence, confirmation }
}

function replay(f) {
  f.evidence.evidenceDigest = nck1OcrEvidenceDigest(f.evidence)
  f.confirmation.evidenceDigest = f.evidence.evidenceDigest
  return resolveConfirmedNck1OcrEvidence(f)
}

test('public OCR closure preserves two adjacent question images and the following title', () => {
  const f = adjacentFixture()
  const result = replay(f)
  assert.deepEqual(result.issues, [])
  const body = result.structures.get('source').body
  assert.deepEqual(body.map(item => item.materializedMedia ? 'image' : item.text),
    ['Before.', 'image', 'image', 'The healthy bit'])
  assert.deepEqual(body.filter(item => item.materializedMedia).map(item => item.materializedMedia.mediaId),
    result.contentMedia.map(media => media.mediaId))
  assert.equal(new Set(result.contentMedia.map(media => media.mediaId)).size, 2)
  const reversed = structuredClone(f)
  reversed.confirmation.documents[0].pages[0].visualClassifications.reverse()
  const reversedResult = replay(reversed)
  assert.deepEqual(reversedResult.issues, [])
  assert.deepEqual(reversedResult.structures, result.structures)
  assert.deepEqual(new Set(reversedResult.contentMedia.map(item => item.mediaId)),
    new Set(result.contentMedia.map(item => item.mediaId)))
})

test('public OCR closure rejects unsafe adjacent-image boundaries', () => {
  for (const [name, mutate] of [
    ['predecessor interior', p => { p.visualClassifications[1].afterItemId = 'a1' }],
    ['self anchor', p => { p.visualClassifications[1].afterItemId = 'b1' }],
    ['missing anchor', p => { delete p.visualClassifications[1].afterItemId }],
    ['other page anchor', p => { p.visualClassifications[1].afterItemId = 'page-2:item' }],
    ['other document anchor', p => { p.visualClassifications[1].afterItemId = 'other-document:item' }],
    ['nonconsecutive items', p => { p.visualClassifications[1].itemIds = ['b1', 'title'] }],
    ['duplicate items', p => { p.visualClassifications[1].itemIds = ['b1', 'b1'] }],
    ['empty following image', p => { p.visualClassifications[1].itemIds = [] }],
    ['failed predecessor', p => { p.visualClassifications[0].itemIds = ['a1', 'a1'] }],
  ]) {
    const f = adjacentFixture()
    mutate(f.confirmation.documents[0].pages[0])
    assert(replay(f).issues.length > 0, name)
  }
  const overlap = adjacentFixture()
  Object.assign(overlap.evidence.documents[0].pages[0].regions.find(r => r.regionId === 'image-b').region,
    { x: .39, width: .36 })
  assert(replay(overlap).issues.some(i => /anchor cannot be consumed/u.test(i.message)), 'overlapping source rectangles')
  const answers = adjacentFixture('official_answers')
  assert(replay(answers).issues.some(i => /anchor cannot be consumed/u.test(i.message)), 'answer figures do not acquire a boundary')
})

test('public OCR closure retains only the exact table-end boundary', () => {
  const f = adjacentFixture()
  const page = f.confirmation.documents[0].pages[0]
  page.visualClassifications[0] = { regionId: 'image-a', classification: 'semantic_table',
    rows: [{ header: false, cells: [['a1'], ['a2']] }] }
  const result = replay(f)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.structures.get('source').body.map(item => item.kind === 'table' ? 'table'
    : item.materializedMedia ? 'image' : item.text), ['Before.', 'table', 'image', 'The healthy bit'])
  page.visualClassifications[1].afterItemId = 'a1'
  assert(replay(f).issues.length > 0)
})
