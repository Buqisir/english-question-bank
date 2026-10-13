import { splitSentences } from '../paper-selection/segmentation.mjs'

const TITLE_END = /(?:^|[^\p{L}])(?:Mr|Mrs|Ms|Dr|Prof|St|Mt)\.\s*$/u
// An initial (A. Lee, John F. Kennedy) opens or sits inside a name; after a lowercase word
// ("plan B.") the same letter more likely ends the sentence, unless another initial follows (J. K.).
const INITIAL_END = /(?:^\s*|(?:^|[^\p{L}])(?:\p{Lu}\p{L}*|\p{Lu}\.)\s+)\p{Lu}\.\s*$/u
const QUOTE_LOOKAHEAD = 4
// A bullet or list number opening a passage paragraph is layout, not sentence content.
// Single-letter enumerators are left alone so initials (J. K. Rowling) survive.
const LIST_MARKER = /^(?:[●•▪◦‣⁃∙]|[(（]?\d{1,2}[)）.]|[①-⑳])\s+/u

function quoteOpen(text) {
  const opens = (text.match(/“/g) || []).length
  const closes = (text.match(/”/g) || []).length
  const straight = (text.match(/"/g) || []).length
  return opens > closes || straight % 2 === 1
}

// Intl.Segmenter also breaks after titles (Mrs. Calloway) and inside quotes
// ("Out of order. Sorry."); the shared splitter stays as-is for its other
// consumers, and sentence analysis re-joins those pieces here.
export function analysisSentences(text) {
  const raw = splitSentences(text)
  const slice = (from, to) => text.slice(raw[from].start, raw[to].end)
  const joinable = (from, to) => !slice(from, to).trim().includes('\n')
  const sentences = []
  let first = 0
  while (first < raw.length) {
    let last = first
    while (last + 1 < raw.length) {
      const piece = slice(first, last)
      const next = text.slice(raw[last + 1].start, raw[last + 1].end)
      const initial = (INITIAL_END.test(piece) && /^\s*\p{Lu}/u.test(next)) || (/(?:^|[^\p{L}])\p{Lu}\.\s*$/u.test(piece) && /^\s*\p{Lu}\.\s/u.test(next))
      if ((TITLE_END.test(piece) || initial) && joinable(first, last + 1)) {
        last += 1
        continue
      }
      if (!quoteOpen(piece)) break
      let close = last + 1
      while (close < raw.length && close - last <= QUOTE_LOOKAHEAD && quoteOpen(slice(first, close))) close += 1
      if (close >= raw.length || close - last > QUOTE_LOOKAHEAD || !joinable(first, close)) break
      last = close
    }
    sentences.push({ start: raw[first].start, end: raw[last].end, text: slice(first, last) })
    first = last + 1
  }
  return sentences
}

export function resolveTargetFromStream({
  source,
  segment,
  familyContractId,
}) {
  if (!segment) return { ok: false, reason: 'cross-stream' }
  const stream = source.streams.find((item) => item.streamId === segment.streamId)
  if (!stream || stream.role !== 'passage-body' || familyContractId !== 'reading') {
    return { ok: false, reason: 'not-reading' }
  }
  const sentences = analysisSentences(stream.text)
  const hits = sentences.filter((sentence) => sentence.end > segment.start && sentence.start < segment.end)
  if (hits.length !== 1) return { ok: false, reason: 'cross-sentence' }
  const raw = hits[0]
  const opening = raw.text.trimStart()
  const lead = raw.text.length - opening.length + (opening.match(LIST_MARKER)?.[0].length ?? 0)
  const trail = raw.text.length - raw.text.trimEnd().length
  const start = raw.start + lead
  const end = raw.end - trail
  const sentenceText = stream.text.slice(start, end)
  if (!sentenceText || sentenceText.includes('\n')) return { ok: false, reason: 'cross-sentence' }
  if (end - start > 2000) return { ok: false, reason: 'too-long' }
  return {
    ok: true,
    expanded: start !== segment.start || end !== segment.end,
    target: {
      paperId: source.paperId,
      sourceRevision: source.sourceRevision,
      streamId: stream.streamId,
      start,
      end,
      sentenceText,
    },
  }
}
