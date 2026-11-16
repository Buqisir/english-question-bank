#!/usr/bin/env node
// 色板页（BRAND.md §1.5、§3.2；第 59、69 条）：雾薄荷色板重出，2026-11-16。
//
// 竹青时的色板页在 Paper「主题 10 · 色板」里画，导出是 design/brand-2026-10-13/evidence/palette.png，留作历史。
// 这一版的源头搬进仓库：本脚本现算数字、写出 HTML，再截成 PNG。色值、差事、状态、规则都照 BRAND.md §1.5、§3.2 抄，
// 不在这里新定任何东西；BRAND.md 改了，这里跟着改再重跑。
//
// 现算的三样：
//   OKLCH          从十六进制换算（Björn Ottosson 的 OKLab）
//   对比度          WCAG 2.x 相对亮度
//   用量            把仓库里的四张图按 800px 宽画出来，不透明的像素按最近的品牌色归类（离得太远的算「其他」，是抗锯齿边）
//
// 用法：MANUAL_FONTSOURCE_DIR=<装了 @fontsource-variable/noto-sans-sc、noto-serif-sc 的 node_modules> node scripts/brand/palette-sheet.mjs
//      不设时用系统字体（有苹方就用苹方）。
// 输出：design/brand-2026-10-13/palette/palette.html
//       design/brand-2026-10-13/evidence/palette-mint-2026-11-16.png（1440 宽，1 倍）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND_DIR = path.join(ROOT, 'design/brand-2026-10-13')
const OUT_HTML = path.join(BRAND_DIR, 'palette/palette.html')
const OUT_PNG = path.join(BRAND_DIR, 'evidence/palette-mint-2026-11-16.png')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// ---------- 色（照 BRAND.md §1.5） ----------
const BRAND = [
  { key: 'deep', name: '深薄荷', hex: '#2C6E56', status: 'Droid 定 · 第 69 条',
    job: '要写字的品牌色：网站身份色 --eqb-color-identity；插画里巨藻的深色部分和深水，宣传大图的水。',
    no: '海獭身上不用（墨对它只有 2.82）；界面的选中、悬停、焦点不用（第 72、123 条）。' },
  { key: 'mint', name: '雾薄荷', hex: '#72BFA4', status: '已定 · 第 68、69 条',
    job: '品牌主色：标志图形；海獭的头、耳朵、下巴、背、手臂、尾巴和脚；插画主体；界面实心主按钮的底（墨字，第 72 条）。',
    no: '不写字、不当字的颜色、不画细线（对页面只有 1.97）。' },
  { key: 'pale', name: '浅雾薄荷', hex: '#DDF1E8', status: 'Droid 定 · 第 69 条',
    job: '海獭的喉咙、胸口和肚子（围兜）；后脚的趾尖；巨藻叶的中脉（第 110、112 条）。',
    no: '不直接贴页面（1.07），外面要有雾薄荷；不做界面表面色。' },
  { key: 'fog', name: '雾白', hex: '#F2FAF6', status: '已定 · 第 68、69 条',
    job: '海獭的口鼻和脸颊里层；App 图标底；雾海里巨藻的填色；宣传大图的天。',
    no: '不直接贴页面（1.03）；不做界面表面色。' },
  { key: 'ink', name: '墨', hex: '#191D18', status: '已定',
    job: '海獭的眼睛点、鼻子、胡须点；正文。',
    no: '海獭身上不超过 4%；石子不用墨，用石色（第 106 条）。' },
  { key: 'slate', name: '石板墨', hex: '#29424D', status: '已定 · 第 67 条',
    job: '界面唯一的动作色（DESIGN.md §2）；登录页 v11 线稿的描边，雾海里巨藻和气泡的线。',
    no: '' },
  { key: 'pure', name: '纯薄荷', hex: '#11957A', status: 'Owner 定 · 第 72 条',
    job: '界面点睛色里的细线和小点：搜索框的回车键、草稿卷里有题时的小圆点。',
    no: '不写正文字（对白 3.75）。' },
  { key: 'stone', name: '石色', hex: '#6E828C', status: '已定 · 第 106 条',
    job: '石头的主体；海胆。只给石头这一类东西用。',
    no: '不当界面色、不写字。' },
  { key: 'face', name: '石面', hex: '#8FA3AC', status: '已定 · 第 106 条',
    job: '石头上那块浅一档的平涂顶面。',
    no: '只和石色一起用。' },
]
const C = Object.fromEntries(BRAND.map((c) => [c.key, c]))
const SURF = [ { key: 'white', name: '白', hex: '#FFFFFF' }, { key: 'page', name: '页面', hex: '#F1F5F7' }, { key: 'desk', name: '桌面', hex: '#E6EDF0' } ]
const MIST = [ ['画布', '#F4F8FA'], ['晨黄', '#FCF0D2'], ['青', '#A9DFF0'], ['水青', '#C6E3E9'], ['薄荷雾', '#C4ECDD'], ['长春蓝', '#B9DBF3'], ['长春蓝', '#C9D8F5'], ['薰衣草蓝', '#C3C9F4'] ]

