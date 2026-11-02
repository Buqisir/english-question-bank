import { Archive, Download, Ellipsis, Paper, Save, Trash } from '../../icons'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { FluidHoverList } from '../../components/FluidHoverList'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { MySpaceArtifact, MySpaceFolder } from '../../domain/questionBank'
import { deleteMySpaceArtifact, downloadMySpaceArtifact, fetchMySpace } from '../../services/mySpace'
import { prepareFileSaveTarget, type FileSaveMode } from '../../services/fileDownload.ts'
import { describeError } from '../shared/errorCopy'
import { useToastPresence } from '../shared/useToastPresence.ts'
import './MySpacePage.css'

export type MySpacePageProps = {
  onBackToWorkbench: () => void
  onOpenDraft: (draftPaperId: string) => void
  shellNav: AppTopbarNav
}

type LoadState = 'loading' | 'loaded' | 'error'

function formatMonthDay(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const OTHER_MONTH_GROUP_KEY = 'other'

type MonthGroup = {
  key: string
  label: string
  artifacts: MySpaceArtifact[]
}

function monthGroupKey(generatedAt: string): string {
  if (!generatedAt) return OTHER_MONTH_GROUP_KEY
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) return OTHER_MONTH_GROUP_KEY
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthGroupLabel(key: string): string {
  if (key === OTHER_MONTH_GROUP_KEY) return '其他'
  const [year, month] = key.split('-')
  return `${year} 年 ${Number(month)} 月`
}

// Group saved artifacts locally; the fetch contract and server ordering stay unchanged.
function groupArtifactsByMonth(items: MySpaceArtifact[]): MonthGroup[] {
  const buckets = new Map<string, MySpaceArtifact[]>()
  for (const artifact of items) {
    const key = monthGroupKey(artifact.generatedAt)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(artifact)
    else buckets.set(key, [artifact])
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === OTHER_MONTH_GROUP_KEY) return 1
    if (b === OTHER_MONTH_GROUP_KEY) return -1
    return b.localeCompare(a)
  })
  return keys.map((key) => ({
    key,
    label: monthGroupLabel(key),
    artifacts: (buckets.get(key) ?? []).slice().sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || '')),
  }))
}

let activeFileMenuCloser: ((restoreFocus?: boolean) => void) | null = null

