export interface SectionHeadingRuntimeSurface {
  readonly fontStack: string
  readonly partHeadingIndentEm: number
  readonly sectionHeadingIndentEm: number
  readonly groupInstructionFirstLineIndentEm: number
  readonly passageFirstLineIndentEm: number
  readonly passageContinuationIndentEm: number
  readonly numericRunBaselineShiftEm: number
}

export interface SectionHeadingRuntime {
  readonly screen: SectionHeadingRuntimeSurface & {
    readonly fontSizePx: number
    readonly lineHeightPx: number
  }
  readonly printPdf: SectionHeadingRuntimeSurface & {
    readonly fontSizePt: number
    readonly lineHeightPt: number
  }
}

export declare const sectionHeadingContract: Readonly<Record<string, unknown>>
export declare const sectionHeadingRuntime: SectionHeadingRuntime
export declare const paperTypographyRuntime: Readonly<{
  coordinates: Readonly<{
    questionStemAndOuterOptionBlockStartTwip: number
  }>
  visibleWeight: Readonly<{
    questionNumber: number
    optionLabel: number
    optionText: number
    sectionHeading: number
    instruction: number
  }>
  partToFirstSectionGeometry: Readonly<{
    normalization: string
    visibleGlyphHeightToFontSizeRatio: Readonly<{
      printPdf: number
      screen: number
    }>
    visibleGlyphBottomStepRatio: number
    ratioTolerance: number
    surfaces: ReadonlyArray<string>
  }>
  footerContract: Readonly<{
    format: string
    prefix: string
    pageSuffix: string
    totalSuffix: string
    pageCountSemantics: string
    horizontalAlignment: string
    fontSizeRelativeToBody: number
    verticalPlacement: string
  }>
}>
export declare function paperTypographyRuntimeFromAuthority(
  authority: Readonly<Record<string, unknown>>,
): typeof paperTypographyRuntime
export declare function sectionHeadingRuntimeFromContract(
  contract: Readonly<Record<string, unknown>>,
): SectionHeadingRuntime
export declare function sectionHeadingTextRuns(
  text: string,
): ReadonlyArray<Readonly<{
  kind: 'numeric' | 'text'
  text: string
}>>
