#!/usr/bin/env node
// 仰躺姿势：照两张图像生成的草图（L1 仰躺抱石、K2 仰躺敲开蛤）描成平涂矢量。提案 · 单一来源。
// 有四轮，用 ROUND 选（默认 4）。下面先写第一轮的做法，第二到第四轮改了什么写在后面。
//
// 做法照全身像第三轮（scripts/brand/body-f6-trace.mjs）：playwright 在 canvas 上取草图像素 → 按最近色分类 →
// 形态学开运算 / 连通块 / 填洞 → 沿像素缝走闭合轮廓 → 环形高斯平滑 → RDP 抽稀 → 过点三次贝塞尔。
// 和 F6 不一样的地方：
//   - 身体（含头的外形和耳朵）照草图描；脸上的五官不描，用头像母版 otter-head.svg 的脸斑、两眼、鼻子、六颗胡须点，
//     按草图两眼的中心、眼距、眼线角度整体缩放平移小角度转动后放上去。
//   - 手里的东西不描：L1 的石头换成 objects/stone-round.svg；K2 胸口换成 objects/stone-flat.svg（比草图小），
//     石头上和手里的半片换成 objects/clam-open.svg 的下片和上片。物件按「240 = 獭獭头宽」换算，K2 的石头另乘 STONE_K2_BOOST。
//   - 草图尾巴像鱼尾：那一段剪掉，换成两只宽蹼后脚和一条粗尾（几何图元拼成蒙版，并进身体后一起描，所以外轮廓是一条线）。
//   - 水面：一块单独的浅雾薄荷扁形（id="water"），不描草图那块波浪边。
//   - 压在物件上的爪子：从身体蒙版里按区域另抠一份，画在物件上面。
// 颜色只用 雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8、雾白 #F2FAF6、墨 #191D18、石色 #6E828C，
// 加上石头物件自带的石面 #8FA3AC（house-rules 第二节第 4 条：石头是石色加一块石面）。平涂，无描边、无渐变。
//
// 第二轮（ROUND=2，审稿意见 2026-11-14）：
//   - 头形换成头像母版：母版头裁到下巴、栅格化后并进身体剪影，草图的头（下巴线以上）不要；母版头形和五官原样盖在上面（同 F6）。
//   - 后脚照草图描，不再剪掉换图元：只在两只后脚之间的分叉里挖一道圆头的缝（收干净），另在下面那只脚底下并一条短粗尾，尾尖从脚下露出来。
//   - K2 举着的半片：改成从正面看半片壳的里面。外形是定稿 clam.svg 的剪影（转个角度），外圈一道雾薄荷壳边，里面雾白
//     （同一剪影按中心缩小）。合页（壳顶）那头握在爪里，爪尖压在壳前面。是从定稿蛤派生的画法，不是新物件。
//   - K2 举壳那条胳膊照草图描（弯的，有肘），只在被草图壳边切掉的地方补一个爪尖；不再用胶囊换前臂。
//   - K2 下片和石头往右下挪，让开胳膊根，下片四周衬肚皮浅色。
//
// 第三轮（ROUND=3，审稿意见 2026-11-14）：
//   - 尾巴尖：不再挖第二轮那个小凹口（带出台阶和小钩子）；尾巴和下面那只脚之间挖一道两头渐尖的缝（TAIL=slit，默认），
//     末端开运算收成圆头。另一种并成一片鳍（TAIL=merge）也试过，没选，原因写在 pose-round3/README.md。
//   - K2 举着的半片：改成从外面看，clam.svg 原样外形和两道纹，后面垫一层错开的雾薄荷（远侧壳沿）和缩小的雾白，
//     露出壳口一侧一道雾白月牙。壳顶朝爪子、壳口朝外上方。仍是派生画法，不进 objects/。
//   - K2 举壳那只爪尖补的椭圆缩小；前臂顶上草图被壳边切出的台阶削圆。
//   - K2 下面那只爪尖往左收（区域里椭圆以外改成肚皮浅色），碗再往下 4。
//   - 终端多打印两只前爪的宽（pawTipD）和碗上沿到肚皮上沿那道浅色在 800 宽成品里的像素数（bowlGap800）。
//
// 第四轮（ROUND=4，Owner 2026-11-14：完成改用 L1 身体加胸口开蛤）：只出 L1。
//   - otter-float.svg：第三轮同参数重出（身体、肚皮、爪子路径逐字一样），尾巴缝里露出的水面那段补一块雾薄荷（slit-fill）。
//   - otter-done.svg：同一套层，石头换成 objects/clam-open.svg（只平移、缩放、转小角度），蛤在两只爪子后面；
//     蛤在爪子四周、身体在蛤四周各用 SVG 蒙版让出 DONE_GAP 的缝（露出后面的肚皮或背景，不是描边）。
//   - compare.png：K2 第三轮 | 完成第四轮 | L1 第三轮；small.png：完成和 L1 的 96、48 宽真像素。
//
// 用法：node scripts/brand/pose-trace.mjs            （第四轮：L1 和完成）
//       ROUND=3 node scripts/brand/pose-trace.mjs    （复现第三轮，写回 pose-round3/）
//       ROUND=1 node scripts/brand/pose-trace.mjs    （复现第一轮，写回 pose-round1/）
//       ROUND=2 node scripts/brand/pose-trace.mjs    （复现第二轮，写回 pose-round2/）
//       POSE_OUT=<目录> 把输出写到别处（比如核对第一轮能不能原样复现时用）
//       POSE=float node scripts/brand/pose-trace.mjs  （只出一张，float 或 crack；拼图那三张图要两张都在才出）
//       POSE_DEBUG=1 另出 debug-*.png（各蒙版上色看），默认不出。
// 输出：design/brand-2026-10-13/image-review-2026-11-14/pose-round<ROUND>/ 下的
//       otter-float.svg、otter-crack.svg、compare.png、check-large.png、small.png；终端打印量到的数（JSON）。
// 草图两轮都从 pose-round1/ 读。只读 mascot/ 下的母版和物件，不改。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const ROUND = Number(process.env.ROUND || 4)
if (![1, 2, 3, 4].includes(ROUND)) throw new Error('ROUND 只能是 1、2、3 或 4')
const R2 = ROUND >= 2
const R3 = ROUND >= 3
const R4 = ROUND >= 4
const SRC_DIR = path.join(BRAND, 'image-review-2026-11-14/pose-round1') // 草图放在第一轮目录里
const OUT = process.env.POSE_OUT ? path.resolve(process.env.POSE_OUT) : path.join(BRAND, `image-review-2026-11-14/pose-round${ROUND}`)
const ROUND_CN = ['', '第一轮', '第二轮', '第三轮', '第四轮'][ROUND]
mkdirSync(OUT, { recursive: true })
const MASCOT = path.join(BRAND, 'mascot')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

const COLOR = { mint: '#72BFA4', pale: '#DDF1E8', white: '#F2FAF6', ink: '#191D18', stone: '#6E828C', page: '#F1F5F7' }
const SIGMA = 4 // 环形高斯平滑，像素
const SIGMA_BELLY = 7 // 肚皮浅色的边：草图那里有几处 2～4 像素的小台阶，平滑放宽一点
const EPS = 0.45 // RDP 抽稀阈值，像素
const MAX_SEG = 60 // 抽稀后一段最多跨多少个像素步
const STONE_K2_BOOST = 2 // K2 胸口的小扁片按约定只有 88 像素宽，托不住半片蛤；放大到 2 倍（仍比草图那块小一圈）

