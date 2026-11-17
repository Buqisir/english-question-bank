import { CopyFeedbackIcon, DownloadFeedbackIcon, VolumeFeedbackIcon } from '../../icons/MotionIcons'
import { useAudioIconState } from '../../hooks/useAudioIconState'
import { iconMotionInput } from '../../icons/motionInput'
import { useClipboardCopy } from '../../hooks/useClipboardCopy'
import {
  ArrowLeft,
  BookMarked,
  Check,
  BoardCheck,
  ChevronRight,
  Eye,
  InfoCircle,
  QrCode,
  Grid2X2,
  RotateCcw,
  Save,
  VocabularyReview,
  WordBubble,
} from '../../icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { FluidHoverList } from '../../components/FluidHoverList'
import { Button } from '../../shared-ui/Button.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { Skeleton } from '../../shared-ui/Skeleton.tsx'
import { useDelayedBusy, useSlowWait } from '../../shared-ui/useDelayedBusy.ts'
import { SelectField, TextAreaField, TextField } from '../../shared-ui/Field.tsx'
import { SegmentedField, type ChoiceOption } from '../../shared-ui/OptionField.tsx'
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
  downloadVocabularySetMaterialsZip,
  freezeVocabularyReviewRun,
  getVocabularyProgram as fetchVocabularyProgram,
  getVocabularyProgress,
  getVocabularyPrintJob,
  getCurrentVocabularyReviewRun,
  getVocabularySet,
  getVocabularyReviewRun,
  listVocabularyStudents,
  listVocabularyPrograms,
  listVocabularySets,
  renameVocabularySet,
  revokeVocabularySetShare,
  setVocabularyProgressStart,
  shareVocabularySet,
  undoVocabularyReviewRun,
  VocabularyApiError,
  VOCABULARY_MATERIAL_KINDS,
  type VocabularyHandwritingMode,
  type VocabularyReviewRunDto,
  type VocabularyProgramSummaryDto,
  type VocabularySetDto,
  type VocabularyStudentDto,
} from '../../services/vocabulary'
import { prepareFileSaveTarget, type FileSaveMode } from '../../services/fileDownload.ts'
import { calibrationVocabularyProgram } from './calibrationVocabularyProgram'
import { VocabularyProgressExplorer } from './VocabularyProgressExplorer'
import { vocabularyVisualManifest } from './vocabularyVisualManifest'
import {
  getVocabularyAudioPath,
  readVocabularyAudioAccent,
  saveVocabularyAudioAccent,
  type VocabularyAudioAccent,
} from '../vocabulary-listen/vocabularyAudioVariants'
import {
  HANDWRITING_PRINT_ENTRIES_PER_PAGE,
  HANDWRITING_SINGLE_ENTRIES_PER_PAGE,
  VocabularyHandwritingPrint,
} from '../vocabulary-practice/VocabularyHandwritingPrint'
import { VocabularyHandwritingSelector } from '../vocabulary-practice/VocabularyHandwritingSelector'
import '../vocabulary-practice/vocabularyHandwriting.css'
import './vocabularyReviewPage.css'

const DEFAULT_PROGRAM_ID = 'wanwei-round-one-v1'
const LAST_PROGRAM_STORAGE_KEY = 'eqb-vocabulary-review-last-program'
const LEGACY_RUN_STORAGE_KEY = 'eqb-vocabulary-review-run-wanwei-round-one-v1'
const LEGACY_ACTIVE_STUDENT_STORAGE_KEY = 'eqb-vocabulary-active-student-wanwei-round-one-v1'
const LEGACY_PAUSED_RUN_STORAGE_KEY = 'eqb-vocabulary-review-paused-wanwei-round-one-v1'
const TARGET_UNFAMILIAR_COUNT = 15
const CARD_PRINT_ENTRIES_PER_PAGE = 6
const DICTATION_PRINT_ENTRIES_PER_PAGE = 15
const PUBLIC_LISTEN_ORIGIN = 'https://eqbank.cc'

type VocabularyReviewPageProps = {
  onBackToWorkbench: () => void
  onOpenVocabularyPractice: (setId: string) => void
  onOpenVocabularyDictationWorkbench: (meaningRecallSetId?: string) => void
  onVocabularySetRouteChange: (setId: string | null) => void
  requestedSetId?: string | null
  shellNav: AppTopbarNav
}

type VocabularyAccent = VocabularyAudioAccent
// 「过词读音」两个选项（SegmentedField）。
const REVIEW_ACCENT_OPTIONS: ChoiceOption<VocabularyAccent>[] = [
  { value: 'american', label: '美音' },
  { value: 'british', label: '英音' },
]
type VocabularyPrintKind = 'cards' | 'dictation' | 'answer' | 'handwriting'
type VocabularySetPrintKind = VocabularyPrintKind

const VOCABULARY_DOWNLOAD_OPTIONS: Array<{
  kind: VocabularySetPrintKind
  label: string
  description: string
}> = [
  { kind: 'cards', label: '单词纸', description: '带图片、音节和例句' },
  { kind: 'dictation', label: '听写纸', description: '15题一页，扫码自动听写' },
  { kind: 'answer', label: '教师答案', description: '与听写纸逐题对应' },
  { kind: 'handwriting', label: '衡水体练字纸', description: '自选单词，描红后独立书写' },
]

type VocabularyPrintRequest = {
  setId: string | null
  printJobId: string | null
  accent: VocabularyAccent
  kind: VocabularyPrintKind
}

