#!/usr/bin/env node
// 对话框换成共用构件 Dialog 的前后实测（构件厂，2026-11-14）。
// 五处模态对话框：草稿卷「保存 PDF 到个人空间」、个人空间删除确认、Agent 口令作废确认、
// 题组详情「编辑题组」（录题面板）、过生词「选择练字单词」。每处都用键盘打开，然后：
//   - 读屏：用 Chrome 的无障碍树（CDP Accessibility）读最上面那层模态的角色和名字；
//   - 打开时焦点落在哪；
//   - Tab、Shift+Tab 各走「控件数 + 2」步，看焦点有没有出去；
//   - 背后页面能不能滚（在遮罩上滚滚轮，看 scrollY 变没变；页面本身不够高时临时在 body 末尾垫一块 3000px 的空白再试）；
//   - Esc 能不能关、关了以后焦点是不是回到打开它的那个键；
//   - 点遮罩关不关（重新打开后点左上角遮罩）；
//   - 截图：整屏、框住面板。
// 1440 × 900 和 390 × 844 各一遍（同一个页面改视口宽，不重走前面的准备），2 倍图，减少动态效果打开。
// 另在不减少动态效果的页面上量一次面板的过渡时长（只量「保存 PDF 到个人空间」）。
//
// 数据：测试站默认种子（四篇阅读）。个人空间列表、文件夹拦接口回固定数据（同 space-shots.mjs），删除不点；
// 口令和题组走正常接口新建一条（测试站的临时数据库）；单词照 vocab-review-shots.mjs 导入 30 词校准课程，
// 过两个词、生成固定生词组。不点会真下载、真删除、真作废、真保存的键。
//
// 用法：INVENTORY_PORT_OFFSET=61 node scripts/component-inventory/dialog-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-dialog/<before|after>/（截图 + keyboard.json）
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { RAW, ROOT } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：dialog-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-dialog', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)

// 面板（截图框住的那一块）：after 是 .eqb-dialog-panel，before 是各处自己的类名。
const PANEL = '.eqb-dialog-panel, .draft-save-space-dialog, .my-space-confirm-dialog, .agent-token-dialog, .entry-panel, .vocabulary-handwriting-selector'

const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [
    { id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T },
    { id: 'folder-b', name: '期中复习', artifactCount: 0, createdAt: T, updatedAt: T },
  ],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}

// 新建一条题组，详情页才有「编辑」（只有库里的题组 canEdit，固定种子里的卷面题组不能编辑）。
const GROUP_INPUT = {
  sourceType: 'self_made', year: 2026, region: '校本', paperName: '课堂训练', section: '阅读',
  passageTitle: '清点用篇章', materialText: 'A short passage for the inventory rig.', summary: '清点用摘要',
  theme: '人与自我', discourseType: '记叙文', groupTitle: '清点用题组', groupType: 'reading', instruction: '',
  difficulty: 'medium', defaultScore: 2, questionCount: 1, questionType: '细节理解', questionStem: 'What is it about?',
  answer: 'A', explanation: '', tags: [],
  questions: [{ questionNo: '1', questionType: '细节理解', stem: 'What is it about?', answer: 'A', explanation: '', options: [{ label: 'A', text: 'A rig.' }, { label: 'B', text: 'A cat.' }] }],
}

// ── 在页面里跑的小函数 ─────────────────────────────────────

// 找最上面那层模态：原生 <dialog> 用 :modal；手写的找 aria-modal="true"。给它挂个记号，CDP 和后面的检查都认这个记号。
function markDialog() {
  document.querySelectorAll('[data-probe-dialog]').forEach((e) => e.removeAttribute('data-probe-dialog'))
  const native = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal'))
  const aria = [...document.querySelectorAll('[aria-modal="true"]')].filter((e) => e.getClientRects().length)
  const el = native.at(-1) || aria.at(-1)
  if (!el) return null
  el.setAttribute('data-probe-dialog', '')
  return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), native: el.tagName === 'DIALOG' }
}

