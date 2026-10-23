import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { captureSourceReferenceFigure } from '../../server/paper-import/sourceReferenceImages.mjs'

function fixture({ figure = false } = {}) {
  const bytes = productPdfBytes(1, 'Synthetic reference producer source')
  const rows = [
    ['第四部分 写作', .08], ['第一节', .11], ['Possible Version 1', .15],
    ['Our design shows how we could', .2, .13, figure ? .55 : .77],
    ['share a cheerful moment.', .23, .1, .35],
    ...(figure ? [['Picture words', .24, .73, .1]] : []),
    ['Another natural paragraph begins here.', .29, .13, .77],
    ['Possible Version 2', .36],
    ['World Smile Day remains legitimate prose.', .4, .13, .77],
  ]
  const observations = []
  const orderedItems = rows.map(([text, y, x = .1, width = .8], i) => ({
    itemId: `item:${i}`, text,
    observationIds: Array.from({ length: 4 }, (_, k) => {
      const observationId = `word:${i}:${k}`
      observations.push({ observationId, region: { x: x + width * k / 4, y, width: width / 4, height: .015 } })
      return observationId
    }),
  }))
  const region = { regionId: 'answers:figure:color', kind: 'visual',
    region: { x: .7, y: .195, width: .15, height: .07 } }
  return {
    materialization: { paperId: 'paper-producer-test',
      documents: [{ documentId: 'answers', role: 'official_answers', mediaType: 'application/pdf',
        sha256: sha256(bytes), pageCount: 1, byteLength: bytes.length }],
      groups: [{ groupId: 'writing:application', writingTask: { taskType: 'application' } }] },
    evidence: { documents: [{ documentId: 'answers', pages: [{ page: 1, observations, regions: [region] }] }] },
    confirmation: { documents: [{ documentId: 'answers', pages: [{ page: 1, orderedItems, furnitureObservationIds: [],
      visualClassifications: figure ? [{ regionId: region.regionId, classification: 'content_media',
        itemIds: ['item:5'], afterItemId: 'item:4' }] : [] }] }] },
    sourceDocuments: [{ documentId: 'answers', bytes }],
    region,
  }
}
const capture = f => buildSourceReferences(f.materialization, f.evidence, f.confirmation,
  { sourceDocuments: f.sourceDocuments })

for (const [separator, label] of [
  ...[' ', '：', ': ', ''].map(separator => [separator, '作答示例']),
  [' ： ', '作答示例 ：'],
]) test(`merged headings ${JSON.stringify([separator, label])} capture both tasks and original locators`, () => {
  const f = fixture()
  f.materialization.groups.push({ groupId: 'writing:continuation', writingTask: { taskType: 'continuation' } })
  const items = f.confirmation.documents[0].pages[0].orderedItems
  items[1].text = `第一节${separator}${label}`
  items.splice(2, 1)
  const second = items.find(item => item.text === 'Possible Version 2')
  second.text = `第二节${separator}${label}`
  const before = structuredClone(f)
  const result = capture(f)
  for (const [index, heading] of [items[1], second].entries()) {
    const section = result.groups[index].essays
    assert.equal(section.state, 'captured')
    assert.equal(section.entries.length, 1)
    assert.equal(section.entries[0].sourceLabel, label)
    const observation = f.evidence.documents[0].pages[0].observations
      .find(item => item.observationId === heading.observationIds[0])
    assert.equal(section.entries[0].labelSource.locator.region.y, observation.region.y)
    assert.equal(section.entries[0].labelSource.locator.documentId, 'answers')
  }
  assert.equal(result.groups[0].essays.entries[0].paragraphs[0].text,
    'Our design shows how we could share a cheerful moment.')
  assert.equal(result.groups[1].essays.entries[0].paragraphs[0].text, 'World Smile Day remains legitimate prose.')
  assert.deepEqual(structuredClone(f), before)
})

test('non-writing headings and explanatory suffixes cannot open a reference section', t => {
  const diagnostics = []
  t.mock.method(console, 'error', message => diagnostics.push(message))
  t.mock.method(process, 'exit', code => { throw new Error(`exit:${code}`) })
  for (const text of ['第一节 阅读理解 作答示例', '第一节：作答示例说明如下。']) {
    const f = fixture()
    const items = f.confirmation.documents[0].pages[0].orderedItems
    items[1].text = text
    items.splice(2, 1)
    assert.throws(() => capture(f), /exit:1/, text)
    assert.match(diagnostics.at(-1), /No answer-document section found for application/)
  }
})

test('numbered possible versions become separate source-labeled entries', () => {
  const f = fixture()
  const before = structuredClone(f)
  const result = capture(f)
  assert.deepEqual(result.groups[0].essays.entries.map(e => e.sourceLabel), ['Possible Version 1', 'Possible Version 2'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => e.paragraphs.length), [2, 1])
  assert.equal(result.groups[0].essays.entries[0].paragraphs[0].text,
    'Our design shows how we could share a cheerful moment.')
  assert.deepEqual(structuredClone(f), before)
})

test('confirmed picture excludes only its item identities, preserves wrapping and uses the shared PDF crop', () => {
  const f = fixture({ figure: true })
  const result = capture(f)
  const [first, second] = result.groups[0].essays.entries
  assert.equal(first.paragraphs.length, 2)
  assert.equal(first.paragraphs[0].text, 'Our design shows how we could share a cheerful moment.')
  assert.equal(first.figures.length, 1)
  const [figure] = first.figures
  assert.equal(figure.afterParagraphId, first.paragraphs[0].paragraphId)
  assert.equal(figure.sourceRegionId, f.region.regionId)
  assert.deepEqual(figure.source.locator.region, f.region.region)
  assert.deepEqual(figure.raster, captureSourceReferenceFigure({
    pdfBytes: f.sourceDocuments[0].bytes, page: 1, region: f.region.region,
  }))
  assert(!JSON.stringify(result.groups).includes('Picture words'))
  assert(second.paragraphs[0].text.includes('World Smile Day'))
  assert.equal(second.figures, undefined)
})

test('picture capture rejects missing source bytes and anchors outside surviving essays', () => {
  const f = fixture({ figure: true })
  assert.throws(() => buildSourceReferences(f.materialization, f.evidence, f.confirmation), /source.*bytes|PDF.*bytes/iu)
  f.confirmation.documents[0].pages[0].visualClassifications[0].afterItemId = 'item:0'
  assert.throws(() => capture(f), /immediately|anchor|surviving/iu)
})
