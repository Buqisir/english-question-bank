import { Download, FileText, Save, Trash2 } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

// dossier-cabinet: group artifacts by generatedAt month, newest month first;
// artifacts without a usable date fall into a trailing "其他" group. Purely
// client-side — does not change the fetchMySpace API shape.
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

export function MySpacePage({ onBackToWorkbench, onOpenDraft, shellNav }: MySpacePageProps): ReactNode {
  const [folders, setFolders] = useState<MySpaceFolder[]>([])
  const [artifacts, setArtifacts] = useState<MySpaceArtifact[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<MySpaceArtifact | null>(null)
  // motion-press-exit #2: 弹层退出 ~120ms（var(--motion-fast)）播完再卸载。
  const confirmPresence = useToastPresence(confirmTarget, 120)

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  )

  const monthGroups = useMemo(() => groupArtifactsByMonth(artifacts), [artifacts])

  const load = useCallback(async (folderId = selectedFolderId) => {
    setLoadState('loading')
    setMessage('')
    try {
      const snapshot = await fetchMySpace(folderId)
      setFolders(snapshot.folders)
      setArtifacts(snapshot.artifacts)
      setLoadState('loaded')
    } catch (error) {
      setLoadState('error')
      setMessage(describeError('加载个人空间', error))
    }
  }, [selectedFolderId])

  useEffect(() => {
    void load()
  }, [load])

  async function selectFolder(folderId: string | null) {
    setSelectedFolderId(folderId)
    await load(folderId)
  }

  async function downloadArtifact(artifact: MySpaceArtifact, mode: FileSaveMode = 'download') {
    setMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: artifact.fileName || '英语草稿卷-学生卷.pdf',
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

  function requestDeleteArtifact(artifact: MySpaceArtifact) {
    setConfirmTarget(artifact)
  }

  // CR should-fix: the dialog must own the keyboard. Focus moves to 取消 on
  // open (so Esc works without a Tab first), Esc listens at document level
  // (the trigger button keeps focus otherwise and keydown never reaches the
  // backdrop), and focus returns to the trigger on close.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!confirmTarget) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmTarget(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus()
    }
  }, [confirmTarget])

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
    <>
    <AppTopbar {...shellNav} pageTitle="个人空间" onBack={onBackToWorkbench} />
    <div className="my-space-shell">
      <header className="my-space-heading">
        <h1>个人空间</h1>
        <p className="my-space-count">共 {artifacts.length} 份</p>
      </header>

      {message && loadState !== 'error' && <p className="my-space-message" role="status">{message}</p>}

      <main className="my-space-main">
        {folders.length > 0 && (
          <div className="my-space-folders" role="group" aria-label="按文件夹筛选">
            <button
              type="button"
              className={`my-space-chip${!selectedFolderId ? ' is-selected' : ''}`}
              onClick={() => void selectFolder(null)}
            >
              全部
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`my-space-chip${selectedFolderId === folder.id ? ' is-selected' : ''}`}
                onClick={() => void selectFolder(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}

        {loadState === 'loading' && <p className="my-space-empty">正在读取个人空间...</p>}

        {loadState === 'error' && (
          <div className="my-space-empty-state">
            <p className="my-space-error">{message || '个人空间读取失败。'}</p>
            <button type="button" className="my-space-empty-cta" onClick={() => void load()}>
              重新加载
            </button>
          </div>
        )}

        {loadState === 'loaded' && artifacts.length === 0 && (
          <div className="my-space-empty-state">
            <FileText size={28} aria-hidden="true" />
            <p className="my-space-empty">还没有保存的草稿卷 PDF。组一份卷子，导出后可以保存在这里。</p>
            <button type="button" className="my-space-empty-cta" onClick={() => onOpenDraft('')}>
              去组一份卷子
            </button>
          </div>
        )}

        {loadState === 'loaded' && artifacts.length > 0 && (
          <>
            <div className="my-space-section-head">
              <h2>草稿卷</h2>
              <span>导出保存的 PDF 成品</span>
            </div>
            {monthGroups.map((group) => (
              <section className="my-space-month-group" key={group.key} aria-label={group.label}>
                <div className="my-space-month-head">
                  <span className="my-space-month-label">{group.label}</span>
                  <span className="my-space-month-count">{group.artifacts.length} 份</span>
                </div>
                <div className="my-space-grid" aria-label={selectedFolder ? selectedFolder.name : '全部保存文件'}>
                  {group.artifacts.map((artifact) => {
                    const title = artifact.title || artifact.fileName
                    const dateLabel = formatMonthDay(artifact.generatedAt)
                    return (
                      <article className="my-space-card" key={artifact.id}>
                        <div className="my-space-card-thumb" aria-hidden="true">
                          <div className="my-space-card-thumb-mini">
                            <h3 className="my-space-card-thumb-title">{title}</h3>
                            <p className="my-space-card-thumb-sub">姓名：＿＿＿＿　班级：＿＿＿＿　成绩：＿＿＿＿</p>
                            <div className="my-space-card-thumb-line" />
                            <div className="my-space-card-thumb-line" />
                            <div className="my-space-card-thumb-line my-space-card-thumb-line-short" />
                            <div className="my-space-card-thumb-line" />
                            <div className="my-space-card-thumb-line" />
                            <div className="my-space-card-thumb-line my-space-card-thumb-line-short" />
                            <div className="my-space-card-thumb-line" />
                            <div className="my-space-card-thumb-line my-space-card-thumb-line-short" />
                          </div>
                        </div>
                        <p className="my-space-card-title" title={title}>
                          {title}
                        </p>
                        <p className="my-space-card-meta">
                          {dateLabel ? `${dateLabel} · ` : ''}
                          {artifact.pageCount || 1} 页
                        </p>
                        {artifact.sourceDraftStudentLabel && (
                          <span className="my-space-student-chip">{artifact.sourceDraftStudentLabel}</span>
                        )}
                        <div className="my-space-card-actions">
                          <button
                            type="button"
                            className="my-space-card-primary"
                            disabled={busyId === artifact.id}
                            onClick={() => void downloadArtifact(artifact)}
                          >
                            <Download size={14} /> 下载 PDF
                          </button>
                          <button
                            type="button"
                            className="my-space-card-ghost"
                            disabled={busyId === artifact.id}
                            onClick={() => void downloadArtifact(artifact, 'save-as')}
                          >
                            <Save size={14} /> 另存为…
                          </button>
                          <button type="button" className="my-space-card-ghost" onClick={() => openSourceDraft(artifact)}>
                            打开原草稿
                          </button>
                          <button
                            type="button"
                            className="my-space-card-danger"
                            aria-label="删除"
                            title="删除"
                            disabled={busyId === artifact.id}
                            onClick={() => requestDeleteArtifact(artifact)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </div>

    {confirmPresence.rendered && (
      <div className="my-space-modal-backdrop" role="presentation" data-visible={confirmPresence.visible}>
        <div
          className="my-space-confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="my-space-confirm-dialog-title"
          data-visible={confirmPresence.visible}
        >
          <h3 id="my-space-confirm-dialog-title">删除草稿卷 PDF</h3>
          <p>
            删除「{confirmPresence.rendered.title || confirmPresence.rendered.fileName}」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。
          </p>
          <div className="my-space-confirm-actions">
            <button type="button" ref={cancelButtonRef} onClick={() => setConfirmTarget(null)}>
              取消
            </button>
            <button type="button" className="my-space-card-danger" onClick={() => void confirmDeleteArtifact()}>
              删除 PDF
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
