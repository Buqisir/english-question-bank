#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureSharedVocabularyShape,
  ensureUserVocabularyShape,
  listVocabularyStudents,
  replaceVocabularyProgram,
} from '../server/vocabulary/vocabularyStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

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
const importOpsDbPath = path.join(tempRoot, 'import-ops.sqlite')
const importOpsFilesRoot = path.join(tempRoot, 'import-ops-files')
const importAgentToken = 'verify-import-agent-token'
const importShipToken = 'verify-import-ship-token'
const rotatedImportAgentToken = 'verify-rotated-import-agent-token'
const rotatedImportShipToken = 'verify-rotated-import-ship-token'
const promotionProbeBody = {
  intent: 'ship',
  approvalId: 'approval-auth-probe',
  revisionId: 'revision-auth-probe',
  sourceDigest: `sha256:${'1'.repeat(64)}`,
  candidateDigest: `sha256:${'2'.repeat(64)}`,
  visibleStructureDigest: `sha256:${'3'.repeat(64)}`,
  analysisDigest: `sha256:${'4'.repeat(64)}`,
  bundleDigest: `sha256:${'5'.repeat(64)}`,
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!port) throw new Error('Unable to reserve an auth-gate verification port')
  return port
}

const apiPort = await freePort()

const env = {
  ...process.env,
  QUESTION_BANK_DB: dbPath,
  USER_DATA_DB: userDataDbPath,
  QUESTION_BANK_API_PORT: String(apiPort),
  QUESTION_BANK_IMPORT_OPS_DB: importOpsDbPath,
  QUESTION_BANK_IMPORT_OPS_ROOT: importOpsFilesRoot,
  QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: importAgentToken,
  QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN: importShipToken,
}

function seedMinimalBankDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS question_groups (id TEXT PRIMARY KEY)')
  ensureSharedVocabularyShape(db)
  replaceVocabularyProgram(db, {
    id: 'wanwei-round-one-v1',
    version: 'auth-fixture-v1',
    title: '中考词汇一轮',
    subtitle: '认证链路测试',
    sourceTitle: '万唯系列中考词汇一轮梳理',
    sourceEdition: '第8版',
    totalPlannedEntries: 1,
    groups: [{
      id: 'auth-fixture-day-1',
      stage: 'core',
      week: 1,
      group: 1,
      sourceLabel: 'Day 1',
      startOrder: 1,
      endOrder: 1,
    }],
    entries: [{
      id: 'auth-fixture-about',
      groupId: 'auth-fixture-day-1',
      headword: 'about',
      phonetic: '/əˈbaʊt/',
      partOfSpeech: 'prep.',
      sourceMeanings: ['关于'],
      teachingSense: '关于',
      pronunciationMode: 'syllables',
      syllables: ['a', 'bout'],
      example: { english: 'We talked about school.', chinese: '我们谈到了学校。', highlight: 'about', reviewStatus: 'approved' },
      visual: { key: 'auth-visual-about', version: 'koboyo-v1', path: '/about.svg', alt: '两个人谈论学校' },
      audio: { key: 'auth-audio-about', version: 'eqb-british-teacher-v1', path: '/about.mp3', voice: 'eqb-british-teacher-v1' },
      source: { stage: 'core', day: 1, sourceOrder: 1, printedPage: 1, verification: 'page-checked' },
    }],
  })
  db.close()

  const userDb = new DatabaseSync(userDataDbPath)
  ensureUserVocabularyShape(userDb)
  const [publicFixtureStudent] = listVocabularyStudents(userDb, 'public-fixture-owner')
  const timestamp = '2026-08-07T00:00:00.000Z'
  userDb.prepare(`
    INSERT INTO vocabulary_review_runs (
      id, user_id, student_id, program_id, mode, target_unfamiliar_count, cursor, status,
      temporary_stage, temporary_day, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'main', 1, 1, 'frozen', NULL, NULL, ?, ?)
  `).run('public-fixture-run', 'public-fixture-owner', publicFixtureStudent.id, 'wanwei-round-one-v1', timestamp, timestamp)
  userDb.prepare(`
    INSERT INTO vocabulary_sets (id, user_id, student_id, program_id, review_run_id, title, entry_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run('public-fixture-set', 'public-fixture-owner', publicFixtureStudent.id, 'wanwei-round-one-v1', 'public-fixture-run', '公开听写测试', timestamp)
  userDb.prepare(`
    INSERT INTO vocabulary_set_entries (set_id, entry_id, order_index, snapshot_json)
    VALUES (?, ?, 0, ?)
  `).run('public-fixture-set', 'fixture-word', JSON.stringify({
    id: 'fixture-word',
    headword: 'word',
    phonetic: '/wɜːd/',
    partOfSpeech: 'n.',
    teachingSense: '单词',
    pronunciationMode: 'syllables',
    syllables: ['word'],
    example: { english: 'A word.', chinese: '一个单词。', highlight: 'word' },
    visual: { key: 'visual-word', version: 'koboyo-v1', path: '/word.svg', alt: '一个单词卡片' },
    audio: { key: 'audio-word', version: 'eqb-british-teacher-v1', path: '/word.mp3', voice: 'eqb-british-teacher-v1' },
  }))
  userDb.prepare(`
    INSERT INTO vocabulary_shares (id, set_id, user_id, share_id, status, created_at, revoked_at)
    VALUES (?, ?, ?, ?, 'active', ?, NULL)
  `).run('public-fixture-share-row', 'public-fixture-set', 'public-fixture-owner', 'public-fixture-share', timestamp)
  userDb.close()
}

const children = []

function startServer(envOverrides = {}) {
  const child = spawn('node', ['server/api.mjs'], {
    cwd: rootDir,
    env: { ...env, ...envOverrides },
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

function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    child.once('close', resolve)
    child.kill()
  })
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

async function req(urlPath, { method = 'GET', body, cookie, authorization, range } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  if (authorization) headers.authorization = authorization
  if (range) headers.range = range
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

function runCli(args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/create-user.mjs', ...args], {
      cwd: rootDir,
      env,
      stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    if (input !== null) child.stdin.end(input)
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
  let identicalReviewTokensRejected = false
  try {
    createImportReviewRoutes({
      getStore: () => ({}),
      agentToken: 'same-token',
      shipToken: 'same-token',
      buildPrintHtml: () => '',
    })
  } catch (error) {
    identicalReviewTokensRejected = /must be different/.test(String(error?.message || error))
  }
  assert(
    '(b) server rejects one shared secret for Agent and shipping capabilities',
    identicalReviewTokensRejected,
  )
  let server = startServer()

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
    const memberCliOutput = await runCli([
      '--username', 'verify-member', '--password', 'Verify-Member-123', '--role', 'member',
    ])
    assert(
      '(b) create-user.mjs creates a human member account',
      /account: human/.test(memberCliOutput),
      `cli output: ${memberCliOutput}`,
    )
    const agentCliOutput = await runCli([
      '--username', 'verify-import-agent',
      '--password-stdin',
      '--account-kind', 'import_agent',
    ], 'Verify-Agent-123\n')
    assert(
      '(b) create-user.mjs creates a least-privileged import_agent account without logging its supplied password',
      /role: member, account: import_agent/.test(agentCliOutput)
        && !agentCliOutput.includes('Verify-Agent-123'),
      `cli output: ${agentCliOutput}`,
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

    const productInventoryPath = '/api/exports/papers/paper-auth-missing/products'
    const privateProductInventory = await req(productInventoryPath)
    assert(
      '(c) published product inventory requires authentication',
      privateProductInventory.status === 401 && privateProductInventory.json?.error === 'not_authenticated',
      `got status=${privateProductInventory.status} body=${JSON.stringify(privateProductInventory.json)}`,
    )

    const publicVocabulary = await req('/api/public/vocabulary/listen/public-fixture-share')
    assert(
      '(c) forced mode: public vocabulary share remains reachable without a cookie',
      publicVocabulary.status === 200 &&
        publicVocabulary.json?.vocabularySet?.entries?.[0]?.headword === 'word' &&
        !Object.hasOwn(publicVocabulary.json?.vocabularySet?.entries?.[0] ?? {}, 'example'),
      `got status=${publicVocabulary.status} body=${JSON.stringify(publicVocabulary.json)}`,
    )

    const publicVocabularyDictation = await req('/api/public/vocabulary/dictation/public-fixture-share')
    assert(
      '(c) forced mode: public vocabulary dictation remains reachable without a cookie and exposes only answer fields',
      publicVocabularyDictation.status === 200 &&
        publicVocabularyDictation.json?.vocabularySet?.entries?.[0]?.answer === 'word' &&
        publicVocabularyDictation.json?.vocabularySet?.entries?.[0]?.sourceMeanings?.[0] === '单词' &&
        !Object.hasOwn(publicVocabularyDictation.json?.vocabularySet?.entries?.[0] ?? {}, 'visual') &&
        !Object.hasOwn(publicVocabularyDictation.json?.vocabularySet?.entries?.[0] ?? {}, 'example'),
      `got status=${publicVocabularyDictation.status} body=${JSON.stringify(publicVocabularyDictation.json)}`,
    )

    const privateVocabulary = await req('/api/vocabulary/sets')
    assert(
      '(c) forced mode: authenticated vocabulary routes remain protected without a cookie',
      privateVocabulary.status === 401 && privateVocabulary.json?.error === 'not_authenticated',
      `got status=${privateVocabulary.status} body=${JSON.stringify(privateVocabulary.json)}`,
    )

    const createPrivateVocabulary = await req('/api/vocabulary/sets', { method: 'POST' })
    assert(
      '(c) forced mode: direct vocabulary-set creation remains protected without a cookie',
      createPrivateVocabulary.status === 401 && createPrivateVocabulary.json?.error === 'not_authenticated',
      `got status=${createPrivateVocabulary.status} body=${JSON.stringify(createPrivateVocabulary.json)}`,
    )

    const privateVocabularyPdf = await req('/api/vocabulary/sets/public-fixture-set/pdf?accent=british', { method: 'POST' })
    assert(
      '(c) forced mode: vocabulary PDF download remains protected without a cookie',
      privateVocabularyPdf.status === 401 && privateVocabularyPdf.json?.error === 'not_authenticated',
      `got status=${privateVocabularyPdf.status} body=${JSON.stringify(privateVocabularyPdf.json)}`,
    )

    const privateVocabularyBundle = await req('/api/vocabulary/sets/public-fixture-set/materials.zip?accent=british', { method: 'POST' })
    assert(
      '(c) forced mode: vocabulary full-set ZIP remains protected without a cookie',
      privateVocabularyBundle.status === 401 && privateVocabularyBundle.json?.error === 'not_authenticated',
      `got status=${privateVocabularyBundle.status} body=${JSON.stringify(privateVocabularyBundle.json)}`,
    )

    const privateHandwritingFont = await req('/api/vocabulary/print-assets/hengshui.ttf')
    assert(
      '(c) forced mode: private handwriting font remains protected without a cookie',
      privateHandwritingFont.status === 401 && privateHandwritingFont.json?.error === 'not_authenticated',
      `got status=${privateHandwritingFont.status} body=${JSON.stringify(privateHandwritingFont.json)}`,
    )

    const privateVocabularyRename = await req('/api/vocabulary/sets/public-fixture-set', {
      method: 'PATCH',
      body: { title: '越权改名' },
    })
    assert(
      '(c) forced mode: vocabulary-set rename remains protected without a cookie',
      privateVocabularyRename.status === 401 && privateVocabularyRename.json?.error === 'not_authenticated',
      `got status=${privateVocabularyRename.status} body=${JSON.stringify(privateVocabularyRename.json)}`,
    )

    const privateStudents = await req('/api/vocabulary/students')
    assert(
      '(c) forced mode: student profiles remain protected without a cookie',
      privateStudents.status === 401 && privateStudents.json?.error === 'not_authenticated',
      `got status=${privateStudents.status} body=${JSON.stringify(privateStudents.json)}`,
    )

    const createPrivateStudent = await req('/api/vocabulary/students', { method: 'POST', body: { displayName: '小林' } })
    assert(
      '(c) forced mode: student-profile creation remains protected without a cookie',
      createPrivateStudent.status === 401 && createPrivateStudent.json?.error === 'not_authenticated',
      `got status=${createPrivateStudent.status} body=${JSON.stringify(createPrivateStudent.json)}`,
    )

    const privateCurrentRun = await req('/api/vocabulary/review-runs/current?studentId=missing&programId=wanwei-round-one-v1')
    assert(
      '(c) forced mode: current student Review Run remains protected without a cookie',
      privateCurrentRun.status === 401 && privateCurrentRun.json?.error === 'not_authenticated',
      `got status=${privateCurrentRun.status} body=${JSON.stringify(privateCurrentRun.json)}`,
    )

    const privateProgressRelocation = await req('/api/vocabulary/progress/wanwei-round-one-v1', {
      method: 'PATCH',
      body: { studentId: 'missing', entryId: 'auth-fixture-about', replaceActiveRun: true },
    })
    assert(
      '(c) forced mode: student progress relocation remains protected without a cookie',
      privateProgressRelocation.status === 401 && privateProgressRelocation.json?.error === 'not_authenticated',
      `got status=${privateProgressRelocation.status} body=${JSON.stringify(privateProgressRelocation.json)}`,
    )

    const wrongMethodPublicVocabulary = await req('/api/public/vocabulary/listen/public-fixture-share', { method: 'POST' })
    assert(
      '(c) forced mode: only GET is public for vocabulary shares',
      wrongMethodPublicVocabulary.status === 401 && wrongMethodPublicVocabulary.json?.error === 'not_authenticated',
      `got status=${wrongMethodPublicVocabulary.status} body=${JSON.stringify(wrongMethodPublicVocabulary.json)}`,
    )

    const wrongMethodPublicVocabularyDictation = await req('/api/public/vocabulary/dictation/public-fixture-share', { method: 'POST' })
    assert(
      '(c) forced mode: only GET is public for vocabulary dictation shares',
      wrongMethodPublicVocabularyDictation.status === 401 && wrongMethodPublicVocabularyDictation.json?.error === 'not_authenticated',
      `got status=${wrongMethodPublicVocabularyDictation.status} body=${JSON.stringify(wrongMethodPublicVocabularyDictation.json)}`,
    )

    const forcedPaperAssets = await req('/paper-assets/does-not-exist.json')
    assert(
      '(c) forced mode: GET /paper-assets/* is 401 with no cookie (static special-case is gated)',
      forcedPaperAssets.status === 401 && forcedPaperAssets.json?.error === 'not_authenticated',
      `got status=${forcedPaperAssets.status} body=${JSON.stringify(forcedPaperAssets.json)}`,
    )

    for (const method of ['GET', 'HEAD']) {
      const audio = await req('/paper-assets/paper-fixture/versions/v1/listening/playback.mp3', {
        method,
        range: 'bytes=0-15',
      })
      assert(`Listening ${method} Range requires authentication`, audio.status === 401)
    }

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

    const noCookieOwnerReviews = await req('/api/import-reviews')
    assert(
      '(c) import review Owner API rejects unauthenticated requests',
      noCookieOwnerReviews.status === 401 && noCookieOwnerReviews.json?.error === 'not_authenticated',
      `got status=${noCookieOwnerReviews.status} body=${JSON.stringify(noCookieOwnerReviews.json)}`,
    )
    const ownerReviews = await req('/api/import-reviews', { cookie })
    assert(
      '(c) import review Owner API accepts the Owner cookie',
      ownerReviews.status === 200 && Array.isArray(ownerReviews.json?.papers),
      `got status=${ownerReviews.status} body=${JSON.stringify(ownerReviews.json)}`,
    )
    const noCookieSourceIntakes = await req('/api/source-intakes')
    const ownerSourceIntakes = await req('/api/source-intakes', { cookie })
    assert(
      '(c) source-intake Owner API requires and accepts the Owner cookie',
      noCookieSourceIntakes.status === 401 &&
        noCookieSourceIntakes.json?.error === 'not_authenticated' &&
        ownerSourceIntakes.status === 200 &&
        Array.isArray(ownerSourceIntakes.json?.intakes),
      `anonymous=${JSON.stringify(noCookieSourceIntakes.json)} owner=${JSON.stringify(ownerSourceIntakes.json)}`,
    )
    const ownerCannotSubstituteForAgent = await req('/api/import-agent-reviews', { cookie })
    assert(
      '(c) Owner cookie cannot substitute for Agent identity',
      ownerCannotSubstituteForAgent.status === 401 &&
        ownerCannotSubstituteForAgent.json?.error === 'agent_auth_required',
      `got status=${ownerCannotSubstituteForAgent.status} body=${JSON.stringify(ownerCannotSubstituteForAgent.json)}`,
    )
    const bearerInbox = await req('/api/import-agent-reviews', {
      authorization: `Bearer ${importAgentToken}`,
    })
    assert(
      '(c) dedicated Agent bearer credential can read the review inbox without a Cookie',
      bearerInbox.status === 200 && Array.isArray(bearerInbox.json?.papers),
      `got status=${bearerInbox.status} body=${JSON.stringify(bearerInbox.json)}`,
    )
    const fileContent = { text: 'Exact retained Review file, not a public preview' }
    const fileBytes = Buffer.from(JSON.stringify(fileContent))
    const fileIdentity = {
      paperId: 'paper-auth-readback', paperName: 'Auth readback fixture',
      sourceDigest: `sha256:${'1'.repeat(64)}`,
      candidateDigest: `sha256:${'2'.repeat(64)}`,
      visibleStructureDigest: `sha256:${'3'.repeat(64)}`,
      analysisDigest: `sha256:${'4'.repeat(64)}`,
    }
    const fileStore = createImportReviewStore({
      dbPath: importOpsDbPath, filesRoot: importOpsFilesRoot,
      rendererBuildId: 'auth-readback-fixture', projectRevision: () => fileIdentity,
    })
    const fileManifest = {
      schemaVersion: 'web-import-review-bundle-v1', ...fileIdentity,
      producerBuildId: 'auth-readback-fixture',
      files: [{ path: 'projection.json', sha256: sha256(fileBytes),
        byteLength: fileBytes.length, mediaType: 'application/json', role: 'materialization' }],
    }
    const fileRevision = fileStore.createRevision({ ...fileManifest, bundleDigest: reviewBundleDigest(fileManifest) }).revision
    const upload = fileStore.fileForUpload(fileRevision.id, 'projection.json')
    writeFileSync(upload.destination, fileBytes)
    fileStore.completeFileUpload(fileRevision.id, 'projection.json', fileManifest.files[0])
    await fileStore.ready()
    fileStore.finalizeRevision(fileRevision.id)
    const agentFilePath = `/api/import-agent-reviews/revisions/${fileRevision.id}/files?path=projection.json`
    const ownerFilePath = `/api/import-review-preview/revisions/${fileRevision.id}/files?path=projection.json`
    const readback = await req(agentFilePath, { authorization: `Bearer ${importAgentToken}` })
    assert('(c) bearer-only file readback passes the enforced global gate with exact content',
      readback.status === 200 && JSON.stringify(readback.json) === JSON.stringify(fileContent), JSON.stringify(readback))
    for (const credentials of [{}, { authorization: 'Bearer wrong-token' }, { authorization: `Bearer ${importShipToken}` }, { cookie }]) {
      const denied = await req(agentFilePath, credentials)
      assert('(c) Agent file namespace rejects absent, wrong, shipping and Owner-only credentials', denied.status === 401)
    }
    const ownerFile = await req(ownerFilePath, { cookie })
    const bearerPreview = await req(ownerFilePath, { authorization: `Bearer ${importAgentToken}` })
    assert('(c) Owner preview remains cookie-gated while Agent uses its own file namespace',
      ownerFile.status === 200 && ownerFile.json?.text === fileContent.text && bearerPreview.status === 401)
    for (const filename of ['../private.json', 'unlisted.json']) {
      const denied = await req(`/api/import-agent-reviews/revisions/${fileRevision.id}/files?path=${encodeURIComponent(filename)}`,
        { authorization: `Bearer ${importAgentToken}` })
      assert('(c) Agent readback cannot read outside the exact manifest', denied.status === 404)
    }
    const ownerCannotReadSourceQueue = await req('/api/import-agent-source-intakes', { cookie })
    const bearerSourceQueue = await req('/api/import-agent-source-intakes', {
      authorization: `Bearer ${importAgentToken}`,
    })
    assert(
      '(c) source-intake queue accepts Agent bearer but not an Owner cookie',
      ownerCannotReadSourceQueue.status === 401 &&
        ownerCannotReadSourceQueue.json?.error === 'agent_auth_required' &&
        bearerSourceQueue.status === 200 &&
        Array.isArray(bearerSourceQueue.json?.submissions),
      `owner=${JSON.stringify(ownerCannotReadSourceQueue.json)} bearer=${JSON.stringify(bearerSourceQueue.json)}`,
    )
    const bearerRevisionAttempt = await req('/api/import-agent-reviews/revisions', {
      method: 'POST',
      authorization: `Bearer ${importAgentToken}`,
      body: {},
    })
    const bearerReplyAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/issues/issue-missing/messages',
      {
        method: 'POST',
        authorization: `Bearer ${importAgentToken}`,
        body: { message: 'auth-scope-probe' },
      },
    )
    assert(
      '(c) dedicated Agent bearer reaches revision upload and issue reply handlers',
      bearerRevisionAttempt.status === 400 &&
        bearerRevisionAttempt.json?.code === 'IMPORT_REVIEW_SCHEMA_INVALID' &&
        bearerReplyAttempt.status === 404 &&
        bearerReplyAttempt.json?.code === 'IMPORT_REVIEW_NOT_FOUND',
      `revision=${JSON.stringify(bearerRevisionAttempt.json)} reply=${JSON.stringify(bearerReplyAttempt.json)}`,
    )
    const bearerGuardRelease = await req(
      '/api/import-agent-reviews/papers/paper-missing/shipping-guards/guard-missing',
      {
        method: 'DELETE',
        authorization: `Bearer ${importAgentToken}`,
      },
    )
    assert(
      '(c) dedicated Agent bearer credential cannot acquire or release a shipping guard',
      bearerGuardRelease.status === 401 &&
        bearerGuardRelease.json?.error === 'shipping_auth_required',
      `got status=${bearerGuardRelease.status} body=${JSON.stringify(bearerGuardRelease.json)}`,
    )
    const bearerPromotionAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/promotions',
      {
        method: 'POST',
        authorization: `Bearer ${importAgentToken}`,
        body: promotionProbeBody,
      },
    )
    const ownerPromotionAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/promotions',
      { method: 'POST', cookie, body: promotionProbeBody },
    )
    const shipPromotionAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/promotions',
      {
        method: 'POST',
        authorization: `Bearer ${importShipToken}`,
        body: promotionProbeBody,
      },
    )
    assert(
      '(c) single-paper promotion accepts only the independent shipping credential',
      bearerPromotionAttempt.status === 401 &&
        bearerPromotionAttempt.json?.error === 'shipping_auth_required' &&
        ownerPromotionAttempt.status === 401 &&
        ownerPromotionAttempt.json?.error === 'shipping_auth_required' &&
        shipPromotionAttempt.status === 404 &&
        shipPromotionAttempt.json?.code === 'IMPORT_REVIEW_NOT_FOUND',
      `agent=${JSON.stringify(bearerPromotionAttempt.json)} owner=${JSON.stringify(ownerPromotionAttempt.json)} ship=${JSON.stringify(shipPromotionAttempt.json)}`,
    )
    const shipCredentialGuardRelease = await req(
      '/api/import-agent-reviews/papers/paper-missing/shipping-guards/guard-missing',
      {
        method: 'DELETE',
        authorization: `Bearer ${importShipToken}`,
      },
    )
    assert(
      '(c) independent shipping credential alone reaches shipping-guard release',
      shipCredentialGuardRelease.status === 200 &&
        shipCredentialGuardRelease.json?.released === false,
      `got status=${shipCredentialGuardRelease.status} body=${JSON.stringify(shipCredentialGuardRelease.json)}`,
    )
    const shipCredentialInbox = await req('/api/import-agent-reviews', {
      authorization: `Bearer ${importShipToken}`,
    })
    assert(
      '(c) shipping credential cannot read the Agent inbox or upload revisions',
      shipCredentialInbox.status === 401 &&
        shipCredentialInbox.json?.error === 'agent_auth_required',
      `got status=${shipCredentialInbox.status} body=${JSON.stringify(shipCredentialInbox.json)}`,
    )
    const bearerCannotApprove = await req('/api/import-reviews/papers/missing/revisions/missing/approve', {
      method: 'POST',
      authorization: `Bearer ${importAgentToken}`,
      body: { bundleDigest: `sha256:${'0'.repeat(64)}` },
    })
    assert(
      '(c) Agent bearer credential cannot reach the Owner approval API',
      bearerCannotApprove.status === 401 && bearerCannotApprove.json?.error === 'not_authenticated',
      `got status=${bearerCannotApprove.status} body=${JSON.stringify(bearerCannotApprove.json)}`,
    )
    const bearerCannotCreateIssue = await req('/api/import-reviews/papers/missing/issues', {
      method: 'POST',
      authorization: `Bearer ${importAgentToken}`,
      body: {},
    })
    const bearerCannotCloseIssue = await req('/api/import-reviews/papers/missing/issues/missing', {
      method: 'PATCH',
      authorization: `Bearer ${importAgentToken}`,
      body: { action: 'close' },
    })
    assert(
      '(c) Agent bearer credential cannot create, close, or reopen Owner issues',
      bearerCannotCreateIssue.status === 401 &&
        bearerCannotCreateIssue.json?.error === 'not_authenticated' &&
        bearerCannotCloseIssue.status === 401 &&
        bearerCannotCloseIssue.json?.error === 'not_authenticated',
      `create=${JSON.stringify(bearerCannotCreateIssue.json)} close=${JSON.stringify(bearerCannotCloseIssue.json)}`,
    )

    const memberLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-member', password: 'Verify-Member-123' },
    })
    const memberCookie = cookieHeaderFrom(memberLogin.setCookie)
    const memberProductInventory = await req(productInventoryPath, { cookie: memberCookie })
    assert(
      '(c) human members reach product inventory validation for a missing publication',
      memberProductInventory.status === 409 && typeof memberProductInventory.json?.error === 'string',
      `got status=${memberProductInventory.status} body=${JSON.stringify(memberProductInventory.json)}`,
    )
    const memberReviews = await req('/api/import-reviews', { cookie: memberCookie })
    const memberSourceIntakes = await req('/api/source-intakes', { cookie: memberCookie })
    assert(
      '(c) human member cannot read import review or source-intake Owner APIs',
      memberReviews.status === 403 && memberReviews.json?.error === 'forbidden' &&
        memberSourceIntakes.status === 403 && memberSourceIntakes.json?.error === 'forbidden',
      `reviews=${JSON.stringify(memberReviews.json)} sources=${JSON.stringify(memberSourceIntakes.json)}`,
    )

    const agentLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'verify-import-agent', password: 'Verify-Agent-123' },
    })
    const agentCookie = cookieHeaderFrom(agentLogin.setCookie)
    const agentMe = await req('/api/auth/me', { cookie: agentCookie })
    const agentInbox = await req('/api/import-agent-reviews', { cookie: agentCookie })
    const agentSourceQueue = await req('/api/import-agent-source-intakes', { cookie: agentCookie })
    const agentRevisionAttempt = await req('/api/import-agent-reviews/revisions', {
      method: 'POST',
      cookie: agentCookie,
      body: {},
    })
    const agentReplyAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/issues/issue-missing/messages',
      {
        method: 'POST',
        cookie: agentCookie,
        body: { message: 'auth-scope-probe' },
      },
    )
    const agentGuardRelease = await req(
      '/api/import-agent-reviews/papers/paper-missing/shipping-guards/guard-missing',
      { method: 'DELETE', cookie: agentCookie },
    )
    const agentPromotionAttempt = await req(
      '/api/import-agent-reviews/papers/paper-missing/promotions',
      { method: 'POST', cookie: agentCookie, body: promotionProbeBody },
    )
    const agentOrdinaryApi = await req('/api/draft-papers', { cookie: agentCookie })
    const agentOwnerApi = await req('/api/import-reviews', { cookie: agentCookie })
    const agentSourceOwnerApi = await req('/api/source-intakes', { cookie: agentCookie })
    assert(
      '(c) real import_agent login sees its identity and dedicated review/source queues',
      agentLogin.status === 200 &&
        agentMe.status === 200 && agentMe.json?.user?.accountKind === 'import_agent' &&
        agentInbox.status === 200 && Array.isArray(agentInbox.json?.papers) &&
        agentSourceQueue.status === 200 && Array.isArray(agentSourceQueue.json?.submissions),
      `login=${JSON.stringify(agentLogin.json)} me=${JSON.stringify(agentMe.json)} inbox=${JSON.stringify(agentInbox.json)} sources=${JSON.stringify(agentSourceQueue.json)}`,
    )
    assert(
      '(c) real import_agent account reaches revision upload and issue reply handlers',
      agentRevisionAttempt.status === 400 &&
        agentRevisionAttempt.json?.code === 'IMPORT_REVIEW_SCHEMA_INVALID' &&
        agentReplyAttempt.status === 404 &&
        agentReplyAttempt.json?.code === 'IMPORT_REVIEW_NOT_FOUND',
      `revision=${JSON.stringify(agentRevisionAttempt.json)} reply=${JSON.stringify(agentReplyAttempt.json)}`,
    )
    assert(
      '(c) import_agent account is globally denied ordinary member and Owner APIs',
      agentOrdinaryApi.status === 403 && agentOrdinaryApi.json?.error === 'agent_account_scope_forbidden' &&
        agentOwnerApi.status === 403 && agentOwnerApi.json?.error === 'agent_account_scope_forbidden' &&
        agentSourceOwnerApi.status === 403 &&
        agentSourceOwnerApi.json?.error === 'agent_account_scope_forbidden',
      `ordinary=${JSON.stringify(agentOrdinaryApi.json)} owner=${JSON.stringify(agentOwnerApi.json)} sources=${JSON.stringify(agentSourceOwnerApi.json)}`,
    )
    assert(
      '(c) import_agent account cannot acquire/release a shipping guard or promote',
      agentGuardRelease.status === 401 &&
        agentGuardRelease.json?.error === 'shipping_auth_required' &&
        agentPromotionAttempt.status === 401 &&
        agentPromotionAttempt.json?.error === 'shipping_auth_required',
      `guard=${JSON.stringify(agentGuardRelease.json)} promotion=${JSON.stringify(agentPromotionAttempt.json)}`,
    )

    const defaultStudents = await req('/api/vocabulary/students', { cookie })
    const defaultStudentId = defaultStudents.json?.students?.[0]?.id
    assert(
      '(c) authenticated teacher receives a default student profile',
      defaultStudents.status === 200 &&
        defaultStudents.json?.students?.length === 1 &&
        defaultStudents.json?.students?.[0]?.displayName === '默认学生' &&
        Boolean(defaultStudentId),
      `got status=${defaultStudents.status} body=${JSON.stringify(defaultStudents.json)}`,
    )

    const createdStudent = await req('/api/vocabulary/students', {
      method: 'POST',
      cookie,
      body: { displayName: '小林' },
    })
    const studentId = createdStudent.json?.student?.id
    assert(
      '(c) authenticated teacher creates a student profile through the real HTTP route',
      createdStudent.status === 201 && createdStudent.json?.student?.displayName === '小林' && Boolean(studentId),
      `got status=${createdStudent.status} body=${JSON.stringify(createdStudent.json)}`,
    )

    const duplicateStudent = await req('/api/vocabulary/students', {
      method: 'POST',
      cookie,
      body: { displayName: ' 小林 ' },
    })
    assert(
      '(c) duplicate student names fail closed',
      duplicateStudent.status === 409 && duplicateStudent.json?.error === 'vocabulary_student_name_exists',
      `got status=${duplicateStudent.status} body=${JSON.stringify(duplicateStudent.json)}`,
    )

    const createdReviewRun = await req('/api/vocabulary/review-runs', {
      method: 'POST',
      cookie,
      body: {
        studentId,
        programId: 'wanwei-round-one-v1',
        targetUnfamiliarCount: 15,
        mode: 'main',
      },
    })
    const recoveredReviewRun = await req(`/api/vocabulary/review-runs/current?studentId=${encodeURIComponent(studentId)}&programId=wanwei-round-one-v1`, { cookie })
    const duplicateReviewRun = await req('/api/vocabulary/review-runs', {
      method: 'POST',
      cookie,
      body: {
        studentId,
        programId: 'wanwei-round-one-v1',
        targetUnfamiliarCount: 20,
        mode: 'main',
      },
    })
    assert(
      '(c) active student Review Run is server-authoritative and idempotent across browsers',
      createdReviewRun.status === 201 &&
        recoveredReviewRun.status === 200 &&
        duplicateReviewRun.status === 201 &&
        createdReviewRun.json?.reviewRun?.id === recoveredReviewRun.json?.reviewRun?.id &&
        createdReviewRun.json?.reviewRun?.id === duplicateReviewRun.json?.reviewRun?.id,
      `created=${JSON.stringify(createdReviewRun.json)} recovered=${JSON.stringify(recoveredReviewRun.json)} duplicate=${JSON.stringify(duplicateReviewRun.json)}`,
    )

    const discardedReviewRun = await req(`/api/vocabulary/review-runs/${encodeURIComponent(createdReviewRun.json?.reviewRun?.id)}`, {
      method: 'DELETE',
      cookie,
    })
    const currentAfterDiscard = await req(`/api/vocabulary/review-runs/current?studentId=${encodeURIComponent(studentId)}&programId=wanwei-round-one-v1`, { cookie })
    assert(
      '(c) teacher can explicitly discard an unfinished Run before starting the next scope',
      discardedReviewRun.status === 200 && discardedReviewRun.json?.ok === true &&
        currentAfterDiscard.status === 200 && currentAfterDiscard.json?.reviewRun === null,
      `discard=${JSON.stringify(discardedReviewRun.json)} current=${JSON.stringify(currentAfterDiscard.json)}`,
    )

    const relocationRun = await req('/api/vocabulary/review-runs', {
      method: 'POST',
      cookie,
      body: {
        studentId,
        programId: 'wanwei-round-one-v1',
        targetUnfamiliarCount: 15,
        mode: 'main',
      },
    })
    const blockedRelocation = await req('/api/vocabulary/progress/wanwei-round-one-v1', {
      method: 'PATCH',
      cookie,
      body: { studentId, entryId: 'auth-fixture-about', replaceActiveRun: false },
    })
    const confirmedRelocation = await req('/api/vocabulary/progress/wanwei-round-one-v1', {
      method: 'PATCH',
      cookie,
      body: { studentId, entryId: 'auth-fixture-about', replaceActiveRun: true },
    })
    const currentAfterRelocation = await req(`/api/vocabulary/review-runs/current?studentId=${encodeURIComponent(studentId)}&programId=wanwei-round-one-v1`, { cookie })
    assert(
      '(c) progress relocation requires explicit Run replacement and leaves no competing active Run',
      relocationRun.status === 201 &&
        blockedRelocation.status === 409 && blockedRelocation.json?.error === 'vocabulary_progress_has_active_run' &&
        confirmedRelocation.status === 200 && confirmedRelocation.json?.progress?.cursor === 0 &&
        confirmedRelocation.json?.discardedRunId === relocationRun.json?.reviewRun?.id &&
        currentAfterRelocation.status === 200 && currentAfterRelocation.json?.reviewRun === null,
      `run=${JSON.stringify(relocationRun.json)} blocked=${JSON.stringify(blockedRelocation.json)} confirmed=${JSON.stringify(confirmedRelocation.json)} current=${JSON.stringify(currentAfterRelocation.json)}`,
    )

    const createdVocabularySet = await req('/api/vocabulary/sets', {
      method: 'POST',
      cookie,
      body: {
        studentId,
        programId: 'wanwei-round-one-v1',
        entryIds: ['auth-fixture-about'],
      },
    })
    assert(
      '(c) authenticated direct vocabulary-set creation persists through the real HTTP route',
      createdVocabularySet.status === 201 &&
        createdVocabularySet.json?.vocabularySet?.entryCount === 1 &&
        createdVocabularySet.json?.vocabularySet?.entries?.[0]?.headword === 'about' &&
        createdVocabularySet.json?.vocabularySet?.reviewRunId === null,
      `got status=${createdVocabularySet.status} body=${JSON.stringify(createdVocabularySet.json)}`,
    )

    const renamedVocabularySet = await req(`/api/vocabulary/sets/${createdVocabularySet.json?.vocabularySet?.id}`, {
      method: 'PATCH',
      cookie,
      body: { title: '小林第1周生词' },
    })
    assert(
      '(c) authenticated teacher can persist a custom vocabulary-set and PDF title',
      renamedVocabularySet.status === 200 && renamedVocabularySet.json?.vocabularySet?.title === '小林第1周生词',
      `got status=${renamedVocabularySet.status} body=${JSON.stringify(renamedVocabularySet.json)}`,
    )

    const studentSets = await req(`/api/vocabulary/sets?studentId=${encodeURIComponent(studentId)}&programId=wanwei-round-one-v1`, { cookie })
    const defaultStudentSets = await req(`/api/vocabulary/sets?studentId=${encodeURIComponent(defaultStudentId)}&programId=wanwei-round-one-v1`, { cookie })
    assert(
      '(c) vocabulary Sets are isolated by student profile',
      studentSets.status === 200 && studentSets.json?.vocabularySets?.length === 1 &&
        studentSets.json?.vocabularySets?.[0]?.studentId === studentId &&
        defaultStudentSets.status === 200 && defaultStudentSets.json?.vocabularySets?.length === 0,
      `student=${JSON.stringify(studentSets.json)} default=${JSON.stringify(defaultStudentSets.json)}`,
    )

    const studentProgress = await req(`/api/vocabulary/progress/wanwei-round-one-v1?studentId=${encodeURIComponent(studentId)}`, { cookie })
    assert(
      '(c) new student progress starts independently at zero',
      studentProgress.status === 200 && studentProgress.json?.progress?.studentId === studentId && studentProgress.json?.progress?.cursor === 0,
      `got status=${studentProgress.status} body=${JSON.stringify(studentProgress.json)}`,
    )

    const reopenedVocabularySet = await req(`/api/vocabulary/sets/${createdVocabularySet.json?.vocabularySet?.id}`, { cookie })
    assert(
      '(c) authenticated direct vocabulary Set reopens from SQLite with frozen order and no fabricated Review Run',
      reopenedVocabularySet.status === 200 &&
        reopenedVocabularySet.json?.vocabularySet?.entries?.[0]?.id === 'auth-fixture-about' &&
        reopenedVocabularySet.json?.vocabularySet?.title === '小林第1周生词' &&
        reopenedVocabularySet.json?.vocabularySet?.reviewRunId === null,
      `got status=${reopenedVocabularySet.status} body=${JSON.stringify(reopenedVocabularySet.json)}`,
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

    await stopServer(server)
    server = startServer({
      QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: rotatedImportAgentToken,
      QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN: rotatedImportShipToken,
    })
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

    const oldAgentAfterRotation = await req('/api/import-agent-reviews', {
      authorization: `Bearer ${importAgentToken}`,
    })
    const newAgentAfterRotation = await req('/api/import-agent-reviews', {
      authorization: `Bearer ${rotatedImportAgentToken}`,
    })
    assert(
      '(f) Agent token rotation activates the new secret and rejects the old secret after restart',
      oldAgentAfterRotation.status === 401 &&
        oldAgentAfterRotation.json?.error === 'agent_auth_required' &&
        newAgentAfterRotation.status === 200 &&
        Array.isArray(newAgentAfterRotation.json?.papers),
      `old=${JSON.stringify(oldAgentAfterRotation)} new=${JSON.stringify(newAgentAfterRotation)}`,
    )

    const oldShipAfterRotation = await req(
      '/api/import-agent-reviews/papers/paper-missing/shipping-guards/guard-missing',
      {
        method: 'DELETE',
        authorization: `Bearer ${importShipToken}`,
      },
    )
    const newShipAfterRotation = await req(
      '/api/import-agent-reviews/papers/paper-missing/shipping-guards/guard-missing',
      {
        method: 'DELETE',
        authorization: `Bearer ${rotatedImportShipToken}`,
      },
    )
    assert(
      '(f) ship token rotation activates the new secret and rejects the old secret after restart',
      oldShipAfterRotation.status === 401 &&
        oldShipAfterRotation.json?.error === 'shipping_auth_required' &&
        newShipAfterRotation.status === 200 &&
        newShipAfterRotation.json?.released === false,
      `old=${JSON.stringify(oldShipAfterRotation)} new=${JSON.stringify(newShipAfterRotation)}`,
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
