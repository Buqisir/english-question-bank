import { classifyCompleteEnglishWord } from '../../shared/paper-dictionary/wordToken.mjs'

export const normalizeSearch = text => text.normalize('NFC').trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase()
const possessive = /^(?:my|your|his|her|its|our|their|one's|[a-z][a-z'-]*'s|[a-z]+s')$/u
const reflexive = /^(?:oneself|myself|yourself|himself|herself|itself|ourselves|yourselves|themselves)$/u
const person = /^(?:sb|me|you|him|her|us|them|someone|somebody|anyone|anybody|everyone|everybody)$/u
const thing = /^(?:sth|it|this|that|these|those|something|anything|everything|nothing)$/u
const determiner = /^(?:a|an|the|some|any|each|every|this|that|these|those)$/u
const slotNames = new Set(["one's", 'oneself', 'sb', 'sth', 'sb/sth', 'do', 'doing', '…'])
const spacePhrasePunctuation = text => text.replace(/…|\.\.\./gu, ' … ').replace(/,/gu, ' , ')
const exactWord = word => classifyCompleteEnglishWord(word, 0, word.length)?.surface === word
const objectSlot = { slot: 'sb/sth' }

function searchPatterns(headword, variants, pattern) {
  const canonical = normalizeSearch(spacePhrasePunctuation(headword)).replace(/[()]/g, '').split(' ')
  const patterns = [pattern.tokens, ...pattern.alternatives].map(tokens => tokens.map(token =>
    token === 'oneself' ? { slot: token } : token))
  // Some occurrence patterns only index the fixed words, omitting the
  // advertised object at the end of the dictionary headword.
  const recorded = patterns.length
  const verbSlots = new Set(patterns.flat().filter(token => typeof token === 'object').map(token => token.slot))
  for (const form of [headword, ...variants]) {
    const declared = normalizeSearch(spacePhrasePunctuation(form)).replace(/[()]/g, '')
    const forms = declared.includes('sth/doing sth')
      ? [declared.replace('sth/doing sth', 'sth'), declared.replace('sth/doing sth', 'doing sth')]
      : [declared]
    for (const text of forms) {
      const words = text.split(' ')
      const withSlots = words.map((token, index) =>
        slotNames.has(token) && (!['do', 'doing'].includes(token) ||
          index > 0 && (verbSlots.has(token) || words[index + 1] === 'sth'))
          ? { slot: token } : token)
      if (withSlots.some(token => typeof token === 'object') || !pattern.tokens.length) patterns.push(withSlots)
    }
  }
  if (pattern.separable && pattern.tokens.length === 2) {
    const [verb, particle] = pattern.tokens
    if (typeof verb === 'string' && typeof particle === 'string'
      && !patterns.some(tokens => typeof tokens[1] === 'object')) {
      patterns.push([verb, objectSlot, particle])
    }
  }
  return patterns.map((tokens, index) => ({
    tokens, fixed: tokens.find(token => typeof token === 'string'), recorded: index < recorded,
    inflect: tokens.map((token, at) => typeof token === 'string' && token === canonical[at]),
  })).filter(({ tokens, fixed }) => tokens.length >= 2 && fixed)
}

function matchSlot(slot, words, start, end, lexicon, isName) {
  const word = words[start]
  if (end === start + 1) {
    if (slot === "one's") return possessive.test(word)
    if (slot === 'oneself') return reflexive.test(word)
    if (slot === 'do') return word === 'do' || lexicon(word).some(row => row.verb && row.lemma === word)
    if (slot === 'doing') return word === 'doing' || lexicon(word).some(row => row.gerund)
    if (word === 'sb/sth') return slot === word
    if (person.test(word)) return slot !== 'sth'
    if (thing.test(word)) return slot !== 'sb' || word === 'it'
  }
  if (slot !== 'sth' && end - start <= 2 && isName(start, end)) return true
  if (slot !== 'sth' && slot !== 'sb/sth') return false
  const noun = token => lexicon(token).some(row => row.noun)
  return noun(words[end - 1]) && words.slice(start, end - 1).every((token, index) =>
    (index === 0 && (determiner.test(token) || possessive.test(token))) ||
    lexicon(token).some(row => row.noun || row.adjective || row.gerund))
}

