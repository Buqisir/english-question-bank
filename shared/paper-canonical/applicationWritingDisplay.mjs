const NOTICE_PREFIX_PATTERN = /^(注意(?:事项)?\p{Zs}*[：:])\s*/u
const NUMBERED_INSTRUCTION_PATTERN = /[（(]\d+[)）]|(?<![\d.])\d+[.．、](?!\d)|[一二三四五六七八九十]+[.．、]/gu

function normalizedSplitNoticeInstruction(value) {
  const text = String(value ?? '').trim()
  const parenthesized = text.match(/^[（(](\d+)[）)](.*)$/)
  if (parenthesized) return `（${parenthesized[1]}）${parenthesized[2]}`
  const dotted = text.match(/^(\d+)[.．、](?!\d)\s*(.*)$/)
  if (dotted) return `（${dotted[1]}）${dotted[2]}`
  return /^[一二三四五六七八九十]+[.．、]/u.test(text) ? text : null
}

// Reuse the split-notice recognizer before reading its ordinal. Unsupported
// or ambiguous ordinals cannot extend a combined source paragraph.
function splitNoticeInstructionNumber(value) {
  const instruction = normalizedSplitNoticeInstruction(value)
  if (!instruction) return null
  const marker = instruction.match(NUMBERED_INSTRUCTION_PATTERN)?.[0]
  const number = marker?.replace(/[（()）.．、]/gu, '') || ''
  if (/^\d+$/u.test(number)) return Number(number) > 0 ? Number(number) : null
  if (!/^(?:[一二三四五六七八九]|[一二三四五六七八九]?十[一二三四五六七八九]?)$/u.test(number)) return null
  const digit = value => '一二三四五六七八九'.indexOf(value) + 1
  if (!number.includes('十')) return digit(number)
  const [tens, ones] = number.split('十')
  return (tens ? digit(tens) : 1) * 10 + (ones ? digit(ones) : 0)
}

export function writingWordCount(text) {
  const value = String(text ?? '').normalize('NFKC')
  const chinese = value.match(/词数[^0-9]{0,20}(\d{2,3})/u)
  if (chinese) return Number(chinese[1])
  const words = value.match(/(\d{2,3})\s*(?:个?词|words?)\b/iu)
  return words ? Number(words[1]) : null
}

