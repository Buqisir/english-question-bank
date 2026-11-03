// Join icon call sites with a static estimate of neighbouring text font-size/weight from app CSS.
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const rows = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const css = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.css')) css.push(fs.readFileSync(p, 'utf8'))
  }
})(path.join(root, 'app/src'))

const map = new Map()
for (const text of css) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const fs_ = m[2].match(/font-size:\s*([\d.]+px)/)
    const fw = m[2].match(/font-weight:\s*(\d+)/)
    if (!fs_ && !fw) continue
    for (const sel of m[1].split(',')) {
      const last = sel.trim().split(/\s+/).pop() || ''
      const cls = last.match(/^\.([\w-]+)$/)
      if (!cls) continue
      const prev = map.get(cls[1]) || {}
      map.set(cls[1], { size: prev.size || fs_?.[1], weight: prev.weight || fw?.[1] })
    }
  }
}

const out = rows.map((r) => {
  let hit = null
  for (const tok of (r.parentClass || '').split(/\s+/)) {
    const v = map.get(tok.replace(/\$\{.*$/, ''))
    if (v && v.size) { hit = { tok, ...v }; break }
  }
  return { ...r, textSize: hit?.size || '', textWeight: hit?.weight || '', viaClass: hit?.tok || '' }
})
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1))
const known = out.filter((r) => r.textSize)
console.log('rows', out.length, 'with text size estimate', known.length)
const pair = {}
for (const r of known) { const k = `${r.size} | ${r.textSize}`; pair[k] = (pair[k] || 0) + 1 }
console.log(Object.entries(pair).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('\n'))
