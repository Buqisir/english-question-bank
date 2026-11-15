#!/usr/bin/env node
// 字段构件第二轮（2026-11-15）换前换后取证：只拍换到的那几个控件本身（元素四周留 16px），
// 每处拍静止、键盘聚焦、出错（有的话），390 和 1440 两档；顺手记读屏信息（Chrome 无障碍树）和 Tab 走一遍的焦点顺序。
// 换前在 HEAD 的临时 worktree 里跑（把这个文件拷进去），换后在当前工作区跑，两边步骤一样；各只跑一次，拍不到的记进 missing。
// 写法照 followup-shots.mjs。
//
// 用法：INVENTORY_PORT_OFFSET=72 node scripts/component-inventory/fields2-shots.mjs <输出目录>
// 输出：<输出目录>/states/*.png、<输出目录>/keys.json（读屏、焦点顺序、缺了哪步）。
// 选择器只用换前换后都在的类名（换后的字段外层沿用原来 label 的类名），两边能对上。
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
if (!process.argv[2]) { console.error('用法：fields2-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const keys = { missing: [], pageErrors: [] }

// ── 词汇页的假数据（同 followup-shots.mjs）──────────────────
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
    id: 'wanwei-round-one-v1', version: 'finish-v1', title: '万唯1600词', subtitle: '字段取证', sourceTitle: '测试词表', sourceEdition: 'v1', totalPlannedEntries: 1600,
    groups: [{ id: 'finish-group-1', stage: 'core', week: 1, group: 1, sourceLabel: 'Day 1', startOrder: 1, endOrder: 130 }],
    entries: VOCAB_ENTRIES,
  })
  db.close()
}
// 录题面板要一条能编辑的题组（同 dialog-shots.mjs）。
const GROUP_INPUT = {
  sourceType: 'self_made', year: 2026, region: '校本', paperName: '课堂训练', section: '阅读',
  passageTitle: '取证用篇章', materialText: 'A short passage for the field rig.', summary: '取证用摘要',
  theme: '人与自我', discourseType: '记叙文', groupTitle: '取证用题组', groupType: 'reading', instruction: '',
  difficulty: 'medium', defaultScore: 2, questionCount: 1, questionType: '细节理解', questionStem: 'What is it about?',
  answer: 'A', explanation: '', tags: [],
  questions: [{ questionNo: '1', questionType: '细节理解', stem: 'What is it about?', answer: 'A', explanation: '', options: [{ label: 'A', text: 'A rig.' }, { label: 'B', text: 'A cat.' }] }],
}

