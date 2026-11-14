#!/usr/bin/env node
// 生态物件第一轮 · 出对比图（对比稿，提案 · 单一来源，2026-11-14）。
//
// 做什么：读 ecosystem-round1/svg/ 下手写的物件 SVG（viewBox 0 0 240 240，240 = 獭獭头宽 1.0），
// 出三张图：
//   sheet.png      全套总图：浅雾底 #F1F5F7 和白底各一排；每样三个格子：160px 原框、48px 原框、48px 贴边裁
//   with-otter.png 全套按相对大小和獭獭头像（mascot/otter-head.svg）摆在同一条底线上
//   mono.png       全套转成墨色剪影，只看轮廓认不认得出
// 物件 SVG 和母版都只读，不改。
//
// 用法：node scripts/brand/ecosystem-sheet.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/ecosystem-round1/ 下的三张 PNG
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/ecosystem-round1')
const SVG_DIR = path.join(OUT, 'svg')
const OTTER_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// 顺序就是总图里的顺序：先石头（最要紧），再贝类，再别的
const ITEMS = [
  ['stone-otter', '獭獭的石头'],
  ['stone-long', '石头 · 扁长卵'],
  ['stone-round', '石头 · 圆墩'],
  ['stone-flat', '石头 · 小扁片'],
  ['clam', '蛤'],
  ['clam-open-on-stone', '敲开的蛤'],
  ['scallop', '扇贝'],
  ['urchin', '海胆'],
  ['kelp-blade', '巨藻叶带气囊'],
  ['starfish', '海星'],
  ['bubbles', '一串气泡'],
].map(([file, label]) => ({ file, label, svg: readFileSync(path.join(SVG_DIR, `${file}.svg`), 'utf8') }))

