/**
 * QuestionGroupDetailView — 「这题值不值得进我的卷」判断台。
 *
 * detail-page-redesign (2026-07-15, spec docs/specs/2026-07-15-detail-page-
 * redesign-design.md, owner approved via 原型 `?detailVariant=paper-peek`
 * 实点通过): full rewrite off the old「详情长页」(hero + passage + 逐题
 * 题干答案 + AnalysisDisclosure 折叠解析) into 速览头 + 一张纸露一角:
 *
 *   返回找题
 *   ┌ 速览头（meta 行 / 标题 / 大意 / chips / 话题丸 / 动作行）───┐
 *   ├ 一张纸（该题组 PaperSurface 只读挂载，默认露一角 ~340px，
 *   │ 底部白→白渐隐 + 展开丸；展开=完整卷面原貌，可收起）──────┤
 *
 * 负空间（结构性保证，非自律）：
 *   - 解析不放 — 卷面挂载只读（lectureFocus=null / onFocusIntent noop /
 *     无 answers·evidence），AnalysisDisclosure 在本页整体退役。
 *   - 生产不放 — ADR-0015 既有结论，维持。
 *   - 管理不放 — 编辑/删除 owner-only 保留但收次位（低频纠错兜底）。
 *
 * Internal state (4 useState, all narrow/deliberate — this component stays
 * otherwise props-driven):
 *   1-2. `load` / `expanded` — 一张纸 mount: confirmed Canonical Consumption
 *        projection + 展开/收起 toggle.
 *   3-4. `similarPassagesOpen` / `similarPassagesRequest` — 相似篇章 fetch-
 *        on-expand panel (carried over verbatim from similar-passages-entry
 *        E6 — App.tsx has no host fetch to piggyback on for either group).
 */
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ReadingAnalysis,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Papers,
  Pencil,
  Plus,
  Trash,
} from '../../icons'
import type { QuestionGroupCard, QuestionGroupDetail, ReadingParseQuestionGroupResult, TopicLabel } from '../../domain/questionBank'
import { sourceTypeLabel } from '../../domain/questionBank'
import { compactGroupMeta } from './detailHelpers'
import { buildPaperBrowseLectureHref } from '../../concierge/paperSurfaceHref'
import { ConciergeGroupRowMenu } from '../../concierge/ConciergeGroupRowMenu'
import { fetchSimilarPassages } from '../../services/similarQuestions.ts'
import {
  SimilarPassagesPanel,
  similarPassagesRecipeSummary,
  type SimilarPassagesRequestState,
} from '../similar-passages/SimilarPassagesPanel'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData,
  buildCanonicalReadingConsumptionSurfaceData,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  selectedFamilyContractIdForGroup,
} from '../../../../shared/paper-canonical/consumerProjection.mjs'
import {
  canonicalConsumptionForGroup,
  loadScreenConsumption,
} from '../paper-intelligence/canonicalConsumptionClient.ts'
import type { GrammarFillScreenRuling } from '../../../../shared/papersurface/blankRuling.mjs'
import './QuestionGroupDetailView.css'

// similar-passages-entry (E6, was similar-entrypoints E3): the four
// groupTypes the v2 passages recipe supports (program.md Q5 — writing
// excluded, no facet). `GroupType`'s DB-style values (domain/questionBank.ts)
// — this file is not the domain schema, just a display-gate reading the
// type's existing string values.
const SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'seven_choices', 'grammar_cloze'])

function topicLabelPath(topicLabel: TopicLabel): string | undefined {
  if (topicLabel.label.includes('-')) return topicLabel.label
  const parts = [topicLabel.theme, topicLabel.themeGroup, topicLabel.subtopic].filter(Boolean)
  return parts.length > 0 ? parts.join('-') : undefined
}

function topicLabelLeaf(topicLabel: TopicLabel): string {
  return (topicLabel.subtopic || topicLabel.label.split('-').pop() || topicLabel.label).trim()
}

