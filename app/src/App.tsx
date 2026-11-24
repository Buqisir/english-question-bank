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
import { ConciergeDesk } from './concierge/ConciergeDesk'
import {
  RECENTLY_OPENED_OPEN_SCOPE,
  readRecentlyOpened,
  recordRecentlyOpened,
  type RecentlyOpenedEntry,
} from './concierge/recentlyOpened.ts'
import { parsePaperIdFromHref } from './concierge/paperSurfaceHref'
import { useConciergeDesk } from './concierge/useConciergeDesk'
import {
  deleteQuestionGroup as deleteQuestionGroupRequest,
  fetchQuestionGroupDetail,
  fetchQuestionGroups,
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
import { DictionaryEntry } from './features/dictionary/DictionaryEntry'
import { Surface } from './shared-ui/Surface'
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

// detail-page-redesign (2026-07-15): buildGrammarVerifyResult /
// buildClozeVerifyResult / buildSevenChoicesVerifyResult retired — their
// only call sites were the openDetail backfill's now-deleted
// setVerifyResult(...) calls (see the retired detail-page AI-analysis
// sections, spec 负空间①).

function parseAppRoute(search = typeof window === 'undefined' ? '' : window.location.search) {
  const params = new URLSearchParams(search)
  return {
    view: params.get('view'),
    groupId: params.get('groupId'),
    paperId: params.get('paperId'),
    draftPaperId: params.get('draftPaperId'),
    focusGroupId: params.get('focusGroupId'),
    focusParagraphId: params.get('focusParagraphId'),
    word: params.get('w'),
    wordSense: params.get('wordSense'),
    questionId: params.get('questionId'),
    reviewRevision: params.get('reviewRevision'),
    lecture: params.get('lecture') === '1',
    similar: params.get('similar') === '1',
    setId: params.get('setId'),
    meaningRecallSetId: params.get('meaningRecallSetId'),
  }
}

function appRouteUrl(view: string | null, changes: Record<string, string | null>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries({ view, ...changes })) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  return url
}

function draftPaperRouteParams(draftPaperId?: string | null, focusGroupId?: string | null) {
  return { groupId: null, draftPaperId: draftPaperId || null, focusGroupId: focusGroupId || null }
}