const INK = '#191D18'
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const withViewBox = (svg, vb) => svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`)
const toMono = (svg) => svg.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${INK}"`)
const css = 'body{margin:0;padding:28px;font:14px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#191D18;background:#fff}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 18px;color:#29424D}'

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 })

  // 先量每样东西画出来的边（getBBox），用于贴边裁和摆底线
  const otterSvg = readFileSync(OTTER_PATH, 'utf8')
  await page.setContent(`<div id="w">${ITEMS.map((it) => it.svg).join('')}${otterSvg}</div>`)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('#w > svg')].map((s) => {
      const b = s.getBBox()
      // 头像只量头那一条路径（含耳朵），作为「头宽 1.0」
      const head = s.querySelector('#_L9S-0__ziti071')
      const h = head ? head.getBBox() : null
      return { x: b.x, y: b.y, w: b.width, h: b.height, head: h && { x: h.x, w: h.width } }
    }),
  )
  const otterBox = boxes.pop()
  ITEMS.forEach((it, i) => {
    const b = boxes[i]
    const side = Math.max(b.w, b.h) + 8
    it.box = b
    it.tight = `${(b.x + b.w / 2 - side / 2).toFixed(1)} ${(b.y + b.h / 2 - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`
  })

  // ---- sheet.png ----
  const cell = (it, svg) => `<figure><div class="r"><img src="${uri(svg)}" width="160" height="160"><div class="s"><img src="${uri(svg)}" width="48" height="48"><img src="${uri(withViewBox(svg, it.tight))}" width="48" height="48"></div></div><figcaption>${it.label}<br><small>相对宽 ${(it.box.w / 240).toFixed(2)}</small></figcaption></figure>`
  const band = (bg, name) => `<section style="background:${bg}"><h2>${name}</h2><div class="g">${ITEMS.map((it) => cell(it, it.svg)).join('')}</div></section>`
  const sheetHtml = `<style>${css}section{padding:16px 16px 8px;margin-bottom:16px;border-radius:8px;outline:1px solid #E3E9EC}h2{font-size:14px;margin:0 0 8px;color:#29424D}.g{display:grid;grid-template-columns:repeat(6,226px);gap:12px 16px}figure{margin:0}.r{display:flex;gap:6px;align-items:flex-end}.s{display:flex;flex-direction:column;gap:6px}figcaption{padding-top:4px;font-size:13px}small{color:#29424D}</style>
<h1>生态物件 · 第一轮矢量（对比稿 · 提案）</h1><p class="sub">每样三格：160px 原框（240 = 獭獭头宽，物件按相对大小留白）、48px 原框、48px 贴边裁（当图标用时的大小）。只用品牌色，无描边、无渐变、无阴影。</p>
${band('#F1F5F7', '浅雾底 #F1F5F7（网站桌面）')}${band('#FFFFFF', '白底')}`
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.setContent(sheetHtml)
  await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true })

  // ---- with-otter.png ----
  const HEAD_PX = 200 // 獭獭头宽 1.0 = 200px
  const unit = HEAD_PX / 240 // 物件 SVG 每单位多少像素
  const otterScale = HEAD_PX / otterBox.head.w // 头像 SVG 每单位多少像素
  const BASE = 360 // 底线 y
  const GAP = 28
  let x = 40
  const placed = []
  // 头像：画到底边就是底线
  {
    const vb = otterSvg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
    const w = vb[2] * otterScale
    const h = vb[3] * otterScale
    const left = x - (otterBox.head.x - vb[0]) * otterScale
    placed.push(`<img src="${uri(otterSvg)}" style="left:${left}px;top:${BASE - h}px;width:${w}px;height:${h}px">`)
    placed.push(`<div class="lab" style="left:${x}px;width:${HEAD_PX}px">獭獭头像<br><small>头宽 1.0</small></div>`)
    placed.push(`<div class="ruler" style="left:${x}px;width:${HEAD_PX}px"></div>`)
    x += HEAD_PX + GAP + 12
  }
  for (const it of ITEMS) {
    const b = it.box
    const left = x - b.x * unit
    const top = BASE - (b.y + b.h) * unit
    placed.push(`<img src="${uri(it.svg)}" style="left:${left}px;top:${top}px;width:${240 * unit}px;height:${240 * unit}px">`)
    const w = b.w * unit
    placed.push(`<div class="lab" style="left:${x - 20}px;width:${w + 40}px">${it.label}<br><small>${(b.w / 240).toFixed(2)}</small></div>`)
    x += w + GAP
  }
  const W = Math.ceil(x + 20)
  const otterHtml = `<style>${css}.stage{position:relative;height:440px;width:${W}px}.stage img{position:absolute}.lab{position:absolute;top:${BASE + 14}px;text-align:center;font-size:13px}.lab small{color:#29424D}.ruler{position:absolute;top:${BASE + 4}px;height:4px;background:#29424D;border-radius:2px}.line{position:absolute;left:0;right:0;top:${BASE}px;height:1px;background:#C9D3D8}</style>
<h1>和獭獭摆在一起 · 按相对大小</h1><p class="sub">獭獭头宽（含耳朵）= 200px，物件按 README 里的相对宽度画；都落在同一条底线上。对比稿 · 提案。</p>
<div class="stage"><div class="line"></div>${placed.join('')}</div>`
  await page.setViewportSize({ width: W + 56, height: 600 })
  await page.setContent(otterHtml)
  await page.screenshot({ path: path.join(OUT, 'with-otter.png'), fullPage: true })

  // ---- mono.png ----
  const monoCell = (it) => {
    const m = toMono(it.svg)
    return `<figure><div class="r"><img src="${uri(withViewBox(m, it.tight))}" width="120" height="120"><img src="${uri(withViewBox(m, it.tight))}" width="48" height="48"><img src="${uri(withViewBox(m, it.tight))}" width="24" height="24"></div><figcaption>${it.label}</figcaption></figure>`
  }
  const monoHtml = `<style>${css}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:20px 16px}figure{margin:0}.r{display:flex;gap:10px;align-items:flex-end}figcaption{padding-top:4px;font-size:13px}</style>
<h1>单色剪影 · 只看轮廓</h1><p class="sub">所有颜色换成墨 ${INK}，里面的浅色细节全部消失。贴边裁，120 / 48 / 24px。对比稿 · 提案。</p><div class="g">${ITEMS.map(monoCell).join('')}</div>`
  await page.setViewportSize({ width: 1500, height: 600 })
  await page.setContent(monoHtml)
  await page.screenshot({ path: path.join(OUT, 'mono.png'), fullPage: true })
} finally {
  await browser.close()
}
console.log(`出了 sheet.png、with-otter.png、mono.png：${path.relative(ROOT, OUT)}`)
