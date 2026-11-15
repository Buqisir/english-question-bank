#!/usr/bin/env node
// 切换组换 SegmentedField（2026-11-15）换前换后取证：只拍换到的那几个控件本身（元素四周留 16px），
// 每处拍静止、键盘焦点两种，1440 和 390 两档；顺手用 Chrome 无障碍树记读屏信息（角色、名字、checked / pressed），
// 真按 Tab 数这一组占几个 Tab 位，按 → 看焦点和选中怎么走。另外两处：「直接推荐一轮」的词数框、「学生姓名」出错的播报。
// 换前在 HEAD 的临时 worktree 里跑（把这个文件拷进去），换后在当前工作区跑，两边步骤一样；各只跑一次，拍不到的记进 missing。
// 写法照 fields2-shots.mjs。
//
// 用法：INVENTORY_PORT_OFFSET=75 node scripts/component-inventory/segment-shots.mjs <输出目录>
// 只补几步：SEGMENT_ONLY=dict-settings,listen（逗号分隔的步骤名，见下面每个 step 的第一个参数）
// 输出：<输出目录>/states/*.png、<输出目录>/keys.json（读屏、Tab、方向键、缺了哪步）。
// 选择器两边都写：换前是 fieldset / label，换后是字段的类名；用并集找，两边能对上。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { startRig } from './rig.mjs'
import { RAW } from './lib.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = appRequire('playwright')

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：segment-shots.mjs <输出目录>'); process.exit(2) }
if (!process.env.SEGMENT_ONLY) rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const ONLY = process.env.SEGMENT_ONLY ? process.env.SEGMENT_ONLY.split(',') : null
const keys = { missing: [], pageErrors: [] }

// ── 词汇页的假数据（同 fields2-shots.mjs）──────────────────
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
    id: 'wanwei-round-one-v1', version: 'finish-v1', title: '万唯1600词', subtitle: '切换组取证', sourceTitle: '测试词表', sourceEdition: 'v1', totalPlannedEntries: 1600,
    groups: [{ id: 'finish-group-1', stage: 'core', week: 1, group: 1, sourceLabel: 'Day 1', startOrder: 1, endOrder: 130 }],
    entries: VOCAB_ENTRIES,
  })
  db.close()
}

// ── 页面里量东西 ─────────────────────────────────────────
function describeFocus() {
  const e = document.activeElement
  if (!e || e === document.body) return 'body（焦点落空）'
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 30)
  const state = e.getAttribute('aria-checked') != null ? ` checked=${e.getAttribute('aria-checked')}` : e.getAttribute('aria-pressed') != null ? ` pressed=${e.getAttribute('aria-pressed')}` : ''
  return `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : ''}「${name}」${state}`
}
function styleOf(el) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect()
  return { h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10, radius: cs.borderRadius, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} +${cs.outlineOffset}`, shadow: cs.boxShadow }
}

// 读屏信息：Chrome 无障碍树里这个元素和它下面一层的角色、名字、描述、checked / pressed。
async function axTree(page, locator) {
  try {
    await locator.evaluate((e) => e.setAttribute('data-segment-ax', ''))
    const cdp = await page.context().newCDPSession(page)
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-segment-ax]' })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const { node } = await cdp.send('DOM.describeNode', { nodeId })
    const full = await cdp.send('Accessibility.getFullAXTree', {})
    await locator.evaluate((e) => e.removeAttribute('data-segment-ax'))
    await cdp.detach()
    const pick = (n) => {
      const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value
      return { role: n.role?.value, name: n.name?.value ?? '', description: n.description?.value || null, checked: prop('checked') ?? null, pressed: prop('pressed') ?? null, invalid: prop('invalid') ?? null, live: prop('live') ?? null, focusable: prop('focusable') ?? null }
    }
    const self = nodes[0]
    // 下面几层里有意思的节点（按钮、单选、输入框、提示），跳过没有角色的通用节点。
    const byId = new Map(full.nodes.map((n) => [n.nodeId, n]))
    const start = full.nodes.find((n) => n.backendDOMNodeId === node.backendNodeId)
    const kids = []
    const walk = (n, depth) => {
      for (const id of n?.childIds || []) {
        const c = byId.get(id)
        if (!c) continue
        if (!c.ignored && ['button', 'radio', 'radiogroup', 'group', 'spinbutton', 'textbox', 'alert', 'status', 'LabelText', 'paragraph'].includes(c.role?.value)) kids.push(pick(c))
        if (depth < 6) walk(c, depth + 1)
      }
    }
    walk(start, 0)
    return { self: pick(self), children: kids }
  } catch (e) { return { error: String(e).slice(0, 160) } }
}

async function shotAround(page, file, locator, pad = 16) {
  const b = await locator.boundingBox().catch(() => null)
  if (!b) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
  const x1 = Math.min(vp.width, b.x + b.width + pad), y1 = Math.min(vp.height, b.y + b.height + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, 'states', `${file}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

