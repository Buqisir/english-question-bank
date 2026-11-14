#!/usr/bin/env node
// 生态物件 · 第六轮（对比稿 · 提案 · 单一来源，2026-11-14）。照 image-review-2026-11-14/house-rules.md 和 BRAND.md 第 109、110 条。
//
// 用参数几何生成这一轮改的物件 SVG，写到 image-review-2026-11-14/ecosystem-round6/svg/（候选写到 svg/candidates/）。
// 前几轮的文件只读，不改。量和出图用 scripts/brand/unified-check.mjs（measure / preview / round6）。
//
// 画法：所有形都是平涂的闭合路径（Catmull-Rom 过点换成三次贝塞尔），没有描边、渐变、阴影。
// 「带」（生长纹、气囊中脉这种）是沿一条中线等宽往两边偏出去、两头半圆收口的闭合面，不是描边。
//
// 用法：node scripts/brand/ecosystem-round6.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/ecosystem-round6/svg')
const CAND = path.join(OUT, 'candidates')
mkdirSync(CAND, { recursive: true })

const C = { mint: '#72BFA4', deep: '#2C6E56', pale: '#DDF1E8', white: '#F2FAF6', stone: '#6E828C', face: '#8FA3AC' }
const f1 = (n) => (Math.round(n * 10) / 10).toString()

// ——— 几何小工具 ———
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const len = (a) => Math.hypot(a[0], a[1])
const norm = (a) => mul(a, 1 / (len(a) || 1))
const rot = (p, c, deg) => { const r = (deg * Math.PI) / 180, d = sub(p, c); return [c[0] + d[0] * Math.cos(r) - d[1] * Math.sin(r), c[1] + d[0] * Math.sin(r) + d[1] * Math.cos(r)] }
const scaleAbout = (p, c, s) => add(c, mul(sub(p, c), s))
const lerp = (a, b, t) => a + (b - a) * t

