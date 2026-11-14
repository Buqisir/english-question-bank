#!/usr/bin/env node
// 小图标逐格画版的对比稿（design/brand-2026-10-13/image-review-2026-11-14/small-icons/）。对比稿 · 提案 · 单一来源。
// 照 BRAND.md 第 97–100 条：小图标单独手排，不从大图缩。
//   32 格（otter-head-32、app-icon-32、mint mark-32）：A 眼睛 3×3、C 眼睛 2×3（同眼睛取证的备选 a、c），
//        两版都带「F」：脸斑下沿中间的缺口改成两行台阶（下行 4 格、上一行 2 格），两瓣外下角各削一格。
//        另出 A0、C0：只改眼睛、脸斑不动，作参照。
//   16 格（otter-head-16、app-icon-16、mint mark-16）：眼睛不动，眼睛正下方那一格脸斑白改成绿（已定）。
//        墨色版 mark-16-mono：眼洞正下方那一格透明补成墨，让眼洞和脸斑洞分开。
//        另出两张 16 格「F」试探（只进 probe-16.png，不当草稿）。
// 只读现有的逐格画版；不改 app/、shared-ui/、mascot/、logo/、app/public 下任何文件。试穿只在无头浏览器里换 img 地址。
//
// 用法：node scripts/brand/small-icons.mjs            全部重跑（出草稿、对比图，起本地网站拍真实页面）
//       node scripts/brand/small-icons.mjs --no-site  不起本地网站，只出草稿和对比图
// 端口：照 scripts/component-inventory/rig.mjs 起本地网站，端口偏移默认 46（网页 5345、接口 9958）；
//       结束时只删自己的临时数据 .scratch/component-inventory/rigdata-46。
// 输出：<OUT>/drafts/  每份草稿的 SVG（格式同原文件）、PNG（尺寸同原文件）、JSON（改了哪些格、改前改后的净空）
//       <OUT>/shots/   真实页面截图原片
//       <OUT>/compare.png、muzzle-study.png、probe-16.png、tryon-1x.png、tryon-2x-tab.png、measure.json
// 净空 = 两块之间的切比雪夫距离减 1，也就是中间隔几格；0 表示贴着，包括斜角贴着（量法同 eye-study.mjs）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = 'design/brand-2026-10-13'
const OUT = path.join(ROOT, B, 'image-review-2026-11-14/small-icons')
const DRAFTS = path.join(OUT, 'drafts'), SHOTS = path.join(OUT, 'shots')
const NO_SITE = process.argv.includes('--no-site')
for (const d of [OUT, DRAFTS, SHOTS]) mkdirSync(d, { recursive: true })

if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '46'
const { requireFromApp, RAW } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rdBuf = (p) => readFileSync(path.join(ROOT, p))
const pngUrl = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64')
const svgUrl = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')
const json = (f, o) => writeFileSync(f, JSON.stringify(o, null, 1) + '\n')
const STATUS = '对比稿 · 提案 · 单一来源'

const MINT = '#72BFA4', INK = '#191D18', FACE = '#F2FAF6'

// ---------------------------------------------------------------- 读格子：SVG 是 1 格 1 个 rect（横向连续合并）
function readSvgGrid(file) {
  const s = readFileSync(path.join(ROOT, file), 'utf8')
  const [, , W, H] = s.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const g = new Array(W * H).fill(null)
  for (const m of s.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9A-Fa-f]{6})"\/>/g)) {
    const [x, y, w, h] = [m[1], m[2], m[3], m[4]].map(Number)
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = m[5].toUpperCase()
  }
  const head = s.slice(0, s.indexOf('<title>'))
  return { W, H, g, head }
}
// 写回同样的格式：每行按颜色合并成横条
function gridSvg(g, W, H, title, comment) {
  let r = ''
  for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
    const c = g[y * W + x]; let n = 1
    while (x + n < W && g[y * W + x + n] === c) n++
    if (c) r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`
    x += n
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">\n<!-- ${comment} -->\n<title>${title}</title>${r}</svg>\n`
}

