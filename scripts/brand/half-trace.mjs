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
// 第二轮（--round 2，默认）在上面这套上改五处，第一轮的做法原样留着（--round 1 复现第一轮）：
//   a. 描之前先把草图像素变形：脖子按坐姿量出来的肩线拉长（逐个宽度级别对齐坐姿「下巴往下多远到这个宽度」），
//      每一行再横向收到不比坐姿同一深度宽；草图水面以下照水面上 5 行往下补身体，直到新的水面。
//      新水面 = 头顶往下「头的可见高度 / 0.40」。
//   b. 肚皮在水面上方 0.1 头宽处收成圆底，肚皮底和水之间露一道雾薄荷；水带画在最前面，身体在水带后面接着往下。
//   c. 物件整形不切，画在爪子前面；只在爪子上按物件外形往外 7 像素让缝，爪子只托物件下沿两角。
//   d. 登录页：头上不切缝；水面在下巴下面一点，露一小截脖子；爪子取半身爪子的前一截，放在脖子宽度外面、
//      搭在水带上沿，画在水带前面。
//   e. states.png 只出 96 和 64 两档小图。
//
// 第三轮（--round 3）换路：不描 M2，直接从定稿坐姿 mascot/otter-sit.svg 裁出半身（见下面 round3() 的注释）。
//   身体、浅色肚皮、头的路径原样引用，只用 viewBox 和 clipPath 裁；物件塞在两只合着的前爪底下，
//   「爪子带」用 clipPath 把身体和肚皮重画一遍盖住物件上沿，物件不切。登录页出带爪尖、不带爪尖两张。
//   可选环境变量：HALF3_K_STONE / HALF3_K_SCALLOP / HALF3_K_CLAM（物件系数，默认 1.0 / 0.8 / 0.8）、
//   HALF3_TUCK（物件上沿塞进爪子底下的比例，默认 0.18）、HALF3_WATER（水面行，默认按最低的物件算）。
//   输出 half-round3/：otter-half.svg、state-searching/offer/not-found.svg、state-login.svg、state-login-nopaws.svg、
//   compare.png（第二轮 | 第三轮 | 坐姿原图，同头宽）、states.png。
//
// 用法：node scripts/brand/half-trace.mjs [--round 1|2|3]
//   可选环境变量：INVENTORY_CHROMIUM（chromium 路径）、HALF_OUT（输出目录，默认 half-round1 或 half-round2）、
//   HALF_SIGMA（平滑，默认 4）、HALF_EPS（抽稀，默认 0.45）、
//   HALF_HOLD_K（物件公共系数，默认 0.6）、HALF_HOLD_ANCHOR（第一轮：top | grip，默认 top）、
//   HALF_SPREAD（爪子外挪像素，第一轮默认 28，第二轮默认 0）、HALF_WATER_END（round | square，水带两端，默认 round）、
//   HALF_HEAD_SHARE（第二轮：头占可见高度，默认 0.40）、HALF_ROUND（同 --round）、HALF_DUMP（第二轮调试：变形后的像素存成这个 PNG）。
// 输出：design/brand-2026-10-13/image-review-2026-11-14/half-round1/ 或 half-round2/ 下的
//   otter-half.svg、state-searching.svg、state-offer.svg、state-not-found.svg、state-login.svg、
//   compare.png、states.png、with-sit.png（截图 deviceScaleFactor 2）。母版和物件文件不改。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const argRound = process.argv.indexOf('--round')
const ROUND = Number(argRound > 0 ? process.argv[argRound + 1] : process.env.HALF_ROUND || 2)
if (![1, 2, 3, 4].includes(ROUND)) throw new Error('--round 只能是 1、2、3 或 4')
const IS2 = ROUND === 2
const OUT = process.env.HALF_OUT ? path.resolve(process.env.HALF_OUT) : path.join(BRAND, `image-review-2026-11-14/half-round${ROUND}`)
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
if (ROUND === 3 || ROUND === 4) {
  await round3()
  await browser.close()
  process.exit(0)
}

