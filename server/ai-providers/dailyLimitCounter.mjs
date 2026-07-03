// AI global daily request-count limiter (cut m0-5-ai-daily-limit).
//
// Scope per docs/cuts/m0-5-ai-daily-limit/plan.md:
//   - Counts server-key-only DeepSeek out-station calls (one count per
//     callDeepSeekWithFallback invocation — see completionRunner.mjs).
//   - Day boundary is Beijing time (UTC+8) natural day, NOT UTC.
//   - Storage is an in-memory counter write-through to a JSON snapshot file
//     (server/logs/ by default). Never touches SQLite / user_version.
//   - All snapshot I/O is fail-soft: a read/write failure must never break
//     the AI request path (same philosophy as api.mjs's appendVerifyAudit).
//
// This module is a plain factory (no module-level singleton) so tests can
// construct independent counters against independent snapshot paths.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const AI_DAILY_LIMIT_EXCEEDED_CODE = 'ai-daily-limit-exceeded'

export class AiDailyLimitExceededError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiDailyLimitExceededError'
    this.code = AI_DAILY_LIMIT_EXCEEDED_CODE
    this.statusCode = 429
  }
}

/** Beijing (UTC+8) natural-day key, e.g. "2026-07-03". Independent of host TZ. */
export function beijingDayKey(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Resolve the configured daily limit from an env-style string.
 * Missing / non-numeric / negative -> DEFAULT_LIMIT (plan §5: default 500).
 * '0' (or any <= 0 numeric) -> 0, which callers treat as "unlimited" (plan
 * "参考实现" note: 0 视为不限，计数照常进行).
 */
export function resolveDailyLimit(rawValue, defaultLimit = 500) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return defaultLimit
  const n = Number(rawValue)
  if (!Number.isFinite(n) || n < 0) return defaultLimit
  return Math.floor(n)
}

export function createDailyLimitCounter({ limit, snapshotPath, now = () => Date.now() } = {}) {
  const resolvedLimit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 500

  let state = { dayKey: beijingDayKey(now()), count: 0 }

  function loadFromDisk() {
    if (!snapshotPath) return
    try {
      if (!existsSync(snapshotPath)) return
      const raw = readFileSync(snapshotPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed.dayKey === 'string' &&
        Number.isFinite(parsed.count) &&
        parsed.count >= 0
      ) {
        state = { dayKey: parsed.dayKey, count: Math.floor(parsed.count) }
      }
    } catch {
      // Corrupt/unreadable snapshot: fail-soft, start from 0 (C7).
    }
  }

  function persist() {
    if (!snapshotPath) return
    try {
      mkdirSync(path.dirname(snapshotPath), { recursive: true })
      writeFileSync(snapshotPath, JSON.stringify(state), { encoding: 'utf8' })
    } catch {
      // Fail-soft: persistence must never break the AI request path (C7).
    }
  }

  // Lazy read-back on construction (plan "参考实现": 启动懒读回).
  loadFromDisk()

  /** Roll the in-memory state over to today's Beijing day-key if it has changed. */
  function rollDayIfNeeded() {
    const todayKey = beijingDayKey(now())
    if (state.dayKey !== todayKey) {
      state = { dayKey: todayKey, count: 0 }
      persist()
    }
  }

  function isExceeded() {
    rollDayIfNeeded()
    if (resolvedLimit === 0) return false
    return state.count >= resolvedLimit
  }

  function increment() {
    rollDayIfNeeded()
    state = { dayKey: state.dayKey, count: state.count + 1 }
    persist()
    return state.count
  }

  function getStatus() {
    rollDayIfNeeded()
    return {
      limit: resolvedLimit,
      used: state.count,
      exceeded: isExceeded(),
    }
  }

  return {
    isExceeded,
    increment,
    getStatus,
  }
}
