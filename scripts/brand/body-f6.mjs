#!/usr/bin/env node
// 獭獭全身像 · F6 坐石四分之三侧，重画成矢量（对比稿，等负责人复核）。提案 · 单一来源。
//
// 做什么：读头像母版 otter-head.svg，取头部的路径（头形、脸斑、眼、鼻、胡须点；不取围兜），
// 原样放进一个整体变换（只平移、缩放、不超过 4° 的转动），头形用裁切截到下巴线；
// 再拼上本脚本手写的身体、喉咙到肚子的浅色块、前爪、后脚、尾巴、卵石和石头座。母版文件不改。
//
// 画法：所有手写轮廓都由「节点 + 切线方向 + 两侧把手长度」生成三次贝塞尔，
// 同一个节点两侧的把手共线，所以轮廓上没有折角（G1 连续）；需要的话个别节点可以给不同的进出方向。
// 身体在头下面一层，脖子轮廓从母版头形在下巴线上的两个点出发，切线方向和母版那一段相同，接缝不出折角。
//
// 用法：node scripts/brand/body-f6.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/body-f6/ 下的
//   svg/otter-sit-*.svg、sheet.png、silhouette.png、vs-sketch.png、measure.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/body-f6')
const MASTER_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const SKETCH_PATH = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/sketches-batch2/F6-sit-three-quarter.jpg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// 只用这五个颜色
const C = { mint: '#72BFA4', light: '#DDF1E8', white: '#F2FAF6', ink: '#191D18', slate: '#29424D' }

// ---------- 从母版取头部 ----------
const MASTER = readFileSync(MASTER_PATH, 'utf8')
function pick(re, what) {
  const m = MASTER.match(re)
  if (!m) throw new Error(`母版里找不到${what}，母版可能改过，先核对再跑`)
  return m[0]
}
const HEAD_SHAPE = pick(/<path id="_L9S-0__ziti071"[^>]*\/>/, '头形路径 _L9S-0__ziti071')
const MUZZLE = pick(/<path id="_L9S-0__ziti073"[^>]*\/>/, '脸斑路径 _L9S-0__ziti073')
const EYES = pick(/<g id="_L9S-0__ziti074">[\s\S]*?<\/g>/, '眼睛 _L9S-0__ziti074')
const NOSE = pick(/<path id="_L9S-0__ziti077"[^>]*\/>/, '鼻子 _L9S-0__ziti077')
const DOTS = pick(/<g id="_L9S-0__ziti078">[\s\S]*?<\/g>/, '胡须点 _L9S-0__ziti078')
// 母版头形在下巴线（y=679）上的两个点，以及往下那一段的起始切线（从路径里抄的数，跑前核对）
if (!HEAD_SHAPE.includes('-74.5 195 24.5 95 61 219 74 314h-801.5c13-95 49.5-219 75-314')) {
  throw new Error('母版头形下巴线附近的路径和脚本记的数不一样，先核对')
}
const CHIN_Y = 679
const JR = [839, 679] // 右（看的人的右）：往下的切线 (24.5, 95)
const JL = [186.5, 679] // 左：往下的切线 (-25.5, 95)
const TAN_R = Math.atan2(95, 24.5) * 180 / Math.PI
const TAN_L = Math.atan2(95, -25.5) * 180 / Math.PI
const HEAD_TOP = 105.5 // 母版头顶
const HEAD_CHIN = 700 // 下巴底：母版围兜上沿两端约 699，取 700 当头的下沿（量数用）
const HEAD_W = 913.5 - 112.5 // 两颊最宽处（不连耳朵）
const HEAD_W_EARS = 975.5 - 49 // 连耳朵

// ---------- 几何小工具 ----------
const rad = (d) => d * Math.PI / 180
const f1 = (n) => (Math.round(n * 10) / 10).toString()
const P = (x, y) => `${f1(x)} ${f1(y)}`
function rot([x, y], deg, [cx, cy]) {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg))
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}

