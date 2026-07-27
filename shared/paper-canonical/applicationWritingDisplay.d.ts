export type ApplicationWritingNoticeLine = {
  readonly kind: 'label' | 'instruction'
  readonly text: string
}

export function applicationWritingNoticeLines(
  text: string,
): ReadonlyArray<ApplicationWritingNoticeLine> | null
