#!/usr/bin/env node
// 獭獭眼睛取证和对比稿（design/brand-2026-10-13/texture-backcheck-2026-11-14/）。提案 · 单一来源。
// 只读母版和逐格画版，在副本上改眼睛；不改 mascot/、logo/、app/ 下任何文件。
//
// 用法：node scripts/brand/eye-study.mjs            全部重跑（量母版、出对比稿、起本地网站拍真实页面）
//       node scripts/brand/eye-study.mjs --no-site  不起本地网站，只量矢量和逐格画版、出对比稿
// 端口：照 scripts/component-inventory/rig.mjs 起本地网站，端口偏移默认 44（网页 5343、接口 9956）。
// 输出：<OUT>/eyes/  对比稿 SVG、逐格备选、对比图、检查图、measure-*.json
//       <OUT>/shots/ 真实页面取证（1x、2x 原尺寸和 8 倍逐像素放大）、换图试穿、measure-shots.json
// 量法都写在 README.md 第一部分；这里的数都从 SVG 坐标、PNG 像素和截图像素里算出来。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const OUT = path.join(BRAND, 'texture-backcheck-2026-11-14')
const EYES = path.join(OUT, 'eyes'), SHOTS = path.join(OUT, 'shots')
const NO_SITE = process.argv.includes('--no-site')
for (const d of [EYES, SHOTS, path.join(EYES, 'svg'), path.join(EYES, 'pixel')]) mkdirSync(d, { recursive: true })

if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '44'
const { requireFromApp, RAW } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const b64 = (s) => Buffer.from(s).toString('base64')
const svgUrl = (s) => 'data:image/svg+xml;base64,' + b64(s)
const pngUrl = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64')
const r2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100)
const r3 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000)
const json = (f, o) => writeFileSync(f, JSON.stringify(o, null, 1) + '\n')

// ---------------------------------------------------------------- 要量的文件
const B = 'design/brand-2026-10-13'
const VECTORS = [
  { id: 'otter-head', file: `${B}/mascot/otter-head.svg`, kind: 'head' },
  { id: 'mark-mint', file: `${B}/logo/mint/mark.svg`, kind: 'mark' },
  { id: 'app-icon', file: `${B}/mascot/app-icon.svg`, kind: 'icon' },
  { id: 'otter-front', file: `${B}/mascot/otter-front.svg`, kind: 'body' },
  ...['peek-login', 'state-01-idle', 'state-02-searching', 'state-03-offer', 'state-04-done', 'state-05-not-found']
    .map((n) => ({ id: n, file: `${B}/mascot/states/${n}.svg`, kind: 'body' })),
  { id: 'login-otter-v11', file: 'app/src/auth/login-otter.svg', kind: 'body', ink: ['#29424D'], head: ['#FFFFFF'], face: ['#DCEDF5'] },
]
const PIXELS = [
  { id: 'app-icon-16 (= favicon-16)', file: `${B}/mascot/small/app-icon-16.png` },
  { id: 'app-icon-32 (= favicon-32)', file: `${B}/mascot/small/app-icon-32.png` },
  { id: 'otter-head-16', file: `${B}/mascot/small/otter-head-16.png` },
  { id: 'otter-head-32', file: `${B}/mascot/small/otter-head-32.png` },
  { id: 'mark-16 (mint)', file: `${B}/logo/mint/mark-16.png` },
  { id: 'mark-32 (mint, = 顶栏 1x)', file: `${B}/logo/mint/mark-32.png` },
  { id: 'mark-16-mono', file: `${B}/logo/mark-16-mono.png`, mono: true },
  { id: 'mark-32-mono', file: `${B}/logo/mark-32-mono.png`, mono: true },
]

