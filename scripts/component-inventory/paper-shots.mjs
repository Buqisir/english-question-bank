#!/usr/bin/env node
// 整卷预览换构件前后对照（构件厂第 4 步第三页）：拍整卷预览顶栏自己的键（讲评、下载 PDF）、讲评栏的
// 「配相似 / 相似篇章」、相似栏、出错页「返回找题」，以及别的页面里同一种 .similar-btn（详情页相似篇章面板、
// 草稿卷换篇栏）。静止 / 悬停 / 键盘焦点 / 按下态，宽屏 1440 和窄屏 390，并量出位置和实算样式。
//
// 用法：node scripts/component-inventory/paper-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-paper/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：paper-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-paper', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const PAPER = '/?view=paper-browse&paperId=paper-2026-i'

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope > svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null, iconW: svg ? round(svg.getBoundingClientRect().width) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius, gap: cs.columnGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      pressed: e.getAttribute('aria-pressed'), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
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

// rig 的卷子资产是 source-capture-v1 外壳（夹具从 canonical 库照搬），整卷预览在浏览器里直接读
// paper-asset.json 时拿不到 content.blocks，页面报「reading 'blocks'」打不开（清点第 2 步就记过，站点本身的缺口，
// 这里不修）。只在截图脚本里拦下这个请求，用服务端同一个投影函数（loadCanonicalSourceAssetRepresentation，
// 服务端找题组时也走它）先转成页面要的 PaperAsset 再交给页面。改前改后同一条路，对照有效。
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
async function projectPaperAssets(context) {
  await context.route(/\/paper-assets\/[^/]+\/versions\/v\d+\/paper-asset\.json$/, async (route) => {
    const res = await route.fetch()
    const m = /\/paper-assets\/([^/]+)\/versions\/(v\d+)\//.exec(new URL(route.request().url()).pathname)
    let body = await res.text()
    try {
      const { asset } = loadCanonicalSourceAssetRepresentation({ sourceAsset: JSON.parse(body), versionDir: path.join(RAW, 'rigdata/assets', m[1], 'versions', m[2]), label: 'rig', reject: (msg) => { throw new Error(msg) } })
      body = JSON.stringify(asset)
    } catch {}
    await route.fulfill({ response: res, body })
  })
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await projectPaperAssets(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const bar = page.locator('header.topbar')
    const topbarShot = async (name) => {
      const b = await bar.boundingBox()
      await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: Math.max(0, b.y - 8), width, height: b.height + 16 } })
    }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    await login(page, rig.base)
    await addDraftItems(page)

    // 1. 整卷预览顶栏
    await page.goto(rig.base + PAPER); await settle(page, 3000); await park()
    await topbarShot(`topbar${suffix}`)
    rec.topbar = await page.evaluate(measure, 'header.topbar :is(button, a, select)')
    const lecture = bar.getByRole('button', { name: '讲评', exact: true })
    const download = bar.getByRole('button', { name: /下载 PDF|生成 PDF 中/ })
    if (!suffix) {
      await step('lecture-hover', async () => { await lecture.hover(); await sleep(350); await topbarShot('topbar-lecture-hover'); rec.lectureHover = await page.evaluate(measure, 'header.topbar :is(button, a, select)') })
      await step('download-hover', async () => { await download.hover(); await sleep(350); await topbarShot('topbar-download-hover') })
      await step('download-focus', async () => {
        await park(); await page.keyboard.press('Shift'); await download.focus(); await sleep(200)
        await topbarShot('topbar-download-focus'); rec.downloadFocus = await page.evaluate(measure, 'header.topbar :is(button, a, select)')
        await page.evaluate(() => document.activeElement?.blur())
      })
    }

    // 2. 讲评打开：按下态
    await step('lecture-open', async () => {
      await lecture.click(); await sleep(900); await park()
      await topbarShot(`topbar-lecture-on${suffix}`)
      rec.lectureOn = await page.evaluate(measure, 'header.topbar :is(button, a, select)')
      if (!suffix) { await lecture.hover(); await sleep(350); await topbarShot('topbar-lecture-on-hover'); await park() }
    })

    // 3. 选一道阅读题，讲评栏出现「配相似 / 相似篇章」
    await step('similar-cta', async () => {
      // 用深链直接选中阅读 A 第 21 题（App.tsx 的 focusGroupId / questionId / lecture=1）。rig 里点卷面题目
      // 讲评栏不跟着选中（没查原因，深链和点选走同一个 selectLectureQuestion）。
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1'); await settle(page, 4000); await park()
      const cta = page.locator('.similar-cta button').first()
      await cta.waitFor({ timeout: 15000 }); await cta.scrollIntoViewIfNeeded(); await sleep(300)
      await shotAround(page, `similar-cta${suffix}`, [page.locator('.similar-cta').first()], 16)
      rec.similarCta = await page.evaluate(measure, '.similar-cta button')
      if (!suffix) {
        await cta.hover(); await sleep(350); await shotAround(page, 'similar-cta-hover', [page.locator('.similar-cta').first()], 16)
        await park(); await page.keyboard.press('Shift'); await cta.focus(); await sleep(200)
        await shotAround(page, 'similar-cta-focus', [page.locator('.similar-cta').first()], 16)
        await page.evaluate(() => document.activeElement?.blur())
      }
      // 4. 点进去：相似栏
      // 再加 similar=1 打开相似栏。rig 没有检索标注，栏里是出错态加「重试」（也是 .similar-btn）。
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1&similar=1')
      await page.locator('.similar-rail').first().waitFor({ timeout: 30000 }); await settle(page, 2500); await park()
      const rail = page.locator('.similar-rail').first()
      await shotAround(page, `similar-rail-head${suffix}`, [page.locator('.similar-rail-head').first()], 12)
      const foot = page.locator('.similar-rail-foot').first()
      if (await foot.count()) {
        await foot.scrollIntoViewIfNeeded(); await sleep(300)
        await shotAround(page, `similar-rail-foot${suffix}`, [foot], 12)
        const pick = page.locator('.similar-rail input[type=checkbox]').first()
        if (await pick.count()) { await pick.check({ force: true }); await sleep(400); await park(); await shotAround(page, `similar-rail-foot-picked${suffix}`, [foot], 12) }
      }
      rec.similarRail = await page.evaluate(measure, '.similar-rail :is(button, .eqb-button)')
      if (!suffix) await rail.screenshot({ path: path.join(OUT, 'similar-rail.png') }).catch(() => {})
    })

    // 5. 出错页
    await step('error', async () => {
      await page.goto(rig.base + '/?view=paper-browse&paperId=no-such-paper-zz'); await settle(page, 2500); await park()
      const box = page.locator('.paper-browse-error').first(); await box.waitFor({ timeout: 15000 })
      await shotAround(page, `error${suffix}`, [box], 16)
      rec.error = await page.evaluate(measure, '.paper-browse-error button')
      if (!suffix) {
        const back = box.getByRole('button', { name: '返回找题' })
        await back.hover(); await sleep(350); await shotAround(page, 'error-back-hover', [box], 16)
        await park(); await page.keyboard.press('Shift'); await back.focus(); await sleep(200)
        await shotAround(page, 'error-back-focus', [box], 16); rec.errorFocus = await page.evaluate(measure, '.paper-browse-error button')
        await page.evaluate(() => document.activeElement?.blur())
      }
    })

    // 6. 详情页的相似篇章面板（同一种 .similar-btn）。rig 里详情页没有「相似篇章」入口（题组没有 paperSurfaceHref），
    //    拍不到就记进 missing；同一个 SimilarPassagesPanel 在整卷预览的阅读相似栏里已经拍到。
    await step('detail-similar', async () => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-a'); await settle(page, 2500)
      await page.locator('[data-ra-entry="detail-view-similar"]').click({ timeout: 5000 }); await page.locator('.similar-rail').first().waitFor({ timeout: 30000 }); await settle(page, 2500); await park()
      const panel = page.locator('.similar-rail').first()
      await panel.scrollIntoViewIfNeeded(); await sleep(300)
      await shotAround(page, `detail-similar${suffix}`, [panel], 12)
      rec.detailSimilar = await page.evaluate(measure, '.similar-rail :is(button, .eqb-button)')
      if (!suffix) {
        const add = panel.locator('.similar-btn').first()
        if (await add.count()) { await add.hover(); await sleep(350); await shotAround(page, 'detail-similar-add-hover', [add], 24); await park() }
      }
    })

    // 7. 草稿卷换篇栏（同一种 .similar-btn）
    if (!suffix) await step('draft-swap', async () => {
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('[aria-label="换一篇相似篇章"]').first().waitFor({ timeout: 150000 }); await settle(page, 1500)
      await page.locator('[aria-label="换一篇相似篇章"]').first().click(); await page.locator('.draft-paper-rail--swap').waitFor({ timeout: 30000 }); await settle(page, 2500); await park()
      const swap = page.locator('.draft-paper-rail--swap').first()
      await swap.screenshot({ path: path.join(OUT, 'draft-swap.png') })
      rec.draftSwap = await page.evaluate(measure, '.draft-paper-rail--swap :is(button, .eqb-button)')
    })

    rec.errors = errors
    result[`w${width}`] = rec
    await context.close()
  }
} finally {
  await browser.close(); await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT)); for (const k in result) console.log(k, 'missing', result[k].missing, 'errors', result[k].errors.length)
process.exit(0)