// ---------------------------------------------------------------- 要改的文件
// dy：这份文件的格子坐标 = app-icon 同尺寸的坐标 + dy（PNG 坐标）。pngRows：PNG 只取 SVG 的这几行（mint mark-32 是 32×20）。
const FILES = {
  'app-icon-32': { file: `${B}/mascot/small/app-icon-32`, size: 32, dy: 0, use: '浏览器标签 2x：app/public/favicon-32.png 和 favicon.ico 里的 32×32 是同一套格子' },
  'otter-head-32': { file: `${B}/mascot/small/otter-head-32`, size: 32, dy: -1, use: '行内小头像（现网没用）' },
  'mark-32': { file: `${B}/logo/mint/mark-32`, size: 32, dy: -4, svgDy: 6, use: '顶栏 1x：app/public/brand/mark-32.png 和它逐字节相同' },
  'app-icon-16': { file: `${B}/mascot/small/app-icon-16`, size: 16, dy: 0, use: '浏览器标签 1x：app/public/favicon-16.png 和 favicon.ico 里的 16×16 是同一套格子' },
  'otter-head-16': { file: `${B}/mascot/small/otter-head-16`, size: 16, dy: 0, use: '行内小头像（现网没用）' },
  'mark-16': { file: `${B}/logo/mint/mark-16`, size: 16, dy: 1, use: '16px 以下的标志（现网没用）' },
  'mark-16-mono': { file: `${B}/logo/mark-16-mono`, size: 16, dy: 1, mono: true, use: '墨色版（现网没用）' },
}
// 改动，坐标按 app-icon 同尺寸的 PNG 坐标写；[x, y, 应该是的旧色, 新色]
const EYES_A = [[8, 11], [9, 11], [10, 11], [8, 12], [8, 13], [21, 11], [22, 11], [23, 11], [23, 12], [23, 13]].map(([x, y]) => [x, y, MINT, INK])
const EYES_C = [[9, 11], [10, 11], [21, 11], [22, 11]].map(([x, y]) => [x, y, MINT, INK])
const F_NOTCH = [[15, 21], [16, 21]].map(([x, y]) => [x, y, FACE, MINT]) // 缺口上一行，2 格宽
const F_CORNER = [[7, 22], [24, 22]].map(([x, y]) => [x, y, FACE, MINT]) // 两瓣外下角
const FIX16 = [[4, 7], [11, 7]].map(([x, y]) => [x, y, FACE, MINT])
const FIX16_MONO = [[4, 7], [11, 7]].map(([x, y]) => [x, y, null, INK])
const DRAFT_DEFS = {
  32: [
    { key: 'A', name: 'A · 眼睛 3×3 + F 脸斑', cells: [...EYES_A, ...F_NOTCH, ...F_CORNER], why: '眼睛往外、往上各加一格（同眼睛取证备选 a）；脸斑下沿缺口改两行台阶（下 4 格、上 2 格），两瓣外下角各削一格' },
    { key: 'C', name: 'C · 眼睛 2×3 + F 脸斑', cells: [...EYES_C, ...F_NOTCH, ...F_CORNER], why: '眼睛只往上加一行（同眼睛取证备选 c）；脸斑同 A' },
    { key: 'A0', name: 'A0 · 只改眼睛 3×3（参照）', cells: EYES_A, why: '只改眼睛，脸斑不动，用来对照 F 脸斑在小尺寸上值不值' },
    { key: 'C0', name: 'C0 · 只改眼睛 2×3（参照）', cells: EYES_C, why: '只改眼睛，脸斑不动' },
  ],
  16: [{ key: 'fix', name: '修 · 眼下一格白改绿', cells: FIX16, why: '眼睛不动；每只眼睛正下方那一格脸斑白改成头的绿（BRAND.md 第 98 条③）' }],
  mono: [{ key: 'fix', name: '修 · 眼洞下补一格墨', cells: FIX16_MONO, why: '眼睛不动；每个眼洞正下方那一格透明补成墨，眼洞和脸斑洞分开（同彩色版的修法）' }],
}
// 16 格 F 试探：只进 probe-16.png
const PROBES16 = [
  { key: 'p1', name: '试探 1 · 两瓣外下角各削一格', cells: [[3, 10], [12, 10]].map(([x, y]) => [x, y, FACE, MINT]) },
  { key: 'p2', name: '试探 2 · 缺口加高一行（2 格宽）', cells: [[7, 9], [8, 9]].map(([x, y]) => [x, y, FACE, MINT]) },
  { key: 'p3', name: '试探 3 · 缺口加高一行 + 削外下角', cells: [[7, 9], [8, 9], [3, 10], [12, 10]].map(([x, y]) => [x, y, FACE, MINT]) },
]
// 32 格脸斑试探：只进 muzzle-study.png（眼睛按 C）
const MUZZLE32 = [
  { key: 'm0', name: '现状缺口（1 行 4 格）', cells: [] },
  { key: 'm1', name: '台阶缺口（下 4 上 2）', cells: F_NOTCH },
  { key: 'm2', name: '台阶缺口 + 削外下角（= 草稿用的）', cells: [...F_NOTCH, ...F_CORNER] },
  { key: 'm3', name: '只削外下角', cells: F_CORNER },
  { key: 'm4', name: '台阶 + 外下角削两层', cells: [...F_NOTCH, ...F_CORNER, [6, 21, FACE, MINT], [25, 21, FACE, MINT]] },
]

