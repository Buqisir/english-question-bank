#!/usr/bin/env node
// 巨藻林中图重做（BRAND.md §5.2，第 114 条说的「以后重做」；第 126 条，2026-11-16，提案 · 单一来源）。
// 只拼定稿素材，一笔不重画：
//   mascot/otter-float.svg   仰躺抱石（第 116、117 条），拿掉它自带的那块浅雾薄荷水面（文件注释说可以整块拿掉）
//   illustration/kelp.svg    近处一株，深薄荷加浅雾薄荷中脉（第 112、114 条）
//   illustration/kelp-small.svg  远处几株，整株改成雾薄荷，只当景深（浅色贴页面看不见，所以不用浅色）
// 水面是一道石板墨细弧（§1.5：雾薄荷不画细线，水线用石板墨）。
// 输出 illustration/kelp-forest-2026-11-16.svg 和 evidence/kelp-forest-2026-11-16.png（240、360、480 宽，放在页面和桌面上）。
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = path.join(ROOT, 'design/brand-2026-10-13')
const OUT_SVG = path.join(B, 'illustration/kelp-forest-2026-11-16.svg')
const OUT_PNG = path.join(B, 'evidence/kelp-forest-2026-11-16.png')

const inner = (f, map = (s) => s) => {
  const src = readFileSync(path.join(B, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const vb = /viewBox="([^"]+)"/.exec(src)[1]
  const body = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1, src.lastIndexOf('</svg>'))
  return { vb: vb.split(/\s+/).map(Number), body: map(body.trim()) }
}
// 每个素材的 id 加前缀，免得几份拷贝撞 id
const prefixIds = (s, p) => s.replace(/id="([^"]+)"/g, `id="${p}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}-$1)`).replace(/href="#([^"]+)"/g, `href="#${p}-$1"`)
const place = (a, p, x, y, h) => { const [vx, vy, vw, vh] = a.vb; const w = (h * vw) / vh; return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${a.vb.join(' ')}" overflow="visible">${prefixIds(a.body, p)}</svg>` }

const W = 480, H = 300, SURF = 122
const otter = inner('mascot/otter-float.svg', (s) => s.replace(/<path id="water"[^>]*\/>/, ''))
const kelp = inner('illustration/kelp.svg')
const far = inner('illustration/kelp-small.svg', (s) => s.replace(/#2C6E56/gi, '#72BFA4'))

// 獭獭：画框 1071×603，身子最低处约在 y=752（目测）。身子下沿沉到水线下 12，读成浮在水里，不是躺在线上
const oW = 236, oS = oW / otter.vb[2], oH = otter.vb[3] * oS
const oX = (W - oW) / 2 - 14, oY = SURF + 12 - (752 - otter.vb[1]) * oS
// 近处巨藻：梢头长到獭獭身下，贴着身子下沿（画框顶离水面 -8，梢头上方有一段空），根在画框外
const kH = H + 6 - (SURF - 8), kX = 228
// 远处两株，矮一截，只当景深
const farK = [[70, 128], [352, 104]]
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<!-- 巨藻林中图（2026-11-16 重做，BRAND.md §5.2、第 126 条，提案 · 单一来源）：獭獭仰躺抱石漂在水面上，近处一株深薄荷巨藻从海底长到水面下，远处三株雾薄荷只当景深，一道石板墨细弧是水面。只拼定稿素材（otter-float.svg 去掉自带水面、kelp.svg、kelp-small.svg 改雾薄荷），没有重画。给 240–480px 的品牌位置（介绍、宣传），不进工具界面。由 scripts/brand/kelp-forest-mid.mjs 生成。 -->
<title>巨藻林中图</title>
${farK.map(([x, h], i) => place(far, 'far' + i, x, H + 4 - h, h)).join('\n')}
<path d="M14 ${SURF + 3}C150 ${SURF - 3} 330 ${SURF - 3} 466 ${SURF + 3}" fill="none" stroke="#29424D" stroke-width="2" stroke-linecap="round"/>
${place(kelp, 'near', kX, SURF - 8, kH)}
${place(otter, 'otter', oX, oY, oH)}
</svg>
`
writeFileSync(OUT_SVG, svg)

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const b = await chromium.launch({ channel: 'chromium' })
const p = await b.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 2 })
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
const cell = (w, bg, label) => `<figure style="background:${bg}"><img src="${uri}" width="${w}"><figcaption>${w}px · ${label}</figcaption></figure>`
await p.setContent(`<meta charset=utf-8><style>body{margin:24px;background:#E6EDF0;font:12px 'Noto Sans CJK SC',sans-serif;color:#60665C}.r{display:flex;gap:16px;align-items:flex-end;margin-bottom:16px}figure{margin:0;padding:20px;border-radius:12px}img{display:block}figcaption{margin-top:8px}</style>
<div class="r">${cell(480, '#FFFFFF', '内容面白')}${cell(360, '#F1F5F7', '页面')}</div><div class="r">${cell(240, '#FFFFFF', '内容面白')}${cell(240, '#F1F5F7', '页面')}${cell(240, '#E6EDF0', '桌面')}</div>`)
await p.waitForTimeout(300)
await p.screenshot({ path: OUT_PNG, fullPage: true })
await b.close()
console.log('SVG：' + path.relative(ROOT, OUT_SVG) + '\nPNG：' + path.relative(ROOT, OUT_PNG))
