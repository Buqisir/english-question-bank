#!/usr/bin/env node
// 构件收尾的后续四件事（2026-11-15）换前换后取证：拍图、量点击区域、走键盘、记读屏名。
// 换前在 HEAD 的 git worktree 里跑（把这个文件拷进去），换后在当前工作区跑，两边步骤一样，
// 再用 followup-compare.mjs 拼对照图。写法照 finish-shots.mjs。
//
// 用法：INVENTORY_PORT_OFFSET=70 node scripts/component-inventory/followup-shots.mjs <输出目录>
//       只补几步：FOLLOWUP_ONLY=home,draft-a4（逗号分隔的步骤名）
// 输出：<输出目录>/pages/*.png（视口整页，核对布局没动）、<输出目录>/states/*.png（改了的地方，2 倍图）、
//       <输出目录>/keys.json（焦点、读屏角色和名字、点击区域、实算样式、缺了哪步）。
// 测试数据：rig.mjs 默认那四篇阅读；词汇页要的词表、词组、一份分享听写在这里种（和 finish-shots.mjs 同一种假词条）。
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

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：followup-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
for (const d of ['pages', 'states']) mkdirSync(path.join(OUT, d), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const keys = { missing: [], pageErrors: [] }
const ONLY = process.env.FOLLOWUP_ONLY ? new Set(process.env.FOLLOWUP_ONLY.split(',')) : null

// ── 词汇页的假数据（同 finish-shots.mjs）──────────────────
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

// ── 页面里量东西 ─────────────────────────────────────────
// 焦点在哪：标签、类名、名字；在草稿卷题组工具条里时带上是哪一组（data-draft-tools-group-id）。
function describeFocus() {
  const e = document.activeElement
  if (!e || e === document.body) return 'body（焦点落空）'
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const cls = typeof e.className === 'string' ? e.className.split(' ').filter((c) => c && !c.startsWith('eqb-button')).slice(0, 2).join('.') : ''
  const group = e.closest?.('[data-draft-tools-group-id]')?.getAttribute('data-draft-tools-group-id')
  return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}「${name}」${group ? ` @${group}` : ''}`
}
// 实际能点到的范围：从中心往四个方向一点点走，elementFromPoint 还落在这个元素（或它里面）就算。
function hitArea(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const r = el.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const hits = (x, y) => { const t = document.elementFromPoint(x, y); return Boolean(t && (t === el || el.contains(t))) }
  const reach = (dx, dy) => { let d = 0; while (d < 40 && hits(cx + dx * (d + 0.25), cy + dy * (d + 0.25))) d += 0.25; return d }
  const round = (n) => Math.round(n * 100) / 100
  const who = (x, y) => { const t = document.elementFromPoint(x, y); return t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : null }
  const up = reach(0, -1), down = reach(0, 1)
  return { visible: `${round(r.width)}×${round(r.height)}`, hit: `${round(reach(-1, 0) + reach(1, 0))}×${round(up + down)}`, up: round(up), down: round(down), blockedBy: [who(cx, cy - up - 0.25), who(cx, cy + down + 0.25)] }
}
function rectOf(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x * 100) / 100, top: Math.round(r.top * 100) / 100, bottom: Math.round(r.bottom * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }
}
function styleOf(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const cs = getComputedStyle(el), r = el.getBoundingClientRect()
  const label = el.querySelector('.eqb-button-label') || el
  return { tag: el.tagName.toLowerCase(), text: el.innerText.trim().slice(0, 40), color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius, font: `${cs.fontSize}/${cs.fontWeight}`, underline: getComputedStyle(label).textDecorationLine, padding: cs.padding, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, name: el.getAttribute('aria-label') || el.innerText.trim(), title: el.getAttribute('title') }
}
// 提示行：角色、live、字、同一行里有没有键（含「关闭提示」）。
function noticeOf(selector) {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!el) return null
  const roleEl = el.matches('[role]') ? el : el.querySelector('[role]') || el.closest('[role],[aria-live]')
  const buttons = [...el.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim())
  const cs = getComputedStyle(el.querySelector('.eqb-notice') || el)
  return { tag: el.tagName.toLowerCase(), cls: String(el.className), role: roleEl?.getAttribute('role') || null, live: roleEl?.getAttribute('aria-live') || null, text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), buttons, color: cs.color, bg: cs.backgroundColor }
}

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

// 草稿卷：等卷面排好（没有「正在重排」遮罩、工具条都挂上了、连续两次位置一样）。
async function waitDraftSettled(page, timeout = 150000, allowEmpty = false) {
  const until = Date.now() + timeout
  let last = null
  while (Date.now() < until) {
    await sleep(700)
    const now = await page.evaluate((allowEmpty) => {
      if (document.querySelector('.draft-a4-wait.is-waiting')) return null
      const tools = [...document.querySelectorAll('[data-draft-tools-group-id]')].map((e) => `${e.getAttribute('data-draft-tools-group-id')}:${Math.round(e.getBoundingClientRect().top)}`)
      return tools.join('|') || (allowEmpty ? 'none' : null)
    }, allowEmpty)
    if (now && now === last) return now
    last = now
  }
  return null
}
// 焦点随时间怎么变：每 150ms 记一次，记到卷面排好、焦点 2 秒不动为止。
async function focusTimeline(page, timeout = 150000) {
  const start = Date.now(), seen = []
  let lastChange = Date.now()
  while (Date.now() - start < timeout) {
    const f = await page.evaluate(describeFocus)
    if (!seen.length || seen[seen.length - 1].focus !== f) { seen.push({ ms: Date.now() - start, focus: f }); lastChange = Date.now() }
    const waiting = await page.evaluate(() => Boolean(document.querySelector('.draft-a4-wait.is-waiting')))
    if (!waiting && Date.now() - lastChange > 2500 && Date.now() - start > 3000) break
    await sleep(150)
  }
  return seen
}

const rig = await startRig({ quiet: !process.env.FOLLOWUP_VERBOSE })
await seedVocabularyProgram()
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const WIDTHS = [[390, 844, '-390'], [1440, 900, '']]
try {
  // ── 先种好：两个词组、一份带分享的听写 ───────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    await login(page, rig.base)
    keys.vocab = await page.evaluate(async (entryIds) => {
      const students = (await (await fetch('/api/vocabulary/students')).json()).students
      const made = []
      for (const [title, ids] of [['第一组', entryIds.slice(0, 20)], ['第二组', entryIds.slice(20, 40)]]) {
        const r = await fetch('/api/vocabulary/sets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: students[0].id, programId: 'wanwei-round-one-v1', entryIds: ids, title }) })
        const body = r.ok ? await r.json() : null
        made.push({ title, status: r.status, id: body?.set?.id || body?.vocabularySet?.id || body?.id || null })
      }
      const lib = (await (await fetch(`/api/vocabulary/set-library?studentId=${encodeURIComponent(students[0].id)}&programId=wanwei-round-one-v1&page=1`)).json()).library
      const first = lib?.items?.find((s) => s.title === '第一组')
      return { student: students[0]?.displayName, studentId: students[0]?.id, made, firstSetId: first?.id || made[0].id }
    }, VOCAB_ENTRIES.map((e) => e.id))
    await context.close()
  }

  for (const [width, height, suffix] of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}${suffix}: ${String(e).slice(0, 160)}`))
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(250) }
    const keyFocus = async (l) => { await page.keyboard.press('Shift'); await l.focus(); await sleep(250) }
    const rec = {}
    keys[`w${width}`] = rec
    const step = async (name, fn) => { if (ONLY && !ONLY.has(name)) return; keys.at = name; try { await fn() } catch (e) { keys.missing.push(`${name}${suffix}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    await login(page, rig.base)

    // 四、首页思考模式开关：点击区域、上下邻居的位置（布局不许动）、视口整页
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500); await park()
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator('.concierge-command-filter-toggle').waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
      await page.evaluate(() => document.activeElement?.blur())
      rec.thinkingLabelHit = await page.evaluate(hitArea, '.concierge-thinking-toggle')
      rec.thinkingInputHit = await page.evaluate(hitArea, '.concierge-thinking-toggle input[type="checkbox"]')
      rec.thinkingRects = {
        search: await page.evaluate(rectOf, '.concierge-intent-bar'),
        label: await page.evaluate(rectOf, '.concierge-thinking-toggle'),
        input: await page.evaluate(rectOf, '.concierge-thinking-toggle input[type="checkbox"]'),
        filter: await page.evaluate(rectOf, '.concierge-command-filter-toggle'),
      }
      await shotAround(page, `thinking-toggle${suffix}`, [page.locator('.concierge-thinking-toggle').first()], 24)
      await keyFocus(page.locator('.concierge-thinking-toggle input').first())
      await shotAround(page, `thinking-toggle-focus${suffix}`, [page.locator('.concierge-thinking-toggle').first()], 24)
      // 点在开关上方 2.5px、下方 2.5px（看得见的轨道外面）试一下切不切
      rec.thinkingEdgeClicks = await page.evaluate(async () => {
        const input = document.querySelector('.concierge-thinking-toggle input[type="checkbox"]')
        const r = input.getBoundingClientRect(), cx = r.x + r.width / 2
        const out = {}
        for (const [k, y] of [['above', r.top - 2.5], ['below', r.bottom + 2.5]]) {
          const t = document.elementFromPoint(cx, y)
          out[k] = { at: Math.round(y * 100) / 100, element: t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : null, toggles: Boolean(t && t.closest('.concierge-thinking-toggle')) }
        }
        return out
      })
      await page.evaluate(() => document.activeElement?.blur()); await park()
      await page.screenshot({ path: path.join(OUT, 'pages', `home-results${suffix}.png`) })
    })

    // 一、草稿卷建议键：A4 题组上方、A3 接缝上
    let items = null
    const suggestRoute = async () => {
      items = await addDraftItems(page)
      rec.draftItems = items
      await page.unroute('**/pagination*').catch(() => {})
      // 排序建议不在这次范围里，接口拦下给「没有建议」：真算要把几种排法各排一遍，测试机上接口会把内存吃满退出（换前第一次整跑实测）。
      await page.unroute('**/reorder-suggestion*').catch(() => {})
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await page.route('**/pagination*', async (route) => {
        try {
          const res = await route.fetch({ timeout: 120000 }); const json = await res.json()
          const live = items.find((i) => i.groupId === items[1].groupId)
          if (live) json.pageBreakSuggestions = [{ itemId: live.id, groupId: live.groupId, reason: '跨页断篇（第1/2页）' }]
          await route.fulfill({ response: res, json })
        } catch {}
      })
    }
    const setPrintForm = (form) => page.evaluate(async (f) => { const d = await (await fetch('/api/draft-papers/current')).json(); await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ printForm: f }) }) }, form)
    const suggestionShots = async (selector, name) => {
      const el = page.locator(`${selector}:visible`).first()
      await el.waitFor({ timeout: 120000 })
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), selector); await sleep(600); await park()
      rec[name] = await page.evaluate(styleOf, selector)
      await shotAround(page, `${name}${suffix}`, [el], 24)
      await el.hover(); await sleep(350)
      rec[`${name}Hover`] = await page.evaluate(styleOf, selector)
      await shotAround(page, `${name}-hover${suffix}`, [el], 24); await park()
      await keyFocus(el)
      rec[`${name}Focus`] = { focus: await page.evaluate(describeFocus), focusVisible: await page.evaluate((s) => document.querySelector(s)?.matches(':focus-visible'), selector) }
      await shotAround(page, `${name}-focus${suffix}`, [el], 24)
      await page.evaluate(() => document.activeElement?.blur())
    }
    await step('draft-a4', async () => {
      await suggestRoute(); await setPrintForm('a4')
      await page.goto(rig.base + '/?view=draft-paper'); await waitDraftSettled(page)
      await suggestionShots('.draft-group-suggestion', 'a4-suggest')
      // 和工具条一起看位置
      const tools = page.locator('.draft-group-actions:has(.draft-group-suggestion)').first()
      await shotAround(page, `a4-suggest-context${suffix}`, [tools, page.locator('.draft-group-suggestion').first()], 32)
    })
    await step('draft-a3', async () => {
      await suggestRoute(); await setPrintForm('a3')
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-seam-suggestion').first().waitFor({ state: 'attached', timeout: 150000 })
      await waitDraftSettled(page)
      await suggestionShots('.draft-seam-suggestion', 'a3-suggest')
      await setPrintForm('a4')
    })

    // 二、草稿卷从菜单移出题组：焦点去哪；撤销以后焦点去哪
    await step('draft-remove', async () => {
      await suggestRoute(); await setPrintForm('a4')
      await page.goto(rig.base + '/?view=draft-paper'); await waitDraftSettled(page)
      const removeVia = async (groupId) => {
        const trigger = page.locator(`[data-draft-tools-group-id="${groupId}"] [aria-label="更多题组操作"]`).first()
        await trigger.scrollIntoViewIfNeeded(); await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400)
        await page.getByRole('menuitem', { name: /移除/ }).first().focus(); await page.keyboard.press('Enter')
        // 鼠标停到底部提示上让它别自己消失（Toast 鼠标停着时计时停住），焦点不动；卷面排好以后还要 Tab 到「撤销」。
        await page.locator('.draft-undo-toast').first().hover({ timeout: 15000 }).catch(() => {})
        return focusTimeline(page)
      }
      const groups = await page.evaluate(() => [...document.querySelectorAll('[data-draft-tools-group-id]')].map((e) => e.getAttribute('data-draft-tools-group-id')))
      rec.removeGroups = groups
      // (1) 移出中间那一组
      rec.removeMiddle = await removeVia(groups[1])
      rec.removeMiddleToast = await page.evaluate(() => { const t = [...document.querySelectorAll('.draft-undo-toast')].find((e) => e.getClientRects().length); return t ? t.innerText.trim().replace(/\s+/g, ' ') : null })
      await park(); await page.screenshot({ path: path.join(OUT, 'states', `remove-middle-after${suffix}.png`) })
      // (2) Tab 到「撤销」，Enter
      let reached = null
      for (let i = 1; i <= 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => /撤销/.test(document.activeElement?.innerText || '') && Boolean(document.activeElement?.closest('.draft-undo-toast')))) { reached = i; break } }
      rec.undoTabs = reached
      if (reached) { await page.keyboard.press('Enter'); rec.undoMiddle = await focusTimeline(page) }
      await waitDraftSettled(page)
      // 卷面重排完以后焦点最终落在哪（focusTimeline 在重排完之前就停了；协调人复核 2026-11-15 补）
      await sleep(1500); rec.undoMiddleSettled = await page.evaluate(describeFocus)
      // (3) 移出最后一组 → 上一组
      const now = await page.evaluate(() => [...document.querySelectorAll('[data-draft-tools-group-id]')].map((e) => e.getAttribute('data-draft-tools-group-id')))
      rec.removeLastGroups = now
      rec.removeLast = await removeVia(now[now.length - 1])
      await waitDraftSettled(page)
      // (4) 剩下的一组一组移完 → 列表空
      for (let guard = 0; guard < 4; guard++) {
        const left = await page.evaluate(() => [...document.querySelectorAll('[data-draft-tools-group-id]')].map((e) => e.getAttribute('data-draft-tools-group-id')))
        if (!left.length) break
        rec[`removeRest${guard}`] = await removeVia(left[0])
        await waitDraftSettled(page, 150000, left.length === 1)
      }
      rec.removeAllFinal = await page.evaluate(describeFocus)
      await park(); await page.screenshot({ path: path.join(OUT, 'states', `remove-all-after${suffix}.png`) })
      // 放回去，下一个宽度还要用
      await page.evaluate(async () => {
        const d = await (await fetch('/api/draft-papers/current')).json()
        for (const it of d.draftPaper.items) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
      })
    })

    // 三、生词各页的提示行
    const sid = () => keys.vocab.studentId
    await step('dictation-error', async () => {
      await page.route('**/api/vocabulary/set-library*', (route) => route.fulfill({ status: 500, json: { error: 'rig: 词组暂时取不到' } }))
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500); await park()
      const sel = '.dictation-notice, .dictation-notice-row'
      rec.dictationError = await page.evaluate(noticeOf, sel)
      await shotAround(page, `dictation-error${suffix}`, [page.locator(sel).first()], 24)
      await page.unroute('**/api/vocabulary/set-library*')
    })
    await step('dictation-success', async () => {
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500)
      // 「听写」页签里给第一份听写生成二维码 → 顶上出「已生成…的公开二维码。」
      const made = await page.evaluate(async (studentId) => {
        const lib = (await (await fetch(`/api/vocabulary/set-library?studentId=${encodeURIComponent(studentId)}&programId=wanwei-round-one-v1&page=1`)).json()).library
        const first = lib?.items?.[0]
        const t = await fetch('/api/vocabulary/dictation-tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId, sourceSetIds: [first?.id], title: '取证听写', accent: 'british', share: false, programId: 'wanwei-round-one-v1' }) })
        return t.status
      }, sid())
      rec.dictationTaskMade = made
      await page.reload(); await settle(page, 2500)
      // 分区是 nav 里的普通按钮（不是 role=tab）
      await page.locator('.dictation-workbench-tabs button', { hasText: /^\s*听写\s*$/ }).first().click(); await sleep(1500)
      const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('.dictation-download-action')].find((e) => /生成二维码|撤销二维码/.test(e.textContent || '')); if (!b) return false; b.click(); return true })
      if (!clicked) throw new Error('没找到「生成二维码」')
      await sleep(1500); await park()
      const sel = '.dictation-notice, .dictation-notice-row'
      rec.dictationSuccess = await page.evaluate(noticeOf, sel)
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await sleep(300)
      await shotAround(page, `dictation-success${suffix}`, [page.locator(sel).first()], 24)
    })
    await step('meaning-error', async () => {
      await page.route('**/api/vocabulary/meaning-review-suggestion*', (route) => route.fulfill({ status: 500, json: { error: 'rig: 复习建议暂时算不出来' } }))
      await page.goto(rig.base + '/?view=vocabulary-dictation-workbench'); await settle(page, 2500)
      await page.locator('.dictation-workbench-tabs button', { hasText: /^\s*认词\s*$/ }).first().click(); await sleep(1500)
      await page.locator('.meaning-recall-suggestion button', { hasText: '选出单词' }).first().click({ timeout: 8000 }); await sleep(1500); await park()
      rec.meaningError = await page.evaluate(noticeOf, '.meaning-recall-error')
      await shotAround(page, `meaning-error${suffix}`, [page.locator('.meaning-recall-heading').first(), page.locator('.meaning-recall-error').first(), page.locator('.meaning-recall-start-row').first()], 16)
      await page.unroute('**/api/vocabulary/meaning-review-suggestion*')
    })
    await step('practice-audio', async () => {
      await page.route('**/vocabulary-assets/**/*.mp3', (route) => route.fulfill({ status: 404, body: '' }))
      await page.goto(`${rig.base}/?view=vocabulary-practice&setId=${encodeURIComponent(keys.vocab.firstSetId)}&mode=match`); await settle(page, 2500)
      const cards = page.locator('.vocabulary-match-card')
      for (let i = 0; i < 8; i++) {
        if (await page.locator('.vocabulary-practice-audio-error').count()) break
        await cards.nth(i).click().catch(() => {}); await sleep(900)
      }
      await park()
      rec.practiceAudio = await page.evaluate(noticeOf, '.vocabulary-practice-audio-error')
      await page.evaluate(() => document.querySelector('.vocabulary-practice-audio-error')?.scrollIntoView({ block: 'center' })); await sleep(300)
      await shotAround(page, `practice-audio${suffix}`, [page.locator('.vocabulary-practice-live').first(), page.locator('.vocabulary-practice-audio-error').first()], 24)
      await page.unroute('**/vocabulary-assets/**/*.mp3')
    })
    await step('notebook', async () => {
      await page.route('**/api/vocabulary-notebook/papers', (route) => route.fulfill({ status: 500, json: { error: 'rig: 生词本暂时打不开' } }))
      await page.goto(rig.base + '/?view=vocabulary-notebook'); await settle(page, 2000); await park()
      const listSel = '.notebook-main .notebook-empty, .notebook-main .notebook-error'
      rec.notebookListError = await page.evaluate(noticeOf, listSel)
      await shotAround(page, `notebook-list-error${suffix}`, [page.locator(listSel).first()], 24)
      await page.unroute('**/api/vocabulary-notebook/papers')
      // 打开一张纸：先拖 6 秒（拍等待），再给 500（拍出错）
      await page.route('**/api/vocabulary-notebook/papers/*', async (route) => { await sleep(6000); await route.fulfill({ status: 500, json: { error: 'rig: 这张纸暂时打不开' } }).catch(() => {}) })
      await page.goto(rig.base + '/?view=vocabulary-notebook&paperId=paper-2026-i'); await sleep(2500); await park()
      rec.notebookLoading = await page.evaluate(noticeOf, '.notebook-status')
      await shotAround(page, `notebook-loading${suffix}`, [page.locator('.notebook-status').first()], 24)
      await sleep(5000); await park()
      rec.notebookDetail = await page.evaluate(() => [...document.querySelectorAll('.notebook-status')].map((e) => ({ role: e.getAttribute('role'), text: e.innerText.trim() })))
      await shotAround(page, `notebook-detail-error${suffix}`, [page.locator('.notebook-desk').first()], 0)
      await page.unroute('**/api/vocabulary-notebook/papers/*')
    })
    await step('review', async () => {
      // 读取中：词库接口拖 6 秒
      await page.route('**/api/vocabulary/programs*', async (route) => { await sleep(6000); await route.fallback().catch(() => {}) })
      await page.goto(rig.base + '/?view=vocabulary-review'); await sleep(2500); await park()
      rec.reviewLoading = await page.evaluate(noticeOf, '.vocabulary-run-setup')
      await shotAround(page, `review-loading${suffix}`, [page.locator('.vocabulary-run-setup').first()], 0)
      await page.unroute('**/api/vocabulary/programs*'); await sleep(5000)
      // 读取失败：学生档案接口 500。（词库接口 500 时整页是「词库没有加载出来」，下面那行服务器原话会被
      // 随后学生档案读好、换学生时的 setRequestError('') 清掉，拍不到提示行——这是换前就有的，记在 README。）
      await page.route('**/api/vocabulary/students*', (route) => route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { error: 'rig: 学生档案暂时取不到' } }) : route.fallback())
      await page.goto(rig.base + '/?view=vocabulary-review'); await settle(page, 2500); await park()
      rec.reviewError = await page.evaluate(noticeOf, '.vocabulary-request-error')
      await shotAround(page, `review-error${suffix}`, [page.locator('.vocabulary-run-setup').first()], 0)
      await page.unroute('**/api/vocabulary/students*')
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
