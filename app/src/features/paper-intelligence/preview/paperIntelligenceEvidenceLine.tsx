/**
 * paperIntelligenceEvidenceLine — V2 cross-column evidence dotted line.
 *
 * Scope (locked in by reviewer):
 *   - Paper Intelligence ONLY. Does not import reading-analysis,
 *     LinkOverlay, useEvidenceLinkOverlay, or any sidecar from that
 *     subtree. The two systems stay decoupled; we may borrow the
 *     *idea* of a dashed SVG path connector but not the code.
 *   - Draws AT MOST ONE path at a time. No multi-line overlays, no
 *     load-bar / keyChunks / outline anchoring, no text-only
 *     distractor target.
 *   - Only renders when both:
 *       1. `activeQuestionId` is non-null (so a question is selected), AND
 *       2. `activeEvidenceId` is non-null and resolves to a real
 *          source element (right panel button) AND a real target
 *          element (left passage `<mark>`).
 *     Either gate failing → the overlay renders an empty `<svg>` with
 *     `data-empty="true"`. The component never renders a `<path>` it
 *     can't anchor.
 *   - Honors `prefers-reduced-motion` by skipping the draw-in animation
 *     class (the path still appears immediately).
 *
 * Architecture:
 *   - Pure helpers (`findFirstDomOccurrence`, `findEvidenceSource`,
 *     `computeOverlayGeometry`, `detectReducedMotion`) live in the
 *     companion `.ts` file `paperIntelligenceEvidenceLineGeometry.ts`.
 *     This split lets Node's strip-types ESM loader (used by the
 *     verify scripts) exercise the helpers in isolation, since it
 *     can't parse JSX in `.tsx` files.
 *   - This `.tsx` file owns the React surface only: the
 *     `usePaperIntelligenceEvidenceLine` hook (effects, listeners,
 *     state) and the `PaperIntelligenceEvidenceLine` component (one
 *     `<svg>` with at most one `<path>`).
 *
 * Multi-occurrence quote policy (locked, also documented in
 * `paperIntelligencePreviewModel.ts`): V1 highlights every
 * non-overlapping occurrence; V2 connects the dotted line to the
 * **first DOM occurrence** of the target evidence id. Picking the
 * first occurrence keeps the line visually stable when the teacher
 * re-selects a question and matches the order in which the model
 * emitted the quote candidates.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  computeOverlayGeometry,
  detectReducedMotion,
  findEvidenceSource,
  findFirstDomOccurrence,
  type EvidenceLineLeftSelectorPreset,
  type LineGeometry,
} from './paperIntelligenceEvidenceLineGeometry.ts'

// re-export the pure helpers so `.tsx` import sites can reach them
// without learning about the `.ts` split.
export {
  computeOverlayGeometry,
  detectReducedMotion,
  findEvidenceSource,
  findFirstDomOccurrence,
}
export type { EvidenceLineLeftSelectorPreset, LineGeometry }

/* ─────────────────────────── React hook ────────────────────────────── */

export type UsePaperIntelligenceEvidenceLineArgs = {
  /** The element the SVG sits inside. Must be `position:relative`. */
  containerRef: RefObject<HTMLElement | null>
  /** The left scroller (`.pi-main`). Used for target lookup AND as a
   *  scroll listener target so a passage scroll bumps geometry. */
  leftScrollerRef: RefObject<HTMLElement | null>
  /** The right Analysis Panel. Used for source lookup AND as a
   *  scroll listener target. */
  rightPanelRef: RefObject<HTMLElement | null>
  /** Top-level question selection. When null, the line is not drawn. */
  activeQuestionId: string | null
  /** Evidence-level focus. When null, the line is not drawn. */
  activeEvidenceId: string | null
  /**
   * Which selector to use for the LEFT-side anchor lookup.
   *
   *   - 'pi-preview' (default): historical contract used by
   *     `PaperIntelligencePreview`. Looks up
   *     `mark[data-pi-evidence-id="..."]` inside the passage body.
   *
   *   - 'paper-surface': Issue #21-C3. Looks up
   *     `[data-paper-evidence-id="..."]` so the harness can bridge
   *     `PaperSurface`'s neutral `data-paper-*` left anchors to the
   *     host-owned `data-pi-evidence-id` right anchors. PaperSurface
   *     never emits `data-pi-*`; the right-side selector is unchanged
   *     because the right Question Analysis is host-owned and stays
   *     in the PI namespace.
   */
  leftSelectorPreset?: EvidenceLineLeftSelectorPreset
  /**
   * Optional role of the active evidence (Issue #21-C3.6).
   *
   *   - 'support' — the dotted line connects the answer evidence; the
   *     stroke renders in mint green (the historical default).
   *   - 'trap'    — the dotted line connects a distractor source; the
   *     stroke renders in amber. The choice of amber (NOT red) is
   *     deliberate: the source text on the page is misleading, not
   *     wrong, so we avoid the "you got it wrong" red palette.
   *   - null      — the host has no role for the active evidence; the
   *     line falls back to the support-style green default. The
   *     default PI route call site does NOT pass this prop, so its
   *     visual contract is unchanged.
   *
   * Approach B (harness derives this explicitly): the host computes
   * the role from its own analysis view and passes it down. The line
   * component does NOT sniff the right-panel DOM for kind. */
  activeEvidenceKind?: 'support' | 'trap' | null
}

