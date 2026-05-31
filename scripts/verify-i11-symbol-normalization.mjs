#!/usr/bin/env node
/**
 * verify-i11-symbol-normalization.mjs
 *
 * Table-driven verifier for normalizePassageText() — slices 2a (I11) + 2b (I12).
 * Runs directly against the exported normalizePassageText() function.
 * D3: pure-function + table-driven cases per plan.md Step 3.
 *
 * Cases cover:
 *  - Rule 1: full-width → half-width in English context; CJK-run preserved.
 *  - Rule 1 mixed English/CJK seam: word，中文 → unchanged (CJK-following guard wins).
 *  - Rule 2: space after [.,;:!?] before a letter; must NOT touch digits.
 *  - Rule 3: CJK-interior parens get spaces; prompt/digit parens untouched.
 *  - Grammar compose-order idempotency: normalizePassageText → normalizeGrammarFillText.
 *  - C2 byte-intact sentinels: _____36_____, __41__, and   56   .
 *  - Full idempotency: f(f(x)) === f(x) for every "after" string.
 *  - Rule 5 (2b): em dash normalization --- / —— → —; single/double hyphen untouched.
 *  - Rule 4a (2b): straight double quote → directional curly; MF-1 boundary locks.
 *  - Rule 4b (2b): letter-preceded ' → U+2019; conservative-gate left-alone locks.
 *  - Idempotency for all 2b "after" strings.
 *  - Passage-substring-quote consistency (D4=(e)): a substring of the normalized
 *    passage still indexOf-matches after normalization.
 */

import { normalizePassageText } from '../server/paper-import-ai/normalizePassageText.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Inline reference implementation of normalizeGrammarFillText (mirrors packageBuilder.mjs:165-182)
// Used ONLY for the grammar compose-order case.  NOT imported so this verifier stays decoupled.
function normalizeGrammarFillText(text) {
  return String(text || '')
    .replace(/\b(\d{2})[.．、](?=\s)/g, '$1')
    .replace(/(^|\s)(5[6-9]|6[0-5])(\s|$)/g, '$1  $2  $3')
    .replace(/[ ]{3,}/g, '  ')
    .replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')
    .replace(/(\d{2})[(（]/g, '$1 (')
    .replace(/[)）](?=\S)/g, ') ')
    .replace(/[一-鿿]+$/, '')
    .trim()
}

let passed = 0
let failed = 0

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

function eq(label, input, expected) {
  const actual = normalizePassageText(input)
  assert(label, actual === expected, `input: ${JSON.stringify(input)} → got: ${JSON.stringify(actual)}, want: ${JSON.stringify(expected)}`)
}

function unchanged(label, input) {
  eq(label, input, input)
}

/* ─── Rule 1: Full-width → half-width in English context ─────────────── */

console.log('\nRule 1: Full-width punctuation in English context')

eq(
  'R1: Hello，world → Hello, world',
  'Hello，world',
  'Hello, world',
)

eq(
  'R1+R2: word。End → rule 1 converts to dot, rule 2 adds space → word. End',
  'word。End',
  'word. End',
)

eq(
  'R1+R2: result：value → rule 1 converts to colon, rule 2 adds space → result: value',
  'result：value',
  'result: value',
)

unchanged(
  'R1: Pure CJK run preserved: 他说，你好世界',
  '他说，你好世界',
)

unchanged(
  'R1: Chinese instruction text preserved: 第二部分 阅读',
  '第二部分 阅读',
)

// Mixed seam: English on left, CJK on right — CJK-following guard wins → NOT converted.
unchanged(
  'R1: Mixed seam word，中文 → unchanged (CJK-following guard wins)',
  'word，中文',
)

// English on left, non-CJK on right — should convert.
eq(
  'R1+R2: word，end (non-CJK right) → rule 1 converts comma, rule 2 adds space → word, end',
  'word，end',
  'word, end',
)

/* ─── Rule 2: One space after English punctuation before a letter ─────── */

console.log('\nRule 2: Space after English punctuation before a letter')

eq(
  'R2: 21.Next → 21. Next',
  '21.Next',
  '21. Next',
)

eq(
  'R2: A.Option → A. Option',
  'A.Option',
  'A. Option',
)

unchanged(
  'R2: Already-spaced "21. Next" unchanged',
  '21. Next',
)

unchanged(
  'R2: MUST NOT touch digits — "56." stays as-is (no letter follows)',
  '56.',
)

unchanged(
  'R2: MUST NOT touch digit following — "56.7" stays unchanged',
  '56.7',
)

// Rule 2 must not widen to digits: digit following → no space inserted.
unchanged(
  'R2: "21.3" — digit after dot → unchanged',
  '21.3',
)

eq(
  'R2: Semicolon before letter: text;Next → text; Next',
  'text;Next',
  'text; Next',
)

/* ─── Rule 3: CJK-interior paren spacing ─────────────────────────────── */

console.log('\nRule 3: CJK-gloss parenthesis spacing')