// ---------- 现算 ----------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
function oklch(h) {
  const [r, g, b] = rgb(h).map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}
const fmtOk = (h) => { const o = oklch(h); return `oklch(${o.L.toFixed(3)} ${o.C.toFixed(3)} ${o.H.toFixed(1)})` }
const f2 = (n) => n.toFixed(2)

// 用量：四张图
const USAGE = [
  { file: 'mascot/otter-sit.svg', label: '坐石全身像（全身主姿势，第 109 条）', body: true },
  { file: 'mascot/app-icon.svg', label: 'App 图标' },
  { file: 'illustration/kelp.svg', label: '巨藻（原语）' },
  { file: 'illustration/promo/promo-wide-art.svg', label: '宣传横图的画（不含字）' },
]
const browser = await chromium.launch({ channel: 'chromium' })
{
  const page = await browser.newPage()
  const palette = BRAND.map((c) => [c.key, rgb(c.hex).map((v) => Math.round(v * 255))])
  for (const u of USAGE) {
    const svg = readFileSync(path.join(BRAND_DIR, u.file), 'utf8')
    u.counts = await page.evaluate(async ({ svg, palette }) => {
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      await img.decode()
      const w = 800, h = Math.round((800 * img.naturalHeight) / img.naturalWidth)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h)
      const d = ctx.getImageData(0, 0, w, h).data
      const out = { other: 0, total: 0 }
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue
        out.total++
        let best = null, bd = Infinity
        for (const [k, [r, g, b]] of palette) { const dd = (d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2; if (dd < bd) { bd = dd; best = k } }
        if (bd > 400) out.other++; else out[best] = (out[best] || 0) + 1
      }
      return out
    }, { svg, palette })
  }
  await page.close()
}
const pct = (u, k) => (100 * (u.counts[k] || 0)) / u.counts.total