function App() {
  const currentUser = useCurrentUser()
  // M0-3 (docs/cuts/m0-3-role-gate/plan.md 2b): AuthGate is the only place that
  // translates open-mode/owner/member into this boolean — consume it directly,
  // never re-derive from `currentUser`.
  const isOwnerView = useIsOwnerView()
  const [route, setRoute] = useState(parseAppRoute)
  const adminRouteActive = isOwnerView && route.view === 'admin'
  const browseRouteActive = route.view === 'browse'
  // In-page detail and admin returns keep the browse mode they opened from.
  const returnToBrowse = useRef(false)

  const navigate = useCallback((
    view: string | null,
    changes: Record<string, string | null> = {},
    options: { replace?: boolean; state?: object } = {},
  ) => {
    const url = appRouteUrl(view, changes)
    try {
      const method = options.replace ? 'replaceState' : 'pushState'
      window.history[method](options.state ?? window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {
      // Keep the in-app transition usable even if history is unavailable.
    }
    if (view !== 'detail' && view !== 'admin') returnToBrowse.current = false
    setRoute(parseAppRoute(url.search))
  }, [])

  const [questionGroups, setQuestionGroups] = useState<QuestionGroupCard[]>([])
  // 走查第四节第 7 条（Owner 2026-11-14）：题库没拿到时不再悄悄换成仓库里的样例题（原来退到
  // data/sampleQuestionGroups，首页看着像有题，草稿丸却变成 0 组），改成 'error' + 原话，首页说「题库没连上」给「重试」。
  const [dataStatus, setDataStatus] = useState<'loading' | 'sqlite' | 'error'>('loading')
  const [dataError, setDataError] = useState<string | null>(null)
  // 题库没拿到时草稿丸的数：单独问一次当前草稿卷（不新建）拿真数；问不到就是不知道（不写 0）。
  const [draftFallback, setDraftFallback] = useState<{ id: string; count: number } | null>(null)
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
  const detailRequestRef = useRef(0)
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
    draftHref: (draftPaperId, groupId) => {
      const url = appRouteUrl('draft-paper', draftPaperRouteParams(draftPaperId, groupId))
      return `${url.pathname}${url.search}${url.hash}`
    },
  }


  const loadDetail = useCallback(async (id: string) => {
    const requestId = ++detailRequestRef.current
    setRecentlyOpened(recordRecentlyOpened(recentlyOpenedScope, id))
    setViewMode('detail')
    setDetailStatus('loading')
    setDetailError('')
    setReadingParseResult(null)

    try {
      const detail = await fetchQuestionGroupDetail(id)
      if (requestId !== detailRequestRef.current) return
      setSelectedDetail(detail)
      setReadingParseResult(detail.readingParseResult ?? null)
      setDetailStatus('loaded')
    } catch (error) {
      if (requestId !== detailRequestRef.current) return
      setDetailStatus('error')
      setDetailError(error instanceof Error ? error.message : String(error))
    }
  }, [recentlyOpenedScope])

  function openDetail(id: string) {
    returnToBrowse.current = browseRouteActive
    navigate('detail', { groupId: id, draftPaperId: null, focusGroupId: null, paperId: null, questionId: null, lecture: null, similar: null })
    void loadDetail(id)
  }

  function backToList() {
    detailRequestRef.current += 1
    navigate(returnToBrowse.current ? 'browse' : null, { groupId: null }, { replace: true })
    setViewMode('list')
  }

  useEffect(() => {
    function onPopState() {
      const next = parseAppRoute()
      setRoute(next)
      returnToBrowse.current = false
      if (next.view === 'detail' && next.groupId) {
        void loadDetail(next.groupId)
      } else {
        detailRequestRef.current += 1
        setViewMode('list')
      }
    }
    onPopState()
    window.addEventListener('popstate', onPopState)
    return () => {
      detailRequestRef.current += 1
      window.removeEventListener('popstate', onPopState)
    }
  }, [loadDetail])

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
    if (context.mode === 'edit') {
      const detail = await fetchQuestionGroupDetail(saved.id)
      setSelectedDetail(detail)
      setDetailStatus('loaded')
    }
    setDataStatus('sqlite')
    setEntryOpen(false)
    setEntryInitialDetail(null)
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
    navigate('draft-paper', draftPaperRouteParams(draftPaperId, focusGroupId))
  }, [navigate])

  const draftPaperOnBackToWorkbench = useCallback(() => {
    navigate(null, { draftPaperId: null, focusGroupId: null }, { replace: true })
    void refreshQuestionGroups()
  }, [navigate, refreshQuestionGroups])

  const openPaperBrowse = useCallback((paperId: string, focusGroupId?: string | null, options?: {
    questionId?: string | null
    lecture?: boolean
    similar?: boolean
  }) => {
    navigate('paper-browse', {
      paperId, focusGroupId: focusGroupId || null, focusParagraphId: null, questionId: options?.questionId || null,
      reviewRevision: null, groupId: null, lecture: options?.lecture ? '1' : null,
      similar: options?.lecture && options.similar ? '1' : null,
    })
  }, [navigate])

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
    navigate(null, { paperId: null, focusGroupId: null, focusParagraphId: null, questionId: null, reviewRevision: null, lecture: null, similar: null, w: null, wordSense: null }, { replace: true })
  }, [navigate])

  const enterBrowse = useCallback(() => navigate('browse'), [navigate])
  const exitBrowse = useCallback(() => navigate(null, {}, { replace: true }), [navigate])

  const openMySpace = useCallback(() => {
    navigate('my-space', { draftPaperId: null, focusGroupId: null, groupId: null })
  }, [navigate])

  const openVocabularyNotebook = useCallback((nextPaperId?: string | null) => {
    navigate('vocabulary-notebook', {
      paperId: nextPaperId || null, draftPaperId: null, focusGroupId: null, groupId: null,
      questionId: null, lecture: null, similar: null, setId: null, mode: null,
    })
  }, [navigate])

  const openVocabularyReview = useCallback(() => {
    navigate('vocabulary-review', {
      paperId: null, draftPaperId: null, focusGroupId: null, groupId: null,
      questionId: null, lecture: null, similar: null, setId: null, mode: null,
    })
  }, [navigate])

  const openVocabularyDictationWorkbench = useCallback((meaningRecallSetId?: string) => {
    navigate('vocabulary-dictation-workbench', {
      paperId: null, draftPaperId: null, focusGroupId: null, groupId: null,
      questionId: null, lecture: null, similar: null, setId: null, mode: null,
      meaningRecallSetId: meaningRecallSetId || null,
    }, {
      state: { ...window.history.state, vocabularyDictationReturnSetId: route.setId },
    })
  }, [navigate, route.setId])

  const vocabularyDictationOnBackToReview = useCallback(() => {
    const setId = window.history.state?.vocabularyDictationReturnSetId
    navigate('vocabulary-review', { setId: typeof setId === 'string' ? setId : null }, { replace: true })
  }, [navigate])

  const clearMeaningRecallSet = useCallback(() => {
    navigate('vocabulary-dictation-workbench', { meaningRecallSetId: null }, { replace: true })
  }, [navigate])

  const openVocabularyPractice = useCallback((setId: string) => {
    navigate('vocabulary-review', { setId, mode: null }, { replace: true })
    navigate('vocabulary-practice', { setId, mode: 'match' }, {
      state: { ...window.history.state, vocabularyPracticeSetId: setId },
    })
  }, [navigate])

  const vocabularyPracticeOnBackToSet = useCallback((setId: string) => {
    if (window.history.state?.vocabularyPracticeSetId === setId) {
      window.history.back()
      return
    }
    navigate('vocabulary-review', { setId, mode: null }, { replace: true })
  }, [navigate])

  const vocabularyReviewOnBackToWorkbench = useCallback(() => {
    navigate(null, { setId: null, mode: null }, { replace: true })
  }, [navigate])

  const mySpaceOnBackToWorkbench = useCallback(() => {
    navigate(null, {}, { replace: true })
    void refreshQuestionGroups()
  }, [navigate, refreshQuestionGroups])

  const toggleAdminRoute = useCallback(() => {
    if (!isOwnerView) return
    if (adminRouteActive) {
      navigate(returnToBrowse.current ? 'browse' : null, {}, { replace: true })
    } else {
      returnToBrowse.current = browseRouteActive
      navigate('admin')
    }
  }, [isOwnerView, adminRouteActive, browseRouteActive, navigate])

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

  if (route.view === 'draft-paper') {
    return (
      <DraftPaperWorkbench
        draftPaperId={route.draftPaperId}
        focusGroupId={route.focusGroupId}
        onBackToWorkbench={draftPaperOnBackToWorkbench}
        onDraftChanged={() => void refreshQuestionGroups()}
        shellNav={shellNav}
        questionGroupById={questionGroupById}
      />
    )
  }

  if (route.view === 'vocabulary-notebook') {
    return (
      <VocabularyNotebookPage
        paperId={route.paperId}
        shellNav={{ ...shellNav, currentNav: 'vocabulary-notebook' }}
        onBack={paperBrowseOnBackToWorkbench}
        onOpenPaper={(nextPaperId) => openVocabularyNotebook(nextPaperId)}
        onOpenList={() => openVocabularyNotebook(null)}
      />
    )
  }

  if (route.view === 'vocabulary-review') {
    return (
      <VocabularyReviewPage
        onBackToWorkbench={vocabularyReviewOnBackToWorkbench}
        onOpenVocabularyPractice={openVocabularyPractice}
        onOpenVocabularyDictationWorkbench={openVocabularyDictationWorkbench}
        onVocabularySetRouteChange={(setId) => setRoute((current) => ({ ...current, setId }))}
        requestedSetId={route.setId}
        shellNav={{ ...shellNav, onOpenVocabularyReview: undefined, currentNav: 'vocabulary-review' }}
      />
    )
  }

  if (route.view === 'vocabulary-dictation-workbench') {
    return (
      <VocabularyDictationWorkbench
        onBackToVocabulary={vocabularyDictationOnBackToReview}
        requestedSetId={route.meaningRecallSetId}
        onRequestedSetOpened={clearMeaningRecallSet}
        shellNav={{ ...shellNav, onOpenVocabularyReview: vocabularyDictationOnBackToReview, currentNav: 'vocabulary-review' }}
      />
    )
  }

  if (route.view === 'vocabulary-practice') {
    return (
      <VocabularyPracticePage
        key={route.setId ?? 'missing-set'}
        setId={route.setId ?? ''}
        onBackToSet={() => vocabularyPracticeOnBackToSet(route.setId ?? '')}
        shellNav={{ ...shellNav, onOpenVocabularyReview: undefined, currentNav: 'vocabulary-review' }}
      />
    )
  }

  if (route.view === 'my-space') {
    return (
      <MySpacePage
        onBackToWorkbench={mySpaceOnBackToWorkbench}
        onOpenDraft={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
        shellNav={{ ...shellNav, onOpenMySpace: undefined, currentNav: 'my-space' }}
      />
    )
  }

  if (route.view === 'word' && route.word) {
    const source = appRouteUrl('paper-browse', { w: null, wordSense: null })
    return (
      <div className="app-shell">
        <AppTopbar {...shellNav} variant="sub" pageTitle="獭獭词典" onBack={paperBrowseOnBackToWorkbench} />
        <main className="otter-page">
          <Surface variant="board" padding="md">
            <DictionaryEntry key={route.word} density="full" word={route.word}
              senseId={route.paperId ? route.wordSense : undefined}
              returnHref={route.paperId ? `${source.pathname}${source.search}` : undefined} />
          </Surface>
        </main>
      </div>
    )
  }

  if (route.view === 'paper-browse' && route.paperId) {
    return (
      <DraftAddContext.Provider value={draftAddActions}>
      <PaperBrowsePage
        paperId={route.paperId}
        reviewRevision={route.reviewRevision}
        focusGroupId={route.focusGroupId}
        focusParagraphId={route.focusParagraphId}
        questionId={route.questionId}
        lecture={route.lecture}
        similar={route.similar}
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
        <AdminWorkbench />
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
            <>
            {/* 每页一个 h1，给读屏和标题导航用；详情页的看得见的标题是题组名（h3），这里只给读屏。 */}
            <h1 className="visually-hidden">题组详情</h1>
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
            </>
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
