// 共用提示行（shared-ui/Notice）走查：每一种提示的改前、改后，1440 和 390 两种宽，DPR 2；
// 再量「挪一次发几次分页请求」。
// WALK_MODE=before：在改代码以前跑，出 before-*.png 和 walk-before.json。
// WALK_MODE=after：改完以后跑，出 after-*.png 和 walk-after.json。
// WALK_ONLY=shots 只拍图；WALK_ONLY=count 只量请求次数。
// 本地网站：scripts/component-inventory/rig.mjs，端口偏移 53，临时数据库，owner 账号。
// 出错、等待都是在浏览器里拦接口造的（返回 500 或拖几秒），没有改网站。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const MODE = process.env.WALK_MODE === 'after' ? 'after' : 'before'
const ONLY = process.env.WALK_ONLY || ''
process.env.INVENTORY_PORT_OFFSET = '53'
const ROOT = '/home/user/english-question-bank'
const INV = path.join(ROOT, 'scripts/component-inventory')
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const OUT = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export/fix-notice')
mkdirSync(OUT, { recursive: true })
const record = { mode: MODE, shots: [], counts: [], dialogs: [], errors: [] }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const norm = (t) => (t || '').trim().replace(/\s+/g, ' ')
const FORCED = 'walk-forced 500'

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })

// 分页接口：第一次真排（本地约半分钟），之后都用这一份，按 knob.paginationDelay 拖一会儿再回，
// 这样等待画面拍得到、走查不用每次等一两分钟。knob.paginationFail 时回 500。
let cachedPagination = null
const knob = { paginationDelay: 1500, paginationFail: false, patchDelay: 0, patchFail: false }
const isPagination = (u) => /\/api\/draft-papers\/[^/]+\/pagination$/.test(u.pathname)
const isDraftDoc = (u) => /^\/api\/draft-papers\/(current|[^/]+)$/.test(u.pathname)
// 临时拦截各用一个自己的匹配函数，unroute 时只撤它自己（同一个函数才认）。
const qgMatch = (u) => u.pathname === '/api/question-groups'
const draftGetMatch = (u) => isDraftDoc(u)

async function newPage(width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', (e) => record.errors.push(`${width} pageerror: ${String(e).slice(0, 200)}`))
  page.on('dialog', async (d) => { record.dialogs.push(`${width} ${d.type()}: ${d.message()}`); await d.dismiss().catch(() => {}) })
  page.__pag = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (isPagination(u)) page.__pag.push({ at: Date.now(), url: u.pathname + u.search })
  })
  await page.route((u) => isPagination(u), async (route) => {
    try {
      if (knob.paginationFail) return await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) })
      if (cachedPagination) { await sleep(knob.paginationDelay); return await route.fulfill(cachedPagination) }
      const res = await route.fetch({ timeout: 300000 })
      const body = await res.body()
      if (res.status() === 200) cachedPagination = { status: 200, headers: res.headers(), body }
      return await route.fulfill({ status: res.status(), headers: res.headers(), body })
    } catch {} // 页面已关
  })
  // 排序建议要真排很多遍，和这次无关：一律回「没有建议」那条安静的路。
  await page.route('**/reorder-suggestion*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"walk skips reorder"}' }).catch(() => {}))
  // 保存题组表（PATCH）：按 knob 拖一会儿或者回 500。
  await page.route((u) => isDraftDoc(u), async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    if (knob.patchFail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) })
    if (knob.patchDelay) await sleep(knob.patchDelay)
    return route.fallback()
  })
  await login(page, rig.base)
  return page
}

async function setDraft(page, groups) {
  await page.evaluate(async (gs) => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    for (const g of gs) await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
  }, groups)
}
const THREE = ['group-2026-i-reading-a', 'group-2026-i-reading-c', 'group-2026-i-reading-d']

async function shot(page, width, n, name, info = {}) {
  await page.mouse.move(2, (width === 390 ? 840 : 896))
  await sleep(250)
  const file = `${MODE}-${width}-${n}-${name}.png`
  await page.screenshot({ path: path.join(OUT, file) })
  record.shots.push({ file, width, ...info })
  log('shot', file, JSON.stringify(info).slice(0, 200))
}
const pillText = (page) => page.locator('.basket-chip').first().innerText().then(norm).catch(() => null)

