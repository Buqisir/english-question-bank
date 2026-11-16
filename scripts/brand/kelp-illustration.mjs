#!/usr/bin/env node
// 原语插画 · 巨藻重画（提案 · 单一来源，2026-11-14）。照 BRAND.md §7 第 112、114 条：illustration/kelp.svg 换成第 112 条的巨藻画法，
// 叶形、气囊、中脉、颜色取自定稿 mascot/objects/kelp-blade.svg（巨藻一段，第七轮 B），只平移、转动、等比缩放，不改形。
// 画框照原图的宽高比（26.64 : 71.4），透明底，一株。
//
// 五版：
//   第一版（round1，不过）：三段整枝 kelp-blade 沿一根茎往上摞，段和段之间用 kelp-blade 自己那根茎接上。
//   第二版（round2，不过）：不再摞整枝。只取 kelp-blade 里的单片叶（叶片 + 叶根那颗气囊 + 中脉，三片叶形各不相同），
//     沿一根新画的长茎一片一片排开；长茎照 kelp-blade 茎的粗细和颜色、同一种画法（中线过点的平涂带），略带 S 弯；
//     根部是小圆瓣的固着器。整株按剪影的重心在画框里左右居中（叶尖不出框为限），茎根贴画框下沿。
//     另出小尺寸版 kelp-small.svg：同一株，去掉中脉，全深薄荷实心。
//   第三版（round3，不过）：同第二版的组法，茎加粗约 1.6 倍、S 弯加大，固着器做成三瓣舒展的脚，叶放大、五片角度拉开，
//     同形的两片大小角度差开。小尺寸版去中脉，茎另按「64px 高时最细 2px」倒推加粗（比正常版粗）。
//   第四版（round4，不过）：茎是真的 S（下半往左鼓、上半往右鼓），梢头收尖、尖上一片缩小的嫩叶；固着器是三根张开的根指；
//     叶只用 a、b 两种叶形，下面两片靠近、中间一段空茎露出 S 弯、上面三片再密一点，有一片略往下垂；
//     中脉按审稿意见重画（这一处偏离定稿 kelp-blade）：沿叶的中线、从叶根往叶尖走约叶长的五成，宽约定稿中脉的一半，两头尖；
//     每片叶按「122px 高时叶边深色最窄 ≥ 2px」单独收窄中脉，收到太细就不画。
//   第五版（round5，默认）：茎、空茎、下垂的第 3 片、梢头嫩叶照第四版；固着器改回矮底座加三个贴地圆瓣（宽约茎根宽 4 倍）；
//     五片叶放回第三版的大小（1.2–1.36）；每片叶都画中脉（嫩叶除外）：取定稿中脉自己的形，沿叶长压到 0.5 个叶长、宽度按比例缩，
//     比例逐片按「122px 高时叶边深色最窄 ≥ 2px」算，放不下就把叶放大，不跳过。
//
// 做什么：
//   默认（round5）：
//     1. 原图另存（illustration/kelp-old-2026-11-14.svg 不存在时才做：复制现在的 kelp.svg，开头加「停用，第 114 条」注释）。
//     2. 前三版的留档（kelp-illustration/round1/kelp-round1.svg、round2/kelp-round2.svg、round2/kelp-small-round2.svg、
//        round3/kelp-round3.svg、round3/kelp-small-round3.svg、round4/kelp-round4.svg、round4/kelp-small-round4.svg）
//        不存在时先按各自参数生成。
//     3. 写 illustration/kelp.svg 和 illustration/kelp-small.svg（第五版）。
//     4. 出 kelp-illustration/round5/compare.png：旧 | 第四版 | 第五版，白底和页面底色 #F1F5F7 各一组；
//        64px 高（第四、五版用各自的 small 版）、122px 高（手册 09 页的用法）、480px 高（大尺寸），deviceScaleFactor 2。
//   round1：复现第一版，写 round1/kelp-round1.svg 和第一版的对照图 kelp-illustration/compare.png，不碰 kelp.svg。
//   round2：复现第二版，写 round2/kelp-round2.svg、round2/kelp-small-round2.svg 和 round2/compare.png，不碰 kelp.svg。
//   round3：复现第三版，写 round3/kelp-round3.svg、round3/kelp-small-round3.svg 和 round3/compare.png，不碰 kelp.svg。
//   round4：复现第四版，写 round4/kelp-round4.svg、round4/kelp-small-round4.svg 和 round4/compare.png，不碰 kelp.svg。
//   preview out.png：按第五版参数出一张对照预览，不写任何 SVG（调构图用；KELP5='{...}' 覆盖参数；KELP5_DUMP=x.svg 另存预览的 SVG）。
//
// 用法：
//   node scripts/brand/kelp-illustration.mjs              第五版：kelp.svg、kelp-small.svg、round5/compare.png
//   node scripts/brand/kelp-illustration.mjs round1       复现第一版
//   node scripts/brand/kelp-illustration.mjs round2       复现第二版
//   node scripts/brand/kelp-illustration.mjs round3       复现第三版
//   node scripts/brand/kelp-illustration.mjs round4       复现第四版
//   KELP5='{"leaves":[...]}' node scripts/brand/kelp-illustration.mjs preview /tmp/x.png
// playwright 从 app/ 的依赖里取；浏览器用 Playwright 的完整 Chromium（channel: 'chromium'）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const BLADE = path.join(BRAND, 'mascot/objects/kelp-blade.svg')
const KELP = path.join(BRAND, 'illustration/kelp.svg')
const KELP_SMALL = path.join(BRAND, 'illustration/kelp-small.svg')
const OLD = path.join(BRAND, 'illustration/kelp-old-2026-11-14.svg')
const OUT = path.join(BRAND, 'image-review-2026-11-14/kelp-illustration')
const R1_SVG = path.join(OUT, 'round1/kelp-round1.svg')
const R2_SVG = path.join(OUT, 'round2/kelp-round2.svg')
const R2_SMALL = path.join(OUT, 'round2/kelp-small-round2.svg')
const R3_SVG = path.join(OUT, 'round3/kelp-round3.svg')
const R3_SMALL = path.join(OUT, 'round3/kelp-small-round3.svg')
const R4_SVG = path.join(OUT, 'round4/kelp-round4.svg')
const R4_SMALL = path.join(OUT, 'round4/kelp-small-round4.svg')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const MODE = process.argv[2] || 'round5'

const ASPECT = 26.64 / 71.4 // 原图 viewBox 31.6 5.4 26.64 71.4
const DEEP = '#2C6E56'
const PALE = '#DDF1E8'

const f1 = (n) => (Math.round(n * 10) / 10).toString()
const f2 = (n) => (Math.round(n * 100) / 100).toString()
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const len = (a) => Math.hypot(a[0], a[1])
const norm = (a) => mul(a, 1 / (len(a) || 1))
const rotPt = ([x, y], deg) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}

// ---------- 读定稿 ----------
const bladeSrc = readFileSync(BLADE, 'utf8')
const bladePaths = [...bladeSrc.matchAll(/<path d="([^"]+)" fill="([^"]+)"\s*\/>/g)].map((m) => ({ d: m[1], fill: m[2] }))
if (bladePaths.length !== 10) throw new Error(`kelp-blade.svg 应有 10 条路径，读到 ${bladePaths.length}`)
// 路径次序（读文件确认过）：0 茎；1/3/5 气囊（下、中、上）；2/4/6 叶片（下、中、上）；7/8/9 中脉（下、中、上）
const LEAF = [
  { bulb: 1, blade: 2, rib: 7 }, // a：最下面那片，最长、最平
  { bulb: 3, blade: 4, rib: 8 }, // b：中间那片
  { bulb: 5, blade: 6, rib: 9 }, // c：最上面那片，最短、最斜
]
const nums = (d) => d.match(/-?\d+\.?\d*/g).map(Number)
const ptsOf = (d) => { const n = nums(d), p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p }
const bboxPts = (p) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
// 每片叶的挂点：气囊中心那个高度上，kelp-blade 茎的中线。挂到新茎上时就是这一点贴着新茎的中线，气囊压茎的样子和定稿一样。
const stemPts = ptsOf(bladePaths[0].d)
function stemCenterAt(y) {
  const near = stemPts.filter((p) => Math.abs(p[1] - y) < 3)
  const xs = near.map((p) => p[0])
  return (Math.min(...xs) + Math.max(...xs)) / 2
}
for (const L of LEAF) {
  const b = bboxPts(ptsOf(bladePaths[L.bulb].d)), cy = (b[1] + b[3]) / 2
  L.anchor = [stemCenterAt(cy), cy]
}

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1200 } })

