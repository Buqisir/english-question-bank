import type { PaperAssetV1, PaperParagraph, PaperWritingTask } from '../../domain/paperAsset.ts'

// Ordered paper-order chrome for one writing group's A4 page. `passage` marks
// where the dumb PaperSurface renders the group's prompt/material; `answerBox`
// carries the (continuation) given starter lines so they render inside the box.
export type WritingChromeBlock =
  | { kind: 'partHeading'; instructionId?: string; text: string }
  | { kind: 'sectionHeading'; instructionId?: string; text: string }
  | { kind: 'instruction'; instructionId?: string; text: string }
  | { kind: 'passage' }
  | { kind: 'answerBox'; label: string; givenTop: string[]; givenBottom: string[] }

export type WritingPageModel = {
  blocks: WritingChromeBlock[]
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
