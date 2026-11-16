#!/usr/bin/env node
// Owner 2026-11-14 决定第 2 条（描边键：不加描边那一种，带描边的手写键换成没有描边的 Button 现有语气）改前改后对照。
// 换的键：选词浮条翻译出错时的「重试」、过生词「新建学生 / 取消」和新建学生表单的「保存」、
// 过词时的「暂停并返回」「重播」、展开后的音标发音键。
// 一起拍、但这次不换的（用来证明没被带着变）：词典卡「本文义」出错时的行内「重试」（本来就没有描边，带下划线）、
// 句子分析卡出错时的「重试」（和选词浮条的「重试」共用 .paper-selection-retry 那条手写规则）。
// 每个键拍静止、悬停、键盘焦点；「保存」再拍禁用（没填名字）；「新建学生」再拍展开后（字变「取消」）。宽屏 1440 和窄屏 390。
// 量出键的框、字的框（文字节点的外框）、图标的框、按键提示 kbd 的框、实算样式（含描边）、读屏树。
//
// 出错态平时出不来，脚本拦了几个接口让它们出现（只在截图里，站点不改）：
// - /api/paper-translation/status 回「可用」；/api/paper-translation/translate 回 502 和一句错误，翻译卡出「重试」。
// - /api/paper-sentence-analysis/analyze 回 500，句子分析卡出「重试」。
// - 词典：status 回可用且「本文义」开着；/lookup 回 decisions-b-shots.mjs 同一个假词条；/sense 回 500，词典卡出行内「重试」；
//   生词本 selection-state 回「没加过」。
// 数据：过生词页要词汇课程。和 vocab-review-shots.mjs 一样，网站起来以后用 scripts/vocabulary/import-calibration-program.mjs
//   把 30 词的校准课程导进这次临时的数据库（rigdata-40/qb.sqlite），不碰仓库里的数据库。
//
// 本地网站：用 rig.mjs 自己起一份。默认端口偏移 40（INVENTORY_PORT_OFFSET），数据放 rigdata-40，
// 不碰别人可能正在用的 5299 / 9912 和 rigdata。
//
// 用法：node scripts/component-inventory/decisions-c-shots.mjs before|after
// 输出：design/components-2026-11-13/decisions-2026-11-14/batch-c/<before|after>/（shots/*.png + measure.json）
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '40'
const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
const { pathToFileURL } = await import('node:url')
const { spawnSync } = await import('node:child_process')
const path = (await import('node:path')).default
const { RAW, ROOT, requireFromApp } = await import('./lib.mjs')
const { startRig } = await import('./rig.mjs')
const { login, settle, sleep } = await import('./scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：decisions-c-shots.mjs before|after'); process.exit(2) }
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const OUT = path.join(ROOT, 'design/components-2026-11-13/decisions-2026-11-14/batch-c', label)
for (const f of ['shots', 'measure.json']) rmSync(path.join(OUT, f), { recursive: true, force: true })
mkdirSync(path.join(OUT, 'shots'), { recursive: true })

const PAPER = '/?view=paper-browse&paperId=paper-2026-i'

// 量一个键：键的框、字的框（所有非空文字节点的外框）、图标的框、kbd 的框、实算样式（含描边），以及在不在会滑的悬停列表里。
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
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    const texts = []
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('kbd')) continue
      const range = document.createRange(); range.selectNodeContents(n)
      texts.push(...range.getClientRects())
    }
    const textNode = (() => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('kbd')) return n.parentElement; return e })()
    const tcs = getComputedStyle(textNode)
    const svgs = [...e.querySelectorAll('svg')]
    const kbd = e.querySelector('kbd')
    const kcs = kbd ? getComputedStyle(kbd) : null
    const hoverList = e.closest('.fluid-hover-list')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      type: e.getAttribute('type') || undefined,
      tone: e.getAttribute('data-tone') || undefined, size: e.getAttribute('data-size') || undefined,
      expanded: e.getAttribute('aria-expanded') || undefined,
      box: box(r),
      textBox: union(texts),
      iconBox: svgs.length ? union(svgs.map((s) => s.getBoundingClientRect())) : null,
      kbdBox: kbd ? { ...box(kbd.getBoundingClientRect()), border: `${kcs.borderTopWidth}/${kcs.borderBottomWidth} ${kcs.borderTopColor}`, font: `${kcs.fontSize}/${kcs.fontWeight}` } : null,
      bg: cs.backgroundColor, color: tcs.color, font: `${tcs.fontSize}/${tcs.fontWeight}`, family: tcs.fontFamily.split(',')[0].trim(),
      lineHeight: cs.lineHeight, deco: tcs.textDecorationLine,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
      radius: cs.borderRadius, gap: cs.columnGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      cursor: cs.cursor,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      inFluidHoverList: hoverList ? (typeof hoverList.className === 'string' ? hoverList.className : true) : false,
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

