/**
 * pdf-extract.mjs <paperId>
 *
 * Builder for the "新课标 PDF 试题卷 + 独立答案 PDF" whitelist format
 * (nck1-paper-standard.md §2, format #2, 2026 起接入). Counterpart to
 * 01-split.mjs, which only handles the "答案版 DOCX with embedded 【答案】"
 * format. This script does NOT reuse lib.mjs's regex-based text splitter —
 * that splitter's heuristics (Format A/B section detection, 【答案】 marker
 * parsing) are shaped around the DOCX-answer-version convention. This
 * source is a genuine 试题卷 (student-facing layout: MC options listed
 * below the passage, no inline answer markers) + a SEPARATE 评分参考 PDF.
 * Reverse-engineering regex heuristics for a brand-new visual layout,
 * sight-unseen, is high rework-risk; hand-transcribing (agent reads the
 * PDF directly, per runbook) into the SAME candidate shape lib.mjs
 * produces, then feeding it through the shipped shape-gate builders below,
 * is mechanically safer because every field is validated by code that
 * already ships in server/paper-import-ai/**. (See runbook "PDF 提取" step
 * and the completion report's lib.mjs section for the full rationale.)
 *
 * The CONTENT registry below is a legacy bridge for unmigrated historical
 * entries only. New Format② papers use a versioned per-paper transcription
 * artifact through the public import Job; do not add new CONTENT entries.
 *
 * Usage: node scripts/import-pipeline/pdf-extract.mjs <paperId>
 * Output: papers/<paperId>/groups.json + analyze-<key>-combined.txt
 *         (identical shape to 01-split.mjs's output — validate-one.mjs
 *         and 02-publish.mjs consume it unmodified).
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildReadingAnalysisMessages } from './lib.mjs'
import { buildSevenChoicesAnalysisMessages } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildClozeAnalysisMessages } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'
import { normalizePassageText } from '../../server/paper-import-ai/normalizePassageText.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pad = (n) => String(n).padStart(3, '0')
const norm = (s) => normalizePassageText(s)

// ============================================================
// Legacy CONTENT registry. Migrated and new Format② papers belong in the
// public Job's versioned per-paper transcription path.
// ============================================================

const CONTENT = {}

// ============================================================
// Legacy builder — retained only for any still-unmigrated registry entries.
// ============================================================

function paperTail(paperId) {
  return paperId.replace(/^paper-/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

function buildFromContent(paperId) {
  const data = CONTENT[paperId]
  if (!data) {
    throw new Error(
      `pdf-extract.mjs: no legacy CONTENT entry for ${paperId}; use the Format 2 per-paper transcription Job.`,
    )
  }
  const tail = paperTail(paperId)

  const paper = { paperId, sourceFilename: '', sourceHash: 'pending', sourceAssetVersion: 1 }

  let readingStdNo = 21
  const readingGroups = data.reading.map((rg, i) => {
    const group = {
      groupId: `group-${tail}-reading-${rg.letter}`,
      title: `Reading ${rg.letter.toUpperCase()}`,
      order: i,
      paragraphs: rg.paragraphs.map((text, k) => ({
        id: `para-${tail}-reading-${rg.letter}-${k + 1}`,
        text: norm(text),
      })),
      questions: rg.questions.map((q) => {
        const no = readingStdNo++
        return {
          id: `q-${tail}-${pad(no)}`,
          questionNo: String(no),
          stem: norm(q.stem),
          options: Object.fromEntries(Object.entries(q.options).map(([label, text]) => [label, norm(text)])),
          answerKey: q.answerKey,
        }
      }),
    }
    return group
  })

  const sevenStart = readingStdNo // 36
  const seven = {
    groupId: `group-${tail}-seven-choices`,
    groupType: 'sevenChoices',
    title: '七选五',
    order: 4,
    paragraphs: data.seven.paragraphs.map((text, i) => ({
      id: `para-${tail}-seven-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    optionBank: data.seven.optionBank.map((o) => ({ label: o.label, text: norm(o.text) })),
    questions: data.seven.answers.map((answerKey, i) => {
      const no = sevenStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
      }
    }),
  }
  seven.blankIds = seven.questions.map((q) => q.blankId)

  const clozeStart = sevenStart + 5 // 41
  const cloze = {
    groupId: `group-${tail}-cloze`,
    groupType: 'cloze',
    title: '完形填空',
    order: 5,
    paragraphs: data.cloze.paragraphs.map((text, i) => ({
      id: `para-${tail}-cloze-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    questions: data.cloze.questions.map((q, i) => {
      const no = clozeStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey: q.answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
        options: Object.fromEntries(Object.entries(q.options).map(([label, text]) => [label, norm(text)])),
      }
    }),
  }
  cloze.blankIds = cloze.questions.map((q) => q.blankId)

  const grammarStart = clozeStart + cloze.questions.length // 56
  const grammar = {
    groupId: `group-${tail}-grammar-fill`,
    groupType: 'grammarFill',
    title: '语法填空',
    order: 6,
    paragraphs: data.grammar.paragraphs.map((text, i) => ({
      id: `para-${tail}-grammar-fill-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    questions: data.grammar.questions.map((q, i) => {
      const no = grammarStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey: q.answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
        prompt: q.prompt || null,
      }
    }),
  }
  grammar.blankIds = grammar.questions.map((q) => q.blankId)

  const application = {
    groupId: `group-${tail}-writing-application`,
    groupType: 'writing',
    title: '应用文写作',
    order: 7,
    paragraphs: data.application.paragraphs.map((text, i) => ({
      id: `para-${tail}-writing-app-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    applicationGiven: data.application.applicationGiven || null,
    questions: [],
  }

  const continuation = {
    groupId: `group-${tail}-writing-continuation`,
    groupType: 'writing',
    title: '读后续写',
    order: 8,
    paragraphs: data.continuation.paragraphs.map((text, i) => ({
      id: `para-${tail}-writing-cont-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    continuationStarters: data.continuation.continuationStarters,
    questions: [],
  }

  return { paper, readingGroups, seven, cloze, grammar, application, continuation }
}

// ============================================================
// Main — mirrors 01-split.mjs's shape-gate + write-outputs steps.
// ============================================================

const paperId = process.argv[2]
if (!paperId) {
  console.error('Usage: node pdf-extract.mjs <paperId>')
  process.exit(1)
}

const outDir = path.join(__dirname, 'papers', paperId)
mkdirSync(outDir, { recursive: true })

console.log(`\n[1/3] Building groups from CONTENT registry for ${paperId}`)
const groups = buildFromContent(paperId)
const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups

console.log(`\n[2/3] Shape-gating groups (shipped server/paper-import-ai/** validators)`)
const errors = []
function shapeGate(name, fn) {
  try {
    fn()
    console.log(`      [OK] ${name}`)
  } catch (err) {
    console.log(`      [FAIL] ${name}: ${err.message}`)
    errors.push(`${name}: ${err.message}`)
  }
}
for (const [i, group] of readingGroups.entries()) {
  const letter = ['a', 'b', 'c', 'd'][i]
  shapeGate(`reading-${letter}`, () => buildReadingAnalysisMessages({ paper, group }))
}
shapeGate('seven', () => buildSevenChoicesAnalysisMessages({ paper, group: seven }))
shapeGate('cloze', () => buildClozeAnalysisMessages({ paper, group: cloze }))
shapeGate('grammar', () => buildGrammarFillAnalysisMessages({ paper, group: grammar }))

if (errors.length > 0) {
  console.error(`\nShape gate FAILED (${errors.length} error(s))`)
  process.exit(1)
}

console.log(`\n[3/3] Writing outputs to ${outDir}`)
const groupsPath = path.join(outDir, 'groups.json')
writeFileSync(groupsPath, JSON.stringify(groups, null, 2))
console.log(`      groups.json written`)

function writeCombined(name, messages) {
  const combined = [
    '=== SYSTEM (governing spec — follow exactly) ===',
    messages[0].content,
    '',
    '=== TASK ===',
    messages[1].content,
  ].join('\n')
  writeFileSync(path.join(outDir, `analyze-${name}-combined.txt`), combined)
  console.log(`      analyze-${name}-combined.txt`)
}
for (const [i, group] of readingGroups.entries()) {
  const letter = ['a', 'b', 'c', 'd'][i]
  writeCombined(`reading-${letter}`, buildReadingAnalysisMessages({ paper, group }))
}
writeCombined('seven', buildSevenChoicesAnalysisMessages({ paper, group: seven }))
writeCombined('cloze', buildClozeAnalysisMessages({ paper, group: cloze }))
writeCombined('grammar', buildGrammarFillAnalysisMessages({ paper, group: grammar }))

console.log(`\n======= BUILD REPORT: ${paperId} =======`)
let totalReadingQs = 0
for (const g of readingGroups) {
  const nos = g.questions.map((q) => Number(q.questionNo))
  const answers = g.questions.map((q) => q.answerKey).join('')
  console.log(`   ${g.groupId}: ${g.questions.length} qs, nos ${Math.min(...nos)}-${Math.max(...nos)}, ans="${answers}"`)
  totalReadingQs += g.questions.length
}
console.log(`   Total reading: ${totalReadingQs} (expect 15, nos 21-35)`)
console.log(`   seven: ${seven.questions.length} qs ans="${seven.questions.map((q) => q.answerKey).join('')}"`)
console.log(`   cloze: ${cloze.questions.length} qs ans="${cloze.questions.map((q) => q.answerKey).join('')}"`)
console.log(`   grammar: ${grammar.questions.length} qs ans="${grammar.questions.map((q) => q.answerKey).join('/')}"`)
console.log(`   application paras=${application.paragraphs.length} given=${application.applicationGiven}`)
console.log(`   continuation paras=${continuation.paragraphs.length} starters=${continuation.continuationStarters.length}`)
console.log(`\n[DONE] All shape gates passed. groups.json + combined prompts written to ${outDir}`)
