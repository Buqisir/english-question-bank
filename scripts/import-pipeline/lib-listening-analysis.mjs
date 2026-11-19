import {
  mergeListeningSentenceAnalysis, validateListeningAnalysis,
} from '../../server/paper-import-ai/analyzeListening.mjs'

export function mergeReviewedListeningAnalysis(document, segments, { staged = null, authored = null }) {
  const analysis = mergeListeningSentenceAnalysis(staged ?? authored, segments, staged ? authored : null)
  validateListeningAnalysis(analysis, { materialization: document })
  return analysis
}
