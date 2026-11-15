#!/usr/bin/env node
// 等待第三轮（2026-11-15，巳；DESIGN.md §5「Waiting 等待」末两条 Owner 定）换前换后取证：只拍元素截图。
// 换前在 HEAD 的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting2-shots.mjs（第二轮）：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在中间一帧再拍。
//
// 这一轮拍：登录键静止 / 忙（量高、圆角、字号、字重、内衬、颜色、影子、字的位置）；
// 词典卡「加入生词本」静止 / 正在检查 / 正在加入；首页浏览态在连题库时的灰块（看 dataConnecting 那块走不走得到）。
// 会写数据的请求（登录、加入生词本）拦下以后最后 abort，不放行。
//
// 用法：INVENTORY_PORT_OFFSET=78 node scripts/component-inventory/waiting3-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=login,notebook（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png（元素截图，2 倍图）、<输出目录>/keys.json（量到的数、缺了哪步）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startRig, OWNER } from './rig.mjs'
import { RAW } from './lib.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = appRequire('playwright')

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：waiting3-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], steps: {} }
const PAPER = '/?view=paper-browse&paperId=paper-2026-i'
const OVERLAY = '.paper-selection-overlay'
const HOLD_BEFORE_SHOT = 1200
const DOTS_FRAME_MS = 1400

function freezeAnimations(dotsFrameMs) {
  const frozen = []
  for (const a of document.getAnimations()) {
    const effect = a.effect
    const timing = effect?.getTiming?.()
    const target = effect?.target
    if (!timing) continue
    const inDots = Boolean(target?.closest?.('.eqb-wait-dots'))
    if (!inDots && timing.iterations !== Infinity) continue
    a.pause()
    const duration = Number(timing.duration) || 0
    a.currentTime = inDots ? dotsFrameMs : (Number(timing.delay) || 0) + duration / 2
    frozen.push({ name: a.animationName || (inDots ? 'wait-dots' : 'web-animation'), target: target?.getAttribute?.('class') || target?.tagName })
  }
  return frozen
}
function resumeAnimations() {
  for (const a of document.getAnimations()) if (a.playState === 'paused') a.play()
}
function dotsInfo() {
  return [...document.querySelectorAll('.eqb-wait-dots')].map((e) => ({ kind: e.getAttribute('data-kind'), size: e.getAttribute('data-size') || 'md', reduced: e.hasAttribute('data-reduced'), active: e.getAttribute('data-active'), px: Math.round(e.getBoundingClientRect().width * 10) / 10 }))
}
// 一个键的实量：盒子、计算样式、字墨的位置（相对键的左上角）、读屏属性。
function keyInfo(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  const r1 = (v) => Math.round(v * 10) / 10
  const b = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let first = null, last = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) { first ??= n; last = n }
  let text = null
  if (first) {
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.textContent.length)
    const t = range.getBoundingClientRect()
    const tcs = getComputedStyle(first.parentElement)
    text = { x: r1(t.left - b.left), y: r1(t.top - b.top), w: r1(t.width), h: r1(t.height), opacity: tcs.opacity, color: tcs.color, fontSize: tcs.fontSize, fontWeight: tcs.fontWeight, lineHeight: tcs.lineHeight }
  }
  return {
    w: r1(b.width), h: r1(b.height),
    text: (el.innerText || '').trim(),
    style: {
      borderRadius: cs.borderRadius, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily.slice(0, 60), lineHeight: cs.lineHeight,
      padding: cs.padding, background: cs.backgroundColor, color: cs.color, boxShadow: cs.boxShadow, border: cs.border, cursor: cs.cursor, transition: cs.transition.slice(0, 160),
    },
    textBox: text,
    disabled: el.disabled ?? null, ariaBusy: el.getAttribute('aria-busy'), ariaDisabled: el.getAttribute('aria-disabled'), dataWait: el.getAttribute('data-wait'),
  }
}
// 字和所以点之间的距离（照 waiting2-shots.mjs gapInfo）
function gapInfo(selector) {
  const root = document.querySelector(selector)
  if (!root) return null
  const svg = root.querySelector('.eqb-wait-dots')
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('.visually-hidden')) last = n
  if (!last) return { error: 'no text' }
  const text = last.textContent.replace(/\s+$/, '')
  const range = document.createRange(); range.setStart(last, text.length - 1); range.setEnd(last, text.length)
  const right = range.getBoundingClientRect().right
  const fontSize = getComputedStyle(last.parentElement).fontSize
  if (!svg) return { fontSize, lastChar: text.slice(-1), dots: null }
  const s = svg.getBoundingClientRect()
  const ink = Math.min(...[...svg.querySelectorAll('circle')].map((c) => c.getBoundingClientRect().left))
  const r1 = (v) => Math.round(v * 10) / 10
  return { fontSize, lastChar: text.slice(-1), dotsPx: r1(s.width), svgGap: r1(s.left - right), inkGap: r1(ink - right) }
}

