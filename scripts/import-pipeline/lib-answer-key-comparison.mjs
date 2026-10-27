const normalize = (value) => String(value ?? '').replace(/[’]/gu, "'").replace(/\s+/gu, ' ').trim().toLowerCase()

// Recognize Chinese separators only when the entire value consists of English
// alternatives; leave every other value to the existing literal/slash rules.
function normalizeChineseAlternatives(value) {
  if (!value.includes('或者')) return value
  const parts = value.split(/或者|\//u)
  const englishPhrase = /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/u
  if (!parts.every(part => englishPhrase.test(part.trim()))) return value
  return value.replace(/或者/gu, '/')
}

export function answerKeyValuesMatch(transcribed, answerKey) {
  const left = normalizeChineseAlternatives(normalize(transcribed))
  const right = normalizeChineseAlternatives(normalize(answerKey))
  // Only slash-delimited alternatives are sets. Single answers retain their
  // existing word boundaries; empty alternatives never establish equivalence.
  if (!left.includes('/') || !right.includes('/')) return left === right
  const alternatives = value => value.split('/').map(part => part.replace(/\s+/gu, ''))
  const leftParts = alternatives(left)
  const rightParts = alternatives(right)
  if (leftParts.some(part => !part) || rightParts.some(part => !part)) return false
  const leftSet = new Set(leftParts)
  const rightSet = new Set(rightParts)
  return leftSet.size === rightSet.size && [...leftSet].every(part => rightSet.has(part))
}