// —— 母版和物件 ——
const read = (f) => readFileSync(path.join(MASCOT, f), 'utf8')
const HEAD_MASTER = read('otter-head.svg')
const pick = (re, what) => {
  const m = HEAD_MASTER.match(re)
  if (!m) throw new Error(`头像母版里找不到${what}，母版可能改过，先核对再跑`)
  return m[0].replace(/ id="[^"]+"/g, '')
}
const MUZZLE = pick(/<path id="_L9S-0__ziti073"[^>]*\/>/, '脸斑路径')
const EYES = pick(/<g id="_L9S-0__ziti074">[\s\S]*?<\/g>/, '眼睛')
const NOSE = pick(/<path id="_L9S-0__ziti077"[^>]*\/>/, '鼻子')
const DOTS = pick(/<g id="_L9S-0__ziti078">[\s\S]*?<\/g>/, '胡须点')
const HEAD_SHAPE_D = pick(/<path id="_L9S-0__ziti071"[^>]*\/>/, '头形路径').match(/d="([^"]+)"/)[1]
const MASTER = { eyeL: [336.45, 371.25], eyeR: [688.25, 371.25], noseW: 615.1 - 410.8 } // otter-head.svg 里的数
MASTER.gap = MASTER.eyeR[0] - MASTER.eyeL[0]
const objPaths = (f) => [...read(f).matchAll(/<path [^>]*\/>/g)].map((m) => m[0])
const STONE_ROUND = objPaths('objects/stone-round.svg') // [石色主体, 石面]
const STONE_FLAT = objPaths('objects/stone-flat.svg') // [石色主体, 石面]
const CLAM_OPEN = objPaths('objects/clam-open.svg') // [下片, 上片, 合页圆, 下片纹 1, 下片纹 2, 上片里面]
const CLAM_D = objPaths('objects/clam.svg')[0].match(/d="([^"]+)"/)[1] // 合着的蛤的外形（第一条 path）
// 第二轮举着的半片：clam.svg 的剪影当壳边（雾薄荷），同一剪影按壳的中心缩小当里面（雾白）
const CLAM_C = [119.5, 119] // clam.svg 外形外框的中心（56..182 × 71..166，目测取整）
const HALF_SHELL = [
  `<path d="${CLAM_D}" fill="#72BFA4"/>`,
  `<path d="${CLAM_D}" fill="#F2FAF6" transform="translate(${CLAM_C[0]} ${CLAM_C[1] + 3}) scale(0.8 0.74) translate(${-CLAM_C[0]} ${-CLAM_C[1]})"/>`,
]
// 第三轮：从外面看掀开的半片，带一点侧转。壳面和两道纹就是 clam.svg 原样三条 path（壳顶在上）；
// 后面垫一层同外形往壳口方向错开 SHELL_LIP 的雾薄荷（远侧壳沿），里面再垫一层缩小的雾白，
// 露出来的就是壳口一侧的一道月牙（里面），外面一圈仍是雾薄荷，雾白不碰外轮廓。
const CLAM_ALL = objPaths('objects/clam.svg') // [外形, 纹 1, 纹 2]
const CLAM_H = 166 - 71 // clam.svg 外形高（壳顶到壳口）
const SHELL_LIP = { dx: 4, dy: 19, rim: 5, s: 0.92 } // 远侧壳沿错开量、雾薄荷沿宽、雾白缩放
const SHELL_CRESCENT = SHELL_LIP.dy - SHELL_LIP.rim // 月牙最宽处（壳口正中），clam.svg 单位
const HALF_SHELL_OUT = (() => {
  const { dx, dy, rim, s } = SHELL_LIP
  const r1 = (n) => Math.round(n * 10) / 10
  const wy = 166 + dy - rim - (CLAM_C[1] + s * (166 - CLAM_C[1])) // 雾白缩小后再往下挪，让它下沿离远侧壳沿 rim
  return [
    `<path d="${CLAM_D}" fill="#72BFA4" transform="translate(${dx} ${dy})"/>`,
    `<path d="${CLAM_D}" fill="#F2FAF6" transform="translate(${r1(CLAM_C[0] + dx * (1 - rim / dy))} ${r1(CLAM_C[1] + wy)}) scale(${s}) translate(${-CLAM_C[0]} ${-CLAM_C[1]})"/>`,
    ...CLAM_ALL,
  ]
})()
const HEAD_CLIP_Y = 680 // 第二轮：母版头形在下巴下面这条线裁掉（同 F6）
const SIT_SVG = read('otter-sit.svg')

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const uriPng = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`
const uriSvg = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const f1 = (n) => Math.round(n * 10) / 10

// 母版头形的宽（耳到耳），浏览器量
const MASTER_HEAD_W = await (async () => {
  const p = await browser.newPage()
  await p.setContent(`<svg xmlns="http://www.w3.org/2000/svg"><path id="h" d="${HEAD_SHAPE_D}"/></svg>`)
  const w = await p.evaluate(() => document.getElementById('h').getBBox().width)
  await p.close()
  return w
})()

// ————————————————————————————————— 像素和蒙版 —————————————————————————————————
async function loadPixels(file) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
  await page.setContent(`<img id="i" src="${uriPng(file)}">`)
  const r = await page.evaluate(async () => {
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
  await page.close()
  return { W: r.W, H: r.H, px: Buffer.from(r.b64, 'base64') }
}

function makeOps(W, H) {
  const N = W * H
  const morph = (m, r, erode) => {
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
  // 圆形结构元（膨胀 / 腐蚀）：欧氏距离变换（Felzenszwalb 两遍一维），距离 ≤ r 的算进去
  const edt = (m) => { // 每个像素到最近的 m=1 像素的距离平方
    const INF = 1e12
    const f = new Float64Array(Math.max(W, H))
    const d = new Float64Array(Math.max(W, H))
    const v = new Int32Array(Math.max(W, H))
    const z = new Float64Array(Math.max(W, H) + 1)
    const g = new Float64Array(N)
    const dt1 = (n) => {
      let k = 0
      v[0] = 0; z[0] = -INF; z[1] = INF
      for (let q = 1; q < n; q++) {
        let s
        for (;;) { s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k]) k--; else break }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF
      }
      k = 0
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]] }
    }
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = m[y * W + x] ? 0 : INF; dt1(H); for (let y = 0; y < H; y++) g[y * W + x] = d[y] }
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; dt1(W); for (let x = 0; x < W; x++) g[y * W + x] = d[x] }
    return g
  }
  const disc = (m, r, erode) => {
    if (erode) { const g = edt(m.map((v) => 1 - v)); return Uint8Array.from(g, (v) => (v > r * r ? 1 : 0)) }
    const g = edt(m)
    return Uint8Array.from(g, (v) => (v <= r * r ? 1 : 0))
  }
  const o = {
    N,
    edt,
    morph,
    dilate: (m, r) => disc(m, r, false),
    erode: (m, r) => disc(m, r, true),
    open: (m, r) => morph(morph(m, r, true), r, false),
    close: (m, r) => disc(disc(m, r, false), r, true),
    and: (a, b) => a.map((v, i) => v & b[i]),
    or: (...ms) => ms[0].map((_, i) => (ms.some((m) => m[i]) ? 1 : 0)),
    sub: (a, b) => a.map((v, i) => (v && !b[i] ? 1 : 0)),
    fromFn: (fn) => { const m = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = fn(x, y) ? 1 : 0; return m },
  }
  o.components = (m) => {
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
      c.cx = c.sx / c.area + 0.5
      c.cy = c.sy / c.area + 0.5
      list.push(c)
    }
    return { lab, list }
  }
  o.keep = (m, test) => { const { lab, list } = o.components(m); const ok = new Set(list.filter(test).map((c) => c.id)); return m.map((v, i) => (ok.has(lab[i]) ? 1 : 0)) }
  o.largest = (m) => { const { list } = o.components(m); const top = Math.max(...list.map((c) => c.area)); return o.keep(m, (c) => c.area === top) }
  o.fill = (m) => {
    const inv = m.map((v) => 1 - v)
    const { lab } = o.components(inv)
    const edge = new Set()
    for (let x = 0; x < W; x++) { edge.add(lab[x]); edge.add(lab[(H - 1) * W + x]) }
    for (let y = 0; y < H; y++) { edge.add(lab[y * W]); edge.add(lab[y * W + W - 1]) }
    return m.map((v, i) => (v || !edge.has(lab[i]) ? 1 : 0))
  }
  return o
}

// 几何图元（草图像素坐标）：椭圆、两头不一样粗的胶囊、多边形
const inEllipse = (x, y, [cx, cy, rx, ry, deg = 0]) => {
  const a = (deg * Math.PI) / 180
  const dx = x + 0.5 - cx
  const dy = y + 0.5 - cy
  const u = dx * Math.cos(a) + dy * Math.sin(a)
  const v = -dx * Math.sin(a) + dy * Math.cos(a)
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1
}
const inCapsule = (x, y, [x0, y0, r0, x1, y1, r1]) => {
  const px = x + 0.5
  const py = y + 0.5
  const dx = x1 - x0
  const dy = y1 - y0
  const L2 = dx * dx + dy * dy
  for (let k = 0; k <= 24; k++) { // 沿中线取一串圆，够密就是锥形胶囊
    const t = k / 24
    const r = r0 + (r1 - r0) * t
    if ((px - x0 - dx * t) ** 2 + (py - y0 - dy * t) ** 2 <= r * r) return true
  }
  void L2
  return false
}
const inPoly = (x, y, poly) => {
  const px = x + 0.5
  const py = y + 0.5
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
// 一只后脚（宽蹼）：脚腕一个圆，掌端一个横放的椭圆，两者取凸包当整只脚掌；掌端边上挖两个小凹口分出三趾。
// 不是鱼尾那样的叉，也不是一颗颗手指。
function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  const up = []
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}
function footPrims({ ankle: [ax, ay], rAnkle, deg, len, halfW, tipLen = 24, notchR = 8, notchDepth = 6 }) {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const nx = -uy
  const ny = ux
  const tx = ax + ux * len
  const ty = ay + uy * len
  const pts = []
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2
    pts.push([ax + rAnkle * Math.cos(t), ay + rAnkle * Math.sin(t)])
    pts.push([tx + ux * tipLen * Math.cos(t) + nx * halfW * Math.sin(t), ty + uy * tipLen * Math.cos(t) + ny * halfW * Math.sin(t)])
  }
  // 凹口：落在掌端椭圆边上 ±1/3 掌宽处，往里挖 notchDepth
  const notches = [-1, 1].map((k) => {
    const s = (k * halfW) / 3
    const along = tipLen * Math.sqrt(Math.max(0, 1 - (s / halfW) ** 2))
    return [tx + ux * (along + notchR - notchDepth) + nx * s, ty + uy * (along + notchR - notchDepth) + ny * s, notchR, notchR, 0]
  })
  return { hull: convexHull(pts), notches }
}
// 尾巴：沿一条二次曲线排一串由粗到细的胶囊段
function tailPrims([x0, y0], [cx, cy], [x2, y2], r0, r2, n = 8) {
  const at = (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y2]
  const r = (t) => r0 + (r2 - r0) * t ** 1.3
  return Array.from({ length: n }, (_, k) => { const a = at(k / n); const b = at((k + 1) / n); return [a[0], a[1], r(k / n), b[0], b[1], r((k + 1) / n)] })
}

// ————————————————————————————————— 描边 —————————————————————————————————
function makeTracer(W, H) {
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
  return { loops }
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

// 水面：超椭圆（指数 n>2 时上下边更平），再按同样办法抽稀转贝塞尔
function waterPath([cx, cy, rx, ry, n]) {
  const pts = []
  for (let k = 0; k < 720; k++) {
    const t = (k / 720) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)])
  }
  const q = thin(pts, EPS, 40)
  return { d: toPath(q), nodes: q.length }
}

// 折线插值（x 升序的点列）
const lerpPts = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1]; const [x1, y1] = pts[k]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) } return pts[pts.length - 1][1] }

// 平滑插值（x 升序的点列，三次 Hermite，切线取左右两点连线的斜率）
const splinePts = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1]
  const n = pts.length
  if (x >= pts[n - 1][0]) return pts[n - 1][1]
  let k = 1
  while (x > pts[k][0]) k++
  const sl = (i) => { const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(n - 1, i + 1)]; return (b[1] - a[1]) / (b[0] - a[0]) }
  const [x0, y0] = pts[k - 1]
  const [x1, y1] = pts[k]
  const h = x1 - x0
  const t = (x - x0) / h
  return (2 * t ** 3 - 3 * t * t + 1) * y0 + (t ** 3 - 2 * t * t + t) * h * sl(k - 1) + (-2 * t ** 3 + 3 * t * t) * y1 + (t ** 3 - t * t) * h * sl(k)
}

// 物件：把物件 SVG 里的路径按「物件画框中心点 → 草图里的目标点」放进去
function placeObj(paths, { at, pivot = [120, 120], scale, rot = 0, flip = false, id }) {
  const sx = flip ? -scale : scale
  return `<g${id ? ` id="${id}"` : ''} transform="translate(${f1(at[0])} ${f1(at[1])}) rotate(${rot}) scale(${f1(sx * 1000) / 1000} ${f1(scale * 1000) / 1000}) translate(${-pivot[0]} ${-pivot[1]})">${paths.join('')}</g>`
}

// ————————————————————————————————— 两张的参数 —————————————————————————————————
// 坐标都是草图像素（1024×1024）。区域是看草图（加 25 像素网格）目测定的。
const POSES = {
  float: {
    src: 'source-L1-float.png',
    out: 'otter-float.svg',
    title: `獭獭 · 仰躺抱石（float）· ${ROUND_CN}对比稿`,
    // 草图尾巴这一段（这条折线右边）剪掉，换后脚和尾巴
    tailCut: [[725, 420], [1024, 420], [1024, 800], [700, 800], [700, 700], [725, 660]],
    hips: [[738, 652, 50, 68, -10]], // 盖住剪口的髋
    feet: [
      footPrims({ ankle: [752, 622], rAnkle: 30, deg: -74, len: 104, halfW: 44 }), // 远侧后脚，朝上
      footPrims({ ankle: [790, 646], rAnkle: 30, deg: -28, len: 112, halfW: 46 }), // 近侧后脚，朝右上
    ],
    tail: tailPrims([680, 684], [840, 704], [956, 684], 42, 28), // 粗尾，平躺在水面，尾尖略翘
    water: [520, 718, 492, 50, 2.6],
    waterTop: 740, // 草图里伸到这条线以下的浅色块是水，不算肚皮
    // 石头：草图石头占的像素归到身后的浅色（胸腹），再把圆墩石放上去
    rockBehind: 'pale',
    stone: { paths: STONE_ROUND, pivot: [122.5, 126], at: [313, 530], rotK: -8, scaleK: 1 },
    paws: [
      [[285, 400], [470, 400], [470, 560], [285, 560]], // 右边那只（獭獭的左爪），从肩到爪都在石头前
      [[168, 512], [318, 512], [318, 628], [168, 628]], // 左下那只
    ],
    objects: [],
  },
  crack: {
    src: 'source-K2-crack.png',
    out: 'otter-crack.svg',
    title: `獭獭 · 仰躺敲开蛤（crack）· ${ROUND_CN}对比稿`,
    tailCut: [[770, 420], [1024, 420], [1024, 820], [740, 820], [740, 720], [770, 680]],
    hips: [[778, 676, 50, 70, -8]],
    feet: [
      footPrims({ ankle: [790, 648], rAnkle: 30, deg: -66, len: 104, halfW: 44 }),
      footPrims({ ankle: [826, 668], rAnkle: 30, deg: -22, len: 112, halfW: 46 }),
    ],
    tail: tailPrims([752, 714], [880, 724], [972, 702], 48, 31),
    water: [565, 772, 470, 42, 2.6],
    waterTop: 2000, // K2 草图没有水
    rockEllipse: [458, 573, 131, 57, 0], // 草图石头的大致范围（上沿被下片咬掉一口，用椭圆补齐）
    rockBehind: 'curve',
    // 胸口石头和石头上的半片在草图里占的地方：线以上算背景，线以下算身体（再往下 14 像素起是肚皮浅色）
    behindCurve: (x) => (x < 445 ? -1 : splinePts([[445, 483], [520, 520], [600, 538], [660, 549]], x)),
    // 身体上沿右边那段（草图里只剩一道细线，还带着半片的边角）也按这条线重画
    contourBand: { x0: 540, x1: 660, above: 20, below: 24 },
    // 肚皮浅色的上沿：左边接举着的胳膊下沿（延到半片后面），右边接身体上沿往下 14 像素
    bellyTop: (x) => splinePts([[345, 525], [380, 536], [410, 536], [440, 524], [470, 520], [520, 534], [600, 552], [660, 563]], x),
    // 局部修圆：举着的胳膊顶上（草图那里被半片的边切平了）开运算削圆；胳膊和胸口的夹角闭运算填圆
    localRound: [{ rect: [360, 330, 510, 440], open: 12 }, { rect: [405, 450, 480, 505], open: 8 }, { rect: [405, 450, 480, 505], close: 12 }],
    // 举着的前臂：草图前臂顶上被半片切平，把这一块削掉，换一段圆头胶囊
    forearm: { clear: [[355, 330], [445, 330], [445, 405], [355, 440]], caps: [[392, 452, 38, 452, 390, 28]] },
    stone: { paths: STONE_FLAT, pivot: [121, 119.3], at: [474, 600], rotK: -6, scaleK: STONE_K2_BOOST },
    paws: [
      [[298, 552], [430, 552], [430, 664], [298, 664]], // 下面那只压在石头左下
      [[418, 340], [500, 340], [500, 430], [418, 430]], // 举着的那只，压在上片的合页一端
    ],
    pawTips: [[461, 384, 27, 26, 0]], // 举着的那只爪尖补圆（草图爪尖被上片盖着）
    shellZones: { upper: [[372, 240], [540, 240], [540, 372], [372, 372]], lower: [[372, 470], [560, 470], [560, 568], [372, 568]] },
    objects: [
      // 上片：镜像后合页在右下、开口朝左上，压在举着的爪里
      { paths: [CLAM_OPEN[1], CLAM_OPEN[5]], pivot: [96, 98], at: [440, 316], rotK: 9, flip: true, id: 'shell-top' },
      // 下片：搁在石头上
      { paths: [CLAM_OPEN[0], CLAM_OPEN[3], CLAM_OPEN[4]], pivot: [124, 159], at: [500, 558], rotK: -4, id: 'shell-bottom' },
    ],
  },
}

// —— 第二轮在第一轮参数上改 ——
if (R2) {
  const F = POSES.float
  const C = POSES.crack
  for (const P of [F, C]) {
    P.masterHead = true // 头形换母版
    P.tailCut = null // 后脚照草图描，不剪
    P.feet = []
    P.hips = []
    P.tail = []
  }
  // 两只后脚之间的分叉：草图里是一道尖缝，挖一道圆头的缝收干净（胶囊：缝底 → 缝口）
  F.forkCarve = [[806, 627, 6, 905, 588, 9]]
  C.forkCarve = [[868, 651, 6, 955, 637, 9]]
  F.tailNotch = [[962, 691, 5, 1010, 684, 9]]
  C.tailNotch = [[948, 722, 5, 1010, 716, 9]]
  // 尾巴：下面那只脚底下并一条短粗尾，尾尖从脚的右下露出来
  F.tailAdd = [...tailPrims([700, 708], [840, 709], [960, 707], 19, 21), ...tailPrims([960, 707], [985, 705], [998, 703], 21, 21)]
  C.tailAdd = [...tailPrims([760, 738], [880, 738], [975, 736], 19, 21), ...tailPrims([975, 736], [990, 734], [999, 732], 21, 21)]
  // K2 举着的那条胳膊照草图描；只在被壳边切掉的爪尖补一个椭圆，画在壳前面
  C.forearm = null
  C.localRound = [{ rect: [405, 450, 480, 505], open: 8 }, { rect: [405, 450, 480, 505], close: 12 }]
  C.pawTips = [[440, 384, 46, 23, -15]] // 盖住草图前臂顶上被壳边切平的那一截（x 395～485）
  C.frontPawTips = true
  C.pawTipRect = { raised: [385, 335, 500, 425], lower: [298, 552, 430, 664], raisedW: [370, 350, 520, 400], lowerW: [340, 552, 410, 664] }
  C.pawAxis = { raised: [415, 450, 452, 372], lower: [312, 620, 398, 598] } // 前臂轴线（目测）：肘那头 → 爪尖 // 量爪尖粗细用的范围
  C.paws = [C.paws[0]] // 下面那只照旧按区域抠；举着的那只只把爪尖放到前面
  // 举着的半片：正面看半片壳的里面（clam.svg 剪影派生），壳顶朝右下握在爪里
  C.objects[0] = { paths: HALF_SHELL, pivot: CLAM_C, at: [432, 330], rotK: 165, id: 'shell-top' } // 壳顶露在爪尖上沿
  // 下片和石头往右下挪，让开胳膊根（第一轮：石头 at [474, 600]，下片 at [500, 558]）
  C.stone = { ...C.stone, at: [470, 628] }
  C.objects[1] = { ...C.objects[1], at: [520, 590] }
  // 胳膊根在下片左边就收住，下片左边、上边衬肚皮浅色
  C.bellyTop = (x) => splinePts([[345, 525], [375, 533], [400, 528], [425, 510], [445, 497], [520, 534], [600, 552], [660, 563]], x)
}

// —— 第三轮在第二轮参数上改 ——
// TAIL=slit|merge 选尾巴和下面那只脚之间的做法（默认见 TAIL_MODE）
const TAIL_MODE = process.env.TAIL || 'slit'
if (R3) {
  const F = POSES.float
  const C = POSES.crack
  for (const P of [F, C]) P.tailNotch = null // 第二轮挖的小凹口（带出台阶和小钩子）不要了
  if (TAIL_MODE === 'slit') {
    F.tailSlit = [[[928, 693], [1040, 676], [1040, 690]]]
    C.tailSlit = [[[915, 723], [1040, 706], [1040, 720]]]
  }
  F.localRound = [
    ...(TAIL_MODE === 'merge' ? [{ rect: [920, 630, 1040, 700], close: 24 }] : []),
    { rect: [940, 640, 1040, 760], open: 14 },
  ]
  C.localRound = [
    ...C.localRound,
    { rect: [370, 340, 440, 400], open: 22 }, // 举着的前臂顶上草图被壳边切出的台阶削圆
    ...(TAIL_MODE === 'merge' ? [{ rect: [920, 660, 1040, 730], close: 24 }] : []),
    { rect: [940, 670, 1040, 790], open: 14 },
  ]
  C.objects[0] = { paths: HALF_SHELL_OUT, pivot: [122, 128], at: [458, 294], rotK: 205, id: 'shell-top' }
  C.pawTrim = { rect: [352, 552, 430, 664], keep: [352, 604, 38, 40, 0] } // 第二轮爪尖到 x≈407，压住石头左头；收到 x≈390
  C.objects[1] = { ...C.objects[1], at: [520, 594] } // 第二轮 [520, 590]：碗右头上沿离肚皮上沿只有 7 像素（800 宽），再往下 4
  C.pawTips = [[446, 378, 33, 22, -25]] // 第二轮 46×23（全宽 92）显得像手套，缩到和下面那只爪尖一样宽
}

// —— 第四轮（Owner 2026-11-14：「完成」改用 L1 身体加胸口开蛤）——
// L1 照第三轮原样再出一遍（同参数，身体、肚皮、爪子路径逐字一样），只在尾巴缝里补一块雾薄荷；
// 另拼一张 otter-done.svg：同一套层，把石头换成 objects/clam-open.svg（只平移、缩放、转小角度），
// 蛤画在两只爪子后面，按爪子外形往外 DONE_GAP 像素让出一道缝（SVG 蒙版，露出后面的肚皮或水，不是描边）。
const DONE_GAP = 10 // 蛤在爪子四周让出的缝，草图像素（目测）
if (R4) {
  const F = POSES.float
  F.slitWaterFill = true
  F.slitFillX = 985 // 第三轮缝里 x 932～975 那段底下是水，露出一丝浅色；整段补上，缝口外是背景
  F.done = { paths: CLAM_OPEN, pivot: [124, 159], at: [290, 518], rotK: -14, scaleK: 0.7, id: 'clam' } // 系数 1.0 太大（胸口那块空当只有约 110 高），试过 1.0、0.9、0.85、0.8、0.75，0.7 才不碰下巴
}

// ————————————————————————————————— 一张 —————————————————————————————————
async function build(key) {
  const P = POSES[key]
  const SKETCH = path.join(SRC_DIR, P.src)
  const { W, H, px } = await loadPixels(SKETCH)
  const o = makeOps(W, H)
  const { N } = o
  const T = makeTracer(W, H)
  const at = (x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]
  void at
  // 中心色：草图直方图里的几个峰（目测取整）
  const CENTER = { bg: [252, 252, 252], mint: [116, 188, 164], pale: [220, 236, 228], white: [238, 250, 244], rock: [114, 131, 140], ink: [24, 24, 20] }
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
  const isC = (name) => cls.map((c) => (c === K[name] ? 1 : 0))
  const mint = o.open(isC('mint'), 1)
  const pale = o.open(isC('pale'), 2)
  const white = o.open(isC('white'), 1)
  const ink = o.open(isC('ink'), 1)
  const rock = o.largest(o.open(isC('rock'), 2))

  // —— 草图的眼睛（头上墨色块：最大是鼻子，接着两块是眼睛）——
  const inkParts = o.components(ink).list.sort((a, b) => b.area - a.area)
  const noseSk = inkParts[0]
  const eyes = inkParts.slice(1, 3).sort((a, b) => a.cx - b.cx)
  const SK = { cx: (eyes[0].cx + eyes[1].cx) / 2, cy: (eyes[0].cy + eyes[1].cy) / 2, gap: Math.hypot(eyes[1].cx - eyes[0].cx, eyes[1].cy - eyes[0].cy), deg: (Math.atan2(eyes[1].cy - eyes[0].cy, eyes[1].cx - eyes[0].cx) * 180) / Math.PI }

  // 母版五官（第二轮还有头形）对齐草图两眼的变换
  const S = SK.gap / MASTER.gap
  const mcx = (MASTER.eyeL[0] + MASTER.eyeR[0]) / 2
  const faceXf = `translate(${f1(SK.cx)} ${f1(SK.cy)}) rotate(${f1(SK.deg)}) scale(${(S).toFixed(4)}) translate(${-mcx} ${-MASTER.eyeL[1]})`

  // —— 物件里要抠掉的草图半片（K2）——
  let shellU = new Uint8Array(N)
  let shellL = new Uint8Array(N)
  if (P.shellZones) {
    const zU = o.fromFn((x, y) => inPoly(x, y, P.shellZones.upper))
    const zL = o.fromFn((x, y) => inPoly(x, y, P.shellZones.lower))
    const pawTip = o.fromFn((x, y) => P.pawTips.some((e) => inEllipse(x, y, e)))
    shellU = o.sub(o.and(o.fill(o.dilate(o.and(white, zU), 16)), zU), pawTip)
    shellL = o.and(o.fill(o.dilate(o.and(white, zL), 18)), o.sub(zL, rock))
  }

  // —— 身体（含头）——
  const paleIn = o.keep(pale, (c) => c.maxY < P.waterTop) // 水那块不算
  let body = o.or(mint, ink, white, rock, paleIn)
  body = o.sub(body, o.or(shellU, shellL))
  body = o.fill(o.largest(o.open(body, 2)))
  let belly = o.and(paleIn, body)
  if (P.rockBehind === 'pale') {
    belly = o.or(belly, o.and(o.dilate(rock, 3), body))
  } else {
    // K2：石头和下片占的地方，按一条线分成背景 / 身体 / 肚皮（线下 14 像素起是肚皮浅色，留一道雾薄荷边）
    const protect = o.and(mint, o.fromFn((x, y) => inPoly(x, y, P.paws[0]))) // 压在石头上的那只爪子不动
    const C = P.behindCurve
    const cb = P.contourBand
    const band = o.fromFn((x, y) => x >= cb.x0 && x < cb.x1 && y >= C(x) - cb.above && y < C(x) + cb.below)
    const zone = o.sub(o.or(o.dilate(rock, 3), shellL, o.fromFn((x, y) => inEllipse(x, y, P.rockEllipse)), band), protect)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!zone[i]) continue
      const c = C(x)
      if (c >= 0 && y < c) { body[i] = 0; belly[i] = 0; continue }
      body[i] = 1
      belly[i] = y < P.bellyTop(x) ? 0 : 1
    }
    body = o.fill(o.largest(body))
  }
  // 第二轮：头形换母版。草图的头在下巴线以上不要，只留一截比脖子窄的桩子伸进去；母版头（裁到下巴）栅格化后并进身体
  if (P.masterHead) {
    const toSk = (mx, my) => { const a = (SK.deg * Math.PI) / 180; const dx = (mx - mcx) * S; const dy = (my - MASTER.eyeL[1]) * S; return [SK.cx + dx * Math.cos(a) - dy * Math.sin(a), SK.cy + dx * Math.sin(a) + dy * Math.cos(a)] }
    const CUT_Y = Math.round(toSk(mcx, 670)[1])
    const STUB = 8
    const hx0 = Math.round(SK.cx - SK.gap * 1.8)
    const hx1 = Math.round(SK.cx + SK.gap * 1.6) // 再往右是 K2 举着的胳膊，不动
    const row = CUT_Y * W
    let x0 = hx0
    let x1 = hx1
    while (x0 < x1 && !body[row + x0]) x0++
    while (x1 > x0 && !body[row + x1]) x1--
    for (let y = 0; y < CUT_Y; y++) for (let x = hx0; x <= hx1; x++) if (y < CUT_Y - 40 || x < x0 + STUB || x > x1 - STUB) { body[y * W + x] = 0; belly[y * W + x] = 0 }
    const headMask = await (async () => {
      const hp = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
      await hp.setContent(`<body style="margin:0;background:#fff"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="${faceXf}"><clipPath id="c"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><path d="${HEAD_SHAPE_D}" fill="#000" clip-path="url(#c)"/></g></svg>`)
      const png = await hp.screenshot({ type: 'png' })
      await hp.setContent(`<img id="i" src="data:image/png;base64,${png.toString('base64')}">`)
      const bits = await hp.evaluate(async () => { const img = document.getElementById('i'); await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let o = ''; for (let i = 0; i < d.length; i += 4) o += d[i] < 128 ? '1' : '0'; return o })
      await hp.close()
      return Uint8Array.from(bits, (ch) => (ch === '1' ? 1 : 0))
    })()
    body = o.largest(o.or(o.largest(body), headMask))
  }
  // 第二轮：后脚照草图描；分叉挖圆头缝，下面并一条短粗尾
  if (P.forkCarve) body = o.sub(body, o.fromFn((x, y) => P.forkCarve.some((c) => inCapsule(x, y, c))))
  if (P.tailClear) body = o.sub(body, o.fromFn((x, y) => P.tailClear.some((q) => inPoly(x, y, q))))
  if (P.tailAdd) body = o.or(body, o.fromFn((x, y) => P.tailAdd.some((c) => inCapsule(x, y, c))))
  if (P.tailNotch) body = o.sub(body, o.fromFn((x, y) => P.tailNotch.some((c) => inCapsule(x, y, c)))) // 脚和尾巴之间的凹口挖圆
  if (P.tailSlit) body = o.sub(body, o.fromFn((x, y) => P.tailSlit.some((q) => inPoly(x, y, q)))) // 第三轮：两头渐尖的缝
  // 第一轮：剪掉草图那一段，换几何图元拼的后脚和尾巴
  const cut = o.fromFn((x, y) => P.tailCut && inPoly(x, y, P.tailCut))
  body = o.sub(body, cut)
  belly = o.sub(belly, cut)
  const feetMask = P.feet.map((f) => o.fromFn((x, y) => inPoly(x, y, f.hull) && !f.notches.some((e) => inEllipse(x, y, e))))
  const tailMask = o.fromFn((x, y) => P.tail.some((c) => inCapsule(x, y, c)))
  const hipMask = o.fromFn((x, y) => P.hips.some((e) => inEllipse(x, y, e)))
  const extra = o.or(...feetMask, tailMask, hipMask)
  body = o.or(o.and(body, o.sub(new Uint8Array(N).fill(1), cut)), extra)
  if (P.tailCut) { // 新接上的那一段（剪口往左 80 像素起）做一次闭运算，接缝处的凹角圆一下
    const zone = o.fromFn((x, y) => x > P.tailCut[0][0] - 80 && y > P.tailCut[0][1] - 40)
    body = o.or(body, o.and(o.close(body, 10), zone))
  }
  if (P.forearm) {
    const clr = o.fromFn((x, y) => inPoly(x, y, P.forearm.clear))
    body = o.or(o.sub(body, clr), o.fromFn((x, y) => P.forearm.caps.some((c) => inCapsule(x, y, c))))
    body = o.largest(body)
  }
  for (const lr of P.localRound || []) {
    const [x0, y0, x1, y1] = lr.rect
    const R = o.fromFn((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1)
    const done = lr.open ? o.dilate(o.erode(body, lr.open), lr.open) : o.close(body, lr.close)
    body = o.or(o.sub(body, R), o.and(done, R))
  }
  if (P.pawTips) body = o.or(body, o.fromFn((x, y) => P.pawTips.some((e) => inEllipse(x, y, e))))
  body = o.fill(o.largest(body))
  // 次色的面不碰外轮廓：肚皮离身体外沿至少 6 像素
  belly = o.and(belly, o.erode(body, 6))
  belly = o.keep(o.open(belly, 3), (c) => c.area > 1500)

  // 压在物件上的爪子：身体（不含肚皮）在区域里的那部分
  if (P.pawTrim) { // 第三轮：下面那只爪尖往左收——区域里椭圆以外的爪子改成肚皮浅色（爪尖变成这个椭圆的右半个头）
    const { rect: [x0, y0, x1, y1], keep } = P.pawTrim
    belly = o.or(belly, o.and(body, o.fromFn((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 && !inEllipse(x, y, keep))))
  }
  const mintOnly = o.sub(body, belly)
  const pawMasks = P.paws.map((poly) => o.keep(o.and(mintOnly, o.fromFn((x, y) => inPoly(x, y, poly))), (c) => c.area > 400))
  if (P.frontPawTips) pawMasks.push(o.and(body, o.fromFn((x, y) => P.pawTips.some((e) => inEllipse(x, y, e)))))

  // —— 描 ——
  const trace = (m, sigma = SIGMA, minArea = 400) => {
    const all = T.loops(m).filter((p) => areaOf(p) > minArea)
    let nodes = 0
    const d = all.map((p) => { const q = thin(smooth(p, sigma), EPS, MAX_SEG); nodes += q.length; return toPath(q) }).join('')
    return { d, nodes }
  }
  const tBody = trace(body)
  const tBelly = trace(belly, SIGMA_BELLY)
  const tPaws = pawMasks.map((m) => trace(m))
  const tWater = waterPath(P.water)
  // 第四轮：尾巴缝里露出的那丝水面补成雾薄荷（只补缝里看得见水的那几个像素，往身体里多垫 2 像素，画在身体下面）
  let tSlitFill = null
  if (P.slitWaterFill) {
    const [wcx, wcy, wrx, wry, wn] = P.water
    const waterIn = o.fromFn((x, y) => Math.abs((x + 0.5 - wcx) / wrx) ** wn + Math.abs((y + 0.5 - wcy) / wry) ** wn <= 1)
    // 缝里 x < slitFillX 那一段（看得见水的就是这段）补上；缝口那段（底下是背景）照旧
    const seen = o.and(o.fromFn((x, y) => x < P.slitFillX && P.tailSlit.some((q) => inPoly(x, y, q))), o.dilate(waterIn, 3), o.sub(new Uint8Array(N).fill(1), body))
    const fillM = o.and(o.dilate(seen, 2), o.or(body, seen))
    tSlitFill = trace(fillM, 1.5, 4)
  }

  // —— 脸：母版五官（第二轮连头形），按草图两眼对齐 ——
  const headShape = P.masterHead ? `<clipPath id="${key}-chin"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><path d="${HEAD_SHAPE_D}" fill="${COLOR.mint}" clip-path="url(#${key}-chin)"/>` : ''
  const face = `<g id="face" transform="${faceXf}">${headShape}${MUZZLE}${EYES}${NOSE}${DOTS}</g>`

  // 头宽（含耳朵）：眼线上下各 0.35 个眼距这几行里，身体蒙版最宽的一行
  let headW = 0
  let headSpan = null
  for (let y = Math.round(SK.cy - SK.gap * 0.35); y <= Math.round(SK.cy + SK.gap * 0.35); y++) {
    let x0 = Math.round(SK.cx - SK.gap * 1.8)
    let x1 = Math.round(SK.cx + SK.gap * 1.8)
    while (x0 < x1 && !body[y * W + x0]) x0++
    while (x1 > x0 && !body[y * W + x1]) x1--
    if (x1 - x0 + 1 > headW) { headW = x1 - x0 + 1; headSpan = [x0, x1, y] }
  }
  const sketchNoseW = noseSk.maxX - noseSk.minX + 1
  const OBJ = (P.masterHead ? MASTER_HEAD_W * S : headW) / 240 // 物件画框换算：240 = 头宽

  // —— 物件 ——
  const st = P.stone
  const stoneSvg = placeObj(st.paths, { at: st.at, pivot: st.pivot, scale: OBJ * st.scaleK, rot: st.rotK, id: 'stone' })
  const objs = P.objects.map((ob) => placeObj(ob.paths, { at: ob.at, pivot: ob.pivot, scale: OBJ, rot: ob.rotK, flip: ob.flip, id: ob.id }))

  // —— 拼 ——
  const layers = [
    `<path id="water" d="${tWater.d}" fill="${COLOR.pale}"/>`,
    ...(tSlitFill ? [`<path id="slit-fill" d="${tSlitFill.d}" fill="${COLOR.mint}"/>`] : []),
    `<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>`,
    `<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>`,
    stoneSvg,
    ...objs,
    ...tPaws.map((t, k) => `<path id="paw-${k + 1}" d="${t.d}" fill="${COLOR.mint}"/>`),
    face,
  ].join('\n')
  // 内容外框（浏览器量）→ 留边
  const probe = await browser.newPage({ viewport: { width: W, height: H } })
  await probe.setContent(`<svg id="s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${layers}</svg>`)
  const bb = await probe.evaluate(() => { const b = document.getElementById('s').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
  await probe.close()
  const PAD = Math.round(Math.max(bb.w, bb.h) * 0.04)
  const vb = [Math.floor(bb.x - PAD), Math.floor(bb.y - PAD), Math.ceil(bb.w + 2 * PAD), Math.ceil(bb.h + 2 * PAD)]
  const NOTE = R4
    ? `<!-- 对比稿，不是母版：仰躺姿势第四轮（${P.src}），和第三轮 otter-float.svg 同一套描法和参数（scripts/brand/pose-trace.mjs，ROUND=4）；只多一块 slit-fill：尾巴和下面那只脚之间那道缝里露出的一丝水面补成雾薄荷。提案 · 单一来源。water 那块可以整块拿掉。 -->`
    : R3
    ? `<!-- 对比稿，不是母版：仰躺姿势第三轮（${P.src}），身体和后脚照草图描（scripts/brand/pose-trace.mjs，ROUND=3）；头是头像母版原样缩放（头形裁到下巴并进身体剪影）；物件是 mascot/objects/ 的定稿形${key === 'crack' ? '，举着的半片是 clam.svg 原样外形和两道纹、从外面看、壳口一侧露一道雾白月牙（派生画法，不是新物件）' : ''}；尾巴是加的一小段，末端收圆头，和下面那只脚之间一道两头渐尖的缝。提案 · 单一来源。water 那块可以整块拿掉。 -->`
    : R2
    ? `<!-- 对比稿，不是母版：仰躺姿势第二轮（${P.src}），身体和后脚照草图描（scripts/brand/pose-trace.mjs，ROUND=2）；头是头像母版原样缩放（头形裁到下巴并进身体剪影）；物件是 mascot/objects/ 的定稿形${key === 'crack' ? '，举着的半片是 clam.svg 剪影派生的正面半壳' : ''}；尾巴是加的一小段。提案 · 单一来源。water 那块可以整块拿掉。 -->`
    : `<!-- 对比稿，不是母版：仰躺姿势第一轮（${P.src}），身体外形照草图描（scripts/brand/pose-trace.mjs）；五官是头像母版的脸斑、眼、鼻、胡须点整体缩放放上；物件是 mascot/objects/ 的定稿形；后脚和尾巴重画。提案 · 单一来源。water 那块可以整块拿掉。 -->`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">\n${NOTE}\n<title>${P.title}</title>\n${layers}\n</svg>\n`
  writeFileSync(path.join(OUT, P.out), svg)

  // 第四轮：完成（L1 身体 + 胸口开蛤）
  let done = null
  if (P.done) {
    const dn = P.done
    const clam = placeObj(dn.paths, { at: dn.at, pivot: dn.pivot, scale: OBJ * dn.scaleK, rot: dn.rotK, id: dn.id })
    // 身体在蛤四周也让出同样宽的缝（露出背景色），蛤压在脖子、胳膊根这些雾薄荷上时才分得开；肚皮画在身体上面不受影响
    const sc = OBJ * dn.scaleK
    const holeMask = `<mask id="done-hole" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1500" height="1500"><rect x="-200" y="-200" width="1500" height="1500" fill="#fff"/>${placeObj(dn.paths.map((p) => p.replace(/fill="[^"]*"/, `fill="#000" stroke="#000" stroke-width="${f1((2 * DONE_GAP) / sc)}" stroke-linejoin="round"`)), { at: dn.at, pivot: dn.pivot, scale: sc, rot: dn.rotK })}</mask>`
    const gapMask = `<mask id="done-gap" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1500" height="1500"><rect x="-200" y="-200" width="1500" height="1500" fill="#fff"/>${tPaws.map((t) => `<path d="${t.d}" fill="#000" stroke="#000" stroke-width="${2 * DONE_GAP}" stroke-linejoin="round"/>`).join('')}</mask>`
    const dLayers = [
      `<path id="water" d="${tWater.d}" fill="${COLOR.pale}"/>`,
      ...(tSlitFill ? [`<path id="slit-fill" d="${tSlitFill.d}" fill="${COLOR.mint}"/>`] : []),
      `<defs>${holeMask}${gapMask}</defs>`,
      `<path id="body" d="${tBody.d}" fill="${COLOR.mint}" mask="url(#done-hole)"/>`,
      `<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>`,
      `<g mask="url(#done-gap)">${clam}</g>`,
      ...tPaws.map((t, k) => `<path id="paw-${k + 1}" d="${t.d}" fill="${COLOR.mint}"/>`),
      face,
    ].join('\n')
    const pr = await browser.newPage({ viewport: { width: W, height: H } })
    await pr.setContent(`<svg id="s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${dLayers}</svg>`)
    const b2 = await pr.evaluate(() => { const b = document.getElementById('s').getBBox(); const c = document.getElementById('clam').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, clam: [c.x, c.y, c.width, c.height] } })
    await pr.close()
    const PAD2 = Math.round(Math.max(b2.w, b2.h) * 0.04)
    const vb2 = [Math.floor(b2.x - PAD2), Math.floor(b2.y - PAD2), Math.ceil(b2.w + 2 * PAD2), Math.ceil(b2.h + 2 * PAD2)]
    const NOTE2 = `<!-- 对比稿，不是母版：「完成」第四轮（Owner 2026-11-14：完成改用 L1 身体加胸口开蛤）。身体、头、尾、后脚、两只前爪和第四轮 otter-float.svg 逐字一样（scripts/brand/pose-trace.mjs，ROUND=4）；石头换成 mascot/objects/clam-open.svg 定稿形（只平移、缩放 ${f1(OBJ * dn.scaleK * 1000) / 1000}、转 ${dn.rotK}°），画在两只爪子后面，爪子四周用蒙版让出 ${DONE_GAP} 像素的缝。提案 · 单一来源。water 那块可以整块拿掉。 -->`
    const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb2.join(' ')}">\n${NOTE2}\n<title>獭獭 · 仰躺胸口开蛤（done）· 第四轮对比稿</title>\n${dLayers}\n</svg>\n`
    writeFileSync(path.join(OUT, 'otter-done.svg'), svg2)
    done = { svg: svg2, vbW: vb2[2], clamScale: +(OBJ * dn.scaleK).toFixed(4), clamBox: b2.clam.map((v) => f1(v)), clamBoxPerHead: +(b2.clam[2] / (MASTER_HEAD_W * S)).toFixed(3), viewBox: vb2, bytes: svg2.length }
  }

  if (process.env.POSE_DEBUG) {
    const dbg = await browser.newPage({ viewport: { width: W, height: H } })
    const rgba = new Uint8ClampedArray(N * 4)
    for (let i = 0; i < N; i++) {
      const c = belly[i] ? [221, 241, 232] : pawMasks.some((m) => m[i]) ? [40, 120, 90] : body[i] ? [114, 191, 164] : shellU[i] || shellL[i] ? [255, 180, 0] : [255, 255, 255]
      rgba.set([...c, 255], i * 4)
    }
    await dbg.setContent('<canvas id="c"></canvas>')
    await dbg.evaluate(({ b64, W, H }) => { const c = document.getElementById('c'); c.width = W; c.height = H; const d = Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)); c.getContext('2d').putImageData(new ImageData(d, W, H), 0, 0); document.body.style.margin = 0 }, { b64: Buffer.from(rgba).toString('base64'), W, H })
    await dbg.screenshot({ path: path.join(OUT, `debug-${key}.png`) })
    await dbg.close()
  }

  // 第二轮起：两只前爪的粗细（爪尖那一块里最大内切圆直径，草图像素）；碗上沿到肚皮上沿那道浅色（800 宽成品像素）
  let pawTipD = null
  let bowlGap800 = null
  if (P.frontPawTips) {
    const maxR = (m, [x0, y0, x1, y1]) => { const d = o.edt(m.map((v) => 1 - v)); let r = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m[y * W + x]) r = Math.max(r, d[y * W + x]); return f1(2 * Math.sqrt(r)) }
    // 爪尖宽：举着的那只按行量（前臂朝上），下面那只按列量（前臂朝右）；都取最长的一段连续像素
    const run = (m, [x0, y0, x1, y1], byRow) => { let best = 0; const [a0, a1, b0, b1] = byRow ? [y0, y1, x0, x1] : [x0, x1, y0, y1]; for (let a = a0; a < a1; a++) { let n = 0; for (let b = b0; b < b1; b++) { const v = byRow ? m[a * W + b] : m[b * W + a]; n = v ? n + 1 : 0; best = Math.max(best, n) } } return best }
    // 横过前臂量的宽（垂直于前臂走向的弦长），沿前臂轴线 p0→p1 的后半段取最大
    const across = (m, [x0, y0, x1, y1]) => { const L = Math.hypot(x1 - x0, y1 - y0); const ux = -(y1 - y0) / L; const uy = (x1 - x0) / L; let best = 0; for (let t = 0.4; t <= 1.0001; t += 0.02) { const cx = x0 + (x1 - x0) * t; const cy = y0 + (y1 - y0) * t; const hit = (k) => m[Math.round(cy + uy * k) * W + Math.round(cx + ux * k)]; if (!hit(0)) continue; let a = 0; while (hit(a + 1)) a++; let b = 0; while (hit(-b - 1)) b++; best = Math.max(best, a + b + 1) } return best }
    pawTipD = { across: { raised: across(body, P.pawAxis.raised), lower: across(pawMasks[0], P.pawAxis.lower) }, inscribed: { raised: maxR(body, P.pawTipRect.raised), lower: maxR(pawMasks[0], P.pawTipRect.lower) }, width: { raised: run(body, P.pawTipRect.raisedW, true), lower: run(pawMasks[0], P.pawTipRect.lowerW, false) }, raisedEllipse: P.pawTips[0].slice(2, 4).map((v) => 2 * v) }
    const gp = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 })
    const src = (extra) => `data:image/svg+xml;base64,${Buffer.from(svg.replace('</svg>', `<style>${extra}</style></svg>`)).toString('base64')}`
    await gp.setContent(`<body style="margin:0;background:#fff"><img id="a" src="${src('')}" width="800"><img id="b" src="${src('#shell-bottom path{fill:#f00}')}" width="800">`)
    bowlGap800 = await gp.evaluate(async () => {
      const get = async (id) => { const img = document.getElementById(id); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height } }
      const A = await get('a')
      const B = await get('b')
      const cols = []
      for (let x = 0; x < B.w; x++) {
        let top = -1
        for (let y = 0; y < B.h; y++) { const i = (y * B.w + x) * 4; if (B.d[i] > 200 && B.d[i + 1] < 80) { top = y; break } }
        if (top < 0) continue
        let y = top - 1 // 往上找第一个雾薄荷像素；中间（含两头抗锯齿的过渡像素）都算这道浅色
        while (y >= 0) { const i = (y * A.w + x) * 4; if (Math.abs(A.d[i] - 114) + Math.abs(A.d[i + 1] - 191) + Math.abs(A.d[i + 2] - 164) < 30) break; y-- }
        cols.push(top - y - 1)
      }
      const k = Math.floor(cols.length * 0.1) // 碗两头的圆角不算
      const mid = cols.slice(k, cols.length - k).sort((p, q) => p - q)
      return { min: mid[0], median: mid[Math.floor(mid.length / 2)], columns: mid.length }
    })
    await gp.close()
  }
  const nodes = { body: tBody.nodes, belly: tBelly.nodes, paws: tPaws.map((t) => t.nodes), water: tWater.nodes }
  // 第一轮头形照草图描，头宽就是草图蒙版量到的宽；第二轮头形是母版，头宽 = 母版耳到耳 × 缩放
  const headWfinal = P.masterHead ? f1(MASTER_HEAD_W * S) : headW
  const measure = {
    sketch: { eyeGap: f1(SK.gap), eyeLineDeg: f1(SK.deg), headW, headSpan, noseW: sketchNoseW, eyeGapPerHead: +(SK.gap / headW).toFixed(3), nosePerHead: +(sketchNoseW / headW).toFixed(3) },
    vector: { scaleFromMaster: +S.toFixed(4), eyeGap: f1(SK.gap), headW: headWfinal, noseW: f1(MASTER.noseW * S), eyeGapPerHead: +(SK.gap / headWfinal).toFixed(3), nosePerHead: +((MASTER.noseW * S) / headWfinal).toFixed(3) },
    master: { headW: f1(MASTER_HEAD_W), eyeGapPerHead: +(MASTER.gap / MASTER_HEAD_W).toFixed(3), nosePerHead: +(MASTER.noseW / MASTER_HEAD_W).toFixed(3) },
    objScale: +OBJ.toFixed(4),
    stoneScale: +(OBJ * st.scaleK).toFixed(4),
    nodes,
    viewBox: vb,
    bytes: svg.length,
    ...(pawTipD ? { pawTipD, bowlGap800 } : {}),
    ...(done ? { done: { clamScale: done.clamScale, clamBox: done.clamBox, clamBoxPerHead: done.clamBoxPerHead, viewBox: done.viewBox, bytes: done.bytes, gap: DONE_GAP } } : {}),
  }
  return { key, svg, sketch: SKETCH, headWUnits: headWfinal, vbW: vb[2], vbH: vb[3], measure, done }
}

