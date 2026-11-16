/**
 * 胶囊构件（构件厂，2026-11-14，提案 · 单一来源）。
 *
 * 变体从清点推出来（design/components-2026-11-13/inventory.md「标签 / 小签」和第五节没拍到的写法位置），只做两种：
 * - Chip：状态标记，不可点。渲染成 <span>，不进 Tab 顺序，读屏只念字。
 *   页面里的实际用途：相似篇章卡片上的理由小签（「同话题：…」「真题」「含 N 题」）、详情页题型分布、讲评栏题型小签。
 *   质感照 BRAND.md §5.5「提议是轻的，决定是实的」：标记只是告诉老师一件事，要轻——桌色底、次要灰字、12px、
 *   无边无影；比旁边能点的东西都轻，不会被当成键。
 * - ChipToggle：筛选 / 切换，可点。渲染成 <button aria-pressed>，读屏念「切换按钮，已按下 / 未按下」。
 *   清单 chip-02（浏览页「全部 · 真题 · 模拟 · 年份 · 更早」和月份一排）。样子照 DESIGN.md §5 Chips：
 *   高 28、字 13、白底细边次要灰字；选中是实的——桌色底、墨字、字重 600、边透明（不用填充色，2026-11-07）。
 *
 * 不归这里的：
 * - 草稿丸（清单 chip-03 / chip-04「去草稿卷（带数量）」）点了是去草稿卷，是按钮，不是标记也不是开关，用 Button
 *   （理由见 design/components-2026-11-13/migrate-chip/README.md）。
 * - 顶栏头像（清单 chip-01）是一张图，不是胶囊。
 * - 真题徽章（DESIGN.md §5 Cards / Rows：圆角 4）是徽章，不是胶囊。
 *
 * - 已选筛选（找题台收起筛选面板后那一排「题型：阅读理解 ×」）点了是移除这个筛选，是动作，用 Button
 *   （第二轮，理由见 design/components-2026-11-13/migrate-chip-r2/README.md）。
 *
 * 圆角一律胶囊（--eqb-radius-pill，DESIGN.md §5 圆角细则「胶囊只给标签类」）。颜色、圆角只用 tokens.css 里的变量。
 *
 * 一行写完、放不下打省略号（第二轮，Owner 2026-11-14）。字包在 .eqb-chip-label 里，省略号由它画。
 * 被截断时全文怎么看：读屏念 DOM 里的全文，不受截断影响；看得见的人靠 title——指针移上去、键盘停上去时
 * 量一下字有没有被截，截了就把全文写进 title，没截就拿掉。调用方自己给了 title（比如话题小签的完整路径）就不碰。
 */

import type { ButtonHTMLAttributes, FocusEvent, HTMLAttributes, PointerEvent, ReactNode, Ref } from 'react'
import './chip.css'

/** 截断了就把全文放进 title，没截断就拿掉。调用方给了 title 时不调用。 */
function syncTruncatedTitle(element: HTMLElement) {
  const label = element.querySelector<HTMLElement>('.eqb-chip-label')
  if (!label) return
  if (label.scrollWidth > label.clientWidth) {
    element.title = (label.textContent ?? '').trim()
  } else {
    element.removeAttribute('title')
  }
}

type ChipProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children: ReactNode
  ref?: Ref<HTMLSpanElement>
}

/** 状态标记（不可点）。 */
export function Chip({ children, className, title, onPointerEnter, ref, ...rest }: ChipProps) {
  return (
    <span
      ref={ref}
      className={className ? `eqb-chip ${className}` : 'eqb-chip'}
      data-kind="mark"
      title={title}
      onPointerEnter={(event: PointerEvent<HTMLSpanElement>) => {
        if (title === undefined) syncTruncatedTitle(event.currentTarget)
        onPointerEnter?.(event)
      }}
      {...rest}
    >
      <span className="eqb-chip-label">{children}</span>
    </span>
  )
}

type ChipToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-pressed'> & {
  /** 选中没有。写进 aria-pressed，样子也只看它。 */
  pressed: boolean
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** 筛选 / 切换（可点，aria-pressed）。 */
export function ChipToggle({
  pressed,
  children,
  type = 'button',
  className,
  title,
  onPointerEnter,
  onFocus,
  ref,
  ...rest
}: ChipToggleProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `eqb-chip ${className}` : 'eqb-chip'}
      data-kind="toggle"
      aria-pressed={pressed}
      title={title}
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        if (title === undefined) syncTruncatedTitle(event.currentTarget)
        onPointerEnter?.(event)
      }}
      onFocus={(event: FocusEvent<HTMLButtonElement>) => {
        if (title === undefined) syncTruncatedTitle(event.currentTarget)
        onFocus?.(event)
      }}
      {...rest}
    >
      <span className="eqb-chip-label">{children}</span>
    </button>
  )
}
