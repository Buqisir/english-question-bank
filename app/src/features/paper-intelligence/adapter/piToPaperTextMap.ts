/**
 * piToPaperTextMap — pure adapter: PI report + input → PaperTextMap.
 *
 * Issue #21-C1, C5a.
 *
 * Rules (locked by verify script):
 *   - No React. No hooks. No DOM. No fetch. No localStorage. No router.
 *   - No side effects.
 *   - Pure function: same inputs → identical output.
 *   - TextMap is valid even if evidence is missing.
 *
 * C5a: The official surface=paper path uses confirmed passageStructure.
 *   - passageStructure MUST be provided for every passage.
 *   - If passageStructure is missing, the function throws (hard-fail).
 *   - Paragraph ids are emitted exactly from passageStructure (A-P1,
 *     A-P2, etc.). Never recomputed to A-p0.
 *   - Sentence segmentation still runs inside each confirmed paragraph.
 *   - Legacy auto-segmentation is available ONLY through the explicitly
 *     named `piToPaperTextMapLegacy` export (for tests / compat).
 */

import { segmentPaperText } from '../../../../../shared/papersurface/segmentPaperText.mjs'
import type { PaperTextMap, PaperTextParagraph } from '../../../../../shared/papersurface/types'
import type { PaperIntelligenceReport, PassageStructure } from '../paperIntelligenceTypes'

export type PiTextMapInput = {
  report: PaperIntelligenceReport
  bodies: Record<string, string>
  /**
   * C5a: Confirmed paragraph structure per section.
   * REQUIRED for the official surface=paper path.
   * Keyed by paperSection (e.g. 'A', 'B', 'C', 'D').
   */
  passageStructures: Record<string, PassageStructure>
}

/**
 * Build a PaperTextMap from PI report + confirmed passage structures.
 *
 * C5a official path: uses confirmed passageStructure paragraphs.
 * Throws if any passage used by the report is missing its passageStructure.
 *
 * Sentence segmentation runs inside each confirmed paragraph using the
 * shared segmenter, keyed by the confirmed paragraph id.
 */
export function piToPaperTextMap(input: PiTextMapInput): PaperTextMap {
  const { report, passageStructures } = input
  const paperId = report?.sourcePaper?.paperId ?? ''
  const passages = Array.isArray(report?.passages) ? report.passages : []

  const paragraphs: PaperTextParagraph[] = []

  for (const passage of passages) {
    const section = passage?.paperSection
    if (!section) continue

    const structure = passageStructures[section]
    if (!structure) {
      throw new Error(
        `[C5a] passageStructure missing for section "${section}". ` +
        `The official surface=paper path requires confirmed paragraph structure for every passage.`
      )
    }

    if (structure.section !== section) {
      throw new Error(
        `[C5a] passageStructure.section mismatch: expected "${section}", got "${structure.section}".`
      )
    }

    if (!Array.isArray(structure.paragraphs) || structure.paragraphs.length === 0) {
      throw new Error(
        `[C5a] passageStructure for section "${section}" has no paragraphs.`
      )
    }

    for (const para of structure.paragraphs) {
      // Sentence segmentation runs inside the confirmed paragraph text.
      // We use a synthetic single-paragraph segmentation by passing the
      // paragraph text through segmentPaperText with the paragraph id as
      // the sectionId prefix, then extract only the sentences.
      const sentences = segmentSentencesForParagraph(para.text, para.id)

      paragraphs.push({
        id: para.id,
        section,
        sentences,
      })
    }
  }

  return { paperId, paragraphs }
}

/**
 * Segment a single confirmed paragraph's text into sentences.
 *
 * Uses the shared segmentPaperText with the paragraph id as prefix.
 * Since the text is a single paragraph (no blank-line splits), the
 * segmenter will produce exactly one paragraph entry whose sentences
 * we extract. Sentence ids are: `{paraId}-s0`, `{paraId}-s1`, etc.
 */
function segmentSentencesForParagraph(
  text: string,
  paraId: string,
): Array<{ id: string; text: string; tokens: never[] }> {
  if (!text || !text.trim()) return []

  // segmentPaperText splits on blank lines for paragraphs; since our
  // input is a single paragraph's text (no blank lines), it will
  // produce exactly one paragraph entry. We use paraId as the
  // sectionId so sentence ids become `{paraId}-p0-s0`, etc.
  // But we want sentence ids to be `{paraId}-s{n}` directly.
  // So we call the segmenter and remap ids.
  const segmented = segmentPaperText(text, { sectionId: paraId })

  // Should be exactly 1 paragraph (no blank lines in confirmed text).
  const segPara = segmented.paragraphs[0]
  if (!segPara) return []

  return segPara.sentences.map((s: { id: string; text: string; tokens: unknown[] }, idx: number) => ({
    id: `${paraId}-s${idx}`,
    text: s.text,
    tokens: [] as never[],
  }))
}

/* ================================================================
 * Legacy auto-segmentation — explicitly named, NOT used by the
 * official surface=paper path. Kept only for test helpers and
 * backward compatibility with legacy harness paths.
 * ================================================================ */

export type PiTextMapLegacyInput = {
  report: PaperIntelligenceReport
  bodies: Record<string, string>
}

/**
 * LEGACY: Build a PaperTextMap using auto-segmentation (segmentPaperText).
 *
 * This is NOT the official C5a path. It uses the old A-p0, A-p1 id
 * format from segmentPaperText. Kept explicitly named for legacy
 * compatibility and test helpers only.
 */
export function piToPaperTextMapLegacy(input: PiTextMapLegacyInput): PaperTextMap {
  const { report, bodies } = input
  const paperId = report?.sourcePaper?.paperId ?? ''
  const passages = Array.isArray(report?.passages) ? report.passages : []

  const paragraphs: PaperTextParagraph[] = []

  for (const passage of passages) {
    const section = passage?.paperSection
    if (!section) continue

    const passageBody = typeof bodies[section] === 'string' ? bodies[section] : ''
    if (!passageBody) {
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
          tokens: [],
        })),
      })
    }
  }

  return { paperId, paragraphs }
}