const describeFocus = () => {
  const e = document.activeElement
  if (!e || e === document.body) return { desc: 'body', inside: false, isOpener: false }
  const d = document.querySelector('[data-probe-dialog]')
  const name = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.getAttribute('name') || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 24)
  const type = e.tagName === 'INPUT' ? `[${e.type}]` : ''
  return { desc: `${e.tagName.toLowerCase()}${type} ${name}`.trim(), inside: Boolean(d && d.contains(e)), isOpener: e.hasAttribute('data-probe-opener') }
}

// 和 useModalDialog 的 Tab 圈同一个口径：能 Tab 到、没禁用、画出来了的控件。
function countFocusables() {
  const d = document.querySelector('[data-probe-dialog]')
  if (!d) return 0
  return [...d.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0).length
}

const dialogOpen = () => {
  const native = [...document.querySelectorAll('dialog')].some((d) => d.matches(':modal'))
  const aria = [...document.querySelectorAll('[aria-modal="true"]')].some((e) => e.getClientRects().length)
  return native || aria
}

// ── 主流程 ───────────────────────────────────────────────

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const rig = await startRig({ quiet: true })
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata', 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) { await rig.stop(); throw new Error('导入校准课程失败：' + imported.stderr.slice(-400)) }
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = { label, sites: {} }

