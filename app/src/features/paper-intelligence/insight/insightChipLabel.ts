/**
 * insightChipLabel.ts — Issue #21-C4 PaperSurface Insight Parity.
 *
 * Pure label helper for the harness passage-structure chip.
 *
 * Module discipline:
 *   - No React, no hooks, no DOM, no fetch, no storage, no router.
 *   - No PaperSurface imports.
 *   - Only depends on the read-only `PassageReport` type.
 *
 * Format: "篇章结构：A — 图书馆助手——年龄与时间要求。"
 *
 * PaperSurface keeps this label narrow and task-specific. Load bars,
 * evidence difficulty, and chunk counts belong in a separate
 * difficulty-oriented workflow, not in the A4 reading surface.
 */

import type { PassageReport } from '../paperIntelligenceTypes'

/**
 * Build the label text shown inside the closed insight chip and
 * exposed as the chip's `aria-label`.
 *
 * The function is total — every branch returns a string. Callers do
 * not need to null-check.
 */
export function buildInsightChipLabel(reportPassage: PassageReport): string {
  const mainIdea = reportPassage.passageOutline.mainIdea.trim()
  return mainIdea
    ? `篇章结构：${reportPassage.paperSection} — ${mainIdea}`
    : `篇章结构：${reportPassage.paperSection}`
}