// 闭合 Catmull-Rom → 三次贝塞尔
function smoothClosed(pts, tension = 1) {
  const n = pts.length
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1 = add(p1, mul(sub(p2, p0), tension / 6)), c2 = sub(p2, mul(sub(p3, p1), tension / 6))
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`
  }
  return d + ' Z'
}
// 按弧长重采样一条折线（开的）
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = len(sub(b, a)); let t = step - carry
    while (t <= L) { out.push(add(a, mul(sub(b, a), t / L))); t += step }
    carry = L - (t - step)
  }
  if (len(sub(out[out.length - 1], pts[pts.length - 1])) > step * 0.3) out.push(pts[pts.length - 1])
  return out
}
// 沿中线的带：hw(t) 是半宽（t 从 0 到 1），两头半圆收口，返回闭合点列
function band(mid, hw) {
  const m = resample(mid, 2), n = m.length
  const tang = m.map((p, i) => norm(sub(m[Math.min(i + 1, n - 1)], m[Math.max(i - 1, 0)])))
  const w = m.map((_, i) => (typeof hw === 'function' ? hw(i / (n - 1)) : hw))
  const left = m.map((p, i) => add(p, mul([-tang[i][1], tang[i][0]], w[i])))
  const right = m.map((p, i) => add(p, mul([tang[i][1], -tang[i][0]], w[i])))
  const cap = (c, t, r, from) => { const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]), dir = Math.atan2(t[1], t[0]); const pts = []
    // 从 from 绕到对边，经过切线方向
    let sweep = Math.PI; const mid = a0 + sweep / 2; const dm = Math.atan2(Math.sin(mid - dir), Math.cos(mid - dir)); if (Math.abs(dm) > Math.PI / 2) sweep = -sweep
    for (let k = 1; k < 8; k++) { const a = a0 + (sweep * k) / 8; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]) }
    return pts }
  const endCap = cap(m[n - 1], tang[n - 1], w[n - 1], left[n - 1])
  const startCap = cap(m[0], mul(tang[0], -1), w[0], right[0])
  const pts = [...resample(left, 3), ...endCap, ...resample(right.slice().reverse(), 3), ...startCap]
  return pts
}
// 闭合点列按 Catmull-Rom 加密
function densify(pts, k = 10) {
  const n = pts.length, out = []
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3))) } }
  return out
}
const distTo = (p, poly) => Math.min(...poly.map((q) => len(sub(p, q))))
// 一条开的中线：从离外形最远的点往两头走，碰到离外形近于 minD 的点就停（两头都停），返回连着的一段
function trimRun(pts, outline, minD) {
  // 从离外形最远的点出发
  const ds = pts.map((p) => distTo(p, outline)); let bi = 0; ds.forEach((d, i) => { if (d > ds[bi]) bi = i })
  const run = [pts[bi]]
  for (let i = bi + 1; i < pts.length; i++) { if (distTo(pts[i], outline) < minD) break; run.push(pts[i]) }
  for (let i = bi - 1; i >= 0; i--) { if (distTo(pts[i], outline) < minD) break; run.unshift(pts[i]) }
  return run
}
const ellipsePts = (cx, cy, rx, ry, n = 24, rotDeg = 0) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return rot([cx + rx * Math.cos(a), cy + ry * Math.sin(a)], [cx, cy], rotDeg) })
const ellipseD = (cx, cy, rx, ry, rotDeg = 0) => {
  if (!rotDeg) return `M${f1(cx - rx)} ${f1(cy)} A${f1(rx)} ${f1(ry)} 0 1 1 ${f1(cx + rx)} ${f1(cy)} A${f1(rx)} ${f1(ry)} 0 1 1 ${f1(cx - rx)} ${f1(cy)} Z`
  return smoothClosed(ellipsePts(cx, cy, rx, ry, 32, rotDeg))
}

const header = (title, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<!-- 生态物件 · ${title}（第六轮）：${note} 对比稿 · 提案 · 单一来源 · 2026-11-14 · 生态物件第六轮（ecosystem-round6/README.md），由 scripts/brand/ecosystem-round6.mjs 生成。viewBox 240 = 獭獭头宽（含耳朵）1.0。纯平涂，无描边、无渐变、无阴影。 -->
<title>${title}</title>
`
const pathEl = (d, fill) => `  <path d="${d}" fill="${fill}" />\n`
const write = (file, s) => { writeFileSync(file, s + '</svg>\n'); console.log('写了', path.relative(ROOT, file)) }

// ════════ 1. 敲开的蛤（a 的形，壳加厚） ════════
function clamOpen({ angle, lidLen, lidDepth, bowlDepth, file, title, note }) {
  const H = [66, 140] // 铰合点
  const bowlR = 182
  const half = (bowlR - H[0]) / 2, cx = H[0] + half
  // 下片：碗，口沿略上拱，碗底左浅右深一点（不对称）
  const bowlCurve = (t) => [cx + half * Math.cos(t), H[1] + bowlDepth * Math.pow(Math.sin(t), 0.75) * (1 + 0.06 * Math.cos(t))] // t: 0 右端 → π 左端
  const bowl = []
  for (let i = 0; i <= 40; i++) bowl.push(bowlCurve((i / 40) * Math.PI))
  for (let i = 1; i < 16; i++) { const t = i / 16; bowl.push([H[0] + half - half * Math.cos(t * Math.PI), H[1] - 6 * Math.pow(Math.sin(t * Math.PI), 0.7)]) }
  // 下片的生长纹：两道小一号的碗形曲线，左端都靠向铰合点（生长纹朝壳顶收），右端停在口沿下面；离口沿和外轮廓 2px 以上
  const bands = []
  for (const [x0, x1, dep, hw] of (P.bowlArcs ?? [[72, 178, 32, 4.5], [78, 156, 17, 4.5]])) {
    const mid = []
    for (let i = 0; i <= 80; i++) { const t = (i / 80) * Math.PI; const p = [(x0 + x1) / 2 + ((x1 - x0) / 2) * Math.cos(t), H[1] - 2 + dep * Math.pow(Math.sin(t), 0.75) * (1 + 0.06 * Math.cos(t))]; if (p[1] > H[1] + (P.bowlTop ?? 7) + hw) mid.push(p) }
    if (mid.length > 2) bands.push(band(trimRun(mid, resample([...bowl, bowl[0]], 1.5), hw + (P.bowlEdge ?? 6.5)), hw))
  }
  // 上片：同一种碗形翻过来（拱朝上），短一点、浅一点，绕铰合点往上掀
  const lidHalf = lidLen / 2, lcx = H[0] + lidHalf
  const lidCurve = (t) => [lcx + lidHalf * Math.cos(t), H[1] - lidDepth * Math.pow(Math.sin(t), 0.7) * (1 - 0.1 * Math.cos(t))]
  const lid = []
  for (let i = 0; i <= 40; i++) lid.push(lidCurve((i / 40) * Math.PI))
  for (let i = 1; i < 14; i++) { const t = i / 14; lid.push([H[0] + lidHalf - lidHalf * Math.cos(t * Math.PI), H[1] + 5 * Math.pow(Math.sin(t * Math.PI), 0.7)]) }
  const lidR = lid.map((p) => rot(p, H, -angle))
  // 上片里面（雾白）：贴着口沿往里一块扁透镜，四周留雾薄荷厚边
  const inner = []
  const ia = H[0] + 22, ib = H[0] + 2 * lidHalf - 11, ih = lidDepth * (P.lidWhite ?? 0.36), base = H[1] - 7.5
  for (let i = 0; i <= 24; i++) { const t = i / 24; inner.push([lerp(ib, ia, t), base - ih * Math.pow(Math.sin(t * Math.PI), 0.6) * (1 - 0.2 * t)]) }
  for (let i = 1; i < 10; i++) { const t = i / 10; inner.push([lerp(ia, ib, t), base + 2.5 * Math.pow(Math.sin(t * Math.PI), 0.6)]) }
  const innerR = inner.map((p) => rot(p, H, -angle))
  let s = header(title, note)
  s += pathEl(smoothClosed(bowl), C.mint)
  s += pathEl(smoothClosed(lidR), C.mint)
  s += pathEl(ellipseD(H[0] + 2, H[1] - 1, 9, 9), C.mint) // 铰合处一块圆，把上下片连成一个
  for (const b of bands) s += pathEl(smoothClosed(b), C.pale)
  s += pathEl(smoothClosed(innerR), C.white)
  write(file, s)
}

// ════════ 2. 合着的蛤 ════════
function clamClosed({ file, title, note, bandsSpec, ctr, gapDeg }) {
  // 外形：不对称的圆壳，壳顶 U 偏左，略翘出一点
  const U = [101, 72]
  const outline = [U, [114, 75], [134, 81], [156, 93], [174, 110], [182, 128], [178, 145], [164, 157], [142, 164], [116, 166], [91, 163], [71, 155], [59, 141], [57, 124], [63, 106], [75, 91], [89, 79]]
  const dense = []
  // Catmull-Rom 采样出外形中线，供缩放成纹
  const n = outline.length
  for (let i = 0; i < n; i++) { const p0 = outline[(i - 1 + n) % n], p1 = outline[i], p2 = outline[(i + 1) % n], p3 = outline[(i + 2) % n]
    for (let k = 0; k < 10; k++) { const t = k / 10, t2 = t * t, t3 = t2 * t
      dense.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))) } }
  const upAng = Math.atan2(U[1] - ctr[1], U[0] - ctr[0])
  let s = header(title, note)
  s += pathEl(smoothClosed(outline), C.mint)
  for (const [sc, hw, rMin] of bandsSpec) {
    // 外形朝 ctr（壳顶下方一点）缩放成一道纹；只留外形上离 ctr 不近于 rMin 的那一段（从壳底往两边连着的一段），
    // 两头因此停在朝壳顶的射线上，纹越往里越短，看起来都朝壳顶收
    const pts = dense.map((p) => ({ p: scaleAbout(p, ctr, sc), r: len(sub(p, ctr)) }))
    let bi = 0; pts.forEach((o, i) => { if (o.p[1] > pts[bi].p[1]) bi = i })
    const N = pts.length, run = [pts[bi].p]
    for (let i = 1; i < N / 2; i++) { const o = pts[(bi + i) % N]; if (o.r < rMin) break; run.push(o.p) }
    for (let i = 1; i < N / 2; i++) { const o = pts[(bi - i + N) % N]; if (o.r < rMin) break; run.unshift(o.p) }
    s += pathEl(smoothClosed(band(trimRun(run, densify(outline), hw + (P.clamEdge ?? 6.5)), hw)), C.pale)
  }
  write(file, s)
}

