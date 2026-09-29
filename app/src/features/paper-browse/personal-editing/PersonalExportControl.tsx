import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download } from '../../../icons'
import { apiPath } from '../../../services/httpClient'
import { scrollElementToVerticalCenter } from './paperScroll'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

/*
 * 「导出我的批注版」——纸张视图工具条里的导出入口与它的安静提示。按钮和
 * 提示都由 PaperEditingView 经 portal 挂进工具条（版式 layoutId 与 reload
 * 在那里才有），所以这里只渲染 portal，不渲染自己的容器。
 *
 * 导出前先等自动保存落定（session.settle）：断网、保存失败、冲突时阻止导
 * 出并说明下一步，绝不悄悄导出较旧的已保存版本。服务端的 409/422/429 各有
 * 对应的提示；诊断列表的「查看」复用附页跳转的纵向滚动，只选中不弹层。
 */

type ExportSuccess = {
  fileId: string
  downloadUrl: string
  fileName: string
  layerVersion: number
}

type ExportDiagnosticRow = { objectId: string; code: string }

type ExportFailure = Error & { status?: number; code?: string; payload?: { diagnostics?: unknown } | null }

type ExportNotice =
  | { kind: 'blocked'; text: string }
  | { kind: 'success'; version: number }
  | { kind: 'stale-version' }
  | { kind: 'layout-mismatch' }
  | { kind: 'diagnostics'; rows: ExportDiagnosticRow[] }
  | { kind: 'text'; text: string }

/* 自动保存未落定时阻止导出；每种状态对应 PersonalSaveStatus 的同一状态行。 */
const BLOCKED_COPY: Record<string, string> = {
  offline: '还有未保存的修改：网络已断开。恢复连接后再导出',
  failed: '还有未保存的修改：批注保存失败。等自动重试保存成功后再导出',
  conflict: '还有未保存的修改：批注在别处有更新。先解决冲突再导出',
  'auth-paused': '登录已过期，批注还没保存。重新登录后再导出',
  'stale-source': '卷子内容已更新，批注还没同步。刷新页面后再导出',
  rejected: '有批注未被接受。刷新页面后再导出',
  unavailable: '批注还没有就绪，稍后再导出',
  loading: '批注加载中，稍后再导出',
}

const OFFLINE_SAVED_COPY = '网络已断开，恢复连接后再导出'

/* 导出量测遍的逐对象拒绝原因（server/personal-paper-layer/exportPlan.mjs 的 code）。 */
const DIAGNOSTIC_REASON: Record<string, string> = {
  'anchor-unresolved': '找不到对应的原文位置',
  'target-not-in-layout': '这个产品里没有对应的题目',
  'layout-mismatch': '位置属于旧的纸张版式',
  overflow: '内容超出纸张页面',
  'no-space': '纸上没有可用的空位',
}

const OBJECT_LABEL: Record<string, string> = {
  highlight: '高亮',
  underline: '下划线',
  'anchored-note': '旁注',
  'text-box': '文字框',
  commentary: '讲评',
}

function exportStatusOf(error: unknown): string | null {
  return error instanceof Error && typeof (error as { status?: unknown }).status === 'string'
    ? (error as unknown as { status: string }).status
    : null
}

function exportCodeOf(error: unknown): string | null {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as unknown as { code: string }).code
    : null
}

function isExportSuccess(payload: unknown): payload is ExportSuccess {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as Record<string, unknown>
  return typeof value.fileId === 'string'
    && typeof value.downloadUrl === 'string'
    && typeof value.fileName === 'string'
    && typeof value.layerVersion === 'number'
}

function isDiagnosticRow(value: unknown): value is ExportDiagnosticRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.objectId === 'string' && typeof row.code === 'string'
}

/* Same-origin attachment: the anchor click honors the server's
 * Content-Disposition, so the file name stays the server's single source. */
