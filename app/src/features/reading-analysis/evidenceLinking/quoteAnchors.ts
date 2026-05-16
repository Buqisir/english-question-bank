/**
 * quoteAnchors — pure rules for locating annotation quotes inside passage
 * sentences and turning that into a render plan.
 *
 * No React, no JSX, no DOM. PassageCanvas calls `planSentenceRender(...)` and
 * walks the returned segments to emit text spans and <mark> elements. The
 * sentence-level fallback (highlight kind + anchor id) is also part of the
 * plan so the renderer can stay declarative.
 *
 * Quote location rules (extracted verbatim from the original PassageCanvas
 * implementation; do not change without coordinating with the selector):
 *   1. Plain `indexOf` first — covers the common case in microseconds.
 *   2. Otherwise normalize both strings (collapse whitespace incl. NBSP /
 *      ideographic space, unify curly apostrophes / double quotes / dashes,
 *      lowercase) while keeping a map from normalized index → original
 *      index, then `indexOf` on the normalized text. Map back to original
 *      indices.
 *
 * Same-sentence ordering / overlap fallback:
 *   - Sort located ranges by (start asc, length desc).
 *   - Greedy non-overlap selection: an annotation whose range overlaps an
 *     already-accepted range is demoted to fallback (sentence-level anchor).
 *   - Among fallback annotations the first evidence wins for highlight, the
 *     first trap wins as a secondary; the resulting `fallbackAnchorId` is
 *     evidence-id if present, else trap-id, else undefined. This mirrors the
 *     original `find` order.
 */

import type {
  PassageSentence,
  ReadingAnnotation,
} from '../readingAnalysisTypes.ts'

/** A single character range inside a sentence's `text`. End is exclusive. */
export type QuoteRange = {
  start: number
  end: number
}

export type LocatedAnnotation = {
  annotation: ReadingAnnotation
  start: number
  end: number
}

/** Located quote ranges (already de-overlapped) plus annotations that fell back. */
export type SentenceAnnotationLayout = {
  accepted: LocatedAnnotation[]
  fallback: ReadingAnnotation[]
}

export type SentenceRenderSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'mark'
      text: string
      annotationId: string
      annotationKind: ReadingAnnotation['kind']
    }

export type SentenceRenderPlan = {
  sentenceId: string
  /** In-order segments. Always covers the full sentence text exactly once. */
  segments: SentenceRenderSegment[]
  /**
   * Sentence-level fallback highlight. When `kind` is undefined the sentence
   * receives no fallback class and no fallback anchor id.
   */
  fallback: {
    kind: ReadingAnnotation['kind'] | undefined
    anchorId: string | undefined
    hasEvidence: boolean
    hasTrap: boolean
  }
}

/* ────────────────────────────── Public API ──────────────────────────────── */

/**
 * Locate a single quote inside a sentence. Returns null when the quote can
 * neither be matched directly nor under normalization. Exposed for tests and
 * for callers that want quote location without the full render plan.
 */
export function locateQuoteInSentence(
  sentenceText: string,
  quote: string,
): QuoteRange | null {
  if (!quote) return null

  // Fast path — exact substring match.
  const direct = sentenceText.indexOf(quote)
  if (direct >= 0) {
    return { start: direct, end: direct + quote.length }
  }

  // Normalized path with index mapping.
  const sentNorm = normalizeWithMap(sentenceText)
  const quoteNorm = normalizeQuoteOnly(quote)
  if (!quoteNorm) return null

  const hit = sentNorm.text.indexOf(quoteNorm)
  if (hit < 0) return null

  const startOriginal = sentNorm.map[hit]
  const lastContribIndex = sentNorm.map[hit + quoteNorm.length - 1]
  if (startOriginal === undefined || lastContribIndex === undefined) return null
  // End is exclusive; advance past the original char that produced the last
  // normalized char. If that original char is part of a collapsed whitespace
  // run, we still stop right after it — leaving a possible trailing space in
  // the *post-mark* segment, which renders correctly.
  const endOriginal = lastContribIndex + 1
  if (endOriginal <= startOriginal) return null
  return { start: startOriginal, end: endOriginal }
}

/**
 * For a single sentence + its candidate annotations, return the de-overlapped
 * accepted ranges plus the fallback list. Exposed for tests so the
 * "same-sentence multiple annotations" and "overlap fallback" rules can be
 * exercised without going all the way to a render plan.
 */
