import {
  QuestionGroup,
  BoardList,
} from './icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type QuestionGroupCard,
  type QuestionGroupDetail,
  type ReadingParseQuestionGroupResult,
} from './domain/questionBank'
import { usePaperDraft } from './paperAssembly/usePaperDraft'
import type { PaperDraftEditReason } from './paperAssembly/paperDraftModel'
import { ConciergeDesk } from './concierge/ConciergeDesk'
import {
  RECENTLY_OPENED_OPEN_SCOPE,
  readRecentlyOpened,
  recordRecentlyOpened,
  type RecentlyOpenedEntry,
} from './concierge/recentlyOpened.ts'
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
import { PaperBrowsePage, type AddGroupsOutcome } from './features/paper-browse/PaperBrowsePage'
import { DraftPaperWorkbench } from './features/draft-paper/DraftPaperWorkbench'
import { MySpacePage } from './features/my-space/MySpacePage'
import { AdminWorkbench } from './features/admin/AdminWorkbench'
import { VocabularyReviewPage } from './features/vocabulary-review/VocabularyReviewPage'
import { VocabularyPracticePage } from './features/vocabulary-practice/VocabularyPracticePage'
import { VocabularyDictationWorkbench } from './features/vocabulary-dictation-workbench/VocabularyDictationWorkbench'
import { VocabularyNotebookPage } from './features/vocabulary-notebook/VocabularyNotebookPage.tsx'
import { AppTopbar, type AppTopbarNav } from './components/AppTopbar'
import { addGroupToCurrentDraftPaper as addGroupToCurrentDraftPaperRequest, deleteDraftPaperItem, fetchCurrentDraftPaper } from './services/draftPapers'
import { Button } from './shared-ui/Button.tsx'
import { Dialog } from './shared-ui/Dialog.tsx'
import { Notice } from './shared-ui/Notice.tsx'
import { programmaticFocusTarget } from './shared-ui/focusAfterRemoval.ts'
import { DraftAddContext, type DraftAddActions, type DraftAddReceipt } from './shared-ui/draftAddContext.ts'
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

// detail-page-redesign (2026-07-15): buildGrammarVerifyResult /
// buildClozeVerifyResult / buildSevenChoicesVerifyResult retired — their
// only call sites were the openDetail backfill's now-deleted
// setVerifyResult(...) calls (see the retired detail-page AI-analysis
// sections, spec 负空间①).

// flow-panel 刀 3: openPaperBrowse's入口带态 options bag. A named type (not
// an inline `{ }` literal in the callback's parameter list) — an inline
// literal would put a `{` before the callback body and break
// verify-paper-browse.mjs's `[^{]*\{` body-extraction regex.
type OpenPaperBrowseOptions = { questionId?: string | null; lecture?: boolean; similar?: boolean }

// 草稿卷工作台的地址：`?view=draft-paper[&draftPaperId=<id>][&focusGroupId=<gid>]`，其余参数照当前地址留着。
// openDraftPaperWorkbench 往历史里压的就是它；加入键「已加入」链接的 href 也用它（中键开新标签、复制地址都能到同一处）。
function draftPaperWorkbenchHref(draftPaperId?: string | null, focusGroupId?: string | null): string {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'draft-paper')
  // C3b — clear groupId when navigating away from the detail view so it
  // doesn't linger as an orphan param on an unrelated route.
  url.searchParams.delete('groupId')
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
  return `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`
}