function holder() {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      if (!held) return route.fallback()
      await new Promise((resolve) => waiting.push(resolve))
      return route.fallback().catch(() => {})
    },
    release: () => { held = false; waiting.splice(0).forEach((r) => r()) },
  }
}
// 拦下不放，最后 abort（不真发出去）
function blocker(filter = () => true) {
  const routes = []
  let seen = 0
  return {
    seen: () => seen,
    handle: (route) => { if (!filter(route.request())) return route.fallback(); seen += 1; routes.push(route) },
    abort: async () => { for (const r of routes.splice(0)) await r.abort().catch(() => {}) },
  }
}

// 词典：照 decisions-b-shots.mjs 回一个假词条，卡片完整出来，「加入生词本」才在卡底。
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
        { senseId: 's2', priority: 'core', shortGloss: '（旅游）胜地', learnerExplanation: null },
      ],
    }],
  }],
}
// 卷面数据的两处补丁照 waiting2-shots.mjs 抄（rig 数据缺 sourceAssetVersion、资产要转成当前表示），不补卷面出不来。
const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
async function paperRoutes(context) {
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
  await context.route(/\/api\/paper-translation\/status$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 'paper-translation-status-v1', enabled: true, keyAvailable: true, canRequestNew: true, reason: 'ok',
    promptVersion: 'shot', contextPolicy: 'shot', sourceProjectionVersion: 'shot',
    limits: { maxSelectedUtf16: 2000, maxContextUtf16: 4000, maxSegments: 8, maxBodyBytes: 65536 },
  }) }))
  await context.route(/\/api\/paper-dictionary\/status$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true, dictionaryVersion: 'shot', reason: 'ok',
    sensePick: { enabled: false }, limits: { maxWordUtf16: 64, maxBodyBytes: 65536, maxResponseBytes: 1048576 },
  }) }))
  await context.route(/\/api\/paper-dictionary\/lookup$/, (route) => {
    const req = JSON.parse(route.request().postData() || '{}')
    const selectedText = req.segments?.[0]?.selectedText ?? DICT_ENTRY.selectedText
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...DICT_ENTRY, sourceRevision: req.sourceRevision, selectedText }) })
  })
  await context.route(/\/api\/paper-dictionary\/(?!status$|lookup$)/, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"shot"}' }))
  await context.route(/\/api\/vocabulary-notebook\/selection-state/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'not-added', contextId: null, entryId: null }) }))
}

async function selectWord(page, needle) {
  const ok = await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(needle)
      if (i < 0 || !n.parentElement.closest('.ps-surface, [class*="paper-surface"], .paper-browse-page')) continue
      n.parentElement.scrollIntoView({ block: 'center' })
      const s = window.getSelection(); s.removeAllRanges(); s.setBaseAndExtent(n, i, n, i + needle.length)
      return true
    }
    return false
  }, needle)
  if (!ok) throw new Error(`卷面上没找到 ${needle}`)
  await sleep(300)
  const b = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.mouse.move(b.x, b.y); await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')))
  await page.mouse.up().catch(() => {})
}
async function openDictionary(page, base) {
  await page.goto(base + PAPER); await settle(page, 3000)
  await selectWord(page, 'destination')
  await page.locator('.paper-selection-lookup').first().waitFor({ timeout: 15000 }); await sleep(300)
  await page.locator('.paper-selection-lookup').first().click()
  await page.locator('.paper-dictionary-notebook').first().waitFor({ timeout: 15000 })
}