// 节点：[x, y, 方向(度，y 向下), 进把手长, 出把手长, 可选：进方向(度)]
// 同一节点进出共线，所以轮廓顺滑；第 6 个数给了才允许进出方向不同（只用在会被盖住的地方）。
function smooth(nodes, closed = true, tf = (q) => q) {
  const h = (n, sign) => {
    const a = sign < 0 && n[5] !== undefined ? n[5] : n[2]
    const len = sign < 0 ? n[3] : n[4]
    return [n[0] + sign * len * Math.cos(rad(a)), n[1] + sign * len * Math.sin(rad(a))]
  }
  let d = `M${P(...tf([nodes[0][0], nodes[0][1]]))}`
  const count = closed ? nodes.length : nodes.length - 1
  for (let k = 0; k < count; k++) {
    const a = nodes[k], b = nodes[(k + 1) % nodes.length]
    const c1 = h(a, 1), c2 = h(b, -1)
    d += `C${P(...tf(c1))} ${P(...tf(c2))} ${P(...tf([b[0], b[1]]))}`
  }
  return closed ? `${d}Z` : d
}

// ---------- 身体各部分 ----------
// 坐标系就是母版头像的坐标（头不缩放），整只的大小靠 viewBox。
function build(v) {
  const tilt = v.tilt // 头的转动，度，绕下巴中点
  const pivot = [512, CHIN_Y]
  const jr = rot(JR, tilt, pivot), jl = rot(JL, tilt, pivot)
  const tr = TAN_R + tilt, tl = TAN_L + tilt
  const S = v.seat // 石头面（坐着的那一线）的 y
  const BASE = 2620 // A 稿的石头面
  const k = (S - 700) / (BASE - 700) // 躯干竖向比例：A 稿为 1
  const Y = (y) => 700 + (y - 700) * k // 按 A 稿写的 y 换算到当前坐高（下巴以上不动）
  const N = (x, y, a, i, o, ai) => [x, Y(y), a, i * k, o * k, ai]

  // 身体轮廓：从右下巴点往下，沿看的人的右边（胸、肚子，身体朝向这边）、底、左边（背）回到左下巴点，
  // 再在头里面闭合（这一段被头盖住）。
  const B = v.body
  const body = smooth([
    [jr[0], jr[1], tr, 0, B.neckOut],
    N(...B.r1), N(...B.r2), N(...B.r3), N(...B.r4), N(...B.r5),
    N(...B.b1), N(...B.l5), N(...B.l4), N(...B.l3), N(...B.l2),
    [jl[0], jl[1], tl + 180, B.neckOut, 0],
  ], false) + `L${P(...rot([400, 520], tilt, pivot))}L${P(...rot([624, 520], tilt, pivot))}Z`

  // 喉咙到肚子的浅色块：上沿照母版围兜上沿那条弧（中间低约 18），往下转向身体朝的一边（右）
  const belly = smooth(v.belly.map((n, idx) => (n[1] <= 760 ? n : N(...n))))

  const nearArm = smooth(v.nearArm.map((n) => N(...n)))
  // 近侧大腿：坐着时腿收在身前，圆的一块压在肚皮左下角，读得出「坐」
  const thigh = v.thigh ? smooth(v.thigh.map((n) => N(...n))) : ''
  const farArm = smooth(v.farArm.map((n) => N(...n)))
  const [pcx, pcy0, prx, pry] = v.pebble
  const pcy = Y(pcy0)
  const pebble = smooth([
    [pcx + prx, pcy + pry * 0.08, 95, pry * 0.6, pry * 0.6],
    [pcx + prx * 0.05, pcy + pry, 180, prx * 0.62, prx * 0.62],
    [pcx - prx, pcy + pry * 0.12, 272, pry * 0.6, pry * 0.6],
    [pcx - prx * 0.05, pcy - pry, 2, prx * 0.6, prx * 0.6],
  ])

  // 后脚：大而扁的蹼，桨形，平踩在石头上，朝身体转去的方向（右前）
  const foot = ([bx, by, len, wh, wt, ang, depth = 22, sq = 0.6]) => {
    // 以脚跟中点 (bx,by) 为起点，朝 ang 方向伸出 len；脚跟宽 wh，前端宽 wt（扇开的桨）。
    // 前沿四个很浅的圆趾（凹进 depth），不画趾垫；这样读得出是脚，不像鳍。
    by = Y(by)
    const u = [Math.cos(rad(ang)), Math.sin(rad(ang))], n = [-u[1], u[0]]
    const at = (s, t) => [bx + u[0] * s + n[0] * t, by + u[1] * s + n[1] * t]
    const tip = (f) => len + 28 * (1 - (2 * f) ** 2) // 前沿微微外凸
    const nodes = [
      [...at(0, -wh / 2), ang - 6, wh * 0.3, len * 0.3],
      [...at(len * 0.72, -wt * 0.47), ang - 10, len * 0.2, wt * 0.1],
      [...at(len * 0.97, -wt * 0.43), ang + 60, wt * 0.08, wt * 0.06],
    ]
    const F = [-0.3, -0.1, 0.1, 0.3]
    F.forEach((f, idx) => {
      nodes.push([...at(tip(f), f * wt), ang + 90 + f * 30, wt * 0.07, wt * 0.07])
      if (idx < 3) nodes.push([...at(tip(f + 0.1) - depth, (f + 0.1) * wt), ang + 90 + (f + 0.1) * 30, wt * 0.03, wt * 0.03])
    })
    nodes.push(
      [...at(len * 0.97, wt * 0.43), ang + 120, wt * 0.06, wt * 0.08],
      [...at(len * 0.72, wt * 0.47), ang + 190, wt * 0.1, len * 0.2],
      [...at(0, wh / 2), ang + 186, len * 0.3, wh * 0.3],
      [...at(-wh * 0.35, 0), ang + 270, wh * 0.28, wh * 0.28],
    )
    // 脚是平放在石面上的：先按俯视画，再竖向压扁 sq（从斜上方看过去）
    return smooth(nodes, true, ([x, y]) => [x, by + (y - by) * sq])
  }
  const nearFoot = foot(v.feet.near)
  const farFoot = foot(v.feet.far)

  // 尾巴：粗、扁、渐尖，从左后腰出来，沿石头左侧垂下
  const tail = smooth(v.tail.map((n) => [n[0], n[1] + (S - BASE), n[2], n[3], n[4]]))

  // 石头座：低矮、略不对称的光滑卵石，石面在 S
  const rock = smooth(v.rock.map((n) => [n[0], n[1] + (S - BASE), n[2], n[3], n[4]]))

  const groups = {
    rock: `<path id="rock" d="${rock}" fill="${C.slate}"/>`,
    tail: `<path d="${tail}" fill="${C.mint}"/>`,
    farArmBack: '',
    body: `<path d="${body}" fill="${C.mint}"/>`,
    head: `<g transform="rotate(${tilt} ${pivot[0]} ${pivot[1]})"><clipPath id="chin-${v.id}"><rect x="-200" y="-200" width="1400" height="${CHIN_Y + 200}"/></clipPath><g clip-path="url(#chin-${v.id})">${HEAD_SHAPE}</g></g>`,
    belly: `<path d="${belly}" fill="${C.light}"/>`,
    thigh: thigh ? `<path d="${thigh}" fill="${C.mint}"/>` : '',
    feet: `<path d="${farFoot}" fill="${C.mint}"/><path d="${nearFoot}" fill="${C.mint}"/>`,
    nearArm: `<path d="${nearArm}" fill="${C.mint}"/>`,
    pebble: `<path d="${pebble}" fill="${C.slate}"/>`,
    farArm: `<path d="${farArm}" fill="${C.mint}"/>`,
    face: `<g transform="rotate(${tilt} ${pivot[0]} ${pivot[1]})">${MUZZLE}${EYES}${NOSE}${DOTS}</g>`,
  }
  const order = ['rock', 'tail', 'body', 'head', 'belly', 'thigh', 'feet', 'pebble', 'farArm', 'nearArm', 'face']
  const inner = order.map((g) => groups[g]).join('\n  ')
  const vb = v.viewBox
  return { inner, vb, seat: S }
}

