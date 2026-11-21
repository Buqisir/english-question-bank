import { createHash, randomBytes, randomUUID } from 'node:crypto'

const agentScopes = ['read', 'report:append', 'drafts:write']
export const reportsPath = /^\/api\/agent\/v1\/reports$/
export const draftsPath = /^\/api\/agent\/v1\/drafts\/([^/]+)\/([^/]+)$/

export function ensureAgentTokenShape(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_tokens (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT,
    scope TEXT NOT NULL DEFAULT '["read"]'
  )`)
  if (!db.prepare('PRAGMA table_info(agent_tokens)').all().some(column => column.name === 'scope')) {
    db.exec(`ALTER TABLE agent_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT '["read"]'`)
  }
}

const hash = token => createHash('sha256').update(token).digest('hex')
const columns = 'id, name, created_at AS createdAt, revoked_at AS revokedAt, last_used_at AS lastUsedAt, scope'
const projectToken = row => ({ ...row, scope: JSON.parse(row.scope) })
export const listAgentTokens = db => db.prepare(`SELECT ${columns} FROM agent_tokens ORDER BY created_at DESC, id`).all().map(projectToken)

export function createAgentToken(db, { name, scope = ['read'] } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw Object.assign(new Error('填写 1–100 字的名称。'), { status: 400 })
  }
  if (!Array.isArray(scope) || scope.length === 0 || !scope.every(item => agentScopes.includes(item))) {
    throw Object.assign(new Error('至少选择一项有效权限。'), { status: 400 })
  }
  const selected = agentScopes.filter(item => scope.includes(item))
  // Pre-scope servers must reject write-only tokens if the deploy rolls back.
  const prefix = selected.includes('read') ? 'eqb_agent_' : 'eqb_agent_s1_'
  const token = `${prefix}${randomBytes(32).toString('base64url')}`
  const id = randomUUID()
  db.prepare('INSERT INTO agent_tokens (id, name, token_hash, created_at, scope) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), hash(token), new Date().toISOString(), JSON.stringify(selected))
  return { ...projectToken(db.prepare(`SELECT ${columns} FROM agent_tokens WHERE id = ?`).get(id)), token }
}

export function revokeAgentToken(db, id) {
  return db.prepare('UPDATE agent_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
    .run(new Date().toISOString(), id).changes > 0
}

// Per-process fixed windows. Only valid credentials enter the map; expired
// windows are swept so unused/revoked token IDs do not accumulate.
export function createAgentAuthGate({ openUserDatabase, sendJson }) {
  const windows = new Map()
  return (request, response, pathname) => {
    const token = /^Bearer (eqb_agent_(?:s1_)?[A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization || '')?.[1]
    const db = openUserDatabase({ readOnly: true })
    let row
    try {
      row = token && db.prepare('SELECT id, scope FROM agent_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hash(token))
    } finally { db.close() }
    response.setHeader('Cache-Control', 'no-store')
    if (!row) { sendJson(response, 401, { error: 'not_authenticated' }); return null }
    const policy = reportsPath.test(pathname) ? { scope: 'report:append', methods: ['GET', 'POST'], limit: 30 }
      : draftsPath.test(pathname) ? { scope: 'drafts:write', methods: ['GET', 'PUT'], limit: 30 }
        : { scope: 'read', methods: ['GET'], limit: 120 }
    if (!policy.methods.includes(request.method)) {
      response.setHeader('Allow', policy.methods.join(', '))
      sendJson(response, 405, { error: 'method_not_allowed' }); return null
    }
    const scope = JSON.parse(row.scope)
    if (pathname !== '/api/agent/v1/meta' && !scope.includes(policy.scope)) {
      sendJson(response, 403, { error: 'insufficient_scope' }); return null
    }
    const now = Date.now()
    for (const [key, window] of windows) if (now >= window.until) windows.delete(key)
    const key = `${row.id}:${policy.scope}`
    let window = windows.get(key)
    if (!window) { window = { count: 0, until: now + 60_000 }; windows.set(key, window) }
    if (++window.count > policy.limit) {
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
    return { session: null, authMode: 'enforced', agent: { tokenId: row.id, scope } }
  }
}
