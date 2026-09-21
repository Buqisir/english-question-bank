import { closeSync, mkdirSync, openSync, statSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import {
  FLASH_MAX_INPUT_TOKENS,
  INPUT_YUAN_PER_MILLION,
  OUTPUT_YUAN_PER_MILLION,
  RATE_VERSION,
} from '../../shared/paper-selection/constants.mjs'

export function utcPeriod(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function costMicroCny(tokens, yuanPerMillion) {
  if (!Number.isFinite(tokens) || tokens < 0) return 0
  return Math.ceil(tokens * yuanPerMillion)
}

const LEDGER_SCHEMA = `
      CREATE TABLE translation_receipts (
        receipt_id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        rate_version TEXT NOT NULL,
        status TEXT NOT NULL,
        reserved_input_tokens INTEGER NOT NULL,
        reserved_output_tokens INTEGER NOT NULL,
        reserved_micro_cny INTEGER NOT NULL,
        actual_input_tokens INTEGER,
        actual_output_tokens INTEGER,
        actual_micro_cny INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_translation_receipts_period
        ON translation_receipts(period, status);
`

// Normal service startup must never initialize a missing (or schema-less) ledger.
// Keep the existing receipt schema readable: upgrading does not reset old costs.
const LEDGER_COLUMNS = [
  ['receipt_id', 'TEXT', 0, 1],
  ['period', 'TEXT', 1, 0],
  ['rate_version', 'TEXT', 1, 0],
  ['status', 'TEXT', 1, 0],
  ['reserved_input_tokens', 'INTEGER', 1, 0],
  ['reserved_output_tokens', 'INTEGER', 1, 0],
  ['reserved_micro_cny', 'INTEGER', 1, 0],
  ['actual_input_tokens', 'INTEGER', 0, 0],
  ['actual_output_tokens', 'INTEGER', 0, 0],
  ['actual_micro_cny', 'INTEGER', 0, 0],
  ['created_at', 'TEXT', 1, 0],
  ['updated_at', 'TEXT', 1, 0],
]

function validateLedger(db) {
  const columns = db.prepare('PRAGMA table_info(translation_receipts)').all()
  if (!LEDGER_COLUMNS.every(([name, type, notnull, pk]) => columns.some((column) => (
    column.name === name && column.type === type && column.notnull === notnull && column.pk === pk
  )))) {
    throw new Error('Translation usage ledger schema is missing or invalid')
  }
  const integrity = db.prepare('PRAGMA quick_check').all()
  if (integrity.length !== 1 || integrity[0].quick_check !== 'ok') {
    throw new Error('Translation usage ledger integrity check failed')
  }
}

/** Explicit FIRST-TIME setup only; never call this from a request/startup path. */
export function initializeUsageLedger({ filePath } = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  // Exclusive creation refuses to overwrite any existing ledger, including a bad one.
  const fd = openSync(filePath, 'wx', 0o600)
  closeSync(fd)
  const db = new DatabaseSync(filePath)
  try {
    db.exec(`BEGIN IMMEDIATE; ${LEDGER_SCHEMA} COMMIT;`)
    validateLedger(db)
  } finally {
    // On failure leave the file for inspection; runtime validation fails closed.
    db.close()
  }
}

export function createUsageLedger({
  filePath,
  monthlyBudgetCny,
  rateVersion = RATE_VERSION,
} = {}) {
  let db
  try {
    const file = statSync(filePath)
    if (!file.isFile() || file.size === 0) throw new Error('Translation usage ledger is missing or empty')
    db = new DatabaseSync(filePath)
    validateLedger(db)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA busy_timeout = 3000')
    db.exec('PRAGMA foreign_keys = ON')
    db.prepare('SELECT COUNT(*) AS n FROM translation_receipts').get()
  } catch (error) {
    try { db?.close() } catch { /* Preserve the original validation/open error. */ }
    error.code = 'TRANSLATION_LEDGER_UNAVAILABLE'
    throw error
  }

  const insert = db.prepare(`
    INSERT INTO translation_receipts (
      receipt_id, period, rate_version, status,
      reserved_input_tokens, reserved_output_tokens, reserved_micro_cny,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'reserved', ?, ?, ?, ?, ?)
  `)
  const updateStatus = db.prepare(`
    UPDATE translation_receipts
    SET status = ?, actual_input_tokens = ?, actual_output_tokens = ?,
        actual_micro_cny = ?, updated_at = ?
    WHERE receipt_id = ?
  `)
  const load = db.prepare('SELECT * FROM translation_receipts WHERE receipt_id = ?')
  const periodCost = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN status IN ('settled') THEN actual_micro_cny
        WHEN status IN ('reserved', 'dispatched', 'unknown_held') THEN reserved_micro_cny
        ELSE 0
      END
    ), 0) AS micro
    FROM translation_receipts
    WHERE period = ?
  `)

  const budgetMicro = monthlyBudgetCny == null
    ? null
    : Math.round(monthlyBudgetCny * 1_000_000)

  function usedMicro(period = utcPeriod()) {
    return periodCost.get(period).micro
  }

  function remainingMicro(period = utcPeriod()) {
    if (budgetMicro == null) return 0
    return Math.max(0, budgetMicro - usedMicro(period))
  }

  return {
    available: true,
    budgetMicro,
    usedMicro,
    remainingMicro,
    canReserve(micro) {
      if (budgetMicro == null) return false
      return remainingMicro() >= micro
    },
    reserve({ inputTokens = FLASH_MAX_INPUT_TOKENS, outputTokens }) {
      if (budgetMicro == null) {
        const error = new Error('Translation budget is not configured')
        error.code = 'TRANSLATION_BUDGET_UNAVAILABLE'
        throw error
      }
      const reservedMicro = costMicroCny(inputTokens, INPUT_YUAN_PER_MILLION)
        + costMicroCny(outputTokens, OUTPUT_YUAN_PER_MILLION)
      if (reservedMicro > remainingMicro()) {
        const error = new Error('Translation monthly budget is exhausted')
        error.code = 'TRANSLATION_BUDGET_EXHAUSTED'
        error.retryable = true
        throw error
      }
      const now = new Date().toISOString()
      const receiptId = randomUUID()
      insert.run(
        receiptId,
        utcPeriod(),
        rateVersion,
        inputTokens,
        outputTokens,
        reservedMicro,
        now,
        now,
      )
      return {
        receiptId,
        reservedInputTokens: inputTokens,
        reservedOutputTokens: outputTokens,
        reservedMicroCny: reservedMicro,
      }
    },
    markDispatched(receiptId) {
      const row = load.get(receiptId)
      if (!row) return
      updateStatus.run('dispatched', null, null, null, new Date().toISOString(), receiptId)
    },
    release(receiptId) {
      const row = load.get(receiptId)
      if (!row || row.status === 'settled' || row.status === 'unknown_held') return
      updateStatus.run('released', 0, 0, 0, new Date().toISOString(), receiptId)
    },
    settle(receiptId, usage) {
      const row = load.get(receiptId)
      if (!row) return null
      if (!usage) {
        updateStatus.run(
          'unknown_held',
          row.reserved_input_tokens,
          row.reserved_output_tokens,
          row.reserved_micro_cny,
          new Date().toISOString(),
          receiptId,
        )
        return { actualMicroCny: row.reserved_micro_cny, held: true }
      }
      const actualMicro = costMicroCny(usage.promptTokens, INPUT_YUAN_PER_MILLION)
        + costMicroCny(usage.completionTokens, OUTPUT_YUAN_PER_MILLION)
      updateStatus.run(
        'settled',
        usage.promptTokens,
        usage.completionTokens,
        actualMicro,
        new Date().toISOString(),
        receiptId,
      )
      return { actualMicroCny: actualMicro, held: false }
    },
    close() {
      db.close()
    },
  }
}

export function unavailableLedger() {
  return {
    available: false,
    budgetMicro: null,
    usedMicro: () => 0,
    remainingMicro: () => 0,
    canReserve() { return false },
    reserve() {
      const error = new Error('Translation usage ledger is unavailable')
      error.code = 'TRANSLATION_LEDGER_UNAVAILABLE'
      throw error
    },
    markDispatched() {},
    release() {},
    settle() { return null },
    close() {},
  }
}
