// Keyline + overlap audit for the EQB set (2026-11-02, Owner decisions Q6 and the set-wide "让" rule).
//   node design/icon-system-v2-2026-11-02/tools/keyline-audit.mjs [--out audit.json]
// 1. Visual size: convex-hull area of the rendered ink (stroke 2.25) compared with a circle container
//    (ink radius 10.375 → 338.2 units²). Squares / portraits may not exceed it; landscapes (w/h > 1.1) may
//    exceed it by 10%, matching the reference sheet. Reports the shrink factor k (only shrinks).
// 2. Overlap: renders each top-level element alone and reports pairs whose ink overlaps, i.e. parts that
//    touch or cross without a gap. Pairs meant to join (arrow head on shaft) still need human triage.
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const v3dir = join(root, 'design/icon-system-2026-09-15')
const outIdx = process.argv.indexOf('--out')
const outPath = outIdx === -1 ? null : process.argv[outIdx + 1]

const v3 = await import(pathToFileURL(join(v3dir, 'icons-v3.mjs')))
const STROKE = 2.25
const markupOf = (icon) => icon.line
  .replace(/\s*data-stroke-small="([^"]+)"([^>]*?)stroke-width="[^"]+"/g, ' stroke-width="$1"$2')
  .replace(/stroke-width="([^"]+)"([^>]*?)\s*data-stroke-small="([^"]+)"/g, 'stroke-width="$3"$2')
  .replace(/class="dot"/g, 'fill="currentColor" stroke="none"')
  .replace(/class="joint"/g, 'fill="currentColor" stroke="none"')

const candIdx = process.argv.indexOf('--candidates')
const { readFile } = await import('node:fs/promises')
const jobs = candIdx !== -1
  ? Object.entries(JSON.parse(await readFile(process.argv[candIdx + 1], 'utf8'))).map(([name, markup]) => ({ name, markup, stroke: STROKE }))
  : Object.entries(v3.all).map(([name, icon]) => ({ name, markup: markupOf(icon), stroke: icon.strokeWidth ?? STROKE }))

const require = createRequire(join(root, 'app/package.json'))
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
await page.setContent('<!doctype html><body></body>')

const results = await page.evaluate(async (jobs) => {
  const PX = 10 // px per unit
  const N = 24 * PX
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const load = (svg) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) })
  const wrap = (inner, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${N}" height="${N}" fill="none" stroke="#000" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" color="#000">${inner.replace(/currentColor/g, '#000')}</svg>`
  async function mask(inner, stroke) {
    ctx.clearRect(0, 0, N, N); ctx.drawImage(await load(wrap(inner, stroke)), 0, 0)
    const d = ctx.getImageData(0, 0, N, N).data; const m = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0
    return m
  }
  function hullArea(m) {
    const pts = []
    for (let y = 0; y < N; y++) { let l = -1, r = -1; for (let x = 0; x < N; x++) if (m[y * N + x]) { if (l < 0) l = x; r = x } if (l >= 0) { pts.push([l, y], [r + 1, y], [l, y + 1], [r + 1, y + 1]) } }
    if (pts.length < 3) return { area: 0, w: 0, h: 0 }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const lower = [], upper = []
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
    for (const p of pts.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
    let a = 0; for (let i = 0; i < hull.length; i++) { const [x1, y1] = hull[i], [x2, y2] = hull[(i + 1) % hull.length]; a += x1 * y2 - x2 * y1 }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    return { area: Math.abs(a) / 2 / (PX * PX), w: (Math.max(...xs) - Math.min(...xs)) / PX, h: (Math.max(...ys) - Math.min(...ys)) / PX }
  }
  const parser = new DOMParser()
  const out = []
  for (const job of jobs) {
    const whole = await mask(job.markup, job.stroke)
    const hull = hullArea(whole)
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${job.markup}</svg>`, 'image/svg+xml')
    const parts = [...doc.documentElement.children].map((n) => new XMLSerializer().serializeToString(n).replace(/ xmlns="[^"]*"/g, ''))
    const overlaps = []
    if (parts.length > 1 && parts.length <= 8) {
      const masks = []; for (const p of parts) masks.push(await mask(p, job.stroke))
      for (let a = 0; a < masks.length; a++) for (let b = a + 1; b < masks.length; b++) {
        let n = 0; for (let i = 0; i < N * N; i++) if (masks[a][i] && masks[b][i]) n++
        if (n > 0) overlaps.push({ a, b, px: n, units2: +(n / (PX * PX)).toFixed(2) })
      }
    }
    out.push({ name: job.name, parts: parts.length, hull, overlaps })
  }
  return out
}, jobs)
await browser.close()

const CIRCLE = Math.PI * 10.375 ** 2
const rows = results.map((r) => {
  const aspect = r.hull.h ? r.hull.w / r.hull.h : 1
  const allowance = aspect > 1.1 ? 1.1 : 1
  const ratio = r.hull.area / CIRCLE
  const k = ratio > allowance ? Math.sqrt(allowance / ratio) : 1
  return { ...r, aspect: +aspect.toFixed(2), ratio: +ratio.toFixed(3), k: +k.toFixed(3) }
})
if (outPath) await writeFile(outPath, JSON.stringify(rows, null, 1))
const shrink = rows.filter((r) => r.k < 0.985).sort((a, b) => a.k - b.k)
console.log(`circle hull ${CIRCLE.toFixed(1)} units²; ${rows.length} icons; ${shrink.length} need shrinking (k < 0.985)`)
for (const r of shrink) console.log(`  ${r.name.padEnd(22)} hull ${r.hull.area.toFixed(1).padStart(6)}  ${r.hull.w.toFixed(1)}×${r.hull.h.toFixed(1)}  ratio ${r.ratio}  k ${r.k}`)
const ov = rows.filter((r) => r.overlaps.length)
console.log(`\n${ov.length} icons have parts whose ink overlaps:`)
for (const r of ov) console.log(`  ${r.name.padEnd(22)} ${r.overlaps.map((o) => `${o.a}×${o.b}:${o.units2}`).join('  ')}`)
