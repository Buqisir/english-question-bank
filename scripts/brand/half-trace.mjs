#!/usr/bin/env node
// 半身像 · 第一轮：照 M2 半身草图描成平涂矢量，再换手里的东西出四种状态（BRAND.md 第 114 条：
// 一个半身，换手里的东西做状态图）。提案 · 单一来源。做法照 scripts/brand/body-f6-trace.mjs（全身 F6），
// 公用的几个函数在这里另抄一份，不改那个脚本。
//
// 做什么：
//   1. 读草图像素（playwright 的 canvas），最近色分成 底 / 雾薄荷 / 浅色肚皮 / 脸斑 / 墨 / 石头；
//      底部那条浅色水带按行判断，不进身体。
//   2. 身体剪影 = 草图里所有非底、非石头的像素（水面以上）；草图的头在下巴以下切掉，把母版的头
//      （裁到下巴）栅格化后并进剪影，描成一条外轮廓垫在下面；母版的头原样盖在上面（按两眼中心和眼距对位缩放）。
//   3. 肚皮 = 浅色像素；左右边被胳膊挡住的那一段，用三次 Hermite 曲线把上下露出来的边接上，
//      所以肚皮在爪子和物件后面是完整的；肚皮上沿那道弧照草图。
//   4. 爪子 = 落在肚皮范围里的雾薄荷像素（前臂和拳头），左右各一块；往肚皮外的雾薄荷里多垫 6 像素，接缝落在身体上看不见。
//      两只爪子再各往外平移 HALF_SPREAD（默认 28）像素，给手里的东西让地方（草图两拳之间只有一指宽）。
//   5. 沿像素缝走闭合轮廓 → 环形高斯平滑 → RDP 抽稀 → 三次贝塞尔。
//   6. 手里的东西用 mascot/objects/ 的定稿形原样嵌进去，按「240 = 獭獭头宽（含耳朵）」缩放，再乘一个公共系数 HOLD_K。
//      物件上沿贴着肚皮上沿往下 6 像素放，下半截被爪子压住。物件被一张蒙版在爪子四周让出一道 7 像素的缝
//      （露出后面的肚皮），雾薄荷的扇贝、蛤和雾薄荷的爪子才分得开；缝切出来的细碎尖角自动并进蒙版挖掉（当前三张都是 0 块）。
//   7. 登录页探头：水面抬到肚皮上沿，只露头和一截脖子；爪子整体往上挪，只留拳头一截，下沿按高斯模糊再取阈值收圆，
//      画在水带前面搭在水面线上；压在脖子上的那一点，脖子和头在爪尖四周让出同样 7 像素的缝。
//
// 用法：node scripts/brand/half-trace.mjs
//   可选环境变量：INVENTORY_CHROMIUM（chromium 路径）、HALF_SIGMA（平滑，默认 4）、HALF_EPS（抽稀，默认 0.45）、
//   HALF_HOLD_K（物件公共系数，默认 0.6）、HALF_HOLD_ANCHOR（top | grip，物件靠肚皮上沿还是对拳头高度，默认 top）、
//   HALF_SPREAD（爪子外挪像素，默认 28）、HALF_WATER_END（round | square，水带两端，默认 round）。
// 输出：design/brand-2026-10-13/image-review-2026-11-14/half-round1/ 下的
//   otter-half.svg、state-searching.svg、state-offer.svg、state-not-found.svg、state-login.svg、
//   compare.png、states.png、with-sit.png（截图 deviceScaleFactor 2）。母版和物件文件不改。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const OUT = path.join(BRAND, 'image-review-2026-11-14/half-round1')
const SKETCH = path.join(BRAND, 'image-review-2026-11-14/sketches-batch5/source-M2-half.png')
const HEAD_MASTER = readFileSync(path.join(BRAND, 'mascot/otter-head.svg'), 'utf8')
const SIT = readFileSync(path.join(BRAND, 'mascot/otter-sit.svg'), 'utf8')
const OBJ = (name) => readFileSync(path.join(BRAND, `mascot/objects/${name}.svg`), 'utf8')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')
mkdirSync(OUT, { recursive: true })

const COLOR = { mint: '#72BFA4', pale: '#DDF1E8', page: '#F1F5F7' }
const pick = (re, what) => {
  const m = HEAD_MASTER.match(re)
  if (!m) throw new Error(`头像母版里找不到${what}，母版可能改过，先核对再跑`)
  return m[0].replace(/ id="[^"]+"/g, '')
}
const HEAD_SHAPE = pick(/<path id="_L9S-0__ziti071"[^>]*\/>/, '头形路径')
const MUZZLE = pick(/<path id="_L9S-0__ziti073"[^>]*\/>/, '脸斑路径')
const EYES = pick(/<g id="_L9S-0__ziti074">[\s\S]*?<\/g>/, '眼睛')
const NOSE = pick(/<path id="_L9S-0__ziti077"[^>]*\/>/, '鼻子')
const DOTS = pick(/<g id="_L9S-0__ziti078">[\s\S]*?<\/g>/, '胡须点')
// 母版两眼中心和眼距（otter-head.svg 里两只眼睛的 cx、cy）；头宽含耳朵，取头形路径的左右极值（下面在浏览器里量）
const MASTER_EYE = { cx: (336.45 + 688.25) / 2, cy: 371.25, gap: 688.25 - 336.45 }
const HEAD_CLIP_Y = 680 // 母版头形在下巴下面这条线裁掉，不带母版的肩和围兜
const MUZZLE_BOTTOM = 667 // 母版脸斑下沿

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const uriPng = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`
const uriSvg = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`

