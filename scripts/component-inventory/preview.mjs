#!/usr/bin/env node
// 构件厂第一批（按钮、菜单）· 样张和客观检查。不改网站，不加页面：用网站自己的 Vite 配置起一个只拍照的服务，
// 把 preview-sheet.js 当虚拟模块挂上去，渲染 app/src/shared-ui 里的真构件。
//
// 做四件事：
//   1. 样张：每个选项、每种状态各拍一张（悬停 / 焦点 / 按下用浏览器调试协议强制出来）→ batch-1/sheet-*.png
//   2. 对上清点：构件每个选项的实算样子，按清点同样的容差和 38 种现有按钮、4 种现有菜单面板逐一比，
//      算出迁移时哪些处样子不变、哪些会变、差在哪 → batch-1/mapping.json
//   3. 客观检查：WCAG 对比度（字 4.5、焦点环 3）、点击区域 24×24、读屏名字、axe-core → batch-1/checks.json
//   4. 行为：键盘开菜单、方向键跳过禁用项、Esc / Tab / 点外面 / 滚动关菜单、焦点回触发键、一次只开一个、
//      贴边翻转不出屏、忙的时候点不动、减少动态效果 → batch-1/checks.json
// 用法：node scripts/component-inventory/preview.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { APP, OUT, DATA, requireFromApp, resolveFromApp } from './lib.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BATCH = path.join(OUT, 'batch-1')
mkdirSync(BATCH, { recursive: true })
const PORT = 5310
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const vite = await import(resolveFromApp('vite'))
const { chromium } = requireFromApp('playwright')

// ---------- 服务 ----------
const VIRTUAL = 'virtual:eqb-shared-ui-preview'
const previewPlugin = {
  name: 'eqb-shared-ui-preview',
  resolveId: (id) => (id === VIRTUAL ? '\0' + VIRTUAL : null),
  load: (id) => (id === '\0' + VIRTUAL ? readFileSync(path.join(HERE, 'preview-sheet.js'), 'utf8') : null),
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__preview')) return next()
      const html = await server.transformIndexHtml(req.url, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>构件样张</title></head><body><div id="root"></div><script type="module" src="/@id/__x00__${VIRTUAL}"></script></body></html>`)
      res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html)
    })
  },
}
const server = await vite.createServer({
  configFile: path.join(APP, 'vite.config.ts'), root: APP, logLevel: 'error', plugins: [previewPlugin],
  server: { host: '127.0.0.1', port: PORT, strictPort: true, watch: { ignored: () => true }, hmr: false },
})
await server.listen()
const URL_ = `http://127.0.0.1:${PORT}/__preview`

// ---------- 颜色和容差（和 analyze.mjs 的聚类容差一样：ΔE76 ≤ 3、圆角 ±1、字号 ±0.5、高 ±2、左右内边距 ±2） ----------
const rgba = (c) => {
  if (!c) return null
  if (c === 'transparent') return [0, 0, 0, 0]
  const hx = String(c).match(/^#([0-9a-f]{6})(?:\/(\d+)%)?$/i)
  if (hx) return [0, 2, 4].map((i) => parseInt(hx[1].slice(i, i + 2), 16)).concat(hx[2] ? Number(hx[2]) / 100 : 1)
  const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}
const lab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92 }
  const [R1, G1, B1] = [f(r), f(g), f(b)]
  const X = (R1 * 0.4124 + G1 * 0.3576 + B1 * 0.1805) / 0.95047, Y = R1 * 0.2126 + G1 * 0.7152 + B1 * 0.0722, Z = (R1 * 0.0193 + G1 * 0.1192 + B1 * 0.9505) / 1.08883
  const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * g3(Y) - 16, 500 * (g3(X) - g3(Y)), 200 * (g3(Y) - g3(Z))]
}
const dE = (a, b) => { if (!a || !b) return 99; if ((a[3] < 0.02) !== (b[3] < 0.02)) return 99; if (a[3] < 0.02) return 0; const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b); return Math.hypot(l1 - l2, a1 - a2, b1 - b2) + Math.abs(a[3] - b[3]) * 100 }
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const contrast = (fg, bg) => { const a = fg[3] ?? 1; const c = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); const L1 = lum(c), L2 = lum(bg); return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 }
const hex = (c) => { const v = rgba(c); if (!v) return c; if (v[3] < 0.02) return 'transparent'; return '#' + v.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase() + (v[3] < 1 ? `/${Math.round(v[3] * 100)}%` : '') }
const px = (v) => parseFloat(v) || 0
const visibleBorder = (b) => (Array.isArray(b) ? b : [b]).filter((x) => x && x !== 'none' && !/transparent|rgba\([^)]*,\s*0\)/.test(x))

