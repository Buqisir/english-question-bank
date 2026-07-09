import { Download, FileText, Trash2 } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MySpaceArtifact, MySpaceFolder } from '../../domain/questionBank'
import { deleteMySpaceArtifact, downloadMySpaceArtifact, fetchMySpace } from '../../services/mySpace'
import { describeError } from '../shared/errorCopy'
import './MySpacePage.css'

export type MySpacePageProps = {
  onBackToWorkbench: () => void
  onOpenDraft: (draftPaperId: string) => void
  shellNav: AppTopbarNav
}

type LoadState = 'loading' | 'loaded' | 'error'

function formatDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function sourceLabel(artifact: MySpaceArtifact) {
  return artifact.sourceDraftExists ? artifact.sourceDraftTitle || '原草稿卷' : '原草稿卷已删除'
}

export function MySpacePage({ onBackToWorkbench, onOpenDraft, shellNav }: MySpacePageProps): ReactNode {
  const [folders, setFolders] = useState<MySpaceFolder[]>([])
  const [artifacts, setArtifacts] = useState<MySpaceArtifact[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<MySpaceArtifact | null>(null)

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  )

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

  async function downloadArtifact(artifact: MySpaceArtifact) {
    setBusyId(artifact.id)
    setMessage('')
    try {
      await downloadMySpaceArtifact(artifact)
    } catch (error) {
      setMessage(describeError('下载 PDF', error))
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
        <h1>已保存的草稿卷</h1>
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
          <div className="my-space-grid" aria-label={selectedFolder ? selectedFolder.name : '全部保存文件'}>
            {artifacts.map((artifact) => (
              <article className="my-space-card" key={artifact.id}>
                <strong className="my-space-card-title" title={artifact.title || artifact.fileName}>
                  {artifact.title || artifact.fileName}
                </strong>
                <p className="my-space-card-meta">
                  {formatDate(artifact.generatedAt)} · {artifact.pageCount || 1} 页 · {sourceLabel(artifact)}
                </p>
                <div className="my-space-card-actions">
                  <button
                    type="button"
                    className="my-space-card-primary"
                    disabled={busyId === artifact.id}
                    onClick={() => void downloadArtifact(artifact)}
                  >
                    <Download size={14} /> 下载 PDF
                  </button>
                  <button type="button" className="my-space-card-ghost" onClick={() => openSourceDraft(artifact)}>
                    打开原草稿
                  </button>
                  <button
                    type="button"
                    className="my-space-card-danger"
                    disabled={busyId === artifact.id}
                    onClick={() => requestDeleteArtifact(artifact)}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>

    {confirmTarget && (
      <div
        className="my-space-modal-backdrop"
        role="presentation"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setConfirmTarget(null)
        }}
      >
        <div className="my-space-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="确认删除文件">
          <p>
            删除「{confirmTarget.fileName}」？PDF 文件也会删除。
          </p>
          <div className="my-space-confirm-actions">
            <button type="button" onClick={() => setConfirmTarget(null)}>
              取消
            </button>
            <button type="button" className="my-space-card-danger" onClick={() => void confirmDeleteArtifact()}>
              确认删除
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
