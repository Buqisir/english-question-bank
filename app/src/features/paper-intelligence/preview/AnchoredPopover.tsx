/**
 * AnchoredPopover — internal, deliberately narrow popover module shared
 * by Paper Intelligence's two anchor-driven floating surfaces:
 *
 *   - The篇章洞察 popover (chip in the passage header).
 *   - The草稿卷预览 popover (basket badge in the top bar).
 *
 * Both surfaces previously hand-rolled the same five concerns; this
 * module collapses that duplication. The module is INTENTIONALLY
 * scoped to those two callers — it is not a generalized Popper.
 *
 * ─── Responsibilities ───
 *
 *   1. Render `children` into `document.body` via React Portal so the
 *      popover escapes ancestor `overflow: auto` clipping (the
 *      `.pi-main` left scroller) and any sibling `position: sticky`
 *      stacking context (`.pi-side`). See the original QA #19 fix
 *      notes on `InsightChipAndPanel` for the rationale.
 *
 *   2. Position with `position: fixed` below the anchor. The vertical
 *      placement is fixed at "below"; the horizontal alignment is the
 *      ONLY axis a caller can pick:
 *
 *        align: 'start' → left = anchorRect.left          (left-align)
 *        align: 'end'   → left = anchorRect.right - width (right-align)
 *
 *      In both cases `left` is clamped into the viewport with
 *      `viewportPaddingPx`. There is NO `placement` prop, NO top /
 *      left / right placement, NO auto-flip. The module deliberately
 *      stays a two-caller adapter — one chip is left-aligned, one
 *      badge is right-aligned, and that horizontal-axis split is
 *      the only flexibility a future Paper Intelligence surface gets
 *      out of this module. If a future surface needs anything else,
 *      write a sibling module.
 *
 *   3. Recompute position on capture-phase `scroll` (so inner
 *      scrollers like `.pi-main` are caught) and on `resize`.
 *      Recomputes are coalesced through `requestAnimationFrame` so
 *      a fast scroll never enqueues more than one layout read per
 *      frame.
 *
 *   4. Optionally close on Esc (`closeOnEscape`) and on a `mousedown`
 *      whose target is outside both the popover and the anchor
 *      (`closeOnOutsidePointerDown`). A click on the anchor itself
 *      is never treated as "outside" — pressing the anchor button
 *      to toggle the popover stays a single user gesture, with no
 *      double-flip.
 *
 *   5. Tear down all listeners + cancel any pending rAF on unmount
 *      or when `open` flips false. SSR / non-browser guard: returns
 *      `null` when `document` is unavailable.
 *
 * ─── Non-responsibilities ───
 *
 *   - Does NOT accept a `placement` prop, NOT support top / left /
 *     right placement, NOT auto-flip. Below-the-anchor is the
 *     only vertical placement; horizontal is restricted to
 *     `align: 'start' | 'end'`.
 *   - Does NOT do focus trap, autofocus, or arrow-key nav.
 *   - Does NOT manage `open` state. The caller owns it; `open` is
 *     a controlled prop.
 *   - Does NOT decide whether opening one popover should close
 *     another. That coordination stays in the caller.
 *   - Does NOT touch `activeQuestionId` / `activeEvidenceId` /
 *     `activeInsightSection`. The module knows nothing about洞察
 *     or草稿卷.
 *
 * ─── Width contract ───
 *
 *   The module writes `--anchored-popover-width: ${widthPx}px` to
 *   the popover root's inline style. Callers' CSS reads it via
 *   `width: var(--anchored-popover-width, …)`. This way the JS-side
 *   clamp width and the painted CSS width can never drift — change
 *   `widthPx` and both follow.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Public props of the module. Kept narrow on purpose — every prop
 * has a corresponding responsibility documented above. Adding a
 * prop should be paired with a reason-for-being in the JSDoc.
 */
export type AnchoredPopoverProps = {
  /**
   * Ref to the anchor element. `getBoundingClientRect()` on this
   * element drives positioning. The element is also exempted from
   * outside-pointerdown closing.
   */
  anchorRef: RefObject<HTMLElement | null>
  /** Controlled open state. The module renders nothing when false. */
  open: boolean
  /** Called when the module decides the popover should close. */
  onClose: () => void
  /** Optional `id` on the popover root — useful for `aria-controls`. */
  id?: string
  /**
   * `role` on the popover root. Defaults to `"dialog"` since both
   * current callers are read-only inspection panels.
   */
  role?: string
  /** `aria-label` on the popover root. */
  ariaLabel?: string
  /** Optional `className` applied to the popover root. */
  className?: string
  /**
   * Width in CSS pixels. Used both for the viewport clamp AND
   * emitted as the `--anchored-popover-width` custom property on
   * the popover root. Callers' CSS reads it for the actual `width`.
   */
  widthPx: number
  /** Vertical gap between anchor's bottom edge and popover top. */
  gapPx?: number
  /** Minimum distance between popover and viewport edges. */
  viewportPaddingPx?: number
  /**
   * Horizontal alignment relative to the anchor. The vertical
   * placement is always "below the anchor + gapPx".
   *
   *   'start' → popover left edge aligns to anchor's left edge.
   *   'end'   → popover right edge aligns to anchor's right edge.
   *
   * Both alignments clamp into the viewport with `viewportPaddingPx`.
   * Default: 'end'. NOT a placement prop — this is the only
   * horizontal-axis switch the module supports, and it exists
   * solely so the two real callers can keep their existing visual
   * positions (the洞察 chip is left-aligned; the草稿卷 badge is
   * right-aligned).
   */
  align?: 'start' | 'end'
  /** Close when Esc is pressed (document keydown). Default: false. */
  closeOnEscape?: boolean
  /**
   * Close on `mousedown` whose target is outside both the popover
   * and the anchor. Bound on `mousedown` (not `click`) so the
   * close fires before the anchor button's `onClick` would
   * otherwise re-toggle the popover open. Default: false.
   */
  closeOnOutsidePointerDown?: boolean
  /**
   * Additional `data-*` attributes copied verbatim onto the
   * popover root. Kept as an explicit map so the module surface
   * stays narrow — callers cannot spread arbitrary HTML props.
   * Existing smoke selectors (`data-pi-insight-panel`,
   * `data-pi-basket-popover`, …) flow through here.
   */
  dataAttributes?: Record<string, string>
  children: ReactNode
}

