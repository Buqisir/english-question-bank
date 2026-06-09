/**
 * zj-inject-answers.mjs <paperId> <rawTxtPath> <outTxtPath>
 *
 * Zhejiang 真题 only have 题目版 (no answers) + 解析版 (answers buried in
 * explanations that pollute passages). This offline helper marries the CLEAN
 * 原版 text with the authoritative answer keys (extracted from 解析版 / official
 * answer sheet) to synthesize an ANSWER-VERSION text in exactly the shape
 * lib.mjs Format-B expects (`【答案】X` after each option block; `【答案】[[...]]`
 * for seven-choices; one `；`-joined `【答案】` line for grammar).
 *
 * It also normalizes the section header「语言知识运用」→「语言运用」so the shipped
 * Format-B detector (which keys on 语言运用) matches — no pipeline fork.
 *
 * Correctness is VERIFIED downstream: 01-split's SPLIT REPORT prints the
 * extracted answers per question; compare against KEYS below — they must match
 * exactly, or the marriage is wrong.
 */
import { readFileSync, writeFileSync } from 'node:fs'

// ---- Authoritative answer keys (ground truth) ----
//   reading: 15 (q21-35, in passage order A,B,C,D)
//   seven:   5  (q36-40)
//   cloze:   15 (q41-55)
//   grammar: 10 (q56-65), ；-joined exactly as the answer sheet gives them
const KEYS = {
  'paper-zj-2024-jan': {
    reading: ['A','C','D','B','A','B','C','B','A','C','D','D','C','B','D'],
    seven: ['G','F','A','D','E'],
    cloze: ['B','D','C','A','C','A','D','B','A','C','B','D','C','A','D'],
    grammar: 'to benefit；or；that,which；what；criticism；be offered；have started；designed；the；ones',
  },
  'paper-zj-2025-jan': {
    reading: ['C','D','D','B','C','A','C','B','D','C','A','A','B','D','B'],
    seven: ['C','D','G','B','F'],
    cloze: ['C','A','D','B','A','B','C','C','D','A','B','A','D','D','B'],
    grammar: 'a；times；on；and；to rent；solution；is；which；people’s；returning',
  },
  'paper-zj-2026-jan': {
    reading: ['D','B','A','B','D','C','A','A','D','B','D','A','B','C','C'],
    seven: ['B','E','C','F','G'],
    cloze: ['D','A','C','C','B','B','A','B','D','B','D','A','B','C','D'],
    grammar: 'to finish；in；numbers；watching；excitement；that/which；being pushed；the；and；seemingly',
  },
}

const [paperId, rawPath, outPath] = process.argv.slice(2)
if (!paperId || !rawPath || !outPath) {
  console.error('usage: zj-inject-answers.mjs <paperId> <rawTxtPath> <outTxtPath>')
  process.exit(2)
}
const keys = KEYS[paperId]
if (!keys) { console.error(`no KEYS for ${paperId}`); process.exit(2) }

const raw = readFileSync(rawPath, 'utf8')
const lines = raw.split('\n')

// Option-block detectors. Real option markers are ALWAYS fullwidth ． (U+FF0E),
// e.g. "A．Former". A regular period appears only inside option TEXT (sentence
// ends, ALL-CAPS like "more CARE.D．") — so matching it would false-positive an
// "E．" and drop the line. Match ONLY fullwidth ．.
const hasOpt = (l, letter) => new RegExp(`${letter}．`).test(l)
const isFourOpt = (l) =>
  hasOpt(l, 'A') && hasOpt(l, 'B') && hasOpt(l, 'C') && hasOpt(l, 'D') && !hasOpt(l, 'E')
const isSevenOpt = (l) =>
  ['A','B','C','D','E','F','G'].every((x) => hasOpt(l, x))

// Section state machine over 原版 headers.
//   part: 'pre' | 'reading' | 'lang' | 'writing'
//   sub : 1 | 2   (第一节 / 第二节 within current part)
let part = 'pre'
let sub = 1
const reading = [...keys.reading]
const seven = [...keys.seven]
const cloze = [...keys.cloze]
let grammarEmitted = false
const out = []
let counts = { reading: 0, seven: 0, cloze: 0, grammar: 0 }

