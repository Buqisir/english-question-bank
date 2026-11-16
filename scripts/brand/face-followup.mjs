#!/usr/bin/env node
// 獭獭新脸「都跟」· 全身浮姿和六张状态图（BRAND.md §7 第 97–100 条；Owner 2026-11-14「都跟」）。对比稿，等复核。
//
// 做什么：头像母版 otter-head.svg 已经改了两处——脸斑下沿换成 F、眼睛直径放大 16% 并略往外往上挪。
// 这里把同样两处改动按每张图自己的脸的大小和角度搬过去，只出副本，不改 mascot/ 下的原文件。
//   1. 用两眼圆心定出这张脸相对母版的相似变换：缩放 = 两眼间距 ÷ 345.7，旋转 = 两眼连线的角度，
//      对中 = 两眼中点对母版的 (512, 375.5)。
//   2. 眼睛：半径（或椭圆的 rx、ry，或画成路径的眼睛整体）×1.16，圆心按变换外移 3.05、上移 4.25（母版坐标）。
//      闭眼的（04 完成）不动眼睛。
//   3. 脸斑：七张图的脸斑路径和母版的锚点都对不上一一对应（锚点数、位置不同，见 README），
//      所以把母版「旧脸斑 → F 脸斑」每个控制点的位移当成一张位移表，在母版坐标里按距离加权插值
//      （反距离平方加权），插到这张图脸斑下沿那几段的锚点和把手上，再按变换换回这张图的坐标。
//      上沿、两侧的锚点和把手一个数都不动；两侧锚点的下把手只许沿原方向变长变短，保住两侧的圆滑。
//      顺带出一个参考做法「把母版 F 脸斑整条按变换放过去」，只放在 before-after 图里比较，不进 svg/。
//   4. 量净空：新眼睛到脸斑、鼻子、头轮廓、道具的最近距离（改前、改后都量），缺口尖到鼻子的距离，
//      胡须点到脸斑边的距离。
//
// 用法：node scripts/brand/face-followup.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/face-followup/ 下的 svg/、params.json、compare.png、before-after/
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MASCOT = path.join(ROOT, 'design/brand-2026-10-13/mascot')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/face-followup')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// ---------------------------------------------------------------- 母版的数
const M_EYE_GAP = 345.7 // 旧母版两眼间距（685.2 − 339.5）
const M_MID = [512, 375.5] // 旧母版两眼中点
const EYE_SCALE = 1.16
const EYE_SHIFT = [3.05, 4.25] // 外移、上移（母版坐标）
const MASTER_NOSE_BOTTOM = 508.3 // 母版鼻子最低点 y

// 母版脸斑右半边下沿的控制点：旧位置 → F 的位移（左半边以 x=512 镜像）。
// 旧：S(860,558.5) 下把手 (860,627) → 瓣底把手 (795.5,669.5) → 瓣底 (702,669.5) → 把手 (623.5,669.5) → 缺口把手 (550,641.5) → 缺口 (512,593)
// F ：S(860,558.5) 下把手 (860,610.5) → 瓣底把手 (770,667)   → 瓣底 (690,667)   → 把手 (611.5,667)   → 缺口把手 (550,611.5) → 缺口 (512,563)
// 上沿和两侧不动的点也放进表里（位移 0），免得插值把上面的点带着走。
const FIELD_RIGHT = [
  [[860, 558.5], [0, 0]],
  [[860, 516.5], [0, 0]],
  [[832.5, 479.5], [0, 0]],
  [[785.5, 450.5], [0, 0]],
  [[860, 627], [0, -16.5]],
  [[795.5, 669.5], [-25.5, -2.5]],
  [[702, 669.5], [-12, -2.5]],
  [[623.5, 669.5], [-12, -2.5]],
  [[550, 641.5], [0, -30]],
]
const FIELD = [
  ...FIELD_RIGHT,
  ...FIELD_RIGHT.map(([[x, y], [dx, dy]]) => [[1024 - x, y], [-dx, dy]]),
  [[512, 593], [0, -30]],
]
const IDW_POWER = 2
function fieldAt([x, y]) {
  let sw = 0, sx = 0, sy = 0
  for (const [[px, py], [dx, dy]] of FIELD) {
    const d2 = (x - px) ** 2 + (y - py) ** 2
    if (d2 < 1e-6) return [dx, dy]
    const w = 1 / d2 ** (IDW_POWER / 2)
    sw += w; sx += w * dx; sy += w * dy
  }
  return [sx / sw, sy / sw]
}
// 母版 F 脸斑（现在 otter-head.svg 里的那条），参考做法用
const MASTER_F_D = 'M512 407.5C627 407.5 722.5 411.5 785.5 450.5C832.5 479.5 860 516.5 860 558.5C860 610.5 770 667 690 667C611.5 667 550 611.5 512 563C474 611.5 412.5 667 334 667C254 667 164 610.5 164 558.5C164 516.5 191.5 479.5 238.5 450.5C301.5 411.5 397 407.5 512 407.5Z'

