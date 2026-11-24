export declare const CONTINUATION_ANALYSIS_V3: 'continuation-analysis-v3'
export declare const CONTINUATION_V3_WORD_RANGES: Readonly<{
  standard: readonly [number, number]
  advanced: readonly [number, number]
}>
export declare const CONTINUATION_V3_WORD_TARGET: 150
export declare function countContinuationWords(text: string): number
export declare function normalizeContinuationText(text: string): string
export declare function directSpeechShare(text: string): number
export declare function continuationAnalysisV3ShapeProblems(value: unknown): string[]
export declare function isContinuationAnalysisV3(value: unknown): boolean
export declare function checkContinuationAnalysisV3(
  analysis: unknown,
  options?: { material?: string; starters?: readonly string[]; wordCountTarget?: number },
): {
  problems: string[]
  warnings: string[]
  wordCounts: { standard?: number; advanced?: number }
  directSpeech: { source?: number; standard?: number; advanced?: number }
}
