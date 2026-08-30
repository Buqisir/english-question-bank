export type ApplicationWritingNoticeLine = {
  readonly kind: 'label' | 'instruction'
  readonly text: string
}

export function applicationWritingNoticeLines(
  text: string,
): ReadonlyArray<ApplicationWritingNoticeLine> | null

export type WritingNoticeGroup = {
  readonly startIndex: number
  readonly blockCount: number
  readonly lines: ReadonlyArray<ApplicationWritingNoticeLine>
}

export function writingNoticeGroup(
  texts: ReadonlyArray<string>,
): WritingNoticeGroup | null

export function continuationStarterDisplayText(
  text: string,
  starterIndex: number,
): string