// —— 1. 取像素 ——
async function pixelsOf(html, w, h) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.setContent(html)
  const out = await p.evaluate(async () => {
    const img = document.getElementById('i')
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let s = ''
    for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, i + 8192))
    return { W: c.width, H: c.height, b64: btoa(s) }
  })
  await p.close()
  return { ...out, px: Buffer.from(out.b64, 'base64') }
}
const { W, H, px } = await pixelsOf(`<img id="i" src="${uriPng(SKETCH)}">`, 1024, 1024)
const N = W * H

// —— 2. 按颜色分类（中心色从草图上量的，目测取点） ——
const at = (x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]
const CENTER = { bg: at(40, 40), mint: at(250, 700), pale: at(512, 780), muzzle: at(330, 420), rock: at(512, 600), ink: [26, 29, 23] }
const NAMES = Object.keys(CENTER)
const K = Object.fromEntries(NAMES.map((n, k) => [n, k]))
const cls = new Uint8Array(N)
for (let i = 0; i < N; i++) {
  let best = 0
  let bd = Infinity
  for (let k = 0; k < NAMES.length; k++) {
    const c = CENTER[NAMES[k]]
    const d = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2
    if (d < bd) { bd = d; best = k }
  }
  cls[i] = best
}
// 水带：左边空白处那一列第一次变成浅色的那一行
let WATER_Y = 0
for (let y = H - 1; y > 0; y--) { const [r] = at(30, y); if (r > 240) { WATER_Y = y + 1; break } }
const maskOf = (fn) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = fn(cls[i], i) ? 1 : 0; return m }
const rowOf = (i) => Math.floor(i / W)

function morph(m, r, erode) {
  const pass = (src, horiz) => {
    const out = new Uint8Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = erode ? 1 : 0
      for (let k = -r; k <= r; k++) {
        const xx = horiz ? x + k : x
        const yy = horiz ? y : y + k
        const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : src[yy * W + xx]
        if (erode ? !s : s) { v = erode ? 0 : 1; break }
      }
      out[y * W + x] = v
    }
    return out
  }
  return pass(pass(m, true), false)
}
const open = (m, r) => morph(morph(m, r, true), r, false)
const close = (m, r) => morph(morph(m, r, false), r, true)
const and = (a, b) => a.map((v, i) => v & b[i])
const or = (a, b) => a.map((v, i) => v | b[i])
const not = (a) => a.map((v) => 1 - v)

function components(m) {
  const lab = new Int32Array(N)
  const list = []
  const stack = []
  for (let s = 0; s < N; s++) {
    if (!m[s] || lab[s]) continue
    const id = list.length + 1
    const c = { id, area: 0, sx: 0, sy: 0, minX: W, maxX: 0, minY: H, maxY: 0 }
    lab[s] = id
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()
      const x = i % W
      const y = (i - x) / W
      c.area++; c.sx += x; c.sy += y
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      if (x > 0 && m[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack.push(i - 1) }
      if (x < W - 1 && m[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack.push(i + 1) }
      if (y > 0 && m[i - W] && !lab[i - W]) { lab[i - W] = id; stack.push(i - W) }
      if (y < H - 1 && m[i + W] && !lab[i + W]) { lab[i + W] = id; stack.push(i + W) }
    }
    c.cx = c.sx / c.area; c.cy = c.sy / c.area
    list.push(c)
  }
  return { lab, list }
}
const keep = (m, test) => { const { lab, list } = components(m); const ok = new Set(list.filter(test).map((c) => c.id)); return m.map((v, i) => (ok.has(lab[i]) ? 1 : 0)) }
const largest = (m) => { const { list } = components(m); const top = Math.max(...list.map((c) => c.area)); return keep(m, (c) => c.area === top) }
function fill(m) { const { lab } = components(not(m)); const edge = new Set(); for (let x = 0; x < W; x++) { edge.add(lab[x]); edge.add(lab[(H - 1) * W + x]) } for (let y = 0; y < H; y++) { edge.add(lab[y * W]); edge.add(lab[y * W + W - 1]) } return m.map((v, i) => (v || !edge.has(lab[i]) ? 1 : 0)) }
// 高斯模糊后取 0.5 阈值：把直角收圆，长边基本不动
function roundOff(m, sigma) {
  const r = Math.ceil(sigma * 3)
  const w = []
  let sum = 0
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); sum += v }
  const blur = (src, horiz) => {
    const out = new Float32Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let acc = 0
      for (let k = -r; k <= r; k++) { const xx = horiz ? x + k : x; const yy = horiz ? y : y + k; if (xx >= 0 && yy >= 0 && xx < W && yy < H) acc += src[yy * W + xx] * w[k + r] }
      out[y * W + x] = acc / sum
    }
    return out
  }
  const b = blur(blur(Float32Array.from(m), true), false)
  return Uint8Array.from(b, (v) => (v >= 0.5 ? 1 : 0))
}
const shiftY = (m, dy) => { const o = new Uint8Array(N); for (let y = 0; y < H; y++) { const sy = y - dy; if (sy < 0 || sy >= H) continue; o.set(m.subarray(sy * W, sy * W + W), y * W) } return o }

