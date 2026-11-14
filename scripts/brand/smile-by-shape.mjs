#!/usr/bin/env node
// 獭獭「开心一点」· 不画嘴，只动脸斑下沿（BRAND.md 第 96 条；Owner 2026-11-14 否了另画嘴线的画法）。提案 · 单一来源。
//
// 做什么：读头像母版 otter-head.svg，只替换脸斑（口鼻那块暖米白）这一条路径，
// 按几组参数重画两瓣腮帮的下沿和中间的缺口，其余路径一个数都不动。母版文件不改。
// 输出每一档的 SVG 和一张并排对比图。
//
// 用法：node scripts/brand/smile-by-shape.mjs
// 输出：design/brand-2026-10-13/image-review-2026-11-14/smile-by-shape/ 下的 svg/、compare.png、blind/、params.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14/smile-by-shape')
const MASTER_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

const MASTER = readFileSync(MASTER_PATH, 'utf8')
const MUZZLE_RE = /(<path id="_L9S-0__ziti073" d=")[^"]+(")/
if (!MUZZLE_RE.test(MASTER)) throw new Error('母版里找不到脸斑路径 _L9S-0__ziti073，母版可能改过，先核对再跑')

// 母版脸斑的数（从 otter-head.svg 的路径换算成绝对坐标，左右以 x=512 对称）：
//   顶 y=407.5；肩点离中线 273.5、y=450.5；最宽处离中线 348、y=558.5；
//   每瓣最低点离中线 190、y=669.5；中间缺口 y=593。其余是曲线把手。
const BASE = { topY: 407.5, shX: 273.5, shY: 450.5, sideX: 348, sideY: 558.5, k0: 42, k1: 68.5, botX: 190, botY: 669.5, h1: 93.5, h2: 78.5, nx: 38, ny: 48.5, notchY: 593 }

const VARIANTS = [
  { id: 'N', file: 'smile-N-notch', label: '只把缺口抬高 30', p: { notchY: 563 } },
  { id: 'D', file: 'smile-D-lift8', label: '缺口抬 30，两瓣整体上提 8', p: { notchY: 563, botX: 180, botY: 661, sideY: 550 } },
  { id: 'F', file: 'smile-F-trim', label: '缺口抬 30，两瓣外下角削掉一点', p: { notchY: 563, botX: 178, botY: 667, k1: 52, h1: 80 } },
  { id: 'E', file: 'smile-E-lift14', label: '缺口抬 36，两瓣整体上提 14', p: { notchY: 557, botX: 172, botY: 655, sideY: 545 } },
  { id: 'G', file: 'smile-G-too-far', label: '缺口抬 30，外下角削得更多（过头的对照）', p: { notchY: 563, botX: 168, botY: 663, k1: 44, h1: 74, sideY: 552 } },
]

const r = (n) => Math.round(n * 10) / 10
function muzzlePath(p) {
  const q = { ...BASE, ...p }
  const C = 512
  // 最宽处上移时，肩点到最宽处这一段的把手按同一比例缩，免得外上角鼓出一个尖
  const f = (q.sideY - q.shY) / (BASE.sideY - BASE.shY)
  const k0 = q.k0 * f
  const shoulder = [q.shX + 47, q.shY + 29 * f]
  const R = (dx, y) => `${r(C + dx)} ${r(y)}`
  const L = (dx, y) => `${r(C - dx)} ${r(y)}`
  return [
    `M${R(0, q.topY)}`,
    `C${R(115, q.topY)} ${R(210.5, q.topY + 4)} ${R(q.shX, q.shY)}`,
    `C${R(shoulder[0], shoulder[1])} ${R(q.sideX, q.sideY - k0)} ${R(q.sideX, q.sideY)}`,
    `C${R(q.sideX, q.sideY + q.k1)} ${R(q.botX + q.h1, q.botY)} ${R(q.botX, q.botY)}`,
    `C${R(q.botX - q.h2, q.botY)} ${R(q.nx, q.notchY + q.ny)} ${R(0, q.notchY)}`,
    `C${L(q.nx, q.notchY + q.ny)} ${L(q.botX - q.h2, q.botY)} ${L(q.botX, q.botY)}`,
    `C${L(q.botX + q.h1, q.botY)} ${L(q.sideX, q.sideY + q.k1)} ${L(q.sideX, q.sideY)}`,
    `C${L(q.sideX, q.sideY - k0)} ${L(shoulder[0], shoulder[1])} ${L(q.shX, q.shY)}`,
    `C${L(210.5, q.topY + 4)} ${L(115, q.topY)} ${R(0, q.topY)}Z`,
  ].join('')
}

const NOTE = '<!-- 对比稿，不是母版：只改了脸斑下沿（scripts/brand/smile-by-shape.mjs），提案 · 单一来源。 -->'
const drafts = VARIANTS.map((v) => ({ ...v, svg: MASTER.replace(MUZZLE_RE, `$1${muzzlePath(v.p)}$2`).replace('<title>', `${NOTE}\n<title>`) }))
const all = [{ id: '0', file: 'master', label: '现在的母版（没改）', svg: MASTER }, ...drafts]

mkdirSync(path.join(OUT, 'svg'), { recursive: true })
mkdirSync(path.join(OUT, 'blind'), { recursive: true })
for (const d of drafts) writeFileSync(path.join(OUT, 'svg', `${d.file}.svg`), d.svg)
writeFileSync(path.join(OUT, 'params.json'), `${JSON.stringify({ base: BASE, variants: VARIANTS.map(({ id, file, label, p }) => ({ id, file, label, changed: p })) }, null, 2)}\n`)

const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const SIZES = [400, 96, 40]
const cells = all
  .map((v) => `<figure><div class="row">${SIZES.map((s) => `<img src="${uri(v.svg)}" width="${s}" height="${s}">`).join('')}</div><figcaption><b>${v.id}</b>　${v.label}</figcaption></figure>`)
  .join('')
const html = `<style>body{margin:0;padding:28px;background:#F1F5F7;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0;background:#fff;border-radius:8px;padding:14px}.row{display:flex;align-items:flex-end;gap:16px}figcaption{padding-top:10px}</style><h1>不画嘴，只动腮帮下沿</h1><p>对比稿 · 提案。只有脸斑这一条轮廓线不同，眼睛、鼻子、胡须点、头型都和母版一样。每格三个大小：400、96、40 像素。</p><div class="g">${cells}</div>`

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
  // 盲看用：每张单独一张图，文件名打乱，不带任何说明
  const BLIND = { 0: 'q3', N: 'q5', D: 'q1', F: 'q6', E: 'q2', G: 'q4' }
  const one = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 })
  for (const v of all) {
    await one.setContent(`<body style="margin:0;background:#fff"><img src="${uri(v.svg)}" width="600" height="600">`)
    await one.screenshot({ path: path.join(OUT, 'blind', `${BLIND[v.id]}.png`) })
  }
  writeFileSync(path.join(OUT, 'blind', 'key.json'), `${JSON.stringify(BLIND, null, 2)}\n`)
} finally {
  await browser.close()
}
console.log(`出了 ${drafts.length} 档对比稿：${path.relative(ROOT, OUT)}`)
