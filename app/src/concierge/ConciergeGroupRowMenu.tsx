/**
 * Always-visible 「…」 menu for a concierge passage row.
 * One menu open at a time. Closes on Esc, outside click, item activation,
 * or scroll; focus returns to the trigger on Esc and activation.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

export type ConciergeGroupRowMenuItem = {
  key: string
  label: string
  icon: ReactNode
  tone?: 'danger'
  href?: string
  onSelect?: () => void
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  dataRaEntry?: string
  dataRaGroupId?: string
}

let activeCloser: (() => void) | null = null

function claimMenu(close: () => void): void {
  if (activeCloser && activeCloser !== close) activeCloser()
  activeCloser = close
}

function releaseMenu(close: () => void): void {
  if (activeCloser === close) activeCloser = null
}

export function ConciergeGroupRowMenu(props: {
  items: ConciergeGroupRowMenuItem[]
  ariaLabel?: string
}): ReactNode {
  const { items, ariaLabel = '更多操作' } = props
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = (restoreFocus = true) => {
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
    const onScroll = () => {
      setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    })

    return () => {
      releaseMenu(closeAndRestore)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const placeMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (open) {
      close(false)
      return
    }
    placeMenu()
    setOpen(true)
  }

  const itemNodes = (root: HTMLElement | null) =>
    root ? [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')] : []

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = itemNodes(menuRef.current)
    if (list.length === 0) return
    const index = list.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      list[(index + 1 + list.length) % list.length].focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      list[(index - 1 + list.length) % list.length].focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      list[0].focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      list[list.length - 1].focus()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      close(true)
    }
  }

  const activate = (item: ConciergeGroupRowMenuItem) => {
    item.onSelect?.()
    close(true)
  }

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="concierge-group-row-icon"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="concierge-group-row-menu"
            role="menu"
            style={{ top: coords.top, right: coords.right }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) =>
              item.href ? (
                <a
                  key={item.key}
                  className={`concierge-group-row-menuitem${item.tone === 'danger' ? ' concierge-group-row-menuitem--danger' : ''}`}
                  role="menuitem"
                  href={item.href}
                  data-ra-entry={item.dataRaEntry}
                  data-ra-group-id={item.dataRaGroupId}
                  onClick={(event) => {
                    event.stopPropagation()
                    item.onClick?.(event)
                    close(true)
                  }}
                >
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  className={`concierge-group-row-menuitem${item.tone === 'danger' ? ' concierge-group-row-menuitem--danger' : ''}`}
                  role="menuitem"
                  data-ra-entry={item.dataRaEntry}
                  data-ra-group-id={item.dataRaGroupId}
                  onClick={(event) => {
                    event.stopPropagation()
                    activate(item)
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
