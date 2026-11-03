import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Copy } from './generated/copy'
import { Check } from './generated/check'
import { Play } from './generated/play'
import { Pause } from './generated/pause'
import { Pin } from './generated/pin'
import { ChevronDown } from './generated/chevron-down'
import { ChevronRight } from './generated/chevron-right'
import { Plus } from './generated/plus'
import { Scissors } from './generated/scissors'
import { PaperDownload } from './generated/paper-download'
import { Volume } from './generated/volume'
import { Download } from './generated/download'
import type { EqbIconProps } from './EqbIcon'
import './motionIcons.css'

type MotionProps = Pick<EqbIconProps, 'size' | 'variant'>

// 循环只跟真实的进行中状态绑定。循环由 data-loop 驱动（不交给 React 管），
// 这样状态结束时还能读到循环当前的视觉值，从那里过渡回静止，而不是跳变。
function useStateLoop(ref: RefObject<HTMLSpanElement | null>, active: boolean, parts: string, settleMs: number) {
  const settling = useRef<Animation[]>([])
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    if (active) {
      for (const animation of settling.current) animation.cancel()
      settling.current = []
      root.dataset.loop = 'on'
      return
    }
    if (root.dataset.loop !== 'on') return
    const nodes = [...root.querySelectorAll<SVGElement>(parts)]
    const from = nodes.map((node) => {
      const style = getComputedStyle(node)
      return { transform: style.transform, opacity: style.opacity }
    })
    delete root.dataset.loop
    if (root.closest('[data-icon-motion="instant"]') || typeof root.animate !== 'function') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    settling.current = nodes.map((node, index) => node.animate(
      [{ offset: 0, ...from[index] }],
      { duration: reduce ? 80 : settleMs, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    ))
  }, [active, parts, ref, settleMs])
}

export function CopyFeedbackIcon({ state, size = 16 }: MotionProps & { state: 'idle' | 'pending' | 'done' }) {
  return <span className="eqb-motion eqb-motion-copy" data-state={state} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-copy-paper"><Copy size={size} /></span>
    <span className="eqb-reveal"><span className="eqb-reveal-in"><Check size={size} /></span></span>
  </span>
}

// 加入生词本：按钮里原本没有图标；只有“正在加入 → 已加入”这一次才揭示勾，进页面时已加入的直接显示。
export function CheckRevealIcon({ reveal, size = 16 }: MotionProps & { reveal: boolean }) {
  return <span className={reveal ? 'eqb-motion eqb-motion-check is-revealing' : 'eqb-motion eqb-motion-check'} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-reveal"><span className="eqb-reveal-in"><Check size={size} /></span></span>
  </span>
}

export type AudioIconState = 'idle' | 'waiting' | 'playing'

export function VolumeFeedbackIcon({ state, size = 16 }: MotionProps & { state: AudioIconState }) {
  const ref = useRef<HTMLSpanElement>(null)
  useStateLoop(ref, state === 'playing', 'svg > path:last-of-type', 120)
  return <span ref={ref} className="eqb-motion eqb-motion-volume" data-state={state} style={{ width: size, height: size }} aria-hidden="true">
    <Volume size={size} />
  </span>
}

// 下载生成中。icon='paper' 是带折角的试卷下载图标：折角就在箭头正下方，没有下压的行程，
// 只让箭头（第 3 条路径）做透明度往复；折角和外框不动（D9）。
export function DownloadFeedbackIcon({ working, size = 16, icon = 'download' }: MotionProps & { working: boolean, icon?: 'download' | 'paper' }) {
  const ref = useRef<HTMLSpanElement>(null)
  const paper = icon === 'paper'
  useStateLoop(ref, working, paper ? 'svg > path:nth-of-type(3)' : 'svg > path:nth-of-type(n+2)', 160)
  return <span ref={ref} className={paper ? 'eqb-motion eqb-motion-download is-paper' : 'eqb-motion eqb-motion-download'} data-working={working} style={{ width: size, height: size }} aria-hidden="true">
    {paper ? <PaperDownload size={size} /> : <Download size={size} />}
  </span>
}

export function PlaybackIcon({ playing, size = 16, variant = 'line' }: MotionProps & { playing: boolean }) {
  return <span className="eqb-motion eqb-motion-playback" data-playing={playing} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-play-half eqb-play-left"><Play size={size} variant={variant} /></span>
    <span className="eqb-play-half eqb-play-right"><Play size={size} variant={variant} /></span>
    <span className="eqb-pause-bars"><Pause size={size} variant={variant} /></span>
  </span>
}

// 展开 / 收起。A 类（内容在下面展开、下拉菜单）：朝下的箭头上下翻转成朝上。
// B 类（层级行、分节折叠）：朝右的箭头顺时针转 90° 到朝下。
// 不传 expanded 时由外层 <details open> 决定（见 motionIcons.css），用于原生 details 的 summary。
export function DisclosureIcon({ expanded, size = 16, kind = 'flip' }: MotionProps & { expanded?: boolean, kind?: 'flip' | 'branch' }) {
  const branch = kind === 'branch'
  return <span className={branch ? 'eqb-motion eqb-motion-branch' : 'eqb-motion eqb-motion-disclosure'} data-expanded={expanded} style={{ width: size, height: size }} aria-hidden="true">
    {branch ? <ChevronRight size={size} /> : <ChevronDown size={size} />}
  </span>
}

// 加入草稿卷：加号 → 勾（D6）。cut 是试卷浏览的“剪入 → 已剪入”：线条剪刀 → 勾，过渡与 D6 相同（D7 修订）。
// 过渡只在用户按过的那个按钮里播放（[data-icon-motion='pointer']，见 motionInput）；
// 列表加载、切换草稿卷等数据变化直接到位，不播。
export function DraftAddIcon({ done, size = 16, cut = false }: MotionProps & { done: boolean, cut?: boolean }) {
  return <span className={cut ? 'eqb-motion eqb-motion-add is-cut' : 'eqb-motion eqb-motion-add'} data-state={done ? 'done' : 'idle'} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-add-plus">{cut ? <Scissors size={size} /> : <Plus size={size} />}</span>
    <span className="eqb-reveal"><span className="eqb-reveal-in"><Check size={size} /></span></span>
  </span>
}

export function PinFeedbackIcon({ pinned, size = 16 }: MotionProps & { pinned: boolean }) {
  return <span className="eqb-motion eqb-motion-pin" data-pinned={pinned} style={{ width: size, height: size }} aria-hidden="true">
    <Pin size={size} variant="fill" />
  </span>
}