function apply(base, W, cells, dy) {
  const g = base.slice(), changes = []
  for (const [x, ay, from, to] of cells) {
    const y = ay + dy, i = y * W + x
    if (g[i] !== from) throw new Error(`(${x},${y}) 应该是 ${from}，实际 ${g[i]}`)
    g[i] = to; changes.push({ x, y, old: from ?? 'transparent', new: to ?? 'transparent' })
  }
  return { g, changes }
}

// ---------------------------------------------------------------- 量净空（同 eye-study.mjs 的 measurePixel，搬到 Node 里）
function comps(W, H, pred, eight) {
  const lab = new Int32Array(W * H).fill(-1), out = []
  for (let i = 0; i < W * H; i++) {
    if (lab[i] >= 0 || !pred(i)) continue
    const q = [i], px = []; lab[i] = out.length
    while (q.length) {
      const k = q.pop(); px.push(k); const x = k % W, y = (k / W) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!eight && dx && dy) continue
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx; if (lab[n] < 0 && pred(n)) { lab[n] = out.length; q.push(n) }
      }
    }
    const xs = px.map((k) => k % W), ys = px.map((k) => (k / W) | 0)
    out.push({ px, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), border: xs.some((x) => x === 0 || x === W - 1) || ys.some((y) => y === 0 || y === H - 1) })
  }
  return out
}
const gap = (W, A, Bs) => { let d = Infinity; for (const a of A) for (const b of Bs) d = Math.min(d, Math.max(Math.abs(a % W - b % W), Math.abs(((a / W) | 0) - ((b / W) | 0)))); return d === Infinity ? null : d - 1 }
const edgeTouch = (W, A, Bs) => { const s = new Set(Bs); return A.some((a) => [a - 1, a + 1, a - W, a + W].some((n) => s.has(n) && Math.abs((n % W) - (a % W)) <= 1)) }
function measure(g, W, H, mono) {
  let eyesC, noseC, whiskC, faceC, outside
  if (!mono) {
    const inkC = comps(W, H, (i) => g[i] === INK, true).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    eyesC = inkC.slice(0, 2).sort((a, b) => a.x0 - b.x0)
    const others = inkC.slice(2).sort((a, b) => b.px.length - a.px.length)
    noseC = others[0]; whiskC = others.slice(1)
    const wC = comps(W, H, (i) => g[i] === FACE, false)
    faceC = wC.filter((c) => !c.border).sort((a, b) => b.px.length - a.px.length)[0] || null
    const tile = new Set(wC.filter((c) => c.border).flatMap((c) => c.px))
    outside = []; for (let i = 0; i < W * H; i++) if (g[i] === null || tile.has(i)) outside.push(i)
  } else {
    const holes = comps(W, H, (i) => g[i] === null, false)
    outside = holes.filter((c) => c.border).flatMap((c) => c.px)
    const enclosed = holes.filter((c) => !c.border).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    if (enclosed.length < 3) return { error: `封闭的洞只有 ${enclosed.length} 个：眼洞和脸斑洞连在一起，分不出两只眼睛` }
    eyesC = enclosed.slice(0, 2).sort((a, b) => a.x0 - b.x0)
    faceC = enclosed.slice(2).sort((a, b) => b.px.length - a.px.length)[0]
    const inkC = comps(W, H, (i) => g[i] !== null, true).sort((a, b) => b.px.length - a.px.length)
    noseC = inkC[1] || null; whiskC = inkC.slice(2)
  }
  const eye = (c) => ({
    cells: c.px.length, box: [c.x1 - c.x0 + 1, c.y1 - c.y0 + 1], at: [c.x0, c.y0],
    toNose: noseC ? gap(W, c.px, noseC.px) : null, toMuzzle: faceC ? gap(W, c.px, faceC.px) : null,
    muzzleSharesEdge: faceC ? edgeTouch(W, c.px, faceC.px) : null,
    toOutline: gap(W, c.px, outside), toWhisker: whiskC.length ? Math.min(...whiskC.map((w) => gap(W, c.px, w.px))) : null,
  })
  return { eyes: eyesC.map(eye), muzzleCells: faceC ? faceC.px.length : null, whiskerDots: whiskC.length }
}

