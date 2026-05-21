/**
 * paperIntelligenceRoute — route parser for the Paper Intelligence readonly
 * preview page.
 *
 * URL surface:
 *   `?view=paper-intelligence&paperId=<id>`             → default PI surface
 *   `?view=paper-intelligence&paperId=<id>&surface=paper`
 *                                                       → paper-surface SPIKE
 *
 * This is a dev/preview-only route. It reads a static JSON report from
 * public/reports/ and renders a teacher-facing preview. No DB writes, no
 * model calls, no production entry point.
 *
 * Spike note (#21-A, #30 gate 1):
 *   The optional `surface` field exists ONLY to gate an isolated
 *   paper-like prototype surface. The default render path (no `surface`
 *   param) is unchanged and continues to mount `PaperIntelligencePreview`.
 *   We deliberately did NOT introduce a separate top-level route here so
 *   that the workbench fetch-effect early-return guards (`if
 *   (currentPiRoute.kind === 'paper-intelligence') return`) keep applying
 *   to the prototype too — it is still the same paper, rendered
 *   differently.
 *
 *   Naming history: this field used to accept `surface=print`. That was
 *   an A1-only placeholder that collided with the real PDF/HTML export
 *   pipeline in `server/print-renderer.mjs`. There is intentionally NO
 *   compat branch for the old value — `surface=print` now falls back to
 *   `'default'` like any other unknown surface, exactly the same as a
 *   missing `surface=` query param.
 */

/**
 * Set of recognized surface variants for the Paper Intelligence route.
 *
 * `'default'` is the implicit value when no `surface=` query param is
 * provided. Callers should treat it identically to "no surface field" —
 * the field is materialized as a string solely so downstream code can
 * `switch` on it without juggling `undefined`.
 *
 * `'paper'` activates the paper-surface prototype (#21-A spike).
 */
export type PaperIntelligenceSurface = 'default' | 'paper'
export type PaperIntelligenceSource = 'legacy-report' | 'paper-asset'

export type PaperIntelligenceRouteMatch =
  | { kind: 'none' }
  | {
      kind: 'paper-intelligence'
      paperId: string | null
      /**
       * Which rendering surface the URL asked for.
       * - `'default'` → existing `PaperIntelligencePreview`
       * - `'paper'`   → paper-surface prototype (#21-A spike)
       *
       * Always set; defaults to `'default'` when `?surface=` is missing
       * or unrecognized. Unknown values (including the legacy
       * `surface=print`) collapse to `'default'`.
       */
      surface: PaperIntelligenceSurface
      /**
       * Which static data source the paper surface should read.
       *
       * - `'legacy-report'` keeps the C4/C5 regression fixture path:
       *   `/reports/paper-intelligence/<paperId>/report.json`.
       * - `'paper-asset'` activates the C6a whole-paper asset path:
       *   `/paper-assets/<paperId>/paper-asset.json` plus reviewed
       *   analysis JSON.
       *
       * The default is legacy-report so all old URLs keep working.
       */
      source: PaperIntelligenceSource
      /**
       * Optional group identifier carried in the URL. Used by the
       * concierge entry (C6a-3) so the PaperSurface harness can focus
       * the intended passage group on load.
       */
      groupId: string | null
      /**
       * Optional question identifier carried in the URL. Used by the
       * concierge entry (C6a-3) so the PaperSurface harness can
       * pre-select the intended question on load.
       */
      questionId: string | null
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
  const surface: PaperIntelligenceSurface = rawSurface === 'paper' ? 'paper' : 'default'
  const rawSource = params.get('source')?.trim().toLowerCase() || ''
  const source: PaperIntelligenceSource =
    rawSource === 'paper-asset' ? 'paper-asset' : 'legacy-report'
  const groupId = params.get('groupId')?.trim() || null
  const questionId = params.get('questionId')?.trim() || null
  return { kind: 'paper-intelligence', paperId, surface, source, groupId, questionId }
}

/* ─────────────────────────── href builder ────────────────────────────── */

/**
 * Build a canonical paper-intelligence PaperSurface URL for the concierge
 * entry (C6a-3). Always sets `surface=paper` since the concierge 阅读解析
 * entry always targets the PaperSurface harness, never the default PI
 * preview. Optional `groupId` / `questionId` are included when provided
 * so the harness can pre-select the intended passage and question.
 */
export type BuildPaperSurfaceHrefArgs = {
  paperId: string
  source?: PaperIntelligenceSource | null
  groupId?: string | null
  questionId?: string | null
}

export function buildPaperSurfaceHref(args: BuildPaperSurfaceHrefArgs): string {
  const params = new URLSearchParams()
  params.set('view', 'paper-intelligence')
  if (args.source && args.source !== 'legacy-report') {
    params.set('source', args.source)
  }
  params.set('paperId', args.paperId)
  params.set('surface', 'paper')
  if (args.groupId) {
    params.set('groupId', args.groupId)
  }
  if (args.questionId) {
    params.set('questionId', args.questionId)
  }
  return `?${params.toString()}`
}

/**
 * C6a-3 bridge targets for concierge 「阅读解析」 entries.
 *
 * This intentionally maps only groups backed by an existing PaperSurface
 * source:
 * - legacy report fixtures under `app/public/reports/paper-intelligence`
 * - reviewed paper-asset fixtures under `app/public/paper-assets`
 *
 * Unsupported reading groups stay quiet instead of sending teachers to
 * an unrelated paper or an error page.
 */
const PAPER_SURFACE_ANALYSIS_TARGETS_BY_GROUP_ID: Record<
  string,
  Required<BuildPaperSurfaceHrefArgs>
> = {
  'g-2024-xkb1-a': {
    paperId: 'paper-2024-xkb1-reading',
    source: 'legacy-report',
    groupId: 'g-2024-xkb1-a',
    questionId: 'A-21',
  },
  'group-2024-jslk-reading-a': {
    paperId: 'paper-2024-jslk-english',
    source: 'paper-asset',
    groupId: 'group-2024-jslk-reading-a',
    questionId: 'q-2024-jslk-021',
  },
}

export function buildPaperSurfaceAnalysisHrefForGroupId(
  groupId: string | null | undefined,
): string | null {
  const target = groupId ? PAPER_SURFACE_ANALYSIS_TARGETS_BY_GROUP_ID[groupId] : undefined
  return target ? buildPaperSurfaceHref(target) : null
}
