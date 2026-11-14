#!/usr/bin/env node
// 小尺寸品牌图标换新脸（2026-11-14，照 BRAND.md 第 99、102 条「都跟」）。提案 · 单一来源。
// 重画七张还是旧脸的逐格画版，并出对照图：
//   logo/mark-16、mark-16-mono、mark-32、mark-32-mono；logo/mint/mark-16；mascot/small/otter-head-16、-32。
//   logo/mint/mark-32 已是新脸（第 102 条，取 A），不动；本脚本用它的改法当 32 格的标准，并自检能复现它。
// 改法（坐标是各文件 SVG 的 (列, 行)，从 0 数）：
//   32 格：同 mint/mark-32 的 A。眼睛 2×2 → 3×3，往外、往上各加一格；脸斑下沿缺口改两行台阶
//          （下 4 格、上 2 格），两瓣外下角各削一格；∴ 保留。墨色版颜色对应：绿 → 墨、雾白 → 透明。
//   16 格：照第 98 条③，眼睛 1×2 不加大，眼睛正下方那一格脸斑改成头的颜色（墨色版补墨）；不带 F（16 格做不出台阶）。
// 「旧」一律取 git HEAD 里的文件，所以可以反复跑，结果一样。
//
// 用法：node scripts/brand/small-icons-v3.mjs            改写上面七张 SVG 和同名 PNG，出对照图和 measure.json
//       node scripts/brand/small-icons-v3.mjs --dry-run  不写品牌文件，只出对照图（新图用内存里的结果）
// 浏览器：INVENTORY_CHROMIUM 指定 chromium，默认 /opt/pw-browsers/chromium。playwright 从 app/ 的依赖里取。
// 输出：design/brand-2026-10-13/image-review-2026-11-14/small-icons-v3/compare.png、measure.json
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = 'design/brand-2026-10-13'
const OUT = path.join(ROOT, B, 'image-review-2026-11-14/small-icons-v3')
const DRY = process.argv.includes('--dry-run')
mkdirSync(OUT, { recursive: true })
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const git = (rev, p) => execFileSync('git', ['show', `${rev}:${p}`], { cwd: ROOT, maxBuffer: 1 << 24 })
const svgUrl = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')
const pngUrl = (b) => 'data:image/png;base64,' + Buffer.from(b).toString('base64')

const INK = '#191D18', MINT = '#72BFA4', MIST = '#F2FAF6', BAMBOO = '#3D8F70', CREAM = '#F6EFE0', BIB = '#DDF1E8'

// ---- 格子 ----
function parse(svg) {
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number)
  const g = Array.from({ length: h }, () => Array(w).fill(null))
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9A-Fa-f]{6})"\/>/g)) {
    const [x, y, rw, rh] = m.slice(1, 5).map(Number)
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) g[j][i] = m[5].toUpperCase()
  }
  return g
}
const clone = (g) => g.map((r) => r.slice())
function write(g, title) {
  let s = `<title>${title}</title>`
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x]; let e = x; while (e < row.length && row[e] === c) e++
      if (c) s += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${c}"/>`
      x = e
    }
  })
  return s
}
// 改一格；from 写错就停，免得改到不该改的地方
function apply(g, edits) {
  const out = clone(g), log = []
  for (const [x, y, from, to] of edits) {
    if (out[y][x] !== from) throw new Error(`(${x},${y}) 应是 ${from}，实际 ${out[y][x]}`)
    out[y][x] = to; log.push({ x, y, from, to })
  }
  return { g: out, log }
}

// 32 格的改法，坐标按 logo/mark-32 的 SVG；dy 是行偏移。face=头色，muz=脸斑色（墨色版：face=墨，muz=透明，眼=透明）
const EYE_ADD = [[8, 13], [9, 13], [10, 13], [8, 14], [8, 15], [21, 13], [22, 13], [23, 13], [23, 14], [23, 15]]
const F_CELLS = [[15, 23], [16, 23], [7, 24], [24, 24]]
const edits32 = ({ face, muz, eye }, dy = 0) => [
  ...EYE_ADD.map(([x, y]) => [x, y + dy, face, eye]),
  ...F_CELLS.map(([x, y]) => [x, y + dy, muz, face]),
]
// 16 格：眼睛正下方那一格（logo 坐标 (4,8)(11,8)）
const edits16 = ({ face, muz }, dy = 0) => [[4, 8 + dy, muz, face], [11, 8 + dy, muz, face]]