// —— 第三轮：不描草图，直接从定稿坐姿 otter-sit.svg 裁出半身 ——
// 坐姿的路径原样引用（身体、浅色肚皮、头），只用 viewBox 和 clipPath 裁，不重描、不变形；坐姿的石头不画。
async function round3() {
  const R4 = ROUND === 4 // 第四轮：身体同第三轮；蛤少塞、物件和爪子之间留缝、下腹浅色调整、登录页只出不带爪尖
  const f1 = (n) => Math.round(n * 10) / 10
  const f2 = (n) => Math.round(n * 100) / 100
  const pathOf = (fill) => { const m = SIT.match(new RegExp(`<path d="([^"]+)" fill="${fill}"/>`)); if (!m) throw new Error(`坐姿里找不到 ${fill} 的路径，坐姿可能改过`); return m[1] }
  const BODY_D = pathOf('#72BFA4')
  const PALE_D = pathOf('#DDF1E8')
  const PALE_SUBS = PALE_D.split(/(?=M)/)
  if (PALE_SUBS.length !== 2) throw new Error('坐姿的浅色肚皮应该是两块（喉部、下腹）')
  const headM = SIT.match(/<g transform="translate\(([\d.-]+) ([\d.-]+)\) scale\(([\d.]+)\)">[\s\S]*<\/g>(?=\s*<\/svg>)/)
  const HEAD_G = headM[0]
  const [SX, SY, SS] = [Number(headM[1]), Number(headM[2]), Number(headM[3])]
  // 量：头形外框、物件外框
  const page = await browser.newPage()
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${HEAD_SHAPE}</svg>`)
  const hb = await page.evaluate(() => { const r = document.querySelector('path').getBBox(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const objects = {}
  for (const name of ['stone-round', 'scallop', 'clam']) {
    const inner = OBJ(name).replace(/^[\s\S]*?<title>[^<]*<\/title>/, '').replace(/<\/svg>\s*$/, '').trim()
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`)
    const box = await page.evaluate(() => { const bs = [...document.querySelectorAll('path')].map((e) => e.getBBox()); const x0 = Math.min(...bs.map((b) => b.x)); const y0 = Math.min(...bs.map((b) => b.y)); const x1 = Math.max(...bs.map((b) => b.x + b.width)); const y1 = Math.max(...bs.map((b) => b.y + b.height)); return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } })
    // 外形（第一条路径）最高的那一点：蛤的壳喙
    box.peak = await page.evaluate(() => { const e = document.querySelector('path'); const L = e.getTotalLength(); let b = null; for (let i = 0; i <= 800; i++) { const q = e.getPointAtLength((L * i) / 800); if (!b || q.y < b.y) b = { x: q.x, y: q.y } } return b })
    objects[name] = { inner, box }
  }
  await page.close()
  const HW = hb.w * SS // 坐姿里的头宽（含耳朵）
  const HEAD_TOP = SY + hb.y * SS
  const CHIN = SY + MUZZLE_BOTTOM * SS
  const HEAD_VIS = (HEAD_CLIP_Y - hb.y) * SS
  // 栅格化（1024 见方，坐姿坐标 1:1）
  const W3 = 1024
  const maskOf3 = async (inner) => {
    const r = await pixelsOf(`<img id="i" src="${uriSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W3}" height="${W3}" viewBox="0 0 ${W3} ${W3}">${inner}</svg>`)}">`, W3, W3)
    const m = new Uint8Array(W3 * W3)
    for (let i = 0; i < m.length; i++) m[i] = r.px[i * 4 + 3] > 127 ? 1 : 0
    return m
  }
  const bodyM = await maskOf3(`<path d="${BODY_D}"/>`)
  const upM = await maskOf3(`<path d="${PALE_SUBS[0]}"/>`)
  const lowM = await maskOf3(`<path d="${PALE_SUBS[1]}"/>`)
  const span = (m, y) => { let x0 = -1; let x1 = -1; for (let x = 0; x < W3; x++) if (m[y * W3 + x]) { if (x0 < 0) x0 = x; x1 = x } return [x0, x1] }
  const colTop = (m, x) => { for (let y = 0; y < W3; y++) if (m[y * W3 + x]) return y; return W3 }
  const colBottom = (m, x) => { for (let y = W3 - 1; y >= 0; y--) if (m[y * W3 + x]) return y; return -1 }
  // 两只前爪合着的地方：喉部浅色最低的那一点（两爪中间的 V 尖）
  const [ux0, ux1] = [Math.min(...[...Array(W3).keys()].filter((x) => colBottom(upM, x) >= 0)), Math.max(...[...Array(W3).keys()].filter((x) => colBottom(upM, x) >= 0))]
  let NOTCH_X = ux0
  for (let x = ux0; x <= ux1; x++) if (colBottom(upM, x) > colBottom(upM, NOTCH_X)) NOTCH_X = x
  const NOTCH_Y = colBottom(upM, NOTCH_X)
  // 爪子带的下沿 = 下腹浅色的上沿（被两只爪子压出两个弧）
  const LOW_TOP = Math.min(...[...Array(W3).keys()].map((x) => colTop(lowM, x)))
  let PAW_BOTTOM = 0
  for (let x = NOTCH_X - 70; x <= NOTCH_X + 70; x++) { const t = colTop(lowM, x); if (t < W3) PAW_BOTTOM = Math.max(PAW_BOTTOM, t) }

  // 物件横向中线：两爪合着的地方（V 尖）和爪子下面那块下腹浅色的中线取中间。坐姿微侧，V 尖比下腹浅色中线偏右，
  // 全对 V 尖的话扇贝右边会出浅色、压到雾薄荷身体上（雾薄荷扇贝和身体连成一片）
  const [lp0, lp1] = span(lowM, PAW_BOTTOM + 40)
  const HOLD_X = Math.round((NOTCH_X + (lp0 + lp1) / 2) / 2)
  // 物件：上沿塞进爪子底下 TUCK × 物件高
  const UNIT = HW / 240
  const K3 = { 'stone-round': Number(process.env.HALF3_K_STONE || 1.0), scallop: Number(process.env.HALF3_K_SCALLOP || 0.8), clam: Number(process.env.HALF3_K_CLAM || (R4 ? 0.9 : 0.8)) }
  // 第四轮：物件和爪子之间留的缝（坐姿坐标像素，目测取的；400 宽下约 3 像素）
  const GAP4 = Number(process.env.HALF4_GAP || 4)
  const NOTCH_PALE_TOP = colTop(lowM, NOTCH_X) // 两爪中间那道缝里，下腹浅色往上顶到的地方
  let CLAM_DX = 0
  const CLAM_LIFT = Number(process.env.HALF4_CLAM_LIFT || 6)
  const TUCK = Number(process.env.HALF3_TUCK || 0.18)
  const placed = {}
  const heldOf = (name) => {
    const { inner, box } = objects[name]
    const s = UNIT * K3[name]
    const w = box.w * s; const h = box.h * s
    let top = PAW_BOTTOM - TUCK * h
    let tx = HOLD_X - (box.x0 + box.w / 2) * s
    if (R4 && name === 'clam') {
      // 第四轮的蛤：壳喙放在两爪中间那道缝附近（缝往左 CLAM_DX 像素），壳喙顶点放在那一列下腹浅色上沿往下（缝宽 + 2），
      // 壳喙整个露在爪子下面，两肩塞进爪弧底下一点
      const ux = NOTCH_X + CLAM_DX
      tx = ux - box.peak.x * s
      top = colTop(lowM, ux) + GAP4 + 2 - (box.peak.y - box.y0) * s
    }
    const ty = top - box.y0 * s
    placed[name] = { k: K3[name], w: f1(w), h: f1(h), top: f1(top), bottom: f1(top + h), x: [f1(tx + box.x0 * s), f1(tx + box.x1 * s)], hiddenPx: f1(PAW_BOTTOM - top) }
    return `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${s.toFixed(4)})">\n${inner.replace(/^\s+/gm, '  ')}\n</g>`
  }
  for (const k of Object.keys(K3)) heldOf(k)
  // 物件栅格：算露出来的比例（爪子带里被盖住的不算），第四轮还用来定蛤的系数
  const PAW_REGION = (i) => { const x = i % W3; const y = Math.floor(i / W3); return bodyM[i] && !lowM[i] && y >= NOTCH_Y + 4 && y <= PAW_BOTTOM + 4 && x >= 0 }
  const objMask = async (name) => maskOf3(heldOf(name))
  const visibleShare = async (name) => { const m = await objMask(name); let a = 0; let v = 0; for (let i = 0; i < m.length; i++) if (m[i]) { a++; if (!PAW_REGION(i)) v++ } return v / a }
  // 第四轮：蛤的系数从 0.9 往下试，直到爪子带以下的部分离下腹浅色左右边都有 GAP4 + 3 以上（不碰浅色块边缘）
  // 壳喙的横向位置从缝（0）往左每 5 像素试到 30，每个位置找不碰浅色边的最大系数，取系数最大的那个位置
  let clamTries = []
  if (R4) {
    const m = GAP4 + 3
    const kMax = K3.clam
    const fits = async () => {
      const om = await objMask('clam')
      for (let i = 0; i < om.length; i++) {
        if (!om[i] || Math.floor(i / W3) <= PAW_BOTTOM + 4) continue
        for (const d of [-m, m]) if (!lowM[i + d]) return false
      }
      return true
    }
    let best = { k: 0, dx: 0 }
    for (let dx = 0; dx >= -30; dx -= 5) {
      CLAM_DX = dx
      let got = 0
      for (let k = kMax; k >= 0.6; k = Math.round((k - 0.02) * 100) / 100) { K3.clam = k; if (await fits()) { got = k; break } }
      const lift = PAW_BOTTOM - colTop(lowM, NOTCH_X + dx) // 壳喙比爪弧底高多少：要有 CLAM_LIFT 以上，两肩才塞得进爪子底下
      clamTries.push([dx, got, lift])
      if (lift >= CLAM_LIFT && got > best.k) best = { k: got, dx }
    }
    CLAM_DX = best.dx; K3.clam = best.k
    heldOf('clam')
  }
  const visible = {}
  for (const k of Object.keys(K3)) visible[k] = f2(await visibleShare(k))
  const lowestObj = Math.max(...Object.values(placed).map((p) => p.bottom))

  // 水面：默认放在最低的物件下沿往下 0.06 头宽（下腹浅色在物件下面还露一截）再加 0.1 头宽毛色带
  const BAND = Math.round(0.1 * HW)
  // 第四轮：下腹浅色在物件下面露的那一截少一点、圆底平一点，不那么像托着物件的碗
  let BELOW = Number(process.env.HALF4_BELOW || (R4 ? 0.03 : 0.06))
  const RR_K = Number(process.env.HALF4_RR_K || (R4 ? 0.5 : 0.75))
  let WY = 0; let BELLY_BOTTOM = 0
  // 下腹浅色收圆底：横半轴 = 起点那一行浅色的半宽，竖半轴 = RR_K 倍横半轴（第二、三轮 0.75）
  let RR = 0; let A = 0; let BCX = 0; let Y0 = 0
  const shapeBelly = () => {
    WY = Number(process.env.HALF3_WATER || Math.round(lowestObj + BELOW * HW + BAND))
    BELLY_BOTTOM = WY - BAND
    RR = 0
    for (let it = 0; it < 3; it++) { const [x0, x1] = span(lowM, BELLY_BOTTOM - RR); A = (x1 - x0 + 1) / 2; BCX = (x0 + x1 + 1) / 2; RR = Math.round(RR_K * A) }
    Y0 = BELLY_BOTTOM - RR
  }
  shapeBelly()
  // 第四轮：三样物件在爪子带以下的部分都要落在收过圆底的下腹浅色里、离边 GAP4 + 3 以上，不够就把水面往下挪 0.01 头宽再试
  const bellyAt = (x, y) => lowM[y * W3 + x] && (y < Y0 || (((x + 0.5 - BCX) / A) ** 2 + ((y + 0.5 - Y0) / RR) ** 2 <= 1 && y <= BELLY_BOTTOM))
  const objMasks = {}
  if (R4) for (const k of Object.keys(K3)) objMasks[k] = await objMask(k)
  const inBelly = () => {
    const m = GAP4 + 3
    for (const om of Object.values(objMasks)) for (let i = 0; i < om.length; i++) {
      if (!om[i]) continue
      const x = i % W3; const y = Math.floor(i / W3)
      if (y <= PAW_BOTTOM + 4) continue
      for (const [dx, dy] of [[-m, 0], [m, 0], [0, m], [-m * 0.7, m * 0.7], [m * 0.7, m * 0.7]]) if (!bellyAt(Math.round(x + dx), Math.round(y + dy))) return false
    }
    return true
  }
  if (R4 && !process.env.HALF3_WATER) while (!inBelly() && BELOW < 0.3) { BELOW = Math.round((BELOW + 0.01) * 100) / 100; shapeBelly() }
  // 水带：高和两端超出身体的量都照第二轮按头宽折算（84、46 草图像素 ÷ 589.5 头宽）
  const WH = Math.round((84 / 589.5) * HW)
  const OVERHANG = Math.round((46 / 589.5) * HW)
  let bx0 = W3; let bx1 = 0
  for (let y = Math.round(CHIN); y < WY; y++) { const [a, b] = span(bodyM, y); if (a >= 0) { bx0 = Math.min(bx0, a); bx1 = Math.max(bx1, b) } }
  const WATER = { x: bx0 - OVERHANG, w: bx1 - bx0 + 1 + 2 * OVERHANG }
  const PAD = Math.round((28 / 589.5) * HW)
  const VB = { x: WATER.x - PAD, y: Math.floor(HEAD_TOP) - PAD, w: WATER.w + 2 * PAD }
  VB.h = WY + WH + PAD - VB.y
  const vbStr = (v) => `${v.x} ${v.y} ${v.w} ${v.h}`
  const water = (y) => `<rect id="water" x="${WATER.x}" y="${y}" width="${WATER.w}" height="${WH}" rx="${WH / 2}" fill="${COLOR.pale}"/>`
  // 尾巴：坐姿尾巴在左下。查水面以上身体左边线有没有往外拐（每 10 行左边最多往外 6 像素算顺的背线）
  const leftEdge = []
  for (let y = Math.round(CHIN); y < WY; y += 10) leftEdge.push([y, span(bodyM, y)[0]])

  // 爪子带：矩形减去下腹浅色。矩形上沿放在喉部 V 尖下面 4 像素（这一行全是雾薄荷，重画的身体压在身体上看不出接缝；
  // 放到喉部浅色里会在浅色上留一道细线），下沿到最深的爪弧往下 4。物件上沿都在这个矩形上沿以下。
  const BAND_RECT = { x: bx0, y: NOTCH_Y + 4, w: bx1 - bx0 + 1, h: PAW_BOTTOM + 4 - (NOTCH_Y + 4) }
  if (Math.min(...Object.values(placed).map((p) => p.top)) < BAND_RECT.y) throw new Error('物件上沿高过爪子带矩形，会露在喉部浅色上')
  const rectD = (r) => `M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`
  const CANVAS = { x: 0, y: 0, w: W3, h: W3 }
  const NOTE3 = R4 ? '<!-- 对比稿，不是母版：半身像第四轮，身体同第三轮（原样引用定稿坐姿 mascot/otter-sit.svg 的路径，只用 viewBox 和 clipPath 裁）；物件是 mascot/objects/ 的定稿形原样缩放，塞在两只合着的前爪底下，和爪子之间留一道浅色细缝（scripts/brand/half-trace.mjs 第四轮模式）。提案 · 单一来源。 -->' : '<!-- 对比稿，不是母版：半身像第三轮，身体、浅色肚皮、头原样引用定稿坐姿 mascot/otter-sit.svg 的路径（不重描、不变形），只用 viewBox 和 clipPath 裁；物件是 mascot/objects/ 的定稿形原样缩放（scripts/brand/half-trace.mjs 第三轮模式）。提案 · 单一来源。 -->'
  const STATES3 = {
    half: { title: '獭獭 · 半身像（底稿，手里空着）', held: null },
    searching: { title: '獭獭 · 半身像 · 找题中（抱着圆墩石头）', held: 'stone-round' },
    offer: { title: '獭獭 · 半身像 · 递出结果（抱着扇贝）', held: 'scallop' },
    'not-found': { title: '獭獭 · 半身像 · 没找到（抱着合着的蛤）', held: 'clam' },
  }
  const figure = (clipY) => `<clipPath id="half-above-water"><rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${clipY - VB.y}"/></clipPath>\n<clipPath id="half-belly-round"><rect x="0" y="0" width="${W3}" height="${Y0}"/><ellipse cx="${f1(BCX)}" cy="${Y0}" rx="${f1(A)}" ry="${RR}"/></clipPath>`
  const build3 = (key) => {
    const st = STATES3[key]
    const held = st.held ? heldOf(st.held) : ''
    // 爪子带 = 矩形 ∩（下腹浅色以外）。两个 clip 套着用：外层矩形，里层「整张画布减去下腹浅色」（evenodd）
    // 第四轮的缝：扇贝、蛤（雾薄荷）和雾薄荷爪子相接处，下腹浅色沿着爪弧往里让 GAP4，盖在物件上。
    // 做法：下腹浅色里「离浅色边缘不到 GAP4 的那一圈」= 浅色 ∩（浅色外面往 12 个方向各挪 GAP4 的并集），
    // 只在爪子带附近那一小块矩形里画，画成浅色，夹在物件和爪子带中间。物件路径不切，缝是盖上去的同一种浅色（不是描边色）。
    const gapOn = R4 && st.held && st.held !== 'stone-round'
    const gr = { x: BAND_RECT.x, y: BAND_RECT.y, w: BAND_RECT.w, h: PAW_BOTTOM + GAP4 + 3 - BAND_RECT.y }
    const dirs = [...Array(12).keys()].map((k) => [f2(GAP4 * Math.cos((k * Math.PI) / 6)), f2(GAP4 * Math.sin((k * Math.PI) / 6))])
    const gap = gapOn ? `\n<defs><path id="half-low-ring" clip-rule="evenodd" d="${rectD(CANVAS)}${PALE_SUBS[1]}"/></defs>\n<clipPath id="half-low-pale"><path d="${PALE_SUBS[1]}"/></clipPath>\n${dirs.map(([dx, dy], k) => `<clipPath id="half-gap-${k}"><use href="#half-low-ring" clip-rule="evenodd" transform="translate(${dx} ${dy})"/></clipPath>`).join('\n')}\n<g id="paw-gap" clip-path="url(#half-low-pale)">${dirs.map((_, k) => `<path d="${rectD(gr)}" fill="${COLOR.pale}" clip-path="url(#half-gap-${k})"/>`).join('')}</g>` : ''
    const band = gap + (st.held ? `\n<clipPath id="half-paw-band"><path d="${rectD(BAND_RECT)}"/></clipPath>\n<clipPath id="half-not-low-pale"><path clip-rule="evenodd" d="${rectD(CANVAS)}${PALE_SUBS[1]}"/></clipPath>\n<g id="paw-band" clip-path="url(#half-paw-band)"><g clip-path="url(#half-not-low-pale)"><use href="#body"/><use href="#belly"/></g></g>` : '')
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vbStr(VB)}">\n${NOTE3}\n<title>${st.title}</title>\n${figure(WY + WH / 2)}\n<g id="figure" clip-path="url(#half-above-water)">\n<path id="body" d="${BODY_D}" fill="${COLOR.mint}"/>\n<path id="belly" d="${PALE_D}" fill="${COLOR.pale}" clip-path="url(#half-belly-round)"/>\n${HEAD_G}\n<g id="held">${held ? `\n${held}\n` : ''}</g>${band}\n</g>\n${water(WY)}\n</svg>\n`
  }
  // 登录页：水面在下巴切线下 0.07 头宽；爪尖 = 坐姿前爪那一截（矩形减去两块浅色），上沿平齐水带上沿
  const LWY = Math.round(CHIN + 0.07 * HW)
  const VBL = { ...VB, h: LWY + WH + PAD - VB.y }
  const PAW_TOP = NOTCH_Y + 3
  const PAW_GAP = Math.round(0.03 * HW)
  const [nx0, nx1] = span(bodyM, LWY)
  const pawSide = (side) => {
    const r = side === 'left' ? { x: NOTCH_X - 68, y: PAW_TOP, w: 68, h: PAW_BOTTOM + 3 - PAW_TOP } : { x: NOTCH_X, y: PAW_TOP, w: 68, h: PAW_BOTTOM + 3 - PAW_TOP }
    const dx = side === 'left' ? nx0 - PAW_GAP - (r.x + r.w) : nx1 + PAW_GAP - r.x
    const dy = LWY - PAW_TOP
    return { r, dx, dy, svg: `<clipPath id="half-paw-${side}"><path d="${rectD(r)}"/></clipPath>\n<g id="paw-${side}" transform="translate(${dx} ${dy})"><g clip-path="url(#half-paw-${side})"><use href="#body" clip-path="url(#half-not-pale)"/></g></g>` }
  }
  const pl = pawSide('left'); const pr = pawSide('right')
  const buildLogin = (paws) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vbStr(VBL)}">\n${NOTE3}\n<title>獭獭 · 半身像 · 登录页探头（${paws ? '从水里探头，两只爪尖搭在水带上沿' : '从水里探头，只露头和脖子'}）</title>\n${figure(LWY + WH / 2)}\n<g id="figure" clip-path="url(#half-above-water)">\n<path id="body" d="${BODY_D}" fill="${COLOR.mint}"/>\n<path id="belly" d="${PALE_D}" fill="${COLOR.pale}" clip-path="url(#half-belly-round)"/>\n${HEAD_G}\n</g>\n${water(LWY)}${paws ? `\n<clipPath id="half-not-pale"><path clip-rule="evenodd" d="${rectD(CANVAS)}${PALE_D}"/></clipPath>\n<g id="paws">\n${pl.svg}\n${pr.svg}\n</g>` : ''}\n</svg>\n`
  const FILES3 = { half: 'otter-half.svg', searching: 'state-searching.svg', offer: 'state-offer.svg', 'not-found': 'state-not-found.svg' }
  const svgs = {}
  for (const k of Object.keys(FILES3)) { svgs[k] = build3(k); writeFileSync(path.join(OUT, FILES3[k]), svgs[k]) }
  if (R4) { // 第四轮：登录页只出不带爪尖那张，文件名用 state-login.svg
    svgs.login = buildLogin(false); writeFileSync(path.join(OUT, 'state-login.svg'), svgs.login)
  } else {
    svgs.login = buildLogin(true); writeFileSync(path.join(OUT, 'state-login.svg'), svgs.login)
    svgs.loginBare = buildLogin(false); writeFileSync(path.join(OUT, 'state-login-nopaws.svg'), svgs.loginBare)
  }

  // 截图
  const shot = async (html, file, width) => {
    const p = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 2 })
    await p.setContent(html)
    await p.screenshot({ path: path.join(OUT, file), fullPage: true })
    await p.close()
  }
  const CSS = `body{margin:0;padding:28px;background:${COLOR.page};font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-start}figure{margin:0;background:#fff;border-radius:8px;padding:14px}figcaption{padding-top:10px}`
  // 同头宽并排：每张图按自己 viewBox 和头的缩放折算，头宽 220 像素，眼睛对在同一条线
  const HEAD_PX = 220
  const R2_FILE = path.join(BRAND, 'image-review-2026-11-14/half-round2/otter-half.svg')
  const r2 = readFileSync(R2_FILE, 'utf8')
  const placeOf = (svg) => {
    const v = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
    const t = svg.match(/<g (?:id="head" )?transform="translate\(([\d.-]+) ([\d.-]+)\) scale\(([\d.]+)\)">/)
    const s = Number(t[3]); const ty = Number(t[2])
    const width = (HEAD_PX * v[2]) / (hb.w * s)
    return { width, eye: ((ty + MASTER_EYE.cy * s - v[1]) * width) / v[2] }
  }
  if (R4) {
    const R3D = path.join(BRAND, 'image-review-2026-11-14/half-round3')
    const old3 = (f) => readFileSync(path.join(R3D, f), 'utf8')
    const pair = (label, f) => `<figure><img src="${uriSvg(old3(f))}" width="400"><figcaption>第三轮 · ${label}</figcaption></figure><figure><img src="${uriSvg(svgs[f === 'state-offer.svg' ? 'offer' : 'not-found'])}" width="400"><figcaption>第四轮 · ${label}</figcaption></figure>`
    await shot(`<style>${CSS}</style><h1>半身像 · 第三轮 | 第四轮</h1><p>对比稿 · 提案。身体同一份。第四轮：蛤少塞（整只露出来，壳喙在两爪中间那道缝${CLAM_DX ? `往左 ${-CLAM_DX} 像素` : ''}的地方露在爪子下面，系数 ${K3.clam}），扇贝、蛤和爪子之间留一道 ${GAP4} 像素（坐姿坐标）的浅色细缝，下腹浅色圆底放平一点。</p><div class="g">${pair('递出结果 · 扇贝', 'state-offer.svg')}</div><div class="g" style="margin-top:16px">${pair('没找到 · 合着的蛤', 'state-not-found.svg')}</div>`, 'compare.png', 920)
    const cell4 = (sv, label) => `<figure style="width:400px"><img src="${uriSvg(sv)}" width="400"><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end"><img src="${uriSvg(sv)}" width="96"><img src="${uriSvg(sv)}" width="64"></div><figcaption>${label} · 400 / 96 / 64 像素宽</figcaption></figure>`
    await shot(`<style>${CSS}.g{flex-wrap:wrap}</style><h1>半身像 · 四种状态 · 第四轮</h1><p>对比稿 · 提案。身体是定稿坐姿裁出来的同一份（同第三轮）；只换手里的东西。物件是定稿形，按 240 = 头宽，系数：石头 ${K3['stone-round']}、扇贝 ${K3.scallop}、蛤 ${K3.clam}；扇贝、蛤和爪子之间留浅色细缝，石头不留。</p><div class="g">${cell4(svgs.searching, '找题中 · 圆墩石头')}${cell4(svgs.offer, '递出结果 · 扇贝')}${cell4(svgs['not-found'], '没找到 · 合着的蛤')}${cell4(svgs.login, '登录页探头')}</div>`, 'states.png', 1760)
  } else {
    const trio = [['第二轮 · half-round2/otter-half.svg', r2], ['第三轮 · otter-half.svg', svgs.half], ['坐姿原图 · mascot/otter-sit.svg', SIT]].map(([c, s]) => ({ c, s, ...placeOf(s) }))
    const topEye = Math.max(...trio.map((t) => t.eye))
    await shot(`<style>${CSS}</style><h1>半身像 · 第三轮：从定稿坐姿裁</h1><p>对比稿 · 提案。三张同头宽（${HEAD_PX} 像素，含耳朵），眼睛对在同一条线。左：第二轮（描 M2 再变形）。中：第三轮（坐姿路径原样，裁到下腹浅色上部，水带盖住裁口）。右：坐姿原图。</p><div class="g">${trio.map((t) => `<figure><img src="${uriSvg(t.s)}" width="${f1(t.width)}" style="margin-top:${f1(topEye - t.eye)}px"><figcaption>${t.c}</figcaption></figure>`).join('')}</div>`, 'compare.png', 1700)
    const cell = (s, label) => `<figure style="width:400px"><img src="${uriSvg(s)}" width="400"><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end"><img src="${uriSvg(s)}" width="96"><img src="${uriSvg(s)}" width="64"></div><figcaption>${label} · 400 / 96 / 64 像素宽</figcaption></figure>`
    await shot(`<style>${CSS}.g{flex-wrap:wrap}</style><h1>半身像 · 四种状态 · 第三轮</h1><p>对比稿 · 提案。身体是定稿坐姿裁出来的同一份；只换手里的东西。物件是定稿形，按 240 = 头宽，系数：石头 ${K3['stone-round']}、扇贝 ${K3.scallop}、蛤 ${K3.clam}；物件上沿塞在两只合着的前爪底下（爪子带盖在物件上，物件不切）。登录页出了两种：带爪尖、不带爪尖。</p><div class="g">${cell(svgs.searching, '找题中 · 圆墩石头')}${cell(svgs.offer, '递出结果 · 扇贝')}${cell(svgs['not-found'], '没找到 · 合着的蛤')}${cell(svgs.login, '登录页探头 · 带爪尖')}${cell(svgs.loginBare, '登录页探头 · 不带爪尖')}</div>`, 'states.png', 1760)
  }

  console.log(JSON.stringify({
    headWidth: f1(HW), headTop: f1(HEAD_TOP), chin: f1(CHIN), headVisH: f1(HEAD_VIS),
    waterY: WY, headOfVisible: f2(HEAD_VIS / (WY - HEAD_TOP)), visibleH: f1(WY - HEAD_TOP),
    viewBox: vbStr(VB), viewBoxLogin: vbStr(VBL), bellyBottom: BELLY_BOTTOM, band: BAND, bellyRound: { cx: f1(BCX), y0: Y0, a: f1(A), rr: RR },
    notch: [NOTCH_X, NOTCH_Y], holdX: HOLD_X, lowPaleAtHold: [lp0, lp1], lowPaleTop: LOW_TOP, pawBottom: PAW_BOTTOM, bandRect: BAND_RECT,
    placed, visible, clamTries, clamDx: CLAM_DX, gap: R4 ? GAP4 : null, notchPaleTop: NOTCH_PALE_TOP, rrK: RR_K, below: BELOW, water: { ...WATER, h: WH }, leftEdge,
    login: { waterY: LWY, neckPx: f1(LWY - CHIN), neck: [nx0, nx1], pawL: { dx: pl.dx, dy: pl.dy, rect: pl.r }, pawR: { dx: pr.dx, dy: pr.dy, rect: pr.r } },
    bytes: Object.fromEntries(Object.entries(svgs).map(([k, s]) => [k, s.length])),
  }, null, 1))
}

