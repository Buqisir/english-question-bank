/**
 * 菜单构件：一个触发键 + 一块浮着的菜单面板（构件厂第一批，2026-11-13，提案 · 单一来源）。
 *
 * 样子按 DESIGN.md §5 圆角细则：下拉菜单 8px，内边距 4px，菜单项 4px（同心）；
 * 浮着的东西用 e3 影子，不加边线（§4「一条边，不画两条」）。清点时站上的菜单面板
 * 有 12px 和 8px 两种圆角，这里取规范写明的 8px。
 *
 * 行为照搬站上做得最全的一份 ConciergeGroupRowMenu（2026-09-04 123e0f0bf）：
 * - 一次只开一个菜单，开新的会关掉旧的；
 * - 打开后焦点落到第一个可用项；↑ ↓ Home End 在项之间走（禁用项也停，见文末 Owner 2026-11-14）；
 * - Esc、Tab、选中一项：关上，焦点回到触发键；
 * - 点外面、外面滚动：关上，焦点不抢；
 * - 面板挂在 body 上，贴着触发键放，下面放不下就翻到上面，左右不出屏。
 *
 * 换首页和个人空间的行菜单时（构件厂第 4 步第四页）补了四样，都是那两处原来就有的：
 * - onSelect 拿到点击事件和触发键：链接项要 preventDefault 走站内跳转（首页「详情」），
 *   打开确认框的项要把触发键交给确认框，关了以后焦点回到它（个人空间「删除文件」）；
 * - restoreFocus：选中后焦点回不回触发键，默认回；打开对话框的项设 false，焦点交给对话框；
 * - data：项上的 data-* 属性（首页的 data-ra-entry / data-ra-group-id，阅读解析入口统计用）；
 * - triggerClassName、triggerDisabled：触发键的选择器钩子和禁用（个人空间文件下载中禁用）。
 *
 * 换个人空间页时（第六页）补了 gapClick：原来个人空间的菜单关掉了「点项和项之间、面板边上的空隙也算点最近那一项」
 * （FluidHoverList 默认开着），第四页换菜单时漏了，这里补回来。默认照旧开着，别处的菜单不变。
 *
 * Owner 2026-11-14 决定 #15 补了可勾选项 checked：给了 checked（true / false）的项读屏角色是
 * menuitemcheckbox，带 aria-checked；字不变，勾上时最右边画一个勾（图标库的 Check）。
 * 键盘和别的项一样，选中照旧关菜单。可勾选项总是按钮，不当链接。
 *
 * 走查卡点 4（Owner 2026-11-14 第四节第 4 条，草稿卷「PDF 版本」）补了 description：项下面一行小字，
 * 用来写这一项为什么用不了。给了的项变两行高，小字用 aria-describedby 挂在项上；
 * 项的名字用 aria-labelledby 只指名字那一段，免得小字既算名字又算描述、读屏念两遍。
 *
 * Owner 2026-11-14 定：禁用项也能停焦点（照 WAI-ARIA APG 菜单模式，禁用项可聚焦），读屏走得到
 * 置灰项、念得出「不可用」（aria-disabled="true"，不用会让焦点到不了的 disabled 属性）和挂着的原因小字。
 * - ↑ ↓ Home End、首字母跳转都会停在禁用项上；
 * - 首字母跳转：按一个字（字母不分大小写），焦点跳到当前项之后、名字以这个字开头的下一项，到底绕回；
 * - 禁用项仍然不能选：回车、空格、点击都不触发 onSelect，菜单也不关；
 * - 打开时焦点仍落在第一个可用项；整个菜单都禁用时落在第一项（焦点总在菜单里，Esc、Tab 照常关）。
 *
 * 字段构件（OptionField.tsx 的带原因下拉，2026-11-14）补了两样，别的菜单不受影响：
 * - renderTrigger：触发键由调用处画（拿到 ref、aria-haspopup、aria-expanded、aria-controls、disabled、onClick），
 *   用来把触发键画成字段的样子（不是 .eqb-button，不进顶栏 FluidHoverList 的滑块，也不吃 button.css 的悬停底）。
 * - focusChecked：打开时焦点先落在勾着的那一项（下拉选值的习惯：打开就停在当前值上）；勾着的那项用不了时照旧落第一个可用项。
 *   题组「⋯」里的「前置分页」也是勾选项，但那里不该打开就停在它上面，所以默认关。
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
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { FluidHoverList } from '../components/FluidHoverList.tsx'
import { Check, Ellipsis } from '../icons'
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
  /** event 是项上的点击；trigger 是触发键（菜单关上以前取的）。 */
  onSelect?: (event: MouseEvent<HTMLElement>, trigger: HTMLButtonElement | null) => void
  /** 选中后焦点回触发键，默认 true。项会打开对话框时设 false，焦点交给对话框。 */
  restoreFocus?: boolean
  /** 项上的 data-* 属性。 */
  data?: Record<`data-${string}`, string | undefined>
  /** 可勾选项：给了就是 menuitemcheckbox，true 时画勾。字保持不变，状态只看勾。 */
  checked?: boolean
  /** 项下面一行小字，比如这一项为什么用不了。禁用项上也照常显示，字不变淡。 */
  description?: string
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
  /** 挂在触发键上的类名，只当选择器钩子用。 */
  triggerClassName?: string
  triggerDisabled?: boolean
  /** 面板和触发键哪一边对齐：end 右边对齐（默认），start 左边对齐。 */
  align?: 'start' | 'end'
  className?: string
  /** 点面板空隙算不算点最近那一项（FluidHoverList 的 gapClick）。默认算；有危险项、不想误触时设 false。 */
  gapClick?: boolean
  /** 触发键由调用处画。给了它，triggerText、triggerIcon、triggerTone、triggerSize、triggerClassName 都不用。 */
  renderTrigger?: (trigger: MenuTriggerProps) => ReactNode
  /** 打开时焦点先落在勾着的那一项（可用时）。默认 false。 */
  focusChecked?: boolean
}

