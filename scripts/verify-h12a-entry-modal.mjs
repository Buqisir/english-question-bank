#!/usr/bin/env node
/**
 * Verification: H12-A EntryModal manual-entry question-number guard.
 *
 * Bug (introduced commit f0480678, preserved across the c063940d H12-A
 * extraction that moved `addEntryQuestion` from `App.tsx` into
 * `app/src/workbench/EntryModal.tsx`):
 *   `addEntryQuestion` derived the new sub-question's `questionNo` as
 *   `String(form.questions.length + 1)`. After a *non-last* sub-question was
 *   removed (`removeEntryQuestion` intentionally does NOT renumber, leaving
 *   a gap), `length + 1` collides with the surviving last question's number:
 *   `["1","2","3"]` → delete middle → `["1","3"]` → add → prefill `"3"` →
 *   `["1","3","3"]`. Once a stem is typed for the new card, `handleEntrySubmit`
 *   persists the duplicate (`.filter((question) => question.stem)` keeps it).
 *   There is no DB UNIQUE(group_id, question_no) and no dedup in
 *   `normalizeQuestions`, so the duplicate rows reach `questions`. Downstream,
 *   reading-parse builds `originalQuestionByNo = new Map(... [questionNo, q])`
 *   and the duplicate key collapses, making one stored stem unreachable.
 *
 * Fix:
 *   1. `app/src/workbench/entryQuestionHelpers.ts` exports a pure
 *      `nextQuestionNumber(questions)` that returns `max(existing questionNo) + 1`
 *      (parsed as base-10 int, invalid/empty contribute 0) so the prefilled
 *      题号 can never duplicate an existing entry.
 *   2. `EntryModal.tsx`'s `addEntryQuestion` calls that helper instead of
 *      `String(form.questions.length + 1)`.
 *
 * HERMETIC: no git, no network, no real DeepSeek, no DB, no jsdom. Source-regex
 * checks on EntryModal.tsx (matches this repo's .tsx verify convention — no
 * jsdom harness) plus behavioral import of the pure helper through the public
 * seam (Node 24 loads `.ts` directly).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// Strip /* block */ and // line comments so residue checks assert on actual
// CODE, not on this verify script's own historical-rationale prose (which
// legitimately mentions "form.questions.length + 1" by name while explaining
// what got retired).
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

console.log('H12-A EntryModal verify: addEntryQuestion nextQuestionNumber = max+1')

// ------------------------------------------------------------------ 1. Source: EntryModal uses the helper, not length+1

const entryModal = read('app/src/workbench/EntryModal.tsx')
const entryModalCode = stripComments(entryModal)