// 卷面出来、没在等。
async function waitPaper(page, limit = 300000) {
  const t0 = Date.now()
  while (Date.now() - t0 < limit) {
    const ok = await page.evaluate(() => {
      const w = document.querySelector('.draft-a4-wait')
      const waiting = !!w && !w.hidden && w.classList.contains('is-waiting')
      return !!document.querySelector('.draft-a4-sheet iframe') && !waiting
    })
    if (ok) return Date.now() - t0
    await sleep(250)
  }
  throw new Error('卷面没出来')
}
async function openDraft(page) {
  await page.goto(rig.base + '/?view=draft-paper')
  await waitPaper(page)
  await settle(page, 800)
}
async function groupMenu(page, item) {
  await page.evaluate(() => window.scrollTo(0, 0))
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('[aria-label="更多题组操作"]').first().click()
    const mi = page.getByRole('menuitem', { name: item })
    if (await mi.waitFor({ timeout: 5000 }).then(() => true).catch(() => false) && await mi.click({ timeout: 5000 }).then(() => true).catch(() => false)) return
    await page.screenshot({ path: path.join(OUT, `debug-${MODE}-menu-${attempt}.png`) })
    await page.keyboard.press('Escape'); await sleep(800)
  }
  throw new Error('题组菜单里没有「' + item + '」')
}
// 页面上所有「提示」的字（改前改后各自的类名都列上），记进 json。
const NOTICE_SEL = '.eqb-notice, .concierge-notice, .concierge-error, .concierge-data-loading, .concierge-loading, .draft-loading, .draft-error, .draft-success, .draft-empty-export, .draft-warning, .draft-undo-toast, .draft-a4-wait-line, .draft-a4-empty:not(.is-blank), .paper-browse-error, .paper-browse-loading, .similar-toast'
const notices = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0').map((e) => {
  const r = e.getBoundingClientRect()
  return { cls: e.className, role: e.getAttribute('role'), text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 220), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
}), NOTICE_SEL)

