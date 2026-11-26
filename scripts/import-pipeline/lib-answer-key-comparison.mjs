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

export function comparePageAnswers(materialization, flags) {
  const transcriptions = new Map()
  const conflicts = []
  for (const { name, pages, answers } of flags) {
    for (const [key, value] of Object.entries(answers || {})) {
      const current = { value, name, pages }
      const first = transcriptions.get(key)
      if (!first) transcriptions.set(key, current)
      else if (!answerKeyValuesMatch(first.value, value)) conflicts.push({ key, first, current })
    }
  }
  const expected = [...(materialization.listening?.answers || []), ...(materialization.answers || [])]
  const legacy = materialization.profileId === 'national-legacy'
  const keys = new Set()
  const entries = expected.map(answer => {
    const key = legacy ? answer.questionId ?? `listening:${answer.canonicalNumber}` : String(answer.canonicalNumber)
    keys.add(key)
    return {
      ...(legacy ? { questionId: key } : {}),
      number: answer.canonicalNumber,
      answerKey: answer.value,
      transcribed: transcriptions.get(key)?.value ?? null,
    }
  })
  const missing = entries.filter(entry => entry.transcribed === null).map(entry => entry.questionId ?? entry.number)
  const mismatches = entries.filter(entry => entry.transcribed !== null
    && !answerKeyValuesMatch(entry.transcribed, entry.answerKey))
  const omitted = [...transcriptions.keys()].filter(key => !keys.has(key))
  return { compared: entries.length, conflicts, missing, mismatches, omitted, entries }
}
