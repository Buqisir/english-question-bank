#!/usr/bin/env node
// Owner 2026-11-14 决定第一批（#4 / #9 / #15）改前改后对照。
//   #4  滑块列表里的键：顶栏（键本身是列表项）、首页结果行「看整卷」和题组行「⋯」、个人空间文件行三个键（键嵌在行里）。
//   #9  危险红字：个人空间「⋯」菜单「删除文件」、删除确认框「删除 PDF」、组卷台题组菜单「移除」。
//   #15 组卷台题组菜单「前置分页」：读屏角色、勾选态、选完焦点回哪。
// 拍静止、悬停、键盘焦点，宽屏 1440 和窄屏 390；量出位置和实算样式。
//
// 用法：node scripts/component-inventory/decisions-a1-shots.mjs before|after
// 输出：design/components-2026-11-13/decisions-2026-11-14/batch-a1/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：decisions-a1-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/decisions-2026-11-14/batch-a1', label)
// sheet/ 是样张的拷贝，单独放，这里不清。
for (const f of ['shots', 'measure.json']) rmSync(path.join(OUT, f), { recursive: true, force: true })
mkdirSync(path.join(OUT, 'shots'), { recursive: true })

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope svg')
    const svgCs = svg ? getComputedStyle(svg) : null
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      role: e.getAttribute('role') || undefined, checked: e.getAttribute('aria-checked') || undefined,
      pressed: e.getAttribute('aria-pressed') || undefined, expanded: e.getAttribute('aria-expanded') || undefined,
      fluidActive: e.hasAttribute('data-fluid-hover-active') || undefined,
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      icons: e.querySelectorAll('svg').length, iconColor: svgCs ? svgCs.color : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}
// 滑块：列表容器 ::before 的位置和颜色（滑块停在哪一行）。
function slider(selector) {
  const round = (n) => Math.round(n * 10) / 10
  const e = document.querySelector(selector)
  if (!e) return null
  const cs = getComputedStyle(e, '::before'), r = e.getBoundingClientRect()
  return { bg: cs.backgroundColor, opacity: cs.opacity, transform: cs.transform, w: cs.width, h: cs.height, listX: round(r.x), listY: round(r.y) }
}
const focused = () => {
  const e = document.activeElement
  return e ? `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : ''} ${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}` : null
}

async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 个人空间：本地网站是空的，用 space-shots.mjs 同一份假数据（两份文件）。删除接口不拦，脚本也不点删除。
const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [{ id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T }],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}

// 首页结果：本地网站的题组都没有 canonicalPaperId，结果行只写「整卷未上线」，不出「看整卷」。
// 拦下题组列表接口，给没有 canonicalPaperId 的题组按「卷名 + 年 + 地区」补一个假的（同一卷的题组拿到同一个，
// 不会把不同卷并成一行）。只为让键露出来，脚本不点「看整卷」。改前改后同一份数据。
async function patchCanonical(context) {
  await context.route(/\/api\/question-groups(\?[^/]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch()
    let body = await res.text()
    try {
      const data = JSON.parse(body)
      const visit = (node) => {
        if (!node || typeof node !== 'object') return
        if ('groupType' in node && typeof node.id === 'string') {
          if (!node.canonicalPaperId) node.canonicalPaperId = `rig-${node.year || 0}-${node.paperName || node.source || 'x'}-${node.region || ''}`.replace(/\s+/g, '')
          return
        }
        for (const v of Object.values(node)) visit(v)
      }
      visit(data)
      body = JSON.stringify(data)
    } catch {}
    await route.fulfill({ response: res, body })
  })
}