function App() {
  const currentUser = useCurrentUser()
  // M0-3 (docs/cuts/m0-3-role-gate/plan.md 2b): AuthGate is the only place that
  // translates open-mode/owner/member into this boolean — consume it directly,
  // never re-derive from `currentUser`.
  const isOwnerView = useIsOwnerView()
  const [adminRouteActive, setAdminRouteActive] = useState(() => {
    if (!isOwnerView) return false
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'admin'
  })
  const [mySpaceRouteActive, setMySpaceRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'my-space'
  })
  const [vocabularyReviewRouteActive, setVocabularyReviewRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'vocabulary-review'
  })
  const [vocabularyNotebookRoute, setVocabularyNotebookRoute] = useState(() => {
    if (typeof window === 'undefined') return { active: false, paperId: null as string | null }
    const params = new URLSearchParams(window.location.search)
    return {
      active: params.get('view') === 'vocabulary-notebook',
      paperId: params.get('paperId'),
    }
  })
  const [vocabularyDictationRouteActive, setVocabularyDictationRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'vocabulary-dictation-workbench'
  })
  const [vocabularyReviewSetId, setVocabularyReviewSetId] = useState(() => {
    if (typeof window === 'undefined') return null as string | null
    const params = new URLSearchParams(window.location.search)
    return params.get('view') === 'vocabulary-review' ? params.get('setId') : null
  })
  const [vocabularyPracticeRoute, setVocabularyPracticeRoute] = useState(() => {
    if (typeof window === 'undefined') return { active: false, setId: null as string | null }
    const params = new URLSearchParams(window.location.search)
    return {
      active: params.get('view') === 'vocabulary-practice',
      setId: params.get('setId'),
    }
  })
  // home-blank — `?view=browse`: the home list surface's browse mode. Unlike
  // its sibling routes above this does NOT swap out a top-level component —
  // it's a boolean handed straight into ConciergeDesk (still viewMode
  // 'list'), which combines it with its own `f.*`-derived hasActiveFilters
  // into the showListSurface invariant (plan.md 硬契约). Same
  // boot-read-URL-once + popstate-sync pattern as the routes above.
  const [browseRouteActive, setBrowseRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'browse'
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
        reviewRevision: null as string | null,
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
      reviewRevision: params.get('reviewRevision'),
      lecture: params.get('lecture') === '1',
      similar: params.get('similar') === '1',
    }
  })
  const [questionGroups, setQuestionGroups] = useState<QuestionGroupCard[]>([])
  // 走查第四节第 7 条（Owner 2026-11-14）：题库没拿到时不再悄悄换成仓库里的样例题（原来退到
  // data/sampleQuestionGroups，首页看着像有题，草稿丸却变成 0 组），改成 'error' + 原话，首页说「题库没连上」给「重试」。
  const [dataStatus, setDataStatus] = useState<'loading' | 'sqlite' | 'error'>('loading')
  const [dataError, setDataError] = useState<string | null>(null)
  // 题库没拿到时草稿丸的数：单独问一次当前草稿卷（不新建）拿真数；问不到就是不知道（不写 0）。
  const [draftFallback, setDraftFallback] = useState<{ id: string; count: number } | null>(null)
  // Edit-status orchestration is forwarded into usePaperDraft via a ref so the
  // hook can be created BEFORE paperExports / saveStatus / previewStatus
  // setters exist in this scope. The ref is wired up below as soon as the
  // dependent state is in place.
  const draftEditedHandlerRef = useRef<(reason: PaperDraftEditReason) => void>(() => {})
  // C3a (trust-cracks) — `openDetail` is a plain function redeclared every
  // render (not a useCallback), so the boot mount-effect and the popstate
  // handler below reach it through this always-current ref instead of
  // listing it as a hook dependency (which would either resubscribe on
  // every render or go stale).
  const openDetailRef = useRef<(id: string, opts?: { writeUrl?: boolean }) => void>(() => {})
  const paperDraft = usePaperDraft({
    onDraftEdited: (reason) => draftEditedHandlerRef.current(reason),
  })
  const {
    basket,
    paperBlocks,
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
  // detail-page-redesign (2026-07-15): verifyResult/clozeParseResult/
  // sevenChoicesParseResult/grammarParseResult (+ their status/error/
  // saveStatus/saveError siblings) retired — they existed solely to feed
  // the old detail page's per-question AI-analysis sections, which are
  // now structurally gone (spec 负空间①). readingParseResult is the ONE
  // survivor: the new 速览头 chips need its per-question `questionType`
  // (spec data contract, chips 数据源 §阅读). See verify-classic-retire-2.mjs
  // for the matching anchor update.
  const [readingParseResult, setReadingParseResult] = useState<ReadingParseQuestionGroupResult | null>(null)
  const [aiApiKey] = useState(() => localStorage.getItem('ai-api-key') || '')
  const [aiModel] = useState(() => normalizeAiModel(localStorage.getItem('ai-model') || DEFAULT_AI_MODEL))
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'loading'>('idle')
  const [backfillResult, setBackfillResult] = useState<BackfillTopicLabelsResult | null>(null)
  const [backfillError, setBackfillError] = useState('')
  const [aiThinkingMode, setAiThinkingMode] = useState(() => localStorage.getItem('ai-thinking-mode') === 'on')
  // 首页是归来 — the teacher's own trail of opened passages (localStorage only).
  // Scoped by user id so a shared browser never shows another teacher's trail;
  // `currentUser` is fixed for App's lifetime (AuthGate remounts on logout).
  const recentlyOpenedScope = currentUser?.id ?? RECENTLY_OPENED_OPEN_SCOPE
  const [recentlyOpened, setRecentlyOpened] = useState<RecentlyOpenedEntry[]>(() => readRecentlyOpened(recentlyOpenedScope))
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
      setDataError(null)
    } catch (error) {
      if (ignore?.()) return
      // 已经拿到过真题就留着（状态仍是 sqlite，草稿丸照旧按真题算）；一次都没拿到才算没连上。
      setDataStatus((status) => (status === 'sqlite' ? status : 'error'))
      setDataError(error instanceof Error ? error.message : String(error))
      try {
        const draft = await fetchCurrentDraftPaper(false)
        if (ignore?.()) return
        setDraftFallback({ id: draft.id, count: draft.items.length })
      } catch (draftError) {
        // 草稿卷也问不到：草稿丸留着上一次知道的数（没有就不写数）。
        console.error('读取当前草稿卷', draftError)
      }
    }
  }, [])
  const retryQuestionGroups = useCallback(() => {
    setDataStatus((status) => (status === 'error' ? 'loading' : status))
    void refreshQuestionGroups()
  }, [refreshQuestionGroups])
  // Paper export flow hook — manages the supported Print HTML/PDF state and actions.
  const paperExports = usePaperExports({
    basket,
    paperBlocks,
    questionNumberStart,
    paperExportStyle,
    paperTitle,
    versionType,
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

  useEffect(() => {
    let ignore = false

    refreshQuestionGroups(() => ignore)

    return () => {
      ignore = true
    }
  }, [refreshQuestionGroups])

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
  function patchDraftButtonState(patchesByGroupId: Map<string, Pick<QuestionGroupCard, 'draftPaperButtonState' | 'currentDraftPaperId'> & Partial<Pick<QuestionGroupCard, 'canAddToDraftPaper'>>>) {
    setQuestionGroups((groups) =>
      groups.map((group) => (patchesByGroupId.has(group.id) ? { ...group, ...patchesByGroupId.get(group.id) } : group)),
    )
    setSelectedDetail((detail) => (detail && patchesByGroupId.has(detail.id) ? { ...detail, ...patchesByGroupId.get(detail.id) } : detail))
  }

  // 加入结果交回调用处，由它用共用提示行说（不再弹浏览器警告框，走查「路上的构件」第 1 名）。
  async function addGroupsToBasket(groups: QuestionGroupCard[]): Promise<AddGroupsOutcome> {
    const addableGroups = groups.filter((group) => group.draftPaperButtonState === 'add' && group.canAddToDraftPaper)
    if (addableGroups.length === 0) {
      const existing = groups.find((group) => group.draftPaperButtonState === 'in_current_draft')
      if (existing) {
        openDraftPaperWorkbench(existing.currentDraftPaperId, existing.id)
        return { kind: 'opened' }
      }
      const blocked = groups.find((group) => group.printUnavailableReason)
      return blocked?.printUnavailableReason ? { kind: 'blocked', reason: blocked.printUnavailableReason } : { kind: 'none' }
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
    if (rollbackPatches.size) patchDraftButtonState(rollbackPatches)

    // Background reconciliation only (fire-and-forget) — must not block the
    // button feedback applied above.
    void refreshQuestionGroups()
    if (rollbackPatches.size) {
      return {
        kind: 'failed',
        addedIds: [...confirmedPatches.keys()],
        failedIds: [...rollbackPatches.keys()],
        message: firstError instanceof Error ? firstError.message : String(firstError),
      }
    }
    return { kind: 'added', addedIds: [...confirmedPatches.keys()] }
  }

  // 加入键（shared-ui/DraftAddButton）用的加入和撤回，走查第四节第 6 条。
  // 和上面 addGroupsToBasket 不同：不先乐观翻状态，键先进 busy（所以点），服务器确认后才算加入，
  // 这样「已加入」和草稿丸的组数都是真的；失败不弹浏览器警告框，抛给加入键，由它说一句没成功（原始报错进 console）。
  async function addGroupToDraft(groupId: string): Promise<DraftAddReceipt> {
    const draftPaper = await addGroupToCurrentDraftPaperRequest(groupId)
    const item = draftPaper.items.find((candidate) => candidate.groupId === groupId)
    patchDraftButtonState(new Map([[groupId, { draftPaperButtonState: 'in_current_draft' as const, currentDraftPaperId: draftPaper.id }]]))
    void refreshQuestionGroups()
    return { groupId, draftPaperId: draftPaper.id, itemId: item ? item.id : null }
  }

  async function undoAddGroupToDraft(receipt: DraftAddReceipt): Promise<void> {
    if (receipt.itemId === null) throw new Error('找不到刚加入的那一条，没法撤回')
    try {
      await deleteDraftPaperItem(receipt.draftPaperId, receipt.itemId)
    } catch (error) {
      // 删没删掉拿不准（比如请求发出去了、回话丢了），按服务器现状对一遍再把错交给加入键。
      void refreshQuestionGroups()
      throw error
    }
    // 服务器给已在草稿卷里的组 canAddToDraftPaper=false（server/api.mjs 里 printReady.ok && 状态为 add）。
    // 刚才能加进去说明这组可组卷，撤回后一并改回 true，不然等列表刷新前会闪一下「暂不可组卷」。
    patchDraftButtonState(new Map([[receipt.groupId, { draftPaperButtonState: 'add' as const, currentDraftPaperId: receipt.draftPaperId, canAddToDraftPaper: true }]]))
    void refreshQuestionGroups()
  }

  // 「已加入」点了打开草稿卷工作台并定位到这一组（Owner 2026-11-14：恢复成改之前「再点一下」的去处）。
  const draftAddActions: DraftAddActions = {
    add: addGroupToDraft,
    undo: undoAddGroupToDraft,
    openDraft: (draftPaperId, groupId) => openDraftPaperWorkbench(draftPaperId, groupId),
    draftHref: (draftPaperId, groupId) => draftPaperWorkbenchHref(draftPaperId, groupId),
  }


  // C3a (trust-cracks) — 详情进 URL: `?view=detail&groupId=<id>` via
  // pushState (a real navigation — Back should retreat to the list), mirrors
  // `openPaperBrowse`'s pattern. `opts.writeUrl` defaults to true for normal
  // in-app calls (ConciergeGroupCard's 详情 link/click, App's own onOpenDetail
  // wiring); boot (mount effect below) and the popstate replay both pass
  // `writeUrl: false` so they don't push a second, redundant history entry
  // for a navigation the browser itself already recorded.
  async function openDetail(id: string, opts?: { writeUrl?: boolean }) {
    const writeUrl = opts?.writeUrl !== false
    if (writeUrl && typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('view', 'detail')
        url.searchParams.set('groupId', id)
        for (const param of ['draftPaperId', 'focusGroupId', 'paperId', 'questionId', 'lecture', 'similar']) {
          url.searchParams.delete(param)
        }
        window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
      } catch {
        // URL rewrite is best-effort; the state flip below is what actually
        // shows the detail view.
      }
    }
    aiRunIdRef.current += 1
    setRecentlyOpened(recordRecentlyOpened(recentlyOpenedScope, id))
    setViewMode('detail')
    setDetailStatus('loading')
    setDetailError('')
    setReadingParseResult(null)

    try {
      const detail = await fetchQuestionGroupDetail(id)
      setSelectedDetail(detail)
      if (detail.readingParseResult) {
        setReadingParseResult(detail.readingParseResult)
      }
      setDetailStatus('loaded')
    } catch (error) {
      setDetailStatus('error')
      setDetailError(error instanceof Error ? error.message : String(error))
    }
  }

  // C3a — leaving the detail view is likewise a real URL transition: strip
  // `view`+`groupId` via replaceState (a precision revert, not a new history
  // entry — the pushState from openDetail is what Back should already
  // retreat through).
  function backToList() {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('view')
        url.searchParams.delete('groupId')
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setViewMode('list')
  }

  // Keep the ref pointed at this render's openDetail closure (see the ref's
  // declaration comment above).
  useEffect(() => {
    openDetailRef.current = openDetail
  })

  // C3a — boot auto-open: if the page loaded directly on `?view=detail
  // &groupId=<id>` (a refresh, a shared link, a new tab from a mid-click),
  // replay that into the detail view once at mount. `writeUrl: false` — the
  // URL already says this, so don't push a second history entry for it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') !== 'detail') return
    const groupId = params.get('groupId')
    if (!groupId) return
    openDetailRef.current(groupId, { writeUrl: false })
  }, [])

  // 删除题组：从题库删掉，不可恢复，也没有回收站，照 DESIGN.md Deletion-Cost Rule 用具名确认框（Dialog alert），
  // 不改成即删撤销（构件收尾 2026-11-15，原来是浏览器自带的 window.confirm / window.alert）。
  // 确认框一直挂着、只切 open（退场动画播完再卸载）；删除中 Esc、「取消」都不关；删不掉时框不关，出错写在框里。
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<QuestionGroupDetail | null>(null)
  // 开关单独放：关上时 deleteGroupTarget 留着，退场那 120ms 里标题不会变成「删除「」？」；下次打开整个换掉。
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false)
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false)
  const [deleteGroupError, setDeleteGroupError] = useState('')
  // 删掉以后详情页没了，打开确认框的「更多操作」键也跟着没了：焦点落到回到的那一页（找题台的搜索框，没有就落到「题库取题流」那一块），
  // 不掉到页面最外层（shared-ui/focusAfterRemoval.ts 规则第 3 条的变体：整页换了，落到新一页的开头）。
  const deletedGroupRef = useRef(false)

  function handleDeleteQuestionGroup(detail: QuestionGroupDetail) {
    if (!isOwnerView || !detail.canEdit) return
    deletedGroupRef.current = false
    setDeleteGroupError('')
    setDeleteGroupTarget(detail)
    setDeleteGroupOpen(true)
  }

  async function confirmDeleteQuestionGroup() {
    const detail = deleteGroupTarget
    if (!detail || deleteGroupBusy) return
    setDeleteGroupBusy(true)
    setDeleteGroupError('')
    try {
      await deleteQuestionGroupRequest(detail.id)
      deletedGroupRef.current = true
      setQuestionGroups((groups) => groups.filter((group) => group.id !== detail.id))
      paperDraft.externalRemoveByGroupId(detail.id)
      setSelectedDetail(null)
      setDeleteGroupOpen(false)
      backToList()
    } catch (error) {
      setDeleteGroupError(error instanceof Error ? error.message : String(error))
    } finally {
      setDeleteGroupBusy(false)
    }
  }

  function openEditEntry(detail: QuestionGroupDetail) {
    if (!isOwnerView || !detail.canEdit) return
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

  // Derived on render; React Compiler memoizes this (manual useMemo here
  // trips react-hooks/preserve-manual-memoization).
  // 第 7 条：题库拿到了就按题组算（真数）；没拿到用单独问来的草稿卷；都没有就不知道（草稿丸不写数，不写 0）。
  const draftCountKnown = dataStatus === 'sqlite' || draftFallback !== null
  const currentDraftPaperId = dataStatus === 'sqlite'
    ? questionGroups.find((group) => group.currentDraftPaperId)?.currentDraftPaperId || null
    : draftFallback?.id ?? null
  const currentDraftGroupCount = dataStatus === 'sqlite'
    ? questionGroups.filter((group) => group.draftPaperButtonState === 'in_current_draft').length
    : draftFallback?.count ?? 0
  // Detail fetch (GET /api/question-groups/:id) omits draftContext, so
  // selectedDetail.draftPaperButtonState lags the list cards that
  // addGroupsToBasket patches via questionGroups. Mirror ConciergeGroupCard:
  // overlay the list card's draft fields when the open detail group is in
  // questionGroupById.
  const selectedDetailForView = useMemo(() => {
    if (!selectedDetail) return null
    const card = questionGroupById.get(selectedDetail.id)
    if (!card) return selectedDetail
    return {
      ...selectedDetail,
      canAddToDraftPaper: card.canAddToDraftPaper,
      draftPaperButtonState: card.draftPaperButtonState,
      currentDraftPaperId: card.currentDraftPaperId,
      printUnavailableReason: card.printUnavailableReason,
    }
  }, [questionGroupById, selectedDetail])

  const openDraftPaperWorkbench = useCallback((draftPaperId?: string | null, focusGroupId?: string | null) => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      window.history.pushState(window.history.state, '', draftPaperWorkbenchHref(draftPaperId, focusGroupId))
    }
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
    setMySpaceRouteActive(false)
    setVocabularyReviewRouteActive(false)
    setVocabularyNotebookRoute({ active: false, paperId: null })
    setVocabularyPracticeRoute({ active: false, setId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
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
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
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
      url.searchParams.delete('reviewRevision')
      // C3b — clear groupId when navigating away from the detail view.
      url.searchParams.delete('groupId')
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
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
    setMySpaceRouteActive(false)
    setVocabularyReviewRouteActive(false)
    setVocabularyNotebookRoute({ active: false, paperId: null })
    setVocabularyPracticeRoute({ active: false, setId: null })
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: true, paperId, focusGroupId: focusGroupId || null, questionId, reviewRevision: null, lecture, similar })
  }, [])

  // Whole-paper navigation follows Screen admission, not analysis availability.
  const openPaperBrowseFromDetail = useCallback(
    (detail: QuestionGroupDetail) => {
      const paperId = detail.canonicalPaperId
      if (!paperId) return
      openPaperBrowse(paperId, detail.id)
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

  const paperBrowseOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'paperId', 'focusGroupId', 'questionId', 'reviewRevision', 'lecture', 'similar']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
    setVocabularyNotebookRoute({ active: false, paperId: null })
  }, [])

  // flow-panel 刀 3: Back/Forward support. Every `open*`/`*OnBackToWorkbench`
  // callback above already writes the URL via pushState/replaceState — this
  // is the other half, replaying the same boot-read parse (main.tsx /
  // this component's four useState initializers above) whenever the user
  // navigates via the browser's own Back/Forward instead of an in-app
  // callback. Verified surface is paper-browse Back/Forward (per plan); the
  // other three routes (admin/my-space/draft-paper) are synced too but their
  // in-page state debt is out of this cut's scope.
  //
  // reading-analysis-retire (2026-07-16): the `view === 'paper-intelligence'
  // || view === 'reading-analysis'` full-reload short-circuit that used to
  // live here is retired along with both routes. Neither route pushes a
  // history entry a user could Back/Forward into any more — main.tsx
  // self-heals the URL via `replaceState` at boot, before this listener (or
  // any render) ever runs.
  useEffect(() => {
    function onPopState(): void {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      setAdminRouteActive(isOwnerView && view === 'admin')
      setMySpaceRouteActive(view === 'my-space')
      setVocabularyReviewRouteActive(view === 'vocabulary-review')
      setVocabularyNotebookRoute({
        active: view === 'vocabulary-notebook',
        paperId: params.get('paperId'),
      })
      setVocabularyDictationRouteActive(view === 'vocabulary-dictation-workbench')
      setVocabularyReviewSetId(view === 'vocabulary-review' ? params.get('setId') : null)
      setVocabularyPracticeRoute({
        active: view === 'vocabulary-practice',
        setId: params.get('setId'),
      })
      setBrowseRouteActive(view === 'browse')
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
        reviewRevision: params.get('reviewRevision'),
        lecture: params.get('lecture') === '1',
        similar: params.get('similar') === '1',
      })
      // C3a — replay the detail view the same way boot does (writeUrl:
      // false — the browser already owns this history entry). Any other
      // `view` value (including none, i.e. back to the plain list) falls
      // through to 'list'; the routes set above already take render
      // precedence over viewMode when one of them is active.
      if (view === 'detail') {
        const groupId = params.get('groupId')
        setViewMode('detail')
        if (groupId) {
          openDetailRef.current(groupId, { writeUrl: false })
        }
      } else {
        setViewMode('list')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isOwnerView])

  // home-blank — whisper click: push `?view=browse`. A real navigation (Back
  // retreats out of browse), mirroring openDetail/openMySpace's pushState
  // pattern; only the `view` param is touched here (f.* / other params, if
  // any, survive untouched).
  const enterBrowse = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('view', 'browse')
        window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setBrowseRouteActive(true)
  }, [])

  // home-blank — 词标 click (logo=home semantics): clears the `view=browse`
  // param via replaceState (a precision revert of this one param, not a new
  // navigation — Back is the other, separate way out of browse per plan.md).
  const exitBrowse = useCallback(() => {
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
    setBrowseRouteActive(false)
  }, [])

  const openMySpace = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'my-space')
      url.searchParams.delete('draftPaperId')
      url.searchParams.delete('focusGroupId')
      // C3b — clear groupId when navigating away from the detail view.
      url.searchParams.delete('groupId')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
    setVocabularyReviewRouteActive(false)
    setVocabularyDictationRouteActive(false)
    setVocabularyPracticeRoute({ active: false, setId: null })
    setVocabularyNotebookRoute({ active: false, paperId: null })
    setMySpaceRouteActive(true)
  }, [])

  const openVocabularyNotebook = useCallback((nextPaperId?: string | null) => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'vocabulary-notebook')
      if (nextPaperId) url.searchParams.set('paperId', nextPaperId)
      else url.searchParams.delete('paperId')
      for (const param of ['draftPaperId', 'focusGroupId', 'groupId', 'questionId', 'lecture', 'similar', 'setId', 'mode']) {
        url.searchParams.delete(param)
      }
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setAdminRouteActive(false)
    setMySpaceRouteActive(false)
    setBrowseRouteActive(false)
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
    setVocabularyPracticeRoute({ active: false, setId: null })
    setVocabularyDictationRouteActive(false)
    setVocabularyReviewRouteActive(false)
    setVocabularyNotebookRoute({ active: true, paperId: nextPaperId || null })
  }, [])

  const openVocabularyReview = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'vocabulary-review')
      for (const param of ['draftPaperId', 'paperId', 'focusGroupId', 'groupId', 'questionId', 'lecture', 'similar']) {
        url.searchParams.delete(param)
      }
      url.searchParams.delete('setId')
      url.searchParams.delete('mode')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setAdminRouteActive(false)
    setMySpaceRouteActive(false)
    setBrowseRouteActive(false)
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
    setVocabularyPracticeRoute({ active: false, setId: null })
    setVocabularyDictationRouteActive(false)
    setVocabularyReviewSetId(null)
    setVocabularyNotebookRoute({ active: false, paperId: null })
    setVocabularyReviewRouteActive(true)
  }, [])

  const openVocabularyDictationWorkbench = useCallback((meaningRecallSetId?: string) => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'vocabulary-dictation-workbench')
      for (const param of ['setId', 'mode', 'draftPaperId', 'paperId', 'focusGroupId', 'groupId', 'questionId', 'lecture', 'similar']) {
        url.searchParams.delete(param)
      }
      if (meaningRecallSetId) url.searchParams.set('meaningRecallSetId', meaningRecallSetId)
      else url.searchParams.delete('meaningRecallSetId')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setAdminRouteActive(false)
    setMySpaceRouteActive(false)
    setBrowseRouteActive(false)
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperBrowseRoute({ active: false, paperId: null, focusGroupId: null, questionId: null, reviewRevision: null, lecture: false, similar: false })
    setVocabularyPracticeRoute({ active: false, setId: null })
    setVocabularyReviewRouteActive(false)
    setVocabularyNotebookRoute({ active: false, paperId: null })
    setVocabularyDictationRouteActive(true)
  }, [])

  const vocabularyDictationOnBackToReview = useCallback(() => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'vocabulary-review')
      window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setVocabularyDictationRouteActive(false)
    setVocabularyReviewRouteActive(true)
  }, [])

  const openVocabularyPractice = useCallback((setId: string) => {
    if (typeof window !== 'undefined' && window.history) {
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.set('view', 'vocabulary-review')
      currentUrl.searchParams.set('setId', setId)
      currentUrl.searchParams.delete('mode')
      window.history.replaceState(window.history.state, '', `${currentUrl.pathname}?${currentUrl.searchParams.toString()}${currentUrl.hash || ''}`)

      const practiceUrl = new URL(currentUrl.href)
      practiceUrl.searchParams.set('view', 'vocabulary-practice')
      practiceUrl.searchParams.set('mode', 'match')
      window.history.pushState(
        { ...(window.history.state ?? {}), vocabularyPracticeSetId: setId },
        '',
        `${practiceUrl.pathname}?${practiceUrl.searchParams.toString()}${practiceUrl.hash || ''}`,
      )
    }
    setVocabularyReviewSetId(setId)
    setVocabularyReviewRouteActive(false)
    setVocabularyPracticeRoute({ active: true, setId })
  }, [])

  const vocabularyPracticeOnBackToSet = useCallback((setId: string) => {
    if (
      typeof window !== 'undefined'
      && window.history
      && window.history.state?.vocabularyPracticeSetId === setId
    ) {
      window.history.back()
      return
    }
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'vocabulary-review')
      url.searchParams.set('setId', setId)
      url.searchParams.delete('mode')
      window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setVocabularyPracticeRoute({ active: false, setId: null })
    setVocabularyReviewSetId(setId)
    setVocabularyReviewRouteActive(true)
  }, [])

  const vocabularyReviewOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      url.searchParams.delete('setId')
      url.searchParams.delete('mode')
      const nextSearch = url.searchParams.toString()
      window.history.replaceState(window.history.state, '', `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`)
    }
    setVocabularyReviewSetId(null)
    setVocabularyReviewRouteActive(false)
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
    setAdminRouteActive(false)
    setBrowseRouteActive(false)
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
    onOpenVocabularyReview: openVocabularyReview,
    onOpenVocabularyNotebook: () => openVocabularyNotebook(null),
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
        questionGroupById={questionGroupById}
      />
    )
  }

  if (vocabularyNotebookRoute.active) {
    return (
      <VocabularyNotebookPage
        paperId={vocabularyNotebookRoute.paperId}
        shellNav={shellNav}
        onBack={paperBrowseOnBackToWorkbench}
        onOpenPaper={(nextPaperId) => openVocabularyNotebook(nextPaperId)}
        onOpenList={() => openVocabularyNotebook(null)}
      />
    )
  }

  if (vocabularyReviewRouteActive) {
    return (
      <VocabularyReviewPage
        onBackToWorkbench={vocabularyReviewOnBackToWorkbench}
        onOpenVocabularyPractice={openVocabularyPractice}
        onOpenVocabularyDictationWorkbench={openVocabularyDictationWorkbench}
        onVocabularySetRouteChange={setVocabularyReviewSetId}
        requestedSetId={vocabularyReviewSetId}
        shellNav={{ ...shellNav, onOpenVocabularyReview: undefined }}
      />
    )
  }

  if (vocabularyDictationRouteActive) {
    return (
      <VocabularyDictationWorkbench
        onBackToVocabulary={vocabularyDictationOnBackToReview}
        requestedSetId={typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('meaningRecallSetId')}
        shellNav={{ ...shellNav, onOpenVocabularyReview: vocabularyDictationOnBackToReview }}
      />
    )
  }

  if (vocabularyPracticeRoute.active) {
    return (
      <VocabularyPracticePage
        key={vocabularyPracticeRoute.setId ?? 'missing-set'}
        setId={vocabularyPracticeRoute.setId ?? ''}
        onBackToSet={() => vocabularyPracticeOnBackToSet(vocabularyPracticeRoute.setId ?? '')}
        shellNav={{ ...shellNav, onOpenVocabularyReview: undefined }}
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
      <DraftAddContext.Provider value={draftAddActions}>
      <PaperBrowsePage
        paperId={paperBrowseRoute.paperId}
        reviewRevision={paperBrowseRoute.reviewRevision}
        focusGroupId={paperBrowseRoute.focusGroupId}
        questionId={paperBrowseRoute.questionId}
        lecture={paperBrowseRoute.lecture}
        similar={paperBrowseRoute.similar}
        questionGroupById={questionGroupById}
        onAddGroupsToBasket={addGroupsToBasket}
        currentDraftPaperId={currentDraftPaperId}
        currentDraftGroupCount={currentDraftGroupCount}
        onOpenDraftPaperWorkbench={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
        onBackToWorkbench={paperBrowseOnBackToWorkbench}
        shellNav={shellNav}
      />
      </DraftAddContext.Provider>
    )
  }

  return (
    <DraftAddContext.Provider value={draftAddActions}>
    <div className="app-shell home-mode-ai">
      <AppTopbar
        variant="home"
        user={currentUser}
        onLogout={handleLogout}
        onOpenVocabularyNotebook={() => openVocabularyNotebook(null)}
        onOpenVocabularyReview={openVocabularyReview}
        onOpenMySpace={openMySpace}
        showAdmin={isOwnerView}
        adminActive={adminRouteActive}
        onToggleAdmin={toggleAdminRoute}
        hideBrand={false}
        // 顶栏全站一个高度（Owner 2026-11-16 定）：找题台原来导航用大号 36、顶栏 64，现在和别的页一样用默认小号、顶栏 48。
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
      <main className="workbench" aria-label="獭石">
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
                <QuestionGroup size={16} />
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
                onOpenDetail={(group) => openDetail(group.id)}
                onOpenPaperBrowse={(paperId) => openPaperBrowse(paperId)}
                questionGroups={questionGroups}
                dataStatus={dataStatus}
                dataError={dataError}
                onRetryData={retryQuestionGroups}
                thinkingMode={aiThinkingMode}
                onThinkingModeChange={(value) => {
                  setAiThinkingMode(value)
                  localStorage.setItem('ai-thinking-mode', value ? 'on' : 'off')
                }}
                browseActive={browseRouteActive}
                onEnterBrowse={enterBrowse}
                onExitBrowse={exitBrowse}
                recentlyOpened={recentlyOpened}
                currentDraftPaperId={currentDraftPaperId}
                currentDraftGroupCount={currentDraftGroupCount}
                onOpenDraftPaper={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
              />
          ) : viewMode === 'detail' ? (
            <QuestionGroupDetailView
              isOwnerView={isOwnerView}
              detail={{ selectedDetail: selectedDetailForView, detailStatus, detailError }}
              readingParse={{ result: readingParseResult }}
              onBack={backToList}
              onEdit={openEditEntry}
              onDelete={handleDeleteQuestionGroup}
              onOpenPaperBrowse={openPaperBrowseFromDetail}
              onOpenPaperBrowseLecture={openPaperBrowseLectureFromDetail}
              questionGroupById={questionGroupById}
            />
          ) : null}
        </section>
      </main>
      )}

      {!adminRouteActive && (
      // 草稿丸（清单 chip-03 / chip-04）：点了是去草稿卷，是按钮，所以用共用 Button（墨字 strong）；
      // 浮在右下、白底、e2 这几样浮件的样子在 App.css .eqb-button.basket-chip；圆角随 Button 用 8px（构件收尾 2026-11-15：动作键不用胶囊）。
      // 首页（找题台，下面是 ConciergeDesk）用大号 36，别的页小号 28，和原来一样高。
      // 读屏名以看得见的字开头（Owner 2026-11-14 第 3 条），冒号后补上点了会怎样。
      <Button
        tone="strong"
        size={viewMode === 'list' ? 'lg' : 'sm'}
        className="basket-chip"
        onClick={() => openDraftPaperWorkbench(currentDraftPaperId)}
        aria-label={draftCountKnown ? `草稿卷（${currentDraftGroupCount} 组）：打开草稿卷` : '草稿卷：打开草稿卷'}
        disabled={!currentDraftPaperId || (draftCountKnown && currentDraftGroupCount === 0)}
        icon={
          <>
            <BoardList size={16} />
            {currentDraftGroupCount > 0 && (
              // key 随组数变：每加一组就重挂一次，小圆点跳一下，告诉老师"落袋了"。
              <span key={currentDraftGroupCount} className="basket-chip-dot" aria-hidden="true" />
            )}
          </>
        }
      >
        {draftCountKnown ? `草稿卷（${currentDraftGroupCount} 组）` : '草稿卷'}
      </Button>
      )}

      <Dialog
        tone="alert"
        open={deleteGroupOpen}
        onClose={() => setDeleteGroupOpen(false)}
        busy={deleteGroupBusy}
        className="question-group-delete-dialog"
        title={`删除「${deleteGroupTarget?.title ?? ''}」？`}
        description="题组会从题库和草稿卷里移除，不可恢复。"
        // 删掉以后回到找题台：落到它的搜索框（换前 window.confirm 时实测也落在这里，是那一页第一个能操作的东西）；
        // 搜索框不在（或禁用）时落到「题库取题流」那一块。取消、Esc 回到「更多操作」（默认）。
        returnFocus={() => {
          if (!deletedGroupRef.current) return null
          const search = document.querySelector<HTMLInputElement>('.concierge-desk .concierge-intent-input')
          return search && !search.disabled ? search : programmaticFocusTarget(document.querySelector<HTMLElement>('.concierge-desk'))
        }}
        cancel={{ label: '取消' }}
        confirm={{
          // 删的时候键上的字不换（宽度不变），过了 300ms 门槛字隐去、所以点放在正中（Button busy，DESIGN.md §5 Waiting）。
          label: '删除题组',
          busy: deleteGroupBusy,
          className: 'question-group-delete-confirm',
          onClick: () => void confirmDeleteQuestionGroup(),
        }}
      >
        {/* 原来删不掉时弹 window.alert「删除失败：…」，现在写在框里（共用 Notice，出错读屏马上念），字照原来。 */}
        {deleteGroupError ? <Notice kind="error" detail={deleteGroupError}>删除失败</Notice> : null}
      </Dialog>

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
    </DraftAddContext.Provider>
  )
}

export default App