type Position = { top: number; left: number }

/**
 * Pure geometry helper: position the popover below the anchor with
 * the chosen horizontal alignment, clamped to the viewport with a
 * configurable padding. Exported only for tests / verify scripts
 * that want to assert the math without rendering.
 */
export function computeAnchoredPopoverPosition(args: {
  anchorRect: DOMRect
  viewportWidth: number
  widthPx: number
  gapPx: number
  viewportPaddingPx: number
  align: 'start' | 'end'
}): Position {
  const { anchorRect, viewportWidth, widthPx, gapPx, viewportPaddingPx, align } = args
  const top = anchorRect.bottom + gapPx
  const desiredLeft =
    align === 'start' ? anchorRect.left : anchorRect.right - widthPx
  const minLeft = viewportPaddingPx
  const maxLeft = Math.max(minLeft, viewportWidth - widthPx - viewportPaddingPx)
  const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft)
  return { top, left }
}

export function AnchoredPopover(props: AnchoredPopoverProps): ReactNode {
  const {
    anchorRef,
    open,
    onClose,
    id,
    role = 'dialog',
    ariaLabel,
    className,
    widthPx,
    gapPx = 6,
    viewportPaddingPx = 12,
    align = 'end',
    closeOnEscape = false,
    closeOnOutsidePointerDown = false,
    dataAttributes,
    children,
  } = props

  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<Position | null>(null)

  // ─── Position effect ────────────────────────────────────────────
  // Capture-phase scroll catches inner scrollers (`.pi-main` etc.)
  // that don't bubble scroll to window. resize keeps the clamp
  // accurate when the layout reflows. Both paths feed through a
  // single rAF gate so a fast scroll cannot enqueue more than one
  // layout read per frame.
  useLayoutEffect(() => {
    if (!open) {
      // When the popover closes, clear position so a subsequent
      // open re-renders only after the layout effect has measured.
      setPosition(null)
      return
    }
    if (typeof window === 'undefined') return
    const anchor = anchorRef.current
    if (!anchor) return

    let rafId: number | null = null

    const compute = (): void => {
      const rect = anchor.getBoundingClientRect()
      const vw =
        window.innerWidth ||
        (typeof document !== 'undefined'
          ? document.documentElement.clientWidth
          : 1024)
      setPosition(
        computeAnchoredPopoverPosition({
          anchorRect: rect,
          viewportWidth: vw,
          widthPx,
          gapPx,
          viewportPaddingPx,
          align,
        }),
      )
    }

    const scheduleCompute = (): void => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        compute()
      })
    }

    // First measurement runs synchronously inside the layout effect
    // so the popover paints at the right place on the first frame
    // it becomes visible.
    compute()

    window.addEventListener('scroll', scheduleCompute, true)
    window.addEventListener('resize', scheduleCompute)
    return (): void => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      window.removeEventListener('scroll', scheduleCompute, true)
      window.removeEventListener('resize', scheduleCompute)
    }
  }, [anchorRef, open, widthPx, gapPx, viewportPaddingPx, align])

  // ─── Esc keydown ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !closeOnEscape) return
    if (typeof document === 'undefined') return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return (): void => {
      document.removeEventListener('keydown', handler)
    }
  }, [open, closeOnEscape, onClose])

  // ─── Outside mousedown ──────────────────────────────────────────
  // We bind on `mousedown` rather than `click` so the close fires
  // BEFORE the anchor button's `onClick` would otherwise re-toggle
  // the popover open on an anchor re-press. Targets inside the
  // anchor or the popover are never "outside".
  useEffect(() => {
    if (!open || !closeOnOutsidePointerDown) return
    if (typeof document === 'undefined') return
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current && popoverRef.current.contains(target)) return
      if (anchorRef.current && anchorRef.current.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return (): void => {
      document.removeEventListener('mousedown', handler)
    }
  }, [open, closeOnOutsidePointerDown, anchorRef, onClose])

  // ─── Render ─────────────────────────────────────────────────────
  if (typeof document === 'undefined') return null
  if (!open) return null
  if (!position) {
    // Layout effect hasn't measured yet. Render nothing rather than
    // flashing at (0,0). The effect runs synchronously before paint
    // so this branch is effectively unreachable in the browser, but
    // keeps SSR / tests safe.
    return null
  }

  // The CSS custom property `--anchored-popover-width` is the
  // single source of truth for popover width. Callers' CSS reads
  // it via `width: var(--anchored-popover-width, …)`; the fallback
  // in their CSS only matters if a future caller forgets to wire
  // the width prop.
  const style = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    '--anchored-popover-width': `${widthPx}px`,
  } as CSSProperties

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      className={className}
      role={role}
      aria-label={ariaLabel}
      style={style}
      {...(dataAttributes ?? {})}
    >
      {children}
    </div>,
    document.body,
  )
}
