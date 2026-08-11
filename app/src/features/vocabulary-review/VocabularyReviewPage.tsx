import {
  ArrowLeft,
  BookMarked,
  Check,
  Copy,
  Download,
  Eye,
  Grid2X2,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import {
  countVocabularyDecisions,
  createVocabularyReviewState,
  filterVocabularyInput,
  getUnfamiliarVocabularyEntries,
  getVocabularyReviewCompletion,
  revealVocabularyEntry,
  type VocabularyEntry,
  type VocabularyProgram,
  type VocabularyReviewVerdict,
  type VocabularySetEntry,
} from '../../domain/vocabulary'
import {
  createVocabularyStudent,
  createVocabularyReviewRun,
  createVocabularySetFromEntries,
  decideVocabularyReviewRun,
  discardVocabularyReviewRun,
  downloadVocabularySetPdf,
  freezeVocabularyReviewRun,
  getVocabularyProgram as fetchVocabularyProgram,
  getVocabularyProgress,
  getCurrentVocabularyReviewRun,
  getVocabularySet,
  getVocabularyReviewRun,
  listVocabularyStudents,
  listVocabularySets,
  renameVocabularySet,
  revokeVocabularySetShare,
  setVocabularyProgressStart,
  shareVocabularySet,
  undoVocabularyReviewRun,
  VocabularyApiError,
  type VocabularyReviewRunDto,
  type VocabularySetDto,
  type VocabularyStudentDto,
} from '../../services/vocabulary'
import { calibrationVocabularyProgram } from './calibrationVocabularyProgram'
import { VocabularyProgressExplorer } from './VocabularyProgressExplorer'
import { vocabularyVisualManifest } from './vocabularyVisualManifest'
import {
  getVocabularyAudioPath,
  readVocabularyAudioAccent,
  saveVocabularyAudioAccent,
  type VocabularyAudioAccent,
} from '../vocabulary-listen/vocabularyAudioVariants'
import { VocabularyWordSearchPrint } from '../vocabulary-practice/VocabularyWordSearchPrint'
import { buildVocabularyWordSearchPages } from '../vocabulary-practice/vocabularyWordSearch'
import './vocabularyReviewPage.css'

const RUN_STORAGE_KEY = 'eqb-vocabulary-review-run-wanwei-round-one-v1'
const ACTIVE_STUDENT_STORAGE_KEY = 'eqb-vocabulary-active-student-wanwei-round-one-v1'
const PAUSED_RUN_STORAGE_KEY = 'eqb-vocabulary-review-paused-wanwei-round-one-v1'
const TARGET_UNFAMILIAR_COUNT = 15
const CARD_PRINT_ENTRIES_PER_PAGE = 6
const DICTATION_PRINT_ENTRIES_PER_PAGE = 16
const WORD_SEARCH_PRINT_ENTRIES_PER_PAGE = 16
const PUBLIC_LISTEN_ORIGIN = 'https://eqbank.cc'

type VocabularyReviewPageProps = {
  onBackToWorkbench: () => void
  onOpenVocabularyPractice: (setId: string) => void
  onVocabularySetRouteChange: (setId: string | null) => void
  requestedSetId?: string | null
  shellNav: AppTopbarNav
}

type VocabularyAccent = VocabularyAudioAccent
type VocabularyPrintKind = 'cards' | 'dictation' | 'answer' | 'word-search'

type VocabularyPrintRequest = {
  setId: string
  accent: VocabularyAccent
  kind: VocabularyPrintKind
}

function readVocabularyPrintRequest(): VocabularyPrintRequest | null {
  const params = new URLSearchParams(window.location.search)
  const setId = params.get('vocabularyPrintSetId')?.trim()
  if (!setId) return null
  return {
    setId,
    accent: params.get('printAccent') === 'british' ? 'british' : 'american',
    kind: params.get('vocabularyPrintMode') === 'dictation'
      ? 'dictation'
      : params.get('vocabularyPrintMode') === 'answer'
        ? 'answer'
        : params.get('vocabularyPrintMode') === 'word-search'
          ? 'word-search'
          : 'cards',
  }
}

function vocabularyPrintRequiresShare(kind: VocabularyPrintKind): kind is 'cards' | 'dictation' {
  return kind === 'cards' || kind === 'dictation'
}

function replaceVocabularySetUrl(setId: string | null) {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('view') !== 'vocabulary-review') return
  if (setId) url.searchParams.set('setId', setId)
  else url.searchParams.delete('setId')
  const nextSearch = url.searchParams.toString()
  window.history.replaceState(window.history.state, '', `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`)
}

function runStorageKey(studentId: string) {
  return `${RUN_STORAGE_KEY}:${studentId}`
}

function pausedRunStorageKey(studentId: string) {
  return `${PAUSED_RUN_STORAGE_KEY}:${studentId}`
}

function VocabularyVisual({ entry, compact = false }: { entry: VocabularyEntry; compact?: boolean }) {
  const manifestVisual = vocabularyVisualManifest[entry.visualKey]
  const visual = entry.visual
    ? { src: entry.visual.path, alt: entry.visual.alt, caption: entry.teachingSense, width: undefined, height: undefined }
    : manifestVisual
  return (
    <figure className={compact ? 'vocabulary-visual vocabulary-visual-compact' : 'vocabulary-visual'}>
      <img
        src={visual.src}
        alt={`${entry.headword}：${visual.alt}`}
        width={visual.width}
        height={visual.height}
      />
      {!compact && <figcaption>{visual.caption}</figcaption>}
    </figure>
  )
}

function adaptVocabularyProgram(program: Awaited<ReturnType<typeof fetchVocabularyProgram>>): VocabularyProgram {
  const groupCounts = new Map<number, number>()
  return {
    id: program.id,
    version: program.version,
    title: program.title,
    subtitle: program.subtitle,
    sourceTitle: program.sourceTitle,
    sourceEdition: program.sourceEdition,
    totalPlannedEntries: program.totalPlannedEntries,
    calibrationSize: program.entries.length,
    groups: program.groups.map((group) => ({
      id: group.id,
      stage: group.stage,
      week: group.week,
      group: group.group,
      sourceLabel: group.sourceLabel,
      startOrder: group.startOrder,
      endOrder: group.endOrder,
    })),
    entries: program.entries.map((entry) => {
      const indexInGroup = (groupCounts.get(entry.source.day) ?? 0) + 1
      groupCounts.set(entry.source.day, indexInGroup)
      return {
        id: entry.id,
        headword: entry.headword,
        phonetic: entry.phonetic,
        phonetics: entry.phonetics,
        partOfSpeech: entry.partOfSpeech,
        sourceMeanings: entry.sourceMeanings,
        teachingSense: entry.teachingSense,
        examFrequency: entry.examFrequency,
        primaryStageReview: false,
        visualKey: entry.visual.key as VocabularyEntry['visualKey'],
        visual: entry.visual,
        audio: entry.audio,
        learning: {
          pronunciationGuide: {
            mode: entry.pronunciationMode,
            parts: entry.syllables.map((syllable) => typeof syllable === 'string'
              ? { spelling: syllable, phonetic: '' }
              : syllable),
          },
          example: entry.example,
        },
        pronunciationParts: entry.pronunciationParts,
        source: {
          title: entry.source.title,
          edition: entry.source.edition,
          stage: entry.source.stage,
          week: program.groups.find((group) => group.stage === entry.source.stage && group.group === entry.source.day)?.week ?? 1,
          group: entry.source.day,
          sourceLabel: program.groups.find((group) => group.stage === entry.source.stage && group.group === entry.source.day)?.sourceLabel ?? `Day ${entry.source.day}`,
          indexInGroup,
          globalOrder: entry.source.sourceOrder,
          printedPage: entry.source.printedPage,
          verification: entry.source.verification,
        },
      }
    }),
  }
}

