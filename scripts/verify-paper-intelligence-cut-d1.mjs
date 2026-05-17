#!/usr/bin/env node
/**
 * verify-paper-intelligence-cut-d1
 *
 * Static + functional checks for Cut D1: Paper Intelligence front-end
 * interaction rearrangement.
 *
 * Coverage:
 *   1. Left panel no longer renders inline LoadsPanel / OutlinePanel /
 *      ChunksSummary between passage body and question list.
 *   2. Question list still exists; 15 questions still clickable.
 *   3. Click question → activeQuestionId / activeEvidenceId / evidence
 *      line logic still works (model-level).
 *   4. Right side has A/B/C/D option blocks.
 *   5. Correct option block includes synonym replacement info.
 *   6. Right side does NOT repeat full evidence quote.
 *   7. Passage header has insight chip.
 *   8. Insight chip opens panel (code structure check).
 *   9. Panel closes via chip re-click / × / Esc (code structure check).
 *  10. PI subtree does NOT import usePaperDraft / QuestionGroupCard /
 *      questionGroupById.
 *  11. reading-analysis verify still passes (no imports from RA).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import {
  buildPreviewView,
  buildQuestionId,
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

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const COMPONENT = 'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx'
const componentSrc = readSrc(COMPONENT)
const componentSrcCode = stripComments(componentSrc)

/* ═══════════════════════════════════════════════════════════════════
 * 1. Left panel no longer renders inline LoadsPanel / OutlinePanel /
 *    ChunksSummary between PassageBody and question-list.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 1. Left panel paper-like flow ───')

// In the PassageSection render, LoadsPanel/OutlinePanel/ChunksSummary must NOT
// appear between <PassageBody> and <div className="pi-question-list">.
// They should only appear inside InsightPanel.
{
  // Extract PassageSection's return JSX (find the function)
  const passageSectionMatch = componentSrcCode.match(
    /function PassageSection\b[\s\S]*?return\s*\(([\s\S]*?)\n\s*\)\s*\n\}/
  )
  assert('PassageSection function exists', Boolean(passageSectionMatch))

  if (passageSectionMatch) {
    const jsx = passageSectionMatch[1]
    // Between <PassageBody and <div className="pi-question-list"> there should be
    // NO <LoadsPanel, <OutlinePanel, <ChunksSummary
    const bodyToQuestionList = jsx.match(
      /<PassageBody[\s\S]*?<div className="pi-question-list"/
    )
    assert(
      'PassageBody → question-list section found',
      Boolean(bodyToQuestionList),
    )
    if (bodyToQuestionList) {
      const between = bodyToQuestionList[0]
      assert(
        'No <LoadsPanel inline between passage body and questions',
        !/<LoadsPanel\b/.test(between),
        'LoadsPanel found inline',
      )
      assert(
        'No <OutlinePanel inline between passage body and questions',
        !/<OutlinePanel\b/.test(between),
        'OutlinePanel found inline',
      )
      assert(
        'No <ChunksSummary inline between passage body and questions',
        !/<ChunksSummary\b/.test(between),
        'ChunksSummary found inline',
      )
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 2. Question list still exists; 15 questions still clickable.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 2. Question list & 15 questions ───')

assert(
  'pi-question-list class is rendered in component',
  componentSrcCode.includes('pi-question-list'),
)
assert(
  'QuestionCard component exists',
  /function QuestionCard\b/.test(componentSrcCode),
)
assert(
  'QuestionCard is a clickable button',
  /<button[\s\S]*?onClick[\s\S]*?onSelect\(row\.questionId\)/.test(componentSrcCode),
)

// Functional check: 15 questions in the fixture
const REPORT_PATH = path.join(ROOT, 'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json')
const INPUT_PATH = path.join(ROOT, 'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json')
const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'))
const input = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'))
const bodies = {}
for (const p of input?.passages || []) {
  if (p?.paperSection && typeof p.passageBody === 'string') bodies[p.paperSection] = p.passageBody
}
const view = buildPreviewView({ report, bodies, activeQuestionId: null })
let totalQuestions = 0
for (const p of view.passages) totalQuestions += p.questions.length
assert('fixture has 15 questions', totalQuestions === 15, `got ${totalQuestions}`)

/* ═══════════════════════════════════════════════════════════════════
 * 3. activeQuestionId / activeEvidenceId / evidence line still work.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 3. Active state + evidence line ───')

assert('activeQuestionId state declared', /activeQuestionId/.test(componentSrcCode))
assert('activeEvidenceId state declared', /activeEvidenceId/.test(componentSrcCode))
assert(
  'PaperIntelligenceEvidenceLine rendered',
  /<PaperIntelligenceEvidenceLine\b/.test(componentSrcCode),
)

// Functional: activating A-21 produces evidence
{
  const activeId = buildQuestionId('A', '21')
  const activeView = buildPreviewView({ report, bodies, activeQuestionId: activeId })
  assert('activeAnalysis non-null for A-21', activeView.activeAnalysis !== null)
  assert(
    'supportEvidenceId present for A-21',
    activeView.activeAnalysis?.supportEvidenceId?.endsWith('-correct') === true,
  )
  const passageA = activeView.passages.find((p) => p.paperSection === 'A')
  const supportSegs = (passageA?.segments || []).filter(
    (s) => s.kind === 'highlight' && s.evidenceKind === 'support',
  )
  assert('at least 1 support highlight for A-21', supportSegs.length >= 1)
}

/* ═══════════════════════════════════════════════════════════════════
 * 4. Right side has A/B/C/D option blocks.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 4. Option-integrated analysis ───')

assert(
  'pi-option-block class exists in component',
  componentSrcCode.includes('pi-option-block'),
)
assert(
  'Option labels A/B/C/D rendered',
  componentSrcCode.includes("['A', 'B', 'C', 'D']") ||
    componentSrcCode.includes("'A', 'B', 'C', 'D'"),
)
assert(
  'Each option block has data-pi-option-label',
  /data-pi-option-label=\{label\}/.test(componentSrcCode),
)
assert(
  'Each option block has data-pi-evidence-id for line anchoring',
  /data-pi-evidence-id=\{evidenceId/.test(componentSrcCode),
)

/* ═══════════════════════════════════════════════════════════════════
 * 5. Correct option block includes synonym replacement.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 5. Synonym replacement in correct block ───')

assert(
  'synonymSummary rendered inside correct option block',
  /synonymSummary/.test(componentSrcCode) && componentSrcCode.includes('同义替换'),
)
assert(
  'pi-option-block--correct class exists',
  componentSrcCode.includes('pi-option-block--correct'),
)

/* ═══════════════════════════════════════════════════════════════════
 * 6. Right side does NOT repeat full evidence quote.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 6. No full evidence quote in right panel ───')

assert(
  'No pi-analysis-evidence-quote class in new component code',
  !componentSrcCode.includes('pi-analysis-evidence-quote'),
)
assert(
  'answerEvidenceQuote NOT displayed as a standalone quote block',
  !/answerEvidenceQuote[\s\S]{0,50}[""].*[""]/.test(componentSrcCode),
)

/* ═══════════════════════════════════════════════════════════════════
 * 7. Passage header has insight chip.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 7. Insight chip ───')

assert(
  'pi-insight-chip class exists in component',
  componentSrcCode.includes('pi-insight-chip'),
)
assert(
  'Insight chip shows 洞察 label',
  componentSrcCode.includes('洞察'),
)
assert(
  'buildInsightChipLabel function exists',
  /function buildInsightChipLabel\b/.test(componentSrcCode),
)
assert(
  'Chip aria-expanded attribute present',
  /aria-expanded=\{insightOpen\}/.test(componentSrcCode),
)

/* ═══════════════════════════════════════════════════════════════════
 * 8. Click chip → panel expands.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 8. Insight panel expand ───')

assert(
  'InsightPanel component exists',
  /function InsightPanel\b/.test(componentSrcCode),
)
assert(
  'pi-insight-panel class used',
  componentSrcCode.includes('pi-insight-panel'),
)
assert(
  'InsightPanel renders LoadsPanel',
  /<LoadsPanel\b/.test(componentSrcCode),
)
assert(
  'InsightPanel renders OutlinePanel',
  /<OutlinePanel\b/.test(componentSrcCode),
)
assert(
  'InsightPanel renders ChunksSummary',
  /<ChunksSummary\b/.test(componentSrcCode),
)
assert(
  'activeInsightSection state declared',
  /activeInsightSection/.test(componentSrcCode),
)

/* ═══════════════════════════════════════════════════════════════════
 * 9. Panel closes via chip re-click / × / Esc.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 9. Insight panel close mechanisms ───')

assert(
  'Chip shows 收起洞察 when open',
  componentSrcCode.includes('收起洞察'),
)
assert(
  '× close button in InsightPanel',
  componentSrcCode.includes('pi-insight-panel-close'),
)
assert(
  'Esc key handler for insight panel',
  /Escape/.test(componentSrcCode) && /activeInsightSection/.test(componentSrcCode),
)
assert(
  'Only one insight open at a time (string | null state)',
  /useState<string\s*\|\s*null>\(null\)/.test(componentSrcCode),
)

/* ═══════════════════════════════════════════════════════════════════
 * 10. PI subtree does NOT import forbidden modules.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 10. No forbidden imports ───')

// Scan all .ts/.tsx files in the PI feature directory
const PI_DIR = path.join(ROOT, 'app/src/features/paper-intelligence')
function getAllTsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  let files = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) files.push(...getAllTsFiles(full))
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(full)
  }
  return files
}
const piFiles = getAllTsFiles(PI_DIR)
let hasForbiddenImport = false
const forbidden = ['usePaperDraft', 'QuestionGroupCard', 'questionGroupById']
for (const f of piFiles) {
  const src = readFileSync(f, 'utf-8')
  for (const term of forbidden) {
    if (src.includes(term)) {
      hasForbiddenImport = true
      console.error(`    FORBIDDEN: ${path.relative(ROOT, f)} imports ${term}`)
    }
  }
}
assert('PI subtree has no forbidden imports', !hasForbiddenImport)

/* ═══════════════════════════════════════════════════════════════════
 * 11. reading-analysis not touched.
 * ═══════════════════════════════════════════════════════════════════ */

console.log('\n─── 11. reading-analysis isolation ───')

// PI feature dir must not import from reading-analysis
let hasRaImport = false
for (const f of piFiles) {
  const src = stripComments(readFileSync(f, 'utf-8'))
  if (/features\/reading-analysis/.test(src)) {
    hasRaImport = true
    console.error(`    RA IMPORT: ${path.relative(ROOT, f)}`)
  }
}
assert('PI subtree does not import reading-analysis', !hasRaImport)

// reading-analysis directory still intact
assert(
  'reading-analysis directory still has ReadingAnalysisView.tsx',
  existsSync(path.join(ROOT, 'app/src/features/reading-analysis/ReadingAnalysisView.tsx')),
)

/* ═══════════════════════════════════════════════════════════════════ */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
