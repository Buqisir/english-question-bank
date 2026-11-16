#!/usr/bin/env node
// 林冠透光中图重做（BRAND.md §5.2；第 114 条停用旧图、说以后重做；第 127 条，2026-11-16，提案 · 单一来源）。
// 只拼定稿素材，一笔不重画，配色照宣传大图的深水（§1.5）：
//   一块深薄荷的水，上沿平直就是水面；三束浅雾薄荷光从右上往左下约 22° 斜照，水面处窄、往下变宽，画在巨藻后面
//   illustration/kelp.svg  整株换成雾薄荷（深水里的巨藻换浅一档，第 58 条的老规矩），中脉保持浅雾薄荷
//   mascot/otter-float.svg 仰躺抱石，拿掉自带的水面，身子下沿贴着水面上沿
// 输出 illustration/kelp-canopy-2026-11-16.svg 和 evidence/kelp-canopy-2026-11-16.png
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = path.join(ROOT, 'design/brand-2026-10-13')
const OUT_SVG = path.join(B, 'illustration/kelp-canopy-2026-11-16.svg')
const OUT_PNG = path.join(B, 'evidence/kelp-canopy-2026-11-16.png')

const inner = (f, map = (s) => s) => {
  const src = readFileSync(path.join(B, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const vb = /viewBox="([^"]+)"/.exec(src)[1]
  const body = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1, src.lastIndexOf('</svg>'))
  return { vb: vb.split(/\s+/).map(Number), body: map(body.trim()) }
}
const prefixIds = (s, p) => s.replace(/id="([^"]+)"/g, `id="${p}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}-$1)`).replace(/href="#([^"]+)"/g, `href="#${p}-$1"`)
const place = (a, p, x, y, h, flip = false) => {
  const [, , vw, vh] = a.vb; const w = (h * vw) / vh
  const svg = `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${a.vb.join(' ')}" overflow="visible">${prefixIds(a.body, p)}</svg>`
  return flip ? `<g transform="translate(${(2 * x + w).toFixed(1)} 0) scale(-1 1)">${svg}</g>` : svg
}

const W = 480, H = 300, SURF = 96, R = 20
const otter = inner('mascot/otter-float.svg', (s) => s.replace(/<path id="water"[^>]*\/>/, ''))
const kelp = inner('illustration/kelp.svg', (s) => s.replace(/#2C6E56/gi, '#72BFA4'))

// 水块：上沿平直，下面两个角圆
const water = `M0 ${SURF}H${W}V${H - R}Q${W} ${H} ${W - R} ${H}H${R}Q0 ${H} 0 ${H - R}Z`
// 光：斜度 tan(22°)，三束宽窄不一
const t = Math.tan((22 * Math.PI) / 180), drop = H + 20 - SURF
const beam = (x, top, bot) => `M${x - top / 2} ${SURF}L${x + top / 2} ${SURF}L${x - drop * t + bot / 2} ${H + 20}L${x - drop * t - bot / 2} ${H + 20}Z`
const beams = [beam(456, 4, 20), beam(372, 7, 30), beam(282, 3, 14)].join(' ')
// 巨藻：近处两株、远处一株矮的，高矮错开；梢头停在水面下，不碰獭獭
const kelps = [[30, SURF + 22, false], [334, SURF + 12, true], [214, SURF + 70, false]]
// 獭獭：画框 1071×603，身子最低处约在 y=752（目测），下沿沉进水面 16，读成浮在水里，不是坐在水块上
const oW = 212, oS = oW / otter.vb[2], oH = otter.vb[3] * oS
const oX = 96, oY = SURF + 16 - (752 - otter.vb[1]) * oS

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<!-- 林冠透光中图（2026-11-16 重做，BRAND.md §5.2、第 127 条，提案 · 单一来源）：一块深薄荷的水，上沿就是水面；三束浅雾薄荷光从右上往左下约 22° 斜照，上窄下宽，画在巨藻后面；三株雾薄荷巨藻（中脉浅雾薄荷）高矮错开；獭獭仰躺抱石漂在水面上。只拼定稿素材（kelp.svg 换雾薄荷、otter-float.svg 去掉自带水面），没有重画。自带一块水，比另两张中图重，只给一次性的大品牌位置（240–480px），不做空态、不当背景、不进工具界面。由 scripts/brand/kelp-canopy-mid.mjs 生成。 -->
<title>林冠透光中图</title>
<clipPath id="water-clip"><path d="${water}"/></clipPath>
<path id="water" d="${water}" fill="#2C6E56"/>
<g id="light" clip-path="url(#water-clip)"><path d="${beams}" fill="#DDF1E8"/></g>
<g id="kelp" clip-path="url(#water-clip)">
${kelps.map(([x, y, f], i) => place(kelp, 'k' + i, x, y, H + 10 - y, f)).join('\n')}
</g>
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