async function bboxOf(inner) {
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="-500 -900 1000 1000">${inner}</svg>`)
  return page.evaluate(() => { const b = document.getElementById('all').getBBox(); return [b.x, b.y, b.width, b.height] })
}
// 剪影重心的 x（按 1 单位 = 1px 渲染后数不透明像素）
async function centroidX(inner, box) {
  const [x, y, w, h] = box, W = Math.ceil(w) + 4, H = Math.ceil(h) + 4
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x - 2} ${y - 2} ${W} ${H}">${inner}</svg>`
  await page.setContent('<canvas id="c"></canvas>')
  return page.evaluate(async ({ svg, W, H, x0 }) => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
    await img.decode()
    const c = document.getElementById('c'); c.width = W; c.height = H
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, W, H).data
    let s = 0, sx = 0
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const a = d[(j * W + i) * 4 + 3]; s += a; sx += a * i }
    return x0 + sx / s
  }, { svg, W, H, x0: x - 2 })
}

// ---------- 第一版（不过，留档复现用） ----------
const STEM_BOT = [37.5, 224.5]
const STEM_TOP = [85.5, 92.5]
const R1 = {
  segs: [
    { kind: 'blade', s: 1, rot: -6 },
    { kind: 'stem', s: 0.95, rot: -30 },
    { kind: 'blade', s: 0.86, rot: -10 },
    { kind: 'stem', s: 0.8, rot: -30 },
    { kind: 'blade', s: 0.72, rot: -12 },
  ],
  overlap: 3,
  pad: 2,
}
async function buildRound1() {
  const K = R1
  let at = [0, 0]
  const uses = []
  for (const seg of K.segs) {
    const transform = `translate(${f2(at[0])} ${f2(at[1])}) rotate(${f2(seg.rot)}) scale(${f2(seg.s)}) translate(${f2(-STEM_BOT[0])} ${f2(-STEM_BOT[1])})`
    const v = rotPt([(STEM_TOP[0] - STEM_BOT[0]) * seg.s, (STEM_TOP[1] - STEM_BOT[1]) * seg.s], seg.rot)
    const back = K.overlap / Math.hypot(v[0], v[1])
    uses.push({ href: seg.kind === 'stem' ? '#kb-stem' : '#kb', transform, kind: seg.kind })
    at = [at[0] + v[0] * (1 - back), at[1] + v[1] * (1 - back)]
  }
  uses.sort((a, b) => (a.kind === 'stem' ? -1 : 0) - (b.kind === 'stem' ? -1 : 0))
  const defs = `<defs><g id="kb">\n${bladePaths.map((p, i) => `    <path${i === 0 ? ' id="kb-stem"' : ''} d="${p.d}" fill="${p.fill}" />`).join('\n')}\n  </g></defs>`
  const body = uses.map((u) => `  <use href="${u.href}" transform="${u.transform}" />`).join('\n')
  const [x, y, w, h] = await bboxOf(`${defs}<g id="all">${body}</g>`)
  let vw = w + 2 * K.pad, vh = h + 2 * K.pad
  if (vw / vh < ASPECT) vw = vh * ASPECT
  else vh = vw / ASPECT
  const vx = x + w / 2 - vw / 2, vy = y + h + K.pad - vh
  const archive = '<!-- 第一版留档（不过，2026-11-14 审）：三段一模一样的三叶小枝摞起来像盖章；九片叶挤在一侧，122px 下成锯齿边；64px 下读成线稿。kelp.svg 已换成第二版，见 image-review-2026-11-14/kelp-illustration/round2/README.md。下面一条是当时写在 kelp.svg 里的注释。由 node scripts/brand/kelp-illustration.mjs round1 复现。 -->'
  const note = `<!-- 原语插画 · 巨藻（2026-11-14 换成 BRAND.md §7 第 112 条的画法，第 114 条第五项）：一株，由 3 段定稿 mascot/objects/kelp-blade.svg（巨藻一段，第七轮 B）沿一根茎往上接成，段和段之间用 kelp-blade 自己那根茎接上；每段只平移、转动、等比缩放，叶形、气囊、中脉和颜色没改。叶都朝右顺水飘。只用深薄荷 #2C6E56 和浅雾薄荷 #DDF1E8；平涂，无描边、无渐变、无阴影；透明底。画框照原图的宽高比 26.64 : 71.4，茎根贴画框下沿，引用的地方不用改。原图另存在 illustration/kelp-old-2026-11-14.svg（停用，第 114 条）。提案 · 单一来源，由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/README.md。 -->`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}">
${archive}
${note}
<title>巨藻（第一版，不过）</title>
  ${defs}
${body}
</svg>
`
}

// ---------- 第二版 ----------
// 坐标：茎根在 (0,0)，往上 y 为负；单位和 kelp-blade 的画框一样（240 = 獭獭头宽）。
// rot：叶整片绕挂点转的角度（度，负 = 逆时针、叶往上抬）。y：挂点的高度（挂在茎上 y 最接近的那一点）。
const R2 = {
  // 茎中线过的点：下半往左鼓、上半往右收，略带 S 弯；叶朝右飘，所以茎整体偏左
  stem: [[0, 0], [-12, -100], [-24, -220], [-18, -340], [0, -450], [12, -555], [13, -603]],
  stemHw: [6.8, 4.8], // 半宽：根部、梢头。kelp-blade 的茎量下来半宽约 5.6 到 6.3
  // 五片叶，三片源叶轮着用（a b a c b），从下往上变小，间距 146、138、120、108 往上收
  leaves: [
    { src: 0, y: -84, s: 1.12, rot: -10 },
    { src: 1, y: -230, s: 1.02, rot: -4 },
    { src: 0, y: -368, s: 0.9, rot: -14 },
    { src: 2, y: -488, s: 0.86, rot: -2 },
    { src: 1, y: -596, s: 0.7, rot: -8 },
  ],
  // 固着器：一个底座圆加三个小圆瓣，[dx, dy, r]，相对茎根
  holdfast: [[0, -7, 9], [-13, 3, 8], [0, 7, 8.5], [13, 3, 8]],
  pad: 3,
}

function openSpline(pts, k = 24) {
  const n = pts.length, out = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)]
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3)))
    }
  }
  out.push(pts[n - 1])
  return out
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
function smoothClosed(pts) {
  const n = pts.length
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6)), c2 = sub(p2, mul(sub(p3, p1), 1 / 6))
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`
  }
  return d + ' Z'
}
// 沿中线的平涂带，两头半圆收口（和 kelp-blade 的茎同一种画法）
function band(mid, hw) {
  const m = resample(mid, 1.5), n = m.length
  const tang = m.map((p, i) => norm(sub(m[Math.min(i + 1, n - 1)], m[Math.max(i - 1, 0)])))
  const w = m.map((_, i) => hw(i / (n - 1)))
  const left = m.map((p, i) => add(p, mul([-tang[i][1], tang[i][0]], w[i])))
  const right = m.map((p, i) => add(p, mul([tang[i][1], -tang[i][0]], w[i])))
  const cap = (c, t, from, r) => {
    const a = sub(from, c), pts = []
    for (let k = 1; k < 8; k++) { const th = (Math.PI * k) / 8; pts.push(add(c, add(mul(a, Math.cos(th)), mul(t, r * Math.sin(th))))) }
    return pts
  }
  return [...resample(left, 4), ...cap(m[n - 1], tang[n - 1], left[n - 1], w[n - 1]), ...resample(right.slice().reverse(), 4), ...cap(m[0], mul(tang[0], -1), right[0], w[0])]
}
const circlePath = ([cx, cy, r]) => `M${f1(cx - r)} ${f1(cy)} a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0 a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0 Z`
// 固着器的瓣：[dx, dy, r] 是圆；[dx, dy, rx, ry, 转角] 是椭圆（第三版的脚趾用）
const lobePath = (c) => {
  if (c.length === 3) return circlePath(c)
  const [cx, cy, rx, ry, deg] = c, pts = []
  for (let i = 0; i < 24; i++) { const t = (i / 24) * 2 * Math.PI; pts.push(add([cx, cy], rotPt([rx * Math.cos(t), ry * Math.sin(t)], deg))) }
  return smoothClosed(pts)
}

