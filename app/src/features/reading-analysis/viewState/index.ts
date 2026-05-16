/**
 * Barrel for the Reading Analysis View State Module.
 *
 * Consumers (the route component, tests, future entry points) should
 * import from here so the internal split between the pure module and the
 * React glue can be reorganised without churn.
 */

export {
  deriveReadingAnalysisViewState,
  getInitialReadingAnalysisViewState,
} from './readingAnalysisViewState.ts'
export type {
  DeriveReadingAnalysisViewStateArgs,
  GetInitialReadingAnalysisViewStateArgs,
  ReadingAnalysisDetailLike,
  ReadingAnalysisFetchOutcome,
  ReadingAnalysisRouteQuery,
  ReadingAnalysisViewState,
} from './readingAnalysisViewState.ts'

export { useReadingAnalysisViewState } from './useReadingAnalysisViewState.ts'
