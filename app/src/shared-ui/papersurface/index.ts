/**
 * PaperSurface module — public barrel (Issue #21-B3).
 *
 * Re-exports:
 *   - PaperSurface component
 *   - All relevant types from shared/papersurface/types.d.ts
 *
 * No parallel type declarations. All types come from the shared layer.
 */

export { PaperSurface } from './PaperSurface'

export type {
  PaperSurfaceProps,
  PaperTextMap,
  PaperTextParagraph,
  PaperTextSentence,
  PaperTextToken,
  PaperTextRange,
  PaperAnnotation,
  PaperQuestionAnnotation,
  PaperPassageAnnotation,
  PaperAnnotationImportance,
  PaperAnnotationScope,
  PaperAnnotationKind,
  PaperEvidence,
  PaperQuestion,
  PaperQuestionOption,
  PaperSurfaceMode,
  LectureFocus,
  ReadingFocus,
  PaperSurfaceFocusState,
  PaperSurfaceFocusIntent,
  FocusIntent,
} from '../../../../shared/papersurface/types'
