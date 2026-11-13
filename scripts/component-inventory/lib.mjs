// 构件清点（design/components-2026-11-13）的共用路径和小工具。
import { createRequire } from 'node:module'
import { readdirSync, statSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const APP = path.join(ROOT, 'app')
export const SRC = path.join(APP, 'src')
export const OUT = path.join(ROOT, 'design/components-2026-11-13')
export const DATA = path.join(OUT, 'data') // 提交进仓库的结果（小）
export const RAW = path.join(ROOT, '.scratch/component-inventory') // 原始抓取（大，不进仓库，重跑可得）
mkdirSync(DATA, { recursive: true }); mkdirSync(RAW, { recursive: true })

const appRequire = createRequire(path.join(APP, 'package.json'))
export const requireFromApp = (name) => appRequire(appRequire.resolve(name))
export const resolveFromApp = (name) => appRequire.resolve(name)
// postcss 不是 app 的直接依赖，从 pnpm 仓里取 vite 带的那份
export function loadPostcss() {
  const viteReq = createRequire(appRequire.resolve('vite'))
  return viteReq('postcss')
}

// 不算的范围：卷面（PaperSurface）和打印样式
export const EXCLUDED_DIRS = ['shared-ui/papersurface']
export const isExcluded = (rel) => EXCLUDED_DIRS.some((d) => rel.startsWith(d))

export function walk(dir) {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
export const rel = (p) => path.relative(SRC, p).split(path.sep).join('/')

// 九类（Owner 2026-11-13 定的范围）
export const KINDS = [
  ['button', '按钮'],
  ['chip', '标签 / 小签'],
  ['row', '行'],
  ['surface', '卡片 / 板 / 纸'],
  ['notice', '提示条 / 报错'],
  ['toast', '底部提示 / 撤销'],
  ['empty', '空状态'],
  ['dialog', '对话框 / 菜单 / 抽屉'],
  ['field', '输入框 / 搜索'],
]
export const KIND_LABEL = Object.fromEntries(KINDS)

// 透传宿主的组件：组件本身渲染一个动态标签（<Tag>），把调用处的其余属性原样传过去（...rest）。
// 这类调用处在页面上就是一个真实元素，所以清点时把调用处当原生元素看（标签取 as，默认值照组件源码）。
// 现在只有 FluidHoverList（components/FluidHoverList.tsx：as 默认 'ul'，{...rest} 落在 <Tag> 上）。
export const HOST_WRAPPERS = { FluidHoverList: 'ul' }
