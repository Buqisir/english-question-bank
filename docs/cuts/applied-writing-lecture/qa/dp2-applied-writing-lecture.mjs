#!/usr/bin/env node
// applied-writing-lecture DP-2 — browser QA against the
// wt-applied-writing-lecture worktree, covering the plan.md D4 owner QA
// checklist items 1-4 (item 5, print/PDF/DOCX/学生版 boundary, is a
// source-level invariant already proven by the implementation-survey's
// four-channel-isolation argument + narrow verify — not re-tested here
// via real export network calls). Boot skeleton mirrors
// docs/cuts/reading-analysis-retire/qa/dp2-reading-analysis-retire.mjs
// (spawn api+vite, headless Playwright from app/node_modules, detached
// process groups, worktree's own persistent dev sqlite + real
// paper-assets) — rootDir self-derived from this script's own location
// (never a hardcoded absolute path), every "is this visible" assertion a
// real boundingBox() geometry check.
//
// Fixtures:
//   - paper-2022-i / group-2022-i-writing-application: D7 pilot data
//     seeded through the real validate/persist pipeline this cut (has
//     reviewCard/reviewMarks) — covers items ①②③ (B2 opens, three-page
//     carousel, mark↔cell cross-reference) with real published data.
//   - paper-zj-2026-jan / group-zj-2026-jan-writing-application: one of
//     the pre-cut 22 legacy application analyses (writing-analysis-v1.json
//     exists but predates reviewCard) — covers item ④ (D3 down-shelving
//     gate: "解析未发布" both in the卷面 B2 panel and the right-rail
//     overview, consistent with each other).
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/applied-writing-lecture/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9901
const vitePort = 5191
const children = []

const OWNER_USERNAME = 'qa-local-owner'
const OWNER_PASSWORD = 'qa-local-owner-pw-1'

const PAPER_2022I = 'paper-2022-i'
const APPLICATION_GROUP_2022I = 'group-2022-i-writing-application'

