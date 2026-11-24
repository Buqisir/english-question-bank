export declare const APPLICATION_ANALYSIS_V4: 'application-analysis-v4'
export declare const APPLICATION_V4_WORD_RANGES: Readonly<{
  standard: readonly [number, number]
  advanced: readonly [number, number]
}>
export declare function countApplicationWords(text: string): number
export declare function applicationAnalysisV4ShapeProblems(value: unknown): string[]
export declare function isApplicationAnalysisV4(value: unknown): boolean
export declare function splitApplicationEssay(
  essay: string,
  given: readonly string[],
): { paragraphs: string[]; problems: string[] }
export declare function checkApplicationAnalysisV4(
  analysis: unknown,
  options?: { given?: readonly string[]; wordCountTarget?: number },
): {
  problems: string[]
  warnings: string[]
  wordCounts: { standard?: number; advanced?: number }
}
