#!/usr/bin/env node
// home-blank DP-2 — five-acts browser QA against the wt-home-blank worktree.
// Boot skeleton copied from scripts/smoke-golden-path.mjs (temp DBs, enforced
// login, detached process groups). Ports 9897/5187 — distinct from every smoke
// script (9899/5189 etc.) per the print-form port-clash precedent.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const rootDir = '/Users/huangxuewei/Projects/wt-home-blank'
const qaDir = path.join(rootDir, 'docs/cuts/home-blank/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-home-blank-qa-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
const apiPort = 9897
const vitePort = 5187
const children = []

const OWNER_USERNAME = 'qa-home-blank-owner'
const OWNER_PASSWORD = 'home-blank-qa-pw-1'
const GROUP_TITLE_2026 = '五幕QA完形2026'
const GROUP_TITLE_2024 = '五幕QA完形2024'

let passed = 0
const pass = (name) => { passed += 1; console.log(`PASS ${name}`) }
const fail = (name, details = '') => { throw new Error(`${name}${details ? `\n${details}` : ''}`) }
const ok = (name, cond, details = '') => (cond ? pass(name) : fail(name, details))

function startProcess(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  child.stdout.on('data', (c) => process.stdout.write(`[${options.name}] ${c}`))
  child.stderr.on('data', (c) => process.stderr.write(`[${options.name}] ${c}`))
  return child
}

function cleanup() {
  for (const child of children.reverse()) {
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  }
  if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(`Timed out waiting for ${url}`)
}

function seedDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
  // Two papers in two years so the browse surface shows real year groups.
  db.exec(`
    INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-hb-2026', 'real_exam', 2026, 'QA', '五幕QA卷2026', '完形填空', 'home-blank qa fixture'),
           ('src-hb-2024', 'real_exam', 2024, 'QA', '五幕QA卷2024', '完形填空', 'home-blank qa fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES ('psg-hb-2026', 'src-hb-2026', '五幕QA篇章2026', 'QA passage with one __41__ marker.', '五幕QA', '人与自我', 'cloze', 'medium'),
           ('psg-hb-2024', 'src-hb-2024', '五幕QA篇章2024', 'QA passage with one __41__ marker.', '五幕QA', '人与自我', 'cloze', 'medium');
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-hb-2026', 'psg-hb-2026', 'cloze', '${GROUP_TITLE_2026}', 'Choose the best answer.', 99, 1, 'medium', 'qa'),
           ('g-hb-2024', 'psg-hb-2024', 'cloze', '${GROUP_TITLE_2024}', 'Choose the best answer.', 100, 1, 'medium', 'qa');
  `)
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, '1', '完形语义', 'QA stem.', 'A', 'qa', 'medium', 1, 1, '')
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const groupId of ['g-hb-2026', 'g-hb-2024']) {
    insertQuestion.run(`q-${groupId}-1`, groupId)
    for (const [i, label] of ['A', 'B', 'C', 'D'].entries()) {
      insertOption.run(`opt-${groupId}-${label}`, `q-${groupId}-1`, label, `Option ${label}`, i + 1)
    }
  }
  db.close()
}

function createOwnerUser() {
  const result = spawnSync(
    'node',
    ['scripts/create-user.mjs', '--username', OWNER_USERNAME, '--password', OWNER_PASSWORD, '--role', 'owner'],
    { cwd: rootDir, env: { ...process.env, USER_DATA_DB: userDataDbPath }, encoding: 'utf8' },
  )
  if (result.status !== 0) fail('create owner user', result.stdout + result.stderr)
}

const surface = (page) => page.locator('.concierge-desk').getAttribute('data-surface')
const stageInner = (page) => page.locator('.concierge-stage-inner')

async function login(page) {
  await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
  await page.locator('#login-username').fill(OWNER_USERNAME)
  await page.locator('#login-password').fill(OWNER_PASSWORD)
  await page.locator('.login-submit').click()
  await page.getByPlaceholder(/找一道|正在连接|比如/).waitFor({ timeout: 15_000 })
  await page.waitForFunction(async () => {
    const data = await fetch('/api/question-groups').then((r) => r.json())
    return data.questionGroups.length >= 2
  }, { timeout: 15_000 })
}

