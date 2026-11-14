#!/usr/bin/env node
// 生态物件 · 第七轮：只重画巨藻一段（对比稿 · 提案 · 单一来源，2026-11-14）。照 image-review-2026-11-14/house-rules.md 和 BRAND.md 第 110 条。
//
// 第六轮的 k1、k2 没过复核（叶是深色圈里一块浅色，读成描边的环；整体像带叶小枝）。这一轮照真的巨藻（Macrocystis）画：
// 一根略弯的茎，两到三片长的宽飘带叶都顺着水流往同一侧飘，每片叶的根部一个水滴形气囊接在茎上。
// 两个候选，次色浅雾薄荷只用在一处：
//   A：气囊整个是浅雾薄荷的实心水滴，外面留一圈深薄荷；叶全深色实心。
//   B：每片叶一条浅雾薄荷中脉带；气囊深色实心。
//
// 画法同第六轮脚本：平涂的闭合路径（Catmull-Rom 过点换成三次贝塞尔），没有描边、渐变、阴影。
// 写到 image-review-2026-11-14/ecosystem-round7/svg/（候选在 svg/candidates/）。前几轮的文件只读。
// 量和出图用 scripts/brand/unified-check.mjs（measure / preview / round7）。
//
// 用法：node scripts/brand/ecosystem-round7.mjs      调参：R7='{"a":{...},"b":{...}}' node scripts/brand/ecosystem-round7.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/ecosystem-round7/svg')
const CAND = path.join(OUT, 'candidates')
mkdirSync(CAND, { recursive: true })

const C = { deep: '#2C6E56', pale: '#DDF1E8' }
const f1 = (n) => (Math.round(n * 10) / 10).toString()
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const len = (a) => Math.hypot(a[0], a[1])
const norm = (a) => mul(a, 1 / (len(a) || 1))
const lerp = (a, b, t) => a + (b - a) * t
const rad = (d) => (d * Math.PI) / 180

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
// 沿中线的带：左右半宽各自给（hwL(t)、hwR(t)，t 从 0 到 1），两头半圆收口，返回闭合点列
function band(mid, hwL, hwR = hwL, step = 3) {
  const m = resample(mid, 1.5), n = m.length
  const tang = m.map((p, i) => norm(sub(m[Math.min(i + 1, n - 1)], m[Math.max(i - 1, 0)])))
  const wl = m.map((_, i) => hwL(i / (n - 1))), wr = m.map((_, i) => hwR(i / (n - 1)))
  const left = m.map((p, i) => add(p, mul([-tang[i][1], tang[i][0]], wl[i])))
  const right = m.map((p, i) => add(p, mul([tang[i][1], -tang[i][0]], wr[i])))
  const cap = (c, t, from, to) => {
    // 从 from 绕过切线方向 t 到 to 的半个椭圆
    const a = sub(from, c), b = sub(to, c), pts = []
    for (let k = 1; k < 8; k++) { const th = (Math.PI * k) / 8; const r = Math.sin(th), q = Math.cos(th)
      // 起点 a、终点 b，中间朝 t 方向鼓出
      const rr = (len(a) + len(b)) / 2
      pts.push(add(c, add(add(mul(a, (1 + q) / 2), mul(b, (1 - q) / 2)), mul(t, rr * r)))) }
    return pts
  }
  const endCap = cap(m[n - 1], tang[n - 1], left[n - 1], right[n - 1])
  const startCap = cap(m[0], mul(tang[0], -1), right[0], left[0])
  return [...resample(left, step), ...endCap, ...resample(right.slice().reverse(), step), ...startCap]
}
// 水滴：圆头在 c，朝 dir 方向拉出尖（尖头是圆的），rx 朝 dir 方向的半长、ry 横向半宽，pinch 越大尖头越细
function drop(c, dir, rx, ry, pinch = 0.35, n = 40) {
  const u = norm(dir), v = [-u[1], u[0]], pts = []
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI, x = Math.cos(th), y = Math.sin(th)
    const along = x >= 0 ? x * rx * 1.0 : x * ry // 后半是圆，前半拉长
    const across = y * ry * (x >= 0 ? 1 - pinch * Math.pow(x, 1.6) : 1)
    pts.push(add(c, add(mul(u, along), mul(v, across))))
  }
  return pts
}

// 闭合点列（逆/顺时针都行）往里收 d：每点沿法线往里挪，再去掉挪过头的点（只用在气囊这种凸形上）
function inset(pts, d) {
  const n = pts.length
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1] }
  const sgn = area > 0 ? 1 : -1
  const out = pts.map((p, i) => { const t = norm(sub(pts[(i + 1) % n], pts[(i - 1 + n) % n])); return add(p, mul([-t[1] * sgn, t[0] * sgn], d)) })
  // 外形上每点到收过的点的最短距离应不小于 d；小于的（尖头处挪过头）去掉
  return out.filter((q) => Math.min(...pts.map((p) => len(sub(p, q)))) >= d - 0.3)
}

