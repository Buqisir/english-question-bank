import {
  Card,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  PaperCheck,
  Link,
  ListChecks,
  PauseCircle,
  Pin,
  Printer,
  QrCode,
  Search,
  Save,
  Shuffle,
  Sparkles,
  X,
} from '../../icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { FluidHoverList } from '../../components/FluidHoverList'
import type { VocabularySetEntry } from '../../domain/vocabulary'
import {
  createVocabularyDictationTask,
  downloadCombinedVocabularyMaterialsZip,
  downloadCombinedVocabularyPdf,
  downloadVocabularyDictationTaskMaterialsZip,
  downloadVocabularyDictationTaskPdf,
  downloadVocabularyMeaningRecallRecordMaterialsZip,
  downloadVocabularyMeaningRecallRecordPdf,
  getStudentVocabularyMeaningStates,
  getSuggestedVocabularyMeaningRecall,
  getVocabularySet,
  getVocabularySetLibrary,
  listVocabularyDictationRecords,
  listVocabularyDictationTasks,
  listVocabularyMeaningRecallRecords,
  listVocabularyStudents,
  revokeVocabularyDictationTaskShare,
  shareVocabularyDictationTask,
  updateStudentVocabularyWordFlag,
  vocabularyMeaningRecallRecordMaterialFileName,
  voidVocabularyMeaningRecallRecord,
  type StudentVocabularyMeaningStateDto,
  type VocabularyDictationRecordDto,
  type VocabularyDictationTaskDto,
  type VocabularyHandwritingMode,
  type VocabularyMeaningRecallRecordDto,
  type VocabularyMaterialKind,
  type VocabularySetLibraryDto,
  type VocabularySetLibraryItemDto,
  type VocabularyStudentDto,
  VOCABULARY_MATERIAL_KINDS,
} from '../../services/vocabulary'
import { prepareFileSaveTarget, type FileSaveMode } from '../../services/fileDownload.ts'
import { VocabularyMeaningRecallPanel } from './VocabularyMeaningRecallPanel'
import {
  VocabularyHandwritingSelector,
  type VocabularyHandwritingEntry,
} from '../vocabulary-practice/VocabularyHandwritingSelector'
import '../vocabulary-practice/vocabularyHandwriting.css'
import './vocabularyDictationWorkbench.css'

const ACTIVE_STUDENT_STORAGE_KEY = 'eqb-vocabulary-active-student-wanwei-round-one-v1'
const SUGGESTION_TARGET_STORAGE_KEY = 'eqb-vocabulary-review-suggestion-target-v1'
type WorkspaceTab = 'sets' | 'meaning' | 'tasks' | 'review' | 'history'
type Accent = 'american' | 'british'
type PrintKind = VocabularyMaterialKind
type ReviewFilter = 'all' | 'frequent'
type HistoryFilter = 'meaning' | 'dictation'
type DictationTaskDateGroup = {
  dateKey: string
  tasks: VocabularyDictationTaskDto[]
}

type HandwritingDownloadRequest = {
  mode: FileSaveMode
  title: string
  entries: VocabularyHandwritingEntry[]
  source:
    | { kind: 'sets'; sourceSetIds: string[]; layout: 'dedupe' | 'grouped' }
    | { kind: 'task'; taskId: string }
}


type DownloadOptionProps = {
  label: string
  disabled?: boolean
  children: React.ReactNode
  onDownload: () => void
  onSaveAs: () => void
}

function DownloadOption({ label, disabled = false, children, onDownload, onSaveAs }: DownloadOptionProps) {
  function run(action: () => void, button: HTMLButtonElement) {
    button.closest('details')?.removeAttribute('open')
    action()
  }

  return (
    <div className="dictation-download-option">
      <button type="button" disabled={disabled} onClick={(event) => run(onDownload, event.currentTarget)}>{children}</button>
      <button
        type="button"
        className="dictation-save-as-button"
        aria-label={`${label}另存为`}
        disabled={disabled}
        onClick={(event) => run(onSaveAs, event.currentTarget)}
      >
        <Save size={13} aria-hidden="true" />另存为…
      </button>
    </div>
  )
}

function DownloadMenuItems({ children }: { children: React.ReactNode }) {
  return (
    <FluidHoverList as="div" className="dictation-download-items" axis="y" itemSelector=".dictation-download-option, .dictation-download-action">
      {children}
    </FluidHoverList>
  )
}

