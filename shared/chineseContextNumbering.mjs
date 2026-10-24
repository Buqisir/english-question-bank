// Shared by submission preflight and the versioned OCR standardization projection.
// Match indices are UTF-16 offsets; masking never changes their positions.
const hasChinese = text => /[\p{Script=Han}]/u.test(text)
const quotes = /“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』/gu
const englishQuote = text => /[a-z]/iu.test(text) && !hasChinese(text)
const maskEnglishQuotes = text => text.replace(quotes, quote => englishQuote(quote) ? ' '.repeat(quote.length) : quote)
// A Chinese gloss on an English word does not make its sentence Chinese.
// Keep offsets and English words; Han outside a gloss still blocks numbering.
function maskChineseGlosses(text) {
  // An inner match such as gloss(徽章) inside badge(gloss(徽章)) is not
  // a standalone gloss. Only outer, non-nested parentheses are eligible.
  const outerOpenings = new Set()
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    if (/[（(]/u.test(text[index])) {
      if (depth === 0) outerOpenings.add(index)
      depth++
    } else if (/[）)]/u.test(text[index])) depth = Math.max(0, depth - 1)
  }
  return text.replace(
    /(?<![\p{L}\p{N}_])([A-Za-z]+(?:[’'-][A-Za-z]+)*)[ \t]*(?:（([^()（）\r\n]*)）|\(([^()（）\r\n]*)\))/gu,
    (match, word, fullWidth, halfWidth, offset) => {
      const inside = fullWidth ?? halfWidth
      return outerOpenings.has(offset + match.search(/[（(]/u))
        && hasChinese(inside) && /^[\p{Script=Han} \t…，、；：。！？—·“”‘’「」《》〈〉.,;:!?-]+$/u.test(inside)
        ? word + ' '.repeat(match.length - word.length) : match
    },
  )
}
export function chineseContextNumbering(text, chunks = null) {
  return [...text.matchAll(/\(\s*\d{1,3}\s*\)/gu)].filter(match => {
    const quote = [...text.matchAll(quotes)]
      .find(q => q.index < match.index && q.index + q[0].length > match.index + match[0].length)
    if (quote && englishQuote(quote[0])) return false
    let local = text, index = match.index
    // Preserve explicitly separate English clauses such as "Include (1)".
    // A run starting with "(1) DIY" does not own the entry: Han may follow
    // in another run, and split parentheses also need the combined stream.
    let offset = 0
    for (const chunk of chunks || []) {
      if (offset <= match.index && offset + chunk.length >= match.index + match[0].length
        && !hasChinese(chunk) && /[a-z]/iu.test(chunk.slice(0, match.index - offset))) {
        local = chunk; index -= offset; break
      }
      offset += chunk.length
    }
    // Decide gloss eligibility from original text: masking a quoted English
    // word first must not turn a mixed-language parenthesis into pure Han.
    local = maskEnglishQuotes(maskChineseGlosses(local))
    const boundary = /\(\s*\d{1,3}\s*\)|[。！？.!?;；\n]/u
    const after = local.slice(index + match[0].length).split(boundary)[0]
    // Classify the whole entry, not just its first word (DIY / BBQ).
    if (/\p{L}/u.test(after)) return hasChinese(after)
    const before = local.slice(0, index).split(boundary).at(-1)
    const prior = local.slice(0, index).match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] || ''
    return hasChinese(/\p{L}/u.test(before) ? before : prior)
  })
}