// ---------------------------------------------------------------- 浏览器里跑的量具
// 全部在 SVG 自己的根坐标里算：轮廓用 getPointAtLength 取点，里外用 isPointInFill，裁切路径也算进去。
const PAGE_LIB = String.raw`
const INK0 = ['#191D18'], MINT0 = ['#72BFA4'], FACE0 = ['#F2FAF6']
const norm = (c) => (c || '').trim().toUpperCase()
function mount(svgText) {
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;width:1000px;height:1000px'
  host.innerHTML = svgText; document.body.appendChild(host)
  const svg = host.querySelector('svg'); svg.setAttribute('width', '1000'); svg.setAttribute('height', '1000')
  return { host, svg }
}
function toRoot(svg, el) { return svg.getScreenCTM().inverse().multiply(el.getScreenCTM()) }
function clipOk(svg, el, p) {
  for (let a = el; a && a !== svg.parentNode; a = a.parentElement) {
    const cp = a.getAttribute && a.getAttribute('clip-path'); if (!cp) continue
    const id = cp.match(/#([^)]+)/)[1], clip = svg.querySelector('#' + CSS.escape(id)); if (!clip) continue
    const loc = new DOMPoint(p.x, p.y).matrixTransform(toRoot(svg, a).inverse())
    let inside = false
    for (const s of clip.children) if (s.isPointInFill && s.isPointInFill(new DOMPoint(loc.x, loc.y))) inside = true
    if (!inside) return false
  }
  return true
}
function inFill(svg, el, p) {
  const loc = new DOMPoint(p.x, p.y).matrixTransform(toRoot(svg, el).inverse())
  return el.isPointInFill(new DOMPoint(loc.x, loc.y)) && clipOk(svg, el, p)
}
function outline(svg, el, step) {
  const m = toRoot(svg, el), pts = []
  if (el.tagName === 'ellipse' || el.tagName === 'circle') {
    const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy')
    const rx = +(el.getAttribute('rx') || el.getAttribute('r')), ry = +(el.getAttribute('ry') || el.getAttribute('r'))
    for (let i = 0; i < 360; i++) { const t = i / 360 * 2 * Math.PI; pts.push(new DOMPoint(cx + rx * Math.cos(t), cy + ry * Math.sin(t)).matrixTransform(m)) }
  } else {
    const L = el.getTotalLength(), n = Math.min(6000, Math.max(200, Math.ceil(L / step)))
    for (let i = 0; i < n; i++) { const q = el.getPointAtLength(L * i / n); pts.push(new DOMPoint(q.x, q.y).matrixTransform(m)) }
  }
  return pts.filter((p) => clipOk(svg, el, p))
}
function bbox(pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } }
function minDist(a, b) { let d = Infinity; for (const p of a) for (const q of b) { const e = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (e < d) d = e } return Math.sqrt(d) }
function circDist(c, r, pts) { let d = Infinity; for (const q of pts) d = Math.min(d, Math.hypot(q.x - c.x, q.y - c.y)); return d - r }
function shapeArea(svg, els, box, n) {
  // 网格取样：box 里 n×n 个点落在 els 任一个里的比例
  let hit = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = { x: box.x0 + (i + .5) / n * box.w, y: box.y0 + (j + .5) / n * box.h }
    if (els.some((e) => inFill(svg, e, p))) hit++
  }
  return hit / (n * n) * box.w * box.h
}
window.measureVector = function (svgText, o) {
  const INK = (o.ink || INK0), MINT = (o.head || MINT0), FACE = (o.face || FACE0)
  const { host, svg } = mount(svgText)
  const vb = svg.viewBox.baseVal
  const step = vb.width / 600
  const shapes = [...svg.querySelectorAll('path,ellipse,circle,rect')].filter((e) => !e.closest('clipPath,defs'))
  const fillOf = (e) => norm(e.getAttribute('fill'))
  const info = shapes.map((el) => { const pts = outline(svg, el, step); return { el, fill: fillOf(el), pts, bb: bbox(pts) } })
  const ink = info.filter((s) => INK.includes(s.fill))
  // 眼睛：大小相近、左右排开的一对墨形里最大的一对
  let best = null
  for (let i = 0; i < ink.length; i++) for (let j = i + 1; j < ink.length; j++) {
    const a = ink[i], b = ink[j], sa = Math.max(a.bb.w, a.bb.h), sb = Math.max(b.bb.w, b.bb.h)
    if (sa > vb.width * .1 || sb > vb.width * .1) continue
    if (Math.min(sa, sb) / Math.max(sa, sb) < .7) continue
    const dx = Math.abs(a.bb.cx - b.bb.cx), dy = Math.abs(a.bb.cy - b.bb.cy)
    if (dx < 3 * sa || dx > 20 * sa || dy > .35 * dx) continue
    if (!best || sa + sb > best.s) best = { s: sa + sb, pair: a.bb.cx < b.bb.cx ? [a, b] : [b, a] }
  }
  if (!best) { host.remove(); return { error: '没找到一对眼睛' } }
  const [L, R] = best.pair
  const eyeD = (e) => (e.bb.w + e.bb.h) / 2
  const mid = { x: (L.bb.cx + R.bb.cx) / 2, y: (L.bb.cy + R.bb.cy) / 2 }
  const ax = { x: R.bb.cx - L.bb.cx, y: R.bb.cy - L.bb.cy }; const al = Math.hypot(ax.x, ax.y); ax.x /= al; ax.y /= al
  const down = { x: -ax.y, y: ax.x }
  const eyeDist = al
  const rest = ink.filter((s) => s !== L && s !== R)
  // 鼻子：两眼中点下方、宽在 0.25–1.2 个眼距之间、离中点最近的墨形
  const noseCands = rest.filter((s) => s.bb.w > .25 * eyeDist && s.bb.w < 1.2 * eyeDist && ((s.bb.cx - mid.x) * down.x + (s.bb.cy - mid.y) * down.y) > 0)
  noseCands.sort((a, b) => Math.hypot(a.bb.cx - mid.x, a.bb.cy - mid.y) - Math.hypot(b.bb.cx - mid.x, b.bb.cy - mid.y))
  const nose = noseCands[0] || null
  const whiskers = rest.filter((s) => s !== nose && Math.max(s.bb.w, s.bb.h) < eyeD(L) * 1.1)
  const nc = nose ? { x: nose.bb.cx, y: nose.bb.cy } : mid
  const faces = info.filter((s) => FACE.includes(s.fill))
  const face = faces.find((s) => inFill(svg, s.el, nc)) || faces.sort((a, b) => Math.hypot(a.bb.cx - nc.x, a.bb.cy - nc.y) - Math.hypot(b.bb.cx - nc.x, b.bb.cy - nc.y))[0] || null
  const heads = info.filter((s) => MINT.includes(s.fill))
  const head = heads.find((s) => inFill(svg, s.el, mid)) || null
  const filled = info.filter((s) => s.fill && s.fill !== 'NONE')
  const inUnion = (p) => filled.some((s) => inFill(svg, s.el, p))
  // 沿两眼连线往外走，量连耳的头宽（走出所有填色为止）；沿垂线往上量头顶，往下量到下巴下沿（碰到围兜色或走出轮廓）
  const walk = (dir, stopFn) => { let t = 0; const st = vb.width / 2000; while (t < vb.width * 2) { const p = { x: mid.x + dir.x * t, y: mid.y + dir.y * t }; if (stopFn(p)) return t; t += st } return null }
  const tL = walk({ x: -ax.x, y: -ax.y }, (p) => !inUnion(p)), tR = walk(ax, (p) => !inUnion(p))
  const headOnly = (p) => !(head && inFill(svg, head.el, p)) && !(face && inFill(svg, face.el, p)) && !ink.some((s) => inFill(svg, s.el, p))
  const hL = head ? walk({ x: -ax.x, y: -ax.y }, headOnly) : null, hR = head ? walk(ax, headOnly) : null
  const tUp = walk({ x: -down.x, y: -down.y }, (p) => !inUnion(p))
  const BELLY = ['#DDF1E8']
  const belly = info.filter((s) => BELLY.includes(s.fill))
  const tDown = walk(down, (p) => !inUnion(p) || belly.some((s) => inFill(svg, s.el, p)))
  const eye = (e) => {
    const c = { x: e.bb.cx, y: e.bb.cy }, d = eyeD(e)
    const ins = (s) => s && inFill(svg, s.el, c)
    return {
      center: { x: +c.x.toFixed(2), y: +c.y.toFixed(2) }, w: +e.bb.w.toFixed(2), h: +e.bb.h.toFixed(2), d: +d.toFixed(2),
      shape: e.el.tagName,
      toNose: nose ? +minDist(e.pts, nose.pts).toFixed(2) : null,
      toFace: face ? (ins(face) ? 'inside' : +minDist(e.pts, face.pts).toFixed(2)) : null,
      toHeadOutline: head ? +minDist(e.pts, head.pts).toFixed(2) : null,
      toWhisker: whiskers.length ? +Math.min(...whiskers.map((w) => minDist(e.pts, w.pts))).toFixed(2) : null,
    }
  }
  const res = {
    viewBox: [vb.x, vb.y, vb.width, vb.height],
    eyes: [eye(L), eye(R)], eyeCenterDist: +eyeDist.toFixed(2),
    nose: nose ? { w: +nose.bb.w.toFixed(2), h: +nose.bb.h.toFixed(2), cx: +nose.bb.cx.toFixed(2), cy: +nose.bb.cy.toFixed(2) } : null,
    face: face ? { w: +face.bb.w.toFixed(2), h: +face.bb.h.toFixed(2), y0: +face.bb.y0.toFixed(2) } : null,
    whiskerCount: whiskers.length,
    headWidthWithEars: tL != null && tR != null ? +(tL + tR).toFixed(2) : null,
    headWidthAtEyeAxis: hL != null && hR != null ? +(hL + hR).toFixed(2) : null,
    headTopToChin: tUp != null && tDown != null ? +(tUp + tDown).toFixed(2) : null,
    eyeAxisTiltDeg: +(Math.atan2(ax.y, ax.x) * 180 / Math.PI).toFixed(2),
  }
  if (o.areas) {
    const box = { x0: vb.x, y0: vb.y, w: vb.width, h: vb.height }
    const chinY = mid.y + tDown * down.y
    const headEls = [head, face].filter(Boolean).map((s) => s.el)
    // 头区：头（含耳）和脸斑在下巴下沿以上的部分
    const headBox = { x0: vb.x, y0: vb.y, w: vb.width, h: Math.max(1, chinY - vb.y) }
    res.headArea = +shapeArea(svg, headEls, headBox, 260).toFixed(0)
    res.faceArea = face ? +shapeArea(svg, [face.el], { x0: face.bb.x0, y0: face.bb.y0, w: face.bb.w, h: face.bb.h }, 220).toFixed(0) : null
    res.eyeArea = +[L, R].map((e) => shapeArea(svg, [e.el], { x0: e.bb.x0, y0: e.bb.y0, w: e.bb.w, h: e.bb.h }, 60)).reduce((a, b) => a + b, 0).toFixed(1)
  }
  host.remove()
  return res
}
// 对比稿处理 B：放大以后，眼到鼻、眼到脸斑边的净空都不小于现状，求最小的上移 / 外移
window.solveB = function (svgText, base, scales) {
  const { host, svg } = mount(svgText)
  const vb = svg.viewBox.baseVal, step = vb.width / 1500
  const all = [...svg.querySelectorAll('path,ellipse')].filter((e) => !e.closest('clipPath,defs'))
  const nose = all.find((e) => e.tagName === 'path' && norm(e.getAttribute('fill')) === '#191D18')
  const face = all.find((e) => norm(e.getAttribute('fill')) === '#F2FAF6')
  const head = all.find((e) => norm(e.getAttribute('fill')) === '#72BFA4')
  const N = outline(svg, nose, step), F = outline(svg, face, step), H = outline(svg, head, step)
  const eyes = base.eyes
  const clear = (c, r) => ({ nose: circDist(c, r, N), face: circDist(c, r, F), outline: circDist(c, r, H) })
  const c0 = eyes.map((e) => clear(e, e.r))
  const out = []
  for (const s of scales) {
    let best = null
    for (let dy = 0; dy <= 60; dy += .25) for (let dx = 0; dx <= 60; dx += .25) {
      const cost = Math.hypot(dx, dy) + dx * 1e-3
      if (best && cost >= best.cost) continue
      const ok = eyes.every((e, i) => { const sg = i === 0 ? -1 : 1; const c = clear({ x: e.x + sg * dx, y: e.y - dy }, e.r * s); return c.nose >= c0[i].nose - 1e-6 && c.face >= c0[i].face - 1e-6 })
      if (ok) best = { cost, dx, dy }
    }
    const moved = eyes.map((e, i) => { const sg = i === 0 ? -1 : 1; return clear({ x: e.x + sg * best.dx, y: e.y - best.dy }, e.r * s) })
    const still = eyes.map((e) => clear(e, e.r * s))
    out.push({ scale: s, dxOut: best.dx, dyUp: best.dy, clearA: still, clearB: moved })
  }
  host.remove()
  return { base: c0, out }
}
// 逐格画版：读 PNG 像素，按颜色分类、连通块，量眼睛像素和四周净空（切比雪夫距离减 1 = 中间隔几格）
const HEX = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
async function loadPx(url) {
  const img = new Image(); img.src = url; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height).data
  const W = c.width, H = c.height, col = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; col.push(d[i + 3] < 128 ? null : HEX(d, i)) }
  return { W, H, col }
}
function comps(W, H, pred, eight) {
  const lab = new Int32Array(W * H).fill(-1), out = []
  for (let i = 0; i < W * H; i++) {
    if (lab[i] >= 0 || !pred(i)) continue
    const q = [i], px = []; lab[i] = out.length
    while (q.length) {
      const k = q.pop(); px.push(k); const x = k % W, y = (k / W) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!eight && dx && dy) continue
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx; if (lab[n] < 0 && pred(n)) { lab[n] = out.length; q.push(n) }
      }
    }
    const xs = px.map((k) => k % W), ys = px.map((k) => (k / W) | 0)
    out.push({ px, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), border: xs.some((x) => x === 0 || x === W - 1) || ys.some((y) => y === 0 || y === H - 1) })
  }
  return out
}
function gap(W, A, Bs) { let d = Infinity; for (const a of A) for (const b of Bs) { const v = Math.max(Math.abs(a % W - b % W), Math.abs(((a / W) | 0) - ((b / W) | 0))); if (v < d) d = v } return d === Infinity ? null : d - 1 }
window.measurePixel = async function (url, o) {
  const { W, H, col } = await loadPx(url)
  const INK = '#191D18', FACE = '#F2FAF6'
  let eyesC, noseC, whiskC, faceC, outside
  if (!o.mono) {
    const inkC = comps(W, H, (i) => col[i] === INK, true).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    eyesC = inkC.slice(0, 2).sort((a, b) => a.x0 - b.x0)
    const others = inkC.slice(2).sort((a, b) => b.px.length - a.px.length)
    noseC = others[0]; whiskC = others.slice(1)
    const wC = comps(W, H, (i) => col[i] === FACE, false)
    faceC = wC.filter((c) => !c.border).sort((a, b) => b.px.length - a.px.length)[0] || null
    const tile = new Set(wC.filter((c) => c.border).flatMap((c) => c.px))
    outside = []; for (let i = 0; i < W * H; i++) if (col[i] === null || tile.has(i)) outside.push(i)
  } else {
    const holes = comps(W, H, (i) => col[i] === null, false)
    outside = holes.filter((c) => c.border).flatMap((c) => c.px)
    const enclosed = holes.filter((c) => !c.border).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    eyesC = enclosed.slice(0, 2).sort((a, b) => a.x0 - b.x0)
    faceC = enclosed.slice(2).sort((a, b) => b.px.length - a.px.length)[0] || null
    const inkC = comps(W, H, (i) => col[i] !== null, false).sort((a, b) => b.px.length - a.px.length)
    noseC = inkC[1] || null; whiskC = inkC.slice(2)
  }
  const cen = (c) => ({ x: c.px.reduce((s, k) => s + k % W, 0) / c.px.length, y: c.px.reduce((s, k) => s + ((k / W) | 0), 0) / c.px.length })
  const eye = (c) => ({
    px: c.px.length, box: [c.x1 - c.x0 + 1, c.y1 - c.y0 + 1], at: [c.x0, c.y0],
    gapNose: noseC ? gap(W, c.px, noseC.px) : null, gapFace: faceC ? gap(W, c.px, faceC.px) : null,
    gapOutline: gap(W, c.px, outside), gapWhisker: whiskC.length ? Math.min(...whiskC.map((w) => gap(W, c.px, w.px))) : null,
  })
  const [cL, cR] = eyesC.map(cen)
  // 眼睛那一行的头宽：这一行里不算外面的格子，从最左到最右
  const row = eyesC[0].y0, outS = new Set(outside)
  let x0 = W, x1 = -1; for (let x = 0; x < W; x++) if (!outS.has(row * W + x)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
  let hx0 = W, hx1 = -1, hy0 = H, hy1 = -1
  for (let i = 0; i < W * H; i++) if (!outS.has(i)) { const x = i % W, y = (i / W) | 0; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y) }
  return {
    size: [W, H], eyes: eyesC.map(eye), eyeCenterDist: +Math.hypot(cR.x - cL.x, cR.y - cL.y).toFixed(2),
    headWidthAtEyeRow: x1 - x0 + 1, figureBox: [hx1 - hx0 + 1, hy1 - hy0 + 1],
    nosePx: noseC ? noseC.px.length : null, facePx: faceC ? faceC.px.length : null, whiskerDots: whiskC.length,
  }
}
// 截图里一只眼睛实际占几个物理像素：在已知的圆心、半径附近，按线性光强度算墨的覆盖率
function lin(v) { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
function lum(r, g, b) { return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b) }
window.eyeCoverage = async function (url, eyes, bgHex, inkHex) {
  const img = new Image(); img.src = url; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const h2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const Lb = lum(...h2(bgHex)), Li = lum(...h2(inkHex))
  return eyes.map((e) => {
    const R = e.r + 1.5, x0 = Math.floor(e.x - R), y0 = Math.floor(e.y - R), n = Math.ceil(2 * R) + 1
    const d = g.getImageData(x0, y0, n, n).data
    let sum = 0, solid = 0, touched = 0
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const px = x0 + i + .5, py = y0 + j + .5; if (Math.hypot(px - e.x, py - e.y) > e.r + 1) continue
      const k = (j * n + i) * 4, L = lum(d[k], d[k + 1], d[k + 2])
      const cov = Math.max(0, Math.min(1, (Lb - L) / (Lb - Li))); sum += cov; if (cov >= .5) solid++; if (cov >= .15) touched++
    }
    return { equivalentInkPx: +sum.toFixed(2), pxAtLeastHalf: solid, pxTouched: touched }
  })
}
// 渲染后眼睛还剩多深：把图画进画布（可加模糊），取眼心的亮度对头色的韦伯对比
window.eyeContrast = async function (url, w, h, eyes, blurPx) {
  const img = new Image(); img.src = url; await img.decode()
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); if (blurPx) g.filter = 'blur(' + blurPx + 'px)'
  g.drawImage(img, 0, 0, w, h)
  const Lm = lum(0x72, 0xBF, 0xA4)
  return eyes.map((e) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(e.x))), y = Math.min(h - 1, Math.max(0, Math.floor(e.y)))
    const d = g.getImageData(x, y, 1, 1).data
    return +((Lm - lum(d[0], d[1], d[2])) / Lm).toFixed(3)
  })
}
`

