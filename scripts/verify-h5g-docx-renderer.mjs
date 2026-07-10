#!/usr/bin/env node
/**
 * verify-h5g-docx-renderer.mjs
 *
 * H5-G extraction guard for server/exports/docxRenderer.mjs (the DOCX OOXML renderer — escapeXml …
 * convertDocxToPdf, 24 fns + readingDistractorTypeLabel — moved out of server/api.mjs). USER-VISIBLE:
 * the produced .docx/.pdf bytes are part of the contract, so the WordprocessingML string literals are
 * byte-sensitive. This guard exercises the REAL renderer (NOT the H5-A export-impl stub) to prove the
 * moved XML strings are byte-identical and the seam is wired correctly.
 *
 * HERMETIC: no `git show main:...`, no network, no AI, no LibreOffice. Builds a representative
 * question-group `detail` fixture (passage + reading/grammar/cloze/seven-choices questions with saved
 * parse/verify data) and drives:
 *  - buildDocumentXml (via the factory) for handout + exam printStyle and student + teacher versionType,
 *    asserting the documentXml is byte-STABLE against a within-run snapshot and contains the expected
 *    WordprocessingML markers + groupTypeLabels + readingDistractorTypeLabel + docxVerifyVerdictLabels
 *    outputs verbatim (the byte-sensitive moved strings).
 *  - buildExamDocumentXml indirectly (printStyle === 'exam' delegates to it; it is file-private).
 *  - writeDocxPackage on a temp path -> asserts a non-empty zip with the PK header, then cleans up.
 *
 * Plus structural guards:
 *  - the factory returns EXACTLY the 3 entry fns; the 23 helpers + readingDistractorTypeLabel are NOT
 *    exported (file-private).
 *  - the module does NOT import from ../api.mjs (no cycle).
 *  - used-but-undefined guard: dropping groupTypeLabels / optionalString makes the factory throw, and a
 *    driven fn cannot run.
 *  - timestampPrefix is NOT in the docx module (it stayed in api.mjs).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import * as moduleNamespace from '../server/exports/docxRenderer.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? `\n  detail: ${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function assertEqualJson(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  assert(name, a === e, a === e ? '' : `\n  actual:   ${a}\n  expected: ${e}`)
}

// ------------------------------------------------------------------
// Injected deps mirroring api.mjs byte-for-byte.
// ------------------------------------------------------------------
function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}
const groupTypeLabels = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
  listening: '听力',
  other: '其他',
}

// ------------------------------------------------------------------
// Representative fixtures: one item per branch (reading / grammar / cloze / seven_choices) with saved
// parse + verify data, so docxQuestionExplanation / pushDocx*Analysis / readingDistractorTypeLabel /
// docxVerifyVerdictLabels all fire.
// ------------------------------------------------------------------
function passage(title, text) {
  return { title, materialText: text, summary: text }
}

const READING_DETAIL = {
  id: 'g-reading',
  title: '阅读理解 A',
  source: '2024 测试卷',
  groupType: 'reading',
  defaultScore: 15,
  passage: passage('Reading Passage', 'Tom & Jerry went to the <market>.\nIt was cold.'),
  questions: [
    {
      questionNo: '21',
      stem: 'What did Tom do?',
      answer: 'A',
      explanation: 'fallback explanation',
      options: [
        { label: 'A', content: 'Help others', displayOrder: 1 },
        { label: 'B', content: 'Stay home', displayOrder: 2 },
        { label: 'C', content: 'Go shopping', displayOrder: 3 },
        { label: 'D', content: 'Sleep more', displayOrder: 4 },
      ],
    },
  ],
  readingParseResult: {
    questions: [
      {
        questionNo: '21',
        questionTranslation: '汤姆做了什么？',
        strategy: '细节定位',
        locationSentence: 'Tom went to the market.',
        locationSentenceTranslation: '汤姆去了市场。',
        answerSentence: 'He decided to help.',
        explanation: 'AI 阅读解析正文',
        synonymMappings: [{ text: 'help', replacement: 'assist' }],
        distractorAnalysis: [
          { option: 'B', type: '0', reason: '正确项理由' },
          { option: 'C', type: '2', reason: '无中生有理由' },
        ],
        languageFeatures: '长难句',
      },
    ],
  },
  readingVerifyResult: {
    results: [{ questionNo: '21', verdict: 'correct' }],
  },
}

const GRAMMAR_DETAIL = {
  id: 'g-grammar',
  title: '语法填空',
  source: '2024 测试卷',
  groupType: 'grammar_cloze',
  defaultScore: 15,
  // draft-numbering-style: needs a REAL paperBlankPattern-shaped marker
  // (`__56__`, matching the single question's questionNo below) — a bare
  // `____` with no digit never matched paperBlankPattern even pre-cut, and
  // the new hard consistency assertion (blank count === question count for
  // BLANK_BEARING_GROUP_TYPES) now requires exactly 1 real blank here.
  passage: passage('Grammar Passage', 'There __56__ a book on the desk.'),
  questions: [
    {
      questionNo: '56',
      stem: '',
      answer: 'is',
      explanation: 'grammar fallback',
      options: [],
    },
  ],
  grammarParseResult: {
    questions: [
      {
        questionNo: '56',
        answer: 'is',
        hintMeaning: '系动词',
        analysis: 'AI 语法解析',
        sentenceTranslation: '桌上有一本书。',
      },
    ],
  },
}

const CLOZE_DETAIL = {
  id: 'g-cloze',
  title: '完形填空',
  source: '2024 测试卷',
  groupType: 'cloze',
  defaultScore: 30,
  // draft-numbering-style: see GRAMMAR_DETAIL's comment above — real marker
  // matching the single question's questionNo (41).
  passage: passage('Cloze Passage', 'The boy was very __41__ that day.'),
  questions: [
    {
      questionNo: '41',
      stem: '第 41 空',
      answer: 'B',
      explanation: 'cloze fallback',
      options: [
        { label: 'A', content: 'sad', displayOrder: 1 },
        { label: 'B', content: 'happy', displayOrder: 2 },
        { label: 'C', content: 'angry', displayOrder: 3 },
        { label: 'D', content: 'tired', displayOrder: 4 },
      ],
    },
  ],
  clozeParseResult: {
    questions: [
      {
        questionNo: '41',
        answer: 'B',
        answerText: 'happy',
        answerMeaning: '高兴的',
        analysis: 'AI 完形解析',
        distractorAnalysis: [{ option: 'A', text: 'sad', reason: '语境相反' }],
      },
    ],
  },
}

const SEVEN_DETAIL = {
  id: 'g-seven',
  title: '七选五',
  source: '2024 测试卷',
  groupType: 'seven_choices',
  defaultScore: 10,
  // draft-numbering-style: see GRAMMAR_DETAIL's comment above — real marker
  // matching the single question's questionNo (36), seven_choices' longer
  // 5-underscore delimiter shape.
  passage: passage('Seven Passage', 'Reading is important. _____36_____'),
  questions: [
    {
      questionNo: '36',
      stem: '',
      answer: 'C',
      explanation: 'seven fallback',
      options: [
        { label: 'A', content: 'First option', displayOrder: 1 },
        { label: 'C', content: 'Third option', displayOrder: 3 },
      ],
    },
  ],
  sevenChoicesParseResult: {
    questions: [
      {
        questionNo: '36',
        answer: 'C',
        optionText: 'Third option',
        optionTranslation: '第三个选项',
        positionContext: '段首',
        analysis: 'AI 七选五解析',
      },
    ],
  },
}

const ITEMS = [
  { detail: READING_DETAIL, note: '讲评备注示例', score: 7.5, sectionTitle: '阅读理解 A' },
  { detail: GRAMMAR_DETAIL, note: '', score: 1.5, sectionTitle: '语法填空' },
  { detail: CLOZE_DETAIL, note: '', score: 1.5, sectionTitle: '完形填空' },
  { detail: SEVEN_DETAIL, note: '', score: 2, sectionTitle: '七选五 B' },
]

const BLOCKS = [
  { type: 'section_header', title: '第一部分 阅读' },
  { type: 'question_group', questionGroupId: 'g-reading', sectionTitle: '阅读理解 A', score: 2 },
  { type: 'page_break' },
  { type: 'question_group', questionGroupId: 'g-grammar', sectionTitle: '语法填空', score: 1.5 },
  { type: 'question_group', questionGroupId: 'g-cloze', sectionTitle: '完形填空', score: 1.5 },
  { type: 'question_group', questionGroupId: 'g-seven', sectionTitle: '七选五 B', score: 2 },
]

function makeRenderer(overrides = {}) {
  return createDocxRenderer({ groupTypeLabels, optionalString, ...overrides })
}

// ============================================================
// Checks
// ============================================================
function assertExportSurface() {
  const namedExports = Object.keys(moduleNamespace).sort()
  assertEqualJson('module exports exactly the factory', namedExports, ['createDocxRenderer'])

  const renderer = makeRenderer()
  const keys = Object.keys(renderer).sort()
  assertEqualJson('factory returns exactly the 3 entry fns', keys, ['buildDocumentXml', 'convertDocxToPdf', 'writeDocxPackage'])

  // The 23 docx helpers + readingDistractorTypeLabel must NOT be exported nor returned (file-private).
  for (const helper of [
    'escapeXml', 'run', 'paragraph', 'docxSimpleTable', 'normalizeDocxLines', 'stripTrailingSpaces',
    'docxQuestionStem', 'uniqueDocxOptions', 'docxVerifyStatusLabel', 'docxQuestionExplanation',
    'pushDocxLabelParagraph', 'pushDocxReadingAnalysis', 'pushDocxGrammarAnalysis', 'pushDocxClozeAnalysis',
    'pushDocxSevenChoicesAnalysis', 'pushDocxAnswerArea', 'buildExamDocumentXml', 'examOptionTable',
    'findSoffice', 'readingDistractorTypeLabel', 'docxVerifyVerdictLabels',
  ]) {
    assert(`helper ${helper} is NOT exported (file-private)`, !(helper in moduleNamespace) && !(helper in renderer))
  }
}

function assertHandoutRenderByteStable() {
  const renderer = makeRenderer()

  // Determinism: buildDocumentXml is pure given inputs (no Date/random inside it — those live only in
  // writeDocxPackage's docProps). Two calls must be byte-identical.
  const a = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'handout' })
  const b = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'handout' })
  assert('handout/teacher documentXml is byte-stable across calls', a === b)

  // WordprocessingML envelope markers (byte-sensitive moved strings).
  assert('documentXml has the exact XML declaration', a.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'))
  // 刀⑤ render-fidelity Chunk C: xmlns:r added for w:footerReference's r:id attribute.
  assert('documentXml has the w:document namespace decl (w: + r:, Chunk C footer)', a.includes('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'))
  // 刀⑤ render-fidelity Chunk C — standard §1: 24mm=1361 twips left/right,
  // 21mm=1191 twips top, footer 17.5mm=992 twips, plus the footerReference
  // that resolves the old V1 TODO.
  assert('documentXml has the sectPr page-size + margin + footer literal verbatim', a.includes('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1191" w:right="1361" w:bottom="1361" w:left="1361" w:header="708" w:footer="992" w:gutter="0"/></w:sectPr>'))
  assert('handout header banner literal present', a.includes('ENGLISH QUESTION SET'))

  // groupTypeLabels output verbatim (injected dep flows through the meta line).
  assert('groupTypeLabels[reading] rendered verbatim', a.includes('阅读理解'))
  assert('groupTypeLabels[grammar_cloze] rendered verbatim', a.includes('语法填空'))
  assert('groupTypeLabels[seven_choices] rendered verbatim', a.includes('七选五'))

  // escapeXml fired on passage text (& and < escaped).
  assert('escapeXml escaped & verbatim', a.includes('Tom &amp; Jerry'))
  assert('escapeXml escaped < verbatim', a.includes('&lt;market&gt;'))

  // Teacher version: reading analysis path -> verify verdict label + distractor type labels.
  assert('docxVerifyVerdictLabels correct-path status text present', a.includes('答案确认正确'))
  assert('readingDistractorTypeLabel(0) -> 正确项 verbatim', a.includes('正确项'))
  assert('readingDistractorTypeLabel(2) -> 无中生有 verbatim', a.includes('无中生有'))
  assert('synonym mapping table label present', a.includes('同义替换'))
  assert('grammar AI analysis label present', a.includes('AI 解析'))
  assert('cloze distractor analysis label present', a.includes('干扰项分析'))
  assert('seven-choices option translation label present', a.includes('选项翻译'))
  assert('teacher note rendered', a.includes('讲评备注：讲评备注示例'))

  // Student version hides answers/analysis (pushDocxAnswerArea early-returns).
  const student = renderer.buildDocumentXml({ title: '测试卷', versionType: 'student', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'handout' })
  assert('student version omits the answer area', !student.includes('答案确认正确') && !student.includes('AI 解析'))
  assert('student version still renders the question stem', student.includes('What did Tom do?'))

  return a
}

function assertExamRenderByteStable() {
  const renderer = makeRenderer()

  // printStyle 'exam' delegates to the file-private buildExamDocumentXml.
  const exam = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'exam' })
  const exam2 = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'exam' })
  assert('exam/teacher documentXml is byte-stable across calls', exam === exam2)
  assert('exam render uses buildExamDocumentXml header note', exam.includes('（教师版 含答案解析）'))
  assert('exam render emits compact 【答案】 marker verbatim', exam.includes('【答案】'))
  assert('exam render emits the page-break run verbatim', exam.includes('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'))
  assert('exam render carries the same sectPr literal (shared docxSectPr, Chunk C)', exam.includes('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="11906" w:h="16838"/>'))
  // owner QA 2026-07-08：正文段落须带段首缩进 2 字符（10.5pt 下 = 420 twips，标准 §3）
  assert('passage paragraphs carry w:firstLine="420" first-line indent (standard §3)', exam.includes('w:firstLine="420"'), 'first-line indent missing')

  // exam differs from handout (proves the branch actually routed).
  const handout = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'handout' })
  assert('exam render differs from handout render (branch routed)', exam !== handout)
}

// draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): small-question
// numbering in the exam-style builder is WHOLE-PAPER continuous again
// (round-1's per-group reset to `(1)` is retired — owner QA verdict B), and
// in-text blank markers remap to that SAME whole-paper continuous number,
// no parens — while the non-exam handout builder is DELIBERATELY unchanged
// (module header comment above `buildDocumentXml`, mirrors draft-depassage-
// letter's SW-2). BLOCKS has 4 question_group blocks, each with exactly ONE
// question (READING / GRAMMAR / CLOZE / SEVEN), questionNumberStart:21 →
// 21, 22, 23, 24 continuous.
function assertNumberingResetAndBlankRemap() {
  const renderer = makeRenderer()

  const exam = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'exam' })

  // Question-list format: `n.  ` no parens, whole-paper continuous — reading
  // 21, grammar 22, cloze 23, seven 24 (never reset to 1).
  assert('exam: question 21 present (g-reading)', exam.includes('<w:t xml:space="preserve">21.  '))
  assert('exam: question 22 present (g-grammar, continues past g-reading)', exam.includes('<w:t xml:space="preserve">22.  '))
  assert('exam: question 23 present (g-cloze, continues past g-grammar)', exam.includes('<w:t xml:space="preserve">23.  '))
  assert('exam: question 24 present (g-seven, continues past g-cloze)', exam.includes('<w:t xml:space="preserve">24.  '))
  assert('exam: round-1 group-local "(1)" numbering format is absent', !/<w:t xml:space="preserve">\(\d+\)  /.test(exam))

  // In-text blank remap: each of grammar/cloze/seven has exactly 1 blank,
  // remapped to its OWN group's whole-paper continuous number (22/23/24 —
  // matching each group's single question-list entry above), same padding
  // convention (`docxBlankPaddingSpaces`: 2-space for grammar/cloze, 3-space
  // for seven), no parens.
  assert('exam: grammar_cloze in-text blank remapped to "  22  " (2-space padding, was literal 56)', exam.includes('  22  '))
  assert('exam: cloze in-text blank remapped to "  23  " (2-space padding, was literal 41)', exam.includes('  23  '))
  assert('exam: seven_choices in-text blank remapped to "   24   " (3-space padding, was literal 36)', exam.includes('   24   '))
  assert('exam: literal blank marker digits 56/41/36 no longer shown padded-bare (all remapped)', !exam.includes('  56  ') && !exam.includes('  41  ') && !exam.includes('   36   '))
  assert('exam: no bracketed in-text blank remap anywhere (round-1 "(n)" form retired)', !/  \(\d+\)  /.test(exam) && !/   \(\d+\)   /.test(exam))

  // Handout builder stays byte-for-byte on the OLD contract: continuous
  // numbering (still seeded by questionNumberStart) + raw literal blank
  // marker digits, no parens anywhere.
  const handout = renderer.buildDocumentXml({ title: '测试卷', versionType: 'teacher', items: ITEMS, blocks: BLOCKS, questionNumberStart: 21, printStyle: 'handout' })
  assert('handout: numbering still continuous from questionNumberStart (21. present, NOT reset)', handout.includes('21. '))
  assert('handout: grammar_cloze/cloze in-text blank markers still show the RAW literal digit "  56  " (SW-2 asymmetry preserved)', handout.includes('  56  '))
  assert('handout: seven_choices in-text blank marker still shows the RAW literal digit "   36   "', handout.includes('   36   '))
}

function assertWriteDocxPackage(documentXml) {
  const renderer = makeRenderer()
  const outDir = path.join(tmpdir(), `h5g-docx-${process.pid}-${Date.now()}`)
  const outputPath = path.join(outDir, 'out.docx')
  // writeDocxPackage mkdtemps its own working dir; outputPath only needs its parent dir to exist.
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  try {
    const body = renderer.writeDocxPackage({ documentXml, outputPath, title: '测试卷 <X>' })
    assert('writeDocxPackage returns a Buffer', Buffer.isBuffer(body))
    assert('writeDocxPackage produced a non-empty zip', body.length > 0)
    assert('writeDocxPackage output has the PK zip header', body[0] === 0x50 && body[1] === 0x4b)
    assert('writeDocxPackage wrote the file to outputPath', existsSync(outputPath))
    const onDisk = readFileSync(outputPath)
    assert('on-disk zip also has the PK header', onDisk[0] === 0x50 && onDisk[1] === 0x4b)
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

function assertUsedButUndefinedRejects() {
  // Dropping an injected dep makes the factory throw (guard at factory boundary).
  let threwGroup = false
  try {
    createDocxRenderer({ optionalString })
  } catch {
    threwGroup = true
  }
  assert('used-but-undefined guard: dropping groupTypeLabels makes the factory throw', threwGroup)

  let threwOpt = false
  try {
    createDocxRenderer({ groupTypeLabels })
  } catch {
    threwOpt = true
  }
  assert('used-but-undefined guard: dropping optionalString makes the factory throw', threwOpt)
}

function assertSourceGuards() {
  const src = readFileSync(path.join(repoRoot, 'server/exports/docxRenderer.mjs'), 'utf8')
  assert('module does NOT import from api.mjs (no cycle)', !/from\s+['"][^'"]*\bapi\.mjs['"]/.test(src))
  assert('module imports execFileSync from node:child_process directly', /import\s+\{\s*execFileSync\s*\}\s+from\s+'node:child_process'/.test(src))
  // timestampPrefix stayed in api.mjs — must NOT be a binding here (a comment mention is fine).
  assert('timestampPrefix is NOT declared in the docx module', !/\n(?:function|const|let)\s+timestampPrefix\b/.test(src))
  // Moved fns live at module indent 0 (function decl at col 0), so the multiline XML templates are not re-indented.
  assert('escapeXml lives at module indent 0', /\nfunction escapeXml\(value\) \{/.test(src))
  // figure-render cut: buildDocumentXml / writeDocxPackage gained an
  // `images` out-parameter (default `[]`) — see the header comment above
  // `buildExamDocumentXml` in docxRenderer.mjs. The exact-signature regex
  // below is updated to match (natural turnover per AGENTS.md's verify
  // convention: a source-contract change this cut makes, not bulk cleanup).
  assert('buildDocumentXml lives at module indent 0', /\nfunction buildDocumentXml\(\{ title, versionType, items, blocks, questionNumberStart, printStyle, images = \[\] \}\) \{/.test(src))
  assert('writeDocxPackage lives at module indent 0', /\nfunction writeDocxPackage\(\{ documentXml, outputPath, title, images = \[\] \}\) \{/.test(src))
  // 刀⑤ render-fidelity Chunk C resolves the V1 footer TODO — assert it's
  // actually gone and the real footer wiring (docxSectPr + footerReference)
  // is in its place, not that the TODO is still there.
  assert('V1 footer TODO comment is gone (Chunk C resolved it)', !src.includes('// TODO: Footer with page numbers'))
  assert('docxSectPr wires w:footerReference (V1 TODO resolution)', src.includes('w:footerReference w:type="default" r:id="${DOCX_FOOTER_RELATIONSHIP_ID}"'))
}

function assertApiIntegration() {
  const apiSrc = readFileSync(path.join(repoRoot, 'server/api.mjs'), 'utf8')
  assert('api.mjs imports createDocxRenderer', apiSrc.includes("import { createDocxRenderer } from './exports/docxRenderer.mjs'"))
  assert('api.mjs calls the factory', /const docxRenderer = createDocxRenderer\(\{/.test(apiSrc))
  for (const seam of ['buildDocumentXml', 'writeDocxPackage', 'convertDocxToPdf']) {
    assert(`api.mjs destructures ${seam}Impl from the factory`, apiSrc.includes(`${seam}: ${seam}Impl`))
  }
  // Hoisted forwarding wrappers preserve the exact signatures. figure-render
  // cut: both gained the same `images = []` out-parameter as the docxRenderer
  // functions above (natural turnover, see that assertion's comment).
  assert('buildDocumentXml wrapper preserves signature', /\nfunction buildDocumentXml\(\{ title, versionType, items, blocks, questionNumberStart, printStyle, images = \[\] \}\) \{\n\s*return buildDocumentXmlImpl\(\{ title, versionType, items, blocks, questionNumberStart, printStyle, images \}\)/.test(apiSrc))
  assert('writeDocxPackage wrapper preserves signature', /\nfunction writeDocxPackage\(\{ documentXml, outputPath, title, images = \[\] \}\) \{\n\s*return writeDocxPackageImpl\(\{ documentXml, outputPath, title, images \}\)/.test(apiSrc))
  assert('convertDocxToPdf wrapper preserves signature', /\nfunction convertDocxToPdf\(docxPath, outputPath\) \{\n\s*return convertDocxToPdfImpl\(docxPath, outputPath\)/.test(apiSrc))
  // The heavy moved bodies are gone from api.mjs.
  assert('api.mjs no longer defines escapeXml', !/\nfunction escapeXml\(/.test(apiSrc))
  assert('api.mjs no longer defines buildExamDocumentXml', !/\nfunction buildExamDocumentXml\(/.test(apiSrc))
  assert('api.mjs no longer defines readingDistractorTypeLabel', !/\nfunction readingDistractorTypeLabel\(/.test(apiSrc))
  // timestampPrefix STAYED in api.mjs.
  assert('api.mjs still defines timestampPrefix (STAY)', /\nfunction timestampPrefix\(\) \{/.test(apiSrc))
}

// ------------------------------------------------------------------
// 刀⑤ render-fidelity Chunk C / PA F2 — REAL paper-2026-i asset payload,
// no synthetic-only fixtures for the blank-count claim (I10 fake-green
// lesson). Mirrors verify-print-renderer.mjs's Test 8: renders the actual
// stored paper-2026-i groups through the SAME `paperAssetParagraphText`
// transform server/api.mjs applies, feeds that real text through the REAL
// buildDocumentXml, and counts styled blank runs (the underlined
// padding+number runs docxPassageLineRuns emits) against an independently
// computed expected count (paperBlankPattern run directly over the same
// real text).
// ------------------------------------------------------------------
async function assertRealAssetBlankCounts() {
  const assetPath = path.join(repoRoot, 'app/public/paper-assets/paper-2026-i/latest/paper-asset.json')

  if (!existsSync(assetPath)) {
    console.log(`  ⊘ SKIP: paper-2026-i asset not found at ${assetPath}`)
    return
  }

  const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
  const groups = asset.content.groups

  // Mirrors server/api.mjs `paperAssetParagraphText(group)` exactly.
  function paperAssetParagraphText(group) {
    const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
    return paragraphs.map((p) => String(p?.text || '').trim()).filter(Boolean).join('\n\n')
  }

  const { paperBlankPattern } = await import('../shared/papersurface/blankPattern.mjs')
  function countBlanks(text) {
    paperBlankPattern.lastIndex = 0
    let count = 0
    while (paperBlankPattern.exec(text) !== null) count++
    return count
  }

  const realGroupSpecs = [
    { id: 'group-2026-i-seven-choices', groupType: 'seven_choices', expected: 5 },
    { id: 'group-2026-i-cloze', groupType: 'cloze', expected: 15 },
    { id: 'group-2026-i-grammar-fill', groupType: 'grammar_cloze', expected: 10 },
  ]

  const renderer = makeRenderer()

  for (const spec of realGroupSpecs) {
    const group = groups[spec.id]
    const materialText = paperAssetParagraphText(group)
    const expected = countBlanks(materialText)
    assert(`${spec.id}: real materialText blank count matches the 2026-07-08 measured value`, expected === spec.expected, `expected=${spec.expected} got=${expected}`)

    // draft-numbering-style: seven_choices/cloze/grammar_cloze are
    // BLANK_BEARING_GROUP_TYPES — the exam-style builder's hard consistency
    // assertion (blank count === question count) requires `questions` to be
    // sized to the REAL, independently-measured blank count. Content is
    // unused by this test (only checks styled-run count in the XML).
    const questions = Array.from({ length: expected }, (_, i) => ({
      id: `${spec.id}-q${i + 1}`, questionNo: String(i + 1), stem: '', answer: '', explanation: '', options: [],
    }))
    const detail = {
      id: spec.id,
      title: group.title,
      source: '2026 新课标 I',
      groupType: spec.groupType,
      passage: { title: group.passage?.title || '', materialText, summary: materialText },
      questions,
    }
    const items = [{ detail, note: '', score: 1, sectionTitle: group.title }]
    const blocks = [{ type: 'question_group', questionGroupId: spec.id, score: 1 }]

    for (const printStyle of ['exam', 'handout']) {
      const xml = renderer.buildDocumentXml({ title: '2026 新课标 I', versionType: 'student', items, blocks, questionNumberStart: 1, printStyle })
      const styledCount = (xml.match(/<w:u w:val="single"\/>/g) || []).length
      assert(`${spec.id} (${printStyle}): real payload styled blank runs (${expected}) all emitted in document.xml`, styledCount === expected, `expected=${expected} styled=${styledCount}`)
    }
  }
}

// ------------------------------------------------------------------
// figure-render cut (fig-token P0) — real paper-2026-i reading-a table
// figure, through the FACTORY path (createDocxRenderer({ paperAssetsDir }),
// same wiring api.mjs uses), covering BOTH document builders (exam +
// handout printStyle — MF-3's "all 4 emit sites" requirement: this asset
// only has a `blocks`-driven item, so each printStyle exercises 2 of the 4
// sites; the legacy (no-blocks) sites are covered by the synthetic
// assertLegacyFigureEmbed below using the SAME real PNG).
// ------------------------------------------------------------------
function assertRealAssetFigureEmbed() {
  const assetPath = path.join(repoRoot, 'app/public/paper-assets/paper-2026-i/latest/paper-asset.json')
  if (!existsSync(assetPath)) {
    console.log(`  ⊘ SKIP: paper-2026-i asset not found at ${assetPath}`)
    return
  }

  const paperAssetsDir = path.join(repoRoot, 'app/public/paper-assets')
  const renderer = createDocxRenderer({ groupTypeLabels, optionalString, paperAssetsDir })

  const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
  const group = asset.content.groups['group-2026-i-reading-a']
  const materialText = (group.passage?.paragraphs || [])
    .map((p) => String(p?.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
  assert('real paper-2026-i reading-a materialText carries the raw figure marker (fixture sanity)', materialText.includes('[表: fig-paper-2026-i-reading-a-table-1]'))

  const detail = {
    id: 'group-2026-i-reading-a',
    title: group.title,
    source: '2026 新课标 I',
    groupType: 'reading',
    passage: { title: group.passage?.title || group.title, materialText, summary: materialText },
    questions: [],
  }
  const items = [{ detail, note: '', score: 3, sectionTitle: '' }]
  const blocks = [{ type: 'question_group', questionGroupId: 'group-2026-i-reading-a', score: 3 }]

  for (const printStyle of ['exam', 'handout']) {
    const images = []
    const documentXml = renderer.buildDocumentXml({ title: '2026 新课标 I', versionType: 'student', items, blocks, questionNumberStart: 1, printStyle, images })
    assert(`${printStyle}: real figure marker resolves to an embedded image, not the raw token`, !documentXml.includes('[表: fig-') && documentXml.includes('<w:drawing>'))
    assert(`${printStyle}: images out-parameter collected exactly 1 image`, images.length === 1, `got ${images.length}`)
    assert(`${printStyle}: documentXml references the collected image's rId`, documentXml.includes(`r:embed="${images[0]?.rId}"`))

    const outDir = mkdtempSync(path.join(tmpdir(), `h5g-docx-figure-${process.pid}-`))
    try {
      const outputPath = path.join(outDir, 'out.docx')
      const body = renderer.writeDocxPackage({ documentXml, images, outputPath, title: '2026 新课标 I' })
      assert(`${printStyle}: writeDocxPackage embeds the media part + PK zip`, Buffer.isBuffer(body) && body[0] === 0x50 && body[1] === 0x4b)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  }

  // No-figures control: a paperAssetsDir IS configured, but this groupId
  // isn't paper-asset sourced at all — resolveGroupFigures returns null,
  // so the passage text (no marker) renders through the unchanged path.
  const noFigureDetail = { ...READING_DETAIL, id: 'g-reading-no-figure' }
  const noFigureItems = [{ detail: noFigureDetail, note: '', score: 1, sectionTitle: '' }]
  const noFigureBlocks = [{ type: 'question_group', questionGroupId: 'g-reading-no-figure', score: 1 }]
  const noFigureImages = []
  const noFigureXml = renderer.buildDocumentXml({ title: 'T', versionType: 'student', items: noFigureItems, blocks: noFigureBlocks, questionNumberStart: 1, printStyle: 'exam', images: noFigureImages })
  assert('a group with no paper-asset match renders with zero images collected', noFigureImages.length === 0)
  assert('a group with no paper-asset match never emits a <w:drawing>', !noFigureXml.includes('<w:drawing>'))
}

// ============================================================
// Main
// ============================================================
async function main() {
  assertExportSurface()
  const handoutXml = assertHandoutRenderByteStable()
  assertExamRenderByteStable()
  assertNumberingResetAndBlankRemap()
  await assertWriteDocxPackage(handoutXml)
  assertUsedButUndefinedRejects()
  assertSourceGuards()
  assertApiIntegration()
  await assertRealAssetBlankCounts()
  assertRealAssetFigureEmbed()

  // draft-numbering-style cr.md MF-1: negative case — the exam-style DOCX
  // path must REJECT a blank/question count mismatch (2 in-text blanks vs 3
  // questions), proving the hard consistency assertion's throw path, not
  // only its happy path.
  {
    const renderer = makeRenderer()
    const badItems = [
      {
        detail: {
          id: 'g-bad', title: 'Bad', groupType: 'grammar_cloze',
          passage: { materialText: 'It is common __56__ (hold) and __59__ (be) here.' },
          questions: [
            { id: 'q-1', questionNo: 1, stem: '', answer: '', explanation: '', note: '', options: [] },
            { id: 'q-2', questionNo: 2, stem: '', answer: '', explanation: '', note: '', options: [] },
            { id: 'q-3', questionNo: 3, stem: '', answer: '', explanation: '', note: '', options: [] },
          ],
        },
        score: 1.5,
      },
    ]
    const badBlocks = [{ type: 'question_group', questionGroupId: 'g-bad', score: 1.5 }]
    let thrown = null
    try {
      renderer.buildDocumentXml({ title: 'Bad', versionType: 'student', items: badItems, blocks: badBlocks, questionNumberStart: 1, printStyle: 'exam' })
    } catch (error) {
      thrown = error
    }
    assert('MF-1 negative: docx blank count (2) ≠ question count (3) throws', thrown !== null, 'buildDocumentXml did NOT throw')
    assert('MF-1 negative: docx error names draft-numbering-style assertion', /draft-numbering-style/.test(thrown && thrown.message ? thrown.message : ''), thrown && thrown.message ? thrown.message.slice(0, 120) : '')
  }

  console.log(`\nH5-G docx-renderer verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
