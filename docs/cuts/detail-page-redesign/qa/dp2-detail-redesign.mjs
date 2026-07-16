#!/usr/bin/env node
// detail-page-redesign (2026-07-15) DP-2 — browser QA against the
// wt-detail-page-redesign worktree, covering plan.md §8's behavior list.
// Boot skeleton mirrors docs/cuts/similar-passages-entry/qa/dp2-similar-
// passages-entry.mjs (spawn api+vite, headless Playwright from
// app/node_modules, detached process groups, worktree's own persistent dev
// sqlite + real paper-assets) — same two disciplines this cut's brief
// explicitly calls out (rootDir self-derived from the script's own
// location, never a hardcoded absolute path; visibility assertions use
// geometry, not just DOM presence — DP-3's blood-lesson from the prior cut).
//
// Fixtures (real, already-published data):
//   - paper-960d0f8d (2026 巴蜀中学 月考七): has all five 组 group types in
//     ONE paper (reading/cloze/seven_choices/grammar_cloze/writing×2), all
//     nine groups carry real topic labels — covers 四题型各一组实点 +
//     writing 组 + 话题标签丸 + 露一角/展开/收起 + 相似篇章 + 加入草稿卷.
//     Its grammar-fill-analysis-v1.json (schemaVersion grammar-fill-
//     analysis-v2, D1) has 10 real facetKey blanks — real chips.
//   - group-2026-i-reading-a (paper-2026-i): zero topic-label rows in the
//     dev DB (verified by hand before this script was written) — 无标签组.
//   - group-2025-i-reading-b: the ONE group in the whole dev DB with a saved
//     reading_parse_results row, and every question's questionType is
//     undefined in that payload — a real, already-existing instance of the
//     spec's own "字段覆盖率不足" edge case, not a synthetic one. Proves the
//     未标注 fallback chip renders from real (if impoverished) data.
//   - 无纸组降级占位: the current library is 273/273 published (spec's own
//     count) — there is no real fixture with a missing paper-asset. Rather
//     than mutate dev data to manufacture one, this scenario intercepts the
//     real network request for one real group's paper-asset.json via
//     page.route and forces a 404 — the degradation path is exercised
//     against the SAME component code a genuine 404 would hit, just with a
//     synthetic response instead of a synthetic DB row.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// 仓根从脚本自身位置推导（docs/cuts/<CUT>/qa → 上四级）——可在主树或任意
// worktree 重跑，不锚死某次会话的绝对路径（similar-passages-entry DP-3
// 判例，plan.md §8 点名的第一条纪律）。
const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/detail-page-redesign/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9898
const vitePort = 5188
const children = []

const OWNER_USERNAME = 'qa-local-owner'
const OWNER_PASSWORD = 'qa-detail-redesign-owner-pw-1'
const MEMBER_USERNAME = 'qa-detail-redesign-member'
const MEMBER_PASSWORD = 'qa-detail-redesign-member-pw-1'

const READING_GROUP = 'group-960d0f8d-reading-a'
const CLOZE_GROUP = 'group-960d0f8d-cloze'
const SEVEN_GROUP = 'group-960d0f8d-seven-choices'
const GRAMMAR_GROUP = 'group-960d0f8d-grammar-fill'
const WRITING_GROUP = 'group-960d0f8d-writing-application'
const PAPER_960D0F8D = 'paper-960d0f8d'
const NO_LABEL_GROUP = 'group-2026-i-reading-a'
const READING_UNLABELED_TYPE_GROUP = 'group-2025-i-reading-b'

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
  if (result.status !== 0) fail(`reset password for ${username}`, result.stdout + result.stderr)
}

function ensureMember(username, password) {
  const create = spawnSync(
    'node',
    ['scripts/create-user.mjs', '--username', username, '--role', 'member', '--password', password],
    { cwd: rootDir, encoding: 'utf8' },
  )
  if (create.status === 0) return
  // already exists — fall back to reset-password (idempotent re-run).
  resetPassword(username, password)
}

