// Immutable, source-preserving facts. Pixel word boxes and normalized observation
// regions remain separate coordinate systems; no text is repaired here.
export function computeLineFacts(line = {}) {
  const text = typeof line.text === 'string' ? line.text : ''
  // Draft item.words is a source-reference string; only physical lines supply
  // word arrays. Never mistake the reference syntax for OCR tokens.
  const words = Array.isArray(line.words) ? line.words : []
  const boxes = line.boxes || []
  const sortedWords = [...words].sort((a, b) => a.box.left - b.box.left)
  const sortedBoxes = [...boxes].sort((a, b) => a.region.y - b.region.y || a.region.x - b.region.x)
  const round = value => Number(value.toFixed(6))
  let region = line.region
  if (!region && boxes.length) {
    const left = Math.min(...boxes.map(box => box.region.x))
    const top = Math.min(...boxes.map(box => box.region.y))
    const right = Math.max(...boxes.map(box => box.region.x + box.region.width))
    const bottom = Math.max(...boxes.map(box => box.region.y + box.region.height))
    region = { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) }
  }
  const box = words.length ? {
    left: Math.min(...words.map(word => word.box.left)),
    right: Math.max(...words.map(word => word.box.left + word.box.width)),
    height: Math.max(...words.map(word => word.box.height)),
    top: Math.min(...words.map(word => word.box.top)),
    bottom: Math.max(...words.map(word => word.box.top + word.box.height)),
  } : null
  return Object.freeze({
    text, trimmed: text.trim(), nfkc: text.normalize('NFKC'),
    edgeText: text.replace(/\d+/gu, '#').replace(/\s+/gu, ''),
    page: line.page, figure: line.figure,
    wordCount: words.length, observationCount: boxes.length,
    left: line.left ?? (boxes.length ? Math.min(...boxes.map(box => box.region.x)) : box?.left),
    right: line.right ?? (boxes.length ? Math.max(...boxes.map(box => box.region.x + box.region.width)) : box?.right),
    box: box && Object.freeze(box), region: region && Object.freeze({ ...region }),
    firstWordWidth: sortedWords[0]?.box.width,
    firstObservationWidth: sortedBoxes[0]?.region.width || 0,
    // These arrays are new views, never reordered source arrays.
    sortedWords: Object.freeze(sortedWords),
    startsLower: /^[a-z]/u.test(text),
    startsUpperOrQuote: /^[A-Z“"‘']/u.test(text),
    startsEnglishOrQuote: /^[A-Za-z“"‘']/u.test(text),
    startsHan: /^\p{Script=Han}/u.test(text),
    hasHan: /\p{Script=Han}/u.test(text),
    endsHanSentence: /[。！？]$/u.test(text),
    endsThousandsPrefix: /\d,$/u.test(text),
    endsEnglishHyphen: /[A-Za-z][-‐]$/u.test(text),
    endsHyphen: /[-‐]$/u.test(text),
    atEdge: Boolean(region && (region.y < 0.12 || region.y + region.height > 0.88)),
    furnitureEdge: Boolean(region && region.height <= 0.06
      && (region.y < 0.12 || region.y + region.height > 0.88)),
  })
}
