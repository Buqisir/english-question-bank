export const readingPassageLetterBySlotId: Readonly<Record<string, 'A' | 'B' | 'C' | 'D'>>

export type ReadingPassageLetterPrecedingKind =
  | 'reading_heading'
  | 'prior_question_tail'

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
    priorQuestionTail: Omit<ReadingPassageLetterGeometry, 'precedingKind'>
  }>
  followingGeometry: Readonly<{
    referenceBaselineStepRatio: number
    referenceRatioTolerance: number
    screenBaselineStepPx: number
    screenTolerancePx: number
    pdfBaselineStepPt: number
    pdfTolerancePt: number
  }>
  verticalRhythm: Readonly<{
    semanticRoleClasses: Readonly<Record<
      'chrome' | 'passageContent' | 'questionStem' | 'optionLine' | 'teacherTail',
      ReadonlyArray<string>
    >>
    adjacencyGraph: ReadonlyArray<Readonly<{
      edgeId: string
      fromClass?: string
      fromRole?: string
      toClass?: string
      toRole?: string
      baselineStepRatio?: number
      pageRelation?: 'next_page_continuation' | 'next_page_start'
      optionalCollapse: boolean
      repeatForbiddenRoles?: ReadonlyArray<string>
    }>>
    targets: Readonly<{
      screen: Readonly<{
        baselineStepPx: number
        oneStepTolerancePx: number
        twoStepTolerancePx: number
      }>
      printPdf: Readonly<{
        baselineStepPt: number
        oneStepTolerancePt: number
        twoStepTolerancePt: number
      }>
    }>
  }>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
