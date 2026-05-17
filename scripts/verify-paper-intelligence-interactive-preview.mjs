#!/usr/bin/env node
/**
 * verify-paper-intelligence-interactive-preview
 *
 * Static + functional checks for the V1 interactive Paper Intelligence
 * preview. Three themes:
 *
 *   1. Architecture lock-ins
 *      - Route param surface unchanged: `?view=paper-intelligence&paperId=...`.
 *      - Component does NOT hand-roll a quote matcher or import
 *        reading-analysis.
 *      - Preview model is pure (no React / DOM / fetch / DB).
 *      - Preview model uses the existing evidence adapter.
 *      - reading-analysis directory is not modified by this branch.
 *      - server / package.json / SQLite are not modified.
 *
 *   2. V1 product rules (reviewer must-fix)
 *      - The right Analysis Panel is the only home for
 *        stem / answer / distractor / synonym / back-stage fields. The
 *        old V0 detail layer (`QuestionsPanel`, `DetailQuestionRow`,
 *        and its CSS classes `.pi-question`, `.pi-question-header`,
 *        `.pi-question-detail`, `.pi-q-stem`, `.pi-q-translation`,
 *        `.pi-q-section`, `.pi-evidence-box`, `.pi-distractor*`) is
 *        gone.
 *      - LoadRow has no `引文 / 收起` toggle and no
 *        `.pi-load-evidence-toggle` / `.pi-load-evidence-list` CSS.
 *      - Key chunks render as a `重要词块 · N 个` summary line — the
 *        full tag list (`.pi-chunk-list` / `.pi-chunk-tag` /
 *        `.pi-chunk-surface` / `.pi-chunk-meta`) is removed.
 *      - The right panel carries an `aria-live="polite"` annotation
 *        for screen-reader updates when the active question changes.
 *      - Trap highlight uses a dim coral wash (opacity ≤ 0.10) — no
 *        full-fluorescent red block.
 *      - Dead `.pi-content` block is removed.
 *
 *   3. Runtime contract
 *      - `buildPreviewView(report, bodies, activeQuestionId)` builds a
 *        view with 4 passages and 15 questions for the bundled fixture.
 *      - With no active question, no highlight segments are produced.
 *      - With an active question, that question's passage carries at
 *        least one support and at least one trap highlight.
 *      - Question id format is `${paperSection}-${questionNo}` and
 *        round-trips through `parseQuestionId`.
 *      - Overlap arbitration: support beats trap. Verified with three
 *        synthetic edge cases.
 *      - DOM anchor attribute strings appear in the component source.
 *      - Highlight CSS classes appear in the stylesheet.
 *      - Right panel copy text appears in the component source.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import {
  buildPreviewView,
  buildQuestionId,
  parseQuestionId,
  buildPassageSegments,
} from '../app/src/features/paper-intelligence/preview/paperIntelligencePreviewModel.ts'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
function assert(name, cond, detail) {
  if (cond) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

/* ─── 1. files exist ─────────────────────────────────────────────── */

const COMPONENT = 'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx'
const MODEL = 'app/src/features/paper-intelligence/preview/paperIntelligencePreviewModel.ts'
const CSS = 'app/src/features/paper-intelligence/paperIntelligence.css'
const ROUTE = 'app/src/features/paper-intelligence/paperIntelligenceRoute.ts'

assert('component file exists', existsSync(path.join(ROOT, COMPONENT)))
assert('preview model file exists', existsSync(path.join(ROOT, MODEL)))
assert('stylesheet exists', existsSync(path.join(ROOT, CSS)))
assert('route parser exists', existsSync(path.join(ROOT, ROUTE)))

const componentSrc = readSrc(COMPONENT)
const modelSrc = readSrc(MODEL)
const cssSrc = readSrc(CSS)
const routeSrc = readSrc(ROUTE)

/**
 * Some assertions look for forbidden patterns in the *executable* code,
 * not in JSDoc/leading comments. Doc comments often legitimately mention
 * the patterns we forbid (e.g. "this component never calls
 * passageBody.includes(...)"). We strip block + line comments before
 * those scans to keep the asserts honest.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}
const componentSrcCode = stripComments(componentSrc)
const cssSrcCode = stripComments(cssSrc)

/* ─── 2. route surface unchanged ─────────────────────────────────── */