async function axOf(page) {
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-probe-dialog]' })
    if (!nodeId) return null
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    return { role: n?.role?.value, name: n?.name?.value, description: n?.description?.value || null }
  } finally { await cdp.detach() }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page, rig.base)

  // 每处：prepare 走到能打开的那一页；open 用键盘打开（先给要回到的键挂 data-probe-opener）。
  const SITES = [
    {
      id: 'draft-save-space', title: '草稿卷「保存 PDF 到个人空间」',
      prepare: async () => {
        await addDraftItems(page)
        await page.goto(rig.base + '/?view=draft-paper')
        await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 }); await settle(page, 1500)
      },
      open: async () => {
        const trigger = page.locator('header.topbar').getByRole('button', { name: '导出', exact: true })
        await trigger.evaluate((e) => e.setAttribute('data-probe-opener', ''))
        await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
        await page.keyboard.press('End'); await sleep(100); await page.keyboard.press('Enter')
        await sleep(900)
      },
    },
    {
      id: 'my-space-delete', title: '个人空间「删除草稿卷 PDF」',
      prepare: async () => { await page.goto(rig.base + '/?view=my-space'); await page.locator('.my-space-file-row').first().waitFor({ timeout: 30000 }); await settle(page, 1000) },
      open: async () => {
        const trigger = page.locator('.my-space-file-row').first().locator('.my-space-row-menu-trigger')
        await trigger.evaluate((e) => e.setAttribute('data-probe-opener', ''))
        await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
        await page.keyboard.press('End'); await sleep(100); await page.keyboard.press('Enter')
        await sleep(700)
      },
    },
    {
      id: 'agent-token-revoke', title: '后台「作废 Agent 口令」',
      prepare: async () => {
        await page.evaluate(async () => {
          const list = await (await fetch('/api/admin/agent-tokens')).json()
          if (!list.tokens.some((t) => !t.revokedAt)) await fetch('/api/admin/agent-tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '清点用口令' }) })
        })
        await page.goto(rig.base + '/?view=admin'); await page.getByRole('button', { name: '作废口令' }).first().waitFor({ timeout: 30000 }); await settle(page, 800)
      },
      open: async () => {
        const trigger = page.getByRole('button', { name: '作废口令' }).first()
        await trigger.evaluate((e) => e.setAttribute('data-probe-opener', ''))
        await trigger.focus(); await page.keyboard.press('Enter'); await sleep(700)
      },
    },
    {
      id: 'entry-edit', title: '题组详情「编辑题组」（录题面板）',
      prepare: async () => {
        const id = await page.evaluate(async (input) => {
          const r = await fetch('/api/question-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
          if (!r.ok) throw new Error('create group ' + r.status + ' ' + (await r.text()).slice(0, 200))
          return (await r.json()).questionGroup.id
        }, GROUP_INPUT)
        await page.goto(rig.base + `/?view=detail&groupId=${encodeURIComponent(id)}`)
        await page.getByRole('button', { name: '更多操作', exact: true }).waitFor({ timeout: 30000 }); await settle(page, 1200)
      },
      open: async () => {
        const trigger = page.getByRole('button', { name: '更多操作', exact: true })
        await trigger.evaluate((e) => e.setAttribute('data-probe-opener', ''))
        await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
        await page.keyboard.press('Home'); await sleep(100); await page.keyboard.press('Enter')
        await sleep(900)
      },
    },
    {
      id: 'vocab-handwriting', title: '过生词「选择练字单词」',
      prepare: async () => {
        await page.goto(rig.base + '/?view=vocabulary-review'); await page.locator('.vocabulary-run-start-row').waitFor({ timeout: 30000 }); await settle(page, 1200)
        await page.locator('.vocabulary-run-fields input').fill('2')
        await page.locator('.vocabulary-run-start-row').getByRole('button').last().click()
        for (let i = 0; i < 2; i++) {
          const u = page.locator('.vocabulary-control-unfamiliar:not(:disabled)'); await u.waitFor({ timeout: 20000 }); await u.click(); await sleep(700)
        }
        const done = page.locator('.vocabulary-completion-state .vocabulary-completion-actions'); await done.waitFor({ timeout: 20000 })
        await done.getByRole('button', { name: '生成固定生词组', exact: true }).click()
        await page.locator('.vocabulary-set-title-control').waitFor({ timeout: 30000 }); await settle(page, 1000)
      },
      open: async () => {
        // 打开它的是「下载」：先用键盘开下载列表，再在「衡水体练字纸」上按回车（列表会收起，这一项跟着没了）。
        const trigger = page.locator('.vocabulary-download-menu > button')
        await trigger.evaluate((e) => e.setAttribute('data-probe-opener', ''))
        await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
        await page.getByRole('button', { name: /^衡水体练字纸\s/u }).focus(); await page.keyboard.press('Enter')
        await sleep(700)
      },
    },
  ]

  const panelShot = async (name) => {
    // 换上共用 Dialog 后只认面板本身（.eqb-dialog-panel）：选择练字单词的正文也挂着旧类名，按「最后一个」会切到正文。
    const shared = page.locator('.eqb-dialog-panel').filter({ visible: true })
    const panel = (await shared.count()) ? shared.last() : page.locator(PANEL).filter({ visible: true }).last()
    const b = await panel.boundingBox().catch(() => null)
    if (!b) return false
    const pad = 16, vp = page.viewportSize()
    const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
    const x1 = Math.min(vp.width, b.x + b.width + pad), y1 = Math.min(vp.height, b.y + b.height + pad)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
    return true
  }

  for (const site of SITES) {
    const rec = { title: site.title, missing: [] }
    result.sites[site.id] = rec
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`)
        await page.screenshot({ path: path.join(OUT, `missing-${site.id}-${name}.png`) }).catch(() => {})
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await step('prepare', site.prepare)
    if (rec.missing.length) continue

    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const w = {}
      rec[`w${width}`] = w
      await page.setViewportSize({ width, height }); await sleep(400)
      await page.evaluate(() => window.scrollTo(0, 0))
      await step(`open-${width}`, async () => {
        await site.open()
        w.dialog = await page.evaluate(markDialog)
        if (!w.dialog) throw new Error('没找到模态层')
        w.openFocus = await page.evaluate(describeFocus)
        w.ax = await axOf(page)
        w.focusables = await page.evaluate(countFocusables)
        await page.mouse.move(2, height - 2)
        await page.screenshot({ path: path.join(OUT, `${site.id}-${width}.png`) })
        await panelShot(`${site.id}-${width}-crop`)
      })
      if (!w.dialog) continue

      if (width === 1440) {
        await step('tab', async () => {
          const n = w.focusables + 2
          w.tab = []
          for (let k = 0; k < n; k += 1) { await page.keyboard.press('Tab'); await sleep(60); w.tab.push(await page.evaluate(describeFocus)) }
          w.shiftTab = []
          for (let k = 0; k < n; k += 1) { await page.keyboard.press('Shift+Tab'); await sleep(60); w.shiftTab.push(await page.evaluate(describeFocus)) }
          w.tabStaysInside = w.tab.every((f) => f.inside) && w.shiftTab.every((f) => f.inside)
        })
      }

      await step(`scroll-${width}`, async () => {
        const grown = await page.evaluate(() => {
          const el = document.scrollingElement
          if (el.scrollHeight > innerHeight + 200) return false
          const pad = document.createElement('div'); pad.setAttribute('data-probe-pad', ''); pad.style.height = '3000px'
          document.body.append(pad); return true
        })
        const before = await page.evaluate(() => ({ y: scrollY, overflow: getComputedStyle(document.documentElement).overflow, bodyOverflow: getComputedStyle(document.body).overflow }))
        await page.mouse.move(6, Math.round(height / 2)); await page.mouse.wheel(0, 600); await sleep(400)
        const after = await page.evaluate(() => scrollY)
        w.scroll = { paddedPage: grown, htmlOverflow: before.overflow, bodyOverflow: before.bodyOverflow, scrollYBefore: before.y, scrollYAfter: after, pageScrolled: after !== before.y }
        await page.evaluate(() => { document.querySelector('[data-probe-pad]')?.remove(); window.scrollTo(0, 0) })
      })

      await step(`escape-${width}`, async () => {
        await page.keyboard.press('Escape'); await sleep(600)
        w.escCloses = !(await page.evaluate(dialogOpen))
        w.focusAfterEsc = await page.evaluate(describeFocus)
      })

      await step(`backdrop-${width}`, async () => {
        if (await page.evaluate(dialogOpen)) { await page.keyboard.press('Escape'); await sleep(600) }
        await site.open()
        if (!(await page.evaluate(dialogOpen))) throw new Error('重新打开失败')
        await page.evaluate(markDialog)
        await page.mouse.click(6, 6); await sleep(600)
        w.backdropCloses = !(await page.evaluate(dialogOpen))
        if (!w.backdropCloses) { await page.keyboard.press('Escape'); await sleep(600) }
        w.closedAtEnd = !(await page.evaluate(dialogOpen))
      })
    }
    console.log(site.id, 'missing', rec.missing)
  }
  result.errors = errors
  await context.close()

  // 动效：不减少动态效果时，面板有没有过渡；减少时有没有。只量「保存 PDF 到个人空间」。
  const motion = {}
  for (const reduced of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: reduced })
    await ctx.route(/\/api\/my-space(\?[^/]*)?$/, (route) => route.request().method() !== 'GET' ? route.fallback()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) }))
    const p = await ctx.newPage()
    try {
      await login(p, rig.base)
      await p.goto(rig.base + '/?view=draft-paper'); await p.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 }); await settle(p, 1000)
      await p.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(300)
      await p.getByRole('menuitem', { name: '保存 PDF 到个人空间' }).click(); await sleep(50)
      motion[reduced] = await p.evaluate((sel) => {
        const panel = [...document.querySelectorAll(sel)].at(-1)
        if (!panel) return null
        const cs = getComputedStyle(panel)
        return { transitionDuration: cs.transitionDuration, transitionProperty: cs.transitionProperty, animationName: cs.animationName, animationDuration: cs.animationDuration }
      }, PANEL)
    } catch (e) { motion[reduced] = { error: String(e).slice(0, 200) } }
    await ctx.close()
  }
  result.motion = motion
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'keyboard.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
