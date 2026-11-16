/**
 * 卡片 / 板（Surface.tsx）的类名和 data-* 怎么拼，单放一个文件：Surface.tsx 只导出构件，
 * 快速刷新（react-refresh）才认得出它（和 draftAddContext.ts 同一个理由）。
 * 卡片本身由别的构件渲染时（比如 FluidHoverList 画出来的 <ul>），用 surfaceProps 把这几项挂上去，
 * 样子就和 <Surface> 一样。样式 surface.css 在这里引入，只用 surfaceProps 不用 <Surface> 的页面也带得上。
 */

import './surface.css'

export type SurfaceVariant = 'board' | 'sheet'
export type SurfacePadding = 'none' | 'md'

export type SurfaceOptions = {
  /** board 板（默认）：白底一圈边，不投影；sheet 纸：白底 e1。 */
  variant?: SurfaceVariant
  /** none 不给（默认，里面是行）；md 16。 */
  padding?: SurfacePadding
}

/** 卡片本身由别的构件渲染时（比如 FluidHoverList），把这几项挂到它的根元素上。 */
export function surfaceProps({ variant = 'board', padding = 'none' }: SurfaceOptions = {}, className?: string) {
  return {
    className: className ? `eqb-surface ${className}` : 'eqb-surface',
    'data-surface': variant,
    'data-padding': padding,
  } as const
}