function readVocabularyPrintRequest(): VocabularyPrintRequest | null {
  const params = new URLSearchParams(window.location.search)
  const setId = params.get('vocabularyPrintSetId')?.trim()
  const printJobId = params.get('vocabularyPrintJobId')?.trim()
  if (!setId && !printJobId) return null
  return {
    setId: setId || null,
    printJobId: printJobId || null,
    accent: params.get('printAccent') === 'british' ? 'british' : 'american',
    kind: params.get('vocabularyPrintMode') === 'dictation'
      ? 'dictation'
      : params.get('vocabularyPrintMode') === 'answer'
        ? 'answer'
        : params.get('vocabularyPrintMode') === 'handwriting'
            ? 'handwriting'
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

function programStorageKey(kind: 'run' | 'student' | 'paused', programId: string) {
  if (programId === DEFAULT_PROGRAM_ID) {
    if (kind === 'run') return LEGACY_RUN_STORAGE_KEY
    if (kind === 'student') return LEGACY_ACTIVE_STUDENT_STORAGE_KEY
    return LEGACY_PAUSED_RUN_STORAGE_KEY
  }
  return `eqb-vocabulary-review-${kind}:${programId}`
}

function runStorageKey(programId: string, studentId: string) {
  return `${programStorageKey('run', programId)}:${studentId}`
}

function pausedRunStorageKey(programId: string, studentId: string) {
  return `${programStorageKey('paused', programId)}:${studentId}`
}

function activeStudentStorageKey(programId: string) {
  return programStorageKey('student', programId)
}

function readRequestedProgramId() {
  if (typeof window === 'undefined') return DEFAULT_PROGRAM_ID
  return new URLSearchParams(window.location.search).get('programId')?.trim()
    || window.localStorage.getItem(LAST_PROGRAM_STORAGE_KEY)
    || DEFAULT_PROGRAM_ID
}

function replaceVocabularyProgramUrl(programId: string) {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('view') !== 'vocabulary-review') return
  url.searchParams.set('programId', programId)
  const nextSearch = url.searchParams.toString()
  window.history.replaceState(window.history.state, '', `${url.pathname}?${nextSearch}${url.hash || ''}`)
}

/**
 * 过词开始页的灰块（等待第五轮，2026-11-15；原来是这块白板正中一行「正在读取过词进度」）。
 * 读完以后多半落在开始页（「这轮准备收多少个生词？」），所以照开始页排：图标、标题、说明一行、目标生词数和读音一排、
 * 撑满的「开始过词」、从哪个词开始一行、下面「直接生成词表」一段（过生词改版② 2026-11-17 跟着改）。容器和各段用开始页同一套 class，白板整块居中，高度对上了才不跳。
 * 最近生词组那一段要看数据，不画。读完落在过词中（有没过完的一轮）时整页换成过词的样子，那一下会变（见 README）。
 */
function RunSetupSkeleton({ showSkeleton }: { showSkeleton: boolean }) {
  return (
    <section className="vocabulary-run-setup vocabulary-run-skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">正在读取过词进度</span>
      {showSkeleton && <>
        <Skeleton width={32} height={32} />
        <h2><Skeleton width={220} height={16} /></h2>
        <p><Skeleton width={300} height={12} /></p>
        <div className="vocabulary-run-start-row">
          <div className="eqb-field vocabulary-run-target">
            <span className="eqb-field-label"><Skeleton width={64} height={10} /></span>
            <Skeleton height={36} />
          </div>
          <div className="eqb-field">
            <span className="eqb-field-label"><Skeleton width={48} height={10} /></span>
            <Skeleton width={120} height={36} />
          </div>
        </div>
        <Skeleton className="vocabulary-run-start" height={36} />
        <p className="vocabulary-run-from"><Skeleton width={220} height={12} /></p>
        <div className="vocabulary-direct-set">
          <div className="vocabulary-direct-set-heading">
            <h3><Skeleton width={168} height={12} /></h3>
            <span><Skeleton width={150} height={10} /></span>
          </div>
          <div className="eqb-field vocabulary-direct-set-input">
            <span className="eqb-field-label"><Skeleton width={88} height={10} /></span>
            {/* 多行框 4 行：14px × 1.5 × 4 + 上下内边距 8 × 2 + 边 1 × 2 = 102（field.css 大号多行）。 */}
            <Skeleton height={102} />
          </div>
          <Skeleton width={104} height={36} />
        </div>
      </>}
    </section>
  )
}

/**
 * 过词页右上那一栏（单词复习、课程 / 学生、总进度）的灰块（等待第六轮，2026-11-15）。
 * 第五轮只画了下面开始页那一块，这一栏读完才出，数据一到下面整块往下挪约 119px。现在这一栏也照真栏画，和下面那块共用一个等待阶段
 * （progressOpeningPhase）：门槛内这一栏照样占着位置、只是看不见（visibility，不是不画），300ms 时和下面一起出，读完换成真栏，高度不变。
 * 容器、各段用真栏同一套 class（.vocabulary-heading-actions、.vocabulary-student-switcher、.eqb-field、.vocabulary-overall-progress），
 * 灰块放在字的位置；「单词复习」「新建学生」「查看 / 调整进度」都是淡底键（只看得见字），灰块放在键上字的位置。
 * 课程下拉只有一门以上课程才有（programs 这时可能已经读到了，照它画）；打印页没有「单词复习」和「查看 / 调整进度」。
 */
function HeadingActionsSkeleton({ showSkeleton, withProgramSwitcher, printMode }: { showSkeleton: boolean; withProgramSwitcher: boolean; printMode: boolean }) {
  return (
    <div className="vocabulary-heading-actions vocabulary-heading-skeleton" data-shown={showSkeleton ? '' : undefined} aria-hidden="true">
      {!printMode && <span className="vocabulary-heading-skeleton-key"><Skeleton inline width={72} height={12} /></span>}
      {withProgramSwitcher && (
        <div className="eqb-field vocabulary-program-switcher">
          <span className="eqb-field-label"><Skeleton inline width={48} height={10} /></span>
          <Skeleton height={36} />
        </div>
      )}
      <div className="vocabulary-student-switcher">
        <div className="eqb-field vocabulary-student-picker">
          <span className="eqb-field-label"><Skeleton inline width={48} height={10} /></span>
          <Skeleton height={36} />
        </div>
        <span className="vocabulary-heading-skeleton-key"><Skeleton inline width={52} height={12} /></span>
      </div>
      <div className="vocabulary-overall-progress">
        <span><Skeleton inline width={128} height={10} /></span>
        <Skeleton height={6} shape="pill" />
        {!printMode && <span className="vocabulary-progress-toggle vocabulary-heading-skeleton-toggle"><Skeleton inline width={84} height={10} /></span>}
      </div>
    </div>
  )
}

function VocabularyVisual({ entry, compact = false }: { entry: VocabularyEntry; compact?: boolean }) {
  const manifestVisual = vocabularyVisualManifest[entry.visualKey]
  const visual = entry.visual
    ? { src: entry.visual.path, alt: entry.visual.alt, caption: entry.teachingSense, width: undefined, height: undefined }
    : manifestVisual
  const binding = entry.visual?.binding
  const sentenceId = entry.learning.example.candidateId ? `candidate-${entry.learning.example.candidateId}` : null
  if (binding?.mode === 'sentence-scene' && binding.sentenceId !== sentenceId) return null
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
    structure: program.structure,
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
        teachingSenses: entry.teachingSenses,
        examFrequency: entry.examFrequency,
        primaryStageReview: false,
        visualKey: entry.visual.key as VocabularyEntry['visualKey'],
        visual: entry.visual,
        audio: entry.audio,
        audioVariants: entry.audioVariants,
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
          metadata: entry.source.metadata,
        },
      }
    }),
  }
}

