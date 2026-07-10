import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, FileDown, FolderPlus, Printer, RotateCcw } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import type { DraftPaper, DraftPaperItem, DraftPaperSummary, MySpaceFolder } from '../../domain/questionBank'
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
  createMySpaceFolder,
  fetchMySpace,
  saveDraftPaperToMySpace,
} from '../../services/mySpace'
import {
  ASSEMBLY_BASKET_STORAGE_KEY,
  parseAssemblyBasket,
} from '../../paperAssembly/basketPersistence'
import { describeError } from '../shared/errorCopy'
import { DraftPaperOutline } from './DraftPaperOutline'
import { buildA4PreviewHtml } from './draftPaperPreviewHtml'
import './DraftPaperWorkbench.css'

type DraftVersionType = 'student' | 'teacher'

export type DraftPaperWorkbenchProps = {
  draftPaperId?: string | null
  focusGroupId?: string | null
  onBackToWorkbench: () => void
  onDraftChanged?: () => void
  shellNav: AppTopbarNav
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
  const { draftPaperId, focusGroupId, onBackToWorkbench, onDraftChanged, shellNav } = props
  const [draftPaper, setDraftPaper] = useState<DraftPaper | null>(null)
  const [recentDrafts, setRecentDrafts] = useState<DraftPaperSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [studentLabelDraft, setStudentLabelDraft] = useState('')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [spaceFolders, setSpaceFolders] = useState<MySpaceFolder[]>([])
  const [spaceFolderId, setSpaceFolderId] = useState('')
  const [spaceFileName, setSpaceFileName] = useState('')
  const [spaceNewFolderName, setSpaceNewFolderName] = useState('')
  const [spaceStatus, setSpaceStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [spaceMessage, setSpaceMessage] = useState('')
  const [migrationNotice, setMigrationNotice] = useState('')
  const [versionType, setVersionType] = useState<DraftVersionType>('student')
  const [removedItem, setRemovedItem] = useState<RemovedDraftItem | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const titleSaveTimerRef = useRef<number | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const focusedOnceRef = useRef(false)
  const a4SheetRef = useRef<HTMLDivElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const [previewScale, setPreviewScale] = useState(1)

  const loadRecentDrafts = useCallback(() => {
    fetchDraftPapers().then(setRecentDrafts).catch(() => setRecentDrafts([]))
  }, [])

  const loadDraft = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError('')
    setMigrationNotice('')
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
            if (migration.skippedCount > 0) {
              setMigrationNotice(`已迁移 ${migration.migratedCount} 个题组到草稿卷；${migration.skippedCount} 个题组因不可打印被跳过。`)
            }
          } else {
            next = await fetchCurrentDraftPaper(true)
          }
        }
      }
      setDraftPaper(next)
      setTitleDraft(next.title)
      setStudentLabelDraft(next.studentLabel || '')
      setVersionType('student')
      setLoadStatus('loaded')
      loadRecentDrafts()
    } catch (error) {
      setLoadStatus('error')
      setLoadError(describeError('打开草稿卷', error))
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
    if (!draftPaper || loadStatus !== 'loaded') return
    let cancelled = false
    void fetchDraftPaper(draftPaper.id, versionType).then((next) => {
      if (cancelled) return
      setDraftPaper((current) => (current && current.id === next.id ? { ...current, printHtml: next.printHtml } : current))
    })
    return () => {
      cancelled = true
    }
    // Only re-fetch print HTML when the version toggle changes; item/title edits
    // already refresh printHtml via their own draftPaper responses (student version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionType])

  useEffect(() => {
    focusedOnceRef.current = false
  }, [draftPaperId, focusGroupId])

  // D5: close the export menu on outside click or Escape, mirroring the
  // dismiss behavior native disclosure widgets give you for free.
  useEffect(() => {
    if (!exportMenuOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [exportMenuOpen])

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
  const previewHtml = useMemo(() => buildA4PreviewHtml(draftPaper?.printHtml || ''), [draftPaper?.printHtml])

  // A4 page renders at a fixed native width (210mm ≈ 794px). On narrow
  // viewports the sheet no longer fits its container; scale it down to fit
  // instead of letting it clip. Never scale up past 1 on wide screens.
  useEffect(() => {
    const node = a4SheetRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const NATIVE_WIDTH_PX = 794
    const updateScale = () => {
      const containerWidth = node.clientWidth
      if (!containerWidth) return
      setPreviewScale(Math.min(1, containerWidth / NATIVE_WIDTH_PX))
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(node)
    return () => observer.disconnect()
  }, [previewHtml])

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
      setSaveError(describeError('保存草稿卷', error))
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
        setSaveError(describeError('保存标题', error))
      }
    }, 450)
  }

  // draft-student-field (E4): blur-save (not debounce-on-keystroke like the
  // title field above) — a name is typically typed once and left, so there is
  // no need for the extra network chatter a 450ms debounce would add here.
  async function saveStudentLabel(nextValue: string) {
    if (!draftPaper) return
    const trimmed = nextValue.trim()
    if ((draftPaper.studentLabel || '') === trimmed) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, { studentLabel: trimmed })
      setDraftPaper(next)
      setStudentLabelDraft(next.studentLabel || '')
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(describeError('保存学生', error))
    }
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
      setSaveError(describeError('更新分页设置', error))
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
      setSaveError(describeError('删除题组', error))
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
      setSaveError(describeError('撤销删除', error))
    }
  }

  async function exportPdf() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('exporting')
    setExportError('')
    try {
      await downloadDraftPaperPdf(draftPaper.id, versionType)
      setExportStatus('exported')
    } catch (error) {
      setExportStatus('error')
      setExportError(describeError('导出 PDF', error))
    }
  }

  async function openSpaceDialog() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setSpaceDialogOpen(true)
    setSpaceStatus('loading')
    setSpaceMessage('')
    setSpaceFileName(`${draftPaper.title || '英语草稿卷'}-学生卷.pdf`)
    try {
      const snapshot = await fetchMySpace()
      setSpaceFolders(snapshot.folders)
      setSpaceFolderId(snapshot.folders[0]?.id || '')
      setSpaceStatus('idle')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('读取个人空间文件夹', error))
    }
  }

  async function createFolderInDialog() {
    const name = spaceNewFolderName.trim()
    if (!name) return
    setSpaceStatus('saving')
    setSpaceMessage('')
    try {
      const folder = await createMySpaceFolder(name)
      setSpaceFolders((folders) => [folder, ...folders.filter((entry) => entry.id !== folder.id)])
      setSpaceFolderId(folder.id)
      setSpaceNewFolderName('')
      setSpaceStatus('idle')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('新建文件夹', error))
    }
  }

  async function saveToMySpace() {
    if (!draftPaper) return
    setSpaceStatus('saving')
    setSpaceMessage('')
    try {
      await saveDraftPaperToMySpace({
        draftPaperId: draftPaper.id,
        fileName: spaceFileName,
        folderId: spaceFolderId || null,
      })
      setSpaceStatus('saved')
      setSpaceMessage('已保存到个人空间。')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('保存到个人空间', error))
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
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <div className="draft-workbench-shell"><p className="draft-loading">正在打开草稿卷...</p></div>
      </>
    )
  }

  if (loadStatus === 'error' || !draftPaper) {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <div className="draft-workbench-shell">
          <p className="draft-error">{loadError || '没找到这份草稿卷，可能已被删除。回到找题页重新组一份吧。'}</p>
        </div>
      </>
    )
  }

  return (
    <>
    <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
    <div className="draft-workbench-shell">
      <header className="draft-toolbar">
        <div className="draft-toolbar-group draft-toolbar-group-doc">
          <label className="draft-title-field">
            <span>草稿卷标题</span>
            <input value={titleDraft} onChange={(event) => updateTitle(event.target.value)} />
          </label>
          <label className="draft-student-field">
            <span>学生（可选）</span>
            <input
              value={studentLabelDraft}
              placeholder="未填写"
              onChange={(event) => setStudentLabelDraft(event.target.value)}
              onBlur={(event) => void saveStudentLabel(event.target.value)}
            />
          </label>
          <span className={`draft-save-status ${saveStatus}`}>
            {saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? saveError : '自动保存'}
          </span>
          <label className="draft-recent-select-field">
            <span>最近草稿卷</span>
            <select
              className="draft-recent-select"
              value={draftPaper.id}
              onChange={(event) => {
                const id = event.target.value
                const url = new URL(window.location.href)
                url.searchParams.set('view', 'draft-paper')
                url.searchParams.set('draftPaperId', id)
                window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`)
                setVersionType('student')
                void fetchDraftPaper(id).then((next) => {
                  setDraftPaper(next)
                  setTitleDraft(next.title)
                  setStudentLabelDraft(next.studentLabel || '')
                })
              }}
            >
              {recentDrafts.map((draft) => (
                <option key={draft.id} value={draft.id}>{draft.title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="draft-toolbar-group draft-toolbar-group-output">
          <div className="draft-version-toggle" role="group" aria-label="导出版本">
            <button
              type="button"
              className={versionType === 'student' ? 'active' : ''}
              aria-pressed={versionType === 'student'}
              onClick={() => setVersionType('student')}
            >
              学生版
            </button>
            <button
              type="button"
              className={versionType === 'teacher' ? 'active' : ''}
              aria-pressed={versionType === 'teacher'}
              onClick={() => setVersionType('teacher')}
            >
              教师版
            </button>
          </div>
          <div className="draft-export-menu" ref={exportMenuRef}>
            <button
              type="button"
              className="draft-export-menu-trigger"
              aria-haspopup="true"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              导出
            </button>
            {exportMenuOpen && (
              <div className="draft-export-menu-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'}
                  onClick={() => {
                    setExportMenuOpen(false)
                    void exportPdf()
                  }}
                >
                  <FileDown size={15} /> 下载 PDF（{versionType === 'teacher' ? '教师版' : '学生版'}）
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={draftPaper.items.length === 0}
                  onClick={() => {
                    setExportMenuOpen(false)
                    browserPrint()
                  }}
                >
                  <Printer size={15} /> 浏览器打印
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={draftPaper.items.length === 0 || spaceStatus === 'saving'}
                  onClick={() => {
                    setExportMenuOpen(false)
                    void openSpaceDialog()
                  }}
                >
                  <Archive size={15} /> 保存到个人空间
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {draftPaper.items.length === 0 && (
        <p className="draft-empty-export" role="status">请先添加题组，再导出 PDF 或打印。</p>
      )}
      {migrationNotice && <p className="draft-warning" role="status">{migrationNotice}</p>}
      {exportStatus === 'error' && <p className="draft-error">{exportError}</p>}
      {exportStatus === 'exported' && <p className="draft-success">PDF 已开始下载。</p>}

      <main className="draft-workbench-layout">
        <section className="draft-preview-desk" aria-label="A4 预览">
          <div className="draft-preview-meta">
            <span>{draftPaper.items.length} 题组</span>
            <span>{totalQuestions} 小题</span>
            <span>{versionType === 'teacher' ? '教师卷' : '学生卷'}</span>
          </div>
          <div
            className="draft-a4-sheet"
            ref={a4SheetRef}
            style={previewScale < 1 ? { height: `${1188 * previewScale}px` } : undefined}
          >
            {previewHtml ? (
              <iframe
                title="草稿卷 A4 预览"
                srcDoc={previewHtml}
                style={previewScale < 1 ? { transform: `scale(${previewScale})`, transformOrigin: 'top left' } : undefined}
              />
            ) : (
              <div className="draft-a4-empty">请先添加题组</div>
            )}
          </div>
        </section>

        <DraftPaperOutline
          items={draftPaper.items}
          pageBreakSuggestions={draftPaper.pageBreakSuggestions}
          onDragStart={(itemId) => setDraggedItemId(itemId)}
          onDrop={handleDrop}
          onMoveItem={moveItem}
          onTogglePageBreak={togglePageBreak}
          onDeleteItem={deleteItem}
        />
      </main>

      {removedItem && (
        <div className="draft-undo-toast" role="status">
          <span>题组已删除</span>
          <button type="button" onClick={undoDelete}>
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
      {spaceDialogOpen && (
        <div className="draft-modal-backdrop" role="presentation">
          <form
            aria-label="保存到个人空间"
            className="draft-save-space-dialog"
            onSubmit={(event) => {
              event.preventDefault()
              void saveToMySpace()
            }}
          >
            <div className="draft-dialog-head">
              <strong>保存到个人空间</strong>
              <button type="button" onClick={() => setSpaceDialogOpen(false)}>关闭</button>
            </div>
            <label>
              <span>文件名</span>
              <input value={spaceFileName} onChange={(event) => setSpaceFileName(event.target.value)} />
            </label>
            <label>
              <span>文件夹</span>
              <select value={spaceFolderId} onChange={(event) => setSpaceFolderId(event.target.value)}>
                <option value="">未归档</option>
                {spaceFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>
            <div className="draft-new-folder-row">
              <input
                value={spaceNewFolderName}
                onChange={(event) => setSpaceNewFolderName(event.target.value)}
                placeholder="新建文件夹"
              />
              <button type="button" onClick={createFolderInDialog} disabled={!spaceNewFolderName.trim() || spaceStatus === 'saving'}>
                <FolderPlus size={15} /> 新建
              </button>
            </div>
            {spaceStatus === 'loading' && <p className="draft-dialog-note">正在读取文件夹...</p>}
            {spaceStatus === 'error' && <p className="draft-error">{spaceMessage}</p>}
            {spaceStatus === 'saved' && (
              <p className="draft-success">
                {spaceMessage}
                {shellNav.onOpenMySpace && (
                  <button type="button" onClick={shellNav.onOpenMySpace}>查看个人空间</button>
                )}
              </p>
            )}
            <div className="draft-dialog-actions">
              <button type="button" onClick={() => setSpaceDialogOpen(false)}>取消</button>
              <button
                type="submit"
                className="primary-button"
                disabled={spaceStatus === 'saving' || draftPaper.items.length === 0}
              >
                {spaceStatus === 'saving' ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </>
  )
}
