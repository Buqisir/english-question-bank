#!/usr/bin/env node
// M0-4 verify: user data isolation contract (docs/cuts/m0-4-user-scope/plan.md
// "验收" 1-3). Hermetic: every one of the 4 env-path vars the plan's Forbidden
// section names (QUESTION_BANK_DB / USER_DATA_DB / QUESTION_BANK_PAPER_ASSET_ROOT /
// QUESTION_BANK_USER_SPACE_ROOT) is pointed at a throwaway temp dir, plus a
// dedicated port — same discipline as scripts/verify-owner-gate.mjs (M0-3's
// hermeticity fix landed after that cut shipped without the paper-assets override).
// No vivliostyle dependency: artifact rows for the My Space assertions are inserted
// directly into a temp user-data DB via a short-lived DatabaseSync connection rather
// than going through the real PDF export pipeline.
//
// Three fixtures, matching plan.md verification 1/2/3:
//   1. Open-mode regression: empty users table, full draft/my-space CRUD flow,
//      then a direct DB check that every touched row's user_id = 'local'.
//   2. Two-user isolation: CLI-created owner A + member B, logged in, cross-user
//      404s on drafts/items/print-html/artifacts (incl. PA MF-3's "borrow A's
//      draftId through the export route" vector), folder same-name-per-user vs.
//      same-name-within-user, and owner-has-no-private-data-privilege.
//   3. Migration: hand-built v2-shape DB (no user_id columns, user_version=2, one
//      current_marker=1 row) -> ensure -> assert columns/backfill/index/version;
//      re-run ensure -> idempotent; separately, a hand-built half-migrated DB
//      (draft_papers already has user_id, my_space_folders does not,
//      user_version still 2) -> ensure -> converges to v3 with folder data intact
//      (PA MF-2 crash-reentry path).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

// ── Shared server-process harness (same shape as verify-owner-gate.mjs) ──────────

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
      // some responses are not JSON (e.g. print-html)
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

// Seeds a bank DB with the full production schema plus one print-ready cloze group
// (5 objective questions x 4 options — mirrors scripts/smoke-c8-draft-paper-composer.mjs's
// proven minimal print-ready recipe) so addGroupToCurrentDraftPaper actually succeeds.
function seedBankDatabaseWithPrintableGroup(dbPath, groupId) {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(`
    INSERT INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-user-scope-verify', 'self_made', 2026, 'M0-4', 'User Scope Verify', '完形填空', 'verify-user-scope fixture');
    INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-user-scope-verify',
      'src-user-scope-verify',
      'User scope verify passage',
      -- draft-numbering-style: 'cloze' is a BLANK_BEARING_GROUP_TYPE — the
      -- renderer's hard consistency assertion (in-text blank count === question
      -- count) now fires whenever a draft-paper route builds print HTML
      -- (getDraftPaper defaults includePrintHtml:true), which addGroupToCurrentDraftPaper
      -- / updateDraftPaper / etc. all do after every mutation. 5 real
      -- paperBlankPattern markers here match the 5 seeded questions below
      -- (shared by BOTH groups this fixture seeds, since they share this one
      -- passage row) so this fixture stays print-ready under the new contract.
      'This passage exists only to make the group print-ready. __1__ __2__ __3__ __4__ __5__ for the verify-user-scope hermetic fixture.',
      'User scope verify passage',
      '人与自我',
      'cloze',
      'medium'
    );
    INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('${groupId}', 'passage-user-scope-verify', 'cloze', 'User scope verify group', 'Choose the best answer.', 1, 1, 'medium', 'verify fixture');
  `)
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, '完形语义', ?, 'A', 'verify fixture', 'medium', 1, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (let i = 1; i <= 5; i += 1) {
    const qid = `${groupId}-q${i}`
    insertQuestion.run(qid, groupId, String(i), `Verify stem ${i} with printable content.`, i)
    for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
      insertOption.run(`${qid}-${label}`, qid, label, `Option ${label}`, optionIndex + 1)
    }
  }
  db.close()
}