const JOBS = [
  { file: 'logo/mark-32.svg', big: 'logo/mark.svg', kind: 'mark', edits: edits32({ face: BAMBOO, muz: CREAM, eye: INK }),
    note: '2026-11-14 换成新脸（BRAND.md 第 99、102 条）：照 logo/mark.svg，格子和已换好的 logo/mint/mark-32 一样（第 102 条取 A），颜色仍是这张的竹青、暖米白、墨。为 32 格做的：眼睛 2×2 → 3×3，往外、往上各加一格（大图缩到 32 宽眼径约 2.3 像素，取整成 3 格，到鼻子、脸斑的净空不变）；脸斑下沿的 F 画成两行台阶缺口（下 4 格、上 2 格），两瓣外下角各削一格；∴ 保留，每点 1 格。只按原尺寸显示' },
  { file: 'logo/mark-32-mono.svg', big: 'logo/mark-mono.svg', kind: 'mark', edits: edits32({ face: INK, muz: null, eye: null }),
    note: '2026-11-14 换成新脸（BRAND.md 第 99、102 条）：照 logo/mark-mono.svg，格子同 logo/mint/mark-32（第 102 条取 A），墨一色，眼睛和脸斑挖空。为 32 格做的：眼洞 2×2 → 3×3，往外、往上各加一格；脸斑洞下沿的 F 画成两行台阶（下 4 格、上 2 格补墨），两瓣外下角各补一格墨；鼻子仍去掉最上一行，和头之间留一行缝；∴ 保留' },
  { file: 'logo/mark-16.svg', big: 'logo/mark.svg', kind: 'mark', edits: edits16({ face: BAMBOO, muz: CREAM }),
    note: '2026-11-14 换成新脸（BRAND.md 第 98、99 条）：照 logo/mark.svg，颜色仍是竹青、暖米白、墨。为 16 格做的：照第 98 条③，眼睛 1×2 不加大，眼睛正下方那一格脸斑改成竹青，让眼睛离开脸斑；F 不画（缺口只有 2 格宽，做不出台阶）；不画 ∴。只按原尺寸显示' },
  { file: 'logo/mark-16-mono.svg', big: 'logo/mark-mono.svg', kind: 'mark', edits: edits16({ face: INK, muz: null }),
    note: '2026-11-14 换成新脸（BRAND.md 第 98、99 条）：照 logo/mark-mono.svg，墨一色。为 16 格做的：眼洞 1×2 不加大；眼洞正下方那一格补墨，让眼洞和脸斑洞分开（原来连成一个洞）；F 不画；不画 ∴；鼻子仍往下挪一行' },
  { file: 'logo/mint/mark-16.svg', big: 'logo/mint/mark.svg', kind: 'mark', edits: edits16({ face: MINT, muz: MIST }),
    note: '2026-11-14 换成新脸（BRAND.md 第 98、99 条）：照 logo/mint/mark.svg。为 16 格做的：照第 98 条③，眼睛 1×2 不加大，眼睛正下方那一格脸斑改成雾薄荷，让眼睛离开脸斑；F 不画（缺口只有 2 格宽，做不出台阶）；不画 ∴。只按原尺寸显示' },
  { file: 'mascot/small/otter-head-16.svg', big: 'mascot/otter-head.svg', kind: 'head', edits: edits16({ face: MINT, muz: MIST }, -1),
    note: '2026-11-14 换成新脸（BRAND.md 第 98、99 条）：照 mascot/otter-head.svg。为 16 格做的：照第 98 条③，眼睛 1×2 不加大，眼睛正下方那一格脸斑改成雾薄荷，让眼睛离开脸斑；F 不画（缺口只有 2 格宽，做不出台阶）；不画 ∴；围兜、下巴不动' },
  { file: 'mascot/small/otter-head-32.svg', big: 'mascot/otter-head.svg', kind: 'head', edits: edits32({ face: MINT, muz: MIST, eye: INK }, -3),
    note: '2026-11-14 换成新脸（BRAND.md 第 99、102 条）：照 mascot/otter-head.svg，脸的格子和 logo/mint/mark-32 一样（第 102 条取 A），整体高 3 行。为 32 格做的：眼睛 2×2 → 3×3，往外、往上各加一格；脸斑下沿的 F 画成两行台阶缺口（下 4 格、上 2 格），两瓣外下角各削一格；∴ 保留；下巴和围兜不动' },
]
const COLORS = { 'logo/mark-32.svg': [BAMBOO, CREAM], 'logo/mark-16.svg': [BAMBOO, CREAM], 'logo/mark-32-mono.svg': [INK, null], 'logo/mark-16-mono.svg': [INK, null] }
for (const j of JOBS) j.colors = COLORS[j.file] || [MINT, MIST]

// ---- 自检：同一套 32 格改法能不能从 mint/mark-32 改之前复现现在的 mint/mark-32 ----
{
  const before = parse(git('e415a0739^', `${B}/logo/mint/mark-32.svg`).toString())
  const now = parse(git('HEAD', `${B}/logo/mint/mark-32.svg`).toString())
  const { g } = apply(before, edits32({ face: MINT, muz: MIST, eye: INK }))
  if (JSON.stringify(g) !== JSON.stringify(now)) throw new Error('32 格改法复现不出 mint/mark-32')
  console.log('自检：32 格改法复现 logo/mint/mark-32 ✓')
}