// ---------------------------------------------------------------- 对比稿：只改两只眼睛的 cx、cy、rx、ry
const SCALES = [1.0, 1.1, 1.2, 1.3, 1.45]
const SETS = [
  { id: 'head', label: '矢量头像', file: `${B}/mascot/otter-head.svg` },
  { id: 'mark', label: '图形标志（雾薄荷）', file: `${B}/logo/mint/mark.svg` },
  { id: 'app-icon', label: 'App 图标', file: `${B}/mascot/app-icon.svg` },
]
const EYE_RE = /<ellipse([^>]*?)cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"([^>]*)\/>/g
function makeVariant(src, s, dx, dy, note) {
  let n = 0
  const out = src.replace(EYE_RE, (m, pre, cx, cy, rx, ry, post) => {
    n++
    const left = +cx < 512, ncx = +cx + (left ? -dx : dx), ncy = +cy - dy
    return `<ellipse${pre}cx="${r2(ncx)}" cy="${r2(ncy)}" rx="${r2(+rx * s)}" ry="${r2(+ry * s)}"${post}/>`
  }).replace(/(<title>[^<]*<\/title>)/, `$1\n<!-- ${note} -->`)
  if (n !== 2) throw new Error('应该正好两只眼睛，找到 ' + n)
  // 核对：去掉加的注释以后，只有两行眼睛不一样
  const a = src.split('\n'), b = out.split('\n').filter((l) => !l.startsWith('<!-- 眼睛对比稿'))
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null)
  if (a.length !== b.length || diff.length > 2 || diff.some((i) => !/<ellipse/.test(a[i]))) throw new Error('除了眼睛还有别的改动')
  return out
}