// A 稿的全部节点。坐标就是头像母版的坐标（头顶 y=105.5，下巴 y≈700，两颊 x=112.5–913.5）。
// 节点格式见 smooth()：[x, y, 方向度数, 进把手, 出把手]。
const A = {
  id: 'A', file: 'otter-sit-A',
  label: 'A 主稿：头高约占坐高 0.24；远侧爪搭在贴着肚子右边的卵石上，近侧爪垂在肚子前',
  tilt: -2, seat: 2620,
  body: {
    neckOut: 150,
    r1: [1015, 1030, 70, 150, 200], // 右肩：从下巴斜着滑出去
    r2: [1140, 1520, 87, 200, 260], // 胸、肚子（朝向这边）
    r3: [1145, 2060, 93, 250, 200], // 远侧腰胯
    r4: [1070, 2470, 126, 150, 80],
    r5: [900, 2605, 172, 70, 180], // 右下：落到石面
    b1: [300, 2625, 181, 260, 300], // 坐着的底，大半被脚挡住
    l5: [-110, 2570, 222, 150, 100],
    l4: [-268, 2260, 266, 150, 230], // 近侧腰胯，最宽
    l3: [-240, 1720, 274, 240, 280], // 背
    l2: [-50, 1110, 299, 220, 210], // 左肩
  },
  belly: [
    [512, 718, 0, 150, 130],
    [748, 700, -6, 105, 30],
    [792, 762, 74, 40, 160],
    [905, 1150, 80, 160, 260],
    [1000, 1760, 88, 280, 220],
    [985, 2020, 100, 190, 130],
    [870, 2290, 144, 120, 120],
    [670, 2360, 184, 110, 110],
    [470, 2250, 234, 100, 120],
    [375, 1960, 265, 150, 220],
    [345, 1450, 268, 260, 260],
    [292, 980, 256, 150, 130],
    [262, 770, 268, 50, 26],
    [300, 701, 6, 30, 115],
  ],
  nearArm: [
    [200, 1170, 20, 40, 60],
    [360, 1255, 45, 90, 160],
    [640, 1515, 42, 150, 75],
    [765, 1660, 98, 70, 65],
    [665, 1778, 186, 75, 70],
    [550, 1712, 222, 50, 90],
    [300, 1500, 228, 140, 120],
    [160, 1270, 290, 80, 40],
  ],
  farArm: [
    [1010, 1280, 40, 40, 60],
    [1112, 1360, 78, 50, 120],
    [1190, 1565, 96, 90, 90],
    [1140, 1745, 128, 70, 60],
    [1050, 1808, 180, 60, 60],
    [962, 1745, 252, 50, 90],
    [960, 1500, 272, 110, 100],
    [945, 1340, 255, 60, 50],
  ],
  thigh: [
    [330, 1960, 10, 120, 160],
    [590, 2150, 66, 120, 140],
    [655, 2420, 108, 100, 120],
    [400, 2560, 190, 140, 120],
    [120, 2380, 260, 120, 140],
    [170, 2060, 310, 110, 110],
  ],
  pebble: [1045, 1838, 140, 100], // 卵石：中心 x、y，半宽，半高
  feet: {
    near: [430, 2600, 440, 210, 400, 40, 14, 0.5], // 脚跟 x、y，长，前端宽，朝向（度）
    far: [930, 2560, 400, 190, 320, 12, 14, 0.5],
  },
  tail: [
    [20, 2420, 170, 80, 240],
    [-420, 2500, 162, 200, 170],
    [-700, 2740, 108, 130, 110],
    [-660, 2990, 30, 70, 70],
    [-480, 2880, 310, 100, 140],
    [-240, 2700, 342, 150, 150],
    [80, 2628, 0, 140, 60],
    [160, 2560, 270, 40, 40],
  ],
  rock: [
    [380, 2575, 0, 650, 560],
    [1360, 2690, 38, 260, 130],
    [1520, 2860, 95, 90, 100],
    [1330, 3010, 172, 160, 500],
    [300, 3045, 181, 520, 520],
    [-580, 3000, 190, 330, 120],
    [-730, 2880, 266, 80, 90],
    [-560, 2730, 330, 130, 400],
  ],
  viewBox: [-800, 40, 2400, 3060],
}
// B 只改坐高：躯干（下巴以下）整体竖向缩短，头高÷坐高从约 0.24 到约 0.25，接近草图 F6
const B = { ...A, id: 'B', file: 'otter-sit-B', seat: 2470, label: 'B 只改坐高：躯干竖向缩短约 8%，头高约占坐高 0.25（接近草图 F6）', viewBox: [-800, -110, 2400, 3060] }
// C 只改卵石在哪只爪下：卵石移到近侧爪下，贴在肚子前偏左；远侧爪空着，垂在身侧
const C3 = { ...A, id: 'C', file: 'otter-sit-C', pebble: [672, 1832, 140, 96], label: 'C 只改卵石的位置：卵石搭在近侧爪下、贴着肚子；远侧爪空着垂在身侧' }
const VARIANTS = [A, B, C3]

