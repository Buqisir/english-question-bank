#!/usr/bin/env node
// 胶囊构件第二轮的改前改后对照（design/components-2026-11-13/migrate-chip-r2/）。沿用 chip-shots.mjs 的量法。
// 拍这几处：
//  - 首页筛选面板里的筛选胶囊（原 .concierge-starter-chip）：静止、悬停、键盘焦点、选中；390 宽。
//  - 收起筛选面板后露出的已选筛选（原 .concierge-active-filter-chip）：静止、悬停、键盘焦点；390 宽。
//  - 详情页题型分布 / 话题小签（.peek-chip / .peek-topic）。
//  - 讲评栏的完形、语法填空小签不在这里拍：测试数据里没有已发布的解析，讲评栏只显示「解析未发布」，
//    改用 chip-r2-lecture-sheet.mjs 按面板原样标记 + 仓库里的真样式排样张。
//  - 相似篇章理由小签：首页面板、草稿卷「换篇」窄栏（第二轮加了一行不换行、放不下打省略号；造一条长理由看截断）。
//  - 词汇听写公开页的进度条和「重播本题」（--radius-pill 换成 --eqb-radius-pill）。
//    测试数据里没有分享出去的听写，拦 GET /api/public/vocabulary/dictation/shot 回三个假词条（只在截图里）。
//  - 顶栏头像（6px → --eqb-radius-control 8px），README 里放大 4 倍对照。
//  - 草稿丸读屏名（首页、整卷页）。
//  - 浏览页筛选胶囊（字号换成 --eqb-font-size-control，样子应不变，拍一张核对）。
// 宽屏 1440×900 和窄屏 390×844，DPR 2，减少动效。
//
// 本地网站：rig.mjs 自己起一份，默认端口偏移 58，种子 full。
// 用法：node scripts/component-inventory/chip-r2-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-chip-r2/<before|after>/（*.png + measure.json）
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '58'
if (!process.env.INVENTORY_SEED) process.env.INVENTORY_SEED = 'full'
const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
const path = (await import('node:path')).default
const { ROOT, requireFromApp } = await import('./lib.mjs')
const { startRig } = await import('./rig.mjs')
const { addDraftItems, login, settle, sleep } = await import('./scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：chip-r2-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-chip-r2', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const PAPER = '/?view=paper-browse&paperId=paper-2026-i'

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`, lineHeight: cs.lineHeight,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, cursor: cs.cursor, whiteSpace: cs.whiteSpace,
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      title: e.getAttribute('title') || undefined,
      truncated: (() => { const l = e.querySelector('.eqb-chip-label') || e; return l.scrollWidth > l.clientWidth + 0.5 || undefined })(),
      pressed: e.getAttribute('aria-pressed') || undefined,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
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

const LONG_REASON = '同话题：人与自然 · 生态保护与可持续发展（拍图用的长理由）'
const FAKE_SIMILAR = {
  seedProfile: { groupType: 'reading', topicLabels: ['人与自然'] },
  results: [
    { groupId: 'group-2024-i-reading-b', paperId: null, title: '2024 新课标 I 卷 阅读 B', sourceLabel: '2024 · 新课标 I 卷', score: 0.9,
      reasons: [{ kind: 'topic-match', label: LONG_REASON }, { kind: 'position-slot', label: '同篇位 A' }, { kind: 'authentic-source', label: '真题' }] },
    { groupId: 'group-2024-jia-reading-c', paperId: null, title: '2024 全国甲卷 阅读 C', sourceLabel: '2024 · 全国甲卷', score: 0.8,
      reasons: [{ kind: 'topic-match', label: '同话题：人与自然' }, { kind: 'authentic-source', label: '真题' }] },
  ],
  poolStats: { totalInPool: 12, returned: 2 },
  notice: null,
}
const FAKE_DICTATION = {
  vocabularySet: {
    title: '拍图用听写', entryCount: 3, createdAt: '2026-11-14T00:00:00Z',
    entries: ['apple', 'river', 'window'].map((w, i) => ({ id: `shot-${i}`, answer: w, partOfSpeech: 'n.', sourceMeanings: ['（假词条）'], teachingSense: null, audio: null })),
  },
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
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const narrow = suffix !== ''
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/similar-passages$/, (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SIMILAR) }) : route.fallback())
    await context.route(/\/api\/public\/vocabulary\/dictation\/shot$/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_DICTATION) }))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(300) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(300) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(200) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }

    // ── 词汇听写公开页（不用登录） ─────────────────────────────
    await step('dictation', async () => {
      await page.goto(rig.base + '/vocabulary/dictation/shot'); await settle(page, 2000)
      const bar = page.locator('.vocabulary-dictation-progress'), replay = page.locator('.vocabulary-dictation-replay')
      await bar.waitFor({ timeout: 20000 }); await park()
      await shotAround(page, `dictation-progress${suffix}`, [bar], 12)
      rec.dictationProgress = await page.evaluate(measure, '.vocabulary-dictation-progress, .vocabulary-dictation-progress span')
      await keyFocus(replay)
      await shotAround(page, `dictation-replay-focus${suffix}`, [replay], 12)
      rec.dictationReplay = await page.evaluate(measure, '.vocabulary-dictation-replay')
      await blur()
    })

    await login(page, rig.base)

    // ── 顶栏头像 ─────────────────────────────────────────
    await step('avatar', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500); await park()
      const a = page.locator('.topbar-avatar').first(); await a.waitFor({ timeout: 15000 })
      await shotAround(page, `avatar${suffix}`, [a], 4)
      rec.avatar = await page.evaluate(measure, '.topbar-avatar')
    })

    // ── 首页筛选面板里的筛选胶囊 + 收起后的已选筛选 ───────────────
    const STARTER = '.concierge-filter-row .concierge-starter-chip'
    const ACTIVE = '.concierge-active-filter-chip'
    await step('filter', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter')
      const toggle = page.locator('.concierge-command-filter-toggle'); await toggle.waitFor({ timeout: 30000 }); await settle(page, 1200)
      await toggle.click(); await page.locator('.concierge-filter-row').first().waitFor({ timeout: 10000 }); await sleep(600); await blur(); await park()
      const row = page.locator('.concierge-filter-row').first()
      await shotAround(page, `filter-row${suffix}`, [row], 12)
      rec.starter = await page.evaluate(measure, STARTER)
      const first = page.locator(`${STARTER}:not(.is-zero)`).first()
      rec.starterAx = await ax(page, first)
      if (!narrow) {
        await first.hover(); await sleep(400); await shotAround(page, 'filter-row-hover', [row], 12); rec.starterHover = await page.evaluate(measure, STARTER); await park()
        await keyFocus(first); await shotAround(page, 'filter-row-focus', [row], 12); rec.starterFocus = await page.evaluate(measure, STARTER); await blur()
      }
      await first.click(); await sleep(900); await blur(); await park()
      await shotAround(page, `filter-row-selected${suffix}`, [row], 12)
      rec.starterSelected = await page.evaluate(measure, STARTER)
      rec.starterSelectedAx = await ax(page, page.locator(`${STARTER}[aria-pressed="true"]`).first())
      // 收起面板：命令行下露出已选筛选
      await toggle.click(); await sleep(900); await blur(); await park()
      const act = page.locator(ACTIVE).first(); await act.waitFor({ timeout: 10000 })
      await shotAround(page, `active-filter${suffix}`, [page.locator('.concierge-active-filter-chips').first(), toggle], 12)
      rec.active = await page.evaluate(measure, ACTIVE)
      rec.activeAx = await ax(page, act)
      if (!narrow) {
        await act.hover(); await sleep(400); await shotAround(page, 'active-filter-hover', [page.locator('.concierge-active-filter-chips').first()], 12); rec.activeHover = await page.evaluate(measure, ACTIVE); await park()
        await keyFocus(act); await shotAround(page, 'active-filter-focus', [page.locator('.concierge-active-filter-chips').first()], 12); rec.activeFocus = await page.evaluate(measure, ACTIVE); await blur()
      }
    })

    // ── 首页相似篇章面板的理由小签 ─────────────────────────────
    if (!narrow) await step('similar-home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const i = page.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(page, 3000); await park()
      const trigger = page.locator('.concierge-group-row-menu-trigger').first()
      if (!(await trigger.isVisible().catch(() => false))) { await page.locator('.concierge-paper-row').first().click({ timeout: 8000 }); await sleep(1200) }
      await trigger.waitFor({ timeout: 10000 }); await trigger.scrollIntoViewIfNeeded()
      await trigger.click({ timeout: 8000 }); await sleep(500)
      await page.locator('.eqb-menu-item').filter({ hasText: '相似篇章' }).first().click({ timeout: 8000 }); await settle(page, 1500); await park()
      const panel = page.locator('.similar-passages-panel').first(); await panel.waitFor({ timeout: 15000 })
      await panel.scrollIntoViewIfNeeded(); await sleep(300)
      await shotAround(page, 'similar-home', [panel.locator('.similar-rcard-list')], 12)
      rec.similarHome = await page.evaluate(measure, '.similar-rcard-chips > *')
      rec.similarHomeAx = await ax(page, panel.locator('.similar-rcard-chips > *').first())
    })

    // ── 浏览页筛选胶囊（核对字号变量没改样子） ─────────────────────
    if (!narrow) await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await settle(page, 2000); await park()
      const row = page.locator('.concierge-browse-chips').first(); await row.waitFor({ timeout: 15000 })
      await shotAround(page, 'browse-chips', [row])
      rec.browse = await page.evaluate(measure, '.concierge-browse-chip')
    })

    // ── 详情页题型分布 / 话题小签 ─────────────────────────────
    await step('detail', async () => {
      const tried = []
      for (const g of ['group-2026-i-reading-a', 'group-2026-i-cloze', 'group-2026-i-grammar-fill', 'group-2026-i-seven-choices', 'group-2024-i-reading-b']) {
        await page.goto(rig.base + `/?view=detail&groupId=${g}`); await settle(page, 2500); await park()
        const n = await page.locator('.peek-chips, .peek-topics').count()
        tried.push(`${g}:${n}`)
        if (n) {
          await shotAround(page, `detail-peek${suffix}`, [page.locator('.peek-hero').first()], 8)
          rec.peek = await page.evaluate(measure, '.peek-chip, .peek-topic')
          rec.peekGroup = g
          break
        }
      }
      rec.peekTried = tried
    })

    // ── 草稿丸读屏名 ───────────────────────────────────────
    await step('basket', async () => {
      await addDraftItems(page)
      await page.goto(rig.base + '/'); await settle(page, 2000); await park()
      const b = page.locator('.basket-chip'); await b.waitFor({ timeout: 15000 })
      rec.basketHome = await page.evaluate(measure, '.basket-chip'); rec.basketHomeAx = await ax(page, b)
    })

    // ── 整卷页草稿丸读屏名 ───────────────────────────────────
    if (!narrow) await step('basket-paper', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3500); await park()
      const b = page.locator('.basket-chip'); await b.waitFor({ timeout: 15000 })
      rec.basketPaperAx = await ax(page, b)
    })

    // ── 草稿卷「换篇」窄栏里的理由小签 ─────────────────────────
    if (!narrow) await step('similar-draft', async () => {
      await page.goto(rig.base + '/?view=draft-paper')
      const swap = page.locator('button').filter({ hasText: /^换篇$/ }).first()
      await swap.waitFor({ timeout: 150000 }); await settle(page, 1500)
      await swap.click(); await settle(page, 1500); await park()
      const list = page.locator('.similar-rcard-list').first(); await list.waitFor({ timeout: 15000 })
      await shotAround(page, 'similar-draft', [list], 12)
      rec.similarDraft = await page.evaluate(measure, '.similar-rcard-chips > *')
      // 指针停到被截断的那一条上，看提示
      const long = page.locator('.similar-rcard-chips > *').filter({ hasText: '拍图用的长理由' }).first()
      if (await long.count()) { await long.hover(); await sleep(400); rec.similarDraftLongHover = (await page.evaluate(measure, '.similar-rcard-chips > *')).find((m) => m.text.includes('拍图用')) }
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