async function buildRound2(K, { small, stemHw = K.stemHw }) {
  const mid = resample(openSpline(K.stem), 1)
  const hw = (t) => stemHw[0] + (stemHw[1] - stemHw[0]) * t
  const stemD = smoothClosed(band(mid, hw))
  const at = (y) => mid.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b))
  // 叶：每片源叶一个 <g>（气囊、叶片、中脉，原样路径），用 <use> 挂到茎上
  const used = [...new Set(K.leaves.map((l) => l.src))].sort()
  const defs = `<defs>\n${used.map((i) => {
    const L = LEAF[i]
    const parts = [L.bulb, L.blade, ...(small ? [] : [L.rib])].map((j) => `      <path d="${bladePaths[j].d}" fill="${bladePaths[j].fill}" />`)
    return `    <g id="leaf-${'abc'[i]}">\n${parts.join('\n')}\n    </g>`
  }).join('\n')}\n  </defs>`
  const uses = K.leaves.map((l) => {
    const p = at(l.y), a = LEAF[l.src].anchor
    return `  <use href="#leaf-${'abc'[l.src]}" transform="translate(${f2(p[0])} ${f2(p[1])}) rotate(${f2(l.rot)}) scale(${f2(l.s)}) translate(${f2(-a[0])} ${f2(-a[1])})" />`
  })
  const body = [
    `  <path d="${stemD}" fill="${DEEP}" />`,
    ...K.holdfast.map((c) => `  <path d="${lobePath(c)}" fill="${DEEP}" />`),
    ...uses,
  ].join('\n')
  const inner = `${defs}<g id="all">${body}</g>`
  const box = await bboxOf(inner)
  const [x, y, w, h] = box
  const cx = await centroidX(inner, box)
  // 画框：高 = 外框高 + 上下边；宽按原图宽高比（外框比它还宽才整体放大）。左右尽量让剪影重心落在画框正中，
  // 但整株不出画框：重心居中会让叶尖出框时，就往回挪到叶尖贴边（重心离中线多远，打印出来）
  let vh = h + 2 * K.pad, vw = vh * ASPECT
  if (w + 2 * K.pad > vw) { vw = w + 2 * K.pad; vh = vw / ASPECT }
  const vx = Math.min(Math.max(cx - vw / 2, x + w + K.pad - vw), x - K.pad), vy = y + h + K.pad - vh
  return { inner, defs, body, box, cx, view: [vx, vy, vw, vh] }
}
function round2Svg(r, { small }) {
  const [vx, vy, vw, vh] = r.view
  const note = small
    ? `<!-- 原语插画 · 巨藻 · 小尺寸版（2026-11-14，提案）：和 illustration/kelp.svg 同一株、同一画框，只去掉叶面上的浅雾薄荷中脉，整株深薄荷 #2C6E56 实心，给 64px 高及以下用（道理同小尺寸头像去胡须点）。要不要拿它换掉 BRAND.md §3.4 里 64px 那处用法，等 Owner 定。由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round2/README.md。 -->`
    : `<!-- 原语插画 · 巨藻（2026-11-14 换成 BRAND.md §7 第 112 条的画法，第 114 条第五项；第二版）：一株。一根长茎（照 mascot/objects/kelp-blade.svg 茎的粗细、颜色和画法新画，略带 S 弯），根部三个小圆瓣的固着器；五片叶沿茎排开、都朝右顺水飘，从下往上变小。叶取自定稿 kelp-blade.svg（第七轮 B）里的单片叶（叶片、叶根气囊、浅雾薄荷中脉，三片源叶轮着用），只平移、转动、等比缩放，形没改。只用深薄荷 #2C6E56 和浅雾薄荷 #DDF1E8；平涂，无描边、无渐变、无阴影；透明底。画框照原图的宽高比 26.64 : 71.4，茎根贴下沿，剪影重心左右居中，引用的地方不用改。原图另存在 illustration/kelp-old-2026-11-14.svg（停用，第 114 条）；第一版留档在 image-review-2026-11-14/kelp-illustration/round1/kelp-round1.svg。64px 及以下另有 illustration/kelp-small.svg（去中脉，提案）。提案 · 单一来源，由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round2/README.md。 -->`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}">
${note}
<title>${small ? '巨藻（小尺寸）' : '巨藻'}</title>
  ${r.defs}
${r.body}
</svg>
`
}

// ---------- 第三版 ----------
// 组法同第二版（buildRound2），只换参数。叶的 rot 换成相对水平的目标角度 ang（朝右上为正），由源叶自己的角度算出要转多少。
// 源叶自己的角度（气囊中心到叶尖，相对水平，读路径量的）：a 约 15°、b 约 28°、c 约 38°。
const R3 = {
  // 茎中线：下半往左鼓，中段往右回，梢头再往左收一点，看得出 S；叶朝右，所以茎整体偏左
  stem: [[0, 0], [-30, -100], [-44, -210], [-20, -330], [22, -440], [36, -540], [18, -628]],
  stemHw: [11, 7], // 半宽：根部、梢头（第二版 6.8 → 4.8 的约 1.6 倍）
  // 五片叶：源叶 a b c a b，目标角度（相对水平，朝右上）10、35、15、40、20。
  // 同形的两片差开：a 是 1.25 倍 10° 对 1.0 倍 40°，b 是 1.22 倍 35° 对 0.9 倍 20°。c 本身最短，放大到 1.25 倍放在中间。
  leaves: [
    { src: 0, y: -92, s: 1.25, ang: 10 },
    { src: 1, y: -240, s: 1.22, ang: 35 },
    { src: 2, y: -380, s: 1.25, ang: 15 },
    { src: 0, y: -505, s: 1.0, ang: 40 },
    { src: 1, y: -615, s: 0.9, ang: 20 },
  ],
  // 固着器：一块底座椭圆（茎根往外鼓）加三瓣脚趾，两边的朝外下斜，宽约 76，约茎根宽 22 的 3.5 倍
  holdfast: [[0, -15, 16, 19, 0], [-22, -1, 16, 9.5, -45], [0, 5, 9.5, 13, 0], [22, -1, 16, 9.5, 45]],
  pad: 3,
  smallMargin: 1.05, // 小尺寸版茎最细处比 2px 多留 5%
}
for (const L of LEAF) {
  const tipPts = ptsOf(bladePaths[L.blade].d), tip = tipPts.reduce((b, p) => (p[0] > b[0] ? p : b))
  const b = bboxPts(ptsOf(bladePaths[L.bulb].d)), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
  L.ang = (Math.atan2(c[1] - tip[1], tip[0] - c[0]) * 180) / Math.PI
}
function round3Svg(r, { small, smallHw }) {
  const [vx, vy, vw, vh] = r.view
  const note = small
    ? `<!-- 原语插画 · 巨藻 · 小尺寸版（2026-11-14 第三版，提案）：和 illustration/kelp.svg 同一株、同一画框，去掉叶面上的浅雾薄荷中脉，整株深薄荷 #2C6E56 实心，给 64px 高及以下用（道理同小尺寸头像去胡须点）。茎比正常版粗：按「64px 高时最细处不小于 2px」倒推，半宽 ${smallHw.map(f1).join(' → ')}（正常版 ${R3.stemHw.join(' → ')}）。要不要拿它换掉 BRAND.md §3.4 里 64px 那处用法，等 Owner 定。由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round3/README.md。 -->`
    : `<!-- 原语插画 · 巨藻（2026-11-14 换成 BRAND.md §7 第 112 条的画法，第 114 条第五项；第三版）：一株。一根 S 弯的长茎（照 mascot/objects/kelp-blade.svg 茎的颜色和画法新画，比它粗），根部三瓣舒展的固着器；五片叶沿茎排开、都朝右顺水飘，角度一片平一片抬，从下往上变小。叶取自定稿 kelp-blade.svg（第七轮 B）里的单片叶（叶片、叶根气囊、浅雾薄荷中脉，三片源叶轮着用），只平移、转动、等比缩放，形没改。只用深薄荷 #2C6E56 和浅雾薄荷 #DDF1E8；平涂，无描边、无渐变、无阴影；透明底。画框照原图的宽高比 26.64 : 71.4，茎根贴下沿，剪影重心尽量居中（叶尖不出框），引用的地方不用改。原图另存在 illustration/kelp-old-2026-11-14.svg（停用，第 114 条）；第一、二版留档在 image-review-2026-11-14/kelp-illustration/round1/、round2/。64px 及以下另有 illustration/kelp-small.svg（去中脉、茎加粗，提案）。提案 · 单一来源，由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round3/README.md。 -->`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}">
