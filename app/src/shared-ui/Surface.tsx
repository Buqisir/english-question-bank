/**
 * 卡片 / 板（构件厂，2026-11-15；设计记录 design/components-2026-11-13/migrate-surface/README.md）。
 *
 * 从清点来（design/components-2026-11-13/inventory.md「卡片 / 板 / 纸 8 种 23 处」）。清点按「干什么」分了三堆：
 * 底色分区 3 种、放在桌上的一张纸 3 种、装一组东西的板 2 种。逐处看过以后，真正是「卡片」的只剩两种样子，
 * 照 DESIGN.md §4 四档高度和 §5 Cards：
 *
 * - board 板：装一组东西（一列卷行、一列文件、目录、一块说明加几个键）。白底，一圈 1px 边（--eqb-color-border），
 *   不投影（§4「板不投影」，e0）。边画成 0 0 0 1px 的一圈，不占位置：首页和浏览的卷行列表卡原来就是这样画的
 *   （§4「本来就是板，不动」），换上构件后逐像素不变。板把里面的行裁成圆角（overflow: hidden）。
 * - sheet 纸：单独放在桌上的一张白卡。白底，e1（墨圈就是边，§4「一条边，不画两条」）。
 *
 * 清点里「底色分区」那三种不是第三种卡片，不单开一档：
 * - 草稿卷左栏目录（surface-01）是一块装目录的面板，照 §4 归板（原来白底没有边，换上板以后多一圈边）；
 * - 首页卷行展开后的行头（surface-03）是一行的展开状态，归「行」，不是卡片；
 * - 登录页的整页底色（surface-07）是页面底，Owner 定过（BRAND.md §4.7），不是卡片。
 * 首页大搜索框（surface-02、04）已经是 SearchField 构件，这里不碰。
 *
 * 圆角都是 --eqb-radius-card 12（§5 按高度选档：卡片、板用 12）。
 * 内边距 padding：none 不给（里面是行，行自己有内衬）；md 16（DESIGN.md 文件头 components.card.padding）。
 *
 * 可以点的卡片（整张能点）单出一个 SurfaceButton，只有纸这一种：整张就是一个 <button>，悬停垫桌色
 * （§2 整块响应）、键盘焦点墨环（§4 Focus Ring）、按下缩一点点（减少动态效果时不缩）。不能点的卡片不加悬停。
 * 板不做成能点的：板里装的是一组东西，能点的是里面的行和键，不是板本身。
 * <button> 里只能放行内内容（span），标题也写成 span；读屏念的名字就是卡片上的字，要另给名字用 aria-label。
 *
 * 语义元素：as 选 div（默认）/ section / article / aside / nav / ul。section、article、aside、nav 是地标或独立内容，
 * 必须有名字：有看得见的标题就用 aria-labelledby 指向它，没有才用 aria-label（类型上强制二选一）。
 * 卡片本身是别的构件画的（比如 FluidHoverList 画出来的 <ul>）时，用 surfaceProps.ts 的 surfaceProps 把类名和 data-* 挂上去
 * （单放一个文件，这个文件只导出构件，快速刷新才认得出）。
 *
 * 「没找到」那张卡片是 EmptyState 自己画的（獭獭的水面就是卡片上沿的边线，定位靠那 1px 实边），
 * 样子和板一样（白底、1px 边、12 圆角、不投影），这里不接管，免得两边打架。
 */

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
// 样式 surface.css 由 surfaceProps.ts 引入。
import { surfaceProps, type SurfaceOptions, type SurfacePadding } from './surfaceProps.ts'

export type { SurfacePadding, SurfaceVariant } from './surfaceProps.ts'

type Named =
  | { 'aria-labelledby': string; 'aria-label'?: undefined }
  | { 'aria-label': string; 'aria-labelledby'?: undefined }

type SurfaceCommon = SurfaceOptions &
  Omit<HTMLAttributes<HTMLElement>, 'aria-label' | 'aria-labelledby'> & {
    children?: ReactNode
    ref?: Ref<HTMLElement>
  }

/** div / ul 不是地标，名字可给可不给；section、article、aside、nav 必须有名字。 */
export type SurfaceProps =
  | (SurfaceCommon & { as?: 'div' | 'ul'; 'aria-label'?: string; 'aria-labelledby'?: string })
  | (SurfaceCommon & { as: 'section' | 'article' | 'aside' | 'nav' } & Named)

export function Surface({ as: Tag = 'div', variant, padding, className, children, ref, ...rest }: SurfaceProps) {
  return (
    // ref 的类型按 HTMLElement 收，各个标签都接得住。
    <Tag ref={ref as Ref<never>} {...surfaceProps({ variant, padding }, className)} {...rest}>
      {children}
    </Tag>
  )
}

export type SurfaceButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** 卡片上的字，只放行内内容（span）。 */
  children: ReactNode
  /** none 不给；md 16（默认）。 */
  padding?: SurfacePadding
  ref?: Ref<HTMLButtonElement>
}

/** 整张能点的纸。 */
export function SurfaceButton({ padding = 'md', type = 'button', className, children, ref, ...rest }: SurfaceButtonProps) {
  return (
    <button ref={ref} type={type} {...surfaceProps({ variant: 'sheet', padding }, className)} data-interactive="" {...rest}>
      {children}
    </button>
  )
}
