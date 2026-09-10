import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArrowDown, ArrowLeftRight, ArrowUp, FileDown, FolderPlus, MoreHorizontal, Printer, RotateCcw, Save, SeparatorHorizontal, Trash2 } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import type { DraftPaper, DraftPaperItem, DraftPaperSummary, DraftPrintForm, GroupType, MySpaceFolder, QuestionGroupCard } from '../../domain/questionBank'
import {
  addGroupToDraftPaper,
  deleteDraftPaperItem,
  downloadDraftPaperPdf,
  fetchCurrentDraftPaper,
  fetchDraftPaper,
  fetchDraftPaperPagination,
  fetchDraftPapers,
  fetchReorderSuggestion,
  migrateAssemblyBasketToDraftPaper,
  patchDraftPaperItem,
  restoreDraftPaperItem,
  updateDraftPaper,
  type ReorderSuggestion,
} from '../../services/draftPapers'
import {
  createMySpaceFolder,
  fetchMySpace,
  saveDraftPaperToMySpace,
} from '../../services/mySpace'
import { prepareFileSaveTarget, type FileSaveMode } from '../../services/fileDownload.ts'
import {
  ASSEMBLY_BASKET_STORAGE_KEY,
  parseAssemblyBasket,
} from '../../paperAssembly/basketPersistence'
import { fetchSimilarPassages } from '../../services/similarQuestions.ts'
import { describeError } from '../shared/errorCopy'
import { useToastPresence, usePresence } from '../shared/useToastPresence.ts'
import { similarPassagesRecipeSummary, type SimilarPassagesRequestState } from '../similar-passages/SimilarPassagesPanel'
import { DraftPaperRail } from './DraftPaperRail'
import { A3_FACE_NATIVE_WIDTH_PX, applyA3Imposition, buildA4PreviewHtml } from './draftPaperPreviewHtml'
import './DraftPaperWorkbench.css'

type DraftVersionType = 'student' | 'teacher'

// similar-workbench-swap (E7, plan.md 施工要点 2 "⇄ 入口 gate"): the four v2
// engine groupTypes findSimilarPassages actually scores against
// (docs/cuts/similar-v2-engine/plan.md) — writing (and every other
// groupType) never renders the ⇄ button at all (隐藏式降级, same convention
// similar-passages-entry/E6 already established for its own CTA).
const SWAP_SUPPORTED_GROUP_TYPES = new Set<GroupType>(['reading', 'cloze', 'seven_choices', 'grammar_cloze'])

export type DraftPaperWorkbenchProps = {
  draftPaperId?: string | null
  focusGroupId?: string | null
  onBackToWorkbench: () => void
  onDraftChanged?: () => void
  shellNav: AppTopbarNav
  /* similar-workbench-swap (E7): full corpus lookup, same map App.tsx already
     builds for similar-passages-entry's other two consumers
     (QuestionGroupDetailView, ConciergeGroupCard) — threaded through here so
     the swap drawer can tell a "thin" candidate (paper asset analyzed, DB
     not yet synced) from a real one, SW-3 parity. */
  questionGroupById: Map<string, QuestionGroupCard>
}

type RemovedDraftItem = {
  generation: number
  groupId: string
  orderIndex: number
  pageBreakBefore: boolean
}

function getLegacyBasketGroupIds() {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(ASSEMBLY_BASKET_STORAGE_KEY)
  const items = parseAssemblyBasket(raw) || []
  return items.map((item) => item.id).filter(Boolean)
}

function clearLegacyBasket() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ASSEMBLY_BASKET_STORAGE_KEY)
}

