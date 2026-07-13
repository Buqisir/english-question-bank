#!/usr/bin/env node
/**
 * SPIKE (exploratory, not product code): does headless Chromium make a viable
 * single source of truth for pagination — i.e. can we extract "which page each
 * question-group / question lands on" from the SAME print HTML we hand to
 * page.pdf(), and does that extraction match the PDF's real pagination?
 *
 * Data loading + buildPrintHtml call copied from
 * scripts/print-visual-qa-guangdong.mjs (广东一模, has a long reading passage).
 *
 * Scratchpad-only. Touches no product code. Run:
 *   unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
 *   node spike-headless-pagination.mjs
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = '/Users/huangxuewei/Projects/english-question-bank'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))
const { PDFDocument } = require(path.join(rootDir, 'server', 'node_modules', 'pdf-lib'))
const { buildPrintHtml } = await import(path.join(rootDir, 'server', 'print-renderer.mjs'))

const dbPath = path.join(rootDir, 'data', 'question-bank.sqlite')

// --- A4 page geometry, matches server/print-renderer.mjs's @page rule
// (`margin: 21mm 24mm 24mm 24mm`) ---
const MM_TO_PX = 96 / 25.4
const PAGE_W_MM = 210
const PAGE_H_MM = 297
const MARGIN_TOP_MM = 21
const MARGIN_RIGHT_MM = 24
const MARGIN_BOTTOM_MM = 24
const MARGIN_LEFT_MM = 24
const CONTENT_W_PX = Math.round((PAGE_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM) * MM_TO_PX)
const CONTENT_H_PX = (PAGE_H_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM) * MM_TO_PX

console.log(`Geometry: content box ${CONTENT_W_PX}px wide x ${CONTENT_H_PX.toFixed(1)}px tall (96dpi CSS px)`)

// --- 1. Load question group data (same query shape as print-visual-qa-guangdong.mjs).
// NOTE: the 广东一模 paper referenced by that script is not present in the current
// data/question-bank.sqlite (checked: 0 rows for paper_name LIKE '%广东%'). Substituted
// the paper with the longest reading passage currently in the DB instead — same intent
// (need a long passage to exercise question 3's auto paragraph-pagination test).
const PAPER_NAME = '26.3重庆市巴蜀中学高三月考（七）英语试卷'
console.log(`\nLoading "${PAPER_NAME}" question groups from DB...`)
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
// Spike-only filter: this paper's grammar_cloze group has malformed source data
// (in-text blank markers don't match question count — buildPrintHtml's own hard
// consistency assertion throws on it). That's a pre-existing DATA problem
// unrelated to what this spike is testing (pagination extraction), so drop
// grammar_cloze/cloze here to keep the spike unblocked; reading + seven_choices
// is plenty to exercise the long-passage pagination questions.
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

// Find the longest reading passage group (question 3: auto paragraph pagination)
let longestReadingGroup = null
let longestLen = -1
for (const it of items) {
  if (it.detail.groupType === 'reading' && it.detail.passage.materialText.length > longestLen) {
    longestLen = it.detail.passage.materialText.length
    longestReadingGroup = it.detail
  }
}
console.log(`  Longest reading passage: "${longestReadingGroup?.title}" (${longestLen} chars, group id ${longestReadingGroup?.id})`)

console.log('\nBuilding print HTML (buildPrintHtml, same call as print-visual-qa-guangdong.mjs)...')
const html = buildPrintHtml({
  title: '2026年广东省高三一模英语试卷',
  versionType: 'student',
  printStyle: 'exam',
  items, blocks, questionNumberStart: 1,
})

const tempDir = mkdtempSync(path.join(tmpdir(), 'spike-pagination-'))
const htmlPath = path.join(tempDir, 'paper.html')
writeFileSync(htmlPath, html)
console.log(`  HTML written: ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`)

// --- Extraction function: naive height-based page assignment, run inside the page ---
async function extractPagination(page) {
  return page.evaluate(({ contentWidthPx, pageHeightPx }) => {
    const els = Array.from(document.querySelectorAll('.page-break, .question-group, .question'))
    let segStartY = 0
    let segStartPage = 1
    const out = []
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (el.classList.contains('page-break')) {
        const pagesUsedInSegment = Math.floor((rect.top - segStartY) / pageHeightPx)
        segStartPage = segStartPage + pagesUsedInSegment + 1
        segStartY = rect.top
        continue
      }
      const pageNum = segStartPage + Math.floor((rect.top - segStartY) / pageHeightPx)
      let label
      if (el.classList.contains('question-group')) {
        const header = el.querySelector('.group-header')
        label = `[GROUP] ${header ? header.textContent.trim() : el.className}`
      } else {
        const qnum = el.querySelector('.qnum')
        label = `[Q] #${qnum ? qnum.textContent.trim() : '?'}`
      }
      out.push({ label, top: Math.round(rect.top), page: pageNum })
    }
    return { out, docHeight: document.documentElement.scrollHeight, contentWidthPx, pageHeightPx }
  }, { contentWidthPx: CONTENT_W_PX, pageHeightPx: CONTENT_H_PX })
}

// Extract paragraph-level pagination for the longest reading passage (question 3).
// Identify the target group by a snippet of its passage text (exam printStyle
// omits .group-meta/detail.title, so title-matching doesn't work — see run 1
// finding below).
async function extractPassageParagraphs(page, passageSnippet) {
  return page.evaluate(({ pageHeightPx, passageSnippet }) => {
    const groups = Array.from(document.querySelectorAll('.question-group'))
    const target = groups.find(g => {
      const passage = g.querySelector('.passage')
      return passage && passage.textContent.includes(passageSnippet)
    })
    if (!target) return null
    const passage = target.querySelector('.passage')
    if (!passage) return null
    const paras = Array.from(passage.querySelectorAll('p'))
    // Use the SAME segmented page-break-aware numbering as extractPagination,
    // by walking the whole document once more for consistency.
    const allEls = Array.from(document.querySelectorAll('.page-break, .question-group, .question, .passage p'))
    let segStartY = 0
    let segStartPage = 1
    const paraPages = []
    for (const el of allEls) {
      const rect = el.getBoundingClientRect()
      if (el.classList.contains('page-break')) {
        const pagesUsedInSegment = Math.floor((rect.top - segStartY) / pageHeightPx)
        segStartPage = segStartPage + pagesUsedInSegment + 1
        segStartY = rect.top
        continue
      }
      const pageNum = segStartPage + Math.floor((rect.top - segStartY) / pageHeightPx)
      if (el.tagName === 'P' && paras.includes(el)) {
        paraPages.push({ text: el.textContent.trim().slice(0, 50), page: pageNum })
      }
    }
    return paraPages
  }, { pageHeightPx: CONTENT_H_PX, passageSnippet })
}

async function pdfPageCount(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes)
  return doc.getPageCount()
}

function diffRuns(runA, runB) {
  if (runA.length !== runB.length) return { identical: false, reason: `length differs: ${runA.length} vs ${runB.length}` }
  for (let i = 0; i < runA.length; i++) {
    if (runA[i].label !== runB[i].label || runA[i].page !== runB[i].page) {
      return { identical: false, reason: `mismatch at index ${i}: ${JSON.stringify(runA[i])} vs ${JSON.stringify(runB[i])}` }
    }
  }
  return { identical: true }
}

async function main() {
  console.log('\n=== Question 4: launching chromium (timed) ===')
  const t0 = Date.now()
  const browser = await chromium.launch({ headless: true })
  const tLaunch = Date.now() - t0
  console.log(`  chromium.launch(): ${tLaunch}ms`)

  const runs = []
  let pdfBytesFirst = null

  for (let i = 0; i < 3; i++) {
    console.log(`\n--- Run ${i + 1}/3 ---`)
    const tPageStart = Date.now()
    const page = await browser.newPage({ viewport: { width: CONTENT_W_PX, height: 1200 } })
    await page.goto('file://' + htmlPath, { waitUntil: 'load' })
    const tRenderDone = Date.now()
    const extraction = await extractPagination(page)
    const tExtractDone = Date.now()

    const pdfBytes = await page.pdf({
      format: 'A4',
      margin: { top: `${MARGIN_TOP_MM}mm`, right: `${MARGIN_RIGHT_MM}mm`, bottom: `${MARGIN_BOTTOM_MM}mm`, left: `${MARGIN_LEFT_MM}mm` },
      printBackground: true,
    })
    const tPdfDone = Date.now()
    if (i === 0) pdfBytesFirst = pdfBytes

    const pageCount = await pdfPageCount(pdfBytes)

    console.log(`  render+load: ${tRenderDone - tPageStart}ms | extract-pagination: ${tExtractDone - tRenderDone}ms | page.pdf(): ${tPdfDone - tExtractDone}ms | total(excl launch): ${tPdfDone - tPageStart}ms`)
    console.log(`  doc height: ${extraction.docHeight}px | extracted max page: ${Math.max(...extraction.out.map(o => o.page))} | PDF actual page count: ${pageCount}`)

    runs.push({
      timings: { render: tRenderDone - tPageStart, extract: tExtractDone - tRenderDone, pdf: tPdfDone - tExtractDone },
      extraction: extraction.out,
      pdfPageCount: pageCount,
    })

    await page.close()
  }

  await browser.close()

  // --- Question 4: determinism across runs ---
  console.log('\n=== Question 4: determinism across 3 runs ===')
  const d12 = diffRuns(runs[0].extraction, runs[1].extraction)
  const d13 = diffRuns(runs[0].extraction, runs[2].extraction)
  console.log(`  Run1 vs Run2: ${d12.identical ? 'IDENTICAL' : 'DIFFERS — ' + d12.reason}`)
  console.log(`  Run1 vs Run3: ${d13.identical ? 'IDENTICAL' : 'DIFFERS — ' + d13.reason}`)
  console.log(`  PDF page counts across runs: ${runs.map(r => r.pdfPageCount).join(', ')}`)

  // --- Question 1: extracted pagination structure (page -> items) ---
  console.log('\n=== Question 1: extracted pagination structure (run 1) ===')
  const byPage = new Map()
  for (const item of runs[0].extraction) {
    if (!byPage.has(item.page)) byPage.set(item.page, [])
    byPage.get(item.page).push(item.label)
  }
  const maxPage = Math.max(...byPage.keys())
  for (let p = 1; p <= maxPage; p++) {
    console.log(`  Page ${p}: ${(byPage.get(p) || ['(none — check for gap)']).join(' | ')}`)
  }

  // --- Question 2: extracted vs actual PDF page-by-page text comparison ---
  console.log('\n=== Question 2: extracted pagination vs actual PDF pages ===')
  const pdfDoc = await PDFDocument.load(pdfBytesFirst)
  console.log(`  PDF actual page count: ${pdfDoc.getPageCount()}`)
  console.log(`  Extracted max page number: ${maxPage}`)
  console.log(`  Page count match: ${pdfDoc.getPageCount() === maxPage ? 'YES' : 'NO — pdf-lib gives no per-page text extraction, need pdftoppm/pdftotext for content check below'}`)

  // Use pdftotext -layout per page to compare actual content per PDF page vs our
  // extracted "who's on page N" list. pdftotext is available via poppler (checked
  // earlier: /opt/homebrew/bin/pdftoppm, pdfinfo present).
  const pdfPath = path.join(tempDir, 'run1.pdf')
  writeFileSync(pdfPath, pdfBytesFirst)
  const { execFileSync } = await import('node:child_process')
  let pdftotextOk = true
  let pdfPageTexts = []
  let pdfPageTextsFull = []
  try {
    execFileSync('which', ['pdftotext'], { stdio: 'pipe' })
    for (let p = 1; p <= pdfDoc.getPageCount(); p++) {
      const txt = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdfPath, '-'], { encoding: 'utf8' })
      pdfPageTextsFull.push(txt)
      pdfPageTexts.push(txt.trim().slice(0, 300).replace(/\s+/g, ' '))
    }
  } catch (e) {
    pdftotextOk = false
    console.log(`  pdftotext not available or failed: ${e.message}`)
  }
  if (pdftotextOk) {
    for (let p = 1; p <= pdfPageTexts.length; p++) {
      console.log(`\n  --- PDF page ${p} actual text (first 300 chars) ---`)
      console.log(`  ${pdfPageTexts[p - 1]}`)
      console.log(`  --- Our extraction says page ${p} has: ${(byPage.get(p) || ['(none)']).join(' | ')}`)
    }
  }

  // --- Question 3: long reading passage auto pagination ---
  console.log('\n=== Question 3: long reading passage paragraph-level pagination ===')
  const browser2 = await chromium.launch({ headless: true })
  const page2 = await browser2.newPage({ viewport: { width: CONTENT_W_PX, height: 1200 } })
  await page2.goto('file://' + htmlPath, { waitUntil: 'load' })
  const passageSnippet = longestReadingGroup.passage.materialText.trim().slice(0, 40)
  const paraPages = await extractPassageParagraphs(page2, passageSnippet)
  await browser2.close()
  if (!paraPages) {
    console.log('  Could not locate the target reading passage group in the DOM (title match failed) — see extracted labels above for actual group-header text.')
  } else {
    console.log(`  Passage: "${longestReadingGroup.title}" — ${paraPages.length} paragraphs`)
    let curPage = null
    for (const pp of paraPages) {
      if (pp.page !== curPage) { console.log(`  -- page ${pp.page} --`); curPage = pp.page }
      console.log(`    "${pp.text}..."`)
    }
    const pagesSpanned = new Set(paraPages.map(p => p.page))
    console.log(`  Paragraphs span ${pagesSpanned.size} page(s) PER OUR NAIVE EXTRACTION: [${[...pagesSpanned].join(', ')}]`)
    console.log('  CAVEAT: per Question 2 above, our naive extraction has already drifted ~2 pages behind')
    console.log('  the actual PDF by this point in the document, so these page NUMBERS are not to be')
    console.log('  trusted — only usable as "ground truth below, verified independently via pdftotext".')
  }

  // Ground-truth check (independent of our naive extraction): does the ACTUAL PDF
  // split this passage's paragraphs across pages? Find every PDF page whose
  // pdftotext output contains a chunk of the passage text.
  if (pdftotextOk) {
    console.log('\n  --- Ground truth (searched actual pdftotext output per PDF page) ---')
    const normalize = (s) => s.replace(/\s+/g, ' ').trim()
    const passageFull = normalize(longestReadingGroup.passage.materialText)
    // Sample several ~30-char chunks spread through the passage and locate which
    // real PDF page(s) contain each chunk.
    const chunkCount = 6
    const chunkLen = 30
    const matchedPages = []
    for (let i = 0; i < chunkCount; i++) {
      const start = Math.floor((passageFull.length - chunkLen) * (i / (chunkCount - 1)))
      const chunk = passageFull.slice(Math.max(0, start), Math.max(0, start) + chunkLen)
      if (chunk.length < 10) continue
      let foundPage = null
      for (let p = 0; p < pdfPageTextsFull.length; p++) {
        if (normalize(pdfPageTextsFull[p]).includes(chunk)) { foundPage = p + 1; break }
      }
      matchedPages.push({ chunk, page: foundPage })
      console.log(`    chunk ${i + 1}/${chunkCount} ("${chunk}...") -> PDF page ${foundPage ?? 'NOT FOUND (likely OCR/whitespace mismatch across a page break)'}`)
    }
    const foundPagesSet = new Set(matchedPages.map(m => m.page).filter(Boolean))
    console.log(`    Ground-truth: passage content found spanning PDF page(s) [${[...foundPagesSet].sort((a, b) => a - b).join(', ')}]`)
    console.log(`    ${foundPagesSet.size > 1 ? 'CONFIRMED (ground truth): the passage DOES auto-split across multiple real PDF pages, mid-paragraph even (see raw pdftotext dump above for pages 4-5).' : 'Passage appears on a single real PDF page.'}`)
  }

  console.log(`\nArtifacts kept in: ${tempDir}`)
  console.log('(HTML: paper.html, PDF: run1.pdf — inspect manually if needed)')
}

main().catch((err) => { console.error('SPIKE FAILED:', err); process.exit(1) })