export type UsePaperIntelligenceEvidenceLineResult = {
  geometry: LineGeometry | null
  /** Identical to `activeEvidenceId` while geometry is non-null; null
   *  otherwise. The component renders this as `data-pi-evidence-id`
   *  on the `<path>` for smoke-test selectors. */
  drawnEvidenceId: string | null
  /** Whether reduced motion is on at the moment of the latest
   *  recompute. The component uses this to skip the draw-in
   *  animation class. */
  reducedMotion: boolean
}

export function usePaperIntelligenceEvidenceLine(
  args: UsePaperIntelligenceEvidenceLineArgs,
): UsePaperIntelligenceEvidenceLineResult {
  const {
    containerRef,
    leftScrollerRef,
    rightPanelRef,
    activeQuestionId,
    activeEvidenceId,
    leftSelectorPreset = 'pi-preview',
  } = args

  const [geometry, setGeometry] = useState<LineGeometry | null>(null)
  const [drawnEvidenceId, setDrawnEvidenceId] = useState<string | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Mounted guard so listener-driven setState never fires after
  // unmount (StrictMode + late rAF callback edge case).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const recompute = useCallback((): void => {
    const container = containerRef.current
    const leftScroller = leftScrollerRef.current
    const rightPanel = rightPanelRef.current

    // hard gate: question must be active AND evidence id present AND
    // refs attached. Without all three, blank the overlay.
    if (
      !container ||
      !leftScroller ||
      !rightPanel ||
      !activeQuestionId ||
      !activeEvidenceId
    ) {
      if (!mountedRef.current) return
      setGeometry(null)
      setDrawnEvidenceId(null)
      return
    }

    const sourceEl = findEvidenceSource(rightPanel, activeEvidenceId) as
      | HTMLElement
      | null
    const targetEl = findFirstDomOccurrence(
      leftScroller,
      activeEvidenceId,
      leftSelectorPreset,
    ) as HTMLElement | null
    if (!sourceEl || !targetEl) {
      // Either the right panel doesn't have a button for this evidence
      // id (e.g. text-only distractor — which the parent shouldn't
      // even pass us, but we defensively no-op) or the left mark
      // hasn't rendered yet. Blank the overlay; we'll retry on the
      // next layout effect.
      if (!mountedRef.current) return
      setGeometry(null)
      setDrawnEvidenceId(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const sourceRect = sourceEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()

    const next = computeOverlayGeometry(containerRect, sourceRect, targetRect)
    if (!mountedRef.current) return
    setGeometry(next)
    setDrawnEvidenceId(activeEvidenceId)
    setReducedMotion(detectReducedMotion())
  }, [
    activeEvidenceId,
    activeQuestionId,
    containerRef,
    leftScrollerRef,
    rightPanelRef,
    leftSelectorPreset,
  ])

  // Selection-change path: synchronous so the line appears the same
  // frame as the click. We also re-run on layout when refs change.
  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  // Listener path: scroll inside the left scroller, scroll inside the
  // right panel, window resize, container size change. All routed
  // through a single rAF coalescer.
  const rafIdRef = useRef<number | null>(null)
  const scheduleRecompute = useCallback((): void => {
    if (rafIdRef.current !== null) return
    if (typeof requestAnimationFrame === 'undefined') {
      recompute()
      return
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!mountedRef.current) return
      recompute()
    })
  }, [recompute])

  useEffect(() => {
    if (!activeQuestionId || !activeEvidenceId) return
    const handler = (): void => scheduleRecompute()
    const left = leftScrollerRef.current
    const right = rightPanelRef.current
    const container = containerRef.current

    window.addEventListener('resize', handler)
    if (left) left.addEventListener('scroll', handler, { passive: true })
    if (right) right.addEventListener('scroll', handler, { passive: true })

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(handler)
      ro.observe(container)
    }

    return (): void => {
      window.removeEventListener('resize', handler)
      if (left) left.removeEventListener('scroll', handler)
      if (right) right.removeEventListener('scroll', handler)
      ro?.disconnect()
      if (
        rafIdRef.current !== null &&
        typeof cancelAnimationFrame !== 'undefined'
      ) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [
    activeEvidenceId,
    activeQuestionId,
    containerRef,
    leftScrollerRef,
    rightPanelRef,
    scheduleRecompute,
  ])

  return { geometry, drawnEvidenceId, reducedMotion }
}

