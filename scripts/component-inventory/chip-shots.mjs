#!/usr/bin/env node
// 胶囊构件和圆角变量的改前改后对照（design/components-2026-11-13/migrate-chip/）。
// 一、圆角变量：shared-ui 四份 css 的圆角换成 tokens.css 里的变量，样子必须一点不变。
//    拍整屏：首页、首页结果页开着题组行菜单（悬停第一项）、详情页加入以后那块纸、草稿卷移除后的底部提示；
//    量这几页上 shared-ui 构件实算的 border-radius。
// 二、胶囊换上去的几处：
//    - 浏览页筛选胶囊（chip-02）：静止、悬停、键盘焦点、选中、选中时悬停、选中时键盘焦点，选年份后出现的月份一排；390 宽。
//    - 草稿丸（chip-03 / chip-04，改用 Button）：首页（空的时候禁用、有题以后、悬停、键盘焦点、按下）、
//      详情页、整卷页；390 宽首页。
//    - 相似篇章卡片上的理由小签（状态标记，不可点）：首页题组卡「⋯ → 相似篇章」面板、草稿卷「换篇」栏。
//      测试数据配不出相似篇章（接口回「该篇暂无检索标注数据」），这里拦 POST /api/similar-passages 回三条固定结果（只在截图里，站点不改）。
// 宽屏 1440×900 和窄屏 390×844，DPR 2，减少动效。量出实算样式和读屏树（CDP）。
//
// 本地网站：用 rig.mjs 自己起一份，默认端口偏移 57（INVENTORY_PORT_OFFSET），INVENTORY_SEED 默认 full。
// 用法：node scripts/component-inventory/chip-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-chip/<before|after>/（*.png + measure.json）
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '57'
if (!process.env.INVENTORY_SEED) process.env.INVENTORY_SEED = 'full'
const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
const path = (await import('node:path')).default
const { ROOT, requireFromApp } = await import('./lib.mjs')
const { startRig } = await import('./rig.mjs')
const { addDraftItems, login, settle, sleep } = await import('./scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：chip-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-chip', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const SEED_GROUP = 'group-2026-i-reading-a'

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    const texts = []
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('.visually-hidden')) continue
      const range = document.createRange(); range.selectNodeContents(n); texts.push(...range.getClientRects())
    }
    const tb = texts.length ? { x: round(Math.min(...texts.map((t) => t.left))), w: round(Math.max(...texts.map((t) => t.right)) - Math.min(...texts.map((t) => t.left))) } : null
    const svg = e.querySelector('svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), textBox: tb,
      iconX: svg ? round(svg.getBoundingClientRect().x) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`, lineHeight: cs.lineHeight,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, gap: cs.columnGap, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
      opacity: cs.opacity, cursor: cs.cursor, transform: cs.transform === 'none' ? null : cs.transform,
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      pressed: e.getAttribute('aria-pressed') || undefined,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}

const RADIUS_SEL = '.eqb-button, .eqb-menu, .eqb-menu-item, .eqb-draft-add-paper, .eqb-draft-add-open, .eqb-notice[data-placement="over"], .eqb-notice[data-placement="floating"]'
function radii(sel) {
  const out = {}
  for (const e of document.querySelectorAll(sel)) {
    if (!e.getClientRects().length) continue
    const key = (typeof e.className === 'string' ? e.className.split(' ').filter((c) => c.startsWith('eqb-')).join('.') : e.tagName) + (e.dataset.placement ? `[${e.dataset.placement}]` : '')
    const cs = getComputedStyle(e)
    const v = `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`
    out[key] ||= {}; out[key][v] = (out[key][v] || 0) + 1
  }
  const list = document.querySelector('.eqb-menu.fluid-hover-list')
  if (list) out['eqb-menu --fh-radius'] = getComputedStyle(list).getPropertyValue('--fh-radius').trim()
  return out
}

async function ax(page, locator) {
  const tag = `c-${Math.random().toString(36).slice(2)}`
  if (!(await locator.evaluate((e, t) => { e.setAttribute('data-c-ax', t); return true }, tag).catch(() => false))) return null
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-c-ax="${tag}"]` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value]))
    return { role: n.role?.value, name: n.name?.value, pressed: props.pressed, disabled: props.disabled, focusable: props.focusable }
  } finally {
    await locator.evaluate((e) => e.removeAttribute('data-c-ax')).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}

