/**
 * 灰块（DESIGN.md §5「Waiting 等待」：整块内容还没来时，按真东西的位置和大小画灰块）。
 *
 * - 桌色（--eqb-color-desk），圆角 4（--eqb-radius-badge）；占胶囊位置的用 shape="pill"。
 * - 宽高由调用处照真东西给（数字是 px，也可以给 '60%' 这类）。
 * - 所有灰块一起 1.8 秒一呼一吸（透明度 1 ↔ 0.6）：不管什么时候挂上来，都对齐到页面时间轴的同一个起点，同一时刻同一相位。
 * - 系统开了「减少动态效果」不动（waiting.css）。
 * - 对读屏隐藏。在等什么由旁边那一行字（或所在区域的 aria-busy）说。
 *
 * 门槛（300ms 以内不出、出了至少 500ms）由调用处用 useDelayedBusy 管。
 */

import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import './waiting.css'

export type SkeletonProps = {
  width?: number | string
  height: number | string
  /** block（默认）圆角 4；pill 占胶囊（筛选芯片）的位置。 */
  shape?: 'block' | 'pill'
  className?: string
}

export function Skeleton({ width, height, shape = 'block', className }: SkeletonProps) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof element.getAnimations !== 'function') return
    // 对齐到页面时间轴的 0 点：先挂的、后挂的灰块同一相位，一起呼吸。
    for (const animation of element.getAnimations()) animation.startTime = 0
  }, [])
  const style: CSSProperties = { width, height }
  return (
    <span
      ref={ref}
      className={className ? `eqb-skeleton ${className}` : 'eqb-skeleton'}
      data-shape={shape === 'pill' ? 'pill' : undefined}
      style={style}
      aria-hidden="true"
    />
  )
}
