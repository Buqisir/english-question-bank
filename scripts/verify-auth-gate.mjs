#!/usr/bin/env node
// M0-2 verify: invite-login auth gate contract (docs/cuts/m0-2-invite-login/plan.md
// verification 1). Spawns the real server (server/api.mjs) against a temp,
// throwaway question-bank + user-data pair so it exercises the actual HTTP gate,
// the actual create-user CLI (as a child process, not just its exported
// functions), and the actual login/logout/me routes — not a hermetic
// re-implementation of the gate logic.
//
// Assertions use status codes + response body fields throughout (never regex
// matches that an empty string would also satisfy) — the M0-1 MF-4 false-green
// lesson this repo already learned once (see docs/cuts/m0-1-user-db-split).
//
// Sub-cases (plan.md verification 1):
//   (a) empty users table -> bootstrap-open mode: any existing API 200,
//       GET /api/auth/me reports authRequired: false.
//   (b) scripts/create-user.mjs run as a real child process (not just its
//       exported helpers) creates a working account.
//   (c) forced mode: no cookie -> 401; wrong password -> 401; GET /api/health
//       still 200 without a cookie (PA MF-2); /paper-assets/ static path 401
//       without a cookie; correct login -> 200 + Set-Cookie, and that cookie
//       then unlocks a previously-401 API.
//   (d) logout invalidates the cookie (subsequent request with the same
//       cookie is 401 again).
//   (e) --disable takes effect immediately (a still-valid cookie 401s right
//       after disabling, without needing to log out first).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-auth-gate-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
const apiPort = 9891

const env = {
  ...process.env,
  QUESTION_BANK_DB: dbPath,
  USER_DATA_DB: userDataDbPath,
  QUESTION_BANK_API_PORT: String(apiPort),
}

function seedMinimalBankDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS question_groups (id TEXT PRIMARY KEY)')
  db.close()
}

const children = []

