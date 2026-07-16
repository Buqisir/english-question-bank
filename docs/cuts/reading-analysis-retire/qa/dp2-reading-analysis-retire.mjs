#!/usr/bin/env node
// reading-analysis-retire DP-2 — browser QA against the
// wt-reading-analysis-retire worktree, covering plan.md Scope 步 8's four
// behavior scenarios. Boot skeleton mirrors docs/cuts/detail-page-redesign/
// qa/dp2-detail-redesign.mjs (spawn api+vite, headless Playwright from
// app/node_modules, detached process groups, worktree's own persistent dev
// sqlite + real paper-assets) — same two disciplines this repo's DP-2
// judgments require: rootDir self-derived from this script's own location
// (never a hardcoded absolute path), and every "is this visible" assertion
// is a real boundingBox() geometry check, not just DOM presence.
//
// Fixtures (real, already-published data):
//   - paper-960d0f8d (2026 巴蜀中学 月考七): has all four analyzed question
//     types in ONE paper (reading/cloze/seven_choices/grammar_cloze), all
//     four analyses published — covers the "整卷页讲评态四题型解析面板可
//     开" regression anchor with real data, not synthetic fixtures.
//   - group-960d0f8d-reading-a is also this script's detail-page peek
//     fixture (一张纸露一角 regression anchor).
//
// Six checks, plan.md Scope 步 8 order:
//   ① 旧 PI URL（`?view=paper-intelligence&paperId=<id>`，无 surface）→
//      落整卷页讲评态且锚定该 paperId
//   ② 旧 PI URL（同上 + `&surface=paper`）→ 同一落点（surface 值不改变
//      自愈目标）
//   ③ 旧 reading-analysis 三形 URL（`?view=reading-analysis`／
//      `?demo=reading-analysis`／`#reading-analysis`）→ 落主页
//   ④ 回归锚：整卷页讲评态四题型（reading/cloze/seven_choices/
//      grammar_cloze）解析面板可开（真实已发布数据，非合成）
//   ⑤ 回归锚：详情页一张纸露一角正常（活面字节级不伤的行为证）
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// 仓根从脚本自身位置推导（docs/cuts/<CUT>/qa → 上四级）——可在主树或任意
// worktree 重跑，不锚死某次会话的绝对路径。
const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/reading-analysis-retire/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9900
const vitePort = 5190
const children = []

const OWNER_USERNAME = 'qa-reading-analysis-retire-owner'
const OWNER_PASSWORD = 'qa-reading-analysis-retire-owner-pw-1'

const PAPER_960D0F8D = 'paper-960d0f8d'
const READING_GROUP = 'group-960d0f8d-reading-a'
const CLOZE_GROUP = 'group-960d0f8d-cloze'
const SEVEN_GROUP = 'group-960d0f8d-seven-choices'
const GRAMMAR_GROUP = 'group-960d0f8d-grammar-fill'
const READING_QID = 'q-960d0f8d-021'
const CLOZE_QID = 'q-960d0f8d-041'
const SEVEN_QID = 'q-960d0f8d-036'
const GRAMMAR_QID = 'q-960d0f8d-056'

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
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(`Timed out waiting for ${url}`)
}

