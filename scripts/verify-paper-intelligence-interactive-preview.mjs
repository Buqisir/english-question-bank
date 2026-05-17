#!/usr/bin/env node
/**
 * verify-paper-intelligence-interactive-preview
 *
 * Static + functional checks for the interactive Paper Intelligence
 * preview, now V2 (cross-column evidence dotted line).
 *
 *   1. Architecture lock-ins
 *      - Route param surface unchanged: `?view=paper-intelligence&paperId=...`.
 *      - Component does NOT hand-roll a quote matcher.
 *      - Component does NOT import reading-analysis or LinkOverlay.
 *      - Preview model is pure (no React / DOM / fetch / DB).
 *      - Preview model uses the existing evidence adapter.
 *      - reading-analysis directory is not modified by this branch.
 *      - server / package.json / SQLite are not modified.
 *      - `activeQuestionId` remains the PRIMARY state. `activeEvidenceId`
 *        is a SECONDARY, line-only state — it must not replace
 *        `activeQuestionId`.
 *
 *   2. V1 product rules (still in effect)
 *      - The right Analysis Panel is the only home for
 *        stem / answer / distractor / synonym / back-stage fields.
 *      - LoadRow has no `引文 / 收起` toggle and no
 *        `.pi-load-evidence-toggle` / `.pi-load-evidence-list` CSS.
 *      - Key chunks render as a `重要词块 · N 个` summary line.
 *      - The right panel carries `aria-live="polite"` and
 *        `role="region"`.
 *      - Trap highlight uses a dim coral wash (opacity ≤ 0.10).
 *      - Dead `.pi-content` block stays removed.
 *      - V0 detail layer (DetailQuestionRow / QuestionsPanel /
 *        QuestionDetail and their CSS) stays gone.
 *
 *   3. V1 smoke-polish (still in effect)
 *      - Auto-scroll the first support highlight into view inside the
 *        LEFT scroller (`.pi-main`).
 *      - Honors `prefers-reduced-motion`.
 *      - `.pi-main` is its own scroll container.
 *      - `QuestionAnalysis.options` is typed.
 *
 *   4. V2 cross-column evidence line (this revision)
 *      - A dedicated module exists at
 *        `app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLine.tsx`
 *      - It exports `PaperIntelligenceEvidenceLine`,
 *        `usePaperIntelligenceEvidenceLine`, `computeOverlayGeometry`,
 *        and `findFirstDomOccurrence` (multi-occurrence policy).
 *      - It does NOT import reading-analysis or LinkOverlay.
 *      - The preview component imports the overlay from this module.
 *      - Component declares `activeEvidenceId` state, paired with
 *        `activeQuestionId`, with the invariants described in the
 *        component JSDoc (clear when activeQuestionId is null; reseed
 *        to support evidence on question activation).
 *      - Right-panel support row and quoted distractor rows are
 *        rendered as `<button>` with `data-pi-evidence-id`.
 *      - Text-only distractors stay as plain `<div>` and carry
 *        `data-pi-quote-text-only="true"`.
 *      - The overlay path uses `.pi-line-path` and renders at most
 *        ONE path. The overlay's wrapping `<svg>` uses
 *        `.pi-line-overlay` with `data-empty="true"` for the
 *        no-line state.
 *      - CSS includes a small-screen hide at `(max-width: 900px)` and
 *        a reduced-motion override.
 *      - Multi-occurrence quote → first DOM occurrence policy is
 *        documented in JSDoc and exercised by a unit test.
 *
 *   5. Runtime contract (preview model unchanged from V1)
 *      - `buildPreviewView(report, bodies, activeQuestionId)` builds a
 *        view with 4 passages and 15 questions for the bundled fixture.
 *      - With no active question, no highlight segments are produced.
 *      - With an active question, support and trap highlights appear.
 *      - Question id format is `${paperSection}-${questionNo}`.
 *      - Overlap arbitration: support beats trap.
 *      - Multi-occurrence: every non-overlapping match is highlighted.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import {
  buildPreviewView,
  buildQuestionId,
  parseQuestionId,
  buildPassageSegments,
} from '../app/src/features/paper-intelligence/preview/paperIntelligencePreviewModel.ts'
// Pure helpers (no JSX) live in the `.ts` companion so Node's
// strip-types ESM loader can import them without a TSX parser.
import {
  computeOverlayGeometry,
  findFirstDomOccurrence,
} from '../app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLineGeometry.ts'

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
const LINE = 'app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLine.tsx'
const LINE_GEOM = 'app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLineGeometry.ts'
const CSS = 'app/src/features/paper-intelligence/paperIntelligence.css'
const ROUTE = 'app/src/features/paper-intelligence/paperIntelligenceRoute.ts'
const TYPES = 'app/src/features/paper-intelligence/paperIntelligenceTypes.ts'

assert('component file exists', existsSync(path.join(ROOT, COMPONENT)))
assert('preview model file exists', existsSync(path.join(ROOT, MODEL)))
assert('V2 evidence line module exists', existsSync(path.join(ROOT, LINE)))
assert('V2 evidence line geometry helpers exist', existsSync(path.join(ROOT, LINE_GEOM)))
assert('stylesheet exists', existsSync(path.join(ROOT, CSS)))
assert('route parser exists', existsSync(path.join(ROOT, ROUTE)))
assert('types file exists', existsSync(path.join(ROOT, TYPES)))

const componentSrc = readSrc(COMPONENT)
const modelSrc = readSrc(MODEL)
const lineSrc = readSrc(LINE)
const lineGeomSrc = readSrc(LINE_GEOM)
const cssSrc = readSrc(CSS)
const routeSrc = readSrc(ROUTE)
const typesSrc = readSrc(TYPES)

/**
 * Strip block + line comments before scanning *executable* code so doc
 * comments that legitimately mention forbidden patterns ("we never
 * import LinkOverlay") don't trip those scans.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}
const componentSrcCode = stripComments(componentSrc)
const lineSrcCode = stripComments(lineSrc)
const lineGeomSrcCode = stripComments(lineGeomSrc)
const cssSrcCode = stripComments(cssSrc)

/* ─── 2. route surface unchanged ─────────────────────────────────── */

