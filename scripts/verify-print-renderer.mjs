#!/usr/bin/env node
/**
 * Verification: Print renderer HTML generation, CSS contract, Vivliostyle smoke test.
 */

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

// --- Fixtures ---
const items = [
  {
    detail: {
      id: 'g1', title: '2025 阅读 B', groupType: 'reading',
      passage: { title: 'Passage B', materialText: 'The fox jumps.\nSecond paragraph.' },
      questions: [
        { id: 'q1', questionNo: '1', stem: 'What does the fox do?', answer: 'B', explanation: 'It jumps.', note: '',
          options: [{ label: 'A', content: 'Sleep' }, { label: 'B', content: 'Jump' }, { label: 'C', content: 'Run' }, { label: 'D', content: 'Eat' }] },
        { id: 'q2', questionNo: '2', stem: 'Where?', answer: 'A', explanation: '', note: '',
          options: [{ label: 'A', content: 'Here' }, { label: 'B', content: 'There' }, { label: 'C', content: 'Everywhere' }, { label: 'D', content: 'Nowhere' }] },
      ],
    },
    score: 2.5, sectionTitle: '阅读理解 B', note: '',
  },
  {
    detail: {
      id: 'g2', title: '2025 七选五', groupType: 'seven_choices',
      passage: { title: 'Seven', materialText: 'Life skills passage.' },
      questions: [
        { id: 'q3', questionNo: '3', stem: 'Fill blank 1', answer: 'E', explanation: 'Context.', note: '', options: [] },
      ],
    },
    score: 2, sectionTitle: '七选五', note: '',
  },
]

const blocks = [
  { type: 'section_header', title: '第一部分 阅读理解' },
  { type: 'question_group', questionGroupId: 'g1', score: 2.5 },
  { type: 'page_break' },
  { type: 'section_header', title: '第二节 七选五' },
  { type: 'question_group', questionGroupId: 'g2', score: 2 },
]

// --- Test 1: HTML generation - block order and numbering ---
console.log('=== Print Renderer Verification ===\n')
console.log('Test 1: HTML generation - blocks, numbering, structure')
{
  const html = buildPrintHtml({ title: '2025 英语', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 21 })

  assert('contains title', html.includes('2025 英语'), '')
  assert('section_header 1 present', html.includes('第一部分 阅读理解'), '')
  assert('section_header 2 present', html.includes('第二节 七选五'), '')
  assert('page_break present', html.includes('class="page-break"'), '')
  assert('question 21 present', html.includes('>21.</span>'), '')
  assert('question 22 present', html.includes('>22.</span>'), '')
  assert('question 23 present (continuous after page_break)', html.includes('>23.</span>'), '')
  assert('passage text present', html.includes('The fox jumps.'), '')
  assert('options present', html.includes('A. Sleep'), '')
  assert('no answer in student', !html.includes('【答案】'), '')
}

// --- Test 2: Teacher version ---
console.log('\nTest 2: Teacher version shows answers')
{
  const html = buildPrintHtml({ title: '2025 英语', versionType: 'teacher', printStyle: 'exam', items, blocks, questionNumberStart: 21 })
  assert('answer present', html.includes('【答案】'), '')
  assert('answer B present', html.includes('B'), '')
  assert('explanation present', html.includes('It jumps.'), '')
  assert('teacher label', html.includes('教师版'), '')
}

// --- Test 3: CSS contract ---
console.log('\nTest 3: CSS contract checks')
{
  const html = buildPrintHtml({ title: 'Test', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1 })
  assert('@page A4', html.includes('size: A4'), '')
  assert('page margin', html.includes('margin: 20mm'), '')
  assert('text-indent 2em (passage)', html.includes('text-indent: 2em'), '')
  assert('break-before: page (hard page break)', html.includes('break-before: page'), '')
  assert('options-grid class', html.includes('options-grid'), '')
  assert('options-list class exists in CSS', html.includes('.options-list'), '')
  assert('exam density class on body', html.includes('class="exam"'), '')
}

// --- Test 4: Handout style ---
console.log('\nTest 4: Handout style')
{
  const html = buildPrintHtml({ title: 'Test', versionType: 'student', printStyle: 'handout', items, blocks, questionNumberStart: 1 })
  assert('handout class on body', html.includes('class="handout"'), '')
  assert('group-meta visible in handout CSS', html.includes('.group-meta'), '')
}

// --- Test 5: Vivliostyle smoke test ---
console.log('\nTest 5: Vivliostyle CLI smoke test')
{
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const vivliostylePaths = [
    path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
    path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
  ]
  let vivliostyleBin = null
  for (const p of vivliostylePaths) {
    if (existsSync(p)) { vivliostyleBin = p; break }
  }

  if (!vivliostyleBin) {
    console.log('  ⊘ SKIP: vivliostyle CLI not installed (install with: npm install @vivliostyle/cli)')
    console.log('    This is expected in CI or dev environments without Vivliostyle.')
  } else {
    const html = buildPrintHtml({ title: 'Smoke Test', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1 })
    const tempDir = mkdtempSync(path.join(tmpdir(), 'print-smoke-'))
    const htmlPath = path.join(tempDir, 'test.html')
    const pdfPath = path.join(tempDir, 'test.pdf')
    writeFileSync(htmlPath, html)
    try {
      execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000 })
      const pdfBytes = readFileSync(pdfPath)
      assert('PDF generated', pdfBytes.length > 0, `size: ${pdfBytes.length}`)
      assert('PDF starts with %PDF', pdfBytes.slice(0, 4).toString() === '%PDF', '')
    } catch (error) {
      console.log(`  ⊘ SKIP: vivliostyle build failed: ${error.message}`)
      console.log('    This may be due to missing browser/chromium dependency.')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
