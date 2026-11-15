/**
 * 对话框构件：一层遮罩 + 一块面板（标题、正文、底部动作），构件厂，2026-11-14，提案 · 单一来源。
 * 设计记录：design/components-2026-11-13/migrate-dialog/README.md。
 *
 * 行为（全站对话框一样）：
 * - 用原生 <dialog> 的 showModal（沿用 components/useModalDialog）：背后的页面整页不可点、读屏读不到，
 *   Tab 和 Shift+Tab 在对话框里绕圈，焦点不跑出去。
 * - 打开时焦点落在第一个合理的控件上：调用处给了 initialFocus 就用它；否则正文里第一个能 Tab 到的控件；
 *   正文里没有（确认框）就落在底部第一个键上，也就是「取消」那一侧，按回车不会误删。
 * - Esc 关；关上以后焦点回到打开它的那个键。打开它的键在打开时已经不在了（菜单项、下拉列表里的项），
 *   调用处用 returnFocus 指一个还在的键（一般是那个菜单的触发键）。
 * - 开着时背后页面不能滚（把根元素的 overflow 关掉，关上时还原）。
 * - 点遮罩关不关：closeOnBackdrop，默认不关。确认、填表这类防误关；只有调用处原来就点遮罩关的才打开。
 * - busy：正在做（保存、生成、作废中），Esc、点遮罩、右上角关闭、「取消」都不关，「取消」和关闭键变禁用。
 * - 入场：遮罩淡入，面板淡入并从 0.97 放大（侧边抽屉从右边滑进来）；退场快一档。时长、曲线用全站
 *   --motion-* / --ease-*（App.css :root）。系统设了「减少动态效果」时不做过渡（dialog.css）。
 *   退场要等动画播完才卸载：调用处让 <Dialog> 一直挂着、只切 open。退场这段时间里标题、正文、动作照
 *   最后一次打开时的样子画（调用处的数据这时可能已经清空了）。
 *
 * 两种语气（tone）：
 * - dialog（默认）：读屏角色 dialog，名字是标题。
 * - alert：确认、危险操作，读屏角色 alertdialog，名字是标题，描述是 description；确认键用危险字。
 *
 * 动作（cancel / confirm）：「取消」在左、确认在右，靠右排（DESIGN.md 没写；照站上 5 处对话框里 4 处的排法，
 * 见 README「主次顺序」）。都是 Button 大号（36）：取消墨字（strong），确认石板墨填充（solid，雾薄荷主键留给
 * 页面上那唯一一处，DESIGN.md §2 Accent）；alert 的确认用危险字（danger）。给了 onSubmit 时面板是一个 <form>，
 * 确认键默认是提交键。footnote 是底部左边一行说明（比如「每页约 7 词」）。
 *
 * 放法（placement）：center 居中（默认）；side 贴右边、满高的抽屉（录题面板这种长表单）。
 * 尺寸（size）：sm 确认框、md 小表单（默认）、lg 带列表的选择框。宽度写在 dialog.css 的局部变量里，缺口见 docs/design-gaps.md。
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useModalDialog } from '../components/useModalDialog.ts'
import { usePresence } from '../features/shared/useToastPresence.ts'
import { X } from '../icons'
import { Button } from './Button.tsx'
import './dialog.css'

export type DialogTone = 'dialog' | 'alert'
export type DialogSize = 'sm' | 'md' | 'lg'
export type DialogPlacement = 'center' | 'side'

export type DialogAction = {
  label: ReactNode
  /** 取消键不给就是关上（onClose）。 */
  onClick?: () => void
  disabled?: boolean
  /** 正在做：键保持原样大小，点了不再触发，读屏念「忙」；过了 300ms 门槛字隐去、所以点放在正中。字不要换（宽度不变）。 */
  busy?: boolean
  /** 确认键：给了 onSubmit 时默认 submit，否则 button。 */
  type?: 'button' | 'submit'
  /** 只当选择器钩子用。 */
  className?: string
}

export type DialogProps = {
  open: boolean
  /** Esc、点遮罩（closeOnBackdrop 时）、右上角关闭、「取消」都走这里。 */
  onClose: () => void
  title: ReactNode
  /** 标题下一行说明；alert 时它也是读屏的描述。 */
  description?: ReactNode
  tone?: DialogTone
  size?: DialogSize
  placement?: DialogPlacement
  /** 给了就在右上角放一个只有图标的关闭键，这是它的读屏名字。确认框不放。 */
  closeLabel?: string
  cancel?: DialogAction
  confirm?: DialogAction
  /** 底部左边一行说明。 */
  footnote?: ReactNode
  busy?: boolean
  /** 点遮罩关不关，默认不关。 */
  closeOnBackdrop?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  returnFocus?: () => HTMLElement | null | undefined
  /** 给了就把面板做成 <form>，回车和确认键提交。 */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  /** 挂在 <dialog> 上，只当选择器钩子用。 */
  className?: string
  /** 挂在正文上；正文要自己排（比如只让里面的列表滚）时用。 */
  bodyClassName?: string
  children?: ReactNode
}

// 退场时长：和 dialog.css 里退场用的 --motion-fast（120ms）一致，播完再卸载。
const EXIT_MS = 120

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]'