function resetPassword(username, password) {
  const result = spawnSync(
    'node',
    ['scripts/create-user.mjs', '--reset-password', '--username', username, '--password', password],
    { cwd: rootDir, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    const create = spawnSync(
      'node',
      ['scripts/create-user.mjs', '--username', username, '--role', 'owner', '--password', password],
      { cwd: rootDir, encoding: 'utf8' },
    )
    if (create.status !== 0) fail(`create/reset ${username}`, create.stdout + create.stderr)
  }
}

async function login(page) {
  await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
  await page.locator('#login-username').fill(OWNER_USERNAME)
  await page.locator('#login-password').fill(OWNER_PASSWORD)
  await page.locator('.login-submit').click()
  await page.waitForFunction(() => !document.querySelector('#login-username'), { timeout: 15_000 })
}

async function main() {
  mkdirSync(qaDir, { recursive: true })
  resetPassword(OWNER_USERNAME, OWNER_PASSWORD)

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir, name: 'api',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'), name: 'vite',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)
  pass("api + vite started against worktree's own persistent dev DB")

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  try {
    await login(page)

    // ── ① 旧 PI URL（无 surface）→ 落整卷页讲评态且锚定 paperId ──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=paper-intelligence&paperId=${PAPER_960D0F8D}`, {
      waitUntil: 'networkidle',
    })
    await page.locator('.paper-browse-shell').waitFor({ timeout: 15_000 })
    {
      const url = new URL(page.url())
      ok('① 旧 PI URL（无 surface）自愈落 view=paper-browse', url.searchParams.get('view') === 'paper-browse', url.search)
      ok('① 自愈 URL 锚定同一 paperId', url.searchParams.get('paperId') === PAPER_960D0F8D, url.search)
      ok('① 自愈 URL 落讲评态（lecture=1）', url.searchParams.get('lecture') === '1', url.search)
      ok('① 讲评态 shell 类挂上（几何前置：确有渲染，非空壳）',
        (await page.locator('.paper-browse-shell--lecture-open').count()) === 1)
      const shellBox = await page.locator('.paper-browse-shell').boundingBox()
      ok('① 整卷页 shell 可见且非零尺寸（几何断言）', shellBox != null && shellBox.width > 200 && shellBox.height > 200, JSON.stringify(shellBox))
    }
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-01-pi-heal-default.png') })

    // ── ② 旧 PI URL（+ surface=paper）→ 同一落点 ──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=paper-intelligence&paperId=${PAPER_960D0F8D}&surface=paper`, {
      waitUntil: 'networkidle',
    })
    await page.locator('.paper-browse-shell').waitFor({ timeout: 15_000 })
    {
      const url = new URL(page.url())
      ok('② 旧 PI URL（surface=paper 形）同样自愈落 view=paper-browse', url.searchParams.get('view') === 'paper-browse', url.search)
      ok('② 自愈 URL 锚定同一 paperId（surface 值不改变自愈目标）', url.searchParams.get('paperId') === PAPER_960D0F8D, url.search)
      ok('② 自愈 URL 不残留 surface 参数', url.searchParams.get('surface') === null, url.search)
    }

    // ── ③ 旧 reading-analysis 三形 URL → 落主页 ──
    // 每形用一个全新 page（真实「直接打开这个 URL」的语境，例如收藏夹/
    // 分享链接落地）——尤其 `#reading-analysis` 形：若复用同一 page 从上
    // 一形（已自愈到裸 `/`）goto 到仅 hash 不同的 URL，浏览器把它当同文档
    // fragment 导航处理（不重新加载、main.tsx 不重跑），这不是自愈契约的
    // bug，只是这条判例需要一次真实整页加载才能验到。
    for (const [label, qs] of [
      ['?view=reading-analysis', '?view=reading-analysis&groupId=group-960d0f8d-reading-a'],
      ['?demo=reading-analysis', '?demo=reading-analysis'],
      ['#reading-analysis', '#reading-analysis'],
    ]) {
      const scenarioPage = await context.newPage()
      scenarioPage.on('pageerror', (e) => pageErrors.push(e.message))
      await scenarioPage.goto(`http://127.0.0.1:${vitePort}/${qs}`, { waitUntil: 'networkidle' })
      await scenarioPage.locator('.app-shell').waitFor({ timeout: 15_000 })
      const url = new URL(scenarioPage.url())
      ok(`③ 旧 reading-analysis URL（${label}）自愈落主页（无 view 参数）`, url.search === '' && url.hash === '', `${url.search}${url.hash}`)
      ok(`③ 旧 reading-analysis URL（${label}）落地页是首页工作台（非空白页）`, (await scenarioPage.locator('.app-shell').count()) === 1)
      await scenarioPage.close()
    }
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-02-ra-heal-home.png') })

    // ── ④ 回归锚：整卷页讲评态四题型解析面板可开（真实已发布数据） ──
    const panelScenarios = [
      { groupId: READING_GROUP, questionId: READING_QID, panelSelector: '.pi-ps-analysis', label: 'reading' },
      { groupId: CLOZE_GROUP, questionId: CLOZE_QID, panelSelector: '.pi-cloze-panel', label: 'cloze' },
      { groupId: SEVEN_GROUP, questionId: SEVEN_QID, panelSelector: '.pi-seven-panel', label: 'seven_choices' },
      { groupId: GRAMMAR_GROUP, questionId: GRAMMAR_QID, panelSelector: '.pi-gf-panel', label: 'grammar_cloze' },
    ]
    for (const { groupId, questionId, panelSelector, label } of panelScenarios) {
      await page.goto(
        `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${PAPER_960D0F8D}&focusGroupId=${groupId}&questionId=${questionId}&lecture=1`,
        { waitUntil: 'networkidle' },
      )
      await page.locator('.paper-browse-lecture-panel').waitFor({ timeout: 15_000 })
      await page.locator(panelSelector).first().waitFor({ timeout: 15_000 })
      const panelBox = await page.locator(panelSelector).first().boundingBox()
      ok(`④-${label} 解析面板可开且几何可见`, panelBox != null && panelBox.width > 50 && panelBox.height > 20, JSON.stringify(panelBox))
    }

    // ── ⑤ 回归锚：详情页一张纸露一角正常 ──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=detail&groupId=${READING_GROUP}`, { waitUntil: 'networkidle' })
    await page.locator('.peek-root').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => {
      const el = document.querySelector('.peek-paper-clip')
      return el && el.children.length > 0
    }, { timeout: 15_000 })
    const peekBox = await page.locator('.peek-paper').boundingBox()
    ok('⑤ 详情页一张纸露一角可见且非零尺寸（几何断言，活面字节级不伤的行为证）',
      peekBox != null && peekBox.width > 200 && peekBox.height > 40, JSON.stringify(peekBox))
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-03-detail-peek.png') })

    ok('No page errors across all scenarios', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\nreading-analysis-retire DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