// ---------------------------------------------------------------- 逐格备选：按规则挪眼睛格子，记下每一格
const MINT = '#72BFA4', INKH = '#191D18'
const PX_RULES = {
  16: [
    { id: 'a', name: '2×2 外扩', gx: 1, gu: 0, su: 0, why: '眼睛往外加一列：内侧和下沿不动，鼻子、脸斑的净空照旧' },
    { id: 'b', name: '1×3 上延', gx: 0, gu: 1, su: 0, why: '眼睛往上加一格：只长高，不变宽' },
    { id: 'c', name: '2×2 外扩、上移一行', gx: 1, gu: 0, su: 1, why: '往外加一列再整体上移一行：眼睛下面空出一行绿，和脸斑隔开' },
  ],
  32: [
    { id: 'a', name: '3×3 外扩上延', gx: 1, gu: 1, su: 0, why: '往外、往上各加一格：内侧和下沿不动' },
    { id: 'b', name: '3×3 上移一行', gx: 1, gu: 1, su: 1, why: '3×3 再整体上移一行：眼睛下面两行绿' },
    { id: 'c', name: '2×3 上延', gx: 0, gu: 1, su: 0, why: '只往上加一行：竖长的眼点，不变宽' },
  ],
}
const PX_FILES = [
  { id: 'app-icon-16', file: `${B}/mascot/small/app-icon-16.png`, size: 16, use: '浏览器标签 1x（favicon-16）' },
  { id: 'app-icon-32', file: `${B}/mascot/small/app-icon-32.png`, size: 32, use: '浏览器标签 2x（favicon-32）' },
  { id: 'otter-head-16', file: `${B}/mascot/small/otter-head-16.png`, size: 16, use: '行内小头像（现网没用）' },
  { id: 'otter-head-32', file: `${B}/mascot/small/otter-head-32.png`, size: 32, use: '行内小头像（现网没用）' },
  { id: 'mark-16', file: `${B}/logo/mint/mark-16.png`, size: 16, use: '16px 以下的标志（现网没用）' },
  { id: 'mark-32', file: `${B}/logo/mint/mark-32.png`, size: 32, use: '顶栏 1x（mark-32.png）' },
]
function pixelAlt(grid, W, H, eyes, rule) {
  const g = grid.slice(), changes = []
  const set = (x, y, c) => { const i = y * W + x; if (g[i] !== c) { changes.push({ x, y, from: g[i], to: c }); g[i] = c } }
  const newPx = new Set()
  for (const e of eyes) {
    const left = e.side === 'L'
    const x0 = left ? e.x0 - rule.gx : e.x0, x1 = left ? e.x1 : e.x1 + rule.gx
    const y0 = e.y0 - rule.gu - rule.su, y1 = e.y1 - rule.su
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) newPx.add(y * W + x)
  }
  const warn = []
  for (const e of eyes) for (let y = e.y0; y <= e.y1; y++) for (let x = e.x0; x <= e.x1; x++) if (!newPx.has(y * W + x)) set(x, y, MINT)
  for (const i of newPx) { const x = i % W, y = (i / W) | 0; if (grid[i] !== MINT && grid[i] !== INKH) warn.push(`(${x},${y}) 原来是 ${grid[i]}`); set(x, y, INKH) }
  return { grid: g, changes, warn }
}
const gridSvg = (g, W, H, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">\n<!-- ${title} -->\n` +
  g.map((c, i) => (c ? `<rect x="${i % W}" y="${(i / W) | 0}" width="1" height="1" fill="${c}"/>` : '')).join('') + '</svg>\n'

// ---------------------------------------------------------------- 主流程
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })
const lab = await ctx1.newPage()
await lab.setContent('<!doctype html><html><body style="margin:0"></body></html>')
await lab.addScriptTag({ content: PAGE_LIB })

// 1. 量矢量
const vecMeasure = {}
for (const v of VECTORS) {
  const m = await lab.evaluate(([t, o]) => window.measureVector(t, o), [rd(v.file), { ink: v.ink, head: v.head, face: v.face, areas: ['head', 'mark', 'icon'].includes(v.kind) }])
  const e = m.eyes || []
  const d = e.length ? (e[0].d + e[1].d) / 2 : null
  m.ratios = d && {
    eyeD_over_headWidthWithEars: r3(d / m.headWidthWithEars), eyeD_over_headWidthAtEyeAxis: r3(m.headWidthAtEyeAxis ? d / m.headWidthAtEyeAxis : null),
    eyeDist_over_headWidthAtEyeAxis: r3(m.headWidthAtEyeAxis ? m.eyeCenterDist / m.headWidthAtEyeAxis : null),
    eyeD_over_eyeDist: r3(d / m.eyeCenterDist), eyeD_over_headTopToChin: r3(m.headTopToChin ? d / m.headTopToChin : null),
    eyeArea_over_headArea: m.headArea ? r3(m.eyeArea / m.headArea) : null, eyeArea_over_faceArea: m.faceArea ? r3(m.eyeArea / m.faceArea) : null,
    noseGap_over_eyeD: e[0].toNose != null ? r3(e[0].toNose / d) : null, faceGap_over_eyeD: typeof e[0].toFace === 'number' ? r3(e[0].toFace / d) : null,
  }
  vecMeasure[v.id] = { file: v.file, kind: v.kind, ...m }
  console.log('量', v.id, d && r2(d), m.ratios && m.ratios.eyeD_over_headWidthAtEyeAxis)
}
json(path.join(EYES, 'measure-vector.json'), vecMeasure)

