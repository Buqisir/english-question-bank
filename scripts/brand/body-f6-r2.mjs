#!/usr/bin/env node
// 獭獭全身像 · F6 坐石四分之三侧 · 第二轮（对比稿，等负责人复核）。提案 · 单一来源。
//
// 第一轮（scripts/brand/body-f6.mjs、image-review-2026-11-14/body-f6/）复核没过：头下面收出细脖子、
// 再鼓出梨形口袋，像猫鼬。第二轮按复核意见重画：
//   - 身体是一整块在头后面的形状，肩颈从两颊最宽处往外、往下走，没有比头窄的地方；头压在身体前面。
//   - 矮、厚、重：头高 ÷ 坐高约 0.27，肩宽 ≥ 头宽 1.25 倍，最宽在胸到腰之间，背是一条从后脑连到尾根的大弧。
//   - 浅色是一块围兜：从下巴下开始，下缘一条圆弧停在身体一半高处，偏向右（身体朝的一边）。
//   - 两只前爪都收在胸前围兜下缘附近：近侧爪把一块卵石按在胸口，远侧爪只露一个圆爪头。
//   - 后脚两片大桨，朝前、略朝外，搁在座石前沿，各带三道浅趾缝；尾巴从身后绕到左边平躺在石头上。
//   - 石头用石色 #6E828C 加石面 #8FA3AC 的平涂顶面（BRAND.md §1.5，第 106 条）；手里那块照生态物件「獭獭的石头」的 D 形。
//
// 头：otter-head.svg 的头形、脸斑、眼、鼻、胡须点原路径，整体转 tilt 度（只转，不缩放），
// 头形裁到下巴下 y=720（以下藏在身体和围兜里）；围兜上沿用母版围兜上沿那条弧，跟头一起转，
// 所以下巴那道雾薄荷窄带和母版一样。母版文件不改。
//
// 用法：node scripts/brand/body-f6-r2.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/body-f6-round2/ 下的
//   svg/otter-sit-r2-*.svg、sheet.png、silhouette.png、vs-sketch.png、measure.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REVIEW = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14')
const OUT = path.join(REVIEW, 'body-f6-round2')
const MASTER_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const SKETCH_PATH = path.join(REVIEW, 'sketches-batch2/F6-sit-three-quarter.jpg')
const ROUND1_A = path.join(REVIEW, 'body-f6/svg/otter-sit-A.svg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// 只用这七个颜色
const C = { mint: '#72BFA4', light: '#DDF1E8', white: '#F2FAF6', ink: '#191D18', stone: '#6E828C', stoneTop: '#8FA3AC' }

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
const BIB = pick(/<path id="_L9S-0__ziti072"[^>]*\/>/, '围兜 _L9S-0__ziti072')
if (!BIB.includes('m278.5 699.5c136.5 24.5 330.5 24.5 467-1')) throw new Error('母版围兜上沿和脚本记的数不一样，先核对')
// 母版的数：头顶 y=105.5；下巴（围兜上沿两端）y≈700；两颊最宽 x=112.5 / 913.5（y=484）；连耳朵 49–975.5
const HEAD_TOP = 105.5
const HEAD_CHIN = 700
const HEAD_W = 913.5 - 112.5
const HEAD_W_EARS = 975.5 - 49
const PIVOT = [512, 600] // 头转动的中心（两颊之间、鼻子下）
const CLIP_Y = 720 // 头形裁切线（头的局部坐标）

// ---------- 几何小工具 ----------
const rad = (d) => d * Math.PI / 180
const f1 = (n) => (Math.round(n * 10) / 10).toString()
const P = (x, y) => `${f1(x)} ${f1(y)}`
const rot = ([x, y], deg, [cx, cy] = PIVOT) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg))
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
// 节点：[x, y, 方向(度，y 向下), 进把手长, 出把手长]；同一节点进出把手共线，曲线没有折角
function smooth(nodes, closed = true, tf = (q) => q) {
  const h = (n, sign) => {
    const len = sign < 0 ? n[3] : n[4]
    return [n[0] + sign * len * Math.cos(rad(n[2])), n[1] + sign * len * Math.sin(rad(n[2]))]
  }
  let d = `M${P(...tf([nodes[0][0], nodes[0][1]]))}`
  const count = closed ? nodes.length : nodes.length - 1
  for (let k = 0; k < count; k++) {
    const a = nodes[k], b = nodes[(k + 1) % nodes.length]
    d += `C${P(...tf(h(a, 1)))} ${P(...tf(h(b, -1)))} ${P(...tf([b[0], b[1]]))}`
  }
  return closed ? `${d}Z` : d
}

