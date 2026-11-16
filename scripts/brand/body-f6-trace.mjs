#!/usr/bin/env node
// 全身像主姿势 · 第三轮：不再手写曲线，照 F6 草图的轮廓描成平涂矢量（BRAND.md §7 第 103 条；
// Owner 2026-11-14「F6本身身材很好了」）。提案 · 单一来源。
//
// 做什么：读 F6 草图的像素，按颜色分成 身体 / 肚皮 / 石头 三块，各自沿边描成闭合曲线；
// 草图的头整个不要，换成头像母版 otter-head.svg（按两眼中心和眼距对齐）；颜色全部换成 BRAND.md §1.5 的色。
// 母版文件不改。
//
// 用法：node scripts/brand/body-f6-trace.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/body-f6-round3/ 下的 body-f6.svg、compare.png、check-*.png
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/body-f6-round3')
const SKETCH = path.join(OUT, 'source-F6-sketch.png')
const HEAD_MASTER = readFileSync(path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg'), 'utf8')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

const COLOR = { mint: '#72BFA4', pale: '#DDF1E8', stone: '#6E828C', page: '#F1F5F7' }
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
// 母版两眼中心和眼距（otter-head.svg 里两只眼睛的 cx、cy）
const MASTER_EYE = { cx: (336.45 + 688.25) / 2, cy: 371.25, gap: 688.25 - 336.45 }
const HEAD_CLIP_Y = 680 // 母版头形在下巴下面这条线裁掉，不带母版的肩

const browser = await chromium.launch({ channel: 'chromium' })
const uriPng = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`

// —— 1. 取像素 ——
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.setContent(`<img id="i" src="${uriPng(SKETCH)}">`)
const { W, H, b64 } = await page.evaluate(async () => {
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
const px = Buffer.from(b64, 'base64')
const N = W * H

// —— 2. 按颜色分类（中心色从草图上量的，目测取点） ——
const at = (x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]
const CENTER = { bg: at(40, 40), mint: at(400, 620), pale: at(580, 620), rock: at(620, 950), ink: [20, 20, 20] }
const NAMES = Object.keys(CENTER)
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
const K = Object.fromEntries(NAMES.map((n, k) => [n, k]))
const maskOf = (fn) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = fn(cls[i], i) ? 1 : 0; return m }

// 形态学：方窗腐蚀 / 膨胀
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
const and = (a, b) => a.map((v, i) => v & b[i])
const or = (a, b) => a.map((v, i) => v | b[i])

// 连通块（4 邻）
function components(m) {
  const lab = new Int32Array(N)
  const list = []
  const stack = []
  for (let s = 0; s < N; s++) {
    if (!m[s] || lab[s]) continue
    const id = list.length + 1
    const c = { id, area: 0, sx: 0, sy: 0, minY: H, maxY: 0 }
    lab[s] = id
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()
      const x = i % W
      const y = (i - x) / W
      c.area++; c.sx += x; c.sy += y
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
// 填洞：从四边灌水，灌不到的都算里面
function fill(m) { const inv = m.map((v) => 1 - v); const { lab, list } = components(inv); const edge = new Set(); for (let x = 0; x < W; x++) { edge.add(lab[x]); edge.add(lab[(H - 1) * W + x]) } for (let y = 0; y < H; y++) { edge.add(lab[y * W]); edge.add(lab[y * W + W - 1]) } void list; return m.map((v, i) => (v || !edge.has(lab[i]) ? 1 : 0)) }

// 草图的两只眼睛：头部墨色块里第二、第三大的两块（最大的是鼻子）
const inkParts = components(open(maskOf((c) => c === K.ink), 1)).list.sort((a, b) => b.area - a.area)
const eyes = inkParts.slice(1, 3).sort((a, b) => a.cx - b.cx)
const SK_EYE = { cx: (eyes[0].cx + eyes[1].cx) / 2 + 0.5, cy: (eyes[0].cy + eyes[1].cy) / 2 + 0.5, gap: eyes[1].cx - eyes[0].cx }
const S = SK_EYE.gap / MASTER_EYE.gap
const TX = SK_EYE.cx - MASTER_EYE.cx * S
const TY = SK_EYE.cy - MASTER_EYE.cy * S
const toSketchY = (my) => TY + my * S
// 草图的头在这条线以上全部不要（落在母版下巴拐点稍下，被母版的头盖住）
const CUT_Y = Math.round(toSketchY(670))
const STUB = 8 // 线以上只留一截比脖子窄的桩子伸进头里，免得接头处露角

const rockRaw = open(maskOf((c) => c === K.rock), 2)
const rock0 = largest(rockRaw)
let body = maskOf((c, i) => c !== K.bg && !rock0[i])
body = fill(largest(open(body, 2)))
{
  const row = CUT_Y * W
  let x0 = 0
  let x1 = W - 1
  while (!body[row + x0]) x0++
  while (!body[row + x1]) x1--
  for (let y = 0; y < CUT_Y; y++) for (let x = 0; x < W; x++) if (y < CUT_Y - 40 || x < x0 + STUB || x > x1 - STUB) body[y * W + x] = 0
}
body = largest(body)
// 母版的头（裁到下巴）也画成像素并进身体，描成一整条外轮廓垫在下面，接头处就没有台阶；母版的头形仍原样盖在上面
const headMask = await (async () => {
  const hp = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await hp.setContent(`<body style="margin:0;background:#fff"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="translate(${TX} ${TY}) scale(${S})"><clipPath id="c"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><g clip-path="url(#c)">${HEAD_SHAPE.replace(/fill="[^"]+"/, 'fill="#000"')}</g></g></svg>`)
  const png = await hp.screenshot({ type: 'png' })
  await hp.setContent(`<img id="i" src="data:image/png;base64,${png.toString('base64')}">`)
  const bits = await hp.evaluate(async () => { const img = document.getElementById('i'); await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let o = ''; for (let i = 0; i < d.length; i += 4) o += d[i] < 128 ? '1' : '0'; return o })
  await hp.close()
  return Uint8Array.from(bits, (ch) => (ch === '1' ? 1 : 0))
})()
const bodyOnly = body
body = largest(or(body, headMask))
let belly = and(open(maskOf((c) => c === K.pale), 2), morph(bodyOnly, 3, true))
belly = keep(belly, (c) => c.area > 2000 && c.minY > CUT_Y)
// 石头垫到身体底下一点，免得两块之间露缝
const rock = fill(or(rock0, and(morph(rock0, 8, false), bodyOnly)))