function ArtifactMenu({
  artifact,
  disabled,
  onSaveAs,
  onDelete,
}: {
  artifact: MySpaceArtifact
  disabled: boolean
  onSaveAs: () => void
  onDelete: (trigger: HTMLButtonElement) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    if (activeFileMenuCloser && activeFileMenuCloser !== close) activeFileMenuCloser(false)
    activeFileMenuCloser = close

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }
    const onViewportChange = () => close(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    const focusFrame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }))

    return () => {
      cancelAnimationFrame(focusFrame)
      if (activeFileMenuCloser === close) activeFileMenuCloser = null
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [close, open])

  function placeMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 168
    const height = 92
    const gutter = 8
    const top = rect.bottom + 6 + height > window.innerHeight
      ? Math.max(gutter, rect.top - height - 6)
      : rect.bottom + 6
    const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.right - width))
    setPosition({ top, left })
  }

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (open) {
      close(false)
      return
    }
    placeMenu()
    setOpen(true)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuRef.current ? [...menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')] : []
    if (!items.length) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length].focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1].focus()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      close(true)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="my-space-row-menu-trigger"
        aria-label={`更多操作：${artifact.title || artifact.fileName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <FluidHoverList
          as="div"
          ref={menuRef}
          id={menuId}
          className="my-space-row-menu"
          itemSelector=".my-space-row-menu-item"
          role="menu"
          gapClick={false}
          style={position}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="my-space-row-menu-item" role="menuitem" onClick={() => { close(true); onSaveAs() }}>
            <Save size={16} aria-hidden="true" />另存为…
          </button>
          <button
            type="button"
            className="my-space-row-menu-item my-space-row-menu-item-danger"
            role="menuitem"
            onClick={() => {
              const trigger = triggerRef.current
              close(false)
              if (trigger) onDelete(trigger)
            }}
          >
            <Trash size={16} aria-hidden="true" />删除文件
          </button>
        </FluidHoverList>,
        // Keep the page's theme tokens while escaping the clipped file list.
        triggerRef.current?.closest('.my-space-page') ?? document.body,
      )}
    </>
  )
}

export function MySpacePage({ onBackToWorkbench, onOpenDraft, shellNav }: MySpacePageProps): ReactNode {
  const [folders, setFolders] = useState<MySpaceFolder[]>([])
  const [artifacts, setArtifacts] = useState<MySpaceArtifact[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<MySpaceArtifact | null>(null)
  const confirmPresence = useToastPresence(confirmTarget, 120)

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  )
  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders])
  const monthGroups = useMemo(() => groupArtifactsByMonth(artifacts), [artifacts])

  // A monotonically increasing token prevents a stale folder response replacing a newer one.
  const loadTokenRef = useRef(0)
  const load = useCallback(async (folderId = selectedFolderId) => {
    const token = ++loadTokenRef.current
    setLoadState('loading')
    setMessage('')
    try {
      const snapshot = await fetchMySpace(folderId)
      if (loadTokenRef.current !== token) return
      setFolders(snapshot.folders)
      setArtifacts(snapshot.artifacts)
      setLoadState('loaded')
    } catch (error) {
      if (loadTokenRef.current !== token) return
      setLoadState('error')
      setMessage(describeError('加载个人空间', error))
    }
  }, [selectedFolderId])

  useEffect(() => { void load() }, [load])

  function selectFolder(folderId: string | null) {
    activeFileMenuCloser?.(false)
    setSelectedFolderId(folderId)
  }

  async function downloadArtifact(artifact: MySpaceArtifact, mode: FileSaveMode = 'download') {
    setMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: artifact.fileName || '英语草稿卷.pdf',
        mimeType: 'application/pdf',
      })
      if (!target) return
      setBusyId(artifact.id)
      await downloadMySpaceArtifact(artifact, target)
    } catch (error) {
      setMessage(describeError(mode === 'save-as' ? '另存为 PDF' : '下载 PDF', error))
    } finally {
      setBusyId(null)
    }
  }

  function openSourceDraft(artifact: MySpaceArtifact) {
    if (!artifact.sourceDraftExists) {
      setMessage('原草稿卷已删除，PDF 仍可下载')
      return
    }
    onOpenDraft(artifact.sourceDraftPaperId)
  }

  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  function requestDeleteArtifact(artifact: MySpaceArtifact, trigger: HTMLElement) {
    restoreFocusRef.current = trigger
    setConfirmTarget(artifact)
  }

  useEffect(() => {
    // Presence mounts the dialog one render after the delete target changes.
    if (!confirmPresence.rendered) return
    cancelButtonRef.current?.focus()
    const restoreTarget = restoreFocusRef.current
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setConfirmTarget(null)
      } else if (event.key === 'Tab') {
        const dialog = cancelButtonRef.current?.closest('[role="alertdialog"]')
        const buttons = dialog ? [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : []
        const first = buttons[0]
        const last = buttons.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTarget?.focus()
      restoreFocusRef.current = null
    }
  }, [confirmPresence.rendered])

  async function confirmDeleteArtifact() {
    const artifact = confirmTarget
    if (!artifact) return
    setConfirmTarget(null)
    setBusyId(artifact.id)
    setMessage('')
    try {
      await deleteMySpaceArtifact(artifact.id)
      await load(selectedFolderId)
      setMessage('文件已删除。')
    } catch (error) {
      setMessage(describeError('删除文件', error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="my-space-page">
      <AppTopbar {...shellNav} onBack={onBackToWorkbench} />
      <div className="my-space-shell">
        <header className="my-space-heading">
          <h1>个人空间</h1>
          <p>已保存的 PDF</p>
        </header>

        {message && loadState !== 'error' && <p className="my-space-message" role="status">{message}</p>}

        <div className={`my-space-workspace${folders.length ? '' : ' my-space-workspace--no-folders'}`}>
          {folders.length > 0 && (
            <aside className="my-space-rail" aria-label="文件夹导航">
              {/* Future folder-management UI belongs here once its workflows are ready. */}
              <FluidHoverList as="div" axis="xy" itemSelector=".my-space-folder-button" className="my-space-folders" gapClick={false}>
                <button type="button" className={`my-space-folder-button${!selectedFolderId ? ' is-selected' : ''}`} aria-pressed={!selectedFolderId} onClick={() => selectFolder(null)}>
                  <Paper size={20} aria-hidden="true" /><span>全部文件</span>
                </button>
                <p className="my-space-rail-label">文件夹</p>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className={`my-space-folder-button${selectedFolderId === folder.id ? ' is-selected' : ''}`}
                    aria-pressed={selectedFolderId === folder.id}
                    onClick={() => selectFolder(folder.id)}
                  >
                    <Archive size={20} aria-hidden="true" />
                    <span title={folder.name}>{folder.name}</span>
                    <span className="my-space-folder-count">{folder.artifactCount}</span>
                  </button>
                ))}
              </FluidHoverList>
            </aside>
          )}

          <main className="my-space-main">
            <div className="my-space-section-head">
              <div>
                <h2>{selectedFolder?.name || '全部文件'}</h2>
                {loadState === 'loaded' && <span>{artifacts.length} 份已保存文件</span>}
              </div>
              {/* Search and other future capabilities belong here only after they are real. */}
            </div>

            {loadState === 'loading' && <p className="my-space-empty">正在读取个人空间…</p>}
            {loadState === 'error' && (
              <div className="my-space-empty-state">
                <p className="my-space-error">{message || '个人空间读取失败。'}</p>
                <button type="button" className="my-space-empty-cta" onClick={() => void load()}>重新加载</button>
              </div>
            )}
            {loadState === 'loaded' && artifacts.length === 0 && (
              <div className="my-space-empty-state">
                <Paper size={24} aria-hidden="true" />
                <p className="my-space-empty">试卷导出为 PDF 后，可以保存在这里。</p>
                <button type="button" className="my-space-empty-cta" onClick={onBackToWorkbench}>去找题</button>
              </div>
            )}
            {loadState === 'loaded' && artifacts.length > 0 && monthGroups.map((group) => (
              <section className="my-space-month-group" key={group.key} aria-label={group.label}>
                <div className="my-space-month-head">
                  <span className="my-space-month-label">{group.label}</span>
                  <span className="my-space-month-count">{group.artifacts.length} 份</span>
                </div>
                <FluidHoverList
                  as="div"
                  axis="y"
                  className="my-space-file-list"
                  itemSelector=".my-space-file-row"
                  gapClick={false}
                  aria-label={selectedFolder ? selectedFolder.name : '全部保存文件'}
                >
                  {group.artifacts.map((artifact) => {
                    const title = artifact.title || artifact.fileName
                    const dateLabel = formatMonthDay(artifact.generatedAt)
                    const folderName = artifact.folderId ? folderNames.get(artifact.folderId) : null
                    return (
                      <article className="my-space-file-row" key={artifact.id}>
                        <Paper className="my-space-file-icon" size={24} aria-hidden="true" />
                        <div className="my-space-file-copy">
                          <h3 title={title}>{title}</h3>
                          <p>
                            {folderName && <span>{folderName}</span>}
                            <span>{artifact.pageCount || 1} 页</span>
                            {dateLabel && <span>{dateLabel}</span>}
                            {artifact.sourceDraftStudentLabel && <span className="my-space-student-label">学生：{artifact.sourceDraftStudentLabel}</span>}
                          </p>
                        </div>
                        <div className="my-space-row-actions">
                          <button type="button" disabled={busyId === artifact.id} onClick={() => void downloadArtifact(artifact)}>
                            <Download size={16} aria-hidden="true" /><span>下载</span>
                          </button>
                          <button type="button" onClick={() => openSourceDraft(artifact)}>打开原草稿</button>
                          <ArtifactMenu
                            artifact={artifact}
                            disabled={busyId === artifact.id}
                            onSaveAs={() => void downloadArtifact(artifact, 'save-as')}
                            onDelete={(trigger) => requestDeleteArtifact(artifact, trigger)}
                          />
                        </div>
                      </article>
                    )
                  })}
                </FluidHoverList>
              </section>
            ))}
          </main>
        </div>
      </div>

      {confirmPresence.rendered && (
        <div className="my-space-modal-backdrop" role="presentation" data-visible={confirmPresence.visible}>
          <div className="my-space-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="my-space-confirm-dialog-title" data-visible={confirmPresence.visible}>
            <h3 id="my-space-confirm-dialog-title">删除草稿卷 PDF</h3>
            <p>删除「{confirmPresence.rendered.title || confirmPresence.rendered.fileName}」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。</p>
            <div className="my-space-confirm-actions">
              <button type="button" ref={cancelButtonRef} onClick={() => setConfirmTarget(null)}>取消</button>
              <button type="button" className="my-space-delete-confirm" onClick={() => void confirmDeleteArtifact()}>删除 PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