// ————————————————————————————————— 跑 —————————————————————————————————
const keys = process.env.POSE ? [process.env.POSE] : R4 ? ['float'] : Object.keys(POSES) // 第四轮只出 L1 和完成
const res = {}
for (const k of keys) res[k] = await build(k)

if (R4 && res.float) {
  // compare.png：K2 第三轮 | 完成第四轮 | L1 第三轮，大图 400 宽，下面 96、48 宽小样
  const R3DIR = path.join(BRAND, 'image-review-2026-11-14/pose-round3')
  const cols = [
    { label: 'K2 第三轮（不再用）· pose-round3/otter-crack.svg', svg: readFileSync(path.join(R3DIR, 'otter-crack.svg'), 'utf8') },
    { label: '完成 第四轮 · otter-done.svg', svg: res.float.done.svg },
    { label: 'L1 第三轮 · pose-round3/otter-float.svg', svg: readFileSync(path.join(R3DIR, 'otter-float.svg'), 'utf8') },
  ]
  const html = `<style>body{margin:0;padding:24px;background:${COLOR.page};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#5A6C75}.r{display:flex;gap:14px}figure{margin:0;background:#fff;border-radius:8px;padding:12px;width:400px}figcaption{padding-top:8px}img{display:block}.s{display:flex;gap:20px;align-items:flex-end;margin-top:14px;color:#5A6C75;font-size:12px}</style><h1>仰躺姿势 · 第四轮：完成 = L1 身体 + 胸口开蛤</h1><p>对比稿 · 提案 · 单一来源。中间那张：身体照第三轮 L1 原样，石头换成定稿 clam-open.svg，蛤在爪子四周让出 ${DONE_GAP} 像素（草图坐标）的缝。大图 400 宽，下面 96、48 宽（96、48 两张按 deviceScaleFactor 2 截图，看的时候以 400 那张为准）。</p><div class="r">${cols.map((c) => `<figure><img src="${uriSvg(c.svg)}" width="400"><div class="s"><div><img src="${uriSvg(c.svg)}" width="96">96</div><div><img src="${uriSvg(c.svg)}" width="48">48</div></div><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`
  const pg = await browser.newPage({ viewport: { width: 1340, height: 600 }, deviceScaleFactor: 2 })
  await pg.setContent(html)
  await pg.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
  await pg.close()
  // small.png：完成和 L1（第四轮）各 96、48 宽，deviceScaleFactor 1（真像素）
  const smHtml = `<style>body{margin:0;padding:16px;background:#fff;font:12px/1.4 system-ui,sans-serif;color:#5A6C75}.r{display:flex;gap:24px;align-items:flex-end;margin-bottom:14px}img{display:block}</style>${[['otter-done.svg', res.float.done.svg], ['otter-float.svg', res.float.svg]].map(([n, sv]) => `<div class="r">${[96, 48].map((w) => `<div><img src="${uriSvg(sv)}" width="${w}"><div>${w}</div></div>`).join('')}<div>${n}</div></div>`).join('')}`
  const sm = await browser.newPage({ viewport: { width: 400, height: 160 }, deviceScaleFactor: 1 })
  await sm.setContent(smHtml)
  await sm.screenshot({ path: path.join(OUT, 'small.png'), fullPage: true })
  await sm.close()
}

if (keys.length === 2) {
  const A = [res.float, res.crack]
  // compare.png：草图 | 矢量
  const cmpHtml = `<style>body{margin:0;padding:24px;background:${COLOR.page};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#5A6C75}.r{display:flex;gap:14px;margin-bottom:14px}figure{margin:0;background:#fff;border-radius:8px;padding:12px}figcaption{padding-top:8px}img{display:block}</style><h1>仰躺姿势 · ${ROUND_CN}：照草图描</h1><p>对比稿 · 提案 · 单一来源。左：草图（图像生成）。右：矢量（${R3 ? '身体和后脚照草图描，头用头像母版，物件用定稿，举着的半片用 clam.svg 原样外形和两道纹、从外面看、壳口露一道雾白月牙，尾巴末端收圆头' : R2 ? '身体和后脚照草图描，头用头像母版，物件用定稿，举着的半片由 clam.svg 派生' : '身体照草图描，五官用头像母版，物件用定稿，后脚和尾巴重画'}，品牌色平涂）。</p>${A.map((r) => `<div class="r"><figure><img src="${uriPng(r.sketch)}" width="520" height="520"><figcaption>草图 ${path.basename(r.sketch)}</figcaption></figure><figure style="display:flex;flex-direction:column;justify-content:center"><img src="${uriSvg(r.svg)}" width="${Math.round((520 * r.vbW) / Math.max(r.vbW, r.vbH))}"><figcaption>矢量 ${POSES[r.key].out}</figcaption></figure></div>`).join('')}`
  const cmp = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })
  await cmp.setContent(cmpHtml)
  await cmp.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
  await cmp.close()

  // check-large.png：两张各 800 宽，旁边 otter-sit 同头宽
  // otter-sit 的头是头像母版整体缩放放进去的：头宽 = 母版耳到耳 × 那个 scale
  const sitScale = Number((SIT_SVG.match(/<g transform="translate\([^)]*\) scale\(([\d.]+)\)">/) || [])[1])
  if (!sitScale) throw new Error('otter-sit.svg 里找不到头像的缩放，文件可能改过')
  const sitHeadW = MASTER_HEAD_W * sitScale
  const largeHtml = `<style>body{margin:0;padding:24px;background:${COLOR.page};font:14px/1.5 system-ui,sans-serif;color:#1B2B33}.r{display:flex;gap:18px;align-items:flex-end;margin-bottom:18px}figure{margin:0;background:#fff;border-radius:8px;padding:12px}figcaption{padding-top:6px;color:#5A6C75}img{display:block}</style>${A.map((r) => {
    const headPx = (800 * r.headWUnits) / r.vbW
    const sitW = (headPx / sitHeadW) * 1024
    return `<div class="r"><figure><img src="${uriSvg(r.svg)}" width="800"><figcaption>${POSES[r.key].out} · 800 宽 · 头宽 ${Math.round(headPx)} 像素</figcaption></figure><figure><img src="${uriSvg(SIT_SVG)}" width="${Math.round(sitW)}"><figcaption>otter-sit.svg 同头宽</figcaption></figure></div>`
  }).join('')}`
  const lg = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
  await lg.setContent(largeHtml)
  await lg.screenshot({ path: path.join(OUT, 'check-large.png'), fullPage: true })
  await lg.close()

  // small.png：96、64、48 宽，deviceScaleFactor 1
  const smHtml = `<style>body{margin:0;padding:16px;background:#fff;font:12px/1.4 system-ui,sans-serif;color:#5A6C75}.r{display:flex;gap:24px;align-items:flex-end;margin-bottom:14px}img{display:block}</style>${A.map((r) => `<div class="r">${[96, 64, 48].map((w) => `<div><img src="${uriSvg(r.svg)}" width="${w}"><div>${w}</div></div>`).join('')}<div>${POSES[r.key].out}</div></div>`).join('')}`
  const sm = await browser.newPage({ viewport: { width: 520, height: 200 }, deviceScaleFactor: 1 })
  await sm.setContent(smHtml)
  await sm.screenshot({ path: path.join(OUT, 'small.png'), fullPage: true })
  await sm.close()
  for (const r of A) r.measure.sitHeadWUnits = f1(sitHeadW)
}
await browser.close()
console.log(JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, r]) => [k, r.measure])), null, 1))
void existsSync