${note}
<title>${small ? '巨藻（小尺寸）' : '巨藻'}</title>
  ${r.defs}
${r.body}
</svg>
`
}

// ---------- 第四版 ----------
// 叶的几何在浏览器里按路径真实取样（getPointAtLength），用来求叶的中线、各处半宽，好重画中脉、量叶边。
async function samplePath(d, step = 1) {
  await page.setContent('<body></body>')
  return page.evaluate(({ d, step }) => {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d); svg.appendChild(p); document.body.appendChild(svg)
    const L = p.getTotalLength(), out = []
    for (let l = 0; l < L; l += step) { const q = p.getPointAtLength(l); out.push([q.x, q.y]) }
    return out
  }, { d, step })
}
// 一片源叶：气囊中心 c、叶尖 tip、叶长 Lf（c 到叶尖），沿 c→叶尖的轴分 40 段，每段取叶边上下两侧的中点当中线、一半当半宽；
// 再量定稿中脉从哪儿起（u0，按叶长的比例）、半宽多少。
const GEOM = {}
async function leafGeom(i) {
  if (GEOM[i]) return GEOM[i]
  const L = LEAF[i]
  const outline = await samplePath(bladePaths[L.blade].d, 0.5)
  const bb = bboxPts(await samplePath(bladePaths[L.bulb].d, 1)), c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]
  const tip = outline.reduce((b, p) => (len(sub(p, c)) > len(sub(b, c)) ? p : b))
  const Lf = len(sub(tip, c)), ax = norm(sub(tip, c)), nv = [-ax[1], ax[0]]
  const uv = (p) => { const d = sub(p, c); return [(d[0] * ax[0] + d[1] * ax[1]) / Lf, d[0] * nv[0] + d[1] * nv[1]] }
  const N = 40, bins = Array.from({ length: N }, () => [])
  for (const p of outline) { const [u, v] = uv(p), k = Math.floor(u * N); if (k >= 0 && k < N) bins[k].push(v) }
  const mid = []
  bins.forEach((vs, k) => { if (vs.length < 2) return; const lo = Math.min(...vs), hi = Math.max(...vs); mid.push({ u: (k + 0.5) / N, v: (lo + hi) / 2, hw: (hi - lo) / 2 }) })
  const rib = await samplePath(bladePaths[L.rib].d, 0.5), ru = rib.map(uv)
  const u0 = Math.min(...ru.map((q) => q[0])), u1 = Math.max(...ru.map((q) => q[0])), um = (u0 + u1) / 2
  const vs = ru.filter((q) => Math.abs(q[0] - um) < 0.03).map((q) => q[1])
  const ribHw = (Math.max(...vs) - Math.min(...vs)) / 2
  const at = (u) => { // 中线上 u 处的点和叶半宽（线性插值）
    let a = mid[0], b = mid[mid.length - 1]
    for (let k = 0; k < mid.length - 1; k++) if (mid[k].u <= u && mid[k + 1].u >= u) { a = mid[k]; b = mid[k + 1]; break }
    const t = b.u === a.u ? 0 : (u - a.u) / (b.u - a.u), v = a.v + (b.v - a.v) * t
    return { p: add(add(c, mul(ax, u * Lf)), mul(nv, v)), hw: a.hw + (b.hw - a.hw) * t }
  }
  return (GEOM[i] = { c, tip, Lf, outline, u0, u1, ribHw, at, uv, ax, nv, rib })
}
const minDist = (pts, outline) => Math.min(...pts.map((p) => Math.min(...outline.map((q) => len(sub(p, q))))))
// 重画的中脉（叶的局部坐标）：从定稿中脉的起点往叶尖走 ribLen 个叶长，最宽 ribHwFrac × 定稿中脉半宽，两头尖。
// edge = 叶边深色最窄要留多少（局部单位）；放不下就整体收窄，峰值半宽小于 ribMinHw 就不画。
function ribPath(G, K, edge) {
  const u0 = G.u0, u1 = Math.min(u0 + K.ribLen, 0.85), n = 40
  const mids = [], lim = []
  for (let k = 0; k <= n; k++) { const q = G.at(u0 + ((u1 - u0) * k) / n); mids.push(q.p); lim.push(q.hw - edge) }
  let peak = K.ribHwFrac * G.ribHw
  for (let tries = 0; tries < 30; tries++) {
    const hw = (t) => peak * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)), 0.7)
    const ok = lim.every((l, k) => hw(k / n) <= l)
    const poly = band(mids, (t) => Math.max(hw(t), 0.05))
    if (ok && minDist(poly, G.outline) >= edge) return { d: smoothClosed(poly), peak }
    peak *= 0.9
    if (peak < K.ribMinHw) return null
  }
  return null
}

const R4 = {
  // 茎中线：下半往左鼓（最左 -56，弯幅约 51），上半往右鼓（最右 +56，弯幅约 55），梢头收尖
  stem: [[0, 0], [-30, -80], [-56, -170], [-50, -250], [-14, -330], [28, -405], [48, -480], [36, -560], [4, -625], [-14, -668]],
  stemHw: { root: 11, body: 7, taperFrom: 0.88, tip: 1.2 }, // 根部 11 收到 body 7，最后一段收成尖
  // 叶：只用 a、b 两种叶形。下面两片靠近，中间一段空茎（S 弯的拐点露在这里），上面三片再密一点，第 3 片略往下垂；梢头一片嫩叶
  leaves: [
    { src: 0, y: -76, s: 1.2, ang: 8 },
    { src: 1, y: -136, s: 1.12, ang: 30 },
    { src: 0, y: -425, s: 0.95, ang: -10 },
    { src: 1, y: -498, s: 0.9, ang: 22 },
    { src: 0, y: -565, s: 0.75, ang: 42 },
    { src: 1, y: -660, s: 0.5, ang: 52, bud: true },
  ],
  // 固着器：底座椭圆 + 三根根指（中线点、根部半宽、末端半宽），末端圆头
  holdfastBase: [0, -10, 25, 15, 0],
  fingers: [
    { pts: [[0, -22], [0, -4], [1, 14]], hw: [12, 9] },
    { pts: [[-6, -20], [-28, -10], [-46, 3], [-52, 14]], hw: [11, 8.5] },
    { pts: [[6, -20], [28, -10], [46, 3], [52, 14]], hw: [11, 8.5] },
  ],
  ribLen: 0.5, ribHwFrac: 0.5, ribMinHw: 1.2,
  minEdgePx: 2, edgeAtPx: 122, // 122px 高时叶边深色最窄 ≥ 2px
  pad: 3, smallMargin: 1.05,
}

function stemHwFn(H) {
  return (t) => (t < H.taperFrom ? H.root + (H.body - H.root) * (t / H.taperFrom) : H.body + (H.tip - H.body) * ((t - H.taperFrom) / (1 - H.taperFrom)))
}
async function buildRound4(K, { small, hwFn, frameH }) {
  const mid = resample(openSpline(K.stem), 1)
  const stemD = smoothClosed(band(mid, hwFn))
  const atY = (y) => mid.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b))
  const used = [...new Set(K.leaves.map((l) => l.src))].sort()
  const defs = `<defs>\n${used.map((i) => {
    const L = LEAF[i]
    return `    <g id="leaf-${'abc'[i]}">\n${[L.bulb, L.blade].map((j) => `      <path d="${bladePaths[j].d}" fill="${DEEP}" />`).join('\n')}\n    </g>`
  }).join('\n')}\n  </defs>`
  const report = []
  const leaves = []
  for (const l of K.leaves) {
    const G = await leafGeom(l.src), a = LEAF[l.src].anchor, p = atY(l.y)
    const rot = LEAF[l.src].ang - l.ang
    const tf = `translate(${f2(p[0])} ${f2(p[1])}) rotate(${f2(rot)}) scale(${f2(l.s)}) translate(${f2(-a[0])} ${f2(-a[1])})`
    let rib = null
    if (!small && !l.bud && frameH) {
      const edge = K.minEdgePx / ((K.edgeAtPx / frameH) * l.s)
      rib = ribPath(G, K, edge)
      report.push({ src: 'abc'[l.src], s: l.s, ang: l.ang, rib: rib ? f2(rib.peak / G.ribHw) : '不画', edge: rib ? f2(minDist(band([G.at(G.u0).p], () => 0), G.outline)) : '-' })
    }
    leaves.push(rib
      ? `  <g transform="${tf}">\n    <use href="#leaf-${'abc'[l.src]}" />\n    <path d="${rib.d}" fill="${PALE}" />\n  </g>`
      : `  <use href="#leaf-${'abc'[l.src]}" transform="${tf}" />`)
  }
  const fingers = K.fingers.map((f) => smoothClosed(band(resample(openSpline(f.pts), 1), (t) => f.hw[0] + (f.hw[1] - f.hw[0]) * t)))
  const body = [
    `  <path d="${lobePath(K.holdfastBase)}" fill="${DEEP}" />`,
    ...fingers.map((d) => `  <path d="${d}" fill="${DEEP}" />`),
    `  <path d="${stemD}" fill="${DEEP}" />`,
    ...leaves,
  ].join('\n')
  const inner = `${defs}<g id="all">${body}</g>`
  const box = await bboxOf(inner)
  const [x, y, w, h] = box
  const cx = await centroidX(inner, box)
  let vh = h + 2 * K.pad, vw = vh * ASPECT
  if (w + 2 * K.pad > vw) { vw = w + 2 * K.pad; vh = vw / ASPECT }
  const vx = Math.min(Math.max(cx - vw / 2, x + w + K.pad - vw), x - K.pad), vy = y + h + K.pad - vh
  return { defs, body, box, cx, view: [vx, vy, vw, vh], report }
}
async function makeRound4(K) {
  const hw = stemHwFn(K.stemHw)
  const r0 = await buildRound4(K, { small: false, hwFn: hw, frameH: null }) // 先定画框（中脉不影响外框）
  const r = await buildRound4(K, { small: false, hwFn: hw, frameH: r0.view[3] })
  logView(r)
  console.log('中脉（峰值半宽 / 定稿中脉半宽）：', r.report.map((q) => `${q.src}×${q.s} ${q.ang}° → ${q.rib}`).join('；'))
  // 叶边深色实际最窄多少 px（122px 高）：中脉多边形到叶外沿的最短距离 × 缩放 × 每单位像素
  const minHw = (r.view[3] / 64) * K.smallMargin
  const hwS = (t) => Math.max(hw(t), minHw)
  const rs = await buildRound4(K, { small: true, hwFn: hwS, frameH: null })
  const [x, , w] = rs.box, [vx, , vw] = r.view
  if (x < vx || x + w > vx + vw) console.warn('小尺寸版出了画框')
  rs.view = r.view
  console.log(`小尺寸版茎半宽：根部 ${f2(hwS(0))}、茎身 ${f2(hwS(0.5))}、梢头 ${f2(hwS(1))}；64px 高时最细 ${f2((2 * minHw * 64) / r.view[3])}px`)
  return { svg: round4Svg(r, { small: false }), svgSmall: round4Svg(rs, { small: true, minHw }), r }
}
// 量：每片叶在 122px 高时叶边深色最窄多少 px（渲染前按几何算：中脉外形到叶外形的最短距离）
async function edgeReport(K, view) {
  const out = []
  for (const l of K.leaves) {
    if (l.bud) { out.push(`${'abc'[l.src]}×${l.s}（嫩叶，不画中脉）`); continue }
    const G = await leafGeom(l.src), edge = K.minEdgePx / ((K.edgeAtPx / view[3]) * l.s), rib = ribPath(G, K, edge)
    if (!rib) { out.push(`${'abc'[l.src]}×${l.s} 不画中脉`); continue }
    const poly = []
    const pts = rib.d.match(/-?\d+\.?\d*/g).map(Number); for (let i = 0; i + 1 < pts.length; i += 2) poly.push([pts[i], pts[i + 1]])
    out.push(`${'abc'[l.src]}×${l.s} ${l.ang}°：中脉峰值半宽 ${f2(rib.peak)}（定稿 ${f2(G.ribHw)}），叶边最窄约 ${f2(minDist(poly, G.outline) * l.s * (K.edgeAtPx / view[3]))}px`)
  }
  return out
}
function round4Svg(r, { small, minHw }) {
  const [vx, vy, vw, vh] = r.view
  const note = small
    ? `<!-- 原语插画 · 巨藻 · 小尺寸版（2026-11-14 第四版，提案）：和 illustration/kelp.svg 同一株、同一画框，不画中脉，整株深薄荷 #2C6E56 实心，给 64px 高及以下用（道理同小尺寸头像去胡须点）。茎比正常版粗：按「64px 高时最细处不小于 2px」倒推，茎半宽不小于 ${f1(minHw)}，梢头不收尖。要不要拿它换掉 BRAND.md §3.4 里 64px 那处用法，等 Owner 定。由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round4/README.md。 -->`
    : `<!-- 原语插画 · 巨藻（2026-11-14 换成 BRAND.md §7 第 112 条的画法，第 114 条第五项；第四版）：一株。一根 S 弯的长茎（下半往左鼓、上半往右鼓，梢头收尖，照 mascot/objects/kelp-blade.svg 茎的颜色和画法新画），根部三根张开的根指；五片叶加梢头一片嫩叶，都朝右顺水飘（一片略往下垂），下面两片、上面三片，中间一段空茎。叶片和叶根气囊取自定稿 kelp-blade.svg（第七轮 B）的 a、b 两片，只平移、转动、等比缩放；浅雾薄荷中脉按 2026-11-14 审稿意见重画，偏离定稿：沿叶中线从叶根往叶尖走约叶长的五成，宽约定稿中脉的一半、两头尖，122px 高时叶边深色最窄不小于 2px（放不下就不画：上面两片小叶和梢头嫩叶没有中脉）。只用深薄荷 #2C6E56 和浅雾薄荷 #DDF1E8；平涂，无描边、无渐变、无阴影；透明底。画框照原图的宽高比 26.64 : 71.4，根指贴下沿，引用的地方不用改。原图另存在 illustration/kelp-old-2026-11-14.svg（停用，第 114 条）；第一到三版留档在 image-review-2026-11-14/kelp-illustration/round1/ 到 round3/。64px 及以下另有 illustration/kelp-small.svg（不画中脉、茎加粗，提案）。提案 · 单一来源，由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round4/README.md。 -->`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}">
