export const readingFigureOptionStyles: Readonly<{
  bank: Readonly<Record<string, string | number>>
  option: Readonly<Record<string, string | number>>
  image: Readonly<Record<string, string | number>>
}>

export type ReadingFigureLayoutIntent = {
  readonly rowWidthPt: number
  readonly bankHeightPt: number
  readonly rowStartPt: number
  readonly stemToBankGapPt: number
  readonly questionTailGapPt: number
  readonly labelFontSizePt: number
  readonly labelLineHeightPt: number
  readonly placements: ReadonlyArray<{
    readonly labelLeftPt: number
    readonly labelTopPt: number
    readonly imageLeftPt: number
    readonly imageTopPt: number
    readonly imageWidthPt: number
    readonly imageHeightPt: number
  }>
}

export function measuredReadingFigureStyles(intent: ReadingFigureLayoutIntent): {
  bank: Record<string, string | number>
  options: Array<{ label: Record<string, string | number>; image: Record<string, string | number> }>
}