// ---- 净空（隔几格；0 = 贴着，含斜角）----
function blobs(g, pred) {
  const H = g.length, W = g[0].length, seen = new Set(), out = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!pred(g[y][x]) || seen.has(y * W + x)) continue
    const st = [[x, y]], cells = []; seen.add(y * W + x)
    while (st.length) {
      const [cx, cy] = st.pop(); cells.push([cx, cy])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(ny * W + nx) || !pred(g[ny][nx])) continue
        seen.add(ny * W + nx); st.push([nx, ny])
      }
    }
    out.push(cells)
  }
  return out
}
const gap = (a, b) => Math.min(...a.flatMap(([x, y]) => b.map(([u, v]) => Math.max(Math.abs(x - u), Math.abs(y - v))))) - 1
function measure(g, face, muz) {
  // 墨色版：眼睛和脸斑是透明的洞（被墨围住）；彩色版：墨块里最大的是鼻子，两块最靠上的 2–9 格是眼睛
  const H = g.length
  if (face === INK) {
    const holes = blobs(g, (c) => c === null).filter((b) => !b.some(([x, y]) => x === 0 || y === 0 || x === g[0].length - 1 || y === H - 1))
    const inks = blobs(g, (c) => c === INK).sort((a, b) => b.length - a.length)
    return { holes: holes.map((b) => b.length), inkBlobs: inks.map((b) => b.length) }
  }
  const ink = blobs(g, (c) => c === INK).sort((a, b) => b.length - a.length)
  const nose = ink[0], eyes = ink.filter((b) => b !== nose && b.length >= 2).sort((a, b) => a[0][1] - b[0][1]).slice(0, 2)
  const mz = blobs(g, (c) => c === muz).sort((a, b) => b.length - a.length)[0]
  const out = blobs(g, (c) => c === null).sort((a, b) => b.length - a.length)[0]
  return {
    eyeCells: eyes.map((e) => e.length), muzzleCells: mz.length,
    eyeToNose: eyes.map((e) => gap(e, nose)), eyeToMuzzle: eyes.map((e) => gap(e, mz)), eyeToOutside: eyes.map((e) => gap(e, out)),
  }
}

// ---- 跑 ----
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const lab = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage()
await lab.setContent('<!doctype html><body></body>')
// SVG 在 chromium 里按原尺寸画到 canvas 上，读回格子并出 PNG
const raster = (u, w, h) => lab.evaluate(async ([u, w, h]) => {
  const img = new Image(); img.src = u; await img.decode()
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h)
  return { data: Array.from(x.getImageData(0, 0, w, h).data), png: c.toDataURL('image/png') }
}, [u, w, h])
const hex = (d, i) => d[i + 3] === 0 ? null : '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('').toUpperCase()

const results = []
for (const job of JOBS) {
  const oldSvg = git('HEAD', `${B}/${job.file}`).toString()
  const oldPng = git('HEAD', `${B}/${job.file.replace(/\.svg$/, '.png')}`)
  const head = oldSvg.match(/^<svg[^>]*>\n/)[0], oldComment = oldSvg.match(/<!--[\s\S]*?-->/)[0]
  const title = oldSvg.match(/<title>(.*?)<\/title>/)[1], tail = oldSvg.match(/(\n?)<\/svg>\s*$/)[1]
  const og = parse(oldSvg), { g, log } = apply(og, job.edits)
  const newSvg = `${head}<!-- ${job.note} -->\n${oldComment}\n${write(g, title)}${tail}</svg>\n`
  const W = g[0].length, H = g.length
  const r = await raster(svgUrl(newSvg), W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = hex(r.data, (y * W + x) * 4)
    if (c !== g[y][x] || (c && r.data[(y * W + x) * 4 + 3] !== 255)) throw new Error(`${job.file} (${x},${y}) 渲染成 ${c}，应是 ${g[y][x]}`)
  }
  const newPng = Buffer.from(r.png.split(',')[1], 'base64')
  // 旧 PNG 和旧 SVG 是不是同一张格子
  const ro = await raster(pngUrl(oldPng), W, H)
  const oldPngMatches = og.every((row, y) => row.every((c, x) => hex(ro.data, (y * W + x) * 4) === c))
  if (!DRY) {
    writeFileSync(path.join(ROOT, B, job.file), newSvg)
    writeFileSync(path.join(ROOT, B, job.file.replace(/\.svg$/, '.png')), newPng)
  }
  const [face, muz] = job.colors
  results.push({
    file: job.file, big: job.big, size: `${W}×${H}`, oldPngMatchesOldSvg: oldPngMatches,
    changed: log, before: measure(og, face, muz), after: measure(g, face, muz),
    oldSvg, newSvg, oldPng, newPng,
  })
  console.log(`${job.file}: 改 ${log.length} 格${DRY ? '（dry-run，没写）' : ''}`)
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(results.map(({ oldSvg, newSvg, oldPng, newPng, ...r }) => r), null, 1) + '\n')

