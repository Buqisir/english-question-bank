#!/usr/bin/env node
// 首页的按钮换构件前后对照（构件厂第 4 步第八页）：搜索框里的「清除搜索」✕、「浏览全部 N 套卷」入口、
// 结果页的「筛选」开关。拍静止、悬停、键盘焦点、筛选展开，宽屏 1440 和窄屏 390；量出位置和实算样式。
// 胶囊、行内「清除筛选」、结果行这次没换，只在整页图里带上。
//
// 用法：node scripts/component-inventory/home-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-home/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：home-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-home', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null, iconW: svg ? round(svg.getBoundingClientRect().width) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, cursor: cs.cursor, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined, expanded: e.getAttribute('aria-expanded') || undefined,
    }
  })
}

const focused = () => {
  const e = document.activeElement
  return e ? `${e.tagName.toLowerCase()} ${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30)}` : null
}

async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 前后都认得的选择器：换构件后三个键还挂着原来的类名当钩子。
const CLEAR = '[aria-label="清除搜索"]'
const ENTRY = '.concierge-browse-entry'
const FILTER = '.concierge-command-filter-toggle'
const BAR = '.concierge-command-bar'

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
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    // 截图范围：「筛选」在结果页不在搜索框那一行（.concierge-command-bar）的框里，所以它的几张图围着它自己截，四周多留一些。
    const states = async (key, locator, around, full) => {
      await shotAround(page, `${key}${suffix}`, around, 16)
      rec[key] = await page.evaluate(measure, locator)
      if (!full) return
      await page.locator(locator).first().hover(); await sleep(350)
      await shotAround(page, `${key}-hover`, around, 16)
      rec[`${key}Hover`] = (await page.evaluate(measure, locator))[0]
      await park()
      await keyFocus(page.locator(locator).first())
      await shotAround(page, `${key}-focus`, around, 16)
      rec[`${key}Focus`] = (await page.evaluate(measure, locator))[0]
      await blur()
    }
    await login(page, rig.base)

    // 1. 首页：「浏览全部 N 套卷」；输入框里打了字以后出「清除搜索」✕
    await step('home', async () => {
      await page.goto(rig.base + '/'); await page.locator(`${ENTRY}:not(:disabled)`).waitFor({ timeout: 30000 }); await settle(page, 1500)
      await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `home${suffix}.png`) })
      await states('entry', ENTRY, [page.locator(BAR), page.locator(ENTRY)], !suffix)
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await sleep(300); await blur(); await park()
      await states('clear', CLEAR, [page.locator(BAR)], !suffix)
      rec.clearInBar = await page.evaluate(measure, `${BAR} :is(input, button)`)
      if (!suffix) {
        await page.locator(CLEAR).click(); await sleep(300)
        rec.afterClear = { focus: await page.evaluate(focused), value: await input.inputValue() }
      }
    })

    // 2. 结果页：「筛选」开关（静止、悬停、键盘焦点、展开）
    await step('results', async () => {
      await page.goto(rig.base + '/'); await page.locator(`${ENTRY}:not(:disabled)`).waitFor({ timeout: 30000 }); await settle(page, 1000)
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator(FILTER).waitFor({ timeout: 20000 }); await settle(page, 1500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `results${suffix}.png`) })
      await states('filter', FILTER, [page.locator(FILTER)], !suffix)
      await page.locator(FILTER).click(); await sleep(500); await park()
      await shotAround(page, `filter-open${suffix}`, [page.locator(FILTER)], 16)
      rec.filterOpen = await page.evaluate(measure, FILTER)
      rec.filterOpenFocus = await page.evaluate(focused)
      if (!suffix) {
        await page.locator(FILTER).hover(); await sleep(350)
        await shotAround(page, 'filter-open-hover', [page.locator(FILTER)], 16)
        rec.filterOpenHover = (await page.evaluate(measure, FILTER))[0]
        await park()
        // 选一个筛选，看开关上的计数「筛选 · 1」
        const chip = page.locator('.concierge-starter-chip:not(.is-zero)').first()
        if (await chip.count()) {
          await chip.click(); await sleep(800); await park()
          await page.screenshot({ path: path.join(OUT, 'filter-panel-chosen.png') })
          await page.locator(FILTER).click(); await sleep(500); await park()
          await shotAround(page, 'filter-count', [page.locator(FILTER)], 16)
          rec.filterCount = await page.evaluate(measure, FILTER)
        }
      }
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
