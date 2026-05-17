/**
 * paperIntelligenceRoute — route parser for the Paper Intelligence readonly
 * preview page.
 *
 * URL surface:
 *   `?view=paper-intelligence&paperId=<id>`
 *
 * This is a dev/preview-only route. It reads a static JSON report from
 * public/reports/ and renders a teacher-facing preview. No DB writes, no
 * model calls, no production entry point.
 */

export type PaperIntelligenceRouteMatch =
  | { kind: 'none' }
  | { kind: 'paper-intelligence'; paperId: string | null }

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
  return { kind: 'paper-intelligence', paperId }
}
