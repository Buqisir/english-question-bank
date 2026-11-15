#!/usr/bin/env node
// 等待第四轮（2026-11-15，午；DESIGN.md §5「Waiting 等待」「还没做」三条）换前换后取证：只拍元素截图。
// 换前在没改的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting2/3-shots.mjs：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在中间一帧再拍
// （所以点停第 1400ms，灰块的呼吸停在半周期）；真行淡入用 MutationObserver 在行一挂上就停在第 100ms。
//
// 这一轮拍：
//   整卷页「复制试卷信息」没准备好 / 在复制（剪贴板写入挂住）；
//   整页的等待：整卷页首屏、草稿卷「正在打开草稿卷」、趣味练习「正在准备卡片」、听写「正在准备听写」（手机宽和桌面宽），
//     各拍 150ms（门槛内）和 1200ms 两帧，再放行拍真内容，量灰块和真东西的位置、大小；
//   别处的真行淡入：整卷页题组、个人空间、生词本、管理页口令、首页相似篇章、首页浏览态冷启动；个人空间再在「减少动态效果」下拍一次；
//   超过 10 秒：首页 AI 找题、选词翻译、句子分析，各挂 11 秒拍一帧。
// 假数据只用在读的接口上（列表、生词组、听写）；会写数据的请求（复制前没有请求；草稿卷加题是开头的布置）不在拍的步骤里放行。
//
// 用法：INVENTORY_PORT_OFFSET=80 node scripts/component-inventory/waiting4-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=paper-copy,paper-open（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png（元素截图；小元素 2 倍图，整页区域 1 倍图）、<输出目录>/keys.json（量到的数、缺了哪步）。
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
if (!process.argv[2]) { console.error('用法：waiting4-shots.mjs <输出目录>'); process.exit(2) }
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
const REVEAL_FRAME_MS = 100
const SLOW_MS = 11_000

// ── 假数据（只给读的接口） ──
const WORDS = [['abandon', '放弃'], ['benefit', '好处'], ['capture', '捕获'], ['decline', '下降'], ['emerge', '出现'], ['fragile', '易碎的'], ['genuine', '真正的'], ['harvest', '收获'], ['ignore', '忽视'], ['justify', '证明合理']]
const fakeEntries = WORDS.map(([headword, sense], i) => ({ id: `e${i}`, headword, teachingSense: sense, partOfSpeech: 'v.', sourceMeanings: [], audio: { path: `shot/${headword}.mp3` } }))
const fakeSet = { id: 'set-shot', title: '拍图生词组', studentId: 's', programId: 'p', reviewRunId: null, entryCount: fakeEntries.length, entries: fakeEntries, createdAt: '2026-11-15T00:00:00Z', share: null }
const fakeDictation = { vocabularySet: { title: '拍图听写', entryCount: fakeEntries.length, entries: fakeEntries.map((e) => ({ ...e, answer: e.headword })), createdAt: '2026-11-15T00:00:00Z' } }
const fakeArtifacts = Array.from({ length: 5 }, (_, i) => ({
  id: `art-${i}`, folderId: null, title: `拍图卷 ${i + 1}`, fileName: `shot-${i + 1}.pdf`, fileUrl: '/x.pdf', artifactType: 'student-paper',
  sourceDraftPaperId: 'd', sourceDraftTitle: '草稿', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2 + i,
  generatedAt: `2026-11-${String(14 - i).padStart(2, '0')}T08:00:00Z`, createdAt: '2026-11-14T08:00:00Z', updatedAt: '2026-11-14T08:00:00Z',
}))
const fakeNotebook = { papers: [['paper-2026-i', '2026年新课标Ⅰ卷', 12], ['paper-2025-ii', '2025年新课标Ⅱ卷', 7], ['paper-2024-i', '2024年新课标Ⅰ卷', 4], ['paper-2023-i', '2023年新课标Ⅰ卷', 9]].map(([paperId, paperTitle, entryCount]) => ({ paperId, paperTitle, entryCount })) }
const fakeTokens = { tokens: ['组卷 Agent', '导入 Agent', '审阅 Agent', '旧口令'].map((name, i) => ({ id: `tok-${i}`, name, createdAt: '2026-11-0' + (i + 1) + 'T08:00:00Z', lastUsedAt: i === 1 ? '2026-11-14T08:00:00Z' : null, revokedAt: i === 3 ? '2026-11-10T08:00:00Z' : null })) }

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
    frozen.push({ name: a.animationName || (inDots ? 'wait-dots' : 'web-animation'), target: (target?.getAttribute?.('class') || target?.tagName || '').slice(0, 40) })
  }
  return { count: frozen.length, kinds: [...new Set(frozen.map((f) => f.name))] }
}
function resumeAnimations() {
  for (const a of document.getAnimations()) if (a.playState === 'paused') a.play()
}
function dotsInfo() {
  return [...document.querySelectorAll('.eqb-wait-dots')].map((e) => ({ kind: e.getAttribute('data-kind'), size: e.getAttribute('data-size') || 'md', px: Math.round(e.getBoundingClientRect().width * 10) / 10 }))
}
function boxOf(selector) {
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).slice(0, 8).map((e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), ariaBusy: e.getAttribute('aria-busy'), disabled: e.disabled ?? null }
  })
}
// 页面上在等的样子：灰块几个、读屏能读到的那一句（aria-busy 区域 / role=status 的字 / 看得见的提示行）
function waitInfo() {
  const skeletons = document.querySelectorAll('.eqb-skeleton').length
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].map((e) => ({ tag: e.tagName, cls: (e.getAttribute('class') || '').slice(0, 50), role: e.getAttribute('role'), text: (e.textContent || '').trim().slice(0, 40) }))
  const status = [...document.querySelectorAll('[role="status"], [aria-live]')].map((e) => (e.textContent || '').trim()).filter(Boolean).map((t) => t.slice(0, 40))
  return { skeletons, busy, status }
}
// 行一挂上就把淡入停在第 frame ms：记下行数、动画数、时长和间隔
function armReveal({ selector, frame }) {
  window.__reveal = null
  const obs = new MutationObserver(() => {
    const rows = document.querySelectorAll(selector)
    if (!rows.length) return
    obs.disconnect()
    const anims = document.getAnimations().filter((a) => {
      const t = a.effect?.target
      return t && [...rows].some((r) => r === t)
    })
    for (const a of anims) { a.pause(); a.currentTime = frame }
    window.__reveal = { rows: rows.length, animations: anims.length, timing: anims.slice(0, 4).map((a) => { const t = a.effect.getTiming(); return { duration: t.duration, delay: t.delay, easing: t.easing } }), opacity: [...rows].slice(0, 5).map((r) => Number(getComputedStyle(r).opacity).toFixed(2)) }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}

function holder(filter = () => true) {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      if (!filter(route.request()) || !held) return route.fallback()
      await new Promise((resolve) => waiting.push(resolve))
      return route.fallback().catch(() => {})
    },
    release: () => { held = false; waiting.splice(0).forEach((r) => r()) },
  }
}
// 拦下，过一会儿回假数据
function delayedFake(body) {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      if (held) await new Promise((resolve) => waiting.push(resolve))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {})
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
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })

