/**
 * PaperBrowsePage — 刀B 整卷预览页 v1 → flow-panel 刀 2（点题联动 + 五解析面板搬家）。
 *
 * Route: `?view=paper-browse&paperId=<id>[&focusGroupId=<gid>]`.
 *
 * Streams the whole paper-asset in document order (content.blocks) as one
 * `<PaperSurface>` mount per question-group card, reusing the same
 * per-groupType adapters the Paper Intelligence harness uses
 * (`buildPaperAssetSurfaceModel` / `buildSevenChoicesSurfaceModel` /
 * `buildClozePaperView` / `buildGrammarFillPaperView`), while canonical
 * Reading and Writing semantics come only from the whole-paper Consumption
 * Plan.
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
 *   - `cloze-analysis-v1` / `grammar-fill-analysis-v1` are fetched once,
 *     lazily, the first time 讲评态 opens. `writing-analysis-v1` is prefetched
 *     once so a complete application payload can open lecture from the answer
 *     box (reading / sevenChoices analyses are already fetched unconditionally
 *     at page load). A missing/failed analysis degrades that
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
import { ClipboardList, RefreshCw } from 'lucide-react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
// one-sheet-paper: 卷面字体/边距 token 只读消费——同 PaperSurface.tsx /
// WritingPaperPage.tsx 的注入手法（CSS custom properties on a shared
// ancestor），不是 shared-ui/papersurface/** 或 paper-intelligence/**
// 内部文件，纯数据 primitives，import-only 零改动。
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import {
  sevenChoicesRhythm,
} from '../../../../shared/paper-canonical/sevenChoicesRhythm.mjs'
import {
  clozeRhythm,
} from '../../../../shared/paper-canonical/clozeRhythm.mjs'
import {
  grammarFillRhythm,
} from '../../../../shared/paper-canonical/grammarFillRhythm.mjs'
import type { GrammarFillScreenRuling } from '../../../../shared/papersurface/blankRuling.mjs'
import {
  paperTypographyRuntime,
  sectionHeadingRuntime,
  sectionHeadingTextRuns,
} from '../../../../shared/paper-canonical/sectionHeadingContract.mjs'
import {
  resolveGrammarFillPublicGeometryFixture,
} from '../../../../shared/paper-canonical/grammarFillPublicGeometryFixtures.mjs'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
} from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData,
  buildCanonicalReadingConsumptionSurfaceData,
  type CanonicalReadingSurfaceBlock,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  projectCanonicalWritingChrome,
  projectCanonicalConsumerGroup,
  selectConsumerGroupMode,
  selectedFamilyContractIdForGroup,
} from '../../../../shared/paper-canonical/consumerProjection.mjs'
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
  canonicalModeForGroup,
  canonicalConsumptionForGroup,
  loadScreenConsumption,
  type WholePaperConsumption,
} from '../paper-intelligence/canonicalConsumptionClient.ts'
import {
  buildWritingPaperView,
  type WritingPaperViewModel,
} from '../paper-intelligence/writingPaperViewAdapter.ts'
import {
  projectAssetBlocksToCanonicalConsumption,
} from './paperBrowseCanonicalAssetProjection.ts'
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
import { ContinuationAnalysisPanel } from './ContinuationAnalysisPanel'
import {
  getRetainedWritingLecture,
  hasCompleteApplicationLecturePayload,
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
import { isNarrativeContinuationWritingAnalysis } from '../../domain/paperAsset.ts'
import type { QuestionGroupCard } from '../../domain/questionBank'
import type { LectureFocus, PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'
import { fetchSimilarPassages, fetchSimilarQuestions } from '../../services/similarQuestions.ts'
import {
  SimilarQuestionsRailView,
  type SimilarRailRequestState,
} from './SimilarQuestionsRailView'
import { applyPaperSurfaceFocusIntent } from './paperBrowseFocusIntent'
import './paperBrowsePage.css'

type GroupModel =
  | {
      kind: 'reading'
      model: {
        surfaceData: PaperAssetSurfaceModel['surfaceData']
        analysisByQuestionId: PaperAssetSurfaceModel['analysisByQuestionId']
        evidenceKindById: PaperAssetSurfaceModel['evidenceKindById']
        canonicalReadingBlocks: ReadonlyArray<CanonicalReadingSurfaceBlock>
        canonicalReadingPassageLetter?: 'A' | 'B' | 'C' | 'D'
        canonicalReadingSemanticSignature: string
      }
    }
  | { kind: 'sevenChoices'; model: SevenChoicesSurfaceModel }
  | { kind: 'cloze'; model: ClozePaperViewModel }
  | { kind: 'grammarFill'; model: GrammarFillPaperViewModel }
  | {
      kind: 'writing'
      model: Pick<WritingPaperViewModel, 'surfaceData' | 'pageModel'> & {
        canonicalPromptBlocks?: ReadonlyArray<{
          readonly nodeId: string
          readonly inlines: ReadonlyArray<{
            readonly nodeId: string
            readonly text: string
          }>
        }>
        canonicalContinuationMaterialBlocks?: ReadonlyArray<{
          readonly nodeId: string
          readonly inlines: ReadonlyArray<{
            readonly nodeId: string
            readonly text: string
          }>
        }>
      }
    }
  | { kind: 'unsupported'; groupType: string }
  | { kind: 'error'; message: string }

// 讲评态按需补拉的 cloze/grammarFill/writing 解析——reading/sevenChoices 的
// 解析已在挑题态初次加载时无条件拉取。'unavailable'
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

function isRenderableWritingAnalysis(value: unknown): value is WritingAnalysis {
  if (!value || typeof value !== 'object') return false
  const analysis = value as Record<string, unknown>
  if (
    !['application', 'continuation'].includes(String(analysis.taskType ?? ''))
    || typeof analysis.modelAnswer !== 'string'
  ) return false
  if (analysis.taskType === 'application') {
    return (
      analysis.highlightExpressions === undefined
      || Array.isArray(analysis.highlightExpressions)
    )
  }
  if (isNarrativeContinuationWritingAnalysis(analysis)) return true
  if (!Array.isArray(analysis.highlightExpressions)) return false
  const continuationDesign = analysis.continuationDesign
  if (!continuationDesign || typeof continuationDesign !== 'object') {
    return false
  }
  const design = continuationDesign as Record<string, unknown>
  return (
    typeof design.theme === 'string'
    && Array.isArray(design.paragraphs)
    && design.paragraphs.length === 2
    && design.paragraphs.every(
      (paragraph) => typeof paragraph === 'string',
    )
  )
}

function writingTaskTypeForSurface({
  asset,
  consumption,
  groupId,
}: {
  asset: PaperAssetV1 | null
  consumption: WholePaperConsumption | null
  groupId: string
}): 'application' | 'continuation' | undefined {
  if (consumption) {
    const familyContractId = selectedFamilyContractIdForGroup({
      consumption,
      groupId,
    })
    if (familyContractId === 'application-writing') return 'application'
    if (familyContractId === 'continuation-writing') return 'continuation'
    return undefined
  }
  const group = asset?.content.groups[groupId]
  return group?.writingTaskId
    ? asset?.content.writingTasks?.[group.writingTaskId]?.taskType
    : undefined
}

function canonicalWritingNavigationChrome({
  consumption,
  groupId,
  renderedGroupIds,
}: {
  consumption: WholePaperConsumption
  groupId: string
  renderedGroupIds: ReadonlyArray<string>
}): ReturnType<typeof projectCanonicalWritingChrome> | null {
  const familyContractId = selectedFamilyContractIdForGroup({
    consumption,
    groupId,
  })
  if (
    familyContractId !== 'application-writing'
    && familyContractId !== 'continuation-writing'
  ) return null
  if (
    canonicalModeForGroup(
      consumption,
      familyContractId,
      groupId,
    ) !== 'canonical'
  ) return null
  return projectCanonicalWritingChrome({
    consumption,
    groupId,
    renderedGroupIds,
  })
}

// 讲评态下的显式点选——右边只显示这次点击对应的解析。questionId 为空是
// 写作组整框点选。null 选择表示右边还没有解析，不跟随滚动。
type LectureSelection = {
  groupId: string
  questionId: string | null
  evidenceId: string | null
  optionLabel: string | null
}

// similar-rail (E2/E6): a snapshot of the seed that a fetch was made for,
// captured at CTA-click time — kept separate from the live `lectureSelection`
// so the result view (and its retry button) stay put until the user returns
// or clicks another question.
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
  /** Import review only: read the immutable Candidate revision through the
   * reviewer API while keeping this exact Screen renderer. */
  reviewRevision?: string | null
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
  /** Canonical QA/public-fixture companion for the optional A-G bank heading.
   * Production callers omit it; an absent node collapses without space. */
  sevenChoicesBankHeading?: string
  /** Canonical QA/public-fixture selection resolved before PaperBrowse
   * renders. Production callers omit it; verifier-side DOM mutation is
   * forbidden. */
  grammarFillGeometryVariantId?: string
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