// ---------------------------------------------------------------- 浏览器：编 PNG、解 PNG、拍对比图
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const labCtx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })
const lab = await labCtx.newPage()
await lab.setContent('<!doctype html><body></body>')
const decodePng = (buf) => lab.evaluate(async (u) => {
  const img = new Image(); img.src = u; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, g = []
  for (let i = 0; i < d.length; i += 4) g.push(d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase())
  return { W: c.width, H: c.height, g }
}, pngUrl(buf))
const encodePng = async (g, W, H) => Buffer.from((await lab.evaluate(([g, W, H]) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const im = x.createImageData(W, H)
  g.forEach((h, i) => { if (!h) return; im.data[i * 4] = parseInt(h.slice(1, 3), 16); im.data[i * 4 + 1] = parseInt(h.slice(3, 5), 16); im.data[i * 4 + 2] = parseInt(h.slice(5, 7), 16); im.data[i * 4 + 3] = 255 })
  x.putImageData(im, 0, 0); return c.toDataURL('image/png')
}, [g, W, H])).split(',')[1], 'base64')
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

// ---------------------------------------------------------------- 1. 读现状，核对 SVG = PNG，核对 app/public 用的是哪一份
const cur = {}
const equivalence = []
for (const [id, f] of Object.entries(FILES)) {
  const s = readSvgGrid(f.file + '.svg')
  const p = await decodePng(rdBuf(f.file + '.png'))
  const off = f.svgDy || 0
  const sub = s.g.slice(off * s.W, (off + p.H) * s.W)
  if (p.W !== s.W || !same(sub, p.g)) throw new Error(`${id}: SVG 和 PNG 的格子对不上`)
  cur[id] = { ...f, svg: s, W: p.W, H: p.H, g: p.g }
}
for (const [app, id] of [['app/public/favicon-16.png', 'app-icon-16'], ['app/public/favicon-32.png', 'app-icon-32'], ['app/public/brand/mark-32.png', 'mark-32']]) {
  const p = await decodePng(rdBuf(app))
  const bytes = Buffer.compare(rdBuf(app), rdBuf(cur[id].file + '.png')) === 0
  equivalence.push({ app, design: cur[id].file + '.png', sameGrid: same(p.g, cur[id].g), sameBytes: bytes })
}
{ // favicon.ico：ICO 头 + 目录，图块是内嵌 PNG
  const d = rdBuf('app/public/favicon.ico'), n = d.readUInt16LE(4), entries = []
  for (let i = 0; i < n; i++) {
    const o = 6 + 16 * i, w = d[o] || 256, size = d.readUInt32LE(o + 8), off = d.readUInt32LE(o + 12), blob = d.subarray(off, off + size)
    const isPng = blob.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const match = ['app/public/favicon-16.png', 'app/public/favicon-32.png'].find((f) => rdBuf(f).equals(blob)) || null
    entries.push({ size: `${w}×${d[o + 1] || 256}`, bytes: size, embedded: isPng ? 'PNG' : 'BMP', byteIdenticalTo: match })
  }
  equivalence.push({ app: 'app/public/favicon.ico', totalBytes: d.length, entries })
}

