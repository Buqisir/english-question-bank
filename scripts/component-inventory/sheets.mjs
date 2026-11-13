#!/usr/bin/env node
// 构件清点 · 对照图：每类一张，把同一类的所有变体排在一起，标次数、位置、工作、走样、对照结果。
// 读 .scratch/component-inventory/analysis.json 和 crops/，出 design/components-2026-11-13/sheet-<类>.png
// 用法：node scripts/component-inventory/sheets.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { OUT, RAW, KINDS, requireFromApp } from './lib.mjs'

const A = JSON.parse(readFileSync(path.join(RAW, 'analysis.json'), 'utf8'))
const { chromium } = requireFromApp('playwright')
const CROPS = path.join(RAW, 'crops')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const img = (f, cls = '') => (f && existsSync(path.join(CROPS, f)) ? `<img class="${cls}" src="${pathToFileURL(path.join(CROPS, f)).href}">` : '<span class="nocrop">没截到</span>')

function card(v) {
  const bad = v.checks.filter((c) => !c.ok).map((c) => c.note)
  if (v.contrastOk === false) bad.push(`对比度 ${v.contrast}（不到 4.5）`)
  if (v.target && !v.target.ok) bad.push(`点击区域 ${v.target.w}×${v.target.h}（不到 24×24）`)
  if (v.focusVisible === false) bad.push('焦点看不出')
  if (v.noName) bad.push(`${v.noName} 处没有读屏名字`)
  for (const [r, n] of v.axe) bad.push(`axe ${r} ×${n}`)
  const st = v.states
  const stateRow = st || v.disabled || v.selected ? `<div class="states">
    ${st ? `<figure>${img(st.crops.hover, 's')}<figcaption>悬停${st.hover?.length ? '' : '（不变）'}</figcaption></figure>
    <figure>${img(st.crops.focus, 's')}<figcaption>焦点${st.focus?.length ? '' : '（不变）'}</figcaption></figure>
    <figure>${img(st.crops.active, 's')}<figcaption>按下${st.active?.length ? '' : '（不变）'}</figcaption></figure>` : ''}
    ${v.disabled ? `<figure>${img(v.disabled.crop, 's')}<figcaption>禁用</figcaption></figure>` : ''}
    ${v.selected ? `<figure>${img(v.selected.crop, 's')}<figcaption>选中</figcaption></figure>` : ''}
  </div>` : ''
  const where = v.files.slice(0, 3).map((f) => f.replace(/^features\//, '')).join('、') + (v.files.length > 3 ? ` 等 ${v.files.length} 个文件` : '')
  return `<div class="card${v.mainline ? ' main' : ''}${v.drift.length ? ' drift' : ''}">
  <div class="head"><b>${v.id}</b><span class="n">${v.count} 处 · ${v.sites} 个写法位置</span>${v.mainline ? '<span class="tag m">主线</span>' : ''}${v.drift.length ? `<span class="tag d">并入 ${v.drift.length} 种走样</span>` : ''}${v.intent.startsWith('有意') ? '<span class="tag o">有 Owner 决定</span>' : ''}</div>
  <div class="shot">${img(v.crop)}</div>
  ${stateRow}
  <div class="meta">
    <div><i>干什么</i>${v.jobs.slice(0, 3).map(([j, n]) => `${esc(j)} ${n}`).join(' · ')}</div>
    <div><i>样子</i>底 ${esc(v.look.bg)} · 字 ${esc(v.look.color)} ${esc(v.look.font)} · 圆角 ${esc(v.look.radius.join('/'))} · 影子 ${esc(v.look.shadow)}${v.look.height ? ` · 高 ${v.look.height}` : ''}</div>
    <div><i>在哪</i>${esc(where)}</div>
    <div><i>类名</i>${esc(v.primaryClass || '（无类名）')}${v.provenance?.first ? ` · 始于 ${esc(v.provenance.first.date)} ${esc(v.provenance.first.hash)}` : ''}</div>
    ${v.drift.length ? `<div class="dr"><i>走样</i>${v.drift.slice(0, 3).map((d) => `${d.count} 处：${esc(d.diffs.join('，'))}`).join('；')}</div>` : ''}
    ${bad.length ? `<div class="bad"><i>对不上</i>${esc(bad.slice(0, 5).join('；'))}</div>` : '<div class="ok"><i>对照</i>四档影子、圆角家族、色阶、对比度都合</div>'}
    <div><i>抽构件</i>${esc(v.difficulty.level)}${v.provenance?.lockedBy?.length ? ` · 被 ${v.provenance.lockedBy.length} 个检查脚本锁着` : ''}</div>
  </div></div>`
}

const css = `body{margin:0;padding:28px;background:#F4F3EF;font:13px/1.5 -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#2B2A27;width:1520px}
h1{font-size:22px;margin:0 0 4px}p.sub{margin:0 0 18px;color:#6B6862}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.card{background:#fff;border:1px solid #E2E0DA;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}
.card.main{border-color:#72BFA4;box-shadow:inset 3px 0 0 #72BFA4}.card.drift .head b{color:#B5532E}
.head{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.head b{font-size:15px}.n{color:#6B6862}
.tag{font-size:11px;padding:1px 6px;border-radius:4px;background:#ECEAE4}.tag.m{background:#E3F2EC;color:#2F6E58}.tag.d{background:#F8E7DF;color:#9A4325}.tag.o{background:#E8ECF4;color:#3B4F75}
.shot{min-height:44px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#F7F6F2 0 25%,#FFFFFF 0 50%) 0 0/12px 12px;border-radius:4px;padding:8px;overflow:hidden}
.shot img{max-width:100%;max-height:220px;zoom:.5}
.states{display:flex;gap:6px;flex-wrap:wrap}.states figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:2px}.states img.s{max-height:80px;max-width:150px;zoom:.5}.states figcaption{font-size:11px;color:#6B6862}
.meta div{font-size:12px;margin:1px 0;word-break:break-all}.meta i{font-style:normal;color:#8A867E;margin-right:6px}
.bad{color:#9A4325}.ok{color:#2F6E58}.dr{color:#9A4325}.nocrop{color:#B0ACA4;font-size:12px}
.summary{display:flex;gap:18px;margin:0 0 18px;flex-wrap:wrap}.summary div{background:#fff;border:1px solid #E2E0DA;border-radius:8px;padding:8px 12px}.summary b{font-size:18px;display:block}`

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1576, height: 900 }, deviceScaleFactor: 1 })
for (const [kind, label] of KINDS) {
  const vs = A.variants.filter((v) => v.kind === kind && !v.seed)
  const jobs = A.jobView.filter((j) => j.kind === kind)
  const multi = jobs.filter((j) => j.variants > 1)
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
  <h1>${label}：${vs.length} 种写法</h1>
  <p class="sub">本地测试数据 · 1440 宽实拍 · 按出现次数排 · 绿边 = 在「找题 → 加入 → 草稿卷 → 导出」主线上 · 编号红色 = 并入了差一点点的走样 · 归类是提案 · 单一来源</p>
  <div class="summary"><div><b>${vs.reduce((n, v) => n + v.count, 0)}</b>处</div><div><b>${vs.filter((v) => v.mainline).length}</b>种在主线上</div><div><b>${vs.filter((v) => v.drift.length).length}</b>种并入了走样</div>
  <div><b>${multi.length}</b>件事有不止一种样子${multi.length ? '：' + multi.slice(0, 6).map((j) => `${esc(j.job)}（${j.variants} 种）`).join('、') : ''}</div></div>
  <div class="grid">${vs.map(card).join('')}</div>`
  const f = path.join(RAW, `sheet-${kind}.html`); writeFileSync(f, html)
  await page.goto(pathToFileURL(f).href); await page.waitForLoadState('load')
  await page.screenshot({ path: path.join(OUT, `sheet-${kind}.png`), fullPage: true })
  console.log(kind, vs.length)
}
await browser.close()
