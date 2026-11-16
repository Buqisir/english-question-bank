#!/usr/bin/env node
// 构件收尾（2026-11-15）换前换后取证：拍图、量点击区域、走键盘、记读屏名。
// 换前在 HEAD 的 git worktree 里跑（把这个文件拷进去），换后在当前工作区跑，两边步骤一样，
// 再用 finish-compare.mjs 逐像素对照、拼对照图。
//
// 用法：INVENTORY_PORT_OFFSET=68 node scripts/component-inventory/finish-shots.mjs <输出目录>
// 输出：<输出目录>/pages/*.png（整页，看没换的页面变没变）、<输出目录>/states/*.png（改了的地方）、
//       <输出目录>/keys.json（键盘和读屏实测、点击区域、实算样式、浏览器原生框的字、缺了哪步）。
// 测试数据：rig.mjs 默认那四篇阅读；词汇听写页要的词表和词组在这里种（和 verify-vocabulary-dictation-review 同一种假词条）。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { startRig } from './rig.mjs'
import { RAW } from './lib.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = appRequire('playwright')
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8') // axe-core 装在 scripts/component-inventory 下

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：finish-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
for (const d of ['pages', 'states']) mkdirSync(path.join(OUT, d), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const keys = { missing: [], nativeDialogs: [], pageErrors: [] }
// 只补拍几步时：FINISH_ONLY=draft,draft-a3（逗号分隔的步骤名），整页那一段也跳过。
const ONLY = process.env.FINISH_ONLY ? new Set(process.env.FINISH_ONLY.split(',')) : null

// ── 词汇听写页的假数据 ─────────────────────────────────────
function makeEntry(index) {
  const label = `word${String(index + 1).padStart(3, '0')}`
  return {
    id: `finish-entry-${String(index + 1).padStart(3, '0')}`, groupId: 'finish-group-1', headword: label, phonetic: `/${label}/`, partOfSpeech: 'n.',
    sourceMeanings: [`${label} 来源义`], teachingSense: `${label} 核心义`, pronunciationMode: 'syllables', syllables: [label],
    example: { english: `We learn ${label}.`, chinese: `我们学习 ${label}。`, highlight: label, reviewStatus: 'approved' },
    exampleCandidates: ['a', 'b', 'c'].map((candidateId) => ({ candidateId, version: 'finish-examples-v1', teachingSense: `${label} 核心义`, english: `We learn ${label} in example ${candidateId}.`, chinese: `我们在例句 ${candidateId} 中学习 ${label}。`, highlight: label, reviewStatus: 'approved' })),
    visual: { key: `visual-${label}`, version: 'finish-visual-v1', path: `/vocabulary-assets/test/${label}.svg`, alt: `${label} 教学图` },
    audio: { key: `audio-${label}`, version: 'eqb-british-teacher-v1', path: `/vocabulary-assets/test/${label}.mp3`, voice: 'eqb-british-teacher-v1' },
    source: { stage: 'core', day: 1, sourceOrder: index + 1, printedPage: 1, verification: 'page-checked' },
  }
}
const VOCAB_ENTRIES = Array.from({ length: 130 }, (_, i) => makeEntry(i))
async function seedVocabularyProgram() {
  const store = await import(pathToFileURL(path.join(ROOT, 'server/vocabulary/vocabularyStore.mjs')).href)
  const db = new DatabaseSync(path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata', 'qb.sqlite'))
  store.replaceVocabularyProgram(db, {
    id: 'wanwei-round-one-v1', version: 'finish-v1', title: '万唯1600词', subtitle: '构件收尾取证', sourceTitle: '测试词表', sourceEdition: 'v1', totalPlannedEntries: 1600,
    groups: [{ id: 'finish-group-1', stage: 'core', week: 1, group: 1, sourceLabel: 'Day 1', startOrder: 1, endOrder: 130 }],
    entries: VOCAB_ENTRIES,
  })
  db.close()
}

// ── 个人空间的假数据（和 space-shots.mjs 同一种）────────────
const T = '2026-11-12T08:30:00.000Z'
const ART = (id, title) => ({ id, folderId: null, title, fileName: `${title}.pdf`, fileUrl: `/api/my-space/artifacts/${id}/file`, artifactType: 'student-paper', sourceDraftPaperId: `draft-${id}`, sourceDraftTitle: title, sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: T, createdAt: T, updatedAt: T })
const ALL_ARTIFACTS = [ART('artifact-a', '一卷阅读 A 篇练习'), ART('artifact-b', '期中复习卷'), ART('artifact-c', '期末冲刺卷')]

// ── 页面里量东西 ─────────────────────────────────────────
function describeFocus() {
  const e = document.activeElement
  if (!e || e === document.body) return 'body（焦点落空）'
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const cls = typeof e.className === 'string' ? e.className.split(' ').filter((c) => c && !c.startsWith('eqb-button')).slice(0, 2).join('.') : ''
  return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}「${name}」`
}
function describeDialog() {
  const d = [...document.querySelectorAll('dialog[open]')].pop()
  if (!d) return null
  const text = (ids) => (ids || '').split(/\s+/).map((id) => document.getElementById(id)?.innerText.trim()).filter(Boolean).join(' ')
  return {
    role: d.getAttribute('role') || 'dialog', modal: d.matches(':modal'),
    name: d.getAttribute('aria-label') || text(d.getAttribute('aria-labelledby')), description: text(d.getAttribute('aria-describedby')),
    buttons: [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()),
    focusInside: d.contains(document.activeElement),
  }
}
// 实际能点到的范围：从中心往四个方向一点点走，elementFromPoint 还落在这个元素（或它里面、它的 ::after）就算。
function hitArea(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const r = el.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const hits = (x, y) => { const t = document.elementFromPoint(x, y); return Boolean(t && (t === el || el.contains(t))) }
  const reach = (dx, dy) => { let d = 0; while (d < 40 && hits(cx + dx * (d + 0.5), cy + dy * (d + 0.5))) d += 0.5; return d }
  const round = (n) => Math.round(n * 10) / 10
  // 往上、往下走到头时挡住的是谁（不是它自己时，说明是旁边的东西盖住了外扩）
  const who = (x, y) => { const t = document.elementFromPoint(x, y); return t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : null }
  const up = reach(0, -1), down = reach(0, 1)
  return { visible: `${round(r.width)}×${round(r.height)}`, hit: `${round(reach(-1, 0) + reach(1, 0))}×${round(up + down)}`, centerHits: hits(cx, cy), blockedBy: [who(cx, cy - up - 0.5), who(cx, cy + down + 0.5)] }
}
function styleOf(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const cs = getComputedStyle(el), r = el.getBoundingClientRect()
  return { text: el.innerText.trim().slice(0, 30), color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius, font: `${cs.fontSize}/${cs.fontWeight}`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
}

// 对话框只拍框本身（从标题到动作区），不拍整个视口
const DIALOG_BOX = (page) => [page.locator('dialog[open] .eqb-dialog-head').last(), page.locator('dialog[open] .eqb-dialog-foot').last()]

async function shotAround(page, file, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, 'states', `${file}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 和 detail-shots.mjs 同一个办法：本地网站的题组没有 canonicalPaperId / paperSurfaceHref，卷面、「展开卷面」「相似篇章」都不出。
// 拦下题组详情接口给 A 篇补上；卷子资产用服务端同一个投影函数转成页面要的样子。换前换后同一份数据。
const PATCH_GROUP = 'group-2026-i-reading-a'
async function patchDetailRoutes(context) {
  await context.route(/\/api\/question-groups\/[^/?]+(\?[^/]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop())
    const res = await route.fetch()
    let body = await res.text()
    try {
      const data = JSON.parse(body)
      const visit = (node) => {
        if (!node || typeof node !== 'object') return
        if (node.id === id && 'groupType' in node) {
          node.canonicalPaperId ||= 'paper-2026-i'
          if (id === PATCH_GROUP) Object.assign(node, { hasPaperSurfaceAnalysis: true, paperSurfaceHref: `/?view=paper-browse&paperId=paper-2026-i&focusGroupId=${id}`, paperSurfaceLabel: '阅读解析' })
          return
        }
        for (const v of Object.values(node)) visit(v)
      }
      visit(data); body = JSON.stringify(data)
    } catch {}
    await route.fulfill({ response: res, body })
  })
  const { loadCanonicalSourceAssetRepresentation } = await import(pathToFileURL(path.join(ROOT, 'server/paper-canonical/sourceAssetRepresentation.mjs')).href)
  await context.route(/\/paper-assets\/[^/]+\/versions\/v\d+\/paper-asset\.json$/, async (route) => {
    const res = await route.fetch()
    const m = /\/paper-assets\/([^/]+)\/versions\/(v\d+)\//.exec(new URL(route.request().url()).pathname)
    let body = await res.text()
    try {
      const { asset } = loadCanonicalSourceAssetRepresentation({ sourceAsset: JSON.parse(body), versionDir: path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata', 'assets', m[1], 'versions', m[2]), label: 'rig', reject: (msg) => { throw new Error(msg) } })
      body = JSON.stringify(asset)
    } catch {}
    await route.fulfill({ response: res, body })
  })
}

const rig = await startRig({ quiet: true })
await seedVocabularyProgram()
const browser = await chromium.launch({ channel: 'chromium' })
const WIDTHS = [[390, 844, '-390'], [1440, 900, '']]
try {
  // ── 先种好：草稿卷三组、两个词组 ───────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    await login(page, rig.base)
    keys.draftItems = await addDraftItems(page)
    keys.vocabSets = await page.evaluate(async (entryIds) => {
      const students = (await (await fetch('/api/vocabulary/students')).json()).students
      const made = []
      // 一个词组最多 60 词：三组各 50，原始 150 词（过 120 出打印确认）、去重 130 词（过 60 出拆份确认）
      for (const [title, ids] of [['第一组', entryIds.slice(0, 50)], ['第二组', entryIds.slice(40, 90)], ['第三组', entryIds.slice(80, 130)]]) {
        const r = await fetch('/api/vocabulary/sets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: students[0].id, programId: 'wanwei-round-one-v1', entryIds: ids, title }) })
        made.push(`${title} ${r.status}${r.ok ? '' : ' ' + (await r.text()).slice(0, 160)}`)
      }
      // 学生扫码听写页（拍「重播本题」）：拿第一组建一份带分享的听写
      const lib = (await (await fetch(`/api/vocabulary/set-library?studentId=${encodeURIComponent(students[0].id)}&programId=wanwei-round-one-v1&page=1`)).json()).library
      const first = lib?.items?.find((s) => s.title === '第一组')
      const t = await fetch('/api/vocabulary/dictation-tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: students[0].id, sourceSetIds: [first?.id], title: '取证听写', accent: 'british', share: true, programId: 'wanwei-round-one-v1' }) })
      const task = t.ok ? (await t.json()).task : null
      return { student: students[0]?.displayName, made, taskStatus: t.status, taskError: t.ok ? null : (await t.text()).slice(0, 160), shareId: task?.share?.shareId || null }
    }, VOCAB_ENTRIES.map((e) => e.id))
    await context.close()
  }

  // ── 一、整页：没换的页面逐像素核对用（只拍视口，静止、鼠标停在角落） ──────────
  for (const [width, height, suffix] of ONLY ? [] : WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folders: [], artifacts: ALL_ARTIFACTS }) }) : route.fallback())
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`pages${suffix}: ${String(e).slice(0, 160)}`))
    const shoot = async (name, url, wait = 2000) => {
      try {
        await page.goto(rig.base + url); await settle(page, wait); await page.mouse.move(1, height - 1); await sleep(300)
        await page.evaluate(() => document.activeElement?.blur())
        await page.screenshot({ path: path.join(OUT, 'pages', `${name}${suffix}.png`) })
      } catch (e) { keys.missing.push(`pages ${name}${suffix}: ${String(e).split('\n')[0].slice(0, 160)}`) }
    }
    const fresh = await context.newPage()
    await fresh.goto(rig.base + '/'); await fresh.locator('.login-card').waitFor({ timeout: 30000 }); await settle(fresh, 1500)
    await fresh.screenshot({ path: path.join(OUT, 'pages', `login${suffix}.png`) }); await fresh.close()
    await login(page, rig.base)
    await shoot('home', '/')
    await shoot('browse', '/?view=browse')
    await shoot('detail', '/?view=detail&groupId=group-2026-i-reading-a', 3000)
    await shoot('paper-browse', '/?view=paper-browse&paperId=paper-2026-i', 3000)
    await shoot('my-space', '/?view=my-space')
    await shoot('vocab-notebook', '/?view=vocabulary-notebook')
    await shoot('vocab-review', '/?view=vocabulary-review')
    await shoot('vocab-practice', '/?view=vocabulary-practice')
    await shoot('vocab-dictation', '/?view=vocabulary-dictation-workbench')
    await shoot('admin', '/?view=admin')
    // 学生扫码听写页：不用登录；「重播本题」从胶囊改 8px（下面 states 里另拍近景）
    if (keys.vocabSets.shareId) {
      const pub = await context.newPage()
      try {
        await pub.goto(`${rig.base}/vocabulary/dictation/${keys.vocabSets.shareId}`); await settle(pub, 2500); await pub.mouse.move(1, height - 1); await sleep(300)
        await pub.screenshot({ path: path.join(OUT, 'pages', `public-dictation${suffix}.png`) })
      } catch (e) { keys.missing.push(`pages public-dictation${suffix}: ${String(e).split('\n')[0].slice(0, 160)}`) }
      await pub.close()
    }
    await context.close()
  }

  // ── 二、改了的地方 ─────────────────────────────────────
  for (const [width, height, suffix] of WIDTHS) {
    const wide = !suffix
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await patchDetailRoutes(context)
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`states${suffix}: ${String(e).slice(0, 160)}`))
    // 浏览器原生的确认框截不到图：记下字，按「取消」或「确定」（nativeAnswer）。
    let nativeAnswer = 'dismiss'
    page.on('dialog', async (d) => { keys.nativeDialogs.push({ at: `${keys.at}${suffix}`, type: d.type(), message: d.message(), answer: nativeAnswer }); await (nativeAnswer === 'accept' ? d.accept() : d.dismiss()) })
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(250) }
    const keyFocus = async (l) => { await page.keyboard.press('Shift'); await l.focus(); await sleep(250) }
    const rec = {}
    keys[`w${width}`] = rec
    const step = async (name, fn) => { if (ONLY && !ONLY.has(name)) return; keys.at = name; try { await fn() } catch (e) { keys.missing.push(`${name}${suffix}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    await login(page, rig.base)

    // 1. 首页：草稿丸、行首小箭头、思考模式开关、已选筛选悬停
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500); await park()
      const chip = page.locator('.basket-chip').first(); await chip.waitFor({ timeout: 15000 })
      await shotAround(page, `basket-home${suffix}`, [chip], 12); rec.basketHome = await page.evaluate(styleOf, '.basket-chip')
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter')
      const toggle = page.locator('.concierge-command-filter-toggle'); await toggle.waitFor({ timeout: 30000 }); await settle(page, 1200); await park()
      rec.rowExpandHit = await page.evaluate(hitArea, '.concierge-row-expand')
      // 开关包在 <label> 里，点 label 上任何地方都切换，所以量整个 label（::after 外扩也在里面）。
      rec.thinkingHit = await page.evaluate(hitArea, '.concierge-thinking-toggle')
      rec.thinkingInputHit = await page.evaluate(hitArea, '.concierge-thinking-toggle input[type="checkbox"]')
      await shotAround(page, `thinking-toggle${suffix}`, [page.locator('.concierge-thinking-toggle').first()], 16)
      await shotAround(page, `row-expand${suffix}`, [page.locator('.concierge-row-expand').first()], 24)
      await toggle.click(); await page.locator('.concierge-filter-row').first().waitFor({ timeout: 10000 }); await sleep(500)
      await page.locator('.concierge-filter-row .concierge-starter-chip:not(.is-zero)').first().click(); await sleep(900)
      await toggle.click(); await sleep(900); await page.evaluate(() => document.activeElement?.blur()); await park()
      const act = page.locator('.concierge-active-filter-chip').first(); await act.waitFor({ timeout: 10000 })
      const chips = page.locator('.concierge-active-filter-chips').first()
      rec.activeFilterRest = await page.evaluate(styleOf, '.concierge-active-filter-chip')
      await shotAround(page, `active-filter${suffix}`, [chips], 12)
      await act.hover(); await sleep(400)
      rec.activeFilterHover = await page.evaluate(styleOf, '.concierge-active-filter-chip')
      await shotAround(page, `active-filter-hover${suffix}`, [chips], 12); await park()
    })

    // 2. 详情页：草稿丸、展开卷面 / 收起卷面、读取失败
    await step('detail', async () => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-a'); await page.locator('.peek-actions').waitFor({ timeout: 30000 }); await settle(page, 2000); await park()
      await shotAround(page, `basket-detail${suffix}`, [page.locator('.basket-chip').first()], 12)
      rec.backButton = await page.evaluate(hitArea, '.detail-view > .detail-back')
      const expand = page.locator('.peek-expand').first()
      await expand.scrollIntoViewIfNeeded(); await sleep(400); await park()
      await shotAround(page, `peek-expand${suffix}`, [expand], 48); rec.peekExpand = await page.evaluate(styleOf, '.peek-expand')
      await expand.hover(); await sleep(350); await shotAround(page, `peek-expand-hover${suffix}`, [expand], 48); await park()
      await keyFocus(expand); await shotAround(page, `peek-expand-focus${suffix}`, [expand], 48); await page.evaluate(() => document.activeElement?.blur())
      await expand.click(); await sleep(800)
      await page.evaluate(() => window.scrollBy(0, 500)); await sleep(500); await park()
      const collapse = page.locator('.peek-expand').first()
      await shotAround(page, `peek-collapse${suffix}`, [collapse], 48); rec.peekCollapse = await page.evaluate(styleOf, '.peek-expand')
    })
    await step('detail-error', async () => {
      await page.goto(rig.base + '/?view=detail&groupId=group-does-not-exist'); await settle(page, 2500); await park()
      await shotAround(page, `detail-error${suffix}`, [page.locator('.detail-view').first()], 12)
      rec.detailError = await page.evaluate(() => { const e = document.querySelector('.detail-view .detail-message'); return e ? { role: e.getAttribute('role'), text: e.innerText.trim() } : null })
    })

    // 3. 整卷页：草稿丸、相似题出错行
    await step('paper-browse', async () => {
      await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 3000); await park()
      await shotAround(page, `basket-paper${suffix}`, [page.locator('.basket-chip').first()], 12)
    })
    await step('similar-error', async () => {
      await page.route('**/api/similar-passages*', (route) => route.fulfill({ status: 503, json: { error: 'rig: unavailable' } }))
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-a'); await page.locator('.peek-actions').waitFor({ timeout: 30000 }); await settle(page, 1500)
      await page.getByRole('button', { name: '相似篇章', exact: true }).click(); await sleep(1200); await park()
      const err = page.locator('.similar-rail-error').first(); await err.waitFor({ timeout: 10000 })
      await shotAround(page, `similar-error${suffix}`, [err], 16)
      rec.similarError = await page.evaluate(() => { const e = document.querySelector('.similar-rail-error'); return { role: e.getAttribute('role') || e.querySelector('[role]')?.getAttribute('role') || null, text: e.innerText.trim().replace(/\s+/g, ' ') } })
      await page.unroute('**/api/similar-passages*')
    })

    // 4. 草稿卷：保存中 / 保存失败字色、顶栏卷名、撤销重排、撤销提示、A3 建议前置分页、换篇读屏名
    await step('draft', async () => {
      rec.draftItems = await addDraftItems(page)
      const items = rec.draftItems
      await page.route('**/pagination*', async (route) => {
        try { const res = await route.fetch({ timeout: 120000 }); const json = await res.json(); json.pageBreakSuggestions = [{ itemId: items[1].id, groupId: items[1].groupId, reason: '跨页断篇（第1/2页）' }]; await route.fulfill({ response: res, json }) } catch {}
      })
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: { order: [items[0].id, ...items.slice(2).map((i) => i.id), items[1].id], move: { kind: 'end', itemId: items[1].id }, brokenGroupId: items[1].groupId }, reused: false } }))
      await page.evaluate(async () => { const d = await (await fetch('/api/draft-papers/current')).json(); await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ printForm: 'a4' }) }) })
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-reorder-suggestion').waitFor({ timeout: 120000 }); await settle(page, 1500); await park()
      const status = page.locator('.draft-save-status').first()
      const title = page.locator('.topbar-page-title-editable').first()
      rec.titleHit = await page.evaluate(hitArea, '.topbar-page-title-editable')
      await shotAround(page, `topbar-title${suffix}`, [title, status], 12)
      await keyFocus(title); await shotAround(page, `topbar-title-focus${suffix}`, [title, status], 12); await page.evaluate(() => document.activeElement?.blur())
      rec.saveSaved = await page.evaluate(styleOf, '.draft-save-status')
      // 保存中：改标题，把这次保存拖 4 秒
      let mode = 'slow'
      await page.route(/\/api\/draft-papers\/[^/]+$/, async (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback()
        if (mode === 'fail') return route.fulfill({ status: 500, json: { error: 'rig: 保存失败' } })
        await sleep(4000); await route.fallback()
      })
      const rename = async (text) => {
        await title.click(); const input = page.getByRole('textbox', { name: '草稿卷标题' }); await input.waitFor({ timeout: 5000 })
        await input.fill(text); await input.press('Enter'); await sleep(600); await park()
      }
      await rename(`构件收尾取证卷${suffix || '-1440'}`)
      rec.saveSaving = await page.evaluate(styleOf, '.draft-save-status')
      await shotAround(page, `save-saving${suffix}`, [page.locator('.topbar-page-title-editable, .draft-save-status').first(), status], 12)
      await sleep(4500)
      mode = 'fail'; await rename(`构件收尾取证卷二${suffix || '-1440'}`)
      rec.saveError = await page.evaluate(styleOf, '.draft-save-status')
      await shotAround(page, `save-error${suffix}`, [page.locator('.topbar-page-title-editable').first(), status], 12)
      await page.unroute(/\/api\/draft-papers\/[^/]+$/)
    })
    await step('draft-reorder', async () => {
      // 撤销重排（窄屏没有重排建议条，只在宽屏拍）
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-reorder-suggestion').waitFor({ timeout: 120000 }).catch(() => {}); await settle(page, 1500)
      if (!(await page.locator('.draft-reorder-suggestion-act').isVisible())) { rec.reorderUndoHit = '这个宽度没有重排建议条'; return }
      await page.locator('.draft-reorder-suggestion-act').click(); await sleep(1500); await park()
      const undo = page.locator('.draft-reorder-suggestion-undo').first(); await undo.waitFor({ timeout: 15000 })
      rec.reorderUndoHit = await page.evaluate(hitArea, '.draft-reorder-suggestion-undo')
      await shotAround(page, `reorder-undo${suffix}`, [page.locator('.draft-reorder-suggestion').first()], 12)
    })
    await step('draft-swap-name', async () => {
      // 换篇的读屏名：axe 的「名字含看得见的字」
      await page.addScriptTag({ content: axeSource })
      rec.swapAxe = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] }, resultTypes: ['violations', 'passes'] })
        const pick = (list) => list.flatMap((v) => v.nodes.map((n) => n.target.join(' '))).filter((t) => /draft-group-actions|swap/.test(t))
        return { violations: pick(r.violations), passes: pick(r.passes).length,
          names: [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '换篇').slice(0, 2).map((b) => b.getAttribute('aria-label')) }
      })
    })
    await step('draft-a3', async () => {
      // A3 的「建议前置分页」挂在两面之间的缝上，卷面重排时会卸了再挂：等它稳住（连续两次查到同一个位置）再拍。
      await page.getByRole('radio', { name: 'A3 对折' }).click()
      await page.locator('.draft-seam-suggestion').first().waitFor({ state: 'attached', timeout: 120000 })
      let last = null
      for (let i = 0; i < 30; i++) {
        await sleep(1000)
        const box = await page.evaluate(() => { const e = document.querySelector('.draft-seam-suggestion'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` })
        if (box && box === last) break
        last = box
      }
      await park()
      const seam = page.locator('.draft-seam-suggestion:visible').first()
      rec.seam = await page.evaluate(styleOf, '.draft-seam-suggestion')
      await shotAround(page, `a3-seam${suffix}`, [seam], 24)
      await seam.hover({ timeout: 5000 }); await sleep(350); await shotAround(page, `a3-seam-hover${suffix}`, [seam], 24); await park()
    })
    await step('draft-remove-toast', async () => {
      await page.getByRole('radio', { name: 'A4' }).click().catch(() => {})
      await sleep(1500)
      const trigger = page.locator('[aria-label="更多题组操作"]').first(); await trigger.waitFor({ timeout: 150000 })
      await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400)
      await page.getByRole('menuitem', { name: /移除/ }).first().focus(); await page.keyboard.press('Enter')
      const toast = page.locator('.eqb-toast, .draft-undo-toast').first(); await toast.waitFor({ timeout: 15000 }); await sleep(700)
      rec.toast = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.eqb-toast, .draft-undo-toast')].find((e) => e.getClientRects().length)
        const live = t?.closest('[aria-live]') || t?.querySelector('[aria-live]')
        const undo = t ? [...t.querySelectorAll('button')].find((b) => /撤销/.test(b.innerText)) : null
        return { text: t?.innerText.trim().replace(/\s+/g, ' '), role: t?.getAttribute('role') || live?.getAttribute('role') || null, live: live?.getAttribute('aria-live') || t?.getAttribute('aria-live') || null, undo: Boolean(undo) }
      })
      rec.toastFocusAfterRemove = await page.evaluate(describeFocus)
      // 用键盘找到「撤销」：最多按 40 下 Tab
      let reached = null
      for (let i = 1; i <= 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => /撤销/.test(document.activeElement?.innerText || ''))) { reached = i; break } }
      rec.toastUndoTabs = reached
      if (reached) { await page.keyboard.press('Enter'); await sleep(1500); rec.toastFocusAfterUndo = await page.evaluate(describeFocus) }
    })

    // 5. 个人空间：删除确认框、删后焦点、出错和读取中
    let spaceArtifacts = [...ALL_ARTIFACTS]
    let spaceMode = 'list'
    await page.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      if (spaceMode === 'error') return route.fulfill({ status: 500, json: { error: 'rig: 个人空间暂时不可用' } })
      return route.fulfill({ status: 200, json: { folders: [], artifacts: spaceArtifacts } })
    })
    await page.route(/\/api\/my-space\/artifacts\/[^/]+$/, (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      const id = decodeURIComponent(route.request().url().split('/').pop())
      spaceArtifacts = spaceArtifacts.filter((a) => a.id !== id)
      return route.fulfill({ status: 200, json: { ok: true } })
    })
    const spaceDelete = async (rowIndex, label) => {
      const trigger = page.locator('.my-space-file-row').nth(rowIndex).locator('[aria-haspopup="menu"]')
      await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400)
      await page.getByRole('menuitem', { name: '删除文件' }).focus(); await page.keyboard.press('Enter'); await sleep(700)
      const info = { dialog: await page.evaluate(describeDialog), focusOnOpen: await page.evaluate(describeFocus) }
      if (label) await shotAround(page, `space-confirm${suffix}`, DIALOG_BOX(page), 16)
      if (label) {
        await page.keyboard.press('Escape'); await sleep(500); info.focusAfterEsc = await page.evaluate(describeFocus)
        await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400)
        await page.getByRole('menuitem', { name: '删除文件' }).focus(); await page.keyboard.press('Enter'); await sleep(700)
      }
      // 「删除 PDF」：Tab 到它再按 Enter（实测键盘路径）
      let tabs = 0
      while (tabs < 6 && !(await page.evaluate(() => /删除 PDF/.test(document.activeElement?.innerText || '')))) { await page.keyboard.press('Tab'); tabs++ }
      info.tabsToConfirm = tabs
      await page.keyboard.press('Enter'); await sleep(1500)
      info.focusAfterDelete = await page.evaluate(describeFocus)
      info.message = await page.evaluate(() => { const m = document.querySelector('.my-space-message'); return m ? { text: m.innerText.trim(), role: m.getAttribute('role') } : null })
      return info
    }
    await step('my-space', async () => {
      spaceArtifacts = [...ALL_ARTIFACTS]; spaceMode = 'list'
      await page.goto(rig.base + '/?view=my-space'); await settle(page, 1500); await park()
      rec.spaceDeleteMiddle = await spaceDelete(1, 'confirm')
      await park(); await page.screenshot({ path: path.join(OUT, 'states', `space-after-delete${suffix}.png`) })
      rec.spaceDeleteLast = await spaceDelete(1)
      rec.spaceDeleteOnly = await spaceDelete(0)
    })
    await step('my-space-error', async () => {
      spaceMode = 'error'
      await page.goto(rig.base + '/?view=my-space'); await settle(page, 1500); await park()
      await shotAround(page, `space-error${suffix}`, [page.locator('.my-space-empty-state, .my-space-error').first()], 16)
      spaceMode = 'list'
    })

    // 6. 词汇听写：拆份确认、打印确认、练字选词框点遮罩
    await step('dictation', async () => {
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500)
      const setsTab = page.getByRole('tab', { name: /词组/ }).first()
      if (await setsTab.count()) { await setsTab.click(); await sleep(800) }
      const rows = page.locator('.dictation-set-row'); await rows.first().waitFor({ timeout: 15000 })
      await rows.nth(0).click(); await rows.nth(1).click(); await rows.nth(2).click(); await sleep(600); await park()
      const create = page.getByRole('button', { name: '生成扫码听写' })
      await keyFocus(create); await page.keyboard.press('Enter'); await sleep(800)
      rec.dictSplit = { dialog: await page.evaluate(describeDialog), focusOnOpen: await page.evaluate(describeFocus) }
      if (rec.dictSplit.dialog) {
        await shotAround(page, `dict-split${suffix}`, DIALOG_BOX(page), 16)
        await page.keyboard.press('Escape'); await sleep(500)
      }
      rec.dictSplit.focusAfterCancel = await page.evaluate(describeFocus)
      const summary = page.locator('.dictation-selection-actions details > summary').first()
      await summary.click(); await sleep(400)
      await page.locator('.dictation-download-option > button').filter({ hasText: '单词卡' }).first().click(); await sleep(800)
      rec.dictPrint = { dialog: await page.evaluate(describeDialog), focusOnOpen: await page.evaluate(describeFocus) }
      if (rec.dictPrint.dialog) {
        await shotAround(page, `dict-print${suffix}`, DIALOG_BOX(page), 16)
        await page.keyboard.press('Escape'); await sleep(500)
      }
      rec.dictPrint.focusAfterCancel = await page.evaluate(describeFocus)
      await summary.click(); await sleep(400)
      await page.locator('.dictation-download-option > button').filter({ hasText: '衡水体练字纸' }).first().click(); await sleep(900)
      rec.handwriting = { open: await page.evaluate(describeDialog) }
      await page.mouse.click(4, 4); await sleep(700)
      rec.handwriting.afterBackdropClick = await page.evaluate(describeDialog)
      await page.screenshot({ path: path.join(OUT, 'states', `handwriting-after-backdrop${suffix}.png`) })
      await page.keyboard.press('Escape'); await sleep(500)
    })

    // 6b. 学生扫码听写页「重播本题」
    await step('public-replay', async () => {
      if (!keys.vocabSets.shareId) throw new Error('没建成分享听写：' + keys.vocabSets.taskError)
      const pub = await context.browser().newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
      const p = await pub.newPage()
      await p.goto(`${rig.base}/vocabulary/dictation/${keys.vocabSets.shareId}`); await settle(p, 2500); await p.mouse.move(1, height - 1); await sleep(300)
      const replay = p.locator('.vocabulary-dictation-replay').first(); await replay.waitFor({ timeout: 15000 })
      rec.replay = await p.evaluate(styleOf, '.vocabulary-dictation-replay')
      const b = await replay.boundingBox()
      await p.screenshot({ path: path.join(OUT, 'states', `public-replay${suffix}.png`), clip: { x: Math.max(0, b.x - 24), y: Math.max(0, b.y - 24), width: Math.min(width - Math.max(0, b.x - 24), b.width + 48), height: b.height + 48 } })
      await replay.hover(); await sleep(350)
      await p.screenshot({ path: path.join(OUT, 'states', `public-replay-hover${suffix}.png`), clip: { x: Math.max(0, b.x - 24), y: Math.max(0, b.y - 24), width: Math.min(width - Math.max(0, b.x - 24), b.width + 48), height: b.height + 48 } })
      await pub.close()
    })

    // 7. 详情页删题组（不可逆；只在宽屏最后真删一次，窄屏只看框）
    await step('detail-delete', async () => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-d'); await page.locator('.peek-actions').waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
      const trigger = page.getByRole('button', { name: '更多操作' }).first()
      const open = async () => { await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400); await page.getByRole('menuitem', { name: '删除' }).focus(); await page.keyboard.press('Enter'); await sleep(800) }
      nativeAnswer = 'dismiss'; await open()
      rec.groupDelete = { dialog: await page.evaluate(describeDialog), focusOnOpen: await page.evaluate(describeFocus) }
      if (rec.groupDelete.dialog) {
        await shotAround(page, `group-delete${suffix}`, DIALOG_BOX(page), 16)
        await page.keyboard.press('Escape'); await sleep(500)
      }
      rec.groupDelete.focusAfterCancel = await page.evaluate(describeFocus)
      if (!wide) return
      nativeAnswer = 'accept'; await open()
      if (rec.groupDelete.dialog) {
        let tabs = 0
        while (tabs < 6 && !(await page.evaluate(() => /删除题组/.test(document.activeElement?.innerText || '')))) { await page.keyboard.press('Tab'); tabs++ }
        rec.groupDelete.tabsToConfirm = tabs
        await page.keyboard.press('Enter')
      }
      await sleep(2500)
      rec.groupDelete.focusAfterDelete = await page.evaluate(describeFocus)
      rec.groupDelete.urlAfterDelete = page.url().replace(rig.base, '')
      await park(); await page.screenshot({ path: path.join(OUT, 'states', 'group-after-delete.png') })
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