function firstFocusable(root: Element | null | undefined): HTMLElement | null {
  if (!root) return null
  return (
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0,
    ) || null
  )
}

// 背后页面不能滚：几个对话框叠着开时只锁一次、全关了才还原。
let scrollLocks = 0
let savedOverflow = ''

function lockScroll(): void {
  if (scrollLocks === 0) {
    savedOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  scrollLocks += 1
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.documentElement.style.overflow = savedOverflow
}

export function Dialog(props: DialogProps) {
  const {
    open,
    onClose,
    tone = 'dialog',
    size = tone === 'alert' ? 'sm' : 'md',
    placement = 'center',
    busy = false,
    closeOnBackdrop = false,
    initialFocus,
    returnFocus,
    onSubmit,
    className,
    bodyClassName,
  } = props

  // 退场时调用处的数据可能已经清空，内容照最后一次打开时的画（渲染中按 props 调整 state，React 文档的写法）。
  const [lastOpenProps, setLastOpenProps] = useState(props)
  if (open && lastOpenProps !== props) setLastOpenProps(props)
  const shown = open ? props : lastOpenProps

  const presence = usePresence(open, EXIT_MS)
  const dialogRef = useModalDialog(presence.mounted, { returnFocus })
  const titleId = useId()
  const descriptionId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const footRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const pointerOnLayerRef = useRef(false)

  // 写在 useModalDialog 后面：同一次提交里它先 showModal，这里再把焦点挪到想要的控件上。
  useLayoutEffect(() => {
    if (!presence.mounted) return
    const target =
      initialFocus?.current ||
      firstFocusable(bodyRef.current) ||
      firstFocusable(footRef.current) ||
      firstFocusable(headRef.current)
    target?.focus()
    // 只在打开那一下定焦点；之后的渲染不抢（initialFocus 是 ref，不进依赖）。
  }, [presence.mounted, initialFocus])

  useEffect(() => {
    if (!presence.mounted) return
    lockScroll()
    return unlockScroll
  }, [presence.mounted])

  if (!presence.mounted) return null

  const dismiss = () => {
    if (busy || !open) return
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return
    // 自己处理 Esc：拦掉浏览器的 cancel，免得 busy 时原生对话框自己关掉、和 React 的状态对不上。
    event.preventDefault()
    event.stopPropagation()
    dismiss()
  }

  const onPointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pointerOnLayerRef.current = event.target === event.currentTarget
  }

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    // 按下和松开都在遮罩上才算点遮罩：在面板里按下、拖到外面松开（选字时常见）不算。
    if (!closeOnBackdrop || event.target !== event.currentTarget || !pointerOnLayerRef.current) return
    dismiss()
  }

  const { title, description, closeLabel, cancel, confirm, footnote, children } = shown
  const hasBody = children !== undefined && children !== null && children !== false
  const confirmType = confirm?.type ?? (onSubmit ? 'submit' : 'button')

  const panelContent = (
    <>
      <div ref={headRef} className="eqb-dialog-head">
        <div className="eqb-dialog-heading">
          <h2 id={titleId} className="eqb-dialog-title">{title}</h2>
          {description ? <p id={descriptionId} className="eqb-dialog-description">{description}</p> : null}
        </div>
        {closeLabel ? (
          <Button
            tone="subtle"
            size="lg"
            className="eqb-dialog-close"
            icon={<X size={16} aria-hidden="true" />}
            label={closeLabel}
            disabled={busy}
            onClick={dismiss}
          />
        ) : null}
      </div>
      {hasBody ? (
        <div ref={bodyRef} className={bodyClassName ? `eqb-dialog-body ${bodyClassName}` : 'eqb-dialog-body'}>
          {children}
        </div>
      ) : null}
      {cancel || confirm || footnote ? (
        <div ref={footRef} className="eqb-dialog-foot">
          {footnote ? <p className="eqb-dialog-footnote">{footnote}</p> : null}
          {cancel || confirm ? (
            <div className="eqb-dialog-actions">
              {cancel ? (
                <Button
                  tone="strong"
                  size="lg"
                  className={cancel.className}
                  disabled={busy || cancel.disabled}
                  busy={cancel.busy}
                  onClick={cancel.onClick ?? dismiss}
                >
                  {cancel.label}
                </Button>
              ) : null}
              {confirm ? (
                <Button
                  type={confirmType}
                  tone={tone === 'alert' ? 'danger' : 'solid'}
                  size="lg"
                  className={confirm.className}
                  disabled={confirm.disabled}
                  busy={confirm.busy}
                  onClick={confirm.onClick}
                >
                  {confirm.label}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )

  return (
    <dialog
      ref={dialogRef}
      className={className ? `eqb-dialog ${className}` : 'eqb-dialog'}
      role={tone === 'alert' ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-tone={tone}
      data-size={size}
      data-placement={placement}
      data-visible={presence.visible}
      onKeyDown={onKeyDown}
      onCancel={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {onSubmit ? (
        <form className="eqb-dialog-panel" onSubmit={onSubmit}>
          {panelContent}
        </form>
      ) : (
        <div className="eqb-dialog-panel">{panelContent}</div>
      )}
    </dialog>
  )
}
