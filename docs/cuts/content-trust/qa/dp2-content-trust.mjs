// DP-2 行为断言 — content-trust 刀（2026-07-17 三路复评内容信任账）。
// 前提：dev 起在 5173/8787（sh scripts/dev.sh），QA 账号 qa-local-owner。
// 跑法：cd app && node ../docs/cuts/content-trust/qa/dp2-content-trust.mjs
// 断言：
//   ① 详情页 reading-a 表格图 naturalHeight===348（裁掉标题条后的尺寸；
//      裁前 410——重复标题是图里烤的，DOM 文本恒 1，故锚定图片尺寸）
//   ② 详情页 DOM 文本「Upcoming Football Events」恰 1 处（回归护栏）
//   ③ 整卷页 topbar 标题=「2026年新课标Ⅰ卷」（asset 假标题 "paper" 已修）
//   ④ 个人空间删除键与主键同排（offsetTop 相等=不再换行孤行）且
//      aria-label="删除"（图标化后可达性保留）
import { createRequire } from 'node:module'
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
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

// 登录（首屏即登录表单）
await page.goto(BASE + '/')
if (await page.locator('#login-username').count()) {
  await page.fill('#login-username', USER)
  await page.fill('#login-password', PASS)
  await page.click('button.login-submit')
  await page.waitForLoadState('networkidle')
}

// ①② 详情页
await page.goto(BASE + '/?view=detail&groupId=group-2026-i-reading-a')
await page.waitForLoadState('networkidle')
const img = page.locator('img[src*="reading-a-table-1"]').first()
await img.waitFor({ state: 'attached', timeout: 15000 })
const natural = await img.evaluate((el) => ({ h: el.naturalHeight, w: el.naturalWidth }))
check('① 表格图已重裁（naturalHeight=348）', natural.h === 348, `实测 ${natural.w}x${natural.h}`)
const bodyText = await page.evaluate(() => document.body.innerText)
const headingCount = bodyText.split('Upcoming Football Events').length - 1
check('② 标题 DOM 文本恰 1 处', headingCount === 1, `实测 ${headingCount}`)

// ③ 整卷页面包屑（「整卷预览」是 loading/error 分支的占位标题，等它退场）
await page.goto(BASE + '/?view=paper-browse&paperId=paper-2026-i')
await page.waitForFunction(
  () => {
    const t = document.querySelector('.topbar-page-title')?.textContent?.trim()
    return t && t !== '整卷预览'
  },
  { timeout: 20000 },
)
const crumb = (await page.locator('.topbar-page-title').first().textContent())?.trim()
check('③ 面包屑=2026年新课标Ⅰ卷', crumb === '2026年新课标Ⅰ卷', `实测「${crumb}」`)

// ④ 个人空间删除键
await page.goto(BASE + '/?view=my-space')
await page.waitForSelector('.my-space-card-actions', { timeout: 15000 })
const rows = await page.evaluate(() => {
  const actions = document.querySelector('.my-space-card-actions')
  if (!actions) return null
  const primary = actions.querySelector('.my-space-card-primary')
  const danger = actions.querySelector('.my-space-card-danger')
  if (!primary || !danger) return null
  return {
    sameRow: primary.offsetTop === danger.offsetTop,
    ariaLabel: danger.getAttribute('aria-label'),
  }
})
check('④a 删除键与主键同排', rows?.sameRow === true, rows ? '' : '未找到操作行（个人空间可能无卡片）')
check('④b 删除键 aria-label 保留', rows?.ariaLabel === '删除', `实测「${rows?.ariaLabel}」`)

await browser.close()
console.log(failures === 0 ? `\nDP-2 all green` : `\nDP-2 FAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
