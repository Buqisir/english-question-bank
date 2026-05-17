/**
 * paperSurfaceRoute — route parser for the Paper Surface spike prototype.
 *
 * URL surface:
 *   `?view=paper-surface-spike&paperId=<id>`
 *
 * This is a temporary spike/prototype route. It renders a static JSON
 * report in exam-paper layout to validate the DOM/CSS approach for
 * paper surface rendering.
 */

export type PaperSurfaceRouteMatch =
  | { kind: 'none' }
  | { kind: 'paper-surface-spike'; paperId: string | null }

export type PaperSurfaceLocationLike = {
  search: string
}

/**
 * Parse the current URL for paper-surface-spike route activation.
 * Returns `{ kind: 'none' }` if this URL is not a paper-surface-spike route.
 */
export function parsePaperSurfaceRoute(
  location: PaperSurfaceLocationLike,
): PaperSurfaceRouteMatch {
  const params = new URLSearchParams(location.search || '')
  if (params.get('view') !== 'paper-surface-spike') {
    return { kind: 'none' }
  }
  const paperId = params.get('paperId')?.trim() || null
  return { kind: 'paper-surface-spike', paperId }
}