function startServer() {
  const child = spawn('node', ['server/api.mjs'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let logBuffer = ''
  child.stdout.on('data', (chunk) => {
    logBuffer += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    logBuffer += chunk.toString()
  })
  child.getLog = () => logBuffer
  return child
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.status) return
    } catch {
      // keep waiting for the server to come up
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function req(urlPath, { method = 'GET', body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  const response = await fetch(`http://127.0.0.1:${apiPort}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const setCookie = response.headers.get('set-cookie')
  let json = null
  try {
    json = await response.json()
  } catch {
    // some responses (e.g. static file 200s) are not JSON; callers that need
    // the body always request a JSON endpoint.
  }
  return { status: response.status, json, setCookie }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/create-user.mjs', ...args], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.stderr.on('data', (chunk) => (output += chunk.toString()))
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`create-user.mjs ${args.join(' ')} exited with code ${code}\n${output}`))
    })
  })
}

function cookieHeaderFrom(setCookieValue) {
  return setCookieValue.split(';')[0]
}

async function main() {
  seedMinimalBankDatabase()
  const server = startServer()

  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

    // (a) bootstrap-open mode: users table is empty.
    const openHealth = await req('/api/health')
    assert('(a) open mode: GET /api/health is 200', openHealth.status === 200)

    const openMe = await req('/api/auth/me')
    assert(
      '(a) open mode: GET /api/auth/me reports authRequired: false, user: null',
      openMe.status === 200 && openMe.json?.authRequired === false && openMe.json?.user === null,
      `got status=${openMe.status} body=${JSON.stringify(openMe.json)}`,
    )

    const openDraftPapers = await req('/api/draft-papers')
    assert(
      '(a) open mode: an ordinary API (GET /api/draft-papers) is 200 with no cookie',
      openDraftPapers.status === 200,
      `got status=${openDraftPapers.status}`,
    )

    // (b) create-user.mjs run as a real child process.
    const cliOutput = await runCli(['--username', 'verify-owner', '--password', 'Verify-Pass-123', '--role', 'owner'])
    assert(
      '(b) create-user.mjs creates the account (child process, real CLI invocation)',
      /created user "verify-owner"/.test(cliOutput),
      `cli output: ${cliOutput}`,
    )

    // (c) forced mode now that a user exists.
    const forcedNoCookie = await req('/api/draft-papers')
    assert(
      '(c) forced mode: no cookie -> 401 { error: "not_authenticated" }',
      forcedNoCookie.status === 401 && forcedNoCookie.json?.error === 'not_authenticated',
      `got status=${forcedNoCookie.status} body=${JSON.stringify(forcedNoCookie.json)}`,
    )

    const forcedHealth = await req('/api/health')
    assert(
      '(c) forced mode: GET /api/health still 200 with no cookie (PA MF-2)',
      forcedHealth.status === 200,
      `got status=${forcedHealth.status}`,
    )

    const forcedPaperAssets = await req('/paper-assets/does-not-exist.json')
    assert(
      '(c) forced mode: GET /paper-assets/* is 401 with no cookie (static special-case is gated)',
      forcedPaperAssets.status === 401 && forcedPaperAssets.json?.error === 'not_authenticated',
      `got status=${forcedPaperAssets.status} body=${JSON.stringify(forcedPaperAssets.json)}`,
    )

    const wrongPassword = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-owner', password: 'wrong-password' },
    })
    assert(
      '(c) wrong password -> 401 { error: "invalid_credentials" }',
      wrongPassword.status === 401 && wrongPassword.json?.error === 'invalid_credentials',
      `got status=${wrongPassword.status} body=${JSON.stringify(wrongPassword.json)}`,
    )

    const nonexistentUser = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'no-such-user', password: 'irrelevant' },
    })
    assert(
      '(c) nonexistent username -> same 401 { error: "invalid_credentials" } (no enumeration)',
      nonexistentUser.status === 401 && nonexistentUser.json?.error === 'invalid_credentials',
      `got status=${nonexistentUser.status} body=${JSON.stringify(nonexistentUser.json)}`,
    )

    const login = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-owner', password: 'Verify-Pass-123' },
    })
    assert(
      '(c) correct login -> 200 + user body + Set-Cookie',
      login.status === 200 && login.json?.user?.username === 'verify-owner' && Boolean(login.setCookie),
      `got status=${login.status} body=${JSON.stringify(login.json)} setCookie=${login.setCookie}`,
    )
    const cookie = cookieHeaderFrom(login.setCookie)

    const withCookie = await req('/api/draft-papers', { cookie })
    assert(
      '(c) with valid cookie: previously-401 API is now 200',
      withCookie.status === 200,
      `got status=${withCookie.status}`,
    )

    const meWithCookie = await req('/api/auth/me', { cookie })
    assert(
      '(c) with valid cookie: GET /api/auth/me reports authRequired: true, user.username',
      meWithCookie.status === 200 &&
        meWithCookie.json?.authRequired === true &&
        meWithCookie.json?.user?.username === 'verify-owner' &&
        meWithCookie.json?.user?.role === 'owner',
      `got status=${meWithCookie.status} body=${JSON.stringify(meWithCookie.json)}`,
    )

    // (d) logout invalidates the cookie.
    const logoutResult = await req('/api/auth/logout', { method: 'POST', cookie })
    assert(
      '(d) logout -> 200 { ok: true }',
      logoutResult.status === 200 && logoutResult.json?.ok === true,
      `got status=${logoutResult.status} body=${JSON.stringify(logoutResult.json)}`,
    )

    const afterLogout = await req('/api/draft-papers', { cookie })
    assert(
      '(d) same cookie after logout -> 401 (session was deleted server-side)',
      afterLogout.status === 401 && afterLogout.json?.error === 'not_authenticated',
      `got status=${afterLogout.status} body=${JSON.stringify(afterLogout.json)}`,
    )

    // (e) --disable takes effect immediately, without needing to log out first.
    const secondLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-owner', password: 'Verify-Pass-123' },
    })
    assert('(e) setup: second login succeeds before disabling', secondLogin.status === 200, `got status=${secondLogin.status}`)
    const secondCookie = cookieHeaderFrom(secondLogin.setCookie)

    const beforeDisable = await req('/api/draft-papers', { cookie: secondCookie })
    assert('(e) setup: cookie works before --disable', beforeDisable.status === 200, `got status=${beforeDisable.status}`)

    await runCli(['--disable', '--username', 'verify-owner'])

    const afterDisable = await req('/api/draft-papers', { cookie: secondCookie })
    assert(
      '(e) --disable takes effect immediately: still-valid cookie now 401s',
      afterDisable.status === 401 && afterDisable.json?.error === 'not_authenticated',
      `got status=${afterDisable.status} body=${JSON.stringify(afterDisable.json)}`,
    )
  } finally {
    for (const child of children) child.kill()
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

await main()

if (failed > 0) {
  console.error(`\nAuth gate verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nAuth gate verify passed: ${passed} passed, 0 failed`)
