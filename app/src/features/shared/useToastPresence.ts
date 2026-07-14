import { useEffect, useRef, useState } from 'react'

/**
 * Exit-transition helper for toast-style conditionally-rendered elements.
 * React unmounts a node the instant its guard condition goes falsy, which
 * kills any CSS transition mid-flight — this keeps the node mounted for
 * `exitMs` after `value` becomes `null` so a `data-visible="false"` exit
 * transition can play, then really unmounts it.
 *
 * Re-triggering with a new value while a previous one is still exiting
 * swaps straight back to visible — the in-flight transition retargets
 * instead of hard-resetting, so back-to-back toasts (e.g. deleting two
 * items quickly) redirect smoothly (Sonner's continuity principle) rather
 * than replaying the enter animation from a jarring reset.
 */
export function useToastPresence<T>(
  value: T | null,
  exitMs: number,
): { rendered: T | null; visible: boolean } {
  const [rendered, setRendered] = useState<T | null>(value)
  const [visible, setVisible] = useState(false)
  const exitTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (value !== null) {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      setRendered(value)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    exitTimerRef.current = window.setTimeout(() => {
      setRendered(null)
      exitTimerRef.current = null
    }, exitMs)
    return undefined
  }, [value, exitMs])

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current)
    },
    [],
  )

  return { rendered, visible }
}

/**
 * Same delayed-unmount trick as `useToastPresence`, for a plain open/close
 * boolean (modals, dropdown menus) instead of a value — used where the exit
 * transition itself needs to play (e.g. `draft-save-space-dialog` /
 * `my-space-confirm-dialog`'s backdrop fade + dialog scale-out), not just
 * the fire-once entrance keyframe the plain dropdown menus use.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; visible: boolean } {
  const { rendered, visible } = useToastPresence(open ? true : null, exitMs)
  return { mounted: rendered === true, visible }
}