function makeTempFixture(prefix) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  const userSpaceRoot = path.join(tempRoot, 'user-space-files')
  mkdirSync(paperAssetsDir, { recursive: true })
  mkdirSync(userSpaceRoot, { recursive: true })
  return { tempRoot, dbPath, userDataDbPath, paperAssetsDir, userSpaceRoot }
}

function envFor(fixture, port) {
  return {
    ...process.env,
    QUESTION_BANK_DB: fixture.dbPath,
    USER_DATA_DB: fixture.userDataDbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: fixture.paperAssetsDir,
    QUESTION_BANK_USER_SPACE_ROOT: fixture.userSpaceRoot,
    QUESTION_BANK_API_PORT: String(port),
  }
}

async function stopServerAndCleanup(fixture) {
  for (const child of children.splice(0, children.length)) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 150))
  rmSync(fixture.tempRoot, { recursive: true, force: true })
}

// ── Fixture 1: open-mode regression ───────────────────────────────────────────────

async function verifyOpenModeRegression() {
  const fixture = makeTempFixture('eqb-verify-user-scope-open-')
  const groupId = 'g-user-scope-open'
  seedBankDatabaseWithPrintableGroup(fixture.dbPath, groupId)
  const apiPort = 9931
  const env = envFor(fixture, apiPort)
  const req = makeReq(apiPort)
  startServer(env)

  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

    const addResult = await req('/api/draft-papers/current/items', {
      method: 'POST',
      body: { groupId },
    })
    assert('1. open mode: add group to current draft succeeds', addResult.status === 201, `status=${addResult.status} body=${JSON.stringify(addResult.json)}`)

    const currentResult = await req('/api/draft-papers/current')
    assert('1. open mode: current draft fetch succeeds', currentResult.status === 200 && currentResult.json?.draftPaper?.items?.length === 1)
    const draftPaperId = currentResult.json?.draftPaper?.id

    const folderResult = await req('/api/my-space/folders', {
      method: 'POST',
      body: { name: '开放模式文件夹' },
    })
    assert('1. open mode: folder create succeeds', folderResult.status === 201, `status=${folderResult.status}`)

    const listResult = await req('/api/question-groups')
    assert('1. open mode: list question groups succeeds (getDraftSearchContext w/ local userId)', listResult.status === 200)
    const card = listResult.json?.questionGroups?.find((g) => g.id === groupId)
    assert('1. open mode: in_current_draft button state reflects the add', card?.draftPaperButtonState === 'in_current_draft', JSON.stringify(card))

    // Direct DB check: every touched row's user_id must be 'local' (decision 1).
    const userDb = new DatabaseSync(fixture.userDataDbPath, { readOnly: true })
    try {
      const draftRows = userDb.prepare('SELECT user_id FROM draft_papers').all()
      assert('1. open mode: all draft_papers rows are user_id=local', draftRows.length > 0 && draftRows.every((row) => row.user_id === 'local'), JSON.stringify(draftRows))
      const folderRows = userDb.prepare('SELECT user_id FROM my_space_folders').all()
      assert('1. open mode: all my_space_folders rows are user_id=local', folderRows.length > 0 && folderRows.every((row) => row.user_id === 'local'), JSON.stringify(folderRows))
    } finally {
      userDb.close()
    }

    assert('1. open mode: draftPaperId resolved for downstream sanity', typeof draftPaperId === 'string' && draftPaperId.length > 0)
  } finally {
    await stopServerAndCleanup(fixture)
  }
}

// ── Fixture 2: two-user isolation ─────────────────────────────────────────────────

