/**
 * 按钮构件（构件厂第一批，2026-11-13，提案 · 单一来源）。
 *
 * 选项从清点推出来（design/components-2026-11-13/inventory.md 第三节「变体 × 选项」）：
 * - size：实拍高度 28 / 32 / 36 各占 45% / 21% / 24%，三档都过 10% 的门槛。
 * - tone：底色 / 字色维度过门槛的是三种透明底：淡墨 116 处、次要灰 95 处、墨 72 处，
 *   分别做 quiet / subtle / strong（顶栏导航用淡墨是 Owner 2026-11-08 选的）。另加规范里
 *   点名的雾薄荷主键 primary（DESIGN.md §2 Accent，每页一处）、石板墨填充 solid
 *   （§2 Ink-Action Rule，短标签）和危险字 danger。
 * - 图标：带图标 + 字（71%）、只有字（23%）、只有图标（6%）。只有图标时必须给 label，
 *   读屏才念得出名字（清点里 axe 报过名字对不上的按钮）。
 * 圆角一律 8px（DESIGN.md §5 按高度选档：28–44px 的控件用 8，不做胶囊按钮）。
 *
 * ButtonLink（构件厂第 4 步换详情页时加）：长得和 Button 一样、但点了是去别的地址的 <a>。
 * 详情页「阅读解析」原来就是链接（能中键开新标签、能复制地址），换成 <button> 会丢这些，所以单出一个。
 * 链接没有 disabled 和 busy，这两项不提供。
 *
 * suggest「建议」（2026-11-15 加，Owner 当天定；设计记录 design/components-2026-11-13/migrate-followup/README.md 第一节）：
 * 对卷面的一条建议，点了就采纳（草稿卷 A4 题组上方、A3 两面接缝上的「建议前置分页」）。不是主键，不抢墨：
 * 垫页面底色、次要灰字带下划线、字小一档（12），字重常规；悬停和别的透明底键一样垫桌色、字提到墨色。
 * 「已采纳」没有这个键的样子：采纳以后键自己消失，结果是纸上的分页线（DESIGN.md §5「提议和决定」）。
 */

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import './button.css'

export type ButtonTone = 'quiet' | 'subtle' | 'strong' | 'primary' | 'solid' | 'danger' | 'suggest'
export type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  /** quiet 淡墨（默认，导航和次级动作）；subtle 次要灰（一页有很多、行上的小动作）；
   *  strong 墨字（透明底里最重的一档）；primary 雾薄荷主键（每页一处）；
   *  solid 石板墨填充（短标签）；danger 危险字；suggest 对卷面的一条建议（点了就采纳）。 */
  tone?: ButtonTone
  /** sm 高 28；md 高 32（默认）；lg 高 36。 */
  size?: ButtonSize
  /** 放在字前面的图标，用 app/src/icons 里的图标。 */
  icon?: ReactNode
  /** 正在做：按钮保持原样大小，点了不再触发，读屏念「忙」。 */
  busy?: boolean
  ref?: Ref<HTMLButtonElement>
}

type ButtonWithText = ButtonBaseProps & { children: ReactNode; label?: undefined }
/** 只有图标：label 必填，作为读屏名字。 */
type ButtonIconOnly = ButtonBaseProps & { icon: ReactNode; label: string; children?: undefined }

export type ButtonProps = ButtonWithText | ButtonIconOnly

export function Button({
  tone = 'quiet',
  size = 'md',
  icon,
  busy = false,
  label,
  children,
  type = 'button',
  className,
  onClick,
  ref,
  ...rest
}: ButtonProps) {
  const iconOnly = children === undefined || children === null
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `eqb-button ${className}` : 'eqb-button'}
      data-tone={tone}
      data-size={size}
      data-icon-only={iconOnly ? '' : undefined}
      aria-label={iconOnly ? label : undefined}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {icon}
      {iconOnly ? null : <span className="eqb-button-label">{children}</span>}
    </button>
  )
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  href: string
  tone?: ButtonTone
  size?: ButtonSize
  icon?: ReactNode
  children: ReactNode
  ref?: Ref<HTMLAnchorElement>
}

export function ButtonLink({ tone = 'quiet', size = 'md', icon, children, className, ref, ...rest }: ButtonLinkProps) {
  return (
    <a
      ref={ref}
      className={className ? `eqb-button ${className}` : 'eqb-button'}
      data-tone={tone}
      data-size={size}
      {...rest}
    >
      {icon}
      <span className="eqb-button-label">{children}</span>
    </a>
  )
}
