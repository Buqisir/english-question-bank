#!/usr/bin/env node
// 行构件样张 + 键盘测试（构件厂，2026-11-15）。
// 舞台的做法和 surface-sheet.mjs 一样：用 Vite 的 build 把 app/src/shared-ui/Row.tsx 的真构件和真 CSS（连同 App.css 里
// FluidHoverList 的滑块）打成一页，放在 .scratch/component-inventory/row-harness/ 下，用 Playwright 的 route 当静态服务器。
// 画的是构件本身，不是仿样式。
//
// 样张（1440 和 390 各一张）：
// - 整行可点 · 按钮（就地展开，卷行内衬 10 / 14）：静止、悬停（真鼠标，滑块）、键盘焦点（整行目标）、按下（整行目标）、
//   焦点在次要键上（整行不垫底，只有键自己的焦点环）、展开着；
// - 整行可点 · 链接（打开另一页，首页行内衬 12 / 16）：静止、悬停、键盘焦点；
// - 小号 sm 44（卷行展开后里面的题组行）；
// - 不可点的行（列表里的一项，键各自是键）：静止、鼠标停在上面（没有悬停底）。
// 悬停用真鼠标（滑块要 JS 才动），一次只能停一处，所以悬停那一格单独拍一张再拼回去：样张整页拍两遍，第二遍鼠标停在悬停格上。
// 焦点、按下用 CDP CSS.forcePseudoState 强制在整行目标 / 次要键上。
//
// 键盘（#keys）：从「起点」按 Tab 一路走到「终点」，记下每一站（标签、读屏名字、aria-expanded、焦点环）；
// 在整行目标上按 Enter、空格，看整行计数；点次要键，看整行计数不动、键自己的计数加一；点行里的字，看整行计数加一；
// 链接行普通左键点走 onNavigate，Ctrl 点不走（交给浏览器开新标签）。结果写 row-keys.json。
//
// 用法：node scripts/component-inventory/row-sheet.mjs
// 输出：design/components-2026-11-13/migrate-row-toast/sheet-row-new.png、sheet-row-new-390.png、row-keys.json、row-sheet-styles.json
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { APP, RAW, ROOT, SRC, requireFromApp } from './lib.mjs'

const DIR = path.join(RAW, 'row-harness')
const DIST = path.join(DIR, 'dist')
const OUT_DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-row-toast')

