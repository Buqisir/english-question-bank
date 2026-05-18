/**
 * piToPaperTextMap — pure adapter: PI report + input → PaperTextMap.
 *
 * Issue #21-C1.
 *
 * Rules (locked by verify script):
 *   - No React. No hooks. No DOM. No fetch. No localStorage. No router.
 *   - No side effects.
 *   - Pure function: same inputs → identical output.
 *   - TextMap is valid even if evidence is missing.
 *   - If passageBody is missing, emit valid empty paragraph/sentence
 *     structure rather than crashing.
 */

import { segmentPaperText } from '../../../../../shared/papersurface/segmentPaperText.mjs'
import type { PaperTextMap, PaperTextParagraph } from '../../../../../shared/papersurface/types'
import type { PaperIntelligenceReport } from '../paperIntelligenceTypes'

export type PiTextMapInput = {
  report: PaperIntelligenceReport
  bodies: Record<string, string>
}

/**
 * Build a PaperTextMap from PI report + passage bodies.
 *
 * Each passage in the report becomes a section. The passageBody for that
 * section (from input.json) is segmented into paragraphs and sentences
 * using the shared `segmentPaperText` segmenter.
 *
 * If passageBody is missing for a section, that section produces zero
 * paragraphs — a valid empty state that PaperSurface can render without
 * crashing.
 */
export function piToPaperTextMap(input: PiTextMapInput): PaperTextMap {
  const { report, bodies } = input
  const paperId = report?.sourcePaper?.paperId ?? ''
  const passages = Array.isArray(report?.passages) ? report.passages : []

  const paragraphs: PaperTextParagraph[] = []

  for (const passage of passages) {
    const section = passage?.paperSection
    if (!section) continue

    const passageBody = typeof bodies[section] === 'string' ? bodies[section] : ''
    if (!passageBody) {
      // Emit no paragraphs for this section — valid empty state.
      continue
    }

    const segmented = segmentPaperText(passageBody, { sectionId: section })

    for (const para of segmented.paragraphs) {
      paragraphs.push({
        id: para.id,
        section,
        sentences: para.sentences.map((s: { id: string; text: string; tokens: unknown[] }) => ({
          id: s.id,
          text: s.text,
          tokens: [], // Token segmentation deferred per spec.
        })),
      })
    }
  }

  return { paperId, paragraphs }
}
