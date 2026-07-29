export const readingPassageLetterBySlotId: Readonly<Record<string, 'A' | 'B' | 'C' | 'D'>>

export type ReadingPassageLetterPrecedingKind =
  | 'reading_heading'
  | 'prior_content'

export type ReadingPassageLetterGeometry = Readonly<{
  precedingKind: ReadingPassageLetterPrecedingKind
  referenceBaselineStepRatio: number
  referenceRatioTolerance: number
  screenBaselineStepPx: number
  screenTolerancePx: number
  screenBeforeAdjustmentPx: number
  pdfBaselineStepPt: number
  pdfTolerancePt: number
  pdfBeforeAdjustmentPt: number | null
}>

export function readingPassageLetterGeometryForLetter(
  letter: 'A' | 'B' | 'C' | 'D',
  consumerId: 'screen' | 'print_pdf',
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
  followingGeometry: Readonly<{
    referenceBaselineStepRatio: number
    referenceRatioTolerance: number
    screenBaselineStepPx: number
    screenTolerancePx: number
    pdfBaselineStepPt: number
    pdfTolerancePt: number
  }>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
