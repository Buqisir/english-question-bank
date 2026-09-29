import {
  PERSONAL_PLACEMENT_MAX_WIDTH_MM,
  PERSONAL_PLACEMENT_MIN_WIDTH_MM,
} from '../../../../../shared/personal-paper-layer/index.mjs'

// Layout pages are measured server-side in mm; the iframe renders them at
// CSS 96dpi, so every mm value converts with this factor (page box checks and
// the text-box placements share it).
export const MM_TO_PX = 96 / 25.4

// One page's box inside the paper canvas, in unscaled px (mm → px via MM_TO_PX).
export type PaperPageFrame = {
  pageId: string
  leftPx: number
  topPx: number
  widthMm: number
  heightMm: number
}

export function pxToMm(px: number): number {
  return px / MM_TO_PX
}

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100
}

// Keep a placed box inside its page: width within [8, 400]mm and the page
// width, x/y inside the page box with a 4mm bottom margin so a box never sits
// flush against the page edge. Mm values round to 2 decimals, matching the
// server's own mm measurement precision.
export const PLACEMENT_BOTTOM_MARGIN_MM = 4

export function clampPlacement(
  xMm: number,
  yMm: number,
  widthMm: number,
  page: { widthMm: number; heightMm: number },
): { xMm: number; yMm: number; widthMm: number } {
  const width = Math.min(
    PERSONAL_PLACEMENT_MAX_WIDTH_MM,
    Math.max(PERSONAL_PLACEMENT_MIN_WIDTH_MM, roundMm(widthMm)),
    roundMm(page.widthMm),
  )
  return {
    xMm: roundMm(Math.min(Math.max(0, xMm), Math.max(0, roundMm(page.widthMm) - width))),
    yMm: roundMm(Math.min(
      Math.max(0, yMm),
      Math.max(0, roundMm(page.heightMm) - PLACEMENT_BOTTOM_MARGIN_MM),
    )),
    widthMm: width,
  }
}

// Frame under a canvas-relative point (unscaled px), or null between pages.
export function frameAtPoint(
  frames: readonly PaperPageFrame[],
  xPx: number,
  yPx: number,
): PaperPageFrame | null {
  for (const frame of frames) {
    if (
      xPx >= frame.leftPx
      && xPx < frame.leftPx + mmToPx(frame.widthMm)
      && yPx >= frame.topPx
      && yPx < frame.topPx + mmToPx(frame.heightMm)
    ) return frame
  }
  return null
}
