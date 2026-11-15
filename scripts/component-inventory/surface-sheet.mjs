#!/usr/bin/env node
// 卡片 / 板构件样张 + 键盘测试（构件厂，2026-11-15）。
// 舞台的做法和 field-harness.mjs 一样：用 Vite 的 build 把 app/src/shared-ui/Surface.tsx 的真构件和真 CSS 打成一页，
// 放在 .scratch/component-inventory/surface-harness/ 下，用 Playwright 的 route 当静态服务器。画的是构件本身，不是仿样式。
//
// 样张：板（装一列行 / 带内边距）、纸、可点的纸四种状态（静止、悬停、键盘焦点、按下），外加「不能点的卡片没有悬停」对照。
// 悬停、焦点、按下用 CDP CSS.forcePseudoState 强制。1440 和 390 各一张。
// 键盘：从「起点」键按 Tab，看焦点依次落到两张可点的纸上（不能点的板和纸不停），焦点框量出来；按 Enter、空格各点一次，
// 看点击计数加没加。结果写 keys.json。
//
// 用法：node scripts/component-inventory/surface-sheet.mjs
// 输出：design/components-2026-11-13/migrate-surface/sheet-surface-new.png、sheet-surface-new-390.png、keys.json
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { APP, RAW, ROOT, SRC, requireFromApp } from './lib.mjs'

const DIR = path.join(RAW, 'surface-harness')
const DIST = path.join(DIR, 'dist')
const OUT_DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-surface')

const ENTRY = `
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '${SRC}/index.css'
import '${SRC}/App.css'
import { Surface, SurfaceButton } from '${SRC}/shared-ui/Surface.tsx'

const Cell = ({ cap, force, id, children }) => (
  <div className="cell" data-force={force} id={id}>
    <span className="cap">{cap}</span>
    {children}
  </div>
)

// 样张里的字是示意，照站上真实的几处写（卷行、文件行）。
const Rows = () => (
  <Surface as="ul" aria-label="示意列表">
    <li className="demo-row">2026 新课标Ⅰ卷 <span>4 篇章</span></li>
    <li className="demo-row">2025 新课标Ⅱ卷 <span>4 篇章</span></li>
    <li className="demo-row">2024 全国甲卷 <span>4 篇章</span></li>
  </Surface>
)

const CardText = ({ title, meta }) => (
  <span className="demo-card"><span className="demo-card-title">{title}</span><span className="demo-card-meta">{meta}</span></span>
)

function Sheet() {
  const [clicks, setClicks] = useState(0)
  return (
    <main>
      <h1>卡片 / 板 · 样张（shared-ui/Surface.tsx）</h1>
      <p className="lead">直接把构件渲染出来，放在桌色底上；悬停、键盘焦点、按下由浏览器强制。两种样子：板（白底一圈 1px 边，不投影）和纸（白底 e1）。圆角都是 12。</p>

      <h2>板 board（e0）：装一组东西</h2>
      <div className="grid">
        <Cell cap="padding none · 里面是行（卷行列表、文件列表）"><Rows /></Cell>
        <Cell cap="padding md 16 · 一块说明加几个键（Agent 口令）">
          <Surface padding="md"><p className="demo-p">口令只显示这一次。</p><code>eqb_agent_xxxx</code></Surface>
        </Cell>
        <Cell cap="悬停（板不能点，没有悬停）" force="hover">
          <Surface padding="md" className="force-target"><p className="demo-p">鼠标停在上面，样子不变。</p></Surface>
        </Cell>
        <Cell cap="as=&quot;section&quot; + aria-labelledby（有标题）">
          <Surface as="section" padding="md" aria-labelledby="demo-h"><h3 id="demo-h" className="demo-h">本周已存</h3><p className="demo-p">2 份 PDF</p></Surface>
        </Cell>
      </div>

      <h2>纸 sheet（e1）：单独放在桌上的一张</h2>
      <div className="grid">
        <Cell cap="不能点 · 静止"><Surface variant="sheet" padding="md"><CardText title="已采用" meta="按卷面顺序排好了" /></Surface></Cell>
        <Cell cap="不能点 · 悬停（没有悬停）" force="hover"><Surface variant="sheet" padding="md" className="force-target"><CardText title="已采用" meta="按卷面顺序排好了" /></Surface></Cell>
      </div>

      <h2>可点的纸 SurfaceButton：整张是一个键</h2>
      <div className="grid">
        <Cell cap="静止"><SurfaceButton><CardText title="2026 新课标Ⅰ卷 阅读 C" meta="生态恢复 · 主旨概括" /></SurfaceButton></Cell>
        <Cell cap="悬停：垫桌色" force="hover"><SurfaceButton className="force-target"><CardText title="2026 新课标Ⅰ卷 阅读 C" meta="生态恢复 · 主旨概括" /></SurfaceButton></Cell>
        <Cell cap="键盘焦点：墨环 2px 外扩 2px" force="focus"><SurfaceButton className="force-target"><CardText title="2026 新课标Ⅰ卷 阅读 C" meta="生态恢复 · 主旨概括" /></SurfaceButton></Cell>
        <Cell cap="按下：垫桌色、缩到 0.99" force="active"><SurfaceButton className="force-target"><CardText title="2026 新课标Ⅰ卷 阅读 C" meta="生态恢复 · 主旨概括" /></SurfaceButton></Cell>
        <Cell cap="禁用"><SurfaceButton disabled><CardText title="2026 新课标Ⅰ卷 阅读 C" meta="生态恢复 · 主旨概括" /></SurfaceButton></Cell>
      </div>
      {location.hash === '#keys' && <div className="keys">
        <p className="lead" id="clicks">点击计数 {clicks}</p>
        <button id="start">起点</button>
        <Surface padding="md"><p className="demo-p">不能点的板</p></Surface>
        <SurfaceButton id="card-a" onClick={() => setClicks((n) => n + 1)}><CardText title="卡片 A" meta="可点" /></SurfaceButton>
        <Surface variant="sheet" padding="md"><p className="demo-p">不能点的纸</p></Surface>
        <SurfaceButton id="card-b" onClick={() => setClicks((n) => n + 1)}><CardText title="卡片 B" meta="可点" /></SurfaceButton>
        <button id="end">终点</button>
      </div>}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><Sheet /></StrictMode>)
`

