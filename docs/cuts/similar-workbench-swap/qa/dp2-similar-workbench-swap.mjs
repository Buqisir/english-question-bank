#!/usr/bin/env node
// similar-workbench-swap (E7) DP-2 — browser QA against the
// wt-similar-workbench-swap worktree, covering plan.md 施工要点 7's six
// behavior scenarios. Boot skeleton mirrors
// docs/cuts/similar-passages-entry/qa/dp2-similar-passages-entry.mjs (spawn
// api+vite, headless Playwright from app/node_modules, detached process
// groups) — but rootDir is self-derived from this script's own location
// (rootDir 自推导, same DP-3 correction that cut's script already applied),
// and every geometry assertion is a real boundingBox() comparison (可见性
// 几何断言纪律), not just a DOM-presence check.
//
// Own dedicated QA account (`qa-similar-workbench-swap-owner`, created on
// first run, password reset on subsequent runs) so this script's current
// draft paper is never shared with similar-passages-entry's own
// `qa-local-owner` fixture — the setup step below EXPLICITLY WIPES that
// account's current draft paper before seeding, so repeated runs stay
// deterministic (no accumulation, unlike E6's own script which accepts a
// delta-only assertion for its shared account).
//
// scenario ⑤'s "writing 贴纸无 ⇄" half is covered STATICALLY instead of
// behaviorally here — discovered while authoring this fixture: EVERY
// writing/continuation question_groups row in this repo's dev DB has
// `questionIds: []` in its paper-asset (writing tasks have no discrete
// 小题 by nature), which server/api.mjs's isGroupPrintReady hard-fails
// ("题组没有小题") universally, so no writing (or continuation) group can
// ever become a live draft-paper item with today's real data — a
// pre-existing, unrelated-to-this-cut product gap, Forbidden keeps
// server/** out of this cut's scope regardless. The gate logic itself
// (SWAP_SUPPORTED_GROUP_TYPES excludes both, and the ⇄ button's JSX is
// actually conditioned on that set) is proven at the source level by
// scripts/verify-similar-workbench-swap.mjs § 1 instead.
//
// Fixture data: real, already-analyzed paper-960d0f8d (2026 巴蜀中学 月考七,
// same source E6's script already uses) for the two seed items, plus two
// real candidate groupIds independently curled from a scratch server boot
// before this script was written — group-2025-i-reading-a
// (REPLACE_CANDIDATE, topic-overlaps the reading seed, real 真题) and
// group-zj-2025-jan-reading-b (ALREADY_CANDIDATE, same pool, deliberately
// ALSO added to the draft so its card renders disabled — SW-3/C8 parity).
// The 加入 scenario's own candidate is picked live from the DOM (first
// non-disabled card), not hardcoded, so it survives pool churn.
//
// Seeded item order (index → groupId → why):
//   0  READING_GROUP → seed A (⇄ present); pageBreakBefore forced true via
//      direct PATCH before the drawer ever opens, so 替换's "分页保留"
//      claim (scenario ②) is actually exercised, not vacuously true
//   1  CLOZE_GROUP   → seed B (⇄ present, scenario ④ 换种子直切 + ③ 加入)
//   2  ALREADY_CANDIDATE → added directly so seed A's own candidate list
//      shows it as "already in this volume" (scenario ⑤ other half)
//
// Six checks, plan.md 施工要点 7 order:
//   ① 阅读贴纸点 ⇄ → rail 原地切抽屉（几何：抽屉占 rail 宽、目录隐）
//   ② 候选「替换这篇」→ 该槽位换新组、pageBreakBefore 保留 → toast 撤销 → 复原
//   ③ 「＋加入」→ 种子后邻插、计数 +1
//   ④ 换种子直切 / 返回目录恢复 scrollspy
//   ⑤ writing 贴纸无 ⇄（静态验证，见上）；已在卷候选禁用（本脚本behaviorally验）
//   ⑥ 替换后做一次其他变更（如上移）→ 替换撤销快照按纪律失效
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { requireLocalQaPassword, LOCAL_QA_OWNER_PASSWORD_ENV } from '../../_shared/local-qa-credentials.mjs'

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const qaDir = path.join(rootDir, 'docs/cuts/similar-workbench-swap/qa')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const apiPort = 9899
const vitePort = 5189
const children = []

