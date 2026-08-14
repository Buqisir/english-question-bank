import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
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
  getStudentVocabularyReviewStates,
  getSuggestedVocabularyReview,
  getVocabularyDictationTask,
  getVocabularySetLibrary,
  listVocabularyDictationRecords,
  listVocabularyDictationTasks,
  listVocabularyStudents,
  revokeVocabularyDictationTaskShare,
  restoreVocabularyDictationRecord,
  shareVocabularyDictationTask,
  updateStudentVocabularyWordFlag,
  updateVocabularyDictationRecord,
  voidVocabularyDictationRecord,
  type StudentVocabularyReviewStateDto,
  type VocabularyDictationRecordDto,
  type VocabularyDictationResult,
  type VocabularyDictationTaskDto,
  type VocabularySetLibraryDto,
  type VocabularySetLibraryItemDto,
  type VocabularyStudentDto,
} from '../../services/vocabulary'
import './vocabularyDictationWorkbench.css'

const ACTIVE_STUDENT_STORAGE_KEY = 'eqb-vocabulary-active-student-wanwei-round-one-v1'
const SUGGESTION_TARGET_STORAGE_KEY = 'eqb-vocabulary-review-suggestion-target-v1'
type WorkspaceTab = 'sets' | 'records' | 'pending' | 'stubborn'
type Accent = 'american' | 'british'
type PrintKind = 'cards' | 'dictation' | 'answer' | 'word-search' | 'correction'

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
  shellNav,
}: {
  onBackToVocabulary: () => void
  shellNav: AppTopbarNav
}) {
  const [students, setStudents] = useState<VocabularyStudentDto[]>([])
  const [activeStudentId, setActiveStudentId] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tab, setTab] = useState<WorkspaceTab>('sets')
  const [library, setLibrary] = useState<VocabularySetLibraryDto>({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false })
  const [tasks, setTasks] = useState<VocabularyDictationTaskDto[]>([])
  const [records, setRecords] = useState<VocabularyDictationRecordDto[]>([])
  const [reviewStates, setReviewStates] = useState<StudentVocabularyReviewStateDto[]>([])
  const [selectedSets, setSelectedSets] = useState<VocabularySetLibraryItemDto[]>([])
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
  const [graderError, setGraderError] = useState('')
  const [grader, setGrader] = useState<GraderState | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState(() => {
    const stored = Number(window.localStorage.getItem(SUGGESTION_TARGET_STORAGE_KEY))
    return Math.max(1, Math.min(60, stored || 20))
  })
  const [suggestion, setSuggestion] = useState<StudentVocabularyReviewStateDto[]>([])
  const [showPausedReview, setShowPausedReview] = useState(false)
  const [libraryRefreshVersion, setLibraryRefreshVersion] = useState(0)
  const graderRef = useRef<GraderState | null>(null)
  const graderDialogRef = useRef<HTMLElement | null>(null)
  const studentDataVersionRef = useRef(0)
  const activeStudentIdRef = useRef('')

  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null
  const graderTaskId = grader?.task.id ?? null
  const uniqueSelectedEntries = useMemo(() => dedupeEntries(selectedSets), [selectedSets])
  const rawSelectedCount = selectedSets.reduce((sum, set) => sum + set.entryCount, 0)
  const pendingStates = reviewStates.filter((state) => state.status !== 'improved' && !state.paused)
  const stubbornStates = reviewStates.filter((state) => state.status === 'stubborn' && !state.paused)
  const pausedReviewStates = reviewStates.filter((state) => state.paused && (
    tab === 'stubborn' ? state.status === 'stubborn' : state.status !== 'improved'
  ))
  const visibleReviewStates = [
    ...(tab === 'stubborn' ? stubbornStates : pendingStates),
    ...(showPausedReview ? pausedReviewStates : []),
  ]
  const selectedReviewStates = reviewStates.filter((state) => !state.paused && selectedReviewIds.includes(state.id))

  useEffect(() => {
    graderRef.current = grader
  }, [grader])

  useEffect(() => {
    if (graderTaskId) window.requestAnimationFrame(() => graderDialogRef.current?.focus())
  }, [graderTaskId])

  const refreshStudentData = useCallback(async (studentId: string) => {
    const requestedVersion = studentDataVersionRef.current + 1
    studentDataVersionRef.current = requestedVersion
    const [nextTasks, nextRecords, nextStates] = await Promise.all([
      listVocabularyDictationTasks(studentId),
      listVocabularyDictationRecords(studentId),
      getStudentVocabularyReviewStates(studentId),
    ])
    if (requestedVersion !== studentDataVersionRef.current || studentId !== activeStudentIdRef.current) return
    setTasks(nextTasks)
    setRecords(nextRecords)
    setReviewStates(nextStates)
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
    setCreatedTasks([])
    setGrader(null)
    setTasks([])
    setRecords([])
    setReviewStates([])
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
      setMessage(share ? `已生成 ${nextTasks.length} 份二维码听写。` : `已建立 ${nextTasks.length} 份纸笔听写任务。`)
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

  async function toggleFlag(state: StudentVocabularyReviewStateDto, kind: 'pinned' | 'paused') {
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
      setMessage(`已生成 ${nextTasks.length} 份复听写二维码。`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '复听写任务生成失败。')
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

  async function printReviewEntries(kind: PrintKind, entries = selectedReviewStates) {
    if (!activeStudent || !entries.length) return
    setBusy(true)
    try {
      await downloadCombinedVocabularyPdf({
        studentId: activeStudent.id,
        title: `${activeStudent.displayName} · 错词复习 · ${today()}`,
        entryIds: entries.map((entry) => entry.id),
        mode: 'dedupe',
        accent,
        kind,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '错词打印失败。')
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
        pageTitle="听写与复习"
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
            <h1>听写与复习</h1>
            <p>冻结生词组保持不变；听写结果、待复听写和顽固错词只属于当前学生。</p>
          </div>
          <label className="dictation-student-picker">
            <span>当前学生</span>
            <select value={activeStudentId} disabled={busy || Boolean(grader)} onChange={(event) => void changeStudent(event.target.value)}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
            </select>
          </label>
        </header>

        <nav className="dictation-workbench-tabs" aria-label="听写与复习分区">
          <button type="button" className={tab === 'sets' ? 'is-active' : ''} onClick={() => setTab('sets')}>
            生词组 <span>{library.total}</span>
          </button>
          <button type="button" className={tab === 'records' ? 'is-active' : ''} onClick={() => setTab('records')}>
            听写记录 <span>{records.length}</span>
          </button>
          <button type="button" className={tab === 'pending' ? 'is-active' : ''} onClick={() => setTab('pending')}>
            待复听写 <span>{pendingStates.length}</span>
          </button>
          <button type="button" className={tab === 'stubborn' ? 'is-active' : ''} onClick={() => setTab('stubborn')}>
            顽固错词 <span>{stubbornStates.length}</span>
          </button>
        </nav>

        {(message || error) && (
          <div className={error ? 'dictation-notice is-error' : 'dictation-notice'} role={error ? 'alert' : 'status'}>
            <span>{error || message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => { setError(''); setMessage('') }}><X size={15} /></button>
          </div>
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
                      {set.dictationSummary.recordCount
                        ? <><strong>最近错 {set.dictationSummary.latestWrongCount} 词</strong><small>累计 {set.dictationSummary.recordCount} 次 · 待复听写 {set.dictationSummary.pendingCount}</small></>
                        : <><strong>尚未听写</strong><small>{displayDate(set.createdAt)}</small></>}
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
                  <details>
                    <summary><Printer size={16} />合并打印</summary>
                    <div>
                      <label><input type="radio" name="print-mode" checked={printMode === 'dedupe'} onChange={() => setPrintMode('dedupe')} />合并去重</label>
                      <label><input type="radio" name="print-mode" checked={printMode === 'grouped'} onChange={() => setPrintMode('grouped')} />按组装订</label>
                      <button type="button" onClick={() => void printSelectedSets('cards')}>记忆卡</button>
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
                    setSelectedReviewIds(selectedPending.map((state) => state.id)); setTab('pending')
                  }}><ListChecks size={16} />导出所选组待复听写词</button>
                </div>
                {createdTasks.length > 0 && (
                  <div className="dictation-created-links">
                    {createdTasks.map((task) => (
                      <div key={task.id}>
                        <span><strong>{task.title}</strong> · {task.entryCount} 词 · {task.accent === 'american' ? '美音' : '英音'}</span>
                        {task.share?.status === 'active' && <a href={`${window.location.origin}/vocabulary/dictation/${task.share.shareId}`} target="_blank" rel="noreferrer"><Link2 size={14} />打开听写</a>}
                        <button type="button" onClick={() => openGrader(task)}>开始批改</button>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            )}
          </section>
        )}

        {tab === 'records' && (
          <section className="dictation-records-workspace">
            <div className="dictation-task-queue">
              <header><div><h2>可批改的听写任务</h2><p>同一个二维码任务可以记录多次真实听写。</p></div></header>
              {tasks.length ? <div className="dictation-task-list">{tasks.map((task) => (
                <article key={task.id}>
                  <div><strong>{task.title}</strong><span>{task.entryCount} 词 · {task.accent === 'american' ? '美音' : '英音'} · {task.share?.status === 'active' ? '二维码有效' : '未公开'}</span></div>
                  <div>
                    <button type="button" onClick={() => openGrader(task)}>新批改</button>
                    <button type="button" onClick={() => void downloadVocabularyDictationTaskPdf(task.id, 'dictation')}><Download size={15} />听写纸</button>
                    <button type="button" onClick={() => void downloadVocabularyDictationTaskPdf(task.id, 'answer')}><FileCheck2 size={15} />答案</button>
                    {task.share?.status === 'active' && <a href={`${window.location.origin}/vocabulary/dictation/${task.share.shareId}`} target="_blank" rel="noreferrer"><Link2 size={14} />打开听写</a>}
                    <button type="button" onClick={() => void toggleTaskShare(task)} disabled={busy}>{task.share?.status === 'active' ? '撤销二维码' : <><QrCode size={15} />生成二维码</>}</button>
                  </div>
                </article>
              ))}</div> : <div className="dictation-empty-state"><ClipboardCheck size={28} /><h2>还没有听写任务</h2><p>先到“生词组”勾选并创建二维码或纸笔听写。</p></div>}
            </div>

            <div className="dictation-record-list">
              <header><div><h2>听写记录</h2><p>完成、草稿和作废记录都会保留。</p></div></header>
              {records.length ? records.map((record) => {
                const counts = countRecordResults(record)
                return (
                  <article className={record.status === 'void' ? 'is-void' : ''} key={record.id}>
                    <div><strong>{record.taskTitle}</strong><span>{displayDate(record.dictationDate)} · {record.mode === 'all' ? '整组' : '抽听'} · {record.status === 'completed' ? '已完成' : record.status === 'draft' ? '草稿' : '已作废'}</span></div>
                    <div className="dictation-record-counts"><span>错 {counts.wrong}</span><span>对 {counts.correct}</span>{counts.untested > 0 && <span>未考 {counts.untested}</span>}</div>
                    <div><button type="button" onClick={() => void editRecord(record)} disabled={record.status === 'void'}>查看 / 编辑</button><button type="button" onClick={() => void toggleRecordVoid(record)} disabled={busy}>{record.status === 'void' ? <><Undo2 size={14} />恢复</> : '作废'}</button></div>
                  </article>
                )
              }) : <div className="dictation-empty-state"><FileCheck2 size={28} /><h2>还没有批改记录</h2><p>创建任务后，老师可以只点错词完成批改。</p></div>}
            </div>
          </section>
        )}

        {(tab === 'pending' || tab === 'stubborn') && (
          <section className="dictation-review-workspace">
            <header className="dictation-review-heading">
              <div><h2>{tab === 'stubborn' ? '顽固错词排行' : '待复听写'}</h2><p>{tab === 'stubborn' ? '至少两个不同日期写错且尚未连续两次通过。' : '写错一次即进入；连续两次有效听写正确后转为已改善。'}</p></div>
              <div className="dictation-suggestion-control">
                {pausedReviewStates.length > 0 && <button type="button" aria-pressed={showPausedReview} onClick={() => setShowPausedReview((current) => !current)}>{showPausedReview ? '隐藏' : '显示'}已暂停（{pausedReviewStates.length}）</button>}
                <label>下次建议 <input type="number" min="1" max="60" value={suggestionTarget} onChange={(event) => setSuggestionTarget(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> 词</label>
                <button type="button" onClick={() => void loadSuggestion()} disabled={busy}><Sparkles size={15} />生成建议</button>
              </div>
            </header>

            {suggestion.length > 0 && (
              <aside className="dictation-suggestion-panel">
                <div><strong>建议复听写 {suggestion.length} 词</strong><span>每个词都有入选理由，确认后才会生成任务。</span></div>
                <ol>{suggestion.map((entry) => <li key={entry.id}><span>{entry.headword}</span><small>{entry.reason}</small></li>)}</ol>
                <div><button type="button" onClick={() => void createTaskFromReviewEntries(suggestion)}><QrCode size={15} />确认并生成二维码</button><button type="button" onClick={() => setSuggestion([])}>收起</button></div>
              </aside>
            )}

            {selectedReviewStates.length > 0 && (
              <div className="dictation-review-actions">
                <span>已选 {selectedReviewStates.length} 词</span>
                <button type="button" onClick={() => void printReviewEntries('cards')}>记忆卡</button>
                <button type="button" onClick={() => void printReviewEntries('correction')}>订正纸</button>
                <button type="button" onClick={() => void printReviewEntries('dictation')}>复听写纸</button>
                <button type="button" onClick={() => void printReviewEntries('answer')}>教师答案</button>
                <button type="button" onClick={() => void createTaskFromReviewEntries(selectedReviewStates)}><QrCode size={15} />二维码任务</button>
                <button type="button" onClick={() => void copyEntries(selectedReviewStates)}><Copy size={15} />复制清单</button>
                <button type="button" onClick={() => setSelectedReviewIds([])}>取消</button>
              </div>
            )}

            {visibleReviewStates.length ? (
              <div className="dictation-review-table" role="table" aria-label={tab === 'stubborn' ? '顽固错词排行' : '待复听写词'}>
                <div className="dictation-review-table-head" role="row"><span>选择</span><span>单词</span><span>错误轨迹</span><span>当前状态</span><span>人工调整</span></div>
                {visibleReviewStates.map((state, index) => (
                  <div className={state.paused ? 'dictation-review-row is-paused' : 'dictation-review-row'} role="row" key={state.id}>
                    <label><input type="checkbox" checked={selectedReviewIds.includes(state.id)} onChange={() => setSelectedReviewIds((current) => current.includes(state.id) ? current.filter((id) => id !== state.id) : [...current, state.id])} /><span>{tab === 'stubborn' ? index + 1 : ''}</span></label>
                    <div><strong>{state.headword}</strong><small>{state.partOfSpeech} {formatMeaning(state)}</small></div>
                    <div><strong>累计错 {state.totalWrong} 次</strong><small>近 {state.recentAttempts} 次错误率 {Math.round(state.recentWrongRate * 100)}% · 最近 {displayDate(state.lastWrongDate)}</small>{state.lastWrongSpelling && <small>上次写成：{state.lastWrongSpelling}</small>}</div>
                    <div><strong>{state.status === 'stubborn' ? '顽固' : state.status === 'pending' ? `还需连续通过 ${2 - state.currentConsecutiveCorrect} 次` : '已改善'}</strong><small>{state.wrongDateCount} 个日期写错{state.paused ? ' · 已暂停' : ''}</small></div>
                    <div><button type="button" className={state.pinned ? 'is-active' : ''} aria-pressed={state.pinned} onClick={() => void toggleFlag(state, 'pinned')}><Pin size={14} />重点</button><button type="button" className={state.paused ? 'is-active' : ''} aria-pressed={state.paused} onClick={() => void toggleFlag(state, 'paused')}><PauseCircle size={14} />暂停</button></div>
                  </div>
                ))}
              </div>
            ) : <div className="dictation-empty-state"><Check size={28} /><h2>{tab === 'stubborn' ? '暂时没有顽固错词' : '当前没有待复听写词'}</h2><p>完成一次教师确认的听写后，这里会按规则自动更新。</p></div>}
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
