/**
 * PaperBrowsePage — 刀B 整卷预览页 v1 → flow-panel 刀 2（点题联动 + 五解析面板搬家）。
 *
 * Route: `?view=paper-browse&paperId=<id>[&focusGroupId=<gid>]`.
 *
 * Streams the whole paper-asset in document order (content.blocks) as one
 * `<PaperSurface>` mount per question-group card, reusing the same
 * per-groupType adapters the Paper Intelligence harness uses
 * (`buildPaperAssetSurfaceModel` / `buildSevenChoicesSurfaceModel` /
 * `buildClozePaperView` / `buildGrammarFillPaperView` /
 * `buildWritingPaperView`).
 *
 * 挑题态（讲评关）is READ-ONLY, unchanged from 刀 1: every group's
 * `onFocusIntent` is a no-op, `lectureFocus` is always `null` — zero
 * evidence/annotation interaction, zero new network requests.
 *
 * 讲评态（讲评开）adds real point-and-focus wiring (刀 2), reusing the
 * exact five解析面板 + adapters the Paper Intelligence harness
 * (`PaperIntelligencePaperSurfaceHarness.tsx`, read-only reference) uses:
 *   - Clicking a question on any group's PaperSurface fires
 *     `onFocusIntent('request-lecture-focus')`; the page becomes the
 *     single writer of `lectureSelection` (which group + question + seeded
 *     evidence/option is active) and makes that group the 讲评栏 target —
 *     including cross-group clicks.
 *   - The 讲评栏 body renders the解析面板 matching the active group's
 *     `groupType` (SevenChoicesAnalysisPanel / PaperAssetAnalysisPanel /
 *     ClozeAnalysisPanel / GrammarFillAnalysisPanel / WritingAnalysisPanel),
 *     fed by the SAME adapters the解析页 harness uses — "整卷看的和单个题组
 *     点进去看的是一个东西，只统一了宽度" (owner).
 *   - `cloze-analysis-v1` / `grammar-fill-analysis-v1` / `writing-analysis-v1`
 *     are fetched once, lazily, the first time 讲评态 opens (reading /
 *     sevenChoices analyses are already fetched unconditionally at page
 *     load, unchanged from 刀 1). A missing/failed analysis degrades that
 *     group's 讲评栏 to "解析未发布" without crashing or blocking other
 *     groups; the group's卷面 PaperSurface mount keeps rendering its plain
 *     (non-analysis) view.
 *   - Panel-triggered `onSelectOption` / `onSelectEvidence` write back into
 *     `lectureSelection`, which becomes the active group's `lectureFocus`
 *     prop — PaperSurface paints the matching evidence highlight itself.
 *   - When 讲评态 is closed, or for any group that isn't the current 讲评栏
 *     target, `onFocusIntent`/`lectureFocus` revert to the 刀 1 no-op/null
 *     shape — no cross-group highlight leakage, and 挑题态 stays exactly
 *     as before (`onFocusIntent={() => {}}`, `lectureFocus={null}`).
 *   - PaperSurface itself is untouched (zero modification); all card
 *     chrome and the 加入草稿卷 action bar live in this page.
 *   - Unknown/unsupported block or group types render a placeholder row
 *     instead of crashing.
 *
 * Draft actions reuse the same `draftPaperButtonState` machine as the
 * detail page (looked up from App's loaded `questionGroups` by groupId,
 * which is the paper-asset `groupId` verbatim — see
 * `server/api.mjs#buildPaperAssetQuestionGroupCard`: `id: groupId`).
 * Groups not present in `questionGroupById` render no button. There is
 * no remove action and no whole-paper "整卷加入" action (aggregate add is
 * out of scope per aggregatePaperResults.ts:8-11).
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
// one-sheet-paper: 卷面字体/边距 token 只读消费——同 PaperSurface.tsx /
// WritingPaperPage.tsx 的注入手法（CSS custom properties on a shared
// ancestor），不是 shared-ui/papersurface/** 或 paper-intelligence/**
// 内部文件，纯数据 primitives，import-only 零改动。
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
} from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
// figure-render cut: separate import line (not folded into the block
// above) so verify-paper-browse.mjs's `buildPaperAssetSurfaceModel...from
// '../paper-intelligence/'` proximity regex keeps matching unchanged.
import type { PaperFigureManifestEntry } from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
import {
  buildSevenChoicesSurfaceModel,
  type SevenChoicesSurfaceModel,
  type ReviewedSevenChoicesAnalysisV1,
} from '../paper-intelligence/sevenChoicesSurfaceAdapter.ts'
import {
  buildClozePaperView,
  type ClozePaperViewModel,
} from '../paper-intelligence/clozePaperViewAdapter.ts'
import {
  buildGrammarFillPaperView,
  type GrammarFillPaperViewModel,
} from '../paper-intelligence/grammarFillPaperViewAdapter.ts'
import {
  canonicalConsumptionForGroup,
  loadScreenConsumption,
} from '../paper-intelligence/canonicalConsumptionClient.ts'
import {
  buildWritingPaperView,
  type WritingPaperViewModel,
} from '../paper-intelligence/writingPaperViewAdapter.ts'
import {
  buildClozeAnalysisSurfaceModel,
  type ClozeAnalysisSurfaceModel,
  type ReviewedClozeAnalysisV1,
} from '../paper-intelligence/clozeAnalysisSurfaceAdapter.ts'
import {
  buildGrammarFillAnalysisSurfaceModel,
  type GrammarFillAnalysisSurfaceModel,
  type ReviewedGrammarFillAnalysisV1,
} from '../paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts'
import { findWritingBlockRange } from '../paper-intelligence/writingPageModel.mjs'
import { useSevenChoicesPaperHighlights } from '../paper-intelligence/useSevenChoicesPaperHighlights.ts'
import { SevenChoicesAnalysisPanel } from '../paper-intelligence/SevenChoicesAnalysisPanel'
import { PaperAssetAnalysisPanel } from '../paper-intelligence/PaperAssetAnalysisPanel'
import { ClozeAnalysisPanel } from '../paper-intelligence/ClozeAnalysisPanel'
import { GrammarFillAnalysisPanel } from '../paper-intelligence/GrammarFillAnalysisPanel'
import { WritingAnalysisPanel } from '../paper-intelligence/WritingAnalysisPanel'
import {
  getRetainedWritingLecture,
  isRetainedWritingPilotGroup,
  RetainedReviewCard,
} from './RetainedWritingLecture.tsx'
// 刀 2 修复轮 ③: 阅读跨栏证据动线 —— import-only 复用解析页 harness 同款
// 组件（见 PaperIntelligencePaperSurfaceHarness.tsx ~1567 行的接线），零
// 修改。只对阅读题组接入（卷面显影原则：完形/语法填空原位型只给证据高亮，
// 七选五混血用衔接句高亮，均不做动线——见 plan.md「卷面显影原则」）。
import { PaperIntelligenceEvidenceLine } from '../paper-intelligence/preview/paperIntelligenceEvidenceLine'
import '../paper-intelligence/paperIntelligence.css'
import type {
  AnswerKeyEntry,
  PaperAssetV1,
  PaperContentBlock,
  PaperContentGroup,
  WritingAnalysis,
} from '../../domain/paperAsset.ts'
import type { QuestionGroupCard } from '../../domain/questionBank'
import type { LectureFocus, PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'
import { fetchSimilarPassages, fetchSimilarQuestions } from '../../services/similarQuestions.ts'
import { scrollBehavior } from '../shared/reducedMotionScroll.ts'
import {
  SimilarQuestionsRailView,
  type SimilarRailRequestState,
} from './SimilarQuestionsRailView'
import {
  applyPaperSurfaceFocusIntent,
  shouldClearLectureSelectionForActiveGroup,
} from './paperBrowseFocusIntent'
import './paperBrowsePage.css'

type GroupModel =
  | { kind: 'reading'; model: PaperAssetSurfaceModel }
  | { kind: 'sevenChoices'; model: SevenChoicesSurfaceModel }
  | { kind: 'cloze'; model: ClozePaperViewModel }
  | { kind: 'grammarFill'; model: GrammarFillPaperViewModel }
  | { kind: 'writing'; model: WritingPaperViewModel }
  | { kind: 'unsupported'; groupType: string }
  | { kind: 'error'; message: string }

// 讲评态按需补拉的 cloze/grammarFill/writing 解析——reading/sevenChoices 的
// 解析已在挑题态初次加载时无条件拉取（刀 1 遗留行为，不变）。'unavailable'
// = 拉取过但没有（404/解析失败），讲评栏据此显「解析未发布」而不是一直显
// 「加载中」。
type LectureAnalysisEntry =
  | { kind: 'cloze'; model: ClozeAnalysisSurfaceModel }
  | { kind: 'grammarFill'; model: GrammarFillAnalysisSurfaceModel }
  | { kind: 'writing'; analysis: WritingAnalysis }
  | { kind: 'unavailable' }

type WritingAnalysisFilePayload = {
  groups?: Record<string, { writing?: WritingAnalysis } | undefined>
}

// 讲评态下的显式点题选择——哪个题组的哪道题当前在讲评栏里，以及种下的
// 证据/选项高亮。清空(null)时讲评栏跟随 scrollspy 显示当前题组的组级概览。
type LectureSelection = {
  groupId: string
  questionId: string
  evidenceId: string | null
  optionLabel: string | null
}

// similar-rail (E2/E6): a snapshot of the seed that a fetch was made for,
// captured at CTA-click time — kept separate from the live `lectureSelection`
// so the result view (and its retry button) survives the "scroll away clears
// lectureSelection" effect (:771-775) untouched.
//
// `mode` (E6): cloze/sevenChoices now seed POST /api/similar-passages by
// `groupId` (篇章相似); reading/grammarFill still seed POST
// /api/similar-questions by `questionId` (小题相似, unchanged).
type SimilarSeedSnapshot = {
  mode: 'questions' | 'passages'
  questionId: string
  groupId: string
  groupTitle: string
  questionNo: number | null
  groupTypeLabel: string
  recipeSummary: string
}

export type PaperBrowsePageProps = {
  paperId: string
  focusGroupId?: string | null
  /** flow-panel 刀 3: 入口带态——预选的题（asset 加载完成后走
   * selectLectureQuestion 同款路径），groupId 缺省时用来推导所属题组。 */
  questionId?: string | null
  /** flow-panel 刀 3: 入口带态——true 时讲评栏初始即开（URL 的
   * `lecture=1`）。挑题态入口（看整卷）不传/传 false，行为同刀 1/刀 2。 */
  lecture?: boolean
  /** similar-entrypoints (E3): 入口带态——true 时（连同 lecture+questionId）
   * 一旦入口预选的题真正落地讲评栏，自动走与 CTA 相同的路径打开配相似结果
   * （URL 的 `similar=1`）。不支持题型/查无此题时静默降级为普通讲评态深链，
   * 不报错。 */
  similar?: boolean
  /** App's loaded questionGroups, keyed by id (== paper-asset groupId). */
  questionGroupById: Map<string, QuestionGroupCard>
  onAddGroupsToBasket: (groups: QuestionGroupCard[]) => void
  currentDraftPaperId: string | null
  currentDraftGroupCount: number
  onOpenDraftPaperWorkbench: (draftPaperId?: string | null) => void
  onBackToWorkbench: () => void
  shellNav: AppTopbarNav
}

export function hasExplicitLectureIntent({
  lecture,
}: Pick<PaperBrowsePageProps, 'focusGroupId' | 'lecture'>): boolean {
  return lecture === true
}

