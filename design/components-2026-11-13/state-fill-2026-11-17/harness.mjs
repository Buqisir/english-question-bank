// 复刻选词浮条和查词卡的结构（照 SelectionOverlay.tsx / DictionaryCard.tsx），载入改前、改后两版真 CSS，量各块位置。
import fs from 'node:fs'
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/user/english-question-bank/app/package.json')('playwright')
const G = process.argv[2]
const svg = (n) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/></svg>`
const body = `
<div class="paper-selection-overlay" style="position:static;display:inline-block"><div class="paper-selection-toolbar" id="tb">
  <button class="paper-selection-lookup">${svg(16)}<span>查词</span></button>
  <button class="paper-selection-translate">${svg(16)}<span>翻译</span></button>
  <button class="paper-selection-action-btn" aria-label="复制">${svg(16)}</button>
  <button class="paper-selection-action-btn" aria-label="关闭">${svg(16)}</button>
</div></div>
<div class="paper-selection-card" style="position:static;margin-top:20px;width:max-content;max-width:none" id="card"><div class="paper-dictionary-head" style="display:flex;align-items:center;gap:8px">
  <strong>stadium</strong>
  <span class="paper-dictionary-pronunciation"><span class="paper-dictionary-ipa">/ˈsteɪdiəm/</span><button class="paper-dictionary-play">${svg(14)}</button></span>
  <span class="paper-dictionary-pronunciation"><button class="paper-dictionary-play"><span class="paper-dictionary-dialect">美</span>${svg(14)}</button></span>
  <button class="paper-dictionary-analyze">${svg(14)}<span>分析句子</span></button>
  <button class="paper-selection-action-btn" aria-label="关闭">${svg(16)}</button>
</div><p>下一行</p></div>`
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const res = {}
for (const v of ['before', 'after']) {
  const css = ['tokens.css', 'index.css', 'selectionOverlay.css', 'sentenceAnalysis.css'].map((f) => fs.readFileSync(`${G}/h/${v}/${f}`, 'utf8')).join('\n')
  const p = await b.newPage({ viewport: { width: 900, height: 400 }, deviceScaleFactor: 2 })
  await p.setContent(`<html><head><style>${css}</style></head><body style="padding:40px;font-family:sans-serif">${body}</body></html>`)
  res[v] = await p.evaluate(() => [...document.querySelectorAll('#tb > *, #tb, #card, #card .paper-dictionary-head > *, #card .paper-dictionary-pronunciation > *, #card p')].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [e.className || e.tagName, e.textContent.trim().slice(0, 6), +r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1), cs.borderTopLeftRadius] }))
  await p.hover('.paper-dictionary-play >> nth=0'); await p.screenshot({ path: `${G}/h/${v}.png` })
}
await b.close()
const S = new Set(['paper-selection-lookup', 'paper-selection-translate', 'paper-selection-action-btn', 'paper-dictionary-play', 'paper-dictionary-analyze'])
for (let i = 0; i < res.before.length; i++) { const a = res.before[i], c = res.after[i]; const moved = S.has(a[0]) ? '' : (a.slice(2, 6).join() === c.slice(2, 6).join() ? 'same' : 'MOVED'); console.log(a[0].slice(0, 26).padEnd(27), a[1].padEnd(7), JSON.stringify(a.slice(2)), '->', JSON.stringify(c.slice(2)), moved) }
