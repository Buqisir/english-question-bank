import {
  mergeListeningSentenceAnalysis, validateListeningAnalysis,
} from '../../server/paper-import-ai/analyzeListening.mjs'

// requireHeardDistractors: a freshly written draft must explain every wrong option built from heard words
// (docs/product/listening-methods.md §三); re-merging a stored analysis keeps the reminder as a warning.
export function mergeReviewedListeningAnalysis(document, segments, {
  staged = null, authored = null, requireHeardDistractors = false,
}) {
  const analysis = mergeListeningSentenceAnalysis(staged ?? authored, segments, staged ? authored : null)
  validateListeningAnalysis(analysis, { materialization: document, requireHeardDistractors })
  return analysis
}
