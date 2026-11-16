#!/usr/bin/env node
// 构件清点 · 验漏：在浏览页塞三个已知的「种子」，看 analyze.mjs 能不能把它们找对。
//   A 全新的样子（品红底、3px 圆角、11px 字）    → 应当自成一种，并被标出圆角不在家族、颜色不在色阶
//   B 照抄页面上一个真按钮，圆角 +0.5px、字色红 +2 → 应当并进那个按钮所在的一种，并标成走样
//   C 照抄同一个按钮，一点不改                    → 应当并进同一种，且不算走样（对照组）
// 输出：.scratch/component-inventory/seeds.json。用法：node scripts/component-inventory/seeds.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle } from './scenarios.mjs'
import { collectInPage } from './collect.mjs'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
  await login(page, rig.base)
  await page.goto(rig.base + '/?view=browse'); await settle(page, 2000)
  const planted = await page.evaluate(() => {
    // 参照：页面上第一个看得见、有类名、有字的按钮（固定顺序，重跑同一个）
    const ref = [...document.querySelectorAll('button[data-inv][class]')].find((b) => { const r = b.getBoundingClientRect(); return r.width > 20 && r.height > 20 && b.innerText.trim() })
    const a = document.createElement('button'); a.textContent = '种子A'; a.setAttribute('data-inv', '__seed__:novel:1')
    Object.assign(a.style, { background: '#ff00aa', color: '#ffffff', border: '0', borderRadius: '3px', padding: '3px 9px', fontSize: '11px', margin: '8px' })
    ;(document.querySelector('main') || document.body).prepend(a)
    if (!ref) return { ref: null }
    const cs = getComputedStyle(ref)
    const b = ref.cloneNode(true); b.setAttribute('data-inv', '__seed__:near:1')
    b.style.borderRadius = (parseFloat(cs.borderTopLeftRadius) + 0.5) + 'px'
    const c0 = cs.color.match(/\d+/g).map(Number); b.style.color = `rgb(${Math.min(255, c0[0] + 2)}, ${c0[1]}, ${c0[2]})`
    const c = ref.cloneNode(true); c.setAttribute('data-inv', '__seed__:exact:1')
    ref.after(c); ref.after(b)
    return { ref: ref.getAttribute('data-inv'), refClass: ref.className, refText: ref.innerText.trim().slice(0, 30), refRadius: cs.borderTopLeftRadius, refColor: cs.color }
  })
  const recs = await page.evaluate(collectInPage, { scenario: '__seed__', width: 1440 })
  const records = recs.filter((r) => r.inv.startsWith('__seed__') || r.inv === planted.ref)
  writeFileSync(path.join(RAW, 'seeds.json'), JSON.stringify({ planted, records }, null, 1))
  console.log(JSON.stringify(planted), records.map((r) => r.inv).join(' '))
} finally { await browser.close(); await rig.stop(); process.exit(0) }
