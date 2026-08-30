const NOTICE_PREFIX_PATTERN = /^(注意[：:])([ \t\r\n]*)(?=[(（]\d+[)）])/
const NUMBERED_INSTRUCTION_PATTERN = /[(（]\d+[)）]/g

function normalizedSplitNoticeInstruction(value) {
  const text = String(value ?? '').trim()
  const parenthesized = text.match(/^[（(](\d+)[）)](.*)$/)
  if (parenthesized) return `（${parenthesized[1]}）${parenthesized[2]}`
  const dotted = text.match(/^(\d+)[.．、]\s*(.*)$/)
  return dotted ? `（${dotted[1]}）${dotted[2]}` : null
}

/**
 * Translate one source prompt block into visual notice lines without changing
 * or persisting canonical text. Non-numbered notice blocks remain untouched.
 */
export function applicationWritingNoticeLines(text) {
  const value = String(text ?? '')
  const prefix = value.match(NOTICE_PREFIX_PATTERN)
  if (!prefix) return null

  const instructionText = value.slice(prefix[0].length)
  const markers = [...instructionText.matchAll(NUMBERED_INSTRUCTION_PATTERN)]
  if (markers.length === 0 || markers[0].index !== 0) return null

  return [
    { kind: 'label', text: prefix[0] },
    ...markers.map((marker, index) => ({
      kind: 'instruction',
      text: instructionText.slice(
        marker.index,
        markers[index + 1]?.index ?? instructionText.length,
      ),
    })),
  ]
}

/**
 * Locate one visual notice across either a historical combined paragraph or
 * consecutive source-preserved paragraphs. The returned lines are display
 * semantics only; callers retain every Canonical block and content-node ID.
 */
export function writingNoticeGroup(texts) {
  for (const [startIndex, rawText] of texts.entries()) {
    const combinedLines = applicationWritingNoticeLines(rawText)
    if (combinedLines) {
      return { startIndex, blockCount: 1, lines: combinedLines }
    }
    const label = String(rawText ?? '').trim()
    if (!/^注意[：:]$/.test(label)) continue
    const lines = [{ kind: 'label', text: label }]
    let blockCount = 1
    for (const followingText of texts.slice(startIndex + 1)) {
      const instruction = normalizedSplitNoticeInstruction(followingText)
      if (!instruction) break
      lines.push({ kind: 'instruction', text: instruction })
      blockCount += 1
    }
    if (lines.length > 1) return { startIndex, blockCount, lines }
  }
  return null
}

const CONTINUATION_PARAGRAPH_LABELS = [
  '(?:1|one|first)',
  '(?:2|two|second)',
]

/**
 * Source/answer DOCX files sometimes label starter rows as "Paragraph 1:"
 * and "Paragraph 2:". Those labels describe answer-card placement; they are
 * not part of the given starter sentence on the real exam face. Preserve the
 * source in Canonical data, but suppress the matching label at display time.
 */
export function continuationStarterDisplayText(text, starterIndex) {
  const label = CONTINUATION_PARAGRAPH_LABELS[starterIndex]
  if (!label) return String(text ?? '')
  return String(text ?? '').replace(
    new RegExp(`^Paragraph\\s+${label}\\s*[:：]\\s*`, 'iu'),
    '',
  )
}
