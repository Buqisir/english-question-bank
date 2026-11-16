#!/usr/bin/env node
// 等待第六轮（2026-11-15，申；DESIGN.md §5「Waiting 等待」「还没做」）换前换后取证：只拍元素截图。
// 换前在没改的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting5-shots.mjs：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在半周期再拍。
//
// 这一轮拍：
//   过词进度：灰块和读完的开始页，量上面课程 / 学生那一栏和下面整块的位置；放行以后逐帧记下面整块的顶在哪（看跳没跳）；
//   扫码听写启动壳「出了至少留 500ms」：先热一遍模块缓存，再拦页面代码块，启动壳灰块一出就放行（数据也马上给），
//     逐帧记灰块看得见的那一段有多长；顺带读 --wait-* 变量和灰块动画的时长、延迟（换前换后应一样）；
//   一行字的「加载中」列表：个人空间、Agent 口令、讲评栏配相似、首页相似篇章、草稿卷换篇抽屉：1200ms、数据到了，量行；
//   补拍：题组详情「数据到了」；草稿卷打开 150 / 1200ms（计时从草稿卷那块等待区挂上开始算，不从打开地址算）。
// 会写数据的请求：本轮没有点「加入」「替换」这类键；相似题 / 相似篇章是 POST 但只读，用假数据回。
// 布置用的写入（草稿卷加三组题）写在这次临时的数据库里，和第四、五轮一样。
//
// 用法：INVENTORY_PORT_OFFSET=82 node scripts/component-inventory/waiting6-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=review-open,myspace（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png、<输出目录>/keys.json（量到的数、缺了哪步）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
if (!process.argv[2]) { console.error('用法：waiting6-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], steps: {} }
const PAPER = '/?view=paper-browse&paperId=paper-2026-i'
const HOLD_BEFORE_SHOT = 1200

// ── 假数据（只给读的接口） ──
const WORDS = [['abandon', '放弃'], ['benefit', '好处'], ['capture', '捕获'], ['decline', '下降'], ['emerge', '出现'], ['fragile', '易碎的'], ['genuine', '真正的'], ['harvest', '收获'], ['ignore', '忽视'], ['justify', '证明合理']]
const fakeEntries = WORDS.map(([headword, sense], i) => ({ id: `e${i}`, headword, teachingSense: sense, partOfSpeech: 'v.', sourceMeanings: [], audio: { path: `shot/${headword}.mp3` } }))
const fakeDictation = { vocabularySet: { title: '拍图听写', entryCount: fakeEntries.length, entries: fakeEntries.map((e) => ({ ...e, answer: e.headword })), createdAt: '2026-11-15T00:00:00Z' } }
const fakeArtifacts = Array.from({ length: 5 }, (_, i) => ({
  id: `art-${i}`, folderId: null, title: `拍图卷 ${i + 1}`, fileName: `shot-${i + 1}.pdf`, fileUrl: '/x.pdf', artifactType: 'student-paper',
  sourceDraftPaperId: 'd', sourceDraftTitle: '草稿', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2 + i,
  generatedAt: `2026-11-${String(14 - i).padStart(2, '0')}T08:00:00Z`, createdAt: '2026-11-14T08:00:00Z', updatedAt: '2026-11-14T08:00:00Z',
}))
const fakeTokens = { tokens: ['组卷 Agent', '导入 Agent', '审阅 Agent', '旧口令'].map((name, i) => ({ id: `tok-${i}`, name, createdAt: '2026-11-0' + (i + 1) + 'T08:00:00Z', lastUsedAt: i === 1 ? '2026-11-14T08:00:00Z' : null, revokedAt: i === 3 ? '2026-11-10T08:00:00Z' : null })) }
const similarResults = (withMatched) => ['b', 'c', 'd'].map((x, i) => ({
  groupId: `group-2026-i-reading-${x}`, paperId: 'paper-2026-i', title: `${x.toUpperCase()} 篇`, sourceLabel: '2026年新课标Ⅰ卷 阅读', score: 1 - i / 10,
  reasons: [{ kind: 'topic', label: i ? '同体裁：记叙文' : '同话题：人与自然' }],
  ...(withMatched ? { matchedQuestionIds: [] } : {}),
}))
const fakeSimilarQuestions = { seedProfile: { groupType: 'reading', facets: [] }, results: similarResults(true), poolStats: { totalInPool: 3, returned: 3 } }
const fakeSimilarPassages = { seedProfile: { groupType: 'reading', topicLabels: [] }, results: similarResults(false), poolStats: { totalInPool: 3, returned: 3 }, notice: null }

function freezeAnimations() {
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
    a.currentTime = inDots ? 1400 : (Number(timing.delay) || 0) + duration / 2
    frozen.push(a.animationName || 'web-animation')
  }
  return { count: frozen.length, kinds: [...new Set(frozen)] }
}
function resumeAnimations() {
  for (const a of document.getAnimations()) if (a.playState === 'paused') a.play()
}
function boxOf(selector) {
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).slice(0, 8).map((e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) }
  })
}
function waitInfo() {
  const visible = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
  const skeletons = [...document.querySelectorAll('.eqb-skeleton')]
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].map((e) => ({ tag: e.tagName, cls: (e.getAttribute('class') || '').slice(0, 50), role: e.getAttribute('role'), text: (e.textContent || '').trim().slice(0, 40) }))
  const status = [...document.querySelectorAll('[role="status"], [aria-live]')].map((e) => (e.textContent || '').trim()).filter(Boolean).map((t) => t.slice(0, 40))
  const notices = [...document.querySelectorAll('.eqb-notice')].filter(visible).map((e) => (e.textContent || '').trim().slice(0, 30))
  return { skeletons: skeletons.length, skeletonsVisible: skeletons.filter(visible).length, busy, status, notices }
}
// 逐帧记某个元素的顶（和它有几个灰块）：只记变化的那几帧，看数据到了那一下跳没跳、跳几次
function trackTop(selector) {
  const log = []
  window.__track = log
  let last = ''
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector(selector)
    const r = el?.getBoundingClientRect()
    const sk = el ? el.querySelectorAll('.eqb-skeleton').length : 0
    const key = r ? `${Math.round(r.y)}|${Math.round(r.height)}|${sk}` : 'none'
    if (key !== last) { last = key; log.push({ t: Math.round(performance.now() - t0), y: r ? Math.round(r.y) : null, h: r ? Math.round(r.height) : null, skeletons: sk }) }
    if (log.length < 60 && performance.now() - t0 < 6000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
// 逐帧记屏上看得见的灰块几个（启动壳的灰块门槛内是 visibility: hidden，不算）：只记变化
function trackSkeletons() {
  const log = []
  window.__skel = log
  let last = -1
  const tick = () => {
    let n = 0
    for (const e of document.querySelectorAll('.eqb-skeleton')) if (e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') n += 1
    if (n !== last) { last = n; log.push({ t: Math.round(performance.now()), visible: n, boot: Boolean(document.querySelector('.public-vocabulary-boot-skeleton')) }) }
    if (log.length < 80) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
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
function delayedFake(body, method = 'GET') {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      if (route.request().method() !== method) return route.fallback()
      if (held) await new Promise((resolve) => waiting.push(resolve))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {})
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
}

const rig = await startRig({ quiet: !process.env.WAITING_VERBOSE })
// 过词要有课程：照 waiting5-shots.mjs，把仓库自带的 30 词校准课程导进这次临时的数据库。
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RIGDATA, 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) keys.missing.push('导入校准课程失败：' + imported.stderr.slice(-200))
const browser = await chromium.launch({ channel: 'chromium' })

async function session({ width = 1440, height = 900, scale = 1, suffix = '', auth = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'zh-CN' })
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
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
    await page.screenshot({ path: path.join(OUT, 'states', `${name}${suffix}.png`), clip: { x, y, width: Math.min(b.width + pad * 2, width - x), height: h + pad * 2 } })
  }
  const freeze = async () => page.evaluate(freezeAnimations)
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
  // ════ 登录后的页面（1440，1 倍图）════
  {
    const { context, page, park, shot, freeze, step } = await session()

    // 在等：拦下 → 等待区挂上起算 150ms → 1200ms（灰块停在半周期）→ 放行（逐帧记 track 那块的顶）→ 真内容
    // open：打开的办法（默认打开 url）；region：等待区（从它挂上起计时）；shotOf：拍哪一块（默认 region）
    const listWait = async (rec, { name, url, open, route, gate, region, shotOf, track, measure, after = 1500, maxHeight = 900, at150 = true }) => {
      await page.route(route, gate.handle)
      rec.cleanup(async () => { gate.release(); await page.unroute(route, gate.handle) })
      if (open) await open(); else await page.goto(rig.base + url)
      await page.locator(region).first().waitFor({ timeout: 30000 })
      const t0 = Date.now()
      const target = () => page.locator(shotOf || region).first()
      if (at150) {
        await sleep(Math.max(0, 150 - (Date.now() - t0)))
        rec.at150 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
        await shot(`${name}-150ms`, target(), { pad: 0, maxHeight })
      }
      await sleep(Math.max(0, HOLD_BEFORE_SHOT - (Date.now() - t0))); await park()
      rec.frozen = await freeze()
      rec.at1200 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      rec.waitBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.wait).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-1200ms`, target(), { pad: 0, maxHeight })
      await page.evaluate(resumeAnimations)
      if (track) await page.evaluate(trackTop, track)
      gate.release()
      await page.locator(measure.readyOn).first().waitFor({ timeout: 30000 })
      await sleep(after); await park()
      if (track) rec.track = await page.evaluate(() => window.__track)
      rec.readyBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.ready).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-ready`, target(), { pad: 0, maxHeight })
    }

    // ── 过词进度：上面一栏 + 开始页（拦下课程列表）
    await step('review-open', async (rec) => {
      await listWait(rec, {
        name: 'review-open', url: '/?view=vocabulary-review',
        route: /\/api\/vocabulary\/programs(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '.vocabulary-review-shell',
        track: '.vocabulary-run-setup',
        measure: {
          wait: { heading: '.vocabulary-review-heading', actions: '.vocabulary-heading-actions', switcher: '.vocabulary-student-switcher', progress: '.vocabulary-overall-progress', setup: '.vocabulary-run-setup', h2: '.vocabulary-run-setup h2', start: '.vocabulary-run-start-row', direct: '.vocabulary-direct-set' },
          ready: { heading: '.vocabulary-review-heading', actions: '.vocabulary-heading-actions', switcher: '.vocabulary-student-switcher', progress: '.vocabulary-overall-progress', setup: '.vocabulary-run-setup', h2: '.vocabulary-run-setup h2', start: '.vocabulary-run-start-row', direct: '.vocabulary-direct-set' },
          readyOn: '.vocabulary-run-setup:not(.vocabulary-run-skeleton) .vocabulary-run-start-row',
        },
      })
    })

    // ── 题组详情：补拍「数据到了」（第五轮卡在等 .peek-paper--ready；这次先等 hero 换成真的，卷面另等，等不到不算缺）
    await step('detail-open', async (rec) => {
      await listWait(rec, {
        name: 'detail-open', url: '/?view=detail&groupId=group-2026-i-reading-a', at150: false,
        route: /\/api\/question-groups\/group-2026-i-reading-a(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '.detail-view',
        track: '.peek-paper', after: 300,
        measure: {
          wait: { hero: '.peek-hero', title: '.peek-title', actions: '.peek-actions', paper: '.peek-paper' },
          ready: { hero: '.peek-hero', title: '.peek-title', actions: '.peek-actions', paper: '.peek-paper' },
          readyOn: '.peek-root:not(.detail-opening-skeleton) .peek-title',
        },
      })
      rec.paperState = await page.locator('.peek-paper--ready, .peek-paper-placeholder').first().waitFor({ timeout: 20000 })
        .then(() => page.evaluate(() => (document.querySelector('.peek-paper--ready') ? 'ready' : 'placeholder: ' + (document.querySelector('.peek-paper-placeholder')?.textContent || '').slice(0, 60))))
        .catch(() => '卷面 20 秒内没到')
      await sleep(1200); await park()
      rec.readyBoxes2 = { hero: await page.evaluate(boxOf, '.peek-hero'), paper: await page.evaluate(boxOf, '.peek-paper') }
      await shot('detail-open-ready', page.locator('.detail-view').first(), { pad: 0, maxHeight: 900 })
    })

    // ── 个人空间（假数据，只读）
    await step('myspace', async (rec) => {
      await listWait(rec, {
        name: 'myspace', url: '/?view=my-space', route: /\/api\/my-space(\?.*)?$/, gate: delayedFake({ folders: [], artifacts: fakeArtifacts }), region: '.my-space-main',
        maxHeight: 520,
        measure: {
          wait: { head: '.my-space-section-head', notice: '.my-space-main .eqb-notice', rows: '.my-space-main .my-space-file-row, .my-space-main .my-space-skeleton-row', month: '.my-space-month-head' },
          ready: { head: '.my-space-section-head', rows: '.my-space-file-row', month: '.my-space-month-head' },
          readyOn: '.my-space-file-row',
        },
      })
    })

    // ── Agent 口令（假数据，只读）
    await step('tokens', async (rec) => {
      await listWait(rec, {
        name: 'tokens', url: '/?view=admin', route: /\/api\/admin\/agent-tokens$/, gate: delayedFake(fakeTokens), region: '.agent-tokens',
        maxHeight: 520,
        measure: {
          wait: { notice: '.agent-tokens .eqb-notice', rows: '.agent-tokens ul > li' },
          ready: { rows: '.agent-tokens ul > li' },
          readyOn: '.agent-tokens ul > li[data-token-id]',
        },
      })
    })

    // ── 讲评栏配相似（深链 similar=1；POST /api/similar-questions 是只读检索，拦下回假数据）
    await step('lecture-similar', async (rec) => {
      await listWait(rec, {
        name: 'lecture-similar', url: PAPER + '&focusGroupId=group-2026-i-reading-a&questionId=q-2026-i-021&lecture=1&similar=1', at150: false,
        route: /\/api\/similar-questions$/, gate: delayedFake(fakeSimilarQuestions, 'POST'), region: '.similar-rail',
        maxHeight: 640,
        measure: {
          wait: { notice: '.similar-rail .eqb-notice', rows: '.similar-rail .similar-rcard', seed: '.similar-seed-line' },
          ready: { rows: '.similar-rail .similar-rcard', seed: '.similar-seed-line', list: '.similar-rail .similar-rcard-list' },
          readyOn: '.similar-rail .similar-rcard input',
        },
      })
    })

    // ── 首页相似篇章（照第四轮：找题 → 题组行菜单 →「相似篇章」；POST 只读，拦下回假数据）
    await step('home-similar', async (rec) => {
      await listWait(rec, {
        name: 'home-similar', at150: false,
        open: async () => {
          await page.goto(rig.base + '/'); await settle(page, 1500)
          const input = page.locator('.concierge-intent-input')
          await input.fill('2026 阅读'); await input.press('Enter')
          await page.locator('.concierge-paper-row').first().waitFor({ timeout: 30000 }); await sleep(800)
          if (!(await page.locator('.concierge-group-row-line').count())) { await page.locator('.concierge-paper-row-head').first().click(); await sleep(1000) }
          await page.locator('.concierge-group-row-line').first().hover(); await sleep(200)
          await page.locator('.concierge-group-row-menu-trigger').first().click(); await sleep(400)
          await page.locator('.eqb-menu .eqb-menu-item').filter({ hasText: '相似篇章' }).first().click()
        },
        route: '**/api/similar-passages', gate: delayedFake(fakeSimilarPassages, 'POST'), region: '.similar-passages-panel',
        maxHeight: 560,
        measure: {
          wait: { notice: '.similar-passages-panel .eqb-notice', rows: '.similar-passages-panel .similar-rcard' },
          ready: { rows: '.similar-passages-panel .similar-rcard' },
          readyOn: '.similar-passages-panel .similar-rcard-actions',
        },
      })
    })

    // ── 草稿卷：打开（计时从等待区挂上开始算）；第一次分页排完以后点「换篇」，相似篇章拦下回假数据
    await step('draft', async (rec) => {
      rec.items = await addDraftItems(page)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await listWait(rec, {
        name: 'draft-open', url: '/?view=draft-paper', route: /\/api\/draft-papers\/[^/?]+(\?.*)?$/, gate: holder((req) => req.method() === 'GET'),
        region: 'main.draft-workbench-shell[aria-busy="true"]', shotOf: '#root', after: 2500,
        measure: {
          wait: { rail: '.draft-skeleton-rail', sheet: '.draft-skeleton-sheet' },
          ready: { rail: '.draft-paper-rail', col: '.draft-paper-col', sheet: '.draft-a4-sheet, .draft-a4-empty' },
          readyOn: '.draft-paper-rail',
        },
      })
    })
    await step('draft-swap', async (rec) => {
      if (!(await page.locator('.draft-paper-rail').count())) {
        await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-paper-rail').waitFor({ timeout: 30000 })
      }
      await page.locator('.draft-a4-sheet iframe').first().waitFor({ timeout: 150000 })
      await page.waitForFunction(() => !document.querySelector('.draft-a4-wait.is-waiting') && !document.querySelector('.draft-skeleton-sheet'), null, { timeout: 150000 })
      await sleep(1000)
      await listWait(rec, {
        name: 'draft-swap', at150: false,
        open: async () => { await page.locator('button[aria-label="换篇：换一篇相似篇章"]').first().evaluate((b) => b.click()) },
        route: '**/api/similar-passages', gate: delayedFake(fakeSimilarPassages, 'POST'), region: '.draft-swap-drawer',
        maxHeight: 640,
        measure: {
          wait: { notice: '.draft-swap-drawer .eqb-notice', rows: '.draft-swap-drawer .similar-rcard' },
          ready: { rows: '.draft-swap-drawer .similar-rcard' },
          readyOn: '.draft-swap-drawer .similar-rcard-actions',
        },
      })
    })
    await context.close()
  }

  // ════ 扫码听写启动壳「出了至少留 500ms」（390 宽，不登录）════
  {
    const width = 390, height = 844
    const { context, page, shot, step } = await session({ width, height, suffix: '-390', auth: false })
    await step('dictation-boot-min', async (rec) => {
      const data = delayedFake(fakeDictation)
      const dataRoute = /\/api\/public\/vocabulary\/dictation\/share-shot$/
      await page.route(dataRoute, data.handle)
      data.release() // 数据一直马上给
      rec.cleanup(async () => { await page.unroute(dataRoute, data.handle) })
      // 先热一遍：页面代码块和它的依赖进缓存，第二次放行以后来得快（真扫码时第二次进来也是这样）
      await page.goto(rig.base + '/vocabulary/dictation/share-shot')
      await page.locator('.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton)').first().waitFor({ timeout: 30000 })
      await sleep(500)
      const code = holder()
      const codeRoute = /VocabularyDictationPage\.tsx/
      await page.route(codeRoute, code.handle)
      rec.cleanup(async () => { code.release(); await page.unroute(codeRoute, code.handle) })
      await page.addInitScript(trackSkeletons)
      await page.goto(rig.base + '/vocabulary/dictation/share-shot', { waitUntil: 'commit' })
      // 启动壳的灰块一看得见就放行
      await page.waitForFunction(() => [...document.querySelectorAll('.public-vocabulary-boot-skeleton .eqb-skeleton')].some((e) => getComputedStyle(e).visibility !== 'hidden'), null, { timeout: 10000, polling: 'raf' })
      rec.revealedAt = await page.evaluate(() => Math.round(performance.now()))
      rec.css = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const sk = document.querySelector('.public-vocabulary-boot-skeleton .eqb-skeleton')
        const gate = document.querySelector('.public-vocabulary-boot-skeleton > *')
        return {
          vars: Object.fromEntries(['--wait-show-delay', '--wait-min-visible', '--wait-breathe-cycle'].map((n) => [n, root.getPropertyValue(n).trim() || null])),
          skeletonAnimation: sk ? { name: getComputedStyle(sk).animationName, duration: getComputedStyle(sk).animationDuration, delay: getComputedStyle(sk).animationDelay } : null,
          gateAnimation: gate ? { name: getComputedStyle(gate).animationName, duration: getComputedStyle(gate).animationDuration, delay: getComputedStyle(gate).animationDelay } : null,
        }
      })
      code.release()
      const READY_STAGE = '.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton) .vocabulary-dictation-stage'
      await page.locator(READY_STAGE).first().waitFor({ timeout: 20000 })
      rec.readyAt = await page.evaluate(() => Math.round(performance.now()))
      await sleep(600)
      rec.timeline = await page.evaluate(() => window.__skel)
      const tl = rec.timeline || []
      const shown = tl.find((e) => e.visible > 0)
      const gone = shown ? tl.find((e) => e.t > shown.t && e.visible === 0) : null
      rec.visibleMs = shown && gone ? gone.t - shown.t : null
      rec.gaps = tl.filter((e, i) => i > 0 && e.visible === 0 && tl[i - 1].visible > 0 && tl.slice(i + 1).some((n) => n.visible > 0)).length
      await shot('dictation-boot-min-ready', page.locator('#root').first(), { pad: 0, maxHeight: height })
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
