import type { PaperAssetV1, PaperWritingTask } from '../../domain/paperAsset.ts'

// Ordered paper-order chrome for one writing group's A4 page. `passage` marks
// where the dumb PaperSurface renders the group's prompt/material; `answerBox`
// carries the (continuation) given starter lines so they render inside the box.
export type WritingChromeBlock =
  | { kind: 'partHeading'; text: string }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'instruction'; text: string }
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

export function buildWritingPageModel(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
  task: PaperWritingTask | null,
): WritingPageModel
