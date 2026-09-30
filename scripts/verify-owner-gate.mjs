#!/usr/bin/env node
// M0-3 verify: owner/member role gate contract (docs/cuts/m0-3-role-gate/plan.md
// verification 3a). Spawns the real server (server/api.mjs) against a temp,
// throwaway question-bank + user-data pair — same approach as
// scripts/verify-auth-gate.mjs (temp DBs, real create-user.mjs child process,
// real HTTP requests, never a hermetic re-implementation of the gate).
//
// Assertions use status codes + response body fields throughout (never regex
// matches an empty string would also satisfy — the M0-1 MF-4 false-green lesson).
//
// Plan.md 3a sub-cases:
//   1. build owner + member accounts, log both in, keep their cookies.
//   2. member hits every 1b/1c gated route -> 403 { error: 'forbidden' } (no
//      need for a legal body — the gate runs before body read).
//   3. owner hits the same batch -> never 401/403 (400/404/200 all pass the
//      gate; downstream validation is out of scope here).
//   4. member hits an allowed-surface sample -> never 403.
//   5. bootstrap-open mode (empty users table, fresh temp DB/server) -> gated
//      routes are not 401/403 (open mode = owner view, ADR-0013 decision 2).
//   6. the 403 body is always exactly { error: 'forbidden' } (no route-existence
//      leakage via a different shape).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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

function seedMinimalBankDatabase(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS question_groups (id TEXT PRIMARY KEY)')
  db.close()
}

const children = []

function startServer(env) {
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

function makeReq(apiPort) {
  return async function req(urlPath, { method = 'GET', body, cookie } = {}) {
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
      // some responses are not JSON; callers that need the body use a JSON route
    }
    return { status: response.status, json, setCookie }
  }
}

