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
import { proxyFreeEnv } from './lib/proxyFreeEnv.mjs'

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
      // draft-numbering-style: seven_choices is a BLANK_BEARING_GROUP_TYPE —
      // the hard consistency assertion requires in-text blank count to equal
      // question count (1 blank == 1 question here).
      passage: { title: 'Seven', materialText: 'Life skills passage. __36__ more text.' },
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

  // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): small-question
  // numbering is WHOLE-PAPER continuous again, seeded by questionNumberStart
  // (21 here) — round-1's per-group reset to (1) is retired (owner QA
  // verdict B). Group 1 (阅读理解) has 2 questions → 21, 22. Group 2
  // (七选五) has 1 question → 23 (continues, does not reset).
  assert('question 21 present (group 1, 1st of 2 questions)', html.includes('class="qnum">21.</span>'), '')
  assert('question 22 present (group 1, 2nd of 2 questions)', html.includes('class="qnum">22.</span>'), '')
  assert('question 23 present (group 2, continues past group 1 — not reset)', html.includes('class="qnum">23.</span>'), '')
  assert('no bracketed qnum anywhere (round-1 "(n)" form retired)', !/class="qnum">\(\d+\)<\/span>/.test(html), '')
  assert('passage text present', html.includes('The fox jumps.'), '')
  assert('options present', html.includes('A. Sleep'), '')
  assert('no answer in student', !html.includes('【答案】'), '')

  // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): 大题头由
  // 阿拉伯数字改汉字 (一、二、三…) — continuous across section_header /
  // page_break (unchanged from draft-depassage-letter, only the numeral
  // form changed).
  assert('group-header 一 present (阅读理解, score suffix, Chinese numeral)', html.includes('<div class="group-header">一、阅读理解（每题 2.5 分）</div>'), '')
  assert('group-header 二 present (七选五, continuous — not reset by section_header/page_break)', html.includes('<div class="group-header">二、七选五（每题 2 分）</div>'), '')
  // draft-numbering-style v2: the seven_choices in-text blank __36__ must be
  // remapped to the WHOLE-PAPER continuous number 23 — matching the
  // question-list entry for the SAME group (23), no parens.
  assert('seven_choices in-text blank __36__ remapped to 23 (matches its whole-paper continuous question number, no parens)', html.includes('<span class="print-blank-num">23</span>'), '')
  assert('literal blank marker 36 no longer shown bare in print-blank-num', !html.includes('<span class="print-blank-num">36</span>'), '')
  assert('no bracketed print-blank-num anywhere (round-1 "(n)" form retired)', !/class="print-blank-num">\(\d+\)<\/span>/.test(html), '')
  assert('legacy Print input projects no canonical passage-letter row', !html.includes('data-canonical-passage-letter='), '')
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
  assert('@bottom-center footer page number', html.includes('英语试题第 ') && html.includes(' 页（共 ') && html.includes(' 页）') && html.includes('counter(page)') && html.includes('counter(pages)'), '')
  // 刀⑤ render-fidelity Chunk B — standard §3: line-height fixed 18pt (≈1.714 at 10.5pt).
  assert('line-height 1.714 (18pt fixed baseline, token-sourced)', html.includes('line-height: 1.714'), '')
  // 刀⑤ render-fidelity Chunk B — font stacks sourced from shared/papersurface/tokens.mjs.
  assert('body font-family sourced from tokens (Times New Roman + STSong)', html.includes('"Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif'), '')
}

