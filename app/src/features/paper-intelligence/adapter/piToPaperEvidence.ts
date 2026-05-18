/**
 * piToPaperEvidence — pure adapter: PI report + textMap → PaperEvidence[].
 *
 * Issue #21-C1.
 *
 * Rules (locked by verify script):
 *   - No React. No hooks. No DOM. No fetch. No localStorage. No router.
 *   - No side effects.
 *   - Reuses existing `toEvidenceModel` / evidence adapter.
 *   - Does NOT reinvent evidence id format.
 *   - Evidence may be empty array if mapping is unsafe.
 *   - No evidence line geometry. No visible evidence paint.
 *   - Anchors may exist silently through PaperSurface if data is available.
 */

import type { PaperEvidence, PaperTextMap } from '../../../../../shared/papersurface/types'
import type { PaperIntelligenceReport } from '../paperIntelligenceTypes'
import { toEvidenceModel } from '../evidence/index.ts'
import type { EvidenceItem } from '../evidence/index.ts'

export type PiEvidenceInput = {
  report: PaperIntelligenceReport
  bodies: Record<string, string>
  textMap: PaperTextMap
}

/**
 * Build PaperEvidence[] from a PI report using the existing evidence
 * adapter.
 *
 * Strategy:
 *   - Use toEvidenceModel to get EvidenceItem[] with quotes.
 *   - For each EvidenceItem with a non-null quote, attempt to resolve
 *     the quote against the textMap (find the sentence that contains
 *     the quote text, compute start/end offsets).
 *   - If resolution fails (quote doesn't match any sentence), skip
 *     that evidence item — PaperSurface never paints a placeholder.
 *
 * C1 scope: evidence array may be empty. That is acceptable.
 */
export function piToPaperEvidence(input: PiEvidenceInput): PaperEvidence[] {
  const { report, bodies, textMap } = input

  const evidenceModel = toEvidenceModel(report, { bodies })
  const results: PaperEvidence[] = []

  for (const item of evidenceModel.evidenceItems) {
    if (!item.quote) continue

    const resolved = resolveQuoteInTextMap(item, textMap)
    if (!resolved) continue

    const kind = mapEvidenceKind(item.evidenceKind)
    const questionId = `${item.paperSection}-${item.questionNo}`

    results.push({
      id: item.id,
      questionId,
      kind,
      range: resolved,
    })
  }

  return results
}

/**
 * Map EvidenceItem.evidenceKind to PaperEvidence.kind.
 */
function mapEvidenceKind(kind: string): 'support' | 'trap' | 'context' {
  if (kind === 'support') return 'support'
  if (kind === 'trap') return 'trap'
  return 'context'
}

/**
 * Resolve an evidence item's quote against the textMap.
 *
 * Searches sentence texts in the same section for a verbatim match.
 * Returns the first match as a PaperTextRange, or null if not found.
 */
function resolveQuoteInTextMap(
  item: EvidenceItem,
  textMap: PaperTextMap,
): { sentenceId: string; start: number; end: number } | null {
  const section = item.paperSection
  const quote = item.quote
  if (!quote) return null

  // Search paragraphs in the matching section
  for (const para of textMap.paragraphs) {
    if (para.section !== section) continue
    for (const sentence of para.sentences) {
      const idx = sentence.text.indexOf(quote)
      if (idx !== -1) {
        return {
          sentenceId: sentence.id,
          start: idx,
          end: idx + quote.length,
        }
      }
    }
  }

  return null
}