function reorderItems(items: DraftPaperItem[], itemId: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === itemId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function moveItemTo(items: DraftPaperItem[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return items
  const from = items.findIndex((item) => item.id === draggedId)
  const to = items.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function DraftPaperWorkbench(props: DraftPaperWorkbenchProps): ReactNode {
  const { draftPaperId, focusGroupId, onBackToWorkbench, onDraftChanged, shellNav, questionGroupById } = props
  const [draftPaper, setDraftPaper] = useState<DraftPaper | null>(null)
  const draftGenerationRef = useRef(0)
  const [draftGeneration, setDraftGeneration] = useState(0)
  // Each successful load owns a generation, including A → B → A. A switch
  // invalidates handlers immediately, before the destination fetch settles.
  const isCurrentDraft = () => draftGeneration === draftGenerationRef.current
  const [recentDrafts, setRecentDrafts] = useState<DraftPaperSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [studentLabelDraft, setStudentLabelDraft] = useState('')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
  const [exportSuccessMessage, setExportSuccessMessage] = useState('')
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  // motion-press-exit #2: 弹层退出 ~120ms（var(--motion-fast)）播完再卸载。
  const spaceDialogPresence = usePresence(spaceDialogOpen, 120)
  const [spaceFolders, setSpaceFolders] = useState<MySpaceFolder[]>([])
  const [spaceFolderId, setSpaceFolderId] = useState('')
  const [spaceFileName, setSpaceFileName] = useState('')
  const [spaceNewFolderName, setSpaceNewFolderName] = useState('')
  const [spaceStatus, setSpaceStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [spaceMessage, setSpaceMessage] = useState('')
  // ui-p1-panels #14: the save dialog used to stay open after a successful
  // save, with the success text squeezed into the form body and "保存"
  // still clickable (repeat-save risk, "取消" reading oddly once already
  // saved). It now closes on success and hands off to this toast — same
  // pattern as `draft-undo-toast` below.
  const [savedToastMessage, setSavedToastMessage] = useState<string | null>(null)
  const savedToastTimerRef = useRef<number | null>(null)
  const [migrationNotice, setMigrationNotice] = useState('')
  const [versionType, setVersionType] = useState<DraftVersionType>('student')
  const [removedItem, setRemovedItem] = useState<RemovedDraftItem | null>(null)
  // motion-press-exit #3: toast keyframe→transition — 退出前保持挂载
  // var(--motion-fast)(120ms)播完退出再真卸载。
  const removedItemToast = useToastPresence(removedItem, 120)
  const savedToastPresence = useToastPresence(savedToastMessage, 120)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [openGroupActionsItemId, setOpenGroupActionsItemId] = useState<string | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  // workbench-header-unify Locked Decision 2: the retired `.draft-toolbar`'s
  // 学生（可选）/ 最近草稿卷 / 自动保存状态 三项 now live behind this quiet
  // "⋯" menu in the head row — same disclosure pattern as exportMenuOpen
  // above (outside-click + Escape dismiss effect below).
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  // 复评工艺账（2026-07-17 C 路）：菜单入场有 keyframe、关闭裸卸载=可感的
  // 不对称。与 toast/模态同走 usePresence——退（motion-micro）快于入
  // （motion-fast），播完 exit 再卸载。
  const exportMenuPresence = usePresence(exportMenuOpen, 80)
  const moreMenuPresence = usePresence(moreMenuOpen, 80)
  const titleSaveTimerRef = useRef<number | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const focusedOnceRef = useRef(false)
  const a4SheetRef = useRef<HTMLDivElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  // draft-desk-a: iframe now grows to its full rendered height (read from
  // contentDocument after load) instead of a fixed 1188px single-page guess
  // — the desk's own scroll carries multi-page drafts (plan.md technical
  // constraint). 1200 is a placeholder for the first paint before the first
  // onLoad tick; it snaps to the real value almost immediately since srcDoc
  // content has no network round-trip.
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const paperColRef = useRef<HTMLDivElement | null>(null)
  const scrollSettleCancelRef = useRef<(() => void) | null>(null)
  const [nativeContentHeight, setNativeContentHeight] = useState(1200)
  const [pageCount, setPageCount] = useState(1)
  const [previewReady, setPreviewReady] = useState(false)
  const [activeRailGroupId, setActiveRailGroupId] = useState<string | null>(null)
  // draft-desk-b step3 (MF-3, plan.md "步3"): server-rendered pagination HTML
  // (raw, before buildA4PreviewHtml's thin screen-CSS wrap) + its fetch status.
  // PO-2 简单版: the previous `paginatedHtml` value is intentionally left in
  // place while a new fetch is in flight (no local fake repagination) — only
  // `paginationStatus` flips to 'loading', driving a "重新排版中…" indicator
  // layered over the still-visible old preview.
  const [paginatedHtml, setPaginatedHtml] = useState('')
  const [paginationStatus, setPaginationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [paginationError, setPaginationError] = useState('')
  // print-form (plan.md Must Do 5, PO-1 收账): real, pagination-derived
  // page-break suggestions, refreshed on every pagination fetch (including a
  // print-form toggle alone — see the pagination-fetch effect's dependency
  // list below). Quiet annotation only — never auto-applied (裁点5).
  const [pageBreakSuggestions, setPageBreakSuggestions] = useState<Array<{ itemId: string; groupId: string; reason: string }>>([])
  const paginationRequestIdRef = useRef(0)
  const paginationDebounceRef = useRef<number | null>(null)
  // reorder-suggest (docs/cuts/reorder-suggest/plan.md 施工契约 3): the
  // quiet, real-dry-run-verified 排序建议 card — fetched only after a
  // pagination response comes back with pageBreakSuggestions.length > 0 (see
  // the effect below), never polled/timered on its own (Forbidden: 无后台
  // 轮询). `reorderUndoSnapshot` holds the pre-apply item order so 撤销 can
  // PATCH straight back to it; it is cleared both by its own 8s timer and by
  // any OTHER item mutation in the meantime (moveItem/handleDrop/deleteItem/
  // undoDelete/togglePageBreak below all call clearReorderUndo() first — the
  // snapshot is stale the instant a different edit lands, 施工契约 3 边界).
  const [reorderSuggestion, setReorderSuggestion] = useState<ReorderSuggestion>(null)
  const [reorderUndoSnapshot, setReorderUndoSnapshot] = useState<{ generation: number; items: DraftPaperItem[] } | null>(null)
  const reorderUndoTimerRef = useRef<number | null>(null)
  const reorderRequestIdRef = useRef(0)
  // Same delayed-unmount toast pattern as removedItemToast above — driven by
  // presence of reorderUndoSnapshot rather than a payload value, since the
  // toast's own text is static.
  const reorderUndoToastPresence = usePresence(reorderUndoSnapshot !== null, 120)
  // draft-desk-b step3 (MF-5, plan.md "步3"): per-group persistent overlay
  // button anchors — replaces the retired hover-only sticker (裁点1 in
  // draft-desk-a) with one always-visible button per question group. Keyed by
  // groupId, computed for every non-groupMissing item after each preview load
  // (see the effect below) — same computeGroupAnchorTop math the old hover
  // sticker used, just evaluated for every group instead of one at a time.
  const [groupAnchors, setGroupAnchors] = useState<Record<string, number>>({})
  // a3-imposition (plan.md Must Do 3, 裁点2): keyed by suggestion groupId
  // (not item id) — one anchor per `[data-seam-before-group]` marker the a3
  // wrapper (draftPaperPreviewHtml.ts's applyA3Imposition) tags into the
  // iframe DOM, computed the same way groupAnchors is (same anchor math,
  // different query target). Only populated in A3 mode; a4 keeps the
  // suggestion pill inside draft-group-actions exactly as before (裁点4).
  const [seamAnchors, setSeamAnchors] = useState<Record<string, number>>({})

  // similar-workbench-swap (E7, plan.md "抽屉"): `swapSeedItemId` is null in
  // 目录态, a DraftPaperItem.id in 抽屉态 — never a groupId, since 替换 needs
  // the ITEM (position + pageBreakBefore), not just which group seeded the
  // search. `swapRequest` mirrors similar-passages-entry's own
  // SimilarPassagesRequestState (fetchSimilarPassages is the exact same
  // client call E6 already makes) and is always set together with opening a
  // seed (never null while swapSeedItemId is non-null).
  const [swapSeedItemId, setSwapSeedItemId] = useState<string | null>(null)
  const [swapRequest, setSwapRequest] = useState<SimilarPassagesRequestState | null>(null)
  const [swapAddToastMessage, setSwapAddToastMessage] = useState<string | null>(null)
  const swapAddToastTimerRef = useRef<number | null>(null)
  const swapAddToastPresence = useToastPresence(swapAddToastMessage, 120)
  // 替换 undo snapshot — same 8s-timer + toast-presence shape as
  // reorderUndoSnapshot above, and same 撤销快照互斥 lifecycle (plan.md 施工
  // 要点 4/5, DP-2 script ⑥): any OTHER item mutation (including the OTHER
  // kind of undo snapshot being created) clears this first — see
  // clearReplaceUndo/clearReorderUndo below, called in pairs everywhere
  // either kind of edit happens.
  const [replaceUndoSnapshot, setReplaceUndoSnapshot] = useState<{ removed: RemovedDraftItem; addedItemId: string } | null>(null)
  const replaceUndoTimerRef = useRef<number | null>(null)
  const replaceUndoToastPresence = usePresence(replaceUndoSnapshot !== null, 120)

  // Bug 4263fb71: both switch surfaces leave the workbench mounted, so a
  // snapshot captured on the previous draft stays live on the new one and
  // undoDelete/undoReorderSuggestion/undoSwapReplace fire restore/update
  // against the wrong draftPaper.id. Clear every transient undo/swap
  // snapshot (and its dismiss timer) whenever the on-screen draft changes.
  // Stable (only refs + setState setters) so the [] deps are exact.
  const resetTransientStateForDraftSwitch = useCallback(() => {
    draftGenerationRef.current += 1
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
    setSaveStatus('idle')
    setSaveError('')
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    undoTimerRef.current = null
    if (reorderUndoTimerRef.current) window.clearTimeout(reorderUndoTimerRef.current)
    reorderUndoTimerRef.current = null
    if (replaceUndoTimerRef.current) window.clearTimeout(replaceUndoTimerRef.current)
    replaceUndoTimerRef.current = null
    setRemovedItem(null)
    setReorderUndoSnapshot(null)
    setReplaceUndoSnapshot(null)
    setSwapSeedItemId(null)
    setSwapRequest(null)
    setReorderSuggestion(null)
    setPageBreakSuggestions([])
    reorderRequestIdRef.current += 1
    paginationRequestIdRef.current += 1
  }, [])

  const loadRecentDrafts = useCallback(() => {
    fetchDraftPapers().then(setRecentDrafts).catch(() => setRecentDrafts([]))
  }, [])

  const loadDraft = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError('')
    setMigrationNotice('')
    // popstate switch path (parent-prop change re-runs loadDraft): the
    // [loadDraft] effect cleanup clears the undo TIMERS but not the undo
    // STATE — clear it before the await so a stale snapshot can't fire
    // against the new draft even when the fetch fails.
    resetTransientStateForDraftSwitch()
    const generation = draftGenerationRef.current
    try {
      let next: DraftPaper
      if (draftPaperId) {
        next = await fetchDraftPaper(draftPaperId)
      } else {
        try {
          next = await fetchCurrentDraftPaper(false)
        } catch {
          const groupIds = getLegacyBasketGroupIds()
          if (groupIds.length > 0) {
            const migration = await migrateAssemblyBasketToDraftPaper(groupIds)
            clearLegacyBasket()
            next = migration.draftPaper
            if (migration.skippedCount > 0) {
              setMigrationNotice(`已迁移 ${migration.migratedCount} 个题组到草稿卷；${migration.skippedCount} 个题组因不可打印被跳过。`)
            }
          } else {
            next = await fetchCurrentDraftPaper(true)
          }
        }
      }
      if (generation !== draftGenerationRef.current) return
      setDraftGeneration(generation)
      setDraftPaper(next)
      setTitleDraft(next.title)
      setStudentLabelDraft(next.studentLabel || '')
      setVersionType('student')
      setLoadStatus('loaded')
      loadRecentDrafts()
    } catch (error) {
      if (generation !== draftGenerationRef.current) return
      setLoadStatus('error')
      setLoadError(describeError('打开草稿卷', error))
    }
  }, [draftPaperId, loadRecentDrafts, resetTransientStateForDraftSwitch])

  useEffect(() => {
    void loadDraft()
    return () => {
      draftGenerationRef.current += 1
      if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
      if (savedToastTimerRef.current) window.clearTimeout(savedToastTimerRef.current)
      if (reorderUndoTimerRef.current) window.clearTimeout(reorderUndoTimerRef.current)
      if (swapAddToastTimerRef.current) window.clearTimeout(swapAddToastTimerRef.current)
      if (replaceUndoTimerRef.current) window.clearTimeout(replaceUndoTimerRef.current)
    }
  }, [loadDraft])

  useEffect(() => {
    if (!draftPaper || loadStatus !== 'loaded') return
    let cancelled = false
    const generation = draftGenerationRef.current
    void fetchDraftPaper(draftPaper.id, versionType).then((next) => {
      if (cancelled || generation !== draftGenerationRef.current) return
      setDraftPaper((current) => (current && current.id === next.id ? { ...current, printHtml: next.printHtml } : current))
    })
    return () => {
      cancelled = true
    }
    // Only re-fetch print HTML when the version toggle changes; item/title edits
    // already refresh printHtml via their own draftPaper responses (student version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionType])

  useEffect(() => {
    focusedOnceRef.current = false
  }, [draftPaperId, focusGroupId])

  // D5: close the export menu on outside click or Escape, mirroring the
  // dismiss behavior native disclosure widgets give you for free.
  useEffect(() => {
    if (!exportMenuOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [exportMenuOpen])

  // workbench-header-unify: same dismiss pattern as the export menu effect
  // above, for the "⋯" menu.
  useEffect(() => {
    if (!moreMenuOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreMenuOpen])

  // draft-desk-a: previously scrolled the retired outline panel's own row
  // into view (`[data-draft-group-id]` lived only there). The rail keeps
  // that same attribute (so existing deep-link selectors still resolve),
  // but the scroll target is now the actual paper block via
  // scrollToGroupInPaper — a more useful "focus" now that the paper itself
  // is directly reachable, and it needs the preview iframe to have finished
  // loading + tagging its groups first (previewReady), not just draftPaper.
  useEffect(() => {
    if (!draftPaper || !focusGroupId || !previewReady || focusedOnceRef.current) return
    const timer = window.setTimeout(() => {
      scrollToGroupInPaper(focusGroupId)
      focusedOnceRef.current = true
    }, 180)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPaper, focusGroupId, previewReady])

  // draft-desk-a: only non-groupMissing items ever reach a `.question-group`
  // section in the printed/paginated output (server/draft-paper/
  // draftPaperStore.mjs's buildDraftPaperBlocks skips groupMissing entirely)
  // — the same filtered, ordered list server/draft-paper/
  // paginationDomContract.mjs positionally tags `data-group-id` with.
  const nonMissingItems = useMemo(() => draftPaper?.items.filter((item) => !item.groupMissing) ?? [], [draftPaper])

  // similar-workbench-swap (E7): the seed item behind the currently-open
  // drawer, if any — re-derived from draftPaper on every render rather than
  // cached, so a 替换 that lands mid-flight (updating draftPaper) never
  // leaves this pointing at a stale item.
  const swapSeedItem = useMemo(
    () => (swapSeedItemId ? draftPaper?.items.find((entry) => entry.id === swapSeedItemId) ?? null : null),
    [draftPaper, swapSeedItemId],
  )
  // similar-workbench-swap (E7, plan.md "候选已在本草稿卷：动作禁用"): every
  // groupId already occupying a slot in this draft paper, seed included —
  // findSimilarPassages already excludes the seed's own group from its pool
  // server-side, so this is really about a DIFFERENT candidate that's
  // already elsewhere in the same volume.
  const draftGroupIds = useMemo(() => new Set((draftPaper?.items ?? []).map((entry) => entry.groupId)), [draftPaper])

  // reorder-suggest (plan.md 施工契约 3 "卡"): assembles the card's copy from
  // two SEPARATE real sources — the existing 断篇 reason (pageBreakSuggestions,
  // already fetched for the same brokenGroupId) plus a move sentence this
  // component builds itself from the two group titles (never invented by the
  // server — reorderSuggestion only ever carries item ids). null whenever
  // there is nothing verified to show (安静：卡有则现，无则无). Declared here
  // (ahead of the loadStatus early returns below), not next to pagesMetaText —
  // every hook in this component must run on every render regardless of
  // branch (Rules of Hooks); draftPaper may still be null this early.
  const reorderSuggestionCard = useMemo(() => {
    if (!draftPaper || !reorderSuggestion) return null
    const byId = new Map(draftPaper.items.map((item) => [item.id, item]))
    const titleFor = (id?: string) => {
      if (!id) return ''
      const item = byId.get(id)
      return item?.questionGroup?.passageTitle || item?.questionGroup?.title || item?.groupId || ''
    }
    const moveText =
      reorderSuggestion.move.kind === 'swap'
        ? `把「${titleFor(reorderSuggestion.move.itemId)}」和「${titleFor(reorderSuggestion.move.otherItemId)}」调换顺序即可消除。`
        : `把「${titleFor(reorderSuggestion.move.itemId)}」移到卷${reorderSuggestion.move.kind === 'front' ? '首' : '尾'}即可消除。`
    const reasonText = pageBreakSuggestions.find((entry) => entry.groupId === reorderSuggestion.brokenGroupId)?.reason || ''
    return { text: `${reasonText}${moveText}` }
  }, [draftPaper, reorderSuggestion, pageBreakSuggestions])

  // draft-desk-b step3 (MF-3): the exact fields draftPaperPaginationSignature
  // (server/draft-paper/draftPaperStore.mjs) treats as layout — item identity/
  // order/page-break-before. Memoized to a stable string so the pagination-fetch
  // effect below only re-triggers when this actually changes content-wise, not
  // merely because `draftPaper` got a new object identity from an unrelated
  // field (e.g. studentLabel, itemCount) — mirrors the server's own signature
  // field set so client fetch-triggering and server cache-invalidation agree on
  // "what counts as a layout edit".
  const itemsLayoutKey = useMemo(
    () => JSON.stringify((draftPaper?.items ?? []).map((item) => [item.id, item.groupId, item.orderIndex, item.pageBreakBefore])),
    [draftPaper?.items],
  )

  // draft-desk-b step3 (MF-3, PO-2 简单版, DP-title Option B): fetches the
  // server-rendered pagination whenever a layout edit, a title edit, or the
  // student/teacher toggle changes it — debounced so a burst of edits
  // coalesces into one request, with no local fake repagination shown in
  // between (the previously fetched `paginatedHtml` just stays on screen,
  // `paginationStatus` alone flips to 'loading'). `paginationRequestIdRef`
  // discards a stale response that resolves after a newer request already
  // started (e.g. two edits in quick succession, both past the debounce).
  useEffect(() => {
    if (paginationDebounceRef.current) window.clearTimeout(paginationDebounceRef.current)
    const generation = draftGenerationRef.current
    if (draftGeneration !== generation) return
    // Named inner function (not a bare top-level setState call) so this reset
    // reads as the same "callback reacting to an external condition" shape
    // eslint-plugin-react-hooks's set-state-in-effect rule already accepts
    // elsewhere in this file (see the scrollspy effect's updateActive below).
    function resetPagination() {
      paginationRequestIdRef.current += 1
      setPaginatedHtml('')
      setPaginationStatus('idle')
      setPaginationError('')
      setPageBreakSuggestions([])
    }
    if (!draftPaper || draftPaper.items.length === 0) {
      resetPagination()
      return
    }
    const draftPaperId = draftPaper.id
    paginationDebounceRef.current = window.setTimeout(() => {
      if (generation !== draftGenerationRef.current) return
      const requestId = (paginationRequestIdRef.current += 1)
      setPaginationStatus('loading')
      fetchDraftPaperPagination(draftPaperId, versionType)
        .then((result) => {
          if (paginationRequestIdRef.current !== requestId || generation !== draftGenerationRef.current) return
          setPaginatedHtml(result.paginatedHtml)
          setPaginationStatus('ready')
          setPaginationError('')
          setPageBreakSuggestions(result.pageBreakSuggestions)
        })
        .catch((error) => {
          if (paginationRequestIdRef.current !== requestId || generation !== draftGenerationRef.current) return
          setPaginationStatus('error')
          setPaginationError(describeError('生成分页预览', error))
        })
    }, 400)
    return () => {
      if (paginationDebounceRef.current) window.clearTimeout(paginationDebounceRef.current)
    }
    // print-form (plan.md Must Do 3): a print-form toggle alone must still
    // refresh pageBreakSuggestions (the a4/a3 判据 differs) even though it
    // never changes paginatedHtml itself (server-side cache hit — printForm
    // is deliberately excluded from the render signature, see
    // draftPaperStore.mjs's getDraftPaperPagination doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPaper?.id, draftPaper?.title, itemsLayoutKey, versionType, draftPaper?.printForm, draftGeneration])

  // reorder-suggest (plan.md 施工契约 3 "拉取策略"): fires only once the
  // pagination fetch above has resolved with real breakage — never on its
  // own timer, never while pagination itself is still loading/stale (the
  // pagination effect's own debounce already gates that). A cleared/empty
  // pageBreakSuggestions list (fixed by the user, or a fresh draft) clears
  // the card immediately with no request — 安静：卡有则现，无则无.
  useEffect(() => {
    const requestId = (reorderRequestIdRef.current += 1)
    if (!draftPaper || pageBreakSuggestions.length === 0) {
      setReorderSuggestion(null)
      return
    }
    const draftPaperId = draftPaper.id
    fetchReorderSuggestion(draftPaperId, versionType)
      .then((suggestion) => {
        if (reorderRequestIdRef.current !== requestId) return
        setReorderSuggestion(suggestion)
      })
      .catch(() => {
        // Quiet by design (plan.md "安静常驻卡"): a failed fetch here just
        // means no card shows this round — no error toast, no retry loop.
        // The next pagination fetch (any subsequent edit) tries again.
        if (reorderRequestIdRef.current !== requestId) return
        setReorderSuggestion(null)
      })
  }, [draftPaper?.id, pageBreakSuggestions, versionType])

  // a3-imposition (plan.md Must Do 1, 裁点4): the a4 branch is the exact
  // same call this useMemo made before this cut — applyA3Imposition only
  // ever runs when printForm==='a3', so a4 output is byte-identical to
  // pre-cut (zero-diff hard断言, verify-a3-imposition.mjs asserts this).
  const previewHtml = useMemo(() => {
    const base = buildA4PreviewHtml(paginatedHtml)
    return draftPaper?.printForm === 'a3' ? applyA3Imposition(base) : base
  }, [paginatedHtml, draftPaper?.printForm])

  // The iframe re-navigates (srcDoc changes → full document reload) whenever
  // previewHtml changes; scrollspy/persistent-button/page-badge reads must
  // wait for the *new* document's onLoad tick rather than trusting stale data
  // tagged by the previous one. Adjusted during render (React's documented
  // "adjusting state when a prop changes" pattern) rather than in an effect,
  // to avoid the extra render-then-effect-then-render round trip.
  const previousPreviewHtmlRef = useRef(previewHtml)
  if (previousPreviewHtmlRef.current !== previewHtml) {
    previousPreviewHtmlRef.current = previewHtml
    if (previewReady) setPreviewReady(false)
  }

  function getGroupIframeOffsetTop(groupId: string): number | null {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return null
    const el = doc.querySelector(`[data-group-id="${CSS.escape(groupId)}"]`)
    if (!el) return null
    return (el as HTMLElement).getBoundingClientRect().top
  }

  // Anchor position for a group's persistent overlay button (draft-desk-b
  // step3, MF-5 — retired the draft-desk-a hover-only sticker), expressed
  // relative to `.draft-paper-col` (its `position: relative` offset parent —
  // see DraftPaperWorkbench.css). iframeRect.top and colRect.top shift by the
  // same amount as the desk scrolls, so their difference is scroll-invariant
  // (see the CSS comment on `.draft-group-actions`) — this is why the anchor
  // effect below only needs to recompute on preview-load/scale changes, never
  // on scroll.
  //
  // SW-3 (multi-page anchor correctness): `getGroupIframeOffsetTop` resolves
  // via `doc.querySelector('[data-group-id="..."]')` — the FIRST matching
  // element in document order. For a group paged.js split across pages
  // (server/draft-paper/paginationDomContract.mjs tags every split fragment,
  // including the fragment inside paged.js's own hidden `<template>` master
  // copy, with the SAME data-group-id — see that module's header comment),
  // `<template>` content is an inert DocumentFragment that `querySelector`
  // never descends into, so the first match found here is always the first
  // RENDERED fragment — i.e. the page the group actually starts on. A button
  // for a group that starts on page 3 anchors to page 3, not page 1.
  function computeAnchorTopFromOffset(offsetTop: number | null): number | null {
    const iframeEl = iframeRef.current
    const colEl = paperColRef.current
    if (!iframeEl || !colEl || offsetTop == null) return null
    const iframeRect = iframeEl.getBoundingClientRect()
    const colRect = colEl.getBoundingClientRect()
    return iframeRect.top - colRect.top + offsetTop * previewScale
  }

  function computeGroupAnchorTop(groupId: string): number | null {
    return computeAnchorTopFromOffset(getGroupIframeOffsetTop(groupId))
  }

  // a3-imposition (plan.md Must Do 3): mirrors getGroupIframeOffsetTop, but
  // resolves the seam marker applyA3Imposition tags with
  // `data-seam-before-group="<groupId>"` instead of a `.question-group`
  // section — see draftPaperPreviewHtml.ts's applyA3Imposition doc comment
  // for why that groupId is the right key to look a suggestion up by.
  function getSeamIframeOffsetTop(groupId: string): number | null {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return null
    const el = doc.querySelector(`[data-seam-before-group="${CSS.escape(groupId)}"]`)
    if (!el) return null
    return (el as HTMLElement).getBoundingClientRect().top
  }

  function computeSeamAnchorTop(groupId: string): number | null {
    return computeAnchorTopFromOffset(getSeamIframeOffsetTop(groupId))
  }

  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const pages = doc.querySelectorAll('.preview-page')
    setPageCount(pages.length || 1)
    const height = doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 1200
    setNativeContentHeight(height)
    setPreviewReady(true)
  }

  // scrollspy: highlight the rail item whose group has scrolled past a fixed
  // trigger line near the top of the viewport. Recomputed on every scroll
  // tick (rAF-throttled) rather than cached, since the desk (not the iframe)
  // owns the scroll — see plan.md's technical constraint on the srcDoc
  // same-origin iframe growing to its content height.
  useEffect(() => {
    if (!previewReady || nonMissingItems.length === 0) return
    let ticking = false
    function updateActive() {
      ticking = false
      const iframeEl = iframeRef.current
      if (!iframeEl) return
      const iframeRect = iframeEl.getBoundingClientRect()
      const TRIGGER_Y = 160
      let candidate: string | null = null
      let candidateTop = -Infinity
      for (const item of nonMissingItems) {
        const offsetTop = getGroupIframeOffsetTop(item.groupId)
        if (offsetTop == null) continue
        const clientTop = iframeRect.top + offsetTop * previewScale
        if (clientTop <= TRIGGER_Y && clientTop > candidateTop) {
          candidate = item.groupId
          candidateTop = clientTop
        }
      }
      setActiveRailGroupId(candidate || nonMissingItems[0].groupId)
    }
    function handleScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(updateActive)
    }
    updateActive()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [previewReady, nonMissingItems, previewScale])

  // draft-desk-b step3 (MF-5): persistent per-group overlay button anchors —
  // recomputed whenever the preview finishes (re)loading or the fit-to-width
  // scale changes (same dependency shape as the scrollspy effect above, for
  // the same reason: previewScale changes the offsetTop*previewScale term in
  // computeGroupAnchorTop). Not scroll-driven (see computeGroupAnchorTop's own
  // comment on scroll-invariance).
  useEffect(() => {
    // Named inner function (matches the scrollspy effect's updateActive shape
    // above) rather than a bare top-level setState call.
    function updateAnchors() {
      if (!previewReady || nonMissingItems.length === 0) {
        setGroupAnchors({})
        return
      }
      const next: Record<string, number> = {}
      for (const item of nonMissingItems) {
        const top = computeGroupAnchorTop(item.groupId)
        if (top != null) next[item.groupId] = top
      }
      setGroupAnchors(next)
    }
    updateAnchors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewReady, nonMissingItems, previewScale])

  // a3-imposition (plan.md Must Do 3, 裁点2): recomputed on the same
  // triggers as groupAnchors above, plus pageBreakSuggestions itself (a
  // suggestion set can change — e.g. after a PATCH resolves — without the
  // preview reloading). Only ever non-empty in A3 mode; A4 renders the
  // suggestion pill inline in draft-group-actions instead (unchanged).
  useEffect(() => {
    function updateSeamAnchors() {
      if (!previewReady || draftPaper?.printForm !== 'a3' || pageBreakSuggestions.length === 0) {
        setSeamAnchors({})
        return
      }
      const next: Record<string, number> = {}
      for (const suggestion of pageBreakSuggestions) {
        const top = computeSeamAnchorTop(suggestion.groupId)
        if (top != null) next[suggestion.groupId] = top
      }
      setSeamAnchors(next)
    }
    updateSeamAnchors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewReady, draftPaper?.printForm, pageBreakSuggestions, previewScale])

  // Rail click / focus-deep-link target. Mirrors PaperBrowsePage.scrollToAnchor's
  // settle-loop (lecture-rail-scroll-fix, STATUS 2026-07-11): a plain
  // scrollIntoView-once misses two real failure modes — (a) the desk's
  // content can still be settling (async printHtml/pagination) and push the
  // target after the first measurement, and (b) `smooth` scrolling is
  // rAF-driven and freezes if the tab is backgrounded/occluded. So: scroll
  // once, then poll every 150ms for 5s; if the target's computed position
  // holds still for 3 ticks but the page hasn't actually reached it, force a
  // `behavior:'auto'` correction. Any user scroll/keyboard input cancels the
  // watch immediately.
  function scrollToGroupInPaper(groupId: string) {
    scrollSettleCancelRef.current?.()
    const computeTarget = () => {
      const iframeEl = iframeRef.current
      if (!iframeEl) return null
      const offsetTop = getGroupIframeOffsetTop(groupId)
      if (offsetTop == null) return null
      const iframeRect = iframeEl.getBoundingClientRect()
      return window.scrollY + iframeRect.top + offsetTop * previewScale - 96
    }
    const initial = computeTarget()
    if (initial == null) return
    window.scrollTo({ top: Math.max(0, initial), behavior: 'auto' })

    const deadline = performance.now() + 5000
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('keydown', cancel)
      if (scrollSettleCancelRef.current === cancel) scrollSettleCancelRef.current = null
    }
    scrollSettleCancelRef.current = cancel
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    window.addEventListener('keydown', cancel)
    let lastTarget = Number.NaN
    let stillChecks = 0
    const settle = () => {
      if (cancelled) return
      if (performance.now() > deadline) {
        cancel()
        return
      }
      const desired = computeTarget()
      if (desired == null) {
        lastTarget = Number.NaN
        stillChecks = 0
      } else {
        stillChecks = Math.abs(desired - lastTarget) < 1 ? stillChecks + 1 : 0
        lastTarget = desired
        if (stillChecks >= 3 && Math.abs(window.scrollY - desired) > 4) {
          window.scrollTo({ top: Math.max(0, desired), behavior: 'auto' })
          stillChecks = 0
        }
      }
      timer = setTimeout(settle, 150)
    }
    timer = setTimeout(settle, 150)
  }

  // A4 page renders at a fixed native width (210mm ≈ 794px). On narrow
  // viewports the sheet no longer fits its container; scale it down to fit
  // instead of letting it clip. Never scale up past 1 on wide screens.
  useEffect(() => {
    const node = a4SheetRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    // a3-imposition (plan.md Must Do 2, 裁点1 方案C): a3's native content
    // width is a whole face (two 794px pages side by side + the fold gap —
    // A3_FACE_NATIVE_WIDTH_PX, kept in draftPaperPreviewHtml.ts next to the
    // CSS that actually sizes `.a3-face` so the two never drift apart), not
    // a single page. Same fit-to-container math either way — never scale
    // up past 1 — so a3 naturally lands around 80-85% on a `min(94vw,
    // 1440px)` container (1440/1612 ≈ 0.89), shrinking further on narrower
    // viewports exactly like the a4 case already does.
    const NATIVE_WIDTH_PX = draftPaper?.printForm === 'a3' ? A3_FACE_NATIVE_WIDTH_PX : 794
    const updateScale = () => {
      const containerWidth = node.clientWidth
      if (!containerWidth) return
      setPreviewScale(Math.min(1, containerWidth / NATIVE_WIDTH_PX))
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(node)
    return () => observer.disconnect()
  }, [previewHtml, draftPaper?.printForm])

  async function persistItems(nextItems: DraftPaperItem[]) {
    if (!draftPaper || !isCurrentDraft()) return false
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, {
        items: nextItems.map((item) => ({ id: item.id, pageBreakBefore: item.pageBreakBefore })),
      })
      if (!isCurrentDraft()) return false
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
      return true
    } catch (error) {
      if (!isCurrentDraft()) return false
      setSaveStatus('error')
      setSaveError(describeError('保存草稿卷', error))
      return false
    }
  }

  function updateTitle(nextTitle: string) {
    if (!isCurrentDraft()) return
    setTitleDraft(nextTitle)
    if (!draftPaper) return
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
    setSaveStatus('saving')
    titleSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const next = await updateDraftPaper(draftPaper.id, { title: nextTitle })
        if (!isCurrentDraft()) return
        setDraftPaper(next)
        setSaveStatus('saved')
        onDraftChanged?.()
      } catch (error) {
        if (!isCurrentDraft()) return
        setSaveStatus('error')
        setSaveError(describeError('保存标题', error))
      }
    }, 450)
  }

  // draft-student-field (E4): blur-save (not debounce-on-keystroke like the
  // title field above) — a name is typically typed once and left, so there is
  // no need for the extra network chatter a 450ms debounce would add here.
  async function saveStudentLabel(nextValue: string) {
    if (!draftPaper || !isCurrentDraft()) return
    const trimmed = nextValue.trim()
    if ((draftPaper.studentLabel || '') === trimmed) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, { studentLabel: trimmed })
      if (!isCurrentDraft()) return
      setDraftPaper(next)
      setStudentLabelDraft(next.studentLabel || '')
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('保存学生', error))
    }
  }

  // print-form (plan.md Must Do 3, 裁点3): optimistic — the count-badge text
  // and suggestion judgment both depend only on `draftPaper.printForm`, so
  // flipping it locally first makes the badge switch format instantly (no
  // paginated HTML re-render needed, only the interpretation changes); the
  // pagination-fetch effect above still re-fetches to get fresh, server-derived
  // pageBreakSuggestions for the new form. Reverts on a failed PATCH.
  async function setPrintForm(nextForm: DraftPrintForm) {
    if (!draftPaper || !isCurrentDraft() || draftPaper.printForm === nextForm) return
    const previous = draftPaper
    setDraftPaper({ ...draftPaper, printForm: nextForm })
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, { printForm: nextForm })
      if (!isCurrentDraft()) return
      setDraftPaper(next)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setDraftPaper(previous)
      setSaveStatus('error')
      setSaveError(describeError('切换打印形态', error))
    }
  }

  // reorder-suggest (plan.md 施工契约 3 "边界"): any OTHER item mutation
  // after a reorder-suggestion apply invalidates its undo snapshot — the
  // snapshot is a specific pre-apply array, and a second unrelated edit
  // (delete/move/page-break-toggle/undo-delete) means PATCHing back to it
  // would silently discard that second edit. Called first thing in every
  // "other" mutation handler below (never inside applyReorderSuggestion /
  // undoReorderSuggestion themselves, which own the snapshot's lifecycle).
  function clearReorderUndo() {
    if (reorderUndoTimerRef.current) window.clearTimeout(reorderUndoTimerRef.current)
    reorderUndoTimerRef.current = null
    setReorderUndoSnapshot(null)
  }

  // similar-workbench-swap (E7): 替换's own undo-snapshot clearer, same
  // shape/lifecycle as clearReorderUndo above — called in the exact same
  // set of "other mutation" handlers (撤销快照互斥: only one of the two
  // snapshot kinds is ever live, since creating either one clears both).
  function clearReplaceUndo() {
    if (replaceUndoTimerRef.current) window.clearTimeout(replaceUndoTimerRef.current)
    replaceUndoTimerRef.current = null
    setReplaceUndoSnapshot(null)
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    if (!draftPaper || !isCurrentDraft()) return
    clearReorderUndo()
    clearReplaceUndo()
    const nextItems = reorderItems(draftPaper.items, itemId, direction)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  function handleDrop(targetId: string) {
    if (!draftPaper || !isCurrentDraft() || !draggedItemId) return
    clearReorderUndo()
    clearReplaceUndo()
    const nextItems = moveItemTo(draftPaper.items, draggedItemId, targetId)
    setDraggedItemId(null)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  async function togglePageBreak(item: DraftPaperItem, nextValue: boolean) {
    if (!draftPaper || !isCurrentDraft()) return
    clearReorderUndo()
    clearReplaceUndo()
    setSaveStatus('saving')
    try {
      const next = await patchDraftPaperItem(draftPaper.id, item.id, { pageBreakBefore: nextValue })
      if (!isCurrentDraft()) return
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('更新分页设置', error))
    }
  }

  async function deleteItem(item: DraftPaperItem) {
    if (!draftPaper || !isCurrentDraft()) return
    clearReorderUndo()
    clearReplaceUndo()
    setSaveStatus('saving')
    try {
      const result = await deleteDraftPaperItem(draftPaper.id, item.id)
      if (!isCurrentDraft()) return
      setDraftPaper(result.draftPaper)
      setTitleDraft(result.draftPaper.title)
      setRemovedItem({
        generation: draftGeneration,
        groupId: result.removed.groupId,
        orderIndex: result.removed.orderIndex,
        pageBreakBefore: result.removed.pageBreakBefore,
      })
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = window.setTimeout(() => setRemovedItem(null), 8000)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('删除题组', error))
    }
  }

  async function undoDelete() {
    if (!draftPaper || !isCurrentDraft() || !removedItem || removedItem.generation !== draftGeneration) return
    clearReorderUndo()
    clearReplaceUndo()
    setSaveStatus('saving')
    try {
      const { groupId, orderIndex, pageBreakBefore } = removedItem
      const next = await restoreDraftPaperItem(draftPaper.id, { groupId, orderIndex, pageBreakBefore })
      if (!isCurrentDraft()) return
      setDraftPaper(next)
      setTitleDraft(next.title)
      setRemovedItem(null)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('撤销删除', error))
    }
  }

  // reorder-suggest (plan.md 施工契约 3 "应用"): 快照当前 items 原数组 →
  // 乐观 setDraftPaper 新序 → persistItems(建议序) — that PATCH changes
  // draftPaperPaginationSignature (item order is part of it), so the next
  // pagination fetch is a REAL re-render, not a cache hit; if the server's
  // own dry-run verdict was somehow wrong, the fresh pageBreakSuggestions
  // coming back from that real render is the natural second check (no
  // separate re-verification step needed here).
  async function applyReorderSuggestion() {
    if (!draftPaper || !isCurrentDraft() || !reorderSuggestion) return
    clearReplaceUndo()
    const snapshot = draftPaper.items
    const byId = new Map(draftPaper.items.map((item) => [item.id, item]))
    const orderedItems = reorderSuggestion.order
      .map((id) => byId.get(id))
      .filter((item): item is DraftPaperItem => Boolean(item))
    // Fail-safe, not expected in practice: the suggestion's order is a
    // permutation of exactly the items it was dry-run against — but if the
    // draft changed underneath it, tack on anything the order missed rather
    // than silently dropping an item.
    const coveredIds = new Set(orderedItems.map((item) => item.id))
    const nextItems = [...orderedItems, ...draftPaper.items.filter((item) => !coveredIds.has(item.id))]
    setDraftPaper({ ...draftPaper, items: nextItems })
    if (!await persistItems(nextItems) || !isCurrentDraft()) return
    setReorderUndoSnapshot({ generation: draftGeneration, items: snapshot })
    if (reorderUndoTimerRef.current) window.clearTimeout(reorderUndoTimerRef.current)
    reorderUndoTimerRef.current = window.setTimeout(() => setReorderUndoSnapshot(null), 8000)
  }

  async function undoReorderSuggestion() {
    if (!draftPaper || !isCurrentDraft() || !reorderUndoSnapshot || reorderUndoSnapshot.generation !== draftGeneration) return
    const snapshot = reorderUndoSnapshot.items
    if (reorderUndoTimerRef.current) window.clearTimeout(reorderUndoTimerRef.current)
    reorderUndoTimerRef.current = null
    setReorderUndoSnapshot(null)
    setDraftPaper({ ...draftPaper, items: snapshot })
    await persistItems(snapshot)
  }

  // similar-workbench-swap (E7, plan.md "⇄ 入口"): opens/closes/retargets
  // the swap drawer. Clicking a DIFFERENT sticker's ⇄ while one is already
  // open re-targets straight to the new seed (no intermediate 收起) —
  // clicking the CURRENT seed's own ⇄ (or the drawer's 返回目录 button,
  // wired to the same handler below) collapses back to the directory.
  function loadSwapCandidates(groupId: string) {
    if (!isCurrentDraft()) return
    setSwapRequest({ status: 'loading' })
    fetchSimilarPassages(groupId)
      .then((data) => { if (isCurrentDraft()) setSwapRequest({ status: 'ready', data }) })
      .catch((error) => { if (isCurrentDraft()) setSwapRequest({ status: 'error', message: describeError('加载相似篇章', error) }) })
  }

  function handleSwapToggle(item: DraftPaperItem) {
    if (!isCurrentDraft()) return
    if (swapSeedItemId === item.id) {
      setSwapSeedItemId(null)
      setSwapRequest(null)
      return
    }
    setSwapSeedItemId(item.id)
    loadSwapCandidates(item.groupId)
  }

  function handleSwapCollapse() {
    setSwapSeedItemId(null)
    setSwapRequest(null)
  }

  function handleSwapRetry() {
    if (!swapSeedItem) return
    loadSwapCandidates(swapSeedItem.groupId)
  }

  // similar-workbench-swap (E7, plan.md 施工要点 4 "替换这篇"): 候选组接管
  // 原贴纸的位置与 pageBreakBefore — 分页是位置意图，随槽位不随内容. No
  // single PATCH covers "swap this slot's content" (updateDraftPaper's
  // `items` field only ever touches order/pageBreakBefore on EXISTING item
  // ids — Forbidden keeps server/** untouched, so no new endpoint either),
  // so this is delete-then-insert-at-the-same-index through the two
  // service calls that already exist (deleteDraftPaperItem +
  // addGroupToDraftPaper) — both go through services/draftPapers.ts, never
  // a bespoke bypass fetch (verify anchor: "非旁路 fetch").
  async function applySwapReplace(candidateGroupId: string) {
    if (!draftPaper || !isCurrentDraft() || !swapSeedItem) return
    const seedIndex = draftPaper.items.findIndex((entry) => entry.id === swapSeedItem.id)
    if (seedIndex < 0) return
    clearReorderUndo()
    clearReplaceUndo()
    const pageBreakBefore = swapSeedItem.pageBreakBefore
    setSaveStatus('saving')
    setSaveError('')
    try {
      // CR MF-1：先加后删（两跳非原子的安全序）——加入失败=卷面零变化可
      // 直接重试；加入成功而删除失败=可见的相邻重复（老师手动移除即自愈），
      // 绝不静默丢种子。旧的先删后加序在「删成功→加失败」时静默丢种子题、
      // 且重试因删已删项必然报错，只能刷新才暴露丢失。
      const inserted = await addGroupToDraftPaper(draftPaper.id, candidateGroupId, {
        insertIndex: seedIndex,
        pageBreakBefore,
      })
      // Finish both steps against the captured draft even after navigation;
      // only publishing the response/undo state belongs to the live generation.
      let deleteResult
      try {
        deleteResult = await deleteDraftPaperItem(draftPaper.id, swapSeedItem.id)
      } catch (error) {
        if (!isCurrentDraft()) return
        // 半截态如实入面：新篇已在种子旁，种子未删——呈现重复而非丢失，
        // 不设撤销快照（状态不是一次完整替换）。
        setDraftPaper(inserted)
        setTitleDraft(inserted.title)
        setSaveStatus('error')
        setSaveError(describeError('替换第二步（移除原篇）', error) + '——新篇已加入，原篇仍在卷中，可手动移除原篇完成替换')
        onDraftChanged?.()
        setSwapSeedItemId(null)
        setSwapRequest(null)
        return
      }
      if (!isCurrentDraft()) return
      setDraftPaper(deleteResult.draftPaper)
      setTitleDraft(deleteResult.draftPaper.title)
      setSaveStatus('saved')
      onDraftChanged?.()
      const addedItem = inserted.items.find((entry) => entry.groupId === candidateGroupId)
      if (addedItem) {
        setReplaceUndoSnapshot({
          // 撤销坐标用「操作前」的种子 orderIndex（1-based，restore 端点
          // 语义，store 内 -1 换算 insertIndex）：先加后删序下
          // deleteResult.removed.orderIndex 已被插入推后一位，按它恢复会
          // 错一格——撤销路径先删新篇再复原种子，正确落点是操作前原位。
          removed: {
            generation: draftGeneration,
            groupId: deleteResult.removed.groupId,
            orderIndex: swapSeedItem.orderIndex,
            pageBreakBefore,
          },
          addedItemId: addedItem.id,
        })
        if (replaceUndoTimerRef.current) window.clearTimeout(replaceUndoTimerRef.current)
        replaceUndoTimerRef.current = window.setTimeout(() => setReplaceUndoSnapshot(null), 8000)
      }
      // 替换后收起回目录 — the seed itemId this drawer was anchored to no
      // longer exists (it's the item just deleted above), so there is no
      // valid "keep browsing more replacements for this same slot" state to
      // stay open in.
      setSwapSeedItemId(null)
      setSwapRequest(null)
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('替换题组', error))
    }
  }

  async function undoSwapReplace() {
    if (!draftPaper || !isCurrentDraft() || !replaceUndoSnapshot || replaceUndoSnapshot.removed.generation !== draftGeneration) return
    const snapshot = replaceUndoSnapshot
    if (replaceUndoTimerRef.current) window.clearTimeout(replaceUndoTimerRef.current)
    replaceUndoTimerRef.current = null
    setReplaceUndoSnapshot(null)
    setSaveStatus('saving')
    setSaveError('')
    try {
      await deleteDraftPaperItem(draftPaper.id, snapshot.addedItemId)
      const { groupId, orderIndex, pageBreakBefore } = snapshot.removed
      const restored = await restoreDraftPaperItem(draftPaper.id, { groupId, orderIndex, pageBreakBefore })
      if (!isCurrentDraft()) return
      setDraftPaper(restored)
      setTitleDraft(restored.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('撤销替换', error))
    }
  }

  // similar-workbench-swap (E7, plan.md 施工要点 4 "加入"): inserted right
  // AFTER the seed item — "老师就在这个位置工作，邻插不跳尾" — never at the
  // volume's end. No undo (C8/E2/E6 convention: 删除本就有撤销兜底), so the
  // drawer stays open afterward (unlike 替换 above, the seed item itself is
  // untouched — nothing invalidates the drawer's own anchor).
  async function applySwapAdd(candidateGroupId: string) {
    if (!draftPaper || !isCurrentDraft() || !swapSeedItem) return
    const seedIndex = draftPaper.items.findIndex((entry) => entry.id === swapSeedItem.id)
    if (seedIndex < 0) return
    clearReorderUndo()
    clearReplaceUndo()
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await addGroupToDraftPaper(draftPaper.id, candidateGroupId, { insertIndex: seedIndex + 1 })
      if (!isCurrentDraft()) return
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
      if (swapAddToastTimerRef.current) window.clearTimeout(swapAddToastTimerRef.current)
      setSwapAddToastMessage('已加入草稿卷')
      swapAddToastTimerRef.current = window.setTimeout(() => setSwapAddToastMessage(null), 2200)
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(describeError('加入草稿卷', error))
    }
  }

  async function exportPdf(mode: FileSaveMode = 'download', pageLayout: 'natural' | 'friendly8' | 'friendly10' = 'natural') {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('idle')
    setExportError('')
    setExportSuccessMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${draftPaper.title || '英语草稿卷'}-${versionType === 'teacher' ? '教师卷' : '学生卷'}.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setExportStatus('exporting')
      const { crossingGroupCount, splitOptionBankCount } = await downloadDraftPaperPdf(draftPaper.id, versionType, target, pageLayout)
      setExportStatus('exported')
      const savedMessage = target.kind === 'download'
        ? target.fallbackFromSaveAs ? '当前浏览器不支持系统另存为，已改为普通下载。' : 'PDF 已开始下载。'
        : 'PDF 已保存到所选位置。'
      setExportSuccessMessage(savedMessage + (crossingGroupCount > 0
        ? ` 已保持指定页数和正文版式，仍有 ${crossingGroupCount} 个题组跨 A3 正反面，请检查分页。` : '')
        + (splitOptionBankCount > 0 ? ` 为保持指定页数，有 ${splitOptionBankCount} 个选项组跨页，单条选项保持完整，请检查。` : ''))
    } catch (error) {
      setExportStatus('error')
      const fixedLayoutMessage = pageLayout !== 'natural' && error instanceof Error
        && /^(无法生成指定页数的友好 PDF：|8／10 页版需要|10 页友好版需要完整|试卷内容超出排版区域：)/.test(error.message)
        ? error.message : null
      setExportError(fixedLayoutMessage || describeError(mode === 'save-as' ? '另存为 PDF' : '导出 PDF', error))
    }
  }

  async function openSpaceDialog() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setSpaceDialogOpen(true)
    setSpaceStatus('loading')
    setSpaceMessage('')
    setSpaceFileName(`${draftPaper.title || '英语草稿卷'}-学生版.pdf`)
    try {
      const snapshot = await fetchMySpace()
      setSpaceFolders(snapshot.folders)
      setSpaceFolderId(snapshot.folders[0]?.id || '')
      setSpaceStatus('idle')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('读取个人空间文件夹', error))
    }
  }

  async function createFolderInDialog() {
    const name = spaceNewFolderName.trim()
    if (!name) return
    setSpaceStatus('saving')
    setSpaceMessage('')
    try {
      const folder = await createMySpaceFolder(name)
      setSpaceFolders((folders) => [folder, ...folders.filter((entry) => entry.id !== folder.id)])
      setSpaceFolderId(folder.id)
      setSpaceNewFolderName('')
      setSpaceStatus('idle')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('新建文件夹', error))
    }
  }

  async function saveToMySpace() {
    if (!draftPaper) return
    setSpaceStatus('saving')
    setSpaceMessage('')
    try {
      await saveDraftPaperToMySpace({
        draftPaperId: draftPaper.id,
        fileName: spaceFileName,
        folderId: spaceFolderId || null,
      })
      // #14: collapse the dialog immediately on success — no lingering
      // "saved, but still open with a live 保存 button" state.
      setSpaceDialogOpen(false)
      setSpaceStatus('idle')
      if (savedToastTimerRef.current) window.clearTimeout(savedToastTimerRef.current)
      setSavedToastMessage('已保存到个人空间。')
      savedToastTimerRef.current = window.setTimeout(() => setSavedToastMessage(null), 6000)
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(describeError('保存到个人空间', error))
    }
  }

  // draft-desk-b step4 (owner 拍板 2026-07-12, plan.md "步4" — 浏览器打印并入):
  // prints the same server-rendered, DOM-contract-tagged pagination HTML the A4
  // preview iframe already shows (the `paginatedHtml` state this component fetches
  // via fetchDraftPaperPagination — see the pagination-fetch effect above), not the
  // old draftPaper.printHtml (a THIRD, independently-rendered HTML string built by
  // server/print-renderer.mjs's buildPrintHtml, never run through paged.js). That
  // old field was the last remaining "third pagination engine" parity gap this cut
  // exists to close — this browser-print path, the on-screen preview, and the PDF
  // download now all trace back to the SAME single paged.js render (paged.js's own
  // @page rules + already-computed page boxes govern the print output; the
  // `@media screen` card styling this component layers onto `paginatedHtml` for the
  // on-screen iframe never applies during print — DP-1 acceptance check (d) already
  // proved a serialized paged.js DOM prints consistently with what it displays).
  // `draftPaper.printHtml` itself stays on the DraftPaper API/domain type (API
  // surface unchanged) even though this was its last client-side consumer — see
  // this cut's completion report.
  function browserPrint() {
    if (!paginatedHtml) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setExportStatus('error')
      setExportError('浏览器阻止了打印窗口，请允许弹窗后重试。')
      return
    }
    printWindow.opener = null
    printWindow.document.open()
    printWindow.document.write(paginatedHtml)
    printWindow.document.close()
    printWindow.focus()
    printWindow.setTimeout(() => printWindow.print(), 250)
  }

  if (loadStatus === 'loading') {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <main className="draft-workbench-shell"><p className="draft-loading" role="status" aria-live="polite">正在打开草稿卷…</p></main>
      </>
    )
  }

  if (loadStatus === 'error' || !draftPaper) {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <main className="draft-workbench-shell">
          <p className="draft-error">{loadError || '没找到这份草稿卷，可能已被删除。回到找题页重新组一份吧。'}</p>
        </main>
      </>
    )
  }

  // workbench-header-unify Locked Decision 2/5: 学生版/教师版 and A4/A3 render
  // twice — once as the wide head-row controls (hidden ≤980px), once inside
  // the "⋯" panel (shown only ≤980px, plan.md's 窄屏退化补充) — same handlers
  // both places, just two visibility-toggled mounts of the identical control,
  // so there is exactly one source of truth for versionType/printForm state.
  const versionToggleControl = (
    <div className="draft-version-toggle" role="group" aria-label="导出版本">
      <button
        type="button"
        className={versionType === 'student' ? 'active' : ''}
        aria-pressed={versionType === 'student'}
        onClick={() => setVersionType('student')}
      >
        学生版
      </button>
      <button
        type="button"
        className={versionType === 'teacher' ? 'active' : ''}
        aria-pressed={versionType === 'teacher'}
        onClick={() => setVersionType('teacher')}
      >
        教师版
      </button>
    </div>
  )

  const formToggleControl = (
    <div className="draft-version-toggle draft-form-toggle" role="group" aria-label="打印形态">
      <button
        type="button"
        className={draftPaper.printForm === 'a4' ? 'active' : ''}
        aria-pressed={draftPaper.printForm === 'a4'}
        onClick={() => void setPrintForm('a4')}
      >
        A4 散页
      </button>
      <button
        type="button"
        className={draftPaper.printForm === 'a3' ? 'active' : ''}
        aria-pressed={draftPaper.printForm === 'a3'}
        onClick={() => void setPrintForm('a3')}
      >
        A3 对折
      </button>
    </div>
  )

  const exportMenuControl = (
    <div className="draft-export-menu" ref={exportMenuRef}>
      <button
        type="button"
        className="draft-export-menu-trigger"
        aria-haspopup="true"
        aria-expanded={exportMenuOpen}
        onClick={() => setExportMenuOpen((open) => !open)}
      >
        导出
      </button>
      {exportMenuPresence.mounted && (
        <div className="draft-export-menu-panel" role="menu" data-visible={exportMenuPresence.visible}>
          <button
            type="button"
            role="menuitem"
            disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'}
            onClick={() => {
              setExportMenuOpen(false)
              void exportPdf()
            }}
          >
            <FileDown size={15} /> 下载 PDF（{versionType === 'teacher' ? '教师版' : '学生版'}）
          </button>
          {versionType === 'student' && <button type="button" role="menuitem" disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'} onClick={() => { setExportMenuOpen(false); void exportPdf('download', 'friendly8') }}>
            <FileDown size={15} /> 8 页友好版（无听力）
          </button>}
          {versionType === 'student' && <button type="button" role="menuitem" disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'} onClick={() => { setExportMenuOpen(false); void exportPdf('download', 'friendly10') }}>
            <FileDown size={15} /> 10 页友好版（含听力）
          </button>}
          <button
            type="button"
            role="menuitem"
            disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'}
            onClick={() => {
              setExportMenuOpen(false)
              void exportPdf('save-as')
            }}
          >
            <Save size={15} /> 另存为 PDF…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={draftPaper.items.length === 0}
            onClick={() => {
              setExportMenuOpen(false)
              browserPrint()
            }}
          >
            <Printer size={15} /> 浏览器打印
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={draftPaper.items.length === 0 || spaceStatus === 'saving'}
            onClick={() => {
              setExportMenuOpen(false)
              void openSpaceDialog()
            }}
          >
            <Archive size={15} /> 保存到个人空间
          </button>
        </div>
      )}
    </div>
  )

  const pagesMetaText = draftPaper.printForm === 'a3'
    ? `共 ${pageCount} 版 · 对折 ${Math.ceil(pageCount / 4)} 张 · A3`
    : `共 ${pageCount} 页 · 双面 ${Math.ceil(pageCount / 2)} 张 · A4`

  return (
    <>
    <AppTopbar
      {...props.shellNav}
      pageTitle={titleDraft || draftPaper.title}
      pageTitleEditable
      onPageTitleChange={updateTitle}
      onBack={onBackToWorkbench}
      actionsSlot={
        <>
          {/* workbench-header-unify Locked Decision 2: 学生（可选）/ 最近草稿卷
              / 自动保存状态 三项降级收进这枚安静「⋯」菜单——字段行为原样
              (学生 blur 保存、最近切换走现有 pushState 逻辑、保存状态实时显示)。 */}
          <div className="draft-more-menu" ref={moreMenuRef}>
            <button
              type="button"
              // CR SW-1: save errors must stay visible with the menu closed —
              // the trigger wears a danger dot while saveStatus is 'error'.
              className={`draft-more-menu-trigger${saveStatus === 'error' ? ' has-save-error' : ''}`}
              aria-haspopup="true"
              aria-expanded={moreMenuOpen}
              aria-label={saveStatus === 'error' ? `草稿卷更多信息（保存出错：${saveError}）` : '草稿卷更多信息'}
              title={saveStatus === 'error' ? `保存出错：${saveError}` : '学生 / 最近草稿卷 / 保存状态'}
              onClick={() => setMoreMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={16} />
            </button>
            {moreMenuPresence.mounted && (
              <div className="draft-more-menu-panel" role="menu" data-visible={moreMenuPresence.visible}>
                <label className="draft-student-field">
                  <span>学生（可选）</span>
                  <input
                    value={studentLabelDraft}
                    placeholder="未填写"
                    onChange={(event) => setStudentLabelDraft(event.target.value)}
                    onBlur={(event) => void saveStudentLabel(event.target.value)}
                  />
                </label>
                <label className="draft-recent-select-field">
                  <span>最近草稿卷</span>
                  <select
                    className="draft-recent-select"
                    value={draftPaper.id}
                    onChange={(event) => {
                      const id = event.target.value
                      // In-component switch path (pushState + setDraftPaper,
                      // loadDraft never re-runs): clear the previous draft's
                      // undo snapshots so undo can't fire against the new one.
                      resetTransientStateForDraftSwitch()
                      const generation = draftGenerationRef.current
                      const url = new URL(window.location.href)
                      url.searchParams.set('view', 'draft-paper')
                      url.searchParams.set('draftPaperId', id)
                      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`)
                      setVersionType('student')
                      void fetchDraftPaper(id).then((next) => {
                        if (generation !== draftGenerationRef.current) return
                        setDraftGeneration(generation)
                        setDraftPaper(next)
                        setTitleDraft(next.title)
                        setStudentLabelDraft(next.studentLabel || '')
                      }).catch((error) => {
                        if (generation !== draftGenerationRef.current) return
                        setLoadStatus('error')
                        setLoadError(describeError('打开草稿卷', error))
                      })
                    }}
                  >
                    {recentDrafts.map((draft) => (
                      <option key={draft.id} value={draft.id}>{draft.title}</option>
                    ))}
                  </select>
                </label>
                <span className={`draft-save-status ${saveStatus}`}>
                  {saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? saveError : '自动保存'}
                </span>
                {/* Locked Decision 5 窄屏退化补充: ≤980px 时 A4/A3 与版本切换
                    一并被「⋯」吸收——duplicated mounts of the same controls,
                    shown only at that breakpoint (see CSS). */}
                <div className="draft-more-menu-narrow-controls">
                  {versionToggleControl}
                  {formToggleControl}
                </div>
              </div>
            )}
          </div>
          <span className="draft-topbar-wide-toggle">{versionToggleControl}</span>
          <span className="draft-topbar-wide-toggle">{formToggleControl}</span>
          {exportMenuControl}
        </>
      }
    />
    <div className="draft-workbench-shell">
      {draftPaper.items.length === 0 && (
        <p className="draft-empty-export" role="status">请先添加题组，再导出 PDF 或打印。</p>
      )}
      {migrationNotice && <p className="draft-warning" role="status">{migrationNotice}</p>}
      {exportStatus === 'error' && <p className="draft-error">{exportError}</p>}
      {exportStatus === 'exported' && <p className="draft-success">{exportSuccessMessage}</p>}

      {/* reorder-suggest (plan.md 施工契约 3 "卡"): 卷头行之下、纸面之上 —
          same slot as the notices above, ahead of <main>'s preview desk. */}
      {reorderSuggestionCard && (
        <div className="draft-reorder-suggestion" role="status">
          <span>{reorderSuggestionCard.text}</span>
          <button type="button" className="draft-reorder-suggestion-act" onClick={() => void applyReorderSuggestion()}>
            调整顺序 →
          </button>
        </div>
      )}

      <main className="draft-workbench-layout">
        <h1 className="visually-hidden">{draftPaper.title}</h1>
        <section className="draft-preview-desk" aria-label="A4 预览">
          {/* ui-northstar: 目录在纸的左边，与整卷页同侧（DOM 顺序即视觉
              顺序，不用 grid order 绕）。 */}
          <DraftPaperRail
            items={draftPaper.items}
            activeGroupId={activeRailGroupId}
            onItemClick={scrollToGroupInPaper}
            onDragStart={(itemId) => setDraggedItemId(itemId)}
            onDrop={handleDrop}
            onMoveItem={moveItem}
            onDeleteItem={deleteItem}
            metaText={pagesMetaText}
            swapDrawer={
              swapSeedItem && swapRequest
                ? {
                    seedTitle: swapSeedItem.questionGroup?.passageTitle || swapSeedItem.questionGroup?.title || swapSeedItem.groupId,
                    recipeSummary: similarPassagesRecipeSummary(swapSeedItem.questionGroup?.groupType || 'reading'),
                    request: swapRequest,
                    existingGroupIds: draftGroupIds,
                    questionGroupById,
                    onCollapse: handleSwapCollapse,
                    onRetry: handleSwapRetry,
                    onReplace: (groupId) => void applySwapReplace(groupId),
                    onAdd: (groupId) => void applySwapAdd(groupId),
                  }
                : null
            }
          />

          <div className={`draft-paper-col${draftPaper.printForm === 'a3' ? ' is-a3' : ''}`} ref={paperColRef}>
            <div
              className={`draft-a4-sheet${draftPaper.printForm === 'a3' ? ' is-a3' : ''}`}
              ref={a4SheetRef}
              style={{ height: `${nativeContentHeight * previewScale}px` }}
            >
              {draftPaper.items.length === 0 ? (
                <div className="draft-a4-empty">请先添加题组</div>
              ) : previewHtml ? (
                <>
                  <iframe
                    ref={iframeRef}
                    title="草稿卷 A4 预览"
                    srcDoc={previewHtml}
                    onLoad={handleIframeLoad}
                    style={{
                      height: `${nativeContentHeight}px`,
                      // a3-imposition (plan.md Must Do 2): the iframe's own
                      // CSS width is fixed to the imposition's native
                      // (unscaled) face width — see draftPaperPreviewHtml.ts's
                      // A3_FACE_NATIVE_WIDTH_PX doc comment — so the SAME
                      // transform:scale mechanism the a4 branch already uses
                      // (never touched below) also shrinks a3's wider content
                      // to fit. a4 branch is byte-identical to before this cut.
                      ...(draftPaper.printForm === 'a3'
                        ? { width: `${A3_FACE_NATIVE_WIDTH_PX}px`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }
                        : previewScale < 1
                          ? { transform: `scale(${previewScale})`, transformOrigin: 'top left' }
                          : null),
                    }}
                  />
                  {/* draft-desk-b step3 (PO-2 简单版): the old preview stays fully
                      visible/interactive while a re-render is in flight — this is
                      the only visible sign a repagination is happening. */}
                  {paginationStatus === 'loading' && (
                    <div className="draft-a4-repaginating" role="status">重新排版中…</div>
                  )}
                  {/* draft-desk-b step4 (SW-I, cr-step3-lite.md): a repagination
                      FAILURE while a stale preview is still on screen previously left
                      no visible sign at all — the error copy only rendered in the
                      empty-state branch below, which this branch (previewHtml
                      truthy) never reaches, so the user silently kept looking at
                      outdated content with no indication anything had gone wrong.
                      Reuses the exact same badge shell as the loading state above
                      (position/shape/pointer-events unchanged, "别过度设计") — only
                      the copy and an added modifier class (background color) differ. */}
                  {paginationStatus === 'error' && (
                    <div className="draft-a4-repaginating draft-a4-repaginating--error" role="status">
                      {paginationError || '重新排版失败，当前显示旧版预览'}
                    </div>
                  )}
                </>
              ) : (
                <div className="draft-a4-empty">
                  {paginationStatus === 'error' ? paginationError || '分页预览生成失败，请稍后重试。' : '正在生成分页预览...'}
                </div>
              )}
            </div>

            {/* draft-desk-b step3 (裁点1 retirement, MF-5): one ALWAYS-VISIBLE
                overlay button cluster per question group, replacing the old
                hover-only sticker — anchored via the groupAnchors effect above
                (computeGroupAnchorTop), same up/down/page-break/delete actions
                the rail's own buttons call (moveItem/togglePageBreak/deleteItem
                below — one shared handler set, not a second implementation). */}
            {nonMissingItems.map((item) => {
              const anchorTop = groupAnchors[item.groupId]
              if (anchorTop == null) return null
              const fullIndex = draftPaper.items.findIndex((entry) => entry.id === item.id)
              const canPageBreakBefore = fullIndex > 0
              // print-form (plan.md Must Do 5, PO-1 收账): quiet annotation only —
              // clicking applies the SAME PATCH the manual 前置分页 button below
              // already sends (pageBreakBefore: true); the suggestion disappears on
              // its own once the next pagination fetch resolves (signature change ->
              // real re-render -> group no longer spans a page boundary). Never
              // auto-applied (裁点5).
              // a3-imposition (plan.md Must Do 3, 裁点2): in A3 mode the
              // suggestion pill moves to the face/sheet seam it actually
              // belongs to (rendered separately below, anchored via
              // seamAnchors) — suppressed here so it doesn't also show
              // pinned to the group's own action cluster. A4 keeps the
              // exact pre-cut behavior (裁点4).
              const suggestion = canPageBreakBefore && draftPaper.printForm !== 'a3'
                ? pageBreakSuggestions.find((entry) => entry.groupId === item.groupId)
                : undefined
              return (
                <div key={item.id} className="draft-group-actions" style={{ top: `${anchorTop}px` }}>
                  {suggestion && (
                    <button
                      type="button"
                      className="draft-group-suggestion"
                      title={suggestion.reason}
                      onClick={() => void togglePageBreak(item, true)}
                    >
                      建议前置分页 · 跨页断篇
                    </button>
                  )}
                  {/* similar-workbench-swap (E7, plan.md 施工要点 2 "⇄ 入口
                      gate"): only the four v2-supported groupTypes get a
                      button here — writing (and every other groupType)
                      hides it entirely, same 隐藏式降级 convention as E6's
                      own CTA. */}
                  {item.questionGroup && SWAP_SUPPORTED_GROUP_TYPES.has(item.questionGroup.groupType) && (
                    <button
                      type="button"
                      aria-label={swapSeedItemId === item.id ? '收起换篇' : '换一篇相似篇章'}
                      title={swapSeedItemId === item.id ? '收起换篇' : '换一篇相似篇章'}
                      aria-pressed={swapSeedItemId === item.id}
                      onClick={() => handleSwapToggle(item)}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  )}
                  <div
                    className="draft-group-actions-menu"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setOpenGroupActionsItemId(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setOpenGroupActionsItemId(null)
                        event.currentTarget.querySelector<HTMLButtonElement>('.draft-group-actions-menu-trigger')?.focus()
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="draft-group-actions-menu-trigger"
                      aria-label="更多题组操作"
                      title="更多题组操作"
                      aria-expanded={openGroupActionsItemId === item.id}
                      aria-controls={`draft-group-actions-${item.id}`}
                      onClick={() => setOpenGroupActionsItemId((openId) => openId === item.id ? null : item.id)}
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                    {openGroupActionsItemId === item.id && (
                      <div
                        id={`draft-group-actions-${item.id}`}
                        className="draft-group-actions-menu-panel"
                        role="group"
                        aria-label="题组操作"
                      >
                        <button
                          type="button"
                          disabled={fullIndex <= 0}
                          onClick={() => {
                            setOpenGroupActionsItemId(null)
                            moveItem(item.id, -1)
                          }}
                        >
                          <ArrowUp size={14} aria-hidden="true" />
                          上移
                        </button>
                        <button
                          type="button"
                          disabled={fullIndex >= draftPaper.items.length - 1}
                          onClick={() => {
                            setOpenGroupActionsItemId(null)
                            moveItem(item.id, 1)
                          }}
                        >
                          <ArrowDown size={14} aria-hidden="true" />
                          下移
                        </button>
                        {canPageBreakBefore && (
                          <button
                            type="button"
                            aria-pressed={item.pageBreakBefore}
                            onClick={() => {
                              setOpenGroupActionsItemId(null)
                              void togglePageBreak(item, !item.pageBreakBefore)
                            }}
                          >
                            <SeparatorHorizontal size={14} aria-hidden="true" />
                            {item.pageBreakBefore ? '取消分页' : '前置分页'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setOpenGroupActionsItemId(null)
                            void deleteItem(item)
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          移除
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* a3-imposition (plan.md Must Do 3, 裁点2): the suggestion pill's
                A3 home — anchored to the face/sheet seam it belongs to
                (seamAnchors, keyed by the same suggestion.groupId
                applyA3Imposition tagged the seam with), same click behavior
                (前置分页 PATCH) as the A4 per-group pill above. */}
            {draftPaper.printForm === 'a3' &&
              pageBreakSuggestions.map((suggestion) => {
                const anchorTop = seamAnchors[suggestion.groupId]
                if (anchorTop == null) return null
                const item = nonMissingItems.find((entry) => entry.groupId === suggestion.groupId)
                if (!item) return null
                return (
                  <button
                    key={`seam-${suggestion.groupId}`}
                    type="button"
                    className="draft-seam-suggestion"
                    style={{ top: `${anchorTop}px` }}
                    title={suggestion.reason}
                    onClick={() => void togglePageBreak(item, true)}
                  >
                    {suggestion.reason} · 建议前置分页
                  </button>
                )
              })}
          </div>
        </section>
      </main>

      {removedItemToast.rendered && (
        <div className="draft-undo-toast" role="status" data-visible={removedItemToast.visible}>
          {/* C8 (trust-cracks) — 措辞更新: 动作按钮本就叫"移除"；题组仍在
              题库里，undo 只是撤回本卷的移出动作，旧文案"删除"二字读起来
              像题目本身被销毁了，故改为下面这句。 */}
          <span>题组已移出</span>
          <button type="button" onClick={undoDelete}>
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
      {/* reorder-suggest (plan.md 施工契约 3 "应用"): 复用 undo-toast 组件
          模式 — same fixed-position toast + RotateCcw 撤销 button shape as
          removedItemToast above, keyed off reorderUndoSnapshot's own presence
          instead of a payload value. */}
      {reorderUndoToastPresence.mounted && (
        <div className="draft-undo-toast" role="status" data-visible={reorderUndoToastPresence.visible}>
          <span>顺序已调整</span>
          <button type="button" onClick={() => void undoReorderSuggestion()}>
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
      {/* similar-workbench-swap (E7, plan.md "替换这篇...可撤销"): same
          undo-toast shape as reorderUndoToastPresence above, keyed off
          replaceUndoSnapshot's own presence. */}
      {replaceUndoToastPresence.mounted && (
        <div className="draft-undo-toast" role="status" data-visible={replaceUndoToastPresence.visible}>
          <span>已替换这篇</span>
          <button type="button" onClick={() => void undoSwapReplace()}>
            <RotateCcw size={14} /> 撤销
          </button>
        </div>
      )}
      {/* similar-workbench-swap (E7, plan.md "加入...沿用「已加入」语言，
          无撤销"): plain toast, no action button — mirrors
          SimilarPassagesPanel's own handleAdd toast shape/timer (2200ms). */}
      {swapAddToastPresence.rendered && (
        <div className="draft-undo-toast" role="status" data-visible={swapAddToastPresence.visible}>
          <span>{swapAddToastPresence.rendered}</span>
        </div>
      )}
      {savedToastPresence.rendered && (
        <div className="draft-undo-toast" role="status" data-visible={savedToastPresence.visible}>
          <span>{savedToastPresence.rendered}</span>
          {shellNav.onOpenMySpace && (
            <button
              type="button"
              onClick={() => {
                setSavedToastMessage(null)
                shellNav.onOpenMySpace?.()
              }}
            >
              查看个人空间
            </button>
          )}
        </div>
      )}
      {spaceDialogPresence.mounted && (
        <div className="draft-modal-backdrop" role="presentation" data-visible={spaceDialogPresence.visible}>
          <form
            aria-label="保存到个人空间"
            className="draft-save-space-dialog"
            data-visible={spaceDialogPresence.visible}
            onSubmit={(event) => {
              event.preventDefault()
              void saveToMySpace()
            }}
          >
            <div className="draft-dialog-head">
              <strong>保存到个人空间</strong>
              <button type="button" onClick={() => setSpaceDialogOpen(false)}>关闭</button>
            </div>
            <label>
              <span>文件名</span>
              <input value={spaceFileName} onChange={(event) => setSpaceFileName(event.target.value)} />
            </label>
            <label>
              <span>文件夹</span>
              <select value={spaceFolderId} onChange={(event) => setSpaceFolderId(event.target.value)}>
                <option value="">未归档</option>
                {spaceFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>
            <div className="draft-new-folder-row">
              <input
                value={spaceNewFolderName}
                onChange={(event) => setSpaceNewFolderName(event.target.value)}
                placeholder="新建文件夹"
              />
              <button type="button" onClick={createFolderInDialog} disabled={!spaceNewFolderName.trim() || spaceStatus === 'saving'}>
                <FolderPlus size={15} /> 新建
              </button>
            </div>
            {spaceStatus === 'loading' && <p className="draft-dialog-note">正在读取文件夹...</p>}
            {spaceStatus === 'error' && <p className="draft-error">{spaceMessage}</p>}
            <div className="draft-dialog-actions">
              <button type="button" onClick={() => setSpaceDialogOpen(false)}>取消</button>
              <button
                type="submit"
                className="primary-button"
                disabled={spaceStatus === 'saving' || draftPaper.items.length === 0}
              >
                {spaceStatus === 'saving' ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </>
  )
}
