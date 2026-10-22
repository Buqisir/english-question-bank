import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileSemanticTables } from './ocr-semantic-tables.mjs'
import { buildSourceReferences, joinTranscriptTurns } from './ocr-proofread.mjs'
import { validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { resolveOcrContentVisual } from '../../server/paper-import/nck1OcrContentVisuals.mjs'

function fixture() {
  const items = Array.from({ length: 14 }, (_, index) => ({
    cell: `cell-${index}`, itemId: `item-${index}`, observationIds: [`word-${index}`],
    text: index === 0 ? '档次' : index === 1 ? '描述'
      : index === 12 ? '零分' : index === 13 ? '抄原文，未作答，跑题。' : `档次说明${index}`,
  }))
  const draft = { semanticTables: [{ name: 'scoring',
    region: { x: 100, y: 200, width: 800, height: 600 },
    rows: Array.from({ length: 7 }, (_, row) => ({
      header: row === 0, cells: [[`cell-${row * 2}`], [`cell-${row * 2 + 1}`]],
    })),
  }] }
  const context = { documentId: 'answers', page: 1, width: 1000, height: 1000 }
  return { items, draft, context }
}

function geometricFixture(region, box) {
  const value = fixture()
  value.draft.semanticTables[0].region = region
  value.context.width = 1191
  value.context.height = 1684
  value.items.forEach((item, i) => { item.numbers = [i + 1] })
  value.context.words = value.items.map((item, i) => ({
    number: i + 1, box: i === 1 ? box
      : { left: region.x + 10, top: region.y + 10 + i, width: 10, height: 10 },
  }))
  return value
}

function resolveGeometry(value, table, extraObservations = []) {
  const { items, context } = value
  return resolveOcrContentVisual({
    paperId: 'paper-table-test',
    document: { documentId: context.documentId, role: 'official_answers', mediaType: 'application/pdf' },
    visual: table.visual, region: table, claimedItems: new Set(),
    page: { page: context.page, orderedItems: items, furnitureObservationIds: [],
      observations: [...context.words.map(({ box }, i) => ({
        observationId: items[i].observationIds[0],
        region: { x: box.left / context.width, y: box.top / context.height,
          width: box.width / context.width, height: box.height / context.height },
      })), ...extraObservations] },
  })
}

test('fits all eight diagnosed edge overflows before the unchanged containment validator', () => {
  const cases = [
    // Qiangji w13: top 55 vs declared 57.
    [{ x: 52, y: 57, width: 1087, height: 358 }, { left: 738, top: 55, width: 21, height: 39 }, 2, 'top'],
    ...[
      [158, 605, 876, 697, 5], // Jiangsu eight cities
      [109, 1322, 910, 212, 3], [242, 138, 777, 71, 3], [109, 209, 910, 878, 2], // four schools
      [178, 1142, 835, 378, 4], [178, 1004, 835, 484, 5], [178, 145, 835, 304, 5], // Zhengzhou
    ].map(([x, y, width, height, overflow]) => [
      { x, y, width, height }, { left: x + 20, top: y + height - 20, width: 20, height: 20 + overflow }, overflow, 'bottom',
    ]),
  ]
  for (const [region, box, overflow, edge] of cases) {
    const value = geometricFixture(region, box)
    const before = structuredClone(value)
    const [original] = compileSemanticTables(value.draft, value.items, { ...value.context, words: [] })
    assert.throws(() => resolveGeometry(value, original), /within the classified/)
    const [table] = compileSemanticTables(value.draft, value.items, value.context)
    assert.deepEqual(table.pixels, { ...region, y: region.y - (edge === 'top' ? overflow : 0),
      height: region.height + overflow })
    assert.doesNotThrow(() => resolveGeometry(value, table))
    assert.deepEqual(value, before, 'drafts and OCR words are immutable inputs')
  }
})

test('overflow above 5px leaves the whole rectangle unchanged and is still rejected', () => {
  const region = { x: 178, y: 145, width: 835, height: 304 }
  const value = geometricFixture(region, { left: 176, top: 430, width: 20, height: 25 })
  const [table] = compileSemanticTables(value.draft, value.items, value.context)
  assert.deepEqual(table.pixels, region, 'do not partly fit the 2px left overflow when bottom exceeds threshold')
  assert.throws(() => resolveGeometry(value, table), /within the classified/)
})

test('left/right fitting uses only bound words and newly enclosed foreign words still fail', () => {
  const region = { x: 100, y: 200, width: 800, height: 600 }
  for (const box of [
    { left: 95, top: 210, width: 10, height: 10 },
    { left: 895, top: 210, width: 10, height: 10 },
  ]) {
    const value = geometricFixture(region, box)
    value.context.words.push({ number: 99, box: { left: 1, top: 1, width: 1, height: 1 } })
    const [table] = compileSemanticTables(value.draft, value.items, value.context)
    assert.equal(table.pixels.width, 805)
    assert.equal(table.pixels.y, 200)
  }
  const value = geometricFixture(region, { left: 95, top: 210, width: 10, height: 10 })
  const [table] = compileSemanticTables(value.draft, value.items, value.context)
  assert.throws(() => resolveGeometry(value, table, [{
    observationId: 'foreign', region: { x: 96 / 1191, y: 250 / 1684, width: 2 / 1191, height: 2 / 1684 },
  }]), /must be accounted for/)
})

test('compiles explicit 7 by 2 cells to the existing semantic table confirmation', () => {
  const { items, draft, context } = fixture()
  const [table] = compileSemanticTables(draft, items, context)
  assert.equal(table.visual.classification, 'semantic_table')
  assert.deepEqual(Object.keys(table.visual), ['regionId', 'classification', 'rows'])
  assert.equal(table.visual.rows.length, 7)
  assert.deepEqual(table.visual.rows[6], { header: false, cells: [['item-12'], ['item-13']] })
  assert.deepEqual(table.region, { x: .1, y: .2, width: .8, height: .6 })
})

test('rejects missing, repeated, orphaned or reordered cell identities', () => {
  for (const corrupt of [
    ({ draft }) => { draft.semanticTables[0].rows[1].cells[0] = ['missing'] },
    ({ draft }) => { draft.semanticTables[0].rows[1].cells[0] = ['cell-0'] },
    ({ draft }) => { draft.semanticTables[0].rows.pop() },
    ({ items }) => { [items[2], items[3]] = [items[3], items[2]] },
  ]) {
    const value = fixture()
    corrupt(value)
    assert.throws(() => compileSemanticTables(value.draft, value.items, value.context))
  }
})

test('rejects nonrectangular, out-of-page or emphasized table declarations', () => {
  for (const corrupt of [
    ({ draft }) => { draft.semanticTables[0].rows[1].cells.pop() },
    ({ draft }) => { draft.semanticTables[0].region.width = 1000 },
    ({ items }) => { items[2].emphasis = [{ text: items[2].text, marks: ['bold'] }] },
    ({ items }) => { items[2].figure = 'picture' },
  ]) {
    const value = fixture()
    corrupt(value)
    assert.throws(() => compileSemanticTables(value.draft, value.items, value.context))
  }
})

test('table cell identities survive active transcript joining unchanged', () => {
  const { items } = fixture()
  const result = joinTranscriptTurns(items, [], { inTranscript: true }, 'table')
  assert.equal(result.joins, 0)
  assert.deepEqual(result.items, items)
})

for (const crossPage of [false, true]) test(
  `captures a scoring table in v2 with 14 distinct PDF locators and ${crossPage ? 'a cross-page' : 'a single-page'} essay`, () => {
  const { items, draft, context } = fixture()
  const [table] = compileSemanticTables(draft, items, context)
  const texts = ['第二节 读后续写', '一、评分原则', '按档次评分。',
    ...items.map(item => item.text), 'One possible version:', crossPage ? 'A source sample that' : 'A source sample.']
  const orderedItems = texts.map((text, index) => index >= 3 && index < 17
    ? items[index - 3] : { itemId: `outside-${index}`, observationIds: [`outside-word-${index}`], text })
  const observations = orderedItems.map((item, index) => ({
    observationId: item.observationIds[0], text: item.text,
    region: { x: index >= 3 && index < 17 ? (index % 2 ? .1 : .3) : .1,
      y: .1 + index * .03, width: .15, height: .02 },
  }))
  const materialization = {
    paperId: 'paper-table-test',
    documents: [{ documentId: 'answers', role: 'official_answers',
      sha256: `sha256:${'a'.repeat(64)}`, mediaType: 'application/pdf', pageCount: crossPage ? 2 : 1 }],
    groups: [{ groupId: 'continuation', writingTask: { taskType: 'continuation' } }],
  }
  const continuationRegion = { x: .1, y: .1, width: .15, height: .02 }
  const { groups, structuredScoring } = buildSourceReferences(materialization,
    { documents: [{ documentId: 'answers', pages: [{ observations }, ...(crossPage ? [{
      observations: [{ observationId: 'continued-word', region: continuationRegion }],
    }] : [])] }] },
    { documents: [{ documentId: 'answers', pages: [{ page: 1, orderedItems,
      visualClassifications: [table.visual] }, ...(crossPage ? [{
      page: 2, orderedItems: [{ itemId: 'continued-item', observationIds: ['continued-word'], text: 'continues on another page.' }],
    }] : [])] }] })
  assert.equal(structuredScoring, true)
  const blocks = groups[0].scoring.entries[0].blocks
  assert.deepEqual(blocks.map(block => block.kind), ['paragraph', 'table'])
  assert.equal(blocks[1].rows.length, 7)
  assert.equal(new Set(blocks[1].rows.flat().map(cell => JSON.stringify(cell.source.locator))).size, 14)
  assert.deepEqual(blocks[1].rows[6].map(cell => cell.text), ['零分', '抄原文，未作答，跑题。'])
  const essayParagraphs = groups[0].essays.entries[0].paragraphs
  assert.deepEqual(essayParagraphs.map(p => p.text), [
    crossPage ? 'A source sample that continues on another page.' : 'A source sample.',
  ])
  assert.deepEqual(essayParagraphs[0].source.locator, {
    kind: 'page_region', documentId: 'answers', page: 1, region: observations.at(-1).region,
  })
  assert.deepEqual(essayParagraphs[0].continuationSources, crossPage ? [{
    documentSha256: materialization.documents[0].sha256,
    locator: { kind: 'page_region', documentId: 'answers', page: 2, region: continuationRegion },
  }] : undefined)
  const sourceDigest = `sha256:${'b'.repeat(64)}`, candidateDigest = `sha256:${'c'.repeat(64)}`
  assert.deepEqual(validateSourceReferences({ materialization, sourceDigest, candidateDigest, sidecar: {
    schemaVersion: 'source-references-v2', paperId: materialization.paperId,
    sourceDigest, candidateDigest, materializationDigest: digestJson(materialization), groups,
  } }), [])
})
