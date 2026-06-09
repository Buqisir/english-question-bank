#!/usr/bin/env node
/**
 * verify-h5f-legacy-import-impl.mjs
 *
 * H5-F extraction guard for server/imports/legacyImportImplementation.mjs (the deterministic
 * legacy DOCX import-draft / answer-alignment pipeline — ~78 functions, ZERO AI calls — moved out
 * of server/api.mjs).
 *
 * HERMETIC: no `git show main:...`, no network, no AI. Stubs openDatabase to return canned rows and
 * drives the 8 PUBLIC seam fns:
 *  - generateImportBundleDraft (async) over a FIXED healthy reading split (extracted_text fixture)
 *    asserting the persisted draft JSON is byte-identical to a frozen golden (minus the
 *    non-deterministic generatedAt) + the import-splitter.md healthy shape (warningBundles=0
 *    excluding the no-answer-file note, noOptGroups=0 for the reading group).
 *  - generateAnswerAlignmentDraft over a FIXED answer-file + formal-group fixture asserting the
 *    alignment JSON byte-identical to a frozen golden (minus generatedAt).
 *  - applyAnswerAlignment asserting the shouldUpdateExplanation=false rule (updatedExplanationCount
 *    stays 0 under both overwrite=false and overwrite=true) and that the UPDATE writes
 *    currentExplanation (never a proposed explanation).
 *  - the parseCompactAnswerEntries questionNo===57 hack: a 语法填空 answer starting at 57 back-fills
 *    question 56 (surfaces as proposedAnswer on question 56 in the alignment).
 *
 * Plus structural guards:
 *  - the factory returns EXACTLY the 8 seam fns; the ~70 helpers are NOT exported (file-private).
 *  - the module does NOT import from ../api.mjs (no cycle).
 *  - used-but-undefined guard: dropping each injected dep makes a driven seam fn throw.
 *  - the contract-sensitive literals (questionNo === 57 hack, shouldUpdateExplanation = false) are
 *    present byte-identically in the module source.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createLegacyImportImplementation,
} from '../server/imports/legacyImportImplementation.mjs'
import * as moduleNamespace from '../server/imports/legacyImportImplementation.mjs'

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
// Pure dep clones mirroring api.mjs semantics, kept hermetic + self-contained. These are the
// STAY-in-api.mjs helpers injected back into the factory (byte-equivalent to api.mjs source).
// ------------------------------------------------------------------
function optionalString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}
function requiredString(value, label) {
  const s = optionalString(value)
  if (!s) throw new Error(`Missing ${label}`)
  return s
}
function requiredEnum(value, allowed, label) {
  const s = optionalString(value)
  if (!allowed.includes(s)) throw new Error(`Bad ${label}`)
  return s
}
function normalizeDraftText(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/<\/?w:[^>]*>/g, '')
    .replace(/ /g, ' ')
    .replace(/[\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
function cleanDraftText(text) {
  return normalizeDraftText(text).replace(/[^\S　]+\n/g, '\n').replace(/\n[^\S　]+/g, '\n').trim()
}
function normalizeAnswerValue(value) {
  return cleanDraftText(value)
    .replace(/^[：:，,。．.\s]+/, '')
    .replace(/[。．.\s]+$/, '')
    .trim()
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
// Stub openDatabase factory: dispatches by SQL substring to canned rows.
// ------------------------------------------------------------------
function makeStubDb({ fileRows = [], answerFiles = [], formalRows = [], bundleTitleRow = null, updates = null } = {}) {
  return () => ({
    prepare(sql) {
      return {
        all() {
          if (sql.includes('FROM question_groups')) return formalRows
          // Both getParsedImportFilesForBundle (draft) and getParsedAnswerFilesForBundle (alignment)
          // SELECT ... FROM import_files f JOIN import_file_texts t. The fixture supplies whichever rows
          // the driven path expects (fileRows for the draft, answerFiles for the alignment path).
          if (sql.includes('FROM import_files f')) return answerFiles.length > 0 ? answerFiles : fileRows
          return fileRows
        },
        get() {
          if (sql.includes('SELECT bundle_title')) return bundleTitleRow
          return null
        },
        run(...args) {
          if (updates) updates.push(args)
        },
      }
    },
    exec() {},
    close() {},
  })
}

function makeImpl(openDatabase, overrides = {}) {
  return createLegacyImportImplementation({
    openDatabase,
    rootDir: '/tmp',
    importDir: '/tmp/imports',
    timestampPrefix: () => '20240101-000000',
    requiredString,
    optionalString,
    requiredEnum,
    cleanDraftText,
    normalizeAnswerValue,
    normalizeExamTitle: (v) => String(v || ''),
    extractDeclaredExamTitleFromText: () => '',
    normalizeDraftText,
    groupTypeLabels,
    inferImportFileType: () => 'docx',
    sanitizeFileName: (n) => n,
    getImportBatch: () => null,
    updateImportBatchStats: () => {},
    rowToImportFile: (r) => r,
    rowToImportFileParse: (r) => r,
    ...overrides,
  })
}

// ------------------------------------------------------------------
// Fixtures.
// ------------------------------------------------------------------
const READING_TEXT = [
  '阅读理解 A',
  '1.(15分)',
  'It was a cold winter morning when Tom decided to help.',
  '(21) What did Tom decide to do?',
  'A. Help others',
  'B. Stay home',
  'C. Go shopping',
  'D. Sleep more',
  '【答案】A',
  '(22) When did the story happen?',
  'A. In summer',
  'B. In winter',
  'C. In spring',
  'D. In autumn',
  '【答案】B',
].join('\n')

const READING_FILE_ROWS = [
  {
    id: 'f1',
    original_name: '2024卷.docx',
    content_role: 'question',
    bundle_id: 'b1',
    bundle_title: '2024年测试卷',
    created_at: '2024-01-01',
    parser: 'pandoc',
    extracted_text: READING_TEXT,
    line_count: 20,
    char_count: 300,
  },
]

const EXPECTED_DRAFT = {
  id: 'draft-b1',
  bundleId: 'b1',
  title: '2024年测试卷',
  source: { sourceType: 'real_exam', year: 2024, region: '测试', paperName: '2024年测试卷' },
  sourceFiles: [
    { id: 'f1', originalName: '2024卷.docx', contentRole: 'question', parser: 'pandoc', lineCount: 20, charCount: 300 },
  ],
  answerFiles: [],
  answerMatchedQuestionCount: 0,
  groupCount: 1,
  questionCount: 2,
  warnings: ['当前资料组缺少解析文件，草稿暂不含答案和解析。'],
  groups: [
    {
      id: 'draft-1',
      sourceItemNo: '1',
      sectionTitle: '阅读理解 A',
      groupType: 'reading',
      title: '2024年测试卷 阅读理解 A',
      instruction: '阅读理解 A',
      materialText: 'It was a cold winter morning when Tom decided to help.',
      questionCount: 2,
      totalScore: 15,
      confidence: 0.86,
      warnings: [],
      questions: [
        {
          questionNo: '21',
          questionType: '阅读选择',
          stem: 'What did Tom decide to do?',
          answer: 'A',
          explanation: '',
          score: 7.5,
          options: [
            { label: 'A', content: 'Help others' },
            { label: 'B', content: 'Stay home' },
            { label: 'C', content: 'Go shopping' },
            { label: 'D', content: 'Sleep more' },
          ],
          rawText: 'What did Tom decide to do?\nA. Help others\nB. Stay home\nC. Go shopping\nD. Sleep more\n【答案】A',
          confidence: 0.86,
        },
        {
          questionNo: '22',
          questionType: '阅读选择',
          stem: 'When did the story happen?',
          answer: 'B',
          explanation: '',
          score: 7.5,
          options: [
            { label: 'A', content: 'In summer' },
            { label: 'B', content: 'In winter' },
            { label: 'C', content: 'In spring' },
            { label: 'D', content: 'In autumn' },
          ],
          rawText: 'When did the story happen?\nA. In summer\nB. In winter\nC. In spring\nD. In autumn\n【答案】B',
          confidence: 0.86,
        },
      ],
    },
  ],
}

// Answer-alignment fixture.
const ANSWER_TEXT = ['1.阅读理解', '(21) A 因为汤姆决定帮助别人。', '(22) C 故事发生在冬天的早晨。'].join('\n')
const ANSWER_FILES = [
  {
    id: 'a1',
    original_name: '答案.docx',
    content_role: 'answer_analysis',
    bundle_id: 'b1',
    bundle_title: '2024年测试卷',
    created_at: '2024-01-01',
    parser: 'pandoc',
    extracted_text: ANSWER_TEXT,
    line_count: 5,
    char_count: 50,
  },
]
const FORMAL_ROWS = [
  { group_id: 'g1', title: '2024年测试卷 阅读理解 A', group_type: 'reading', default_score: 15, paper_name: '2024年测试卷', region: '测试', question_id: 'q21', question_no: '21', stem: 'Q21', answer: '', explanation: '', display_order: 1 },
  { group_id: 'g1', title: '2024年测试卷 阅读理解 A', group_type: 'reading', default_score: 15, paper_name: '2024年测试卷', region: '测试', question_id: 'q22', question_no: '22', stem: 'Q22', answer: 'B', explanation: 'old expl', display_order: 2 },
]
const EXPECTED_ALIGNMENT = {
  id: 'answer-align-b1',
  bundleId: 'b1',
  title: '2024年测试卷',
  sourceFiles: [
    { id: 'a1', originalName: '答案.docx', contentRole: 'answer_analysis', parser: 'pandoc', lineCount: 5, charCount: 50 },
  ],
  targetGroupCount: 1,
  matchedGroupCount: 1,
  matchedQuestionCount: 2,
  warnings: ['答案.docx 未识别到“A篇/B篇/C篇/D篇”式阅读解析边界。'],
  groups: [
    {
      id: 'answer-align-g1',
      questionGroupId: 'g1',
      title: '2024年测试卷 阅读理解 A',
      sourceItemNo: 'A',
      groupType: 'reading',
      questionCount: 2,
      matchedCount: 2,
      confidence: 1,
      warnings: ['1 道小题的解析答案与题库现有答案不一致，写回前需人工核对。'],
      matches: [
        { questionId: 'q21', questionNo: '21', stem: 'Q21', currentAnswer: '', currentExplanation: '', proposedAnswer: 'A', proposedExplanation: '', rawText: '(21) A 因为汤姆决定帮助别人。', confidence: 0.78, answerDiffers: false, status: 'matched' },
        { questionId: 'q22', questionNo: '22', stem: 'Q22', currentAnswer: 'B', currentExplanation: 'old expl', proposedAnswer: 'C', proposedExplanation: '', rawText: '(22) C 故事发生在冬天的早晨。', confidence: 0.78, answerDiffers: true, status: 'matched' },
      ],
    },
  ],
}

// questionNo===57 hack fixture.
const GRAMMAR_ANSWER_TEXT = ['语法填空', 'was', '57. were', '58. is'].join('\n')
const GRAMMAR_ANSWER_FILES = [
  { id: 'a1', original_name: '答案.docx', content_role: 'answer_analysis', bundle_id: 'b1', bundle_title: '卷', created_at: '2024-01-01', parser: 'pandoc', extracted_text: GRAMMAR_ANSWER_TEXT, line_count: 4, char_count: 30 },
]
const GRAMMAR_FORMAL_ROWS = [
  { group_id: 'g1', title: '卷 语法填空', group_type: 'grammar_cloze', default_score: 15, paper_name: '卷', region: '', question_id: 'q56', question_no: '56', stem: '', answer: '', explanation: '', display_order: 1 },
  { group_id: 'g1', title: '卷 语法填空', group_type: 'grammar_cloze', default_score: 15, paper_name: '卷', region: '', question_id: 'q57', question_no: '57', stem: '', answer: '', explanation: '', display_order: 2 },
  { group_id: 'g1', title: '卷 语法填空', group_type: 'grammar_cloze', default_score: 15, paper_name: '卷', region: '', question_id: 'q58', question_no: '58', stem: '', answer: '', explanation: '', display_order: 3 },
]

// ============================================================
// Checks
// ============================================================
function assertExportSurface() {
  const SEAMS = [
    'generateImportBundleDraft',
    'generateAnswerAlignmentDraft',
    'applyAnswerAlignment',
    'createImportFile',
    'runImportBatch',
    'getImportFileParse',
    'parseImportFile',
    'deleteImportFile',
  ]
  const namedExports = Object.keys(moduleNamespace).sort()
  assertEqualJson('module exports exactly the factory', namedExports, ['createLegacyImportImplementation'])

  const impl = makeImpl(makeStubDb())
  const keys = Object.keys(impl).sort()
  assertEqualJson('factory returns exactly the 8 seam fns', keys, [...SEAMS].sort())

  // file-private helpers must NOT be exported from the module nor returned by the factory.
  for (const helper of ['normalizeDraftText', 'findSectionHeadings', 'parseCompactAnswerEntries', 'buildDraftGroup', 'extractDocxText', 'createImportFileFromLocalPath', 'buildStructuredAnswerEntryIndex']) {
    assert(`helper ${helper} is NOT exported (file-private)`, !(helper in moduleNamespace) && !(helper in impl))
  }
}

async function assertHealthyDraft() {
  const impl = makeImpl(makeStubDb({ fileRows: READING_FILE_ROWS }))
  const draft = await impl.generateImportBundleDraft('b1')
  assert('generateImportBundleDraft returned a draft', Boolean(draft))
  const { generatedAt, ...rest } = draft
  assert('generatedAt is an ISO string (non-deterministic, excluded from golden)', typeof generatedAt === 'string' && generatedAt.includes('T'))
  assertEqualJson('draft JSON byte-identical to frozen golden (move-equivalence)', rest, EXPECTED_DRAFT)

  // import-splitter.md healthy shape: warningBundles=0 (excluding the no-answer-file note) and
  // noOptGroups=0 for the reading objective group.
  const structuralWarnings = draft.warnings.filter((w) => w !== '当前资料组缺少解析文件，草稿暂不含答案和解析。')
  assert('healthy split: warningBundles=0 (excluding no-answer-file note)', structuralWarnings.length === 0, JSON.stringify(structuralWarnings))
  const readingGroup = draft.groups.find((g) => g.groupType === 'reading')
  assert('healthy split: reading group has questions', readingGroup.questions.length === 2)
  assert('healthy split: noOptGroups=0 (every reading question has options)', readingGroup.questions.every((q) => q.options.length > 0))
  assert('healthy split: groupCount=1', draft.groupCount === 1)

  // null path: no files -> null draft.
  const emptyImpl = makeImpl(makeStubDb({ fileRows: [] }))
  const nullDraft = await emptyImpl.generateImportBundleDraft('missing')
  assert('generateImportBundleDraft returns null when no parsed files', nullDraft === null)
}

function assertAnswerAlignment() {
  const impl = makeImpl(makeStubDb({
    fileRows: ANSWER_FILES,
    answerFiles: ANSWER_FILES,
    formalRows: FORMAL_ROWS,
    bundleTitleRow: { bundle_title: '2024年测试卷', original_name: '答案.docx' },
  }))
  const alignment = impl.generateAnswerAlignmentDraft('b1')
  assert('generateAnswerAlignmentDraft returned an alignment', Boolean(alignment))
  const { generatedAt, ...rest } = alignment
  assertEqualJson('alignment JSON byte-identical to frozen golden (move-equivalence)', rest, EXPECTED_ALIGNMENT)
  assert('alignment flags the differing answer (q22: C vs B)', alignment.groups[0].matches[1].answerDiffers === true)
}

function assertApplyShouldUpdateExplanationFalse() {
  // overwrite=false: q21 (empty answer) filled with proposed 'A'; q22 (existing 'B') skipped.
  const updatesA = []
  const implA = makeImpl(makeStubDb({
    fileRows: ANSWER_FILES,
    answerFiles: ANSWER_FILES,
    formalRows: FORMAL_ROWS,
    bundleTitleRow: { bundle_title: '2024年测试卷', original_name: '答案.docx' },
    updates: updatesA,
  }))
  const resA = implA.applyAnswerAlignment('b1', { overwrite: false })
  assertEqualJson('applyAnswerAlignment overwrite=false result', resA, {
    bundleId: 'b1',
    questionGroupId: '',
    overwrite: false,
    targetGroupCount: 1,
    matchedQuestionCount: 2,
    updatedQuestionCount: 1,
    updatedAnswerCount: 1,
    updatedExplanationCount: 0,
    skippedExistingCount: 1,
    missingQuestionCount: 0,
  })
  assert('shouldUpdateExplanation=false: updatedExplanationCount stays 0 (overwrite=false)', resA.updatedExplanationCount === 0)
  // The UPDATE writes currentExplanation ('' for q21), NEVER a proposed explanation.
  assertEqualJson('UPDATE writes [proposedAnswer, currentExplanation, questionId] for q21', updatesA, [['A', '', 'q21']])

  // overwrite=true: both updated; q22 answer overwritten to 'C' but explanation stays 'old expl'.
  const updatesB = []
  const implB = makeImpl(makeStubDb({
    fileRows: ANSWER_FILES,
    answerFiles: ANSWER_FILES,
    formalRows: FORMAL_ROWS,
    bundleTitleRow: { bundle_title: '2024年测试卷', original_name: '答案.docx' },
    updates: updatesB,
  }))
  const resB = implB.applyAnswerAlignment('b1', { overwrite: true })
  assert('shouldUpdateExplanation=false: updatedExplanationCount stays 0 (overwrite=true)', resB.updatedExplanationCount === 0)
  assert('overwrite=true updates both questions', resB.updatedQuestionCount === 2 && resB.updatedAnswerCount === 2)
  assertEqualJson('overwrite=true UPDATE preserves currentExplanation for q22', updatesB, [
    ['A', '', 'q21'],
    ['C', 'old expl', 'q22'],
  ])
}

function assertQuestionNo57Hack() {
  const impl = makeImpl(makeStubDb({
    fileRows: GRAMMAR_ANSWER_FILES,
    answerFiles: GRAMMAR_ANSWER_FILES,
    formalRows: GRAMMAR_FORMAL_ROWS,
    bundleTitleRow: { bundle_title: '卷', original_name: '答案.docx' },
  }))
  const alignment = impl.generateAnswerAlignmentDraft('b1')
  const matches = alignment.groups[0].matches.map((m) => ({ questionNo: m.questionNo, proposedAnswer: m.proposedAnswer, status: m.status }))
  // The questionNo===57 hack back-fills question 56 from the text before the 57. marker ('was').
  assertEqualJson('questionNo===57 hack back-fills question 56 (proposedAnswer "was")', matches, [
    { questionNo: '56', proposedAnswer: 'was', status: 'matched' },
    { questionNo: '57', proposedAnswer: 'were', status: 'matched' },
    { questionNo: '58', proposedAnswer: 'is', status: 'matched' },
  ])
}

async function assertUsedButUndefinedRejects() {
  const baseDeps = {
    openDatabase: makeStubDb({ fileRows: READING_FILE_ROWS }),
    rootDir: '/tmp',
    importDir: '/tmp/imports',
    timestampPrefix: () => 'x',
    requiredString,
    optionalString,
    requiredEnum,
    cleanDraftText,
    normalizeAnswerValue,
    normalizeExamTitle: (v) => String(v || ''),
    extractDeclaredExamTitleFromText: () => '',
    normalizeDraftText,
    groupTypeLabels,
    inferImportFileType: () => 'docx',
    sanitizeFileName: (n) => n,
    getImportBatch: () => null,
    updateImportBatchStats: () => {},
    rowToImportFile: (r) => r,
    rowToImportFileParse: (r) => r,
  }
  for (const drop of ['openDatabase', 'normalizeDraftText']) {
    const deps = { ...baseDeps }
    delete deps[drop]
    const impl = createLegacyImportImplementation(deps)
    let threw = false
    try {
      await impl.generateImportBundleDraft('b1')
    } catch {
      threw = true
    }
    assert(`used-but-undefined guard: dropping ${drop} makes generateImportBundleDraft throw`, threw)
  }
  // cleanDraftText (a STAY dep) is used pervasively by the moved splitter; dropping it throws.
  const depsNoClean = { ...baseDeps }
  delete depsNoClean.cleanDraftText
  const implNoClean = createLegacyImportImplementation(depsNoClean)
  let threwClean = false
  try {
    await implNoClean.generateImportBundleDraft('b1')
  } catch {
    threwClean = true
  }
  assert('used-but-undefined guard: dropping cleanDraftText makes generateImportBundleDraft throw', threwClean)
}

function assertSourceGuards() {
  const src = readFileSync(path.join(repoRoot, 'server/imports/legacyImportImplementation.mjs'), 'utf8')
  assert('module does NOT import from api.mjs (no cycle)', !/from\s+['"][^'"]*\bapi\.mjs['"]/.test(src))
  assert('module imports randomUUID from node:crypto directly', /import\s+\{\s*randomUUID\s*\}\s+from\s+'node:crypto'/.test(src))
  // Contract-sensitive literals preserved byte-identically.
  assert('questionNo === 57 hack literal present', src.includes('if (firstGrammarMarker?.questionNo === 57) {') && src.includes('pushGrammarEntry(56, grammarText.slice(0, firstGrammarMarker.start))'))
  assert('shouldUpdateExplanation = false literal present', src.includes('const shouldUpdateExplanation = false'))
  // The parseCompactAnswerEntries grammar-marker block stays at module indent 0 (function decl at col 0).
  assert('moved functions live at module indent 0 (no factory re-indent)', /\nfunction parseCompactAnswerEntries\(text\) \{/.test(src) && /\nasync function generateImportBundleDraft\(bundleId\) \{/.test(src))
}

function assertApiIntegration() {
  const apiSrc = readFileSync(path.join(repoRoot, 'server/api.mjs'), 'utf8')
  assert('api.mjs imports createLegacyImportImplementation', apiSrc.includes("import { createLegacyImportImplementation } from './imports/legacyImportImplementation.mjs'"))
  assert('api.mjs calls the factory', /const legacyImportImplementation = createLegacyImportImplementation\(\{/.test(apiSrc))
  for (const seam of ['generateImportBundleDraft', 'generateAnswerAlignmentDraft', 'applyAnswerAlignment', 'createImportFile', 'runImportBatch', 'getImportFileParse', 'parseImportFile', 'deleteImportFile']) {
    assert(`api.mjs destructures ${seam}Impl from the factory`, apiSrc.includes(`${seam}: ${seam}Impl`))
  }
  // The async-ness of the generateImportBundleDraft wrapper must be preserved.
  assert('generateImportBundleDraft wrapper stays async', /async function generateImportBundleDraft\(bundleId\) \{\n\s*return generateImportBundleDraftImpl\(bundleId\)/.test(apiSrc))
  assert('applyAnswerAlignment wrapper is sync with (bundleId, input = {})', /\nfunction applyAnswerAlignment\(bundleId, input = \{\}\) \{\n\s*return applyAnswerAlignmentImpl\(bundleId, input\)/.test(apiSrc))
  // The heavy moved bodies are gone from api.mjs.
  assert('api.mjs no longer defines findStructuredExamItemBlocks', !/\nfunction findStructuredExamItemBlocks\(/.test(apiSrc))
  assert('api.mjs no longer defines parseCompactAnswerEntries', !/\nfunction parseCompactAnswerEntries\(/.test(apiSrc))
  assert('api.mjs no longer defines extractDocxTextWithOoxml', !/\nfunction extractDocxTextWithOoxml\(/.test(apiSrc))
  // STAY helpers remain defined in api.mjs.
  assert('api.mjs still defines cleanDraftText (STAY)', /\nfunction cleanDraftText\(text\) \{/.test(apiSrc))
  assert('api.mjs still defines normalizeDraftText (STAY)', /\nfunction normalizeDraftText\(text\) \{/.test(apiSrc))
  assert('api.mjs still defines inferImportFileType (STAY)', /\nfunction inferImportFileType\(fileName, mimeType = ''\) \{/.test(apiSrc))
  assert('api.mjs still defines sanitizeFileName (STAY)', /\nfunction sanitizeFileName\(fileName\) \{/.test(apiSrc))
}

// ============================================================
// Main
// ============================================================
async function main() {
  assertExportSurface()
  await assertHealthyDraft()
  assertAnswerAlignment()
  assertApplyShouldUpdateExplanationFalse()
  assertQuestionNo57Hack()
  await assertUsedButUndefinedRejects()
  assertSourceGuards()
  assertApiIntegration()

  console.log(`\nH5-F legacy-import-impl verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
