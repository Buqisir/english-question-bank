import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const STORE_MAX_ENTRIES = 50_000
export const STORE_MAX_REPLY_BYTES = 256 * 1024 * 1024

// Stores the accepted model reply rather than the compiled analysis: the
// converter changes far more often than the prompt version, and a reply is
// recompiled on read so stored sentences always follow the current converter
// without another model call.
export function createSentenceAnalysisStore({
  filePath,
  maxEntries = STORE_MAX_ENTRIES,
  maxReplyBytes = STORE_MAX_REPLY_BYTES,
  now = () => Date.now(),
} = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 3000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentence_analysis_replies (
      cache_key TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      sentence_text TEXT NOT NULL,
      context_text TEXT NOT NULL,
      reply TEXT NOT NULL,
      reply_bytes INTEGER NOT NULL,
      lenient INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sentence_analysis_replies_accessed
      ON sentence_analysis_replies(last_accessed_at);
  `)

  const select = db.prepare('SELECT reply, lenient FROM sentence_analysis_replies WHERE cache_key = ?')
  const touch = db.prepare('UPDATE sentence_analysis_replies SET last_accessed_at = ?, hits = hits + 1 WHERE cache_key = ?')
  const insert = db.prepare(`
    INSERT INTO sentence_analysis_replies
      (cache_key, model, prompt_version, sentence_text, context_text, reply, reply_bytes, lenient, attempts, created_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      reply = excluded.reply,
      reply_bytes = excluded.reply_bytes,
      lenient = excluded.lenient,
      attempts = excluded.attempts,
      created_at = excluded.created_at,
      last_accessed_at = excluded.last_accessed_at
  `)
  const remove = db.prepare('DELETE FROM sentence_analysis_replies WHERE cache_key = ?')
  const count = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(reply_bytes), 0) AS bytes FROM sentence_analysis_replies')
  const oldest = db.prepare('SELECT cache_key FROM sentence_analysis_replies ORDER BY last_accessed_at ASC LIMIT ?')

  const stamp = () => new Date(now()).toISOString()

  function evictOverflow() {
    for (;;) {
      const stats = count.get()
      const extraEntries = Math.max(0, stats.n - maxEntries)
      if (extraEntries === 0 && stats.bytes <= maxReplyBytes) return
      const rows = oldest.all(Math.min(64, Math.max(extraEntries, 1)))
      if (rows.length === 0) return
      for (const row of rows) remove.run(row.cache_key)
    }
  }

  return {
    get(cacheKey) {
      const row = select.get(cacheKey)
      if (!row) return null
      touch.run(stamp(), cacheKey)
      return { reply: row.reply, lenient: row.lenient === 1 }
    },
    set(cacheKey, { model, promptVersion, sentenceText, contextText, reply, lenient, attempts }) {
      const at = stamp()
      insert.run(cacheKey, model, promptVersion, sentenceText, contextText, reply, Buffer.byteLength(reply, 'utf8'), lenient ? 1 : 0, attempts, at, at)
      evictOverflow()
    },
    delete(cacheKey) {
      remove.run(cacheKey)
    },
    stats() {
      const row = count.get()
      return { entries: row.n, replyBytes: row.bytes }
    },
    close() {
      db.close()
    },
  }
}