// ════════ 3. 扇贝 ════════
function scallop({ file, title, note, lobes, span, R0, bump, wedge }) {
  const Hc = [120, 176] // 放射中心（铰合处）
  const deg = Math.PI / 180
  const lobeW = (2 * span) / lobes
  const r = (th) => { // th 以竖直向上为 0，度
    const u = (th + span) / lobeW, k = Math.floor(Math.min(u, lobes - 1e-9)), f = u - k
    const b = Math.pow(Math.sin(f * Math.PI), 0.55)
    const dome = Math.cos(th * deg * 0.55) // 中间高两边低，整体是一道圆弧
    return R0 * dome + bump * b
  }
  const P = (th, rr) => [Hc[0] + rr * Math.sin(th * deg), Hc[1] - rr * Math.cos(th * deg)]
  const out = []
  for (let i = 0; i <= 200; i++) { const th = -span + (2 * span * i) / 200; out.push(P(th, r(th))) }
  // 两侧顺下来收到铰合处
  const neckY = 172, neckHW = 9
  const lEnd = out[0], rEnd = out[out.length - 1]
  const side = (a, b, n) => Array.from({ length: n }, (_, i) => { const t = (i + 1) / (n + 1); return [lerp(a[0], b[0], t) + Math.sin(t * Math.PI) * (a[0] < 120 ? -3 : 3), lerp(a[1], b[1], t)] })
  const fan = [...out, ...side(rEnd, [Hc[0] + neckHW, neckY], 6), [Hc[0] + neckHW, neckY], [Hc[0] - neckHW, neckY], ...side([Hc[0] - neckHW, neckY], lEnd, 6)]
  // 耳：铰合处一块下宽上窄的圆角梯形，和扇面的下端连成一块，两侧在扇边和耳角之间留一个小凹
  const eb = P.earBottom ?? 30, et = P.earTop ?? 14, ey0 = P.earY ?? 166
  // 耳尖往外上方翘一点
  const ear = P.ear ?? [[108, 171], [132, 171], [145, 164], [151, 167], [148, 181], [143, 185], [97, 185], [92, 181], [89, 167], [95, 164]]
  let s = header(title, note)
  s += pathEl(smoothClosed(fan, 0.9), C.mint)
  s += pathEl(smoothClosed(ear, 0.7), C.mint)
  // 楔形缝：从铰合处放射，对着瓣与瓣之间的凹处，下窄上宽，两头圆
  for (let k = 1; k < lobes; k++) {
    const th = -span + k * lobeW
    const top = r(th) - wedge.topGap, bot = wedge.inner
    const mid = []; for (let i = 0; i <= 20; i++) mid.push(P(th, lerp(bot, top - wedge.wTop, i / 20)))
    s += pathEl(smoothClosed(band(mid, (t) => lerp(wedge.wBot, wedge.wTop, t))), C.pale)
  }
  write(file, s)
}

