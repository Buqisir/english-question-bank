// Build a stroke comparison page from the real generated EQB icon sources.
import fs from 'node:fs'
import path from 'node:path'

const gen = process.argv[2]
const out = process.argv[3]

function body(name, big = true) {
  const src = fs.readFileSync(path.join(gen, `${name}.tsx`), 'utf8')
  const m = src.match(/variant === 'fill' \? <>[\s\S]*?<\/> : <>([\s\S]*?)<\/>\}/)
  let s = m[1]
  s = s.replace(/strokeWidth=\{isSmall \? ([\d.]+) : ([\d.]+)\}/g, (_, a, b) => `stroke-width="${big ? b : a}"`)
  s = s.replace(/strokeWidth=\{([\d.]+)\}/g, 'stroke-width="$1"').replace(/strokeWidth="/g, 'stroke-width="')
  s = s.replace(/fillRule=/g, 'fill-rule=').replace(/fillOpacity=\{([\d.]+)\}/g, 'fill-opacity="$1"')
  return s
}

const svg = (name, size, sw) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${sw}">${body(name)}</svg>`

const scenes = (sw32, sw24) => `
  <div class="card done">${svg('check', 32, sw32)}<div><h2>本组听写完成</h2><p>可以从头再听一遍，或者核对本组答案。</p></div></div>
  <div class="card empty">${svg('book-marked', 32, sw32)}<h2>生词本还是空的</h2><p>[空态说明文字]</p></div>
  <div class="card resume">${svg('rotate-ccw', 32, sw32)}<h2>继续上次听写？</h2></div>
  <div class="card ctrl"><span class="btn">${svg('chevron-left', 24, sw24)}</span><span class="btn main">${svg('rotate-ccw', 24, sw24)}</span><span class="btn">${svg('chevron-right', 24, sw24)}</span></div>`

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f1f5f7;color:#1b2b33;font-family:Inter,'PingFang SC','Noto Sans CJK SC',system-ui,sans-serif;padding:28px}
.grid{display:grid;grid-template-columns:150px 1fr 1fr;gap:16px;align-items:start}
.col{display:flex;flex-direction:column;gap:14px}
.head{font-size:14px;font-weight:600}
.sub{font-size:12px;color:#5a6c75}
.card{background:#fafcf8;border:1px solid #dce6eb;border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;min-height:56px}
.card.empty,.card.resume{flex-direction:column;gap:8px;text-align:center}
.card h2{margin:0;font-size:18px;font-weight:600}.card p{margin:2px 0 0;font-size:13px;color:#5a6c75}
.ctrl{justify-content:center;gap:18px}
.btn{width:44px;height:44px;border-radius:50%;border:1px solid #c5d3da;display:grid;place-items:center;background:#fff}
.btn.main{width:56px;height:56px;background:#29424D;color:#fff;border:0}
.lab{font-size:13px;color:#3f525b;line-height:1.6}
</style>
<div class="grid">
  <div></div>
  <div class="head">现行<div class="sub">24 起 2.75 单位：32px 渲染 3.67px，24px 渲染 2.75px</div></div>
  <div class="head">新（Owner 2026-11-02 定）<div class="sub">32px 用 1.875 单位 = 2.5px；24px 用 2.0 单位 = 2px</div></div>
  <div class="col lab"><div style="height:78px">结果页 · 32</div><div style="height:118px">空态 · 32</div><div style="height:100px">情绪位 · 32</div><div>播放控件 · 24</div></div>
  <div class="col">${scenes(2.75, 2.75)}</div>
  <div class="col">${scenes(1.875, 2.0)}</div>
</div>`
fs.writeFileSync(out, html)
