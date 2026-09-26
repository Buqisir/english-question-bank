import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  MEMORY_CACHE_MAX_BYTES,
  SQLITE_CACHE_MAX_ENTRIES,
  SQLITE_CACHE_MAX_PAYLOAD_BYTES,
} from '../../shared/paper-selection/constants.mjs'
import { createBoundedLru } from './boundedLru.mjs'

function payloadBytesOf(record) {
  return Buffer.byteLength(JSON.stringify(record), 'utf8')
}

export function createTranslationCacheStore({
  filePath,
} = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 3000')
  db.exec('PRAGMA cache_size = -2000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS translation_results (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_translation_results_accessed
      ON translation_results(last_accessed_at);
  `)

  const memory = createBoundedLru({ maxBytes: MEMORY_CACHE_MAX_BYTES })
  const select = db.prepare('SELECT payload FROM translation_results WHERE cache_key = ?')
  const touch = db.prepare(
    'UPDATE translation_results SET last_accessed_at = ? WHERE cache_key = ?',
  )
  const insert = db.prepare(`
    INSERT INTO translation_results (cache_key, payload, payload_bytes, created_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload = excluded.payload,
      payload_bytes = excluded.payload_bytes,
      last_accessed_at = excluded.last_accessed_at
  `)
  const count = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(payload_bytes), 0) AS bytes FROM translation_results')
  const oldest = db.prepare(`
    SELECT cache_key FROM translation_results
    ORDER BY last_accessed_at ASC
    LIMIT ?
  `)
  const remove = db.prepare('DELETE FROM translation_results WHERE cache_key = ?')

  function evictOverflow() {
    const stats = count.get()
    let extraEntries = Math.max(0, stats.n - SQLITE_CACHE_MAX_ENTRIES)
    let extraBytes = Math.max(0, stats.bytes - SQLITE_CACHE_MAX_PAYLOAD_BYTES)
    if (extraEntries === 0 && extraBytes === 0) return
    const batch = Math.min(64, Math.max(extraEntries, extraBytes > 0 ? 8 : 0))
    if (batch <= 0) return
    const rows = oldest.all(batch)
    for (const row of rows) {
      remove.run(row.cache_key)
      memory.delete(row.cache_key)
    }
  }

  return {
    get(cacheKey) {
      const cached = memory.get(cacheKey)
      if (cached) return cached
      const row = select.get(cacheKey)
      if (!row) return null
      const payload = JSON.parse(row.payload)
      touch.run(new Date().toISOString(), cacheKey)
      memory.set(cacheKey, payload, payloadBytesOf(payload))
      return payload
    },
    set(cacheKey, payload) {
      const now = new Date().toISOString()
      const serialized = JSON.stringify(payload)
      const bytes = Buffer.byteLength(serialized, 'utf8')
      insert.run(cacheKey, serialized, bytes, now, now)
      memory.set(cacheKey, payload, bytes)
      evictOverflow()
    },
    stats() {
      const row = count.get()
      return {
        sqliteEntries: row.n,
        sqlitePayloadBytes: row.bytes,
        memoryEntries: memory.size,
        memoryBytes: memory.bytes,
      }
    },
    close() {
      db.close()
    },
  }
}