// ════════ 4. 巨藻一段 ════════
function kelp({ file, title, note, mode, opt = {}, bladesOpt }) {
  const K = { top: 50, bot: 218, bulbR: 10.5, wMax: 18, rib: 4.8, margin: 11, bulbMargin: 9, peak: 0.4, tipW: 7.5, ...opt, ...(P.kelp || {}) }
  // 茎：一条略弯的带（不窄于 2px），顶上收圆
  const stemAt = (y) => { const t = (K.bot - y) / (K.bot - K.top); return [124 + 6 * Math.sin(t * Math.PI * 1.2) - 3 * t, y] }
  const stem = []; for (let i = 0; i <= 40; i++) stem.push(stemAt(lerp(K.bot, K.top, i / 40)))
  let s = header(title, note)
  const deepParts = [band(stem, (t) => lerp(5.4, 4.8, t))], pale = []
  // 三片叶左右交替；叶根一个圆气囊挨着茎，叶从气囊往外长出去、再往上弯（带状，叶尖钝圆）
  const blades = P.kelpBlades ?? bladesOpt ?? [
    { y: 196, side: -1, ang: 38, curl: 34, L: 92 },
    { y: 152, side: 1, ang: 40, curl: 32, L: 90 },
    { y: 108, side: -1, ang: 44, curl: 30, L: 78 },
  ]
  const bulbR = mode === 'bulb' ? K.bulbR + 6 : K.bulbR + 2.5
  for (const b of blades) {
    const sp = stemAt(b.y)
    const a0 = (b.ang * Math.PI) / 180
    const dir = [b.side * Math.cos(a0), -Math.sin(a0)]
    const bc = add([sp[0] + b.side * 2, sp[1]], mul(dir, bulbR + 1))
    deepParts.push(ellipsePts(bc[0], bc[1], bulbR, bulbR, 28))
    // 中线：方向从 ang 渐渐转到 ang + curl（往上弯）
    const mid = [add(bc, mul(dir, bulbR * 0.8))]
    for (let i = 1; i <= 40; i++) { const t = i / 40, a = a0 + ((b.curl * Math.PI) / 180) * Math.pow(t, 1.3); mid.push(add(mid[i - 1], mul([b.side * Math.cos(a), -Math.sin(a)], b.L / 40))) }
    // 叶宽：叶根收成颈（让气囊在剪影里鼓出来），一成多就到最宽，往叶尖略收，叶尖钝圆
    const hw = (t) => { const u = Math.max(0, (t - 0.06) / 0.94); return u < K.peak ? 5.4 + (K.wMax - 5.4) * Math.pow(Math.sin((u / K.peak) * Math.PI / 2), 0.8) : K.wMax - (K.wMax - K.tipW) * Math.pow((u - K.peak) / (1 - K.peak), 1.6) }
    deepParts.push(band(mid, hw))
    // 浅色中脉：等宽，放在叶够宽（离叶边留 margin）的那段，叶尖前停住
    const n = mid.length, keep = []
    mid.forEach((p, i) => { const t = i / (n - 1); if (t <= 0.88 && hw(t) - K.rib >= K.margin && len(sub(p, bc)) > bulbR + K.rib + 4) keep.push(p) })
    if (keep.length > 3) {
      // 叶面浅色：顺着叶形往里收的一块（叶宽减两边 margin）
      { const i0 = mid.indexOf(keep[0]), i1 = mid.indexOf(keep[keep.length - 1]); pale.push(band(keep, (u) => Math.max(K.rib, hw(lerp(i0, i1, u) / (n - 1)) - K.margin))) }
    }
    if (mode === 'bulb') pale.push(ellipsePts(bc[0], bc[1], bulbR - K.bulbMargin, bulbR - K.bulbMargin, 24))
  }
  for (const p of deepParts) s += pathEl(smoothClosed(p), C.deep)
  for (const p of pale) s += pathEl(smoothClosed(p), C.pale)
  write(file, s)
}

