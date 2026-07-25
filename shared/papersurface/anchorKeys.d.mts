/**
 * Type declarations for `shared/papersurface/anchorKeys.mjs`.
 *
 * TypeScript resolves `.mjs` imports to `.d.mts` companions in the
 * app's bundler-mode build. Keep this file in sync with `anchorKeys.d.ts`.
 */

export type PaperSurfaceAnchorAttrs = {
  readonly section: 'data-paper-section'
  readonly paragraphId: 'data-paper-paragraph-id'
  readonly sentenceId: 'data-paper-sentence-id'
  readonly questionId: 'data-paper-question-id'
  readonly blankId: 'data-paper-blank-id'
  readonly optionLabel: 'data-paper-option-label'
  readonly evidenceId: 'data-paper-evidence-id'
  readonly evidenceKind: 'data-paper-evidence-kind'
  readonly annotationId: 'data-paper-annotation-id'
  readonly annotationKind: 'data-paper-annotation-kind'
}

export const paperSurfaceAnchorAttrs: PaperSurfaceAnchorAttrs
