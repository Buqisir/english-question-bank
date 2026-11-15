#!/usr/bin/env node
// 拍板落地 D 批（按钮第 18 到 22 条）改前改后对照。
// 第 18 条：打开着的键只有弹出类（菜单、弹层、筛选面板）垫桌色底；就地展开收起的键展开后静止时不垫底。
//   就地展开类拍展开后的静止 / 悬停 / 键盘焦点：首页「收起筛选」、讲评栏「文章简介」（展开后）、过生词「收起进度」、
//   词典卡「收起」（义项）「收起解释」「署名与隐私」（展开后）、过生词「取消」（新建学生展开后）、七选五「收起细节」。
//   弹出类拍打开着的样子（用来证明没变）：草稿卷顶栏「⋯」（草稿卷更多信息）、草稿卷题组「⋯」（更多题组操作）、
//   草稿卷「导出」菜单、首页题组行「⋯」、首页「筛选」开关、过生词「下载」。
// 第 19 条：七选五「展开细节」静止 / 悬停 / 焦点。
// 第 20 条：相似篇章面板（首页、详情页）出错时的「重试」静止 / 悬停 / 焦点。
// 第 21 条：过生词「重播」静止 / 悬停 / 焦点和读屏名字。
// 第 22 条：过生词音标发音键静止 / 悬停 / 焦点，并量喇叭图标和下面释义的左边。
// 宽屏 1440 和窄屏 390，DPR 2，减少动效。量出键的框、字的框、图标的框、实算样式、读屏树（CDP）。
//
// 平时出不来的状态靠拦接口（只在截图里，站点不改）：
// - POST /api/similar-passages 回 500，相似篇章面板出「重试」。
// - 整卷预览：资产投影、consumption 补 sourceAssetVersion、审阅线程 404（同 decisions-b-shots.mjs）。
// - 讲评栏解析：阅读、七选五解析换成 test-fixtures/retired-paper-assets 里同一套卷的文件（同 decisions-b-shots.mjs）。
// - 词典：status 回可用，lookup 回 decisions-b-shots.mjs 同一个假词条，生词本 selection-state 回没加过。
// - GET /api/question-groups/<种子题组>：补 paperSurfaceHref，露出详情页「相似篇章」入口（同 decisions-b-shots.mjs）。
// 数据：过生词页的词汇课程照 vocab-review-shots.mjs 的办法导进这次临时的数据库（rigdata-40/qb.sqlite）。
//
// 本地网站：用 rig.mjs 自己起一份，默认端口偏移 40（INVENTORY_PORT_OFFSET），数据放 rigdata-40。
//
// 用法：node scripts/component-inventory/decisions-d-shots.mjs before|after
// 输出：design/components-2026-11-13/decisions-2026-11-14/batch-d/<before|after>/（shots/*.png + measure.json）
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '40'
const { mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
const { spawnSync } = await import('node:child_process')
const path = (await import('node:path')).default
const { pathToFileURL } = await import('node:url')
const { RAW, ROOT, requireFromApp } = await import('./lib.mjs')
const { startRig } = await import('./rig.mjs')
const { addDraftItems, login, settle, sleep } = await import('./scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：decisions-d-shots.mjs before|after'); process.exit(2) }
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const OUT = path.join(ROOT, 'design/components-2026-11-13/decisions-2026-11-14/batch-d', label)
for (const f of ['shots', 'measure.json']) rmSync(path.join(OUT, f), { recursive: true, force: true })
mkdirSync(path.join(OUT, 'shots'), { recursive: true })

const PAPER_ID = 'paper-2026-i'
const PAPER = `/?view=paper-browse&paperId=${PAPER_ID}`
const SEED_GROUP = 'group-2026-i-reading-a'

