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
export declare function sectionHeadingRuntimeFromContract(
  contract: Readonly<Record<string, unknown>>,
): SectionHeadingRuntime
export declare function sectionHeadingTextRuns(
  text: string,
): ReadonlyArray<Readonly<{
  kind: 'numeric' | 'text'
  text: string
}>>
