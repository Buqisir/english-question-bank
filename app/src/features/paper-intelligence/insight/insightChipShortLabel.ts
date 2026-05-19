/**
 * insightChipShortLabel.ts — Issue #21-C4 PR #52 UX Retune.
 *
 * Pure short-label helper for the harness passage-structure rail
 * hover state. Returns a compact label suitable for the narrow rail.
 *
 * Module discipline:
 *   - No React, no hooks, no DOM, no fetch, no storage, no router.
 *   - No PaperSurface imports.
 *   - Only depends on the read-only `PassageReport` type.
 */

import type { PassageReport } from '../paperIntelligenceTypes'

/**
 * Build the short label shown inside the structure chip during the
 * hover/focus rail expansion (State 2). Difficulty/load language is
 * intentionally absent from PaperSurface.
 *
 * The function is total — every branch returns a string.
 */
export function buildInsightChipShortLabel(reportPassage: PassageReport): string {
  return reportPassage.passageOutline.mainIdea.trim() || '结构'
}