// ---------------------------------------------------------------- 七张图
// muzzle：脸斑路径 id；eyes：[左眼 id, 右眼 id]（图里 x 小的是左）；closed：闭眼不放大；
// lower：脸斑下沿的段号（从一侧最宽处到另一侧最宽处，段号见 parse() 的输出，0 是 M）；
// sides：两侧最宽处锚点所在的段号（这两个锚点钉住不动）；nose、head：鼻子、头的路径 id。
const FILES = [
  { name: 'otter-front', file: 'otter-front.svg', label: '正面浮姿（全身）', muzzle: '_LAA-0__c3nwgm5', eyes: ['_LAA-0__c3nwgm9', '_LAA-0__c3nwgm10'], nose: '_LAA-0__c3nwgm8', head: '_LAA-0__c3nwgm3', lower: [5, 6, 7, 8, 9], sides: [4, 9] },
  { name: 'state-01-idle', file: 'states/state-01-idle.svg', label: '01 空闲', muzzle: '_LAE-0__ogofof6', eyes: ['_LAE-0__ogofof9', '_LAE-0__ogofof10'], nose: '_LAE-0__ogofof8', head: '_LAE-0__ogofof2', lower: [4, 5, 6, 7, 8, 9], sides: [3, 9] },
  { name: 'state-02-searching', file: 'states/state-02-searching.svg', label: '02 找题中', muzzle: '_LD8-0__qeeo3612', eyes: ['_LD8-0__qeeo3615', '_LD8-0__qeeo3616'], nose: '_LD8-0__qeeo3614', head: '_LD8-0__qeeo3611', lower: [5, 6, 7, 8, 9, 10], sides: [4, 10] },
  { name: 'state-03-offer', file: 'states/state-03-offer.svg', label: '03 待确认', muzzle: '_LDA-0__6m489x7', eyes: ['_LDA-0__6m489x5', '_LDA-0__6m489x6'], nose: '_LDA-0__6m489x8', head: '_LDA-0__6m489x1', lower: [3, 4, 5, 6, 7, 8], sides: [2, 8] },
  { name: 'state-04-done', file: 'states/state-04-done.svg', label: '04 完成（闭眼）', muzzle: '_LDC-0__w0h4vk4', eyes: ['_LDC-0__w0h4vk8', '_LDC-0__w0h4vk9'], closed: true, nose: '_LDC-0__w0h4vk5', head: '_LDC-0__w0h4vk2', lower: [4, 5, 6, 7, 8, 9], sides: [3, 9] },
  { name: 'state-05-not-found', file: 'states/state-05-not-found.svg', label: '05 没找到', muzzle: '_KZA-0__mhu05b5', eyes: ['_KZA-0__mhu05b7', '_KZA-0__mhu05b8'], nose: '_KZA-0__mhu05b9', head: '_KZA-0__mhu05b4', lower: [4, 5, 6, 7, 8, 9], sides: [3, 9] },
  { name: 'peek-login', file: 'states/peek-login.svg', label: '登录页探头', muzzle: '_L5H-0__eoyclv3', eyes: ['_L5H-0__eoyclv5', '_L5H-0__eoyclv6'], nose: '_L5H-0__eoyclv7', head: '_L5H-0__eoyclv2', lower: [3, 4, 5, 6, 7, 8, 9, 10], sides: [2, 10] },
]

