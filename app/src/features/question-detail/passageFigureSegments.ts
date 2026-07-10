/**
 * passageFigureSegments — figure-render cut (fig-token P0).
 *
 * Pure logic, split out of QuestionGroupDetailView.tsx (no JSX here) so
 * `scripts/verify-figure-render.mjs` can import + exercise the SAME
 * production segmentation logic the detail-page `<pre>` path renders
 * through, on real paper-2026-i data — Node's built-in TS type-stripping
 * (no build step) can load a plain `.ts` file directly but not a `.tsx`
 * component file (JSX needs an actual transform, not just type erasure),
 * mirroring the existing `grammarFillBlank.ts` verify-import precedent
 * (`scripts/verify-i15-grammar-fill-blank-focus.mjs`).
 *
 * PO-2 (PA follow-up, PM-adopted, plan.md rule 4): the detail-page passage
 * keeps the flattened table text BELOW the image (§8 网站面 = 语义完整,
 * 做题-safe double-store) — this is the ONE surface where the flattened
 * text is deliberately preserved; every other surface (PaperSurface /
 * print / PDF / DOCX) replaces the paragraph/line wholesale with no text.
 *
 * `materialText` is paragraphs joined by "\n\n" (server's
 * `paperAssetParagraphText`, unchanged by this cut). Splitting on that
 * same delimiter recovers the paragraph units WITHOUT touching
 * server/api.mjs (out of this cut's Allowed scope) — for a paper-asset
 * sourced passage this round-trips byte-identically (materialText is
 * already normalized: trimmed, non-empty paragraphs joined by "\n\n", no
 * leading/trailing runs) — confirmed by `figures.length === 0`
 * short-circuiting to a SINGLE unsplit segment below, so the near-total
 * majority of groups (no manifest, or no paperId at all) render through
 * the EXACT pre-cut single-`<pre>` path.
 */
import { resolveFigureMarker, type PaperFigureManifestEntry } from '../../../../shared/figures/resolveFigureMarker.mjs'

export type { PaperFigureManifestEntry }

export const FIGURE_PLACEHOLDER_TEXT = '〔表格：见原卷〕'

export type PassageSegment =
  | { kind: 'text'; text: string }
  | { kind: 'figure'; flattenedText: string; figure: PaperFigureManifestEntry }
  | { kind: 'placeholder'; flattenedText: string }

export function buildPassageSegments(
  materialText: string,
  figures: ReadonlyArray<PaperFigureManifestEntry>,
): PassageSegment[] {
  if (figures.length === 0) return [{ kind: 'text', text: materialText }]

  const paragraphs = materialText.split(/\n\n+/)
  const segments: PassageSegment[] = []
  let textBuffer: string[] = []
  const flushTextBuffer = (): void => {
    if (textBuffer.length === 0) return
    segments.push({ kind: 'text', text: textBuffer.join('\n\n') })
    textBuffer = []
  }
  for (const paragraph of paragraphs) {
    const resolved = resolveFigureMarker(paragraph, figures)
    if (resolved?.kind === 'figure') {
      flushTextBuffer()
      // Browser QA finding: the marker itself is import-time locator
      // metadata, not table content — showing "[表: fig-...]" verbatim in
      // the flattened-text sidecar (even though it's the ONE surface that
      // keeps flattened text, PO-2) still reads as a leaked internal
      // token to the teacher. Strip the marker + immediately-following
      // whitespace so the double-store text is clean table content only.
      const flattenedText = paragraph.trim().slice(resolved.figure.placeholderMarker.length).trimStart()
      segments.push({ kind: 'figure', flattenedText, figure: resolved.figure })
    } else if (resolved?.kind === 'placeholder') {
      flushTextBuffer()
      segments.push({ kind: 'placeholder', flattenedText: paragraph })
    } else {
      textBuffer.push(paragraph)
    }
  }
  flushTextBuffer()
  return segments
}