assert(
  'EntryModal imports nextQuestionNumber from ./entryQuestionHelpers',
  /import\s+\{\s*nextQuestionNumber\s*\}\s+from\s+['"]\.\/entryQuestionHelpers['"]/.test(entryModalCode),
)
assert(
  'EntryModal addEntryQuestion delegates to nextQuestionNumber(form.questions)',
  /createEntryQuestion\(nextQuestionNumber\(form\.questions\)\)/.test(entryModalCode),
)
assert(
  'EntryModal no longer contains the buggy length+1 questionNo computation (code, not comments)',
  !/String\(form\.questions\.length\s*\+\s*1\)/.test(entryModalCode),
  'trace of the colliding `String(form.questions.length + 1)` helper still present in code',
)
assert(
  'EntryModal no longer contains ANY form.questions.length + 1 expression (code)',
  !/form\.questions\.length\s*\+\s*1/.test(entryModalCode),
  'a `form.questions.length + 1` expression survived somewhere in EntryModal.tsx code',
)

// The companion removeEntryQuestion intentionally does NOT renumber, so max+1
// (not length+1) is the load-bearing invariant. Pin it down so a future
// "renumber on delete" refactor doesn't silently re-open the gap-driven
// collision by re-introducing a length+1 shortcut.
assert(
  'removeEntryQuestion still uses index filter (no renumber) — max+1 is the load-bearing invariant',
  /function removeEntryQuestion\([\s\S]{0,160}form\.questions\.filter\(\s*\(/.test(entryModalCode),
)

// ------------------------------------------------------------------ 2. Source: helper module exists and exports only the pure function

const helpersPath = 'app/src/workbench/entryQuestionHelpers.ts'
const helpersSource = read(helpersPath)

assert(
  'entryQuestionHelpers.ts exports a named nextQuestionNumber function',
  /export function nextQuestionNumber\(/.test(helpersSource),
)
assert(
  'entryQuestionHelpers.ts computes max(parseInt(questionNo,10) || 0) + 1 (not length based)',
  /parseInt\(\s*question\.questionNo,\s*10\s*\)\s*\|\|\s*0/.test(helpersSource)
    && /Math\.max\(/.test(helpersSource)
    && /String\(\s*maxNo\s*\+\s*1\s*\)/.test(helpersSource),
)
assert(
  'entryQuestionHelpers.ts does NOT reference form.questions.length (no length-based regression)',
  !/form\.questions\.length/.test(helpersSource),
)

// ------------------------------------------------------------------ 3. Behavioral: pure helper through the public seam (Node 24 loads .ts directly)

const { nextQuestionNumber } = await import('../app/src/workbench/entryQuestionHelpers.ts')

function q(questionNo) {
  return { questionNo }
}

// --- The exact bug repro, driven behaviorally through the helper ---
// Start with sequential ["1","2","3"], delete the MIDDLE sub-question
// (removeEntryQuestion's index filter), then ask for the next number.
const initial = [q('1'), q('2'), q('3')]
const afterRemoveMiddle = initial.filter((_, index) => index !== 1)
assert(
  'repro: after removing middle "2" the surviving set is ["1","3"] (removeEntryQuestion does not renumber)',
  afterRemoveMiddle.length === 2 && afterRemoveMiddle[0].questionNo === '1' && afterRemoveMiddle[1].questionNo === '3',
  JSON.stringify(afterRemoveMiddle),
)
const nextAfterMiddleRemove = nextQuestionNumber(afterRemoveMiddle)
assert(
  'repro PASS: next questionNo after a middle deletion is "4", not the colliding "3" (the bug)',
  nextAfterMiddleRemove === '4',
  `got ${nextAfterMiddleRemove}`,
)
assert(
  'repro PASS: the new questionNo is NOT already present among the surviving questionNos',
  !afterRemoveMiddle.some((question) => question.questionNo === nextAfterMiddleRemove),
  `${nextAfterMiddleRemove} duplicates a surviving questionNo`,
)

// --- The original buggy formula `length + 1` would have emitted "3" here;
//     pin the divergence as an explicit regression assertion. ---
const buggyWouldProduce = String(afterRemoveMiddle.length + 1)
assert(
  'regression guard: the buggy length+1 formula would have produced the colliding "3"',
  buggyWouldProduce === '3',
)
assert(
  'regression guard: nextQuestionNumber divergence from buggy length+1 is exactly 1 (max+1 vs length+1)',
  Number(nextAfterMiddleRemove) - Number(buggyWouldProduce) === 1,
  `next=${nextAfterMiddleRemove}, buggy=${buggyWouldProduce}`,
)

// --- Generic non-collision guarantee: for any post-deletion state, the
//     prefilled number MUST not duplicate any surviving questionNo. ---
function simulateRemoveAndAdd(startingList, removeIndex) {
  const afterRemove = startingList.filter((_, index) => index !== removeIndex)
  return { afterRemove, next: nextQuestionNumber(afterRemove) }
}
const sequentialBound = 8
let nonCollisionFailures = []
for (let size = 2; size <= sequentialBound; size += 1) {
  const starting = []
  for (let i = 1; i <= size; i += 1) starting.push(q(String(i)))
  // delete every non-last index (removing the last can't collide)
  for (let removeIndex = 0; removeIndex < size - 1; removeIndex += 1) {
    const { afterRemove, next } = simulateRemoveAndAdd(starting, removeIndex)
    if (afterRemove.some((question) => question.questionNo === next)) {
      nonCollisionFailures.push(`size=${size} removeIdx=${removeIndex} next=${next} set=${JSON.stringify(afterRemove)}`)
    }
  }
}
assert(
  `no non-last deletion from a sequential 2..${sequentialBound} group ever prefills a colliding questionNo`,
  nonCollisionFailures.length === 0,
  nonCollisionFailures.join('\n'),
)

// --- Boundary / input-shape cases ---
assert('empty list → "1" (no surviving question to collide with)', nextQuestionNumber([]) === '1')
assert('single "1" → "2"', nextQuestionNumber([q('1')]) === '2')
assert('single "5" (gap below) → "6", not "2"', nextQuestionNumber([q('5')]) === '6')
assert('sequential ["1","2","3","4","5"] → "6"', nextQuestionNumber([q('1'), q('2'), q('3'), q('4'), q('5')]) === '6')
assert('gappy ["1","3","5"] → "6" (max+1, NOT length+1=4)', nextQuestionNumber([q('1'), q('3'), q('5')]) === '6')
assert('multi-digit ["10"] → "11"', nextQuestionNumber([q('10')]) === '11')
assert('multi-digit gap ["3","10"] → "11" (max wins, not 2+length)', nextQuestionNumber([q('3'), q('10')]) === '11')
assert('large ["100"] → "101"', nextQuestionNumber([q('100')]) === '101')

// --- Defensive: already-corrupted state must not amplify the corruption ---
// If the group was saved with duplicates (channel b: hand-typed dups, which
// the separately-recommended server guard owns), the helper still computes a
// next number that does NOT equal ANY existing questionNo, so re-edits don't
// manufacture a *third* duplicate via the prefill.
const corrupted = [q('1'), q('3'), q('3')]
const nextFromCorrupted = nextQuestionNumber(corrupted)
assert('already-corrupted ["1","3","3"] → "4" (max+1, skips both "3"s)', nextFromCorrupted === '4', `got ${nextFromCorrupted}`)
assert(
  'already-corrupted: next is not "1","3" (does not amplify the duplicate)',
  nextFromCorrupted !== '1' && nextFromCorrupted !== '3',
)

// --- Non-integer questionNo labels: parseInt(... , 10) || 0 → contribute 0 ---
// An owner may hand-type a non-numeric label (e.g. "A"); the helper must never
// silently emit a colliding integer or NaN. `String(NaN)` would be "NaN";
// pin both that it isn't NaN and that the floor is "1".
assert('all non-integer ["A","B"] → "1" (no NaN, no collision)', nextQuestionNumber([q('A'), q('B')]) === '1')
assert('mixed valid+invalid ["1","abc","3"] → "4" (invalid contributes 0, valid max 3)', nextQuestionNumber([q('1'), q('abc'), q('3')]) === '4')
assert('whitespace-padded [" 2 ", " 3 "] → "4" (parseInt trims leading whitespace)', nextQuestionNumber([q(' 2 '), q(' 3 ')]) === '4')
assert('decimal questionNos ["3.5","4.0"] → "5" (parseInt truncates, max 4)', nextQuestionNumber([q('3.5'), q('4.0')]) === '5')
assert('empty-string questionNo [""] → "1" (parseInt("") is NaN, floor 0+1)', nextQuestionNumber([q('')]) === '1')
assert('result is always a finite base-10 integer string (never "NaN", never "" )', /^\d+$/.test(nextQuestionNumber([q('1'), q('2'), q('xyz')])))

// --- Type-contract: the helper accepts any object with questionNo: string ---
// EntryQuestionForm has more fields, but the helper is structural. Pin this
// so the public seam stays decoupled from the .tsx-only EntryQuestionForm type
// (no circular import) and the verify can keep importing just the helper.
assert(
  'nextQuestionNumber accepts the broader EntryQuestionForm shape (extra fields ignored)',
  nextQuestionNumber([{ questionNo: '7', questionType: 'reading', stem: 'x', optionsText: '', answer: '', explanation: '' }]) === '8',
)

// ------------------------------------------------------------------ 4. Source: no other app/src file uses questions.length + 1 for a questionNo prefill

function walkAppSrc(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkAppSrc(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
}
const appSrcFiles = []
walkAppSrc(path.join(rootDir, 'app/src'), appSrcFiles)
const lengthPlusOneOffenders = []
for (const file of appSrcFiles) {
  const src = stripComments(readFileSync(file, 'utf8'))
  if (/questions\.length\s*\+\s*1/.test(src)) {
    lengthPlusOneOffenders.push(path.relative(rootDir, file))
  }
}
assert(
  'no `.ts`/`.tsx` under app/src recomputes a questionNo via .length + 1 (single-call-site fix holds across the app)',
  lengthPlusOneOffenders.length === 0,
  lengthPlusOneOffenders.join('\n'),
)

// ------------------------------------------------------------------ 5. Source: handleEntrySubmit still drops empty-stem questions (the persistence gate that makes a stem-filled duplicate reachable)

const submitRegion = entryModal.slice(
  entryModal.indexOf('async function handleEntrySubmit'),
  entryModal.indexOf('handleEntrySubmit', entryModal.indexOf('async function handleEntrySubmit') + 1) === -1
    ? entryModal.length
    : entryModal.indexOf('try {', entryModal.indexOf('async function handleEntrySubmit')),
)
assert(
  'handleEntrySubmit filters questions on .stem (so the duplicate only persists when a stem was typed)',
  /\.filter\(\s*\(question\)\s*=>\s*question\.stem\s*\)/.test(stripComments(submitRegion)),
)

// ------------------------------------------------------------------

console.log(`\nH12-A EntryModal verify: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
