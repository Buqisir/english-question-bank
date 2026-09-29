/*
 * Deterministic auto-near-anchor note placement (#489 4c). Pure data in, pure
 * data out: px/mm constants live here and the ink probe is injected by the
 * caller, so the paper editing view and the server-side export measure pass
 * resolve note spots through the same code.
 */

// The paper view renders at CSS 96dpi; mm↔px conversions here share that.
export const MM_TO_PX = 96 / 25.4

export function mmToPx(mm) {
  return mm * MM_TO_PX
}

/**
 * @typedef {'margin' | 'flow'} NoteSlot
 * @typedef {{ left: number, top: number, width: number, height: number }} RectPx
 * @typedef {{ pageId: string, leftPx: number, topPx: number, widthMm: number, heightMm: number }} PaperPageFrame
 * @typedef {{ pageId: string, xMm: number, yMm: number, widthMm: number, slot: NoteSlot, fits: boolean }} NoteCandidate
 * @typedef {{ margin: number, flow: number }} NoteHeightMm
 */

const EDGE_MM = 2
const GAP_MM = 2
const STEP_MM = 4

// Margin cards only exist where the side margin leaves real room; 16mm is the
// narrowest strip that still reads as a note column, 30mm keeps it from
// crowding the content edge on wide-margin pages.
const MIN_MARGIN_WIDTH_MM = 16
const MAX_MARGIN_WIDTH_MM = 30

// A candidate must clear every already-placed card by this much.
const OCCUPIED_GAP_MM = 1

/**
 * @param {readonly PaperPageFrame[]} frames
 * @param {number} xPx
 * @param {number} yPx
 * @returns {PaperPageFrame | null}
 */
function frameOfPoint(frames, xPx, yPx) {
  for (const frame of frames) {
    if (
      xPx >= frame.leftPx && xPx < frame.leftPx + mmToPx(frame.widthMm)
      && yPx >= frame.topPx && yPx < frame.topPx + mmToPx(frame.heightMm)
    ) return frame
  }
  return null
}

/**
 * @param {RectPx} rect
 * @param {readonly RectPx[]} occupied
 */
function collides(rect, occupied) {
  const gapPx = OCCUPIED_GAP_MM * MM_TO_PX
  for (const other of occupied) {
    if (
      rect.left - gapPx < other.left + other.width
      && rect.left + rect.width + gapPx > other.left
      && rect.top - gapPx < other.top + other.height
      && rect.top + rect.height + gapPx > other.top
    ) return true
  }
  return false
}

/**
 * Candidate order: (a) the page side margins — the nearest available area
 * around a dense content column and the teacher's handwritten-note habit —
 * nearest side to the anchor first, stepping down then up from the anchor's
 * first line; (b) the flow under then above the anchor, at the flow width.
 * Every candidate must pass the ink probe and clear the occupied cards.
 * `fits` reflects those checks; when nothing fits the caller must not cover
 * body text silently — it surfaces the no-space notice and lets the teacher
 * place the note by hand.
 *
 * @param {{
 *   anchorRects: readonly RectPx[],
 *   frames: readonly PaperPageFrame[],
 *   flowWidthMm: number,
 *   heightMm: NoteHeightMm,
 *   probe: (rect: RectPx) => boolean,
 *   contentBox?: { leftPx: number, rightPx: number },
 *   occupied?: readonly RectPx[],
 * }} input
 * @returns {NoteCandidate | null}
 */
