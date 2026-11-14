#!/usr/bin/env node
// 默认头像换成獭獭（BRAND.md §7 第 105 条）· 真实页面的顶栏截图，改之前和改之后。
// 起本地网站（照 scripts/component-inventory/rig.mjs，端口偏移默认 47），用清点用的 Owner 账号登录，拍顶栏右半边。
// 「改之前」只在无头浏览器里把 img 换回原来的深薄荷底首字母圆，不改源码。
// 用法：node scripts/brand/avatar-shot.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/avatar-default/topbar-{before,after}-{1x,2x}.png、compare.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/avatar-default')
mkdirSync(OUT, { recursive: true })
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '47'
const { requireFromApp } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const shots = {}
try {
  for (const dpr of [1, 2]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr })
    await p.goto(rig.base + '/'); await p.locator('#login-username').waitFor({ timeout: 30000 })
    await p.locator('#login-username').fill(OWNER.username); await p.locator('#login-password').fill(OWNER.password)
    await p.locator('.login-submit').click(); await p.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
    await p.locator('img.topbar-avatar').waitFor({ timeout: 30000 }); await sleep(1200)
    const tb = await p.locator('header.topbar').boundingBox()
    const clip = { x: tb.x + tb.width - 520, y: tb.y, width: 520, height: tb.height }
    shots[`after-${dpr}x`] = await p.screenshot({ clip })
    await p.evaluate(() => {
      const img = document.querySelector('img.topbar-avatar'); const name = document.querySelector('.topbar-username').textContent
      const s = document.createElement('span'); s.textContent = name.slice(0, 2)
      s.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#2C6E56;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:600;flex-shrink:0'
      img.replaceWith(s)
    })
    shots[`before-${dpr}x`] = await p.screenshot({ clip })
    await p.close()
  }
  for (const [k, b] of Object.entries(shots)) writeFileSync(path.join(OUT, `topbar-${k}.png`), b)
  const u = (b) => 'data:image/png;base64,' + b.toString('base64')
  const big = 'data:image/svg+xml;base64,' + readFileSync(path.join(ROOT, 'app/public/brand/avatar.svg')).toString('base64')
  const p = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 })
  await p.setContent(`<style>body{margin:0;padding:24px;background:#F1F5F7;font:14px system-ui;color:#1B2B33}h2{font-size:14px;margin:18px 0 8px}img.s{display:block;border:1px solid #D5DEE3}.r{display:flex;gap:16px;align-items:center}.c{border-radius:50%}</style>
  <h2>顶栏右半边 · 改之前（普通屏、高清屏）</h2><img class="s" src="${u(shots['before-1x'])}" width="520"><img class="s" src="${u(shots['before-2x'])}" width="1040" style="margin-top:6px">
  <h2>改之后（普通屏、高清屏）</h2><img class="s" src="${u(shots['after-1x'])}" width="520"><img class="s" src="${u(shots['after-2x'])}" width="1040" style="margin-top:6px">
  <h2>头像放大看：28、56、112 像素</h2><div class="r"><img class="c" src="${big}" width="28"><img class="c" src="${big}" width="56"><img class="c" src="${big}" width="112"></div>`)
  await p.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
} finally {
  await browser.close(); await rig.stop()
}
console.log('出图：' + path.relative(ROOT, OUT))
