#!/usr/bin/env node
// Owner 2026-11-14 决定第二批（#5 / #13 / #14 / #17）改前改后对照。
//   #5  草稿卷题组工具条「换篇」：收着、展开两种状态的读屏名字（Chrome 读屏树里的 name / description）。
//   #13 整卷预览顶栏「PDF Screen」、审阅预览「查看 PDF」：外链图标、读屏名字。
//   #14 首页搜索框「清除搜索」：点完以后焦点落在哪（鼠标点、键盘按两种）。
//   #17 相似篇章面板（首页题组卡、详情页）和草稿卷换篇栏每张卡片上的键：tone、实算样式，整页有几处雾薄荷主键。
// 拍静止、悬停、键盘焦点，宽屏 1440 和窄屏 390；量出位置、实算样式和读屏树。
//
// 这几个键在清点用的本地网站里平时出不来，脚本拦了几个接口让它们出现（只在截图里，站点不改）：
// - POST /api/similar-passages：本地网站算不出相似篇章（报 400，面板只出「重试」）。这里回三张卡：
//   两组不在草稿卷里的题组、一组已在草稿卷里的（换篇栏里它是禁用的）。改前改后同一份。
// - GET /api/question-groups/group-2026-i-reading-a：本地数据没有 paperSurfaceHref，详情页不出「相似篇章」入口。这里补上。
// - 整卷预览「PDF Screen」、审阅预览「查看 PDF」：和 paper-rest-shots.mjs 同一套拦法（卷子资产投影、consumption 补
//   sourceAssetVersion、PDF 版本清单回两款、审阅线程 404、审阅预览换成同一份卷）。
//
// 用法：node scripts/component-inventory/decisions-a2-shots.mjs before|after
// 输出：design/components-2026-11-13/decisions-2026-11-14/batch-a2/<before|after>/（shots/*.png + measure.json）
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：decisions-a2-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/decisions-2026-11-14/batch-a2', label)
for (const f of ['shots', 'measure.json']) rmSync(path.join(OUT, f), { recursive: true, force: true })
mkdirSync(path.join(OUT, 'shots'), { recursive: true })

const PAPER_ID = 'paper-2026-i'
const PAPER = `/?view=paper-browse&paperId=${PAPER_ID}`
const REVISION = 'rev-shot'
const EDITIONS = ['largeComplete', 'largeNoListening']
const SEED_GROUP = 'group-2026-i-reading-a'
const DRAFT_GROUPS = ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c'] // addDraftItems 加的三组

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector('svg')
    const svgR = svg ? svg.getBoundingClientRect() : null
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      tone: e.getAttribute('data-tone') || undefined, size: e.getAttribute('data-size') || undefined,
      ariaLabel: e.getAttribute('aria-label') || undefined, title: e.getAttribute('title') || undefined,
      pressed: e.getAttribute('aria-pressed') || undefined, target: e.getAttribute('target') || undefined,
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      icons: e.querySelectorAll('svg').length,
      icon: svgR ? { x: round(svgR.x - r.x), w: round(svgR.width), color: getComputedStyle(svg).color, ariaHidden: svg.getAttribute('aria-hidden') } : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`, deco: cs.textDecorationLine,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius, gap: cs.columnGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}
// 整页看得见的雾薄荷主键（守「每页一处」用）
const primaries = () => [...document.querySelectorAll('.eqb-button[data-tone="primary"]')]
  .filter((e) => e.getClientRects().length).map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
// 焦点落在哪
const focused = () => {
  const e = document.activeElement
  if (!e || e === document.body) return { where: 'body' }
  return {
    where: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id.replace(/[^\w-]/g, '_') : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`,
    label: (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 30) || undefined,
    isSearchInput: e.matches('.concierge-intent-input'), focusVisible: e.matches(':focus-visible'),
  }
}