// 一个构件选项和一种清点变体比：返回差别列表（空 = 容差内一样），或 null 表示超出容差。
function compareLook(c, v) {
  const diffs = []
  const d1 = dE(rgba(c.bg), rgba(v.bg)); if (d1 > 3) diffs.push(`底色 ${v.bg} → ${c.bg}`)
  const d2 = dE(rgba(c.color), rgba(v.color)); if (d2 > 3) diffs.push(`字色 ${v.color} → ${c.color}`)
  const vr = v.radius.map(px), cr = c.radius.map(px)
  if (Math.max(...vr.map((x, i) => Math.abs(x - (cr[i] ?? cr[0])))) > 1 && !(vr.every((x) => x >= 999) && cr.every((x) => x >= 999))) diffs.push(`圆角 ${v.radius.join('/')} → ${c.radius.join('/')}`)
  if ((v.shadow === 'none') !== (c.shadow === 'none') || (v.shadow !== 'none' && v.shadow !== c.shadow)) diffs.push(`影子 ${v.shadow} → ${c.shadow}`)
  if (visibleBorder(v.border).length !== visibleBorder(c.border).length) diffs.push(`边线 ${visibleBorder(v.border).join(' ') || '无'} → ${visibleBorder(c.border).join(' ') || '无'}`)
  if (v.icon !== 'icon-only') {
    const [vs, vw] = v.font.split('/').map(Number), [cs, cw] = c.font.split('/').map(Number)
    if (Math.abs(vs - cs) > 0.5 || vw !== cw) diffs.push(`字 ${v.font} → ${c.font}`)
  }
  if (v.height != null && c.height != null) {
    if (Math.abs(v.height - c.height) > 2) diffs.push(`高 ${v.height} → ${c.height}`)
    if (v.padX && c.padX && Math.max(...v.padX.map((x, i) => Math.abs(px(x) - px(c.padX[i])))) > 2) diffs.push(`左右内边距 ${v.padX.join('/')} → ${c.padX.join('/')}`)
  }
  if (v.icon !== c.icon) diffs.push(`图标 ${v.icon} → ${c.icon}`)
  return diffs
}

