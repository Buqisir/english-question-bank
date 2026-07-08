/**
 * paperSurfaceHref — shared parsing for the "看整卷" entry points.
 *
 * A group's `paperSurfaceHref` looks like
 * `?view=paper-intelligence&...&paperId=<id>&groupId=<gid>`. Both the
 * detail-page entry (App.tsx `openPaperBrowseFromDetail`) and the concierge
 * row-level entry (`paper-row-browse-entry`) need to pull `paperId` out of
 * that href — this is the one place that parsing lives so it isn't
 * duplicated (and drifts) between the two call sites.
 */
export function parsePaperIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const [, query = ''] = href.split('?')
    const params = new URLSearchParams(query)
    return params.get('paperId') || null
  } catch {
    return null
  }
}