// 读屏树：Chrome 自己算出来的 role / name / description / expanded / disabled（CDP Accessibility），不是从属性猜的。
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
    return {
      role: n.role?.value, name: n.name?.value, nameFrom: n.name?.sources?.find((s) => s.value)?.type,
      description: n.description?.value ?? null, expanded: props.expanded, disabled: props.disabled, focusable: props.focusable,
    }
  } finally {
    await locator.evaluate((e) => e.removeAttribute('data-c-ax')).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}

// ---------- 拦接口 ----------
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
      ],
    }],
  }],
}

const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)

async function routes(context) {
  // 整卷预览要能出卷面：和 decisions-b-shots.mjs / paper-rest-shots.mjs 同一套（卷子资产投影、consumption 补 sourceAssetVersion、审阅线程 404）
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
  await context.route(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) }))
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  // 翻译：可用，但每次翻译都失败
  await context.route(/\/api\/paper-translation\/status$/, (route) => json(route, 200, {
    schemaVersion: 'paper-translation-status-v1', enabled: true, keyAvailable: true, canRequestNew: true, reason: 'ok',
    promptVersion: 'shot', contextPolicy: 'shot', sourceProjectionVersion: 'shot',
    limits: { maxSelectedUtf16: 2000, maxContextUtf16: 4000, maxSegments: 8, maxBodyBytes: 65536 },
  }))
  await context.route(/\/api\/paper-translation\/translate$/, (route) => json(route, 502, { error: '翻译服务暂时没连上（拍图用）' }))
  // 句子分析：每次都失败
  await context.route(/\/api\/paper-sentence-analysis\/analyze$/, (route) => json(route, 500, { error: '分析失败（拍图用）' }))
  // 词典
  await context.route(/\/api\/paper-dictionary\/status$/, (route) => json(route, 200, {
    schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true, dictionaryVersion: 'shot', reason: 'ok',
    sensePick: { enabled: true }, limits: { maxWordUtf16: 64, maxBodyBytes: 65536, maxResponseBytes: 1048576 },
  }))
  await context.route(/\/api\/paper-dictionary\/lookup$/, (route) => {
    const req = JSON.parse(route.request().postData() || '{}')
    const selectedText = req.segments?.[0]?.selectedText ?? DICT_ENTRY.selectedText
    return json(route, 200, { ...DICT_ENTRY, sourceRevision: req.sourceRevision, selectedText })
  })
  await context.route(/\/api\/paper-dictionary\/sense$/, (route) => json(route, 500, { error: '本文义暂时没有得到（拍图用）' }))
  await context.route(/\/api\/paper-dictionary\/(?!status$|lookup$|sense$)/, (route) => json(route, 404, { error: 'shot' }))
  await context.route(/\/api\/vocabulary-notebook\/selection-state/, (route) => json(route, 200, { state: 'not-added', contextId: null, entryId: null }))
}

// 在卷面上选中一段字（一个词或同一句里的几个词），让选区监听收到一次抬起。
async function selectOnPaper(page, needle, words) {
  const ok = await page.evaluate(({ needle, words }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(needle)
      if (i < 0 || !n.parentElement.closest('.ps-surface, [class*="paper-surface"], .paper-browse-page')) continue
      let end = i + needle.length
      if (words > 1) {
        // 往后多带 words-1 个词，不跨句号
        const rest = n.textContent.slice(end)
        const m = rest.match(new RegExp(`^(\\s+[A-Za-z']+){${words - 1}}`))
        if (!m) continue
        end += m[0].length
      }
      n.parentElement.scrollIntoView({ block: 'center' })
      const s = window.getSelection(); s.removeAllRanges(); s.setBaseAndExtent(n, i, n, end)
      return true
    }
    return false
  }, { needle, words })
  if (!ok) throw new Error(`卷面上没找到 ${needle}`)
  await sleep(300)
  const b = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.mouse.move(b.x, b.y); await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')))
  await page.mouse.up().catch(() => {})
}

