/**
 * zj-2026-normalize.mjs  —  OFFLINE one-off text normalizer
 *
 * Converts the 2026年1月浙江首考 (= 新高考全国卷一) English paper from its精校
 * docx-converted typesetting (/tmp/ans-2026.txt) into the answer-LESS,
 * Format-B "big-question.sub-question" shape that the existing deterministic
 * import pipeline (scripts/import-pipeline/lib.mjs, driven by 01-split.mjs)
 * already parses correctly for the 2023/2024/2025 Zhejiang siblings.
 *
 * Output: /tmp/tiku-2026.txt  (then fed to zj-inject-answers.mjs).
 *
 * It is an OFFLINE helper, NOT part of the product runtime. Keep it readable;
 * the whole correctness contract lives here so a re-run is reproducible.
 *
 * ---------------------------------------------------------------------------
 * TARGET SHAPE (mirrors /tmp/tiku-2024.txt, which imports cleanly):
 *   第二部分 阅读理解…  /  第一节…  /  第二节…
 *   第三部分 语言运用…  /  第一节…  /  第二节…
 *   第四部分 写作…      /  第一节…  /  第二节…
 *
 *   Reading passage  : `N.(7.5分)　　<paragraphs joined by 　　>` (N = 1..4)
 *   Reading sub-q    : `(k) (2.5分)<stem>` then ONE option line
 *                      `A．optB．optC．optD．opt` (fullwidth ． = U+FF0E)
 *   七选五           : passage with inline `(1)`..`(5)`; ONE bank line
 *                      `A．..B．..C．..D．..E．..F．..G．..`
 *   完形             : passage with wide-spaced bare LOCAL numbers ` 1 `..` 15 `
 *                      (lib maps 1..15 → __41__..__55__); per-blank option lines
 *                      `(k) (1分)A．optB．optC．optD．opt`
 *   语法             : passage with inline `(1)`..`(10)` each optionally
 *                      followed by a `(hint)`
 *   写作             : 第一节 application + 第二节 continuation, left as-is
 *
 * The fullwidth period U+FF0E (．) after an option letter is LOAD-BEARING:
 * lib.mjs / zj-inject-answers.mjs detect option blocks ONLY on `A．` etc.,
 * never on a regular `A.` (a regular period appears inside option/passage text
 * like "U.S." or "more CARE."). So we convert option markers to fullwidth and
 * leave every other period alone.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = '/tmp/ans-2026.txt'
const OUT = '/tmp/tiku-2026.txt'

const IDEO = '　' // U+3000 ideographic space
const FF = '．'   // U+FF0E fullwidth period (option marker)

const src = readFileSync(SRC, 'utf8')
const lines = src.split('\n')

// ---- small helpers ----------------------------------------------------------

/** index of first line whose trimmed form matches `re`, searching from `from`. */
function findFrom(re, from = 0) {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].trim())) return i
  return -1
}

/** Convert genuine option markers "A. " .. "G. " to fullwidth "A．" within a
 *  one-line, tab/space-separated option string. We only touch a letter that is
 *  immediately followed by ". " (regular period + at least one space), which is
 *  exactly how the 2026 source writes option markers; periods inside option text
 *  ("U.S.", "more CARE.") are never followed by a single uppercase A-G + ". ". */
function fullwidthOptionMarkers(s) {
  return s.replace(/(^|[\s])([A-G])\.\s+/g, (_, pre, letter) => `${pre}${letter}${FF}`)
}

/** Collapse runs of tabs/spaces to a single space and trim. */
function squashWs(s) {
  return s.replace(/[\t ]+/g, ' ').trim()
}

// ---- locate source section anchors -----------------------------------------

const readingPartIdx = findFrom(/^第二部分\s*阅读/)            // 78
const sevenSubIdx = findFrom(/^第二节/, readingPartIdx + 1)    // 174
const langPartIdx = findFrom(/^第三部分\s*语言运用/)           // 189
const clozeSubIdx = findFrom(/^第一节/, langPartIdx + 1)       // 190
const grammarSubIdx = findFrom(/^第二节/, langPartIdx + 1)     // 219
const writingPartIdx = findFrom(/^第四部分\s*写作/)            // 225
const appSubIdx = findFrom(/^第一节/, writingPartIdx + 1)      // 226
const contSubIdx = findFrom(/^第二节/, writingPartIdx + 1)     // 241

for (const [name, idx] of Object.entries({
  readingPartIdx, sevenSubIdx, langPartIdx, clozeSubIdx,
  grammarSubIdx, writingPartIdx, appSubIdx, contSubIdx,
})) {
  if (idx === -1) throw new Error(`source anchor not found: ${name}`)
}

const out = []

// =============================================================================
// Title + Part 2: Reading 第一节 (4 passages, Q21-35)
// =============================================================================

