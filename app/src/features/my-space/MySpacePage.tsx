import { Folder, Paper, Save, Trash } from '../../icons'
import { DownloadFeedbackIcon } from '../../icons/MotionIcons'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { FluidHoverList } from '../../components/FluidHoverList'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { MySpaceArtifact, MySpaceFolder } from '../../domain/questionBank'
import { deleteMySpaceArtifact, downloadMySpaceArtifact, fetchMySpace } from '../../services/mySpace'
import { prepareFileSaveTarget, type FileSaveMode } from '../../services/fileDownload.ts'
import { describeError } from '../shared/errorCopy'
import { Button } from '../../shared-ui/Button.tsx'
import { Dialog } from '../../shared-ui/Dialog.tsx'
import { EmptyState } from '../../shared-ui/EmptyState.tsx'
import { Menu } from '../../shared-ui/Menu.tsx'
import { Notice, type NoticeKind } from '../../shared-ui/Notice.tsx'
import { planFocusAfterRemoval, programmaticFocusTarget } from '../../shared-ui/focusAfterRemoval.ts'
import { Row, RowList } from '../../shared-ui/Row.tsx'
import { Skeleton, SkeletonGate } from '../../shared-ui/Skeleton.tsx'
import { useDelayedBusy } from '../../shared-ui/useDelayedBusy.ts'
import { useRowReveal } from '../../shared-ui/useRowReveal.ts'
import './MySpacePage.css'

export type MySpacePageProps = {
  onBackToWorkbench: () => void
  onOpenDraft: (draftPaperId: string) => void
  shellNav: AppTopbarNav
}

type LoadState = 'loading' | 'loaded' | 'error'

// 页面上那一行提示（原来是手写的 <p className="my-space-message">）换成共用 Notice 以后要分种类：
// 出错（读取、下载、删除失败）、说明（原草稿卷已删除）、做完了（文件已删除）。字照原来。
type PageMessage = { kind: NoticeKind; text: string }

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
  return (
    <Menu
      label={`更多操作：${artifact.title || artifact.fileName}`}
      triggerClassName="my-space-row-menu-trigger"
      triggerDisabled={disabled}
      // 和同一行的「下载」「打开原草稿」一样高（36，窄屏 34 见 MySpacePage.css）。
      triggerSize="lg"
      // 原来的菜单就关掉了空隙点击：面板边上点一下不算点「删除文件」（第六页补回，见 Menu.tsx 头注释）。
      gapClick={false}
      items={[
        { key: 'save-as', label: '另存为…', icon: <Save size={16} aria-hidden="true" />, onSelect: () => onSaveAs() },
        {
          key: 'delete',
          label: '删除文件',
          icon: <Trash size={16} aria-hidden="true" />,
          tone: 'danger',
          // 确认框接焦点；关掉确认框时焦点回这个触发键（requestDeleteArtifact 记下它）。
          restoreFocus: false,
          onSelect: (_event, trigger) => {
            if (trigger) onDelete(trigger)
          },
        },
      ]}
    />
  )
}

// 文件列表在等时的灰块（等待第六轮，2026-11-15；原来是分区标题下面一行「正在读取个人空间」）。
// 照真列表画：月份那一行、板里 3 行文件（图标、标题、页数日期一行、右边三个键的字），用真列表同一套 class，
// 行高照真行（70，MySpacePage.css .my-space-file-row），灰块放在字的位置。整块对读屏隐藏，读屏那一句由 SkeletonGate 给。
const SKELETON_FILE_TITLE_WIDTHS = [96, 132, 112]

function MySpaceListSkeleton(): ReactNode {
  return (
    <section className="my-space-month-group my-space-list-skeleton" aria-hidden="true">
      <div className="my-space-month-head">
        <span className="my-space-month-label"><Skeleton inline width={88} height={10} /></span>
      </div>
      <RowList axis="y" className="my-space-file-list" itemSelector=".my-space-list-skeleton-none" gapClick={false}>
        {SKELETON_FILE_TITLE_WIDTHS.map((width, index) => (
          <Row className="my-space-file-row" padding="none" key={index}>
            <Skeleton width={24} height={24} />
            <div className="my-space-file-copy">
              <h3><Skeleton inline width={width} height={12} /></h3>
              <p><span><Skeleton inline width={88} height={10} /></span></p>
            </div>
            <div className="my-space-row-actions">
              <Skeleton width={48} height={12} />
              <Skeleton width={66} height={12} />
              <Skeleton width={16} height={12} />
            </div>
          </Row>
        ))}
      </RowList>
    </section>
  )
}

