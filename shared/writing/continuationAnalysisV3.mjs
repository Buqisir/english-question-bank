// Continuation writing analysis V3: shape and content checks.
// Spec: docs/cuts/continuation-writing-v3/spec.md (D1 data contract, D3 validation).
// Pure functions. The caller supplies the source text and the two starters.
// Rules ported from docs/cuts/continuation-writing-v3/trial/check.mjs, which
// ran on every trial output the Owner voted on.

export const CONTINUATION_ANALYSIS_V3 = 'continuation-analysis-v3'

export const CONTINUATION_V3_WORD_RANGES = Object.freeze({
  standard: Object.freeze([170, 210]),
  advanced: Object.freeze([240, 280]),
})

// The ranges above were set for tasks of "about 150 words"; V3 has not been
// tried on any other target.
export const CONTINUATION_V3_WORD_TARGET = 150

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g
const CJK = /[㐀-鿿豈-﫿]/
const MARKDOWN = /^```|^#{1,6}\s|\*\*|__|^\s*[-*+]\s|^\s*\d+[.)]\s/m
const COPY_RUN = 8

// Days, months, holidays, languages and family forms of address are not new
// people when capitalised mid-sentence.
const NOT_A_NAME = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Christmas|Eve|Day|Year|English|Chinese|Mom|Mum|Dad|Mother|Father|Grandma|Grandpa|Granny|Uncle|Aunt|Sir|Madam)$/

export function countContinuationWords(text) {
  return (String(text).match(WORD) || []).length
}

/** Curly quotes to straight, runs of whitespace to one space. */
export function normalizeContinuationText(text) {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
}

/** Percent of words inside double quotation marks. */
export function directSpeechShare(text) {
  const all = countContinuationWords(text)
  if (!all) return 0
  const quoted = (normalizeContinuationText(text).match(/"[^"]*"/g) || [])
    .reduce((sum, part) => sum + countContinuationWords(part), 0)
  return Math.round((100 * quoted) / all)
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

function countRange(value, where, min, max, problems) {
  if (value.length < min || value.length > max) {
    const want = min === max ? `${min}` : `${min}–${max}`
    problems.push(`${where} has ${value.length} entries, want ${want}`)
  }
}

function textArray(value, where, min, max, problems) {
  if (!Array.isArray(value)) {
    problems.push(`${where} must be an array`)
    return
  }
  countRange(value, where, min, max, problems)
  value.forEach((entry, index) => {
    if (!isText(entry)) problems.push(`${where}[${index}] is empty`)
  })
}

function objectArray(value, where, keys, min, max, problems) {
  if (!Array.isArray(value)) {
    problems.push(`${where} must be an array`)
    return []
  }
  countRange(value, where, min, max, problems)
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

/** Shape problems only (D1 and the list sizes of D3.6–D3.9). Empty means valid. */
export function continuationAnalysisV3ShapeProblems(value) {
  const problems = []
  const top = ['schemaVersion', 'reading', 'taskCard', 'standard', 'advanced']
  if (!exactKeys(value, top, 'continuationAnalysis', problems)) return problems
  if (value.schemaVersion !== CONTINUATION_ANALYSIS_V3) {
    problems.push(`continuationAnalysis.schemaVersion must be ${CONTINUATION_ANALYSIS_V3}`)
  }
  if (exactKeys(value.reading, ['questions', 'sourceLinks'], 'reading', problems)) {
    objectArray(value.reading.questions, 'reading.questions', ['question', 'answer'], 3, 3, problems)
    objectArray(value.reading.sourceLinks, 'reading.sourceLinks', ['sourceQuote', 'use'], 2, 3, problems)
  }
  if (exactKeys(value.taskCard, ['taskRequires', 'thisEssayChooses'], 'taskCard', problems)) {
    textArray(value.taskCard.taskRequires, 'taskCard.taskRequires', 2, 4, problems)
    if (!isText(value.taskCard.thisEssayChooses)) problems.push('taskCard.thisEssayChooses is empty')
  }
  if (exactKeys(value.standard, ['essay', 'notes', 'expressions', 'pitfalls'], 'standard', problems)) {
    if (!isText(value.standard.essay)) problems.push('standard.essay is empty')
    const notes = objectArray(value.standard.notes, 'standard.notes', ['paragraph', 'role', 'items'], 1, Infinity, problems)
    notes.forEach((note, index) => {
      if (!isPlainObject(note)) return
      if (!Number.isInteger(note.paragraph) || note.paragraph < 1) {
        problems.push(`standard.notes[${index}].paragraph must be a positive integer`)
      }
      objectArray(note.items, `standard.notes[${index}].items`, ['quote', 'explain'], 2, 4, problems)
    })
    objectArray(value.standard.expressions, 'standard.expressions', ['expression', 'function'], 2, 3, problems)
    objectArray(value.standard.pitfalls, 'standard.pitfalls', ['pitfall', 'why'], 2, 3, problems)
  }
  if (exactKeys(value.advanced, ['essay', 'beyondStandard'], 'advanced', problems)) {
    if (!isText(value.advanced.essay)) problems.push('advanced.essay is empty')
    objectArray(value.advanced.beyondStandard, 'advanced.beyondStandard', ['quote', 'explain'], 2, 3, problems)
  }
  return problems
}

export function isContinuationAnalysisV3(value) {
  return continuationAnalysisV3ShapeProblems(value).length === 0
}

function copyRuns(material) {
  const tokens = (normalizeContinuationText(material).match(WORD) || []).map((w) => w.toLowerCase())
  const runs = new Set()
  for (let i = 0; i + COPY_RUN <= tokens.length; i += 1) runs.add(tokens.slice(i, i + COPY_RUN).join(' '))
  return runs
}

function newNames(essay, known) {
  const isKnown = (word) => {
    const lower = word.toLowerCase()
    const stem = lower.replace(/(?:'s|’s|s)$/, '')
    if (known.has(lower) || known.has(stem)) return true
    return lower.length >= 3 && [...known].some((k) => k.length > lower.length && k.startsWith(lower))
  }
  const names = new Set()
  for (const match of essay.matchAll(/(?<![.!?"“]\s)(?<!^)\b([A-Z][a-z]+)\b(?!\s*\d)/gm)) {
    const before = essay.slice(0, match.index).trimEnd()
    if (!before || /[.!?:"“”]$/.test(before)) continue
    if (!isKnown(match[1]) && !NOT_A_NAME.test(match[1])) names.add(match[1])
  }
  return [...names]
}

function checkEssay(essay, label, context, problems, warnings) {
  const { starters, range, runs, known, sourceShare } = context
  if (essay !== essay.trim()) problems.push(`${label}.essay must start and end with essay text`)
  if (CJK.test(essay)) problems.push(`${label}.essay contains Chinese`)
  if (MARKDOWN.test(essay)) problems.push(`${label}.essay contains Markdown or numbering`)
  if (/^\s*[[{]/.test(essay)) problems.push(`${label}.essay contains JSON`)
  const paragraphs = essay.trim().split(/\n[ \t]*\n/).map((p) => p.trim())
  if (/\n[ \t]*\n[ \t]*\n/.test(essay)) problems.push(`${label}.essay has more than one blank line between paragraphs`)
  if (paragraphs.length !== 2) problems.push(`${label}.essay has ${paragraphs.length} paragraphs, want 2`)
  paragraphs.slice(0, 2).forEach((paragraph, index) => {
    const starter = starters[index]
    if (!normalizeContinuationText(paragraph).startsWith(normalizeContinuationText(starter))) {
      problems.push(`${label}.essay paragraph ${index + 1} does not start with starter ${index + 1}`)
    } else if (!paragraph.startsWith(starter.trim())) {
      warnings.push(`${label}.essay paragraph ${index + 1} matches starter ${index + 1} only after quote normalisation`)
    }
  })
  const newWords = countContinuationWords(essay) - starters.reduce((sum, s) => sum + countContinuationWords(s), 0)
  if (newWords < range[0] || newWords > range[1]) {
    problems.push(`${label}.essay has ${newWords} new words, want ${range[0]}–${range[1]}`)
  }
  let body = normalizeContinuationText(essay)
  for (const starter of starters) body = body.replace(normalizeContinuationText(starter), ' ')
  const tokens = (body.match(WORD) || []).map((w) => w.toLowerCase())
  for (let i = 0; i + COPY_RUN <= tokens.length; i += 1) {
    const run = tokens.slice(i, i + COPY_RUN).join(' ')
    if (runs.has(run)) {
      problems.push(`${label}.essay copies ${COPY_RUN}+ consecutive source words: "${run}"`)
      break
    }
  }
  const names = newNames(essay, known)
  if (names.length) warnings.push(`${label}.essay possible new named character: ${names.join(', ')}`)
  const share = directSpeechShare(essay)
  if (share > 2 * sourceShare + 10) {
    warnings.push(`${label}.essay has ${share}% of words in direct speech, source ${sourceShare}%`)
  }
  return { paragraphs, newWords, share }
}

function checkQuotes(entries, text, where, field, problems) {
  const haystack = normalizeContinuationText(text)
  entries.forEach((entry, index) => {
    if (!normalizeContinuationText(entry[field]).length || !haystack.includes(normalizeContinuationText(entry[field]))) {
      problems.push(`${where}[${index}].${field} is not verbatim: ${entry[field]}`)
    }
  })
}

/**
 * Full D3 check. `material` is the source passage, `starters` the two
 * paragraph starters, `wordCountTarget` the task's target.
 * Returns { problems, warnings, wordCounts, directSpeech }.
 */
export function checkContinuationAnalysisV3(analysis, { material = '', starters = [], wordCountTarget } = {}) {
  const problems = continuationAnalysisV3ShapeProblems(analysis)
  const warnings = []
  const wordCounts = {}
  const directSpeech = {}
  if (problems.length > 0) return { problems, warnings, wordCounts, directSpeech }
  if (!isText(material) || starters.length !== 2 || !starters.every(isText)) {
    problems.push('continuation task needs the source text and exactly two starters')
    return { problems, warnings, wordCounts, directSpeech }
  }
  if (wordCountTarget !== CONTINUATION_V3_WORD_TARGET) {
    problems.push(`word-count target ${wordCountTarget ?? 'missing'} is not supported by V3; handle manually`)
    return { problems, warnings, wordCounts, directSpeech }
  }
  const sourceText = [material, ...starters].join('\n')
  const shared = {
    starters,
    runs: copyRuns(material),
    known: new Set((sourceText.match(WORD) || []).map((w) => w.toLowerCase())),
    sourceShare: directSpeechShare(material),
  }
  directSpeech.source = shared.sourceShare
  const { standard, advanced, reading } = analysis
  const std = checkEssay(standard.essay, 'standard', { ...shared, range: CONTINUATION_V3_WORD_RANGES.standard }, problems, warnings)
  const adv = checkEssay(advanced.essay, 'advanced', { ...shared, range: CONTINUATION_V3_WORD_RANGES.advanced }, problems, warnings)
  wordCounts.standard = std.newWords
  wordCounts.advanced = adv.newWords
  directSpeech.standard = std.share
  directSpeech.advanced = adv.share
  checkQuotes(reading.sourceLinks, sourceText, 'reading.sourceLinks', 'sourceQuote', problems)
  const covered = new Set()
  standard.notes.forEach((note, index) => {
    if (note.paragraph > 2) problems.push(`standard.notes[${index}].paragraph ${note.paragraph} does not exist`)
    covered.add(note.paragraph)
    checkQuotes(note.items, standard.essay, `standard.notes[${index}].items`, 'quote', problems)
  })
  for (const paragraph of [1, 2]) {
    if (!covered.has(paragraph)) problems.push(`standard.notes has no note for paragraph ${paragraph}`)
  }
  checkQuotes(advanced.beyondStandard, advanced.essay, 'advanced.beyondStandard', 'quote', problems)
  return { problems, warnings, wordCounts, directSpeech }
}