// ---------------------------------------------------------------- 路径工具
const fmt = (n) => String(Math.round(n * 100) / 100)
// 解析成绝对坐标的段：M 段 pts=[终点]；C 段 pts=[把手1, 把手2, 终点]；直线段转成把手和端点重合的 C
function parse(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g)
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lastC = null
  const segs = []
  const num = () => parseFloat(toks[i++])
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const pt = () => [num() + (rel ? x : 0), num() + (rel ? y : 0)]
    if (C === 'Z') { segs.push({ cmd: 'Z', pts: [] }); x = sx; y = sy; lastC = null; continue }
    if (C === 'M') { [x, y] = pt(); sx = x; sy = y; segs.push({ cmd: 'M', pts: [[x, y]] }); cmd = rel ? 'l' : 'L'; lastC = null; continue }
    if (C === 'L' || C === 'H' || C === 'V') {
      const n = C === 'L' ? pt() : C === 'H' ? [num() + (rel ? x : 0), y] : [x, num() + (rel ? y : 0)]
      segs.push({ cmd: 'L', pts: [n] }); [x, y] = n; lastC = null; continue
    }
    if (C === 'C') { const p = [pt(), pt(), pt()]; segs.push({ cmd: 'C', pts: p }); lastC = p[1]; [x, y] = p[2]; continue }
    if (C === 'S') { const c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; const p = [c1, pt(), pt()]; segs.push({ cmd: 'C', pts: p }); lastC = p[1]; [x, y] = p[2]; continue }
    // 圆弧只在 04 闭眼弧线的两头圆角里有，只拿来量外框和距离，按直线近似；这些路径不会被改写
    if (C === 'A') { for (let k = 0; k < 5; k++) num(); const n = pt(); segs.push({ cmd: 'L', pts: [n], arc: true }); [x, y] = n; lastC = null; continue }
    throw new Error(`路径里有没处理的命令 ${cmd}`)
  }
  return segs
}
const serialize = (segs) => segs.map((g) => (g.cmd === 'Z' ? 'Z' : g.cmd + g.pts.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join(' '))).join('')
// 压成折线（量距离用）
function flatten(segs, n = 32) {
  const out = []
  let cur = null, start = null
  for (const g of segs) {
    if (g.cmd === 'M') { cur = g.pts[0]; start = cur; out.push(cur) }
    else if (g.cmd === 'L') { cur = g.pts[0]; out.push(cur) }
    else if (g.cmd === 'C') {
      const [a, b, c] = g.pts
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t
        out.push([u * u * u * cur[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * c[0], u * u * u * cur[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * c[1]])
      }
      cur = c
    } else if (g.cmd === 'Z' && start) out.push(start)
  }
  return out
}
const ellipsePoly = (cx, cy, rx, ry, n = 96) => Array.from({ length: n + 1 }, (_, k) => [cx + rx * Math.cos((2 * Math.PI * k) / n), cy + ry * Math.sin((2 * Math.PI * k) / n)])
function polyArea(p) { let a = 0; for (let k = 0; k < p.length - 1; k++) a += p[k][0] * p[k + 1][1] - p[k + 1][0] * p[k][1]; return a / 2 }
function centroid(p) {
  let a = 0, cx = 0, cy = 0
  for (let k = 0; k < p.length - 1; k++) { const f = p[k][0] * p[k + 1][1] - p[k + 1][0] * p[k][1]; a += f; cx += (p[k][0] + p[k + 1][0]) * f; cy += (p[k][1] + p[k + 1][1]) * f }
  return [cx / (3 * a), cy / (3 * a)]
}
function inside([x, y], p) {
  let c = false
  for (let k = 0, j = p.length - 1; k < p.length; j = k++) if ((p[k][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[k][0]) * (y - p[k][1])) / (p[j][1] - p[k][1]) + p[k][0]) c = !c
  return c
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
const pointPolyDist = (q, p) => { let m = Infinity; for (let k = 0; k < p.length - 1; k++) m = Math.min(m, segDist(q, p[k], p[k + 1])); return m }
// 两条轮廓的最近距离；轮廓相交返回 0
function polyPolyDist(a, b) {
  let m = Infinity
  for (const q of a) m = Math.min(m, pointPolyDist(q, b))
  for (const q of b) m = Math.min(m, pointPolyDist(q, a))
  // 一个点在另一个里面、另一个点在外面就算相交
  const ia = a.map((q) => inside(q, b)), ib = b.map((q) => inside(q, a))
  if ((ia.some(Boolean) && ia.some((v) => !v)) || (ib.some(Boolean) && ib.some((v) => !v))) return 0
  return m
}

// ---------------------------------------------------------------- SVG 里的图形
function shapes(svg) {
  const list = []
  const re = /<(path|ellipse|circle)\b([^>]*?)\/?>/g
  let m, k = 0
  while ((m = re.exec(svg))) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))
    const id = attrs.id || `(${m[1]}#${k})`
    k++
    let poly
    if (m[1] === 'path') poly = flatten(parse(attrs.d))
    else if (m[1] === 'ellipse') poly = ellipsePoly(+attrs.cx, +attrs.cy, +attrs.rx, +attrs.ry)
    else poly = ellipsePoly(+attrs.cx, +attrs.cy, +attrs.r, +attrs.r)
    list.push({ tag: m[1], id, attrs, raw: m[0], poly })
  }
  return list
}
const findShape = (list, id) => { const s = list.find((x) => x.id === id); if (!s) throw new Error(`找不到 ${id}，原图可能改过，先核对再跑`); return s }
function eyeInfo(s) {
  if (s.tag === 'ellipse') return { cx: +s.attrs.cx, cy: +s.attrs.cy, rx: +s.attrs.rx, ry: +s.attrs.ry }
  if (s.tag === 'circle') return { cx: +s.attrs.cx, cy: +s.attrs.cy, rx: +s.attrs.r, ry: +s.attrs.r }
  // 画成路径的眼睛：睁眼的取面积中心；闭眼弧线取外框中心
  const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1])
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  const area = Math.abs(polyArea(s.poly))
  const [cx, cy] = area > 50 ? centroid(s.poly) : [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
  return { cx, cy, rx: (box[2] - box[0]) / 2, ry: (box[3] - box[1]) / 2, path: true }
}