const ENTRY = `
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '${SRC}/index.css'
import '${SRC}/App.css'
import { Row, RowList } from '${SRC}/shared-ui/Row.tsx'
import { Button } from '${SRC}/shared-ui/Button.tsx'

// 样张里的字照站上真实的几处写（卷行、首页行、题组行、文件行）。
const PAPERS = ['2026 新课标Ⅰ卷', '2025 新课标Ⅱ卷', '2024 全国甲卷']

function PaperRows({ id, onRow = () => {}, onSecondary = () => {}, expandedIndex = -1 }) {
  return (
    <RowList className="demo-list" id={id} aria-label="示意卷行">
      {PAPERS.map((title, i) => (
        <li key={title}>
          <Row
            as="div"
            className="demo-paper-row"
            data-index={i}
            action={{ kind: 'button', label: title, onClick: () => onRow(i), expanded: i === expandedIndex, controls: 'demo-detail-' + i }}
          >
            <span className="demo-title">{title}</span>
            <span className="demo-meta">4 篇章</span>
            <Button tone="strong" size="sm" className="demo-open" onClick={() => onSecondary('看整卷 ' + i)}>看整卷</Button>
          </Row>
        </li>
      ))}
    </RowList>
  )
}

function HomeRows({ id, onNavigate = () => {} }) {
  return (
    <RowList className="demo-list" id={id} aria-label="示意首页行">
      <Row className="demo-home-row" padding="home" action={{ kind: 'link', label: '继续组卷：期中复习，已选 3 个题组', href: '?view=draft-paper&draftPaperId=demo', onNavigate: () => onNavigate('草稿卷') }}>
        <span className="demo-title">期中复习</span><span className="demo-meta">3 题组 · 继续组卷 ›</span>
      </Row>
      <Row className="demo-home-row" padding="home" action={{ kind: 'link', label: '打开 2026 新课标Ⅰ卷 阅读 C', href: '?view=detail&groupId=demo-c', onNavigate: () => onNavigate('详情') }}>
        <span className="demo-title">阅读 C · 生态恢复</span><span className="demo-meta">2026 新课标Ⅰ卷 · 昨天 ›</span>
      </Row>
    </RowList>
  )
}

function GroupRows({ id, onRow = () => {}, onSecondary = () => {} }) {
  return (
    <RowList className="demo-list" id={id} aria-label="示意题组行">
      {['阅读 A · 旅行指南', '阅读 B · 人物传记'].map((title, i) => (
        <Row key={title} className="demo-group-row" padding="none" size="sm" action={{ kind: 'link', label: title + '，打开详情', href: '?view=detail&groupId=g' + i, onNavigate: () => onRow(i) }}>
          <span className="demo-title">{title}</span>
          <span className="demo-keys">
            <Button tone="subtle" size="sm" label="加入草稿卷" icon={<span aria-hidden="true">+</span>} onClick={() => onSecondary('加入 ' + i)} />
            <Button tone="subtle" size="sm" label="更多操作" icon={<span aria-hidden="true">⋯</span>} onClick={() => onSecondary('更多 ' + i)} />
          </span>
        </Row>
      ))}
    </RowList>
  )
}

function StaticRows({ id }) {
  return (
    <RowList className="demo-list" id={id} aria-label="示意文件行">
      {['1114 英语草稿卷-省纸版.pdf', '期中复习-大字版.pdf'].map((title) => (
        <Row key={title} className="demo-static-row" padding="paper">
          <span className="demo-title">{title}</span>
          <span className="demo-keys">
            <Button tone="subtle" size="sm">下载</Button>
            <Button tone="subtle" size="sm" label="更多操作" icon={<span aria-hidden="true">⋯</span>} />
          </span>
        </Row>
      ))}
    </RowList>
  )
}

const Cell = ({ cap, id, children }) => (
  <div className="cell" id={id}>
    <span className="cap">{cap}</span>
    {children}
  </div>
)

function Sheet() {
  return (
    <main>
      <h1>行 · 样张（shared-ui/Row.tsx）</h1>
      <p className="lead">直接把构件渲染出来，放在桌色底上的板里。行最小高 48（sm 44），行间 1px 分隔线；整行可点的行盖一块透明的真按钮 / 真链接（整行目标），次要键画在它上面。悬停是真鼠标（滑块），焦点、按下由浏览器强制。</p>

      <h2>整行可点 · 按钮（就地展开 / 收起，卷行内衬 10 / 14）</h2>
      <div className="grid">
        <Cell cap="静止"><PaperRows /></Cell>
        <Cell cap="悬停第二行（真鼠标，滑块铺桌色）" id="hover-paper"><PaperRows /></Cell>
        <Cell cap="键盘焦点在第二行的整行目标：整行垫桌色 + 2px 墨环向里 2px" id="focus-paper"><PaperRows /></Cell>
        <Cell cap="按下第二行（整行目标 :active）：垫深一档 border 色" id="active-paper"><PaperRows /></Cell>
        <Cell cap="焦点在第二行的次要键「看整卷」上：整行不垫底，只有键的焦点环" id="focus-secondary"><PaperRows /></Cell>
        <Cell cap="第一行展开着（aria-expanded=true；展开后的垫底归调用处）"><PaperRows expandedIndex={0} /></Cell>
      </div>

      <h2>整行可点 · 链接（打开另一页，首页行内衬 12 / 16）</h2>
      <div className="grid">
        <Cell cap="静止"><HomeRows /></Cell>
        <Cell cap="悬停第一行（真鼠标）" id="hover-home"><HomeRows /></Cell>
        <Cell cap="键盘焦点在第一行" id="focus-home"><HomeRows /></Cell>
        <Cell cap="按下第一行" id="active-home"><HomeRows /></Cell>
      </div>

      <h2>小号 sm 44（卷行展开后里面的题组行，内衬由调用处给）· 不可点的行</h2>
      <div className="grid">
        <Cell cap="sm · 静止"><GroupRows /></Cell>
        <Cell cap="sm · 键盘焦点在第一行" id="focus-group"><GroupRows /></Cell>
        <Cell cap="不可点 · 静止（键各自是键）"><StaticRows /></Cell>
        <Cell cap="不可点 · 鼠标停在第一行（没有悬停底，滑块不停）" id="hover-static"><StaticRows /></Cell>
      </div>
    </main>
  )
}

function Keys() {
  const [rowClicks, setRowClicks] = useState([])
  const [secondary, setSecondary] = useState([])
  const [nav, setNav] = useState([])
  return (
    <main>
      <p id="log" data-row={rowClicks.join(',')} data-secondary={secondary.join(',')} data-nav={nav.join(',')}>
        整行 {rowClicks.join(',')} · 次要键 {secondary.join(',')} · 站内跳转 {nav.join(',')}
      </p>
      <button id="start">起点</button>
      <PaperRows id="keys-paper" onRow={(i) => setRowClicks((l) => [...l, 'paper' + i])} onSecondary={(s) => setSecondary((l) => [...l, s])} />
      <HomeRows id="keys-home" onNavigate={(s) => setNav((l) => [...l, s])} />
      <GroupRows id="keys-group" onRow={(i) => setNav((l) => [...l, 'group' + i])} onSecondary={(s) => setSecondary((l) => [...l, s])} />
      <StaticRows id="keys-static" />
      <button id="end">终点</button>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode>{location.hash === '#keys' ? <Keys /> : <Sheet />}</StrictMode>)
`

