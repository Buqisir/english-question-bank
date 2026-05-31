#!/usr/bin/env node
/**
 * verify-i10-blank-rendering.mjs
 *
 * Verifier for I10 — Blank Rendering (渲染格式 cut · 第一刀「空格渲染」).
 *
 * Asserts:
 *  1. Renamed symbols present in PaperSurface.tsx, PaperSurface.css, tokens files.
 *  2. Old (family-specific) names absent across all three files.
 *  3. paperBlankPattern extracted from source and tested behaviorally:
 *     - MUST match: cloze __41__, 七选五 _____36_____, grammar-fill 2-space variants.
 *     - MUST NOT match: prose numbers, __word__, 4-digit years.
 *     - MF-3 ACCEPTED false-match: "She scored  9  out of 10." DOES match (documented).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

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

function readSrc(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

const tsxSrc = readSrc('app/src/shared-ui/papersurface/PaperSurface.tsx')
const cssSrc = readSrc('app/src/shared-ui/papersurface/PaperSurface.css')
const tokensMjsSrc = readSrc('shared/papersurface/tokens.mjs')
const tokensDtsSrc = readSrc('shared/papersurface/tokens.d.ts')
const tokensDmtsSrc = readSrc('shared/papersurface/tokens.d.mts')

/* ─── 1. Renamed symbols present ──────────────────────────────────── */

console.log('\nTest 1: Renamed symbols present')

