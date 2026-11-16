#!/usr/bin/env node
// 等待第五轮（2026-11-15，未；DESIGN.md §5「Waiting 等待」「还没做（第五轮）」六条）换前换后取证：只拍元素截图。
// 换前在没改的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting4-shots.mjs：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在半周期再拍。
//
// 这一轮拍：
//   草稿卷重排等 11 秒那一行（拦住「下移」的保存和新分页，最后 abort）；草稿卷打开（这次拦 /api/draft-papers/:id，第四轮拦 /current 没拦住）；
//   过生词下载等 11 秒（拦住出 PDF 的请求，最后 abort），量那一行出来前后「下载」那一排的位置；
//   扫码听写启动壳（拦住页面代码块，手机宽和桌面宽）：150ms、1200ms、页面代码到了还在读数据、数据到了；听音词卡的启动壳；
//   三处整页等待：生词本一张纸、题组详情、过词进度：150ms、1200ms、数据到了，量灰块和真东西的位置；
//   单词复习牌桌：灰块和真牌桌的位置（第四轮下挪约 9px）；
//   纸面阴影：整卷页的纸、生词本的纸、题组详情的纸，各拍一张带阴影的元素截图，对照脚本逐像素比。
// 会写数据的请求（草稿卷「下移」的保存、出 PDF）拦下后最后 abort，不放行。布置用的写入（草稿卷加三组题、过两个词生成生词组）
// 写在这次临时的数据库里，和第四轮、过生词那一轮一样。
//
// 用法：INVENTORY_PORT_OFFSET=81 node scripts/component-inventory/waiting5-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=draft,review（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png、<输出目录>/keys.json（量到的数、缺了哪步）。
import { spawnSync } from 'node:child_process'
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
if (!process.argv[2]) { console.error('用法：waiting5-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], steps: {} }
const PAPER = '/?view=paper-browse&paperId=paper-2026-i'
const HOLD_BEFORE_SHOT = 1200
const SLOW_MS = 11_000

// ── 假数据（只给读的接口） ──
const WORDS = [['abandon', '放弃'], ['benefit', '好处'], ['capture', '捕获'], ['decline', '下降'], ['emerge', '出现'], ['fragile', '易碎的'], ['genuine', '真正的'], ['harvest', '收获'], ['ignore', '忽视'], ['justify', '证明合理']]
const fakeEntries = WORDS.map(([headword, sense], i) => ({ id: `e${i}`, headword, teachingSense: sense, partOfSpeech: 'v.', sourceMeanings: [], audio: { path: `shot/${headword}.mp3` } }))
const fakeSet = { id: 'set-shot', title: '拍图生词组', studentId: 's', programId: 'p', reviewRunId: null, entryCount: fakeEntries.length, entries: fakeEntries, createdAt: '2026-11-15T00:00:00Z', share: null }
const fakeDictation = { vocabularySet: { title: '拍图听写', entryCount: fakeEntries.length, entries: fakeEntries.map((e) => ({ ...e, answer: e.headword })), createdAt: '2026-11-15T00:00:00Z' } }
const noteSentence = (word, sentence, zh, zhWord) => {
  const start = sentence.indexOf(word)
  const zs = zh.indexOf(zhWord)
  return {
    id: `ctx-${word}`, entryId: `n-${word}`,
    source: { selectedText: word, sentenceText: sentence, selectionInSentence: { start, end: start + word.length }, sourceKind: 'sentence', role: 'passage' },
    glossZh: zhWord, translationZh: zh, targetRanges: [{ start: zs, end: zs + zhWord.length, quote: zhWord }],
    enrichment: { glossStatus: 'done', translationStatus: 'done', alignmentStatus: 'done', retryable: false },
  }
}
const fakeNotebookPaper = {
  paperId: 'paper-2026-i', paperTitle: '2026年新课标Ⅰ卷', entryCount: 3,
  revisions: [{ sourceRevision: 'r1', groups: [{ groupId: 'group-2026-i-reading-a', groupLabel: '阅读 A', entries: [
    ['destination', '目的地', 'The island is a popular destination for divers.', '这座岛是潜水者喜爱的目的地。'],
    ['remarkable', '非凡的', 'She made a remarkable recovery after the accident.', '事故之后她恢复得非常好，令人惊叹。'],
    ['tolerate', '容忍', 'Few plants can tolerate such dry conditions.', '很少有植物能忍受这么干燥的环境。'],
  ].map(([w, m, s, z], i) => ({
    id: `n-${w}`, groupId: 'group-2026-i-reading-a', groupLabel: '阅读 A', groupOrder: i, headword: w,
    pronunciations: [{ pos: 'n.', items: [{ dialect: '美', ipa: `/${w.slice(0, 4)}/` }] }], meanings: [`${i % 2 ? 'adj.' : 'n.'} ${m}`],
    contexts: [noteSentence(w, s, z, m.slice(0, 2))],
  })) }] }],
}

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
    const cs = getComputedStyle(e)
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), visibility: cs.visibility, shadow: cs.boxShadow === 'none' ? null : cs.boxShadow }
  })
}
function waitInfo() {
  const visible = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
  const skeletons = [...document.querySelectorAll('.eqb-skeleton')]
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].map((e) => ({ tag: e.tagName, cls: (e.getAttribute('class') || '').slice(0, 50), role: e.getAttribute('role'), text: (e.textContent || '').trim().slice(0, 40) }))
  const status = [...document.querySelectorAll('[role="status"], [aria-live]')].map((e) => (e.textContent || '').trim()).filter(Boolean).map((t) => t.slice(0, 40))
  const img = [...document.querySelectorAll('#root img')].map((e) => e.getAttribute('src'))
  return { skeletons: skeletons.length, skeletonsVisible: skeletons.filter(visible).length, busy, status, img }
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
    count: () => routes.length,
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
}

