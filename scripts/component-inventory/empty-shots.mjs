#!/usr/bin/env node
// 空状态换成共用构件 EmptyState 前后对照（构件厂，2026-11-14）。
// 拍这几处「还没东西」和「没找到」：找题没找到、题库一套卷都没有、草稿卷还没有题组（纸上 + 左栏）、
// 个人空间没有文件、生词本没有卷、单词复习的「还没有词组」「还没有听写」。宽屏 1440 和窄屏 390 各拍一遍。
// 每处出两张：整屏 <处>-<宽>.png，和框住空态的 <处>-<宽>-crop.png；量出空态各部分的位置和实算样式。
// after 另拍「没找到」卡片里獭獭 110 宽和 128 宽两种（脚本里改 CSS 变量，不改代码）。
//
// 用法：INVENTORY_PORT_OFFSET=59 node scripts/component-inventory/empty-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-empty/<before|after>/
// 测试站用默认四篇阅读的种子就够（「没找到」靠搜一串乱码；题库空、个人空间空靠拦接口）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { ROOT } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：empty-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-empty', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

// 空态在页面上的框：before 是各页自己的类名，after 是 .eqb-empty-state（「没找到」那一行 before 是 p.concierge-empty）。
const BOX = {
  'home-noresult': '.concierge-results .eqb-empty-state, .concierge-results .concierge-empty',
  'home-empty-corpus': '.concierge-default-feed .eqb-empty-state, .concierge-feed-empty-corpus',
  // 草稿卷：after 框外面那层居中框（和 before 的 .draft-a4-empty.is-blank 是同一块地方），两边裁得一样大。
  'draft-empty': '.draft-a4-sheet .draft-a4-empty:has(.eqb-empty-state), .draft-a4-empty.is-blank',
  'draft-rail-empty': '.draft-paper-rail-empty',
  'my-space-empty': '.my-space-main .eqb-empty-state, .my-space-empty-state',
  'notebook-empty': '.notebook-main .eqb-empty-state, .notebook-empty-state',
  'dictation-sets-empty': '.dictation-set-list .eqb-empty-state, .dictation-empty-state.is-blank',
  'dictation-tasks-empty': '.dictation-task-queue .eqb-empty-state, .dictation-empty-state.is-blank',
}

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  const box = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!box) return null
  const one = (e) => {
    if (!e) return null
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(), cls: typeof e.className === 'string' ? e.className : (e.getAttribute('class') || ''),
      text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, gap: cs.gap, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow, anim: cs.animationName === 'none' ? null : cs.animationName,
    }
  }
  const art = box.querySelector('svg, img')
  const artWrap = art?.parentElement !== box ? art?.parentElement : null
  return {
    box: one(box),
    art: one(art), artWrap: one(artWrap),
    text: one(box.querySelector('p')),
    action: one(box.querySelector('button')),
  }
}

async function shotAround(page, file, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b && b.width && b.height) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const sy = await page.evaluate(() => scrollY)
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, file), clip: { x: x0, y: y0 + sy, width: x1 - x0, height: y1 - y0 }, fullPage: true })
  return true
}

const clearDraft = (page) => page.evaluate(async () => {
  const d = await (await fetch('/api/draft-papers/current?create=1')).json()
  for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
})

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const result = {}
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    // 题库空：只在 corpusEmpty 打开时把题组列表接口回成空。个人空间：列表接口固定回空。
    let corpusEmpty = false
    await context.route(/\/api\/question-groups(\?[^/]*)?$/, (r) => (corpusEmpty && r.request().method() === 'GET' ? r.fulfill({ json: { questionGroups: [] } }) : r.fallback()))
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { folders: [], artifacts: [] } }) : r.fallback()))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const rec = { missing: [] }
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(200) }
    const scene = async (name, go) => {
      try {
        await go()
        await park()
        const sel = BOX[name]
        const box = page.locator(sel).first()
        await box.waitFor({ timeout: 15000 })
        await box.scrollIntoViewIfNeeded(); await sleep(300)
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`) })
        // 「没找到」卡片的獭獭在卡片框外面（上沿以上），一起框进来。
        await shotAround(page, `${name}-${width}-crop.png`, [box, page.locator(`${sel.split(',')[0]} img`).first()], 16)
        rec[name] = await page.evaluate(measure, sel)
      } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`) }
    }

    await login(page, rig.base)

    await scene('home-noresult', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1200)
      const i = page.locator('.concierge-intent-input:not([disabled])'); await i.waitFor({ timeout: 30000 })
      await i.fill('zzqqxx 不存在的题'); await i.press('Enter'); await settle(page, 2000)
    })
    if (label === 'after') {
      // 第 119 条：摊手图的 viewBox 比另外三张半身宽，宽度要放大约 1.17 倍头脸才一样大。110 和 128 两种各拍一张。
      for (const w of [110, 128]) {
        try {
          await page.evaluate((px) => document.documentElement.style.setProperty('--eqb-empty-otter-not-found-width', `${px}px`), w)
          await sleep(300)
          const box = page.locator(BOX['home-noresult']).first()
          await shotAround(page, `home-noresult-${width}-otter${w}.png`, [box, page.locator('.concierge-results .eqb-empty-state img').first()], 16)
          rec[`home-noresult-otter${w}`] = await page.evaluate(measure, BOX['home-noresult'])
        } catch (e) { rec.missing.push(`otter${w}: ${String(e).split('\n')[0].slice(0, 200)}`) }
      }
      await page.evaluate(() => document.documentElement.style.removeProperty('--eqb-empty-otter-not-found-width'))
    }

    await scene('home-empty-corpus', async () => {
      corpusEmpty = true
      await page.goto(rig.base + '/'); await settle(page, 1500)
    })
    corpusEmpty = false

    await scene('draft-empty', async () => {
      await clearDraft(page)
      await page.goto(rig.base + '/?view=draft-paper'); await page.getByText('还没有题组').first().waitFor({ timeout: 30000 }); await settle(page, 1200)
    })
    // 左栏那一行没换（见 README），也拍下来作对照。只拍宽屏：窄屏左栏收起。
    if (width > 600) await scene('draft-rail-empty', async () => {})

    await scene('my-space-empty', async () => { await page.goto(rig.base + '/?view=my-space'); await settle(page, 1500) })
    await scene('notebook-empty', async () => { await page.goto(rig.base + '/?view=vocabulary-notebook'); await settle(page, 1500) })
    await scene('dictation-sets-empty', async () => { await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 1500) })
    await scene('dictation-tasks-empty', async () => {
      await page.locator('.dictation-workbench-tabs button').filter({ hasText: '听写' }).first().click(); await settle(page, 1200)
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
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1))
console.log('写到', path.relative(ROOT, OUT))
