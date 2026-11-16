#!/usr/bin/env node
// 潜水中图重做（BRAND.md §5.2；第 114 条停用旧图、说以后重做；第 127 条，2026-11-16，提案 · 单一来源）。
// 只拼定稿素材，一笔不重画：
//   mascot/otter-dive-2026-11-16.svg  新潜水姿势（照草图 C 描，脸用头像母版，scripts/brand/dive-trace.py）
//   illustration/kelp.svg    近处一株，深薄荷加浅雾薄荷中脉（第 112、114 条）
//   illustration/kelp-small.svg  远处几株，整株改成雾薄荷，只当景深（浅色贴页面看不见，所以不用浅色）
// 水面是一道石板墨细弧（§1.5：雾薄荷不画细线，水线用石板墨）。
// 输出 illustration/kelp-dive-2026-11-16.svg 和 evidence/kelp-dive-2026-11-16.png（240、360、480 宽，放在页面和桌面上）。
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = path.join(ROOT, 'design/brand-2026-10-13')
const OUT_SVG = path.join(B, 'illustration/kelp-dive-2026-11-16.svg')
const OUT_PNG = path.join(B, 'evidence/kelp-dive-2026-11-16.png')

const inner = (f, map = (s) => s) => {
  const src = readFileSync(path.join(B, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const vb = /viewBox="([^"]+)"/.exec(src)[1]
  const body = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1, src.lastIndexOf('</svg>'))
  return { vb: vb.split(/\s+/).map(Number), body: map(body.trim()) }
}
// 每个素材的 id 加前缀，免得几份拷贝撞 id
const prefixIds = (s, p) => s.replace(/id="([^"]+)"/g, `id="${p}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}-$1)`).replace(/href="#([^"]+)"/g, `href="#${p}-$1"`)
const place = (a, p, x, y, h) => { const [vx, vy, vw, vh] = a.vb; const w = (h * vw) / vh; return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${a.vb.join(' ')}" overflow="visible">${prefixIds(a.body, p)}</svg>` }

const W = 480, H = 300, SURF = 24
const otter = inner('mascot/otter-dive-2026-11-16.svg')
const kelp = inner('illustration/kelp.svg')
const far = inner('illustration/kelp-small.svg', (s) => s.replace(/#2C6E56/gi, '#72BFA4'))

// 獭獭：右上往左下潜，尾尖离水面一段（刚潜下去），头朝左下那株巨藻
const oW = 236, oH = (otter.vb[3] * oW) / otter.vb[2]
const oX = 200, oY = SURF + 30
// 近处巨藻在左下，梢头到画面中段；远处两株矮的雾薄荷只当景深
const kX = 30, kTop = 76, kH = H + 6 - kTop
const farK = [[148, 132], [410, 96]]
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<!-- 潜水中图（2026-11-16 重做，BRAND.md §5.2、第 127 条，提案 · 单一来源）：獭獭从右上往左下潜进巨藻林，近处一株深薄荷巨藻在左下，远处两株雾薄荷只当景深，上沿一道石板墨细弧是水面。獭獭是新描的潜水姿势 mascot/otter-dive-2026-11-16.svg，巨藻用定稿 kelp.svg、kelp-small.svg（改雾薄荷）。和巨藻林中图成对：左边潜下去摸，右边浮上来收。给 240–480px 的品牌位置，不进工具界面。由 scripts/brand/kelp-dive-mid.mjs 生成。 -->
<title>潜水中图</title>
${farK.map(([x, h], i) => place(far, 'far' + i, x, H + 4 - h, h)).join('\n')}
<path d="M14 ${SURF + 3}C150 ${SURF - 3} 330 ${SURF - 3} 466 ${SURF + 3}" fill="none" stroke="#29424D" stroke-width="2" stroke-linecap="round"/>
${place(kelp, 'near', kX, kTop, kH)}
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