const FAKE_SIMILAR = {
  seedProfile: { groupType: 'reading', topicLabels: ['人与自然'] },
  results: [
    { groupId: 'group-2024-i-reading-b', paperId: null, title: '2024 新课标 I 卷 阅读 B', sourceLabel: '2024 · 新课标 I 卷', score: 0.9,
      reasons: [{ kind: 'topic-match', label: '同话题：人与自然' }, { kind: 'position-slot', label: '同篇位 A' }, { kind: 'authentic-source', label: '真题' }] },
    { groupId: 'group-2024-jia-reading-c', paperId: null, title: '2024 全国甲卷 阅读 C', sourceLabel: '2024 · 全国甲卷', score: 0.8,
      reasons: [{ kind: 'topic-match', label: '同话题：人与自然' }, { kind: 'authentic-source', label: '真题' }] },
    { groupId: 'group-not-in-bank', paperId: null, title: '未入库的一篇（拍图用）', sourceLabel: '2023 · 模拟', score: 0.5,
      reasons: [{ kind: 'topic-match', label: '同话题：人与自然' }] },
  ],
  poolStats: { totalInPool: 12, returned: 3 },
  notice: null,
}

async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)) - pad)), y0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - pad))
  const x1 = Math.min(vp.width, Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + pad)), y1 = Math.min(vp.height, Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + pad))
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const narrow = suffix !== ''
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/similar-passages$/, (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SIMILAR) }) : route.fallback())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(300) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(300) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(200) }
    const rec = { missing: [], radius: {} }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    const full = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`) }) }
    await login(page, rig.base)

    // ── 草稿丸：草稿卷还是空的（禁用） ─────────────────────────
    const BASKET = '.basket-chip'
    await step('basket-home-empty', async () => {
      await page.goto(rig.base + '/'); await settle(page, 2000); await park()
      await page.locator(BASKET).waitFor({ timeout: 15000 })
      await shotAround(page, `basket-home-empty${suffix}`, [page.locator(BASKET)], 24)
      rec.basketHomeEmpty = await page.evaluate(measure, BASKET)
      rec.basketHomeEmptyAx = await ax(page, page.locator(BASKET))
    })

    // ── 一、圆角：首页整屏 ─────────────────────────────────
    if (!narrow) await step('r-home', async () => {
      await full('r-home'); rec.radius.home = await page.evaluate(radii, RADIUS_SEL)
    })

    // ── 浏览页筛选胶囊 ───────────────────────────────────
    const CHIPS = '.concierge-browse-chips'
    const chip = (text) => page.locator('.concierge-browse-chip').filter({ hasText: new RegExp(`^${text}$`) }).first()
    await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await settle(page, 2000); await park()
      await page.locator(CHIPS).first().waitFor({ timeout: 15000 })
      const row = () => [page.locator(CHIPS).first()]
      await shotAround(page, `browse-chips${suffix}`, row())
      rec.browseRest = await page.evaluate(measure, '.concierge-browse-chip')
      rec.browseAx = await ax(page, chip('真题'))
      if (!narrow) {
        await chip('真题').hover(); await sleep(400)
        await shotAround(page, 'browse-chips-hover', row()); rec.browseHover = await page.evaluate(measure, '.concierge-browse-chip')
        await park()
        await keyFocus(chip('真题'))
        await shotAround(page, 'browse-chips-focus', row()); rec.browseFocus = await page.evaluate(measure, '.concierge-browse-chip')
        await blur()
        // 选中 2026：出现月份一排
        await chip('2026').click(); await settle(page, 1200); await park(); await blur()
        const rows = [page.locator(CHIPS).first(), page.locator(CHIPS).last()]
        await shotAround(page, 'browse-chips-selected', rows); rec.browseSelected = await page.evaluate(measure, '.concierge-browse-chip')
        rec.browseSelectedAx = await ax(page, chip('2026'))
        await chip('2026').hover(); await sleep(400)
        await shotAround(page, 'browse-chips-selected-hover', rows); rec.browseSelectedHover = await page.evaluate(measure, '.concierge-browse-chip')
        await park()
        await keyFocus(chip('2026'))
        await shotAround(page, 'browse-chips-selected-focus', rows); rec.browseSelectedFocus = await page.evaluate(measure, '.concierge-browse-chip')
        await blur()
        await page.mouse.down({ button: 'left' }).catch(() => {}); await page.mouse.up().catch(() => {})
        await page.keyboard.press('Tab'); await sleep(200) // 键盘从页面头走进来，看第一个能停的东西（不拍，只记）
        rec.browseTabFirst = await page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()} ${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)}` : null })
      }
    })

    // ── 首页结果页：题组行菜单（圆角） + 相似篇章面板里的理由小签 ─────
    if (!narrow) await step('home-results', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const i = page.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(page, 3000); await park()
      // 结果先按卷成行，点开第一行才露出题组卡和卡上的「⋯」
      const trigger = page.locator('.concierge-group-row-menu-trigger').first()
      if (!(await trigger.isVisible().catch(() => false))) { await page.locator('.concierge-paper-row').first().click({ timeout: 8000 }); await sleep(1200) }
      await trigger.waitFor({ timeout: 10000 }); await trigger.scrollIntoViewIfNeeded(); await park()
      await trigger.click({ timeout: 8000 }); await sleep(500)
      await page.locator('.eqb-menu-item').first().hover(); await sleep(400)
      await full('r-home-row-menu'); rec.radius.homeRowMenu = await page.evaluate(radii, RADIUS_SEL)
      await page.locator('.eqb-menu-item').filter({ hasText: '相似篇章' }).first().click({ timeout: 8000 }); await settle(page, 1500); await park()
      const panel = page.locator('.similar-passages-panel').first()
      await panel.waitFor({ timeout: 15000 })
      await panel.scrollIntoViewIfNeeded(); await sleep(300)
      await shotAround(page, 'similar-home', [panel.locator('.similar-rcard-list')], 12)
      rec.similarHome = await page.evaluate(measure, '.similar-rcard-chips > *')
      rec.similarHomeAx = await ax(page, panel.locator('.similar-rcard-chips > *').first())
    })

    // ── 草稿丸：草稿卷里有题 ─────────────────────────────────
    await step('basket-home', async () => {
      await addDraftItems(page)
      await page.goto(rig.base + '/'); await settle(page, 2000); await park()
      const b = page.locator(BASKET)
      await shotAround(page, `basket-home${suffix}`, [b], 24); rec.basketHome = await page.evaluate(measure, BASKET)
      rec.basketHomeAx = await ax(page, b)
      if (!narrow) {
        await b.hover(); await sleep(400)
        await shotAround(page, 'basket-home-hover', [b], 24); rec.basketHomeHover = await page.evaluate(measure, BASKET)
        await page.mouse.down(); await sleep(250)
        await shotAround(page, 'basket-home-active', [b], 24); rec.basketHomeActive = await page.evaluate(measure, BASKET)
        // 松开前把指针挪走，不触发点击
        await page.mouse.move(2, height - 2); await page.mouse.up(); await sleep(300)
        await keyFocus(b)
        await shotAround(page, 'basket-home-focus', [b], 24); rec.basketHomeFocus = await page.evaluate(measure, BASKET)
        await blur()
      }
    })

    // ── 详情页：草稿丸（小号）；加入以后那块纸（圆角） ───────────────
    await step('detail', async () => {
      await page.goto(rig.base + `/?view=detail&groupId=group-2024-i-reading-b`); await settle(page, 2500); await park()
      const b = page.locator(BASKET)
      await shotAround(page, `basket-detail${suffix}`, [b], 24); rec.basketDetail = await page.evaluate(measure, BASKET)
      if (!narrow) {
        await b.hover(); await sleep(400)
        await shotAround(page, 'basket-detail-hover', [b], 24); rec.basketDetailHover = await page.evaluate(measure, BASKET)
        await park(); await keyFocus(b)
        await shotAround(page, 'basket-detail-focus', [b], 24); rec.basketDetailFocus = await page.evaluate(measure, BASKET)
        await blur()
        await page.locator('.peek-add').first().click({ timeout: 8000 }); await sleep(1500); await park()
        await full('r-detail-added'); rec.radius.detailAdded = await page.evaluate(radii, RADIUS_SEL)
      }
    })

    // ── 整卷页：草稿丸 ─────────────────────────────────────
    if (!narrow) await step('paper', async () => {
      await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 3500); await park()
      const b = page.locator(BASKET)
      await shotAround(page, 'basket-paper', [b], 24); rec.basketPaper = await page.evaluate(measure, BASKET)
      await b.hover(); await sleep(400)
      await shotAround(page, 'basket-paper-hover', [b], 24)
      await park(); await keyFocus(b)
      await shotAround(page, 'basket-paper-focus', [b], 24); rec.basketPaperFocus = await page.evaluate(measure, BASKET)
      await blur()
    })

    // ── 草稿卷：「换篇」栏里的理由小签；移除后的底部提示（圆角） ─────────
    if (!narrow) await step('draft', async () => {
      await page.goto(rig.base + '/?view=draft-paper')
      const swap = page.locator('button').filter({ hasText: /^换篇$/ }).first()
      await swap.waitFor({ timeout: 150000 }); await settle(page, 1500)
      await swap.click(); await settle(page, 1500); await park()
      const list = page.locator('.similar-rcard-list').first()
      await list.waitFor({ timeout: 15000 })
      await shotAround(page, 'similar-draft', [list], 12)
      rec.similarDraft = await page.evaluate(measure, '.similar-rcard-chips > *')
      await swap.click(); await sleep(600)
      const t = page.locator('[aria-label="更多题组操作"]').first(); await t.click({ timeout: 8000 }); await sleep(400)
      await page.locator('[role=menuitem]').filter({ hasText: /移除/ }).first().click({ timeout: 8000 })
      await page.locator('.draft-undo-toast[data-visible="true"]').first().waitFor({ timeout: 15000 }); await sleep(600); await park()
      await full('r-draft-toast'); rec.radius.draftToast = await page.evaluate(radii, RADIUS_SEL)
    })

    rec.errors = errors
    result[width] = rec
    await context.close()
  }
} finally {
  writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
for (const [w, r] of Object.entries(result)) console.log(w, 'missing:', r.missing.length ? r.missing : '无', 'errors:', r.errors?.length || 0)
process.exit(0)