const header = (title, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<!-- 生态物件 · ${title}（第七轮）：${note} 对比稿 · 提案 · 单一来源 · 2026-11-14 · 生态物件第七轮（ecosystem-round7/README.md），由 scripts/brand/ecosystem-round7.mjs 生成。viewBox 240 = 獭獭头宽（含耳朵）1.0。纯平涂，无描边、无渐变、无阴影。 -->
<title>${title}</title>
`
const pathEl = (d, fill) => `  <path d="${d}" fill="${fill}" />\n`
const write = (file, s) => { writeFileSync(file, s + '</svg>\n'); console.log('写了', path.relative(ROOT, file)) }

const P = JSON.parse(process.env.R7 || '{}')

// ════════ 巨藻一段 ════════
// 茎是过几个点的光滑曲线（略呈 S）；叶都顺着水流往同一个方向飘，叶中线带一道缓的 S 波，叶边有小波。
// 叶的方向 ang 是绝对角度（度，0 = 朝右，90 = 朝上），bend 是从叶根到叶尖总共转的角度，wave 是叠上去的 S 波幅度。
function openSpline(pts, k = 16) {
  const n = pts.length, out = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)]
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3))) }
  }
  out.push(pts[n - 1]); return resample(out, 1)
}
function kelp({ file, title, note, mode, o = {} }) {
  const K = {
    // 默认是候选 B 的形；候选 A 在下面另给（气囊大、叶短一点，好让浅色占到 15% 以上）
    stem: [[40, 236], [48, 206], [50, 178], [64, 150], [84, 126], [92, 98]], stemHw: [6.4, 5.6],
    wMax: 21, wNeck: 7.5, wTip: 4.5, tipPow: 0.85, ripple: 2.4, rippleCycles: 2.6, // 叶的半宽：最宽、颈、叶尖；叶尖收的快慢；边上的小波
    bulb: [25, 18.5, 0.5], // 气囊 rx（顺叶方向）、ry、尖的收细
    paleRim: 12.5, // A：浅色水滴离气囊外沿（往里收）
    ribMargin: 11.5, ribMin: 6.5, ribMax: 7.5, ribFrom: 0.2, ribTo: 0.86, // B：中脉离叶边、中脉半宽、从叶的哪段到哪段
    blades: [
      { t: 0.1, ang: 6, bend: 22, wave: 18, L: 160, bulbOff: 0.5 },
      { t: 0.55, ang: 20, bend: 20, wave: 17, L: 136, bulbOff: 0.5 },
      { t: 1, ang: 40, bend: -6, wave: 14, L: 110, bulbOff: 0.5 },
    ],
    ...o,
  }
  const stem = openSpline(K.stem), SN = stem.length - 1
  const stemAt = (t) => stem[Math.round(t * SN)]
  let s = header(title, note)
  const deep = [band(stem, (t) => lerp(K.stemHw[0], K.stemHw[1], t))], pale = []
  for (const b of K.blades) {
    const sp = stemAt(b.t)
    const a0 = rad(b.ang)
    const dir0 = [Math.cos(a0), -Math.sin(a0)]
    const [brx, bry, pinch] = b.bulb ?? K.bulb
    // 气囊：圆头压在茎上，尖朝叶的方向
    const bc = add(sp, mul(dir0, bry * (b.bulbOff ?? 0.6)))
    deep.push(drop(bc, dir0, brx, bry, pinch))
    if (mode === 'A') pale.push(inset(drop(bc, dir0, brx, bry, pinch, 96), K.paleRim))
    // 叶中线：从气囊尖出发
    const start = add(bc, mul(dir0, brx * 0.8))
    const mid = [start]; const N = 80, L = b.L * (K.bladeScale ?? 1)
    for (let i = 1; i <= N; i++) {
      const t = i / N
      const a = a0 + rad(b.bend) * Math.pow(t, b.bendPow ?? 1.2) + rad(b.wave ?? 0) * Math.sin(2 * Math.PI * t * (b.cycles ?? 1))
      mid.push(add(mid[i - 1], mul([Math.cos(a), -Math.sin(a)], L / N)))
    }
    const wMax = b.wMax ?? K.wMax
    const base = (t) => {
      if (t < 0.16) return K.wNeck + (wMax - K.wNeck) * Math.pow(Math.sin((t / 0.16) * Math.PI / 2), 1.2)
      if (t < 0.6) return wMax
      return wMax - (wMax - K.wTip) * Math.pow((t - 0.6) / 0.4, K.tipPow ?? 1.4)
    }
    // 叶边小波：叶根和叶尖都收掉，免得叶尖起疙瘩
    const rip = (t, ph) => (t < 0.14 || t > 0.84 ? 0 : K.ripple * Math.sin(2 * Math.PI * (t * K.rippleCycles + ph)) * Math.min(1, (t - 0.14) / 0.12, (0.84 - t) / 0.2))
    deep.push(band(mid, (t) => base(t) + rip(t, 0.1), (t) => base(t) + rip(t, 0.6)))
    if (mode === 'B') {
      const ribHw = (t) => Math.min(K.ribMax ?? 99, Math.max(K.ribMin, base(t) - K.ripple - K.ribMargin))
      const keep = [], ts = []
      mid.forEach((p, i) => { const t = i / N; if (t >= (K.ribFrom ?? 0.17) && t <= (K.ribTo ?? 0.86) && base(t) - K.ripple - K.ribMargin >= K.ribMin) { keep.push(p); ts.push(t) } })
      pale.push(band(keep, (u) => ribHw(lerp(ts[0], ts[ts.length - 1], u))))
    }
  }
  // 放进画框：整体等比缩放，宽 = fitW 头宽（高不超过 fitH），水平居中，竖直居中。量数按贴边裁量，等比缩放不改量数。
  const all = deep.flat(), xs = all.map((q) => q[0]), ys = all.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const k = Math.min(((K.fitW ?? 0.76) * 240) / (x1 - x0), (K.fitH ?? 0.9) * 240 / (y1 - y0))
  const fit = (q) => [120 + (q[0] - (x0 + x1) / 2) * k, 120 + (q[1] - (y0 + y1) / 2) * k]
  const side = Math.max(x1 - x0, y1 - y0) * k + 8, px48 = (u) => ((u * k * 48) / side).toFixed(1) // 换成 48px 贴边裁下的像素
  console.log(`  ${mode}：宽 ${((x1 - x0) * k / 240).toFixed(2)} 头宽，高 ${((y1 - y0) * k / 240).toFixed(2)} 头宽；48px 下叶最宽约 ${px48(2 * (K.wMax + K.ripple))}px（不算小波 ${px48(2 * K.wMax)}px）、茎宽 ${px48(2 * K.stemHw[1])}–${px48(2 * K.stemHw[0])}px、气囊 ${px48(2 * K.bulb[1])}px 宽`)
  for (const p of deep) s += pathEl(smoothClosed(p.map(fit)), C.deep)
  for (const p of pale) s += pathEl(smoothClosed(p.map(fit)), C.pale)
  write(file, s)
}

const SHAPE = P.shape ?? {}
const SHAPE_A = {
  fitH: 0.93, stem: [[38, 240], [46, 208], [50, 176], [64, 146], [86, 120], [96, 90]],
  bulb: [44, 30, 0.55], bladeScale: 0.72, wMax: 19, ripple: 2, rippleCycles: 2,
  blades: [
    { t: 0.08, ang: 2, bend: 22, wave: 18, L: 172, bulbOff: 0.5 },
    { t: 0.54, ang: 16, bend: 20, wave: 17, L: 148, bulbOff: 0.5 },
    { t: 1, ang: 36, bend: -6, wave: 14, L: 120, bulbOff: 0.5 },
  ],
}
const NOTE_A = '照真的巨藻（Macrocystis）画：一根略呈 S 形的茎，三片长的宽飘带叶都在茎的同一侧、顺着水流往右上飘，叶边带一点波；每片叶根部一个水滴形气囊接在茎上。气囊整个是一块浅雾薄荷的实心水滴，外面留一圈深薄荷（离外沿 2px 以上，48px 贴边裁，脚本量）；叶和茎是深薄荷实心（BRAND.md 第 110 条）。深薄荷 #2C6E56、浅雾薄荷 #DDF1E8。'
const NOTE_B = '照真的巨藻（Macrocystis）画：一根略呈 S 形的茎，三片长的宽飘带叶都在茎的同一侧、顺着水流往右上飘，叶边带一点波；每片叶根部一个深薄荷实心水滴形气囊接在茎上。每片叶中间一条顺着叶走的浅雾薄荷中脉带，离叶边 2px 以上（48px 贴边裁，脚本量；BRAND.md 第 110 条）。深薄荷 #2C6E56、浅雾薄荷 #DDF1E8。'
kelp({ file: path.join(CAND, 'kelp-k7a-pale-bulb.svg'), title: '巨藻一段 · 候选 A（浅色气囊）', note: NOTE_A, mode: 'A', o: { ...SHAPE_A, ...SHAPE, ...(P.a || {}) } })
kelp({ file: path.join(CAND, 'kelp-k7b-pale-rib.svg'), title: '巨藻一段 · 候选 B（浅色中脉）', note: NOTE_B, mode: 'B', o: { ...SHAPE, ...(P.b || {}) } })

// 推荐的那一版另存成正式文件名
const [from, title] = P.pick ?? ['kelp-k7b-pale-rib.svg', '巨藻一段（第七轮，推荐 B）']
const out = readFileSync(path.join(CAND, from), 'utf8').replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace('（第七轮）：', `（第七轮）：推荐稿，和 candidates/${from} 相同。`)
writeFileSync(path.join(OUT, 'kelp-blade.svg'), out)
console.log('写了', path.relative(ROOT, path.join(OUT, 'kelp-blade.svg')), '←', from)
