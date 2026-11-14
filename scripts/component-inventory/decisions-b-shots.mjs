#!/usr/bin/env node
// Owner 2026-11-14 决定第 1 条（纯文字键换成淡墨小号 quiet sm）改前改后对照。
// 换的键：首页筛选面板「更多筛选 / 收起筛选」「清除筛选」、相似篇章面板「收起」（首页、详情页）、
// 草稿卷换篇栏「返回目录」、整卷预览相似栏「← 返回解析」、讲评栏「文章简介」、七选五「全部显示 / 全部隐藏」、
// 词典卡「更多义项 N」「详细解释」「署名与隐私」、过生词「查看 / 调整进度」。
// 每个键拍静止、悬停、键盘焦点，有展开状态的再拍展开；宽屏 1440 和窄屏 390。
// 量出键的框、字的框（文字节点的外框）、图标的框、实算样式、在不在会滑的悬停列表里、读屏树。
//
// 这几个键在清点用的本地网站里有的平时出不来，脚本拦了几个接口让它们出现（只在截图里，站点不改）：
// - POST /api/similar-passages：和 decisions-a2-shots.mjs 同一份（三张卡）。
// - GET /api/question-groups/group-2026-i-reading-a：补 paperSurfaceHref，露出详情页「相似篇章」入口（同 A2）。
// - 整卷预览：paper-rest-shots.mjs 同一套（卷子资产投影、consumption 补 sourceAssetVersion）。
// - 词典：/api/paper-dictionary/status 回「可用」，/lookup 回一个假词条（两个核心义、两个少见义、带学习者解释），
//   /api/vocabulary-notebook/selection-state 回「没加过」。和 verify-sentence-analysis-browser.mjs 的拦法同一个意思。
// - 讲评栏解析：本地网站的 paper-2026-i 没有阅读、七选五解析（讲评栏只出「解析未发布」）。这里把
//   paper-assets/paper-2026-i/versions/*/analyses/{reading-choice,seven-choices}-analysis-v1.json 换成仓库里
//   test-fixtures/retired-paper-assets/paper-2026-i/latest/analyses/ 的同名文件，露出「文章简介」和「全部显示 / 全部隐藏」。
// 数据：过生词页要词汇课程。和 vocab-review-shots.mjs 一样，网站起来以后用 scripts/vocabulary/import-calibration-program.mjs
//   把 30 词的校准课程导进这次临时的数据库（rigdata-40/qb.sqlite），不碰仓库里的数据库。
//
// 本地网站：用 rig.mjs 自己起一份。默认端口偏移 40（INVENTORY_PORT_OFFSET），数据放 rigdata-40，
// 不碰别人可能正在用的 5299 / 9912 和 rigdata。
//
// 用法：node scripts/component-inventory/decisions-b-shots.mjs before|after
// 输出：design/components-2026-11-13/decisions-2026-11-14/batch-b/<before|after>/（shots/*.png + measure.json）
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '40'
const { mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
const { spawnSync } = await import('node:child_process')
const path = (await import('node:path')).default
const { pathToFileURL } = await import('node:url')
const { RAW, ROOT, requireFromApp } = await import('./lib.mjs')
const { startRig } = await import('./rig.mjs')
const { addDraftItems, login, settle, sleep } = await import('./scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：decisions-b-shots.mjs before|after'); process.exit(2) }
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const OUT = path.join(ROOT, 'design/components-2026-11-13/decisions-2026-11-14/batch-b', label)
for (const f of ['shots', 'measure.json']) rmSync(path.join(OUT, f), { recursive: true, force: true })
mkdirSync(path.join(OUT, 'shots'), { recursive: true })

const PAPER_ID = 'paper-2026-i'
const PAPER = `/?view=paper-browse&paperId=${PAPER_ID}`
const SEED_GROUP = 'group-2026-i-reading-a'
const DRAFT_GROUPS = ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c']

