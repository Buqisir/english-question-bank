/**
 * 03-split-docx-pair.mjs <configPath>
 *
 * Format ③: 试题 DOCX + 答案解析 DOCX.
 * Converts both files, builds groups from the paper, copies 21–65 keys from
 * the compact block above 【答案解析】, shape-gates analyzable groups, writes
 * papers/<paperId>/groups.json + analyze-<key>-combined.txt.
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildReadingAnalysisMessages } from './lib.mjs'
import {
  buildDocxPairGroups,
  extractOfficialWritingAnswers,
} from './lib-docx-pair.mjs'
import { buildSevenChoicesAnalysisMessages } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildClozeAnalysisMessages } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const configPath = process.argv[2]
if (!configPath) {
  console.error('Usage: node 03-split-docx-pair.mjs <configPath>')
  process.exit(1)
}
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const { paperId } = config
const paperPath = path.isAbsolute(config.paperPath || config.docxPath)
  ? (config.paperPath || config.docxPath)
  : path.resolve(path.dirname(configPath), config.paperPath || config.docxPath)
const answersPath = path.isAbsolute(config.answersPath)
  ? config.answersPath
  : path.resolve(path.dirname(configPath), config.answersPath)

if (!paperId || !existsSync(paperPath) || !existsSync(answersPath)) {
  console.error('Config must have paperId, paperPath/docxPath, answersPath; both files must exist')
  process.exit(1)
}

const outDir = path.join(__dirname, 'papers', paperId)
mkdirSync(outDir, { recursive: true })

function convert(src, dest) {
  execSync(`textutil -convert txt "${src}" -output "${dest}"`)
  return readFileSync(dest, 'utf8')
}

console.log(`\n[1/4] Converting 试题 + 解析`)
const paperTxtPath = path.join(outDir, 'full.txt')
const answersTxtPath = path.join(outDir, 'answers.txt')
const paperText = convert(paperPath, paperTxtPath)
const answersText = convert(answersPath, answersTxtPath)
console.log(`      paper ${paperText.length} chars / answers ${answersText.length} chars`)

if (path.resolve(paperPath) !== path.join(outDir, 'paper.docx')) {
  copyFileSync(paperPath, path.join(outDir, 'paper.docx'))
}
if (path.resolve(answersPath) !== path.join(outDir, 'answers.docx')) {
  copyFileSync(answersPath, path.join(outDir, 'answers.docx'))
}

console.log(`\n[2/4] Building groups for ${paperId}`)
let groups
try {
  groups = buildDocxPairGroups(paperText, answersText, paperId)
} catch (err) {
  console.error('FAIL buildDocxPairGroups:', err.message)
  process.exit(1)
}

const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups
paper.sourceFilename = path.basename(paperPath)

const official = extractOfficialWritingAnswers(answersText)
writeFileSync(path.join(outDir, 'writing-official.json'), `${JSON.stringify(official, null, 2)}\n`)

console.log(`\n[3/4] Shape-gating groups`)
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

console.log(`\n[4/4] Writing outputs to ${outDir}`)
writeFileSync(path.join(outDir, 'groups.json'), `${JSON.stringify({
  paper, readingGroups, seven, cloze, grammar, application, continuation,
}, null, 2)}\n`)
console.log('      groups.json written')

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

console.log(`\n======= SPLIT REPORT: ${paperId} =======`)
let totalReadingQs = 0
for (const g of readingGroups) {
  const nos = g.questions.map((q) => Number(q.questionNo))
  const answers = g.questions.map((q) => q.answerKey).join('')
  console.log(`   ${g.groupId}: ${g.questions.length} qs, nos ${Math.min(...nos)}-${Math.max(...nos)}, paras=${g.paragraphs.length}, ans="${answers}"`)
  totalReadingQs += g.questions.length
}
console.log(`   Total reading: ${totalReadingQs} (expect 15)`)

const sevenAns = seven.questions.map((q) => q.answerKey).join('')
const sevenMarkers = seven.paragraphs.flatMap((p) => p.text.match(/__\d+__/g) || [])
console.log(`\n-- SEVEN -- paras=${seven.paragraphs.length} bank=${seven.optionBank.map((o) => o.label).join('')} ans="${sevenAns}" blanks=${sevenMarkers.join(' ')}`)

const clozeAns = cloze.questions.map((q) => q.answerKey).join('')
const clozeMarkers = cloze.paragraphs.flatMap((p) => p.text.match(/__\d+__/g) || [])
console.log(`-- CLOZE -- paras=${cloze.paragraphs.length} ans="${clozeAns}" blanks=${clozeMarkers.join(' ')}`)

const grammarMarkers = grammar.paragraphs.flatMap((p) => p.text.match(/__\d+__/g) || [])
console.log('-- GRAMMAR --')
for (const q of grammar.questions) {
  console.log(`   ${q.stem}: ans="${q.answerKey}" prompt=${q.prompt ?? '-'}`)
}
console.log(`   blanks=${grammarMarkers.join(' ')}`)

console.log(`-- APPLICATION -- paras=${application.paragraphs.length} given=${application.applicationGiven || '-'}`)
console.log(`-- CONTINUATION -- paras=${continuation.paragraphs.length}`)
for (const s of continuation.continuationStarters) {
  console.log(`   starter: "${s.slice(0, 80)}"`)
}
console.log(`-- OFFICIAL WRITING -- app=${official.application ? 'yes' : 'no'} cont=${official.continuation ? 'yes' : 'no'}`)
console.log(`\n[DONE] Shape gates passed. ${outDir}`)
