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

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useDelayedBusy, type WaitPhase } from './useDelayedBusy.ts'
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

export type SkeletonGateProps = {
  /** 正在等真东西。 */
  pending: boolean
  /** 读屏念的一句（「解析加载中」）：一挂上就在，不等门槛；看不见。旁边已经有一行看得见的字在说（「分析中」）时不给，
   *  区域只挂 aria-busy，不当 status 再念一遍。 */
  label?: string
  /** 照真东西的位置和大小画的灰块（用 Skeleton 拼）。 */
  skeleton: ReactNode
  /** 真东西。等完、灰块走了才渲染。 */
  children?: ReactNode
  className?: string
  /** 两段接着等（先等整页、再等这一块）时，由调用处给接成一段的门槛（等待第五轮，题组详情）：
   *  灰块不在两段之间断开、不重新数 300ms。不给就用 pending 自己的门槛。 */
  phase?: WaitPhase
}

/**
 * 整块在等（2026-11-15 第二轮，DESIGN.md §5「Waiting 等待」：整块内容还没来时，按真东西的位置和大小画灰块）。
 * 灰块走门槛：等不到 300ms 什么都不出（只有读屏那一句）；出了至少留 500ms，这期间真东西到了也先不换上，免得一闪。
 * 读屏：区域 role="status"、aria-busy，里面一句只给读屏看的字（.visually-hidden，index.css）。
 * 要让「至少留 500ms」生效，SkeletonGate 得在真东西到了以后还挂在同一个位置（把真东西作为 children 传进来）。
 * 真东西画在别处（词典卡、句子分析卡：词条、译文在灰块下面另画）时，调用处等完就卸掉 SkeletonGate，只要「300ms 内不出」，
 * 不留够 500ms（留着会和真东西同时在、卡片一跳）。
 */
export function SkeletonGate({ pending, label, skeleton, children, className, phase: sharedPhase }: SkeletonGateProps) {
  const ownPhase = useDelayedBusy(pending)
  const showSkeleton = (sharedPhase ?? ownPhase) === 'waiting'
  if (!pending && !showSkeleton) return <>{children}</>
  return (
    <div className={className ? `eqb-skeleton-region ${className}` : 'eqb-skeleton-region'} role={label ? 'status' : undefined} aria-busy="true">
      {label ? <span className="visually-hidden">{label}</span> : null}
      {showSkeleton ? skeleton : null}
    </div>
  )
}

// 一组卷面的灰块（阅读这类：一段文章 + 几道四选一）。尺寸照整卷页实量（2026-11-15，paper-2026-i 阅读 A）：
// 正文 14px、行高 24（.ps-canonical-reading），一行灰块高 12、行距 12；题干一行，四个选项两列两行，缩进和题号同宽。
// 各行宽度错开，看着像一段字的右缘。样子在 waiting.css「一组卷面的灰块」。
const PAPER_PASSAGE_LINE_WIDTHS = ['100%', '100%', '97%', '100%', '64%', '100%', '99%', '100%', '42%']
const PAPER_QUESTION_COUNT = 2
const PAPER_OPTION_WIDTHS = ['58%', '66%', '52%', '61%']

export function PaperGroupSkeleton({ className }: { className?: string }) {
  return (
    <div className={className ? `eqb-skeleton-paper-group ${className}` : 'eqb-skeleton-paper-group'} aria-hidden="true">
      <div className="eqb-skeleton-paper-passage">
        {PAPER_PASSAGE_LINE_WIDTHS.map((width, index) => <Skeleton key={index} width={width} height={12} />)}
      </div>
      {Array.from({ length: PAPER_QUESTION_COUNT }, (_, question) => (
        <div key={question} className="eqb-skeleton-paper-question">
          <Skeleton width={question % 2 === 0 ? '78%' : '70%'} height={12} />
          <div className="eqb-skeleton-paper-options">
            {PAPER_OPTION_WIDTHS.map((width, index) => <Skeleton key={index} width={width} height={12} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
