// Assembles prototype.html from DOM dumped off the live 看整卷 page
// (/tmp/panel.html, /tmp/excerpt.parsed.json, /tmp/optB.json) plus the
// real stylesheets, so the prototype's baseline (「现状」) is the exact
// shipped rendering, not a hand-drawn approximation. Run once; the output
// is committed, the dumps are not.
import { readFileSync, writeFileSync } from 'node:fs'

const panel = readFileSync('/tmp/panel.html', 'utf8')
const excerpt = JSON.parse(readFileSync('/tmp/excerpt.parsed.json', 'utf8'))
const optB = JSON.parse(readFileSync('/tmp/optB.json', 'utf8'))

// Swap the live B row (collapsed) for the expanded dump so its 干扰解析
// detail exists in the DOM; JS below shows/hides details via --active.
const panelWithB = panel.replace(
  /<li class="pi-ps-analysis-option-section pi-ps-analysis-option-section--wrong" data-pi-option-label="B">[\s\S]*?<\/li>/,
  optB.replace(' pi-ps-analysis-option-section--active', '').replace('aria-expanded="true" aria-pressed="true"', 'aria-expanded="false" aria-pressed="false"').replace(' pi-ps-analysis-distractor--selected', '').replace(/(data-pi-evidence-kind="trap"[^>]*?)aria-pressed="true"/, '$1aria-pressed="false"'),
)

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>讲评面板原型 · 2026-09-15</title>
<link rel="stylesheet" href="/app/public/fonts/paper/fonts.css" />
<link rel="stylesheet" href="/app/src/index.css" />
<link rel="stylesheet" href="/app/src/App.css" />
<link rel="stylesheet" href="/app/src/shared-ui/papersurface/PaperSurface.css" />
<link rel="stylesheet" href="/app/src/features/paper-intelligence/paperIntelligence.css" />
<link rel="stylesheet" href="/app/src/features/paper-browse/paperBrowsePage.css" />
<link rel="stylesheet" href="./proto.css" />
</head>
<body class="proto-c">
<div class="proto-bar">
  <span class="proto-bar-title">讲评面板 · Reading B · 24</span>
  <div class="proto-switch" role="radiogroup" aria-label="方案">
    <button type="button" data-mode="now">现状</button>
    <button type="button" data-mode="a">方案 A · 全墨</button>
    <button type="button" data-mode="c" aria-checked="true">方案 C · 色留量减</button>
  </div>
  <span class="proto-bar-hint">点选项行 A / B 切换展开；点证据句切换连线。</span>
</div>
<div class="paper-browse-shell paper-browse-shell--lecture-open proto-shell">
  <div class="paper-browse-content proto-content" style="${excerpt.contentStyle}">
    <div class="paper-browse-zoom proto-zoom">
      <section class="paper-browse-group-card proto-card">
      <div class="ps-surface proto-surface" style="${excerpt.surfaceStyle.replace(/"/g, "&quot;")}">
      <article class="ps-page proto-page">
        <div class="ps-canonical-reading">
          <p class="ps-canonical-reading-paragraph">Later, after spotting bear tracks, we were told to make loud noises, which soon became a game once the tension faded.</p>
          ${excerpt.para}
          <p class="ps-canonical-reading-paragraph">Until suddenly, time stood still.</p>
        </div>
        <ol class="${excerpt.listClass}">
          ${excerpt.q}
        </ol>
      </article>
      </div>
      </section>
    </div>
  </div>
  <svg class="pi-line-overlay proto-line" aria-hidden="true"><path class="pi-line-path" d="" /></svg>
  ${panelWithB}
</div>
<script>
(() => {
  const body = document.body
  for (const b of document.querySelectorAll('.proto-switch button')) {
    b.addEventListener('click', () => {
      body.className = 'proto-' + b.dataset.mode
      for (const o of document.querySelectorAll('.proto-switch button')) o.setAttribute('aria-checked', String(o === b))
    })
  }
  const sections = [...document.querySelectorAll('.pi-ps-analysis-option-section')]
  const evidences = [...document.querySelectorAll('[data-pi-evidence-id]')]
  const marks = [...document.querySelectorAll('.ps-evidence-anchor')]
  const path = document.querySelector('.proto-line path')
  const overlay = document.querySelector('.proto-line')

  function selectEvidence(btn) {
    for (const e of evidences) {
      const on = e === btn
      e.setAttribute('aria-pressed', String(on))
      e.classList.toggle('pi-ps-analysis-evidence--selected', on && e.dataset.piEvidenceKind === 'support')
      e.classList.toggle('pi-ps-analysis-distractor--selected', on && e.dataset.piEvidenceKind === 'trap')
    }
    const kind = btn.dataset.piEvidenceKind
    path.setAttribute('data-pi-evidence-kind', kind)
    for (const m of marks) {
      const on = m.dataset.paperEvidenceKind === kind
      m.classList.toggle('ps-evidence-anchor--active', on)
    }
    requestAnimationFrame(drawLine)
  }

  function drawLine() {
    const btn = evidences.find((e) => e.getAttribute('aria-pressed') === 'true')
    const mark = marks.find((m) => m.classList.contains('ps-evidence-anchor--active'))
    if (!btn || !mark) { overlay.dataset.empty = 'true'; return }
    overlay.dataset.empty = 'false'
    const o = overlay.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    const rects = mark.getClientRects()
    const m = rects[rects.length - 1]
    const x1 = m.right - o.left, y1 = m.top - o.top + m.height / 2
    const x2 = b.left - o.left, y2 = b.top - o.top + b.height / 2
    const c = (x2 - x1) * 0.5
    path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + (x1 + c) + ' ' + y1 + ' ' + (x2 - c) + ' ' + y2 + ' ' + x2 + ' ' + y2)
  }

  for (const s of sections) {
    s.querySelector('.pi-ps-analysis-option-row').addEventListener('click', () => {
      const wasActive = s.classList.contains('pi-ps-analysis-option-section--active')
      for (const x of sections) {
        const on = x === s && !wasActive
        x.classList.toggle('pi-ps-analysis-option-section--active', on)
        x.querySelector('.pi-ps-analysis-option-row').setAttribute('aria-expanded', String(on))
        x.querySelector('.pi-ps-analysis-option-row').setAttribute('aria-pressed', String(on))
      }
      const first = s.querySelector('[data-pi-evidence-id]')
      if (!wasActive && first) selectEvidence(first)
      else requestAnimationFrame(drawLine)
    })
  }
  for (const e of evidences) e.addEventListener('click', () => selectEvidence(e))
  window.addEventListener('resize', drawLine)
  document.fonts.ready.then(drawLine)
  drawLine()
})()
</script>
</body>
</html>
`
writeFileSync(new URL('./prototype.html', import.meta.url), html)
console.log('wrote prototype.html', html.length)
