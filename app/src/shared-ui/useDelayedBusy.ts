/**
 * 等待的门槛（DESIGN.md §5「Waiting 等待」）：等不到 300ms 什么都不出；出了就至少留 500ms，不闪。
 * 按钮、所以点、灰块都走这一个门槛。
 *
 * useDelayedBusy(pending) 返回现在该是哪一段：
 * - 'idle'      没在等，或者等了还不到 300ms：什么都不出。
 * - 'waiting'   在等：出所以点 / 灰块。
 * - 'settling'  事情做完了（且已经出了至少 500ms）：所以点浮回 ∴（--motion-base，160ms）。
 * - 'leaving'   所以点隐去、原来的字或图标回来（--motion-fast，120ms）。
 * 'settling'、'leaving' 里又开始等，直接回到 'waiting'。
 *
 * 只关心「出不出」的地方（灰块）用 phase !== 'idle'；所以点用 <WaitDots active={phase === 'waiting'} />。
 * 读屏的「忙」不走门槛：键上的 aria-busy、提示行的字由调用处立即给。
 */

import { useEffect, useRef, useState } from 'react'
import { readMotionMs } from './waitDotsMotion.ts'

export type WaitPhase = 'idle' | 'waiting' | 'settling' | 'leaving'

/** 等这么久还没好才出等待的样子（DESIGN §5「门槛」）。 */
export const WAIT_SHOW_DELAY_MS = 300
/** 出了就至少留这么久（DESIGN §5「门槛」）。 */
export const WAIT_MIN_VISIBLE_MS = 500

export function useDelayedBusy(pending: boolean): WaitPhase {
  const [phase, setPhase] = useState<WaitPhase>('idle')
  const shownAtRef = useRef(0)

  useEffect(() => {
    let delay: number
    let next: WaitPhase
    if (pending) {
      if (phase === 'waiting') return
      // idle：等过门槛再出；settling / leaving：马上回到 waiting（下一拍，免得在 effect 里同步改状态）。
      delay = phase === 'idle' ? WAIT_SHOW_DELAY_MS : 0
      next = 'waiting'
    } else if (phase === 'waiting') {
      delay = Math.max(0, WAIT_MIN_VISIBLE_MS - (performance.now() - shownAtRef.current))
      next = 'settling'
    } else if (phase === 'settling') {
      // 读不到 token 就不留收尾那一段
      delay = readMotionMs('--motion-base') ?? 0
      next = 'leaving'
    } else if (phase === 'leaving') {
      delay = readMotionMs('--motion-fast') ?? 0
      next = 'idle'
    } else {
      return
    }
    const timer = window.setTimeout(() => {
      if (next === 'waiting' && phase === 'idle') shownAtRef.current = performance.now()
      setPhase(next)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [pending, phase])

  return phase
}