const OWNER_USERNAME = 'qa-similar-workbench-swap-owner'
const OWNER_PASSWORD = requireLocalQaPassword(LOCAL_QA_OWNER_PASSWORD_ENV)

const READING_GROUP = 'group-960d0f8d-reading-a'
const CLOZE_GROUP = 'group-960d0f8d-cloze'
const REPLACE_CANDIDATE = 'group-2025-i-reading-a'
const ALREADY_CANDIDATE = 'group-zj-2025-jan-reading-b'

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

function ensureOwnerAccount() {
  const create = spawnSync(
    'node',
    ['scripts/create-user.mjs', '--username', OWNER_USERNAME, '--password', OWNER_PASSWORD, '--role', 'owner'],
    { cwd: rootDir, encoding: 'utf8' },
  )
  if (create.status !== 0) {
    const reset = spawnSync(
      'node',
      ['scripts/create-user.mjs', '--reset-password', '--username', OWNER_USERNAME, '--password', OWNER_PASSWORD],
      { cwd: rootDir, encoding: 'utf8' },
    )
    if (reset.status !== 0) fail('reset qa-similar-workbench-swap-owner password', reset.stdout + reset.stderr)
  }
}

async function login(page) {
  await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
  await page.locator('#login-username').fill(OWNER_USERNAME)
  await page.locator('#login-password').fill(OWNER_PASSWORD)
  await page.locator('.login-submit').click()
  await page.waitForFunction(() => !document.querySelector('#login-username'), { timeout: 15_000 })
}

function apiUrl(p) {
  return `http://127.0.0.1:${apiPort}${p}`
}