function patternScore({ tokens, inflect }, words, lexicon, isName) {
  function match(index, at) {
    if (index === tokens.length) return at === words.length ? 0 : -1
    const token = tokens[index]
    if (token.slot === '…') {
      let best = -1
      for (let end = at; end <= Math.min(at + 6, words.length); end++) {
        best = Math.max(best, match(index + 1, end))
      }
      return best
    }
    if (at === words.length) return -1
    if (typeof token === 'string') {
      const exact = words[at] === token
      // Recorded variants match literally. Only the canonical verb can
      // receive new forms, so sawed cannot match the variant saw off.
      if (!exact && (!inflect[index] || words[at] === '…' ||
        !lexicon(words[at]).some(row => row.verb && row.lemma === token))) return -1
      const rest = match(index + 1, at + 1)
      return rest < 0 ? -1 : rest + 1024 + (exact ? 1 : 0)
    }
    if (!slotNames.has(token.slot)) return -1
    const remaining = tokens.length - index - 1
    const maxEnd = ['sb', 'sth', 'sb/sth'].includes(token.slot)
      ? words.length - remaining : at + 1
    let best = -1
    for (let end = at + 1; end <= maxEnd; end++) {
      if (!matchSlot(token.slot, words, at, end, lexicon, isName)) continue
      const rest = match(index + 1, end)
      if (rest >= 0) {
        const specificity = ['do', 'doing', 'oneself', "one's"].includes(token.slot) ? 32
          : token.slot === 'sb' && words[at] === 'it' ? 0 : token.slot === 'sb/sth' ? 1 : 16
        best = Math.max(best, rest + specificity)
      }
    }
    return best
  }
  return match(0, 0)
}

function addIndex(index, key, value) {
  if (!index.has(key)) index.set(key, [])
  index.get(key).push(value)
}

function searchResult(ids) {
  const [entryId, ...alternatives] = [...new Set(ids.filter(Boolean))].slice(0, 4)
  return entryId ? { entryId, alternatives } : null
}
const spaced = word => word.replace(/-/g, ' ')

