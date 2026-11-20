/**
 * Fluid hover — one shared highlight per list that sits on the item nearest
 * the cursor instead of blinking off at every gap.
 *
 * Own implementation of the Fluid Functionalism "Fluid Hover" idea
 * (https://www.fluidfunctionalism.com/docs/fluid-hover), written for this
 * app's plain-CSS stack: no Tailwind, no framer-motion, no extra DOM. The
 * highlight is the container's `::before`, driven by four CSS custom
 * properties (`--fh-x/--fh-y/--fh-w/--fh-h`) and `--fh-o` for opacity.
 *
 * The highlight never travels (Owner 2026-11-20, DESIGN.md §5 Motion): on each
 * item it appears in place, and only its opacity animates — in when the
 * pointer enters the list, out when it leaves. Between items it moves at once,
 * like an ordinary hover. The pointer already shows where the hand is; a block
 * sliding after it was a second moving thing saying the same, and on fast
 * moves it swept across the rows in between.
 *
 * Algorithm (the whole of it): measure item boxes once per pointer entry
 * (and on resize), then on every move light the item with the smallest
 * distance along the list axis. Inside an item the distance is 0; between
 * items the nearer edge wins — no dead zones, no flicker.
 *
 * The hook never moves focus and never changes roles; `:focus-visible`
 * styling stays with the items.
 */

import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type MouseEventHandler, type RefObject } from 'react'

export type FluidHoverAxis = 'x' | 'y' | 'xy'

export type FluidHoverOptions = {
  /** Which way the list runs: `y` for rows, `x` for strips, `xy` for grids. */
  axis?: FluidHoverAxis
  /** Selector for the elements the highlight can land on, resolved inside the container. */
  itemSelector: string
  /** Skips an item: never lit, never gap-clicked. Runs on measure only. */
  isItemDisabled?: (element: HTMLElement) => boolean
  /**
   * The element whose box decides "nearest" for an item, when it is larger
   * than the box the highlight paints on — e.g. an expandable row whose
   * open body belongs to its head. Defaults to the item itself.
   */
  hitArea?: (item: HTMLElement) => HTMLElement
  /**
   * A click in the gap between items goes to the lit item. Default allows
   * it only within 6px (hairline dividers); `false` turns it off, a number
   * sets the distance.
   */
  gapClick?: boolean | number
  /**
   * Over a gap between neighbouring items wider than this many px nothing is
   * lit — something else sits there (an avatar and a name in the topbar), so
   * the highlight fades out instead of staying on the nearer item. Only for
   * `x` and `y` lists; off when left out.
   */
  gapMax?: number
}

export type FluidHoverHandlers = {
  onMouseEnter: MouseEventHandler<HTMLElement>
  onMouseMove: MouseEventHandler<HTMLElement>
  onMouseLeave: MouseEventHandler<HTMLElement>
  onClick: MouseEventHandler<HTMLElement>
}

export type FluidHover<C extends HTMLElement> = {
  containerRef: RefObject<C | null>
  handlers: FluidHoverHandlers
  /** Measure again; call after a popup opens or rows reorder while hovered. */
  remeasure: () => void
}

type Rect = { left: number; top: number; width: number; height: number }

const ACTIVE_ATTR = 'data-fluid-hover-active'
const DEFAULT_GAP_CLICK_PX = 6

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
}

function axisDistance(rect: Rect, x: number, y: number, axis: FluidHoverAxis): number {
  const dx = x < rect.left ? rect.left - x : x > rect.left + rect.width ? x - (rect.left + rect.width) : 0
  const dy = y < rect.top ? rect.top - y : y > rect.top + rect.height ? y - (rect.top + rect.height) : 0
  if (axis === 'y') return dy
  if (axis === 'x') return dx
  return Math.hypot(dx, dy)
}

/** Empty space between item `index` and the next one along the axis (negative when they overlap or wrap). */
function gapAfter(rects: Rect[], index: number, axis: 'x' | 'y'): number {
  const a = rects[index]
  const b = rects[index + 1]
  if (!a || !b) return 0
  return axis === 'x' ? b.left - (a.left + a.width) : b.top - (a.top + a.height)
}