const isPartHeader = (l) => /^第[一二三四五六七八九十]+部分/.test(l.trim())
const partKind = (l) => {
  if (/阅\s*读/.test(l) || /阅读/.test(l)) return 'reading'
  if (/语言.*运用/.test(l)) return 'lang'   // matches 语言运用 AND 语言知识运用
  if (/写\s*作/.test(l)) return 'writing'
  if (/听\s*力/.test(l)) return 'pre'
  return null
}
const isSubHeader = (l) => /^第[一二]节/.test(l.trim())
const subKind = (l) => (/^第二节/.test(l.trim()) ? 2 : 1)

function emitGrammarAnswerIfPending() {
  if (part === 'lang' && sub === 2 && !grammarEmitted) {
    out.push(`【答案】${keys.grammar}`)
    grammarEmitted = true
    counts.grammar = keys.grammar.split('；').length
  }
}

for (let i = 0; i < lines.length; i++) {
  let line = lines[i]
  const t = line.trim()

  if (isPartHeader(line)) {
    const kind = partKind(line)
    // grammar answer line must be flushed before leaving the lang part
    if (kind && kind !== 'lang') emitGrammarAnswerIfPending()
    if (kind) { part = kind; sub = 1 }
    // normalize 语言知识运用 -> 语言运用 so shipped Format-B detector matches
    if (kind === 'lang') line = line.replace('语言知识运用', '语言运用')
    out.push(line)
    continue
  }
  if (isSubHeader(line) && (part === 'reading' || part === 'lang' || part === 'writing')) {
    sub = subKind(line)
    out.push(line)
    continue
  }

  // --- reading 第一节 passage-body collapse ---
  // Ad/notice passages carry TABLES that textutil flattens into one-cell-per-line
  // (e.g. "Library Type" / "Loan Cost" / "15" / "10"). lib.mjs's isBigQStart
  // treats a bare-number line (/^\d+\s*$/) as a NEW big-question, which shreds the
  // passage block → paragraphs=[]. Merge every non-structural reading-第一节 line
  // into the previous output line so the passage (incl. table data) stays one block.
  if (part === 'reading' && sub === 1) {
    const isStructural =
      /^\d+[.)]/.test(t) ||         // big-question start: 1.(7.5分)…
      /^\(\d+\)/.test(t) ||         // sub-question: (1)…
      /^[A-G]$/.test(t) ||          // lone passage label (原版 style)
      /^阅读/.test(t) ||            // section instruction line
      isFourOpt(line) ||            // option block
      t === ''                      // blank line
    if (!isStructural && out.length) {
      // merge into previous emitted line instead of standing alone
      out[out.length - 1] = `${out[out.length - 1]} ${t}`.replace(/[ \t]{2,}/g, ' ')
      continue
    }
  }

  out.push(line)

  // --- answer injection by (part, sub) ---
  if (part === 'reading' && sub === 1 && isFourOpt(line)) {
    if (reading.length) { out.push(`【答案】${reading.shift()}`); counts.reading++ }
  } else if (part === 'reading' && sub === 2 && isSevenOpt(line)) {
    out.push(`【答案】[[${seven.map((s) => `"${s}"`).join(',')}]]`)
    counts.seven = seven.length
  } else if (part === 'lang' && sub === 1 && isFourOpt(line)) {
    if (cloze.length) { out.push(`【答案】${cloze.shift()}`); counts.cloze++ }
  }
}
emitGrammarAnswerIfPending() // in case grammar is the last part (no 写作 after)

writeFileSync(outPath, out.join('\n'), 'utf8')
console.error(
  `[inject ${paperId}] reading=${counts.reading}/15 seven=${counts.seven}/5 ` +
  `cloze=${counts.cloze}/15 grammar=${counts.grammar}/10 ` +
  `(leftover reading=${reading.length} cloze=${cloze.length})`
)
