import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendRegionObservations, mapRegionTsv, parseRegionRequests } from './ocr-region-reobserve.mjs'

const bbox = { x: 100, y: 200, width: 100, height: 50 }
const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
const tsv = [header, '1\t1\t0\t0\t0\t0\t0\t0\t300\t150\t-1\t',
  '5\t1\t1\t1\t1\t1\t30\t15\t60\t30\t92.5\t标题',
  '5\t1\t1\t1\t2\t1\t120\t60\t30\t30\t0\t细则', ''].join('\n')

function pageFixture() {
  const id = 'answers:page-4:word-7'
  return { documentId: 'answers', page: 4, key: 'answers-p04',
    words: [{ number: 7, text: 'old', conf: 90, line: '1:1:1',
      box: { left: 110, top: 205, width: 20, height: 10 } }],
    record: { page: 4, observations: [{ observationId: id, regionId: id,
      region: { x: 0.11, y: 0.1025, width: 0.02, height: 0.005 },
      text: 'old', confidence: 0.9, alternatives: [] }],
    regions: [{ regionId: id, kind: 'text',
      region: { x: 0.11, y: 0.1025, width: 0.02, height: 0.005 } }],
    readingOrderEdges: [] } }
}

test('maps scaled TSV words to original page pixels, preserving confidence and engine lines', () => {
  assert.deepEqual(mapRegionTsv(tsv, bbox), [
    { text: '标题', conf: 92.5, line: '1:1:1', box: { left: 110, top: 205, width: 20, height: 10 } },
    { text: '细则', conf: 0, line: '1:1:2', box: { left: 140, top: 220, width: 10, height: 10 } },
  ])
  assert.throws(() => mapRegionTsv(tsv.replace('\t300\t150\t', '\t301\t150\t'), bbox), /page box/)
  assert.throws(() => mapRegionTsv(tsv.replace('\t92.5\t', '\t101\t'), bbox), /confidence/)
  assert.throws(() => mapRegionTsv(tsv.replace('\t30\t15\t60\t', '\t290\t15\t60\t'), bbox), /geometry/)
})

test('drops any positive overlap with earlier observations and keeps original records and word numbers', () => {
  const page = pageFixture(), original = structuredClone(page)
  const result = appendRegionObservations(page, mapRegionTsv(tsv, bbox), { runId: 'run-1' },
    { width: 1000, height: 2000 })
  assert.equal(result.discarded, 1)
  assert.deepEqual(page, original)
  assert.deepEqual(result.page.words.slice(0, 1), original.words)
  assert.deepEqual(result.page.record.observations.slice(0, 1), original.record.observations)
  assert.deepEqual(result.page.record.regions.slice(0, 1), original.record.regions)
  assert.deepEqual(result.page.words[1], { number: 8, text: '细则', conf: 0, line: 'region-run-1:1:1:2',
    box: { left: 140, top: 220, width: 10, height: 10 }, source: 'region-reobserve', reobserveRunId: 'run-1' })
  assert.deepEqual(result.page.record.observations[1], {
    observationId: 'answers:page-4:word-8', regionId: 'answers:page-4:word-8',
    region: { x: 0.14, y: 0.11, width: 0.01, height: 0.005 }, text: '细则', confidence: 0, alternatives: [],
  })
  assert.deepEqual(result.page.record.readingOrderEdges, [
    { before: 'answers:page-4:word-7', after: 'answers:page-4:word-8' },
  ])
  const rerun = appendRegionObservations(result.page, mapRegionTsv(tsv, bbox), { runId: 'run-2' },
    { width: 1000, height: 2000 })
  assert.equal(rerun.discarded, 2)
  assert.deepEqual(rerun.page, result.page)
  const partial = [{ text: 'overlap', conf: 90, line: '1', box: { left: 129, top: 214, width: 10, height: 5 } }]
  assert.equal(appendRegionObservations(page, partial, { runId: 'partial' }, { width: 1000, height: 2000 }).discarded, 1)
  partial[0].box.left = 130 // Touching a box boundary is not an overlap.
  assert.equal(appendRegionObservations(page, partial, { runId: 'touch' }, { width: 1000, height: 2000 }).discarded, 0)
})

test('rejects request text fields at any accepted level and invalid page/bbox values', () => {
  const entry = { page: 'answers-p04', bbox }
  const pages = [pageFixture()]
  for (const value of [[{ ...entry, text: 'injected' }], [{ ...entry, words: ['injected'] }],
    [{ ...entry, bbox: { ...bbox, text: 'injected' } }], [{ ...entry, page: 'missing' }],
    [{ ...entry, bbox: { ...bbox, x: -1 } }], [{ ...entry, bbox: { ...bbox, width: 1.5 } }],
    [{ ...entry, bbox: { ...bbox, height: 0 } }], { ...entry, text: 'injected' }, []]) {
    assert.throws(() => parseRegionRequests(value, pages))
  }
})

test('region request ordering, duplicate elimination and appended observations are deterministic', () => {
  const early = { page: 'answers-p04', bbox }, late = { page: 'answers-p04', bbox: { ...bbox, y: 300 } }
  const first = [late, early, structuredClone(early)], second = [early, late]
  assert.deepEqual(parseRegionRequests(first, [pageFixture()]), parseRegionRequests(second, [pageFixture()]))
  const a = appendRegionObservations(pageFixture(), mapRegionTsv(tsv, bbox), { runId: 'stable' },
    { width: 1000, height: 2000 })
  const b = appendRegionObservations(pageFixture(), mapRegionTsv(tsv, bbox), { runId: 'stable' },
    { width: 1000, height: 2000 })
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})
