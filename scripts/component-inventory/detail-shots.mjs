#!/usr/bin/env node
// 详情页换构件前后对照（构件厂第 4 步第五页）：「返回找题」、动作行（加入草稿卷 / 看整卷 / 阅读解析 / 相似篇章）、
// 卷面上浮着的「展开卷面」「收起卷面」。拍静止、悬停、键盘焦点、已加入、不可组卷，宽屏 1440 和窄屏 390，
// 量出位置和实算样式。
//
// 用法：node scripts/component-inventory/detail-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-detail/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：detail-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-detail', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const GROUP = 'group-2026-i-reading-a'
const DISABLED_GROUP = 'group-2026-i-reading-b'
const DETAIL = (id) => `/?view=detail&groupId=${id}`

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector('svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null, iconW: svg ? round(svg.getBoundingClientRect().width) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius, gap: cs.columnGap,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      pressed: e.getAttribute('aria-pressed'), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      href: e.getAttribute('href'), title: e.getAttribute('title'),
      data: Object.fromEntries([...e.attributes].filter((a) => /^data-ra/.test(a.name)).map((a) => [a.name, a.value])),
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

// 本地网站的题组没有 canonicalPaperId 和 paperSurfaceHref：卷面不出（显示「这份卷还没上线」，也就没有
// 「展开卷面」），「看整卷」「阅读解析」「相似篇章」也都不出现。这里拦下题组详情接口，给两篇补上 canonicalPaperId
// （本地网站自己的 paper-2026-i），给 A 篇补上阅读解析三个字段，给 B 篇改成「暂不可组卷」。改前改后同一份数据。
const patchDetail = (id, body) => {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.id === id && 'groupType' in node) {
      node.canonicalPaperId ||= 'paper-2026-i'
      if (id === GROUP) Object.assign(node, { hasPaperSurfaceAnalysis: true, paperSurfaceHref: `/?view=paper-browse&paperId=paper-2026-i&focusGroupId=${id}`, paperSurfaceLabel: '阅读解析' })
      if (id === DISABLED_GROUP) Object.assign(node, { draftPaperButtonState: 'disabled', canAddToDraftPaper: false, printUnavailableReason: '这组题还在整理' })
      return
    }
    for (const v of Object.values(node)) visit(v)
  }
  visit(body)
  return body
}

