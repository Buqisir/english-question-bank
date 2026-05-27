import { createHash } from 'node:crypto'
import path from 'node:path'
import mammoth from 'mammoth'

const READING_LABELS = ['A', 'B', 'C', 'D']
const SEVEN_CHOICES_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const SEVEN_CHOICES_QUESTION_NOS = ['36', '37', '38', '39', '40']
const CLOZE_QUESTION_NOS = Array.from({ length: 15 }, (_, i) => String(41 + i))
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
    stem,
    options: {
      A: options.A,
      B: options.B,
      C: options.C,
      D: options.D,
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
    text: line,
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
      text: marker.title,
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
    text: line,
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
        A: optionsByQuestion[questionNo].A,
        B: optionsByQuestion[questionNo].B,
        C: optionsByQuestion[questionNo].C,
        D: optionsByQuestion[questionNo].D,
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
      text: line,
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
      optionBank: parsed.optionBank,
      questions,
      blankIds: questions.map((q) => q.blankId),
    },
    error: null,
  }
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
  const answerMap = mergeAnswerMaps(parseAnswerRanges(rawText), parseAnswerRanges(options.answerKeyText || ''))
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

  const allSkipped = uniqueSkipped([...skipped, ...collectSkippedSections(lines)])

  // Remove successfully-parsed groups from skipped.
  const filteredSkipped = allSkipped.filter((item) => {
    if (item.reason === 'seven_choices_deferred_to_i2' && sevenChoicesGroup) return false
    if (item.reason === 'cloze_out_of_scope_for_i1' && clozeGroup) return false
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