// ---------- 一版 ----------
function build(v) {
  const t = v.tilt
  const S = v.seat
  const BASE = 2530 // 下面节点按这个石面写，A/B 的石面 seat 跟它不同时下巴以下竖向换算
  const k = (S - 700) / (BASE - 700) // 下巴以下竖向比例
  const Y = (y) => (y <= 700 ? y : 700 + (y - 700) * k)
  const CX = 490 // 横向收瘦的中线
  const X = (x) => CX + (x - CX) * (v.sx ?? 1)
  const N = (n) => [X(n[0]), Y(n[1]), n[2], n[3] * (n[1] > 700 ? k : 1), n[4] * (n[1] > 700 ? k : 1)]
  const sh = S - BASE // 石面以下的东西整体平移

  // 身体：一整块在头后面。两端从两颊最宽处往下一点（转过的头上）出发，方向顺着脸颊往下，
  // 头盖住上面那一段；闭合段藏在头里。
  const jl = rot([116, 560], t), jr = rot([910, 560], t)
  const B = v.body
  const body = smooth([
    [...jr, 84 + t, 0, B.jOut],
    ...B.right.map(N),
    ...B.left.map(N),
    [...jl, 290 + t, B.jOut, 0],
  ], false) + `L${P(...rot([512, 420], t))}Z`

  // 围兜：上沿是母版围兜上沿那条弧（跟头一起转），两侧往下、往外，下缘一条圆弧停在胸腹之间
  const bibTop = [[278.5, 699.5], [415, 724], [609, 724], [745.5, 698.5]].map((q) => rot(q, t))
  const bibRest = smooth([
    [...bibTop[3], -10 + t + 70, 0, 0], // 占位，下面拼路径时只取曲线段
    ...v.bib.map(N),
    [...bibTop[0], 0, 0, 0],
  ], false)
  // 把 smooth 给的开头 M 换成接在弧后面：围兜 = 弧（左→右）+ 右侧往下 + 下缘 + 左侧往上
  const bib = `M${P(...bibTop[0])}C${P(...bibTop[1])} ${P(...bibTop[2])} ${P(...bibTop[3])}${bibRest.replace(/^M[^C]+/, '')}Z`

  // 卵石（D 形，照生态物件「獭獭的石头」，左上一刀平切面）：按 [中心 x, y, 宽, 转角] 摆
  const [px0, py0, pw, pa] = v.pebble
  const px = X(px0), py = Y(py0)
  const sc = pw / 120
  const stoneT = (q) => { const r = rot([(q[0] - 127) * sc, (q[1] - 124) * sc], pa, [0, 0]); return [px + r[0], py + r[1]] }
  const pathT = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, b) => P(...stoneT([+a, +b])))
  const pebble = pathT('M118 76 C140 74 164 82 176 100 C190 120 186 148 166 160 C146 172 110 172 88 162 C72 154 66 140 68 126 L104 80 C108 77 112 76 118 76 Z')
  // 平切面照生态物件的形，但朝里收一圈（house-rules 二.2：次色面不碰外轮廓）
  const inset = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, b) => `${f1(100 + (+a - 100) * 0.74)} ${f1(110 + (+b - 110) * 0.74)}`)
  const pebbleTop = pathT(inset('M104 80 L68 126 C68 132 70 138 74 142 C92 136 112 116 120 96 C123 88 120 80 104 80 Z'))

  const nearArm = smooth(v.nearArm.map(N))
  const farPaw = smooth(v.farPaw.map(N))

  // 后脚：俯视画一片扇开的桨，前沿三道浅趾缝，再竖向压扁（平放在石面上，从斜上方看）
  const foot = ([bx, by0, len, wh, wt, ang, sq = 0.55, depth = 34]) => {
    const by = Y(by0)
    const u = [Math.cos(rad(ang)), Math.sin(rad(ang))], n = [-u[1], u[0]]
    const at = (s, q) => [bx + u[0] * s + n[0] * q, by + u[1] * s + n[1] * q]
    const edge = (f) => len + 8 * (1 - (2 * f) ** 2)
    const nodes = [
      [...at(0, -wh / 2), ang - 4, wh * 0.3, len * 0.3],
      [...at(len * 0.7, -wt * 0.48), ang - 8, len * 0.2, wt * 0.12],
      [...at(edge(-0.46) - 6, -wt * 0.46), ang + 60, wt * 0.06, wt * 0.06],
    ]
    for (const f of [-0.25, 0, 0.25]) {
      nodes.push([...at(edge(f - 0.045), (f - 0.045) * wt), ang + 90 + 14, wt * 0.08, wt * 0.025])
      nodes.push([...at(edge(f) - depth, f * wt), ang + 90, wt * 0.012, wt * 0.012])
      nodes.push([...at(edge(f + 0.045), (f + 0.045) * wt), ang + 90 - 14, wt * 0.025, wt * 0.08])
    }
    nodes.push(
      [...at(edge(0.46) - 6, wt * 0.46), ang + 120, wt * 0.06, wt * 0.06],
      [...at(len * 0.7, wt * 0.48), ang + 188, wt * 0.12, len * 0.2],
      [...at(0, wh / 2), ang + 184, len * 0.3, wh * 0.3],
      [...at(-wh * 0.3, 0), ang + 270, wh * 0.26, wh * 0.26],
    )
    return smooth(nodes, true, ([x, y]) => [x, by + (y - by) * sq])
  }
  const feet = v.feet.map(foot)

  const tail = smooth(v.tail.map((n) => [n[0], n[1] + sh, n[2], n[3], n[4]]))
  const rock = smooth(v.rock.map((n) => [n[0], n[1] + sh, n[2], n[3], n[4]]))
  const rockTop = smooth(v.rockTop.map((n) => [n[0], n[1] + sh, n[2], n[3], n[4]]))

  const R = `rotate(${t} ${PIVOT[0]} ${PIVOT[1]})`
  const parts = [
    ['rock', `<path d="${rock}" fill="${C.stone}"/><path d="${rockTop}" fill="${C.stoneTop}"/>`],
    ['tail', `<path d="${tail}" fill="${C.mint}"/>`],
    ['body', `<path d="${body}" fill="${C.mint}"/>`],
    ['head', `<g transform="${R}"><clipPath id="chin-${v.id}"><rect x="-200" y="-200" width="1400" height="${CLIP_Y + 200}"/></clipPath><g clip-path="url(#chin-${v.id})">${HEAD_SHAPE}</g></g>`],
    ['bib', `<path d="${bib}" fill="${C.light}"/>`],
    ['feet', feet.map((d) => `<path d="${d}" fill="${C.mint}"/>`).join('')],
    ['farPaw', `<path d="${farPaw}" fill="${C.mint}"/>`],
    ['pebble', `<path d="${pebble}" fill="${C.stone}"/><path d="${pebbleTop}" fill="${C.stoneTop}"/>`],
    ['nearArm', `<path d="${nearArm}" fill="${C.mint}"/>`],
    ['face', `<g transform="${R}">${MUZZLE}${EYES}${NOSE}${DOTS}</g>`],
  ]
  return { parts, seat: S }
}

