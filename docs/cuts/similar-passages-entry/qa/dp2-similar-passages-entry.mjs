#!/usr/bin/env node
// similar-passages-entry (E6) DP-2 — browser QA against the
// wt-similar-passages-entry worktree, covering plan.md §verify's six
// behavior points. Boot skeleton mirrors
// docs/cuts/home-blank/qa/dp2-five-acts.mjs (spawn api+vite, headless
// Playwright from app/node_modules, detached process groups) — but this
// script points the server at the WORKTREE'S OWN PERSISTENT dev sqlite
// copies (data/question-bank.sqlite, data/user-data.sqlite) and real
// paper-assets (app/public/paper-assets), per this cut's explicit brief
// ("本地 QA 账号用 node scripts/create-user.mjs --reset-password 对
// worktree 自己的 sqlite 重置 qa-local-owner"), instead of a synthetic temp
// DB — the fixture groupIds below are real, already-analyzed data
// (paper-960d0f8d, a 2026 巴蜀中学 monthly-exam paper) verified by hand
// (curl against a scratch server boot) to have real overlapping topic
// labels before this script was written, so the passages pool is
// guaranteed non-empty and deterministic run-to-run (the underlying dev
// data doesn't change between runs). The one side effect across repeated
// runs is that scenario ④ appends one more group to qa-local-owner's
// current draft paper each time — a known, accepted cost of testing against
// live dev data (the assertion is a +1 DELTA, not an absolute count, so
// re-running stays green regardless of how large that draft paper has
// grown).
//
// Six checks, plan.md §verify order:
//   ① detail page (reading group) 点「相似篇章」→ panel expands, candidate
//      cards carry chips, pool-honesty note renders.
//   ② 讲评态 cloze 题点「相似篇章」→ rail renders passages results (ready,
//      not error).
//   ③ search card (browse feed) expands one card's candidates; switching to
//      a second card auto-collapses the first (只展开一张).
//   ④ panel「＋加入草稿卷」→ basket-chip count +1 + toast.
//   ⑤ cloze legacy `similar=1` deep link → auto-enters passages results
//      (legacy self-heal, not a 400).
//   ⑥ static assertion: app/src has zero v1 reason-kind residue
//      (facet-density|pos-density|topic-diff|secondary).
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { requireLocalQaPassword, LOCAL_QA_OWNER_PASSWORD_ENV } from '../../_shared/local-qa-credentials.mjs'

// 仓根从脚本自身位置推导（docs/cuts/<CUT>/qa → 上四级）——可在主树或任意
// worktree 重跑，不锚死某次会话的绝对路径（DP-3 收账修正：DEV 原稿硬编码
// 了已删除的 worktree 路径）。
const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/similar-passages-entry/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9898
const vitePort = 5188
const children = []

const OWNER_USERNAME = 'qa-local-owner'
const OWNER_PASSWORD = requireLocalQaPassword(LOCAL_QA_OWNER_PASSWORD_ENV)

// Real, already-analyzed fixture data (paper-960d0f8d — 2026 巴蜀中学 月考七).
const READING_PAPER_ID = 'paper-960d0f8d'
const READING_GROUP_A = 'group-960d0f8d-reading-a' // topic-overlaps group-2025-i-reading-a etc.
const READING_GROUP_B = 'group-960d0f8d-reading-b'
const CLOZE_GROUP = 'group-960d0f8d-cloze' // topic-overlaps group-2023-i-cloze etc.
const CLOZE_FIRST_QUESTION_ID = 'q-960d0f8d-041'

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

function resetOwnerPassword() {
  const result = spawnSync(
    'node',
    ['scripts/create-user.mjs', '--reset-password', '--username', OWNER_USERNAME, '--password', OWNER_PASSWORD],
    { cwd: rootDir, encoding: 'utf8' },
  )
  if (result.status !== 0) fail('reset qa-local-owner password', result.stdout + result.stderr)
}

// ── ⑥ static assertion — zero v1 reason-kind residue in app/src ──
// Plain recursive walk (no extra deps) over app/src (excluding node_modules,
// which does not live under app/src anyway) checking every .ts/.tsx file for
// the four retired v1 kind literals used as a reason.kind value.
function walkFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
}

function staticCheckNoV1ReasonKinds() {
  const files = []
  walkFiles(path.join(rootDir, 'app/src'), files)
  const offenders = []
  const pattern = /facet-density|pos-density|topic-diff|['"]secondary['"]/
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (pattern.test(text)) offenders.push(file)
  }
  ok(
    '⑥ app/src has zero v1 reason-kind residue (facet-density|pos-density|topic-diff|secondary)',
    offenders.length === 0,
    offenders.join('\n'),
  )
}

