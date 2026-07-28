#!/usr/bin/env node
/**
 * Verification: 精排 PDF (Vivliostyle) export flow.
 *
 * Covers:
 *   1. buildPrintPayload preserves block order (section_header / page_break / question_group)
 *      and propagates score / sectionTitle / note from basket.
 *   2. buildPrintHtml produces HTML that respects the same block order with continuous numbering.
 *   3. Vivliostyle CLI is reachable (server/node_modules/.bin/vivliostyle).
 *   4. End-to-end: HTML → vivliostyle build → valid %PDF for both student and teacher versions.
 *
 * This script does NOT spin up the HTTP server. It exercises the same modules the server uses.
 */

import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildPrintPayload } from '../app/src/paperAssembly/paperExportPayload.ts'
import { mapPrintPdfError } from '../app/src/services/questionGroups.ts'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { proxyFreeEnv } from './lib/proxyFreeEnv.mjs'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

// --- Fixture: a small basket + interleaved blocks (section_header, group, page_break, group) ---
const state = {
  basket: [
    { id: 'g-reading-b', score: 2, questionCount: 4, sectionTitle: '阅读理解 B', note: '', title: 'Reading B', groupType: 'reading', defaultScore: 2 },
    { id: 'g-cloze',     score: 1.5, questionCount: 15, sectionTitle: '完形填空', note: '', title: 'Cloze',   groupType: 'cloze',   defaultScore: 1.5 },
  ],
  paperBlocks: [
    { id: 'sh-1',    type: 'section_header', title: '第一部分 阅读理解' },
    { id: 'block-g-reading-b', type: 'question_group', questionGroupId: 'g-reading-b', score: 2 },
    { id: 'pb-1',    type: 'page_break' },
    { id: 'sh-2',    type: 'section_header', title: '第三部分 完形填空' },
    { id: 'block-g-cloze',     type: 'question_group', questionGroupId: 'g-cloze',     score: 1.5 },
  ],
  questionNumberStart: 21,
  paperExportStyle: 'exam',
  paperTitle: '2026 模拟测验',
  versionType: 'student',
}

console.log('=== 精排 PDF Export Flow Verification ===\n')

// --- Test 1: payload preserves block order and metadata ---
console.log('Test 1: buildPrintPayload preserves block order')
{
  const payload = buildPrintPayload(state)
  assert('blocks length 5', payload.blocks?.length === 5, `got ${payload.blocks?.length}`)
  assert('block[0] section_header', payload.blocks[0].type === 'section_header', '')
  assert('block[0].title 第一部分', payload.blocks[0].title === '第一部分 阅读理解', `got ${payload.blocks[0].title}`)
  assert('block[1] question_group g-reading-b', payload.blocks[1].type === 'question_group' && payload.blocks[1].questionGroupId === 'g-reading-b', '')
  assert('block[1].score = 2', payload.blocks[1].score === 2, `got ${payload.blocks[1].score}`)
  assert('block[1].sectionTitle from basket', payload.blocks[1].sectionTitle === '阅读理解 B', `got ${payload.blocks[1].sectionTitle}`)
  assert('block[2] page_break', payload.blocks[2].type === 'page_break', '')
  assert('block[3] section_header (第二个)', payload.blocks[3].type === 'section_header', '')
  assert('block[4] question_group g-cloze', payload.blocks[4].type === 'question_group' && payload.blocks[4].questionGroupId === 'g-cloze', '')
  assert('items length 2', payload.items.length === 2, '')
  assert('versionType student', payload.versionType === 'student', '')
  assert('printStyle exam', payload.printStyle === 'exam', '')
  assert('questionNumberStart 21', payload.questionNumberStart === 21, '')
}

// --- Test 2: buildPrintHtml renders blocks in order with continuous numbering ---
console.log('\nTest 2: buildPrintHtml respects block order + continuous numbering')

// Server-side detail shape (mirrors getQuestionGroupDetail return shape)
const items = [
  {
    detail: {
      id: 'g-reading-b',
      title: 'Reading B',
      groupType: 'reading',
      passage: { title: 'P1', materialText: 'Reading passage line 1.\nReading line 2.' },
      questions: [1, 2, 3, 4].map((i) => ({
        id: `q-r-${i}`, questionNo: String(i), stem: `Reading question ${i}.`, answer: 'A', explanation: '', note: '',
        options: [{ label: 'A', content: 'a' }, { label: 'B', content: 'b' }, { label: 'C', content: 'c' }, { label: 'D', content: 'd' }],
      })),
    },
    score: 2, sectionTitle: '阅读理解 B', note: '',
  },
  {
    detail: {
      id: 'g-cloze',
      title: 'Cloze',
      groupType: 'cloze',
      // draft-desk-b step4 (SW-D, cr-step1-lite.md): 'cloze' is a
      // BLANK_BEARING_GROUP_TYPE (server/print-renderer.mjs) — its hard
      // consistency assertion (print-renderer.mjs:361-ish, "宁可导出红也不
      // 出对不上的卷子") requires the in-text `paperBlankPattern` marker
      // count to equal this group's question count (3). The previous
      // fixture text ('Cloze passage with __ blanks __.') had zero real
      // markers (no digits between the underscores, so paperBlankPattern
      // never matched) against 3 questions — that mismatch threw and
      // crashed this whole script on main, before this cut ever touched
      // anything. The displayed number is order-of-appearance, not the
      // literal digit (renderPassageLineWithBlanks's doc comment), but 25/
      // 26/27 (this group's continuous numbering, starting after the 4
      // reading questions numbered 21-24) keeps the fixture text realistic.
      passage: { title: 'P2', materialText: 'Cloze passage with __25__ one __26__ two __27__ three blanks.' },
      questions: [1, 2, 3].map((i) => ({
        id: `q-c-${i}`, questionNo: String(i), stem: `Cloze ${i}`, answer: 'B', explanation: '', note: '',
        options: [{ label: 'A', content: 'one' }, { label: 'B', content: 'two' }, { label: 'C', content: 'three' }, { label: 'D', content: 'four' }],
      })),
    },
    score: 1.5, sectionTitle: '完形填空', note: '',
  },
]

