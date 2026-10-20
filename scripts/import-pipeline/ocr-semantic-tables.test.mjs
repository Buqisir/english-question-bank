import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileSemanticTables } from './ocr-semantic-tables.mjs'
import { buildSourceReferences, joinTranscriptTurns } from './ocr-proofread.mjs'
import { validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

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

test('captures a scoring table in v2 with 14 distinct PDF locators, keeping essays separate', () => {
  const { items, draft, context } = fixture()
  const [table] = compileSemanticTables(draft, items, context)
  const texts = ['第二节 读后续写', '一、评分原则', '按档次评分。',
    ...items.map(item => item.text), 'One possible version:', 'A source sample.']
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
      sha256: `sha256:${'a'.repeat(64)}`, mediaType: 'application/pdf', pageCount: 1 }],
    groups: [{ groupId: 'continuation', writingTask: { taskType: 'continuation' } }],
  }
  const { groups, structuredScoring } = buildSourceReferences(materialization,
    { documents: [{ documentId: 'answers', pages: [{ observations }] }] },
    { documents: [{ documentId: 'answers', pages: [{ page: 1, orderedItems,
      visualClassifications: [table.visual] }] }] })
  assert.equal(structuredScoring, true)
  const blocks = groups[0].scoring.entries[0].blocks
  assert.deepEqual(blocks.map(block => block.kind), ['paragraph', 'table'])
  assert.equal(blocks[1].rows.length, 7)
  assert.equal(new Set(blocks[1].rows.flat().map(cell => JSON.stringify(cell.source.locator))).size, 14)
  assert.deepEqual(blocks[1].rows[6].map(cell => cell.text), ['零分', '抄原文，未作答，跑题。'])
  assert.deepEqual(groups[0].essays.entries[0].paragraphs.map(p => p.text), ['A source sample.'])
  const sourceDigest = `sha256:${'b'.repeat(64)}`, candidateDigest = `sha256:${'c'.repeat(64)}`
  assert.deepEqual(validateSourceReferences({ materialization, sourceDigest, candidateDigest, sidecar: {
    schemaVersion: 'source-references-v2', paperId: materialization.paperId,
    sourceDigest, candidateDigest, materializationDigest: digestJson(materialization), groups,
  } }), [])
})
