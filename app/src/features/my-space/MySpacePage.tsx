import { Download, FileText, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MySpaceArtifact, MySpaceFolder } from '../../domain/questionBank'
import {
  createMySpaceFolder,
  deleteMySpaceArtifact,
  deleteMySpaceFolder,
  downloadMySpaceArtifact,
  fetchMySpace,
  renameMySpaceFolder,
} from '../../services/mySpace'
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

function folderLabel(folder: MySpaceFolder) {
  return `${folder.name} · ${folder.artifactCount}`
}

export function MySpacePage({ onBackToWorkbench, onOpenDraft, shellNav }: MySpacePageProps): ReactNode {
  const [folders, setFolders] = useState<MySpaceFolder[]>([])
  const [artifacts, setArtifacts] = useState<MySpaceArtifact[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

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

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setBusyId('new-folder')
    setMessage('')
    try {
      const folder = await createMySpaceFolder(name)
      setNewFolderName('')
      setSelectedFolderId(folder.id)
      await load(folder.id)
      setMessage('文件夹已创建。')
    } catch (error) {
      setMessage(describeError('新建文件夹', error))
    } finally {
      setBusyId(null)
    }
  }

  async function renameFolder(folder: MySpaceFolder) {
    const name = renameDraft.trim()
    if (!name) return
    setBusyId(folder.id)
    setMessage('')
    try {
      await renameMySpaceFolder(folder.id, name)
      setRenamingFolderId(null)
      setRenameDraft('')
      await load(selectedFolderId)
      setMessage('文件夹已重命名。')
    } catch (error) {
      setMessage(describeError('重命名文件夹', error))
    } finally {
      setBusyId(null)
    }
  }

  async function removeFolder(folder: MySpaceFolder) {
    setBusyId(folder.id)
    setMessage('')
    try {
      await deleteMySpaceFolder(folder.id)
      const nextFolderId = selectedFolderId === folder.id ? null : selectedFolderId
      setSelectedFolderId(nextFolderId)
      await load(nextFolderId)
      setMessage('文件夹已删除。')
    } catch (error) {
      setMessage(describeError('删除文件夹', error))
    } finally {
      setBusyId(null)
    }
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

  async function removeArtifact(artifact: MySpaceArtifact) {
    if (!window.confirm(`删除「${artifact.fileName}」？PDF 文件也会删除。`)) return
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
      </header>

      {message && loadState !== 'error' && <p className="my-space-message" role="status">{message}</p>}

      <main className="my-space-layout">
        <aside className="my-space-folders" aria-label="文件夹">
          <button
            className={!selectedFolderId ? 'active' : ''}
            type="button"
            onClick={() => void selectFolder(null)}
          >
            <Folder size={16} /> 全部文件
          </button>
          {folders.map((folder) => (
            <div className={`my-space-folder-row${selectedFolderId === folder.id ? ' active' : ''}`} key={folder.id}>
              {renamingFolderId === folder.id ? (
                <>
                  <input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                  <button type="button" disabled={busyId === folder.id} onClick={() => void renameFolder(folder)}>
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void selectFolder(folder.id)}>
                    <Folder size={16} /> {folderLabel(folder)}
                  </button>
                  <button
                    aria-label="重命名文件夹"
                    type="button"
                    onClick={() => {
                      setRenamingFolderId(folder.id)
                      setRenameDraft(folder.name)
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="删除文件夹"
                    disabled={busyId === folder.id}
                    type="button"
                    onClick={() => void removeFolder(folder)}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="my-space-new-folder">
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="新建文件夹"
            />
            <button type="button" disabled={!newFolderName.trim() || busyId === 'new-folder'} onClick={createFolder}>
              <FolderPlus size={15} /> 新建
            </button>
          </div>
        </aside>

        <section className="my-space-artifacts" aria-label="保存文件">
          <div className="my-space-section-head">
            <div>
              <p>{selectedFolder ? selectedFolder.name : '全部文件'}</p>
              <h2>{artifacts.length} 个 PDF</h2>
            </div>
          </div>

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
              <p className="my-space-empty">还没有保存的草稿卷 PDF。组一份卷子，导出后可以保存在这里。</p>
              <button type="button" className="my-space-empty-cta" onClick={() => onOpenDraft('')}>
                去组一份卷子
              </button>
            </div>
          )}
          {loadState === 'loaded' && artifacts.length > 0 && (
            <div className="my-space-artifact-list">
              {artifacts.map((artifact) => (
                <article className="my-space-artifact-row" key={artifact.id}>
                  <div className="my-space-artifact-main">
                    <FileText size={18} />
                    <div>
                      <strong>{artifact.title || artifact.fileName}</strong>
                      <span>
                        {formatDate(artifact.generatedAt)} · {artifact.pageCount || 1} 页 · {artifact.sourceDraftExists ? artifact.sourceDraftTitle || '原草稿卷' : '原草稿卷已删除'}
                      </span>
                    </div>
                  </div>
                  <div className="my-space-artifact-actions">
                    <button type="button" disabled={busyId === artifact.id} onClick={() => void downloadArtifact(artifact)}>
                      <Download size={14} /> 下载 PDF
                    </button>
                    <button type="button" onClick={() => openSourceDraft(artifact)}>
                      打开原草稿
                    </button>
                    <button type="button" disabled={busyId === artifact.id} onClick={() => void removeArtifact(artifact)}>
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
    </>
  )
}