async function main() {
  mkdirSync(qaDir, { recursive: true })
  seedDatabase()
  createOwnerUser()

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir, name: 'api',
    env: { ...process.env, QUESTION_BANK_DB: dbPath, USER_DATA_DB: userDataDbPath, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'), name: 'vite',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)
  pass('api + vite started against worktree')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  try {
    await login(page)

    // ── Act 1: pure-blank resting stage ──
    ok('A1 data-surface=blank on landing', (await surface(page)) === 'blank')
    ok('A1 stage-inner NOT risen', !(await stageInner(page).getAttribute('class')).includes('--risen'))
    ok('A1 centered wordmark present', await page.locator('.concierge-wordmark').isVisible())
    const whisper = await page.locator('.concierge-whisper').textContent()
    ok('A1 whisper shows real counts', /\d+ 套卷 · \d+ 篇章/.test(whisper), whisper)
    ok('A1 no thinking toggle (CR SW-1)', (await page.locator('.concierge-thinking-toggle').count()) === 0)
    ok('A1 no filter toggle', (await page.locator('.concierge-command-filter-toggle').count()) === 0)
    ok('A1 no command count', (await page.locator('.concierge-command-count').count()) === 0)
    ok('A1 no group cards / feed rows', (await page.locator('[data-group-id]').count()) === 0)
    ok('A1 topbar brand hidden on blank home', (await page.locator('.topbar-brand h1').count()) === 0)
    await page.screenshot({ path: path.join(qaDir, 'dp2-01-blank.png') })

    // ── Act 2: typing does not move the stage ──
    const input = page.getByPlaceholder(/找一道|正在连接|比如/)
    await input.fill(GROUP_TITLE_2026)
    await page.waitForTimeout(400)
    ok('A2 typing keeps data-surface=blank', (await surface(page)) === 'blank')
    ok('A2 typing keeps stage un-risen', !(await stageInner(page).getAttribute('class')).includes('--risen'))

    // ── Act 8 (early, cheap): esc clears query, stays blank ──
    await input.press('Escape')
    ok('A8 esc clears the query', (await input.inputValue()) === '')
    ok('A8 esc stays on blank', (await surface(page)) === 'blank')

    // ── Act 3: submit beat — rise + results ──
    await input.fill(GROUP_TITLE_2026)
    await page.getByRole('button', { name: '开始取题' }).click()
    await page.waitForFunction(
      () => document.querySelector('.concierge-desk')?.dataset.surface === 'list',
      { timeout: 15_000 },
    )
    pass('A3 submit flips to list surface')
    await page.locator('[data-group-id="g-hb-2026"]').waitFor({ timeout: 15_000 })
    pass('A3 results appear after submit')
    await page.waitForTimeout(500) // let --motion-entrance finish
    ok('A3 stage risen (class)', (await stageInner(page).getAttribute('class')).includes('--risen'))
    const marginTop = await stageInner(page).evaluate((el) => getComputedStyle(el).marginTop)
    ok('A3 stage margin-top landed at 0px', marginTop === '0px', marginTop)
    ok('A3 thinking toggle back on list surface', await page.locator('.concierge-thinking-toggle').isVisible())
    await page.screenshot({ path: path.join(qaDir, 'dp2-02-risen-results.png') })

    // ── Act 4: honest vacuum state ──
    // Pure latin gibberish — CJK words like 「主题」 can fuzzy-hit fixture
    // theme fields and return real results, which never shows the vacuum copy.
    await input.fill('zzweqxconlyqa')
    await page.getByRole('button', { name: '开始取题' }).click()
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('没找到匹配'),
        { timeout: 15_000 },
      )
    } catch (error) {
      const snapshot = await page.locator('.concierge-desk').innerText().catch(() => '(no desk)')
      await page.screenshot({ path: path.join(qaDir, 'dp2-a4-timeout.png') }).catch(() => {})
      fail('A4 vacuum message never appeared', `desk innerText:\n${snapshot.slice(0, 600)}`)
    }
    pass('A4 vacuum message shown for a no-hit query')
    ok('A4 vacuum shows zero group cards', (await page.locator('[data-group-id]').count()) === 0)

    // ── wordmark click: back to pure blank from a search state ──
    await page.locator('.concierge-wordmark').click()
    await page.waitForTimeout(400)
    ok('A5-pre wordmark click falls back to blank', (await surface(page)) === 'blank')
    ok('A5-pre wordmark click cleared the query', (await input.inputValue()) === '')

    // ── Act 5: whisper → browse surface, feed + chips, Back → blank ──
    await page.locator('.concierge-whisper-browse').click()
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get('view') === 'browse',
      { timeout: 10_000 },
    )
    pass('A5 whisper click pushes ?view=browse')
    ok('A5 browse shows list surface', (await surface(page)) === 'list')
    // Feed rows are PAPER-level rows (.concierge-paper-row) — data-group-id
    // only exists on expanded/search group cards.
    await page.locator('.concierge-paper-row').first().waitFor({ timeout: 10_000 })
    const feedRows = await page.locator('.concierge-paper-row').count()
    ok('A5 browse renders the feed (both fixture papers)', feedRows >= 2, `rows=${feedRows}`)
    ok('A5 filter toggle lives on browse surface', await page.locator('.concierge-command-filter-toggle').isVisible())
    ok('A5 command count lives on browse surface', await page.locator('.concierge-command-count').isVisible())
    const bodyText = await page.locator('.concierge-desk').innerText()
    ok('A5 year group headers present', bodyText.includes('2026') && bodyText.includes('2024'), bodyText.slice(0, 300))
    await page.screenshot({ path: path.join(qaDir, 'dp2-03-browse.png') })

    await page.goBack()
    await page.waitForTimeout(400)
    ok('A5 Back exits browse to blank', (await surface(page)) === 'blank')
    ok('A5 Back cleans the URL', !page.url().includes('view=browse'), page.url())

    // ── Act 6: f.* deep link lands on the list surface with the filter applied ──
    await page.goto(`http://127.0.0.1:${vitePort}/?f.year=2024`, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => document.querySelector('.concierge-desk')?.dataset.surface === 'list',
      { timeout: 15_000 },
    )
    pass('A6 f.year deep link lands on list surface')
    await page.locator('.concierge-paper-row').first().waitFor({ timeout: 10_000 })
    const filteredText = await page.locator('.concierge-desk').innerText()
    ok(
      'A6 filtered feed shows the 2024 paper and not the 2026 one',
      filteredText.includes('五幕QA卷2024') && !filteredText.includes('五幕QA卷2026'),
      filteredText.slice(0, 300),
    )

    // ── Act 7: view=detail deep link untouched ──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=detail&groupId=g-hb-2026`, { waitUntil: 'networkidle' })
    await page.locator('.detail-view').waitFor({ timeout: 15_000 })
    pass('A7 view=detail deep link still lands on the detail view')
    ok('A7 topbar brand visible again on detail', (await page.locator('.topbar-brand h1').count()) === 1)

    // ── Act 9: reduced motion — placeholder does not rotate ──
    const rmContext = await browser.newContext({ viewport: { width: 1440, height: 920 }, reducedMotion: 'reduce' })
    const rmPage = await rmContext.newPage()
    await rmPage.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
    await rmPage.locator('#login-username').fill(OWNER_USERNAME)
    await rmPage.locator('#login-password').fill(OWNER_PASSWORD)
    await rmPage.locator('.login-submit').click()
    const rmInput = rmPage.getByPlaceholder(/找一道|正在连接|比如/)
    await rmInput.waitFor({ timeout: 15_000 })
    // Wait past dataLoading — the 「正在连接…」→「比如：」placeholder swap is
    // the loading transition, not rotation; sample only after data is ready.
    await rmPage.waitForFunction(
      () => document.querySelector('.concierge-intent-bar input')?.placeholder.startsWith('比如'),
      { timeout: 15_000 },
    )
    await rmPage.locator('.concierge-wordmark').click() // park focus off the input
    const before = await rmInput.getAttribute('placeholder')
    await rmPage.waitForTimeout(4_600)
    const after = await rmInput.getAttribute('placeholder')
    ok('A9 reduced-motion stops placeholder rotation', before === after, `${before} -> ${after}`)
    await rmContext.close()

    ok('No page errors across all acts', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\nhome-blank five-acts DP-2 passed: ${passed} checks`)
}

// Explicit exit after cleanup — detached grandchild stdio pipes can keep the
// event loop alive past main() (see smoke-golden-path.mjs:64-70), which under
// a pipeline reader means output never flushes. Do not rely on 'exit' alone.
main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