// 量一个键：键的框、字的框（所有非空文字节点的外框）、图标的框、实算样式，以及在不在会滑的悬停列表里。
function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  const union = (rects) => {
    const rs = rects.filter((r) => r.width > 0 && r.height > 0)
    if (!rs.length) return null
    const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top))
    const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom))
    return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) }
  }
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    const texts = []
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue
      const range = document.createRange(); range.selectNodeContents(n)
      texts.push(...range.getClientRects())
    }
    const textNode = (() => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) return n.parentElement; return e })()
    const tcs = getComputedStyle(textNode)
    const svgs = [...e.querySelectorAll('svg')]
    const after = getComputedStyle(e, '::after')
    const hoverList = e.closest('.fluid-hover-list')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      tone: e.getAttribute('data-tone') || undefined, size: e.getAttribute('data-size') || undefined,
      expanded: e.getAttribute('aria-expanded') || undefined, controls: e.getAttribute('aria-controls') || undefined,
      box: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
      textBox: union(texts),
      iconBox: svgs.length ? union(svgs.map((s) => s.getBoundingClientRect())) : null,
      afterBox: after.content && after.content !== 'none' ? { w: after.width, h: after.height, ml: after.marginLeft } : null,
      bg: cs.backgroundColor, color: tcs.color, font: `${tcs.fontSize}/${tcs.fontWeight}`, lineHeight: cs.lineHeight,
      deco: tcs.textDecorationLine,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
      radius: cs.borderRadius, gap: cs.columnGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      inFluidHoverList: hoverList ? (typeof hoverList.className === 'string' ? hoverList.className : true) : false,
      fluidHoverActive: e.hasAttribute('data-fluid-hover-active') || undefined,
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
  await page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 读屏树：Chrome 自己算出来的 role / name / description / expanded（CDP Accessibility），不是从属性猜的。
