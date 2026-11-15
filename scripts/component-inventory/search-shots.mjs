#!/usr/bin/env node
// 搜索框构件（SearchField）换上前后对照（构件厂，2026-11-15）。
// 拍：首页大搜索框（静止、焦点、有字、出结果后）、浏览页紧凑搜索框（静止、焦点、有字、出结果后），
// 再加几种上一轮没拍的：提交键悬停、提交键 / 清除键键盘焦点、首页「正在连接本地题库」（输入框禁用）、听写页「搜索词组」。
// 宽屏 1440 和窄屏 390 各一遍。每个状态把搜索框里每个元素（含 ::placeholder）的实算样式整份记下来，
// 再从 Chrome 无障碍树取搜索框的读屏信息。
//
// 前几步的操作和 field-shots.mjs 一模一样（同样的点、按键、等待），拍出来的图要和 migrate-field/before 逐像素比。
//
// 用法：node scripts/component-inventory/search-shots.mjs <标签>
// 输出：.scratch/component-inventory/search/<标签>/（截图、styles.json、ax.json；不进仓库，search-compare.mjs 挑要留的抄进 design/）
// 端口：INVENTORY_PORT_OFFSET（这一轮用 63）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!label || !/^[\w-]+$/.test(label)) { console.error('用法：search-shots.mjs <标签>'); process.exit(2) }
const OUT = path.join(RAW, 'search', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

// 搜索框里每个元素的整份实算样式。data-inv（清点标记，带源码行号）和 id（useId 生成）不算样子，不记。
function dumpStyles(rootSelector) {
  const root = document.querySelector(rootSelector)
  if (!root) return null
  const els = [root, ...root.querySelectorAll('*')]
  const props = (cs) => { const o = {}; for (let i = 0; i < cs.length; i += 1) { const k = cs[i]; o[k] = cs.getPropertyValue(k) } return o }
  return els.map((e, i) => {
    const r = e.getBoundingClientRect()
    const rec = {
      i, tag: e.tagName.toLowerCase(), rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
      attrs: Object.fromEntries([...e.attributes].filter((a) => !['data-inv', 'id', 'for', 'class'].includes(a.name)).map((a) => [a.name, a.value])),
      style: props(getComputedStyle(e)),
    }
    if (e.tagName === 'INPUT') rec.placeholderStyle = props(getComputedStyle(e, '::placeholder'))
    return rec
  })
}

async function axOf(page, selector) {
  const loc = page.locator(selector).first()
  if (!(await loc.count())) return null
  return loc.ariaSnapshot().catch((e) => 'ERR ' + String(e).slice(0, 100))
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const styles = {}
const ax = {}
const missing = []
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const step = async (name, fn) => { try { await fn() } catch (e) { missing.push(`w${width} ${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    const shot = async (name, locator, pad = 16) => {
      const b = await locator.boundingBox()
      if (!b) throw new Error('看不见：' + name)
      const vp = page.viewportSize()
      const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
      await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`), clip: { x: x0, y: y0, width: Math.min(vp.width, b.x + b.width + pad) - x0, height: Math.min(vp.height, b.y + b.height + pad) - y0 } })
    }
    const record = async (name, root = 'form.concierge-intent-bar') => {
      styles[`${name}${suffix}`] = await page.evaluate(dumpStyles, root)
      ax[`${name}${suffix}`] = await axOf(page, root)
    }
    await login(page, rig.base)

    // ── 首页大搜索框（前几步和 field-shots.mjs 一样）──
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 2000); await blur(); await park()
      const bar = page.locator('.concierge-intent-bar')
      await page.screenshot({ path: path.join(OUT, `home-page${suffix}.png`) })
      await shot('home-search', bar)
      await record('home-search')
      await page.keyboard.press('Tab'); await page.locator('.concierge-intent-input').focus(); await sleep(250)
      await shot('home-search-focus', bar)
      await record('home-search-focus')
      await page.locator('.concierge-intent-input').fill('2026 阅读'); await sleep(250)
      await shot('home-search-typed', bar)
      await record('home-search-typed')
      // 以下是上一轮没拍的：提交键悬停、提交键键盘焦点、清除键键盘焦点
      await page.locator('.concierge-intent-submit').hover(); await sleep(300)
      await shot('home-search-submit-hover', bar)
      await record('home-search-submit-hover')
      await park()
      await page.locator('.concierge-intent-input').focus(); await page.keyboard.press('Tab'); await sleep(250)
      await shot('home-search-tab1', bar)
      await record('home-search-tab1')
      await page.keyboard.press('Tab'); await sleep(250)
      await shot('home-search-tab2', bar)
      await record('home-search-tab2')
      await page.locator('.concierge-intent-input').focus(); await sleep(150)
      await page.locator('.concierge-intent-input').press('Enter'); await settle(page, 3000); await blur(); await park()
      await shot('home-search-results', bar)
      await page.screenshot({ path: path.join(OUT, `home-results-page${suffix}.png`) })
      await record('home-search-results')
    })

    // ── 浏览页紧凑搜索框（前几步和 field-shots.mjs 一样）──
    await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await settle(page, 2000); await blur(); await park()
      const bar = page.locator('.concierge-intent-bar')
      await shot('browse-search', bar)
      await record('browse-search')
      await page.keyboard.press('Shift'); await page.locator('.concierge-intent-input').focus(); await sleep(250)
      await shot('browse-search-focus', bar)
      await record('browse-search-focus')
      await page.locator('.concierge-intent-input').fill('阅读'); await sleep(250)
      await shot('browse-search-typed', bar)
      await record('browse-search-typed')
      await page.screenshot({ path: path.join(OUT, `browse-page${suffix}.png`) })
      // 以下是上一轮没拍的
      await page.locator('.concierge-intent-submit').hover(); await sleep(300)
      await shot('browse-search-submit-hover', bar)
      await record('browse-search-submit-hover')
      await park()
      await page.locator('.concierge-intent-input').focus(); await page.keyboard.press('Tab'); await sleep(250)
      await shot('browse-search-tab1', bar)
      await record('browse-search-tab1')
      await page.keyboard.press('Tab'); await sleep(250)
      await shot('browse-search-tab2', bar)
      await record('browse-search-tab2')
      await page.locator('.concierge-intent-input').focus(); await sleep(150)
      await page.locator('.concierge-intent-input').press('Enter'); await settle(page, 3000); await blur(); await park()
      await shot('browse-search-results', bar)
      await page.screenshot({ path: path.join(OUT, `browse-results-page${suffix}.png`) })
      await record('browse-search-results')
    })

    // field-shots.mjs 在这里往草稿卷里加三组（拍草稿卷用）。照做：390 那一遍的首页、浏览页右下角草稿丸带数，
    // 首页还多出「最近」内容，不加就和 migrate-field/before 的 390 整页图对不上。
    await addDraftItems(page)

    // ── 首页「正在连接本地题库」：拦住题库数据接口，输入框禁用、提交键禁用 ──
    await step('home-loading', async () => {
      let release
      const gate = new Promise((r) => { release = r })
      const held = []
      const handler = async (route) => { held.push(route); await gate; await route.fallback().catch(() => {}) }
      await page.route(/\/api\/(groups|question-groups|catalog|bank)[^/]*(\?.*)?$/, handler)
      await page.goto(rig.base + '/'); await sleep(1500); await blur(); await park()
      const bar = page.locator('.concierge-intent-bar')
      const disabled = await page.locator('.concierge-intent-input').isDisabled()
      if (disabled) {
        await shot('home-search-loading', bar)
        await record('home-search-loading')
      } else {
        missing.push(`w${width} home-loading: 没拦到题库接口（输入框没禁用，拦了 ${held.length} 个请求）`)
      }
      release(); await page.unroute(/\/api\/(groups|question-groups|catalog|bank)[^/]*(\?.*)?$/, handler)
    })

    // ── 听写工作台「搜索词组」（这一轮判断它要不要换，换不换都拍）──
    await step('vocab-dictation', async () => {
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `vocab-dictation-page${suffix}.png`) })
      const search = page.locator('input[aria-label="搜索词组"]')
      if (await search.count()) {
        await shot('vocab-dictation-search', search.locator('xpath=..'), 12)
        styles[`vocab-dictation-search${suffix}`] = await page.evaluate(dumpStyles, 'input[aria-label="搜索词组"]')
      } else {
        missing.push(`w${width} vocab-dictation: 页面上没有「搜索词组」（测试数据里没有词汇，工作台不出列表）`)
      }
    })

    if (errors.length) missing.push(`w${width} 页面报错 ${errors.length} 条：${errors[0].slice(0, 200)}`)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'styles.json'), JSON.stringify(styles, null, 1) + '\n')
writeFileSync(path.join(OUT, 'ax.json'), JSON.stringify(ax, null, 1) + '\n')
writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify(missing, null, 1) + '\n')
console.log('missing', missing)
console.log('写到', OUT)
process.exit(0)