export function createOtterSearch(entries, lookupForms, commonWords) {
  const exact = new Map()
  const literal = new Map()
  const literalVariants = new Map()
  const foldedVariants = new Map()
  const aliases = new Map()
  const compounds = new Map()
  const headwords = new Map()
  const local = new Map()
  const patterns = new Map()
  const leadingSlots = new Map()
  for (const { entryId, headword, variants, forms, kind, pattern, positions, counts } of entries) {
    const lemma = normalizeSearch(headword)
    addIndex(exact, lemma, entryId)
    addIndex(literal, headword.normalize('NFC'), entryId)
    for (const variant of variants) {
      addIndex(literalVariants, variant.normalize('NFC'), entryId)
      addIndex(foldedVariants, normalizeSearch(variant), entryId)
    }
    for (const form of [headword, ...variants, ...forms.map(item => item.form)]) {
      addIndex(aliases, normalizeSearch(form), entryId)
      addIndex(compounds, spaced(normalizeSearch(form)), entryId)
    }
    if (kind === 'phrase') {
      for (const match of searchPatterns(headword, variants, pattern ?? { tokens: [], alternatives: [] })) {
        addIndex(typeof match.tokens[0] === 'string' ? patterns : leadingSlots, match.fixed, { entryId, ...match })
      }
      continue
    }
    headwords.set(lemma, { entryId, counts })
    const verb = positions.has('v.')
    const noun = positions.has('n.')
    const adjective = positions.has('adj.')
    for (const form of [{ form: headword, tags: [] }, ...variants.map(form => ({ form, tags: [] })), ...forms]) {
      const tags = form.tags ?? []
      addIndex(local, normalizeSearch(form.form), { lemma,
        noun: noun && (!tags.length || tags.includes('plural')),
        adjective: adjective && (!tags.length || tags.includes('comparative') || tags.includes('superlative')),
        verb: verb && (!tags.length || tags.includes('past') || tags.includes('present') || tags.includes('participle')),
        gerund: verb && tags.includes('participle') && tags.includes('present') })
    }
  }

  const isListed = word => local.has(word) || commonWords.has(word)
  function isCommonWord(word) {
    if (isListed(word)) return true
    return ['ly', 's', 'es', 'ed', 'ing'].some(suffix => {
      if (!word.endsWith(suffix)) return false
      const stem = word.slice(0, -suffix.length)
      return isListed(stem) || isListed(`${stem}e`)
        || (stem.endsWith('i') && isListed(`${stem.slice(0, -1)}y`))
        || (/([^aeiou])\1$/u.test(stem) && isListed(stem.slice(0, -1)))
    })
  }

  return function search(surface, db, findId) {
    const query = normalizeSearch(surface)
    const spelling = surface.normalize('NFC').trim()
    const aliasIds = aliases.get(query) ?? []
    const preferred = [...(literal.get(spelling) ?? []), ...(literalVariants.get(spelling) ?? []),
      ...(exact.get(query) ?? []), ...(foldedVariants.get(query) ?? []), findId(surface)]
    const compoundIds = compounds.get(spaced(query)) ?? []
    const compound = new Set(compoundIds).size === 1 ? compoundIds[0] : null

    const cache = new Map()
    function lexicon(word) {
      if (!cache.has(word)) cache.set(word, [...lookupForms(db, word), ...(local.get(word) ?? [])])
      return cache.get(word)
    }
    const punctuated = spacePhrasePunctuation(surface)
    const words = normalizeSearch(punctuated).split(' ')
    if (words.length === 1) {
      const ranked = rows => rows.map(row => headwords.get(row.lemma)).filter(Boolean)
        .sort((a, b) => b.counts.gaokao - a.counts.gaokao || b.counts.mock - a.counts.mock
          || a.entryId.localeCompare(b.entryId))
        .map(row => row.entryId)
      return searchResult([...preferred, compound, ...ranked(lookupForms(db, query)),
        ...ranked(lexicon(query)), ...aliasIds])
    }
    if (!words.every(word => word === '…' || word === ',' || word.split('/').every(exactWord))) {
      return searchResult([...preferred, ...aliasIds, compound])
    }
    const rawWords = punctuated.trim().split(/\s+/u)
    function isName(start, end) {
      if (lexicon(words.slice(start, end).join(' ')).some(row => row.name)) return true
      return rawWords.slice(start, end).every((word, index) => {
        const folded = words[start + index]
        const rows = lexicon(folded)
        return /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*$/u.test(word)
          && (rows.some(row => row.name) || (rows.length === 0 && !isCommonWord(folded)))
      })
    }
    const anchors = new Set([words[0], ...lexicon(words[0]).filter(row => row.verb).map(row => row.lemma)])
    const scores = new Map()
    const templates = [
      ...[...anchors].flatMap(anchor => patterns.get(anchor) ?? []),
      ...[...new Set(words.slice(1))].flatMap(anchor => leadingSlots.get(anchor) ?? []),
    ]
    for (const template of templates) {
      const { entryId, recorded } = template
      const matched = patternScore(template, words, lexicon, isName)
      if (matched < 0) continue
      const score = matched + (recorded ? 0.5 : 0)
      scores.set(entryId, Math.max(scores.get(entryId) ?? -1, score))
    }
    const ids = [...scores].sort(([a, first], [b, second]) => second - first || a.localeCompare(b)).map(([id]) => id)
    return searchResult([...preferred, ...aliasIds, compound, ...ids])
  }
}
