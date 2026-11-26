import { normalizeSearch } from '../../../server/paper-dictionary/otterSearch.mjs'
import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'
import { locatePhraseOccurrence, normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { position } from './annotations.mjs'

const spanKey = row => JSON.stringify([row.sentence, row.start])
const leftEdge = /(?:[\p{L}\p{M}]|[\p{L}\p{M}\p{N}]'|[\p{L}\p{M}]-)$/u
const rightEdge = /^(?:[\p{L}\p{M}]|'[\p{L}\p{M}\p{N}]|-[\p{L}\p{M}])/u
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

// The original word index used these boundaries before the current sentence splitter.
function archiveSentences(raw, withQuotes) {
  const boundary = withQuotes
    ? /([.!?]+[”’"']*)([^\S\n]+|$)|([.!?]*[”’"']*)\n+/gu
    : /([.!?]+)([^\S\n]+|$)|([.!?]*[”’"']*)\n+/gu
  const sentences = []
  let start = 0
  for (const match of raw.matchAll(boundary)) {
    const end = match.index + (match[1] ?? match[3]).length
    const text = raw.slice(start, end)
    if (match[2] && /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|No|vs|[A-Z]|[ap](?:\.\s*m)?|[ei]\.\s*[gi]|[A-Z]\.[A-Z])\.$/u
      .test(text.trim()) && raw.slice(end).trim()) continue
    if (text.trim()) sentences.push({ text, start })
    start = match.index + match[0].length
  }
  if (raw.slice(start).trim()) sentences.push({ text: raw.slice(start), start })
  return sentences
}

function sentenceRange(raw, { text, start }) {
  const sentenceText = text.trim()
  const from = [...raw.slice(0, start + text.length - text.trimStart().length)].length
  const chars = [...sentenceText]
  return { from, to: from + chars.length, chars, sentenceText }
}

function archiveLayouts(raw, current, confirmed, originalQuote) {
  const layouts = [archiveSentences(raw, false), archiveSentences(raw, true), current]
    .map(layout => layout.map(sentence => sentenceRange(raw, sentence)))
  const anchors = [...Map.groupBy(confirmed, position).values()].map(([row]) =>
    ({ row, form: normalizeSearch(row.surface), quote: originalQuote(row) }))
  const scores = layouts.map(layout => anchors.reduce((score, { row, form, quote }) => {
    const sentence = layout[row.sentence - 1]
    if (!sentence || normalizeSearch(sentence.chars.slice(row.start, row.end).join('')) !== form) return score
    return score + (quote && quote === normalizeSearch(sentence.sentenceText) ? 2 : 1)
  }, 0))
  const best = Math.max(...scores)
  return layouts.filter((_, index) => scores[index] === best)
}

export function reanchorLegacy(paperId, block, confirmed, matches, entries, exampleQuotes = new Map()) {
  const reasons = new Map()
  const assigned = new Map()
  const review = new Set()
  if (!confirmed.length) return { rows: matches, assigned, reasons, review }
  const normalized = normalizePhraseText(block.raw)
  const current = splitSentences(block.raw)
  const sentences = current.map((item, index) => {
    const { from, sentenceText } = sentenceRange(block.raw, item)
    return { sentence: index + 1, sentenceText, sentenceStart: from, quote: searchOffsets(sentenceText) }
  })
  const source = { paperId, groupId: block.groupId, blockHash: block.hash,
    [block.kind === 'paragraph' ? 'paragraphId' : 'questionId']: block.id }
  const hits = new Map(matches.map(row => [position(row), row]))
  const matchesAt = Map.groupBy(matches, spanKey)
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
  const layouts = archiveLayouts(block.raw, current, confirmed, originalQuote)
  const fullText = searchOffsets(block.raw)
  const quoteRanges = new Map()
  function rangesOf(quote) {
    if (!quoteRanges.has(quote)) {
      quoteRanges.set(quote, [...fullText.text.matchAll(new RegExp(escape(quote), 'giu'))]
        .map(match => ({ from: fullText.starts[match.index], to: fullText.ends[match.index + match[0].length] }))
        .filter(({ from, to }) => from !== undefined && to !== undefined))
    }
    return quoteRanges.get(quote)
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
    const proposed = []
    for (const saved of Map.groupBy(savedRows, old => JSON.stringify([
      position(old), old.blockHash, originalQuote(old),
    ])).values()) {
      const [first] = saved
      const quote = originalQuote(first)
      const indexed = layouts.map(layout => layout[first.sentence - 1]).filter(Boolean)
      const quoted = quote ? rangesOf(quote) : []
      const atIndex = quoted.filter(range => indexed.some(sentence => sentence.from === range.from))
      const ranges = quote ? (quoted.length > 1 && atIndex.length === 1 ? atIndex : quoted) : indexed
      const local = candidates.filter(({ row }) => ranges.some(({ from, to }) =>
        row.sentenceStart + row.start >= from && row.sentenceStart + row.end <= to))
      const atOffset = (anchors) => local.filter(({ row }) => anchors.some(({ from, to }) =>
        row.sentenceStart + row.start === from + first.start &&
        row.sentenceStart + row.end === from + first.end && from + first.end <= to))
      // An example may omit a cloze marker included in the indexed offsets.
      const inQuote = atOffset(ranges)
      const exact = quote && !inQuote.length ? atOffset(indexed) : inQuote
      const candidate = exact.length === 1 ? exact[0] : quote && local.length === 1 ? local[0] : undefined
      // Keep a runtime-valid archived phrase if the current splitter divided its quote.
      if (phrase && first.blockHash === block.hash && first.sentenceText &&
          (!candidate || normalizeSearch(candidate.row.sentenceText) !== quote)) {
        const { senseId, ...legacy } = first
        const archived = { ...legacy, ...source }
        if (locatePhraseOccurrence(normalized, archived, archived.sentenceText, entry)) {
          proposed.push({ saved, row: archived, exact: true })
          continue
        }
      }
      if (!candidate) {
        for (const item of saved) reasons.set(item, local.length ? 'ambiguousAnchor' : 'missingOriginalSentenceForm')
        const pending = local.length ? local : candidates
        for (const { row } of pending) for (const hit of matchesAt.get(spanKey(row)) ?? []) {
          if (hit.entryId === entry.entryId) review.add(hit)
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
      proposed.push({ saved, row, exact: exact.length === 1 })
    }
    for (const proposals of Map.groupBy(proposed, ({ row }) => position(row)).values()) {
      const [{ row: candidate }] = proposals
      const sameAnchor = [...Map.groupBy(proposals, ({ saved: [old] }) => position(old)).values()]
      const exact = sameAnchor.filter(items => items.some(item => item.exact))
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
