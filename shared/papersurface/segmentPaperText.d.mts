/**
 * TypeScript declarations for `shared/papersurface/segmentPaperText.mjs`.
 *
 * TypeScript resolves `.mjs` imports to `.d.mts` companions in the
 * app's bundler-mode build. Keep this file in sync with
 * `segmentPaperText.d.ts`.
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
