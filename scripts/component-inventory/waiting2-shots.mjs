#!/usr/bin/env node
// 等待第二轮（2026-11-15，卯；DESIGN.md §5「Waiting 等待」）换前换后取证：只拍元素截图。
// 换前在 HEAD 的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting-shots.mjs（第一轮）：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在中间一帧再拍。
//
// 这一轮拍：首页找题灰块的门槛（150ms 时一张、1200ms 时一张）、首页结果行依次淡入（停在第 100ms）、
// 选词翻译 / 句子分析 / 草稿卷顶栏小字旁的所以点（量字和点的间距、点的大小）、句子分析和词典卡的灰块、
// 详情页卷面的灰块、整卷页「下载 PDF」键在生成、管理页「打标」「新建口令」两个键在等、
// 草稿卷「正在生成 PDF」超过 10 秒那一句。首页紧凑加入键放最后，拦下的加入请求最后 abort，不真加进草稿卷。
//
// 用法：INVENTORY_PORT_OFFSET=77 node scripts/component-inventory/waiting2-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=home-search,translate（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png（元素截图，2 倍图）、<输出目录>/keys.json（量到的数、缺了哪步）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startRig } from './rig.mjs'
import { RAW } from './lib.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = appRequire('playwright')

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：waiting2-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], steps: {} }
const PAPER = '/?view=paper-browse&paperId=paper-2026-i'
const OVERLAY = '.paper-selection-overlay'
const HOLD_BEFORE_SHOT = 1200
const DOTS_FRAME_MS = 1400
// 结果行依次淡入停在第几毫秒（第一行演到 100 / 160，第二行 60，第三行 20，第四行还没开始）
const REVEAL_FRAME_MS = 100

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
function boxOf(selector) {
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect()
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), ariaBusy: e.getAttribute('aria-busy') }
  })
}
// 字和所以点之间的距离：最后一个字的字框右边 → 所以点 SVG 左边（svgGap）、→ 最左一颗点的墨迹左边（inkGap，停住那一帧）、
// → 静止 ∴ 时最左那颗点的左边（homeGap = svgGap + 4.75 / 24 × 点的大小）。字号一并记下。
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
  return { fontSize, lastChar: text.slice(-1), dotsPx: r1(s.width), svgGap: r1(s.left - right), inkGap: r1(ink - right), homeGap: r1(s.left - right + (4.75 / 24) * s.width) }
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
  return {
    handle: (route) => { if (!filter(route.request())) return route.fallback(); routes.push(route) },
    abort: async () => { for (const r of routes.splice(0)) await r.abort().catch(() => {}) },
  }
}

const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
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
  // 词典可用（照 decisions-b-shots.mjs），查词请求在那一步里拦下不放
  await context.route(/\/api\/paper-dictionary\/status$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true, dictionaryVersion: 'shot', reason: 'ok',
    sensePick: { enabled: false }, limits: { maxWordUtf16: 64, maxBodyBytes: 65536, maxResponseBytes: 1048576 },
  }) }))
  await context.route(/\/api\/vocabulary-notebook\/selection-state/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'not-added', contextId: null, entryId: null }) }))
}

