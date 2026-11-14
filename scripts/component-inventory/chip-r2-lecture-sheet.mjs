#!/usr/bin/env node
// 胶囊第二轮 · 讲评栏小签样张（完形 pi-cloze-*、语法填空 pi-gf-*）。
// 测试数据（INVENTORY_SEED=full）里没有已发布的完形、语法填空解析，讲评栏只显示「解析未发布」，拍不到真页面。
// 这里把面板里那几行的标记照 ClozeAnalysisPanel.tsx / GrammarFillAnalysisPanel.tsx 原样排出来，
// 样式直接读仓库里的 index.css + tokens.css + chip.css + lectureAnalysisPanels.css（画的是真样式，不是另写的仿样式）。
// before 用原来的 span + 类名；after 用 Chip 渲染出来的标记（span.eqb-chip[data-kind=mark] > span.eqb-chip-label）。
// 用法：node scripts/component-inventory/chip-r2-lecture-sheet.mjs before|after
// 输出：design/components-2026-11-13/migrate-chip-r2/<before|after>/lecture-sheet.png
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, SRC, requireFromApp } from './lib.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：chip-r2-lecture-sheet.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-chip-r2', label)
mkdirSync(OUT, { recursive: true })

const css = ['index.css', 'shared-ui/tokens.css', 'shared-ui/chip.css', 'features/paper-intelligence/lectureAnalysisPanels.css']
  .map((f) => readFileSync(path.join(SRC, f), 'utf8').replace(/@import[^;]+;/g, '')).join('\n')

const after = label === 'after'
const tag = (cls, text) => after
  ? `<span class="eqb-chip ${cls}" data-kind="mark"><span class="eqb-chip-label">${text}</span></span>`
  : `<span class="${cls}">${text}</span>`

const cloze = `
<div class="pi-cloze-blank-card">
  <div class="pi-cloze-blank-header">
    <span class="pi-cloze-blank-no">第 41 题</span>
    ${tag('pi-cloze-tag pi-cloze-tag--pos', '动词')}
    ${tag('pi-cloze-tag pi-cloze-tag--sig', '近义词辨析')}
  </div>
  <div class="pi-cloze-correct-fit"><h4 class="pi-cloze-section-title">答案解析</h4>
    <div class="pi-cloze-answer-row"><span class="pi-cloze-answer-badge">B</span><p class="pi-cloze-fit-reason">（示意文字）前文说他终于下定决心，这里填「决定」。</p></div></div>
  <div class="pi-cloze-evidence-block">
    <button type="button" class="pi-cloze-evidence">${tag('pi-cloze-evidence-type-label', '上下文复现')}<blockquote class="pi-cloze-evidence-quote">(示意) He finally made up his mind.</blockquote></button>
    <div class="pi-cloze-evidence-option">${tag('pi-cloze-evidence-type-label', '选项对照')}<span class="pi-cloze-evidence-option-text">(示意) decided</span></div>
  </div>
</div>`

const grammar = `
<div class="pi-gf-blank-card">
  <div class="pi-gf-blank-header">
    <span class="pi-gf-blank-no">第 56 题</span>
    ${tag('pi-gf-tag pi-gf-tag--type', '有提示词')}
    ${tag('pi-gf-blank-hint', '提示词：visit')}
    ${tag('pi-gf-tag pi-gf-tag--facet', '非谓语动词')}
  </div>
  <div class="pi-gf-answer"><h4 class="pi-gf-section-title">答案</h4><span class="pi-gf-answer-badge">visiting</span></div>
  <div class="pi-gf-nonfinite-badges">${tag('pi-gf-badge pi-gf-badge--role', '宾语补足语')}</div>
  <div class="pi-gf-evidence-block">
    <button type="button" class="pi-gf-evidence">${tag('pi-gf-evidence-type-label', '固定搭配')}<blockquote class="pi-gf-evidence-quote">(示意) look forward to ___</blockquote></button>
    <button type="button" class="pi-gf-evidence pi-gf-evidence--selected" aria-pressed="true">${tag('pi-gf-evidence-type-label', '选中时')}<blockquote class="pi-gf-evidence-quote">(示意) enjoy ___ the museum</blockquote></button>
  </div>
</div>`

const narrowLong = `<div class="pi-gf-blank-header">${tag('pi-gf-blank-hint', '提示词：a very long hint word for truncation')}${tag('pi-gf-tag pi-gf-tag--facet', '非谓语动词（很长的考点名，看截断）')}</div>`

const html = `<!doctype html><meta charset="utf-8"><style>${css}
body{margin:0;padding:24px;background:var(--eqb-color-bg);font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif;color:var(--eqb-color-text);width:880px}
h1{font-size:16px;margin:0 0 12px;font-weight:600}.cap{font-size:12px;color:var(--eqb-color-text-muted);margin:0 0 6px}
.cols{display:grid;grid-template-columns:400px 400px;gap:24px}.panel{background:var(--eqb-color-paper);padding:16px;border-radius:var(--eqb-radius-card)}
.narrow{width:220px;margin-top:16px}
</style>
<h1>讲评栏小签 · ${after ? '改后（Chip）' : '改前'}</h1>
<div class="cols"><div><p class="cap">完形</p><div class="panel">${cloze}</div></div><div><p class="cap">语法填空</p><div class="panel">${grammar}</div></div></div>
<p class="cap" style="margin-top:16px">窄栏 220px，长字</p><div class="panel narrow">${narrowLong}</div>`

const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 928, height: 600 }, deviceScaleFactor: 2 })
await page.setContent(html); await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, 'lecture-sheet.png'), fullPage: true })
await browser.close()
console.log('ok', path.join(OUT, 'lecture-sheet.png'))