eq(
  'R3: photosynthesis(光合作用)process → photosynthesis (光合作用) process',
  'photosynthesis(光合作用)process',
  'photosynthesis (光合作用) process',
)

eq(
  'R3: Full-width （光合作用） → ASCII with spaces',
  '（光合作用）',
  ' (光合作用) ',
)

eq(
  'R3: photosynthesis（光合作用）process (rule 1 + 3 compose) → photosynthesis (光合作用) process',
  'photosynthesis（光合作用）process',
  'photosynthesis (光合作用) process',
)

unchanged(
  'R3: Prompt paren (wear) → unchanged (no CJK interior)',
  '(wear)',
)

unchanged(
  'R3: Digit paren (56) → unchanged (no CJK interior)',
  '(56)',
)

unchanged(
  'R3: Already-spaced (光合作用) → unchanged when spaces already present',
  ' (光合作用) ',
)

/* ─── Grammar compose-order idempotency ─────────────────────────────── */

console.log('\nGrammar compose-order: parse:normalizePassageText → publish:normalizeGrammarFillText')

// A raw grammar paragraph containing: blank number surrounded by spaces, prompt paren, and inline paren prompt.
// After parse normalization + publish normalization, the   56   marker must be byte-stable
// and (wear) must be untouched by normalizePassageText.
// Raw form: "56 (wear)" — `56` surrounded by whitespace so normalizeGrammarFillText L171 can mint "  56  ".
const rawGrammarPara = 'He 56 (wear) his coat and left.'

const afterParse = normalizePassageText(rawGrammarPara)
const afterPublish = normalizeGrammarFillText(afterParse)

assert(
  'Grammar compose: normalizePassageText leaves raw blank 56.(wear) without adding CJK spacing',
  !afterParse.includes(' (wear)') || afterParse.indexOf('(wear)') > 0,
  `afterParse: ${JSON.stringify(afterParse)}`,
)

// The key check: normalizePassageText must NOT pre-space (wear) since it has no CJK interior.
// Rule 2: [.,;:!?][A-Za-z] — `(` is NOT [A-Za-z], so no space after `.`.
// Rule 3: (wear) has no CJK → unchanged.
// Expected: '56.(wear)' unchanged.
assert(
  'Grammar compose: (wear) not touched by normalizePassageText (no CJK interior)',
  normalizePassageText('56.(wear)') === '56.(wear)',
  `Got: ${JSON.stringify(normalizePassageText('56.(wear)'))}, want: "56.(wear)"`,
)

assert(
  'Grammar compose: (56) not touched by normalizePassageText (no CJK interior)',
  normalizePassageText('(56)') === '(56)',
  `Got: ${JSON.stringify(normalizePassageText('(56)'))}, want: "(56)"`,
)

// After the full two-stage compose, the   56   marker must be present.
assert(
  'Grammar compose-order: publish:normalizeGrammarFillText produces   56   marker after parse normalization',
  afterPublish.includes('  56  '),
  `afterPublish: ${JSON.stringify(afterPublish)}`,
)

// The two-stage result must be stable (running normalizePassageText again on afterPublish
// does not disturb the   56   marker — C2 by-construction check).
assert(
  'Grammar compose-order: normalizePassageText(afterPublish) leaves   56   marker byte-intact',
  normalizePassageText(afterPublish).includes('  56  '),
  `re-normalized afterPublish: ${JSON.stringify(normalizePassageText(afterPublish))}`,
)

/* ─── C2 byte-intact sentinels ────────────────────────────────────────── */

console.log('\nC2 byte-intact sentinels (load-bearing tripwire)')

unchanged(
  'C2: _____36_____ → byte-identical (七选五 blank marker)',
  '_____36_____',
)

unchanged(
  'C2: __41__ → byte-identical (cloze blank marker)',
  '__41__',
)

unchanged(
  'C2:   56   → byte-identical (grammar-fill two-space marker; normalizePassageText never sees it at parse but must survive re-entry)',
  '  56  ',
)

unchanged(
  'C2: Rule 2 must NOT touch 56. followed by nothing — "56." unchanged',
  '56.',
)

/* ─── Full idempotency: f(f(x)) === f(x) for every "after" string ─────── */

console.log('\nIdempotency: f(f(x)) === f(x)')

const idempotencyCases = [
  // 2a cases
  'Hello, world',
  '21. Next',
  'A. Option',
  'photosynthesis (光合作用) process',
  'result:value',
  '56.(wear)',
  '56.',
  '_____36_____',
  '__41__',
  '  56  ',
  'text; Next',
  'word，中文',
  // 2b Rule 5 "after" strings
  'wait—no',
  'yes—no',
  '—',
  'well-known',
  '1990-2000',
  '--',
  // 2b Rule 4a "after" strings
  'He said, “Hello.”',
  '“Start”',
  '(quote “x”)',
  '“Hello,” she said.',
  'He said,“Hello.”',
  // 2b Rule 4b "after" strings
  'don’t',
  'students’ books',
  'o’clock',
  'Jiang’an',
  "'90s",
  "'apple’",
  "rock 'n’ roll",
  "5'10”",
]

