/**
 * StructureBraceOverlay — Issue #21-C5b (hotfix).
 *
 * Renders a quiet vertical bracket ("brace") in the white A4 paper's
 * left padding area to mark the active paragraph or passage body.
 *
 * Product intent:
 *   - The brace is a paper-side mark, like a pencil annotation in the
 *     page margin.
 *   - It must live INSIDE the white .ps-page, in the left padding area
 *     (between the page left edge and the passage text left edge).
 *   - It must NOT live in the gray matte zone (.ps-surface background).
 *   - It must NOT overlap passage body text.
 *   - It must NOT use decorative embellishments (lines connecting
 *     elements, directional indicators, luminous effects, depth
 *     effects, color transitions, or semantic colors).
 *
 * Geometry:
 *   - The overlay is absolutely positioned inside .pi-ps-harness-left
 *     (the scrollable paper column). Coordinates are scroller-relative.
 *   - For paragraph mode: measures [data-paper-paragraph-id="<id>"]
 *     inside the active section.
 *   - For passage mode: measures .ps-passage-body inside the active
 *     section. Spans passage body ONLY, not questions.
 *   - x is placed at pageRect.left - scrollerRect.left + scrollLeft + 16,
 *     which lands inside the .ps-page left padding (56px padding minus
 *     text area). The brace right edge must be at least 12px before
 *     the target paragraph left edge.
 *
 * z-index:
 *   - Must remain BELOW the evidence line overlay (z:5).
 *   - Uses z-index: 3.
 *
 * Visibility:
 *   - Hidden at <=1199px (stacked mode) via CSS media query in the
 *     harness stylesheet.
 *   - pointer-events: none so clicks pass through to the paper.
 *
 * Module discipline:
 *   - Does NOT import PaperSurface.tsx or PaperSurface.css.
 *   - Does NOT import shared/papersurface modules.
 *   - Does NOT import adapter modules.
 *   - Queries the DOM via standard selectors against the neutral
 *     data-paper-* anchor protocol.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

export type StructureBraceTarget =
  | { mode: 'paragraph'; section: string; paragraphId: string }
  | { mode: 'passage'; section: string }
  | null

type BraceGeometry = {
  x: number
  y: number
  height: number
}

type Props = {
  /** Ref to the .pi-ps-harness-left scroller element. */
  scrollerRef: RefObject<HTMLDivElement | null>
  /** What the brace should highlight. null = hidden. */
  target: StructureBraceTarget
}

/**
 * Measure the brace geometry relative to the scroller.
 *
 * Returns null if measurement fails (element not found, zero-height, etc.)
 */
function measureBrace(
  scroller: HTMLDivElement,
  target: NonNullable<StructureBraceTarget>,
): BraceGeometry | null {
  const scrollerRect = scroller.getBoundingClientRect()

  // Find the .ps-page element inside the scroller.
  const page = scroller.querySelector<HTMLElement>('.ps-page')
  if (!page) return null
  const pageRect = page.getBoundingClientRect()

  // Resolve the target element.
  let targetEl: HTMLElement | null = null

  if (target.mode === 'paragraph') {
    // Find the specific paragraph inside the section.
    const section = scroller.querySelector<HTMLElement>(
      `[data-paper-section="${CSS.escape(target.section)}"]`,
    )
    if (!section) return null
    targetEl = section.querySelector<HTMLElement>(
      `[data-paper-paragraph-id="${CSS.escape(target.paragraphId)}"]`,
    )
  } else {
    // Passage mode: measure .ps-passage-body inside the section.
    const section = scroller.querySelector<HTMLElement>(
      `[data-paper-section="${CSS.escape(target.section)}"]`,
    )
    if (!section) return null
    targetEl = section.querySelector<HTMLElement>('.ps-passage-body')
  }

  if (!targetEl) return null
  const targetRect = targetEl.getBoundingClientRect()

  // Guard against zero-height targets.
  if (targetRect.height < 1) return null

  // Compute x: inside the .ps-page left padding.
  // pageRect.left gives the left edge of the white paper in viewport coords.
  // We want the brace at pageRect.left + 16px (inside the 56px padding),
  // converted to scroller-relative coordinates.
  const braceX =
    pageRect.left - scrollerRect.left + scroller.scrollLeft + 16

  // Safety check: brace right edge (x + braceWidth) must be at least 12px
  // before the target text's left edge. braceWidth is the SVG stroke area
  // (about 8px wide for the bracket shape). If it would overlap, nudge left.
  const braceWidth = 8
  const targetLeftInScroller =
    targetRect.left - scrollerRect.left + scroller.scrollLeft
  const maxBraceX = targetLeftInScroller - 12 - braceWidth
  const finalX = Math.min(braceX, maxBraceX)

  // Compute y: target top in scroller-relative coordinates.
  const braceY =
    targetRect.top - scrollerRect.top + scroller.scrollTop

  return {
    x: finalX,
    y: braceY,
    height: targetRect.height,
  }
}

export function StructureBraceOverlay({
  scrollerRef,
  target,
}: Props): ReactNode {
  const [geometry, setGeometry] = useState<BraceGeometry | null>(null)
  const rafRef = useRef<number>(0)

  const recalc = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller || !target) {
      setGeometry(null)
      return
    }
    const geo = measureBrace(scroller, target)
    setGeometry(geo)
  }, [scrollerRef, target])

  // Recalculate on target change, scroll, and resize.
  useEffect(() => {
    if (!target) {
      setGeometry(null)
      return
    }

    // Initial measurement (delayed one frame for layout).
    rafRef.current = requestAnimationFrame(() => {
      recalc()
    })

    const scroller = scrollerRef.current
    if (!scroller) return

    const handleScroll = (): void => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(recalc)
    }

    const handleResize = (): void => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(recalc)
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)

    return (): void => {
      cancelAnimationFrame(rafRef.current)
      scroller.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [target, recalc, scrollerRef])

  if (!geometry || !target) return null

  // Render the brace as an SVG bracket shape.
  // The bracket is a simple [ shape: two horizontal caps + vertical bar.
  const { x, y, height } = geometry
  const capLen = 6
  const strokeWidth = 1.5

  // SVG path for a left bracket: top cap, vertical line, bottom cap.
  const d = [
    `M ${x + capLen} ${y}`,
    `L ${x} ${y}`,
    `L ${x} ${y + height}`,
    `L ${x + capLen} ${y + height}`,
  ].join(' ')

  return (
    <svg
      className="pi-ps-structure-brace-overlay"
      data-brace-mode={target.mode}
      data-brace-section={target.section}
      aria-hidden="true"
    >
      <path
        className="pi-ps-structure-brace-path"
        d={d}
        fill="none"
        stroke="#9e9e9e"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