out.push('浙江省2026年1月普通高等学校招生全国统一考试英语试卷')
out.push('')
out.push('第二部分 阅读理解（共两节，满分50分）')
out.push('第一节（共15个小题；每小题2.5分，满分37.5分）')

// The reading-第一节 region runs from after the 第一节 header to the 第二节 header.
const readingSubIdx = findFrom(/^第一节/, readingPartIdx + 1) // 79
const readingBody = lines.slice(readingSubIdx + 1, sevenSubIdx)

// Within this region: a bare letter line `A`/`B`/`C`/`D` opens a passage; the
// passage paragraphs follow until the first top-level numbered question
// (`21.` ...); questions continue (each question's options may be split over
// two `A. .. B. ..` / `C. .. D. ..` lines) until the next letter line.
//
// Strategy: walk the region, segment into 4 passages by the bare-letter lines,
// then within each passage split passage-text vs question-block at the first
// `^\d+\.` line.

const passageSegs = [] // [{ letter, lines:[...] }]
let curSeg = null
for (const raw of readingBody) {
  const t = raw.trim()
  if (/^[A-D]$/.test(t)) {
    if (curSeg) passageSegs.push(curSeg)
    curSeg = { letter: t, lines: [] }
    continue
  }
  if (curSeg) curSeg.lines.push(raw)
}
if (curSeg) passageSegs.push(curSeg)

if (passageSegs.length !== 4) {
  throw new Error(`reading: expected 4 lettered passages, got ${passageSegs.length}`)
}

let passageNo = 0
for (const seg of passageSegs) {
  passageNo++

  // Find first top-level numbered question line (e.g. "21. ...").
  const firstQ = seg.lines.findIndex((l) => /^\d+\.\s/.test(l.trim()))
  if (firstQ === -1) throw new Error(`reading ${seg.letter}: no numbered question found`)

  const passageLines = seg.lines.slice(0, firstQ)
  const qLines = seg.lines.slice(firstQ)

  // Passage: join non-empty paragraph lines (incl. flattened table cells) with 　　.
  const paras = passageLines.map((l) => squashWs(l)).filter(Boolean)
  out.push(`${passageNo}.(7.5分)${IDEO}${IDEO}${paras.join(IDEO + IDEO)}`)

  // Questions: a `^\d+\.` line opens a question (stem); subsequent option lines
  // (containing A-G markers) belong to that question until the next stem.
  let local = 0
  let optBuf = ''
  const flush = () => {
    if (optBuf) {
      out.push(fullwidthOptionMarkers(optBuf))
      optBuf = ''
    }
  }
  for (const raw of qLines) {
    const t = raw.trim()
    if (!t) continue
    const stemM = t.match(/^(\d+)\.\s*(.*)$/)
    // A genuine stem line: starts with number+dot and is NOT itself an option
    // line (an option line like "A. .." won't match ^\d+\. anyway).
    if (stemM && !/^[A-G]\.\s/.test(stemM[2])) {
      flush()
      local++
      out.push(`(${local}) (2.5分)${stemM[2].trim()}`)
      continue
    }
    // Option fragment line: accumulate (may be A/B on one line, C/D on next).
    optBuf += (optBuf ? ' ' : '') + squashWs(t)
  }
  flush()
}

// =============================================================================
// Part 2: Reading 第二节 (七选五, Q36-40)
// =============================================================================

out.push('第二节（共5小题；每小题2.5分，满分12.5分）')

const sevenBody = lines.slice(sevenSubIdx + 1, langPartIdx)
// Passage = lines before the first standalone "A. " option-bank line.
// Option bank = 7 separate lines `A. text` .. `G. text`.
const sevenBankStart = sevenBody.findIndex((l) => /^[A]\.\s/.test(l.trim()))
if (sevenBankStart === -1) throw new Error('seven: option bank not found')

const sevenPassageLines = sevenBody.slice(0, sevenBankStart)
const sevenBankLines = sevenBody.slice(sevenBankStart)

// Passage: join paragraphs with 　　; convert inline blanks NN._______ → (k).
let sevenPassage = sevenPassageLines
  .map((l) => squashWs(l))
  .filter(Boolean)
  .join(IDEO + IDEO)
sevenPassage = sevenPassage.replace(/(\d{1,2})\._{3,}/g, (_, n) => `(${Number(n) - 35})`)
out.push(`5.(12.5分)${sevenPassage}`)

// Option bank: 7 lines `A. ..` .. `G. ..` → one fullwidth-marker line.
// Convert each line's leading marker to fullwidth BEFORE joining: once joined,
// "blame.B." has no space before B for the marker regex to anchor on.
const sevenBank = sevenBankLines
  .map((l) => squashWs(l))
  .filter((l) => /^[A-G]\.\s/.test(l))
  .map((l) => fullwidthOptionMarkers(l))
