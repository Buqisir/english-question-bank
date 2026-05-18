/**
 * Type declarations for `shared/papersurface/anchorKeys.mjs`.
 *
 * Issue #21-B1.5 (Must Fix 1). Types-only — DO NOT add value
 * declarations here. The runtime `.mjs` is the single source of
 * truth for the actual attribute strings.
 */

export type PaperSurfaceAnchorAttrs = {
  readonly section: 'data-paper-section'
  readonly paragraphId: 'data-paper-paragraph-id'
  readonly sentenceId: 'data-paper-sentence-id'
  readonly questionId: 'data-paper-question-id'
  readonly optionLabel: 'data-paper-option-label'
  readonly evidenceId: 'data-paper-evidence-id'
  readonly evidenceKind: 'data-paper-evidence-kind'
  readonly annotationId: 'data-paper-annotation-id'
  readonly annotationKind: 'data-paper-annotation-kind'
}

export const paperSurfaceAnchorAttrs: PaperSurfaceAnchorAttrs
