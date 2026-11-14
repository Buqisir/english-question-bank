#!/usr/bin/env node
// 胶囊构件样张：直接用 app/src/shared-ui 的 tokens.css + chip.css 排出两种变体的各个状态，
// 悬停、键盘焦点用 Chrome 的 CSS.forcePseudoState 强制出来（画的是真样式，不是另写的仿样式），
// 下面附上清点时的原样张 sheet-chip.png 对照。对比度按 WCAG 公式从实算颜色算。
// 用法：node scripts/component-inventory/chip-sheet.mjs
// 输出：design/components-2026-11-13/migrate-chip/sheet-chip-new.png
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, SRC, RAW, requireFromApp } from './lib.mjs'

const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-chip/sheet-chip-new.png')
const css = ['shared-ui/tokens.css', 'shared-ui/chip.css'].map((f) => readFileSync(path.join(SRC, f), 'utf8')).join('\n')
const OLD = pathToFileURL(path.join(ROOT, 'design/components-2026-11-13/sheet-chip.png')).href

const toggle = (text, { pressed = false, disabled = false, force = '' } = {}) =>
  `<button type="button" class="eqb-chip" data-kind="toggle" aria-pressed="${pressed}"${disabled ? ' disabled' : ''}${force ? ` data-force="${force}"` : ''}>${text}</button>`
const mark = (text) => `<span class="eqb-chip" data-kind="mark">${text}</span>`

const toggleStates = [
  ['默认', toggle('真题')],
  ['悬停', toggle('真题', { force: 'hover' })],
  ['键盘焦点', toggle('真题', { force: 'focus-visible' })],
  ['选中', toggle('2026', { pressed: true })],
  ['选中 · 悬停', toggle('2026', { pressed: true, force: 'hover' })],
  ['选中 · 键盘焦点', toggle('2026', { pressed: true, force: 'focus-visible' })],
  ['禁用', toggle('模拟', { disabled: true })],
  ['禁用 · 选中', toggle('模拟', { pressed: true, disabled: true })],
]
const markStates = [
  ['默认（桌色页面上）', mark('同话题：人与自然')],
  ['放在白卡里', `<span class="card">${mark('同篇位 A')} ${mark('真题')} ${mark('含 3 题')}</span>`],
  ['窄栏里折行', `<span class="card narrow">${mark('同话题：人与自然')}</span>`],
]

const html = `<!doctype html><meta charset="utf-8"><style>${css}
body{margin:0;padding:32px;background:var(--eqb-color-bg);font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif;color:var(--eqb-color-text);width:1400px}
h1{font-size:20px;margin:0 0 4px;font-weight:600}h2{font-size:15px;margin:28px 0 4px;font-weight:600}p{margin:0 0 12px;color:var(--eqb-color-text-muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.cell{background:var(--eqb-color-bg);border:1px solid var(--eqb-color-border);border-radius:var(--eqb-radius-card);padding:16px 16px 10px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.cell .cap{font-size:12px;color:var(--eqb-color-text-muted)}.cell .num{font-size:12px;color:var(--eqb-color-text-muted);font-variant-numeric:tabular-nums}
.card{display:inline-flex;flex-wrap:wrap;gap:4px;background:var(--eqb-color-paper);padding:8px;border-radius:var(--eqb-radius-control)}.card.narrow{width:96px}
.old{margin-top:28px}.old img{width:1400px;display:block;border:1px solid var(--eqb-color-border);border-radius:var(--eqb-radius-control)}
</style>
<h1>胶囊构件 · 样张（shared-ui/Chip.tsx）</h1>
<p>直接用 tokens.css + chip.css 排出；悬停、键盘焦点由浏览器强制出来。对比度按 WCAG 公式从实算颜色算（字对胶囊自己的底；底透明时对桌面）。圆角一律 --eqb-radius-pill（999px）。</p>
<h2>ChipToggle · 筛选 / 切换（可点，button + aria-pressed）</h2>
<p>高 28、字 13。默认白底细边次要灰字；悬停垫桌色、字提到墨色；选中是实的：桌色底、墨字、600；键盘焦点 2px 石板墨环、离 2px；禁用整体 0.55。</p>
<div class="grid">${toggleStates.map(([c, h]) => `<div class="cell"><span class="cap">${c}</span>${h}<span class="num"></span></div>`).join('')}</div>
<h2>Chip · 状态标记（不可点，span）</h2>
<p>只是告诉老师一件事，要轻：桌色底、次要灰字、12px、一行高 24，无边无影，指针不变，不进 Tab 顺序。</p>
<div class="grid">${markStates.map(([c, h]) => `<div class="cell"><span class="cap">${c}</span>${h}<span class="num"></span></div>`).join('')}</div>
<div class="old"><h2>原来（清点时的 sheet-chip.png）</h2><p>chip-01 是顶栏头像（现在已换成獭獭图，不是胶囊）；chip-02 是浏览页筛选胶囊；chip-03 / chip-04 是草稿丸（改用 Button，对照见 compare-basket.png）。</p><img src="${OLD}"></div>`

const file = path.join(RAW, 'sheet-chip-new.html'); writeFileSync(file, html)
const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1464, height: 900 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(file).href); await page.waitForLoadState('load')
const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
for (const force of ['hover', 'focus-visible']) {
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `[data-force="${force}"]` })
  for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: force === 'focus-visible' ? ['focus', 'focus-visible'] : ['hover'] })
}
// 对比度：字色对胶囊底（透明时往上找到不透明的底）。
await page.evaluate(() => {
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0)) return c.slice(0, 3) } return [255, 255, 255] }
  for (const cell of document.querySelectorAll('.cell')) {
    const chips = [...cell.querySelectorAll('.eqb-chip')]
    const out = chips.slice(0, 1).map((e) => {
      const cs = getComputedStyle(e)
      const a = lum(parse(cs.color)), b = lum(bgOf(e))
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      return `字 ${cs.color.replace(/\s/g, '')} 底 ${bgOf(e).join(',')} · ${ratio.toFixed(2)} : 1${cs.opacity !== '1' ? `（整体 ${cs.opacity}，不计）` : ''} · 高 ${Math.round(e.getBoundingClientRect().height)}`
    })
    cell.querySelector('.num').textContent = out.join('')
  }
})
await page.waitForTimeout(300)
await page.screenshot({ path: OUT, fullPage: true })
await browser.close()
console.log(OUT)
