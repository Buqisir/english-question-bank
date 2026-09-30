import { useCallback, useEffect, useState } from 'react'
import { apiPath } from '../../../services/httpClient.ts'

export type PersonalPaperLayoutPage = {
  pageId: string
  index: number
  widthMm: number
  heightMm: number
}

export type PersonalPaperLayout = {
  layoutId: string
  sourceRevision: string
  pages: PersonalPaperLayoutPage[]
  paginatedHtml: string
}

export type PersonalPaperLayoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; layout: PersonalPaperLayout }
  | { status: 'error'; code: string; message: string; canRetry: boolean }

type LayoutResponseBody = {
  schemaVersion?: unknown
  paperId?: unknown
  sourceRevision?: unknown
  layoutId?: unknown
  pages?: unknown
  paginatedHtml?: unknown
}

function isLayoutPage(value: unknown): value is PersonalPaperLayoutPage {
  if (!value || typeof value !== 'object') return false
  const page = value as Record<string, unknown>
  return typeof page.pageId === 'string'
    && typeof page.index === 'number'
    && typeof page.widthMm === 'number'
    && page.widthMm > 0
    && typeof page.heightMm === 'number'
    && page.heightMm > 0
}

function isLayoutBody(value: unknown): value is LayoutResponseBody & {
  layoutId: string
  sourceRevision: string
  pages: PersonalPaperLayoutPage[]
  paginatedHtml: string
} {
  if (!value || typeof value !== 'object') return false
  const body = value as LayoutResponseBody
  return typeof body.layoutId === 'string'
    && typeof body.sourceRevision === 'string'
    && Array.isArray(body.pages)
    && body.pages.length > 0
    && body.pages.every(isLayoutPage)
    && typeof body.paginatedHtml === 'string'
    && body.paginatedHtml.length > 0
}

// Server messages are already teacher-facing (same copy the layout route
// sends); these fill in for codes that can arrive without a server body.
const LAYOUT_FALLBACK_MESSAGES: Record<string, string> = {
  PERSONAL_LAYER_SOURCE_MISMATCH: '卷子已经更新，纸张版需要按新卷重新打开。',
  PERSONAL_LAYOUT_SOURCE_STALE: '卷子正在更新，稍后再打开纸张版。',
  PERSONAL_LAYOUT_UNAVAILABLE: '这张卷子没有可用的完整纸张版。',
  PERSONAL_LAYOUT_RATE_LIMITED: '纸张版生成太频繁，稍后再试。',
  PERSONAL_LAYOUT_RENDER_FAILED: '纸张版暂时生成失败，稍后重试。',
}

// 无完整纸张版是这张卷子的固定事实，重试只会再失败一次；其余错误都值得重试。
const LAYOUT_NO_RETRY_CODES = new Set(['PERSONAL_LAYOUT_UNAVAILABLE'])

type LayoutResult = { key: string; state: PersonalPaperLayoutState }

/*
 * Loads the personal paper base layout (server-rendered Paged.js A4 pages)
 * for the paper view. Fetches with the host's current sourceRevision; on the
 * stale-source 409 it refetches once against the server-provided
 * `currentSourceRevision` (the paper was updated between screen load and
 * layout request — the fresh revision is still what the host is showing
 * annotations against, so one silent refresh beats an error). Unmounting or
 * a revision change aborts the in-flight request.
 *
 * The loading state is derived (result keyed by request), never set in an
 * effect body: a finished response whose key no longer matches is dropped,
 * so a stale reply can never surface as another request's state.
 */
export function usePersonalPaperLayout({
  paperId,
  sourceRevision,
  enabled,
}: {
  paperId: string
  sourceRevision: string | null
  enabled: boolean
}): { state: PersonalPaperLayoutState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  const requestKey = enabled && sourceRevision
    ? JSON.stringify([paperId, sourceRevision, attempt])
    : null
  const [result, setResult] = useState<LayoutResult | null>(null)

  useEffect(() => {
    if (!requestKey || !sourceRevision) return undefined
    const key = requestKey
    const controller = new AbortController()
    let revisionRefreshed = false

    async function loadLayout(revision: string): Promise<void> {
      let response: Response
      try {
        response = await fetch(
          apiPath(`/api/personal-paper-layers/${encodeURIComponent(paperId)}/layout?sourceRevision=${encodeURIComponent(revision)}`),
          { credentials: 'same-origin', signal: controller.signal },
        )
      } catch {
        if (controller.signal.aborted) return
        setResult({
          key,
          state: {
            status: 'error',
            code: 'PERSONAL_LAYOUT_NETWORK',
            message: '纸张版暂时打不开，检查网络后重试。',
            canRetry: true,
          },
        })
        return
      }
      const body = await response.json().catch(() => null) as (Record<string, unknown> & {
        error?: unknown
        code?: unknown
        details?: { currentSourceRevision?: unknown }
      }) | null
      if (response.ok && isLayoutBody(body)) {
        setResult({
          key,
          state: {
            status: 'ready',
            layout: {
              layoutId: body.layoutId,
              sourceRevision: body.sourceRevision,
              pages: body.pages,
              paginatedHtml: body.paginatedHtml,
            },
          },
        })
        return
      }
      // 卷子在打开纸张版前一刻被更新：响应带着当前 revision，按它重取一次。
      if (
        response.status === 409
        && !revisionRefreshed
        && typeof body?.details?.currentSourceRevision === 'string'
        && body.details.currentSourceRevision
      ) {
        revisionRefreshed = true
        await loadLayout(body.details.currentSourceRevision)
        return
      }
      const code = typeof body?.code === 'string' ? body.code : 'PERSONAL_LAYOUT_FAILED'
      setResult({
        key,
        state: {
          status: 'error',
          code,
          message: typeof body?.error === 'string' && body.error
            ? body.error
            : LAYOUT_FALLBACK_MESSAGES[code] ?? '纸张版暂时打不开，请重试。',
          canRetry: !LAYOUT_NO_RETRY_CODES.has(code),
        },
      })
    }

    void loadLayout(sourceRevision)
    return (): void => {
      controller.abort()
    }
  }, [requestKey, paperId, sourceRevision])

  const state: PersonalPaperLayoutState = !requestKey
    ? { status: 'idle' }
    : result && result.key === requestKey
      ? result.state
      : { status: 'loading' }

  return { state, reload }
}
