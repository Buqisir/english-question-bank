import { createHash } from 'node:crypto'
import path from 'node:path'
import mammoth from 'mammoth'
import { normalizePassageText } from './normalizePassageText.mjs'

const READING_LABELS = ['A', 'B', 'C', 'D']
const SEVEN_CHOICES_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const SEVEN_CHOICES_QUESTION_NOS = ['36', '37', '38', '39', '40']
const CLOZE_QUESTION_NOS = Array.from({ length: 15 }, (_, i) => String(41 + i))
const GRAMMAR_FILL_QUESTION_NOS = Array.from({ length: 10 }, (_, i) => String(56 + i))
const MAX_SKIPPED_RAW_LENGTH = 1600
const IMAGE_OPTION_PLACEHOLDER = '图片选项，需查看原卷'

function normalizeLine(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

function toLines(rawText) {
  return String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function derivePaperId(sourceFilename, sourceHash) {
  const baseName = path.basename(sourceFilename || 'paper.docx', path.extname(sourceFilename || 'paper.docx'))
  const year = String(baseName).match(/20\d{2}/)?.[0] || ''
  const slug = slugify(baseName)
  const tail = slug && /[a-z]/.test(slug) ? slug : [year, sourceHash.slice(0, 8)].filter(Boolean).join('-')
  return `paper-${tail || sourceHash.slice(0, 12)}`.replace(/--+/g, '-')
}

function tailFromPaperId(paperId) {
  return String(paperId || '').replace(/^paper-/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function classifySectionLine(line) {
  const text = normalizeLine(line)
  if (!text) return null
  if (/听力/.test(text)) return 'listening'
  if (/完形/.test(text)) return 'cloze'
  if (/语法填空|语言运用/.test(text)) return 'grammar_or_language'
  if (/写作|书面表达|续写/.test(text)) return 'writing'
  if (/七选五|短文后的选项|选项中有两项/.test(text)) return 'seven_choices'
  if (/阅读理解|阅读下列短文|第一节.*阅读|阅读\(共两节/.test(text)) return 'reading'
  return null
}

function sectionContextAt(lines, index) {
  let section = null
  for (let i = 0; i <= index; i += 1) {
    const next = classifySectionLine(lines[i])
    if (next) section = next
  }
  return section
}

function matchGroupMarker(line) {
  const text = normalizeLine(line)
  let match = text.match(/^([A-D])$/)
  if (match) return { label: match[1], title: '' }
  match = text.match(/^([A-D])篇(?:\s+(.+))?$/)
  if (match) return { label: match[1], title: normalizeLine(match[2] || '') }
  match = text.match(/^Passage\s*([A-D])(?:\s+(.+))?$/i)
  if (match) return { label: match[1].toUpperCase(), title: normalizeLine(match[2] || '') }
  return null
}

function findReadingMarkers(lines) {
  const markers = []
  for (let index = 0; index < lines.length; index += 1) {
    const marker = matchGroupMarker(lines[index])
    if (!marker) continue
    const section = sectionContextAt(lines, index)
    const isExplicitReadingMarker = /篇|Passage/i.test(lines[index])
    if (section !== 'reading' && !isExplicitReadingMarker) continue
    markers.push({ ...marker, index })
  }
  return markers
}

function isStopSectionLine(line) {
  const section = classifySectionLine(line)
  return section && section !== 'reading'
}

function safeRawText(lines) {
  return lines.join('\n').slice(0, MAX_SKIPPED_RAW_LENGTH)
}

function parseAnswerRanges(rawText) {
  const answers = new Map()
  const rangePattern = /(\d{1,2})\s*[-－]\s*(\d{1,2})\s*([A-G]{2,})/g
  for (const match of String(rawText || '').matchAll(rangePattern)) {
    const start = Number(match[1])
    const end = Number(match[2])
    const letters = match[3].trim().split('')
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue
    if (letters.length < end - start + 1) continue
    for (let offset = 0; offset <= end - start; offset += 1) {
      answers.set(String(start + offset), letters[offset])
    }
  }
  return answers
}

function parseGrammarFillAnswers(rawText) {
  const answers = new Map()
  const text = String(rawText || '')
  // Match individual answer lines or compact continuous answer blocks.
  // Answers are actual English words (not single letters).
  // Use greedy match with explicit terminator: next numbered answer, end-of-line, or Chinese text.
  const pattern = /(\d{2})\.\s+([^\d]+?)(?=\s*\d{2}\.\s+|\s*$|[一-鿿])/g
  let match
  while ((match = pattern.exec(text))) {
    const questionNo = String(Number(match[1]))
    if (!GRAMMAR_FILL_QUESTION_NOS.includes(questionNo)) continue
    let answer = match[2].trim()
    // Strip trailing Chinese explanation text.
    answer = answer.replace(/[一-鿿][^A-Za-z]*$/, '').trim()
    answer = answer.replace(/\s+/g, ' ')
    if (answer) answers.set(questionNo, answer)
  }
  return answers
}

function mergeAnswerMaps(...maps) {
  const merged = new Map()
  for (const map of maps) {
    for (const [questionNo, answer] of map.entries()) {
      if (!merged.has(questionNo)) merged.set(questionNo, answer)
    }
  }
  return merged
}

function questionStart(line) {
  const numbered = normalizeLine(line).match(/^(\d{1,2})[\.\uff0e、]\s*(.+)$/)
  if (numbered) return { questionNo: numbered[1], stem: normalizeLine(numbered[2]) }
  const chinese = normalizeLine(line).match(/^第\s*(\d{1,2})\s*题\s*(.+)$/)
  if (chinese) return { questionNo: chinese[1], stem: normalizeLine(chinese[2]) }
  return null
}

function compactOptionText(value) {
  return normalizeLine(value)
    .replace(/\s+第[一二三四五六七八九十]+(?:部分|节).*$/u, '')
    .replace(/[（(][^（）()]{1,80}[）)]\s*$/, '')
    .replace(/\s*[。；;:：]\s*$/, '')
    .trim()
}

function extractInlineOptions(blockText) {
  const normalized = String(blockText || '').replace(/\s+/g, ' ')
  const markerPattern = /(^|\s)([A-D])(?:([\.\uff0e、])|\s+(?=[A-Z“"']))/g
  const markers = []
  let match
  while ((match = markerPattern.exec(normalized))) {
    markers.push({
      label: match[2],
      markerStart: match.index + match[1].length,
      contentStart: markerPattern.lastIndex,
      isStrong: Boolean(match[3]),
    })
  }
  const selectedMarkers = selectOptionMarkers(markers)
  if (selectedMarkers.length < 2) return {}

  const options = {}
  for (let index = 0; index < selectedMarkers.length; index += 1) {
    const marker = selectedMarkers[index]
    const next = selectedMarkers[index + 1]
    const raw = normalized.slice(marker.contentStart, next ? next.markerStart : normalized.length)
    const text = compactOptionText(raw)
    if (text) options[marker.label] = text
  }
  if (
    selectedMarkers.length === READING_LABELS.length &&
    Object.keys(options).length === 0 &&
    selectedMarkers.every((marker) => marker.isStrong)
  ) {
    return Object.fromEntries(READING_LABELS.map((label) => [label, `${IMAGE_OPTION_PLACEHOLDER} ${label}`]))
  }
  return options
}

function selectOptionMarkers(markers) {
  const selected = []
  let previousStart = -1
  for (const label of READING_LABELS) {
    const candidates = markers.filter((marker) => marker.label === label && marker.markerStart > previousStart)
    const marker = candidates.find((item) => item.isStrong) || candidates[0]
    if (!marker) break
    selected.push(marker)
    previousStart = marker.markerStart
  }
  return selected
}

function extractAnalysisLineOption(line) {
  const match = normalizeLine(line).match(/^([A-D])[\.\uff0e、]\s*([^:：]+?)\s*(?:[（(][^（）()]*[）)])?\s*[:：]/)
  if (!match) return null
  return { label: match[1], text: compactOptionText(match[2]) }
}

function mergeAnalysisLineOptions(lines, options) {
  const next = { ...options }
  for (const line of lines) {
    const parsed = extractAnalysisLineOption(line)
    if (parsed?.text && !next[parsed.label]) {
      next[parsed.label] = parsed.text
    }
  }
  return next
}

function parseAnswerLine(lines) {
  for (const line of lines) {
    const match = normalizeLine(line).match(/^答案[:：]\s*([A-D])[\.\uff0e、]?\s*([^（(]+)?/)
    if (match) {
      return {
        answerKey: match[1],
        optionText: compactOptionText(match[2] || ''),
      }
    }
  }
  return null
}

function firstOptionIndex(lines) {
  return lines.findIndex((line) => /(^|\s)[A-D][\.\uff0e、]\s*/.test(normalizeLine(line)) || /^答案[:：]/.test(normalizeLine(line)))
}

function parseQuestionBlock(lines, { answerMap, paperTail }) {
  const start = questionStart(lines[0])
  if (!start) return null
  const optionStart = firstOptionIndex(lines)
  const stemLines = optionStart > 0 ? lines.slice(0, optionStart) : [lines[0]]
  const firstStem = questionStart(stemLines[0])?.stem || start.stem
  const continuation = stemLines.slice(1).map(normalizeLine).join(' ')
  const stem = normalizeLine([firstStem, continuation].filter(Boolean).join(' '))
  const optionLines = optionStart >= 0 ? lines.slice(optionStart) : lines
  const blockText = optionLines.join('\n')
  const answerLine = parseAnswerLine(lines)
  const inlineOptions = extractInlineOptions(blockText)
  const options = mergeAnalysisLineOptions(optionLines, inlineOptions)
  if (answerLine?.optionText && !options[answerLine.answerKey]) {
    options[answerLine.answerKey] = answerLine.optionText
  }
  const hasAllOptions = READING_LABELS.every((label) => Boolean(options[label]))
  if (!stem || !hasAllOptions) return null

  const questionNo = String(Number(start.questionNo))
  return {
    id: `q-${paperTail}-${String(questionNo).padStart(3, '0')}`,
    stem: normalizePassageText(stem),
    options: {
      A: normalizePassageText(options.A),
      B: normalizePassageText(options.B),
      C: normalizePassageText(options.C),
      D: normalizePassageText(options.D),
    },
    answerKey: answerLine?.answerKey || answerMap.get(questionNo) || '',
  }
}

function splitQuestionBlocks(lines) {
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (questionStart(lines[index])) starts.push(index)
  }
  return starts.map((start, offset) => {
    const end = starts[offset + 1] ?? lines.length
    return lines.slice(start, end)
  })
}

function isNonPassageLine(line) {
  const text = normalizeLine(line)
  return (
    !text ||
    /^答案与解析$/.test(text) ||
    /^解析[:：]?$/.test(text) ||
    /^同义替换/.test(text) ||
    /^文章脉络/.test(text) ||
    /^词汇/.test(text) ||
    /^说明[:：]/.test(text) ||
    /^答案[:：]/.test(text) ||
    /^第\s*\d+\s*题/.test(text) ||
    isStopSectionLine(text)
  )
}

function buildParagraphs(lines, { label, paperTail }) {
  const questionIndex = lines.findIndex((line) => questionStart(line))
  const passageLines = (questionIndex >= 0 ? lines.slice(0, questionIndex) : lines).filter((line) => !isNonPassageLine(line))
  return passageLines.map((line, index) => ({
    id: `para-${paperTail}-reading-${label.toLowerCase()}-${index === 0 ? 'title' : `p${index}`}`,
    text: normalizePassageText(line),
  }))
}

function buildReadingGroup(marker, groupLines, { answerMap, paperTail }) {
  const contentLines = groupLines.slice(1)
  const questionBlocks = splitQuestionBlocks(contentLines)
  const questions = questionBlocks
    .map((block) => parseQuestionBlock(block, { answerMap, paperTail }))
    .filter(Boolean)
  if (questions.length === 0) {
    return {
      group: null,
      skipped: {
        rawText: safeRawText(groupLines),
        reason: `reading_candidate_${marker.label}_rejected_missing_questions_or_options`,
      },
    }
  }

  const paragraphs = buildParagraphs(contentLines, { label: marker.label, paperTail })
  if (paragraphs.length === 0 && marker.title) {
    paragraphs.push({
      id: `para-${paperTail}-reading-${marker.label.toLowerCase()}-title`,
      text: normalizePassageText(marker.title),
    })
  }
  if (paragraphs.length === 0) {
    return {
      group: null,
      skipped: {
        rawText: safeRawText(groupLines),
        reason: `reading_candidate_${marker.label}_rejected_missing_passage`,
      },
    }
  }

  return {
    group: {
      groupId: `group-${paperTail}-reading-${marker.label.toLowerCase()}`,
      title: marker.title || `Reading ${marker.label}`,
      order: READING_LABELS.indexOf(marker.label),
      paragraphs,
      questions,
    },
    skipped: null,
  }
}

function collectSkippedSections(lines) {
  const skipped = []
  for (let index = 0; index < lines.length; index += 1) {
    const section = classifySectionLine(lines[index])
    if (!section || section === 'reading') continue
    const end = findNextMajorSection(lines, index + 1) ?? Math.min(lines.length, index + 24)
    skipped.push({
      rawText: safeRawText(lines.slice(index, end)),
      reason: section === 'seven_choices' ? 'seven_choices_deferred_to_i2' : `${section}_out_of_scope_for_i1`,
    })
  }
  return skipped
}

function findNextMajorSection(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (classifySectionLine(lines[index])) return index
  }
  return null
}

function uniqueSkipped(skipped) {
  const seen = new Set()
  return skipped.filter((item) => {
    const key = `${item.reason}:${item.rawText.slice(0, 80)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---- Cloze parsing ----

// Option labels can use ".", "．", "、", or "," — or even be missing (space only after label letter).
const CLOZE_OPTION_LABEL_SEP = '[.．、,]?'

function isClozeOptionLine(line) {
  const text = normalizeLine(line)
  return new RegExp(`^(\\d{2})\\.\\s+([A-D])${CLOZE_OPTION_LABEL_SEP}\\s+\\S`).test(text)
}

function parseClozeOptionLine(line) {
  const text = normalizeLine(line)
  const questionMatch = text.match(/^(\d{2})\.\s+/)
  if (!questionMatch) return null
  const questionNo = String(Number(questionMatch[1]))
  if (!CLOZE_QUESTION_NOS.includes(questionNo)) return null

  // Split by A-D markers: handle ".", "．", "、", ",", or bare label+space.
  const options = {}
  const optionPattern = new RegExp(`(?:^|\\s+)([A-D])${CLOZE_OPTION_LABEL_SEP}\\s+(\\S[\\s\\S]*?)(?=\\s+[A-D]${CLOZE_OPTION_LABEL_SEP}\\s+|$)`, 'g')
  let match
  while ((match = optionPattern.exec(text))) {
    const label = match[1]
    const value = compactOptionText(match[2])
    if (value && !options[label]) options[label] = value
  }
  if (['A', 'B', 'C', 'D'].every((l) => options[l])) {
    return { questionNo, options }
  }
  return null
}

function parseClozeMultiLineOptions(lines) {
  // Fallback: multi-line format where each option is on its own line.
  // Group lines by question number (41-55), extract A-D labels.
  const optionsByQuestion = {}
  let currentQuestionNo = null

  for (const line of lines) {
    const text = normalizeLine(line)
    // Check for question number prefix.
    const qMatch = text.match(new RegExp(`^(\\d{2})\\.\\s+([A-D])${CLOZE_OPTION_LABEL_SEP}\\s+(.+)$`))
    if (qMatch) {
      const qNo = String(Number(qMatch[1]))
      if (CLOZE_QUESTION_NOS.includes(qNo)) {
        currentQuestionNo = qNo
        if (!optionsByQuestion[qNo]) optionsByQuestion[qNo] = {}
        optionsByQuestion[qNo][qMatch[2]] = compactOptionText(qMatch[3])
      }
      continue
    }
    // Continuation of previous option?
    if (currentQuestionNo && new RegExp(`^[A-D]${CLOZE_OPTION_LABEL_SEP}\\s+\\S`).test(text)) {
      const contMatch = text.match(new RegExp(`^([A-D])${CLOZE_OPTION_LABEL_SEP}\\s+(.+)$`))
      if (contMatch) {
        if (!optionsByQuestion[currentQuestionNo]) optionsByQuestion[currentQuestionNo] = {}
        if (!optionsByQuestion[currentQuestionNo][contMatch[1]]) {
          optionsByQuestion[currentQuestionNo][contMatch[1]] = compactOptionText(contMatch[2])
        }
      }
    }
  }

  const result = {}
  for (const [qNo, opts] of Object.entries(optionsByQuestion)) {
    if (['A', 'B', 'C', 'D'].every((l) => opts[l])) {
      result[qNo] = opts
    }
  }
  return result
}

function parseClozeOptions(lines) {
  // Try tab-separated inline format first (one line per question with all 4 options).
  const inlineOptions = {}
  for (const line of lines) {
    const parsed = parseClozeOptionLine(line)
    if (parsed) inlineOptions[parsed.questionNo] = parsed.options
  }
  if (Object.keys(inlineOptions).length >= 10) return inlineOptions

  // Fall back to multi-line format.
  const multiLineOptions = parseClozeMultiLineOptions(lines)
  if (Object.keys(multiLineOptions).length >= 10) return multiLineOptions

  return null
}

function findClozeOptionStart(lines) {
  return lines.findIndex((line) => {
    const text = normalizeLine(line)
    return new RegExp(`^(4[1-9]|5[0-5])\\.\\s+[A-D]${CLOZE_OPTION_LABEL_SEP}\\s+\\S`).test(text)
  })
}

function findClozeSection(lines) {
  const optionStart = findClozeOptionStart(lines)
  if (optionStart < 0) return null

  // Walk backwards from optionStart to find section boundary.
  let sectionStart = 0
  for (let i = optionStart - 1; i >= 0; i -= 1) {
    const text = normalizeLine(lines[i])
    const section = classifySectionLine(text)
    // Stop at non-cloze major section or part heading.
    if (section && section !== 'cloze') {
      sectionStart = i
      break
    }
    // Stop at grammar section (第二节 under language use).
    if (/^第[二三四]/.test(text) || /^(?!第一节)/.test(text) && /^第.+节/.test(text)) {
      sectionStart = i
      break
    }
  }

  // Find section end (after option block, before next section).
  let sectionEnd = lines.length
  for (let i = optionStart; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i])
    const section = classifySectionLine(text)
    if (section && section !== 'cloze') {
      sectionEnd = i
      break
    }
  }

  return { startIndex: sectionStart, endIndex: sectionEnd, optionStartIndex: optionStart }
}

function parseClozeGroup(lines, { answerMap, paperTail }) {
  const section = findClozeSection(lines)
  if (!section) return null

  const optionLines = lines.slice(section.optionStartIndex, section.endIndex)
  const optionsByQuestion = parseClozeOptions(optionLines)
  if (!optionsByQuestion) {
    return { group: null, error: { reason: 'cloze_missing_options', rawText: safeRawText(optionLines) } }
  }

  // Extract passage lines (everything before optionStart, after section start).
  const passageLines = lines.slice(section.startIndex, section.optionStartIndex)
    .filter((line) => {
      const text = normalizeLine(line)
      return !isStopSectionLine(text) && !/^第[一二三四]/.test(text)
    })

  const paragraphs = passageLines.map((line, index) => ({
    id: `para-${paperTail}-cloze-${index === 0 ? 'title' : `p${index}`}`,
    text: normalizePassageText(line),
  }))

  if (paragraphs.length === 0) {
    return { group: null, error: { reason: 'cloze_missing_passage', rawText: safeRawText(passageLines) } }
  }

  const orderedQuestionNos = CLOZE_QUESTION_NOS.filter((no) => optionsByQuestion[no])
  if (orderedQuestionNos.length < 15) {
    return { group: null, error: { reason: 'cloze_incomplete_options', rawText: safeRawText(optionLines) } }
  }

  const questions = orderedQuestionNos.map((questionNo) => {
    const padded = String(questionNo).padStart(3, '0')
    const answerKey = answerMap.get(questionNo) || ''
    return {
      id: `q-${paperTail}-${padded}`,
      stem: questionNo,
      answerKey,
      blankId: `blank-${paperTail}-${padded}`,
      options: {
        A: normalizePassageText(optionsByQuestion[questionNo].A),
        B: normalizePassageText(optionsByQuestion[questionNo].B),
        C: normalizePassageText(optionsByQuestion[questionNo].C),
        D: normalizePassageText(optionsByQuestion[questionNo].D),
      },
    }
  })

  const groupId = `group-${paperTail}-cloze`
  return {
    group: {
      groupId,
      groupType: 'cloze',
      title: '完形填空',
      order: 5,
      paragraphs,
      questions,
      blankIds: questions.map((q) => q.blankId),
    },
    error: null,
  }
}

// ---- Grammar-fill parsing ----

function findGrammarFillSection(lines) {
  // Position-based detection: grammar-fill is the second section under 语言运用,
  // after cloze (第一节 完形填空) and before writing. Many real DOCX files do
  // not render blank numbers or section headings as visible extracted text,
  // so we locate the grammar-fill passage by its position between cloze text
  // and writing section markers.

  // Find the writing section start.
  let writingStart = lines.length
  for (let j = 0; j < lines.length; j += 1) {
    const jtext = normalizeLine(lines[j])
    if (/写作|书面表达|续写/.test(jtext)) { writingStart = j; break }
  }

  // Find the cloze section; grammar-fill is between cloze options and writing.
  const cloze = findClozeSection(lines)
  if (!cloze) return null

  // Search between cloze option start and writing for passage content.
  const searchStart = cloze.optionStartIndex
  const searchEnd = writingStart

  // Find the first non-empty, non-cloze-option line after the cloze option block.
  // This is typically the grammar-fill passage content.
  let sectionStart = -1
  for (let i = cloze.optionStartIndex; i < searchEnd; i += 1) {
    const text = normalizeLine(lines[i])
    if (!text) continue
    // Skip cloze option lines (numbered A-D options).
    if (/^\d{2}\.\s+[A-D]/.test(text)) continue
    // Skip section heading lines (like "第一节", "第二节").
    if (/^第[一二三四五六]/.test(text) && text.length < 20) continue
    // Skip instruction lines.
    if (/阅读下面|从每题|从短文|在空白处|共\d+小题|满分\d+分/.test(text) && text.length < 40) continue
    // Found first content line — this is the start.
    sectionStart = i
    break
  }

  if (sectionStart < 0) {
    // Fallback: look for "语法填空" anywhere.
    for (let i = 0; i < lines.length; i += 1) {
      if (/语法填空/.test(normalizeLine(lines[i]))) { sectionStart = i; break }
    }
  }

  if (sectionStart < 0) return null

  return { startIndex: sectionStart, endIndex: searchEnd }
}

function countGrammarFillBlanks(lines, start, end) {
  const blanks = new Set()
  for (let i = start; i < end; i += 1) {
    const text = normalizeLine(lines[i])
    for (const no of GRAMMAR_FILL_QUESTION_NOS) {
      // Match blank numbers in various formats: " 56 ", "__56__", "56.", "(56)", etc.
      if (new RegExp(`(?:^|[\\s_({])${no}(?:[\\s_.,;:!?)}）]|\$)`).test(text)) blanks.add(no)
    }
  }
  return blanks.size
}

function extractGrammarFillPrompts(lines) {
  // Extract prompt words from parenthesized text near blanks.
  // e.g. "56 (wear)" or "(wear)" near blank 56.
  const prompts = new Map()
  for (const line of lines) {
    const text = normalizeLine(line)
    // Find question numbers with adjacent parenthesized prompts.
    for (const no of GRAMMAR_FILL_QUESTION_NOS) {
      // Patterns: "56. (wear)", "56 (wear)", "(wear)" near 56
      const patterns = [
        new RegExp(`${no}[.、．]?\\s*[(（]([^)）]+)[)）]`),
        new RegExp(`[(（]([^)）]+)[)）]\\s*${no}`),
      ]
      for (const pat of patterns) {
        const m = text.match(pat)
        if (m) {
          prompts.set(no, m[1].trim())
          break
        }
      }
    }
  }
  return prompts
}

function parseGrammarFillGroup(lines, { answerMap, paperTail }) {
  const section = findGrammarFillSection(lines)
  if (!section) return null

  const sectionLines = lines.slice(section.startIndex, section.endIndex)
  const prompts = extractGrammarFillPrompts(sectionLines)

  // Extract passage paragraphs: filter out section headers and instructions.
  const passageLines = sectionLines.filter((line) => {
    const text = normalizeLine(line)
    if (!text) return false
    // Skip section headings.
    if (/^第[一二三四五六]/.test(text) && text.length < 20) return false
    // Skip cloze option lines.
    if (/^\d{2}\.\s+[A-D]/.test(text)) return false
    // Skip instruction lines.
    if (/阅读下面|从每题|从短文|在空白处|共\d+小题|满分\d+分/.test(text) && text.length < 40) return false
    // Skip non-grammar-fill headings.
    if (/语法填空/.test(text) && text.length < 15) return false
    // Skip numbered reading question stems (e.g. "32. What effect...").
    if (/^\d{2}\.\s+(?:What|Which|How|Why|Where|The|In)\s/.test(text)) return false
    if (isStopSectionLine(text)) return false
    return text.length > 0
  })

  if (passageLines.length === 0) {
    return { group: null, error: { reason: 'grammar_fill_missing_passage', rawText: safeRawText(sectionLines) } }
  }

  const paragraphs = passageLines.map((line, index) => ({
    id: `para-${paperTail}-grammar-fill-${index === 0 ? 'title' : `p${index}`}`,
    text: normalizePassageText(line),
  }))

  // Verify blank count: we need exactly 10 blanks (q56-q65).
  const foundBlanks = new Set()
  for (const line of passageLines) {
    const text = normalizeLine(line)
    for (const no of GRAMMAR_FILL_QUESTION_NOS) {
      if (new RegExp(`(?:^|[\\s_({])${no}(?:[\\s_.,;:!?)}）]|\$)`).test(text)) foundBlanks.add(no)
    }
  }

  // Relaxed blank check: many DOCX files don't render blank numbers as text.
  // Accept 0 found blanks if the passage text is substantial (>= 100 chars).
  const passageText = passageLines.map((l) => normalizeLine(l)).join(' ')
  if (foundBlanks.size < 10 && passageText.length < 100) {
    return {
      group: null,
      error: {
        reason: 'grammar_fill_incomplete_blanks',
        rawText: safeRawText(sectionLines),
        foundBlanks: [...foundBlanks].sort(),
      },
    }
  }

  const orderedQuestionNos = [...GRAMMAR_FILL_QUESTION_NOS].sort()
  const questions = orderedQuestionNos.map((questionNo) => {
    const padded = String(questionNo).padStart(3, '0')
    const answerKey = answerMap.get(questionNo) || ''
    const prompt = prompts.get(questionNo) || null
    return {
      id: `q-${paperTail}-${padded}`,
      stem: questionNo,
      answerKey,
      blankId: `blank-${paperTail}-${padded}`,
      prompt,
    }
  })

  const groupId = `group-${paperTail}-grammar-fill`
  return {
    group: {
      groupId,
      groupType: 'grammarFill',
      title: '语法填空',
      order: 6,
      paragraphs,
      questions,
      blankIds: questions.map((q) => q.blankId),
    },
    error: null,
  }
}

// ---- Seven-choices parsing ----

function isSevenChoicesOptionLine(line) {
  return /^([A-G])[\.．、]\s*\S/.test(normalizeLine(line))
}

function parseSevenChoicesOptionBank(lines) {
  // Scan backwards from the end: collect A-G option lines.
  const optionLines = []
  let splitIndex = lines.length
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isSevenChoicesOptionLine(lines[i])) {
      optionLines.unshift(lines[i])
      splitIndex = i
    } else if (optionLines.length > 0) {
      break
    }
  }
  if (optionLines.length < SEVEN_CHOICES_LABELS.length) return null

  const options = {}
  for (const line of optionLines) {
    const match = normalizeLine(line).match(/^([A-G])[\.．、]\s*(.+)$/)
    if (match) {
      const label = match[1]
      const text = compactOptionText(match[2])
      if (text && !options[label]) options[label] = text
    }
  }

  const missingLabels = SEVEN_CHOICES_LABELS.filter((label) => !options[label])
  if (missingLabels.length > 0) return null

  return {
    optionBank: SEVEN_CHOICES_LABELS.map((label) => ({ label, text: options[label] })),
    passageLines: lines.slice(0, splitIndex),
  }
}

function parseSevenChoicesGroup(sectionLines, { answerMap, paperTail }) {
  const parsed = parseSevenChoicesOptionBank(sectionLines)
  if (!parsed) {
    return {
      group: null,
      error: { reason: 'seven_choices_missing_option_bank', rawText: safeRawText(sectionLines) },
    }
  }

  const questions = SEVEN_CHOICES_QUESTION_NOS.map((questionNo, index) => {
    const answerKey = answerMap.get(questionNo) || ''
    const padded = String(questionNo).padStart(3, '0')
    return {
      id: `q-${paperTail}-${padded}`,
      stem: questionNo,
      answerKey,
      blankId: `blank-${paperTail}-${padded}`,
    }
  })

  const groupId = `group-${paperTail}-seven-choices`
  const paragraphs = parsed.passageLines
    .filter((line) => !isStopSectionLine(line) && !/^第[一二三]/.test(normalizeLine(line)))
    .map((line, index) => ({
      id: `para-${paperTail}-seven-${index === 0 ? 'title' : `p${index}`}`,
      text: normalizePassageText(line),
    }))

  if (paragraphs.length === 0) {
    return {
      group: null,
      error: { reason: 'seven_choices_missing_passage', rawText: safeRawText(sectionLines) },
    }
  }

  return {
    group: {
      groupId,
      groupType: 'sevenChoices',
      title: '七选五',
      order: 4,
      paragraphs,
      optionBank: parsed.optionBank.map((item) => ({ label: item.label, text: normalizePassageText(item.text) })),
      questions,
      blankIds: questions.map((q) => q.blankId),
    },
    error: null,
  }
}

// ---- Writing parsing ----

function findWritingSectionStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i])
    if (/^第[四五六七八]+\s*部分.*(?:写作|书面表达)/.test(text)) return i
  }
  for (let i = 0; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i])
    if ((/写作/.test(text) || /书面表达/.test(text)) && !/听力/.test(text)) return i
  }
  return -1
}

function findSectionMarker(lines, startIndex, pattern) {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 50); i += 1) {
    if (new RegExp(pattern).test(normalizeLine(lines[i]))) return i
  }
  return -1
}

function isWritingStandardLine(line) {
  const text = normalizeLine(line)
  if (/^第[一二三四五六七八]+\s*[节部分]/.test(text)) return true
  if (/^注意[：:]/.test(text)) return true
  if (/写作词数|续写词数/.test(text)) return true
  if (/请按如下格式|请在答题卡|在答题卡的相应位置/.test(text)) return true
  if (/满分\d+分/.test(text) && text.length < 25) return true
  if (/阅读下面材料.*续写两段/.test(text)) return true
  if (/共[两三四五]节/.test(text) && /满分/.test(text)) return true
  return false
}

// I7: a line is part of the 情境 (prompt) if it contains any CJK char or
// fullwidth/Chinese punctuation; the application "given skeleton" (salutation /
// signature / given title) is the trailing run of pure non-CJK (English) lines.
const APPLICATION_CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/
const APPLICATION_SALUTATION = /^(dear|to|hi|hello)\b/i
// Closing-word list (line-start, case-insensitive). Longer forms first so
// "Best wishes" / "Yours sincerely" win over "Best" / "Yours".
const APPLICATION_CLOSING = /^(yours\s+sincerely|yours\s+faithfully|best\s+wishes|yours|sincerely|best|regards|cheers)\b/i

function applicationLineHasCjk(text) {
  return APPLICATION_CJK.test(text)
}

// Detect the given skeleton in the trailing non-CJK run, guarded by a positive
// signal (MF1). Returns { top, bottom } when captured, else null (fail-safe:
// keep everything in the prompt). Pure so it is unit-testable.
export function detectApplicationGiven(contentLines) {
  let cut = contentLines.length
  while (cut > 0 && !applicationLineHasCjk(contentLines[cut - 1])) cut -= 1
  const candidate = contentLines.slice(cut)
  const promptLines = contentLines.slice(0, cut)

  // Require a Chinese 情境 to remain, and a positive signal on the candidate.
  if (candidate.length === 0 || promptLines.length === 0) return { given: null, promptLines: contentLines }

  const firstIsSalutation = APPLICATION_SALUTATION.test(candidate[0])
  const closingIdx = candidate.findIndex((line) => APPLICATION_CLOSING.test(line))
  const isSingleTitle = candidate.length === 1 && !/[.!?]$/.test(candidate[0])
  if (!firstIsSalutation && closingIdx < 0 && !isSingleTitle) {
    // No signal → do not capture; leave the trailing English in the prompt.
    return { given: null, promptLines: contentLines }
  }

  const splitAt = closingIdx >= 0 ? closingIdx : candidate.length
  return {
    given: { top: candidate.slice(0, splitAt), bottom: candidate.slice(splitAt) },
    promptLines,
  }
}

export function extractApplicationParagraphs(lines, paperTail) {
  const contentLines = []
  for (const line of lines) {
    const text = normalizeLine(line)
    if (!text) continue
    if (isWritingStandardLine(text)) continue
    contentLines.push(text)
  }
  if (contentLines.length === 0) {
    return { paragraphs: [], applicationGiven: null, error: { reason: 'application_missing_content' } }
  }

  const { given, promptLines } = detectApplicationGiven(contentLines)
  return {
    paragraphs: promptLines.map((text, index) => ({
      id: `para-${paperTail}-writing-app-${index === 0 ? 'title' : `p${index}`}`,
      text: normalizePassageText(text),
    })),
    applicationGiven: given,
    error: null,
  }
}

function extractContinuationContent(lines, paperTail) {
  const materialLines = []
  const starterLines = []
  let afterNoteBlock = false
  let inNoteBlock = false

  for (const line of lines) {
    const text = normalizeLine(line)
    if (!text) continue
    if (/^第[一二三四五六七八]+\s*[节部分]/.test(text)) continue
    if (/满分\d+分/.test(text) && text.length < 25) continue
    if (/阅读下面材料.*续写两段/.test(text)) continue

    // Detect note block.
    if (/^注意[：:]/.test(text)) {
      inNoteBlock = true
      continue
    }
    if (inNoteBlock) {
      if (/续写词数|请按如下格式|在答题卡的相应位置/.test(text)) continue
      // End of numbered note items — remaining text is starters.
      if (!/^\d+[\.、．]\s*(?:写作词数|续写词数|请按|请在|在答题卡)/.test(text)) {
        inNoteBlock = false
        afterNoteBlock = true
      } else {
        continue
      }
    }

    if (afterNoteBlock) {
      starterLines.push(text)
    } else {
      materialLines.push(text)
    }
  }

  if (materialLines.length === 0) {
    return { materialParagraphs: [], starters: [], error: { reason: 'continuation_material_missing' } }
  }
  if (starterLines.length < 2) {
    return {
      materialParagraphs: materialLines.map((text, index) => ({
        id: `para-${paperTail}-writing-cont-${index === 0 ? 'title' : `p${index}`}`,
        text: normalizePassageText(text),
      })),
      starters: starterLines.map(normalizePassageText),
      error: starterLines.length === 0 ? { reason: 'continuation_starters_missing' } : { reason: 'continuation_starters_incomplete', found: starterLines.length },
    }
  }

  return {
    materialParagraphs: materialLines.map((text, index) => ({
      id: `para-${paperTail}-writing-cont-${index === 0 ? 'title' : `p${index}`}`,
      text: normalizePassageText(text),
    })),
    starters: starterLines.slice(0, 2).map(normalizePassageText),
    error: null,
  }
}

function parseWritingGroups(lines, paperTail) {
  const writingStart = findWritingSectionStart(lines)
  if (writingStart < 0) return { applicationGroup: null, continuationGroup: null, applicationError: null, continuationError: null }

  const appStart = findSectionMarker(lines, writingStart, '^第一节')
  const contStart = findSectionMarker(lines, Math.max(writingStart, appStart >= 0 ? appStart + 1 : writingStart + 1), '^第二节|读后续写|续写')

  // Application parsing.
  let applicationGroup = null
  let applicationError = null
  const appEndIndex = contStart >= 0 ? contStart : lines.length
  const appLines = appStart >= 0 ? lines.slice(appStart + 1, appEndIndex) : lines.slice(writingStart + 1, appEndIndex)

  const appResult = extractApplicationParagraphs(appLines, paperTail)
  if (appResult.error) {
    applicationError = appResult.error
  } else if (appResult.paragraphs.length === 0) {
    applicationError = { reason: 'application_content_empty' }
  } else {
    const groupId = `group-${paperTail}-writing-application`
    applicationGroup = {
      groupId,
      groupType: 'writing',
      title: '应用文写作',
      order: 7,
      paragraphs: appResult.paragraphs,
      applicationGiven: appResult.applicationGiven,
      questions: [],
    }
  }

  // Continuation parsing.
  let continuationGroup = null
  let continuationError = null
  if (contStart >= 0) {
    const contLines = lines.slice(contStart + 1)
    const contResult = extractContinuationContent(contLines, paperTail)

    if (contResult.error && contResult.error.reason === 'continuation_material_missing') {
      continuationError = contResult.error
    } else if (contResult.materialParagraphs.length === 0) {
      continuationError = { reason: 'continuation_content_empty' }
    } else {
      const groupId = `group-${paperTail}-writing-continuation`
      continuationGroup = {
        groupId,
        groupType: 'writing',
        title: '读后续写',
        order: 8,
        paragraphs: contResult.materialParagraphs,
        continuationStarters: contResult.starters,
        questions: [],
      }
      if (contResult.error) continuationError = contResult.error
    }
  } else {
    continuationError = { reason: 'continuation_section_not_found' }
  }

  return { applicationGroup, continuationGroup, applicationError, continuationError }
}

function findSevenChoicesSections(lines) {
  const sections = []
  for (let index = 0; index < lines.length; index += 1) {
    const section = classifySectionLine(lines[index])
    if (section !== 'seven_choices') continue
    // Don't double-count adjacent seven_choices marker lines.
    if (sections.length > 0 && index - sections[sections.length - 1].startIndex <= 2) continue
    const end = findNextMajorSection(lines, index + 1) ?? lines.length
    sections.push({ startIndex: index, endIndex: end })
  }
  return sections
}

export function parseReadingCandidatesFromText(rawText, options = {}) {
  const sourceFilename = options.sourceFilename || 'paper.docx'
  const sourceHash = options.sourceHash || sha256(Buffer.from(String(rawText || '')))
  const paperId = options.paperId || derivePaperId(sourceFilename, sourceHash)
  const paperTail = tailFromPaperId(paperId)
  const lines = toLines(rawText)
  const grammarFillAnswerMap = parseGrammarFillAnswers(options.answerKeyText || '')
  const answerMap = mergeAnswerMaps(
    parseAnswerRanges(rawText),
    parseAnswerRanges(options.answerKeyText || ''),
    grammarFillAnswerMap,
  )
  const markers = findReadingMarkers(lines)
  const readingGroups = []
  const skipped = []

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const nextMarkerIndex = markers[index + 1]?.index ?? lines.length
    const nextStopIndex = findNextMajorSection(lines, marker.index + 1) ?? lines.length
    const end = Math.min(nextMarkerIndex, nextStopIndex)
    const groupLines = lines.slice(marker.index, end)
    const { group, skipped: rejected } = buildReadingGroup(marker, groupLines, { answerMap, paperTail })
    if (group) {
      readingGroups.push(group)
    } else if (rejected) {
      skipped.push(rejected)
    }
  }

  // Parse seven-choices sections.
  const scSections = findSevenChoicesSections(lines)
  let sevenChoicesGroup = null
  let sevenChoicesError = null
  if (scSections.length > 0) {
    const sc = scSections[0]
    const scLines = lines.slice(sc.startIndex, sc.endIndex)
    const parsed = parseSevenChoicesGroup(scLines, { answerMap, paperTail })
    sevenChoicesGroup = parsed.group
    sevenChoicesError = parsed.error
  }

  // Parse cloze section.
  const clozeParsed = parseClozeGroup(lines, { answerMap, paperTail })
  const clozeGroup = clozeParsed?.group || null
  const clozeError = clozeParsed?.error || null

  // Parse grammar-fill section.
  const grammarFillParsed = parseGrammarFillGroup(lines, { answerMap, paperTail })
  const grammarFillGroup = grammarFillParsed?.group || null
  const grammarFillError = grammarFillParsed?.error || null

  // Parse writing section.
  const writingParsed = parseWritingGroups(lines, paperTail)
  const applicationGroup = writingParsed.applicationGroup
  const continuationGroup = writingParsed.continuationGroup
  const applicationError = writingParsed.applicationError
  const continuationError = writingParsed.continuationError

  const allSkipped = uniqueSkipped([...skipped, ...collectSkippedSections(lines)])

  // Remove successfully-parsed groups from skipped.
  const filteredSkipped = allSkipped.filter((item) => {
    if (item.reason === 'seven_choices_deferred_to_i2' && (sevenChoicesGroup || sevenChoicesError)) return false
    if (item.reason === 'cloze_out_of_scope_for_i1' && clozeGroup) return false
    if (item.reason === 'grammar_or_language_out_of_scope_for_i1' && grammarFillGroup) return false
    if (item.reason === 'writing_out_of_scope_for_i1' && applicationGroup) return false
    return true
  })

  return {
    paper: {
      paperId,
      sourceFilename,
      sourceHash,
      answerSourceFilename: options.answerSourceFilename || '',
    },
    readingGroups: readingGroups.sort((a, b) => a.order - b.order),
    sevenChoicesGroup,
    sevenChoicesError,
    clozeGroup,
    clozeError,
    grammarFillGroup,
    grammarFillError,
    applicationGroup,
    continuationGroup,
    applicationError,
    continuationError,
    skipped: filteredSkipped,
  }
}

export async function parseReadingDocxBuffer(buffer, options = {}) {
  const sourceFilename = options.sourceFilename || 'paper.docx'
  const sourceHash = sha256(buffer)
  const result = await mammoth.extractRawText({ buffer })
  let answerKeyText = options.answerKeyText || ''
  if (!answerKeyText && options.answerKeyBuffer) {
    answerKeyText = (await mammoth.extractRawText({ buffer: options.answerKeyBuffer })).value
  }
  return parseReadingCandidatesFromText(result.value, {
    sourceFilename,
    sourceHash,
    paperId: options.paperId,
    answerKeyText,
    answerSourceFilename: options.answerSourceFilename,
  })
}
