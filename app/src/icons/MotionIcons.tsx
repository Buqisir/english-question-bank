import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Copy } from './generated/copy'
import { Check } from './generated/check'
import { Play } from './generated/play'
import { Pause } from './generated/pause'
import { Pin } from './generated/pin'
import { ChevronDown } from './generated/chevron-down'
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

export function DownloadFeedbackIcon({ working, size = 16 }: MotionProps & { working: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useStateLoop(ref, working, 'svg > path:nth-of-type(n+2)', 160)
  return <span ref={ref} className="eqb-motion eqb-motion-download" data-working={working} style={{ width: size, height: size }} aria-hidden="true">
    <Download size={size} />
  </span>
}

export function PlaybackIcon({ playing, size = 16, variant = 'line' }: MotionProps & { playing: boolean }) {
  return <span className="eqb-motion eqb-motion-playback" data-playing={playing} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-play-half eqb-play-left"><Play size={size} variant={variant} /></span>
    <span className="eqb-play-half eqb-play-right"><Play size={size} variant={variant} /></span>
    <span className="eqb-pause-bars"><Pause size={size} variant={variant} /></span>
  </span>
}

export function DisclosureIcon({ expanded, size = 16 }: MotionProps & { expanded: boolean }) {
  return <span className="eqb-motion eqb-motion-disclosure" data-expanded={expanded} style={{ width: size, height: size }} aria-hidden="true">
    <ChevronDown size={size} />
  </span>
}

export function PinFeedbackIcon({ pinned, size = 16 }: MotionProps & { pinned: boolean }) {
  return <span className="eqb-motion eqb-motion-pin" data-pinned={pinned} style={{ width: size, height: size }} aria-hidden="true">
    <Pin size={size} variant="fill" />
  </span>
}
