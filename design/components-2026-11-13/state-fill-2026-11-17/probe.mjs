// 灰态清点：每页把可点元素逐个悬停，记录悬停/选中时的底色、下面的底色、圆角、尺寸。
import path from 'node:path'
import fs from 'node:fs'
const ROOT = '/home/user/english-question-bank'
const CI = path.join(ROOT, 'scripts/component-inventory')
const { requireFromApp } = await import(CI + '/lib.mjs')
const { startRig, WEB_PORT } = await import(CI + '/rig.mjs')
const { login, settle, sleep, addDraftItems } = await import(CI + '/scenarios.mjs')
const { chromium } = requireFromApp('playwright')
const OUT = process.argv[2]; const VW = Number(process.argv[3] || 1440)
const base = `http://localhost:${WEB_PORT}`
const PAGES = [
  ['home', '/', null],
  ['home-results', '/', async (p) => { const i = p.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(p, 3000) }],
  ['browse', '/?view=browse', null],
  ['detail', '/?view=detail&groupId=group-2026-i-reading-a', null],
  ['paper-browse', '/?view=paper-browse&paperId=paper-2026-i', null],
  ['paper-lecture', '/?view=paper-browse&paperId=paper-2026-i&lecture=1', null],
  ['draft', '/?view=draft-paper', null],
  ['my-space', '/?view=my-space', null],
  ['vocab-notebook', '/?view=vocabulary-notebook', null],
  ['vocab-review', '/?view=vocabulary-review', null],
  ['vocab-practice', '/?view=vocabulary-practice', null],
  ['vocab-dictation', '/?view=vocabulary-dictation-workbench', null],
  ['admin', '/?view=admin', null],
]
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const rows = []
const MARK = 'data-gp'
try {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VW === 1440 ? 900 : 844 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await login(p, base)
  try { await addDraftItems(p) } catch (e) { console.error('draft items', e.message) }
  for (const [id, url, extra] of PAGES) {
    await p.goto(base + url); await settle(p, 2500)
    if (extra) await extra(p).catch((e) => console.error(id, e.message))
    const n = await p.evaluate((MARK) => {
      const sel = 'button, a[href], summary, [role=menuitem], [role=tab], [role=option], [role=button], [role=radio], [role=checkbox], label:has(input[type=checkbox]), .eqb-row'
      let i = 0
      for (const e of document.querySelectorAll(sel)) {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
        if (r.width < 6 || r.height < 6 || cs.visibility === 'hidden' || cs.display === 'none') continue
        e.setAttribute(MARK, String(i++))
      }
      return i
    }, MARK)
    const info = (k) => p.evaluate(([MARK, k]) => {
      const e = document.querySelector(`[${MARK}="${k}"]`); if (!e) return null
      const bgOf = (el) => { for (let x = el; x; x = x.parentElement) { const b = getComputedStyle(x).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return { b, x } } return { b: 'rgb(255, 255, 255)', x: null } }
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect()
      const list = e.closest('.fluid-hover-list'); let fh = null
      if (list) { const lc = getComputedStyle(list); const bc = getComputedStyle(list, '::before'); fh = { bw: bc.width, bh: bc.height, br: bc.borderTopLeftRadius, inside: (() => { const lr = list.getBoundingClientRect(); const m = new DOMMatrix(bc.transform); const x = m.m41, y = m.m42; return x >= -0.5 && y >= -0.5 && x + parseFloat(bc.width) <= lr.width + 0.5 + list.scrollLeft && y + parseFloat(bc.height) <= lr.height + 0.5 + list.scrollTop })(), o: lc.getPropertyValue('--fh-o').trim(), w: lc.getPropertyValue('--fh-w').trim(), h: lc.getPropertyValue('--fh-h').trim(), r: lc.getPropertyValue('--fh-radius').trim(), bg: bc.backgroundColor, under: bgOf(list).b } }
      const own = cs.backgroundColor
      const under = e.parentElement ? bgOf(e.parentElement).b : 'rgb(255, 255, 255)'
      const name = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)
      const cls = (typeof e.className === 'string' ? e.className : '').split(/\s+/).slice(0, 3).join('.')
      const st = ['aria-current', 'aria-selected', 'aria-pressed', 'aria-expanded', 'aria-checked'].map((a) => e.getAttribute(a) ? a.slice(5) + '=' + e.getAttribute(a) : '').filter(Boolean).join(' ')
      return { name, tag: e.tagName.toLowerCase(), cls, st, own, under, radius: cs.borderTopLeftRadius, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), color: cs.color, fh }
    }, [MARK, k])
    const max = Math.min(n, 160)
    for (let k = 0; k < max; k++) {
      const before = await info(k); if (!before) continue
      const loc = p.locator(`[${MARK}="${k}"]`)
      try { await loc.scrollIntoViewIfNeeded({ timeout: 1500 }); await loc.hover({ timeout: 1500, force: true }) } catch { continue }
      await sleep(180)
      const after = await info(k); if (!after) continue
      const fhOn = after.fh && after.fh.o === '1'
      const changed = after.own !== before.own && after.own !== 'rgba(0, 0, 0, 0)'
      const selectedRest = before.own !== 'rgba(0, 0, 0, 0)' && before.own !== before.under && /current|selected=true|pressed=true|checked=true/.test(before.st + before.cls)
      if (changed || fhOn || selectedRest) rows.push({ page: id, k, ...after, rest: before.own, kind: fhOn ? 'slider' : changed ? 'hover' : 'selected' })
      await p.mouse.move(2, 2)
    }

    console.error(id, n, rows.filter((r) => r.page === id).length)
  }
} finally { await browser.close(); await rig.stop?.() }
fs.writeFileSync(`${OUT}/hover-${VW}.json`, JSON.stringify(rows, null, 1))
