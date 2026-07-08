#!/usr/bin/env node
/**
 * Verification: 刀A analysis-layering (docs/cuts/analysis-layering/plan.md).
 *
 * Owner call (2026-07-08): the detail page gave "too much, too flat" analysis
 * per question — everything rendered open at once. This cut adds a two-layer
 * disclosure: the answer line stays always visible, everything else (per
 * question and per group-level block) collapses behind a generic
 * `AnalysisDisclosure` toggle. No new "one-line takeaway" middle layer is
 * invented (data has no such field) and no field content is reworded.
 *
 * `QuestionGroupDetailView.tsx` keeps its hard "zero internal useState"
 * guardrail (verify-classic-retire-2.mjs) — this script re-asserts that so
 * a future edit can't quietly reintroduce state there while adding
 * AnalysisDisclosure usage.
 *
 * Source-level checks only (matches the established convention for this
 * repo's `.tsx` verify scripts — no jsdom/testing-library harness exists to
 * actually mount React components; see scripts/verify-classic-retire-2.mjs
 * and friends for precedent). Covers:
 *
 *   1. AnalysisDisclosure.tsx exists, owns its own useState, defaults
 *      collapsed, and exposes the accessibility pattern (aria-expanded +
 *      aria-pressed on a <button>) per PaperAssetAnalysisPanel.tsx precedent.
 *   2. QuestionGroupDetailView.tsx imports and uses AnalysisDisclosure for
 *      every per-question AI block (reading/cloze/seven_choices/grammar)
 *      and every group-level block (脉络+重要词块 / 故事大意+串词成篇 /
 *      文章主旨 / 全文翻译), while the AI 推荐答案 line for each group type
 *      stays outside any AnalysisDisclosure (always visible).
 *   3. QuestionGroupDetailView.tsx still has zero internal useState — the
 *      guardrail moved responsibility to the new child component, not
 *      quietly relaxed on the parent.
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

// ------------------------------------------------------------------ 2. QuestionGroupDetailView.tsx wiring

const detailView = read('app/src/features/question-detail/QuestionGroupDetailView.tsx')

assert(
  "QuestionGroupDetailView imports AnalysisDisclosure from './AnalysisDisclosure'",
  /import \{ AnalysisDisclosure \} from '\.\/AnalysisDisclosure'/.test(detailView),
)

const analysisDisclosureUsageCount = (detailView.match(/<AnalysisDisclosure[\s>]/g) || []).length
assert(
  'QuestionGroupDetailView uses <AnalysisDisclosure> at least 8 times (4 per-question + 4 group-level blocks)',
  analysisDisclosureUsageCount >= 8,
  `found ${analysisDisclosureUsageCount}`,
)

// Per-question: each group type's remaining analysis fields collapse behind
// AnalysisDisclosure, while the AI 推荐答案 line for that group type appears
// BEFORE the disclosure (always visible) — assert relative ordering via a
// single regex per group type so a future edit can't silently move the
// answer line back inside the collapsed body.
const perQuestionChecks = [
  [
    'reading: AI 推荐答案 line precedes AnalysisDisclosure, 题目翻译/干扰项分析 stay inside it',
    /readingParseItem\.answer[\s\S]{0,80}question-ai-answer-line[\s\S]{0,400}<AnalysisDisclosure>[\s\S]*?题目翻译[\s\S]*?干扰项分析/,
  ],
  [
    'cloze: AI 推荐答案 line precedes AnalysisDisclosure, AI 解析/干扰项分析 stay inside it',
    /question-ai-answer-line"[\s\S]{0,150}clozeParseItem\.answer[\s\S]{0,400}<AnalysisDisclosure>[\s\S]*?AI 完形填空解析[\s\S]*?干扰项分析/,
  ],
  [
    'seven_choices: AI 推荐答案 line precedes AnalysisDisclosure, 选项翻译/位置与上下文 stay inside it',
    /question-ai-answer-line"[\s\S]{0,150}sevenChoicesParseItem\.answer[\s\S]{0,400}<AnalysisDisclosure>[\s\S]*?选项翻译[\s\S]*?位置与上下文/,
  ],
  [
    'grammar: AI 推荐答案 line precedes AnalysisDisclosure, 提示词意思/挖空句翻译 stay inside it',
    /question-ai-answer-line"[\s\S]{0,150}grammarParseItem\.answer[\s\S]{0,400}<AnalysisDisclosure>[\s\S]*?提示词意思[\s\S]*?挖空句翻译/,
  ],
]

for (const [name, pattern] of perQuestionChecks) {
  assert(name, pattern.test(detailView))
}

// Group-level blocks: each wrapped in its own AnalysisDisclosure with a
// static `label` matching the block's own title.
const groupLevelChecks = [
  ['reading group block: 脉络与重要词块 disclosure wraps 脉络 + 重要词块', /<AnalysisDisclosure label="脉络与重要词块">[\s\S]*?脉络：[\s\S]*?重要词块/],
  ['cloze group block: 故事大意与串词成篇 disclosure wraps both fields', /<AnalysisDisclosure label="故事大意与串词成篇">[\s\S]*?故事大意：[\s\S]*?串词成篇/],
  ['seven_choices group block: 文章主旨 disclosure', /<AnalysisDisclosure label="文章主旨">[\s\S]*?文章主旨：/],
  ['grammar group block: 全文翻译 disclosure', /<AnalysisDisclosure label="全文翻译">[\s\S]*?全文翻译/],
]

for (const [name, pattern] of groupLevelChecks) {
  assert(name, pattern.test(detailView))
}

// Owner-only blocks untouched by this cut — must NOT be wrapped in a new
// disclosure (verify-list / compareBox / confidence stay as-is).
assert(
  'verify-list (AI 答案验证, owner-only) is not touched by AnalysisDisclosure',
  !/<AnalysisDisclosure[^>]*>[\s\S]{0,600}verify-list/.test(detailView),
)

// ------------------------------------------------------------------ 3. zero-useState guardrail re-asserted here too

assert(
  'QuestionGroupDetailView still has zero internal useState (guardrail not relaxed by this cut)',
  !/\buseState\s*\(/.test(detailView),
)

if (failed > 0) {
  console.error(`\nanalysis-layering verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nanalysis-layering verify passed: ${passed} passed, 0 failed`)