function VocabularyPronunciationGuide({
  entry,
  compact = false,
  accent = 'american',
}: {
  entry: VocabularyEntry
  compact?: boolean
  accent?: VocabularyAccent
}) {
  const { mode } = entry.learning.pronunciationGuide
  const parts = entry.pronunciationParts?.[accent] ?? entry.learning.pronunciationGuide.parts
  const separator = mode === 'forms' ? '/' : '·'
  const label = mode === 'forms'
    ? `${entry.headword} 的两个词形及读音`
    : `${entry.headword} 按音节拆分及对应读音`

  return (
    <div
      className={compact ? 'vocabulary-breakdown vocabulary-breakdown-compact' : 'vocabulary-breakdown'}
      aria-label={label}
    >
      {parts.map((part, index) => (
        <span className="vocabulary-breakdown-group" key={`${accent}-${part.spelling}-${part.phonetic}`}>
          {index > 0 && (
            <i className="vocabulary-breakdown-connector" aria-hidden="true">
              {separator}
            </i>
          )}
          <span className="vocabulary-breakdown-part">
            <strong>{part.spelling}</strong>
            {part.phonetic && <small>{part.phonetic}</small>}
          </span>
        </span>
      ))}
    </div>
  )
}

function VocabularyExample({
  entry,
  compact = false,
}: {
  entry: VocabularyEntry
  compact?: boolean
}) {
  const { english, chinese, highlight } = entry.learning.example
  const highlightStart = english.indexOf(highlight)
  const before = highlightStart >= 0 ? english.slice(0, highlightStart) : english
  const after = highlightStart >= 0 ? english.slice(highlightStart + highlight.length) : ''

  return (
    <div className={compact ? 'vocabulary-example vocabulary-example-compact' : 'vocabulary-example'}>
      <p lang="en">
        {before}
        {highlightStart >= 0 && <strong>{highlight}</strong>}
        {after}
      </p>
      <span>{chinese}</span>
    </div>
  )
}

function paginateVocabularyEntries(entries: VocabularyEntry[], entriesPerPage: number): VocabularyEntry[][] {
  const pages: VocabularyEntry[][] = []
  for (let index = 0; index < entries.length; index += entriesPerPage) {
    pages.push(entries.slice(index, index + entriesPerPage))
  }
  return pages
}

function splitVocabularyDictationColumns(entries: VocabularyEntry[]): [VocabularyEntry[], VocabularyEntry[]] {
  const leftColumnCount = Math.ceil(entries.length / 2)
  return [entries.slice(0, leftColumnCount), entries.slice(leftColumnCount)]
}

function getVocabularyDictationAnswer(entry: VocabularyEntry): string {
  if (entry.learning.pronunciationGuide.mode !== 'forms') return entry.headword
  const firstPart = entry.pronunciationParts?.american?.[0] ?? entry.learning.pronunciationGuide.parts[0]
  return firstPart?.spelling?.trim() || entry.headword
}

function formatVocabularyList(entries: VocabularyEntry[]): string {
  return entries
    .map((entry, index) => `${index + 1}. ${entry.headword} ${entry.phonetic} ${formatCoreMeanings(entry)}`)
    .join('\n')
}

function getCoreMeanings(entry: VocabularyEntry): string[] {
  const meanings = [...new Set(entry.sourceMeanings.map((meaning) => meaning.trim()).filter(Boolean))].slice(0, 3)
  return meanings.length ? meanings : [entry.teachingSense]
}

function formatCoreMeanings(entry: VocabularyEntry): string {
  return getCoreMeanings(entry).join('；')
}

function adaptVocabularySetEntry(entry: VocabularySetEntry): VocabularyEntry {
  return {
    id: entry.id,
    headword: entry.headword,
    phonetic: entry.phonetic,
    phonetics: entry.phonetics,
    partOfSpeech: entry.partOfSpeech,
    sourceMeanings: entry.sourceMeanings?.length ? entry.sourceMeanings : [entry.teachingSense],
    teachingSense: entry.teachingSense,
    visualKey: entry.visual.key,
    visual: entry.visual,
    audio: entry.audio,
    learning: {
      pronunciationGuide: {
        mode: entry.pronunciationMode,
        parts: entry.syllables.map((part) => typeof part === 'string'
          ? { spelling: part, phonetic: '' }
          : part),
      },
      example: entry.example,
    },
    pronunciationParts: entry.pronunciationParts,
    source: {
      title: '',
      edition: '',
      stage: 'core',
      week: 1,
      group: 1,
      sourceLabel: '',
      indexInGroup: 1,
      globalOrder: 1,
      printedPage: 1,
      verification: 'index-and-heading-reviewed',
    },
  }
}