// 量一个键：键的框、字的框（非空文字节点的外框，不算 kbd 和只给读屏的字）、图标的框、
// 图标里图形的框（svg 里 path 等的几何外框，不含描边宽度）、kbd 的框、实算样式。
function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  const box = (r) => ({ x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) })
  const union = (rects) => {
    const rs = rects.filter((r) => r.width > 0 && r.height > 0)
    if (!rs.length) return null
    const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top))
    const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom))
    return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) }
  }
  const skip = (n) => n.parentElement.closest('kbd, .visually-hidden')
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    const texts = []
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || skip(n)) continue
      const range = document.createRange(); range.selectNodeContents(n)
      texts.push(...range.getClientRects())
    }
    const textNode = (() => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && !skip(n)) return n.parentElement; return e })()
    const tcs = getComputedStyle(textNode)
    const svgs = [...e.querySelectorAll('svg')]
    const shapes = [...e.querySelectorAll('svg path, svg circle, svg rect, svg line, svg polyline, svg polygon')]
    const kbd = e.querySelector('kbd')
    const kcs = kbd ? getComputedStyle(kbd) : null
    const hoverList = e.closest('.fluid-hover-list')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      tone: e.getAttribute('data-tone') || undefined, size: e.getAttribute('data-size') || undefined,
      expanded: e.getAttribute('aria-expanded') || undefined, haspopup: e.getAttribute('aria-haspopup') || undefined,
      box: box(r),
      textBox: union(texts),
      iconBox: svgs.length ? union(svgs.map((s) => s.getBoundingClientRect())) : null,
      shapeBox: shapes.length ? union(shapes.map((s) => s.getBoundingClientRect())) : null,
      kbdBox: kbd ? { ...box(kbd.getBoundingClientRect()), border: `${kcs.borderTopWidth}/${kcs.borderBottomWidth} ${kcs.borderTopColor}`, font: `${kcs.fontSize}/${kcs.fontWeight}`, bg: kcs.backgroundColor } : null,
      bg: cs.backgroundColor, color: tcs.color, font: `${tcs.fontSize}/${tcs.fontWeight}`,
      lineHeight: cs.lineHeight, deco: tcs.textDecorationLine,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
      radius: cs.borderRadius, gap: cs.columnGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      cursor: cs.cursor,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      inFluidHoverList: hoverList ? (typeof hoverList.className === 'string' ? hoverList.className : true) : false,
      fluidHoverActive: e.hasAttribute('data-fluid-hover-active') || undefined,
    }
  })
}

// 音标键和下面释义的左边：喇叭图标（svg 盒子、图形外框）、释义第一行（词性）字的左边、释义块内容区的左边。
function pronAlign() {
  const round = (n) => Math.round(n * 100) / 100
  const key = document.querySelector('.vocabulary-pronunciation')
  const block = document.querySelector('.vocabulary-sense-block')
  const meanings = document.querySelector('.vocabulary-core-meanings')
  if (!key || !block || !meanings) return null
  const textLeft = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue
      const range = document.createRange(); range.selectNodeContents(n)
      return round(range.getClientRects()[0].left)
    }
    return null
  }
  const svg = key.querySelector('svg')
  const shapes = [...key.querySelectorAll('svg path, svg circle, svg rect, svg line, svg polyline, svg polygon')].map((s) => s.getBoundingClientRect()).filter((r) => r.width || r.height)
  const bs = getComputedStyle(block)
  return {
    keyLeft: round(key.getBoundingClientRect().left),
    iconSvgLeft: svg ? round(svg.getBoundingClientRect().left) : null,
    iconShapeLeft: shapes.length ? round(Math.min(...shapes.map((r) => r.left))) : null,
    meaningsLeft: round(meanings.getBoundingClientRect().left),
    meaningsTextLeft: textLeft(meanings),
    blockContentLeft: round(block.getBoundingClientRect().left + parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth)),
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