// --- Test 3b: heading-fidelity (刀⑤ SW-B 销账) — part/section split, h1 20pt ---
console.log('\nTest 3b: heading-fidelity — part/section-header split, h1 卷名 20pt')
{
  const headingBlocks = [
    { type: 'section_header', title: '第一部分 阅读理解（共两节，满分50分）' },
    { type: 'question_group', questionGroupId: 'g1', score: 2.5 },
    { type: 'section_header', title: '第一节（共15小题；每小题2.5分，满分37.5分）' },
    { type: 'question_group', questionGroupId: 'g2', score: 2 },
  ]
  const html = buildPrintHtml({ title: '2025 英语', versionType: 'student', printStyle: 'exam', items, blocks: headingBlocks, questionNumberStart: 1 })

  // ① h1 卷名 20pt (标准唯一放大项), heading font stack maintained.
  const h1Rule = html.match(/\.paper-header h1 \{[^}]*\}/)?.[0] || ''
  assert('① h1 (卷名) CSS rule is 20pt', /font-size:\s*20pt/.test(h1Rule), h1Rule)
  assert('① h1 rule no longer 18pt (old value retired)', !/font-size:\s*18pt/.test(h1Rule), h1Rule)

  // ② part heading (第X部分…): section-header--part class, no 12pt residue.
  assert('② part title carries section-header--part class', /<h2 class="section-header section-header--part"[^>]*>第一部分 阅读理解/.test(html), '')
  const partRule = html.match(/\.section-header--part \{[^}]*\}/)?.[0] || ''
  assert('② .section-header--part is bold, heading (Hei) font stack, no left indent', /font-weight:\s*bold/.test(partRule) && /SimHei/.test(partRule) && /padding-left:\s*0/.test(partRule), partRule)

  // ③ section heading (第X节…): section-header--section class, Song stack,
  // owner-gold body-left alignment (the historical 21pt indent is retired).
  assert('③ section title carries section-header--section class', /<h2 class="section-header section-header--section"[^>]*>第一节/.test(html), '')
  const sectionRule = html.match(/\.section-header--section \{[^}]*\}/)?.[0] || ''
  assert('③ .section-header--section is regular weight, Song(SimSun) font stack, and zero-indent', !/font-weight:\s*bold/.test(sectionRule) && /SimSun/.test(sectionRule) && /padding-left:\s*0/.test(sectionRule) && /text-indent:\s*0/.test(sectionRule), sectionRule)

  // ④ shared base rule: both states sit at 10.5pt, no 12pt residue anywhere.
  const baseRule = html.match(/\n\.section-header \{[^}]*\}/)?.[0] || ''
  assert('④ .section-header base rule is 10.5pt (no 12pt residue)', /font-size:\s*10\.5pt/.test(baseRule), baseRule)
  assert('④ no bare 12pt .section-header residue anywhere in emitted CSS', !/\.section-header\s*\{[^}]*font-size:\s*12pt/.test(html), '')

  // ⑤ negative: a title matching neither pattern falls back to 'part' (Locked Decision 1).
  const fallbackBlocks = [{ type: 'section_header', title: '写作' }, { type: 'question_group', questionGroupId: 'g1', score: 2.5 }]
  const fallbackHtml = buildPrintHtml({ title: 'X', versionType: 'student', printStyle: 'exam', items, blocks: fallbackBlocks, questionNumberStart: 1 })
  assert('⑤ non-matching title falls back to section-header--part (conservative default)', /<h2 class="section-header section-header--part"[^>]*>写作<\/h2>/.test(fallbackHtml), '')
}

