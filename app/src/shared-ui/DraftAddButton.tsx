/**
 * 加入键：把一个题组加入草稿卷，全站一个写法（走查第四节第 6 条，Owner 2026-11-14；
 * 设计记录 design/ux-2026-11-14/find-compose-export/fix-added/README.md）。
 *
 * 照 BRAND.md §5.5「提议是轻的，决定是实的」和 DESIGN.md §5「Proposal → Decision」：
 * - 加入前：一个 Button，「加入草稿卷」（行上用紧凑档，只有加号，读屏名字「加入草稿卷」）。
 * - 加入中：同一个键，字不换、宽度不变，点了不再触发、读屏念「忙」（Button 的 busy）；过了 300ms 门槛加号换成所以点
 *   （DESIGN.md §5「Waiting 等待」，2026-11-15 起；原来是键上改写「加入中…」、紧凑档加入中展开成带字的键）。
 * - 加入后：键换成一块纸——白底、e1、墨字「已加入」（底、边、字三处一起变，不用薄荷绿、不加侧边线）。
 *   「已加入」是个链接（读屏名「已加入，打开草稿卷」），点了打开草稿卷工作台并定位到这一组
 *   （Owner 2026-11-14 第二轮：恢复改之前「再点一下」的去处）。去草稿卷是换地址（?view=draft-paper），所以用 <a>，
 *   能中键开新标签、能复制地址；普通左键点在本页里切过去，不整页刷新。
 *   这一次在这里加的，纸里右边带「撤回」（淡墨文字键），点了把刚加的那一条从草稿卷移除，回到加入前。
 *   本来就在草稿卷里的（进页面时就是），只有「已加入」，不出撤回。
 * - 出错：键后面一行次要灰字加 16px 图标，写「加入草稿卷没成功，可以再试一次。」「撤回没成功，可以再试一次。」（describeError）。
 *   原始报错只进 console，不给老师看（和草稿卷同一条，verify-error-copy-mainline；Owner 2026-11-16 定收紧）。
 * - 键盘：在键上按回车加入后，焦点落到「撤回」，不落到「已加入」：多按一下回车顶多撤回（原地、一步能再加回来），
 *   不会跳去草稿卷（跳走了这一页的撤回也就没了）。Shift+Tab 回到「已加入」。没有撤回时（拿不到刚加的那一条）落到「已加入」。
 *   撤回后焦点回到加入键。
 *
 * 加入、撤回两件事从 DraftAddContext 拿（App 提供）。
 */

import { useContext, useEffect, useRef, useState, type MouseEvent } from 'react'
import { AlertTriangle, Plus } from '../icons'
import { Button, type ButtonSize, type ButtonTone } from './Button.tsx'
import { describeError } from '../features/shared/errorCopy'
import { DraftAddContext, type DraftAddActions, type DraftAddReceipt } from './draftAddContext.ts'
import './draftAddButton.css'

/** 题组卡片（QuestionGroupCard）和详情（QuestionGroupDetail）上与加入有关的几项。 */
export type DraftAddTarget = {
  id: string
  currentDraftPaperId?: string | null
  draftPaperButtonState?: 'add' | 'in_current_draft' | 'disabled'
  canAddToDraftPaper?: boolean
  printUnavailableReason?: string | null
}

export type DraftAddButtonProps = {
  target: DraftAddTarget
  /** 加入前那个键的语气。详情页是那一页唯一的主键，用 primary；别处用 strong。 */
  tone?: ButtonTone
  size?: ButtonSize
  /** 紧凑档：加入前、加入中只有加号（首页结果行；加入中加号换成所以点）。加入后照样是「已加入」那块纸。 */
  compact?: boolean
  className?: string
}