${note}
<title>${small ? '巨藻（小尺寸）' : '巨藻'}</title>
  ${r.defs}
${r.body}
</svg>
`
}

// ---------- 第五版 ----------
// 茎、叶的位置角度和间距、嫩叶照第四版；固着器改回三瓣圆脚；五片叶放回第三版的大小；每片叶都画中脉（嫩叶除外）。
// 中脉取定稿 kelp-blade 中脉自己的形：沿它的中线量出各处的偏移和半宽，沿叶长方向压到 ribLen 个叶长，宽度按比例 k 缩细。
// k 逐片算：从 ribKMax 往下收，直到「122px 高时叶边深色最窄 ≥ 2px」；收到 ribKMin 还放不下，就把这片叶放大到放得下（不跳过）。
function ribProfile(G) {
  if (G.prof) return G.prof
  const ru = G.rib.map(G.uv), N = 30, bins = Array.from({ length: N }, () => [])
  for (const [u, v] of ru) { const k = Math.min(N - 1, Math.max(0, Math.floor(((u - G.u0) / (G.u1 - G.u0)) * N))); bins[k].push(v) }
  const pts = []
  bins.forEach((vs, k) => { if (vs.length >= 2) { const lo = Math.min(...vs), hi = Math.max(...vs); pts.push({ t: (k + 0.5) / N, v: (lo + hi) / 2, hw: (hi - lo) / 2 }) } })
  const at = (t) => {
    if (t <= pts[0].t) return { v: pts[0].v, hw: pts[0].hw * Math.max(t / pts[0].t, 0) }
    const L = pts[pts.length - 1]
    if (t >= L.t) return { v: L.v, hw: L.hw * Math.max((1 - t) / (1 - L.t), 0) }
    for (let k = 0; k < pts.length - 1; k++) if (pts[k].t <= t && pts[k + 1].t >= t) { const a = pts[k], b = pts[k + 1], s = (t - a.t) / (b.t - a.t); return { v: a.v + (b.v - a.v) * s, hw: a.hw + (b.hw - a.hw) * s } }
  }
  const leafV = (u) => { const p = G.at(u).p, d = sub(p, G.c); return d[0] * G.nv[0] + d[1] * G.nv[1] }
  return (G.prof = { at, leafV, maxHw: Math.max(...pts.map((q) => q.hw)), len: G.u1 - G.u0 })
}
function rib5(G, K, k) {
  const P = ribProfile(G), n = 60, mid = [], hws = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, uo = G.u0 + t * (G.u1 - G.u0), un = G.u0 + t * K.ribLen, q = P.at(t)
    const v = P.leafV(un) + (q.v - P.leafV(uo))
    mid.push(add(add(G.c, mul(G.ax, un * G.Lf)), mul(G.nv, v))); hws.push(k * q.hw)
  }
  const poly = band(mid, (t) => Math.max(hws[Math.round(t * n)], 0.05))
  return { poly, d: smoothClosed(poly) }
}
function fitRib(G, K, edge) {
  for (let k = K.ribKMax; k >= K.ribKMin - 1e-9; k -= 0.01) {
    const r = rib5(G, K, k)
    if (minDist(r.poly, G.outline) >= edge) return { ...r, k, edgeLocal: minDist(r.poly, G.outline) }
  }
  return null
}

const R5 = {
  stem: R4.stem,
  stemHw: R4.stemHw,
  // 位置、角度照第四版；大小放回第三版（1.2–1.3），下面两片再大一点
  leaves: [
    { src: 0, y: -76, s: 1.36, ang: 8 },
    { src: 1, y: -136, s: 1.32, ang: 30 },
    { src: 1, y: -425, s: 1.24, ang: -10 }, // 第四版这片是 a；a 放到 1.2 以上叶尖会把画框撑宽、整株反而变小，换成短一点的 b
    { src: 1, y: -498, s: 1.2, ang: 22 },
    { src: 0, y: -565, s: 1.2, ang: 42 },
    { src: 1, y: -660, s: 0.5, ang: 52, bud: true },
  ],
  // 固着器：矮底座 + 三个贴地的圆瓣（中间略大）。宽约茎根宽（22）的 4 倍，高不过宽的一半
  holdfast: [[0, -8, 30, 14, 0], [-29, 6, 15, 12, 0], [29, 6, 15, 12, 0], [0, 4, 18, 14, 0]],
  ribLen: 0.5, ribKMax: 0.55, ribKMin: 0.4,
  minEdgePx: 2, edgeAtPx: 122,
  pad: 4, smallMargin: 1.05, // pad 4：小尺寸版茎加粗后左边多出约 0.5，留够
}

async function buildRound5(K, { small, hwFn, frameH }) {
  const mid = resample(openSpline(K.stem), 1)
  const stemD = smoothClosed(band(mid, hwFn))
  const atY = (y) => mid.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b))
  const used = [...new Set(K.leaves.map((l) => l.src))].sort()
  const defs = `<defs>\n${used.map((i) => {
    const L = LEAF[i]
    return `    <g id="leaf-${'abc'[i]}">\n${[L.bulb, L.blade].map((j) => `      <path d="${bladePaths[j].d}" fill="${DEEP}" />`).join('\n')}\n    </g>`
  }).join('\n')}\n  </defs>`
  const report = [], leaves = []
  for (const l0 of K.leaves) {
    const l = { ...l0 }
    const G = await leafGeom(l.src), a = LEAF[l.src].anchor, p = atY(l.y)
    let rib = null
    if (!small && !l.bud && frameH) {
      for (let tries = 0; tries < 40 && !rib; tries++) {
        rib = fitRib(G, K, K.minEdgePx / ((K.edgeAtPx / frameH) * l.s))
        if (!rib) l.s = Math.round(l.s * 1.02 * 1000) / 1000
      }
      if (!rib) throw new Error('中脉放不下')
      const P = ribProfile(G)
      report.push({ src: 'abc'[l.src], s0: l0.s, s: l.s, ang: l.ang, k: rib.k, peak: rib.k * P.maxHw, ribHw: P.maxHw, len: P.len, edgePx: rib.edgeLocal * l.s * (K.edgeAtPx / frameH) })
    }
    const rot = LEAF[l.src].ang - l.ang
    const tf = `translate(${f2(p[0])} ${f2(p[1])}) rotate(${f2(rot)}) scale(${f2(l.s)}) translate(${f2(-a[0])} ${f2(-a[1])})`
    leaves.push(rib
      ? `  <g transform="${tf}">\n    <use href="#leaf-${'abc'[l.src]}" />\n    <path d="${rib.d}" fill="${PALE}" />\n  </g>`
      : `  <use href="#leaf-${'abc'[l.src]}" transform="${tf}" />`)
  }
  const body = [
    ...K.holdfast.map((h) => `  <path d="${lobePath(h)}" fill="${DEEP}" />`),
    `  <path d="${stemD}" fill="${DEEP}" />`,
    ...leaves,
  ].join('\n')
  const inner = `${defs}<g id="all">${body}</g>`
  const box = await bboxOf(inner)
  const [x, y, w, h] = box
  const cx = await centroidX(inner, box)
  let vh = h + 2 * K.pad, vw = vh * ASPECT
  if (w + 2 * K.pad > vw) { vw = w + 2 * K.pad; vh = vw / ASPECT }
  const vx = Math.min(Math.max(cx - vw / 2, x + w + K.pad - vw), x - K.pad), vy = y + h + K.pad - vh
  return { defs, body, box, cx, view: [vx, vy, vw, vh], report }
}
async function makeRound5(K) {
  const hw = stemHwFn(K.stemHw)
  // 画框和中脉互相牵制（放大的叶会撑大画框），迭代到画框不变
  let frameH = (await buildRound5(K, { small: false, hwFn: hw, frameH: null })).view[3], r
  for (let i = 0; i < 5; i++) {
    r = await buildRound5(K, { small: false, hwFn: hw, frameH })
    if (Math.abs(r.view[3] - frameH) < 0.01) break
    frameH = r.view[3]
  }
  logView(r)
  for (const q of r.report) console.log(`  ${q.src}×${q.s0}${q.s !== q.s0 ? `→${q.s}（为放下中脉放大）` : ''} ${q.ang}°：中脉 = 定稿中脉形 × 长 ${f2(K.ribLen / q.len)}、宽 ${f2(q.k)}（最宽半宽 ${f2(q.peak)}，定稿 ${f2(q.ribHw)}），122px 高时叶边最窄约 ${f2(q.edgePx)}px`)
  const big = K.leaves.map((l, i) => ({ ...l, s: r.report.find((q, j) => j === i && !l.bud)?.s ?? l.s }))
  const minHw = (r.view[3] / 64) * K.smallMargin
  const hwS = (t) => Math.max(hw(t), minHw)
  const rs = await buildRound5({ ...K, leaves: big }, { small: true, hwFn: hwS, frameH: null })
  const [x, , w] = rs.box, [vx, , vw] = r.view
  if (x < vx || x + w > vx + vw) console.warn('小尺寸版出了画框', rs.box, r.view)
  rs.view = r.view
  console.log(`小尺寸版茎半宽 ${f2(minHw)}（全长）；64px 高时最细 ${f2((2 * minHw * 64) / r.view[3])}px`)
  return { svg: round5Svg(r, { small: false }), svgSmall: round5Svg(rs, { small: true, minHw }), r }
}
function round5Svg(r, { small, minHw }) {
  const [vx, vy, vw, vh] = r.view
  const note = small
    ? `<!-- 原语插画 · 巨藻 · 小尺寸版（2026-11-14 第五版，提案）：和 illustration/kelp.svg 同一株、同一画框，不画中脉，整株深薄荷 #2C6E56 实心，给 64px 高及以下用。茎比正常版粗：按「64px 高时最细处不小于 2px」倒推，茎半宽全长 ${f1(minHw)}，梢头不收尖。要不要拿它换掉 BRAND.md §3.4 里 64px 那处用法，等 Owner 定。由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round5/README.md。 -->`
    : `<!-- 原语插画 · 巨藻（2026-11-14 换成 BRAND.md §7 第 112 条的画法，第 114 条第五项；第五版）：一株。一根 S 弯的长茎（下半往左鼓、上半往右鼓，梢头收尖，照 mascot/objects/kelp-blade.svg 茎的颜色和画法新画），根部一个矮底座加三个贴地的圆瓣；五片叶加梢头一片嫩叶，都朝右顺水飘（一片略往下垂），下面两片、上面三片，中间一段空茎。叶片和叶根气囊取自定稿 kelp-blade.svg（第七轮 B）的 a、b 两片，只平移、转动、等比缩放；浅雾薄荷中脉每片都画（嫩叶除外），取定稿中脉的形，沿叶长压到约叶长的五成、按比例缩细，122px 高时叶边深色最窄不小于 2px。只用深薄荷 #2C6E56 和浅雾薄荷 #DDF1E8；平涂，无描边、无渐变、无阴影；透明底。画框照原图的宽高比 26.64 : 71.4，根贴下沿，引用的地方不用改。原图另存在 illustration/kelp-old-2026-11-14.svg（停用，第 114 条）；第一到四版留档在 image-review-2026-11-14/kelp-illustration/round1/ 到 round4/。64px 及以下另有 illustration/kelp-small.svg（不画中脉、茎加粗，提案）。提案 · 单一来源，由 scripts/brand/kelp-illustration.mjs 生成，说明见 image-review-2026-11-14/kelp-illustration/round5/README.md。 -->`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}">
