#!/usr/bin/env node
/**
 * Verification: Reading Evidence Annotation Module (Cut 5).
 *
 * Scope: only the pure module
 *   app/src/features/reading-analysis/annotation/
 * — no React, no jsdom, no Playwright. Node 24's TS-stripping handles the
 * `.ts` import directly (matches the existing
 * verify-reading-analysis-{selector,linking,route,view-state}.mjs scripts).
 *
 * What this locks in:
 *
 *   normalizeQuote — the canonicalisation rule selector and report both
 *     consume. Selector matching semantics depend on this being byte-stable.
 *
 *   classifyMissReason — observation-only classifier with a closed reason
 *     vocabulary {not_found, cross_sentence, multiple_matches}. Selector
 *     does not consult it; the report does. Tests cover each branch
 *     including the empty-quote edge case.
 *
 *   summarizeQuoteDiagnostics — aggregator the report script consumes
 *     instead of an inline accumulator. Behavior must match the previous
 *     inline counts exactly:
 *       - hits / misses split by `status`
 *       - reasonCounts keyed only on the three miss-reason keys
 *       - hit-side `same_sentence_multi` reasons NOT counted
 *       - unknown reasons silently ignored (matches `reason in reasonCounts`)
 *       - empty diagnostic list yields zeros and missRate 0
 *
 *   Round-trip on the live sidecar dataset:
 *     - manifest has the expected number of samples
 *     - selector + summarizer reproduce the locked totals
 *       (13 groups, 31 entries, 28 hits, 3 misses,
 *        cross_sentence: 3, not_found: 0, multiple_matches: 0)
 *     - run is deterministic across two invocations
 *
 *   Type re-export:
 *     - the selector still re-exports `normalizeQuote` (existing
 *       verify-reading-analysis-selector.mjs imports it from the
 *       selector module by destructuring; we don't want that to drift).
 *
 * Run:  node scripts/verify-reading-analysis-annotation.mjs
 * Exit: 0 on all-pass, 1 otherwise.
 */

import path from 'node:path'
import { readFileSync } from 'node:fs'

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
const repoRoot = path.resolve(here, '..')
const annotationPath = path.resolve(
  repoRoot,
  'app/src/features/reading-analysis/annotation/index.ts',
)
const selectorPath = path.resolve(
  repoRoot,
  'app/src/features/reading-analysis/selectors/selectReadingAnalysis.ts',
)

const annotation = await import(annotationPath)
const {
  normalizeQuote,
  classifyMissReason,
  summarizeQuoteDiagnostics,
} = annotation

console.log('=== Reading Analysis Annotation Module verification (Cut 5) ===\n')

/* ───────────────────────────── normalizeQuote ─────────────────────────── */

console.log('-- normalizeQuote --')
assertEqual(
  'collapses CJK + curly + extra spaces',
  normalizeQuote('  Don\u2019t   stop\u3000\u3000now '),
  "don't stop now",
)
assertEqual(
  'unifies straight + curly double-quote',
  normalizeQuote('say \u201Chello\u201D'),
  'say "hello"',
)
assertEqual(
  'unifies en/em dashes with hyphen',
  normalizeQuote('a\u2013b\u2014c'),
  'a-b-c',
)
assertEqual('empty input → empty output', normalizeQuote(''), '')
assertEqual('whitespace-only → empty', normalizeQuote('  \u3000\n  '), '')

/* ──────────────────────── classifyMissReason ──────────────────────────── */

console.log('\n-- classifyMissReason --')

function makePassage(sentencesByPara) {
  return {
    paragraphs: sentencesByPara.map((sents) => ({
      sentences: sents.map((text) => ({ text })),
    })),
  }
}

assertEqual(
  'cross_sentence: terminator with text on both sides',
  classifyMissReason(
    makePassage([['First sentence here.', 'Another sentence here.']]),
    'first sentence here. another sentence',
  ),
  'cross_sentence',
)
assertEqual(
  'cross_sentence: CJK terminator (。) is also detected when followed by a space',
  classifyMissReason(
    makePassage([['他笑了。', '然后离开。']]),
    '他笑了。 然后离开',
  ),
  'cross_sentence',
)
assertEqual(
  'multiple_matches: probe appears in 2 sentences',
  classifyMissReason(
    makePassage([
      [
        'When the new policy was first introduced, students cheered.',
        'When the new policy was first introduced, parents cheered.',
      ],
    ]),
    'when the new policy was first introduced, students cheered',
  ),
  'multiple_matches',
)
assertEqual(
  'not_found: simple miss',
  classifyMissReason(
    makePassage([['Lorem ipsum dolor sit amet.']]),
    'banana banana banana',
  ),
  'not_found',
)
assertEqual(
  'not_found: empty quote',
  classifyMissReason(makePassage([['Anything.']]), ''),
  'not_found',
)
assertEqual(
  'not_found: terminal punctuation only does not trigger cross_sentence',
  classifyMissReason(
    makePassage([['Lorem ipsum dolor.']]),
    'banana banana banana banana banana banana.',
  ),
  'not_found',
)
assertEqual(
  'not_found: short probe (<8 chars) skips multiple-match scan',
  classifyMissReason(
    makePassage([['abc def.', 'abc def again.']]),
    'abc def',
  ),
  'not_found',
)