async function ax(page, locator) {
  const tag = `b-${Math.random().toString(36).slice(2)}`
  if (!(await locator.evaluate((e, t) => { e.setAttribute('data-b-ax', t); return true }, tag).catch(() => false))) return null
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-b-ax="${tag}"]` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value]))
    return {
      role: n.role?.value, name: n.name?.value, nameFrom: n.name?.sources?.find((s) => s.value)?.type,
      description: n.description?.value ?? null, expanded: props.expanded, disabled: props.disabled, focusable: props.focusable,
    }
  } finally {
    await locator.evaluate((e) => e.removeAttribute('data-b-ax')).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}

// ---------- 拦接口 ----------
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
const kept = { groups: null }

const DICT_ENTRY = {
  schemaVersion: 'paper-dictionary-lookup-v1', requestId: 'shot', sourceRevision: 'shot', dictionaryVersion: 'shot',
  selectedText: 'destination', status: 'found', truncated: false,
  attribution: 'Open Dictionary / Wiktionary 衍生数据（拍图用假词条）',
  entries: [{
    entryId: 'shot-destination', headword: 'destination',
    gaokao: { frequencyStage: 'mid', frequencyRank: 1800 },
    posGroups: [{
      posGroupIndex: 0, pos: 'noun', posLabel: 'n.', etymologyId: null, morphologyLabels: [], matchedForm: 'destination',
      pronunciations: [{ pronunciationId: 'p1', ipa: '/ˌdestɪˈneɪʃn/', dialect: 'uk', dialectLabel: '英', spokenForm: 'destination', audio: null }],
      senses: [
        { senseId: 's1', priority: 'core', shortGloss: '目的地；终点', learnerExplanation: '人或东西要去、要被送到的地方。' },
        { senseId: 's2', priority: 'core', shortGloss: '（旅游）胜地', learnerExplanation: '很多人专门去的地方，比如景点。' },
        { senseId: 's3', priority: 'common', shortGloss: '归宿；目标', learnerExplanation: '想要达到的结果或位置。' },
        { senseId: 's4', priority: 'rare', shortGloss: '预定用途', learnerExplanation: null },
      ],
    }],
  }],
}

async function routes(context) {
  await context.route(/\/api\/similar-passages$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const seed = JSON.parse(route.request().postData() || '{}').groupId
    const pool = (kept.groups || []).filter((g) => g.id !== seed)
    const fresh = pool.filter((g) => !DRAFT_GROUPS.includes(g.id)).slice(0, 2)
    const inDraft = pool.filter((g) => DRAFT_GROUPS.includes(g.id)).slice(0, 1)
    const results = [...fresh, ...inDraft].map((g, i) => ({
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
  await context.route(/\/paper-assets\/[^/]+\/versions\/v\d+\/paper-asset\.json$/, async (route) => {
    const res = await route.fetch()
    const m = /\/paper-assets\/([^/]+)\/versions\/(v\d+)\//.exec(new URL(route.request().url()).pathname)
    let body = await res.text()
    try {
      const { asset } = loadCanonicalSourceAssetRepresentation({ sourceAsset: JSON.parse(body), versionDir: path.join(RIGDATA, 'assets', m[1], 'versions', m[2]), label: 'rig', reject: (msg) => { throw new Error(msg) } })
      body = JSON.stringify(asset)
    } catch {}
    await route.fulfill({ response: res, body })
  })
  await context.route(/\/api\/paper-canonical\/consumption\?/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    if (json && json.sourceAssetVersion == null) json.sourceAssetVersion = 1
    await route.fulfill({ response: res, body: JSON.stringify(json) })
  })
  await context.route(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) }))
  // 讲评栏解析（阅读、七选五）：换成 retired-paper-assets 里同一套卷的解析文件
  await context.route(new RegExp(`/paper-assets/${PAPER_ID}/versions/v\\d+/analyses/(reading-choice|seven-choices)-analysis-v1\\.json$`), (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()
    const body = readFileSync(path.join(ROOT, 'test-fixtures/retired-paper-assets', PAPER_ID, 'latest/analyses', file), 'utf8')
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  // 词典
  await context.route(/\/api\/paper-dictionary\/status$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true, dictionaryVersion: 'shot', reason: 'ok',
    sensePick: { enabled: false }, limits: { maxWordUtf16: 64, maxBodyBytes: 65536, maxResponseBytes: 1048576 },
  }) }))
  // 回包要带回请求里的 sourceRevision 和选中的字，页面才认（usePaperSelectionTranslation.tsx 的核对）
  await context.route(/\/api\/paper-dictionary\/lookup$/, (route) => {
    const req = JSON.parse(route.request().postData() || '{}')
    const selectedText = req.segments?.[0]?.selectedText ?? DICT_ENTRY.selectedText
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...DICT_ENTRY, sourceRevision: req.sourceRevision, selectedText }) })
  })
  await context.route(/\/api\/paper-dictionary\/(?!status$|lookup$)/, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"shot"}' }))
  await context.route(/\/api\/vocabulary-notebook\/selection-state/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'not-added', contextId: null, entryId: null }) }))
}

const INPUT = '.concierge-intent-input'
const FILTER = '.concierge-command-filter-toggle'
const FILTER_ACTIONS = '.concierge-filter-actions'
const MORE = `${FILTER_ACTIONS} > :nth-child(1)`
const PAPER_HEAD = '.concierge-paper-row-head'
const GROUP_LINE = '.concierge-group-row-line'
const MENU_ITEMS = '.eqb-menu .eqb-menu-item'
const PANEL = '.similar-passages-panel'
const BACK = '.similar-backlink'
const SWAP = '.draft-group-actions > button:has(.draft-group-actions-label)'
const DRAWER = '.draft-swap-drawer'
const RAIL_HEAD = '.similar-rail-head'
const OVERVIEW = '.paper-browse-reading-overview-toggle'
const SEVEN = '.pi-seven-panel-actions'
const DICT = '.paper-dictionary-card'
const VOCAB_TOGGLE = '.vocabulary-progress-toggle'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RIGDATA, 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) { await rig.stop(); throw new Error('导入校准课程失败：' + imported.stderr.slice(-400)) }
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {
  base: rig.base,
  intercepted: [
    'POST /api/similar-passages：三张卡（同 decisions-a2-shots.mjs）',
    `GET /api/question-groups/${SEED_GROUP}：补 paperSurfaceHref（露出详情页「相似篇章」入口）`,
    '整卷预览：资产投影、consumption 补 sourceAssetVersion、审阅线程 404（同 paper-rest-shots.mjs）',
    `讲评栏解析：paper-assets/${PAPER_ID}/versions/*/analyses/{reading-choice,seven-choices}-analysis-v1.json 换成 test-fixtures/retired-paper-assets/${PAPER_ID}/latest/analyses/ 的同名文件`,
    '词典：status 回可用、lookup 回一个假词条（destination，两个核心义、一个常见义、一个少见义）、生词本 selection-state 回没加过',
  ],
}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await routes(context)
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
    // 一个键的三种样子：静止、悬停、键盘焦点。region 是截图范围（改前改后都认得的容器）。
    const states = async (name, sel, region, pad = 12) => {
      const key = page.locator(sel).first()
      await key.scrollIntoViewIfNeeded(); await sleep(200); await blur(); await park()
      const out = {}
      await shotAround(page, `${name}${suffix}`, [region], pad)
      out.still = (await page.evaluate(measure, sel))[0]
      out.ax = await ax(page, key)
      await key.hover(); await sleep(400)
      await shotAround(page, `${name}-hover${suffix}`, [region], pad)
      out.hover = (await page.evaluate(measure, sel))[0]
      await park(); await keyFocus(key)
      await shotAround(page, `${name}-focus${suffix}`, [region], pad)
      out.focus = (await page.evaluate(measure, sel))[0]
      await blur(); await park()
      return out
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
    }

    // ---------- 首页筛选面板底下那一排：「更多筛选 / 收起筛选」「清除筛选」 ----------
    await step('filter', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator(INPUT); await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator(FILTER).waitFor({ timeout: 30000 }); await settle(page, 1200)
      await page.locator(FILTER).click(); await page.locator(FILTER_ACTIONS).waitFor({ timeout: 10000 }); await sleep(600); await blur(); await park()
      const row = page.locator('.concierge-filter-row').first()
      await shotAround(page, `filter-panel${suffix}`, [row], 12)
      rec.filterRow = await page.evaluate(measure, `${FILTER_ACTIONS} > *`)
      rec.more = await states('filter-more', MORE, page.locator(FILTER_ACTIONS), 16)
      await page.locator(MORE).click(); await sleep(600); await blur(); await park()
      rec.moreExpanded = await states('filter-more-expanded', MORE, page.locator(FILTER_ACTIONS), 16)
      await shotAround(page, `filter-panel-expanded${suffix}`, [row], 12)
      await page.locator(MORE).click(); await sleep(600); await blur(); await park()
      // 选一个筛选，「清除筛选」才出来
      await page.locator('.concierge-filter-row .concierge-starter-chip:not(.is-zero)').first().click(); await sleep(800)
      const clear = `${FILTER_ACTIONS} > :nth-child(2)`
      await page.locator(clear).waitFor({ timeout: 10000 }); await blur(); await park()
      rec.filterRowWithClear = await page.evaluate(measure, `${FILTER_ACTIONS} > *`)
      await shotAround(page, `filter-panel-chosen${suffix}`, [row], 12)
      rec.clear = await states('filter-clear', clear, page.locator(FILTER_ACTIONS), 16)
    })

    // ---------- 首页题组卡「⋯ → 相似篇章」面板的「收起」 ----------
    await step('home-similar', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1200)
      const input = page.locator(INPUT); await input.fill('2026 阅读'); await input.press('Enter')
      const head = page.locator(PAPER_HEAD).first(); await head.waitFor({ timeout: 30000 }); await settle(page, 1200)
      if ((await head.locator('.concierge-row-expand').getAttribute('aria-expanded')) !== 'true') { await head.locator('.concierge-paper-body').first().click(); await sleep(800) }
      const line = page.locator(GROUP_LINE).first(); await line.waitFor({ timeout: 10000 })
      await line.locator('.concierge-group-row-menu-trigger').click(); await sleep(400)
      await page.locator(MENU_ITEMS).filter({ hasText: '相似篇章' }).first().click()
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rcard').first().waitFor({ timeout: 15000 }); await settle(page, 800)
      rec.homeCollapse = await states('home-similar-collapse', `${PANEL} ${BACK}`, page.locator(`${PANEL} .similar-passages-head`).first(), 12)
      await shotAround(page, `home-similar${suffix}`, [panel], 12)
    })

    // ---------- 详情页的相似篇章面板「收起」 ----------
    await step('detail-similar', async () => {
      await page.goto(rig.base + `/?view=detail&groupId=${SEED_GROUP}`); await settle(page, 2000)
      await page.locator('[data-ra-entry="detail-view-similar"]').click({ timeout: 10000 })
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rcard').first().waitFor({ timeout: 15000 }); await settle(page, 800)
      rec.detailCollapse = await states('detail-similar-collapse', `${PANEL} ${BACK}`, page.locator(`${PANEL} .similar-passages-head`).first(), 12)
    })

    // ---------- 草稿卷换篇栏「返回目录」 ----------
    await step('draft', async () => {
      await addDraftItems(page)
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator(SWAP).first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
      await page.locator(SWAP).first().click()
      const drawer = page.locator(DRAWER).first(); await drawer.locator('.similar-rcard').first().waitFor({ timeout: 30000 }); await settle(page, 1200)
      rec.draftBack = await states('draft-back', `${DRAWER} ${BACK}`, drawer.locator('.similar-passages-head').first(), 8)
      await drawer.scrollIntoViewIfNeeded(); await sleep(200); await park()
      await shotAround(page, `draft-drawer${suffix}`, [drawer], 8)
      await page.locator(`${DRAWER} ${BACK}`).click(); await sleep(600)
    })

    // ---------- 整卷预览：相似栏「← 返回解析」 ----------
    await step('rail-back', async () => {
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1&similar=1')
      await page.locator(RAIL_HEAD).first().waitFor({ timeout: 60000 }); await settle(page, 2500)
      rec.railBack = await states('rail-back', `${RAIL_HEAD} ${BACK}`, page.locator(RAIL_HEAD).first(), 12)
    })

    // ---------- 讲评栏「文章简介」 ----------
    await step('overview', async () => {
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1')
      await page.locator(OVERVIEW).first().waitFor({ timeout: 60000 }); await settle(page, 2500)
      const header = page.locator('.paper-browse-reading-header').first()
      if ((await page.locator(OVERVIEW).first().getAttribute('aria-expanded')) === 'true') { await page.locator(OVERVIEW).first().click(); await sleep(500) }
      rec.overview = await states('overview', OVERVIEW, header, 12)
      await page.locator(OVERVIEW).first().click(); await sleep(600); await blur(); await park()
      rec.overviewExpanded = await states('overview-expanded', OVERVIEW, header, 12)
      await page.locator(OVERVIEW).first().click(); await sleep(400)
    })

    // ---------- 七选五讲评「全部显示 / 全部隐藏」 ----------
    await step('seven', async () => {
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-seven-choices&questionId=q-2026-i-036&lecture=1')
      await page.locator(SEVEN).first().waitFor({ timeout: 60000 }); await settle(page, 2500)
      const bar = page.locator(SEVEN).first()
      const head = page.locator('.pi-seven-panel-header').first()
      rec.sevenRow = await page.evaluate(measure, `${SEVEN} > button`)
      rec.sevenShow = await states('seven-show', `${SEVEN} > button:nth-child(1)`, bar, 12)
      rec.sevenHide = await states('seven-hide', `${SEVEN} > button:nth-child(2)`, bar, 12)
      await shotAround(page, `seven-head${suffix}`, [head, bar], 8)
      // 全部显示以后「全部显示」禁用
      await page.locator(`${SEVEN} > button:nth-child(1)`).click(); await sleep(600); await blur(); await park()
      await shotAround(page, `seven-all-open${suffix}`, [bar], 12)
      rec.sevenAllOpen = await page.evaluate(measure, `${SEVEN} > button`)
      rec.sevenShowDisabledAx = await ax(page, page.locator(`${SEVEN} > button:nth-child(1)`))
    })

    // ---------- 词典卡：「更多义项 N」「详细解释」「署名与隐私」 ----------
    await step('dictionary', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      // 选中卷面阅读 A 第一段的「destination」
      const ok = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = n.textContent.indexOf('destination')
          if (i < 0 || !n.parentElement.closest('.ps-surface, [class*="paper-surface"], .paper-browse-page')) continue
          n.parentElement.scrollIntoView({ block: 'center' })
          const s = window.getSelection(); s.removeAllRanges(); s.setBaseAndExtent(n, i, n, i + 'destination'.length)
          return true
        }
        return false
      })
      if (!ok) throw new Error('卷面上没找到 destination')
      await sleep(300)
      // 让选区监听收到一次抬起
      const box = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      await page.mouse.move(box.x, box.y); await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')))
      await page.mouse.up().catch(() => {})
      await page.locator('.paper-selection-lookup').first().waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator('.paper-selection-lookup').first().click()
      const card = page.locator(DICT).first()
      await card.locator('.paper-dictionary-detail-toggle').waitFor({ timeout: 15000 }); await sleep(800)
      await shotAround(page, `dict-card${suffix}`, [card], 8)
      rec.dictKeys = await page.evaluate(measure, `${DICT} :is(.paper-dictionary-rare-toggle, .paper-dictionary-detail-toggle, .paper-dictionary-credits-toggle)`)
      // 截图范围用整张卡：键在卡里，卡的位置跟着选区走，改前改后一样
      const dictStates = async (name, sel) => {
        const key = page.locator(sel).first()
        const out = {}
        await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(2, height - 2); await sleep(300)
        out.still = (await page.evaluate(measure, sel))[0]
        out.ax = await ax(page, key)
        await key.hover(); await sleep(400)
        await shotAround(page, `${name}-hover${suffix}`, [card], 8)
        out.hover = (await page.evaluate(measure, sel))[0]
        await page.mouse.move(2, height - 2); await sleep(200)
        await keyFocus(key)
        await shotAround(page, `${name}-focus${suffix}`, [card], 8)
        out.focus = (await page.evaluate(measure, sel))[0]
        // 展开
        await key.press('Enter'); await sleep(500)
        await page.mouse.move(2, height - 2); await sleep(200)
        await shotAround(page, `${name}-expanded${suffix}`, [card], 8)
        out.expanded = (await page.evaluate(measure, sel))[0]
        out.expandedAx = await ax(page, key)
        await key.press('Enter'); await sleep(400)
        return out
      }
      rec.dictRare = await dictStates('dict-rare', `${DICT} .paper-dictionary-rare-toggle`)
      rec.dictDetail = await dictStates('dict-detail', `${DICT} .paper-dictionary-detail-toggle`)
      rec.dictCredits = await dictStates('dict-credits', `${DICT} .paper-dictionary-credits-toggle`)
    })

    // ---------- 过生词「查看 / 调整进度」 ----------
    await step('vocab', async () => {
      await page.goto(rig.base + '/?view=vocabulary-review'); await page.locator(VOCAB_TOGGLE).first().waitFor({ timeout: 30000 }); await settle(page, 1500)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      const region = page.locator('.vocabulary-overall-progress').first()
      rec.vocab = await states('vocab-progress', VOCAB_TOGGLE, region, 16)
      await page.screenshot({ path: path.join(OUT, 'shots', `vocab-head${suffix}.png`), clip: { x: 0, y: 0, width, height: Math.min(height, 360) } })
      await page.locator(VOCAB_TOGGLE).first().click(); await sleep(800); await blur(); await park()
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      rec.vocabExpanded = await states('vocab-progress-expanded', VOCAB_TOGGLE, region, 16)
      await page.locator(VOCAB_TOGGLE).first().click(); await sleep(500)
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
