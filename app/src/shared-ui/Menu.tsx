/**
 * 菜单构件：一个触发键 + 一块浮着的菜单面板（构件厂第一批，2026-11-13，提案 · 单一来源）。
 *
 * 样子按 DESIGN.md §5 圆角细则：下拉菜单 8px，内边距 4px，菜单项 4px（同心）；
 * 浮着的东西用 e3 影子，不加边线（§4「一条边，不画两条」）。清点时站上的菜单面板
 * 有 12px 和 8px 两种圆角，这里取规范写明的 8px。
 *
 * 行为照搬站上做得最全的一份 ConciergeGroupRowMenu（2026-09-04 123e0f0bf）：
 * - 一次只开一个菜单，开新的会关掉旧的；
 * - 打开后焦点落到第一项；↑ ↓ Home End 在项之间走，跳过禁用项；
 * - Esc、Tab、选中一项：关上，焦点回到触发键；
 * - 点外面、外面滚动：关上，焦点不抢；
 * - 面板挂在 body 上，贴着触发键放，下面放不下就翻到上面，左右不出屏。
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { FluidHoverList } from '../components/FluidHoverList.tsx'
import { Ellipsis } from '../icons'
import { Button, type ButtonSize, type ButtonTone } from './Button.tsx'
import './menu.css'

export type MenuAction = {
  key: string
  label: string
  icon?: ReactNode
  /** 危险项：字一直是危险色。 */
  tone?: 'danger'
  disabled?: boolean
  /** 有 href 时是链接（去别的页），否则是按钮。 */
  href?: string
  onSelect?: () => void
}

export type MenuSeparator = { key: string; separator: true }

export type MenuEntry = MenuAction | MenuSeparator

export type MenuProps = {
  items: MenuEntry[]
  /** 触发键的读屏名字；只有图标时也是它的名字。 */
  label: string
  /** 触发键上显示的字。不给就只显示图标（默认「…」）。 */
  triggerText?: ReactNode
  triggerIcon?: ReactNode
  triggerTone?: ButtonTone
  triggerSize?: ButtonSize
  /** 面板和触发键哪一边对齐：end 右边对齐（默认），start 左边对齐。 */
  align?: 'start' | 'end'
  className?: string
}

let activeCloser: (() => void) | null = null

function claimMenu(close: () => void): void {
  if (activeCloser && activeCloser !== close) activeCloser()
  activeCloser = close
}

function releaseMenu(close: () => void): void {
  if (activeCloser === close) activeCloser = null
}

const isSeparator = (entry: MenuEntry): entry is MenuSeparator => 'separator' in entry

const GUTTER = 8
const OFFSET = 4

export function Menu({
  items,
  label,
  triggerText,
  triggerIcon,
  triggerTone = 'subtle',
  triggerSize = 'sm',
  align = 'end',
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLElement>(null)
  const menuId = useId()

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeAndRestore = () => close(true)
    claimMenu(closeAndRestore)

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAndRestore()
      }
    }
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    const focusFrame = requestAnimationFrame(() => {
      enabledItems(menuRef.current)[0]?.focus({ preventScroll: true })
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      releaseMenu(closeAndRestore)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
    // close 每次渲染都是新函数，但只读 ref 和 setOpen，不需要跟着重挂监听。
  }, [open])

  useLayoutEffect(() => {
    const menu = menuRef.current
    const trigger = triggerRef.current
    if (!open || !menu || !trigger) return
    const place = () => {
      const rect = trigger.getBoundingClientRect()
      const { width, height } = menu.getBoundingClientRect()
      const below = rect.bottom + OFFSET
      const fitsBelow = below + height <= window.innerHeight - GUTTER
      const top = fitsBelow ? below : rect.top - height - OFFSET
      const left = align === 'end' ? rect.right - width : rect.left
      menu.dataset.side = fitsBelow ? 'below' : 'above'
      menu.style.top = `${Math.max(GUTTER, Math.min(top, window.innerHeight - height - GUTTER))}px`
      menu.style.left = `${Math.max(GUTTER, Math.min(left, window.innerWidth - width - GUTTER))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(menu)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, align])

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (open) close(false)
    else setOpen(true)
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const list = enabledItems(menuRef.current)
    if (list.length === 0) return
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move = (next: number) => {
      event.preventDefault()
      list[(next + list.length) % list.length].focus()
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index < 0 ? -1 : index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(list.length - 1)
    else if (event.key === 'Tab') {
      event.preventDefault()
      close(true)
    }
  }

  if (items.length === 0) return null

  const triggerProps = {
    ref: triggerRef,
    tone: triggerTone,
    size: triggerSize,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: toggle,
  }

  return (
    <>
      {triggerText === undefined ? (
        <Button {...triggerProps} icon={triggerIcon ?? <Ellipsis size={16} aria-hidden="true" />} label={label} />
      ) : (
        <Button {...triggerProps} icon={triggerIcon}>
          {triggerText}
        </Button>
      )}
      {open &&
        createPortal(
          <FluidHoverList
            as="div"
            ref={menuRef}
            id={menuId}
            className={className ? `eqb-menu ${className}` : 'eqb-menu'}
            itemSelector=".eqb-menu-item:not([aria-disabled='true'])"
            role="menu"
            aria-label={label}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((entry) => {
              if (isSeparator(entry)) return <div key={entry.key} className="eqb-menu-separator" role="separator" />
              const common = {
                className: 'eqb-menu-item',
                role: 'menuitem',
                'data-tone': entry.tone,
                'aria-disabled': entry.disabled || undefined,
                tabIndex: -1,
              }
              const body = (
                <>
                  {entry.icon}
                  <span className="eqb-menu-item-label">{entry.label}</span>
                </>
              )
              if (entry.href && !entry.disabled) {
                return (
                  <a
                    key={entry.key}
                    {...common}
                    href={entry.href}
                    onClick={() => {
                      entry.onSelect?.()
                      close(true)
                    }}
                  >
                    {body}
                  </a>
                )
              }
              return (
                <button
                  key={entry.key}
                  type="button"
                  {...common}
                  onClick={() => {
                    if (entry.disabled) return
                    entry.onSelect?.()
                    close(true)
                  }}
                >
                  {body}
                </button>
              )
            })}
          </FluidHoverList>,
          document.body,
        )}
    </>
  )
}

function enabledItems(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(".eqb-menu-item:not([aria-disabled='true'])")] : []
}
