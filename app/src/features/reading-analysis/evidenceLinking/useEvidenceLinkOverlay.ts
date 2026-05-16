/**
 * useEvidenceLinkOverlay — glue layer for LinkOverlay.
 *
 * This is the only place where the evidence-link layer touches React state,
 * effects, refs, and listeners. The rules it depends on (active link
 * resolution, source/target priority, geometry math, animation instance
 * policy, reduced-motion detection) all live in `./evidenceLinking.ts` as
 * plain functions, so they can be tested without React or jsdom.
 *
 * The hook returns:
 *   - `activeLink`: the current link being drawn (or null)
 *   - `geometry`:   the SVG `d` + viewport size, or null
 *   - `instance`:   a monotonic counter that bumps on new active link only;
 *                   geometry-only recomputes (scroll/resize) do not bump
 *   - `pathRef`:    ref the consumer attaches to the <path>; the hook uses
 *                   it to reset CSS animation classes when `instance` changes
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  advanceAnimationInstance,
  computeOverlayGeometry,
  createAnimationInstanceState,
  detectReducedMotion,
  findActiveLink,
  resolveSource,
  resolveTarget,
  type AnimationInstanceState,
  type Geometry,
} from './evidenceLinking.ts'
import type {
  ActiveSelection,
  EvidenceLink,
  ReadingAnnotation,
} from '../readingAnalysisTypes.ts'

export type UseEvidenceLinkOverlayArgs = {
  containerRef: React.RefObject<HTMLDivElement | null>
  scrollRefs?: Array<React.RefObject<HTMLElement | null>>
  selection: ActiveSelection
  links: EvidenceLink[]
  annotations: ReadingAnnotation[]
}

export type UseEvidenceLinkOverlayResult = {
  activeLink: EvidenceLink | null
  geometry: Geometry | null
  instance: number
  pathRef: React.RefObject<SVGPathElement | null>
}

const ANIMATE_CLASS = 'ra-link-animate'

export function useEvidenceLinkOverlay(
  args: UseEvidenceLinkOverlayArgs,
): UseEvidenceLinkOverlayResult {
  const { containerRef, scrollRefs, selection, links, annotations } = args
  const pathRef = useRef<SVGPathElement | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  const annotationsById = useMemo(() => {
    const m = new Map<string, ReadingAnnotation>()
    for (const a of annotations) m.set(a.id, a)
    return m
  }, [annotations])

  const activeLink = findActiveLink(selection, links)
  const activeLinkId = activeLink?.id ?? null

  // Animation instance — bump only when activeLink.id changes to a non-null
  // value. The state lives in a ref so geometry-driven re-renders do not
  // disturb it. The instance value is computed synchronously during render
  // via `useMemo` (matching the original LinkOverlay implementation): when
  // the activeLinkId changes, the ref is advanced and the new counter is
  // emitted in the same render pass, so the layout-effect that resets the
  // CSS animation runs against the right counter without an extra paint.
  const animStateRef = useRef<AnimationInstanceState>(
    createAnimationInstanceState(),
  )
  const instance = useMemo(() => {
    animStateRef.current = advanceAnimationInstance(
      animStateRef.current,
      activeLinkId,
    )
    return animStateRef.current.counter
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
    setGeometry(
      computeOverlayGeometry(
        container.getBoundingClientRect(),
        sourceEl.getBoundingClientRect(),
        target.el.getBoundingClientRect(),
      ),
    )
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
      path.classList.remove(ANIMATE_CLASS)
      return
    }
    path.classList.remove(ANIMATE_CLASS)
    // Force reflow so the next add re-triggers the keyframes.
    void path.getBoundingClientRect()
    path.classList.add(ANIMATE_CLASS)
  }, [instance])

  return { activeLink, geometry, instance, pathRef }
}
