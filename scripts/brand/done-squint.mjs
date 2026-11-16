#!/usr/bin/env node
// 「完成」闭眼：照 L1 原图（pose-round5/otter-float.svg）只换两只眼睛，墨色圆点换成两道闭眼弧线。提案 · 单一来源。
// 弧线是填充形状（外圆弧 + 圆头 + 内圆弧 + 圆头），没有 stroke。别的路径一笔不动，逐字保留。
//
// 弧线的比例照旧状态图 mascot/states/state-04-done.svg 量：
//   - 两道弧各取内、外两条边的采样点，分别拟合圆（最小二乘），圆心取两圆心中点；
//   - 中线半径 = 两圆半径平均，粗细 = 外圆半径 − 内圆半径；
//   - 圆头的圆心角 = 轮廓最外的角度往里收 asin(粗细/2 ÷ 中线半径)；跨角 = 两个圆头圆心之间的角度；
//   - 眼距 = 两道弧中线中点之间的距离。所有尺寸都除以眼距，再乘 L1 的眼距（两只圆点眼中心的距离）。
// 出两版：a 粗细照旧 04；b 粗细 × B_K，弯度（中线半径、跨角）和位置都和 a 一样。
// 竖直位置：先让 a 的外框竖直中心对准原眼中心；如果 b 离脸斑（雾白）的最近距离小于旧 04 的同比例距离，
// 两版一起往上挪到刚好够（整数，脸部坐标）。
//
// 出：design/brand-2026-10-13/image-review-2026-11-14/pose-round6/
//   otter-done-a.svg、otter-done-b.svg、compare.png、eyes-zoom.png；终端打印量到的数（JSON）。
// 只读 round5 和 mascot/ 下的文件，不改。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const SRC = path.join(BRAND, 'image-review-2026-11-14/pose-round5/otter-float.svg')
const OLD04 = path.join(BRAND, 'mascot/states/state-04-done.svg')
const OUT = path.join(BRAND, 'image-review-2026-11-14/pose-round6')
mkdirSync(OUT, { recursive: true })
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

const INK = '#191D18'
const PAGE = '#F1F5F7'
const B_K = 1.4 // b 版粗细是 a 的几倍
const uriSvg = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const f2 = (n) => Math.round(n * 100) / 100
const rad = (d) => (d * Math.PI) / 180

const src = readFileSync(SRC, 'utf8')
const EYE_RE = /<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#191D18" \/>/g
const eyes = [...src.matchAll(EYE_RE)].map((m) => ({ str: m[0], cx: +m[1], cy: +m[2], rx: +m[3], ry: +m[4] }))
if (eyes.length !== 2) throw new Error(`round5 里应有两只墨色椭圆眼，找到 ${eyes.length}`)
const D = Math.hypot(eyes[1].cx - eyes[0].cx, eyes[1].cy - eyes[0].cy) // L1 眼距（脸部坐标）
const EYE_D = (eyes[0].rx + eyes[0].ry + eyes[1].rx + eyes[1].ry) / 2 // L1 眼径平均

const browser = await chromium.launch({ channel: 'chromium' })