function vocabularyStageLabel(program: VocabularyProgram, stage: string): string {
  const configured = program.structure?.stages?.find((candidate) => candidate.key === stage)
  if (configured) return configured.label
  if (stage === 'core') return '核心掌握词'
  if (stage === 'basic') return '基础识记词'
  return stage === 'recognition' ? '认识拓展词' : stage
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

function paginateVocabularyEntries(
  entries: VocabularyEntry[],
  entriesPerPage: number,
  sections: Array<{ startIndex: number; title: string }> = [],
): Array<{ entries: VocabularyEntry[]; title: string; startIndex: number }> {
  const normalizedSections = sections.length ? sections : [{ startIndex: 0, title: '' }]
  const pages: Array<{ entries: VocabularyEntry[]; title: string; startIndex: number }> = []
  normalizedSections.forEach((section, sectionIndex) => {
    const endIndex = normalizedSections[sectionIndex + 1]?.startIndex ?? entries.length
    const sectionEntries = entries.slice(section.startIndex, endIndex)
    for (let index = 0; index < sectionEntries.length; index += entriesPerPage) {
      pages.push({
        entries: sectionEntries.slice(index, index + entriesPerPage),
        title: section.title,
        startIndex: section.startIndex + index,
      })
    }
  })
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
  const preferred = entry.teachingSenses?.length ? entry.teachingSenses : entry.sourceMeanings
  const meanings = [...new Set(preferred.map((meaning) => meaning.trim()).filter(Boolean))].slice(0, 3)
  return meanings.length ? meanings : [entry.teachingSense]
}

function formatCoreMeanings(entry: VocabularyEntry): string {
  return getCoreMeanings(entry).join('；')
}

function frequencyStageLabel(stage: string | undefined): string {
  if (stage === 'high_frequency') return '高频词'
  if (stage === 'mid_frequency') return '中频词'
  if (stage === 'low_frequency') return '低频词'
  return ''
}

function curriculumTagLabel(tag: NonNullable<VocabularyEntry['source']['metadata']>['curriculumTag']): string {
  if (tag === 'initial') return '初中已学'
  if (tag === 'required') return '高中必修'
  if (tag === 'elective') return '高中选择性必修'
  return ''
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
    teachingSenses: entry.teachingSenses,
    visualKey: entry.visual.key,
    visual: entry.visual,
    audio: entry.audio,
    audioVariants: entry.audioVariants,
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
  const [programs, setPrograms] = useState<VocabularyProgramSummaryDto[]>([])
  const [activeProgramId, setActiveProgramId] = useState(readRequestedProgramId)
  const [programLoadState, setProgramLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reviewState, setReviewState] = useState(() => createVocabularyReviewState(TARGET_UNFAMILIAR_COUNT))
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<VocabularyReviewRunDto['status']>('active')
  const [mainProgressCursor, setMainProgressCursor] = useState(0)
  const [targetInput, setTargetInput] = useState(TARGET_UNFAMILIAR_COUNT)
  const [reviewAccent, setReviewAccent] = useState<VocabularyAccent>(() => readVocabularyAudioAccent(activeProgramId))
  const [runState, setRunState] = useState<'loading' | 'setup' | 'active' | 'error'>('loading')
  const [students, setStudents] = useState<VocabularyStudentDto[]>([])
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null)
  const [studentsState, setStudentsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [studentCreateOpen, setStudentCreateOpen] = useState(false)
  // ⓘ 开着的是哪一个词：换词时自然关上，不用另写 effect 去关。
  const [entryInfoFor, setEntryInfoFor] = useState<string | null>(null)
  const entryInfoRef = useRef<HTMLDivElement>(null)
  const [studentNameInput, setStudentNameInput] = useState('')
  const [studentFormError, setStudentFormError] = useState('')
  const [requestBusy, setRequestBusy] = useState(false)
  const [requestError, setRequestError] = useState('')
  // 「没存住」这一类报错要上危险色（DESIGN.md §5 Notices：只有「没保存」「会丢东西」才上）。
  // 记下这句报错的原文；页面上的报错还是这句时才标危险，被别的报错换掉或清空就自然不标了。
  const [unsavedError, setUnsavedError] = useState('')
  const reportUnsaved = useCallback((text: string) => {
    setUnsavedError(text)
    setRequestError(text)
  }, [])
  const [vocabularySet, setVocabularySet] = useState<VocabularySetDto | null>(null)
  const [recentSets, setRecentSets] = useState<VocabularySetDto[]>([])
  const [shareId, setShareId] = useState<string | null>(null)
  const listClipboard = useClipboardCopy()
  const shareClipboard = useClipboardCopy()
  const copyStatus = listClipboard.copied ? 'copied' : listClipboard.error ? 'error' : 'idle'
  const shareCopyStatus = shareClipboard.copied ? 'copied' : shareClipboard.error ? 'error' : 'idle'
  const [printAccent, setPrintAccent] = useState<VocabularyAccent>(printRequest?.accent ?? 'american')
  const [printLoadState, setPrintLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(printRequest ? 'loading' : 'idle')
  const [printSections, setPrintSections] = useState<Array<{ startIndex: number; title: string }>>([])
  const [printShareKind, setPrintShareKind] = useState<'listen' | 'dictation' | null>(null)
  const [printHandwritingMode, setPrintHandwritingMode] = useState<VocabularyHandwritingMode>('standard')
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false)
  // 等待第五轮（2026-11-15）：下载（PDF / ZIP）等过 10 秒，在键下方、出错那一行的位置多说一句（键上的图标照旧自己演）。
  const pdfDownloadSlow = useSlowWait(pdfDownloadBusy)
  // 等待第五轮（2026-11-15）：读词库、学生档案、过词进度这一段整页在等，画开始页的灰块，走门槛（300ms 内不出、出了至少留 500ms）。
  const progressLoading = programLoadState === 'loading' || studentsState === 'loading' || runState === 'loading'
  const progressOpeningPhase = useDelayedBusy(progressLoading)
  // 等待第六轮（2026-11-15）：右上那一栏也画灰块，和下面开始页那块同一个阶段（读完、留够 500ms 一起换成真的）。读出错时不画。
  const headingSkeletonPending = (progressLoading || progressOpeningPhase === 'waiting')
    && programLoadState !== 'error' && studentsState !== 'error'
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [pendingShareDownload, setPendingShareDownload] = useState<{
    kind: 'cards' | 'dictation' | 'bundle'
    mode: FileSaveMode
  } | null>(null)
  const [handwritingSelectionMode, setHandwritingSelectionMode] = useState<FileSaveMode | null>(null)
  const [directVocabularyInput, setDirectVocabularyInput] = useState('')
  const [setTitleInput, setSetTitleInput] = useState('')
  const [progressExplorerOpen, setProgressExplorerOpen] = useState(false)
  const [progressExplorerWeek, setProgressExplorerWeek] = useState(1)
  const [progressSelectionId, setProgressSelectionId] = useState<string | null>(null)
  const [progressUpdateMessage, setProgressUpdateMessage] = useState('')
  const [progressUpdateError, setProgressUpdateError] = useState('')
  const [progressReplaceRequired, setProgressReplaceRequired] = useState(false)
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioIcon = useAudioIconState()
  const playAudioIcon = audioIcon.play
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
      printRequest?.kind === 'handwriting'
          ? printHandwritingMode === 'single'
            ? HANDWRITING_SINGLE_ENTRIES_PER_PAGE
            : HANDWRITING_PRINT_ENTRIES_PER_PAGE
        : printRequest?.kind === 'dictation' || printRequest?.kind === 'answer'
        ? DICTATION_PRINT_ENTRIES_PER_PAGE
        : CARD_PRINT_ENTRIES_PER_PAGE,
      printSections,
    ),
    [printEntries, printHandwritingMode, printRequest?.kind, printSections],
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
  const entryInfoOpen = Boolean(currentEntry && entryInfoFor === currentEntry.id)
  const setEntryInfoOpen = (open: boolean) => setEntryInfoFor(open && currentEntry ? currentEntry.id : null)
  const currentStageLabel = vocabularyStageLabel(program, currentStage)
  const currentWeek = currentEntry?.source.week ?? 1

  useEffect(() => {
    if (!entryInfoOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!entryInfoRef.current?.contains(event.target as Node)) setEntryInfoFor(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEntryInfoFor(null)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [entryInfoOpen])

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
    void playAudioIcon(audio, entry.id).catch(() => {
      if (reviewAudioRef.current !== audio || !reportError) return
      setRequestError(`${reviewAccent === 'american' ? '美音' : '英音'}暂时无法播放，请稍后重试。`)
    })
  }, [playAudioIcon, reviewAccent])

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
    window.localStorage.setItem(runStorageKey(activeProgramId, activeStudentId), run.id)
    if (options.activate === false) {
      setRunState('setup')
    } else {
      window.localStorage.removeItem(pausedRunStorageKey(activeProgramId, activeStudentId))
      setRunState('active')
    }
  }, [activeProgramId, activeStudentId])

  useEffect(() => {
    if (printRequest) return
    listVocabularyPrograms()
      .then((nextPrograms) => {
        if (!nextPrograms.length) throw new Error('当前没有可用的词汇课程。')
        const requestedId = readRequestedProgramId()
        const nextProgramId = nextPrograms.some((item) => item.id === requestedId)
          ? requestedId
          : nextPrograms[0].id
        setPrograms(nextPrograms)
        setActiveProgramId(nextProgramId)
      })
      .catch((error: unknown) => {
        setProgramLoadState('error')
        setRequestError(error instanceof Error ? error.message : '词汇课程列表加载失败。')
      })
  }, [printRequest])

  useEffect(() => {
    if (!printRequest && !programs.some((item) => item.id === activeProgramId)) return
    setProgramLoadState('loading')
    if (!printRequest) {
      const savedAccent = readVocabularyAudioAccent(activeProgramId)
      setReviewAccent(savedAccent)
      setPrintAccent(savedAccent)
    }
    fetchVocabularyProgram(activeProgramId)
      .then((nextProgram) => {
        setProgram(adaptVocabularyProgram(nextProgram))
        setProgramLoadState('ready')
      })
      .catch((error: unknown) => {
        setProgramLoadState('error')
        setRequestError(error instanceof Error ? error.message : '完整词库加载失败。')
      })
  }, [activeProgramId, printRequest, programs])

  useEffect(() => {
    if (printRequest) {
      setStudentsState('ready')
      setRunState('setup')
      const loadPrint = printRequest.printJobId
        ? getVocabularyPrintJob(printRequest.printJobId).then((printJob) => {
            if (printJob.vocabularySet.programId !== activeProgramId) {
              setActiveProgramId(printJob.vocabularySet.programId)
            }
            setVocabularySet(printJob.vocabularySet)
            setShareId(printJob.vocabularySet.share?.status === 'active' ? printJob.vocabularySet.share.shareId : null)
            setPrintSections(printJob.sections)
            setPrintShareKind(printJob.shareKind)
            setPrintAccent(printJob.accent)
            setPrintHandwritingMode(printJob.handwritingMode === 'single' ? 'single' : 'standard')
          })
        : getVocabularySet(printRequest.setId!).then((nextSet) => {
            if (vocabularyPrintRequiresShare(printRequest.kind) && nextSet.share?.status !== 'active') {
              throw new Error('请先生成公开二维码，再下载带二维码的单词卡或听写纸。')
            }
            if (nextSet.programId !== activeProgramId) setActiveProgramId(nextSet.programId)
            setVocabularySet(nextSet)
            setShareId(nextSet.share?.status === 'active' ? nextSet.share.shareId : null)
            setPrintShareKind(printRequest.kind === 'dictation' ? 'dictation' : 'listen')
            setPrintHandwritingMode('standard')
          })
      loadPrint
        .then(() => setPrintLoadState('ready'))
        .catch((error: unknown) => {
          setPrintLoadState('error')
          setRequestError(error instanceof Error ? error.message : '单词纸内容加载失败。')
        })
      return
    }
    listVocabularyStudents()
      .then((nextStudents) => {
        const preferredId = window.localStorage.getItem(activeStudentStorageKey(activeProgramId))
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
  }, [activeProgramId, printRequest])

  useEffect(() => {
    if (!activeStudentId) return
    const studentId = activeStudentId
    const isDefaultStudent = students.find((student) => student.id === studentId)?.isDefault === true
    let cancelled = false
    window.localStorage.setItem(activeStudentStorageKey(activeProgramId), studentId)
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
          listVocabularySets(activeProgramId, studentId),
          getVocabularyProgress(activeProgramId, studentId),
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
          if (requestedSet.programId !== activeProgramId) {
            setActiveProgramId(requestedSet.programId)
            return
          }
          setVocabularySet(requestedSet)
          setShareId(requestedSet.share?.status === 'active' ? requestedSet.share.shareId : null)
          setRunState('setup')
          return
        }
        const savedRunId = window.localStorage.getItem(runStorageKey(activeProgramId, studentId))
          ?? (activeProgramId === DEFAULT_PROGRAM_ID && isDefaultStudent
            ? window.localStorage.getItem(LEGACY_RUN_STORAGE_KEY)
            : null)
        const currentRun = await getCurrentVocabularyReviewRun(activeProgramId, studentId)
        if (cancelled) return
        if (currentRun) {
          const pausedRunId = window.localStorage.getItem(pausedRunStorageKey(activeProgramId, studentId))
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
            if (activeProgramId === DEFAULT_PROGRAM_ID && isDefaultStudent) {
              window.localStorage.removeItem(LEGACY_RUN_STORAGE_KEY)
            }
            setVocabularySet(frozenSet)
            setShareId(frozenSet.share?.status === 'active' ? frozenSet.share.shareId : null)
            applyRun(run, { activate: false })
            return
          } catch {
            window.localStorage.removeItem(runStorageKey(activeProgramId, studentId))
            if (activeProgramId === DEFAULT_PROGRAM_ID && isDefaultStudent) {
              window.localStorage.removeItem(LEGACY_RUN_STORAGE_KEY)
            }
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
  }, [activeProgramId, activeStudentId, applyRun, props.requestedSetId, students])

  useEffect(() => () => {
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
      .catch((error: unknown) => reportUnsaved(error instanceof Error ? error.message : '判断未保存，请重试。'))
      .finally(() => setRequestBusy(false))
  }, [applyRun, reportUnsaved, completion, program.entries, programLoadState, progressExplorerOpen, requestBusy, reviewState.cursor, runId, runState])

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
      .catch((error: unknown) => reportUnsaved(error instanceof Error ? error.message : '撤销未保存，请重试。'))
      .finally(() => setRequestBusy(false))
  }, [applyRun, reportUnsaved, programLoadState, progressExplorerOpen, requestBusy, reviewState.decisionOrder.length, runId, runState])

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
      window.localStorage.removeItem(pausedRunStorageKey(activeProgramId, activeStudentId))
      applyRun(await createVocabularyReviewRun(activeProgramId, activeStudentId, targetInput, { mode: 'main' }))
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
      const result = await setVocabularyProgressStart(activeProgramId, activeStudentId, entry.id, progressRequiresRunReplacement)
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
      window.localStorage.removeItem(runStorageKey(activeProgramId, activeStudentId))
      window.localStorage.removeItem(pausedRunStorageKey(activeProgramId, activeStudentId))
      if (activeProgramId === DEFAULT_PROGRAM_ID && activeStudent?.isDefault) {
        window.localStorage.removeItem(LEGACY_RUN_STORAGE_KEY)
      }
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
    window.localStorage.setItem(pausedRunStorageKey(activeProgramId, activeStudentId), runId)
    setReviewState((current) => ({ ...current, revealed: false }))
    setRequestError('')
    setRunState('setup')
  }

  async function startAnotherReview() {
    setRequestBusy(true)
    setRequestError('')
    try {
      if (runId && !vocabularySet) await discardVocabularyReviewRun(runId)
      if (activeStudentId) window.localStorage.removeItem(runStorageKey(activeProgramId, activeStudentId))
      if (activeStudentId) window.localStorage.removeItem(pausedRunStorageKey(activeProgramId, activeStudentId))
      if (activeProgramId === DEFAULT_PROGRAM_ID && activeStudent?.isDefault) {
        window.localStorage.removeItem(LEGACY_RUN_STORAGE_KEY)
      }
      setRunId(null)
      setRunStatus('active')
      setVocabularySet(null)
      setShareId(null)
      setReviewState(createVocabularyReviewState(targetInput))
      setRunState('setup')
      listClipboard.reset()
      shareClipboard.reset()
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
      window.localStorage.removeItem(runStorageKey(activeProgramId, activeStudentId))
      window.localStorage.removeItem(pausedRunStorageKey(activeProgramId, activeStudentId))
    }
    if (activeProgramId === DEFAULT_PROGRAM_ID && activeStudent?.isDefault) {
      window.localStorage.removeItem(LEGACY_RUN_STORAGE_KEY)
    }
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
        activeProgramId,
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
    await listClipboard.copy(formatVocabularyList(printEntries))
  }

  async function copyShareLink() {
    if (!shareId) return
    await shareClipboard.copy(`${PUBLIC_LISTEN_ORIGIN}/vocabulary/listen/${shareId}`)
  }

  async function downloadVocabularySheet(
    kind: VocabularySetPrintKind = 'cards',
    mode: FileSaveMode = 'download',
    options: {
      shareConfirmed?: boolean
      selectedEntryIds?: string[]
      handwritingMode?: VocabularyHandwritingMode
    } = {},
  ) {
    if (!vocabularySet || pdfDownloadBusy) return
    if (kind === 'handwriting' && !options.selectedEntryIds) {
      setDownloadMenuOpen(false)
      setHandwritingSelectionMode(mode)
      return
    }
    if (vocabularyPrintRequiresShare(kind) && !shareId && !options.shareConfirmed) {
      setDownloadMenuOpen(false)
      setPendingShareDownload({ kind, mode })
      return
    }
    setDownloadMenuOpen(false)
    setPendingShareDownload(null)
    setRequestError('')
    try {
      const title = setTitleInput.trim()
      if (!title) throw new Error('请先填写单词纸名称。')
      const option = VOCABULARY_DOWNLOAD_OPTIONS.find((item) => item.kind === kind)
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: kind === 'handwriting'
          ? `${title}-衡水体练字纸${options.handwritingMode === 'single' ? '-每词1遍' : ''}-${options.selectedEntryIds?.length ?? printEntries.length}词.pdf`
          : `${title}-${option?.label || '生词资料'}-${printAccent === 'american' ? '美音' : '英音'}.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setPdfDownloadBusy(true)
      let setForDownload = vocabularySet
      if (title !== vocabularySet.title) {
        setForDownload = await renameVocabularySet(vocabularySet.id, title)
        setVocabularySet(setForDownload)
        setRecentSets((current) => current.map((item) => item.id === setForDownload.id ? setForDownload : item))
      }
      if (vocabularyPrintRequiresShare(kind) && !shareId) await activateShare(setForDownload)
      await downloadVocabularySetPdf(
        setForDownload.id,
        printAccent,
        kind,
        target,
        options.selectedEntryIds,
        options.handwritingMode,
      )
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : mode === 'save-as' ? '文件另存为失败，请重试。' : '文件下载失败，请重试。')
    } finally {
      setPdfDownloadBusy(false)
    }
  }

  async function downloadVocabularyBundle(
    mode: FileSaveMode = 'download',
    options: { shareConfirmed?: boolean } = {},
  ) {
    if (!vocabularySet || pdfDownloadBusy) return
    if (!shareId && !options.shareConfirmed) {
      setDownloadMenuOpen(false)
      setPendingShareDownload({ kind: 'bundle', mode })
      return
    }
    setDownloadMenuOpen(false)
    setPendingShareDownload(null)
    setRequestError('')
    try {
      const title = setTitleInput.trim()
      if (!title) throw new Error('请先填写单词纸名称。')
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${title}-全套资料.zip`,
        mimeType: 'application/zip',
      })
      if (!target) return
      setPdfDownloadBusy(true)
      let setForDownload = vocabularySet
      if (title !== vocabularySet.title) {
        setForDownload = await renameVocabularySet(vocabularySet.id, title)
        setVocabularySet(setForDownload)
        setRecentSets((current) => current.map((item) => item.id === setForDownload.id ? setForDownload : item))
      }
      if (!shareId) await activateShare(setForDownload)
      await downloadVocabularySetMaterialsZip(setForDownload.id, printAccent, target, VOCABULARY_MATERIAL_KINDS)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : mode === 'save-as' ? '资料包另存为失败，请重试。' : '资料包下载失败，请重试。')
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
      reportUnsaved(error instanceof Error ? error.message : '生词组名称保存失败，请重试。')
    } finally {
      setRequestBusy(false)
    }
  }

  function playCurrentEntry() {
    if (currentEntry) playEntry(currentEntry, true)
  }

  function chooseReviewAccent(accent: VocabularyAccent) {
    setReviewAccent(accent)
    setPrintAccent(accent)
    saveVocabularyAudioAccent(accent, activeProgramId)
  }

  function chooseVocabularyProgram(programId: string) {
    if (programId === activeProgramId || runState === 'active') return
    reviewAudioRef.current?.pause()
    reviewAudioRef.current = null
    syncVocabularySetRoute(null)
    setVocabularySet(null)
    setShareId(null)
    setRequestError('')
    setProgressExplorerOpen(false)
    setActiveProgramId(programId)
    window.localStorage.setItem(LAST_PROGRAM_STORAGE_KEY, programId)
    replaceVocabularyProgramUrl(programId)
  }

  const currentGlobalOrder = currentEntry?.source.globalOrder ?? program.entries.length
  const vocabularySetTitleControl = vocabularySet ? (
    // 字段构件第二轮（2026-11-15）：换成 shared-ui/TextField（大号 36），「保存名称」跟在框后面（trailing），字没改。
    // 构件厂第 4 步第十页没换这个键：原来它被旁边高 38 的输入框拉成 38；输入框换成 36 以后它跟着是 36（全站 .ghost-button 的高），键本身没动。
    <TextField
      className="vocabulary-set-title-control"
      id="vocabulary-set-title"
      label="单词纸名称"
      // 过生词改版②（2026-11-17）：名字框就是生词组的标题，标签只给读屏；「保存名称」改了名才出现。
      hideLabel
      size="lg"
      value={setTitleInput}
      maxLength={30}
      onChange={(event) => setSetTitleInput(event.target.value)}
      trailing={setTitleInput.trim() && setTitleInput.trim() !== vocabularySet.title ? (
        <Button tone="quiet" size="sm" onClick={() => void saveVocabularySetTitle()} disabled={requestBusy}>
          保存名称
        </Button>
      ) : undefined}
    />
  ) : null
  const printAccentControl = vocabularySet ? (
    <SelectField
      className="vocabulary-print-accent-control"
      label="下载读音"
      layout="inline"
      size="md"
      value={printAccent}
      onChange={(event) => {
        const accent = event.target.value as VocabularyAccent
        setPrintAccent(accent)
        saveVocabularyAudioAccent(accent, activeProgramId)
      }}
      options={[{ value: 'american', label: '美式' }, { value: 'british', label: '英式' }]}
    />
  ) : null
  const downloadControl = vocabularySet ? (
    <div className="vocabulary-download-menu" ref={downloadMenuRef}>
      {/* 构件厂第 4 步第十页：原 .primary-button（石板墨填充、高 32）= solid md。
          等待第四轮（2026-11-15）：生成中原来换字「正在生成…」+ 整键禁用，改成 busy——字不换、宽度不变；
          下载图标自己会演（DownloadFeedbackIcon working），所以 iconShowsBusy，键上不另出所以点。 */}
      <Button
        tone="solid"
        size="md"
        aria-expanded={downloadMenuOpen}
        // 弹出类（第 18 条）：solid 本来不归「打开着垫底」管，挂上只是标明类别，样子不变。
        data-opens-popup=""
        aria-controls="vocabulary-download-options"
        onClick={() => setDownloadMenuOpen((open) => !open)}
        busy={pdfDownloadBusy}
        iconShowsBusy
        icon={<DownloadFeedbackIcon size={16} working={pdfDownloadBusy} />}
      >
        下载
      </Button>
      {downloadMenuOpen && (
        <FluidHoverList as="div" id="vocabulary-download-options" role="group" aria-label="选择下载内容" axis="y" itemSelector=".vocabulary-download-option">
          {VOCABULARY_DOWNLOAD_OPTIONS.map((option) => (
            <div className="vocabulary-download-option" key={option.kind}>
              <button type="button" onClick={() => void downloadVocabularySheet(option.kind)}>
                <strong>{option.label}</strong><span>{option.description}</span>
              </button>
              <button
                type="button"
                className="vocabulary-download-save-as"
                aria-label={`${option.label}另存为`}
                onClick={() => void downloadVocabularySheet(option.kind, 'save-as')}
              >
                <Save size={14} aria-hidden="true" />另存为…
              </button>
            </div>
          ))}
          <div className="vocabulary-download-option is-bundle">
            <button type="button" onClick={() => void downloadVocabularyBundle()}>
              <strong>下载全套</strong><span>四份 PDF 打包为一个 ZIP</span>
            </button>
            <button
              type="button"
              className="vocabulary-download-save-as"
              aria-label="全套资料另存为"
              onClick={() => void downloadVocabularyBundle('save-as')}
            >
              <Save size={14} aria-hidden="true" />另存为…
            </button>
          </div>
        </FluidHoverList>
      )}
    </div>
  ) : null
  const shareDownloadConfirmation = pendingShareDownload ? (
    <div className="vocabulary-share-download-confirmation" aria-live="polite">
      <div>
        <strong>这份文件需要公开二维码</strong>
        <span>继续后会生成同一个匿名分享：单词卡扫码听音频，听写纸扫码自动听写；只有拿到二维码的人可以打开，你也可以随时撤销。</span>
      </div>
      <div>
        {/* 构件厂第 4 步第十页：两个键原来都被这一排拉成高 36，所以石板墨那个也用 lg。 */}
        <Button tone="strong" size="lg" onClick={() => setPendingShareDownload(null)}>取消</Button>
        <Button
          tone="solid"
          size="lg"
          onClick={() => void (pendingShareDownload.kind === 'bundle'
            ? downloadVocabularyBundle(pendingShareDownload.mode, { shareConfirmed: true })
            : downloadVocabularySheet(pendingShareDownload.kind, pendingShareDownload.mode, { shareConfirmed: true }))}
        >
          {pendingShareDownload.mode === 'save-as' ? '生成链接并另存为…' : '生成链接并下载'}
        </Button>
      </div>
    </div>
  ) : null
  // 过生词改版②（Owner 2026-11-17 定方向）：生词组一张卡——名字（可改）、一行状态、词表、一排动作。
  // 收满后生成的和从「最近生词组」重新打开的是同一张，只有最右边那个键不同（接着过下一轮 / 返回）。
  const renderVocabularySetPanel = (set: VocabularySetDto, closing: React.ReactNode) => (
    <section className="vocabulary-set-panel" aria-labelledby="vocabulary-set-reopen-title">
      {/* 标题给读屏和页内跳转用；眼睛看到的标题就是下面能改名的框。 */}
      <h2 id="vocabulary-set-reopen-title" className="visually-hidden">{set.title}</h2>
      <div className="vocabulary-set-head">
        <BookMarked size={24} aria-hidden="true" />
        {vocabularySetTitleControl}
      </div>
      <div className="vocabulary-set-meta">
        <span>{set.entryCount} 个词</span>
        {shareId ? (
          <>
            <span className="vocabulary-set-share-on"><QrCode size={14} aria-hidden="true" />扫码可听音频、自动听写</span>
            <Button tone="quiet" size="sm" disabled={shareClipboard.state === 'pending'} aria-busy={shareClipboard.state === 'pending'} onClick={() => void copyShareLink()} icon={<CopyFeedbackIcon size={14} state={shareClipboard.state} />}>
              {shareCopyStatus === 'copied' ? '链接已复制' : shareCopyStatus === 'error' ? '复制失败' : '复制公开链接'}
            </Button>
            <Button tone="quiet" size="sm" onClick={() => void revokeShare()} disabled={requestBusy}>撤销二维码</Button>
          </>
        ) : (
          <>
            <span>二维码未公开</span>
            <Button tone="quiet" size="sm" icon={<QrCode size={14} />} onClick={() => void createShare()} disabled={requestBusy}>生成公开二维码</Button>
          </>
        )}
      </div>
      <div className="vocabulary-set-list-heading">
        <span>词表</span>
        <Button tone="quiet" size="sm" className="vocabulary-collected-copy" onClick={() => void copyVocabularySet()} disabled={listClipboard.state === 'pending'} aria-busy={listClipboard.state === 'pending'} icon={<CopyFeedbackIcon size={14} state={listClipboard.state} />}>
          {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制清单'}
        </Button>
      </div>
      <ol className="vocabulary-set-list">
        {printEntries.map((entry) => (
          <li key={entry.id}><strong>{entry.headword}</strong><span>{getCoreMeanings(entry)[0] ?? ''}</span></li>
        ))}
      </ol>
      <div className="vocabulary-set-actions">
        {printAccentControl}
        {downloadControl}
        <Button tone="quiet" icon={<Grid2X2 size={16} />} onClick={() => props.onOpenVocabularyPractice(set.id)}>趣味练习</Button>
        <Button tone="quiet" icon={<WordBubble size={16} />} onClick={() => props.onOpenVocabularyDictationWorkbench(set.id)}>看词说义</Button>
        <span className="vocabulary-set-actions-spacer" aria-hidden="true" />
        {closing}
      </div>
      {shareDownloadConfirmation}
      {requestError ? <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>
        : pdfDownloadSlow ? <Notice kind="waiting" className="vocabulary-download-wait">正在生成，比平时慢，可以先去做别的</Notice> : null}
    </section>
  )
  const handwritingSelector = handwritingSelectionMode && vocabularySet ? (
    <VocabularyHandwritingSelector
      title={setTitleInput.trim() || vocabularySet.title}
      entries={printEntries}
      busy={pdfDownloadBusy}
      // 打开它的是下载菜单里的项，菜单这时已收起；关上后焦点回到「下载」键。
      returnFocus={() => downloadMenuRef.current?.querySelector<HTMLElement>('button')}
      onCancel={() => setHandwritingSelectionMode(null)}
      onConfirm={(selectedEntryIds, practiceMode) => {
        const saveMode = handwritingSelectionMode
        setHandwritingSelectionMode(null)
        void downloadVocabularySheet('handwriting', saveMode, {
          selectedEntryIds,
          handwritingMode: practiceMode,
        })
      }}
    />
  ) : null
  const embeddedPrintState = printRequest
    ? printLoadState === 'error' || programLoadState === 'error'
      ? 'error'
      : printLoadState === 'ready'
        && programLoadState === 'ready'
        && printPages.length > 0
        ? 'ready'
        : 'loading'
    : undefined

  return (
    <div className="vocabulary-review-page" data-vocabulary-print-state={embeddedPrintState} {...iconMotionInput}>
      <AppTopbar
        variant="sub"
        pageTitle="过生词"
        onBack={props.onBackToWorkbench}
        {...props.shellNav}
      />

      <main className="vocabulary-review-shell" aria-label="过生词">
        <header className="vocabulary-review-heading">
          {/* 过生词改版第一步（Owner 2026-11-17 看过可点样张后定「一屏只突出词卡」）：页头压成一行。
              原来标题下那句「· 按原书顺序逐词判断…」是开发口吻，删掉；课程名留作标题。 */}
          <h1>{programLoadState === 'ready' ? program.title : '中考词汇一轮'}</h1>
          {/* 词库还没读到（或读不出）时标题是写死的，跟一行小字说明是哪套词库，免得老师以为退回了 30 词样本。 */}
          {programLoadState !== 'ready' && <p className="vocabulary-review-heading-note">万唯一轮完整1600词 · 读完词库后显示进度</p>}
          {headingSkeletonPending ? (
            <HeadingActionsSkeleton
              showSkeleton={progressOpeningPhase === 'waiting'}
              withProgramSwitcher={programs.length > 1}
              printMode={Boolean(printRequest)}
            />
          ) : programLoadState === 'ready' && studentsState === 'ready' && activeStudent && (
            <div className="vocabulary-heading-actions">
              {!printRequest && (
                <Button tone="quiet" size="md" className="vocabulary-heading-review-link" icon={<BoardCheck size={16} />} onClick={() => props.onOpenVocabularyDictationWorkbench()}>
                  单词复习
                </Button>
              )}
              {programs.length > 1 && (
                // 字段构件第二轮（2026-11-15）：课程、学生两个下拉和「学生姓名」换成 shared-ui/Field（大号 36），字没改；
                // 读屏名字照旧是 aria-label（「切换词汇课程」「切换当前学生」，看得见的标签在名字里）。
                <SelectField
                  className="vocabulary-program-switcher"
                  label="词汇课程"
                  hideLabel
                  size="md"
                  aria-label="切换词汇课程"
                  value={activeProgramId}
                  disabled={requestBusy || runState === 'active'}
                  onChange={(event) => chooseVocabularyProgram(event.target.value)}
                  options={programs.map((item) => ({ value: item.id, label: item.title }))}
                />
              )}
              <div className="vocabulary-student-switcher">
                <SelectField
                  className="vocabulary-student-picker"
                  label="当前学生"
                  hideLabel
                  size="md"
                  aria-label="切换当前学生"
                  value={activeStudentId ?? ''}
                  disabled={requestBusy}
                  onChange={(event) => setActiveStudentId(event.target.value)}
                  options={students.map((student) => ({ value: student.id, label: student.displayName }))}
                />
                {/* 描边键不再单做一种（Owner 2026-11-14 决定 #2）：墨字大号，类名留着当挂钩。 */}
                <Button
                  tone="quiet"
                  size="md"
                  className="vocabulary-student-add-button"
                  aria-expanded={studentCreateOpen}
                  onClick={() => {
                    setStudentCreateOpen((current) => !current)
                    setStudentNameInput('')
                    setStudentFormError('')
                  }}
                >
                  {studentCreateOpen ? '取消' : '新建学生'}
                </Button>
              </div>
              {studentCreateOpen && (
                <form className="vocabulary-student-create" onSubmit={(event) => { event.preventDefault(); void createStudentProfile() }}>
                  {/* 出错照字段构件的写法：框边变危险色、aria-invalid，出错那一行挂 aria-describedby，字不改。
                      按「保存」以后出错要马上念：用字段的 announce（出错那一行自己在播报区里，2026-11-15 起），
                      不再另放一句只给读屏的 role=alert，读屏逐行读时不会念两遍。 */}
                  <TextField
                    className="vocabulary-student-name-field"
                    id="vocabulary-student-name"
                    label="学生姓名"
                    size="lg"
                    error={studentFormError || undefined}
                    announce
                    value={studentNameInput}
                    maxLength={30}
                    autoComplete="off"
                    autoFocus
                    placeholder="例如：小林"
                    onChange={(event) => setStudentNameInput(event.target.value)}
                    trailing={<Button tone="strong" size="lg" type="submit" className="vocabulary-student-save" disabled={requestBusy || !studentNameInput.trim()}>保存</Button>}
                  />
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
                  <Button
                    tone="quiet"
                    size="sm"
                    className="vocabulary-progress-toggle"
                    aria-expanded={progressExplorerOpen}
                    aria-controls="vocabulary-progress-explorer"
                    onClick={toggleProgressExplorer}
                  >
                    {progressExplorerOpen ? '收起进度' : '查看 / 调整进度'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </header>

        {programLoadState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-program-error-title">
            <VocabularyReview size={32} aria-hidden="true" />
            <h2 id="vocabulary-program-error-title">词库没有加载出来</h2>
            <p>为了不把进度记错，要等词库加载完才能开始。</p>
            <Button tone="solid" onClick={() => window.location.reload()}>重新加载</Button>
            {requestError && <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>}
          </section>
        ) : studentsState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-student-error-title">
            <VocabularyReview size={32} aria-hidden="true" />
            <h2 id="vocabulary-student-error-title">学生档案没有加载出来</h2>
            <p>为了不把不同学生的进度混在一起，要等档案加载完才能继续。</p>
            <Button tone="solid" onClick={() => window.location.reload()}>重新加载</Button>
            {requestError && <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>}
          </section>
        ) : progressLoading || progressOpeningPhase === 'waiting' ? (
          <RunSetupSkeleton showSkeleton={progressOpeningPhase === 'waiting'} />
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
          renderVocabularySetPanel(vocabularySet, <Button tone="quiet" onClick={closeVocabularySet}>返回</Button>)
        ) : runState === 'setup' || runState === 'error' ? (
          <section className="vocabulary-run-setup" aria-labelledby="vocabulary-run-title">
            <VocabularyReview size={32} aria-hidden="true" />
            <h2 id="vocabulary-run-title">这轮准备收多少个生词？</h2>
            <p>
              {runId
                ? `进度已保存，将从第 ${reviewState.cursor + 1} 词继续，直到收满本轮目标。`
                : '可选 1–60 个。第一次默认 15，以后会记住上次目标。'}
            </p>
            {/* 过生词改版②（2026-11-17）：目标数和读音并成一排，下面一个撑满的「开始过词」，再下面一行写从哪个词开始。 */}
            <div className="vocabulary-run-start-row">
              <TextField
                className="vocabulary-run-target"
                label="目标生词数"
                size="lg"
                type="number"
                min="1"
                max="60"
                step="1"
                value={targetInput}
                disabled={Boolean(runId)}
                onChange={(event) => setTargetInput(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
              />
              {/* 切换组那一轮（2026-11-15）：SegmentedField（单选组，一个 Tab 位，方向键切换）。 */}
              <SegmentedField
                className="vocabulary-review-accent-control"
                label="过词读音"
                value={reviewAccent}
                options={REVIEW_ACCENT_OPTIONS}
                onChange={chooseReviewAccent}
              />
            </div>
            <Button tone="solid" size="lg" className="vocabulary-run-start" onClick={() => void startReview()} disabled={requestBusy || (!runId && mainProgressCursor >= program.entries.length)}>
              {runId ? '继续过词' : '开始过词'}
            </Button>
            {!runId && mainProgressEntry && (
              <p className="vocabulary-run-from">
                <span>从 <strong>{mainProgressEntry.headword}</strong>（Day {mainProgressEntry.source.group} · 第 {mainProgressCursor + 1} 词）开始</span>
                <Button tone="quiet" size="sm" onClick={toggleProgressExplorer}>换一个</Button>
              </p>
            )}
            <div className="vocabulary-direct-set">
              <div className="vocabulary-direct-set-heading">
                <h3>已有单词？直接生成词表</h3>
                <span>只匹配当前课程已入库的 {program.entries.length} 词</span>
              </div>
              <TextAreaField
                className="vocabulary-direct-set-input"
                id="vocabulary-direct-set-input"
                label="用中文逗号隔开"
                size="lg"
                rows={4}
                value={directVocabularyInput}
                placeholder="about，advice，accept"
                onChange={(event) => setDirectVocabularyInput(event.target.value)}
              />
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
              <Button
                tone="strong"
                size="lg"
                onClick={() => void generateVocabularySetFromInput()}
                disabled={requestBusy || !directInputResult.matchedEntries.length || directInputOverLimit}
              >
                生成固定词组
              </Button>
            </div>
            {requestError && <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>}
            {recentSets.length > 0 && (
              <div className="vocabulary-recent-sets">
                <div><h3>最近生词组</h3><span>内容固定，可随时下载</span></div>
                <FluidHoverList as="ul" className="vocabulary-recent-set-list" axis="y" itemSelector="button">
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
                </FluidHoverList>
              </div>
            )}
          </section>
        ) : <div className="vocabulary-review-layout">
          <section className="vocabulary-review-stage" aria-live="polite">
            {completion === 'active' && currentEntry ? (
              <>
                {/* 过生词改版第一步：左栏 Day 列表收成面包屑（第几周 › Day › 阶段 · 词序），右栏「本轮生词」收成词卡上方一条进度
                    和词卡下方一排小标签。原来左栏底下「来源索引、页码与标题证据已复核」是开发口吻，删掉。 */}
                <div className="vocabulary-stage-meta">
                  <p className="vocabulary-run-crumb">
                    <span>第{currentWeek}周</span>
                    <ChevronRight size={12} aria-hidden="true" />
                    <span>Day {currentEntry.source.group}</span>
                    <span className="vocabulary-run-crumb-stage">{currentStageLabel}</span>
                    <span>词序 {currentGlobalOrder} / {program.entries.length}</span>
                  </p>
                  <Button tone="quiet" size="sm" className="vocabulary-stage-pause" icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={pauseReview} disabled={requestBusy}>
                    暂停并返回
                  </Button>
                </div>
                <div className="vocabulary-run-collect">
                  <span id="vocabulary-run-collect-label">收下 <strong>{unfamiliarEntries.length}</strong> / {reviewState.targetUnfamiliarCount}</span>
                  <progress aria-labelledby="vocabulary-run-collect-label" max={reviewState.targetUnfamiliarCount} value={unfamiliarEntries.length} />
                </div>
                <article className="vocabulary-word-card">
                <div className="vocabulary-word-block">
                  <h2>{currentEntry.headword}</h2>
                  <span>{currentEntry.partOfSpeech}</span>
                  {/* Owner 2026-11-14 第 21 条：换成 Button 次要灰中号（subtle md），去掉描边。Button 的文字键不收 aria-label，
                      原来 aria-label 给的读屏名字「重播 X 的美音 / 英音」改由只给读屏看的字拼出来（同 A2 批外链键的办法）；
                      「空格」键帽只给眼睛看（aria-hidden），不进名字，和原来 aria-label 盖掉它时一样。 */}
                  <Button
                    tone="subtle"
                    size="md"
                    className="vocabulary-word-replay"
                    icon={<VolumeFeedbackIcon size={16} state={audioIcon.stateFor(currentEntry.id)} />}
                    onClick={playCurrentEntry}
                  >
                    重播<span className="visually-hidden"> {currentEntry.headword} 的{reviewAccent === 'american' ? '美音' : '英音'}</span>
                    <kbd aria-hidden="true">空格</kbd>
                  </Button>
                </div>

                {reviewState.revealed ? (
                  <div className="vocabulary-revealed-card">
                    <VocabularyVisual entry={currentEntry} />
                    <div className="vocabulary-sense-block">
                      <Button
                        tone="subtle"
                        size="md"
                        className="vocabulary-pronunciation"
                        icon={<VolumeFeedbackIcon size={16} state={audioIcon.stateFor(currentEntry.id)} />}
                        onClick={playCurrentEntry}
                        title={`播放${reviewAccent === 'american' ? '美音' : '英音'}`}
                      >
                        {currentEntry.phonetics?.[reviewAccent] ?? currentEntry.phonetic}
                      </Button>
                      <div className="vocabulary-core-meanings">
                        <span>{currentEntry.partOfSpeech}</span>
                        <p>{formatCoreMeanings(currentEntry)}</p>
                      </div>
                      <VocabularyPronunciationGuide entry={currentEntry} accent={reviewAccent} />
                      <VocabularyExample entry={currentEntry} />
                    </div>
                  </div>
                ) : (
                  <button className="vocabulary-reveal-prompt" type="button" onClick={reveal}>
                    <Eye size={20} />
                    <span>先让孩子自己认，认不出再看提示</span>
                  </button>
                )}
                  {/* 老师才看的词条信息（频序、考频、释义状态…）不再印在孩子的卡上，收进右上角 ⓘ（Owner 2026-11-17 定）。 */}
                  <div className="vocabulary-entry-info" ref={entryInfoRef}>
                    <Button
                      tone="quiet"
                      size="sm"
                      className="vocabulary-entry-info-toggle"
                      icon={<InfoCircle size={16} aria-hidden="true" />}
                      label="词条信息（给老师看）"
                      aria-expanded={entryInfoOpen}
                      aria-controls="vocabulary-entry-info-panel"
                      onClick={() => setEntryInfoOpen(!entryInfoOpen)}
                    />
                    {entryInfoOpen && (
                      <div className="vocabulary-entry-info-panel" id="vocabulary-entry-info-panel">
                        <dl>
                          {currentEntry.source.metadata?.frequencyRank && (
                            <div>
                              <dt>频序</dt>
                              <dd>第 {currentEntry.source.metadata.frequencyRank} 词</dd>
                            </div>
                          )}
                          {currentEntry.source.metadata?.frequencyStage && (
                            <div>
                              <dt>频率</dt>
                              <dd>{frequencyStageLabel(currentEntry.source.metadata.frequencyStage)}</dd>
                            </div>
                          )}
                          {currentEntry.source.metadata?.curriculumTag && (
                            <div>
                              <dt>课标</dt>
                              <dd>{curriculumTagLabel(currentEntry.source.metadata.curriculumTag)}</dd>
                            </div>
                          )}
                          {currentEntry.source.metadata?.sourceGroup && (
                            <div>
                              <dt>源书组</dt>
                              <dd>No. {currentEntry.source.metadata.sourceGroup}</dd>
                            </div>
                          )}
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
                    )}
                  </div>
                </article>

                {/* 四个一样大的键改成两大两小：认识 / 不认识收下 是孩子每个词都要按的，放大；
                    「上一个」「看提示」降成小字键。快捷键不变。第一个词「上一个」按不了时只留位置不显示。 */}
                <div className="vocabulary-decision-controls" aria-label="过词判断">
                  <div className="vocabulary-decision-main">
                    <button className="vocabulary-control vocabulary-control-known" type="button" onClick={() => decide('known')} disabled={requestBusy}>
                      <Check size={20} />
                      <span>认识</span>
                      <kbd>Enter</kbd>
                    </button>
                    <button className="vocabulary-control vocabulary-control-unfamiliar" type="button" onClick={() => decide('unfamiliar')} disabled={requestBusy}>
                      <BookMarked size={20} />
                      <span>不认识，收下</span>
                      <kbd>Shift</kbd>
                    </button>
                  </div>
                  <div className="vocabulary-decision-minor">
                    <button className="vocabulary-control vocabulary-control-back" type="button" onClick={undo} disabled={!reviewState.decisionOrder.length}>
                      <RotateCcw size={14} />
                      <span>上一个</span>
                      <kbd>Delete</kbd>
                    </button>
                    {!reviewState.revealed && (
                      <button className="vocabulary-control vocabulary-control-reveal" type="button" onClick={reveal}>
                        <Eye size={14} />
                        <span>看提示</span>
                        <kbd>→</kbd>
                      </button>
                    )}
                  </div>
                </div>
                {requestError && <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>}
              </>
            ) : (
              vocabularySet ? renderVocabularySetPanel(vocabularySet, (
                <Button tone="quiet" icon={<RotateCcw size={16} />} onClick={() => void startAnotherReview()} disabled={requestBusy}>接着过下一轮</Button>
              )) : (
              <div className="vocabulary-completion-state">
                <BookMarked size={32} aria-hidden="true" />
                <h2>{completion === 'target-reached' ? `已收满 ${reviewState.targetUnfamiliarCount} 个生词` : '当前词汇已过完'}</h2>
                <p>
                  本轮共判断 {reviewState.decisionOrder.length} 词：认识 {knownCount} 词，收下 {unfamiliarEntries.length} 词。
                </p>
                {unfamiliarEntries.length > 0 && (
                  <ol className="vocabulary-set-list">
                    {unfamiliarEntries.map((entry) => (
                      <li key={entry.id}><strong>{entry.headword}</strong><span>{getCoreMeanings(entry)[0] ?? ''}</span></li>
                    ))}
                  </ol>
                )}
                {/* 过生词改版②：收满只有一个主键；复制、下一轮退成字键。 */}
                <Button tone="solid" size="lg" className="vocabulary-completion-primary" icon={<BookMarked size={16} />} onClick={() => void generateVocabularySet()} disabled={!unfamiliarEntries.length || requestBusy}>
                  生成固定生词组
                </Button>
                <div className="vocabulary-completion-minor">
                  <Button tone="quiet" onClick={() => void copyVocabularySet()} disabled={!unfamiliarEntries.length || listClipboard.state === 'pending'} aria-busy={listClipboard.state === 'pending'} icon={<CopyFeedbackIcon size={16} state={listClipboard.state} />}>
                    {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制清单'}
                  </Button>
                  <Button tone="quiet" icon={<RotateCcw size={16} />} onClick={() => void startAnotherReview()} disabled={requestBusy}>
                    接着过下一轮
                  </Button>
                </div>
                {requestError && <Notice kind="error" className="vocabulary-request-error" danger={requestError === unsavedError}>{requestError}</Notice>}
              </div>
              )
            )}
          </section>

          {completion === 'active' && unfamiliarEntries.length > 0 && (
            <section className="vocabulary-collected" aria-labelledby="vocabulary-collected-title">
              <div className="vocabulary-collected-heading">
                <h2 id="vocabulary-collected-title">本轮生词 {unfamiliarEntries.length} / {reviewState.targetUnfamiliarCount}</h2>
                <Button tone="quiet" size="sm" className="vocabulary-collected-copy" onClick={() => void copyVocabularySet()} disabled={listClipboard.state === 'pending'} aria-busy={listClipboard.state === 'pending'} icon={<CopyFeedbackIcon size={14} state={listClipboard.state} />}>
                  {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'}
                </Button>
              </div>
              <ol className="vocabulary-collected-list">
                {unfamiliarEntries.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.headword}</strong>
                    <small>{getCoreMeanings(entry)[0] ?? ''}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>}
      </main>

      {handwritingSelector}

      <section className={`vocabulary-print-sheet is-${printRequest?.kind ?? 'cards'}`} aria-hidden="true">
        {printRequest?.kind === 'handwriting' ? (
          <VocabularyHandwritingPrint
            title={vocabularySet?.title ?? '生词衡水体练字纸'}
            entryCount={printEntries.length}
            pages={printPages}
            mode={printHandwritingMode}
          />
        ) : printPages.map(({ entries: pageEntries, title: pageTitle, startIndex: pageStartIndex }, pageIndex) => (
          printRequest?.kind === 'dictation' || printRequest?.kind === 'answer' ? (
            <div className="vocabulary-print-page vocabulary-dictation-print-page" key={`print-page-${pageIndex + 1}`}>
              <header className="vocabulary-dictation-print-header">
                <div>
                  <h1>{pageTitle || vocabularySet?.title || '生词听写纸'}</h1>
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
                      const number = pageStartIndex + columnOffset + entryIndex + 1
                      return (
                        <div className="vocabulary-dictation-print-row" role="row" key={`${entry.id}-${entryIndex}`}>
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
                  <h1>{pageTitle || vocabularySet?.title || '生词记忆纸'}</h1>
                  <p>看图 · 分音节 · 放进句子里</p>
                </div>
                <div className="vocabulary-print-key" aria-label="拆分说明">
                  <span><strong>拆分</strong> 按音节或词形拆拼写</span>
                  <span><strong>读音</strong> {printAccent === 'american' ? '美式' : '英式'}整词与分节一致</span>
                </div>
              </header>
              <div className="vocabulary-print-grid">
                {pageEntries.map((entry, entryIndex) => (
                  <article className={`vocabulary-print-entry${entry.headword.length > 32 ? ' has-long-headword' : ''}`} key={`${entry.id}-${entryIndex}`}>
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
                  <aside className="vocabulary-print-qr" aria-label={printShareKind === 'dictation' ? '扫码自动听写二维码' : '扫码听音频二维码'}>
                    <QRCodeSVG
                      value={printShareKind === 'dictation'
                        ? `${PUBLIC_LISTEN_ORIGIN}/vocabulary/dictation/${shareId}?accent=${printAccent}`
                        : `${PUBLIC_LISTEN_ORIGIN}/vocabulary/listen/${shareId}`}
                      size={72}
                      level="M"
                      marginSize={0}
                      title={printShareKind === 'dictation' ? '扫码自动听写' : '扫码听音频'}
                    />
                    <span>{printShareKind === 'dictation' ? '扫码自动听写' : '扫码听音频'}</span>
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
