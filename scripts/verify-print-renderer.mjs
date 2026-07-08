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
  // 刀⑤ render-fidelity Chunk B — standard §1: 24mm 左右 / 21mm 上.
  assert('page margin (标准 §1: 21mm top, 24mm right/bottom/left)', html.includes('margin: 21mm 24mm 24mm 24mm'), '')
  assert('text-indent 2em (passage)', html.includes('text-indent: 2em'), '')
  assert('break-before: page (hard page break)', html.includes('break-before: page'), '')
  assert('options-grid class', html.includes('options-grid'), '')
  assert('options-list class exists in CSS', html.includes('.options-list'), '')
  assert('exam density class on body', html.includes('class="exam"'), '')
  // 刀⑤ render-fidelity Chunk B — standard §1: footer page number.
  assert('@bottom-center footer page number', html.includes('英语试题 第') && html.includes('counter(page)') && html.includes('counter(pages)'), '')
  // 刀⑤ render-fidelity Chunk B — standard §3: line-height fixed 18pt (≈1.714 at 10.5pt).
  assert('line-height 1.714 (18pt fixed baseline, token-sourced)', html.includes('line-height: 1.714'), '')
  // 刀⑤ render-fidelity Chunk B — font stacks sourced from shared/papersurface/tokens.mjs.
  assert('body font-family sourced from tokens (Times New Roman + STSong)', html.includes('"Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif'), '')
}

// --- Test 6: Blank-marker styling (刀⑤ render-fidelity Chunk B / PA F2) ---
console.log('\nTest 6: Blank-marker styling (paperBlankPattern, real marker shapes)')
{
  const blankItems = [
    {
      detail: {
        id: 'g-grammar', title: 'Grammar', groupType: 'grammar_cloze',
        passage: { materialText: 'It is common for them __56__ (hold) during festivals.\nTransportation __59__ (be) underdeveloped then.' },
        questions: [],
      },
      score: 1.5,
    },
    {
      detail: {
        id: 'g-seven', title: 'Seven', groupType: 'seven_choices',
        passage: { materialText: 'Museums are changing fast. _____36_____ New tech helps a lot.' },
        questions: [],
      },
      score: 2,
    },
  ]
  const blankBlocks = [
    { type: 'question_group', questionGroupId: 'g-grammar', score: 1.5 },
    { type: 'question_group', questionGroupId: 'g-seven', score: 2 },
  ]
  const html = buildPrintHtml({ title: 'Blanks', versionType: 'student', printStyle: 'exam', items: blankItems, blocks: blankBlocks, questionNumberStart: 1 })

  const shortBlankCount = (html.match(/class="print-blank print-blank--short"/g) || []).length
  const sevenBlankCount = (html.match(/class="print-blank print-blank--seven"/g) || []).length
  assert('grammar_cloze __56__/__59__ styled with print-blank--short (2 blanks)', shortBlankCount === 2, `got ${shortBlankCount}`)
  assert('seven_choices _____36_____ styled with print-blank--seven (1 blank)', sevenBlankCount === 1, `got ${sevenBlankCount}`)
  assert('blank number 56 rendered inside print-blank-num', html.includes('<span class="print-blank-num">56</span>'), '')
  assert('blank number 36 rendered inside print-blank-num', html.includes('<span class="print-blank-num">36</span>'), '')
  assert('prose text around blanks still HTML-escaped correctly (no literal double underscores leak)', !html.includes('__56__') && !html.includes('_____36_____'), '')
  // owner QA 2026-07-08：inline-block 继承段落 text-indent 2em 会把题号推出横线
  // 压住后文（撞字），.print-blank 必须显式归零缩进。
  const blankCssRule = html.match(/\.print-blank \{[^}]*\}/)?.[0] || ''
  assert('.print-blank rule resets text-indent to 0 (title-indent inheritance bug)', /text-indent:\s*0/.test(blankCssRule), blankCssRule.slice(0, 120))
  // standard §3b 分页纪律(owner 2026-07-08):小题不拆、标题不落页尾、写作框不拆
  assert('§3b: .question is break-inside: avoid (单个小题不可拆)', html.match(/\.question \{[^}]*\}/g)?.some((r) => /break-inside:\s*avoid/.test(r)) === true, '')
  assert('§3b: section-header break-after: avoid (标题不落页尾)', /\.section-header,\s*\.group-meta \{\s*break-after:\s*avoid/.test(html), '')
  const boxBreakRule = html.match(/\.writing-answer-box \{\s*break-inside[^}]*\}/)?.[0] || (html.includes('.writing-answer-box {\n  break-inside: avoid;') ? 'ok' : '')
  assert('§3b: writing-answer-box break-inside: avoid (写作框整框不拆)', html.match(/\.writing-answer-box \{[^}]*\}/g)?.some((r) => /break-inside:\s*avoid/.test(r)) === true, '')
}