// 一个上下文 + 一页 + 拍、量、步骤的小工具
async function session({ width = 1440, height = 900, scale = 1, motion = 'no-preference', suffix = '', auth = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'zh-CN', reducedMotion: motion })
  await context.addInitScript(() => { try { delete window.showSaveFilePicker; delete window.showDirectoryPicker } catch {} })
  await paperRoutes(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}: ${String(e).slice(0, 160)}`))
  const park = async () => { await page.mouse.move(1, height - 1); await sleep(200) }
  const shot = async (name, locator, { pad = 8, maxHeight = 0 } = {}) => {
    await locator.scrollIntoViewIfNeeded().catch(() => {})
    const b = await locator.boundingBox()
    if (!b) throw new Error(`${name}: 元素不在屏上`)
    const h = maxHeight ? Math.min(b.height, maxHeight) : b.height
    await page.screenshot({ path: path.join(OUT, 'states', `${name}${suffix}.png`), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + pad * 2, width - Math.max(0, b.x - pad)), height: h + pad * 2 } })
  }
  const freeze = async () => page.evaluate(freezeAnimations, DOTS_FRAME_MS)
  const step = async (name, fn) => {
    const id = `${name}${suffix}`
    if (ONLY && !ONLY.has(name)) return
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
  if (auth) await login(page, rig.base)
  return { context, page, park, shot, freeze, step }
}

try {
  // ════ 小元素（2 倍图）════
  {
    const { context, page, park, shot, freeze, step } = await session({ scale: 2 })

    // ── 整卷页「复制试卷信息」：线程信息没回来时（没准备好），和在复制时（剪贴板写入挂住）
    await step('paper-copy', async (rec) => {
      const review = holder()
      await page.route(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, review.handle)
      rec.cleanup(async () => { review.release(); await page.unroute(/\/api\/import-reviews\/papers\/[^/]+\/product-review/, review.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000); await park()
      const key = page.locator('.paper-review-controls-row .eqb-button').last()
      await key.waitFor({ timeout: 20000 })
      rec.notReady = await page.evaluate(boxOf, '.paper-review-controls-row .eqb-button')
      await shot('paper-copy-notready', key, { pad: 8 })
      review.release(); await sleep(1200); await park()
      rec.ready = await page.evaluate(boxOf, '.paper-review-controls-row .eqb-button')
      await shot('paper-copy-idle', key, { pad: 8 })
      // 剪贴板写入挂住不回：一直在复制
      await page.evaluate(() => { navigator.clipboard.writeText = () => new Promise(() => {}) })
      await key.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.busy = await page.evaluate(boxOf, '.paper-review-controls-row .eqb-button')
      rec.dots = await page.evaluate(dotsInfo)
      await shot('paper-copy-busy', key, { pad: 8 })
      await key.click(); await sleep(200)
      rec.secondClickStillBusy = await page.evaluate(boxOf, '.paper-review-controls-row .eqb-button')
    })

    // ── 超过 10 秒：首页 AI 找题
    await step('home-search-slow', async (rec) => {
      const status = (route) => route.fulfill({ json: { serverKeyAvailable: true } })
      const steward = blocker()
      await page.route('**/api/ai/status', status)
      await page.route('**/api/ai/question-bank-steward', steward.handle)
      rec.cleanup(async () => { await steward.abort(); await page.unroute('**/api/ai/status', status); await page.unroute('**/api/ai/question-bank-steward', steward.handle) })
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('适合高二的环保主题阅读'); await input.press('Enter')
      const notice = page.locator('.concierge-results .concierge-loading').first()
      await notice.waitFor({ timeout: 30000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.early = await page.evaluate(() => document.querySelector('.concierge-results .concierge-loading')?.innerText.trim())
      await sleep(SLOW_MS - HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.slow = await page.evaluate(() => document.querySelector('.concierge-results .concierge-loading')?.innerText.trim())
      await shot('home-search-11s', notice, { pad: 6 })
    })

    // ── 超过 10 秒：选词翻译
    await step('translate-slow', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/paper-translation\/translate$/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/paper-translation\/translate$/, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-translate`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-translate`).click()
      const status = page.locator(`${OVERLAY} .paper-selection-card-status`).first()
      await status.waitFor({ timeout: 15000 })
      await sleep(SLOW_MS); await park()
      rec.frozen = await freeze()
      rec.text = await page.evaluate(boxOf, `${OVERLAY} .paper-selection-card-status`)
      await shot('translate-11s', status, { pad: 8 })
    })

    // ── 超过 10 秒：句子分析
    await step('analyze-slow', async (rec) => {
      const hold = blocker()
      await page.route(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle)
      rec.cleanup(async () => { await hold.abort(); await page.unroute(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle) })
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).click()
      await page.locator('.sa-loading').first().waitFor({ timeout: 15000 })
      await sleep(SLOW_MS); await park()
      rec.frozen = await freeze()
      rec.text = await page.evaluate(boxOf, '.sa-loading')
      rec.head = await page.evaluate(boxOf, '.sa-head')
      await shot('analyze-11s', page.locator('.sa-head').first(), { pad: 4 })
    })

    // ── 首页相似篇章：结果到了，卡片依次淡入（结果用假数据补足三张，请求只读）
    await step('similar-passages', async (rec) => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator('.concierge-paper-row').first().waitFor({ timeout: 30000 }); await sleep(800)
      if (!(await page.locator('.concierge-group-row-line').count())) { await page.locator('.concierge-paper-row-head').first().click(); await sleep(1000) }
      let release
      const gate = new Promise((r) => { release = r })
      const fake = async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        let data = null
        try { data = await (await route.fetch()).json() } catch {}
        data = data && typeof data === 'object' ? data : {}
        const base = (data.results && data.results[0]) || {}
        const results = ['b', 'c', 'd'].map((x, i) => ({ ...base, groupId: `group-2026-i-reading-${x}`, title: `${x.toUpperCase()} 篇`, sourceLabel: '2026年新课标Ⅰ卷 阅读', reasons: [{ kind: 'topic', label: i ? '同体裁：记叙文' : '同话题：人与自然' }] }))
        await gate
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seedProfile: data.seedProfile ?? null, poolStats: { totalInPool: 3, returned: 3 }, ...data, results, notice: null }) }).catch(() => {})
      }
      await page.route('**/api/similar-passages', fake)
      rec.cleanup(async () => { release(); await page.unroute('**/api/similar-passages', fake) })
      await page.locator('.concierge-group-row-line').first().hover(); await sleep(200)
      await page.locator('.concierge-group-row-menu-trigger').first().click(); await sleep(400)
      await page.locator('.eqb-menu .eqb-menu-item').filter({ hasText: '相似篇章' }).first().click()
      await page.locator('.similar-passages-panel').first().waitFor({ timeout: 10000 })
      await sleep(HOLD_BEFORE_SHOT)
      await page.evaluate(armReveal, { selector: '.similar-passages-panel .similar-rcard', frame: REVEAL_FRAME_MS })
      release(); await page.locator('.similar-passages-panel .similar-rcard').first().waitFor({ timeout: 10000 }); await sleep(300); await park()
      rec.reveal = await page.evaluate(() => window.__reveal)
      await shot('similar-passages-rows', page.locator('.similar-passages-panel').first(), { pad: 6, maxHeight: 420 })
    })
    await context.close()
  }

  // ════ 整页的等待和列表（1 倍图）════
  for (const motion of ['no-preference', 'reduce']) {
    const suffix = motion === 'reduce' ? '-reduced' : ''
    const { context, page, park, shot, freeze, step } = await session({ motion, suffix })
    const only = (names, fn) => async (rec) => { if (motion === 'reduce' && !names.includes('reduce')) return; return fn(rec) }

    // 整页在等：拦下 → 150ms 拍一张 → 1200ms 拍一张（灰块停在半周期）→ 放行 → 拍真内容（行淡入停在第 100ms）
    const pageWait = async (rec, { name, url, route, gate, region, measure, rows, after = 1500 }) => {
      await page.route(route, gate.handle)
      rec.cleanup(async () => { gate.release(); await page.unroute(route, gate.handle) })
      await page.goto(rig.base + url)
      const t0 = Date.now()
      await page.locator(region).first().waitFor({ timeout: 30000 })
      await sleep(Math.max(0, 150 - (Date.now() - t0)))
      rec.at150 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      await shot(`${name}-150ms`, page.locator(region).first(), { pad: 0, maxHeight: 900 })
      await sleep(Math.max(0, HOLD_BEFORE_SHOT - (Date.now() - t0))); await park()
      rec.frozen = await freeze()
      rec.at1200 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      rec.waitBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.wait).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-1200ms`, page.locator(region).first(), { pad: 0, maxHeight: 900 })
      await page.evaluate(resumeAnimations)
      if (rows) await page.evaluate(armReveal, { selector: rows, frame: REVEAL_FRAME_MS })
      gate.release()
      await page.locator(measure.readyOn).first().waitFor({ timeout: 60000 })
      await sleep(rows ? 400 : after); await park()
      if (rows) rec.reveal = await page.evaluate(() => window.__reveal)
      rec.readyBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.ready).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-ready`, page.locator(region).first(), { pad: 0, maxHeight: 900 })
      await page.evaluate(resumeAnimations)
    }

    await step('paper-open', only([], async (rec) => {
      await pageWait(rec, {
        name: 'paper-open', url: PAPER, route: /\/paper-assets\/[^/]+\/versions\/v\d+\/paper-asset\.json$/, gate: holder(), region: '.paper-browse-page',
        rows: '.paper-browse-zoom > *',
        measure: {
          wait: { sheet: '.paper-browse-skeleton-sheet', rail: '.paper-browse-skeleton-rail', notice: '.paper-browse-loading .eqb-notice' },
          ready: { sheet: '.paper-browse-zoom', rail: '.paper-browse-rail-panel', first: '.paper-browse-zoom > *' },
          readyOn: '.paper-browse-zoom',
        },
      })
    }))

    await step('practice-open', only([], async (rec) => {
      await pageWait(rec, {
        name: 'practice-open', url: '/?view=vocabulary-practice&setId=set-shot&mode=match', route: /\/api\/vocabulary\/sets\/set-shot$/, gate: delayedFake({ vocabularySet: fakeSet }), region: '.vocabulary-practice-page',
        measure: {
          wait: { heading: '.vocabulary-practice-shell > :nth-child(2)', board: '.vocabulary-practice-skeleton-board, .vocabulary-practice-status' },
          ready: { heading: '.vocabulary-practice-heading', modes: '.vocabulary-practice-modes', board: '.vocabulary-practice-board-section', card: '.vocabulary-match-card' },
          readyOn: '.vocabulary-match-card',
        },
      })
    }))

    await step('myspace-rows', only(['reduce'], async (rec) => {
      await pageWait(rec, {
        name: 'myspace', url: '/?view=my-space', route: /\/api\/my-space(\?.*)?$/, gate: delayedFake({ folders: [], artifacts: fakeArtifacts }), region: '.my-space-main',
        rows: '.my-space-file-list > li',
        measure: { wait: { main: '.my-space-main' }, ready: { rows: '.my-space-file-list > li' }, readyOn: '.my-space-file-list > li' },
      })
    }))

    await step('notebook-rows', only([], async (rec) => {
      await pageWait(rec, {
        name: 'notebook', url: '/?view=vocabulary-notebook', route: /\/api\/vocabulary-notebook\/papers$/, gate: delayedFake(fakeNotebook), region: '.notebook-main',
        rows: '.notebook-main .home-row-list > li',
        measure: { wait: { main: '.notebook-main' }, ready: { rows: '.notebook-main .home-row-list > li' }, readyOn: '.notebook-main .home-row-list > li' },
      })
    }))

    await step('tokens-rows', only([], async (rec) => {
      await pageWait(rec, {
        name: 'tokens', url: '/?view=admin', route: /\/api\/admin\/agent-tokens$/, gate: delayedFake(fakeTokens), region: '.agent-tokens',
        rows: '.agent-tokens ul > li',
        measure: { wait: { section: '.agent-tokens' }, ready: { rows: '.agent-tokens ul > li' }, readyOn: '.agent-tokens ul > li' },
      })
    }))

    // 首页浏览态冷启动：题库连上以后，按年份的卷行依次淡入
    await step('browse-feed', only([], async (rec) => {
      await pageWait(rec, {
        name: 'browse', url: '/?view=browse', route: /\/api\/question-groups(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '.concierge-list-surface',
        rows: '.concierge-default-feed .concierge-paper-list > li',
        measure: { wait: { surface: '.concierge-list-surface' }, ready: { rows: '.concierge-default-feed .concierge-paper-list > li' }, readyOn: '.concierge-default-feed .concierge-paper-list > li' },
      })
    }))

    // 草稿卷「正在打开草稿卷」：先布置三组题（真写进测试库，和第二轮一样），再拦下读取草稿卷
    await step('draft-open', only([], async (rec) => {
      rec.items = await addDraftItems(page)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await pageWait(rec, {
        name: 'draft-open', url: '/?view=draft-paper', route: /\/api\/draft-papers\/current(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '#root',
        after: 2500,
        measure: {
          wait: { rail: '.draft-skeleton-rail', sheet: '.draft-skeleton-sheet', notice: '.draft-loading' },
          ready: { rail: '.draft-paper-rail', col: '.draft-paper-col', sheet: '.draft-a4-sheet, .draft-a4-empty' },
          readyOn: '.draft-paper-rail',
        },
      })
    }))
    await context.close()
  }

  // ════ 公开听写页（不登录）：手机宽、桌面宽 ════
  for (const [width, height, suffix] of [[390, 844, '-390'], [1440, 900, '']]) {
    const { context, page, shot, freeze, step, park } = await session({ width, height, suffix, auth: false })
    await step('dictation-open', async (rec) => {
      const gate = delayedFake(fakeDictation)
      const route = /\/api\/public\/vocabulary\/dictation\/share-shot$/
      await page.route(route, gate.handle)
      rec.cleanup(async () => { gate.release(); await page.unroute(route, gate.handle) })
      await page.goto(rig.base + '/vocabulary/dictation/share-shot')
      const t0 = Date.now()
      await page.locator('#root > *').first().waitFor({ timeout: 30000 })
      await sleep(Math.max(0, 150 - (Date.now() - t0)))
      rec.at150 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      await shot('dictation-open-150ms', page.locator('#root').first(), { pad: 0, maxHeight: height })
      await sleep(Math.max(0, HOLD_BEFORE_SHOT - (Date.now() - t0))); await park()
      rec.frozen = await freeze()
      rec.at1200 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      rec.waitBoxes = { stage: await page.evaluate(boxOf, '.vocabulary-dictation-stage'), controls: await page.evaluate(boxOf, '.vocabulary-dictation-controls'), message: await page.evaluate(boxOf, '.vocabulary-dictation-message') }
      await shot('dictation-open-1200ms', page.locator('#root').first(), { pad: 0, maxHeight: height })
      await page.evaluate(resumeAnimations)
      gate.release()
      // 换后灰块也用 .vocabulary-dictation-stage（同一套容器），真题板认「不在灰块里的」那一个。
      const READY_STAGE = '.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton) .vocabulary-dictation-stage'
      await page.locator(READY_STAGE).first().waitFor({ timeout: 20000 }); await sleep(1200); await park()
      rec.readyBoxes = { stage: await page.evaluate(boxOf, READY_STAGE), controls: await page.evaluate(boxOf, '.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton) .vocabulary-dictation-controls') }
      await shot('dictation-open-ready', page.locator('#root').first(), { pad: 0, maxHeight: height })
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
