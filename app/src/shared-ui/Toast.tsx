/**
 * 底部提示 / 撤销（构件厂，2026-11-15；设计记录 design/components-2026-11-13/migrate-row-toast/README.md）。
 *
 * 从清点来（design/components-2026-11-13/inventory.md「底部提示 / 撤销」toast-01，2 处；「行为」一节撤销 6 处）。
 * 核实以后站上自己写的底部提示一共 5 处写法：草稿卷「题组已移出 · 撤销」「已替换这篇 · 撤销」「已加入草稿卷」
 * 「已保存到个人空间 · 查看个人空间」，整卷页相似题栏「已把 N 篇加入草稿卷…」/「没加入草稿卷：…· 重试」。都换成这个件。
 *
 * 照 DESIGN.md：
 * - §4：浮层是不透明白底加 e3（--elev-3），e3 只给临时的东西；
 * - §9：字点名具体变化，不写「成功」，不加句号（文案由调用处写，这里不改字）；
 * - Deletion-Cost Rule：可恢复的删除 = 即删 + toast 撤销，撤销键用共用 Button；
 * - 质感六条·现代：每条提示不超过一行，太长截断，整句在 title 和读屏里。
 *
 * 行为：
 * - 一次只显示一条：新的一条出来时，正在显示的那条被顶掉，它的 onClose('replaced') 会被叫到（撤销快照由调用处清掉）。
 * - 停留时长 duration（毫秒，null = 不自己消失）由调用处给。鼠标停在提示上、或键盘焦点在提示里时，计时停住；
 *   移开以后接着剩下的时间走。到时叫 onClose('timeout')，调用处把 message 设回 null。
 * - Esc：焦点在提示里时按 Esc 关掉这条（onClose('escape')，等于「不撤销了」），焦点回到进提示之前在的地方；
 *   焦点不在提示里时 Esc 不归它管（页面上的 Esc 还要关菜单、对话框），不抢。
 * - 撤销键点完、提示消失时，焦点如果在提示里，同样回到进提示之前在的地方。
 * - 读屏：页面上常驻两块空的播报区（polite 一块 role="status"，出错用的 assertive 一块 role="alert"），提示出现时把内容放进去，
 *   读屏才会念（播报区和内容同时插进页面，很多读屏不念）。
 * - 放法：视口底部正中，离底 24；窄屏（≤ 640）左右各留 16、宽度占满，离底 16 再加上手机底部的安全区。
 * - 动效：出现淡入上浮 8px（--motion-base），消失淡出下沉（--motion-fast）；系统设了「减少动态效果」时不做动画，直接出现、直接消失。
 *
 * Tab 能到：提示放在 <body> 的最后，页面上最后一个能 Tab 到的东西之后按一下 Tab 就到；撤销键是真按钮。
 */

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle, InfoCircle } from '../icons'
import { useToastPresence } from '../features/shared/useToastPresence.ts'
import { Button } from './Button.tsx'
import './toast.css'

export type ToastKind = 'undo' | 'success' | 'info' | 'error'
export type ToastCloseReason = 'timeout' | 'escape' | 'replaced'

export type ToastAction = {
  label: string
  onClick: () => void
  /** 键上字前面的图标（16px）。 */
  icon?: ReactNode
  busy?: boolean
}

export type ToastProps = {
  /** 要说的一句话；null 时不显示。 */
  message: string | null
  /** 换了就重新计时、重新算一条（同一句话连着出两次时用，比如连着移出两个题组）。 */
  token?: unknown
  /** undo 带撤销键（默认）；success 做完了；info 说明；error 出错（读屏马上念）。 */
  kind?: ToastKind
  /** 服务器原话，照登，接在「：」后面。没有就不写。 */
  detail?: string | null
  /** 行尾一个键：撤销、查看、重试。 */
  action?: ToastAction
  /** 停留多少毫秒；null 不自己消失。 */
  duration: number | null
  /** 到时、按了 Esc、被下一条顶掉时叫；调用处把 message 设回 null。 */
  onClose: (reason: ToastCloseReason) => void
  /** 挂钩用的类名（脚本按它找）。 */
  className?: string
}

// 退场时长，和 toast.css 里消失的过渡一样（--motion-fast）。
const EXIT_MS = 120

// ── 一次只显示一条 ─────────────────────────────────────
let current: { owner: object; close: (reason: ToastCloseReason) => void } | null = null

// ── 常驻的两块播报区 ────────────────────────────────────
type Politeness = 'polite' | 'assertive'
const regions: Partial<Record<Politeness, HTMLElement>> = {}

