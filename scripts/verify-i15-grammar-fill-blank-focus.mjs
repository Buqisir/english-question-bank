#!/usr/bin/env node
/**
 * verify-i15-grammar-fill-blank-focus.mjs
 *
 * Covers I15 — grammar-fill in-passage blank focus + retire the rail.
 *
 *  Step 1 — prop + rail suppression:
 *    - shared/papersurface/types.d.ts declares blankFocusMode (PA MF-2)
 *    - PaperSurface destructures blankFocusMode default 'rail'
 *    - rail (PaperSurfaceQuestionList) is gated by
 *      `blankFocus?.renderer !== 'grammar-fill'` (both the section list and
 *      the global list) — [lecture-rail-scroll-fix, 2026-07-11] narrowed
 *      from the original bare `!blankFocus` guard so a second clickable
 *      mode ('paper-blank', cloze/七选五) can share the same BlankFocusContext
 *      without also suppressing the rail; the 'in-passage' (grammar-fill)
 *      suppression behavior itself is unchanged.
 *
 *  Step 2 — clickable in-passage blanks (GATE: isolation + SW-1):
 *    - grammarFillBlankPattern matches `56._____` / `57._____(absorb)`,
 *      captures the number BEFORE the dot+underscores
 *    - does NOT match cloze `__41__` / 七选五 `_____36_____`
 *    - does NOT match numeric-noise (`2026`, `800g`, `3-5g`, `25-30g`)
 *    - `64._____ 3-5g` → ["64"] (not "3") — SW-1
 *    - paperBlankPattern literal is byte-unchanged (regression guard)
 *    - blank renders a <button> with aria-label / aria-pressed wired to
 *      handleQuestionClick; unmatched blank → non-interactive span (SW-2)
 *
 *  Step 3 — harness wiring:
 *    - <PaperSurface> gets blankFocusMode 'in-passage' only when
 *      grammarFillAnalysisModel is set, else 'rail'
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findGrammarFillBlankNumbers } from '../app/src/shared-ui/papersurface/grammarFillBlank.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, cond, details = '') {
  if (cond) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.error(`FAIL  ${name}${details ? `\n      ${details}` : ''}`) }
}
function readSrc(rel) { return readFileSync(path.join(rootDir, rel), 'utf8') }

// ============================================================
// Step 1 — prop + rail suppression (source)
// ============================================================

const TYPES = 'shared/papersurface/types.d.ts'
assert('Step 1: types.d.ts exists', existsSync(path.join(rootDir, TYPES)))
const typesSrc = readSrc(TYPES)
assert('Step 1: PA MF-2 — blankFocusMode declared in types.d.ts',
  /blankFocusMode\??:\s*'rail'\s*\|\s*'in-passage'/.test(typesSrc))

const PS = 'app/src/shared-ui/papersurface/PaperSurface.tsx'
const psSrc = readSrc(PS)
const legacyRendererSrc = readSrc(
  'app/src/shared-ui/papersurface/legacyPaperBlankRenderer.tsx',
)
assert('Step 1: PaperSurface destructures blankFocusMode default rail',
  /blankFocusMode\s*=\s*'rail'/.test(psSrc))
// Rail suppressed ONLY in 'in-passage' mode (both list sites gated by
// blankFocus?.renderer !== 'grammar-fill' — see lecture-rail-scroll-fix
// header note above for why this narrowed from the original !blankFocus).
const railGuards = (psSrc.match(/blankFocus\?\.renderer !== 'grammar-fill'/g) || []).length
assert("Step 1: both rail render sites gated by blankFocus?.renderer !== 'grammar-fill'", railGuards >= 2,
  `found ${railGuards} narrowed guards`)

// ============================================================
// Step 2 — pattern isolation + SW-1 (real exported helper)
// ============================================================

assert('Step 2: 56._____ matches → ["56"]',
  JSON.stringify(findGrammarFillBlankNumbers('Eating more fibre, 56._____ fibremaxxing,')) === JSON.stringify(['56']))
assert('Step 2: 57._____(absorb) matches → ["57"]',
  JSON.stringify(findGrammarFillBlankNumbers('too much from 57._____(absorb) by the body.')) === JSON.stringify(['57']))
// SW-1: number BEFORE the underscores wins; trailing bare numbers ignored.
assert('Step 2 SW-1: "Increase intake 64._____ 3-5g" → ["64"] (not 3)',
  JSON.stringify(findGrammarFillBlankNumbers('Increase intake 64._____ 3-5g every few days')) === JSON.stringify(['64']))
// SW-1: numeric noise with NO underscore run → zero matches.
assert('Step 2 SW-1: numeric-noise string → no matches',
  findGrammarFillBlankNumbers('trend of 2026, up to 25-30g a day, 800g a day, 30g, 10g').length === 0)
// Isolation: cloze / 七选五 blank markers are NOT grammar-fill blanks.
assert('Step 2: cloze __41__ → no grammar-fill match',
  findGrammarFillBlankNumbers('She was feeling __41__ about it.').length === 0)
assert('Step 2: 七选五 _____36_____ → no grammar-fill match',
  findGrammarFillBlankNumbers('Here is the gap _____36_____ in the text.').length === 0)
// Multi-blank paragraph: all captured in order.
assert('Step 2: multi-blank paragraph captures all in order',
  JSON.stringify(findGrammarFillBlankNumbers('the 60._____(recommend) amount that 61._____(be) present')) === JSON.stringify(['60', '61']))

// paperBlankPattern literal MUST be byte-unchanged (regression guard).
// 刀⑤ render-fidelity Chunk B moved the literal out of PaperSurface.tsx into
// shared/papersurface/blankPattern.mjs (server reuse, PA F2 / SW-3) —
// The legacy-only renderer imports it; the canonical renderer has no marker
// parser dependency.
const blankPatternSrc = readSrc('shared/papersurface/blankPattern.mjs')
assert('Step 2: legacyPaperBlankRenderer.tsx imports paperBlankPattern from shared/papersurface/blankPattern.mjs',
  /import\s*\{\s*paperBlankPattern\s*\}\s*from\s*['"][./]*shared\/papersurface\/blankPattern\.mjs['"]/.test(legacyRendererSrc))
assert('Step 2: paperBlankPattern literal unchanged (regression guard)',
  blankPatternSrc.includes('export const paperBlankPattern = /(?:_{2,}|[\\u0020\\u00A0]{2,})\\s*(\\d{1,3})\\s*(?:_{2,}|[\\u0020\\u00A0]{2,})/g'))

// In-passage blank renders a wired <button>; unmatched → non-interactive span (SW-2).
assert('Step 2: in-passage blank is a <button> with aria-label 聚焦第',
  legacyRendererSrc.includes('aria-label={`聚焦第 ${blankNo} 题`}') && legacyRendererSrc.includes('onClick={() => blankFocus.onQuestionClick(questionId)}'))
assert('Step 2: button active state from lectureFocus via activeQuestionId (SW-3)',
  legacyRendererSrc.includes('blankFocus.activeQuestionId === questionId') && legacyRendererSrc.includes('aria-pressed={isActive}'))
assert('Step 2 SW-2: unmatched blank → non-interactive span (no dead button)',
  legacyRendererSrc.includes("className=\"ps-paper-blank-text\""))
// 'rail' path: renderer falls through to the historical span path (zero new
// behavior) — dispatch narrowed to the 'grammar-fill' renderer specifically
// [lecture-rail-scroll-fix, 2026-07-11] so a second clickable mode
// ('paper-blank') can share BlankFocusContext without hijacking this branch.
assert("Step 2: rail path falls through when blankFocus is null or renderer !== 'grammar-fill'",
  /if \(blankFocus\?\.renderer === 'grammar-fill'\)\s*\{\s*return renderTextWithGrammarFillBlanks/.test(legacyRendererSrc))

// ============================================================
// Step 3 — harness wiring (source) — RETIRED
// ============================================================
// reading-analysis-retire (2026-07-16, A-class re-anchor, rationale):
// `PaperIntelligencePaperSurfaceHarness.tsx` is retired with the
// `?view=paper-intelligence&surface=paper` orphan route (plan.md Scope 步
// 3); it was the sole caller of `blankFocusMode`. Retirement assertion
// instead of re-anchoring — PaperBrowsePage's lecture-mode blank-focus
// wiring is a distinct state shape, not a 1:1 port of this string — per
// plan.md Scope 步 6's authorized alternative.
const HARNESS = 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx'
assert('Step 3 (retired): PaperIntelligencePaperSurfaceHarness.tsx no longer exists',
  !existsSync(path.join(rootDir, HARNESS)))

// ============================================================
// CSS affordance present
// ============================================================
const css = readSrc('app/src/shared-ui/papersurface/PaperSurface.css')
assert('CSS: ps-paper-blank-button styled (cursor pointer + active)',
  css.includes('.ps-paper-blank-button') && css.includes('cursor: pointer') && css.includes('ps-paper-blank-button--active'))

// ============================================================
console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
console.log('I15 grammar-fill blank focus verify passed.')
