import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArrowDown, ArrowUp, FileDown, FileText, FolderPlus, Printer, RotateCcw, SeparatorHorizontal, Trash2 } from 'lucide-react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import type { DraftPaper, DraftPaperItem, DraftPaperSummary, DraftPrintForm, MySpaceFolder } from '../../domain/questionBank'
import {
  deleteDraftPaperItem,
  downloadDraftPaperDocx,
  downloadDraftPaperPdf,
  fetchCurrentDraftPaper,
  fetchDraftPaper,
  fetchDraftPaperPagination,
  fetchDraftPapers,
  migrateAssemblyBasketToDraftPaper,
  patchDraftPaperItem,
  restoreDraftPaperItem,
  updateDraftPaper,
} from '../../services/draftPapers'
import {
  createMySpaceFolder,
  fetchMySpace,
  saveDraftPaperToMySpace,
} from '../../services/mySpace'
import {
  ASSEMBLY_BASKET_STORAGE_KEY,
  parseAssemblyBasket,
} from '../../paperAssembly/basketPersistence'
import { describeError } from '../shared/errorCopy'
import { scrollBehavior } from '../shared/reducedMotionScroll.ts'
import { useToastPresence, usePresence } from '../shared/useToastPresence.ts'
import { DraftPaperRail } from './DraftPaperRail'
import { A3_FACE_NATIVE_WIDTH_PX, applyA3Imposition, buildA4PreviewHtml } from './draftPaperPreviewHtml'
import './DraftPaperWorkbench.css'

type DraftVersionType = 'student' | 'teacher'

export type DraftPaperWorkbenchProps = {
  draftPaperId?: string | null
  focusGroupId?: string | null
  onBackToWorkbench: () => void
  onDraftChanged?: () => void
  shellNav: AppTopbarNav
}