// 2. 量逐格画版
const pxMeasure = {}
for (const p of PIXELS) {
  try { pxMeasure[p.id] = { file: p.file, ...(await lab.evaluate(([u, o]) => window.measurePixel(u, o), [pngUrl(readFileSync(path.join(ROOT, p.file))), { mono: !!p.mono }])) } }
  catch (e) { pxMeasure[p.id] = { file: p.file, error: '没量到：自动分块失败（单色版的眼洞和脸斑洞连在一起，分不出两只眼睛）。手量见 README。' } }
}
json(path.join(EYES, 'measure-pixel.json'), pxMeasure)

// 3. 矢量对比稿：五档 × 两种处理 × 三套
const head = vecMeasure['otter-head']
const baseEyes = head.eyes.map((e) => ({ x: e.center.x, y: e.center.y, r: e.d / 2 }))
const solved = await lab.evaluate(([t, b, s]) => window.solveB(t, b, s), [rd(`${B}/mascot/otter-head.svg`), { eyes: baseEyes }, SCALES])
const VARIANTS = []
for (const sol of solved.out) for (const tr of ['A', 'B']) {
  const dx = tr === 'A' ? 0 : sol.dxOut, dy = tr === 'A' ? 0 : sol.dyUp
  VARIANTS.push({ key: `s${sol.scale.toFixed(2)}-${tr}`, scale: sol.scale, tr, dx, dy, clear: tr === 'A' ? sol.clearA : sol.clearB })
}
const variantSvg = {}
for (const set of SETS) {
  mkdirSync(path.join(EYES, 'svg', set.id), { recursive: true })
  const src = rd(set.file)
  for (const v of VARIANTS) {
    const note = `眼睛对比稿 ${v.scale.toFixed(2)} 倍 · 处理 ${v.tr === 'A' ? 'A 位置不动' : `B 保持净空（外移 ${v.dx}、上移 ${v.dy}，母版坐标）`}。副本，不是母版；只改了两只眼睛的 cx、cy、rx、ry。`
    const s = makeVariant(src, v.scale, v.dx, v.dy, note)
    variantSvg[`${set.id}/${v.key}`] = s
    writeFileSync(path.join(EYES, 'svg', set.id, `${set.id}-${v.key}.svg`), s)
  }
}
const variantRows = VARIANTS.map((v) => ({
  key: v.key, scale: v.scale, treatment: v.tr, dxOut: v.dx, dyUp: v.dy,
  eyeD: r2(head.eyes[0].d * v.scale),
  eyeD_over_headWidthAtEyeAxis: r3(head.eyes[0].d * v.scale / head.headWidthAtEyeAxis),
  eyeArea_over_headArea: r3(head.eyeArea * v.scale ** 2 / head.headArea),
  clearLeft: Object.fromEntries(Object.entries(v.clear[0]).map(([k, x]) => [k, r2(x)])),
  clearRight: Object.fromEntries(Object.entries(v.clear[1]).map(([k, x]) => [k, r2(x)])),
}))

// 每档在各尺寸下的眼径（物理像素）和眼心对比（不模糊；64px 加 2px 模糊模拟远看）
const SIZES = [16, 20, 32, 64, 160]
const geo = {
  head: { vb: [35.3, -8.1, 955.3, 955.3], h: (s) => s, w: (s) => s, map: (x, y, s) => [(x - 35.3) / 955.3 * s, (y + 8.1) / 955.3 * s] },
  mark: { vb: [49.5, 105.5, 926, 594.5], h: (s) => s, w: (s) => s * 926 / 594.5, map: (x, y, s) => [(x - 49.5) / 594.5 * s, (y - 105.5) / 594.5 * s] },
  'app-icon': { h: (s) => s, w: (s) => s, map: (x, y, s) => [(3 + (x - 35.3) / 955.3 * 94) / 100 * s, (8 + (y + 8.1) / 955.3 * 94) / 100 * s] },
}
const eyePerSize = {}
for (const set of SETS) for (const v of VARIANTS) {
  const s0 = variantSvg[`${set.id}/${v.key}`], rows = {}
  for (const S of SIZES) {
    const G = geo[set.id]
    const scaleK = set.id === 'head' ? S / 955.3 : set.id === 'mark' ? S / 594.5 : S * 0.94 / 955.3
    const eyes = baseEyes.map((e, i) => { const [x, y] = G.map(e.x + (i ? 1 : -1) * v.dx, e.y - v.dy, S); return { x, y } })
    const W = Math.round(G.w(S)), H = Math.round(G.h(S))
    const cNo = await lab.evaluate(([u, w, h, e]) => window.eyeContrast(u, w, h, e, 0), [svgUrl(s0), W, H, eyes])
    const c2x = await lab.evaluate(([u, w, h, e]) => window.eyeContrast(u, w, h, e, 0), [svgUrl(s0), W * 2, H * 2, eyes.map((e) => ({ x: e.x * 2, y: e.y * 2 }))])
    const cBl = await lab.evaluate(([u, w, h, e, b]) => window.eyeContrast(u, w, h, e, b), [svgUrl(s0), W, H, eyes, Math.max(1, S / 32)])
    rows[S] = { eyeDpx1x: r2(head.eyes[0].d * v.scale * scaleK), eyeDpx2x: r2(head.eyes[0].d * v.scale * scaleK * 2), contrast1x: cNo[0], contrast2x: c2x[0], contrastBlur: cBl[0], blurPx: Math.max(1, S / 32) }
  }
  eyePerSize[`${set.id}/${v.key}`] = rows
}
json(path.join(EYES, 'measure-variants.json'), { method: '对比稿只改两只眼睛；B 处理按眼到鼻、眼到脸斑边的最近距离（母版坐标）不小于现状，网格搜索最小的外移和上移（步长 0.25）。', base: solved.base, variants: variantRows, perSize: eyePerSize })

