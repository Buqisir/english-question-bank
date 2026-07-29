export const readingPassageLetterBySlotId: Readonly<Record<string, 'A' | 'B' | 'C' | 'D'>>

export type ReadingPassageLetterPrecedingKind =
  | 'reading_heading'
  | 'prior_content'

export type ReadingPassageLetterGeometry = Readonly<{
  precedingKind: ReadingPassageLetterPrecedingKind
  referenceInkGapPx: number
  referenceTolerancePx: number
  screenInkGapPx: number
  screenTolerancePx: number
  screenBeforeAdjustmentPx: number
  pdfInkGapPt: number
  pdfTolerancePt: number
  pdfBeforePaddingPt: number
}>

export function readingPassageLetterGeometryForLetter(
  letter: 'A' | 'B' | 'C' | 'D',
): ReadingPassageLetterGeometry

export function assertCanonicalReadingCompanion(input: {
  readonly blocks: ReadonlyArray<unknown> | undefined
  readonly passageLetter: 'A' | 'B' | 'C' | 'D' | undefined
}): void

export const readingPassageLetterTypography: Readonly<{
  horizontalPlacement: 'reading_content_column_center'
  fontSizePt: number
  lineHeightPt: number
  fontWeight: number
  marginBeforePt: number
  marginAfterPt: number
  precedingGeometry: Readonly<{
    normalizationRule: string
    readingHeading: Omit<ReadingPassageLetterGeometry, 'precedingKind'>
    priorContent: Omit<ReadingPassageLetterGeometry, 'precedingKind'>
  }>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
