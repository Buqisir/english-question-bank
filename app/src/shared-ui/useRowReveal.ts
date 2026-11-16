/**
 * 真行依次淡入（DESIGN.md §5「Waiting 等待」：数据到了真行从上到下依次淡入，间隔 40ms，高度不变，页面不跳）。
 * 2026-11-15 第二轮接在首页找题结果（ConciergeDesk）；第四轮接到整卷页、个人空间、生词本、相似题 / 相似篇、
 * 换篇抽屉、令牌页、首页浏览列表，清点表见 design/components-2026-11-13/migrate-waiting-4/README.md。
 *
 * useRowReveal(containerRef, rowSelector, shown)：shown 由假变真（数据到了、真行挂上）的那一拍，
 * 把 containerRef 里匹配 rowSelector 的行从上到下排上淡入。只动透明度，不动位置和高度。
 * - 每行时长读 --motion-base（「显形、小入场」，160ms），曲线读 --ease-hover（只变透明度、不位移；--ease-out 前段太陡，100ms 已到 0.99，看不出淡入，协调人 2026-11-15 改）。DESIGN 写的是 200ms，
 *   全站没有 200ms 的 token，取最近的这一档（缺口登记在 docs/design-gaps.md）；读不到 token 就不演（不写字面兜底）。
 * - 间隔 40ms：DESIGN §5 给定、全站 token 里没有，写成下面的具名常量。
 * - 系统开了「减少动态效果」：不演，行直接在。
 * - 只在 shown 变真那一拍演一次；之后筛选、展开这类变化不再演。shown 变假或卸载时停掉没演完的。
 * - { once: true }：这个组件挂着期间只演第一次（「数据第一次到」）。换文件夹、翻页、重新读取会让 shown
 *   假→真再来一遍的地方用它，第二次起行直接在。
 */

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { readMotionEase, readMotionMs } from './waitDotsMotion.ts'

/** 相邻两行开始淡入的间隔（DESIGN §5「Waiting 等待」）。 */
export const ROW_REVEAL_STAGGER_MS = 40

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useRowReveal(
  containerRef: RefObject<HTMLElement | null>,
  rowSelector: string,
  shown: boolean,
  options?: { once?: boolean },
) {
  const once = options?.once === true
  const playedRef = useRef(false)
  useLayoutEffect(() => {
    if (!shown) return
    if (once && playedRef.current) return
    playedRef.current = true
    const container = containerRef.current
    if (!container || prefersReducedMotion()) return
    const duration = readMotionMs('--motion-base')
    const easing = readMotionEase('--ease-hover')
    if (duration === null || easing === null) return
    const rows = [...container.querySelectorAll<HTMLElement>(rowSelector)]
    if (rows.length === 0 || typeof rows[0].animate !== 'function') return
    const running = rows.map((row, index) => row.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      // backwards：排在后面的行等到轮到自己之前保持透明，不先闪一下。
      { duration, delay: index * ROW_REVEAL_STAGGER_MS, easing, fill: 'backwards' },
    ))
    return () => {
      for (const animation of running) animation.cancel()
    }
    // rowSelector、once 是调用处写死的；只在 shown 变化时演。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])
}
