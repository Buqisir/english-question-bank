// 生成 sheet.html：提案笔触 vs 现有 Lucide，落进真实桌面色阶里看。
//   node design/icon-system-2026-09-15/build-sheet.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { icons, passageIcons } from './icons.mjs'
import { iconsV2, sheetFamily, passageIconsV2, primitives } from './icons-v2.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const lucideDir = join(here, '../../app/node_modules/lucide-react/dist/esm/icons')

async function lucide(name) {
  const mod = await import(join(lucideDir, `${name}.mjs`))
  return mod.__iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
}

const svg = (inner, { size = 16, cls = '', fill = false, shape = '' } = {}) =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
  // 样张里把 3–21 活区按 1.06 放大到 2.5–21.5；正式源件直接按 2.5–21.5 绘制。
  `<g transform="translate(12 12) scale(1.06) translate(-12 -12)">` +
  (fill && shape ? `<g class="ic-fill">${shape}</g>` : '') +
  `<g class="ic-line">${inner}</g></g></svg>`

const lucideSvg = (inner, size = 16) =>
  `<svg class="ic lucide" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><g class="ic-line">${inner}</g></svg>`

// v2 直接画在活区，不做放大。
const svg2 = (inner, { size = 16, fill = false, shape = '', cls = '' } = {}) =>
  `<svg class="ic v2 ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
  (fill && shape ? `<g class="ic-fill">${shape}</g>` : '') +
  `<g class="ic-line">${inner}</g></svg>`

const lucideNodes = {}
for (const name of new Set([...Object.keys(icons), ...Object.keys(iconsV2)])) lucideNodes[name] = await lucide(name)

const tripleRows = Object.entries(iconsV2)
  .map(([name, ic]) => {
    const v1 = icons[name]
    return `<div class="triple">
      <div class="pair-name">${ic.zh}<span class="pair-key">${name}</span></div>
      <div class="cell"><span class="tag">Lucide</span>${lucideSvg(lucideNodes[name], 16)}${lucideSvg(lucideNodes[name], 24)}</div>
      <div class="cell"><span class="tag">v1 粗描边</span>${v1 ? svg(v1.line, { size: 16 }) + svg(v1.line, { size: 24 }) : '<span class="pair-key">—</span>'}</div>
      <div class="cell cell-v2"><span class="tag">v2 形体</span>${svg2(ic.line, { size: 16 })}${svg2(ic.line, { size: 24 })}</div>
    </div>`
  })
  .join('\n')

const primitiveRow = Object.entries(primitives)
  .map(([k, p]) => `<div class="prim">${svg2(p.line, { size: 40 })}<span>${p.zh}</span><span class="pair-key">${k}</span></div>`)
  .join('')

const familyRow = Object.entries(sheetFamily)
  .map(
    ([k, p]) => `<div class="fam"><div class="fam-r">${svg2(p.line, { size: 16 })}${svg2(p.line, { size: 24 })}${svg2(p.line, { size: 40, fill: true, shape: p.fillShape })}</div><span>${p.zh}</span><span class="pair-key">${k}</span></div>`,
  )
  .join('')

const passageRow2 = Object.entries(passageIconsV2)
  .map(
    ([key, p]) => `<div class="ptype" style="--p:${p.color}">
      <span class="pchip pchip-line">${svg2(p.line, { size: 18 })}${p.zh}</span>
      <span class="pchip pchip-fill">${svg2(p.line, { size: 18, fill: true, shape: p.fillShape })}${p.zh}</span>
      <span class="pbig">${svg2(p.line, { size: 40, fill: true, shape: p.fillShape })}</span>
    </div>`,
  )
  .join('\n')

const passageOldVsNew = Object.keys(passageIconsV2)
  .map((k) => `<div class="cell"><span class="tag">${passageIcons[k].zh}</span><span style="color:${passageIcons[k].color}">${svg(passageIcons[k].line, { size: 18 })}<span class="arrow">→</span>${svg2(passageIconsV2[k].line, { size: 18 })}</span></div>`)
  .join('')

const dotRow = ['ellipsis', 'eye', 'archive', 'settings', 'book-marked', 'printer']
  .map((k) => svg2(iconsV2[k].line, { size: 32, cls: 'dot-hi' }))
  .join('')

const pairRows = Object.entries(icons)
  .map(([name, ic]) => {
    return `<div class="pair">
      <div class="pair-name">${ic.zh}<span class="pair-key">${name}</span></div>
      <div class="pair-cells">
        <div class="cell"><span class="tag">Lucide</span>${lucideSvg(lucideNodes[name], 16)}${lucideSvg(lucideNodes[name], 24)}${lucideSvg(lucideNodes[name], 40)}</div>
        <div class="cell"><span class="tag">提案</span>${svg(ic.line, { size: 16 })}${svg(ic.line, { size: 24 })}${svg(ic.line, { size: 40 })}</div>
      </div>
    </div>`
  })
  .join('\n')

const passageRow = Object.entries(passageIcons)
  .map(
    ([key, p]) => `<div class="ptype" style="--p:${p.color}">
      <span class="pchip pchip-line">${svg(p.line, { size: 18 })}${p.zh}</span>
      <span class="pchip pchip-fill">${svg(p.line, { size: 18, fill: true, shape: p.fillShape })}${p.zh}</span>
      <span class="pbig">${svg(p.line, { size: 40, fill: true, shape: p.fillShape })}</span>
    </div>`,
  )
  .join('\n')

const ramp = [12, 14, 16, 18, 20, 24, 32, 40]
  .map((s) => `<div class="ramp-cell">${svg(icons['clipboard-list'].line, { size: s })}<span>${s}</span></div>`)
  .join('')

const strokes = [1.6, 1.8, 2, 2.25, 2.5]
  .map(
    (w) =>
      `<div class="ramp-cell" style="--icon-stroke:${w}">${svg(icons.printer.line, { size: 20 })}${svg(icons.eye.line, { size: 20 })}${svg(icons.search.line, { size: 20 })}<span>${w}px</span></div>`,
  )
  .join('')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>图标方向样张 · 2026-09-15</title>
<style>
  :root {
    --desk-page: #F3F6F0; --desk-surface: #FAFCF8; --desk-raised: #FAFDF7; --desk-hover: #E5EAE1;
    --border: #D5DACF; --border-subtle: #E3E8DF; --ink: #191D18; --ink-muted: #60665C; --ink-faint: #9A9D97;
    --action: #1F1F1D; --identity: #2C6E56;
    --icon-stroke: 2.25;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--desk-page); color: var(--ink); font: 14px/1.5 Inter, "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1120px; margin: 0 auto; padding: 40px 32px 96px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
  h2 { font-size: 14px; font-weight: 600; margin: 48px 0 4px; }
  .lede, .note { color: var(--ink-muted); margin: 0 0 16px; max-width: 72ch; }
  .note { font-size: 13px; }
  .ic { display: inline-block; vertical-align: middle; flex-shrink: 0; }
  .ic .ic-line { fill: none; stroke: currentColor; stroke-width: var(--icon-stroke); stroke-linecap: round; stroke-linejoin: round; }
  .ic .ic-line .dot { fill: currentColor; stroke: none; }
  .ic .ic-fill { fill: currentColor; opacity: .16; }
  .ic.lucide .ic-line { stroke-width: 2; }
  .ic.v2 .ic-line { stroke-width: 2.25; }
  .triple { display: grid; grid-template-columns: 150px 1fr 1fr 1fr; align-items: center; gap: 10px; padding: 8px 12px; border-top: 1px solid var(--border-subtle); }
  .triple:first-child { border-top: 0; }
  .triples { background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; margin-top: 12px; }
  .cell-v2 { background: var(--desk-raised); border-radius: 8px; }
  .arrow { color: var(--ink-faint); margin: 0 8px; font-size: 12px; }
  .prims, .fams { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 12px; }
  .fams { grid-template-columns: repeat(4, 1fr); }
  .prim, .fam { display: flex; flex-direction: column; align-items: center; gap: 8px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px 12px 12px; font-size: 13px; }
  .fam-r { display: flex; align-items: center; gap: 12px; }
  .dotrow { display: flex; gap: 22px; align-items: center; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px 24px; margin-top: 12px; }
  .dot-hi .ic-line .dot { fill: var(--identity); }
  .rules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
  .rule { background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px 16px; font-size: 13px; color: var(--ink-muted); }
  .rule b { display: block; color: var(--ink); margin-bottom: 4px; font-size: 14px; }
  .nav a.active .pos { position: relative; }
  .nav a.active .pos::after { content: ''; position: absolute; right: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: var(--identity); }
  .fill-desk .ic-fill { fill: var(--desk-hover); opacity: 1; }

  /* §1 对照 */
  .pairs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; }
  .pair { display: grid; grid-template-columns: 120px 1fr; align-items: center; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 10px 14px; }
  .pair-name { font-weight: 500; }
  .pair-key { display: block; font: 11px/1.4 ui-monospace, Menlo, monospace; color: var(--ink-faint); }
  .pair-cells { display: grid; grid-template-columns: 1fr 1fr; }
  .cell { display: flex; align-items: center; gap: 14px; }
  .tag { min-width: 64px; white-space: nowrap; font-size: 11px; color: var(--ink-faint); width: 40px; }

  /* §2 真实上下文 */
  .stage { background: var(--desk-page); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px 24px; margin-top: 12px; }
  .stage + .stage { margin-top: 12px; }
  .stage-label { font-size: 11px; color: var(--ink-faint); margin-bottom: 10px; letter-spacing: .02em; }
  .topbar { display: flex; justify-content: space-between; align-items: center; min-height: 40px; }
  .brand { font-weight: 600; }
  .nav { display: flex; gap: 6px; }
  .nav a { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; font-size: 13px; }
  .nav a:hover, .nav a.active { background: var(--desk-hover); }
  .nav a.active .ic { color: var(--identity); }
  .row { display: flex; align-items: center; justify-content: space-between; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px 18px; margin-top: 10px; }
  .row .meta { display: flex; align-items: center; gap: 14px; color: var(--ink-muted); font-size: 13px; }
  .row .badge { background: #E9ECE6; border-radius: 4px; font-size: 12px; padding: 1px 6px; margin-left: 8px; color: var(--ink-muted); }
  .btn-ink { width: 28px; height: 28px; border-radius: 50%; background: var(--action); color: #fff; display: inline-grid; place-items: center; }
  .btn-ghost { width: 28px; height: 28px; border-radius: 8px; display: inline-grid; place-items: center; color: var(--ink-muted); }
  .pill { display: inline-flex; align-items: center; gap: 8px; background: var(--desk-raised); border: 1px solid var(--border-subtle); border-radius: 999px; padding: 8px 16px; box-shadow: 0 1px 2px rgba(25,29,24,.06); }
  .empty { text-align: center; padding: 36px 0 28px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; margin-top: 10px; }
  .empty h3 { font-size: 16px; margin: 12px 0 4px; }
  .empty p { margin: 0; color: var(--ink-muted); font-size: 13px; }
  .empty .ic { color: var(--ink); }
  .twin { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .search { display: flex; align-items: center; gap: 10px; height: 44px; background: var(--desk-raised); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 0 8px 0 16px; color: var(--ink-faint); margin-top: 10px; }
  .search .btn-ink { margin-left: auto; }

  /* §3 题型 */
  .ptypes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
  .ptype { display: flex; align-items: center; gap: 12px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 14px; }
  .pchip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; border-radius: 999px; padding: 3px 10px 3px 7px; }
  .pchip-line { color: var(--ink); border: 1px solid var(--border); }
  .pchip-line .ic { color: var(--p); }
  .pchip-fill { color: var(--p); background: color-mix(in srgb, var(--p) 12%, transparent); }
  .pbig { color: var(--p); margin-left: auto; }

  /* §4 尺寸 */
  .ramp { display: flex; align-items: flex-end; gap: 24px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px 20px; margin-top: 12px; flex-wrap: wrap; }
  .ramp-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .ramp-cell span { font-size: 11px; color: var(--ink-faint); }
  .ramp-cell .ic + .ic { margin-left: 8px; }

  /* §5 变体 */
  .variants { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
  .variant { background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; }
  .variant .vh { font-size: 12px; color: var(--ink-muted); margin-bottom: 10px; }
  .variant .vr { display: flex; gap: 14px; align-items: center; }
  .variant.on-ink { background: var(--action); color: #fff; }
  .variant.on-ink .vh { color: rgba(255,255,255,.7); }
</style>
</head>
<body>
<main>
  <h1>图标方向样张</h1>
  <p class="lede">第二版在前，第一版留在后面作对照。第一版只是把 Lucide 加粗、加圆——胖是靠描边换来的，清爽跟着掉。第二版换思路：<b>胖在形体，不胖在描边；可爱只由一个「点」承担；领域图标不借隐喻，直接用卷面上的原语拼。</b></p>

  <h2>§A 胖在形体，不胖在描边 · Lucide / v1 / v2 各 16 与 24</h2>
  <p class="note">三列描边几乎同重（2 / 2.25 / 2.25），但 v2 的轮廓是封闭的圆角形，内部细节线全删（垃圾桶没有两道竖线、打印机的纸变成一个圆角口），两笔之间净空 ≥ 2 单位。看 16px：v2 更「满」，却比 v1 更干净。</p>
  <div class="triples">${tripleRows}</div>
  <div class="rules">
    <div class="rule"><b>封闭轮廓优先</b>能画成一个圆角形的就不用三笔开放线。形体饱满 = 胖；笔画少 = 清爽。两者不冲突，冲突的是「描边粗」。</div>
    <div class="rule"><b>≤ 2 形 + ≤ 1 点</b>16 级每个字形最多两个形加一个实心点；任何两笔净空 ≥ 2 单位（16px 时 ≥ 1.3px）；不用虚线。超过就是 24 级专用。</div>
    <div class="rule"><b>与汉字同一支笔</b>16px 时描边 1.5px，正是站内 14px/500 中文的竖笔重量。图标不再比字轻，也不比字重——它们像同一支笔写出来的。</div>
  </div>

  <h2>§B 卷面原语 · 领域图标的字母表</h2>
  <p class="note">这套图标真正独有的部分不是圆角，而是它的「字母表」来自教师每天看的卷面：正文行、待填的药丸空、一张折角卷、校对用的插入号（预留给讲评/批改）、被选中的点。所有领域图标都由这五样拼成，以后加新题型、新学科也只从这里取。</p>
  <div class="prims">${primitiveRow}</div>

  <h3 style="margin-top:28px">「一张卷」家族 · 同一张纸，只换里面的标记</h3>
  <p class="note">卷 / 学生版 / 教师版 / 草稿卷是站内最常见的四个领域对象。它们共用折角纸外形，学生版里是「点 + 行」（作答），教师版里是「勾」（含答案），草稿卷是「行 + 点」（未定）。一看就是一家，一看就知道差在哪。</p>
  <div class="fams">${familyRow}</div>

  <h3 style="margin-top:28px">题型六个 · 第一版 → 第二版</h3>
  <p class="note">第一版里完形像滑块、语法像两条腿，问题是借了通用隐喻。第二版全用原语：<b>完形 = 正文行里一个短药丸空</b>（词级，空在行首、后面接正文），<b>七选五 = 整行换成长药丸空</b>（句级）——两个「填空题型」天然是一家；<b>语法填空 = 药丸空里已经给了一个点</b>（括号里的提示词，要变形填入）；<b>阅读 = 正文 + 一个被选中的点</b>；<b>续写 = 正文断在半途，笔接着写</b>。应用文保留信封。</p>
  <div class="cell" style="flex-wrap:wrap;gap:18px;margin-top:12px">${passageOldVsNew}</div>
  <div class="ptypes" style="margin-top:16px">${passageRow2}</div>

  <h2>§C 一个点 · 家族标记，也是唯一的「可爱」</h2>
  <p class="note">全套只有一种点：r 1.75 实心。它是省略号、瞳孔、齿轮心、书签、打印机指示灯、卷上被选中的选项，也是导航「你在这里」的标记。下面把点染成品牌绿只为示意：这一个元素贯穿所有图标，就是家族感的来源；把它拿掉，图标立刻回到普通线稿。</p>
  <div class="dotrow">${dotRow}</div>

  <h2>§D 融进桌面</h2>
  <p class="note">左：填充态用「同色 16%」；右：填充态直接用桌面自己的 <code>--desk-hover</code>——图标像从同一张纸上裁下来的，激活导航用点标位置而不是整块变色。</p>
  <div class="twin">
    <div class="stage"><div class="stage-label">同色 16% 填充 · 整块激活</div>
      <div class="topbar"><span class="brand">英语题库工作台</span>
        <nav class="nav"><a href="#" class="active">${svg2(iconsV2['book-marked'].line, { size: 16, fill: true, shape: iconsV2['book-marked'].fillShape })}过生词</a><a href="#">${svg2(iconsV2.archive.line, { size: 16 })}个人空间</a><a href="#">${svg2(iconsV2.settings.line, { size: 16 })}管理</a></nav></div>
      <div class="row"><span>全国 I 全国高考<span class="badge">真题</span></span><span class="meta">${svg2(sheetFamily['paper-teacher'].line, { size: 16 })}教师版 · 1 篇章 <span class="btn-ink">${svg2(iconsV2.plus.line, { size: 16 })}</span><span class="btn-ghost">${svg2(iconsV2.ellipsis.line, { size: 16 })}</span>${svg2(iconsV2['chevron-right'].line, { size: 16 })}</span></div>
      <div style="margin-top:12px;text-align:right"><span class="pill">${svg2(sheetFamily['paper-draft'].line, { size: 16 })}草稿卷 · 0 题组</span></div>
      <div class="empty">${svg2(iconsV2['book-marked'].line, { size: 40, fill: true, shape: iconsV2['book-marked'].fillShape })}<h3>完整词库没有加载成功</h3><p>重新加载完整词库后再开始。</p></div>
    </div>
    <div class="stage fill-desk"><div class="stage-label">桌面色填充 · 点标位置</div>
      <div class="topbar"><span class="brand">英语题库工作台</span>
        <nav class="nav"><a href="#" class="active"><span class="pos">${svg2(iconsV2['book-marked'].line, { size: 16 })}</span>过生词</a><a href="#">${svg2(iconsV2.archive.line, { size: 16 })}个人空间</a><a href="#">${svg2(iconsV2.settings.line, { size: 16 })}管理</a></nav></div>
      <div class="row"><span>全国 I 全国高考<span class="badge">真题</span></span><span class="meta">${svg2(sheetFamily['paper-teacher'].line, { size: 16 })}教师版 · 1 篇章 <span class="btn-ink">${svg2(iconsV2.plus.line, { size: 16 })}</span><span class="btn-ghost">${svg2(iconsV2.ellipsis.line, { size: 16 })}</span>${svg2(iconsV2['chevron-right'].line, { size: 16 })}</span></div>
      <div style="margin-top:12px;text-align:right"><span class="pill">${svg2(sheetFamily['paper-draft'].line, { size: 16 })}草稿卷 · 0 题组</span></div>
      <div class="empty">${svg2(iconsV2['book-marked'].line, { size: 40, fill: true, shape: iconsV2['book-marked'].fillShape })}<h3>完整词库没有加载成功</h3><p>重新加载完整词库后再开始。</p></div>
    </div>
  </div>

  <hr style="border:0;border-top:1px solid var(--border);margin:56px 0 40px">
  <h1 style="font-size:20px">附：第一版（仅作对照）</h1>
  <p class="lede">24 网格、活区 2.5–21.5、描边 2.25、圆头圆角、细节用实心点，但字形仍照 Lucide 的画法。</p>

  <h2>§1 一眼对照 · 16 / 24 / 40</h2>
  <p class="note">重点看 16px：这是站内 14px 中文旁边的常用尺寸。Lucide 在这里显得单薄、发虚；提案通过更满的形体和圆角，加上略重的描边（2.25 vs 2），显得更结实。40px 看放大后是否仍有形。</p>
  <div class="pairs">${pairRows}</div>

  <h2>§2 落进真实页面</h2>
  <p class="note">顶栏、浏览行、草稿丸、空态，按站内现有 CSS 语言重排。左：现状（14px Lucide）；右：提案（16px，中文旁图标一律 16，不再 14）。</p>
  <div class="twin">
    <div class="stage"><div class="stage-label">现状</div>
      <div class="topbar"><span class="brand">英语题库工作台</span>
        <nav class="nav"><a href="#">${lucideSvg(lucideNodes['book-marked'], 14)}过生词</a><a href="#">${lucideSvg(lucideNodes.archive, 14)}个人空间</a><a href="#">${lucideSvg(lucideNodes.settings, 14)}管理</a></nav></div>
      <div class="search">${lucideSvg(lucideNodes.search, 16)}比如：2024 新课标 I 的七选五<span class="btn-ink">${lucideSvg(lucideNodes['arrow-right'], 14)}</span></div>
      <div class="row"><span>全国 I 全国高考<span class="badge">真题</span></span><span class="meta">1 篇章 · 完整卷面尚未就绪 <span class="btn-ink">${lucideSvg(lucideNodes.plus, 14)}</span><span class="btn-ghost">${lucideSvg(lucideNodes.ellipsis, 16)}</span>${lucideSvg(lucideNodes['chevron-right'], 16)}</span></div>
      <div style="margin-top:12px;text-align:right"><span class="pill">${lucideSvg(lucideNodes['clipboard-list'], 16)}草稿卷 · 0 题组</span></div>
      <div class="empty">${lucideSvg(lucideNodes['book-marked'], 40)}<h3>完整词库没有加载成功</h3><p>重新加载完整词库后再开始。</p></div>
    </div>
    <div class="stage"><div class="stage-label">提案</div>
      <div class="topbar"><span class="brand">英语题库工作台</span>
        <nav class="nav"><a href="#" class="active">${svg(icons['book-marked'].line, { size: 16, fill: true, shape: icons['book-marked'].fillShape })}过生词</a><a href="#">${svg(icons.archive.line, { size: 16 })}个人空间</a><a href="#">${svg(icons.settings.line, { size: 16 })}管理</a></nav></div>
      <div class="search">${svg(icons.search.line, { size: 18 })}比如：2024 新课标 I 的七选五<span class="btn-ink">${svg(icons['arrow-right'].line, { size: 16 })}</span></div>
      <div class="row"><span>全国 I 全国高考<span class="badge">真题</span></span><span class="meta">1 篇章 · 完整卷面尚未就绪 <span class="btn-ink">${svg(icons.plus.line, { size: 16 })}</span><span class="btn-ghost">${svg(icons.ellipsis.line, { size: 16 })}</span>${svg(icons['chevron-right'].line, { size: 16 })}</span></div>
      <div style="margin-top:12px;text-align:right"><span class="pill">${svg(icons['clipboard-list'].line, { size: 16 })}草稿卷 · 0 题组</span></div>
      <div class="empty">${svg(icons['book-marked'].line, { size: 40, fill: true, shape: icons['book-marked'].fillShape })}<h3>完整词库没有加载成功</h3><p>重新加载完整词库后再开始。</p></div>
    </div>
  </div>

  <h2>§3 题型六色 · 只属于我们的那部分</h2>
  <p class="note">开源库里没有「七选五」「读后续写」。这六个字形是这套图标真正独有的核心；配 DESIGN.md 已保留未用的题型六色，只出现在篇章层。左：线 + 色图标；中：填充芯片（选中/激活）；右：40px。</p>
  <div class="ptypes">${passageRow}</div>

  <h2>§4 尺寸阶梯与描边</h2>
  <p class="note">上排：同一字形 12 → 40。提案的尺寸 token 只留 16（行内/导航）、20（工具栏）、24（独立按钮）、40（空态/插图级）；14 退役。下排：描边通过 <code>--icon-stroke</code> 变量微调，默认 2.25；密集表格或 12px 极小处可退到 2，40px 插图级可到 2.5。</p>
  <div class="ramp">${ramp}</div>
  <div class="ramp">${strokes}</div>

  <h2>§5 变体与状态</h2>
  <p class="note">只做两种变体：线（默认）与填充（16% 同色底 + 线，用于激活/选中/题型芯片）。不做独立实心版、不做双色描边——两种就够表达状态，也守住「安静」。</p>
  <div class="variants">
    <div class="variant"><div class="vh">线 · 默认（ink）</div><div class="vr">${svg(icons.eye.line, { size: 20 })}${svg(icons.printer.line, { size: 20 })}${svg(icons.download.line, { size: 20 })}${svg(icons.sparkles.line, { size: 20 })}</div></div>
    <div class="variant"><div class="vh">线 · 次要（ink-muted）</div><div class="vr" style="color:var(--ink-muted)">${svg(icons.eye.line, { size: 20 })}${svg(icons.printer.line, { size: 20 })}${svg(icons.download.line, { size: 20 })}${svg(icons.sparkles.line, { size: 20 })}</div></div>
    <div class="variant"><div class="vh">填充 · 激活/选中</div><div class="vr">${svg(icons.eye.line, { size: 20, fill: true, shape: icons.eye.fillShape })}${svg(icons.printer.line, { size: 20, fill: true, shape: icons.printer.fillShape })}${svg(icons.search.line, { size: 20, fill: true, shape: icons.search.fillShape })}${svg(icons.sparkles.line, { size: 20, fill: true, shape: icons.sparkles.fillShape })}</div></div>
    <div class="variant on-ink"><div class="vh">墨底反白（短动作钮）</div><div class="vr">${svg(icons['arrow-right'].line, { size: 20 })}${svg(icons.plus.line, { size: 20 })}${svg(icons.check.line, { size: 20 })}${svg(icons.x.line, { size: 20 })}</div></div>
  </div>
</main>
</body>
</html>
`

writeFileSync(join(here, 'sheet.html'), html)
console.log('wrote', join(here, 'sheet.html'))