// 草图的两只眼睛：头部墨色块里第二、第三大的两块（最大的是鼻子）
const inkParts = components(open(maskOf((c) => c === K.ink), 1)).list.sort((a, b) => b.area - a.area)
const eyes = inkParts.slice(1, 3).sort((a, b) => a.cx - b.cx)
const SK_EYE = { cx: (eyes[0].cx + eyes[1].cx) / 2 + 0.5, cy: (eyes[0].cy + eyes[1].cy) / 2 + 0.5, gap: eyes[1].cx - eyes[0].cx }
const S = SK_EYE.gap / MASTER_EYE.gap
const TX = SK_EYE.cx - MASTER_EYE.cx * S
const TY = SK_EYE.cy - MASTER_EYE.cy * S
const toSketchY = (my) => TY + my * S
const CUT_Y = Math.round(toSketchY(670))
const STUB = 8

// —— 3. 身体、肚皮、石头、爪子 ——
const below = (y0) => maskOf((_, i) => rowOf(i) >= y0)
const aboveWater = maskOf((_, i) => rowOf(i) < WATER_Y)
const rock = largest(and(open(maskOf((c) => c === K.rock), 2), aboveWater))
const rockBox = components(rock).list[0]
let body = maskOf((c, i) => c !== K.bg && !rock[i] && rowOf(i) < WATER_Y)
body = fill(largest(open(body, 2)))
// 身体往水面下多延 14 行（照水面那一行的宽度），让水带压住，不露切口
const SINK = 40
for (let y = WATER_Y - 4; y < WATER_Y + SINK; y++) body.set(body.subarray((WATER_Y - 5) * W, (WATER_Y - 4) * W), y * W)
{
  const row = CUT_Y * W
  let x0 = 0
  let x1 = W - 1
  while (!body[row + x0]) x0++
  while (!body[row + x1]) x1--
  for (let y = 0; y < CUT_Y; y++) for (let x = 0; x < W; x++) if (y < CUT_Y - 40 || x < x0 + STUB || x > x1 - STUB) body[y * W + x] = 0
}
body = largest(body)
const headMask = await (async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${TX} ${TY}) scale(${S})"><clipPath id="c"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><g clip-path="url(#c)">${HEAD_SHAPE.replace(/fill="[^"]+"/, 'fill="#000"')}</g></g></svg>`
  const r = await pixelsOf(`<img id="i" src="${uriSvg(svg)}">`, W, H)
  const m = new Uint8Array(N)
  for (let i = 0; i < N; i++) m[i] = r.px[i * 4] < 128 ? 1 : 0
  return m
})()
const bodyOnly = body
body = largest(or(body, headMask))

// 肚皮：浅色像素；左右边被胳膊挡住的行，按露出来的边线性补齐（左边往下只会变宽，右边同理）
const pale0 = keep(and(open(maskOf((c, i) => c === K.pale && rowOf(i) < WATER_Y - 3), 2), morph(bodyOnly, 3, true)), (c) => c.area > 2000 && c.minY > CUT_Y)
const BELLY_TOP = Math.min(...components(pale0).list.map((c) => c.minY))
const L = new Float64Array(H).fill(NaN)
const R = new Float64Array(H).fill(NaN)
for (let y = BELLY_TOP; y < WATER_Y; y++) {
  let x0 = -1
  let x1 = -1
  for (let x = 0; x < W; x++) if (pale0[y * W + x]) { if (x0 < 0) x0 = x; x1 = x }
  if (x0 >= 0) { L[y] = x0; R[y] = x1 }
}
// 左右边各从上往下、从下往上走，连续（每行变化不超过 2 像素）的那两段算露出来的真边；
// 中间被胳膊挡住的一段用三次 Hermite 曲线接上，两头的斜率取露出段最后 15 行的平均
function bridge(arr) {
  const out = Float64Array.from(arr)
  let yA = BELLY_TOP + 12
  while (yA + 1 < WATER_Y && Math.abs(arr[yA + 1] - arr[yA]) <= 2) yA++
  let yB = WATER_Y - 6
  while (yB - 1 > yA && Math.abs(arr[yB - 1] - arr[yB]) <= 2) yB--
  const slope = (y0, y1) => (arr[y1] - arr[y0]) / (y1 - y0)
  const m0 = slope(yA - 15, yA) * (yB - yA)
  const m1 = slope(yB, yB + 15) * (yB - yA)
  for (let y = yA + 1; y < yB; y++) {
    const t = (y - yA) / (yB - yA)
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1; const h10 = t ** 3 - 2 * t ** 2 + t; const h01 = -2 * t ** 3 + 3 * t ** 2; const h11 = t ** 3 - t ** 2
    out[y] = h00 * arr[yA] + h10 * m0 + h01 * arr[yB] + h11 * m1
  }
  for (let y = WATER_Y - 5; y < WATER_Y; y++) out[y] = out[WATER_Y - 6]
  return { out, yA, yB }
}
const bl = bridge(L)
const br = bridge(R)
const L2 = bl.out
const R2 = br.out
let bellyEnv = new Uint8Array(N)
for (let y = BELLY_TOP; y < WATER_Y + SINK; y++) {
  const yy = Math.min(y, WATER_Y - 1)
  if (Number.isNaN(L2[yy])) continue
  for (let x = Math.round(L2[yy]); x <= Math.round(R2[yy]); x++) bellyEnv[y * W + x] = 1
}
bellyEnv = or(bellyEnv, pale0)

