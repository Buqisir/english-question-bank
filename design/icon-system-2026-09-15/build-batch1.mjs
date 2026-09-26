// 生成 batch1.html：首批 12 个（6 通用用 Solar 骨架重画 + 6 领域按新规则复核）的对照页。
//   node design/icon-system-2026-09-15/build-batch1.mjs
// 通用层 6 个是真的改了形（前后对照，取自 /tmp/icons-v3-before.mjs，即改动前的已提交版本）；
// 领域层 6 个跑 measure-craft.mjs 复核后已经达标，没有改形，这里只展示确认结果，不做假的"前后对照"。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generic as genericAfter, domain as domainAfter } from './icons-v3.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const beforeModule = await import(pathToFileURL('/tmp/icons-v3-before.mjs').href)
const genericBefore = beforeModule.generic

const svg = (ic, { size = 16, fill = false } = {}) =>
  `<svg class="ic s${size}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
  (fill && ic.fillShape ? `<g class="ic-fill">${ic.fillShape}</g>` : '') +
  `<g class="ic-line">${ic.line}</g></svg>`

const GENERIC_KEYS = ['x', 'settings', 'download', 'save', 'trash', 'printer']
const DOMAIN_KEYS = ['paper', 'paper-check', 'board-check', 'board-list', 'card', 'scissors']

const genericRow = (key) => {
  const before = genericBefore[key]
  const after = genericAfter[key]
  return `<div class="cmp">
    <div class="cmp-name">${after.zh}<span class="key">${key}</span></div>
    <div class="cell before"><span class="tag">改前</span>${svg(before, { size: 16 })}${svg(before, { size: 24 })}${svg(before, { size: 40 })}</div>
    <div class="cell after"><span class="tag">Solar 骨架</span>${svg(after, { size: 16 })}${svg(after, { size: 24 })}${svg(after, { size: 40 })}${after.fillShape ? svg(after, { size: 40, fill: true }) : ''}</div>
  </div>`
}

const domainRow = (key) => {
  const ic = domainAfter[key]
  return `<div class="cmp">
    <div class="cmp-name">${ic.zh}<span class="key">${key}</span></div>
    <div class="cell after full"><span class="tag ok">已复核达标 · 未改形</span>${svg(ic, { size: 16 })}${svg(ic, { size: 24 })}${svg(ic, { size: 40 })}${ic.fillShape ? svg(ic, { size: 40, fill: true }) : ''}</div>
  </div>`
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>首批 12 个 · Solar 骨架 + 领域复核</title>
<style>
  :root { --desk-page: #F3F6F0; --desk-surface: #FAFCF8; --desk-raised: #FAFDF7; --border-subtle: #E3E8DF; --ink: #191D18; --ink-muted: #60665C; --ink-faint: #9A9D97; --accent: #4199E3; --ok: #659B7B; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--desk-page); color: var(--ink); font: 14px/1.5 Inter, "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 980px; margin: 0 auto; padding: 40px 32px 96px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 40px 0 8px; }
  .lede, .note { color: var(--ink-muted); margin: 0 0 14px; max-width: 76ch; }
  .key { display: block; font: 11px/1.4 ui-monospace, Menlo, monospace; color: var(--ink-faint); }
  .ic { display: inline-block; vertical-align: middle; color: currentColor; margin-right: 10px; }
  .ic-line { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.75; }
  .ic.s16 .ic-line { stroke-width: 2.25; }
  .ic .dot { fill: currentColor; stroke: none; }
  .ic-fill { fill: currentColor; opacity: .16; stroke: none; }
  .ic-fill .dot { fill: none; }
  .ic .joint { fill: currentColor; stroke: none; }
  .grid { display: flex; flex-direction: column; gap: 8px; }
  .cmp { display: grid; grid-template-columns: 160px 1fr 1fr; align-items: center; gap: 12px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 16px; }
  .cmp-name { font-size: 13px; }
  .cell { display: flex; align-items: center; padding: 8px 10px; border-radius: 8px; position: relative; }
  .cell.before { background: #F0F0EC; color: var(--ink-faint); }
  .cell.after { background: color-mix(in srgb, var(--accent) 8%, var(--desk-raised)); }
  .cell.full { grid-column: span 2; }
  .tag { position: absolute; top: -9px; left: 8px; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--ink-faint); color: #fff; }
  .tag.ok { background: var(--ok); }
  .stat { font-size: 12px; color: var(--ink-muted); background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 14px; margin: 8px 0 18px; }
  .stat b { color: var(--ink); }
</style></head>
<body><main>
  <h1>首批 12 个 · Solar 骨架借用 + 领域层复核（2026-09-25）</h1>
  <p class="lede">按 Owner 约定的第一步：6 个通用图标真的用 Solar Linear 的路径骨架重画（不是简单调间距），
  6 个领域图标对照 craft-rules.md 的量化规则复核。放在同一页，看两层是不是一体的。</p>

  <h2>A · 通用层 6 个 —— 用 Solar 骨架重画</h2>
  <p class="note">左边灰色是改动前（原来的手绘形），右边是借用 Solar Linear 对应图标骨架重画后的样子。
    settings 沿用 Solar 齿轮路径本身；download / trash 参考 Solar 的比例但自己改画（原因见 craft-rules.md
    §借骨架：直接搭 Solar 贝塞尔会把边距 / 净空拉到 R1、R4 的目标以下）。</p>
  <div class="grid">${GENERIC_KEYS.map(genericRow).join('\n')}</div>

  <h2>B · 领域层 6 个 —— 按新规则复核</h2>
  <p class="note">这 6 个（纸 / 教师版 / 单词复习 / 草稿卷 / 单词卡 / 剪刀）在第一批（改折角纸家族）时没有动过。
    用 measure-craft.mjs 逐个量过：边距、净空、洞全部在 craft-rules.md 的目标或下限之上，暂不需要改形。</p>
  <div class="grid">${DOMAIN_KEYS.map(domainRow).join('\n')}</div>
  <p class="stat">复核数字（craft-rules R1 边距目标 1.25 / R4 净空目标 2.25·下限 1.5 / R5 洞目标 2.25）：<br/>
    <b>paper</b> 边距 1.38、净空 1.75、洞 7/2.41 ——
    <b>paper-check</b> 边距 1.38、净空 1.52、洞 7.96/2.41 ——
    <b>board-check</b> 边距 1.37、净空 1.75、洞 5.94 ——
    <b>board-list</b> 边距 1.37、净空 2.0、洞 4.84 ——
    <b>card</b> 边距 1.63、净空 1.75、洞 6.6 ——
    <b>scissors</b> 边距 2.38、洞 3.41/3.41，均达标。</p>
</main></body></html>`

writeFileSync(join(here, 'batch1.html'), html)
console.log('wrote batch1.html:', GENERIC_KEYS.length, 'generic redrawn +', DOMAIN_KEYS.length, 'domain verified')
