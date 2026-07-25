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
 *   1-2. `load` / `expanded` — 一张纸 mount: async paper-asset fetch +
 *        build（五个现有 adapter 之一）+ 展开/收起 toggle.
 *   3-4. `similarPassagesOpen` / `similarPassagesRequest` — 相似篇章 fetch-
 *        on-expand panel (carried over verbatim from similar-passages-entry
 *        E6 — App.tsx has no host fetch to piggyback on for either group).
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react'
import type { QuestionGroupCard, QuestionGroupDetail, ReadingParseQuestionGroupResult } from '../../domain/questionBank'
import { sourceTypeLabel } from '../../domain/questionBank'
import { compactGroupMeta } from './detailHelpers'
import { buildPaperBrowseLectureHref, parsePaperIdFromHref } from '../../concierge/paperSurfaceHref'
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
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
  type PaperFigureManifestEntry,
} from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
import {
  buildSevenChoicesSurfaceModel,
  type SevenChoicesSurfaceModel,
  type ReviewedSevenChoicesAnalysisV1,
} from '../paper-intelligence/sevenChoicesSurfaceAdapter.ts'
import { buildClozePaperView, type ClozePaperViewModel } from '../paper-intelligence/clozePaperViewAdapter.ts'
import {
  buildGrammarFillPaperView,
  type GrammarFillPaperViewModel,
} from '../paper-intelligence/grammarFillPaperViewAdapter.ts'
import { buildWritingPaperView, type WritingPaperViewModel } from '../paper-intelligence/writingPaperViewAdapter.ts'
import { FACET_FRAMEWORKS } from '../paper-intelligence/grammarFillFacetRegistry.ts'
import type { PaperAssetV1, PaperContentBlock } from '../../domain/paperAsset.ts'
import './QuestionGroupDetailView.css'

// similar-passages-entry (E6, was similar-entrypoints E3): the four
// groupTypes the v2 passages recipe supports (program.md Q5 — writing
// excluded, no facet). `GroupType`'s DB-style values (domain/questionBank.ts)
// — this file is not the domain schema, just a display-gate reading the
// type's existing string values.
const SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'seven_choices', 'grammar_cloze'])

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
  | { kind: 'reading'; model: PaperAssetSurfaceModel }
  | { kind: 'sevenChoices'; model: SevenChoicesSurfaceModel }
  | { kind: 'cloze'; model: ClozePaperViewModel }
  | { kind: 'grammarFill'; model: GrammarFillPaperViewModel; chips: Chip[] }
  | { kind: 'writing'; model: WritingPaperViewModel }

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: PeekModel }

export function QuestionGroupPaperSurface({ entry }: { entry: PeekModel }) {
  const surfaceData = entry.model.surfaceData
  const surfaceEl = (
    <PaperSurface
      textMap={surfaceData.textMap}
      semanticParagraphs={surfaceData.semanticParagraphs}
      annotations={[]}
      evidence={surfaceData.evidence}
      questions={surfaceData.questions}
      optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
      mode="lecture"
      lectureFocus={null}
      readingFocusBySection={{}}
      onFocusIntent={() => {}}
    />
  )
  return entry.kind === 'writing'
    ? <WritingPaperPage pageModel={entry.model.pageModel}>{surfaceEl}</WritingPaperPage>
    : surfaceEl
}

// grammar-fill-analysis-v1.json 的 schemaVersion 字段值是 "grammar-fill-
// analysis-v2"（D1 grammar-facets-v2 就地重铸内容，磁盘文件名未改——见
// server/search/teachingFacets.mjs 的 analysisConfigs 注释）。spec 文中
// "grammar-fill-analysis-v2.json" 指的是这份 v2 语义的内容，不是另一个文件；
// 这里按磁盘实际文件名读取，不发明第二套路径。
type GrammarFillAnalysisFileV2 = {
  schemaVersion?: string
  blanks?: Record<string, { facetKey?: string | null }>
}

