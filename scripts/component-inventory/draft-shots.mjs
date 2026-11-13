#!/usr/bin/env node
// 草稿卷换构件前后对照（构件厂第 4 步第二页）：在清点用的本地网站上拍草稿卷里换掉的四处——
// 顶栏「⋯」键、「导出」菜单、空卷的「去找题」、题组工具条的「⋯」菜单——静止 / 悬停 / 打开 / 键盘焦点，
// 宽屏 1440 和窄屏 390，并量出每个东西的位置和实算样式。
//
// 用法：node scripts/component-inventory/draft-shots.mjs before
//       node scripts/component-inventory/draft-shots.mjs after
// 输出：design/components-2026-11-13/migrate-draft/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：draft-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-draft', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

// 前后都认得的选择器：换构件后「导出」键没有自己的类名，按读屏名字找；菜单面板换成 .eqb-menu。
const MENU_PANEL = '.draft-export-menu-panel, .draft-group-actions-menu-panel, .eqb-menu'
const GROUP_MORE = '[aria-label="更多题组操作"]'

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope > svg')
    return {
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role'),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius, gap: cs.columnGap,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow, opacity: cs.opacity,
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}

// 截图范围：几个东西的外包框四周各留 pad。
async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const bar = page.locator('header.topbar')
    const exportBtn = bar.getByRole('button', { name: '导出', exact: true })
    const moreBtn = page.locator('.draft-more-menu-trigger').first()
    const panel = page.locator(MENU_PANEL).first()
    const rec = {}
    await login(page, rig.base)

    // 1. 空卷：「去找题」主键
    await page.evaluate(async () => {
      const d = await (await fetch('/api/draft-papers/current?create=1')).json()
      for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    })
    await page.goto(rig.base + '/?view=draft-paper'); await page.getByText('还没有题组').first().waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
    await page.screenshot({ path: path.join(OUT, `empty${suffix}.png`) })
    const cta = page.getByRole('button', { name: '去找题' })
    rec.empty = { cta: await page.evaluate(measure, '.draft-a4-empty-cta, .draft-a4-empty .eqb-button') }
    if (!suffix) {
      await cta.hover(); await sleep(350)
      await shotAround(page, 'empty-cta-hover', [cta], 24)
      rec.empty.ctaHover = await page.evaluate(measure, '.draft-a4-empty-cta, .draft-a4-empty .eqb-button')
      await park(); await page.keyboard.press('Shift'); await cta.focus(); await sleep(200)
      await shotAround(page, 'empty-cta-focus', [cta], 24)
      rec.empty.ctaFocus = await page.evaluate(measure, '.draft-a4-empty-cta, .draft-a4-empty .eqb-button')
      await page.evaluate(() => document.activeElement?.blur())
    }

    // 2. 有题的卷：顶栏、题组工具条
    await addDraftItems(page)
    await page.goto(rig.base + '/?view=draft-paper'); await page.locator(GROUP_MORE).first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
    await page.screenshot({ path: path.join(OUT, `draft${suffix}.png`) })
    const barBox = await bar.boundingBox()
    await page.screenshot({ path: path.join(OUT, `topbar${suffix}.png`), clip: { x: 0, y: Math.max(0, barBox.y - 8), width, height: barBox.height + 16 } })
    rec.topbar = await page.evaluate(measure, 'header.topbar :is(button, select)')
    const strip = page.locator('.draft-group-actions').first()
    await strip.scrollIntoViewIfNeeded(); await sleep(400); await park()
    await shotAround(page, `strip${suffix}`, [strip], 24)
    rec.strip = await page.evaluate(measure, '.draft-group-actions')
    rec.stripButtons = await page.evaluate(measure, '.draft-group-actions button')

    // 3. 题组「⋯」：悬停、打开、键盘打开后的焦点
    const groupMore = page.locator(GROUP_MORE).first()
    await groupMore.hover(); await sleep(350)
    await shotAround(page, `strip-more-hover${suffix}`, [strip], 24)
    rec.groupMoreHover = await page.evaluate(measure, '[aria-label="更多题组操作"]')
    await groupMore.click(); await sleep(500); await park()
    await shotAround(page, `group-menu${suffix}`, [strip, panel], 24)
    rec.groupMenu = { panel: await page.evaluate(measure, '.draft-group-actions-menu-panel, .eqb-menu'), items: await page.evaluate(measure, ':is(.draft-group-actions-menu-panel, .eqb-menu) :is(button, a)'), trigger: await page.evaluate(measure, '[aria-label="更多题组操作"][aria-expanded="true"]') }
    const firstItem = page.locator(':is(.draft-group-actions-menu-panel, .eqb-menu) :is(button, a)').filter({ hasText: '下移' }).first()
    await firstItem.hover(); await sleep(350)
    await shotAround(page, `group-menu-item-hover${suffix}`, [strip, panel], 24)
    rec.groupMenuItemHover = await page.evaluate(measure, ':is(.draft-group-actions-menu-panel, .eqb-menu) :is(button, a)')
    await page.keyboard.press('Escape'); await sleep(300); await park()
    rec.groupMenuEscapeFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName)
    if (await page.locator(MENU_PANEL).count()) { await groupMore.click(); await sleep(300) } // 老写法 Esc 只在焦点在菜单里时关
    await groupMore.focus(); await page.keyboard.press('Enter'); await sleep(500)
    rec.groupMenuKeyboard = { focused: await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.getAttribute('aria-label') || '').trim()) }
    await page.keyboard.press('ArrowDown'); await sleep(150)
    rec.groupMenuKeyboard.afterArrowDown = await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.getAttribute('aria-label') || '').trim())
    await shotAround(page, `group-menu-keyboard${suffix}`, [strip, panel], 24)
    await page.keyboard.press('Escape'); await sleep(300)
    if (await page.locator(MENU_PANEL).count()) { await page.mouse.click(2, height - 2); await sleep(300) }
    await page.evaluate(() => document.activeElement?.blur())

    // 4. 顶栏「⋯」：悬停、打开
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
    if (await moreBtn.isVisible()) {
      await moreBtn.hover(); await sleep(350)
      rec.moreHover = await page.evaluate(measure, '.draft-more-menu-trigger')
      await page.screenshot({ path: path.join(OUT, `topbar-more-hover${suffix}.png`), clip: { x: 0, y: Math.max(0, barBox.y - 8), width, height: barBox.height + 16 } })
      await moreBtn.click(); await sleep(500); await park()
      rec.moreOpen = await page.evaluate(measure, '.draft-more-menu-trigger')
      await shotAround(page, `more-open${suffix}`, [moreBtn, page.locator('.draft-more-menu-panel')], 16)
      await page.keyboard.press('Escape'); await sleep(300)
      if (await page.locator('.draft-more-menu-panel[data-visible="true"]').count()) { await page.mouse.click(2, height - 2); await sleep(300) }
    }

    // 5. 「导出」：悬停、打开、悬停一项、键盘
    if (await exportBtn.isVisible()) {
      await exportBtn.hover(); await sleep(350)
      rec.exportHover = await page.evaluate(measure, 'header.topbar :is(.draft-export-menu-trigger, [aria-haspopup])')
      await exportBtn.click(); await sleep(500); await park()
      await shotAround(page, `export-menu${suffix}`, [exportBtn, panel], 16)
      rec.exportMenu = { panel: await page.evaluate(measure, '.draft-export-menu-panel, .eqb-menu'), items: await page.evaluate(measure, ':is(.draft-export-menu-panel, .eqb-menu) :is(button, a, [role=separator])') }
      const item = page.locator(':is(.draft-export-menu-panel, .eqb-menu) [role=menuitem]').nth(1)
      await item.hover(); await sleep(350)
      await shotAround(page, `export-menu-item-hover${suffix}`, [exportBtn, panel], 16)
      await page.keyboard.press('Escape'); await sleep(300)
      rec.exportEscapeFocus = await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.tagName || '').trim())
      if (await page.locator(MENU_PANEL).count()) { await exportBtn.click(); await sleep(300) }
      await exportBtn.focus(); await page.keyboard.press('Enter'); await sleep(500)
      rec.exportKeyboard = { focused: await page.evaluate(() => (document.activeElement?.innerText || '').trim()) }
      await page.keyboard.press('ArrowDown'); await sleep(150)
      rec.exportKeyboard.afterArrowDown = await page.evaluate(() => (document.activeElement?.innerText || '').trim())
      await shotAround(page, `export-menu-keyboard${suffix}`, [exportBtn, panel], 16)
      await page.keyboard.press('Escape'); await sleep(300)
    }
    rec.errors = errors
    result[`w${width}`] = rec
    await context.close()
  }
} finally {
  await browser.close(); await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
