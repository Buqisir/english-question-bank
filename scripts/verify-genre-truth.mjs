#!/usr/bin/env node
/**
 * r1-genre-truth verify.
 *
 * Four assertions from plan.md Must Do 5:
 *   1. 273/273 historical batch — each decision still names a tracked passage.
 *      New papers do not retroactively expand this reviewed batch.
 *   2. 全落五类枚举 — every decision.decision is one of the controlled 5-way
 *      enum (记叙/说明/议论/应用/新闻), zero drift.
 *   3. 题型名旧值零残留 — DB `passages.discourse_type` no longer contains any
 *      of the old question-type-name values (reading/cloze/sevenChoices/
 *      grammarFill/writing). Tested in isolated SQLite; --db <path> additionally
 *      audits a selected corpus read-only, including applied decision equality.
 *   4. publisher 源不再向 discourse_type 写题型名 — source-level regression
 *      guard: publisher.mjs's ON CONFLICT branch never assigns discourse_type
 *      (so re-publishing a paper can't stomp real genre truth), and the INSERT
 *      branch writes NULL for new passages (never group.groupType).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'
import { GENRE_ENUM } from './genre-truth-classify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const DECISIONS_PATH = path.join(rootDir, 'docs/cuts/r1-genre-truth/genre-decisions.json')
const { values: args } = parseArgs({ options: { db: { type: 'string' } } })
if (args.db !== undefined && !args.db.trim()) throw new Error('--db requires a non-empty path')

function auditGenres(db, decisions) {
  const rows = db.prepare('SELECT id, discourse_type FROM passages').all()
  const byId = new Map(rows.map((row) => [row.id, row.discourse_type]))
  const oldValues = new Set(['reading', 'cloze', 'sevenChoices', 'grammarFill', 'writing'])
  return [
    ...decisions.flatMap(({ passageId, decision }) => !byId.has(passageId)
      ? [`missing: ${passageId}`]
      : byId.get(passageId) !== decision ? [`mismatch: ${passageId}`] : []),
    ...rows.filter((row) => oldValues.has(row.discourse_type)).map((row) => `stale: ${row.id}`),
  ]
}

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

    const assetRoot = path.join(rootDir, 'app/public/paper-assets')
    const assetIds = new Set()
    for (const entry of readdirSync(assetRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const latest = path.join(assetRoot, entry.name, 'latest/paper-asset.json')
      const asset = JSON.parse(readFileSync(existsSync(latest) ? latest : path.join(assetRoot, entry.name, 'paper-asset.json'), 'utf8'))
      for (const groupId of Object.keys(asset.content.groups)) {
        assetIds.add(`passage-${groupId.replace(/^group-/, '').replace(/[^a-zA-Z0-9-]/g, '-')}`)
      }
    }
    const missing = [...ids].filter((id) => !assetIds.has(id))
    assert('Req1: all historical decisions name tracked passages', missing.length === 0, missing.join(', '))
    console.log(`SCOPE: ${assetIds.size - ids.size + missing.length} tracked passages outside the historical batch; not genre-verified by that batch.`)

    const badEnum = decisions.filter((d) => !GENRE_ENUM.includes(d.decision))
    assert('Req2: every decision is in the controlled 5-way enum', badEnum.length === 0, `${badEnum.length} bad: ${badEnum.slice(0, 5).map((d) => `${d.passageId}=${d.decision}`).join(', ')}`)

    const badConfidence = decisions.filter((d) => d.confidence !== 'high' && d.confidence !== 'low')
    assert('Req2: every decision has confidence high|low', badConfidence.length === 0, `${badConfidence.length} bad`)

    const missingRationale = decisions.filter((d) => typeof d.rationale !== 'string' || !d.rationale.trim())
    assert('Req2: every decision has a non-empty rationale', missingRationale.length === 0, `${missingRationale.length} missing`)
  }
}

console.log()

// ─── Req 3: same strict DB audit in fixtures and explicit corpus audits ────
console.log('=== Req 3: SQLite genre audit regressions ===')
const fixture = new DatabaseSync(':memory:')
fixture.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
try {
  fixture.exec(`
    INSERT INTO sources (id, source_type) VALUES ('fixture', 'self_made');
    INSERT INTO passages (id, source_id, title, difficulty, discourse_type) VALUES
      ('historical', 'fixture', 'Synthetic historical passage', 'medium', '记叙'),
      ('newer', 'fixture', 'Synthetic newer passage', 'medium', NULL);
  `)
  const decisions = [{ passageId: 'historical', decision: '记叙' }]
  assert('fixture: applied historical batch plus new NULL passage passes', auditGenres(fixture, decisions).length === 0)
  fixture.exec("UPDATE passages SET discourse_type = '说明' WHERE id = 'historical'")
  assert('fixture: wrong but valid genre rejected', auditGenres(fixture, decisions).join() === 'mismatch: historical')
  fixture.exec("UPDATE passages SET discourse_type = '记叙' WHERE id = 'historical'")
  for (const value of ['reading', 'cloze', 'sevenChoices', 'grammarFill', 'writing']) {
    fixture.prepare("UPDATE passages SET discourse_type = ? WHERE id = 'newer'").run(value)
    assert(`fixture: ${value} residue outside historical batch rejected`, auditGenres(fixture, decisions).join() === 'stale: newer')
  }
  fixture.exec("UPDATE passages SET discourse_type = '说明' WHERE id = 'newer'")
  assert('fixture: additional classified passage passes', auditGenres(fixture, decisions).length === 0)
  fixture.exec("DELETE FROM passages WHERE id = 'historical'")
  assert('fixture: missing historical passage rejected, not intersection-only', auditGenres(fixture, decisions).join() === 'missing: historical')
} finally {
  fixture.close()
}

if (args.db) {
  const db = new DatabaseSync(path.resolve(args.db), { readOnly: true })
  try {
    const decisions = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8'))
    const errors = auditGenres(db, decisions)
    assert('explicit corpus: historical coverage + applied values + all-row residue', errors.length === 0, errors.join(', '))
  } finally {
    db.close()
  }
} else {
  console.log('SCOPE: isolated DB regressions; no deployment/local corpus DB audit requested (use --db).')
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
