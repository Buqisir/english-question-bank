#!/usr/bin/env node
// golden-path-e2e (docs/cuts/golden-path-e2e/plan.md): the one real-browser E2E that
// walks the golden path (login -> find -> detail -> add to draft -> workbench ->
// export PDF) under ENFORCED login, once as owner and once as member, asserting the
// member-detail-gate (docs/cuts/member-detail-gate) holds end to end. Everything
// else in scripts/ is either a source-grep verify or a smoke that runs in
// bootstrap-open mode (empty users table, no login). This is the only script that
// creates real users and drives the login form.
//
// Skeleton copied from scripts/smoke-c8-draft-paper-composer.mjs (temp dir DB,
// startProcess, waitForHttp, seed-via-DatabaseSync, cleanup). Key differences from
// that script:
//   - Two users (e2e-owner / e2e-member) are created in the temp USER_DATA_DB via
//     `scripts/create-user.mjs` BEFORE the API starts, so the users table is
//     non-empty and the server serves enforced-login mode from the first request.
//   - Two independent Playwright browser contexts (cookie-isolated) drive the owner
//     and member sessions respectively.
//   - Uses ports 9899 (api) / 5189 (vite) — not used by any other smoke script, to
//     avoid local port clashes when smokes run in parallel.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-golden-path-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
const apiPort = 9899
const vitePort = 5189
const children = []

const OWNER_USERNAME = 'e2e-owner'
const OWNER_PASSWORD = 'golden-path-owner-pw-1'
const MEMBER_USERNAME = 'e2e-member'
const MEMBER_PASSWORD = 'golden-path-member-pw-1'
const WRONG_PASSWORD = 'definitely-not-the-password'

const OWNER_GROUP_TITLE = '黄金路径E2E专用题组Owner'
const MEMBER_GROUP_TITLE = '黄金路径E2E专用题组Member'

let passed = 0

function pass(name) {
  passed += 1
  console.log(`PASS ${name}`)
}

function fail(name, details = '') {
  throw new Error(`${name}${details ? `\n${details}` : ''}`)
}

function startProcess(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    // detached: true puts the child in its own process group. On Linux, `npm
    // run dev:vite` spawns vite as a grandchild; a plain SIGTERM to the npm
    // wrapper does not reach that grandchild, and its still-open stdio pipes
    // keep our event loop alive even after main() has returned (CI
    // hang/timeout observed on PR #276 — did not repro on macOS, where the
    // wrapper happens to forward the signal). Killing the whole group with
    // `-pid` in cleanup() below is what actually reaps the grandchild too.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(`[${options.name}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${options.name}] ${chunk}`))
  return child
}

function cleanup() {
  for (const child of children.reverse()) {
    try {
      // Negative pid targets the whole process group created by detached: true,
      // which is what reaches grandchildren (e.g. vite under `npm run dev:vite`).
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Process (group) may already be gone — nothing to do.
    }
  }
  if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(`Timed out waiting for ${url}`)
}

function createTestUsers() {
  for (const [username, password, role] of [
    [OWNER_USERNAME, OWNER_PASSWORD, 'owner'],
    [MEMBER_USERNAME, MEMBER_PASSWORD, 'member'],
  ]) {
    const result = spawnSync(
      'node',
      ['scripts/create-user.mjs', '--username', username, '--password', password, '--role', role],
      {
        cwd: rootDir,
        env: { ...process.env, USER_DATA_DB: userDataDbPath },
        encoding: 'utf8',
      },
    )
    if (result.status !== 0) {
      fail(`Failed to create test user ${username}`, result.stdout + result.stderr)
    }
  }
}

function seedSmokeDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
  db.exec(`
    INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-golden-path', 'self_made', 2026, 'GP', 'Golden Path Smoke', '完形填空', 'golden-path-e2e fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-golden-path',
      'src-golden-path',
      '黄金路径E2E测试篇章',
      'This passage exists purely to support the golden-path-e2e smoke test and has no pedagogical content of its own.',
      '黄金路径E2E测试篇章',
      '人与自我',
      'cloze',
      'medium'
    );
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-golden-owner', 'passage-golden-path', 'cloze', '${OWNER_GROUP_TITLE}', 'Choose the best answer.', 99, 1, 'medium', 'golden-path-e2e owner group');
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-golden-member', 'passage-golden-path', 'cloze', '${MEMBER_GROUP_TITLE}', 'Choose the best answer.', 100, 1, 'medium', 'golden-path-e2e member group');
  `)
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, ?, ?, 'A', 'golden-path-e2e smoke', 'medium', ?, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const groupId of ['g-golden-owner', 'g-golden-member']) {
    const qid = `q-${groupId}-1`
    insertQuestion.run(qid, groupId, '1', '完形语义', 'Smoke stem with printable content.', 1, 1)
    for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
      insertOption.run(`opt-${groupId}-${label}`, qid, label, `Option ${label}`, optionIndex + 1)
    }
  }
  db.close()
}

async function waitForConciergeDeskReady(page) {
  await page.getByPlaceholder(/找一道|正在连接|比如/).waitFor({ timeout: 15_000 })
  // Guard against the search racing the initial /api/question-groups fetch:
  // wait until both smoke fixture groups are present and addable before searching.
  await page.waitForFunction(async () => {
    const data = await fetch('/api/question-groups').then((response) => response.json())
    const groups = new Map(data.questionGroups.map((group) => [group.id, group]))
    return ['g-golden-owner', 'g-golden-member'].every((groupId) => groups.get(groupId)?.canAddToDraftPaper)
  }, { timeout: 15_000 })
}

async function searchAndOpenGroupCard(page, searchText, groupId) {
  await page.getByPlaceholder(/找一道|正在连接|比如/).fill(searchText)
  await page.getByRole('button', { name: '开始取题' }).click()
  // The two smoke fixture groups share one source/paper, so a matching search
  // always returns exactly one paper row, which useConciergeDesk auto-expands
  // (no click needed — clicking "展开题组" here would race the auto-expand
  // effect and could toggle it back closed).
  const card = page.locator(`[data-group-id="${groupId}"]`).first()
  await card.waitFor({ timeout: 15_000 })
  return card
}

