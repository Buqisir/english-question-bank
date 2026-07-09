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

/**
 * buildPaperBrowseLectureHref — flow-panel 刀 3 入口带态换算.
 *
 * Converts a server-built PaperSurface analysis href
 * (`?view=paper-intelligence&source=paper-asset&paperId=<id>&surface=paper
 * &groupId=<gid>&questionId=<qid>`, from `buildPaperSurfaceHref` in
 * `server/search/paperSurfaceAvailability.mjs` — server untouched, zero
 * schema change) into the整卷页讲评态 href
 * (`?view=paper-browse&paperId=<id>&focusGroupId=<gid>&questionId=<qid>
 * &lecture=1`). Pure front-end string transform — the one place「看解析」
 * entry points (ConciergeGroupCard search card, QuestionGroupDetailView
 * detail page) convert the server href for the new destination. Returns
 * `null` when the source href doesn't carry a paperId (mirrors
 * `parsePaperIdFromHref`'s null-safety so callers can fall back to hiding
 * the entry instead of rendering a broken link).
 */
export function buildPaperBrowseLectureHref(href: string | null | undefined): string | null {
  const paperId = parsePaperIdFromHref(href)
  if (!paperId) return null
  const [, query = ''] = (href || '').split('?')
  const sourceParams = new URLSearchParams(query)
  const groupId = sourceParams.get('groupId')
  const questionId = sourceParams.get('questionId')

  const nextParams = new URLSearchParams()
  nextParams.set('view', 'paper-browse')
  nextParams.set('paperId', paperId)
  if (groupId) nextParams.set('focusGroupId', groupId)
  if (questionId) nextParams.set('questionId', questionId)
  nextParams.set('lecture', '1')
  return `?${nextParams.toString()}`
}
