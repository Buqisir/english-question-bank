import {
  BookOpen,
  ClipboardList,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { questionGroups as sampleQuestionGroups } from './data/sampleQuestionGroups'
import {
  groupTypeLabel,
  type QuestionGroupCard,
  type QuestionGroupDetail,
  type VerifyQuestionGroupResult,
  type ReadingParseQuestionGroupResult,
  type ClozeParseQuestionGroupResult,
  type SevenChoicesParseQuestionGroupResult,
  type GrammarParseQuestionGroupResult,
  type VerifyResult,
} from './domain/questionBank'
import { usePaperDraft } from './paperAssembly/usePaperDraft'
import type { PaperDraftEditReason } from './paperAssembly/paperDraftModel'
import { ConciergeDesk } from './concierge/ConciergeDesk'
import { parsePaperIdFromHref } from './concierge/paperSurfaceHref'
import { useConciergeDesk } from './concierge/useConciergeDesk'
import { usePaperExports } from './paperAssembly/usePaperExports'
import {
  deleteQuestionGroup as deleteQuestionGroupRequest,
  fetchQuestionGroupDetail,
  fetchQuestionGroups,
  backfillTopicLabels,
  type BackfillTopicLabelsResult,
} from './services/questionGroups'
import { PaperIntelligencePreview } from './features/paper-intelligence/PaperIntelligencePreview'
import type { PaperIntelligenceRouteMatch } from './features/paper-intelligence/paperIntelligenceRoute'
// Issue #21-C1: PaperSurface harness replaces the old prototype on
// `?view=paper-intelligence&surface=paper`. Default PI route is
// unchanged when the surface field is absent. There is no compat
// branch for the legacy `surface=print` value — it falls back to
// default like any other unknown surface.
import { PaperIntelligencePaperSurfaceHarness } from './features/paper-intelligence/PaperIntelligencePaperSurfaceHarness'
import { PaperBrowsePage } from './features/paper-browse/PaperBrowsePage'
import { DraftPaperWorkbench } from './features/draft-paper/DraftPaperWorkbench'
import { MySpacePage } from './features/my-space/MySpacePage'
import { AdminWorkbench } from './features/admin/AdminWorkbench'
import { AppTopbar, type AppTopbarNav } from './components/AppTopbar'
import { addGroupToCurrentDraftPaper as addGroupToCurrentDraftPaperRequest } from './services/draftPapers'
import { useCurrentUser, useIsOwnerView } from './auth/AuthGate.tsx'
import { logout } from './auth/session.ts'
import { EntryModal } from './workbench/EntryModal'
import { QuestionGroupDetailView } from './features/question-detail/QuestionGroupDetailView'

const DEEPSEEK_MODELS = [
  { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash（推荐）' },
  { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro（高性能）' },
] as const

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-v4-flash',
}

function normalizeAiModel(value: string) {
  const rawModel = String(value || '').trim()
  if (!rawModel) return DEEPSEEK_MODELS[0].value
  const normalized = rawModel.toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
  return DEEPSEEK_MODEL_ALIASES[normalized] || DEEPSEEK_MODELS[0].value
}

const DEFAULT_AI_MODEL = DEEPSEEK_MODELS[0].value

function buildGrammarVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: GrammarParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toLowerCase()
    const storedAnswer = String(question.answer || '').trim().toLowerCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

function buildClozeVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: ClozeParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toUpperCase()
    const storedAnswer = String(question.answer || '').trim().toUpperCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

function buildSevenChoicesVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: SevenChoicesParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toUpperCase()
    const storedAnswer = String(question.answer || '').trim().toUpperCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

// flow-panel 刀 3: openPaperBrowse's入口带态 options bag. A named type (not
// an inline `{ }` literal in the callback's parameter list) — an inline
// literal would put a `{` before the callback body and break
// verify-paper-browse.mjs's `[^{]*\{` body-extraction regex.
type OpenPaperBrowseOptions = { questionId?: string | null; lecture?: boolean; similar?: boolean }

function App({ piRoute }: { piRoute: PaperIntelligenceRouteMatch }) {
  // ─── Cut C: in-app PI ↔ workbench navigation ───
  // main.tsx parses the URL once at boot and passes the result in via the
  // `piRoute` prop. That snapshot can never change after mount on its own,
  // so we keep an internal `currentPiRoute` mirror that the App actually
  // reads. `onBackToWorkbench` (below) flips this mirror to `{ kind: 'none' }`
  // and rewrites the URL via `history.replaceState` — no full page reload,
  // no `window.location.href` assignment, no `window.location.reload`.
  // Workbench fetch effects depend on `currentPiRoute.kind` so they fire
  // exactly once when the user returns from PI.
  const currentUser = useCurrentUser()
  // M0-3 (docs/cuts/m0-3-role-gate/plan.md 2b): AuthGate is the only place that
  // translates open-mode/owner/member into this boolean — consume it directly,
  // never re-derive from `currentUser`.
  const isOwnerView = useIsOwnerView()
  const [currentPiRoute, setCurrentPiRoute] = useState<PaperIntelligenceRouteMatch>(piRoute)
  const [adminRouteActive, setAdminRouteActive] = useState(() => {
    if (!isOwnerView) return false
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'admin'
  })
  const [mySpaceRouteActive, setMySpaceRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'my-space'
  })
  const [draftPaperRoute, setDraftPaperRoute] = useState(() => {
    if (typeof window === 'undefined') {
      return { active: false, draftPaperId: null as string | null, focusGroupId: null as string | null }
    }
    const params = new URLSearchParams(window.location.search)
    return {
      active: params.get('view') === 'draft-paper',
      draftPaperId: params.get('draftPaperId'),
      focusGroupId: params.get('focusGroupId'),
    }
  })
  // 刀B 整卷预览页 (paper-browse): `?view=paper-browse&paperId=<id>
  // [&focusGroupId=<gid>][&questionId=<qid>][&lecture=1]`. Same
  // boot-read-URL-once pattern as draftPaperRoute/mySpaceRouteActive above.
  // flow-panel 刀 3 adds questionId/lecture — carries the入口带态 (讲评态
  // open + predetermined 题) through a full page load, and is also what the
  // popstate handler below replays on Back/Forward.
  const [paperBrowseRoute, setPaperBrowseRoute] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        active: false,
        paperId: null as string | null,
        focusGroupId: null as string | null,
        questionId: null as string | null,
        lecture: false,
        similar: false,
      }
    }
    const params = new URLSearchParams(window.location.search)
    return {
      active: params.get('view') === 'paper-browse',
      paperId: params.get('paperId'),
      focusGroupId: params.get('focusGroupId'),
      questionId: params.get('questionId'),
      lecture: params.get('lecture') === '1',
      similar: params.get('similar') === '1',
    }
  })
  const [questionGroups, setQuestionGroups] = useState<QuestionGroupCard[]>([])
  const [dataStatus, setDataStatus] = useState<'loading' | 'sqlite' | 'sample'>('loading')
  // Edit-status orchestration is forwarded into usePaperDraft via a ref so the
  // hook can be created BEFORE paperExports / saveStatus / previewStatus
  // setters exist in this scope. The ref is wired up below as soon as the
  // dependent state is in place.
  const draftEditedHandlerRef = useRef<(reason: PaperDraftEditReason) => void>(() => {})
  const paperDraft = usePaperDraft({
    onDraftEdited: (reason) => draftEditedHandlerRef.current(reason),
  })
  const {
    basket,
    paperBlocks,
    openInsertionIndex,
    paperTitle,
    questionNumberStart,
    paperExportStyle,
    versionType,
  } = paperDraft
  const [isEntryOpen, setEntryOpen] = useState(false)
  const [entryInitialDetail, setEntryInitialDetail] = useState<QuestionGroupDetail | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [selectedDetail, setSelectedDetail] = useState<QuestionGroupDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyQuestionGroupResult | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [verifyError, setVerifyError] = useState('')
  const [clozeParseResult, setClozeParseResult] = useState<ClozeParseQuestionGroupResult | null>(null)
  const [clozeParseStatus, setClozeParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [clozeParseError, setClozeParseError] = useState('')
  const [clozeParseSaveStatus, setClozeParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [clozeParseSaveError, setClozeParseSaveError] = useState('')
  const [sevenChoicesParseResult, setSevenChoicesParseResult] = useState<SevenChoicesParseQuestionGroupResult | null>(null)
  const [sevenChoicesParseStatus, setSevenChoicesParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [sevenChoicesParseError, setSevenChoicesParseError] = useState('')
  const [sevenChoicesParseSaveStatus, setSevenChoicesParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [sevenChoicesParseSaveError, setSevenChoicesParseSaveError] = useState('')
  const [grammarParseResult, setGrammarParseResult] = useState<GrammarParseQuestionGroupResult | null>(null)
  const [grammarParseStatus, setGrammarParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [grammarParseError, setGrammarParseError] = useState('')
  const [grammarParseSaveStatus, setGrammarParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [grammarParseSaveError, setGrammarParseSaveError] = useState('')
  const [readingParseResult, setReadingParseResult] = useState<ReadingParseQuestionGroupResult | null>(null)
  const [readingParseStatus, setReadingParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [readingParseError, setReadingParseError] = useState('')
  const [readingParseSaveStatus, setReadingParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [readingParseSaveError, setReadingParseSaveError] = useState('')
  const [aiApiKey] = useState(() => localStorage.getItem('ai-api-key') || '')
  const [aiModel] = useState(() => normalizeAiModel(localStorage.getItem('ai-model') || DEFAULT_AI_MODEL))
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'loading'>('idle')
  const [backfillResult, setBackfillResult] = useState<BackfillTopicLabelsResult | null>(null)
  const [backfillError, setBackfillError] = useState('')
  const [aiThinkingMode, setAiThinkingMode] = useState(() => localStorage.getItem('ai-thinking-mode') === 'on')
  const conciergeDesk = useConciergeDesk({
    questionGroups,
    apiKey: aiApiKey,
    thinkingMode: aiThinkingMode,
  })
  const aiRunIdRef = useRef(0)
  const refreshQuestionGroups = useCallback(async (ignore?: () => boolean) => {
    try {
      const groups = await fetchQuestionGroups()
      if (ignore?.()) return
      setQuestionGroups(groups)
      setDataStatus('sqlite')
    } catch {
      if (ignore?.()) return
      // Offline fallback only: keep any real data already loaded; show repo
      // samples only when we have nothing at all to render.
      setQuestionGroups((current) => (current.length ? current : sampleQuestionGroups))
      setDataStatus((status) => (status === 'sqlite' ? status : 'sample'))
    }
  }, [])
  // Paper export flow hook — manages DOCX/PDF/PrintHTML/PrintPDF state and actions
  const paperExports = usePaperExports({
    basket,
    paperBlocks,
    questionNumberStart,
    paperExportStyle,
    paperTitle,
    versionType,
    onDocxOrPdfExported: () => {},
  })

  // Wire the Paper Set Draft edit-event router. usePaperDraft is created above
  // before paperExports exists; this effect binds the actual handler in once
  // the dependent setters are reachable. saveStatus/previewStatus tracking
  // was classic-basket-panel-only display state, retired in classic-retire-3;
  // the draft-edit hook only needs to keep the export cache fresh now.
  useEffect(() => {
    draftEditedHandlerRef.current = () => {
      paperExports.resetExportStatuses()
    }
  }, [paperExports])

  // ─── PI-route guard: skip workbench-only fetches while the App shell is
  // rendering Paper Intelligence ───
  // When the Paper Intelligence route is active, the App shell does NOT show
  // any of the workbench panels (question bank list, imports, paper sets,
  // workflows). The corresponding effects below would fire useless GETs
  // against /api/* on PI-only sessions; reviewers flagged this as a P0 watch
  // on Cut A. We early-return inside each effect callback so hooks remain
  // unconditionally called (React's rules-of-hooks) but no fetch fires while
  // currentPiRoute.kind === 'paper-intelligence'. Each effect's dependency
  // list includes currentPiRoute.kind so Cut C return-to-workbench (which
  // flips the in-app currentPiRoute to { kind: 'none' }) retriggers the
  // normal load WITHOUT a full-page reload.
  useEffect(() => {
    if (currentPiRoute.kind === 'paper-intelligence') return
    let ignore = false

    refreshQuestionGroups(() => ignore)

    return () => {
      ignore = true
    }
  }, [currentPiRoute.kind, refreshQuestionGroups])

  // Close insertion menu on outside click or Escape
  const closeInsertionMenu = paperDraft.setOpenInsertionIndex
  useEffect(() => {
    if (openInsertionIndex === null) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.paper-insertion-seam')) {
        closeInsertionMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeInsertionMenu(null)
    }
    document.addEventListener('pointerdown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openInsertionIndex, closeInsertionMenu])

  const questionGroupById = useMemo(() => new Map(questionGroups.map((group) => [group.id, group])), [questionGroups])
  // readingParseByQuestionNo / clozeParseByQuestionNo / sevenChoicesParseByQuestionNo /
  // grammarParseByQuestionNo / verifyByQuestionNo / answerCompareStats moved into
  // QuestionGroupDetailView (classic-retire-2-detail-view, PA MF-2) — recomputed
  // there from the same parse/verify results instead of being passed as props.

  // Patch draftPaperButtonState/currentDraftPaperId in place on both the list
  // (questionGroups) and the open detail view (selectedDetail), if it happens
  // to be one of the affected groups. This is the only surface the
  // add-to-draft optimistic-feedback cut is allowed to touch — no other
  // QuestionGroupCard field is ever patched this way.
  function patchDraftButtonState(patchesByGroupId: Map<string, Pick<QuestionGroupCard, 'draftPaperButtonState' | 'currentDraftPaperId'>>) {
    setQuestionGroups((groups) =>
      groups.map((group) => (patchesByGroupId.has(group.id) ? { ...group, ...patchesByGroupId.get(group.id) } : group)),
    )
    setSelectedDetail((detail) => (detail && patchesByGroupId.has(detail.id) ? { ...detail, ...patchesByGroupId.get(detail.id) } : detail))
  }

  async function addGroupsToBasket(groups: QuestionGroupCard[]) {
    const addableGroups = groups.filter((group) => group.draftPaperButtonState === 'add' && group.canAddToDraftPaper)
    if (addableGroups.length === 0) {
      const existing = groups.find((group) => group.draftPaperButtonState === 'in_current_draft')
      if (existing) {
        openDraftPaperWorkbench(existing.currentDraftPaperId, existing.id)
        return
      }
      const blocked = groups.find((group) => group.printUnavailableReason)
      if (blocked) {
        window.alert(blocked.printUnavailableReason || '该题组暂不可加入草稿卷。')
      }
      return
    }

    // Optimistic feedback (docs/cuts/add-to-draft-feel/plan.md): flip each
    // group's button state immediately instead of waiting on the full
    // questionGroups refetch (504KB payload — measured 1-2s on the prod
    // network path, the reported "加题按钮卡顿" root cause). The add request
    // itself still confirms/rolls back per group below; refreshQuestionGroups
    // only runs afterward, in the background, to reconcile the rest of the
    // list — it never blocks the button feedback.
    const previousStateByGroupId = new Map(
      addableGroups.map((group) => [group.id, { draftPaperButtonState: group.draftPaperButtonState, currentDraftPaperId: group.currentDraftPaperId }]),
    )
    patchDraftButtonState(
      new Map(
        addableGroups.map((group) => [group.id, { draftPaperButtonState: 'in_current_draft' as const, currentDraftPaperId }]),
      ),
    )

    const outcomes = await Promise.all(
      addableGroups.map(async (group) => {
        try {
          const draftPaper = await addGroupToCurrentDraftPaperRequest(group.id)
          return { group, ok: true as const, draftPaperId: draftPaper.id }
        } catch (error) {
          return { group, ok: false as const, error }
        }
      }),
    )

    const confirmedPatches = new Map<string, Pick<QuestionGroupCard, 'draftPaperButtonState' | 'currentDraftPaperId'>>()
    const rollbackPatches = new Map<string, Pick<QuestionGroupCard, 'draftPaperButtonState' | 'currentDraftPaperId'>>()
    let firstError: unknown = null
    for (const outcome of outcomes) {
      if (outcome.ok) {
        confirmedPatches.set(outcome.group.id, { draftPaperButtonState: 'in_current_draft', currentDraftPaperId: outcome.draftPaperId })
      } else {
        rollbackPatches.set(
          outcome.group.id,
          previousStateByGroupId.get(outcome.group.id) || { draftPaperButtonState: 'add', currentDraftPaperId: null },
        )
        firstError = firstError ?? outcome.error
      }
    }
    if (confirmedPatches.size) patchDraftButtonState(confirmedPatches)
    if (rollbackPatches.size) {
      patchDraftButtonState(rollbackPatches)
      window.alert(firstError instanceof Error ? firstError.message : String(firstError))
    }

    // Background reconciliation only (fire-and-forget) — must not block the
    // button feedback applied above.
    void refreshQuestionGroups()
  }

  function addToBasket(group: QuestionGroupCard) {
    if (group.draftPaperButtonState === 'in_current_draft') {
      openDraftPaperWorkbench(group.currentDraftPaperId, group.id)
      return
    }
    void addGroupsToBasket([group])
  }

  async function openDetail(id: string) {
    aiRunIdRef.current += 1
    setViewMode('detail')
    setDetailStatus('loading')
    setDetailError('')
    setVerifyResult(null)
    setVerifyStatus('idle')
    setVerifyError('')
    setClozeParseResult(null)
    setClozeParseStatus('idle')
    setClozeParseError('')
    setClozeParseSaveStatus('idle')
    setClozeParseSaveError('')
    setSevenChoicesParseResult(null)
    setSevenChoicesParseStatus('idle')
    setSevenChoicesParseError('')
    setSevenChoicesParseSaveStatus('idle')
    setSevenChoicesParseSaveError('')
    setReadingParseResult(null)
    setReadingParseStatus('idle')
    setReadingParseError('')
    setReadingParseSaveStatus('idle')
    setReadingParseSaveError('')
    setGrammarParseResult(null)
    setGrammarParseStatus('idle')
    setGrammarParseError('')
    setGrammarParseSaveStatus('idle')
    setGrammarParseSaveError('')

    try {
      const detail = await fetchQuestionGroupDetail(id)
      setSelectedDetail(detail)
      if (detail.readingParseResult) {
        setReadingParseResult(detail.readingParseResult)
        setReadingParseStatus('loaded')
        setReadingParseSaveStatus('saved')
      }
      if (detail.readingVerifyResult) {
        setVerifyResult(detail.readingVerifyResult)
        setVerifyStatus('loaded')
      }
      if (detail.clozeParseResult) {
        setClozeParseResult(detail.clozeParseResult)
        setClozeParseStatus('loaded')
        setClozeParseSaveStatus('saved')
        setVerifyResult(buildClozeVerifyResult(detail, detail.clozeParseResult))
        setVerifyStatus('loaded')
      }
      if (detail.sevenChoicesParseResult) {
        setSevenChoicesParseResult(detail.sevenChoicesParseResult)
        setSevenChoicesParseStatus('loaded')
        setSevenChoicesParseSaveStatus('saved')
        setVerifyResult(buildSevenChoicesVerifyResult(detail, detail.sevenChoicesParseResult))
        setVerifyStatus('loaded')
      }
      if (detail.grammarParseResult) {
        setGrammarParseResult(detail.grammarParseResult)
        setGrammarParseStatus('loaded')
        setGrammarParseSaveStatus('saved')
        setVerifyResult(buildGrammarVerifyResult(detail, detail.grammarParseResult))
        setVerifyStatus('loaded')
      }
      setDetailStatus('loaded')
    } catch (error) {
      setDetailStatus('error')
      setDetailError(error instanceof Error ? error.message : String(error))
    }
  }

  function backToList() {
    setViewMode('list')
  }

  async function handleDeleteQuestionGroup(detail: QuestionGroupDetail) {
    if (!window.confirm(`删除「${detail.title}」？题组会从题库和草稿卷里移除，不可恢复。`)) return
    try {
      await deleteQuestionGroupRequest(detail.id)
      setQuestionGroups((groups) => groups.filter((group) => group.id !== detail.id))
      paperDraft.externalRemoveByGroupId(detail.id)
      setSelectedDetail(null)
      backToList()
    } catch (error) {
      window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function openEditEntry(detail: QuestionGroupDetail) {
    setEntryInitialDetail(detail)
    setEntryOpen(true)
  }

  async function handleEntrySaved(saved: QuestionGroupCard, context: { mode: 'create' | 'edit' }) {
    setQuestionGroups((groups) =>
      context.mode === 'edit'
        ? groups.map((group) => (group.id === saved.id ? saved : group))
        : [saved, ...groups.filter((group) => group.id !== saved.id)],
    )
    paperDraft.patchBasketItemFromSavedGroup(saved)
    if (context.mode === 'edit') {
      const detail = await fetchQuestionGroupDetail(saved.id)
      setSelectedDetail(detail)
      setDetailStatus('loaded')
    }
    setDataStatus('sqlite')
    setEntryOpen(false)
    setEntryInitialDetail(null)
  }

  async function handleBackfillTopicLabels() {
    const key = aiApiKey.trim()
    localStorage.setItem('ai-api-key', key)
    setBackfillStatus('loading')
    setBackfillResult(null)
    setBackfillError('')
    try {
      const result = await backfillTopicLabels({ apiKey: key, model: aiModel })
      setBackfillResult(result)
      setBackfillStatus('idle')
      await refreshQuestionGroups()
    } catch (error) {
      setBackfillError(error instanceof Error ? error.message : String(error))
      setBackfillStatus('idle')
    }
  }

  // ─── Paper Intelligence bridge props (Cut B) ───
  const piBasketIds = useMemo(
    () => new Set(basket.map((item) => item.id)),
    [basket],
  )
  const piAvailableQuestionGroupIds = useMemo(
    () => new Set(questionGroups.map((group) => group.id)),
    [questionGroups],
  )
  // Real basket bridge: PaperIntelligencePreview only knows a questionGroupId
  // (it does NOT know about QuestionGroupCard or paperDraft). Resolution from
  // id → card → paperDraft.addGroups happens here. PI preview enforces button
  // state guards (basketIds / availableQuestionGroupIds) so this handler will
  // only ever be invoked for ids that actually resolve.
  //
  // Cut C P0 watch: the deps list intentionally pins the SPECIFIC handler
  // (`addGroups`) instead of the whole `paperDraft` object — `paperDraft`
  // is rebuilt every render and would force this useCallback to invalidate
  // on every render, defeating the point of memoization. `addGroups` is
  // stabilized via `useCallback` inside `usePaperDraft`, so identity stays
  // constant across renders.
  const { addGroups: paperDraftAddGroups } = paperDraft
  const piOnAddQuestionGroup = useCallback(
    (questionGroupId: string) => {
      const card = questionGroupById.get(questionGroupId)
      if (!card) return
      paperDraftAddGroups([card])
    },
    [questionGroupById, paperDraftAddGroups],
  )
  const piOnBackToWorkbench = useCallback(() => {
    // Cut C: in-app return-to-workbench. Three contracts:
    //   1. Strip Paper Intelligence route params from the URL WITHOUT a full
    //      page reload — never use window.location.href / reload.
    //   2. Flip currentPiRoute → { kind: 'none' } so App re-renders the
    //      default workbench; the previously-guarded fetch effects retrigger.
    //   3. Do NOT open the basket drawer, do NOT auto-save the Paper Set.
    //      Assembly Basket and localStorage are preserved automatically because
    //      we never touch usePaperDraft state here.
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'source', 'paperId', 'surface', 'groupId', 'questionId', 'version']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        /* swallow — URL rewrite is best-effort; state flip below is what
         * actually unmounts PI. */
      }
    }
    setCurrentPiRoute({ kind: 'none' })
  }, [])
  const piBasketCount = basket.length

  /*
   * Issue #20: PI top bar now exposes a "草稿卷 N" button that opens a
   * read-only popover listing what's in the Assembly Basket. PI must
   * stay decoupled from BasketItem / QuestionGroupCard / usePaperDraft
   * (Cut B / Cut C boundary), so we project a pure `BasketPreviewItem`
   * array here. Total score is pre-computed (basket items store a
   * per-question `score`; teachers expect the panel total).
   *
   * Order is preserved from `basket`, which is the authoritative
   * insertion order owned by paperDraft. No sorting / filtering is
   * applied — the popover should match exactly what the workbench
   * basket would show.
   */
  const piBasketPreviewItems = useMemo(
    () =>
      basket.map((item) => ({
        id: item.id,
        paperSection: item.section,
        passageTitle: item.passageTitle,
        groupTypeLabel: groupTypeLabel[item.groupType],
        questionCount: item.questionCount,
        totalScore: item.score * item.questionCount,
        sourcePaperName: item.paperName,
      })),
    [basket],
  )

  const currentDraftPaperId = useMemo(
    () => questionGroups.find((group) => group.currentDraftPaperId)?.currentDraftPaperId || null,
    [questionGroups],
  )
  const currentDraftGroupCount = useMemo(
    () => questionGroups.filter((group) => group.draftPaperButtonState === 'in_current_draft').length,
    [questionGroups],
  )

  const openDraftPaperWorkbench = useCallback((draftPaperId?: string | null, focusGroupId?: string | null) => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'draft-paper')
      if (draftPaperId) {
        url.searchParams.set('draftPaperId', draftPaperId)
      } else {
        url.searchParams.delete('draftPaperId')
      }
      if (focusGroupId) {
        url.searchParams.set('focusGroupId', focusGroupId)
      } else {
        url.searchParams.delete('focusGroupId')
      }
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setMySpaceRouteActive(false)
    setCurrentPiRoute({ kind: 'none' })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, lecture: false, similar: false })
    setDraftPaperRoute({
      active: true,
      draftPaperId: draftPaperId || null,
      focusGroupId: focusGroupId || null,
    })
  }, [])

  const draftPaperOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'draftPaperId', 'focusGroupId']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    void refreshQuestionGroups()
  }, [refreshQuestionGroups])

  // 刀B: open the whole-paper preview page. `focusGroupId`, when given,
  // scrolls the page to that group's card on load. flow-panel 刀 3 adds an
  // options bag (a named type, not an inline `{ }` literal — an inline type
  // would introduce a `{` before the callback body and break
  // verify-paper-browse.mjs's `[^{]*\{` body-extraction regex) for入口带态:
  // questionId预选 + lecture(讲评态) open-on-load.
  const openPaperBrowse = useCallback((paperId: string, focusGroupId?: string | null, options?: OpenPaperBrowseOptions) => {
    const questionId = options?.questionId || null
    const lecture = Boolean(options?.lecture)
    // similar-entrypoints (E3): 只有讲评态深链才携带 similar — 挑题态入口
    // 永远拿 false（镜像 lecture 的同款收窄，避免无意义的 URL 组合）。
    const similar = lecture && Boolean(options?.similar)
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'paper-browse')
      url.searchParams.set('paperId', paperId)
      if (focusGroupId) {
        url.searchParams.set('focusGroupId', focusGroupId)
      } else {
        url.searchParams.delete('focusGroupId')
      }
      if (questionId) {
        url.searchParams.set('questionId', questionId)
      } else {
        url.searchParams.delete('questionId')
      }
      if (lecture) {
        url.searchParams.set('lecture', '1')
      } else {
        url.searchParams.delete('lecture')
      }
      if (similar) {
        url.searchParams.set('similar', '1')
      } else {
        url.searchParams.delete('similar')
      }
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setMySpaceRouteActive(false)
    setCurrentPiRoute({ kind: 'none' })
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: true, paperId, focusGroupId: focusGroupId || null, questionId, lecture, similar })
  }, [])

  // Detail-page "看整卷" entry point: derives paperId (and the group to
  // focus) from the group's paperSurfaceHref
  // (`?view=paper-intelligence&...&paperId=<id>&groupId=<gid>`) instead of
  // a new server field — the href already carries what we need. 挑题态, no
  // lecture — unchanged by 刀 3.
  const openPaperBrowseFromDetail = useCallback(
    (detail: QuestionGroupDetail) => {
      const paperId = parsePaperIdFromHref(detail.paperSurfaceHref)
      if (!paperId) return
      const [, query = ''] = (detail.paperSurfaceHref || '').split('?')
      const groupId = new URLSearchParams(query).get('groupId') || detail.id
      openPaperBrowse(paperId, groupId)
    },
    [openPaperBrowse],
  )

  // flow-panel 刀 3: detail-page "看解析" SPA fast-path — same href parsing
  // as 看整卷 above, plus questionId, opened into 讲评态 (not 挑题态).
  const openPaperBrowseLectureFromDetail = useCallback(
    (detail: QuestionGroupDetail) => {
      const paperId = parsePaperIdFromHref(detail.paperSurfaceHref)
      if (!paperId) return
      const [, query = ''] = (detail.paperSurfaceHref || '').split('?')
      const params = new URLSearchParams(query)
      const groupId = params.get('groupId') || detail.id
      const questionId = params.get('questionId') || null
      openPaperBrowse(paperId, groupId, { questionId, lecture: true })
    },
    [openPaperBrowse],
  )

  // similar-entrypoints (E3): detail-page "配相似" SPA fast-path — same href
  // parsing as 看解析 above, plus `similar: true` so the page auto-opens the
  // 配相似 result for the group's first analyzed question on arrival.
  const openPaperBrowseSimilarFromDetail = useCallback(
    (detail: QuestionGroupDetail) => {
      const paperId = parsePaperIdFromHref(detail.paperSurfaceHref)
      if (!paperId) return
      const [, query = ''] = (detail.paperSurfaceHref || '').split('?')
      const params = new URLSearchParams(query)
      const groupId = params.get('groupId') || detail.id
      const questionId = params.get('questionId') || null
      openPaperBrowse(paperId, groupId, { questionId, lecture: true, similar: true })
    },
    [openPaperBrowse],
  )

  const paperBrowseOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'paperId', 'focusGroupId', 'questionId', 'lecture', 'similar']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, lecture: false, similar: false })
  }, [])

  // flow-panel 刀 3: Back/Forward support. Every `open*`/`*OnBackToWorkbench`
  // callback above already writes the URL via pushState/replaceState — this
  // is the other half, replaying the same boot-read parse (main.tsx /
  // this component's four useState initializers above) whenever the user
  // navigates via the browser's own Back/Forward instead of an in-app
  // callback. `view=paper-intelligence` and `view=reading-analysis` are NOT
  // routes this component can render from state — main.tsx picks between
  // <App> and <ReadingAnalysisDemoRoute> at boot, and currentPiRoute is only
  // ever populated from the `piRoute` prop main.tsx passes in at that same
  // boot moment (see the comment on the `currentPiRoute` useState above) —
  // so landing on either of those two URLs via popstate falls back to a full
  // reload instead of assembling a route this component has no state path
  // for. Verified surface is paper-browse Back/Forward (per plan); the other
  // three routes (admin/my-space/draft-paper) are synced too but their
  // in-page state debt is out of this cut's scope.
  useEffect(() => {
    function onPopState(): void {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      if (view === 'paper-intelligence' || view === 'reading-analysis') {
        window.location.reload()
        return
      }
      setAdminRouteActive(isOwnerView && view === 'admin')
      setMySpaceRouteActive(view === 'my-space')
      setDraftPaperRoute({
        active: view === 'draft-paper',
        draftPaperId: params.get('draftPaperId'),
        focusGroupId: params.get('focusGroupId'),
      })
      setPaperBrowseRoute({
        active: view === 'paper-browse',
        paperId: params.get('paperId'),
        focusGroupId: params.get('focusGroupId'),
        questionId: params.get('questionId'),
        lecture: params.get('lecture') === '1',
        similar: params.get('similar') === '1',
      })
      setCurrentPiRoute({ kind: 'none' })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isOwnerView])

  const openMySpace = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'my-space')
      url.searchParams.delete('draftPaperId')
      url.searchParams.delete('focusGroupId')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, lecture: false, similar: false })
    setMySpaceRouteActive(true)
    setCurrentPiRoute({ kind: 'none' })
  }, [])

  const mySpaceOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('view')
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setMySpaceRouteActive(false)
    void refreshQuestionGroups()
  }, [refreshQuestionGroups])

  const toggleAdminRoute = useCallback(() => {
    setAdminRouteActive((current) => {
      const next = !current
      if (typeof window !== 'undefined' && window.history) {
        try {
          const url = new URL(window.location.href)
          if (next) {
            url.searchParams.set('view', 'admin')
          } else {
            url.searchParams.delete('view')
          }
          const nextSearch = url.searchParams.toString()
          const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
          if (next && typeof window.history.pushState === 'function') {
            window.history.pushState(window.history.state, '', nextUrl)
          } else if (!next && typeof window.history.replaceState === 'function') {
            window.history.replaceState(window.history.state, '', nextUrl)
          }
        } catch {
          // State flip below is the authoritative UI change.
        }
      }
      return next
    })
  }, [])

  const handleLogout = useCallback(() => {
    void logout().finally(() => window.location.reload())
  }, [])

  // Shared shell navigation for the unified AppTopbar (ui-shell-unify).
  // 管理 stays home-only: it is a mode toggle wired to the home shell's
  // adminRouteActive state, not cross-view navigation.
  const shellNav: AppTopbarNav = {
    user: currentUser,
    onLogout: handleLogout,
    onOpenMySpace: openMySpace,
  }

  // ─── Paper Intelligence route rendering ───
  if (draftPaperRoute.active) {
    return (
      <DraftPaperWorkbench
        draftPaperId={draftPaperRoute.draftPaperId}
        focusGroupId={draftPaperRoute.focusGroupId}
        onBackToWorkbench={draftPaperOnBackToWorkbench}
        onDraftChanged={() => void refreshQuestionGroups()}
        shellNav={shellNav}
      />
    )
  }

  if (mySpaceRouteActive) {
    return (
      <MySpacePage
        onBackToWorkbench={mySpaceOnBackToWorkbench}
        onOpenDraft={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
        shellNav={{ ...shellNav, onOpenMySpace: undefined }}
      />
    )
  }

  if (paperBrowseRoute.active && paperBrowseRoute.paperId) {
    return (
      <PaperBrowsePage
        paperId={paperBrowseRoute.paperId}
        focusGroupId={paperBrowseRoute.focusGroupId}
        questionId={paperBrowseRoute.questionId}
        lecture={paperBrowseRoute.lecture}
        similar={paperBrowseRoute.similar}
        questionGroupById={questionGroupById}
        onAddGroupsToBasket={(groups) => void addGroupsToBasket(groups)}
        currentDraftPaperId={currentDraftPaperId}
        currentDraftGroupCount={currentDraftGroupCount}
        onOpenDraftPaperWorkbench={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
        onBackToWorkbench={paperBrowseOnBackToWorkbench}
        shellNav={shellNav}
      />
    )
  }

  if (currentPiRoute.kind === 'paper-intelligence') {
    // Issue #21-C1: when the URL carries `&surface=paper`, render the
    // PaperSurface harness (production PaperSurface module + PI adapter).
    // Default surface (no `surface=` param, or any unknown value including
    // the retired `surface=print`) keeps the existing render path untouched.
    // The route parser normalizes unknown values to `'default'`, so this
    // branch is the only place the harness is reachable from.
    if (currentPiRoute.surface === 'paper') {
      return (
        <PaperIntelligencePaperSurfaceHarness
          paperId={currentPiRoute.paperId}
          source={currentPiRoute.source}
          groupId={currentPiRoute.groupId}
          questionId={currentPiRoute.questionId}
          version={currentPiRoute.version}
          onBackToWorkbench={piOnBackToWorkbench}
          shellNav={shellNav}
        />
      )
    }
    return (
      <PaperIntelligencePreview
        paperId={currentPiRoute.paperId}
        basketIds={piBasketIds}
        availableQuestionGroupIds={piAvailableQuestionGroupIds}
        onAddQuestionGroup={piOnAddQuestionGroup}
        basketCount={piBasketCount}
        basketPreviewItems={piBasketPreviewItems}
        onBackToWorkbench={piOnBackToWorkbench}
      />
    )
  }

  return (
    <div className="app-shell home-mode-ai">
      <AppTopbar
        variant="home"
        user={currentUser}
        onLogout={handleLogout}
        onOpenMySpace={openMySpace}
        showAdmin={isOwnerView}
        adminActive={adminRouteActive}
        onToggleAdmin={toggleAdminRoute}
      />

      {adminRouteActive && (
        <AdminWorkbench
          backfillStatus={backfillStatus}
          backfillResult={backfillResult}
          backfillError={backfillError}
          onBackfillTopicLabels={() => void handleBackfillTopicLabels()}
        />
      )}

      {!adminRouteActive && (
      <main className="workbench" aria-label="英语题库工作台">
        <section className="library-panel" aria-label="题库">
          <div className="library-header">
            <div>
              <p className="eyebrow">Question Groups</p>
              <h2>
                {viewMode === 'detail' ? '题组详情' : '题组列表'}
              </h2>
            </div>
            <div className="library-header-actions">
              <div className="filter-bar-summary">
                <BookOpen size={17} />
                <strong>{questionGroups.length}</strong>
                <span>个题组</span>
              </div>
            </div>
          </div>

          {viewMode === 'list' ? (
              <ConciergeDesk
                retrieval={conciergeDesk.retrieval}
                actions={conciergeDesk.actions}
                basketIds={new Set(basket.map((item) => item.id))}
                onAdd={(group) => addToBasket(group)}
                onOpenDetail={(group) => openDetail(group.id)}
                onOpenPaperBrowse={(paperId) => openPaperBrowse(paperId)}
                questionGroups={questionGroups}
                dataStatus={dataStatus}
                thinkingMode={aiThinkingMode}
                onThinkingModeChange={(value) => {
                  setAiThinkingMode(value)
                  localStorage.setItem('ai-thinking-mode', value ? 'on' : 'off')
                }}
              />
          ) : viewMode === 'detail' ? (
            <QuestionGroupDetailView
              isOwnerView={isOwnerView}
              defaultAiModel={DEFAULT_AI_MODEL}
              detail={{ selectedDetail, detailStatus, detailError }}
              verify={{ verifyResult, verifyStatus, verifyError }}
              clozeParse={{
                result: clozeParseResult,
                status: clozeParseStatus,
                error: clozeParseError,
                saveStatus: clozeParseSaveStatus,
                saveError: clozeParseSaveError,
              }}
              sevenChoicesParse={{
                result: sevenChoicesParseResult,
                status: sevenChoicesParseStatus,
                error: sevenChoicesParseError,
                saveStatus: sevenChoicesParseSaveStatus,
                saveError: sevenChoicesParseSaveError,
              }}
              grammarParse={{
                result: grammarParseResult,
                status: grammarParseStatus,
                error: grammarParseError,
                saveStatus: grammarParseSaveStatus,
                saveError: grammarParseSaveError,
              }}
              readingParse={{
                result: readingParseResult,
                status: readingParseStatus,
                error: readingParseError,
                saveStatus: readingParseSaveStatus,
                saveError: readingParseSaveError,
              }}
              onBack={backToList}
              onEdit={openEditEntry}
              onDelete={handleDeleteQuestionGroup}
              onAddToBasket={addToBasket}
              onOpenPaperBrowse={openPaperBrowseFromDetail}
              onOpenPaperBrowseLecture={openPaperBrowseLectureFromDetail}
              onOpenPaperBrowseSimilar={openPaperBrowseSimilarFromDetail}
            />
          ) : null}
        </section>
      </main>
      )}

      <button
        type="button"
        className="basket-chip"
        onClick={() => openDraftPaperWorkbench(currentDraftPaperId)}
        aria-label={`打开草稿卷，已选 ${currentDraftGroupCount} 个题组`}
        disabled={!currentDraftPaperId || currentDraftGroupCount === 0}
      >
        <ClipboardList size={15} />
        <span>草稿卷 · {currentDraftGroupCount} 题组</span>
      </button>

      {isEntryOpen && (
        <EntryModal
          open={isEntryOpen}
          mode="edit"
          initialDetail={entryInitialDetail}
          onClose={() => setEntryOpen(false)}
          onSaved={handleEntrySaved}
        />
      )}
    </div>
  )
}

export default App
