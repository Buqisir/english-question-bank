#!/usr/bin/env node
/**
 * C6a-11 verification: JSLK Reading A-D are formal API data, not merely
 * sample-card fallback data.
 *
 * The important regression guard here is a real stale-database scenario:
 * copy the current SQLite DB, remove Reading B/C/D, start the API against
 * that copy, and require server startup migration to restore A/B/C/D from
 * paper-asset.json.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDbPath = join(root, 'data/question-bank.sqlite')
const tmpDir = mkdtempSync(join(tmpdir(), 'eqb-c6a11-'))
const tmpDbPath = join(tmpDir, 'question-bank.sqlite')
const apiPort = 18787

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function assertEqual(name, actual, expected) {
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function readCardsFromDb(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db
      .prepare(
        `
          SELECT id, title, section, question_count, hit, answer_preview
          FROM v_question_group_cards
          WHERE id LIKE 'group-2024-jslk-reading-%'
          ORDER BY id
        `,
      )
      .all()
  } finally {
    db.close()
  }
}

function removeReadingBcd(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: false })
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(`
      DELETE FROM sources
      WHERE id IN (
        'src-2024-jslk-reading-b',
        'src-2024-jslk-reading-c',
        'src-2024-jslk-reading-d'
      );
    `)
  } finally {
    db.close()
  }
}

async function waitForHealth(port, serverProcess) {
  const deadline = Date.now() + 6000
  let lastError = null
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`API exited early with code ${serverProcess.exitCode}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 120))
  }
  throw lastError || new Error('Timed out waiting for API health')
}

async function main() {
  console.log('=== C6a-11: formal JSLK Reading API data ===\n')

  assert('source SQLite DB exists', existsSync(sourceDbPath), sourceDbPath)
  copyFileSync(sourceDbPath, tmpDbPath)

  console.log('-- 1. Stale DB fixture starts without Reading B/C/D --')
  removeReadingBcd(tmpDbPath)
  const staleCards = readCardsFromDb(tmpDbPath)
  assertEqual('stale fixture keeps only Reading A', JSON.stringify(staleCards.map((card) => card.id)), JSON.stringify(['group-2024-jslk-reading-a']))

  console.log('\n-- 2. API startup migration restores A/B/C/D --')
  const serverProcess = spawn(process.execPath, ['server/api.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      QUESTION_BANK_DB: tmpDbPath,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  serverProcess.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  serverProcess.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForHealth(apiPort, serverProcess)
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/question-groups`)
    assert('question-groups API responds', response.ok, `status ${response.status}`)
    const body = await response.json()
    const cards = body.questionGroups.filter((group) => group.id.startsWith('group-2024-jslk-reading-'))
    const ids = cards.map((group) => group.id).sort()
    assertEqual(
      'API returns formal JSLK Reading A/B/C/D cards',
      JSON.stringify(ids),
      JSON.stringify([
        'group-2024-jslk-reading-a',
        'group-2024-jslk-reading-b',
        'group-2024-jslk-reading-c',
        'group-2024-jslk-reading-d',
      ]),
    )

    const byId = new Map(cards.map((card) => [card.id, card]))
    const expectations = [
      ['group-2024-jslk-reading-a', '阅读理解 A', 3, 'How long will the exhibition'],
      ['group-2024-jslk-reading-b', '阅读理解 B', 4, 'What is important for parrots'],
      ['group-2024-jslk-reading-c', '阅读理解 C', 4, "What is the author's attitude"],
      ['group-2024-jslk-reading-d', '阅读理解 D', 4, 'What does it indicate when toddlers'],
    ]
    for (const [id, section, count, hitPrefix] of expectations) {
      const card = byId.get(id)
      assert(`${id} exists in API result`, !!card)
      assertEqual(`${id} section`, card?.section, section)
      assertEqual(`${id} questionCount`, card?.questionCount, count)
      assert(`${id} has real first stem`, String(card?.hit || '').startsWith(hitPrefix), card?.hit)
      assert(`${id} has answer preview`, String(card?.answerPreview || '').includes('.'), card?.answerPreview)
    }

    console.log('\n-- 3. Migration also writes questions and options --')
    const migratedDbCards = readCardsFromDb(tmpDbPath)
    assertEqual('migrated DB has four JSLK cards', migratedDbCards.length, 4)
    const db = new DatabaseSync(tmpDbPath, { readOnly: true })
    try {
      const optionCount = db
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM options
            WHERE question_id BETWEEN 'q-2024-jslk-021' AND 'q-2024-jslk-035'
          `,
        )
        .get().count
      assertEqual('A/B/C/D objective options are present in DB', optionCount, 60)
    } finally {
      db.close()
    }
  } finally {
    serverProcess.kill('SIGTERM')
    await new Promise((resolveProcess) => serverProcess.once('exit', resolveProcess))
    if (failed > 0) {
      console.error('\nAPI stdout:\n' + stdout)
      console.error('\nAPI stderr:\n' + stderr)
    }
  }

  console.log(`\nC6a-11 formal JSLK API verify: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
  .catch((error) => {
    failed++
    console.error(`  ✗ unexpected verifier failure: ${error?.stack || error}`)
    process.exit(1)
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
