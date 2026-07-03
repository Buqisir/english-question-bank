#!/usr/bin/env node
// M0-5 — AI global daily request-count limit (docs/cuts/m0-5-ai-daily-limit/plan.md).
//
// Real HTTP server (spawns node server/api.mjs against temp DBs + a temp AI-usage
// snapshot path + a local mock DeepSeek HTTP server), following the same hermeticity
// discipline as scripts/verify-user-scope.mjs / verify-owner-gate.mjs: every path env
// var the plan's Forbidden section could touch is redirected to a throwaway temp dir,
// plus a dedicated port. DEEPSEEK_API_URL is redirected to a local mock server (new,
// additive env override in server/api.mjs — see completionRunner wiring) so no test
// call ever reaches the real DeepSeek endpoint.
//
// Five assertions, matching plan.md C9 1-5:
//   1. Limit set small via AI_DAILY_REQUEST_LIMIT -> hammer POST /api/ai/semantic-search
//      (server-key path, no apiKey in the request body) until it 429s with
//      { code: 'ai-daily-limit-exceeded' }.
//   2. After triggering the limit, a request WITH a client-supplied apiKey still
//      succeeds (200) — the mock DeepSeek server is still hit.
//   3. GET /api/ai/status returns { serverKeyAvailable, dailyLimit: {limit, used,
//      exceeded} } and exceeded flips true/false correctly across the two states above.
//   4. Snapshot file is written after increments; killing and respawning the server
//      process against the SAME snapshot path preserves `used` (fail-soft persistence,
//      not a fresh 0).
//   5. A hand-written snapshot file with yesterday's Beijing dayKey is loaded on
//      startup; the first request of "today" rolls the counter over to 0 before
//      counting that request (so used ends at 1, not (yesterday's count)+1).
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// ── Mock DeepSeek HTTP server ────────────────────────────────────────────────
// Always returns a well-formed rerank payload so semanticSearchQuestionGroups's
// parse step succeeds. Counts calls so tests can assert exactly how many actually
// reached "DeepSeek".
function startMockDeepSeek() {
  let callCount = 0
  const server = createServer((req, res) => {
    callCount += 1
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({ rankings: [{ questionGroupId: 'g-daily-limit-verify', score: 0.9, reason: 'mock' }] }),
            },
          },
        ],
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/chat/completions`,
        close: () => new Promise((r) => server.close(r)),
        get callCount() {
          return callCount
        },
      })
    })
  })
}

// ── Bank DB fixture (adapted from verify-user-scope.mjs's proven minimal recipe:
//    needs >=1 question_group row or semanticSearchQuestionGroups short-circuits
//    before ever calling DeepSeek) ────────────────────────────────────────────
function seedBankDatabaseWithOneGroup(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(`
    INSERT INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-daily-limit-verify', 'self_made', 2026, 'M0-5', 'Daily Limit Verify', '阅读', 'verify-ai-daily-limit fixture');
    INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-daily-limit-verify',
      'src-daily-limit-verify',
      'Daily limit verify passage',
      'This passage exists only to keep semanticSearchQuestionGroups from empty-DB short-circuiting.',
      'Daily limit verify passage',
      '人与自我',
      'narrative',
      'medium'
    );
    INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-daily-limit-verify', 'passage-daily-limit-verify', 'reading', 'Daily limit verify group', 'Read and answer.', 1, 1, 'medium', 'verify fixture');
    INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, difficulty, score, display_order)
    VALUES ('q-daily-limit-verify', 'g-daily-limit-verify', '1', 'single_choice', 'Why does this question exist?', 'A', 'medium', 1, 1);
    INSERT INTO options (id, question_id, label, content, display_order)
    VALUES ('opt-daily-limit-verify-a', 'q-daily-limit-verify', 'A', 'To make verify-question-group perform a gated out-station call.', 1);
  `)
  db.close()
}

// ── Shared server-process harness (same shape as verify-user-scope.mjs) ──────
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

async function killServer(child) {
  const idx = children.indexOf(child)
  if (idx >= 0) children.splice(idx, 1)
  child.kill()
  await new Promise((resolve) => setTimeout(resolve, 150))
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
  return async function req(urlPath, { method = 'GET', body } = {}) {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetch(`http://127.0.0.1:${apiPort}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let json = null
    try {
      json = await response.json()
    } catch {
      // non-JSON response
    }
    return { status: response.status, json }
  }
}

