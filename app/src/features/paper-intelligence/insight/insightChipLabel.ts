/**
 * insightChipLabel.ts — Issue #21-C4 PaperSurface Insight Parity.
 *
 * Pure label helper for the harness insight chip. Mirrors the default
 * PI route's `buildInsightChipLabel` (PaperIntelligencePreview.tsx) so
 * the chip text on `surface=paper` reads identically to the default
 * route. The duplication is intentional for C4 — the future dedupe
 * target is recorded in `docs/paper-surface-watch-ledger.md`.
 *
 * Module discipline:
 *   - No React, no hooks, no DOM, no fetch, no storage, no router.
 *   - No PaperSurface imports.
 *   - Only depends on the read-only `PassageReport` type.
 *
 * Format: "洞察：负荷轻 · 证据适中 · 词块 6"
 *
 *   - The first slot averages the five PassageLoad scores and bins
 *     the result into 负荷轻 / 负荷适中 / 负荷重 — same thresholds the
 *     default PI route uses (≤2, ≤3.5, otherwise).
 *   - The second slot bins the evidence-finding load alone, so a
 *     teacher can see "easy article but tricky to find evidence"
 *     vs. "hard article with easy evidence" at a glance.
 *   - The third slot is the count of `keyChunks` so the teacher
 *     knows how many vocabulary items the popover will list.
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
  const loads = reportPassage.loads
  const avgScore =
    (loads.vocabularyChunkLoad.score +
      loads.grammarLoad.score +
      loads.discourseStructureLoad.score +
      loads.topicBackgroundLoad.score +
      loads.evidenceFindingLoad.score) /
    5
  const loadLabel =
    avgScore <= 2 ? '负荷轻' : avgScore <= 3.5 ? '负荷适中' : '负荷重'
  const evidenceScore = loads.evidenceFindingLoad.score
  const evidenceLabel =
    evidenceScore <= 2 ? '证据易' : evidenceScore <= 3 ? '证据适中' : '证据难'
  const chunkCount = Array.isArray(reportPassage.keyChunks)
    ? reportPassage.keyChunks.length
    : 0
  return `洞察：${loadLabel} · ${evidenceLabel} · 词块 ${chunkCount}`
}
