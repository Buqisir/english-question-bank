/**
 * LinkOverlay — draws the SVG dashed path from a question/option anchor to a
 * passage annotation anchor.
 *
 * Anchor priority (Cut 1):
 *
 *   target:
 *     1. `[data-ra-quote-anchor="<annotation.id>"]`        — preferred
 *     2. `[data-ra-sentence-id="<annotation.target.sentenceId>"]` — fallback
 *
 *   source:
 *     1. option   → `[data-ra-option-anchor="q:<qid>:<KEY>"]`     — preferred
 *     2. option   → `[data-ra-link-source="q:<qid>:<KEY>"]`        — fallback
 *     3. stem     → `[data-ra-link-source="q:<qid>"]`
 *
 * The path is drawn once when `activeLink.id` changes; scroll/resize updates
 * `d` only — they do not re-trigger the draw animation. Reduced-motion users
 * see the path immediately without animation.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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

function buildPath(sx: number, sy: number, tx: number, ty: number): string {
  // Horizontal bezier: control points pulled toward the midpoint.
  const dx = Math.max(60, Math.abs(tx - sx) * 0.45)
  const c1x = sx - dx
  const c1y = sy
  const c2x = tx + dx
  const c2y = ty
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`
}

function resolveSource(
  container: HTMLElement,
  selection: ActiveSelection,
): HTMLElement | null {
  if (selection.kind === 'stem') {
    return container.querySelector<HTMLElement>(
      `[data-ra-link-source="${cssEscape(`q:${selection.questionId}`)}"]`,
    )
  }
  if (selection.kind === 'option') {
    const key = `q:${selection.questionId}:${selection.optionKey}`
    return (
      container.querySelector<HTMLElement>(
        `[data-ra-option-anchor="${cssEscape(key)}"]`,
      ) ??
      container.querySelector<HTMLElement>(
        `[data-ra-link-source="${cssEscape(key)}"]`,
      )
    )
  }
  return null
}

function resolveTarget(
  container: HTMLElement,
  annotation: ReadingAnnotation,
): { el: HTMLElement; kind: 'quote' | 'sentence' } | null {
  const quoteEl = container.querySelector<HTMLElement>(
    `[data-ra-quote-anchor="${cssEscape(annotation.id)}"]`,
  )
  if (quoteEl) return { el: quoteEl, kind: 'quote' }
  const sentenceEl = container.querySelector<HTMLElement>(
    `[data-ra-sentence-id="${cssEscape(annotation.target.sentenceId)}"]`,
  )
  return sentenceEl ? { el: sentenceEl, kind: 'sentence' } : null
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function LinkOverlay(props: LinkOverlayProps): ReactNode {
  const { containerRef, scrollRefs, selection, links, annotations } = props
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  const annotationsById = useMemo(() => {
    const m = new Map<string, ReadingAnnotation>()
    for (const a of annotations) m.set(a.id, a)
    return m
  }, [annotations])

  const activeLink = findActiveLink(selection, links)
  const activeLinkId = activeLink?.id ?? null

  // Animation marker. Bump only when activeLink.id changes to a non-null
  // value — scroll/resize triggered recomputes must not change this.
  // The DOM path receives `data-link-instance="<n>"` so CSS keyframes can
  // restart cleanly via a brief animation reset.
  const lastLinkIdRef = useRef<string | null>(null)
  const instanceCounterRef = useRef<number>(0)
  const instance = useMemo(() => {
    if (activeLinkId !== lastLinkIdRef.current) {
      lastLinkIdRef.current = activeLinkId
      if (activeLinkId !== null) {
        instanceCounterRef.current += 1
      }
    }
    return instanceCounterRef.current
    // We deliberately depend on activeLinkId only — geometry changes from
    // scroll/resize must not change the instance counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLinkId])

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container || !activeLink) {
      setGeometry(null)
      return
    }
    const annotation = annotationsById.get(activeLink.toAnnotationId)
    if (!annotation) {
      setGeometry(null)
      return
    }
    const sourceEl = resolveSource(container, selection)
    const target = resolveTarget(container, annotation)
    if (!sourceEl || !target) {
      setGeometry(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const sourceRect = sourceEl.getBoundingClientRect()
    const targetRect = target.el.getBoundingClientRect()

    // Source anchor: when the source is the small option-letter badge we
    // start from its left-middle (it's a tiny circle, "left-middle" reads as
    // "the side closer to the passage"). For the stem button we still leave
    // from its left-middle. Both reduce to the same expression.
    const sx = sourceRect.left - containerRect.left
    const sy = sourceRect.top + sourceRect.height / 2 - containerRect.top
    // Target anchor: right-middle of the quote mark or sentence span.
    const tx = targetRect.right - containerRect.left
    const ty = targetRect.top + targetRect.height / 2 - containerRect.top

    setGeometry({
      d: buildPath(sx, sy, tx, ty),
      width: containerRect.width,
      height: containerRect.height,
    })
  }, [activeLink, annotationsById, containerRef, selection])

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

  // Animation reset: when `instance` changes, momentarily strip the animate
  // class then re-add it on the next frame. Reduced-motion users skip this.
  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    if (detectReducedMotion()) {
      path.classList.remove('ra-link-animate')
      return
    }
    path.classList.remove('ra-link-animate')
    // Force reflow so the next add re-triggers the keyframes.
    void path.getBoundingClientRect()
    path.classList.add('ra-link-animate')
  }, [instance])

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

/** Minimal CSS.escape polyfill — only handles the chars our ids use. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
}
