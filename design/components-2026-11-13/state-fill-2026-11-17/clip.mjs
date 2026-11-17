import path from 'node:path'
const ROOT = '/home/user/english-question-bank'
const CI = path.join(ROOT, 'scripts/component-inventory')
const { requireFromApp } = await import(CI + '/lib.mjs')
const { startRig, WEB_PORT } = await import(CI + '/rig.mjs')
const { login, settle } = await import(CI + '/scenarios.mjs')
const { chromium } = requireFromApp('playwright')
const OUT = process.argv[2]
const base = `http://localhost:${WEB_PORT}`
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
try {
  for (const VW of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VW === 1440 ? 900 : 844 }, reducedMotion: 'reduce' })
    const p = await ctx.newPage(); await login(p, base)
    await p.goto(base + '/?view=vocabulary-dictation-workbench'); await settle(p, 2500)
    const tabs = p.locator('.dictation-workbench-tabs button')
    const n = await tabs.count()
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).hover(); await p.waitForTimeout(400)
      const r = await p.evaluate(() => {
        const list = document.querySelector('.dictation-workbench-tabs'); const bc = getComputedStyle(list, '::before')
        const lr = list.getBoundingClientRect(); const m = new DOMMatrix(bc.transform)
        const s = { x: lr.left + m.m41 - list.scrollLeft, y: lr.top + m.m42, w: parseFloat(bc.width), h: parseFloat(bc.height) }
        // 找最近的裁切祖先（含自身）
        let clip = null
        for (let e = list; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflowY)) { const b = e.getBoundingClientRect(); clip = { cls: e.className, x: b.left, y: b.top, w: b.width, h: b.height }; break } }
        const ok = !clip || (s.x >= clip.x - .5 && s.y >= clip.y - .5 && s.x + s.w <= clip.x + clip.w + .5 && s.y + s.h <= clip.y + clip.h + .5)
        const act = document.querySelector('.dictation-workbench-tabs button[data-fluid-hover-active]')
        const ab = act.getBoundingClientRect()
        return { tab: act.textContent.trim(), slider: s, btn: { x: ab.left, w: ab.width }, clip, ok }
      })
      console.log(VW, JSON.stringify({ tab: r.tab, sx: r.slider.x.toFixed(1), sw: r.slider.w, sh: r.slider.h, bx: r.btn.x.toFixed(1), bw: r.btn.w, clip: r.clip && r.clip.cls.slice(0, 40), ok: r.ok }))
      if (i === 0) await p.locator('.dictation-workbench-tabs').screenshot({ path: `${OUT}/dict-tab-${VW}.png` })
    }
    await ctx.close()
  }
} finally { await browser.close(); await rig.stop?.() }