/* ─────────────────────────── React component ────────────────────────── */

export type PaperIntelligenceEvidenceLineProps =
  UsePaperIntelligenceEvidenceLineArgs

/**
 * Thin SVG component. All decision-making lives in the hook.
 *
 * The path carries:
 *   - `data-pi-evidence-id="<id>"` — smoke tests assert this matches
 *     the active evidence id.
 *   - `data-pi-line-kind="evidence"` — namespaces this overlay so any
 *     future overlay (e.g. a hover preview) can sit beside it.
 *   - `data-pi-evidence-kind="support" | "trap"` (Issue #21-C3.6) —
 *     present only when the host supplies `activeEvidenceKind`. The
 *     CSS uses this attribute (and the matching `pi-line-path--*`
 *     class modifier) to switch the stroke palette between the
 *     mint-green support default and the amber trap accent. The
 *     default PI route does not pass the prop, so neither the
 *     attribute nor the modifier appears in that call site and the
 *     existing green styling is preserved unchanged.
 *   - `class="pi-line-path"` — picks up dashed stroke styling.
 *   - `class="pi-line-path--support"` / `class="pi-line-path--trap"`
 *     (Issue #21-C3.6) — kind-specific modifier hook used by harness
 *     CSS to switch the stroke palette without relying on attribute
 *     selectors. Present only when `activeEvidenceKind` is set.
 *   - `class="pi-line-path--animated"` (only when reduced motion is
 *     OFF) — triggers the one-shot `pi-line-draw` keyframe animation.
 *
 * When no geometry is available, the component returns an empty
 * `<svg data-empty="true">`. We keep the wrapper in the DOM so the
 * smoke test can detect "overlay mounted but inactive" without
 * waiting for a re-render.
 */
export function PaperIntelligenceEvidenceLine(
  props: PaperIntelligenceEvidenceLineProps,
): ReactNode {
  const { geometry, drawnEvidenceId, reducedMotion } =
    usePaperIntelligenceEvidenceLine(props)
  const { activeEvidenceKind } = props

  if (!geometry || !drawnEvidenceId) {
    return (
      <svg
        className="pi-line-overlay"
        aria-hidden="true"
        data-empty="true"
      />
    )
  }

  // Compose the path's className from three independent axes:
  //   - base       : always present
  //   - kind hook  : 'pi-line-path--support' | 'pi-line-path--trap'
  //                  | '' when the host did not pass a kind. The
  //                  default PI route's call site stays in the
  //                  no-kind branch so its visual remains identical.
  //   - animation  : 'pi-line-path--animated' iff reduced motion off
  const kindClass =
    activeEvidenceKind === 'trap'
      ? ' pi-line-path--trap'
      : activeEvidenceKind === 'support'
        ? ' pi-line-path--support'
        : ''
  const animClass = reducedMotion ? '' : ' pi-line-path--animated'
  const pathClass = `pi-line-path${kindClass}${animClass}`

  return (
    <svg
      className="pi-line-overlay"
      aria-hidden="true"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      <path
        className={pathClass}
        data-pi-evidence-id={drawnEvidenceId}
        data-pi-evidence-kind={activeEvidenceKind ?? undefined}
        data-pi-line-kind="evidence"
        d={geometry.d}
        fill="none"
      />
    </svg>
  )
}