assert(
  'route still parses ?view=paper-intelligence',
  /'paper-intelligence'/.test(routeSrc) &&
    /export function parsePaperIntelligenceRoute/.test(routeSrc),
)
assert(
  'route still reads paperId param',
  /paperId/.test(routeSrc),
)

/* ─── 3. component does not hand-roll quote matching ──────────────── */

assert(
  'component does not call passageBody.includes / passageBody.indexOf',
  !/passageBody\.includes\(|passageBody\.indexOf\(/.test(componentSrcCode),
)
assert(
  'component does not import reading-analysis',
  !/features\/reading-analysis/.test(componentSrcCode),
)
assert(
  'component does not import server / api / sqlite',
  !/server\/api|sqlite|better-sqlite|question-bank\.sqlite/i.test(componentSrcCode),
)
assert(
  'component does not import LinkOverlay (V2 only)',
  !/LinkOverlay/.test(componentSrcCode),
)

/* ─── 4. preview model is pure ────────────────────────────────────── */

assert(
  'preview model: no React import',
  !/from ['"]react['"]|from ['"]react\//.test(modelSrc),
)
assert(
  'preview model: no DOM / window / document references',
  !/\bwindow\.|\bdocument\.|HTMLElement|getBoundingClientRect/.test(modelSrc),
)
assert(
  'preview model: no fetch / XHR / network',
  !/\bfetch\(|XMLHttpRequest|axios|\bnode-fetch\b/.test(modelSrc),
)
assert(
  'preview model: no SQLite / DB',
  !/sqlite|better-sqlite|question-bank\.sqlite/i.test(modelSrc),
)
assert(
  'preview model: no Playwright / browser harness',
  !/from ['"]playwright|from ['"]puppeteer/.test(modelSrc),
)
assert(
  'preview model uses toEvidenceModel from evidence adapter',
  /toEvidenceModel/.test(modelSrc) && /from ['"][^'"]*evidence/.test(modelSrc),
)
assert(
  'preview model exposes buildQuestionId helper',
  /export function buildQuestionId/.test(modelSrc),
)
assert(
  'preview model exposes parseQuestionId helper',
  /export function parseQuestionId/.test(modelSrc),
)
assert(
  'preview model exposes buildPreviewView entry',
  /export function buildPreviewView/.test(modelSrc),
)
assert(
  'preview model exposes buildPassageSegments (testable in isolation)',
  /export function buildPassageSegments/.test(modelSrc),
)

/* ─── 5. existing V0 preview asserts still pass (preserved tokens) ── */

const requiredLoadKeys = [
  'vocabularyChunkLoad',
  'grammarLoad',
  'discourseStructureLoad',
  'topicBackgroundLoad',
  'evidenceFindingLoad',
]
for (const key of requiredLoadKeys) {
  assert(
    `component still references load key "${key}"`,
    componentSrc.includes(key),
  )
}

assert(
  'component still shows "AI 初判，需教研复核" disclaimer',
  componentSrc.includes('AI 初判，需教研复核'),
)

const forbidden = ['权威难度', '最终难度', '预计正确率', 'empiricalDifficulty', 'finalDifficulty']
for (const term of forbidden) {
  assert(
    `component does not contain forbidden term "${term}"`,
    !componentSrc.includes(term),
  )
}

/* ─── 6. component carries V1 active-state plumbing ──────────────── */

assert(
  'component declares activeQuestionId state',
  /activeQuestionId/.test(componentSrc),
)
assert(
  'component does not introduce an activeEvidenceId top-level state',
  !/useState[^)]*activeEvidenceId/.test(componentSrc),
)
assert(
  'component renders right panel empty hint "点击左侧题目查看解析"',
  componentSrc.includes('点击左侧题目查看解析'),
)
assert(
  'right panel uses "正确答案" section header',
  componentSrc.includes('正确答案'),
)
assert(
  'right panel uses "干扰项分析" section header',
  componentSrc.includes('干扰项分析'),
)
assert(
  'right panel uses "同义替换" section header',
  componentSrc.includes('同义替换'),
)

/* ─── 6b. right Analysis Panel has aria-live announcement (V1) ─── */

assert(
  'right Analysis Panel sets aria-live="polite"',
  /aria-live=['"]polite['"]/.test(componentSrcCode),
)
assert(
  'right Analysis Panel sets role="region"',
  /role=['"]region['"]/.test(componentSrcCode),
)

/* ─── 7. DOM anchors are present for V2 ──────────────────────────── */

const requiredAnchors = [
  'data-pi-question-id',
  'data-pi-evidence-id',
  'data-pi-evidence-kind',
  'data-pi-paper-section',
  'data-pi-question-no',
]
for (const a of requiredAnchors) {
  assert(`component DOM anchor "${a}" present`, componentSrc.includes(a))
}

/* ─── 8. CSS contract for highlights / active state ──────────────── */

const requiredCssClasses = [
  '.pi-ev-highlight',
  '.pi-ev-highlight--support',
  '.pi-ev-highlight--trap',
  '.pi-question-card',
  '.pi-question-card--active',
  '.pi-shell',
  '.pi-side',
  '.pi-passage-body',
]
for (const c of requiredCssClasses) {
  assert(`stylesheet defines ${c}`, cssSrc.includes(c))
}

assert(
  'component does not use inline-style background for evidence highlights',
  !/<mark\b[^>]*\bstyle=\{\{[^}]*background/.test(componentSrcCode),
)

/* ─── 8b. trap highlight is dim (no fluorescent wash) ───────────── */

{
  // grab the body of the .pi-ev-highlight--trap rule
  const trapRule = cssSrcCode.match(
    /\.pi-ev-highlight--trap\s*\{([^}]*)\}/,
  )
  assert(
    '.pi-ev-highlight--trap rule is present in stylesheet',
    Boolean(trapRule),
  )
  if (trapRule) {
    const body = trapRule[1]
    const bgMatch = body.match(/background\s*:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/)
    assert(
      '.pi-ev-highlight--trap background uses rgba(...) with alpha ≤ 0.10',
      Boolean(bgMatch) && parseFloat(bgMatch[1]) <= 0.1,
      bgMatch ? `alpha = ${bgMatch[1]}` : 'no rgba background',
    )
    assert(
      '.pi-ev-highlight--trap keeps a dotted (or wavy) underline cue',
      /border-bottom\s*:\s*[^;]*\b(dotted|wavy)\b/.test(body) ||
        /text-decoration\s*:\s*[^;]*\b(dotted|wavy)\b/.test(body),
    )
  }
}

/* ─── 9. V1 should NOT yet draw cross-column dotted lines ────────── */

assert(
  'V1 does not include LinkOverlay / svg path drawing for evidence lines',
  !/<svg[\s\S]*data-link-id|LinkOverlay/.test(componentSrcCode),
)

/* ─── 10. reading-analysis / server / package.json untouched ─────── */

assert(
  'reading-analysis directory still has ReadingAnalysisDemoRoute.tsx',
  existsSync(path.join(ROOT, 'app/src/features/reading-analysis/ReadingAnalysisDemoRoute.tsx')),
)
assert(
  'server/api.mjs still exists',
  existsSync(path.join(ROOT, 'server/api.mjs')),
)
assert(
  'app/package.json still exists',
  existsSync(path.join(ROOT, 'app/package.json')),
)

/* ─── 11. id helpers round-trip ──────────────────────────────────── */

{
  const id = buildQuestionId('A', '21')
  assert('buildQuestionId formats as `${section}-${questionNo}`', id === 'A-21')
  const parsed = parseQuestionId(id)
  assert(
    'parseQuestionId round-trips a well-formed id',
    parsed?.paperSection === 'A' && parsed?.questionNo === '21',
  )
  assert('parseQuestionId returns null for malformed input', parseQuestionId('') === null && parseQuestionId('A') === null && parseQuestionId('A-') === null && parseQuestionId('-21') === null)
}

/* ─── 12. functional run against bundled fixture ─────────────────── */

const REPORT_PATH = path.join(
  ROOT,
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json',
)
const INPUT_PATH = path.join(
  ROOT,
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json',
)
assert('bundled report.json exists', existsSync(REPORT_PATH))
assert('bundled input.json exists', existsSync(INPUT_PATH))

const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'))
const input = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'))

const bodies = {}
for (const p of input?.passages || []) {
  if (p?.paperSection && typeof p.passageBody === 'string') {
    bodies[p.paperSection] = p.passageBody
  }
}

// 12a. inactive view — no segments highlighted
{
  const view = buildPreviewView({ report, bodies, activeQuestionId: null })
  assert('preview view: 4 passages', view.passages.length === 4)
  let totalQuestions = 0
  for (const p of view.passages) totalQuestions += p.questions.length
  assert('preview view: 15 questions total', totalQuestions === 15, `got ${totalQuestions}`)
  assert('preview view: activeAnalysis is null when no question active', view.activeAnalysis === null)

  let highlightCount = 0
  for (const p of view.passages) {
    for (const seg of p.segments) {
      if (seg.kind === 'highlight') highlightCount++
    }
  }
  assert(
    'preview view: zero highlights when no active question',
    highlightCount === 0,
    `got ${highlightCount}`,
  )

  for (const p of view.passages) {
    for (const row of p.questions) {
      assert(
        `question id round-trips for ${p.paperSection} Q${row.questionNo}`,
        row.questionId === buildQuestionId(p.paperSection, row.questionNo),
      )
    }
  }
}

// 12b. active view — Q21 (passage A) should have at least one support
//      highlight and at least one trap highlight
{
  const activeId = buildQuestionId('A', '21')
  const view = buildPreviewView({ report, bodies, activeQuestionId: activeId })
  assert(
    'active view: activeAnalysis is non-null',
    view.activeAnalysis !== null,
  )
  assert(
    'active view: activeAnalysis questionId matches',
    view.activeAnalysis?.questionId === activeId,
  )
  assert(
    'active view: support evidence id ends with -correct',
    view.activeAnalysis?.supportEvidenceId?.endsWith('-correct') === true,
  )

  // find the A passage view
  const a = view.passages.find((p) => p.paperSection === 'A')
  let supportSegs = 0
  let trapSegs = 0
  for (const seg of a?.segments || []) {
    if (seg.kind !== 'highlight') continue
    if (seg.evidenceKind === 'support') supportSegs++
    if (seg.evidenceKind === 'trap') trapSegs++
  }
  assert(
    `active view: passage A has at least 1 support highlight (got ${supportSegs})`,
    supportSegs >= 1,
  )
  assert(
    `active view: passage A has at least 1 trap highlight (got ${trapSegs})`,
    trapSegs >= 1,
  )

  // selected question card flag is set on exactly one row
  let activeRows = 0
  for (const p of view.passages) {
    for (const row of p.questions) if (row.isActive) activeRows++
  }
  assert(
    'active view: exactly one question row has isActive=true',
    activeRows === 1,
    `got ${activeRows}`,
  )

  // text-only distractors: any trap with no quote ends up flagged
  // `quoteIsTextOnly`. Verify we don't mark quoted distractors as text-only.
  const textOnly = view.activeAnalysis?.distractors.filter((d) => d.quoteIsTextOnly) || []
  const withQuote = view.activeAnalysis?.distractors.filter((d) => !d.quoteIsTextOnly) || []
  assert(
    'active view: text-only distractors all have quote === null',
    textOnly.every((d) => d.quote === null),
  )
  assert(
    'active view: non-text-only distractors all have a quote string',
    withQuote.every((d) => typeof d.quote === 'string' && d.quote.length > 0),
  )
}

// 12c. buildPassageSegments unit-style edge cases
{
  // empty body
  const empty = buildPassageSegments({
    passageBody: '',
    activeQuestionId: 'A-21',
    sectionEvidence: undefined,
  })
  assert('buildPassageSegments returns [] when passageBody is empty', empty.length === 0)

  // no evidence view
  const noEv = buildPassageSegments({
    passageBody: 'hello world',
    activeQuestionId: 'A-21',
    sectionEvidence: undefined,
  })
  assert(
    'buildPassageSegments returns single text segment when sectionEvidence is missing',
    noEv.length === 1 && noEv[0].kind === 'text',
  )
}

/* ─── 13. V1 must-fix: old V0 detail layer is gone ──────────────── */

assert(
  'component no longer defines DetailQuestionRow',
  !/function\s+DetailQuestionRow\b/.test(componentSrcCode) &&
    !/<DetailQuestionRow\b/.test(componentSrcCode),
)
assert(
  'component no longer defines QuestionsPanel',
  !/function\s+QuestionsPanel\b/.test(componentSrcCode) &&
    !/<QuestionsPanel\b/.test(componentSrcCode),
)
assert(
  'component no longer renders QuestionDetail (the old expanded body)',
  !/function\s+QuestionDetail\b/.test(componentSrcCode) &&
    !/<QuestionDetail\b/.test(componentSrcCode),
)

const removedDetailCssClasses = [
  '.pi-question ',
  '.pi-question{',
  '.pi-question-header',
  '.pi-question-detail',
  '.pi-q-stem',
  '.pi-q-translation',
  '.pi-q-section',
  '.pi-evidence-box',
  '.pi-distractor',
  '.pi-question-no',
  '.pi-question-backend',
  '.pi-question-expand',
  '.pi-tcard',
  '.pi-review-badge',
  '.pi-quote',
  '.pi-explanation',
  '.pi-synonym',
]
for (const cls of removedDetailCssClasses) {
  assert(
    `stylesheet removes obsolete V0-detail rule ${cls}`,
    !cssSrc.includes(cls),
  )
}

/* ─── 13b. dead .pi-content block is gone ────────────────────────── */

assert(
  'stylesheet removes dead .pi-content rule',
  !/\.pi-content\b/.test(cssSrc),
)

/* ─── 13c. LoadRow no longer has 引文/收起 toggle or evidence list ─ */

assert(
  'component no longer renders "引文" / "收起" toggle for load evidence',
  !/引文/.test(componentSrcCode) && !/收起/.test(componentSrcCode),
)
assert(
  'component no longer references showEvidence local state on LoadRow',
  !/setShowEvidence\b/.test(componentSrcCode) && !/showEvidence\b/.test(componentSrcCode),
)
const removedLoadEvidenceCss = [
  '.pi-load-evidence-toggle',
  '.pi-load-evidence-list',
  '.pi-load-evidence-item',
]
for (const cls of removedLoadEvidenceCss) {
  assert(
    `stylesheet removes load-evidence rule ${cls}`,
    !cssSrc.includes(cls),
  )
}

/* ─── 13d. Key chunks render only as a "重要词块 · N 个" summary ── */

assert(
  'component renders key-chunk summary "重要词块 · ... 个"',
  /重要词块[^"`<]*·[^"`<]*个/.test(componentSrcCode),
)
assert(
  'component no longer maps over keyChunks into individual chunk tags',
  !/chunks\.map\(/.test(componentSrcCode) && !/keyChunks\.map\(/.test(componentSrcCode),
)
const removedChunkTagCss = [
  '.pi-chunk-list',
  '.pi-chunk-tag',
  '.pi-chunk-surface',
  '.pi-chunk-meta',
]
for (const cls of removedChunkTagCss) {
  assert(
    `stylesheet removes per-chunk tag rule ${cls}`,
    !cssSrc.includes(cls),
  )
}

/* ─── 14. V1 must-fix: support priority in overlap arbitration ──── */

/**
 * Helper: build a synthetic PassageEvidenceView with a controlled set
 * of evidence items. The adapter normally builds these; here we hand-
 * craft them so we can exercise overlap edge cases that the bundled
 * fixture cannot reach.
 */
function makeSectionEvidence(items) {
  return {
    paperSection: 'X',
    passageTitle: null,
    passageBody: null,
    evidenceItems: items,
    questions: [],
  }
}
function supportItem(id, quote) {
  return {
    id: `${id}-correct`,
    paperSection: 'X',
    questionNo: '1',
    optionLabel: 'A',
    evidenceKind: 'support',
    questionAnswer: 'A',
    quote,
    explanationZh: '',
    distractorCategory: null,
    distractorSubtype: null,
  }
}
function trapItem(id, label, quote) {
  return {
    id: `${id}-distractor-${label}`,
    paperSection: 'X',
    questionNo: '1',
    optionLabel: label,
    evidenceKind: 'trap',
    questionAnswer: 'A',
    quote,
    explanationZh: '',
    distractorCategory: 'detail_word_misleading',
    distractorSubtype: null,
  }
}

// 14a. support quote is a strict substring of a trap quote: support
//      must be highlighted, trap must be dropped (no overlap allowed).
{
  const passageBody = 'The widely accepted theory predicts a universal pattern.'
  const ev = makeSectionEvidence([
    // adapter order = support, then traps by label ASC; we mimic that
    supportItem('X-1', 'accepted theory'),
    trapItem('X-1', 'B', 'widely accepted theory predicts'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const highlights = segs.filter((s) => s.kind === 'highlight')
  const supportHighlights = highlights.filter((s) => s.evidenceKind === 'support')
  const trapHighlights = highlights.filter((s) => s.evidenceKind === 'trap')
  assert(
    '14a: support survives when trap quote is a superstring of support quote',
    supportHighlights.length === 1 && supportHighlights[0].text === 'accepted theory',
  )
  assert(
    '14a: trap is dropped (does not cover support) when fully overlapping support',
    trapHighlights.length === 0,
    `got trap highlights: ${JSON.stringify(trapHighlights.map((t) => t.text))}`,
  )
}

// 14b. trap and support occupy the exact same span: support wins.
{
  const passageBody = 'The fragile balance shifts every season.'
  const ev = makeSectionEvidence([
    supportItem('X-1', 'fragile balance'),
    trapItem('X-1', 'C', 'fragile balance'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const highlights = segs.filter((s) => s.kind === 'highlight')
  assert(
    '14b: support wins exact-span tie against trap',
    highlights.length === 1 && highlights[0].evidenceKind === 'support',
  )
}

// 14c. partial overlap: trap starts inside a support span. Support
//      keeps its full span; trap is dropped.
{
  const passageBody = 'Rapid technological change disrupts everything.'
  const ev = makeSectionEvidence([
    supportItem('X-1', 'technological change'),
    trapItem('X-1', 'D', 'change disrupts'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const highlights = segs.filter((s) => s.kind === 'highlight')
  const supportHighlights = highlights.filter((s) => s.evidenceKind === 'support')
  const trapHighlights = highlights.filter((s) => s.evidenceKind === 'trap')
  assert(
    '14c: support keeps full span when trap partially overlaps',
    supportHighlights.length === 1 &&
      supportHighlights[0].text === 'technological change',
  )
  assert(
    '14c: partially-overlapping trap is dropped',
    trapHighlights.length === 0,
    `got trap highlights: ${JSON.stringify(trapHighlights.map((t) => t.text))}`,
  )
}

// 14d. non-overlapping trap still renders alongside support.
{
  const passageBody = 'The first claim is bold; the second claim is cautious.'
  const ev = makeSectionEvidence([
    supportItem('X-1', 'first claim'),
    trapItem('X-1', 'B', 'second claim'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const highlights = segs.filter((s) => s.kind === 'highlight')
  const supportHighlights = highlights.filter((s) => s.evidenceKind === 'support')
  const trapHighlights = highlights.filter((s) => s.evidenceKind === 'trap')
  assert(
    '14d: support and non-overlapping trap both render',
    supportHighlights.length === 1 && trapHighlights.length === 1,
    `got ${supportHighlights.length} support and ${trapHighlights.length} trap highlights`,
  )
  // make sure they emit in passage order
  const order = highlights.map((h) => h.evidenceKind)
  assert(
    '14d: highlights emit in left-to-right passage order',
    order[0] === 'support' && order[1] === 'trap',
  )
}

// 14e. trap appears only as a superstring of support — that single
//      occurrence is dropped, and there is no other occurrence.
{
  const passageBody = 'The widely accepted theory predicts a universal pattern.'
  const ev = makeSectionEvidence([
    supportItem('X-1', 'accepted theory'),
    trapItem('X-1', 'B', 'widely accepted theory'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const trapHighlights = segs.filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'trap',
  )
  assert(
    '14e: when trap exists only as a superstring of support, trap is fully dropped',
    trapHighlights.length === 0,
  )
}

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
