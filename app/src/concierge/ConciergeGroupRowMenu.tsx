/**
 * Always-visible 「…」 menu for a concierge passage row.
 * One menu open at a time. Closes on Esc, outside click, item activation,
 * or scroll; focus returns to the trigger on Esc and activation.
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
import { Ellipsis } from '../icons'
import { FluidHoverList } from '../components/FluidHoverList.tsx'

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
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    const focusFrame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      releaseMenu(closeAndRestore)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useLayoutEffect(() => {
    const menu = menuRef.current
    const trigger = triggerRef.current
    if (!open || !menu || !trigger) return
    const placeMenu = () => {
      const rect = trigger.getBoundingClientRect()
      const { width, height } = menu.getBoundingClientRect()
      const gutter = 8
      const below = rect.bottom + 4
      const top = below + height <= window.innerHeight - gutter ? below : rect.top - height - 4
      menu.style.top = `${Math.max(gutter, Math.min(top, window.innerHeight - height - gutter))}px`
      menu.style.left = `${Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter))}px`
    }
    placeMenu()
    const observer = new ResizeObserver(placeMenu)
    observer.observe(menu)
    window.addEventListener('resize', placeMenu)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', placeMenu)
    }
  }, [open])

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (open) {
      close(false)
      return
    }
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
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <FluidHoverList
            as="div"
            ref={menuRef}
            id={menuId}
            className="concierge-group-row-menu"
            itemSelector=".concierge-group-row-menuitem"
            role="menu"
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
          </FluidHoverList>,
          document.body,
        )}
    </>
  )
}