export function layoutSentenceAnnotations(
  sentenceText: string,
  annotations: readonly ReadingAnnotation[],
): SentenceAnnotationLayout {
  const located: LocatedAnnotation[] = []
  const fallback: ReadingAnnotation[] = []

  for (const ann of annotations) {
    const range = locateQuoteInSentence(sentenceText, ann.target.quote)
    if (range) {
      located.push({ annotation: ann, start: range.start, end: range.end })
    } else {
      fallback.push(ann)
    }
  }

  // Deterministic ordering: start ascending, then longer first (so a longer
  // candidate is picked when two overlapping anns share the same start).
  located.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return (b.end - b.start) - (a.end - a.start)
  })

  // Greedy non-overlap selection. Overlapped anns are demoted to fallback.
  const accepted: LocatedAnnotation[] = []
  for (const loc of located) {
    const last = accepted[accepted.length - 1]
    if (!last || loc.start >= last.end) {
      accepted.push(loc)
    } else {
      fallback.push(loc.annotation)
    }
  }

  return { accepted, fallback }
}

/**
 * Build the render plan for one sentence. The renderer (PassageCanvas) only
 * needs to walk `segments` to emit text spans and <mark> elements, and read
 * `fallback` to decide the sentence-level highlight class + anchor id.
 */
export function planSentenceRender(
  sentence: PassageSentence,
  annotations: readonly ReadingAnnotation[],
): SentenceRenderPlan {
  const { accepted, fallback } = layoutSentenceAnnotations(
    sentence.text,
    annotations,
  )

  const segments: SentenceRenderSegment[] = []
  let cursor = 0
  for (const loc of accepted) {
    if (loc.start > cursor) {
      segments.push({ kind: 'text', text: sentence.text.slice(cursor, loc.start) })
    }
    segments.push({
      kind: 'mark',
      text: sentence.text.slice(loc.start, loc.end),
      annotationId: loc.annotation.id,
      annotationKind: loc.annotation.kind,
    })
    cursor = loc.end
  }
  if (cursor < sentence.text.length) {
    segments.push({ kind: 'text', text: sentence.text.slice(cursor) })
  }
  if (segments.length === 0) {
    // Empty input still renders the original text once.
    segments.push({ kind: 'text', text: sentence.text })
  }

  // Fallback highlight: first evidence wins for highlight, first trap as
  // secondary (matches the original `.find(...)` order).
  const fallbackEvidence = fallback.find((a) => a.kind === 'evidence')
  const fallbackTrap = fallback.find((a) => a.kind === 'trap')
  const fallbackKind: ReadingAnnotation['kind'] | undefined = fallbackEvidence
    ? 'evidence'
    : fallbackTrap
      ? 'trap'
      : undefined
  const fallbackAnchorId =
    fallbackEvidence?.target.id ?? fallbackTrap?.target.id

  return {
    sentenceId: sentence.id,
    segments,
    fallback: {
      kind: fallbackKind,
      anchorId: fallbackAnchorId,
      hasEvidence: Boolean(fallbackEvidence),
      hasTrap: Boolean(fallbackTrap),
    },
  }
}

/* ───────────────────────────── Normalization ────────────────────────────── */

/**
 * Normalize a quote (no map needed). Mirrors the rules used by the selector:
 *   - trim
 *   - collapse all whitespace (incl. NBSP, CJK ideographic space) → 1 space
 *   - unify curly apostrophes → '
 *   - unify curly double quotes → "
 *   - unify dashes (-, –, —) → -
 *   - lowercase
 */
export function normalizeQuoteOnly(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00A0\u3000\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Normalize a sentence into a (text, map) pair. `text` follows the same rules
 * as `normalizeQuoteOnly` except we DO NOT trim (so map indices align with the
 * original string). `map[i]` is the original index of the source character
 * whose normalized output produced normalized character `i`. For collapsed
 * whitespace runs, all output spaces map to the index of the first whitespace
 * char in the run — that keeps `start` aligned to the run's beginning.
 */
export function normalizeWithMap(value: string): { text: string; map: number[] } {
  const out: string[] = []
  const map: number[] = []
  let inSpaceRun = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    const isWhitespace = /[\u00A0\u3000\s]/.test(ch)
    if (isWhitespace) {
      if (!inSpaceRun) {
        out.push(' ')
        map.push(i)
        inSpaceRun = true
      }
      // Collapsed: skip without emitting more.
      continue
    }
    inSpaceRun = false
    let normCh: string
    if (ch === '\u2018' || ch === '\u2019') normCh = "'"
    else if (ch === '\u201C' || ch === '\u201D') normCh = '"'
    else if (ch === '\u2013' || ch === '\u2014') normCh = '-'
    else normCh = ch.toLowerCase()
    out.push(normCh)
    map.push(i)
  }
  return { text: out.join(''), map }
}
