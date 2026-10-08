export type ClozeRhythmRoleClass =
  | 'previousFamilyBoundary'
  | 'chrome'
  | 'passageContent'
  | 'inlineBlank'
  | 'choiceRow'
  | 'choiceLabel'
  | 'choiceText'
  | 'teacherTail'
  | 'followingSection'

export const clozeRhythm: Readonly<{
  semanticRoleClasses: Readonly<
    Record<ClozeRhythmRoleClass, ReadonlyArray<string>>
  >
  adjacencyGraph: ReadonlyArray<Readonly<Record<string, unknown>>>
  targets: Readonly<{
    screen: Readonly<Record<string, number>>
    printPdf: Readonly<Record<string, number>>
  }>
  blankGeometry: Readonly<Record<string, string | number>>
  horizontalChoiceGeometry: Readonly<{
    rowOccupancy: Readonly<Record<string, number>>
    strategy: Readonly<Record<string, string | boolean>>
    rendererMapping: Readonly<{
      rowWidthPt: number
      questionLabelWidthPt: number
      questionLabelStartPt: number
      columnStartsPt: ReadonlyArray<number>
      columnWidthsPt: ReadonlyArray<number>
      minimumGutterPt: number
      labelToTextGapEm: number
      visibleWeight: number
    }>
  }>
  goldenGeometryFramework: Readonly<Record<string, unknown>>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>

export function resolveConsumerClozeGeometry(ref?: {
  id: string
  version: string
  digest: string
} | null): Readonly<{
  questionLabelWidthPt: number
  questionLabelStartPt: number
  questionToFirstOptionGlyphGapEm: number
  minimumGutterPt: number
  labelToTextGapEm: number
  visibleWeight: number
  proportional: boolean
  columnStartsPt?: ReadonlyArray<number>
  columnWidthsPt?: ReadonlyArray<number>
  columnWidthSharesPt?: ReadonlyArray<number>
  rowWidthPt?: number
}>