type RemovedDraftItem = {
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
  const { draftPaperId, focusGroupId, onBackToWorkbench, onDraftChanged, shellNav } = props
  const [draftPaper, setDraftPaper] = useState<DraftPaper | null>(null)
  const [recentDrafts, setRecentDrafts] = useState<DraftPaperSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [studentLabelDraft, setStudentLabelDraft] = useState('')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const titleSaveTimerRef = useRef<number | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const focusedOnceRef = useRef(false)
  const a4SheetRef = useRef<HTMLDivElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
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

  const loadRecentDrafts = useCallback(() => {
    fetchDraftPapers().then(setRecentDrafts).catch(() => setRecentDrafts([]))
  }, [])

  const loadDraft = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError('')
    setMigrationNotice('')
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
      setDraftPaper(next)
      setTitleDraft(next.title)
      setStudentLabelDraft(next.studentLabel || '')
      setVersionType('student')
      setLoadStatus('loaded')
      loadRecentDrafts()
    } catch (error) {
      setLoadStatus('error')
      setLoadError(describeError('打开草稿卷', error))
    }
  }, [draftPaperId, loadRecentDrafts])

  useEffect(() => {
    void loadDraft()
    return () => {
      if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
      if (savedToastTimerRef.current) window.clearTimeout(savedToastTimerRef.current)
    }
  }, [loadDraft])

  useEffect(() => {
    if (!draftPaper || loadStatus !== 'loaded') return
    let cancelled = false
    void fetchDraftPaper(draftPaper.id, versionType).then((next) => {
      if (cancelled) return
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
      const requestId = (paginationRequestIdRef.current += 1)
      setPaginationStatus('loading')
      fetchDraftPaperPagination(draftPaperId, versionType)
        .then((result) => {
          if (paginationRequestIdRef.current !== requestId) return
          setPaginatedHtml(result.paginatedHtml)
          setPaginationStatus('ready')
          setPaginationError('')
          setPageBreakSuggestions(result.pageBreakSuggestions)
        })
        .catch((error) => {
          if (paginationRequestIdRef.current !== requestId) return
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
  }, [draftPaper?.id, draftPaper?.title, itemsLayoutKey, versionType, draftPaper?.printForm])

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
    window.scrollTo({ top: Math.max(0, initial), behavior: scrollBehavior() })

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
    if (!draftPaper) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, {
        items: nextItems.map((item) => ({ id: item.id, pageBreakBefore: item.pageBreakBefore })),
      })
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(describeError('保存草稿卷', error))
    }
  }

  function updateTitle(nextTitle: string) {
    setTitleDraft(nextTitle)
    if (!draftPaper) return
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
    setSaveStatus('saving')
    titleSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const next = await updateDraftPaper(draftPaper.id, { title: nextTitle })
        setDraftPaper(next)
        setSaveStatus('saved')
        onDraftChanged?.()
      } catch (error) {
        setSaveStatus('error')
        setSaveError(describeError('保存标题', error))
      }
    }, 450)
  }

  // draft-student-field (E4): blur-save (not debounce-on-keystroke like the
  // title field above) — a name is typically typed once and left, so there is
  // no need for the extra network chatter a 450ms debounce would add here.
  async function saveStudentLabel(nextValue: string) {
    if (!draftPaper) return
    const trimmed = nextValue.trim()
    if ((draftPaper.studentLabel || '') === trimmed) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, { studentLabel: trimmed })
      setDraftPaper(next)
      setStudentLabelDraft(next.studentLabel || '')
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
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
    if (!draftPaper || draftPaper.printForm === nextForm) return
    const previous = draftPaper
    setDraftPaper({ ...draftPaper, printForm: nextForm })
    setSaveStatus('saving')
    setSaveError('')
    try {
      const next = await updateDraftPaper(draftPaper.id, { printForm: nextForm })
      setDraftPaper(next)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setDraftPaper(previous)
      setSaveStatus('error')
      setSaveError(describeError('切换打印形态', error))
    }
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    if (!draftPaper) return
    const nextItems = reorderItems(draftPaper.items, itemId, direction)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  function handleDrop(targetId: string) {
    if (!draftPaper || !draggedItemId) return
    const nextItems = moveItemTo(draftPaper.items, draggedItemId, targetId)
    setDraggedItemId(null)
    if (nextItems === draftPaper.items) return
    setDraftPaper({ ...draftPaper, items: nextItems })
    void persistItems(nextItems)
  }

  async function togglePageBreak(item: DraftPaperItem, nextValue: boolean) {
    if (!draftPaper) return
    setSaveStatus('saving')
    try {
      const next = await patchDraftPaperItem(draftPaper.id, item.id, { pageBreakBefore: nextValue })
      setDraftPaper(next)
      setTitleDraft(next.title)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(describeError('更新分页设置', error))
    }
  }

  async function deleteItem(item: DraftPaperItem) {
    if (!draftPaper) return
    setSaveStatus('saving')
    try {
      const result = await deleteDraftPaperItem(draftPaper.id, item.id)
      setDraftPaper(result.draftPaper)
      setTitleDraft(result.draftPaper.title)
      setRemovedItem({
        groupId: result.removed.groupId,
        orderIndex: result.removed.orderIndex,
        pageBreakBefore: result.removed.pageBreakBefore,
      })
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = window.setTimeout(() => setRemovedItem(null), 8000)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(describeError('删除题组', error))
    }
  }

  async function undoDelete() {
    if (!draftPaper || !removedItem) return
    setSaveStatus('saving')
    try {
      const next = await restoreDraftPaperItem(draftPaper.id, removedItem)
      setDraftPaper(next)
      setTitleDraft(next.title)
      setRemovedItem(null)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(describeError('撤销删除', error))
    }
  }

  async function exportPdf() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('exporting')
    setExportError('')
    try {
      await downloadDraftPaperPdf(draftPaper.id, versionType)
      setExportStatus('exported')
    } catch (error) {
      setExportStatus('error')
      setExportError(describeError('导出 PDF', error))
    }
  }

  async function exportDocx() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('exporting')
    setExportError('')
    try {
      await downloadDraftPaperDocx(draftPaper.id, versionType)
      setExportStatus('exported')
    } catch (error) {
      setExportStatus('error')
      setExportError(describeError('导出 DOCX', error))
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
        <div className="draft-workbench-shell"><p className="draft-loading">正在打开草稿卷...</p></div>
      </>
    )
  }

  if (loadStatus === 'error' || !draftPaper) {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <div className="draft-workbench-shell">
          <p className="draft-error">{loadError || '没找到这份草稿卷，可能已被删除。回到找题页重新组一份吧。'}</p>
        </div>
      </>
    )
  }

  return (
    <>
    <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
    <div className="draft-workbench-shell">
      <header className="draft-toolbar">
        <div className="draft-toolbar-group draft-toolbar-group-doc">
          <label className="draft-title-field">
            <span>草稿卷标题</span>
            <input value={titleDraft} onChange={(event) => updateTitle(event.target.value)} />
          </label>
          <label className="draft-student-field">
            <span>学生（可选）</span>
            <input
              value={studentLabelDraft}
              placeholder="未填写"
              onChange={(event) => setStudentLabelDraft(event.target.value)}
              onBlur={(event) => void saveStudentLabel(event.target.value)}
            />
          </label>
          <span className={`draft-save-status ${saveStatus}`}>
            {saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? saveError : '自动保存'}
          </span>
          <label className="draft-recent-select-field">
            <span>最近草稿卷</span>
            <select
              className="draft-recent-select"
              value={draftPaper.id}
              onChange={(event) => {
                const id = event.target.value
                const url = new URL(window.location.href)
                url.searchParams.set('view', 'draft-paper')
                url.searchParams.set('draftPaperId', id)
                window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`)
                setVersionType('student')
                void fetchDraftPaper(id).then((next) => {
                  setDraftPaper(next)
                  setTitleDraft(next.title)
                  setStudentLabelDraft(next.studentLabel || '')
                })
              }}
            >
              {recentDrafts.map((draft) => (
                <option key={draft.id} value={draft.id}>{draft.title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="draft-toolbar-group draft-toolbar-group-output">
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
            {exportMenuOpen && (
              <div className="draft-export-menu-panel" role="menu">
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
                <button
                  type="button"
                  role="menuitem"
                  disabled={draftPaper.items.length === 0 || exportStatus === 'exporting'}
                  onClick={() => {
                    setExportMenuOpen(false)
                    void exportDocx()
                  }}
                >
                  <FileText size={15} /> 下载 DOCX（{versionType === 'teacher' ? '教师版' : '学生版'}）
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
        </div>
      </header>

      {draftPaper.items.length === 0 && (
        <p className="draft-empty-export" role="status">请先添加题组，再导出 PDF 或打印。</p>
      )}
      {migrationNotice && <p className="draft-warning" role="status">{migrationNotice}</p>}
      {exportStatus === 'error' && <p className="draft-error">{exportError}</p>}
      {exportStatus === 'exported' && <p className="draft-success">PDF 已开始下载。</p>}

      <main className="draft-workbench-layout">
        <section className="draft-preview-desk" aria-label="A4 预览">
          <div className={`draft-paper-col${draftPaper.printForm === 'a3' ? ' is-a3' : ''}`} ref={paperColRef}>
            <div className="draft-paper-meta-row">
              <p className="draft-paper-meta">
                {draftPaper.printForm === 'a3'
                  ? `共 ${pageCount} 版 · 对折 ${Math.ceil(pageCount / 4)} 张 · A3`
                  : `共 ${pageCount} 页 · 双面 ${Math.ceil(pageCount / 2)} 张 · A4`}
              </p>
              {/* print-form (plan.md Must Do 3, 裁点3): 轻量版卷头切换— no
                  settings page, no按张分组预览视图 (plan.md 裁点2 明拒). Same
                  segmented-control language as the 学生版/教师版 toggle above. */}
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
            </div>
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
                  <button
                    type="button"
                    aria-label="上移"
                    title="上移"
                    disabled={fullIndex <= 0}
                    onClick={() => moveItem(item.id, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    title="下移"
                    disabled={fullIndex >= draftPaper.items.length - 1}
                    onClick={() => moveItem(item.id, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  {canPageBreakBefore && (
                    <button
                      type="button"
                      aria-label={item.pageBreakBefore ? '取消分页' : '前置分页'}
                      title={item.pageBreakBefore ? '取消分页' : '前置分页'}
                      aria-pressed={item.pageBreakBefore}
                      onClick={() => void togglePageBreak(item, !item.pageBreakBefore)}
                    >
                      <SeparatorHorizontal size={14} />
                    </button>
                  )}
                  <button type="button" className="danger" aria-label="移除" title="移除" onClick={() => void deleteItem(item)}>
                    <Trash2 size={14} />
                  </button>
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

          <DraftPaperRail
            items={draftPaper.items}
            activeGroupId={activeRailGroupId}
            onItemClick={scrollToGroupInPaper}
            onDragStart={(itemId) => setDraggedItemId(itemId)}
            onDrop={handleDrop}
            onMoveItem={moveItem}
            onDeleteItem={deleteItem}
          />
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
