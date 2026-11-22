export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Passage words as printed: a line separator inside a paragraph (a lecture
// list keeps each lecture's name and date on lines of their own) stays a
// line break, so 「下一行」 on the page means the next line of the paper.
export function passageHtml(value) {
  return escapeHtml(value).replaceAll('\u2028', '<br>')
}

export function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function withoutClosingPunctuation(value) {
  return nonEmptyString(value).replace(/[。．.!！?？；;，,]+$/u, '')
}

export function innerQuote(value) {
  return String(value ?? '').replace(/"([^"]*)"/gu, '‘$1’').replaceAll('“', '‘').replaceAll('”', '’')
}

export function array(value) {
  return Array.isArray(value) ? value : []
}

export function paragraphLines(value) {
  return nonEmptyString(value)
    .split(/\n\s*\n|\n/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function paragraphBlocks(value, className = '') {
  return paragraphLines(value).map((paragraph) =>
    `<p${className ? ` class="${className}"` : ''}>${escapeHtml(paragraph)}</p>`)
}

export function exactTextRange(text, { start, end, quote }) {
  return typeof text === 'string' && Number.isSafeInteger(start) && Number.isSafeInteger(end)
    && start >= 0 && end > start && end <= Array.from(text).length
    && Array.from(text).slice(start, end).join('') === quote
}