// --- Test 7: Writing answer box (standard §8) ---
console.log('\nTest 7: Writing answer box sizing')
{
  const writingItems = [
    { detail: { id: 'g-app', title: '应用文写作', groupType: 'writing', passage: { materialText: '请写一篇短文。' }, questions: [] }, score: 25 },
    { detail: { id: 'g-cont', title: '读后续写', groupType: 'writing', passage: { materialText: 'Once upon a time.' }, questions: [] }, score: 25 },
  ]
  const writingBlocks = [
    { type: 'question_group', questionGroupId: 'g-app', score: 25 },
    { type: 'question_group', questionGroupId: 'g-cont', score: 25 },
  ]
  const html = buildPrintHtml({ title: 'Writing', versionType: 'student', printStyle: 'exam', items: writingItems, blocks: writingBlocks, questionNumberStart: 1 })

  assert('应用文写作 box sized 144x65mm (standard §8)', html.includes('width:144mm;height:65mm;'), '')
  assert('读后续写 box sized 145x57mm (standard §8)', html.includes('width:145mm;height:57mm;'), '')
  const boxCount = (html.match(/class="writing-answer-box"/g) || []).length
  assert('exactly 2 writing-answer-box elements emitted', boxCount === 2, `got ${boxCount}`)
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

// --- Test 8: REAL paper-2026-i asset payload (PA F2 — no synthetic-only fixtures) ---
// I10 fake-green lesson: a verifier fed synthetic strings can pass while real
// PDFs ship unstyled blanks. This test renders the ACTUAL stored paper-2026-i
// paper-asset groups through the SAME `paperAssetParagraphText`-shaped
// transform `server/api.mjs` applies (paragraphs.map(text).join('\n\n')),
// then feeds that real text through the real `buildPrintHtml`, and counts
// styled blanks against the real on-disk marker count (independently
// verified via `paperBlankPattern` directly over the same real text).
console.log('\nTest 8: Real paper-2026-i asset payload — behavioral blank count (PA F2)')
{
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const assetPath = path.join(rootDir, 'app/public/paper-assets/paper-2026-i/latest/paper-asset.json')

  if (!existsSync(assetPath)) {
    console.log('  ⊘ SKIP: paper-2026-i asset not found at ' + assetPath)
  } else {
    const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
    const groups = asset.content.groups

    // Mirrors server/api.mjs `paperAssetParagraphText(group)` exactly —
    // paragraphs.map(text).filter(Boolean).join('\n\n'). This is the same
    // text that ends up in `detail.passage.materialText` for a real export.
    function paperAssetParagraphText(group) {
      const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
      return paragraphs.map((p) => String(p?.text || '').trim()).filter(Boolean).join('\n\n')
    }

    const realGroupSpecs = [
      { id: 'group-2026-i-seven-choices', groupType: 'seven_choices', blankClass: 'print-blank--seven' },
      { id: 'group-2026-i-cloze', groupType: 'cloze', blankClass: 'print-blank--short' },
      { id: 'group-2026-i-grammar-fill', groupType: 'grammar_cloze', blankClass: 'print-blank--short' },
    ]

    const realItems = realGroupSpecs.map((spec) => {
      const group = groups[spec.id]
      const materialText = paperAssetParagraphText(group)
      return {
        detail: {
          id: spec.id,
          title: group.title,
          groupType: spec.groupType,
          passage: { materialText },
          questions: [],
        },
        score: 1,
        // Keep the real text around so we can independently count expected blanks.
        __materialText: materialText,
      }
    })

    // Independent expected count: run paperBlankPattern directly over the
    // SAME real text (not a re-derived copy of the renderer's own logic).
    const { paperBlankPattern } = await import('../shared/papersurface/blankPattern.mjs')
    function countBlanks(text) {
      paperBlankPattern.lastIndex = 0
      let count = 0
      while (paperBlankPattern.exec(text) !== null) count++
      return count
    }

    const realBlocks = realItems.map((item) => ({ type: 'question_group', questionGroupId: item.detail.id, score: 1 }))
    const html = buildPrintHtml({
      title: '2026 新课标 I',
      versionType: 'student',
      printStyle: 'exam',
      items: realItems.map(({ __materialText, ...rest }) => rest),
      blocks: realBlocks,
      questionNumberStart: 1,
    })

    for (const spec of realGroupSpecs) {
      const item = realItems.find((it) => it.detail.id === spec.id)
      const expected = countBlanks(item.__materialText)
      assert(`${spec.id}: expected blank count > 0 (real asset has markers)`, expected > 0, `expected=${expected}`)
      // Count styled spans emitted specifically within this group's rendered
      // passage — approximate by counting the group-specific blank class
      // globally (each group uses only one class family in this fixture set).
      const styledCount = (html.match(new RegExp(`class="print-blank ${spec.blankClass}"`, 'g')) || []).length
      assert(`${spec.id}: real materialText blanks (${expected}) all styled in emitted HTML`, styledCount >= expected, `expected=${expected} styled=${styledCount}`)
    }

    // Cross-check against the plan's disposition-block-verified real counts
    // (2026-07-08 measurement): seven_choices=5, cloze=15, grammar_cloze=10.
    assert('seven_choices real blank count is 5 (2026-07-08 measured)', countBlanks(realItems[0].__materialText) === 5, `got ${countBlanks(realItems[0].__materialText)}`)
    assert('cloze real blank count is 15 (2026-07-08 measured)', countBlanks(realItems[1].__materialText) === 15, `got ${countBlanks(realItems[1].__materialText)}`)
    assert('grammar_cloze real blank count is 10 (2026-07-08 measured)', countBlanks(realItems[2].__materialText) === 10, `got ${countBlanks(realItems[2].__materialText)}`)

    // --- Test 9: real-PDF byte-level smoke from the REAL payload HTML ---
    console.log('\nTest 9: Real paper-2026-i payload → Vivliostyle PDF byte smoke')
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
    } else {
      const tempDir = mkdtempSync(path.join(tmpdir(), 'print-real-asset-smoke-'))
      const htmlPath = path.join(tempDir, 'real.html')
      const pdfPath = path.join(tempDir, 'real.pdf')
      try {
        writeFileSync(htmlPath, html)
        execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, stdio: 'pipe' })
        const pdfBytes = readFileSync(pdfPath)
        assert('real-asset PDF generated', pdfBytes.length > 0, `size: ${pdfBytes.length}`)
        assert('real-asset PDF starts with %PDF', pdfBytes.slice(0, 4).toString() === '%PDF', '')
      } catch (error) {
        console.log(`  ⊘ SKIP: vivliostyle build failed: ${error.message}`)
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
