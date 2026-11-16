#!/usr/bin/env node
// 顶栏换构件前后对照（构件厂第 4 步第一页）：在清点用的本地网站上走一遍有顶栏的页面，
// 拍顶栏、量顶栏里每个可点的东西，静止 / 悬停 / 键盘焦点各一份，宽屏 1440 和窄屏 390。
//
// 用法：node scripts/component-inventory/topbar-shots.mjs before
//       node scripts/component-inventory/topbar-shots.mjs after
// 输出：design/components-2026-11-13/migrate-topbar/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：topbar-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-topbar', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const PAGES = [
  ['home', '/'],
  ['detail', '/?view=detail&groupId=group-2026-i-reading-a'],
  ['browse', '/?view=browse'],
  ['paper-browse', '/?view=paper-browse&paperId=paper-2026-i'],
  ['draft-empty', '/?view=draft-paper'],
  ['my-space', '/?view=my-space'],
  ['vocab-notebook', '/?view=vocabulary-notebook'],
  ['vocab-review', '/?view=vocabulary-review'],
  ['admin', '/?view=admin'],
]
const NARROW = new Set(['home', 'draft-empty', 'my-space'])

// 顶栏里每个可点的东西：字、位置、实算样式；图标的左边位置用来看「返回找题」的箭头有没有挪。
function measureTopbar() {
  const bar = document.querySelector('header.topbar')
  if (!bar) return null
  const r0 = bar.getBoundingClientRect()
  const els = [...bar.querySelectorAll('button, a[href], select')].filter((e) => e.getClientRects().length)
  return {
    bar: { x: r0.x, y: r0.y, w: r0.width, h: r0.height },
    items: els.map((e) => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector('svg')
      return {
        text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '),
        cls: e.className && typeof e.className === 'string' ? e.className : '',
        x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        iconX: svg ? Math.round(svg.getBoundingClientRect().x * 10) / 10 : null,
        bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
        pad: `${cs.paddingLeft}/${cs.paddingRight}`, radius: cs.borderRadius, gap: cs.columnGap,
        outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      }
    }),
  }
}

async function shot(page, name) {
  const box = await page.locator('header.topbar').boundingBox()
  if (!box) return null
  const vw = page.viewportSize().width
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: Math.max(0, box.y - 8), width: vw, height: box.height + 16 } })
  return page.evaluate(measureTopbar)
}

// 悬停 / 焦点挑顶栏里的全站导航（不挑页面自己塞进来的按钮）：有「个人空间」用它，否则「退出」。
const NAV = 'header.topbar :is(button, a)'
async function navTarget(page) {
  for (const t of ['个人空间', '生词本', '退出']) {
    const l = page.locator(NAV).filter({ hasText: t }).first()
    if (await l.count()) return l
  }
  return null
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await login(page, rig.base)
    // 草稿卷要先有一份（空的就行），不然 ?view=draft-paper 会停在加载
    await page.evaluate(() => fetch('/api/draft-papers/current?create=1'))
    for (const [id, url] of PAGES) {
      if (suffix && !NARROW.has(id)) continue
      await page.goto(rig.base + url); await settle(page, 1800)
      await page.mouse.move(2, height - 2); await sleep(200)
      const rec = { rest: await shot(page, `${id}${suffix}`) }
      if (!rec.rest) { result[id + suffix] = { missing: true }; continue }
      const nav = await navTarget(page)
      if (nav && !suffix) {
        await nav.hover(); await sleep(350)
        rec.hover = await shot(page, `${id}-hover`)
        await page.mouse.move(2, height - 2); await sleep(250)
        await page.keyboard.press('Shift'); await nav.focus(); await sleep(200) // 先按一下键，程序给的焦点才算键盘焦点
        rec.focus = await shot(page, `${id}-focus`)
        await page.evaluate(() => document.activeElement?.blur())
      }
      const back = page.locator('header.topbar').getByRole('button', { name: '返回找题' })
      if (!suffix && await back.count()) {
        await back.hover(); await sleep(350)
        rec.backHover = await shot(page, `${id}-back-hover`)
        await page.mouse.move(2, height - 2); await sleep(250)
      }
      result[id + suffix] = rec
    }
    result[`errors${suffix}`] = errors
    await context.close()
  }
} finally {
  await browser.close(); await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT), Object.keys(result).length, '项')
process.exit(0)
