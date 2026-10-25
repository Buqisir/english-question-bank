import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
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

test('rounds non-divisible scaled word edges outwards to integer page pixels', () => {
  const fractional = tsv.replace('\t30\t15\t60\t30\t', '\t31\t16\t61\t31\t')
  assert.deepEqual(mapRegionTsv(fractional, bbox)[0].box, { left: 110, top: 205, width: 21, height: 11 })
})

test('clips new pixel boxes to the page and refuses non-integer or non-finite coordinates before appending', () => {
  const size = { width: 1000, height: 2000 }
  const candidate = { text: 'edge', conf: 90, line: '1:1:1',
    box: { left: 995, top: 1995, width: 10, height: 10 } }
  const append = word => appendRegionObservations(pageFixture(), [word], { runId: 'edge' }, size)
  assert.deepEqual(append(candidate).page.words.at(-1).box, { left: 995, top: 1995, width: 5, height: 5 })
  for (const key of ['left', 'top', 'width', 'height']) {
    for (const value of [0.5, NaN, Infinity]) {
      assert.throws(() => append({ ...candidate, box: { ...candidate.box, [key]: value } }), /integer/u)
    }
  }
})

test('formal compile auto-crops a figure between non-divisible region OCR word boxes', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const scratch = path.join(root, '.scratch')
  mkdirSync(scratch, { recursive: true })
  const directory = mkdtempSync(path.join(scratch, 'ocr-region-figure-test-'))
  try {
    // Copy only the CLI entry point so its existing context resolves to an isolated
    // paper directory; imports use the production modules, including figureRegion.
    const scripts = path.join(directory, 'scripts/import-pipeline')
    const paperId = 'paper-test-region-figure'
    const paperDir = path.join(scripts, 'papers', paperId)
    const work = path.join(directory, 'work')
    mkdirSync(paperDir, { recursive: true })
    mkdirSync(path.join(work, 'drafts'), { recursive: true })
    for (const name of ['server', 'shared']) symlinkSync(path.join(root, name), path.join(directory, name), 'dir')
    for (const entry of readdirSync(import.meta.dirname, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue
      const target = path.join(scripts, entry.name)
      if (entry.name === 'ocr-proofread.mjs') copyFileSync(path.join(import.meta.dirname, entry.name), target)
      else symlinkSync(path.join(import.meta.dirname, entry.name), target)
    }
    const json = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`)
    // --pages reads the source inventory but intentionally does not rasterize/stage
    // PDF evidence; the real-source replay supplies that independent coverage.
    writeFileSync(path.join(paperDir, 'source.pdf'), '%PDF-1.4\n')
    json(path.join(paperDir, 'universal-source-manifest.json'), {
      documents: [{ documentId: 'answers', role: 'question_source', path: 'source.pdf', pageCount: 1 }],
    })
    const imagePath = path.join(work, 'page.png')
    execFileSync('magick', ['-size', '400x400', 'xc:white', '-fill', 'black',
      '-draw', 'rectangle 150,260 180,270', imagePath])
    const words = [
      { number: 1, text: 'Header', conf: 90, line: '1:1:1', box: { left: 20, top: 10, width: 40, height: 10 } },
      { number: 2, text: 'Figure', conf: 90, line: '1:1:2', box: { left: 150, top: 260, width: 30, height: 10 } },
    ]
    const observations = words.map(word => {
      const id = `answers:page-1:word-${word.number}`
      return { observationId: id, regionId: id, text: word.text, confidence: 0.9, alternatives: [],
        region: { x: word.box.left / 400, y: word.box.top / 400, width: word.box.width / 400, height: word.box.height / 400 } }
    })
    const page = { documentId: 'answers', page: 1, key: 'answers-p01', imagePath, words, record: {
      page: 1, observations, regions: observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region })),
      readingOrderEdges: [{ before: observations[0].observationId, after: observations[1].observationId }],
    } }
    const regionTsv = [header, '1\t1\t0\t0\t0\t0\t0\t0\t300\t450\t-1\t',
      '5\t1\t1\t1\t1\t1\t31\t16\t61\t31\t90\tBefore',
      '5\t1\t1\t1\t2\t1\t31\t391\t61\t31\t90\tAfter'].join('\n')
    const result = appendRegionObservations(page,
      mapRegionTsv(regionTsv, { x: 100, y: 200, width: 100, height: 150 }),
      { runId: 'compile-regression' }, { width: 400, height: 400 })
    json(path.join(work, 'trace.json'), { schemaVersion: 'ocr-proofread-trace-v2', paperId, pages: [result.page] })
    json(path.join(work, 'drafts/answers-p01.json'), { documentId: 'answers', page: 1, furniture: [], items: [
      { words: 'w1', text: 'Header' }, { words: 'w3', text: 'Before' },
      { words: 'w2', text: 'Figure', figure: 'auto-crop' }, { words: 'w4', text: 'After' },
    ] })
    const compiled = spawnSync(process.execPath, [path.join(scripts, 'ocr-proofread.mjs'),
      'compile', paperId, '--work', work, '--pages', 'answers-p01'], { encoding: 'utf8' })
    assert.equal(compiled.status, 0, compiled.stderr)
    const output = JSON.parse(compiled.stdout)
    assert.equal(output.ok, true)
    assert.equal(output.figures.length, 1)
    assert.ok(Object.values(output.figures[0].pixels).every(Number.isSafeInteger))
    assert.ok(output.figures[0].pixels.width > 0 && output.figures[0].pixels.height > 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
