/**
 * PassageCanvas — left-side reading passage with paragraph numbers, sentence
 * spans, and inline annotation marks (evidence / trap).
 *
 * Each sentence is wrapped in a <span data-ra-sentence-id="…"> so that
 * LinkOverlay can resolve a TextAnchor to a real DOM rect for SVG routing.
 *
 * When an annotation's quote can be located inside the sentence (exact or
 * normalized substring) we additionally render a <mark
 * data-ra-quote-anchor="<annotation.id>"> around just that fragment. The
 * overlay prefers the quote anchor when present and falls back to the whole
 * sentence anchor when not. Overlapping quotes inside the same sentence are
 * resolved deterministically: sort by (start asc, length desc) and only emit
 * non-overlapping marks; overlapped annotations keep their sentence-level
 * anchor as a fallback.
 *
 * Selector-side `target.start/end` are not yet populated (always 0) so we
 * locate the quote here from `target.quote` against `sentence.text`.
 */

import { type ReactNode } from 'react'
import type {
  ReadingAnnotation,
  PassageSentence,
  Passage,
} from './readingAnalysisTypes.ts'

export type PassageCanvasProps = {
  passage: Passage
  annotations: ReadingAnnotation[]
}

type LocatedAnnotation = {
  ann: ReadingAnnotation
  start: number
  end: number
}

export function PassageCanvas(props: PassageCanvasProps): ReactNode {
  const { passage, annotations } = props

  // Group annotations by sentenceId for O(1) lookup while we render sentences.
  const bySentence = new Map<string, ReadingAnnotation[]>()
  for (const ann of annotations) {
    const list = bySentence.get(ann.target.sentenceId) ?? []
    list.push(ann)
    bySentence.set(ann.target.sentenceId, list)
  }

  return (
    <article className="reading-analysis-passage" aria-label="阅读原文">
      <header className="ra-passage-header">
        <h2 className="ra-passage-title">{passage.title}</h2>
      </header>
      <ol className="ra-paragraph-list">
        {passage.paragraphs.map((p, idx) => (
          <li key={p.id} className="ra-paragraph">
            <span className="ra-paragraph-num" aria-hidden="true">
              P{idx + 1}
            </span>
            <p className="ra-paragraph-body">
              {p.sentences.map((s) => renderSentence(s, bySentence.get(s.id) ?? []))}
            </p>
          </li>
        ))}
      </ol>
    </article>
  )
}

function renderSentence(sentence: PassageSentence, anns: ReadingAnnotation[]): ReactNode {
  // Resolve quote ranges. Annotations that don't locate become "fallback" —
  // the sentence keeps the legacy sentence-level highlight for them.
  const located: LocatedAnnotation[] = []
  const fallback: ReadingAnnotation[] = []
  for (const ann of anns) {
    const range = locateQuoteInSentence(sentence.text, ann.target.quote)
    if (range) {
      located.push({ ann, start: range.start, end: range.end })
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
      fallback.push(loc.ann)
    }
  }

  const fallbackEvidence = fallback.find((a) => a.kind === 'evidence')
  const fallbackTrap = fallback.find((a) => a.kind === 'trap')
  const sentenceClasses = ['ra-sentence']
  if (fallbackEvidence) sentenceClasses.push('ra-highlight-evidence')
  if (fallbackTrap) sentenceClasses.push('ra-highlight-trap')
  const fallbackKind = fallbackEvidence
    ? 'evidence'
    : fallbackTrap
      ? 'trap'
      : undefined
  const fallbackAnchorId = fallbackEvidence?.target.id ?? fallbackTrap?.target.id

  // Walk the sentence text and emit either plain text or a <mark> for each
  // accepted range. Trailing whitespace separator stays outside the last node.
  const children: ReactNode[] = []
  let cursor = 0
  for (let i = 0; i < accepted.length; i++) {
    const loc = accepted[i]
    if (loc.start > cursor) {
      children.push(<span key={`t${i}`}>{sentence.text.slice(cursor, loc.start)}</span>)
    }
    const fragment = sentence.text.slice(loc.start, loc.end)
    children.push(
      <mark
        key={`m${i}-${loc.ann.id}`}
        className={
          loc.ann.kind === 'evidence'
            ? 'ra-quote-mark ra-quote-mark-evidence'
            : 'ra-quote-mark ra-quote-mark-trap'
        }
        data-ra-quote-anchor={loc.ann.id}
        data-ra-kind={loc.ann.kind}
      >
        {fragment}
      </mark>,
    )
    cursor = loc.end
  }
  if (cursor < sentence.text.length) {
    children.push(<span key="tail">{sentence.text.slice(cursor)}</span>)
  }
  if (children.length === 0) {
    children.push(<span key="all">{sentence.text}</span>)
  }

  return (
    <span
      key={sentence.id}
      className={sentenceClasses.join(' ')}
      data-ra-sentence-id={sentence.id}
      data-ra-anchor-id={fallbackAnchorId}
      data-ra-kind={fallbackKind}
    >
      {children}{' '}
    </span>
  )
}

/* ─────────────────────────── Quote location ─────────────────────────────── */

/**
 * Locate `quote` inside `sentenceText` and return original-string indices.
 *
 *   1. Plain `indexOf` first — covers the common case and runs in microseconds.
 *   2. If that fails, walk both strings character-by-character with a
 *      "normalized" view (lowercase, collapsed whitespace, unified
 *      apostrophes/dashes) while keeping a mapping from normalized index back
 *      to the original index. Then run `indexOf` on the normalized strings.
 *
 * Returns `null` when the quote cannot be located inside this sentence — the
 * caller is expected to fall back to a sentence-level anchor.
 */
export function locateQuoteInSentence(
  sentenceText: string,
  quote: string,
): { start: number; end: number } | null {
  if (!quote) return null

  // Fast path.
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

  // Map normalized [hit, hit+quoteNorm.length) back to original indices.
  // sentNorm.map[i] gives the *original* index of the char that produced
  // normalized char i. The mapped end is the original index AFTER the last
  // contributing char.
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
 * Normalize a quote (no map needed). Mirrors the rules used by the selector:
 *   - trim
 *   - collapse all whitespace (incl. NBSP, CJK ideographic space) → 1 space
 *   - unify curly apostrophes → '
 *   - unify curly double quotes → "
 *   - unify dashes (-, –, —) → -
 *   - lowercase
 */
function normalizeQuoteOnly(value: string): string {
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
function normalizeWithMap(value: string): { text: string; map: number[] } {
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
