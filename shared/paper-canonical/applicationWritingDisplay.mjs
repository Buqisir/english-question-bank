const NOTICE_PREFIX_PATTERN = /^(注意(?:事项)?[：:])\s*/u
const NUMBERED_INSTRUCTION_PATTERN = /[（(]\d+[)）]|(?<![\d.])\d+[.．、](?!\d)|[一二三四五六七八九十]+[.．、]/gu

function normalizedSplitNoticeInstruction(value) {
  const text = String(value ?? '').trim()
  const parenthesized = text.match(/^[（(](\d+)[）)](.*)$/)
  if (parenthesized) return `（${parenthesized[1]}）${parenthesized[2]}`
  const dotted = text.match(/^(\d+)[.．、](?!\d)\s*(.*)$/)
  if (dotted) return `（${dotted[1]}）${dotted[2]}`
  return /^[一二三四五六七八九十]+[.．、]/u.test(text) ? text : null
}

export function writingWordCount(text) {
  const value = String(text ?? '').normalize('NFKC')
  const chinese = value.match(/词数[^0-9]{0,20}(\d{2,3})/u)
  if (chinese) return Number(chinese[1])
  const words = value.match(/(\d{2,3})\s*(?:个?词|words?)\b/iu)
  return words ? Number(words[1]) : null
}

/**
 * Translate one source prompt block into visual notice lines without changing
 * or persisting canonical text. Accept the same labels as source validation.
 */
export function applicationWritingNoticeLines(text) {
  const value = String(text ?? '').trim()
  const prefix = value.match(NOTICE_PREFIX_PATTERN)
  if (!prefix) return null

  const instructionText = value.slice(prefix[0].length)
  if (!instructionText) return [{ kind: 'label', text: prefix[0] }]
  const markers = [...instructionText.matchAll(NUMBERED_INSTRUCTION_PATTERN)]
  if (markers.length === 0 || markers[0].index !== 0) {
    return [{ kind: 'label', text: prefix[0] }, { kind: 'instruction', text: instructionText }]
  }

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
export function writingNoticeGroups(texts) {
  const groups = []
  for (let startIndex = 0; startIndex < texts.length; startIndex += 1) {
    const lines = applicationWritingNoticeLines(texts[startIndex])
    if (!lines) continue
    if (lines.length > 1) {
      groups.push({ startIndex, blockCount: 1, lines })
      continue
    }
    let blockCount = 1
    for (const followingText of texts.slice(startIndex + 1)) {
      const instruction = normalizedSplitNoticeInstruction(followingText)
      if (!instruction) break
      lines.push({ kind: 'instruction', text: instruction })
      blockCount += 1
    }
    groups.push({ startIndex, blockCount, lines })
    startIndex += blockCount - 1
  }
  return groups
}

export function writingNoticeGroup(texts) {
  return writingNoticeGroups(texts)[0] || null
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
