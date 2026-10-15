import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Archive, ArrowLeft, BookMarked, VocabularyNotebook, LogOut, Pencil, Settings } from '../icons'
import { FluidHoverList } from './FluidHoverList.tsx'

function userInitials(username: string): string {
  return username.slice(0, 2)
}

/* BRAND.md §3.1: the logo mark is drawn at 20px tall. On 1x screens the
   hand-placed 32-grid pixel version is crisper than the scaled-down vector;
   2x and above get the vector. Decorative: the site name beside it is the
   accessible label. */
function BrandMark(): ReactNode {
  return (
    <img
      className="topbar-brand-mark"
      src="/brand/mark-32.png"
      srcSet="/brand/mark-32.png 1x, /brand/mark.svg 2x"
      width={32}
      height={20}
      alt=""
      aria-hidden="true"
    />
  )
}

/* ui-shell-unify CR MF-1 disposition: the topbar deliberately does NOT
   carry page workspace tools. Tool-heavy pages (draft workbench) keep
   their own sticky tool card below the shell bar so tools stay near the
   content while scrolling; the shell bar stays uniform across pages.
   workbench-header-unify (2026-07-14): draft workbench retired that sticky
   tool card and moved into this bar instead — see `actionsSlot` /
   `pageTitleEditable` below. Both are opt-in props; every other sub page
   passes neither and renders byte-identical to before this cut. */

export type AppTopbarNav = {
  user: { username: string } | null
  onLogout: () => void
  onOpenVocabularyReview?: () => void
  onOpenVocabularyNotebook?: () => void
  onOpenMySpace?: () => void
  showAdmin?: boolean
  adminActive?: boolean
  onToggleAdmin?: () => void
}

export type AppTopbarProps = AppTopbarNav & {
  variant?: 'home' | 'sub'
  /* Sub pages: current page context shown next to the wordmark
     (e.g. 草稿卷 / 个人空间 / 卷名 · 题组名). */
  pageTitle?: string
  /* Sub pages: navigate back to the find-questions home. The label is
     fixed to 返回找题 across the whole app; the wordmark uses the same
     handler. */
  onBack?: () => void
  /* home-blank 硬契约 — 词标: the home list view (静止/浏览态, both) moves
     the wordmark into ConciergeDesk's centered stage and hides this bar's
     left brand block instead. Detail view and every sub page pass this as
     false/undefined — zero visual change there. */
  hideBrand?: boolean
  /* workbench-header-unify Locked Decision 2: opts pageTitle into
     click-to-edit (hover reveals a pencil hint, click swaps to an input,
     blur/Enter commits via onPageTitleChange, Escape cancels). AppTopbar
     only owns the uncommitted edit buffer — it holds zero business logic
     about what a "title" means or how it persists; the caller's callback
     is the existing save path (e.g. draft workbench's `updateTitle`). */
  pageTitleEditable?: boolean
  onPageTitleChange?: (nextTitle: string) => void
  /** Optional document status, kept beside its title rather than in a menu. */
  pageStatus?: ReactNode
  /* workbench-header-unify Locked Decision 2/5: page-owned action controls
     (e.g. draft workbench's ⋯ menu / 学生版·教师版 / A4·A3 / 导出), rendered
     verbatim in the actions row before the global actions with a divider.
     AppTopbar does not interpret this content. undefined (every page but
     the draft workbench) = no divider, no extra markup, zero change. */
  actionsSlot?: ReactNode
}

export function AppTopbar(props: AppTopbarProps): ReactNode {
  const variant = props.variant ?? 'sub'
  const [editingTitle, setEditingTitle] = useState(false)
  // Uncommitted edit buffer — only meaningful while editingTitle is true.
  // Seeded from props.pageTitle at the moment editing starts (startTitleEdit
  // below), not synced continuously, so this never needs a setState-in-effect
  // to stay caught up with an external prop (react-hooks/set-state-in-effect).
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  function startTitleEdit() {
    setTitleDraft(props.pageTitle ?? '')
    setEditingTitle(true)
  }

  function commitTitleEdit() {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== props.pageTitle) {
      props.onPageTitleChange?.(next)
    }
  }

  function cancelTitleEdit() {
    setEditingTitle(false)
  }

  return (
    <header className={variant === 'home' ? 'topbar' : 'topbar topbar-sub'}>
      <div className="topbar-brand">
        {props.onBack && variant === 'sub' && (
          <button className="topbar-back" type="button" onClick={props.onBack}>
            <ArrowLeft size={16} /> 返回找题
          </button>
        )}
        {variant === 'home' ? (
          !props.hideBrand && (
            <div className="topbar-identity">
              <BrandMark />
              <span className="topbar-brand-title">英语题库工作台</span>
            </div>
          )
        ) : (
          <div className="topbar-identity">
            <BrandMark />
            <span className="topbar-brand-title">英语题库工作台</span>
            {props.pageTitleEditable ? (
              editingTitle ? (
                <>
                  {props.pageTitle && <span className="topbar-page-sep" aria-hidden="true">·</span>}
                  <input
                    ref={titleInputRef}
                    className="topbar-page-title-input"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitTitleEdit()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelTitleEdit()
                      }
                    }}
                    aria-label="草稿卷标题"
                  />
                </>
              ) : (
                props.pageTitle && (
                  <>
                    <span className="topbar-page-sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="topbar-page-title topbar-page-title-editable"
                      onClick={startTitleEdit}
                      title="点击编辑标题"
                    >
                      {props.pageTitle}
                      <Pencil aria-hidden="true" className="topbar-page-title-pencil" size={12} />
                    </button>
                  </>
                )
              )
            ) : (
              props.pageTitle && (
                <>
                  <span className="topbar-page-sep" aria-hidden="true">·</span>
                  <span className="topbar-page-title">{props.pageTitle}</span>
                </>
              )
            )}
            {props.pageStatus}
          </div>
        )}
      </div>
      <FluidHoverList as="div" axis="x" className="topbar-actions" itemSelector=".ghost-button" gapClick={false}>
        {props.actionsSlot && (
          <>
            <span className="topbar-actions-page">{props.actionsSlot}</span>
            <span aria-hidden="true" className="topbar-actions-divider" />
          </>
        )}
        {props.onOpenVocabularyNotebook && (
          <button className="ghost-button" type="button" onClick={props.onOpenVocabularyNotebook}>
            <VocabularyNotebook size={16} />
            生词本
          </button>
        )}
        {props.onOpenVocabularyReview && (
          <button className="ghost-button" type="button" onClick={props.onOpenVocabularyReview}>
            <BookMarked size={16} />
            过生词
          </button>
        )}
        {props.onOpenMySpace && (
          <button className="ghost-button" type="button" onClick={props.onOpenMySpace}>
            <Archive size={16} />
            个人空间
          </button>
        )}
        {props.showAdmin && props.onToggleAdmin && (
          <button
            className="ghost-button"
            type="button"
            onClick={props.onToggleAdmin}
            aria-pressed={props.adminActive}
          >
            <Settings size={16} variant={props.adminActive ? 'fill' : 'line'} />
            {props.adminActive ? '退出管理' : '管理'}
          </button>
        )}
        {props.user && (
          <span className="topbar-user-group">
            <span className="topbar-avatar" aria-hidden="true">
              {userInitials(props.user.username)}
            </span>
            <span className="topbar-username">{props.user.username}</span>
            <button className="ghost-button" type="button" onClick={props.onLogout}>
              <LogOut size={16} />
              退出
            </button>
          </span>
        )}
      </FluidHoverList>
    </header>
  )
}
