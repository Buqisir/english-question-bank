/**
 * Type declarations for `canonicalPaperGroupSurfaceAdapter.mjs`.
 * Keep this file in sync with `canonicalPaperGroupSurfaceAdapter.d.ts` and `canonicalPaperGroupSurfaceAdapter.d.mts`.
 */

import type {
  PaperEvidence,
  PaperQuestion,
  PaperTextMap,
} from '../papersurface/types'
import type {
  GrammarFillScreenRuling,
} from '../papersurface/blankRuling.mjs'
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
  readonly groupType: 'cloze' | 'grammarFill' | 'sevenChoices'
  readonly sentences: ReadonlyArray<{
    readonly id: string
    readonly nodes: ReadonlyArray<CanonicalSurfaceTextNode | CanonicalSurfaceBlankNode>
  }>
}

export type CanonicalPaperGroupSurfaceData = {
  readonly textMap: PaperTextMap
  readonly semanticParagraphs: ReadonlyArray<CanonicalSurfaceParagraph>
  readonly grammarFillScreenRuling?: GrammarFillScreenRuling
  readonly questions: ReadonlyArray<PaperQuestion>
  readonly evidence: ReadonlyArray<PaperEvidence>
}

export type CanonicalReadingSurfaceTextInline = {
  readonly kind: 'text'
  readonly nodeId: string
  readonly text: string
}

export type CanonicalReadingSurfaceParagraphBlock = {
  readonly kind: 'paragraph'
  readonly nodeId: string
  readonly role: 'title' | 'subtitle' | 'body'
  readonly text: string
  readonly inlines: ReadonlyArray<CanonicalReadingSurfaceTextInline>
}

export type CanonicalReadingSurfaceTableBlock = {
  readonly kind: 'table'
  readonly nodeId: string
  readonly columnCount: number
  readonly rows: ReadonlyArray<{
    readonly rowId: string
    readonly cells: ReadonlyArray<{
      readonly cellId: string
      readonly columnStart: number
      readonly columnSpan: number
      readonly rowSpan: number
      readonly role: string
      readonly text: string
      readonly inlines: ReadonlyArray<CanonicalReadingSurfaceTextInline>
    }>
  }>
}

export type CanonicalReadingSurfaceFigureBlock = {
  readonly kind: 'figure'
  readonly nodeId: string
  readonly mediaId: string
  readonly caption: string
  readonly captionInlines: ReadonlyArray<CanonicalReadingSurfaceTextInline>
  readonly media: {
    readonly mimeType: string
    readonly sha256: string
    readonly sourceArtifactRef: { readonly artifactId: string }
  }
  readonly mediaArtifact: {
    readonly mimeType: string
    readonly sha256: string
    readonly encodedBytes: string
  }
}

export type CanonicalReadingSurfaceColumnChildBlock =
  | CanonicalReadingSurfaceParagraphBlock
  | CanonicalReadingSurfaceTableBlock

export type CanonicalReadingSurfaceFramedColumnsBlock = {
  readonly kind: 'framed_columns'
  readonly nodeId: string
  readonly columnCount: 2
  readonly columns: ReadonlyArray<{
    readonly columnId: string
    readonly columnHeading?: string
    readonly blocks: ReadonlyArray<CanonicalReadingSurfaceColumnChildBlock>
  }>
}

export type CanonicalReadingSurfaceBlock =
  | CanonicalReadingSurfaceParagraphBlock
  | CanonicalReadingSurfaceTableBlock
  | CanonicalReadingSurfaceFigureBlock
  | CanonicalReadingSurfaceFramedColumnsBlock

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

export function buildCanonicalConsumptionSurfaceData(input: {
  consumption: unknown
  familyContractId: 'cloze' | 'grammar-fill' | 'seven-choices'
  groupId: string
}): {
  readonly status: 'ready'
  readonly semanticDigest: string
  readonly occurrenceSignature?: string
  readonly questionBlankPairs?: ReadonlyArray<{
    readonly questionId: string
    readonly blankId: string
  }>
  readonly optionBank?: {
    readonly bankId: string
    readonly options: ReadonlyArray<{
      readonly optionId: string
      readonly label: string
      readonly text: string
    }>
  }
  readonly placementSignatures: ReadonlyArray<string | null>
  readonly surfaceData: CanonicalPaperGroupSurfaceData
}

