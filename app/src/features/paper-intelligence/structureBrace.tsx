/**
 * structureBrace.tsx — C5b Structure Brace overlay component.
 *
 * Renders a harness-owned SVG overlay that draws a vertical bracket
 * (brace) in the left paper matte zone to indicate the currently
 * targeted passage body or paragraph.
 *
 * Design constraints (locked):
 *   - `pointer-events: none` on the SVG overlay.
 *   - z-index below evidence line (< 5, uses 3).
 *   - Hidden at <=1199px (CSS handles this).
 *   - Lives in the left paper matte zone.
 *   - Shape: simple vertical bracket (vertical line + small top/bottom
 *     caps toward the paper). No curly brace, arrow, notch, shadow,
 *     glow, gradient, or semantic color.
 *   - Color: warm charcoal pencil tone rgba(47, 41, 35, 0.45).
 *   - Stroke width ~1.5px, round caps.
 *   - No connector line from rail button to brace.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

export type StructureTarget = {
  paperSection: string
  mode: 'passage' | 'paragraph'
  paragraphId?: string
}

type BraceRect = { top: number; height: number } | null

type Props = {
  target: StructureTarget | null
  leftScrollerRef: RefObject<HTMLDivElement | null>
  isStacked: boolean
}

/**
 * StructureBraceOverlay — harness-local SVG that paints the vertical
 * bracket in the left matte zone of .pi-ps-harness-left.
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
        // Passage mode: target the passage body container
        // PaperSurface renders [data-paper-section="A"] on the section root.
        // We want the passage body only (not questions), which is typically
        // the first child or the element with paragraphs inside the section.
        const sectionEl = scroller.querySelector<HTMLElement>(
          `[data-paper-section="${target.paperSection}"]`
        )
        if (sectionEl) {
          // The passage body is the section element itself minus question cards.
          // We use the section element's bounding rect as the passage body rect.
          el = sectionEl
        }
      }

      if (!el) {
        setBraceRect(null)
        return
      }

      const scrollerRect = scroller.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()

      // Position relative to the scroller's viewport
      const top = elRect.top - scrollerRect.top
      const height = elRect.height

      if (height < 2) {
        setBraceRect(null)
        return
      }

      setBraceRect({ top, height })
    }

    // Measure immediately
    measure()

    // Re-measure on scroll
    const scroller2 = leftScrollerRef.current
    if (scroller2) {
      scroller2.addEventListener('scroll', measure, { passive: true })
    }

    // Re-measure on resize via RAF loop (debounced)
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const onResize = (): void => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(measure, 50)
    }
    window.addEventListener('resize', onResize)

    return () => {
      if (scroller2) {
        scroller2.removeEventListener('scroll', measure)
      }
      window.removeEventListener('resize', onResize)
      if (resizeTimeout) clearTimeout(resizeTimeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, leftScrollerRef, isStacked])

  if (!braceRect || isStacked) return null

  // SVG bracket geometry:
  // The bracket is positioned in the left matte zone of the paper.
  // It's a vertical line with small horizontal caps at top and bottom
  // pointing toward the paper (rightward).
  const CAP_LENGTH = 6
  const STROKE_WIDTH = 1.5
  const SVG_WIDTH = 20
  const X_LINE = 8 // x position of the vertical line
  const X_CAP_END = X_LINE + CAP_LENGTH // caps point right toward paper

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
        left: 0,
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
