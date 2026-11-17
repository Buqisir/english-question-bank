// 灰态样张：逐个悬停代表性元素，裁出周围一块，2x。用法 node states.mjs OUTDIR
import path from 'node:path'
const ROOT = '/home/user/english-question-bank'
const CI = path.join(ROOT, 'scripts/component-inventory')
const { requireFromApp } = await import(CI + '/lib.mjs')
const { startRig, WEB_PORT } = await import(CI + '/rig.mjs')
const { login, settle, sleep, addDraftItems } = await import(CI + '/scenarios.mjs')
const { chromium } = requireFromApp('playwright')
const OUT = process.argv[2]
const base = `http://localhost:${WEB_PORT}`
const search = async (p) => { const i = p.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(p, 3000) }
// [id, url, setup, hover-locator-fn, pad]
const CASES = [
  ['01-顶栏键', '/', null, (p) => p.locator('header.topbar').getByRole('button', { name: '生词本' }), 60],
  ['02-首页最近行', '/', null, (p) => p.locator('.eqb-row.home-row').first(), 24],
  ['03-结果卷行', '/', search, (p) => p.locator('.concierge-paper-row-head').first(), 24],
  ['04-结果题组行', '/', search, (p) => p.locator('.concierge-group-row-line').first(), 24],
  ['05-筛选键', '/', search, (p) => p.getByRole('button', { name: '筛选' }).first(), 40],
  ['06-浏览芯片', '/?view=browse', null, (p) => p.locator('.concierge-browse-chip').nth(1), 40],
  ['07-详情返回', '/?view=detail&groupId=group-2026-i-reading-a', null, (p) => p.getByRole('button', { name: '返回找题' }), 40],
  ['08-整卷左栏题组', '/?view=paper-browse&paperId=paper-2026-i', null, (p) => p.locator('.paper-browse-rail-group').first(), 40],
  ['09-听写左栏', '/?view=vocabulary-dictation-workbench', null, (p) => p.locator('.is-active').first().locator('xpath=..').locator('> *').nth(1), 40],
  ['10-菜单项', '/?view=detail&groupId=group-2026-i-reading-a', async (p) => { await p.getByRole('button', { name: '更多操作' }).first().click(); await sleep(500) }, (p) => p.locator('.eqb-menu-item').nth(1), 60],
]
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await login(p, base)
  try { await addDraftItems(p) } catch {}
  for (const [id, url, setup, loc, pad] of CASES) {
    try {
      await p.goto(base + url); await settle(p, 2000)
      if (setup) await setup(p)
      const l = loc(p); await l.scrollIntoViewIfNeeded({ timeout: 4000 }); await l.hover({ timeout: 4000, force: true }); await sleep(400)
      const bb = await l.boundingBox()
      const clip = { x: Math.max(0, bb.x - pad), y: Math.max(0, bb.y - pad), width: Math.min(bb.width + pad * 2, 900), height: bb.height + pad * 2 }
      await p.screenshot({ path: `${OUT}/${id}.png`, clip })
      console.error('ok', id)
    } catch (e) { console.error('没拍到', id, e.message.split('\n')[0]) }
  }
} finally { await browser.close(); await rig.stop?.() }
