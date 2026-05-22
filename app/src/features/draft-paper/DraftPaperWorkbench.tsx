import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, FileDown, GripVertical, Printer, RotateCcw, Trash2 } from 'lucide-react'
import type { DraftPaper, DraftPaperItem, DraftPaperSummary } from '../../domain/questionBank'
import { groupTypeLabel } from '../../domain/questionBank'
import {
  deleteDraftPaperItem,
  downloadDraftPaperPdf,
  fetchCurrentDraftPaper,
  fetchDraftPaper,
  fetchDraftPapers,
  migrateAssemblyBasketToDraftPaper,
  patchDraftPaperItem,
  restoreDraftPaperItem,
  updateDraftPaper,
} from '../../services/draftPapers'
import {
  ASSEMBLY_BASKET_STORAGE_KEY,
  parseAssemblyBasket,
} from '../../paperAssembly/basketPersistence'
import './DraftPaperWorkbench.css'

export type DraftPaperWorkbenchProps = {
  draftPaperId?: string | null
  focusGroupId?: string | null
  onBackToWorkbench: () => void
  onDraftChanged?: () => void
}

type RemovedDraftItem = {
  groupId: string
  orderIndex: number
  pageBreakBefore: boolean
}

function getLegacyBasketGroupIds() {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(ASSEMBLY_BASKET_STORAGE_KEY)
  const items = parseAssemblyBasket(raw) || []
  return items.map((item) => item.id).filter(Boolean)
}

function clearLegacyBasket() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ASSEMBLY_BASKET_STORAGE_KEY)
}

function compactSource(item: DraftPaperItem) {
  const group = item.questionGroup
  if (!group) return '来源未载入'
  return [group.year, group.region, group.paperName, group.section].filter(Boolean).join(' · ')
}

