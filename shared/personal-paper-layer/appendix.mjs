/*
 * Stable appendix ordering (#489 §8). Entries with a computable spot sort by
 * page, then vertical, then horizontal position; entries without one (anchor
 * not on the paper, foreign layout) keep a deterministic id order at the end.
 * The appendix number is the result's array index + 1 — the paper markers and
 * the appendix preview must render from the same call so their numbers agree.
 * Pure and DOM-free; the stage-5 PDF export reuses it.
 */
import { OCCUPIED_GAP_MM, rectsOverlapWithGap } from './notePlacement.mjs'

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
 *
 * The marker also dodges the page's occupied rects (placed note cards, text
 * boxes, markers already placed — page-internal mm, `occupiedRectsMm`): it
 * keeps its horizontal position and steps down from the anchor line in
 * MARKER_STEP_MM steps until clear by OCCUPIED_GAP_MM; past the content
 * box's bottom it steps up from the anchor line instead. When no free spot
 * exists the original position is kept and `blocked` reports it — the
 * marker is never silently hidden. Callers place markers in appendix-number
 * order and feed each placed marker's own `rectMm` back in as occupied, so
 * two markers on one line cannot overlap.
 */

// The chip's own footprint, slightly generous over the rendered ~8.5×4.8mm
// chip (11px font, 16px line-height, 4px side padding, 1px border): pure
// placement cannot measure a DOM chip, so both surfaces dodge with these
// constants and the chip never outgrows its reserved rect.
export const APPENDIX_MARKER_WIDTH_MM = 9
export const APPENDIX_MARKER_HEIGHT_MM = 5

// Dodge steps, same cadence as the note cards' 4mm search.
const MARKER_STEP_MM = 4

export function appendixMarkerPosition({
  origin,
  anchorRectMm,
  contentBoxLeftMm,
  contentBoxRightMm,
  pageWidthMm,
  contentBoxTopMm = 0,
  contentBoxBottomMm = null,
  occupiedRectsMm = [],
}) {
  let base = null
  if (origin) {
    if (origin.xMm == null || origin.yMm == null) return null
    base = { xMm: origin.xMm, yMm: origin.yMm, centered: false }
  } else if (anchorRectMm && anchorRectMm.leftMm != null && anchorRectMm.topMm != null) {
    if (contentBoxLeftMm == null || contentBoxRightMm == null || pageWidthMm == null) return null
    const inLeftMargin = anchorRectMm.leftMm < pageWidthMm - anchorRectMm.leftMm
    const marginStartMm = inLeftMargin ? 0 : contentBoxRightMm
    const marginEndMm = inLeftMargin ? contentBoxLeftMm : pageWidthMm
    base = { xMm: (marginStartMm + marginEndMm) / 2, yMm: anchorRectMm.topMm, centered: true }
  }
  if (!base) return null

  // The centered marker's x is the margin midpoint (the chip translates
  // itself -50%); the reserved rect starts half a chip to the left.
  const rectAt = (yMm) => ({
    xMm: base.centered ? base.xMm - APPENDIX_MARKER_WIDTH_MM / 2 : base.xMm,
    yMm,
    widthMm: APPENDIX_MARKER_WIDTH_MM,
    heightMm: APPENDIX_MARKER_HEIGHT_MM,
  })
  const asRect = ({ xMm, yMm, widthMm, heightMm }) => ({ left: xMm, top: yMm, width: widthMm, height: heightMm })
  const freeAt = (yMm) => !occupiedRectsMm.some((other) => rectsOverlapWithGap(asRect(rectAt(yMm)), asRect(other), OCCUPIED_GAP_MM))
  const spot = (yMm, moved, blocked) => ({ xMm: base.xMm, yMm, centered: base.centered, rectMm: rectAt(yMm), moved, blocked })

  if (freeAt(base.yMm)) return spot(base.yMm, null, false)

  // Downward first, until the marker's bottom would cross the content box.
  const bottomLimitMm = contentBoxBottomMm == null ? null : contentBoxBottomMm - APPENDIX_MARKER_HEIGHT_MM
  if (bottomLimitMm != null) {
    for (let yMm = base.yMm + MARKER_STEP_MM; yMm <= bottomLimitMm + 1e-9; yMm += MARKER_STEP_MM) {
      if (freeAt(yMm)) return spot(yMm, 'down', false)
    }
  }
  for (let yMm = base.yMm - MARKER_STEP_MM; yMm >= contentBoxTopMm - 1e-9; yMm -= MARKER_STEP_MM) {
    if (freeAt(yMm)) return spot(yMm, 'up', false)
  }
  // No free strip in either direction: stay visible at the original spot and
  // let the caller report the collision.
  return spot(base.yMm, null, true)
}
