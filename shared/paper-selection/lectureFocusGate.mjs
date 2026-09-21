const DEFAULT_DOUBLE_CLICK_WAIT_MS = 500
const DEFAULT_DRAG_THRESHOLD_PX = 4

export function createLectureFocusGate({
  now = () => Date.now(),
  doubleClickWaitMs = DEFAULT_DOUBLE_CLICK_WAIT_MS,
  dragThresholdPx = DEFAULT_DRAG_THRESHOLD_PX,
  isNonCollapsedSelection = () => false,
} = {}) {
  let pointer = null
  let pending = null
  let suppressUntil = 0
  const waitMs = Number.isFinite(doubleClickWaitMs) && doubleClickWaitMs >= 0
    ? doubleClickWaitMs
    : DEFAULT_DOUBLE_CLICK_WAIT_MS

  function cancelPending() {
    if (!pending) return
    if (typeof pending.cancel === 'function') pending.cancel()
    pending = null
  }

  function suppress(ms = waitMs) {
    cancelPending()
    suppressUntil = Math.max(suppressUntil, now() + ms)
  }

  return {
    doubleClickWaitMs: waitMs,
    pointerDown(event) {
      if (event?.button != null && event.button !== 0) return
      const at = now()
      const isSecond = Boolean(
        pointer
        && at - pointer.downAt <= waitMs
        && Math.abs((event?.clientX ?? 0) - pointer.x) <= dragThresholdPx * 2
        && Math.abs((event?.clientY ?? 0) - pointer.y) <= dragThresholdPx * 2,
      )
      pointer = {
        x: event?.clientX ?? 0,
        y: event?.clientY ?? 0,
        downAt: at,
        dragging: false,
        isSecond,
        pointerType: event?.pointerType || 'mouse',
      }
      if (isSecond) suppress(waitMs)
    },
    pointerMove(event) {
      if (!pointer) return
      if (event?.buttons === 0) return
      const dx = (event?.clientX ?? pointer.x) - pointer.x
      const dy = (event?.clientY ?? pointer.y) - pointer.y
      if ((dx * dx) + (dy * dy) >= dragThresholdPx * dragThresholdPx) {
        pointer.dragging = true
        suppress(50)
      }
    },
    pointerUp() {},
    selectionChanged() {
      if (isNonCollapsedSelection()) suppress(50)
    },
    cancelPending,
    /**
     * @returns {{ action: 'apply' } | { action: 'suppress' } | { action: 'defer', waitMs: number }}
     */
    arbitrateLectureFocus({ source = 'pointer' } = {}) {
      if (source === 'keyboard') {
        cancelPending()
        return { action: 'apply' }
      }
      const at = now()
      if (at < suppressUntil) return { action: 'suppress' }
      if (pointer?.dragging || pointer?.isSecond) return { action: 'suppress' }
      if (isNonCollapsedSelection()) {
        suppress(50)
        return { action: 'suppress' }
      }
      if (!pointer || at - pointer.downAt > waitMs + 50) {
        return { action: 'apply' }
      }
      return { action: 'defer', waitMs }
    },
    scheduleDeferred(apply, schedule = (fn, ms) => setTimeout(fn, ms), unschedule = (id) => clearTimeout(id)) {
      cancelPending()
      const id = schedule(() => {
        pending = null
        if (now() < suppressUntil) return
        if (isNonCollapsedSelection()) return
        apply()
      }, waitMs)
      pending = {
        cancel() {
          unschedule(id)
        },
      }
    },
  }
}