// —— 3. 沿边描线 ——
// 走像素之间的缝，里面在左手边，得到闭合折线；再沿线做一次环形平滑、抽稀、转成三次贝塞尔。
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
// 抽稀（Ramer–Douglas–Peucker），再把太长的段对半补点
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
// 过每个点的三次贝塞尔：切线取前后两点连线的方向，把手长是本段弦长的三分之一
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
const SIGMA = Number(process.env.F6_SIGMA || 4)
const EPS = Number(process.env.F6_EPS || 0.45)
const MAX_SEG = 60 // 抽稀后一段最多跨多少个像素步
function trace(m) {
  const all = loops(m).filter((p) => areaOf(p) > 400) // 只要外圈，洞和碎屑不要
  let nodes = 0
  const d = all.map((p) => { const q = thin(smooth(p, SIGMA), EPS, MAX_SEG); nodes += q.length; return toPath(q) }).join('')
  return { d, nodes }
}
const tBody = trace(body)
const tBelly = trace(belly)
const tRock = trace(rock)

// —— 4. 拼图 ——
const headXf = `translate(${f1(TX)} ${f1(TY)}) scale(${S.toFixed(4)})`
const head = `<g transform="${headXf}"><clipPath id="f6-chin"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><g clip-path="url(#f6-chin)">${HEAD_SHAPE}</g>${MUZZLE}${EYES}${NOSE}${DOTS}</g>`
const NOTE = '<!-- 对比稿，不是母版：全身像主姿势第三轮，身体、肚皮、石头照 F6 草图的轮廓描（scripts/brand/body-f6-trace.mjs），头是头像母版原样缩放。提案 · 单一来源。 -->'
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n${NOTE}\n<title>獭獭 · 全身像主姿势（坐石）· 第三轮对比稿</title>\n<path d="${tRock.d}" fill="${COLOR.stone}"/>\n<path d="${tBody.d}" fill="${COLOR.mint}"/>\n<path d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n</svg>\n`
writeFileSync(path.join(OUT, 'body-f6.svg'), svg)

const uriSvg = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const html = `<style>body{margin:0;padding:28px;background:${COLOR.page};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-end}figure{margin:0;background:#fff;border-radius:8px;padding:14px}figcaption{padding-top:10px}.ov{position:relative;width:560px;height:560px}.ov img{position:absolute;inset:0}</style><h1>全身像主姿势 · 第三轮：照 F6 草图描</h1><p>对比稿 · 提案。左：F6 草图（图像生成）。中：描出来的矢量，头换成头像母版，颜色换成品牌色。右：两张叠在一起（矢量半透明）。再右：缩到 160、96、48 像素。</p><div class="g"><figure><img src="${uriPng(SKETCH)}" width="560" height="560"><figcaption>F6 草图</figcaption></figure><figure><img src="${uriSvg(svg)}" width="560" height="560"><figcaption>矢量 · 第三轮</figcaption></figure><figure><div class="ov"><img src="${uriPng(SKETCH)}" width="560" height="560"><img src="${uriSvg(svg)}" width="560" height="560" style="opacity:.55"></div><figcaption>叠看</figcaption></figure><figure><div class="g"><img src="${uriSvg(svg)}" width="160"><img src="${uriSvg(svg)}" width="96"><img src="${uriSvg(svg)}" width="48"></div><figcaption>小尺寸</figcaption></figure></div>`
const sheet = await browser.newPage({ viewport: { width: 2200, height: 760 }, deviceScaleFactor: 1 })
await sheet.setContent(html)
await sheet.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
const one = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await one.setContent(`<body style="margin:0;background:#fff"><img src="${uriSvg(svg)}" width="1024" height="1024">`)
await one.screenshot({ path: path.join(OUT, 'check-large.png') })
await browser.close()
console.log(JSON.stringify({ eyes: SK_EYE, scale: S, cutY: CUT_Y, nodes: { body: tBody.nodes, belly: tBelly.nodes, rock: tRock.nodes }, bytes: svg.length }))