function reorderItems(items: DraftPaperItem[], itemId: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === itemId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function moveItemTo(items: DraftPaperItem[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return items
  const from = items.findIndex((item) => item.id === draggedId)
  const to = items.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function DraftPaperWorkbench(props: DraftPaperWorkbenchProps): ReactNode {
  const { draftPaperId, focusGroupId, onBackToWorkbench, onDraftChanged } = props
  const [draftPaper, setDraftPaper] = useState<DraftPaper | null>(null)
  const [recentDrafts, setRecentDrafts] = useState<DraftPaperSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
  const [removedItem, setRemovedItem] = useState<RemovedDraftItem | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const titleSaveTimerRef = useRef<number | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const focusedOnceRef = useRef(false)

  const loadRecentDrafts = useCallback(() => {
    fetchDraftPapers().then(setRecentDrafts).catch(() => setRecentDrafts([]))
  }, [])

  const loadDraft = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError('')
    try {
      let next: DraftPaper
      if (draftPaperId) {
        next = await fetchDraftPaper(draftPaperId)
      } else {
        try {
          next = await fetchCurrentDraftPaper(false)
        } catch {
          const groupIds = getLegacyBasketGroupIds()
          if (groupIds.length > 0) {
            const migration = await migrateAssemblyBasketToDraftPaper(groupIds)
            clearLegacyBasket()
            next = migration.draftPaper
          } else {
            next = await fetchCurrentDraftPaper(true)
          }
        }
      }
      setDraftPaper(next)
      setTitleDraft(next.title)
      setLoadStatus('loaded')
      loadRecentDrafts()
    } catch (error) {
      setLoadStatus('error')
      setLoadError(error instanceof Error ? error.message : String(error))
    }
  }, [draftPaperId, loadRecentDrafts])

  useEffect(() => {
    void loadDraft()
    return () => {
      if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    }
  }, [loadDraft])

  useEffect(() => {
    focusedOnceRef.current = false
  }, [draftPaperId, focusGroupId])

  useEffect(() => {
    if (!draftPaper || !focusGroupId || focusedOnceRef.current) return
    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-draft-group-id="${CSS.escape(focusGroupId)}"]`)
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      focusedOnceRef.current = true
    }, 180)
    return () => window.clearTimeout(timer)
  }, [draftPaper, focusGroupId])

  const totalQuestions = useMemo(
    () => draftPaper?.items.reduce((sum, item) => sum + Number(item.questionGroup?.questionCount || 0), 0) || 0,
    [draftPaper],
  )

  async function persistItems(nextItems: DraftPaperItem[]) {
    if (!draftPaper) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, {
        items: nextItems.map((item) => ({ id: item.id, pageBreakBefore: item.pageBreakBefore })),
      })
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  function updateTitle(nextTitle: string) {
    setTitleDraft(nextTitle)
    if (!draftPaper) return
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
    setSaveStatus('saving')
    titleSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const next = await updateDraftPaper(draftPaper.id, { title: nextTitle })
        setDraftPaper(next)
        setSaveStatus('saved')
        onDraftChanged?.()
      } catch (error) {
        setSaveStatus('error')
        setSaveError(error instanceof Error ? error.message : String(error))
      }
    }, 450)
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    if (!draftPaper) return
    const nextItems = reorderItems(draftPaper.items, itemId, direction)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  function handleDrop(targetId: string) {
    if (!draftPaper || !draggedItemId) return
    const nextItems = moveItemTo(draftPaper.items, draggedItemId, targetId)
    setDraggedItemId(null)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  async function togglePageBreak(item: DraftPaperItem, nextValue: boolean) {
    if (!draftPaper) return
    setSaveStatus('saving')
    try {
      const next = await patchDraftPaperItem(draftPaper.id, item.id, { pageBreakBefore: nextValue })
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function deleteItem(item: DraftPaperItem) {
    if (!draftPaper) return
    setSaveStatus('saving')
    try {
      const result = await deleteDraftPaperItem(draftPaper.id, item.id)
      setDraftPaper(result.draftPaper)
      setTitleDraft(result.draftPaper.title)
      setRemovedItem({
        groupId: result.removed.groupId,
        orderIndex: result.removed.orderIndex,
        pageBreakBefore: result.removed.pageBreakBefore,
      })
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = window.setTimeout(() => setRemovedItem(null), 8000)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function undoDelete() {
    if (!draftPaper || !removedItem) return
    setSaveStatus('saving')
    try {
      const next = await restoreDraftPaperItem(draftPaper.id, removedItem)
      setDraftPaper(next)
      setTitleDraft(next.title)
      setRemovedItem(null)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function exportPdf() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('exporting')
    setExportError('')
    try {
      await downloadDraftPaperPdf(draftPaper.id)
      setExportStatus('exported')
    } catch (error) {
      setExportStatus('error')
      setExportError(error instanceof Error ? error.message : String(error))
    }
  }

  function browserPrint() {
    if (!draftPaper?.printHtml) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setExportStatus('error')
      setExportError('浏览器阻止了打印窗口，请允许弹窗后重试。')
      return
    }
    printWindow.opener = null
    printWindow.document.open()
    printWindow.document.write(draftPaper.printHtml)
    printWindow.document.close()
    printWindow.focus()
    printWindow.setTimeout(() => printWindow.print(), 250)
  }

  if (loadStatus === 'loading') {
    return <div className="draft-workbench-shell"><p className="draft-loading">正在打开草稿卷...</p></div>
  }

  if (loadStatus === 'error' || !draftPaper) {
    return (
      <div className="draft-workbench-shell">
        <button className="draft-back-button" type="button" onClick={onBackToWorkbench}>
          <ArrowLeft size={16} /> 返回
        </button>
        <p className="draft-error">{loadError || '草稿卷未找到。'}</p>
      </div>
    )
  }

  return (
    <div className="draft-workbench-shell">
      <header className="draft-toolbar">
        <button className="draft-back-button" type="button" onClick={onBackToWorkbench}>
          <ArrowLeft size={16} /> 返回取题台
        </button>
        <label className="draft-title-field">
          <span>草稿卷标题</span>
          <input value={titleDraft} onChange={(event) => updateTitle(event.target.value)} />
        </label>
        <span className={`draft-save-status ${saveStatus}`}>
          {saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? saveError : '自动保存'}
        </span>
        <select
          className="draft-recent-select"
          value={draftPaper.id}
          onChange={(event) => {
            const id = event.target.value
            const url = new URL(window.location.href)
            url.searchParams.set('view', 'draft-paper')
            url.searchParams.set('draftPaperId', id)
            window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`)
            void fetchDraftPaper(id).then((next) => {
              setDraftPaper(next)
              setTitleDraft(next.title)
            })
          }}
          aria-label="最近草稿卷"
        >
          {recentDrafts.map((draft) => (
            <option key={draft.id} value={draft.id}>{draft.title}</option>
          ))}
        </select>
        <details className="draft-export-menu">
          <summary>导出</summary>
          <button type="button" disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'} onClick={exportPdf}>
            <FileDown size={15} /> 下载 PDF
          </button>
          <button type="button" disabled={draftPaper.items.length === 0} onClick={browserPrint}>
            <Printer size={15} /> 浏览器打印
          </button>
        </details>
      </header>

      {draftPaper.items.length === 0 && (
        <p className="draft-empty-export" role="status">请先添加题组，再导出 PDF 或打印。</p>
      )}
      {exportStatus === 'error' && <p className="draft-error">{exportError}</p>}
      {exportStatus === 'exported' && <p className="draft-success">PDF 已开始下载。</p>}

      <main className="draft-workbench-layout">
        <section className="draft-preview-desk" aria-label="A4 预览">
          <div className="draft-preview-meta">
            <span>{draftPaper.items.length} 题组</span>
            <span>{totalQuestions} 小题</span>
            <span>学生卷</span>
          </div>
          <div className="draft-a4-sheet">
            {draftPaper.printHtml ? (
              <iframe title="草稿卷 A4 预览" srcDoc={draftPaper.printHtml} />
            ) : (
              <div className="draft-a4-empty">请先添加题组</div>
            )}
          </div>
        </section>

        <aside className="draft-outline-panel" aria-label="题组目录">
          <div className="draft-outline-head">
            <strong>题组目录</strong>
            <span>拖动或按钮调整顺序</span>
          </div>

          {draftPaper.pageBreakSuggestions.length > 0 && (
            <div className="draft-suggestions">
              <strong>分页建议</strong>
              {draftPaper.pageBreakSuggestions.map((suggestion) => {
                const item = draftPaper.items.find((entry) => entry.id === suggestion.itemId)
                if (!item) return null
                return (
                  <button key={suggestion.itemId} type="button" onClick={() => togglePageBreak(item, true)}>
                    在「{item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId}」前分页 · {suggestion.reason}
                  </button>
                )
              })}
            </div>
          )}

          <div className="draft-outline-list">
            {draftPaper.items.map((item, index) => {
              const canPageBreakBefore = index > 0
              return (
                <article
                  className={`draft-outline-item${canPageBreakBefore && item.pageBreakBefore ? ' has-break' : ''}`}
                  data-draft-group-id={item.groupId}
                  draggable
                  key={item.id}
                  onDragStart={() => setDraggedItemId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(item.id)}
                >
                  {canPageBreakBefore && item.pageBreakBefore && <div className="draft-break-marker">分页</div>}
                  <div className="draft-outline-item-main">
                    <GripVertical size={15} aria-hidden="true" />
                    <div>
                      <strong>{index + 1}. {item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId}</strong>
                      <span>{groupTypeLabel[item.questionGroup?.groupType || 'other']} · {item.questionGroup?.questionCount || 0} 题</span>
                      <em>{compactSource(item)}</em>
                      {!item.printReady && <small>{item.printUnavailableReason}</small>}
                    </div>
                  </div>
                  <div className="draft-outline-actions">
                    <button type="button" onClick={() => moveItem(item.id, -1)} aria-label="上移">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveItem(item.id, 1)} aria-label="下移">
                      <ArrowDown size={14} />
                    </button>
                    {canPageBreakBefore && (
                      <button type="button" onClick={() => togglePageBreak(item, !item.pageBreakBefore)}>
                        {item.pageBreakBefore ? '取消分页' : '前置分页'}
                      </button>
                    )}
                    <button type="button" onClick={() => deleteItem(item)} aria-label="删除题组">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              )
            })}
            {draftPaper.items.length === 0 && <p className="draft-outline-empty">从搜索结果添加题组。</p>}
          </div>
        </aside>
      </main>

      {removedItem && (
        <div className="draft-undo-toast" role="status">
          <span>题组已删除</span>
          <button type="button" onClick={undoDelete}>
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
    </div>
  )
}
