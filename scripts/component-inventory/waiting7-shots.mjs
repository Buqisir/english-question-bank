#!/usr/bin/env node
// 等待第七轮（2026-11-15，壬；DESIGN.md §5「Waiting 等待」「还没做」）换前换后取证：只拍元素截图。
// 换前在没改的代码上跑一次，换后跑一次，两边步骤一样；拍不到的记进 keys.json 的 missing，不补拍。
// 拍法照 waiting6-shots.mjs：拦下那一个接口不放，等过门槛再多等一会儿，把循环动画停在半周期再拍；放行以后逐帧记那一块的顶和高。
//
// 这一轮拍：
//   草稿卷「保存 PDF 到个人空间」对话框：拦下 GET /api/my-space（回三个假文件夹），150 / 1200ms / 数据到了，量对话框和正文每一行；
//   听写工作台（?view=vocabulary-dictation-workbench）：学生、词组库两个接口回假数据并一起拦下，150 / 1200ms / 数据到了，
//     量分区栏、学生下拉、筛选条、词组列表和每一行；学生的听写 / 认词记录也回假的空列表（免得假学生在真库里读出错、多出一行提示）；
//   题组详情 hero：没摘要（库里原样）、有摘要（拦下详情接口，给 summary 填一句）两种，1200ms / 数据到了，量 hero 和下面卷面的顶。
// 会写数据的请求：本轮不点「保存」「新建」；my-space、草稿卷、生词这几类接口的 POST / PUT / PATCH / DELETE 一律 abort，不放行。
// 布置用的写入（草稿卷加三组题）写在这次临时的数据库里，和第四、五、六轮一样。
//
// 用法：INVENTORY_PORT_OFFSET=83 node scripts/component-inventory/waiting7-shots.mjs <输出目录>
//       只跑几步：WAITING_ONLY=space-dialog,workbench（逗号分隔的步骤名）
// 输出：<输出目录>/states/*.png、<输出目录>/keys.json（量到的数、缺了哪步）。
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
if (!process.argv[2]) { console.error('用法：waiting7-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const ONLY = process.env.WAITING_ONLY ? new Set(process.env.WAITING_ONLY.split(',')) : null
const keys = { missing: [], pageErrors: [], aborted: [], steps: {} }
const HOLD_BEFORE_SHOT = 1200

// ── 假数据（只给读的接口） ──
const NOW = '2026-11-15T08:00:00Z'
const fakeFolders = ['高一上 期中', '高二 阅读专项', '寒假作业'].map((name, i) => ({ id: `folder-${i}`, name, artifactCount: i + 1, createdAt: NOW, updatedAt: NOW }))
const fakeStudents = { students: [{ id: 'shot-student', displayName: '林小满', isDefault: true, createdAt: NOW, updatedAt: NOW }] }
const WORDS = ['abandon', 'benefit', 'capture', 'decline', 'emerge', 'fragile', 'genuine', 'harvest', 'ignore', 'justify']
const fakeSet = (i) => ({
  id: `shot-set-${i}`, studentId: 'shot-student', programId: 'wanwei-round-one-v1', reviewRunId: null, share: null,
  title: `第 ${i + 1} 组 · 拍图词组`, entryCount: 8 + i, createdAt: NOW,
  entries: WORDS.slice(0, 8).map((headword, k) => ({ id: `e${i}-${k}`, headword, teachingSense: '义', partOfSpeech: 'v.', sourceMeanings: [] })),
  dictationSummary: { recordCount: 0, latestWrongCount: 0, latestDate: null, pendingCount: 0, meaningRecall: { latestDate: i === 0 ? '2026-11-14' : null, pendingCount: i === 0 ? 3 : 0, repeatedCount: 0 } },
})
const fakeLibrary = { library: { items: Array.from({ length: 5 }, (_, i) => fakeSet(i)), page: 1, pageSize: 20, total: 5, hasMore: false } }
const SUMMARY = '一位退休教师在社区开设免费英语角，记录了邻里之间因为一起学语言而慢慢熟络起来的过程。'

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


// 一组接口一起拦：按地址给假数据（body(url) 返回 null 就不拦，交给后面的路由 / 真服务）。放行以后再来的也马上给。
function delayedFakeBy(body) {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      const req = route.request()
      const data = req.method() === 'GET' ? body(req.url()) : null
      if (data == null) return route.fallback()
      if (held) await new Promise((resolve) => waiting.push(resolve))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }).catch(() => {})
    },
    release: () => { held = false; waiting.splice(0).forEach((r) => r()) },
  }
}
// 真接口取回来改一改再给（只读 GET），拦到放行为止
function heldTransform(edit) {
  const waiting = []
  let held = true
  return {
    handle: async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch()
      let body = await res.text()
      try { const data = JSON.parse(body); edit(data); body = JSON.stringify(data) } catch {}
      if (held) await new Promise((resolve) => waiting.push(resolve))
      return route.fulfill({ response: res, body }).catch(() => {})
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
    // 会真写数据的请求：一律 abort，不放行（只记下来）
    await context.route(/\/api\/(my-space|draft-papers|vocabulary)\b/, (route) => {
      const req = route.request()
      if (req.method() === 'GET') return route.fallback()
      if (keys.allowWrite) return route.fallback()
      keys.aborted.push(`${keys.at}: ${req.method()} ${new URL(req.url()).pathname}`)
      return route.abort()
    })

    // 在等：拦下 → 等待区挂上起算 150ms → 1200ms（灰块停在半周期）→ 放行（逐帧记 track 那块的顶）→ 真内容
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
      // readyState：<option> 这类不算「看得见」的，用 attached 等（换前那次用默认 visible，等不到，记成没拍到）
      await page.locator(measure.readyOn).first().waitFor({ state: measure.readyState || 'visible', timeout: 30000 })
      await sleep(after); await park()
      if (track) rec.track = await page.evaluate(() => window.__track)
      rec.readyBoxes = Object.fromEntries(await Promise.all(Object.entries(measure.ready).map(async ([k, s]) => [k, await page.evaluate(boxOf, s)])))
      await shot(`${name}-ready`, target(), { pad: 0, maxHeight })
    }

    // ── 草稿卷「保存 PDF 到个人空间」对话框：拦下读文件夹
    await step('space-dialog', async (rec) => {
      keys.allowWrite = true
      rec.items = await addDraftItems(page)
      keys.allowWrite = false
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
      const BODY = '.draft-save-space-body'
      const rows = `${BODY} > *`
      await listWait(rec, {
        name: 'space-dialog',
        open: async () => {
          await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(500)
          await page.getByRole('menuitem', { name: '保存 PDF 到个人空间' }).click()
        },
        route: /\/api\/my-space(\?.*)?$/, gate: delayedFakeBy(() => ({ folders: fakeFolders, artifacts: [] })),
        region: 'dialog.draft-save-space-dialog[open]', track: 'dialog.draft-save-space-dialog', after: 1000,
        measure: {
          wait: { dialog: 'dialog.draft-save-space-dialog', rows, notice: `${BODY} .eqb-notice` },
          ready: { dialog: 'dialog.draft-save-space-dialog', rows },
          readyOn: `${BODY} select option:nth-child(2)`, readyState: 'attached',
        },
      })
      rec.options = await page.evaluate(() => [...document.querySelectorAll('.draft-save-space-body select option')].map((o) => o.textContent))
      await page.keyboard.press('Escape'); await sleep(400)
    })

    // ── 听写工作台：学生、词组库一起拦下（假数据）；学生的记录回假的空列表
    await step('workbench', async (rec) => {
      const empty = (url) => {
        const p = new URL(url).pathname
        if (p.endsWith('/dictation-tasks')) return { tasks: [] }
        if (p.endsWith('/dictation-records')) return { records: [] }
        if (p.endsWith('/meaning-recall-records')) return { records: [] }
        if (p.endsWith('/meaning-review-states')) return { states: [] }
        return null
      }
      const side = delayedFakeBy(empty)
      side.release()
      const sideRoute = /\/api\/vocabulary\/(dictation-tasks|dictation-records|meaning-recall-records|meaning-review-states)(\?.*)?$/
      await page.route(sideRoute, side.handle)
      rec.cleanup(async () => { await page.unroute(sideRoute, side.handle) })
      const W = '.dictation-workbench'
      await listWait(rec, {
        name: 'workbench', url: '/?view=vocabulary-dictation-workbench',
        route: /\/api\/vocabulary\/(students|set-library)(\?.*)?$/,
        gate: delayedFakeBy((url) => (new URL(url).pathname.endsWith('/students') ? fakeStudents : fakeLibrary)),
        region: '.dictation-workbench-message, .dictation-workbench', shotOf: '#root', track: '.dictation-set-list',
        measure: {
          wait: { message: '.dictation-workbench-message', nav: `${W} .dictation-workbench-navigation`, tabs: `${W} .dictation-workbench-tabs > *`, picker: `${W} .dictation-student-picker`, pickerBody: `${W} .dictation-student-picker .eqb-field-body`, tools: `${W} .dictation-library-tools`, search: `${W} .dictation-search-field`, dates: `${W} .dictation-date-field`, list: `${W} .dictation-set-list`, rows: `${W} .dictation-set-row` },
          ready: { nav: `${W} .dictation-workbench-navigation`, tabs: `${W} .dictation-workbench-tabs > *`, picker: `${W} .dictation-student-picker`, pickerBody: `${W} .dictation-student-picker .eqb-field-body`, tools: `${W} .dictation-library-tools`, search: `${W} .dictation-search-field`, dates: `${W} .dictation-date-field`, list: `${W} .dictation-set-list`, rows: `${W} .dictation-set-row` },
          readyOn: `${W} .dictation-set-row input`,
        },
      })
    })

    // ── 题组详情 hero：没摘要（库里原样）、有摘要（给 summary 填一句）
    for (const [name, edit] of [['detail-plain', (d) => { if (d.questionGroup) d.questionGroup.summary = '' }], ['detail-summary', (d) => { if (d.questionGroup) d.questionGroup.summary = SUMMARY }]]) {
      await step(name, async (rec) => {
        await listWait(rec, {
          name, url: '/?view=detail&groupId=group-2026-i-reading-a', at150: false,
          route: /\/api\/question-groups\/group-2026-i-reading-a(\?.*)?$/, gate: heldTransform(edit), region: '.detail-view',
          track: '.peek-paper', after: 300,
          measure: {
            wait: { hero: '.peek-hero', summary: '.peek-summary', chips: '.peek-chips', topics: '.peek-topics', actions: '.peek-actions', paper: '.peek-paper' },
            ready: { hero: '.peek-hero', summary: '.peek-summary', chips: '.peek-chips', topics: '.peek-topics', actions: '.peek-actions', paper: '.peek-paper' },
            readyOn: '.peek-root:not(.detail-opening-skeleton) .peek-title',
          },
        })
        rec.paperState = await page.locator('.peek-paper--ready, .peek-paper-placeholder').first().waitFor({ timeout: 20000 })
          .then(() => page.evaluate(() => (document.querySelector('.peek-paper--ready') ? 'ready' : 'placeholder')))
          .catch(() => '卷面 20 秒内没到')
        await sleep(1200); await park()
        rec.readyBoxes2 = { hero: await page.evaluate(boxOf, '.peek-hero'), paper: await page.evaluate(boxOf, '.peek-paper') }
      })
    }
    await context.close()
  }
} finally {
  delete keys.at
  delete keys.allowWrite
  writeFileSync(path.join(OUT, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing, 'aborted', keys.aborted)