export function placeNoteNearAnchor({ anchorRects, frames, flowWidthMm, heightMm, probe, contentBox, occupied = [] }) {
  if (anchorRects.length === 0) return null
  const sorted = [...anchorRects].sort((a, b) => a.top - b.top || a.left - b.left)
  const first = sorted[0]
  const frame = frameOfPoint(frames, first.left + 1, first.top + 1)
  if (!frame) return null
  // Only the anchor lines on the note's own page steer placement.
  const onPage = sorted.filter((rect) => frameOfPoint(frames, rect.left + 1, rect.top + 1)?.pageId === frame.pageId)
  const lineTop = Math.min(...onPage.map((rect) => rect.top))
  const lineBottom = Math.max(...onPage.map((rect) => rect.top + rect.height))
  const pageTopMm = frame.topPx / MM_TO_PX
  const pageBottomMm = pageTopMm + frame.heightMm

  /**
   * @param {NoteSlot} slot
   * @param {number} widthMm
   * @param {number} xMm
   * @param {number} yMm
   */
  const freeAt = (slot, widthMm, xMm, yMm) => {
    const rect = {
      left: xMm * MM_TO_PX,
      top: yMm * MM_TO_PX,
      width: widthMm * MM_TO_PX,
      height: heightMm[slot] * MM_TO_PX,
    }
    return probe(rect) && !collides(rect, occupied)
  }

  // (a) Side margins, nearest to the anchor's first-line center first. The
  // card keeps an EDGE gap to both the page edge and the content boundary.
  if (contentBox) {
    const leftUsableMm = (contentBox.leftPx - frame.leftPx) / MM_TO_PX - 2 * EDGE_MM
    const rightUsableMm = (frame.leftPx + mmToPx(frame.widthMm) - contentBox.rightPx) / MM_TO_PX - 2 * EDGE_MM
    const anchorCenterMm = (first.left + first.width / 2) / MM_TO_PX
    const sides = [
      { side: 'left', widthMm: Math.min(MAX_MARGIN_WIDTH_MM, leftUsableMm) },
      { side: 'right', widthMm: Math.min(MAX_MARGIN_WIDTH_MM, rightUsableMm) },
    ]
      .filter((side) => side.widthMm >= MIN_MARGIN_WIDTH_MM)
      .sort((a, b) => {
        const centerOf = (side, widthMm) => side === 'left'
          ? frame.leftPx / MM_TO_PX + EDGE_MM + widthMm / 2
          : (frame.leftPx + mmToPx(frame.widthMm)) / MM_TO_PX - EDGE_MM - widthMm / 2
        return Math.abs(centerOf(a.side, a.widthMm) - anchorCenterMm) - Math.abs(centerOf(b.side, b.widthMm) - anchorCenterMm)
      })
    for (const { side, widthMm } of sides) {
      const hMm = heightMm.margin
      const xMm = side === 'left'
        ? frame.leftPx / MM_TO_PX + EDGE_MM
        : (frame.leftPx + mmToPx(frame.widthMm)) / MM_TO_PX - EDGE_MM - widthMm
      const startYMm = lineTop / MM_TO_PX
      for (let yMm = startYMm; yMm + hMm <= pageBottomMm - EDGE_MM; yMm += STEP_MM) {
        if (freeAt('margin', widthMm, xMm, yMm)) {
          return { pageId: frame.pageId, xMm, yMm, widthMm, slot: 'margin', fits: true }
        }
      }
      for (let yMm = startYMm - hMm; yMm >= pageTopMm + EDGE_MM; yMm -= STEP_MM) {
        if (freeAt('margin', widthMm, xMm, yMm)) {
          return { pageId: frame.pageId, xMm, yMm, widthMm, slot: 'margin', fits: true }
        }
      }
    }
  }

  // (b) Flow: the whitespace under the anchor's last line, then above its
  // first line, stepping toward the page edge.
  const widthMm = flowWidthMm
  const hMm = heightMm.flow
  const minXMm = frame.leftPx / MM_TO_PX + EDGE_MM
  const maxXMm = frame.leftPx / MM_TO_PX + frame.widthMm - widthMm - EDGE_MM
  const xMm = Math.min(Math.max(first.left / MM_TO_PX, minXMm), Math.max(minXMm, maxXMm))

  const fitsAt = (yMm) => freeAt('flow', widthMm, xMm, yMm)

  const belowStart = lineBottom / MM_TO_PX + GAP_MM
  for (let yMm = belowStart; yMm + hMm <= pageBottomMm - EDGE_MM; yMm += STEP_MM) {
    if (fitsAt(yMm)) return { pageId: frame.pageId, xMm, yMm, widthMm, slot: 'flow', fits: true }
  }
  const aboveStart = lineTop / MM_TO_PX - GAP_MM - hMm
  for (let yMm = aboveStart; yMm >= pageTopMm + EDGE_MM; yMm -= STEP_MM) {
    if (fitsAt(yMm)) return { pageId: frame.pageId, xMm, yMm, widthMm, slot: 'flow', fits: true }
  }
  // No free strip: park just under the anchor so the notice can point at a
  // concrete spot, flagged not-fitting — the layer does not render it there.
  return {
    pageId: frame.pageId,
    xMm,
    yMm: Math.min(belowStart, pageBottomMm - EDGE_MM - hMm),
    widthMm,
    slot: 'flow',
    fits: false,
  }
}