// ---------------------------------------------------------------- 变换
function makeTransform(L, R) {
  const dx = R[0] - L[0], dy = R[1] - L[1]
  const s = Math.hypot(dx, dy) / M_EYE_GAP, th = Math.atan2(dy, dx)
  const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2]
  const c = Math.cos(th), si = Math.sin(th)
  const vecTo = ([u, v]) => [s * (u * c - v * si), s * (u * si + v * c)] // 母版向量 → 图里向量
  const vecFrom = ([u, v]) => [(u * c + v * si) / s, (-u * si + v * c) / s]
  const to = ([x, y]) => { const [u, v] = vecTo([x - M_MID[0], y - M_MID[1]]); return [u + mid[0], v + mid[1]] }
  const from = ([x, y]) => { const [u, v] = vecFrom([x - mid[0], y - mid[1]]); return [u + M_MID[0], v + M_MID[1]] }
  return { s, th, deg: (th * 180) / Math.PI, mid, to, from, vecTo, vecFrom }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const ang = (v) => Math.atan2(v[1], v[0])
const len = (v) => Math.hypot(v[0], v[1])
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// 脸斑下沿按母版位移表挪；返回新段和改动清单
function followMuzzle(segs, cfg, T) {
  const out = segs.map((g) => ({ ...g, pts: g.pts.map((p) => [...p]) }))
  const changes = []
  const anchorOf = (k) => (k === 0 ? out[0].pts[0] : out[k].pts[out[k].pts.length - 1])
  const lowerSet = new Set(cfg.lower)
  const [sideA, sideB] = cfg.sides
  const sideAnchorIdx = new Set([sideA, sideB])
  const move = (p) => add(p, T.vecTo(fieldAt(T.from(p))))
  const orig = segs
  // 1) 先把下沿各段的把手和中间锚点按位移表挪
  for (const k of cfg.lower) {
    const g = out[k]
    if (g.cmd !== 'C') throw new Error(`${cfg.name} 下沿第 ${k} 段不是曲线`)
    g.pts[0] = move(orig[k].pts[0])
    g.pts[1] = move(orig[k].pts[1])
    if (!sideAnchorIdx.has(k)) g.pts[2] = move(orig[k].pts[2])
  }
  // 2) 两侧钉住的锚点：挨着下沿的那个把手只许沿原方向伸缩
  const sideLowerHandle = [[sideA + 1, 0], [sideB, 1]] // [段号, 把手号]
  for (const [k, h] of sideLowerHandle) {
    const anchor = h === 0 ? anchorOf(k - 1 >= 1 ? k - 1 : 0) : anchorOf(k)
    const o = sub(orig[k].pts[h], anchor), n = sub(out[k].pts[h], anchor)
    const u = [o[0] / len(o), o[1] / len(o)]
    const l = n[0] * u[0] + n[1] * u[1]
    out[k].pts[h] = add(anchor, [u[0] * l, u[1] * l])
  }
  // 3) 下沿中间的锚点：原来圆滑的保持圆滑（两个把手一起转同一个角度，长度用挪后的长度）
  for (const k of cfg.lower) {
    if (sideAnchorIdx.has(k) || !lowerSet.has(k + 1)) continue
    const A0 = orig[k].pts[2], A1 = out[k].pts[2]
    const in0 = sub(orig[k].pts[1], A0), out0 = sub(orig[k + 1].pts[0], A0)
    const in1 = sub(out[k].pts[1], A1), out1 = sub(out[k + 1].pts[0], A1)
    const kink = Math.abs(wrap(ang(out0) - ang(in0) - Math.PI))
    const smooth = kink < (25 * Math.PI) / 180
    if (smooth) {
      const phi = (wrap(ang(in1) - ang(in0)) + wrap(ang(out1) - ang(out0))) / 2
      const ni = rot(in0, phi), no = rot(out0, phi)
      out[k].pts[1] = add(A1, [(ni[0] / len(in0)) * len(in1), (ni[1] / len(in0)) * len(in1)])
      out[k + 1].pts[0] = add(A1, [(no[0] / len(out0)) * len(out1), (no[1] / len(out0)) * len(out1)])
    }
    changes.push({ anchor: k, smooth, kinkDeg: Math.round((kink * 180) / Math.PI) })
  }
  const moved = []
  for (const k of cfg.lower) for (let h = 0; h < 3; h++) {
    const a = orig[k].pts[h], b = out[k].pts[h]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.004) moved.push({ seg: k, point: ['把手1', '把手2', '锚点'][h], from: a.map(fmt).map(Number), to: b.map(fmt).map(Number), masterDelta: T.vecFrom(sub(b, a)).map(fmt).map(Number) })
  }
  return { segs: out, moved, anchors: changes }
}