${note}
<title>${small ? '巨藻（小尺寸）' : '巨藻'}</title>
  ${r.defs}
${r.body}
</svg>
`
}
const R4_ARCHIVE = '<!-- 第四版留档（不过，2026-11-14 审）：茎的 S 弯、空茎、下垂的第 3 片和梢头嫩叶过了；不过的三处：根像船锚（两根往外下弯的弧加中间一根）；分量又轻了（叶比第三版小一圈，上面三片尤其小）；中脉一会儿有一会儿没有。kelp.svg / kelp-small.svg 已换成第五版，见 image-review-2026-11-14/kelp-illustration/round5/README.md。下面一条是当时写在文件里的注释。由 node scripts/brand/kelp-illustration.mjs round4 复现。 -->'
const R4_HEADER = 'illustration/kelp.svg 第四版对照（提案 · 2026-11-14）。虚线框 = 图片自己的画框（宽高比照原图）。左起：旧图 | 第三版（不过）| 第四版；64px 那组第三版、第四版都用各自的 small 版。'
async function writeRound4() {
  const { svg, svgSmall } = await makeRound4(R4)
  mkdirSync(path.dirname(R4_SVG), { recursive: true })
  const a = insertNote(svg, R4_ARCHIVE), b = insertNote(svgSmall, R4_ARCHIVE)
  writeFileSync(R4_SVG, a); writeFileSync(R4_SMALL, b)
  console.log('第四版：', rel(R4_SVG), rel(R4_SMALL))
  return { svg: a, svgSmall: b }
}
const readRound4 = async () => (existsSync(R4_SVG) && existsSync(R4_SMALL) ? { svg: readFileSync(R4_SVG, 'utf8'), svgSmall: readFileSync(R4_SMALL, 'utf8') } : await writeRound4())

// ---------- 原图另存 ----------
function saveOld() {
  if (existsSync(OLD)) return
  const src = readFileSync(KELP, 'utf8')
  if (src.includes('kelp-blade')) throw new Error('kelp.svg 已经是新图了，找不到原图；从 git 取回原图再跑')
  const note = '<!-- 停用，第 114 条（BRAND.md §7，Owner 2026-11-14）：illustration/kelp.svg 2026-11-14 换成第 112 条的巨藻画法，这是换下来的原图，文件留着不删，新页面不再用。下面原来的注释和路径一字没改。 -->'
  const i = src.indexOf('>') + 1
  writeFileSync(OLD, src.slice(0, i) + '\n' + note + src.slice(i))
  console.log('原图另存：', path.relative(ROOT, OLD))
}

// ---------- 对照图 ----------
const dataUri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const CSS = `body{margin:0;font:13px/1.5 "Noto Sans CJK SC","PingFang SC",system-ui,sans-serif;color:#191D18;background:#fff;display:inline-block}
  section{padding:16px 24px 20px} h2{font-size:14px;margin:0 0 12px;font-weight:600}
  .row{display:flex;gap:40px;align-items:flex-end} figure{margin:0} .pair{display:flex;align-items:flex-end;gap:16px}
  .img{display:flex;align-items:flex-end;justify-content:center;outline:1px dashed rgba(25,29,24,.18)} .img img{display:block}
  .sep{width:1px;align-self:stretch;background:rgba(25,29,24,.25)} figcaption{margin-top:8px;color:#60665C;font-size:12px}
  header{padding:16px 24px 0;font-size:12px;color:#60665C}`
// cols: [{ name, svg, svgSmall? }]
async function compare(cols, file, headerText) {
  const sizes = [
    { h: 64, label: '64px 高 · BRAND.md §3.4 的用法', small: true },
    { h: 122, label: '122px 高 · 手册 09 页的用法' },
    { h: 480, label: '480px 高 · 大尺寸' },
  ]
  const cell = (svg, h) => `<div class="img" style="height:${h}px"><img src="${dataUri(svg)}" style="height:${h}px"></div>`
  const group = (bg, name) => `<section style="background:${bg}"><h2>${name}</h2><div class="row">${sizes
    .map((z) => `<figure><div class="pair">${cols.map((c) => cell(z.small && c.svgSmall ? c.svgSmall : c.svg, z.h)).join('<div class="sep"></div>')}</div><figcaption>${cols.map((c) => (z.small && c.svgSmall ? `${c.name}（small 版）` : c.name)).join(' | ')} · ${z.label}</figcaption></figure>`)
    .join('')}</div></section>`
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body><header>${headerText}</header>${group('#FFFFFF', '白底 #FFFFFF')}${group('#F1F5F7', '页面底色 #F1F5F7')}</body>`)
  await page.waitForTimeout(200)
  await (await page.$('body')).screenshot({ path: file })
}

const rel = (f) => path.relative(ROOT, f)
const oldSvg = () => (existsSync(OLD) ? readFileSync(OLD, 'utf8') : readFileSync(KELP, 'utf8'))

async function writeRound1() {
  mkdirSync(path.dirname(R1_SVG), { recursive: true })
  const svg = await buildRound1()
  writeFileSync(R1_SVG, svg)
  console.log('第一版：', rel(R1_SVG))
  return svg
}

const insertNote = (svg, note) => { const i = svg.indexOf('>') + 1; return svg.slice(0, i) + '\n' + note + svg.slice(i) }
const R2_ARCHIVE = '<!-- 第二版留档（不过，2026-11-14 审）：不再盖章、叶间露得出茎，但整株像一根细树枝挂了五面小旗，太轻，压不住，旧图那种饱满、舒展没出来。kelp.svg / kelp-small.svg 已换成第三版，见 image-review-2026-11-14/kelp-illustration/round3/README.md。下面一条是当时写在文件里的注释。由 node scripts/brand/kelp-illustration.mjs round2 复现。 -->'
const logView = (r) => console.log('外框', r.box.map(f2).join(' '), '画框', r.view.map(f2).join(' '), '重心离画框中线', f2((r.cx - (r.view[0] + r.view[2] / 2)) / r.view[2] * 100) + '% 画框宽')

async function makeRound2() {
  const r = await buildRound2(R2, { small: false })
  const rs = await buildRound2(R2, { small: true })
  rs.view = r.view // 小尺寸版和正常版同一画框
  return { svg: round2Svg(r, { small: false }), svgSmall: round2Svg(rs, { small: true }) }
}
async function writeRound2() {
  const { svg, svgSmall } = await makeRound2()
  mkdirSync(path.dirname(R2_SVG), { recursive: true })
  const a = insertNote(svg, R2_ARCHIVE), b = insertNote(svgSmall, R2_ARCHIVE)
  writeFileSync(R2_SVG, a); writeFileSync(R2_SMALL, b)
  console.log('第二版：', rel(R2_SVG), rel(R2_SMALL))
  return { svg: a, svgSmall: b }
}
const readRound1 = async () => (existsSync(R1_SVG) ? readFileSync(R1_SVG, 'utf8') : await writeRound1())
const readRound2 = async () => (existsSync(R2_SVG) && existsSync(R2_SMALL) ? { svg: readFileSync(R2_SVG, 'utf8'), svgSmall: readFileSync(R2_SMALL, 'utf8') } : await writeRound2())

async function makeRound3(K0) {
  const K = { ...K0, leaves: K0.leaves.map((l) => ({ ...l, rot: l.rot ?? LEAF[l.src].ang - l.ang })) }
  console.log('源叶角度', LEAF.map((L) => f1(L.ang)).join(' '))
  const r = await buildRound2(K, { small: false })
  // 小尺寸版的茎：64px 高时最细处（梢头）不小于 2px，即半宽 ≥ 画框高 / 64；按这个把根部、梢头一起等比加粗（正常版够粗就不动）
  const minHw = (r.view[3] / 64) * K.smallMargin
  const k = Math.max(1, minHw / K.stemHw[1])
  const smallHw = K.stemHw.map((h) => h * k)
  const rs = await buildRound2(K, { small: true, stemHw: smallHw })
  const [x, , w] = rs.box, [vx, , vw] = r.view
  if (x < vx || x + w > vx + vw) console.warn('小尺寸版出了画框，调 stem 或 pad')
  rs.view = r.view
  logView(r)
  console.log('小尺寸版茎半宽', smallHw.map(f2).join(' → '), `（正常版 ${K.stemHw.join(' → ')}；64px 高时最细 ${f2((2 * smallHw[1] * 64) / r.view[3])}px）`)
  return { svg: round3Svg(r, { small: false, smallHw }), svgSmall: round3Svg(rs, { small: true, smallHw }) }
}

const R3_ARCHIVE = '<!-- 第三版留档（不过，2026-11-14 审）：分量回来了，但 S 弯看不出（整根是一道往左鼓的「(」，梢头一个圆疙瘩）；固着器太小；叶像带白条的豆荚（中脉太粗，122px 下是描边稿）；五片叶等距同向，像梳子，c 那片像小鱼。kelp.svg / kelp-small.svg 已换成第四版，见 image-review-2026-11-14/kelp-illustration/round4/README.md。下面一条是当时写在文件里的注释。由 node scripts/brand/kelp-illustration.mjs round3 复现。 -->'
const R3_HEADER = 'illustration/kelp.svg 第三版对照（提案 · 2026-11-14）。虚线框 = 图片自己的画框（宽高比照原图）。左起：旧图 | 第二版（不过）| 第三版；64px 那组第二版、第三版都用各自的 small 版。'
async function writeRound3() {
  const { svg, svgSmall } = await makeRound3(R3)
  mkdirSync(path.dirname(R3_SVG), { recursive: true })
  const a = insertNote(svg, R3_ARCHIVE), b = insertNote(svgSmall, R3_ARCHIVE)
  writeFileSync(R3_SVG, a); writeFileSync(R3_SMALL, b)
  console.log('第三版：', rel(R3_SVG), rel(R3_SMALL))
  return { svg: a, svgSmall: b }
}
const readRound3 = async () => (existsSync(R3_SVG) && existsSync(R3_SMALL) ? { svg: readFileSync(R3_SVG, 'utf8'), svgSmall: readFileSync(R3_SMALL, 'utf8') } : await writeRound3())

if (MODE === 'round1') {
  saveOld()
  const r1 = await writeRound1()
  await compare([{ name: '旧', svg: oldSvg() }, { name: '新', svg: r1 }], path.join(OUT, 'compare.png'),
    'illustration/kelp.svg 重画对照（提案 · 2026-11-14）。虚线框 = 图片自己的画框（宽高比照原图），旧图左、新图右。')
  console.log('第一版对照图：', rel(path.join(OUT, 'compare.png')))
} else if (MODE === 'round2') {
  saveOld()
  const r1 = await readRound1()
  const r2 = await writeRound2()
  await compare([{ name: '旧', svg: oldSvg() }, { name: '第一版', svg: r1 }, { name: '第二版', ...r2 }], path.join(OUT, 'round2/compare.png'),
    'illustration/kelp.svg 第二版对照（提案 · 2026-11-14）。虚线框 = 图片自己的画框（宽高比照原图）。左起：旧图 | 第一版（不过）| 第二版；64px 那组第二版用 kelp-small.svg。')
  console.log('第二版对照图：', rel(path.join(OUT, 'round2/compare.png')))
} else if (MODE === 'round3') {
  saveOld()
  const r2 = await readRound2()
  const r3 = await writeRound3()
  await compare([{ name: '旧', svg: oldSvg() }, { name: '第二版', ...r2 }, { name: '第三版', ...r3 }], path.join(OUT, 'round3/compare.png'), R3_HEADER)
  console.log('第三版对照图：', rel(path.join(OUT, 'round3/compare.png')))
} else if (MODE === 'round4') {
  saveOld()
  const r3 = await readRound3()
  const r4 = await writeRound4()
  for (const line of await edgeReport(R4, (await makeRound4(R4)).r.view)) console.log('  ' + line)
  mkdirSync(path.join(OUT, 'round4'), { recursive: true })
  await compare([{ name: '旧', svg: oldSvg() }, { name: '第三版', ...r3 }, { name: '第四版', ...r4 }], path.join(OUT, 'round4/compare.png'), R4_HEADER)
  console.log('第四版对照图：', rel(path.join(OUT, 'round4/compare.png')))
} else {
  const K = { ...R5, ...(process.env.KELP5 ? JSON.parse(process.env.KELP5) : {}) }
  const r5 = await makeRound5(K)
  const header = 'illustration/kelp.svg 第五版对照（提案 · 2026-11-14）。虚线框 = 图片自己的画框（宽高比照原图）。左起：旧图 | 第四版（不过）| 第五版；64px 那组第四版、第五版都用各自的 small 版。'
  if (MODE === 'preview') {
    if (process.env.KELP5_DUMP) { writeFileSync(process.env.KELP5_DUMP, r5.svg); writeFileSync(process.env.KELP5_DUMP.replace(/\.svg$/, '-small.svg'), r5.svgSmall) }
    const out = process.argv[3] || path.join(OUT, 'round5/preview.png')
    const r4 = existsSync(R4_SVG) ? { svg: readFileSync(R4_SVG, 'utf8'), svgSmall: readFileSync(R4_SMALL, 'utf8') } : await makeRound4(R4)
    await compare([{ name: '旧', svg: oldSvg() }, { name: '第四版', ...r4 }, { name: '第五版', ...r5 }], out, header)
    console.log('预览：', out)
  } else {
    saveOld()
    await readRound1()
    await readRound2()
    await readRound3()
    const r4 = await readRound4()
    writeFileSync(KELP, r5.svg)
    writeFileSync(KELP_SMALL, r5.svgSmall)
    console.log('写入', rel(KELP), rel(KELP_SMALL))
    mkdirSync(path.join(OUT, 'round5'), { recursive: true })
    await compare([{ name: '旧', svg: oldSvg() }, { name: '第四版', ...r4 }, { name: '第五版', ...r5 }], path.join(OUT, 'round5/compare.png'), header)
    console.log('对照图：', rel(path.join(OUT, 'round5/compare.png')))
  }
}
await browser.close()