function makeTempFixture(prefix) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  const userSpaceRoot = path.join(tempRoot, 'user-space-files')
  const snapshotPath = path.join(tempRoot, 'ai-daily-usage.json')
  mkdirSync(paperAssetsDir, { recursive: true })
  mkdirSync(userSpaceRoot, { recursive: true })
  return { tempRoot, dbPath, userDataDbPath, paperAssetsDir, userSpaceRoot, snapshotPath }
}

function envFor(fixture, port, { limit, deepSeekUrl, extra = {} }) {
  return {
    ...process.env,
    QUESTION_BANK_DB: fixture.dbPath,
    USER_DATA_DB: fixture.userDataDbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: fixture.paperAssetsDir,
    QUESTION_BANK_USER_SPACE_ROOT: fixture.userSpaceRoot,
    QUESTION_BANK_API_PORT: String(port),
    AI_DAILY_REQUEST_LIMIT: String(limit),
    AI_DAILY_USAGE_SNAPSHOT_PATH: fixture.snapshotPath,
    DEEPSEEK_API_URL: deepSeekUrl,
    DEEPSEEK_API_KEY: 'server-env-key-for-verify',
    ...extra,
  }
}

async function stopAllAndCleanup(fixture) {
  for (const child of children.splice(0, children.length)) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 150))
  if (fixture) rmSync(fixture.tempRoot, { recursive: true, force: true })
}

// =====================================================================
// Assertions 1-4: one server lifecycle, one mock DeepSeek, one fixture DB.
// =====================================================================
let port = 8901
const mock = await startMockDeepSeek()
const fixture = makeTempFixture('verify-ai-daily-limit-')
seedBankDatabaseWithOneGroup(fixture.dbPath)

let server = startServer(envFor(fixture, port, { limit: 2, deepSeekUrl: mock.url }))
await waitForHttp(`http://127.0.0.1:${port}/api/ai/status`)
let req = makeReq(port)

try {
  console.log('=== Assertion 1: hammer semantic-search until 429 + code ===')
  const r1 = await req('/api/ai/semantic-search', { method: 'POST', body: { query: 'q1', apiKey: '' } })
  const r2 = await req('/api/ai/semantic-search', { method: 'POST', body: { query: 'q2', apiKey: '' } })
  const r3 = await req('/api/ai/semantic-search', { method: 'POST', body: { query: 'q3', apiKey: '' } })
  assert('1: call 1 (server key, under limit) -> 200', r1.status === 200, `got ${r1.status} ${JSON.stringify(r1.json)}`)
  assert('1: call 2 (server key, at limit) -> 200', r2.status === 200, `got ${r2.status} ${JSON.stringify(r2.json)}`)
  assert('1: call 3 (server key, over limit) -> 429', r3.status === 429, `got ${r3.status}`)
  assert('1: 429 body carries code', r3.json?.code === 'ai-daily-limit-exceeded', JSON.stringify(r3.json))
  assert('1: mock DeepSeek reached exactly twice (not for the blocked 3rd call)', mock.callCount === 2, `got ${mock.callCount}`)

  console.log('\n=== Assertion 2: client-supplied key bypasses the exceeded limit ===')
  const r4 = await req('/api/ai/semantic-search', { method: 'POST', body: { query: 'q4', apiKey: 'sk-teacher-own-key' } })
  assert('2: call with client key succeeds even after limit exceeded', r4.status === 200, `got ${r4.status} ${JSON.stringify(r4.json)}`)
  assert('2: mock DeepSeek reached a 3rd time for the client-key call', mock.callCount === 3, `got ${mock.callCount}`)

  console.log('\n=== Assertion 2b: verify-question-group over limit -> 429, not 200-with-uncertain ===')
  // Regression guard: verifyQuestionGroupService folds per-question AI errors into
  // "uncertain" verdicts; the daily-limit error must be rethrown there so the route
  // can 429 (found in browser QA of this cut — a swallowed limit error returned
  // HTTP 200 with an all-uncertain result that looked like a completed verification).
  const r5 = await req('/api/ai/verify-question-group', {
    method: 'POST',
    body: { questionGroupId: 'g-daily-limit-verify' },
  })
  assert('2b: verify over limit -> 429', r5.status === 429, `got ${r5.status} ${JSON.stringify(r5.json)}`)
  assert('2b: 429 body carries code', r5.json?.code === 'ai-daily-limit-exceeded', JSON.stringify(r5.json))
  assert('2b: no out-station call was made', mock.callCount === 3, `got ${mock.callCount}`)

  console.log('\n=== Assertion 3: GET /api/ai/status dailyLimit fields + exceeded flip ===')
  const status = await req('/api/ai/status')
  assert('3: status 200', status.status === 200)
  assert('3: serverKeyAvailable = true', status.json?.serverKeyAvailable === true, JSON.stringify(status.json))
  assert('3: dailyLimit.limit = 2', status.json?.dailyLimit?.limit === 2, JSON.stringify(status.json?.dailyLimit))
  assert('3: dailyLimit.used = 2 (client-key call not counted)', status.json?.dailyLimit?.used === 2, JSON.stringify(status.json?.dailyLimit))
  assert('3: dailyLimit.exceeded = true', status.json?.dailyLimit?.exceeded === true, JSON.stringify(status.json?.dailyLimit))
} finally {
  await killServer(server)
}