// 舞台的排法写在这里，颜色和间距用 tokens.css 的变量。
const PAGE_CSS = `
body{margin:0;background:var(--eqb-color-bg);color:var(--eqb-color-text)}
main{padding:32px;max-width:1376px}
h1{font-size:20px;margin:0 0 4px;font-weight:600}
h2{font-size:15px;margin:28px 0 8px;font-weight:600}
.lead{margin:0 0 12px;color:var(--eqb-color-text-muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.cell{padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.cell .cap{font-size:12px;color:var(--eqb-color-text-muted)}
.demo-row{display:flex;justify-content:space-between;padding:12px 16px;font-size:14px}
.demo-row+.demo-row{border-top:1px solid var(--eqb-color-border-subtle)}
.demo-row span,.demo-card-meta{color:var(--eqb-color-text-muted);font-size:13px}
.demo-card{display:flex;flex-direction:column;gap:4px}
.demo-card-title{font-size:14px;font-weight:500}
.demo-p{margin:0 0 8px;font-size:13px}.demo-h{margin:0 0 4px;font-size:14px}
code{font-size:13px}
.keys{display:grid;gap:12px;max-width:360px;margin-top:16px}
@media (max-width:600px){main{padding:16px}.grid{grid-template-columns:minmax(0,1fr)}}
`

async function buildHarness() {
  rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
  writeFileSync(path.join(DIR, 'entry.jsx'), ENTRY)
  writeFileSync(path.join(DIR, 'page.css'), PAGE_CSS)
  writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./page.css"><title>surface harness</title></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>')
  const { build } = requireFromApp('vite')
  const react = requireFromApp('@vitejs/plugin-react')
  const nm = path.join(APP, 'node_modules')
  await build({
    root: DIR, configFile: false, logLevel: 'warn', base: './',
    plugins: [(react.default ?? react)()],
    resolve: { alias: [{ find: /^(react|react-dom)(\/.*)?$/, replacement: `${nm}/$1$2` }] },
    build: { outDir: DIST, emptyOutDir: true, minify: false },
  })
}

async function serve(context) {
  const origin = 'http://surface-harness.local'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
  await context.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url())
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
  })
  return `${origin}/`
}

await buildHarness()
mkdirSync(OUT_DIR, { recursive: true })
const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const keys = {}
try {
  for (const [width, suffix] of [[1440, ''], [390, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'no-preference' })
    const url = await serve(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url); await page.locator('main').waitFor()
    await page.evaluate(() => document.fonts.ready)
    const cdp = await context.newCDPSession(page)
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    for (const [force, pseudo] of [['hover', ['hover']], ['focus', ['focus', 'focus-visible']], ['active', ['hover', 'active']]]) {
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `.cell[data-force="${force}"] .force-target` })
      for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
    }
    await page.waitForTimeout(400) // 等 120ms 的过渡走完
    const shot = path.join(OUT_DIR, `sheet-surface-new${suffix}.png`)
    await page.screenshot({ path: shot, fullPage: true })
    // 实算样式：每格那张卡片的底、影子、变形、焦点框
    keys[`styles${suffix}`] = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((c) => {
      const e = c.querySelector('.eqb-surface'); const cs = getComputedStyle(e)
      return { cap: c.querySelector('.cap').textContent, bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, padding: cs.padding, transform: cs.transform, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}`, cursor: cs.cursor }
    }))
    console.log(width, errors.length ? errors : 'ok', shot)
    await context.close()
  }

  // ── 键盘 ──
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const url = await serve(context)
  const page = await context.newPage()
  await page.goto(url + '#keys'); await page.locator('#start').waitFor()
  await page.locator('#start').focus()
  const order = []
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(200)
    order.push(await page.evaluate(() => {
      const e = document.activeElement, cs = getComputedStyle(e)
      return { id: e.id, tag: e.tagName.toLowerCase(), focusVisible: e.matches(':focus-visible'), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}` }
    }))
    if (i === 0) {
      await page.locator('.keys').screenshot({ path: path.join(OUT_DIR, 'keys-focus-card-a.png') })
      await page.keyboard.press('Enter'); await page.waitForTimeout(150)
      keys.afterEnter = await page.locator('#clicks').textContent()
      await page.keyboard.press(' '); await page.waitForTimeout(150)
      keys.afterSpace = await page.locator('#clicks').textContent()
    }
  }
  keys.tabOrder = order
  await context.close()
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT_DIR, 'keys.json'), JSON.stringify(keys, null, 1) + '\n')
console.log(JSON.stringify({ tabOrder: keys.tabOrder, afterEnter: keys.afterEnter, afterSpace: keys.afterSpace }, null, 1))
process.exit(0)