function renderSourceKind(sourceType: QuestionGroupDetail['sourceType']): ReactNode {
  const label = sourceTypeLabel[sourceType]
  if (sourceType === 'real_exam') {
    return <span className="peek-meta-badge">{label}</span>
  }
  if (sourceType === 'mock_exam') {
    return <span>{label}</span>
  }
  return <span>{label}</span>
}

export type QuestionGroupDetailViewProps = {
  isOwnerView: boolean

  detail: {
    selectedDetail: QuestionGroupDetail | null
    detailStatus: 'idle' | 'loading' | 'loaded' | 'error'
    detailError: string
  }

  /** chips 数据契约（阅读）：已存 reading parse 的 per-question questionType
   * 计数。缺失（尚未解析）时 chips 为空——不发明"未解析"占位文案。 */
  readingParse: {
    result: ReadingParseQuestionGroupResult | null
  }

  onBack: () => void
  onEdit: (detail: QuestionGroupDetail) => void
  onDelete: (detail: QuestionGroupDetail) => void
  onAddToBasket: (detail: QuestionGroupDetail) => void
  /** opens the whole-paper preview page (paper-browse), scrolled to this
   * group — 挑题态, no lecture. Only rendered when the group has a
   * paperSurfaceHref (its paper has a paper-asset). */
  onOpenPaperBrowse: (detail: QuestionGroupDetail) => void
  /** opens the whole-paper preview page in 讲评态, anchored to this group
   * with its first analyzed question预选 — the SPA fast-path for「讲评」
   * (plain left-click). The `<a href>` fallback (buildPaperBrowseLectureHref)
   * still lands on the same state via a full navigation, so 中键/新标签
   * stays correct even without this handler. */
  onOpenPaperBrowseLecture: (detail: QuestionGroupDetail) => void
  /** similar-passages-entry (E6): full corpus lookup, used to resolve a
   * 相似篇章 candidate's groupId to a full QuestionGroupCard (for 加入草稿卷
   * and the SW-3 thin-candidate disabled state) — same map App.tsx already
   * builds for PaperBrowsePage. */
  questionGroupById: Map<string, QuestionGroupCard>
  /** similar-passages-entry (E6): adds one resolved 相似篇章 candidate to the
   * current draft paper (same basket pipeline as onAddToBasket, just taking
   * a QuestionGroupCard instead of the loaded QuestionGroupDetail). */
  onAddSimilarToBasket: (card: QuestionGroupCard) => void
}

// ── 一张纸：题组模型（按 groupType 走五个现有 adapter 之一） ────────────

type Chip = { label: string; count?: number }

type PeekModel =
  | {
      kind: 'reading'
      model: {
        surfaceData: ReturnType<typeof buildCanonicalReadingConsumptionSurfaceData>['surfaceData']
        canonicalReadingBlocks: ReturnType<typeof buildCanonicalReadingConsumptionSurfaceData>['richBlocks']
        canonicalReadingPassageLetter: ReturnType<typeof buildCanonicalReadingConsumptionSurfaceData>['passageLetter']
        canonicalReadingSemanticSignature: string
      }
    }
  | {
      kind: 'sevenChoices'
      model: {
        surfaceData: ReturnType<typeof buildCanonicalConsumptionSurfaceData>['surfaceData']
        options: NonNullable<ReturnType<typeof buildCanonicalConsumptionSurfaceData>['optionBank']>['options']
        bankIdentity: {
          bankId: string
          semanticSignature: string
          occurrenceSignature: string
        }
      }
    }
  | {
      kind: 'cloze' | 'listening'
      model: {
        surfaceData: ReturnType<typeof buildCanonicalConsumptionSurfaceData>['surfaceData']
      }
    }
  | {
      kind: 'grammarFill'
      model: {
        surfaceData: ReturnType<typeof buildCanonicalConsumptionSurfaceData>['surfaceData']
      }
      chips: Chip[]
    }
  | {
      kind: 'writing'
      model: {
        surfaceData:
          | ReturnType<typeof buildCanonicalApplicationWritingConsumptionSurfaceData>['surfaceData']
          | ReturnType<typeof buildCanonicalContinuationWritingConsumptionSurfaceData>['surfaceData']
        pageModel:
          | ReturnType<typeof buildCanonicalApplicationWritingConsumptionSurfaceData>['pageModel']
          | ReturnType<typeof buildCanonicalContinuationWritingConsumptionSurfaceData>['pageModel']
        canonicalPromptBlocks?: ReturnType<typeof buildCanonicalApplicationWritingConsumptionSurfaceData>['promptBlocks']
        canonicalContinuationMaterialBlocks?: ReturnType<typeof buildCanonicalContinuationWritingConsumptionSurfaceData>['materialBlocks']
      }
    }

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: PeekModel }