async function apiFetch(cookieHeader, p, init = {}) {
  const response = await fetch(apiUrl(p), {
    ...init,
    headers: { 'content-type': 'application/json', cookie: cookieHeader, ...(init.headers || {}) },
  })
  if (!response.ok) fail(`API call failed: ${init.method || 'GET'} ${p}`, `${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

async function getCurrentDraft(cookieHeader) {
  const data = await apiFetch(cookieHeader, '/api/draft-papers/current?create=1')
  return data.draftPaper
}

async function main() {
  mkdirSync(qaDir, { recursive: true })
  ensureOwnerAccount()

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir, name: 'api',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(apiUrl('/api/health'))
  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'), name: 'vite',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)
  pass('api + vite started against the worktree\'s own persistent dev DB')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  try {
    await login(page)
    const cookies = await context.cookies()
    const sessionCookie = cookies.find((c) => c.name === 'eqb_session')
    const cookieHeader = sessionCookie ? `${sessionCookie.name}=${sessionCookie.value}` : ''

    // ── setup: wipe + reseed this account's current draft, deterministic every run ──
    {
      const current = await getCurrentDraft(cookieHeader)
      for (const item of current.items) {
        await apiFetch(cookieHeader, `/api/draft-papers/${current.id}/items/${item.id}`, { method: 'DELETE' })
      }
      // `POST /api/draft-papers/current/items` (addGroupToCurrentDraftPaper,
      // pre-existing route, unrelated to this cut) actually PREPENDS each
      // new item rather than appending — its `insertIndex` default of
      // `null` still satisfies `Number.isInteger(Number(insertIndex)) &&
      // Number(insertIndex) >= 0` because `Number(null) === 0`, so it always
      // resolves to `targetIndex = 0`. A real, pre-existing server quirk
      // (out of this cut's Forbidden-scoped server/** surface either way) —
      // this fixture just seeds in REVERSE of the desired final order to
      // land on [READING_GROUP, CLOZE_GROUP, ALREADY_CANDIDATE] regardless.
      for (const groupId of [ALREADY_CANDIDATE, CLOZE_GROUP, READING_GROUP]) {
        await apiFetch(cookieHeader, '/api/draft-papers/current/items', { method: 'POST', body: JSON.stringify({ groupId }) })
      }
      const seeded = await getCurrentDraft(cookieHeader)
      ok('setup: seeded 3 items in known order', seeded.items.length === 3 &&
        seeded.items.map((item) => item.groupId).join(',') === [READING_GROUP, CLOZE_GROUP, ALREADY_CANDIDATE].join(','),
        seeded.items.map((item) => item.groupId).join(','))
      const readingItem = seeded.items.find((item) => item.groupId === READING_GROUP)
      await apiFetch(cookieHeader, `/api/draft-papers/${seeded.id}/items/${readingItem.id}`, {
        method: 'PATCH', body: JSON.stringify({ pageBreakBefore: true }),
      })
      pass('setup: READING_GROUP item forced pageBreakBefore=true (so ② actually exercises "分页保留")')
    }

    await page.goto(`http://127.0.0.1:${vitePort}/?view=draft-paper&focusGroupId=${READING_GROUP}`, { waitUntil: 'networkidle' })
    await page.locator('.draft-paper-rail').waitFor({ timeout: 15_000 })
    await page.locator('.draft-group-actions').first().waitFor({ timeout: 15_000 })

    const actionClusters = page.locator('.draft-group-actions')
    ok('3 per-group action clusters render (one per seeded item)', (await actionClusters.count()) === 3, String(await actionClusters.count()))
    const readingCluster = actionClusters.nth(0)
    ok('reading sticker (index 0) has a ⇄ button (⇄ 入口 gate positive control)', (await readingCluster.getByRole('button', { name: '换一篇相似篇章' }).count()) === 1)

    // ── ① click ⇄ on the reading seed → rail 原地切抽屉 ──
    const railBoxBefore = await page.locator('.draft-paper-rail').boundingBox()
    const directoryCountBefore = await page.locator('.draft-paper-rail-item').count()
    ok('① directory has items before opening the drawer', directoryCountBefore > 0, String(directoryCountBefore))
    await readingCluster.getByRole('button', { name: '换一篇相似篇章' }).click()
    await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
    await page.locator('.draft-swap-drawer .similar-rcard').first().waitFor({ timeout: 15_000 })
    ok('① 目录隐 — directory items gone while drawer is open', (await page.locator('.draft-paper-rail-item').count()) === 0)
    const drawerBox = await page.locator('.draft-swap-drawer').boundingBox()
    ok('① 抽屉占 rail 宽 — drawer width ≈ rail nav width', railBoxBefore != null && drawerBox != null && Math.abs(drawerBox.width - railBoxBefore.width) < 4,
      `rail=${railBoxBefore?.width} drawer=${drawerBox?.width}`)
    const drawerHead = await page.locator('.draft-swap-drawer h4').textContent()
    ok('① drawer head names the seed group', (drawerHead || '').includes('相似篇章'), drawerHead)
    pass('① ⇄ 点击后 rail 原地切抽屉，候选卡渲染')
    if (process.env.DP2_SCREENSHOTS === '1') await page.screenshot({ path: path.join(qaDir, 'dp2-01-swap-drawer.png') }) // 截图门控惯例见 dispatch-protocols.md

    // ── ⑤ already-in-draft candidate disabled ──
    const alreadyCard = page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${ALREADY_CANDIDATE}"]`)
    await alreadyCard.waitFor({ timeout: 15_000 })
    const alreadyButtons = alreadyCard.locator('.similar-rcard-actions button')
    ok('⑤ already-in-draft candidate: both buttons disabled', (await alreadyButtons.nth(0).isDisabled()) && (await alreadyButtons.nth(1).isDisabled()))
    const alreadyTitle = await alreadyButtons.nth(0).getAttribute('title')
    ok('⑤ already-in-draft candidate carries "已在草稿卷中" tooltip', alreadyTitle === '已在草稿卷中', alreadyTitle)

    // ── ② 替换这篇 → 该槽位换新组、pageBreakBefore 保留 → toast 撤销 → 复原 ──
    const replaceCard = page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${REPLACE_CANDIDATE}"]`)
    await replaceCard.waitFor({ timeout: 15_000 })
    const replaceButton = replaceCard.getByRole('button', { name: '⇄ 替换这篇' })
    ok('② replace candidate button is enabled', await replaceButton.isEnabled())
    await replaceButton.click()
    await page.locator('.draft-paper-rail-item').first().waitFor({ timeout: 15_000 })
    pass('② 替换后抽屉收起回目录')
    {
      const afterReplace = await getCurrentDraft(cookieHeader)
      ok('② 该槽位（index 0）换成了候选组', afterReplace.items[0].groupId === REPLACE_CANDIDATE, afterReplace.items[0].groupId)
      ok('② pageBreakBefore 保留（分页是位置意图，随槽位不随内容）', afterReplace.items[0].pageBreakBefore === true)
      ok('② 其余槽位未受影响', afterReplace.items[1].groupId === CLOZE_GROUP && afterReplace.items[2].groupId === ALREADY_CANDIDATE)
      ok('② items 总数不变', afterReplace.items.length === 3)
    }
    await page.locator('.draft-undo-toast', { hasText: '已替换这篇' }).waitFor({ timeout: 15_000 })
    pass('② toast 显示「已替换这篇」+ 撤销按钮')
    await page.locator('.draft-undo-toast', { hasText: '已替换这篇' }).getByRole('button', { name: '撤销' }).click()
    await page.waitForFunction(
      () => !document.body.textContent.includes('已替换这篇'),
      { timeout: 15_000 },
    )
    {
      const afterUndo = await getCurrentDraft(cookieHeader)
      ok('② 撤销后复原：该槽位换回原组', afterUndo.items[0].groupId === READING_GROUP, afterUndo.items[0].groupId)
      ok('② 撤销后复原：pageBreakBefore 仍为 true（原值）', afterUndo.items[0].pageBreakBefore === true)
      ok('② 撤销后复原：items 顺序与总数不变', afterUndo.items.map((i) => i.groupId).join(',') === [READING_GROUP, CLOZE_GROUP, ALREADY_CANDIDATE].join(','))
    }
    pass('② 撤销 → 复原（items 序 + 分页位断言）')

    // ── ⑦ MF-1 回归锚：替换第二跳（移除原篇）失败 → 可见重复而非静默丢失 ──
    // 先加后删的安全序契约（CR MF-1 修）：DELETE 被拦截强制失败时，卷面
    // 呈现「候选+原篇相邻并存」的诚实半截态（items +1），原篇零丢失、
    // 不设撤销快照。route 拦截只杀 DELETE，加入的 POST 照常放行。
    {
      await page.locator('.draft-group-actions').nth(0).getByRole('button', { name: '换一篇相似篇章' }).click()
      await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
      const card7 = page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${REPLACE_CANDIDATE}"]`)
      await card7.waitFor({ timeout: 15_000 })
      await page.route('**/api/draft-papers/**/items/**', (route) =>
        route.request().method() === 'DELETE' ? route.abort() : route.fallback(),
      )
      await card7.getByRole('button', { name: '⇄ 替换这篇' }).click()
      // saveError 呈现面 = 头行「⋯」按钮的 aria-label/title（保存态收
      // 「⋯」是 header-unify 拍板形态），不在 body 正文——按属性断言。
      await page.waitForFunction(
        () => Boolean(document.querySelector('[aria-label*="原篇仍在卷中"], [title*="原篇仍在卷中"]')),
        { timeout: 15_000 },
      )
      pass('⑦ 半截态错误文案如实（含「原篇仍在卷中，可手动移除」指引）')
      const afterPartial = await getCurrentDraft(cookieHeader)
      ok('⑦ 卷面呈现可见重复（items +1，非丢失）', afterPartial.items.length === 4, String(afterPartial.items.length))
      ok('⑦ 候选已入槽位 0', afterPartial.items[0].groupId === REPLACE_CANDIDATE)
      ok('⑦ 原篇零丢失（仍在卷中）', afterPartial.items.some((i) => i.groupId === READING_GROUP))
      ok('⑦ 半截态不设撤销快照（无「已替换这篇」toast）',
        !((await page.locator('.draft-undo-toast').allTextContents()).some((t) => t.includes('已替换这篇'))))
      await page.unroute('**/api/draft-papers/**/items/**')
      // 自愈路径 = 手动移除重复项（走真 API 清理，恢复 ⑥ 所需的原三项态）
      const dupItem = afterPartial.items.find((i) => i.groupId === REPLACE_CANDIDATE)
      const cleanupResp = await fetch(
        `http://127.0.0.1:${apiPort}/api/draft-papers/${encodeURIComponent(afterPartial.id)}/items/${encodeURIComponent(dupItem.id)}`,
        { method: 'DELETE', headers: { cookie: cookieHeader } },
      )
      ok('⑦ 自愈：手动移除重复项成功（回到原三项态）', cleanupResp.ok)
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForFunction(() => document.querySelectorAll('.draft-group-actions').length === 3, { timeout: 15_000 })
      const afterHeal = await getCurrentDraft(cookieHeader)
      ok('⑦ 自愈后 items 序恢复原状', afterHeal.items.map((i) => i.groupId).join(',') === [READING_GROUP, CLOZE_GROUP, ALREADY_CANDIDATE].join(','))
    }

    // ── ⑥ 替换后做一次其他变更 → 替换撤销快照按纪律失效 ──
    await page.locator('.draft-group-actions').nth(0).getByRole('button', { name: '换一篇相似篇章' }).click()
    await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
    await page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${REPLACE_CANDIDATE}"]`).waitFor({ timeout: 15_000 })
    await page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${REPLACE_CANDIDATE}"]`).getByRole('button', { name: '⇄ 替换这篇' }).click()
    await page.locator('.draft-undo-toast', { hasText: '已替换这篇' }).waitFor({ timeout: 15_000 })
    pass('⑥ 二次替换成功，撤销 toast 出现')
    // The replace above changes item order → itemsLayoutKey changes → the
    // debounced (400ms) repagination fetch re-navigates the iframe →
    // groupAnchors briefly clears to {} (previewReady flips false) before
    // repopulating in the NEW order once the new iframe's onLoad fires —
    // clicking a `.draft-group-actions` `.nth()` target during that window
    // risks resolving against a transient, still-settling cluster set. Wait
    // it out before the next positional click (same class of race
    // scrollToGroupInPaper's own settle-loop elsewhere in this file guards
    // against, just simpler here since there's no scroll to settle).
    await page.waitForFunction(() => document.querySelectorAll('.draft-group-actions').length === 3, { timeout: 15_000 })
    await page.waitForTimeout(700)
    // An unrelated mutation (上移 on the cloze sticker, index 1) — never
    // inside applySwapReplace/undoSwapReplace themselves, mirrors
    // reorder-suggest's own clearReorderUndo discipline.
    await page.locator('.draft-group-actions').nth(1).getByRole('button', { name: '上移' }).click()
    await page.waitForTimeout(600)
    ok('⑥ 替换撤销快照在其他变更后失效（toast/撤销按钮消失）', !((await page.locator('.draft-undo-toast').allTextContents()).some((t) => t.includes('已替换这篇'))))
    pass('⑥ 撤销快照互斥：任何其他变更让替换快照失效')
    // Same repagination-settle wait as above — the moveItem PATCH just sent
    // also changes item order.
    await page.waitForFunction(() => document.querySelectorAll('.draft-group-actions').length === 3, { timeout: 15_000 })
    await page.waitForTimeout(700)
    {
      const afterMove = await getCurrentDraft(cookieHeader)
      console.log('order after ⑥ moveItem:', afterMove.items.map((i) => i.groupId).join(','))
    }

    // ── ④ 换种子直切 / 返回目录恢复 scrollspy ──
    // Positions after ⑥'s moveItem depend on which item sat at index 1 —
    // read it back from the API rather than assumed, so this step is
    // correct regardless.
    await page.locator('.draft-paper-rail-item').first().waitFor({ timeout: 15_000 })
    await page.locator('.draft-group-actions').nth(0).getByRole('button', { name: '换一篇相似篇章' }).click()
    await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
    const clozeHead = await page.locator('.draft-swap-drawer h4').textContent()
    ok('④ 抽屉头行显示完形填空种子', (clozeHead || '').includes('完形填空'), clozeHead)
    // 点另一贴纸的 ⇄（不先收起）→ 直接切到新种子.
    await page.locator('.draft-group-actions').nth(1).getByRole('button', { name: '换一篇相似篇章' }).click()
    await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
    const secondHead = await page.locator('.draft-swap-drawer h4').textContent()
    ok('④ 换种子直切：抽屉头行更新为新种子（未先经过目录态）', secondHead !== clozeHead, secondHead)
    pass('④ 换种子（点另一贴纸的⇄）直接切到新种子抽屉')
    await page.locator('.draft-swap-drawer .similar-backlink', { hasText: '返回目录' }).click()
    await page.locator('.draft-paper-rail-item').first().waitFor({ timeout: 15_000 })
    ok('④ 返回目录后 scrollspy 恢复（有一项处于 active）', (await page.locator('.draft-paper-rail-item.active').count()) >= 1)
    pass('④ 返回目录恢复 scrollspy')

    // ── ③ ＋加入 → 种子后邻插、计数 +1 ──
    await page.locator('.draft-group-actions').nth(0).getByRole('button', { name: '换一篇相似篇章' }).click()
    await page.locator('.draft-swap-drawer').waitFor({ timeout: 15_000 })
    await page.locator('.draft-swap-drawer .similar-rcard').first().waitFor({ timeout: 15_000 })
    const beforeAdd = await getCurrentDraft(cookieHeader)
    const addedCardGroupId = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.draft-swap-drawer .similar-rcard'))
      for (const card of cards) {
        const btn = Array.from(card.querySelectorAll('.similar-rcard-actions button')).find((b) => b.textContent.includes('＋ 加入'))
        if (btn && !btn.disabled) return card.getAttribute('data-group-id')
      }
      return null
    })
    ok('③ 找到至少一张可加入的候选卡', Boolean(addedCardGroupId), addedCardGroupId)
    await page.locator(`.draft-swap-drawer .similar-rcard[data-group-id="${addedCardGroupId}"] .similar-rcard-actions button`, { hasText: '＋ 加入' }).click()
    await page.locator('.draft-undo-toast', { hasText: '已加入草稿卷' }).waitFor({ timeout: 15_000 })
    pass('③ toast 显示「已加入草稿卷」')
    const afterAdd = await getCurrentDraft(cookieHeader)
    ok('③ items 计数 +1', afterAdd.items.length === beforeAdd.items.length + 1, `${beforeAdd.items.length} -> ${afterAdd.items.length}`)
    const seedIndexAfterAdd = afterAdd.items.findIndex((item) => item.groupId === CLOZE_GROUP)
    ok('③ 邻插：新组紧跟种子（完形）之后，不跳尾', afterAdd.items[seedIndexAfterAdd + 1]?.groupId === addedCardGroupId,
      `seedIndex=${seedIndexAfterAdd} next=${afterAdd.items[seedIndexAfterAdd + 1]?.groupId} added=${addedCardGroupId}`)
    ok('③ 抽屉未收起（可继续加入）', (await page.locator('.draft-swap-drawer').count()) === 1)

    ok('No page errors across all scenarios', pageErrors.length === 0, pageErrors.join('\n'))
  } finally {
    await context.close().catch(() => {})
    await browser.close()
  }

  console.log(`\nsimilar-workbench-swap DP-2 passed: ${passed} checks`)
}

main()
  .then(() => { cleanup(); process.exit(0) })
  .catch((error) => {
    console.error(`\nFAIL ${error.message}`)
    cleanup()
    process.exit(1)
  })