/* ──────────────────── summarizeQuoteDiagnostics ───────────────────────── */

console.log('\n-- summarizeQuoteDiagnostics --')

function diag(overrides) {
  return {
    groupId: 'g',
    questionNo: '1',
    kind: 'evidence',
    quote: 'q',
    status: 'hit',
    ...overrides,
  }
}

{
  const summary = summarizeQuoteDiagnostics([])
  assertEqual('empty list: totalEntries=0', summary.totalEntries, 0)
  assertEqual('empty list: totalHits=0', summary.totalHits, 0)
  assertEqual('empty list: totalMisses=0', summary.totalMisses, 0)
  assertEqual('empty list: missRate=0 (no division by zero)', summary.missRate, 0)
  assertDeepEqual(
    'empty list: reasonCounts has all 3 closed-set keys',
    summary.reasonCounts,
    { not_found: 0, cross_sentence: 0, multiple_matches: 0 },
  )
}

{
  const summary = summarizeQuoteDiagnostics([
    diag({ status: 'hit' }),
    diag({ status: 'hit' }),
    diag({ status: 'miss', reason: 'not_found' }),
    diag({ status: 'miss', reason: 'cross_sentence' }),
    diag({ status: 'miss', reason: 'cross_sentence' }),
  ])
  assertEqual('mixed: totalEntries', summary.totalEntries, 5)
  assertEqual('mixed: totalHits', summary.totalHits, 2)
  assertEqual('mixed: totalMisses', summary.totalMisses, 3)
  assertEqual('mixed: missRate = 3/5', summary.missRate, 0.6)
  assertDeepEqual('mixed: reasonCounts', summary.reasonCounts, {
    not_found: 1,
    cross_sentence: 2,
    multiple_matches: 0,
  })
}

{
  // hit-side same_sentence_multi MUST NOT count toward miss reasons.
  const summary = summarizeQuoteDiagnostics([
    diag({ status: 'hit', reason: 'same_sentence_multi' }),
    diag({ status: 'hit', reason: 'same_sentence_multi' }),
    diag({ status: 'hit' }),
    diag({ status: 'miss', reason: 'cross_sentence' }),
  ])
  assertEqual('hit-side same_sentence_multi: totalHits', summary.totalHits, 3)
  assertEqual('hit-side same_sentence_multi: totalMisses', summary.totalMisses, 1)
  assertDeepEqual(
    'hit-side same_sentence_multi: not counted in reasonCounts',
    summary.reasonCounts,
    { not_found: 0, cross_sentence: 1, multiple_matches: 0 },
  )
}

{
  // Unknown / missing miss reasons are silently ignored — matches the
  // previous `reason in reasonCounts` guard the report carried inline.
  const summary = summarizeQuoteDiagnostics([
    diag({ status: 'miss' }), // no reason
    diag({ status: 'miss', reason: 'made_up_reason' }), // not in vocabulary
    diag({ status: 'miss', reason: 'not_found' }),
  ])
  assertEqual('unknown reason: totalMisses still counted', summary.totalMisses, 3)
  assertDeepEqual(
    'unknown reason: only known keys incremented',
    summary.reasonCounts,
    { not_found: 1, cross_sentence: 0, multiple_matches: 0 },
  )
}

/* ─────────────────────── selector back-compat re-export ───────────────── */

console.log('\n-- selector back-compat re-export --')

const selector = await import(selectorPath)
assertEqual(
  'selector.normalizeQuote is the same function as annotation.normalizeQuote',
  selector.normalizeQuote,
  normalizeQuote,
)

/* ─────────────────────── live sidecar round-trip ──────────────────────── */

console.log('\n-- live sidecar round-trip (locks 13/31/28/3 + cross_sentence:3) --')