// ════════ 5. 海胆 L：球和刺照第五轮，顶面放大 ════════
function urchin({ file, title, note, face }) {
  const spines = 'M113 98 L115.5 66 A4.5 4.5 0 0 1 124.5 66 L127 98 Z M128 97 L141 79.5 A4.5 4.5 0 0 1 149 84 L140 104 Z M139.5 101 L166.5 83.5 A4.5 4.5 0 0 1 172 91 L148 112 Z M151 113 L173 113 A4.5 4.5 0 0 1 174 122 L152.5 127 Z M151 130 L179.5 145 A4.5 4.5 0 0 1 175.5 153.5 L145.5 143 Z M144.5 140 L155 154.5 A4.5 4.5 0 0 1 148.5 160.5 L134.5 149.5 Z M133 148 L136.5 172.5 A4.5 4.5 0 0 1 128 174.5 L119.5 151 Z M119 151.5 L111.5 167.5 A4.5 4.5 0 0 1 103 165 L105.5 147 Z M107.5 150 L90 167.5 A4.5 4.5 0 0 1 83 162 L96.5 141 Z M93.5 141.5 L72 147 A4.5 4.5 0 0 1 68.5 138.5 L88.5 128.5 Z M87.5 125.5 L56.5 117.5 A4.5 4.5 0 0 1 58 108.5 L90 111.5 Z M91 114 L74 100 A4.5 4.5 0 0 1 78.5 92 L98.5 102 Z M101 103.5 L88.5 74 A4.5 4.5 0 0 1 96.5 69.5 L113.5 97 Z'
  let s = header(title, note)
  s += pathEl(spines, C.stone)
  s += pathEl('M80 124 A40 34 0 1 1 160 124 A40 34 0 1 1 80 124 Z', C.stone)
  s += pathEl(face, C.face)
  write(file, s)
}

