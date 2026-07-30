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
  horizontalChoiceGeometry: Readonly<Record<string, unknown>>
  goldenGeometryFramework: Readonly<Record<string, unknown>>
  referenceMeasurement: Readonly<{
    path: string
    sha256: string
  }>
}>
