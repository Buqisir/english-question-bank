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

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
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
  passage: passage('Grammar Passage', 'There ____ a book on the desk.'),
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
  passage: passage('Cloze Passage', 'The boy was very ____ that day.'),
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
  passage: passage('Seven Passage', 'Reading is important. ____'),
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
  assert('buildDocumentXml lives at module indent 0', /\nfunction buildDocumentXml\(\{ title, versionType, items, blocks, questionNumberStart, printStyle \}\) \{/.test(src))
  assert('writeDocxPackage lives at module indent 0', /\nfunction writeDocxPackage\(\{ documentXml, outputPath, title \}\) \{/.test(src))
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
  // Hoisted forwarding wrappers preserve the exact signatures.
  assert('buildDocumentXml wrapper preserves signature', /\nfunction buildDocumentXml\(\{ title, versionType, items, blocks, questionNumberStart, printStyle \}\) \{\n\s*return buildDocumentXmlImpl\(\{ title, versionType, items, blocks, questionNumberStart, printStyle \}\)/.test(apiSrc))
  assert('writeDocxPackage wrapper preserves signature', /\nfunction writeDocxPackage\(\{ documentXml, outputPath, title \}\) \{\n\s*return writeDocxPackageImpl\(\{ documentXml, outputPath, title \}\)/.test(apiSrc))
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

    const detail = {
      id: spec.id,
      title: group.title,
      source: '2026 新课标 I',
      groupType: spec.groupType,
      passage: { title: group.passage?.title || '', materialText, summary: materialText },
      questions: [],
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

// ============================================================
// Main
// ============================================================
async function main() {
  assertExportSurface()
  const handoutXml = assertHandoutRenderByteStable()
  assertExamRenderByteStable()
  await assertWriteDocxPackage(handoutXml)
  assertUsedButUndefinedRejects()
  assertSourceGuards()
  assertApiIntegration()
  await assertRealAssetBlankCounts()

  console.log(`\nH5-G docx-renderer verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