// 缺口尖：下沿锚点里在母版坐标最靠中间（|x−512| 最小）的那个
function notchOf(segs, cfg, T) {
  let best = null
  for (const k of cfg.lower) if (!cfg.sides.includes(k)) { const p = segs[k].pts[2], q = T.from(p); if (!best || Math.abs(q[0] - 512) < best.dx) best = { p, q, dx: Math.abs(q[0] - 512), seg: k } }
  return best
}

const NOTE_DATE = '2026-11-14'
function headerNote(cfg) {
  const eyes = cfg.closed ? '这张是闭眼，眼睛没动' : '眼睛直径放大 16%，圆心按本图两眼的缩放和角度略往外、往上挪'
  return `${NOTE_DATE} 跟头像母版（BRAND.md §7 第 97–100 条）：脸斑下沿改成 F（中间缺口抬高、两瓣外下角削掉一点，不画嘴）；${eyes}；别的路径没动。对比稿，脚本 scripts/brand/face-followup.mjs，等复核。`
}
function addNote(svg, cfg) {
  const note = headerNote(cfg)
  const first = svg.indexOf('<!--')
  const svgOpenEnd = svg.indexOf('>', svg.indexOf('<svg')) + 1
  if (first !== -1 && first < svg.indexOf('<g')) {
    const end = svg.indexOf('-->', first)
    return `${svg.slice(0, end).replace(/\s*$/, '')} ${note} ${svg.slice(end)}`
  }
  return `${svg.slice(0, svgOpenEnd)}\n<!-- ${note} -->${svg.slice(svgOpenEnd)}`
}

