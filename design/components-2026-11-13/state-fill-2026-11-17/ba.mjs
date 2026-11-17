import path from 'node:path'
const CI = '/home/user/english-question-bank/scripts/component-inventory'
const { requireFromApp } = await import(CI + '/lib.mjs')
const { startRig, WEB_PORT } = await import(CI + '/rig.mjs')
const { login, settle } = await import(CI + '/scenarios.mjs')
const { chromium } = requireFromApp('playwright')
const OUT = process.argv[2]; const base = `http://localhost:${WEB_PORT}`
const rig = await startRig({ quiet: true }); const browser = await chromium.launch({ channel: 'chromium' })
async function shot(p, name, hoverSel, clipSel, pad = 12) {
  const h = p.locator(hoverSel).first(); if (!(await h.count())) { console.log('miss', name); return }
  await h.scrollIntoViewIfNeeded(); await h.hover({ force: true }); await p.waitForTimeout(450)
  const b = await p.locator(clipSel).first().boundingBox()
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + 2 * pad, 700), height: Math.min(b.height + 2 * pad, 200) } })
}
try {
  for (const VW of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VW === 1440 ? 900 : 844 }, reducedMotion: 'reduce', deviceScaleFactor: 2 })
    const p = await ctx.newPage(); await login(p, base)
    await p.goto(base + '/'); await settle(p, 2000)
    const i = p.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(p, 3000)
    await shot(p, `${VW}-rowhead-hover`, '.concierge-paper-row.is-expanded .concierge-paper-row-head', '.concierge-paper-row.is-expanded .concierge-paper-row-head')
    await shot(p, `${VW}-expand-hover`, '.concierge-row-expand', '.concierge-paper-row-head')
    await p.goto(base + '/?view=browse'); await settle(p, 2000)
    await p.locator('.concierge-browse-chip').nth(1).click().catch(() => {}); await p.waitForTimeout(600)
    await shot(p, `${VW}-chip-pressed-hover`, ".eqb-chip[data-kind='toggle'][aria-pressed='true']", '.concierge-browse-chip >> xpath=..')
    await p.goto(base + '/?view=vocabulary-dictation-workbench'); await settle(p, 2500)
    await shot(p, `${VW}-dict-tab-hover`, '.dictation-workbench-tabs button >> nth=1', '.dictation-workbench-tabs')
    await ctx.close()
  }
} finally { await browser.close(); await rig.stop?.() }
