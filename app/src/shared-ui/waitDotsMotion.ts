/**
 * 所以点的动作（DESIGN.md §5「Waiting 等待」，Owner 2026-11-15 定；参数照参考实现
 * design/components-2026-11-13/waiting/whisker-dots.html 里的脚本，一个数都没改）。
 *
 * 三种平起平坐：甲 flip「一沉两浮」、乙 wave「此起彼伏」、丙 swap「两两换位」。
 * 参考实现里甲是逐帧（rAF）算位置、丙是一步一步排定时器。这里改成同一种做法：照参考的公式按 60 帧/秒
 * 先算好一圈的关键帧，交给 Web Animations 循环播。位置、快慢、曲线和逐帧算出来的一样（帧间直线插值，
 * 16.7ms 一格，看不出差别），好处是：不占主线程、组件卸载时 cancel 就停干净、几处实例可以对齐到同一个起点、
 * 截图时能用 document.getAnimations() 停在任意一帧。
 *
 * 只在这里用的数（坐标、时长、倍数）都做成具名常量，出处是 DESIGN.md §5 Waiting 和 whisker-dots.html；
 * 和全站动效 token 一样的两段（乙开头沉下去 220ms = --motion-slow，收尾浮回 ∴ 160ms = --motion-base，
 * 曲线 --ease-in-out）不写死，播的时候从 token 读（readMotionMs / readMotionEase）。
 */

export type WaitDotsKind = 'flip' | 'wave' | 'swap'
export const WAIT_DOTS_KINDS: readonly WaitDotsKind[] = ['flip', 'wave', 'swap']

type Point = readonly [number, number]

/** SVG 画在 24 格里，16px 显示。 */
export const WAIT_DOTS_VIEWBOX = 24
/** 点的半径：24 格里 2.25，16px 下直径约 3px（DESIGN §5「点一样大（16px 下直径约 3px）」）。 */
export const WAIT_DOTS_RADIUS = 2.25
/** ∴：上 (12,8)、左下 (7,16)、右下 (17,16)。三种都从这里出发、浮回这里收尾。 */
export const WAIT_DOTS_HOME: readonly Point[] = [[12, 8], [7, 16], [17, 16]]
/** 乙沉成的一行（x = 5 / 12 / 19，DESIGN §5），也是「减少动态效果」时静止的「…」。上面那颗沉到中间。 */
export const WAIT_DOTS_ROW: readonly Point[] = [[12, 12], [5, 12], [19, 12]]

// ── 曲线 ─────────────────────────────────────────────
// 乙的呼吸用正弦（= icons/motionIcons.css 里只给状态图标用的 --ease-sine）；丙换位用参考里的缓入缓出。
// 这两条不是全站 token，按参考写成常量。
const SINE: readonly [number, number, number, number] = [0.37, 0, 0.63, 1]
const SWAP_EASE: readonly [number, number, number, number] = [0.65, 0, 0.35, 1]

/** 采样：60 帧/秒。 */
const FRAME_MS = 1000 / 60

// ── 甲 一沉两浮 ───────────────────────────────────────
/** 一圈 3 秒，潜 540ms，浮 650ms；路过时往外让 0.8 格；浮在上面轻轻漂 0.3 格（DESIGN §5 / whisker-dots.html）。 */
export const FLIP_CYCLE_MS = 3000
const FLIP_DIVE_MS = 540
const FLIP_RISE_MS = 650
const FLIP_BOW = 0.8
const FLIP_FLOAT = 0.3
/** 潜的时候缩到 0.9，浮的时候放到 1.07（参考脚本）。 */
const FLIP_DIVE_SHRINK = 0.1
const FLIP_RISE_GROW = 0.07

type FlipMove = { kind: 'dive' | 'rise'; start: number; from: Point; to: Point; bow: number }
// 每颗点前半圈、后半圈各一段动作（参考脚本的 plans，原样）。
const FLIP_PLANS: readonly (readonly [FlipMove, FlipMove])[] = [
  [{ kind: 'dive', start: 0, from: [12, 8], to: [12, 16], bow: 0 }, { kind: 'rise', start: 1650, from: [12, 16], to: [12, 8], bow: 0 }],
  [{ kind: 'rise', start: 135, from: [7, 16], to: [7, 8], bow: -FLIP_BOW }, { kind: 'dive', start: 1500, from: [7, 8], to: [7, 16], bow: 0 }],
  [{ kind: 'rise', start: 205, from: [17, 16], to: [17, 8], bow: FLIP_BOW }, { kind: 'dive', start: 1580, from: [17, 8], to: [17, 16], bow: 0 }],
]

