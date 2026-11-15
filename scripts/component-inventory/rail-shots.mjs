#!/usr/bin/env node
// 草稿卷左栏目录换成共用行 Row（2026-11-15）换前换后取证：只拍左栏本身（元素截图），量行高，记读屏树和 Tab 顺序，
// 实测左栏缺题项「移除」以后、撤销以后焦点落在哪。
// 换前在 HEAD 的临时 worktree 里跑（把这个文件拷进去），换后在当前工作区跑，两边步骤一样，各只跑一次。
// 起测试台的写法照 followup-shots.mjs。
//
// 用法：INVENTORY_PORT_OFFSET=73 node scripts/component-inventory/rail-shots.mjs <输出目录>
// 输出：<输出目录>/states/*.png（左栏元素截图，2 倍图）、<输出目录>/keys.json（行高、读屏树、Tab 顺序、焦点时间线、缺了哪步）。
// 测试数据：rig.mjs 默认那几篇阅读里加三篇（A、B、C），再往用户库里直接插两条题库里没有的题组（缺题项 ghost-1、ghost-2），
// 排在最后。缺题项在真站上是「题库换文件以后题组没了」，测试台里只能这样造。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { startRig } from './rig.mjs'
import { RAW } from './lib.mjs'
import { addDraftItems, login, sleep } from './scenarios.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = appRequire('playwright')

const OUT = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('用法：rail-shots.mjs <输出目录>'); process.exit(2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'states'), { recursive: true })

const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const keys = { missing: [], pageErrors: [] }
const GHOSTS = ['group-ghost-1', 'group-ghost-2']
// 只补几步：RAIL_ONLY=seed,seed-ghosts,remove-ghost-1（逗号分隔的步骤名）
const ONLY = process.env.RAIL_ONLY ? new Set(process.env.RAIL_ONLY.split(',')) : null

// 焦点在哪：标签、名字；在左栏目录项里时带上是哪一项（data-draft-group-id），在题组工具条里时带上是哪一组。
function describeFocus() {
  const e = document.activeElement
  if (!e || e === document.body) return 'body（焦点落空）'
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const tag = e.tagName.toLowerCase()
  const rail = e.closest?.('.draft-paper-rail-item')?.getAttribute('data-draft-group-id')
  const group = e.closest?.('[data-draft-tools-group-id]')?.getAttribute('data-draft-tools-group-id')
  const where = rail ? ` @左栏 ${rail}` : group ? ` @卷面 ${group}` : e.closest?.('.draft-undo-toast') ? ' @撤销提示' : ''
  return `${tag}「${name}」${where}`
}
// 左栏每一项：标签、类名、高、读屏要的属性；能 Tab 到的元素列表。
function railRows() {
  return [...document.querySelectorAll('.draft-paper-rail-item')].map((e) => {
    const r = e.getBoundingClientRect()
    const hit = e.matches('[tabindex]') ? e : e.querySelector('.eqb-row-hit')
    return {
      tag: e.tagName.toLowerCase(), group: e.getAttribute('data-draft-group-id'), cls: String(e.className),
      h: Math.round(r.height * 100) / 100, w: Math.round(r.width * 100) / 100, top: Math.round(r.top * 100) / 100,
      role: e.getAttribute('role'), tabindex: e.getAttribute('tabindex'), ariaCurrent: e.getAttribute('aria-current'),
      target: hit ? { tag: hit.tagName.toLowerCase(), name: hit.getAttribute('aria-label') || hit.innerText.trim(), title: hit.getAttribute('title') || e.getAttribute('title'), ariaCurrent: hit.getAttribute('aria-current') } : null,
      keys: [...e.querySelectorAll('button:not(.eqb-row-hit)')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
      color: getComputedStyle(e.querySelector('.draft-paper-rail-label') || e).color,
    }
  })
}
function railBox() {
  const n = document.querySelector('nav.draft-paper-rail:not(.draft-paper-rail--swap)')
  if (!n) return null
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n)
  return { display: cs.display, visible: n.getClientRects().length > 0, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }
}