function runCli(args, env) {
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

// Plan.md 1b (whole-module) + 1c (per-route) gated route enumeration, matching
// the actual defineRoute calls (verified by DEV against the source files, not
// guessed from the plan prose). Path params use a fake id — the gate runs before
// any handler/lookup, so a nonexistent id must still 403 for a blocked caller.
const FAKE_ID = 'verify-fake-id'
const GATED_ROUTES = [
  // server/topic-labels/topicLabelBackfillRoutes.mjs (1; whole module)
  { method: 'POST', path: '/api/topic-labels/backfill', body: {} },

  // server/grammar-verb-profile/verbProfileBackfillRoutes.mjs (D4) — route
  // retired in D1 (grammar-facets-v2): tense/voice/agreementSensitive now
  // live on the analysis-v2 blank entry directly, no sidecar backfill route
  // to gate. verify-grammar-facets-v2.mjs asserts the path now 404s for
  // everyone instead.

  // server/question-bank/questionGroupRoutes.mjs (9 of its routes; GETs excluded)
  { method: 'POST', path: '/api/question-groups', body: {} },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}`, body: {} },
  { method: 'DELETE', path: `/api/question-groups/${FAKE_ID}` },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}/reading-parse`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/reading-parse`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/cloze-parse`, body: {} },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}/cloze-parse`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/seven-choices-parse`, body: {} },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}/seven-choices-parse`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/grammar-parse`, body: {} },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}/grammar-parse`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/summary`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/topic-labels`, body: {} },
  { method: 'POST', path: `/api/question-groups/${FAKE_ID}/synonym-difficulty`, body: {} },
  { method: 'PUT', path: `/api/question-groups/${FAKE_ID}/topic-labels`, body: {} },
  { method: 'PUT', path: `/api/questions/${FAKE_ID}/difficulty-rating`, body: {} },

  // server/paper-sets/routes.mjs (2 of its routes; GETs excluded)
  { method: 'POST', path: '/api/paper-sets', body: {} },
  { method: 'PUT', path: `/api/paper-sets/${FAKE_ID}`, body: {} },
]

// Plan.md 3a assertion 4: allowed-surface sample a member must be able to reach
// without ever seeing a 403 (per-route status may vary — 200/201/400/404 all
// count as "passed the gate").
const ALLOWED_SAMPLE_ROUTES = [
  { method: 'GET', path: '/api/question-groups' },
  { method: 'GET', path: '/api/paper-sets' },
  { method: 'GET', path: '/api/my-space' },
  { method: 'POST', path: '/api/draft-papers/current/items', body: { groupId: 'verify-nonexistent-group' } },
  { method: 'GET', path: '/api/auth/me' },
  // Personal annotations (#489) belong to every signed-in member, not only the owner.
  { method: 'GET', path: '/api/personal-paper-layers/verify-nonexistent-paper' },
]

async function seedBootstrapOpenModeFixture() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-owner-gate-open-'))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  // Hermeticity: without this override the owner pass through
  // /api/grammar-fill/verb-profiles/backfill scans and writes sidecar files
  // into the real app/public/paper-assets tree.
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  mkdirSync(paperAssetsDir, { recursive: true })
  const apiPort = 9893
  seedMinimalBankDatabase(dbPath)
  const env = {
    ...process.env,
    QUESTION_BANK_DB: dbPath,
    USER_DATA_DB: userDataDbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
    QUESTION_BANK_API_PORT: String(apiPort),
  }
  return { tempRoot, apiPort, env }
}

async function main() {
  // --- Fixture A: forced mode (owner + member accounts) ---
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-owner-gate-'))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  // Hermeticity: see seedBootstrapOpenModeFixture — keep sidecar writes
  // out of the real paper-assets tree.
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  mkdirSync(paperAssetsDir, { recursive: true })
  const apiPort = 9892
  seedMinimalBankDatabase(dbPath)
  const env = {
    ...process.env,
    QUESTION_BANK_DB: dbPath,
    USER_DATA_DB: userDataDbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
    QUESTION_BANK_API_PORT: String(apiPort),
  }
  const req = makeReq(apiPort)
  const server = startServer(env)

  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

    // 1. build owner + member accounts, log both in.
    await runCli(['--username', 'verify-role-owner', '--password', 'Verify-Pass-123', '--role', 'owner'], env)
    await runCli(['--username', 'verify-role-member', '--password', 'Verify-Pass-123', '--role', 'member'], env)

    const ownerLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-role-owner', password: 'Verify-Pass-123' },
    })
    assert(
      '1. owner login succeeds',
      ownerLogin.status === 200 && Boolean(ownerLogin.setCookie),
      `got status=${ownerLogin.status}`,
    )
    const ownerCookie = cookieHeaderFrom(ownerLogin.setCookie)

    const memberLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-role-member', password: 'Verify-Pass-123' },
    })
    assert(
      '1. member login succeeds',
      memberLogin.status === 200 && Boolean(memberLogin.setCookie),
      `got status=${memberLogin.status}`,
    )
    const memberCookie = cookieHeaderFrom(memberLogin.setCookie)

    // 2. member hits every gated route -> 403 { error: 'forbidden' }.
    let memberBlockedCount = 0
    let bodyShapeViolation = null
    for (const route of GATED_ROUTES) {
      const result = await req(route.path, { method: route.method, body: route.body, cookie: memberCookie })
      if (result.status === 403) memberBlockedCount += 1
      else {
        assert(
          `2. member ${route.method} ${route.path} -> 403`,
          false,
          `got status=${result.status} body=${JSON.stringify(result.json)}`,
        )
      }
      // 6. body shape check inline (avoid a second full pass over the same routes).
      const isForbiddenShape =
        result.status !== 403 ||
        (result.json && Object.keys(result.json).length === 1 && result.json.error === 'forbidden')
      if (!isForbiddenShape) {
        bodyShapeViolation = `${route.method} ${route.path} -> ${JSON.stringify(result.json)}`
      }
    }
    assert(
      `2. member blocked on all ${GATED_ROUTES.length} gated routes (403 forbidden)`,
      memberBlockedCount === GATED_ROUTES.length,
      `blocked ${memberBlockedCount}/${GATED_ROUTES.length}`,
    )
    assert('6. every 403 body is exactly { error: "forbidden" }', bodyShapeViolation === null, bodyShapeViolation || '')

    // 3. owner hits the same batch -> never 401/403.
    let ownerNeverBlocked = true
    let ownerBlockedDetail = ''
    for (const route of GATED_ROUTES) {
      const result = await req(route.path, { method: route.method, body: route.body, cookie: ownerCookie })
      if (result.status === 401 || result.status === 403) {
        ownerNeverBlocked = false
        ownerBlockedDetail = `${route.method} ${route.path} -> ${result.status}`
        break
      }
    }
    assert(`3. owner never 401/403 on any of ${GATED_ROUTES.length} gated routes`, ownerNeverBlocked, ownerBlockedDetail)

    // 4. member hits an allowed-surface sample -> never 403.
    let memberSampleNeverForbidden = true
    let memberSampleDetail = ''
    for (const route of ALLOWED_SAMPLE_ROUTES) {
      const result = await req(route.path, { method: route.method, body: route.body, cookie: memberCookie })
      if (result.status === 403) {
        memberSampleNeverForbidden = false
        memberSampleDetail = `${route.method} ${route.path} -> 403`
        break
      }
    }
    assert(
      `4. member never 403 on allowed-surface sample (${ALLOWED_SAMPLE_ROUTES.length} routes)`,
      memberSampleNeverForbidden,
      memberSampleDetail,
    )
  } finally {
    for (const child of children) child.kill()
    rmSync(tempRoot, { recursive: true, force: true })
  }

  // --- Fixture B: bootstrap-open mode (empty users table) ---
  const openFixture = await seedBootstrapOpenModeFixture()
  const openReq = makeReq(openFixture.apiPort)
  const openServer = startServer(openFixture.env)
  try {
    await waitForHttp(`http://127.0.0.1:${openFixture.apiPort}/api/health`)

    // 5. open mode: gated routes are not 401/403 (sample, not the full
    // enumeration — the route-enumeration coverage is already proven by
    // fixture A; this fixture only needs to prove the authMode branch, not
    // re-enumerate).
    // representative spread (first/middle/last); length-relative so future
    // route retirements never silently re-point the sample.
    const openModeSample = [
      GATED_ROUTES[0],
      GATED_ROUTES[Math.floor(GATED_ROUTES.length / 2)],
      GATED_ROUTES[GATED_ROUTES.length - 1],
    ]
    let openModeNeverBlocked = true
    let openModeDetail = ''
    for (const route of openModeSample) {
      const result = await openReq(route.path, { method: route.method, body: route.body })
      if (result.status === 401 || result.status === 403) {
        openModeNeverBlocked = false
        openModeDetail = `${route.method} ${route.path} -> ${result.status}`
        break
      }
    }
    assert(
      `5. bootstrap-open mode: gated-route sample (${openModeSample.length}) never 401/403`,
      openModeNeverBlocked,
      openModeDetail,
    )
  } finally {
    for (const child of children) child.kill()
    rmSync(openFixture.tempRoot, { recursive: true, force: true })
  }
}

await main()

if (failed > 0) {
  console.error(`\nOwner gate verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nOwner gate verify passed: ${passed} passed, 0 failed`)
