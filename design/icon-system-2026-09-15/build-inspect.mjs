// 64px 自检页：所有字形放大到 64，专看拐角、相接处、净空。node design/icon-system-2026-09-15/build-inspect.mjs → inspect-64.html
import { writeFileSync } from 'node:fs'
import { generic, domain, passage } from './icons-v3.mjs'
const svg = (ic, size, fill) => `<svg class="ic${fill ? ' ic-fill' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">${fill && ic.fillShape ? `<g class="fill">${ic.fillShape}</g>` : ''}<g>${ic.line}</g></svg>`
const cell = (k, ic) => `<div class="c">${svg(ic, 64)}${ic.fillShape ? svg(ic, 64, true) : ''}<span>${k}</span></div>`
const all = { ...generic, ...domain, ...passage }
writeFileSync(new URL('./inspect-64.html', import.meta.url), `<!doctype html><meta charset=utf-8><style>
body{background:#f4f4f1;font:11px ui-monospace,monospace;color:#555;margin:16px}
.g{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
.c{background:#fff;border-radius:10px;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;color:#1b1c1a}
.c span{color:#888}
.ic .dot{fill:currentColor;stroke:none}.ic-fill .dot{fill:none}.ic .joint{fill:currentColor;stroke:none}.ic-fill .fill{fill:currentColor;opacity:.16;stroke:none}
</style><div class=g>${Object.entries(all).map(([k, ic]) => cell(k, ic)).join('')}</div>`)
console.log(Object.keys(all).length)
