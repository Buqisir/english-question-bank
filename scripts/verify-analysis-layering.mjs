#!/usr/bin/env node
/**
 * Verification: 刀A analysis-layering (docs/cuts/analysis-layering/plan.md).
 *
 * Owner call (2026-07-08): the detail page gave "too much, too flat" analysis
 * per question — everything rendered open at once. This cut added a
 * two-layer disclosure: the answer line stays always visible, everything
 * else (per question and per group-level block) collapses behind a generic
 * `AnalysisDisclosure` toggle.
 *
 * detail-page-redesign (2026-07-15, spec docs/specs/2026-07-15-detail-page-
 * redesign-design.md 负空间①「解析不放」): the entire per-question analysis
 * surface that section 2 used to assert the layering of — passage,
 * 逐题题干答案, all four groupType AI-analysis blocks — is now structurally
 * gone from the detail page (retired wholesale, not re-laid-out), replaced
 * by 速览头 + a read-only「一张纸」PaperSurface mount. Section 2's
 * assertions FLIP from "AnalysisDisclosure is wired up N ways" to "zero
 * AnalysisDisclosure residue" (plan.md §6 authorized anchor move). Section 1
 * (AnalysisDisclosure.tsx itself — still a live shared component, still used
 * by verify-detail-redesign.mjs's own retirement check) and section 3 (the
 * useState guardrail count, now 4 per detail-page-redesign's rewrite) are
 * re-asserted unchanged in spirit.
 *
 * Source-level checks only (matches the established convention for this
 * repo's `.tsx` verify scripts — no jsdom/testing-library harness exists to
 * actually mount React components; see scripts/verify-classic-retire-2.mjs
 * and friends for precedent). Covers:
 *
 *   1. AnalysisDisclosure.tsx exists, owns its own useState, defaults
 *      collapsed, and exposes the accessibility pattern (aria-expanded +
 *      aria-pressed on a <button>) per PaperAssetAnalysisPanel.tsx precedent.
 *   2. QuestionGroupDetailView.tsx has zero AnalysisDisclosure import/usage,
 *      and zero residue of the per-question/group-level analysis surfaces
 *      the old layering wrapped (question-ai-block, question-ai-parse,
 *      the four group-level analysis titles).
 *   3. QuestionGroupDetailView.tsx still has exactly the detail-page-
 *      redesign useState count (4) — the guardrail is not further relaxed
 *      by this cut.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  PASS ${name}`)
  } else {
    failed += 1
    console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// ------------------------------------------------------------------ 1. AnalysisDisclosure.tsx

const disclosure = read('app/src/features/question-detail/AnalysisDisclosure.tsx')

assert('AnalysisDisclosure owns internal useState (self-contained expand/collapse)', /\buseState\s*\(\s*false\s*\)/.test(disclosure))
assert('AnalysisDisclosure default collapsed (no defaultExpanded=true escape hatch)', !/defaultExpanded/.test(disclosure))
assert(
  'AnalysisDisclosure toggle button has aria-expanded reflecting state',
  /aria-expanded=\{expanded\}/.test(disclosure),
)
assert(
  'AnalysisDisclosure toggle button has aria-pressed reflecting state (PaperAssetAnalysisPanel pattern)',
  /aria-pressed=\{expanded\}/.test(disclosure),
)
assert('AnalysisDisclosure toggle is a real <button type="button">', /<button\s+type="button"/.test(disclosure))
assert(
  'AnalysisDisclosure default per-question labels are 展开解析/收起',
  disclosure.includes("expandText = '展开解析'") && disclosure.includes("collapseText = '收起'"),
)
assert(
  'AnalysisDisclosure body only renders while expanded (collapsed by default hides content)',
  /\{expanded\s*&&\s*<div className="analysis-disclosure-body">/.test(disclosure),
)

// ------------------------------------------------------------------ 2. QuestionGroupDetailView.tsx: AnalysisDisclosure retired (detail-page-redesign)

const detailView = read('app/src/features/question-detail/QuestionGroupDetailView.tsx')

assert(
  'QuestionGroupDetailView no longer imports AnalysisDisclosure',
  !/import \{ AnalysisDisclosure \} from '\.\/AnalysisDisclosure'/.test(detailView),
)
assert(
  'QuestionGroupDetailView mounts zero <AnalysisDisclosure> (spec 负空间① — 解析不放)',
  !/<AnalysisDisclosure[\s>]/.test(detailView),
)

// The per-question/group-level analysis surfaces this cut's old layering
// wrapped are themselves fully retired, not merely un-wrapped — confirm
// their containing markers are gone too (a future regression re-adding the
// old analysis blocks WITHOUT AnalysisDisclosure would still be spec
// non-compliance, and this catches that).
const retiredAnalysisMarkers = [
  ['question-ai-block (per-question AI analysis wrapper)', /question-ai-block/],
  ['question-ai-parse (per-question AI analysis body)', /question-ai-parse/],
  ['脉络与重要词块 (reading group-level block)', /脉络与重要词块/],
  ['故事大意与串词成篇 (cloze group-level block)', /故事大意与串词成篇/],
  ['文章主旨 (seven_choices group-level block, as an AnalysisDisclosure label)', /<AnalysisDisclosure label="文章主旨"/],
  ['全文翻译 (grammar group-level block, as an AnalysisDisclosure label)', /<AnalysisDisclosure label="全文翻译"/],
]
for (const [label, pattern] of retiredAnalysisMarkers) {
  assert(`retired analysis surface absent: ${label}`, !pattern.test(detailView))
}

// ------------------------------------------------------------------ 3. useState guardrail re-asserted here too

// The canonical version of this guardrail (scripts/verify-classic-retire-2.mjs)
// is the source of truth for the exact count + which declarations make it
// up (detail-page-redesign: 一张纸 load/expanded + similar-passages-entry
// panel state, 4 total). Mirrored here so the two guardrails stay in sync.
const useStateCallCount = (detailView.match(/\buseState\s*[<(]/g) || []).length
assert(
  'QuestionGroupDetailView still has at most the detail-page-redesign + similar-passages-entry internal useState calls (guardrail not further relaxed by this cut)',
  useStateCallCount === 4,
  `found ${useStateCallCount} useState call(s)`,
)

if (failed > 0) {
  console.error(`\nanalysis-layering verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nanalysis-layering verify passed: ${passed} passed, 0 failed`)
