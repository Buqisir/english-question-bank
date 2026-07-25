import type {
  PaperEvidence,
  PaperQuestion,
  PaperTextMap,
} from '../papersurface/types'
import type {
  PaperGroupNormalizationIssue,
} from './normalizePaperGroup.mjs'

export type CanonicalSurfaceTextNode = {
  readonly type: 'text'
  readonly text: string
}

export type CanonicalSurfaceBlankNode = {
  readonly type: 'blank'
  readonly questionId: string
  readonly blankId: string
  readonly questionNo: string
  readonly hint: string | null
}

export type CanonicalSurfaceParagraph = {
  readonly id: string
  readonly section: string
  readonly groupType: 'cloze' | 'grammarFill'
  readonly sentences: ReadonlyArray<{
    readonly id: string
    readonly nodes: ReadonlyArray<CanonicalSurfaceTextNode | CanonicalSurfaceBlankNode>
  }>
}

export type CanonicalPaperGroupSurfaceData = {
  readonly textMap: PaperTextMap
  readonly semanticParagraphs: ReadonlyArray<CanonicalSurfaceParagraph>
  readonly questions: ReadonlyArray<PaperQuestion>
  readonly evidence: ReadonlyArray<PaperEvidence>
}

export type CanonicalPaperGroupSurfaceResult =
  | {
      readonly status: 'ready'
      readonly semanticDigest: string
      readonly surfaceData: CanonicalPaperGroupSurfaceData
    }
  | {
      readonly status: 'not_enabled'
      readonly diagnostic: {
        readonly code: 'CANONICAL_COMPATIBILITY_NOT_ENABLED'
        readonly paperId: string
        readonly groupId: string
      }
    }
  | {
      readonly status: 'needs_review'
      readonly issues: ReadonlyArray<PaperGroupNormalizationIssue>
      readonly diagnostic: {
        readonly code: 'CANONICAL_NORMALIZATION_NEEDS_REVIEW'
        readonly paperId: string
        readonly groupId: string
        readonly issues: ReadonlyArray<PaperGroupNormalizationIssue>
      }
    }

export type CanonicalClozeSurfaceData = CanonicalPaperGroupSurfaceData
export type CanonicalClozeSurfaceResult = CanonicalPaperGroupSurfaceResult

export function formatCanonicalBlankVisibleText(
  questionNo: string,
  hint: string | null,
): string

export function buildCanonicalPaperGroupSurfaceData(input: {
  asset: unknown
  groupId: string
}): CanonicalPaperGroupSurfaceResult

export function buildCanonicalClozeSurfaceData(input: {
  asset: unknown
  groupId: string
}): CanonicalClozeSurfaceResult
