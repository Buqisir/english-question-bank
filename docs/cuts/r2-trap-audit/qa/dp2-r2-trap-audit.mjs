#!/usr/bin/env node
// r2-trap-audit DP-2 — browser QA against the wt-r2-trap-audit worktree,
// plan.md Scope 步骤 5's three scenarios, on REAL already-published data
// (paper-2023-i — this cut's own scan found its q-2023-i-025/B is the one
// confirmed rogueType/badge record, `primaryType: 'timeOrderReversal'`):
//
//   ① 摘牌 badge 题实点讲评面板 —— 类型徽章不显、解释仍在
//      (group-2023-i-reading-b / q-2023-i-025 / option B)
//   ② 正常题（未摘牌）—— 类型徽章照显 (regression control)
//      (group-2023-i-reading-a / q-2023-i-021 / option C)
//   ③ 教师版讲评输出含正常题的干扰项行（真实 API 调用，非合成）——
//      reuses the same authenticated Playwright context (page.request
//      shares its cookie jar) to add group-2023-i-reading-a to the current
//      draft paper and read its teacher-version printHtml, checking for the
//      "干扰项：" line's actual explanation text. This is analysisText.mjs's
//      ACTUAL wired consumer (GET /api/draft-papers/:id?versionType=teacher
//      → draftPaperStore.buildDraftPrintHtml → loadGroupAnalysisTexts) —
//      the raw POST .../docx binary endpoint (exportImplementation.exportDocx
//      → resolveExportItems → plain getQuestionGroupDetail) does NOT call
//      loadGroupAnalysisTexts at all; that gap predates this cut and fixing
//      it is out of Forbidden scope (server/draft-paper/analysisText.mjs's
//      only assigned edit is the row-suspension skip, not new wiring).
//
// Boot skeleton mirrors docs/cuts/reading-analysis-retire/qa/
// dp2-reading-analysis-retire.mjs: rootDir self-derived from this script's
// own location (never a hardcoded absolute path), every "is this visible"
// assertion is a real boundingBox() geometry check, screenshots gated on
// DP2_SCREENSHOTS=1.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// 仓根从脚本自身位置推导（docs/cuts/<CUT>/qa → 上四级）——可在主树或任意
// worktree 重跑，不锚死某次会话的绝对路径。
const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/r2-trap-audit/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9901
const vitePort = 5191
const children = []

const OWNER_USERNAME = 'qa-r2-trap-audit-owner'
const OWNER_PASSWORD = 'qa-r2-trap-audit-owner-pw-1'

const PAPER_ID = 'paper-2023-i'
const BADGE_GROUP = 'group-2023-i-reading-b'
const BADGE_QID = 'q-2023-i-025'
const BADGE_OPTION = 'B'
const NORMAL_GROUP = 'group-2023-i-reading-a'
const NORMAL_QID = 'q-2023-i-021'
const NORMAL_OPTION = 'C'
const NORMAL_EXPLANATION_SNIPPET = '导览游需要购票'

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

async function openOptionDetail(page, { groupId, questionId, optionLabel }) {
  await page.goto(
    `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${PAPER_ID}&focusGroupId=${groupId}&questionId=${questionId}&lecture=1`,
    { waitUntil: 'networkidle' },
  )
  await page.locator('.pi-ps-analysis').waitFor({ timeout: 15_000 })
  const optionRow = page.locator(`.pi-ps-analysis-option-section[data-pi-option-label="${optionLabel}"]`)
  await optionRow.waitFor({ timeout: 15_000 })
  await optionRow.locator('.pi-ps-analysis-option-row').click()
  await optionRow.locator('.pi-ps-analysis-option-detail').waitFor({ timeout: 15_000 })
  return optionRow
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

    // ── ① 摘牌 badge 题 —— 类型徽章不显、解释仍在 ──
    {
      const optionRow = await openOptionDetail(page, { groupId: BADGE_GROUP, questionId: BADGE_QID, optionLabel: BADGE_OPTION })
      const badgeCount = await optionRow.locator('.pi-ps-analysis-option-badge--trap').count()
      ok('① badge 摘牌题：类型徽章不显示', badgeCount === 0, `badge elements found: ${badgeCount}`)
      const explanationLocator = optionRow.locator('.pi-ps-analysis-explanation')
      await explanationLocator.waitFor({ timeout: 15_000 })
      const explanationText = (await explanationLocator.innerText()).trim()
      ok('① badge 摘牌题：解释文案仍在且非空', explanationText.length > 0, explanationText)
      const explanationBox = await explanationLocator.boundingBox()
      ok('① 解释元素几何可见（非零尺寸）', explanationBox != null && explanationBox.width > 10 && explanationBox.height > 5, JSON.stringify(explanationBox))
      if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-01-badge-suspended.png') })
    }

    // ── ② 正常题（未摘牌）—— 类型徽章照显 (regression control) ──
    {
      const optionRow = await openOptionDetail(page, { groupId: NORMAL_GROUP, questionId: NORMAL_QID, optionLabel: NORMAL_OPTION })
      const badge = optionRow.locator('.pi-ps-analysis-option-badge--trap')
      await badge.waitFor({ timeout: 15_000 })
      const badgeBox = await badge.boundingBox()
      ok('② 正常题：类型徽章可见且非零尺寸（几何断言）', badgeBox != null && badgeBox.width > 5 && badgeBox.height > 5, JSON.stringify(badgeBox))
      const explanationText = (await optionRow.locator('.pi-ps-analysis-explanation').innerText()).trim()
      ok('② 正常题：解释文案存在', explanationText.length > 0, explanationText)
      if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-02-normal-badge.png') })
    }

    ok('No page errors across both panel scenarios', pageErrors.length === 0, pageErrors.join('\n'))

    // ── ③ 教师版讲评输出含正常题的干扰项行 —— 真实 API 调用 ──
    {
      const itemsResponse = await page.request.post(`http://127.0.0.1:${apiPort}/api/draft-papers/current/items`, {
        data: { groupId: NORMAL_GROUP },
      })
      ok('③ 加组进当前草稿卷 API 成功（2xx 或已存在的 409 均可接受）', itemsResponse.ok() || itemsResponse.status() === 409, `status=${itemsResponse.status()}`)

      const currentResponse = await page.request.get(`http://127.0.0.1:${apiPort}/api/draft-papers/current`)
      ok('③ 读取当前草稿卷成功', currentResponse.ok(), `status=${currentResponse.status()}`)
      const { draftPaper: currentDraftPaper } = await currentResponse.json()
      ok('③ 当前草稿卷含 id', typeof currentDraftPaper?.id === 'string' && currentDraftPaper.id.length > 0, JSON.stringify(currentDraftPaper))

      const teacherResponse = await page.request.get(
        `http://127.0.0.1:${apiPort}/api/draft-papers/${currentDraftPaper.id}?versionType=teacher`,
      )
      ok('③ 教师版讲评读取 API 成功', teacherResponse.ok(), `status=${teacherResponse.status()}`)
      const { draftPaper } = await teacherResponse.json()
      const printHtml = String(draftPaper?.printHtml || '')
      ok('③ printHtml 非空', printHtml.length > 0)
      ok('③ printHtml 含「干扰项：」标记', printHtml.includes('干扰项'), 'no 干扰项 marker found')
      ok(
        `③ printHtml 含正常题（${NORMAL_QID}）的真实解释文本片段`,
        printHtml.includes(NORMAL_EXPLANATION_SNIPPET),
        `snippet "${NORMAL_EXPLANATION_SNIPPET}" not found`,
      )
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\nr2-trap-audit DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