// --- Test 6: Blank-marker styling (刀⑤ render-fidelity Chunk B / PA F2) ---
console.log('\nTest 6: Blank-marker styling (paperBlankPattern, real marker shapes)')
{
  // draft-numbering-style: BLANK_BEARING_GROUP_TYPES (grammar_cloze /
  // seven_choices here) now hard-assert in-text blank count === question
  // count, so `questions` can no longer be `[]` when the passage has real
  // markers — dummy question stubs (content unused by this test, which only
  // checks blank-span styling) keep the count matched: 2 blanks → 2
  // questions for grammar, 1 blank → 1 question for seven.
  function dummyBlankQuestion(id) {
    return { id, questionNo: id, stem: '', answer: '', explanation: '', note: '', options: [] }
  }
  const blankItems = [
    {
      detail: {
        id: 'g-grammar', title: 'Grammar', groupType: 'grammar_cloze',
        passage: { materialText: 'It is common for them __56__ (hold) during festivals.\nTransportation __59__ (be) underdeveloped then.' },
        questions: [dummyBlankQuestion('q-56'), dummyBlankQuestion('q-59')],
      },
      score: 1.5,
    },
    {
      detail: {
        id: 'g-seven', title: 'Seven', groupType: 'seven_choices',
        passage: { materialText: 'Museums are changing fast. _____36_____ New tech helps a lot.' },
        questions: [dummyBlankQuestion('q-36')],
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
  // draft-numbering-style v2: displayed number is the WHOLE-PAPER continuous
  // sequence (order of appearance), not the literal captured marker, no
  // parens — g-grammar (2 blanks, questionNumberStart:1) → 1, 2; g-seven
  // (1 blank) continues past g-grammar → 3 (not reset to 1).
  assert('grammar_cloze first blank remapped to 1 (was literal 56, no parens)', html.includes('<span class="print-blank-num">1</span>'), '')
  assert('grammar_cloze second blank remapped to 2 (was literal 59, no parens)', html.includes('<span class="print-blank-num">2</span>'), '')
  assert('seven_choices blank remapped to 3 (was literal 36; continues past grammar_cloze\'s count, not reset)', html.includes('<span class="print-blank-num">3</span>'), '')
  assert('literal marker values 56/59/36 no longer shown bare in print-blank-num', !html.includes('<span class="print-blank-num">56</span>') && !html.includes('<span class="print-blank-num">59</span>') && !html.includes('<span class="print-blank-num">36</span>'), '')
  assert('no bracketed print-blank-num anywhere (round-1 "(n)" form retired)', !/class="print-blank-num">\(\d+\)<\/span>/.test(html), '')
  assert('prose text around blanks still HTML-escaped correctly (no literal double underscores leak)', !html.includes('__56__') && !html.includes('_____36_____'), '')
  // owner QA 2026-07-08：inline-block 继承段落 text-indent 2em 会把题号推出横线
  // 压住后文（撞字），.print-blank 必须显式归零缩进。
  const blankCssRule = html.match(/\.print-blank \{[^}]*\}/)?.[0] || ''
  assert('.print-blank rule resets text-indent to 0 (title-indent inheritance bug)', /text-indent:\s*0/.test(blankCssRule), blankCssRule.slice(0, 120))
  // standard §3b 分页纪律(owner 2026-07-08):小题不拆、标题不落页尾。
  // Application Writing Golden Geometry scopes atomic box movement to the
  // canonical Application selector; Continuation keeps its historical flow.
  assert('§3b: .question is break-inside: avoid (单个小题不可拆)', html.match(/\.question \{[^}]*\}/g)?.some((r) => /break-inside:\s*avoid/.test(r)) === true, '')
  assert('§3b: section-header break-after: avoid (标题不落页尾)', /\.section-header,\s*\.group-meta,\s*\.group-header \{\s*break-after:\s*avoid/.test(html), '')
  assert('Continuation compatibility: shared writing-answer-box is not atomic', html.match(/\.writing-answer-box \{[^}]*\}/g)?.every((r) => !/break-inside:\s*avoid/.test(r) && !/page-break-inside:\s*avoid/.test(r)) === true, '')
  assert('Application Writing: canonical response box moves atomically', html.match(/\.canonical-application-response \{[^}]*\}/g)?.some((r) => /break-inside:\s*avoid/.test(r) && /page-break-inside:\s*avoid/.test(r)) === true, '')

  // draft-numbering-style cr.md MF-1: the hard consistency assertion must be
  // proven to REJECT, not only to admit matched fixtures — otherwise deleting
  // the throw keeps every verify green. Negative case: 2 in-text blanks vs 3
  // listed questions → buildPrintHtml must throw the assertion error.
  {
    const badItems = [
      {
        detail: {
          id: 'g-bad', title: 'Bad', groupType: 'grammar_cloze',
          passage: { materialText: 'It is common __56__ (hold) and __59__ (be) here.' },
          questions: [dummyBlankQuestion('q-1'), dummyBlankQuestion('q-2'), dummyBlankQuestion('q-3')],
        },
        score: 1.5,
      },
    ]
    const badBlocks = [{ type: 'question_group', questionGroupId: 'g-bad', score: 1.5 }]
    let thrown = null
    try {
      buildPrintHtml({ title: 'Bad', versionType: 'student', printStyle: 'exam', items: badItems, blocks: badBlocks, questionNumberStart: 1 })
    } catch (error) {
      thrown = error
    }
    assert('MF-1 negative: blank count (2) ≠ question count (3) throws', thrown !== null, 'buildPrintHtml did NOT throw')
    assert('MF-1 negative: error message names draft-numbering-style assertion', /draft-numbering-style/.test(thrown?.message || ''), thrown?.message?.slice(0, 120) || '')
  }
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

// --- Test 7b: writing-box-starters (owner 拍板 2026-07-16) ---
console.log('\nTest 7b: Writing answer box — continuation starters printed')
{
  const STARTER_1 = 'Daniel and Rachel suggested that Emily continue her journey by train.'
  const STARTER_2 = 'Three days later, Emily returned to get her car.'

  // Negative-first (验牙): no starters on this asset yet → box stays empty,
  // confirming the assertion below actually distinguishes the two states.
  const noStarterItems = [
    { detail: { id: 'g-cont', title: '读后续写', groupType: 'writing', passage: { materialText: 'Once upon a time.' }, questions: [] }, score: 25 },
  ]
  const noStarterBlocks = [{ type: 'question_group', questionGroupId: 'g-cont', score: 25 }]
  const emptyHtml = buildPrintHtml({ title: 'Writing', versionType: 'student', printStyle: 'exam', items: noStarterItems, blocks: noStarterBlocks, questionNumberStart: 1 })
  const emptyBoxMatch = emptyHtml.match(/<div class="writing-answer-box"[^>]*>([\s\S]*?)<\/div>/)
  assert('① no writingTask/no starters: box has no starter-line elements (still empty box, red-before-green)', emptyBoxMatch?.[1] === '', emptyBoxMatch?.[1])

  const withStarterItems = [
    {
      detail: {
        id: 'g-app', title: '应用文写作', groupType: 'writing', passage: { materialText: '请写一篇短文。' }, questions: [],
        writingTask: { taskType: 'application' },
      },
      score: 25,
    },
    {
      detail: {
        id: 'g-cont', title: '读后续写', groupType: 'writing', passage: { materialText: 'Once upon a time.' }, questions: [],
        writingTask: { taskType: 'continuation', continuationStarters: [STARTER_1, STARTER_2] },
      },
      score: 25,
    },
  ]
  const withStarterBlocks = [
    { type: 'question_group', questionGroupId: 'g-app', score: 25 },
    { type: 'question_group', questionGroupId: 'g-cont', score: 25 },
  ]
  const html = buildPrintHtml({ title: 'Writing', versionType: 'student', printStyle: 'exam', items: withStarterItems, blocks: withStarterBlocks, questionNumberStart: 1 })

  const contBoxMatch = html.match(/<div class="writing-answer-box" style="width:145mm[^"]*">([\s\S]*?)<\/div>/)
  const contBoxInner = contBoxMatch ? contBoxMatch[1] : ''
  assert('② 续写框含两句 starter 文本, 且在 .writing-answer-box 内', contBoxInner.includes(STARTER_1) && contBoxInner.includes(STARTER_2), contBoxInner)
  assert('② starter 原文照印, 不加 "Paragraph 1:" 前缀', !contBoxInner.includes('Paragraph 1:') && !contBoxInner.includes('Paragraph 2:'), contBoxInner)
  assert('② first starter line hugs box top (writing-starter-line--1)', /writing-starter-line--1">Daniel and Rachel/.test(contBoxInner), contBoxInner)
  assert('② second starter line at box 50% (writing-starter-line--2)', /writing-starter-line--2">Three days later/.test(contBoxInner), contBoxInner)

  const appBoxMatch = html.match(/<div class="writing-answer-box" style="width:144mm[^"]*">([\s\S]*?)<\/div>/)
  const appBoxInner = appBoxMatch ? appBoxMatch[1] : ''
  assert('③ 应用文框仍空 (无 writing-starter-line)', appBoxInner === '', appBoxInner)
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
      execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, env: proxyFreeEnv() })
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

    // Independent expected count: run paperBlankPattern directly over the
    // SAME real text (not a re-derived copy of the renderer's own logic).
    const { paperBlankPattern } = await import('../shared/papersurface/blankPattern.mjs')
    function countBlanks(text) {
      paperBlankPattern.lastIndex = 0
      let count = 0
      while (paperBlankPattern.exec(text) !== null) count++
      return count
    }

    // draft-numbering-style: these three real groups are all
    // BLANK_BEARING_GROUP_TYPES — the hard consistency assertion requires
    // question count === in-text blank count, so `questions` can no longer
    // be `[]`. Build dummy question stubs (content unused by this test,
    // which only checks blank-span styling / group-header text) sized to
    // the REAL, independently-measured blank count for each group.
    const realItems = realGroupSpecs.map((spec) => {
      const group = groups[spec.id]
      const materialText = paperAssetParagraphText(group)
      const blankCount = countBlanks(materialText)
      const questions = Array.from({ length: blankCount }, (_, i) => ({
        id: `${spec.id}-q${i + 1}`, questionNo: String(i + 1), stem: '', answer: '', explanation: '', note: '', options: [],
      }))
      return {
        detail: {
          id: spec.id,
          title: group.title,
          groupType: spec.groupType,
          passage: { materialText },
          questions,
        },
        score: 1,
        // Keep the real text around so we can independently count expected blanks.
        __materialText: materialText,
      }
    })

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

    // --- Test 8b: real paper-2026-i legacy reading inputs — group-header row.
    // Ticket 20 restores A-D only for a ready canonical whole-family
    // selection. These calls deliberately omit canonicalConsumption, so a
    // free-form detail.title such as "Reading A" must not synthesize a
    // canonical passage letter. Existing group headers remain unchanged. ---
    console.log('\nTest 8b: Real paper-2026-i reading groups — group-header row (大题头)')
    {
      const readingGroupIds = [
        'group-2026-i-reading-a',
        'group-2026-i-reading-b',
        'group-2026-i-reading-c',
        'group-2026-i-reading-d',
      ]
      for (const [index, groupId] of readingGroupIds.entries()) {
        const group = groups[groupId]
        const readingItem = {
          detail: {
            id: groupId,
            title: group.title,
            groupType: 'reading',
            passage: { materialText: paperAssetParagraphText(group) },
            questions: [],
          },
          score: 2.5,
        }
        const readingHtml = buildPrintHtml({
          title: '2026 新课标 I',
          versionType: 'student',
          printStyle: 'exam',
          items: [readingItem],
          blocks: [{ type: 'question_group', questionGroupId: groupId, score: 2.5 }],
          questionNumberStart: 1,
        })
        assert(
          `${groupId}: group-header "一、阅读理解（每题 2.5 分）" present before the passage (single-group block list, n starts at 1 → Chinese numeral 一)`,
          readingHtml.includes('<div class="group-header">一、阅读理解（每题 2.5 分）</div><div class="passage">'),
          readingHtml.slice(readingHtml.indexOf('<section class="question-group">'), readingHtml.indexOf('<section class="question-group">') + 200),
        )
        assert(
          `${groupId}: legacy detail.title "${group.title}" cannot synthesize a canonical passage-letter row`,
          !readingHtml.includes('data-canonical-passage-letter='),
          '',
        )
      }
      // Non-reading real groups (already built above as realItems, blocks
      // realBlocks) must never render a canonical passage letter and
      // must each carry their own group-header (n continuous across the
      // 3-group blocks list: seven_choices=1, cloze=2, grammar_cloze=3).
      assert(
        'non-reading real groups (seven_choices/cloze/grammar_cloze) never render a canonical passage letter',
        !html.includes('data-canonical-passage-letter='),
        html.includes('data-canonical-passage-letter=') ? 'found an unexpected canonical passage-letter row' : '',
      )
      assert('group-header 一、七选五 present (real seven_choices group, Chinese numeral)', html.includes('<div class="group-header">一、七选五（每题 1 分）</div>'), '')
      assert('group-header 二、完形填空 present (real cloze group, Chinese numeral)', html.includes('<div class="group-header">二、完形填空（每题 1 分）</div>'), '')
      assert('group-header 三、语法填空 present (real grammar_cloze group, Chinese numeral)', html.includes('<div class="group-header">三、语法填空（每题 1 分）</div>'), '')
      // CSS contract: .group-header is bold, visually lighter than .section-header.
      const groupHeaderCssRule = buildPrintHtml({ title: 'CSS', versionType: 'student', printStyle: 'exam', items: [], blocks: [], questionNumberStart: 1 }).match(/\.group-header \{[^}]*\}/)?.[0] || ''
      assert(
        '.group-header CSS rule is bold, font-size 11pt (draft 大题头 B 形态，owner 拍板保留，独立于 .section-header 10.5pt)',
        /font-weight:\s*bold/.test(groupHeaderCssRule) && /font-size:\s*11pt/.test(groupHeaderCssRule),
        groupHeaderCssRule,
      )
      assert('renderer-local legacy .passage-letter CSS rule remains retired', !buildPrintHtml({ title: 'CSS', versionType: 'student', printStyle: 'exam', items: [], blocks: [], questionNumberStart: 1 }).includes('.passage-letter {'), '')
    }

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
        execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, stdio: 'pipe', env: proxyFreeEnv() })
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
