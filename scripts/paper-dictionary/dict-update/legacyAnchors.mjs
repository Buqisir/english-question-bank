import { normalizeSearch } from '../../../server/paper-dictionary/otterSearch.mjs'
import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'
import { locatePhraseOccurrence, normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { position } from './annotations.mjs'

const spanKey = row => JSON.stringify([row.sentence, row.start])
const compareAnchors = (a, b) => a.sentence - b.sentence || a.start - b.start
const leftEdge = /[\p{L}\p{M}\p{N}]['-]?$/u
const rightEdge = /^(?:[\p{L}\p{M}\p{N}]|['-][\p{L}\p{M}\p{N}])/u
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

function searchOffsets(text) {
  const quote = normalizePhraseText(text)
  const composed = quote.text.normalize('NFC')
  if (composed === quote.text) return quote
  const starts = []
  const ends = []
  let offset = 0
  for (const { segment, index } of graphemes.segment(quote.text)) {
    starts[offset] = quote.starts[index]
    offset += segment.normalize('NFC').length
    ends[offset] = quote.ends[index + segment.length]
  }
  return { text: composed, starts, ends }
}

// Pair the shorter sequence with the closest ordered subsequence of the longer one.
function orderedPairs(old, current, distance) {
  if (old.length > current.length) {
    return orderedPairs(current, old, (row, saved) => distance(saved, row)).map(([row, saved]) => [saved, row])
  }
  const costs = Array.from({ length: old.length + 1 }, () => Array(current.length + 1).fill(Infinity))
  costs[0].fill(0)
  for (let i = 1; i <= old.length; i++) for (let j = 1; j <= current.length; j++) {
    costs[i][j] = Math.min(costs[i][j - 1], costs[i - 1][j - 1] + distance(old[i - 1], current[j - 1]))
  }
  const pairs = []
  for (let i = old.length, j = current.length; i > 0; j--) {
    if (costs[i][j] === costs[i][j - 1]) continue
    pairs.push([old[--i], current[j - 1]])
  }
  return pairs.reverse()
}

export function reanchorLegacy(paperId, block, confirmed, matches, entries) {
  const reasons = new Map()
  const assigned = new Map()
  const review = new Set()
  if (!confirmed.length) return { rows: matches, assigned, reasons, review }
  const normalized = normalizePhraseText(block.raw)
  const sentences = splitSentences(block.raw).map(({ text, start }, index) => ({
    sentence: index + 1, sentenceText: text.trim(),
    sentenceStart: [...block.raw.slice(0, start + text.length - text.trimStart().length)].length,
    quote: searchOffsets(text.trim()),
  }))
  const source = { paperId, groupId: block.groupId, blockHash: block.hash,
    [block.kind === 'paragraph' ? 'paragraphId' : 'questionId']: block.id }
  const hits = new Map(matches.map(row => [position(row), row]))
  const confirmedAt = Map.groupBy(confirmed, position)
  const anchored = new Set()
  for (const row of matches) {
    const phrase = entries.get(row.entryId).kind === 'phrase'
    const saved = (confirmedAt.get(position(row)) ?? []).filter(old =>
      old.surface === row.surface && (!phrase || old.blockHash === row.blockHash))
    if (!saved.length) continue
    assigned.set(row, saved)
    for (const old of saved) anchored.add(old)
  }
  const matchesAt = Map.groupBy(matches, spanKey)
  const groups = Map.groupBy(confirmed.filter(row => !anchored.has(row)),
    row => JSON.stringify([row.entryId, normalizeSearch(row.surface)]))
  for (const savedRows of groups.values()) {
    const sample = savedRows[0]
    const entry = entries.get(sample.entryId)
    if (!entry) {
      for (const row of savedRows) reasons.set(row, 'removedEntry')
      continue
    }
    const phrase = entry.kind === 'phrase'
    const form = normalizeSearch(sample.surface)
    if (!form) continue
    const locks = [...assigned.keys()].filter(row => row.entryId === entry.entryId &&
      normalizeSearch(row.surface) === form).sort(compareAnchors)
    const locked = new Set(locks.map(spanKey))
    const segment = row => locks.filter(lock => compareAnchors(lock, row) < 0).length
    const expression = new RegExp(escape(form), 'giu')
    const candidates = []
    for (const { quote, ...sentence } of sentences) {
      const chars = [...sentence.sentenceText]
      for (const match of quote.text.matchAll(expression)) {
        const from = match.index
        const to = from + match[0].length
        if (leftEdge.test(quote.text.slice(0, from)) || rightEdge.test(quote.text.slice(to))) continue
        const start = quote.starts[from]
        const end = quote.ends[to]
        if (start === undefined || end === undefined) continue
        const row = { ...source, ...sentence, entryId: entry.entryId, start, end, surface: chars.slice(start, end).join('') }
        candidates.push({ row, from, quote })
      }
    }
    const old = [...Map.groupBy(savedRows, position).values()].sort(([a], [b]) => compareAnchors(a, b))
    const distance = ([saved], { row }) => {
      const origin = saved.sentenceStart ?? sentences[saved.sentence - 1]?.sentenceStart ?? 0
      return Math.abs(origin + saved.start - row.sentenceStart - row.start)
    }
    const candidateSegments = Map.groupBy(candidates.filter(({ row }) => !locked.has(spanKey(row))), ({ row }) => segment(row))
    const pairs = [...Map.groupBy(old, ([row]) => segment(row))].flatMap(([i, rows]) =>
      orderedPairs(rows, candidateSegments.get(i) ?? [], distance))
    for (const [saved, candidate] of pairs) {
      const [first] = saved
      const { row, from, quote } = candidate
      if (phrase && first.parts) {
        const oldForm = searchOffsets(first.surface)
        row.parts = first.parts.map(([a, b]) => [
          quote.starts[from + oldForm.starts.indexOf(a - first.start)],
          quote.ends[from + oldForm.ends.indexOf(b - first.start)],
        ])
      }
      const key = position(row)
      const target = hits.get(key) ?? row
      if (assigned.has(target)) continue
      const other = (matchesAt.get(spanKey(row)) ?? []).filter(hit => hit.entryId !== row.entryId &&
        normalizeSearch(hit.surface).replace(/'$/, '') === form.replace(/'$/, ''))
      if (other.length) {
        for (const item of saved) reasons.set(item, 'changedEntry')
        for (const hit of other) review.add(hit)
        continue
      }
      if (phrase && !locatePhraseOccurrence(normalized, target, target.sentenceText, entry)) {
        for (const item of saved) reasons.set(item, 'invalidPhrase')
        continue
      }
      const verified = []
      for (const item of saved) {
        if (phrase && item.blockHash !== block.hash) {
          reasons.set(item, 'phraseHash')
          if (hits.has(key)) review.add(target)
        } else verified.push(item)
      }
      if (verified.length) {
        hits.set(key, target)
        assigned.set(target, verified)
      }
    }
    for (const row of savedRows) if (!reasons.has(row)) reasons.set(row, candidates.length ? 'unassignedAnchor' : 'missingForm')
  }
  return { rows: [...hits.values()], assigned, reasons, review }
}
