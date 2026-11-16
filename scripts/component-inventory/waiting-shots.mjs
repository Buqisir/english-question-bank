#!/usr/bin/env node
// 等待的样子统一成一套共用构件（2026-11-15，DESIGN.md §5「Waiting 等待」）换前换后取证：只拍元素截图。
// 换前在改代码之前的工作区跑一次，换后跑一次，两边步骤一样，各只跑一次；拍不到的记进 keys.json 的 missing，不补拍。
//
// 每一步都是「让一件事一直等着」：拦下那一个接口不放（hold），等过 300ms 门槛再多等一会儿，
// 把页面上的循环动画（所以点、灰块呼吸；换前是转圈、扫光）暂停在等待中间的一帧（freeze），再拍。
//
// 用法：INVENTORY_PORT_OFFSET=76 node scripts/component-inventory/waiting-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=home-connecting,detail-add（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png（元素截图，2 倍图）、<输出目录>/keys.json（键宽、所以点是哪一种、缺了哪步）。
// 测试数据：rig.mjs 默认的四篇阅读；草稿卷那一步先加 A、B、C 三篇。整卷页的拦法照 decisions-c-shots.mjs。
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
if (!process.argv[2]) { console.error('用法：waiting-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], steps: {} }
const PAPER = '/?view=paper-browse&paperId=paper-2026-i'
const OVERLAY = '.paper-selection-overlay'
// 等过 300ms 门槛以后再等这么久才拍（所以点进入循环、灰块呼吸起来）。
const HOLD_BEFORE_SHOT = 1200
// 所以点暂停在「这次等待开始以后第 1400ms」：甲是 ∵ 浮着，乙在一呼一吸中间，丙第二次换位走到弧线中间。
const DOTS_FRAME_MS = 1400

// 页面上的循环动画暂停在中间一帧：所以点（.eqb-wait-dots 里的点）按这次等待的时间轴停在 DOTS_FRAME_MS，
// 其余无限循环的（灰块呼吸、换前的转圈和扫光）停在一圈的一半。入场这类一次性的动画不动。
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
// 所以点是哪一种（换后才有）、在不在静止的「…」
function dotsInfo() {
  return [...document.querySelectorAll('.eqb-wait-dots')].map((e) => ({ kind: e.getAttribute('data-kind'), reduced: e.hasAttribute('data-reduced'), active: e.getAttribute('data-active') }))
}
function boxOf(selector) {
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect()
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), ariaBusy: e.getAttribute('aria-busy') }
  })
}

// 拦一个接口不放，release() 以后照常发出去（或 abort）。
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
}