const rig = await startRig({ quiet: !process.env.SEGMENT_VERBOSE })
await seedVocabularyProgram()
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const WIDTHS = [[1440, 900, ''], [390, 844, '-390']]
try {
  // 先种好：两个词组；一份带二维码的听写（扫码听写页、已选听写面板）；一个分享的词组（听音页）；一条做完的认词记录（结果页）。
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    await login(page, rig.base)
    keys.seed = await page.evaluate(async ({ entryIds }) => {
      const out = {}
      const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) } }
      const students = (await (await fetch('/api/vocabulary/students')).json()).students
      out.student = students[0]?.displayName
      const studentId = students[0].id
      const sets = []
      for (const [title, ids] of [['第一组', entryIds.slice(0, 20)], ['第二组', entryIds.slice(20, 40)]]) {
        const r = await post('/api/vocabulary/sets', { studentId, programId: 'wanwei-round-one-v1', entryIds: ids, title })
        sets.push(r.json?.vocabularySet?.id || null)
      }
      out.sets = sets
      const share = sets[0] ? await post(`/api/vocabulary/sets/${encodeURIComponent(sets[0])}/share`) : null
      out.listenShareId = share?.json?.share?.shareId || null
      const task = sets[0] ? await post('/api/vocabulary/dictation-tasks', { studentId, sourceSetIds: [sets[0]], title: '取证听写', accent: 'american', share: true, programId: 'wanwei-round-one-v1' }) : null
      out.task = { status: task?.status, id: task?.json?.task?.id || null, shareId: task?.json?.task?.share?.shareId || null }
      const ids = entryIds.slice(0, 6)
      const rec = sets[0] ? await post('/api/vocabulary/meaning-recall-records', { studentId, sourceSetIds: [sets[0]], entryIds: ids, title: '取证认词', orderMode: 'source', status: 'completed', results: ids.map((entryId, i) => ({ entryId, result: i < 3 ? 'wrong' : 'correct' })), programId: 'wanwei-round-one-v1' }) : null
      out.record = { status: rec?.status, id: rec?.json?.record?.id || null, error: rec?.ok ? null : JSON.stringify(rec?.json).slice(0, 200) }
      return out
    }, { entryIds: VOCAB_ENTRIES.map((e) => e.id) })
    await context.close()
  }

  for (const [width, height, suffix] of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}${suffix}: ${String(e).slice(0, 160)}`))
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(200) }
    const blur = () => page.evaluate(() => document.activeElement?.blur())
    const rec = {}
    keys[`w${width}`] = rec
    const step = async (name, fn) => { if (ONLY && !ONLY.includes(name)) return; keys.at = name; try { await fn() } catch (e) { keys.missing.push(`${name}${suffix}: ${String(e).split('\n')[0].slice(0, 200)}`) } }

    // 一组切换：静止一张、键盘焦点一张（焦点在选中的那一项）；读屏树、Tab 位、→ 键。
    const group = async (name, sel, { hasText } = {}) => {
      let box = page.locator(sel).filter({ visible: true })
      if (hasText) box = box.filter({ hasText })
      box = box.first()
      await box.waitFor({ timeout: 20000 })
      await box.scrollIntoViewIfNeeded(); await sleep(250)
      await blur(); await park()
      if (!(await shotAround(page, `${name}${suffix}`, box))) keys.missing.push(`${name}${suffix}: 静止没拍到`)
      const r = rec[name] = {}
      r.ax = await axTree(page, box)
      // 选中的那一项：换后是 aria-checked=true 的 radio；换前是 .is-selected 的键（没有就第一个键）。
      const pickChecked = async () => {
        const after = box.locator('[role="radio"][aria-checked="true"]')
        if (await after.count()) return after.first()
        const before = box.locator('button.is-selected')
        if (await before.count()) return before.first()
        return box.locator('button').first()
      }
      const checked = await pickChecked()
      r.optionStyles = await box.locator('button').evaluateAll((els, fn) => els.map((e) => ({ text: e.innerText.trim(), ...new Function('return ' + fn)()(e) })), styleOf.toString())
      await page.keyboard.press('Shift'); await checked.focus(); await sleep(250)
      r.focusVisible = await checked.evaluate((e) => e.matches(':focus-visible'))
      r.focusStyle = await checked.evaluate(styleOf)
      if (!(await shotAround(page, `${name}-focus${suffix}`, box))) keys.missing.push(`${name}${suffix}: 焦点没拍到`)
      // Tab 位：从组里第一个能停的元素往回 Shift+Tab 一下出组，再往前 Tab，数在组里停了几次。
      await box.locator('button:not([tabindex="-1"])').first().focus(); await sleep(100)
      await page.keyboard.press('Shift+Tab'); await sleep(100)
      const tabs = []
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab'); await sleep(80)
        const inside = await box.evaluate((b) => b.contains(document.activeElement))
        if (inside) tabs.push(await page.evaluate(describeFocus))
        else if (tabs.length) break
      }
      r.tabStops = tabs
      // → 键：焦点放在选中项上按一下 →，记焦点和选中；再按 ← 放回去（换前按了没反应）。
      const checked2 = await pickChecked()
      await checked2.focus(); await sleep(100)
      r.arrow = { start: await page.evaluate(describeFocus) }
      await page.keyboard.press('ArrowRight'); await sleep(250)
      r.arrow.afterRight = await page.evaluate(describeFocus)
      r.arrow.statesAfterRight = await box.locator('button').evaluateAll((els) => els.map((e) => `${e.innerText.trim()}:${e.getAttribute('aria-checked') ?? e.getAttribute('aria-pressed') ?? (e.classList.contains('is-selected') ? 'is-selected' : '-')}`))
      await page.keyboard.press('ArrowLeft'); await sleep(250)
      r.arrow.afterLeft = await page.evaluate(describeFocus)
      r.arrow.statesAfterLeft = await box.locator('button').evaluateAll((els) => els.map((e) => `${e.innerText.trim()}:${e.getAttribute('aria-checked') ?? e.getAttribute('aria-pressed') ?? (e.classList.contains('is-selected') ? 'is-selected' : '-')}`))
      await blur()
    }
    // 一个输入框：静止、键盘焦点；读屏树。
    const input = async (name, sel, inputSel) => {
      const box = page.locator(sel).filter({ visible: true }).first()
      await box.waitFor({ timeout: 20000 })
      await box.scrollIntoViewIfNeeded(); await sleep(250)
      await blur(); await park()
      if (!(await shotAround(page, `${name}${suffix}`, box))) keys.missing.push(`${name}${suffix}: 静止没拍到`)
      const c = box.locator(inputSel).first()
      const r = rec[name] = { ax: await axTree(page, c), style: await c.evaluate(styleOf) }
      await page.keyboard.press('Shift'); await c.focus(); await sleep(250)
      r.focusVisible = await c.evaluate((e) => e.matches(':focus-visible'))
      if (!(await shotAround(page, `${name}-focus${suffix}`, box))) keys.missing.push(`${name}${suffix}: 焦点没拍到`)
      await blur()
    }
    await login(page, rig.base)

    // ── 一、听写工作区 ─────────────────────────────────
    const WB = rig.base + '/?view=vocabulary-dictation-workbench'
    const tab = async (text) => { await page.locator('.dictation-workbench-tabs button', { hasText: text }).first().click(); await sleep(1200) }
    await step('dict-settings', async () => {
      await page.goto(WB); await settle(page, 2500)
      await page.locator('.dictation-set-row').first().click(); await sleep(600)
      await page.locator('.dictation-selection-settings > summary').first().click(); await sleep(500)
      await group('combine-accent', '.dictation-combine-settings fieldset, .dictation-combine-accent')
    })
    await step('dict-tasks', async () => {
      await page.goto(WB); await settle(page, 2500)
      await tab('听写')
      await page.locator('.dictation-task-select input').first().check(); await sleep(600)
      await group('task-accent', '.dictation-task-selection-panel fieldset, .dictation-task-accent')
    })
    await step('meaning-home', async () => {
      await page.goto(WB); await settle(page, 2500)
      await tab('认词')
      await group('meaning-order', '.meaning-recall-start-row fieldset, .meaning-recall-order')
      await input('meaning-suggest', '.meaning-recall-suggestion label, .meaning-recall-suggestion-count', 'input')
    })
    await step('meaning-result', async () => {
      await page.goto(WB); await settle(page, 2500)
      await tab('记录')
      await page.getByRole('button', { name: '查看结果' }).first().click(); await sleep(1500)
      await group('result-accent', '.meaning-recall-result-actions fieldset, .meaning-recall-export-accent')
    })

    // ── 二、过生词 ─────────────────────────────────────
    const RV = rig.base + '/?view=vocabulary-review'
    await step('review-accent', async () => {
      await page.goto(RV); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1500)
      await group('review-accent', '.vocabulary-review-accent-control')
    })
    await step('review-create', async () => {
      await page.goto(RV); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1200)
      await page.getByRole('button', { name: '新建学生' }).click(); await sleep(500)
      const form = page.locator('.vocabulary-student-create').first()
      // 出错前：播报区在不在、在树里是什么
      rec.createBefore = { alerts: await form.evaluate((f) => [...f.querySelectorAll('[role="alert"]')].map((a) => ({ text: a.textContent, cls: a.className, rects: a.getClientRects().length }))) }
      await page.route('**/api/vocabulary/students', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { error: '已有同名学生档案。' } }) : route.fallback())
      await page.locator('.vocabulary-student-create input').fill('小林')
      await page.locator('.vocabulary-student-create').getByRole('button', { name: '保存' }).click(); await sleep(800)
      await blur(); await park()
      if (!(await shotAround(page, `create-error${suffix}`, form))) keys.missing.push(`review-create${suffix}: 出错没拍到`)
      const inputEl = form.locator('input').first()
      rec.createError = {
        input: await axTree(page, inputEl),
        form: await axTree(page, form),
        // 出错的话在页面上有几份（看得见的 + 只给读屏的）；读屏逐行读时每一份都会念。
        copies: await form.evaluate((f) => [...f.querySelectorAll('p, span, div')].filter((e) => e.childElementCount === 0 && e.textContent.includes('已有同名学生档案')).length),
        alerts: await form.evaluate((f) => [...f.querySelectorAll('[role="alert"]')].map((a) => ({ text: a.textContent, cls: a.className }))),
        text: await form.innerText(),
      }
      await page.keyboard.press('Shift'); await inputEl.focus(); await sleep(200)
      await shotAround(page, `create-error-focus${suffix}`, form)
      await page.unroute('**/api/vocabulary/students')
    })

    // ── 三、扫码听音页、扫码听写页（学生手机上开的公开页）──────────
    await step('listen', async () => {
      if (!keys.seed?.listenShareId) throw new Error('没种上分享词组')
      // 英音没发布时「发音」那一组不出：拦住 ready.json 和公开词组接口，假装英音齐了（同 verify-vocabulary-rendered-behavior 的做法）。
      await page.route('**/eqb-british-cori-high-v1/ready.json', (route) => route.fulfill({ json: { version: 'eqb-british-cori-high-v1', entryCount: 1600, fileNamePattern: '{entryId}.mp3' } }))
      await page.route('**/api/public/vocabulary/listen/**', async (route) => {
        const res = await route.fetch(); const json = await res.json()
        const set = json.vocabularySet || json.set || json
        for (const e of set.entries || []) e.phonetics = { ...(e.phonetics || {}), american: e.phonetics?.american || `/${e.headword}/`, british: e.phonetics?.british || `/${e.headword} br/` }
        await route.fulfill({ response: res, json })
      })
      await page.goto(`${rig.base}/vocabulary/listen/${keys.seed.listenShareId}`); await settle(page, 2500)
      await group('listen-accent', '.vocabulary-listen-settings > fieldset, .vocabulary-listen-settings > .eqb-field', { hasText: '美音' }).catch((e) => keys.missing.push(`listen-accent${suffix}: ${String(e).split('\n')[0].slice(0, 160)}`))
      await group('listen-repeat', '.vocabulary-listen-settings > fieldset, .vocabulary-listen-settings > .eqb-field', { hasText: '2遍' })
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    })
    await step('dictation', async () => {
      if (!keys.seed?.task?.shareId) throw new Error('没种上扫码听写')
      await page.goto(`${rig.base}/vocabulary/dictation/${keys.seed.task.shareId}`); await settle(page, 2500)
      await group('dictation-repeat', '.vocabulary-dictation-settings > fieldset, .vocabulary-dictation-settings > .eqb-field', { hasText: '2遍' })
    })

    await context.close()
  }
} finally {
  delete keys.at
  writeFileSync(path.join(OUT, ONLY ? `keys-${ONLY.join('+')}.json` : 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing)
