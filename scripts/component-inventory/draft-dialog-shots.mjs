#!/usr/bin/env node
// 草稿卷剩下的按钮换构件前后对照（构件厂第 4 步第七页）：「保存 PDF 到个人空间」对话框里的
// 「关闭」「新建」「取消」「保存」。拍静止、悬停、键盘焦点、「新建」禁用 / 可用，宽屏 1440 和窄屏 390；
// 量出位置和实算样式。
//
// 用法：node scripts/component-inventory/draft-dialog-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-draft-rest/<before|after>/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：draft-dialog-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-draft-rest', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope svg')
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
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    }
  })
}

const focused = () => {
  const e = document.activeElement
  return e ? `${e.tagName.toLowerCase()} ${(e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0, 30)}` : null
}

const DIALOG = '.draft-save-space-dialog'
const BUTTONS = `${DIALOG} button`
// 对话框里按出现顺序：关闭、新建、取消、保存。
const KEYS = ['close', 'new', 'cancel', 'save']

// 个人空间文件夹列表换成固定的两个（只拦 GET）；新建文件夹、保存都不点。
const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [
    { id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T },
    { id: 'folder-b', name: '期中复习', artifactCount: 0, createdAt: T, updatedAt: T },
  ],
  artifacts: [],
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => { try { await fn() } catch (e) { rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`) } }
    const dialog = page.locator(DIALOG)
    const shot = async (name) => {
      const b = await dialog.boundingBox()
      if (!b) return
      const pad = 16, vp = page.viewportSize()
      const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
      await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: Math.min(vp.width, b.x + b.width + pad) - x0, height: Math.min(vp.height, b.y + b.height + pad) - y0 } })
    }
    await login(page, rig.base)
    await addDraftItems(page)

    await step('open', async () => {
      await page.goto(rig.base + '/?view=draft-paper')
      await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 }); await settle(page, 1500); await park()
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(500)
      await page.getByRole('menuitem', { name: '保存 PDF 到个人空间' }).click()
      await dialog.waitFor(); await page.locator(`${DIALOG} select option`).nth(1).waitFor({ state: 'attached' }); await sleep(700)
      rec.openFocus = await page.evaluate(focused)
      await blur(); await park()
      await page.screenshot({ path: path.join(OUT, `page${suffix}.png`) })
      await shot(`dialog${suffix}`)
      rec.dialog = await page.evaluate(measure, DIALOG)
      rec.buttons = await page.evaluate(measure, BUTTONS)
    })

    await step('new-enabled', async () => {
      await page.locator(`${DIALOG} input[aria-label="新建文件夹"]`).fill('高三二班'); await sleep(250); await blur(); await park()
      await shot(`dialog-filled${suffix}`)
      rec.buttonsFilled = await page.evaluate(measure, BUTTONS)
    })

    if (!suffix) {
      for (const [i, key] of KEYS.entries()) {
        await step(`hover-${key}`, async () => {
          await page.locator(BUTTONS).nth(i).hover(); await sleep(350)
          await shot(`hover-${key}`)
          rec[`${key}Hover`] = (await page.evaluate(measure, BUTTONS))[i]
          await park()
        })
        await step(`focus-${key}`, async () => {
          await keyFocus(page.locator(BUTTONS).nth(i))
          await shot(`focus-${key}`)
          rec[`${key}Focus`] = (await page.evaluate(measure, BUTTONS))[i]
          await blur()
        })
      }
      await step('tab-order', async () => {
        await page.locator(`${DIALOG} input`).first().focus()
        const order = []
        for (let k = 0; k < 6; k += 1) { await page.keyboard.press('Tab'); await sleep(80); order.push(await page.evaluate(focused)) }
        rec.tabOrder = order
        await blur()
      })
    }

    await step('close', async () => {
      await page.locator(BUTTONS).nth(2).click(); await sleep(500)
      rec.closedAfterCancel = (await dialog.count()) === 0
      rec.focusAfterCancel = await page.evaluate(focused)
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
