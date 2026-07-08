import type { ReactNode } from 'react'
import { Archive, ArrowLeft, LogOut, Tag } from 'lucide-react'

export type AppTopbarNav = {
  user: { username: string } | null
  onLogout: () => void
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
  children?: ReactNode
}

export function AppTopbar(props: AppTopbarProps): ReactNode {
  const variant = props.variant ?? 'sub'
  return (
    <header className={variant === 'home' ? 'topbar' : 'topbar topbar-sub'}>
      <div className="topbar-brand">
        {props.onBack && (
          <button className="ghost-button topbar-back" type="button" onClick={props.onBack}>
            <ArrowLeft size={16} /> 返回找题
          </button>
        )}
        {variant === 'home' ? (
          <div>
            <p className="eyebrow">English Question Bank</p>
            <h1>英语题库工作台</h1>
          </div>
        ) : (
          <div className="topbar-brand-compact">
            <button
              className="topbar-wordmark"
              type="button"
              onClick={props.onBack}
              disabled={!props.onBack}
            >
              英语题库工作台
            </button>
            {props.pageTitle && <span className="topbar-page-title">{props.pageTitle}</span>}
          </div>
        )}
      </div>
      {props.children && <div className="topbar-tools">{props.children}</div>}
      <div className="topbar-actions">
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
            <Tag size={16} />
            {props.adminActive ? '退出管理' : '管理'}
          </button>
        )}
        {props.user && (
          <span className="topbar-user-group">
            <span className="topbar-username">{props.user.username}</span>
            <button className="ghost-button" type="button" onClick={props.onLogout}>
              <LogOut size={16} />
              退出
            </button>
          </span>
        )}
      </div>
    </header>
  )
}