const rig = await startRig({ quiet: !process.env.WAITING_VERBOSE })
// 过词要有课程：照 vocab-review-shots.mjs，把仓库自带的 30 词校准课程导进这次临时的数据库。
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

    // 整页在等：拦下 → 150ms → 1200ms（灰块停在半周期）→ 放行 → 真内容
    const pageWait = async (rec, { name, url, route, gate, region, measure, after = 1500, maxHeight = 900 }) => {
      await page.route(route, gate.handle)
      rec.cleanup(async () => { gate.release(); await page.unroute(route, gate.handle) })
      await page.goto(rig.base + url)
      const t0 = Date.now()
      await page.locator(region).first().waitFor({ timeout: 30000 })
      await sleep(Math.max(0, 150 - (Date.now() - t0)))
      rec.at150 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      await shot(`${name}-150ms`, page.locator(region).first(), { pad: 0, maxHeight })
      await sleep(Math.max(0, HOLD_BEFORE_SHOT - (Date.now() - t0))); await park()
      rec.frozen = await freeze()
      rec.at1200 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      rec.waitBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.wait).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-1200ms`, page.locator(region).first(), { pad: 0, maxHeight })
      await page.evaluate(resumeAnimations)
      gate.release()
      await page.locator(measure.readyOn).first().waitFor({ timeout: 60000 })
      await sleep(after); await park()
      rec.readyBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.ready).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-ready`, page.locator(region).first(), { pad: 0, maxHeight })
    }

    // ── 纸面阴影：整卷页的纸（纸的上半截，连两边和上沿的影子）
    await step('shadow', async (rec) => {
      await page.goto(rig.base + PAPER); await settle(page, 3000); await park()
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      rec.paper = await page.evaluate(boxOf, '.paper-browse-zoom')
      await shot('shadow-paper-browse', page.locator('.paper-browse-zoom').first(), { pad: 40, maxHeight: 360 })
    })

    // ── 题组详情「正在读取题组详情」
    await step('detail-open', async (rec) => {
      await pageWait(rec, {
        name: 'detail-open', url: '/?view=detail&groupId=group-2026-i-reading-a',
        route: /\/api\/question-groups\/group-2026-i-reading-a(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '.detail-view',
        after: 2000,
        measure: {
          wait: { hero: '.peek-hero', title: '.peek-title', actions: '.peek-actions', paper: '.peek-paper', notice: '.detail-view .eqb-notice' },
          ready: { hero: '.peek-hero', title: '.peek-title', actions: '.peek-actions', paper: '.peek-paper' },
          readyOn: '.peek-paper--ready',
        },
      })
      rec.paperShadow = await page.evaluate(boxOf, '.peek-paper')
      await shot('shadow-detail', page.locator('.peek-paper').first(), { pad: 40 })
    })

    // ── 生词本「正在打开这张纸」（这张纸用假数据，只读）
    await step('notebook-open', async (rec) => {
      await pageWait(rec, {
        name: 'notebook-open', url: '/?view=vocabulary-notebook&paperId=paper-2026-i',
        route: /\/api\/vocabulary-notebook\/papers\/paper-2026-i(\?.*)?$/, gate: delayedFake(fakeNotebookPaper), region: '.notebook-desk',
        measure: {
          wait: { sheet: '.notebook-sheet', title: '.notebook-sheet .canonical-paper-cover-title', passage: '.notebook-passage', words: '.notebook-word', notice: '.notebook-status' },
          ready: { sheet: 'article.notebook-sheet', title: 'article.notebook-sheet .canonical-paper-cover-title', passage: '.notebook-passage', words: '.notebook-word' },
          readyOn: 'article.notebook-sheet',
        },
      })
      await shot('shadow-notebook', page.locator('article.notebook-sheet').first(), { pad: 40, maxHeight: 360 })
    })

    // ── 过词「正在读取过词进度」（拦下课程列表）
    await step('review-open', async (rec) => {
      await pageWait(rec, {
        name: 'review-open', url: '/?view=vocabulary-review',
        route: /\/api\/vocabulary\/programs(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '.vocabulary-review-shell',
        measure: {
          wait: { setup: '.vocabulary-run-setup', h2: '.vocabulary-run-setup h2', fields: '.vocabulary-run-fields', start: '.vocabulary-run-start-row', direct: '.vocabulary-direct-set' },
          ready: { setup: '.vocabulary-run-setup', h2: '.vocabulary-run-setup h2', fields: '.vocabulary-run-fields', start: '.vocabulary-run-start-row', direct: '.vocabulary-direct-set' },
          readyOn: '.vocabulary-run-start-row',
        },
      })
    })

    // ── 过生词下载等 11 秒：过两个词、生成生词组（写在临时库里），点「下载 → 教师答案」，出 PDF 的请求拦下，最后 abort
    await step('review-download-slow', async (rec) => {
      await page.goto(rig.base + '/?view=vocabulary-review'); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1000)
      await page.locator('.vocabulary-run-fields input').fill('2')
      await page.locator('.vocabulary-run-start-row').getByRole('button').last().click()
      for (let i = 0; i < 2; i++) {
        const u = page.locator('.vocabulary-control-unfamiliar:not(:disabled)'); await u.waitFor({ timeout: 20000 }); await u.click(); await sleep(700)
      }
      const done = page.locator('.vocabulary-completion-state').first()
      await done.waitFor({ timeout: 20000 })
      await done.getByRole('button', { name: '生成固定生词组', exact: true }).click()
      await page.locator('.vocabulary-download-menu').first().waitFor({ timeout: 30000 }); await settle(page, 800)
      const pdf = blocker((req) => req.method() === 'POST' && /\/api\/vocabulary\/sets\/[^/]+\/pdf/.test(req.url()))
      await page.route(/\/api\/vocabulary\/sets\/[^/]+\/pdf/, pdf.handle)
      rec.cleanup(async () => { await pdf.abort(); await page.unroute(/\/api\/vocabulary\/sets\/[^/]+\/pdf/, pdf.handle) })
      await page.locator('.vocabulary-download-menu > button').first().click(); await sleep(300)
      await page.locator('#vocabulary-download-options button').filter({ hasText: '教师答案' }).first().click()
      await sleep(HOLD_BEFORE_SHOT); await park()
      rec.blocked = pdf.count()
      rec.at1200 = { actions: await page.evaluate(boxOf, '.vocabulary-completion-state .vocabulary-completion-actions'), state: await page.evaluate(boxOf, '.vocabulary-completion-state > h2') }
      await page.evaluate(freezeAnimations)
      await shot('review-download-1200ms', done, { pad: 8 })
      await page.evaluate(resumeAnimations)
      await sleep(SLOW_MS - HOLD_BEFORE_SHOT); await park()
      await page.evaluate(freezeAnimations)
      rec.at11s = {
        actions: await page.evaluate(boxOf, '.vocabulary-completion-state .vocabulary-completion-actions'),
        state: await page.evaluate(boxOf, '.vocabulary-completion-state > h2'),
        line: await page.evaluate(boxOf, '.vocabulary-completion-state .eqb-notice'),
      }
      await shot('review-download-11s', done, { pad: 8 })
    })

    // ── 单词复习：灰块和真牌桌（第四轮下挪约 9px）
    await step('practice-open', async (rec) => {
      await pageWait(rec, {
        name: 'practice-open', url: '/?view=vocabulary-practice&setId=set-shot&mode=match', route: /\/api\/vocabulary\/sets\/set-shot$/, gate: delayedFake({ vocabularySet: fakeSet }), region: '.vocabulary-practice-page',
        measure: {
          wait: { heading: '.vocabulary-practice-heading', round: '.vocabulary-practice-round', modes: '.vocabulary-practice-modes', board: '.vocabulary-practice-skeleton-board', h2: '.vocabulary-practice-board-section h2' },
          ready: { heading: '.vocabulary-practice-heading', round: '.vocabulary-practice-round', modes: '.vocabulary-practice-modes', board: '.vocabulary-match-board', h2: '.vocabulary-practice-board-section h2' },
          readyOn: '.vocabulary-match-card',
        },
      })
    })

    // ── 草稿卷：打开（拦 /api/draft-papers/:id 和 /current 的读取）；读完以后「下移」第一组，拦住保存和新分页，等 11 秒
    await step('draft', async (rec) => {
      rec.items = await addDraftItems(page)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await pageWait(rec, {
        name: 'draft-open', url: '/?view=draft-paper', route: /\/api\/draft-papers\/[^/?]+(\?.*)?$/, gate: holder((req) => req.method() === 'GET'), region: '#root',
        after: 2500,
        measure: {
          wait: { rail: '.draft-skeleton-rail', sheet: '.draft-skeleton-sheet', notice: '.draft-loading' },
          ready: { rail: '.draft-paper-rail', col: '.draft-paper-col', sheet: '.draft-a4-sheet, .draft-a4-empty' },
          readyOn: '.draft-paper-rail',
        },
      })
      // 等第一次分页排完（本地约半分钟）
      await page.locator('.draft-a4-sheet iframe').first().waitFor({ timeout: 150000 })
      await page.waitForFunction(() => !document.querySelector('.draft-a4-wait.is-waiting') && !document.querySelector('.draft-skeleton-sheet'), null, { timeout: 150000 })
      await sleep(1500)
      const save = blocker((req) => req.method() !== 'GET')
      const pagination = blocker((req) => req.method() === 'GET')
      await page.route(/\/api\/draft-papers\/[^/]+\/items/, save.handle)
      await page.route(/\/api\/draft-papers\/[^/?]+(\?.*)?$/, save.handle)
      await page.route(/\/api\/draft-papers\/[^/]+\/pagination/, pagination.handle)
      rec.cleanup(async () => {
        await save.abort(); await pagination.abort()
        await page.unroute(/\/api\/draft-papers\/[^/]+\/items/, save.handle)
        await page.unroute(/\/api\/draft-papers\/[^/?]+(\?.*)?$/, save.handle)
        await page.unroute(/\/api\/draft-papers\/[^/]+\/pagination/, pagination.handle)
      })
      await page.getByRole('button', { name: '更多题组操作' }).first().click(); await sleep(300)
      await page.getByRole('menuitem', { name: '下移' }).first().click()
      const line = page.locator('.draft-a4-wait-line').first()
      await line.waitFor({ timeout: 15000 }); await sleep(HOLD_BEFORE_SHOT); await park()
      rec.blocked = { save: save.count(), pagination: pagination.count() }
      await page.evaluate(freezeAnimations)
      rec.reflow1200 = await page.evaluate(boxOf, '.draft-a4-wait-line')
      await shot('draft-reflow-1200ms', line, { pad: 8 })
      await page.evaluate(resumeAnimations)
      await sleep(SLOW_MS - HOLD_BEFORE_SHOT); await park()
      await page.evaluate(freezeAnimations)
      rec.reflow11s = await page.evaluate(boxOf, '.draft-a4-wait-line')
      await shot('draft-reflow-11s', line, { pad: 8 })
    })
    await context.close()
  }

  // ════ 扫码进来的公开页（不登录）：页面代码块拦下，拍启动壳 ════
  for (const [width, height, suffix] of [[390, 844, '-390'], [1440, 900, '']]) {
    const { context, page, shot, freeze, step, park } = await session({ width, height, suffix, auth: false })
    await step('dictation-boot', async (rec) => {
      const code = holder()
      const codeRoute = /VocabularyDictationPage\.tsx/
      const data = delayedFake(fakeDictation)
      const dataRoute = /\/api\/public\/vocabulary\/dictation\/share-shot$/
      await page.route(codeRoute, code.handle)
      await page.route(dataRoute, data.handle)
      rec.cleanup(async () => { code.release(); data.release(); await page.unroute(codeRoute, code.handle); await page.unroute(dataRoute, data.handle) })
      await page.goto(rig.base + '/vocabulary/dictation/share-shot')
      const t0 = Date.now()
      await page.locator('#root > *').first().waitFor({ timeout: 30000 })
      await sleep(Math.max(0, 150 - (Date.now() - t0)))
      rec.at150 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      await shot('dictation-boot-150ms', page.locator('#root').first(), { pad: 0, maxHeight: height })
      await sleep(Math.max(0, HOLD_BEFORE_SHOT - (Date.now() - t0))); await park()
      rec.frozen = await freeze()
      rec.at1200 = { ms: Date.now() - t0, ...(await page.evaluate(waitInfo)) }
      rec.bootBoxes = { stage: await page.evaluate(boxOf, '.vocabulary-dictation-stage'), controls: await page.evaluate(boxOf, '.vocabulary-dictation-controls'), card: await page.evaluate(boxOf, '.public-vocabulary-boot > div') }
      await shot('dictation-boot-1200ms', page.locator('#root').first(), { pad: 0, maxHeight: height })
      await page.evaluate(resumeAnimations)
      // 页面代码到了，数据还没到：页面自己的灰块接上
      code.release()
      await page.locator('.vocabulary-dictation-page, .vocabulary-dictation-message').first().waitFor({ timeout: 30000 })
      await page.waitForFunction(() => !document.querySelector('.public-vocabulary-boot-skeleton') && !document.querySelector('.public-vocabulary-boot'), null, { timeout: 30000 })
      const tCode = Date.now()
      await sleep(100)
      rec.handover100 = { ms: Date.now() - tCode, ...(await page.evaluate(waitInfo)), stage: await page.evaluate(boxOf, '.vocabulary-dictation-stage') }
      await page.evaluate(freezeAnimations)
      await shot('dictation-boot-handover', page.locator('#root').first(), { pad: 0, maxHeight: height })
      await page.evaluate(resumeAnimations)
      data.release()
      const READY_STAGE = '.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton) .vocabulary-dictation-stage'
      await page.locator(READY_STAGE).first().waitFor({ timeout: 20000 }); await sleep(1200); await park()
      rec.readyBoxes = { stage: await page.evaluate(boxOf, READY_STAGE), controls: await page.evaluate(boxOf, '.vocabulary-dictation-shell:not(.vocabulary-dictation-skeleton) .vocabulary-dictation-controls') }
      await shot('dictation-boot-ready', page.locator('#root').first(), { pad: 0, maxHeight: height })
    })
    if (!suffix) {
      await step('listen-boot', async (rec) => {
        const code = holder()
        const codeRoute = /VocabularyListenPage\.tsx/
        await page.route(codeRoute, code.handle)
        rec.cleanup(async () => { code.release(); await page.unroute(codeRoute, code.handle) })
        await page.goto(rig.base + '/vocabulary/listen/share-shot')
        await page.locator('.public-vocabulary-boot > div').first().waitFor({ timeout: 30000 }); await sleep(600)
        rec.card = { ...(await page.evaluate(waitInfo)), card: await page.evaluate(boxOf, '.public-vocabulary-boot > div') }
        await shot('listen-boot', page.locator('.public-vocabulary-boot > div').first(), { pad: 16 })
      })
    }
    await context.close()
  }
} finally {
  delete keys.at
  writeFileSync(path.join(OUT, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing)
