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

    const publicVocabulary = await req('/api/public/vocabulary/listen/public-fixture-share')
    assert(
      '(c) forced mode: public vocabulary share remains reachable without a cookie',
      publicVocabulary.status === 200 &&
        publicVocabulary.json?.vocabularySet?.entries?.[0]?.headword === 'word' &&
        !Object.hasOwn(publicVocabulary.json?.vocabularySet?.entries?.[0] ?? {}, 'example'),
      `got status=${publicVocabulary.status} body=${JSON.stringify(publicVocabulary.json)}`,
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

    const wrongMethodPublicVocabulary = await req('/api/public/vocabulary/listen/public-fixture-share', { method: 'POST' })
    assert(
      '(c) forced mode: only GET is public for vocabulary shares',
      wrongMethodPublicVocabulary.status === 401 && wrongMethodPublicVocabulary.json?.error === 'not_authenticated',
      `got status=${wrongMethodPublicVocabulary.status} body=${JSON.stringify(wrongMethodPublicVocabulary.json)}`,
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

    const studentSets = await req(`/api/vocabulary/sets?studentId=${encodeURIComponent(studentId)}`, { cookie })
    const defaultStudentSets = await req(`/api/vocabulary/sets?studentId=${encodeURIComponent(defaultStudentId)}`, { cookie })
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