const NOTE = (v) => `<!-- 对比稿，不是母版（scripts/brand/body-f6.mjs 生成），提案 · 单一来源。${v.label}。头部五样（头形、脸斑、眼、鼻、胡须点）是 otter-head.svg 的原路径，只整体转动 ${v.tilt}°，头形用裁切截到下巴线 y=${CHIN_Y}；其余手写。只用雾薄荷、浅雾薄荷、雾白、墨、石板墨五色，没有描边、渐变和阴影。 -->`
function svgOf(v, mode = 'color') {
  const { inner, vb } = build(v)
  let body = inner
  if (mode === 'otter') body = body.split('\n  ').filter((g) => !g.startsWith('<path id="rock"')).join('\n  ').replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${C.ink}"`)
  if (mode === 'silhouette') body = body.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${C.ink}"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">\n${NOTE(v)}\n<title>海獭 · 坐在石头上（四分之三侧）</title>\n  ${body}\n</svg>\n`
}

// ---------- 输出 ----------
mkdirSync(path.join(OUT, 'svg'), { recursive: true })
for (const v of VARIANTS) writeFileSync(path.join(OUT, 'svg', `${v.file}.svg`), svgOf(v))

const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const HEIGHTS = [560, 160, 64]
// 头像母版同比例对照：让母版头和全身像里的头同样大
const masterAt = (h, v) => {
  const scale = h / v.viewBox[3]
  const mh = 955.3 * scale
  return `<img src="${uri(MASTER)}" height="${f1(mh)}" title="头像母版">`
}
function row(bg) {
  const figs = VARIANTS.map((v) => {
    const svg = svgOf(v)
    return `<figure style="background:${bg}"><div class="r"><img src="${uri(svg)}" height="560"><div class="c"><img src="${uri(svg)}" height="160"><img src="${uri(svg)}" height="64"></div></div><figcaption><b>${v.id}</b>　${v.label}</figcaption></figure>`
  }).join('')
  const m = `<figure style="background:${bg}"><div class="m">${masterAt(560, VARIANTS[0])}<small>头像母版<br>（头同样大）</small></div></figure>`
  return `<div class="row">${figs}${m}</div>`
}
const css = 'body{margin:0;padding:24px;background:#fff;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#5A6C75}figure{margin:0 0 16px;padding:18px;border:1px solid #e3e8ea;border-radius:8px}.r{display:flex;align-items:flex-end;gap:28px}.m{display:flex;flex-direction:column;align-items:center;gap:4px;color:#5A6C75}figcaption{padding-top:8px;max-width:600px;font-size:14px}.row{display:flex;gap:16px;align-items:stretch}.row figure{display:flex;flex-direction:column;justify-content:flex-end}.c{display:flex;flex-direction:column;align-items:center;gap:24px}'
const sheet = `<style>${css}</style><h1>獭獭 · 坐在石头上（F6 重画）</h1><p>对比稿 · 等负责人复核。每版三个高度：560、160、64 像素；上排白底，下排浅雾底 #F1F5F7；右边是头像母版，按同样的头大小放。</p>${row('#FFFFFF')}${row('#F1F5F7')}`
const sil = `<style>${css}</style><h1>剪影</h1><p>全部填墨色，只看轮廓。每版左边连石头座，右边只有海獭（连卵石）；各带一张 64px。</p><div class="r">${VARIANTS.map((v) => `<figure><div class="r"><img src="${uri(svgOf(v, 'silhouette'))}" height="420"><img src="${uri(svgOf(v, 'otter'))}" height="420"><img src="${uri(svgOf(v, 'otter'))}" height="64"></div><figcaption><b>${v.id}</b></figcaption></figure>`).join('')}</div>`
const sketchUri = `data:image/jpeg;base64,${readFileSync(SKETCH_PATH).toString('base64')}`
const vs = `<style>${css}</style><h1>草图 F6 和矢量主稿</h1><div class="r"><figure><img src="${sketchUri}" height="640"><figcaption>草图 F6（图像生成，只比方向）</figcaption></figure><figure><img src="${uri(svgOf(VARIANTS[0]))}" height="640"><figcaption>主稿 A</figcaption></figure></div>`

// 量数：把只含头和身体（不含石头、卵石、尾巴、后脚）的剪影画到画布上，逐行量宽
function measureSvg(v) {
  const { vb } = build(v)
  const g = build(v)
  const only = g.inner.split('\n  ').filter((s) => !s.includes(C.slate)).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">${only.replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#000"')}</svg>`, vb, seat: g.seat }
}

const browser = await chromium.launch({ channel: 'chromium' })
const measures = {}
try {
  const page = await browser.newPage({ viewport: { width: 2300, height: 900 }, deviceScaleFactor: 1 })
  await page.setContent(sheet)
  await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true })
  await page.setContent(sil)
  await page.screenshot({ path: path.join(OUT, 'silhouette.png'), fullPage: true })
  await page.setContent(vs)
  await page.screenshot({ path: path.join(OUT, 'vs-sketch.png'), fullPage: true })

  for (const v of VARIANTS) {
    const { svg, vb, seat } = measureSvg(v)
    const rows = await page.evaluate(async ({ svg, w, h }) => {
      const img = new Image()
      img.src = `data:image/svg+xml;base64,${btoa(svg)}`
      await img.decode()
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h)
      const d = x.getImageData(0, 0, w, h).data
      const out = []
      for (let y = 0; y < h; y++) {
        let a = -1, b = -1
        for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 127) { if (a < 0) a = i; b = i }
        out.push(a < 0 ? null : [a, b])
      }
      return out
    }, { svg, w: vb[2], h: vb[3] })
    const at = (y) => rows[Math.round(y - vb[1])]
    const width = (y) => { const r = at(y); return r ? r[1] - r[0] + 1 : 0 }
    // 脖子最窄处：下巴线到下巴下一个头高之间最窄的一行（含远近两臂以外的身体）
    let neckMin = Infinity, neckY = 0
    for (let y = HEAD_CHIN - 30; y < HEAD_CHIN + 300; y++) { const w = width(y); if (w && w < neckMin) { neckMin = w; neckY = y } }
    // 肩宽：下巴下半个头高（约 300）处，剪影的宽
    const shoulderY = HEAD_CHIN + 300
    const shoulder = width(shoulderY)
    const headH = HEAD_CHIN - HEAD_TOP
    const sitH = seat - HEAD_TOP
    measures[v.id] = {
      头高: headH, 坐高_头顶到石头面: sitH, '头高÷坐高': +(headH / sitH).toFixed(3),
      头宽_两颊: HEAD_W, 头宽_连耳朵: HEAD_W_EARS,
      肩宽_下巴下300处: shoulder, '头宽÷肩宽': +(HEAD_W / shoulder).toFixed(3), '头宽连耳÷肩宽': +(HEAD_W_EARS / shoulder).toFixed(3),
      脖子最窄: neckMin, 脖子最窄处y: neckY, '脖子最窄÷头宽': +(neckMin / HEAD_W).toFixed(3),
    }
  }
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT, 'measure.json'), `${JSON.stringify(measures, null, 2)}\n`)
console.log(JSON.stringify(measures, null, 1))
console.log(`出了 ${VARIANTS.length} 版：${path.relative(ROOT, OUT)}`)
