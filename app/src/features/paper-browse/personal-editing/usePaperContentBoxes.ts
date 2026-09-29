import { useMemo } from 'react'
import type { PaperPageFrame } from './paperPlacement'

export type PaperContentBox = { pageId: string; leftPx: number; rightPx: number; topPx: number; bottomPx: number }

/*
 * Per-page content-area edges (document px) — the printable area
 * inside the page margins. Paged.js structure: .pagedjs_page > … >
 * .pagedjs_area (the pagebox grid's center cell, i.e. inside the page
 * margins) > .pagedjs_page_content; prefer the area, fall back to the page
 * content, and give a page with neither no box. Re-measured with measureKey
 * (the callers pass the anchor geometry) so the boxes track re-layouts and
 * font settles. Shared by the note-card layer (margin slots) and the appendix
 * marker layer (margin width).
 */
export function usePaperContentBoxes(
  iframe: HTMLIFrameElement | null,
  frames: readonly PaperPageFrame[],
  measureKey: unknown,
): PaperContentBox[] {
  return useMemo(() => {
    void measureKey
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return []
    const pages = doc.querySelectorAll('.pagedjs_page')
    const boxes: PaperContentBox[] = []
    for (const [index, frame] of frames.entries()) {
      const page = pages[index]
      if (!page) continue
      const area = page.querySelector('.pagedjs_area') ?? page.querySelector('.pagedjs_page_content')
      if (!area) continue
      const box = area.getBoundingClientRect()
      boxes.push({
        pageId: frame.pageId,
        leftPx: box.left + win.scrollX,
        rightPx: box.right + win.scrollX,
        topPx: box.top + win.scrollY,
        bottomPx: box.bottom + win.scrollY,
      })
    }
    return boxes
  }, [iframe, frames, measureKey])
}
