const CREDENTIAL = new RegExp([
  '(?:bearer\\s+[a-z0-9._\\-+/=]{8,})',
  '(?:(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|cookie|set-cookie|cf-access-jwt-assertion)\\s*[:=]\\s*\\S+)',
  '(?:sk-[a-z0-9]{8,})',
  '(?:ghp_[a-z0-9]{20,})',
  '(?:gho_[a-z0-9]{20,})',
  '(?:AKID[a-z0-9]{8,})',
  '(?:eyJ[a-z0-9_-]{20,}\\.[a-z0-9_-]{10,}\\.[a-z0-9_-]{10,})',
].join('|'), 'giu')

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu
const UNCLEANABLE = /(?:-----BEGIN (?:RSA )?PRIVATE KEY-----|\bpassword\b|\btoken\b|\bsecret\b|\bcookie\b)/iu
const HEADER_LINE = /^(?:authorization|cookie|set-cookie|cf-access-jwt-assertion|x-api-key)\s*:/iu

export function redactText(text) {
  return String(text ?? '')
    .replace(CREDENTIAL, '[redacted]')
    .replace(EMAIL, '[redacted-email]')
}

const LEAKED_SECRET = /(?:sk-[a-z0-9]{8,}|ghp_[a-z0-9]{20,}|gho_[a-z0-9]{20,}|eyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.)/iu

export function shouldOmitLogLine(line) {
  const raw = String(line ?? '')
  if (!raw.trim()) return true
  if (HEADER_LINE.test(raw.trim())) return true
  if (raw.includes('\0')) return true
  const redacted = redactText(raw)
  if (LEAKED_SECRET.test(redacted)) return true
  if (UNCLEANABLE.test(raw) && /[A-Za-z0-9+/=_-]{32,}/u.test(raw) && !redacted.includes('[redacted]')) {
    return true
  }
  return false
}

export function sanitizeLogLine(line, maxChars = 400) {
  if (shouldOmitLogLine(line)) return null
  const redacted = redactText(line).replace(/\s+/gu, ' ').trim()
  if (!redacted) return null
  if (redacted.length > maxChars) return `${redacted.slice(0, maxChars)}…`
  return redacted
}

export function pickHealthFields(payload, statusCode, latencyMs) {
  const ok = payload && typeof payload === 'object' ? payload.ok === true : false
  return {
    ok,
    statusCode,
    latencyMs,
  }
}
