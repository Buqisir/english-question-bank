export declare const applicationWritingRhythm: Readonly<{
  semanticRoleClasses: Readonly<Record<string, ReadonlyArray<string>>>
  adjacencyGraph: ReadonlyArray<Readonly<Record<string, unknown>>>
  targets: Readonly<{
    screen: Readonly<Record<string, number>>
    printPdf: Readonly<Record<string, number>>
  }>
  responseGeometry: Readonly<{
    physicalAuthority: Readonly<{ path: string; section: string }>
    widthMm: number
    heightMm: number
    screenBorderPx: number
    printBorderPt: number
    paddingMm: number
    atomicity: string
    usableArea: string
    horizontalAlignment: string
  }>
  rendererMapping: Readonly<{
    screen: Readonly<Record<string, number>>
    printPdf: Readonly<Record<string, number>>
  }>
  goldenGeometryFramework: Readonly<{
    id: string
    path: string
    sha256: string
    axes: ReadonlyArray<string>
    familyValuesAreNotShared: boolean
  }>
  referenceMeasurement: Readonly<{ path: string; sha256: string }>
  publicArtifactOracle: Readonly<{ path: string; sha256: string }>
  observedCoverageOracle: Readonly<{ path: string; sha256: string }>
}>