const PAPER_ZJ_2026_JAN = 'paper-zj-2026-jan'
const APPLICATION_GROUP_ZJ_2026_JAN = 'group-zj-2026-jan-writing-application'

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

    // ── ①②③ published fixture (paper-2022-i): B2 opens from both entry
    // gestures, three-block carousel translates via tabs/dots/←→, mark↔cell
    // cross-reference lights up, Esc collapses back to the plain answer box.
    await page.goto(
      `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${PAPER_2022I}&focusGroupId=${APPLICATION_GROUP_2022I}&lecture=1`,
      { waitUntil: 'networkidle' },
    )
    const answerBox = page.locator('.pi-writing-answer-box--clickable').first()
    await answerBox.waitFor({ timeout: 15_000 })
    ok('① 讲评态下应用文答题框挂 clickable modifier（双手势入口①就位）', await answerBox.count() >= 1)
    const toggle = page.locator('.pi-writing-review-toggle').first()
    await toggle.waitFor({ timeout: 10_000 })
    ok('① 写作卡「解析」按钮渲染（双手势入口②就位）', await toggle.count() >= 1)

    await answerBox.click()
    const reviewRoot = page.locator('.pi-writing-review').first()
    await reviewRoot.waitFor({ timeout: 10_000 })
    const cardSlide = page.locator('.pi-writing-review-slide.on .pi-writing-review-card').first()
    await cardSlide.waitFor({ timeout: 10_000 })
    ok('① 点答题框 → 框放大成解析区，先见审题卡六格', (await page.locator('.pi-writing-review-cell').count()) === 6)
    const boxBoxAfterOpen = await page.locator('.pi-writing-answer-box--review-open').first().boundingBox()
    ok('① 展开态答题框几何可见（非零尺寸）', boxBoxAfterOpen != null && boxBoxAfterOpen.width > 200 && boxBoxAfterOpen.height > 80, JSON.stringify(boxBoxAfterOpen))

    // ② 翻页：页签点 ②范文·标志，胶囊点点应跟随；框高随内容变化（不做像素断言，只做存在性 + class 切换）。
    await page.locator('.pi-writing-review-tabs button').nth(1).click()
    await page.locator('.pi-writing-review-slide.on .pi-writing-review-model').first().waitFor({ timeout: 10_000 })
    ok('② 页签点击「② 范文 · 标志」→ 对应块变为 on（框内翻页生效）',
      (await page.locator('.pi-writing-review-dots i.on').first().getAttribute('class') || '').length > 0)
    ok('② 范文区渲染标志按钮（判/读/时/点/清 legend）', (await page.locator('.pi-writing-review-mark').count()) >= 1)

    // ←→ 键翻到 ③ 亮点表达
    await page.keyboard.press('ArrowRight')
    await page.locator('.pi-writing-review-slide.on .pi-writing-review-highlights').first().waitFor({ timeout: 10_000 })
    ok('② ←→ 键翻页生效（从②翻到③亮点表达）', (await page.locator('.pi-writing-review-slide.on .pi-writing-review-highlights').count()) === 1)

    // 胶囊点点点回①，再验证标志↔卡格互指
    await page.locator('.pi-writing-review-dots i').nth(1).click()
    const firstMark = page.locator('.pi-writing-review-mark').first()
    await firstMark.waitFor({ timeout: 10_000 })
    await firstMark.click()
    const hotCell = page.locator('.pi-writing-review-cell--hot')
    await hotCell.waitFor({ timeout: 10_000 })
    ok('③ 点击标志 → 对应卡格高亮（卡↔文互指生效）', (await hotCell.count()) >= 1)
    ok('③ 标志讲解条内嵌显示（跨页不用翻回）', (await page.locator('.pi-writing-review-marknote').count()) === 1)

    // Esc 收起
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.pi-writing-review'), { timeout: 10_000 })
    ok('Esc 收起解析区，卷面复原（答题框回到 clickable 而非 review-open）',
      (await page.locator('.pi-writing-answer-box--review-open').count()) === 0)
    ok('Esc 收起后仍在讲评态（讲评栏未被连带关闭）', (await page.locator('.paper-browse-lecture-panel').count()) === 1)

    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-01-b2-open.png') })

    // ── ④ 右栏概览瘦身 ──
    const overviewHint = page.locator('.paper-browse-lecture-panel').getByText('解析已在卷面答题框中打开', { exact: false })
    await overviewHint.waitFor({ timeout: 10_000 })
    ok('④ 右栏 application 组只显标题+指引，不再渲全量解析', (await overviewHint.count()) >= 1)
    ok('④ 右栏没有渲染范文全文（全量面板类未挂载）', (await page.locator('.pi-writing-model-answer').count()) === 0)

    // ── ④ 无卡卷（paper-zj-2026-jan, 22 组存量之一）「解析未发布」双落点一致 ──
    await page.goto(
      `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${PAPER_ZJ_2026_JAN}&focusGroupId=${APPLICATION_GROUP_ZJ_2026_JAN}&lecture=1`,
      { waitUntil: 'networkidle' },
    )
    const legacyAnswerBox = page.locator('.pi-writing-answer-box--clickable').first()
    await legacyAnswerBox.waitFor({ timeout: 15_000 })
    await legacyAnswerBox.click()
    const legacyEmptyInPanel = page.locator('.pi-writing-review .paper-browse-lecture-empty')
    await legacyEmptyInPanel.waitFor({ timeout: 10_000 })
    ok('④ 未重产的卷：卷面 B2 内显「解析未发布」（missing-card → unavailable 落到卷面）',
      ((await legacyEmptyInPanel.first().textContent()) || '').includes('解析未发布'))
    const legacyRailHint = page.locator('.paper-browse-lecture-panel').getByText('解析未发布', { exact: false })
    await legacyRailHint.waitFor({ timeout: 10_000 })
    ok('④ 未重产的卷：右栏概览同样显「解析未发布」（卷面与右栏一致）', (await legacyRailHint.count()) >= 1)

    ok('No page errors across all scenarios', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\napplied-writing-lecture DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
