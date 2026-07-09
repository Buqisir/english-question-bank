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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
} from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
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

export type PaperBrowsePageProps = {
  paperId: string
  focusGroupId?: string | null
  /** App's loaded questionGroups, keyed by id (== paper-asset groupId). */
  questionGroupById: Map<string, QuestionGroupCard>
  onAddGroupsToBasket: (groups: QuestionGroupCard[]) => void
  currentDraftPaperId: string | null
  currentDraftGroupCount: number
  onOpenDraftPaperWorkbench: (draftPaperId?: string | null) => void
  onBackToWorkbench: () => void
  shellNav: AppTopbarNav
}

function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
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

export function PaperBrowsePage(props: PaperBrowsePageProps): ReactNode {
  const {
    paperId,
    focusGroupId,
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
  // 讲评态开关 — 挑题态(默认收起)/讲评态(展开). State only, per 刀 1 契约;
  // URL 承载留给刀 3。
  const [lectureOpen, setLectureOpen] = useState(false)
  // 刀 2: 讲评态首次打开时按需补拉的 cloze/grammarFill/writing 解析。
  const [lectureAnalysisByGroupId, setLectureAnalysisByGroupId] = useState<
    Record<string, LectureAnalysisEntry>
  >({})
  const [lectureAnalysisFetched, setLectureAnalysisFetched] = useState(false)
  const [lectureAnalysisLoading, setLectureAnalysisLoading] = useState(false)
  // 刀 2: 讲评态下的显式点题选择；null = 跟随 scrollspy 显示组级概览。
  const [lectureSelection, setLectureSelection] = useState<LectureSelection | null>(null)
  const [openSevenChoiceQuestionIds, setOpenSevenChoiceQuestionIds] = useState<string[]>([])
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const focusAppliedRef = useRef(false)
  const lectureHandleRef = useRef<HTMLButtonElement | null>(null)

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

  useEffect(() => {
    let cancelled = false
    focusAppliedRef.current = false
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
              models[block.groupId] = {
                kind: 'cloze',
                model: buildClozePaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
            } else if (group.groupType === 'grammarFill') {
              models[block.groupId] = {
                kind: 'grammarFill',
                model: buildGrammarFillPaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
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
  useEffect(() => {
    if (focusAppliedRef.current) return
    if (!focusGroupId || loading || !asset) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-browse-anchor="${cssAttr(focusGroupId)}"]`,
    )
    if (!target) return
    focusAppliedRef.current = true
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  }, [focusGroupId, loading, asset])

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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const anchor = (entry.target as HTMLElement).getAttribute('data-paper-browse-anchor')
          if (!anchor) continue
          if (entry.isIntersecting) visible.add(anchor)
          else visible.delete(anchor)
        }
        const current = order.find((anchor) => visible.has(anchor))
        if (current) setActiveAnchor(current)
      },
      { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    for (const el of anchorEls) observer.observe(el)
    return (): void => observer.disconnect()
  }, [asset, loading])

  // 刀 2: 无点选时右栏跟随 scrollspy 显示组级概览；点题后进题级
  // （见 selectLectureQuestion）。滚动离开当前选中题所在的题组时清空显式
  // 选择，讲评栏回落到新滚到题组的组级概览 —— 不让上一题的选中态跨组残留。
  useEffect(() => {
    setLectureSelection((prev) => (prev && prev.groupId !== activeAnchor ? null : prev))
  }, [activeAnchor])

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
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [lectureOpen, lectureSelection, groupModels])

  const railItems = useMemo(() => {
    if (!asset) return []
    const items: Array<{
      anchor: string
      label: string
      /** 讲评态紧凑 rail 用的短标签：题号区间，无题号时退回题组名。 */
      compactLabel?: string
      kind: 'part' | 'section' | 'group'
    }> = []
    for (const block of asset.content.blocks) {
      if (block.type === 'partHeading') {
        items.push({ anchor: block.partId, label: block.text, kind: 'part' })
      } else if (block.type === 'sectionHeading') {
        items.push({ anchor: block.sectionId, label: block.text, kind: 'section' })
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
        items.push({
          anchor: block.groupId,
          label: range ? `${group.title} · ${range}` : group.title,
          compactLabel: range || group.title,
          kind: 'group',
        })
      }
    }
    return items
  }, [asset])

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

  function scrollToAnchor(anchor: string): void {
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-browse-anchor="${cssAttr(anchor)}"]`,
    )
    if (!target) return
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
  }

  // 刀 2: 点题选中 —— 种下的 evidenceId/optionLabel 逻辑镜像
  // PaperIntelligencePaperSurfaceHarness 的 request-lecture-focus 分支
  // （cloze/grammarFill 取首条证据行，reading 取 supportEvidenceId+answer，
  // 其余(sevenChoices/writing/未发布解析)不种子，面板自行走空态）。
  function selectLectureQuestion(groupId: string, questionId: string): void {
    const lectureEntry = lectureAnalysisByGroupId[groupId]
    const plainEntry = groupModels[groupId]
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
    if (intent.kind !== 'request-lecture-focus') return
    selectLectureQuestion(groupId, intent.questionId)
  }

  function handleLectureSelectEvidence(evidenceId: string): void {
    setLectureSelection((prev) => (prev ? { ...prev, evidenceId } : prev))
  }

  function handleLectureSelectOption(optionLabel: string, evidenceId: string | null): void {
    setLectureSelection((prev) => (prev ? { ...prev, optionLabel, evidenceId } : prev))
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
    let blankFocusMode: 'rail' | 'in-passage' | undefined
    if (lectureOpen && entry.kind === 'cloze' && lectureEntry?.kind === 'cloze') {
      surfaceData = lectureEntry.model.surfaceData
    } else if (lectureOpen && entry.kind === 'grammarFill' && lectureEntry?.kind === 'grammarFill') {
      surfaceData = lectureEntry.model.surfaceData
      blankFocusMode = 'in-passage'
    }

    const isPanelGroup = lectureOpen && panelGroupId === groupId

    const surfaceEl = (
      <PaperSurface
        textMap={surfaceData.textMap}
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
      />
    )
    if (entry.kind === 'writing') {
      return <WritingPaperPage pageModel={entry.model.pageModel}>{surfaceEl}</WritingPaperPage>
    }
    return surfaceEl
  }

  function renderGroupCard(groupId: string, index: number): ReactNode {
    const group = asset?.content.groups[groupId]
    const entry = groupModels[groupId]
    const card = questionGroupById.get(groupId)

    return (
      <section
        key={`group-${index}`}
        className="paper-browse-group-card"
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
        {renderGroupBody(groupId, entry)}
      </section>
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
    const groupId = panelGroupId
    const group = groupId ? asset.content.groups[groupId] : undefined
    if (!groupId || !group) {
      return <p className="paper-browse-lecture-empty">滚动到题组查看速览</p>
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
      case 'instruction':
        return (
          <p key={`instruction-${index}`} className="paper-browse-instruction">
            {block.text}
          </p>
        )
      case 'group':
        return renderGroupCard(block.groupId, index)
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
      >
        <nav
          className={`paper-browse-rail${lectureOpen ? ' paper-browse-rail--compact' : ''}`}
          aria-label="目录"
        >
          {railItems.map((item) => {
            // 讲评态 rail 收窄给卷面让宽：只留题组项（题号区间），部分/节
            // 标题隐去；完整名走 title tooltip。
            if (lectureOpen && item.kind !== 'group') return null
            const isActive = item.anchor === activeAnchor
            return (
              <button
                key={item.anchor}
                type="button"
                className={`paper-browse-rail-item paper-browse-rail-item--${item.kind}${
                  isActive ? ' paper-browse-rail-item--active' : ''
                }`}
                aria-current={isActive ? 'true' : undefined}
                title={lectureOpen ? item.label : undefined}
                onClick={() => scrollToAnchor(item.anchor)}
              >
                {lectureOpen ? item.compactLabel || item.label : item.label}
              </button>
            )
          })}
        </nav>
        <div className="paper-browse-content" ref={scrollerRef}>
          {asset.content.blocks.map((block, index) =>
            writingSkipIndices.has(index) ? null : renderBlock(block, index),
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
          <aside className="paper-browse-lecture-panel" aria-label="讲评">
            {renderLecturePanel()}
          </aside>
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