// ---------- HTML ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const card = (c) => `
  <div class="card">
    <div class="sw" style="background:${c.hex}${['pale', 'fog'].includes(c.key) ? ';box-shadow:inset 0 0 0 1px #DCE6EB' : ''}"></div>
    <div class="cb">
      <div class="nm"><span class="name">${c.name}</span><span class="hex">${c.hex}</span></div>
      <div class="ok">${fmtOk(c.hex)}</div>
      <div class="tag">${c.status}</div>
      <p class="job">${esc(c.job)}</p>
      ${c.no ? `<p class="no">${esc(c.no)}</p>` : ''}
    </div>
  </div>`

const ladder = ['deep', 'mint', 'pale', 'fog'].map((k) => C[k])
const ladderHtml = ladder.map((c) => { const o = oklch(c.hex); return `<div class="lseg" style="background:${c.hex}"><span style="color:${o.L > 0.7 ? '#191D18' : '#F2FAF6'}">${c.name} · L ${o.L.toFixed(2)} · H ${o.H.toFixed(0)}°</span></div>` }).join('')
const neutralHtml = ['ink', 'slate', 'stone', 'face'].map((k) => { const c = C[k], o = oklch(c.hex); return `<div class="lseg" style="background:${c.hex}"><span style="color:${o.L > 0.65 ? '#191D18' : '#F2FAF6'}">${c.name} · L ${o.L.toFixed(2)}</span></div>` }).join('')

const usageHtml = USAGE.map((u) => {
  const keys = BRAND.map((c) => c.key).filter((k) => pct(u, k) >= 0.5)
  const segs = keys.map((k) => `<span style="flex:${pct(u, k)};background:${C[k].hex}"></span>`).join('')
  const legend = keys.map((k) => `${C[k].name} ${Math.round(pct(u, k))}`).join(' · ')
  return `<div class="ubar">${segs}</div><div class="ucap">${u.label}：${legend}</div>`
}).join('')
const sit = USAGE[0]
const bodyTotal = sit.counts.total - (sit.counts.stone || 0) - (sit.counts.face || 0) - sit.counts.other
const bp = (k) => Math.round((100 * (sit.counts[k] || 0)) / bodyTotal)

const ROWS = ['mint', 'deep', 'pure', 'pale', 'fog', 'ink', 'slate'].map((k) => C[k])
const COLS = [...ROWS, ...SURF]
const grade = (r) => (r >= 4.5 ? ['写字', 'g-text'] : r >= 3 ? ['图形', 'g-shape'] : ['形状', 'g-form'])
const matrixHtml = `
  <table class="mx">
    <thead><tr><th></th>${COLS.map((c) => `<th>放在 ${c.name} 上</th>`).join('')}</tr></thead>
    <tbody>${ROWS.map((r) => `<tr><th>${r.name}</th>${COLS.map((c) => {
      if (c.hex === r.hex) return '<td class="dash">—</td>'
      const v = contrast(r.hex, c.hex), [g, cls] = grade(v)
      return `<td><span class="chip" style="background:${c.hex}"><i style="background:${r.hex}"></i></span><b class="${cls}">${f2(v)}</b><small>${g}</small></td>`
    }).join('')}</tr>`).join('')}</tbody>
  </table>`

const R = (a, b) => f2(contrast(C[a].hex, b.startsWith('#') ? b : C[b].hex))
const rules = [
  { t: '写字只用三种组合', d: `墨字、石板墨字或深薄荷字放在浅色上；白字或雾白字放在深薄荷或石板墨上。雾薄荷底不写字（白字 ${R('mint', '#FFFFFF')}）。`,
    s: `<div class="sp row"><span class="w" style="background:#F2FAF6;color:#191D18">獭石</span><span class="w" style="background:#fff;color:#2C6E56;box-shadow:inset 0 0 0 1px #DCE6EB">獭石</span><span class="w" style="background:#2C6E56;color:#F2FAF6">獭石</span><span class="w" style="background:#29424D;color:#fff">獭石</span><span class="w bad" style="background:#72BFA4;color:#fff">獭石</span></div>` },
  { t: '雾薄荷不画细线', d: `雾薄荷对页面只有 ${R('mint', '#F1F5F7')}，细线和小点看不见。描边、水线、气泡用石板墨（${R('slate', '#F1F5F7')}）或墨。`,
    s: `<div class="sp col" style="background:#F1F5F7"><i class="ln bad" style="background:#72BFA4"></i><i class="ln" style="background:#29424D"></i></div>` },
  { t: '两档浅色外面要有雾薄荷', d: `雾白、浅雾薄荷对页面只有 ${R('fog', '#F1F5F7')} / ${R('pale', '#F1F5F7')}，直接贴页面就没了边。例外：App 图标底在系统桌面上。`,
    s: `<div class="sp row"><span class="blk" style="background:#72BFA4"><i class="pill" style="background:#DDF1E8"></i></span><span class="blk bad" style="background:#F1F5F7"><i class="pill" style="background:#DDF1E8"></i></span></div>` },
  { t: '墨点只放在雾薄荷或浅色上', d: `墨对雾薄荷 ${R('ink', 'mint')}、对浅雾薄荷 ${R('ink', 'pale')}；对深薄荷只有 ${R('ink', 'deep')}，所以海獭身上不用深薄荷。`,
    s: `<div class="sp row"><span class="blk" style="background:#72BFA4"><i class="dots"></i></span><span class="blk bad" style="background:#2C6E56"><i class="dots"></i></span></div>` },
  { t: '两档浅色只做里外层', d: `雾白对浅雾薄荷 ${R('fog', 'pale')}：只分同一件东西的两层，比如口鼻的里层和外圈，不拿来分两件事。`,
    s: `<div class="sp row"><span class="blk wide" style="background:#72BFA4"><i class="pill big" style="background:#DDF1E8"><i class="pill in" style="background:#F2FAF6"></i></i></span></div>` },
  { t: '界面点睛色每页最多一处', d: '主按钮雾薄荷底墨字；回车键、小圆点用纯薄荷。选中、悬停、焦点、链接、标签用灰和墨，进度条和焦点框用石板墨（第 72、123 条）。',
    s: `<div class="sp row" style="background:#F1F5F7"><span class="btn" style="background:#72BFA4;color:#191D18">加入草稿卷</span><span class="dot" style="background:#11957A"></span><span class="sel">已选</span><span class="foc">焦点</span></div>` },
  { t: '不加色相，语义色不进品牌', d: '品牌图形只用这六色，石头另用石色、石面两色。成功、提醒、危险不进海獭和插画；要更多层次时先在雾薄荷阶上加档，写进 §1.5 和本页再用。',
    s: `<div class="sp row"><span class="strip">${['deep', 'mint', 'pale', 'fog', 'ink', 'slate', 'stone', 'face'].map((k) => `<i style="background:${C[k].hex}"></i>`).join('')}</span></div>` },
  { t: '雾色只在雾海里', d: '八个雾色只画登录页这类雾海场景的背景，模糊成一团一团，不画海獭、不写字、不进界面（第 67 条）。',
    s: `<div class="sp mist">${MIST.slice(1).map(([, h], i) => `<i style="background:${h};left:${8 + i * 34}px;top:${i % 2 ? 26 : 8}px"></i>`).join('')}</div>` },
]
const rulesHtml = rules.map((r) => `<div class="rule">${r.s}<h4>${r.t}</h4><p>${esc(r.d)}</p></div>`).join('')

const sw = (...keys) => keys.map((k) => `<i style="background:${C[k].hex}"></i>`).join('')
const WHERE = [
  ['标志', sw('mint', 'fog', 'ink'), '图形标志：雾薄荷、雾白、墨（没有围兜，所以不用浅雾薄荷）；单色版只用墨；不做反白版。字标默认墨，品牌位置可用深薄荷；深薄荷底上的字用白或雾白。', '图形 Droid 定，颜色 Owner 定；字标提案'],
  ['海獭 · 角色', sw('mint', 'pale', 'fog', 'ink'), '雾薄荷、雾白、浅雾薄荷、墨四色。手里的石头和物件用石色、石面和物件各自的颜色（第 106、113 条）。深薄荷只以巨藻的身份出现在海獭身边。', '已定'],
  ['海獭 · 雾海登录页', '<span class="mute">不用品牌色</span>', '白身石板墨线稿 v11，腮色 #DCEDF5（第 67、68 条）。', '已定'],
  ['插画', sw('deep', 'mint', 'pale', 'fog', 'ink'), '品牌色平涂。原语插画：雾薄荷纸、浅雾薄荷正文行、墨书签。深薄荷只给巨藻和宣传大图的水。雾色只在登录页这类整页场景。', '规则 Droid 定'],
  ['宣传大图', sw('fog', 'deep', 'pale', 'mint', 'ink'), '天雾白，水深薄荷，光浅雾薄荷，巨藻雾薄荷，海獭照原样；标题墨，副句深薄荷（§5.2）。', '规则 Droid 定'],
  ['界面', sw('slate', 'mint', 'pure'), '表面照 08 雾海色阶（页面 #F1F5F7、桌面 #E6EDF0），正文墨，动作色只有石板墨。点睛色每页最多一处：主按钮雾薄荷底墨字，细线小点纯薄荷（第 72 条）。', '已定'],
  ['导出物', '<span class="mute">不用</span>', '卷面和四款 PDF 不出现品牌色；配套解析 PDF 的松烟绿不在色板里，做字标时一起换（§1.6）。', '待定'],
  ['印刷', '<span class="mute">—</span>', 'CMYK 和潘通色号要打样后定，屏幕值换算出来的不能直接下厂。', '未做'],
]
const whereHtml = WHERE.map(([a, b, c, d]) => `<tr><th>${a}</th><td class="sws">${b}</td><td>${esc(c)}</td><td class="st">${d}</td></tr>`).join('')

// 字体后备：照 build-manual.mjs
const FS_DIR = process.env.MANUAL_FONTSOURCE_DIR
let fontCss = ''
if (FS_DIR && existsSync(path.join(FS_DIR, '@fontsource-variable/noto-sans-sc'))) {
  for (const pkg of ['noto-sans-sc', 'noto-serif-sc']) {
    const dir = path.join(FS_DIR, '@fontsource-variable', pkg)
    fontCss += readFileSync(path.join(dir, 'index.css'), 'utf8')
      .replace(/url\(\.\/files\/([^)]+)\)/g, (_, f) => `url(${pathToFileURL(path.join(dir, 'files', f)).href})`)
      .replace(/font-display:\s*swap/g, 'font-display: block')
  }
} else console.warn('没设 MANUAL_FONTSOURCE_DIR：用系统字体。')

const html = (withFonts) => `<!doctype html>
<!-- 由 scripts/brand/palette-sheet.mjs 生成，别手改；改 BRAND.md 和脚本再重跑。 -->
<html lang="zh-CN"><head><meta charset="utf-8"><title>色板</title>
<style>
${withFonts ? fontCss : ''}
:root { --ink:#191D18; --mute:#60665C; --rule:#DCE6EB; --sans:"PingFang SC","Noto Sans SC Variable","Noto Sans CJK SC",system-ui,sans-serif; --serif:"Songti SC","Noto Serif SC Variable","Source Han Serif SC",serif; --mono:"SF Mono",ui-monospace,Menlo,monospace; }
* { box-sizing:border-box; margin:0; }
body { width:1440px; padding:56px 64px 48px; background:#F1F5F7; color:var(--ink); font-family:var(--sans); font-size:13px; line-height:1.7; }
.eyebrow { color:var(--mute); font-size:12px; letter-spacing:.04em; }
h1 { font-family:var(--serif); font-size:40px; font-weight:700; margin:8px 0 10px; }
.lede { max-width:820px; color:#3F4A44; font-size:14px; }
h2 { font-size:15px; font-weight:600; margin:0 0 14px; display:flex; align-items:baseline; gap:12px; }
h2 small { color:var(--mute); font-weight:400; font-size:12px; }
section { margin-top:40px; }
.panel { background:#fff; border-radius:12px; padding:24px 24px 22px; box-shadow:0 0 0 1px rgba(27,43,51,.06); }
.cards { display:grid; grid-template-columns:repeat(6,1fr); gap:16px; }
.cards.three { grid-template-columns:repeat(3,1fr); }
.card { background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 0 0 1px rgba(27,43,51,.06); }
.sw { height:104px; }
.cb { padding:14px 16px 16px; }
.nm { display:flex; justify-content:space-between; align-items:baseline; }
.name { font-family:var(--serif); font-size:20px; font-weight:700; }
.hex { font-family:var(--mono); font-size:12px; font-weight:600; }
.ok { font-family:var(--mono); font-size:11px; color:var(--mute); margin-top:2px; }
.tag { display:inline-block; margin:8px 0 6px; padding:0 7px; border:1px solid var(--rule); border-radius:4px; font-size:11px; color:var(--mute); line-height:18px; }
.job { font-size:12.5px; }
.no { font-size:12px; color:var(--mute); margin-top:6px; }
.row2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px; }
.mistrow { display:grid; grid-template-columns:repeat(8,1fr); gap:8px; margin-top:12px; }
.mistrow div { font-size:11px; color:var(--mute); }
.mistrow i { display:block; height:40px; border-radius:8px; margin-bottom:6px; }
.lad { display:flex; height:52px; border-radius:8px; overflow:hidden; margin-bottom:10px; }
.lseg { flex:1; display:flex; align-items:flex-end; padding:8px 10px; font-size:11px; }
.note { color:var(--mute); font-size:12px; }
.ubar { display:flex; height:16px; border-radius:4px; overflow:hidden; margin-top:12px; }
.ubar span { display:block; }
.ucap { color:var(--mute); font-size:12px; margin-top:4px; }
.mx { width:100%; border-collapse:collapse; }
.mx th { font-size:12px; font-weight:500; color:var(--mute); text-align:left; padding:6px 6px; white-space:nowrap; }
.mx tbody th { color:var(--ink); font-weight:600; font-size:13px; }
.mx td { padding:8px 6px; border-top:1px solid #EEF2F4; white-space:nowrap; }
.mx td.dash { color:#B5C0C6; text-align:center; }
.chip { display:inline-flex; width:22px; height:22px; border-radius:50%; align-items:center; justify-content:center; vertical-align:middle; box-shadow:inset 0 0 0 1px rgba(27,43,51,.12); margin-right:6px; }
.chip i { width:10px; height:10px; border-radius:50%; }
.mx b { font-family:var(--mono); font-size:12px; }
.mx small { display:block; margin-left:28px; margin-top:-4px; font-size:10.5px; color:var(--mute); }
.g-form { color:#94A4AC; }
.rules { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
.rule { background:#fff; border-radius:12px; padding:16px; box-shadow:0 0 0 1px rgba(27,43,51,.06); }
.rule h4 { font-size:13.5px; margin:14px 0 4px; }
.rule p { font-size:12px; color:#3F4A44; }
.sp { height:72px; border-radius:8px; display:flex; align-items:center; gap:8px; padding:0 10px; background:#fff; box-shadow:inset 0 0 0 1px #EEF2F4; position:relative; overflow:hidden; }
.sp.col { flex-direction:column; justify-content:center; align-items:stretch; gap:18px; padding:0 22px; }
.w { padding:6px 9px; border-radius:6px; font-family:var(--serif); font-weight:700; font-size:14px; }
.bad { position:relative; }
.bad::after { content:'×'; position:absolute; top:-7px; right:-7px; width:16px; height:16px; border-radius:50%; background:#191D18; color:#fff; font:600 12px/16px var(--sans); text-align:center; box-shadow:0 0 0 2px #fff; }
.sp { overflow:visible; }
.ln { display:block; height:2px; border-radius:1px; }
.blk { flex:1; height:56px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
.blk.wide { flex:none; width:100%; }
.pill { display:block; width:56px; height:22px; border-radius:11px; }
.pill.big { width:120px; height:36px; border-radius:18px; display:flex; align-items:center; justify-content:center; }
.pill.in { width:64px; height:16px; border-radius:8px; }
.dots { display:flex; gap:22px; }
.dots::before, .dots::after { content:''; width:9px; height:9px; border-radius:50%; background:#191D18; }
.btn { padding:6px 12px; border-radius:8px; font-weight:600; font-size:12px; }
.dot { width:8px; height:8px; border-radius:50%; }
.sel { padding:4px 9px; border-radius:999px; background:#E6EDF0; color:#191D18; font-size:12px; }
.foc { padding:4px 9px; border-radius:6px; background:#fff; outline:2px solid #29424D; outline-offset:2px; font-size:12px; }
.strip { display:flex; width:100%; height:40px; border-radius:6px; overflow:hidden; }
.strip i { flex:1; }
.sp.mist { background:#F4F8FA; overflow:hidden; }
.mist i { position:absolute; width:44px; height:44px; border-radius:50%; filter:blur(6px); }
.where { width:100%; border-collapse:collapse; }
.where th, .where td { text-align:left; vertical-align:top; padding:12px 8px; border-top:1px solid #EEF2F4; font-size:12.5px; }
.where tr:first-child th, .where tr:first-child td { border-top:0; }
.where th { width:130px; font-weight:600; }
.where .sws { width:120px; white-space:nowrap; }
.where .sws i { display:inline-block; width:14px; height:14px; border-radius:3px; margin-right:4px; box-shadow:inset 0 0 0 1px rgba(27,43,51,.12); vertical-align:middle; }
.where .st { width:170px; color:var(--mute); font-size:12px; }
.mute { color:var(--mute); }
footer { margin-top:32px; padding-top:14px; border-top:1px solid var(--rule); color:var(--mute); font-size:11.5px; }
</style></head><body>
  <div class="eyebrow">獭石 · 品牌识别 · 2026-11-16 · 色值和规则照 BRAND.md §1.5、§3.2</div>
  <h1>色板</h1>
  <p class="lede">一条雾薄荷色阶，加一点墨。品牌图形只用六色（雾薄荷阶四档、墨、石板墨），石头另用石色、石面两色；纯薄荷只给界面里的细线和小点；雾色只在雾海场景里。不加新色相：要更多层次时先在雾薄荷阶上加档。</p>

  <section>
    <h2>品牌色 <small>上排六色画标志、海獭、插画和界面动作；下排三色各有专差</small></h2>
    <div class="cards">${['deep', 'mint', 'pale', 'fog', 'ink', 'slate'].map((k) => card(C[k])).join('')}</div>
    <div class="row2">
      <div class="cards three">${['pure', 'stone', 'face'].map((k) => card(C[k])).join('')}</div>
      <div class="panel">
        <h2 style="margin:0">雾色 <small>已定 · 第 67 条 · 只在雾海场景</small></h2>
        <div class="mistrow">${MIST.map(([n, h]) => `<div><i style="background:${h}"></i>${n}<br>${h}</div>`).join('')}</div>
        <p class="note" style="margin-top:12px">现在只有登录页 login-mist.svg 用。模糊成一团一团，不当平涂色块，不画海獭、不写字、不进界面。光束是白色渐隐。青、长春蓝、薰衣草蓝是插画背景，不是界面强调，也不能搬进界面。</p>
      </div>
    </div>
  </section>

  <section class="row2" style="margin-top:40px">
    <div class="panel">
      <h2>色阶 <small>OKLCH 明度 L、色相 H</small></h2>
      <div class="lad">${ladderHtml}</div>
      <p class="note">雾薄荷阶四档的色相都在 ${Math.min(...ladder.map((c) => oklch(c.hex).H)).toFixed(0)}°–${Math.max(...ladder.map((c) => oklch(c.hex).H)).toFixed(0)}°，是一条色阶：雾薄荷管图形，深薄荷管要写字的地方，两档浅色只做同一件东西的里外层。</p>
      <div class="lad" style="margin-top:16px">${neutralHtml}</div>
      <p class="note">墨是带一点绿的近黑；石板墨、石色、石面是同一族冷灰蓝（H 约 227°–230°），石板墨管界面动作，石色、石面只画石头。</p>
    </div>
    <div class="panel">
      <h2>用量 <small>从仓库里的图量出来 · 按 800px 宽画、数像素</small></h2>
      ${usageHtml}
      <p class="note" style="margin-top:12px">规则（第 69 条）：海獭身上雾薄荷约 2/3，两档浅色合计 1/4 到 1/3，墨不超过 4%。坐石全身像去掉石头后量出来是雾薄荷 ${bp('mint')}%、两档浅色 ${bp('pale') + bp('fog')}%、墨 ${bp('ink')}%。深薄荷只在巨藻和水里。</p>
    </div>
  </section>

  <section class="panel">
    <h2>对比度（WCAG 2.x） <small>≥ 4.5 可以写字 · 3–4.5 只够图形边和大字 · &lt; 3 只能靠形状分开 · 页面 #F1F5F7、桌面 #E6EDF0</small></h2>
    ${matrixHtml}
  </section>

  <section>
    <h2>搭配规则 <small>Droid 定 · 第 69 条；界面点睛色 Owner 定 · 第 72、123 条；带 × 的是反例</small></h2>
    <div class="rules">${rulesHtml}</div>
  </section>

  <section class="panel">
    <h2>在哪儿用哪几色 <small>照 BRAND.md §3.2</small></h2>
    <table class="where">${whereHtml}</table>
  </section>

  <footer>清点附记（2026-11-16）：网站代码里色板外的深绿 #1E4A3A 已全部收掉，两个变量删了（第 122、123 条）；界面的选中、悬停、焦点不再用深薄荷，深薄荷在网站界面上已经没有用处，只留着身份色变量。印刷色没打样。竹青时的色板页（Paper「主题 10 · 色板」，导出 evidence/palette.png，2026-10-14）留作历史。数字由 scripts/brand/palette-sheet.mjs 现算。</footer>
</body></html>
`

mkdirSync(path.dirname(OUT_HTML), { recursive: true })
writeFileSync(OUT_HTML, html(false))
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.setContent(html(true), { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'visible' && e.clientWidth > 0).map((e) => e.className || e.tagName).slice(0, 10))
await page.screenshot({ path: OUT_PNG, fullPage: true })
await browser.close()
console.log('HTML：' + path.relative(ROOT, OUT_HTML))
console.log('PNG：' + path.relative(ROOT, OUT_PNG))
console.log('用量：' + JSON.stringify(USAGE.map((u) => ({ f: u.file, ...Object.fromEntries(Object.entries(u.counts).map(([k, v]) => [k, k === 'total' ? v : +((100 * v) / u.counts.total).toFixed(1)])) }))))
console.log('坐石去掉石头：', { mint: bp('mint'), pale: bp('pale'), fog: bp('fog'), ink: bp('ink') })
if (overflow.length) console.log('可能出界：', overflow)
