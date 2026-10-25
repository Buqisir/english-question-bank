const normalize = (value) => String(value ?? '').replace(/[’]/gu, "'").replace(/\s+/gu, ' ').trim().toLowerCase()

export function answerKeyValuesMatch(transcribed, answerKey) {
  const left = normalize(transcribed)
  const right = normalize(answerKey)
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