async function selectOnPaper(page, needle, words) {
  const ok = await page.evaluate(({ needle, words }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(needle)
      if (i < 0 || !n.parentElement.closest('.ps-surface, [class*="paper-surface"], .paper-browse-page')) continue
      let end = i + needle.length
      if (words > 1) {
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

const rig = await startRig({ quiet: !process.env.WAITING_VERBOSE })
const browser = await chromium.launch({ channel: 'chromium' })
try {
  for (const motion of ['no-preference', 'reduce']) {
    const width = 1440, height = 900
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: motion })
    // 存文件不弹「另存为」：去掉 showSaveFilePicker，走浏览器下载那条路（fileDownload.ts）
    await context.addInitScript(() => { try { delete window.showSaveFilePicker; delete window.showDirectoryPicker } catch {} })
    await paperRoutes(context)
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}: ${String(e).slice(0, 160)}`))
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(200) }
    const suffix = motion === 'reduce' ? '-reduced' : ''
    const shot = async (name, locator, pad = 8, maxHeight = 0) => {
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      const b = await locator.boundingBox()
      if (!b) throw new Error(`${name}: 元素不在屏上`)
      const h = maxHeight ? Math.min(b.height, maxHeight) : b.height
      await page.screenshot({ path: path.join(OUT, 'states', `${name}${suffix}.png`), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: h + pad * 2 } })
    }
    const freeze = async () => page.evaluate(freezeAnimations, DOTS_FRAME_MS)
    const step = async (name, fn) => {
      const id = `${name}${suffix}`
      if (ONLY && !ONLY.has(name)) return
      // 减少动态效果只走首页结果行那一步（看真行淡入是不是不演）
      if (motion === 'reduce' && name !== 'home-rows') return
      keys.at = id
      const rec = {}
      keys.steps[id] = rec
      const cleanups = []
      rec.cleanup = (fn) => cleanups.push(fn)
      try { await fn(rec) } catch (e) {
        keys.missing.push(`${id}: ${String(e).split('\n')[0].slice(0, 200)}`)
      }
      for (const fn of cleanups) await fn().catch?.(() => {})
      delete rec.cleanup
      await page.evaluate(resumeAnimations).catch(() => {})
    }
    await login(page, rig.base)

    // ── 首页：AI 找题在等。150ms 时拍一张（门槛内：换后灰块不该出），1200ms 时再拍一张。
    await step('home-search', async (rec) => {
      const status = (route) => route.fulfill({ json: { serverKeyAvailable: true } })
      const steward = blocker()
      await page.route('**/api/ai/status', status)
      await page.route('**/api/ai/question-bank-steward', steward.handle)
      rec.cleanup(async () => { await steward.abort(); await page.unroute('**/api/ai/status', status); await page.unroute('**/api/ai/question-bank-steward', steward.handle) })
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('适合高二的环保主题阅读')
      await input.press('Enter')
      await page.locator('.concierge-results .concierge-loading').first().waitFor({ timeout: 30000 })
      const t0 = Date.now()
      await sleep(150)
      rec.early = await page.evaluate(() => ({ feed: document.querySelectorAll('.concierge-results .concierge-skeleton-feed').length, notice: document.querySelectorAll('.concierge-results .concierge-loading').length }))
      rec.earlyAtMs = Date.now() - t0
      await shot('home-search-150ms', page.locator('.concierge-results').first(), 6, 260)
      await sleep(HOLD_BEFORE_SHOT - 150); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.late = await page.evaluate(() => ({ feed: document.querySelectorAll('.concierge-results .concierge-skeleton-feed').length }))
      await shot('home-search-1200ms', page.locator('.concierge-results').first(), 6, 260)
      await page.evaluate(resumeAnimations)
    })

    // ── 首页：本地找题直接出结果，真行依次淡入。行一挂上就把淡入停在第 100ms。
    await step('home-rows', async (rec) => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      await page.evaluate((frame) => {
        window.__reveal = null
        const obs = new MutationObserver(() => {
          const rows = document.querySelectorAll('.concierge-results .concierge-paper-list > li')
          if (!rows.length) return
          obs.disconnect()
          const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.concierge-paper-list'))
          for (const a of anims) { a.pause(); a.currentTime = frame }
          window.__reveal = { rows: rows.length, animations: anims.length, timing: anims.slice(0, 4).map((a) => { const t = a.effect.getTiming(); return { duration: t.duration, delay: t.delay, easing: t.easing } }) }
        })
        obs.observe(document.body, { childList: true, subtree: true })
      }, REVEAL_FRAME_MS)
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator('.concierge-paper-row').first().waitFor({ timeout: 30000 }); await sleep(300); await park()
      rec.reveal = await page.evaluate(() => window.__reveal)
      rec.opacity = await page.evaluate(() => [...document.querySelectorAll('.concierge-results .concierge-paper-list > li')].slice(0, 5).map((li) => Number(getComputedStyle(li).opacity).toFixed(2)))
      await shot('home-rows', page.locator('.concierge-results').first(), 6, 300)
      await page.evaluate(() => { for (const a of document.getAnimations()) if (a.playState === 'paused') a.play() })
    })

    // ── 整卷页选词：翻译在等（12px 小字后面的所以点）
    await step('translate', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/paper-translation\/translate$/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/paper-translation\/translate$/, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-translate`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-translate`).click()
      await page.locator(`${OVERLAY} .paper-selection-card-status`).waitFor({ timeout: 15000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.gap = await page.evaluate(gapInfo, `${OVERLAY} .paper-selection-card-status`)
      await shot('translate-status', page.locator(`${OVERLAY} .paper-selection-card-status`).first(), 8)
      await page.evaluate(resumeAnimations)
    })

    // ── 整卷页选词：句子分析在等（「分析中」后的所以点 + 译文位置的灰块）
    await step('analyze', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).click()
      await page.locator('.sa-loading').first().waitFor({ timeout: 15000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.gap = await page.evaluate(gapInfo, '.sa-loading')
      rec.skeleton = await page.evaluate(boxOf, '.sa-translation')
      await shot('analyze-head', page.locator('.sa-head').first(), 4)
      // 卡片里从句子到译文灰块那一截
      const card = page.locator('.sa-head').first().locator('xpath=..')
      await shot('analyze-card', card, 4, 320)
      await page.evaluate(resumeAnimations)
    })

    // ── 整卷页选词：词典卡在查（灰块）
    await step('dictionary', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/paper-dictionary\/lookup$/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/paper-dictionary\/lookup$/, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 1)
      await page.locator('.paper-selection-lookup').first().waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator('.paper-selection-lookup').first().click()
      await page.locator('.paper-dictionary-card').first().waitFor({ timeout: 15000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.skeleton = await page.evaluate(boxOf, '.paper-dictionary-skeletons')
      rec.region = await page.evaluate(() => [...document.querySelectorAll('.paper-dictionary-skeletons')].map((e) => ({ role: e.getAttribute('role'), busy: e.getAttribute('aria-busy'), hidden: e.getAttribute('aria-hidden'), label: e.querySelector('.visually-hidden')?.textContent || null })))
      await shot('dictionary-card', page.locator('.paper-dictionary-card').first(), 6, 320)
      await page.evaluate(resumeAnimations)
    })

    // ── 整卷页：「下载 PDF」在生成（键宽、字）
    await step('paper-pdf', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/exports\/papers\//, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/exports\/papers\//, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000); await park()
      const key = page.locator('header.topbar').getByRole('button', { name: /下载 PDF|生成 PDF 中/ }).first()
      await key.waitFor({ timeout: 15000 })
      rec.idle = await page.evaluate(() => [...document.querySelectorAll('header.topbar button')].filter((b) => /下载 PDF|生成 PDF 中/.test(b.innerText)).map((b) => ({ w: Math.round(b.getBoundingClientRect().width * 10) / 10, text: b.innerText.trim(), disabled: b.disabled })))
      await shot('paper-pdf-idle', key, 8)
      await key.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.busy = await page.evaluate(() => [...document.querySelectorAll('header.topbar button')].filter((b) => /下载 PDF|生成 PDF 中/.test(b.innerText)).map((b) => ({ w: Math.round(b.getBoundingClientRect().width * 10) / 10, text: b.innerText.trim(), ariaBusy: b.getAttribute('aria-busy') })))
      await shot('paper-pdf-busy', key, 8)
      await page.evaluate(resumeAnimations)
    })

    // ── 详情页：卷面在等（灰块）。测试数据里这份卷没上线，详情接口回的 canonicalPaperId 是空的，
    //    这里把它改成 paper-2026-i，卷面那次读取拦下不放。
    await step('detail-paper', async (rec) => {
      const detailUrl = /\/api\/question-groups\/group-2026-i-reading-d(\?.*)?$/
      const patchDetail = async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch(); const data = await res.json()
        const visit = (o) => { if (!o || typeof o !== 'object') return; if ('canonicalPaperId' in o) o.canonicalPaperId = 'paper-2026-i'; for (const v of Object.values(o)) visit(v) }
        visit(data)
        await route.fulfill({ response: res, body: JSON.stringify(data) })
      }
      const hold = blocker()
      await page.route(detailUrl, patchDetail)
      await page.route(/\/api\/paper-canonical\/consumption\?/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(detailUrl, patchDetail); await page.unroute(/\/api\/paper-canonical\/consumption\?/, hold.handle) })
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-d')
      await page.locator('.peek-paper').first().waitFor({ timeout: 30000 })
      await sleep(HOLD_BEFORE_SHOT + 300); await park()
      rec.frozen = await freeze()
      rec.text = await page.evaluate(() => document.querySelector('.peek-paper')?.innerText.trim().slice(0, 60))
      rec.region = await page.evaluate(() => [...document.querySelectorAll('.peek-paper [aria-busy]')].map((e) => ({ role: e.getAttribute('role'), label: e.querySelector('.visually-hidden')?.textContent || null })))
      rec.box = await page.evaluate(boxOf, '.peek-paper')
      await shot('detail-paper', page.locator('.peek-paper').first(), 6, 420)
      await page.evaluate(resumeAnimations)
    })

    // ── 管理页：「新建口令」在建
    await step('admin', async (rec) => {
      const tokens = blocker((req) => req.method() === 'POST')
      await page.route(/\/api\/admin\/agent-tokens$/, tokens.handle)
      rec.cleanup(async () => { await tokens.abort(); await page.unroute(/\/api\/admin\/agent-tokens$/, tokens.handle) })
      await page.goto(rig.base + '/?view=admin'); await settle(page, 2000); await park()
      await page.locator('.agent-tokens form input').first().fill('拍图用口令'); await sleep(200); await park()
      const submit = page.locator('.agent-token-submit').first()
      rec.tokenIdle = await page.evaluate(boxOf, '.agent-token-submit')
      await shot('admin-token-idle', page.locator('.agent-tokens form').first(), 8)
      await submit.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen2 = await freeze()
      rec.tokenBusy = await page.evaluate(boxOf, '.agent-token-submit')
      await shot('admin-token-busy', page.locator('.agent-tokens form').first(), 8)
      await page.evaluate(resumeAnimations)
    })

    // ── 草稿卷：顶栏「保存中」（小字旁的所以点）和「正在生成 PDF」超过 10 秒
    await step('draft', async (rec) => {
      rec.items = await addDraftItems(page)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('.draft-save-status').first().waitFor({ timeout: 60000 })
      await settle(page, 2000)
      // 改卷名：拦下保存（PATCH），按回车提交，顶栏一直「保存中」
      const patch = blocker((req) => req.method() === 'PATCH')
      await page.route('**/api/draft-papers/*', patch.handle)
      rec.cleanup(async () => { await patch.abort(); await page.unroute('**/api/draft-papers/*', patch.handle) })
      await page.locator('.topbar-page-title-editable').first().click(); await sleep(300)
      const input = page.locator('.topbar-page-title-input').first()
      await input.waitFor({ timeout: 5000 })
      await input.press('End'); await input.type('（拍图）'); await input.press('Enter')
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.status = await page.evaluate(boxOf, '.draft-save-status')
      rec.gap = await page.evaluate(gapInfo, '.draft-save-status')
      await shot('draft-saving', page.locator('.draft-save-status').first(), 10)
      await page.evaluate(resumeAnimations)
      // 导出 → 下载 PDF，拦下 print-pdf 不放，等过 10 秒
      const pdf = blocker()
      await page.route('**/print-pdf', pdf.handle)
      rec.cleanup(async () => { await pdf.abort(); await page.unroute('**/print-pdf', pdf.handle) })
      await page.getByRole('button', { name: '导出', exact: true }).first().click(); await sleep(400)
      await page.getByRole('menuitem', { name: /下载 PDF/ }).first().click()
      const notice = page.locator('.draft-notice-slot .eqb-notice').first()
      await notice.waitFor({ timeout: 10000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen2 = await freeze()
      rec.pdfEarly = await page.evaluate(() => document.querySelector('.draft-notice-slot .eqb-notice')?.innerText.trim())
      await shot('draft-pdf-1s', notice, 6)
      await page.evaluate(resumeAnimations)
      await sleep(10_000 - HOLD_BEFORE_SHOT + 600); await park()
      rec.frozen3 = await freeze()
      rec.pdfSlow = await page.evaluate(() => document.querySelector('.draft-notice-slot .eqb-notice')?.innerText.trim())
      rec.gapPdf = await page.evaluate(gapInfo, '.draft-notice-slot .eqb-notice')
      await shot('draft-pdf-11s', notice, 6)
      await page.evaluate(resumeAnimations)
    })

    // ── 最后：首页结果行紧凑加入键在加入。加入请求拦下以后 abort，不真加进草稿卷，不拖累别的步骤。
    await step('home-row-add', async (rec) => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator('.concierge-paper-row').first().waitFor({ timeout: 30000 }); await sleep(800)
      if (!(await page.locator('.concierge-group-row-add button').count())) {
        await page.locator('.concierge-paper-row-head').first().click(); await sleep(1000)
      }
      // 找一个还没加入的（草稿卷那一步加了 A、B、C）
      const add = page.locator('.concierge-group-row-add button:not([aria-pressed="true"])').last()
      await add.waitFor({ timeout: 10000 })
      const hold = blocker((req) => req.method() === 'POST')
      await page.route('**/api/draft-papers/current/items', hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute('**/api/draft-papers/current/items', hold.handle) })
      await add.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.busy = await page.evaluate(boxOf, '.concierge-group-row-add')
      const trail = add.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " concierge-group-row-trail ")][1]')
      await shot('row-add-busy', trail, 6)
      await page.evaluate(resumeAnimations)
    })
    await context.close()
  }
} finally {
  delete keys.at
  writeFileSync(path.join(OUT, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing)