async function runOwnerFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })

    // C2: enforced login is actually in effect — the login card must appear first.
    await page.locator('.login-card').waitFor({ timeout: 10_000 })
    await page.locator('#login-username').waitFor()
    pass('Enforced mode shows the login page on first load (owner context)')

    // C2: wrong password is rejected.
    await page.locator('#login-username').fill(OWNER_USERNAME)
    await page.locator('#login-password').fill(WRONG_PASSWORD)
    await page.locator('.login-submit').click()
    await page.locator('.login-error').waitFor({ timeout: 10_000 })
    pass('Wrong password is rejected with a login-error')

    // C2: correct password logs in (full page reload).
    await page.locator('#login-password').fill('')
    await page.locator('#login-password').fill(OWNER_PASSWORD)
    await page.locator('.login-submit').click()
    await page.waitForURL(`http://127.0.0.1:${vitePort}/`)
    await waitForConciergeDeskReady(page)
    pass('Correct password logs owner in and lands on the 找题面')

    // C3: find -> expand -> detail.
    const ownerCard = await searchAndOpenGroupCard(page, OWNER_GROUP_TITLE, 'g-golden-owner')
    await ownerCard.getByRole('button', { name: '详情' }).click()
    await page.locator('.detail-view').waitFor({ timeout: 10_000 })
    pass('Owner opens 题组详情 from the card')

    // Owner-only gate elements are present for the owner.
    await page.locator('[aria-label="删除题组"]').waitFor({ timeout: 10_000 })
    pass('Owner detail view shows the owner-only 删除题组 control')

    // C3: add to draft from the detail view. NOTE: selectedDetail (the detail
    // view's own state) is not re-synced with questionGroups after the add, so the
    // button label does not flip to "已在草稿卷中" in this view (pre-existing
    // App.tsx behavior, out of scope for this cut) — assert on the mutation
    // response instead of the label.
    const ownerAddSaved = page.waitForResponse(
      (response) => response.url().includes('/api/draft-papers/current/items') && response.request().method() === 'POST',
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: '加入草稿卷' }).click()
    const ownerAddResponse = await ownerAddSaved
    if (!ownerAddResponse.ok()) {
      fail('Owner add-to-draft request should succeed', await ownerAddResponse.text().catch(() => `HTTP ${ownerAddResponse.status()}`))
    }
    pass('Owner adds the group to the draft paper from the detail view')

    // C3: open workbench via basket-chip.
    await page.locator('.basket-chip').click()
    await page.waitForURL(/view=draft-paper/)
    await page.locator('.draft-workbench-shell').waitFor({ timeout: 10_000 })
    await page.locator('[data-draft-group-id="g-golden-owner"]').waitFor({ timeout: 10_000 })
    pass('Owner basket-chip opens the draft workbench with the added group in the outline')

    // C3: export PDF — fetch bytes directly from the page (plan.md 参考实现).
    // CI has confirmed vivliostyle is available in Actions (PR #276), so the
    // pre-approved 503 degrade path is no longer needed — this is a hard
    // requirement for 200 + %PDF in every environment.
    const draftInfo = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current')
      return response.json()
    })
    const draftPaperId = draftInfo.draftPaper.id

    const pdfResult = await page.evaluate(async (id) => {
      const response = await fetch(`/api/draft-papers/${encodeURIComponent(id)}/print-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionType: 'student' }),
      })
      const buffer = await response.arrayBuffer()
      const head = new TextDecoder('latin1').decode(new Uint8Array(buffer).slice(0, 4))
      return { status: response.status, head, byteLength: buffer.byteLength }
    }, draftPaperId)

    if (pdfResult.status !== 200 || pdfResult.head !== '%PDF') {
      fail('Owner PDF export should return 200 with a %PDF body', JSON.stringify(pdfResult))
    }
    pass(`Owner PDF export returns 200 with a %PDF body (${pdfResult.byteLength} bytes)`)

    if (pageErrors.length > 0) {
      fail('No browser page errors expected in owner flow', pageErrors.join('\n'))
    }
    pass('No page errors in owner flow')

    return { draftPaperId }
  } finally {
    await context.close()
  }
}

async function runMemberFlow(browser, ownerDraftPaperId) {
  // C4: independent, cookie-isolated browser context.
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
    await page.locator('.login-card').waitFor({ timeout: 10_000 })
    pass('Enforced mode shows the login page on first load (member context)')

    await page.locator('#login-username').fill(MEMBER_USERNAME)
    await page.locator('#login-password').fill(MEMBER_PASSWORD)
    await page.locator('.login-submit').click()
    await page.waitForURL(`http://127.0.0.1:${vitePort}/`)
    await waitForConciergeDeskReady(page)
    pass('Correct password logs member in and lands on the 找题面')

    // C4: user data isolation — member's current draft paper must not contain the
    // group the owner added. Member has not added anything yet, so a 404 (no
    // current draft paper exists at all) is itself a valid isolation result.
    const memberDraftBeforeAdd = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current')
      return { ok: response.ok, status: response.status, body: await response.json() }
    })
    if (memberDraftBeforeAdd.ok) {
      const hasOwnerGroup = memberDraftBeforeAdd.body.draftPaper.items.some((item) => item.groupId === 'g-golden-owner')
      if (hasOwnerGroup) {
        fail("Member's draft paper must not contain the owner's group", JSON.stringify(memberDraftBeforeAdd))
      }
      if (memberDraftBeforeAdd.body.draftPaper.id === ownerDraftPaperId) {
        fail("Member's current draft paper must be a different record than the owner's", ownerDraftPaperId)
      }
    } else if (memberDraftBeforeAdd.status !== 404) {
      fail('Unexpected error fetching current draft paper for member', JSON.stringify(memberDraftBeforeAdd))
    }
    pass("Member's current draft paper is isolated from the owner's")

    // C4: member walks find -> detail -> add -> workbench with their own group.
    const memberCard = await searchAndOpenGroupCard(page, MEMBER_GROUP_TITLE, 'g-golden-member')
    await memberCard.getByRole('button', { name: '详情' }).click()
    await page.locator('.detail-view').waitFor({ timeout: 10_000 })
    pass('Member opens 题组详情 from the card')

    // C4: owner-only panels must ALL be absent for the member.
    const editButtonCount = await page.getByRole('button', { name: '编辑' }).count()
    const deleteButtonCount = await page.locator('[aria-label="删除题组"]').count()
    const answerCompareCount = await page.locator('.answer-compare-summary').count()
    const verifyListCount = await page.locator('.verify-list').count()
    const manageButtonCount = await page.getByRole('button', { name: /^管理$|^退出管理$/ }).count()
    const goneAway = {
      editButtonCount,
      deleteButtonCount,
      answerCompareCount,
      verifyListCount,
      manageButtonCount,
    }
    if (editButtonCount !== 0 || deleteButtonCount !== 0 || answerCompareCount !== 0 || verifyListCount !== 0 || manageButtonCount !== 0) {
      fail('Member view must hide all owner-only gate elements', JSON.stringify(goneAway))
    }
    pass('Member detail view hides 编辑/删除/答案对比统计/verify-list/顶栏管理 (member-detail-gate holds)')

    const memberAddSaved = page.waitForResponse(
      (response) => response.url().includes('/api/draft-papers/current/items') && response.request().method() === 'POST',
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: '加入草稿卷' }).click()
    const memberAddResponse = await memberAddSaved
    if (!memberAddResponse.ok()) {
      fail('Member add-to-draft request should succeed', await memberAddResponse.text().catch(() => `HTTP ${memberAddResponse.status()}`))
    }
    await page.locator('.basket-chip').click()
    await page.waitForURL(/view=draft-paper/)
    await page.locator('.draft-workbench-shell').waitFor({ timeout: 10_000 })
    await page.locator('[data-draft-group-id="g-golden-member"]').waitFor({ timeout: 10_000 })
    const memberOutlineHasOwnerGroup = await page.locator('[data-draft-group-id="g-golden-owner"]').count()
    if (memberOutlineHasOwnerGroup !== 0) {
      fail("Member's workbench outline must not contain the owner's group")
    }
    pass("Member walks find -> detail -> add -> workbench with full user-data isolation")

    if (pageErrors.length > 0) {
      fail('No browser page errors expected in member flow', pageErrors.join('\n'))
    }
    pass('No page errors in member flow')
  } finally {
    await context.close()
  }
}

async function main() {
  seedSmokeDatabase()
  createTestUsers()

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir,
    name: 'api',
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      USER_DATA_DB: userDataDbPath,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  pass('API started with temp DB and enforced-mode users')

  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'),
    name: 'vite',
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)
  pass('Vite app started')

  const browser = await chromium.launch({ headless: true })
  try {
    const { draftPaperId } = await runOwnerFlow(browser)
    await runMemberFlow(browser, draftPaperId)
  } finally {
    await browser.close()
  }

  console.log(`\nGolden path E2E passed: ${passed} checks`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    cleanup()
    // Explicit exit is the actual fix for the CI hang (PR #276): detached
    // process groups can still leave dangling fds/handles referenced by this
    // process even after every child is killed, which keeps Node's event loop
    // alive indefinitely instead of returning from main(). Don't rely on
    // natural process exit — force it with the exit code already computed above.
    process.exit(process.exitCode || 0)
  })