// ── 乙 此起彼伏 ───────────────────────────────────────
/** 一呼一吸 1.8 秒；中间那颗 1.16 ↔ 0.88，两边 0.86 ↔ 1.1（DESIGN §5「大小在 0.86–1.16 倍之间」）。 */
export const WAVE_CYCLE_MS = 1800
const WAVE_CENTER: readonly [number, number] = [1.16, 0.88]
const WAVE_SIDE: readonly [number, number] = [0.86, 1.1]

// ── 丙 两两换位 ───────────────────────────────────────
/** 开始等 200ms 后第一次换；0.95 秒换一次（移 490ms、停 460ms）；沿弧线错开 2 格，前面过的 1.1 倍、后面过的 0.86 倍。 */
const SWAP_FIRST_MS = 200
export const SWAP_STEP_MS = 950
const SWAP_MOVE_MS = 490
const SWAP_ARC = 2
const SWAP_FRONT = 1.1
const SWAP_BACK = 0.86
/** 换的顺序：上↔左下、上↔右下、左下↔右下（按位置），六次以后三颗点回到各自原位，一圈 6 × 0.95 秒。 */
const SWAP_PAIRS: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [1, 2]]
const SWAP_STEPS_PER_CYCLE = 6

// ── 小工具 ────────────────────────────────────────────
export function dotTransform([x, y]: Point, scale = 1): string {
  return `translate(${round(x)}px, ${round(y)}px) scale(${round(scale)})`
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

function cubicBezier([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t ** 2 * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t ** 2 * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2
      if (bx(mid) < x) lo = mid
      else hi = mid
    }
    return by((lo + hi) / 2)
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
const bell = (x: number) => Math.sin(Math.PI * x)

type Pose = { at: Point; scale: number }

function sampleKeyframes(durationMs: number, pose: (t: number) => Pose): Keyframe[] {
  const frames = Math.round(durationMs / FRAME_MS)
  const out: Keyframe[] = []
  for (let k = 0; k <= frames; k += 1) {
    const t = (k / frames) * durationMs
    const p = pose(t)
    out.push({ offset: k / frames, transform: dotTransform(p.at, p.scale) })
  }
  return out
}

// ── 甲：逐帧公式（参考脚本 flip() 里的 pose，原样） ─────────────
function flipPose(plan: readonly [FlipMove, FlipMove], t: number): Pose {
  const dive = (x: number) => x * x * (2.2 - 1.2 * x) // 先慢后快，末尾收一点，不撞
  const rise = (x: number) => 1 - (1 - x) ** 3 // 起得快，到得轻
  for (const m of plan) {
    const dur = m.kind === 'dive' ? FLIP_DIVE_MS : FLIP_RISE_MS
    const q = (t - m.start) / dur
    if (q >= 0 && q <= 1) {
      const e = m.kind === 'dive' ? dive(q) : rise(q)
      const x = lerp(m.from[0], m.to[0], e) + m.bow * bell(q)
      const y = lerp(m.from[1], m.to[1], e)
      const scale = m.kind === 'dive' ? 1 - FLIP_DIVE_SHRINK * bell(q) : 1 + FLIP_RISE_GROW * bell(q)
      return { at: [x, y], scale }
    }
  }
  // 静止段：停在最近结束的那一段的终点；终点在上面时，从到达到下一段开始之间轻轻漂一下。
  let lastSeg = plan[0]
  let lastEnd = -Infinity
  for (const m of plan) {
    const end = m.start + (m.kind === 'dive' ? FLIP_DIVE_MS : FLIP_RISE_MS)
    const e = end <= t ? end : end - FLIP_CYCLE_MS
    if (e > lastEnd) {
      lastEnd = e
      lastSeg = m
    }
  }
  let next = Infinity
  for (const m of plan) {
    const n = m.start > t ? m.start : m.start + FLIP_CYCLE_MS
    if (n < next) next = n
  }
  const [x, y] = lastSeg.to
  if (y < 12) {
    const q = Math.max(0, Math.min(1, (t - lastEnd) / (next - lastEnd)))
    return { at: [x, y - FLIP_FLOAT * bell(q)], scale: 1 }
  }
  return { at: [x, y], scale: 1 }
}

// ── 乙：呼吸（参考里是三个关键帧 + 整段正弦曲线） ───────────────
function wavePose(dot: number, t: number): Pose {
  const sine = cubicBezier(SINE)
  const [a, b] = dot === 0 ? WAVE_CENTER : WAVE_SIDE
  const p = sine(t / WAVE_CYCLE_MS)
  const scale = p < 0.5 ? lerp(a, b, p * 2) : lerp(b, a, (p - 0.5) * 2)
  return { at: WAIT_DOTS_ROW[dot], scale }
}

// ── 丙：六次换位一圈（参考里是一步一个三帧动画 + 整段曲线） ────────
type SwapMove = { start: number; from: Point; mid: Point; to: Point; midScale: number }

function swapMoves(): SwapMove[][] {
  const at = [0, 1, 2] // 每颗点现在在哪个位置
  const moves: SwapMove[][] = [[], [], []]
  for (let step = 0; step < SWAP_STEPS_PER_CYCLE; step += 1) {
    const [p, q] = SWAP_PAIRS[step % SWAP_PAIRS.length]
    const a = at.indexOf(p)
    const b = at.indexOf(q)
    const A = WAIT_DOTS_HOME[p]
    const B = WAIT_DOTS_HOME[q]
    const mx = (A[0] + B[0]) / 2
    const my = (A[1] + B[1]) / 2
    const dx = B[0] - A[0]
    const dy = B[1] - A[1]
    const len = Math.hypot(dx, dy)
    const nx = (-dy / len) * SWAP_ARC
    const ny = (dx / len) * SWAP_ARC
    const start = step * SWAP_STEP_MS
    moves[a].push({ start, from: A, mid: [mx + nx, my + ny], to: B, midScale: SWAP_FRONT })
    moves[b].push({ start, from: B, mid: [mx - nx, my - ny], to: A, midScale: SWAP_BACK })
    at[a] = q
    at[b] = p
  }
  return moves
}

function swapPose(dotMoves: SwapMove[], home: Point, t: number): Pose {
  const ease = cubicBezier(SWAP_EASE)
  let rest = home
  for (const m of dotMoves) {
    if (t < m.start) break
    const q = (t - m.start) / SWAP_MOVE_MS
    if (q <= 1) {
      const p = ease(q)
      return p < 0.5
        ? { at: lerpPoint(m.from, m.mid, p * 2), scale: lerp(1, m.midScale, p * 2) }
        : { at: lerpPoint(m.mid, m.to, (p - 0.5) * 2), scale: lerp(m.midScale, 1, (p - 0.5) * 2) }
    }
    rest = m.to
  }
  return { at: rest, scale: 1 }
}

// ── 对外：每种的动画计划 ──────────────────────────────────
/** 一颗点的一段动画：keyframes + 时长 + 相对这次等待开始的延迟；loop 为真时无限循环。 */
export type DotTrack = { keyframes: Keyframe[]; duration: number; delay: number; loop: boolean; easing?: string }

const cache = new Map<WaitDotsKind, DotTrack[][]>()

/**
 * 三颗点各自的动画段。乙的开头（∴ 沉成一行）要用全站 token 的时长和曲线，由调用处传进来；
 * 读不到 token（sinkMs 为 null）就不演沉下去，直接从一行开始。
 */
export function waitDotsTracks(kind: WaitDotsKind, sink: { ms: number; easing: string } | null): DotTrack[][] {
  if (kind === 'wave') {
    const sinkMs = sink?.ms ?? 0
    return [0, 1, 2].map((dot) => {
      const loop: DotTrack = {
        keyframes: sampleKeyframes(WAVE_CYCLE_MS, (t) => wavePose(dot, t)),
        duration: WAVE_CYCLE_MS,
        delay: sinkMs,
        loop: true,
      }
      if (!sink) return [loop]
      return [{
        keyframes: [{ transform: dotTransform(WAIT_DOTS_HOME[dot]) }, { transform: dotTransform(WAIT_DOTS_ROW[dot]) }],
        duration: sink.ms,
        delay: 0,
        loop: false,
        easing: sink.easing,
      }, loop]
    })
  }
  const cached = cache.get(kind)
  if (cached) return cached
  let tracks: DotTrack[][]
  if (kind === 'flip') {
    tracks = FLIP_PLANS.map((plan) => [{
      keyframes: sampleKeyframes(FLIP_CYCLE_MS, (t) => flipPose(plan, t % FLIP_CYCLE_MS)),
      duration: FLIP_CYCLE_MS,
      delay: 0,
      loop: true,
    }])
  } else {
    const cycle = SWAP_STEPS_PER_CYCLE * SWAP_STEP_MS
    const moves = swapMoves()
    tracks = moves.map((dotMoves, dot) => [{
      keyframes: sampleKeyframes(cycle, (t) => swapPose(dotMoves, WAIT_DOTS_HOME[dot], t % cycle)),
      duration: cycle,
      delay: SWAP_FIRST_MS,
      loop: true,
    }])
  }
  cache.set(kind, tracks)
  return tracks
}

// ── 读全站动效 token（shared-ui/motion.css :root） ─────────────
/** 读一个时长 token（如 --motion-base），读不到返回 null（调用处就不演那一段，直接到位）。 */
export function readMotionMs(name: string): number | null {
  if (typeof document === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const match = /^([\d.]+)(ms|s)$/.exec(raw)
  if (!match) return null
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

/** 读一条曲线 token（如 --ease-in-out），读不到返回 null。 */
export function readMotionEase(name: string): string | null {
  if (typeof document === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw || null
}
