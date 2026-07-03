// Auth data shape + pure helpers for the M0-2 invite-login cut.
// Schema, hashing, and session lifecycle live here (single source of truth),
// mirroring the server/my-space/mySpace.mjs precedent: ensure*DatabaseShape is
// exported so both the server startup path and scripts/create-user.mjs share it
// without duplicating the schema.
//
// See docs/cuts/m0-2-invite-login/plan.md decisions 1/3/4/5 and
// docs/adr/0012-invite-login-auth-design.md for the design rationale
// (bootstrap-open mode, random-token sessions over HMAC signing, argon2id,
// PRAGMA user_version as a schema-version anchor).
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import argon2 from 'argon2'

const SESSION_COOKIE_NAME = 'eqb_session'
const SESSION_TTL_DAYS = 30
const SESSION_RENEW_THRESHOLD_DAYS = 15
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function ensureAuthDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `)
}

function nowIso() {
  return new Date().toISOString()
}

function addDaysIso(fromDate, days) {
  return new Date(fromDate.getTime() + days * MS_PER_DAY).toISOString()
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function hashPassword(password) {
  return argon2.hash(String(password))
}

export async function verifyPassword(passwordHash, password) {
  try {
    return await argon2.verify(passwordHash, String(password))
  } catch {
    // argon2.verify throws on malformed/foreign hash strings rather than
    // returning false; treat that the same as "password does not match".
    return false
  }
}

// users table row -> public user shape (never leaks password_hash).
export function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
  }
}

export function countUsers(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM users').get().count
}

export function findUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim())
}

export function findUserById(db, userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
}

export function createUser(db, { username, passwordHash, role = 'member' }) {
  const trimmedUsername = String(username || '').trim()
  if (!trimmedUsername) throw new Error('用户名不能为空')
  const id = `user-${randomUUID()}`
  const timestamp = nowIso()
  try {
    db.prepare(
      `
      INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
      `,
    ).run(id, trimmedUsername, passwordHash, role, timestamp, timestamp)
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) throw new Error('用户名已存在')
    throw error
  }
  return findUserById(db, id)
}

export function setUserPasswordHash(db, userId, passwordHash) {
  const result = db
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, nowIso(), userId)
  if (result.changes === 0) throw new Error('用户不存在')
}

export function setUserStatus(db, userId, status) {
  const result = db
    .prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowIso(), userId)
  if (result.changes === 0) throw new Error('用户不存在')
}

export function deleteSessionsForUser(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

// Creates a session row and returns the raw (unhashed) token — the only place
// the raw token exists; only its sha256 is ever persisted.
export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const timestamp = nowIso()
  const expiresAt = addDaysIso(new Date(), SESSION_TTL_DAYS)
  db.prepare(
    `
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
    `,
  ).run(tokenHash, userId, timestamp, expiresAt)
  return token
}

export function destroySessionByToken(db, token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

// Reads the session cookie from a request's Cookie header, without any web
// framework — this repo has none (plan.md decision 2).
export function parseCookies(request) {
  const header = request.headers?.cookie
  const cookies = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) continue
    const key = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1).trim()
    if (!key) continue
    try {
      cookies[key] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
  }
  return cookies
}

export function readSessionTokenFromRequest(request) {
  return parseCookies(request)[SESSION_COOKIE_NAME] || null
}

// Validates a raw token against the sessions/users join (active user, not
// expired). Only this read runs on every gated request; the sliding-renewal
// write (decision 3) is a separate opt-in call so callers control which
// connection does the write.
export function readSession(db, token) {
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = db
    .prepare(
      `
      SELECT s.token_hash, s.user_id, s.expires_at, u.id AS user_id_check, u.username, u.role, u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
        AND u.status = 'active'
      `,
    )
    .get(tokenHash, nowIso())
  if (!row) return null
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    expiresAt: row.expires_at,
  }
}

// True when the session's remaining TTL has dropped under the renewal
// threshold (decision 3: sliding renewal only when < 15 days remain).
export function sessionNeedsRenewal(session) {
  if (!session) return false
  const remainingMs = new Date(session.expiresAt).getTime() - Date.now()
  return remainingMs < SESSION_RENEW_THRESHOLD_DAYS * MS_PER_DAY
}

export function renewSession(db, tokenHash) {
  const expiresAt = addDaysIso(new Date(), SESSION_TTL_DAYS)
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, tokenHash)
  return expiresAt
}

// Builds the Set-Cookie header value for a login response. `secure` should be
// true only when the incoming request was https (decision 3).
export function buildSessionCookie(token, { secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildExpiredSessionCookie({ secure = false } = {}) {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function isRequestSecure(request) {
  // No TLS termination info from node:http directly; a reverse proxy (M1)
  // would set this. Local dev is always http, so this stays false until M1.
  const forwardedProto = request.headers?.['x-forwarded-proto']
  if (forwardedProto) return String(forwardedProto).split(',')[0].trim() === 'https'
  return Boolean(request.socket?.encrypted)
}

export const AUTH_COOKIE_NAME = SESSION_COOKIE_NAME