export function buildCanonicalReadingConsumptionSurfaceData(input: {
  consumption: unknown
  groupId: string
}): {
  readonly status: 'ready'
  readonly semanticDigest: string
  readonly passageLetter: 'A' | 'B' | 'C' | 'D'
  readonly placementSignatures: ReadonlyArray<string>
  readonly richBlocks: ReadonlyArray<CanonicalReadingSurfaceBlock>
  readonly anchors: Record<string, ReadonlyArray<string>>
  readonly surfaceData: {
    readonly textMap: PaperTextMap
    readonly questions: ReadonlyArray<PaperQuestion>
    readonly evidence: ReadonlyArray<PaperEvidence>
  }
}

export type CanonicalApplicationWritingGivenPart = {
  readonly givenPartId: string
  readonly role: 'title' | 'salutation' | 'opening' | 'closing' | 'signature'
  readonly placement: 'answer_region_top' | 'answer_region_bottom'
  readonly blockRef: string
  readonly text: string
  readonly inlines: ReadonlyArray<{
    readonly kind: 'text'
    readonly nodeId: string
    readonly text: string
  }>
}

export type CanonicalWritingSourceBlock = {
  readonly kind?: 'paragraph'
  readonly nodeId: string
  readonly text: string
  readonly inlines: ReadonlyArray<{
    readonly kind: 'text'
    readonly nodeId: string
    readonly text: string
  }>
}

export type CanonicalApplicationWritingPromptFigureBlock = {
  readonly kind: 'figure'
  readonly nodeId: string
  readonly mediaId: string
  readonly caption: string
  readonly captionInlines: ReadonlyArray<{
    readonly kind: 'text'
    readonly nodeId: string
    readonly text: string
  }>
  readonly media: {
    readonly mediaId: string
    readonly mimeType: string
    readonly sha256: string
    readonly pixelWidth: number
    readonly pixelHeight: number
    readonly sourceArtifactRef: { readonly artifactId: string }
  }
  readonly mediaArtifact: {
    readonly mediaId: string
    readonly mimeType: string
    readonly sha256: string
    readonly pixelWidth: number
    readonly pixelHeight: number
    readonly sourceArtifactRef: { readonly artifactId: string }
    readonly encodedBytes: string
  }
}

export type CanonicalApplicationWritingPromptBlock =
  | CanonicalWritingSourceBlock
  | CanonicalApplicationWritingPromptFigureBlock

export type CanonicalWritingChromePrelude =
  | { readonly kind: 'passage' }
  | { readonly kind: 'partHeading'; readonly instructionId: string; readonly text: string }
  | { readonly kind: 'sectionHeading'; readonly instructionId: string; readonly text: string }
  | { readonly kind: 'instruction'; readonly instructionId: string; readonly text: string }

export type CanonicalRichWritingPageModel<TGivenPart> = {
  readonly blocks: ReadonlyArray<
    | CanonicalWritingChromePrelude
    | {
        readonly kind: 'answerBox'
        readonly label: string
        readonly answerRegionRef: string
        readonly responseSlotId: string
        readonly semanticSignature: string
        readonly occurrenceSignature: string
        readonly givenTop: ReadonlyArray<TGivenPart>
        readonly givenBottom: ReadonlyArray<TGivenPart>
      }
  >
}

export type CanonicalOpaqueWritingPageModel = {
  readonly blocks: ReadonlyArray<
    | CanonicalWritingChromePrelude
    | {
        readonly kind: 'answerBox'
        readonly label: string
        readonly answerRegionRef: string
        readonly responseSlotId: string
        readonly ownership: 'product'
        readonly semanticSignature: string
        readonly occurrenceSignature: string
        readonly givenTop: ReadonlyArray<never>
        readonly givenBottom: ReadonlyArray<never>
      }
  >
}

type CanonicalApplicationWritingSurfaceCommon = {
  readonly status: 'ready'
  readonly semanticDigest: string
  readonly occurrenceSignature: string
  readonly anchors: Record<string, ReadonlyArray<string> | string>
  readonly promptBlocks: ReadonlyArray<CanonicalApplicationWritingPromptBlock>
  readonly surfaceData: {
    readonly textMap: PaperTextMap
    readonly questions: ReadonlyArray<PaperQuestion>
    readonly evidence: ReadonlyArray<PaperEvidence>
  }
}