// 读屏树：Chrome 自己算出来的 role / name / description / expanded / disabled / haspopup（CDP Accessibility）。
async function ax(page, locator) {
  const tag = `d-${Math.random().toString(36).slice(2)}`
  if (!(await locator.evaluate((e, t) => { e.setAttribute('data-d-ax', t); return true }, tag).catch(() => false))) return null
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-d-ax="${tag}"]` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value]))
    return {
      role: n.role?.value, name: n.name?.value, nameFrom: n.name?.sources?.find((s) => s.value)?.type,
      description: n.description?.value ?? null, expanded: props.expanded, disabled: props.disabled,
      focusable: props.focusable, hasPopup: props.hasPopup, pressed: props.pressed,
    }
  } finally {
    await locator.evaluate((e) => e.removeAttribute('data-d-ax')).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}

// ---------- 拦接口 ----------
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
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
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await context.route(/\/api\/similar-passages$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return json(route, 500, { error: '相似篇章暂时没有得到（拍图用）' })
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
    const data = await res.json()
    if (data && data.sourceAssetVersion == null) data.sourceAssetVersion = 1
    await route.fulfill({ response: res, body: JSON.stringify(data) })
  })
  await context.route(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, (route) => json(route, 404, { error: 'not found' }))
  await context.route(new RegExp(`/paper-assets/${PAPER_ID}/versions/v\\d+/analyses/(reading-choice|seven-choices)-analysis-v1\\.json$`), (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()
    const body = readFileSync(path.join(ROOT, 'test-fixtures/retired-paper-assets', PAPER_ID, 'latest/analyses', file), 'utf8')
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  await context.route(/\/api\/paper-dictionary\/status$/, (route) => json(route, 200, {
    schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true, dictionaryVersion: 'shot', reason: 'ok',
    sensePick: { enabled: false }, limits: { maxWordUtf16: 64, maxBodyBytes: 65536, maxResponseBytes: 1048576 },
  }))
  await context.route(/\/api\/paper-dictionary\/lookup$/, (route) => {
    const req = JSON.parse(route.request().postData() || '{}')
    const selectedText = req.segments?.[0]?.selectedText ?? DICT_ENTRY.selectedText
    return json(route, 200, { ...DICT_ENTRY, sourceRevision: req.sourceRevision, selectedText })
  })
  await context.route(/\/api\/paper-dictionary\/(?!status$|lookup$)/, (route) => json(route, 404, { error: 'shot' }))
  await context.route(/\/api\/vocabulary-notebook\/selection-state/, (route) => json(route, 200, { state: 'not-added', contextId: null, entryId: null }))
}

const INPUT = '.concierge-intent-input'
const FILTER = '.concierge-command-filter-toggle'
const FILTER_ACTIONS = '.concierge-filter-actions'
const MORE = `${FILTER_ACTIONS} > :nth-child(1)`
const PAPER_HEAD = '.concierge-paper-row-head'
const GROUP_LINE = '.concierge-group-row-line'
const ROW_MENU = '.concierge-group-row-menu-trigger'
const MENU = '.eqb-menu'
const MENU_ITEMS = '.eqb-menu .eqb-menu-item'
const PANEL = '.similar-passages-panel'
// 构件收尾（2026-11-15）：出错行换成共用 Notice，「重试」由 Notice 的 action 画，类名从 .similar-btn 换成 .eqb-notice-action。
const RETRY = `${PANEL} .similar-rail-error .eqb-notice-action`
const OVERVIEW = '.paper-browse-reading-overview-toggle'
const SEVEN = '.pi-seven-panel-actions'
const DETAILS = '.pi-seven-details-toggle'
const DICT = '.paper-dictionary-card'
const VOCAB_TOGGLE = '.vocabulary-progress-toggle'
const STUDENT_ADD = '.vocabulary-student-add-button'
const DOWNLOAD = '.vocabulary-download-menu > button'
const DRAFT_MORE = '.draft-more-menu-trigger'
const PAUSE = '.vocabulary-stage-pause'
const REPLAY = '.vocabulary-word-replay'
const PRON = '.vocabulary-pronunciation'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RIGDATA, 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) { await rig.stop(); throw new Error('导入校准课程失败：' + imported.stderr.slice(-400)) }
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {
  base: rig.base,
  intercepted: [
    'POST /api/similar-passages：回 500（相似篇章面板出「重试」）',
    `GET /api/question-groups/${SEED_GROUP}：补 paperSurfaceHref（露出详情页「相似篇章」入口）`,
    '整卷预览：资产投影、consumption 补 sourceAssetVersion、审阅线程 404（同 decisions-b-shots.mjs）',
    `讲评栏解析：paper-assets/${PAPER_ID}/versions/*/analyses/{reading-choice,seven-choices}-analysis-v1.json 换成 test-fixtures/retired-paper-assets/${PAPER_ID}/latest/analyses/ 的同名文件`,
    '词典：status 回可用、lookup 回假词条 destination（同 decisions-b-shots.mjs）、生词本 selection-state 回没加过',
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
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    // 键盘焦点：先按一下 Tab 让浏览器进入键盘模式，再把焦点放到键上。
    // 不用 Control：Chrome 不把带 Ctrl 的按键算作键盘操作，改前试拍时一半的键没出焦点环（focusIsKey=false）。
    // 不用 Shift：过词时 Shift 是「收生词」的快捷键。过词页的快捷键里没有 Tab（VocabularyReviewPage.tsx 的 keydown）。
    // 焦点原来在输入框里时（新建学生表单打开后），改用 Shift+Tab 从输入框退回「取消」。
    const keyFocus = async (locator) => { await page.keyboard.press('Tab'); await locator.focus(); await sleep(300) }
    const rec = { missing: [] }
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`)
        await page.screenshot({ path: path.join(OUT, 'shots', `missing-${name}${suffix}.png`) }).catch(() => {})
      }
    }
    // 一个键的三种样子：静止、悬停、键盘焦点。region 是截图范围（改前改后都认得的容器）。
    const states = async (name, sel, region, pad = 12, focusFn = null) => {
      const key = page.locator(sel).first()
      await key.scrollIntoViewIfNeeded(); await sleep(200); await blur(); await park()
      const out = {}
      await shotAround(page, `${name}${suffix}`, [region], pad)
      out.still = (await page.evaluate(measure, sel))[0]
      out.ax = await ax(page, key)
      await key.hover(); await sleep(400)
      await shotAround(page, `${name}-hover${suffix}`, [region], pad)
      out.hover = (await page.evaluate(measure, sel))[0]
      await park()
      if (focusFn) await focusFn(key); else await keyFocus(key)
      out.focusIsKey = await key.evaluate((e) => document.activeElement === e && e.matches(':focus-visible'))
      await shotAround(page, `${name}-focus${suffix}`, [region], pad)
      out.focus = (await page.evaluate(measure, sel))[0]
      await blur(); await park()
      return out
    }
    // 弹出类触发键打开着：键和弹出的面板一起拍（鼠标停在页角）。
    const openShot = async (name, sel, panelSel, pad = 12) => {
      const key = page.locator(sel).first()
      await key.scrollIntoViewIfNeeded(); await sleep(200); await blur(); await park()
      await key.click(); await page.locator(panelSel).first().waitFor({ timeout: 10000 }); await sleep(600); await park()
      const out = { open: (await page.evaluate(measure, sel))[0], ax: await ax(page, key) }
      await shotAround(page, `${name}-open${suffix}`, [key, page.locator(panelSel).first()], pad)
      await shotAround(page, `${name}-open-key${suffix}`, [key], 8)
      await page.keyboard.press('Escape'); await sleep(300)
      if ((await key.getAttribute('aria-expanded')) === 'true') { await key.click(); await sleep(300) }
      await blur(); await park()
      return out
    }
    await login(page, rig.base)

    // ---------- 首页：「筛选」开关（弹出类）和「收起筛选」（就地展开类） ----------
    await step('filter', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator(INPUT); await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator(FILTER).waitFor({ timeout: 30000 }); await settle(page, 1200)
      const panelId = await page.locator(FILTER).getAttribute('aria-controls')
      await page.locator(FILTER).click(); await page.locator(FILTER_ACTIONS).waitFor({ timeout: 10000 }); await sleep(600); await blur(); await park()
      rec.filterOpen = { open: (await page.evaluate(measure, FILTER))[0], ax: await ax(page, page.locator(FILTER)) }
      await shotAround(page, `filter-toggle-open-key${suffix}`, [page.locator(FILTER)], 8)
      await shotAround(page, `filter-toggle-open${suffix}`, [page.locator(FILTER), page.locator(`[id="${panelId}"]`)], 8)
      await page.locator(MORE).click(); await sleep(600); await blur(); await park()
      rec.moreExpanded = await states('filter-more-expanded', MORE, page.locator(FILTER_ACTIONS), 16)
      await page.locator(MORE).click(); await sleep(600); await blur(); await park()
      await page.locator(FILTER).click(); await sleep(600)
    })

    // ---------- 首页题组行「⋯」（弹出类）和相似篇章面板出错时的「重试」（第 20 条） ----------
    await step('home-row', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1200)
      const input = page.locator(INPUT); await input.fill('2026 阅读'); await input.press('Enter')
      const head = page.locator(PAPER_HEAD).first(); await head.waitFor({ timeout: 30000 }); await settle(page, 1200)
      if ((await head.locator('.concierge-row-expand').getAttribute('aria-expanded')) !== 'true') { await head.locator('.concierge-paper-body').first().click(); await sleep(800) }
      const line = page.locator(GROUP_LINE).first(); await line.waitFor({ timeout: 10000 })
      await line.hover(); await sleep(300)
      await line.locator(ROW_MENU).click(); await page.locator(MENU).first().waitFor({ timeout: 10000 }); await sleep(600)
      // 打开着时鼠标停在行上（滑块停在这一行），这是平时打开菜单的样子
      rec.rowMenuOpen = { open: (await page.evaluate(measure, `${GROUP_LINE} ${ROW_MENU}[aria-expanded="true"]`))[0], ax: await ax(page, line.locator(ROW_MENU)) }
      await shotAround(page, `row-menu-open${suffix}`, [line.locator(ROW_MENU), page.locator(MENU).first()], 12)
      await shotAround(page, `row-menu-open-key${suffix}`, [line.locator(ROW_MENU)], 8)
      await page.locator(MENU_ITEMS).filter({ hasText: '相似篇章' }).first().click()
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rail-error').waitFor({ timeout: 15000 }); await settle(page, 800)
      rec.homeRetry = await states('home-retry', RETRY, panel, 12)
    })

    // ---------- 详情页：相似篇章面板出错时的「重试」（对照：不在滑动列表里，改前改后都应该垫桌色） ----------
    await step('detail-retry', async () => {
      await page.goto(rig.base + `/?view=detail&groupId=${SEED_GROUP}`); await settle(page, 2000)
      await page.locator('[data-ra-entry="detail-view-similar"]').click({ timeout: 10000 })
      const panel = page.locator(PANEL).first(); await panel.locator('.similar-rail-error').waitFor({ timeout: 15000 }); await settle(page, 800)
      rec.detailRetry = await states('detail-retry', RETRY, panel, 12)
    })

    // ---------- 草稿卷：顶栏「⋯」、题组「⋯」、「导出」菜单（都是弹出类） ----------
    await step('draft', async () => {
      await addDraftItems(page)
      const itemMenu = 'button[aria-haspopup="menu"][aria-label="更多题组操作"]'
      // 分页预览第一次要排很久，等题组「⋯」出来再拍（同 decisions-b-shots.mjs 等换篇键的办法）
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator(itemMenu).first().waitFor({ timeout: 150000 }); await settle(page, 2500); await park()
      rec.draftMoreOpen = await openShot('draft-more', DRAFT_MORE, '#draft-more-information', 8)
      rec.draftItemMenuOpen = await openShot('draft-item-menu', itemMenu, MENU, 8)
      const exportKey = 'button[aria-haspopup="menu"]:has(.eqb-button-label)'
      rec.draftExportOpen = await openShot('draft-export', `${exportKey}`, MENU, 8)
    })

    // ---------- 讲评栏「文章简介」展开后（就地展开类） ----------
    await step('overview', async () => {
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1')
      await page.locator(OVERVIEW).first().waitFor({ timeout: 60000 }); await settle(page, 2500)
      const header = page.locator('.paper-browse-reading-header').first()
      if ((await page.locator(OVERVIEW).first().getAttribute('aria-expanded')) !== 'true') { await page.locator(OVERVIEW).first().click(); await sleep(600) }
      rec.overviewExpanded = await states('overview-expanded', OVERVIEW, header, 12)
    })

    // ---------- 七选五「展开细节」（第 19 条）和展开后的「收起细节」 ----------
    await step('seven', async () => {
      await page.goto(rig.base + PAPER + '&focusGroupId=group-2026-i-seven-choices&questionId=q-2026-i-036&lecture=1')
      await page.locator(SEVEN).first().waitFor({ timeout: 60000 }); await settle(page, 2500)
      if (!(await page.locator(DETAILS).count())) { await page.locator(`${SEVEN} > button:nth-child(1)`).click(); await sleep(800) }
      await page.locator(DETAILS).first().waitFor({ timeout: 10000 })
      const body = page.locator('.pi-seven-chain-body').first()
      rec.sevenFitLine = (await page.evaluate(measure, '.pi-seven-chain-body .pi-seven-fit-line'))[0]
      rec.sevenDetails = await states('seven-details', DETAILS, body, 8)
      await page.locator(DETAILS).first().click(); await sleep(600); await blur(); await park()
      rec.sevenDetailsExpanded = await states('seven-details-expanded', DETAILS, page.locator('.pi-seven-chain-body').first(), 8)
      await page.locator(DETAILS).first().click(); await sleep(400)
    })

    // ---------- 词典卡三个展开键展开后（就地展开类） ----------
    await step('dictionary', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3000)
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
      const box = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      await page.mouse.move(box.x, box.y); await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')))
      await page.mouse.up().catch(() => {})
      await page.locator('.paper-selection-lookup').first().waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator('.paper-selection-lookup').first().click()
      const card = page.locator(DICT).first()
      await card.locator('.paper-dictionary-detail-toggle').waitFor({ timeout: 15000 }); await sleep(800)
      // 截图范围用整张卡（卡的位置跟着选区走，改前改后一样）。展开、拍、再收起，下一个键从同样的卡开始。
      const dictExpanded = async (name, sel) => {
        const key = page.locator(sel).first()
        await key.click(); await sleep(500); await blur(); await page.mouse.move(2, height - 2); await sleep(300)
        const out = {}
        await shotAround(page, `${name}-expanded${suffix}`, [card], 8)
        out.still = (await page.evaluate(measure, sel))[0]
        out.ax = await ax(page, key)
        await key.hover(); await sleep(400)
        await shotAround(page, `${name}-expanded-hover${suffix}`, [card], 8)
        out.hover = (await page.evaluate(measure, sel))[0]
        await page.mouse.move(2, height - 2); await sleep(200)
        // 词典卡里不用页面级的 keyFocus：390 宽时先按 Tab 会把焦点送出浮层，浮层随之关上（改前试拍「署名与隐私」就是这样丢的）。
        // 改成先把焦点放到键上，再 Shift+Tab、Tab 在卡里走一个来回。
        await key.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await sleep(300)
        if (!(await key.evaluate((e) => document.activeElement === e))) await key.focus()
        out.focusIsKey = await key.evaluate((e) => document.activeElement === e && e.matches(':focus-visible'))
        await shotAround(page, `${name}-expanded-focus${suffix}`, [card], 8)
        out.focus = (await page.evaluate(measure, sel))[0]
        await key.press('Enter'); await sleep(400); await blur()
        return out
      }
      rec.dictRare = await dictExpanded('dict-rare', `${DICT} .paper-dictionary-rare-toggle`)
      rec.dictDetail = await dictExpanded('dict-detail', `${DICT} .paper-dictionary-detail-toggle`)
      rec.dictCredits = await dictExpanded('dict-credits', `${DICT} .paper-dictionary-credits-toggle`)
    })

    // ---------- 过生词：「收起进度」「取消」（就地展开类）、「下载」（弹出类） ----------
    await step('vocab-head', async () => {
      await page.goto(rig.base + '/?view=vocabulary-review'); await page.locator(VOCAB_TOGGLE).first().waitFor({ timeout: 30000 }); await settle(page, 1500)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      await page.locator(VOCAB_TOGGLE).first().click(); await sleep(800); await blur(); await park()
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      rec.vocabExpanded = await states('vocab-progress-expanded', VOCAB_TOGGLE, page.locator('.vocabulary-overall-progress').first(), 16)
      await page.locator(VOCAB_TOGGLE).first().click(); await sleep(500)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      const head = page.locator('.vocabulary-heading-actions').first()
      await page.locator(STUDENT_ADD).first().click(); await page.locator('#vocabulary-student-name').waitFor({ timeout: 10000 }); await sleep(500)
      // 表单打开后焦点在输入框里，从输入框 Shift+Tab 退回「取消」，才是真的键盘焦点
      rec.studentCancel = await states('student-cancel', STUDENT_ADD, head, 12, async (key) => {
        await page.locator('#vocabulary-student-name').focus(); await page.keyboard.press('Shift+Tab'); await sleep(300)
        if (!(await key.evaluate((e) => document.activeElement === e))) await keyFocus(key)
      })
      await page.locator(STUDENT_ADD).first().click(); await sleep(400)
      if (await page.locator(DOWNLOAD).count()) {
        rec.downloadOpen = await openShot('vocab-download', DOWNLOAD, '#vocabulary-download-options', 8)
      } else rec.missing.push('vocab-download: 页面上没有「下载」键')
    })

    // ---------- 过生词：过词时「重播」（第 21 条）和展开后的音标发音键（第 22 条） ----------
    await step('session', async () => {
      await page.goto(rig.base + '/?view=vocabulary-review')
      await page.locator(`.vocabulary-run-start-row, ${PAUSE}`).first().waitFor({ timeout: 30000 }); await settle(page, 1500)
      if (!(await page.locator(PAUSE).count())) {
        const fields = page.locator('.vocabulary-run-fields input')
        if (await fields.count()) { await fields.first().fill('2'); await sleep(200) }
        await page.locator('.vocabulary-run-start-row').getByRole('button').last().click()
      }
      await page.locator(PAUSE).first().waitFor({ timeout: 20000 }); await settle(page, 1200)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      rec.replay = await states('replay', REPLAY, page.locator('.vocabulary-word-block').first(), 12)
      await page.locator('.vocabulary-review-stage').first().screenshot({ path: path.join(OUT, 'shots', `stage${suffix}.png`) })
      await page.locator('.vocabulary-reveal-prompt').click(); await page.locator(PRON).waitFor({ timeout: 10000 }); await sleep(600)
      rec.pron = await states('pron', PRON, page.locator('.vocabulary-sense-block').first(), 12)
      rec.pronAlign = await page.evaluate(pronAlign)
      await blur(); await park()
      await page.locator('.vocabulary-review-stage').first().screenshot({ path: path.join(OUT, 'shots', `stage-revealed${suffix}.png`) })
      await page.locator(PAUSE).first().click(); await sleep(800)
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
