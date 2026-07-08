#!/usr/bin/env node
// list-groups-perf (docs/cuts/list-groups-perf/plan.md): GET /api/question-groups was
// spending ~4s of its ~6s (prod) / ~3.85s (local) server time in
// selectQuestionGroupCards() calling isGroupPrintReady(db, id) once per row (N+1 SQL +
// N full paper-asset directory re-scans, ~11MB JSON each). This verify proves:
//   1. parity — the new batch function getPrintReadyByGroupId(db, ids) returns the
//      exact same { ok, reason } per id as calling isGroupPrintReady(db, id) for every
//      question group in the real local DB (byte/shape-identical judgment, not just
//      "both ok").
//   2. selectQuestionGroupCards no longer makes a per-row isGroupPrintReady(...) call.
//   3. the batch function is fast: one call across all question groups < 1500ms.
//
// Uses the real local data/question-bank.sqlite (readOnly) and the real
// app/public/paper-assets directory via server/api.mjs's own default paths — no fixture
// DB, so this script is a real-world smoke, not a synthetic unit test.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { getPrintReadyByGroupId, isGroupPrintReady } from '../server/api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dbPath = process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite')

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

console.log('list-groups-perf verify: batch print-ready parity + hot-path removal + speed')

if (!existsSync(dbPath)) {
  console.log(`SKIP: no local database at ${dbPath} (run scripts/init-db.sh first)`)
  process.exit(2)
}

const server = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')

// --- source assertion: selectQuestionGroupCards no longer calls isGroupPrintReady per row ---
const cardsFnStart = server.indexOf('function selectQuestionGroupCards(')
const cardsFnEnd = server.indexOf('\nfunction listQuestionGroups(')
assert('selectQuestionGroupCards found', cardsFnStart !== -1 && cardsFnEnd !== -1 && cardsFnEnd > cardsFnStart)
const selectQuestionGroupCardsSource = server.slice(cardsFnStart, cardsFnEnd)
assert(
  'selectQuestionGroupCards no longer calls isGroupPrintReady per row',
  !/isGroupPrintReady\(/.test(selectQuestionGroupCardsSource),
  'selectQuestionGroupCards still contains a per-row isGroupPrintReady( call',
)
assert(
  'selectQuestionGroupCards uses the batch function',
  /getPrintReadyByGroupId\(/.test(selectQuestionGroupCardsSource),
)

// --- parity + perf: real local DB ---
const db = new DatabaseSync(dbPath, { readOnly: true })
try {
  const ids = db.prepare('SELECT id FROM question_groups').all().map((row) => row.id)
  assert('local DB has question groups to check', ids.length > 0, `found ${ids.length} rows`)

  const perfStart = Date.now()
  const batchResult = getPrintReadyByGroupId(db, ids)
  const perfMs = Date.now() - perfStart

  let mismatches = 0
  for (const id of ids) {
    const single = isGroupPrintReady(db, id)
    const batched = batchResult.get(id)
    const same = Boolean(batched) && single.ok === batched.ok && single.reason === batched.reason
    if (!same) {
      mismatches += 1
      if (mismatches <= 5) {
        console.error(`  mismatch for ${id}: single=${JSON.stringify(single)} batch=${JSON.stringify(batched)}`)
      }
    }
  }
  assert(`parity holds for all ${ids.length} question groups`, mismatches === 0, `${mismatches} mismatches`)
  assert(`batch call over ${ids.length} groups is fast (<1500ms)`, perfMs < 1500, `took ${perfMs}ms`)
  console.log(`  batch getPrintReadyByGroupId over ${ids.length} groups: ${perfMs}ms`)
} finally {
  db.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