let { W, H, px } = await pixelsOf(`<img id="i" src="${uriPng(SKETCH)}">`, 1024, 1024)
let N = W * H

// —— 2. 按颜色分类（中心色从草图上量的，目测取点） ——
const at = (x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]]
const CENTER = { bg: at(40, 40), mint: at(250, 700), pale: at(512, 780), muzzle: at(330, 420), rock: at(512, 600), ink: [26, 29, 23] }
const NAMES = Object.keys(CENTER)
const K = Object.fromEntries(NAMES.map((n, k) => [n, k]))
function classify() {
  const out = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    let best = 0
    let bd = Infinity
    for (let k = 0; k < NAMES.length; k++) {
      const c = CENTER[NAMES[k]]
      const d = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2
      if (d < bd) { bd = d; best = k }
    }
    out[i] = best
  }
  return out
}
let cls = classify()
// 水带：左边空白处那一列第一次变成浅色的那一行
let WATER_Y = 0
for (let y = H - 1; y > 0; y--) { const [r] = at(30, y); if (r > 240) { WATER_Y = y + 1; break } }
const WATER_SKETCH = WATER_Y
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
const headBox = await (async () => {
  const p = await browser.newPage()
  await p.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${HEAD_SHAPE}</svg>`)
  const b = await p.evaluate(() => { const r = document.querySelector('path').getBBox(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await p.close()
  return b
})()
const HEAD_W = headBox.w * S // 草图像素里的头宽（含耳朵）
const CHIN_Y = toSketchY(MUZZLE_BOTTOM) // 下巴切线（母版脸斑下沿）
const headTop = Math.floor(toSketchY(headBox.y))
const headVisH = (HEAD_CLIP_Y - headBox.y) * S // 头顶到母版裁切线（下巴下面）
const SIT_S = Number((SIT.match(/<g transform="translate\([^)]*\) scale\(([\d.]+)\)">/) || [])[1])
const SIT_TY = Number((SIT.match(/<g transform="translate\([\d.-]+ ([\d.-]+)\) scale/) || [])[1])

// —— 2b. 第二轮：照坐姿把脖子拉长、肩宽收窄，水面往下挪（在像素上变形，后面照常描） ——
let WARP = null
if (IS2) {
  const HEAD_SHARE = Number(process.env.HALF_HEAD_SHARE || 0.4)
  // 坐姿剪影：otter-sit.svg 按 1024 栅格化，不透明且不是石头色（#6E828C）的像素；深度从坐姿下巴切线往下量，单位坐姿头宽
  const sit = await pixelsOf(`<img id="i" src="${uriSvg(SIT.replace('<svg ', '<svg width="1024" height="1024" '))}">`, 1024, 1024)
  const sitFig = (i) => sit.px[i * 4 + 3] > 127 && !(Math.abs(sit.px[i * 4] - 110) < 14 && Math.abs(sit.px[i * 4 + 1] - 130) < 14 && Math.abs(sit.px[i * 4 + 2] - 140) < 14)
  const sitChin = SIT_TY + MUZZLE_BOTTOM * SIT_S
  const sitHW = headBox.w * SIT_S
  const span = (fig, w, y) => { let x0 = -1; let x1 = -1; for (let x = 0; x < w; x++) if (fig(y * w + x)) { if (x0 < 0) x0 = x; x1 = x } return x0 < 0 ? 0 : x1 - x0 + 1 }
  const sitProf = [] // [深度, 宽]，都按头宽
  for (let y = Math.ceil(sitChin); y < 1024; y++) { const d = (y - sitChin) / sitHW; if (d > 0.75) break; sitProf.push([d, span(sitFig, 1024, y) / sitHW]) }
  const halfFig = (i) => cls[i] !== K.bg && cls[i] !== K.rock
  const halfProf = []
  for (let y = Math.ceil(CHIN_Y); y < WATER_SKETCH - 5; y++) halfProf.push([(y - CHIN_Y) / HEAD_W, span(halfFig, W, y) / HEAD_W])
  const firstAt = (prof, lv) => { for (const [d, w] of prof) if (d >= 0.04 && w >= lv) return d; return NaN }
  // 逐个宽度级别对齐：草图在深度 dh 宽到 lv，坐姿在深度 ds 宽到 lv，就把草图的 dh 挪到 ds。0.04 头宽以上（下巴根）不动。
  const pts = [[0.04, 0.04]]
  for (let lv = 0.74; lv <= 0.9001; lv += 0.01) {
    const dh = firstAt(halfProf, lv); const ds = firstAt(sitProf, lv)
    const last = pts[pts.length - 1]
    if (dh > last[0] + 0.002 && ds > last[1] + 0.002) pts.push([dh, ds])
  }
  const [dh90, ds90] = pts[pts.length - 1]
  const finv = (d) => { // 变形后的深度 → 草图里的深度
    if (d <= 0.04) return d
    for (let k = 1; k < pts.length; k++) if (d <= pts[k][1]) { const [a0, b0] = pts[k - 1]; const [a1, b1] = pts[k]; return a0 + ((d - b0) / (b1 - b0)) * (a1 - a0) }
    return d - (ds90 - dh90)
  }
  // 宽度上限：坐姿在同一深度的宽（往下取累计最大，不让下面比上面窄），再封顶在坐姿 0.75 头宽以内的最宽处
  const sitMax = Math.max(...sitProf.map((p) => p[1]))
  const sitCum = []
  { let m = 0; for (const [d, w] of sitProf) { m = Math.max(m, w); sitCum.push([d, m]) } }
  const sitEnv = (d) => { if (d <= sitCum[0][0]) return sitCum[0][1]; for (const [dd, w] of sitCum) if (dd >= d) return w; return sitMax }
  const yw = headTop + headVisH / HEAD_SHARE // 新水面
  const H2 = Math.ceil(yw) + 84 + 120
  const srcRow = new Float64Array(H2)
  const scaleRaw = new Float64Array(H2).fill(1)
  const srcWidth = (ys) => span(halfFig, W, ys)
  for (let y = 0; y < H2; y++) {
    const d = (y - CHIN_Y) / HEAD_W
    let ys = d <= 0.04 ? y : CHIN_Y + finv(d) * HEAD_W
    ys = Math.min(ys, WATER_SKETCH - 5) // 草图水面以下：照水面上 5 行往下补
    srcRow[y] = ys
    if (d > 0.04) { const w = srcWidth(Math.round(ys)); if (w) scaleRaw[y] = Math.min(1, (sitEnv(d) * HEAD_W) / w) }
  }
  // 横向系数先取 ±25 行内的最小值，再高斯平滑（σ 12 行），所以平滑后不会比坐姿宽
  const scale = new Float64Array(H2)
  const mn = scaleRaw.map((_, y) => { let m = 1; for (let k = -25; k <= 25; k++) { const v = scaleRaw[Math.min(H2 - 1, Math.max(0, y + k))]; if (v < m) m = v } return m })
  for (let y = 0; y < H2; y++) { let a = 0; let s = 0; for (let k = -36; k <= 36; k++) { const w = Math.exp(-(k * k) / 288); a += mn[Math.min(H2 - 1, Math.max(0, y + k))] * w; s += w } scale[y] = a / s }
  // 按分类后的标签变形：目标像素反算回草图的小数坐标，周围四个像素按双线性权重给各自的类投票，取票最多的类。
  // 这样拉长和收窄后的边是顺的，不会出现最近邻那种台阶，也不会混出中间色。
  const CX = SK_EYE.cx
  const out = new Uint8Array(W * H2)
  const vote = new Float64Array(NAMES.length)
  for (let y = 0; y < H2; y++) {
    const fy = Math.min(srcRow[y], WATER_SKETCH - 5)
    const y0 = Math.floor(fy); const ty = fy - y0; const y1 = Math.min(y0 + 1, WATER_SKETCH - 5)
    for (let x = 0; x < W; x++) {
      const fx = CX + (x + 0.5 - CX) / scale[y] - 0.5
      const x0 = Math.floor(fx); const tx = fx - x0
      vote.fill(0)
      for (const [xx, yy, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x0 + 1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x0 + 1, y1, tx * ty]]) {
        vote[xx < 0 || xx >= W ? K.bg : cls[yy * W + xx]] += w
      }
      let best = 0
      for (let k = 1; k < NAMES.length; k++) if (vote[k] > vote[best]) best = k
      out[y * W + x] = best
    }
  }
  WARP = { sitProf, halfProf, pts, dh90, ds90, sitMax, yw, scale, srcRow, sitChin, sitHW }
  H = H2; N = W * H
  cls = out
  px = Buffer.alloc(N * 4) // 变形后不再读原色，只留给调试图
  for (let i = 0; i < N; i++) { const c = CENTER[NAMES[cls[i]]]; px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255 }
  WATER_Y = Math.round(yw)
  if (process.env.HALF_DUMP) { // 调试：把变形后的像素存成 PNG
    const p = await browser.newPage({ viewport: { width: W, height: H } })
    const b64 = px.toString('base64')
    await p.evaluate(({ b64, W, H }) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const bin = atob(b64); const d = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) d[i] = bin.charCodeAt(i); c.getContext('2d').putImageData(new ImageData(d, W, H), 0, 0); document.body.style.margin = 0; document.body.appendChild(c) }, { b64, W, H })
    await p.screenshot({ path: process.env.HALF_DUMP, fullPage: true })
    await p.close()
  }
}

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
// 第二轮：草图胳膊和身体交界处的小台阶在拉长以后更显眼，先闭运算（21 像素见方）填掉凹口，再按高斯收顺
if (IS2) body = largest(roundOff(close(body, 10), 6))
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
// 取面积最大的两块（第二轮肚皮上沿那道弧拉长以后，弧下面会多出一条雾薄荷细条，不算爪子）
const pawParts = components(and(pawGrown, aboveWater)).list.filter((c) => c.area > 3000).sort((a, b) => b.area - a.area).slice(0, 2).sort((a, b) => a.cx - b.cx)
if (pawParts.length !== 2) throw new Error(`爪子应该是两块，量到 ${pawParts.length} 块`)
const pawLab = components(and(pawGrown, aboveWater)).lab
// 两只爪子各往外平移 SPREAD 像素：草图里两拳之间只有一指宽，扇贝、蛤夹在中间几乎全被挡住。
// 平移后爪子朝外那一头仍落在胳膊的雾薄荷上，腾出来的地方是补齐过的肚皮，身体剪影不动。
const SPREAD = Number(process.env.HALF_SPREAD ?? (IS2 ? 0 : 28))
const shiftX = (m, dx) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = (i % W) + dx; if (x >= 0 && x < W) o[i + dx] = 1 } return o }
const pawL = shiftX(pawLab.map((v) => (v === pawParts[0].id ? 1 : 0)), -SPREAD)
const pawR = shiftX(pawLab.map((v) => (v === pawParts[1].id ? 1 : 0)), SPREAD)
for (const [k, d] of [[0, -SPREAD], [1, SPREAD]]) { pawParts[k].minX += d; pawParts[k].maxX += d; pawParts[k].cx += d }
// 肚皮 = 露出来的浅色 + 被爪子和石头挡住的那一片（只在这些地方用补齐的范围，肚皮上沿那道弧照草图）
const bellyRaw = or(and(pale0, maskOf((_, i) => rowOf(i) < WATER_Y - 5)), and(bellyEnv, or(morph(or(pawGrown, rock), 3, false), maskOf((_, i) => rowOf(i) >= WATER_Y - 5))))
// 收一下肚皮上沿两个尖角（第二轮肚皮上沿被拉长成平顶，角更方，收得多一点：σ 14）
let belly = largest(and(roundOff(close(bellyRaw, 2), IS2 ? 14 : 3), body))
// 第二轮：肚皮在水面上方 BAND（0.1 头宽）处收成圆底。最下面 RR 行按半个椭圆收：
// 横半轴 = 肚皮在圆底起点那一行的半宽，竖半轴 RR = 横半轴的 0.75 倍（目测取的，圆而不尖）
const BAND = Math.round(0.1 * HEAD_W)
const BELLY_BOTTOM = WATER_Y - BAND
let BELLY_RR = 0
if (IS2) {
  const rowSpan = (m, y) => { let x0 = -1; let x1 = -1; for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x0 < 0) x0 = x; x1 = x } return [x0, x1] }
  let a = 0
  let cx = 0
  for (let it = 0; it < 3; it++) { // 起点那一行取决于 RR，迭代几次就稳了
    const [x0, x1] = rowSpan(belly, BELLY_BOTTOM - BELLY_RR)
    a = (x1 - x0 + 1) / 2; cx = (x0 + x1 + 1) / 2
    BELLY_RR = Math.round(0.75 * a)
  }
  const y0 = BELLY_BOTTOM - BELLY_RR
  belly = belly.map((v, i) => { if (!v) return 0; const y = rowOf(i); if (y < y0) return 1; if (y > BELLY_BOTTOM) return 0; const x = (i % W) + 0.5; return ((x - cx) / a) ** 2 + ((y + 0.5 - y0) / BELLY_RR) ** 2 <= 1 ? 1 : 0 })
}
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
// 第二轮：水面在下巴切线下面 LOGIN_NECK（0.07 头宽），露一小截脖子
const LOGIN_NECK = Math.round(0.07 * HEAD_W)
const LOGIN_WATER_Y = IS2 ? Math.round(chinY + LOGIN_NECK) : BELLY_TOP - 2 // 第一轮：水面抬到肚皮上沿，只露头和一截脖子
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
// 第二轮的爪子：半身爪子朝里那一头的一截（离最里面那一点 FIST_R 以内），切口本来就是圆弧，只轻轻收一下角（σ 7）；
// 横向挪到脖子宽度外面（离脖子边 LOGIN_GAP），纵向让下沿压进水带 LOGIN_DIP、上面露在水带上沿以上
const FIST_R = Math.round(0.13 * HEAD_W)
const LOGIN_GAP = Math.round(0.03 * HEAD_W)
const LOGIN_DIP_K = 0.55 // 爪子高度里压进水带的比例
function loginFist(m, side) {
  let ti = -1
  for (let i = 0; i < N; i++) if (m[i]) { const x = i % W; if (ti < 0 || (side === 'left' ? x > ti % W : x < ti % W)) ti = i }
  const tx = ti % W; const ty = rowOf(ti)
  const seg = largest(roundOff(m.map((v, i) => (v && Math.hypot((i % W) - tx, rowOf(i) - ty) <= FIST_R ? 1 : 0)), 7))
  const box = components(seg).list[0]
  // 脖子在水面这一行的左右边
  // 脖子和头在爪子所占的那几行里的左右边（爪子不能压在头上，否则雾薄荷连成一片）
  const h = box.maxY - box.minY + 1
  const dy = Math.round(LOGIN_WATER_Y + LOGIN_DIP_K * h - box.maxY)
  let n0 = W; let n1 = -1
  for (let y = box.minY + dy; y <= Math.min(LOGIN_WATER_Y, box.maxY + dy); y++) for (let x = 0; x < W; x++) if (bodyOnly[y * W + x] || headMask[y * W + x]) { if (x < n0) n0 = x; if (x > n1) n1 = x }
  const dx = side === 'left' ? n0 - LOGIN_GAP - box.maxX - 1 : n1 + LOGIN_GAP - box.minX + 1
  const o = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (seg[i]) { const x = (i % W) + dx; const y = rowOf(i) + dy; if (x >= 0 && x < W && y >= 0 && y < H) o[y * W + x] = 1 }
  return o
}
const tipL = IS2 ? loginFist(pawL, 'left') : tipOf(pawL, pawParts[0], 'right')
const tipR = IS2 ? loginFist(pawR, 'right') : tipOf(pawR, pawParts[1], 'left')
const tTipL = trace(tipL)
const tTipR = trace(tipR)
const tTipGap = trace(morph(or(tipL, tipR), GAP, false))

// —— 6. 量头宽（含耳朵）、物件外框 ——
const measurePage = await browser.newPage()
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
// 第二轮：每样东西可以单独定系数（HOLD_K2），物件下沿两角落在拳头上：
// 取物件下沿两角（物件宽的 ±CORNER 处）正下方两只爪子的最高点，物件下沿压进爪子 OVER × 物件高。
const HOLD_K2 = { 'stone-round': HOLD_K, scallop: HOLD_K, clam: HOLD_K }
const CORNER = 0.38
const OVER = 0.22
const pawsAll = or(pawL, pawR)
const pawTopAt = (x) => { x = Math.round(x); for (let y = 0; y < H; y++) if (pawsAll[y * W + x]) return y; return H }
const placed = {}
function heldGroup(name) {
  const { inner, box } = objects[name]
  const s = UNIT * (IS2 ? HOLD_K2[name] : HOLD_K)
  const cx = box.x0 + box.w / 2
  const tx = HOLD_X - cx * s
  let top = HOLD_ANCHOR === "top" ? BELLY_TOP_MID + HOLD_TOP : Math.max(BELLY_TOP_MID + HOLD_TOP, GRIP_Y - (box.h * s) / 2)
  if (IS2) {
    const w = box.w * s; const h = box.h * s
    const rest = Math.max(pawTopAt(HOLD_X - CORNER * w), pawTopAt(HOLD_X + CORNER * w))
    top = rest + OVER * h - h
    placed[name] = { k: IS2 ? HOLD_K2[name] : HOLD_K, w: f1(w), h: f1(h), top: f1(top), bottom: f1(top + h), rest }
  }
  const ty = top - box.y0 * s
  return `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${s.toFixed(4)})">\n${inner.replace(/^\s+/gm, '  ')}\n</g>`
}