// ---------------------------------------------------------------- 主流程
mkdirSync(path.join(OUT, 'svg'), { recursive: true })
mkdirSync(path.join(OUT, 'before-after'), { recursive: true })
const r2 = (n) => Math.round(n * 100) / 100
const results = []
for (const cfg of FILES) {
  const src = readFileSync(path.join(MASCOT, cfg.file), 'utf8')
  const list = shapes(src)
  const muz = findShape(list, cfg.muzzle)
  const eyeL = findShape(list, cfg.eyes[0]), eyeR = findShape(list, cfg.eyes[1])
  const eL = eyeInfo(eyeL), eR = eyeInfo(eyeR)
  if (eL.cx > eR.cx) throw new Error(`${cfg.name} 左右眼写反了`)
  const T = makeTransform([eL.cx, eL.cy], [eR.cx, eR.cy])

  // 脸斑
  const segs = parse(muz.attrs.d)
  const fm = followMuzzle(segs, cfg, T)
  const newD = serialize(fm.segs)
  let svg = src.replace(muz.raw, muz.raw.replace(`d="${muz.attrs.d}"`, `d="${newD}"`))

  // 参考做法：母版 F 整条按变换放过去
  const refSegs = parse(MASTER_F_D).map((g) => ({ ...g, pts: g.pts.map(T.to) }))
  const refSvg = src.replace(muz.raw, muz.raw.replace(`d="${muz.attrs.d}"`, `d="${serialize(refSegs)}"`))

  // 眼睛
  const eyes = []
  for (const [shape, info, side] of [[eyeL, eL, -1], [eyeR, eR, 1]]) {
    if (cfg.closed) { eyes.push({ id: shape.id, unchanged: true, center: [r2(info.cx), r2(info.cy)] }); continue }
    const shift = T.vecTo([side * EYE_SHIFT[0], -EYE_SHIFT[1]])
    const nc = [info.cx + shift[0], info.cy + shift[1]]
    let raw
    if (shape.tag === 'ellipse') raw = shape.raw.replace(/cx="[^"]*"/, `cx="${fmt(nc[0])}"`).replace(/cy="[^"]*"/, `cy="${fmt(nc[1])}"`).replace(/rx="[^"]*"/, `rx="${fmt(info.rx * EYE_SCALE)}"`).replace(/ry="[^"]*"/, `ry="${fmt(info.ry * EYE_SCALE)}"`)
    else if (shape.tag === 'circle') raw = shape.raw.replace(/cx="[^"]*"/, `cx="${fmt(nc[0])}"`).replace(/cy="[^"]*"/, `cy="${fmt(nc[1])}"`).replace(/ r="[^"]*"/, ` r="${fmt(info.rx * EYE_SCALE)}"`)
    else {
      const es = parse(shape.attrs.d).map((g) => ({ ...g, pts: g.pts.map((p) => [nc[0] + EYE_SCALE * (p[0] - info.cx), nc[1] + EYE_SCALE * (p[1] - info.cy)]) }))
      raw = shape.raw.replace(`d="${shape.attrs.d}"`, `d="${serialize(es)}"`)
    }
    svg = svg.replace(shape.raw, raw)
    eyes.push({ id: shape.id, tag: shape.tag, from: { cx: r2(info.cx), cy: r2(info.cy), rx: r2(info.rx), ry: r2(info.ry) }, to: { cx: r2(nc[0]), cy: r2(nc[1]), rx: r2(info.rx * EYE_SCALE), ry: r2(info.ry * EYE_SCALE) }, shiftInImage: shift.map(r2) })
  }
  svg = addNote(svg, cfg)
  writeFileSync(path.join(OUT, 'svg', path.basename(cfg.file)), svg)

  // 净空
  const after = shapes(svg)
  const eyeIds = new Set(cfg.eyes)
  const clearance = []
  if (!cfg.closed) {
    for (const id of cfg.eyes) {
      const b = findShape(list, id).poly, a = findShape(after, id).poly
      for (const s of list) {
        if (eyeIds.has(s.id)) continue
        const sa = after[list.indexOf(s)]
        const before = polyPolyDist(b, s.poly), aft = polyPolyDist(a, sa.poly)
        if (Math.min(before, aft) / T.s > 60 && s.id !== cfg.head) continue // 头轮廓总是记，别的只记 60 以内的
        const role = s.id === cfg.muzzle ? '脸斑' : s.id === cfg.nose ? '鼻子' : s.id === cfg.head ? '头轮廓' : s.attrs.fill === '#191D18' && s.tag !== 'path' ? '胡须点' : '其他/道具'
        clearance.push({ eye: id === cfg.eyes[0] ? '左眼' : '右眼', shape: s.id, role, before: r2(before), after: r2(aft), beforeMaster: r2(before / T.s), afterMaster: r2(aft / T.s), touches: aft === 0 && before > 0 })
      }
    }
  }
  // 缺口尖到鼻子
  const nose = findShape(list, cfg.nose).poly
  const n0 = notchOf(segs, cfg, T), n1 = notchOf(fm.segs, cfg, T)
  const noseGap = { before: r2(pointPolyDist(n0.p, nose) / T.s), after: r2(pointPolyDist(n1.p, nose) / T.s), afterInsideNose: inside(n1.p, nose), notchMasterY: [r2(n0.q[1]), r2(n1.q[1])] }
  // 胡须点到脸斑边（正数 = 整颗在脸斑里面，离边多少；负数 = 压到边上或出界）
  const muzBefore = muz.poly, muzAfter = findShape(after, cfg.muzzle).poly
  const dots = list.filter((s) => s.tag !== 'path' && !eyeIds.has(s.id) && s.attrs.fill === '#191D18')
  const dotMargin = (poly) => Math.min(...dots.map((s) => { const c = [+s.attrs.cx, +s.attrs.cy], r = +(s.attrs.r || s.attrs.rx); return (inside(c, poly) ? 1 : -1) * pointPolyDist(c, poly) - r }))
  const whisker = dots.length ? { before: r2(dotMargin(muzBefore) / T.s), after: r2(dotMargin(muzAfter) / T.s) } : null

  results.push({ cfg, src, svg, refSvg, T, eyes, moved: fm.moved, anchors: fm.anchors, clearance, noseGap, whisker })
}