// 爪子：肚皮范围里的雾薄荷（前臂和拳头）
const mintPx = maskOf((c) => c === K.mint)
const paws0 = keep(open(and(and(mintPx, bellyEnv), aboveWater), 3), (c) => c.area > 3000)
const pawGrown = fill(open(and(morph(paws0, 6, false), or(mintPx, not(bellyEnv))), 1))
const pawParts = components(and(pawGrown, aboveWater)).list.filter((c) => c.area > 3000).sort((a, b) => a.cx - b.cx)
if (pawParts.length !== 2) throw new Error(`爪子应该是两块，量到 ${pawParts.length} 块`)
const pawLab = components(and(pawGrown, aboveWater)).lab
// 两只爪子各往外平移 SPREAD 像素：草图里两拳之间只有一指宽，扇贝、蛤夹在中间几乎全被挡住。
// 平移后爪子朝外那一头仍落在胳膊的雾薄荷上，腾出来的地方是补齐过的肚皮，身体剪影不动。
const SPREAD = Number(process.env.HALF_SPREAD ?? 28)
const shiftX = (m, dx) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = (i % W) + dx; if (x >= 0 && x < W) o[i + dx] = 1 } return o }
const pawL = shiftX(pawLab.map((v) => (v === pawParts[0].id ? 1 : 0)), -SPREAD)
const pawR = shiftX(pawLab.map((v) => (v === pawParts[1].id ? 1 : 0)), SPREAD)
for (const [k, d] of [[0, -SPREAD], [1, SPREAD]]) { pawParts[k].minX += d; pawParts[k].maxX += d; pawParts[k].cx += d }
// 肚皮 = 露出来的浅色 + 被爪子和石头挡住的那一片（只在这些地方用补齐的范围，肚皮上沿那道弧照草图）
const bellyRaw = or(and(pale0, maskOf((_, i) => rowOf(i) < WATER_Y - 5)), and(bellyEnv, or(morph(or(pawGrown, rock), 3, false), maskOf((_, i) => rowOf(i) >= WATER_Y - 5))))
const belly = largest(and(roundOff(close(bellyRaw, 2), 3), body)) // 收一下肚皮上沿两个尖角
const GAP = 7 // 物件在爪子四周让出的缝（草图像素）
const pawGap = morph(or(pawL, pawR), GAP, false)

