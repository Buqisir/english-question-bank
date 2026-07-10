/**
 * QuestionGroupDetailView — decision quick-look card.
 *
 * Retired the "网站现场生产" surface (跑 AI 解析/保存、主题划分/绑定、难度
 * 标定、AI ops-trace) per ADR-0015. detail-slim (owner 2026-07-08) then
 * retired the remaining C2-era production scaffolding — the per-question
 * answer-compare mini-box, its summary stats, and the AI answer-verification
 * results section — because production verification now runs in the import
 * pipeline, not on this page. This is now a pure read-only 决策速览卡:
 * passage, questions, already-saved parse results (layered behind
 * AnalysisDisclosure), bound topic labels, 加入草稿卷, whole-paper /
 * per-group analysis entry points, and (owner-only) 编辑/删除 as
 * low-frequency correction tools.
 *
 * Pure props-driven, zero internal useState — App.tsx keeps the READ-only
 * state (populated by `openDetail`'s回填 + the AI Enhancement panel's
 * sync-into-open-detail branch) and passes it down.
 *
 * Owner gating: when `isOwnerView` is false (member), the hidden — not
 * disabled — surfaces are: 编辑/删除 and the topic-label confidence
 * percentage (ui-boundary-trim, owner 2026-07-07 / audit Q2). Everything
 * else (passage, questions, saved parse displays, bound topic labels +
 * reason, 加入草稿卷, the whole-paper preview entry, and the per-group
 * analysis entry) stays visible to both member and owner.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Eye,
  Pencil,
  Plus,
  Repeat,
  Tag,
  Trash2,
} from 'lucide-react'
import type {
  ClozeParseQuestionGroupResult,
  GrammarParseQuestionGroupResult,
  QuestionGroupDetail,
  ReadingParseQuestionGroupResult,
  SevenChoicesParseQuestionGroupResult,
  VerifyQuestionGroupResult,
} from '../../domain/questionBank'
import { sourceTypeLabel } from '../../domain/questionBank'
import { labelOf } from '../../workbench/detail/readingProfileLabels'
import { AnalysisDisclosure } from './AnalysisDisclosure'
import { compactGroupMeta } from './detailHelpers'
import {
  buildPaperBrowseLectureHref,
  buildPaperBrowseSimilarHref,
  parsePaperIdFromHref,
} from '../../concierge/paperSurfaceHref'
import {
  buildPassageSegments,
  FIGURE_PLACEHOLDER_TEXT,
  type PaperFigureManifestEntry,
} from './passageFigureSegments'

type AsyncStatus = 'idle' | 'loading' | 'loaded' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// similar-entrypoints (E3): the four groupTypes E1's similar-questions engine
// supports (program.md Q5 — writing excluded, no facet). `GroupType`'s
// DB-style values (domain/questionBank.ts) — this file is not the domain
// schema, just a display-gate reading the type's existing string values.
const SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'seven_choices', 'grammar_cloze'])

export type QuestionGroupDetailViewProps = {
  isOwnerView: boolean
  defaultAiModel: string

  detail: {
    selectedDetail: QuestionGroupDetail | null
    detailStatus: 'idle' | 'loading' | 'loaded' | 'error'
    detailError: string
  }

  verify: {
    verifyResult: VerifyQuestionGroupResult | null
    verifyStatus: AsyncStatus
    verifyError: string
  }

  clozeParse: {
    result: ClozeParseQuestionGroupResult | null
    status: AsyncStatus
    error: string
    saveStatus: SaveStatus
    saveError: string
  }

  sevenChoicesParse: {
    result: SevenChoicesParseQuestionGroupResult | null
    status: AsyncStatus
    error: string
    saveStatus: SaveStatus
    saveError: string
  }

  grammarParse: {
    result: GrammarParseQuestionGroupResult | null
    status: AsyncStatus
    error: string
    saveStatus: SaveStatus
    saveError: string
  }

  readingParse: {
    result: ReadingParseQuestionGroupResult | null
    status: AsyncStatus
    error: string
    saveStatus: SaveStatus
    saveError: string
  }

  onBack: () => void
  onEdit: (detail: QuestionGroupDetail) => void
  onDelete: (detail: QuestionGroupDetail) => void
  onAddToBasket: (detail: QuestionGroupDetail) => void
  /** 刀B: opens the whole-paper preview page (paper-browse), scrolled to
   * this group — 挑题态, no lecture. Only rendered when the group has a
   * paperSurfaceHref (its paper has a paper-asset). */
  onOpenPaperBrowse: (detail: QuestionGroupDetail) => void
  /** flow-panel 刀 3: opens the whole-paper preview page in 讲评态,
   * anchored to this group with its first analyzed question预选 — the SPA
   * fast-path for「看解析」(plain left-click). The `<a href>` fallback
   * (buildPaperBrowseLectureHref) still lands on the same state via a full
   * navigation, so 中键/新标签 stays correct even without this handler. */
  onOpenPaperBrowseLecture: (detail: QuestionGroupDetail) => void
  /** similar-entrypoints (E3): 详情页次入口「配相似」— SPA fast-path,
   * mirrors onOpenPaperBrowseLecture. Only rendered when the group has a
   * paperSurfaceHref that converts to a similar-href AND its groupType is
   * one of the four E1-supported types. */
  onOpenPaperBrowseSimilar: (detail: QuestionGroupDetail) => void
}

