#!/usr/bin/env node
// 首页和个人空间的行菜单换构件前后对照（构件厂第 4 步第四页）：首页题组行「…」、详情页 owner「…」
// （编辑 / 删除，和首页用的是同一个 ConciergeGroupRowMenu）、个人空间文件行「…」（另存为 / 删除文件）。
// 拍静止、整行悬停、触发键悬停、打开、项悬停、键盘打开再按 ↓，宽屏 1440 和窄屏 390；
// 量出位置和实算样式，记下 Esc 和「删除文件」之后焦点落在哪。
//
// 用法：node scripts/component-inventory/menu-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-menus/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：menu-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-menus', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope > svg, :scope svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null, iconW: svg ? round(svg.getBoundingClientRect().width) : null,
      iconColor: svg ? getComputedStyle(svg).color : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius, gap: cs.rowGap,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
      opacity: cs.opacity, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      expanded: e.getAttribute('aria-expanded'), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      parent: e.parentElement?.className?.toString().slice(0, 60),
      data: Object.fromEntries([...e.attributes].filter((a) => /^data-(ra|tone)/.test(a.name)).map((a) => [a.name, a.value])),
    }
  })
}

const focused = () => {
  const e = document.activeElement
  return e ? `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : ''} ${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30)}` : null
}

async function shotAround(page, name, locators, pad = 16) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 本地网站的个人空间是空的；真去出 PDF 要等一两分钟。这里拦下列表接口，塞两份固定的文件进去
// （一份带学生名、在文件夹里）。改前改后同一份数据，对照有效。下载、删除这些写接口不拦，也不点。
const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [{ id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T }],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}