if (sevenBank.length !== 7) throw new Error(`seven: expected 7 options, got ${sevenBank.length}`)
out.push(sevenBank.join(''))

// =============================================================================
// Part 3: 语言运用 第一节 (完形, Q41-55)
// =============================================================================

out.push('第三部分 语言运用（共两节，满分30分）')
out.push('第一节（共15小题；每小题1分，满分15分）')

// Cloze region: from after 第一节 header to the 第二节 (grammar) header. Note the
// source slips a "非选择题部分 / 注意…" page break between the cloze options and
// the grammar 第二节 — those non-structural lines fall AFTER the option block, so
// they are simply not emitted (we stop at the last `^\d+\. A.` option line).
const clozeBody = lines.slice(clozeSubIdx + 1, grammarSubIdx)

// Cloze passage = lines before the first top-level numbered OPTION line
// (`41. A. ..`). Cloze options = `NN. A. .. B. .. C. .. D. ..` lines.
const clozeFirstOpt = clozeBody.findIndex((l) => /^\d+\.\s*A\.\s/.test(l.trim()))
if (clozeFirstOpt === -1) throw new Error('cloze: first option line not found')

const clozePassageLines = clozeBody.slice(0, clozeFirstOpt)
const clozeOptLines = clozeBody.slice(clozeFirstOpt)

// Passage: join with 　　; convert inline NN._______ → wide-spaced LOCAL number
// (41→ " 1 ", .., 55→ " 15 ") so lib's cloze blank detector
//   /([\s\xa0]{2,})(\d{1,2})([\s\xa0]{2,})/  (mapping 1..15 → __41__..__55__) fires.
let clozePassage = clozePassageLines
  .map((l) => squashWs(l))
  .filter(Boolean)
  .join(IDEO + IDEO)
clozePassage = clozePassage.replace(/(\d{1,2})\._{3,}/g, (_, n) => `  ${Number(n) - 40}  `)
out.push(`6.(15分)${IDEO}${IDEO}${clozePassage}`)

// Cloze options: `41. A. .. B. .. C. .. D. ..` → `(1) (1分)A．..B．..C．..D．..`.
let clozeLocal = 0
for (const raw of clozeOptLines) {
  const t = raw.trim()
  const m = t.match(/^(\d+)\.\s*(A\..*)$/)
  if (!m) continue
  clozeLocal++
  const opts = fullwidthOptionMarkers(squashWs(m[2]))
  out.push(`(${clozeLocal}) (1分)${opts}`)
}
if (clozeLocal !== 15) throw new Error(`cloze: expected 15 option lines, got ${clozeLocal}`)

// =============================================================================
// Part 3: 语言运用 第二节 (语法填空, Q56-65)
// =============================================================================

out.push('第二节（共10小题；每小题1.5分，满分15分）')

// Grammar region: from after 第二节 header to the 写作 part header.
const grammarBody = lines.slice(grammarSubIdx + 1, writingPartIdx)
// Passage paragraphs only (skip the instruction line + blanks). Convert inline
// blanks `NN._______ (hint)` → `(k) (hint)` and `NN._______` → `(k)`.
let grammarPassage = grammarBody
  .map((l) => squashWs(l))
  .filter(Boolean)
  // drop the standard instruction sentence if present
  .filter((l) => !/^阅读下面短文/.test(l))
  .join(IDEO + IDEO)

// `NN._______ (hint)` — keep the hint; renumber 56→1 .. 65→10.
grammarPassage = grammarPassage.replace(
  /(\d{1,2})\._{3,}\s*(\([A-Za-z][^)]*\))?/g,
  (_, n, hint) => {
    const local = Number(n) - 55
    return hint ? `(${local}) ${hint}` : `(${local})`
  }
)
out.push(`7.(15分)${grammarPassage}`)

// =============================================================================
// Part 4: 写作 (application + continuation) — passthrough, lightly cleaned
// =============================================================================

out.push('第四部分 写作（共两节，满分40分）')

// Application: 第一节 .. up to the continuation 第二节.
out.push('第一节（满分15分）')
{
  const appBody = lines.slice(appSubIdx + 1, contSubIdx)
  const appText = appBody.map((l) => squashWs(l)).filter(Boolean).join(IDEO + IDEO)
  out.push(`8.(15分)${appText}`)
}

// Continuation: 第二节 .. end of file.
out.push('第二节（满分25分）')
{
  const contBody = lines.slice(contSubIdx + 1)
  const contText = contBody.map((l) => squashWs(l)).filter(Boolean).join(IDEO + IDEO)
  out.push(`9.(25分)${contText}`)
}

out.push('')

writeFileSync(OUT, out.join('\n'), 'utf8')
console.error(`[normalize zj-2026] wrote ${OUT} (${out.length} lines)`)
