// Static inventory of EQB icon call sites in app/src.
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const src = path.join(root, 'app/src')
const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!p.includes(`${path.sep}icons${path.sep}generated`)) walk(p) }
    else if (/\.tsx$/.test(e.name)) files.push(p)
  }
})(src)

const rows = []
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  const names = new Set()
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']*icons[^']*)'/g)) {
    if (/lucide/.test(m[2])) continue
    for (const raw of m[1].split(',')) {
      const n = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim()
      if (/^[A-Z]/.test(n) && !/Props|Variant/.test(n)) names.add(n)
    }
  }
  // component-valued maps like icon: Copy — count as indirect
  for (const n of names) {
    const re = new RegExp(`<${n}\\b([^>]*?)\\/?>`, 'gs')
    for (const m of text.matchAll(re)) {
      const attrs = m[1]
      const get = (k) => { const r = attrs.match(new RegExp(`${k}=\\{([^}]*)\\}|${k}="([^"]*)"`)); return r ? (r[1] ?? r[2]).trim() : '' }
      const before = text.slice(Math.max(0, m.index - 400), m.index)
      const cls = [...before.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)].pop()
      const line = text.slice(0, m.index).split('\n').length
      rows.push({ file: path.relative(root, f), line, icon: n, size: get('size') || '(默认24)', strokeWidth: get('strokeWidth'), variant: get('variant') || 'line', parentClass: cls ? (cls[1] || cls[2]) : '' })
    }
    // indirect references (passed as component values)
    const refRe = new RegExp(`(?<![<\\w])${n}(?=[,\\s}\\]])`, 'g')
    const importEnd = text.indexOf('\n', text.lastIndexOf('import '))
    for (const m of text.slice(importEnd).matchAll(refRe)) {
      const idx = importEnd + m.index
      const line = text.slice(0, idx).split('\n').length
      rows.push({ file: path.relative(root, f), line, icon: n, size: '(间接引用)', strokeWidth: '', variant: '', parentClass: '' })
    }
  }
}
console.log(JSON.stringify(rows))
