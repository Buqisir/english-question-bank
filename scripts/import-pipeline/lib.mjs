/**
 * lib.mjs — Parameterized, detection-based paper split library.
 *
 * Exports:
 *   buildGroups(fullText, paperId)
 *     -> { paper, readingGroups, seven, cloze, grammar, application, continuation }
 *
 *   buildReadingAnalysisMessagesFn(paper, group)
 *     -> [{role:'system',content},{role:'user',content}]
 *     ANSWER-GUIDED: passes real answerKey (un-blanked). Mirrors gen-reading-messages.mjs.
 *
 * Detection strategy (NO hardcoded 大题 numbers):
 *   Format A (2024-i, 2025-i): 一、听力 / 二、阅读理解 / 三、完形填空 / 四、语法填空 / 五、 / 六、
 *   Format B (2020-2023, 2024-ii, 2025-ii): 第X部分 阅读/语言运用/写作 with 第一节/第二节 sub-sections.
 *
 *   - Reading section: keyword-detected; sub-questions with (1)(2)... A-D options = reading A/B/C/D
 *   - Seven-choices: passage whose A-G option block ends with 【答案】[[...]]
 *   - Cloze: wide-spaced bare numbers + per-blank A-D options
 *   - Grammar: (N) inline blanks + optional (hint) + one 【答案】 line (；-separated) OR per-blank 【答案】
 *   - Application: first 节 of 写作 part
 *   - Continuation: second 节 of 写作 part
 *
 * Score annotation stripping:
 *   Strips (X分) / （X分）where X is digits/decimal, on section headers, big-question starts,
 *   sub-question lines. Does NOT strip (word) / (English phrase) / (CJK phrase) parens.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePassageText } from '../../server/paper-import-ai/normalizePassageText.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const readingPromptPath = path.join(rootDir, 'prompts/reading-choice-analysis-v1.md')

// ---- Utility ----------------------------------------------------------------

const pad = (n) => String(n).padStart(3, '0')

/** Split on ideographic spaces (full-width CJK indent), filter empty. */
const splitParas = (text) =>
  text
    .split(/[　、]+/)
    .map((t) => t.replace(/[　、]/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)

/** paperTail = paperId without 'paper-' prefix, non-alnum -> '-', lowercase */
function paperTail(paperId) {
  return paperId.replace(/^paper-/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

/**
 * Strip score-only annotations from a string.
 * Only removes parens whose trimmed content consists SOLELY of digits/decimal + 分.
 * Examples removed: (7.5分) (10分) （2.5分）
 * NOT removed: (刹车) (排挡) (engineer) (2.5-hour tour) (完成) (56)
 * Also removes multi-word patterns: (共N小题；每小题X分，满分Y分) type headers
 */
function stripScoreAnnotations(s) {
  // Half-width parens: content must be purely digits/decimal + 分, with optional leading spaces
  s = s.replace(/\(\d+(?:\.\d+)?分\)/g, '')
  // Full-width parens: same rule
  s = s.replace(/（\d+(?:\.\d+)?分）/g, '')
  // Multi-word header patterns: (共N小题...) or （共...满分...）
  s = s.replace(/[（(]共[^）)]*[分）)]/g, '')
  return s.trim()
}

/**
 * Strip big-question number prefix from a line.
 * Handles: "18.  text", "6.(15分)　　text", "1.(7.5分)　　text", "13."
 * Two-step: first strip the digit+dot, then strip any leading score annotation.
 */
function stripBigQPrefix(s) {
  // Step 1: strip leading digits + optional dot/paren + whitespace
  let r = s.replace(/^\d+[.)]*\s*/, '')
  // Step 2: strip leading score annotation if present (e.g. "(15分)" or "（7.5分）")
  r = r.replace(/^[（(]\d+(?:\.\d+)?分[）)]\s*[　]*/, '')
  return r
}

/** Backward-compat alias used internally. */
function stripScore(s) {
  return stripScoreAnnotations(s)
}

/** Parse 4 A-D options from a concatenated options string. */
function splitOptions(s) {
  const out = {}
  const re = /([A-D])[．.]\s*(.*?)(?=[A-D][．.]|$)/g
  let m
  while ((m = re.exec(s))) out[m[1]] = m[2].trim()
  return out
}

// ---- Format detection -------------------------------------------------------

/**
 * Detect paper format from lines.
 * Format A: has lines starting with 一、阅读理解 / 二、阅读理解 / 三、完形填空 etc.
 * Format B: has lines starting with 第X部分
 */
function detectFormat(lines) {
  for (const l of lines) {
    const t = l.trim()
    if (/^[一二三四五六七八九十]、/.test(t)) return 'A'
    if (/^第[一二三四五六七八九十]+部分/.test(t)) return 'B'
  }
  return 'A' // default
}

// ---- Section extraction helpers --------------------------------------------

/**
 * Find the first line index matching a pattern.
 */
function findSectionLine(lines, pattern) {
  return lines.findIndex((l) => pattern.test(l.trim()))
}

/** Extract text between two section line indices (exclusive of start line). */
function sectionText(lines, from, to) {
  const end = to === -1 ? lines.length : to
  return lines.slice(from, end).join('\n')
}

/**
 * Find the Nth occurrence of a pattern in lines[from..to], return line index.
 * n is 1-based.
 */
function findNthMatch(lines, from, to, pattern, n) {
  let count = 0
  for (let i = from; i < to; i++) {
    if (pattern.test(lines[i].trim())) {
      count++
      if (count === n) return i
    }
  }
  return -1
}

// ---- Big-question start detection -------------------------------------------

/**
 * Does this line start a new 大题 (big question)?
 * Matches: "11.  text", "1.(7.5分)  text", "18.  （1）text"
 * After stripping score annotations: must start with digits + dot (or digits alone on line).
 * Does NOT match: "(1) What...", "A．", "【答案】"
 */
function isBigQStart(line) {
  const t = stripScoreAnnotations(line.trim())
  return /^\d+[.(]/.test(t) || /^\d+\s*$/.test(t)
}

/**
 * Find all big-question start indices within lines[from..to].
 * Returns [{lineIdx, no}]
 */
function findBigQuestions(lines, from, to) {
  const results = []
  for (let i = from; i < to; i++) {
    const l = lines[i].trim()
    if (isBigQStart(l)) {
      const m = l.match(/^(\d+)/)
      if (m) results.push({ lineIdx: i, no: Number(m[1]) })
    }
  }
  return results
}

// ---- Format A section detection --------------------------------------------

/**
 * Find Format A section boundaries.
 * Returns {readingStart, sevenSubStart, clozeStart, grammarStart, appStart, contStart}
 * sevenSubStart is -1 for Format A (we detect seven by content, not by section header).
 */
function findFormatASections(lines) {
  const readingStart = findSectionLine(lines, /^二、阅读理解/)
  const clozeStart = findSectionLine(lines, /^三、完形填空/)
  const grammarStart = findSectionLine(lines, /^四、语法填空/)
  const appStart = findSectionLine(lines, /^五、/)
  const contStart = findSectionLine(lines, /^六、/)

  if (readingStart === -1) throw new Error('Format A: 未找到 二、阅读理解 节')
  if (clozeStart === -1) throw new Error('Format A: 未找到 三、完形填空 节')
  if (grammarStart === -1) throw new Error('Format A: 未找到 四、语法填空 节')
  if (appStart === -1) throw new Error('Format A: 未找到 五、(写作) 节')
  if (contStart === -1) throw new Error('Format A: 未找到 六、(书面表达) 节')

  return { readingStart, sevenSubStart: -1, clozeStart, grammarStart, appStart, contStart }
}

// ---- Format B section detection --------------------------------------------

/**
 * Find Format B section boundaries.
 *
 * Part-level: 第X部分 阅读 / 第X部分 语言运用 / 第X部分 写作
 * Sub-section-level within each part: 第一节 / 第二节
 *
 * Returns {readingStart, sevenSubStart, clozeStart, grammarStart, appStart, contStart}
 *
 * readingStart: line of 第X部分 阅读 (or the 第一节 immediately after it)
 * sevenSubStart: line of the 第二节 within the reading part (= seven-choices sub-section)
 * clozeStart: line of the 第一节 within 语言运用 part
 * grammarStart: line of the 第二节 within 语言运用 part
 * appStart: line of the 第一节 within 写作 part
 * contStart: line of the 第二节 within 写作 part
 */
function findFormatBSections(lines) {
  const total = lines.length

  // -- Part-level boundaries --
  // Reading part: keyword 阅读 (not 听力)
  const readingParIdx = findSectionLine(
    lines,
    /^第[一二三四五六七八九十]+部分[\s　]*阅/
  )
  // 语言运用 part
  const langParIdx = findSectionLine(
    lines,
    /^第[一二三四五六七八九十]+部分[\s　]*语言运用/
  )
  // 写作 part
  const writingParIdx = findSectionLine(
    lines,
    /^第[一二三四五六七八九十]+部分[\s　]*写作/
  )

  if (readingParIdx === -1) throw new Error('Format B: 未找到 第X部分 阅读 节')
  if (langParIdx === -1) throw new Error('Format B: 未找到 第X部分 语言运用 节')
  if (writingParIdx === -1) throw new Error('Format B: 未找到 第X部分 写作 节')

  // Sub-section pattern: 第一节 or 第二节 (not 第一部分/第二部分)
  const subSecPat = /^第[一二三四五六七八九十]+节[（(]?/

  // -- Within reading part: find 第二节 (seven-choices sub-section) --
  const sevenSubStart = findNthMatch(lines, readingParIdx + 1, langParIdx, subSecPat, 2)
  if (sevenSubStart === -1) throw new Error('Format B: 阅读部分未找到第二节(七选五)')

  // -- Within 语言运用 part: find 第一节 (cloze) and 第二节 (grammar) --
  const clozeStart = findNthMatch(lines, langParIdx + 1, writingParIdx, subSecPat, 1)
  const grammarStart = findNthMatch(lines, langParIdx + 1, writingParIdx, subSecPat, 2)
  if (clozeStart === -1) throw new Error('Format B: 语言运用部分未找到第一节(完形填空)')
  if (grammarStart === -1) throw new Error('Format B: 语言运用部分未找到第二节(语法填空)')

  // -- Within 写作 part: find 第一节 (application) and 第二节 (continuation) --
  const appStart = findNthMatch(lines, writingParIdx + 1, total, subSecPat, 1)
  const contStart = findNthMatch(lines, writingParIdx + 1, total, subSecPat, 2)
  if (appStart === -1) throw new Error('Format B: 写作部分未找到第一节(应用文)')
  if (contStart === -1) throw new Error('Format B: 写作部分未找到第二节(续写)')

  // readingStart: use the first 第一节 within the reading part (before sevenSubStart)
  const readingStart = findNthMatch(lines, readingParIdx + 1, sevenSubStart, subSecPat, 1)

  return {
    readingStart: readingStart !== -1 ? readingStart : readingParIdx,
    sevenSubStart,
    clozeStart,
    grammarStart,
    appStart,
    contStart,
  }
}

// ---- Reading + Seven-Choices split ------------------------------------------

/**
 * Does a block of lines contain an A-G option bank (七选五)?
 * Looks for a line with A．...G．... or separate A. B. C. D. E. F. G. labels.
 */
function hasSevenOptionBank(blockLines) {
  const joined = blockLines.join(' ')
  // Must have at least 7 options A through G
  return /A[．.].+G[．.]/.test(joined) || (joined.includes('A．') && joined.includes('G．'))
}

/**
 * Does a block of lines contain standard 4-option reading questions?
 * Looks for (1) ... A. B. C. D. sub-question structure.
 */
function hasReadingQuestions(blockLines) {
  const joined = blockLines.join(' ')
  return /\(\d+\)\s*/.test(joined) && /[A-D][．.]\s*[A-Z]/.test(joined)
}

/**
 * Build one reading group (A/B/C/D) from a block of lines.
 * Questions are sub-numbered (1), (2), etc. in the block; renumbered to stdStart..
 */
function buildReadingGroup({ blockLines, groupLetter, tail, stdStart }) {
  const joined = blockLines.join('\n')

  // Passage text: everything before the first (1) sub-question.
  // Sub-question starts: (N) or (N) (score) then an uppercase letter or CJK.
  const firstSubQ = joined.search(/\(\d+\)\s*(?:\(\d+(?:\.\d+)?分\))?\s*[A-Z一-鿿"]/)
  let passageRaw = firstSubQ !== -1 ? joined.slice(0, firstSubQ) : joined
  let afterPassage = firstSubQ !== -1 ? joined.slice(firstSubQ) : ''

  // Clean the leading big-question number and score annotation from passage
  // Use same two-step approach: strip leading \d+[.]* then strip score annotation
  passageRaw = passageRaw.replace(/^\d+[.)]*\s*(?:[（(]\d+(?:\.\d+)?分[）)])?\s*[　]*/, '')

  const paragraphs = splitParas(passageRaw)
    .filter((t) => t.length > 1 && !isScoreOnlyFragment(t))
    .map((text, k) => ({ id: `para-${tail}-reading-${groupLetter}-${k + 1}`, text: normalizePassageText(text) }))

  // Parse sub-questions
  const questions = []
  let cur = null
  let qNo = stdStart

  for (const rawLine of afterPassage.split('\n')) {
    const line = rawLine.trim()
    // Strip score annotation from sub-question line before matching
    const lineNoScore = stripScoreAnnotations(line)
    const qm = lineNoScore.match(/^\((\d+)\)\s*(.*)$/)
    const am = line.match(/^【答案】\s*([A-D])/)

    if (qm) {
      if (cur) questions.push(cur)
      cur = { subNo: Number(qm[1]), stem: qm[2].trim(), optionsRaw: '', answerKey: '', stdNo: qNo++ }
      continue
    }
    if (!cur) continue
    if (am) {
      cur.answerKey = am[1]
      continue
    }
    if (/[A-D][．.]/.test(line)) {
      cur.optionsRaw += (cur.optionsRaw ? ' ' : '') + line
    } else if (line && !/^【/.test(line)) {
      cur.stem += ' ' + lineNoScore
    }
  }
  if (cur) questions.push(cur)

  return {
    groupId: `group-${tail}-reading-${groupLetter}`,
    title: `Reading ${groupLetter.toUpperCase()}`,
    order: ['a', 'b', 'c', 'd'].indexOf(groupLetter),
    paragraphs,
    questions: questions.map((q) => ({
      id: `q-${tail}-${pad(q.stdNo)}`,
      questionNo: String(q.stdNo),
      stem: q.stem.trim(),
      options: splitOptions(q.optionsRaw),
      answerKey: q.answerKey,
    })),
  }
}

/**
 * Is a text fragment a bare score annotation (should be filtered from passage paragraphs)?
 * E.g. "(7.5分)" or "7.5分" alone.
 */
function isScoreOnlyFragment(t) {
  return /^[（(]?\d+(?:\.\d+)?分[）)]?$/.test(t.trim())
}

/**
 * Build the seven-choices group from a block of lines.
 * Blank markers (1)-(5) -> __36__-__40__.
 */
function buildSevenGroup({ blockLines, tail, stdStart = 36 }) {
  const joined = blockLines.join('\n')

  // Find option bank: A．...G．...
  const optLineMatch = joined.match(/A[．.]\s*[\s\S]*?G[．.][^\n【]*/)?.[0] || ''

  // Answer: 【答案】[["..."]] or 【答案】[[...]]
  const ansMatch = joined.match(/【答案】\s*(\[\[[\s\S]*?\]\])/)
  if (!ansMatch) throw new Error('七选五: 未找到 【答案】 答案数组')
  const answers = JSON.parse(ansMatch[1].replace(/[""]/g, '"'))[0]

  // Passage: everything before the option bank
  let passageEnd = optLineMatch ? joined.indexOf(optLineMatch.slice(0, 4)) : joined.indexOf('A．')
  if (passageEnd === -1) passageEnd = joined.length
  let passage = joined.slice(0, passageEnd)

  // Strip leading big-question number + score annotation + instruction text
  passage = passage.replace(/^\d+(?:\(\d+(?:\.\d+)?分\))?[.)\s]+[^　]*?(?=　　|[A-Z]|$)/m, '')
  // Also strip leading section header lines (Format B 第二节... line may appear at top)
  passage = passage.replace(/^第[一二三四五六七八九十]+节[^\n]*\n?/m, '')

  // Replace (1)-(5) blank markers with __<stdStart>__..__<stdStart+4>__
  passage = passage.replace(/\((\d)\)/g, (_, n) => `__${Number(n) + (stdStart - 1)}__`)

  const paragraphs = splitParas(passage)
    .filter((t) => t.length > 1 && !isScoreOnlyFragment(t))
    .map((t, i) => ({
      id: `para-${tail}-seven-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(t),
    }))

  const optionBank = [...optLineMatch.matchAll(/([A-G])[．.]\s*(.*?)(?=[A-G][．.]|$)/g)].map((m) => ({
    label: m[1],
    text: normalizePassageText(m[2].trim()),
  }))

  const questions = Array.from({ length: 5 }, (_, i) => {
    const no = stdStart + i
    return {
      id: `q-${tail}-${pad(no)}`,
      stem: String(no),
      answerKey: answers[i],
      blankId: `blank-${tail}-${pad(no)}`,
    }
  })

  return {
    groupId: `group-${tail}-seven-choices`,
    groupType: 'sevenChoices',
    title: '七选五',
    order: 4,
    paragraphs,
    optionBank,
    questions,
    blankIds: questions.map((q) => q.blankId),
  }
}

// ---- Cloze ------------------------------------------------------------------

/**
 * Wide-spaced bare digits = blank markers. Handle mixed \xa0 + regular spaces.
 * The pattern \s{2,}(\d{1,2})\s{2,} where \s includes \xa0.
 * Real numbers like 52.4 or 100 are NOT bare (they follow digits without space).
 */
function buildCloze({ sectionText: txt, tail, stdStart = 41 }) {
  const offset = stdStart - 1
  // Strip Format A/B section headers and big-question prefix
  let body = txt
    // Format A: strip 三、完形填空 header
    .replace(/三、完形填空\s*/m, '')
    // Format B: strip 第X节... sub-section header line
    .replace(/^第[一二三四五六七八九十]+节[^\n]*\n?/m, '')

  // Strip leading big-question number + score annotation using two-step stripBigQPrefix
  // The big-question line may embed the entire passage, so just strip the prefix part
  body = body.replace(/^(\d+[.)]*\s*(?:[（(]\d+(?:\.\d+)?分[）)])?\s*[　]*)/, (m) => {
    return '' // strip the number+score prefix only
  })

  // Find where options block starts: first (1) followed by A.
  // Options can have score annotation: (1) (1分)  A．
  const firstOptIdx = body.search(/\(\d+\)\s*(?:\(\d+(?:\.\d+)?分\))?\s*A[．.]/)
  let passage = firstOptIdx !== -1 ? body.slice(0, firstOptIdx) : body
  const optBlock = firstOptIdx !== -1 ? body.slice(firstOptIdx) : ''

  // Parse questions FIRST so we learn the real blank count (新课标 15 / 浙江老卷 20).
  // Match: (N) optional_score A. text B. text C. text D. text 【答案】X
  const questions = []
  const re = /\((\d{1,2})\)\s*(?:\(\d+(?:\.\d+)?分\))?\s*A[．.]\s*(.*?)\s*B[．.]\s*(.*?)\s*C[．.]\s*(.*?)\s*D[．.]\s*(.*?)\s*【答案】\s*([A-D])/gs
  let m
  while ((m = re.exec(optBlock))) {
    const local = Number(m[1])
    const no = local + offset
    questions.push({
      id: `q-${tail}-${pad(no)}`,
      stem: String(no),
      answerKey: m[6],
      blankId: `blank-${tail}-${pad(no)}`,
      options: {
        A: normalizePassageText(m[2].trim()),
        B: normalizePassageText(m[3].trim()),
        C: normalizePassageText(m[4].trim()),
        D: normalizePassageText(m[5].trim()),
      },
    })
  }
  const blankCount = questions.length

  // Replace wide-spaced bare numbers (blanks) -> __<stdStart>__.. using the real count.
  // \xa0 is U+00A0, treat as whitespace for blank detection
  passage = passage.replace(/([\s\xa0]{2,})(\d{1,2})([\s\xa0]{2,})/g, (m, before, n, after) => {
    const num = Number(n)
    if (num >= 1 && num <= blankCount) return ` __${num + offset}__ `
    return m // not a cloze blank
  })

  const paragraphs = splitParas(passage)
    .filter((t) => t.length > 1 && !isScoreOnlyFragment(t))
    .map((t, i) => ({
      id: `para-${tail}-cloze-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(t),
    }))

  return {
    groupId: `group-${tail}-cloze`,
    groupType: 'cloze',
    title: '完形填空',
    order: 5,
    paragraphs,
    questions,
    blankIds: questions.map((q) => q.blankId),
  }
}

// ---- Grammar Fill -----------------------------------------------------------

function buildGrammar({ sectionText: txt, tail }) {
  let body = txt
    // Format A: strip 四、语法填空 header
    .replace(/四、语法填空\s*/m, '')
    // Format B: strip 第X节... sub-section header line
    .replace(/^第[一二三四五六七八九十]+节[^\n]*\n?/m, '')
    // Strip leading big-question number + score annotation (two-step)
    .replace(/^\d+[.)]*\s*(?:[（(]\d+(?:\.\d+)?分[）)])?\s*[　]*/, '')
    // Strip standard grammar instruction sentence
    .replace(/^阅读下面短文[^。\n]*[。\n]\s*/m, '')

  // Find answer section
  // Format 1 (most papers): single 【答案】 line with ；-separated answers
  // Format 2 (2020-i, 2020-ii): per-blank (N) lines with individual 【答案】word

  // Detect which format: does it have multiple 【答案】 lines in what looks like a per-blank section?
  const answerLines = [...body.matchAll(/【答案】\s*(.+)/g)].map(m => m[1].trim())

  let answers
  let passage

  if (answerLines.length >= 9) {
    // Format 2: per-blank individual answers
    // Each blank is: "  (N)  \n  【答案】word\n"
    // Collect answers in order of their (N) appearance
    const perBlankAnswers = []
    const perBlankRe = /\(\d+\)[\s\xa0]*\n[\s\xa0]*【答案】\s*([^\n]+)/g
    let pm
    while ((pm = perBlankRe.exec(body))) {
      perBlankAnswers.push(pm[1].trim().replace(/[。．.]+$/, ''))
    }

    if (perBlankAnswers.length >= 9) {
      answers = perBlankAnswers
      // Passage is everything before the first per-blank answer block
      // Find where the standalone (1) blank lines start
      const firstBlankLine = body.search(/\n[\s\xa0]*\(1\)[\s\xa0]*\n/)
      passage = firstBlankLine !== -1 ? body.slice(0, firstBlankLine) : body.slice(0, body.indexOf('【答案】'))
    } else {
      // Fallback: try single-line format
      const ansLineMatch = body.match(/【答案】\s*(.+)$/m)
      if (!ansLineMatch) throw new Error('语法填空: 未找到 【答案】 行')
      answers = ansLineMatch[1].trim().split(/[；;]/).map((a) => a.trim().replace(/[，,、]/g, '/'))
      passage = body.slice(0, body.indexOf('【答案】'))
    }
  } else {
    // Format 1: single-line ；-separated answer
    const ansLineMatch = body.match(/【答案】\s*(.+)$/m)
    if (!ansLineMatch) throw new Error('语法填空: 未找到 【答案】 行')
    const ansLine = ansLineMatch[1].trim()
    answers = ansLine.split(/[；;]/).map((a) => a.trim().replace(/[，,、]/g, '/'))
    passage = body.slice(0, body.indexOf('【答案】'))
  }

  const hints = {}
  // Capture (N) optionally followed by a parenthesized hint word (ASCII letters only)
  passage = passage.replace(/\((\d{1,2})\)\s*(?:\(([A-Za-z][^)]*)\))?/g, (_, n, hint) => {
    const no = Number(n) + 55
    if (hint) hints[no] = hint.trim()
    return `__${no}__${hint ? ` (${hint.trim()})` : ''}`
  })

  const paragraphs = splitParas(passage)
    .filter((t) => t.length > 1 && !isScoreOnlyFragment(t))
    .map((t, i) => ({
      id: `para-${tail}-grammar-fill-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(t),
    }))

  const questions = [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no, i) => ({
    id: `q-${tail}-${pad(no)}`,
    stem: String(no),
    answerKey: answers[i] || '',
    blankId: `blank-${tail}-${pad(no)}`,
    prompt: hints[no] || null,
  }))

  return {
    groupId: `group-${tail}-grammar-fill`,
    groupType: 'grammarFill',
    title: '语法填空',
    order: 6,
    paragraphs,
    questions,
    blankIds: questions.map((q) => q.blankId),
  }
}

// ---- Application ------------------------------------------------------------

function buildApplication({ sectionText: txt, tail }) {
  let body = txt
    // Format A: strip 五、书信写作 header
    .replace(/五、书信写作\s*/m, '')
    // Format B: strip 第X节 header
    .replace(/^第[一二三四五六七八九十]+节[^\n]*\n?/m, '')
    // Strip leading big-question number + score annotation (two-step)
    .replace(/^\d+[.)]*\s*(?:[（(]\d+(?:\.\d+)?分[）)])?\s*[　]*/, '')

  // Drop answer section
  const ansIdx = body.indexOf('【答案】')
  if (ansIdx !== -1) body = body.slice(0, ansIdx)

  // Drop blank lines / form lines
  body = body.replace(/_{5,}/g, '')

  const paragraphs = splitParas(body)
    .filter((t) => t.length > 4 && !isScoreOnlyFragment(t))
    .map((t, i) => ({
      id: `para-${tail}-writing-app-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(t),
    }))

  return {
    groupId: `group-${tail}-writing-application`,
    groupType: 'writing',
    title: '应用文写作',
    order: 7,
    paragraphs,
    applicationGiven: null,
    questions: [],
  }
}

// ---- Continuation -----------------------------------------------------------

/**
 * Detect continuation starters by four strategies (tried in order):
 * 1. "Para(graph|gragh) N：/: <sentence>" (Format A 2024/2025, Format B 2021-ii/2022/2024-ii)
 * 2. "(N) English sentence" scattered through body including across 【答案】 blocks (2020-i format)
 * 3. Sentences between underscore separator lines after 注意 (2021-i, 2023-i/ii, 2025-ii)
 * 4. Sentences separated by ideographic spaces in 注意 section (2020-ii format)
 */
function buildContinuation({ sectionText: txt, tail }) {
  let body = txt
    // Format A: strip 六、书面表达 header
    .replace(/六、书面表达\s*/m, '')
    // Format B: strip 第X节 header
    .replace(/^第[一二三四五六七八九十]+节[^\n]*\n?/m, '')
    // Strip leading big-question number + score annotation (two-step)
    .replace(/^\d+[.)]*\s*(?:[（(]\d+(?:\.\d+)?分[）)])?\s*[　]*/, '')

  // bodyBeforeAns: everything before the FIRST 【答案】 (for material/notice extraction)
  const firstAnsIdx = body.indexOf('【答案】')
  const bodyBeforeAns = firstAnsIdx !== -1 ? body.slice(0, firstAnsIdx) : body

  // Strategy 1: Para(graph|gragh) N：sentence — handles both spellings
  let starters = [...body.matchAll(/Para(?:graph|gragh)\s*\d+[：:]\s*([^_\n　]{10,}?)(?=\s*_{3,}|\s*Para(?:graph|gragh)|\n|$)/g)]
    .map((m) => m[1].trim())
    .filter(Boolean)

  // Strategy 2: (N) English sentence (2020-i format — starters interleaved with answers)
  if (starters.length < 2) {
    const numberedStarters = [...body.matchAll(/^\(([12])\)\s+([A-Z][^。\n（(]{10,})/gm)]
      .filter(m => !/续写词数|注意|答题卡|写作词数|请按如下/.test(m[2]))
      .map(m => m[2].trim())
    if (numberedStarters.length >= 2) {
      starters = numberedStarters.slice(0, 2)
    }
  }

  // Strategy 3: sentences between underscore blocks after 注意 (2021-i, 2023-i/ii, 2025-ii)
  if (starters.length < 2) {
    const noticeIdx = bodyBeforeAns.search(/注意[：:]/)
    const afterNotice = noticeIdx !== -1 ? bodyBeforeAns.slice(noticeIdx) : bodyBeforeAns

    const underscoreFragments = afterNotice
      .split(/_{5,}/)
      .map((seg) =>
        splitParas(seg)
          .filter((t) => t.length > 10 && !/注意|续写词数|答题卡|写作词数|请按如下|^\d+[.．]/.test(t))
          .join(' ')
      )
      .filter(Boolean)

    if (underscoreFragments.length >= 2) {
      starters = underscoreFragments.slice(0, 2)
    }
  }

  // Strategy 4: ideographic-space split in 注意 section (2020-ii format)
  if (starters.length < 2) {
    const noticeIdx = bodyBeforeAns.search(/注意[：:]/)
    const afterNotice = noticeIdx !== -1 ? bodyBeforeAns.slice(noticeIdx) : bodyBeforeAns
    const ideoFragments = splitParas(afterNotice)
      .filter((t) => t.length > 10 && !/注意|续写词数|答题卡|写作词数|请按如下|^\d+[.．]/.test(t))
    if (ideoFragments.length >= 2) {
      starters = ideoFragments.slice(0, 2)
    }
  }

  // Material: everything before 注意 section (for passage paragraphs)
  const noticeIdx = bodyBeforeAns.search(/注意[：:]/)
  const material = noticeIdx !== -1 ? bodyBeforeAns.slice(0, noticeIdx) : bodyBeforeAns

  // Clean underscores from material
  const cleanMaterial = material.replace(/_{5,}/g, '')

  const paragraphs = splitParas(cleanMaterial)
    .filter((t) => t.length > 4 && !isScoreOnlyFragment(t))
    .map((t, i) => ({
      id: `para-${tail}-writing-cont-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(t),
    }))

  return {
    groupId: `group-${tail}-writing-continuation`,
    groupType: 'writing',
    title: '读后续写',
    order: 8,
    paragraphs,
    continuationStarters: starters,
    questions: [],
  }
}

// ---- Main buildGroups -------------------------------------------------------

/**
 * Build all groups from full DOCX-converted text.
 * @param {string} fullText - output of textutil -convert txt
 * @param {string} paperId  - e.g. 'paper-2024-i'
 * @returns {{ paper, readingGroups, seven, cloze, grammar, application, continuation }}
 */
export function buildGroups(fullText, paperId) {
  const tail = paperTail(paperId)
  const lines = fullText.split('\n')

  const paper = {
    paperId,
    sourceFilename: '',
    sourceHash: 'pending',
    sourceAssetVersion: 1,
  }

  // Detect format and find section boundaries
  const fmt = detectFormat(lines)
  const sections =
    fmt === 'A' ? findFormatASections(lines) : findFormatBSections(lines)

  const { readingStart, sevenSubStart, clozeStart, grammarStart, appStart, contStart } = sections

  // ---- Reading section analysis ----
  // For Format A: reading lines go from readingStart+1 to clozeStart
  // For Format B: reading A-D lines go from readingStart+1 to sevenSubStart
  //               seven lines go from sevenSubStart to clozeStart (= langParIdx)
  let readingEnd, sevenEnd

  if (fmt === 'A') {
    readingEnd = clozeStart
    sevenEnd = clozeStart
  } else {
    // Find the 语言运用 part line (= where seven-choices ends)
    readingEnd = sevenSubStart
    // seven-choices extends from sevenSubStart to clozeStart (which is the first 第X节 of 语言运用)
    // But clozeStart is the 第一节 within 语言运用, so we need the 语言运用 部分 line as the end
    // Actually: sevenSubStart to clozeStart works because clozeStart is WITHIN 语言运用
    sevenEnd = clozeStart
  }

  // Reading lines (A-D passages only)
  const readingLines = lines.slice(readingStart + 1, readingEnd)
  // Seven-choices lines
  const sevenLines = fmt === 'A'
    ? null // detect within reading block for Format A
    : lines.slice(sevenSubStart + 1, sevenEnd)

  // Find all big-questions in the reading section
  const bigQs = findBigQuestions(readingLines, 0, readingLines.length)

  // Extract blocks for each big-question
  const readingGroups = []
  const sevenGroup_raw = []
  let readingStdNo = 21
  const readingLetters = ['a', 'b', 'c', 'd']
  let readingIdx = 0

  if (fmt === 'A') {
    // For Format A: both reading and seven are in readingLines; detect by content
    for (let qi = 0; qi < bigQs.length; qi++) {
      const { lineIdx, no } = bigQs[qi]
      const nextLineIdx = qi + 1 < bigQs.length ? bigQs[qi + 1].lineIdx : readingLines.length
      const blockLines = readingLines.slice(lineIdx, nextLineIdx)

      if (hasSevenOptionBank(blockLines)) {
        const seven = buildSevenGroup({ blockLines, tail, stdStart: readingStdNo })
        sevenGroup_raw.push(seven)
      } else if (hasReadingQuestions(blockLines)) {
        const letter = readingLetters[readingIdx]
        if (!letter) throw new Error(`阅读理解: 发现超过4篇阅读文章 (第${readingIdx + 1}篇)`)
        const group = buildReadingGroup({ blockLines, groupLetter: letter, tail, stdStart: readingStdNo })
        readingStdNo += group.questions.length
        readingGroups.push(group)
        readingIdx++
      }
    }
  } else {
    // For Format B: reading A-D passages are in readingLines (sevenSubStart is the boundary)
    for (let qi = 0; qi < bigQs.length; qi++) {
      const { lineIdx, no } = bigQs[qi]
      const nextLineIdx = qi + 1 < bigQs.length ? bigQs[qi + 1].lineIdx : readingLines.length
      const blockLines = readingLines.slice(lineIdx, nextLineIdx)

      if (hasReadingQuestions(blockLines)) {
        const letter = readingLetters[readingIdx]
        if (!letter) throw new Error(`阅读理解: 发现超过4篇阅读文章 (第${readingIdx + 1}篇)`)
        const group = buildReadingGroup({ blockLines, groupLetter: letter, tail, stdStart: readingStdNo })
        readingStdNo += group.questions.length
        readingGroups.push(group)
        readingIdx++
      }
    }

    // Seven-choices: parse from sevenLines
    if (sevenLines && sevenLines.length > 0) {
      const sevenBigQs = findBigQuestions(sevenLines, 0, sevenLines.length)
      if (sevenBigQs.length > 0) {
        const { lineIdx: sLineIdx } = sevenBigQs[0]
        const sevenBlockLines = sevenLines.slice(sLineIdx)
        sevenGroup_raw.push(buildSevenGroup({ blockLines: sevenBlockLines, tail, stdStart: readingStdNo }))
      } else {
        // No explicit big-question number — use whole sevenLines block
        sevenGroup_raw.push(buildSevenGroup({ blockLines: sevenLines, tail, stdStart: readingStdNo }))
      }
    }
  }

  if (sevenGroup_raw.length !== 1) throw new Error(`七选五: 期望找到1组, 实际找到${sevenGroup_raw.length}组`)
  const seven = sevenGroup_raw[0]

  // ---- Cloze ---- (题号接力: 阅读末题+1 跳过七选五5题)
  const clozeSec = sectionText(lines, clozeStart, grammarStart)
  const cloze = buildCloze({ sectionText: clozeSec, tail, stdStart: readingStdNo + 5 })

  // ---- Grammar ----
  const grammarSec = sectionText(lines, grammarStart, appStart)
  const grammar = buildGrammar({ sectionText: grammarSec, tail })

  // ---- Application ----
  const appSec = sectionText(lines, appStart, contStart)
  const application = buildApplication({ sectionText: appSec, tail })

  // ---- Continuation ----
  const contSec = sectionText(lines, contStart, -1)
  const continuation = buildContinuation({ sectionText: contSec, tail })

  return { paper, readingGroups, seven, cloze, grammar, application, continuation }
}

// ---- Reading answer-guided message builder ----------------------------------

/**
 * Build ANSWER-GUIDED reading analysis messages.
 * Mirrors gen-reading-messages.mjs but as an exported function.
 * Passes real answerKey (not blanked) per locked plan decision.
 */
export function buildReadingAnalysisMessages({ paper, group }) {
  const systemPrompt = readFileSync(readingPromptPath, 'utf8')

  const sourceAssetVersion = Number(paper.sourceAssetVersion || 1) || 1
  const paragraphIds = group.paragraphs.map((p) => p.id)
  const questionIds = group.questions.map((q) => q.id)

  const promptInput = {
    paper: {
      paperId: paper.paperId,
      sourceFilename: paper.sourceFilename || '',
      sourceHash: paper.sourceHash || '',
      sourceAssetVersion,
    },
    targetGroups: [group.groupId],
    content: {
      groups: {
        [group.groupId]: {
          groupId: group.groupId,
          groupType: 'reading',
          title: group.title || 'Reading',
          order: Number(group.order || 0),
          passage: {
            title: group.title || 'Reading',
            paragraphIds,
            paragraphs: group.paragraphs.map((p) => ({ paragraphId: p.id, text: p.text })),
          },
          questionIds,
        },
      },
      questions: Object.fromEntries(
        group.questions.map((q) => [
          q.id,
          { questionId: q.id, stem: q.stem, options: q.options },
        ])
      ),
    },
    // ANSWER-GUIDED: real official answer (not blanked)
    answerKey: Object.fromEntries(group.questions.map((q) => [q.id, q.answerKey])),
  }

  const user = [
    'Create exactly one reading-choice-analysis-v1 JSON object for the target group below.',
    'Return JSON text only. The first character must be { and the final character must be }.',
    'The answerKey provided is the OFFICIAL correct answer — your optionAnalysis MUST mark that option as `correct` and justify it from the passage.',
    '',
    'Structured input:',
    JSON.stringify(promptInput, null, 2),
  ].join('\n')

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: user },
  ]
}
