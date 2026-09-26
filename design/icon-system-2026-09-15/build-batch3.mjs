// 生成 batch3.html：通用层收口时换掉的 4 个图标。
//   node design/icon-system-2026-09-15/build-batch3.mjs
// 改前取自提交 ba0ca40a 的 icons-v3.mjs（这 4 个在第二批里没动过）。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generic as after } from './icons-v3.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const before = (await import(pathToFileURL('/tmp/icons-v3-before-batch3.mjs').href)).generic
const keys = ['pause', 'link', 'volume', 'folder-plus']

const svg = (ic, { size = 16, fill = false } = {}) =>
  `<svg class="ic s${size}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
  (fill && ic.fillShape ? `<g class="ic-fill">${ic.fillShape}</g>` : '') +
  `<g class="ic-line">${ic.line}</g></svg>`

const row = (key) => `<div class="cmp">
    <div class="cmp-name">${after[key].zh}<span class="key">${key}</span></div>
    <div class="cell before"><span class="tag">改前</span>${svg(before[key], { size: 16 })}${svg(before[key], { size: 24 })}${svg(before[key], { size: 40 })}</div>
    <div class="cell after"><span class="tag">Solar 骨架</span>${svg(after[key], { size: 16 })}${svg(after[key], { size: 24 })}${svg(after[key], { size: 40 })}${after[key].fillShape ? svg(after[key], { size: 40, fill: true }) : ''}</div>
  </div>`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>收口 · 4 个通用图标</title>
<style>
  :root { --desk-page: #F3F6F0; --desk-surface: #FAFCF8; --desk-raised: #FAFDF7; --border-subtle: #E3E8DF; --ink: #191D18; --ink-muted: #60665C; --ink-faint: #9A9D97; --accent: #4199E3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--desk-page); color: var(--ink); font: 14px/1.5 Inter, "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 980px; margin: 0 auto; padding: 40px 32px 96px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: var(--ink-muted); margin: 0 0 18px; max-width: 76ch; }
  .key { display: block; font: 11px/1.4 ui-monospace, Menlo, monospace; color: var(--ink-faint); }
  .ic { display: inline-block; vertical-align: middle; color: currentColor; margin-right: 10px; }
  .ic-line { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.75; }
  .ic.s16 .ic-line { stroke-width: 2.25; }
  .ic .dot { fill: currentColor; stroke: none; }
  .ic-fill { fill: currentColor; opacity: .16; stroke: none; }
  .grid { display: flex; flex-direction: column; gap: 8px; }
  .cmp { display: grid; grid-template-columns: 160px 1fr 1fr; align-items: center; gap: 12px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 16px; }
  .cmp-name { font-size: 13px; }
  .cell { display: flex; align-items: center; padding: 8px 10px; border-radius: 8px; position: relative; }
  .cell.before { background: #F0F0EC; color: var(--ink-faint); }
  .cell.after { background: color-mix(in srgb, var(--accent) 8%, var(--desk-raised)); }
  .tag { position: absolute; top: -9px; left: 8px; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--ink-faint); color: #fff; }
</style></head>
<body><main>
  <h1>收口 · 暂停、链接、朗读、新建词组（2026-09-26）</h1>
  <p class="lede">通用层剩下的图标里，这 4 个换了 Solar 骨架。箭头、撤销、筛选、扫码、图钉、标签、听写、讲评、个人空间留着，原因在 craft-rules.md 收口一节。</p>
  <div class="grid">${keys.map(row).join('\n')}</div>
</main></body></html>`

writeFileSync(join(here, 'batch3.html'), html)
console.log('wrote batch3.html', keys.length)