// ---------------------------------------------------------------- 2. 草稿
const drafts = {} // id -> key -> {g, png, svg, changes, after}
const measureAll = { status: STATUS, method: '净空 = 切比雪夫距离减 1（中间隔几格，0 = 贴着，含斜角贴着）；muzzleSharesEdge = 眼睛和脸斑有没有共用一条边（上下左右挨着）。彩色版眼睛 = 最上面两块墨（八连通），脸斑 = 不碰画布边的最大一块雾白；墨色版眼睛 = 最上面两个封闭的透明洞。坐标是 PNG 的 (列, 行)，从 0 数；mint mark-32 的 SVG 行号要再加 6。', equivalence, files: {} }
for (const [id, f] of Object.entries(cur)) {
  const before = measure(f.g, f.W, f.H, !!f.mono)
  const defs = f.mono ? DRAFT_DEFS.mono : DRAFT_DEFS[f.size]
  measureAll.files[id] = { file: f.file, use: f.use, current: before, drafts: {} }
  drafts[id] = {}
  for (const d of defs) {
    const { g, changes } = apply(f.g, f.W, d.cells, f.dy)
    const after = measure(g, f.W, f.H, !!f.mono)
    const name = `${id}-${d.key}`
    // SVG：同原文件的画布（mint mark-32 放回 32×32 的第 6 行起）
    const off = f.svgDy || 0, sg = f.svg.g.slice(); g.forEach((c, i) => { sg[i + off * f.W] = c })
    const comment = `${name}：${d.name}。${d.why}。${STATUS}；副本，不是母版；改了 ${changes.length} 格，见 ${name}.json。原文件 ${path.basename(f.file)}.svg`
    const svg = gridSvg(sg, f.svg.W, f.svg.H, name, comment)
    const png = await encodePng(g, f.W, f.H)
    const back = await decodePng(png); if (!same(back.g, g)) throw new Error(name + ' PNG 编码后读回来不一样')
    writeFileSync(path.join(DRAFTS, `${name}.svg`), svg)
    writeFileSync(path.join(DRAFTS, `${name}.png`), png)
    const rec = { status: STATUS, draft: d.name, why: d.why, source: { svg: f.file + '.svg', png: f.file + '.png' }, pngSize: [f.W, f.H], svgSize: [f.svg.W, f.svg.H],
      changes: changes.map((c) => (off ? { ...c, svgY: c.y + off } : c)), clearanceBefore: before, clearanceAfter: after }
    json(path.join(DRAFTS, `${name}.json`), rec)
    drafts[id][d.key] = { g, png, svg, changes, after, name: d.name }
    measureAll.files[id].drafts[d.key] = { name: d.name, changed: changes.length, after }
  }
}
// SVG 写出去再读回来，格子要和 PNG 一样
for (const [id, f] of Object.entries(cur)) for (const [k, d] of Object.entries(drafts[id])) {
  const s = readSvgGrid(path.relative(ROOT, path.join(DRAFTS, `${id}-${k}.svg`))), off = f.svgDy || 0
  if (!same(s.g.slice(off * s.W, (off + f.H) * s.W), d.g)) throw new Error(`${id}-${k}: 写出的 SVG 和 PNG 对不上`)
}
// 试探（不当草稿）
const probes = { p16: {}, m32: {} }
for (const p of PROBES16) {
  const { g, changes } = apply(cur['app-icon-16'].g, 16, [...FIX16, ...p.cells], 0)
  probes.p16[p.key] = { name: p.name, png: await encodePng(g, 16, 16), changes, after: measure(g, 16, 16, false) }
}
for (const m of MUZZLE32) {
  const { g, changes } = apply(cur['app-icon-32'].g, 32, [...EYES_C, ...m.cells], 0)
  probes.m32[m.key] = { name: m.name, png: await encodePng(g, 32, 32), changes, after: measure(g, 32, 32, false) }
}
measureAll.probes = { note: '试探，不是草稿：16 格在「修」之上再试 F；32 格脸斑几种下沿（眼睛都按 C）', p16: Object.fromEntries(Object.entries(probes.p16).map(([k, v]) => [k, { name: v.name, changes: v.changes, after: v.after }])), m32: Object.fromEntries(Object.entries(probes.m32).map(([k, v]) => [k, { name: v.name, changes: v.changes, after: v.after }])) }

