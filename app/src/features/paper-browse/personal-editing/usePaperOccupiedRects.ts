import { useCallback, useEffect, useMemo, useState } from 'react'
import { pxToMm, type PaperPageFrame } from './paperPlacement'

export type PaperOccupiedRect = {
  pageId: string
  /** Page-internal mm of the rendered card's border box. */
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

const rectListsEqual = (a: readonly PaperOccupiedRect[], b: readonly PaperOccupiedRect[]) => (
  a.length === b.length && a.every((rect, index) => {
    const other = b[index]
    return rect.pageId === other.pageId && rect.xMm === other.xMm && rect.yMm === other.yMm
      && rect.widthMm === other.widthMm && rect.heightMm === other.heightMm
  })
)

/*
 * Page-internal mm rects of every rendered note card and text box — the
 * occupied map the appendix markers dodge (same 1mm rule as the note
 * placement). Measured from the live DOM (offset* values are unscaled layout
 * px) after every render plus a ResizeObserver per card, so drags, the note
 * layer's height convergence and font settling all feed the markers without
 * new plumbing. Shared by nothing else: the export measure pass derives the
 * equivalent rects from its own plan cards.
 */
export function usePaperOccupiedRects(frames: readonly PaperPageFrame[]): PaperOccupiedRect[] {
  const [rects, setRects] = useState<PaperOccupiedRect[]>([])
  const frameByPageId = useMemo(
    () => new Map(frames.map((frame) => [frame.pageId, frame])),
    [frames],
  )
  const measure = useCallback(() => {
    const next: PaperOccupiedRect[] = []
    for (const node of document.querySelectorAll<HTMLElement>(
      '.paper-personal-paper-note[data-note-key][data-page-id], .paper-personal-text-box[data-box-key][data-page-id]',
    )) {
      const frame = frameByPageId.get(node.dataset.pageId ?? '')
      if (!frame) continue
      next.push({
        pageId: frame.pageId,
        xMm: pxToMm(node.offsetLeft - frame.leftPx),
        yMm: pxToMm(node.offsetTop - frame.topPx),
        widthMm: pxToMm(node.offsetWidth),
        heightMm: pxToMm(node.offsetHeight),
      })
    }
    // Same guard as the overflow keys: a fresh array every pass would loop
    // the effect forever.
    setRects((current) => (rectListsEqual(current, next) ? current : next))
  }, [frameByPageId])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(() => measure())
    for (const node of document.querySelectorAll('.paper-personal-paper-note, .paper-personal-text-box')) {
      observer.observe(node)
    }
    return () => observer.disconnect()
  })

  // Card heights settle once fonts load; the observe-on-mount above can miss
  // that (same re-check the note layer's overflow measurement does).
  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) measure()
    }).catch(() => {})
    return () => { cancelled = true }
  }, [measure])

  return rects
}
