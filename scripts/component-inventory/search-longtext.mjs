// 浏览页搜索框长字核对（2026-11-15）：有清除键时字不能钻到 ✕ 底下。
// 用法：INVENTORY_PORT_OFFSET=64 node scripts/component-inventory/search-longtext.mjs <输出目录>
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const OUT = process.argv[2]
if (!OUT) { console.error('用法：search-longtext.mjs <输出目录>'); process.exit(2) }
mkdirSync(OUT, { recursive: true })
const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  await login(page, rig.base)
  await page.goto(rig.base + '/?view=browse'); await settle(page, 2000)
  const input = page.locator('.concierge-intent-input').first()
  await input.fill('高二上学期期中考试阅读理解科技类说明文，难度中等偏上，带七选五')
  await page.keyboard.press('End'); await sleep(300)
  const b = await page.locator('.concierge-intent-bar').first().boundingBox()
  await page.screenshot({ path: path.join(OUT, 'browse-search-longtext.png'), clip: { x: b.x - 16, y: b.y - 16, width: b.width + 32, height: b.height + 32 } })
  await context.close()
} finally { await browser.close(); await rig.stop?.() }