// —— 4. 沿边描线（同 body-f6-trace.mjs） ——
function loops(m) {
  const g = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x])
  const next = new Map()
  const key = (x, y) => y * (W + 1) + x
  const add = (x0, y0, x1, y1) => { const k = key(x0, y0); if (!next.has(k)) next.set(k, []); next.get(k).push([x1, y1]) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue
    if (!g(x, y - 1)) add(x, y, x + 1, y)
    if (!g(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!g(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!g(x - 1, y)) add(x, y + 1, x, y)
  }
  const out = []
  for (const [k0] of next) {
    while (next.get(k0)?.length) {
      const pts = []
      let x = k0 % (W + 1)
      let y = (k0 - x) / (W + 1)
      for (;;) {
        const arr = next.get(key(x, y))
        if (!arr || !arr.length) break
        const [nx, ny] = arr.pop()
        pts.push([x, y])
        x = nx; y = ny
        if (key(x, y) === k0 && !next.get(k0).length) break
      }
      out.push(pts)
    }
  }
  return out
}
const areaOf = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i]; const [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0 } return a / 2 }
function smooth(p, sigma) {
  const r = Math.ceil(sigma * 3)
  const w = []
  let sum = 0
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); sum += v }
  const n = p.length
  return p.map((_, i) => { let x = 0; let y = 0; for (let k = -r; k <= r; k++) { const q = p[(((i + k) % n) + n) % n]; x += q[0] * w[k + r]; y += q[1] * w[k + r] } return [x / sum, y / sum] })
}
const f1 = (n) => Math.round(n * 10) / 10
function thin(p, eps, maxSeg) {
  const n = p.length
  const on = new Uint8Array(n)
  const q4 = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)]
  for (const i of q4) on[i] = 1
  const st = q4.map((a, k) => [a, k === 3 ? n : q4[k + 1]])
  while (st.length) {
    const [a, b] = st.pop()
    const [ax, ay] = p[a]
    const [bx, by] = p[b % n]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let fd = eps
    for (let i = a + 1; i < b; i++) { const d = len < 2 ? Math.hypot(p[i][0] - ax, p[i][1] - ay) : Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / len; if (d > fd) { fd = d; far = i } }
    if (far > 0) { on[far] = 1; st.push([a, far], [far, b]) } else if (b - a > maxSeg) { const m = (a + b) >> 1; on[m] = 1; st.push([a, m], [m, b]) }
  }
  return p.filter((_, i) => on[i])
}
function toPath(p) {
  const n = p.length
  const P = (i) => p[((i % n) + n) % n]
  const tan = (i) => { const a = P(i - 1); const b = P(i + 1); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`
  for (let i = 0; i < n; i++) {
    const p1 = P(i); const p2 = P(i + 1); const t1 = tan(i); const t2 = tan(i + 1)
    const h = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3
    d += `C${f1(p1[0] + t1[0] * h)} ${f1(p1[1] + t1[1] * h)} ${f1(p2[0] - t2[0] * h)} ${f1(p2[1] - t2[1] * h)} ${f1(p2[0])} ${f1(p2[1])}`
  }
  return `${d}Z`
}
const SIGMA = Number(process.env.HALF_SIGMA || 4)
const EPS = Number(process.env.HALF_EPS || 0.45)
const MAX_SEG = 60
function trace(m, sigma = SIGMA, minArea = 400) {
  const all = loops(m).filter((p) => areaOf(p) > minArea)
  let nodes = 0
  const d = all.map((p) => { const q = thin(smooth(p, sigma), EPS, MAX_SEG); nodes += q.length; return toPath(q) }).join('')
  return { d, nodes, loops: all.length }
}
const tBody = trace(body)
const tBelly = trace(belly, 6)
const tPawL = trace(pawL)
const tPawR = trace(pawR)
const tGap = trace(pawGap)

// —— 5. 登录页探头：水面抬到下巴下面，爪子往上挪，只留爪尖 ——
const pawTop = Math.min(pawParts[0].minY, pawParts[1].minY)
const chinY = toSketchY(MUZZLE_BOTTOM)
const LOGIN_WATER_Y = BELLY_TOP - 2 // 水面抬到肚皮上沿，只露头和一截脖子
const ABOVE = 18 // 爪尖露在水面线以上的高度（这一截压在脖子上，靠下面那道缝分开）
const DIP = 38 // 爪子在水面线以下、画在水带前面的高度
const LOGIN_PAW_TOP = LOGIN_WATER_Y - ABOVE
const LOGIN_DY = LOGIN_PAW_TOP - pawTop
const FIST_W = 118 // 只留拳头那一截（从爪子朝里的一头往外量），不带前臂
const tipOf = (m, part, inner) => {
  const s = shiftY(m, LOGIN_DY)
  const cut = s.map((v, i) => { const x = i % W; return v && rowOf(i) < LOGIN_WATER_Y + DIP && (inner === 'right' ? x > part.maxX - FIST_W : x < part.minX + FIST_W) ? 1 : 0 })
  return largest(roundOff(cut, 13))
}
const tipL = tipOf(pawL, pawParts[0], 'right')
const tipR = tipOf(pawR, pawParts[1], 'left')
const tTipL = trace(tipL)
const tTipR = trace(tipR)
const tTipGap = trace(morph(or(tipL, tipR), GAP, false))

// —— 6. 量头宽（含耳朵）、物件外框 ——
const measurePage = await browser.newPage()
const headBox = await (async () => {
  await measurePage.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${HEAD_SHAPE}</svg>`)
  return measurePage.evaluate(() => { const b = document.querySelector('path').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
})()
const HEAD_W = headBox.w * S // 草图像素里的头宽
const UNIT = HEAD_W / 240 // 物件画框 1 单位 = 多少草图像素
const objects = {}
for (const name of ['stone-round', 'scallop', 'clam']) {
  const src = OBJ(name)
  const inner = src.replace(/^[\s\S]*?<title>[^<]*<\/title>/, '').replace(/<\/svg>\s*$/, '').trim()
  await measurePage.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`)
  const box = await measurePage.evaluate(() => { const bs = [...document.querySelectorAll('path')].map((e) => e.getBBox()); const x0 = Math.min(...bs.map((b) => b.x)); const y0 = Math.min(...bs.map((b) => b.y)); const x1 = Math.max(...bs.map((b) => b.x + b.width)); const y1 = Math.max(...bs.map((b) => b.y + b.height)); return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } })
  objects[name] = { inner, box }
}
await measurePage.close()
// 物件公共系数：三样东西一起等比缩，相互大小不变。按约定（1.0）扇贝有 326 像素宽，比两条前臂之间还宽，
// 盖住整个胸口；0.52 时圆墩石头和草图那颗一样宽，但爪子外挪以后石头碰不到爪子。取 0.6：石头两边各被爪子压住一点。
const HOLD_K = Number(process.env.HALF_HOLD_K || 0.6)
const STONE_K_SKETCH = (rockBox.maxX - rockBox.minX + 1) / (objects['stone-round'].box.w * UNIT) // 草图石头宽 / 约定石头宽，只写进量数
// 物件放在草图石头的位置：横向取两爪之间的中线，纵向取草图石头外框的中心
const HOLD_X = (pawParts[0].maxX + pawParts[1].minX) / 2
// 纵向：物件中心对在两只拳头朝里那一点的高度（握的位置）；若这样上沿会顶出肚皮，就往下挪，上沿离肚皮上沿至少 HOLD_TOP 像素
let BELLY_TOP_MID = 0
while (!belly[BELLY_TOP_MID * W + Math.round(HOLD_X)]) BELLY_TOP_MID++
const HOLD_ANCHOR = process.env.HALF_HOLD_ANCHOR || "top"
const HOLD_TOP = 6
const innerY = (m, sideRight) => { let best = sideRight ? -1 : W; let by = 0; for (let i = 0; i < N; i++) if (m[i]) { const x = i % W; if (sideRight ? x > best : x < best) { best = x; by = rowOf(i) } } return by }
const GRIP_Y = (innerY(pawL, true) + innerY(pawR, false)) / 2
function heldGroup(name) {
  const { inner, box } = objects[name]
  const s = UNIT * HOLD_K
  const cx = box.x0 + box.w / 2
  const tx = HOLD_X - cx * s
  const top = HOLD_ANCHOR === "top" ? BELLY_TOP_MID + HOLD_TOP : Math.max(BELLY_TOP_MID + HOLD_TOP, GRIP_Y - (box.h * s) / 2)
  const ty = top - box.y0 * s
  return `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${s.toFixed(4)})">\n${inner.replace(/^\s+/gm, '  ')}\n</g>`
}