// 舞台的排法写在这里，颜色和间距用 tokens.css 的变量。
const PAGE_CSS = `
body{margin:0;background:var(--eqb-color-bg);color:var(--eqb-color-text)}
main{padding:32px;max-width:1376px}
h1{font-size:20px;margin:0 0 4px;font-weight:600}
h2{font-size:15px;margin:28px 0 8px;font-weight:600}
.lead{margin:0 0 12px;color:var(--eqb-color-text-muted);font-size:13px;max-width:900px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.cell{padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.cell .cap{font-size:12px;color:var(--eqb-color-text-muted)}
.demo-paper-row,.demo-home-row,.demo-static-row{display:flex;align-items:center;gap:12px;font-size:14px}
.demo-group-row{display:flex;align-items:center;gap:12px;font-size:14px;padding:0 8px 0 14px}
.demo-title{flex:1 1 auto;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.demo-meta{color:var(--eqb-color-text-muted);font-size:13px;white-space:nowrap}
.demo-keys{display:flex;gap:4px}
#keys-paper,#keys-home,#keys-group,#keys-static{margin:12px 0;max-width:560px}
@media (max-width:600px){main{padding:16px}.grid{grid-template-columns:minmax(0,1fr)}}
`

async function buildHarness() {
  rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
  writeFileSync(path.join(DIR, 'entry.jsx'), ENTRY)
  writeFileSync(path.join(DIR, 'page.css'), PAGE_CSS)
  writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./page.css"><title>row harness</title></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>')
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
  const origin = 'http://row-harness.local'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
  await context.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url())
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
  })
  return `${origin}/`
}

async function force(cdp, root, selector, pseudo) {
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
  for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
  return nodeIds.length
}