// —— 7. 拼图 ——
const PAD = 28
const WATER_END = process.env.HALF_WATER_END || 'round'
const bodyBox = components(bodyOnly).list[0]
const WATER = { x: bodyBox.minX - 46, w: bodyBox.maxX - bodyBox.minX + 92, h: 84 }
const waterRect = (y) => `<rect id="water" x="${WATER.x}" y="${y}" width="${WATER.w}" height="${WATER.h}" rx="${WATER_END === 'round' ? WATER.h / 2 : 0}" fill="${COLOR.pale}"/>`
const VB ={ x: WATER.x - PAD, y: headTop - PAD, w: WATER.w + 2 * PAD, h: WATER_Y + WATER.h + PAD - (headTop - PAD) }
const VB_LOGIN = { ...VB, h: LOGIN_WATER_Y + WATER.h + PAD - VB.y }
const vbStr = (v) => `${v.x} ${v.y} ${v.w} ${v.h}`
const headXf = `translate(${f1(TX)} ${f1(TY)}) scale(${S.toFixed(4)})`
const head = `<g id="head" transform="${headXf}"><clipPath id="half-chin"><rect x="-200" y="-200" width="1500" height="${HEAD_CLIP_Y + 200}"/></clipPath><g clip-path="url(#half-chin)">${HEAD_SHAPE}</g>${MUZZLE}${EYES}${NOSE}${DOTS}</g>`
const NOTE = IS2
  ? '<!-- 对比稿，不是母版：半身像第二轮，身体、肚皮、爪子照 M2 半身草图的轮廓描，描之前按坐姿把脖子拉长、肩宽收窄、身体补到新水面（scripts/brand/half-trace.mjs 第二轮模式），头是头像母版原样缩放，物件是 mascot/objects/ 的定稿形原样缩放。提案 · 单一来源。 -->'
  : '<!-- 对比稿，不是母版：半身像第一轮，身体、肚皮、爪子照 M2 半身草图的轮廓描（scripts/brand/half-trace.mjs），头是头像母版原样缩放，物件是 mascot/objects/ 的定稿形原样缩放。提案 · 单一来源。 -->'
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
    if (IS2) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(v)}">\n${NOTE}\n<title>${st.title}</title>\n<clipPath id="half-above-water"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${clipH}"/></clipPath>\n<g id="figure" clip-path="url(#half-above-water)">\n<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n</g>\n${waterRect(LOGIN_WATER_Y)}\n<g id="paws">\n<path id="paw-left" d="${tTipL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tTipR.d}" fill="${COLOR.mint}"/>\n</g>\n</svg>\n`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(v)}">\n${NOTE}\n<title>${st.title}</title>\n<clipPath id="half-above-water"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${clipH}"/></clipPath>\n<mask id="half-tip-gap" maskUnits="userSpaceOnUse" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="#fff"/><path d="${tTipGap.d}" fill="#000"/></mask>\n<g id="figure" clip-path="url(#half-above-water)">\n<g mask="url(#half-tip-gap)">\n<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n</g>\n</g>\n${waterRect(LOGIN_WATER_Y)}\n<g id="paws">\n<path id="paw-left" d="${tTipL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tTipR.d}" fill="${COLOR.mint}"/>\n</g>\n</svg>\n`
  }
  const held = st.held ? heldGroup(st.held) : ''
  if (IS2) {
    const g = gap2[key]
    const mask = g ? `<mask id="half-paw-gap" maskUnits="userSpaceOnUse" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}"><rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#fff"/><path d="${g.gapD}" fill="#000"/>${g.crumbD ? `<path d="${g.crumbD}" fill="#000"/>` : ''}</mask>\n` : ''
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(VB)}">\n${NOTE}\n<title>${st.title}</title>\n${mask}<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n<g id="paws"${g ? ' mask="url(#half-paw-gap)"' : ''}>\n<path id="paw-left" d="${tPawL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tPawR.d}" fill="${COLOR.mint}"/>\n</g>\n<g id="held">${held ? `\n${held}\n` : ''}</g>\n${waterRect(WATER_Y)}\n</svg>\n`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbStr(VB)}">\n${NOTE}\n<title>${st.title}</title>\n<mask id="half-paw-gap" maskUnits="userSpaceOnUse" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}"><rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#fff"/><path d="${tGap.d}" fill="#000"/>${crumbs ? `<path d="${crumbs}" fill="#000"/>` : ''}</mask>\n<path id="body" d="${tBody.d}" fill="${COLOR.mint}"/>\n<path id="belly" d="${tBelly.d}" fill="${COLOR.pale}"/>\n${head}\n<g id="held" mask="url(#half-paw-gap)">${held ? `\n${held}\n` : ''}</g>\n<g id="paws">\n<path id="paw-left" d="${tPawL.d}" fill="${COLOR.mint}"/>\n<path id="paw-right" d="${tPawR.d}" fill="${COLOR.mint}"/>\n</g>\n${waterRect(WATER_Y)}\n</svg>\n`
}
const FILES = { half: 'otter-half.svg', searching: 'state-searching.svg', offer: 'state-offer.svg', 'not-found': 'state-not-found.svg', login: 'state-login.svg' }
// 物件被缝切开以后，爪子外侧可能剩下几条细碎的边角（一两个像素宽）。把每张状态图的物件单独栅格化，
// 面积小于 CRUMB 的碎块往外扩 3 像素，描成路径并进蒙版里一起挖掉。物件本身的路径不动。
const CRUMB = 900
const crumbsOf = {}
// 第二轮：物件整形不动，缝只切在爪子上。物件单独栅格化 → 往外扩 GAP → 描成蒙版路径挖爪子；
// 爪子被挖以后剩下的碎块（面积小于 CRUMB，或开运算去掉的、贴着缝的尖角）扩 3 像素一起挖掉。
const gap2 = {}
if (IS2) for (const k of Object.keys(FILES)) {
  if (!STATES[k].held) continue
  const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${heldGroup(STATES[k].held)}</svg>`
  const r = await pixelsOf(`<body style="margin:0"><img id="i" src="${uriSvg(big)}">`, W, H)
  const obj = new Uint8Array(N)
  for (let i = 0; i < N; i++) obj[i] = r.px[i * 4 + 3] > 127 ? 1 : 0
  const gapM = morph(obj, GAP, false)
  const cut = and(pawsAll, not(gapM))
  const resid = and(cut, not(open(cut, 4)))
  const near = morph(gapM, 3, false)
  const { lab, list } = components(resid)
  const hit = new Set()
  for (let i = 0; i < N; i++) if (lab[i] && near[i]) hit.add(lab[i])
  const okIds = new Set(list.filter((c) => c.area >= 40 && hit.has(c.id)).map((c) => c.id))
  const small = or(keep(cut, (c) => c.area < CRUMB), lab.map((v) => (okIds.has(v) ? 1 : 0)))
  const tc = trace(morph(small, 3, false), 1, 4)
  gap2[k] = { gapD: trace(gapM, 2, 50).d, crumbD: tc.d }
  crumbsOf[k] = { d: '', pieces: tc.loops }
}
for (const k of Object.keys(FILES)) {
  if (IS2 || !STATES[k].held) continue
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
const cmpNote = IS2
  ? `右：两张叠在一起（矢量半透明）。第二轮在描之前把草图变了形：脖子照坐姿拉长、肩和胳膊收到不比坐姿宽、身体往下补到新水面，所以叠看里下巴以下整体错开，这是有意的。`
  : `右：两张叠在一起（矢量半透明），同一个坐标；两只爪子各往外挪了 ${SPREAD} 像素，叠看里能看到错开。`
const SKB = IS2 ? Math.max(1024, VB.y + VB.h) : 1024 // 第二轮矢量比草图长，框子跟着加高
await shot(`<style>${CSS}.ov{height:${f1(SKB * sk)}px}</style><h1>半身像 · 第${IS2 ? '二' : '一'}轮：照 M2 半身草图描</h1><p>对比稿 · 提案。左：M2 草图（图像生成）。中：描出来的底稿，头换成头像母版，颜色换成品牌色，手里空着。${cmpNote}</p><div class="g"><figure><img src="${uriPng(SKETCH)}" width="560" height="560"><figcaption>M2 草图</figcaption></figure><figure><div class="ov">${vbImg(svgs.half, VB)}</div><figcaption>otter-half.svg</figcaption></figure><figure><div class="ov"><img src="${uriPng(SKETCH)}" style="left:0;top:0" width="560" height="560"><div style="opacity:.55">${vbImg(svgs.half, VB)}</div></div><figcaption>叠看</figcaption></figure></div>`, 'compare.png', 1840)
const SIZES = IS2 ? [96, 64] : [96, 64, 48]
const cell = (k, label) => `<figure style="width:400px"><img src="${uriSvg(svgs[k])}" width="400"><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end">${SIZES.map((s) => `<img src="${uriSvg(svgs[k])}" width="${s}">`).join('')}</div><figcaption>${label} · 400 / ${SIZES.join(' / ')} 像素宽</figcaption></figure>`
const kNote = IS2 ? `各自的系数：石头 ${HOLD_K2['stone-round']}、扇贝 ${HOLD_K2.scallop}、蛤 ${HOLD_K2.clam}；物件画在爪子前面，缝只切在爪子上` : `再统一乘 ${HOLD_K}`
await shot(`<style>${CSS}.g{align-items:flex-start}</style><h1>半身像 · 四种状态${IS2 ? ' · 第二轮' : ''}</h1><p>对比稿 · 提案。身体同一份；只换手里的东西。物件是定稿形，按 240 = 头宽，${kNote}。</p><div class="g">${cell('searching', '找题中 · 圆墩石头')}${cell('offer', '递出结果 · 扇贝')}${cell('not-found', '没找到 · 合着的蛤')}${cell('login', '登录页探头 · 空手')}</div>`, 'states.png', 1840)
// 同头宽并排：坐姿的头缩放 0.3261（otter-sit.svg 里头的 transform），viewBox 1024
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
  round2: IS2 ? (() => {
    const at = (prof, d) => { let best = prof[0]; for (const p of prof) if (Math.abs(p[0] - d) < Math.abs(best[0] - d)) best = p; return f2(best[1]) }
    const halfNow = (d) => f2(widthAt(Math.round(CHIN_Y + d * HEAD_W)) / HEAD_W)
    const cx = Math.round(HOLD_X)
    let bb = 0
    for (let y = 0; y < H; y++) if (belly[y * W + cx]) bb = y
    const tipBox = (m) => { const c = components(m).list[0]; return { x: [c.minX, c.maxX], y: [c.minY, c.maxY], w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 } }
    return {
      matchPoints: WARP.pts.map(([a, b]) => [f2(a), f2(b)]), d90: { sketch: f2(WARP.dh90), sit: f2(WARP.ds90), insertedPx: f1((WARP.ds90 - WARP.dh90) * HEAD_W) },
      widthByDepth: Object.fromEntries([0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((d) => [d, { sit: at(WARP.sitProf, d), sketch: at(WARP.halfProf, d), half: halfNow(d) }])),
      sitMaxW: f2(WARP.sitMax), minScale: f2(Math.min(...WARP.scale)),
      bellyBottomAtCenter: bb, furBandPx: WATER_Y - 1 - bb, furBandOverHead: f2((WATER_Y - 1 - bb) / HEAD_W), bellyRR: BELLY_RR,
      placed, loginNeckPx: f1(LOGIN_WATER_Y - chinY), fistR: FIST_R, tipL: tipBox(tipL), tipR: tipBox(tipR),
    }
  })() : null,
  nodes: { body: tBody.nodes, belly: tBelly.nodes, pawL: tPawL.nodes, pawR: tPawR.nodes, gap: tGap.nodes, tipL: tTipL.nodes, tipR: tTipR.nodes },
  loops: { body: tBody.loops, belly: tBelly.loops, pawL: tPawL.loops, pawR: tPawR.loops },
  bytes: Object.fromEntries(Object.entries(svgs).map(([k, s]) => [k, s.length])),
}, null, 1))
