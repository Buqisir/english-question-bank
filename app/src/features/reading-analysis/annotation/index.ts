/**
 * Barrel for the Reading Evidence Annotation Module.
 *
 * Consumers (selector, sidecar loader, report script, future
 * annotation-entry UIs, verify scripts) should import from here so the
 * internal split between types and observation helpers can be
 * reorganised without churn.
 */

export type {
  ReadingAnnotationSidecarEntry,
  ReadingAnalysisSidecar,
  ReadingAnalysisSidecarManifest,
  ReadingAnalysisSidecarSample,
  ReadingAnalysisQuoteDiagnostic,
  ReadingAnalysisQuoteReason,
} from './annotationTypes.ts'

export {
  classifyMissReason,
  normalizeQuote,
  summarizeQuoteDiagnostics,
} from './annotationCoverage.ts'
export type {
  CoverageParagraphLike,
  CoveragePassageLike,
  CoverageSentenceLike,
  ReadingAnalysisCoverageSummary,
} from './annotationCoverage.ts'
