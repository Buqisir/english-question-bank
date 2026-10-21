// Match the existing padded Base64 grammar without a repeated regexp group:
// V8 can exhaust its regexp stack on multi-megabyte source evidence.
// Empty strings and non-zero pad bits (for example AB==) remain accepted.
export function isBase64String(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false
  let end = value.length
  if (end > 0 && value.charCodeAt(end - 1) === 61) {
    end--
    if (value.charCodeAt(end - 1) === 61) end--
  }
  for (let index = 0; index < end; index++) {
    const code = value.charCodeAt(index)
    if (
      (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47
    ) continue
    return false
  }
  return true
}