// ── 页面里量东西 ─────────────────────────────────────────
function describeFocus() {
  const e = document.activeElement
  if (!e || e === document.body) return 'body（焦点落空）'
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 30)
  return `${e.tagName.toLowerCase()}${e.getAttribute('type') ? `[${e.getAttribute('type')}]` : ''}「${name}」`
}
// 控件的实算样子（高、圆角、边、字号、焦点环），写进 keys.json 好核对「看得见的变化」。
function styleOf(el) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect()
  return { h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10, radius: cs.borderRadius, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, font: `${cs.fontSize}/${cs.fontWeight}`, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} +${cs.outlineOffset}`, shadow: cs.boxShadow }
}

// 读屏信息：Chrome 无障碍树里这个元素的角色、名字、描述、invalid / required / disabled。
async function axOf(page, locator) {
  try {
    await locator.evaluate((e) => e.setAttribute('data-fields2-ax', ''))
    const cdp = await page.context().newCDPSession(page)
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fields2-ax]' })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    await locator.evaluate((e) => e.removeAttribute('data-fields2-ax'))
    await cdp.detach()
    const n = nodes[0]
    const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value
    return { role: n.role?.value, name: n.name?.value, description: n.description?.value || null, invalid: prop('invalid') ?? null, required: prop('required') ?? null, disabled: prop('disabled') ?? null, nameFrom: n.name?.sources?.find((s) => s.value)?.type || null }
  } catch (e) { return { error: String(e).slice(0, 120) } }
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

const rig = await startRig({ quiet: !process.env.FIELDS2_VERBOSE })
await seedVocabularyProgram()
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const WIDTHS = [[1440, 900, ''], [390, 844, '-390']]
try {
  // 先种好：两个词组（听写工作区要有词组可选），一条能编辑的题组。
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    await login(page, rig.base)
    keys.seed = await page.evaluate(async ({ entryIds, group }) => {
      const students = (await (await fetch('/api/vocabulary/students')).json()).students
      for (const [title, ids] of [['第一组', entryIds.slice(0, 20)], ['第二组', entryIds.slice(20, 40)]]) {
        await fetch('/api/vocabulary/sets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: students[0].id, programId: 'wanwei-round-one-v1', entryIds: ids, title }) })
      }
      const r = await fetch('/api/question-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(group) })
      const groupId = r.ok ? (await r.json()).questionGroup.id : null
      return { student: students[0]?.displayName, groupId }
    }, { entryIds: VOCAB_ENTRIES.map((e) => e.id), group: GROUP_INPUT })
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
    // 只补几步：FIELDS2_ONLY=review-create,dict-settings（逗号分隔的步骤名；协调人复核 2026-11-15 补）
    const step = async (name, fn) => { if (process.env.FIELDS2_ONLY && !process.env.FIELDS2_ONLY.split(',').includes(name)) return; keys.at = name; try { await fn() } catch (e) { keys.missing.push(`${name}${suffix}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    // 一处：静止一张、每个要聚焦的控件各一张；读屏信息、实算样子、Tab 顺序记下来。
    const region = async (name, regionSel, controls) => {
      const box = page.locator(regionSel).filter({ visible: true }).first()
      await box.waitFor({ timeout: 20000 })
      await box.scrollIntoViewIfNeeded(); await sleep(200)
      await blur(); await park()
      if (!(await shotAround(page, `${name}${suffix}`, box))) keys.missing.push(`${name}${suffix}: 静止没拍到`)
      const r = rec[name] = { controls: {} }
      for (const [cname, csel] of controls) {
        const c = page.locator(csel).filter({ visible: true }).first()
        if (!(await c.count())) { keys.missing.push(`${name}${suffix}: 找不到 ${cname}`); continue }
        // 先按一下 Shift，让接下来的 focus() 算键盘焦点（:focus-visible）。
        await page.keyboard.press('Shift'); await c.focus(); await sleep(200)
        r.controls[cname] = { ax: await axOf(page, c), style: await c.evaluate(styleOf), focusVisible: await c.evaluate((e) => e.matches(':focus-visible')) }
        if (!(await shotAround(page, `${name}-focus-${cname}${suffix}`, box))) keys.missing.push(`${name}${suffix}: ${cname} 聚焦没拍到`)
      }
      // Tab 顺序：从第一个控件起按 Tab，记到焦点离开这一处为止（最多 8 步）。
      const first = page.locator(controls[0]?.[1] || regionSel).filter({ visible: true }).first()
      if (controls.length && await first.count()) {
        await first.focus(); const order = [await page.evaluate(describeFocus)]
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('Tab')
          const inside = await box.evaluate((b) => b.contains(document.activeElement))
          order.push((inside ? '' : '（出了这一处）') + await page.evaluate(describeFocus))
          if (!inside) break
        }
        r.tabOrder = order
      }
      await blur()
    }
    await login(page, rig.base)

    // ── 一、听写工作区 ─────────────────────────────────
    const WB = rig.base + '/?view=vocabulary-dictation-workbench'
    const tab = async (re) => { await page.locator('.dictation-workbench-tabs button', { hasText: re }).first().click(); await sleep(1200) }
    await step('dict-top', async () => {
      await page.goto(WB); await settle(page, 2500)
      await region('dict-student', '.dictation-student-picker', [['select', '.dictation-student-picker select']])
      await region('dict-filter', '.dictation-library-tools', [['search', '.dictation-library-tools input:not([type="date"])'], ['date', '.dictation-library-tools input[type="date"]']])
    })
    await step('dict-settings', async () => {
      await page.goto(WB); await settle(page, 2500)
      await page.locator('.dictation-set-row').first().click(); await sleep(600)
      await page.locator('.dictation-selection-settings > summary').first().click(); await sleep(500)
      await region('dict-settings', '.dictation-combine-settings', [['print-title', '.dictation-combine-settings input:not([type="checkbox"])']])
    })
    await step('dict-meaning', async () => {
      await page.goto(WB); await settle(page, 2500)
      await tab(/^\s*认词\s*$/)
      await region('meaning-start', '.meaning-recall-start-row', [['count', '.meaning-recall-start-row input']])
    })
    await step('dict-review', async () => {
      await page.goto(WB); await settle(page, 2500)
      await tab(/待复习/)
      await region('dict-suggest', '.dictation-suggestion-control', [['count', '.dictation-suggestion-control input']])
    })

    // ── 二、过生词 ─────────────────────────────────────
    const RV = rig.base + '/?view=vocabulary-review'
    await step('review-setup', async () => {
      await page.goto(RV); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1500)
      await region('rev-student', '.vocabulary-student-switcher', [['select', '.vocabulary-student-switcher select']])
      await region('rev-target', '.vocabulary-run-fields', [['count', '.vocabulary-run-fields input']])
      await region('rev-direct', '.vocabulary-direct-set-input', [['textarea', '.vocabulary-direct-set-input textarea']])
    })
    await step('review-create', async () => {
      await page.goto(RV); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1200)
      await page.getByRole('button', { name: '新建学生' }).click(); await sleep(500)
      await region('rev-create', '.vocabulary-student-create', [['name', '.vocabulary-student-create input']])
      // 出错：建学生接口给 409 + 一句话
      await page.route('**/api/vocabulary/students', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { error: '已有同名学生档案。' } }) : route.fallback())
      await page.locator('.vocabulary-student-create input').fill('小林')
      await page.locator('.vocabulary-student-create').getByRole('button', { name: '保存' }).click(); await sleep(800)
      await blur(); await park()
      const box = page.locator('.vocabulary-student-create').first()
      if (!(await shotAround(page, `rev-create-error${suffix}`, box))) keys.missing.push(`rev-create${suffix}: 出错没拍到`)
      const input = page.locator('.vocabulary-student-create input').first()
      rec.revCreateError = { ax: await axOf(page, input), text: await box.innerText() }
      await page.keyboard.press('Shift'); await input.focus(); await sleep(200)
      await shotAround(page, `rev-create-error-focus${suffix}`, box)
      await page.unroute('**/api/vocabulary/students')
    })
    // 换前那次（HEAD）这一步在 1440 走完一轮过词以后停在「完成」页，学生的进度就留在那里，390 的开始页都打不开了（记在 README）。
    // 换后这次只在最后一档（390）走这一步，前面两步先拍。
    await step('review-done', async () => {
      if (width !== WIDTHS[WIDTHS.length - 1][0]) throw new Error('只在最后一档拍（见上）')
      await page.goto(RV); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1200)
      await page.locator('.vocabulary-run-fields input').fill('2')
      await page.locator('.vocabulary-run-start-row').getByRole('button').last().click()
      for (let i = 0; i < 2; i++) { const u = page.locator('.vocabulary-control-unfamiliar:not(:disabled)'); await u.waitFor({ timeout: 20000 }); await u.click(); await sleep(700) }
      await page.locator('.vocabulary-completion-state .vocabulary-completion-actions').waitFor({ timeout: 20000 }); await sleep(800)
      await region('rev-title', '.vocabulary-set-title-control', [['name', '.vocabulary-set-title-control input']])
      await region('rev-accent', '.vocabulary-print-accent-control', [['select', '.vocabulary-print-accent-control select']])
    })

    // ── 三、整卷页 ─────────────────────────────────────
    await step('paper', async () => {
      await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 3000)
      // 换前那次这里 20 秒没等到下拉（记在 README）。换后这次先记下页面上有没有、看不看得见，再等 60 秒。
      rec.paperProbe = await page.evaluate(() => {
        const el = document.querySelector('select[aria-label="PDF 版本"], .paper-browse-pdf-edition select')
        return el ? { found: true, rects: el.getClientRects().length, options: el.options.length, disabled: el.disabled } : { found: false, topbar: Boolean(document.querySelector('header.topbar')), body: document.body.innerText.slice(0, 200) }
      })
      await page.locator('select[aria-label="PDF 版本"], .paper-browse-pdf-edition').filter({ visible: true }).first().waitFor({ timeout: 60000 })
      await region('paper-pdf', 'select[aria-label="PDF 版本"], .paper-browse-pdf-edition', [['select', 'header select']])
      rec.paperReviewControls = await page.locator('.paper-review-controls').count()
      if (!rec.paperReviewControls) keys.missing.push(`paper-review${suffix}: 测试数据里没有审阅版（reviewRevision），「查看哪款 PDF」没拍到`)
    })

    // ── 四、Agent 口令 ─────────────────────────────────
    await step('admin', async () => {
      await page.goto(rig.base + '/?view=admin'); await settle(page, 2000)
      await region('admin-token', '.agent-tokens form', [['name', '.agent-tokens form input']])
    })

    // ── 五、录题面板 ───────────────────────────────────
    await step('entry', async () => {
      if (!keys.seed?.groupId) throw new Error('没种上题组')
      await page.goto(rig.base + `/?view=detail&groupId=${encodeURIComponent(keys.seed.groupId)}`)
      const trigger = page.getByRole('button', { name: '更多操作', exact: true })
      await trigger.waitFor({ timeout: 30000 }); await settle(page, 1200)
      await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
      await page.keyboard.press('Home'); await sleep(100); await page.keyboard.press('Enter'); await sleep(900)
      await page.locator('.entry-form fieldset').first().waitFor({ timeout: 10000 })
      await region('entry-source', '.entry-form fieldset:nth-of-type(1)', [['select', '.entry-form fieldset:nth-of-type(1) select'], ['year', '.entry-form fieldset:nth-of-type(1) input']])
      await region('entry-passage', '.entry-form fieldset:nth-of-type(2)', [['textarea', '.entry-form fieldset:nth-of-type(2) textarea']])
      await region('entry-question', '.entry-question-card', [['no', '.entry-question-card input']])
      // 必填没填：清掉「地区」再按保存，看浏览器怎么提示（原生 required）
      const region2 = page.locator('.entry-form fieldset:nth-of-type(1) input').nth(1)
      await region2.fill('')
      await page.getByRole('button', { name: /保存修改|保存题组/ }).click(); await sleep(500)
      rec.entryRequired = { focus: await page.evaluate(describeFocus), ax: await axOf(page, region2), validity: await region2.evaluate((e) => e.validationMessage) }
      await shotAround(page, `entry-required${suffix}`, page.locator('.entry-form fieldset:nth-of-type(1)').first())
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