const MENU = '[role="menu"]'
const ITEMS = `${MENU} [role="menuitem"]`

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
      : route.fallback())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    const closeMenu = async () => {
      if (await page.locator(MENU).count()) { await page.keyboard.press('Escape'); await sleep(250) }
      if (await page.locator(MENU).count()) { await page.mouse.click(2, height - 2); await sleep(250) }
      await page.evaluate(() => document.activeElement?.blur())
    }
    await login(page, rig.base)

    // 同一套拍法：row 是触发键所在的那块，trigger 是「…」，rowHover 是整行悬停时鼠标放的地方。
    const shootMenu = async (key, { row, trigger, rowHover }) => {
      const r = (rec[key] = {})
      await row.scrollIntoViewIfNeeded(); await sleep(300); await park()
      await shotAround(page, `${key}-rest${suffix}`, [row], 12)
      await trigger.evaluate((e) => e.setAttribute('data-shot-trigger', '1'))
      r.triggerRest = await page.evaluate(measure, '[data-shot-trigger]')
      if (rowHover) {
        await rowHover.hover(); await sleep(350)
        await shotAround(page, `${key}-row-hover${suffix}`, [row], 12)
        r.triggerRowHover = await page.evaluate(measure, '[data-shot-trigger]')
      }
      if (!suffix) {
        await trigger.hover(); await sleep(350)
        await shotAround(page, `${key}-trigger-hover${suffix}`, [row], 12)
        r.triggerHover = await page.evaluate(measure, '[data-shot-trigger]')
      }
      await trigger.click(); await sleep(500); await park()
      const panel = page.locator(MENU).first()
      await shotAround(page, `${key}-open${suffix}`, [row, panel], 12)
      r.open = { panel: await page.evaluate(measure, MENU), items: await page.evaluate(measure, ITEMS), trigger: await page.evaluate(measure, '[data-shot-trigger]'), focus: await page.evaluate(focused), portalParent: await panel.evaluate((e) => e.parentElement?.className || e.parentElement?.tagName) }
      if (!suffix) {
        const second = page.locator(ITEMS).nth(1)
        await second.hover(); await sleep(350)
        await shotAround(page, `${key}-item-hover${suffix}`, [row, panel], 12)
        r.itemHover = await page.evaluate(measure, ITEMS)
        const last = page.locator(ITEMS).last()
        await last.hover(); await sleep(350)
        await shotAround(page, `${key}-item-hover-last${suffix}`, [row, panel], 12)
        r.itemHoverLast = await page.evaluate(measure, ITEMS)
      }
      await page.keyboard.press('Escape'); await sleep(300)
      r.escapeFocus = await page.evaluate(focused)
      await closeMenu()
      if (!suffix) {
        await page.keyboard.press('Shift'); await trigger.focus(); await sleep(200)
        await shotAround(page, `${key}-trigger-focus${suffix}`, [row], 12)
        r.triggerFocus = await page.evaluate(measure, '[data-shot-trigger]')
        await page.keyboard.press('Enter'); await sleep(500)
        r.keyboard = { afterEnter: await page.evaluate(focused) }
        await page.keyboard.press('ArrowDown'); await sleep(200)
        r.keyboard.afterArrowDown = await page.evaluate(focused)
        await shotAround(page, `${key}-keyboard${suffix}`, [row, page.locator(MENU).first()], 12)
        r.keyboard.items = await page.evaluate(measure, ITEMS)
        await page.keyboard.press('Tab'); await sleep(250)
        r.keyboard.afterTab = await page.evaluate(focused)
        r.keyboard.menuOpenAfterTab = await page.locator(MENU).count()
        await closeMenu()
      }
      await trigger.evaluate((e) => e.removeAttribute('data-shot-trigger'))
    }

    // 1. 首页题组行
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input'); await input.fill('2026 阅读'); await input.press('Enter'); await settle(page, 3000)
      const row = page.locator('.concierge-group-row').first()
      await row.waitFor({ timeout: 15000 })
      await shootMenu('home', { row, trigger: row.locator('[aria-haspopup="menu"]').first(), rowHover: row.locator('.concierge-group-row-title') })
      // 打开后点「详情」：应走站内跳转（不整页刷新），记下到了哪
      await row.locator('[aria-haspopup="menu"]').first().click(); await sleep(400)
      const navs = []; page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()) })
      await page.locator(ITEMS).filter({ hasText: '详情' }).first().click(); await sleep(1200)
      rec.home.detailClick = { url: page.url().replace(rig.base, ''), fullNavigations: navs.length, detailVisible: await page.locator('.detail-view').count() }
    })

    // 2. 详情页 owner「…」（编辑 / 删除）
    await step('detail', async () => {
      await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-a'); await settle(page, 2500)
      const wrap = page.locator('.peek-actions-menu').first()
      await wrap.waitFor({ timeout: 15000 })
      const row = page.locator('.peek-actions-menu').first().locator('xpath=..')
      await shootMenu('detail', { row, trigger: wrap.locator('[aria-haspopup="menu"]').first() })
    })

    // 3. 个人空间文件行
    await step('space', async () => {
      await page.goto(rig.base + '/?view=my-space'); await settle(page, 2000)
      const row = page.locator('.my-space-file-row').first()
      await row.waitFor({ timeout: 15000 })
      rec.spaceRowActions = await page.evaluate(measure, '.my-space-file-row:first-of-type .my-space-row-actions > *')
      await shootMenu('space', { row, trigger: row.locator('[aria-haspopup="menu"]').first(), rowHover: row.locator('h3') })
      // 「删除文件」：确认框拿焦点；取消后焦点回「…」
      const trigger = row.locator('[aria-haspopup="menu"]').first()
      await trigger.click(); await sleep(400)
      await page.locator(ITEMS).filter({ hasText: '删除文件' }).first().click(); await sleep(700)
      rec.space.deleteFlow = { dialog: await page.locator('.my-space-confirm-dialog').count(), focusInDialog: await page.evaluate(focused) }
      await page.screenshot({ path: path.join(OUT, `space-confirm${suffix}.png`) })
      await page.keyboard.press('Shift'); await page.locator('.my-space-confirm-dialog button').filter({ hasText: '取消' }).click(); await sleep(700)
      rec.space.deleteFlow.focusAfterCancel = await page.evaluate(focused)
      await page.evaluate(() => document.activeElement?.blur())
      await page.screenshot({ path: path.join(OUT, `space${suffix}.png`) })
    })

    rec.errors = errors
    result[`w${width}`] = rec
    await context.close()
  }
} finally {
  await browser.close(); await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT)); for (const k in result) console.log(k, 'missing', result[k].missing, 'errors', result[k].errors.length)
process.exit(0)
