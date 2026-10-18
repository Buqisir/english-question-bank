import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { figureCues, missingFigureHints, missingFigureMessage } from './import-pipeline/ocr-figure-guard.mjs'

for (const text of [
  '两个版本（见下图）', '如图所示', '下图为流程图', '阅读图表', '示意图', '(见图)', '（见图）',
  'Figure 2 shows the results.', 'See the picture below.', 'see the table below',
  'the diagrams above', 'the flowchart below', 'according to the figure', 'shown below',
  'shown in the chart', 'shown in the figure',
]) assert(figureCues(text).length, text)
for (const text of [
  'a figure skater', 'figure out the answer', 'a public figure', 'an important figure in history',
  'the table is made of wood', 'draw a map', 'the chart shows progress',
]) assert.deepEqual(figureCues(text), [], text)

const page = (number, items, documentId = 'question-source-1', role = 'question_source') => ({
  key: `${documentId}-p${String(number).padStart(2, '0')}`, page: number, documentId, role,
  draft: { items: items.map((item) => typeof item === 'string' ? { text: item } : item),
    furniture: ['L99'] },
})
const first = page(1, ['See the chart below.'])
const missing = (pages, options = {}) => missingFigureHints({ pages, ...options }).filter((hint) => hint.missing)
assert.equal(missing([first]).length, 1)
assert.match(missingFigureMessage(missing([first])[0]), /question-source-1-p01.*See the chart below.*figure 和 figureRegion.*no_figure/u)
assert.equal(missing([page(1, ['见下图', { text: '图内文字', figure: 'chart' }])]).length, 0)
assert.equal(missing([page(1, ['见下图', { text: '图内文字', figureRegion: { x: 1 } }])]).length, 0)
assert.equal(missing([first, page(2, [{ text: 'graph', figure: 'chart' }])],
  { only: [first.key] }).length, 0, 'next page can be outside the selected shard')
assert.equal(missing([first, page(3, [{ text: 'graph', figure: 'chart' }])]).length, 1)
assert.equal(missing([first, page(2, [{ text: 'graph', figure: 'chart' }], 'other')]).length, 1)
assert.equal(missing([first], { noFigures: [
  { page: first.key, kind: 'no_figure', reason: '已对照原页，无图' },
] }).length, 0)
for (const entry of [
  { page: first.key, kind: 'no_figure', reason: ' ' },
  { page: 'other', kind: 'no_figure', reason: '原页无图' },
  { page: first.key, kind: 'other', reason: '原页无图' },
]) assert.equal(missing([first], { noFigures: [entry] }).length, 1)
assert.equal(missing([first], { only: ['other'] }).length, 0)
assert.equal(missing([page(1, ['正文'])]).length, 0, 'furniture is not body text')
assert.equal(missing([
  page(1, ['Text 1', 'M: See the chart below.'], 'answers', 'official_answers'),
  page(2, ['W: According to the figure.'], 'answers', 'official_answers'),
]).length, 0, 'listening transcript continues across pages')
assert.equal(missing([
  page(1, ['听力原文', 'See the chart below.'], 'answers', 'official_answers'),
  page(2, ['第四部分 写作', '见下图'], 'answers', 'official_answers'),
]).length, 1, 'writing after transcript still checked')
assert.equal(missing([page(1, ['See the chart below.'], 'transcript', 'listening_transcript')]).length, 0)

// Exercise the public shard command, including a next page outside the shard and
// a declaration in the shard's first-page file rather than the current-page file.
const root = path.resolve(import.meta.dirname, '..')
const paperDir = path.join(root, `scripts/import-pipeline/papers/paper-figure-guard-${process.pid}`)
mkdirSync(paperDir)
const work = mkdtempSync(path.join(os.tmpdir(), 'eqb-figure-guard-'))
const json = (file, value) => writeFileSync(file, JSON.stringify(value))
try {
  mkdirSync(path.join(work, 'drafts'))
  mkdirSync(path.join(work, 'source-flags'))
  writeFileSync(path.join(paperDir, 'source.pdf'), 'local fixture')
  json(path.join(paperDir, 'universal-source-manifest.json'), { documents: [
    { documentId: 'question-source-1', role: 'question_source', path: 'source.pdf' },
  ] })
  const key = 'question-source-1-p02'
  const draft = { documentId: 'question-source-1', page: 2,
    items: [{ words: 'w1', text: '见下图' }], furniture: ['w2'] }
  json(path.join(work, 'drafts', `${key}.json`), draft)
  json(path.join(work, 'trace.json'), { schemaVersion: 'ocr-proofread-trace-v2', pages: [
    { documentId: draft.documentId, page: 2, key, words: [
      { number: 1, text: '见下图', line: '1:1:1', box: { left: 0, top: 0, width: 20, height: 10 } },
      { number: 2, text: 'Figure 9', line: '1:1:2', box: { left: 0, top: 20, width: 20, height: 10 } },
    ] },
    { documentId: draft.documentId, page: 3, key: 'question-source-1-p03', words: [] },
  ] })
  const run = (selected = true) => spawnSync(process.execPath, [
    path.join(root, 'scripts/import-pipeline/ocr-proofread.mjs'), 'compile', path.basename(paperDir),
    '--work', work, ...(selected ? ['--pages', key] : []),
  ], { encoding: 'utf8' })
  assert.equal(run().status, 1)
  assert.match(run().stderr, /question-source-1-p02.*见下图.*no_figure/u)
  assert.equal(run(false).status, 1, 'full compile enforces the same guard before staging')
  json(path.join(work, 'drafts/question-source-1-p03.json'), {
    documentId: draft.documentId, page: 3, items: [{ figure: 'next-page-chart' }],
  })
  assert.equal(run().status, 0, 'next-page figure outside shard')
  json(path.join(work, 'drafts/question-source-1-p03.json'), { items: [] })
  json(path.join(work, 'source-flags/question-source-1-p01.json'), { pages: [key], flags: [],
    noFigures: [{ page: key, kind: 'no_figure', reason: '原页无图' }] })
  const sentinel = '{"existing":"confirmation"}'
  writeFileSync(path.join(work, 'proofread-input.json'), sentinel)
  assert.equal(run().status, 0, 'local no_figure declaration')
  assert.equal(readFileSync(path.join(work, 'proofread-input.json'), 'utf8'), sentinel)
  assert.equal(existsSync(path.join(work, 'ocr-source-evidence.json')), false)
  // A cue present only in furniture must not trigger the guard.
  draft.items[0].text = '正文'
  json(path.join(work, 'drafts', `${key}.json`), draft)
  json(path.join(work, 'source-flags/question-source-1-p01.json'), { flags: [] })
  assert.equal(run().status, 0, 'furniture excluded at the CLI seam')
} finally {
  rmSync(paperDir, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
}
console.log('PASS OCR missing-figure guard')
