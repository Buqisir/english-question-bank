#!/usr/bin/env node
/**
 * Verification: Reading Analysis route helpers (Cut 3).
 *
 * Scope: only the pure module
 *   app/src/features/reading-analysis/readingAnalysisRoute.ts
 * — no React, no jsdom, no Playwright. Node 24's TS-stripping handles the
 * `.ts` import directly (matches the pattern used by the existing
 * verify-reading-analysis-{selector,linking}.mjs scripts).
 *
 * Coverage:
 *
 *   isReadingAnalysisCandidate:
 *     - reading + questionCount > 0           → true
 *     - reading + questionCount === 0         → false
 *     - reading + questionCount missing       → false
 *     - non-reading group types               → false
 *     - null / undefined                      → false
 *
 *   buildReadingAnalysisHref:
 *     - basic groupId                          → ?view=reading-analysis&groupId=g-1
 *     - includes questionNo only when present
 *     - questionNo: number, '0', '   '         → trim/normalize / drop empty
 *     - groupId with special chars             → URL-encoded once
 *     - never references ?demo=reading-analysis
 *
 *   parseReadingAnalysisRoute:
 *     - empty location                         → {kind: 'app'}
 *     - ?view=reading-analysis                 → product entry, source=view-param
 *     - ?demo=reading-analysis                 → demo alias
 *     - #reading-analysis                      → demo alias
 *     - both ?view and ?demo present           → view-param wins
 *     - groupId / questionNo extraction
 *     - whitespace-only groupId/questionNo     → null
 *
 * Run: node scripts/verify-reading-analysis-route.mjs
 * Exit: 0 on all-pass, 1 otherwise.
 */

