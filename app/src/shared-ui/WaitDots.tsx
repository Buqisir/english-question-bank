/**
 * 所以点（DESIGN.md §5「Waiting 等待」，Owner 2026-11-15 定；BRAND.md §4.6 末段「界面等待 · 所以点」）。
 *
 * 獭獭两颊的 ∴ 三颗点，代替转圈，用在界面里的小号等待：按钮里（Button 的 busy）、一行字后面（「正在保存」）。
 * - 16px，点用 currentColor（所在处的字色），SVG 画在 24 格里。跟在 12–13px 小字后面用 size="sm"：14px
 *   （Owner 2026-11-15 定，16px 在小字旁略大）。字和点之间不另加间距，见 waiting.css「所以点和字的间距」。
 * - 三种动作平起平坐：甲 一沉两浮、乙 此起彼伏、丙 两两换位（参数在 waitDotsMotion.ts）。
 *   每次开始等随机挑一种，不连着出同一种；同一时刻屏幕上几处等待用同一种，而且对齐到同一个起点（模块里共用一个「这次等待」）。
 * - active 变成 false：从当前位置浮回 ∴（--motion-base，160ms），停在 ∴；什么时候隐去由用的地方决定
 *   （Button 和 Notice 用 useDelayedBusy 的 settling → leaving 两段）。
 * - 系统开了「减少动态效果」：只显示静止的「…」。
 * - 对读屏隐藏。读屏的「忙」由所在的键（aria-busy）或那一行字负责。
 * - 卸载时停掉所有动画。
 *
 * 一般不直接用：等待的门槛（300ms 以内不出、出了至少 500ms）在 useDelayedBusy 里，先过门槛再放所以点。
 * 一行字后面跟所以点用下面的 InlineWaitDots（自己带门槛）；按钮用 Button 的 busy；提示行用 Notice 的 kind="waiting"。
 */

import { useLayoutEffect, useRef } from 'react'
import { useDelayedBusy } from './useDelayedBusy.ts'
import {
  WAIT_DOTS_HOME,
  WAIT_DOTS_KINDS,
  WAIT_DOTS_RADIUS,
  WAIT_DOTS_ROW,
  WAIT_DOTS_VIEWBOX,
  dotTransform,
  readMotionEase,
  readMotionMs,
  waitDotsTracks,
  type WaitDotsKind,
} from './waitDotsMotion.ts'
import './waiting.css'

// ── 同一时刻共用的一次等待 ──────────────────────────────
// 第一处开始等时挑一种（不和上一次一样），记下起点；后来的实例用同一种、同一个起点；最后一处停了，这次等待结束。
type WaitSession = { kind: WaitDotsKind; start: number; users: number }
let currentSession: WaitSession | null = null
let lastKind: WaitDotsKind | null = null

function timelineNow(): number {
  const t = document.timeline?.currentTime
  return typeof t === 'number' ? t : performance.now()
}

function joinSession(): WaitSession {
  if (!currentSession) {
    const pool = WAIT_DOTS_KINDS.filter((kind) => kind !== lastKind)
    const kind = pool[Math.floor(Math.random() * pool.length)]
    lastKind = kind
    currentSession = { kind, start: timelineNow(), users: 0 }
  }
  currentSession.users += 1
  return currentSession
}

