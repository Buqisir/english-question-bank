/**
 * structureBrace.tsx — C5b Structure Brace overlay component.
 *
 * Renders a harness-owned SVG overlay that draws a vertical bracket
 * (brace) inside the white A4 paper's left padding area to indicate
 * the currently targeted passage body or paragraph.
 *
 * Design constraints (locked):
 *   - `pointer-events: none` on the SVG overlay.
 *   - z-index below evidence line (< 5, uses 3).
 *   - Hidden at <=1199px (CSS handles this).
 *   - Lives INSIDE the white .ps-page left padding (not in the gray
 *     matte zone). Placement is computed from .ps-page rect so the
 *     brace is always visible even when the left rail panel is open.
 *   - Shape: simple vertical bracket (vertical line + small top/bottom
 *     caps toward the text). No curly brace, notch, or embellishment.
 *   - Color: warm charcoal pencil tone rgba(47, 41, 35, 0.45).
 *   - Stroke width ~1.5px, round caps.
 *   - No connector line from rail button to brace.
 *   - Brace right edge must be at least 12px before the target
 *     paragraph text left edge (must not overlap passage body text).
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

export type StructureTarget = {
  paperSection: string
  mode: 'passage' | 'paragraph'
  paragraphId?: string
}

type BraceRect = { top: number; height: number; left: number } | null

type Props = {
  target: StructureTarget | null
  leftScrollerRef: RefObject<HTMLDivElement | null>
  isStacked: boolean
}

/**
 * StructureBraceOverlay — harness-local SVG that paints the vertical
 * bracket inside the white paper's left padding area.
 */
export function StructureBraceOverlay({ target, leftScrollerRef, isStacked }: Props): ReactNode {
  const [braceRect, setBraceRect] = useState<BraceRect>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!target || isStacked) {
      setBraceRect(null)
      return
    }

    const scroller = leftScrollerRef.current
    if (!scroller) {
      setBraceRect(null)
      return
    }

    function measure(): void {
      const scroller = leftScrollerRef.current
      if (!scroller || !target) {
        setBraceRect(null)
        return
      }

      let el: HTMLElement | null = null

      if (target.mode === 'paragraph' && target.paragraphId) {
        el = scroller.querySelector<HTMLElement>(
          `[data-paper-paragraph-id="${target.paragraphId}"]`
        )
      } else {
        // Passage mode: target the passage body container (.ps-passage-body)
        // inside the section. PaperSurface renders [data-paper-section="A"]
        // on the section root, but that includes questions. We MUST measure
        // only .ps-passage-body which contains just the passage text.
        const sectionEl = scroller.querySelector<HTMLElement>(
          `[data-paper-section="${target.paperSection}"]`
        )
        if (sectionEl) {
          const passageBody = sectionEl.querySelector<HTMLElement>('.ps-passage-body')
          el = passageBody ?? null
        }
      }

      if (!el) {
        setBraceRect(null)
        return
      }

      // Find the .ps-page element to compute x inside the white paper.
      const page = scroller.querySelector<HTMLElement>('.ps-page')
      if (!page) {
        setBraceRect(null)
        return
      }

      const scrollerRect = scroller.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const pageRect = page.getBoundingClientRect()

      // Position relative to the scroller's content origin.
      // The brace SVG is `position: absolute` inside the scrolling
      // .pi-ps-harness-left container, so its `top` must be
      // content-relative (not viewport-relative). We add
      // scroller.scrollTop to convert the viewport-relative delta
      // into a content-relative coordinate. Without this offset the
      // brace paints ~scrollTop pixels above the target when the
      // scroller is scrolled (browser QA: 1536/1440/1280).
      const top = elRect.top - scrollerRect.top + scroller.scrollTop
      const height = elRect.height

      if (height < 2) {
        setBraceRect(null)
        return
      }

      // Compute left: place the brace inside the .ps-page left padding.
      // The page has 56px padding; we offset 16px from pageRect.left so
      // the brace sits near the inner left edge of the white paper,
      // leaving room for the bracket shape (SVG_WIDTH = 20px).
      // Convert to scroller-relative coordinates.
      const braceLeft = pageRect.left - scrollerRect.left + scroller.scrollLeft + 16

      // Safety: ensure brace right edge (left + SVG_WIDTH) is at least
      // 12px before the target element's text left edge, so the bracket
      // never overlaps passage body text.
      const targetLeftInScroller = elRect.left - scrollerRect.left + scroller.scrollLeft
      const SVG_WIDTH = 20
      const maxLeft = targetLeftInScroller - 12 - SVG_WIDTH
      const finalLeft = Math.min(braceLeft, maxLeft)

      setBraceRect({ top, height, left: finalLeft })
    }

    // Measure immediately
    measure()

    // Re-measure on scroll (scroll remeasurement is OK)
    const scroller2 = leftScrollerRef.current
    if (scroller2) {
      scroller2.addEventListener('scroll', measure, { passive: true })
    }

    // PO decision: resize clears the active Structure Brace (handled
    // by the harness). The overlay does NOT remeasure on window resize.

    return () => {
      if (scroller2) {
        scroller2.removeEventListener('scroll', measure)
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, leftScrollerRef, isStacked])

  if (!braceRect || isStacked) return null

  // SVG bracket geometry:
  // The bracket is positioned inside the white paper's left padding.
  // It's a vertical line with small horizontal caps at top and bottom
  // pointing toward the text (rightward).
  const CAP_LENGTH = 6
  const STROKE_WIDTH = 1.5
  const SVG_WIDTH = 20
  const X_LINE = 8 // x position of the vertical line within the SVG
  const X_CAP_END = X_LINE + CAP_LENGTH // caps point right toward text

  const y1 = 0
  const y2 = braceRect.height

  // Path: top cap → vertical line → bottom cap
  const d = [
    `M ${X_CAP_END} ${y1}`,
    `L ${X_LINE} ${y1}`,
    `L ${X_LINE} ${y2}`,
    `L ${X_CAP_END} ${y2}`,
  ].join(' ')

  return (
    <svg
      className="pi-ps-structure-brace"
      style={{
        position: 'absolute',
        top: braceRect.top,
        left: braceRect.left,
        width: SVG_WIDTH,
        height: braceRect.height,
        pointerEvents: 'none',
        zIndex: 3,
        opacity: 1,
      }}
      aria-hidden="true"
      data-c5b-brace="true"
    >
      <path
        d={d}
        fill="none"
        stroke="rgba(47, 41, 35, 0.45)"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
