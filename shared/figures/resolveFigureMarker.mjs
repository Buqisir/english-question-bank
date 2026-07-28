/**
 * resolveFigureMarker — figure-render cut (fig-token P0).
 *
 * Single source of truth for "does this paragraph/line carry a figure
 * marker, and does it resolve to a real manifest figure" — imported by
 * EVERY live render surface (client PaperSurface adapter, detail page,
 * Print/PDF renderer) so the marker-detection + placeholder-fallback
 * rule (plan.md 行为规则 1 / 3, PA MF-4) can never drift between surfaces.
 *
 * Rule (MF-4, paragraph/line-granular, never substring):
 *   A unit's TRIMMED text must START WITH a manifest `placeholderMarker`
 *   (or, when no manifest hit, START WITH the raw `[表:`/`[图:` bracket
 *   token) for a figure/placeholder substitution to apply. A marker that
 *   appears mid-paragraph/mid-line, or a paragraph/line that starts with
 *   the marker but also carries other prose sharing the SAME unit, is
 *   still substituted wholesale — this file only decides "yes, this whole
 *   unit is a figure/placeholder", never "hide everything after the
 *   marker inside a mixed unit". Callers replace the WHOLE unit; they
 *   never trim a substring out of it (that was the exact anti-pattern
 *   PA's MF-4 flagged as a future silent-data-loss risk).
 */

const FIGURE_TOKEN_PATTERN = /^\[(?:表|图):[^\]]*\]/

/**
 * @typedef {{ figureId: string, groupId?: string, kind?: string, file: string, caption?: string, placeholderMarker: string }} PaperFigureManifestEntry
 */

/**
 * @param {string} rawText - one paragraph's (client) or one line's (print) text, untrimmed.
 * @param {ReadonlyArray<PaperFigureManifestEntry>} figures - this paper's figures/manifest.json `figures` array (or empty/undefined when the paper has no manifest).
 * @returns {{ kind: 'figure', figure: PaperFigureManifestEntry } | { kind: 'placeholder', marker: string } | null}
 *   null   — no `[表:`/`[图:` token at the start of this unit; render as normal text (no change from pre-cut behavior).
 *   figure — the unit starts with a manifest figure's exact placeholderMarker; render the figure.
 *   placeholder — the unit starts with a bracket token shaped like a figure marker, but no manifest entry matches it; render the "〔表格：见原卷〕" fallback card, never the raw token, never silently hidden.
 */
export function resolveFigureMarker(rawText, figures) {
  const trimmed = String(rawText ?? '').trim()
  if (!trimmed) return null
  const match = FIGURE_TOKEN_PATTERN.exec(trimmed)
  if (!match) return null

  const list = Array.isArray(figures) ? figures : []
  const figure = list.find(
    (entry) => entry && typeof entry.placeholderMarker === 'string' && trimmed.startsWith(entry.placeholderMarker),
  )
  if (figure) return { kind: 'figure', figure }
  return { kind: 'placeholder', marker: match[0] }
}

export { FIGURE_TOKEN_PATTERN }
