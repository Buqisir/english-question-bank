/**
 * QuestionGroupDetailView — detail-consume-only cut.
 *
 * Retired the "网站现场生产" surface (跑 AI 解析/保存、主题划分/绑定、难度
 * 标定、AI ops-trace) per ADR-0015. This is now a read-only 看题页: passage,
 * questions, already-saved parse/verify results, already-bound topic labels,
 * 加入草稿卷, and (owner-only) 编辑/删除 as low-frequency correction tools.
 *
 * Pure props-driven, zero internal useState — App.tsx keeps the READ-only
 * state (populated by `openDetail`'s回填 + the AI Enhancement panel's
 * sync-into-open-detail branch) and passes it down.
 *
 * Owner gating: when `isOwnerView` is false (member), the hidden — not
 * disabled — surfaces are: 编辑/删除, the per-question answer-compare box
 * (`showCompareBox`), the topic-label confidence percentage
 * (ui-boundary-trim, owner 2026-07-07 / audit Q2), the answer-compare stats
 * summary (`answerCompareStats`), and the AI 验证 verify-list section
 * (owner 2026-07-08 decision — retires the C2-era "member-visible" call).
 * Everything else (passage, questions, saved parse displays, bound topic
 * labels + reason, 加入草稿卷) stays visible to both member and owner.
 */