const OVERLAY = '.paper-selection-overlay'
const SEL_RETRY = `${OVERLAY} .paper-selection-retry`
const SENSE_RETRY = `${OVERLAY} .paper-dictionary-sense-retry`
const STUDENT_ADD = '.vocabulary-student-add-button'
const STUDENT_SAVE = '.vocabulary-student-create button[type="submit"]'
const PAUSE = '.vocabulary-stage-meta button'
const REPLAY = '.vocabulary-word-replay'
const PRON = '.vocabulary-pronunciation'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RIGDATA, 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) { await rig.stop(); throw new Error('导入校准课程失败：' + imported.stderr.slice(-400)) }
const browser = await chromium.launch({ channel: 'chromium' })
const result = {
  base: rig.base,
  intercepted: [
    '整卷预览：资产投影、consumption 补 sourceAssetVersion、审阅线程 404（同 decisions-b-shots.mjs）',
    '翻译：status 回可用；translate 回 502（翻译卡出「重试」）',
    '句子分析：analyze 回 500（句子分析卡出「重试」）',
    '词典：status 回可用且本文义开着；lookup 回假词条 destination；sense 回 500（词典卡出行内「重试」）；生词本 selection-state 回没加过',
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
    // 用 Control 让浏览器进入键盘模式（:focus-visible）。不用 Shift：过词时 Shift 是「收生词」的快捷键，过词页会忽略带 Ctrl 的键。
    const keyFocus = async (locator) => { await page.keyboard.press('Control'); await locator.focus(); await sleep(300) }
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

    // ---------- 选词浮条：翻译出错时的「重试」 ----------
    await step('sel-retry', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-translate`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-translate`).click()
      await page.locator(SEL_RETRY).waitFor({ timeout: 15000 }); await sleep(600)
      const card = page.locator(`${OVERLAY} .paper-selection-card`).first()
      rec.selRetry = await states('sel-retry', SEL_RETRY, card, 8)
      rec.selCard = await card.boundingBox()
    })

    // ---------- 句子分析卡出错时的「重试」（不换，看有没有被带着变） ----------
    await step('sa-retry', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).click()
      await page.locator(SEL_RETRY).waitFor({ timeout: 15000 }); await sleep(600)
      const card = page.locator(OVERLAY).first()
      rec.saRetry = await states('sa-retry', SEL_RETRY, card, 8)
    })

    // ---------- 词典卡「本文义」出错时的行内「重试」（不换，本来就没有描边） ----------
    await step('sense-retry', async () => {
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 1)
      await page.locator(`${OVERLAY} .paper-selection-lookup`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-lookup`).click()
      await page.locator(SENSE_RETRY).waitFor({ timeout: 15000 }); await sleep(600)
      const block = page.locator(`${OVERLAY} .paper-dictionary-sense-block`).first()
      rec.senseRetry = await states('sense-retry', SENSE_RETRY, block, 8)
    })

    // ---------- 过生词：「新建学生 / 取消」和表单里的「保存」 ----------
    await step('student', async () => {
      await page.goto(rig.base + '/?view=vocabulary-review'); await page.locator(STUDENT_ADD).first().waitFor({ timeout: 30000 }); await settle(page, 1500)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      const head = page.locator('.vocabulary-heading-actions').first()
      rec.studentAdd = await states('student-add', STUDENT_ADD, head, 12)
      rec.studentSelect = (await page.evaluate(measure, '.vocabulary-student-switcher select'))[0]
      await page.locator(STUDENT_ADD).first().click(); await page.locator(STUDENT_SAVE).waitFor({ timeout: 10000 }); await sleep(500)
      // 打开表单时输入框自动拿焦点；先拍打开后的「取消」
      rec.studentCancel = await states('student-cancel', STUDENT_ADD, head, 12)
      // 「保存」：没填名字时禁用
      await blur(); await park()
      await shotAround(page, `student-save-disabled${suffix}`, [page.locator('.vocabulary-student-create')], 12)
      rec.studentSaveDisabled = { still: (await page.evaluate(measure, STUDENT_SAVE))[0], ax: await ax(page, page.locator(STUDENT_SAVE)) }
      rec.studentInput = (await page.evaluate(measure, '.vocabulary-student-create input'))[0]
      await page.locator('#vocabulary-student-name').fill('拍图'); await sleep(300)
      rec.studentSave = await states('student-save', STUDENT_SAVE, page.locator('.vocabulary-student-create'), 12)
      await page.locator('#vocabulary-student-name').fill(''); await sleep(200)
      await page.locator(STUDENT_ADD).first().click(); await sleep(400)
    })

    // ---------- 过生词：过词时「暂停并返回」「重播」、展开后的音标发音键 ----------
    await step('session', async () => {
      await page.goto(rig.base + '/?view=vocabulary-review')
      // 上一个宽度暂停后，页面可能直接回到进行中的这一轮（不出开始设置），两种都认
      await page.locator(`.vocabulary-run-start-row, ${PAUSE}`).first().waitFor({ timeout: 30000 }); await settle(page, 1500)
      if (!(await page.locator(PAUSE).count())) {
        const fields = page.locator('.vocabulary-run-fields input')
        if (await fields.count()) { await fields.first().fill('2'); await sleep(200) }
        await page.locator('.vocabulary-run-start-row').getByRole('button').last().click()
      }
      await page.locator(PAUSE).first().waitFor({ timeout: 20000 }); await settle(page, 1200)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      rec.pause = await states('pause', PAUSE, page.locator('.vocabulary-stage-meta').first(), 12)
      rec.replay = await states('replay', REPLAY, page.locator('.vocabulary-word-block').first(), 12)
      await page.locator('.vocabulary-review-stage').first().screenshot({ path: path.join(OUT, 'shots', `stage${suffix}.png`) })
      await page.locator('.vocabulary-reveal-prompt').click(); await page.locator(PRON).waitFor({ timeout: 10000 }); await sleep(600)
      rec.pron = await states('pron', PRON, page.locator('.vocabulary-sense-block').first(), 12)
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
