/**
 * 加入键：把一个题组加入草稿卷，全站一个写法（走查第四节第 6 条，Owner 2026-11-14；
 * 设计记录 design/ux-2026-11-14/find-compose-export/fix-added/README.md）。
 *
 * 照 BRAND.md §5.5「提议是轻的，决定是实的」和 DESIGN.md §5「Proposal → Decision」：
 * - 加入前：一个 Button，「加入草稿卷」（行上用紧凑档，只有加号，读屏名字「加入草稿卷」）。
 * - 加入中：同一个键上写「加入中…」，点了不再触发（Button 的 busy）。
 * - 加入后：键换成一块纸——白底、e1、墨字「已加入」（底、边、字三处一起变，不用薄荷绿、不加侧边线）。
 *   这一次在这里加的，纸里右边带「撤回」（淡墨文字键），点了把刚加的那一条从草稿卷移除，回到加入前。
 *   本来就在草稿卷里的（进页面时就是），只有「已加入」，不出撤回。
 * - 出错：键后面一行次要灰字加 16px 图标，「没加入：」「没撤回：」后面照登服务器原话，不另写兜底的话。
 * - 键盘：在键上按回车加入后，焦点落到「撤回」；撤回后焦点回到加入键。
 *
 * 加入、撤回两件事从 DraftAddContext 拿（App 提供）。
 */

import { useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus } from '../icons'
import { Button, type ButtonSize, type ButtonTone } from './Button.tsx'
import { DraftAddContext, type DraftAddActions, type DraftAddReceipt } from './draftAddContext.ts'
import './draftAddButton.css'

/** 题组卡片（QuestionGroupCard）和详情（QuestionGroupDetail）上与加入有关的几项。 */
export type DraftAddTarget = {
  id: string
  draftPaperButtonState?: 'add' | 'in_current_draft' | 'disabled'
  canAddToDraftPaper?: boolean
  printUnavailableReason?: string | null
}

export type DraftAddButtonProps = {
  target: DraftAddTarget
  /** 加入前那个键的语气。详情页是那一页唯一的主键，用 primary；别处用 strong。 */
  tone?: ButtonTone
  size?: ButtonSize
  /** 紧凑档：加入前只有加号（首页结果行）。加入中、加入后照样写字。 */
  compact?: boolean
  className?: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  // 键换了样子以后焦点该去哪（只在点之前焦点就在这个加入键里时才挪）。
  const focusNextRef = useRef<'main' | 'undo' | null>(null)

  useEffect(() => {
    const next = focusNextRef.current
    if (!next) return
    const element = next === 'undo' ? undoRef.current : mainRef.current
    // 停用的键接不住焦点；等下一次渲染换成能点的键再挪过去。
    if (element && !element.disabled) {
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
      if (hadFocus) focusNextRef.current = next.itemId !== null ? 'undo' : null
    } catch (addError) {
      setError(`没加入：${errorText(addError)}`)
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
      setError(`没撤回：${errorText(undoError)}`)
    } finally {
      setBusy(null)
    }
  }

  let control
  if (showPaper) {
    control = (
      <span className="eqb-draft-add-paper" data-size={size}>
        <span className="eqb-draft-add-paper-label">已加入</span>
        {undoable && (
          <Button
            ref={undoRef}
            tone="quiet"
            size="sm"
            className="eqb-draft-add-undo"
            busy={busy === 'undoing'}
            onClick={() => void handleUndo()}
          >
            {busy === 'undoing' ? '撤回中…' : '撤回'}
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
  } else if (compact && busy !== 'adding') {
    control = (
      <Button
        ref={mainRef}
        tone={tone}
        size={size}
        icon={<Plus size={16} aria-hidden="true" />}
        label="加入草稿卷"
        title="加入草稿卷"
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
        {busy === 'adding' ? '加入中…' : '加入草稿卷'}
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
