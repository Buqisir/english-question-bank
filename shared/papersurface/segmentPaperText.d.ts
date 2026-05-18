/**
 * segmentPaperText — TypeScript declarations for the pure paragraph +
 * sentence segmenter.
 *
 * Issue #21-B3.
 *
 * Companion: `segmentPaperText.mjs` (runtime implementation).
 *
 * This module is types-only for TS consumers. It does NOT carry
 * runtime initializers.
 */

export type SegmentedToken = {
  readonly id: string
  readonly start: number
  readonly end: number
}

export type SegmentedSentence = {
  readonly id: string
  readonly text: string
  readonly tokens: readonly SegmentedToken[]
}

export type SegmentedParagraph = {
  readonly id: string
  readonly sentences: readonly SegmentedSentence[]
}

export type SegmentResult = {
  readonly paragraphs: readonly SegmentedParagraph[]
}

export type SegmentPaperTextOptions = {
  /** Section identifier used as id prefix (e.g. 'A', 'B'). */
  readonly sectionId: string
}

/**
 * Segment a passage body into paragraphs and sentences.
 *
 * Deterministic and idempotent: same input always produces identical
 * output.
 *
 * Token segmentation is deferred — `tokens` arrays are always empty.
 */
export declare function segmentPaperText(
  passageBody: string,
  options: SegmentPaperTextOptions,
): SegmentResult