function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

// one-sheet-paper: single-sheet typography tokens, injected on
// `.paper-browse-content` (the shared ancestor of every block — headings,
// instructions, and every group card). CSS custom properties only cascade
// down the tree, so this is the one place they need to land for
// paperBrowsePage.css's heading/instruction rules AND the nested
// PaperSurface/WritingPaperPage mounts (which redeclare their own copies on
// their own roots already) to read the same `var(--ps-*)` names. Mirrors
// the identical injection pattern in PaperSurface.tsx / WritingPaperPage.tsx
// — a third read-only consumer of the same shared primitives, not a new
// source of truth.
type PaperBrowseContentStyle = CSSProperties & Record<`--${string}`, string | number>
const paperBrowseContentStyle: PaperBrowseContentStyle = {
  '--ps-font-stack': paperSurfaceTokens.paperFontStack,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-passage-indent': paperSurfaceTokens.passageIndent,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

// 讲评栏 — 答案行. `null` means "don't render an answer row at all"
// (groupType === 'writing'); an empty-but-non-null case renders the
// 答案未入库 fallback below. Logic moved from the撤刀 flow-hover Chunk B
// (7c13124) — answerKey is already loaded on `asset`, zero new fetches.
function buildAnswerRowText(asset: PaperAssetV1, group: PaperContentGroup): string | null {
  if (group.groupType === 'writing') return null
  const entries = group.questionIds
    .map((qid) => asset.answerKey.answers[qid])
    .filter((entry): entry is AnswerKeyEntry => Boolean(entry))
    .sort((a, b) => a.questionNo - b.questionNo)
  if (entries.length === 0) return '答案未入库'
  return entries.map((entry) => `${entry.questionNo}. ${entry.answer}`).join('　')
}

function buildGroupRangeLabel(asset: PaperAssetV1, group: PaperContentGroup): string {
  const questionNos = group.questionIds
    .map((qid) => asset.content.questions[qid]?.questionNo)
    .filter((no): no is number => typeof no === 'number')
    .sort((a, b) => a - b)
  if (questionNos.length === 0) return ''
  if (questionNos.length === 1) return `${questionNos[0]}`
  return `${questionNos[0]}-${questionNos[questionNos.length - 1]}`
}

// similar-rail (E2): the four groupTypes E1's engine supports (program.md
// Q5 — writing excluded, no facet). Keys are the paper-asset (camelCase)
// groupType — the value the CTA gate already has on hand, decoupling
// display text from the API response's DB-style (snake_case) groupType.
const SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'sevenChoices', 'grammarFill'])

const SIMILAR_GROUP_TYPE_LABEL: Record<string, string> = {
  reading: '阅读理解',
  cloze: '完形填空',
  sevenChoices: '七选五',
  grammarFill: '语法填空',
}

// similar-passages-entry (E6): program.md §配方 v2 表——one-line summary
// per groupType, purely presentational (real ordering/scoring lives
// server-side in similarQuestions.mjs). cloze/sevenChoices now describe the
// 篇章相似 recipe (their small-question recipe retired to passages-only,
// v2); reading/grammarFill describe the v2 小题相似 recipe (density scoring
// removed entirely).
const SIMILAR_RECIPE_SUMMARY: Record<string, string> = {
  reading: '同小题题型命中 → 同话题优先',
  cloze: '同话题硬门槛 → 真题优先 → 年份新优先',
  sevenChoices: '同话题硬门槛 → 真题优先 → 年份新优先',
  grammarFill: '同语法考点命中（谓语相似/非谓语角色/其它考点）→ 同话题优先',
}

// similar-passages-entry (E6): cloze/sevenChoices retired their
// small-question recipe entirely (program.md §配方 v2) — the讲评态「配相似」
// CTA now calls POST /api/similar-passages (seed = the whole group) for
// these two groupTypes instead of POST /api/similar-questions.
const SIMILAR_PASSAGES_MODE_GROUP_TYPES = new Set(['cloze', 'sevenChoices'])

