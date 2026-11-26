import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'
import { indexPhraseOccurrence, locatePhraseOccurrence,
  normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { isStandardSearchForm } from '../../../server/paper-dictionary/store.mjs'

const fold = text => normalizePhraseText(text).text.toLowerCase().replace(/^([ap])\.\s*m\.?$/u, '$1.m.')
const tokens = text => [...text.matchAll(/[ap]\.\s*m\.?(?!\.?[\p{L}\p{M}\p{N}])|\p{L}[\p{L}\p{M}\p{N}]*(?:['‘’-][\p{L}\p{M}\p{N}]+)*(?:['’](?<=s['’]))?|\p{N}+|[^\s]/giu)]
const slotWord = /^[\p{Script=Latin}\d][\p{Script=Latin}\p{M}\d'-]*$/u
const possessive = /^(?:my|your|his|her|its|our|their|one's|.+(?:'s|s'))$/u
const empty = /\b(?:grammar-fill)\b/u
const gap = /__+[\s\d]*__+|_{3,}|_{2,}\s*\d+\s*_{2,}/u

export function matcher(entries) {
  const wordIndex = new Map()
  const phraseIndex = new Map()
  const formsOf = entry => [entry.headword, ...entry.variants,
    ...entry.forms.filter(({ tags }) => isStandardSearchForm(tags)).map(({ form }) => form)]
  for (const entry of entries.values()) {
    if (entry.kind === 'phrase') {
      const patterns = [...entry.pattern?.alternatives ?? [], ...formsOf(entry).map(text =>
        tokens(fold(text)).map(([token]) => token === "one's" ? { slot: token } : token))]
      for (const pattern of patterns) {
        const first = typeof pattern[0] === 'string' ? fold(pattern[0]) : null
        if (!phraseIndex.has(first)) phraseIndex.set(first, [])
        phraseIndex.get(first).push({ entry, pattern })
      }
    } else if (entry.lists?.some(list => list === '3000' || list === '3100')) {
      for (const form of formsOf(entry)) {
        const key = fold(form)
        if (!wordIndex.has(key)) wordIndex.set(key, new Set())
        wordIndex.get(key).add(entry)
      }
    }
  }
  return (paperId, block) => {
    const { raw, groupId, kind, id, hash } = block
    const source = { paperId, groupId, [kind === 'paragraph' ? 'paragraphId' : 'questionId']: id, blockHash: hash }
    const rows = new Map()
    const normalized = normalizePhraseText(raw)
    for (const [i, sentence] of splitSentences(raw).entries()) {
      const text = sentence.text.trim()
      if (!text || (empty.test(groupId) && gap.test(text))) continue
      const origin = sentence.start + sentence.text.length - sentence.text.trimStart().length
      const skip = text.match(/^\([a-z -]+\)\s*/iu)?.[0].length ?? 0
      const items = tokens(text).filter(t => t.index >= skip).map(t =>
        ({ word: fold(t[0]), start: origin + t.index, end: origin + t.index + t[0].length }))
      const add = (entry, fixed) => {
        const parts = []
        for (const j of fixed) {
          if (fixed.includes(j - 1)) parts.at(-1)[1] = items[j].end
          else parts.push([items[j].start, items[j].end])
        }
        const [start, end] = [parts[0][0], parts.at(-1)[1]]
        const span = indexPhraseOccurrence(raw, { start: origin, text }, [start, end],
          parts.length > 1 ? parts : undefined)
        const row = { ...source, entryId: entry.entryId, sentence: i + 1, ...span }
        if (entry.kind === 'phrase' && !locatePhraseOccurrence(normalized, row, text, entry)) return
        rows.set(JSON.stringify([row.entryId, row.sentence, row.start, row.end, row.parts]), row)
      }
      for (const [j, item] of items.entries()) {
        const candidates = wordIndex.get(item.word)
        if (candidates?.size) {
          const exact = [...candidates].filter(e => fold(e.headword) === item.word)
          const choices = exact.length ? exact : [...candidates]
          if (choices.length === 1) add(choices[0], [j])
        }
        for (const { entry, pattern } of [...phraseIndex.get(item.word) ?? [], ...phraseIndex.get(null) ?? []]) {
          for (const fixed of matchPattern(pattern, items, j)) if (fixed.length) add(entry, fixed)
        }
      }
    }
    return [...rows.values()]
  }
}

function matchPattern(pattern, items, at, step = 0, fixed = []) {
  if (step === pattern.length) return [fixed]
  const item = items[at]
  if (!item) return []
  const token = pattern[step]
  if (typeof token === 'string') {
    return item.word === fold(token) ? matchPattern(pattern, items, at + 1, step + 1, [...fixed, at]) : []
  }
  if (token.slot === "one's") {
    return possessive.test(item.word) ? matchPattern(pattern, items, at + 1, step + 1, [...fixed, at]) : []
  }
  const matches = []
  for (let length = 1; length <= 3 && slotWord.test(items[at + length - 1]?.word ?? ''); length++) {
    matches.push(...matchPattern(pattern, items, at + length, step + 1, fixed))
  }
  return matches
}

const envelope = row => [row.sentenceStart + row.start, row.sentenceStart + row.end]
const overlap = ([a, b], [c, d]) => a < d && c < b
export function phraseWinners(rows, priority = () => 0) {
  const accepted = []
  const parts = row => row.parts ?? [[row.start, row.end]]
  const length = row => parts(row).reduce((sum, [a, b]) => sum + b - a, 0)
  const words = row => parts(row).reduce((sum, [a, b]) =>
    sum + [...row.sentenceText].slice(a, b).join('').split(/\s+/u).length, 0)
  for (const row of [...rows].sort((a, b) => priority(b) - priority(a) || words(b) - words(a) || length(b) - length(a) ||
    envelope(a)[0] - envelope(b)[0] || envelope(a)[1] - envelope(b)[1] || a.entryId.localeCompare(b.entryId))) {
    if (!accepted.some(previous => overlap(envelope(previous), envelope(row)))) accepted.push(row)
  }
  return accepted
}