// ---------- 页面里量 ----------
function measure(sel) {
  const els = [...document.querySelectorAll(sel)]
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
  const over = (t, b) => { const a = t[3] + b[3] * (1 - t[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (t[i] * t[3] + b[i] * b[3] * (1 - t[3])) / a).concat(a) }
  const effBg = (el) => { const chain = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let c = [255, 255, 255, 1]; for (let i = chain.length - 1; i >= 0; i--) c = over(chain[i], c); return c.map((v, i) => (i < 3 ? Math.round(v) : 1)) }
  return els.map((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect()
    const text = (el.innerText || '').trim()
    const host = el.closest('[data-cell],[data-state-cell],[data-menu],[data-fluid-row]')
    return {
      cell: host?.getAttribute('data-cell') || host?.getAttribute('data-state-cell') || host?.getAttribute('data-menu') || (host ? 'fluid' : null),
      tag: el.tagName.toLowerCase(), text: text.slice(0, 40), name: el.getAttribute('aria-label') || text,
      bg: cs.backgroundColor, color: cs.color, effBg: effBg(el), parentBg: el.parentElement ? effBg(el.parentElement) : null,
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
      shadow: cs.boxShadow, border: ['Top', 'Right', 'Bottom', 'Left'].map((s) => (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' ? `${cs[`border${s}Width`]} ${cs[`border${s}Style`]} ${cs[`border${s}Color`]}` : 'none')),
      font: `${parseFloat(cs.fontSize)}/${cs.fontWeight}`, padX: [cs.paddingRight, cs.paddingLeft], pad: cs.padding,
      height: Math.round(r.height), width: Math.round(r.width), rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      icon: el.querySelector(':scope > svg') ? (text ? 'icon+text' : 'icon-only') : 'none',
      outline: cs.outlineStyle === 'none' ? null : { w: parseFloat(cs.outlineWidth), color: cs.outlineColor, offset: parseFloat(cs.outlineOffset) },
      opacity: cs.opacity, transform: cs.transform, animation: cs.animationName, cursor: cs.cursor,
    }
  })
}
const shadowName = (s, tokens) => (s === 'none' ? 'none' : Object.entries(tokens).find(([, v]) => v === s)?.[0] || 'custom')

// ---------- 跑 ----------
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const checks = { generated: 'node scripts/component-inventory/preview.mjs', contrast: [], target: [], names: [], focus: [], axe: [], behavior: [] }
const ok = (name, pass, detail = '') => { checks.behavior.push({ name, pass: !!pass, detail }); return pass }
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(URL_); await page.waitForSelector('[data-cell] .eqb-button')
  await page.evaluate(() => document.fonts.ready)
  const tokens = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); const p = document.createElement('div'); document.body.appendChild(p); const o = {}; for (const n of ['--elev-1', '--elev-2', '--elev-3']) { p.style.boxShadow = `var(${n})`; o[n] = getComputedStyle(p).boxShadow } p.remove(); return o })

  // 1. 静止的选项
  const options = (await page.evaluate(measure, '[data-cell] .eqb-button')).map((m) => ({ ...m, look: { bg: hex(m.bg), color: hex(m.color), radius: m.radius, shadow: shadowName(m.shadow, tokens), border: m.border, font: m.font, height: m.height, padX: m.padX, icon: m.icon } }))

  // 2. 强制状态
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const FORCE = { hover: ['hover'], focus: ['focus', 'focus-visible'], active: ['active', 'hover'] }
  for (const [st, pseudo] of Object.entries(FORCE)) {
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `[data-state-cell$="|${st}"] .eqb-button` })
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
  }
  // 会滑的列表：真鼠标停在第二个上
  const fluidSecond = page.locator('[data-fluid-row] .eqb-button').nth(1)
  await fluidSecond.hover(); await page.waitForTimeout(300)
  const states = await page.evaluate(measure, '[data-state-cell] .eqb-button')
  const fluid = await page.evaluate(measure, '[data-fluid-row] .eqb-button')
  const fluidRow = await page.evaluate(() => { const el = document.querySelector('[data-fluid-row]'); const b = getComputedStyle(el, '::before'); return { opacity: b.opacity, bg: b.backgroundColor, w: b.width } })
  // 字在不在高亮上面：高亮带 pointer-events:none，elementFromPoint 量不出层次，只能看像素。
  // 截下第二个按钮的字，交给页面里的 canvas 数深色像素（字被盖住时只剩一片桌色）。
  const fluidLabel = page.locator('[data-fluid-row] .eqb-button').nth(1).locator('.eqb-button-label')
  const fluidShot = (await fluidLabel.screenshot()).toString('base64')
  const fluidDark = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] < 300) n++
    return n
  }, fluidShot)
  const fluidOnTop = fluidDark > 20

  // 样张 1：按钮
  const box = async (sel) => page.locator(sel).boundingBox()
  const [a, b, f] = [await box('[data-section="options"]'), await box('[data-section="states"]'), await box('[data-section="fluid"]')]
  const top = (await box('h1')).y - 12
  await page.screenshot({ path: path.join(BATCH, 'sheet-button.png'), clip: { x: 0, y: top, width: Math.max(a.width, b.width) + 48, height: f.y + f.height - top + 16 } })

  // 3. 对比度、点击区域、名字、焦点环
  for (const m of [...options, ...states.filter((s) => !/\|(disabled)$/.test(s.cell))]) {
    const fg = rgba(m.color), bg = m.effBg
    const hasText = m.icon !== 'icon-only'
    const c = contrast(fg, bg)
    checks.contrast.push({ cell: m.cell, color: hex(m.color), bg: hex(`rgb(${bg.join(',')})`), ratio: c, need: hasText ? 4.5 : 3, pass: c >= (hasText ? 4.5 : 3) })
    checks.target.push({ cell: m.cell, w: m.width, h: m.height, pass: m.width >= 24 && m.height >= 24 })
    checks.names.push({ cell: m.cell, name: m.name, pass: !!m.name })
  }
  for (const m of states.filter((s) => /\|focus$/.test(s.cell))) {
    const ring = m.outline
    const ringC = ring ? contrast(rgba(ring.color), m.parentBg) : 0
    checks.focus.push({ cell: m.cell, outline: ring ? `${ring.w}px ${hex(ring.color)} @${ring.offset}` : '无', ringContrast: ringC, pass: !!ring && ring.w >= 2 && ringC >= 3 })
  }

  // 4. 菜单（先清掉强制状态）
  for (const [st] of Object.entries(FORCE)) {
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `[data-state-cell$="|${st}"] .eqb-button` })
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
  }
  await page.mouse.move(5, 5)
  const trigger = page.locator('[data-menu="icon"] .eqb-button')
  await trigger.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('.eqb-menu'); await page.waitForTimeout(250)
  const active = () => page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '').trim())
  ok('回车打开菜单，焦点落到第一项', (await active()) === '下载 DOCX', await active())
  const exp = await trigger.getAttribute('aria-expanded'), ctl = await trigger.getAttribute('aria-controls'), menuId = await page.locator('.eqb-menu').getAttribute('id')
  ok('打开时触发键 aria-expanded=true、aria-controls 指向菜单', exp === 'true' && ctl === menuId, `${exp} ${ctl} ${menuId}`)
  const panel = (await page.evaluate(measure, '.eqb-menu'))[0]
  const items = await page.evaluate(measure, '.eqb-menu .eqb-menu-item')
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
  const at3 = await active()
  // 键盘焦点在「删除这份卷」上时拍一张：焦点环 + 危险项
  const focusItem = (await page.evaluate(measure, '.eqb-menu-item:focus-visible'))[0]
  const menuBox = await box('.eqb-menu'), trigBox = await box('[data-menu="icon"]'), textBox = await box('[data-menu="text"]')
  // 菜单可能翻到触发键上方，所以框取触发键、文字菜单键和菜单三者的并集。
  const mx = Math.min(trigBox.x, menuBox.x) - 24, my = Math.min(trigBox.y, textBox.y, menuBox.y) - 24
  const mBottom = Math.max(trigBox.y + trigBox.height, textBox.y + textBox.height, menuBox.y + menuBox.height)
  await page.screenshot({ path: path.join(BATCH, 'sheet-menu.png'), clip: { x: mx, y: my, width: Math.max(textBox.x + textBox.width, menuBox.x + menuBox.width) - mx + 24, height: mBottom - my + 24 } })
  ok('↓ 跳过禁用的「改名」，到「删除这份卷」', at3 === '删除这份卷', at3)
  await page.keyboard.press('ArrowDown'); ok('最后一项再 ↓ 回到第一项', (await active()) === '下载 DOCX', await active())
  await page.keyboard.press('End'); ok('End 到最后一项', (await active()) === '删除这份卷', await active())
  await page.keyboard.press('Home'); ok('Home 到第一项', (await active()) === '下载 DOCX', await active())
  await page.keyboard.press('ArrowUp'); ok('第一项再 ↑ 到最后一项', (await active()) === '删除这份卷', await active())
  checks.focus.push({ cell: 'menu-item', outline: focusItem?.outline ? `${focusItem.outline.w}px ${hex(focusItem.outline.color)} @${focusItem.outline.offset}` : '无', ringContrast: focusItem?.outline ? contrast(rgba(focusItem.outline.color), focusItem.effBg) : 0, pass: !!focusItem?.outline && focusItem.outline.w >= 2 && contrast(rgba(focusItem.outline.color), focusItem.effBg) >= 3 })
  for (const it of items) {
    const c = contrast(rgba(it.color), it.effBg)
    const disabled = /禁用/.test(it.text)
    checks.contrast.push({ cell: `menu-item:${it.text}`, color: hex(it.color), bg: hex(`rgb(${it.effBg.join(',')})`), ratio: c, need: disabled ? '（禁用项不要求）' : 4.5, pass: disabled || c >= 4.5 })
    checks.target.push({ cell: `menu-item:${it.text}`, w: it.width, h: it.height, pass: it.width >= 24 && it.height >= 24 })
  }
  // axe：菜单开着时整页跑
  await page.addScriptTag({ content: axeSource })
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  })
  checks.axe = axe
  await page.keyboard.press('Escape'); await page.waitForTimeout(50)
  ok('Esc 关菜单，焦点回触发键', (await page.locator('.eqb-menu').count()) === 0 && (await active()) === '更多操作', await active())
  ok('关上后 aria-expanded=false', (await trigger.getAttribute('aria-expanded')) === 'false')

  await trigger.click(); await page.waitForSelector('.eqb-menu'); await page.waitForTimeout(50)
  await page.keyboard.press('Tab'); await page.waitForTimeout(50)
  ok('Tab 关菜单，焦点回触发键', (await page.locator('.eqb-menu').count()) === 0 && (await active()) === '更多操作', await active())

  await trigger.click(); await page.waitForSelector('.eqb-menu')
  await page.mouse.click(700, 960); await page.waitForTimeout(50)
  ok('点外面关菜单，焦点不抢回触发键', (await page.locator('.eqb-menu').count()) === 0 && (await active()) !== '更多操作', await active())

  await trigger.click(); await page.waitForSelector('.eqb-menu')
  await page.evaluate(() => document.dispatchEvent(new Event('scroll'))); await page.waitForTimeout(50)
  ok('外面滚动关菜单', (await page.locator('.eqb-menu').count()) === 0)

  await trigger.click(); await page.waitForSelector('.eqb-menu')
  await page.locator('[data-menu="text"] .eqb-button').click(); await page.waitForTimeout(50)
  ok('开第二个菜单时第一个自动关上（一次只开一个）', (await page.locator('.eqb-menu').count()) === 1 && (await page.locator('.eqb-menu').getAttribute('aria-label')) === '导出')
  const textPanel = await box('.eqb-menu'), textTrig = await box('[data-menu="text"] .eqb-button')
  ok('align=start：面板左边和触发键左边对齐', Math.abs(textPanel.x - textTrig.x) < 1, `${textPanel.x} vs ${textTrig.x}`)
  await page.keyboard.press('Escape')

  await page.evaluate(() => { window.__picked = [] })
  await trigger.click(); await page.waitForSelector('.eqb-menu'); await page.waitForTimeout(50)
  await page.locator('.eqb-menu-item', { hasText: '改名' }).click({ force: true }); await page.waitForTimeout(50)
  ok('点禁用项：不触发，菜单不关', (await page.evaluate(() => window.__picked.length)) === 0 && (await page.locator('.eqb-menu').count()) === 1)
  await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await page.waitForTimeout(50)
  ok('回车选中一项：触发、关菜单、焦点回触发键', (await page.evaluate(() => window.__picked.join(','))) === 'docx' && (await page.locator('.eqb-menu').count()) === 0 && (await active()) === '更多操作', await page.evaluate(() => window.__picked.join(',')))

  await page.locator('[data-state-cell="primary|busy"] .eqb-button').click({ force: true }); await page.waitForTimeout(30)
  ok('忙的时候点不动（aria-busy、aria-disabled）', (await page.evaluate(() => window.__picked.length)) === 1 && (await page.locator('[data-state-cell="primary|busy"] .eqb-button').getAttribute('aria-busy')) === 'true')

  const edge = page.locator('[data-menu="edge"] .eqb-button')
  await edge.click(); await page.waitForSelector('.eqb-menu'); await page.waitForTimeout(250)
  const ep = await box('.eqb-menu'), side = await page.locator('.eqb-menu').getAttribute('data-side')
  ok('贴右下角：面板翻到上面、不出屏（1440 宽）', side === 'above' && ep.x >= 8 && ep.x + ep.width <= 1440 - 8 + 0.5 && ep.y >= 8, `${side} ${JSON.stringify(ep)}`)
  await page.keyboard.press('Escape')
  ok('页面没有报错', errors.length === 0, errors.join(' | '))

  // 窄屏
  await page.setViewportSize({ width: 390, height: 760 }); await page.waitForTimeout(100)
  await edge.click(); await page.waitForSelector('.eqb-menu'); await page.waitForTimeout(250)
  const np = await box('.eqb-menu')
  ok('窄屏 390：面板不出屏', np.x >= 8 && np.x + np.width <= 390 - 8 + 0.5 && np.y >= 8 && np.y + np.height <= 760 - 8 + 0.5, JSON.stringify(np))
  const narrowItems = await page.evaluate(measure, '.eqb-menu .eqb-menu-item')
  ok('窄屏菜单项高 ≥ 24、字不截断', narrowItems.every((i) => i.height >= 24) && (await page.evaluate(() => [...document.querySelectorAll('.eqb-menu-item-label')].every((l) => l.scrollWidth <= l.clientWidth))))
  await page.screenshot({ path: path.join(BATCH, 'sheet-menu-narrow.png'), clip: { x: 0, y: Math.max(0, np.y - 24), width: 390, height: Math.min(760, 760 - Math.max(0, np.y - 24)) } })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1000 })

  // 减少动态效果
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await trigger.click(); await page.waitForSelector('.eqb-menu')
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.eqb-menu')).animationName)
  await page.keyboard.press('Escape')
  const { nodeIds: act } = await cdp.send('DOM.querySelectorAll', { nodeId: (await cdp.send('DOM.getDocument', { depth: -1 })).root.nodeId, selector: '[data-state-cell="quiet|active"] .eqb-button' })
  await cdp.send('CSS.forcePseudoState', { nodeId: act[0], forcedPseudoClasses: ['active', 'hover'] })
  const tf = await page.evaluate(() => getComputedStyle(document.querySelector('[data-state-cell="quiet|active"] .eqb-button')).transform)
  ok('减少动态效果：菜单不做入场动画，按下不缩', anim === 'none' && tf === 'none', `${anim} ${tf}`)
  await ctx.close()

  // ---------- 对上清点 ----------
  const INV = JSON.parse(readFileSync(path.join(DATA, 'inventory.json'), 'utf8'))
  const opt = options.map((o) => ({ option: o.cell, look: o.look }))
  // 清点按「直接子元素是不是 svg」认图标；图标包了两层的方形按钮（左右内边距 0）记成了「无图标」，这里按只有图标算
  const iconMode = (l) => (l.icon === 'none' && l.padX?.every((x) => px(x) === 0) && l.height <= 32 ? 'icon-only' : l.icon)
  const buttons = INV.variants.filter((v) => v.kind === 'button' && !v.seed).map((v) => {
    const vl = { ...v.look, icon: iconMode(v.look) }
    const scored = opt.map((o) => ({ option: o.option, h: Math.abs(o.look.height - v.look.height), diffs: compareLook(o.look, vl) })).sort((x, y) => x.diffs.length - y.diffs.length || x.h - y.h)
    const best = scored[0]
    return { id: v.id, count: v.count, mainline: v.mainline, jobs: v.jobs.slice(0, 2).map(([j, n]) => `${j} ${n}`), class: v.primaryClass, look: `${v.look.bg} / ${v.look.color} ${v.look.font} 圆角 ${v.look.radius.join('/')} 高 ${v.look.height} ${vl.icon}`,
      same: best.diffs.length === 0 ? scored.filter((s) => s.diffs.length === 0).map((s) => s.option) : [], nearest: best.option, changes: best.diffs }
  })
  const panelLook = { bg: hex(panel.bg), color: hex(panel.color), radius: panel.radius, shadow: shadowName(panel.shadow, tokens), border: panel.border, font: panel.font, height: null, padX: null, icon: 'none' }
  const menus = INV.variants.filter((v) => v.kind === 'dialog' && v.jobs.some(([j]) => j === '菜单')).map((v) => ({ id: v.id, count: v.count, mainline: v.mainline, class: v.primaryClass, jobs: v.jobs.map(([j, n]) => `${j} ${n}`),
    changes: compareLook({ ...panelLook, font: v.look.font }, v.look) }))
  const sum = (xs) => xs.reduce((n, x) => n + x.count, 0)
  const mapping = {
    generated: 'node scripts/component-inventory/preview.mjs', tolerance: '和清点聚类一样：色 ΔE76 ≤ 3、圆角 ±1、字号 ±0.5 且字重相同、高 ±2、左右内边距 ±2；透明边线算没有边；只有图标的不比字号',
    buttons: { variants: buttons.length, instances: sum(buttons), unchangedVariants: buttons.filter((b) => b.same.length).length, unchangedInstances: sum(buttons.filter((b) => b.same.length)),
      mainlineInstances: sum(buttons.filter((b) => b.mainline)), mainlineUnchanged: sum(buttons.filter((b) => b.mainline && b.same.length)), list: buttons },
    menus: { panel: { ...panelLook, padding: panel.pad }, items: items.map((i) => ({ text: i.text, radius: i.radius[0], height: i.height, font: i.font, color: hex(i.color) })), list: menus },
    options: opt,
  }
  writeFileSync(path.join(BATCH, 'mapping.json'), JSON.stringify(mapping, null, 1) + '\n')
  checks.states = states.map((s) => ({ cell: s.cell, bg: hex(s.bg), color: hex(s.color), outline: s.outline ? `${s.outline.w}px ${hex(s.outline.color)} @${s.outline.offset}` : null, opacity: s.opacity, transform: s.transform, cursor: s.cursor }))
  checks.fluid = { buttons: fluid.map((m) => ({ text: m.text, bg: hex(m.bg), color: hex(m.color) })), highlight: { ...fluidRow, bg: hex(fluidRow.bg) } }
  ok('会滑的列表里：按钮的字画在列表高亮上面，没被盖住', fluidOnTop, `字框里深色像素 ${fluidDark} 个`)
  ok('会滑的列表里：悬停底由列表画（列表高亮可见），按钮自己不垫底、字提到墨色', Number(fluidRow.opacity) > 0.5 && fluid[1].bg === 'rgba(0, 0, 0, 0)' && hex(fluid[1].color) === '#1B2B33', `${JSON.stringify(fluidRow)} ${fluid[1].bg} ${hex(fluid[1].color)}`)
  const summary = {
    contrastFail: checks.contrast.filter((c) => !c.pass).length, targetFail: checks.target.filter((c) => !c.pass).length, nameFail: checks.names.filter((c) => !c.pass).length,
    focusFail: checks.focus.filter((c) => !c.pass).length, axe: checks.axe.map((v) => `${v.id}×${v.nodes.length}`), behaviorFail: checks.behavior.filter((b) => !b.pass).map((b) => b.name), behaviorTotal: checks.behavior.length,
  }
  checks.summary = summary
  writeFileSync(path.join(BATCH, 'checks.json'), JSON.stringify(checks, null, 1) + '\n')
  console.log(JSON.stringify(summary, null, 1))
  console.log(`按钮：${mapping.buttons.unchangedVariants}/${mapping.buttons.variants} 种、${mapping.buttons.unchangedInstances}/${mapping.buttons.instances} 处换成构件后样子不变（主线 ${mapping.buttons.mainlineUnchanged}/${mapping.buttons.mainlineInstances}）`)
  for (const m of menus) console.log(`菜单 ${m.id}（${m.count} 处）：${m.changes.length ? m.changes.join('；') : '不变'}`)
} finally {
  await browser.close()
  await server.close()
}