export function useFluidHover<C extends HTMLElement>(options: FluidHoverOptions): FluidHover<C> {
  const { axis = 'y', itemSelector, isItemDisabled, hitArea, gapClick = true, gapMax } = options
  const containerRef = useRef<C>(null)
  const itemsRef = useRef<HTMLElement[]>([])
  const rectsRef = useRef<Rect[]>([])
  const hitRectsRef = useRef<Rect[]>([])
  const activeRef = useRef<number | null>(null)
  const insideRef = useRef(false)
  const shownRef = useRef(false)
  const gapClickPx = gapClick === false ? 0 : gapClick === true ? DEFAULT_GAP_CLICK_PX : gapClick
  const gapAxis = axis === 'xy' || gapMax === undefined ? null : axis

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const origin = container.getBoundingClientRect()
    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector))
      .filter((element) => !(isItemDisabled?.(element) ?? false))
    const toRect = (element: HTMLElement): Rect => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left - origin.left + container.scrollLeft,
        top: box.top - origin.top + container.scrollTop,
        width: box.width,
        height: box.height,
      }
    }
    itemsRef.current = items
    rectsRef.current = items.map(toRect)
    hitRectsRef.current = hitArea ? items.map((element) => toRect(hitArea(element))) : rectsRef.current
  }, [itemSelector, isItemDisabled, hitArea])

  /**
   * Marks `index` active and shows the highlight on it. With `visible: false`
   * the item stays active but the highlight fades out where it is — used when
   * the pointer is inside an item's extra hit area (an expanded body) rather
   * than on the box the highlight paints.
   */
  const paint = useCallback((index: number | null, visible = true) => {
    const container = containerRef.current
    if (!container) return
    const previous = activeRef.current
    if (previous !== null && previous !== index) itemsRef.current[previous]?.removeAttribute(ACTIVE_ATTR)
    activeRef.current = index
    if (index !== null) itemsRef.current[index]?.setAttribute(ACTIVE_ATTR, '')
    const rect = index === null ? undefined : rectsRef.current[index]
    if (!rect || !visible) {
      container.style.setProperty('--fh-o', '0')
      shownRef.current = false
      return
    }
    container.style.setProperty('--fh-x', `${rect.left}px`)
    container.style.setProperty('--fh-y', `${rect.top}px`)
    container.style.setProperty('--fh-w', `${rect.width}px`)
    container.style.setProperty('--fh-h', `${rect.height}px`)
    container.style.setProperty('--fh-o', '1')
    shownRef.current = true
  }, [])

  const toLocal = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const container = containerRef.current
    if (!container) return null
    const origin = container.getBoundingClientRect()
    return [clientX - origin.left + container.scrollLeft, clientY - origin.top + container.scrollTop]
  }, [])

  /** Pointer is in the item's hit area but off the box the highlight paints. */
  const inExtraArea = useCallback((index: number, x: number, y: number): boolean => {
    if (!hitArea) return false
    const rect = rectsRef.current[index]
    const hit = hitRectsRef.current[index]
    if (!rect || !hit) return false
    return contains(hit, x, y) && !contains(rect, x, y)
  }, [hitArea])

  const pick = useCallback((x: number, y: number): number | null => {
    const rects = hitRectsRef.current
    if (rects.length === 0) return null
    let best: number | null = null
    let bestDistance = Infinity
    rects.forEach((rect, index) => {
      const distance = axisDistance(rect, x, y, axis)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    // Inside a wide gap (between two items, not past either end) nothing is lit.
    if (best !== null && bestDistance > 0 && gapAxis !== null && gapMax !== undefined) {
      const along = gapAxis === 'x' ? x : y
      const start = (rect: Rect) => (gapAxis === 'x' ? rect.left : rect.top)
      for (let index = 0; index < rects.length - 1; index += 1) {
        const end = start(rects[index]) + (gapAxis === 'x' ? rects[index].width : rects[index].height)
        if (along > end && along < start(rects[index + 1]) && gapAfter(rects, index, gapAxis) > gapMax) return null
      }
    }
    return best
  }, [axis, gapAxis, gapMax])

  const remeasure = useCallback(() => {
    measure()
    if (insideRef.current && activeRef.current !== null) paint(activeRef.current, shownRef.current)
  }, [measure, paint])

  /**
   * A hidden highlight keeps its last box while it fades out in place, but a
   * transparent box still counts as scrollable overflow — after a viewport
   * shrink it can poke past the now-narrower container and widen the page.
   * So once the fade has ended (or the container resizes while the pointer is
   * away) the box collapses to nothing.
   */
  const collapse = useCallback(() => {
    const container = containerRef.current
    if (!container || shownRef.current) return
    container.style.setProperty('--fh-x', '0px')
    container.style.setProperty('--fh-y', '0px')
    container.style.setProperty('--fh-w', '0px')
    container.style.setProperty('--fh-h', '0px')
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === container && event.pseudoElement === '::before' && event.propertyName === 'opacity') collapse()
    }
    container.addEventListener('transitionend', onTransitionEnd)
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        if (insideRef.current) remeasure()
        else collapse()
      })
    observer?.observe(container)
    return () => {
      container.removeEventListener('transitionend', onTransitionEnd)
      observer?.disconnect()
    }
  }, [remeasure, collapse])

  useEffect(() => () => {
    const active = activeRef.current
    if (active !== null) itemsRef.current[active]?.removeAttribute(ACTIVE_ATTR)
  }, [])

  // React bubbles synthetic mouse events out of portals (a row's popover menu)
  // into this container; those pointers are over the menu, not the list.
  const isOwnEvent = useCallback((event: MouseEvent<HTMLElement>): boolean => {
    const container = containerRef.current
    return !!container && container.contains(event.target as Node)
  }, [])

  const handlers = useMemo<FluidHoverHandlers>(() => ({
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      if (!isOwnEvent(event)) return
      insideRef.current = true
      measure()
      const local = toLocal(event.clientX, event.clientY)
      if (!local) return
      const next = pick(...local)
      paint(next, next !== null && !inExtraArea(next, ...local))
    },
    onMouseMove: (event: MouseEvent<HTMLElement>) => {
      if (!insideRef.current || !isOwnEvent(event)) return
      const local = toLocal(event.clientX, event.clientY)
      if (!local) return
      const next = pick(...local)
      const visible = next !== null && !inExtraArea(next, ...local)
      if (next !== activeRef.current || visible !== shownRef.current) paint(next, visible)
    },
    onMouseLeave: () => {
      insideRef.current = false
      paint(null)
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (gapClickPx <= 0 || !isOwnEvent(event)) return
      const target = event.target as HTMLElement | null
      const active = activeRef.current
      if (active === null || !target || target.closest(itemSelector)) return
      const item = itemsRef.current[active]
      const rect = hitRectsRef.current[active]
      const local = toLocal(event.clientX, event.clientY)
      if (!item || !rect || !local) return
      // A click inside the item's own hit area (e.g. an expanded body) is the
      // body's business, not a gap click on the item.
      if (hitArea && hitArea(item).contains(target)) return
      if (axisDistance(rect, ...local, axis) <= gapClickPx) item.click()
    },
  }), [measure, paint, pick, toLocal, inExtraArea, isOwnEvent, axis, itemSelector, hitArea, gapClickPx])

  return { containerRef, handlers, remeasure }
}