export function QuestionGroupPaperSurface({ entry }: { entry: PeekModel }) {
  const surfaceData = entry.model.surfaceData
  const grammarFillScreenRuling = (
    'grammarFillScreenRuling' in surfaceData
    && surfaceData.grammarFillScreenRuling
    && typeof surfaceData.grammarFillScreenRuling === 'object'
  )
    ? surfaceData.grammarFillScreenRuling as GrammarFillScreenRuling
    : undefined
  const surfaceEl = (
    <PaperSurface
      roleLayout={surfaceData.roleLayout}
      textMap={surfaceData.textMap}
      mode="lecture"
      lectureFocus={null}
      onFocusIntent={() => {}}
      semanticParagraphs={
        'semanticParagraphs' in surfaceData
          ? surfaceData.semanticParagraphs
          : undefined
      }
      canonicalGrammarFillScreenRuling={grammarFillScreenRuling}
      annotations={[]}
      evidence={surfaceData.evidence}
      questions={surfaceData.questions}
      canonicalReadingBlocks={
        entry.kind === 'reading'
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
          ? entry.model.canonicalReadingSemanticSignature
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
      optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
      optionBankIdentity={entry.kind === 'sevenChoices' ? entry.model.bankIdentity : undefined}
      readingFocusBySection={{}}
    />
  )
  return entry.kind === 'writing'
    ? <WritingPaperPage pageModel={entry.model.pageModel}>{surfaceEl}</WritingPaperPage>
    : entry.kind === 'listening'
      ? <div className="canonical-listening-surface">{surfaceEl}</div>
      : surfaceEl
}

// chips 数据契约（阅读）：questionType 覆盖率——缺失显示「未标注」不造假
// （原型实测该字段部分组缺失）。完形/七选五一期只显示题数（无对应成熟
// 考点维度，不占位不造假）。语法填空不以未确认 analysis 另造 paper content。
function buildTypeChips(
  detail: QuestionGroupDetail,
  readingParse: ReadingParseQuestionGroupResult | null,
  grammarChips: Chip[] | null,
): Chip[] {
  if (detail.groupType === 'reading') {
    if (!readingParse?.questions?.length) return []
    const counts = new Map<string, number>()
    for (const q of readingParse.questions) {
      const type = (q.questionType || '').trim() || '未标注'
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }))
  }
  if (detail.groupType === 'grammar_cloze') {
    return grammarChips ?? []
  }
  if (detail.groupType === 'cloze' || detail.groupType === 'seven_choices') {
    return [{ label: `${detail.questionCount} 题` }]
  }
  return []
}