const html = buildPrintHtml({
  title: state.paperTitle,
  versionType: 'student',
  printStyle: 'exam',
  items,
  blocks: state.paperBlocks,
  questionNumberStart: 21,
})

{
  // Find positions of key markers, must appear in declared order.
  const idxSh1   = html.indexOf('第一部分 阅读理解')
  const idxRq21  = html.indexOf('>21.</span>')
  const idxPbr   = html.indexOf('class="page-break"')
  const idxSh2   = html.indexOf('第三部分 完形填空')
  const idxCq25  = html.indexOf('>25.</span>') // cloze starts at 21 + 4 = 25

  assert('section_header 1 present', idxSh1 > -1, '')
  assert('Q21 present (first reading question)', idxRq21 > -1, '')
  assert('page_break present', idxPbr > -1, '')
  assert('section_header 2 present', idxSh2 > -1, '')
  assert('Q25 present (cloze starts after 4 reading qs)', idxCq25 > -1, '')

  assert('order: sh1 < q21', idxSh1 < idxRq21, `${idxSh1} < ${idxRq21}`)
  assert('order: q21 < page_break', idxRq21 < idxPbr, `${idxRq21} < ${idxPbr}`)
  assert('order: page_break < sh2', idxPbr < idxSh2, `${idxPbr} < ${idxSh2}`)
  assert('order: sh2 < q25', idxSh2 < idxCq25, `${idxSh2} < ${idxCq25}`)

  // Continuous numbering: 22, 23, 24 must all appear between 21 and 25.
  assert('Q22 present', html.includes('>22.</span>'), '')
  assert('Q23 present', html.includes('>23.</span>'), '')
  assert('Q24 present', html.includes('>24.</span>'), '')

  // Student version: no answer markers
  assert('no 【答案】 in student', !html.includes('【答案】'), '')
}

// --- Test 3: Vivliostyle CLI presence + end-to-end PDF ---
console.log('\nTest 3: Vivliostyle CLI reachable + PDF generation')
const vivliostylePaths = [
  path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
  path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
]
let vivliostyleBin = null
for (const p of vivliostylePaths) {
  if (existsSync(p)) { vivliostyleBin = p; break }
}
assert('vivliostyle binary found in server/node_modules', vivliostyleBin !== null, 'run: cd server && npm install')

if (vivliostyleBin) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'verify-print-pdf-flow-'))
  const htmlPath = path.join(tempDir, 'paper.html')
  const pdfPath = path.join(tempDir, 'paper.pdf')
  try {
    writeFileSync(htmlPath, html)
    execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, stdio: 'pipe', env: proxyFreeEnv() })
    const pdfBytes = readFileSync(pdfPath)
    assert('student PDF generated', pdfBytes.length > 0, `size: ${pdfBytes.length}`)
    assert('student PDF starts with %PDF', pdfBytes.slice(0, 4).toString() === '%PDF', '')

    // Teacher version smoke
    const teacherHtml = buildPrintHtml({
      title: state.paperTitle,
      versionType: 'teacher',
      printStyle: 'exam',
      items,
      blocks: state.paperBlocks,
      questionNumberStart: 21,
    })
    assert('teacher HTML contains 【答案】', teacherHtml.includes('【答案】'), '')
    writeFileSync(htmlPath, teacherHtml)
    execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, stdio: 'pipe', env: proxyFreeEnv() })
    const teacherPdf = readFileSync(pdfPath)
    assert('teacher PDF starts with %PDF', teacherPdf.slice(0, 4).toString() === '%PDF', '')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

// --- Test 4: error mapping for Chinese friendly messages ---
console.log('\nTest 4: mapPrintPdfError covers user-facing failure modes')
{
  const m404 = mapPrintPdfError(404, 'Not found')
  assert('404 mentions 路由 / 重启 (Chinese)', m404.includes('未加载') && m404.includes('重启'), `got: ${m404}`)
  assert('404 does NOT pass through raw "Not found"', !/^not\s*found$/i.test(m404), `got: ${m404}`)

  const m404Body = mapPrintPdfError(500, 'Endpoint Not Found')
  assert('Not found in body also maps to Chinese', m404Body.includes('未加载'), `got: ${m404Body}`)

  const m503 = mapPrintPdfError(503, 'vivliostyle CLI not found')
  assert('503 mentions Vivliostyle 渲染器', m503.includes('Vivliostyle') || m503.includes('vivliostyle') || m503.includes('渲染器'), `got: ${m503}`)
  assert('503 mentions npm install', m503.includes('npm install'), `got: ${m503}`)

  const m500 = mapPrintPdfError(500, 'unexpected boom')
  assert('500 wraps with 精排 PDF 生成失败 prefix', m500.startsWith('精排 PDF 生成失败：'), `got: ${m500}`)
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
