import { tokenizeSentence } from './tokenize.mjs'

export const CLITIC_WORDS = {
  "'s": ['is', 'has'],
  "'m": ['am'],
  "'re": ['are'],
  "'d": ['would', 'had'],
  "'ll": ['will'],
  "'ve": ['have'],
  "n't": ['not'],
}

const TERMINAL = new Set(['.', '!', '?', '"', '”', '’', ')', '）'])
const CLOSING = /^[,.;:!?)\]”’%，。；：！？）]/u
const OPENING = /[(\[“‘（]$/u

export function foldWord(text) {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

export function aliasOf(sentenceWord, word) {
  return Boolean(CLITIC_WORDS[sentenceWord]?.includes(word))
}

function parse(text) {
  const outside = text.replace(/\[[^\]]*\]/g, ' ')
  if (/[[\]]/.test(outside)) return null
  const pieces = []
  const pattern = /\[([^\]]*)\]|([^[]+)/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[1] !== undefined) {
      if (match[1].trim()) pieces.push({ inserted: true, text: match[1].trim() })
    } else if (match[2].trim()) {
      pieces.push({ inserted: false, text: match[2].trim() })
    }
  }
  return pieces
}

function isLower(char) {
  return char !== char.toUpperCase() && char === char.toLowerCase()
}

function alignInScope(tokens, scope, pieces, text, borrow) {
  const problems = []
  const used = new Set()
  const items = []
  let last = scope.start - 1
  const inScope = []
  for (let index = scope.start; index < scope.end; index += 1) inScope.push(index)
  for (const piece of pieces) {
    if (piece.inserted) {
      items.push({ text: piece.text })
      continue
    }
    const words = tokenizeSentence(piece.text)
    // How many of the next restore words continue from this sentence word:
    // "in front of me" should reuse the fronted "In front of me", not the "in" of a later phrase.
    const runFrom = (index, position) => {
      let length = 0
      while (
        position + length < words.length
        && index + length < scope.end
        && !used.has(index + length)
        && foldWord(tokens[index + length].text) === foldWord(words[position + length].text)
      ) length += 1
      return length
    }
    for (const [position, word] of words.entries()) {
      const folded = foldWord(word.text)
      const free = inScope.filter((index) => !used.has(index))
      const exact = free.filter((index) => foldWord(tokens[index].text) === folded)
      const alias = free.filter((index) => aliasOf(foldWord(tokens[index].text), folded))
      const longest = Math.max(0, ...exact.map((index) => runFrom(index, position)))
      const best = longest > 1 ? exact.filter((index) => runFrom(index, position) === longest) : exact
      const pick = best.find((index) => index > last) ?? best[0] ?? alias.find((index) => index > last) ?? alias[0]
      if (pick === undefined) {
        const elsewhere = borrow && tokens.some((token) => foldWord(token.text) === folded || aliasOf(foldWord(token.text), folded))
        if (word.kind === 'punct' || elsewhere) items.push({ text: word.text })
        else problems.push(`restore "${text}": "${word.text}" is not in the sentence; put added words inside [ ]`)
        continue
      }
      used.add(pick)
      last = pick
      const original = tokens[pick].text
      items.push({ index: pick, lowercase: original !== word.text && !isLower(original[0]) && isLower(word.text[0]) })
    }
  }
  if (!items.some((item) => item.index !== undefined)) problems.push(`restore "${text}": it must reuse words of the sentence`)
  if (scope.end === tokens.length && items.at(-1)?.index !== undefined) {
    let tail = scope.end
    while (tail > scope.start && TERMINAL.has(tokens[tail - 1].text) && !used.has(tail - 1)) tail -= 1
    for (let index = tail; index < scope.end; index += 1) items.push({ index, lowercase: false })
  }

  const segments = []
  for (const item of items) {
    const previous = segments.at(-1)
    if (item.index === undefined) {
      if (previous && 'text' in previous) previous.text = CLOSING.test(item.text) ? `${previous.text}${item.text}` : `${previous.text} ${item.text}`
      else segments.push({ text: item.text })
      continue
    }
    if (previous && 'start' in previous && previous.end === item.index && !item.lowercase) {
      previous.end += 1
      continue
    }
    segments.push(item.lowercase ? { start: item.index, end: item.index + 1, lowercase: true } : { start: item.index, end: item.index + 1 })
  }
  return { segments, problems }
}

// Aligns a restore sentence ("she had never seen such a crowd", added words in
// [ ]) to the analysed sentence. Scopes run from the smallest unit outwards;
// the first scope that holds every reused word wins. When none does, words
// copied from elsewhere in the sentence (the verb a gapped clause shares)
// count as added words of the smallest scope. An ellipsis restore tries that
// borrowing first, so "they have stuck" fills in one predicate of a series in
// place instead of rewriting the whole sentence down to three words.
export function alignRestore(tokens, scopes, text, { borrowFirst = false, allowBorrow = true } = {}) {
  const pieces = parse(String(text || '').trim())
  if (!pieces) return { problems: [`restore "${text}": brackets are not balanced`] }
  if (pieces.length === 0) return { problems: ['restore is empty'] }
  if (scopes.length === 0) return { problems: ['restore has no scope'] }
  let first = null
  for (const borrow of !allowBorrow ? [false] : borrowFirst ? [true, false] : [false, true]) {
    for (const scope of borrow ? scopes.slice(0, 1) : scopes) {
      const result = alignInScope(tokens, scope, pieces, text, borrow)
      first ||= result
      if (result.problems.length === 0) return { scopeId: scope.id, segments: result.segments, problems: [] }
    }
  }
  return { problems: first.problems }
}

export function restoreDisplay(sentenceText, tokens, segments) {
  const pieces = segments.map((segment) => {
    if ('text' in segment) return { text: segment.text, inserted: true }
    let text = sentenceText.slice(tokens[segment.start].start, tokens[segment.end - 1].end)
    if (segment.lowercase) text = text[0].toLowerCase() + text.slice(1)
    return { text, inserted: false }
  })
  return pieces.map((piece, index) => ({
    ...piece,
    spaceBefore: index > 0 && !CLOSING.test(piece.text) && !OPENING.test(pieces[index - 1].text),
  }))
}
