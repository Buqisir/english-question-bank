/**
 * anchorKeys — single source of truth for every data-ra-* attribute and
 * value used by the reading-analysis evidence-link layer.
 *
 * Three layers of consumers must agree on these strings:
 *
 *   1. Markup writers — QuestionPanel, PassageCanvas (write `data-ra-…`
 *      attributes on real DOM elements).
 *   2. Markup readers — LinkOverlay / useEvidenceLinkOverlay (resolve those
 *      same elements via `container.querySelector(...)`).
 *   3. Render planners — quoteAnchors (emit data-ra-quote-anchor on <mark>
 *      elements based on annotation ids).
 *
 * If any consumer hand-rolls `q:${qid}:${key}` or its own selector string,
 * the source/target priority tests will silently still pass while the real
 * page falls back to the wrong anchor. Keep all of those strings here.
 */

export type OptionKey = 'A' | 'B' | 'C' | 'D'

/* ─────────────────────────── Attribute names ────────────────────────────── */

/** Stem button (and option button, in the legacy fallback). Source side. */
export const ATTR_LINK_SOURCE = 'data-ra-link-source' as const

/** Tiny option-letter badge inside the option button. Preferred source. */
export const ATTR_OPTION_ANCHOR = 'data-ra-option-anchor' as const

/** <mark> wrapped around the located quote in a sentence. Preferred target. */
export const ATTR_QUOTE_ANCHOR = 'data-ra-quote-anchor' as const

/** Sentence span. Fallback target when the quote could not be located. */
export const ATTR_SENTENCE_ID = 'data-ra-sentence-id' as const

/* ───────────────────────────── Key formatters ───────────────────────────── */

/** Stem source key. Lives on the stem button's data-ra-link-source. */
export function formatStemSourceKey(questionId: string): string {
  return `q:${questionId}`
}

/**
 * Option source key. The same string is written on TWO different attributes
 * of the same option:
 *   - `data-ra-link-source` on the option button (legacy fallback source)
 *   - `data-ra-option-anchor` on the option-letter badge (preferred source)
 *
 * The overlay prefers the badge anchor when present so the path lands on the
 * letter circle, but it falls back to the button when older markup is read.
 */
export function formatOptionSourceKey(
  questionId: string,
  optionKey: OptionKey,
): string {
  return `q:${questionId}:${optionKey}`
}

/** Quote anchor target key — the annotation id, exposed by name for clarity. */
export function formatQuoteTargetKey(annotationId: string): string {
  return annotationId
}

/** Sentence fallback target key — the sentence id, exposed by name for clarity. */
export function formatSentenceTargetKey(sentenceId: string): string {
  return sentenceId
}

/* ───────────────────────────── CSS selectors ────────────────────────────── */

/** Selector for the stem button source. */
export function stemSourceSelector(questionId: string): string {
  return `[${ATTR_LINK_SOURCE}="${cssEscape(formatStemSourceKey(questionId))}"]`
}

/** Selector for the option-letter badge (preferred option source). */
export function optionBadgeSourceSelector(
  questionId: string,
  optionKey: OptionKey,
): string {
  return `[${ATTR_OPTION_ANCHOR}="${cssEscape(formatOptionSourceKey(questionId, optionKey))}"]`
}

/** Selector for the option button (legacy fallback option source). */
export function optionLegacySourceSelector(
  questionId: string,
  optionKey: OptionKey,
): string {
  return `[${ATTR_LINK_SOURCE}="${cssEscape(formatOptionSourceKey(questionId, optionKey))}"]`
}

/** Selector for the <mark> wrapping a located quote (preferred target). */
export function quoteTargetSelector(annotationId: string): string {
  return `[${ATTR_QUOTE_ANCHOR}="${cssEscape(formatQuoteTargetKey(annotationId))}"]`
}

/** Selector for the sentence span (fallback target). */
export function sentenceTargetSelector(sentenceId: string): string {
  return `[${ATTR_SENTENCE_ID}="${cssEscape(formatSentenceTargetKey(sentenceId))}"]`
}

/* ───────────────────────────── CSS.escape shim ──────────────────────────── */

/**
 * Minimal CSS.escape polyfill — only handles the chars our ids use. Lives
 * here because every selector in this module needs it, and we don't want to
 * pull in a runtime dep just for a few characters.
 */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
}
