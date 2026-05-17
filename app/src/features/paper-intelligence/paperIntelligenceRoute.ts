/**
 * paperIntelligenceRoute — route parser for the Paper Intelligence readonly
 * preview page.
 *
 * URL surface:
 *   `?view=paper-intelligence&paperId=<id>`            → default PI surface
 *   `?view=paper-intelligence&paperId=<id>&surface=print`
 *                                                       → print-surface SPIKE
 *
 * This is a dev/preview-only route. It reads a static JSON report from
 * public/reports/ and renders a teacher-facing preview. No DB writes, no
 * model calls, no production entry point.
 *
 * Spike note (#21-A):
 *   The optional `surface` field exists ONLY to gate an isolated print-like
 *   prototype surface. The default render path (no `surface` param) is
 *   unchanged and continues to mount `PaperIntelligencePreview`. Removing
 *   the spike is a one-line revert: drop the field, drop the App branch.
 *   We deliberately did NOT introduce a separate top-level route here so
 *   that the workbench fetch-effect early-return guards (`if
 *   (currentPiRoute.kind === 'paper-intelligence') return`) keep applying
 *   to the print surface too — it is still the same paper, rendered
 *   differently.
 */

/**
 * Set of recognized surface variants for the Paper Intelligence route.
 *
 * `'default'` is the implicit value when no `surface=` query param is
 * provided. Callers should treat it identically to "no surface field" —
 * the field is materialized as a string solely so downstream code can
 * `switch` on it without juggling `undefined`.
 *
 * `'print'` activates the spike print-surface prototype.
 */
export type PaperIntelligenceSurface = 'default' | 'print'

export type PaperIntelligenceRouteMatch =
  | { kind: 'none' }
  | {
      kind: 'paper-intelligence'
      paperId: string | null
      /**
       * Which rendering surface the URL asked for.
       * - `'default'` → existing `PaperIntelligencePreview`
       * - `'print'`   → spike print-surface prototype (#21-A)
       *
       * Always set; defaults to `'default'` when `?surface=` is missing
       * or unrecognized.
       */
      surface: PaperIntelligenceSurface
    }

export type PaperIntelligenceLocationLike = {
  search: string
}

/**
 * Parse the current URL for paper-intelligence route activation.
 * Returns `{ kind: 'none' }` if this URL is not a paper-intelligence route.
 */
export function parsePaperIntelligenceRoute(
  location: PaperIntelligenceLocationLike,
): PaperIntelligenceRouteMatch {
  const params = new URLSearchParams(location.search || '')
  if (params.get('view') !== 'paper-intelligence') {
    return { kind: 'none' }
  }
  const paperId = params.get('paperId')?.trim() || null
  const rawSurface = params.get('surface')?.trim().toLowerCase() || ''
  const surface: PaperIntelligenceSurface = rawSurface === 'print' ? 'print' : 'default'
  return { kind: 'paper-intelligence', paperId, surface }
}