export type CanonicalRichApplicationWritingConsumptionSurfaceData =
  CanonicalApplicationWritingSurfaceCommon
  & {
    readonly writingMode?: undefined
    readonly answerRegion: {
      readonly answerRegionRef: string
      readonly responseSlotId: string
      readonly givenTop: ReadonlyArray<CanonicalApplicationWritingGivenPart>
      readonly givenBottom: ReadonlyArray<CanonicalApplicationWritingGivenPart>
    }
    readonly pageModel: CanonicalRichWritingPageModel<CanonicalApplicationWritingGivenPart>
  }

export type CanonicalLegacyOpaqueApplicationWritingConsumptionSurfaceData =
  CanonicalApplicationWritingSurfaceCommon
  & {
    readonly writingMode: 'legacy_opaque'
    readonly answerRegion: {
      readonly answerRegionRef: string
      readonly responseSlotId: string
      readonly ownership: 'product'
    }
    readonly pageModel: CanonicalOpaqueWritingPageModel
  }

export type CanonicalApplicationWritingConsumptionSurfaceData =
  | CanonicalRichApplicationWritingConsumptionSurfaceData
  | CanonicalLegacyOpaqueApplicationWritingConsumptionSurfaceData

export function buildCanonicalApplicationWritingConsumptionSurfaceData(input: {
  consumption: unknown
  groupId: string
  renderedGroupIds?: ReadonlyArray<string>
}): CanonicalApplicationWritingConsumptionSurfaceData

export type CanonicalContinuationWritingStarter = {
  readonly starterId: string
  readonly contentRef: string
  readonly authorityObservationRef: string
  readonly text: string
  readonly inlines: ReadonlyArray<{
    readonly kind: 'text'
    readonly nodeId: string
    readonly text: string
  }>
}

type CanonicalContinuationWritingSurfaceCommon = {
  readonly status: 'ready'
  readonly semanticDigest: string
  readonly occurrenceSignature: string
  readonly anchors: Record<string, ReadonlyArray<string>>
  readonly materialBlocks: ReadonlyArray<CanonicalWritingSourceBlock>
  readonly surfaceData: {
    readonly textMap: PaperTextMap
    readonly questions: ReadonlyArray<PaperQuestion>
    readonly evidence: ReadonlyArray<PaperEvidence>
  }
}

export type CanonicalRichContinuationWritingConsumptionSurfaceData =
  CanonicalContinuationWritingSurfaceCommon
  & {
    readonly writingMode?: undefined
    readonly answerRegion: {
      readonly answerRegionRef: string
      readonly responseSlotId: string
      readonly starterLines: ReadonlyArray<CanonicalContinuationWritingStarter>
    }
    readonly wordCountRuling: {
      readonly countScope: 'student_authored_only'
      readonly target: number
    }
    readonly pageModel: CanonicalRichWritingPageModel<CanonicalContinuationWritingStarter>
  }

export type CanonicalLegacyOpaqueContinuationWritingConsumptionSurfaceData =
  CanonicalContinuationWritingSurfaceCommon
  & {
    readonly writingMode: 'legacy_opaque'
    readonly answerRegion: {
      readonly answerRegionRef: string
      readonly responseSlotId: string
      readonly ownership: 'product'
    }
    readonly wordCountRuling?: undefined
    readonly wordCountTarget: number
    readonly wordCountTargetCertainty: 'explicit_legacy_field'
    readonly wordCountScope: 'unspecified'
    readonly pageModel: CanonicalOpaqueWritingPageModel
  }

export type CanonicalContinuationWritingConsumptionSurfaceData =
  | CanonicalRichContinuationWritingConsumptionSurfaceData
  | CanonicalLegacyOpaqueContinuationWritingConsumptionSurfaceData

export function buildCanonicalContinuationWritingConsumptionSurfaceData(input: {
  consumption: unknown
  groupId: string
  renderedGroupIds?: ReadonlyArray<string>
}): CanonicalContinuationWritingConsumptionSurfaceData