async function login(page) {
  await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
  await page.locator('#login-username').fill(OWNER_USERNAME)
  await page.locator('#login-password').fill(OWNER_PASSWORD)
  await page.locator('.login-submit').click()
  await page.waitForFunction(() => !document.querySelector('#login-username'), { timeout: 15_000 })
}

async function basketCount(page) {
  const label = await page.locator('.basket-chip').getAttribute('aria-label')
  const match = /已选\s*(\d+)\s*个题组/.exec(label || '')
  return match ? Number(match[1]) : null
}

async function main() {
  mkdirSync(qaDir, { recursive: true })
  staticCheckNoV1ReasonKinds()

  resetOwnerPassword()

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
  pass('api + vite started against worktree\'s own persistent dev DB')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  try {
    await login(page)

    // ── ① detail page (reading group) 点「相似篇章」──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=detail&groupId=${READING_GROUP_A}`, { waitUntil: 'networkidle' })
    await page.locator('.detail-view').waitFor({ timeout: 15_000 })
    const detailSimilarButton = page.locator('[data-ra-entry="detail-view-similar"]')
    ok('① 详情页渲染「相似篇章」按钮', await detailSimilarButton.isVisible())
    ok('① 按钮文案是「相似篇章」（非旧「配相似」）', (await detailSimilarButton.textContent()).includes('相似篇章'))
    await detailSimilarButton.click()
    await page.locator('.similar-passages-panel').waitFor({ timeout: 15_000 })
    await page.locator('.similar-passages-panel .similar-rcard').first().waitFor({ timeout: 15_000 })
    pass('① 面板展开，候选卡渲染')
    const firstCardChips = await page.locator('.similar-passages-panel .similar-rcard').first().locator('.similar-chip').count()
    ok('① 候选卡带 reason chips', firstCardChips > 0, `chips=${firstCardChips}`)
    const poolNoteText = await page.locator('.similar-passages-panel .similar-pool-note').textContent()
    ok('① 池子诚实条渲染（"还剩 N 组"）', /还剩\s*\d+\s*组/.test(poolNoteText || ''), poolNoteText)
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-01-detail-panel.png') })

    // ── ④ 面板「＋加入草稿卷」→ basket 计数 +1 + toast ──
    const beforeCount = await basketCount(page)
    const addButtons = page.locator('.similar-passages-panel .similar-rcard-actions button:not([disabled])')
    const addableCount = await addButtons.count()
    ok('④ 至少一张候选卡可加入（未禁用）', addableCount > 0, `addable=${addableCount}`)
    const addedCard = page.locator('.similar-passages-panel .similar-rcard', { has: page.locator('button:not([disabled])') }).first()
    const addedGroupId = await addedCard.getAttribute('data-group-id')
    await addedCard.locator('button').click()
    await page.waitForFunction(
      (before) => {
        const label = document.querySelector('.basket-chip')?.getAttribute('aria-label') || ''
        const match = /已选\s*(\d+)\s*个题组/.exec(label)
        return match && Number(match[1]) === before + 1
      },
      beforeCount,
      { timeout: 15_000 },
    )
    pass('④ basket-chip 计数 +1')
    const toastText = await page.locator('.similar-passages-panel .similar-toast--on').textContent()
    ok('④ toast 显示「已加入草稿卷」', (toastText || '').includes('已加入草稿卷'), toastText)

    // Re-runnability: undo the add via the API directly (DELETE draft-paper
    // item) so a repeat run doesn't hit this same candidate already in
    // 'in_current_draft' state (which would flip the button's click target
    // to "open workbench" instead of "add", per addGroupsToBasket's existing
    // app-wide behavior — unrelated to this cut, just a pre-existing rule
    // this script must route around to stay idempotent).
    const cookies = await context.cookies()
    const sessionCookie = cookies.find((c) => c.name === 'eqb_session')
    const cookieHeader = sessionCookie ? `${sessionCookie.name}=${sessionCookie.value}` : ''
    const currentDraft = await fetch(`http://127.0.0.1:${apiPort}/api/draft-papers/current`, {
      headers: { cookie: cookieHeader },
    }).then((r) => r.json())
    const addedItem = currentDraft.draftPaper?.items?.find((item) => item.groupId === addedGroupId)
    if (addedItem) {
      await fetch(`http://127.0.0.1:${apiPort}/api/draft-papers/${currentDraft.draftPaper.id}/items/${addedItem.id}`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader },
      })
      pass('④ cleanup: removed the just-added candidate from the draft paper (keeps this script re-runnable)')
    }

    // ── ② 讲评态 cloze 题点「相似篇章」──
    await page.goto(
      `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${READING_PAPER_ID}&focusGroupId=${CLOZE_GROUP}&questionId=${CLOZE_FIRST_QUESTION_ID}&lecture=1`,
      { waitUntil: 'networkidle' },
    )
    const clozeCta = page.locator('.similar-cta .similar-btn--primary')
    await clozeCta.waitFor({ timeout: 15_000 })
    ok('② 完形讲评态 CTA 文案是「相似篇章」', (await clozeCta.textContent()).includes('相似篇章'))
    await clozeCta.click()
    await page.locator('.similar-rail').waitFor({ timeout: 15_000 })
    await page.waitForFunction(
      () => !document.querySelector('.similar-rail-error') && !document.querySelector('.paper-browse-lecture-empty')?.textContent?.includes('加载中'),
      { timeout: 15_000 },
    )
    ok('② rail 渲染非-error 态', (await page.locator('.similar-rail-error').count()) === 0)
    const railHead = await page.locator('.similar-rail-head').textContent()
    ok('② rail 头行文案「相似篇章 · 完形填空」', (railHead || '').includes('相似篇章') && (railHead || '').includes('完形填空'), railHead)
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-02-cloze-rail.png') })

    // ── ⑤ cloze 旧 similar=1 深链 → 自动进篇章结果 ──
    await page.goto(
      `http://127.0.0.1:${vitePort}/?view=paper-browse&paperId=${READING_PAPER_ID}&focusGroupId=${CLOZE_GROUP}&questionId=${CLOZE_FIRST_QUESTION_ID}&lecture=1&similar=1`,
      { waitUntil: 'networkidle' },
    )
    await page.locator('.similar-rail').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => !document.querySelector('.similar-rail-error'), { timeout: 15_000 })
    const legacyRailHead = await page.locator('.similar-rail-head').textContent()
    ok(
      '⑤ legacy similar=1 深链自动进入「相似篇章」结果态（非 400）',
      (legacyRailHead || '').includes('相似篇章'),
      legacyRailHead,
    )

    // ── ③ 搜索卡（browse feed）展开候选 + 切卡收起 ──
    await page.goto(`http://127.0.0.1:${vitePort}/?view=browse`, { waitUntil: 'networkidle' })
    const paperRow = page.locator('.concierge-paper-row[data-variant="feed"]', { hasText: '巴蜀' }).first()
    await paperRow.waitFor({ timeout: 15_000 })
    await paperRow.click()
    const rowA = page.locator(`[data-group-id="${READING_GROUP_A}"]`)
    const rowB = page.locator(`[data-group-id="${READING_GROUP_B}"]`)
    await rowA.waitFor({ timeout: 15_000 })
    await rowB.waitFor({ timeout: 15_000 })
    await rowA.locator('[data-ra-entry="group-card-similar"]').click()
    await rowA.locator('.similar-passages-panel').waitFor({ timeout: 15_000 })
    pass('③ 卡 A 候选面板展开')
    // DP-3 打回回归锚（2026-07-15）：面板曾以 row 的第三个 flex 子项挤进右列、
    // 被 absolute hover 动作条盖住——DOM 存在但人眼不可见。断言几何：面板
    // 必须占卡宽的大半（不是右侧窄列）且整体位于 hover 动作条行的下方。
    {
      const panelBox = await rowA.locator('.similar-passages-panel').boundingBox()
      const lineBox = await rowA.locator('.concierge-group-row-line').boundingBox()
      const rowBox = await rowA.boundingBox()
      ok('③ 面板可见且近整卡宽（几何回归锚）',
        panelBox != null && rowBox != null && panelBox.width > rowBox.width * 0.8,
        `panel=${JSON.stringify(panelBox)} row=${JSON.stringify(rowBox)}`)
      ok('③ 面板整体位于动作条行下方（不被 hover 浮层遮盖）',
        panelBox != null && lineBox != null && panelBox.y >= lineBox.y + lineBox.height - 1,
        `panel.y=${panelBox?.y} lineBottom=${lineBox ? lineBox.y + lineBox.height : null}`)
    }
    ok('③ 展开时卡 B 无候选面板', (await rowB.locator('.similar-passages-panel').count()) === 0)
    await rowB.locator('[data-ra-entry="group-card-similar"]').click()
    await rowB.locator('.similar-passages-panel').waitFor({ timeout: 15_000 })
    ok('③ 切到卡 B 后卡 A 自动收起', (await rowA.locator('.similar-passages-panel').count()) === 0)
    pass('③ 卡 B 候选面板展开，只有一张卡展开（切卡自动收起）')
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-03-search-card.png') })

    ok('No page errors across all scenarios', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\nsimilar-passages-entry DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
