export const readingPassageLetterBySlotId: Readonly<Record<string, 'A' | 'B' | 'C' | 'D'>>

export const readingPassageLetterTypography: Readonly<{
  horizontalPlacement: 'reading_content_column_center'
  fontSizePt: number
  lineHeightPt: number
  fontWeight: number
  marginBeforePt: number
  marginAfterPt: number
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