export function DraftAddButton({ target, tone = 'strong', size = 'md', compact = false, className }: DraftAddButtonProps) {
  const actions = useContext(DraftAddContext)
  const [busy, setBusy] = useState<'adding' | 'undoing' | null>(null)
  const [receipt, setReceipt] = useState<DraftAddReceipt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const wrapRef = useRef<HTMLSpanElement>(null)
  const mainRef = useRef<HTMLButtonElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef<HTMLAnchorElement>(null)
  // 键换了样子以后焦点该去哪（只在点之前焦点就在这个加入键里时才挪）。
  const focusNextRef = useRef<'main' | 'undo' | 'open' | null>(null)

  useEffect(() => {
    const next = focusNextRef.current
    if (!next) return
    const element = next === 'undo' ? undoRef.current : next === 'open' ? openRef.current : mainRef.current
    // 停用的键接不住焦点；等下一次渲染换成能点的键再挪过去。
    if (element && !(element instanceof HTMLButtonElement && element.disabled)) {
      focusNextRef.current = null
      element.focus()
    }
  })

  if (!actions) throw new Error('DraftAddButton 要放在 DraftAddContext.Provider 里')
  const draftAdd: DraftAddActions = actions

  const state = target.draftPaperButtonState ?? 'add'
  const added = state === 'in_current_draft'
  const unavailable = state === 'disabled' || (!added && target.canAddToDraftPaper === false)
  const undoable = added && receipt !== null && receipt.groupId === target.id && receipt.itemId !== null
  const showPaper = added && busy !== 'adding'

  const hasFocus = () => Boolean(wrapRef.current?.contains(document.activeElement))

  async function handleAdd() {
    const hadFocus = hasFocus()
    setError(null)
    setReceipt(null)
    setAnnouncement('')
    setBusy('adding')
    try {
      const next = await draftAdd.add(target.id)
      setReceipt(next)
      setAnnouncement('已加入草稿卷')
      if (hadFocus) focusNextRef.current = next.itemId !== null ? 'undo' : 'open'
    } catch (addError) {
      setError(describeError('加入草稿卷', addError))
      if (hadFocus) focusNextRef.current = 'main'
    } finally {
      setBusy(null)
    }
  }

  async function handleUndo() {
    if (!receipt) return
    const hadFocus = hasFocus()
    setError(null)
    setAnnouncement('')
    setBusy('undoing')
    try {
      await draftAdd.undo(receipt)
      setReceipt(null)
      setAnnouncement('已从草稿卷移出')
      if (hadFocus) focusNextRef.current = 'main'
    } catch (undoError) {
      setError(describeError('撤回', undoError))
    } finally {
      setBusy(null)
    }
  }

  // 去哪一份草稿卷：这一次加的用回执上的，本来就在的用题组上的；都没有时只带 view，工作台自己开当前草稿卷。
  const draftPaperId = receipt?.draftPaperId ?? target.currentDraftPaperId ?? null

  function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    // 中键、带修饰键的点（新标签、新窗口、下载）交给浏览器照 href 去。
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    draftAdd.openDraft(draftPaperId, target.id)
  }

  let control
  if (showPaper) {
    control = (
      <span className="eqb-draft-add-paper" data-size={size}>
        <a
          ref={openRef}
          className="eqb-draft-add-open"
          href={draftAdd.draftHref(draftPaperId, target.id)}
          aria-label="已加入，打开草稿卷"
          title="打开草稿卷"
          onClick={handleOpen}
        >
          已加入
        </a>
        {undoable && (
          <Button
            ref={undoRef}
            tone="quiet"
            size="sm"
            className="eqb-draft-add-undo"
            busy={busy === 'undoing'}
            onClick={() => void handleUndo()}
          >
            撤回
          </Button>
        )}
      </span>
    )
  } else if (unavailable) {
    control = (
      <Button ref={mainRef} tone={tone} size={size} disabled title={target.printUnavailableReason ?? undefined}>
        暂不可组卷
      </Button>
    )
  } else if (compact) {
    control = (
      <Button
        ref={mainRef}
        tone={tone}
        size={size}
        icon={<Plus size={16} aria-hidden="true" />}
        label="加入草稿卷"
        title="加入草稿卷"
        busy={busy === 'adding'}
        onClick={() => void handleAdd()}
      />
    )
  } else {
    control = (
      <Button
        ref={mainRef}
        tone={tone}
        size={size}
        icon={<Plus size={16} aria-hidden="true" />}
        busy={busy === 'adding'}
        onClick={() => void handleAdd()}
      >
        加入草稿卷
      </Button>
    )
  }

  return (
    <span
      ref={wrapRef}
      className={className ? `eqb-draft-add ${className}` : 'eqb-draft-add'}
      data-draft-add={busy ?? (showPaper ? 'added' : unavailable ? 'unavailable' : 'idle')}
    >
      {control}
      {error && (
        <span className="eqb-draft-add-error" role="alert" title={error}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="eqb-draft-add-error-text">{error}</span>
        </span>
      )}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </span>
  )
}
