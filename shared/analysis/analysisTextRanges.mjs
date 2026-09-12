// Transport offsets count Unicode code points, not DOM/JS UTF-16 code units.
// Text is never trimmed or normalized here: quote and offset bind exact text.
// Rendering may merge lines, but must retain each relationship.
export function assertAnalysisTextRanges(text, ranges, location = 'ranges') {
  if (typeof text !== 'string' || !Array.isArray(ranges) || ranges.length === 0) {
    throw new Error(`${location}: expected text and non-empty ranges`)
  }
  const points = Array.from(text)
  for (const [index, range] of ranges.entries()) {
    const label = `${location}/${index}`
    if (!range || typeof range !== 'object' || Array.isArray(range)
      || Object.keys(range).length !== 3
      || !['start', 'end', 'quote'].every((key) => Object.hasOwn(range, key))) {
      throw new Error(`${label}: expected exactly start, end, quote`)
    }
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start < 0 || range.end <= range.start || range.end > points.length) {
      throw new Error(`${label}: invalid Unicode code-point range`)
    }
    if (typeof range.quote !== 'string'
      || range.quote !== points.slice(range.start, range.end).join('')) {
      throw new Error(`${label}/quote: does not match the exact text range`)
    }
  }
}

// Explicit legacy conversion only. Repeated strings need supplied offsets; an
// ambiguous historical selection must not silently become its first occurrence.
export function legacyUnderlineRanges(text, underlineTexts) {
  if (typeof text !== 'string' || !Array.isArray(underlineTexts)
    || underlineTexts.length === 0) {
    throw new Error('underlineTexts: expected text and non-empty selections')
  }
  return underlineTexts.map((quote, index) => {
    const start = typeof quote === 'string' && quote.length > 0 ? text.indexOf(quote) : -1
    if (start < 0 || start !== text.lastIndexOf(quote)) {
      throw new Error(`underlineTexts/${index}: selection must match exactly once; supply underlineRanges`)
    }
    return {
      start: Array.from(text.slice(0, start)).length,
      end: Array.from(text.slice(0, start + quote.length)).length,
      quote,
    }
  })
}

// Indices retain every original range, including identical and overlapping
// ranges. Consumers can attach their IDs/question relations without guesswork.
export function partitionAnalysisText(text, ranges) {
  if (ranges.length === 0) return [{ text, start: 0, end: Array.from(text).length, rangeIndices: [] }]
  assertAnalysisTextRanges(text, ranges)
  const points = Array.from(text)
  const boundaries = [...new Set([0, points.length, ...ranges.flatMap(({ start, end }) => [start, end])])]
    .sort((a, b) => a - b)
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]
    return {
      text: points.slice(start, end).join(''),
      start,
      end,
      rangeIndices: ranges.flatMap((range, rangeIndex) =>
        range.start <= start && range.end >= end ? [rangeIndex] : []),
    }
  })
}
