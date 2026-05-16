/**
 * useEvidenceLinkOverlay — glue layer for LinkOverlay.
 *
 * This is the only place where the evidence-link layer touches React state,
 * effects, refs, and listeners. The rules it depends on (active link
 * resolution, source/target priority, geometry math, animation instance
 * policy, reduced-motion detection, scroll-into-view planning) all live in
 * `./evidenceLinking.ts` as plain functions, so they can be tested without
 * React or jsdom.
 *
 * The hook returns:
 *   - `activeLink`: the current link being drawn (or null)
 *   - `geometry`:   the SVG `d` + viewport size, or null
 *   - `instance`:   a monotonic counter that bumps on new active link only;
 *                   geometry-only recomputes (scroll/resize) do not bump
 *   - `pathRef`:    ref the consumer attaches to the <path>; the hook uses
 *                   it to reset CSS animation classes when `instance` changes
 *
 * Two side-effect concerns owned by this hook (Cut 2):
 *
 *   1. Auto-scroll. When `instance` changes (i.e. activeLink.id activated or
 *      switched), if the target is inside the first `scrollRefs` element and
 *      offscreen, scroll just that scroller — never window. Geometry-only
 *      recomputes (scroll/resize/RO) do not auto-scroll, because they do not
 *      bump `instance`.
 *
 *   2. rAF coalescing. The selection-change recompute path stays synchronous
 *      via `useLayoutEffect` so the dashed line appears immediately on click.
 *      The listener-driven path (window/element scroll, resize, RO) routes
 *      through `scheduleRecompute()`, which coalesces multiple events in the
 *      same frame into one rAF callback. Cleanup cancels any pending frame
 *      and a `mountedRef` guard prevents late `setState` calls after unmount.
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
  planScrollIntoView,
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

  // Mounted guard — listener callbacks scheduled via rAF must not call
  // setState after the component has unmounted (React 18 strict mode +
  // the late-frame edge case where rAF fires after cleanup).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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

  // Resolve the current target element + its kind (quote vs sentence). We
  // store this in a ref so the auto-scroll effect (which only depends on
  // `instance`) can read it without re-subscribing on every render.
  const targetElRef = useRef<HTMLElement | null>(null)

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container || !activeLink) {
      targetElRef.current = null
      if (mountedRef.current) setGeometry(null)
      return
    }
    const annotation = annotationsById.get(activeLink.toAnnotationId)
    if (!annotation) {
      targetElRef.current = null
      if (mountedRef.current) setGeometry(null)
      return
    }
    const sourceEl = resolveSource(container, selection)
    const target = resolveTarget(container, annotation)
    if (!sourceEl || !target) {
      targetElRef.current = null
      if (mountedRef.current) setGeometry(null)
      return
    }
    targetElRef.current = target.el
    if (!mountedRef.current) return
    setGeometry(
      computeOverlayGeometry(
        container.getBoundingClientRect(),
        sourceEl.getBoundingClientRect(),
        target.el.getBoundingClientRect(),
      ),
    )
  }, [activeLink, annotationsById, containerRef, selection])

  // rAF coalescer for listener-driven recomputes. Multiple scroll/resize/RO
  // events in the same frame share a single rAF callback. The pending frame
  // id is tracked via ref so `cancelAnimationFrame` can fire on cleanup.
  const rafIdRef = useRef<number | null>(null)
  const scheduleRecompute = useCallback(() => {
    if (rafIdRef.current !== null) return
    if (typeof requestAnimationFrame === 'undefined') {
      // Non-browser fallback (SSR / jsdom without rAF).
      recompute()
      return
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!mountedRef.current) return
      recompute()
    })
  }, [recompute])

  // Re-measure on selection change and immediately after layout. This path
  // is intentionally synchronous so the dashed line shows up the instant
  // the user clicks — we do not want a one-frame delay here.
  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  // Re-measure on scroll / resize / container size changes — coalesced.
  useEffect(() => {
    if (!activeLink) return
    const handler = () => scheduleRecompute()
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
      if (
        rafIdRef.current !== null &&
        typeof cancelAnimationFrame !== 'undefined'
      ) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [activeLink, containerRef, scheduleRecompute, scrollRefs])

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

  // Auto-scroll: keyed on `instance` so it fires only when the activeLink
  // id activates or switches — never on geometry-only recomputes (which do
  // not bump `instance`). After a blank clear, clicking the same link again
  // bumps `instance` (see `advanceAnimationInstance`) so we re-trigger.
  useEffect(() => {
    if (!activeLink) return
    const target = targetElRef.current
    if (!target) return
    const scroller = (scrollRefs ?? [])
      .map((r) => r.current)
      .find((el): el is HTMLElement => Boolean(el))
    if (!scroller) return
    if (!scroller.contains(target)) return // never scroll window or unrelated panes

    const plan = planScrollIntoView({
      scrollerRect: scroller.getBoundingClientRect(),
      scrollerScrollTop: scroller.scrollTop,
      scrollerScrollHeight: scroller.scrollHeight,
      scrollerClientHeight: scroller.clientHeight,
      targetRect: target.getBoundingClientRect(),
      reducedMotion: detectReducedMotion(),
    })
    if (plan.kind === 'noop') return

    if (typeof scroller.scrollTo === 'function') {
      try {
        scroller.scrollTo({ top: plan.nextScrollTop, behavior: plan.behavior })
        return
      } catch {
        // Fallback below — older browsers reject the options object.
      }
    }
    scroller.scrollTop = plan.nextScrollTop
    // We deliberately do not depend on `targetElRef.current` (it's a ref)
    // and do not include `scrollRefs`/`activeLink` indirectly via instance —
    // scrolling fires once per activation/change, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance])

  return { activeLink, geometry, instance, pathRef }
}
