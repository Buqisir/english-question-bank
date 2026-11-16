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
 *
 * 300ms、500ms 读 tokens.css 的 --wait-show-delay、--wait-min-visible（等待第六轮，2026-11-15，原来是本文件里的两个常量，
 * 和启动壳 CSS 里的 300ms 同源）。读不到就不设门槛、不留最短时长（照 readMotionMs 那两段收尾的做法，不写字面兜底）。
 *
 * options.pendingSince：这段等待其实更早就开始了（performance.now() 的时刻），门槛和最短停留都从那时算。
 * 扫码听写用它接上启动壳（等待第六轮）：启动壳的灰块（CSS 门槛）在 pendingSince + 300ms 出，页面挂上时如果已经过了，
 * 第一拍就是 'waiting'（不会「灰块 → 空 → 灰块」）；数据来得再快也留满 500ms，从启动壳的灰块出来那一刻算。
 * 只管挂上以后的第一段等待；之后再等，照常从那一刻算。
 */

import { useEffect, useRef, useState } from 'react'
import { readMotionMs } from './waitDotsMotion.ts'

export type WaitPhase = 'idle' | 'waiting' | 'settling' | 'leaving'

/** 门槛：等这么久还没好才出等待的样子（DESIGN §5「门槛」）。读不到 token 返回 0（不设门槛）。 */
function waitShowDelayMs(): number {
  return readMotionMs('--wait-show-delay') ?? 0
}
/** 出了就至少留这么久（DESIGN §5「门槛」）。读不到 token 返回 0（不留）。 */
function waitMinVisibleMs(): number {
  return readMotionMs('--wait-min-visible') ?? 0
}

export function useDelayedBusy(pending: boolean, options?: { pendingSince?: number }): WaitPhase {
  // 挂上那一下：第一段等待从哪一刻算起、是不是已经过了门槛（接上更早开始的那段时）。
  const [initial] = useState(() => {
    const since = pending ? options?.pendingSince : undefined
    const showDelay = waitShowDelayMs()
    const shown = since !== undefined && performance.now() - since >= showDelay
    // 等待的样子是哪一刻出来的：接上更早开始的那段时，算它本该出来的那一刻（since + 门槛），不是挂上这一刻。
    return { since, phase: (shown ? 'waiting' : 'idle') as WaitPhase, shownAt: shown ? since + showDelay : 0 }
  })
  // 第一段等待的起点；第一段等完就作废。
  const sinceRef = useRef(initial.since)
  const [phase, setPhase] = useState<WaitPhase>(initial.phase)
  const shownAtRef = useRef(initial.shownAt)

  useEffect(() => {
    let delay: number
    let next: WaitPhase
    if (pending) {
      if (phase === 'waiting') return
      // idle：等过门槛再出（接上更早开始的那段时扣掉已经等了的）；settling / leaving：马上回到 waiting（下一拍，免得在 effect 里同步改状态）。
      const since = sinceRef.current
      delay = phase === 'idle' ? Math.max(0, waitShowDelayMs() - (since !== undefined ? performance.now() - since : 0)) : 0
      next = 'waiting'
    } else {
      sinceRef.current = undefined
      if (phase === 'waiting') {
        delay = Math.max(0, waitMinVisibleMs() - (performance.now() - shownAtRef.current))
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
    }
    const timer = window.setTimeout(() => {
      if (next === 'waiting' && phase === 'idle') {
        const since = sinceRef.current
        shownAtRef.current = since !== undefined ? since + waitShowDelayMs() : performance.now()
      }
      setPhase(next)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [pending, phase])

  return phase
}

/** 等这么久还没好，就在原地多说一句「比平时慢，可以先去做别的」（DESIGN §5「放在哪」：要等好几秒的事）。 */
export const WAIT_SLOW_HINT_MS = 10_000

/**
 * 等得太久：pending 连续超过 10 秒返回 true，不等了就回 false。
 * 2026-11-15 第二轮接在草稿卷「正在生成 PDF」那行；第四轮接到整卷页下载 PDF、首页 AI 找题、划词翻译、句子分析
 * （清点见 design/components-2026-11-13/migrate-waiting-4/README.md）。
 */
export function useSlowWait(pending: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setSlow(true), WAIT_SLOW_HINT_MS)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [pending])
  return pending && slow
}
