const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/uy
const CLITIC = /^(.+?)(n['’]t|['’](?:s|d|m|re|ll|ve))$/iu
const LONE_CLITIC = /['’](?:s|d|m|re|ll|ve)(?![\p{L}\p{N}])/iuy

function splitClitics(word) {
  const pieces = []
  let rest = word
  for (let match = CLITIC.exec(rest); match; match = CLITIC.exec(rest)) {
    pieces.unshift(match[2])
    rest = match[1]
  }
  return [rest, ...pieces]
}

function reject(message) {
  const error = new Error(message)
  error.code = 'SOURCE_TEXT'
  throw error
}

export function tokenizeSentence(text) {
  if (typeof text !== 'string') reject('sentence text must be a string')
  if (text.length > 0 && text !== text.trim()) reject('sentence text has leading or trailing whitespace')

  const tokens = []
  let index = 0
  while (index < text.length) {
    const whitespace = /\s+/uy
    whitespace.lastIndex = index
    if (whitespace.test(text)) {
      index = whitespace.lastIndex
      continue
    }

    // A quote cut out of a sentence can start at a clitic ("’s why"); it must
    // tokenize the same way as inside the full sentence.
    LONE_CLITIC.lastIndex = index
    if (LONE_CLITIC.test(text)) {
      tokens.push({
        index: tokens.length,
        start: index,
        end: LONE_CLITIC.lastIndex,
        text: text.slice(index, LONE_CLITIC.lastIndex),
        kind: 'word',
      })
      index = LONE_CLITIC.lastIndex
      continue
    }

    WORD.lastIndex = index
    if (WORD.test(text)) {
      for (const piece of splitClitics(text.slice(index, WORD.lastIndex))) {
        tokens.push({
          index: tokens.length,
          start: index,
          end: index + piece.length,
          text: piece,
          kind: 'word',
        })
        index += piece.length
      }
      continue
    }

    const char = String.fromCodePoint(text.codePointAt(index))
    const end = index + char.length
    tokens.push({
      index: tokens.length,
      start: index,
      end,
      text: char,
      kind: 'punct',
    })
    index = end
  }
  return tokens
}
