#!/usr/bin/env node
// 底部提示 / 撤销（Toast）换上前后对照（构件厂，2026-11-15）。
// 草稿卷里移出一个题组，拍底部的「题组已移出 · 撤销」提示：宽屏 1440 和窄屏 390 各一遍，整页 + 提示那一块的裁图，
// 记下提示的实算样式（位置、宽高、底、影子、圆角）和读屏属性（role、aria-live）。
// 换上以后（标签不是 before 开头）再记：鼠标停在提示上、焦点在撤销键上时，过了原来的停留时长（8 秒）还在不在。
//
// 用法：node scripts/component-inventory/toast-shots.mjs <标签>
// 输出：.scratch/component-inventory/toast/<标签>/
// 端口：INVENTORY_PORT_OFFSET（这一轮用 66）；默认测试数据。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!label || !/^[\w-]+$/.test(label)) { console.error('用法：toast-shots.mjs <标签>'); process.exit(2) }
const OUT = path.join(RAW, 'toast', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const AFTER = !label.startsWith('before')

function measureToast() {
  const e = document.querySelector('.draft-undo-toast[data-visible="true"]')
  if (!e) return null
  const cs = getComputedStyle(e), r = e.getBoundingClientRect()
  const live = e.closest('[aria-live]')
  return {
    text: e.textContent,
    rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
    bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, transition: cs.transition,
    role: (e.closest('[role]') || {}).getAttribute?.('role') ?? null,
    live: live ? live.getAttribute('aria-live') : null,
    liveIsAncestor: Boolean(live && live !== e),
  }
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const measures = {}
const missing = []
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const step = async (name, fn) => { try { await fn() } catch (e) { missing.push(`w${width} ${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    await login(page, rig.base)
    await addDraftItems(page)
    const removeOne = async () => {
      const t = page.locator('[aria-label="更多题组操作"]').first(); await t.waitFor({ timeout: 150000 }); await t.click(); await sleep(300)
      await page.locator('[role=menuitem],button').filter({ hasText: /移除/ }).first().click({ timeout: 8000 })
      await page.locator('.draft-undo-toast[data-visible="true"]').first().waitFor({ timeout: 15000 }); await sleep(600)
    }
    await step('removed', async () => {
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-paper-col').first().waitFor({ timeout: 120000 }); await settle(page, 3000)
      await removeOne()
      await page.mouse.move(2, 2); await sleep(200)
      await page.screenshot({ path: path.join(OUT, `draft-removed-page${suffix}.png`) })
      const t = page.locator('.draft-undo-toast[data-visible="true"]').first()
      const b = await t.boundingBox()
      await page.screenshot({ path: path.join(OUT, `draft-removed-toast${suffix}.png`), clip: { x: Math.max(0, b.x - 24), y: b.y - 24, width: Math.min(width, b.width + 48), height: Math.min(height - (b.y - 24), b.height + 48) } })
      measures[`removed${suffix}`] = await page.evaluate(measureToast)
      if (AFTER) {
        // 鼠标停在提示上：过了 8 秒还在
        await t.hover(); await sleep(9000)
        measures[`removed-hover-9s${suffix}`] = { visible: await page.locator('.draft-undo-toast[data-visible="true"]').count() }
        await page.screenshot({ path: path.join(OUT, `draft-removed-toast-hover${suffix}.png`), clip: { x: Math.max(0, b.x - 24), y: b.y - 24, width: Math.min(width, b.width + 48), height: Math.min(height - (b.y - 24), b.height + 48) } })
        await page.mouse.move(2, 2); await sleep(9000)
        measures[`removed-left-9s${suffix}`] = { visible: await page.locator('.draft-undo-toast[data-visible="true"]').count() }
      }
      // 撤销回去，草稿卷还原成三组
      if (await page.locator('.draft-undo-toast[data-visible="true"] button').count()) {
        await page.locator('.draft-undo-toast[data-visible="true"] button').filter({ hasText: '撤销' }).click(); await settle(page, 2000)
      } else { await addDraftItems(page) }
    })
    if (errors.length) missing.push(`w${width} 页面报错 ${errors.length} 条：${errors[0].slice(0, 200)}`)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(measures, null, 1) + '\n')
writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify(missing, null, 1) + '\n')
console.log('missing', missing, measures)
console.log('写到', OUT)
process.exit(0)
