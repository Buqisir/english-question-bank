export type AnalysisTextRange = {
  start: number
  end: number
  quote: string
}

export type AnalysisTextPart = {
  text: string
  start: number
  end: number
  rangeIndices: number[]
}

export function assertAnalysisTextRanges(
  text: string,
  ranges: AnalysisTextRange[],
  location?: string,
): void

export function legacyUnderlineRanges(text: string, underlineTexts: string[]): AnalysisTextRange[]
export function partitionAnalysisText(text: string, ranges: AnalysisTextRange[]): AnalysisTextPart[]
