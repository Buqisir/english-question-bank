#!/usr/bin/env node
/**
 * Visual QA: Generate a student exam PDF from 广东一模 data via Vivliostyle,
 * then render both reference and generated PDFs to PNG for side-by-side comparison.
 *
 * Optional reference PDF override:
 *   node scripts/print-visual-qa-guangdong.mjs --reference-pdf /path/to/试题.pdf
 *   REFERENCE_PDF=/path/to/试题.pdf node scripts/print-visual-qa-guangdong.mjs
 *
 * Outputs:
 *   reports/artifacts/print-visual-qa-guangdong-2026/generated.pdf
 *   reports/artifacts/print-visual-qa-guangdong-2026/generated-page-{1..4}.png
 *   reports/artifacts/print-visual-qa-guangdong-2026/reference-page-{1..4}.png
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildPrintHtml } from '../server/print-renderer.mjs'

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dbPath = path.join(rootDir, 'data', 'question-bank.sqlite')
const artifactDir = path.join(rootDir, 'reports', 'artifacts', 'print-visual-qa-guangdong-2026')
const defaultReferencePdf = '/Users/huangxuewei/Desktop/10_日常工作/教学资料/试卷/2026年广东省一模/2026_03_23_含词汇整理：26年3月广东一模/含词汇整理：26年3月广东一模/试题.pdf'

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`ERROR: ${name} requires a file path`)
    process.exit(1)
  }
  return value
}

const referencePdf = getArgValue('--reference-pdf') || process.env.REFERENCE_PDF || defaultReferencePdf

// --- Resolve vivliostyle binary ---
const vivliostylePaths = [
  path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
  path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
]
let vivliostyleBin = null
for (const p of vivliostylePaths) {
  if (existsSync(p)) { vivliostyleBin = p; break }
}
if (!vivliostyleBin) {
  console.error('ERROR: vivliostyle CLI not found. Run: cd server && npm install')
  process.exit(1)
}

// --- Fetch question groups from DB ---
console.log('Fetching 广东一模 question groups from database...')
const db = new DatabaseSync(dbPath)

const groups = db.prepare(`
  SELECT qg.id, qg.title, qg.group_type, qg.default_score, qg.display_order
  FROM question_groups qg
  JOIN passages p ON qg.passage_id = p.id
  JOIN sources s ON p.source_id = s.id
  WHERE s.paper_name = '26.3广东高三一模英语试卷'
  ORDER BY qg.display_order
`).all()

if (groups.length === 0) {
  console.error('ERROR: No 广东一模 question groups found in database')
  process.exit(1)
}
console.log(`  Found ${groups.length} question groups`)

// Build detail for each group (simplified version of getQuestionGroupDetail)
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
    passage: {
      title: row.passage_title,
      materialText: row.material_text || '',
      summary: row.summary || '',
    },
    questions: questions.map(q => ({
      id: q.id,
      questionNo: q.question_no,
      stem: q.stem,
      answer: q.answer,
      explanation: q.explanation,
      note: q.note || '',
      options: selectOptions.all(q.id).map(o => ({ label: o.label, content: o.content })),
    })),
  }
}

// Build items and blocks for the paper
const sectionOrder = ['reading', 'seven_choices', 'cloze', 'grammar_cloze']
const sectionLabels = {
  reading: '第一部分 阅读理解',
  seven_choices: '第二节 七选五',
  cloze: '第三部分 完形填空',
  grammar_cloze: '第四部分 语法填空',
}

// Sort groups by typical exam section order
const sortedGroups = [...groups].sort((a, b) => {
  const ai = sectionOrder.indexOf(a.group_type)
  const bi = sectionOrder.indexOf(b.group_type)
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
    const label = sectionLabels[g.group_type] || g.group_type
    blocks.push({ type: 'section_header', title: label })
    lastType = g.group_type
  }

  blocks.push({ type: 'question_group', questionGroupId: g.id, score: g.default_score })
  items.push({ detail, score: g.default_score, sectionTitle: '', note: '' })
}

db.close()

// --- Generate HTML and PDF ---
console.log('Generating student exam HTML...')
const html = buildPrintHtml({
  title: '2026年广东省高三一模英语试卷',
  versionType: 'student',
  printStyle: 'exam',
  items,
  blocks,
  questionNumberStart: 1,
})

mkdirSync(artifactDir, { recursive: true })

const tempDir = mkdtempSync(path.join(tmpdir(), 'gd-visual-qa-'))
const htmlPath = path.join(tempDir, 'paper.html')
const pdfPath = path.join(tempDir, 'paper.pdf')
writeFileSync(htmlPath, html)

console.log('Running Vivliostyle to generate PDF...')
try {
  execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], {
    timeout: 120000,
    stdio: 'pipe',
  })
} catch (err) {
  console.error('Vivliostyle build failed:', err.stderr?.toString() || err.message)
  rmSync(tempDir, { recursive: true, force: true })
  process.exit(1)
}

const pdfBytes = readFileSync(pdfPath)
if (!pdfBytes.slice(0, 4).toString().startsWith('%PDF')) {
  console.error('ERROR: Generated file is not a valid PDF')
  rmSync(tempDir, { recursive: true, force: true })
  process.exit(1)
}

const generatedPdfPath = path.join(artifactDir, 'generated.pdf')
writeFileSync(generatedPdfPath, pdfBytes)
console.log(`  ✓ Generated PDF: ${generatedPdfPath} (${(pdfBytes.length / 1024).toFixed(1)} KB)`)

// Save HTML for inspection
writeFileSync(path.join(artifactDir, 'generated.html'), html)

// --- Render PDFs to PNG using pdftoppm/magick ---
import { renameSync } from 'node:fs'

function hasBin(name) {
  try { execFileSync('which', [name], { stdio: 'pipe' }); return true } catch { return false }
}

function renderPdfToPages(pdfFile, prefix, maxPages = 4) {
  // Try pdftoppm (poppler-utils) first — best quality
  if (hasBin('pdftoppm')) {
    try {
      const outBase = path.join(artifactDir, `${prefix}-page`)
      execFileSync('pdftoppm', [
        '-png', '-f', '1', '-l', String(maxPages), '-r', '150',
        pdfFile, outBase,
      ], { stdio: 'pipe', timeout: 60000 })
      // pdftoppm outputs prefix-01.png, prefix-02.png, etc. Rename to prefix-page-1.png
      for (let i = 1; i <= maxPages; i++) {
        const padded = String(i).padStart(2, '0')
        const src = `${outBase}-${padded}.png`
        const dst = path.join(artifactDir, `${prefix}-page-${i}.png`)
        if (existsSync(src)) renameSync(src, dst)
      }
      return true
    } catch (e) { console.log(`  pdftoppm error: ${e.message}`) }
  }

  // Try magick (ImageMagick 7)
  if (hasBin('magick')) {
    try {
      for (let i = 0; i < maxPages; i++) {
        const outPath = path.join(artifactDir, `${prefix}-page-${i + 1}.png`)
        execFileSync('magick', [
          '-density', '150', `${pdfFile}[${i}]`, '-quality', '90', outPath,
        ], { stdio: 'pipe', timeout: 30000 })
      }
      return true
    } catch (e) { console.log(`  magick error: ${e.message}`) }
  }

  // Try convert (ImageMagick 6)
  if (hasBin('convert')) {
    try {
      for (let i = 0; i < maxPages; i++) {
        const outPath = path.join(artifactDir, `${prefix}-page-${i + 1}.png`)
        execFileSync('convert', [
          '-density', '150', `${pdfFile}[${i}]`, '-quality', '90', outPath,
        ], { stdio: 'pipe', timeout: 30000 })
      }
      return true
    } catch (e) { console.log(`  convert error: ${e.message}`) }
  }

  return false
}

console.log('\nRendering generated PDF pages to PNG...')
const genRendered = renderPdfToPages(generatedPdfPath, 'generated')
if (!genRendered) {
  console.log('  ⚠ Could not render generated PDF to PNG (no pdftoppm/magick/sips available)')
}

if (existsSync(referencePdf)) {
  console.log('Rendering reference PDF pages to PNG...')
  const refRendered = renderPdfToPages(referencePdf, 'reference')
  if (!refRendered) {
    console.log('  ⚠ Could not render reference PDF to PNG')
  }
} else {
  console.log('  ⚠ Reference PDF not found at expected path')
}

rmSync(tempDir, { recursive: true, force: true })
console.log('\n✓ Visual QA artifacts generated in:', artifactDir)
