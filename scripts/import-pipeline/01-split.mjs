/**
 * 01-split.mjs <configPath>
 *
 * 1. Reads config JSON (docxPath, paperId, provenance).
 * 2. Converts DOCX -> TXT via textutil.
 * 3. Calls buildGroups() -> all sections.
 * 4. SHAPE-GATES every analyzable group by calling shipped build*AnalysisMessages (throws on bad shape).
 * 5. Writes papers/<paperId>/groups.json
 * 6. Writes papers/<paperId>/analyze-<key>-combined.txt for each analyzable group.
 *
 * Usage: node .scratch/import-pilot/01-split.mjs <configPath>
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildGroups, buildReadingAnalysisMessages } from './lib.mjs'
import { buildSevenChoicesAnalysisMessages } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildClozeAnalysisMessages } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- Load config ----
const configPath = process.argv[2]
if (!configPath) {
  console.error('Usage: node 01-split.mjs <configPath>')
  process.exit(1)
}
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const { docxPath, paperId, provenance } = config

if (!docxPath || !paperId) {
  console.error('Config must have docxPath and paperId')
  process.exit(1)
}

const outDir = path.join(__dirname, 'papers', paperId)
mkdirSync(outDir, { recursive: true })

// ---- Step 1: Convert DOCX -> TXT ----
const txtPath = path.join(outDir, 'full.txt')
console.log(`\n[1/4] Converting DOCX: ${path.basename(docxPath)}`)
execSync(`textutil -convert txt "${docxPath}" -output "${txtPath}"`)
const fullText = readFileSync(txtPath, 'utf8')
console.log(`      Written: ${txtPath} (${fullText.length} chars)`)

// ---- Step 2: Build groups ----
console.log(`\n[2/4] Building groups for ${paperId}`)
let groups
try {
  groups = buildGroups(fullText, paperId)
} catch (err) {
  console.error('FAIL buildGroups:', err.message)
  process.exit(1)
}

const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups
paper.sourceFilename = path.basename(docxPath)

// ---- Step 3: SHAPE-GATE all analyzable groups ----
console.log(`\n[3/4] Shape-gating groups`)

const errors = []

function shapeGate(name, fn) {
  try {
    fn()
    console.log(`      [OK] ${name}`)
    return true
  } catch (err) {
    console.log(`      [FAIL] ${name}: ${err.message}`)
    errors.push(`${name}: ${err.message}`)
    return false
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

// ---- Step 4: Write outputs ----
console.log(`\n[4/4] Writing outputs to ${outDir}`)

// groups.json
const groupsJson = { paper, readingGroups, seven, cloze, grammar, application, continuation }
const groupsPath = path.join(outDir, 'groups.json')
writeFileSync(groupsPath, JSON.stringify(groupsJson, null, 2))
console.log(`      groups.json written`)

// analyze-<key>-combined.txt for each analyzable group
function writeCombined(name, messages) {
  const combined = [
    '=== SYSTEM (governing spec — follow exactly) ===',
    messages[0].content,
    '',
    '=== TASK ===',
    messages[1].content,
  ].join('\n')
  const p = path.join(outDir, `analyze-${name}-combined.txt`)
  writeFileSync(p, combined)
  console.log(`      analyze-${name}-combined.txt (system ${messages[0].content.length} / user ${messages[1].content.length} chars)`)
}

for (const [i, group] of readingGroups.entries()) {
  const letter = ['a', 'b', 'c', 'd'][i]
  writeCombined(`reading-${letter}`, buildReadingAnalysisMessages({ paper, group }))
}
writeCombined('seven', buildSevenChoicesAnalysisMessages({ paper, group: seven }))
writeCombined('cloze', buildClozeAnalysisMessages({ paper, group: cloze }))
writeCombined('grammar', buildGrammarFillAnalysisMessages({ paper, group: grammar }))

// ---- Report ----
console.log(`\n======= SPLIT REPORT: ${paperId} =======`)

console.log(`\n-- READING (${readingGroups.length} passages) --`)
let totalReadingQs = 0
for (const g of readingGroups) {
  const nos = g.questions.map((q) => Number(q.questionNo))
  const answers = g.questions.map((q) => q.answerKey).join('')
  const missing4opts = g.questions.filter((q) => Object.keys(q.options).length !== 4)
  console.log(
    `   ${g.groupId}: ${g.questions.length} qs, nos ${Math.min(...nos)}-${Math.max(...nos)}, paras=${g.paragraphs.length}, ans="${answers}"${missing4opts.length ? ` WARN: ${missing4opts.length} questions missing 4 options` : ''}`
  )
  totalReadingQs += g.questions.length
}
console.log(`   Total reading: ${totalReadingQs} questions (expect 15, nos 21-35)`)

console.log(`\n-- SEVEN CHOICES --`)
const sevenAns = seven.questions.map((q) => q.answerKey).join('')
const sevenNos = seven.questions.map((q) => Number(q.stem))
const sevenMarkers = seven.paragraphs.flatMap((p) => (p.text.match(/__\d+__/g) || []))
console.log(`   paras=${seven.paragraphs.length} optionBank=${seven.optionBank.length} qs=${seven.questions.length}`)
console.log(`   nos=${Math.min(...sevenNos)}-${Math.max(...sevenNos)} ans="${sevenAns}"`)
console.log(`   blank markers: ${sevenMarkers.join(' ')}`)

console.log(`\n-- CLOZE --`)
const clozeAns = cloze.questions.map((q) => q.answerKey).join('')
const clozeNos = cloze.questions.map((q) => Number(q.stem))
const clozeMarkers = cloze.paragraphs.flatMap((p) => (p.text.match(/__\d+__/g) || []))
console.log(`   paras=${cloze.paragraphs.length} qs=${cloze.questions.length}`)
console.log(`   nos=${Math.min(...clozeNos)}-${Math.max(...clozeNos)} ans="${clozeAns}"`)
console.log(`   blank markers: ${clozeMarkers.join(' ')}`)

console.log(`\n-- GRAMMAR FILL --`)
const grammarNos = grammar.questions.map((q) => Number(q.stem))
const grammarMarkers = grammar.paragraphs.flatMap((p) => (p.text.match(/__\d+__/g) || []))
console.log(`   paras=${grammar.paragraphs.length} qs=${grammar.questions.length}`)
console.log(`   nos=${Math.min(...grammarNos)}-${Math.max(...grammarNos)}`)
for (const q of grammar.questions) {
  console.log(`   ${q.stem}: ans="${q.answerKey}" prompt=${q.prompt ?? '-'}`)
}
console.log(`   blank markers: ${grammarMarkers.join(' ')}`)

console.log(`\n-- APPLICATION --`)
console.log(`   paras=${application.paragraphs.length}`)

console.log(`\n-- CONTINUATION --`)
console.log(`   paras=${continuation.paragraphs.length} starters=${continuation.continuationStarters.length}`)
for (const s of continuation.continuationStarters) {
  console.log(`   starter: "${s.slice(0, 70)}"`)
}

console.log(`\n[DONE] All shape gates passed. groups.json + combined prompts written to ${outDir}`)
