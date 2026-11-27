import {
  mergeListeningSentenceAnalysis, validateListeningAnalysis,
} from '../../server/paper-import-ai/analyzeListening.mjs'

export function assertListeningSentenceTranslations(authored, sentenceTargets) {
  for (const [segmentId, material] of Object.entries(authored?.materials ?? {})) {
    if (material?.sentences === undefined) continue
    if (!Array.isArray(material.sentences)) throw new Error(`${segmentId} 的逐句译文格式无效`)
    const ids = new Set((sentenceTargets[segmentId] ?? []).map(({ id }) => id))
    for (const sentence of material.sentences) {
      if (!ids.delete(sentence?.id) || typeof sentence.zh !== 'string' || !sentence.zh.trim()) {
        throw new Error(`${segmentId} 的逐句译文 ID 或 zh 无效：${sentence?.id}`)
      }
    }
  }
}

// requireHeardDistractors: a freshly written draft must explain every wrong option built from heard words
// (docs/product/listening-methods.md §三); re-merging a stored analysis keeps the reminder as a warning.
export function mergeReviewedListeningAnalysis(document, segments, {
  staged = null, authored = null, requireHeardDistractors = false,
}) {
  const analysis = mergeListeningSentenceAnalysis(staged ?? authored, segments, staged ? authored : null)
  validateListeningAnalysis(analysis, { materialization: document, requireHeardDistractors })
  return analysis
}