// 母版自己的参照数（旧母版 → 现母版），量法同上
const masterRef = (() => {
  const now = readFileSync(path.join(MASCOT, 'otter-head.svg'), 'utf8')
  const L = shapes(now)
  const mu = findShape(L, '_L9S-0__ziti073').poly, no = findShape(L, '_L9S-0__ziti077').poly
  const e = findShape(L, '_L9S-0__ziti075').poly
  return { eyeToMuzzle: r2(polyPolyDist(e, mu)), eyeToNose: r2(polyPolyDist(e, no)), notchToNose: r2(pointPolyDist([512, 563], no)) }
})()

writeFileSync(path.join(OUT, 'params.json'), `${JSON.stringify({
  note: '对比稿 · 等复核。坐标：图里坐标 = 这张 SVG 自己的坐标；母版坐标 = 换算回 otter-head.svg 的坐标（除以缩放、反转角度）。',
  master: { eyeGap: M_EYE_GAP, eyeMid: M_MID, eyeScale: EYE_SCALE, eyeShiftOutUp: EYE_SHIFT, idwPower: IDW_POWER, field: FIELD.map(([p, d]) => ({ at: p, delta: d })), referenceInMaster: masterRef },
  files: results.map(({ cfg, T, eyes, moved, anchors, clearance, noseGap, whisker }) => ({
    name: cfg.name, file: `design/brand-2026-10-13/mascot/${cfg.file}`, muzzlePath: cfg.muzzle, lowerSegments: cfg.lower, pinnedSideAnchors: cfg.sides,
    transform: { scale: Number(T.s.toFixed(4)), angleDeg: Number(T.deg.toFixed(2)), eyeMid: T.mid.map(r2) },
    eyesClosed: !!cfg.closed, eyes, muzzleMoved: moved, lowerAnchors: anchors,
    clearance, notchToNose_master: noseGap, whiskerDotMarginToMuzzleEdge_master: whisker,
  })),
}, null, 2)}\n`)