function leaveSession(session: WaitSession) {
  session.users -= 1
  if (session.users <= 0 && currentSession === session) currentSession = null
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** md 16px（默认，和 14px 及以上的字、行内图标同一档）；sm 14px（跟在 12–13px 小字后面，Owner 2026-11-15 定）；
 *  lg 20px（只给胶囊大号键，400 × 52 的登录键里 16px 偏小，Owner 2026-11-15 定）。 */
export type WaitDotsSize = 'md' | 'sm' | 'lg'

export type WaitDotsProps = {
  /** 正在等（默认）。变成 false 时浮回 ∴ 并停在那里。 */
  active?: boolean
  size?: WaitDotsSize
  /** 隐去（淡出）。Button、Notice 用自己的样式隐去，不用这个。 */
  leaving?: boolean
  className?: string
}

export function WaitDots({ active = true, leaving = false, size = 'md', className }: WaitDotsProps) {
  const rootRef = useRef<SVGSVGElement>(null)
  const dotRefs = useRef<(SVGCircleElement | null)[]>([])
  const settleRef = useRef<Animation[]>([])

  useLayoutEffect(() => {
    const root = rootRef.current
    const dots = dotRefs.current.filter((dot): dot is SVGCircleElement => dot !== null)
    if (!root || dots.length !== 3) return
    const place = (points: readonly (readonly [number, number])[]) => {
      dots.forEach((dot, index) => { dot.style.transform = dotTransform(points[index]) })
    }

    if (!active) {
      // 不在这里停收尾：active 由 true 变 false 时，上一轮的清理刚把「浮回 ∴」排上（settleRef），要让它演完。
      place(WAIT_DOTS_HOME)
      return
    }
    // 又开始等：停掉还没演完的收尾，从头起。
    for (const animation of settleRef.current) animation.cancel()
    settleRef.current = []
    if (prefersReducedMotion() || typeof root.animate !== 'function') {
      root.setAttribute('data-reduced', '')
      root.removeAttribute('data-kind')
      place(WAIT_DOTS_ROW)
      return () => {
        root.removeAttribute('data-reduced')
        place(WAIT_DOTS_HOME)
      }
    }

    place(WAIT_DOTS_HOME)
    const session = joinSession()
    root.setAttribute('data-kind', session.kind)
    const slow = readMotionMs('--motion-slow')
    const inOut = readMotionEase('--ease-in-out')
    const tracks = waitDotsTracks(session.kind, slow !== null && inOut !== null ? { ms: slow, easing: inOut } : null)
    const running: Animation[] = []
    dots.forEach((dot, index) => {
      for (const track of tracks[index]) {
        const animation = dot.animate(track.keyframes, {
          duration: track.duration,
          delay: track.delay,
          iterations: track.loop ? Infinity : 1,
          easing: track.easing ?? 'linear',
        })
        // 对齐到这次等待的起点：几处实例同一相位。
        animation.startTime = session.start
        running.push(animation)
      }
    })

    return () => {
      // 收尾：从当前位置浮回 ∴。先读下当前位置再停循环。
      const from = dots.map((dot) => getComputedStyle(dot).transform)
      for (const animation of running) animation.cancel()
      leaveSession(session)
      place(WAIT_DOTS_HOME)
      const settleMs = readMotionMs('--motion-base')
      if (settleMs === null || inOut === null || !root.isConnected) return
      settleRef.current = dots.map((dot, index) => dot.animate(
        [{ transform: from[index] === 'none' ? dotTransform(WAIT_DOTS_HOME[index]) : from[index] }, { transform: dotTransform(WAIT_DOTS_HOME[index]) }],
        { duration: settleMs, easing: inOut },
      ))
    }
  }, [active])

  // 卸载时停掉收尾那段。写在上面那个 effect 后面：卸载时清理按声明顺序跑，上面那个先把收尾动画排上，这里再停掉。
  useLayoutEffect(() => () => {
    for (const animation of settleRef.current) animation.cancel()
    settleRef.current = []
  }, [])

  return (
    <svg
      ref={rootRef}
      className={className ? `eqb-wait-dots ${className}` : 'eqb-wait-dots'}
      viewBox={`0 0 ${WAIT_DOTS_VIEWBOX} ${WAIT_DOTS_VIEWBOX}`}
      data-active={active ? 'true' : 'false'}
      data-size={size === 'md' ? undefined : size}
      data-leaving={leaving ? '' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {WAIT_DOTS_HOME.map((_, index) => (
        <circle
          key={index}
          ref={(node) => { dotRefs.current[index] = node }}
          r={WAIT_DOTS_RADIUS}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

export type InlineWaitDotsProps = {
  /** 正在等。过了 300ms 门槛才出所以点，出了至少 500ms；等完浮回 ∴、隐去。 */
  pending: boolean
  /** 跟在 12–13px 小字后面给 sm（14px）；默认 md（16px）。 */
  size?: WaitDotsSize
  className?: string
}

/** 一行字后面的所以点（「正在保存」「正在翻译」）：带门槛。没在等时什么都不渲染。 */
export function InlineWaitDots({ pending, size = 'md', className }: InlineWaitDotsProps) {
  const phase = useDelayedBusy(pending)
  if (phase === 'idle') return null
  const classes = ['eqb-wait-dots-inline', className].filter(Boolean).join(' ')
  return <WaitDots active={phase === 'waiting'} className={classes} leaving={phase === 'leaving'} size={size} />
}
