import { normalizeSearch } from '../../../server/paper-dictionary/otterSearch.mjs'
import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'
import { locatePhraseOccurrence, normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { position } from './annotations.mjs'

const spanKey = row => JSON.stringify([row.sentence, row.start])
const leftEdge = /(?:[\p{L}\p{M}\p{N}]|[\p{L}\p{M}\p{N}]'|[\p{L}\p{M}]-)$/u
const rightEdge = /^(?:[\p{L}\p{M}\p{N}]|'[\p{L}\p{M}\p{N}]|-[\p{L}\p{M}])/u
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

export function reanchorLegacy(paperId, block, confirmed, matches, entries, exampleQuotes = new Map()) {
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
  const matchesAt = Map.groupBy(matches, spanKey)
  const byQuote = Map.groupBy(sentences, row => normalizeSearch(row.sentenceText))
  const quoteAnchor = row => JSON.stringify([position(row), row.senseId])
  const quotesAt = new Map()
  for (const row of confirmed) {
    const quote = row.sentenceText ?? exampleQuotes.get(row)
    if (!quote) continue
    const key = quoteAnchor(row)
    const quotes = quotesAt.get(key) ?? new Set()
    quotes.add(normalizeSearch(quote))
    quotesAt.set(key, quotes)
  }
  const originalQuote = row => {
    const quote = row.sentenceText ?? exampleQuotes.get(row)
    if (quote) return normalizeSearch(quote)
    const aliases = quotesAt.get(quoteAnchor(row))
    return aliases?.size === 1 ? aliases.values().next().value : undefined
  }
  const groups = Map.groupBy(confirmed, row => JSON.stringify([row.entryId, normalizeSearch(row.surface)]))
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
    const bySentence = Map.groupBy(candidates, ({ row }) => row.sentence)
    const proposed = []
    for (const saved of Map.groupBy(savedRows, old => JSON.stringify([
      position(old), old.blockHash, originalQuote(old),
    ])).values()) {
      const [first] = saved
      const quote = originalQuote(first)
      const matchingSentences = quote ? (byQuote.get(quote) ?? []) : []
      const sentence = quote
        ? (matchingSentences.find(row => row.sentence === first.sentence) ??
          (matchingSentences.length === 1 ? matchingSentences[0] : undefined))
        : sentences[first.sentence - 1]
      const local = bySentence.get(sentence?.sentence) ?? []
      let candidate = local.find(({ row }) => row.start === first.start && row.end === first.end)
      if (!candidate && local.length === 1) candidate = local[0]
      if (!candidate) {
        // A same-hash phrase can still have a valid archived sentence when the
        // current splitter divides it differently (for example, before dialogue).
        const { senseId, ...legacy } = first
        const archived = { ...legacy, ...source }
        if (phrase && first.blockHash === block.hash &&
          locatePhraseOccurrence(normalized, archived, archived.sentenceText, entry)) {
          proposed.push({ saved, row: archived })
        } else {
          for (const item of saved) reasons.set(item, local.length ? 'ambiguousAnchor' : 'missingOriginalSentenceForm')
          const pending = local.length ? local : candidates
          for (const { row } of pending) for (const hit of matchesAt.get(spanKey(row)) ?? []) {
            if (hit.entryId === entry.entryId) review.add(hit)
          }
        }
        continue
      }
      const { row: span, from, quote: offsets } = candidate
      const row = { ...span }
      if (phrase && first.parts) {
        const oldForm = searchOffsets(first.surface)
        row.parts = first.parts.map(([a, b]) => [
          offsets.starts[from + oldForm.starts.indexOf(a - first.start)],
          offsets.ends[from + oldForm.ends.indexOf(b - first.start)],
        ])
      }
      proposed.push({ saved, row })
    }
    for (const proposals of Map.groupBy(proposed, ({ row }) => position(row)).values()) {
      const [{ row: candidate }] = proposals
      const sameAnchor = [...Map.groupBy(proposals, ({ saved: [old] }) => position(old)).values()]
      const exact = sameAnchor.filter(([{ saved: [old] }]) => old.start === candidate.start && old.end === candidate.end)
      const selected = exact.length === 1 ? exact[0] : sameAnchor.length === 1 ? sameAnchor[0] : []
      for (const item of proposals) if (!selected.includes(item)) {
        for (const old of item.saved) reasons.set(old, 'ambiguousAnchor')
        const hit = hits.get(position(candidate))
        if (hit) review.add(hit)
      }
      if (!selected.length) continue
      const [{ row }] = selected
      const saved = selected.flatMap(item => item.saved)
      const key = position(row)
      const target = hits.get(key) ?? row
      if (assigned.has(target)) continue
      const other = hits.has(key) ? [] : (matchesAt.get(spanKey(row)) ?? []).filter(hit => hit.entryId !== row.entryId &&
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
  }
  return { rows: [...hits.values()], assigned, reasons, review }
}