// —— 7. 拼图 ——
const PAD = 28
const WATER_END = process.env.HALF_WATER_END || 'round'
const bodyBox = components(bodyOnly).list[0]
const WATER = { x: bodyBox.minX - 46, w: bodyBox.maxX - bodyBox.minX + 92, h: 84 }
const waterRect = (y) => `<rect id="water" x="${WATER.x}" y="${y}" width="${WATER.w}" height="${WATER.h}" rx="${WATER_END === 'round' ? WATER.h / 2 : 0}" fill="${COLOR.pale}"/>`
const headTop = Math.floor(toSketchY(headBox.y))
const VB = { x: WATER.x - PAD, y: headTop - PAD, w: WATER.w + 2 * PAD, h: WATER_Y + WATER.h + PAD - (headTop - PAD) }
const VB_LOGIN = { ...VB, h: LOGIN_WATER_Y + WATER.h + PAD - VB.y }
const vbStr = (v) => `${v.x} ${v.y} ${v.w} ${v.h}`
const headXf = `translate(${f1(TX)} ${f1(TY)}) scale(${S.toFixed(4)})`
const head = `<g id="head" transform="${headXf}"><clipPath id="half-chin"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><g clip-path="url(#half-chin)">${HEAD_SHAPE}</g>${MUZZLE}${EYES}${NOSE}${DOTS}</g>`
const NOTE = '<!-- 对比稿，不是母版：半身像第一轮，身体、肚皮、爪子照 M2 半身草图的轮廓描（scripts/brand/half-trace.mjs），头是头像母版原样缩放，物件是 mascot/objects/ 的定稿形原样缩放。提案 · 单一来源。 -->'
const STATES = {
  half: { title: '獭獭 · 半身像（底稿，手里空着）', held: null },
  searching: { title: '獭獭 · 半身像 · 找题中（拿圆墩石头）', held: 'stone-round' },
  offer: { title: '獭獭 · 半身像 · 递出结果（拿扇贝）', held: 'scallop' },
  'not-found': { title: '獭獭 · 半身像 · 没找到（拿合着的蛤）', held: 'clam' },
  login: { title: '獭獭 · 半身像 · 登录页探头（从水里探头，爪子搭在水面上）', held: null, login: true },
}
function build(key, crumbs = '') {
  const st = STATES[key]
  if (st.login) {
    const clipH = LOGIN_WATER_Y + 12 - VB.y
    const v = VB_LOGIN
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(v)}">\n${NOTE}\n<title>${st.title}</title>\n<clipPath id="half-above-water"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${clipH}"/></clipPath>\n<mask id="half-tip-gap" maskUnits="userSpaceOnUse" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="#fff"/><path d="${tTipGap.d}" fill="#000"/></mask>\n<g id="figure" clip-path="url(#half-above-water)">\n<g mask="url(#half-tip-gap)">\n<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n</g>\n</g>\n${waterRect(LOGIN_WATER_Y)}\n<g id="paws">\n<path id="paw-left" d="${tTipL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tTipR.d}" fill="${COLOR.mint}"/>\n</g>\n</svg>\n`
  }
  const held = st.held ? heldGroup(st.held) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(VB)}">\n${NOTE}\n<title>${st.title}</title>\n<mask id="half-paw-gap" maskUnits="userSpaceOnUse" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}"><rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#fff"/><path d="${tGap.d}" fill="#000"/>${crumbs ? `<path d="${crumbs}" fill="#000"/>` : ''}</mask>\n<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n<g id="held" mask="url(#half-paw-gap)">${held ? `\n${held}\n` : ''}</g>\n<g id="paws">\n<path id="paw-left" d="${tPawL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tPawR.d}" fill="${COLOR.mint}"/>\n</g>\n${waterRect(WATER_Y)}\n</svg>\n`
}
const FILES = { half: 'otter-half.svg', searching: 'state-searching.svg', offer: 'state-offer.svg', 'not-found': 'state-not-found.svg', login: 'state-login.svg' }
// 物件被缝切开以后，爪子外侧可能剩下几条细碎的边角（一两个像素宽）。把每张状态图的物件单独栅格化，
// 面积小于 CRUMB 的碎块往外扩 3 像素，描成路径并进蒙版里一起挖掉。物件本身的路径不动。
const CRUMB = 900
const crumbsOf = {}
for (const k of Object.keys(FILES)) {
  if (!STATES[k].held) continue
  const only = build(k).replace(/<path id="body"[^>]*\/>|<path id="belly"[^>]*\/>|<g id="head"[\s\S]*?<\/g><\/g>|<g id="paws">[\s\S]*?<\/g>|<rect id="water"[^>]*\/>/g, '')
  const big = only.replace(/viewBox="[^"]*"/, `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"`)
  const r = await pixelsOf(`<body style="margin:0;background:#fff"><img id="i" src="${uriSvg(big)}">`, W, H)
  const vis = new Uint8Array(N)
  for (let i = 0; i < N; i++) vis[i] = r.px[i * 4 + 3] > 127 ? 1 : 0
  // 碎块：开运算（9 像素见方的窗）去掉的部分里，贴着缝、面积不太小的那几块，也就是被缝切出来的尖角
  const nearGap = morph(pawGap, 3, false)
  const resid = and(vis, not(open(vis, 4)))
  const { lab, list } = components(resid)
  const hit = new Set()
  for (let i = 0; i < N; i++) if (lab[i] && nearGap[i]) hit.add(lab[i])
  const okIds = new Set(list.filter((c) => c.area >= 40 && hit.has(c.id)).map((c) => c.id))
  const small = or(keep(vis, (c) => c.area < CRUMB), lab.map((v) => (okIds.has(v) ? 1 : 0)))
  const t = trace(morph(small, 3, false), 1, 4)
  crumbsOf[k] = { d: t.d, pieces: t.loops }
}
const svgs = {}
for (const k of Object.keys(FILES)) { svgs[k] = build(k, crumbsOf[k]?.d || ''); writeFileSync(path.join(OUT, FILES[k]), svgs[k]) }

// —— 8. 截图 ——
const shot = async (html, file, width) => {
  const p = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 2 })
  await p.setContent(html)
  await p.screenshot({ path: path.join(OUT, file), fullPage: true })
  await p.close()
}
const CSS = `body{margin:0;padding:28px;background:${COLOR.page};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-end}figure{margin:0;background:#fff;border-radius:8px;padding:14px}figcaption{padding-top:10px}.ov{position:relative;width:560px;height:560px;overflow:hidden}.ov img{position:absolute}`
// 草图和矢量都按草图像素对齐：矢量的 viewBox 是草图坐标的一段
const sk = 560 / 1024
const vbImg = (s, v) => `<img src="${uriSvg(s)}" style="left:${v.x * sk}px;top:${v.y * sk}px;width:${v.w * sk}px;height:${v.h * sk}px">`
await shot(`<style>${CSS}</style><h1>半身像 · 第一轮：照 M2 半身草图描</h1><p>对比稿 · 提案。左：M2 草图（图像生成）。中：描出来的底稿，头换成头像母版，颜色换成品牌色，手里空着。右：两张叠在一起（矢量半透明），同一个坐标；两只爪子各往外挪了 ${SPREAD} 像素，叠看里能看到错开。</p><div class="g"><figure><img src="${uriPng(SKETCH)}" width="560" height="560"><figcaption>M2 草图</figcaption></figure><figure><div class="ov">${vbImg(svgs.half, VB)}</div><figcaption>otter-half.svg</figcaption></figure><figure><div class="ov"><img src="${uriPng(SKETCH)}" style="left:0;top:0" width="560" height="560"><div style="opacity:.55">${vbImg(svgs.half, VB)}</div></div><figcaption>叠看</figcaption></figure></div>`, 'compare.png', 1840)
const cell = (k, label) => `<figure style="width:400px"><img src="${uriSvg(svgs[k])}" width="400"><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end"><img src="${uriSvg(svgs[k])}" width="96"><img src="${uriSvg(svgs[k])}" width="64"><img src="${uriSvg(svgs[k])}" width="48"></div><figcaption>${label} · 400 / 96 / 64 / 48 像素宽</figcaption></figure>`
await shot(`<style>${CSS}.g{align-items:flex-start}</style><h1>半身像 · 四种状态</h1><p>对比稿 · 提案。身体同一份；只换手里的东西。物件是定稿形，按 240 = 头宽，再统一乘 ${HOLD_K}。</p><div class="g">${cell('searching', '找题中 · 圆墩石头')}${cell('offer', '递出结果 · 扇贝')}${cell('not-found', '没找到 · 合着的蛤')}${cell('login', '登录页探头 · 空手')}</div>`, 'states.png', 1840)
// 同头宽并排：坐姿的头缩放 0.3261（otter-sit.svg 里头的 transform），viewBox 1024
const SIT_S = Number((SIT.match(/<g transform="translate\([^)]*\) scale\(([\d.]+)\)">/) || [])[1])
const SIT_TY = Number((SIT.match(/<g transform="translate\([\d.-]+ ([\d.-]+)\) scale/) || [])[1])
const HEAD_PX = 220
const sitW = (HEAD_PX * 1024) / (headBox.w * SIT_S)
const halfW = (HEAD_PX * VB.w) / HEAD_W
const sitEye = ((SIT_TY + MASTER_EYE.cy * SIT_S) * sitW) / 1024
const halfEye = ((SK_EYE.cy - VB.y) * halfW) / VB.w
const top = Math.max(sitEye, halfEye)
await shot(`<style>${CSS}.g{align-items:flex-start}</style><h1>半身像和坐姿全身像 · 同头宽</h1><p>对比稿 · 提案。两张的头宽都是 ${HEAD_PX} 像素（含耳朵），眼睛对在同一条线上。左：otter-half.svg。右：mascot/otter-sit.svg（定稿）。</p><div class="g"><figure><img src="${uriSvg(svgs.half)}" width="${f1(halfW)}" style="margin-top:${f1(top - halfEye)}px"><figcaption>otter-half.svg</figcaption></figure><figure><img src="${uriSvg(SIT)}" width="${f1(sitW)}" style="margin-top:${f1(top - sitEye)}px"><figcaption>otter-sit.svg</figcaption></figure></div>`, 'with-sit.png', 1400)
await browser.close()

// —— 9. 量数 ——
const visibleH = WATER_Y - toSketchY(headBox.y)
const headVisH = (HEAD_CLIP_Y - headBox.y) * S // 头顶到母版裁切线（下巴下面）
const widthAt = (y) => { let x0 = -1; let x1 = -1; for (let x = 0; x < W; x++) if (bodyOnly[y * W + x]) { if (x0 < 0) x0 = x; x1 = x } return x1 - x0 + 1 }
const f2 = (n) => Math.round(n * 100) / 100
// 身体宽 / 头宽：脖子下 40、80、120、160、200 行，和水面上 10 行
const widths = Object.fromEntries([40, 80, 120, 160, 200].map((d) => [`cut+${d}`, f2(widthAt(CUT_Y + d) / HEAD_W)]).concat([['water-10', f2(widthAt(WATER_Y - 10) / HEAD_W)]]))
let widest = 0
for (let y = CUT_Y; y < WATER_Y; y++) { let x0 = -1; let x1 = -1; for (let x = 0; x < W; x++) if (bodyOnly[y * W + x]) { if (x0 < 0) x0 = x; x1 = x } widest = Math.max(widest, x1 - x0 + 1) }
const objScale = Object.fromEntries(Object.entries(objects).map(([k, o]) => [k, { box240: [f1(o.box.w), f1(o.box.h)], conventionPx: [f1(o.box.w * UNIT), f1(o.box.h * UNIT)], usedPx: [f1(o.box.w * UNIT * HOLD_K), f1(o.box.h * UNIT * HOLD_K)] }]))
console.log(JSON.stringify({
  eyes: SK_EYE, headScale: S, headWidthPx: f1(HEAD_W), cutY: CUT_Y, waterY: WATER_Y, bellyTop: BELLY_TOP,
  bellyBridge: { left: [bl.yA, bl.yB], right: [br.yA, br.yB] },
  sketchRockPx: [rockBox.maxX - rockBox.minX + 1, rockBox.maxY - rockBox.minY + 1],
  headOfVisible: f1(headVisH / visibleH), visibleH: f1(visibleH),
  widthOverHead: widths, widestOverHead: f2(widest / HEAD_W), headOfVisibleExact: f2(headVisH / visibleH),
  crumbs: Object.fromEntries(Object.entries(crumbsOf).map(([k, v]) => [k, v.pieces])), holdK: HOLD_K, stoneKSketch: f1(STONE_K_SKETCH * 100) / 100, gripY: GRIP_Y, bellyTopMid: BELLY_TOP_MID, spread: SPREAD, objects: objScale,
  login: { pawDy: LOGIN_DY, waterY: LOGIN_WATER_Y },
  nodes: { body: tBody.nodes, belly: tBelly.nodes, pawL: tPawL.nodes, pawR: tPawR.nodes, gap: tGap.nodes, tipL: tTipL.nodes, tipR: tTipR.nodes },
  loops: { body: tBody.loops, belly: tBelly.loops, pawL: tPawL.loops, pawR: tPawR.loops },
  bytes: Object.fromEntries(Object.entries(svgs).map(([k, s]) => [k, s.length])),
}, null, 1))