const TOPBAR = '.topbar-actions .eqb-button, .topbar-actions .ghost-button'
const PAPER_HEAD = '.concierge-paper-row-head'
const PAPER_KEY = '.concierge-paper-actions > button'
const GROUP_LINE = '.concierge-group-row-line'
const GROUP_KEYS = `${GROUP_LINE} button`
const SIMILAR_KEYS = '.similar-passages-panel button, [class*="similar-passages"] button'
const FILE_ROW = '.my-space-file-row'
const FILE_KEYS = `${FILE_ROW}:first-of-type button`
const MENU = '.eqb-menu'
const MENU_ITEMS = '.eqb-menu .eqb-menu-item'
// 删除确认框 2026-11-14 换成共用 Dialog，原来的 .my-space-confirm-actions 没了；两个键现在在 Dialog 的动作区里
// （<dialog class="eqb-dialog my-space-confirm-dialog"> 下的 .eqb-dialog-actions，「取消」在前、「删除 PDF」在后，顺序不变）。构件收尾 2026-11-15 改，没重跑。
const DIALOG_KEYS = '.my-space-confirm-dialog .eqb-dialog-actions > button'
const GROUP_MORE = '[aria-label="更多题组操作"][aria-haspopup]'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = { intercepted: ['GET /api/question-groups：补 canonicalPaperId（露出「看整卷」）', 'GET /api/my-space：两份假文件（space-shots.mjs 同一份）'] }
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await patchCanonical(context)
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(300) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(300) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const closeMenu = async () => { if (await page.locator(MENU).count()) { await page.keyboard.press('Escape'); await sleep(300) } }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    await login(page, rig.base)

    // ---------- #4 顶栏：键本身是列表项，悬停只有滑块 ----------
    await step('topbar', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500); await park()
      const bar = page.locator('.topbar-actions').first()
      await shotAround(page, `topbar${suffix}`, [bar], 8)
      rec.topbar = await page.evaluate(measure, TOPBAR)
      const keys = page.locator(TOPBAR)
      const n = Math.min(await keys.count(), 3)
      rec.topbarHover = []
      for (let i = 0; i < n; i++) {
        if (!(await keys.nth(i).isVisible())) continue
        await keys.nth(i).hover(); await sleep(400)
        await shotAround(page, `topbar-hover-${i}${suffix}`, [bar], 8)
        rec.topbarHover.push({ i, key: (await page.evaluate(measure, TOPBAR))[i], slider: await page.evaluate(slider, '.topbar-actions') })
      }
      await park()
      if (n) {
        await keyFocus(keys.first())
        await shotAround(page, `topbar-focus${suffix}`, [bar], 8)
        rec.topbarFocus = (await page.evaluate(measure, TOPBAR))[0]
        await blur()
      }
    })

    // ---------- #4 首页结果行「看整卷」（键嵌在行头里） ----------
    await step('paper-row', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter')
      await page.locator(PAPER_HEAD).first().waitFor({ timeout: 30000 }); await settle(page, 1500); await blur(); await park()
      await page.screenshot({ path: path.join(OUT, 'shots', `results${suffix}.png`) })
      const head = page.locator(PAPER_HEAD).first(), key = head.locator(PAPER_KEY)
      rec.paperKeyCount = await page.locator(PAPER_KEY).count()
      if (!(await key.count())) throw new Error('第一行没有「看整卷」')
      await shotAround(page, `paper-row${suffix}`, [head], 8)
      rec.paperKey = (await page.evaluate(measure, `${PAPER_HEAD} ${PAPER_KEY}`))[0]
      await head.locator('.concierge-paper-body').first().hover(); await sleep(400)
      await shotAround(page, `paper-row-hover${suffix}`, [head], 8)
      rec.paperRowHover = { key: (await page.evaluate(measure, `${PAPER_HEAD} ${PAPER_KEY}`))[0], slider: await page.evaluate(slider, '.concierge-paper-list') }
      await key.hover(); await sleep(400)
      await shotAround(page, `paper-key-hover${suffix}`, [head], 8)
      rec.paperKeyHover = { key: (await page.evaluate(measure, `${PAPER_HEAD} ${PAPER_KEY}`))[0], slider: await page.evaluate(slider, '.concierge-paper-list') }
      await park()
      await keyFocus(key)
      await shotAround(page, `paper-key-focus${suffix}`, [head], 8)
      rec.paperKeyFocus = (await page.evaluate(measure, `${PAPER_HEAD} ${PAPER_KEY}`))[0]
      await blur()
    })

    // ---------- #4 展开后题组行的「⋯」（和手写「+」同一行） ----------
    await step('group-row', async () => {
      // 搜索结果第一行默认就是展开的；没展开才点开。
      const head = page.locator(PAPER_HEAD).first()
      if ((await head.locator('.concierge-row-expand').getAttribute('aria-expanded')) !== 'true') { await head.locator('.concierge-paper-body').first().click(); await sleep(800) }
      await park()
      const line = page.locator(GROUP_LINE).first()
      await line.waitFor({ timeout: 10000 })
      await line.scrollIntoViewIfNeeded(); await park()
      const trigger = line.locator('.concierge-group-row-menu-trigger')
      await shotAround(page, `group-row${suffix}`, [line], 8)
      rec.groupKeys = await page.evaluate(measure, `${GROUP_LINE}:first-of-type button`)
      await line.hover({ position: { x: 40, y: 10 } }); await sleep(400)
      await shotAround(page, `group-row-hover${suffix}`, [line], 8)
      rec.groupRowHover = { keys: await page.evaluate((s) => [...document.querySelectorAll(s)].slice(0, 3).map((e) => ({ t: (e.innerText || e.getAttribute('aria-label') || '').trim(), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color })), `${GROUP_LINE} button`) }
      if (await trigger.count()) {
        await trigger.hover(); await sleep(400)
        await shotAround(page, `group-more-hover${suffix}`, [line], 8)
        rec.groupMoreHover = (await page.evaluate(measure, `${GROUP_LINE} .concierge-group-row-menu-trigger`))[0]
        const add = line.locator('.concierge-action-add')
        if (await add.count()) {
          await add.hover(); await sleep(400)
          await shotAround(page, `group-add-hover${suffix}`, [line], 8)
          rec.groupAddHover = (await page.evaluate(measure, `${GROUP_LINE} .concierge-action-add`))[0]
        }
        await park()
        await keyFocus(trigger)
        await shotAround(page, `group-more-focus${suffix}`, [line], 8)
        rec.groupMoreFocus = (await page.evaluate(measure, `${GROUP_LINE} .concierge-group-row-menu-trigger`))[0]
        await page.keyboard.press('Enter'); await sleep(400); await park()
        await shotAround(page, `group-more-open${suffix}`, [line, page.locator(MENU)], 8)
        rec.groupMoreOpen = { trigger: (await page.evaluate(measure, `${GROUP_LINE} .concierge-group-row-menu-trigger`))[0], items: await page.evaluate(measure, MENU_ITEMS) }
        // 打开时鼠标停在行上（滑块在这一行）
        await line.hover({ position: { x: 40, y: 10 } }); await sleep(400)
        await shotAround(page, `group-more-open-rowhover${suffix}`, [line], 8)
        rec.groupMoreOpenRowHover = (await page.evaluate(measure, `${GROUP_LINE} .concierge-group-row-menu-trigger`))[0]
        // 相似篇章面板：菜单里有就点开，量面板里的键（它们在列表里、但不在行里）
        const similar = page.locator(MENU_ITEMS).filter({ hasText: '相似篇章' })
        if (await similar.count()) {
          await similar.first().click(); await sleep(2500); await park()
          const keys = page.locator(SIMILAR_KEYS)
          rec.similarKeys = await page.evaluate(measure, SIMILAR_KEYS)
          if (await keys.count()) {
            await keys.first().scrollIntoViewIfNeeded()
            await keys.first().hover(); await sleep(400)
            await shotAround(page, `similar-key-hover${suffix}`, [keys.first()], 24)
            rec.similarKeyHover = (await page.evaluate(measure, SIMILAR_KEYS))[0]
          } else rec.missing.push('similar: 面板里没有键')
        } else { rec.missing.push('similar: 菜单里没有「相似篇章」'); await closeMenu() }
      } else rec.missing.push('group-row: 没有「⋯」')
      await park()
    })

    // ---------- #4 / #9 个人空间：文件行三个键、「删除文件」、「删除 PDF」 ----------
    await step('space', async () => {
      await page.goto(rig.base + '/?view=my-space'); await settle(page, 1500); await park()
      const row = page.locator(FILE_ROW).first()
      await row.waitFor({ timeout: 15000 })
      await shotAround(page, `space-row${suffix}`, [row], 8)
      rec.spaceKeys = await page.evaluate(measure, FILE_KEYS)
      await row.locator('h3').hover(); await sleep(400)
      await shotAround(page, `space-row-hover${suffix}`, [row], 8)
      rec.spaceRowHover = { keys: await page.evaluate(measure, FILE_KEYS), slider: await page.evaluate(slider, '.my-space-file-list') }
      const keys = row.locator('button')
      const n = await keys.count()
      rec.spaceKeyHover = []; rec.spaceKeyFocus = []
      for (let i = 0; i < n; i++) {
        await keys.nth(i).hover(); await sleep(400)
        await shotAround(page, `space-key-hover-${i}${suffix}`, [row], 8)
        rec.spaceKeyHover.push((await page.evaluate(measure, FILE_KEYS))[i])
        await park()
        await keyFocus(keys.nth(i))
        await shotAround(page, `space-key-focus-${i}${suffix}`, [row], 8)
        rec.spaceKeyFocus.push((await page.evaluate(measure, FILE_KEYS))[i])
        await blur()
      }
      const trigger = row.locator('[aria-haspopup="menu"]')
      await trigger.click(); await sleep(400)
      const menu = page.locator(MENU)
      await page.mouse.move(2, height - 2); await sleep(300)
      await shotAround(page, `space-menu${suffix}`, [menu], 12)
      rec.spaceMenu = await page.evaluate(measure, MENU_ITEMS)
      const del = page.locator(MENU_ITEMS).filter({ hasText: '删除' }).first()
      await del.hover(); await sleep(400)
      await shotAround(page, `space-menu-danger-hover${suffix}`, [menu], 12)
      rec.spaceMenuDangerHover = { item: (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('删除')), slider: await page.evaluate(slider, '.eqb-menu .fluid-hover-list, .eqb-menu.fluid-hover-list') }
      await page.keyboard.press('Shift'); await del.focus(); await sleep(300)
      await shotAround(page, `space-menu-danger-focus${suffix}`, [menu], 12)
      rec.spaceMenuDangerFocus = (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('删除'))
      await page.keyboard.press('Enter'); await sleep(700); await park()
      const dialog = page.locator('.my-space-confirm-dialog')
      await shotAround(page, `space-dialog${suffix}`, [dialog], 12)
      rec.spaceDialog = await page.evaluate(measure, DIALOG_KEYS)
      const danger = page.locator(DIALOG_KEYS).filter({ hasText: '删除' }).first()
      await danger.hover(); await sleep(400)
      await shotAround(page, `space-dialog-danger-hover${suffix}`, [dialog], 12)
      rec.spaceDialogDangerHover = (await page.evaluate(measure, DIALOG_KEYS)).find((m) => m.text.includes('删除'))
      await park()
      await keyFocus(danger)
      await shotAround(page, `space-dialog-danger-focus${suffix}`, [dialog], 12)
      rec.spaceDialogDangerFocus = (await page.evaluate(measure, DIALOG_KEYS)).find((m) => m.text.includes('删除'))
      await page.keyboard.press('Escape'); await sleep(400)
    })

    // ---------- #9 / #15 组卷台题组菜单：「移除」、「前置分页」 ----------
    await step('draft', async () => {
      await addDraftItems(page)
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator(GROUP_MORE).first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
      const more = page.locator(GROUP_MORE).nth(1)
      await more.scrollIntoViewIfNeeded()
      // 切换分页后组卷台会重排分页预览，这期间题组的「⋯」整个卸掉，要等它回来。
      const openMenu = async () => { await more.waitFor({ timeout: 150000 }); await settle(page, 800); await keyFocus(more); await page.keyboard.press('Enter'); await sleep(400) }
      await openMenu()
      const menu = page.locator(MENU)
      await page.mouse.move(2, height - 2); await sleep(300)
      await shotAround(page, `draft-menu${suffix}`, [menu], 12)
      rec.draftMenu = await page.evaluate(measure, MENU_ITEMS)
      rec.draftMenuAria = await menu.ariaSnapshot().catch((e) => `ariaSnapshot 失败：${e}`)
      const remove = page.locator(MENU_ITEMS).filter({ hasText: '移除' }).first()
      await remove.hover(); await sleep(400)
      await shotAround(page, `draft-menu-danger-hover${suffix}`, [menu], 12)
      rec.draftDangerHover = (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('移除'))
      await page.keyboard.press('Shift'); await remove.focus(); await sleep(300)
      await shotAround(page, `draft-menu-danger-focus${suffix}`, [menu], 12)
      rec.draftDangerFocus = (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('移除'))
      // 分页项：键盘走到它，回车切换，看焦点回哪；再打开看勾选态，再切回来（数据复原）。
      const pageItem = page.locator(MENU_ITEMS).filter({ hasText: '分页' }).first()
      if (!(await pageItem.count())) throw new Error('菜单里没有分页项')
      await page.keyboard.press('Shift'); await pageItem.focus(); await sleep(300)
      await shotAround(page, `draft-menu-page-focus${suffix}`, [menu], 12)
      rec.draftPageItemBefore = (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('分页'))
      await page.keyboard.press('Enter'); await sleep(1500)
      rec.draftAfterToggle = { menuOpen: (await page.locator(MENU).count()) > 0, focus: await page.evaluate(focused), triggers: await page.locator(`button${GROUP_MORE}`).count() }
      await openMenu()
      await page.mouse.move(2, height - 2); await sleep(300)
      await shotAround(page, `draft-menu-page-on${suffix}`, [menu], 12)
      rec.draftMenuOn = await page.evaluate(measure, MENU_ITEMS)
      rec.draftMenuOnAria = await menu.ariaSnapshot().catch((e) => `ariaSnapshot 失败：${e}`)
      await page.locator(MENU_ITEMS).filter({ hasText: '分页' }).first().click(); await sleep(1500)
      rec.draftAfterToggleBack = { menuOpen: (await page.locator(MENU).count()) > 0, focus: await page.evaluate(focused), triggers: await page.locator(`button${GROUP_MORE}`).count() }
      await openMenu()
      rec.draftMenuRestored = (await page.evaluate(measure, MENU_ITEMS)).find((m) => m.text.includes('分页'))
      await closeMenu()
    })

    rec.errors = errors
    result[`w${width}`] = rec
    console.log(`w${width} missing`, rec.missing, 'errors', errors.length)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