function ensureRegion(politeness: Politeness): HTMLElement {
  const existing = regions[politeness]
  if (existing && existing.isConnected) return existing
  const element = document.createElement('div')
  element.className = 'eqb-toast-region'
  element.dataset.politeness = politeness
  element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
  element.setAttribute('aria-live', politeness)
  document.body.appendChild(element)
  regions[politeness] = element
  return element
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'error') return <AlertTriangle size={16} aria-hidden="true" />
  if (kind === 'info') return <InfoCircle size={16} aria-hidden="true" />
  return <CheckCircle size={16} aria-hidden="true" />
}

type Shown = { message: string; kind: ToastKind; detail: string | null; action?: ToastAction }

export function Toast({ message, token, kind = 'undo', detail = null, action, duration, onClose, className }: ToastProps) {
  const politeness: Politeness = kind === 'error' ? 'assertive' : 'polite'
  // 播报区先放进页面（这一件第一次画出来时，提示一般还没出现），提示出现时再往里放内容。
  // 两块一起建：出错那块（assertive）也要在出错之前就在页面上，读屏才会念。
  // ensureRegion 只在第一次建 div，之后都拿同一块，画几次都一样。
  const regionsReady = typeof document !== 'undefined'
  if (regionsReady) ensureRegion(politeness === 'polite' ? 'assertive' : 'polite')
  const region = regionsReady ? ensureRegion(politeness) : null

  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  const shown: Shown | null = message === null ? null : { message, kind, detail, action }
  // 退场那 120ms 里还要画最后一条：字、种类、原话变了就记一份（画的时候调状态，React 认可的写法）。
  // 出现、消失只看字（字是原始值，不会每次重画都算「变了」）。
  const [kept, setKept] = useState<Shown | null>(null)
  if (shown && (kept === null || kept.message !== shown.message || kept.kind !== shown.kind || kept.detail !== shown.detail)) {
    setKept(shown)
  }
  const presence = useToastPresence(message, EXIT_MS)
  const rendered = shown ?? (presence.rendered === null ? null : kept)

  // 一次只显示一条：出现（或换了一条）时把正在显示的那条顶掉。
  const ownerRef = useRef({})
  const open = message !== null
  useEffect(() => {
    if (!open) return undefined
    const owner = ownerRef.current
    if (current && current.owner !== owner) current.close('replaced')
    current = { owner, close: (reason) => onCloseRef.current(reason) }
    return () => {
      if (current?.owner === owner) current = null
    }
  }, [open, message, token])

  // 停留计时：鼠标停在上面、焦点在里面时停住。
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // 提示收起时把「鼠标停着」「焦点在里面」清掉（提示收起时 pointerleave、blur 不一定来），下一条重新算。
  const [wasOpen, setWasOpen] = useState(message !== null)
  if (wasOpen !== (message !== null)) {
    setWasOpen(message !== null)
    if (message === null) {
      setHovered(false)
      setFocused(false)
    }
  }
  const paused = hovered || focused
  const remainingRef = useRef(duration ?? 0)
  useEffect(() => {
    remainingRef.current = duration ?? 0
  }, [message, token, duration])
  useEffect(() => {
    if (!open || duration === null || paused) return undefined
    const startedAt = Date.now()
    const timer = window.setTimeout(() => onCloseRef.current('timeout'), Math.max(0, remainingRef.current))
    return () => {
      window.clearTimeout(timer)
      remainingRef.current -= Date.now() - startedAt
    }
  }, [open, message, token, duration, paused])

  // 焦点：记下进提示之前在哪里，关掉时（Esc、点了撤销以后提示消失）回去。
  const toastRef = useRef<HTMLDivElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const returnFocus = () => {
    const target = returnFocusRef.current
    returnFocusRef.current = null
    if (target && target.isConnected) target.focus()
  }
  useEffect(() => {
    if (open) return
    if (toastRef.current && toastRef.current.contains(document.activeElement)) returnFocus()
  }, [open])

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const from = event.relatedTarget
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnFocusRef.current = from
    setFocused(true)
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setFocused(false)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    returnFocus()
    onCloseRef.current('escape')
  }

  if (!region || !rendered) return null
  const text = rendered.detail ? `${rendered.message}：${rendered.detail}` : rendered.message
  return createPortal(
    <div
      ref={toastRef}
      className={className ? `eqb-toast ${className}` : 'eqb-toast'}
      data-kind={rendered.kind}
      data-visible={shown ? presence.visible : false}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <ToastIcon kind={rendered.kind} />
      <span className="eqb-toast-text" title={text}>
        {rendered.message}
        {rendered.detail ? <span className="eqb-toast-detail">：{rendered.detail}</span> : null}
      </span>
      {rendered.action && (
        <Button
          tone="strong"
          size="sm"
          className="eqb-toast-action"
          icon={rendered.action.icon}
          busy={rendered.action.busy}
          // 退场那 120ms 里不能再点。
          disabled={!shown}
          onClick={rendered.action.onClick}
        >
          {rendered.action.label}
        </Button>
      )}
    </div>,
    region,
  )
}