export function MySpacePage({ onBackToWorkbench, onOpenDraft, shellNav }: MySpacePageProps): ReactNode {
  const [folders, setFolders] = useState<MySpaceFolder[]>([])
  const [artifacts, setArtifacts] = useState<MySpaceArtifact[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState<PageMessage | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 只给下载用：busyId 同时管删除，直接拿它驱动下载图标的话，删文件时下载图标也会动（D8）。
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<MySpaceArtifact | null>(null)
  // 开关和内容分开（界面收尾 2026-11-16，照 App.tsx 删除题组、听写页确认框的写法）：关上时只把 confirmOpen 置 false，
  // confirmTarget 留着，退场那 120ms 里正文不会变成「删除「」？…」；下次打开时整个换掉。
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  )
  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders])
  const monthGroups = useMemo(() => groupArtifactsByMonth(artifacts), [artifacts])

  // A monotonically increasing token prevents a stale folder response replacing a newer one.
  const loadTokenRef = useRef(0)
  // keepList：删完文件以后重新取数时不把列表换成「正在读取」，列表一直挂着，
  // 焦点才能留在（或落到）下一份文件的键上，不掉到页面最外层（见 confirmDeleteArtifact）。
  const load = useCallback(async (folderId = selectedFolderId, { keepList = false }: { keepList?: boolean } = {}) => {
    const token = ++loadTokenRef.current
    if (!keepList) setLoadState('loading')
    setMessage(null)
    try {
      const snapshot = await fetchMySpace(folderId)
      if (loadTokenRef.current !== token) return
      setFolders(snapshot.folders)
      setArtifacts(snapshot.artifacts)
      setLoadState('loaded')
    } catch (error) {
      if (loadTokenRef.current !== token) return
      setLoadState('error')
      setMessage({ kind: 'error', text: describeError('加载个人空间', error) })
    }
  }, [selectedFolderId])

  useEffect(() => { void load() }, [load])

  function selectFolder(folderId: string | null) {
    setSelectedFolderId(folderId)
  }

  async function downloadArtifact(artifact: MySpaceArtifact, mode: FileSaveMode = 'download') {
    setMessage(null)
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: artifact.fileName || '英语草稿卷.pdf',
        mimeType: 'application/pdf',
      })
      if (!target) return
      setBusyId(artifact.id)
      setDownloadingId(artifact.id)
      await downloadMySpaceArtifact(artifact, target)
    } catch (error) {
      setMessage({ kind: 'error', text: describeError(mode === 'save-as' ? '另存为 PDF' : '下载 PDF', error) })
    } finally {
      setBusyId(null)
      setDownloadingId(null)
    }
  }

  function openSourceDraft(artifact: MySpaceArtifact) {
    if (!artifact.sourceDraftExists) {
      setMessage({ kind: 'info', text: '原草稿卷已删除，PDF 仍可下载' })
      return
    }
    onOpenDraft(artifact.sourceDraftPaperId)
  }

  // 关上确认框时焦点回到打开它的那个键：菜单项在打开时已经关掉了，所以记下菜单的触发键（Menu 交来的 trigger），
  // 交给 Dialog 的 returnFocus。焦点圈、Esc、退场动画都由共用 Dialog 管（原来这里自己写的 keydown 循环删了）。
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // 确认删除以后焦点落在哪（shared-ui/focusAfterRemoval.ts 的规则）：下一份文件的「更多操作」键 → 没有下一份就上一份 →
  // 一份都不剩就落到分区标题（h2）。确认框关上时就交给 Dialog 的 returnFocus（被删那一行这时还在、但键已禁用），
  // 删完、重新取数以后再落一次（行重画了）。取消时仍回到打开它的键。
  const focusAfterDeleteRef = useRef<(() => HTMLElement | null) | null>(null)
  const sectionHeadingRef = useRef<HTMLHeadingElement>(null)
  // 等待第四轮（2026-11-15）：文件第一次读回来时，月份行和文件行从上到下依次淡入。
  // 只演第一次（once）：换文件夹、删完重读都不演。
  const fileListRef = useRef<HTMLElement>(null)
  // 等待第六轮（2026-11-15）：读取中画文件列表的灰块，走门槛（300ms 内不出、出了至少留 500ms，这期间文件到了也先不换上）。
  // listWaiting = 灰块那一块还占着位置；文件行等它走了才挂，淡入也等那一拍。
  const listPending = loadState === 'loading'
  const listPhase = useDelayedBusy(listPending)
  const listWaiting = listPending || listPhase === 'waiting'
  useRowReveal(fileListRef, '.my-space-month-head, .my-space-file-row', !listWaiting && loadState === 'loaded' && artifacts.length > 0, { once: true })
  // 删除失败时：那一行还在，焦点回到它的「更多操作」键（busy 解除、键能用以后）。
  const [focusAfterBusy, setFocusAfterBusy] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (busyId !== null || !focusAfterBusy) return
    if (focusAfterBusy.isConnected) focusAfterBusy.focus()
    setFocusAfterBusy(null)
  }, [busyId, focusAfterBusy])

  function requestDeleteArtifact(artifact: MySpaceArtifact, trigger: HTMLElement) {
    restoreFocusRef.current = trigger
    focusAfterDeleteRef.current = null
    setConfirmTarget(artifact)
    setConfirmOpen(true)
  }

  async function confirmDeleteArtifact() {
    const artifact = confirmTarget
    if (!artifact) return
    const trigger = restoreFocusRef.current
    const focusNext = trigger
      ? planFocusAfterRemoval(trigger, {
          item: '.my-space-file-row',
          key: 'data-artifact-id',
          control: '.my-space-row-menu-trigger',
          fallback: () => programmaticFocusTarget(sectionHeadingRef.current),
        })
      : () => programmaticFocusTarget(sectionHeadingRef.current)
    focusAfterDeleteRef.current = focusNext
    setConfirmOpen(false)
    setBusyId(artifact.id)
    setMessage(null)
    try {
      await deleteMySpaceArtifact(artifact.id)
      await load(selectedFolderId, { keepList: true })
      setMessage({ kind: 'success', text: '文件已删除。' })
      focusNext()?.focus()
    } catch (error) {
      setMessage({ kind: 'error', text: describeError('删除文件', error) })
      // 没删掉：那一行还在，确认框若还在退场，关上时也回到它，不去下一行。
      focusAfterDeleteRef.current = () => trigger
      if (trigger) setFocusAfterBusy(trigger)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="my-space-page">
      <AppTopbar {...shellNav} onBack={onBackToWorkbench} />
      <div className="my-space-shell">
        {/* 用 div 不用 header：它在 <main> 外面，header 会成第二个 banner（顶栏已经是 banner；Impeccable audit 2026-11-20）。 */}
        <div className="my-space-heading">
          <h1>个人空间</h1>
          <p>已保存的 PDF</p>
        </div>

        {/* 页面提示行换成共用 Notice（构件收尾，2026-11-15）：一行次要灰字加 16px 图标；出错读屏马上念（role=alert）。
            位置照原来（.my-space-message 的外边距）。 */}
        {message && loadState !== 'error' && <Notice kind={message.kind} className="my-space-message">{message.text}</Notice>}

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
                    <Folder size={20} aria-hidden="true" />
                    <span title={folder.name}>{folder.name}</span>
                    <span className="my-space-folder-count">{folder.artifactCount}</span>
                  </button>
                ))}
              </FluidHoverList>
            </aside>
          )}

          <main className="my-space-main" ref={fileListRef}>
            <div className="my-space-section-head">
              <div>
                {/* 删完最后一份文件时焦点落在这里（programmaticFocusTarget 临时给 tabindex=-1，Tab 不停）。 */}
                <h2 ref={sectionHeadingRef}>{selectedFolder?.name || '全部文件'}</h2>
                {/* 读取中这一行小字也画灰块，分区标题那块一样高（42 → 43.4），下面的灰块和真行同位。 */}
                {listWaiting
                  ? <span aria-hidden="true"><Skeleton inline width={84} height={10} /></span>
                  : loadState === 'loaded' && <span>{artifacts.length} 份已保存文件</span>}
              </div>
              {/* Search and other future capabilities belong here only after they are real. */}
            </div>

            {/* 读取失败换成共用 Notice（构件收尾，2026-11-15），字照原来。读取中原来也是一行 Notice，等待第六轮换成灰块。 */}
            {listWaiting && (
              <SkeletonGate pending={listPending} phase={listPhase} label="正在读取个人空间" skeleton={<MySpaceListSkeleton />} />
            )}
            {!listWaiting && loadState === 'error' && (
              <div className="my-space-empty-state">
                <Notice kind="error" className="my-space-error">{message?.text || '个人空间读取失败。'}</Notice>
                <Button className="my-space-empty-cta" tone="primary" size="lg" onClick={() => void load()}>重新加载</Button>
              </div>
            )}
            {!listWaiting && loadState === 'loaded' && artifacts.length === 0 && (
              // 个人空间空态用坐石獭獭（BRAND.md §7 第 118 条），换掉原来的平涂文件夹插图。
              <EmptyState className="my-space-empty-placed" otter="otter-sit" action={{ label: '去找题', onClick: onBackToWorkbench }}>
                试卷导出为 PDF 后，可以保存在这里。
              </EmptyState>
            )}
            {!listWaiting && loadState === 'loaded' && artifacts.length > 0 && monthGroups.map((group) => (
              <section className="my-space-month-group" key={group.key} aria-label={group.label}>
                <div className="my-space-month-head">
                  <span className="my-space-month-label">{group.label}</span>
                  <span className="my-space-month-count">{group.artifacts.length} 份</span>
                </div>
                {/* 文件列表是共用构件 shared-ui/Row（2026-11-15）：<ul> + 每份文件一个 <li>（原来 div + article），
                    板、行间分隔线由 RowList 给。文件行不可点（不给 action），三个键各自是键。
                    滑块悬停照原来留在文件行上（itemSelector 指名 .my-space-file-row）：Row 的规矩是不可点的行不加悬停，
                    但 Owner 2026-11-14 决定 #4 说过滑块停在这一行时键自己垫底，去不去要 Owner 定，见设计记录。 */}
                <RowList
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
                      <Row className="my-space-file-row" padding="none" key={artifact.id} data-artifact-id={artifact.id}>
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
                          <Button
                            tone="subtle"
                            size="lg"
                            disabled={busyId === artifact.id}
                            icon={<DownloadFeedbackIcon size={16} working={downloadingId === artifact.id} />}
                            onClick={() => void downloadArtifact(artifact)}
                          >
                            下载
                          </Button>
                          <Button tone="subtle" size="lg" onClick={() => openSourceDraft(artifact)}>打开原草稿</Button>
                          <ArtifactMenu
                            artifact={artifact}
                            disabled={busyId === artifact.id}
                            onSaveAs={() => void downloadArtifact(artifact, 'save-as')}
                            onDelete={(trigger) => requestDeleteArtifact(artifact, trigger)}
                          />
                        </div>
                      </Row>
                    )
                  })}
                </RowList>
              </section>
            ))}
          </main>
        </div>
      </div>

      <Dialog
        tone="alert"
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        className="my-space-confirm-dialog"
        title="删除草稿卷 PDF"
        description={`删除「${confirmTarget?.title || confirmTarget?.fileName || ''}」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。`}
        // 取消、Esc：回到打开它的键。确认删除：落到下一份文件（见 confirmDeleteArtifact）。
        returnFocus={() => focusAfterDeleteRef.current?.() || restoreFocusRef.current}
        cancel={{ label: '取消' }}
        confirm={{ label: '删除 PDF', className: 'my-space-delete-confirm', onClick: () => void confirmDeleteArtifact() }}
      />
    </div>
  )
}