// 在卷面上选中一段字（照 decisions-c-shots.mjs）。
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
    await paperRoutes(context)
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}: ${String(e).slice(0, 160)}`))
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(200) }
    const suffix = motion === 'reduce' ? '-reduced' : ''
    // 元素截图：四周留一点（pad px），看得出键在哪一行里、宽度有没有变。
    const shot = async (name, locator, pad = 8) => {
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      const b = await locator.boundingBox()
      if (!b) throw new Error(`${name}: 元素不在屏上`)
      await page.screenshot({ path: path.join(OUT, 'states', `${name}${suffix}.png`), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } })
    }
    const freeze = async () => page.evaluate(freezeAnimations, DOTS_FRAME_MS)
    const step = async (name, fn) => {
      const id = `${name}${suffix}`
      if (ONLY && !ONLY.has(name)) return
      if (motion === 'reduce' && !['detail-add', 'delete-dialog'].includes(name)) return
      keys.at = id
      const rec = {}
      keys.steps[id] = rec
      const cleanups = []
      rec.cleanup = (fn) => cleanups.push(fn)
      try { await fn(rec) } catch (e) {
        keys.missing.push(`${id}: ${String(e).split('\n')[0].slice(0, 200)}`)
        // 没拍到时记下页面上有哪些等待相关的元素，方便看是哪里没对上（不补拍）
        rec.diag = await page.evaluate(() => ({ url: location.href, found: ['.concierge-desk', '.concierge-status-slot', '.concierge-skeleton-feed', '.concierge-intent-input', '.eqb-notice'].filter((s) => document.querySelector(s)), notices: [...document.querySelectorAll('.eqb-notice')].map((e) => e.innerText.trim()).slice(0, 4) })).catch(() => null)
      }
      // 拦下的接口一律放掉，不连累下一步
      for (const fn of cleanups) await fn().catch?.(() => {})
      delete rec.cleanup
      await page.evaluate(resumeAnimations).catch(() => {})
    }
    await login(page, rig.base)

    // ── 首页：题库还在连（一行等待）。这时的灰块（.concierge-skeleton-chip-row / -feed）画在列表面里，
    //    列表面要等题库连上才出现，所以实际看不到（换前换后一样，探过一次），有就拍、没有记下来。
    await step('home-connecting', async (rec) => {
      const hold = holder()
      await page.route('**/api/question-groups', hold.handle)
      rec.cleanup(async () => { hold.release(); await page.unroute('**/api/question-groups', hold.handle) })
      await page.goto(rig.base + '/')
      await page.locator('.concierge-status-slot .eqb-notice').first().waitFor({ timeout: 30000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.skeletonInDom = await page.evaluate(() => ({ chips: document.querySelectorAll('.concierge-skeleton-chip-row').length, feed: document.querySelectorAll('.concierge-skeleton-feed').length }))
      await shot('home-status', page.locator('.concierge-status-slot').first(), 6)
      await page.evaluate(resumeAnimations)
      hold.release(); await page.unroute('**/api/question-groups', hold.handle)
      await settle(page, 1000)
    })

    // ── 首页：AI 找题在等（一行等待 + 灰块）。照 scripts/brand/states-in-pages.mjs：假装服务器有 AI 密钥，AI 找题的请求不回。
    await step('home-search', async (rec) => {
      const status = (route) => route.fulfill({ json: { serverKeyAvailable: true } })
      const steward = holder()
      await page.route('**/api/ai/status', status)
      await page.route('**/api/ai/question-bank-steward', steward.handle)
      rec.cleanup(async () => { steward.release(); await page.unroute('**/api/ai/status', status); await page.unroute('**/api/ai/question-bank-steward', steward.handle) })
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      // 要走 AI 的说法（「2026 阅读」这种本地精确信息能直接匹配，不走 AI，不会等）
      await input.fill('适合高二的环保主题阅读'); await input.press('Enter')
      await page.locator('.concierge-results .concierge-skeleton-feed').first().waitFor({ timeout: 30000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      await shot('home-search-notice', page.locator('.concierge-results .concierge-loading').first(), 6)
      await shot('home-search-feed', page.locator('.concierge-results .concierge-skeleton-feed').first(), 8)
      await page.evaluate(resumeAnimations)
    })

    // ── 首页结果行：紧凑加入键在加入中 ─────────────────────
    await step('home-row-add', async (rec) => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator('.concierge-paper-row').first().waitFor({ timeout: 30000 }); await sleep(800)
      // 展开第一张卷，露出题组行（行上才有紧凑加入键）
      if (!(await page.locator('.concierge-group-row-add button').count())) {
        await page.locator('.concierge-paper-row-head').first().click(); await sleep(1000)
      }
      const add = page.locator('.concierge-group-row-add button').first()
      await add.waitFor({ timeout: 10000 })
      const row = page.locator('.concierge-group-row-add').first().locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " eqb-row ")][1]')
      rec.idle = await page.evaluate(boxOf, '.concierge-group-row-add')
      await park()
      await shot('row-add-idle', page.locator('.concierge-group-row-trail').first(), 6)
      const hold = holder()
      await page.route('**/api/draft-papers/current/items', hold.handle)
      rec.cleanup(async () => { hold.release(); await page.unroute('**/api/draft-papers/current/items', hold.handle) })
      await add.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.busy = await page.evaluate(boxOf, '.concierge-group-row-add')
      await shot('row-add-busy', page.locator('.concierge-group-row-trail').first(), 6)
      rec.rowFound = await row.count()
      await page.evaluate(resumeAnimations)
      await page.unroute('**/api/draft-papers/current/items', hold.handle)
      hold.release(); await sleep(1500)
    })

    // ── 详情页：主键「加入草稿卷」在加入中（D 篇不在草稿卷里） ──────
    await step('detail-add', async (rec) => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-d'); await settle(page, 2500)
      const key = page.locator('.peek-add button').first()
      await key.waitFor({ timeout: 30000 }); await park()
      rec.idle = await page.evaluate(boxOf, '.peek-add button')
      await shot('detail-add-idle', key)
      // 加入的请求拦下以后不放，最后 abort（不真加进去，后面还要用 D 篇）
      let pendingRoute = null
      const handler = (route) => { pendingRoute = route }
      await page.route('**/api/draft-papers/current/items', handler)
      await key.click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.busy = await page.evaluate(boxOf, '.peek-add button')
      await shot('detail-add-busy', page.locator('.peek-add button').first())
      await page.evaluate(resumeAnimations)
      await page.unroute('**/api/draft-papers/current/items', handler)
      await pendingRoute?.abort().catch(() => {})
      await sleep(800)
    })

    // ── 详情页：删除确认框的「删除题组」在删 ──────────────────
    await step('delete-dialog', async (rec) => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-d'); await settle(page, 2500)
      await page.getByRole('button', { name: '更多操作', exact: true }).first().click(); await sleep(400)
      await page.getByRole('menuitem', { name: /删除/ }).first().click(); await sleep(600)
      const actions = page.locator('.question-group-delete-dialog .eqb-dialog-actions').first()
      await actions.waitFor({ timeout: 10000 }); await park()
      rec.idle = await page.evaluate(boxOf, '.question-group-delete-confirm')
      await shot('delete-idle', actions)
      let pendingRoute = null
      const handler = (route) => { if (route.request().method() === 'DELETE') pendingRoute = route; else return route.fallback() }
      await page.route('**/api/question-groups/**', handler)
      await page.locator('.question-group-delete-confirm').click(); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      rec.busy = await page.evaluate(boxOf, '.question-group-delete-confirm')
      await shot('delete-busy', actions)
      await page.evaluate(resumeAnimations)
      await page.unroute('**/api/question-groups/**', handler)
      // 不真删：回一个出错，确认框留着，换下一步时整页离开
      await pendingRoute?.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '拍图用，不删' }) }).catch(() => {})
      await sleep(600)
    })

    // ── 整卷页选词：翻译在等 ────────────────────────────────
    await step('translate', async (rec) => {
      const hold = holder()
      await page.route(/\/api\/paper-translation\/translate$/, hold.handle)
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-translate`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-translate`).click()
      await page.locator(`${OVERLAY} .paper-selection-card-status`).waitFor({ timeout: 15000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      await shot('translate-status', page.locator(`${OVERLAY} .paper-selection-card-status`).first(), 8)
      await page.evaluate(resumeAnimations)
      await page.unroute(/\/api\/paper-translation\/translate$/, hold.handle)
      hold.release()
    })

    // ── 整卷页选词：句子分析在等 ─────────────────────────────
    await step('analyze', async (rec) => {
      const hold = holder()
      await page.route(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle)
      await page.goto(rig.base + PAPER); await settle(page, 3000)
      await selectOnPaper(page, 'destination', 3)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).waitFor({ timeout: 15000 }); await sleep(300)
      await page.locator(`${OVERLAY} .paper-selection-analyze`).click()
      await page.locator('.sa-loading').first().waitFor({ timeout: 15000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      await shot('analyze-head', page.locator('.sa-head').first(), 4)
      await page.evaluate(resumeAnimations)
      await page.unroute(/\/api\/paper-sentence-analysis\/analyze$/, hold.handle)
      hold.release()
    })

    // ── 草稿卷：「正在生成分页预览」和顶栏「保存中」 ─────────────
    await step('draft', async (rec) => {
      rec.items = await addDraftItems(page)
      const pagination = holder()
      await page.route('**/pagination*', pagination.handle)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await page.goto(rig.base + '/?view=draft-paper')
      const notice = page.locator('.eqb-notice').filter({ hasText: /正在生成分页预览/ }).first()
      await notice.waitFor({ timeout: 60000 })
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.frozen = await freeze()
      rec.dots = await page.evaluate(dotsInfo)
      await shot('draft-pagination', notice, 6)
      await page.evaluate(resumeAnimations)
      // 改卷名：拦下保存（PATCH），顶栏一直「保存中」
      let patchRoute = null
      const patch = (route) => { if (route.request().method() === 'PATCH') patchRoute = route; else return route.fallback() }
      await page.route('**/api/draft-papers/*', patch)
      await page.locator('.topbar-page-title-editable').first().click(); await sleep(300)
      const input = page.locator('.topbar-page-title-input').first()
      await input.waitFor({ timeout: 5000 })
      await input.press('End'); await input.type('（拍图）')
      await sleep(450 + HOLD_BEFORE_SHOT); await park()
      rec.frozen2 = await freeze()
      rec.dots2 = await page.evaluate(dotsInfo)
      rec.status = await page.evaluate(boxOf, '.draft-save-status')
      await shot('draft-saving', page.locator('.draft-save-status').first(), 10)
      await page.evaluate(resumeAnimations)
      await page.unroute('**/api/draft-papers/*', patch)
      await patchRoute?.abort().catch(() => {})
      await page.unroute('**/pagination*', pagination.handle)
      pagination.release()
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