export function PaperBrowsePage(props: PaperBrowsePageProps): ReactNode {
  const {
    paperId,
    focusGroupId,
    questionId,
    lecture,
    similar,
    questionGroupById,
    onAddGroupsToBasket,
    currentDraftPaperId,
    currentDraftGroupCount,
    onOpenDraftPaperWorkbench,
    onBackToWorkbench,
    shellNav,
  } = props

  const [asset, setAsset] = useState<PaperAssetV1 | null>(null)
  const [assetBase, setAssetBase] = useState<string | null>(null)
  const [groupModels, setGroupModels] = useState<Record<string, GroupModel>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  // 讲评态开关 — 挑题态(默认收起)/讲评态(展开)。刀 3: 入口带态的 `lecture`
  // prop（URL 的 lecture=1）种下初始值——lazy initializer 而非
  // useState(false) 是因为它必须在首次渲染就反映入口态，不能等一拍 effect
  // 才翻开（会闪一下挑题态）。
  const [lectureOpen, setLectureOpen] = useState(() => hasExplicitLectureIntent({ focusGroupId, lecture }))
  // 刀 2: 讲评态首次打开时按需补拉的 cloze/grammarFill/writing 解析。
  const [lectureAnalysisByGroupId, setLectureAnalysisByGroupId] = useState<
    Record<string, LectureAnalysisEntry>
  >({})
  const [lectureAnalysisFetched, setLectureAnalysisFetched] = useState(false)
  const [lectureAnalysisLoading, setLectureAnalysisLoading] = useState(false)
  // 刀 2: 讲评态下的显式点题选择；null = 跟随 scrollspy 显示组级概览。
  const [lectureSelection, setLectureSelection] = useState<LectureSelection | null>(null)
  const [openSevenChoiceQuestionIds, setOpenSevenChoiceQuestionIds] = useState<string[]>([])
  // similar-rail (E2): 讲评栏 body 的视图态 — 'analysis'(解析)/'similar'
  // (配相似结果列表)。只在 selectLectureQuestion 换题或用户点「返回解析」
  // 时回落到 'analysis'——滚动离开选中题清空 lectureSelection 的那条 effect
  // (:771-775) 不触碰这个态，结果列表保持到用户主动返回/换题。
  const [similarView, setSimilarView] = useState<'analysis' | 'similar'>('analysis')
  const [similarSeed, setSimilarSeed] = useState<SimilarSeedSnapshot | null>(null)
  const [similarRequest, setSimilarRequest] = useState<SimilarRailRequestState>({ status: 'loading' })
  const [similarSelectedGroupIds, setSimilarSelectedGroupIds] = useState<Set<string>>(new Set())
  const [similarToast, setSimilarToast] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // CR D-MF1：活跃沉降巡检的退场把手——scrollToAnchor 重入时先退旧循环
  // 再起新的（桌面端连点 rail 项不触发 wheel/touch/keydown，若无此把手
  // 两个循环并存互抢滚动打 ping-pong）。
  const scrollSettleCancelRef = useRef<(() => void) | null>(null)
  const focusAppliedRef = useRef(false)
  // 刀 3: 入口带态的 questionId 预选只应用一次（asset 首次加载完成后）；
  // 与 focusAppliedRef 分开计——预选可能比滚动多等一拍（cloze/grammarFill
  // 需要 lectureAnalysisFetched 先到位，见下方 effect）。
  const deepLinkQuestionAppliedRef = useRef(false)
  // similar-entrypoints (E3): 入口带态 `similar=1` 自动打开配相似只应用一次
  // （一旦真正触发或判定静默降级即置位）——用户点「返回解析」后不得被这个
  // effect 再顶回相似态。与 deepLinkQuestionAppliedRef 分开计：必须等
  // lectureSelection 真正落到入口预选的题上（deepLinkQuestionAppliedRef 那
  // 条 effect 落地）才能构造种子，时序天然晚一拍。
  const similarDeepLinkAppliedRef = useRef(false)
  const lectureHandleRef = useRef<HTMLButtonElement | null>(null)
  // 刀 3 小尾巴 ①: 程序化滚动（rail 点击/深链/证据滚动）沉降期标记——期间
  // activeAnchor 的 clear effect 抑制清除，避免深链/rail 点击刚选中的题
  // 被沉降过程中途经的中间锚点误清（cr.md 244-252 根因）。
  const isProgrammaticScrollRef = useRef(false)
  const programmaticScrollTimeoutRef = useRef<number | null>(null)
  // 刀 3: 讲评开合/点题选择的 URL replaceState 同步跳过 mount 的第一次
  // commit——初始态已经是 URL boot-read 的镜像，不需要立刻再写一次。
  const urlSyncMountedRef = useRef(false)
  // 刀 2 修复轮 ③: 阅读跨栏证据动线的容器/左栏/右栏 refs —— shellRef 是
  // `.paper-browse-shell`（已是 position:relative，卷面+讲评栏共同的祖先，
  // 镜像 harness 的 shellRef/leftScrollerRef/rightPanelRef 三件套）。
  // scrollerRef 复用现有的卷面容器（同 harness 的 leftScrollerRef）。
  const shellRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLElement | null>(null)
  // similar-rail (E2): toast fade timer — the parent is the single owner of
  // the show/clear clock (see SimilarQuestionsRailView's toastMessage doc).
  const similarToastTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return (): void => {
      if (similarToastTimeoutRef.current != null) window.clearTimeout(similarToastTimeoutRef.current)
    }
  }, [])

  // 刀 3 小尾巴 ①: 标记程序化滚动即将发生，抑制 scrollspy 的 clear effect
  // 一段沉降窗口（覆盖 smooth 滚动动画时长；深链的 auto 滚动虽然瞬时，仍给
  // 同款窗口——IntersectionObserver 的 entries 回调本身是异步的，即使跳转
  // 本身不animate,首次 observer 回调也可能落在同一个窗口内到达）。
  function suppressScrollspyClear(durationMs = 700): void {
    isProgrammaticScrollRef.current = true
    if (programmaticScrollTimeoutRef.current != null) {
      window.clearTimeout(programmaticScrollTimeoutRef.current)
    }
    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
      programmaticScrollTimeoutRef.current = null
    }, durationMs)
  }

  useEffect(() => {
    return (): void => {
      if (programmaticScrollTimeoutRef.current != null) {
        window.clearTimeout(programmaticScrollTimeoutRef.current)
      }
    }
  }, [])

  // CR should-fix（同 my-space 先例）：讲评栏开着时文档级 Esc 关闭并还焦
  // 到把手，补齐窄屏抽屉的模态语义。
  useEffect(() => {
    if (!lectureOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setLectureOpen(false)
      lectureHandleRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return (): void => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [lectureOpen])

  // 刀 3: 讲评开合 / 点题选择 → URL replaceState 同步（不产生历史条目——
  // App.tsx 的 pushState 只发生在 openPaperBrowse 本身，页内互动一律
  // replaceState）。关讲评清 lecture/questionId；讲评开着且有显式选题时把
  // focusGroupId/questionId 写成当前选中的题组/题，让「复制 URL 分享/刷新」
  // 落回同一姿态同选题。跳过 mount 的第一次 commit——初始态已经是 URL
  // boot-read 的镜像（含入口带态的 lecture/questionId），不需要立刻覆盖。
  useEffect(() => {
    if (!urlSyncMountedRef.current) {
      urlSyncMountedRef.current = true
      return
    }
    if (typeof window === 'undefined' || !window.history || typeof window.history.replaceState !== 'function') {
      return
    }
    try {
      const url = new URL(window.location.href)
      if (!lectureOpen) {
        url.searchParams.delete('lecture')
        url.searchParams.delete('questionId')
        url.searchParams.delete('similar')
      } else {
        url.searchParams.set('lecture', '1')
        if (lectureSelection) {
          url.searchParams.set('focusGroupId', lectureSelection.groupId)
          url.searchParams.set('questionId', lectureSelection.questionId)
        } else {
          url.searchParams.delete('questionId')
        }
        // similar-entrypoints (E3): similarView === 'similar' 且有 seed 时写
        // similar=1（questionId 与 seed 对齐——换题会先把 similarView 落回
        // 'analysis'，见 selectLectureQuestion，所以对齐检查这里只是双重
        // 保险）；回到解析态/关讲评时删掉。
        if (similarView === 'similar' && similarSeed && lectureSelection?.questionId === similarSeed.questionId) {
          url.searchParams.set('similar', '1')
        } else {
          url.searchParams.delete('similar')
        }
      }
      const nextSearch = url.searchParams.toString()
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
      window.history.replaceState(window.history.state, '', nextUrl)
    } catch {
      /* URL sync is best-effort — state above is the authoritative UI change. */
    }
  }, [lectureOpen, lectureSelection, similarView, similarSeed])

  useEffect(() => {
    let cancelled = false
    focusAppliedRef.current = false
    deepLinkQuestionAppliedRef.current = false
    similarDeepLinkAppliedRef.current = false
    setLoading(true)
    setError(null)
    setAsset(null)
    setAssetBase(null)
    setGroupModels({})
    setLectureAnalysisByGroupId({})
    setLectureAnalysisFetched(false)
    setLectureAnalysisLoading(false)
    setLectureSelection(null)
    setOpenSevenChoiceQuestionIds([])

    async function load(): Promise<void> {
      try {
        let resolvedBase = `/paper-assets/${paperId}/latest`
        let assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        if (!assetRes.ok) {
          resolvedBase = `/paper-assets/${paperId}`
          assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        }
        if (!assetRes.ok) {
          throw new Error(`没找到这份卷面（${paperId}），可能已被移除。回到找题页重新打开吧。`)
        }
        const loadedAsset = (await assetRes.json()) as PaperAssetV1
        const canonicalConsumption = await loadScreenConsumption(paperId)

        const groupBlocks = loadedAsset.content.blocks.filter(
          (block): block is Extract<PaperContentBlock, { type: 'group' }> => block.type === 'group',
        )
        const groupTypes = new Set(
          groupBlocks.map((block) => loadedAsset.content.groups[block.groupId]?.groupType),
        )

        let readingAnalysis: ReviewedReadingChoiceAnalysisV1 | null = null
        if (groupTypes.has('reading')) {
          try {
            const res = await fetch(`${resolvedBase}/analyses/reading-choice-analysis-v1.json`)
            if (res.ok) readingAnalysis = (await res.json()) as ReviewedReadingChoiceAnalysisV1
          } catch {
            /* graceful degradation — group renders as a placeholder below */
          }
        }
        let sevenChoicesAnalysis: ReviewedSevenChoicesAnalysisV1 | null = null
        if (groupTypes.has('sevenChoices')) {
          try {
            const res = await fetch(`${resolvedBase}/analyses/seven-choices-analysis-v1.json`)
            if (res.ok) sevenChoicesAnalysis = (await res.json()) as ReviewedSevenChoicesAnalysisV1
          } catch {
            /* graceful degradation */
          }
        }

        // figure-render cut (fig-token P0): best-effort fetch — most papers
        // have no figures/manifest.json at all, a 404/parse failure just
        // means figures stays empty (matches "零图卷零断言" — no error, no
        // placeholder, the raw marker paragraph would only ever appear if
        // a paper HAS a manifest that doesn't cover it, which is exactly
        // the "no manifest hit" placeholder-card case the adapter handles).
        let loadedFigures: PaperFigureManifestEntry[] = []
        try {
          const res = await fetch(`${resolvedBase}/figures/manifest.json`)
          if (res.ok) {
            const manifest = (await res.json()) as { figures?: PaperFigureManifestEntry[] }
            loadedFigures = Array.isArray(manifest.figures) ? manifest.figures : []
          }
        } catch {
          /* graceful degradation — figures stays [] */
        }

        // Resolve both canonical families before publishing any group model.
        // A partial or ambiguous whole-paper plan therefore fails the page
        // boundary instead of degrading a single card.
        const canonicalModels = new Map<string, GroupModel>()
        for (const block of groupBlocks) {
          const group = loadedAsset.content.groups[block.groupId]
          if (group?.groupType === 'cloze') {
            canonicalModels.set(block.groupId, {
              kind: 'cloze',
              model: buildClozePaperView({
                asset: loadedAsset,
                groupId: block.groupId,
                canonicalConsumption: canonicalConsumptionForGroup(
                  canonicalConsumption,
                  'cloze',
                  block.groupId,
                ),
              }),
            })
          } else if (group?.groupType === 'grammarFill') {
            canonicalModels.set(block.groupId, {
              kind: 'grammarFill',
              model: buildGrammarFillPaperView({
                asset: loadedAsset,
                groupId: block.groupId,
                canonicalConsumption: canonicalConsumptionForGroup(
                  canonicalConsumption,
                  'grammar-fill',
                  block.groupId,
                ),
              }),
            })
          }
        }

        const models: Record<string, GroupModel> = {}
        for (const block of groupBlocks) {
          const group = loadedAsset.content.groups[block.groupId]
          if (!group) {
            models[block.groupId] = { kind: 'error', message: '题组数据缺失' }
            continue
          }
          try {
            if (group.groupType === 'reading') {
              if (!readingAnalysis) throw new Error('未找到已审阅阅读解析')
              models[block.groupId] = {
                kind: 'reading',
                model: buildPaperAssetSurfaceModel({
                  asset: loadedAsset,
                  analysis: readingAnalysis,
                  groupId: block.groupId,
                  figures: loadedFigures,
                  assetBase: resolvedBase,
                }),
              }
            } else if (group.groupType === 'sevenChoices') {
              if (!sevenChoicesAnalysis) throw new Error('未找到已审阅七选五解析')
              models[block.groupId] = {
                kind: 'sevenChoices',
                model: buildSevenChoicesSurfaceModel({
                  asset: loadedAsset,
                  analysis: sevenChoicesAnalysis,
                  groupId: block.groupId,
                }),
              }
            } else if (group.groupType === 'cloze') {
              models[block.groupId] = canonicalModels.get(block.groupId)!
            } else if (group.groupType === 'grammarFill') {
              models[block.groupId] = canonicalModels.get(block.groupId)!
            } else if (group.groupType === 'writing') {
              models[block.groupId] = {
                kind: 'writing',
                model: buildWritingPaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
            } else {
              models[block.groupId] = { kind: 'unsupported', groupType: group.groupType }
            }
          } catch (e) {
            models[block.groupId] = {
              kind: 'error',
              message: e instanceof Error ? e.message : String(e),
            }
          }
        }

        if (cancelled) return
        setAsset(loadedAsset)
        setAssetBase(resolvedBase)
        setGroupModels(models)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId])

  // 刀 2: 讲评态首次打开时按需补拉本卷缺的 cloze/grammar-fill/writing 解析
  // （一次性；reading/sevenChoices 已在挑题态无条件拉取，不重复）。挑题态
  // 全程不进这个 effect —— 零新增请求。
  useEffect(() => {
    if (!lectureOpen) return
    if (lectureAnalysisFetched) return
    if (!asset || !assetBase) return
    let cancelled = false
    setLectureAnalysisLoading(true)

    async function loadLectureAnalyses(): Promise<void> {
      const loadedAsset = asset as PaperAssetV1
      const base = assetBase as string
      const groupBlocks = loadedAsset.content.blocks.filter(
        (block): block is Extract<PaperContentBlock, { type: 'group' }> => block.type === 'group',
      )
      const groupIdsByType = (groupType: string): string[] =>
        groupBlocks
          .map((block) => block.groupId)
          .filter((groupId) => loadedAsset.content.groups[groupId]?.groupType === groupType)

      const entries: Record<string, LectureAnalysisEntry> = {}

      const clozeGroupIds = groupIdsByType('cloze')
      if (clozeGroupIds.length > 0) {
        try {
          const res = await fetch(`${base}/analyses/cloze-analysis-v1.json`)
          const raw = res.ok ? ((await res.json()) as ReviewedClozeAnalysisV1) : null
          for (const groupId of clozeGroupIds) {
            if (!raw) {
              entries[groupId] = { kind: 'unavailable' }
              continue
            }
            try {
              entries[groupId] = {
                kind: 'cloze',
                model: buildClozeAnalysisSurfaceModel({ asset: loadedAsset, analysis: raw, groupId }),
              }
            } catch {
              entries[groupId] = { kind: 'unavailable' }
            }
          }
        } catch {
          for (const groupId of clozeGroupIds) entries[groupId] = { kind: 'unavailable' }
        }
      }

      const grammarFillGroupIds = groupIdsByType('grammarFill')
      if (grammarFillGroupIds.length > 0) {
        try {
          const res = await fetch(`${base}/analyses/grammar-fill-analysis-v1.json`)
          const raw = res.ok ? ((await res.json()) as ReviewedGrammarFillAnalysisV1) : null
          for (const groupId of grammarFillGroupIds) {
            if (!raw) {
              entries[groupId] = { kind: 'unavailable' }
              continue
            }
            try {
              entries[groupId] = {
                kind: 'grammarFill',
                model: buildGrammarFillAnalysisSurfaceModel({ asset: loadedAsset, analysis: raw, groupId }),
              }
            } catch {
              entries[groupId] = { kind: 'unavailable' }
            }
          }
        } catch {
          for (const groupId of grammarFillGroupIds) entries[groupId] = { kind: 'unavailable' }
        }
      }

      const writingGroupIds = groupIdsByType('writing')
      if (writingGroupIds.length > 0) {
        try {
          const res = await fetch(`${base}/analyses/writing-analysis-v1.json`)
          const raw = res.ok ? ((await res.json()) as WritingAnalysisFilePayload) : null
          for (const groupId of writingGroupIds) {
            const writing = raw?.groups?.[groupId]?.writing
            entries[groupId] = writing ? { kind: 'writing', analysis: writing } : { kind: 'unavailable' }
          }
        } catch {
          for (const groupId of writingGroupIds) entries[groupId] = { kind: 'unavailable' }
        }
      }

      if (cancelled) return
      setLectureAnalysisByGroupId(entries)
      setLectureAnalysisFetched(true)
      setLectureAnalysisLoading(false)
    }

    void loadLectureAnalyses()
    return (): void => {
      cancelled = true
    }
  }, [lectureOpen, lectureAnalysisFetched, asset, assetBase])

  // Scroll to the requested group once the page has finished loading.
  // 刀 3: focus target falls back to the group derived from `questionId`
  // when `focusGroupId` isn't given (e.g. an old-form href that only carried
  // groupId gets the group either way; this covers the case where only
  // questionId is present).
  useEffect(() => {
    if (focusAppliedRef.current) return
    if (loading || !asset) return
    const targetGroupId = focusGroupId || (questionId ? asset.content.questions[questionId]?.groupId ?? null : null)
    if (!targetGroupId) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-browse-anchor="${cssAttr(targetGroupId)}"]`,
    )
    if (!target) return
    focusAppliedRef.current = true
    suppressScrollspyClear()
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  }, [focusGroupId, questionId, loading, asset])

  // 刀 3: 入口带态的 questionId 预选——asset 加载完成后走
  // selectLectureQuestion 同款路径（镜像点题联动）。仅在讲评态下预选（挑题
  // 态没有讲评栏可显示选中结果）；cloze/grammarFill/writing 组需要等
  // lectureAnalysisFetched 落地才能种下正确的 evidenceId，否则先跳过，等
  // 该 dep 变化后重新判定一次（不会重复选——deepLinkQuestionAppliedRef 只在
  // 真正调用 selectLectureQuestion 后才置位）。
  useEffect(() => {
    if (deepLinkQuestionAppliedRef.current) return
    if (!questionId || !lectureOpen || loading || !asset) return
    const targetGroupId = focusGroupId || (asset.content.questions[questionId]?.groupId ?? null)
    if (!targetGroupId) return
    const group = asset.content.groups[targetGroupId]
    if (!group) return
    const needsLectureAnalysis =
      group.groupType === 'cloze' || group.groupType === 'grammarFill' || group.groupType === 'writing'
    if (needsLectureAnalysis && !lectureAnalysisFetched) return
    deepLinkQuestionAppliedRef.current = true
    // cloze/grammarFill/writing 组等 lectureAnalysisFetched 落地时，可能已
    // 比初始滚动（上面那个 effect 里的 suppressScrollspyClear）晚了不止一拍
    // ——那个窗口早关了。这里再补一次抑制，保证选中落地那一刻不会被
    // 恰好同一拍触发的 scrollspy clear effect 抹掉。
    suppressScrollspyClear()
    selectLectureQuestion(targetGroupId, questionId)
  }, [questionId, focusGroupId, lectureOpen, loading, asset, lectureAnalysisFetched])

  // similar-entrypoints (E3) / similar-passages-entry (E6): 入口带态
  // `similar=1` 自动打开配相似——一次性（ref guard），且必须等上面那条
  // effect 把 lectureSelection 真正落到入口预选的题上才触发（种子快照需要
  // lectureSelection.groupId 对应的 group 才能构造，与「换题时讲评栏 body
  // 回落到解析态」的既有联动天然对齐）。走与 CTA 完全相同的路径
  // （handleSimilarCtaClick 本身），不另写一份种子构造。不支持题型 /
  // questionId 查无此题：静默降级——标记一次性已处理但不触发，讲评态照常
  // 打开，URL 的 `similar` 参数会在下面 replaceState effect 首次提交时被
  // 清掉（不写 similar=1，因为 similarView 从未变成 'similar'）。
  //
  // legacy 自愈 (E6 verify ⑤): cloze/sevenChoices 的旧 `similar=1` 深链
  // （E3 时代由详情页/搜索卡生成，那两处入口已退役自身的深链生成，但已经
  // 分享/收藏出去的旧链接仍然存在）现在走 passages 模式，而不是命中服务端
  // 已下线的小题相似 400——CTA 本身已经按 groupType 分流，这里复用同一条
  // 分流，深链因此天然自愈，不需要专门判断"这是旧链接"。
  useEffect(() => {
    if (similarDeepLinkAppliedRef.current) return
    if (!similar || !lecture || !questionId) return
    if (loading || !asset) return
    const questionMeta = asset.content.questions[questionId]
    if (!questionMeta) {
      similarDeepLinkAppliedRef.current = true // 查无此题 — 静默降级
      return
    }
    const targetGroupId = focusGroupId || questionMeta.groupId
    const group = targetGroupId ? asset.content.groups[targetGroupId] : undefined
    if (!group || !SIMILAR_SUPPORTED_GROUP_TYPES.has(group.groupType)) {
      similarDeepLinkAppliedRef.current = true // 不支持题型 — 静默降级
      return
    }
    // 等选中真正落到这道题（deepLinkQuestionAppliedRef 那条 effect 落地）。
    if (!lectureSelection || lectureSelection.groupId !== targetGroupId || lectureSelection.questionId !== questionId) {
      return
    }
    similarDeepLinkAppliedRef.current = true
    const deepLinkMode = SIMILAR_PASSAGES_MODE_GROUP_TYPES.has(group.groupType) ? 'passages' : 'questions'
    handleSimilarCtaClick({
      mode: deepLinkMode,
      questionId,
      groupId: targetGroupId,
      groupTitle: group.title,
      // 篇章模式种子=整个题组，不带题号（CR SW-2）
      questionNo: deepLinkMode === 'passages' ? null : questionMeta.questionNo ?? null,
      groupTypeLabel: SIMILAR_GROUP_TYPE_LABEL[group.groupType] ?? group.groupType,
      recipeSummary: SIMILAR_RECIPE_SUMMARY[group.groupType] ?? '',
    })
  }, [similar, lecture, questionId, focusGroupId, loading, asset, lectureSelection])

  // Block indices already consumed by a writing group's own pageModel (part/
  // section heading, prompt instruction, 注意 instruction, answerBox — the
  // full run WritingPaperPage renders around the passage) — the top-level
  // loop below must not render them a second time. The group's own block
  // index is excluded from the skip set: that one still renders via
  // renderGroupCard (the card that mounts WritingPaperPage in the first
  // place).
  const writingSkipIndices = useMemo(() => {
    const skip = new Set<number>()
    if (!asset) return skip
    for (const block of asset.content.blocks) {
      if (block.type !== 'group') continue
      if (groupModels[block.groupId]?.kind !== 'writing') continue
      const group = asset.content.groups[block.groupId]
      if (!group) continue
      const range = findWritingBlockRange(asset, group)
      if (!range) continue
      for (let i = range.startIdx; i <= range.endIdx; i += 1) {
        if (i !== range.groupIdx) skip.add(i)
      }
    }
    return skip
  }, [asset, groupModels])

  // dashed-line-unify QA round 2（owner 拍板方案A 2026-07-10，原型
  // prototype-writing-cut.html）：写作卡的选中罩上缘=提示起始线（pi-writing
  // 老语义，即 `.pi-writing-section` 下一个兄弟的顶），标题（第X部分/
  // 第X节）留在素纸上不入选区。标题区高度不定（窄屏换行、字体加载），
  // 纯 CSS 定不了这个 top（one-sheet 已知取舍的根因）——这里量出偏移写进
  // 卡上的 CSS 变量 `--pb-writing-cut-top`，`::after` 用它画上缘（见
  // paperBrowsePage.css）。ResizeObserver 盯卡的尺寸变化重量。
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const measure = () => {
      const cards = scroller.querySelectorAll<HTMLElement>('.paper-browse-group-card--writing')
      for (const card of cards) {
        const section = card.querySelector<HTMLElement>('.pi-writing-section')
        const target = section?.nextElementSibling
        if (!(target instanceof HTMLElement)) continue
        const offset = target.getBoundingClientRect().top - card.getBoundingClientRect().top
        card.style.setProperty('--pb-writing-cut-top', `${offset}px`)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    for (const card of scroller.querySelectorAll('.paper-browse-group-card--writing')) {
      observer.observe(card)
    }
    return () => observer.disconnect()
  }, [asset, groupModels])

  // one-sheet-paper: 剪刀线判定——虚线=题组可搬走内容的起点，见
  // docs/cuts/one-sheet-paper/plan.md「剪刀线语义」。判定规则纯粹按「节下
  // 有几个题组」（不 hardcode groupType，天然覆盖阅读的 4-题组节 vs 其余
  // 单题组节）：
  //   - 节下多个题组（阅读第一节）：每个题组卡自己前面一条线——每张卡本来
  //     就精确等于该题组的剪走范围（字母+文章+题目，节标题/节指导语都是
  //     节层的独立 sibling，不在卡内），不需要合并任何东西。
  //   - 节下仅一个题组：线在节标题之后、指导语之前——若该题组紧邻的上一个
  //     block 恰好是 instruction，把这条 instruction 并入题组卡（同一个
  //     hover/剪走单元，「指导语跟题走」），题组卡自身的顶层 index 位置就
  //     不再单独渲染（改在 instruction 的 index 位置一次性连着渲染）；没有
  //     紧邻 instruction 的单题组节（目前没有这种数据，留通用兜底）则直接
  //     在题组卡自己位置前插线。
  //   - writing 题组（应用文/续写）整段排除在外：它们的节标题/指导语已经
  //     被 findWritingBlockRange 圈进 WritingPaperPage 自己的 pageModel
  //     （forbidden，paper-intelligence/**，不可改），线/hover 范围改用纯
  //     CSS 兄弟选择器在 paperBrowsePage.css 里对 .pi-writing-section 之后
  //     的内容画（见该文件注释）。
  const scissorPlan = useMemo(() => {
    const scissorGroupIndices = new Set<number>()
    const mergedGroupByInstructionIndex = new Map<number, { groupId: string; instructionText: string }>()
    const skipIndices = new Set<number>()
    // dashed-line-unify (owner 拍板 2026-07-10，原型入档 prototype.html):
    // 不变量「静息线集合 == 选中线集合」——节末题组（下一块不是可剪题组
    // 单元）的选中罩下缘在静息时必须有对应淡线，否则选中线凭空出现。
    const bottomLineGroupIndices = new Set<number>()
    if (!asset) return { scissorGroupIndices, mergedGroupByInstructionIndex, skipIndices, bottomLineGroupIndices }
    const blocks = asset.content.blocks

    const sectionGroupCounts = new Map<string, number>()
    let sectionId: string | null = null
    for (const block of blocks) {
      if (block.type === 'sectionHeading') {
        sectionId = block.sectionId
        if (!sectionGroupCounts.has(sectionId)) sectionGroupCounts.set(sectionId, 0)
      } else if (block.type === 'group' && sectionId) {
        sectionGroupCounts.set(sectionId, (sectionGroupCounts.get(sectionId) ?? 0) + 1)
      }
    }

    sectionId = null
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i]
      if (block.type === 'sectionHeading') {
        sectionId = block.sectionId
        continue
      }
      if (block.type !== 'group') continue
      const group = asset.content.groups[block.groupId]
      if (!group || group.groupType === 'writing') continue
      const count = sectionId ? sectionGroupCounts.get(sectionId) ?? 0 : 0
      if (count > 1) {
        scissorGroupIndices.add(i)
        continue
      }
      if (count === 1) {
        const prev = blocks[i - 1]
        if (prev && prev.type === 'instruction') {
          mergedGroupByInstructionIndex.set(i - 1, { groupId: block.groupId, instructionText: prev.text })
          skipIndices.add(i)
        } else {
          scissorGroupIndices.add(i)
        }
      }
    }

    // 节末判定：题组的下一块若是「instruction」（并入下一组的卡，顶线在）
    // 或「非写作 group」（其顶线即本组底界），底界有静息线可循；其余
    // （标题/分页/卷末/写作——写作的静息顶线在其内部提示起始线，不在卡的
    // 上边界）算节末，补底线。QA round 2（owner 拍板方案A 2026-07-10，
    // 原型 prototype-writing-cut.html）：写作卡的选中罩上缘随之下移到
    // 提示起始线（见 paperBrowsePage.css），标题上方的底线不再有歧义——
    // 就是上一组的底界；35cd609 的写作例外撤销。写作组自身同为剪走单元，
    // 底界一并记账（下一块按 findWritingBlockRange 圈完的 range 之后算，
    // 卡内尾随的 instruction/answerBox 不是别人的顶线）。
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i]
      if (block.type !== 'group') continue
      const group = asset.content.groups[block.groupId]
      const isWriting = group?.groupType === 'writing'
      const isCutUnit = scissorGroupIndices.has(i) || skipIndices.has(i) || isWriting
      if (!isCutUnit) continue
      let afterIdx = i + 1
      if (isWriting && group) {
        const range = findWritingBlockRange(asset, group)
        if (range) afterIdx = range.endIdx + 1
      }
      const next = blocks[afterIdx]
      const nextHasRestingTopLine =
        next != null &&
        (next.type === 'instruction' ||
          (next.type === 'group' && asset.content.groups[next.groupId]?.groupType !== 'writing'))
      if (!nextHasRestingTopLine) bottomLineGroupIndices.add(i)
    }
    return { scissorGroupIndices, mergedGroupByInstructionIndex, skipIndices, bottomLineGroupIndices }
  }, [asset])

  // rail scrollspy — highlight the topmost anchor currently visible in the
  // scroll container. Simple ordering-based arbitration (no pixel-level
  // tie-breaking): among all anchors the observer currently reports as
  // intersecting, pick the first one in document order.
  //
  // root is the browser viewport (null), not the scroller ref: the page
  // scrolls at the document level (.paper-browse-content itself has no
  // overflow/height constraint — it grows to full content height), so a
  // percentage rootMargin must be computed against the viewport, not
  // against the ~9000px-tall content element (which would make the
  // margin thousands of pixels and break the "topmost visible" signal).
  useEffect(() => {
    if (loading || !asset) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const anchorEls = Array.from(
      scroller.querySelectorAll<HTMLElement>('[data-paper-browse-anchor]'),
    )
    if (anchorEls.length === 0) return
    const order = anchorEls.map((el) => el.getAttribute('data-paper-browse-anchor') || '')
    const visible = new Set<string>()
    // 刀 3 小尾巴 ②: 慢滚跨组临界处，entries 会在相邻两个 anchor 之间连续
    // 抖动几帧——去抖到 120ms 稳定窗口再提交 setActiveAnchor，activeAnchor
    // 不来回横跳。窗口足够短，不影响正常滚动下的响应感。
    let debounceTimer: number | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const anchor = (entry.target as HTMLElement).getAttribute('data-paper-browse-anchor')
          if (!anchor) continue
          if (entry.isIntersecting) visible.add(anchor)
          else visible.delete(anchor)
        }
        const current = order.find((anchor) => visible.has(anchor))
        if (!current) return
        if (debounceTimer != null) window.clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null
          setActiveAnchor(current)
        }, 120)
      },
      { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    for (const el of anchorEls) observer.observe(el)
    return (): void => {
      observer.disconnect()
      if (debounceTimer != null) window.clearTimeout(debounceTimer)
    }
  }, [asset, loading])

  // 刀 2: 无点选时右栏跟随 scrollspy 显示组级概览；点题后进题级
  // （见 selectLectureQuestion）。滚动离开当前选中题所在的题组时清空显式
  // 选择，讲评栏回落到新滚到题组的组级概览 —— 不让上一题的选中态跨组残留。
  // 刀 3 小尾巴 ①: 只在 activeAnchor 变成"另一个真实题组 id"时才清
  // （part/section 锚没有对应题组，不清）；程序化滚动沉降期内（rail 点击/
  // 深链/证据滚动，见 suppressScrollspyClear）抑制清除——避免深链/点击刚
  // 选中的题被沉降过程中途经的中间锚点误清（cr.md 244-252 根因）。
  useEffect(() => {
    if (isProgrammaticScrollRef.current) return
    if (!activeAnchor || !asset?.content.groups[activeAnchor]) return
    setLectureSelection((prev) => {
      if (!prev) return prev
      const scroller = scrollerRef.current
      const selectedGroup = scroller?.querySelector<HTMLElement>(
        `[data-paper-browse-anchor="${cssAttr(prev.groupId)}"]`,
      )
      const selectedRect = selectedGroup?.getBoundingClientRect()
      const scrollerRect = scroller?.getBoundingClientRect()
      const selectedGroupVisible = Boolean(
        selectedRect
        && scrollerRect
        && selectedRect.bottom > scrollerRect.top
        && selectedRect.top < scrollerRect.bottom,
      )
      return shouldClearLectureSelectionForActiveGroup({
        activeGroupId: activeAnchor,
        selectedGroupId: prev.groupId,
        selectedGroupVisible,
      })
        ? null
        : prev
    })
  }, [activeAnchor, asset])

  // 刀 2 修复轮 ①: 阅读 parity — 点题/点证据后把命中的原文证据句滚入视野，
  // 镜像 PaperIntelligencePaperSurfaceHarness.tsx 的 "Auto-scroll active
  // evidence into the PaperSurface scroller" effect（activeEvidenceId 变化
  // 即滚动 `[data-paper-evidence-id]` 锚点入视野）。只对阅读组做这个动线：
  // 完形/语法填空是"原位型"，空即位置，只给证据高亮不做滚动（见 plan
  // 「卷面显影原则」）；七选五"混血"用衔接句高亮（下方另一处修复），同样
  // 不做阅读式动线。
  useEffect(() => {
    if (!lectureOpen) return
    if (!lectureSelection?.evidenceId) return
    if (groupModels[lectureSelection.groupId]?.kind !== 'reading') return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-evidence-id="${cssAttr(lectureSelection.evidenceId)}"]`,
    )
    if (!target) return
    suppressScrollspyClear()
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() })
  }, [lectureOpen, lectureSelection, groupModels])

  // rail-panel（owner 拍板 2026-07-15，原型 B「分段面板」胜出——四变体实拍
  // 对比后选定）：目录 rail 两级化，节层并入部分。sectionHeading 不再进
  // rail（「第二节 (共5小题；每小题2.5分，满分12.5分)」整串换行是原版的
  // 病根），部分行只留洗出来的部分名 + 右侧「满分N分」小字；题组行 = 题组
  // 名 + 题号胶囊章。卷面里的节标题块照渲染不受影响——只是导航不再逐节。
  const railParts = useMemo(() => {
    if (!asset) return []
    type RailGroup = { anchor: string; title: string; range: string }
    const parts: Array<{ anchor: string; name: string; score: string | null; groups: RailGroup[] }> = []
    // 部分标题原文形如「第三部分 语言运用(共两节，满分30分)」：括号段只留
    // 满分数字，前缀「第X部分」剥掉——分值/序数是卷面措辞，不是导航信息。
    const stripParens = (s: string) => s.replace(/[（(][^（()）]*[）)]/g, '').trim()
    const partNameOf = (text: string) => {
      const m = stripParens(text).match(/^第[一二三四五六七八九十百]+部分\s*(.*)$/)
      return m && m[1] ? m[1] : stripParens(text)
    }
    const scoreOf = (text: string) => {
      const m = text.match(/满分\s*([\d.]+)\s*分/)
      return m ? `满分${m[1]}分` : null
    }
    for (const block of asset.content.blocks) {
      if (block.type === 'partHeading') {
        parts.push({
          anchor: block.partId,
          name: partNameOf(block.text),
          score: scoreOf(block.text),
          groups: [],
        })
      } else if (block.type === 'group') {
        const group = asset.content.groups[block.groupId]
        if (!group) continue
        const questionNos = group.questionIds
          .map((qid) => asset.content.questions[qid]?.questionNo)
          .filter((no): no is number => typeof no === 'number')
          .sort((a, b) => a - b)
        const range = questionNos.length
          ? questionNos.length === 1
            ? `${questionNos[0]}`
            : `${questionNos[0]}-${questionNos[questionNos.length - 1]}`
          : ''
        let part = parts[parts.length - 1]
        if (!part) {
          // 数据以题组开头（无部分标题）的防御桶：无名部分，不渲染头行
          part = { anchor: block.groupId, name: '', score: null, groups: [] }
          parts.push(part)
        }
        part.groups.push({ anchor: block.groupId, title: group.title, range })
      }
      // sectionHeading: 不进 rail（见上方拍板注释）
    }
    return parts
  }, [asset])

  // 讲评态紧凑 rail 的扁平题组表：题号区间当短标签，无题号退回题组名。
  const railGroups = useMemo(() => railParts.flatMap((part) => part.groups), [railParts])

  // 刀 2: 讲评栏的目标题组 —— 显式点题选中的题组优先，否则退回 scrollspy
  // 当前锚点(仅当锚点本身就是一个题组 id 时)。
  const panelGroupId = useMemo(() => {
    if (lectureSelection) return lectureSelection.groupId
    if (activeAnchor && asset?.content.groups[activeAnchor]) return activeAnchor
    return null
  }, [lectureSelection, activeAnchor, asset])

  // 刀 2: 当前显式选中题的 lectureFocus —— 只喂给 panelGroupId 对应那组的
  // PaperSurface 挂载，其余题组永远拿 null（讲评开着也不跨组高亮）。
  const lectureFocusForSelection: LectureFocus | null = useMemo(() => {
    if (!lectureSelection) return null
    return lectureSelection.evidenceId
      ? {
          kind: 'question',
          questionId: lectureSelection.questionId,
          activeEvidenceId: lectureSelection.evidenceId,
        }
      : { kind: 'question', questionId: lectureSelection.questionId }
  }, [lectureSelection])

  // 刀 2 修复轮 ②: 七选五原文高亮 —— 讲评栏当前面板组是七选五时接入解析页
  // harness 同款 useSevenChoicesPaperHighlights，随链条手风琴（
  // openSevenChoiceQuestionIds）在整卷页卷面容器上亮衔接句。scroller ref
  // 用整卷页卷面容器（`scrollerRef` → `.paper-browse-content`），不是某一
  // 题组的局部容器 —— 该 hook 的坐标算法基于 rect 差值，document 级滚动
  // 下与题组容器同款效果（两者都是 viewport-relative，差值不受页面滚动
  // 影响，只随 hook 自身的 resize/effect-dep 重算刷新，见 hook 内部）。
  const panelGroupModel = panelGroupId ? groupModels[panelGroupId] : undefined
  const sevenChoiceOverlay = useSevenChoicesPaperHighlights({
    enabled: lectureOpen && panelGroupModel?.kind === 'sevenChoices',
    leftScrollerRef: scrollerRef,
    openQuestionIds: openSevenChoiceQuestionIds,
    chains: panelGroupModel?.kind === 'sevenChoices' ? panelGroupModel.model.chains : [],
  })

  // 刀 2 修复轮 ③: 阅读跨栏证据动线的选中态 —— 只在讲评开+当前讲评栏目标
  // 题组是阅读题组时给非空值；activeEvidenceKind 镜像 harness「Derive
  // activeEvidenceKind」的 paper-asset 分支（evidenceKindById 查表），支撑
  // /干扰两色分档在浏览器侧与解析页一致。其余题型（完形/语法填空/七选五/
  // 写作）永远拿 questionId=null，PaperIntelligenceEvidenceLine 内部的硬门
  // 控（activeQuestionId && activeEvidenceId 双非空）自然不画线——不需要额外
  // 判断 groupType 来阻止它们，双重保险。
  const readingEvidenceLineContext = useMemo((): {
    questionId: string | null
    evidenceId: string | null
    kind: 'support' | 'trap' | null
  } => {
    if (!lectureOpen) return { questionId: null, evidenceId: null, kind: null }
    if (!lectureSelection) return { questionId: null, evidenceId: null, kind: null }
    if (panelGroupId !== lectureSelection.groupId) return { questionId: null, evidenceId: null, kind: null }
    if (panelGroupModel?.kind !== 'reading') return { questionId: null, evidenceId: null, kind: null }
    const evidenceId = lectureSelection.evidenceId
    const kind = evidenceId ? panelGroupModel.model.evidenceKindById[evidenceId] ?? null : null
    return { questionId: lectureSelection.questionId, evidenceId, kind }
  }, [lectureOpen, lectureSelection, panelGroupId, panelGroupModel])

  function scrollToAnchor(anchor: string): void {
    const scroller = scrollerRef.current
    if (!scroller) return
    // 每次都从 ref 取活节点：冷加载沉降期 scroller 容器本身也可能被
    // 替换，闭包捕获的旧节点 detached 后 querySelector 永远查空。
    const queryTarget = () =>
      scrollerRef.current?.querySelector<HTMLElement>(
        `[data-paper-browse-anchor="${cssAttr(anchor)}"]`,
      ) ?? null
    // CR D-MF1：retire-then-replace——先退掉仍在跑的上一轮巡检。
    scrollSettleCancelRef.current?.()
    const target = queryTarget()
    suppressScrollspyClear()
    target?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: scrollBehavior() })
    // 留观① QA 定性后按实修（triage 拍板「再现按竞态修」）：两种真实
    // 失效都收——① 冷加载沉降期题组模型异步落地，scrollIntoView 只按
    // 当下位置算一次，目标被后续布局推走；② smooth 滚动动画由渲染帧
    // 驱动，窗口被遮挡/后台时 rAF 冻结，动画永远走不完（QA 实测
    // rafRan=false，正是「高亮动了、卷面不动」的机制）。故沉降循环用
    // setTimeout（遮挡态照跑）每 150ms 巡检 5s：位置静止 ≥3 拍仍明显
    // 偏离才用 behavior:'auto' 硬校准（不打断进行中的 smooth 动画）；
    // 用户 wheel/touchstart/keydown 立即让位；每拍重查询锚点（沉降期
    // 节点可能尚未挂载或被替换，捕获引用会拿到 detached 节点）。
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
    let lastTop = Number.NaN
    let stillChecks = 0
    const settle = () => {
      if (cancelled) return
      if (performance.now() > deadline) {
        cancel()
        return
      }
      const el = queryTarget()
      if (!el) {
        lastTop = Number.NaN
        stillChecks = 0
      } else {
        const top = el.getBoundingClientRect().top
        stillChecks = Math.abs(top - lastTop) < 1 ? stillChecks + 1 : 0
        lastTop = top
        if (stillChecks >= 3 && Math.abs(top) > 4) {
          el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
          stillChecks = 0
        }
      }
      timer = setTimeout(settle, 150)
    }
    timer = setTimeout(settle, 150)
  }

  // 刀 2: 点题选中 —— 种下的 evidenceId/optionLabel 逻辑镜像
  // PaperIntelligencePaperSurfaceHarness 的 request-lecture-focus 分支
  // （cloze/grammarFill 取首条证据行，reading 取 supportEvidenceId+answer，
  // 其余(sevenChoices/writing/未发布解析)不种子，面板自行走空态）。
  function selectLectureQuestion(groupId: string, questionId: string): void {
    // similar-rail (E2): 换到新题时讲评栏 body 回落到解析态——「配相似」
    // 结果列表只在同一道题上跨滚动/跨面板持续，换题就该重新走 CTA。不清
    // similarRequest/selection 本身，只切视图态：这样若用户误点又点回原题
    // （极少见）也不会丢已经取到的结果。
    setSimilarView('analysis')
    const lectureEntry = lectureAnalysisByGroupId[groupId]
    const plainEntry = groupModels[groupId]
    // 选中七选五题时自动展开该题的衔接链手风琴（openQuestionIds 是本页
    // 外控 state，面板零改动）。只追加不收起：手动开合与「全部收起」照旧。
    if (asset?.content.groups[groupId]?.groupType === 'sevenChoices') {
      setOpenSevenChoiceQuestionIds((prev) => (prev.includes(questionId) ? prev : [...prev, questionId]))
    }
    if (lectureEntry?.kind === 'cloze') {
      const blankView = lectureEntry.model.analysisByQuestionId[questionId] ?? null
      const firstPassageEvidence = blankView?.evidenceRows.find((row) => !row.isOptionSide) ?? null
      setLectureSelection({
        groupId,
        questionId,
        evidenceId: firstPassageEvidence?.evidenceId ?? null,
        optionLabel: null,
      })
      return
    }
    if (lectureEntry?.kind === 'grammarFill') {
      const blankView = lectureEntry.model.analysisByQuestionId[questionId] ?? null
      const firstEvidence = blankView?.evidenceRows[0] ?? null
      setLectureSelection({
        groupId,
        questionId,
        evidenceId: firstEvidence?.evidenceId ?? null,
        optionLabel: null,
      })
      return
    }
    if (plainEntry?.kind === 'reading') {
      const analysis = plainEntry.model.analysisByQuestionId[questionId] ?? null
      setLectureSelection({
        groupId,
        questionId,
        evidenceId: analysis?.supportEvidenceId ?? null,
        optionLabel: analysis?.answer ?? null,
      })
      return
    }
    setLectureSelection({ groupId, questionId, evidenceId: null, optionLabel: null })
  }

  function handleGroupFocusIntent(groupId: string, intent: PaperSurfaceFocusIntent): void {
    applyPaperSurfaceFocusIntent({
      groupId,
      intent,
      suppressScrollspyClear,
      activateGroup: setActiveAnchor,
      selectLectureQuestion,
    })
  }

  function handleLectureSelectEvidence(evidenceId: string): void {
    setLectureSelection((prev) => (prev ? { ...prev, evidenceId } : prev))
  }

  function handleLectureSelectOption(optionLabel: string, evidenceId: string | null): void {
    setLectureSelection((prev) => (prev ? { ...prev, optionLabel, evidenceId } : prev))
  }

  // similar-rail (E2/E6): loads once per CTA click / retry — 请求纪律 (plan
  // point 6): never on selection, never prefetched. `seed.mode` picks the
  // endpoint: cloze/sevenChoices seed POST /api/similar-passages by groupId
  // (小题相似已下线), reading/grammarFill still seed POST
  // /api/similar-questions by questionId (unchanged v2 recipe).
  async function loadSimilar(seed: SimilarSeedSnapshot): Promise<void> {
    setSimilarRequest({ status: 'loading' })
    try {
      if (seed.mode === 'passages') {
        const response = await fetchSimilarPassages(seed.groupId)
        setSimilarRequest({ status: 'ready', data: { kind: 'passages', response } })
      } else {
        const response = await fetchSimilarQuestions(seed.questionId)
        setSimilarRequest({ status: 'ready', data: { kind: 'questions', response } })
      }
    } catch (error) {
      setSimilarRequest({
        status: 'error',
        message: error instanceof Error ? error.message : '加载相似题失败，请重试',
      })
    }
  }

  function handleSimilarCtaClick(seed: SimilarSeedSnapshot): void {
    setSimilarSeed(seed)
    setSimilarView('similar')
    setSimilarSelectedGroupIds(new Set())
    void loadSimilar(seed)
  }

  function handleSimilarRetry(): void {
    if (!similarSeed) return
    void loadSimilar(similarSeed)
  }

  function handleSimilarToggleGroup(groupId: string): void {
    setSimilarSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function handleSimilarAddToDraft(): void {
    const cards = [...similarSelectedGroupIds]
      .map((groupId) => questionGroupById.get(groupId))
      .filter((card): card is QuestionGroupCard => Boolean(card))
    if (cards.length === 0) return
    onAddGroupsToBasket(cards)
    setSimilarSelectedGroupIds(new Set())
    if (similarToastTimeoutRef.current != null) window.clearTimeout(similarToastTimeoutRef.current)
    setSimilarToast(`已加入草稿卷 · ${cards.length} 篇（含各自题目）`)
    similarToastTimeoutRef.current = window.setTimeout(() => setSimilarToast(null), 2200)
  }

  function renderGroupBody(groupId: string, entry: GroupModel | undefined): ReactNode {
    if (!entry) {
      return <div className="paper-browse-placeholder">加载中…</div>
    }
    if (entry.kind === 'error') {
      return <div className="paper-browse-placeholder">该题组暂不可预览：{entry.message}</div>
    }
    if (entry.kind === 'unsupported') {
      return (
        <div className="paper-browse-placeholder">
          该题型（{entry.groupType}）本页暂不支持预览。
        </div>
      )
    }

    // 刀 2: 讲评态里，cloze/grammarFill 若已成功拉到解析，卷面挂载切到
    // analysis-based surfaceData（证据/高亮数据源），镜像 harness 的
    // clozeAnalysisModel/grammarFillAnalysisModel 覆盖 plain 模型的做法。
    // 挑题态(!lectureOpen)永远用 plain surfaceData —— 零解析噪音不变量。
    const lectureEntry = lectureAnalysisByGroupId[groupId]
    let surfaceData = entry.model.surfaceData
    let blankFocusMode: 'rail' | 'in-passage' | 'paper-blank' | undefined
    if (lectureOpen && entry.kind === 'cloze' && lectureEntry?.kind === 'cloze') {
      surfaceData = lectureEntry.model.surfaceData
    } else if (lectureOpen && entry.kind === 'grammarFill' && lectureEntry?.kind === 'grammarFill') {
      surfaceData = lectureEntry.model.surfaceData
      blankFocusMode = 'in-passage'
    }
    // lecture-rail-scroll-fix: cloze / 七选五 blanks become clickable
    // focus buttons in lecture mode — independent of whether
    // lectureEntry has resolved (点空即联动右栏, the panel's own
    // analysis fetch is a separate concern). 挑题态(!lectureOpen) never
    // sets this — blanks stay non-interactive, zero click-noise
    // invariant unchanged.
    if (lectureOpen && (entry.kind === 'cloze' || entry.kind === 'sevenChoices')) {
      blankFocusMode = 'paper-blank'
    }
    // QA fix: 七选五 surfaceData.questions is intentionally [] (the A-G
    // pool renders via optionBank, never per-question rows), so the
    // blank → questionId map derived inside PaperSurface would be empty
    // and every blank would fall back to the non-interactive span. Feed
    // the mapping from the asset itself. Cloze needs nothing — its
    // adapter emits real per-question rows.
    let blankQuestionIdByNo: Record<string, string> | undefined
    if (blankFocusMode === 'paper-blank' && entry.kind === 'sevenChoices') {
      const group = asset?.content.groups[groupId]
      if (group) {
        blankQuestionIdByNo = {}
        for (const questionId of group.questionIds) {
          const no = asset?.content.questions[questionId]?.questionNo
          if (no !== undefined && no !== null) blankQuestionIdByNo[String(no)] = questionId
        }
      }
    }

    const isPanelGroup = lectureOpen && panelGroupId === groupId
    const writingGroup = asset?.content.groups[groupId]
    const sourceTaskType = writingGroup?.writingTaskId
      ? asset?.content.writingTasks?.[writingGroup.writingTaskId]?.taskType
      : undefined
    const writingLectureEntry = lectureAnalysisByGroupId[groupId]
    const retainedLecture = getRetainedWritingLecture({
      lectureOpen,
      panelGroupId,
      groupId,
      sourceTaskType,
      analysis: writingLectureEntry?.kind === 'writing' ? writingLectureEntry.analysis : undefined,
    })

    const surfaceEl = (
      <PaperSurface
        textMap={surfaceData.textMap}
        semanticParagraphs={surfaceData.semanticParagraphs}
        annotations={[]}
        evidence={surfaceData.evidence}
        questions={surfaceData.questions}
        // seven-options-on-paper: the 七选五 A-G pool, display-only.
        // `entry.model.options` (SevenChoicesOptionView[]) is structurally
        // compatible with PaperQuestionOption ({label, text, translation?}
        // vs {label, text, chain}) — no adapter change needed.
        optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
        mode="lecture"
        lectureFocus={isPanelGroup ? lectureFocusForSelection : null}
        readingFocusBySection={{}}
        onFocusIntent={lectureOpen ? (intent) => handleGroupFocusIntent(groupId, intent) : () => {}}
        blankFocusMode={blankFocusMode}
        blankQuestionIdByNo={blankQuestionIdByNo}
      />
    )
    if (entry.kind === 'writing') {
      const answerBoxOpensLecture = (
        !lectureOpen
        && sourceTaskType === 'application'
        && isRetainedWritingPilotGroup(groupId)
      )
      return (
        <WritingPaperPage
          pageModel={entry.model.pageModel}
          retainedModelAnswer={retainedLecture?.modelAnswer}
          retainedOfficialModelAnswer={retainedLecture?.officialModelAnswer}
          onAnswerBoxActivate={answerBoxOpensLecture
            ? () => {
                setLectureSelection(null)
                setSimilarView('analysis')
                setActiveAnchor(groupId)
                setLectureOpen(true)
              }
            : undefined}
        >
          {surfaceEl}
        </WritingPaperPage>
      )
    }
    return surfaceEl
  }

  // one-sheet-paper: `mergedInstructionText` folds a single-group section's
  // leading 指导语 into this same hover/剪走 unit (owner-ratified rule:
  // 「指导语跟题走」) — rendered inside the card, in the same hover-highlight
  // boundary as the group's surface.
  //
  // scissor-select-feel: `showScissorLine` no longer renders a flow sibling
  // before the card — the dashed 剪刀线 is a zero-footprint overlay
  // (`.paper-browse-scissor-line`, `position: absolute`) rendered as the
  // card's own child, painted at the block-gap midpoint above the card (see
  // paperBrowsePage.css). Every non-writing group still gets exactly one
  // (either here, standalone, or via the merged-instruction render path
  // below which passes it too) — only *where it paints* changed, not *which
  // groups get one* (that's still scissorPlan, untouched). The hover
  // selection band + boundary rules live purely in CSS on
  // `.paper-browse-group-card::after` and apply to every card uniformly
  // (including writing groups, whose own internal cutline stays a separate
  // CSS-only sibling-selector rule — see paperBrowsePage.css).
  function renderGroupCard(
    groupId: string,
    index: number,
    options?: { mergedInstructionText?: string; showScissorLine?: boolean; showBottomScissorLine?: boolean },
  ): ReactNode {
    const group = asset?.content.groups[groupId]
    const entry = groupModels[groupId]
    const card = questionGroupById.get(groupId)
    // 写作卡的选中罩上缘另行定位（--pb-writing-cut-top，见上方量高 effect
    // 与 paperBrowsePage.css），用 modifier class 圈出来。
    const cardClassName =
      entry?.kind === 'writing'
        ? 'paper-browse-group-card paper-browse-group-card--writing'
        : 'paper-browse-group-card'

    return (
      <Fragment key={`group-${index}`}>
        <section
          className={cardClassName}
          data-paper-browse-anchor={groupId}
          aria-label={group?.title || groupId}
        >
          {card && (
            <div className="paper-browse-group-actions">
              <button
                type="button"
                className="add-button"
                onClick={() => onAddGroupsToBasket([card])}
                disabled={card.draftPaperButtonState === 'disabled'}
                title={
                  card.draftPaperButtonState === 'disabled'
                    ? card.printUnavailableReason || '暂不可组卷'
                    : undefined
                }
              >
                {card.draftPaperButtonState === 'in_current_draft'
                  ? '已在草稿卷中'
                  : card.draftPaperButtonState === 'disabled'
                    ? '暂不可组卷'
                    : '加入草稿卷'}
              </button>
            </div>
          )}
          {options?.showScissorLine && (
            <div className="paper-browse-scissor-line" aria-hidden="true" />
          )}
          {options?.showBottomScissorLine && (
            <div className="paper-browse-scissor-line paper-browse-scissor-line--bottom" aria-hidden="true" />
          )}
          {options?.mergedInstructionText && (
            <p className="paper-browse-instruction paper-browse-instruction--merged">
              {options.mergedInstructionText}
            </p>
          )}
          {renderGroupBody(groupId, entry)}
        </section>
      </Fragment>
    )
  }

  // 刀 2: 讲评栏身体 —— 当前题组 groupType 对应的解析面板，复用解析页
  // harness 同款五面板 + adapter。旧的"跳解析页"深读链接已退役（入口带态
  // 迁移是刀 3），身体不再只是速览+跳转，而是完整解析内容。
  function renderLectureAnalysisPanel(ctx: {
    groupId: string
    group: PaperContentGroup
    hasActiveQuestion: boolean
    activeQuestionId: string | null
    activeEvidenceId: string | null
    activeOptionLabel: string | null
  }): ReactNode {
    const { groupId, group, hasActiveQuestion, activeQuestionId, activeEvidenceId, activeOptionLabel } = ctx
    const entry = groupModels[groupId]
    const lectureEntry = lectureAnalysisByGroupId[groupId]

    if (group.groupType === 'sevenChoices' && entry?.kind === 'sevenChoices') {
      const chains = entry.model.chains
      return (
        <SevenChoicesAnalysisPanel
          options={entry.model.options}
          chains={chains}
          openQuestionIds={openSevenChoiceQuestionIds}
          onToggleChain={(questionId) => {
            setOpenSevenChoiceQuestionIds((prev) =>
              prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
            )
            setLectureSelection(null)
          }}
          onShowAll={() => {
            setOpenSevenChoiceQuestionIds(chains.map((chain) => chain.questionId))
            setLectureSelection(null)
          }}
          onHideAll={() => {
            setOpenSevenChoiceQuestionIds([])
            setLectureSelection(null)
          }}
        />
      )
    }

    if (group.groupType === 'reading' && entry?.kind === 'reading') {
      const analysis = activeQuestionId ? entry.model.analysisByQuestionId[activeQuestionId] ?? null : null
      return (
        <PaperAssetAnalysisPanel
          analysis={analysis}
          hasActiveQuestion={hasActiveQuestion}
          activeOptionLabel={activeOptionLabel}
          activeEvidenceId={activeEvidenceId}
          onSelectOption={handleLectureSelectOption}
          onSelectEvidence={handleLectureSelectEvidence}
        />
      )
    }

    if (group.groupType === 'cloze') {
      if (lectureEntry?.kind === 'cloze') {
        const analysis = activeQuestionId
          ? lectureEntry.model.analysisByQuestionId[activeQuestionId] ?? null
          : null
        return (
          <ClozeAnalysisPanel
            analysis={analysis}
            hasActiveQuestion={hasActiveQuestion}
            activeEvidenceId={activeEvidenceId}
            groupView={lectureEntry.model.groupView}
            onSelectEvidence={handleLectureSelectEvidence}
          />
        )
      }
      return (
        <p className="paper-browse-lecture-empty">{lectureAnalysisLoading ? '解析加载中…' : '解析未发布'}</p>
      )
    }

    if (group.groupType === 'grammarFill') {
      if (lectureEntry?.kind === 'grammarFill') {
        const analysis = activeQuestionId
          ? lectureEntry.model.analysisByQuestionId[activeQuestionId] ?? null
          : null
        return (
          <GrammarFillAnalysisPanel
            analysis={analysis}
            hasActiveQuestion={hasActiveQuestion}
            activeEvidenceId={activeEvidenceId}
            groupView={lectureEntry.model.groupView}
            onSelectEvidence={handleLectureSelectEvidence}
          />
        )
      }
      return (
        <p className="paper-browse-lecture-empty">{lectureAnalysisLoading ? '解析加载中…' : '解析未发布'}</p>
      )
    }

    if (group.groupType === 'writing') {
      if (lectureEntry?.kind === 'writing') {
        const sourceTaskType = group.writingTaskId
          ? asset?.content.writingTasks?.[group.writingTaskId]?.taskType
          : undefined
        const retainedLecture = getRetainedWritingLecture({
          lectureOpen,
          panelGroupId,
          groupId,
          sourceTaskType,
          analysis: lectureEntry.analysis,
        })
        if (retainedLecture?.reviewCard) {
          return <RetainedReviewCard reviewCard={retainedLecture.reviewCard} />
        }
        if (sourceTaskType === 'application' || lectureEntry.analysis.taskType === 'application') {
          return <p className="paper-browse-lecture-empty">解析未发布</p>
        }
        return <WritingAnalysisPanel analysis={lectureEntry.analysis} />
      }
      return (
        <p className="paper-browse-lecture-empty">{lectureAnalysisLoading ? '解析加载中…' : '解析未发布'}</p>
      )
    }

    return <p className="paper-browse-lecture-empty">解析未发布</p>
  }

  // 讲评栏内容 — 头部沿用刀 1 的组级速览，跟随 scrollspy/点题共同决定的
  // panelGroupId；activeAnchor 落在 part/section 标题上（没有对应题组）时
  // 走空态，实现从简（刀 1 契约允许）。
  function renderLecturePanel(): ReactNode {
    if (!asset) return null
    // similar-rail (E2): once a fetch has been made, the result view is
    // rendered independent of panelGroupId/scrollspy — persists across
    // scroll-away (which only clears lectureSelection, not similarView) until
    // the user explicitly returns or selects a new question (selectLectureQuestion).
    if (similarView === 'similar' && similarSeed) {
      return (
        <SimilarQuestionsRailView
          seed={{
            mode: similarSeed.mode,
            groupTitle: similarSeed.groupTitle,
            questionNo: similarSeed.questionNo,
            groupTypeLabel: similarSeed.groupTypeLabel,
            recipeSummary: similarSeed.recipeSummary,
          }}
          request={similarRequest}
          questionGroupById={questionGroupById}
          selectedGroupIds={similarSelectedGroupIds}
          onToggleGroup={handleSimilarToggleGroup}
          onBack={() => setSimilarView('analysis')}
          onRetry={handleSimilarRetry}
          onAddToDraft={handleSimilarAddToDraft}
          toastMessage={similarToast}
        />
      )
    }
    const groupId = panelGroupId
    const group = groupId ? asset.content.groups[groupId] : undefined
    if (!groupId || !group) {
      // 刀 3 小尾巴 ③: 刀 1 的旧空态文案在窄屏抽屉语境下失真——抽屉盖在
      // 卷面上，不是并排布局，"滚动"这个动作在那个视觉框架里读不通。改成
      // 宽窄屏通用的可操作指引；宽屏下依然是"滚动卷面"这个动作，语义没变。
      return <p className="paper-browse-lecture-empty">滚动卷面或点选题目后，这里显示讲评</p>
    }
    const range = buildGroupRangeLabel(asset, group)
    const answerRow = buildAnswerRowText(asset, group)
    const hasActiveQuestion = Boolean(lectureSelection && lectureSelection.groupId === groupId)
    const activeQuestionId = hasActiveQuestion ? lectureSelection?.questionId ?? null : null
    const activeEvidenceId = hasActiveQuestion ? lectureSelection?.evidenceId ?? null : null
    const activeOptionLabel = hasActiveQuestion ? lectureSelection?.optionLabel ?? null : null
    return (
      <div className="paper-browse-lecture-body">
        <h4 className="paper-browse-lecture-title">
          {group.title}
          {range && <span className="paper-browse-lecture-range"> · {range}</span>}
        </h4>
        {answerRow && <p className="paper-browse-answer-row">{answerRow}</p>}
        <div className="paper-browse-lecture-analysis">
          {renderLectureAnalysisPanel({
            groupId,
            group,
            hasActiveQuestion,
            activeQuestionId,
            activeEvidenceId,
            activeOptionLabel,
          })}
        </div>
        {/* similar-rail (E2/E6), 已拍板设计 1: 当前选中题的解析下方「配相似」
            /「相似篇章」CTA——无选中题不渲染；只对 v2 引擎支持的四个题型
            (program.md Q5) 渲染，写作/听力题组即便被选中也不出现这个按钮。
            E6: cloze/sevenChoices 的小题相似已下线——CTA 保留原位，文案改
            「相似篇章」，点击改调 /api/similar-passages（种子=当前题组）。 */}
        {hasActiveQuestion && activeQuestionId && SIMILAR_SUPPORTED_GROUP_TYPES.has(group.groupType) && (
          <div className="similar-cta">
            {/* owner 拍板 2026-07-10：按钮在最左，说明文字跟在右边 */}
            <button
              type="button"
              className="similar-btn similar-btn--primary"
              onClick={() => {
                const mode = SIMILAR_PASSAGES_MODE_GROUP_TYPES.has(group.groupType) ? 'passages' : 'questions'
                // 篇章模式种子=整个题组，不带题号（CR SW-2）
                const questionNo = mode === 'passages' ? null : asset.content.questions[activeQuestionId]?.questionNo ?? null
                handleSimilarCtaClick({
                  mode,
                  questionId: activeQuestionId,
                  groupId,
                  groupTitle: group.title,
                  questionNo,
                  groupTypeLabel: SIMILAR_GROUP_TYPE_LABEL[group.groupType] ?? group.groupType,
                  recipeSummary: SIMILAR_RECIPE_SUMMARY[group.groupType] ?? '',
                })
              }}
            >
              🔁 {SIMILAR_PASSAGES_MODE_GROUP_TYPES.has(group.groupType) ? '相似篇章' : '配相似'}
            </button>
            <span className="similar-cta-why">——从库里配同配方的相似题</span>
          </div>
        )}
      </div>
    )
  }

  function renderBlock(block: PaperContentBlock, index: number): ReactNode {
    switch (block.type) {
      case 'partHeading':
        return (
          <h2
            key={`part-${index}`}
            className="paper-browse-part-heading"
            data-paper-browse-anchor={block.partId}
          >
            {block.text}
          </h2>
        )
      case 'sectionHeading':
        return (
          <h3
            key={`section-${index}`}
            className="paper-browse-section-heading"
            data-paper-browse-anchor={block.sectionId}
          >
            {block.text}
          </h3>
        )
      case 'instruction': {
        // one-sheet-paper: a single-group section's leading 指导语 gets
        // folded into that group's own hover/剪走 unit (scissorPlan,
        // computed above) instead of rendering standalone here — the
        // scissor line renders as part of that merged unit, not as a
        // separate sibling before this paragraph.
        const merged = scissorPlan.mergedGroupByInstructionIndex.get(index)
        if (merged) {
          return renderGroupCard(merged.groupId, index, {
            mergedInstructionText: merged.instructionText,
            showScissorLine: true,
            // 并组卡渲染在 instruction 的 index 上，节末集合按 group 块
            // 自己的 index（本卡的下一块）记账。
            showBottomScissorLine: scissorPlan.bottomLineGroupIndices.has(index + 1),
          })
        }
        return (
          <p key={`instruction-${index}`} className="paper-browse-instruction">
            {block.text}
          </p>
        )
      }
      case 'group':
        return renderGroupCard(block.groupId, index, {
          showScissorLine: scissorPlan.scissorGroupIndices.has(index),
          showBottomScissorLine: scissorPlan.bottomLineGroupIndices.has(index),
        })
      case 'pageBreakHint':
        return <div key={`pagebreak-${index}`} className="paper-browse-pagebreak" aria-hidden="true" />
      default:
        // notice / exampleQuestion / questionRange / answerBox and any
        // future block type: render a placeholder row, never crash.
        return (
          <div key={`placeholder-${index}`} className="paper-browse-placeholder">
            该内容类型（{block.type}）本页暂不支持预览。
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-loading">加载中…</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-error">
          <h2>没找到这份卷面</h2>
          <p>{error || '卷面数据为空，回到找题页重新打开吧。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="paper-browse-page">
      <AppTopbar {...shellNav} pageTitle={asset.paper.title} onBack={onBackToWorkbench} />
      <div
        className={`paper-browse-shell${
          lectureOpen ? ' paper-browse-shell--lecture-open' : ''
        }`}
        ref={shellRef}
      >
        <nav
          className={`paper-browse-rail${lectureOpen ? ' paper-browse-rail--compact' : ''}`}
          aria-label="目录"
        >
          {lectureOpen ? (
            // 讲评态 rail 收窄给卷面让宽：只留题组项（题号区间），部分头
            // 隐去；完整名走 title tooltip。卡片语言与挑题态同款（owner
            // 2026-07-15「按完讲评之后也是一块卡片」）：同一张浅纸面板，
            // 整行即题号章，选中翻实心。
            <div className="paper-browse-rail-panel paper-browse-rail-panel--compact">
              {railGroups.map((g) => {
                const isActive = g.anchor === activeAnchor
                return (
                  <button
                    key={g.anchor}
                    type="button"
                    className={`paper-browse-rail-group paper-browse-rail-group--compact${
                      isActive ? ' paper-browse-rail-group--active' : ''
                    }`}
                    aria-current={isActive ? 'true' : undefined}
                    title={g.range ? `${g.title} · ${g.range}` : g.title}
                    onClick={() => scrollToAnchor(g.anchor)}
                  >
                    {g.range || g.title}
                  </button>
                )
              })}
            </div>
          ) : (
            // 挑题态分段面板（rail-panel，owner 拍板 2026-07-15）：rail 是
            // 一张浅纸面板，部分之间淡线分段，题号做胶囊章、选中翻实心。
            <div className="paper-browse-rail-panel">
              {railParts.map((part) => (
                <div key={part.anchor} className="paper-browse-rail-part">
                  {part.name && (
                    <div className="paper-browse-rail-part-head">
                      <button
                        type="button"
                        className="paper-browse-rail-part-name"
                        onClick={() => scrollToAnchor(part.anchor)}
                      >
                        {part.name}
                      </button>
                      {part.score && <span className="paper-browse-rail-part-score">{part.score}</span>}
                    </div>
                  )}
                  {part.groups.map((g) => {
                    const isActive = g.anchor === activeAnchor
                    return (
                      <button
                        key={g.anchor}
                        type="button"
                        className={`paper-browse-rail-group${
                          isActive ? ' paper-browse-rail-group--active' : ''
                        }`}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => scrollToAnchor(g.anchor)}
                      >
                        <span className="paper-browse-rail-group-title">{g.title}</span>
                        {g.range && <span className="paper-browse-rail-group-chip">{g.range}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </nav>
        <div className="paper-browse-content" ref={scrollerRef} style={paperBrowseContentStyle}>
          {asset.content.blocks.map((block, index) =>
            writingSkipIndices.has(index) || scissorPlan.skipIndices.has(index)
              ? null
              : renderBlock(block, index),
          )}
          {/*
            刀 2 修复轮 ②: 七选五衔接句高亮覆盖层。渲染条件与 hook 的
            `enabled` 同款门控（panelGroupModel?.kind === 'sevenChoices'）
            而不只看 marks.length —— 讲评栏切到别的题组时 hook 内部不会
            主动清空 marks（只在 enabled 时才 setOverlay），若只看
            marks.length 会露出上一个七选五题组的残影。
          */}
          {lectureOpen && panelGroupModel?.kind === 'sevenChoices' && sevenChoiceOverlay.marks.length > 0 && (
            <div className="paper-browse-seven-blank-overlay" aria-hidden="true">
              {sevenChoiceOverlay.marks.map((mark) => (
                <span
                  key={mark.id}
                  className={`paper-browse-seven-clue-mark paper-browse-seven-clue-mark--${mark.kind}`}
                  data-seven-color={mark.colorIndex}
                  style={{
                    transform: `translate(${mark.left}px, ${mark.top}px)`,
                    width: `${mark.width}px`,
                    height: `${mark.height}px`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {lectureOpen && (
          <aside className="paper-browse-lecture-panel" aria-label="讲评" ref={rightPanelRef}>
            {renderLecturePanel()}
          </aside>
        )}
        {/*
          刀 2 修复轮 ③: 阅读跨栏证据动线 —— import-only 复用解析页 harness
          同款 `PaperIntelligenceEvidenceLine`（geometry 只 import 不改）。
          只在讲评开+当前讲评栏目标题组是阅读题组时挂载（卷面显影原则：
          完形/语法填空原位型只给证据高亮不做动线，七选五混血用衔接句高亮，
          写作无证据概念——均不接线）。containerRef 用 `.paper-browse-shell`
          （本就是 position:relative，卷面+讲评栏共同祖先），
          leftScrollerRef 复用卷面容器 scrollerRef，rightPanelRef 指向讲评栏
          aside，与 harness 的 shellRef/leftScrollerRef/rightPanelRef 三件套
          一一对应。抽屉态（<1200px）几何意义不大——讲评栏离开文档流叠在
          卷面上，见 paperBrowsePage.css 里同断点的 display:none 收紧。
        */}
        {lectureOpen && panelGroupModel?.kind === 'reading' && (
          <PaperIntelligenceEvidenceLine
            containerRef={shellRef}
            leftScrollerRef={scrollerRef}
            rightPanelRef={rightPanelRef}
            activeQuestionId={readingEvidenceLineContext.questionId}
            activeEvidenceId={readingEvidenceLineContext.evidenceId}
            activeEvidenceKind={readingEvidenceLineContext.kind}
            leftSelectorPreset="paper-surface"
          />
        )}
      </div>
      {/*
        刀 2: 窄屏抽屉的背景蒙层只做视觉暗化，不再拦截点击 —— 刀 1 时
        PaperSurface 全程只读，"点蒙层关闭"和"点卷面"从不冲突；刀 2 卷面
        题目在讲评态下真的可点了，蒙层若继续吞掉点击，窄屏用户就永远点不到
        题（讲评栏只能停在滚动带出的组级概览）。关闭抽屉改由把手（z-index
        更高，讲评态下常驻可点）和文档级 Esc（见上方 effect）兜底，两条
        路径都不受蒙层影响。
      */}
      {lectureOpen && <div className="paper-browse-lecture-backdrop" aria-hidden="true" />}
      <button
        type="button"
        ref={lectureHandleRef}
        className={`paper-browse-lecture-handle${
          lectureOpen ? ' paper-browse-lecture-handle--open' : ''
        }`}
        onClick={() => setLectureOpen((open) => !open)}
        aria-pressed={lectureOpen}
        aria-expanded={lectureOpen}
      >
        讲评
      </button>
      <button
        type="button"
        className="basket-chip"
        onClick={() => onOpenDraftPaperWorkbench(currentDraftPaperId)}
        aria-label={`打开草稿卷，已选 ${currentDraftGroupCount} 个题组`}
        disabled={!currentDraftPaperId || currentDraftGroupCount === 0}
      >
        <ClipboardList size={15} />
        <span>草稿卷 · {currentDraftGroupCount} 题组</span>
      </button>
    </div>
  )
}