// ---------- A 稿 ----------
// 坐标就是头像母版的坐标（头不缩放）。y 在下巴（700）以下的节点会按坐高换算。
const A = {
  id: 'A', file: 'otter-sit-r2-A',
  label: 'A：头高 ÷ 坐高约 0.26，肩宽约头宽 1.1 倍，腰胯不比肩宽，上下差不多粗',
  tilt: -5, seat: 2395, sx: 1,
  body: {
    jOut: 110,
    // 看的人的右边（身体朝向这边）：从脸颊顺着斜下去，肩到胸最宽，往下慢慢收
    right: [
      [950, 930, 80, 140, 170],
      [962, 1330, 90, 160, 200],
      [915, 1800, 100, 200, 170],
      [850, 2200, 108, 150, 120],
      [730, 2470, 145, 90, 110],
      [440, 2545, 180, 140, 160],
    ],
    // 左边是背：一条弧度很小的大弧，从后脑一直到尾根
    left: [
      [150, 2490, 210, 120, 110],
      [22, 2220, 262, 110, 170],
      [30, 1800, 272, 170, 200],
      [42, 1330, 278, 180, 160],
      [58, 980, 281, 150, 110],
    ],
  },
  // 围兜：右侧往下 → 下缘圆弧 → 左侧往上（上沿那条弧单独接）
  bib: [
    [800, 760, 50, 50, 110],
    [890, 980, 78, 100, 120],
    [908, 1250, 95, 100, 100],
    [825, 1475, 140, 100, 110],
    [610, 1565, 182, 120, 130],
    [395, 1485, 222, 100, 100],
    [298, 1230, 263, 110, 130],
    [285, 900, 280, 100, 40],
  ],
  // 近侧前臂：只画压在围兜上的一小段，爪搭在卵石左上
  nearArm: [
    [140, 1365, 340, 50, 80],
    [300, 1322, 8, 90, 100],
    [470, 1335, 18, 70, 60],
    [590, 1395, 75, 45, 45],
    [535, 1470, 175, 45, 55],
    [400, 1462, 183, 70, 100],
    [230, 1492, 170, 90, 60],
    [130, 1440, 262, 40, 40],
  ],
  // 远侧爪：只露一个圆爪头，托在卵石下面、半藏在卵石后面
  farPaw: [
    [745, 1480, 0, 44, 44],
    [825, 1560, 90, 44, 44],
    [745, 1640, 180, 44, 44],
    [665, 1560, 270, 44, 44],
  ],
  pebble: [650, 1425, 260, 95], // 卵石中心 x、y，宽，转角（转过来让平切面朝右上，不被近侧爪挡住）
  // 后脚：[脚跟 x, y, 长, 脚跟宽, 前端宽, 朝向, 压扁, 趾缝深]；两只合起来不比身体宽
  feet: [
    [290, 2470, 340, 180, 290, 106, 0.55, 12],
    [650, 2460, 340, 180, 290, 66, 0.55, 12],
  ],
  // 尾巴：从背后左下绕出来，顺着石面往左前方搭下去，尾尖圆钝；宽约头宽的四分之一（200）
  tail: [
    [43, 2182, 175, 50, 120],
    [-257, 2318, 145, 110, 90],
    [-434, 2536, 110, 70, 50],
    [-374, 2664, 20, 55, 55],
    [-246, 2604, 290, 50, 70],
    [-143, 2482, 325, 80, 100],
    [77, 2378, 350, 100, 50],
  ],
  // 座石：小、矮、略不对称；顶面浅一档
  rock: [
    [280, 2420, 0, 380, 330],
    [860, 2470, 35, 140, 70],
    [950, 2580, 100, 45, 60],
    [830, 2710, 172, 110, 300],
    [250, 2745, 181, 300, 300],
    [-300, 2710, 192, 180, 80],
    [-420, 2620, 265, 50, 55],
    [-320, 2480, 340, 90, 280],
  ],
  rockTop: [
    [280, 2458, 0, 350, 320],
    [840, 2503, 38, 110, 45],
    [872, 2555, 140, 28, 140],
    [250, 2640, 182, 360, 360],
    [-330, 2596, 222, 130, 28],
    [-300, 2518, 330, 38, 260],
  ],
  viewBox: [-500, 50, 1560, 2730],
}
// B 只改胖瘦：身体、围兜、前爪按 0.92 横向收（腰胯和肩都收约 8%），头、坐高、后脚、尾巴、石头都不变
const B = { ...A, id: 'B', file: 'otter-sit-r2-B', sx: 0.92, label: 'B 只改胖瘦：身体横向再收约 8%（肩和腰胯都收），别的同 A' }
const VARIANTS = [A, B]

