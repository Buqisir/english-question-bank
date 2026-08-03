// DP-2 行为断言 — craft-polish 刀（2026-07-17 三路复评工艺账收尾）。
// 前提：dev 起在 5173/8787，QA 账号 qa-local-owner。
// 跑法：node docs/cuts/craft-polish/qa/dp2-craft-polish.mjs
// 断言：
//   ① concierge 筛选面板 usePresence：开=mounted+visible；关的瞬间仍
//      mounted（data-visible=false，退场播放中）；~200ms 后真卸载
//   ② 工作台导出菜单同款出入场契约
//   ③ 详情页「一张纸」量高手风琴：展开时 clip 内联 max-height 为像素值
//      （过渡目标），~350ms 后放开成 none；收起后内联清空回 340 契约
//   ④ SevenChoicesAnalysisPanel 不再硬编码 smooth（源码断言）
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5173'
const USER = process.env.QA_USER || 'qa-local-owner'
const PASS = process.env.QA_PASS || 'qa-review-2026'

let failures = 0
function check(name, cond, detail = '') {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ④ 源码断言（不依赖浏览器）
const sevenSrc = readFileSync(
  path.join(rootDir, 'app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx'),
  'utf8',
)
check('④ SevenChoices 无硬编码 smooth', !sevenSrc.includes("behavior: 'smooth'"))
check('④b SevenChoices 已接 scrollBehavior()', sevenSrc.includes('scrollBehavior()'))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(BASE + '/')
if (await page.locator('#login-username').count()) {
  await page.fill('#login-username', USER)
  await page.fill('#login-password', PASS)
  await page.click('button.login-submit')
  // networkidle 会在登录 POST 在飞时提前放行，下一个 goto 把它打断
  // （2026-07-17 实测）——等「退出」钮这个登录态确定性信号。
  await page.locator('button', { hasText: '退出' }).first().waitFor({ timeout: 15000 })
}

// ① 筛选面板
await page.goto(BASE + '/?view=browse')
await page.waitForSelector('.concierge-filter-toggle, [aria-controls]', { timeout: 15000 }).catch(() => {})
const filterToggle = page.locator('button', { hasText: '筛选' }).first()
await filterToggle.waitFor({ state: 'visible', timeout: 15000 })
await filterToggle.click()
await page.waitForSelector('.concierge-filter-row[data-visible="true"]', { timeout: 5000 })
check('①a 筛选面板开=mounted+visible', true)
await filterToggle.click()
// 关后 React effect 下一拍才翻 visible=false——等它出现即证退场态播过
const sawExit = await page
  .waitForSelector('.concierge-filter-row[data-visible="false"]', { timeout: 500 })
  .then(() => true)
  .catch(() => false)
check('①b 关后出现 data-visible=false 退场态', sawExit)
await sleep(250)
check('①c ~250ms 后真卸载', (await page.locator('.concierge-filter-row').count()) === 0)

// ③ 详情页量高手风琴
await page.goto(BASE + '/?view=detail&groupId=group-2026-i-reading-a')
const expandBtn = page.locator('button.peek-expand')
await expandBtn.waitFor({ state: 'visible', timeout: 20000 })
await expandBtn.click()
const midTransition = await page.evaluate(
  () => document.querySelector('.peek-paper-clip')?.style.maxHeight || '(empty)',
)
check('③a 展开瞬间内联 max-height=像素目标', /px$/.test(midTransition), `实测 ${midTransition}`)
await sleep(400)
const afterOpen = await page.evaluate(
  () => document.querySelector('.peek-paper-clip')?.style.maxHeight || '(empty)',
)
check('③b 播完放开成 none', afterOpen === 'none', `实测 ${afterOpen}`)
await page.locator('button.peek-expand--collapse').click()
const afterClose = await page.evaluate(
  () => document.querySelector('.peek-paper-clip')?.style.maxHeight || '(empty)',
)
check('③c 收起后内联清空（回 340 契约）', afterClose === '(empty)', `实测 ${afterClose}`)

// ② 工作台导出菜单（从个人空间开一份草稿）
await page.goto(BASE + '/?view=my-space')
await page.waitForSelector('.my-space-card-actions', { timeout: 15000 })
const openDraft = page.locator('button', { hasText: '打开原草稿' }).first()
if (await openDraft.count()) {
  await openDraft.click()
  const exportTrigger = page.locator('.draft-export-menu-trigger')
  await exportTrigger.waitFor({ state: 'visible', timeout: 20000 })
  await exportTrigger.click()
  await page.waitForSelector('.draft-export-menu-panel[data-visible="true"]', { timeout: 5000 })
  check('②a 导出菜单开=mounted+visible', true)
  await exportTrigger.click()
  const sawMenuExit = await page
    .waitForSelector('.draft-export-menu-panel[data-visible="false"]', { timeout: 500 })
    .then(() => true)
    .catch(() => false)
  check('②b 关后出现 data-visible=false 退场态', sawMenuExit)
  await sleep(250)
  check('②c ~250ms 后真卸载', (await page.locator('.draft-export-menu-panel').count()) === 0)
} else {
  check('② 导出菜单（个人空间无草稿可开，跳过）', false, '需要至少一份草稿卷')
}

await browser.close()
console.log(failures === 0 ? '\nDP-2 all green' : `\nDP-2 FAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
