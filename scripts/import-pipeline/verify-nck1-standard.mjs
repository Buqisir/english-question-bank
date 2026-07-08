/**
 * verify-nck1-standard.mjs <paperId>
 *
 * Standalone gate for docs/product/nck1-paper-standard.md §6. Generic across
 * any paperId that went through this pipeline (scripts/import-pipeline/papers/
 * <paperId>/groups.json) — not paper-2026-i-specific. Two run modes, same
 * command, auto-detected:
 *
 *   PRE-PUBLISH  (default; app/public/paper-assets/<paperId> does not exist
 *                yet) — checks the staging materials only: groups.json shape/
 *                counts/question-number ranges, listening/ + figures/ raw
 *                material completeness. This is what a DEV can get "全绿" on
 *                before running 02-publish.mjs --publish.
 *   POST-PUBLISH (app/public/paper-assets/<paperId>/latest exists) — adds the
 *                checks that listening/ and figures/ actually landed in the
 *                live paper-asset tree (via attach-paper-assets-extras.mjs).
 *                This is the check that would catch "forgot the copy step".
 *
 * §6 does NOT include a "score matches §1" arithmetic check here: per-question
 * score is derived by shipped server/paper-import-ai/packageBuilder.mjs's
 * resolveFormatProfile() at publish time (keyed off cloze question count),
 * not stored in groups.json. This script instead asserts the structural
 * precondition (cloze count === 15) that makes packageBuilder pick the
 * newStandard profile — the ONLY profile whose fixed scores (reading 2.5 /
 * seven 2.5 / cloze 1 / grammar 1.5) match standard §1. Cross-checking that
 * groups.json's answerKeys literally match the source answers PDF is a
 * transcription-fidelity concern handled by the completion report's spot
 * check table, not by this generic script (a future paper's source PDF is
 * not available to this script to diff against).
 *
 * Also runs (as check S0, folded into this script's PASS/FAIL count) the
 * standalone `verify-source-doc-types.mjs` subprocess — the C9 validator
 * docx/pdf magic-byte accept/reject regression — so it is re-asserted on
 * every "standard verify" run, not only when someone remembers to invoke it
 * by hand.
 *
 * Usage: node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>
 * Exit: 0 all green, 1 any FAIL.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

const paperId = process.argv[2]
if (!paperId) {
  console.error('Usage: node verify-nck1-standard.mjs <paperId>')
  process.exit(1)
}

const stagingDir = path.join(__dirname, 'papers', paperId)
const groupsPath = path.join(stagingDir, 'groups.json')
const listeningDir = path.join(stagingDir, 'listening')
const figuresDir = path.join(stagingDir, 'figures')
const liveDir = path.join(rootDir, 'app/public/paper-assets', paperId)
const liveLatestDir = path.join(liveDir, 'latest')

const results = []
function check(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true, detail: detail || '' })
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
}
function fail(msg) {
  throw new Error(msg)
}

// ---- Load groups.json ----
if (!existsSync(groupsPath)) {
  console.error(`FAIL: groups.json not found at ${groupsPath} — run pdf-extract.mjs / 01-split.mjs first.`)
  process.exit(1)
}
const groups = JSON.parse(readFileSync(groupsPath, 'utf8'))
const { readingGroups, seven, cloze, grammar, application, continuation } = groups

// ---- 0. C9 validator source-doc-type regression (docx/pdf magic-byte accept/reject) ----
// Folds scripts/import-pipeline/verify-source-doc-types.mjs's H1/H2/H3 assertions
// into this gate's PASS/FAIL count so the C9 behavior contract is re-run every
// time someone runs "the standard verify", not only by hand once.
check('S0 verify-source-doc-types.mjs (H1/H2/H3 docx/pdf magic-byte accept/reject) subprocess all green', () => {
  const scriptPath = path.join(__dirname, 'verify-source-doc-types.mjs')
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`verify-source-doc-types.mjs exited ${result.status}\n${result.stdout}${result.stderr}`)
  }
  return 'H1/H2/H3 subprocess exit 0'
})

// ---- A. 9 groups present, correct types/counts ----
const READING_EXPECTED_COUNTS = { a: 3, b: 4, c: 4, d: 4 }
check('A1 reading: 4 passages (a/b/c/d), question counts per §1 (A=3,B/C/D=4)', () => {
  if (!Array.isArray(readingGroups) || readingGroups.length !== 4) fail(`expected 4 reading groups, got ${readingGroups?.length}`)
  const letters = readingGroups.map((g) => g.groupId.match(/-reading-([a-d])$/)?.[1])
  for (const letter of ['a', 'b', 'c', 'd']) {
    if (!letters.includes(letter)) fail(`missing reading-${letter}`)
    const g = readingGroups.find((x) => x.groupId.endsWith(`-reading-${letter}`))
    if (g.questions.length !== READING_EXPECTED_COUNTS[letter]) {
      fail(`reading-${letter} expected ${READING_EXPECTED_COUNTS[letter]} questions, got ${g.questions.length}`)
    }
  }
  return `${readingGroups.reduce((n, g) => n + g.questions.length, 0)} reading questions total`
})
check('A2 seven-choices: groupType sevenChoices, 5 questions, 7-option bank', () => {
  if (seven?.groupType !== 'sevenChoices') fail(`groupType=${seven?.groupType}`)
  if (seven.questions.length !== 5) fail(`expected 5 questions, got ${seven.questions.length}`)
  if (seven.optionBank.length !== 7) fail(`expected 7 option bank entries, got ${seven.optionBank.length}`)
})
check('A3 cloze: groupType cloze, 15 questions', () => {
  if (cloze?.groupType !== 'cloze') fail(`groupType=${cloze?.groupType}`)
  if (cloze.questions.length !== 15) fail(`expected 15 questions, got ${cloze.questions.length}`)
})
check('A4 grammar-fill: groupType grammarFill, 10 questions', () => {
  if (grammar?.groupType !== 'grammarFill') fail(`groupType=${grammar?.groupType}`)
  if (grammar.questions.length !== 10) fail(`expected 10 questions, got ${grammar.questions.length}`)
})
check('A5 writing: application + continuation both present, non-empty', () => {
  if (!application || !Array.isArray(application.paragraphs) || application.paragraphs.length === 0) fail('application group missing/empty')
  if (!continuation || !Array.isArray(continuation.paragraphs) || continuation.paragraphs.length === 0) fail('continuation group missing/empty')
  if (!Array.isArray(continuation.continuationStarters) || continuation.continuationStarters.length < 2) {
    fail(`continuation needs >=2 continuationStarters, got ${continuation.continuationStarters?.length}`)
  }
})

// ---- B. 题号段 ----
check('B1 reading question numbers = 21-35, sequential, no gaps/dupes', () => {
  const nos = readingGroups.flatMap((g) => g.questions.map((q) => Number(q.questionNo))).sort((x, y) => x - y)
  const expected = Array.from({ length: 15 }, (_, i) => 21 + i)
  if (JSON.stringify(nos) !== JSON.stringify(expected)) fail(`got [${nos.join(',')}], expected [${expected.join(',')}]`)
})
check('B2 seven question numbers = 36-40', () => {
  const nos = seven.questions.map((q) => Number(q.stem)).sort((x, y) => x - y)
  const expected = [36, 37, 38, 39, 40]
  if (JSON.stringify(nos) !== JSON.stringify(expected)) fail(`got [${nos.join(',')}]`)
})
check('B3 cloze question numbers = 41-55', () => {
  const nos = cloze.questions.map((q) => Number(q.stem)).sort((x, y) => x - y)
  const expected = Array.from({ length: 15 }, (_, i) => 41 + i)
  if (JSON.stringify(nos) !== JSON.stringify(expected)) fail(`got [${nos.join(',')}]`)
})
check('B4 grammar-fill question numbers = 56-65', () => {
  const nos = grammar.questions.map((q) => Number(q.stem)).sort((x, y) => x - y)
  const expected = Array.from({ length: 10 }, (_, i) => 56 + i)
  if (JSON.stringify(nos) !== JSON.stringify(expected)) fail(`got [${nos.join(',')}]`)
})

// ---- C. 分值 (structural precondition for packageBuilder's newStandard profile) ----
check('C1 cloze count===15 => packageBuilder resolves newStandard profile (§1 scores 2.5/2.5/1/1.5)', () => {
  if (cloze.questions.length !== 15) fail(`cloze count ${cloze.questions.length} would NOT resolve to newStandard profile`)
  return 'reading=2.5 seven=2.5 cloze=1 grammar=1.5 (auto by server/paper-import-ai/packageBuilder.mjs at publish time)'
})

// ---- D. 客观题答案数量齐 (21-65, exactly one each, non-empty) ----
check('D1 objective answers 21-65: exactly one non-empty answerKey each', () => {
  const byNo = new Map()
  for (const g of readingGroups) for (const q of g.questions) byNo.set(Number(q.questionNo), q.answerKey)
  for (const q of seven.questions) byNo.set(Number(q.stem), q.answerKey)
  for (const q of cloze.questions) byNo.set(Number(q.stem), q.answerKey)
  for (const q of grammar.questions) byNo.set(Number(q.stem), q.answerKey)
  const missing = []
  for (let no = 21; no <= 65; no += 1) {
    const answer = byNo.get(no)
    if (!answer || !String(answer).trim()) missing.push(no)
  }
  if (missing.length > 0) fail(`missing/empty answerKey for: ${missing.join(', ')}`)
  return `45/45 present (21-65)`
})

// ---- E. 听力原料非空 ----
check('E1 listening/questions.json: 20 stems+options (5 + 15)', () => {
  const p = path.join(listeningDir, 'questions.json')
  if (!existsSync(p)) fail('listening/questions.json missing')
  const data = JSON.parse(readFileSync(p, 'utf8'))
  const n1 = data.section1?.questions?.length || 0
  const n2 = data.section2?.questions?.length || 0
  if (n1 !== 5) fail(`section1 expected 5 questions, got ${n1}`)
  if (n2 !== 15) fail(`section2 expected 15 questions, got ${n2}`)
})
check('E2 listening/answers.json: 20 answers (1-20)', () => {
  const p = path.join(listeningDir, 'answers.json')
  if (!existsSync(p)) fail('listening/answers.json missing')
  const data = JSON.parse(readFileSync(p, 'utf8'))
  const keys = Object.keys(data.answers || {})
  if (keys.length !== 20) fail(`expected 20 answers, got ${keys.length}`)
  for (let no = 1; no <= 20; no += 1) {
    if (!data.answers[String(no)]) fail(`missing answer for question ${no}`)
  }
})
check('E3 listening/transcript.json: 10 texts + timing/rate table', () => {
  const p = path.join(listeningDir, 'transcript.json')
  if (!existsSync(p)) fail('listening/transcript.json missing')
  const data = JSON.parse(readFileSync(p, 'utf8'))
  if (!Array.isArray(data.texts) || data.texts.length !== 10) fail(`expected 10 texts, got ${data.texts?.length}`)
  if (!Array.isArray(data.timingTable) || data.timingTable.length !== 10) fail(`expected 10 timing rows, got ${data.timingTable?.length}`)
  for (const row of data.timingTable) {
    if (!row.durationSeconds || !row.wordCount || !row.wordsPerMinute) fail(`timing row for ${row.text} missing duration/wordCount/wpm`)
  }
})

// ---- F. figures 齐全 (dual-store bridge, §8) ----
check('F1 figures/manifest.json: every entry has an existing non-empty file + valid groupId + placeholder present in materialText', () => {
  const manifestPath = path.join(figuresDir, 'manifest.json')
  if (!existsSync(manifestPath)) fail('figures/manifest.json missing')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.figures) || manifest.figures.length === 0) fail('manifest.figures is empty')
  const allGroupIds = new Set([
    ...readingGroups.map((g) => g.groupId),
    seven.groupId,
    cloze.groupId,
    grammar.groupId,
    application.groupId,
    continuation.groupId,
  ])
  for (const entry of manifest.figures) {
    const filePath = path.join(figuresDir, entry.file)
    if (!existsSync(filePath)) fail(`figure file missing: ${entry.file}`)
    if (statSync(filePath).size === 0) fail(`figure file empty: ${entry.file}`)
    if (!allGroupIds.has(entry.groupId)) fail(`figure ${entry.figureId} references unknown groupId ${entry.groupId}`)
    const group = [...readingGroups, seven, cloze, grammar, application, continuation].find((g) => g.groupId === entry.groupId)
    const materialText = (group.paragraphs || []).map((p) => p.text).join('\n')
    if (entry.placeholderMarker && !materialText.includes(entry.placeholderMarker)) {
      fail(`placeholderMarker "${entry.placeholderMarker}" not found in ${entry.groupId}'s materialText — dual-store bridge broken`)
    }
  }
  return `${manifest.figures.length} figure(s) OK`
})

// ---- G. Post-publish progressive check ----
const published = existsSync(liveLatestDir)
if (published) {
  check('G1 [post-publish] live paper-assets/<paperId>/latest/listening + figures present (attach-paper-assets-extras.mjs ran)', () => {
    const liveListening = path.join(liveLatestDir, 'listening')
    const liveFigures = path.join(liveLatestDir, 'figures')
    if (!existsSync(liveListening)) fail(`${liveListening} missing — run attach-paper-assets-extras.mjs ${paperId}`)
    if (!existsSync(liveFigures)) fail(`${liveFigures} missing — run attach-paper-assets-extras.mjs ${paperId}`)
  })
} else {
  results.push({ name: 'G1 [post-publish] live paper-assets check', ok: true, detail: 'skipped (not published yet — this is expected pre-publish)' })
}

// ---- Report ----
console.log(`\n======= verify-nck1-standard: ${paperId} =======`)
console.log(`mode: ${published ? 'POST-PUBLISH' : 'PRE-PUBLISH'} (live dir ${published ? 'found' : 'not found'}: ${liveLatestDir})`)
let failCount = 0
for (const r of results) {
  console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) failCount += 1
}
console.log(`\n${results.length - failCount}/${results.length} checks passed.`)
if (failCount > 0) {
  console.error(`\nFAIL: ${failCount} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll green.')
