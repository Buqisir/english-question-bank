#!/usr/bin/env node
// M0-1 one-time migration: move the four user-data tables (draft_papers,
// draft_paper_items, my_space_artifacts, my_space_folders) out of the shared bank
// database (question-bank.sqlite) into the standalone user database
// (user-data.sqlite), per ADR-0011 / docs/cuts/m0-1-user-db-split/plan.md decision 6.
//
// Steps (in order, none skippable):
//   1. Back up the shared bank database file (.bak.<timestamp>).
//   2. Ensure the user database shape exists (idempotent CREATE TABLE IF NOT EXISTS,
//      via the same ensureUserDatabaseShape() the server uses at startup — this is the
//      single source of truth for the user schema, not a second copy of it).
//   3. Copy each of the four tables' rows from the bank DB into the user DB.
//      Idempotent: if the destination table already has rows, refuse (assume an earlier
//      migration already ran) rather than silently duplicating/re-importing.
//   4. Before DROPping anything from the bank DB, assert per-table
//      "user DB row count == bank DB row count". Any mismatch aborts without
//      dropping. Only after all four tables pass does it DROP them from the bank DB,
//      and it prints a before/after row-count table either way.
//
// Usage: node scripts/migrate-user-data-split.mjs [bankDbPath] [userDbPath]
// Defaults: data/question-bank.sqlite / data/user-data.sqlite (same defaults as the
// server's QUESTION_BANK_DB / USER_DATA_DB env vars).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { ensureUserDatabaseShape } from '../server/api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const bankDbPath = path.resolve(process.argv[2] || process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite'))
const userDbPath = path.resolve(process.argv[3] || process.env.USER_DATA_DB || path.join(rootDir, 'data/user-data.sqlite'))

const USER_TABLES = ['draft_papers', 'draft_paper_items', 'my_space_artifacts', 'my_space_folders']
// draft_paper_items references draft_papers(id); my_space_artifacts references
// my_space_folders(id). Parents must be copied (and, if ever needed, dropped) before
// their children to respect FK ordering inside the user database.
const COPY_ORDER = ['draft_papers', 'draft_paper_items', 'my_space_folders', 'my_space_artifacts']
const DROP_ORDER = ['draft_paper_items', 'draft_papers', 'my_space_artifacts', 'my_space_folders']

function fail(message) {
  console.error(`\n[migrate-user-data-split] FAILED: ${message}`)
  process.exitCode = 1
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
  )
}

function rowCount(db, tableName) {
  if (!tableExists(db, tableName)) return 0
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
}

function columnNames(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name)
}

function copyTableRows(bankDb, userDb, tableName) {
  if (!tableExists(bankDb, tableName)) return 0
  const rows = bankDb.prepare(`SELECT * FROM ${tableName}`).all()
  if (rows.length === 0) return 0
  const columns = columnNames(userDb, tableName)
  const placeholders = columns.map(() => '?').join(', ')
  const insert = userDb.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`)
  for (const row of rows) {
    insert.run(...columns.map((column) => row[column]))
  }
  return rows.length
}

function printRowCountTable(title, rowsByTable) {
  console.log(`\n${title}`)
  for (const table of USER_TABLES) {
    console.log(`  ${table.padEnd(24)} ${String(rowsByTable[table] ?? 0).padStart(6)}`)
  }
}

function main() {
  if (!existsSync(bankDbPath)) {
    fail(`bank database not found at ${bankDbPath}`)
    return
  }

  const bankTablesPresent = (() => {
    const probe = new DatabaseSync(bankDbPath, { readOnly: true })
    try {
      return USER_TABLES.some((table) => tableExists(probe, table))
    } finally {
      probe.close()
    }
  })()

  if (!bankTablesPresent) {
    console.log('Bank database has no user-data tables — nothing to migrate (already split, or a fresh init-db.sh build).')
    return
  }

  // Step 1: back up the bank DB file before any write.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${bankDbPath}.bak.${timestamp}`
  copyFileSync(bankDbPath, backupPath)
  console.log(`Step 1: backed up bank database to ${backupPath}`)

  // Step 2: ensure user DB shape (idempotent; same code path the server uses at startup).
  mkdirSync(path.dirname(userDbPath), { recursive: true })
  const userDb = new DatabaseSync(userDbPath)
  userDb.exec('PRAGMA foreign_keys = ON')
  ensureUserDatabaseShape(userDb)
  console.log(`Step 2: ensured user database shape at ${userDbPath}`)

  const bankDb = new DatabaseSync(bankDbPath)
  bankDb.exec('PRAGMA foreign_keys = ON')

  try {
    // Idempotency guard: if the user DB already has rows in any of the four tables,
    // refuse — assume an earlier migration run already moved data here.
    const alreadyMigrated = USER_TABLES.some((table) => rowCount(userDb, table) > 0)
    if (alreadyMigrated) {
      const existingCounts = {}
      for (const table of USER_TABLES) existingCounts[table] = rowCount(userDb, table)
      printRowCountTable('User database already has rows in these tables (migration already ran):', existingCounts)
      console.log('\nRefusing to re-migrate. If this is unexpected, inspect the user database manually.')
      return
    }

    const beforeCounts = {}
    for (const table of USER_TABLES) beforeCounts[table] = rowCount(bankDb, table)
    printRowCountTable('Bank database row counts before migration:', beforeCounts)

    // Step 3: copy rows bank -> user, in FK-safe order, inside a user-DB transaction.
    console.log('\nStep 3: copying rows into user database')
    userDb.exec('BEGIN')
    try {
      for (const table of COPY_ORDER) {
        const copied = copyTableRows(bankDb, userDb, table)
        console.log(`  - ${table}: copied ${copied} row(s)`)
      }
      userDb.exec('COMMIT')
    } catch (error) {
      userDb.exec('ROLLBACK')
      throw error
    }

    // Step 4: verify row counts match before dropping anything from the bank DB.
    const afterUserCounts = {}
    for (const table of USER_TABLES) afterUserCounts[table] = rowCount(userDb, table)

    const mismatches = USER_TABLES.filter((table) => (beforeCounts[table] || 0) !== (afterUserCounts[table] || 0))
    if (mismatches.length > 0) {
      printRowCountTable('User database row counts after copy (MISMATCH — aborting, nothing dropped):', afterUserCounts)
      fail(
        `row count mismatch after copy for: ${mismatches.join(', ')}. ` +
          `Bank database is untouched (backup at ${backupPath}). Investigate before re-running.`,
      )
      return
    }

    console.log('\nStep 4: row counts match — dropping user-data tables from bank database')
    bankDb.exec('BEGIN')
    try {
      for (const table of DROP_ORDER) {
        if (tableExists(bankDb, table)) bankDb.exec(`DROP TABLE ${table}`)
      }
      bankDb.exec('COMMIT')
    } catch (error) {
      bankDb.exec('ROLLBACK')
      throw error
    }

    const afterBankCounts = {}
    for (const table of USER_TABLES) afterBankCounts[table] = tableExists(bankDb, table) ? rowCount(bankDb, table) : 0

    printRowCountTable('Bank database row counts after migration (tables dropped):', afterBankCounts)
    printRowCountTable('User database row counts after migration:', afterUserCounts)
    console.log(`\nMigration complete. Bank database backup kept at ${backupPath}.`)
  } finally {
    userDb.close()
    bankDb.close()
  }
}

main()
