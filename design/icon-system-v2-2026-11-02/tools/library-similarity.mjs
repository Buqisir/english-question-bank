// How close are our drawings to Lucide's? (2026-11-02, Owner: "我是不想模仿别人的")
//   node design/icon-system-v2-2026-11-02/tools/library-similarity.mjs <map.json>
// map.json = { "<set name>": { "<our name>": "<svg inner markup>" } }
// Renders ours and the mapped Lucide icon(s) on the same 24 grid with the same stroke (2.25) and reports
// the ink IoU (intersection / union). Same grid, no alignment search: a high score means the same
// construction in the same place, not just the same idea.
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const require = createRequire(join(root, 'app/package.json'))
const lucideDir = join(dirname(require.resolve('lucide-react/package.json')), 'dist/esm/icons')

const MAP = {
  check: ['check'], 'rotate-ccw': ['rotate-ccw'], search: ['search'], download: ['download'], copy: ['copy'],
  trash: ['trash', 'trash-2'], folder: ['folder'], bell: ['bell'], paper: ['file-text', 'file', 'sticky-note'],
  'vocabulary-notebook': ['book-a', 'notebook'], 'question-group': ['list-ordered'], headphones: ['headphones'],
}
async function lucide(name) {
  const src = await readFile(join(lucideDir, `${name}.mjs`), 'utf8')
  const literal = src.match(/const __iconNode = (\[[\s\S]*?\]);\n/)[1]
  const nodes = Function(`"use strict"; return (${literal})`)()
  return nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
}

const sets = JSON.parse(await readFile(process.argv[2], 'utf8'))
const jobs = []
for (const [set, icons] of Object.entries(sets)) for (const [name, markup] of Object.entries(icons)) for (const l of MAP[name] ?? []) jobs.push({ set, name, lib: l, ours: markup, theirs: await lucide(l) })

const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
const out = await page.evaluate(async (jobs) => {
  const N = 240; const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d', { willReadFrequently: true })
  const load = (s) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${N}" height="${N}" fill="none" stroke="#000" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${s.replace(/currentColor/g, '#000')}</svg>`) })
  const mask = async (s) => { x.clearRect(0, 0, N, N); x.drawImage(await load(s), 0, 0); const d = x.getImageData(0, 0, N, N).data; const m = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] > 127; return m }
  const res = []
  // Construction similarity: crop each ink to its own bounding box and resample to M x M before comparing.
  const M = 96
  const norm = (m) => { let x0 = N, y0 = N, x1 = 0, y1 = 0; for (let i = 0; i < N * N; i++) if (m[i]) { const px = i % N, py = (i / N) | 0; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py) }
    const o = new Uint8Array(M * M), w = x1 - x0 + 1, h = y1 - y0 + 1; for (let v = 0; v < M; v++) for (let u = 0; u < M; u++) o[v * M + u] = m[(y0 + Math.floor(v * h / M)) * N + (x0 + Math.floor(u * w / M))]; return o }
  const iou = (a, b) => { let I = 0, U = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++ } return +(I / U).toFixed(3) }
  for (const j of jobs) { const a = await mask(j.ours), b = await mask(j.theirs); res.push({ set: j.set, name: j.name, lib: j.lib, iou: iou(a, b), shape: iou(norm(a), norm(b)) }) }
  return res
}, jobs)
await browser.close()

const best = {}
for (const r of out) { const k = `${r.set}|${r.name}`; if (!best[k] || Math.max(r.iou, r.shape) > Math.max(best[k].iou, best[k].shape)) best[k] = r }
const names = [...new Set(out.map((r) => r.name))]
const setNames = Object.keys(sets)
console.log(['icon'.padEnd(20), ...setNames.map((s) => s.padStart(14))].join(''))
for (const n of names) console.log([n.padEnd(20), ...setNames.map((s) => { const r = best[`${s}|${n}`]; return r ? `${r.iou.toFixed(2)}/${r.shape.toFixed(2)}`.padStart(14) : ''.padStart(14) })].join(''))
console.log(JSON.stringify(best))
