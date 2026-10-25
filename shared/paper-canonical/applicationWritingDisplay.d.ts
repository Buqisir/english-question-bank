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
  readonly lines: ReadonlyArray<ApplicationWritingNoticeLine & {
    /** Source block offset relative to this group's startIndex. */
    readonly blockOffset: number
    /** Display line within that source block. */
    readonly lineIndex: number
  }>
}

export function writingNoticeGroup(
  texts: ReadonlyArray<string>,
): WritingNoticeGroup | null

export function writingNoticeGroups(
  texts: ReadonlyArray<string>,
): ReadonlyArray<WritingNoticeGroup>

export function writingNoticeDisplayInlines<T extends { readonly text: string }>(
  nodes: ReadonlyArray<T>,
  lineIndex?: number,
): ReadonlyArray<T>

export function writingWordCount(text: string): number | null

export function continuationStarterDisplayText(
  text: string,
  starterIndex: number,
): string

export function continuationStarterDisplayInlines<T extends { readonly text: string }>(
  nodes: ReadonlyArray<T>,
  starterIndex: number,
): ReadonlyArray<T>