import path from 'node:path'

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}: ${detail || 'failed'}`)
  }
}

function assertEqual(name, actual, expected) {
  const ok = actual === expected
  assert(
    name,
    ok,
    ok
      ? ''
      : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

function assertDeepEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  assert(name, a === e, a === e ? '' : `expected ${e}, got ${a}`)
}

const here = path.dirname(new URL(import.meta.url).pathname)
const modulePath = path.resolve(
  here,
  '..',
  'app',
  'src',
  'features',
  'reading-analysis',
  'readingAnalysisRoute.ts',
)

const route = await import(modulePath)
const {
  isReadingAnalysisCandidate,
  buildReadingAnalysisHref,
  parseReadingAnalysisRoute,
} = route

console.log('=== Reading Analysis route verification (Cut 3) ===\n')

/* ─────────────────── isReadingAnalysisCandidate ──────────────────────── */

console.log('-- isReadingAnalysisCandidate --')
assertEqual(
  "reading + questionCount > 0 → true",
  isReadingAnalysisCandidate({ groupType: 'reading', questionCount: 4 }),
  true,
)
assertEqual(
  "reading + questionCount === 0 → false",
  isReadingAnalysisCandidate({ groupType: 'reading', questionCount: 0 }),
  false,
)
assertEqual(
  "reading + questionCount === 1 → true (boundary)",
  isReadingAnalysisCandidate({ groupType: 'reading', questionCount: 1 }),
  true,
)
assertEqual(
  "reading + questionCount missing → false",
  isReadingAnalysisCandidate({ groupType: 'reading' }),
  false,
)
assertEqual(
  "reading + questionCount === NaN → false",
  isReadingAnalysisCandidate({ groupType: 'reading', questionCount: Number.NaN }),
  false,
)
for (const wrongType of ['cloze', 'seven_choices', 'grammar_cloze', 'writing', '']) {
  assertEqual(
    `groupType "${wrongType}" → false`,
    isReadingAnalysisCandidate({ groupType: wrongType, questionCount: 4 }),
    false,
  )
}
assertEqual('null group → false', isReadingAnalysisCandidate(null), false)
assertEqual('undefined group → false', isReadingAnalysisCandidate(undefined), false)

/* ─────────────────── buildReadingAnalysisHref ────────────────────────── */

console.log('\n-- buildReadingAnalysisHref --')

{
  const href = buildReadingAnalysisHref({ groupId: 'g-1' })
  assertEqual(
    'basic: ?view=reading-analysis&groupId=g-1',
    href,
    '?view=reading-analysis&groupId=g-1',
  )
  // The product entry must NEVER mention the demo alias.
  assert(
    'href never references demo=reading-analysis',
    !href.includes('demo='),
    href,
  )
}

assertEqual(
  'includes questionNo only when present (string)',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: '2' }),
  '?view=reading-analysis&groupId=g-1&questionNo=2',
)
assertEqual(
  'includes questionNo only when present (number)',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: 3 }),
  '?view=reading-analysis&groupId=g-1&questionNo=3',
)
assertEqual(
  'questionNo === null → omitted',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: null }),
  '?view=reading-analysis&groupId=g-1',
)
assertEqual(
  'questionNo === undefined → omitted',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: undefined }),
  '?view=reading-analysis&groupId=g-1',
)
assertEqual(
  'questionNo === "" → omitted',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: '' }),
  '?view=reading-analysis&groupId=g-1',
)
assertEqual(
  'questionNo === "   " → omitted (whitespace only)',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: '   ' }),
  '?view=reading-analysis&groupId=g-1',
)
assertEqual(
  'questionNo === 0 → kept (legitimate value, e.g. zero-indexed)',
  buildReadingAnalysisHref({ groupId: 'g-1', questionNo: 0 }),
  '?view=reading-analysis&groupId=g-1&questionNo=0',
)
assertEqual(
  'groupId with spaces → URL-encoded',
  buildReadingAnalysisHref({ groupId: 'group with space' }),
  '?view=reading-analysis&groupId=group+with+space',
)
assertEqual(
  'groupId with CJK + slash → URL-encoded',
  buildReadingAnalysisHref({ groupId: '阅读/A' }),
  '?view=reading-analysis&groupId=%E9%98%85%E8%AF%BB%2FA',
)

/* ─────────────────── parseReadingAnalysisRoute ───────────────────────── */

console.log('\n-- parseReadingAnalysisRoute --')

assertDeepEqual(
  'empty location → app',
  parseReadingAnalysisRoute({ search: '', hash: '' }),
  { kind: 'app' },
)

assertDeepEqual(
  '?view=reading-analysis (no group) → product entry',
  parseReadingAnalysisRoute({ search: '?view=reading-analysis', hash: '' }),
  {
    kind: 'reading-analysis',
    source: 'view-param',
    groupId: null,
    questionNo: null,
  },
)

assertDeepEqual(
  '?view=reading-analysis&groupId=g-7 → product entry with groupId',
  parseReadingAnalysisRoute({
    search: '?view=reading-analysis&groupId=g-7',
    hash: '',
  }),
  {
    kind: 'reading-analysis',
    source: 'view-param',
    groupId: 'g-7',
    questionNo: null,
  },
)

assertDeepEqual(
  '?view=reading-analysis&groupId=g-7&questionNo=3 → groupId + questionNo',
  parseReadingAnalysisRoute({
    search: '?view=reading-analysis&groupId=g-7&questionNo=3',
    hash: '',
  }),
  {
    kind: 'reading-analysis',
    source: 'view-param',
    groupId: 'g-7',
    questionNo: '3',
  },
)

assertDeepEqual(
  '?demo=reading-analysis → demo alias',
  parseReadingAnalysisRoute({ search: '?demo=reading-analysis', hash: '' }),
  {
    kind: 'reading-analysis',
    source: 'demo-alias',
    groupId: null,
    questionNo: null,
  },
)

assertDeepEqual(
  '#reading-analysis → demo alias',
  parseReadingAnalysisRoute({ search: '', hash: '#reading-analysis' }),
  {
    kind: 'reading-analysis',
    source: 'demo-alias',
    groupId: null,
    questionNo: null,
  },
)

// Both ?view= and ?demo= present → view-param wins (product takes precedence).
assertDeepEqual(
  'both view + demo → view-param wins',
  parseReadingAnalysisRoute({
    search: '?view=reading-analysis&demo=reading-analysis&groupId=g-9',
    hash: '',
  }),
  {
    kind: 'reading-analysis',
    source: 'view-param',
    groupId: 'g-9',
    questionNo: null,
  },
)

// ?view= with arbitrary other value should NOT activate.
assertDeepEqual(
  '?view=settings → app (no activation)',
  parseReadingAnalysisRoute({ search: '?view=settings', hash: '' }),
  { kind: 'app' },
)

// Whitespace-only groupId / questionNo → null (we never want to fetch "").
assertDeepEqual(
  'whitespace-only groupId/questionNo → null',
  parseReadingAnalysisRoute({
    search: '?view=reading-analysis&groupId=%20%20&questionNo=%20',
    hash: '',
  }),
  {
    kind: 'reading-analysis',
    source: 'view-param',
    groupId: null,
    questionNo: null,
  },
)

// Round-trip: build → parse must yield the same activation source/groupId.
{
  const href = buildReadingAnalysisHref({ groupId: 'g-42', questionNo: '5' })
  // href is "?view=reading-analysis&groupId=g-42&questionNo=5"
  const parsed = parseReadingAnalysisRoute({ search: href, hash: '' })
  assertEqual('round-trip: kind', parsed.kind, 'reading-analysis')
  if (parsed.kind === 'reading-analysis') {
    assertEqual('round-trip: source = view-param', parsed.source, 'view-param')
    assertEqual('round-trip: groupId', parsed.groupId, 'g-42')
    assertEqual('round-trip: questionNo', parsed.questionNo, '5')
  }
}

// Round-trip with encoded groupId.
{
  const href = buildReadingAnalysisHref({ groupId: '阅读/A' })
  const parsed = parseReadingAnalysisRoute({ search: href, hash: '' })
  if (parsed.kind === 'reading-analysis') {
    assertEqual('round-trip CJK: groupId decoded', parsed.groupId, '阅读/A')
  } else {
    assert('round-trip CJK: parsed as reading-analysis', false, JSON.stringify(parsed))
  }
}

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