export type MenuTriggerProps = {
  ref: Ref<HTMLButtonElement>
  disabled?: boolean
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
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
  triggerClassName,
  triggerDisabled,
  align = 'end',
  className,
  gapClick,
  renderTrigger,
  focusChecked = false,
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
      const root = menuRef.current
      const checked = focusChecked ? enabledItems(root).find((item) => item.getAttribute('aria-checked') === 'true') : undefined
      ;(checked ?? enabledItems(root)[0] ?? allItems(root)[0])?.focus({ preventScroll: true })
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
    // 禁用项也在里面：方向键、Home、End、首字母跳转都能停在它上面（Owner 2026-11-14）。
    const list = allItems(menuRef.current)
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
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // 首字母跳转：从当前项的下一项往后找，到底绕回；找不到就不动。
      const char = event.key.toLocaleLowerCase()
      for (let step = 1; step <= list.length; step += 1) {
        const next = (index + step) % list.length
        if (itemLabel(list[next]).startsWith(char)) {
          move(next)
          break
        }
      }
    }
  }

  if (items.length === 0) return null

  const triggerProps = {
    ref: triggerRef,
    className: triggerClassName,
    disabled: triggerDisabled,
    tone: triggerTone,
    size: triggerSize,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: toggle,
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({
          ref: triggerRef,
          disabled: triggerDisabled,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? menuId : undefined,
          onClick: toggle,
        })
      ) : triggerText === undefined ? (
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
            gapClick={gapClick}
            role="menu"
            aria-label={label}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((entry) => {
              if (isSeparator(entry)) return <div key={entry.key} className="eqb-menu-separator" role="separator" />
              const select = (event: MouseEvent<HTMLElement>) => {
                entry.onSelect?.(event, triggerRef.current)
                close(entry.restoreFocus !== false)
              }
              const noteId = entry.description ? `${menuId}-${entry.key}-note` : undefined
              // 带小字的项：名字只取名字那一段（aria-labelledby），不然按钮的名字会把小字也算进去，
              // 读屏念名字时念一遍原因、念描述时再念一遍。
              const labelId = noteId ? `${menuId}-${entry.key}-label` : undefined
              const common = {
                ...entry.data,
                className: 'eqb-menu-item',
                role: 'menuitem',
                'data-tone': entry.tone,
                'aria-disabled': entry.disabled || undefined,
                'aria-labelledby': labelId,
                'aria-describedby': noteId,
                'data-has-note': noteId ? '' : undefined,
                tabIndex: -1,
                // 可勾选项换成 menuitemcheckbox，盖掉上面的 menuitem。
                ...(entry.checked !== undefined
                  ? { role: 'menuitemcheckbox', 'aria-checked': entry.checked }
                  : null),
              }
              const body = (
                <>
                  {entry.icon}
                  {noteId ? (
                    <span className="eqb-menu-item-text">
                      <span id={labelId} className="eqb-menu-item-label">{entry.label}</span>
                      <span id={noteId} className="eqb-menu-item-note">{entry.description}</span>
                    </span>
                  ) : (
                    <span className="eqb-menu-item-label">{entry.label}</span>
                  )}
                  {entry.checked && <Check className="eqb-menu-item-check" size={16} aria-hidden="true" />}
                </>
              )
              if (entry.href && !entry.disabled && entry.checked === undefined) {
                return (
                  <a
                    key={entry.key}
                    {...common}
                    href={entry.href}
                    onClick={select}
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
                  onClick={(event) => {
                    if (!entry.disabled) select(event)
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

function allItems(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>('.eqb-menu-item')] : []
}

function enabledItems(root: HTMLElement | null): HTMLElement[] {
  return allItems(root).filter((item) => item.getAttribute('aria-disabled') !== 'true')
}

function itemLabel(item: HTMLElement): string {
  return (item.querySelector('.eqb-menu-item-label')?.textContent ?? '').trim().toLocaleLowerCase()
}