// ════════ 6. 圆墩石：外形照第二轮，顶面往里收 ════════
function stoneRound({ file, title, note, k, dy }) {
  const facePts = [[84, 120], [86, 106], [98, 98], [114, 96], [130, 94], [144, 100], [148, 110], [150, 117], [142, 122], [126, 124], [108, 126], [92, 126], [87, 124]]
  const c = [116, 111]
  const f = facePts.map((p) => add(scaleAbout(p, c, k), [0, dy]))
  let s = header(title, note)
  s += pathEl('M73.5 146.5 C68.5 127.5 78.5 105 101 95 C120 86 146 89.5 159.5 105 C171.5 119 171.5 141 161.5 153 C152.5 162 130.5 163.5 106 162 C87.5 160 77 156.5 73.5 146.5 Z', C.stone)
  s += pathEl(smoothClosed(f, 0.9), C.face)
  write(file, s)
}

const P = JSON.parse(process.env.R6 || '{}') // 调参时用：R6='{"clamOpenAngle":40}'

clamOpen({ angle: P.clamOpenAngle ?? 40, lidLen: 112, lidDepth: 30, bowlDepth: 44, file: path.join(CAND, 'clam-open-a6-1.svg'), title: '敲开的蛤 · 候选 a6-1', note: '第四轮候选 a 的形（侧面半开、不垫石头，BRAND.md 第 109 条），两片壳加厚成实心：下片是实心的碗，带两道浅雾薄荷生长纹（朝铰合那头收，不碰口沿和外轮廓）；上片是同一种碗形翻过来、往上掀约 40°，露出里面一块雾白，四周留雾薄荷厚边。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8、雾白 #F2FAF6。' })
clamOpen({ angle: P.clamOpenAngle2 ?? 52, lidLen: 104, lidDepth: 30, bowlDepth: 44, file: path.join(CAND, 'clam-open-a6-2.svg'), title: '敲开的蛤 · 候选 a6-2', note: '同 a6-1，上片短一点、掀得更开（约 52°），开口更不像嘴。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8、雾白 #F2FAF6。' })

clamClosed({ file: path.join(CAND, 'clam-c1-three.svg'), title: '蛤 · 候选 c1（三道纹）', note: '重画外形：不对称的圆壳，壳顶偏左。三道等宽的浅雾薄荷生长纹，是外形朝壳顶下方一点缩放出来的，从壳顶一侧绕到另一侧，两头收到壳顶附近停住，不相交、不贴外轮廓。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8。', ctr: P.c1ctr ?? [106, 84], gapDeg: P.c1gap ?? 44, bandsSpec: P.c1bands ?? [[0.74, 3.8, 22], [0.5, 3.8, 34], [0.27, 3.8, 46]] })
clamClosed({ file: path.join(CAND, 'clam-c2-two.svg'), title: '蛤 · 候选 c2（两道纹）', note: '外形同 c1。两道更宽的浅雾薄荷生长纹，朝壳顶收，两头停在壳顶两侧，不相交、不贴外轮廓。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8。', ctr: P.c2ctr ?? [104, 80], gapDeg: P.c2gap ?? 40, bandsSpec: P.c2bands ?? [[0.74, 5, 20], [0.46, 5, 30]] })

