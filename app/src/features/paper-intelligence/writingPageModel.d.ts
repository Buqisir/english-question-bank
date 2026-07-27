import type { PaperAssetV1, PaperParagraph, PaperWritingTask } from '../../domain/paperAsset.ts'

// Ordered paper-order chrome for one writing group's A4 page. `passage` marks
// where the dumb PaperSurface renders the group's prompt/material; `answerBox`
// carries the (continuation) given starter lines so they render inside the box.
export type WritingChromeBlock =
  | { kind: 'partHeading'; text: string }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'instruction'; text: string }
  | { kind: 'passage' }
  | {
      kind: 'answerBox'
      label: string
      answerRegionRef?: string
      responseSlotId?: string
      semanticSignature?: string
      occurrenceSignature?: string
      givenTop: ReadonlyArray<WritingGivenPart>
      givenBottom: ReadonlyArray<WritingGivenPart>
    }

export type WritingGivenPart =
  | string
  | {
      givenPartId: string
      role: 'title' | 'salutation' | 'opening' | 'closing' | 'signature'
      placement: 'answer_region_top' | 'answer_region_bottom'
      blockRef: string
      text: string
      inlines: ReadonlyArray<{
        kind: 'text'
        nodeId: string
        text: string
      }>
    }

export type WritingPageModel = {
  blocks: ReadonlyArray<WritingChromeBlock>
}

export type WritingBlockRange = {
  startIdx: number
  endIdx: number
  groupIdx: number
}

export function findWritingBlockRange(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
): WritingBlockRange | null

// surface-question-policy cut: read-time application-letter scaffold
// extraction from a writing group's own passage paragraphs (Dear.../
// Yours...). Returns null when no paragraph opens with "Dear".
export type ApplicationScaffold = {
  top: string[]
  bottom: string[]
  paragraphIds: Set<string>
}

export function extractApplicationScaffold(
  paragraphs: ReadonlyArray<PaperParagraph> | undefined,
): ApplicationScaffold | null

export function buildWritingPageModel(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
  task: PaperWritingTask | null,
): WritingPageModel