async function login(page, username, password) {
  await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
  await page.locator('#login-username').fill(username)
  await page.locator('#login-password').fill(password)
  await page.locator('.login-submit').click()
  await page.waitForFunction(() => !document.querySelector('#login-username'), { timeout: 15_000 })
}

async function basketCount(page) {
  const label = await page.locator('.basket-chip').getAttribute('aria-label')
  const match = /已选\s*(\d+)\s*个题组/.exec(label || '')
  return match ? Number(match[1]) : null
}

async function gotoDetail(page, groupId) {
  await page.goto(`http://127.0.0.1:${vitePort}/?view=detail&groupId=${groupId}`, { waitUntil: 'networkidle' })
  await page.locator('.peek-root').waitFor({ timeout: 15_000 })
}

async function main() {
  mkdirSync(qaDir, { recursive: true })

  resetPassword(OWNER_USERNAME, OWNER_PASSWORD)
  ensureMember(MEMBER_USERNAME, MEMBER_PASSWORD)

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
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  try {
    await login(page, OWNER_USERNAME, OWNER_PASSWORD)

    // ── 四题型各一组实点：速览头 meta/标题/大意/chips/话题丸 ──
    const groupTypeScenarios = [
      { groupId: READING_GROUP, metaFragment: '阅读', label: 'reading' },
      { groupId: CLOZE_GROUP, metaFragment: '完形填空', label: 'cloze' },
      { groupId: SEVEN_GROUP, metaFragment: '七选五', label: 'seven_choices' },
      { groupId: GRAMMAR_GROUP, metaFragment: '语法填空', label: 'grammar_cloze' },
    ]
    for (const { groupId, metaFragment, label } of groupTypeScenarios) {
      await gotoDetail(page, groupId)
      const metaText = await page.locator('.peek-meta-line').textContent()
      ok(`①-${label} meta 行含题型「${metaFragment}」`, (metaText || '').includes(metaFragment), metaText)
      const titleText = await page.locator('.peek-title').textContent()
      ok(`①-${label} 标题非空`, !!(titleText || '').trim(), titleText)
      // 大意: summary paragraph, if the fixture group has one (best-effort —
      // not every real group has summary text; presence-or-absence itself
      // isn't the contract, "no empty <p>" is — spec 错误与边角 "summary
      // 为空：不留空段"). Assert either present-with-text OR fully absent.
      const summaryCount = await page.locator('.peek-summary').count()
      if (summaryCount > 0) {
        const summaryText = await page.locator('.peek-summary').textContent()
        ok(`①-${label} 大意段非空（渲染即有内容，不留空段）`, !!(summaryText || '').trim(), summaryText)
      } else {
        pass(`①-${label} 无大意段时不渲染空段（summary 字段本身为空）`)
      }
      const topicCount = await page.locator('.peek-topics .peek-topic').count()
      ok(`①-${label} 话题标签丸渲染（该组已绑定真实标签）`, topicCount > 0, `count=${topicCount}`)
      // 一张纸 geometrically visible + clipped to 露一角 default height.
      const paperBox = await page.locator('.peek-paper').boundingBox()
      ok(`①-${label} 一张纸可见且非零尺寸（几何断言）`, paperBox != null && paperBox.width > 200 && paperBox.height > 40, JSON.stringify(paperBox))
    }
    await page.screenshot({ path: path.join(qaDir, 'dp2-01-reading.png') })

    // grammar_cloze chips: real facetKey→registry label, real count.
    await gotoDetail(page, GRAMMAR_GROUP)
    const grammarChipsText = await page.locator('.peek-chips').textContent()
    ok('①-grammar_cloze chips 含真实考点文案「介词」', (grammarChipsText || '').includes('介词'), grammarChipsText)
    ok('①-grammar_cloze chips 含计数 ×1', (grammarChipsText || '').includes('×1'), grammarChipsText)

    // cloze/seven_choices chips: 题数 only (一期范围).
    await gotoDetail(page, CLOZE_GROUP)
    const clozeChipsText = await page.locator('.peek-chips').textContent()
    ok('①-cloze chips 只显示题数', /^\s*\d+\s*题\s*$/.test((clozeChipsText || '').trim()), clozeChipsText)

    // ── writing 组 ──
    await gotoDetail(page, WRITING_GROUP)
    const writingMeta = await page.locator('.peek-meta-line').textContent()
    ok('②-writing meta 行含题型「写作」', (writingMeta || '').includes('写作'), writingMeta)
    const writingPaperBox = await page.locator('.peek-paper').boundingBox()
    ok('②-writing 一张纸可见（WritingPaperPage 包裹路径）', writingPaperBox != null && writingPaperBox.height > 40, JSON.stringify(writingPaperBox))
    // writing groupType is NOT in the 相似篇章 supported set (program.md Q5).
    ok('②-writing 无「相似篇章」入口', (await page.locator('[data-ra-entry="detail-view-similar"]').count()) === 0)

    // ── 露一角 → 展开 → 收起 ──
    await gotoDetail(page, READING_GROUP)
    await page.waitForFunction(() => {
      const el = document.querySelector('.peek-paper-clip')
      return el && el.children.length > 0
    }, { timeout: 15_000 })
    const clippedBox = await page.locator('.peek-paper').boundingBox()
    const expandButton = page.locator('.peek-expand:not(.peek-expand--collapse)')
    await expandButton.waitFor({ timeout: 15_000 })
    await expandButton.click()
    await page.waitForFunction(() => document.querySelector('.peek-paper.peek-paper--expanded') != null, { timeout: 5_000 })
    const expandedBox = await page.locator('.peek-paper').boundingBox()
    ok(
      '③ 展开后卷面高度明显增大（几何断言，非仅 DOM class 存在）',
      clippedBox != null && expandedBox != null && expandedBox.height > clippedBox.height + 20,
      `clipped=${clippedBox?.height} expanded=${expandedBox?.height}`,
    )
    const collapseButton = page.locator('.peek-expand--collapse')
    await collapseButton.waitFor({ timeout: 5_000 })
    await collapseButton.click()
    await page.waitForFunction(() => document.querySelector('.peek-paper.peek-paper--expanded') == null, { timeout: 5_000 })
    const collapsedBox = await page.locator('.peek-paper').boundingBox()
    ok(
      '③ 收起后卷面高度回落（几何断言）',
      collapsedBox != null && collapsedBox.height < expandedBox.height - 20,
      `expanded=${expandedBox?.height} collapsed=${collapsedBox?.height}`,
    )
    await page.screenshot({ path: path.join(qaDir, 'dp2-02-peek-expand.png') })

    // ── 无标签组（group-2026-i-reading-a，dev DB 内零 topic-label 行）──
    await gotoDetail(page, NO_LABEL_GROUP)
    ok('④ 无标签组不渲染 .peek-topics（真实零标签数据，非降级伪造）', (await page.locator('.peek-topics').count()) === 0)
    ok('④ 无标签组速览头其余部分正常渲染（标题非空）', !!(await page.locator('.peek-title').textContent() || '').trim())

    // ── 阅读 chips 未标注 fallback（真实数据：唯一一条 reading_parse_results，questionType 全 undefined）──
    await gotoDetail(page, READING_UNLABELED_TYPE_GROUP)
    const unlabeledChipsText = await page.locator('.peek-chips').textContent()
    ok(
      '⑤ 阅读 questionType 全缺失时 chips 显示「未标注」（真实覆盖率不足数据，不造假）',
      (unlabeledChipsText || '').includes('未标注'),
      unlabeledChipsText,
    )

    // ── 无纸组降级占位（273/273 已发布，无真实缺资产 fixture——拦截真实
    //    fetch 强制 404，走同一份组件代码的降级分支，只是响应是合成的）──
    await page.route(`**/paper-assets/${PAPER_960D0F8D}/**/paper-asset.json`, (route) => route.fulfill({ status: 404, body: '{}' }))
    await gotoDetail(page, CLOZE_GROUP)
    await page.waitForFunction(() => {
      const el = document.querySelector('.peek-paper-placeholder')
      return el && (el.textContent || '').trim().length > 0
    }, { timeout: 15_000 })
    ok('⑥ 卷面资产 404 时速览头照常渲染（标题非空）', !!(await page.locator('.peek-title').textContent() || '').trim())
    const placeholderText = await page.locator('.peek-paper-placeholder').textContent()
    ok('⑥ 卷面资产 404 时纸位显示降级占位文案', !!(placeholderText || '').trim(), placeholderText)
    await page.unroute(`**/paper-assets/${PAPER_960D0F8D}/**/paper-asset.json`)

    // ── 「相似篇章」面板展开 ──
    await gotoDetail(page, READING_GROUP)
    const similarButton = page.locator('[data-ra-entry="detail-view-similar"]')
    await similarButton.waitFor({ timeout: 15_000 })
    await similarButton.click()
    await page.locator('.similar-passages-panel').waitFor({ timeout: 15_000 })
    pass('⑦ 「相似篇章」面板原地展开')

    // ── 「加入草稿卷」计数 +1 ──
    await gotoDetail(page, SEVEN_GROUP)
    const beforeCount = await basketCount(page)
    const addButton = page.locator('.peek-btn.peek-btn--primary')
    const addButtonDisabled = await addButton.isDisabled()
    if (!addButtonDisabled) {
      await addButton.click()
      await page.waitForFunction(
        (before) => {
          const label = document.querySelector('.basket-chip')?.getAttribute('aria-label') || ''
          const match = /已选\s*(\d+)\s*个题组/.exec(label)
          return match && Number(match[1]) === before + 1
        },
        beforeCount,
        { timeout: 15_000 },
      )
      pass('⑧ 加入草稿卷 basket-chip 计数 +1')

      // cleanup — keep the script re-runnable (same idempotency approach as
      // similar-passages-entry's own DP-2 script).
      const cookies = await context.cookies()
      const sessionCookie = cookies.find((c) => c.name === 'eqb_session')
      const cookieHeader = sessionCookie ? `${sessionCookie.name}=${sessionCookie.value}` : ''
      const currentDraft = await fetch(`http://127.0.0.1:${apiPort}/api/draft-papers/current`, {
        headers: { cookie: cookieHeader },
      }).then((r) => r.json())
      const addedItem = currentDraft.draftPaper?.items?.find((item) => item.groupId === SEVEN_GROUP)
      if (addedItem) {
        await fetch(`http://127.0.0.1:${apiPort}/api/draft-papers/${currentDraft.draftPaper.id}/items/${addedItem.id}`, {
          method: 'DELETE',
          headers: { cookie: cookieHeader },
        })
        pass('⑧ cleanup: removed the just-added group from the draft paper (keeps this script re-runnable)')
      }
    } else {
      pass('⑧ 该组已在草稿卷中（重复跑本脚本的正常态）— 跳过计数断言，不影响其余场景')
    }

    // ── owner 视角：编辑/删除可见 ──
    await gotoDetail(page, READING_GROUP)
    ok('⑨ owner 视角编辑/删除按钮可见', (await page.locator('.peek-btn--minor').count()) === 2)

    // ── member 视角：编辑/删除不可见（isOwnerView gate 现状规则）──
    const memberContext = await browser.newContext({ viewport: { width: 1280, height: 960 } })
    const memberPage = await memberContext.newPage()
    await login(memberPage, MEMBER_USERNAME, MEMBER_PASSWORD)
    await memberPage.goto(`http://127.0.0.1:${vitePort}/?view=detail&groupId=${READING_GROUP}`, { waitUntil: 'networkidle' })
    await memberPage.locator('.peek-root').waitFor({ timeout: 15_000 })
    ok('⑨ member 视角编辑/删除按钮不可见', (await memberPage.locator('.peek-btn--minor').count()) === 0)
    ok('⑨ member 视角「加入草稿卷」主操作仍可见（member 可组卷，未被误关）', (await memberPage.locator('.peek-btn--primary').count()) === 1)
    await memberContext.close()

    ok('No page errors across all scenarios', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\ndetail-page-redesign DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