// Multiple notices must agree on every explicit declaration, including two
// declarations in one instruction. Unsupported/ranged declarations fail closed.
export function writingNoticeWordCountsAgree(notices, target) {
  return notices.length > 0 && notices.every(notice => {
    const counts = []
    for (const line of notice.lines.filter(line => line.kind === 'instruction')) {
      // Keep punctuation between digits inside a clause: neither decimal nor
      // grouped-number prefixes may become an apparently valid integer.
      for (const value of line.text.normalize('NFKC').split(/[；;]|(?<!\d)[，,。.．]|[，,。.．](?!\d)/u)) {
        const declarations = [
          ...value.matchAll(/词数[\s应为约大概在是须需要求]{0,20}(\d{2,3})(?![\d.,。．eExX零〇一二两三四五六七八九十百千万亿])/gu),
          ...value.matchAll(/(?<![\dA-Za-z+−.,。．零〇一二两三四五六七八九十百千万亿-])(\d{2,3})(?![\d.,。．eExX零〇一二两三四五六七八九十百千万亿])\s*(?:个?(?:单)?词|words?\b)/giu),
        ]
        // A bare word/unit mention is not a count requirement. Trigger only
        // on the count prefix or a quantity immediately followed by a unit.
        // Unknown quantities trigger validation but are never guessed as 80.
        const markers = [...value.matchAll(/词数|数\s*个(?:单)?词|(?:[0-9零〇一二两三四五六七八九十百千万亿]+|若干|几|多少|一些|少量|大量|适量)\s*个?(?:单)?词|\d+\s*words?\b|\b(?:some|several|many|few|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+words?\b/giu)]
        // 同一 is an identity determiner, not the cardinal 一. Scope this
        // distinction to its word noun phrase, never to the whole instruction:
        // a separate 词数 prefix or quantity requirement must still be checked.
        const references = [...value.matchAll(/同\s*一\s*个?\s*(?:单)?词/gu)]
        const countMarkers = markers.filter(marker => !references.some(reference =>
          marker.index >= reference.index
          && marker.index + marker[0].length <= reference.index + reference[0].length))
        if (countMarkers.some(marker => !declarations.some(declaration =>
          marker.index >= declaration.index
          && marker.index + marker[0].length <= declaration.index + declaration[0].length))) return false
        // Reject ambiguous alternatives/ranges in this count clause, without
        // interpreting unrelated numbers elsewhere in the source instruction.
        if (declarations.length && ([...value.matchAll(/(?<!\d)\d{2,}(?!\d)/gu)]
          .some(match => Number(match[0]) !== target) || /[0-9零〇一二两三四五六七八九十百千]\s*[-–—~～至到/或]\s*[0-9零〇一二两三四五六七八九十百千]/u.test(value))) return false
        counts.push(...declarations.map(match => Number(match[1])))
      }
    }
    return counts.length > 0 && counts.every(count => count === target)
  })
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
    const sourceLines = applicationWritingNoticeLines(texts[startIndex])
    if (!sourceLines) continue
    // A combined paragraph can contribute several lines before a split tail.
    // Keep both source coordinates instead of equating line and block counts.
    const lines = sourceLines.map((line, lineIndex) => ({ ...line, blockOffset: 0, lineIndex }))
    const preserveSourceNumbering = sourceLines.length > 1
    let previousNumber = null
    if (lines.length > 1) {
      const numbers = lines.slice(1).map(line => splitNoticeInstructionNumber(line.text))
      if (numbers.some((number, index) => number === null
        || (index > 0 && number !== numbers[index - 1] + 1))) {
        groups.push({ startIndex, blockCount: 1, lines })
        continue
      }
      previousNumber = numbers.at(-1)
    }
    let blockCount = 1
    for (const followingText of texts.slice(startIndex + 1)) {
      const instruction = normalizedSplitNoticeInstruction(followingText)
      if (!instruction) break
      if (previousNumber !== null) {
        const number = splitNoticeInstructionNumber(instruction)
        if (number !== previousNumber + 1) break
        previousNumber = number
      }
      lines.push({ kind: 'instruction',
        text: preserveSourceNumbering ? String(followingText).trim() : instruction,
        blockOffset: blockCount, lineIndex: 0,
        ...(preserveSourceNumbering ? { preserveSourceNumbering: true } : {}),
      })
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

// Slice source nodes rather than flattening a displayed notice. Combined
// paragraphs keep exact text offsets; split numbered paragraphs retain the
// existing display-only marker normalization only for a label-only first block.
export function writingNoticeDisplayInlines(nodes, lineIndex = 0, preserveSourceNumbering = false) {
  const text = nodes.map(node => node.text).join('')
  const start = text.length - text.trimStart().length
  const end = text.trimEnd().length
  const slice = (from, to) => {
    let offset = 0
    return nodes.flatMap(node => {
      const nodeStart = offset
      offset += node.text.length
      const value = node.text.slice(Math.max(0, from - nodeStart), Math.max(0, Math.min(node.text.length, to - nodeStart)))
      return value ? [{ ...node, text: value }] : []
    })
  }
  if (preserveSourceNumbering) return slice(start, end)
  const lines = applicationWritingNoticeLines(text)
  if (lines) {
    const from = start + lines.slice(0, lineIndex).reduce((sum, line) => sum + line.text.length, 0)
    return slice(from, from + lines[lineIndex].text.length)
  }
  const value = text.trim()
  const parenthesized = value.match(/^[（(](\d+)[）)]/u)
  if (parenthesized) {
    return [
      ...slice(start, start + 1).map(node => ({ ...node, text: '（' })),
      ...slice(start + 1, start + 1 + parenthesized[1].length),
      ...slice(start + 1 + parenthesized[1].length, start + parenthesized[0].length).map(node => ({ ...node, text: '）' })),
      ...slice(start + parenthesized[0].length, end),
    ]
  }
  const dotted = value.match(/^(\d+)[.．、](?!\d)\s*/u)
  if (!dotted) return slice(start, end)
  return [
    ...slice(start, start + 1).map(node => ({ ...node, text: '（' })),
    ...slice(start, start + dotted[1].length),
    ...slice(start + dotted[1].length, start + dotted[1].length + 1).map(node => ({ ...node, text: '）' })),
    ...slice(start + dotted[0].length, end),
  ]
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

// Source emphasis can split the placement label across several text nodes.
// Trim the same whole-text prefix while retaining every node's identity/marks.
export function continuationStarterDisplayInlines(nodes, starterIndex) {
  const text = nodes.map(node => node.text).join('')
  let remaining = text.length - continuationStarterDisplayText(text, starterIndex).length
  return nodes.map(node => {
    const count = Math.min(remaining, node.text.length)
    remaining -= count
    return count ? { ...node, text: node.text.slice(count) } : node
  })
}
