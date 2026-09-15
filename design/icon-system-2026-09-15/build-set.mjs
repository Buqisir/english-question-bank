// 生成 set.html：第三版全集 vs Lucide，落在真实桌面色阶里看。
//   node design/icon-system-2026-09-15/build-set.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generic, domain, passage } from './icons-v3.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const lucideDir = join(here, '../../app/node_modules/lucide-react/dist/esm/icons')

async function lucide(name) {
  if (!name) return ''
  const file = join(lucideDir, `${name}.mjs`)
  if (!existsSync(file)) return ''
  const mod = await import(file)
  if (!mod.__iconNode) {
    // 别名文件（more-horizontal → ellipsis 等）只做 re-export，顺着找。
    const src = readFileSync(file, 'utf8')
    const m = src.match(/from '\.\/([a-z0-9-]+)\.mjs'/)
    return m ? lucide(m[1]) : ''
  }
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

const svg = (ic, { size = 16, fill = false, cls = '' } = {}) =>
  `<svg class="ic s${size} ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
  (fill && ic.fillShape ? `<g class="ic-fill">${ic.fillShape}</g>` : '') +
  `<g class="ic-line">${ic.line}</g></svg>`

const lucideSvg = (inner, size = 16) =>
  `<svg class="ic lucide s${size}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><g class="ic-line">${inner}</g></svg>`

const lucideNodes = {}
for (const [k, ic] of Object.entries({ ...generic, ...domain })) lucideNodes[k] = await lucide(ic.lucide)

const compareRows = (set) =>
  Object.entries(set)
    .map(
      ([name, ic]) => `<div class="cmp">
      <div class="cmp-name">${ic.zh}<span class="key">${name}</span></div>
      <div class="cell lucide-cell">${lucideNodes[name] ? lucideSvg(lucideNodes[name], 16) + lucideSvg(lucideNodes[name], 24) : '<span class="key">—</span>'}</div>
      <div class="cell ours">${svg(ic, { size: 16 })}${svg(ic, { size: 24 })}${ic.fillShape ? svg(ic, { size: 24, fill: true }) : ''}</div>
    </div>`,
    )
    .join('\n')

const bigRow = (set, keys) =>
  keys
    .map((k) => {
      const ic = set[k]
      return `<div class="big"><div class="big-r">${svg(ic, { size: 16 })}${svg(ic, { size: 24 })}${svg(ic, { size: 40 })}${svg(ic, { size: 40, fill: true })}</div><span>${ic.zh}</span><span class="key">${k}</span></div>`
    })
    .join('')

const passageRow = Object.entries(passage)
  .map(
    ([key, p]) => `<div class="ptype" style="--p:${p.color}">
      <span class="pchip pchip-line">${svg(p, { size: 18 })}${p.zh}</span>
      <span class="pchip pchip-fill">${svg(p, { size: 18, fill: true })}${p.zh}</span>
      <span class="pbig">${svg(p, { size: 40, fill: true })}</span>
      <span class="pbig pmono">${svg(p, { size: 40 })}</span>
    </div>`,
  )
  .join('\n')

const g = generic
const d = domain
const topbar = (size) => `
  <div class="nav">
    <a href="#">${svg(d.papers, { size })}篇章</a>
    <a href="#">${svg(d['board-list'], { size })}草稿卷</a>
    <a href="#" class="active">${svg(d['book-marked'], { size })}过生词</a>
    <a href="#">${svg(g['list-music'], { size })}听写</a>
    <a href="#">${svg(g['grid-2x2'], { size })}趣味练习</a>
    <a href="#">${svg(g.archive, { size })}个人空间</a>
    <span class="spacer"></span>
    <a href="#" class="ghost">${svg(g.settings, { size })}</a>
    <a href="#" class="ghost">${svg(g['log-out'], { size })}</a>
  </div>`

const row = (title, sub, icons) => `
  <div class="row">
    <div class="row-l">${svg(d.paper, { size: 28 })}<div><div class="row-t">${title}</div><div class="row-s">${sub}</div></div></div>
    <div class="meta">${icons.map((k) => `<span class="btn-ghost">${svg(g[k] || d[k], { size: 16 })}</span>`).join('')}${svg(g['chevron-right'], { size: 16 })}</div>
  </div>`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>图标 v3 · 全集</title>
<style>
  :root {
    --desk-page: #F3F6F0; --desk-surface: #FAFCF8; --desk-raised: #FAFDF7; --desk-hover: #E5EAE1;
    --border: #D5DACF; --border-subtle: #E3E8DF; --ink: #191D18; --ink-muted: #60665C; --ink-faint: #9A9D97;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--desk-page); color: var(--ink); font: 14px/1.5 Inter, "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1120px; margin: 0 auto; padding: 40px 32px 96px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 44px 0 8px; }
  .lede, .note { color: var(--ink-muted); margin: 0 0 14px; max-width: 76ch; }
  .key { display: block; font: 11px/1.4 ui-monospace, Menlo, monospace; color: var(--ink-faint); }

  .ic { display: inline-block; vertical-align: middle; color: currentColor; }
  .ic-line { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.75; }
  .ic.s16 .ic-line, .ic.s18 .ic-line { stroke-width: 2.25; }
  .ic.lucide .ic-line { stroke-width: 2; }
  .ic .dot { fill: currentColor; stroke: none; }
  .ic-fill { fill: currentColor; opacity: .16; stroke: none; }
  .ic-fill .dot { fill: none; }
  .ic .joint { fill: currentColor; stroke: none; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .cmp { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 8px 12px; }
  .cmp-name { font-size: 13px; }
  .cell { display: inline-flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; }
  .lucide-cell { color: var(--ink-faint); }
  .ours { background: var(--desk-raised); }

  .bigs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .big { display: flex; flex-direction: column; align-items: center; gap: 8px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px 12px 12px; font-size: 13px; }
  .big-r { display: flex; align-items: center; gap: 14px; }

  .ptypes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .ptype { display: flex; align-items: center; gap: 10px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 14px; }
  .pchip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 5px 10px 5px 8px; border-radius: 999px; color: var(--p); background: color-mix(in srgb, var(--p) 10%, white); }
  .pbig { color: var(--p); margin-left: auto; }
  .pmono { color: var(--ink); margin-left: 0; }

  .stage { background: var(--desk-page); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px 24px; margin-top: 12px; }
  .stage-label { font-size: 11px; color: var(--ink-faint); margin-bottom: 10px; letter-spacing: .02em; }
  .nav { display: flex; gap: 2px; align-items: center; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 6px 8px; }
  .nav a { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; font-size: 13px; }
  .nav a.active { background: var(--desk-hover); }
  .nav .ghost { color: var(--ink-muted); padding: 6px; }
  .spacer { flex: 1; }
  .row { display: flex; align-items: center; justify-content: space-between; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px 18px; margin-top: 10px; }
  .row-l { display: flex; align-items: center; gap: 14px; }
  .row-t { font-size: 15px; }
  .row-s { font-size: 12px; color: var(--ink-muted); }
  .row .meta { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); }
  .btn-ghost { width: 28px; height: 28px; border-radius: 8px; display: inline-grid; place-items: center; color: var(--ink-muted); }
  .pill { display: inline-flex; align-items: center; gap: 8px; background: var(--desk-raised); border: 1px solid var(--border-subtle); border-radius: 999px; padding: 8px 16px; box-shadow: 0 1px 2px rgba(25,29,24,.06); margin-top: 14px; }
  .pill .badge { background: #E9ECE6; border-radius: 4px; font-size: 12px; padding: 1px 6px; color: var(--ink-muted); }
  .empty { text-align: center; padding: 32px 0 26px; background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; margin-top: 12px; }
  .empty p { margin: 6px 0 0; color: var(--ink-muted); font-size: 13px; }
  .empty .ic { color: var(--ink); }
  .btns { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--desk-raised); font-size: 13px; color: var(--ink); }
  .btn.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
  .btn.quiet { border-color: transparent; background: transparent; color: var(--ink-muted); }
  .search { display: flex; align-items: center; gap: 10px; height: 44px; background: var(--desk-raised); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 0 8px 0 16px; color: var(--ink-faint); margin-top: 14px; }
  .search .go { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; background: var(--ink); color: #fff; display: grid; place-items: center; }
  .darkrow { display: flex; gap: 18px; align-items: center; background: #191D18; color: #E8EBE5; border-radius: 12px; padding: 16px 20px; margin-top: 12px; }
  .tips { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tip { background: var(--desk-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 14px; font-size: 13px; color: var(--ink-muted); }
  .tip b { display: block; color: var(--ink); margin-bottom: 4px; }
</style></head>
<body><main>
  <h1>图标 v3 · 全集</h1>
  <p class="lede">按 principles.md 定稿画的第一版全集：外圆角 4 / 内 2，16px 描边 2.25、24px 及以上 2.75，每个字形一处语义细节。左列灰的是现用 Lucide（16 / 24），右列浅底是我们的（16 / 24 / 24 填充态）。</p>

  <h2>0 · 第四轮微调</h2>
  <p class="note">听写：音符头放大放肥（r 2.25 → 2.9），符干贴头右缘。折角纸：折线 L 两端各往里错 1 单位，斜切放回 5.5，三角里留出空气不再成坨。续写：第三行缩短、笔右移，笔和行之间留 2.75 单位。语法填空：括号里换成一条短横（B 候选：小波浪）。隐藏：斜杠一笔到底穿过瞳孔。上一轮的刷新 / 扫码 / 个人空间 / 相似篇章 / 单词卡 / 过生词保留在下面对照。</p>
  <div class="bigs">${bigRow(generic, ['list-music', 'sliders', 'eye-off', 'archive', 'qr-code'])}</div>
  <div class="bigs" style="margin-top:10px">${bigRow(domain, ['paper', 'paper-student', 'paper-check', 'board-list', 'paper-download'])}</div>
  <div class="bigs" style="margin-top:10px">${bigRow(domain, ['papers', 'card', 'book-marked', 'board-check', 'book-open'])}</div>
  <div class="ptypes" style="margin-top:10px">${['reading', 'cloze', 'seven', 'grammar', 'application', 'continuation'].map((k) => { const p = passage[k]; return `<div class="ptype" style="--p:${p.color}"><span class="pchip pchip-line">${svg(p, { size: 18 })}${p.zh}</span><span class="pbig">${svg(p, { size: 40, fill: true })}</span><span class="pbig pmono">${svg(p, { size: 40 })}</span></div>` }).join('')}</div>
  <div class="stage" style="margin-top:10px"><div class="stage-label">六个题型并排 · 18px 线态</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${['reading', 'cloze', 'seven', 'grammar', 'application', 'continuation'].map((k) => { const p = passage[k]; return `<span class="pchip pchip-line" style="--p:${p.color}">${svg(p, { size: 18 })}${p.zh.split(' ')[0]}</span>` }).join('')}</div>
  </div>

  <h2>A · 通用层 —— 逐一对照 Lucide</h2>
  <p class="note">每个 key 对应一个 lucide-react 名，替换时逐文件换 import 即可。</p>
  <div class="grid">${compareRows(generic)}</div>

  <h2>B · 领域层 —— 一张卷 / 一本书 / 板</h2>
  <p class="note">同一张折角纸，只换里面的记号：正文行 = 卷，点 + 短行 = 学生版，勾 = 教师版 / 听写纸，箭头 = 下载 PDF。草稿卷回到「板」家族（板 + 两行），与单词复习（板 + 勾）同族。</p>
  <div class="grid">${compareRows(domain)}</div>
  <div class="bigs" style="margin-top:12px">${bigRow(domain, ['paper', 'paper-student', 'paper-check', 'board-list', 'paper-download'])}</div>
  <div class="bigs" style="margin-top:10px">${bigRow(domain, ['papers', 'board-check', 'book-open', 'card', 'book-marked'])}</div>

  <h2>C · 题型六个 —— 篇章层配题型色</h2>
  <p class="note">线态 chip、填充态 chip、40px 彩色、40px 单色（看是否脱色后仍能分辨）。</p>
  <div class="ptypes">${passageRow}</div>

  <h2>D · 落到页面里</h2>
  <div class="stage"><div class="stage-label">顶栏 · 16px（现为 14）</div>${topbar(16)}</div>
  <div class="stage"><div class="stage-label">浏览列表 · 行首 28px，行尾 16px</div>
    ${row('The Power of Small Habits', '阅读理解 · 2024 全国甲卷 · 4 题', ['sparkles', 'papers', 'tag', 'pin'])}
    ${row('A Letter to the Editor', '应用文 · 2023 新高考 I 卷 · 写作', ['sparkles', 'papers', 'tag', 'pin'])}
    <span class="pill">${svg(d['board-list'], { size: 16 })}草稿卷<span class="badge">6</span>${svg(g['chevron-up'], { size: 16 })}</span>
  </div>
  <div class="stage"><div class="stage-label">详情页操作 · 16px 按钮</div>
    <div class="btns">
      <span class="btn primary">${svg(g.plus, { size: 16 })}加入草稿卷</span>
      <span class="btn">${svg(d['paper-download'], { size: 16 })}下载 PDF</span>
      <span class="btn">${svg(g.printer, { size: 16 })}打印</span>
      <span class="btn">${svg(d['paper-check'], { size: 16 })}听写纸</span>
      <span class="btn">${svg(g.presentation, { size: 16 })}讲评</span>
      <span class="btn quiet">${svg(g.eye, { size: 16 })}预览</span>
      <span class="btn quiet">${svg(g.copy, { size: 16 })}复制</span>
      <span class="btn quiet">${svg(g.trash, { size: 16 })}删除</span>
      <span class="btn quiet">${svg(g.ellipsis, { size: 16 })}</span>
    </div>
    <div class="btns">
      <span class="btn">${svg(g.play, { size: 16 })}播放</span>
      <span class="btn">${svg(g.pause, { size: 16 })}暂停</span>
      <span class="btn">${svg(g.volume, { size: 16 })}朗读</span>
      <span class="btn">${svg(g.shuffle, { size: 16 })}随机抽</span>
      <span class="btn">${svg(g['qr-code'], { size: 16 })}扫码听写</span>
      <span class="btn">${svg(g.link, { size: 16 })}打开听写</span>
      <span class="btn">${svg(d['board-check'], { size: 16 })}单词复习</span>
      <span class="btn">${svg(d.card, { size: 16 })}单词卡</span>
      <span class="btn quiet">${svg(g['rotate-ccw'], { size: 16 })}重来</span>
      <span class="btn quiet">${svg(g['refresh-cw'], { size: 16 })}换一批</span>
    </div>
    <div class="search">${svg(g.search, { size: 18 })}搜篇章、题目、年份…<span class="go">${svg(g['arrow-right'], { size: 16 })}</span></div>
  </div>
  <div class="stage"><div class="stage-label">空状态 · 40px（线态 / 填充态）</div>
    <div class="empty">${svg(d.paper, { size: 40 })}&nbsp;&nbsp;&nbsp;${svg(d.paper, { size: 40, fill: true })}<p>完整卷面尚未就绪，先看左侧题目。</p></div>
  </div>
  <div class="stage"><div class="stage-label">深色上 · 16 / 24</div>
    <div class="darkrow">${['search', 'settings', 'archive', 'eye', 'trash', 'printer', 'sparkles'].map((k) => svg(g[k], { size: 16 })).join('')}<span style="width:12px"></span>${['paper', 'paper-check', 'board-list', 'book-open', 'book-marked', 'papers'].map((k) => svg(d[k], { size: 24 })).join('')}</div>
  </div>
</main></body></html>`

writeFileSync(join(here, 'set.html'), html)
console.log('wrote set.html', Object.keys(generic).length, 'generic,', Object.keys(domain).length, 'domain,', Object.keys(passage).length, 'passage')
