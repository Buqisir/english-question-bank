#!/usr/bin/env node
// 个人空间页的按钮换构件前后对照（构件厂第 4 步第六页）：文件行「下载」「打开原草稿」、空态「去找题」、
// 出错态「重新加载」、删除确认框「取消」「删除 PDF」。左边文件夹栏没换，只在整页图里带上。
// 拍静止、悬停、键盘焦点、下载中，宽屏 1440 和窄屏 390；量出位置和实算样式。
//
// 用法：node scripts/component-inventory/space-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-space/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：space-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-space', label)
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
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, cursor: cs.cursor, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined, busy: e.getAttribute('aria-busy') || undefined,
    }
  })
}

const focused = () => {
  const e = document.activeElement
  return e ? `${e.tagName.toLowerCase()} ${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30)}` : null
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

// 和 menu-shots.mjs 同一份假数据：本地网站的个人空间是空的，真去出 PDF 要等一两分钟。
// 列表接口按 mode 换成有文件 / 空 / 出错三种；下载文件接口拖 2.5 秒再报 503，用来拍「下载中」。删除接口不拦，脚本也不点。
const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [{ id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T }],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}

const ROW = '.my-space-file-row'
const ROW_ACTIONS = `${ROW}:first-of-type .my-space-row-actions > button`
const DIALOG_ACTIONS = '.my-space-confirm-actions > button'
const CTA = '.my-space-empty-state button'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    let mode = 'list'
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      if (mode === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'rig: 个人空间暂时不可用' }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'empty' ? { folders: [], artifacts: [] } : SNAPSHOT) })
    })
    await context.route(/\/api\/my-space\/artifacts\/[^/]+\/file$/, async (route) => {
      await sleep(2500)
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'rig: 不真下载' }) }).catch(() => {})
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    // 键盘焦点：先按一下 Shift，让浏览器认为是键盘在操作，:focus-visible 才会生效。
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    const goto = async (m) => { mode = m; await page.goto(rig.base + '/?view=my-space'); await settle(page, 1500); await park() }
    await login(page, rig.base)

    await step('list', async () => {
      await goto('list')
      await page.screenshot({ path: path.join(OUT, `page${suffix}.png`) })
      const row = page.locator(ROW).first()
      await shotAround(page, `row${suffix}`, [row], 12)
      rec.rowActions = await page.evaluate(measure, ROW_ACTIONS)
      await row.locator('h3').hover(); await sleep(350)
      await shotAround(page, `row-hover${suffix}`, [row], 12)
      rec.rowHover = await page.evaluate(measure, ROW_ACTIONS)
      await park()
    })

    if (!suffix) {
      for (const [i, key] of [[0, 'download'], [1, 'open']]) {
        await step(`row-${key}`, async () => {
          const row = page.locator(ROW).first()
          const btn = page.locator(ROW_ACTIONS).nth(i)
          await btn.hover(); await sleep(350)
          await shotAround(page, `row-${key}-hover`, [row], 12)
          rec[`${key}Hover`] = (await page.evaluate(measure, ROW_ACTIONS))[i]
          await park()
          await keyFocus(btn)
          await shotAround(page, `row-${key}-focus`, [row], 12)
          rec[`${key}Focus`] = (await page.evaluate(measure, ROW_ACTIONS))[i]
          await blur()
        })
      }
    }

    await step('busy', async () => {
      const row = page.locator(ROW).first()
      await page.locator(ROW_ACTIONS).first().click(); await sleep(700); await park()
      await shotAround(page, `row-busy${suffix}`, [row], 12)
      rec.busy = await page.evaluate(measure, ROW_ACTIONS)
      if (!suffix) {
        await page.locator(ROW_ACTIONS).first().hover(); await sleep(350)
        await shotAround(page, 'row-busy-hover', [row], 12)
        rec.busyHover = (await page.evaluate(measure, ROW_ACTIONS))[0]
        await park()
      }
      await sleep(2600)
      rec.afterBusy = { message: await page.locator('.my-space-message').first().innerText().catch(() => null) }
    })

    await step('confirm', async () => {
      await goto('list')
      const trigger = page.locator(`${ROW}:first-of-type [aria-haspopup="menu"]`)
      await keyFocus(trigger); await page.keyboard.press('Enter'); await sleep(400)
      await page.keyboard.press('ArrowDown'); await sleep(150); await page.keyboard.press('Enter'); await sleep(700)
      const dialog = page.locator('.my-space-confirm-dialog')
      rec.confirmFocus = await page.evaluate(focused)
      await shotAround(page, `confirm${suffix}`, [dialog], 16)
      rec.confirm = await page.evaluate(measure, DIALOG_ACTIONS)
      if (!suffix) {
        await page.keyboard.press('Tab'); await sleep(250)
        rec.confirmTabFocus = await page.evaluate(focused)
        await shotAround(page, 'confirm-delete-focus', [dialog], 16)
        rec.confirmDeleteFocus = (await page.evaluate(measure, DIALOG_ACTIONS))[1]
        await blur()
        for (const [i, key] of [[0, 'cancel'], [1, 'delete']]) {
          await page.locator(DIALOG_ACTIONS).nth(i).hover(); await sleep(350)
          await shotAround(page, `confirm-${key}-hover`, [dialog], 16)
          rec[`confirm${key}Hover`] = (await page.evaluate(measure, DIALOG_ACTIONS))[i]
        }
        await park()
      }
      await page.locator(DIALOG_ACTIONS).first().click(); await sleep(700)
      rec.focusAfterCancel = await page.evaluate(focused)
    })

    for (const m of ['empty', 'error']) {
      await step(m, async () => {
        await goto(m)
        const box = page.locator('.my-space-empty-state')
        await shotAround(page, `${m}${suffix}`, [box], 16)
        rec[m] = await page.evaluate(measure, CTA)
        if (!suffix) {
          const cta = page.locator(CTA).first()
          await cta.hover(); await sleep(350)
          await shotAround(page, `${m}-hover`, [box], 16)
          rec[`${m}Hover`] = (await page.evaluate(measure, CTA))[0]
          await park()
          await keyFocus(cta)
          await shotAround(page, `${m}-focus`, [box], 16)
          rec[`${m}Focus`] = (await page.evaluate(measure, CTA))[0]
          await blur()
        }
      })
    }

    rec.errors = errors
    result[`w${width}`] = rec
    console.log(`w${width} missing`, rec.missing, 'errors', errors.length)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1))
console.log('写到', path.relative(ROOT, OUT))