async function shots(width) {
  const page = await newPage(width)
  const W = width
  // ── 1 首页说明行（搜不到时「没填 AI 密钥…」） ──
  await setDraft(page, THREE)
  await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor({ timeout: 30000 }); await settle(page, 1200)
  await page.locator('.concierge-intent-input').fill('zzqqxx 不存在的题'); await page.locator('.concierge-intent-input').press('Enter'); await settle(page, 1500)
  await shot(page, W, '01', '首页说明行', { notices: await notices(page) })

  // ── 2 首页拿不到题库（拦 /api/question-groups 成 500） ──
  await page.route(qgMatch, (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) }) : route.fallback())
  await page.goto(rig.base + '/'); await settle(page, 2000)
  await shot(page, W, '02', '首页题库没连上', { pill: await pillText(page), notices: await notices(page) })
  if (MODE === 'after') {
    // 重试：先放开接口，再点「重试」
    await page.unroute(qgMatch)
    const retry = page.getByRole('button', { name: '重试' }).first()
    if (await retry.isVisible().catch(() => false)) {
      await retry.click(); await settle(page, 2000)
      await shot(page, W, '02b', '首页重试后', { pill: await pillText(page), notices: await notices(page) })
    }
  } else {
    await page.unroute(qgMatch)
  }

  // ── 3 首页等题库（拖 6 秒） ──
  await page.route(qgMatch, async (route) => { if (route.request().method() === 'GET') await sleep(6000); return route.fallback() })
  await page.goto(rig.base + '/'); await sleep(1500)
  await shot(page, W, '03', '首页等题库', { pill: await pillText(page), notices: await notices(page) })
  await page.unroute(qgMatch)
  await sleep(5000)

  // ── 4 打开草稿卷时等（拖 6 秒） ──
  await page.route(draftGetMatch, async (route) => { if (route.request().method() === 'GET') await sleep(6000); return route.fallback() })
  await page.goto(rig.base + '/?view=draft-paper')
  // 页面自己加载要一两秒，等到顶栏出来再拍（草稿卷接口还拖着）。
  await page.locator('header.topbar').first().waitFor({ timeout: 5000 }).catch(() => {}); await sleep(500)
  await shot(page, W, '04', '打开草稿卷等待', { notices: await notices(page) })
  await page.unroute(draftGetMatch); await sleep(5000)

  // ── 5 草稿卷打不开（GET 草稿卷回 500） ──
  await page.route(draftGetMatch, (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) }) : route.fallback())
  await page.goto(rig.base + '/?view=draft-paper'); await settle(page, 1500)
  await shot(page, W, '05', '草稿卷打不开', { notices: await notices(page) })
  await page.unroute(draftGetMatch)

  // ── 6 第一次生成分页预览时等（还没有旧卷面） ──
  if (cachedPagination) knob.paginationDelay = 8000
  await page.goto(rig.base + '/?view=draft-paper')
  await page.locator('.draft-a4-empty, .draft-a4-sheet').first().waitFor({ timeout: 30000 }); await sleep(1500)
  await shot(page, W, '06', '第一次生成分页预览等待', { notices: await notices(page) })
  knob.paginationDelay = 1500
  await waitPaper(page); await settle(page, 800)

  // ── 7 挪动后等重排（旧卷面加遮罩），分页拖 8 秒 ──
  knob.paginationDelay = 8000
  await groupMenu(page, '下移'); await sleep(1500)
  await shot(page, W, '07', '挪动后等重排', { notices: await notices(page) })
  knob.paginationDelay = 1500
  await waitPaper(page); await settle(page, 600)

  // ── 8 重排失败（分页回 500）＋重试 ──
  knob.paginationFail = true
  await groupMenu(page, '下移')
  await page.waitForFunction(() => { const w = document.querySelector('.draft-a4-wait'); return w && !w.hidden && !w.classList.contains('is-waiting') }, null, { timeout: 30000 }).catch(() => {})
  await sleep(800)
  await shot(page, W, '08', '重排失败', { notices: await notices(page) })
  knob.paginationFail = false
  await page.locator('.draft-a4-wait button').first().click().catch(() => {})
  await waitPaper(page); await settle(page, 600)

  // ── 9 保存失败（PATCH 回 500），打开顶栏「⋯」看那一行 ──
  knob.patchFail = true
  await groupMenu(page, '下移'); await sleep(1500)
  knob.patchFail = false
  await page.locator('.draft-more-menu-trigger').first().click(); await sleep(600)
  await shot(page, W, '09', '保存失败-更多面板', { notices: await notices(page) })
  await page.keyboard.press('Escape'); await page.locator('.draft-more-menu-trigger').first().click().catch(() => {}); await sleep(300)
  await openDraft(page)

  // ── 10 导出出错（print-pdf 回 500） ──
  const exportMenu = async () => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click()
    await page.getByRole('menuitem', { name: /^下载 PDF/ }).click()
  }
  await page.route('**/print-pdf', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) }))
  await exportMenu(); await sleep(1500)
  await shot(page, W, '10', '导出出错', { notices: await notices(page) })
  await page.unroute('**/print-pdf')

  // ── 11 下载成功（假 PDF，带「跨 A3」的检查头） ──
  await page.route('**/print-pdf', (route) => route.fulfill({ status: 200, headers: {
    'content-type': 'application/pdf', 'x-file-name': encodeURIComponent('1114 英语草稿卷-大字无听力版.pdf'),
    'x-paper-font-size-pt': '12', 'x-paper-crossing-group-count': '1', 'x-paper-split-option-bank-count': '0' }, body: '%PDF-1.4\n%walk\n' }))
  await exportMenu(); await sleep(1500)
  await shot(page, W, '11', '下载成功', { notices: await notices(page) })
  await page.unroute('**/print-pdf')

  // ── 12 移除后的撤销提示 ──
  await openDraft(page)
  await groupMenu(page, '移除'); await sleep(1200)
  await shot(page, W, '12', '移除后撤销提示', { notices: await notices(page) })
  await waitPaper(page).catch(() => {})

  // ── 13 空卷导出提示 ──
  await setDraft(page, [])
  await page.goto(rig.base + '/?view=draft-paper'); await page.getByText('还没有题组').first().waitFor({ timeout: 30000 }); await settle(page, 1000)
  await shot(page, W, '13', '空卷导出提示', { notices: await notices(page) })

  // ── 14 整卷预览打不开（测试数据的卷面文件没拆包，页面自己报错） ──
  await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 3000)
  await shot(page, W, '14', '整卷预览打不开', { notices: await notices(page) })

  // ── 15 整卷预览：相似题批量加入失败（拦加入接口 500） ──
  try { await similarAddFail(page, W) } catch (e) { record.errors.push(`${W} similar: ${String(e).slice(0, 200)}`) }

  await page.context().close()
}