// 4. 逐格备选
const pxAlts = {}
for (const f of PX_FILES) {
  const { W, H, col } = await lab.evaluate(async (u) => { const r = await (async () => { const img = new Image(); img.src = u; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const col = []; for (let i = 0; i < d.length; i += 4) col.push(d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()); return { W: c.width, H: c.height, col } })(); return r }, pngUrl(readFileSync(path.join(ROOT, f.file))))
  const m = await lab.evaluate(([u]) => window.measurePixel(u, {}), [pngUrl(readFileSync(path.join(ROOT, f.file)))])
  const eyes = m.eyes.map((e, i) => ({ side: i ? 'R' : 'L', x0: e.at[0], y0: e.at[1], x1: e.at[0] + e.box[0] - 1, y1: e.at[1] + e.box[1] - 1 }))
  pxAlts[f.id] = { file: f.file, use: f.use, size: [W, H], current: m, alts: {} }
  writeFileSync(path.join(EYES, 'pixel', `${f.id}-0-现状.svg`), gridSvg(col, W, H, `${f.id} 现状（从 ${f.file} 读出）`))
  for (const rule of PX_RULES[f.size]) {
    const { grid, changes, warn } = pixelAlt(col, W, H, eyes, rule)
    const name = `${f.id}-${rule.id}`
    const svg = gridSvg(grid, W, H, `${f.id} 备选 ${rule.id}「${rule.name}」：${rule.why}。副本，不是母版；改了 ${changes.length} 格，见 measure-pixel-alts.json`)
    writeFileSync(path.join(EYES, 'pixel', `${name}.svg`), svg)
    const png = await lab.evaluate(async ([s, w, h]) => { const img = new Image(); img.src = s; await img.decode(); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png') }, [svgUrl(svg), W, H])
    writeFileSync(path.join(EYES, 'pixel', `${name}.png`), Buffer.from(png.split(',')[1], 'base64'))
    const after = await lab.evaluate(([u]) => window.measurePixel(u, {}), [png])
    pxAlts[f.id].alts[rule.id] = { name: rule.name, why: rule.why, changes, warn, after: { eyes: after.eyes, eyeCenterDist: after.eyeCenterDist } }
  }
}
json(path.join(EYES, 'measure-pixel-alts.json'), pxAlts)

// 5. 对比图、检查图（在空白页上排，截 1x / 2x）
const DESK = '#F1F5F7'
async function sheet(html, file, dpr, width = 1400) {
  const c = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: dpr })
  const p = await c.newPage()
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:${DESK};font:12px/1.4 "WenQuanYi Zen Hei",sans-serif;color:#29424D}
    table{border-collapse:collapse} td,th{padding:6px 10px;vertical-align:middle;text-align:left;font-weight:400}
    th{font-size:11px;color:#5b6b72} .z img{image-rendering:pixelated} h1{font-size:14px;font-weight:600;margin:0 0 8px}
    .card{background:#fff;padding:6px;display:inline-block} .dark{background:#202124;padding:6px;display:inline-block}
  </style></head><body>${html}</body></html>`)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.screenshot({ path: file, fullPage: true })
  await c.close()
}
const vlabel = (v) => `${v.scale.toFixed(2)} · ${v.tr === 'A' ? 'A 不动' : `B 外移 ${v.dx} 上移 ${v.dy}`}`
for (const set of SETS) for (const dpr of [1, 2]) {
  const rows = VARIANTS.map((v) => `<tr><th>${vlabel(v)}</th>${SIZES.map((S) => `<td><img src="${svgUrl(variantSvg[`${set.id}/${v.key}`])}" height="${S}"></td>`).join('')}</tr>`).join('')
  await sheet(`<h1>${set.label} · 眼睛五档 × 两种处理 · ${dpr}x 屏（列：${SIZES.join('、')} px 高）</h1><table><tr><th></th>${SIZES.map((S) => `<th>${S}px</th>`).join('')}</tr>${rows}</table>`,
    path.join(EYES, `sheet-${set.id}-${dpr}x.png`), dpr)
}
// 检查图：64px 下原图、灰度、模糊 1px、模糊 2px、投影（模糊加褪色）、阈值（只剩墨）、模糊后阈值、剪影
const CHECKS = [['原图', 'none'], ['灰度', 'grayscale(1)'], ['模糊 1px', 'blur(1px)'], ['模糊 2px', 'blur(2px)'], ['投影（模糊 1.5px、对比 0.55、亮度 1.2）', 'blur(1.5px) contrast(.55) brightness(1.2)'],
  ['阈值（只剩墨）', 'grayscale(1) contrast(12)'], ['模糊 1.5px 后阈值', 'blur(1.5px) grayscale(1) contrast(12)'], ['剪影', 'brightness(0)']]
for (const set of SETS) {
  const rows = VARIANTS.map((v) => `<tr><th>${vlabel(v)}</th>${CHECKS.map(([, f]) => `<td><img src="${svgUrl(variantSvg[`${set.id}/${v.key}`])}" height="64" style="filter:${f}"></td>`).join('')}</tr>`).join('')
  await sheet(`<h1>${set.label} · 检查图（64px，1x）</h1><table><tr><th></th>${CHECKS.map(([n]) => `<th>${n}</th>`).join('')}</tr>${rows}</table>`, path.join(EYES, `check-${set.id}.png`), 1, 1500)
}
// 逐格备选总图：原尺寸 1x，加 8 倍逐像素放大，浅色和深色底
{
  const rows = PX_FILES.map((f) => {
    const cells = [['现状', readFileSync(path.join(ROOT, f.file))], ...PX_RULES[f.size].map((r) => [`${r.id} ${r.name}`, readFileSync(path.join(EYES, 'pixel', `${f.id}-${r.id}.png`))])]
    const [W, H] = pxAlts[f.id].size
    return `<tr><th>${f.id}<br>${f.use}</th>${cells.map(([n, b]) => `<td class="z"><div style="font-size:11px">${n}</div><span class="card"><img src="${pngUrl(b)}" width="${W}" height="${H}"></span> <span class="dark"><img src="${pngUrl(b)}" width="${W}" height="${H}"></span><br><img src="${pngUrl(b)}" width="${W * 8}" height="${H * 8}"></td>`).join('')}</tr>`
  }).join('')
  await sheet(`<h1>逐格画版 · 眼睛备选（原尺寸在白底和深色底上，下面是 8 倍逐像素放大）</h1><table>${rows}</table>`, path.join(EYES, 'pixel-alts.png'), 1, 1500)
}

// 6. 真实页面
const shotLog = { note: '本地网站（rig.mjs，端口偏移 ' + process.env.INVENTORY_PORT_OFFSET + '），owner 账号，减少动态效果。截图里的像素就是物理像素。', positions: {} }
if (!NO_SITE) {
  const rig = await startRig({ quiet: true })
  const base = rig.base
  const login = async (p) => {
    await p.goto(base + '/'); await p.locator('#login-username').waitFor({ timeout: 30000 })
    await p.locator('#login-username').fill(OWNER.username); await p.locator('#login-password').fill(OWNER.password)
    await p.locator('.login-submit').click(); await p.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(800)
  }
  const crops = {} // id -> {dpr -> {png, eyes(device px), r}}
  const swaps = {}
  try {
    for (const dpr of [1, 2]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })
      const p = await c.newPage()
      const grab = async (id, clip, eyes, extra = {}) => {
        const buf = await p.screenshot({ clip })
        writeFileSync(path.join(SHOTS, `${id}-${dpr}x.png`), buf)
        ;(crops[id] ||= {})[dpr] = { buf, clip, eyes, ...extra }
        return buf
      }
      // 登录页：左上角标志（mark.svg，24×24 框里 contain）和雾海里的 v11 海獭
      await p.goto(base + '/'); await p.locator('.login-card').waitFor({ timeout: 30000 }); await sleep(1500)
      await p.screenshot({ path: path.join(SHOTS, `login-page-${dpr}x.png`), scale: 'css' })
      {
        const r = await p.locator('.login-brand img').boundingBox()
        const w = r.width, h = w * 594.5 / 926, oy = (r.height - h) / 2
        const toPx = (x, y) => [(r.x + (x - 49.5) / 926 * w) * dpr, (r.y + oy + (y - 105.5) / 926 * w) * dpr]
        const eyes = [[339.5, 375.5], [685.2, 375.5]].map(([x, y]) => { const [a, b] = toPx(x, y); return { x: a - (r.x - 8) * dpr, y: b - (r.y - 8) * dpr, r: 28.2 / 926 * w * dpr } })
        await grab('login-brand', { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }, eyes, { cssBox: r, eyeDcss: 56.4 / 926 * w })
        // 雾海里的海獭（v11，viewBox 0 0 1024 1015，眼半径 8.3）
        const o = await p.locator('.login-otter-sway').boundingBox()
        const k = o.width / 1024
        const ex = [[119, 769], [235.6, 732]]
        const pad = 14, cx0 = o.x + 100 * k - pad, cy0 = o.y + 700 * k - pad, cw = 160 * k + 2 * pad, ch = 110 * k + 2 * pad
        const eyes2 = ex.map(([x, y]) => ({ x: (o.x + x * k - cx0) * dpr, y: (o.y + y * k - cy0) * dpr, r: 8.3 * k * dpr }))
        await grab('login-otter-face', { x: cx0, y: cy0, width: cw, height: ch }, eyes2, { cssBox: o, eyeDcss: 16.6 * k, bg: '#FFFFFF', ink: '#29424D' })
      }
      // 顶栏标志
      await login(p)
      await p.goto(base + '/'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1200)
      {
        const r = await p.locator('img.topbar-brand-mark').boundingBox()
        const cur = await p.locator('img.topbar-brand-mark').evaluate((e) => e.currentSrc)
        const w = Math.min(r.width, r.height * 926 / 594.5), h = w * 594.5 / 926, ox = (r.width - w) / 2, oy = (r.height - h) / 2
        const eyes = dpr === 1
          ? [{ x: 8 + 9 + 1, y: 8 + 8 + 1, r: 1 }, { x: 8 + 21 + 1, y: 8 + 8 + 1, r: 1 }] // mark-32.png：眼睛在 (9..10, 8..9) 和 (21..22, 8..9)
          : [[339.5, 375.5], [685.2, 375.5]].map(([x, y]) => ({ x: (8 + ox + (x - 49.5) / 926 * w) * dpr, y: (8 + oy + (y - 105.5) / 926 * w) * dpr, r: 28.2 / 926 * w * dpr }))
        await grab('topbar-mark', { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }, eyes, { cssBox: r, currentSrc: cur.replace(base, ''), eyeDcss: dpr === 1 ? 2 : 56.4 / 926 * w })
        const tb = await p.locator('header.topbar').boundingBox()
        await p.screenshot({ path: path.join(SHOTS, `topbar-${dpr}x.png`), clip: { x: 0, y: tb.y, width: 420, height: tb.height } })
      }
      // 个人空间空态：现网是 88px 的平涂图标插图，没有獭獭；量一下位置，后面试穿用
      await p.goto(base + '/?view=my-space'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1500)
      const ill = p.locator('.eqb-empty-ill').first()
      if (await ill.count()) {
        const r = await ill.boundingBox()
        const card = await ill.evaluate((e) => { const b = e.parentElement.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
        await p.screenshot({ path: path.join(SHOTS, `empty-my-space-${dpr}x.png`), clip: { x: Math.max(0, card.x - 16), y: Math.max(0, card.y - 16), width: card.width + 32, height: card.height + 32 } })
        shotLog.positions['empty-my-space'] = { cssBox: r, note: '现网空态是 EmptyIllustration（88×88 平涂图标），没有獭獭' }
      } else shotLog.positions['empty-my-space'] = { note: '没拍到：个人空间没有出现空态' }
      // 浏览器标签和手机桌面图标：无头浏览器拍不到浏览器自己的标签栏，在空白页上照尺寸摆示意
      const fav16 = readFileSync(path.join(ROOT, 'app/public/favicon-16.png')), fav32 = readFileSync(path.join(ROOT, 'app/public/favicon-32.png'))
      const favUse = dpr === 1 ? fav16 : fav32
      await p.setContent(`<!doctype html><body style="margin:0;background:#dee1e6;font:12px sans-serif">
        <div id="tab" style="position:absolute;left:8px;top:8px;width:200px;height:34px;background:#fff;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box"><img id="fav" src="${pngUrl(favUse)}" width="16" height="16"><span>獭石 · 英语题库</span></div>
        <div id="tabd" style="position:absolute;left:220px;top:8px;width:200px;height:34px;background:#35363a;color:#e8eaed;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box"><img id="favd" src="${pngUrl(favUse)}" width="16" height="16"><span>獭石 · 英语题库</span></div>
        <div id="home" style="position:absolute;left:8px;top:60px;width:92px;height:96px;background:#3c4a57;display:flex;flex-direction:column;align-items:center;padding-top:10px;box-sizing:border-box;color:#fff"><img id="hi" src="${svgUrl(rd(`${B}/mascot/app-icon.svg`))}" width="60" height="60"><span style="margin-top:4px">獭石</span></div></body>`)
      await sleep(300)
      for (const [id, sel] of [['tab-light', '#fav'], ['tab-dark', '#favd']]) {
        const r = await p.locator(sel).boundingBox()
        const eyes = dpr === 1 ? [{ x: 4 + 4 + .5, y: 4 + 5 + 1, r: 1 }, { x: 4 + 11 + .5, y: 4 + 5 + 1, r: 1 }] : [{ x: 8 + 9 + 1, y: 8 + 12 + 1, r: 1 }, { x: 8 + 21 + 1, y: 8 + 12 + 1, r: 1 }]
        await grab(id, { x: r.x - 4, y: r.y - 4, width: 24, height: 24 }, eyes, { cssBox: r, file: dpr === 1 ? 'favicon-16.png' : 'favicon-32.png' })
      }
      {
        const r = await p.locator('#hi').boundingBox()
        const toPx = (x, y) => [(4 + (3 + (x - 35.3) / 955.3 * 94) / 100 * 60) * dpr, (4 + (8 + (y + 8.1) / 955.3 * 94) / 100 * 60) * dpr]
        const eyes = [[339.5, 375.5], [685.2, 375.5]].map(([x, y]) => { const [a, b] = toPx(x, y); return { x: a, y: b, r: 28.2 / 955.3 * 0.94 * 60 * dpr } })
        await grab('home-icon', { x: r.x - 4, y: r.y - 4, width: 68, height: 68 }, eyes, { cssBox: r, eyeDcss: 56.4 / 955.3 * .94 * 60 })
      }
      await c.close()
    }
    // 量每个位置上一只眼睛占几个物理像素
    for (const [id, byDpr] of Object.entries(crops)) {
      shotLog.positions[id] = shotLog.positions[id] || {}
      for (const [dpr, v] of Object.entries(byDpr)) {
        const cov = await lab.evaluate(([u, e, bg, ink]) => window.eyeCoverage(u, e, bg, ink), [pngUrl(v.buf), v.eyes, v.bg || '#72BFA4', v.ink || '#191D18'])
        shotLog.positions[id][dpr + 'x'] = { cssBox: v.cssBox, clip: v.clip, currentSrc: v.currentSrc, file: v.file, eyeDiameterCss: r2(v.eyeDcss), eyeDiameterDevicePx: r2(v.eyes[0].r * 2), coverage: cov }
      }
    }
    // 现状取证图：每个位置 1x、2x 原尺寸和 8 倍逐像素放大并排
    {
      const order = ['tab-light', 'tab-dark', 'topbar-mark', 'login-brand', 'login-otter-face', 'home-icon']
      const rows = order.filter((id) => crops[id]).map((id) => `<tr><th>${id}</th>${[1, 2].map((d) => { const v = crops[id][d]; if (!v) return '<td>没拍到</td>'; const im = pngUrl(v.buf); const W = Math.round(v.clip.width * d), H = Math.round(v.clip.height * d); const z = Math.min(8, Math.floor(1100 / W)); return `<td class="z"><div>${d}x · ${W}×${H} 物理像素${z < 8 ? ` · 放大 ${z} 倍（8 倍太宽）` : ' · 放大 8 倍'}</div><img src="${im}" width="${W}" height="${H}"> <img src="${im}" width="${W * z}" height="${H * z}"></td>` }).join('')}</tr>`).join('')
      await sheet(`<h1>现状 · 獭獭在产品里出现的位置（左原尺寸，右逐像素放大）</h1><table>${rows}</table>`, path.join(SHOTS, 'current-zoom.png'), 1, 2400)
    }

    // 换图试穿：只在截图前换 img 的地址，不改源码
    const c2 = {}
    for (const dpr of [1, 2]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })
      const p = await c.newPage()
      c2[dpr] = { c, p }
      const out = (swaps[dpr] = {})
      // 登录页标志
      await p.goto(base + '/'); await p.locator('.login-card').waitFor({ timeout: 30000 }); await sleep(1200)
      for (const v of VARIANTS) {
        await p.locator('.login-brand img').evaluate((e, u) => { e.src = u }, svgUrl(variantSvg[`mark/${v.key}`])); await sleep(120)
        const r = await p.locator('.login-brand').boundingBox()
        ;(out.login ||= {})[v.key] = await p.screenshot({ clip: { x: r.x - 6, y: r.y - 6, width: 60, height: r.height + 12 } })
      }
      // 顶栏标志：2x 用矢量对比稿；1x 现网用 mark-32 逐格画版，换成逐格备选
      await login(p); await p.goto(base + '/'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1000)
      const tbImg = p.locator('img.topbar-brand-mark')
      const tbShot = async () => { const r = await tbImg.boundingBox(); return p.screenshot({ clip: { x: r.x - 6, y: r.y - 8, width: 150, height: r.height + 16 } }) }
      if (dpr === 2) for (const v of VARIANTS) { await tbImg.evaluate((e, u) => { e.removeAttribute('srcset'); e.src = u }, svgUrl(variantSvg[`mark/${v.key}`])); await sleep(120); (out.topbar ||= {})[v.key] = await tbShot() }
      else for (const id of ['0', 'a', 'b', 'c']) {
        const buf = id === '0' ? readFileSync(path.join(ROOT, `${B}/logo/mint/mark-32.png`)) : readFileSync(path.join(EYES, 'pixel', `mark-32-${id}.png`))
        await tbImg.evaluate((e, u) => { e.removeAttribute('srcset'); e.src = u }, pngUrl(buf)); await sleep(120); (out.topbarPx ||= {})[id] = await tbShot()
      }
      // 个人空间空态：把 88px 的图标插图换成头像对比稿（试穿；现网空态没有獭獭）
      await p.goto(base + '/?view=my-space'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1200)
      if (await p.locator('.eqb-empty-ill').count()) {
        await p.locator('.eqb-empty-ill').first().evaluate((e) => { const i = document.createElement('img'); i.id = 'eye-try'; i.width = 88; i.height = 88; i.style.display = 'block'; e.replaceWith(i) })
        for (const v of VARIANTS) {
          await p.locator('#eye-try').evaluate((e, u) => { e.src = u }, svgUrl(variantSvg[`head/${v.key}`])); await sleep(120)
          const r = await p.locator('#eye-try').evaluate((e) => { const b = e.parentElement.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
          ;(out.empty ||= {})[v.key] = await p.screenshot({ clip: { x: r.x + r.width / 2 - 150, y: r.y - 8, width: 300, height: Math.min(r.height + 16, 200) } })
        }
      }
      // 浏览器标签（示意）：1x 用 16 格备选，2x 用 32 格备选
      const fid = dpr === 1 ? 'app-icon-16' : 'app-icon-32'
      for (const id of ['0', 'a', 'b', 'c']) {
        const buf = id === '0' ? readFileSync(path.join(ROOT, `${B}/mascot/small/${fid}.png`)) : readFileSync(path.join(EYES, 'pixel', `${fid}-${id}.png`))
        await p.setContent(`<!doctype html><body style="margin:0;background:#dee1e6;font:12px 'WenQuanYi Zen Hei',sans-serif">
          <div style="position:absolute;left:4px;top:4px;width:150px;height:30px;background:#fff;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box"><img src="${pngUrl(buf)}" width="16" height="16"><span>獭石 · 英语题库</span></div>
          <div style="position:absolute;left:158px;top:4px;width:150px;height:30px;background:#35363a;color:#e8eaed;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box"><img src="${pngUrl(buf)}" width="16" height="16"><span>獭石 · 英语题库</span></div></body>`)
        await sleep(150)
        ;(out.tab ||= {})[id] = await p.screenshot({ clip: { x: 0, y: 0, width: 312, height: 38 } })
      }
      await c.close()
    }
    // 试穿总图：每个位置一张，1x 和 2x 并排，原尺寸加 4 倍逐像素放大
    const tryRows = (getter, keys, labelFn, z) => keys.map((k) => `<tr><th>${labelFn(k)}</th>${[1, 2].map((d) => { const b = getter(d, k); if (!b) return '<td>—</td>'; const u = pngUrl(b); return `<td class="z" style="white-space:nowrap"><img src="${u}" style="vertical-align:middle">${z > 1 ? ` <img src="${u}" class="zz" style="vertical-align:middle">` : ''}</td>` }).join('')}</tr>`).join('')
    const zoomFix = (z) => `<script>for(const i of document.querySelectorAll('img.zz'))i.onload=()=>{i.width=i.naturalWidth*${z}};for(const i of document.querySelectorAll('img.zz'))if(i.complete)i.width=i.naturalWidth*${z}</script>`
    const keys = VARIANTS.map((v) => v.key), lab2 = (k) => vlabel(VARIANTS.find((v) => v.key === k))
    await sheet(`<h1>登录页左上角标志 · 换眼睛对比稿（左列 1x，右列 2x；各自原尺寸和 4 倍放大）</h1><table><tr><th></th><th>1x</th><th>2x</th></tr>${tryRows((d, k) => swaps[d].login?.[k], keys, lab2, 4)}</table>${zoomFix(4)}`, path.join(SHOTS, 'try-login-brand.png'), 1, 2000)
    await sheet(`<h1>顶栏标志 · 2x 换矢量对比稿；1x 现网用 32 格逐格画版，换逐格备选（4 倍放大）</h1><table><tr><th></th><th>1x（逐格）</th><th>2x（矢量）</th></tr>${tryRows((d, k) => (d === 2 ? swaps[2].topbar?.[k] : null), keys, lab2, 4)}${tryRows((d, k) => (d === 1 ? swaps[1].topbarPx?.[k] : null), ['0', 'a', 'b', 'c'], (k) => (k === '0' ? '逐格 现状' : `逐格备选 ${k} ${PX_RULES[32].find((r) => r.id === k).name}`), 4)}</table>${zoomFix(4)}`, path.join(SHOTS, 'try-topbar.png'), 1, 2000)
    if (swaps[1].empty) await sheet(`<h1>个人空间空态 · 试穿头像对比稿 88px（现网这里是平涂图标插图，没有獭獭；1x、2x 原尺寸）</h1><table><tr><th></th><th>1x</th><th>2x</th></tr>${tryRows((d, k) => swaps[d].empty?.[k], keys, lab2, 1)}</table>${zoomFix(1)}`, path.join(SHOTS, 'try-empty.png'), 1, 1400)
    await sheet(`<h1>浏览器标签（示意）· 1x 用 16 格，2x 用 32 格；浅色、深色标签；4 倍放大</h1><table><tr><th></th><th>1x</th><th>2x</th></tr>${tryRows((d, k) => swaps[d].tab?.[k], ['0', 'a', 'b', 'c'], (k) => (k === '0' ? '现状' : `备选 ${k}（16：${PX_RULES[16].find((r) => r.id === k).name}；32：${PX_RULES[32].find((r) => r.id === k).name}）`), 4)}</table>${zoomFix(4)}`, path.join(SHOTS, 'try-tab.png'), 1, 2400)
  } finally {
    await rig.stop()
    rmSync(path.join(RAW, `rigdata-${process.env.INVENTORY_PORT_OFFSET}`), { recursive: true, force: true })
  }
  json(path.join(SHOTS, 'measure-shots.json'), shotLog)
}
await browser.close()
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