// 和 paper-shots.mjs 一样：rig 的卷子资产是 source-capture-v1 外壳，页面直接读拿不到 content.blocks。
// 拦下请求，用服务端同一个投影函数转成页面要的 PaperAsset（站点本身的缺口，这里不修）。
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
    await context.route(/\/api\/question-groups\/[^/?]+(\?[^/]*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop())
      const res = await route.fetch()
      let body = await res.text()
      try { body = JSON.stringify(patchDetail(id, JSON.parse(body))) } catch {}
      await route.fulfill({ response: res, body })
    })
    // 详情页的组卷状态取自列表卡片（App.tsx selectedDetailForView 用列表那份盖掉详情那份），
    // 所以 B 篇「暂不可组卷」也要在列表接口上改。
    await context.route(/\/api\/question-groups(\?[^/]*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch()
      let body = await res.text()
      try {
        const data = JSON.parse(body)
        const visit = (node) => {
          if (!node || typeof node !== 'object') return
          if (node.id === DISABLED_GROUP && 'draftPaperButtonState' in node) { Object.assign(node, { draftPaperButtonState: 'disabled', canAddToDraftPaper: false, printUnavailableReason: '这组题还在整理' }); return }
          for (const v of Object.values(node)) visit(v)
        }
        visit(data)
        body = JSON.stringify(data)
      } catch {}
      await route.fulfill({ response: res, body })
    })
    await projectPaperAssets(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    const ACTIONS = '.peek-actions > :is(button, a), .peek-actions > .peek-actions-menu button'
    await login(page, rig.base)
    // 先清空草稿卷，「加入草稿卷」才是没加入的样子
    await page.evaluate(async () => { const d = await (await fetch('/api/draft-papers/current?create=1')).json(); for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' }) })

    await page.goto(rig.base + DETAIL(GROUP)); await page.locator('.peek-actions').waitFor({ timeout: 30000 }); await settle(page, 2500); await park()
    const back = page.locator('.detail-view > button').first()
    const hero = page.locator('.peek-hero').first()
    const actions = page.locator('.peek-actions').first()
    await page.screenshot({ path: path.join(OUT, `page${suffix}.png`) })
    await shotAround(page, `head${suffix}`, [back, hero], 12)
    rec.back = await page.evaluate(measure, '.detail-view > button')
    rec.actions = await page.evaluate(measure, ACTIONS)
    rec.actionsRow = await page.evaluate(measure, '.peek-actions')

    // 1. 返回找题
    if (!suffix) await step('back', async () => {
      await back.hover(); await sleep(350)
      await shotAround(page, 'back-hover', [back], 16); rec.backHover = await page.evaluate(measure, '.detail-view > button')
      await park(); await page.keyboard.press('Shift'); await back.focus(); await sleep(250)
      await shotAround(page, 'back-focus', [back], 16); rec.backFocus = await page.evaluate(measure, '.detail-view > button')
      await page.evaluate(() => document.activeElement?.blur())
    })

    // 2. 动作行：逐个悬停、键盘焦点
    if (!suffix) await step('actions', async () => {
      const all = page.locator(ACTIONS)
      const n = await all.count()
      rec.actionHover = []; rec.actionFocus = []
      for (let i = 0; i < n; i++) {
        const el = all.nth(i)
        const text = ((await el.innerText()) || (await el.getAttribute('aria-label')) || '').trim()
        if (/更多操作/.test(text) || (await el.getAttribute('aria-haspopup'))) continue
        await el.hover(); await sleep(350)
        await shotAround(page, `actions-hover-${i}`, [actions], 12)
        rec.actionHover.push({ i, text, all: await page.evaluate(measure, ACTIONS) })
        await park(); await page.keyboard.press('Shift'); await el.focus(); await sleep(250)
        await shotAround(page, `actions-focus-${i}`, [actions], 12)
        rec.actionFocus.push({ i, text, all: await page.evaluate(measure, ACTIONS) })
        await page.evaluate(() => document.activeElement?.blur())
      }
    })

    // 3. 已加入草稿卷
    await step('added', async () => {
      const add = page.locator('.peek-actions > button').first()
      await add.click(); await sleep(1500); await park()
      await shotAround(page, `actions-added${suffix}`, [actions], 12)
      rec.added = await page.evaluate(measure, ACTIONS)
      if (!suffix) { await add.hover(); await sleep(350); await shotAround(page, 'actions-added-hover', [actions], 12); rec.addedHover = await page.evaluate(measure, ACTIONS); await park() }
    })

    // 4. 展开卷面 / 收起卷面（浮在卷面上的键）
    await step('expand', async () => {
      const expand = page.locator('.peek-expand').first()
      await expand.scrollIntoViewIfNeeded(); await sleep(400); await park()
      await shotAround(page, `expand${suffix}`, [expand], 48)
      rec.expand = await page.evaluate(measure, '.peek-expand')
      if (!suffix) {
        await expand.hover(); await sleep(350); await shotAround(page, 'expand-hover', [expand], 48); rec.expandHover = await page.evaluate(measure, '.peek-expand')
        await park(); await page.keyboard.press('Shift'); await expand.focus(); await sleep(250); await shotAround(page, 'expand-focus', [expand], 48); rec.expandFocus = await page.evaluate(measure, '.peek-expand')
        await page.evaluate(() => document.activeElement?.blur())
      }
      await expand.click(); await sleep(800)
      const collapse = page.locator('.peek-expand').first()
      await page.evaluate(() => window.scrollBy(0, 500)); await sleep(500); await park()
      await shotAround(page, `collapse${suffix}`, [collapse], 48)
      rec.collapse = await page.evaluate(measure, '.peek-expand')
      if (!suffix) { await collapse.hover(); await sleep(350); await shotAround(page, 'collapse-hover', [collapse], 48); rec.collapseHover = await page.evaluate(measure, '.peek-expand'); await park() }
    })

    // 5. 暂不可组卷（B 篇，接口里改的）
    await step('disabled', async () => {
      await page.goto(rig.base + DETAIL(DISABLED_GROUP)); await page.locator('.peek-actions').waitFor({ timeout: 30000 }); await settle(page, 2000); await park()
      await shotAround(page, `actions-disabled${suffix}`, [page.locator('.peek-actions').first()], 12)
      rec.disabled = await page.evaluate(measure, ACTIONS)
      if (!suffix) { await page.locator('.peek-actions > button').first().hover(); await sleep(350); await shotAround(page, 'actions-disabled-hover', [page.locator('.peek-actions').first()], 12); await park() }
    })

    // 6. 读不到详情（没有这个题组）：只有「返回找题」和一行错
    await step('error', async () => {
      await page.goto(rig.base + DETAIL('group-does-not-exist')); await settle(page, 2500); await park()
      await shotAround(page, `error${suffix}`, [page.locator('.detail-view').first()], 12)
      rec.error = await page.evaluate(measure, '.detail-view > :is(button, p)')
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