scallop({ file: path.join(CAND, 'scallop-s1-five.svg'), title: '扇贝 · 候选 s1（五瓣四缝）', note: '扇形，五瓣，下面一对铰合的小耳。四道浅雾薄荷楔形缝从铰合处放射出来，下窄上宽、两头圆，对着瓣与瓣之间的凹处，不碰外轮廓。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8。', lobes: 5, span: P.sSpan ?? 52, R0: P.sR0 ?? 90, bump: 12, wedge: { inner: 40, topGap: 11, wBot: 4.2, wTop: 7 } })
scallop({ file: path.join(CAND, 'scallop-s2-four.svg'), title: '扇贝 · 候选 s2（四瓣三缝，窄扇）', note: '扇形收窄，四瓣，下面一对铰合的小耳。三道浅雾薄荷楔形缝从铰合处放射。雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8。', lobes: 4, span: 46, R0: 90, bump: 13, wedge: { inner: 40, topGap: 11, wBot: 4.4, wTop: 7.6 } })

kelp({ file: path.join(CAND, 'kelp-k1-bulb.svg'), title: '巨藻一段 · 候选 k1（浅色气囊）', note: '茎收细；三片长叶左右交替、往上斜，叶根收成颈，颈和茎之间一个圆气囊，气囊中间一块浅雾薄荷圆；每片叶中间一块顺着叶形往里收的浅雾薄荷（Owner 2026-11-14，BRAND.md 第 110 条：巨藻可加浅雾薄荷次色），都离外沿 2px 以上。深薄荷 #2C6E56、浅雾薄荷 #DDF1E8。', mode: 'bulb', opt: { margin: 10.5 } })
kelp({ file: path.join(CAND, 'kelp-k2-leaf.svg'), title: '巨藻一段 · 候选 k2（叶面浅色）', note: '茎收细；三片长叶左右交替、往上斜，叶根收成颈，颈和茎之间一个深薄荷圆气囊，靠剪影里鼓出来的圆读；每片叶中间一块顺着叶形往里收的浅雾薄荷，离叶边 2px 以上（BRAND.md 第 110 条）。深薄荷 #2C6E56、浅雾薄荷 #DDF1E8。', mode: 'leaf', opt: { margin: 10.5 } })

urchin({ file: path.join(OUT, 'urchin.svg'), title: '海胆', note: '球和刺同第五轮没动；顶面放大到和石头一个密度，形状照石头顶面（上拱下平的一块），离球的外沿仍留 2px 以上。石色 #6E828C、石面 #8FA3AC。', face: smoothClosed(P.urchinFace ?? [[92, 116], [95, 108], [103, 102], [114, 99], [126, 99], [137, 102], [145, 108], [149, 116], [145, 123], [131, 126], [118, 127], [104, 126], [95, 122]], 0.9) })

stoneRound({ file: path.join(OUT, 'stone-round.svg'), title: '石头 · 圆墩', note: '外形同第二轮没动；顶面按自身中心缩小一点、往下挪一点，离外沿留出 2px 以上（48px 贴边裁，脚本量）。石色 #6E828C、石面 #8FA3AC。', k: P.stoneK ?? 0.88, dy: P.stoneDy ?? 2.5 })

// ——— 推荐的那一版另存成正式文件名（svg/ 根下），候选留在 svg/candidates/ ———
const PICK = [
  ['clam-open-a6-1.svg', 'clam-open-on-stone.svg', '敲开的蛤 a（第六轮，推荐 a6-1）'],
  ['clam-c1-three.svg', 'clam.svg', '蛤（第六轮，推荐 c1）'],
  ['scallop-s1-five.svg', 'scallop.svg', '扇贝（第六轮，推荐 s1）'],
  ['kelp-k1-bulb.svg', 'kelp-blade.svg', '巨藻一段（第六轮，推荐 k1）'],
]
for (const [from, to, title] of P.pick ?? PICK) {
  const s = readFileSync(path.join(CAND, from), 'utf8').replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace('（第六轮）：', `（第六轮）：推荐稿，和 candidates/${from} 相同。`)
  writeFileSync(path.join(OUT, to), s)
  console.log('写了', path.relative(ROOT, path.join(OUT, to)), '←', from)
}
