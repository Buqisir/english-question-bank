// Application writing analysis V4: shape and content checks.
// Spec: docs/cuts/application-writing-v4/spec.md (D1 data contract, D3 validation).
// Pure functions. The caller supplies the task's given lines in order; the
// server derives them with the same rules the V3 model-answer validator uses.

export const APPLICATION_ANALYSIS_V4 = 'application-analysis-v4'

export const APPLICATION_V4_WORD_RANGES = Object.freeze({
  standard: Object.freeze([100, 120]),
  advanced: Object.freeze([130, 150]),
})

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g
const CJK = /[㐀-鿿豈-﫿]/
const MARKDOWN = /^```|^#{1,6}\s|\*\*|__|^\s*[-*+]\s|^\s*\d+[.)]\s/m

export function countApplicationWords(text) {
  return (String(text).match(WORD) || []).length
}

function isText(value) {
  return typeof value === 'string' && /\S/.test(value)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, keys, where, problems) {
  if (!isPlainObject(value)) {
    problems.push(`${where} must be an object`)
    return false
  }
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problems.push(`${where} has unknown field ${key}`)
  }
  for (const key of keys) {
    if (!(key in value)) problems.push(`${where}.${key} is missing`)
  }
  return true
}

function textArray(value, where, min, max, problems) {
  if (!Array.isArray(value)) {
    problems.push(`${where} must be an array`)
    return
  }
  if (value.length < min || value.length > max) {
    problems.push(`${where} has ${value.length} entries, want ${min}–${max}`)
  }
  value.forEach((entry, index) => {
    if (!isText(entry)) problems.push(`${where}[${index}] is empty`)
  })
}

function objectArray(value, where, keys, min, max, problems) {
  if (!Array.isArray(value)) {
    problems.push(`${where} must be an array`)
    return []
  }
  if (value.length < min || value.length > max) {
    problems.push(`${where} has ${value.length} entries, want ${min}–${max}`)
  }
  value.forEach((entry, index) => {
    const at = `${where}[${index}]`
    if (!exactKeys(entry, keys, at, problems)) return
    for (const key of keys) {
      if (key === 'items' || key === 'paragraph') continue
      if (!isText(entry[key])) problems.push(`${at}.${key} is empty`)
    }
  })
  return value
}

/** Shape problems only (D1). Empty array means the shape is valid. */
export function applicationAnalysisV4ShapeProblems(value) {
  const problems = []
  if (!exactKeys(value, ['schemaVersion', 'taskCard', 'standard', 'advanced'], 'applicationAnalysis', problems)) {
    return problems
  }
  if (value.schemaVersion !== APPLICATION_ANALYSIS_V4) {
    problems.push(`applicationAnalysis.schemaVersion must be ${APPLICATION_ANALYSIS_V4}`)
  }
  if (exactKeys(value.taskCard, ['taskRequires', 'thisEssayChooses'], 'taskCard', problems)) {
    textArray(value.taskCard.taskRequires, 'taskCard.taskRequires', 1, 4, problems)
    if (!isText(value.taskCard.thisEssayChooses)) problems.push('taskCard.thisEssayChooses is empty')
  }
  if (exactKeys(value.standard, ['essay', 'pointMap', 'notes', 'expressions'], 'standard', problems)) {
    if (!isText(value.standard.essay)) problems.push('standard.essay is empty')
    objectArray(value.standard.pointMap, 'standard.pointMap', ['point', 'quote'], 1, Infinity, problems)
    const notes = objectArray(value.standard.notes, 'standard.notes', ['paragraph', 'role', 'items'], 1, Infinity, problems)
    notes.forEach((note, index) => {
      if (!isPlainObject(note)) return
      if (!Number.isInteger(note.paragraph) || note.paragraph < 1) {
        problems.push(`standard.notes[${index}].paragraph must be a positive integer`)
      }
      objectArray(note.items, `standard.notes[${index}].items`, ['quote', 'explain'], 1, 4, problems)
    })
    objectArray(value.standard.expressions, 'standard.expressions', ['expression', 'function'], 2, 3, problems)
  }
  if (exactKeys(value.advanced, ['essay', 'pointMap', 'beyondStandard'], 'advanced', problems)) {
    if (!isText(value.advanced.essay)) problems.push('advanced.essay is empty')
    objectArray(value.advanced.pointMap, 'advanced.pointMap', ['point', 'quote'], 1, Infinity, problems)
    objectArray(value.advanced.beyondStandard, 'advanced.beyondStandard', ['quote', 'explain'], 2, 3, problems)
  }
  return problems
}

export function isApplicationAnalysisV4(value) {
  return applicationAnalysisV4ShapeProblems(value).length === 0
}

function nonBlankLines(text) {
  return text.split('\n').map((line) => line.trim())
}

function sentences(text) {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean)
}

/**
 * Splits an essay into header lines, body paragraphs and footer lines using the
 * task's given lines in order. Given lines that stand alone at the top
 * (title, salutation) are header; those that stand alone at the bottom
 * (closing, signature) are footer; any given lines left must open the body.
 */
export function splitApplicationEssay(essay, given) {
  const problems = []
  const lines = nonBlankLines(essay)
  let top = 0
  let bottom = lines.length - 1
  const skipBlankTop = () => { while (top <= bottom && !lines[top]) top += 1 }
  const skipBlankBottom = () => { while (bottom >= top && !lines[bottom]) bottom -= 1 }
  let first = 0
  let last = given.length - 1
  skipBlankTop()
  // A given sentence (ending . ! ?) opens the body; it never stands alone as a header.
  while (first <= last && lines[top] === given[first].trim() && !/[.!?]$/.test(lines[top])) {
    top += 1
    first += 1
    skipBlankTop()
  }
  skipBlankBottom()
  while (last >= first && lines[bottom] === given[last].trim()) {
    bottom -= 1
    last -= 1
    skipBlankBottom()
  }
  const body = lines.slice(top, bottom + 1).join('\n').trim()
  let rest = body.replace(/\s+/g, ' ')
  for (const lead of given.slice(first, last + 1)) {
    const want = lead.trim().replace(/\s+/g, ' ')
    if (!rest.startsWith(want)) {
      problems.push(`given text is missing or misplaced: ${lead.trim()}`)
      break
    }
    rest = rest.slice(want.length).trimStart()
  }
  const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
  return { paragraphs, problems }
}

function checkEssay(essay, label, given, range, problems, warnings) {
  if (essay !== essay.trim()) problems.push(`${label}.essay must start and end with essay text`)
  if (CJK.test(essay)) problems.push(`${label}.essay contains Chinese`)
  if (MARKDOWN.test(essay)) problems.push(`${label}.essay contains Markdown or numbering`)
  if (/^\s*[[{]/.test(essay)) problems.push(`${label}.essay contains JSON`)
  if (/\n[ \t]*\n[ \t]*\n/.test(essay)) problems.push(`${label}.essay has more than one blank line between paragraphs`)
  for (const text of new Set(given)) {
    const want = given.filter((g) => g === text).length
    if (essay.split(text).length - 1 > want) problems.push(`${label}.essay repeats given text: ${text}`)
  }
  const { paragraphs, problems: givenProblems } = splitApplicationEssay(essay, given)
  givenProblems.forEach((problem) => problems.push(`${label}.essay ${problem}`))
  if (paragraphs.length < 3 || paragraphs.length > 4) {
    problems.push(`${label}.essay body has ${paragraphs.length} paragraphs, want 3 or 4`)
  }
  const newWords = countApplicationWords(essay) - given.reduce((sum, text) => sum + countApplicationWords(text), 0)
  if (newWords < range[0] || newWords > range[1]) {
    problems.push(`${label}.essay has ${newWords} new words, want ${range[0]}–${range[1]}`)
  }
  const middles = paragraphs.slice(1, -1)
  middles.forEach((paragraph, index) => {
    if (sentences(paragraph).length === 1) warnings.push(`${label}.essay paragraph ${index + 2} is one sentence`)
  })
  if (middles.length === 2) {
    const [a, b] = middles.map(countApplicationWords)
    if (Math.min(a, b) * 2 < Math.max(a, b)) warnings.push(`${label}.essay middle paragraphs are unbalanced: ${a} vs ${b} words`)
  }
  return { paragraphs, newWords }
}

function checkQuotes(entries, essay, where, problems) {
  if (!Array.isArray(entries)) return
  entries.forEach((entry, index) => {
    if (isPlainObject(entry) && isText(entry.quote) && !essay.includes(entry.quote)) {
      problems.push(`${where}[${index}].quote is not verbatim in the essay: ${entry.quote}`)
    }
  })
}

/**
 * Full D3 check. `given` is the task's given lines in order; `wordCountTarget`
 * is the task's target. Returns { problems, warnings, wordCounts }.
 */
export function checkApplicationAnalysisV4(analysis, { given = [], wordCountTarget } = {}) {
  const problems = applicationAnalysisV4ShapeProblems(analysis)
  const warnings = []
  const wordCounts = {}
  if (problems.length > 0) return { problems, warnings, wordCounts }
  if (wordCountTarget !== 80) {
    problems.push(`word-count target ${wordCountTarget ?? 'missing'} is not supported by V4; handle manually`)
    return { problems, warnings, wordCounts }
  }
  const { standard, advanced } = analysis
  const std = checkEssay(standard.essay, 'standard', given, APPLICATION_V4_WORD_RANGES.standard, problems, warnings)
  const adv = checkEssay(advanced.essay, 'advanced', given, APPLICATION_V4_WORD_RANGES.advanced, problems, warnings)
  wordCounts.standard = std.newWords
  wordCounts.advanced = adv.newWords
  checkQuotes(standard.pointMap, standard.essay, 'standard.pointMap', problems)
  checkQuotes(advanced.pointMap, advanced.essay, 'advanced.pointMap', problems)
  checkQuotes(advanced.beyondStandard, advanced.essay, 'advanced.beyondStandard', problems)
  standard.notes.forEach((note, index) => {
    if (note.paragraph > std.paragraphs.length) {
      problems.push(`standard.notes[${index}].paragraph ${note.paragraph} does not exist`)
    }
    checkQuotes(note.items, standard.essay, `standard.notes[${index}].items`, problems)
  })
  return { problems, warnings, wordCounts }
}
