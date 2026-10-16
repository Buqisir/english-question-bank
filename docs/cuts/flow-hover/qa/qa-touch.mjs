// Throwaway QA script (Chunk A flow-hover) — verifies the touch fallback
// (@media (hover: none)) shows the action cluster without hover/focus, and
// saves screenshots to this qa/ folder. Not part of the app; run once from
// the app/ dir (needs its playwright devDependency + a running dev server):
//   cp docs/cuts/flow-hover/qa/qa-touch.mjs app/qa-touch.mjs
//   (cd app && node qa-touch.mjs)
//   rm app/qa-touch.mjs
// Requires a local user "qa-owner" (see scripts/create-user.mjs) whose
// password is in EQB_LOCAL_QA_OWNER_PASSWORD. Safe to delete after QA.
import { chromium } from 'playwright'

// Copied into app/ to run, so the shared helper in docs/cuts/_shared is not
// importable here; same rule: no fixed fallback, stop before any login request.
const OWNER_PASSWORD = process.env.EQB_LOCAL_QA_OWNER_PASSWORD
if (!OWNER_PASSWORD) {
  console.error('缺少环境变量 EQB_LOCAL_QA_OWNER_PASSWORD。请先设置本地 QA 账号密码再运行；脚本已停止，没有发出登录请求。')
  process.exit(2)
}
const BASE = 'http://127.0.0.1:5183'
const URL = `${BASE}/?view=paper-browse&paperId=paper-2026-i`
const QA_DIR = '../docs/cuts/flow-hover/qa' // relative to app/, where this runs from

async function login(context) {
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: { username: 'qa-owner', password: OWNER_PASSWORD },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
}

async function main() {
  const browser = await chromium.launch()

  // 1) Desktop (hover: hover) — default state: no action chrome visible.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await login(context)
    const page = await context.newPage()
    await page.goto(URL)
    await page.waitForSelector('.paper-browse-group-card')
    await page.waitForTimeout(500)
    const opacity = await page.$eval(
      '.paper-browse-group-actions',
      (el) => getComputedStyle(el).opacity,
    )
    console.log('[desktop] default action-cluster opacity =', opacity, '(expect 0)')
    await page.screenshot({ path: `${QA_DIR}/desktop-default.png` })
    await context.close()
  }

  // 2) Touch device emulation — action cluster should be visible without hover.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await login(context)
    const page = await context.newPage()
    await page.goto(URL)
    await page.waitForSelector('.paper-browse-group-card')
    await page.waitForTimeout(500)
    const hoverNoneMatches = await page.evaluate(() =>
      window.matchMedia('(hover: none)').matches,
    )
    const opacity = await page.$eval(
      '.paper-browse-group-actions',
      (el) => getComputedStyle(el).opacity,
    )
    const display = await page.$eval(
      '.paper-browse-group-actions',
      (el) => getComputedStyle(el).display,
    )
    console.log('[touch] matchMedia(hover:none) =', hoverNoneMatches)
    console.log('[touch] action-cluster opacity =', opacity, '(expect 1)')
    console.log('[touch] action-cluster display =', display, '(expect flex)')
    await page.screenshot({ path: `${QA_DIR}/touch-default.png`, fullPage: false })
    await context.close()
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