export function VocabularyReviewPage(props: VocabularyReviewPageProps) {
  const [printRequest] = useState<VocabularyPrintRequest | null>(readVocabularyPrintRequest)
  const [program, setProgram] = useState<VocabularyProgram>(calibrationVocabularyProgram)
  const [programLoadState, setProgramLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reviewState, setReviewState] = useState(() => createVocabularyReviewState(TARGET_UNFAMILIAR_COUNT))
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<VocabularyReviewRunDto['status']>('active')
  const [mainProgressCursor, setMainProgressCursor] = useState(0)
  const [targetInput, setTargetInput] = useState(TARGET_UNFAMILIAR_COUNT)
  const [reviewAccent, setReviewAccent] = useState<VocabularyAccent>(readVocabularyAudioAccent)
  const [runState, setRunState] = useState<'loading' | 'setup' | 'active' | 'error'>('loading')
  const [students, setStudents] = useState<VocabularyStudentDto[]>([])
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null)
  const [studentsState, setStudentsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [studentCreateOpen, setStudentCreateOpen] = useState(false)
  const [studentNameInput, setStudentNameInput] = useState('')
  const [studentFormError, setStudentFormError] = useState('')
  const [requestBusy, setRequestBusy] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [vocabularySet, setVocabularySet] = useState<VocabularySetDto | null>(null)
  const [recentSets, setRecentSets] = useState<VocabularySetDto[]>([])
  const [shareId, setShareId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [shareCopyStatus, setShareCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [printAccent, setPrintAccent] = useState<VocabularyAccent>(printRequest?.accent ?? 'american')
  const [printLoadState, setPrintLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(printRequest ? 'loading' : 'idle')
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [pendingShareDownload, setPendingShareDownload] = useState<'cards' | 'dictation' | null>(null)
  const [directVocabularyInput, setDirectVocabularyInput] = useState('')
  const [setTitleInput, setSetTitleInput] = useState('')
  const [progressExplorerOpen, setProgressExplorerOpen] = useState(false)
  const [progressExplorerWeek, setProgressExplorerWeek] = useState(1)
  const [progressSelectionId, setProgressSelectionId] = useState<string | null>(null)
  const [progressUpdateMessage, setProgressUpdateMessage] = useState('')
  const [progressUpdateError, setProgressUpdateError] = useState('')
  const [progressReplaceRequired, setProgressReplaceRequired] = useState(false)
  const copyTimerRef = useRef<number | null>(null)
  const shareCopyTimerRef = useRef<number | null>(null)
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const downloadMenuRef = useRef<HTMLDivElement | null>(null)
  const progressCurrentRef = useRef<HTMLDivElement | null>(null)
  const shiftKeyCandidateRef = useRef(false)

  function syncVocabularySetRoute(setId: string | null) {
    replaceVocabularySetUrl(setId)
    if (setId === null) props.onVocabularySetRouteChange(null)
  }

  const completion = runStatus === 'target_reached'
    ? 'target-reached'
    : runStatus === 'program_exhausted'
      ? 'program-exhausted'
      : getVocabularyReviewCompletion(program, reviewState)
  const currentEntry = program.entries[reviewState.cursor] ?? null
  const knownCount = countVocabularyDecisions(reviewState, 'known')
  const unfamiliarEntries = useMemo(
    () => getUnfamiliarVocabularyEntries(program, reviewState),
    [program, reviewState],
  )
  const printEntries = useMemo(
    () => vocabularySet ? vocabularySet.entries.map(adaptVocabularySetEntry) : unfamiliarEntries,
    [unfamiliarEntries, vocabularySet],
  )
  const printPages = useMemo(
    () => paginateVocabularyEntries(
      printEntries,
      printRequest?.kind === 'word-search'
        ? WORD_SEARCH_PRINT_ENTRIES_PER_PAGE
        : printRequest?.kind === 'dictation' || printRequest?.kind === 'answer'
        ? DICTATION_PRINT_ENTRIES_PER_PAGE
        : CARD_PRINT_ENTRIES_PER_PAGE,
    ),
    [printEntries, printRequest?.kind],
  )
  const wordSearchPages = useMemo(
    () => printRequest?.kind === 'word-search' && printRequest.setId && printEntries.length
      ? buildVocabularyWordSearchPages(printRequest.setId, printEntries, program.entries)
      : [],
    [printEntries, printRequest, program.entries],
  )
  const directInputResult = useMemo(
    () => filterVocabularyInput(directVocabularyInput, program.entries),
    [directVocabularyInput, program.entries],
  )
  const directInputOverLimit = directInputResult.matchedEntries.length > 60
  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null
  const processedCount = mainProgressCursor
  const mainProgressEntry = program.entries[mainProgressCursor] ?? null
  const hasUnfinishedRun = Boolean(runId && runStatus !== 'frozen')
  const progressRequiresRunReplacement = hasUnfinishedRun || progressReplaceRequired
  const currentStage = currentEntry?.source.stage ?? 'core'
  const currentWeek = currentEntry?.source.week ?? 1
  const visibleGroups = useMemo(
    () => program.groups.filter((group) =>
      (!group.stage || group.stage === currentStage) && group.week === currentWeek),
    [currentStage, currentWeek, program.groups],
  )

  useEffect(() => {
    if (!downloadMenuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!downloadMenuRef.current?.contains(event.target as Node)) setDownloadMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDownloadMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [downloadMenuOpen])

  const playEntry = useCallback((entry: VocabularyEntry, reportError: boolean) => {
    reviewAudioRef.current?.pause()
    const audio = new Audio(getVocabularyAudioPath(entry, reviewAccent))
    reviewAudioRef.current = audio
    void audio.play().catch(() => {
      if (reviewAudioRef.current !== audio || !reportError) return
      setRequestError(`${reviewAccent === 'american' ? '美音' : '英音'}暂时无法播放，请稍后重试。`)
    })
  }, [reviewAccent])

  const applyRun = useCallback((run: VocabularyReviewRunDto, options: { activate?: boolean } = {}) => {
    if (!activeStudentId || run.studentId !== activeStudentId) return
    setRunId(run.id)
    setRunStatus(run.status)
    setTargetInput(run.targetUnfamiliarCount)
    setReviewState({
      cursor: run.cursor,
      targetUnfamiliarCount: run.targetUnfamiliarCount,
      decisions: run.decisions,
      decisionOrder: run.decisionOrder,
      revealed: false,
    })
    if (run.mode === 'main') setMainProgressCursor(run.cursor)
    window.localStorage.setItem(runStorageKey(activeStudentId), run.id)
    if (options.activate === false) {
      setRunState('setup')
    } else {
      window.localStorage.removeItem(pausedRunStorageKey(activeStudentId))
      setRunState('active')
    }
  }, [activeStudentId])

  useEffect(() => {
    fetchVocabularyProgram()
      .then((nextProgram) => {
        setProgram(adaptVocabularyProgram(nextProgram))
        setProgramLoadState('ready')
      })
      .catch((error: unknown) => {
        setProgramLoadState('error')
        setRequestError(error instanceof Error ? error.message : '完整词库加载失败。')
      })
  }, [])

  useEffect(() => {
    if (printRequest) {
      setStudentsState('ready')
      setRunState('setup')
      getVocabularySet(printRequest.setId)
        .then((nextSet) => {
          if (vocabularyPrintRequiresShare(printRequest.kind) && nextSet.share?.status !== 'active') {
            throw new Error('请先生成扫码听写，再下载带二维码的单词纸。')
          }
          setVocabularySet(nextSet)
          setShareId(nextSet.share?.status === 'active' ? nextSet.share.shareId : null)
          setPrintLoadState('ready')
        })
        .catch((error: unknown) => {
          setPrintLoadState('error')
          setRequestError(error instanceof Error ? error.message : '单词纸内容加载失败。')
        })
      return
    }
    listVocabularyStudents()
      .then((nextStudents) => {
        const preferredId = window.localStorage.getItem(ACTIVE_STUDENT_STORAGE_KEY)
        const nextActive = nextStudents.find((student) => student.id === preferredId) ?? nextStudents[0]
        setStudents(nextStudents)
        setActiveStudentId(nextActive?.id ?? null)
        setStudentsState('ready')
      })
      .catch((error: unknown) => {
        setStudentsState('error')
        setRunState('error')
        setRequestError(error instanceof Error ? error.message : '学生档案加载失败。')
      })
  }, [printRequest])

  useEffect(() => {
    if (!activeStudentId) return
    const studentId = activeStudentId
    const isDefaultStudent = students.find((student) => student.id === studentId)?.isDefault === true
    let cancelled = false
    window.localStorage.setItem(ACTIVE_STUDENT_STORAGE_KEY, studentId)
    setRunState('loading')
    setRunId(null)
    setRunStatus('active')
    setVocabularySet(null)
    setShareId(null)
    setRecentSets([])
    setMainProgressCursor(0)
    setReviewState(createVocabularyReviewState(TARGET_UNFAMILIAR_COUNT))
    setRequestError('')
    setProgressExplorerOpen(false)
    setProgressSelectionId(null)
    setProgressUpdateMessage('')
    setProgressUpdateError('')
    setProgressReplaceRequired(false)

    async function loadStudentVocabulary() {
      try {
        const [nextSets, progress] = await Promise.all([
          listVocabularySets(studentId),
          getVocabularyProgress(studentId),
        ])
        if (cancelled) return
        setRecentSets(nextSets)
        setTargetInput(progress.lastTarget)
        setMainProgressCursor(progress.cursor)
        if (props.requestedSetId) {
          const requestedSet = nextSets.find((set) => set.id === props.requestedSetId)
            ?? await getVocabularySet(props.requestedSetId)
          if (cancelled) return
          if (requestedSet.studentId !== studentId) {
            const requestedStudent = students.find((student) => student.id === requestedSet.studentId)
            if (!requestedStudent) throw new Error('这个生词组不属于当前教师的学生档案。')
            setActiveStudentId(requestedStudent.id)
            return
          }
          setVocabularySet(requestedSet)
          setShareId(requestedSet.share?.status === 'active' ? requestedSet.share.shareId : null)
          setRunState('setup')
          return
        }
        const savedRunId = window.localStorage.getItem(runStorageKey(studentId))
          ?? (isDefaultStudent ? window.localStorage.getItem(RUN_STORAGE_KEY) : null)
        const currentRun = await getCurrentVocabularyReviewRun(studentId)
        if (cancelled) return
        if (currentRun) {
          const pausedRunId = window.localStorage.getItem(pausedRunStorageKey(studentId))
          applyRun(currentRun, { activate: pausedRunId !== currentRun.id })
          return
        }
        if (savedRunId) {
          try {
            const { reviewRun: run, vocabularySet: frozenSet } = await getVocabularyReviewRun(savedRunId)
            if (cancelled) return
            if (run.studentId !== studentId) throw new Error('保存的过词轮次不属于当前学生。')
            if (run.status !== 'frozen') throw new Error('本地轮次已不是服务端当前轮次。')
            if (!frozenSet) throw new Error('已冻结的生词组没有找到，请稍后重试。')
            if (isDefaultStudent) window.localStorage.removeItem(RUN_STORAGE_KEY)
            setVocabularySet(frozenSet)
            setShareId(frozenSet.share?.status === 'active' ? frozenSet.share.shareId : null)
            applyRun(run, { activate: false })
            return
          } catch {
            window.localStorage.removeItem(runStorageKey(studentId))
            if (isDefaultStudent) window.localStorage.removeItem(RUN_STORAGE_KEY)
          }
        }
        setRunState('setup')
      } catch (error) {
        if (cancelled) return
        setRunState('error')
        setRequestError(error instanceof Error ? error.message : '学生过词进度加载失败。')
      }
    }

    void loadStudentVocabulary()
    return () => { cancelled = true }
  }, [activeStudentId, applyRun, props.requestedSetId, students])

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    if (shareCopyTimerRef.current !== null) window.clearTimeout(shareCopyTimerRef.current)
    reviewAudioRef.current?.pause()
    reviewAudioRef.current = null
  }, [])

  useEffect(() => {
    if (vocabularySet) setSetTitleInput(vocabularySet.title)
  }, [vocabularySet?.id])

  useEffect(() => {
    if (runState !== 'active' || progressExplorerOpen || completion !== 'active' || !currentEntry) return
    playEntry(currentEntry, false)
  }, [completion, currentEntry, playEntry, progressExplorerOpen, runState])

  const decide = useCallback((verdict: VocabularyReviewVerdict) => {
    const entry = program.entries[reviewState.cursor]
    if (programLoadState !== 'ready' || runState !== 'active' || progressExplorerOpen || !runId || !entry || requestBusy || completion !== 'active') return
    setRequestBusy(true)
    setStudentFormError('')
    decideVocabularyReviewRun(runId, entry.id, verdict)
      .then(applyRun)
      .catch((error: unknown) => setRequestError(error instanceof Error ? error.message : '判断未保存，请重试。'))
      .finally(() => setRequestBusy(false))
  }, [applyRun, completion, program.entries, programLoadState, progressExplorerOpen, requestBusy, reviewState.cursor, runId, runState])

  const reveal = useCallback(() => {
    if (programLoadState !== 'ready' || runState !== 'active' || progressExplorerOpen) return
    setReviewState((current) => revealVocabularyEntry(current))
  }, [programLoadState, progressExplorerOpen, runState])

  const undo = useCallback(() => {
    if (programLoadState !== 'ready' || runState !== 'active' || progressExplorerOpen || !runId || requestBusy || !reviewState.decisionOrder.length) return
    setRequestBusy(true)
    setRequestError('')
    undoVocabularyReviewRun(runId)
      .then(applyRun)
      .catch((error: unknown) => setRequestError(error instanceof Error ? error.message : '撤销未保存，请重试。'))
      .finally(() => setRequestBusy(false))
  }, [applyRun, programLoadState, progressExplorerOpen, requestBusy, reviewState.decisionOrder.length, runId, runState])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null
      return Boolean(element?.closest('input, textarea, select, button, [contenteditable="true"]'))
    }

    function onKeyDown(event: KeyboardEvent) {
      if (runState !== 'active' || progressExplorerOpen) {
        shiftKeyCandidateRef.current = false
        return
      }
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        shiftKeyCandidateRef.current = false
        return
      }
      if (event.key === 'Shift') {
        if (!event.repeat) shiftKeyCandidateRef.current = true
        event.preventDefault()
        return
      }
      if (event.shiftKey) {
        shiftKeyCandidateRef.current = false
        return
      }
      if (event.repeat) return

      if (event.key === 'Enter') {
        event.preventDefault()
        decide('known')
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        undo()
      } else if (event.key === ' ') {
        event.preventDefault()
        if (currentEntry) playEntry(currentEntry, true)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        reveal()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key !== 'Shift' || runState !== 'active' || progressExplorerOpen) return
      const shouldDecide = shiftKeyCandidateRef.current
        && !isTypingTarget(event.target)
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
      shiftKeyCandidateRef.current = false
      if (!shouldDecide) return
      event.preventDefault()
      decide('unfamiliar')
    }

    function onWindowBlur() {
      shiftKeyCandidateRef.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [currentEntry, decide, playEntry, progressExplorerOpen, reveal, runState, undo])

  async function startReview() {
    if (programLoadState !== 'ready' || !activeStudentId) return
    setRequestBusy(true)
    setRequestError('')
    try {
      setVocabularySet(null)
      setShareId(null)
      window.localStorage.removeItem(pausedRunStorageKey(activeStudentId))
      applyRun(await createVocabularyReviewRun(activeStudentId, targetInput, { mode: 'main' }))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '无法开始过词，请重试。')
      setRunState('error')
    } finally {
      setRequestBusy(false)
    }
  }

  function toggleProgressExplorer() {
    setProgressExplorerOpen((open) => {
      if (open) return false
      reviewAudioRef.current?.pause()
      reviewAudioRef.current = null
      const nextEntry = program.entries[mainProgressCursor] ?? program.entries[program.entries.length - 1]
      setProgressExplorerWeek(nextEntry?.source.week ?? 1)
      setProgressSelectionId(null)
      setProgressUpdateMessage('')
      setProgressUpdateError('')
      setProgressReplaceRequired(false)
      return true
    })
  }

  async function confirmProgressStart(entry: VocabularyEntry) {
    if (!activeStudentId || requestBusy) return
    setRequestBusy(true)
    setProgressUpdateMessage('')
    setProgressUpdateError('')
    try {
      const result = await setVocabularyProgressStart(activeStudentId, entry.id, progressRequiresRunReplacement)
      const nextState = createVocabularyReviewState(result.progress.lastTarget)
      setMainProgressCursor(result.progress.cursor)
      setTargetInput(result.progress.lastTarget)
      setReviewState({ ...nextState, cursor: result.progress.cursor })
      setRunId(null)
      setRunStatus('active')
      setRunState('setup')
      setProgressExplorerWeek(entry.source.week)
      setProgressSelectionId(null)
      setProgressReplaceRequired(false)
      setProgressUpdateMessage(`已将下一词设为 ${result.startEntry.headword}（第 ${result.startEntry.sourceOrder} 词）。`)
      window.requestAnimationFrame(() => progressCurrentRef.current?.focus())
      window.localStorage.removeItem(runStorageKey(activeStudentId))
      window.localStorage.removeItem(pausedRunStorageKey(activeStudentId))
      if (activeStudent?.isDefault) window.localStorage.removeItem(RUN_STORAGE_KEY)
      if (vocabularySet) syncVocabularySetRoute(null)
      setVocabularySet(null)
      setShareId(null)
    } catch (error) {
      if (error instanceof VocabularyApiError && error.code === 'vocabulary_progress_has_active_run') {
        setProgressReplaceRequired(true)
        setProgressUpdateError('服务端发现另一处未结束的轮次。请确认放弃该轮后，再从这里开始。')
      } else {
        setProgressUpdateError(error instanceof Error ? error.message : '主进度没有调整成功，请重试。')
      }
    } finally {
      setRequestBusy(false)
    }
  }

  function pauseReview() {
    if (!activeStudentId || !runId) return
    reviewAudioRef.current?.pause()
    reviewAudioRef.current = null
    window.localStorage.setItem(pausedRunStorageKey(activeStudentId), runId)
    setReviewState((current) => ({ ...current, revealed: false }))
    setRequestError('')
    setRunState('setup')
  }

  async function startAnotherReview() {
    setRequestBusy(true)
    setRequestError('')
    try {
      if (runId && !vocabularySet) await discardVocabularyReviewRun(runId)
      if (activeStudentId) window.localStorage.removeItem(runStorageKey(activeStudentId))
      if (activeStudentId) window.localStorage.removeItem(pausedRunStorageKey(activeStudentId))
      setRunId(null)
      setRunStatus('active')
      setVocabularySet(null)
      setShareId(null)
      setReviewState(createVocabularyReviewState(targetInput))
      setRunState('setup')
      setCopyStatus('idle')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '无法开始下一轮，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  function closeVocabularySet() {
    syncVocabularySetRoute(null)
    setVocabularySet(null)
    setShareId(null)
    setRequestError('')
    if (runStatus !== 'frozen') return

    if (activeStudentId) {
      window.localStorage.removeItem(runStorageKey(activeStudentId))
      window.localStorage.removeItem(pausedRunStorageKey(activeStudentId))
    }
    if (activeStudent?.isDefault) window.localStorage.removeItem(RUN_STORAGE_KEY)
    setRunId(null)
    setRunStatus('active')
    setReviewState(createVocabularyReviewState(targetInput))
  }

  async function generateVocabularySet() {
    if (!runId || requestBusy) return
    setRequestBusy(true)
    setRequestError('')
    try {
      const nextSet = await freezeVocabularyReviewRun(runId)
      syncVocabularySetRoute(nextSet.id)
      setVocabularySet(nextSet)
      setRecentSets((current) => [nextSet, ...current.filter((item) => item.id !== nextSet.id)])
      setShareId(nextSet.share?.status === 'active' ? nextSet.share.shareId : null)
      setSetTitleInput(nextSet.title)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '生词纸生成失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  async function generateVocabularySetFromInput() {
    if (
      programLoadState !== 'ready'
      || !activeStudentId
      || requestBusy
      || !directInputResult.matchedEntries.length
      || directInputOverLimit
    ) return
    setRequestBusy(true)
    setRequestError('')
    try {
      const nextSet = await createVocabularySetFromEntries(
        activeStudentId,
        directInputResult.matchedEntries.map((entry) => entry.id),
      )
      syncVocabularySetRoute(nextSet.id)
      setVocabularySet(nextSet)
      setRecentSets((current) => [nextSet, ...current.filter((item) => item.id !== nextSet.id)])
      setShareId(null)
      setDirectVocabularyInput('')
      setSetTitleInput(nextSet.title)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '输入词表生成失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  async function createStudentProfile() {
    const displayName = studentNameInput.trim()
    if (!displayName || requestBusy) return
    setRequestBusy(true)
    setStudentFormError('')
    try {
      const student = await createVocabularyStudent(displayName)
      setStudents((current) => [...current, student])
      setStudentNameInput('')
      setStudentCreateOpen(false)
      setActiveStudentId(student.id)
    } catch (error) {
      setStudentFormError(error instanceof Error ? error.message : '学生档案创建失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  async function activateShare(setForShare = vocabularySet): Promise<string> {
    if (shareId) return shareId
    if (!setForShare) throw new Error('生词组还没有准备好。')
    const share = await shareVocabularySet(setForShare.id)
    setShareId(share.shareId)
    const nextSet = { ...setForShare, share }
    setVocabularySet(nextSet)
    setRecentSets((current) => current.map((item) => item.id === nextSet.id ? nextSet : item))
    return share.shareId
  }

  async function createShare() {
    if (!vocabularySet || requestBusy) return
    setRequestBusy(true)
    setRequestError('')
    try {
      await activateShare()
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '听写链接生成失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  async function revokeShare() {
    if (!vocabularySet || !shareId || requestBusy) return
    setRequestBusy(true)
    setRequestError('')
    try {
      await revokeVocabularySetShare(vocabularySet.id)
      const nextSet: VocabularySetDto = { ...vocabularySet, share: { shareId, status: 'revoked' } }
      setVocabularySet(nextSet)
      setRecentSets((current) => current.map((item) => item.id === nextSet.id ? nextSet : item))
      setShareId(null)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '撤销分享失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  function openVocabularySet(nextSet: VocabularySetDto) {
    syncVocabularySetRoute(nextSet.id)
    setVocabularySet(nextSet)
    setSetTitleInput(nextSet.title)
    setShareId(nextSet.share?.status === 'active' ? nextSet.share.shareId : null)
    setRequestError('')
  }

  async function copyVocabularySet() {
    if (!printEntries.length) return
    try {
      await navigator.clipboard.writeText(formatVocabularyList(printEntries))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 1800)
  }

  async function copyShareLink() {
    if (!shareId) return
    try {
      await navigator.clipboard.writeText(`${PUBLIC_LISTEN_ORIGIN}/vocabulary/listen/${shareId}`)
      setShareCopyStatus('copied')
    } catch {
      setShareCopyStatus('error')
    }
    if (shareCopyTimerRef.current !== null) window.clearTimeout(shareCopyTimerRef.current)
    shareCopyTimerRef.current = window.setTimeout(() => setShareCopyStatus('idle'), 1800)
  }

  async function downloadVocabularySheet(kind: VocabularyPrintKind = 'cards', options: { shareConfirmed?: boolean } = {}) {
    if (!vocabularySet || pdfDownloadBusy) return
    if (vocabularyPrintRequiresShare(kind) && !shareId && !options.shareConfirmed) {
      setDownloadMenuOpen(false)
      setPendingShareDownload(kind)
      return
    }
    setPdfDownloadBusy(true)
    setDownloadMenuOpen(false)
    setPendingShareDownload(null)
    setRequestError('')
    try {
      const title = setTitleInput.trim()
      let setForDownload = vocabularySet
      if (!title) throw new Error('请先填写单词纸名称。')
      if (title !== vocabularySet.title) {
        setForDownload = await renameVocabularySet(vocabularySet.id, title)
        setVocabularySet(setForDownload)
        setRecentSets((current) => current.map((item) => item.id === setForDownload.id ? setForDownload : item))
      }
      if (vocabularyPrintRequiresShare(kind) && !shareId) await activateShare(setForDownload)
      await downloadVocabularySetPdf(setForDownload.id, printAccent, kind)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '文件下载失败，请重试。')
    } finally {
      setPdfDownloadBusy(false)
    }
  }

  async function saveVocabularySetTitle() {
    if (!vocabularySet || requestBusy) return
    const title = setTitleInput.trim()
    if (!title) {
      setRequestError('生词组名称不能为空。')
      return
    }
    if (title === vocabularySet.title) return
    setRequestBusy(true)
    setRequestError('')
    try {
      const nextSet = await renameVocabularySet(vocabularySet.id, title)
      setVocabularySet(nextSet)
      setSetTitleInput(nextSet.title)
      setRecentSets((current) => current.map((item) => item.id === nextSet.id ? nextSet : item))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '生词组名称保存失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  function playCurrentEntry() {
    if (currentEntry) playEntry(currentEntry, true)
  }

  function chooseReviewAccent(accent: VocabularyAccent) {
    setReviewAccent(accent)
    saveVocabularyAudioAccent(accent)
  }

  const currentGlobalOrder = currentEntry?.source.globalOrder ?? program.entries.length
  const vocabularySetTitleControl = vocabularySet ? (
    <div className="vocabulary-set-title-control">
      <label htmlFor="vocabulary-set-title">单词纸名称</label>
      <div>
        <input
          id="vocabulary-set-title"
          value={setTitleInput}
          maxLength={30}
          onChange={(event) => setSetTitleInput(event.target.value)}
        />
        <button
          className="ghost-button"
          type="button"
          onClick={() => void saveVocabularySetTitle()}
          disabled={requestBusy || !setTitleInput.trim() || setTitleInput.trim() === vocabularySet.title}
        >
          保存名称
        </button>
      </div>
    </div>
  ) : null
  const printAccentControl = vocabularySet ? (
    <label className="vocabulary-print-accent-control">
      <span>下载读音</span>
      <select value={printAccent} onChange={(event) => setPrintAccent(event.target.value as VocabularyAccent)}>
        <option value="american">美式</option>
        <option value="british">英式</option>
      </select>
    </label>
  ) : null
  const downloadControl = vocabularySet ? (
    <div className="vocabulary-download-menu" ref={downloadMenuRef}>
      <button
        className="primary-button"
        type="button"
        aria-expanded={downloadMenuOpen}
        aria-controls="vocabulary-download-options"
        onClick={() => setDownloadMenuOpen((open) => !open)}
        disabled={pdfDownloadBusy}
      >
        <Download size={16} />
        {pdfDownloadBusy ? '正在生成…' : '下载'}
      </button>
      {downloadMenuOpen && (
        <div id="vocabulary-download-options" role="group" aria-label="选择下载内容">
          <button type="button" onClick={() => void downloadVocabularySheet('cards')}>单词纸<span>带图片、音节和例句</span></button>
          <button type="button" onClick={() => void downloadVocabularySheet('dictation')}>听写纸<span>16题一页，扫码自动听写</span></button>
          <button type="button" onClick={() => void downloadVocabularySheet('answer')}>教师答案<span>与听写纸逐题对应</span></button>
          <button type="button" onClick={() => void downloadVocabularySheet('word-search')}>圈词与拼写<span>找词、辨形并抄写，内附答案</span></button>
        </div>
      )}
    </div>
  ) : null
  const shareDownloadConfirmation = pendingShareDownload ? (
    <div className="vocabulary-share-download-confirmation" aria-live="polite">
      <div>
        <strong>这份文件需要扫码播放录音</strong>
        <span>继续后会同时生成一个匿名公开听写链接；只有拿到二维码的人可以打开，你也可以随时撤销。</span>
      </div>
      <div>
        <button type="button" className="ghost-button" onClick={() => setPendingShareDownload(null)}>取消</button>
        <button type="button" className="primary-button" onClick={() => void downloadVocabularySheet(pendingShareDownload, { shareConfirmed: true })}>生成链接并下载</button>
      </div>
    </div>
  ) : null
  const embeddedPrintState = printRequest
    ? printLoadState === 'error' || programLoadState === 'error'
      ? 'error'
      : printLoadState === 'ready'
        && programLoadState === 'ready'
        && (printRequest.kind === 'word-search' ? wordSearchPages.length > 0 : printPages.length > 0)
        ? 'ready'
        : 'loading'
    : undefined

  return (
    <div className="vocabulary-review-page" data-vocabulary-print-state={embeddedPrintState}>
      <AppTopbar
        variant="sub"
        pageTitle="过生词"
        onBack={props.onBackToWorkbench}
        {...props.shellNav}
      />

      <main className="vocabulary-review-shell" aria-label="过生词">
        <header className="vocabulary-review-heading">
          <div>
            <h1>{programLoadState === 'ready' ? program.title : '中考词汇一轮'}</h1>
            <p>{programLoadState === 'ready'
              ? `${program.subtitle} · 按原书顺序逐词判断，收满本轮目标生词后生成固定生词纸。`
              : '万唯一轮完整1600词 · 读取完整词库后显示正式过词进度。'}</p>
          </div>
          {programLoadState === 'ready' && studentsState === 'ready' && activeStudent && (
            <div className="vocabulary-heading-actions">
              <div className="vocabulary-student-switcher">
                <label>
                  <span>当前学生</span>
                  <select
                    aria-label="切换当前学生"
                    value={activeStudentId ?? ''}
                    disabled={requestBusy}
                    onChange={(event) => setActiveStudentId(event.target.value)}
                  >
                    {students.map((student) => <option value={student.id} key={student.id}>{student.displayName}</option>)}
                  </select>
                </label>
                <button
                  className="vocabulary-student-add-button"
                  type="button"
                  aria-expanded={studentCreateOpen}
                  onClick={() => {
                    setStudentCreateOpen((current) => !current)
                    setStudentNameInput('')
                    setStudentFormError('')
                  }}
                >
                  {studentCreateOpen ? '取消' : '新建学生'}
                </button>
              </div>
              {studentCreateOpen && (
                <form className="vocabulary-student-create" onSubmit={(event) => { event.preventDefault(); void createStudentProfile() }}>
                  <label htmlFor="vocabulary-student-name">学生姓名</label>
                  <div>
                    <input
                      id="vocabulary-student-name"
                      value={studentNameInput}
                      maxLength={30}
                      autoComplete="off"
                      autoFocus
                      placeholder="例如：小林"
                      onChange={(event) => setStudentNameInput(event.target.value)}
                    />
                    <button type="submit" disabled={requestBusy || !studentNameInput.trim()}>保存</button>
                  </div>
                  {studentFormError && <p role="alert">{studentFormError}</p>}
                </form>
              )}
              <div className="vocabulary-overall-progress">
                <span id="vocabulary-overall-progress-label">
                  {mainProgressEntry
                    ? `${activeStudent.displayName} · 下一词 ${mainProgressCursor + 1} / ${program.entries.length}`
                    : `${activeStudent.displayName} · 已到末尾 ${program.entries.length} / ${program.entries.length}`}
                </span>
                <progress
                  aria-labelledby="vocabulary-overall-progress-label"
                  max={program.entries.length}
                  value={processedCount}
                />
                {!printRequest && (
                  <button
                    className="vocabulary-progress-toggle"
                    type="button"
                    aria-expanded={progressExplorerOpen}
                    aria-controls="vocabulary-progress-explorer"
                    onClick={toggleProgressExplorer}
                  >
                    {progressExplorerOpen ? '收起进度' : '查看 / 调整进度'}
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {programLoadState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-program-error-title">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h2 id="vocabulary-program-error-title">完整词库没有加载成功</h2>
            <p>这次不会退回 30 词校准样本继续判断，避免把正式进度记错。重新加载完整词库后再开始。</p>
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>重新加载完整词库</button>
            {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
          </section>
        ) : studentsState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-student-error-title">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h2 id="vocabulary-student-error-title">学生档案没有加载成功</h2>
            <p>不会把不同学生的进度混在一起。重新加载档案后再继续过词。</p>
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>重新加载学生档案</button>
            {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
          </section>
        ) : programLoadState === 'loading' || studentsState === 'loading' || runState === 'loading' ? (
          <section className="vocabulary-run-setup" aria-live="polite"><p>正在读取过词进度…</p></section>
        ) : progressExplorerOpen && activeStudent ? (
          <div id="vocabulary-progress-explorer">
            <VocabularyProgressExplorer
              program={program}
              cursor={mainProgressCursor}
              selectedWeek={progressExplorerWeek}
              selectedEntryId={progressSelectionId}
              hasUnfinishedRun={progressRequiresRunReplacement}
              busy={requestBusy}
              statusMessage={progressUpdateMessage}
              errorMessage={progressUpdateError}
              closeLabel={runState === 'active' ? '返回过词' : '返回开始设置'}
              currentPositionRef={progressCurrentRef}
              onWeekChange={(week) => {
                setProgressExplorerWeek(week)
                setProgressSelectionId(null)
                setProgressUpdateMessage('')
                setProgressUpdateError('')
              }}
              onEntrySelect={(entryId) => {
                setProgressSelectionId(entryId)
                setProgressUpdateMessage('')
                setProgressUpdateError('')
              }}
              onConfirm={(entry) => void confirmProgressStart(entry)}
              onClose={() => setProgressExplorerOpen(false)}
            />
          </div>
        ) : runState === 'setup' && vocabularySet ? (
          <section className="vocabulary-run-setup vocabulary-set-reopen" aria-labelledby="vocabulary-set-reopen-title">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h2 id="vocabulary-set-reopen-title">{vocabularySet.title}</h2>
            <p>这是一份内容固定的生词组，共 {vocabularySet.entryCount} 词。可以下载、重新分享或撤销原听写链接。</p>
            {vocabularySetTitleControl}
            <div className="vocabulary-completion-actions">
              {printAccentControl}
              {downloadControl}
              {!shareId ? (
                <button className="ghost-button" type="button" onClick={() => void createShare()} disabled={requestBusy}>生成扫码听写</button>
              ) : (
                <button className="ghost-button" type="button" onClick={() => void revokeShare()} disabled={requestBusy}>撤销公开分享</button>
              )}
              {shareId && (
                <button className="ghost-button" type="button" onClick={() => void copyShareLink()}>
                  <Copy size={16} />{shareCopyStatus === 'copied' ? '链接已复制' : shareCopyStatus === 'error' ? '复制失败' : '复制听写链接'}
                </button>
              )}
              <button className="ghost-button" type="button" onClick={() => void copyVocabularySet()}>
                {copyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                {copyStatus === 'copied' ? '已复制' : '复制清单'}
              </button>
              <button className="ghost-button" type="button" onClick={() => props.onOpenVocabularyPractice(vocabularySet.id)}>
                <Grid2X2 size={16} />趣味练习
              </button>
              <button className="ghost-button" type="button" onClick={closeVocabularySet}>返回</button>
            </div>
            {shareDownloadConfirmation}
            {shareId && <p className="vocabulary-share-ready">当前扫码听写链接有效，下载的单词纸会在第一页右下角显示二维码。</p>}
            {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
          </section>
        ) : runState === 'setup' || runState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-run-title">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h2 id="vocabulary-run-title">这轮准备收多少个生词？</h2>
            <p>
              {runId
                ? `进度已保存，将从第 ${reviewState.cursor + 1} 词继续，直到收满本轮目标。`
                : '可选 1–60 个。第一次默认 15，以后会记住上次目标。'}
            </p>
            <div className="vocabulary-run-fields">
              <label>
                <span>目标生词数</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  value={targetInput}
                  disabled={Boolean(runId)}
                  onChange={(event) => setTargetInput(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
                />
              </label>
            </div>
            <div className="vocabulary-run-start-row">
              <fieldset className="vocabulary-review-accent-control">
                <legend>过词读音</legend>
                <div>
                  <button type="button" className={reviewAccent === 'american' ? 'is-selected' : undefined} aria-pressed={reviewAccent === 'american'} onClick={() => chooseReviewAccent('american')}>美音</button>
                  <button type="button" className={reviewAccent === 'british' ? 'is-selected' : undefined} aria-pressed={reviewAccent === 'british'} onClick={() => chooseReviewAccent('british')}>英音</button>
                </div>
              </fieldset>
              <button className="primary-button" type="button" onClick={() => void startReview()} disabled={requestBusy || (!runId && mainProgressCursor >= program.entries.length)}>
                {runId ? '继续过词' : '开始过词'}
              </button>
            </div>
            <div className="vocabulary-direct-set">
              <div className="vocabulary-direct-set-heading">
                <h3>已有单词，直接生成词表</h3>
                <span>只保留当前 1600 词库中的词</span>
              </div>
              <label className="vocabulary-direct-set-input" htmlFor="vocabulary-direct-set-input">
                <span>用中文逗号隔开</span>
                <textarea
                  id="vocabulary-direct-set-input"
                  rows={4}
                  value={directVocabularyInput}
                  placeholder="about，advice，accept"
                  onChange={(event) => setDirectVocabularyInput(event.target.value)}
                />
              </label>
              {directVocabularyInput.trim() && (
                <div className="vocabulary-direct-set-feedback" aria-live="polite">
                  <p>
                    <strong>可生成 {directInputResult.matchedEntries.length} 词</strong>
                    <span>已去重 {directInputResult.duplicateTerms.length}</span>
                    <span>未收录 {directInputResult.rejectedTerms.length}</span>
                  </p>
                  {directInputResult.rejectedTerms.length > 0 && (
                    <small>
                      未收录：{directInputResult.rejectedTerms.join('，')}
                    </small>
                  )}
                  {directInputOverLimit && <small role="alert">一次最多生成 60 词，分成两次即可。</small>}
                </div>
              )}
              <button
                className="ghost-button"
                type="button"
                onClick={() => void generateVocabularySetFromInput()}
                disabled={requestBusy || !directInputResult.matchedEntries.length || directInputOverLimit}
              >
                生成固定词组
              </button>
            </div>
            {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
            {recentSets.length > 0 && (
              <div className="vocabulary-recent-sets">
                <div><h3>最近生词组</h3><span>内容固定，可随时下载</span></div>
                <ol>
                  {recentSets.slice(0, 6).map((set) => (
                    <li key={set.id}>
                      <button type="button" onClick={() => openVocabularySet(set)}>
                        <span>
                          <strong>{set.title}</strong>
                          <small>{set.entryCount} 词 · {set.entries.map((entry) => entry.headword).join('、')}</small>
                        </span>
                        <span>{set.share?.status === 'active' ? '听写已分享' : '未公开'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        ) : <div className="vocabulary-review-layout">
          <aside className="vocabulary-course-rail" aria-label="课程位置">
            <div className="vocabulary-rail-heading">
              <h2>第{currentWeek}周</h2>
              <span>{currentStage === 'core' ? '核心掌握词' : currentStage === 'basic' ? '基础识记词' : '认识拓展词'}</span>
            </div>
            <ol className="vocabulary-group-list">
              {visibleGroups.map((group) => {
                const groupEntries = program.entries.filter((entry) =>
                  entry.source.group === group.group && (!group.stage || entry.source.stage === group.stage))
                const groupProcessed = groupEntries.filter((entry) => reviewState.decisions[entry.id]).length
                const isCurrent = currentEntry?.source.group === group.group && (!group.stage || currentEntry.source.stage === group.stage)
                const isComplete = groupProcessed === groupEntries.length
                return (
                  <li
                    key={group.id}
                    className={isCurrent ? 'is-current' : isComplete ? 'is-complete' : undefined}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="vocabulary-group-marker" aria-hidden="true">
                      {isComplete ? <Check size={14} /> : group.group}
                    </span>
                    <span>
                      <strong>Day {group.group}</strong>
                      <small>{groupProcessed > 0 || isCurrent ? `${groupProcessed} / ${groupEntries.length} 词` : `共 ${groupEntries.length} 词`}</small>
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="vocabulary-source-note">
              {program.entries.length === 30
                ? '来源索引、页码与标题证据已复核；当前样本覆盖 Day 1–4 的前30词。'
                : `来源索引、页码与标题证据已复核；完整 ${program.entries.length} 词按原书 Day 顺序入库。`}
            </p>
          </aside>

          <section className="vocabulary-review-stage" aria-live="polite">
            {completion === 'active' && currentEntry ? (
              <>
                <div className="vocabulary-stage-meta">
                  <span>第{currentEntry.source.week}周 · {currentEntry.source.sourceLabel}</span>
                  <div>
                    <span>词序 {currentGlobalOrder} / {program.entries.length}</span>
                    <button type="button" onClick={pauseReview} disabled={requestBusy}>
                      <ArrowLeft size={14} aria-hidden="true" />
                      暂停并返回
                    </button>
                  </div>
                </div>
                <div className="vocabulary-word-block">
                  <h2>{currentEntry.headword}</h2>
                  <span>{currentEntry.partOfSpeech}</span>
                  <button className="vocabulary-word-replay" type="button" onClick={playCurrentEntry} aria-label={`重播 ${currentEntry.headword} 的${reviewAccent === 'american' ? '美音' : '英音'}`}>
                    <Volume2 size={16} aria-hidden="true" />
                    <span>重播</span>
                    <kbd>空格</kbd>
                  </button>
                </div>

                {reviewState.revealed ? (
                  <div className="vocabulary-revealed-card">
                    <VocabularyVisual entry={currentEntry} />
                    <div className="vocabulary-sense-block">
                      <button
                        className="vocabulary-pronunciation"
                        type="button"
                        onClick={playCurrentEntry}
                        title={`播放${reviewAccent === 'american' ? '美音' : '英音'}`}
                      >
                        <Volume2 size={17} />
                        {currentEntry.phonetics?.[reviewAccent] ?? currentEntry.phonetic}
                      </button>
                      <div className="vocabulary-core-meanings">
                        <span>{currentEntry.partOfSpeech}</span>
                        <p>{formatCoreMeanings(currentEntry)}</p>
                      </div>
                      <VocabularyPronunciationGuide entry={currentEntry} accent={reviewAccent} />
                      <VocabularyExample entry={currentEntry} />
                      <dl>
                        {currentEntry.examFrequency != null && currentEntry.examFrequency > 0 && (
                          <div>
                            <dt>来源考频</dt>
                            <dd>{currentEntry.examFrequency}考</dd>
                          </div>
                        )}
                        <div>
                          <dt>释义状态</dt>
                          <dd>独立复核通过</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                ) : (
                  <button className="vocabulary-reveal-prompt" type="button" onClick={reveal}>
                    <Eye size={24} />
                    <strong>先让孩子认词</strong>
                    <span>按 → 再查看图片、音标和常见义</span>
                  </button>
                )}

                <div className="vocabulary-decision-controls" aria-label="过词判断">
                  <button className="vocabulary-control vocabulary-control-back" type="button" onClick={undo} disabled={!reviewState.decisionOrder.length}>
                    <RotateCcw size={19} />
                    <span>上一个</span>
                    <kbd>Delete</kbd>
                  </button>
                  <button className="vocabulary-control vocabulary-control-known" type="button" onClick={() => decide('known')} disabled={requestBusy}>
                    <Check size={19} />
                    <span>认识</span>
                    <kbd>Enter</kbd>
                  </button>
                  <button className="vocabulary-control vocabulary-control-unfamiliar" type="button" onClick={() => decide('unfamiliar')} disabled={requestBusy}>
                    <BookMarked size={19} />
                    <span>不认识，收下</span>
                    <kbd>Shift</kbd>
                  </button>
                  <button className="vocabulary-control vocabulary-control-reveal" type="button" onClick={reveal} disabled={reviewState.revealed}>
                    <Eye size={19} />
                    <span>看提示</span>
                    <kbd>→</kbd>
                  </button>
                </div>
                {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
              </>
            ) : (
              <div className="vocabulary-completion-state">
                <BookMarked size={38} strokeWidth={1.5} />
                <h2>{completion === 'target-reached' ? `已收满${reviewState.targetUnfamiliarCount}个生词` : '当前词汇已过完'}</h2>
                <p>
                  本轮共判断 {reviewState.decisionOrder.length} 词：认识 {knownCount} 词，收下 {unfamiliarEntries.length} 词。
                </p>
                <div className="vocabulary-completion-actions">
                  {vocabularySetTitleControl}
                  {printAccentControl}
                  {!vocabularySet ? <button className="primary-button" type="button" onClick={() => void generateVocabularySet()} disabled={!unfamiliarEntries.length || requestBusy}>
                    <BookMarked size={16} />
                    生成固定生词组
                  </button> : downloadControl}
                  {vocabularySet && !shareId && <button className="ghost-button" type="button" onClick={() => void createShare()} disabled={requestBusy}>生成扫码听写</button>}
                  {shareId && <button className="ghost-button" type="button" onClick={() => void copyShareLink()}><Copy size={16} />{shareCopyStatus === 'copied' ? '链接已复制' : '复制听写链接'}</button>}
                  {vocabularySet && (
                    <button className="ghost-button" type="button" onClick={() => props.onOpenVocabularyPractice(vocabularySet.id)}>
                      <Grid2X2 size={16} />趣味练习
                    </button>
                  )}
                  <button className="ghost-button" type="button" onClick={() => void copyVocabularySet()} disabled={!unfamiliarEntries.length}>
                    {copyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                    {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制清单'}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void startAnotherReview()} disabled={requestBusy}>
                    <RotateCcw size={16} />
                    开始下一轮
                  </button>
                </div>
                {shareDownloadConfirmation}
                {shareId && <p className="vocabulary-share-ready">扫码听写链接已固定，可随时下载单词纸。</p>}
                {requestError && <p className="vocabulary-request-error" role="alert">{requestError}</p>}
              </div>
            )}
          </section>

          <aside className="vocabulary-collection-rail" aria-label="本轮生词">
            <div className="vocabulary-collection-heading">
              <div>
                <h2>本轮生词</h2>
                <span>{unfamiliarEntries.length} / {reviewState.targetUnfamiliarCount}</span>
              </div>
              <progress max={reviewState.targetUnfamiliarCount} value={unfamiliarEntries.length} />
            </div>

            {unfamiliarEntries.length ? (
              <ol className="vocabulary-collected-list">
                {unfamiliarEntries.map((entry, index) => (
                  <li key={entry.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{entry.headword}</strong>
                      <small>{formatCoreMeanings(entry)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="vocabulary-collection-empty">
                <BookMarked size={22} />
                <p>按 Shift 判断“不认识”，生词会依次收在这里。</p>
              </div>
            )}

            <div className="vocabulary-collection-actions">
              <button className="ghost-button" type="button" onClick={() => void copyVocabularySet()} disabled={!unfamiliarEntries.length}>
                {copyStatus === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                {copyStatus === 'copied' ? '已复制' : '复制'}
              </button>
              <button className="ghost-button" type="button" onClick={() => setDownloadMenuOpen(true)} disabled={!vocabularySet || pdfDownloadBusy}>
                <Download size={15} />
                {pdfDownloadBusy ? '生成中…' : '下载'}
              </button>
            </div>
          </aside>
        </div>}
      </main>

      <section className={`vocabulary-print-sheet is-${printRequest?.kind ?? 'cards'}`} aria-hidden="true">
        {printRequest?.kind === 'word-search' ? (
          <VocabularyWordSearchPrint
            title={vocabularySet?.title ?? '生词圈词练习'}
            entryCount={printEntries.length}
            pages={wordSearchPages}
          />
        ) : printPages.map((pageEntries, pageIndex) => (
          printRequest?.kind === 'dictation' || printRequest?.kind === 'answer' ? (
            <div className="vocabulary-print-page vocabulary-dictation-print-page" key={`print-page-${pageIndex + 1}`}>
              <header className="vocabulary-dictation-print-header">
                <div>
                  <h1>{vocabularySet?.title ?? '生词听写纸'}</h1>
                  <p>{printRequest.kind === 'answer' ? '教师答案' : '听写纸'}</p>
                </div>
                {printRequest.kind === 'dictation' && pageIndex === 0 && shareId && (
                  <aside className="vocabulary-print-qr vocabulary-dictation-print-qr" aria-label="扫码自动听写二维码">
                    <QRCodeSVG value={`${PUBLIC_LISTEN_ORIGIN}/vocabulary/dictation/${shareId}?accent=${printAccent}`} size={72} level="M" marginSize={0} title="扫码自动听写" />
                    <span>扫码自动听写</span>
                  </aside>
                )}
              </header>
              <div className="vocabulary-dictation-print-meta">
                <span>姓名：</span><i />
                <span>日期：</span><i />
                <span>得分：</span><i />
              </div>
              <div
                className={`vocabulary-dictation-print-table is-${printRequest.kind}`}
                role="table"
                aria-label={printRequest.kind === 'answer' ? '教师答案' : '学生听写纸'}
              >
                {splitVocabularyDictationColumns(pageEntries).map((columnEntries, columnIndex, columns) => (
                  <section className="vocabulary-dictation-print-column" role="rowgroup" key={`dictation-column-${columnIndex + 1}`}>
                    <div className="vocabulary-dictation-print-table-head" role="row">
                      <span role="columnheader">序号</span>
                      <span role="columnheader">英文单词</span>
                      <span role="columnheader">词性</span>
                      <span role="columnheader">中文意思</span>
                    </div>
                    {columnEntries.map((entry, entryIndex) => {
                      const columnOffset = columnIndex === 0 ? 0 : columns[0].length
                      const number = pageIndex * DICTATION_PRINT_ENTRIES_PER_PAGE + columnOffset + entryIndex + 1
                      return (
                        <div className="vocabulary-dictation-print-row" role="row" key={entry.id}>
                          <span className="vocabulary-dictation-number" role="cell">{number}</span>
                          <div className="vocabulary-dictation-word-cell" role="cell">
                            {printRequest.kind === 'answer' ? (
                              <strong>{getVocabularyDictationAnswer(entry)}</strong>
                            ) : (
                              <span className="vocabulary-dictation-writing-guide" aria-hidden="true">
                                <i /><i /><i /><i />
                              </span>
                            )}
                          </div>
                          <span className="vocabulary-dictation-part-of-speech" role="cell">
                            {printRequest.kind === 'answer' ? entry.partOfSpeech : ''}
                          </span>
                          <p role="cell">{printRequest.kind === 'answer' ? formatCoreMeanings(entry) : ''}</p>
                        </div>
                      )
                    })}
                  </section>
                ))}
              </div>
              <footer className="vocabulary-dictation-print-footer">
                <span><strong>{vocabularySet?.title ?? program.title}</strong> · {printRequest.kind === 'answer' ? '教师答案' : '听写纸'} · {printEntries.length}词</span>
                <span>第 {pageIndex + 1} / {printPages.length} 页</span>
              </footer>
            </div>
          ) : (
            <div className="vocabulary-print-page" key={`print-page-${pageIndex + 1}`}>
              <header className="vocabulary-print-header">
                <div>
                  <h1>{vocabularySet?.title ?? '生词记忆纸'}</h1>
                  <p>看图 · 分音节 · 放进句子里</p>
                </div>
                <div className="vocabulary-print-key" aria-label="拆分说明">
                  <span><strong>拆分</strong> 按音节或词形拆拼写</span>
                  <span><strong>读音</strong> {printAccent === 'american' ? '美式' : '英式'}整词与分节一致</span>
                </div>
              </header>
              <div className="vocabulary-print-grid">
                {pageEntries.map((entry) => (
                  <article className={`vocabulary-print-entry${entry.headword.length > 32 ? ' has-long-headword' : ''}`} key={entry.id}>
                    <VocabularyVisual entry={entry} compact />
                    <div className="vocabulary-print-word">
                      <div className="vocabulary-print-word-heading"><h2>{entry.headword}</h2></div>
                      <p className="vocabulary-print-phonetic">{entry.phonetics?.[printAccent] ?? entry.phonetic}</p>
                      <div className="vocabulary-print-meaning"><span>{entry.partOfSpeech}</span><strong>{formatCoreMeanings(entry)}</strong></div>
                      <VocabularyPronunciationGuide entry={entry} compact accent={printAccent} />
                    </div>
                    <VocabularyExample entry={entry} compact />
                  </article>
                ))}
              </div>
              <footer className={pageIndex === 0 && shareId ? 'vocabulary-print-footer has-qr' : 'vocabulary-print-footer'}>
                <span><strong>{vocabularySet?.title ?? program.title}</strong> · 固定生词组 · 本轮{printEntries.length}词</span>
                <span>第 {pageIndex + 1} / {printPages.length} 页</span>
                {pageIndex === 0 && shareId && (
                  <aside className="vocabulary-print-qr" aria-label="扫码听写二维码">
                    <QRCodeSVG value={`${PUBLIC_LISTEN_ORIGIN}/vocabulary/listen/${shareId}`} size={72} level="M" marginSize={0} title="扫码听写" />
                    <span>扫码听写</span>
                  </aside>
                )}
              </footer>
            </div>
          )
        ))}
      </section>
    </div>
  )
}
