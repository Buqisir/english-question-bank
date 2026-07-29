export type SevenChoicesRhythmRoleClass =
  | 'readingBoundary'
  | 'chrome'
  | 'passageContent'
  | 'inlineBlank'
  | 'bankHeading'
  | 'bankOption'
  | 'teacherTail'
  | 'followingSection'

export type SevenChoicesRhythmTarget = Readonly<{
  baselineStepPx?: number
  baselineStepPt?: number
  oneStepTolerancePx?: number
  oneStepTolerancePt?: number
  fiveQuarterStepTolerancePx?: number
  fiveQuarterStepTolerancePt?: number
  twoStepTolerancePx?: number
  twoStepTolerancePt?: number
}>

export const sevenChoicesRhythm: Readonly<{
  semanticRoleClasses: Readonly<
    Record<SevenChoicesRhythmRoleClass, ReadonlyArray<string>>
  >
  adjacencyGraph: ReadonlyArray<Readonly<Record<string, unknown>>>
  targets: Readonly<{
    screen: SevenChoicesRhythmTarget
    printPdf: SevenChoicesRhythmTarget
  }>
  goldenGeometryFramework: Readonly<Record<string, unknown>>
  horizontalBankGeometry: Readonly<Record<string, unknown>>
  visibleGeometryAdjustments: Readonly<{
    revisionId: string
    screen: Readonly<{
      mergedInstructionMarginBottomPx: number
      followingSectionMarginTopAdjustmentPx: number
      adjacentChromeMarginTopAdjustmentPx: number
    }>
    printPdf: Readonly<{
      singleChromeMarginBottomPt: number
      adjacentChromeMarginBottomEm: number
    }>
  }>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
