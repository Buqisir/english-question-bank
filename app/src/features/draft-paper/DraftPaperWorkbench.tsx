import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArrowDown, ArrowLeftRight, ArrowUp, Ellipsis, FolderPlus, PageBreak, PaperCheck, PaperStudent, RotateCcw, Save, Trash } from '../../icons'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { Button } from '../../shared-ui/Button.tsx'
import { Dialog } from '../../shared-ui/Dialog.tsx'
import { EmptyState } from '../../shared-ui/EmptyState.tsx'
import { Menu } from '../../shared-ui/Menu.tsx'
import { Field, SelectField, TextField } from '../../shared-ui/Field.tsx'
import { OptionSelectField, SegmentedField } from '../../shared-ui/OptionField.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { Toast } from '../../shared-ui/Toast.tsx'
import { InlineWaitDots } from '../../shared-ui/WaitDots.tsx'
import { useDelayedBusy, useSlowWait } from '../../shared-ui/useDelayedBusy.ts'
import { PaperGroupSkeleton, Skeleton, SkeletonOver } from '../../shared-ui/Skeleton.tsx'
import { Surface } from '../../shared-ui/Surface.tsx'
import { planFocusAfterRemoval, programmaticFocusTarget } from '../../shared-ui/focusAfterRemoval.ts'
import type { DraftPaper, DraftPaperItem, DraftPaperSummary, DraftPrintForm, GroupType, MySpaceFolder, QuestionGroupCard } from '../../domain/questionBank'
import {
  addGroupToDraftPaper,
  deleteDraftPaperItem,
  downloadDraftPaperPdf,
  fetchCurrentDraftPaper,
  fetchDraftPaper,
  fetchDraftPaperEditionAvailability,
  fetchDraftPaperPagination,
  fetchDraftPapers,
  fetchReorderSuggestion,
  migrateAssemblyBasketToDraftPaper,
  patchDraftPaperItem,
  restoreDraftPaperItem,
  updateDraftPaper,
  type DraftPaperEditionAvailability,
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
import { usePresence } from '../shared/useToastPresence.ts'
import { similarPassagesRecipeSummary, type SimilarPassagesRequestState } from '../similar-passages/SimilarPassagesPanel'
import { DraftPaperRail } from './DraftPaperRail'
import { A3_FACE_NATIVE_WIDTH_PX, applyA3Imposition, buildA4PreviewHtml } from './draftPaperPreviewHtml'
import { PAPER_PDF_EDITIONS, PAPER_PDF_PRODUCTS, type PaperPdfEdition } from '../../../../shared/paperPdfProducts.mjs'
import './DraftPaperWorkbench.css'

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

// 提示行（shared-ui/Notice）用的出错：自己的话（哪里没成功、东西还在不在）加服务器原话，
// 不另写兜底的话（No-Literal-Fallback）。describeError 照旧把错打到 console。
type Failure = { lead: string; detail: string; retry?: () => void }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failure(task: string, error: unknown, keep?: string): Failure {
  describeError(task, error)
  return { lead: keep ? `${task}没成功，${keep}` : `${task}没成功`, detail: errorText(error) }
}

// 只放得下一个字符串的地方（保存状态的 title、读屏名字、⋯ 面板那一行）用。
function failureLine(task: string, error: unknown): string {
  const { lead, detail } = failure(task, error)
  return `${lead}：${detail}`
}

// 走查卡点 4（Owner 2026-11-14 第四节第 4 条）：「PDF 版本」菜单里用不了的版本写一行原因。
// 判定和原话都来自服务器（preparePaperProduct，和预览、下载同一套）；这里只把认得的那几条
// 判定（按 code）换成老师的话，各句只说那条判定真正查的东西。认不得的 code 照登服务器原话。
const EDITION_UNAVAILABLE_TEXT: Record<string, string> = {
  PRODUCT_EMPTY: '草稿卷里还没有题组',
  PRODUCT_GROUP_MISSING: '有题组在题库里已经找不到了',
  PRODUCT_ONLY_LISTENING: '这一版不印听力，草稿卷里只有听力题组',
  LISTENING_PAIR_REQUIRED: '要有完整的两个听力题组',
  LISTENING_PAIR_SAME_SOURCE: '两个听力题组要出自同一套卷',
  ANSWER_SOURCE_MISSING: '选中的题组还没有审过的参考答案',
}

function editionUnavailableText(verdict: DraftPaperEditionAvailability): string {
  return (verdict.code && EDITION_UNAVAILABLE_TEXT[verdict.code]) || verdict.reason || ''
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

// 一次挪动只发一次分页请求（Owner 2026-11-14，fix-waiting/README.md「为什么要等一两分钟」第 3 条）：
// 服务器保存题组表时把 order_index 按新顺序重编成 1..n（server/draft-paper/draftPaperStore.mjs
// updateDraftPaper + normalizeDraftItemOrder）。乐观更新这边也照样重编，PATCH 回来的题组表和
// 乐观的那份 itemsLayoutKey 一样，就不会因为编号不同再触发一次分页请求。
function renumberItems(items: DraftPaperItem[]): DraftPaperItem[] {
  return items.map((item, index) => (item.orderIndex === index + 1 ? item : { ...item, orderIndex: index + 1 }))
}

function reorderItems(items: DraftPaperItem[], itemId: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === itemId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return renumberItems(next)
}

function moveItemTo(items: DraftPaperItem[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return items
  const from = items.findIndex((item) => item.id === draggedId)
  const to = items.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return renumberItems(next)
}

// 移出题组、撤销移出以后要放的焦点（见下面「删后焦点」那一段）。
type PendingDraftFocus = {
  kind: 'remove' | 'undo'
  generation: number
  /** 每次调用重新查页面：要落的那个键还不在（卷面还在重排）就返回 null。 */
  find: () => HTMLElement | null
  /** 发起时焦点在哪（被移出那一组的「更多题组操作」、提示里的「撤销」）。 */
  from: HTMLElement | null
  /** 等的过程中已经先放过一次的键。 */
  placed: HTMLElement | null
  /** 撤销时被撤回的那一组：它还在卷上（没缺题）就一直等到它的工具条挂上，不提前兜底。 */
  waitForGroupId?: string
  /** 要落的键都在左栏里（左栏缺题项的「移除」）：不随卷面重排卸掉，不用等卷面排好，删完马上落。 */
  railOnly?: boolean
}

// 打开草稿卷的灰块：目录板里几行（宽度错开，像「1 阅读 A」这类短行），纸上一份卷头加两组卷面灰块。
const DRAFT_SKELETON_RAIL_WIDTHS = [104, 88, 112]

/** 一张 A4 的灰块（等待第四轮）：位置、大小照预览里的 .preview-page（794 宽、离纸栏顶 24）。对读屏隐藏。 */
function DraftSheetSkeleton() {
  return (
    <div className="draft-skeleton-sheet" aria-hidden="true">
      <div className="draft-skeleton-sheet-head">
        <Skeleton width={180} height={20} />
        <Skeleton width={240} height={12} />
      </div>
      <PaperGroupSkeleton />
      <PaperGroupSkeleton />
    </div>
  )
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
  const [loadError, setLoadError] = useState<Failure | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle')
  // 生成 PDF 超过 10 秒还没好：那一行多说一句（DESIGN.md §5 Waiting「要等好几秒的事」，2026-11-15 第二轮只做这一处）。
  const exportSlow = useSlowWait(exportStatus === 'exporting')
  const [exportError, setExportError] = useState<Failure | null>(null)
  const [exportSuccessMessage, setExportSuccessMessage] = useState('')
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [spaceFolders, setSpaceFolders] = useState<MySpaceFolder[]>([])
  const [spaceFolderId, setSpaceFolderId] = useState('')
  const [spaceFileName, setSpaceFileName] = useState('')
  const [spaceNewFolderName, setSpaceNewFolderName] = useState('')
  const [spaceStatus, setSpaceStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [spaceMessage, setSpaceMessage] = useState('')
  // 对话框里读文件夹（等待第七轮 2026-11-15）：「文件夹」下拉的位置画灰块，走门槛；灰块在的时候出错那行也先不挂，等灰块走了一起换上。
  const spaceFoldersPhase = useDelayedBusy(spaceStatus === 'loading')
  const spaceFoldersWaiting = spaceStatus === 'loading' || spaceFoldersPhase === 'waiting'
  // ui-p1-panels #14: the save dialog used to stay open after a successful
  // save, with the success text squeezed into the form body and "保存"
  // still clickable (repeat-save risk, "取消" reading oddly once already
  // saved). It now closes on success and hands off to this toast — same
  // pattern as `draft-undo-toast` below.
  // 底部提示换成共用 Toast（2026-11-15）：停留计时、一次只显示一条、入退场都在构件里，这里只存「要说的话」和
  // 一个每次都不一样的 at（同一句话连着出两次时重新计时）。原来的四个计时 ref 和 presence 删了。
  const [savedToast, setSavedToast] = useState<{ text: string; at: number } | null>(null)
  const [migrationNotice, setMigrationNotice] = useState('')
  const [edition, setEdition] = useState<PaperPdfEdition>('largeNoListening')
  // 每个 PDF 版本这份草稿能不能出（服务器判定）。surface 记它是哪一份草稿的，换了草稿就不用。
  const [editionAvailability, setEditionAvailability] = useState<{ surface: string; editions: DraftPaperEditionAvailability[] } | null>(null)
  const [removedItem, setRemovedItem] = useState<RemovedDraftItem | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  // 构件厂第 4 步（2026-11-13）：「导出」菜单和题组「⋯」菜单换成 shared-ui/Menu，
  // 开关、点外面关、Esc 关并还焦点都由构件自己管，这里不再存它们的开关状态。
  // workbench-header-unify Locked Decision 2: the retired `.draft-toolbar`'s
  // 学生（可选）/ 最近草稿卷 / 自动保存状态 三项 now live behind this quiet
  // "⋯" panel in the head row (outside-click + Escape dismiss effect below).
  // 它里面是表单字段，不是菜单项，所以不换 Menu，仍是自己的弹出面板。
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  // 复评工艺账（2026-07-17 C 路）：菜单入场有 keyframe、关闭裸卸载=可感的
  // 不对称。与 toast/模态同走 usePresence——退（motion-micro）快于入
  // （motion-fast），播完 exit 再卸载。
  const moreMenuPresence = usePresence(moreMenuOpen, 80)
  const titleSaveTimerRef = useRef<number | null>(null)
  const focusedOnceRef = useRef(false)
  const a4SheetRef = useRef<HTMLDivElement | null>(null)
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
  // Only show the response belonging to the current edition and draft content.
  // An unavailable answer booklet must never display the previous question PDF.
  const [paginatedHtml, setPaginatedHtml] = useState('')
  const [renderedPaginationKey, setRenderedPaginationKey] = useState('')
  // 走查卡点 2（Owner 2026-11-14 第四节第 2 条）：同一份草稿、同一个 PDF 版本里
  // 只是排版变了（挪、删、加、分页、改标题），重排期间留着旧卷面、盖一层遮罩；
  // 换了草稿或版本才不显示旧卷面（纯答案版不能拿题卷顶着）。这里记下当前
  // paginatedHtml 是哪一份草稿、哪个版本的。
  const [renderedSurfaceKey, setRenderedSurfaceKey] = useState('')
  // 「重试」按钮：数字一变，paginationKey 跟着变，分页请求重新发一次。
  const [paginationRetry, setPaginationRetry] = useState(0)
  // 删、加、换篇、分页这几种改动要等服务器回话才知道新的题组表；等的这一下
  // 也算「正在重排」，卷面先盖上遮罩，不让老师点完看不到任何变化。
  const [layoutSavesPending, setLayoutSavesPending] = useState(0)
  const [paginationStatus, setPaginationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [paginationError, setPaginationError] = useState<Failure | null>(null)
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
  // 轮询). `reorderUndoSnapshot` holds the pre-apply item order so 撤回 can
  // PATCH straight back to it; it is cleared by any OTHER item mutation
  // (moveItem/handleDrop/deleteItem/undoDelete/togglePageBreak below all call
  // clearReorderUndo() first — the snapshot is stale the instant a different
  // edit lands, 施工契约 3 边界).
  // 提议和决定（DESIGN.md §5 Proposal → Decision，Owner 2026-11-13 定）：采用后
  // 卡片留在原处变成「已采用 · 撤回」，不再弹底部提示条；撤回失效（别的编辑、
  // 换草稿卷、离开页面）时卡片一起收起，所以去掉了原来 8 秒的计时。
  // `text` 是采用那一刻卡上的话（采用后断篇消失，建议本身会被清掉）；`ready`
  // 在保存成功前为 false，这期间点撤回先记下，保存成功后再撤。
  const [reorderSuggestion, setReorderSuggestion] = useState<ReorderSuggestion>(null)
  const [reorderUndoSnapshot, setReorderUndoSnapshot] = useState<{ generation: number; items: DraftPaperItem[]; text: string; ready: boolean } | null>(null)
  // 撤回后到新建议回来之前，卡片按原话留在「建议」状态，不闪一下消失。
  const [reorderRestoredText, setReorderRestoredText] = useState<string | null>(null)
  const reorderCardRef = useRef<HTMLDivElement | null>(null)
  const reorderFocusPendingRef = useRef(false)
  // 保存还没回来时点了「撤回」：先记下，保存成功后马上撤回，不悄悄吞掉这一下。
  const reorderUndoQueuedRef = useRef(false)
  const reorderRequestIdRef = useRef(0)
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
  const [swapAddToast, setSwapAddToast] = useState<{ text: string; at: number } | null>(null)
  // 替换 undo snapshot — same 8s-timer + toast-presence shape as
  // reorderUndoSnapshot above, and same 撤销快照互斥 lifecycle (plan.md 施工
  // 要点 4/5, DP-2 script ⑥): any OTHER item mutation (including the OTHER
  // kind of undo snapshot being created) clears this first — see
  // clearReplaceUndo/clearReorderUndo below, called in pairs everywhere
  // either kind of edit happens.
  const [replaceUndoSnapshot, setReplaceUndoSnapshot] = useState<{ removed: RemovedDraftItem; addedItemId: string } | null>(null)

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
    setRemovedItem(null)
    setReorderUndoSnapshot(null)
    setReorderRestoredText(null)
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
    setLoadError(null)
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
      setEdition('largeNoListening')
      setLoadStatus('loaded')
      loadRecentDrafts()
    } catch (error) {
      if (generation !== draftGenerationRef.current) return
      setLoadStatus('error')
      setLoadError(failure('打开草稿卷', error, '卷里的题组没动'))
    }
  }, [draftPaperId, loadRecentDrafts, resetTransientStateForDraftSwitch])

  useEffect(() => {
    void loadDraft()
    return () => {
      draftGenerationRef.current += 1
      if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current)
    }
  }, [loadDraft])

  useEffect(() => {
    focusedOnceRef.current = false
  }, [draftPaperId, focusGroupId])

  // workbench-header-unify: outside-click / Escape dismiss for the "⋯" panel
  // (D5 原先给导出菜单写的同一套；导出菜单换成 Menu 后只剩这一处用).
  useEffect(() => {
    if (!moreMenuOpen) return
    // 字段构件那一轮（2026-11-14）起「PDF 版本」不再放进「⋯」面板，原来给它开的「点在版本菜单上不关面板」的例外删掉。
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
    return { text: reasonText ? `${reasonText}，${moveText}` : moveText }
  }, [draftPaper, reorderSuggestion, pageBreakSuggestions])

  // 提议和决定：卡片只有两种状态。已采用优先（采用后建议本身会被清掉）；
  // 撤回后新建议回来前，用原话撑住「建议」状态。
  const reorderDecided = reorderUndoSnapshot && reorderUndoSnapshot.generation === draftGeneration ? reorderUndoSnapshot : null
  const reorderCard: { state: 'proposal' | 'decided'; text: string } | null = reorderDecided
    ? { state: 'decided', text: reorderDecided.text }
    : reorderSuggestionCard
      ? { state: 'proposal', text: reorderSuggestionCard.text }
      : reorderRestoredText
        ? { state: 'proposal', text: reorderRestoredText }
        : null
  const reorderCardState = reorderCard?.state ?? null

  // 点「采用」「撤回」后按钮换了一个，焦点跟到新按钮上，键盘用户不丢位置。
  useEffect(() => {
    if (!reorderFocusPendingRef.current) return
    reorderFocusPendingRef.current = false
    if (!reorderCardState) return
    reorderCardRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [reorderCardState])

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
  const surfaceKey = JSON.stringify([draftGeneration, draftPaper?.id, edition])
  const availabilitySurface = JSON.stringify([draftGeneration, draftPaper?.id])
  const availabilityKey = JSON.stringify([availabilitySurface, itemsLayoutKey])

  // 走查卡点 4：题组一变就重新问一次各版本能不能出（不排版，很快）。问的这一下菜单里
  // 留着同一份草稿上一次的结果；问不到就不标（不猜），选了以后照旧由预览和下载报原因。
  useEffect(() => {
    if (!draftPaper) return
    let cancelled = false
    const surface = availabilitySurface
    fetchDraftPaperEditionAvailability(draftPaper.id)
      .then((editions) => {
        if (!cancelled) setEditionAvailability({ surface, editions })
      })
      .catch((error) => {
        if (cancelled) return
        console.error('读取 PDF 版本能不能用', error)
        setEditionAvailability(null)
      })
    return () => {
      cancelled = true
    }
    // availabilityKey 已含草稿和题组表；draftPaper 对象本身每次保存都会换。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityKey])
  const editionVerdicts = useMemo(
    () => new Map((editionAvailability?.surface === availabilitySurface ? editionAvailability.editions : []).map((verdict) => [verdict.edition, verdict])),
    [editionAvailability, availabilitySurface],
  )
  const paginationKey = JSON.stringify([draftGeneration, draftPaper?.id, draftPaper?.title, itemsLayoutKey, edition, draftPaper?.printForm, paginationRetry])
  // 一次挪动只发一次分页请求（fix-waiting/README.md「为什么要等一两分钟」第 3 条）：题组表的保存
  // （persistItems、withLayoutSave 包着的那几处）还没回来时不发分页请求，等服务器回了题组表再按它发一次。
  const layoutSaveInFlight = layoutSavesPending > 0

  // Debounce layout edits, invalidating in-flight results before the delay.
  useEffect(() => {
    if (paginationDebounceRef.current) window.clearTimeout(paginationDebounceRef.current)
    const requestId = (paginationRequestIdRef.current += 1)
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
      setPaginationError(null)
      setPageBreakSuggestions([])
    }
    if (!draftPaper || draftPaper.items.length === 0) {
      resetPagination()
      return
    }
    if (layoutSaveInFlight) return
    // 保存回来、题组表和已经排好的那份一样（比如保存失败退回原样）：不用再排一次。
    if (renderedPaginationKey === paginationKey && paginationStatus === 'ready') return
    const draftPaperId = draftPaper.id
    paginationDebounceRef.current = window.setTimeout(() => {
      if (generation !== draftGenerationRef.current) return
      setPaginationStatus('loading')
      fetchDraftPaperPagination(draftPaperId, edition)
        .then((result) => {
          if (paginationRequestIdRef.current !== requestId || generation !== draftGenerationRef.current) return
          setPaginatedHtml(result.paginatedHtml)
          setRenderedPaginationKey(paginationKey)
          setRenderedSurfaceKey(surfaceKey)
          setPaginationStatus('ready')
          setPaginationError(null)
          setPageBreakSuggestions(result.pageBreakSuggestions)
        })
        .catch((error) => {
          if (paginationRequestIdRef.current !== requestId || generation !== draftGenerationRef.current) return
          // 不清 paginatedHtml：同一份草稿、同一版本的旧卷面留着，上面写一行没成功
          // （见下面 previewHtml 和卷面状态行）；换了版本的旧卷面本来就不显示。
          setRenderedPaginationKey(paginationKey)
          setPaginationStatus('error')
          setPaginationError(edition === 'answerOnly'
            ? { lead: '纯答案版不可用', detail: errorText(error) }
            : failure('排卷面', error))
        })
    }, 400)
    return () => {
      if (paginationDebounceRef.current) window.clearTimeout(paginationDebounceRef.current)
      paginationRequestIdRef.current += 1
    }
    // print-form (plan.md Must Do 3): a print-form toggle alone must still
    // refresh pageBreakSuggestions (the a4/a3 判据 differs) even though it
    // never changes paginatedHtml itself (server-side cache hit — printForm
    // is deliberately excluded from the render signature, see
    // draftPaperStore.mjs's getDraftPaperPagination doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginationKey, layoutSaveInFlight])

  // reorder-suggest (plan.md 施工契约 3 "拉取策略"): fires only once the
  // pagination fetch above has resolved with real breakage — never on its
  // own timer, never while pagination itself is still loading/stale (the
  // pagination effect's own debounce already gates that). A cleared/empty
  // pageBreakSuggestions list (fixed by the user, or a fresh draft) clears
  // the card immediately with no request — 安静：卡有则现，无则无.
  useEffect(() => {
    const requestId = (reorderRequestIdRef.current += 1)
    if (!draftPaper || renderedPaginationKey !== paginationKey || pageBreakSuggestions.length === 0) {
      setReorderSuggestion(null)
      // 分页已经出结果且没有断篇：撤回后留着的原话也该收起了。
      if (!draftPaper || renderedPaginationKey === paginationKey) setReorderRestoredText(null)
      return
    }
    const draftPaperId = draftPaper.id
    fetchReorderSuggestion(draftPaperId, edition)
      .then((suggestion) => {
        if (reorderRequestIdRef.current !== requestId) return
        setReorderSuggestion(suggestion)
        setReorderRestoredText(null)
      })
      .catch(() => {
        // Quiet by design (plan.md "安静常驻卡"): a failed fetch here just
        // means no card shows this round — no error toast, no retry loop.
        // The next pagination fetch (any subsequent edit) tries again.
        if (reorderRequestIdRef.current !== requestId) return
        setReorderSuggestion(null)
        setReorderRestoredText(null)
      })
  }, [draftPaper?.id, pageBreakSuggestions, edition, renderedPaginationKey, paginationKey])

  // a3-imposition (plan.md Must Do 1, 裁点4): the a4 branch is the exact
  // same call this useMemo made before this cut — applyA3Imposition only
  // ever runs when printForm==='a3', so a4 output is byte-identical to
  // pre-cut (zero-diff hard断言, verify-a3-imposition.mjs asserts this).
  //
  // 走查卡点 2：以前这里要求 renderedPaginationKey === paginationKey 才出卷面，
  // 任何排版改动一发生两者就不等，卷面立刻变成空白，要等新分页回来（本地一两
  // 分钟）。现在只要求是同一份草稿、同一版本（surfaceKey），排版没跟上时照样
  // 显示旧卷面，由 previewStale 盖遮罩。
  const previewHtml = useMemo(() => {
    if (renderedSurfaceKey !== surfaceKey || !paginatedHtml) return ''
    const base = buildA4PreviewHtml(paginatedHtml)
    return draftPaper?.printForm === 'a3' ? applyA3Imposition(base) : base
  }, [paginatedHtml, draftPaper?.printForm, renderedSurfaceKey, surfaceKey])
  // 卷面落后于左栏：分页还没按当前的题组表排出来，或者删、加的保存还没回来。
  const previewStale = renderedPaginationKey !== paginationKey || layoutSavesPending > 0
  const previewFailed = !previewStale && paginationStatus === 'error'
  // 等待第五轮（2026-11-15）：重排等过 10 秒，那一行改说大概要多久。本地重排一次约 37 秒、每次都这么久，
  // 所以不说「比平时慢」（DESIGN.md §5 Waiting，午第四轮建议、协调人排进第五轮）。
  const reflowSlow = useSlowWait(previewStale)
  // 等待第四轮（2026-11-15）：打开草稿卷、第一次排出卷面之前，纸的位置画灰块。两段（读草稿卷、分页）接成一段等，
  // 走同一个门槛：读完草稿卷换上真目录时，纸上的灰块不断、不重新数 300ms。
  const sheetPending = loadStatus === 'loading'
    || (loadStatus === 'loaded' && draftPaper !== null && draftPaper.items.length > 0 && !previewHtml
      && !(renderedPaginationKey === paginationKey && paginationStatus === 'error' && paginationError))
  const sheetPhase = useDelayedBusy(sheetPending)

  async function withLayoutSave<T>(run: () => Promise<T>): Promise<T> {
    setLayoutSavesPending((count) => count + 1)
    try {
      return await run()
    } finally {
      setLayoutSavesPending((count) => count - 1)
    }
  }

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

  // A3 puts distinct groups at almost the same vertical position. Keep each
  // strip near its source, but reserve its actual rendered height in the gutter.
  useLayoutEffect(() => {
    const tools = Array.from(paperColRef.current?.querySelectorAll<HTMLElement>('[data-draft-tools-group-id]') ?? [])
    const placeTools = () => {
      const measured = tools.map((element) => ({
        element,
        top: groupAnchors[element.dataset.draftToolsGroupId!] ?? 0,
        height: element.offsetHeight,
      })).sort((a, b) => a.top - b.top)
      let bottom = -Infinity
      for (const { element, top, height } of measured) {
        const placedTop = Math.max(top, bottom + 8)
        element.style.setProperty('--draft-tool-shift', `${placedTop - top}px`)
        bottom = placedTop + height
      }
    }
    placeTools()
    const observer = new ResizeObserver(placeTools)
    tools.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [groupAnchors])

  // 删后焦点（2026-11-15，DESIGN.md §5 Interaction「删后焦点」；记录 design/components-2026-11-13/migrate-followup/README.md 第二节）。
  // 从题组「⋯」菜单移出：菜单关上时焦点先回到这一组的「更多题组操作」，等服务器回话后这一组的工具条没了，
  // 焦点照 shared-ui/focusAfterRemoval.ts 的顺序落到下一组的「更多题组操作」→ 上一组的 → 左栏「卷面目录」。
  // 卷面要重排：新分页回来、iframe 重新载入时所有工具条会先卸掉再按新位置挂上，所以这里一直等到排好
  // （没有在途的保存、卷面不旧、工具条位置算出来了）才算完；中间工具条还在时先放一次，被卸掉再放回同一个键。
  // 撤销移出：排好以后焦点落到被撤回那一组自己的「更多题组操作」（回到移出之前的位置）；那一组没有工具条时落到「卷面目录」。
  // 左栏缺题项的「移除」走同一条路（removeFromRail）：落下一项的「移除」→ 上一项的 → 「卷面目录」；撤销后回到它自己的「移除」。
  // 「卷面目录」在窄屏藏起来时，两种兜底都改落卷的标题（h1，平时视觉上藏着）。
  // 只在焦点掉到 <body>、还在发起处或我们先放过的键上时动；用户已经把焦点挪到别处（比如 Tab 进了别的地方）就不抢。
  const pendingFocusRef = useRef<PendingDraftFocus | null>(null)
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    if (pending.generation !== draftGeneration) {
      pendingFocusRef.current = null
      return
    }
    // 左栏删除：服务器回话、那一项从左栏里没了才算删完（删之前 withLayoutSave 先改一次计数，那时不能动焦点；
    // 删失败时 deleteItemNow 的 catch 会清掉这次安排）。
    if (pending.railOnly && pending.from?.isConnected) return
    const active = document.activeElement
    const lost = !active || active === document.body || !active.isConnected
    const ours = active instanceof HTMLElement && (
      active === pending.from
      || active === pending.placed
      || Boolean(active.closest('.draft-undo-toast'))
      // 撤销时提示收起会把焦点还给进提示之前的那个键（多半是上一次移出后放过去的下一组的键），也算我们的。
      || (pending.kind === 'undo' && Boolean(active.closest('.draft-group-actions')))
      // 左栏缺题项：撤销提示收起时焦点还回去的是左栏里的「移除」（删完放过去的下一项的键），也算我们的。
      || (pending.kind === 'undo' && Boolean(active.closest('.draft-paper-rail-item')))
    )
    if (!lost && !ours) {
      pendingFocusRef.current = null
      return
    }
    const settled = Boolean(pending.railOnly) || layoutSavesPending === 0
      && (nonMissingItems.length === 0 || (!previewStale && previewReady && Object.keys(groupAnchors).length > 0))
    const target = pending.find()
    // 撤销以后服务器先回话、卷面后重排：刚回话那一下旧的工具条位置还在，看着像「排好了」，
    // 可被撤回那一组的工具条还没挂上。这时提前兜底，焦点会落到「卷面目录」，随后撤销提示收起又把焦点
    // 还给进提示之前的那个键（下一组的「⋯」），就回不到被撤回的那一组了。所以这一组只要还在卷上，就等它的键出现。
    const waiting = !target && Boolean(pending.waitForGroupId)
      && nonMissingItems.some((entry) => entry.groupId === pending.waitForGroupId)
    // 被撤回的是左栏缺题项时，要落的键在左栏里，不随卷面重排卸掉；卷里还有缺题项时卷面一直排不出来（不会「排好」），
    // 所以不等排好：键一出现就放过去，不等焦点先掉。只对撤销这样做——移出时焦点可能已经被用户 Tab 进了撤销提示，不能抢回来。
    const railUndoTarget = pending.kind === 'undo' && target && target.closest('.draft-paper-rail') ? target : null
    if (!settled || waiting) {
      if (target && (lost || (railUndoTarget && active !== railUndoTarget))) {
        target.focus({ preventScroll: true })
        pending.placed = target
      }
      return
    }
    pendingFocusRef.current = null
    // 兜底落「卷面目录」；窄屏（390 宽）左栏整个藏起来，没有可见的目录，就落到这张卷的标题（视觉上藏着的 h1）。
    const rail = document.querySelector<HTMLElement>('.draft-paper-rail')
    const heading = document.querySelector<HTMLElement>('.draft-workbench-layout > h1')
    const last = target ?? programmaticFocusTarget(rail && rail.getClientRects().length > 0 ? rail : heading)
    if (last && last !== active) last.focus()
  }, [draftGeneration, layoutSavesPending, nonMissingItems, previewStale, previewReady, groupAnchors])

  function removeFromGroupMenu(item: DraftPaperItem, trigger: HTMLButtonElement | null) {
    if (trigger) {
      const next = planFocusAfterRemoval(trigger, {
        item: '.draft-group-actions',
        key: 'data-draft-tools-group-id',
        control: '.draft-group-menu-trigger',
        // 前后都找不到时不在这里落到标题：卷面没排好时工具条暂时不在，要等排好再决定（见上面的 effect）。
        fallback: () => null,
        scope: paperColRef.current ?? document,
      })
      pendingFocusRef.current = { kind: 'remove', generation: draftGeneration, find: next, from: trigger, placed: null }
    }
    void deleteItem(item)
  }

  // 左栏缺题项的「移除」（2026-11-15；记录 design/components-2026-11-13/migrate-rail/README.md）：同一套删后焦点。
  // 删之前定好：下一项的「移除」→ 上一项的 → 兜底（上面那个 effect 落「卷面目录」，窄屏落 h1）。
  // 这几个键都在左栏，不随卷面重排卸掉，所以不等卷面排好（railOnly）：服务器回话、左栏重画那一下就落。
  // 删的是最后一个缺题项时卷面要重新排几十秒，等排好再落的话焦点在 <body> 上待这么久（换前实测）。
  // 只有缺题项有「移除」，所以「下一项」是往后数最近的一个还有这个键的项（focusAfterRemoval.ts 本来就这样找）。
  // 认项用 <li> 上的 data-draft-group-id，左栏重画以后也找得回来。
  function removeFromRail(item: DraftPaperItem, trigger: HTMLButtonElement) {
    const next = planFocusAfterRemoval(trigger, {
      item: '.draft-paper-rail-item',
      key: 'data-draft-group-id',
      control: '.draft-paper-rail-remove',
      fallback: () => null,
      scope: trigger.closest('nav') ?? document,
    })
    pendingFocusRef.current = { kind: 'remove', generation: draftGeneration, find: next, from: trigger, placed: null, railOnly: true }
    void deleteItem(item)
  }

  function groupMenuTrigger(groupId: string): HTMLElement | null {
    const owner = paperColRef.current?.querySelector<HTMLElement>(`[data-draft-tools-group-id="${CSS.escape(groupId)}"]`)
    const trigger = owner?.querySelector<HTMLElement>('.draft-group-menu-trigger')
    return trigger && trigger.isConnected && trigger.getClientRects().length > 0 ? trigger : null
  }

  // 被撤回的是左栏的缺题项（不上卷面、没有工具条）时，焦点回到它自己的「移除」。
  function railRemoveTrigger(groupId: string): HTMLElement | null {
    const row = document.querySelector<HTMLElement>(`.draft-paper-rail-item[data-draft-group-id="${CSS.escape(groupId)}"]`)
    const trigger = row?.querySelector<HTMLElement>('.draft-paper-rail-remove')
    return trigger && trigger.isConnected && trigger.getClientRects().length > 0 ? trigger : null
  }

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

  // 题组表的保存也算「正在重排」（withLayoutSave）：卷面先盖遮罩，分页请求等它回来再发。
  function persistItems(nextItems: DraftPaperItem[]) {
    return withLayoutSave(() => persistItemsNow(nextItems))
  }

  async function persistItemsNow(nextItems: DraftPaperItem[]) {
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
      setSaveError(failureLine('保存草稿卷', error))
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
        setSaveError(failureLine('保存标题', error))
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
      setSaveError(failureLine('保存学生', error))
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
      setSaveError(failureLine('切换打印形态', error))
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
    reorderUndoQueuedRef.current = false
    setReorderUndoSnapshot(null)
    setReorderRestoredText(null)
  }

  // similar-workbench-swap (E7): 替换's own undo-snapshot clearer, same
  // shape/lifecycle as clearReorderUndo above — called in the exact same
  // set of "other mutation" handlers (撤销快照互斥: only one of the two
  // snapshot kinds is ever live, since creating either one clears both).
  function clearReplaceUndo() {
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

  // 走查卡点 2：分页、删、撤销删、换篇、撤销换篇、加入这六处都套一层
  // withLayoutSave，等服务器回话期间卷面先盖上「正在重排」。
  function togglePageBreak(item: DraftPaperItem, nextValue: boolean) {
    return withLayoutSave(() => togglePageBreakNow(item, nextValue))
  }

  async function togglePageBreakNow(item: DraftPaperItem, nextValue: boolean) {
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
      setSaveError(failureLine('更新分页设置', error))
    }
  }

  function deleteItem(item: DraftPaperItem) {
    return withLayoutSave(() => deleteItemNow(item))
  }

  async function deleteItemNow(item: DraftPaperItem) {
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
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (pendingFocusRef.current?.kind === 'remove') pendingFocusRef.current = null
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(failureLine('删除题组', error))
    }
  }

  function undoDelete() {
    return withLayoutSave(() => undoDeleteNow())
  }

  async function undoDeleteNow() {
    if (!draftPaper || !isCurrentDraft() || !removedItem || removedItem.generation !== draftGeneration) return
    clearReorderUndo()
    clearReplaceUndo()
    setSaveStatus('saving')
    try {
      const { groupId, orderIndex, pageBreakBefore } = removedItem
      const next = await restoreDraftPaperItem(draftPaper.id, { groupId, orderIndex, pageBreakBefore })
      if (!isCurrentDraft()) return
      // 撤销以后焦点回到被撤回那一组的「更多题组操作」；那一组没有工具条（比如题库里已经没了）时回到它在左栏的「移除」，
      // 再没有就落到左栏「卷面目录」。
      const fromElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
      pendingFocusRef.current = {
        kind: 'undo',
        generation: draftGeneration,
        find: () => groupMenuTrigger(groupId) ?? railRemoveTrigger(groupId),
        from: fromElement,
        placed: null,
        waitForGroupId: groupId,
      }
      setDraftPaper(next)
      setTitleDraft(next.title)
      setRemovedItem(null)
      setSaveStatus('saved')
      onDraftChanged?.()
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(failureLine('撤销删除', error))
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
    if (!draftPaper || !isCurrentDraft() || !reorderSuggestion || !reorderSuggestionCard) return
    clearReplaceUndo()
    const snapshot = draftPaper.items
    const cardText = reorderSuggestionCard.text
    const byId = new Map(draftPaper.items.map((item) => [item.id, item]))
    const orderedItems = reorderSuggestion.order
      .map((id) => byId.get(id))
      .filter((item): item is DraftPaperItem => Boolean(item))
    // Fail-safe, not expected in practice: the suggestion's order is a
    // permutation of exactly the items it was dry-run against — but if the
    // draft changed underneath it, tack on anything the order missed rather
    // than silently dropping an item.
    const coveredIds = new Set(orderedItems.map((item) => item.id))
    const nextItems = renumberItems([...orderedItems, ...draftPaper.items.filter((item) => !coveredIds.has(item.id))])
    setDraftPaper({ ...draftPaper, items: nextItems })
    // 先在原处变成「已采用」，保存在后台走；保存失败就收起（报错走 saveError）。
    setReorderRestoredText(null)
    setReorderUndoSnapshot({ generation: draftGeneration, items: snapshot, text: cardText, ready: false })
    reorderFocusPendingRef.current = true
    reorderUndoQueuedRef.current = false
    const saved = await persistItems(nextItems)
    if (!isCurrentDraft()) return
    if (saved && reorderUndoQueuedRef.current) {
      reorderUndoQueuedRef.current = false
      setReorderUndoSnapshot(null)
      setReorderRestoredText(cardText)
      reorderFocusPendingRef.current = true
      setDraftPaper((current) => (current ? { ...current, items: snapshot } : current))
      await persistItems(snapshot)
      return
    }
    reorderUndoQueuedRef.current = false
    setReorderUndoSnapshot((current) => (current && current.items === snapshot ? (saved ? { ...current, ready: true } : null) : current))
  }

  async function undoReorderSuggestion() {
    if (!draftPaper || !isCurrentDraft() || !reorderUndoSnapshot || reorderUndoSnapshot.generation !== draftGeneration) return
    if (!reorderUndoSnapshot.ready) {
      reorderUndoQueuedRef.current = true
      return
    }
    const { items: snapshot, text } = reorderUndoSnapshot
    setReorderUndoSnapshot(null)
    // 保险：草稿卷里的题组和采用时不是同一批了，就不按旧顺序写回去。
    const sameItems = snapshot.length === draftPaper.items.length && snapshot.every((item) => draftPaper.items.some((entry) => entry.id === item.id))
    if (!sameItems) return
    setReorderRestoredText(text)
    reorderFocusPendingRef.current = true
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
  function applySwapReplace(candidateGroupId: string) {
    return withLayoutSave(() => applySwapReplaceNow(candidateGroupId))
  }

  async function applySwapReplaceNow(candidateGroupId: string) {
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
        setSaveError(failureLine('替换第二步（移除原篇）', error) + '——新篇已加入，原篇仍在卷中，可手动移除原篇完成替换')
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
      setSaveError(failureLine('替换题组', error))
    }
  }

  function undoSwapReplace() {
    return withLayoutSave(() => undoSwapReplaceNow())
  }

  async function undoSwapReplaceNow() {
    if (!draftPaper || !isCurrentDraft() || !replaceUndoSnapshot || replaceUndoSnapshot.removed.generation !== draftGeneration) return
    const snapshot = replaceUndoSnapshot
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
      setSaveError(failureLine('撤销替换', error))
    }
  }

  // similar-workbench-swap (E7, plan.md 施工要点 4 "加入"): inserted right
  // AFTER the seed item — "老师就在这个位置工作，邻插不跳尾" — never at the
  // volume's end. No undo (C8/E2/E6 convention: 删除本就有撤销兜底), so the
  // drawer stays open afterward (unlike 替换 above, the seed item itself is
  // untouched — nothing invalidates the drawer's own anchor).
  function applySwapAdd(candidateGroupId: string) {
    return withLayoutSave(() => applySwapAddNow(candidateGroupId))
  }

  async function applySwapAddNow(candidateGroupId: string) {
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
      setSwapAddToast({ text: '已加入草稿卷', at: Date.now() })
    } catch (error) {
      if (!isCurrentDraft()) return
      setSaveStatus('error')
      setSaveError(failureLine('加入草稿卷', error))
    }
  }

  async function exportPdf(mode: FileSaveMode = 'download') {
    if (!draftPaper || draftPaper.items.length === 0) return
    setExportStatus('idle')
    setExportError(null)
    setExportSuccessMessage('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${draftPaper.title || '英语草稿卷'}-${PAPER_PDF_PRODUCTS[edition]}.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setExportStatus('exporting')
      // 走查第四节第 8 条（Owner 2026-11-14）：下载成功只说「已下载：文件名」。原来接在后面的排版检查
      // （字号、跨 A3 正反面的题组数、跨页的选项组数）不在这里说了；放到卷面上对应那一页要改卷面，
      // 等 Owner 定（fix-notice/README.md「第 8 条」）。服务器照旧在响应头里给这几个数。
      const { fileName } = await downloadDraftPaperPdf(draftPaper.id, edition, target)
      setExportStatus('exported')
      setExportSuccessMessage(target.kind === 'download' ? `已下载：${fileName}` : `已保存：${fileName}`)
    } catch (error) {
      setExportStatus('error')
      const fixedLayoutMessage = error instanceof Error
        && /^(未在有界搜索内找到|大字完整版需要|无法生成指定页数的友好 PDF：|长卷版未找到|长卷版：|定页版需要|10 页友好版需要完整|12 页长卷版需要完整|试卷内容超出排版区域：)/.test(error.message)
      // 版本用不了、版式凑不出来，再点一次结果一样，不给「重试」。
      setExportError(edition === 'answerOnly'
        ? { lead: '纯答案版不可用', detail: errorText(error) }
        : fixedLayoutMessage
          ? { lead: `${PAPER_PDF_PRODUCTS[edition]}出不来，草稿卷没动`, detail: errorText(error) }
          : { ...failure(mode === 'save-as' ? '另存为 PDF' : '导出 PDF', error, '草稿卷没动'), retry: () => void exportPdf(mode) })
    }
  }

  async function openSpaceDialog() {
    if (!draftPaper || draftPaper.items.length === 0) return
    setSpaceDialogOpen(true)
    setSpaceStatus('loading')
    setSpaceMessage('')
    setSpaceFileName(`${draftPaper.title || '英语草稿卷'}-${PAPER_PDF_PRODUCTS[edition]}.pdf`)
    try {
      const snapshot = await fetchMySpace()
      setSpaceFolders(snapshot.folders)
      setSpaceFolderId(snapshot.folders[0]?.id || '')
      setSpaceStatus('idle')
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(failureLine('读取个人空间文件夹', error))
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
      setSpaceMessage(failureLine('新建文件夹', error))
    }
  }

  async function saveToMySpace() {
    if (!draftPaper) return
    setSpaceStatus('saving')
    setSpaceMessage('')
    try {
      await saveDraftPaperToMySpace({
        draftPaperId: draftPaper.id,
        edition,
        fileName: spaceFileName,
        folderId: spaceFolderId || null,
      })
      // #14: collapse the dialog immediately on success — no lingering
      // "saved, but still open with a live 保存 button" state.
      setSpaceDialogOpen(false)
      setSpaceStatus('idle')
      setSavedToast({ text: '已保存到个人空间', at: Date.now() })
    } catch (error) {
      setSpaceStatus('error')
      setSpaceMessage(edition === 'answerOnly'
        ? `纯答案版没保存：${errorText(error)}`
        : failureLine('保存到个人空间', error))
    }
  }

  if (loadStatus === 'loading') {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        {/* 等待第四轮（2026-11-15）：原来是桌面正中一行「正在打开草稿卷」，换成照真页面位置画的灰块
            （左边目录板、中间一张 A4）。300ms 内只有读屏那一句；那一句仍在页面上（ux 走查脚本按字找）。 */}
        <main className="draft-workbench-shell" role="status" aria-busy="true">
          <span className="visually-hidden">正在打开草稿卷</span>
          {sheetPhase === 'waiting' && (
            <section className="draft-skeleton-desk" aria-hidden="true">
              <Surface className="draft-skeleton-rail">
                <span className="draft-skeleton-rail-meta"><Skeleton width={96} height={10} /></span>
                {DRAFT_SKELETON_RAIL_WIDTHS.map((width, index) => (
                  <span key={index} className="draft-skeleton-rail-item"><Skeleton width={width} height={12} /></span>
                ))}
              </Surface>
              <div className="draft-skeleton-col"><DraftSheetSkeleton /></div>
            </section>
          )}
        </main>
      </>
    )
  }

  if (loadStatus === 'error' || !draftPaper) {
    return (
      <>
        <AppTopbar {...props.shellNav} pageTitle="草稿卷" onBack={onBackToWorkbench} />
        <main className="draft-workbench-shell">
          <div className="draft-notice-slot is-page">
            {loadError ? (
              <Notice kind="error" className="draft-error" detail={loadError.detail} action={{ label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: () => void loadDraft() }}>
                {loadError.lead}
              </Notice>
            ) : (
              // 打开成功但没拿到草稿卷：不是出错，是真没有。
              <Notice kind="info" className="draft-error" action={{ label: '回找题页', onClick: onBackToWorkbench }}>
                没找到这份草稿卷，可能已被删除
              </Notice>
            )}
          </div>
        </main>
      </>
    )
  }

  // 字段构件（构件厂 2026-11-14，design/components-2026-11-13/migrate-field/README.md）：
  // 「PDF 版本」和「A4 / A3」换成共用选项字段（shared-ui/OptionField.tsx）。
  // - PDF 版本：带原因的下拉。用不了的版本照样列出、置灰不能选，下面一行写服务器判定的原因（走查卡点 4，
  //   Owner 2026-11-14 第四节第 4 条）；触发键长成字段的样子，读屏念「PDF 版本 + 当前版本」。
  // - A4 / A3：分段选择，读屏是单选组，← → 换。
  // 宽屏放在顶栏「导出」左边；窄屏（≤980px）不再收进「⋯」面板，放在顶栏下面单独一行（走查卡点 5），
  // 同一组控件、同一个顺序、紧挨着「导出」那一侧。宽屏顶栏里说明 / 出错那一行只给读屏
  // （当前版本用不了时卷面上就写着原因），窄屏那一行有地方，照常显示。
  const editionOptions = PAPER_PDF_EDITIONS.map((value) => {
    const verdict = editionVerdicts.get(value)
    const unavailable = verdict !== undefined && !verdict.available
    return {
      value,
      label: PAPER_PDF_PRODUCTS[value],
      disabled: unavailable,
      reason: unavailable ? editionUnavailableText(verdict) || undefined : undefined,
    }
  })
  const renderVersionField = (placement: 'topbar' | 'row') => (
    <OptionSelectField
      label="PDF 版本"
      layout="inline"
      size="md"
      className="draft-product-control"
      triggerClassName="draft-product-trigger"
      menuClassName="draft-product-menu"
      hideMessages={placement === 'topbar'}
      disabled={exportStatus === 'exporting' || spaceDialogOpen}
      value={edition}
      options={editionOptions}
      onChange={(value) => {
        setEdition(value)
        setExportError(null)
        setExportSuccessMessage('')
      }}
    />
  )

  const formToggleControl = (
    <SegmentedField
      label="打印形态"
      hideLabel
      layout="inline"
      className="draft-form-field"
      controlClassName="draft-form-toggle"
      value={draftPaper.printForm === 'a3' ? 'a3' : 'a4'}
      options={[
        { value: 'a4', label: 'A4 散页' },
        { value: 'a3', label: 'A3 对折' },
      ]}
      onChange={(value) => void setPrintForm(value)}
    />
  )

  // 构件厂第 4 步：导出菜单换成 shared-ui/Menu（雾薄荷主键做触发键，每页一处）。
  // 「保存 PDF 到个人空间」选中后 Menu 先把焦点还给「导出」，模态框关上时再还回这里。
  const exportBlocked = draftPaper.items.length === 0 || exportStatus === 'exporting'
  const exportMenuControl = (
    <Menu
      label="导出"
      triggerText="导出"
      triggerTone="primary"
      triggerSize="md"
      className="draft-export-menu-panel"
      items={[
        {
          key: 'download',
          label: `下载 PDF（${PAPER_PDF_PRODUCTS[edition]}）`,
          icon: edition === 'answerOnly' ? <PaperCheck size={16} /> : <PaperStudent size={16} />,
          disabled: exportBlocked,
          onSelect: () => void exportPdf(),
        },
        { key: 'sep', separator: true },
        { key: 'save-as', label: '另存为 PDF…', icon: <Save size={16} />, disabled: exportBlocked, onSelect: () => void exportPdf('save-as') },
        {
          key: 'space',
          label: '保存 PDF 到个人空间',
          icon: <Archive size={16} />,
          disabled: draftPaper.items.length === 0 || spaceStatus === 'saving',
          onSelect: () => void openSpaceDialog(),
        },
      ]}
    />
  )

  const pagesMetaText = draftPaper.printForm === 'a3'
    ? `共 ${pageCount} 版 · 对折 ${Math.ceil(pageCount / 4)} 张`
    : `共 ${pageCount} 页 · 双面 ${Math.ceil(pageCount / 2)} 张`

  return (
    <>
    <AppTopbar
      {...props.shellNav}
      pageTitle={titleDraft || draftPaper.title}
      pageTitleEditable
      onPageTitleChange={updateTitle}
      pageStatus={
        <span className={`draft-save-status ${saveStatus}`} role="status" title={saveStatus === 'error' ? saveError : undefined}>
          {saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '保存失败' : '已保存'}
          <InlineWaitDots pending={saveStatus === 'saving'} size="sm" />
        </span>
      }
      onBack={onBackToWorkbench}
      actionsSlot={
        <>
          {/* Low-frequency document fields remain in More; save status stays by the title. */}
          <div className="draft-more-menu" ref={moreMenuRef}>
            <Button
              tone="subtle"
              size="sm"
              icon={<Ellipsis size={16} />}
              // CR SW-1: save errors must stay visible with the menu closed —
              // the trigger wears a danger dot while saveStatus is 'error'.
              className={`draft-more-menu-trigger${saveStatus === 'error' ? ' has-save-error' : ''}`}
              aria-expanded={moreMenuOpen}
              // 开的是弹层（role=group），不是菜单，不加 aria-haspopup；data-opens-popup 只给 button.css 认「打开着垫底」（Owner 2026-11-14 第 18 条）。
              data-opens-popup=""
              aria-controls="draft-more-information"
              label={saveStatus === 'error' ? `草稿卷更多信息（保存出错：${saveError}）` : '草稿卷更多信息'}
              title={saveStatus === 'error' ? `保存出错：${saveError}` : '学生 / 最近草稿卷'}
              onClick={() => setMoreMenuOpen((open) => !open)}
            />
            {moreMenuPresence.mounted && (
              <div id="draft-more-information" className="draft-more-menu-panel" role="group" aria-label="草稿卷更多信息" data-visible={moreMenuPresence.visible} inert={!moreMenuOpen}>
                {/* 字段构件（shared-ui/Field.tsx）：大号 36，和原来一样高。类名 draft-student-field / draft-recent-select 留给脚本认。 */}
                <TextField
                  label="学生（可选）"
                  size="lg"
                  className="draft-student-field"
                  value={studentLabelDraft}
                  placeholder="未填写"
                  onChange={(event) => setStudentLabelDraft(event.target.value)}
                  onBlur={(event) => void saveStudentLabel(event.target.value)}
                />
                <SelectField
                  label="最近草稿卷"
                  size="lg"
                  className="draft-recent-select-field"
                  controlClassName="draft-recent-select"
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
                    setEdition('largeNoListening')
                    void fetchDraftPaper(id).then((next) => {
                      if (generation !== draftGenerationRef.current) return
                      setDraftGeneration(generation)
                      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`)
                      setDraftPaper(next)
                      setTitleDraft(next.title)
                      setStudentLabelDraft(next.studentLabel || '')
                    }).catch((error) => {
                      if (generation !== draftGenerationRef.current) return
                      setSaveStatus('error')
                      setSaveError(failureLine('切换草稿卷', error))
                    })
                  }}
                  options={recentDrafts.map((draft) => ({ value: draft.id, label: draft.title }))}
                />
                {/* 保存出错是「没保存」，按 DESIGN.md §5 Notices 上危险色。 */}
                {saveStatus === 'error' && <Notice kind="error" danger className="draft-error">{saveError}</Notice>}
              </div>
            )}
          </div>
          <span className="draft-topbar-wide-toggle">{renderVersionField('topbar')}</span>
          <span className="draft-topbar-wide-toggle">{formToggleControl}</span>
          {exportMenuControl}
        </>
      }
    />
    <div className="draft-workbench-shell">
      {/* 窄屏（≤980px）时「PDF 版本」和「A4 / A3」放在这一行，紧贴顶栏下面、靠右（「导出」那一侧）；宽屏时隐藏，
          用顶栏里那一份（见 DraftPaperWorkbench.css .draft-option-row）。原来窄屏收进「⋯」面板，老师想不到去那里找（走查卡点 5）。 */}
      <div className="draft-option-row">
        {renderVersionField('row')}
        {formToggleControl}
      </div>
      {/* 共用提示行（shared-ui/Notice）：卷头行之下、纸面之上一个固定位置，左右边距和下面的排序建议卡一样
          （.draft-notice-slot）。一次只出一条：导出的结果（出错 / 生成中 / 已下载）排在前面。 */}
      {(draftPaper.items.length === 0 || migrationNotice || exportStatus !== 'idle') && (
        <div className="draft-notice-slot">
          {exportStatus === 'error' && exportError ? (
            <Notice
              kind="error"
              className="draft-error"
              detail={exportError.detail}
              action={exportError.retry ? { label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: exportError.retry } : undefined}
            >
              {exportError.lead}
            </Notice>
          ) : exportStatus === 'exporting' ? (
            <Notice kind="waiting">{exportSlow ? '正在生成 PDF，比平时慢，可以先去做别的' : '正在生成 PDF'}</Notice>
          ) : exportStatus === 'exported' ? (
            <Notice kind="success" className="draft-success">{exportSuccessMessage}</Notice>
          ) : draftPaper.items.length === 0 ? (
            <Notice kind="info" className="draft-empty-export">先加题组，才能下载 PDF</Notice>
          ) : migrationNotice ? (
            <Notice kind="info" className="draft-warning">{migrationNotice}</Notice>
          ) : null}
        </div>
      )}

      {/* reorder-suggest (plan.md 施工契约 3 "卡"): 卷头行之下、纸面之上 —
          same slot as the notices above, ahead of <main>'s preview desk. */}
      {reorderCard && (
        <div className="draft-reorder-slot">
        <div ref={reorderCardRef} className="draft-reorder-suggestion" data-state={reorderCard.state} role="status">
          <div className="draft-reorder-suggestion-head">
            <span>{reorderCard.state === 'decided' ? '已采用' : '建议'}</span>
            {reorderCard.state === 'decided' ? (
              <button type="button" className="draft-reorder-suggestion-undo" onClick={() => void undoReorderSuggestion()}>
                撤回
              </button>
            ) : (
              <button
                type="button"
                className="draft-reorder-suggestion-act"
                aria-disabled={reorderSuggestionCard ? undefined : true}
                onClick={() => void applyReorderSuggestion()}
              >
                采用
              </button>
            )}
          </div>
          <p>{reorderCard.text}</p>
        </div>
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
            onDeleteItem={removeFromRail}
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
                <div className="draft-a4-empty">
                  <EmptyState illustration="board-list" action={{ label: '去找题', onClick: onBackToWorkbench }}>
                    还没有题组。在找题结果里点「加入草稿卷」，题就会排进这张纸。
                  </EmptyState>
                </div>
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
                  {/* 走查卡点 2（Owner 2026-11-14 第四节第 2 条）：重排期间旧卷面
                      留着，上面盖一层遮罩和一行字；没成功时去掉遮罩，留旧卷面，写
                      一行原因和「重试」。遮罩挂在 .draft-a4-sheet 上、iframe 外面，
                      不进卷面，也不进服务器出的打印稿和 PDF。 */}
                  <div className={`draft-a4-wait${previewStale ? ' is-waiting' : ''}`} hidden={!previewStale && !previewFailed}>
                    {/* 共用提示行的 over 放法（垫桌色、e1）；sticky 的位置仍由 .draft-a4-wait-line 给。 */}
                    {previewStale ? (
                      <Notice kind="waiting" placement="over" className="draft-a4-wait-line">
                        {reflowSlow ? '正在重排卷面，大约要半分钟，旧卷面先留着' : '正在重排卷面，旧卷面先留着'}
                      </Notice>
                    ) : previewFailed && paginationError ? (
                      <Notice
                        kind="error"
                        placement="over"
                        className="draft-a4-wait-line"
                        detail={paginationError.detail}
                        action={{ label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: () => setPaginationRetry((count) => count + 1) }}
                      >
                        {`${paginationError.lead}，下面还是改之前的卷面`}
                      </Notice>
                    ) : null}
                  </div>
                </>
              ) : renderedPaginationKey === paginationKey && paginationStatus === 'error' && paginationError ? (
                <div className="draft-a4-empty">
                  <Notice
                    kind="error"
                    detail={paginationError.detail}
                    // 纯答案版不可用时再排一次结果一样，不给「重试」。
                    action={edition === 'answerOnly' ? undefined : { label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: () => setPaginationRetry((count) => count + 1) }}
                  >
                    {paginationError.lead}
                  </Notice>
                </div>
              ) : (
                // 等待第四轮（2026-11-15）：原来是纸的位置正中一行「正在生成分页预览」（.draft-a4-empty 里的 Notice），
                // 换成一张 A4 的灰块，和打开时的灰块同一段门槛（sheetPhase），读完草稿卷不重新等 300ms。
                // 那一句仍给读屏（ux 走查脚本按字找）。
                <div className="draft-a4-skeleton" role="status" aria-busy="true">
                  <span className="visually-hidden">正在生成分页预览</span>
                  {sheetPhase === 'waiting' && <DraftSheetSkeleton />}
                </div>
              )}
            </div>

            {/* draft-desk-b step3 (裁点1 retirement, MF-5): one ALWAYS-VISIBLE
                overlay button cluster per question group, replacing the old
                hover-only sticker — anchored via the groupAnchors effect above
                (computeGroupAnchorTop), same up/down/page-break/delete actions
                the rail's own buttons call (moveItem/togglePageBreak/deleteItem
                below — one shared handler set, not a second implementation). */}
            {edition !== 'answerOnly' && nonMissingItems.map((item) => {
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
              // 走查卡点 2：重排期间和重排没成功时卷面是旧的，按旧分页算出的建议先
              // 不出（以前这时卷面空白，建议本来也看不到）。
              const suggestion = canPageBreakBefore && draftPaper.printForm !== 'a3' && !previewStale && !previewFailed
                ? pageBreakSuggestions.find((entry) => entry.groupId === item.groupId)
                : undefined
              return (
                <div key={item.id} className="draft-group-actions" data-draft-tools-group-id={item.groupId} role="group" aria-label="题组工具" style={{ top: `${anchorTop}px` }}>
                  {/* 建议键换成 Button 的「建议」样子（2026-11-15，Owner 当天定）；类名留作摆放和脚本挂钩。 */}
                  {suggestion && (
                    <Button
                      tone="suggest"
                      size="sm"
                      className="draft-group-suggestion"
                      title={suggestion.reason}
                      onClick={() => void togglePageBreak(item, true)}
                    >
                      建议前置分页
                    </Button>
                  )}
                  {/* similar-workbench-swap (E7, plan.md 施工要点 2 "⇄ 入口
                      gate"): only the four v2-supported groupTypes get a
                      button here — writing (and every other groupType)
                      hides it entirely, same 隐藏式降级 convention as E6's
                      own CTA. */}
                  {item.questionGroup && SWAP_SUPPORTED_GROUP_TYPES.has(item.questionGroup.groupType) && (
                    // Owner 2026-11-14 决定 #5：读屏名字以看得见的「换篇」开头（WCAG 2.5.3 名字含可见文字），
                    // 收着念「换篇：换一篇相似篇章」，展开念「换篇：收起」。看得见的字仍是「换篇」；
                    // 悬停提示和改前一样跟读屏名字用同一句。
                    <button
                      type="button"
                      aria-label={swapSeedItemId === item.id ? '换篇：收起' : '换篇：换一篇相似篇章'}
                      title={swapSeedItemId === item.id ? '换篇：收起' : '换篇：换一篇相似篇章'}
                      aria-pressed={swapSeedItemId === item.id}
                      onClick={() => handleSwapToggle(item)}
                    >
                      <ArrowLeftRight size={16} />
                      <span className="draft-group-actions-label">换篇</span>
                    </button>
                  )}
                  {/* 构件厂第 4 步：题组「⋯」换成 shared-ui/Menu。面板挂到 body 上，不再被工具条
                      的层级和纸面裁住；↑ ↓ 在项之间走。「前置分页」原来是带 aria-pressed 的开关键，
                      Owner 2026-11-14 决定 #15 改成可勾选项：字固定「前置分页」，读屏是 menuitemcheckbox，
                      分了页就打勾（以前是字翻成「取消分页」）。 */}
                  <Menu
                    label="更多题组操作"
                    triggerTone="strong"
                    triggerSize="md"
                    triggerClassName="draft-group-menu-trigger"
                    items={[
                      { key: 'up', label: '上移', icon: <ArrowUp size={16} aria-hidden="true" />, disabled: fullIndex <= 0, onSelect: () => moveItem(item.id, -1) },
                      { key: 'down', label: '下移', icon: <ArrowDown size={16} aria-hidden="true" />, disabled: fullIndex >= draftPaper.items.length - 1, onSelect: () => moveItem(item.id, 1) },
                      ...(canPageBreakBefore
                        ? [{
                            key: 'page-break',
                            label: '前置分页',
                            checked: Boolean(item.pageBreakBefore),
                            icon: <PageBreak size={16} aria-hidden="true" />,
                            onSelect: () => void togglePageBreak(item, !item.pageBreakBefore),
                          }]
                        : []),
                      { key: 'sep', separator: true },
                      // 删后焦点：onSelect 拿到触发键，移出以后焦点落到下一组的同一个键（见 removeFromGroupMenu）。
                      { key: 'remove', label: '移除', tone: 'danger', icon: <Trash size={16} aria-hidden="true" />, onSelect: (_event, trigger) => removeFromGroupMenu(item, trigger) },
                    ]}
                  />
                </div>
              )
            })}

            {/* a3-imposition (plan.md Must Do 3, 裁点2): the suggestion pill's
                A3 home — anchored to the face/sheet seam it belongs to
                (seamAnchors, keyed by the same suggestion.groupId
                applyA3Imposition tagged the seam with), same click behavior
                (前置分页 PATCH) as the A4 per-group pill above. */}
            {draftPaper.printForm === 'a3' && !previewStale && !previewFailed &&
              pageBreakSuggestions.map((suggestion) => {
                const anchorTop = seamAnchors[suggestion.groupId]
                if (anchorTop == null) return null
                const item = nonMissingItems.find((entry) => entry.groupId === suggestion.groupId)
                if (!item) return null
                // 和 A4 那只一样换成 Button 的「建议」样子（2026-11-15）；类名留作摆放和脚本挂钩。
                return (
                  <Button
                    key={`seam-${suggestion.groupId}`}
                    tone="suggest"
                    size="sm"
                    className="draft-seam-suggestion"
                    style={{ top: `${anchorTop}px` }}
                    title={suggestion.reason}
                    onClick={() => void togglePageBreak(item, true)}
                  >
                    {`${suggestion.reason} · 建议前置分页`}
                  </Button>
                )
              })}
          </div>
        </section>
      </main>

      {/* 撤销、刚保存这类临时提示：共用构件 shared-ui/Toast（2026-11-15，原来是共用提示行的 floating 放法）。
          白底、e3、视口底部正中；一次只显示一条（新的一条顶掉旧的，旧的那条的撤销快照跟着清掉）；
          鼠标停在上面、焦点在里面时不消失。停留时长照原来：撤销 8 秒、刚加入 2.2 秒、刚保存 6 秒。
          类名 draft-undo-toast 留作脚本挂钩。 */}
      {/* C8 (trust-cracks) — 措辞：题组仍在题库里，撤销只是撤回本卷的移出动作，不说「删除」。 */}
      <Toast
        message={removedItem ? '题组已移出' : null}
        token={removedItem}
        kind="undo"
        duration={8000}
        className="draft-undo-toast"
        action={{ label: '撤销', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: undoDelete }}
        onClose={() => setRemovedItem(null)}
      />
      {/* similar-workbench-swap (E7, plan.md "替换这篇...可撤销"). */}
      <Toast
        message={replaceUndoSnapshot ? '已替换这篇' : null}
        token={replaceUndoSnapshot}
        kind="undo"
        duration={8000}
        className="draft-undo-toast"
        action={{ label: '撤销', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: () => void undoSwapReplace() }}
        onClose={() => setReplaceUndoSnapshot(null)}
      />
      {/* similar-workbench-swap (E7, plan.md "加入...沿用「已加入」语言，无撤销"). */}
      <Toast
        message={swapAddToast?.text ?? null}
        token={swapAddToast?.at}
        kind="success"
        duration={2200}
        className="draft-undo-toast"
        onClose={() => setSwapAddToast(null)}
      />
      <Toast
        message={savedToast?.text ?? null}
        token={savedToast?.at}
        kind="success"
        duration={6000}
        className="draft-undo-toast"
        action={shellNav.onOpenMySpace ? {
          label: '查看个人空间',
          onClick: () => {
            setSavedToast(null)
            shellNav.onOpenMySpace?.()
          },
        } : undefined}
        onClose={() => setSavedToast(null)}
      />
      {/* 构件厂 2026-11-14：换成共用 Dialog（shared-ui/Dialog.tsx）。开关、焦点、Esc、背后不能滚、入退场都在构件里；
          原来头上的「关闭」字键换成右上角的关闭键（读屏名字仍是「关闭」）。「取消」墨字、「保存」石板墨填充照旧
          （这一页的雾薄荷主键给了顶栏「导出」，DESIGN.md §2 每页一处）。「新建」是正文里的键，墨字带图标、大号 36。
          「保存 PDF 到个人空间」选中后 Menu 先把焦点还给「导出」，对话框关上时回到那里。 */}
      <Dialog
        open={spaceDialogOpen}
        onClose={() => setSpaceDialogOpen(false)}
        title="保存 PDF 到个人空间"
        closeLabel="关闭"
        className="draft-save-space-dialog"
        bodyClassName="draft-save-space-body"
        onSubmit={(event) => {
          event.preventDefault()
          void saveToMySpace()
        }}
        cancel={{ label: '取消' }}
        confirm={{
          // 保存中：键上的字不换、不变淡，用 Button busy（DESIGN.md §5 Waiting）。
          label: '保存',
          busy: spaceStatus === 'saving',
          disabled: draftPaper.items.length === 0,
        }}
      >
        {/* 字段构件（shared-ui/Field.tsx）：三个都是大号 36，和旁边「新建」大号键同高。「新建文件夹」原来只有读屏标签，照旧 hideLabel。 */}
        <TextField label="文件名" size="lg" value={spaceFileName} onChange={(event) => setSpaceFileName(event.target.value)} />
        {/* 在读文件夹（等待第七轮 2026-11-15，原来是表单下面一行「正在读取文件夹」，读完那行一收、对话框跟着变矮）：
            「文件夹」标签照旧，下拉的位置画一块灰（SkeletonOver 垫一个同款大号下拉撑出 36 高），门槛内只占位置不出灰。
            读屏念一句「正在读取文件夹」。读完灰块换成真下拉，同一个位置、同样高，对话框不动。 */}
        {spaceFoldersWaiting ? (
          <Field label="文件夹" labelledByControl>
            {() => (
              <>
                {/* 只给读屏的一句（.visually-hidden 绝对定位，不占 flex 的位置）。 */}
                <span className="visually-hidden" role="status">正在读取文件夹</span>
                <SkeletonOver show={spaceFoldersPhase === 'waiting'}>
                  <span className="eqb-field-select" data-size="lg"><select className="eqb-field-control" data-size="lg" tabIndex={-1} /></span>
                </SkeletonOver>
              </>
            )}
          </Field>
        ) : (
          <SelectField
            label="文件夹"
            size="lg"
            value={spaceFolderId}
            onChange={(event) => setSpaceFolderId(event.target.value)}
            options={[{ value: '', label: '未归档' }, ...spaceFolders.map((folder) => ({ value: folder.id, label: folder.name }))]}
          />
        )}
        <div className="draft-new-folder-row">
          <TextField
            label="新建文件夹"
            hideLabel
            size="lg"
            value={spaceNewFolderName}
            onChange={(event) => setSpaceNewFolderName(event.target.value)}
            placeholder="新建文件夹"
          />
          <Button
            tone="strong"
            size="lg"
            icon={<FolderPlus size={16} />}
            onClick={createFolderInDialog}
            disabled={!spaceNewFolderName.trim() || spaceStatus === 'saving'}
          >
            新建
          </Button>
        </div>
        {spaceStatus === 'error' && !spaceFoldersWaiting && <Notice kind="error" className="draft-error">{spaceMessage}</Notice>}
      </Dialog>
    </div>
    </>
  )
}
