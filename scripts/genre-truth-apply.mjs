#!/usr/bin/env node
/**
 * r1-genre-truth — apply decisions to the DB.
 *
 * NOT RUN by DEV. Gated on owner sign-off (R1-DP1, audit page in
 * docs/cuts/r1-genre-truth/genre-audit.html) — only run this after the
 * owner has cleared docs/cuts/r1-genre-truth/genre-decisions.json (and any
 * needs-ruling returns have been re-batched).
 *
 * Idempotent: UPDATEs passages.discourse_type by id, safe to re-run.
 * Always backs up the DB first (cp data/question-bank.sqlite{,.bak.genre-r1}),
 * refusing to run if that backup step fails.
 *
 * Usage:
 *   node scripts/genre-truth-apply.mjs            # dry-run: prints the diff, writes nothing
 *   node scripts/genre-truth-apply.mjs --write     # backs up DB, then applies
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { GENRE_ENUM } from './genre-truth-classify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const DB_PATH = path.join(projectRoot, 'data/question-bank.sqlite')
const BACKUP_PATH = `${DB_PATH}.bak.genre-r1`
const DECISIONS_PATH = path.join(projectRoot, 'docs/cuts/r1-genre-truth/genre-decisions.json')

const write = process.argv.includes('--write')

if (!existsSync(DECISIONS_PATH)) {
  console.error(`missing ${DECISIONS_PATH} — run genre-truth-classify.mjs first.`)
  process.exit(1)
}

const decisions = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8'))

if (decisions.length !== 273) {
  console.error(`expected 273 decisions, got ${decisions.length}. Refusing to apply a partial set.`)
  process.exit(1)
}

for (const d of decisions) {
  if (!GENRE_ENUM.includes(d.decision)) {
    console.error(`${d.passageId}: decision "${d.decision}" is not in the controlled enum — refusing to apply.`)
    process.exit(1)
  }
}

if (write) {
  if (!existsSync(DB_PATH)) {
    console.error(`DB not found at ${DB_PATH}`)
    process.exit(1)
  }
  copyFileSync(DB_PATH, BACKUP_PATH)
  console.log(`backed up ${DB_PATH} -> ${BACKUP_PATH}`)
}

const db = new DatabaseSync(DB_PATH, { readOnly: !write })
let changed = 0
let unchanged = 0
let missing = 0

const selectStmt = db.prepare('SELECT discourse_type FROM passages WHERE id = ?')
const updateStmt = write ? db.prepare('UPDATE passages SET discourse_type = ?, updated_at = datetime(\'now\') WHERE id = ?') : null

for (const d of decisions) {
  const row = selectStmt.get(d.passageId)
  if (!row) {
    console.error(`MISSING passage: ${d.passageId}`)
    missing++
    continue
  }
  if (row.discourse_type === d.decision) {
    unchanged++
    continue
  }
  console.log(`${d.passageId}: ${row.discourse_type} -> ${d.decision}`)
  changed++
  if (write) updateStmt.run(d.decision, d.passageId)
}

db.close()

console.log(`\n${write ? 'applied' : 'dry-run'}: ${changed} changed, ${unchanged} already correct, ${missing} missing.`)
if (!write) console.log('Re-run with --write to persist (backs up the DB first).')
