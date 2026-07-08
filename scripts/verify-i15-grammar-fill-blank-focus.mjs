#!/usr/bin/env node
/**
 * verify-i15-grammar-fill-blank-focus.mjs
 *
 * Covers I15 — grammar-fill in-passage blank focus + retire the rail.
 *
 *  Step 1 — prop + rail suppression:
 *    - shared/papersurface/types.d.ts declares blankFocusMode (PA MF-2)
 *    - PaperSurface destructures blankFocusMode default 'rail'
 *    - rail (PaperSurfaceQuestionList) is gated by `!blankFocus` (both the
 *      section list and the global list)
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
assert('Step 1: PaperSurface destructures blankFocusMode default rail',
  /blankFocusMode\s*=\s*'rail'/.test(psSrc))
// Rail suppressed when blankFocus is set (both list sites gated by !blankFocus).
const railGuards = (psSrc.match(/&&\s*!blankFocus\s*&&/g) || []).length
assert('Step 1: both rail render sites gated by !blankFocus', railGuards >= 2,
  `found ${railGuards} !blankFocus guards`)

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
// PaperSurface.tsx now only imports it.
const blankPatternSrc = readSrc('shared/papersurface/blankPattern.mjs')
assert('Step 2: PaperSurface.tsx imports paperBlankPattern from shared/papersurface/blankPattern.mjs',
  /import\s*\{\s*paperBlankPattern\s*\}\s*from\s*['"][./]*shared\/papersurface\/blankPattern\.mjs['"]/.test(psSrc))
assert('Step 2: paperBlankPattern literal unchanged (regression guard)',
  blankPatternSrc.includes('export const paperBlankPattern = /(?:_{2,}|[\\u0020\\u00A0]{2,})\\s*(\\d{1,3})\\s*(?:_{2,}|[\\u0020\\u00A0]{2,})/g'))

// In-passage blank renders a wired <button>; unmatched → non-interactive span (SW-2).
assert('Step 2: in-passage blank is a <button> with aria-label 聚焦第',
  psSrc.includes('aria-label={`聚焦第 ${blankNo} 题`}') && psSrc.includes('onClick={() => blankFocus.onQuestionClick(questionId)}'))
assert('Step 2: button active state from lectureFocus via activeQuestionId (SW-3)',
  psSrc.includes('blankFocus.activeQuestionId === questionId') && psSrc.includes('aria-pressed={isActive}'))
assert('Step 2 SW-2: unmatched blank → non-interactive span (no dead button)',
  psSrc.includes("className=\"ps-paper-blank-text\""))
// 'rail' path: renderer falls through to the historical span path (zero new behavior).
assert('Step 2: rail path falls through when blankFocus null',
  /if \(blankFocus\)\s*\{\s*return renderTextWithGrammarFillBlanks/.test(psSrc))

// ============================================================
// Step 3 — harness wiring (source)
// ============================================================

const HARNESS = 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx'
const hSrc = readSrc(HARNESS)
assert('Step 3: harness passes blankFocusMode in-passage iff grammarFillAnalysisModel',
  hSrc.includes("blankFocusMode={grammarFillAnalysisModel ? 'in-passage' : 'rail'}"))

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