async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 读屏树：Chrome 自己算出来的 role / name / description（CDP Accessibility），不是从属性猜的。
async function ax(page, locator) {
  const tag = `a2-${Math.random().toString(36).slice(2)}`
  if (!(await locator.evaluate((e, t) => { e.setAttribute('data-a2-ax', t); return true }, tag).catch(() => false))) return null
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-a2-ax="${tag}"]` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value]))
    return {
      role: n.role?.value, name: n.name?.value, nameFrom: n.name?.sources?.find((s) => s.value)?.type,
      description: n.description?.value ?? null, pressed: props.pressed, expanded: props.expanded,
    }
  } finally {
    await locator.evaluate((e) => e.removeAttribute('data-a2-ax')).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}

// ---------- 拦接口 ----------
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
const kept = { asset: null, consumption: null, groups: null }

async function routes(context, { productsFail }) {
  // 相似篇章：回三张卡。题组 id 从同一个网站的题组列表里取（能在 questionGroupById 里查到，才不是「未入库存」的禁用卡）。
  await context.route(/\/api\/similar-passages$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const seed = JSON.parse(route.request().postData() || '{}').groupId
    const pool = (kept.groups || []).filter((g) => g.id !== seed)
    const fresh = pool.filter((g) => !DRAFT_GROUPS.includes(g.id)).slice(0, 2)
    const inDraft = pool.filter((g) => DRAFT_GROUPS.includes(g.id)).slice(0, 1)
    const pick = [...fresh, ...inDraft]
    const results = pick.map((g, i) => ({
      groupId: g.id, paperId: g.canonicalPaperId || null, title: g.title || g.id,
      sourceLabel: [g.year, g.paperName || g.source, g.region].filter(Boolean).join(' · ') || '本地题库',
      score: 0.9 - i * 0.1,
      reasons: [{ kind: 'topic-match', label: '同话题' }, ...(i === 0 ? [{ kind: 'authentic-source', label: '真题' }] : [])],
    }))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      seedProfile: { groupType: 'reading', topicLabels: ['拍图用'] }, results,
      poolStats: { totalInPool: results.length + 2, returned: results.length }, notice: null,
    }) })
  })
  // 详情页：补 paperSurfaceHref，露出「相似篇章」入口。
  await context.route(new RegExp(`/api/question-groups/${SEED_GROUP}$`), async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch()
    let body = await res.text()
    try {
      const data = JSON.parse(body)
      const visit = (node) => {
        if (!node || typeof node !== 'object') return
        if (node.id === SEED_GROUP && 'groupType' in node) { if (!node.paperSurfaceHref) node.paperSurfaceHref = PAPER; return }
        for (const v of Object.values(node)) visit(v)
      }
      visit(data)
      body = JSON.stringify(data)
    } catch {}
    await route.fulfill({ response: res, body })
  })
  // 以下是 paper-rest-shots.mjs 同一套。
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

const INPUT = '.concierge-intent-input'
const SEARCH_BAR = '.concierge-intent-bar'
const CLEAR = '[aria-label="清除搜索"]'
const PAPER_HEAD = '.concierge-paper-row-head'
const GROUP_LINE = '.concierge-group-row-line'
const MENU_ITEMS = '.eqb-menu .eqb-menu-item'
const PANEL = '.similar-passages-panel'
const CARD_KEYS = '.similar-rcard-actions > button'
const SWAP = '.draft-group-actions > button:has(.draft-group-actions-label)' // 「换篇」：工具条里带字的那个手写键
const DRAWER = '.draft-paper-rail--swap'
const TOPBAR_ITEMS = 'header.topbar :is(button, a, select)'
const REVIEW = '.paper-review-controls'
const REVIEW_ITEMS = `${REVIEW} :is(button, a, select)`

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {
  intercepted: [
    'POST /api/similar-passages：三张卡（两组不在草稿卷里、一组已在草稿卷里）',
    `GET /api/question-groups/${SEED_GROUP}：补 paperSurfaceHref（露出详情页「相似篇章」入口）`,
    '整卷预览 / 审阅预览：paper-rest-shots.mjs 同一套（资产投影、consumption 补版本、PDF 版本清单回两款、审阅线程 404）',
  ],
}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const productsFail = { value: false }
    await routes(context, { productsFail })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(300) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(300) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`)
        await page.screenshot({ path: path.join(OUT, 'shots', `missing-${name}${suffix}.png`) }).catch(() => {})
      }
    }
    await login(page, rig.base)
    if (!kept.groups) {
      kept.groups = await page.evaluate(async () => {
        const data = await (await fetch('/api/question-groups')).json()
        const out = []
        const visit = (node) => {
          if (!node || typeof node !== 'object') return
          if ('groupType' in node && typeof node.id === 'string') { out.push({ id: node.id, groupType: node.groupType, title: node.title, year: node.year, paperName: node.paperName, source: node.source, region: node.region, canonicalPaperId: node.canonicalPaperId }); return }
          for (const v of Object.values(node)) visit(v)
        }
        visit(data)
        return out.filter((g) => g.groupType === 'reading')
      })
      result.similarPool = kept.groups.map((g) => g.id)
    }

    // ---------- #14 首页「清除搜索」：点完焦点去哪 ----------
    await step('clear', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500); await park()
      const input = page.locator(INPUT), bar = page.locator(SEARCH_BAR).first()
      // a. 只打了字、没搜：鼠标点 ✕
      await input.fill('2026 阅读'); await sleep(300)
      const clear = page.locator(CLEAR)
      await shotAround(page, `clear-typed${suffix}`, [bar], 12)
      rec.clearKey = (await page.evaluate(measure, CLEAR))[0]
      rec.clearKeyAx = await ax(page, clear)
      await clear.click(); await sleep(400)
      rec.afterMouseClickTyped = { focus: await page.evaluate(focused), value: await input.inputValue() }
      await shotAround(page, `clear-after-click-typed${suffix}`, [bar], 12)
      // b. 搜过、出了结果：鼠标点 ✕（最常见的那一种）
      await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator(PAPER_HEAD).first().waitFor({ timeout: 30000 }); await settle(page, 1200)
      await clear.click(); await sleep(600); await park()
      rec.afterMouseClickResults = { focus: await page.evaluate(focused), value: await input.inputValue(), resultsLeft: await page.locator(PAPER_HEAD).count() }
      await shotAround(page, `clear-after-click-results${suffix}`, [bar], 12)
      // c. 键盘：输入框里 Tab 到 ✕，按回车
      await input.fill('2026 阅读'); await sleep(200)
      await input.focus(); await page.keyboard.press('Tab'); await sleep(200)
      rec.tabbedTo = await page.evaluate(focused)
      await shotAround(page, `clear-key-focus${suffix}`, [bar], 12)
      await page.keyboard.press('Enter'); await sleep(500)
      rec.afterKeyboardEnter = { focus: await page.evaluate(focused), value: await input.inputValue() }
      await shotAround(page, `clear-after-enter${suffix}`, [bar], 12)
      // d. 回车后马上打字，字进不进输入框
      await page.keyboard.type('ab'); await sleep(200)
      rec.typeAfterEnter = await input.inputValue()
      await input.fill(''); await blur()
    })

    // ---------- #17 首页题组卡「⋯ → 相似篇章」面板 ----------
    await step('home-similar', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1200)
      const input = page.locator(INPUT); await input.fill('2026 阅读'); await input.press('Enter')
      const head = page.locator(PAPER_HEAD).first(); await head.waitFor({ timeout: 30000 }); await settle(page, 1200)
      if ((await head.locator('.concierge-row-expand').getAttribute('aria-expanded')) !== 'true') { await head.locator('.concierge-paper-body').first().click(); await sleep(800) }
      const line = page.locator(GROUP_LINE).first(); await line.waitFor({ timeout: 10000 })
      await line.locator('.concierge-group-row-menu-trigger').click(); await sleep(400)
      await page.locator(MENU_ITEMS).filter({ hasText: '相似篇章' }).first().click()
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rcard').first().waitFor({ timeout: 15000 }); await settle(page, 800); await blur(); await park()
      await panel.scrollIntoViewIfNeeded(); await sleep(300); await park()
      await shotAround(page, `home-similar${suffix}`, [panel], 12)
      rec.homeCardKeys = await page.evaluate(measure, `${PANEL} ${CARD_KEYS}`)
      rec.homePrimaries = await page.evaluate(primaries)
      const key = panel.locator(CARD_KEYS).first()
      await key.hover(); await sleep(400)
      await shotAround(page, `home-similar-key-hover${suffix}`, [panel.locator('.similar-rcard').first()], 12)
      rec.homeCardKeyHover = (await page.evaluate(measure, `${PANEL} ${CARD_KEYS}`))[0]
      await park(); await keyFocus(key)
      await shotAround(page, `home-similar-key-focus${suffix}`, [panel.locator('.similar-rcard').first()], 12)
      rec.homeCardKeyFocus = (await page.evaluate(measure, `${PANEL} ${CARD_KEYS}`))[0]
      await blur()
    })

    // ---------- #17 详情页的相似篇章面板（同一个 SimilarPassagesPanel，页面上方已有「加入草稿卷」主键） ----------
    await step('detail-similar', async () => {
      await page.goto(rig.base + `/?view=detail&groupId=${SEED_GROUP}`); await settle(page, 2000)
      rec.detailPrimariesBeforeOpen = await page.evaluate(primaries)
      await page.locator('[data-ra-entry="detail-view-similar"]').click({ timeout: 10000 })
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rcard').first().waitFor({ timeout: 15000 }); await settle(page, 800); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, 'shots', `detail-page${suffix}.png`), fullPage: false })
      await panel.scrollIntoViewIfNeeded(); await sleep(300); await park()
      await shotAround(page, `detail-similar${suffix}`, [panel], 12)
      rec.detailCardKeys = await page.evaluate(measure, `${PANEL} ${CARD_KEYS}`)
      rec.detailPrimaries = await page.evaluate(primaries)
      rec.detailHeroKey = await page.evaluate(measure, '.peek-actions > .eqb-button')
    })

    // ---------- #5 / #17 草稿卷：「换篇」读屏名字、换篇栏卡片的键 ----------
    await step('draft', async () => {
      await addDraftItems(page)
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator(SWAP).first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
      const swap = page.locator(SWAP).first()
      await swap.scrollIntoViewIfNeeded(); await sleep(300); await park()
      const tools = page.locator('.draft-group-actions').first()
      await shotAround(page, `swap-key${suffix}`, [tools], 8)
      rec.swapKey = (await page.evaluate(measure, SWAP))[0]
      rec.swapAxCollapsed = await ax(page, swap)
      // verify 脚本里那条选择器（getByRole button + 名字精确匹配），改前改后各数一次
      rec.swapSelectorTrial = {
        "getByRole('button', { name: '换一篇相似篇章', exact: true })": await page.getByRole('button', { name: '换一篇相似篇章', exact: true }).count(),
        "getByRole('button', { name: '换篇：换一篇相似篇章', exact: true })": await page.getByRole('button', { name: '换篇：换一篇相似篇章', exact: true }).count(),
        "locator('[aria-label=\"换一篇相似篇章\"]')": await page.locator('[aria-label="换一篇相似篇章"]').count(),
      }
      rec.draftPrimariesCollapsed = await page.evaluate(primaries)
      await swap.click()
      const drawer = page.locator(DRAWER).first(); await drawer.locator('.similar-rcard').first().waitFor({ timeout: 30000 }); await settle(page, 1200); await park()
      rec.swapAxExpanded = await ax(page, swap)
      rec.swapKeyExpanded = (await page.evaluate(measure, SWAP))[0]
      rec.swapSelectorTrialExpanded = {
        "getByRole('button', { name: '换篇：收起', exact: true })": await page.getByRole('button', { name: '换篇：收起', exact: true }).count(),
        "getByRole('button', { name: '收起换篇', exact: true })": await page.getByRole('button', { name: '收起换篇', exact: true }).count(),
        "getByRole('button', { name: '⇄ 替换这篇', exact: true })": await page.getByRole('button', { name: '⇄ 替换这篇', exact: true }).count(),
      }
      await swap.scrollIntoViewIfNeeded(); await sleep(200); await park()
      await shotAround(page, `swap-key-expanded${suffix}`, [page.locator('.draft-group-actions').first()], 8)
      await drawer.scrollIntoViewIfNeeded(); await sleep(300); await park()
      await shotAround(page, `swap-drawer${suffix}`, [drawer], 8)
      rec.drawerCardKeys = await page.evaluate(measure, `${DRAWER} ${CARD_KEYS}`)
      rec.draftPrimariesExpanded = await page.evaluate(primaries)
      const key = drawer.locator(CARD_KEYS).first()
      await key.hover(); await sleep(400)
      await shotAround(page, `swap-drawer-key-hover${suffix}`, [drawer.locator('.similar-rcard').first()], 8)
      rec.drawerKeyHover = (await page.evaluate(measure, `${DRAWER} ${CARD_KEYS}`))[0]
      await park(); await keyFocus(key)
      await shotAround(page, `swap-drawer-key-focus${suffix}`, [drawer.locator('.similar-rcard').first()], 8)
      rec.drawerKeyFocus = (await page.evaluate(measure, `${DRAWER} ${CARD_KEYS}`))[0]
      await blur()
      await page.locator(SWAP).first().click(); await sleep(600)
    })

    // ---------- #13 整卷预览顶栏「PDF Screen」 ----------
    await step('pdf-screen', async () => {
      productsFail.value = false
      await page.goto(rig.base + PAPER); await page.locator(REVIEW).waitFor({ timeout: 60000 }); await settle(page, 2500); await blur(); await park()
      const bar = page.locator('header.topbar')
      const topbarShot = async (name) => {
        const b = await bar.boundingBox()
        await page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), clip: { x: 0, y: Math.max(0, b.y - 8), width, height: b.height + 16 } })
      }
      await topbarShot(`topbar${suffix}`)
      rec.topbar = await page.evaluate(measure, TOPBAR_ITEMS)
      const link = bar.getByRole('link', { name: 'PDF Screen' })
      rec.pdfScreenCount = await link.count()
      if (!rec.pdfScreenCount) throw new Error('顶栏没有「PDF Screen」')
      rec.pdfScreen = (await page.evaluate(measure, 'header.topbar a[target="_blank"]'))[0]
      rec.pdfScreenAx = await ax(page, link)
      if (!(await link.isVisible())) throw new Error('「PDF Screen」看不见')
      await link.hover(); await sleep(350); await topbarShot(`pdf-screen-hover${suffix}`)
      rec.pdfScreenHover = (await page.evaluate(measure, 'header.topbar a[target="_blank"]'))[0]
      await park(); await keyFocus(link); await topbarShot(`pdf-screen-focus${suffix}`)
      rec.pdfScreenFocus = (await page.evaluate(measure, 'header.topbar a[target="_blank"]'))[0]
      await blur()
    })

    // ---------- #13 审阅预览「查看 PDF」 ----------
    await step('view-pdf', async () => {
      productsFail.value = false
      await page.goto(rig.base + PAPER + `&reviewRevision=${REVISION}`)
      const link = page.locator(REVIEW).getByRole('link', { name: '查看 PDF' })
      await link.waitFor({ timeout: 60000 }); await settle(page, 1500); await blur(); await park()
      const reviewShot = (name) => shotAround(page, name, [page.locator(REVIEW)], 8)
      await reviewShot(`review-preview${suffix}`)
      rec.review = await page.evaluate(measure, REVIEW_ITEMS)
      rec.viewPdf = (await page.evaluate(measure, `${REVIEW} a[target="_blank"]`))[0]
      rec.viewPdfAx = await ax(page, link)
      await link.hover(); await sleep(350); await reviewShot(`view-pdf-hover${suffix}`)
      rec.viewPdfHover = (await page.evaluate(measure, `${REVIEW} a[target="_blank"]`))[0]
      await park(); await keyFocus(link); await reviewShot(`view-pdf-focus${suffix}`)
      rec.viewPdfFocus = (await page.evaluate(measure, `${REVIEW} a[target="_blank"]`))[0]
      await blur()
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
