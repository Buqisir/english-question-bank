#!/usr/bin/env node
/**
 * MF-1 gating spike (draft-desk-b, DP-1): does paged.js, run once in a headless
 * Chromium page, make a viable single source of truth that produces (1) a
 * paginated live DOM (for preview + button overlay) and (2) a PDF, FROM THE
 * SAME PAGE OBJECT, with the two provably in parity?
 *
 * Four hard acceptance checks (raw evidence only, no go/no-go verdict —
 * that's the PM's call):
 *   (a) long reading passage splits at paragraph boundaries, not mid-sentence
 *   (b) @page @bottom-center counter(page) footer (incl. draft-paper's
 *       addDraftFooterCss cascade) renders correctly on every page
 *   (c) warm-instance single-render latency, staged
 *   (d) serialized paged.js DOM vs page.pdf() — page-by-page comparison
 *
 * Data loading + buildPrintHtml call + playwright chromium launch pattern
 * copied from this session's earlier spike-headless-pagination.mjs (same
 * paper: 26.3重庆市巴蜀中学高三月考（七）英语试卷, has a long reading passage).
 *
 * SCRATCHPAD ONLY. Touches no product code (app/, server/ untouched — this
 * script only READS server/print-renderer.mjs as a library call, exactly
 * like scripts/print-visual-qa-guangdong.mjs already does).
 *
 * Run:
 *   unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
 *   node spike-pagedjs-gate.mjs
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = '/Users/huangxuewei/Projects/english-question-bank'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))
const { PDFDocument } = require(path.join(rootDir, 'server', 'node_modules', 'pdf-lib'))
const { buildPrintHtml } = await import(path.join(rootDir, 'server', 'print-renderer.mjs'))

const PAGEDJS_POLYFILL_PATH = path.join(__dirname, 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js')

const dbPath = path.join(rootDir, 'data', 'question-bank.sqlite')
const PAPER_NAME = '26.3重庆市巴蜀中学高三月考（七）英语试卷'

console.log(`Loading "${PAPER_NAME}" question groups from DB...`)
const db = new DatabaseSync(dbPath)
const groups = db.prepare(`
  SELECT qg.id, qg.title, qg.group_type, qg.default_score, qg.display_order
  FROM question_groups qg
  JOIN passages p ON qg.passage_id = p.id
  JOIN sources s ON p.source_id = s.id
  WHERE s.paper_name = ?
  ORDER BY qg.display_order
`).all(PAPER_NAME)
if (groups.length === 0) { console.error('ERROR: no groups found for paper'); process.exit(1) }
console.log(`  ${groups.length} groups`)

function getGroupDetail(groupId) {
  const row = db.prepare(`
    SELECT qg.id, qg.title, qg.group_type, qg.instruction, qg.default_score,
           p.id AS passage_id, p.title AS passage_title, p.material_text, p.summary
    FROM question_groups qg
    JOIN passages p ON p.id = qg.passage_id
    WHERE qg.id = ?
  `).get(groupId)
  if (!row) return null
  const questions = db.prepare(`
    SELECT id, question_no, stem, answer, explanation, note, display_order
    FROM questions WHERE group_id = ? ORDER BY display_order, question_no
  `).all(groupId)
  const selectOptions = db.prepare(`
    SELECT label, content, display_order FROM options WHERE question_id = ? ORDER BY display_order, label
  `)
  return {
    id: row.id,
    title: row.title,
    groupType: row.group_type,
    defaultScore: row.default_score,
    passage: { title: row.passage_title, materialText: row.material_text || '', summary: row.summary || '' },
    questions: questions.map(q => ({
      id: q.id, questionNo: q.question_no, stem: q.stem, answer: q.answer,
      explanation: q.explanation, note: q.note || '',
      options: selectOptions.all(q.id).map(o => ({ label: o.label, content: o.content })),
    })),
  }
}

const sectionOrder = ['reading', 'seven_choices', 'cloze', 'grammar_cloze']
const sectionLabels = { reading: '第一部分 阅读理解', seven_choices: '第二节 七选五', cloze: '第三部分 完形填空', grammar_cloze: '第四部分 语法填空' }
// Same spike-only filter as the earlier naive-extraction spike: this paper's
// grammar_cloze group has malformed source data (in-text blank markers don't
// match question count) that trips buildPrintHtml's own consistency assert —
// a pre-existing DATA problem unrelated to what THIS spike tests.
const sortedGroups = [...groups]
  .filter((g) => g.group_type !== 'grammar_cloze' && g.group_type !== 'cloze')
  .sort((a, b) => {
    const ai = sectionOrder.indexOf(a.group_type); const bi = sectionOrder.indexOf(b.group_type)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

const items = []
const blocks = []
let lastType = null
for (const g of sortedGroups) {
  const detail = getGroupDetail(g.id)
  if (!detail) continue
  if (g.group_type !== lastType) {
    if (lastType !== null) blocks.push({ type: 'page_break' })
    blocks.push({ type: 'section_header', title: sectionLabels[g.group_type] || g.group_type })
    lastType = g.group_type
  }
  blocks.push({ type: 'question_group', questionGroupId: g.id, score: g.default_score })
  items.push({ detail, score: g.default_score, sectionTitle: '', note: '' })
}
db.close()

let longestReadingGroup = null
let longestLen = -1
for (const it of items) {
  if (it.detail.groupType === 'reading' && it.detail.passage.materialText.length > longestLen) {
    longestLen = it.detail.passage.materialText.length
    longestReadingGroup = it.detail
  }
}
console.log(`  Longest reading passage: "${longestReadingGroup?.title}" (${longestLen} chars, group id ${longestReadingGroup?.id})`)

console.log('\nBuilding print HTML (buildPrintHtml)...')
const PAPER_TITLE = '2026年广东省高三一模英语试卷'
let html = buildPrintHtml({
  title: PAPER_TITLE,
  versionType: 'student',
  printStyle: 'exam',
  items, blocks, questionNumberStart: 1,
})

// --- Mimic server/draft-paper/draftPaperStore.mjs's addDraftFooterCss cascade
// (SW-4): a SECOND @page @bottom-center block appended right before </style>,
// same as the draft-paper flow layers on top of print-renderer.mjs's base
// footer rule. Tests whether paged.js resolves the cascade the same way
// browsers do (later same-specificity rule wins -> "标题 · 页码", NOT the
// base "英语试题 第X页(共Y页)").
function addDraftFooterCss(htmlIn, title) {
  const safeTitle = String(title || '英语练习卷').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const footerCss = `
@page {
  @bottom-center {
    content: "${safeTitle} · " counter(page);
    font-size: 9pt;
    color: #666;
  }
}
`
  return htmlIn.replace('</style>', `${footerCss}\n</style>`)
}
html = addDraftFooterCss(html, PAPER_TITLE)

const tempDir = mkdtempSync(path.join(tmpdir(), 'spike-pagedjs-'))
const htmlPath = path.join(tempDir, 'paper.html')
writeFileSync(htmlPath, html)
console.log(`  HTML written: ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`)
console.log(`  Artifacts dir: ${tempDir}`)

async function pdfPageCount(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes)
  return doc.getPageCount()
}

async function runPagedJsOnce(browser, label) {
  const stage = {}
  const t0 = Date.now()
  const page = await browser.newPage()
  await page.goto('file://' + htmlPath, { waitUntil: 'load' })
  stage.baseLoad = Date.now() - t0

  // Set PagedConfig BEFORE injecting the polyfill script — the polyfill reads
  // window.PagedConfig synchronously at script-eval time (see
  // node_modules/pagedjs/dist/paged.polyfill.js tail: `let config =
  // window.PagedConfig || {...}`), then runs Previewer.preview() once
  // document.readyState is >= interactive (already true here since we
  // waited for 'load' above, so it fires ~immediately).
  const t1 = Date.now()
  await page.evaluate(() => {
    window.__pagedDone = false
    window.__pagedError = null
    window.PagedConfig = {
      auto: true,
      after: (flow) => {
        window.__pagedDone = true
        window.__pagedFlow = { pageCount: flow.pages.length, performanceMs: flow.performance }
      },
    }
  })
  try {
    await page.addScriptTag({ path: PAGEDJS_POLYFILL_PATH })
  } catch (e) {
    stage.scriptTagError = String(e)
  }
  const t2 = Date.now()
  stage.scriptInject = t2 - t1

  let timedOut = false
  try {
    await page.waitForFunction('window.__pagedDone === true', { timeout: 45000 })
  } catch (e) {
    timedOut = true
  }
  const t3 = Date.now()
  stage.pagination = t3 - t2

  const pagedFlow = timedOut ? null : await page.evaluate(() => window.__pagedFlow)

  // Serialize the paginated DOM from THIS SAME page.
  const serializedHtml = timedOut ? null : await page.content()
  const t4 = Date.now()
  stage.serialize = t4 - t3

  // page.pdf() from THIS SAME page object (not a fresh page) — the actual
  // architectural claim under test: one page, two co-produced artifacts.
  let pdfBytes = null
  let pdfError = null
  try {
    pdfBytes = await page.pdf({ printBackground: true }) // @page size:A4 in the CSS drives geometry
  } catch (e) {
    pdfError = String(e)
  }
  const t5 = Date.now()
  stage.pdf = t5 - t4
  stage.total = t5 - t0

  if (serializedHtml) writeFileSync(path.join(tempDir, `${label}-serialized.html`), serializedHtml)
  if (pdfBytes) writeFileSync(path.join(tempDir, `${label}.pdf`), pdfBytes)

  const pageCount = pdfBytes ? await pdfPageCount(pdfBytes) : null

  console.log(`  [${label}] baseLoad=${stage.baseLoad}ms scriptInject=${stage.scriptInject}ms pagination=${stage.pagination}ms serialize=${stage.serialize}ms pdf=${stage.pdf}ms TOTAL(excl launch)=${stage.total}ms`)
  console.log(`  [${label}] timedOut=${timedOut} pagedFlow=${JSON.stringify(pagedFlow)} pdfPageCount=${pageCount} pdfError=${pdfError}`)

  return { page, stage, timedOut, pagedFlow, pdfBytes, pdfPageCount: pageCount, pdfError }
}

async function main() {
  console.log('\n=== Launching chromium ===')
  const tLaunch0 = Date.now()
  const browser = await chromium.launch({ headless: true })
  console.log(`  chromium.launch(): ${Date.now() - tLaunch0}ms`)

  // --- (c) warm-instance timing: run 3x, first is cold-ish (page cache), rest warm ---
  console.log('\n=== (c) Latency: 3 renders on a warm/reused browser instance ===')
  const runs = []
  let firstGoodRun = null
  for (let i = 0; i < 3; i++) {
    console.log(`\n--- run ${i + 1}/3 ---`)
    const r = await runPagedJsOnce(browser, `run${i + 1}`)
    runs.push(r)
    if (!firstGoodRun && !r.timedOut && r.pdfBytes) firstGoodRun = r
    if (i < runs.length) await r.page.close()
  }

  if (!firstGoodRun) {
    console.error('\nALL RUNS FAILED / TIMED OUT — cannot proceed to (a)/(b)/(d) evidence gathering.')
    await browser.close()
    process.exit(1)
  }

  // Use run1's serialized HTML + pdf for the rest of the evidence.
  const serializedHtmlPath = path.join(tempDir, 'run1-serialized.html')
  const serializedHtml = readFileSync(serializedHtmlPath, 'utf8')
  const pdfPath = path.join(tempDir, 'run1.pdf')

  // --- determinism across the 3 runs: page counts + serialized DOM byte length ---
  console.log('\n=== Determinism across 3 runs ===')
  console.log(`  PDF page counts: ${runs.map(r => r.pdfPageCount).join(', ')}`)
  const domLens = runs.map((r) => {
    try { return readFileSync(path.join(tempDir, `${r === runs[0] ? 'run1' : r === runs[1] ? 'run2' : 'run3'}-serialized.html`), 'utf8').length } catch { return null }
  })
  console.log(`  Serialized DOM byte lengths: ${domLens.join(', ')}`)

  // --- (b) footer / page-number evidence: open serialized DOM in a fresh page,
  // read every .pagedjs_margin-bottom-center .pagedjs_margin-content text ---
  console.log('\n=== (b) Footer / page-number evidence (per .pagedjs_page, from serialized DOM) ===')
  const footerPage = await browser.newPage()
  await footerPage.goto('file://' + serializedHtmlPath, { waitUntil: 'load' })
  const footers = await footerPage.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page'))
    return pages.map((p, i) => {
      const el = p.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content')
      return { index: i + 1, footerText: el ? el.textContent.trim() : '(no .pagedjs_margin-bottom-center found)' }
    })
  })
  for (const f of footers) console.log(`  page ${f.index}: footer = "${f.footerText}"`)

  // --- (a) long reading passage: paragraph-boundary evidence ---
  console.log('\n=== (a) Long reading passage paragraph-boundary evidence ===')
  const passageSnippet = longestReadingGroup.passage.materialText.trim().slice(0, 30)
  const paraEvidence = await footerPage.evaluate(({ passageSnippet }) => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page'))
    const out = []
    for (let i = 0; i < pages.length; i++) {
      const paras = Array.from(pages[i].querySelectorAll('.passage p, .passage'))
      for (const p of paras) {
        const text = p.textContent.trim()
        if (!text) continue
        out.push({ page: i + 1, tag: p.tagName, textStart: text.slice(0, 60), textEnd: text.slice(-60), len: text.length })
      }
    }
    return { out, snippetFound: document.body.textContent.includes(passageSnippet) }
  }, { passageSnippet })
  console.log(`  passage snippet found in serialized DOM: ${paraEvidence.snippetFound}`)
  console.log(`  passage-related fragments across pages (each row = one <p>/.passage fragment paged.js emitted):`)
  for (const row of paraEvidence.out) {
    console.log(`    page ${row.page} [${row.tag}] len=${row.len} START="${row.textStart}" END="${row.textEnd}"`)
  }
  await footerPage.close()

  // --- (d) parity: serialized DOM (rendered as its own static page) vs page.pdf(), page-by-page ---
  console.log('\n=== (d) Parity: serialized paged.js DOM vs page.pdf(), page-by-page ===')
  // 1. screenshot every .pagedjs_page element from the serialized DOM (loaded fresh, no re-run of paged.js)
  const parityPage = await browser.newPage()
  await parityPage.goto('file://' + serializedHtmlPath, { waitUntil: 'load' })
  const pageEls = await parityPage.$$('.pagedjs_page')
  console.log(`  serialized DOM .pagedjs_page count: ${pageEls.length}`)
  for (let i = 0; i < pageEls.length; i++) {
    const shotPath = path.join(tempDir, `dom-page-${String(i + 1).padStart(2, '0')}.png`)
    await pageEls[i].screenshot({ path: shotPath })
  }
  await parityPage.close()

  // 2. render every real PDF page to PNG via pdftoppm (poppler, already confirmed present)
  let pdftoppmOk = true
  try {
    execFileSync('pdftoppm', ['-png', '-r', '96', pdfPath, path.join(tempDir, 'pdf-page')], { stdio: 'pipe' })
  } catch (e) {
    pdftoppmOk = false
    console.log(`  pdftoppm failed: ${e.message}`)
  }
  if (pdftoppmOk) {
    const pdfPngs = readdirSync(tempDir).filter(f => f.startsWith('pdf-page')).sort()
    console.log(`  rendered PDF page PNGs: ${pdfPngs.join(', ')}`)
  }

  // 3. text-level page-by-page comparison via pdftotext (structural cross-check
  // alongside the visual screenshots — group headers per page).
  let pdftotextOk = true
  const pdfPageTexts = []
  try {
    const doc = await PDFDocument.load(readFileSync(pdfPath))
    const n = doc.getPageCount()
    for (let p = 1; p <= n; p++) {
      const txt = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdfPath, '-'], { encoding: 'utf8' })
      pdfPageTexts.push(txt.trim().replace(/\s+/g, ' ').slice(0, 200))
    }
  } catch (e) {
    pdftotextOk = false
    console.log(`  pdftotext failed: ${e.message}`)
  }

  // 4. same extraction from the serialized DOM's .pagedjs_page containers (question/group labels)
  const domPage2 = await browser.newPage()
  await domPage2.goto('file://' + serializedHtmlPath, { waitUntil: 'load' })
  const domPageLabels = await domPage2.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page'))
    return pages.map((p) => {
      const headers = Array.from(p.querySelectorAll('.section-header, .group-header')).map(h => h.textContent.trim())
      const qnums = Array.from(p.querySelectorAll('.qnum')).map(q => q.textContent.trim())
      return { headers, qnums, textStart: p.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) }
    })
  })
  await domPage2.close()

  console.log(`\n  Page-by-page label comparison (DOM extraction vs PDF pdftotext) — ${domPageLabels.length} DOM pages / ${pdfPageTexts.length} PDF pages:`)
  const n = Math.max(domPageLabels.length, pdfPageTexts.length)
  for (let i = 0; i < n; i++) {
    console.log(`\n  --- page ${i + 1} ---`)
    console.log(`    DOM headers/qnums: ${JSON.stringify(domPageLabels[i]?.headers)} / ${JSON.stringify(domPageLabels[i]?.qnums)}`)
    console.log(`    DOM textStart: ${domPageLabels[i]?.textStart ?? '(none — DOM ran out of pages)'}`)
    console.log(`    PDF textStart: ${pdfPageTexts[i] ?? '(none — PDF ran out of pages)'}`)
  }

  // --- paged.js DOM structure sample (for step2's future data-group-id mapping) ---
  console.log('\n=== paged.js DOM structure sample (first .pagedjs_page, truncated) ===')
  const structSample = await (async () => {
    const p = await browser.newPage()
    await p.goto('file://' + serializedHtmlPath, { waitUntil: 'load' })
    const s = await p.evaluate(() => {
      const first = document.querySelector('.pagedjs_page')
      if (!first) return null
      const area = first.querySelector('.pagedjs_page_content')
      return area ? area.innerHTML.slice(0, 2000) : first.outerHTML.slice(0, 2000)
    })
    await p.close()
    return s
  })()
  console.log(structSample)

  await browser.close()
  console.log(`\nArtifacts kept in: ${tempDir}`)
  console.log('  run1-serialized.html / run1.pdf / dom-page-NN.png / pdf-page-N.png')
}

main().catch((err) => { console.error('SPIKE FAILED:', err); process.exit(1) })
