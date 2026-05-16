/**
 * LinkOverlay — draws the SVG dashed path from a question/option anchor to a
 * passage annotation anchor.
 *
 * Anchor priority, geometry math, scroll/resize listeners, ResizeObserver,
 * animation instance policy, and reduced-motion handling all live in
 * `./evidenceLinking/`. This component is intentionally thin: it asks the
 * hook for the current `geometry` and `instance`, and renders an SVG path.
 */

import { useRef, type ReactNode } from 'react'
import { useEvidenceLinkOverlay } from './evidenceLinking/index.ts'
import type {
  ActiveSelection,
  EvidenceLink,
  ReadingAnnotation,
} from './readingAnalysisTypes.ts'

export type LinkOverlayProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Element to listen to for scroll-driven reflow. Falls back to window. */
  scrollRefs?: Array<React.RefObject<HTMLElement | null>>
  selection: ActiveSelection
  links: EvidenceLink[]
  annotations: ReadingAnnotation[]
}

export function LinkOverlay(props: LinkOverlayProps): ReactNode {
  const { containerRef, scrollRefs, selection, links, annotations } = props
  const svgRef = useRef<SVGSVGElement | null>(null)
  const { activeLink, geometry, instance, pathRef } = useEvidenceLinkOverlay({
    containerRef,
    scrollRefs,
    selection,
    links,
    annotations,
  })

  if (!geometry || !activeLink) {
    return (
      <svg
        ref={svgRef}
        className="ra-link-overlay"
        aria-hidden="true"
        data-empty="true"
      />
    )
  }

  // Slightly desaturated to match the calmer panel palette while remaining
  // clearly readable as the page's primary visual cue.
  const stroke = activeLink.kind === 'support' ? '#2E8C5F' : '#B8732E'
  return (
    <svg
      ref={svgRef}
      className="ra-link-overlay"
      aria-hidden="true"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      <path
        ref={pathRef}
        data-link-id={activeLink.id}
        data-link-kind={activeLink.kind}
        data-link-instance={instance}
        d={geometry.d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
    </svg>
  )
}