// 整卷预览「讲评 · 相似题」多选后「加入草稿卷」，加入接口回 500。
async function similarAddFail(page, W) {
  await setDraft(page, [])
  let content = null
  await page.route('**/paper-assets/paper-2026-i/versions/*/paper-asset.json', async (route) => {
    const res = await route.fetch(); const j = await res.json()
    const doc = j.schemaVersion === 'source-capture-v1' ? j.documents.find((d) => d.encodedBytes) : null
    if (doc) { try { content = JSON.parse(Buffer.from(doc.encodedBytes, 'base64').toString('utf8')).content } catch {} }
    return doc ? route.fulfill({ response: res, body: Buffer.from(doc.encodedBytes, 'base64') }) : route.fulfill({ response: res })
  })
  await page.route('**/api/similar-questions', (r) => r.fulfill({ json: {
    seedProfile: { groupType: 'reading', facets: [], topicLabels: [] }, poolStats: { totalInPool: 2, returned: 2 },
    results: [
      { groupId: 'group-2026-i-reading-c', paperId: 'paper-2026-i', title: 'Reading C', sourceLabel: '2026年新课标Ⅰ卷', score: 1, reasons: [{ kind: 'topic-match', label: '走查塞的数据' }], matchedQuestionIds: [] },
      { groupId: 'group-2026-i-reading-d', paperId: 'paper-2026-i', title: 'Reading D', sourceLabel: '2026年新课标Ⅰ卷', score: 1, reasons: [{ kind: 'topic-match', label: '走查塞的数据' }], matchedQuestionIds: [] },
    ] } }))
  await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 3000)
  const q = content && Object.entries(content.questions || {}).find(([, m]) => m.groupId === 'group-2026-i-reading-a')
  if (!q) throw new Error('没找到 A 篇的题号')
  await page.route('**/api/draft-papers/current/items', (r) => r.request().method() === 'POST'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: FORCED }) }) : r.fallback())
  await page.goto(rig.base + `/?view=paper-browse&paperId=paper-2026-i&lecture=1&similar=1&focusGroupId=group-2026-i-reading-a&questionId=${encodeURIComponent(q[0])}`); await settle(page, 3000)
  const box = page.locator('.similar-rcard input[type=checkbox]').first()
  if (!(await box.waitFor({ timeout: 15000 }).then(() => true).catch(() => false))) {
    await page.screenshot({ path: path.join(OUT, `debug-${MODE}-similar.png`) })
    throw new Error('相似题卡片没出来：' + (await page.locator('.similar-rail, .paper-browse-error').first().innerText().catch(() => '无')).slice(0, 200))
  }
  await box.check()
  await page.locator('.similar-rail-foot button').click(); await sleep(1200)
  await shot(page, W, '15', '相似题批量加入失败', { notices: await notices(page) })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
}

// 挪一次发几次分页请求。patchDelay：把保存（PATCH）拖多久再放行（本地很快，线上或服务器忙时会慢）。
async function counts() {
  const page = await newPage(1440)
  await setDraft(page, THREE)
  for (const [label, patchDelay] of [['保存不拖', 0], ['保存拖 1 秒', 1000], ['保存不拖（第二次）', 0], ['保存拖 1 秒（第二次）', 1000]]) {
    knob.paginationDelay = 1500
    await openDraft(page)
    await sleep(1500)
    knob.patchDelay = patchDelay
    page.__pag.length = 0
    const t0 = Date.now()
    const patch = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/draft-papers\//.test(r.url()), { timeout: 60000 }).then(() => Date.now() - t0)
    await groupMenu(page, '下移')
    const patchMs = await patch
    await sleep(6000)
    await waitPaper(page)
    await sleep(3000)
    const reqs = page.__pag.map((r) => r.at - t0)
    knob.patchDelay = 0
    record.counts.push({ what: `下移一次（${label}）`, paginationRequests: reqs.length, requestAtMs: reqs, patchDoneMs: patchMs })
    log('count', label, reqs.length, reqs, 'patch', patchMs)
  }
  // 拖动换位：左栏拖一个题组到另一个上面
  {
    await openDraft(page); await sleep(1500)
    page.__pag.length = 0
    const t0 = Date.now()
    const items = page.locator('.draft-paper-rail-item')
    await items.nth(0).dragTo(items.nth(2)).catch((e) => record.errors.push('drag: ' + String(e).slice(0, 120)))
    await sleep(6000); await waitPaper(page); await sleep(3000)
    const reqs = page.__pag.map((r) => r.at - t0)
    record.counts.push({ what: '左栏拖动换位一次（保存不拖）', paginationRequests: reqs.length, requestAtMs: reqs })
    log('count drag', reqs.length, reqs)
  }
  await page.context().close()
}

try {
  if (ONLY === 'similar') {
    const page = await newPage(1440); await similarAddFail(page, 1440); await page.context().close()
  } else if (ONLY !== 'count') {
    for (const w of (process.env.WALK_WIDTHS || '1440,390').split(',').map(Number)) {
      try { await shots(w) } catch (e) { record.errors.push(`${w} shots: ${String(e).slice(0, 300)}`); log('ERR', w, e) }
    }
  }
  if (ONLY !== 'shots' && ONLY !== 'similar') {
    try { await counts() } catch (e) { record.errors.push(`counts: ${String(e).slice(0, 300)}`); log('ERR counts', e) }
  }
} finally {
  writeFileSync(path.join(OUT, `walk-${MODE}${ONLY ? '-' + ONLY : ''}.json`), JSON.stringify(record, null, 2))
  await browser.close()
  await rig.stop()
}
process.exit(0)