export function QuestionGroupDetailView(props: QuestionGroupDetailViewProps) {
  const {
    isOwnerView,
    detail: { selectedDetail, detailStatus, detailError },
    verify: { verifyResult, verifyStatus, verifyError },
    clozeParse: { result: clozeParseResult, status: clozeParseStatus, error: clozeParseError },
    sevenChoicesParse: {
      result: sevenChoicesParseResult,
      status: sevenChoicesParseStatus,
      error: sevenChoicesParseError,
    },
    grammarParse: { result: grammarParseResult, status: grammarParseStatus, error: grammarParseError },
    readingParse: { result: readingParseResult, status: readingParseStatus, error: readingParseError },
    onBack,
    onEdit,
    onDelete,
    onAddToBasket,
    onOpenPaperBrowse,
    onOpenPaperBrowseLecture,
    onOpenPaperBrowseSimilar,
  } = props

  // figure-render cut (fig-token P0): the ONE deliberate, narrow exception
  // to this component's "Pure props-driven, zero internal useState" header
  // invariant (see file header comment). Every other render surface this
  // cut touches (PaperSurface, print/PDF, DOCX) resolves its figures from
  // data already threaded in by its host; the detail page has no such host
  // fetch to piggyback on within this cut's Allowed scope (App.tsx is out
  // of scope — see the completion report's "beyond the plan's literal
  // Allowed list" note). Best-effort: any fetch/parse failure, or a group
  // with no paperSurfaceHref to derive a paperId from, silently degrades
  // to `figures: []` — buildPassageSegments then short-circuits to the
  // EXACT pre-cut single-`<pre>` render (raw marker text, unchanged).
  const paperId = parsePaperIdFromHref(selectedDetail?.paperSurfaceHref)
  const [figuresState, setFiguresState] = useState<{
    paperId: string | null
    assetBase: string
    figures: PaperFigureManifestEntry[]
  }>({ paperId: null, assetBase: '', figures: [] })
  useEffect(() => {
    if (!paperId) return
    let cancelled = false
    async function loadManifest(): Promise<void> {
      let assetBase = `/paper-assets/${paperId}/latest`
      let figures: PaperFigureManifestEntry[] = []
      try {
        let res = await fetch(`${assetBase}/figures/manifest.json`)
        if (!res.ok) {
          assetBase = `/paper-assets/${paperId}`
          res = await fetch(`${assetBase}/figures/manifest.json`)
        }
        if (res.ok) {
          const manifest = (await res.json()) as { figures?: PaperFigureManifestEntry[] }
          figures = Array.isArray(manifest.figures) ? manifest.figures : []
        }
      } catch {
        /* graceful degradation — figures stays [] */
      }
      if (!cancelled) setFiguresState({ paperId, assetBase, figures })
    }
    void loadManifest()
    return (): void => {
      cancelled = true
    }
  }, [paperId])
  const activeFigures = figuresState.paperId === paperId ? figuresState.figures : []
  const activeFiguresAssetBase = figuresState.paperId === paperId ? figuresState.assetBase : ''

  // These useMemos previously lived in App.tsx (App.tsx:1261-1293 pre-cut);
  // per PA MF-2 they are NOT props — recomputed here from the passed-in
  // parse/verify results so App.tsx doesn't need to hand over 5 extra maps.
  const readingParseByQuestionNo = (() => {
    const map = new Map<string, ReadingParseQuestionGroupResult['questions'][number]>()
    readingParseResult?.questions.forEach((item) => {
      map.set(String(item.questionNo).trim(), item)
    })
    return map
  })()
  const clozeParseByQuestionNo = (() => {
    const byNo = new Map<string, ClozeParseQuestionGroupResult['questions'][number]>()
    clozeParseResult?.questions.forEach((item) => {
      byNo.set(String(item.questionNo).trim(), item)
    })
    return byNo
  })()
  const sevenChoicesParseByQuestionNo = (() => {
    const byNo = new Map<string, SevenChoicesParseQuestionGroupResult['questions'][number]>()
    sevenChoicesParseResult?.questions.forEach((item) => {
      byNo.set(String(item.questionNo).trim(), item)
    })
    return byNo
  })()
  const grammarParseByQuestionNo = (() => {
    const map = new Map<string, GrammarParseQuestionGroupResult['questions'][number]>()
    grammarParseResult?.questions.forEach((item) => {
      map.set(String(item.questionNo).trim(), item)
    })
    return map
  })()

  return (
    <div className="detail-view">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回找题
      </button>

      {detailStatus === 'loading' && <p className="detail-message">正在读取题组详情...</p>}
      {detailStatus === 'error' && <p className="detail-message error">{detailError}</p>}

      {selectedDetail && detailStatus === 'loaded' && (
        <>
          <article className="detail-hero">
            <div>
              <div className="source-line">
                <span>{compactGroupMeta(selectedDetail.groupType, selectedDetail.questionCount)}</span>
              </div>
              <h3>{selectedDetail.title}</h3>
              <p>{selectedDetail.summary}</p>
            </div>
            <div className="detail-actions">
              <span className="source-type">{sourceTypeLabel[selectedDetail.sourceType]}</span>
              {isOwnerView && (
                <button className="detail-button" type="button" onClick={() => onEdit(selectedDetail)}>
                  <Pencil size={16} />
                  编辑
                </button>
              )}
              {isOwnerView && (
                <button
                  className="detail-button danger"
                  type="button"
                  onClick={() => onDelete(selectedDetail)}
                  aria-label="删除题组"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              )}
              {selectedDetail.paperSurfaceHref && (
                <button
                  className="detail-button"
                  type="button"
                  onClick={() => onOpenPaperBrowse(selectedDetail)}
                >
                  <Eye size={16} />
                  看整卷
                </button>
              )}
              {selectedDetail.hasPaperSurfaceAnalysis &&
                selectedDetail.paperSurfaceHref &&
                selectedDetail.paperSurfaceLabel && (
                // flow-panel 刀 3: 直达解析面迁移进整卷页讲评态（不再是老
                // 解析页 ?view=paper-intelligence&surface=paper 直链——
                // 导航目标由 classic-retire-2 断言把守，本条与上方的挑题态
                // 入口是两个不同目的地）。href 走共享换算 helper 保持中键/
                // 新标签可用；主点击拦截走 SPA openPaperBrowseLecture
                // （带 questionId+lecture，同页内导航，不整页刷新）。
                <a
                  className="detail-button"
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
                  <BookOpen size={16} />
                  {selectedDetail.paperSurfaceLabel}
                </a>
              )}
              {/* similar-entrypoints (E3): 详情页次入口「配相似」— 只有配方
                  收录的四类题型(program.md Q5)才渲染，写作组/无 href 组隐藏
                  式降级（与「看解析」一致，不做 disabled 态）。href 走共享
                  换算 helper 保持中键/新标签可用；主点击拦截走 SPA
                  openPaperBrowseSimilar（同页内导航，不整页刷新）。 */}
              {SIMILAR_SUPPORTED_GROUP_TYPES.has(selectedDetail.groupType) &&
                buildPaperBrowseSimilarHref(selectedDetail.paperSurfaceHref) && (
                <a
                  className="detail-button"
                  href={buildPaperBrowseSimilarHref(selectedDetail.paperSurfaceHref) || undefined}
                  data-ra-entry="detail-view-similar"
                  data-ra-group-id={selectedDetail.id}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    if (event.defaultPrevented || event.button !== 0) return
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    event.preventDefault()
                    onOpenPaperBrowseSimilar(selectedDetail)
                  }}
                >
                  <Repeat size={16} />
                  配相似
                </a>
              )}
              <button
                className="add-button"
                type="button"
                onClick={() => onAddToBasket(selectedDetail)}
                disabled={selectedDetail.draftPaperButtonState === 'disabled'}
                title={
                  selectedDetail.draftPaperButtonState === 'disabled'
                    ? selectedDetail.printUnavailableReason || '暂不可组卷'
                    : undefined
                }
              >
                <Plus size={16} />
                {selectedDetail.draftPaperButtonState === 'in_current_draft'
                  ? '已在草稿卷中'
                  : selectedDetail.draftPaperButtonState === 'disabled'
                    ? '暂不可组卷'
                    : '加入草稿卷'}
              </button>
            </div>
          </article>

          <section className="detail-section" aria-label="篇章信息">
            <div className="detail-section-title">
              <span>Passage</span>
              <h3>{selectedDetail.passage.title}</h3>
            </div>
            <div className="detail-facts">
              {selectedDetail.passage.theme && <span>主题：{selectedDetail.passage.theme}</span>}
              {selectedDetail.passage.discourseType && <span>语篇：{selectedDetail.passage.discourseType}</span>}
              {selectedDetail.passage.wordCount ? <span>词数：{selectedDetail.passage.wordCount}</span> : null}
            </div>
            {buildPassageSegments(selectedDetail.passage.materialText, activeFigures).map((segment, index) => {
              if (segment.kind === 'figure') {
                return (
                  <div key={index} className="passage-figure">
                    <img
                      className="passage-figure-image"
                      src={`${activeFiguresAssetBase}/figures/${segment.figure.file}`}
                      alt={segment.figure.figureId}
                    />
                    <pre className="passage-text passage-figure-flattened-text">{segment.flattenedText}</pre>
                  </div>
                )
              }
              if (segment.kind === 'placeholder') {
                return (
                  <div key={index} className="passage-figure-placeholder">
                    {FIGURE_PLACEHOLDER_TEXT}
                  </div>
                )
              }
              return (
                <pre key={index} className="passage-text">
                  {segment.text || '暂无完整原文。后续导入 DOCX/PDF/OCR 时会补到这里。'}
                </pre>
              )
            })}
          </section>

          <section className="detail-section" aria-label="题组说明">
            <div className="detail-section-title">
              <span>Instruction</span>
              <h3>题组说明</h3>
            </div>
            <div className="instruction-summary">
              <p className="detail-copy">{selectedDetail.instruction || '暂无题组说明。'}</p>
            </div>
            <div className="tag-row">
              {selectedDetail.tags.map((tag) => (
                <span className="tag" key={tag}>
                  <Tag size={13} />
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <section className="detail-section" aria-label="话题标签">
            <div className="topic-label-header">
              <div className="detail-section-title">
                <span>Topic Labels</span>
                <h3>话题标签</h3>
              </div>
            </div>
            {selectedDetail.topicLabels?.length ? (
              <div className="topic-label-list" aria-label="已绑定话题标签">
                {selectedDetail.topicLabels.map((topicLabel) => (
                  <div className="topic-label-item" key={topicLabel.label}>
                    <div>
                      <span>{topicLabel.label}</span>
                      {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="detail-copy">暂无话题标签。</p>
            )}
          </section>

          {selectedDetail.groupType === 'reading' &&
            (readingParseStatus === 'error' || verifyStatus === 'error' || readingParseResult || verifyResult) && (
            <section className="detail-section" aria-label="AI 阅读解析与对比">
              <div className="detail-section-title">
                <span>Reading AI</span>
                <h3>AI 解析与答案对比</h3>
              </div>

              {readingParseResult && (
                <>
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {readingParseResult.parsedCount} / {readingParseResult.questionCount} 题已解析
                    {readingParseResult.unmatchedQuestionNos.length > 0
                      ? ` · 未匹配题号：${readingParseResult.unmatchedQuestionNos.join('、')}`
                      : ''}
                  </p>
                  {readingParseResult.articleAnalysis && (
                    <AnalysisDisclosure label="脉络与重要词块">
                      <p className="detail-message" style={{ marginBottom: 12 }}>
                        脉络：{readingParseResult.articleAnalysis.framework || '待补'} ·{' '}
                        {readingParseResult.articleAnalysis.summary || '待补'}
                      </p>
                      {readingParseResult.articleAnalysis.keyChunks && readingParseResult.articleAnalysis.keyChunks.length > 0 && (
                        <div className="parse-mapping" style={{ marginBottom: 12 }}>
                          <strong>重要词块</strong>
                          <ul>
                            {readingParseResult.articleAnalysis.keyChunks.map((chunk) => (
                              <li key={`${chunk.chunk}-${chunk.pos || ''}`}>
                                {chunk.chunk}
                                {chunk.phonetic ? ` (${chunk.phonetic})` : ''}
                                {chunk.pos ? `·${chunk.pos}` : ''}
                                {chunk.reason ? `：${chunk.reason}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AnalysisDisclosure>
                  )}
                </>
              )}

              {verifyResult && (
                <p className="detail-message">
                  {verifyResult.verifiedCount} / {verifyResult.questionCount} 题完成对比，{verifyResult.results.filter((r) => r.verdict === 'correct').length}
                  题建议正确；{verifyResult.results.filter((r) => r.verdict !== 'correct').length} 题建议复核。
                  {verifyResult.calledCount !== undefined ? ` 已调 DeepSeek：${verifyResult.calledCount} 题` : ''}
                </p>
              )}

              {verifyStatus === 'error' && <p className="form-error">{verifyError}</p>}
              {readingParseStatus === 'error' && !readingParseResult && <p className="form-error">{readingParseError}</p>}
            </section>
          )}

          {selectedDetail.groupType === 'cloze' && (clozeParseResult || clozeParseStatus === 'error') && (
            <section className="detail-section" aria-label="AI 完形填空解析">
              <div className="detail-section-title">
                <span>Cloze AI</span>
                <h3>AI 解析</h3>
              </div>

              {clozeParseResult && (
                <>
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {clozeParseResult.parsedCount} / {clozeParseResult.questionCount} 题已解析
                    {clozeParseResult.answerLine ? ` · ${clozeParseResult.answerLine}` : ''}
                  </p>
                  {(clozeParseResult.storySummary || clozeParseResult.condensedStory) && (
                    <AnalysisDisclosure label="故事大意与串词成篇">
                      {clozeParseResult.storySummary && (
                        <p className="detail-message" style={{ marginBottom: 12 }}>
                          故事大意：{clozeParseResult.storySummary}
                        </p>
                      )}
                      {clozeParseResult.condensedStory && (
                        <div className="parse-mapping" style={{ marginBottom: 12 }}>
                          <strong>串词成篇</strong>
                          <p>{clozeParseResult.condensedStory}</p>
                        </div>
                      )}
                    </AnalysisDisclosure>
                  )}
                </>
              )}

              {clozeParseStatus === 'error' && !clozeParseResult && <p className="form-error">{clozeParseError}</p>}
            </section>
          )}

          {selectedDetail.groupType === 'seven_choices' &&
            (sevenChoicesParseResult || sevenChoicesParseStatus === 'error') && (
            <section className="detail-section" aria-label="AI 七选五解析">
              <div className="detail-section-title">
                <span>Seven AI</span>
                <h3>AI 解析</h3>
              </div>

              {sevenChoicesParseResult && (
                <>
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {sevenChoicesParseResult.parsedCount} / {sevenChoicesParseResult.questionCount} 题已解析
                    {sevenChoicesParseResult.answerLine ? ` · ${sevenChoicesParseResult.answerLine}` : ''}
                  </p>
                  {sevenChoicesParseResult.articleSummary && (
                    <AnalysisDisclosure label="文章主旨">
                      <p className="detail-message" style={{ marginBottom: 12 }}>
                        文章主旨：{sevenChoicesParseResult.articleSummary}
                      </p>
                    </AnalysisDisclosure>
                  )}
                </>
              )}

              {sevenChoicesParseStatus === 'error' && !sevenChoicesParseResult && <p className="form-error">{sevenChoicesParseError}</p>}
            </section>
          )}

          <section className="detail-section" aria-label="小题列表">
            <div className="detail-section-title">
              <span>Questions</span>
              <h3>小题与答案</h3>
            </div>

            <div className="question-list">
                {selectedDetail.questions.map((question) => {
                const questionNo = String(question.questionNo).trim()
                const readingParseItem = readingParseByQuestionNo.get(questionNo)
                const clozeParseItem = clozeParseByQuestionNo.get(questionNo)
                const sevenChoicesParseItem = sevenChoicesParseByQuestionNo.get(questionNo)
                const grammarParseItem = grammarParseByQuestionNo.get(questionNo)
                const showAi = selectedDetail.groupType === 'reading'
                const showClozeAi = selectedDetail.groupType === 'cloze'
                const showSevenChoicesAi = selectedDetail.groupType === 'seven_choices'
                const showGrammarAi = selectedDetail.groupType === 'grammar_cloze'

                return (
                  <article className="question-item" id={`question-${question.id}`} key={question.id}>
                    <div className="question-topline">
                      <span>第 {question.questionNo} 题</span>
                      <span>{question.questionType}</span>
                      <span>{question.score} 分</span>
                    </div>
                    <p className="question-stem">{question.stem}</p>
                    {question.options.length > 0 && (
                      <div className="option-list">
                        {question.options.map((option) => (
                          <div className="option-item" key={option.id}>
                            <strong>{option.label}</strong>
                            <span>{option.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="answer-box">
                      <p>答案：{question.answer || '待补'}</p>
                    </div>

                    {showAi && readingParseItem && (
                      <div className="question-ai-block">
                        {readingParseItem.answer && (
                          <p className="question-ai-answer-line">
                            <strong>AI 推荐答案：</strong>
                            {readingParseItem.answer}
                          </p>
                        )}
                        <AnalysisDisclosure>
                          <div className="question-ai-parse">
                            <div className="question-ai-section-title">
                              <span>AI 阅读解析</span>
                            </div>
                            <p>
                              <strong>题目翻译：</strong>
                              {readingParseItem.questionTranslation || '未返回'}
                            </p>
                            <p>
                              <strong>题型策略：</strong>
                              {readingParseItem.strategy || '待返回'}
                            </p>
                            {readingParseItem.locationSentence && (
                              <p>
                                <strong>定位句：</strong>
                                {readingParseItem.locationSentence}
                                {readingParseItem.locationSentenceTranslation
                                  ? ` / ${readingParseItem.locationSentenceTranslation}`
                                  : ''}
                              </p>
                            )}
                            {readingParseItem.answerSentence && (
                              <p>
                                <strong>答案句：</strong>
                                {readingParseItem.answerSentence}
                              </p>
                            )}
                            <p>
                              <strong>AI 解析：</strong>
                              {readingParseItem.explanation || '未返回'}
                            </p>
                            {readingParseItem.languageFeatures && (
                              <p>
                                <strong>语言特征：</strong>
                                {readingParseItem.languageFeatures}
                              </p>
                            )}
                            {readingParseItem.synonymMappings && readingParseItem.synonymMappings.length > 0 && (
                              <div className="parse-mapping">
                                <strong>同义替换</strong>
                                <ul>
                                  {readingParseItem.synonymMappings.map((mapping) => (
                                    <li key={`${question.questionNo}-${mapping.text}`}>
                                      <span>{mapping.text}</span>
                                      <b>=</b>
                                      <span>{mapping.replacement}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {readingParseItem.distractorAnalysis && readingParseItem.distractorAnalysis.length > 0 && (
                              <div className="parse-mapping">
                                <strong>干扰项分析</strong>
                                <ul>
                                  {readingParseItem.distractorAnalysis.map((item) => (
                                    <li key={`${question.questionNo}-${item.option}`}>
                                      {item.option}（{labelOf(readingDistractorTypeLabel, item.type)}）：{item.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </AnalysisDisclosure>
                      </div>
                    )}
                    {showClozeAi && clozeParseItem && (
                      <div className="question-ai-block">
                        <p className="question-ai-answer-line">
                          <strong>AI 推荐答案：</strong>
                          {clozeParseItem.answer || '未返回'}
                          {clozeParseItem.answerText ? ` · ${clozeParseItem.answerText}` : ''}
                          {clozeParseItem.answerMeaning ? `（${clozeParseItem.answerMeaning}）` : ''}
                        </p>
                        <AnalysisDisclosure>
                          <div className="question-ai-parse">
                            <div className="question-ai-section-title">
                              <span>AI 完形填空解析</span>
                            </div>
                            <p>
                              <strong>AI 解析：</strong>
                              {clozeParseItem.analysis || '未返回'}
                            </p>
                            {clozeParseItem.distractorAnalysis && clozeParseItem.distractorAnalysis.length > 0 && (
                              <div className="parse-mapping">
                                <strong>干扰项分析</strong>
                                <ul>
                                  {clozeParseItem.distractorAnalysis.map((item) => (
                                    <li key={`${question.questionNo}-${item.option || item.text}`}>
                                      {item.option ? `${item.option}. ` : ''}
                                      {item.text ? `${item.text}：` : ''}
                                      {item.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </AnalysisDisclosure>
                      </div>
                    )}
                    {showSevenChoicesAi && sevenChoicesParseItem && (
                      <div className="question-ai-block">
                        <p className="question-ai-answer-line">
                          <strong>AI 推荐答案：</strong>
                          {sevenChoicesParseItem.answer || '未返回'}
                          {sevenChoicesParseItem.optionText ? ` · ${sevenChoicesParseItem.optionText}` : ''}
                        </p>
                        <AnalysisDisclosure>
                          <div className="question-ai-parse">
                            <div className="question-ai-section-title">
                              <span>AI 七选五解析</span>
                            </div>
                            {sevenChoicesParseItem.optionTranslation && (
                              <p>
                                <strong>选项翻译：</strong>
                                {sevenChoicesParseItem.optionTranslation}
                              </p>
                            )}
                            {sevenChoicesParseItem.positionContext && (
                              <p>
                                <strong>位置与上下文：</strong>
                                {sevenChoicesParseItem.positionContext}
                              </p>
                            )}
                            <p>
                              <strong>AI 解析：</strong>
                              {sevenChoicesParseItem.analysis || '未返回'}
                            </p>
                          </div>
                        </AnalysisDisclosure>
                      </div>
                    )}
                    {showGrammarAi && grammarParseItem && (
                      <div className="question-ai-block">
                        <p className="question-ai-answer-line">
                          <strong>AI 推荐答案：</strong>
                          {grammarParseItem.answer || '未返回'}
                        </p>
                        <AnalysisDisclosure>
                          <div className="question-ai-parse">
                            <div className="question-ai-section-title">
                              <span>AI 语法填空解析</span>
                            </div>
                            {grammarParseItem.hintMeaning && (
                              <p>
                                <strong>提示词意思：</strong>
                                {grammarParseItem.hintMeaning}
                              </p>
                            )}
                            <p>
                              <strong>AI 解析：</strong>
                              {grammarParseItem.analysis || '未返回'}
                            </p>
                            {grammarParseItem.sentenceTranslation && (
                              <p>
                                <strong>挖空句翻译：</strong>
                                {grammarParseItem.sentenceTranslation}
                              </p>
                            )}
                          </div>
                        </AnalysisDisclosure>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          {selectedDetail.groupType === 'grammar_cloze' && (grammarParseResult || grammarParseStatus === 'error') && (
            <section className="detail-section" aria-label="AI 语法填空解析">
              <div className="detail-section-title">
                <span>Grammar AI</span>
                <h3>AI 解析</h3>
              </div>

              {grammarParseResult && (
                <>
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {grammarParseResult.parsedCount} / {grammarParseResult.questionCount} 空已解析
                  </p>
                  {grammarParseResult.fullTranslation && (
                    <AnalysisDisclosure label="全文翻译">
                      <div className="parse-mapping" style={{ marginBottom: 12 }}>
                        <strong>全文翻译</strong>
                        <p>{grammarParseResult.fullTranslation}</p>
                      </div>
                    </AnalysisDisclosure>
                  )}
                </>
              )}

              {grammarParseStatus === 'error' && !grammarParseResult && <p className="form-error">{grammarParseError}</p>}
            </section>
          )}

        </>
      )}
    </div>
  )
}

const readingDistractorTypeLabel: Record<string, string> = {
  '0': '正确项',
  '1': '细节词误导',
  '2': '无中生有',
  '3': '常识干扰',
}
