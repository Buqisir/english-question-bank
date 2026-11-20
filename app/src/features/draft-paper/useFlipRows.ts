import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * 草稿卷左栏目录的行在老师上移 / 下移、拖动、删、撤销删、采用重排建议时「走过去」，不在一帧里换位（Owner 2026-11-20）。
 *
 * 做法是 FLIP：改之前 `arm()` 记下每一行在屏上的位置；React 把新顺序画进 DOM 以后（`trigger` 变了那一次的 layout effect），
 * 每行先用 transform 挪回原处，再在动效角色「移动」（--motion-travel）里回到 0。新出来的行（撤销删）只淡入（「出现」）；
 * 删掉的行直接没了，下面的行照 FLIP 往上走。过渡和动画写在 CSS（`[data-flip='move' | 'enter']`），这里只放 transform 和标记。
 *
 * 只有老师自己动了才演：调用处在改顺序的那一下前面 `arm()`。首次读、重新读、服务器回来同样的顺序都不 arm，不演。
 * arm 了却没等到改动（比如服务器回来的顺序没变），1 秒后这次记录作废，免得后面一次重新读被当成老师的动作演出来。
 *
 * `followerSelector`：跟着某一行走的另一块（左栏当前格的白底板）。它自己用 transform 定位，所以 FLIP 走独立的 `translate` 属性，
 * 不和它的 transform 打架；它在这一拍还没量到新位置（左栏自己的 layout effect 刚排了重画），挪多少直接照它跟的那一行算。
 */
export type FlipRowsOptions = {
  /** 容器里要动的行。 */
  itemSelector: string
  /** 行上认人的属性（不随顺序变，比如条目 id）。 */
  keyAttribute: string
  /** 跟着走的那一块（在容器的父元素里找）和它跟的那一行（在容器里，用 matches 认）。 */
  followerSelector?: string
  leaderSelector?: string
}

type Snapshot = { tops: Map<string, number>; at: number }

// arm 以后等改动最多等这么久；删、撤销删要等服务器回话，arm 写在回话到了、改状态的那一下前面，不会等这么久。
const ARM_TTL_MS = 1000

/** 读一条动效角色（「时长 曲线」）里的时长；读不到返回 null，不写数字兜底。 */
function readRoleMs(name: string): number | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const match = /^([\d.]+)(ms|s)\b/.exec(raw)
  if (!match) return null
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

export function useFlipRows<C extends HTMLElement>(
  trigger: unknown,
  options: FlipRowsOptions,
): { containerRef: RefObject<C | null>; arm: () => void } {
  const { itemSelector, keyAttribute, followerSelector, leaderSelector } = options
  const containerRef = useRef<C>(null)
  const snapshotRef = useRef<Snapshot | null>(null)
  const cleanupTimerRef = useRef<number | null>(null)

  const rows = useCallback((container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(itemSelector)), [itemSelector])
  const followerOf = useCallback(
    (container: HTMLElement) => (followerSelector ? container.parentElement?.querySelector<HTMLElement>(followerSelector) ?? null : null),
    [followerSelector],
  )

  /** 收掉上一次还没走完的：去标记、去挪动，回到排好的位置。 */
  const settle = useCallback((container: HTMLElement) => {
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current)
      cleanupTimerRef.current = null
    }
    for (const row of rows(container)) {
      if (row.dataset.flip === 'move') delete row.dataset.flip
      row.style.transform = ''
    }
    const tail = followerOf(container)
    if (tail) {
      if (tail.dataset.flip === 'move') delete tail.dataset.flip
      tail.style.translate = ''
    }
  }, [rows, followerOf])

  const arm = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    // 量的是屏上看得见的位置（含正在走的 transform）：上一次还没走完就又动了，从它现在在的地方接着走。
    const tops = new Map<string, number>()
    for (const row of rows(container)) {
      const key = row.getAttribute(keyAttribute)
      if (key !== null) tops.set(key, row.getBoundingClientRect().top)
    }
    snapshotRef.current = { tops, at: performance.now() }
  }, [rows, keyAttribute])

  useLayoutEffect(() => {
    const snapshot = snapshotRef.current
    const container = containerRef.current
    if (!snapshot || !container) return
    if (performance.now() - snapshot.at > ARM_TTL_MS) {
      snapshotRef.current = null
      return
    }
    snapshotRef.current = null
    settle(container)

    const moved: HTMLElement[] = []
    let leaderShift = 0
    for (const row of rows(container)) {
      const key = row.getAttribute(keyAttribute)
      const before = key === null ? undefined : snapshot.tops.get(key)
      if (before === undefined) {
        // 新出来的行（撤销删）：只淡入。
        row.dataset.flip = 'enter'
        const onEnd = (event: AnimationEvent) => {
          if (event.target !== row) return
          row.removeEventListener('animationend', onEnd)
          if (row.dataset.flip === 'enter') delete row.dataset.flip
        }
        row.addEventListener('animationend', onEnd)
        continue
      }
      const shift = before - row.getBoundingClientRect().top
      if (Math.abs(shift) < 0.5) continue
      row.style.transform = `translateY(${shift}px)`
      moved.push(row)
      if (leaderSelector && row.matches(leaderSelector)) leaderShift = shift
    }
    const tail = leaderShift !== 0 ? followerOf(container) : null
    if (tail) tail.style.translate = `0 ${leaderShift}px`
    if (moved.length === 0 && !tail) return

    // 先让浏览器按「挪回原处、没有过渡」算一次样式，再挂上过渡、去掉挪动，过渡才有起点。
    void container.getBoundingClientRect()
    const listeners = new Map<HTMLElement, (event: TransitionEvent) => void>()
    const start = (element: HTMLElement, property: 'transform' | 'translate') => {
      const onEnd = (event: TransitionEvent) => {
        if (event.target !== element || event.propertyName !== property) return
        element.removeEventListener('transitionend', onEnd)
        if (element.dataset.flip === 'move') delete element.dataset.flip
      }
      listeners.set(element, onEnd)
      element.addEventListener('transitionend', onEnd)
      element.dataset.flip = 'move'
      element.style[property] = ''
    }
    for (const row of moved) start(row, 'transform')
    if (tail) start(tail, 'translate')
    // 兜底：过渡被打断（行在走的时候被卸掉、标签页切到后台）不发 transitionend，走完的时长过后照样收标记。
    const travelMs = readRoleMs('--motion-travel')
    if (travelMs !== null) {
      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null
        for (const [element, onEnd] of listeners) {
          element.removeEventListener('transitionend', onEnd)
          if (element.dataset.flip === 'move') delete element.dataset.flip
        }
      }, travelMs * 2)
    }
  }, [trigger, rows, keyAttribute, leaderSelector, followerOf, settle])

  useEffect(() => () => {
    if (cleanupTimerRef.current !== null) window.clearTimeout(cleanupTimerRef.current)
  }, [])

  return { containerRef, arm }
}
