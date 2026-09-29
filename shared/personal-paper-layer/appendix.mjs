/*
 * Stable appendix ordering (#489 §8). Entries with a computable spot sort by
 * page, then vertical, then horizontal position; entries without one (anchor
 * not on the paper, foreign layout) keep a deterministic id order at the end.
 * The appendix number is the result's array index + 1 — the paper markers and
 * the appendix preview must render from the same call so their numbers agree.
 * Pure and DOM-free; the stage-5 PDF export reuses it.
 */
export function orderAppendixEntries(entries) {
  const positioned = []
  const unpositioned = []
  for (const entry of entries) {
    if (entry.pageIndex != null && entry.yMm != null && entry.xMm != null) positioned.push(entry)
    else unpositioned.push(entry)
  }
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  positioned.sort((a, b) => a.pageIndex - b.pageIndex || a.yMm - b.yMm || a.xMm - b.xMm || byId(a, b))
  unpositioned.sort(byId)
  return [...positioned, ...unpositioned].map((entry) => entry.id)
}

/*
 * The appendix entry's 出处 line: notes quote their anchor's first 24
 * characters, text boxes are named as themselves; a page number prefixes
 * both when the ordering spot is known. Shared by the appendix preview and
 * the export plan so both surfaces read identically.
 */
export function appendixSourceLabel({ type, pageIndex, exactText }) {
  const pagePrefix = pageIndex != null ? `第 ${pageIndex + 1} 页 · ` : ''
  if (type === 'text-box') return `${pagePrefix}文字框`
  const text = typeof exactText === 'string' ? exactText : ''
  const quoted = text.length > 24 ? `${text.slice(0, 24)}…` : text
  return `${pagePrefix}“${quoted}”`
}

/*
 * Where the 「附N」 marker sits on the paper (page-internal mm). A text
 * box's marker hangs at its stored origin; a note's marker hangs beside its
 * anchor's first line — the nearer page margin, horizontally centered in
 * that margin, top aligned with the first line. Returns null when no spot
 * is computable (the preview and the export plan both skip the marker).
 */
export function appendixMarkerPosition({ origin, anchorRectMm, contentBoxLeftMm, contentBoxRightMm, pageWidthMm }) {
  if (origin) {
    if (origin.xMm == null || origin.yMm == null) return null
    return { xMm: origin.xMm, yMm: origin.yMm, centered: false }
  }
  if (!anchorRectMm || anchorRectMm.leftMm == null || anchorRectMm.topMm == null) return null
  if (contentBoxLeftMm == null || contentBoxRightMm == null || pageWidthMm == null) return null
  const inLeftMargin = anchorRectMm.leftMm < pageWidthMm - anchorRectMm.leftMm
  const marginStartMm = inLeftMargin ? 0 : contentBoxRightMm
  const marginEndMm = inLeftMargin ? contentBoxLeftMm : pageWidthMm
  return { xMm: (marginStartMm + marginEndMm) / 2, yMm: anchorRectMm.topMm, centered: true }
}
