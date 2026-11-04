import { createHash, randomBytes, randomUUID } from 'node:crypto'

export function ensureAgentTokenShape(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_tokens (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL CHECK (scope IN ('published', 'test')),
    created_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
  )`)
}

const hash = token => createHash('sha256').update(token).digest('hex')
const columns = 'id, name, scope, created_at AS createdAt, revoked_at AS revokedAt, last_used_at AS lastUsedAt'
export const listAgentTokens = db => db.prepare(`SELECT ${columns} FROM agent_tokens ORDER BY created_at DESC, id`).all()

export function createAgentToken(db, { name, scope } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100
    || !['published', 'test'].includes(scope)) {
    throw Object.assign(new Error('填写 1–100 字的名称，并选择正式或测试范围。'), { status: 400 })
  }
  const token = `eqb_agent_${randomBytes(32).toString('base64url')}`
  const id = randomUUID()
  db.prepare('INSERT INTO agent_tokens (id, name, token_hash, scope, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), hash(token), scope, new Date().toISOString())
  return { ...db.prepare(`SELECT ${columns} FROM agent_tokens WHERE id = ?`).get(id), token }
}

export function revokeAgentToken(db, id) {
  return db.prepare('UPDATE agent_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
    .run(new Date().toISOString(), id).changes > 0
}

// Per-process fixed windows. Only valid credentials enter the map; expired
// windows are swept so unused/revoked token IDs do not accumulate.
export function createAgentAuthGate({ openUserDatabase, sendJson }) {
  const windows = new Map()
  return (request, response) => {
    const token = /^Bearer (eqb_agent_[A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization || '')?.[1]
    const db = openUserDatabase({ readOnly: true })
    let row
    try {
      row = token && db.prepare('SELECT id, scope FROM agent_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hash(token))
    } finally { db.close() }
    response.setHeader('Cache-Control', 'no-store')
    if (!row) { sendJson(response, 401, { error: 'not_authenticated' }); return null }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      sendJson(response, 405, { error: 'method_not_allowed' }); return null
    }
    const now = Date.now()
    for (const [id, window] of windows) if (now >= window.until) windows.delete(id)
    let window = windows.get(row.id)
    if (!window) { window = { count: 0, until: now + 60_000 }; windows.set(row.id, window) }
    if (++window.count > 120) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.until - now) / 1000))))
      sendJson(response, 429, { error: 'rate_limit_exceeded' }); return null
    }
    // Persist activity at most once per minute, including across API restarts.
    if (window.count === 1) {
      const writeDb = openUserDatabase({ readOnly: false })
      try {
        writeDb.prepare(`UPDATE agent_tokens SET last_used_at = ? WHERE id = ?
          AND (last_used_at IS NULL OR last_used_at < ?)`)
          .run(new Date(now).toISOString(), row.id, new Date(now - 60_000).toISOString())
      } finally { writeDb.close() }
    }
    return { session: null, authMode: 'enforced', agent: { tokenId: row.id, scope: row.scope } }
  }
}
