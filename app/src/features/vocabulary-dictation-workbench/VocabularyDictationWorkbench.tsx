import {
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FileCheck2,
  Flag,
  Link2,
  ListChecks,
  PauseCircle,
  Pin,
  Printer,
  QrCode,
  Search,
  Shuffle,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import type { VocabularySetEntry } from '../../domain/vocabulary'
import {
  createVocabularyDictationRecord,
  createVocabularyDictationTask,
  downloadCombinedVocabularyPdf,
  downloadVocabularyDictationTaskPdf,
  getStudentVocabularyMeaningStates,
  getStudentVocabularyReviewStates,
  getSuggestedVocabularyReview,
  getVocabularyDictationTask,
  getVocabularySet,
  getVocabularySetLibrary,
  listVocabularyDictationRecords,
  listVocabularyDictationTasks,
  listVocabularyMeaningRecallRecords,
  listVocabularyStudents,
  revokeVocabularyDictationTaskShare,
  restoreVocabularyDictationRecord,
  restoreVocabularyMeaningRecallRecord,
  shareVocabularyDictationTask,
  updateStudentVocabularyWordFlag,
  updateVocabularyDictationRecord,
  voidVocabularyDictationRecord,
  voidVocabularyMeaningRecallRecord,
  type StudentVocabularyMeaningStateDto,
  type StudentVocabularyReviewStateDto,
  type VocabularyDictationRecordDto,
  type VocabularyDictationResult,
  type VocabularyDictationTaskDto,
  type VocabularyMeaningRecallRecordDto,
  type VocabularySetLibraryDto,
  type VocabularySetLibraryItemDto,
  type VocabularyStudentDto,
} from '../../services/vocabulary'
import { VocabularyMeaningRecallPanel } from './VocabularyMeaningRecallPanel'
import './vocabularyDictationWorkbench.css'

const ACTIVE_STUDENT_STORAGE_KEY = 'eqb-vocabulary-active-student-wanwei-round-one-v1'
const SUGGESTION_TARGET_STORAGE_KEY = 'eqb-vocabulary-review-suggestion-target-v1'
type WorkspaceTab = 'sets' | 'meaning' | 'tasks' | 'review' | 'history'
type Accent = 'american' | 'british'
type PrintKind = 'cards' | 'dictation' | 'answer' | 'word-search'

type GraderState = {
  task: VocabularyDictationTaskDto
  record: VocabularyDictationRecordDto | null
  mode: 'all' | 'partial'
  dictationDate: string
  note: string
  results: Record<string, { result: VocabularyDictationResult; wrongSpelling: string }>
  activeIndex: number
  wrongNumbers: string
  testedNumbers: string
  dirty: boolean
  saving: boolean
  editVersion: number
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

function defaultCollectionTitle(studentName: string) {
  return `${studentName} · 生词合集 · ${today()}`
}

function defaultTaskTitle() {
  return `${today()} 综合听写`
}

function parseDictationNumberExpression(value: string, max: number): number[] {
  const numbers = new Set<number>()
  for (const rawPart of value.split(/[，,、;；\s]+/u)) {
    const part = rawPart.trim()
    if (!part) continue
    const range = part.match(/^(\d+)-(\d+)$/u)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start < 1 || end < start || end > max) throw new Error(`题号范围必须在 1–${max} 之间。`)
      for (let number = start; number <= end; number += 1) numbers.add(number)
      continue
    }
    if (!/^\d+$/u.test(part)) throw new Error('题号请用逗号分隔，连续题号可写成 8-10。')
    const number = Number(part)
    if (number < 1 || number > max) throw new Error(`题号必须在 1–${max} 之间。`)
    numbers.add(number)
  }
  return [...numbers].sort((left, right) => left - right)
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

function initialResults(
  task: VocabularyDictationTaskDto,
  record: VocabularyDictationRecordDto | null,
  mode: 'all' | 'partial',
) {
  return Object.fromEntries(task.entries.map((entry) => {
    const existing = record?.entries.find((item) => item.id === entry.id)
    return [entry.id, {
      result: existing?.result ?? (mode === 'all' ? 'correct' : 'untested'),
      wrongSpelling: existing?.wrongSpelling ?? '',
    }]
  }))
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
  const [reviewStates, setReviewStates] = useState<StudentVocabularyReviewStateDto[]>([])
  const [selectedSets, setSelectedSets] = useState<VocabularySetLibraryItemDto[]>([])
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [selectedMeaningIds, setSelectedMeaningIds] = useState<string[]>([])
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
  const [graderError, setGraderError] = useState('')
  const [grader, setGrader] = useState<GraderState | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState(() => {
    const stored = Number(window.localStorage.getItem(SUGGESTION_TARGET_STORAGE_KEY))
    return Math.max(1, Math.min(60, stored || 20))
  })
  const [suggestion, setSuggestion] = useState<StudentVocabularyReviewStateDto[]>([])
  const [showPausedReview, setShowPausedReview] = useState(false)
  const [reviewMode, setReviewMode] = useState<'meaning' | 'pending' | 'stubborn'>('meaning')
  const [requestedMeaningRecordId, setRequestedMeaningRecordId] = useState<string | null>(null)
  const [libraryRefreshVersion, setLibraryRefreshVersion] = useState(0)
  const graderRef = useRef<GraderState | null>(null)
  const graderDialogRef = useRef<HTMLElement | null>(null)
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
      if (!saved) setError('词义抽查尚未保存成功，请重试后再离开。')
      return saved
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '词义抽查尚未保存成功，请重试后再离开。')
      return false
    }
  }

  async function switchWorkbenchTab(nextTab: WorkspaceTab) {
    if (nextTab === tab) return
    if (!await flushMeaningSaves()) return
    setTab(nextTab)
  }

  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null
  const graderTaskId = grader?.task.id ?? null
  const uniqueSelectedEntries = useMemo(() => dedupeEntries(selectedSets), [selectedSets])
  const rawSelectedCount = selectedSets.reduce((sum, set) => sum + set.entryCount, 0)
  const pendingStates = reviewStates.filter((state) => state.status !== 'improved' && !state.paused)
  const stubbornStates = reviewStates.filter((state) => state.status === 'stubborn' && !state.paused)
  const pendingMeaningStates = meaningStates.filter((state) => state.status !== 'improved' && !state.paused)
  const pausedReviewStates = reviewStates.filter((state) => state.paused && (
    reviewMode === 'stubborn' ? state.status === 'stubborn' : state.status !== 'improved'
  ))
  const visibleReviewStates = [
    ...(reviewMode === 'stubborn' ? stubbornStates : pendingStates),
    ...(showPausedReview ? pausedReviewStates : []),
  ]
  const selectedReviewStates = reviewStates.filter((state) => !state.paused && selectedReviewIds.includes(state.id))
  const selectedMeaningStates = meaningStates.filter((state) => !state.paused && selectedMeaningIds.includes(state.id))
  const detectionHistory = useMemo(() => [
    ...meaningRecords.map((record) => ({ kind: 'meaning' as const, date: record.recallDate, updatedAt: record.updatedAt, record })),
    ...records.map((record) => ({ kind: 'dictation' as const, date: record.dictationDate, updatedAt: record.updatedAt, record })),
  ].sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)), [meaningRecords, records])

  useEffect(() => {
    graderRef.current = grader
  }, [grader])

  useEffect(() => {
    if (graderTaskId) window.requestAnimationFrame(() => graderDialogRef.current?.focus())
  }, [graderTaskId])

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
    const [nextTasks, nextRecords, nextStates, nextMeaningRecords, nextMeaningStates] = await Promise.all([
      listVocabularyDictationTasks(studentId),
      listVocabularyDictationRecords(studentId),
      getStudentVocabularyReviewStates(studentId),
      listVocabularyMeaningRecallRecords(studentId),
      getStudentVocabularyMeaningStates(studentId),
    ])
    if (requestedVersion !== studentDataVersionRef.current || studentId !== activeStudentIdRef.current) return
    setTasks(nextTasks)
    setRecords(nextRecords)
    setReviewStates(nextStates)
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
      if (!cancelled) setError(nextError instanceof Error ? nextError.message : '生词组加载失败。')
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
      if (!cancelled) setError(nextError instanceof Error ? nextError.message : '生词组加载失败。')
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

  const updateGrader = useCallback((updater: (current: GraderState) => GraderState) => {
    setGrader((current) => current ? updater(current) : current)
  }, [])

  const persistGrader = useCallback(async (status: 'draft' | 'completed', explicitSnapshot?: GraderState) => {
    const snapshot = explicitSnapshot ?? graderRef.current
    if (!snapshot || snapshot.saving) return null
    setGrader((current) => current ? { ...current, saving: true } : current)
    const results = snapshot.task.entries.map((entry) => ({
      entryId: entry.id,
      result: snapshot.results[entry.id].result,
      wrongSpelling: snapshot.results[entry.id].wrongSpelling,
    }))
    try {
      const saved = snapshot.record
        ? await updateVocabularyDictationRecord(snapshot.record.id, {
            mode: snapshot.mode,
            status,
            dictationDate: snapshot.dictationDate,
            note: snapshot.note,
            results,
          })
        : await createVocabularyDictationRecord(snapshot.task.id, {
            mode: snapshot.mode,
            status,
            dictationDate: snapshot.dictationDate,
            note: snapshot.note,
            results,
          })
      setGrader((current) => {
        if (!current || current.task.id !== snapshot.task.id) return current
        return {
          ...current,
          record: saved,
          saving: false,
          dirty: current.editVersion === snapshot.editVersion ? false : current.dirty,
        }
      })
      if (activeStudentId) await refreshStudentData(activeStudentId)
      return saved
    } catch (nextError) {
      setGrader((current) => current ? { ...current, saving: false } : current)
      setGraderError(nextError instanceof Error ? nextError.message : '听写记录保存失败。')
      return null
    }
  }, [activeStudentId, refreshStudentData])

  useEffect(() => {
    if (!grader?.dirty || grader.saving || grader.record?.status === 'completed') return
    const timer = window.setTimeout(() => { void persistGrader('draft') }, 700)
    return () => window.clearTimeout(timer)
  }, [grader?.dirty, grader?.editVersion, grader?.record?.status, grader?.saving, persistGrader])

  useEffect(() => {
    const flushPendingDraft = () => {
      const current = graderRef.current
      if (!current?.dirty || current.saving) return
      void persistGrader(current.record?.status === 'completed' ? 'completed' : 'draft', current)
    }
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = graderRef.current
      if (!current?.dirty && !current?.saving) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('popstate', flushPendingDraft)
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      window.removeEventListener('popstate', flushPendingDraft)
      window.removeEventListener('beforeunload', warnBeforeUnload)
    }
  }, [persistGrader])

  useEffect(() => {
    if (!grader) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === 'Tab') {
        const dialog = graderDialogRef.current
        const focusable = dialog
          ? [...dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
          : []
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
        return
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void completeGrading()
        return
      }
      if (target?.matches('input, textarea, select')) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        updateGrader((current) => ({ ...current, activeIndex: Math.min(current.task.entryCount - 1, current.activeIndex + 1) }))
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        updateGrader((current) => ({ ...current, activeIndex: Math.max(0, current.activeIndex - 1) }))
      } else if (event.key === ' ') {
        if (target?.matches('button:not(.dictation-grade-number)')) return
        event.preventDefault()
        toggleWrong(grader.task.entries[grader.activeIndex].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function toggleSet(set: VocabularySetLibraryItemDto) {
    setSelectedSets((current) => current.some((item) => item.id === set.id)
      ? current.filter((item) => item.id !== set.id)
      : [...current, set])
  }

  async function changeStudent(studentId: string) {
    if (!await flushMeaningSaves()) return
    const currentGrader = graderRef.current
    if (currentGrader?.saving) return
    if (currentGrader?.dirty) {
      const saved = await persistGrader(currentGrader.record?.status === 'completed' ? 'completed' : 'draft')
      if (!saved) return
    }
    studentDataVersionRef.current += 1
    activeStudentIdRef.current = studentId
    setActiveStudentId(studentId)
    setSelectedSets([])
    setSelectedReviewIds([])
    setSelectedMeaningIds([])
    setCreatedTasks([])
    setGrader(null)
    setTasks([])
    setRecords([])
    setReviewStates([])
    setMeaningRecords([])
    setMeaningStates([])
    setRequestedMeaningRecordId(null)
    setSuggestion([])
    setShowPausedReview(false)
    setLibrary((current) => ({ ...current, items: [], page: 1, total: 0, hasMore: false }))
    setCollectionTitle(defaultCollectionTitle(students.find((student) => student.id === studentId)?.displayName ?? '学生'))
  }

  async function createTasks({ share, openFirst }: { share: boolean; openFirst: boolean }) {
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
          title,
          accent,
        })
        if (share) {
          const taskShare = await shareVocabularyDictationTask(task.id)
          nextTasks.push({ ...task, share: { ...taskShare, createdAt: new Date().toISOString(), revokedAt: null } })
        } else {
          nextTasks.push(task)
        }
      }
      setCreatedTasks(nextTasks)
      setTasks((current) => [...nextTasks, ...current])
      setSelectedSets([])
      if (openFirst) openGrader(nextTasks[0])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写任务生成失败。')
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

  function openGrader(task: VocabularyDictationTaskDto, record: VocabularyDictationRecordDto | null = null) {
    const mode = record?.mode ?? 'all'
    setGraderError('')
    setGrader({
      task,
      record,
      mode,
      dictationDate: record?.dictationDate ?? today(),
      note: record?.note ?? '',
      results: initialResults(task, record, mode),
      activeIndex: 0,
      wrongNumbers: '',
      testedNumbers: '',
      dirty: false,
      saving: false,
      editVersion: 0,
    })
  }

  function markDirty(current: GraderState, patch: Partial<GraderState>): GraderState {
    return { ...current, ...patch, dirty: true, editVersion: current.editVersion + 1 }
  }

  function toggleWrong(entryId: string) {
    updateGrader((current) => {
      const previous = current.results[entryId]
      const result: VocabularyDictationResult = previous.result === 'wrong'
        ? current.mode === 'all' ? 'correct' : 'untested'
        : 'wrong'
      return markDirty(current, {
        results: {
          ...current.results,
          [entryId]: { result, wrongSpelling: result === 'wrong' ? previous.wrongSpelling : '' },
        },
      })
    })
  }

  function changeGraderMode(mode: 'all' | 'partial') {
    updateGrader((current) => markDirty(current, {
      mode,
      results: Object.fromEntries(current.task.entries.map((entry) => {
        const previous = current.results[entry.id]
        if (previous.result === 'wrong') return [entry.id, previous]
        return [entry.id, { result: mode === 'all' ? 'correct' : 'untested', wrongSpelling: '' }]
      })),
    }))
  }

  function resultsFromNumberInputs(current: GraderState): GraderState['results'] {
    const tested = current.mode === 'partial'
      ? new Set(parseDictationNumberExpression(current.testedNumbers, current.task.entryCount))
      : new Set(Array.from({ length: current.task.entryCount }, (_, index) => index + 1))
    const wrong = new Set(parseDictationNumberExpression(current.wrongNumbers, current.task.entryCount))
    if ([...wrong].some((number) => !tested.has(number))) {
      throw new Error('错词题号必须先包含在实际抽听题号中。')
    }
    return Object.fromEntries(current.task.entries.map((entry, index) => {
      const number = index + 1
      const previous = current.results[entry.id]
      const result: VocabularyDictationResult = wrong.has(number) ? 'wrong' : tested.has(number) ? 'correct' : 'untested'
      return [entry.id, { result, wrongSpelling: result === 'wrong' ? previous.wrongSpelling : '' }]
    }))
  }

  function consumeNumberInputs(current: GraderState): GraderState {
    return markDirty(current, {
      results: resultsFromNumberInputs(current),
      wrongNumbers: '',
      testedNumbers: '',
    })
  }

  function applyNumberInputs() {
    if (!grader) return
    try {
      updateGrader((current) => consumeNumberInputs(current))
      setGraderError('')
    } catch (nextError) {
      setGraderError(nextError instanceof Error ? nextError.message : '题号格式无效。')
    }
  }

  async function completeGrading() {
    let current = graderRef.current
    if (!current) return
    if (current.wrongNumbers.trim() || (current.mode === 'partial' && current.testedNumbers.trim())) {
      try {
        current = consumeNumberInputs(current)
        graderRef.current = current
        setGrader(current)
        setGraderError('')
      } catch (nextError) {
        setGraderError(nextError instanceof Error ? nextError.message : '题号格式无效。')
        return
      }
    }
    const untestedCount = Object.values(current.results).filter((result) => result.result === 'untested').length
    if (untestedCount > 0 && !window.confirm(`${untestedCount} 个词会记为“未考”，不参与错词统计。确认完成吗？`)) return
    const saved = await persistGrader('completed', current)
    if (saved) setMessage(current.record ? '听写记录已更新，复习状态已重新计算。' : '听写记录已完成。')
  }

  async function closeGraderAndSave() {
    const current = graderRef.current
    if (!current || current.saving) return
    if (!current.dirty) {
      setGrader(null)
      return
    }
    const saved = await persistGrader(current.record?.status === 'completed' ? 'completed' : 'draft')
    if (saved) setGrader(null)
  }

  async function leaveWorkbench(next: () => void) {
    if (!await flushMeaningSaves()) return
    const current = graderRef.current
    if (current?.saving) return
    if (current?.dirty) {
      const saved = await persistGrader(current.record?.status === 'completed' ? 'completed' : 'draft', current)
      if (!saved) return
    }
    next()
  }

  async function editRecord(record: VocabularyDictationRecordDto) {
    setBusy(true)
    try {
      const task = tasks.find((item) => item.id === record.taskId) ?? await getVocabularyDictationTask(record.taskId)
      if (!tasks.some((item) => item.id === task.id)) setTasks((current) => [...current, task])
      openGrader(task, record)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写任务加载失败。')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRecordVoid(record: VocabularyDictationRecordDto) {
    setBusy(true)
    try {
      if (record.status === 'void') await restoreVocabularyDictationRecord(record.id)
      else await voidVocabularyDictationRecord(record.id)
      await refreshStudentData(activeStudentId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写记录状态更新失败。')
    } finally {
      setBusy(false)
    }
  }

  async function toggleMeaningRecordVoid(record: VocabularyMeaningRecallRecordDto) {
    setBusy(true)
    setError('')
    try {
      if (record.status === 'void') await restoreVocabularyMeaningRecallRecord(record.id)
      else await voidVocabularyMeaningRecallRecord(record.id)
      if (activeStudentId) await refreshStudentData(activeStudentId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '词义抽查记录状态修改失败。')
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
        setSelectedMeaningIds((current) => current.filter((id) => id !== state.id))
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
      const entries = await getSuggestedVocabularyReview(studentId, suggestionTarget)
      if (studentId === activeStudentIdRef.current) setSuggestion(entries)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '建议听写加载失败。')
    } finally {
      setBusy(false)
    }
  }

  async function createTaskFromReviewEntries(entries: StudentVocabularyReviewStateDto[]) {
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
          title: chunks.length > 1 ? `${defaultTaskTitle()}（${index + 1}/${chunks.length}）` : defaultTaskTitle(),
          accent,
        })
        const taskShare = await shareVocabularyDictationTask(task.id)
        nextTasks.push({ ...task, share: { ...taskShare, createdAt: new Date().toISOString(), revokedAt: null } })
      }
      setCreatedTasks(nextTasks)
      setTasks((current) => [...nextTasks, ...current])
      setSelectedReviewIds([])
      setSuggestion([])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '复听写任务生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function createTaskFromMeaningEntries(entries: StudentVocabularyMeaningStateDto[]) {
    if (!activeStudentId || !entries.length) return
    setBusy(true)
    setError('')
    try {
      const task = await createVocabularyDictationTask({
        studentId: activeStudentId,
        sourceSetIds: [...new Set(entries.flatMap((entry) => entry.sourceSetIds))],
        entryIds: entries.slice(0, 60).map((entry) => entry.id),
        title: `${today()} 认义复习`,
        accent,
      })
      const taskShare = await shareVocabularyDictationTask(task.id)
      const sharedTask = { ...task, share: { ...taskShare, createdAt: new Date().toISOString(), revokedAt: null } }
      setCreatedTasks([sharedTask])
      setTasks((current) => [sharedTask, ...current])
      setSelectedMeaningIds([])
      setTab('tasks')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '认义复习任务生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function copyEntries(entries: Array<VocabularySetEntry>) {
    try {
      await navigator.clipboard.writeText(entries.map((entry, index) => `${index + 1}. ${entry.headword}  ${formatMeaning(entry)}`).join('\n'))
      setMessage(`已复制 ${entries.length} 个词。`)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限。')
    }
  }

  async function printSelectedSets(kind: PrintKind) {
    if (!activeStudent || !selectedSets.length) return
    if (rawSelectedCount > 120 && !window.confirm(`这次会打印 ${rawSelectedCount} 个原始词，页数较多。继续吗？`)) return
    setBusy(true)
    try {
      await downloadCombinedVocabularyPdf({
        studentId: activeStudent.id,
        title: collectionTitle,
        sourceSetIds: selectedSets.map((set) => set.id),
        mode: printMode,
        accent,
        kind,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '合并打印失败。')
    } finally {
      setBusy(false)
    }
  }

  async function downloadTaskMaterial(taskId: string, kind: 'cards' | 'dictation' | 'answer') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await downloadVocabularyDictationTaskPdf(taskId, kind)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '听写资料下载失败，请重试。')
    } finally {
      setBusy(false)
    }
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
        <header className="dictation-workbench-heading">
          <div>
            <h1>单词复习</h1>
            <p>从冻结生词组开始词义抽查或完整听写；所有结果只属于当前学生。</p>
          </div>
          <label className="dictation-student-picker">
            <span>当前学生</span>
            <select value={activeStudentId} disabled={busy || Boolean(grader) || meaningSessionActive} onChange={(event) => void changeStudent(event.target.value)}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
            </select>
          </label>
        </header>

        <nav className="dictation-workbench-tabs" aria-label="单词复习分区">
          <button type="button" className={tab === 'sets' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('sets') }}>
            生词组 <span>{library.total}</span>
          </button>
          <button type="button" className={tab === 'meaning' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('meaning') }}>
            词义抽查 <span>{meaningRecords.filter((record) => record.status === 'draft').length}</span>
          </button>
          <button type="button" className={tab === 'tasks' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('tasks') }}>
            听写任务 <span>{tasks.length}</span>
          </button>
          <button type="button" className={tab === 'review' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('review') }}>
            待复习 <span>{pendingMeaningStates.length + pendingStates.length}</span>
          </button>
          <button type="button" className={tab === 'history' ? 'is-active' : ''} onClick={() => { void switchWorkbenchTab('history') }}>
            检测记录 <span>{meaningRecords.length + records.length}</span>
          </button>
        </nav>

        {(message || error) && (
          <div className={error ? 'dictation-notice is-error' : 'dictation-notice'} role={error ? 'alert' : 'status'}>
            <span>{error || message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => { setError(''); setMessage('') }}><X size={15} /></button>
          </div>
        )}

        {createdTasks.length > 0 && (
          <section ref={createdTasksRef} className="dictation-created-results" aria-label="刚刚生成的听写任务" tabIndex={-1}>
            <header>
              <div>
                <strong>{createdTasks.length > 1 ? `已生成 ${createdTasks.length} 份复听写任务` : '复听写任务已生成'}</strong>
                <span>{createdTasks.every((task) => task.share?.status === 'active') ? '二维码只放在下载资料里，三份资料共用同一听写任务。' : '任务词序已冻结，可以下载资料或开始批改。'}</span>
              </div>
              <button type="button" aria-label="收起已生成的听写任务" onClick={() => setCreatedTasks([])}><X size={16} /></button>
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
                      {publicHref && <a href={publicHref} target="_blank" rel="noreferrer"><Link2 size={14} />打开听写</a>}
                      <button type="button" onClick={() => openGrader(task)}><ClipboardCheck size={14} />开始批改</button>
                      <details className="dictation-download-menu">
                        <summary><Download size={14} />下载资料<ChevronDown size={14} aria-hidden="true" /></summary>
                        <div>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'cards') }}><BookOpenCheck size={14} />{publicHref ? '单词卡（含二维码）' : '单词卡'}</button>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'dictation') }}><Download size={14} />{publicHref ? '复听写纸（含二维码）' : '复听写纸'}</button>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'answer') }}><FileCheck2 size={14} />教师答案</button>
                        </div>
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
                <input aria-label="搜索生词组" value={searchInput} placeholder="搜索标题或单词" onChange={(event) => setSearchInput(event.target.value)} />
              </label>
              <label>从 <input type="date" value={fromDate} onChange={(event) => { setLibrary((current) => ({ ...current, page: 1 })); setFromDate(event.target.value) }} /></label>
              <label>到 <input type="date" value={toDate} onChange={(event) => { setLibrary((current) => ({ ...current, page: 1 })); setToDate(event.target.value) }} /></label>
              {(query || fromDate || toDate) && <button type="button" onClick={() => { setSearchInput(''); setQuery(''); setFromDate(''); setToDate('') }}>清除筛选</button>}
            </div>

            <div className="dictation-set-list" aria-label="完整生词组库">
              {library.items.length ? library.items.map((set) => {
                const selectedIndex = selectedSets.findIndex((item) => item.id === set.id)
                return (
                  <label className={selectedIndex >= 0 ? 'dictation-set-row is-selected' : 'dictation-set-row'} key={set.id}>
                    <input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleSet(set)} />
                    <span className="dictation-selection-order">{selectedIndex >= 0 ? selectedIndex + 1 : ''}</span>
                    <span className="dictation-set-main">
                      <strong>{set.title}</strong>
                      <small>{set.entryCount} 词 · {set.entries.slice(0, 5).map((entry) => entry.headword).join('、')}{set.entryCount > 5 ? '…' : ''}</small>
                    </span>
                    <span className="dictation-set-stats">
                      <strong>待认义 {set.dictationSummary.meaningRecall.pendingCount} · 待复听写 {set.dictationSummary.pendingCount}</strong>
                      <small>词义最近 {displayDate(set.dictationSummary.meaningRecall.latestDate)} · 反复忘记 {set.dictationSummary.meaningRecall.repeatedCount}</small>
                      <small>{set.dictationSummary.recordCount ? `听写 ${set.dictationSummary.recordCount} 次 · 最近错 ${set.dictationSummary.latestWrongCount} 词` : '尚未完成听写'}</small>
                    </span>
                  </label>
                )
              }) : <div className="dictation-empty-state"><BookOpenCheck size={28} /><h2>没有符合条件的生词组</h2><p>换一个搜索词或日期范围。</p></div>}
            </div>

            {library.total > library.pageSize && (
              <div className="dictation-pagination">
                <button type="button" disabled={library.page <= 1} onClick={() => setLibrary((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={16} />上一页</button>
                <span>第 {library.page} / {Math.ceil(library.total / library.pageSize)} 页</span>
                <button type="button" disabled={!library.hasMore} onClick={() => setLibrary((current) => ({ ...current, page: current.page + 1 }))}>下一页<ChevronRight size={16} /></button>
              </div>
            )}

            {selectedSets.length > 0 && (
              <aside className="dictation-selection-panel" aria-label="已选生词组合并工具">
                <div className="dictation-selection-summary">
                  <div><strong>已选 {selectedSets.length} 组</strong><span>原始 {rawSelectedCount} 词 · 合并去重 {uniqueSelectedEntries.length} 词</span></div>
                  <button type="button" onClick={() => setSelectedSets([])}>取消全选</button>
                </div>
                {rawSelectedCount > 120 && <p className="dictation-volume-warning">这次合集超过 120 词，打印会自动分页；二维码听写仍按 60 词拆分。</p>}
                <div className="dictation-combine-settings">
                  <label><span>打印标题</span><input value={collectionTitle} maxLength={60} onChange={(event) => setCollectionTitle(event.target.value)} /></label>
                  <label><span>听写标题</span><input value={taskTitle} maxLength={60} onChange={(event) => setTaskTitle(event.target.value)} /></label>
                  <fieldset><legend>口音</legend><button type="button" className={accent === 'american' ? 'is-selected' : ''} onClick={() => setAccent('american')}>美音</button><button type="button" className={accent === 'british' ? 'is-selected' : ''} onClick={() => setAccent('british')}>英音</button></fieldset>
                  <label className="dictation-check-setting"><input type="checkbox" checked={shuffleBeforeFreeze} onChange={(event) => setShuffleBeforeFreeze(event.target.checked)} /><Shuffle size={15} />冻结前打乱</label>
                </div>
                <div className="dictation-selection-actions">
                  <button type="button" onClick={() => setTab('meaning')}><Eye size={16} />看词说义</button>
                  <details>
                    <summary><Printer size={16} />合并打印</summary>
                    <div>
                      <label><input type="radio" name="print-mode" checked={printMode === 'dedupe'} onChange={() => setPrintMode('dedupe')} />合并去重</label>
                      <label><input type="radio" name="print-mode" checked={printMode === 'grouped'} onChange={() => setPrintMode('grouped')} />按组装订</label>
                      <button type="button" onClick={() => void printSelectedSets('cards')}>单词卡</button>
                      <button type="button" onClick={() => void printSelectedSets('dictation')}>无二维码听写纸</button>
                      <button type="button" onClick={() => void printSelectedSets('answer')}>教师答案</button>
                      <button type="button" onClick={() => void printSelectedSets('word-search')}>找单词练习</button>
                    </div>
                  </details>
                  <button type="button" onClick={() => void createTasks({ share: true, openFirst: false })} disabled={busy}><QrCode size={16} />生成合并二维码听写</button>
                  <button type="button" onClick={() => void createTasks({ share: false, openFirst: true })} disabled={busy}><ClipboardCheck size={16} />补录纸笔听写</button>
                  <button type="button" onClick={() => {
                    const selectedIds = new Set(selectedSets.map((set) => set.id))
                    const selectedPending = pendingStates.filter((state) => state.sourceSetIds.some((id) => selectedIds.has(id)))
                    setSelectedReviewIds(selectedPending.map((state) => state.id)); setReviewMode('pending'); setTab('review')
                  }}><ListChecks size={16} />导出所选组待复听写词</button>
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
            states={meaningStates}
            accent={accent}
            requestedRecordId={requestedMeaningRecordId}
            onRequestedRecordHandled={() => setRequestedMeaningRecordId(null)}
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
              <header><div><h2>可批改的听写任务</h2><p>同一份公开听写可以记录多次真实听写。</p></div></header>
              {tasks.length ? <div className="dictation-task-list">{tasks.map((task) => {
                const publicHref = task.share?.status === 'active'
                  ? `${window.location.origin}/vocabulary/dictation/${task.share.shareId}`
                  : null
                return (
                  <article key={task.id}>
                    <div><strong>{task.title}</strong><span>{task.entryCount} 词 · {task.accent === 'american' ? '美音' : '英音'} · {publicHref ? '二维码有效' : '未公开'}</span></div>
                    <div>
                      <button type="button" onClick={() => openGrader(task)}>新批改</button>
                      {publicHref && <a href={publicHref} target="_blank" rel="noreferrer"><Link2 size={14} />打开听写</a>}
                      <details className="dictation-download-menu">
                        <summary><Download size={14} />下载资料<ChevronDown size={14} aria-hidden="true" /></summary>
                        <div>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'cards') }}><BookOpenCheck size={14} />{publicHref ? '单词卡（含二维码）' : '单词卡'}</button>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'dictation') }}><Download size={14} />{publicHref ? '复听写纸（含二维码）' : '复听写纸'}</button>
                          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadTaskMaterial(task.id, 'answer') }}><FileCheck2 size={14} />教师答案</button>
                        </div>
                      </details>
                      <button type="button" onClick={() => void toggleTaskShare(task)} disabled={busy}>{publicHref ? '撤销二维码' : <><QrCode size={15} />生成二维码</>}</button>
                    </div>
                  </article>
                )
              })}</div> : <div className="dictation-empty-state"><ClipboardCheck size={28} /><h2>还没有听写任务</h2><p>先到“生词组”勾选并创建二维码或纸笔听写。</p></div>}
            </div>

          </section>
        )}

        {tab === 'history' && (
          <section className="dictation-record-list dictation-history-list">
            <header><div><h2>检测记录</h2><p>词义抽查与完整听写按日期排在一起；草稿和作废记录也会保留。</p></div></header>
            {detectionHistory.length ? detectionHistory.map((item) => {
              if (item.kind === 'meaning') {
                const record = item.record
                const counts = countMeaningRecordResults(record)
                return (
                  <article className={record.status === 'void' ? 'is-void' : ''} key={`meaning-${record.id}`}>
                    <div><strong>{record.title}</strong><span>{displayDate(item.date)} · 词义抽查 · {record.status === 'completed' ? '已完成' : record.status === 'draft' ? '草稿' : '已作废'}</span></div>
                    <div className="dictation-record-counts"><span>错 {counts.wrong}</span><span>对 {counts.correct}</span>{counts.untested > 0 && <span>未测 {counts.untested}</span>}</div>
                    <div>
                      <button type="button" disabled={record.status === 'void'} onClick={() => { setRequestedMeaningRecordId(record.id); setTab('meaning') }}>{record.status === 'draft' ? '继续抽查' : '查看 / 编辑'}</button>
                      <button type="button" onClick={() => void toggleMeaningRecordVoid(record)} disabled={busy}>{record.status === 'void' ? <><Undo2 size={14} />恢复</> : '作废'}</button>
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
                  <div>
                    <button type="button" onClick={() => void editRecord(record)} disabled={record.status === 'void'}>查看 / 编辑</button>
                    <button type="button" onClick={() => void toggleRecordVoid(record)} disabled={busy}>{record.status === 'void' ? <><Undo2 size={14} />恢复</> : '作废'}</button>
                  </div>
                </article>
              )
            }) : <div className="dictation-empty-state"><FileCheck2 size={28} /><h2>还没有检测记录</h2><p>完成一次词义抽查或听写批改后，就会出现在这里。</p></div>}
          </section>
        )}

        {tab === 'review' && (
          <section className="dictation-review-workspace">
            <header className="dictation-review-heading">
              <div><h2>待复习</h2><p>认义和拼写分开展示，但老师仍然只需判断对或错。</p></div>
              <div className="dictation-review-channel" role="group" aria-label="待复习类型">
                <button type="button" className={reviewMode === 'meaning' ? 'is-selected' : ''} onClick={() => setReviewMode('meaning')}>待认义 {pendingMeaningStates.length}</button>
                <button type="button" className={reviewMode === 'pending' ? 'is-selected' : ''} onClick={() => setReviewMode('pending')}>待复听写 {pendingStates.length}</button>
                <button type="button" className={reviewMode === 'stubborn' ? 'is-selected' : ''} onClick={() => setReviewMode('stubborn')}>顽固错词 {stubbornStates.length}</button>
              </div>
            </header>

            {reviewMode === 'meaning' && (
              <>
                {selectedMeaningStates.length > 0 && <div className="dictation-review-actions">
                  <span>已选 {selectedMeaningStates.length} 词</span>
                  <button type="button" onClick={() => void createTaskFromMeaningEntries(selectedMeaningStates)} disabled={busy}><Sparkles size={15} />生成复习任务</button>
                  <button type="button" onClick={() => void copyEntries(selectedMeaningStates)}><Copy size={15} />复制清单</button>
                  <button type="button" onClick={() => setSelectedMeaningIds([])}>取消</button>
                </div>}
                {pendingMeaningStates.length ? <div className="dictation-review-table" role="table" aria-label="待认义词">
                  <div className="dictation-review-table-head" role="row"><span>选择</span><span>单词</span><span>遗忘轨迹</span><span>当前状态</span><span>人工调整</span></div>
                  {pendingMeaningStates.map((state, index) => (
                    <div className="dictation-review-row" role="row" key={state.id}>
                      <label><input type="checkbox" checked={selectedMeaningIds.includes(state.id)} onChange={() => setSelectedMeaningIds((current) => current.includes(state.id) ? current.filter((id) => id !== state.id) : [...current, state.id])} /><span>{state.status === 'repeated' ? index + 1 : ''}</span></label>
                      <div><strong>{state.headword}</strong><small>{state.partOfSpeech} {formatMeaning(state)}</small></div>
                      <div><strong>累计忘记 {state.totalWrong} 次</strong><small>{state.currentWrongDateCount} 个日期 · 最近 {displayDate(state.lastForgottenDate)}</small></div>
                      <div><strong>{state.status === 'repeated' ? '反复忘记' : '待认义'}</strong><small>{state.currentCorrectDateCount ? `已连续 ${state.currentCorrectDateCount} 个日期答对` : '还需跨日两次答对'}</small></div>
                      <div><button type="button" className={state.pinned ? 'is-active' : ''} aria-pressed={state.pinned} onClick={() => void toggleFlag(state, 'pinned')}><Pin size={14} />重点</button><button type="button" onClick={() => void toggleFlag(state, 'paused')}><PauseCircle size={14} />暂停</button></div>
                    </div>
                  ))}
                </div> : <div className="dictation-empty-state"><Check size={28} /><h2>当前没有待认义词</h2><p>完成一次词义抽查后，这里会按跨日规则自动更新。</p></div>}
              </>
            )}

            {reviewMode !== 'meaning' && <>
              <div className="dictation-suggestion-control dictation-suggestion-control-row">
                {pausedReviewStates.length > 0 && <button type="button" aria-pressed={showPausedReview} onClick={() => setShowPausedReview((current) => !current)}>{showPausedReview ? '隐藏' : '显示'}已暂停（{pausedReviewStates.length}）</button>}
                <label>下次建议 <input type="number" min="1" max="60" value={suggestionTarget} onChange={(event) => setSuggestionTarget(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> 词</label>
                <button type="button" onClick={() => void loadSuggestion()} disabled={busy}><Sparkles size={15} />生成建议</button>
              </div>

            {suggestion.length > 0 && (
              <aside className="dictation-suggestion-panel">
                <div><strong>建议复听写 {suggestion.length} 词</strong><span>每个词都有入选理由，确认后才会生成任务。</span></div>
                <ol>{suggestion.map((entry) => <li key={entry.id}><span>{entry.headword}</span><small>{entry.reason}</small></li>)}</ol>
                <div><button type="button" onClick={() => void createTaskFromReviewEntries(suggestion)}><Sparkles size={15} />生成复听写任务</button><button type="button" onClick={() => setSuggestion([])}>收起</button></div>
              </aside>
            )}

            {selectedReviewStates.length > 0 && (
              <div className="dictation-review-actions">
                <span>已选 {selectedReviewStates.length} 词</span>
                <button type="button" onClick={() => void createTaskFromReviewEntries(selectedReviewStates)} disabled={busy}><Sparkles size={15} />生成复听写任务</button>
                <button type="button" onClick={() => void copyEntries(selectedReviewStates)}><Copy size={15} />复制清单</button>
                <button type="button" onClick={() => setSelectedReviewIds([])}>取消</button>
              </div>
            )}

            {visibleReviewStates.length ? (
              <div className="dictation-review-table" role="table" aria-label={reviewMode === 'stubborn' ? '顽固错词排行' : '待复听写词'}>
                <div className="dictation-review-table-head" role="row"><span>选择</span><span>单词</span><span>错误轨迹</span><span>当前状态</span><span>人工调整</span></div>
                {visibleReviewStates.map((state, index) => (
                  <div className={state.paused ? 'dictation-review-row is-paused' : 'dictation-review-row'} role="row" key={state.id}>
                    <label><input type="checkbox" checked={selectedReviewIds.includes(state.id)} onChange={() => setSelectedReviewIds((current) => current.includes(state.id) ? current.filter((id) => id !== state.id) : [...current, state.id])} /><span>{reviewMode === 'stubborn' ? index + 1 : ''}</span></label>
                    <div><strong>{state.headword}</strong><small>{state.partOfSpeech} {formatMeaning(state)}</small></div>
                    <div><strong>累计错 {state.totalWrong} 次</strong><small>近 {state.recentAttempts} 次错误率 {Math.round(state.recentWrongRate * 100)}% · 最近 {displayDate(state.lastWrongDate)}</small>{state.lastWrongSpelling && <small>上次写成：{state.lastWrongSpelling}</small>}</div>
                    <div><strong>{state.status === 'stubborn' ? '顽固' : state.status === 'pending' ? `还需连续通过 ${2 - state.currentConsecutiveCorrect} 次` : '已改善'}</strong><small>{state.wrongDateCount} 个日期写错{state.paused ? ' · 已暂停' : ''}</small></div>
                    <div><button type="button" className={state.pinned ? 'is-active' : ''} aria-pressed={state.pinned} onClick={() => void toggleFlag(state, 'pinned')}><Pin size={14} />重点</button><button type="button" className={state.paused ? 'is-active' : ''} aria-pressed={state.paused} onClick={() => void toggleFlag(state, 'paused')}><PauseCircle size={14} />暂停</button></div>
                  </div>
                ))}
              </div>
            ) : <div className="dictation-empty-state"><Check size={28} /><h2>{reviewMode === 'stubborn' ? '暂时没有顽固错词' : '当前没有待复听写词'}</h2><p>完成一次教师确认的听写后，这里会按规则自动更新。</p></div>}
            </>}
          </section>
        )}
      </main>

      {grader && (
        <div className="dictation-grader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeGraderAndSave() }}>
          <section ref={graderDialogRef} className="dictation-grader" role="dialog" aria-modal="true" aria-labelledby="dictation-grader-title" tabIndex={-1}>
            <header>
              <div><h2 id="dictation-grader-title">{grader.task.title}</h2><p>{grader.task.entryCount} 词 · {grader.record?.status === 'completed' ? '编辑已完成记录' : grader.record ? '草稿自动保存' : '新批改'}</p></div>
              <button type="button" aria-label="保存并关闭批改" onClick={() => void closeGraderAndSave()} disabled={grader.saving}><X /></button>
            </header>
            <div className="dictation-grader-settings">
              <fieldset><legend>听写方式</legend><button type="button" className={grader.mode === 'all' ? 'is-selected' : ''} onClick={() => changeGraderMode('all')}>整组听写</button><button type="button" className={grader.mode === 'partial' ? 'is-selected' : ''} onClick={() => changeGraderMode('partial')}>抽听</button></fieldset>
              <label><span>听写日期</span><input type="date" value={grader.dictationDate} onChange={(event) => updateGrader((current) => markDirty(current, { dictationDate: event.target.value }))} /></label>
              <span className="dictation-save-status">{grader.saving ? '正在保存…' : grader.dirty ? '等待自动保存' : grader.record ? '已保存' : '尚未修改'}</span>
            </div>
            <div className="dictation-number-entry">
              {grader.mode === 'partial' && <label><span>实际抽听题号</span><input value={grader.testedNumbers} placeholder="1-10, 15, 18" onChange={(event) => updateGrader((current) => ({ ...current, testedNumbers: event.target.value }))} /></label>}
              <label><span>错词题号</span><input value={grader.wrongNumbers} placeholder="2, 5, 8-10" onChange={(event) => updateGrader((current) => ({ ...current, wrongNumbers: event.target.value }))} /></label>
              <button type="button" onClick={applyNumberInputs}>应用题号</button>
              <small>题号应用后会清空，可继续点击题号调整；方向键移动，空格标错，Cmd/Ctrl+Enter 完成</small>
            </div>
            {graderError && <p className="dictation-grader-error" role="alert">{graderError}</p>}
            <div className="dictation-grader-grid">
              {grader.task.entries.map((entry, index) => {
                const result = grader.results[entry.id]
                return (
                  <article className={`is-${result.result}${grader.activeIndex === index ? ' is-active' : ''}`} key={entry.id} onClick={() => updateGrader((current) => ({ ...current, activeIndex: index }))}>
                    <button type="button" className="dictation-grade-number" onClick={() => toggleWrong(entry.id)} aria-label={`第 ${index + 1} 题，${result.result === 'wrong' ? '已标错' : result.result === 'untested' ? '未考' : '正确'}`}><span>{index + 1}</span>{result.result === 'wrong' ? <X size={15} /> : result.result === 'correct' ? <Check size={15} /> : '—'}</button>
                    <div><strong>{entry.headword}</strong><small>{entry.partOfSpeech} {formatMeaning(entry)}</small></div>
                    {result.result === 'wrong' && <input aria-label={`${entry.headword} 的错误拼写`} value={result.wrongSpelling} placeholder="错误拼写（选填）" onChange={(event) => updateGrader((current) => markDirty(current, { results: { ...current.results, [entry.id]: { ...current.results[entry.id], wrongSpelling: event.target.value } } }))} />}
                  </article>
                )
              })}
            </div>
            <label className="dictation-grader-note"><span>教师备注（选填）</span><textarea rows={2} value={grader.note} onChange={(event) => updateGrader((current) => markDirty(current, { note: event.target.value }))} /></label>
            <footer>
              <div><Flag size={15} /><span>错 {Object.values(grader.results).filter((result) => result.result === 'wrong').length}</span><span>对 {Object.values(grader.results).filter((result) => result.result === 'correct').length}</span><span>未考 {Object.values(grader.results).filter((result) => result.result === 'untested').length}</span></div>
              <div><button type="button" onClick={() => void closeGraderAndSave()} disabled={grader.saving}>保存并稍后继续</button><button type="button" className="is-primary" onClick={() => void completeGrading()} disabled={grader.saving}><FileCheck2 size={16} />{grader.record?.status === 'completed' ? '保存修改' : '完成批改'}</button></div>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