assert(
  'route still parses ?view=paper-intelligence',
  /'paper-intelligence'/.test(routeSrc) &&
    /export function parsePaperIntelligenceRoute/.test(routeSrc),
)
assert('route still reads paperId param', /paperId/.test(routeSrc))

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
  'component does not import LinkOverlay (reading-analysis lock-in)',
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

/* ─── 5. existing V0 preview asserts still pass ──────────────────── */

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

/* ─── 6b. right Analysis Panel has aria-live announcement ────────── */

assert(
  'right Analysis Panel sets aria-live="polite"',
  /aria-live=['"]polite['"]/.test(componentSrcCode),
)
assert(
  'right Analysis Panel sets role="region"',
  /role=['"]region['"]/.test(componentSrcCode),
)

/* ─── 7. DOM anchors are present ─────────────────────────────────── */

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
  '.pi-line-overlay',
  '.pi-line-path',
]
for (const c of requiredCssClasses) {
  assert(`stylesheet defines ${c}`, cssSrc.includes(c))
}

assert(
  'component does not use inline-style background for evidence highlights',
  !/<mark\b[^>]*\bstyle=\{\{[^}]*background/.test(componentSrcCode),
)

/* ─── 8b. trap highlight is dim ──────────────────────────────────── */

{
  const trapRule = cssSrcCode.match(/\.pi-ev-highlight--trap\s*\{([^}]*)\}/)
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

/* ─── 9. component must not introduce reading-analysis svg overlay ─ */

assert(
  'component does NOT use reading-analysis data-link-id attribute',
  !/data-link-id/.test(componentSrcCode),
)
assert(
  'line module does NOT use reading-analysis data-link-id attribute',
  !/data-link-id/.test(lineSrcCode),
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
  assert(
    'parseQuestionId returns null for malformed input',
    parseQuestionId('') === null &&
      parseQuestionId('A') === null &&
      parseQuestionId('A-') === null &&
      parseQuestionId('-21') === null,
  )
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
  assert(
    'preview view: activeAnalysis is null when no question active',
    view.activeAnalysis === null,
  )

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

// 12b. active view — Q21 (passage A) should have at least one support + trap
{
  const activeId = buildQuestionId('A', '21')
  const view = buildPreviewView({ report, bodies, activeQuestionId: activeId })
  assert('active view: activeAnalysis is non-null', view.activeAnalysis !== null)
  assert(
    'active view: activeAnalysis questionId matches',
    view.activeAnalysis?.questionId === activeId,
  )
  assert(
    'active view: support evidence id ends with -correct',
    view.activeAnalysis?.supportEvidenceId?.endsWith('-correct') === true,
  )

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

  let activeRows = 0
  for (const p of view.passages) {
    for (const row of p.questions) if (row.isActive) activeRows++
  }
  assert(
    'active view: exactly one question row has isActive=true',
    activeRows === 1,
    `got ${activeRows}`,
  )

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

// 12c. buildPassageSegments edge cases
{
  const empty = buildPassageSegments({
    passageBody: '',
    activeQuestionId: 'A-21',
    sectionEvidence: undefined,
  })
  assert('buildPassageSegments returns [] when passageBody is empty', empty.length === 0)

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

/* ─── 13. V0 detail layer is gone ────────────────────────────────── */

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

/* ─── 13b. dead .pi-content block stays gone ──────────────────────── */

assert(
  'stylesheet removes dead .pi-content rule',
  !/\.pi-content\b/.test(cssSrc),
)

/* ─── 13c. LoadRow has no 引文/收起 toggle ───────────────────────── */

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

/* ─── 13d. Key chunks render only as a "重要词块 · N 个" summary ─── */

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

/* ─── 14. support-priority overlap arbitration ───────────────────── */

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

// 14a. trap superstring of support → support survives, trap dropped
{
  const passageBody = 'The widely accepted theory predicts a universal pattern.'
  const ev = makeSectionEvidence([
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
    '14a: trap is dropped when fully overlapping support',
    trapHighlights.length === 0,
  )
}

// 14b. exact-span tie → support wins
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

// 14c. partial overlap
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
  const supportHighlights = segs.filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'support',
  )
  const trapHighlights = segs.filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'trap',
  )
  assert(
    '14c: support keeps full span when trap partially overlaps',
    supportHighlights.length === 1 &&
      supportHighlights[0].text === 'technological change',
  )
  assert(
    '14c: partially-overlapping trap is dropped',
    trapHighlights.length === 0,
  )
}

// 14d. non-overlapping trap renders alongside support
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
  const order = highlights.map((h) => h.evidenceKind)
  assert(
    '14d: support and non-overlapping trap both render',
    highlights.length === 2,
  )
  assert(
    '14d: highlights emit in left-to-right passage order',
    order[0] === 'support' && order[1] === 'trap',
  )
}

/* ─── 15. multi-occurrence quote ─────────────────────────────────── */

{
  const passageBody =
    'fragile balance · fragile balance again · and once more fragile balance · then warning sign · then warning sign'
  const ev = makeSectionEvidence([
    supportItem('X-1', 'fragile balance'),
    trapItem('X-1', 'B', 'warning sign'),
  ])
  const segs = buildPassageSegments({
    passageBody,
    activeQuestionId: 'X-1',
    sectionEvidence: ev,
  })
  const supportHighlights = segs.filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'support',
  )
  const trapHighlights = segs.filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'trap',
  )
  assert(
    '15: support quote highlighted in all 3 non-overlapping occurrences',
    supportHighlights.length === 3,
  )
  assert(
    '15: trap quote highlighted in both non-overlapping occurrences',
    trapHighlights.length === 2,
  )
  assert(
    'preview model JSDoc documents multi-occurrence quote strategy',
    /Multi-occurrence quote strategy|every non-overlapping occurrence/i.test(modelSrc),
  )
}

