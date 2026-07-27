const NOTICE_PREFIX_PATTERN = /^(注意[：:])([ \t\r\n]*)(?=[(（]\d+[)）])/
const NUMBERED_INSTRUCTION_PATTERN = /[(（]\d+[)）]/g

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