// ———————————————— 量旧 04 ————————————————
function fitCircle(P) {
  let n = P.length, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  for (const [x, y] of P) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z }
  const A = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]]
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const f = A[j][i] / A[i][i]; for (let k = i; k < 4; k++) A[j][k] -= f * A[i][k] }
  const v = [0, 0, 0]
  for (let i = 2; i >= 0; i--) { let s = A[i][3]; for (let k = i + 1; k < 3; k++) s -= A[i][k] * v[k]; v[i] = s / A[i][i] }
  const cx = -v[0] / 2, cy = -v[1] / 2
  return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - v[2]) }
}
const p04 = await browser.newPage()
await p04.setContent(readFileSync(OLD04, 'utf8'))
const arcPts = await p04.evaluate(() => ['_LDC-0__w0h4vk8', '_LDC-0__w0h4vk9'].map((id) => {
  const e = document.getElementById(id), L = e.getTotalLength(), a = []
  for (let i = 0; i < 400; i++) { const q = e.getPointAtLength((L * i) / 400); a.push([q.x, q.y]) }
  return a
}))
await p04.close()
// 轮廓从左端内边起，顺着内边 → 右圆头 → 外边 → 左圆头。内边取 15–95，外边取 175–335（避开圆头）。
const m04 = arcPts.map((P) => {
  const fi = fitCircle(P.slice(15, 95)), fo = fitCircle(P.slice(175, 335))
  const cx = (fi.cx + fo.cx) / 2, cy = (fi.cy + fo.cy) / 2, rc = (fi.r + fo.r) / 2, w = fo.r - fi.r
  const A = P.map(([x, y]) => { let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI; if (a > 90) a -= 360; return a })
  const half = (Math.asin(w / 2 / rc) * 180) / Math.PI
  const capL = Math.min(...A) + half, capR = Math.max(...A) - half
  const mid = (capL + capR) / 2
  return { rc, w, span: capR - capL, tilt: mid + 90, midPt: [cx + rc * Math.cos(rad(mid)), cy + rc * Math.sin(rad(mid))] }
})
const D04 = Math.hypot(m04[1].midPt[0] - m04[0].midPt[0], m04[1].midPt[1] - m04[0].midPt[1])
const RC_D = (m04[0].rc + m04[1].rc) / 2 / D04
const W_D = (m04[0].w + m04[1].w) / 2 / D04
const SPAN = (m04[0].span + m04[1].span) / 2

// 旧 04 弧离脸斑、鼻子的最近距离（÷ 眼距）
const c04 = await browser.newPage()
await c04.setContent(readFileSync(OLD04, 'utf8'))
const clear04 = await c04.evaluate(() => {
  const s = (id, n) => { const e = document.getElementById(id), L = e.getTotalLength(); return Array.from({ length: n }, (_, i) => e.getPointAtLength((L * i) / n)) }
  const patch = s('_LDC-0__w0h4vk4', 3000), nose = s('_LDC-0__w0h4vk5', 1000)
  const m = (a, B) => Math.min(...a.map((p) => Math.min(...B.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))))
  return ['_LDC-0__w0h4vk8', '_LDC-0__w0h4vk9'].map((id) => { const a = s(id, 400); return { patch: m(a, patch), nose: m(a, nose) } })
})
await c04.close()
const CLR_D = Math.min(clear04[0].patch, clear04[1].patch) / D04

// ———————————————— 画弧 ————————————————
// 闭眼笑：向上拱（∩）。中心 (ex, cy) 是圆心；h = 半跨角（从正上方量）。
function arcPath(ex, cy, R, w, h) {
  const s = Math.sin(rad(h)), c = Math.cos(rad(h)), Ro = R + w / 2, Ri = R - w / 2, r = w / 2
  const P = (rr, sgn) => `${f2(ex + sgn * rr * s)} ${f2(cy - rr * c)}`
  return `M${P(Ro, -1)}A${f2(Ro)} ${f2(Ro)} 0 0 1 ${P(Ro, 1)}A${f2(r)} ${f2(r)} 0 0 1 ${P(Ri, 1)}A${f2(Ri)} ${f2(Ri)} 0 0 0 ${P(Ri, -1)}A${f2(r)} ${f2(r)} 0 0 1 ${P(Ro, -1)}Z`
}
const R = RC_D * D
const H = SPAN / 2
const W_A = W_D * D
const W_B = W_A * B_K
// 外框（脸部坐标）：顶 = cy − R − w/2；底 = 圆头圆心 cy − R cos h 再加 w/2
const boxA = (cy) => ({ top: cy - R - W_A / 2, bottom: cy - R * Math.cos(rad(H)) + W_A / 2 })
const eyeCy = (eyes[0].cy + eyes[1].cy) / 2
// a 的外框竖直中心对准原眼中心
let CY = eyeCy - (boxA(0).top + boxA(0).bottom) / 2