// 草稿卷：等卷面排好（没有「正在重排」遮罩、工具条连续两次位置一样）。
// 卷里有缺题项时卷面排不出来（接口回「选中的题组已缺失，不能生成不完整产品」，换前换后一样），
// 这时没有工具条：没有遮罩、连续两次都没有工具条，也算停了（记成 'none'）。
async function waitDraftSettled(page, timeout = 90000, requireTools = false) {
  const until = Date.now() + timeout
  let last = null
  while (Date.now() < until) {
    await sleep(1000)
    const now = await page.evaluate((requireTools) => {
      if (document.querySelector('.draft-a4-wait.is-waiting')) return null
      const tools = [...document.querySelectorAll('[data-draft-tools-group-id]')].map((e) => `${e.getAttribute('data-draft-tools-group-id')}:${Math.round(e.getBoundingClientRect().top)}`)
      return tools.join('|') || (requireTools ? null : 'none')
    }, requireTools)
    if (now && now === last) return now
    last = now
  }
  return null
}
// 焦点随时间怎么变：每 150ms 记一次，记到没有重排遮罩、焦点 2.5 秒不动为止。
async function focusTimeline(page, timeout = 90000) {
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

async function insertGhosts(page) {
  const draftId = await page.evaluate(async () => (await (await fetch('/api/draft-papers/current')).json()).draftPaper.id)
  const db = new DatabaseSync(path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata', 'ud.sqlite'))
  const max = db.prepare('SELECT MAX(order_index) AS m FROM draft_paper_items WHERE draft_paper_id = ?').get(draftId)?.m || 0
  const now = new Date().toISOString()
  const insert = db.prepare(`INSERT OR IGNORE INTO draft_paper_items (id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before, created_at, updated_at)
    VALUES (?, ?, ?, 'paper-ghost', ?, 0, ?, ?)`)
  GHOSTS.forEach((g, i) => insert.run(`rail-${g}`, draftId, g, max + i + 1, now, now))
  db.close()
  return draftId
}

const rig = await startRig({ quiet: !process.env.RAIL_VERBOSE })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  // ── 1440：拍左栏、量、走键盘、删后焦点 ─────────────────────
  {
    const width = 1440, height = 900
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', (e) => keys.pageErrors.push(`${keys.at}: ${String(e).slice(0, 160)}`))
    const park = async () => { await page.mouse.move(1, height - 1); await sleep(300) }
    const keyFocus = async (l) => { await page.keyboard.press('Shift'); await l.focus(); await sleep(300) }
    // 能 Tab 到的那个：换前是整项 div（tabindex=0），换后是行里的整行目标
    const target = (i) => page.locator('.draft-paper-rail-item').nth(i).locator('xpath=self::*[@tabindex] | ./*[contains(concat(" ", @class, " "), " eqb-row-hit ")]').first()
    const rail = page.locator('nav.draft-paper-rail').first()
    const shot = async (name) => { await rail.screenshot({ path: path.join(OUT, 'states', `${name}.png`) }) }
    const rec = {}
    keys.w1440 = rec
    const step = async (name, fn) => { if (ONLY && !ONLY.has(name)) return; keys.at = name; try { await fn() } catch (e) { keys.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    await login(page, rig.base)
    // 排序建议不在范围里，接口拦下给「没有建议」（真算会把测试机内存吃满，见 followup-shots.mjs）
    await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))

    await step('seed', async () => {
      rec.items = await addDraftItems(page)
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('.draft-paper-rail-item').nth(2).waitFor({ timeout: 60000 })
      rec.settled = await waitDraftSettled(page, 150000, true)
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800)
    })

    await step('rest', async () => {
      await page.evaluate(() => document.activeElement?.blur()); await park()
      rec.railBox = await page.evaluate(railBox)
      rec.rows = await page.evaluate(railRows)
      rec.aria = await rail.ariaSnapshot().catch((e) => `没拿到：${String(e).slice(0, 80)}`)
      await shot('rest')
    })
    await step('hover', async () => {
      await page.locator('.draft-paper-rail-item').nth(1).hover(); await sleep(400)
      rec.hoverColor = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.draft-paper-rail-item')[1]).color)
      await shot('hover'); await park()
    })
    await step('focus', async () => {
      await keyFocus(target(1))
      rec.focus = { at: await page.evaluate(describeFocus), focusVisible: await page.evaluate(() => document.activeElement?.matches(':focus-visible')) }
      await shot('focus')
      await page.evaluate(() => document.activeElement?.blur()); await park()
    })
    await step('current', async () => {
      // 点第三项（C 篇）：卷面滚过去，当前项的白底板挪到它上面
      await page.locator('.draft-paper-rail-item').nth(2).click(); await sleep(1500); await park()
      rec.currentRows = await page.evaluate(railRows)
      await shot('current')
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) }); await sleep(1200); await park()
    })
    await step('tab-order', async () => {
      // 从左栏第一项起按 Tab，记到出左栏为止
      await keyFocus(target(0))
      const order = [await page.evaluate(describeFocus)]
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press('Tab'); await sleep(120)
        const inRail = await page.evaluate(() => Boolean(document.activeElement?.closest('nav.draft-paper-rail')))
        order.push(await page.evaluate(describeFocus))
        if (!inRail) break
      }
      rec.tabOrder = order
      await page.evaluate(() => document.activeElement?.blur()); await park()
    })
    await step('enter-jumps', async () => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
      await keyFocus(target(2)); const y0 = await page.evaluate(() => window.scrollY)
      await page.keyboard.press('Enter'); await sleep(1500)
      rec.enterJump = { before: y0, after: await page.evaluate(() => window.scrollY), focus: await page.evaluate(describeFocus) }
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) }); await sleep(1000)
    })

    // 缺题项：卷里有缺题项时卷面排不出来（「排卷面没成功：选中的题组已缺失」），所以先拍完上面几张，再插缺题项、重新打开
    const paperFailed = (timeout = 90000) => page.locator('text=排卷面没成功').first().waitFor({ timeout }).catch(() => null)
    const rowIds = () => page.evaluate(() => [...document.querySelectorAll('.draft-paper-rail-item')].map((e) => e.getAttribute('data-draft-group-id')))
    await step('seed-ghosts', async () => {
      rec.draftId = await insertGhosts(page)
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('.draft-paper-rail-item').nth(4).waitFor({ timeout: 60000 })
      await paperFailed(); await sleep(1000)
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) }); await sleep(800); await park()
      rec.rowsWithGhosts = await page.evaluate(railRows)
      rec.railBoxWithGhosts = await page.evaluate(railBox)
      rec.ariaWithGhosts = await rail.ariaSnapshot().catch((e) => `没拿到：${String(e).slice(0, 80)}`)
      rec.paperError = await page.evaluate(() => [...document.querySelectorAll('.eqb-notice, [role="alert"]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3))
      await shot('rest-missing')
    })
    await step('missing', async () => {
      await page.locator('.draft-paper-rail-item').nth(3).hover(); await sleep(400)
      await shot('missing-hover'); await park()
      await keyFocus(page.locator(`.draft-paper-rail-item[data-draft-group-id="${GHOSTS[0]}"] [aria-label="移除"]`))
      rec.missingFocus = await page.evaluate(describeFocus)
      await shot('missing-focus')
      await page.evaluate(() => document.activeElement?.blur()); await park()
    })

    // 删后焦点：键盘 Tab 到缺题项的「移除」→ Enter
    const removeGhost = async (g) => {
      await keyFocus(page.locator(`.draft-paper-rail-item[data-draft-group-id="${g}"] [aria-label="移除"]`))
      await page.keyboard.press('Enter')
      await page.locator('.draft-undo-toast').first().hover({ timeout: 15000 }).catch(() => {})
      return focusTimeline(page)
    }
    const tabToUndo = async () => {
      for (let i = 1; i <= 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => /撤销/.test(document.activeElement?.innerText || '') && Boolean(document.activeElement?.closest('.draft-undo-toast')))) return i }
      return null
    }
    const toastText = () => page.evaluate(() => [...document.querySelectorAll('.draft-undo-toast')].find((e) => e.getClientRects().length)?.innerText.trim().replace(/\s+/g, ' ') || null)
    const errorText = () => page.evaluate(() => (document.querySelector('.draft-error')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160) || null)

    // 一、两个缺题项，删前一个：后面还有一个缺题项，焦点该落到它的「移除」。
    // 服务器在卷里还有别的缺题项时拒绝删（「questionGroupId not found: group-ghost-2」，换前换后一样，见 README），
    // 所以这一段用测试替身：删除接口回「卷里少了这一项」，撤销接口回删之前的卷。只测前端焦点，不测服务器。
    await step('remove-ghost-1', async () => {
      const original = await page.evaluate(async () => (await (await fetch('/api/draft-papers/current')).json()).draftPaper)
      const idx = original.items.findIndex((i) => i.groupId === GHOSTS[0])
      await page.route('**/api/draft-papers/*/items/*', async (route) => {
        const req = route.request()
        if (req.method() === 'DELETE' && req.url().endsWith(`/rail-${GHOSTS[0]}`)) {
          return route.fulfill({ json: { draftPaper: { ...original, items: original.items.filter((i) => i.groupId !== GHOSTS[0]) }, removed: { itemId: `rail-${GHOSTS[0]}`, groupId: GHOSTS[0], orderIndex: idx + 1, pageBreakBefore: false } } })
        }
        if (req.method() === 'POST' && req.url().endsWith('/items/restore')) return route.fulfill({ json: { draftPaper: original } })
        return route.fallback()
      })
      rec.removeGhost1 = await removeGhost(GHOSTS[0])
      await sleep(3000)
      rec.removeGhost1Settled = await page.evaluate(describeFocus)
      rec.removeGhost1Toast = await toastText()
      rec.removeGhost1Error = await errorText()
      rec.rowsAfterRemove1 = await rowIds()
      await shot('after-remove-1')
    })
    await step('undo-ghost-1', async () => {
      rec.undoTabs = await tabToUndo()
      if (!rec.undoTabs) throw new Error('Tab 不到「撤销」')
      await page.keyboard.press('Enter')
      rec.undoGhost1 = await focusTimeline(page)
      await sleep(3000)
      rec.undoGhost1Settled = await page.evaluate(describeFocus)
      rec.undoGhost1Error = await errorText()
      rec.rowsAfterUndo = await rowIds()
      await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
      await shot('after-undo-1')
    })

    // 二、只剩一个缺题项，真删（服务器这时肯删）：前后都没有「移除」，焦点该落「卷面目录」；卷面重新排出来以后再取最终焦点。
    // 然后真撤销：服务器撤不回题库里没有的题组（「questionGroupId not found」），记下焦点和报错。
    await step('remove-last-missing', async () => {
      await page.unroute('**/api/draft-papers/*/items/*').catch(() => {})
      const db = new DatabaseSync(path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata', 'ud.sqlite'))
      db.prepare('DELETE FROM draft_paper_items WHERE id = ?').run(`rail-${GHOSTS[1]}`)
      db.close()
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('.draft-paper-rail-item').nth(3).waitFor({ timeout: 60000 }); await paperFailed(); await sleep(1000)
      rec.removeLast = { group: GHOSTS[0], timeline: await removeGhost(GHOSTS[0]) }
      rec.removeLast.error = await errorText()
      rec.removeLast.toast = await toastText()
      await waitDraftSettled(page, 150000, true); await sleep(1500)
      rec.removeLast.settled = await page.evaluate(describeFocus)
      rec.removeLast.rows = await rowIds()
      await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
      await shot('after-remove-all-missing')
    })
    await step('undo-last-missing', async () => {
      rec.undoLastTabs = await tabToUndo()
      if (!rec.undoLastTabs) throw new Error('Tab 不到「撤销」（提示可能已经自己收起）')
      await page.keyboard.press('Enter')
      rec.undoLast = await focusTimeline(page, 30000)
      await sleep(2000)
      rec.undoLastSettled = await page.evaluate(describeFocus)
      rec.undoLastError = await errorText()
      rec.undoLastRows = await rowIds()
    })
    await step('drag', async () => {
      // 拖第一项到第三项上：看拖动排序还在（只记顺序，不等重排）
      const before = await rowIds()
      await page.locator('.draft-paper-rail-item').nth(0).dragTo(page.locator('.draft-paper-rail-item').nth(2))
      await sleep(2500)
      rec.drag = { before, after: await rowIds(), error: await errorText() }
    })
    await context.close()
  }

  // ── 390：左栏藏起来，确认一下 ──────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    keys.at = 'w390'
    try {
      await login(page, rig.base)
      await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: null } }))
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('.draft-paper-rail').first().waitFor({ state: 'attached', timeout: 60000 }); await sleep(2000)
      keys.w390 = { railBox: await page.evaluate(railBox), rows: await page.evaluate(() => document.querySelectorAll('.draft-paper-rail-item').length) }
    } catch (e) { keys.missing.push(`w390: ${String(e).split('\n')[0].slice(0, 200)}`) }
    await context.close()
  }
} finally {
  delete keys.at
  writeFileSync(path.join(OUT, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
  await browser.close()
  await rig.stop()
}
console.log('missing', keys.missing)