import {
  ArrowLeft,
  Pencil,
  Plus,
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
import { sourceTypeLabel, verdictLabel } from '../../domain/questionBank'
import { labelOf } from '../../workbench/detail/readingProfileLabels'
import { AnalysisDisclosure } from './AnalysisDisclosure'
import { compactGroupMeta, getParseSavedAt } from './detailHelpers'

type AsyncStatus = 'idle' | 'loading' | 'loaded' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  } = props

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
  const verifyByQuestionNo = (() => {
    const map = new Map<string, VerifyQuestionGroupResult['results'][number]>()
    verifyResult?.results.forEach((result) => {
      map.set(String(result.questionNo).trim(), result)
    })
    return map
  })()
  const answerCompareStats = (() => {
    if (!verifyResult?.results.length) return null
    const comparedResults = verifyResult.results.filter((result) => result.verdict !== 'skipped')
    return {
      correct: comparedResults.filter((result) => result.verdict === 'correct').length,
      incorrect: comparedResults.filter((result) => result.verdict !== 'correct').length,
      total: comparedResults.length,
    }
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
            <pre className="passage-text">
              {selectedDetail.passage.materialText || '暂无完整原文。后续导入 DOCX/PDF/OCR 时会补到这里。'}
            </pre>
          </section>

          <section className="detail-section" aria-label="题组说明">
            <div className="detail-section-title">
              <span>Instruction</span>
              <h3>题组说明</h3>
            </div>
            <div className="instruction-summary">
              <p className="detail-copy">{selectedDetail.instruction || '暂无题组说明。'}</p>
              {isOwnerView && answerCompareStats && (
                <div className="answer-compare-summary" aria-label="答案对比统计">
                  <span>答案对比</span>
                  <div>
                    <strong>{answerCompareStats.correct}</strong>
                    <em>正确</em>
                  </div>
                  <div>
                    <strong>{answerCompareStats.incorrect}</strong>
                    <em>不正确</em>
                  </div>
                  <small>共 {answerCompareStats.total} 题</small>
                </div>
              )}
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
                    {isOwnerView && topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                      <em>{Math.round(topicLabel.confidence * 100)}%</em>
                    ) : null}
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
              <h3>小题与答案对比</h3>
            </div>

            <div className="question-list">
                {selectedDetail.questions.map((question) => {
                const questionNo = String(question.questionNo).trim()
                const readingParseItem = readingParseByQuestionNo.get(questionNo)
                const clozeParseItem = clozeParseByQuestionNo.get(questionNo)
                const sevenChoicesParseItem = sevenChoicesParseByQuestionNo.get(questionNo)
                const grammarParseItem = grammarParseByQuestionNo.get(questionNo)
                const verifyItem = verifyByQuestionNo.get(questionNo)
                const showAi = selectedDetail.groupType === 'reading'
                const showClozeAi = selectedDetail.groupType === 'cloze'
                const showSevenChoicesAi = selectedDetail.groupType === 'seven_choices'
                const showGrammarAi = selectedDetail.groupType === 'grammar_cloze'
                const savedParseAt = getParseSavedAt(
                  selectedDetail.groupType,
                  readingParseResult,
                  clozeParseResult,
                  sevenChoicesParseResult,
                  grammarParseResult,
                )
                const hasSavedParse = Boolean(savedParseAt)
                const hasSavedParseWithoutVerify = hasSavedParse && !verifyItem && verifyStatus !== 'loading'
                const showCompareBox = isOwnerView && (Boolean(verifyItem) || verifyStatus === 'loading' || !hasSavedParse || hasSavedParseWithoutVerify)
                const compareStatus =
                  verifyItem?.verdict ||
                  (verifyStatus === 'loading'
                    ? 'pending'
                    : hasSavedParseWithoutVerify
                      ? 'uncertain'
                      : question.answer
                        ? 'pending'
                        : 'skipped')
                const compareLabel = verifyItem
                  ? verifyItem.verdict === 'correct'
                    ? '录入答案正确'
                    : verdictLabel[verifyItem.verdict]
                  : verifyStatus === 'loading'
                    ? '对比中'
                    : hasSavedParseWithoutVerify
                      ? '状态未保存'
                    : question.answer
                      ? '待对比'
                      : '缺答案'
                const compareReason = verifyItem
                  ? verifyItem.reason || '未返回对比说明。'
                  : verifyStatus === 'loading'
                    ? '正在调用 AI 对比当前答案。'
                    : hasSavedParseWithoutVerify
                      ? '这份 AI 解析已保存，但旧记录里没有保存对比状态；重新运行 AI解析并保存后会保留原状态。'
                    : question.answer
                        ? '点击 AI解析后显示校验结论。'
                      : '当前小题还没有答案，暂不能对比。'

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
                    <div className={`answer-grid${showCompareBox ? '' : ' answer-grid-single'}`}>
                      <div className="answer-box">
                        <p>答案：{question.answer || '待补'}</p>
                      </div>
                      {showCompareBox && (
                        <div
                          className={`answer-box answer-compare-box answer-compare-compact ${compareStatus}`}
                          title={compareReason}
                        >
                          <span className={`verify-badge ${compareStatus}`}>{compareLabel}</span>
                        </div>
                      )}
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

          {isOwnerView && selectedDetail.groupType !== 'reading' ? (
            verifyResult ? (
              <section className="detail-section" aria-label="AI 验证结果">
                <div className="detail-section-title">
                  <span>AI Verification</span>
                  <h3>AI 答案验证</h3>
                </div>
                <p className="detail-message" style={{ marginBottom: 12 }}>
                    {verifyResult.verifiedCount} 题已验证，{verifyResult.results.filter((r) => r.verdict === 'correct').length} 题正确
                  {verifyStatus === 'loading' && ' · 验证中...'}
                </p>
                {verifyResult.allApiCalled !== undefined && verifyResult.totalLatencyMs !== undefined && (
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    全量耗时: {verifyResult.totalLatencyMs} ms · 全量调度完成
                  </p>
                )}
                {verifyStatus === 'error' && <p className="form-error">{verifyError}</p>}
                <div className="verify-list">
                  {verifyResult.results.map((r) => {
                    return (
                      <div className={`verify-item ${r.verdict}`} key={r.questionNo}>
                        <div className="verify-item-head">
                          <strong>第 {r.questionNo} 题</strong>
                          <span className={`verify-badge ${r.verdict}`}>
                            {verdictLabel[r.verdict]}
                          </span>
                        </div>
                        <p>{r.reason}</p>
                        {r.correctAnswer && <p className="verify-correct">建议答案：{r.correctAnswer}</p>}
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null
          ) : null}

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