assert(
  'PaperSurface.tsx contains paperBlankPattern',
  tsxSrc.includes('paperBlankPattern'),
  'paperBlankPattern not found in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx contains renderTextWithPaperBlanks',
  tsxSrc.includes('renderTextWithPaperBlanks'),
  'renderTextWithPaperBlanks not found in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx injects --ps-paper-blank-width token',
  tsxSrc.includes('--ps-paper-blank-width'),
  '--ps-paper-blank-width not found in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx uses ps-paper-blank className',
  tsxSrc.includes('ps-paper-blank'),
  'ps-paper-blank className not found in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx references paperBlankWidth token',
  tsxSrc.includes('paperBlankWidth'),
  'paperBlankWidth not found in PaperSurface.tsx',
)
assert(
  'PaperSurface.css defines .ps-paper-blank rule',
  cssSrc.includes('.ps-paper-blank'),
  '.ps-paper-blank not found in PaperSurface.css',
)
assert(
  'PaperSurface.css uses var(--ps-paper-blank-width)',
  cssSrc.includes('var(--ps-paper-blank-width)'),
  'var(--ps-paper-blank-width) not found in PaperSurface.css',
)
assert(
  'tokens.mjs defines paperBlankWidth',
  /paperBlankWidth:\s*['"]72px['"]/.test(tokensMjsSrc),
  'paperBlankWidth: "72px" not found in tokens.mjs',
)
assert(
  'tokens.d.ts declares readonly paperBlankWidth: string',
  /readonly\s+paperBlankWidth:\s*string/.test(tokensDtsSrc),
  'paperBlankWidth declaration missing from tokens.d.ts',
)
assert(
  'tokens.d.mts declares readonly paperBlankWidth: string',
  /readonly\s+paperBlankWidth:\s*string/.test(tokensDmtsSrc),
  'paperBlankWidth declaration missing from tokens.d.mts',
)

/* ─── 2. Old names absent ──────────────────────────────────────────── */

console.log('\nTest 2: Old (family-specific) names absent')

assert(
  'PaperSurface.tsx: sevenChoicesBlankPattern absent',
  !tsxSrc.includes('sevenChoicesBlankPattern'),
  'sevenChoicesBlankPattern still present in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx: renderTextWithSevenChoicesBlanks absent',
  !tsxSrc.includes('renderTextWithSevenChoicesBlanks'),
  'renderTextWithSevenChoicesBlanks still present in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx: --ps-seven-choice-blank-width absent',
  !tsxSrc.includes('--ps-seven-choice-blank-width'),
  '--ps-seven-choice-blank-width still present in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx: ps-seven-choice-blank className absent',
  !tsxSrc.includes('ps-seven-choice-blank'),
  'ps-seven-choice-blank still present in PaperSurface.tsx',
)
assert(
  'PaperSurface.tsx: sevenChoiceBlankWidth absent',
  !tsxSrc.includes('sevenChoiceBlankWidth'),
  'sevenChoiceBlankWidth still present in PaperSurface.tsx',
)
assert(
  'PaperSurface.css: ps-seven-choice-blank absent',
  !cssSrc.includes('ps-seven-choice-blank'),
  'ps-seven-choice-blank still present in PaperSurface.css',
)
assert(
  'PaperSurface.css: --ps-seven-choice-blank-width absent',
  !cssSrc.includes('--ps-seven-choice-blank-width'),
  '--ps-seven-choice-blank-width still present in PaperSurface.css',
)
assert(
  'tokens.mjs: sevenChoiceBlankWidth absent',
  !tokensMjsSrc.includes('sevenChoiceBlankWidth'),
  'sevenChoiceBlankWidth still present in tokens.mjs',
)
assert(
  'tokens.d.ts: sevenChoiceBlankWidth absent',
  !tokensDtsSrc.includes('sevenChoiceBlankWidth'),
  'sevenChoiceBlankWidth still present in tokens.d.ts',
)
assert(
  'tokens.d.mts: sevenChoiceBlankWidth absent',
  !tokensDmtsSrc.includes('sevenChoiceBlankWidth'),
  'sevenChoiceBlankWidth still present in tokens.d.mts',
)

/* ─── 3. Extract and behaviorally test paperBlankPattern ─────────── */

console.log('\nTest 3: paperBlankPattern behavioral tests')

// SW-1: anchor extraction to "paperBlankPattern =" and fail loudly if not found.
const patternMatch = tsxSrc.match(/const\s+paperBlankPattern\s*=\s*(\/(?:[^/\\]|\\.)*\/g)/)
assert(
  'paperBlankPattern literal found in source (SW-1 extraction anchor)',
  patternMatch !== null,
  'Could not find "const paperBlankPattern = /.../" in PaperSurface.tsx — extraction failed',
)

if (!patternMatch) {
  console.error('\nFATAL: pattern extraction failed — cannot run behavioral tests')
  process.exit(1)
}

// Reconstruct the RegExp from the ACTUAL extracted source literal (MF-CR-1).
// Behavioral tests below MUST run against the real PaperSurface.tsx pattern, not a
// hardcoded copy -- otherwise a source regression (e.g. \\d{1,3} -> \\d{1,4}) would
// pass green. The literal is "/<body>/<flags>"; the \\u0020 / \\u00A0 escape text in
// the source string is interpreted by the RegExp constructor exactly as in the .tsx.
const extractedLiteral = patternMatch[1]
const lastSlash = extractedLiteral.lastIndexOf('/')
const patternBody = extractedLiteral.slice(1, lastSlash)
const patternFlags = extractedLiteral.slice(lastSlash + 1)
const pattern = new RegExp(patternBody, patternFlags)

// Cross-check: the extracted literal contains the key structural tokens.
assert(
  'Extracted literal contains _{2,} (underscore branch, I10 relaxed)',
  extractedLiteral.includes('_{2,}'),
  `Expected _{2,} in pattern, got: ${extractedLiteral}`,
)
assert(
  'Extracted literal contains \\u0020 (regular space, I10 space branch)',
  extractedLiteral.includes('\\u0020'),
  `Expected \\u0020 in pattern literal, got: ${extractedLiteral}`,
)
assert(
  'Extracted literal contains \\u00A0 (nbsp, I10 space branch)',
  extractedLiteral.includes('\\u00A0'),
  `Expected \\u00A0 in pattern literal, got: ${extractedLiteral}`,
)

function matchesFull(re, input) {
  re.lastIndex = 0
  return re.test(input)
}

function capturedGroup(re, input) {
  re.lastIndex = 0
  const m = re.exec(input)
  return m ? m[1] : null
}

// MUST match cases
assert(
  'MUST match: cloze __41__ (2 underscores each side)',
  matchesFull(pattern, '__41__'),
  '__41__ should match paperBlankPattern',
)
assert(
  'MUST match: cloze __41__ captures bare number "41"',
  capturedGroup(pattern, '__41__') === '41',
  'Captured group should be "41"',
)
assert(
  'MUST match: 七选五 _____36_____ (5 underscores each side)',
  matchesFull(pattern, '_____36_____'),
  '_____36_____ should match paperBlankPattern',
)
assert(
  'MUST match: grammar-fill 2-regular-space  56  (2 spaces each side)',
  matchesFull(pattern, '  56  '),
  '  56  (2 regular spaces) should match paperBlankPattern',
)
assert(
  'MUST match: grammar-fill 2-regular-space  56  captures bare number "56"',
  capturedGroup(pattern, '  56  ') === '56',
  'Captured group should be "56"',
)
assert(
  'MUST match: grammar-fill with trailing prompt "  56  (keep)"',
  matchesFull(pattern, '  56  (keep)'),
  '  56  (keep) should match; prompt is outside the capture',
)
assert(
  'MUST match: grammar-fill nbsp variant (U+00A0 each side)',
  matchesFull(pattern, '  56  '),
  'nbsp-delimited 56 should match paperBlankPattern',
)
assert(
  'MUST match: 3-digit blank __100__',
  matchesFull(pattern, '__100__'),
  '__100__ should match paperBlankPattern',
)

// MUST NOT match (guard cases)
assert(
  'MUST NOT match: single-space "from 5 to"',
  !matchesFull(pattern, 'from 5 to'),
  '"from 5 to" must not match (single space each side)',
)
assert(
  'MUST NOT match: single-space "page 12 of"',
  !matchesFull(pattern, 'page 12 of'),
  '"page 12 of" must not match',
)
assert(
  'MUST NOT match: "In 1998 the" (4-digit, exceeds \\d{1,3})',
  !matchesFull(pattern, 'In 1998 the'),
  '"In 1998 the" must not match — 4-digit number exceeds \\d{1,3}',
)
assert(
  'MUST NOT match: delimited 4-digit "  2020  " (REGRESSION SENTINEL for \\d{1,3}->\\d{1,4})',
  !matchesFull(pattern, '\u0020\u00202020\u0020\u0020'),
  'A 4-digit number BETWEEN double-space delimiters must NOT match under \\d{1,3}; '
    + 'if this matches, the source digit-count floor was widened (e.g. to \\d{1,4}).',
)
assert(
  'MUST NOT match: delimited 4-digit "__2020__" (REGRESSION SENTINEL for \\d{1,3}->\\d{1,4})',
  !matchesFull(pattern, '__2020__'),
  '4-digit between underscore delimiters must NOT match under \\d{1,3}.',
)
assert(
  'MUST NOT match: __word__ (no digit)',
  !matchesFull(pattern, '__word__'),
  '__word__ must not match — no digit group',
)
assert(
  'MUST NOT match: the year 2020 (4-digit, no delimiter)',
  !matchesFull(pattern, 'the year 2020'),
  '"the year 2020" must not match',
)

// MF-3: DOCUMENTED ACCEPTED false-match (owner decision 2026-05-31).
// "She scored  9  out of 10." has double spaces around "9" from prose
// formatting. The owner accepted \d{1,3} as-is; this verifier RECORDS
// that behavior so it is not hidden.
assert(
  'MF-3 ACCEPTED false-match: "She scored  9  out of 10." DOES match (documented owner decision 2026-05-31)',
  matchesFull(pattern, 'She scored  9  out of 10.'),
  'Expected this to match as the documented accepted false-match — if it stopped matching, re-evaluate MF-3',
)

/* ─── Summary ───────────────────────────────────────────────────────── */

console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