console.log('\n=== Assertion 4: snapshot persists across process restart ===')
{
  const snapshotRaw = readFileSync(fixture.snapshotPath, 'utf8')
  const snapshot = JSON.parse(snapshotRaw)
  assert('4: snapshot file has count = 2 after the process exits', snapshot.count === 2, snapshotRaw)

  port += 1
  server = startServer(envFor(fixture, port, { limit: 2, deepSeekUrl: mock.url }))
  await waitForHttp(`http://127.0.0.1:${port}/api/ai/status`)
  req = makeReq(port)
  try {
    const status = await req('/api/ai/status')
    assert('4: used=2 read back after restart (not reset to 0)', status.json?.dailyLimit?.used === 2, JSON.stringify(status.json?.dailyLimit))
    assert('4: exceeded=true survives restart', status.json?.dailyLimit?.exceeded === true, JSON.stringify(status.json?.dailyLimit))
  } finally {
    await killServer(server)
  }
}

await stopAllAndCleanup(fixture)
await mock.close()

// =====================================================================
// Assertion 5: stale (yesterday's) dayKey snapshot rolls over on first request.
// =====================================================================
console.log('\n=== Assertion 5: stale dayKey snapshot resets on first request of a new day ===')
{
  const mock2 = await startMockDeepSeek()
  const fixture2 = makeTempFixture('verify-ai-daily-limit-rollover-')
  seedBankDatabaseWithOneGroup(fixture2.dbPath)

  // Hand-write a snapshot with an obviously-stale dayKey and a nonzero count, so a
  // naive "always add to whatever count is on disk" implementation would start at
  // 101 instead of rolling over to 0 first.
  writeFileSync(fixture2.snapshotPath, JSON.stringify({ dayKey: '2000-01-01', count: 100 }), 'utf8')

  port += 1
  const server2 = startServer(envFor(fixture2, port, { limit: 500, deepSeekUrl: mock2.url }))
  await waitForHttp(`http://127.0.0.1:${port}/api/ai/status`)
  const req2 = makeReq(port)
  try {
    const statusBefore = await req2('/api/ai/status')
    assert('5: used=0 before any request today (stale snapshot ignored)', statusBefore.json?.dailyLimit?.used === 0, JSON.stringify(statusBefore.json?.dailyLimit))

    const r = await req2('/api/ai/semantic-search', { method: 'POST', body: { query: 'q', apiKey: '' } })
    assert('5: request succeeds', r.status === 200, `got ${r.status}`)

    const statusAfter = await req2('/api/ai/status')
    assert('5: used=1 after the first request of the new day (not 101)', statusAfter.json?.dailyLimit?.used === 1, JSON.stringify(statusAfter.json?.dailyLimit))

    const snapshotRaw = readFileSync(fixture2.snapshotPath, 'utf8')
    const snapshot = JSON.parse(snapshotRaw)
    assert('5: on-disk dayKey updated away from the stale 2000-01-01', snapshot.dayKey !== '2000-01-01', snapshotRaw)
    assert('5: on-disk count = 1', snapshot.count === 1, snapshotRaw)
  } finally {
    await killServer(server2)
  }
  await stopAllAndCleanup(fixture2)
  await mock2.close()
}

console.log(`\n=== verify-ai-daily-limit: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exit(1)