function build(w, cy, tag) {
  let out = src
  eyes.forEach((e, i) => {
    out = out.replace(e.str, `<path id="eye-${i ? 'r' : 'l'}" d="${arcPath(e.cx, cy, R, w, H)}" fill="${INK}" />`)
  })
  out = out.replace(/<!--[\s\S]*?-->/, `<!-- 对比稿，不是母版：「完成」闭眼（${tag} 版），从第五轮 L1 仰躺抱石（pose-round5/otter-float.svg）改来，只换了眼睛：两只墨色圆点换成两道向上拱的闭眼弧线，填充形状、两端圆头、没有描边；别的路径一笔没动。弧线比例照旧状态图 mascot/states/state-04-done.svg 量（scripts/brand/done-squint.mjs）。提案 · 单一来源。water 那块可以整块拿掉。 -->`)
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>獭獭 · 完成 · 仰躺抱石闭眼（${tag} 版）· 第六轮对比稿</title>`)
  return out
}

// 离脸斑（雾白）和鼻子的最近距离，脸部坐标
const probe = await browser.newPage()
async function clearance(svg) {
  await probe.setContent(svg)
  return probe.evaluate(() => {
    const face = document.getElementById('face')
    const patch = [...face.querySelectorAll('path')].find((p) => p.getAttribute('fill') === '#F2FAF6')
    const nose = [...face.querySelectorAll('path')].find((p) => p.getAttribute('fill') === '#191D18' && !p.id)
    const s = (e, n) => { const L = e.getTotalLength(); return Array.from({ length: n }, (_, i) => e.getPointAtLength((L * i) / n)) }
    const P = s(patch, 4000), N = s(nose, 1500)
    const m = (a, B) => Math.min(...a.map((p) => Math.min(...B.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))))
    return ['eye-l', 'eye-r'].map((id) => { const a = s(document.getElementById(id), 600); return { patch: m(a, P), nose: m(a, N) } })
  })
}
const need = CLR_D * D
let lift = 0
for (; lift < 60; lift++) {
  const c = await clearance(build(W_B, CY - lift, 'b'))
  if (Math.min(c[0].patch, c[1].patch) >= need) break
}
CY -= lift
const svgA = build(W_A, CY, 'a')
const svgB = build(W_B, CY, 'b')
const clrA = await clearance(svgA)
const clrB = await clearance(svgB)
await probe.close()
writeFileSync(path.join(OUT, 'otter-done-a.svg'), svgA)
writeFileSync(path.join(OUT, 'otter-done-b.svg'), svgB)

// ———————————————— compare.png ————————————————
const cols = [
  { label: 'L1 圆点眼（第 116 条）· pose-round5/otter-float.svg', svg: src },
  { label: `a · 粗细照旧 04（${f2(W_D * 100)}% 眼距）· otter-done-a.svg`, svg: svgA },
  { label: `b · 略粗（a × ${B_K}）· otter-done-b.svg`, svg: svgB },
]
const html = `<style>body{margin:0;padding:24px;background:${PAGE};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#5A6C75}.r{display:flex;gap:14px}figure{margin:0;background:#fff;border-radius:8px;padding:12px;width:400px}figcaption{padding-top:8px}img{display:block}.s{display:flex;gap:20px;align-items:flex-end;margin-top:14px;color:#5A6C75;font-size:12px}</style><h1>「完成」闭眼 · 第六轮：L1 只换眼睛</h1><p>对比稿 · 提案 · 单一来源。左边是第五轮 L1 原样（圆点眼）；中、右两版只把两只圆点换成闭眼弧线（填充形状、圆头、无描边），弯度相同，只差粗细。大图 400 宽，下面 96、48 宽（96、48 两张按 deviceScaleFactor 2 截图，看的时候以 400 那张为准）。</p><div class="r">${cols.map((c) => `<figure><img src="${uriSvg(c.svg)}" width="400"><div class="s"><div><img src="${uriSvg(c.svg)}" width="96">96</div><div><img src="${uriSvg(c.svg)}" width="48">48</div></div><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`
const pg = await browser.newPage({ viewport: { width: 1340, height: 600 }, deviceScaleFactor: 2 })
await pg.setContent(html)
await pg.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
await pg.close()

// ———————————————— eyes-zoom.png ————————————————
// 三版同一个取景框：脸部坐标里从头顶往下到脸斑下沿，按 face 的 transform 换到整图坐标
const fm = src.match(/<g id="face" transform="translate\(([\d.-]+) ([\d.-]+)\) rotate\(0\) scale\(([\d.]+)\) translate\(([\d.-]+) ([\d.-]+)\)"/)
if (!fm) throw new Error('没找到 face 的 transform')
const [tx, ty, sc, ux, uy] = fm.slice(1).map(Number)
const toOuter = (x, y) => [tx + sc * (x + ux), ty + sc * (y + uy)]
const [zx0, zy0] = toOuter(150, 250)
const [zx1, zy1] = toOuter(874, 540)
const zoomVB = `${f2(zx0)} ${f2(zy0)} ${f2(zx1 - zx0)} ${f2(zy1 - zy0)}`
const zoomSvg = (s) => s.replace(/viewBox="[^"]*"/, `viewBox="${zoomVB}"`)
const zHtml = `<style>body{margin:0;padding:24px;background:${PAGE};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#5A6C75}.r{display:flex;gap:14px}figure{margin:0;background:#fff;border-radius:8px;padding:12px;width:420px}figcaption{padding-top:8px}img{display:block}</style><h1>「完成」闭眼 · 第六轮：脸部放大</h1><p>三版同一取景、同一放大倍数（脸部坐标 x 150–874、y 250–540）。</p><div class="r">${cols.map((c) => `<figure><img src="${uriSvg(zoomSvg(c.svg))}" width="420"><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`
const zp = await browser.newPage({ viewport: { width: 1380, height: 400 }, deviceScaleFactor: 2 })
await zp.setContent(zHtml)
await zp.screenshot({ path: path.join(OUT, 'eyes-zoom.png'), fullPage: true })
await zp.close()

// 96、48 真像素（只给自己看，写到 POSE6_SMALL 指定的路径；不设就不出）
if (process.env.POSE6_SMALL) {
  const smHtml = `<style>body{margin:0;padding:16px;background:#fff;font:12px/1.4 system-ui,sans-serif;color:#5A6C75}.r{display:flex;gap:24px;align-items:flex-end;margin-bottom:14px}img{display:block}</style>${cols.map((c) => `<div class="r">${[96, 48].map((w) => `<div><img src="${uriSvg(c.svg)}" width="${w}"></div>`).join('')}</div>`).join('')}`
  const sm = await browser.newPage({ viewport: { width: 220, height: 200 }, deviceScaleFactor: 1 })
  await sm.setContent(smHtml)
  await sm.screenshot({ path: path.resolve(process.env.POSE6_SMALL), fullPage: true })
  await sm.close()
}
await browser.close()

const pxAt = (w) => (sc * w) / 1071 // 脸部 1 单位在整图 w 宽时是几像素（viewBox 宽 1071）
console.log(JSON.stringify({
  old04: { eyeDist: f2(D04), arcs: m04.map((m) => ({ rc: f2(m.rc), w: f2(m.w), span: f2(m.span), tilt: f2(m.tilt) })), clearPatch: clear04.map((c) => f2(c.patch)), clearNose: clear04.map((c) => f2(c.nose)) },
  ratios: { rc_over_D: +RC_D.toFixed(4), w_over_D: +W_D.toFixed(4), span: f2(SPAN), clearPatch_over_D: +CLR_D.toFixed(4) },
  L1: { eyeDist: f2(D), eyeDiam: f2(EYE_D), eyeCy: eyeCy },
  arc: {
    R: f2(R), halfSpan: f2(H), wA: f2(W_A), wB: f2(W_B), centerY: f2(CY), lift,
    widthA: f2(2 * R * Math.sin(rad(H)) + W_A), heightA: f2(R * (1 - Math.cos(rad(H))) + W_A),
    widthB: f2(2 * R * Math.sin(rad(H)) + W_B), heightB: f2(R * (1 - Math.cos(rad(H))) + W_B),
    boxA: { top: f2(CY - R - W_A / 2), bottom: f2(CY - R * Math.cos(rad(H)) + W_A / 2) },
  },
  clearance: { a: clrA.map((c) => ({ patch: f2(c.patch), nose: f2(c.nose) })), b: clrB.map((c) => ({ patch: f2(c.patch), nose: f2(c.nose) })), need: f2(need) },
  px: { w96: { a: f2(W_A * pxAt(96)), b: f2(W_B * pxAt(96)), eye: f2(EYE_D * pxAt(96)) }, w48: { a: f2(W_A * pxAt(48)), b: f2(W_B * pxAt(48)), eye: f2(EYE_D * pxAt(48)) } },
}, null, 1))
