import { chineseContextNumbering } from './chineseContextNumbering.mjs'
import { digestJson } from './paper-canonical/stable.mjs'

export const OCR_NUMBERING_REPORT_VERSION = 'agent-ocr-correction-report-v3'
export const CJK_NUMBERING_RULE = 'chinese-context-numbering-fullwidth-v1'

// Only complete text runs in source-backed paragraph/table content are mapped.
// A split OCR item, non-text run or ambiguous cross-run parenthesis fails closed.
function targetContext(materialization, entry, historicalText) {
  const pointer = entry.materializationTarget?.jsonPointer
  if (!/^\/groups\/(?:0|[1-9]\d*)\/blocks\/(?:0|[1-9]\d*)\/(?:rows\/(?:0|[1-9]\d*)\/cells\/(?:0|[1-9]\d*)\/)?content\/(?:0|[1-9]\d*)\/text$/.test(pointer || '')) return null
  const keys = pointer.slice(1).split('/')
  let node = materialization
  let source
  let block
  let content
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return null
    if (node.source) source = node.source
    if (node.kind === 'paragraph' || node.kind === 'table') block = node
    if (key === 'content') content = node.content
    node = node[key]
  }
  if (!block || source?.documentId !== entry.sourceLocator?.documentId
    || source?.page !== entry.sourceLocator?.page || !Array.isArray(content)
    || !content.every(run => run?.kind === 'text' && typeof run.text === 'string')
    || typeof node !== 'string' || typeof historicalText !== 'string') return null
  const runIndex = Number(keys.at(-2))
  const chunks = content.map((run, index) => index === runIndex ? historicalText : run.text)
  const start = chunks.slice(0, runIndex).join('').length
  return { chunks, start, end: start + historicalText.length, currentText: node }
}

// Recompute rather than accepting an author's asserted punctuation-only diff.
// Digits, whitespace (including newlines) and every other character are retained.
export function computeOcrNumberingProjection(report, entry, materialization, historicalText) {
  const context = targetContext(materialization, entry, historicalText)
  if (!context || entry.category !== 'ocr_misrecognition') return null
  const matches = chineseContextNumbering(context.chunks.join(''), context.chunks)
    .filter(match => match.index < context.end && match.index + match[0].length > context.start)
  // Context can disqualify an English quote/clause spanning runs, but cannot
  // supply Han from an independently mapped item to justify changing this one.
  const historicalMatches = new Set(chineseContextNumbering(historicalText).map(match => match.index))
  if (!matches.length || matches.some(match => match.index < context.start
    || match.index + match[0].length > context.end
    || !historicalMatches.has(match.index - context.start))) return null
  const characters = historicalText.split('')
  const changes = []
  for (const match of matches) {
    for (const [offset, after] of [[match.index - context.start, '（'],
      [match.index + match[0].length - 1 - context.start, '）']]) {
      changes.push({ start: offset, end: offset + 1, before: characters[offset], after })
      characters[offset] = after
    }
  }
  const after = characters.join('')
  if (context.currentText !== after || entry.after !== after) return null
  return {
    ruleVersion: CJK_NUMBERING_RULE,
    paperId: report.paperId,
    ocrRevisionId: report.ocrRevisionId,
    ocrConfirmationId: report.ocrConfirmationId,
    originalSourceSetDigest: report.originalSourceSetDigest,
    ocrEvidenceDigest: report.ocrEvidenceDigest,
    ocrItemId: entry.ocrItemId,
    sourceLocator: { documentId: entry.sourceLocator.documentId, page: entry.sourceLocator.page },
    targetPointer: entry.materializationTarget.jsonPointer,
    historicalConfirmedText: historicalText,
    offsetUnit: 'utf16',
    changes,
  }
}

export function validateOcrNumberingProjection(report, entry, materialization, historicalText) {
  if (report.schemaVersion !== OCR_NUMBERING_REPORT_VERSION || !entry.standardizationProjection) return false
  const expected = computeOcrNumberingProjection(report, entry, materialization, historicalText)
  return expected !== null && digestJson(expected) === digestJson(entry.standardizationProjection)
}

// The CLI uses the same computation as the server, from its saved exact receipt.
// Existing entries remain untouched unless their full after is a proved projection.
export function addOcrNumberingProjections(report, receipt, materialization) {
  const notes = new Map(receipt.correctionReport.entries.map(note => [note.itemId, note]))
  const entries = report.entries.map(entry => {
    if (entry.standardizationProjection) return entry
    const note = notes.get(entry.ocrItemId)
    if (!note || note.correctedText === entry.after) return entry
    const projection = computeOcrNumberingProjection(report, entry, materialization, note.correctedText)
    return projection ? { ...entry, standardizationProjection: projection } : entry
  })
  return { ...report,
    schemaVersion: entries.some(entry => entry.standardizationProjection)
      ? OCR_NUMBERING_REPORT_VERSION : report.schemaVersion,
    entries }
}