const rig = await startRig({ quiet: !process.env.WAITING_VERBOSE })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const width = 1440, height = 900
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN' })
  await paperRoutes(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}: ${String(e).slice(0, 160)}`))
  const park = async () => { await page.mouse.move(1, height - 1); await sleep(200) }
  const shot = async (name, locator, pad = 8, maxHeight = 0) => {
    await locator.scrollIntoViewIfNeeded().catch(() => {})
    const b = await locator.boundingBox()
    if (!b) throw new Error(`${name}: 元素不在屏上`)
    const h = maxHeight ? Math.min(b.height, maxHeight) : b.height
    await page.screenshot({ path: path.join(OUT, 'states', `${name}.png`), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: h + pad * 2 } })
  }
  const freeze = async () => page.evaluate(freezeAnimations, DOTS_FRAME_MS)
  const step = async (name, fn) => {
    if (ONLY && !ONLY.has(name)) return
    keys.at = name
    const rec = {}
    keys.steps[name] = rec
    const cleanups = []
    rec.cleanup = (fn) => cleanups.push(fn)
    try { await fn(rec) } catch (e) {
      keys.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`)
    }
    for (const fn of cleanups) await fn().catch?.(() => {})
    delete rec.cleanup
    await page.evaluate(resumeAnimations).catch(() => {})
  }

  // ── 登录键：还没登录时先拍。静止一张；点下以后拦住登录请求不放，1200ms 时拍忙的样子，最后 abort。
  //    影子往下 8px、糊 24px，四边多留 32px 把影子拍全。
  await step('login', async (rec) => {
    const hold = blocker((req) => req.method() === 'POST')
    await page.route('**/api/auth/login', hold.handle)
    rec.cleanup(async () => { await hold.abort(); await page.unroute('**/api/auth/login', hold.handle) })
    await page.goto(rig.base + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
    await page.locator('#login-username').fill(OWNER.username); await page.locator('#login-password').fill(OWNER.password)
    await sleep(600); await park()
    rec.idle = await page.evaluate(keyInfo, '.login-submit')
    await shot('login-idle', page.locator('.login-submit').first(), 32)
    await page.locator('.login-submit').hover(); await sleep(400)
    rec.hover = await page.evaluate(keyInfo, '.login-submit')
    await shot('login-hover', page.locator('.login-submit').first(), 32)
    await page.locator('.login-submit').click(); await sleep(HOLD_BEFORE_SHOT); await park()
    rec.frozen = await freeze()
    rec.dots = await page.evaluate(dotsInfo)
    rec.busy = await page.evaluate(keyInfo, '.login-submit')
    await shot('login-busy', page.locator('.login-submit').first(), 32)
    await page.evaluate(resumeAnimations)
  })
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
  await login(page, rig.base)

  // ── 首页浏览态（?view=browse）在连题库：拦住题库列表接口，看 dataConnecting 那块灰块出不出（只读，最后放行）。
  await step('browse-connecting', async (rec) => {
    const hold = holder()
    await page.route('**/api/question-groups', hold.handle)
    rec.cleanup(async () => { hold.release(); await page.unroute('**/api/question-groups', hold.handle) })
    await page.goto(rig.base + '/?view=browse')
    await page.locator('.concierge-status-slot .eqb-notice').first().waitFor({ timeout: 30000 })
    await sleep(HOLD_BEFORE_SHOT); await park()
    rec.frozen = await freeze()
    rec.inDom = await page.evaluate(() => ({
      listSurface: document.querySelectorAll('.concierge-list-surface').length,
      chipRow: document.querySelectorAll('.concierge-skeleton-chip-row').length,
      feed: document.querySelectorAll('.concierge-list-surface > .concierge-skeleton-feed').length,
      notice: document.querySelector('.concierge-status-slot .eqb-notice')?.innerText.trim() || null,
    }))
    await shot('browse-connecting', page.locator('.concierge-desk').first(), 6, 520)
    await page.evaluate(resumeAnimations)
  })

  // ── 词典卡「加入生词本」：正在检查（selection-state 拦住不放，只读；最后 abort）
  await step('notebook-checking', async (rec) => {
    const hold = blocker()
    await page.route(/\/api\/vocabulary-notebook\/selection-state/, hold.handle)
    rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/vocabulary-notebook\/selection-state/, hold.handle) })
    await openDictionary(page, rig.base)
    await sleep(HOLD_BEFORE_SHOT); await park()
    rec.frozen = await freeze()
    rec.dots = await page.evaluate(dotsInfo)
    rec.key = await page.evaluate(keyInfo, '.paper-dictionary-notebook button')
    rec.gap = await page.evaluate(gapInfo, '.paper-dictionary-notebook button')
    await shot('notebook-checking', page.locator('.paper-dictionary-notebook').first(), 8)
    await page.evaluate(resumeAnimations)
  })

  // ── 词典卡「加入生词本」：静止；点了以后加入请求拦住不放（写数据，最后 abort）
  await step('notebook-saving', async (rec) => {
    const hold = blocker((req) => req.method() === 'POST')
    await page.route(/\/api\/vocabulary-notebook\/contexts$/, hold.handle)
    rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/vocabulary-notebook\/contexts$/, hold.handle) })
    await openDictionary(page, rig.base)
    const key = page.locator('.paper-dictionary-notebook button').first()
    await page.waitForFunction(() => /加入生词本/.test(document.querySelector('.paper-dictionary-notebook button')?.innerText || '') && !document.querySelector('.paper-dictionary-notebook button')?.disabled, null, { timeout: 15000 }).catch(() => {})
    await sleep(600); await park()
    rec.idle = await page.evaluate(keyInfo, '.paper-dictionary-notebook button')
    await shot('notebook-idle', page.locator('.paper-dictionary-notebook').first(), 8)
    await key.click(); await sleep(HOLD_BEFORE_SHOT); await park()
    rec.frozen = await freeze()
    rec.dots = await page.evaluate(dotsInfo)
    rec.busy = await page.evaluate(keyInfo, '.paper-dictionary-notebook button')
    rec.gap = await page.evaluate(gapInfo, '.paper-dictionary-notebook button')
    // 忙时再点一下：数一数加入请求发了几次（应只 1 次）
    rec.postsBeforeSecondClick = hold.seen()
    await key.click({ force: true, timeout: 3000 }).catch(() => {}); await sleep(300)
    rec.postsAfterSecondClick = hold.seen()
    await shot('notebook-saving', page.locator('.paper-dictionary-notebook').first(), 8)
    await page.evaluate(resumeAnimations)
  })
  await context.close()
} finally {
  delete keys.at
  writeFileSync(path.join(OUT, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing)
