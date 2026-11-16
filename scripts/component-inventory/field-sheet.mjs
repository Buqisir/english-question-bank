#!/usr/bin/env node
// 字段构件样张：把 Field.tsx / OptionField.tsx 的各个变体和状态真渲染出来拍下（1440 和 390 各一张）。
// 悬停、键盘焦点用 CDP CSS.forcePseudoState 强制；分段选择的悬停用真鼠标（滑块是 JS 画的）；
// 「打开」那一格真点开菜单。舞台见 field-harness.mjs。
// 用法：node scripts/component-inventory/field-sheet.mjs
// 输出：design/components-2026-11-13/migrate-field/sheet-field-new.png、sheet-field-new-390.png
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { buildHarness, serveHarness } from './field-harness.mjs'

const OUT_DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-field')
await buildHarness()
const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ channel: 'chromium' })
try {
  for (const [width, suffix] of [[1440, ''], [390, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const url = await serveHarness(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url); await page.locator('main').waitFor()
    await page.evaluate(() => document.fonts.ready)
    // 菜单在 body 上 fixed 定位：先把「打开」那一格滚到视口里点开，整页截图时页面不滚（fullPage 截的是整张画布）。
    const cdp = await context.newCDPSession(page)
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    for (const [force, pseudo] of [['hover', ['hover']], ['focus', ['focus', 'focus-visible']]]) {
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `.cell[data-force="${force}"] :is(.eqb-field-control, [role=radio][aria-checked=true])` })
      for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
    }
    await page.locator('#seg-hover [role=radio][aria-checked=false]').hover()
    await page.waitForTimeout(300)
    const shotA = path.join(OUT_DIR, `sheet-field-new${suffix}.png`)
    await page.screenshot({ path: shotA, fullPage: true })
    // 打开的菜单单独一张（fixed 定位的弹层在整页截图里会跟着视口走，单拍那一块最准）。
    // 菜单遇到页面滚动就收（Menu 的规矩）：先滚到位、等滚动事件过去再点。
    await page.locator('#menu-open').scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
    await page.locator('#menu-open .eqb-option-select-trigger').click()
    const menu = page.locator('.eqb-option-menu')
    await menu.waitFor(); await page.waitForTimeout(300)
    const a = await page.locator('#menu-open').boundingBox(), m = await menu.boundingBox()
    const x0 = Math.max(0, Math.min(a.x, m.x) - 12), y0 = Math.max(0, a.y - 12)
    await page.screenshot({ path: path.join(OUT_DIR, `sheet-field-menu-open${suffix}.png`), clip: { x: x0, y: y0, width: Math.min(width, Math.max(a.x + a.width, m.x + m.width) + 12) - x0, height: m.y + m.height + 12 - y0 } })
    console.log(width, errors.length ? errors : 'ok', shotA)
    await context.close()
  }
} finally {
  await browser.close()
}
