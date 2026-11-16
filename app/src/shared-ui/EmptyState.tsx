/**
 * 空状态：页面本来就空的时候，一张图、一句说明、可选的一个动作（构件厂，2026-11-14；
 * 设计记录 design/components-2026-11-13/migrate-empty/README.md）。
 *
 * 从清点来（design/components-2026-11-13/inventory.md「空状态 3 种 8 处」）：原来各页各写一份
 * 「插图 + 一句灰字 + 主键」，间距、字号、外框各不一样。这里收成一种写法，照 DESIGN.md §5「Empty states」：
 * 桌色底、不放白卡片（Owner 2026-11-13 选 B），图在上，一句话在中间，动作在最下面。
 *
 * 图只有两类：
 * - illustration：平涂插图，沿用 components/EmptyIllustration 的 kind（这一页图标的平涂版）。
 * - otter：獭獭。类型上只开放 'otter-sit' 和 'not-found' 两种，依据是 BRAND.md §7 第 118 条：
 *   工作页面里獭獭只出两处，个人空间空态用坐石全身像（otter-sit），AI 找题没找到用半身摊手（not-found，
 *   第 119 条）。别处要加獭獭先改那一条，不在这里加选项。
 *
 * 「没找到」是一张卡片：卡片边就是水面（BRAND.md 第 31 条），獭獭从卡片上沿露出水面以上那一截，
 * 图下面那条水面条藏在卡片边后面。只有这一种用卡片，所以不单开 surface 选项，由 otter 决定。
 *
 * 獭獭不动：第 118 条「出场一次只演一个动作、演完就停」，静态最稳；减少动态效果时也就什么都不动。
 * 图是装饰，读屏只读那句话和动作。
 */

import type { HTMLAttributes, Ref } from 'react'
import { EmptyIllustration, type EmptyIllustrationKind } from '../components/EmptyIllustration'
import { Button } from './Button.tsx'
import './emptyState.css'

/** 獭獭只有这两种（BRAND.md §7 第 118 条）。 */
export type EmptyStateOtter = 'otter-sit' | 'not-found'

/* 图放在 app/public/brand/，和顶栏标志、默认头像同一个办法：从 design/brand-2026-10-13/mascot/ 原样复制
 * （逐字节一样），页面用 <img> 按地址引。otter-sit.svg ← mascot/otter-sit.svg；
 * otter-not-found.svg ← mascot/states/half-not-found.svg。母版改了要重新复制。 */
const OTTER_SRC: Record<EmptyStateOtter, string> = {
  'otter-sit': '/brand/otter-sit.svg',
  'not-found': '/brand/otter-not-found.svg',
}

/** 二选一：平涂插图，或者獭獭。 */
export type EmptyStateArt =
  | { illustration: EmptyIllustrationKind; otter?: undefined }
  | { otter: EmptyStateOtter; illustration?: undefined }

export type EmptyStateAction = {
  label: string
  onClick: () => void
  /** primary 雾薄荷主键（默认，空态里「现在最该点的那一下」）；strong 墨字透明底，
   *  给原来就是一条墨色文字链接的出路（「没找到」的「返回浏览全部 N 套卷」）。 */
  tone?: 'primary' | 'strong'
}

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> &
  EmptyStateArt & {
    /** 一句说明，照 DESIGN.md §9「空态指向第一动作，宁缺勿假」。 */
    children: string
    /** 可选的一个动作，用 Button 大号（36）。 */
    action?: EmptyStateAction
    ref?: Ref<HTMLDivElement>
  }

export function EmptyState({ illustration, otter, children, action, className, ref, ...rest }: EmptyStateProps) {
  const art = otter ?? 'illustration'
  return (
    <div
      ref={ref}
      className={className ? `eqb-empty-state ${className}` : 'eqb-empty-state'}
      data-art={art}
      {...rest}
    >
      <span className="eqb-empty-state-art" aria-hidden="true">
        {otter ? (
          <img className="eqb-empty-state-otter" src={OTTER_SRC[otter]} alt="" draggable={false} />
        ) : illustration ? (
          <EmptyIllustration kind={illustration} />
        ) : null}
      </span>
      <p className="eqb-empty-state-text">{children}</p>
      {action && (
        <Button tone={action.tone ?? 'primary'} size="lg" className="eqb-empty-state-action" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