await buildHarness()
mkdirSync(OUT_DIR, { recursive: true })
const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ channel: 'chromium' })
const keys = {}
const styles = {}
try {
  for (const [width, suffix] of [[1440, ''], [390, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const url = await serve(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url); await page.locator('main').waitFor()
    await page.evaluate(() => document.fonts.ready)
    const cdp = await context.newCDPSession(page)
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const forced = {
      focusPaper: await force(cdp, root, '#focus-paper .eqb-row[data-index="1"] > .eqb-row-hit', ['focus', 'focus-visible']),
      activePaper: await force(cdp, root, '#active-paper .eqb-row[data-index="1"] > .eqb-row-hit', ['hover', 'active']),
      focusSecondary: await force(cdp, root, '#focus-secondary .eqb-row[data-index="1"] .demo-open', ['focus', 'focus-visible']),
      focusHome: await force(cdp, root, '#focus-home li:first-child > .eqb-row-hit', ['focus', 'focus-visible']),
      activeHome: await force(cdp, root, '#active-home li:first-child > .eqb-row-hit', ['hover', 'active']),
      focusGroup: await force(cdp, root, '#focus-group li:first-child > .eqb-row-hit', ['focus', 'focus-visible']),
    }
    // 悬停：真鼠标。三处各停一次，各拍一张那一格的图，最后整页拍时鼠标停在卷行那格。
    const hoverAt = async (sel) => {
      // 前一格单拍时页面可能滚走了：先滚回来，坐标才落在视口里。
      await page.locator(sel).scrollIntoViewIfNeeded(); await page.waitForTimeout(100)
      const b = await page.locator(sel).boundingBox()
      await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.waitForTimeout(400)
    }
    await hoverAt('#hover-home li:first-child')
    await page.locator('#hover-home').screenshot({ path: path.join(RAW, `row-sheet-hover-home${suffix}.png`) })
    const hoverHomeShot = readFileSync(path.join(RAW, `row-sheet-hover-home${suffix}.png`)).toString('base64')
    await hoverAt('#hover-static li:first-child')
    await page.locator('#hover-static').screenshot({ path: path.join(RAW, `row-sheet-hover-static${suffix}.png`) })
    const hoverStaticShot = readFileSync(path.join(RAW, `row-sheet-hover-static${suffix}.png`)).toString('base64')
    styles[`hoverStaticSliderActive${suffix}`] = await page.evaluate(() => document.querySelectorAll('#hover-static [data-fluid-hover-active]').length)
    await hoverAt('#hover-paper .eqb-row[data-index="1"]')
    await page.locator('#hover-paper').screenshot({ path: path.join(RAW, `row-sheet-hover-paper${suffix}.png`) })
    const hoverPaperShot = readFileSync(path.join(RAW, `row-sheet-hover-paper${suffix}.png`)).toString('base64')
    await page.mouse.move(1, 1)
    // 整页截图会改视口，鼠标停的那一格会丢掉悬停：三格悬停图都先单拍，再贴回去（这三格的真样子就是刚才拍的）。
    await page.evaluate(([c, a, b]) => {
      for (const [id, data] of [['hover-paper', c], ['hover-home', a], ['hover-static', b]]) {
        const cell = document.getElementById(id)
        const list = cell.querySelector('.demo-list')
        const img = document.createElement('img')
        img.src = 'data:image/png;base64,' + data
        img.style.width = cell.getBoundingClientRect().width + 'px'
        img.style.margin = '-12px'
        cell.replaceChildren(img)
        void list
      }
    }, [hoverPaperShot, hoverHomeShot, hoverStaticShot])
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, `sheet-row-new${suffix}.png`), fullPage: true })
    styles[`forced${suffix}`] = forced
    styles[`rows${suffix}`] = await page.evaluate(() => [...document.querySelectorAll('.cell')].flatMap((c) => [...c.querySelectorAll('.eqb-row')].map((r) => {
      const cs = getComputedStyle(r), hit = r.querySelector(':scope > .eqb-row-hit'), hs = hit && getComputedStyle(hit), rect = r.getBoundingClientRect()
      return {
        cell: c.querySelector('.cap')?.textContent, row: r.textContent.slice(0, 16), height: Math.round(rect.height * 100) / 100,
        minHeight: cs.minHeight, padding: cs.padding, bg: cs.backgroundColor, borderTop: cs.borderTopWidth + ' ' + cs.borderTopColor,
        hit: hit ? { tag: hit.tagName.toLowerCase(), cursor: hs.cursor, outline: hs.outlineStyle === 'none' ? null : `${hs.outlineWidth} ${hs.outlineStyle} ${hs.outlineColor} @${hs.outlineOffset}` } : null,
      }
    })))
    console.log(width, errors.length ? errors : 'ok')
    await context.close()
  }

  // ── 键盘、点击 ──
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, locale: 'zh-CN' })
  const url = await serve(context)
  const page = await context.newPage()
  let popups = 0
  context.on('page', () => { popups += 1 })
  await page.goto(url + '#keys'); await page.locator('#start').waitFor()
  await page.locator('#start').focus()
  const stops = []
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab')
    const s = await page.evaluate(() => {
      const e = document.activeElement, cs = getComputedStyle(e)
      const row = e.closest('.eqb-row')
      return {
        id: e.id || null, tag: e.tagName.toLowerCase(), cls: e.className,
        name: e.getAttribute('aria-label') || e.textContent.trim(), expanded: e.getAttribute('aria-expanded'), href: e.getAttribute('href'),
        list: e.closest('.demo-list')?.id || null, row: row ? row.textContent.trim().slice(0, 14) : null,
        focusVisible: e.matches(':focus-visible'), outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}`,
        rowBg: row ? getComputedStyle(row).backgroundColor : null,
      }
    })
    stops.push(s)
    if (s.id === 'end') break
  }
  keys.tabOrder = stops
  keys.ariaSnapshot = {
    paper: await page.locator('#keys-paper').ariaSnapshot(),
    home: await page.locator('#keys-home').ariaSnapshot(),
    group: await page.locator('#keys-group').ariaSnapshot(),
    static: await page.locator('#keys-static').ariaSnapshot(),
  }
  const log = () => page.locator('#log').evaluate((e) => ({ row: e.dataset.row, secondary: e.dataset.secondary, nav: e.dataset.nav }))
  const hit0 = page.locator('#keys-paper .eqb-row[data-index="0"] > .eqb-row-hit')
  await hit0.focus(); await page.keyboard.press('Enter'); keys.afterEnter = await log()
  await page.keyboard.press(' '); keys.afterSpace = await log()
  await page.locator('#keys-paper .eqb-row[data-index="1"] .demo-open').click(); keys.afterSecondaryClick = await log()
  // 点行里的字：字在整行目标下面，真鼠标点在字的位置上（Playwright 的 locator.click 会说字被整行目标挡住，所以用坐标点）。
  const clickAt = async (sel, modifiers = []) => {
    const b = await page.locator(sel).boundingBox()
    for (const m of modifiers) await page.keyboard.down(m)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    for (const m of modifiers) await page.keyboard.up(m)
    await page.waitForTimeout(150)
  }
  await clickAt('#keys-paper .eqb-row[data-index="2"] .demo-title'); keys.afterTitleClick = await log()
  await page.locator('#keys-group li:first-child').getByRole('button', { name: '加入草稿卷' }).click(); keys.afterGroupAddClick = await log()
  await clickAt('#keys-home li:first-child .demo-title'); keys.afterHomeLeftClick = await log()
  keys.urlAfterHomeLeftClick = page.url()
  await clickAt('#keys-home li:nth-child(2) .demo-title', ['Control']); await page.waitForTimeout(800)
  keys.afterHomeCtrlClick = await log()
  keys.popupsAfterCtrlClick = popups
  // 点不可点的行：什么也不发生（没有整行目标）
  keys.staticRowHasHit = await page.locator('#keys-static .eqb-row-hit').count()
  await context.close()
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT_DIR, 'row-keys.json'), JSON.stringify(keys, null, 1) + '\n')
writeFileSync(path.join(OUT_DIR, 'row-sheet-styles.json'), JSON.stringify(styles, null, 1) + '\n')
console.log(JSON.stringify({ tab: keys.tabOrder.map((s) => `${s.list}:${s.tag}:${s.name}`), afterEnter: keys.afterEnter, afterSpace: keys.afterSpace, afterSecondaryClick: keys.afterSecondaryClick, afterTitleClick: keys.afterTitleClick, afterGroupAddClick: keys.afterGroupAddClick, afterHomeLeftClick: keys.afterHomeLeftClick, afterHomeCtrlClick: keys.afterHomeCtrlClick, popups: keys.popupsAfterCtrlClick }, null, 1))
process.exit(0)