function buildGrammarFacetChips(analysis: GrammarFillAnalysisFileV2, questionIds: string[]): Chip[] {
  const counts = new Map<string, number>()
  for (const qid of questionIds) {
    const facetKey = analysis.blanks?.[qid]?.facetKey
    if (!facetKey) continue
    const label = FACET_FRAMEWORKS[facetKey]?.labelZh ?? facetKey
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
}

// chips 数据契约（阅读）：questionType 覆盖率——缺失显示「未标注」不造假
// （原型实测该字段部分组缺失）。完形/七选五一期只显示题数（无对应成熟
// 考点维度，不占位不造假）。语法填空走 buildGrammarFacetChips（见上）。
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

  // ── 一张纸：async 挂载（paper-asset fetch → 五个现有 adapter 之一） ──
  const paperId = parsePaperIdFromHref(selectedDetail?.paperSurfaceHref)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [expanded, setExpanded] = useState(false)
  // 复评工艺账（2026-07-17 C 路）：340px→none 不可插值，展开曾是硬跳。
  // 量高手风琴：过渡目标用 scrollHeight 实测值，播完放开成 none（后续内容
  // 增高不被夹）；收起先钉住当前高再回落 340。reduced-motion 由全局
  // kill-switch 覆盖（过渡即时，行为同旧）。
  const clipRef = useRef<HTMLDivElement | null>(null)
  const clipTimerRef = useRef<number | null>(null)

  function toggleExpanded(next: boolean): void {
    const clip = clipRef.current
    if (clip) {
      if (clipTimerRef.current !== null) window.clearTimeout(clipTimerRef.current)
      clip.style.maxHeight = `${clip.scrollHeight}px`
      if (next) {
        // 260ms > --motion-slow(220ms)：过渡播完后放开
        clipTimerRef.current = window.setTimeout(() => {
          clip.style.maxHeight = 'none'
          clipTimerRef.current = null
        }, 260)
      } else {
        void clip.offsetHeight
        clip.style.maxHeight = ''
      }
    }
    setExpanded(next)
  }

  useEffect(
    () => () => {
      if (clipTimerRef.current !== null) window.clearTimeout(clipTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    setExpanded(false)
    if (clipRef.current) clipRef.current.style.maxHeight = ''
    if (!selectedDetail) return
    const detail = selectedDetail
    if (!paperId) {
      setLoad({ status: 'error', message: '该题组暂无卷面资产——去整卷预览或等待生产线补齐。' })
      return
    }
    let cancelled = false
    async function loadModel(): Promise<void> {
      try {
        let base = `/paper-assets/${paperId}/latest`
        let res = await fetch(`${base}/paper-asset.json`)
        if (!res.ok) {
          base = `/paper-assets/${paperId}`
          res = await fetch(`${base}/paper-asset.json`)
        }
        if (!res.ok) throw new Error('卷面暂未就绪，可点击「看整卷」预览原卷。')
        const asset = (await res.json()) as PaperAssetV1
        const block = asset.content.blocks.find(
          (b): b is Extract<PaperContentBlock, { type: 'group' }> =>
            b.type === 'group' && b.groupId === detail.id,
        )
        const group = block ? asset.content.groups[block.groupId] : undefined
        if (!block || !group) throw new Error('本题组不在该卷面资产内，可点击「看整卷」预览原卷。')

        let figures: PaperFigureManifestEntry[] = []
        try {
          const figRes = await fetch(`${base}/figures/manifest.json`)
          if (figRes.ok) {
            const manifest = (await figRes.json()) as { figures?: PaperFigureManifestEntry[] }
            figures = Array.isArray(manifest.figures) ? manifest.figures : []
          }
        } catch {
          /* best-effort：零图卷零断言 */
        }

        let model: PeekModel
        if (group.groupType === 'reading') {
          const aRes = await fetch(`${base}/analyses/reading-choice-analysis-v1.json`)
          if (!aRes.ok) throw new Error('未找到已审阅阅读解析，可点击「看整卷」预览原卷。')
          const analysis = (await aRes.json()) as ReviewedReadingChoiceAnalysisV1
          model = {
            kind: 'reading',
            model: buildPaperAssetSurfaceModel({ asset, analysis, groupId: block.groupId, figures, assetBase: base }),
          }
        } else if (group.groupType === 'sevenChoices') {
          const aRes = await fetch(`${base}/analyses/seven-choices-analysis-v1.json`)
          if (!aRes.ok) throw new Error('未找到已审阅七选五解析，可点击「看整卷」预览原卷。')
          const analysis = (await aRes.json()) as ReviewedSevenChoicesAnalysisV1
          model = { kind: 'sevenChoices', model: buildSevenChoicesSurfaceModel({ asset, analysis, groupId: block.groupId }) }
        } else if (group.groupType === 'cloze') {
          model = { kind: 'cloze', model: buildClozePaperView({ asset, groupId: block.groupId }) }
        } else if (group.groupType === 'grammarFill') {
          let grammarChips: Chip[] = []
          try {
            const gRes = await fetch(`${base}/analyses/grammar-fill-analysis-v1.json`)
            if (gRes.ok) {
              const analysis = (await gRes.json()) as GrammarFillAnalysisFileV2
              if (analysis.schemaVersion === 'grammar-fill-analysis-v2') {
                grammarChips = buildGrammarFacetChips(analysis, detail.questions.map((q) => q.id))
              }
            }
          } catch {
            /* best-effort：chips 数据源缺失就不显示，不造假 */
          }
          model = {
            kind: 'grammarFill',
            model: buildGrammarFillPaperView({ asset, groupId: block.groupId }),
            chips: grammarChips,
          }
        } else if (group.groupType === 'writing') {
          model = { kind: 'writing', model: buildWritingPaperView({ asset, groupId: block.groupId }) }
        } else {
          throw new Error(`该题型（${group.groupType}）暂不支持卷面预览。`)
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
          <ArrowLeft size={16} />
          返回找题
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
        <ArrowLeft size={16} />
        返回找题
      </button>

      <section className="peek-root" aria-label="题组速览">
        <header className="peek-hero">
          <div className="peek-meta-line">
            <span>{compactGroupMeta(selectedDetail.groupType, selectedDetail.questionCount)}</span>
            <span className="peek-meta-dot">·</span>
            <span>{sourceTypeLabel[selectedDetail.sourceType]}</span>
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
              {selectedDetail.topicLabels.map((topicLabel) => (
                <span key={topicLabel.label} className="peek-topic">
                  {topicLabel.label}
                </span>
              ))}
            </div>
          )}

          <div className="peek-actions">
            <button
              className="peek-btn peek-btn--primary"
              type="button"
              onClick={() => onAddToBasket(selectedDetail)}
              disabled={selectedDetail.draftPaperButtonState === 'disabled'}
              title={
                selectedDetail.draftPaperButtonState === 'disabled'
                  ? selectedDetail.printUnavailableReason || '暂不可组卷'
                  : undefined
              }
            >
              <Plus size={15} />
              {selectedDetail.draftPaperButtonState === 'in_current_draft'
                ? '已在草稿卷中'
                : selectedDetail.draftPaperButtonState === 'disabled'
                  ? '暂不可组卷'
                  : '加入草稿卷'}
            </button>
            {selectedDetail.paperSurfaceHref && (
              <button className="peek-btn" type="button" onClick={() => onOpenPaperBrowse(selectedDetail)}>
                <Eye size={15} />
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
                <BookOpen size={15} />
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
                <Repeat size={15} />
                相似篇章
              </button>
            )}
            {isOwnerView && (
              <button className="peek-btn peek-btn--minor" type="button" onClick={() => onEdit(selectedDetail)}>
                <Pencil size={14} />
                编辑
              </button>
            )}
            {isOwnerView && (
              <button
                className="peek-btn peek-btn--minor peek-btn--danger"
                type="button"
                onClick={() => onDelete(selectedDetail)}
                aria-label="删除题组"
              >
                <Trash2 size={14} />
                删除
              </button>
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
          <div className="peek-paper-clip" ref={clipRef}>
            {paperBody}
          </div>
          {load.status === 'ready' && !expanded && (
            <button className="peek-expand" type="button" onClick={() => toggleExpanded(true)}>
              <ChevronDown size={15} />
              展开卷面
            </button>
          )}
          {load.status === 'ready' && expanded && (
            <button className="peek-expand peek-expand--collapse" type="button" onClick={() => toggleExpanded(false)}>
              <ChevronUp size={15} />
              收起卷面
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
