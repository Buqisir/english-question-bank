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
      // 等两帧再切到显示：第一帧让刚挂上的元素按「隐藏」样子（data-visible="false"）算一次样式、画出来，
      // 第二帧再切，过渡才有起点。只等一帧时，挂上和切换常落在同一次绘制前，浏览器第一次算样式就是「显示」，
      // 入场不播（2026-11-20 逐帧量到：草稿卷「⋯」面板第一帧就是不透明度 1）。
      let second = 0
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(first)
        cancelAnimationFrame(second)
      }
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
