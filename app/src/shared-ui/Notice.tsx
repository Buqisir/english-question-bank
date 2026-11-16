/**
 * 提示行：说明、等待、成功、出错四种，一个件（走查「路上的构件」第 1 名，Owner 2026-11-14；
 * 设计记录 design/ux-2026-11-14/find-compose-export/fix-notice/README.md）。
 *
 * 照 DESIGN.md §5「Notices 提示条」和「质感六条」的「安静」「现代」：
 * - 一行说完：16px 图标加一行次要灰字，没有底和边（放在桌上就是桌色）。字太长时截断，整句在 title 和读屏里。
 * - 出错和说明同一种写法；只有「没保存」「会丢东西」才上危险色（danger）。
 * - 出错写清哪里出错、东西还在不在（children，自己的话），后面照登服务器原话（detail），不另写兜底的话
 *   （No-Literal-Fallback）。能做什么放在行尾的一个键上（action，比如「重试」）。
 * - 等待那种不换掉旧内容：调用处把旧内容留着，只加这一行进度。
 *   等待那种前面不放图标，字后面跟所以点（DESIGN.md §5「Waiting 等待」：一行字在等，所以点跟在字后面；2026-11-15 起，
 *   原来是前面一个静止的 Loader 圈）。所以点也走 300ms 门槛；字本身照旧一挂上就在（读屏靠它）。字后面不再写「…」。
 * - 读屏：出错 role="alert"；其余 role="status"、aria-live="polite"。
 *
 * 放法（placement）：
 * - inline（默认）：放在页面给的固定位置里，左右边距由那一处给（不贴 x=0）。
 * - over：压在内容上面（比如重排时盖着旧卷面的那一行），垫桌色、e1，免得和底下的字混在一起。
 *
 * 原来还有第五种「撤销」和第三种放法 floating（临时浮在视口底部正中）：2026-11-15 收进共用构件 shared-ui/Toast
 * （底部提示 / 撤销：一次只显示一条、鼠标停着不消失、常驻播报区），这里删了。浮着的临时提示用 Toast。
 */

import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { AlertTriangle, CheckCircle, InfoCircle } from '../icons'
import { Button } from './Button.tsx'
import { InlineWaitDots } from './WaitDots.tsx'
import './notice.css'

export type NoticeKind = 'info' | 'waiting' | 'success' | 'error'
export type NoticePlacement = 'inline' | 'over'

export type NoticeAction = {
  label: string
  onClick: () => void
  /** 键上字前面的图标（16px）。 */
  icon?: ReactNode
  busy?: boolean
}

export type NoticeProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role' | 'title'> & {
  kind: NoticeKind
  /** 自己的话：一句说完。出错时写哪里出错、东西还在不在。 */
  children: string
  /** 服务器原话，照登，接在「：」后面。没有就不写。 */
  detail?: string | null
  /** 行尾一个文字键：出错的「重试」。 */
  action?: NoticeAction
  placement?: NoticePlacement
  /** 只给「没保存」「会丢东西」：字换危险色。 */
  danger?: boolean
  ref?: Ref<HTMLDivElement>
}

function NoticeIcon({ kind }: { kind: Exclude<NoticeKind, 'waiting'> }) {
  if (kind === 'error') return <AlertTriangle size={16} aria-hidden="true" />
  if (kind === 'info') return <InfoCircle size={16} aria-hidden="true" />
  return <CheckCircle size={16} aria-hidden="true" />
}

export function Notice({ kind, children, detail, action, placement = 'inline', danger = false, className, ref, ...rest }: NoticeProps) {
  const text = detail ? `${children}：${detail}` : children
  return (
    <div
      ref={ref}
      className={className ? `eqb-notice ${className}` : 'eqb-notice'}
      data-kind={kind}
      data-placement={placement}
      data-danger={danger ? '' : undefined}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? undefined : 'polite'}
      {...rest}
    >
      {kind === 'waiting' ? null : <NoticeIcon kind={kind} />}
      <span className="eqb-notice-text" title={text}>
        {children}
        {detail ? <span className="eqb-notice-detail">：{detail}</span> : null}
      </span>
      {kind === 'waiting' ? <InlineWaitDots pending /> : null}
      {action && (
        <Button tone="strong" size="sm" className="eqb-notice-action" icon={action.icon} busy={action.busy} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
