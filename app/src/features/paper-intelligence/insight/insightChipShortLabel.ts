/**
 * insightChipShortLabel.ts — Issue #21-C4 PR #52 UX Retune.
 *
 * Pure short-label helper for the harness insight rail hover state.
 * Returns a compact label suitable for the 160px hover rail width.
 *
 * Format examples:
 *   A  负荷轻
 *   B  负荷适中
 *   C  证据难
 *   D  负荷重
 *
 * Module discipline:
 *   - No React, no hooks, no DOM, no fetch, no storage, no router.
 *   - No PaperSurface imports.
 *   - Only depends on the read-only `PassageReport` type.
 */

import type { PassageReport } from '../paperIntelligenceTypes'

/**
 * Build the short label shown inside the insight chip during the
 * hover/focus rail expansion (State 2). This is deliberately shorter
 * than `buildInsightChipLabel` — it shows only the single most
 * important signal so the 160px rail width stays readable without
 * ellipsis or text-overflow truncation.
 *
 * The function is total — every branch returns a string.
 */
export function buildInsightChipShortLabel(reportPassage: PassageReport): string {
  const loads = reportPassage.loads
  const avgScore =
    (loads.vocabularyChunkLoad.score +
      loads.grammarLoad.score +
      loads.discourseStructureLoad.score +
      loads.topicBackgroundLoad.score +
      loads.evidenceFindingLoad.score) /
    5
  const evidenceScore = loads.evidenceFindingLoad.score

  // Show the more distinctive signal: if evidence finding diverges
  // significantly from the average, surface the evidence signal;
  // otherwise show the overall load.
  if (evidenceScore >= 4 && avgScore < 3.5) {
    return '证据难'
  }
  if (avgScore <= 2) return '负荷轻'
  if (avgScore <= 3.5) return '负荷适中'
  return '负荷重'
}