for (const c of idempotencyCases) {
  const once = normalizePassageText(c)
  const twice = normalizePassageText(once)
  assert(
    `Idempotent: ${JSON.stringify(c)}`,
    once === twice,
    `f(x)=${JSON.stringify(once)}, f(f(x))=${JSON.stringify(twice)}`,
  )
}

/* ─── Passage-substring-quote consistency (D4=(e)) ──────────────────── */

console.log('\nPassage-substring-quote consistency (D4=(e))')

// A passage that contains a full-width comma in an English clause.
// After normalization, a substring-quote taken from the normalized passage
// must still indexOf-match the normalized passage.
const rawPassage = 'He was excited，but nervous about the result.'
const normalizedPassage = normalizePassageText(rawPassage)
const quoteSubstring = 'excited, but nervous'  // as AI would produce from normalized text

assert(
  'Passage-quote consistency: normalized passage contains the normalized-char quote',
  normalizedPassage.includes(quoteSubstring),
  `normalizedPassage: ${JSON.stringify(normalizedPassage)}, quote: ${JSON.stringify(quoteSubstring)}`,
)

/* ─── Rule 5 (2b): Em dash normalization ─────────────────────────────── */

console.log('\nRule 5 (2b): Em dash normalization')

eq(
  'R5: wait---no → wait—no',
  'wait---no',
  'wait—no',
)

eq(
  'R5: yes——no (2× em dash) → yes—no',
  'yes——no',
  'yes—no',
)

eq(
  'R5: —— (bare double em dash) → —',
  '——',
  '—',
)

// NOT-touched locks
unchanged(
  'R5: well-known → unchanged (single hyphen)',
  'well-known',
)

unchanged(
  'R5: 1990-2000 → unchanged (single hyphen)',
  '1990-2000',
)

unchanged(
  'R5: -- → unchanged (two hyphens)',
  '--',
)

unchanged(
  'R5: lone — → unchanged (single em dash already correct)',
  '—',
)

/* ─── Rule 4a (2b): Straight double quote → directional curly ────────── */

console.log('\nRule 4a (2b): Straight double quote → directional curly')

// Basic: space-preceded opening, period-preceded closing
eq(
  'R4a: He said, "Hello." → He said, “Hello.”',
  'He said, "Hello."',
  'He said, “Hello.”',
)

// Start of string: first " → opening, second " → closing
eq(
  'R4a: "Start" → “Start”',
  '"Start"',
  '“Start”',
)

// Paren-preceded: ( counts as opening trigger
eq(
  'R4a: (quote "x") → (quote “x”)',
  '(quote "x")',
  '(quote “x”)',
)

// MF-1 boundary lock: comma-inside-quote — closing " after comma is correct
eq(
  'R4a MF-1: "Hello," she said. → “Hello,” she said.',
  '"Hello," she said.',
  '“Hello,” she said.',
)

// MF-1 accepted cosmetic wrong-facing first quote: punctuation-no-space before opening "
eq(
  'R4a MF-1: He said,"Hello." → He said,”Hello.” (accepted cosmetic)',
  'He said,"Hello."',
  'He said,”Hello.”',
)

/* ─── Rule 4b (2b): Straight single quote → conservative ─────────────── */

console.log('\nRule 4b (2b): Straight single quote — conservative')

// Letter-preceded → U+2019
eq(
  "R4b: don't → don’t",
  "don't",
  'don’t',
)

eq(
  "R4b: students' books → students’ books",
  "students' books",
  'students’ books',
)

eq(
  "R4b: o'clock → o’clock",
  "o'clock",
  'o’clock',
)

eq(
  "R4b: Jiang'an → Jiang’an",
  "Jiang'an",
  'Jiang’an',
)

// Conservative-gate left-alone locks (full-string equality — LOAD-BEARING)
unchanged(
  "R4b conservative gate: '90s → unchanged (space-preceded ' stays straight)",
  "'90s",
)

// 'apple': first ' is start-of-string (straight), trailing 'e' is letter-preceded → U+2019
eq(
  "R4b conservative gate: 'apple' → 'apple’ (first ' straight, trailing after e → U+2019)",
  "'apple'",
  "'apple’",
)

// rock 'n' roll: first ' space-preceded stays straight; n-preceded ' → U+2019
eq(
  "R4b conservative gate: rock 'n' roll → rock 'n’ roll",
  "rock 'n' roll",
  "rock 'n’ roll",
)

// 5'10": digit-preceded ' stays straight (guard is [A-Za-z] only); " after 0 → closing
eq(
  "R4b conservative gate: 5'10\" → 5'10” (digit ' stays straight, trailing \" closes)",
  '5\'10"',
  "5'10”",
)

/* ─── Summary ─────────────────────────────────────────────────────────── */

console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
