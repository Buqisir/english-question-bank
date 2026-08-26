#!/usr/bin/env node
/**
 * r1-genre-truth verify.
 *
 * Four assertions from plan.md Must Do 5:
 *   1. 273/273 历史语料覆盖 — genre-decisions.json keeps the exact approved
 *      273-row corpus and every approved passage remains present in the DB.
 *      Later imports are additive and do not retroactively belong to this audit.
 *   2. 全落五类枚举 — every decision.decision is one of the controlled 5-way
 *      enum (记叙/说明/议论/应用/新闻), zero drift.
 *   3. 题型名旧值零残留 — DB `passages.discourse_type` no longer contains any
 *      of the old question-type-name values (reading/cloze/sevenChoices/
 *      grammarFill/writing). DEPENDS on genre-truth-apply.mjs --write having
 *      run — see the "known-red" note below (owner gate R1-DP1/R1-DP2 not
 *      cleared yet at DEV time; documented in the completion report).
 *   4. publisher 源不再向 discourse_type 写题型名 — source-level regression
 *      guard: publisher.mjs's ON CONFLICT branch never assigns discourse_type
 *      (so re-publishing a paper can't stomp real genre truth), and the INSERT
 *      branch writes NULL for new passages (never group.groupType).
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { GENRE_ENUM } from './genre-truth-classify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const DECISIONS_PATH = path.join(rootDir, 'docs/cuts/r1-genre-truth/genre-decisions.json')
const DB_PATH = path.join(rootDir, 'data/question-bank.sqlite')

let passed = 0
let failed = 0
function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Req 1+2: genre-decisions.json coverage + controlled enum ────────────────
console.log('=== Req 1+2: decisions artifact coverage + enum ===')
{
  if (!existsSync(DECISIONS_PATH)) {
    assert('Req1: genre-decisions.json exists', false, DECISIONS_PATH)
  } else {
    const decisions = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8'))
    assert('Req1: 273 decisions on file', decisions.length === 273, `got ${decisions.length}`)

    const ids = new Set(decisions.map((d) => d.passageId))
    assert('Req1: no duplicate passageIds', ids.size === decisions.length, `${decisions.length - ids.size} duplicates`)

    if (existsSync(DB_PATH)) {
      const db = new DatabaseSync(DB_PATH, { readOnly: true })
      const dbIds = db.prepare('SELECT id FROM passages').all().map((r) => r.id)
      db.close()
      const missingApproved = [...ids].filter((id) => !dbIds.includes(id))
      assert(
        'Req1: every approved passage remains in the DB',
        missingApproved.length === 0,
        `${missingApproved.length} approved passages missing from DB: ${missingApproved.slice(0, 5).join(', ')}`,
      )
    } else {
      console.log('  (skip DB cross-check — data/question-bank.sqlite not found)')
    }

    const badEnum = decisions.filter((d) => !GENRE_ENUM.includes(d.decision))
    assert('Req2: every decision is in the controlled 5-way enum', badEnum.length === 0, `${badEnum.length} bad: ${badEnum.slice(0, 5).map((d) => `${d.passageId}=${d.decision}`).join(', ')}`)

    const badConfidence = decisions.filter((d) => d.confidence !== 'high' && d.confidence !== 'low')
    assert('Req2: every decision has confidence high|low', badConfidence.length === 0, `${badConfidence.length} bad`)

    const missingRationale = decisions.filter((d) => typeof d.rationale !== 'string' || !d.rationale.trim())
    assert('Req2: every decision has a non-empty rationale', missingRationale.length === 0, `${missingRationale.length} missing`)
  }
}

console.log()

// ─── Req 3: DB no longer has old question-type-name values (depends on apply) ─
console.log('=== Req 3: DB discourse_type has zero old question-type-name residue ===')
{
  if (!existsSync(DB_PATH)) {
    console.log('  (skip — data/question-bank.sqlite not found)')
  } else {
    const OLD_VALUES = new Set(['reading', 'cloze', 'sevenChoices', 'grammarFill', 'writing'])
    const db = new DatabaseSync(DB_PATH, { readOnly: true })
    const rows = db.prepare('SELECT id, discourse_type FROM passages').all()
    db.close()
    const stale = rows.filter((r) => OLD_VALUES.has(r.discourse_type))
    assert(
      'Req3: no passages.discourse_type still holds an old question-type-name value',
      stale.length === 0,
      `${stale.length} stale rows (expected pre-apply — see R1-DP1/R1-DP2 owner gate; genre-truth-apply.mjs --write not yet run): ${stale.slice(0, 5).map((r) => `${r.id}=${r.discourse_type}`).join(', ')}`,
    )
  }
}

console.log()

// ─── Req 4: publisher source regression guard ─────────────────────────────────
console.log('=== Req 4: publisher.mjs no longer writes question-type-name into discourse_type ===')
{
  const publisherSrc = readFileSync(path.join(rootDir, 'server/paper-import/publisher.mjs'), 'utf8')

  // The ON CONFLICT DO UPDATE SET clause for the passages upsert must not assign
  // discourse_type = excluded.discourse_type (that's what let re-publishing stomp
  // real genre truth back to the question-type name).
  const upsertMatch = publisherSrc.match(/INSERT INTO passages[\s\S]*?ON CONFLICT\(id\) DO UPDATE SET([\s\S]*?)`/)
  assert('Req4: passages upsert block found', Boolean(upsertMatch))
  if (upsertMatch) {
    assert(
      'Req4: ON CONFLICT branch does not assign discourse_type',
      !/discourse_type\s*=\s*excluded\.discourse_type/.test(upsertMatch[1]),
      'found discourse_type = excluded.discourse_type in the conflict-update clause',
    )
  }

  // The INSERT VALUES side must never pass group.groupType as the discourse_type
  // param (the original bug) — the .run(...) call site must pass a literal null.
  const runCallMatch = publisherSrc.match(/\.run\(\s*passageId,\s*sourceId,\s*groupTitle,\s*materialText,\s*summary,\s*'',([\s\S]*?)materialText\.split/)
  assert('Req4: passages .run(...) call site found', Boolean(runCallMatch))
  if (runCallMatch) {
    // Strip `//` comment lines before checking — the surrounding explanatory
    // comment legitimately mentions "group.groupType" in prose (describing the
    // bug it fixes); only the executable code lines matter for this assertion.
    const codeOnly = runCallMatch[1]
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    assert(
      'Req4: discourse_type param is a literal null (not group.groupType)',
      /^\s*null\s*,\s*$/m.test(codeOnly) && !/group\.groupType/.test(codeOnly),
      `run() args (code only) before word_count: ${codeOnly.trim()}`,
    )
  }
}

console.log()
if (failed > 0) {
  console.error(`r1-genre-truth verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}
console.log(`r1-genre-truth verify passed: ${passed} passed, 0 failed`)
