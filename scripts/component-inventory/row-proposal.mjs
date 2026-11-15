#!/usr/bin/env node
// 提案对照图：卷行展开后里面的题组行，现在 44 高（Row size="sm"，照原值）对 DESIGN.md §5 Rows 的最小高 48（构件厂，2026-11-15）。
// 只给 Owner 看，不改代码：在测试站浏览页展开第一套卷，拍那一块；再往页面里临时加一条样式把题组行垫到 48，拍同一块，左右拼一张。
//
// 用法：INVENTORY_PORT_OFFSET=66 INVENTORY_SEED=full node scripts/component-inventory/row-proposal.mjs
// 输出：design/components-2026-11-13/migrate-row-toast/proposal-group-row-48.png
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const OUT_DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-row-toast')
const TMP = path.join(RAW, 'row-proposal'); mkdirSync(TMP, { recursive: true })
const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const shots = []
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    await login(page, rig.base)
    await page.goto(rig.base + '/?view=browse'); await page.locator('.concierge-paper-row-head').first().waitFor({ timeout: 30000 }); await settle(page, 2000)
    await page.locator('.concierge-paper-row-head > .eqb-row-hit').first().click()
    await page.locator('.concierge-paper-row.is-expanded').first().waitFor({ timeout: 8000 }); await settle(page, 1200)
    await page.mouse.move(1, 1); await sleep(300)
    const li = page.locator('.concierge-paper-list > li').first()
    const a = path.join(TMP, `now-44${suffix}.png`); await li.screenshot({ path: a })
    const h44 = await page.locator('.concierge-group-row-line').first().evaluate((e) => e.getBoundingClientRect().height)
    await page.addStyleTag({ content: ".concierge-group-row-line.eqb-row[data-size='sm'] { min-height: 48px; }" }); await sleep(300)
    const b = path.join(TMP, `proposal-48${suffix}.png`); await li.screenshot({ path: b })
    const h48 = await page.locator('.concierge-group-row-line').first().evaluate((e) => e.getBoundingClientRect().height)
    shots.push({ width, a, b, h44, h48 })
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
// 拼版页颜色写死只在这个脚本里，不进产品代码。
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F3F6F8;font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#1B2B33;width:1552px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#5A6C75;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;align-items:start}
figure{margin:0;background:#fff;border-radius:12px;padding:12px}figcaption{font-size:12px;color:#5A6C75;margin-bottom:8px}img{display:block;max-width:100%;zoom:0.5}
</style><h1>提案：卷行展开后的题组行 44 → 48（不改代码，只给 Owner 看）</h1>
<p>左边是现在（Row size="sm"，最小高 44，照原值）；右边是照 DESIGN.md §5 Rows 最小高 48。浏览页第一套卷展开。</p>
${shots.map((s) => `<div class="pair"><figure><figcaption>${s.width} 宽 · 现在 44（实测行高 ${s.h44}）</figcaption><img src="${pathToFileURL(s.a).href}"></figure><figure><figcaption>${s.width} 宽 · 提案 48（实测行高 ${s.h48}）</figcaption><img src="${pathToFileURL(s.b).href}"></figure></div>`).join('')}`
const htmlFile = path.join(TMP, 'proposal.html'); writeFileSync(htmlFile, html)
const b2 = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const sp = await b2.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await sp.goto(pathToFileURL(htmlFile).href); await sp.waitForLoadState('load')
await sp.screenshot({ path: path.join(OUT_DIR, 'proposal-group-row-48.png'), fullPage: true })
await b2.close()
console.log(shots.map((s) => [s.width, s.h44, s.h48]))
process.exit(0)
