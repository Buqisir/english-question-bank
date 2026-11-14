#!/usr/bin/env node
// 整卷预览剩下的按钮换构件前后对照（构件厂第 4 步第九页）：顶栏「PDF Screen」链接，以及顶栏下面那排
// 「检查这份卷」（PaperReviewControls：复制试卷信息、刷新、刷新 PDF 版本、查看 PDF）。拍静止、悬停、键盘焦点，
// 宽屏 1440 和窄屏 390；量出位置和实算样式。
//
// 这几个键在清点用的本地网站里平时出不来，脚本拦了几个接口让它们出现（只在截图里，站点不改）：
// - PDF 版本清单（/api/exports/papers/…/products）：本地网站没有 PDF 产品，接口报错，「PDF Screen」不出现。
//   这里照请求里的发布摘要回两款版本。
// - 卷的来源版本（consumption 里的 sourceAssetVersion）：本地数据是空的，「检查这份卷」那排不出现。这里补成 1。
// - 审阅线程（/api/import-reviews/…/product-review）：回 404，于是出「复制试卷信息」和出错时的「刷新」。
// - 审阅预览（?reviewRevision=rev-shot）：本地网站没有导入审阅数据。这里把审阅预览的卷和 consumption
//   接口换成同一份卷的正常数据；PDF 版本清单一次让它报错（出「刷新 PDF 版本」），一次让它回两款（出下拉框和「查看 PDF」）。
//
// 用法：node scripts/component-inventory/paper-rest-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-paper-rest/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：paper-rest-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-paper-rest', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const PAPER_ID = 'paper-2026-i'
const PAPER = `/?view=paper-browse&paperId=${PAPER_ID}`
const REVISION = 'rev-shot'
const EDITIONS = ['largeComplete', 'largeNoListening']

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`, deco: cs.textDecorationLine,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
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

// 卷子资产投影：和 paper-shots.mjs 同一个办法（rig 的资产是 source-capture-v1 外壳，页面直接读会打不开）。
// 投影后的卷子留一份，审阅预览的 /asset 接口拿它回。
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
const kept = { asset: null, consumption: null }
async function routes(context, { productsFail }) {
  await context.route(/\/paper-assets\/[^/]+\/versions\/v\d+\/paper-asset\.json$/, async (route) => {
    const res = await route.fetch()
    const m = /\/paper-assets\/([^/]+)\/versions\/(v\d+)\//.exec(new URL(route.request().url()).pathname)
    let body = await res.text()
    try {
      const { asset } = loadCanonicalSourceAssetRepresentation({ sourceAsset: JSON.parse(body), versionDir: path.join(RAW, 'rigdata/assets', m[1], 'versions', m[2]), label: 'rig', reject: (msg) => { throw new Error(msg) } })
      body = JSON.stringify(asset)
    } catch {}
    if (m[1] === PAPER_ID) kept.asset = body
    await route.fulfill({ response: res, body })
  })
  await context.route(/\/api\/paper-canonical\/consumption\?/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    if (json && json.sourceAssetVersion == null) json.sourceAssetVersion = 1
    kept.consumption = json
    await route.fulfill({ response: res, body: JSON.stringify(json) })
  })
  await context.route(/\/api\/exports\/papers\/[^/]+\/products\?/, (route) => {
    const u = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ paperId: PAPER_ID, publicationDigest: u.searchParams.get('publicationDigest'), editions: EDITIONS }) })
  })
  await context.route(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) }))
  // 卷子本身回投影后的那份；卷子旁边的其余文件（解析等）转给正常卷同一版本下的同名文件。
  await context.route(new RegExp(`/api/import-review-preview/revisions/${REVISION}/asset/`), (route) => {
    const rest = new URL(route.request().url()).pathname.split(`/revisions/${REVISION}/asset/`)[1]
    if (rest === 'paper-asset.json') return route.fulfill({ status: 200, contentType: 'application/json', body: kept.asset || '{}' })
    return route.fallback({ url: new URL(`/paper-assets/${PAPER_ID}/versions/v${kept.consumption?.sourceAssetVersion ?? 1}/${rest}`, route.request().url()).href })
  })
  await context.route(new RegExp(`/api/import-review-preview/revisions/${REVISION}/consumption`), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kept.consumption || {}) }))
  await context.route(new RegExp(`/api/import-review-preview/revisions/${REVISION}/products`), (route) =>
    productsFail.value
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ paperId: PAPER_ID, revisionId: REVISION, editions: EDITIONS }) }))
}

const TOPBAR_ITEMS = 'header.topbar :is(button, a, select)'
const REVIEW = '.paper-review-controls'
const REVIEW_ITEMS = `${REVIEW} :is(button, a, select)`

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const productsFail = { value: false }
    await routes(context, { productsFail })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const bar = page.locator('header.topbar')
    const topbarShot = async (name) => {
      const b = await bar.boundingBox()
      await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: Math.max(0, b.y - 8), width, height: b.height + 16 } })
    }
    const rec = { missing: [] }
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`)
        await page.screenshot({ path: path.join(OUT, `missing-${name}${suffix}.png`) }).catch(() => {})
      }
    }
    // 悬停和键盘焦点：key 是图名前缀，locator 是要悬停 / 聚焦的键，shoot 是截图函数，sel 是要量的选择器。
    const hoverFocus = async (key, locator, shoot, sel) => {
      await locator.hover(); await sleep(350); await shoot(`${key}-hover`)
      rec[`${key}Hover`] = await page.evaluate(measure, sel)
      await park(); await keyFocus(locator); await shoot(`${key}-focus`)
      rec[`${key}Focus`] = await page.evaluate(measure, sel)
      await blur()
    }
    await login(page, rig.base)

    // 1. 正常整卷预览：顶栏有「PDF Screen」，顶栏下面是「检查这份卷」（复制试卷信息、出错时的刷新）
    await step('paper', async () => {
      await page.goto(rig.base + PAPER); await page.locator(REVIEW).waitFor({ timeout: 60000 }); await settle(page, 2500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `page${suffix}.png`) })
      await topbarShot(`topbar${suffix}`)
      rec.topbar = await page.evaluate(measure, TOPBAR_ITEMS)
      const reviewShot = (name) => shotAround(page, name, [page.locator(REVIEW)], 8)
      await reviewShot(`review${suffix}`)
      rec.review = await page.evaluate(measure, REVIEW_ITEMS)
      rec.reviewBox = await page.evaluate(measure, REVIEW)
      if (!suffix) {
        await step('pdf-screen', () => hoverFocus('pdf-screen', bar.getByRole('link', { name: 'PDF Screen' }), topbarShot, TOPBAR_ITEMS))
        await step('copy', () => hoverFocus('copy', page.locator(REVIEW).getByRole('button', { name: '复制试卷信息' }), reviewShot, REVIEW_ITEMS))
        await step('refresh', () => hoverFocus('refresh', page.locator(REVIEW).getByRole('button', { name: '刷新', exact: true }), reviewShot, REVIEW_ITEMS))
      }
    })

    // 2. 审阅预览，PDF 版本清单报错：出「刷新 PDF 版本」
    await step('review-fail', async () => {
      productsFail.value = true
      await page.goto(rig.base + PAPER + `&reviewRevision=${REVISION}`); await page.getByRole('button', { name: '刷新 PDF 版本' }).waitFor({ timeout: 60000 }); await settle(page, 1500); await blur(); await park()
      const reviewShot = (name) => shotAround(page, name, [page.locator(REVIEW)], 8)
      await reviewShot(`review-preview-fail${suffix}`)
      rec.reviewPreviewFail = await page.evaluate(measure, REVIEW_ITEMS)
      if (!suffix) await step('retry-products', () => hoverFocus('retry-products', page.locator(REVIEW).getByRole('button', { name: '刷新 PDF 版本' }), reviewShot, REVIEW_ITEMS))
    })

    // 3. 审阅预览，PDF 版本清单正常：出下拉框和「查看 PDF」
    await step('review-ok', async () => {
      productsFail.value = false
      await page.goto(rig.base + PAPER + `&reviewRevision=${REVISION}`); await page.locator(REVIEW).getByRole('link', { name: '查看 PDF' }).waitFor({ timeout: 60000 }); await settle(page, 1500); await blur(); await park()
      const reviewShot = (name) => shotAround(page, name, [page.locator(REVIEW)], 8)
      await reviewShot(`review-preview${suffix}`)
      rec.reviewPreview = await page.evaluate(measure, REVIEW_ITEMS)
      if (!suffix) await step('view-pdf', () => hoverFocus('view-pdf', page.locator(REVIEW).getByRole('link', { name: '查看 PDF' }), reviewShot, REVIEW_ITEMS))
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
