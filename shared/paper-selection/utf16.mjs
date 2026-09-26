export function isTrailSurrogate(text, index) {
  if (index < 0 || index >= text.length) return false
  const code = text.charCodeAt(index)
  return code >= 0xDC00 && code <= 0xDFFF
}

export function isLeadSurrogate(text, index) {
  if (index < 0 || index >= text.length) return false
  const code = text.charCodeAt(index)
  return code >= 0xD800 && code <= 0xDBFF
}

export function assertHalfOpenUtf16Range(text, start, end, label = 'range') {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    const error = new Error(`${label} offsets must be integers`)
    error.code = 'SELECTION_RANGE_INVALID'
    throw error
  }
  if (start < 0 || end < start || end > text.length) {
    const error = new Error(`${label} is out of bounds`)
    error.code = 'SELECTION_RANGE_INVALID'
    throw error
  }
  if (isTrailSurrogate(text, start) || isTrailSurrogate(text, end)) {
    const error = new Error(`${label} splits a surrogate pair`)
    error.code = 'SELECTION_RANGE_INVALID'
    throw error
  }
}

export function sliceUtf16(text, start, end) {
  assertHalfOpenUtf16Range(text, start, end)
  return text.slice(start, end)
}