// ---------------------------------------------------------------- 出图
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
// 脸部取景：母版坐标里 x 120–904、y 290–710 这个框换到图里，取外框
function faceView(T) {
  const pts = [[120, 290], [904, 290], [904, 710], [120, 710]].map(T.to)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const side = Math.max(w, h)
  return `${fmt(x0 + w / 2 - side / 2)} ${fmt(y0 + h / 2 - side / 2)} ${fmt(side)} ${fmt(side)}`
}
const withView = (svg, vb) => svg.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`)
// 叠线：把改前脸斑描红线、改后脸斑描蓝线，叠在改后的图上
function overlay(r) {
  const before = findShape(shapes(r.src), r.cfg.muzzle).attrs.d
  const after = findShape(shapes(r.svg), r.cfg.muzzle).attrs.d
  const w = 2.2 * r.T.s * 2
  const extra = `<path d="${before}" fill="none" stroke="#D2463C" stroke-width="${fmt(w)}"/><path d="${after}" fill="none" stroke="#2F6FD6" stroke-width="${fmt(w)}"/>`
  return r.svg.replace(/<\/svg>\s*$/, `${extra}</svg>`)
}

const CSS = 'body{margin:0;padding:24px;background:#F1F5F7;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#5A6C75}.row{display:flex;width:max-content;align-items:flex-end;gap:14px;background:#fff;border-radius:8px;padding:12px 14px;margin-bottom:12px}.cap{flex:0 0 150px;align-self:center}.row>*{flex-shrink:0}.cap b{display:block;font-size:16px}.cell{display:flex;flex-direction:column;align-items:center;gap:4px}.cell small{color:#5A6C75}.sep{width:1px;align-self:stretch;background:#DDE5E8;margin:0 6px}img{display:block}'
const rows = results.map((r) => `<div class="row"><div class="cap"><b>${r.cfg.label}</b>${path.basename(r.cfg.file)}<br>缩放 ${r.T.s.toFixed(3)}<br>角度 ${r.T.deg.toFixed(1)}°</div>
<div class="cell"><img src="${uri(r.src)}" style="height:420px"><small>改之前</small></div><div class="cell"><img src="${uri(r.src)}" style="height:120px"><small>改之前 · 小</small></div><div class="sep"></div>
<div class="cell"><img src="${uri(r.svg)}" style="height:420px"><small>改之后</small></div><div class="cell"><img src="${uri(r.svg)}" style="height:120px"><small>改之后 · 小</small></div></div>`).join('\n')
const compareHtml = `<style>${CSS}</style><h1>獭獭新脸跟到全身像和状态图 · 对比稿</h1><p>等 agent 负责人复核。每行左边是改之前，右边是改之后；大图约 420 像素高，小图约 120 像素高。只改了脸斑一条路径和两只眼睛（04 闭眼只改脸斑）。</p>${rows}`

const browser = await chromium.launch({ channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 })
  await page.setContent(compareHtml)
  await page.waitForLoadState('load')
  await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
  for (const r of results) {
    const vb = faceView(r.T)
    const S = 460
    const cell = (svg, cap) => `<div class="cell"><img src="${uri(withView(svg, vb))}" width="${S}" height="${S}" style="background:#fff"><small>${cap}</small></div>`
    const html = `<style>${CSS}</style><h1>${r.cfg.label} · 脸部放大</h1><p>${path.basename(r.cfg.file)}　缩放 ${r.T.s.toFixed(3)}　角度 ${r.T.deg.toFixed(1)}°　${r.cfg.closed ? '闭眼，眼睛没动' : '眼睛 ×1.16'}</p>
<div class="row">${cell(r.src, '改之前')}${cell(r.svg, '改之后')}<div class="sep"></div>${cell(overlay(r), '叠线：红 = 改前脸斑，蓝 = 改后')}${cell(r.refSvg, '参考（没采用）：母版 F 脸斑整条放过去，眼睛没改')}</div>`
    await page.setViewportSize({ width: 4 * S + 160, height: 700 })
    await page.setContent(html)
    await page.waitForLoadState('load')
    await page.screenshot({ path: path.join(OUT, 'before-after', `${r.cfg.name}.png`), fullPage: true })
  }
} finally {
  await browser.close()
}

for (const r of results) {
  const flag = r.clearance.filter((c) => c.touches || (c.afterMaster < c.beforeMaster * 0.6 && c.afterMaster < 20))
  console.log(`${r.cfg.name}: 缩放 ${r.T.s.toFixed(3)} 角度 ${r.T.deg.toFixed(1)}° 缺口到鼻子(母版单位) ${r.noseGap.before}→${r.noseGap.after} 胡须点余量 ${r.whisker?.before}→${r.whisker?.after}`)
  for (const c of r.clearance) console.log(`   ${c.eye} ${c.role} ${c.shape}: ${c.beforeMaster}→${c.afterMaster}${c.touches ? ' 碰到了' : ''}${flag.includes(c) ? ' ←' : ''}`)
}
console.log('母版参照', masterRef)
console.log(`出了 ${results.length} 张：${path.relative(ROOT, OUT)}`)