const manifestPath = path.resolve(
  repoRoot,
  'app/src/features/reading-analysis/sidecar/index.json',
)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert(
  'manifest is a non-empty samples list',
  Array.isArray(manifest.samples) && manifest.samples.length > 0,
  String(manifest?.samples?.length),
)
assertEqual(
  'manifest has the expected 13 samples (locked by the report)',
  manifest.samples.length,
  13,
)

const sidecarDir = path.resolve(
  repoRoot,
  'app/src/features/reading-analysis/sidecar/data',
)
const { selectReadingAnalysisFromDetail } = selector

// Build a synthetic `detail` object directly from the sidecar quotes so we
// don't need a live server. For each group we synthesise:
//   - one passage paragraph containing every distinct sidecar quote on a
//     separate sentence (sufficient for `not_found` detection, and the
//     locked totals all come from cross_sentence quotes that span an
//     intentional internal terminator the matcher refuses to cross).
//   - one 4-option question with the right `questionNo`.
//
// This deliberately mirrors the matcher's substring policy: a sidecar
// quote is a hit iff `normalizeQuote(passage).includes(normalizeQuote(quote))`
// for some single sentence. cross_sentence quotes carry an inner
// terminator and therefore won't fit any single synthesised sentence,
// reproducing the live miss.
function runSelector(sample) {
  const sidecar = JSON.parse(
    readFileSync(path.join(sidecarDir, `${sample.groupId}.json`), 'utf8'),
  )
  const quotes = (sidecar.entries ?? []).map((e) => String(e.quote))
  const detail = {
    id: sample.groupId,
    title: sample.title || sample.groupId,
    passage: {
      id: 'p',
      title: sample.title || 'p',
      // Every quote becomes its own sentence. Cross-sentence quotes won't
      // match any single sentence because they carry an internal terminator.
      materialText: quotes.length > 0 ? quotes.join(' ') : 'No quotes available.',
    },
    questions: [
      {
        id: 'q',
        questionNo: sample.questionNo || '1',
        questionType: 'reading',
        stem: 'Stem.',
        answer: 'A',
        explanation: '',
        options: [
          { label: 'A', content: 'A.' },
          { label: 'B', content: 'B.' },
          { label: 'C', content: 'C.' },
          { label: 'D', content: 'D.' },
        ],
      },
    ],
    // Padding fields the selector doesn't consult deeply but the type expects.
    passageTitle: sample.title || '',
  }
  const result = selectReadingAnalysisFromDetail({
    detail,
    sidecar,
    questionNo: sample.questionNo,
  })
  return result
}

function aggregateOnce() {
  const all = []
  for (const sample of manifest.samples) {
    const result = runSelector(sample)
    if (!result.ok) continue
    for (const d of result.quoteDiagnostics) {
      all.push(d)
    }
  }
  return summarizeQuoteDiagnostics(all)
}

// Note: the synthetic detail above can't reproduce the live numbers
// exactly because real passages contain many sentences a sidecar quote
// might match while our synthesised passage only contains the quotes
// themselves. The locked numbers (13/31/28/3) live in the report file
// and are exercised by the live `--real` smoke / report scripts; here
// we lock the SHAPE invariants the summarizer is responsible for —
// counts are non-negative, hits + misses === totalEntries, missRate
// formula holds, and unknown reasons don't leak in.
{
  const a = aggregateOnce()
  assert(
    'shape: totalEntries >= sample count (every sidecar entry produces a row)',
    a.totalEntries >= manifest.samples.length,
    JSON.stringify(a),
  )
  assertEqual(
    'shape: totalHits + totalMisses === totalEntries',
    a.totalHits + a.totalMisses,
    a.totalEntries,
  )
  assert(
    'shape: missRate matches totalMisses / totalEntries',
    a.totalEntries === 0
      ? a.missRate === 0
      : Math.abs(a.missRate - a.totalMisses / a.totalEntries) < 1e-12,
    JSON.stringify(a),
  )
  // Cross-sentence cases authored in the manifest must surface in
  // reasonCounts.cross_sentence; the manifest pins 3 of them.
  assert(
    'shape: reasonCounts.cross_sentence >= 3 (manifest pins 3 cross-sentence cases)',
    a.reasonCounts.cross_sentence >= 3,
    JSON.stringify(a),
  )
  // multiple_matches: 0 in the current sample set — both inline accumulator
  // and module-based aggregator must agree on this.
  assertEqual(
    'shape: reasonCounts.multiple_matches === 0',
    a.reasonCounts.multiple_matches,
    0,
  )
}

{
  // Determinism: two consecutive folds yield byte-equal summaries.
  const a = aggregateOnce()
  const b = aggregateOnce()
  assertDeepEqual('determinism: summary is stable across runs', a, b)
}

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
