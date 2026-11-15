#!/usr/bin/env node
// 字段构件（输入框 / 搜索 / 下拉 / 选项字段）换上前后对照（构件厂，2026-11-14）。
// 拍：首页大搜索框（静止、焦点、有字带清除键）、浏览页紧凑搜索框、草稿卷顶栏的「PDF 版本」和「A4 / A3」、
// 版本菜单打开、「⋯」面板里的学生和最近草稿卷、「保存 PDF 到个人空间」对话框、听写工作台的搜索和下拉、管理页的名称框。
// 宽屏 1440 和窄屏 390 各一遍；量出实算样式（高、圆角、边、底、字号、内边距、焦点环）。
//
// 用法：node scripts/component-inventory/field-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-field/<before|after>/
// 端口：INVENTORY_PORT_OFFSET（这一轮用 62）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { ROOT } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：field-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-field', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      role: e.getAttribute('role'), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}

const focused = () => {
  const e = document.activeElement
  if (!e) return null
  return `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} ${(e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}`
}

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    // 个人空间文件夹换成固定的两个（只拦 GET），对话框里不点保存。
    const T = '2026-11-12T08:30:00.000Z'
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folders: [
        { id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T },
        { id: 'folder-b', name: '期中复习', artifactCount: 0, createdAt: T, updatedAt: T },
      ], artifacts: [] }) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    const shot = async (name, locator, pad = 16) => {
      const b = await locator.boundingBox()
      if (!b) throw new Error('看不见：' + name)
      const vp = page.viewportSize()
      const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
      await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`), clip: { x: x0, y: y0, width: Math.min(vp.width, b.x + b.width + pad) - x0, height: Math.min(vp.height, b.y + b.height + pad) - y0 } })
    }
    await login(page, rig.base)

    // ── 首页大搜索框 ──
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 2000); await blur(); await park()
      const bar = page.locator('.concierge-intent-bar')
      await page.screenshot({ path: path.join(OUT, `home-page${suffix}.png`) })
      await shot('home-search', bar)
      rec.homeBar = await page.evaluate(measure, '.concierge-intent-bar')
      rec.homeInput = await page.evaluate(measure, '.concierge-intent-input')
      await page.keyboard.press('Tab'); await page.locator('.concierge-intent-input').focus(); await sleep(250)
      await shot('home-search-focus', bar)
      rec.homeBarFocus = await page.evaluate(measure, '.concierge-intent-bar')
      await page.locator('.concierge-intent-input').fill('2026 阅读'); await sleep(250)
      await shot('home-search-typed', bar)
      rec.homeBarTyped = await page.evaluate(measure, '.concierge-intent-bar, .concierge-intent-input, .concierge-intent-submit, .concierge-intent-clear')
      await page.locator('.concierge-intent-input').press('Enter'); await settle(page, 3000); await blur(); await park()
      await shot('home-search-results', bar)
      await page.screenshot({ path: path.join(OUT, `home-results-page${suffix}.png`) })
    })

    // ── 浏览页紧凑搜索框 ──
    await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await settle(page, 2000); await blur(); await park()
      const bar = page.locator('.concierge-intent-bar')
      await shot('browse-search', bar)
      rec.browseBar = await page.evaluate(measure, '.concierge-intent-bar, .concierge-intent-input')
      await page.keyboard.press('Shift'); await page.locator('.concierge-intent-input').focus(); await sleep(250)
      await shot('browse-search-focus', bar)
      await page.locator('.concierge-intent-input').fill('阅读'); await sleep(250)
      await shot('browse-search-typed', bar)
      await page.screenshot({ path: path.join(OUT, `browse-page${suffix}.png`) })
    })

    // ── 草稿卷：PDF 版本、A4 / A3、⋯ 面板、存到个人空间 ──
    await addDraftItems(page)
    await step('draft', async () => {
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 180000 }); await settle(page, 1500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `draft-page${suffix}.png`) })
      const actions = page.locator('header.topbar .topbar-actions, header.topbar').first()
      await shot('draft-topbar', page.locator('header.topbar'), 0)
      rec.draftControls = await page.evaluate(measure, '.draft-product-control, .draft-product-control button, .draft-form-toggle, .draft-form-toggle button, .draft-form-toggle [role=radio]')
      void actions
    })
    if (!suffix) {
      await step('draft-version-open', async () => {
        const trigger = page.locator('header.topbar .draft-product-control button').first()
        await trigger.click(); await sleep(600)
        await page.screenshot({ path: path.join(OUT, `draft-version-open${suffix}.png`), clip: await (async () => { const a = await trigger.boundingBox(); const m = await page.locator('.draft-product-menu').boundingBox(); const x0 = Math.min(a.x, m.x) - 16, y0 = a.y - 16; return { x: x0, y: y0, width: Math.max(a.x + a.width, m.x + m.width) + 16 - x0, height: m.y + m.height + 16 - y0 } })() })
        rec.versionMenu = await page.evaluate(measure, '.draft-product-menu [role^=menuitem]')
        // 键盘：↓ 走一圈，记焦点（禁用项也停）
        const walk = []
        for (let i = 0; i < 5; i += 1) { await page.keyboard.press('ArrowDown'); await sleep(80); walk.push(await page.evaluate(focused)) }
        rec.versionMenuWalk = walk
        await page.keyboard.press('Escape'); await sleep(300)
        rec.focusAfterEsc = await page.evaluate(focused)
      })
      await step('draft-form-focus', async () => {
        const seg = page.locator('header.topbar .draft-form-toggle').first()
        await page.keyboard.press('Shift')
        await seg.locator('button, [role=radio]').first().focus(); await sleep(250)
        await shot('draft-form-focus', seg, 12)
        await blur(); await park()
        await seg.locator('button, [role=radio]').nth(1).hover(); await sleep(300)
        await shot('draft-form-hover', seg, 12)
        await park()
      })
    }
    await step('draft-more', async () => {
      await page.locator('.draft-more-menu-trigger').first().click(); await sleep(600)
      const panel = page.locator('.draft-more-menu-panel')
      await shot('draft-more-panel', panel)
      rec.morePanel = await page.evaluate(measure, '.draft-more-menu-panel input, .draft-more-menu-panel select, .draft-more-menu-panel label > span')
      await page.locator('.draft-more-menu-panel input').first().focus(); await sleep(250)
      await shot('draft-more-panel-focus', panel)
      await page.keyboard.press('Escape'); await sleep(300); await park()
    })
    await step('draft-space-dialog', async () => {
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(500)
      await page.getByRole('menuitem', { name: '保存 PDF 到个人空间' }).click()
      const dialog = page.locator('.draft-save-space-dialog')
      await dialog.waitFor(); await page.locator('.draft-save-space-dialog select option').nth(1).waitFor({ state: 'attached' }); await sleep(700)
      rec.spaceOpenFocus = await page.evaluate(focused)
      await blur(); await park()
      await shot('draft-space-dialog', dialog)
      rec.spaceFields = await page.evaluate(measure, '.draft-save-space-dialog input, .draft-save-space-dialog select, .draft-save-space-dialog label > span, .draft-save-space-dialog .eqb-field-label')
      await page.locator('.draft-save-space-dialog input').first().focus(); await sleep(250)
      await shot('draft-space-dialog-focus', dialog)
      await page.keyboard.press('Escape'); await sleep(500)
    })

    // ── 听写工作台（搜索词组、学生下拉、日期）──
    await step('vocab-dictation', async () => {
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `vocab-dictation-page${suffix}.png`) })
      const search = page.locator('input[aria-label="搜索词组"]')
      if (await search.count()) await shot('vocab-dictation-search', search.locator('xpath=..'), 12)
      rec.vocabFields = await page.evaluate(measure, 'main input, main select')
    })

    // ── 管理页 ──
    await step('admin', async () => {
      await page.goto(rig.base + '/?view=admin'); await settle(page, 2000); await blur(); await park()
      const form = page.locator('input[placeholder="例如：组卷 Agent"]').locator('xpath=ancestor::form[1]')
      await shot('admin-token-form', form, 12)
      rec.adminFields = await page.evaluate(measure, 'main input, main select')
    })

    rec.errors = errors
    result[`w${width}`] = rec
    console.log(`w${width} missing`, rec.missing, 'errors', errors.length)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