// ---------------------------------------------------------------- 3. 对比图
async function sheet(html, file, width) {
  const c = await browser.newContext({ viewport: { width, height: 600 }, deviceScaleFactor: 1 })
  const p = await c.newPage()
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#F1F5F7;font:18px/1.45 "WenQuanYi Zen Hei","Noto Sans CJK SC",sans-serif;color:#1F2D33;width:${width - 40}px}
    h1{font-size:26px;margin:0 0 6px} h2{font-size:22px;margin:22px 0 8px} .note{font-size:16px;color:#4A5B62;margin:0 0 10px}
    .row{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 14px;align-items:flex-start} .cell{background:#fff;border-radius:8px;padding:10px}
    .lab{font-size:18px;font-weight:600;margin-bottom:6px} .sub{font-size:15px;color:#4A5B62}
    .real{display:flex;gap:8px;align-items:center;margin-bottom:8px} .bgw{background:#fff;outline:1px solid #D5DEE2;padding:6px;line-height:0} .bgd{background:#202124;padding:6px;line-height:0}
    img.z{image-rendering:pixelated;display:block}
  </style></head><body>${html}</body></html>`)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.screenshot({ path: file, fullPage: true })
  await c.close()
}
const tile = (buf, W, H, label, sub, z = 8, dark = true) => `<div class="cell"><div class="lab">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}<div class="real"><span class="bgw"><img src="${pngUrl(buf)}" width="${W}" height="${H}"></span>${dark ? `<span class="bgd"><img src="${pngUrl(buf)}" width="${W}" height="${H}"></span>` : ''}<span class="sub">← 原尺寸</span></div><img class="z" src="${pngUrl(buf)}" width="${W * z}" height="${H * z}"><div class="sub">8 倍</div></div>`
const curPng = (id) => rdBuf(cur[id].file + '.png')
const eyeTxt = (m) => (m.error ? m.error : `眼 ${m.eyes[0].box.join('×')}；到鼻 ${m.eyes[0].toNose}、到脸斑 ${m.eyes[0].toMuzzle}${m.eyes[0].muzzleSharesEdge ? '（共边）' : ''}、到外轮廓 ${m.eyes[0].toOutline}`)
{
  let h = `<h1>小图标逐格画版 · 对比稿</h1><p class="note">${STATUS}。每格上面是原尺寸（白底、深底，1 个图像像素 = 1 格），下面是 8 倍。净空数是左眼，单位「隔几格」，0 = 贴着。</p>`
  h += `<h2>32 格：现状 / A 眼睛 3×3 / C 眼睛 2×3（A、C 都带 F 脸斑）</h2>`
  for (const id of ['mark-32', 'app-icon-32', 'otter-head-32']) {
    const f = cur[id]
    h += `<div class="sub" style="margin:4px 0">${id} · ${f.use}</div><div class="row">${tile(curPng(id), f.W, f.H, '现状', eyeTxt(measureAll.files[id].current))}${['A', 'C'].map((k) => tile(drafts[id][k].png, f.W, f.H, k === 'A' ? 'A · 眼 3×3' : 'C · 眼 2×3', eyeTxt(drafts[id][k].after))).join('')}</div>`
  }
  h += `<h2>16 格：现状 / 修（眼睛下面那一格白改绿）</h2>`
  for (const id of ['app-icon-16', 'otter-head-16', 'mark-16', 'mark-16-mono']) {
    const f = cur[id]
    h += `<div class="sub" style="margin:4px 0">${id} · ${f.use}</div><div class="row">${tile(curPng(id), f.W, f.H, '现状', eyeTxt(measureAll.files[id].current), 8, !f.mono)}${tile(drafts[id].fix.png, f.W, f.H, '修', eyeTxt(drafts[id].fix.after), 8, !f.mono)}</div>`
  }
  await sheet(h, path.join(OUT, 'compare.png'), 1000)
}
{ // 32 格脸斑：几种下沿，并排矢量现状缩到 32×20 的样子
  const vecNow = readFileSync(path.join(ROOT, B, 'logo/mint/mark.svg'), 'utf8')
  const vecOld = execFileSync('git', ['show', `9a4766de9:${B}/logo/mint/mark.svg`], { cwd: ROOT, encoding: 'utf8' })
  const rast = async (svg) => { const c = await browser.newContext({ viewport: { width: 64, height: 40 }, deviceScaleFactor: 1 }); const p = await c.newPage(); await p.setContent(`<body style="margin:0;background:#fff"><img src="${svgUrl(svg)}" width="32" height="20" style="display:block">`); await p.evaluate(() => document.images[0].decode()); const b = await p.screenshot({ clip: { x: 0, y: 0, width: 32, height: 20 } }); await c.close(); return b }
  const [bNow, bOld] = [await rast(vecNow), await rast(vecOld)]
  let h = `<h1>32 格脸斑下沿 · 几种试法（眼睛都按 C）</h1><p class="note">${STATUS}。app-icon-32 的格子。最后两格是矢量标志直接缩到 32×20（抗锯齿），F 前后，用来对照 F 缩小以后还剩什么。</p><div class="row">`
  for (const m of MUZZLE32) h += tile(probes.m32[m.key].png, 32, 32, m.key, m.name)
  h += `</div><div class="row">${tile(bOld, 32, 20, '矢量 · 改之前（9a4766de9）', 'mint/mark.svg 缩到 32×20', 8, false)}${tile(bNow, 32, 20, '矢量 · 现在（F）', 'mint/mark.svg 缩到 32×20', 8, false)}</div>`
  await sheet(h, path.join(OUT, 'muzzle-study.png'), 1500)
  let h2 = `<h1>16 格能不能带 F · 试探（不是草稿）</h1><p class="note">都在「修」（眼下白改绿）之上再改；app-icon-16 的格子。</p><div class="row">${tile(curPng('app-icon-16'), 16, 16, '现状')}${tile(drafts['app-icon-16'].fix.png, 16, 16, '修')}`
  for (const p of PROBES16) h2 += tile(probes.p16[p.key].png, 16, 16, p.key, p.name)
  await sheet(h2 + '</div>', path.join(OUT, 'probe-16.png'), 1100)
}
json(path.join(OUT, 'measure.json'), measureAll)

// ---------------------------------------------------------------- 4. 真实页面试穿
// 1x 屏：顶栏 1x 用 mark-32.png；浏览器标签 1x 用 favicon-16.png。2x 屏：标签用 favicon-32.png（顶栏 2x 用矢量，不在这次范围）。
// 标签条是示意：无头浏览器没有自己的标签栏，这里在真实页面最上面插一条假的标签条（浅色、深色各一个标签），只为看图标在标签底色上的样子。
const shotLog = { status: STATUS, note: `本地网站（rig.mjs，端口偏移 ${process.env.INVENTORY_PORT_OFFSET}），owner 账号，视口 1440×900，减少动态效果。只在截图前换 img 地址，源码没动。标签条是示意。`, shots: {} }
if (!NO_SITE) {
  const rig = await startRig({ quiet: true })
  const base = rig.base
  try {
    const SCENES1 = [ // 1x：标签 16 + 顶栏 mark-32
      { key: 'cur', label: '现状', fav: curPng('app-icon-16'), mark: curPng('mark-32') },
      { key: 'A', label: 'A（标签 16 修 + 顶栏 A）', fav: drafts['app-icon-16'].fix.png, mark: drafts['mark-32'].A.png },
      { key: 'C', label: 'C（标签 16 修 + 顶栏 C）', fav: drafts['app-icon-16'].fix.png, mark: drafts['mark-32'].C.png },
      { key: 'A0', label: 'A0 只改眼（参照）', fav: drafts['app-icon-16'].fix.png, mark: drafts['mark-32'].A0.png },
      { key: 'C0', label: 'C0 只改眼（参照）', fav: drafts['app-icon-16'].fix.png, mark: drafts['mark-32'].C0.png },
    ]
    const SCENES2 = [ // 2x：标签 favicon-32
      { key: 'cur', label: '现状', fav: curPng('app-icon-32') },
      { key: 'A', label: 'A', fav: drafts['app-icon-32'].A.png },
      { key: 'C', label: 'C', fav: drafts['app-icon-32'].C.png },
      { key: 'A0', label: 'A0 只改眼（参照）', fav: drafts['app-icon-32'].A0.png },
      { key: 'C0', label: 'C0 只改眼（参照）', fav: drafts['app-icon-32'].C0.png },
    ]
    const out = { 1: {}, 2: {} }
    for (const dpr of [1, 2]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })
      const p = await c.newPage()
      await p.goto(base + '/'); await p.locator('#login-username').waitFor({ timeout: 30000 })
      await p.locator('#login-username').fill(OWNER.username); await p.locator('#login-password').fill(OWNER.password)
      await p.locator('.login-submit').click(); await p.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(1000)
      const realSrc = (await p.locator('img.topbar-brand-mark').evaluate((e) => e.currentSrc)).replace(base, '')
      shotLog.shots[`${dpr}x-topbar-currentSrc`] = realSrc
      // 插假标签条：页面整体往下推 40px
      await p.evaluate(() => {
        const bar = document.createElement('div'); bar.id = 'mock-tabs'
        bar.style.cssText = 'position:fixed;left:0;top:0;right:0;height:40px;background:#DEE1E6;z-index:99999;font:12px "WenQuanYi Zen Hei",sans-serif'
        const tab = (left, bg, fg, id) => `<div style="position:absolute;left:${left}px;top:6px;width:210px;height:34px;background:${bg};color:${fg};border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box"><img id="${id}" width="16" height="16" alt=""><span>獭石 · 英语题库</span></div>`
        bar.innerHTML = tab(8, '#FFFFFF', '#1F1F1F', 'fav-l') + tab(226, '#35363A', '#E8EAED', 'fav-d')
        document.body.appendChild(bar); document.body.style.paddingTop = '40px'
        for (const el of document.querySelectorAll('header.topbar')) if (getComputedStyle(el).position === 'fixed') el.style.top = '40px'
      })
      await sleep(300)
      const tbImg = p.locator('img.topbar-brand-mark')
      for (const s of dpr === 1 ? SCENES1 : SCENES2) {
        await p.evaluate(([f]) => { for (const id of ['fav-l', 'fav-d']) document.getElementById(id).src = f }, [pngUrl(s.fav)])
        if (dpr === 1) await tbImg.evaluate((e, u) => { e.removeAttribute('srcset'); e.src = u }, pngUrl(s.mark))
        await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))); await sleep(150)
        const tb = await p.locator('header.topbar').boundingBox(), r = await tbImg.boundingBox()
        const fl = await p.locator('#fav-l').boundingBox(), fd = await p.locator('#fav-d').boundingBox()
        const shot = {
          strip: await p.screenshot({ clip: { x: 0, y: 0, width: 470, height: tb.y + tb.height } }),
          favL: await p.screenshot({ clip: { x: fl.x - 4, y: fl.y - 4, width: 24, height: 24 } }),
          favD: await p.screenshot({ clip: { x: fd.x - 4, y: fd.y - 4, width: 24, height: 24 } }),
          mark: dpr === 1 ? await p.screenshot({ clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 } }) : null,
        }
        for (const [k, b] of Object.entries(shot)) if (b) writeFileSync(path.join(SHOTS, `${dpr}x-${s.key}-${k}.png`), b)
        out[dpr][s.key] = { ...shot, label: s.label }
        shotLog.shots[`${dpr}x-${s.key}`] = { label: s.label, topbarCss: tb, markCss: r, favLightCss: fl, favDarkCss: fd, topbarImgSrc: dpr === 1 ? 'data:（换成草稿 PNG）' : realSrc }
      }
      await c.close()
    }
    // 试穿总图：截图像素 = 物理像素；原尺寸放原片，8 倍逐像素放大
    const im = (b, z, w) => `<img class="z" src="${pngUrl(b)}" ${z > 1 ? `data-z="${z}"` : ''}>`
    const zfix = `<script>for(const i of document.querySelectorAll('img[data-z]')){const f=()=>{i.width=i.naturalWidth*i.dataset.z};i.complete?f():i.onload=f}</script>`
    let h = `<h1>真实页面试穿 · 1x 屏</h1><p class="note">${STATUS}。本地网站真实页面，顶栏标志换成草稿（1x 现网用 mark-32.png）；最上面的标签条是示意（浅色、深色标签，图标是 favicon-16 的格子）。截图 1 像素 = 屏幕 1 物理像素。</p>`
    for (const s of SCENES1) { const v = out[1][s.key]; h += `<h2>${v.label}</h2><div class="row"><div class="cell">${im(v.strip, 1)}</div></div><div class="row"><div class="cell"><div class="sub">顶栏标志 8 倍</div>${im(v.mark, 8)}</div><div class="cell"><div class="sub">浅色标签 8 倍</div>${im(v.favL, 8)}</div><div class="cell"><div class="sub">深色标签 8 倍</div>${im(v.favD, 8)}</div></div>` }
    await sheet(h + zfix, path.join(OUT, 'tryon-1x.png'), 1100)
    h = `<h1>浏览器标签（示意）· 2x 屏用 favicon-32</h1><p class="note">${STATUS}。favicon-32 在 2x 屏的标签里用（系统缩放 125%、150% 时浏览器挑哪张没测）：16 CSS px 正好是 32 个物理像素，所以这里按 2x 拍。标签条是示意，下面露出的是真实页面顶栏（2x 用矢量 mark.svg，没换）。截图 1 像素 = 1 物理像素。</p>`
    for (const s of SCENES2) { const v = out[2][s.key]; h += `<h2>${v.label}</h2><div class="row"><div class="cell">${im(v.strip, 1)}</div></div><div class="row"><div class="cell"><div class="sub">浅色标签 8 倍</div>${im(v.favL, 8)}</div><div class="cell"><div class="sub">深色标签 8 倍</div>${im(v.favD, 8)}</div></div>` }
    await sheet(h + zfix, path.join(OUT, 'tryon-2x-tab.png'), 1100)
  } finally {
    await rig.stop()
    rmSync(path.join(RAW, `rigdata-${process.env.INVENTORY_PORT_OFFSET}`), { recursive: true, force: true })
  }
  json(path.join(SHOTS, 'shots.json'), shotLog)
}
await browser.close()
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