const NOTE = (v) => `<!-- 对比稿 · 第二轮，不是母版（scripts/brand/body-f6-r2.mjs 生成），提案 · 单一来源。${v.label}。头部五样（头形、脸斑、眼、鼻、胡须点）是 otter-head.svg 的原路径，只整体转 ${v.tilt}°，头形裁到下巴下 y=${CLIP_Y}；围兜上沿用母版围兜上沿那条弧；其余手写。颜色：雾薄荷、浅雾薄荷、雾白、墨，石头用石色 #6E828C、石面 #8FA3AC。没有描边、渐变和阴影。 -->`
function svgOf(v, mode = 'color') {
  const { parts } = build(v)
  let list = parts
  if (mode === 'otter') list = parts.filter(([n]) => n !== 'rock')
  let body = list.map(([, s]) => s).join('\n  ')
  if (mode !== 'color') body = body.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${C.ink}"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.viewBox.join(' ')}">\n${NOTE(v)}\n<title>海獭 · 坐在石头上（四分之三侧）</title>\n  ${body}\n</svg>\n`
}

mkdirSync(path.join(OUT, 'svg'), { recursive: true })
for (const v of VARIANTS) writeFileSync(path.join(OUT, 'svg', `${v.file}.svg`), svgOf(v))

const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const masterAt = (h, v) => `<img src="${uri(MASTER)}" height="${f1(955.3 * h / v.viewBox[3])}">`
function row(bg) {
  const figs = VARIANTS.map((v) => {
    const svg = svgOf(v)
    return `<figure style="background:${bg}"><div class="r"><img src="${uri(svg)}" height="560"><div class="c"><img src="${uri(svg)}" height="160"><img src="${uri(svg)}" height="64"></div></div><figcaption><b>${v.id}</b>　${v.label}</figcaption></figure>`
  }).join('')
  const m = `<figure style="background:${bg}"><div class="m">${masterAt(560, VARIANTS[0])}<small>头像母版<br>（头同样大）</small></div></figure>`
  return `<div class="row">${figs}${m}</div>`
}
const css = 'body{margin:0;padding:24px;background:#fff;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#5A6C75}figure{margin:0 0 16px;padding:18px;border:1px solid #e3e8ea;border-radius:8px}.r{display:flex;align-items:flex-end;gap:28px}.m{display:flex;flex-direction:column;align-items:center;gap:4px;color:#5A6C75}figcaption{padding-top:8px;max-width:640px;font-size:14px}.row{display:flex;gap:16px;align-items:stretch}.row figure{display:flex;flex-direction:column;justify-content:flex-end}.c{display:flex;flex-direction:column;align-items:center;gap:24px}'
const sheet = `<style>${css}</style><h1>獭獭 · 坐在石头上（F6 重画 · 第二轮）</h1><p>对比稿 · 等负责人复核。每版三个高度：560、160、64 像素；上排白底，下排浅雾底 #F1F5F7；最右是头像母版，头同样大。</p>${row('#FFFFFF')}${row('#F1F5F7')}`
const sil = `<style>${css}</style><h1>剪影 · 第二轮</h1><p>全部填墨色，只看轮廓。每版左边连石头座，右边只有海獭（连卵石）；各带一张 64px。</p><div class="r">${VARIANTS.map((v) => `<figure><div class="r"><img src="${uri(svgOf(v, 'silhouette'))}" height="420"><img src="${uri(svgOf(v, 'otter'))}" height="420"><img src="${uri(svgOf(v, 'otter'))}" height="64"></div><figcaption><b>${v.id}</b></figcaption></figure>`).join('')}</div>`
const sketchUri = `data:image/jpeg;base64,${readFileSync(SKETCH_PATH).toString('base64')}`
const vs = `<style>${css}</style><h1>第一轮 A · 第二轮 A · 草图 F6</h1><div class="r"><figure><img src="${uri(readFileSync(ROUND1_A, 'utf8'))}" height="600"><figcaption>第一轮 A（复核没过）</figcaption></figure><figure><img src="${uri(svgOf(A))}" height="600"><figcaption>第二轮 A</figcaption></figure><figure><img src="${sketchUri}" height="600"><figcaption>草图 F6（图像生成，只比方向）</figcaption></figure></div>`

// 量数：去掉石头座、卵石、尾巴、后脚，只留头和身体（含前臂）画到画布上逐行量宽
function measureSvg(v) {
  const { parts, seat } = build(v)
  const keep = parts.filter(([n]) => ['body', 'head', 'bib', 'farPaw', 'nearArm', 'face'].includes(n)).map(([, s]) => s).join('')
  const vb = v.viewBox
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">${keep.replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#000"')}</svg>`, vb, seat }
}

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const measures = {}
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 })
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
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
      await img.decode()
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h)
      const d = x.getImageData(0, 0, w, h).data
      const out = []
      for (let y = 0; y < h; y++) {
        let a = -1, b = -1
        for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 127) { if (a < 0) a = i; b = i }
        out.push(a < 0 ? null : [a + 0, b + 0])
      }
      return out
    }, { svg, w: vb[2], h: vb[3] })
    const width = (y) => { const r = rows[Math.round(y - vb[1])]; return r ? r[1] - r[0] + 1 : 0 }
    const top = vb[1] + rows.findIndex((r) => r)
    // 「脖子」：两颊最宽处往下（560）到下巴下 400 之间最窄的一行
    let neckMin = Infinity, neckY = 0
    for (let y = 560; y < HEAD_CHIN + 400; y++) { const w = width(y); if (w && w < neckMin) { neckMin = w; neckY = y } }
    const shoulderY = HEAD_CHIN + 300
    let maxW = 0, maxY = 0
    for (let y = HEAD_CHIN; y < seat - 20; y++) { const w = width(y); if (w > maxW) { maxW = w; maxY = y } }
    // 腰胯：下巴到石面这段的下 40%（去掉最底下贴石头的 30）里最宽的一行
    let hipW = 0, hipY = 0
    for (let y = Math.round(HEAD_CHIN + 0.6 * (seat - HEAD_CHIN)); y < seat - 30; y++) { const w = width(y); if (w > hipW) { hipW = w; hipY = y } }
    const headH = HEAD_CHIN - HEAD_TOP
    measures[v.id] = {
      剪影最高点y: top,
      头高: headH, 坐高_母版头顶到石头面: seat - HEAD_TOP, '头高÷坐高': +(headH / (seat - HEAD_TOP)).toFixed(3), '坐高÷头高': +((seat - HEAD_TOP) / headH).toFixed(2),
      头宽_两颊: HEAD_W, 头宽_连耳朵: HEAD_W_EARS,
      肩宽_下巴下300处: width(shoulderY), '肩宽÷头宽': +(width(shoulderY) / HEAD_W).toFixed(3), '头宽÷肩宽': +(HEAD_W / width(shoulderY)).toFixed(3),
      脖子最窄_两颊到下巴下400: neckMin, 脖子最窄处y: neckY, '脖子最窄÷头宽': +(neckMin / HEAD_W).toFixed(3),
      腰胯最宽: hipW, 腰胯最宽处y: hipY, '腰胯最宽÷头宽': +(hipW / HEAD_W).toFixed(3), '腰胯最宽÷肩宽': +(hipW / width(shoulderY)).toFixed(3),
      身体最宽: maxW, '身体最宽÷头宽': +(maxW / HEAD_W).toFixed(3), 身体最宽处y: maxY, '身体最宽处在坐高的比例_从下巴往下': +((maxY - HEAD_CHIN) / (seat - HEAD_CHIN)).toFixed(2),
    }
  }
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT, 'measure.json'), `${JSON.stringify(measures, null, 2)}\n`)
console.log(JSON.stringify(measures, null, 1))
