import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveOcrContentVisual } from './nck1OcrContentVisuals.mjs'

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