function today() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function displayDate(value: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}.${month}.${day}`
}

function taskDateHeading(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return dateKey
  return `${year}年${month}月${day}日`
}

function taskRowTitle(task: VocabularyDictationTaskDto) {
  const datePrefix = `${task.taskDate} `
  return task.title.startsWith(datePrefix) ? task.title.slice(datePrefix.length) : task.title
}

function groupTasksByDate(tasks: VocabularyDictationTaskDto[]): DictationTaskDateGroup[] {
  const groups = new Map<string, VocabularyDictationTaskDto[]>()
  for (const task of tasks) {
    const dateKey = task.taskDate
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), task])
  }
  return [...groups]
    .map(([dateKey, dateTasks]) => ({ dateKey, tasks: dateTasks }))
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
}

function dedupeTaskEntries(tasks: VocabularyDictationTaskDto[]) {
  const seen = new Set<string>()
  return tasks.flatMap((task) => task.entries).filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

function defaultCollectionTitle(studentName: string) {
  return `${studentName} · 生词合集 · ${today()}`
}

function defaultTaskTitle() {
  return `${today()} 综合听写`
}


function dedupeEntries(sets: VocabularySetLibraryItemDto[]) {
  const seen = new Set<string>()
  const entries: VocabularySetEntry[] = []
  for (const set of sets) {
    for (const entry of set.entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      entries.push(entry)
    }
  }
  return entries
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function splitEvery<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function formatMeaning(entry: VocabularySetEntry) {
  return entry.sourceMeanings.length ? entry.sourceMeanings.join('；') : entry.teachingSense
}

function countRecordResults(record: VocabularyDictationRecordDto) {
  return record.entries.reduce((counts, entry) => {
    counts[entry.result] += 1
    return counts
  }, { correct: 0, wrong: 0, untested: 0 })
}

function countMeaningRecordResults(record: VocabularyMeaningRecallRecordDto) {
  return record.entries.reduce((counts, entry) => {
    counts[entry.result] += 1
    return counts
  }, { correct: 0, wrong: 0, untested: 0 })
}

export function VocabularyDictationWorkbench({
  onBackToVocabulary,
  requestedSetId,
  shellNav,
}: {
  onBackToVocabulary: () => void
  requestedSetId?: string | null
  shellNav: AppTopbarNav
}) {
  const [students, setStudents] = useState<VocabularyStudentDto[]>([])
  const [activeStudentId, setActiveStudentId] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tab, setTab] = useState<WorkspaceTab>('sets')
  const [library, setLibrary] = useState<VocabularySetLibraryDto>({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false })
  const [tasks, setTasks] = useState<VocabularyDictationTaskDto[]>([])
  const [records, setRecords] = useState<VocabularyDictationRecordDto[]>([])
  const [meaningRecords, setMeaningRecords] = useState<VocabularyMeaningRecallRecordDto[]>([])
  const [meaningStates, setMeaningStates] = useState<StudentVocabularyMeaningStateDto[]>([])
  const [meaningSessionActive, setMeaningSessionActive] = useState(false)
  const [selectedSets, setSelectedSets] = useState<VocabularySetLibraryItemDto[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [printMode, setPrintMode] = useState<'dedupe' | 'grouped'>('dedupe')
  const [accent, setAccent] = useState<Accent>('american')
  const [shuffleBeforeFreeze, setShuffleBeforeFreeze] = useState(false)
  const [collectionTitle, setCollectionTitle] = useState('')
  const [taskTitle, setTaskTitle] = useState(defaultTaskTitle)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [createdTasks, setCreatedTasks] = useState<VocabularyDictationTaskDto[]>([])
  const [handwritingDownloadRequest, setHandwritingDownloadRequest] = useState<HandwritingDownloadRequest | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState(() => {
    const stored = Number(window.localStorage.getItem(SUGGESTION_TARGET_STORAGE_KEY))
    return Math.max(1, Math.min(60, stored || 20))
  })
  const [suggestion, setSuggestion] = useState<Array<VocabularySetEntry & { sourceSetIds: string[]; reason: string }>>([])
  const [showPausedReview, setShowPausedReview] = useState(false)
  const [reviewMode, setReviewMode] = useState<ReviewFilter>('all')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('meaning')
  const [requestedMeaningRecordId, setRequestedMeaningRecordId] = useState<string | null>(null)
  const [requestedMeaningReview, setRequestedMeaningReview] = useState<{
    requestId: string
    entries: Array<VocabularySetEntry & { sourceSetIds: string[] }>
  } | null>(null)
  const [libraryRefreshVersion, setLibraryRefreshVersion] = useState(0)
  const createdTasksRef = useRef<HTMLElement | null>(null)
  const studentDataVersionRef = useRef(0)
  const activeStudentIdRef = useRef('')
  const meaningSaveBarrierRef = useRef<(() => Promise<boolean>) | null>(null)

  const registerMeaningSaveBarrier = useCallback((barrier: (() => Promise<boolean>) | null) => {
    meaningSaveBarrierRef.current = barrier
  }, [])

  async function flushMeaningSaves() {
    const barrier = meaningSaveBarrierRef.current
    if (!barrier) return true
    try {
      const saved = await barrier()
      if (!saved) setError('认词结果尚未保存，请重试后再离开。')
      return saved
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '认词结果尚未保存，请重试后再离开。')
      return false
    }
  }

  async function switchWorkbenchTab(nextTab: WorkspaceTab) {
    if (nextTab === tab) return
    if (!await flushMeaningSaves()) return
    setTab(nextTab)
  }

  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null
  const uniqueSelectedEntries = useMemo(() => dedupeEntries(selectedSets), [selectedSets])
  const rawSelectedCount = selectedSets.reduce((sum, set) => sum + set.entryCount, 0)
  const taskDateGroups = useMemo(() => groupTasksByDate(tasks), [tasks])
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const selectedTasks = useMemo(() => tasks.filter((task) => selectedTaskIdSet.has(task.id)), [selectedTaskIdSet, tasks])
  const selectedTaskRawCount = selectedTasks.reduce((sum, task) => sum + task.entryCount, 0)
  const selectedTaskUniqueCount = useMemo(() => dedupeTaskEntries(selectedTasks).length, [selectedTasks])
  const reviewWords = meaningStates.filter((state) => state.status !== 'improved')
  const filteredReviewWords = reviewWords.filter((word) => (
    reviewMode === 'all'
    || (reviewMode === 'frequent' && word.status === 'repeated')
  ))
  const pausedReviewCount = filteredReviewWords.filter((word) => word.paused).length
  const visibleReviewWords = filteredReviewWords.filter((word) => !word.paused || showPausedReview)
  const selectedReviewWords = reviewWords.filter((word) => !word.paused && selectedReviewIds.includes(word.id))
  const detectionHistory = useMemo(() => historyFilter === 'meaning'
    ? meaningRecords.map((record) => ({ kind: 'meaning' as const, date: record.recallDate, updatedAt: record.updatedAt, record }))
      .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt))
    : records.map((record) => ({ kind: 'dictation' as const, date: record.dictationDate, updatedAt: record.updatedAt, record }))
      .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)),
  [historyFilter, meaningRecords, records])

  useEffect(() => {
    const availableIds = new Set(tasks.map((task) => task.id))
    setSelectedTaskIds((current) => current.filter((id) => availableIds.has(id)))
  }, [tasks])

  useEffect(() => {
    if (!createdTasks.length) return
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      createdTasksRef.current?.scrollIntoView({ behavior, block: 'nearest' })
      createdTasksRef.current?.focus({ preventScroll: true })
    })
  }, [createdTasks.length])

  const refreshStudentData = useCallback(async (studentId: string) => {
    const requestedVersion = studentDataVersionRef.current + 1
    studentDataVersionRef.current = requestedVersion
    const [nextTasks, nextRecords, nextMeaningRecords, nextMeaningStates] = await Promise.all([
      listVocabularyDictationTasks(studentId),
      listVocabularyDictationRecords(studentId),
      listVocabularyMeaningRecallRecords(studentId),
      getStudentVocabularyMeaningStates(studentId),
    ])
    if (requestedVersion !== studentDataVersionRef.current || studentId !== activeStudentIdRef.current) return
    setTasks(nextTasks)
    setRecords(nextRecords)
    setMeaningRecords(nextMeaningRecords)
    setMeaningStates(nextMeaningStates)
    setLibraryRefreshVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    listVocabularyStudents()
      .then((nextStudents) => {
        if (cancelled) return
        setStudents(nextStudents)
        const saved = window.localStorage.getItem(ACTIVE_STUDENT_STORAGE_KEY)
        const nextId = nextStudents.some((student) => student.id === saved) ? saved! : nextStudents[0]?.id ?? ''
        activeStudentIdRef.current = nextId
        setActiveStudentId(nextId)
        setCollectionTitle(defaultCollectionTitle(nextStudents.find((student) => student.id === nextId)?.displayName ?? '学生'))
        setLoadState('ready')
      })
      .catch(() => { if (!cancelled) setLoadState('error') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!activeStudentId) return
    window.localStorage.setItem(ACTIVE_STUDENT_STORAGE_KEY, activeStudentId)
    const timer = window.setTimeout(() => {
      void refreshStudentData(activeStudentId).catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : '听写数据加载失败。')
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeStudentId, refreshStudentData])

  useEffect(() => {
    if (!activeStudentId) return
    let cancelled = false
    getVocabularySetLibrary({
      studentId: activeStudentId,
      page: library.page,
      pageSize: library.pageSize,
      query,
      from: fromDate,
      to: toDate,
    }).then((nextLibrary) => {
      if (!cancelled) setLibrary(nextLibrary)
    }).catch((nextError: unknown) => {
      if (!cancelled) setError(nextError instanceof Error ? nextError.message : '词组加载失败。')
    })
    return () => { cancelled = true }
  }, [activeStudentId, fromDate, library.page, library.pageSize, libraryRefreshVersion, query, toDate])

  useEffect(() => {
    if (!requestedSetId || !activeStudentId) return
    let cancelled = false
    getVocabularySet(requestedSetId).then(async (set) => {
      if (cancelled) return
      if (set.studentId !== activeStudentId) {
        await changeStudent(set.studentId)
        return
      }
      if (cancelled) return
      const libraryItem: VocabularySetLibraryItemDto = {
        ...set,
        dictationSummary: {
          recordCount: 0,
          latestWrongCount: 0,
          latestDate: null,
          pendingCount: 0,
          meaningRecall: { latestDate: null, pendingCount: 0, repeatedCount: 0 },
        },
      }
      setSelectedSets([libraryItem])
      setTab('meaning')
      const url = new URL(window.location.href)
      url.searchParams.delete('meaningRecallSetId')
      window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }).catch((nextError: unknown) => {
      if (!cancelled) setError(nextError instanceof Error ? nextError.message : '词组加载失败。')
    })
    return () => { cancelled = true }
  }, [activeStudentId, requestedSetId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLibrary((current) => ({ ...current, page: 1 }))
      setQuery(searchInput)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  function toggleSet(set: VocabularySetLibraryItemDto) {
    setSelectedSets((current) => current.some((item) => item.id === set.id)
      ? current.filter((item) => item.id !== set.id)
      : [...current, set])
  }

  async function changeStudent(studentId: string) {
    if (!await flushMeaningSaves()) return
    studentDataVersionRef.current += 1
    activeStudentIdRef.current = studentId
    setActiveStudentId(studentId)
    setSelectedSets([])
    setSelectedTaskIds([])
    setSelectedReviewIds([])
    setCreatedTasks([])
    setTasks([])
    setRecords([])
    setMeaningRecords([])
    setMeaningStates([])
    setRequestedMeaningRecordId(null)
    setSuggestion([])
    setShowPausedReview(false)
    setLibrary((current) => ({ ...current, items: [], page: 1, total: 0, hasMore: false }))
    setCollectionTitle(defaultCollectionTitle(students.find((student) => student.id === studentId)?.displayName ?? '学生'))
  }

  async function createTasks({ share }: { share: boolean }) {
    if (!activeStudent || !selectedSets.length) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const ordered = shuffleBeforeFreeze ? shuffled(uniqueSelectedEntries) : uniqueSelectedEntries
      const chunks = splitEvery(ordered, 60)
      if (chunks.length > 1 && !window.confirm(`共 ${ordered.length} 个去重词，将按冻结顺序拆成 ${chunks.length} 份。继续吗？`)) return
      const nextTasks: VocabularyDictationTaskDto[] = []
      for (const [index, chunk] of chunks.entries()) {
        const title = chunks.length > 1 ? `${taskTitle}（${index + 1}/${chunks.length}）` : taskTitle
        const chunkEntryIds = new Set(chunk.map((entry) => entry.id))
        const chunkSourceSetIds = selectedSets
          .filter((set) => set.entries.some((entry) => chunkEntryIds.has(entry.id)))
          .map((set) => set.id)
        const task = await createVocabularyDictationTask({
          studentId: activeStudent.id,
          sourceSetIds: chunkSourceSetIds,
          entryIds: chunk.map((entry) => entry.id),
          taskDate: today(),
          title,
          accent,
          share,
        })
        nextTasks.push(task)
      }
      setCreatedTasks(nextTasks)
      setTasks((current) => [...nextTasks, ...current])
      setSelectedSets([])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写生成失败。')
    } finally {
      setBusy(false)
    }
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((current) => current.includes(taskId)
      ? current.filter((id) => id !== taskId)
      : [...current, taskId])
  }

  function toggleTaskDateSelection(group: DictationTaskDateGroup) {
    const groupIds = group.tasks.map((task) => task.id)
    const allSelected = groupIds.every((id) => selectedTaskIdSet.has(id))
    setSelectedTaskIds((current) => {
      const next = new Set(current)
      if (allSelected) groupIds.forEach((id) => next.delete(id))
      else groupIds.forEach((id) => next.add(id))
      return [...next]
    })
  }

  async function exportSelectedTasksByDate(mode: FileSaveMode = 'download') {
    if (!activeStudentId || !selectedTasks.length) return
    const selectedDateGroups = groupTasksByDate(selectedTasks)
    const nextTasks: VocabularyDictationTaskDto[] = []
    let synced = false
    const syncCreatedTasks = () => {
      if (synced || !nextTasks.length) return
      synced = true
      const nextIds = new Set(nextTasks.map((task) => task.id))
      setCreatedTasks(nextTasks)
      setTasks((current) => [...nextTasks, ...current.filter((task) => !nextIds.has(task.id))])
      setSelectedTaskIds([])
    }

    setError('')
    setMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${selectedDateGroups[0]?.dateKey || today()}-合并听写`,
        mimeType: 'application/pdf',
        multiple: true,
      })
      if (!target) return
      setBusy(true)
      for (const group of selectedDateGroups) {
        const chunks = splitEvery(dedupeTaskEntries(group.tasks), 60)
        for (const [index, chunk] of chunks.entries()) {
          const baseTitle = `${group.dateKey} 合并听写`
          const task = await createVocabularyDictationTask({
            studentId: activeStudentId,
            sourceTaskIds: group.tasks.map((sourceTask) => sourceTask.id),
            entryIds: chunk.map((entry) => entry.id),
            taskDate: group.dateKey,
            title: chunks.length > 1 ? `${baseTitle}（${index + 1}/${chunks.length}）` : baseTitle,
            accent,
            share: true,
          })
          nextTasks.push(task)
        }
      }

      syncCreatedTasks()
      for (const task of nextTasks) await downloadVocabularyDictationTaskPdf(task.id, 'dictation', target)
      setMessage(target.kind === 'download' && target.fallbackFromSaveAs
        ? `当前浏览器不支持选择文件夹，已按普通下载导出 ${nextTasks.length} 份听写纸。`
        : `已按 ${selectedDateGroups.length} 个日期合并导出 ${nextTasks.length} 份听写纸（含二维码）`)
    } catch (nextError) {
      syncCreatedTasks()
      setError(nextTasks.length
        ? `已生成 ${nextTasks.length} 份听写，但资料没有全部下载。可在“刚刚生成”中重试。`
        : nextError instanceof Error ? nextError.message : '按日期合并导出失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  function updateTaskShare(taskId: string, share: VocabularyDictationTaskDto['share']) {
    const applyShare = (task: VocabularyDictationTaskDto) => task.id === taskId ? { ...task, share } : task
    setTasks((current) => current.map(applyShare))
    setCreatedTasks((current) => current.map(applyShare))
  }

  async function toggleTaskShare(task: VocabularyDictationTaskDto) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (task.share?.status === 'active') {
        await revokeVocabularyDictationTaskShare(task.id)
        updateTaskShare(task.id, { ...task.share, status: 'revoked', revokedAt: new Date().toISOString() })
        setMessage(`已撤销“${task.title}”的公开二维码。`)
      } else {
        const nextShare = await shareVocabularyDictationTask(task.id)
        updateTaskShare(task.id, { ...nextShare, createdAt: new Date().toISOString(), revokedAt: null })
        setMessage(`已生成“${task.title}”的公开二维码。`)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '二维码状态更新失败。')
    } finally {
      setBusy(false)
    }
  }

  async function leaveWorkbench(next: () => void) {
    if (!await flushMeaningSaves()) return
    next()
  }

  async function toggleMeaningRecordVoid(record: VocabularyMeaningRecallRecordDto) {
    setBusy(true)
    setError('')
    try {
      await voidVocabularyMeaningRecallRecord(record.id)
      if (activeStudentId) await refreshStudentData(activeStudentId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '认词记录状态修改失败。')
    } finally {
      setBusy(false)
    }
  }

  async function downloadMeaningRecordMaterial(
    record: VocabularyMeaningRecallRecordDto,
    kind: VocabularyMaterialKind | 'bundle',
    mode: FileSaveMode,
    handwritingMode: VocabularyHandwritingMode = 'standard',
  ) {
    setBusy(true)
    setError('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: vocabularyMeaningRecallRecordMaterialFileName(record, accent, kind, handwritingMode),
        mimeType: kind === 'bundle' ? 'application/zip' : 'application/pdf',
      })
      if (!target) return
      if (kind === 'bundle') await downloadVocabularyMeaningRecallRecordMaterialsZip(record.id, accent, target)
      else await downloadVocabularyMeaningRecallRecordPdf(record.id, accent, kind, target, handwritingMode)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '本轮错词资料下载失败。')
    } finally {
      setBusy(false)
    }
  }

  async function toggleFlag(state: { id: string; pinned: boolean; paused: boolean }, kind: 'pinned' | 'paused') {
    setBusy(true)
    try {
      await updateStudentVocabularyWordFlag(activeStudentId, state.id, {
        pinned: kind === 'pinned' ? !state.pinned : state.pinned,
        paused: kind === 'paused' ? !state.paused : state.paused,
      })
      if (kind === 'paused' && !state.paused) {
        setSelectedReviewIds((current) => current.filter((id) => id !== state.id))
      }
      setSuggestion([])
      await refreshStudentData(activeStudentId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '词条状态更新失败。')
    } finally {
      setBusy(false)
    }
  }

  async function loadSuggestion() {
    window.localStorage.setItem(SUGGESTION_TARGET_STORAGE_KEY, String(suggestionTarget))
    const studentId = activeStudentId
    setBusy(true)
    try {
      const entries = await getSuggestedVocabularyMeaningRecall(studentId, suggestionTarget)
      if (studentId === activeStudentIdRef.current) setSuggestion(entries)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '复习建议加载失败。')
    } finally {
      setBusy(false)
    }
  }

  function startMeaningReview(entries: Array<VocabularySetEntry & { sourceSetIds: string[] }>) {
    if (!entries.length) return
    setRequestedMeaningReview({ requestId: crypto.randomUUID(), entries: entries.slice(0, 60) })
    setSelectedReviewIds([])
    setSuggestion([])
    setTab('meaning')
  }

  async function createTaskFromReviewEntries(entries: Array<VocabularySetEntry & { sourceSetIds: string[] }>) {
    if (!activeStudent || !entries.length) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const chunks = splitEvery(entries, 60)
      const nextTasks: VocabularyDictationTaskDto[] = []
      for (const [index, chunk] of chunks.entries()) {
        const task = await createVocabularyDictationTask({
          studentId: activeStudent.id,
          sourceSetIds: [...new Set(chunk.flatMap((entry) => entry.sourceSetIds))],
          entryIds: chunk.map((entry) => entry.id),
          taskDate: today(),
          title: chunks.length > 1 ? `${defaultTaskTitle()}（${index + 1}/${chunks.length}）` : defaultTaskTitle(),
          accent,
          share: true,
        })
        nextTasks.push(task)
      }
      setCreatedTasks(nextTasks)
      setTasks((current) => [...nextTasks, ...current])
      setSelectedReviewIds([])
      setSuggestion([])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '错词听写生成失败。')
    } finally {
      setBusy(false)
    }
  }

  function openHandwritingSelector(request: HandwritingDownloadRequest) {
    setError('')
    setMessage('')
    setHandwritingDownloadRequest(request)
  }

  async function confirmHandwritingDownload(
    selectedEntryIds: string[],
    handwritingMode: VocabularyHandwritingMode,
  ) {
    const request = handwritingDownloadRequest
    if (!request || !activeStudent) return
    setHandwritingDownloadRequest(null)
    setError('')
    setMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode: request.mode,
        suggestedName: `${request.title}-衡水体练字纸${handwritingMode === 'single' ? '-每词1遍' : ''}-${selectedEntryIds.length}词.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setBusy(true)
      if (request.source.kind === 'sets') {
        await downloadCombinedVocabularyPdf({
          studentId: activeStudent.id,
          title: request.title,
          sourceSetIds: request.source.sourceSetIds,
          selectedEntryIds,
          handwritingMode,
          mode: request.source.layout,
          accent,
          kind: 'handwriting',
        }, target)
      } else if (request.source.kind === 'task') {
        await downloadVocabularyDictationTaskPdf(
          request.source.taskId,
          'handwriting',
          target,
          selectedEntryIds,
          handwritingMode,
        )
      }
      setMessage(target.kind === 'file' || target.kind === 'directory' ? '衡水体练字纸已保存。' : '衡水体练字纸已开始下载。')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '衡水体练字纸生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function printSelectedSets(kind: PrintKind, mode: FileSaveMode = 'download') {
    if (!activeStudent || !selectedSets.length) return
    if (kind === 'handwriting') {
      openHandwritingSelector({
        mode,
        title: collectionTitle || '生词合集',
        entries: uniqueSelectedEntries,
        source: { kind: 'sets', sourceSetIds: selectedSets.map((set) => set.id), layout: printMode },
      })
      return
    }
    if (rawSelectedCount > 120 && !window.confirm(`这次会打印 ${rawSelectedCount} 个原始词，页数较多。继续吗？`)) return
    const kindLabel: Record<PrintKind, string> = {
      cards: '单词卡',
      dictation: '听写纸',
      answer: '教师答案',
      handwriting: '衡水体练字纸',
    }
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${collectionTitle || '生词合集'}-${kindLabel[kind]}-${accent === 'american' ? '美音' : '英音'}.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setBusy(true)
      await downloadCombinedVocabularyPdf({
        studentId: activeStudent.id,
        title: collectionTitle,
        sourceSetIds: selectedSets.map((set) => set.id),
        mode: printMode,
        accent,
        kind,
      }, target)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '合并打印失败。')
    } finally {
      setBusy(false)
    }
  }

  async function downloadSelectedSetsBundle(mode: FileSaveMode = 'download') {
    if (!activeStudent || !selectedSets.length) return
    setError('')
    setMessage('')
    try {
      const title = collectionTitle || '生词合集'
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${title}-全套资料.zip`,
        mimeType: 'application/zip',
      })
      if (!target) return
      setBusy(true)
      await downloadCombinedVocabularyMaterialsZip({
        studentId: activeStudent.id,
        title,
        sourceSetIds: selectedSets.map((set) => set.id),
        mode: printMode,
        accent,
        kinds: VOCABULARY_MATERIAL_KINDS,
      }, target)
      setMessage(target.kind === 'file' || target.kind === 'directory' ? '全套资料已保存。' : '全套资料已开始下载。')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '全套资料生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function downloadTaskMaterial(
    task: VocabularyDictationTaskDto,
    kind: PrintKind,
    mode: FileSaveMode = 'download',
  ) {
    if (kind === 'handwriting') {
      openHandwritingSelector({
        mode,
        title: task.title || '综合听写',
        entries: task.entries,
        source: { kind: 'task', taskId: task.id },
      })
      return
    }
    setError('')
    setMessage('')
    try {
      const kindLabel = kind === 'cards'
        ? '单词卡'
        : kind === 'dictation'
          ? '听写纸'
          : kind === 'answer'
            ? '教师答案'
            : '衡水体练字纸'
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${task.title || '综合听写'}-${kindLabel}.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setBusy(true)
      await downloadVocabularyDictationTaskPdf(task.id, kind, target)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : mode === 'save-as' ? '听写资料另存为失败，请重试。' : '听写资料下载失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  async function downloadTaskBundle(task: VocabularyDictationTaskDto, mode: FileSaveMode = 'download') {
    setError('')
    setMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${task.title || '综合听写'}-全套资料.zip`,
        mimeType: 'application/zip',
      })
      if (!target) return
      setBusy(true)
      await downloadVocabularyDictationTaskMaterialsZip([task.id], VOCABULARY_MATERIAL_KINDS, target)
      setMessage(target.kind === 'file' || target.kind === 'directory' ? '听写全套资料已保存。' : '听写全套资料已开始下载。')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写全套资料生成失败。')
    } finally {
      setBusy(false)
    }
  }

  function renderTaskDownloadOptions(task: VocabularyDictationTaskDto, publicHref: string | null) {
    return (
      <>
        <DownloadOption label="单词卡" disabled={busy} onDownload={() => void downloadTaskMaterial(task, 'cards')} onSaveAs={() => void downloadTaskMaterial(task, 'cards', 'save-as')}><Card size={14} />{publicHref ? '单词卡（含二维码）' : '单词卡'}</DownloadOption>
        <DownloadOption label="听写纸" disabled={busy} onDownload={() => void downloadTaskMaterial(task, 'dictation')} onSaveAs={() => void downloadTaskMaterial(task, 'dictation', 'save-as')}><Download size={14} />{publicHref ? '听写纸（含二维码）' : '听写纸'}</DownloadOption>
        <DownloadOption label="教师答案" disabled={busy} onDownload={() => void downloadTaskMaterial(task, 'answer')} onSaveAs={() => void downloadTaskMaterial(task, 'answer', 'save-as')}><PaperCheck size={14} />教师答案</DownloadOption>
        <DownloadOption label="衡水体练字纸" disabled={busy} onDownload={() => void downloadTaskMaterial(task, 'handwriting')} onSaveAs={() => void downloadTaskMaterial(task, 'handwriting', 'save-as')}><Printer size={14} />衡水体练字纸</DownloadOption>
        <DownloadOption label="下载全套" disabled={busy} onDownload={() => void downloadTaskBundle(task)} onSaveAs={() => void downloadTaskBundle(task, 'save-as')}><Download size={14} />下载全套（4份）</DownloadOption>
      </>
    )
  }

  if (loadState === 'loading') {
    return <main className="dictation-workbench-message">正在读取学生与听写记录…</main>
  }
  if (loadState === 'error') {
    return <main className="dictation-workbench-message"><h1>听写工作区没有加载成功</h1><button type="button" onClick={() => window.location.reload()}>重新加载</button></main>
  }

  return (
    <div className="dictation-workbench">
      <AppTopbar
        variant="sub"
        pageTitle="单词复习"
        {...shellNav}
        onBack={() => { void leaveWorkbench(onBackToVocabulary) }}
        onLogout={() => { void leaveWorkbench(shellNav.onLogout) }}
        onOpenVocabularyReview={shellNav.onOpenVocabularyReview
          ? () => { void leaveWorkbench(shellNav.onOpenVocabularyReview!) }
          : undefined}
        onOpenMySpace={shellNav.onOpenMySpace
          ? () => { void leaveWorkbench(shellNav.onOpenMySpace!) }
          : undefined}
      />
      <main className="dictation-workbench-shell">
        <h1 className="dictation-visually-hidden">单词复习</h1>
        <div className="dictation-workbench-navigation">
          <FluidHoverList as="nav" className="dictation-workbench-tabs" aria-label="单词复习分区" axis="x" itemSelector="button">
            <button type="button" className={tab === 'sets' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('sets') }}>
              词组
            </button>
            <button type="button" className={tab === 'meaning' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('meaning') }}>
              认词
            </button>
            <button type="button" className={tab === 'tasks' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('tasks') }}>
              听写
            </button>
            <button type="button" className={tab === 'review' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('review') }}>
              待复习
            </button>
            <button type="button" className={tab === 'history' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('history') }}>
              记录
            </button>
          </FluidHoverList>
          <label className="dictation-student-picker">
            <span>当前学生</span>
            <select value={activeStudentId} disabled={busy || meaningSessionActive} onChange={(event) => void changeStudent(event.target.value)}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
            </select>
          </label>
        </div>

        {(message || error) && (
          <div className={error ? 'dictation-notice is-error' : 'dictation-notice'} role={error ? 'alert' : 'status'}>
            <span>{error || message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => { setError(''); setMessage('') }}><X size={15} /></button>
          </div>
        )}

        {createdTasks.length > 0 && (
          <section ref={createdTasksRef} className="dictation-created-results" aria-label="刚刚生成的听写" tabIndex={-1}>
            <header>
              <div className="dictation-created-summary">
                <strong>{createdTasks.length > 1 ? `已生成 ${createdTasks.length} 份错词听写` : '错词听写已生成'}</strong>
                <span>{createdTasks.every((task) => task.share?.status === 'active') ? '单词卡扫码听音频，听写纸扫码自动听写。' : '词序已固定，可以下载资料。'}</span>
              </div>
              <div className="dictation-created-header-actions">
                <button type="button" onClick={() => { void switchWorkbenchTab('tasks') }}>去听写查看</button>
                <button type="button" aria-label="收起已生成的听写" onClick={() => setCreatedTasks([])}><X size={16} /></button>
              </div>
            </header>
            <div className="dictation-created-links">
              {createdTasks.map((task) => {
                const publicHref = task.share?.status === 'active'
                  ? `${window.location.origin}/vocabulary/dictation/${task.share.shareId}`
                  : null
                return (
                  <div key={task.id}>
                    <span><strong>{task.title}</strong><small>{task.entryCount} 词 · {task.accent === 'american' ? '美音' : '英音'}</small></span>
                    <div className="dictation-created-actions">
                      {publicHref && <a href={publicHref} target="_blank" rel="noreferrer"><Link size={14} />打开听写</a>}
                      <details className="dictation-download-menu">
                        <summary><Download size={14} />下载资料<ChevronDown size={14} aria-hidden="true" /></summary>
                        <DownloadMenuItems>
                          {renderTaskDownloadOptions(task, publicHref)}
                        </DownloadMenuItems>
                      </details>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'sets' && (
          <section className="dictation-sets-workspace">
            <div className="dictation-library-tools">
              <label className="dictation-search-field">
                <Search size={16} aria-hidden="true" />
                <input aria-label="搜索词组" value={searchInput} placeholder="搜索标题或单词" onChange={(event) => setSearchInput(event.target.value)} />
              </label>
              <label>从 <input type="date" value={fromDate} onChange={(event) => { setLibrary((current) => ({ ...current, page: 1 })); setFromDate(event.target.value) }} /></label>
              <label>到 <input type="date" value={toDate} onChange={(event) => { setLibrary((current) => ({ ...current, page: 1 })); setToDate(event.target.value) }} /></label>
              {(query || fromDate || toDate) && <button type="button" onClick={() => { setSearchInput(''); setQuery(''); setFromDate(''); setToDate('') }}>清除筛选</button>}
            </div>

            <FluidHoverList as="div" className="dictation-set-list" aria-label="词组列表" axis="y" itemSelector=".dictation-set-row">
              {library.items.length ? library.items.map((set) => {
                const selectedIndex = selectedSets.findIndex((item) => item.id === set.id)
                const hasMeaningHistory = Boolean(set.dictationSummary.meaningRecall.latestDate)
                const pendingParts = [
                  set.dictationSummary.meaningRecall.pendingCount > 0 ? `认词错 ${set.dictationSummary.meaningRecall.pendingCount}` : '',
                  set.dictationSummary.meaningRecall.repeatedCount > 0 ? `常忘 ${set.dictationSummary.meaningRecall.repeatedCount}` : '',
                ].filter(Boolean)
                const historyParts = [
                  hasMeaningHistory ? `认词 ${displayDate(set.dictationSummary.meaningRecall.latestDate)}` : '',
                ].filter(Boolean)
                return (
                  <label className={selectedIndex >= 0 ? 'dictation-set-row is-selected' : 'dictation-set-row'} key={set.id}>
                    <input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleSet(set)} />
                    <span className="dictation-selection-order">{selectedIndex >= 0 ? selectedIndex + 1 : ''}</span>
                    <span className="dictation-set-main">
                      <strong>{set.title}</strong>
                      <small>{set.entryCount} 词 · {set.entries.slice(0, 5).map((entry) => entry.headword).join('、')}{set.entryCount > 5 ? '…' : ''}</small>
                    </span>
                    <span className="dictation-set-stats">
                      <strong>{pendingParts.length ? pendingParts.join(' · ') : hasMeaningHistory ? '目前无待复习词' : '还没认词'}</strong>
                      {historyParts.length > 0 && <small>{historyParts.join(' · ')}</small>}
                    </span>
                  </label>
                )
              }) : <div className="dictation-empty-state"><Card size={28} /><h2>没有符合条件的词组</h2><p>换一个搜索词或日期范围。</p></div>}
            </FluidHoverList>

            {library.total > library.pageSize && (
              <div className="dictation-pagination">
                <button type="button" disabled={library.page <= 1} onClick={() => setLibrary((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={16} />上一页</button>
                <span>第 {library.page} / {Math.ceil(library.total / library.pageSize)} 页</span>
                <button type="button" disabled={!library.hasMore} onClick={() => setLibrary((current) => ({ ...current, page: current.page + 1 }))}>下一页<ChevronRight size={16} /></button>
              </div>
            )}

            {selectedSets.length > 0 && (
              <aside className="dictation-selection-panel" aria-label="已选词组工具">
                <div className="dictation-selection-summary">
                  <div><strong>已选 {selectedSets.length} 组</strong><span>{rawSelectedCount === uniqueSelectedEntries.length ? `${uniqueSelectedEntries.length} 词` : `原始 ${rawSelectedCount} 词 · 合并去重 ${uniqueSelectedEntries.length} 词`}</span></div>
                  <button type="button" onClick={() => setSelectedSets([])}>清空</button>
                </div>
                {rawSelectedCount > 120 && <p className="dictation-volume-warning">这次合集超过 120 词，打印会自动分页；二维码听写仍按 60 词拆分。</p>}
                <details className="dictation-selection-settings">
                  <summary>设置</summary>
                  <div className="dictation-combine-settings">
                    <label><span>打印标题</span><input value={collectionTitle} maxLength={60} onChange={(event) => setCollectionTitle(event.target.value)} /></label>
                    <label><span>听写标题</span><input value={taskTitle} maxLength={60} onChange={(event) => setTaskTitle(event.target.value)} /></label>
                    <fieldset><legend>口音</legend><button type="button" className={accent === 'american' ? 'is-selected' : ''} onClick={() => setAccent('american')}>美音</button><button type="button" className={accent === 'british' ? 'is-selected' : ''} onClick={() => setAccent('british')}>英音</button></fieldset>
                    <label className="dictation-check-setting"><input type="checkbox" checked={shuffleBeforeFreeze} onChange={(event) => setShuffleBeforeFreeze(event.target.checked)} /><Shuffle size={15} />打乱词序</label>
                  </div>
                </details>
                <div className="dictation-selection-actions">
                  <button type="button" onClick={() => setTab('meaning')}><Eye size={16} />开始认词</button>
                  <details>
                    <summary><Printer size={16} />打印资料</summary>
                    <DownloadMenuItems>
                      <label><input type="radio" name="print-mode" checked={printMode === 'dedupe'} onChange={() => setPrintMode('dedupe')} />合并去重</label>
                      <label><input type="radio" name="print-mode" checked={printMode === 'grouped'} onChange={() => setPrintMode('grouped')} />按组装订</label>
                      <DownloadOption label="单词卡" onDownload={() => void printSelectedSets('cards')} onSaveAs={() => void printSelectedSets('cards', 'save-as')}>单词卡</DownloadOption>
                      <DownloadOption label="听写纸" onDownload={() => void printSelectedSets('dictation')} onSaveAs={() => void printSelectedSets('dictation', 'save-as')}>听写纸</DownloadOption>
                      <DownloadOption label="教师答案" onDownload={() => void printSelectedSets('answer')} onSaveAs={() => void printSelectedSets('answer', 'save-as')}>教师答案</DownloadOption>
                      <DownloadOption label="衡水体练字纸" onDownload={() => void printSelectedSets('handwriting')} onSaveAs={() => void printSelectedSets('handwriting', 'save-as')}>衡水体练字纸</DownloadOption>
                      <DownloadOption label="下载全套" onDownload={() => void downloadSelectedSetsBundle()} onSaveAs={() => void downloadSelectedSetsBundle('save-as')}>下载全套（4份）</DownloadOption>
                    </DownloadMenuItems>
                  </details>
                  <button type="button" onClick={() => void createTasks({ share: true })} disabled={busy}><QrCode size={16} />生成扫码听写</button>
                </div>
              </aside>
            )}
          </section>
        )}

        {tab === 'meaning' && activeStudentId && (
          <VocabularyMeaningRecallPanel
            studentId={activeStudentId}
            selectedSets={selectedSets}
            records={meaningRecords}
            accent={accent}
            onAccentChange={setAccent}
            requestedRecordId={requestedMeaningRecordId}
            onRequestedRecordHandled={() => setRequestedMeaningRecordId(null)}
            requestedReview={requestedMeaningReview}
            onRequestedReviewHandled={() => setRequestedMeaningReview(null)}
            onNeedSets={() => setTab('sets')}
            onChanged={() => refreshStudentData(activeStudentId)}
            onCreatedTask={(task) => {
              setCreatedTasks([task])
              setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)])
              void switchWorkbenchTab('tasks')
            }}
            onSessionActiveChange={setMeaningSessionActive}
            onSaveBarrierChange={registerMeaningSaveBarrier}
          />
        )}

        {tab === 'tasks' && (
          <section className="dictation-tasks-workspace">
            <div className="dictation-task-queue">
              {tasks.length ? <div className="dictation-task-date-list">{taskDateGroups.map((group) => {
                const selectedCount = group.tasks.filter((task) => selectedTaskIdSet.has(task.id)).length
                const allSelected = selectedCount === group.tasks.length
                return (
                  <section className="dictation-task-date-group" key={group.dateKey} aria-labelledby={`dictation-task-date-${group.dateKey}`}>
                    <header className="dictation-task-date-heading">
                      <div><strong id={`dictation-task-date-${group.dateKey}`}>{taskDateHeading(group.dateKey)}</strong><span>{group.tasks.length} 份听写 · {group.tasks.reduce((sum, task) => sum + task.entryCount, 0)} 个原始词{selectedCount ? ` · 已选 ${selectedCount} 份` : ''}</span></div>
                      <button type="button" onClick={() => toggleTaskDateSelection(group)}>{allSelected ? '取消当天' : '全选当天'}</button>
                    </header>
                    <div className="dictation-task-list">{group.tasks.map((task) => {
                      const publicHref = task.share?.status === 'active'
                        ? `${window.location.origin}/vocabulary/dictation/${task.share.shareId}`
                        : null
                      return (
                        <article className={selectedTaskIdSet.has(task.id) ? 'is-selected' : ''} key={task.id}>
                          <label className="dictation-task-select"><input type="checkbox" checked={selectedTaskIdSet.has(task.id)} onChange={() => toggleTaskSelection(task.id)} /><span>选择“{task.title}”</span></label>
                          <div><strong title={task.title}>{taskRowTitle(task)}</strong><span>{task.entryCount} 词 · {task.accent === 'american' ? '美音' : '英音'} · {publicHref ? '可扫码' : '无二维码'}</span></div>
                          <div>
                            {publicHref && <a href={publicHref} target="_blank" rel="noreferrer"><Link size={14} />打开听写</a>}
                            <details className="dictation-download-menu">
                              <summary><Download size={14} />下载资料<ChevronDown size={14} aria-hidden="true" /></summary>
                              <DownloadMenuItems>
                                {renderTaskDownloadOptions(task, publicHref)}
                                <button className="dictation-download-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void toggleTaskShare(task) }}>{publicHref ? '撤销二维码' : <><QrCode size={14} />生成二维码</>}</button>
                              </DownloadMenuItems>
                            </details>
                          </div>
                        </article>
                      )
                    })}</div>
                  </section>
                )
              })}</div> : <div className="dictation-empty-state"><ListChecks size={28} /><h2>还没有听写</h2><p>先到“词组”选择单词。</p></div>}
            </div>

            {selectedTasks.length > 0 && (
              <aside className="dictation-task-selection-panel" aria-label="已选听写导出工具">
                <div>
                  <strong>已选 {selectedTasks.length} 份听写</strong>
                  <span>{selectedTaskRawCount === selectedTaskUniqueCount ? `${selectedTaskUniqueCount} 词` : `原始 ${selectedTaskRawCount} 词 · 去重 ${selectedTaskUniqueCount} 词`} · 自动带二维码</span>
                </div>
                <fieldset><legend>口音</legend><button type="button" aria-pressed={accent === 'american'} className={accent === 'american' ? 'is-selected' : ''} onClick={() => setAccent('american')}>美音</button><button type="button" aria-pressed={accent === 'british'} className={accent === 'british' ? 'is-selected' : ''} onClick={() => setAccent('british')}>英音</button></fieldset>
                <div className="dictation-batch-export-actions">
                  <button type="button" className="is-primary" disabled={busy} onClick={() => void exportSelectedTasksByDate()}><QrCode size={16} />合并导出听写纸</button>
                  <button type="button" disabled={busy} onClick={() => void exportSelectedTasksByDate('save-as')}><Save size={15} />另存到文件夹…</button>
                </div>
                <button type="button" onClick={() => setSelectedTaskIds([])}>取消选择</button>
              </aside>
            )}
          </section>
        )}

        {tab === 'history' && (
          <section className="dictation-record-list dictation-history-list">
            <header className="dictation-history-filter" role="group" aria-label="记录类型">
              <button type="button" className={historyFilter === 'meaning' ? 'is-selected' : ''} onClick={() => setHistoryFilter('meaning')}>认词记录</button>
              <button type="button" className={historyFilter === 'dictation' ? 'is-selected' : ''} onClick={() => setHistoryFilter('dictation')}>历史听写</button>
            </header>
            {detectionHistory.length ? detectionHistory.map((item) => {
              if (item.kind === 'meaning') {
                const record = item.record
                const counts = countMeaningRecordResults(record)
                return (
                  <article className={record.status === 'void' ? 'is-void' : ''} key={`meaning-${record.id}`}>
                    <div><strong>{record.title}</strong><span>{displayDate(item.date)} · 认词 · {record.status === 'completed' ? '已完成' : record.status === 'draft' ? '草稿' : '已作废'}</span></div>
                    <div className="dictation-record-counts"><span>错 {counts.wrong}</span><span>对 {counts.correct}</span>{counts.untested > 0 && <span>未测 {counts.untested}</span>}</div>
                    <div>
                      {record.status !== 'void' && <button type="button" onClick={() => { setRequestedMeaningRecordId(record.id); setTab('meaning') }}>{record.status === 'draft' ? '继续' : '查看结果'}</button>}
                      {record.status === 'completed' && counts.wrong > 0 && (
                        <details className="dictation-download-menu">
                          <summary><Download size={14} />下载本轮错词<ChevronDown size={14} /></summary>
                          <DownloadMenuItems>
                            <DownloadOption label="单词卡" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'cards', 'download')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'cards', 'save-as')}><Card size={14} />单词卡</DownloadOption>
                            <DownloadOption label="听写纸" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'dictation', 'download')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'dictation', 'save-as')}><Download size={14} />听写纸</DownloadOption>
                            <DownloadOption label="教师答案" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'answer', 'download')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'answer', 'save-as')}><PaperCheck size={14} />教师答案</DownloadOption>
                            <DownloadOption label="衡水体练字纸" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'handwriting', 'download')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'handwriting', 'save-as')}><Printer size={14} />衡水体练字纸</DownloadOption>
                            <DownloadOption label="每词写1遍练字纸" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'handwriting', 'download', 'single')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'handwriting', 'save-as', 'single')}><Printer size={14} />练字纸（每词写1遍）</DownloadOption>
                            <DownloadOption label="下载全套" disabled={busy} onDownload={() => void downloadMeaningRecordMaterial(record, 'bundle', 'download')} onSaveAs={() => void downloadMeaningRecordMaterial(record, 'bundle', 'save-as')}><Download size={14} />下载全套（4份）</DownloadOption>
                          </DownloadMenuItems>
                        </details>
                      )}
                      {record.status === 'completed' && <button type="button" onClick={() => void toggleMeaningRecordVoid(record)} disabled={busy}>作废</button>}
                    </div>
                  </article>
                )
              }
              const record = item.record
              const counts = countRecordResults(record)
              return (
                <article className={record.status === 'void' ? 'is-void' : ''} key={`dictation-${record.id}`}>
                  <div><strong>{record.taskTitle}</strong><span>{displayDate(item.date)} · {record.mode === 'all' ? '完整听写' : '抽听'} · {record.status === 'completed' ? '已完成' : record.status === 'draft' ? '草稿' : '已作废'}</span></div>
                  <div className="dictation-record-counts"><span>错 {counts.wrong}</span><span>对 {counts.correct}</span>{counts.untested > 0 && <span>未测 {counts.untested}</span>}</div>
                  <details className="dictation-history-details">
                    <summary>查看</summary>
                    <div>{record.entries.map((entry) => <p key={entry.id}><strong>{entry.headword}</strong><span>{entry.result === 'correct' ? '对' : entry.result === 'wrong' ? '错' : '未测'}{entry.wrongSpelling ? ` · 写成 ${entry.wrongSpelling}` : ''}</span></p>)}</div>
                  </details>
                </article>
              )
            }) : <div className="dictation-empty-state"><PaperCheck size={28} /><h2>{historyFilter === 'meaning' ? '还没有认词记录' : '还没有历史听写'}</h2><p>{historyFilter === 'meaning' ? '完成认词后会自动保留。' : '旧听写结果会只读保留在这里。'}</p></div>}
          </section>
        )}

        {tab === 'review' && (
          <section className="dictation-review-workspace">
            <header className="dictation-review-heading">
              <div className="dictation-review-channel" role="group" aria-label="待复习筛选">
                <button type="button" className={reviewMode === 'all' ? 'is-selected' : ''} onClick={() => { setReviewMode('all'); setSelectedReviewIds([]) }}>全部 {reviewWords.filter((word) => !word.paused).length}</button>
                <button type="button" className={reviewMode === 'frequent' ? 'is-selected' : ''} onClick={() => { setReviewMode('frequent'); setSelectedReviewIds([]) }}>常错 {reviewWords.filter((word) => word.status === 'repeated' && !word.paused).length}</button>
              </div>
            </header>

            <div className="dictation-suggestion-control dictation-suggestion-control-row">
              {pausedReviewCount > 0 && <button type="button" aria-pressed={showPausedReview} onClick={() => setShowPausedReview((current) => !current)}>{showPausedReview ? '隐藏' : '显示'}已暂停（{pausedReviewCount}）</button>}
              <label>推荐下一轮 <input type="number" min="1" max="60" value={suggestionTarget} onChange={(event) => setSuggestionTarget(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> 词</label>
              <button type="button" onClick={() => void loadSuggestion()} disabled={busy}><Sparkles size={15} />选出单词</button>
            </div>

            {suggestion.length > 0 && (
              <aside className="dictation-suggestion-panel">
                <div><strong>推荐 {suggestion.length} 词</strong><span>确认名单后直接开始认词复习。</span></div>
                <ol>{suggestion.map((entry) => <li key={entry.id}><span>{entry.headword}</span><small>{entry.reason}</small></li>)}</ol>
                <div><button type="button" className="is-primary" onClick={() => startMeaningReview(suggestion)}><Eye size={15} />开始认词复习</button><button type="button" onClick={() => void createTaskFromReviewEntries(suggestion)}><QrCode size={15} />生成听写</button><button type="button" onClick={() => setSuggestion([])}>收起</button></div>
              </aside>
            )}

            {selectedReviewWords.length > 0 && (
              <div className="dictation-review-actions">
                <span>已选 {selectedReviewWords.length} 词</span>
                <button type="button" className="is-primary" onClick={() => startMeaningReview(selectedReviewWords)} disabled={busy}><Eye size={15} />开始认词复习</button>
                <button type="button" onClick={() => void createTaskFromReviewEntries(selectedReviewWords)} disabled={busy}><QrCode size={15} />生成听写</button>
                <button type="button" onClick={() => setSelectedReviewIds([])}>取消</button>
              </div>
            )}

            {visibleReviewWords.length ? (
              <div className="dictation-review-table" role="table" aria-label="待复习列表">
                <div className="dictation-review-table-head" role="row"><span>选择</span><span>单词</span><span>认词记录</span><span>当前情况</span><span>操作</span></div>
                {visibleReviewWords.map((word, index) => (
                    <div className={word.paused ? 'dictation-review-row is-paused' : 'dictation-review-row'} role="row" key={word.id}>
                      <label><input type="checkbox" checked={selectedReviewIds.includes(word.id)} disabled={word.paused} onChange={() => setSelectedReviewIds((current) => current.includes(word.id) ? current.filter((id) => id !== word.id) : [...current, word.id])} /><span>{reviewMode === 'frequent' ? index + 1 : ''}</span></label>
                      <div><strong>{word.headword}</strong><small>{word.partOfSpeech} {formatMeaning(word)}</small></div>
                      <div className="dictation-review-evidence">
                        <span><b>认词</b></span>
                        <small>忘记 {word.totalWrong} 次 · 最近 {displayDate(word.lastForgottenDate)}</small>
                      </div>
                      <div><strong>{word.status === 'repeated' ? '常错' : '待复习'}</strong><small>还需 {Math.max(0, 2 - word.currentCorrectDateCount)} 天认词正确{word.paused ? ' · 已暂停' : ''}</small></div>
                      <div><button type="button" className={word.pinned ? 'is-active' : ''} aria-pressed={word.pinned} onClick={() => void toggleFlag(word, 'pinned')}><Pin size={14} />重点</button><button type="button" className={word.paused ? 'is-active' : ''} aria-pressed={word.paused} onClick={() => void toggleFlag(word, 'paused')}><PauseCircle size={14} />暂停</button></div>
                    </div>
                ))}
              </div>
            ) : <div className="dictation-empty-state"><Check size={28} /><h2>{reviewMode === 'all' ? '现在没有待复习单词' : '现在没有常错词'}</h2><p>认词时忘记的词会自动出现在这里。</p></div>}
          </section>
        )}
      </main>

      {handwritingDownloadRequest && (
        <VocabularyHandwritingSelector
          title={handwritingDownloadRequest.title}
          entries={handwritingDownloadRequest.entries}
          busy={busy}
          onCancel={() => setHandwritingDownloadRequest(null)}
          onConfirm={(entryIds, handwritingMode) => void confirmHandwritingDownload(entryIds, handwritingMode)}
        />
      )}

    </div>
  )
}