async function verifyTwoUserIsolation() {
  const fixture = makeTempFixture('eqb-verify-user-scope-multi-')
  const groupIdA = 'g-user-scope-a'
  const groupIdB = 'g-user-scope-b'
  seedBankDatabaseWithPrintableGroup(fixture.dbPath, groupIdA)
  // Second printable group for B, sharing the same passage/source rows.
  {
    const db = new DatabaseSync(fixture.dbPath)
    db.exec(`
      INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
      VALUES ('${groupIdB}', 'passage-user-scope-verify', 'cloze', 'User scope verify group B', 'Choose the best answer.', 2, 1, 'medium', 'verify fixture');
    `)
    const insertQuestion = db.prepare(`
      INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
      VALUES (?, ?, ?, '完形语义', ?, 'A', 'verify fixture', 'medium', 1, ?, '')
    `)
    const insertOption = db.prepare(`
      INSERT INTO options (id, question_id, label, content, display_order)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (let i = 1; i <= 5; i += 1) {
      const qid = `${groupIdB}-q${i}`
      insertQuestion.run(qid, groupIdB, String(i), `Verify stem ${i} with printable content.`, i)
      for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
        insertOption.run(`${qid}-${label}`, qid, label, `Option ${label}`, optionIndex + 1)
      }
    }
    db.close()
  }

  const apiPort = 9932
  const env = envFor(fixture, apiPort)
  const req = makeReq(apiPort)
  startServer(env)

  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

    await runCli(['--username', 'verify-scope-owner-a', '--password', 'Verify-Pass-123', '--role', 'owner'], env)
    await runCli(['--username', 'verify-scope-member-b', '--password', 'Verify-Pass-123', '--role', 'member'], env)

    const loginA = await req('/api/auth/login', { method: 'POST', body: { username: 'verify-scope-owner-a', password: 'Verify-Pass-123' } })
    assert('2. A (owner) login succeeds', loginA.status === 200 && Boolean(loginA.setCookie))
    const cookieA = cookieHeaderFrom(loginA.setCookie)

    const loginB = await req('/api/auth/login', { method: 'POST', body: { username: 'verify-scope-member-b', password: 'Verify-Pass-123' } })
    assert('2. B (member) login succeeds', loginB.status === 200 && Boolean(loginB.setCookie))
    const cookieB = cookieHeaderFrom(loginB.setCookie)

    // A and B each add a group to their own current draft; each sets their own current
    // without colliding on the composite (user_id, current_marker) unique index.
    const addA = await req('/api/draft-papers/current/items', { method: 'POST', body: { groupId: groupIdA }, cookie: cookieA })
    assert('2. A adds group to current draft (no UNIQUE collision)', addA.status === 201, `status=${addA.status} body=${JSON.stringify(addA.json)}`)
    const draftIdA = addA.json?.draftPaper?.id

    const addB = await req('/api/draft-papers/current/items', { method: 'POST', body: { groupId: groupIdB }, cookie: cookieB })
    assert('2. B adds group to current draft (no UNIQUE collision)', addB.status === 201, `status=${addB.status} body=${JSON.stringify(addB.json)}`)
    const draftIdB = addB.json?.draftPaper?.id

    assert('2. A and B got different draft ids', draftIdA && draftIdB && draftIdA !== draftIdB)

    const currentA = await req('/api/draft-papers/current', { cookie: cookieA })
    assert('2. GET current for A returns A\'s own draft', currentA.status === 200 && currentA.json?.draftPaper?.id === draftIdA)
    const currentB = await req('/api/draft-papers/current', { cookie: cookieB })
    assert('2. GET current for B returns B\'s own draft', currentB.status === 200 && currentB.json?.draftPaper?.id === draftIdB)

    // B's list only shows B's own draft (listDraftPapers scoped by userId).
    const listB = await req('/api/draft-papers', { cookie: cookieB })
    assert(
      '2. B\'s draft list only contains B\'s own draft',
      listB.status === 200 && listB.json?.draftPapers?.length === 1 && listB.json.draftPapers[0].id === draftIdB,
      JSON.stringify(listB.json),
    )

    // B uses A's draft id -> 404 on GET/PATCH/DELETE-items/print-html.
    const getByB = await req(`/api/draft-papers/${draftIdA}`, { cookie: cookieB })
    assert('2. B GET A\'s draftId -> 404', getByB.status === 404, `status=${getByB.status}`)

    const patchByB = await req(`/api/draft-papers/${draftIdA}`, { method: 'PATCH', body: { title: 'hijacked' }, cookie: cookieB })
    assert('2. B PATCH A\'s draftId -> 404', patchByB.status === 404, `status=${patchByB.status} body=${JSON.stringify(patchByB.json)}`)

    // Need an itemId on A's draft to test the items DELETE/PATCH cross-user path.
    const draftAFull = await req(`/api/draft-papers/${draftIdA}`, { cookie: cookieA })
    const itemIdA = draftAFull.json?.draftPaper?.items?.[0]?.id
    assert('2. resolved A\'s item id for cross-user item tests', typeof itemIdA === 'string' && itemIdA.length > 0)

    const patchItemByB = await req(`/api/draft-papers/${draftIdA}/items/${itemIdA}`, { method: 'PATCH', body: { pageBreakBefore: true }, cookie: cookieB })
    assert('2. B PATCH A\'s item -> 404', patchItemByB.status === 404, `status=${patchItemByB.status} body=${JSON.stringify(patchItemByB.json)}`)

    const deleteItemByB = await req(`/api/draft-papers/${draftIdA}/items/${itemIdA}`, { method: 'DELETE', cookie: cookieB })
    assert('2. B DELETE A\'s item -> 404', deleteItemByB.status === 404, `status=${deleteItemByB.status} body=${JSON.stringify(deleteItemByB.json)}`)

    const printHtmlByB = await req(`/api/draft-papers/${draftIdA}/print-html`, { cookie: cookieB })
    assert('2. B GET A\'s print-html -> 404', printHtmlByB.status === 404, `status=${printHtmlByB.status}`)

    // owner has no private-data privilege: A (owner) using B's draftId also 404s.
    const getAOnB = await req(`/api/draft-papers/${draftIdB}`, { cookie: cookieA })
    assert('2. A (owner) GET B\'s draftId -> 404 (no owner privilege on private data)', getAOnB.status === 404, `status=${getAOnB.status}`)

    // Folders: A and B can each create a folder with the SAME name; a second folder
    // with the same name for the SAME user still collides.
    const folderA = await req('/api/my-space/folders', { method: 'POST', body: { name: '共享名称文件夹' }, cookie: cookieA })
    assert('2. A creates folder "共享名称文件夹"', folderA.status === 201, `status=${folderA.status}`)
    const folderB = await req('/api/my-space/folders', { method: 'POST', body: { name: '共享名称文件夹' }, cookie: cookieB })
    assert('2. B creates a folder with the SAME name (per-user unique, not global)', folderB.status === 201, `status=${folderB.status} body=${JSON.stringify(folderB.json)}`)
    const folderADupe = await req('/api/my-space/folders', { method: 'POST', body: { name: '共享名称文件夹' }, cookie: cookieA })
    assert('2. A creating a SECOND folder with the same name still collides (within-user unique)', folderADupe.status === 400 && /已存在/.test(folderADupe.json?.error || ''), JSON.stringify(folderADupe.json))

    // Artifacts: hermetic (no vivliostyle — plan.md verify-user-scope requirement).
    // A "saves a draft to My Space" without running the real PDF export pipeline: a
    // fake PDF is inserted directly via saveMySpaceArtifact against the SAME temp
    // user-data DB file the running server is using (a second short-lived SQLite
    // connection to the same file is safe here — the server isn't writing to this
    // artifact row concurrently). saveMySpaceArtifact needs A's REAL resolved
    // userId (session.userId) so the folderId-ownership check inside it (and the
    // download-route ownership check below) line up against A's own folder row.
    const meA = await req('/api/auth/me', { cookie: cookieA })
    const userIdA = meA.json?.user?.id
    assert('2. resolved A\'s real userId via /api/auth/me', typeof userIdA === 'string' && userIdA.length > 0)

    const mySpaceModule = await import(path.join(rootDir, 'server/my-space/mySpace.mjs'))
    const artifactDb = new DatabaseSync(fixture.userDataDbPath)
    let artifactIdA
    let downloadUrlA
    try {
      const fakePdfBody = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF')
      const artifact = mySpaceModule.saveMySpaceArtifact(artifactDb, userIdA, {
        filesRoot: fixture.userSpaceRoot,
        draftPaper: { id: draftIdA, title: 'A\'s draft' },
        pdfBody: fakePdfBody,
        folderId: folderA.json.folder.id,
        fileName: 'A-draft.pdf',
      })
      artifactIdA = artifact.id
      downloadUrlA = artifact.fileUrl
    } finally {
      artifactDb.close()
    }

    const downloadByBResponse = await fetch(`http://127.0.0.1:${apiPort}${downloadUrlA}`, { headers: { cookie: cookieB } })
    assert('2. B downloads A\'s artifact PDF -> 404', downloadByBResponse.status === 404, `status=${downloadByBResponse.status}`)
    const downloadByAResponse = await fetch(`http://127.0.0.1:${apiPort}${downloadUrlA}`, { headers: { cookie: cookieA } })
    assert('2. A downloads her own artifact PDF -> 200', downloadByAResponse.status === 200, `status=${downloadByAResponse.status}`)

    const deleteArtifactByB = await req(`/api/my-space/artifacts/${artifactIdA}`, { method: 'DELETE', cookie: cookieB })
    assert('2. B DELETE A\'s artifact -> 404', deleteArtifactByB.status === 404, `status=${deleteArtifactByB.status}`)

    // PA MF-3: B borrows A's draftId through the export/save-to-space route. This
    // 404s inside exportDraftPaperPdf's ownership check, BEFORE vivliostyle is ever
    // invoked — safe to exercise as a real HTTP call in this hermetic script.
    const borrowByB = await req('/api/my-space/artifacts', { method: 'POST', body: { draftPaperId: draftIdA }, cookie: cookieB })
    assert('2. B borrows A\'s draftId via POST /api/my-space/artifacts -> 404 (PA MF-3)', borrowByB.status === 404, `status=${borrowByB.status} body=${JSON.stringify(borrowByB.json)}`)

    // B tries to file an artifact into A's folder id. Exercised directly against
    // saveMySpaceArtifact (not the real POST route) to stay hermetic — going through
    // the route would require a genuine PDF export via vivliostyle for B's own
    // draft first, which this script deliberately does not run.
    const meB = await req('/api/auth/me', { cookie: cookieB })
    const userIdB = meB.json?.user?.id
    assert('2. resolved B\'s real userId via /api/auth/me', typeof userIdB === 'string' && userIdB.length > 0)
    const misfileDb = new DatabaseSync(fixture.userDataDbPath)
    let misfileRejected = false
    try {
      mySpaceModule.saveMySpaceArtifact(misfileDb, userIdB, {
        filesRoot: fixture.userSpaceRoot,
        draftPaper: { id: draftIdB, title: 'B\'s draft' },
        pdfBody: Buffer.from('%PDF-1.4\n%%EOF'),
        folderId: folderA.json.folder.id,
        fileName: 'B-misfile.pdf',
      })
    } catch (error) {
      misfileRejected = /文件夹不存在/.test(error?.message || '')
    } finally {
      misfileDb.close()
    }
    assert('2. B files an artifact into A\'s folderId -> saveMySpaceArtifact rejects (PA MF-3 folderId ownership check)', misfileRejected)
  } finally {
    await stopServerAndCleanup(fixture)
  }
}

// ── Fixture 3: migration ──────────────────────────────────────────────────────────

function buildV2ShapeUserDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE draft_papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'english',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
      current_marker INTEGER NOT NULL DEFAULT 0 CHECK (current_marker IN (0, 1)),
      last_printed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE draft_paper_items (
      id TEXT PRIMARY KEY,
      draft_paper_id TEXT NOT NULL REFERENCES draft_papers(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      source_paper_id TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      page_break_before INTEGER NOT NULL DEFAULT 0 CHECK (page_break_before IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(draft_paper_id, group_id)
    );
    CREATE UNIQUE INDEX idx_draft_papers_current_one ON draft_papers(current_marker) WHERE current_marker = 1;
    CREATE TABLE my_space_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE my_space_artifacts (
      id TEXT PRIMARY KEY,
      folder_id TEXT REFERENCES my_space_folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      artifact_type TEXT NOT NULL DEFAULT 'student-paper' CHECK (artifact_type IN ('student-paper')),
      source_draft_paper_id TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    INSERT INTO draft_papers (id, title, current_marker) VALUES ('mig-d1', 'Migrated Draft 1', 1);
    INSERT INTO draft_papers (id, title, current_marker) VALUES ('mig-d2', 'Migrated Draft 2', 0);
    INSERT INTO draft_paper_items (id, draft_paper_id, group_id) VALUES ('mig-i1', 'mig-d1', 'g1');
    INSERT INTO my_space_folders (id, name) VALUES ('mig-f1', 'Migrated Folder');
    INSERT INTO my_space_artifacts (id, folder_id, title, file_name, file_path, source_draft_paper_id)
      VALUES ('mig-a1', 'mig-f1', 'Migrated Artifact', 'mig.pdf', '/tmp/mig.pdf', 'mig-d1');
    PRAGMA user_version = 2;
  `)
  db.close()
}

// PA MF-2 crash-reentry fixture: simulates a boot that crashed AFTER the
// draft_papers/my_space_artifacts ADD COLUMN loop but BEFORE the my_space_folders
// rebuild — draft_papers/my_space_artifacts already have user_id, my_space_folders
// does not, user_version is still stuck at 2 (never reached the final bump).
function buildHalfMigratedUserDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE draft_papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'english',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
      current_marker INTEGER NOT NULL DEFAULT 0 CHECK (current_marker IN (0, 1)),
      last_printed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE draft_paper_items (
      id TEXT PRIMARY KEY,
      draft_paper_id TEXT NOT NULL REFERENCES draft_papers(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      source_paper_id TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      page_break_before INTEGER NOT NULL DEFAULT 0 CHECK (page_break_before IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(draft_paper_id, group_id)
    );
    CREATE UNIQUE INDEX idx_draft_papers_current_one ON draft_papers(current_marker) WHERE current_marker = 1;
    CREATE TABLE my_space_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE my_space_artifacts (
      id TEXT PRIMARY KEY,
      folder_id TEXT REFERENCES my_space_folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      artifact_type TEXT NOT NULL DEFAULT 'student-paper' CHECK (artifact_type IN ('student-paper')),
      source_draft_paper_id TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    INSERT INTO draft_papers (id, title, current_marker, user_id) VALUES ('half-d1', 'Half-migrated Draft', 1, 'local');
    INSERT INTO my_space_folders (id, name) VALUES ('half-f1', 'Half-migrated Folder');
    PRAGMA user_version = 2;
  `)
  db.close()
}

async function verifyMigration() {
  const { ensureUserDatabaseShape } = await import(path.join(rootDir, 'server/api.mjs'))

  // --- v2-shape database ---
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-user-scope-migration-v2-'))
  const dbPath = path.join(tempRoot, 'user-data.sqlite')
  try {
    buildV2ShapeUserDb(dbPath)
    const db = new DatabaseSync(dbPath)
    try {
      ensureUserDatabaseShape(db)

      const userVersion = db.prepare('PRAGMA user_version').get().user_version
      assert('3. v2 migration: user_version bumped to 3', userVersion === 3, `got ${userVersion}`)

      const draftCols = db.prepare('PRAGMA table_info(draft_papers)').all().map((row) => row.name)
      assert('3. v2 migration: draft_papers has user_id column', draftCols.includes('user_id'))
      const folderCols = db.prepare('PRAGMA table_info(my_space_folders)').all().map((row) => row.name)
      assert('3. v2 migration: my_space_folders has user_id column', folderCols.includes('user_id'))
      const artifactCols = db.prepare('PRAGMA table_info(my_space_artifacts)').all().map((row) => row.name)
      assert('3. v2 migration: my_space_artifacts has user_id column', artifactCols.includes('user_id'))

      const draftRows = db.prepare('SELECT id, user_id, current_marker FROM draft_papers ORDER BY id').all()
      assert('3. v2 migration: existing draft rows backfilled to user_id=local', draftRows.every((row) => row.user_id === 'local'), JSON.stringify(draftRows))
      const folderRow = db.prepare("SELECT * FROM my_space_folders WHERE id = 'mig-f1'").get()
      assert('3. v2 migration: folder row survives the rebuild', folderRow?.name === 'Migrated Folder' && folderRow?.user_id === 'local')

      const indexDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_draft_papers_current_one'").get()
      assert('3. v2 migration: current-draft index is now composite (user_id, current_marker)', /user_id,\s*current_marker/.test(indexDef?.sql || ''), indexDef?.sql)
      const indexInfo = db.prepare("PRAGMA index_info('idx_draft_papers_current_one')").all()
      assert('3. v2 migration: PRAGMA index_info reports 2 indexed columns', indexInfo.length === 2, JSON.stringify(indexInfo))

      // Old rows can still be read through the open-mode API surface (userId='local').
      const draftPaperStoreModule = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))
      const store = draftPaperStoreModule.createDraftPaperStore({
        exportDir: tempRoot,
        getQuestionGroupDetail: () => null,
        groupTypeLabels: {},
        isGroupPrintReady: () => ({ ok: true, reason: null }),
        openDatabase: () => { throw new Error('bank db should not be touched by getCurrentDraftPaperRow') },
        openUserDatabase: () => db,
        paperAssetsDir: tempRoot,
        rootDir: tempRoot,
        selectQuestionGroupCards: () => [],
      })
      const currentRow = store.getCurrentDraftPaperRow(db, 'local')
      assert('3. v2 migration: old current-marker row still readable via userId=local', currentRow?.id === 'mig-d1', JSON.stringify(currentRow))

      const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
      assert('3. v2 migration: foreign_key_check reports zero violations', fkViolations.length === 0, JSON.stringify(fkViolations))

      // Re-run: must be idempotent (no throw, version stays 3).
      let secondRunThrew = false
      try {
        ensureUserDatabaseShape(db)
      } catch {
        secondRunThrew = true
      }
      assert('3. v2 migration: re-running ensure is idempotent (no throw)', !secondRunThrew)
      assert('3. v2 migration: user_version stays 3 after re-run', db.prepare('PRAGMA user_version').get().user_version === 3)
    } finally {
      db.close()
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }

  // --- half-migrated (crash-reentry) database — PA MF-2 ---
  const halfTempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-user-scope-migration-half-'))
  const halfDbPath = path.join(halfTempRoot, 'user-data.sqlite')
  try {
    buildHalfMigratedUserDb(halfDbPath)
    const db = new DatabaseSync(halfDbPath)
    try {
      let threw = false
      try {
        ensureUserDatabaseShape(db)
      } catch (error) {
        threw = true
        console.error(`  half-migrated ensure threw: ${error?.message || error}`)
      }
      assert('3. half-migrated (PA MF-2): ensure does not throw', !threw)

      const userVersion = db.prepare('PRAGMA user_version').get().user_version
      assert('3. half-migrated (PA MF-2): converges to user_version=3', userVersion === 3, `got ${userVersion}`)

      const folderCols = db.prepare('PRAGMA table_info(my_space_folders)').all().map((row) => row.name)
      assert('3. half-migrated (PA MF-2): my_space_folders gained user_id via rebuild', folderCols.includes('user_id'))

      const folderRow = db.prepare("SELECT * FROM my_space_folders WHERE id = 'half-f1'").get()
      assert('3. half-migrated (PA MF-2): pre-existing folder data NOT lost by the rebuild', folderRow?.name === 'Half-migrated Folder' && folderRow?.user_id === 'local', JSON.stringify(folderRow))

      const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
      assert('3. half-migrated (PA MF-2): foreign_key_check reports zero violations', fkViolations.length === 0, JSON.stringify(fkViolations))
    } finally {
      db.close()
    }
  } finally {
    rmSync(halfTempRoot, { recursive: true, force: true })
  }
}

async function main() {
  await verifyOpenModeRegression()
  await verifyTwoUserIsolation()
  await verifyMigration()
}

await main()

if (failed > 0) {
  console.error(`\nUser scope verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nUser scope verify passed: ${passed} passed, 0 failed`)