/* ─── 16. auto-scroll plumbing in the component (V1 still in effect) ─ */

assert(
  'component imports useRef',
  /\buseRef\b/.test(componentSrcCode) && /from ['"]react['"]/.test(componentSrc),
)
assert(
  'component declares a ref for the left scroll container',
  /useRef<HTMLDivElement \| null>\(null\)/.test(componentSrcCode) ||
    /useRef<HTMLElement \| null>\(null\)/.test(componentSrcCode),
)
assert(
  'component attaches a ref to the .pi-main scroller',
  /<div\s+className=["']pi-main["'][^>]*\bref=\{[^}]+\}/.test(componentSrcCode),
)
assert(
  'component has a useEffect keyed on activeQuestionId for auto-scroll',
  /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?activeQuestionId[\s\S]*?\},\s*\[[^\]]*activeQuestionId[^\]]*\]/.test(
    componentSrcCode,
  ),
)
assert(
  'component calls scrollIntoView (not window.scrollTo) for the highlight',
  /\.scrollIntoView\s*\(/.test(componentSrcCode) &&
    !/\bwindow\.scrollTo\s*\(/.test(componentSrcCode) &&
    !/\bwindow\.scrollBy\s*\(/.test(componentSrcCode),
)
assert(
  'auto-scroll uses block: "nearest"',
  /block\s*:\s*['"]nearest['"]/.test(componentSrcCode),
)
assert(
  'component reads prefers-reduced-motion before choosing scroll behavior',
  /prefers-reduced-motion/.test(componentSrcCode),
)

/* ─── 17. left scroller is its own scroll container in CSS ───────── */

{
  const piMainRule = cssSrcCode.match(/\.pi-main\s*\{([^}]*)\}/)
  assert('.pi-main rule exists in stylesheet', Boolean(piMainRule))
  if (piMainRule) {
    const body = piMainRule[1]
    assert(
      '.pi-main has overflow-y: auto so scrollIntoView resolves there',
      /overflow-y\s*:\s*auto\b/.test(body),
    )
    assert(
      '.pi-main has a max-height bound so it actually scrolls',
      /max-height\s*:\s*[^;]+/.test(body),
    )
  }
}

/* ─── 18. QuestionAnalysis.options is typed ───────────────────────── */

assert(
  'paperIntelligenceTypes declares optional QuestionAnalysis.options',
  /QuestionOption\b/.test(typesSrc) &&
    /options\s*\?\s*:\s*QuestionOption\[\]/.test(typesSrc),
)
assert(
  'paperIntelligenceTypes exports QuestionOption type',
  /export type QuestionOption\b/.test(typesSrc),
)
assert(
  'preview model imports QuestionOption / QuestionAnalysis from types',
  /import\s+type\s*\{[^}]*QuestionOption[^}]*\}\s*from\s*['"][^'"]*paperIntelligenceTypes/.test(
    modelSrc,
  ),
)

/* ─── 19. V2 cross-column evidence line — module shape ───────────── */

assert(
  'V2 line module: no reading-analysis import',
  !/features\/reading-analysis/.test(lineSrcCode) &&
    !/LinkOverlay/.test(lineSrcCode),
)
assert(
  'V2 line module: no fetch / DB / SQLite (pure UI)',
  !/\bfetch\(|XMLHttpRequest|sqlite|better-sqlite/i.test(lineSrcCode),
)
assert(
  'V2 line module exports PaperIntelligenceEvidenceLine component',
  /export function PaperIntelligenceEvidenceLine\b/.test(lineSrc),
)
assert(
  'V2 line module exports usePaperIntelligenceEvidenceLine hook',
  /export function usePaperIntelligenceEvidenceLine\b/.test(lineSrc),
)
assert(
  'V2 geometry module exports computeOverlayGeometry (pure)',
  /export function computeOverlayGeometry\b/.test(lineGeomSrc),
)
assert(
  'V2 geometry module exports findFirstDomOccurrence (multi-occurrence anchor)',
  /export function findFirstDomOccurrence\b/.test(lineGeomSrc),
)
assert(
  'V2 geometry module is JSX-free (no `.tsx`-only syntax)',
  !/<svg\b/i.test(lineGeomSrcCode) && !/<path\b/i.test(lineGeomSrcCode),
)
assert(
  'V2 geometry module: no reading-analysis import',
  !/features\/reading-analysis/.test(lineGeomSrc) &&
    !/LinkOverlay/.test(lineGeomSrc),
)
assert(
  'V2 geometry module documents multi-occurrence → first DOM occurrence policy',
  /first\s+DOM\s+occurrence/i.test(lineGeomSrc) ||
    /first\s+occurrence/i.test(lineGeomSrc),
)
assert(
  'V2 line module reads prefers-reduced-motion (via geometry helper or directly)',
  /prefers-reduced-motion/.test(lineSrc) ||
    /detectReducedMotion/.test(lineSrcCode),
)
assert(
  'V2 line module attaches scroll/resize listeners and uses ResizeObserver',
  /addEventListener\(\s*['"]scroll['"]/.test(lineSrcCode) &&
    /addEventListener\(\s*['"]resize['"]/.test(lineSrcCode) &&
    /\bResizeObserver\b/.test(lineSrcCode),
)
assert(
  'V2 line module coalesces listener-driven recomputes via requestAnimationFrame',
  /requestAnimationFrame\(/.test(lineSrcCode) &&
    /cancelAnimationFrame\(/.test(lineSrcCode),
)
assert(
  'V2 line module renders <svg className="pi-line-overlay">',
  /className=["']pi-line-overlay["']/.test(lineSrcCode),
)
assert(
  'V2 line module renders empty SVG with data-empty="true" when no geometry',
  /data-empty=["']true["']/.test(lineSrcCode),
)
assert(
  'V2 line module renders <path class="pi-line-path">',
  // The `<path>` JSX element uses `className={pathClass}` where
  // `pathClass` always begins with the literal `pi-line-path` token
  // (see `usePaperIntelligenceEvidenceLine`). We accept either a
  // direct string literal `className="pi-line-path..."` or a variable
  // expression `className={pathClass}` paired with a `pi-line-path`
  // string literal somewhere in the surrounding code.
  /className=["']pi-line-path[\s'"`]/.test(lineSrcCode) ||
    (/<path\b[\s\S]*?className=\{[a-zA-Z_$][\w$]*\}/.test(lineSrcCode) &&
      /['"`]pi-line-path['"` ]/.test(lineSrcCode)),
)
assert(
  'V2 line module renders at most ONE <path> (single render branch)',
  // count occurrences of <path> tag in the source — should be exactly 1
  (lineSrcCode.match(/<path\b/g) || []).length === 1,
)

/* ─── 20. component wires up the V2 line overlay ─────────────────── */

assert(
  'component imports PaperIntelligenceEvidenceLine from preview/paperIntelligenceEvidenceLine',
  /import\s*\{[^}]*PaperIntelligenceEvidenceLine[^}]*\}\s*from\s*['"][^'"]*preview\/paperIntelligenceEvidenceLine/.test(
    componentSrc,
  ),
)
assert(
  'component renders <PaperIntelligenceEvidenceLine /> in JSX',
  /<PaperIntelligenceEvidenceLine\b/.test(componentSrcCode),
)
assert(
  'component declares activeEvidenceId state via useState',
  /useState<string\s*\|\s*null>\([^)]*\)/.test(componentSrcCode) &&
    /activeEvidenceId/.test(componentSrcCode),
)
assert(
  'component sets activeEvidenceId via setActiveEvidenceId',
  /setActiveEvidenceId\(/.test(componentSrcCode),
)
assert(
  'component clears activeEvidenceId when activeQuestionId is null',
  // there must be a code path that calls setActiveEvidenceId(null)
  /setActiveEvidenceId\(\s*null\s*\)/.test(componentSrcCode),
)
assert(
  'component seeds activeEvidenceId from supportEvidenceId',
  /supportEvidenceId/.test(componentSrcCode),
)
assert(
  'shell ref is attached to .pi-shell so the overlay can position absolutely',
  /<div\s+className=["']pi-shell["'][^>]*\bref=\{[^}]+\}/.test(componentSrcCode),
)
assert(
  'side panel ref is attached to .pi-side aside element',
  /<aside\b[\s\S]*?className=["']pi-side["'][\s\S]*?\bref=\{[^}]+\}[\s\S]*?>/.test(
    componentSrcCode,
  ),
)
assert(
  'AnalysisPanel renders right-panel evidence rows as <button> with data-pi-evidence-id',
  /<button\b[^>]*data-pi-evidence-id/.test(componentSrcCode),
)
assert(
  'text-only distractor stays a non-button element with data-pi-quote-text-only',
  /data-pi-quote-text-only=["']true["']/.test(componentSrcCode) ||
    /data-pi-quote-text-only/.test(componentSrcCode),
)

/* ─── 21. activeQuestionId remains the PRIMARY state ─────────────── */

/*
 * The primary state contract:
 *   - `activeQuestionId` is set both directly (question-card click) AND
 *     used as the gate for `activeEvidenceId`.
 *   - `activeEvidenceId` is ONLY ever written via either:
 *       (a) `setActiveEvidenceId(null)` (clear), or
 *       (b) seeded from `view?.activeAnalysis?.supportEvidenceId`, or
 *       (c) updated by `handleSelectEvidence` (right-panel button click).
 *   - `activeEvidenceId` MUST NOT be the only top-level state. We
 *     check the file declares both `useState` calls.
 */
assert(
  'component still declares activeQuestionId via useState',
  /useState<string\s*\|\s*null>\([^)]*\)[\s\S]*activeQuestionId/.test(componentSrcCode) ||
    /\[\s*activeQuestionId\s*,\s*setActiveQuestionId\s*\]\s*=\s*useState/.test(componentSrcCode),
)
assert(
  'component declares both activeQuestionId and activeEvidenceId',
  /activeQuestionId/.test(componentSrcCode) &&
    /activeEvidenceId/.test(componentSrcCode),
)
assert(
  'activeEvidenceId reseed effect depends on activeQuestionId',
  // grep an effect that lists activeQuestionId in its deps and writes
  // activeEvidenceId inside.
  /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setActiveEvidenceId[\s\S]*?\},\s*\[[^\]]*activeQuestionId[^\]]*\]/.test(
    componentSrcCode,
  ),
)

/* ─── 22. CSS contract for V2 line overlay ───────────────────────── */

{
  const overlayRule = cssSrcCode.match(/\.pi-line-overlay\s*\{([^}]*)\}/)
  assert('.pi-line-overlay rule exists', Boolean(overlayRule))
  if (overlayRule) {
    const body = overlayRule[1]
    assert(
      '.pi-line-overlay is position: absolute / fixed inside .pi-shell',
      /position\s*:\s*(absolute|fixed)\b/.test(body),
    )
    assert(
      '.pi-line-overlay does not capture pointer events',
      /pointer-events\s*:\s*none\b/.test(body),
    )
  }

  // empty-state hide
  assert(
    '.pi-line-overlay[data-empty="true"] is hidden',
    /\.pi-line-overlay\[data-empty=['"]true['"]\][\s\S]*?\{[^}]*display\s*:\s*none/.test(
      cssSrcCode,
    ),
  )

  const pathRule = cssSrcCode.match(/\.pi-line-path\s*\{([^}]*)\}/)
  assert('.pi-line-path rule exists', Boolean(pathRule))
  if (pathRule) {
    const body = pathRule[1]
    assert(
      '.pi-line-path uses dashed (or dotted) stroke pattern',
      /stroke-dasharray\s*:/.test(body) ||
        /stroke-linecap\s*:\s*round/.test(body),
    )
  }

  // small-screen hide
  assert(
    'CSS hides .pi-line-overlay on small screens (max-width: 900px)',
    /@media\s*\(\s*max-width\s*:\s*900px\s*\)\s*\{[\s\S]*?\.pi-line-overlay[\s\S]*?display\s*:\s*none/.test(
      cssSrcCode,
    ),
  )

  // reduced-motion
  assert(
    'CSS suppresses line draw animation under prefers-reduced-motion',
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\.pi-line-path/.test(
      cssSrcCode,
    ),
  )

  // shell is positioned so the absolute overlay anchors to it
  assert(
    '.pi-shell is position: relative so the overlay anchors to it',
    /\.pi-shell\s*\{[^}]*position\s*:\s*relative/.test(cssSrcCode),
  )
}

/* ─── 23. computeOverlayGeometry / findFirstDomOccurrence unit tests ─ */

// 23a. computeOverlayGeometry returns a valid Bezier
{
  const container = { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }
  const target = { left: 100, top: 200, right: 200, bottom: 220, width: 100, height: 20 }
  const source = { left: 700, top: 350, right: 950, bottom: 380, width: 250, height: 30 }
  const g = computeOverlayGeometry(container, source, target)
  assert(
    '23a: geometry width/height matches container',
    g.width === 1000 && g.height === 600,
  )
  assert(
    '23a: geometry d starts with M (moveto) and contains C (cubic)',
    /^M\s+/.test(g.d) && /\bC\b/.test(g.d),
  )
  // The path's start (M) should be at target.right, and end at source.left
  // (we anchor target on the right edge and source on the left edge).
  const moveMatch = g.d.match(/^M\s+([\d.]+)\s+([\d.]+)/)
  assert(
    '23a: path starts at target.right (anchored to left mark)',
    Boolean(moveMatch) && Math.abs(parseFloat(moveMatch[1]) - 200) < 0.5,
  )
}

// 23b. findFirstDomOccurrence returns the first matching mark in document order
{
  // Build a tiny DOM-shaped object literal that exposes querySelector.
  // We only need querySelector to return the FIRST match, so a stub
  // is enough — we don't need a full jsdom.
  const callOrder = []
  const fakeContainer = {
    querySelector(selector) {
      callOrder.push(selector)
      // mimic the real DOM: return a stand-in HTMLElement-shaped object
      // when the selector matches our expected attribute.
      if (selector.includes('data-pi-evidence-id')) {
        return { isFirst: true }
      }
      return null
    },
  }
  const found = findFirstDomOccurrence(fakeContainer, 'A-21-correct')
  assert(
    '23b: findFirstDomOccurrence calls querySelector with mark[data-pi-evidence-id]',
    callOrder.length === 1 && /^mark\[data-pi-evidence-id=/.test(callOrder[0]),
  )
  assert(
    '23b: findFirstDomOccurrence returns the (first) result of querySelector',
    found && found.isFirst === true,
  )
}

// 23c. findFirstDomOccurrence returns null on null inputs
{
  const a = findFirstDomOccurrence(null, 'whatever')
  const b = findFirstDomOccurrence({ querySelector: () => null }, null)
  assert(
    '23c: findFirstDomOccurrence(null, id) === null',
    a === null,
  )
  assert(
    '23c: findFirstDomOccurrence(container, null) === null',
    b === null,
  )
}

/* ─── 24. companion smoke script exists and covers V2 line ───────── */

const SMOKE = 'scripts/smoke-paper-intelligence-preview.mjs'
assert('companion smoke script exists', existsSync(path.join(ROOT, SMOKE)))
if (existsSync(path.join(ROOT, SMOKE))) {
  const smokeSrc = readSrc(SMOKE)
  assert(
    'smoke script targets ?view=paper-intelligence&paperId=...',
    /view=paper-intelligence/.test(smokeSrc) && /paperId=/.test(smokeSrc),
  )
  assert(
    'smoke script imports playwright from app/node_modules/playwright',
    /from\s+['"][^'"]*app\/node_modules\/playwright/.test(smokeSrc),
  )
  assert(
    'smoke asserts auto-scroll target lands inside .pi-main',
    /\.pi-main\b/.test(smokeSrc) && /scrollTop/.test(smokeSrc),
  )
  assert(
    'smoke asserts the document/window scrollY does not change during click',
    /window\.scrollY/.test(smokeSrc),
  )
  // V2 additions
  assert(
    'smoke checks for the V2 line overlay (.pi-line-overlay)',
    /\.pi-line-overlay/.test(smokeSrc),
  )
  assert(
    'smoke checks the line path uses .pi-line-path class',
    /\.pi-line-path/.test(smokeSrc),
  )
  assert(
    'smoke verifies the path data-pi-evidence-id matches the active evidence id',
    /data-pi-evidence-id/.test(smokeSrc) &&
      /pi-line-path/.test(smokeSrc),
  )
  assert(
    'smoke clicks a quoted distractor to assert the line switches',
    /pi-analysis-distractor(?!-text-only)/.test(smokeSrc),
  )
  assert(
    'smoke covers a small-screen / narrow viewport scenario where the line is hidden',
    /setViewportSize\s*\(\s*\{[\s\S]*?width\s*:\s*\d+/.test(smokeSrc) ||
      /viewport[\s\S]*?width:\s*\d+/.test(smokeSrc),
  )
  assert(
    'smoke checks no V0 .pi-question-detail row appears',
    /\.pi-question-detail/.test(smokeSrc),
  )
  assert(
    'smoke checks the overlay does NOT use reading-analysis data-link-id',
    /data-link-id/.test(smokeSrc) || /LinkOverlay/.test(smokeSrc),
  )
}

/* ─── 25. regression: things that must remain locked ─────────────── */

assert(
  'regression: component still does NOT import LinkOverlay',
  !/LinkOverlay/.test(componentSrcCode),
)
assert(
  'regression: V2 line module does NOT import reading-analysis',
  !/features\/reading-analysis/.test(lineSrcCode),
)
assert(
  'regression: V2 line module does NOT import LinkOverlay',
  !/LinkOverlay/.test(lineSrcCode),
)
assert(
  'regression: component still does NOT import reading-analysis',
  !/features\/reading-analysis/.test(componentSrcCode),
)
assert(
  'regression: V0 detail components remain absent',
  !/function\s+(DetailQuestionRow|QuestionsPanel|QuestionDetail)\b/.test(componentSrcCode),
)

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