const psTokenStyle: CSSProperties & Record<`--${string}`, string | number> = {
  '--ps-font-stack': paperSurfaceTokens.paperFontStack,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-passage-indent': paperSurfaceTokens.passageIndent,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

export function QuestionGroupDetailView(props: QuestionGroupDetailViewProps) {
  const {
    isOwnerView,
    detail: { selectedDetail, detailStatus, detailError },
    readingParse: { result: readingParseResult },
    onBack,
    onEdit,
    onDelete,
    onAddToBasket,
    onOpenPaperBrowse,
    onOpenPaperBrowseLecture,
    questionGroupById,
    onAddSimilarToBasket,
  } = props

  // ── 一张纸：async 挂载（confirmed Canonical Consumption only） ───────
  const paperId = selectedDetail?.canonicalPaperId
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [expanded, setExpanded] = useState(false)

  function toggleExpanded(next: boolean): void {
    setExpanded(next)
  }

  useEffect(() => {
    setExpanded(false)
    if (!selectedDetail) return
    const detail = selectedDetail
    if (!paperId) {
      setLoad({ status: 'error', message: '完整卷面尚未就绪，请返回题库选择其他试卷。' })
      return
    }
    const resolvedPaperId = paperId
    let cancelled = false
    async function loadModel(): Promise<void> {
      try {
        const canonicalConsumption = await loadScreenConsumption(resolvedPaperId)
        const familyContractId = selectedFamilyContractIdForGroup({
          consumption: canonicalConsumption,
          groupId: detail.id,
        })
        if (!familyContractId) {
          throw new Error('该题组不在已确认的 Canonical Paper 内。')
        }
        let model: PeekModel
        if (familyContractId === 'reading') {
          const canonicalReading = buildCanonicalReadingConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              'reading',
              detail.id,
            ),
            groupId: detail.id,
          })
          model = {
            kind: 'reading',
            model: {
              surfaceData: canonicalReading.surfaceData,
              canonicalReadingBlocks: canonicalReading.richBlocks,
              canonicalReadingPassageLetter: canonicalReading.passageLetter,
              canonicalReadingSemanticSignature: canonicalReading.semanticDigest,
            },
          }
        } else if (familyContractId === 'seven-choices') {
          const canonicalSevenChoices = buildCanonicalConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              'seven-choices',
              detail.id,
            ),
            familyContractId: 'seven-choices',
            groupId: detail.id,
          })
          if (!canonicalSevenChoices.optionBank) {
            throw new Error('Canonical 七选五选项组不完整。')
          }
          model = {
            kind: 'sevenChoices',
            model: {
              surfaceData: canonicalSevenChoices.surfaceData,
              options: canonicalSevenChoices.optionBank.options,
              bankIdentity: {
                bankId: canonicalSevenChoices.optionBank.bankId,
                semanticSignature: canonicalSevenChoices.semanticDigest,
                occurrenceSignature:
                  canonicalSevenChoices.occurrenceSignature
                  ?? canonicalSevenChoices.semanticDigest,
              },
            },
          }
        } else if (familyContractId === 'cloze' || familyContractId === 'listening') {
          const canonicalQuestions = buildCanonicalConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              familyContractId,
              detail.id,
            ),
            familyContractId,
            groupId: detail.id,
          })
          model = {
            kind: familyContractId,
            model: { surfaceData: canonicalQuestions.surfaceData },
          }
        } else if (familyContractId === 'grammar-fill') {
          const canonicalGrammarFill = buildCanonicalConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              'grammar-fill',
              detail.id,
            ),
            familyContractId: 'grammar-fill',
            groupId: detail.id,
          })
          model = {
            kind: 'grammarFill',
            model: { surfaceData: canonicalGrammarFill.surfaceData },
            chips: [],
          }
        } else if (familyContractId === 'application-writing') {
          const canonicalWriting = buildCanonicalApplicationWritingConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              'application-writing',
              detail.id,
            ),
            groupId: detail.id,
            renderedGroupIds: [detail.id],
          })
          model = {
            kind: 'writing',
            model: {
              surfaceData: canonicalWriting.surfaceData,
              pageModel: canonicalWriting.pageModel,
              canonicalPromptBlocks: canonicalWriting.promptBlocks,
            },
          }
        } else if (familyContractId === 'continuation-writing') {
          const canonicalWriting = buildCanonicalContinuationWritingConsumptionSurfaceData({
            consumption: canonicalConsumptionForGroup(
              canonicalConsumption,
              'continuation-writing',
              detail.id,
            ),
            groupId: detail.id,
            renderedGroupIds: [detail.id],
          })
          model = {
            kind: 'writing',
            model: {
              surfaceData: canonicalWriting.surfaceData,
              pageModel: canonicalWriting.pageModel,
              canonicalContinuationMaterialBlocks:
                canonicalWriting.materialBlocks,
            },
          }
        } else {
          throw new Error(`Canonical 题族（${familyContractId}）暂不支持卷面预览。`)
        }
        if (!cancelled) setLoad({ status: 'ready', model })
      } catch (e) {
        if (!cancelled) setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }
    setLoad({ status: 'loading' })
    void loadModel()
    return (): void => {
      cancelled = true
    }
  }, [paperId, selectedDetail?.id])

  // ── 相似篇章：fetch-on-expand 原地展开面板（similar-passages-entry E6） ──
  const [similarPassagesOpen, setSimilarPassagesOpen] = useState(false)
  const [similarPassagesRequest, setSimilarPassagesRequest] = useState<SimilarPassagesRequestState | null>(null)
  useEffect(() => {
    setSimilarPassagesOpen(false)
    setSimilarPassagesRequest(null)
  }, [selectedDetail?.id])

  async function loadSimilarPassages(groupId: string): Promise<void> {
    setSimilarPassagesRequest({ status: 'loading' })
    try {
      const data = await fetchSimilarPassages(groupId)
      setSimilarPassagesRequest({ status: 'ready', data })
    } catch (error) {
      setSimilarPassagesRequest({
        status: 'error',
        message: error instanceof Error ? error.message : '加载相似篇章失败，请重试',
      })
    }
  }

  function handleToggleSimilarPassages(): void {
    if (!selectedDetail) return
    if (similarPassagesOpen) {
      setSimilarPassagesOpen(false)
      return
    }
    setSimilarPassagesOpen(true)
    if (!similarPassagesRequest) void loadSimilarPassages(selectedDetail.id)
  }

  if (!selectedDetail) {
    return (
      <div className="detail-view">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> 返回找题
        </button>
        {detailStatus === 'loading' && <p className="detail-message">正在读取题组详情...</p>}
        {detailStatus === 'error' && <p className="detail-message error">{detailError}</p>}
      </div>
    )
  }

  const grammarChips = load.status === 'ready' && load.model.kind === 'grammarFill' ? load.model.chips : null
  const chips = buildTypeChips(selectedDetail, readingParseResult, grammarChips)

  let paperBody: ReactNode = null
  if (load.status === 'loading') {
    paperBody = <div className="peek-paper-placeholder">卷面加载中…</div>
  } else if (load.status === 'error') {
    paperBody = <div className="peek-paper-placeholder">{load.message}</div>
  } else {
    const entry = load.model
    paperBody = <QuestionGroupPaperSurface entry={entry} />
  }

  return (
    <div className="detail-view">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> 返回找题
      </button>

      <section className="peek-root" aria-label="题组速览">
        <header className="peek-hero">
          <div className="peek-meta-line">
            <span>{compactGroupMeta(selectedDetail.groupType, selectedDetail.questionCount)}</span>
            <span className="peek-meta-dot">·</span>
            {renderSourceKind(selectedDetail.sourceType)}
          </div>
          <h3 className="peek-title">{selectedDetail.title}</h3>
          {selectedDetail.summary && <p className="peek-summary">{selectedDetail.summary}</p>}
          {chips.length > 0 && (
            <div className="peek-chips" aria-label="题型/考点分布">
              {chips.map((chip) => (
                <span key={chip.label} className="peek-chip">
                  {chip.label}
                  {chip.count !== undefined && <b> ×{chip.count}</b>}
                </span>
              ))}
            </div>
          )}
          {selectedDetail.topicLabels?.length > 0 && (
            <div className="peek-topics" aria-label="话题标签">
              {selectedDetail.topicLabels.map((topicLabel) => {
                const path = topicLabelPath(topicLabel)
                return (
                  <span
                    key={topicLabel.label}
                    className="peek-topic"
                    title={path}
                  >
                    {topicLabelLeaf(topicLabel)}
                  </span>
                )
              })}
            </div>
          )}

          <div className="peek-actions">
            <button
              className="peek-btn peek-btn--primary"
              type="button"
              onClick={() => onAddToBasket(selectedDetail)}
              disabled={selectedDetail.draftPaperButtonState === 'disabled'}
              aria-pressed={selectedDetail.draftPaperButtonState === 'in_current_draft' ? true : undefined}
              title={
                selectedDetail.draftPaperButtonState === 'disabled'
                  ? selectedDetail.printUnavailableReason || '暂不可组卷'
                  : undefined
              }
            >
              {selectedDetail.draftPaperButtonState === 'in_current_draft' ? (
                <Check size={16} />
              ) : (
                <Plus size={16} />
              )}
              {selectedDetail.draftPaperButtonState === 'in_current_draft'
                ? '已在草稿卷'
                : selectedDetail.draftPaperButtonState === 'disabled'
                  ? '暂不可组卷'
                  : '加入草稿卷'}
            </button>
            {selectedDetail.canonicalPaperId && (
              <button className="peek-btn" type="button" onClick={() => onOpenPaperBrowse(selectedDetail)}>
                <Eye size={16} />
                看整卷
              </button>
            )}
            {selectedDetail.hasPaperSurfaceAnalysis &&
              selectedDetail.paperSurfaceHref &&
              selectedDetail.paperSurfaceLabel && (
              <a
                className="peek-btn"
                href={buildPaperBrowseLectureHref(selectedDetail.paperSurfaceHref) || selectedDetail.paperSurfaceHref}
                data-ra-entry="detail-view"
                data-ra-group-id={selectedDetail.id}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  if (event.defaultPrevented || event.button !== 0) return
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  event.preventDefault()
                  onOpenPaperBrowseLecture(selectedDetail)
                }}
              >
                <ReadingAnalysis size={16} />
                {selectedDetail.paperSurfaceLabel}
              </a>
            )}
            {SIMILAR_SUPPORTED_GROUP_TYPES.has(selectedDetail.groupType) && selectedDetail.paperSurfaceHref && (
              <button
                className="peek-btn"
                type="button"
                data-ra-entry="detail-view-similar"
                data-ra-group-id={selectedDetail.id}
                onClick={handleToggleSimilarPassages}
              >
                <Papers size={16} />
                相似篇章
              </button>
            )}
            {isOwnerView && selectedDetail.canEdit && (
              <div className="peek-actions-menu">
                <ConciergeGroupRowMenu
                  items={[
                    {
                      key: 'edit',
                      label: '编辑',
                      icon: <Pencil size={14} aria-hidden="true" />,
                      onSelect: () => onEdit(selectedDetail),
                    },
                    {
                      key: 'delete',
                      label: '删除',
                      icon: <Trash size={14} aria-hidden="true" />,
                      tone: 'danger',
                      onSelect: () => onDelete(selectedDetail),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </header>

        {similarPassagesOpen && similarPassagesRequest && (
          <SimilarPassagesPanel
            recipeSummary={similarPassagesRecipeSummary(selectedDetail.groupType)}
            request={similarPassagesRequest}
            questionGroupById={questionGroupById}
            onAdd={onAddSimilarToBasket}
            onCollapse={() => setSimilarPassagesOpen(false)}
            onRetry={() => selectedDetail && void loadSimilarPassages(selectedDetail.id)}
          />
        )}

        <div className={`peek-paper${expanded ? ' peek-paper--expanded' : ''}`} style={psTokenStyle}>
          <div className="peek-paper-clip">
            {paperBody}
          </div>
          {load.status === 'ready' && !expanded && (
            <div className="peek-expand-wrap">
              <button className="peek-expand" type="button" onClick={() => toggleExpanded(true)}>
                <ChevronDown size={16} />
                展开卷面
              </button>
            </div>
          )}
          {load.status === 'ready' && expanded && (
            <div className="peek-expand-sticky">
              <button className="peek-expand peek-expand--collapse" type="button" onClick={() => toggleExpanded(false)}>
                <ChevronUp size={16} />
                收起卷面
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