function grammarFillScreenRulingFromSurfaceData(
  surfaceData: unknown,
): GrammarFillScreenRuling | undefined {
  if (
    !surfaceData
    || typeof surfaceData !== 'object'
    || !('grammarFillScreenRuling' in surfaceData)
  ) return undefined
  const ruling = surfaceData.grammarFillScreenRuling
  return ruling && typeof ruling === 'object'
    ? ruling as GrammarFillScreenRuling
    : undefined
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
  '--ps-font-stack-zh': paperSurfaceTokens.paperFontStackZh,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-section-heading-font-stack':
    sectionHeadingRuntime.screen.fontStack,
  '--ps-section-heading-font-size':
    `${sectionHeadingRuntime.screen.fontSizePx}px`,
  '--ps-section-heading-line-height':
    `${sectionHeadingRuntime.screen.lineHeightPx}px`,
  '--ps-section-heading-visible-weight':
    paperTypographyRuntime.visibleWeight.sectionHeading,
  '--ps-instruction-visible-weight':
    paperTypographyRuntime.visibleWeight.instruction,
  '--ps-part-heading-indent':
    `${sectionHeadingRuntime.screen.partHeadingIndentEm}em`,
  '--ps-section-heading-indent':
    `${sectionHeadingRuntime.screen.sectionHeadingIndentEm}em`,
  '--ps-section-heading-numeric-shift':
    `${sectionHeadingRuntime.screen.numericRunBaselineShiftEm}em`,
  '--ps-part-to-first-section-gap':
    `${Math.max(
      0,
      paperTypographyRuntime.partToFirstSectionGeometry
        .visibleGlyphBottomStepRatio
        * paperTypographyRuntime.partToFirstSectionGeometry
          .visibleGlyphHeightToFontSizeRatio.screen
        * sectionHeadingRuntime.screen.fontSizePx
      - sectionHeadingRuntime.screen.lineHeightPx,
    )}px`,
  '--ps-part-to-first-section-glyph-overhang':
    `${(
      paperTypographyRuntime.partToFirstSectionGeometry
        .visibleGlyphHeightToFontSizeRatio.screen
      - 1
    ) * sectionHeadingRuntime.screen.fontSizePx}px`,
  '--ps-group-instruction-indent':
    `${sectionHeadingRuntime.screen.groupInstructionFirstLineIndentEm}em`,
  '--ps-seven-merged-instruction-margin-bottom':
    `${sevenChoicesRhythm.visibleGeometryAdjustments.screen.mergedInstructionMarginBottomPx}px`,
  '--ps-seven-following-section-margin-top-adjustment':
    `${sevenChoicesRhythm.visibleGeometryAdjustments.screen.followingSectionMarginTopAdjustmentPx}px`,
  '--ps-seven-adjacent-chrome-margin-top-adjustment':
    `${sevenChoicesRhythm.visibleGeometryAdjustments.screen.adjacentChromeMarginTopAdjustmentPx}px`,
  '--ps-cloze-baseline-step':
    `${clozeRhythm.targets.screen.baselineStepPx}px`,
  '--ps-grammar-fill-baseline-step':
    `${grammarFillRhythm.rendererMapping.screen.baselineStepPx}px`,
  '--ps-grammar-fill-prompt-gap':
    `${grammarFillRhythm.promptGeometry.gapEm}em`,
  '--ps-grammar-fill-instruction-margin-bottom':
    `${grammarFillRhythm.rendererMapping.screen.instructionMarginBottomPx}px`,
  '--ps-grammar-fill-following-section-margin-top':
    `${grammarFillRhythm.rendererMapping.screen.followingSectionMarginTopPx}px`,
  '--ps-grammar-fill-writing-margin-plain':
    `${grammarFillRhythm.rendererMapping.screen.writingCardMarginTopPx.plain}px`,
  '--ps-grammar-fill-writing-margin-lecture':
    `${grammarFillRhythm.rendererMapping.screen.writingCardMarginTopPx.lecture}px`,
  '--ps-passage-indent':
    `${sectionHeadingRuntime.screen.passageFirstLineIndentEm}em`,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

const PIANO_RAIL_WHITE_KEY_HEIGHT = 40
const PIANO_RAIL_BLACK_BOUNDARIES = new Set([1, 2, 4, 5, 6])

function pianoRailGroupLabel(title: string): string {
  const trimmed = title.trim()
  const readingLetter = trimmed.match(/^Reading\s+([A-D])$/i)
  if (readingLetter) return readingLetter[1].toUpperCase()
  return trimmed.replace(/\s*[（(]\s*满分\s*[\d.]+\s*分\s*[）)]\s*$/, '')
}

function mountCanonicalReadingEvidenceAnchor(
  card: HTMLElement,
  input: {
    evidenceId: string
    kind: 'support' | 'trap' | null
    quote: string
  },
): (() => void) | null {
  const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
  const target = compact(input.quote)
  if (!target) return null

  const inlineCandidates = [...card.querySelectorAll<HTMLElement>(
    '.ps-canonical-reading [data-canonical-content-node-id]',
  )]
  const blockCandidates = [...card.querySelectorAll<HTMLElement>(
    '.ps-canonical-reading [data-canonical-block-id]',
  )]
  const anchor = [...inlineCandidates, ...blockCandidates]
    .find((element) => compact(element.textContent ?? '').includes(target))
  if (!anchor) return null

  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode() as Text | null
  while (textNode) {
    const start = textNode.data.indexOf(input.quote)
    if (start >= 0) {
      const match = textNode.splitText(start)
      match.splitText(input.quote.length)
      const mark = document.createElement('mark')
      mark.className = 'ps-evidence-anchor ps-evidence-anchor--active'
      mark.setAttribute('data-paper-evidence-id', input.evidenceId)
      mark.setAttribute('data-paper-browse-evidence-line-anchor', input.evidenceId)
      if (input.kind) mark.setAttribute('data-paper-evidence-kind', input.kind)
      match.replaceWith(mark)
      mark.append(match)
      return () => {
        if (!mark.isConnected) return
        const parent = mark.parentElement
        mark.replaceWith(match)
        parent?.normalize()
      }
    }
    textNode = walker.nextNode() as Text | null
  }

  // A reviewed quote can span adjacent canonical inlines. In that case the
  // smallest owning block is still a truthful visual anchor; never guess a
  // different passage node merely to make the connector appear.
  anchor.setAttribute('data-paper-evidence-id', input.evidenceId)
  anchor.setAttribute('data-paper-browse-evidence-line-anchor', input.evidenceId)
  return () => {
    if (
      anchor.getAttribute('data-paper-browse-evidence-line-anchor')
        === input.evidenceId
    ) {
      anchor.removeAttribute('data-paper-evidence-id')
      anchor.removeAttribute('data-paper-browse-evidence-line-anchor')
    }
  }
}

function renderSectionHeadingText(text: string): ReactNode {
  return sectionHeadingTextRuns(text).map((run, index) =>
    run.kind === 'numeric'
      ? (
          <span
            key={`${index}-${run.text}`}
            data-canonical-section-heading-numeric-run=""
          >
            {run.text}
          </span>
        )
      : run.text)
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
    reviewRevision,
    focusGroupId,
    questionId,
    lecture,
    similar,
    sevenChoicesBankHeading,
    grammarFillGeometryVariantId,
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
  const [canonicalConsumption, setCanonicalConsumption] =
    useState<WholePaperConsumption | null>(null)
  const [groupModels, setGroupModels] = useState<Record<string, GroupModel>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const grammarFillGeometryFixture =
    grammarFillGeometryVariantId == null
      || (loading && canonicalConsumption == null)
      ? null
      : resolveGrammarFillPublicGeometryFixture(
          grammarFillGeometryVariantId,
          'screen',
          canonicalConsumption,
        )
  const grammarFillGeometryFixtureCss =
    grammarFillGeometryFixture?.paragraphWidths.map(
      ({ paragraphId, usableWidthEm }) =>
        `[data-paper-browse-anchor="${grammarFillGeometryFixture.groupId}"] `
        + `[data-paper-paragraph-id="${paragraphId}"] {`
        + `width:${usableWidthEm}em!important;`
        + `max-width:${usableWidthEm}em!important;}`,
    ).join('\n') ?? ''
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
  // 讲评态下的显式点选；null = 右边不显示解析，等待左边点击。
  const [lectureSelection, setLectureSelection] = useState<LectureSelection | null>(null)
  const [readingEvidenceAnchorReadyId, setReadingEvidenceAnchorReadyId] =
    useState<string | null>(null)
  const [openSevenChoiceQuestionIds, setOpenSevenChoiceQuestionIds] = useState<string[]>([])
  // similar-rail (E2): 讲评栏 body 的视图态 — 'analysis'(解析)/'similar'
  // (配相似结果列表)。只在 selectLectureQuestion 换题或用户点「返回解析」
  // 时回落到 'analysis'。滚动不改这个态。
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
  // 程序化滚动（rail 点击/深链/证据滚动）沉降期标记——钢琴键高亮仍跟
  // scrollspy，这段窗口避免中间锚点把 activeAnchor 闪乱。
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

  // 标记程序化滚动即将发生，给钢琴键 scrollspy 一段沉降窗口。
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
          if (lectureSelection.questionId) {
            url.searchParams.set('questionId', lectureSelection.questionId)
          } else {
            url.searchParams.delete('questionId')
          }
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
    setCanonicalConsumption(null)
    setGroupModels({})
    setLectureAnalysisByGroupId({})
    setLectureAnalysisFetched(false)
    setLectureAnalysisLoading(false)
    setLectureSelection(null)
    setOpenSevenChoiceQuestionIds([])

    async function load(): Promise<void> {
      try {
        let resolvedBase = reviewRevision
          ? `/api/import-review-preview/revisions/${encodeURIComponent(reviewRevision)}/asset`
          : `/paper-assets/${paperId}/latest`
        let assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        if (!assetRes.ok && !reviewRevision) {
          resolvedBase = `/paper-assets/${paperId}`
          assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        }
        if (!assetRes.ok) {
          throw new Error(`没找到这份卷面（${paperId}），可能已被移除。回到找题页重新打开吧。`)
        }
        const sourceAsset = (await assetRes.json()) as PaperAssetV1
        const canonicalConsumption = await loadScreenConsumption(
          paperId,
          fetch,
          reviewRevision,
        )
        const loadedAsset = projectAssetBlocksToCanonicalConsumption(
          sourceAsset,
          canonicalConsumption,
        )

        const groupBlocks = loadedAsset.content.blocks.filter(
          (block): block is Extract<PaperContentBlock, { type: 'group' }> => block.type === 'group',
        )
        const renderedGroupIds = groupBlocks.map((block) => block.groupId)
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

        // Resolve each Consumer Contract-selected family mode before publishing
        // any group model. Canonical mode consumes only its projection; explicit
        // whole-family legacy mode may use the retained legacy renderer.
        const selectedModels = new Map<string, GroupModel>()
        for (const block of groupBlocks) {
          const group = loadedAsset.content.groups[block.groupId]
          const selectedFamilyContractId =
            selectedFamilyContractIdForGroup({
              consumption: canonicalConsumption,
              groupId: block.groupId,
            })
          if (group?.groupType === 'cloze') {
            selectedModels.set(block.groupId, {
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
            selectedModels.set(block.groupId, {
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
          } else if (group?.groupType === 'sevenChoices') {
            let sevenChoicesMode: 'canonical' | 'legacy'
            try {
              sevenChoicesMode = canonicalModeForGroup(
                canonicalConsumption,
                'seven-choices',
                block.groupId,
              )
            } catch {
              continue
            }
            if (sevenChoicesMode === 'legacy' && !sevenChoicesAnalysis) continue
            selectedModels.set(block.groupId, {
              kind: 'sevenChoices',
              model: buildSevenChoicesSurfaceModel({
                asset: loadedAsset,
                analysis: sevenChoicesAnalysis,
                groupId: block.groupId,
                ...(sevenChoicesMode === 'canonical'
                  ? {
                      canonicalConsumption: canonicalConsumptionForGroup(
                        canonicalConsumption,
                        'seven-choices',
                        block.groupId,
                      ),
                    }
                  : {}),
              }),
            })
          } else if (group?.groupType === 'reading') {
            const readingMode = canonicalModeForGroup(
              canonicalConsumption,
              'reading',
              block.groupId,
            )
            if (readingMode === 'canonical') {
              const canonicalReading =
                buildCanonicalReadingConsumptionSurfaceData({
                  consumption: canonicalConsumptionForGroup(
                    canonicalConsumption,
                    'reading',
                    block.groupId,
                  ),
                  groupId: block.groupId,
                })
              const analysisModel = readingAnalysis
                ? buildPaperAssetSurfaceModel({
                    asset: loadedAsset,
                    analysis: readingAnalysis,
                    groupId: block.groupId,
                    figures: loadedFigures,
                    assetBase: resolvedBase,
                  })
                : null
              selectedModels.set(block.groupId, {
                kind: 'reading',
                model: {
                  surfaceData: {
                    ...canonicalReading.surfaceData,
                    evidence: analysisModel?.surfaceData.evidence ?? [],
                  },
                  analysisByQuestionId:
                    analysisModel?.analysisByQuestionId ?? {},
                  evidenceKindById:
                    analysisModel?.evidenceKindById ?? {},
                  canonicalReadingBlocks: canonicalReading.richBlocks,
                  canonicalReadingPassageLetter:
                    canonicalReading.passageLetter,
                  canonicalReadingSemanticSignature:
                    canonicalReading.semanticDigest,
                },
              })
            } else {
              if (!readingAnalysis) continue
              selectedModels.set(block.groupId, {
                kind: 'reading',
                model: {
                  ...buildPaperAssetSurfaceModel({
                    asset: loadedAsset,
                    analysis: readingAnalysis,
                    groupId: block.groupId,
                    figures: loadedFigures,
                    assetBase: resolvedBase,
                  }),
                  canonicalReadingBlocks: [],
                  canonicalReadingSemanticSignature: '',
                },
              })
            }
          } else if (
            group?.groupType === 'writing'
            && selectedFamilyContractId === 'application-writing'
          ) {
            const writingMode = canonicalModeForGroup(
              canonicalConsumption,
              'application-writing',
              block.groupId,
            )
            if (writingMode === 'canonical') {
              const canonicalWriting =
                buildCanonicalApplicationWritingConsumptionSurfaceData({
                  consumption: canonicalConsumptionForGroup(
                    canonicalConsumption,
                    'application-writing',
                    block.groupId,
                  ),
                  groupId: block.groupId,
                  renderedGroupIds,
                })
              selectedModels.set(block.groupId, {
                kind: 'writing',
                model: {
                  surfaceData: canonicalWriting.surfaceData,
                  pageModel: canonicalWriting.pageModel,
                  canonicalPromptBlocks: canonicalWriting.promptBlocks,
                },
              })
            } else {
              selectedModels.set(block.groupId, {
                kind: 'writing',
                model: buildWritingPaperView({
                  asset: loadedAsset,
                  groupId: block.groupId,
                }),
              })
            }
          } else if (
            group?.groupType === 'writing'
            && selectedFamilyContractId === 'continuation-writing'
          ) {
            const writingMode = canonicalModeForGroup(
              canonicalConsumption,
              'continuation-writing',
              block.groupId,
            )
            if (writingMode === 'canonical') {
              const canonicalWriting =
                buildCanonicalContinuationWritingConsumptionSurfaceData({
                  consumption: canonicalConsumptionForGroup(
                    canonicalConsumption,
                    'continuation-writing',
                    block.groupId,
                  ),
                  groupId: block.groupId,
                  renderedGroupIds,
                })
              selectedModels.set(block.groupId, {
                kind: 'writing',
                model: {
                  surfaceData: canonicalWriting.surfaceData,
                  pageModel: canonicalWriting.pageModel,
                  canonicalContinuationMaterialBlocks:
                    canonicalWriting.materialBlocks,
                },
              })
            } else {
              selectedModels.set(block.groupId, {
                kind: 'writing',
                model: buildWritingPaperView({
                  asset: loadedAsset,
                  groupId: block.groupId,
                }),
              })
            }
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
              const selectedModel = selectedModels.get(block.groupId)
              if (!selectedModel) throw new Error('阅读消费计划不完整')
              models[block.groupId] = selectedModel
            } else if (group.groupType === 'sevenChoices') {
              const selectedModel = selectedModels.get(block.groupId)
              if (!selectedModel) {
                if (!sevenChoicesAnalysis) throw new Error('未找到已审阅七选五解析')
                throw new Error('七选五消费计划不完整')
              }
              models[block.groupId] = selectedModel
            } else if (group.groupType === 'cloze') {
              models[block.groupId] = selectedModels.get(block.groupId)!
            } else if (group.groupType === 'grammarFill') {
              models[block.groupId] = selectedModels.get(block.groupId)!
            } else if (group.groupType === 'writing') {
              const selectedModel = selectedModels.get(block.groupId)
              if (!selectedModel) throw new Error('写作消费计划不完整')
              models[block.groupId] = selectedModel
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
        setCanonicalConsumption(canonicalConsumption)
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
  }, [paperId, reviewRevision])

  // Writing analysis is prefetched so a complete application payload can open
  // lecture from the answer box before lecture mode is on. Cloze / grammar-fill
  // stay lecture-gated.
  useEffect(() => {
    if (!asset || !assetBase) return
    const writingGroupIds = Object.entries(asset.content.groups)
      .filter(([, group]) => group.groupType === 'writing')
      .map(([groupId]) => groupId)
    if (writingGroupIds.length === 0) return
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`${assetBase}/analyses/writing-analysis-v1.json`)
        const raw = res.ok ? ((await res.json()) as WritingAnalysisFilePayload) : null
        if (cancelled) return
        setLectureAnalysisByGroupId((previous) => {
          const next = { ...previous }
          for (const groupId of writingGroupIds) {
            if (next[groupId]) continue
            const writing = raw?.groups?.[groupId]?.writing
            next[groupId] = isRenderableWritingAnalysis(writing)
              ? { kind: 'writing', analysis: writing }
              : { kind: 'unavailable' }
          }
          return next
        })
      } catch {
        if (cancelled) return
        setLectureAnalysisByGroupId((previous) => {
          const next = { ...previous }
          for (const groupId of writingGroupIds) {
            if (next[groupId]) continue
            next[groupId] = { kind: 'unavailable' }
          }
          return next
        })
      }
    })()

    return (): void => {
      cancelled = true
    }
  }, [asset, assetBase])

  // 刀 2: 讲评态首次打开时按需补拉本卷缺的 cloze/grammar-fill/writing 解析
  // （一次性；reading/sevenChoices 已在挑题态无条件拉取，不重复）。挑题态
  // 全程不进这个 effect —— 零新增请求。
  useEffect(() => {
    if (!lectureOpen) return
    if (lectureAnalysisFetched) return
    if (!asset || !assetBase || !canonicalConsumption) return
    let cancelled = false
    const wholePaperConsumption = canonicalConsumption
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
                model: buildClozeAnalysisSurfaceModel({
                  asset: loadedAsset,
                  analysis: raw,
                  groupId,
                  canonicalConsumption: canonicalConsumptionForGroup(
                    wholePaperConsumption,
                    'cloze',
                    groupId,
                  ),
                }),
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
                model: buildGrammarFillAnalysisSurfaceModel({
                  asset: loadedAsset,
                  analysis: raw,
                  groupId,
                  canonicalConsumption: canonicalConsumptionForGroup(
                    wholePaperConsumption,
                    'grammar-fill',
                    groupId,
                  ),
                }),
              }
            } catch {
              entries[groupId] = { kind: 'unavailable' }
            }
          }
        } catch {
          for (const groupId of grammarFillGroupIds) entries[groupId] = { kind: 'unavailable' }
        }
      }

      if (cancelled) return
      setLectureAnalysisByGroupId((previous) => ({ ...previous, ...entries }))
      setLectureAnalysisFetched(true)
      setLectureAnalysisLoading(false)
    }

    void loadLectureAnalyses()
    return (): void => {
      cancelled = true
    }
  }, [lectureOpen, lectureAnalysisFetched, asset, assetBase, canonicalConsumption])

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
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
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
    const renderedGroupIds = asset.content.blocks.flatMap((block) =>
      block.type === 'group' ? [block.groupId] : [],
    )
    let canonicalWritingPart:
      | { anchor: string; name: string; score: string | null; groups: RailGroup[] }
      | null = null
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
    for (const [index, block] of asset.content.blocks.entries()) {
      if (writingSkipIndices.has(index)) continue
      if (block.type === 'partHeading') {
        canonicalWritingPart = null
        parts.push({
          anchor: block.partId,
          name: partNameOf(block.text),
          score: scoreOf(block.text),
          groups: [],
        })
      } else if (block.type === 'group') {
        const group = asset.content.groups[block.groupId]
        if (!group) continue
        const chrome = canonicalConsumption
          ? canonicalWritingNavigationChrome({
              consumption: canonicalConsumption,
              groupId: block.groupId,
              renderedGroupIds,
            })
          : null
        if (chrome) {
          if (chrome.part) {
            canonicalWritingPart = {
              anchor: chrome.part.partId,
              name: partNameOf(chrome.part.text),
              score: scoreOf(chrome.part.text),
              groups: [],
            }
            parts.push(canonicalWritingPart)
          }
          if (!chrome.section) continue
          if (!canonicalWritingPart) {
            canonicalWritingPart = {
              anchor: chrome.section.sectionId,
              name: '',
              score: null,
              groups: [],
            }
            parts.push(canonicalWritingPart)
          }
          canonicalWritingPart.groups.push({
            anchor: block.groupId,
            title: chrome.section.text,
            range: '',
          })
          continue
        }
        canonicalWritingPart = null
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
  }, [asset, canonicalConsumption, writingSkipIndices])

  // 挑题态钢琴目录：白键按可见的部分头 + 题组逐行计数；黑键沿真实钢琴
  // 的 2+3 节奏落在相邻白键接缝上；讲评态继续复用同一层琴键结构。
  const pianoRailBlackKeyTops = useMemo(() => {
    const whiteKeyCount = railParts.reduce(
      (count, part) => count + part.groups.length + (part.name ? 1 : 0),
      0,
    )
    return Array.from({ length: Math.max(0, whiteKeyCount - 1) }, (_, index) => index + 1)
      .filter((boundary) => PIANO_RAIL_BLACK_BOUNDARIES.has(((boundary - 1) % 7) + 1))
      .map((boundary) => boundary * PIANO_RAIL_WHITE_KEY_HEIGHT - 1)
  }, [railParts])

  // 讲评栏只认左边的显式点选，不跟随 scrollspy。
  const panelGroupId = useMemo(() => {
    return lectureSelection?.groupId ?? null
  }, [lectureSelection])

  // 刀 2: 当前显式选中题的 lectureFocus —— 只喂给 panelGroupId 对应那组的
  // PaperSurface 挂载，其余题组永远拿 null（讲评开着也不跨组高亮）。
  const lectureFocusForSelection: LectureFocus | null = useMemo(() => {
    if (!lectureSelection?.questionId) return null
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
    groupId: string | null
    questionId: string | null
    evidenceId: string | null
    kind: 'support' | 'trap' | null
    quote: string | null
  } => {
    const empty = {
      groupId: null,
      questionId: null,
      evidenceId: null,
      kind: null,
      quote: null,
    } as const
    if (!lectureOpen) return empty
    if (!lectureSelection?.questionId) return empty
    if (panelGroupId !== lectureSelection.groupId) return empty
    if (panelGroupModel?.kind !== 'reading') return empty
    const evidenceId = lectureSelection.evidenceId
    const kind = evidenceId ? panelGroupModel.model.evidenceKindById[evidenceId] ?? null : null
    const analysis = panelGroupModel.model.analysisByQuestionId[lectureSelection.questionId]
    const evidenceRows = analysis
      ? [
          ...analysis.supportEvidenceRows,
          ...analysis.options.flatMap((option) => option.trapEvidenceRows),
        ]
      : []
    const quote = evidenceRows.find((row) => row.evidenceId === evidenceId)?.quote ?? null
    return {
      groupId: lectureSelection.groupId,
      questionId: lectureSelection.questionId,
      evidenceId,
      kind,
      quote,
    }
  }, [lectureOpen, lectureSelection, panelGroupId, panelGroupModel])

  // Canonical Reading renders its semantic blocks directly and therefore
  // does not mount the legacy textMap evidence spans that the shared dotted
  // connector targets. Add one page-local, display-only anchor to the exact
  // canonical inline (or its smallest owning block when a quote spans
  // inlines), then mount the connector on the following commit. This keeps
  // the shared PaperSurface contract and renderer untouched.
  useLayoutEffect(() => {
    const {
      groupId,
      evidenceId,
      quote,
    } = readingEvidenceLineContext
    setReadingEvidenceAnchorReadyId(null)
    if (!groupId || !evidenceId || !quote) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const card = [...scroller.querySelectorAll<HTMLElement>(
      '.paper-browse-group-card[data-paper-browse-anchor]',
    )].find((candidate) => candidate.dataset.paperBrowseAnchor === groupId)
    if (!card) return
    const releaseAnchor = mountCanonicalReadingEvidenceAnchor(card, {
      evidenceId,
      kind: readingEvidenceLineContext.kind,
      quote,
    })
    if (!releaseAnchor) return
    setReadingEvidenceAnchorReadyId(evidenceId)
    return releaseAnchor
  }, [readingEvidenceLineContext])

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
    // 冷加载沉降期题组模型可能异步落地，scrollIntoView 只按当下位置算
    // 一次，目标会被后续布局推走。高频目录导航直接定位；沉降循环继续用
    // setTimeout（遮挡态照跑）每 150ms 巡检 5s：位置静止 ≥3 拍仍明显
    // 偏离才再次用 behavior:'auto' 校准；
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

    target?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })

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

  function selectLectureGroup(groupId: string): void {
    setSimilarView('analysis')
    setLectureSelection({
      groupId,
      questionId: null,
      evidenceId: null,
      optionLabel: null,
    })
  }

  function toggleLecturePanel(): void {
    setLectureOpen((open) => !open)
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

  function renderGroupBody(
    groupId: string,
    entry: GroupModel | undefined,
    readingSuccessorGroupId?: string,
  ): ReactNode {
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
    // 七选五 A-G remains one shared optionBank. Its canonical Question
    // identities carry zero Options and therefore collapse as visual rows,
    // while still supplying the five blank → question joins used for focus.
    let blankQuestionIdByNo: Record<string, string> | undefined
    if (blankFocusMode === 'paper-blank' && entry.kind === 'sevenChoices') {
      blankQuestionIdByNo = {}
      for (const question of surfaceData.questions) {
        blankQuestionIdByNo[String(question.questionNo)] = question.id
      }
    }

    const isPanelGroup = lectureOpen && panelGroupId === groupId
    const sourceTaskType = writingTaskTypeForSurface({
      asset,
      consumption: canonicalConsumption,
      groupId,
    })
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
        canonicalGrammarFillScreenRuling={grammarFillScreenRulingFromSurfaceData(surfaceData)}
        annotations={[]}
        evidence={surfaceData.evidence}
        questions={surfaceData.questions}
        canonicalReadingBlocks={
          entry.kind === 'reading'
            && entry.model.canonicalReadingBlocks.length > 0
            ? entry.model.canonicalReadingBlocks
            : undefined
        }
        canonicalReadingPassageLetter={
          entry.kind === 'reading'
            ? entry.model.canonicalReadingPassageLetter
            : undefined
        }
        canonicalReadingSemanticSignature={
          entry.kind === 'reading'
            && entry.model.canonicalReadingBlocks.length > 0
            ? entry.model.canonicalReadingSemanticSignature
            : undefined
        }
        canonicalReadingSuccessorGroupId={
          entry.kind === 'reading'
            ? readingSuccessorGroupId
            : undefined
        }
        canonicalReadingFollowingSectionId={
          entry.kind === 'reading'
            && groupId
              === canonicalReadingGroupIds[canonicalReadingGroupIds.length - 1]
            && nextSectionAfterReading?.type === 'sectionHeading'
            ? nextSectionAfterReading.sectionId
            : undefined
        }
        sevenChoicesRhythmEnabled={
          entry.kind === 'sevenChoices'
          && canonicalSevenChoicesGroupIds.includes(groupId)
        }
        sevenChoicesFollowingSectionId={
          entry.kind === 'sevenChoices'
          && groupId
            === canonicalSevenChoicesGroupIds[
              canonicalSevenChoicesGroupIds.length - 1
            ]
            ? nextHeadingAfterSevenChoices?.id
            : undefined
        }
        clozeRhythmEnabled={
          entry.kind === 'cloze'
          && canonicalClozeGroupIds.includes(groupId)
        }
        clozeFollowingSectionId={
          entry.kind === 'cloze'
          && groupId
            === canonicalClozeGroupIds[
              canonicalClozeGroupIds.length - 1
            ]
            ? nextHeadingAfterCloze?.id
            : undefined
        }
        canonicalApplicationPromptBlocks={
          entry.kind === 'writing'
            ? entry.model.canonicalPromptBlocks
            : undefined
        }
        canonicalContinuationMaterialBlocks={
          entry.kind === 'writing'
            ? entry.model.canonicalContinuationMaterialBlocks
            : undefined
        }
        // seven-options-on-paper: the 七选五 A-G pool, display-only.
        // `entry.model.options` (SevenChoicesOptionView[]) is structurally
        // compatible with PaperQuestionOption ({label, text, translation?}
        // vs {label, text, chain}) — no adapter change needed.
        optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
        optionBankIdentity={entry.kind === 'sevenChoices' ? entry.model.bankIdentity : undefined}
        optionBankHeading={
          entry.kind === 'sevenChoices'
            ? sevenChoicesBankHeading
            : undefined
        }
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
        && hasCompleteApplicationLecturePayload({
          sourceTaskType,
          analysis: writingLectureEntry?.kind === 'writing'
            ? writingLectureEntry.analysis
            : undefined,
        })
      )
      return (
        <WritingPaperPage
          pageModel={entry.model.pageModel}
          retainedModelAnswer={retainedLecture?.modelAnswer}
          retainedOfficialModelAnswer={retainedLecture?.officialModelAnswer}
          onAnswerBoxActivate={
            lectureOpen || answerBoxOpensLecture
              ? () => {
                  selectLectureGroup(groupId)
                  setActiveAnchor(groupId)
                  setLectureOpen(true)
                }
              : undefined
          }
          grammarFillPredecessorGroupId={
            groupId === followingGrammarFillGroupId
              ? canonicalGrammarFillGroupIds[
                  canonicalGrammarFillGroupIds.length - 1
                ]
              : undefined
          }
          applicationWritingPredecessorGroupId={
            groupId === followingApplicationWritingGroupId
              ? canonicalApplicationWritingGroupIds[
                  canonicalApplicationWritingGroupIds.length - 1
                ]
              : undefined
          }
        >
          {surfaceEl}
        </WritingPaperPage>
      )
    }
    return surfaceEl
  }

  const canonicalReadingGroupIds =
    canonicalConsumption?.selections.find(
      (selection) =>
        selection.familyContractId === 'reading'
        && selection.mode === 'canonical',
    )?.groupIds ?? []
  const nextReadingGroupIdByPredecessorGroupId = new Map(
    canonicalReadingGroupIds.slice(0, -1).map((groupId, index) => [
      groupId,
      canonicalReadingGroupIds[index + 1],
    ]),
  )
  const firstReadingGroupBlockIndex = asset
    ? asset.content.blocks.findIndex(
        (block) =>
          block.type === 'group'
          && block.groupId === canonicalReadingGroupIds[0],
      )
    : -1
  const lastReadingGroupBlockIndex = asset
    ? asset.content.blocks.findLastIndex(
        (block) =>
          block.type === 'group'
          && block.groupId
            === canonicalReadingGroupIds[canonicalReadingGroupIds.length - 1],
      )
    : -1
  const nextSectionAfterReading =
    asset && lastReadingGroupBlockIndex >= 0
      ? asset.content.blocks
          .slice(lastReadingGroupBlockIndex + 1)
          .find((block) => block.type === 'sectionHeading')
      : undefined
  let firstReadingPredecessorBlockIndex = -1
  let readingChromeStartBlockIndex = firstReadingGroupBlockIndex
  if (asset && firstReadingGroupBlockIndex >= 0) {
    for (let index = firstReadingGroupBlockIndex - 1; index >= 0; index -= 1) {
      const block = asset.content.blocks[index]
      if (
        block.type === 'instruction'
        || block.type === 'sectionHeading'
        || block.type === 'partHeading'
      ) {
        if (firstReadingPredecessorBlockIndex < 0) {
          firstReadingPredecessorBlockIndex = index
        }
        readingChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'pageBreakHint') continue
      if (block.type === 'group') break
      break
    }
  }
  const isReadingChromeBlock = (index: number) =>
    index >= readingChromeStartBlockIndex
    && index < firstReadingGroupBlockIndex
  const canonicalSevenChoicesGroupIds =
    canonicalConsumption?.selections.find(
      (selection) =>
        selection.familyContractId === 'seven-choices'
        && selection.mode === 'canonical',
    )?.groupIds ?? []
  const firstSevenChoicesGroupBlockIndex = asset
    ? asset.content.blocks.findIndex(
        (block) =>
          block.type === 'group'
          && block.groupId === canonicalSevenChoicesGroupIds[0],
      )
    : -1
  const lastSevenChoicesGroupBlockIndex = asset
    ? asset.content.blocks.findLastIndex(
        (block) =>
          block.type === 'group'
          && block.groupId
            === canonicalSevenChoicesGroupIds[
              canonicalSevenChoicesGroupIds.length - 1
            ],
      )
    : -1
  const nextHeadingAfterSevenChoices = (() => {
    if (!asset || lastSevenChoicesGroupBlockIndex < 0) return undefined
    const block = asset.content.blocks
      .slice(lastSevenChoicesGroupBlockIndex + 1)
      .find(
        (candidate) =>
          candidate.type === 'partHeading'
          || candidate.type === 'sectionHeading',
      )
    if (!block) return undefined
    return block.type === 'partHeading'
      ? { id: block.partId, block }
      : { id: block.sectionId, block }
  })()
  const canonicalClozeGroupIds =
    canonicalConsumption?.selections.find(
      (selection) =>
        selection.familyContractId === 'cloze'
        && selection.mode === 'canonical',
    )?.groupIds ?? []
  const firstClozeGroupBlockIndex = asset
    ? asset.content.blocks.findIndex(
        (block) =>
          block.type === 'group'
          && block.groupId === canonicalClozeGroupIds[0],
      )
    : -1
  const lastClozeGroupBlockIndex = asset
    ? asset.content.blocks.findLastIndex(
        (block) =>
          block.type === 'group'
          && block.groupId
            === canonicalClozeGroupIds[
              canonicalClozeGroupIds.length - 1
            ],
      )
    : -1
  const nextHeadingAfterCloze = (() => {
    if (!asset || lastClozeGroupBlockIndex < 0) return undefined
    const block = asset.content.blocks
      .slice(lastClozeGroupBlockIndex + 1)
      .find(
        (candidate) =>
          candidate.type === 'partHeading'
          || candidate.type === 'sectionHeading',
      )
    if (!block) return undefined
    return block.type === 'partHeading'
      ? { id: block.partId, block }
      : { id: block.sectionId, block }
  })()
  let firstClozePredecessorBlockIndex = -1
  let clozeChromeStartBlockIndex = firstClozeGroupBlockIndex
  if (asset && firstClozeGroupBlockIndex >= 0) {
    for (
      let index = firstClozeGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = asset.content.blocks[index]
      if (
        block.type === 'instruction'
        || block.type === 'sectionHeading'
        || block.type === 'partHeading'
      ) {
        if (firstClozePredecessorBlockIndex < 0) {
          firstClozePredecessorBlockIndex = index
        }
        clozeChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'pageBreakHint') continue
      if (block.type === 'group') break
      break
    }
  }
  const isClozeChromeBlock = (index: number) =>
    index >= clozeChromeStartBlockIndex
    && index < firstClozeGroupBlockIndex
  const canonicalGrammarFillGroupIds =
    canonicalConsumption?.selections.find(
      (selection) =>
        selection.familyContractId === 'grammar-fill'
        && selection.mode === 'canonical',
    )?.groupIds ?? []
  const canonicalApplicationWritingGroupIds =
    canonicalConsumption?.selections.find(
      (selection) =>
        selection.familyContractId === 'application-writing'
        && selection.mode === 'canonical',
    )?.groupIds ?? []
  const lastApplicationWritingGroupBlockIndex = asset
    ? asset.content.blocks.findLastIndex(
        (block) =>
          block.type === 'group'
          && block.groupId
            === canonicalApplicationWritingGroupIds[
              canonicalApplicationWritingGroupIds.length - 1
            ],
      )
    : -1
  const followingApplicationWritingGroupId = (() => {
    if (!asset || lastApplicationWritingGroupBlockIndex < 0) return undefined
    const block = asset.content.blocks
      .slice(lastApplicationWritingGroupBlockIndex + 1)
      .find((candidate) => candidate.type === 'group')
    return block?.type === 'group' ? block.groupId : undefined
  })()
  const firstGrammarFillGroupBlockIndex = asset
    ? asset.content.blocks.findIndex(
        (block) =>
          block.type === 'group'
          && block.groupId === canonicalGrammarFillGroupIds[0],
      )
    : -1
  const lastGrammarFillGroupBlockIndex = asset
    ? asset.content.blocks.findLastIndex(
        (block) =>
          block.type === 'group'
          && block.groupId
            === canonicalGrammarFillGroupIds[
              canonicalGrammarFillGroupIds.length - 1
            ],
      )
    : -1
  const nextHeadingAfterGrammarFill = (() => {
    if (!asset || lastGrammarFillGroupBlockIndex < 0) return undefined
    const block = asset.content.blocks
      .slice(lastGrammarFillGroupBlockIndex + 1)
      .find(
        (candidate) =>
          candidate.type === 'partHeading'
          || candidate.type === 'sectionHeading',
      )
    if (!block) return undefined
    return block.type === 'partHeading'
      ? { id: block.partId, block }
      : { id: block.sectionId, block }
  })()
  const followingGrammarFillGroupId = (() => {
    if (!asset || lastGrammarFillGroupBlockIndex < 0) return undefined
    const block = asset.content.blocks
      .slice(lastGrammarFillGroupBlockIndex + 1)
      .find((candidate) => candidate.type === 'group')
    return block?.type === 'group' ? block.groupId : undefined
  })()
  let firstGrammarFillPredecessorBlockIndex = -1
  let grammarFillChromeStartBlockIndex = firstGrammarFillGroupBlockIndex
  if (asset && firstGrammarFillGroupBlockIndex >= 0) {
    for (
      let index = firstGrammarFillGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = asset.content.blocks[index]
      if (
        block.type === 'instruction'
        || block.type === 'sectionHeading'
      ) {
        if (firstGrammarFillPredecessorBlockIndex < 0) {
          firstGrammarFillPredecessorBlockIndex = index
        }
        grammarFillChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'pageBreakHint') continue
      if (block.type === 'group') break
      break
    }
  }
  const isGrammarFillChromeBlock = (index: number) =>
    index >= grammarFillChromeStartBlockIndex
    && index < firstGrammarFillGroupBlockIndex
  const grammarFillPartContext = (
    asset
    && grammarFillChromeStartBlockIndex >= 0
  )
    ? asset.content.blocks
      .slice(0, grammarFillChromeStartBlockIndex)
      .findLast(
        (block): block is Extract<PaperContentBlock, { type: 'partHeading' }> =>
          block.type === 'partHeading',
      )
    : undefined
  let firstSevenChoicesPredecessorBlockIndex = -1
  let sevenChoicesChromeStartBlockIndex = firstSevenChoicesGroupBlockIndex
  if (asset && firstSevenChoicesGroupBlockIndex >= 0) {
    for (
      let index = firstSevenChoicesGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = asset.content.blocks[index]
      if (
        block.type === 'instruction'
        || block.type === 'sectionHeading'
        || block.type === 'partHeading'
      ) {
        if (firstSevenChoicesPredecessorBlockIndex < 0) {
          firstSevenChoicesPredecessorBlockIndex = index
        }
        sevenChoicesChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'pageBreakHint') continue
      break
    }
  }
  const isSevenChoicesChromeBlock = (index: number) =>
    index >= sevenChoicesChromeStartBlockIndex
    && index < firstSevenChoicesGroupBlockIndex

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
    const selectedFamilyContractId = canonicalConsumption
      ? selectedFamilyContractIdForGroup({
          consumption: canonicalConsumption,
          groupId,
        })
      : null
    const canonicalGroupIdentity =
      canonicalConsumption
      && selectedFamilyContractId
      && selectConsumerGroupMode({
        consumption: canonicalConsumption,
        familyContractId: selectedFamilyContractId,
        groupId,
      }).mode === 'canonical'
        ? projectCanonicalConsumerGroup({
            consumption: canonicalConsumption,
            familyContractId: selectedFamilyContractId,
            groupId,
          }) as {
            semanticSignature?: string
            occurrenceSignature?: string
          }
        : null
    // 写作卡的选中罩上缘另行定位（--pb-writing-cut-top，见上方量高 effect
    // 与 paperBrowsePage.css），用 modifier class 圈出来。
    const cardClassName =
      entry?.kind === 'writing'
        ? 'paper-browse-group-card paper-browse-group-card--writing'
        : 'paper-browse-group-card'
    const readingSuccessorGroupId =
      nextReadingGroupIdByPredecessorGroupId.get(groupId)

    return (
      <Fragment key={`group-${index}`}>
        <section
          className={cardClassName}
          data-paper-browse-anchor={groupId}
          data-canonical-group-type={group?.groupType}
          data-canonical-semantic-signature={
            canonicalGroupIdentity?.semanticSignature
          }
          data-canonical-occurrence-signature={
            canonicalGroupIdentity?.occurrenceSignature
          }
          data-canonical-seven-choices-reading-boundary-group-id={
            groupId === canonicalSevenChoicesGroupIds[0]
            && firstSevenChoicesPredecessorBlockIndex < 0
            && canonicalReadingGroupIds.length > 0
              ? canonicalReadingGroupIds[
                  canonicalReadingGroupIds.length - 1
                ]
              : undefined
          }
          data-canonical-cloze-previous-family-group-id={
            groupId === canonicalClozeGroupIds[0]
            && firstClozePredecessorBlockIndex < 0
              ? canonicalSevenChoicesGroupIds[
                  canonicalSevenChoicesGroupIds.length - 1
                ]
              : undefined
          }
          data-canonical-grammar-fill-previous-family-group-id={
            groupId === canonicalGrammarFillGroupIds[0]
            && firstGrammarFillPredecessorBlockIndex < 0
              ? canonicalClozeGroupIds[
                  canonicalClozeGroupIds.length - 1
                ]
              : undefined
          }
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
            <p
              className="paper-browse-instruction paper-browse-instruction--merged"
              data-canonical-reading-rhythm-role={
                isReadingChromeBlock(index)
                  ? 'meta_instruction'
                  : undefined
              }
              data-canonical-reading-chrome={
                isReadingChromeBlock(index) ? '' : undefined
              }
              data-canonical-seven-choices-rhythm-role={
                isSevenChoicesChromeBlock(index)
                  ? 'meta_instruction'
                  : undefined
              }
              data-canonical-seven-choices-chrome={
                isSevenChoicesChromeBlock(index) ? '' : undefined
              }
              data-canonical-seven-choices-preceding-for={
                index === firstSevenChoicesPredecessorBlockIndex
                  ? canonicalSevenChoicesGroupIds[0]
                  : undefined
              }
              data-canonical-cloze-rhythm-role={
                isClozeChromeBlock(index)
                  ? 'meta_instruction'
                  : undefined
              }
              data-canonical-cloze-chrome={
                isClozeChromeBlock(index) ? '' : undefined
              }
              data-canonical-cloze-preceding-for={
                index === firstClozePredecessorBlockIndex
                  ? canonicalClozeGroupIds[0]
                  : undefined
              }
              data-canonical-cloze-previous-family-group-id={
                index === firstClozePredecessorBlockIndex
                  ? canonicalSevenChoicesGroupIds[
                      canonicalSevenChoicesGroupIds.length - 1
                    ]
                  : undefined
              }
              data-canonical-grammar-fill-rhythm-role={
                isGrammarFillChromeBlock(index)
                  ? 'meta_instruction'
                  : undefined
              }
              data-canonical-grammar-fill-chrome={
                isGrammarFillChromeBlock(index) ? '' : undefined
              }
              data-canonical-grammar-fill-preceding-for={
                index === firstGrammarFillPredecessorBlockIndex
                  ? canonicalGrammarFillGroupIds[0]
                  : undefined
              }
              data-canonical-grammar-fill-previous-family-group-id={
                index === firstGrammarFillPredecessorBlockIndex
                  ? canonicalClozeGroupIds[
                      canonicalClozeGroupIds.length - 1
                    ]
                  : undefined
              }
            >
              {options.mergedInstructionText}
            </p>
          )}
          {renderGroupBody(groupId, entry, readingSuccessorGroupId)}
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
      if (chains.length === 0) {
        return <p className="paper-browse-lecture-empty">解析未发布</p>
      }
      return (
        <SevenChoicesAnalysisPanel
          options={entry.model.options}
          chains={chains}
          openQuestionIds={openSevenChoiceQuestionIds}
          onToggleChain={(questionId) => {
            setOpenSevenChoiceQuestionIds((prev) =>
              prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
            )
          }}
          onShowAll={() => {
            setOpenSevenChoiceQuestionIds(chains.map((chain) => chain.questionId))
          }}
          onHideAll={() => {
            setOpenSevenChoiceQuestionIds([])
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
        const sourceTaskType = writingTaskTypeForSurface({
          asset,
          consumption: canonicalConsumption,
          groupId,
        })
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
        if (isNarrativeContinuationWritingAnalysis(lectureEntry.analysis)) {
          return <ContinuationAnalysisPanel analysis={lectureEntry.analysis} />
        }
        return <WritingAnalysisPanel analysis={lectureEntry.analysis} />
      }
      return (
        <p className="paper-browse-lecture-empty">{lectureAnalysisLoading ? '解析加载中…' : '解析未发布'}</p>
      )
    }

    return <p className="paper-browse-lecture-empty">解析未发布</p>
  }

  // 讲评栏内容只跟左边的显式点选；没有点选时走空态。
  function renderLecturePanel(): ReactNode {
    if (!asset) return null
    // similar-rail (E2): once a fetch has been made, the result view stays
    // until the user returns or clicks another question.
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
      return <p className="paper-browse-lecture-empty">点左边的题目后，这里显示讲评</p>
    }
    const range = buildGroupRangeLabel(asset, group)
    const answerRow = buildAnswerRowText(asset, group)
    let lectureTitle: string | null = group.title
    if (group.groupType === 'writing' && canonicalConsumption) {
      lectureTitle = canonicalWritingNavigationChrome({
        consumption: canonicalConsumption,
        groupId,
        renderedGroupIds: asset.content.blocks.flatMap((block) =>
          block.type === 'group' ? [block.groupId] : [],
        ),
      })?.section?.text ?? null
    }
    const hasActiveQuestion = Boolean(
      lectureSelection
      && lectureSelection.groupId === groupId
      && lectureSelection.questionId,
    )
    const activeQuestionId = hasActiveQuestion ? lectureSelection?.questionId ?? null : null
    const activeEvidenceId = hasActiveQuestion ? lectureSelection?.evidenceId ?? null : null
    const activeOptionLabel = hasActiveQuestion ? lectureSelection?.optionLabel ?? null : null
    return (
      <div className="paper-browse-lecture-body">
        {lectureTitle && (
          <h4 className="paper-browse-lecture-title">
            {lectureTitle}
            {range && <span className="paper-browse-lecture-range"> · {range}</span>}
          </h4>
        )}
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
              <RefreshCw aria-hidden="true" size={15} strokeWidth={2} />
              {SIMILAR_PASSAGES_MODE_GROUP_TYPES.has(group.groupType) ? '相似篇章' : '配相似'}
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
            data-canonical-reading-rhythm-role={
              isReadingChromeBlock(index) ? 'part_title' : undefined
            }
            data-canonical-reading-chrome={
              isReadingChromeBlock(index) ? '' : undefined
            }
            data-canonical-reading-preceding-for={
              index === firstReadingPredecessorBlockIndex
                ? canonicalReadingGroupIds[0]
                : undefined
            }
            data-canonical-reading-preceding-kind={
              index === firstReadingPredecessorBlockIndex
                ? 'reading_heading'
                : undefined
            }
            data-canonical-seven-choices-rhythm-role={
              isSevenChoicesChromeBlock(index) ? 'part_title' : (
                block.partId === nextHeadingAfterSevenChoices?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-seven-choices-chrome={
              isSevenChoicesChromeBlock(index) ? '' : undefined
            }
            data-canonical-seven-choices-preceding-for={
              index === firstSevenChoicesPredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[0]
                : undefined
            }
            data-canonical-seven-choices-following-for={
              block.partId === nextHeadingAfterSevenChoices?.id
                ? canonicalSevenChoicesGroupIds[
                    canonicalSevenChoicesGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-cloze-rhythm-role={
              isClozeChromeBlock(index) ? 'part_title' : (
                block.partId === nextHeadingAfterCloze?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-cloze-chrome={
              isClozeChromeBlock(index) ? '' : undefined
            }
            data-canonical-cloze-preceding-for={
              index === firstClozePredecessorBlockIndex
                ? canonicalClozeGroupIds[0]
                : undefined
            }
            data-canonical-cloze-previous-family-group-id={
              index === firstClozePredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[
                    canonicalSevenChoicesGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-cloze-following-for={
              block.partId === nextHeadingAfterCloze?.id
                ? canonicalClozeGroupIds[
                    canonicalClozeGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-grammar-fill-rhythm-role={
              block.partId === grammarFillPartContext?.partId
                ? 'part_context'
                : isGrammarFillChromeBlock(index) ? 'part_context' : (
                block.partId === nextHeadingAfterGrammarFill?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-grammar-fill-chrome={
              isGrammarFillChromeBlock(index) ? '' : undefined
            }
            data-canonical-grammar-fill-following-for={
              block.partId === nextHeadingAfterGrammarFill?.id
                ? canonicalGrammarFillGroupIds[
                    canonicalGrammarFillGroupIds.length - 1
                  ]
                : undefined
            }
          >
            {renderSectionHeadingText(block.text)}
          </h2>
        )
      case 'sectionHeading': {
        const followsReading =
          block.sectionId === nextSectionAfterReading?.sectionId
        return (
          <h3
            key={`section-${index}`}
            className="paper-browse-section-heading"
            data-paper-browse-anchor={block.sectionId}
            data-canonical-reading-rhythm-role={
              isReadingChromeBlock(index)
                ? 'subsection'
                : followsReading ? 'next_section' : undefined
            }
            data-canonical-reading-chrome={
              isReadingChromeBlock(index) ? '' : undefined
            }
            data-canonical-reading-following-for={
              followsReading
                ? canonicalReadingGroupIds[
                    canonicalReadingGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-reading-preceding-for={
              index === firstReadingPredecessorBlockIndex
                ? canonicalReadingGroupIds[0]
                : undefined
            }
            data-canonical-reading-preceding-kind={
              index === firstReadingPredecessorBlockIndex
                ? 'reading_heading'
                : undefined
            }
            data-canonical-seven-choices-rhythm-role={
              isSevenChoicesChromeBlock(index) ? 'subsection' : (
                block.sectionId === nextHeadingAfterSevenChoices?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-seven-choices-chrome={
              isSevenChoicesChromeBlock(index) ? '' : undefined
            }
            data-canonical-seven-choices-preceding-for={
              index === firstSevenChoicesPredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[0]
                : undefined
            }
            data-canonical-seven-choices-reading-boundary-group-id={
              block.sectionId === nextSectionAfterReading?.sectionId
                ? canonicalReadingGroupIds[
                    canonicalReadingGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-seven-choices-following-for={
              block.sectionId === nextHeadingAfterSevenChoices?.id
                ? canonicalSevenChoicesGroupIds[
                    canonicalSevenChoicesGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-cloze-rhythm-role={
              isClozeChromeBlock(index) ? 'subsection' : (
                block.sectionId === nextHeadingAfterCloze?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-cloze-chrome={
              isClozeChromeBlock(index) ? '' : undefined
            }
            data-canonical-cloze-preceding-for={
              index === firstClozePredecessorBlockIndex
                ? canonicalClozeGroupIds[0]
                : undefined
            }
            data-canonical-cloze-previous-family-group-id={
              index === firstClozePredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[
                    canonicalSevenChoicesGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-cloze-following-for={
              block.sectionId === nextHeadingAfterCloze?.id
                ? canonicalClozeGroupIds[
                    canonicalClozeGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-grammar-fill-rhythm-role={
              isGrammarFillChromeBlock(index) ? 'subsection' : (
                block.sectionId === nextHeadingAfterGrammarFill?.id
                  ? 'next_section'
                  : undefined
              )
            }
            data-canonical-grammar-fill-chrome={
              isGrammarFillChromeBlock(index) ? '' : undefined
            }
            data-canonical-grammar-fill-preceding-for={
              index === firstGrammarFillPredecessorBlockIndex
                ? canonicalGrammarFillGroupIds[0]
                : undefined
            }
            data-canonical-grammar-fill-previous-family-group-id={
              index === firstGrammarFillPredecessorBlockIndex
                ? canonicalClozeGroupIds[
                    canonicalClozeGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-grammar-fill-following-for={
              block.sectionId === nextHeadingAfterGrammarFill?.id
                ? canonicalGrammarFillGroupIds[
                    canonicalGrammarFillGroupIds.length - 1
                  ]
                : undefined
            }
          >
            {renderSectionHeadingText(block.text)}
          </h3>
        )
      }
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
          <p
            key={`instruction-${index}`}
            className="paper-browse-instruction"
            data-paper-browse-anchor={block.instructionId}
            data-canonical-reading-rhythm-role={
              isReadingChromeBlock(index)
                ? 'meta_instruction'
                : undefined
            }
            data-canonical-reading-chrome={
              isReadingChromeBlock(index) ? '' : undefined
            }
            data-canonical-reading-preceding-for={
              index === firstReadingPredecessorBlockIndex
                ? canonicalReadingGroupIds[0]
                : undefined
            }
            data-canonical-reading-preceding-kind={
              index === firstReadingPredecessorBlockIndex
                ? 'reading_heading'
                : undefined
            }
            data-canonical-seven-choices-rhythm-role={
              isSevenChoicesChromeBlock(index)
                ? 'meta_instruction'
                : undefined
            }
            data-canonical-seven-choices-chrome={
              isSevenChoicesChromeBlock(index) ? '' : undefined
            }
            data-canonical-seven-choices-preceding-for={
              index === firstSevenChoicesPredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[0]
                : undefined
            }
            data-canonical-cloze-rhythm-role={
              isClozeChromeBlock(index)
                ? 'meta_instruction'
                : undefined
            }
            data-canonical-cloze-chrome={
              isClozeChromeBlock(index) ? '' : undefined
            }
            data-canonical-cloze-preceding-for={
              index === firstClozePredecessorBlockIndex
                ? canonicalClozeGroupIds[0]
                : undefined
            }
            data-canonical-cloze-previous-family-group-id={
              index === firstClozePredecessorBlockIndex
                ? canonicalSevenChoicesGroupIds[
                    canonicalSevenChoicesGroupIds.length - 1
                  ]
                : undefined
            }
            data-canonical-grammar-fill-rhythm-role={
              isGrammarFillChromeBlock(index)
                ? 'meta_instruction'
                : undefined
            }
            data-canonical-grammar-fill-chrome={
              isGrammarFillChromeBlock(index) ? '' : undefined
            }
            data-canonical-grammar-fill-preceding-for={
              index === firstGrammarFillPredecessorBlockIndex
                ? canonicalGrammarFillGroupIds[0]
                : undefined
            }
            data-canonical-grammar-fill-previous-family-group-id={
              index === firstGrammarFillPredecessorBlockIndex
                ? canonicalClozeGroupIds[
                    canonicalClozeGroupIds.length - 1
                  ]
                : undefined
            }
          >
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

  function renderPianoRail(cropped: boolean): ReactNode {
    return (
      <div
        className={`paper-browse-piano-viewport${
          cropped ? ' paper-browse-piano-viewport--cropped' : ''
        }`}
      >
        <div className="paper-browse-rail-panel paper-browse-rail-panel--piano">
          <div className="paper-browse-piano-black-key-layer" aria-hidden="true">
            {pianoRailBlackKeyTops.map((top) => (
              <span
                key={top}
                className="paper-browse-piano-black-key"
                style={{ top }}
              />
            ))}
          </div>
          {railParts.map((part, partIndex) => (
            <div
              key={part.anchor}
              className={`paper-browse-rail-part${
                partIndex === 0 ? ' paper-browse-rail-part--first' : ''
              }`}
            >
              {part.name && (
                <button
                  type="button"
                  className="paper-browse-rail-part-head"
                  aria-label={`${part.name}，前往本部分第一个题组`}
                  onClick={() => scrollToAnchor(part.anchor)}
                >
                  <span className="paper-browse-rail-part-name">{part.name}</span>
                </button>
              )}
              {part.groups.map((g) => {
                const isActive = g.anchor === activeAnchor
                const displayTitle = pianoRailGroupLabel(g.title)
                const isReadingLetter = /^[A-D]$/.test(displayTitle)
                return (
                  <button
                    key={g.anchor}
                    type="button"
                    className={`paper-browse-rail-group${
                      isReadingLetter ? ' paper-browse-rail-group--letter' : ''
                    }${
                      isActive ? ' paper-browse-rail-group--active' : ''
                    }`}
                    aria-current={isActive ? 'true' : undefined}
                    aria-label={displayTitle === g.title ? undefined : g.title}
                    onClick={() => scrollToAnchor(g.anchor)}
                  >
                    <span className="paper-browse-rail-group-title">{displayTitle}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-loading" role="status" aria-live="polite">正在打开整卷…</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-error" role="main">
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
        role="main"
        aria-labelledby="paper-browse-title"
      >
        <h1 id="paper-browse-title" className="visually-hidden">{asset.paper.title}</h1>
        <nav className="paper-browse-rail" aria-label="目录">
          {/* 讲评态不是另一套胶囊导航：同一架钢琴只把可见宽度裁窄。 */}
          {renderPianoRail(lectureOpen)}
        </nav>
        <div className="paper-browse-content" ref={scrollerRef} style={paperBrowseContentStyle}>
          {grammarFillGeometryFixture && (
            <style data-canonical-grammar-fill-geometry-fixture={grammarFillGeometryVariantId}>
              {grammarFillGeometryFixtureCss}
            </style>
          )}
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
        {lectureOpen
          && panelGroupModel?.kind === 'reading'
          && readingEvidenceAnchorReadyId === readingEvidenceLineContext.evidenceId
          && (
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
      {!reviewRevision && (
        <button
          type="button"
          ref={lectureHandleRef}
          className={`paper-browse-lecture-handle${
            lectureOpen ? ' paper-browse-lecture-handle--open' : ''
          }`}
          onClick={toggleLecturePanel}
          aria-pressed={lectureOpen}
          aria-expanded={lectureOpen}
        >
          讲评
        </button>
      )}
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