// ---- 对照图 ----
const bigSvg = (p) => git('HEAD', `${B}/${p}`).toString()
const LIGHT = '#FFFFFF', DARK = '#202124'
const cell = (u, w, h, k, bg = 'transparent') => `<canvas data-src="${u}" width="${w}" height="${h}" style="width:${w * k}px;height:${h * k}px;background:${bg}"></canvas>`
// 大图直接缩：照逐格画版的位置放（标志宽占满、上下居中；头像正方形占满）
function bigCell(res) {
  const W = +res.size.split('×')[0]
  const svg = bigSvg(res.big)
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const h = W * vb[3] / vb[2], top = (W - h) / 2
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><image href="${svgUrl(svg)}" x="0" y="${top}" width="${W}" height="${h}"/></svg>`
  return svgUrl(wrapped)
}
const checker = 'background-color:#fff;background-image:linear-gradient(45deg,#e6e9e8 25%,transparent 25%,transparent 75%,#e6e9e8 75%),linear-gradient(45deg,#e6e9e8 25%,transparent 25%,transparent 75%,#e6e9e8 75%);background-size:16px 16px;background-position:0 0,8px 8px'
const rows = results.map((r) => {
  const [W, H] = r.size.split('×').map(Number)
  const o = pngUrl(r.oldPng), n = pngUrl(r.newPng), b = bigCell(r)
  const pair = (u, label) => `<div class="pair"><div class="lab">${label}</div><div class="one">${cell(u, W, H, 1)}</div><div class="big" style="${checker}">${cell(u, W, H, 8)}</div></div>`
  return `<div class="row"><div class="name">${r.file.replace('.svg', '')}<small>${W}×${H} · 改 ${r.changed.length} 格<br>照 ${r.big}</small></div>
    ${pair(o, '旧')}${pair(n, '新')}${pair(b, '大图直接缩（参照，不用）')}</div>`
}).join('')
const strip = (bg, fg) => `<div class="strip" style="background:${bg};color:${fg}">
  <div class="sl">${bg === LIGHT ? '浅底' : '深底'} ${bg}</div>
  ${results.map((r) => { const [W, H] = r.size.split('×').map(Number); return `<div class="sc"><div class="sn">${path.basename(r.file, '.svg')}${r.file.includes('mint') ? ' · mint' : ''}</div><div class="sp">${cell(pngUrl(r.oldPng), W, H, 1)}<span>→</span>${cell(pngUrl(r.newPng), W, H, 1)}</div></div>` }).join('')}
</div>`
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#F4F6F5;font:14px/1.45 "WenQuanYi Zen Hei",sans-serif;color:#191D18;width:1240px}
h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 16px;color:#3F525B}
canvas{image-rendering:pixelated;display:block}
.row{display:flex;gap:20px;align-items:flex-start;background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.name{width:190px;font-weight:600}.name small{display:block;font-weight:400;color:#3F525B;margin-top:4px}
.pair{display:flex;flex-direction:column;gap:6px}.lab{font-size:13px;color:#3F525B}
.one{height:32px;display:flex;align-items:center}.big{padding:0;display:inline-block;width:max-content}
.strip{display:flex;align-items:flex-end;gap:22px;padding:14px 16px;border-radius:10px;margin-bottom:10px}
.sl{width:120px;font-size:13px}.sc{display:flex;flex-direction:column;gap:6px}.sn{font-size:12px;opacity:.8}
.sp{display:flex;align-items:center;gap:8px}.sp span{font-size:12px;opacity:.6}
</style></head><body>
<h1>小尺寸品牌图标换新脸 · 旧 | 新 | 大图直接缩</h1>
<p class="sub">每格先原尺寸 1 倍，再放大 8 倍（像素放大，棋盘格是透明）。最下面两排：浅底、深底上的原大小，旧 → 新。截图 1 个像素 = 1 个屏幕像素。</p>
${rows}${strip(LIGHT, '#191D18')}${strip(DARK, '#E8EAED')}
</body></html>`
const page = await (await browser.newContext({ viewport: { width: 1288, height: 800 }, deviceScaleFactor: 1 })).newPage()
await page.setContent(html)
await page.evaluate(async () => {
  for (const c of document.querySelectorAll('canvas[data-src]')) {
    const img = new Image(); img.src = c.dataset.src; await img.decode()
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  }
})
await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
await browser.close()
console.log('出图：' + path.relative(ROOT, path.join(OUT, 'compare.png')))
