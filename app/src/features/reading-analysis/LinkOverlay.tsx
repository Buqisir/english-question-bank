/**
 * LinkOverlay — draws the SVG dashed path from a question/option anchor to
 * a passage annotation anchor.
 *
 * The overlay renders ONE absolutely-positioned SVG covering the whole
 * .reading-analysis-view container. On every selection/resize/scroll we
 * re-read the bounding rects of the source button and the target sentence
 * span, recompute a cubic-bezier path, and update the <path d="…">.
 *
 * No dependencies — only React + DOM rects + SVG.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

type Geometry = {
  d: string
  width: number
  height: number
}

function selectionToSourceKey(selection: ActiveSelection): string | null {
  if (selection.kind === 'stem') return `q:${selection.questionId}`
  if (selection.kind === 'option') return `q:${selection.questionId}:${selection.optionKey}`
  return null
}

function findActiveLink(
  selection: ActiveSelection,
  links: EvidenceLink[],
): EvidenceLink | null {
  if (selection.kind === 'none') return null
  if (selection.kind === 'stem') {
    return links.find(
      (l) => l.from.questionId === selection.questionId && !l.from.optionKey,
    ) ?? null
  }
  return links.find(
    (l) =>
      l.from.questionId === selection.questionId &&
      l.from.optionKey === selection.optionKey,
  ) ?? null
}

function buildPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): string {
  // Horizontal bezier: control points pulled toward the midpoint.
  const dx = Math.max(60, Math.abs(tx - sx) * 0.45)
  const c1x = sx - dx
  const c1y = sy
  const c2x = tx + dx
  const c2y = ty
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`
}

export function LinkOverlay(props: LinkOverlayProps): ReactNode {
  const { containerRef, scrollRefs, selection, links, annotations } = props
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  const activeLink = findActiveLink(selection, links)

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container || !activeLink) {
      setGeometry(null)
      return
    }
    const annotation = annotations.find((a) => a.id === activeLink.toAnnotationId)
    if (!annotation) {
      setGeometry(null)
      return
    }

    const sourceKey = selectionToSourceKey(selection)
    if (!sourceKey) {
      setGeometry(null)
      return
    }
    const sourceEl = container.querySelector<HTMLElement>(
      `[data-ra-link-source="${cssEscape(sourceKey)}"]`,
    )
    const targetEl = container.querySelector<HTMLElement>(
      `[data-ra-sentence-id="${cssEscape(annotation.target.sentenceId)}"]`,
    )
    if (!sourceEl || !targetEl) {
      setGeometry(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const sourceRect = sourceEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()

    // Source anchor: left-middle of the question button (path starts going left).
    const sx = sourceRect.left - containerRect.left
    const sy = sourceRect.top + sourceRect.height / 2 - containerRect.top
    // Target anchor: right-middle of the sentence span.
    const tx = targetRect.right - containerRect.left
    const ty = targetRect.top + targetRect.height / 2 - containerRect.top

    setGeometry({
      d: buildPath(sx, sy, tx, ty),
      width: containerRect.width,
      height: containerRect.height,
    })
  }, [activeLink, annotations, containerRef, selection])

  // Re-measure on selection change and immediately after layout.
  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  // Re-measure on scroll / resize / container size changes.
  useEffect(() => {
    if (!activeLink) return
    const handler = () => recompute()
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    const customScrollers = (scrollRefs ?? [])
      .map((r) => r.current)
      .filter((el): el is HTMLElement => Boolean(el))
    for (const el of customScrollers) {
      el.addEventListener('scroll', handler, { passive: true })
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(handler)
      ro.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
      for (const el of customScrollers) {
        el.removeEventListener('scroll', handler)
      }
      ro?.disconnect()
    }
  }, [activeLink, containerRef, recompute, scrollRefs])

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

  const stroke = activeLink.kind === 'support' ? '#1F8F5B' : '#C76D2A'
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
        data-link-id={activeLink.id}
        data-link-kind={activeLink.kind}
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

/** Minimal CSS.escape polyfill — only handles the chars our ids use. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
}
