/**
 * 行（构件厂，2026-11-15；设计记录 design/components-2026-11-13/migrate-row-toast/README.md）。
 *
 * 从清点来（design/components-2026-11-13/inventory.md「行」row-01，15 处）：清点按「干什么」分成两种——
 * 打开一项（整行可点）12 处、列表里的一项（不可点）3 处。照 DESIGN.md §5 Cards / Rows：
 * - 最小高 48（size="sm" 是 44，只给卷行展开后里面的题组行，见下）；
 * - 内衬 padding：paper 卷行 10 / 14，home 首页行 12 / 16（DESIGN.md §8「卡片内衬随组件」），none 由调用处给；
 * - 行间 1px 分隔线画在 RowList 里，行自己不画；
 * - 整行悬停铺悬停底：由放行的那张列表（FluidHoverList 的滑块，App.css .fluid-hover-list）画，行自己不垫底，
 *   这样滑块能在行和行之间滑过去（2026-09-15 起全站这样）。不可点的行不加悬停。
 *
 * 两种行：
 * - 不可点（不给 action）：只是一行内容，行里可以有键（个人空间文件行的「下载」「打开原草稿」「⋯」）。
 * - 整行可点（给 action）：行里第一个子元素是一块盖满整行的透明「整行目标」（.eqb-row-hit），是真的 <button> 或 <a>：
 *   - 打开另一页（详情、草稿卷，有自己的地址）用 <a href>（action.kind = 'link'）：中键、Ctrl / ⌘ 点开新标签，
 *     复制链接都照浏览器的来；普通左键点由 onNavigate 走站内跳转，不整页刷新。
 *   - 就地做一件事（卷行展开 / 收起题组）用 <button>（action.kind = 'button'），可带 aria-expanded / aria-controls。
 *   - 读屏名字：action.label。按 DESIGN.md §5「读屏名字包含看得见的字」，以行上的标题开头。
 *   - 次要键（行尾菜单「⋯」、加入草稿卷的「+」、「看整卷」）和整行目标是兄弟，不套在里面，所以：
 *     键盘 Tab 先到整行目标、再到各个次要键，分开到达；点次要键只触发它自己，不会冒泡成整行点击。
 *     次要键要画在整行目标上面：整行目标是 z-index auto 的绝对定位，排在行里第一个，后面有定位的元素按文档顺序画在它上面，
 *     所以 row.css 给行里的 button、a、[role=button] 这些都加 position: relative（Button 本来就有）。不加 z-index，
 *     免得每一行各开一层，把下一行弹出来的菜单压住。
 *   - 键盘焦点在整行目标上时，整行垫桌色、画 2px 石板墨焦点环（向里 2px，不被板的圆角裁掉一半）。
 *   - 按下（鼠标按在整行目标上）：整行垫深一档的 --eqb-color-border；按在次要键上不算。行不缩放，没有动画可减。
 *   - 行里的字盖在整行目标下面，选不了字（和原来整行是一个 <button> 的首页行一样）。
 *
 * 语义：列表用 RowList（<ul>）+ 每行一个 <li>（Row 默认 as="li"）。行本身不在 <li> 上时（卷行的行头在 <article> 里，
 * 下面还挂着展开的题组目录），用 as="div"，<li> 由外面给。
 *
 * 为什么不用「整行 onClick + 判断点的是不是键」：原来卷行、题组行就是这样，键盘到不了整行（浏览页的卷行用键盘展不开，
 * 题组行用键盘只能从「⋯」进详情），读屏也不知道这一行能点。整行目标是真按钮 / 真链接，这两件事都解决。
 */

import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { FluidHoverList, type FluidHoverListProps } from '../components/FluidHoverList.tsx'
import { surfaceProps } from './surfaceProps.ts'
import './row.css'

export type RowPadding = 'paper' | 'home' | 'none'
export type RowSize = 'md' | 'sm'

/** 就地做一件事：<button>。 */
export type RowButtonAction = {
  kind: 'button'
  /** 读屏名字，以行上看得见的标题开头。 */
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  expanded?: boolean
  controls?: string
}

/** 打开另一页：<a href>。左键（不带修饰键）交给 onNavigate 走站内跳转；中键、修饰键照浏览器的来。 */
export type RowLinkAction = {
  kind: 'link'
  label: string
  href: string
  onNavigate?: () => void
}

export type RowAction = RowButtonAction | RowLinkAction

export type RowProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** li（默认，放在 RowList 里）；div（行头在别的容器里，<li> 由外面给）；article（一行是一件独立的东西）。 */
  as?: 'li' | 'div' | 'article'
  /** paper 卷行 10 / 14（默认）；home 首页行 12 / 16；none 内衬由调用处给。 */
  padding?: RowPadding
  /** md 最小高 48（默认）；sm 最小高 44，只给卷行展开后里面的题组行。 */
  size?: RowSize
  /** 给了就是整行可点。 */
  action?: RowAction
  children?: ReactNode
  ref?: Ref<HTMLElement>
}

function RowHit({ action }: { action: RowAction }) {
  if (action.kind === 'link') {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (!action.onNavigate) return
      // 中键、带修饰键的点（新标签、新窗口、下载）交给浏览器照 href 去。
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      action.onNavigate()
    }
    return <a className="eqb-row-hit" href={action.href} aria-label={action.label} onClick={handleClick} />
  }
  return (
    <button
      type="button"
      className="eqb-row-hit"
      aria-label={action.label}
      aria-expanded={action.expanded}
      aria-controls={action.controls}
      onClick={action.onClick}
    />
  )
}

export function Row({ as: Tag = 'li', padding = 'paper', size = 'md', action, className, children, ref, ...rest }: RowProps) {
  return (
    <Tag
      ref={ref as Ref<never>}
      className={className ? `eqb-row ${className}` : 'eqb-row'}
      data-row={action ? 'action' : 'static'}
      data-padding={padding}
      data-size={size}
      {...rest}
    >
      {action && <RowHit action={action} />}
      {children}
    </Tag>
  )
}

export type RowListProps = Omit<FluidHoverListProps, 'as' | 'itemSelector'> & {
  /** 滑块停在哪些元素上，默认是整行可点的行（.eqb-row[data-row='action']）。不可点的行不给悬停。 */
  itemSelector?: string
  /** 放在板里（Surface board：白底、一圈边、12 圆角、把行裁成圆角），默认是。 */
  board?: boolean
}

/**
 * 一列行：<ul>，行间 1px 分隔线（--eqb-color-border-subtle，就是 --desk-line），整行悬停的滑块（FluidHoverList）。
 * 默认放在板里（Surface 的 board）：板裁圆角，行负责分隔线和悬停。
 */
export function RowList({ itemSelector = ".eqb-row[data-row='action']", board = true, className, children, ...rest }: RowListProps) {
  const listClass = className ? `eqb-row-list ${className}` : 'eqb-row-list'
  const boardProps = board ? surfaceProps({ variant: 'board' }, listClass) : { className: listClass }
  return (
    <FluidHoverList as="ul" itemSelector={itemSelector} {...boardProps} {...rest}>
      {children}
    </FluidHoverList>
  )
}