function triggerDownload(downloadUrl: string): void {
  const link = document.createElement('a')
  link.href = apiPath(downloadUrl)
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function PersonalExportControl({
  api,
  paperId,
  layoutId,
  sourceRevision,
  reloadLayout,
  buttonTarget,
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  paperId: string
  layoutId: string
  sourceRevision: string
  reloadLayout: () => void
  buttonTarget: HTMLElement | null
  noticeTarget: HTMLElement | null
}): ReactNode {
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<ExportNotice | null>(null)
  // 诊断浮层关闭后焦点回到导出按钮（浮层本身不吃焦点）。
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const blockFor = useCallback((status: string | null) => {
    setNotice({ kind: 'blocked', text: BLOCKED_COPY[status ?? ''] ?? '还有未保存的修改，保存成功后再导出' })
  }, [])

  const postExport = useCallback(async (layerVersion: number): Promise<ExportSuccess> => {
    let response: Response
    try {
      response = await fetch(apiPath(`/api/personal-paper-layers/${encodeURIComponent(paperId)}/exports`), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceRevision, layerVersion, layoutId }),
      })
    } catch (cause) {
      throw Object.assign(new Error('网络已断开，导出没有完成', { cause }), { status: 0 })
    }
    const payload = await response.json().catch(() => null) as (Record<string, unknown> & {
      error?: unknown
      code?: unknown
      diagnostics?: unknown
    }) | null
    if (response.ok && isExportSuccess(payload)) return payload
    throw Object.assign(
      new Error(typeof payload?.error === 'string' && payload.error ? payload.error : '导出没有完成，请稍后再试'),
      {
        status: response.status,
        code: typeof payload?.code === 'string' ? payload.code : null,
        payload,
      },
    )
  }, [layoutId, paperId, sourceRevision])

  const handleFailure = useCallback((error: unknown) => {
    const code = exportCodeOf(error)
    if (code === 'PERSONAL_EXPORT_VERSION_MISMATCH') {
      setNotice({ kind: 'stale-version' })
      return
    }
    if (code === 'PERSONAL_EXPORT_LAYOUT_MISMATCH') {
      setNotice({ kind: 'layout-mismatch' })
      return
    }
    if (code === 'PERSONAL_EXPORT_HAS_DIAGNOSTICS') {
      const diagnostics = (error as ExportFailure | null)?.payload?.diagnostics
      const rows = Array.isArray(diagnostics) ? diagnostics.filter(isDiagnosticRow) : []
      if (rows.length > 0) {
        setNotice({ kind: 'diagnostics', rows })
        return
      }
    }
    setNotice({ kind: 'text', text: error instanceof Error && error.message ? error.message : '导出没有完成，请稍后再试' })
  }, [])

  const runExport = useCallback(async () => {
    const session = api.session
    if (!session || running) return
    setNotice(null)
    setRunning(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const snapshot = session.getSnapshot()
        const unsaved = snapshot.unsentCount > 0 || snapshot.status !== 'saved'
        setNotice({ kind: 'blocked', text: unsaved ? BLOCKED_COPY.offline : OFFLINE_SAVED_COPY })
        return
      }
      let version: number
      try {
        version = await session.settle()
      } catch (settleError) {
        blockFor(exportStatusOf(settleError))
        return
      }
      // 版本 409 说明 POST 与最后一次 flush 赛跑：重读一次已确认版本再试一次；
      // 仍不匹配说明别处真的保存过，交给人工决定。
      let result: ExportSuccess | null = null
      for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
        try {
          result = await postExport(version)
        } catch (postError) {
          if (exportCodeOf(postError) !== 'PERSONAL_EXPORT_VERSION_MISMATCH') {
            handleFailure(postError)
            return
          }
          if (attempt === 1) {
            setNotice({ kind: 'stale-version' })
            return
          }
          try {
            version = await session.settle()
          } catch (retrySettleError) {
            blockFor(exportStatusOf(retrySettleError))
            return
          }
        }
      }
      if (!result) return
      triggerDownload(result.downloadUrl)
      setNotice({ kind: 'success', version: result.layerVersion })
    } finally {
      setRunning(false)
    }
  }, [api.session, blockFor, handleFailure, postExport, running])

  // 「查看」：与旁注条「回到原文」同一条纵向滚动（scrollIntoView 会横向漂移）。
  const revealObject = useCallback((objectId: string) => {
    api.setSelectedId(objectId)
    api.setPopover(null)
    const escaped = CSS.escape(objectId)
    const element = document.querySelector(
      `[data-note-key="${escaped}"], [data-box-key="${escaped}"], [data-paper-mark-id="${escaped}"], [data-appendix-entry="${escaped}"]`,
    )
    if (!element) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
    scrollElementToVerticalCenter(element, behavior)
  }, [api])

  const closeDiagnostics = useCallback(() => {
    setNotice(null)
    buttonRef.current?.focus()
  }, [])

  const diagnosticsOpen = notice?.kind === 'diagnostics'
  useEffect(() => {
    if (!diagnosticsOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      closeDiagnostics()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeDiagnostics, diagnosticsOpen])

  // 导出后若又编辑过，提示改为「文件是较早版本」，绝不能让老师以为文件含新修改。
  const successStale = notice?.kind === 'success' && (
    (api.snapshot?.unsentCount ?? 0) > 0
    || (api.snapshot?.confirmedVersion ?? 0) > notice.version
  )

  const button = (
    <button
      ref={buttonRef}
      type="button"
      className="paper-browse-export-option"
      disabled={running}
      onClick={() => void runExport()}
    >
      <Download size={16} aria-hidden="true" />
      {running ? '导出中…' : '导出我的批注版'}
    </button>
  )

  return (
    <>
      {buttonTarget ? createPortal(button, buttonTarget) : null}
      {noticeTarget && notice?.kind === 'success' ? createPortal((
        <p className="paper-personal-paper-notice" role="status">
          {successStale
            ? `已导出的文件是第 ${notice.version} 版，不含之后的修改`
            : `已导出第 ${notice.version} 版批注`}
        </p>
      ), noticeTarget) : null}
      {noticeTarget && notice?.kind === 'blocked' ? createPortal((
        <p className="paper-personal-paper-notice" role="alert">{notice.text}</p>
      ), noticeTarget) : null}
      {noticeTarget && notice?.kind === 'text' ? createPortal((
        <p className="paper-personal-paper-notice" role="alert">{notice.text}</p>
      ), noticeTarget) : null}
      {noticeTarget && notice?.kind === 'stale-version' ? createPortal((
        <p className="paper-personal-paper-notice" role="alert">
          批注刚有新的保存，导出没有完成
          <button type="button" className="paper-personal-retry" onClick={() => void runExport()}>重新导出</button>
        </p>
      ), noticeTarget) : null}
      {noticeTarget && notice?.kind === 'layout-mismatch' ? createPortal((
        <p className="paper-personal-paper-notice" role="alert">
          纸张版式已经变化，请重新核对批注位置
          <button
            type="button"
            className="paper-personal-retry"
            onClick={() => {
              setNotice(null)
              reloadLayout()
            }}
          >
            重新加载
          </button>
        </p>
      ), noticeTarget) : null}
      {/* 诊断浮层挂在导出按钮下方、脱离文档流：出现与关闭都不推动工具条。 */}
      {buttonTarget && notice?.kind === 'diagnostics' ? createPortal((
        <div className="paper-personal-export-diagnostics" role="alert">
          <div className="paper-personal-export-diagnostics__header">
            <span className="paper-personal-export-diagnostics__title">这些批注没有导出</span>
            <button type="button" className="paper-personal-export-diagnostics__action" onClick={closeDiagnostics}>关闭</button>
          </div>
          <ul className="paper-personal-export-diagnostics__rows">
            {notice.rows.map((row) => {
              const label = OBJECT_LABEL[api.objectById.get(row.objectId)?.type ?? ''] ?? '批注'
              return (
                <li key={`${row.objectId}:${row.code}`}>
                  <span>{label}：{DIAGNOSTIC_REASON[row.code] ?? '无法放到导出的卷面上'}</span>
                  <button type="button" className="paper-personal-export-diagnostics__action" onClick={() => revealObject(row.objectId)}>查看</button>
                </li>
              )
            })}
          </ul>
        </div>
      ), buttonTarget) : null}
    </>
  )
}
