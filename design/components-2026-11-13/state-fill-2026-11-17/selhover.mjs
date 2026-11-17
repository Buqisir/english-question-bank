import path from 'node:path'
const ROOT = '/home/user/english-question-bank'
const CI = path.join(ROOT, 'scripts/component-inventory')
const { requireFromApp } = await import(CI + '/lib.mjs')
const { startRig, WEB_PORT } = await import(CI + '/rig.mjs')
const { login, settle, addDraftItems } = await import(CI + '/scenarios.mjs')
const { chromium } = requireFromApp('playwright')
const OUT = process.argv[2]; const base = `http://localhost:${WEB_PORT}`
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const bg = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; return getComputedStyle(e).backgroundColor }, sel)
async function check(p, label, sel, shot) {
  const loc = p.locator(sel).first()
  if (!(await loc.count())) { console.log(label, 'NOT FOUND'); return }
  await p.mouse.move(2, 2); await p.waitForTimeout(300)
  const rest = await bg(p, sel)
  await loc.scrollIntoViewIfNeeded(); await loc.hover({ force: true }); await p.waitForTimeout(400)
  const hov = await bg(p, sel)
  console.log(label, 'rest', rest, 'hover', hov, rest !== hov ? 'CHANGES' : 'SAME')
  if (shot) { const b = await loc.boundingBox(); await p.screenshot({ path: `${OUT}/selhover-${shot}.png`, clip: { x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 12), width: Math.min(b.width + 32, 600), height: b.height + 24 } }) }
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 2 })
  const p = await ctx.newPage(); await login(p, base)
  try { await addDraftItems(p) } catch (e) { console.error('draft', e.message) }
  await p.goto(base + '/'); await settle(p, 2000)
  const i = p.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(p, 3000)
  await check(p, 'expanded row head', '.concierge-paper-row.is-expanded .concierge-paper-row-head', 'rowhead')
  await p.goto(base + '/?view=browse'); await settle(p, 2000)
  await p.locator('.concierge-browse-chip').nth(1).click().catch(() => {}); await p.waitForTimeout(600)
  await check(p, 'chip pressed', ".eqb-chip[data-kind='toggle'][aria-pressed='true']", 'chip')
  await p.goto(base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(p, 2500)
  await check(p, 'sa-main pressed', ".sa-main-btn[aria-pressed='true']", null)
  await p.goto(base + '/?view=draft-paper'); await settle(p, 2500)
  const sw = p.locator('.draft-group-actions button', { hasText: '换篇' }).first()
  if (await sw.count()) { await sw.click().catch(() => {}); await p.waitForTimeout(800) }
  await check(p, 'draft 换篇 pressed', ".draft-group-actions button[aria-pressed='true']", 'draftswap')
  await p.goto(base + '/?view=vocabulary-dictation-workbench'); await settle(p, 2500)
  await check(p, 'dictation set selected', '.dictation-set-row.is-selected', 'setrow')
  await check(p, 'review row active', '.dictation-review-row button.is-active', null)
  await ctx.close()
} finally { await browser.close(); await rig.stop?.() }
