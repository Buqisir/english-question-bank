/**
 * QuestionGroupDetailView — classic-retire-2-detail-view cut.
 *
 * Extracted verbatim (JSX unchanged, no copy edits) from the
 * `viewMode === 'detail'` branch that used to live inline in App.tsx
 * (previously App.tsx:3678-4934). Pure props-driven, zero internal
 * useState — App.tsx keeps all state and handlers and passes them down.
 *
 * Owner gating (plan step 2 + PA MF-1): when `isOwnerView` is false
 * (member), every write-surface control (edit / verify / AI-parse /
 * save / topic-label generate-bind / difficulty rating) and every AI
 * ops trace paragraph (keyFingerprint/requestId/keySource/latency/
 * provider) is hidden — not disabled. Members still see hero meta, the
 * 加入草稿卷 button, passage + questions, and any already-saved
 * analysis / topic-label / difficulty display.
 */
import {
  ArrowLeft,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import type {
  ClozeParseQuestionGroupResult,
  GrammarParseQuestionGroupResult,
  QuestionGroupDetail,
  ReadingParseQuestionGroupResult,
  SevenChoicesParseQuestionGroupResult,
  TopicLabel,
  VerifyQuestionGroupResult,
} from '../../domain/questionBank'
import { difficultyLabel, sourceTypeLabel, verdictLabel } from '../../domain/questionBank'
import type { GenerateTopicLabelsResult } from '../../services/questionGroups'
import { computeCalibrationPreview, getReasonLabel, type CalibrationInput } from '../../services/difficultyCalibration'
import { DifficultyProfileGrid } from '../../workbench/detail/DifficultyProfileGrid'
import { labelOf, mainBlockerLabel } from '../../workbench/detail/readingProfileLabels'
import {
  compactGroupMeta,
  compactPreview,
  getDifficultyDraftForQuestion,
  getDisplayDifficulty,
  getParseSavedAt,
  formatSavedAt,
  mapAiDifficultyScoreToFive,
  requiresDifficultyReason,
  type DifficultyRatingDraft,
} from './detailHelpers'

const teacherDifficultyLabel: Record<number, string> = {
  1: '很低',
  2: '偏低',
  3: '中等',
  4: '偏高',
  5: '很高',
}

const difficultyOverrideReasonLabel: Record<string, string> = {
  vocab: '高难词汇',
  syntax: '长难句',
  location: '定位难',
  abstractness: '抽象度',
  distractor: '干扰项',
  topic: '话题负荷',
  other: '其他',
}

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

  topicLabel: {
    status: AsyncStatus
    error: string
    trace: GenerateTopicLabelsResult | null
    recommendations: TopicLabel[]
    selectedValues: string[]
    bindStatus: SaveStatus
    bindError: string
  }

  difficulty: {
    drafts: Record<string, DifficultyRatingDraft>
    saveStatus: Record<string, 'idle' | 'saving' | 'saved' | 'error'>
    saveErrors: Record<string, string>
  }

  onBack: () => void
  onEdit: (detail: QuestionGroupDetail) => void
  onDelete: (detail: QuestionGroupDetail) => void
  onAddToBasket: (detail: QuestionGroupDetail) => void
  onVerify: () => void
  onAnalyzeReading: () => void
  onSaveReadingParse: () => void
  onSaveClozeParse: () => void
  onSaveSevenChoicesParse: () => void
  onSaveGrammarParse: () => void
  onGenerateTopicLabels: () => void
  onToggleTopicLabel: (label: string) => void
  onBindTopicLabels: () => void
  onSaveQuestionDifficulty: (question: QuestionGroupDetail['questions'][number], aiDifficultyScore?: number | null) => void
  onUpdateDifficultyDraft: (questionId: string, patch: Partial<DifficultyRatingDraft>) => void
}

export function QuestionGroupDetailView(props: QuestionGroupDetailViewProps) {
  const {
    isOwnerView,
    defaultAiModel,
    detail: { selectedDetail, detailStatus, detailError },
    verify: { verifyResult, verifyStatus, verifyError },
    clozeParse: {
      result: clozeParseResult,
      status: clozeParseStatus,
      error: clozeParseError,
      saveStatus: clozeParseSaveStatus,
      saveError: clozeParseSaveError,
    },
    sevenChoicesParse: {
      result: sevenChoicesParseResult,
      status: sevenChoicesParseStatus,
      error: sevenChoicesParseError,
      saveStatus: sevenChoicesParseSaveStatus,
      saveError: sevenChoicesParseSaveError,
    },
    grammarParse: {
      result: grammarParseResult,
      status: grammarParseStatus,
      error: grammarParseError,
      saveStatus: grammarParseSaveStatus,
      saveError: grammarParseSaveError,
    },
    readingParse: {
      result: readingParseResult,
      status: readingParseStatus,
      error: readingParseError,
      saveStatus: readingParseSaveStatus,
      saveError: readingParseSaveError,
    },
    topicLabel: {
      status: topicLabelStatus,
      error: topicLabelError,
      trace: topicLabelTrace,
      recommendations: topicLabelRecommendations,
      selectedValues: selectedTopicLabelValues,
      bindStatus: topicLabelBindStatus,
      bindError: topicLabelBindError,
    },
    difficulty: { drafts: difficultyDrafts, saveStatus: difficultySaveStatus, saveErrors: difficultySaveErrors },
    onBack,
    onEdit,
    onDelete,
    onAddToBasket,
    onVerify,
    onAnalyzeReading,
    onSaveReadingParse,
    onSaveClozeParse,
    onSaveSevenChoicesParse,
    onSaveGrammarParse,
    onGenerateTopicLabels,
    onToggleTopicLabel,
    onBindTopicLabels,
    onSaveQuestionDifficulty,
    onUpdateDifficultyDraft,
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

  const DEFAULT_AI_MODEL = defaultAiModel

  return (
    <div className="detail-view">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回列表
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
              <span className={`difficulty ${selectedDetail.difficulty}`}>
                难度 {difficultyLabel[selectedDetail.difficulty]}
              </span>
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
              {isOwnerView &&
                (selectedDetail.groupType === 'reading' ? (
                  <>
                    <button
                      className="detail-button"
                      type="button"
                      onClick={onAnalyzeReading}
                    >
                      <Sparkles size={16} />
                      {readingParseStatus === 'loading' || verifyStatus === 'loading'
                        ? 'AI解析中'
                        : 'AI解析'}
                    </button>
                  </>
                ) : (
                  <button
                    className="detail-button"
                    type="button"
                    onClick={onVerify}
                  >
                    <Sparkles size={16} />
                    {verifyStatus === 'loading' ||
                    clozeParseStatus === 'loading' ||
                    sevenChoicesParseStatus === 'loading' ||
                    grammarParseStatus === 'loading'
                      ? 'AI解析中'
                      : 'AI解析'}
                  </button>
                ))}
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
              {answerCompareStats && (
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
              {isOwnerView && (
                <button
                  className="detail-button"
                  type="button"
                  onClick={onGenerateTopicLabels}
                  disabled={topicLabelStatus === 'loading'}
                >
                  <Sparkles size={16} />
                  {topicLabelStatus === 'loading' ? '主题划分中' : '主题划分'}
                </button>
              )}
            </div>
            {topicLabelStatus === 'loading' && <p className="detail-message">正在划分主题...</p>}
            {topicLabelStatus === 'error' && <p className="form-error">{topicLabelError}</p>}
            {selectedDetail.topicLabels?.length ? (
              <div className="topic-label-list" aria-label="已绑定话题标签">
                {selectedDetail.topicLabels.map((topicLabel) => (
                  <div className="topic-label-item" key={topicLabel.label}>
                    <div>
                      <span>{topicLabel.label}</span>
                      {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                    </div>
                    {topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                      <em>{Math.round(topicLabel.confidence * 100)}%</em>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : topicLabelStatus !== 'loading' ? (
              <p className="detail-copy">暂无话题标签。</p>
            ) : null}
            {isOwnerView && topicLabelRecommendations.length > 0 && (
              <div className="topic-label-candidates" aria-label="主题划分候选">
                {topicLabelRecommendations.map((topicLabel) => (
                  <label className="topic-label-option" key={topicLabel.label}>
                    <input
                      type="checkbox"
                      checked={selectedTopicLabelValues.includes(topicLabel.label)}
                      onChange={() => onToggleTopicLabel(topicLabel.label)}
                    />
                    <span>{topicLabel.label}</span>
                    {topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                      <em>{Math.round(topicLabel.confidence * 100)}%</em>
                    ) : null}
                    {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                  </label>
                ))}
                <button
                  className="save-button"
                  type="button"
                  onClick={onBindTopicLabels}
                  disabled={topicLabelBindStatus === 'saving' || selectedTopicLabelValues.length === 0}
                >
                  <Save size={16} />
                  {topicLabelBindStatus === 'saving' ? '绑定中' : '绑定选中标签'}
                </button>
              </div>
            )}
            {isOwnerView && topicLabelBindStatus === 'saved' && <p className="detail-copy">已绑定，当前题组可按话题标签检索。</p>}
            {isOwnerView && topicLabelBindStatus === 'error' && <p className="form-error">{topicLabelBindError}</p>}
            {isOwnerView && topicLabelTrace && (
              <p className="ai-meta">
                Provider: {topicLabelTrace.provider ?? 'deepseek'} · 模型: {topicLabelTrace.model || DEFAULT_AI_MODEL} ·
                推理模式: {topicLabelTrace.thinkingMode ? '开启' : '关闭'} · key 来源:{' '}
                {topicLabelTrace.keySource === 'local'
                  ? '本地模型'
                  : topicLabelTrace.keySource === 'env'
                    ? '环境变量 DEEPSEEK_API_KEY'
                    : '右上角输入框'}{' '}
                · call trace:{' '}
                {topicLabelTrace.requestId || '（未返回）'}
                {(topicLabelTrace.keyFingerprint || topicLabelTrace.keyMask)
                  ? ` · key 口令: ${topicLabelTrace.keyFingerprint || topicLabelTrace.keyMask}`
                  : ''}
                {topicLabelTrace.totalLatencyMs !== undefined ? ` · 全量耗时: ${topicLabelTrace.totalLatencyMs} ms` : ''}
              </p>
            )}
          </section>

          {selectedDetail.groupType === 'reading' &&
            (readingParseStatus === 'loading' ||
              readingParseStatus === 'error' ||
              verifyStatus === 'loading' ||
              verifyStatus === 'error' ||
              readingParseResult ||
              verifyResult) && (
            <section className="detail-section" aria-label="AI 阅读解析与对比">
              <div className="detail-section-title">
                <span>Reading AI</span>
                <h3>AI 阅读解析与答案对比</h3>
              </div>
              {(readingParseStatus === 'loading' || verifyStatus === 'loading') && (
                <p className="detail-message">AI解析中...</p>
              )}

              {readingParseResult && (
                <>
                  {isOwnerView && (
                    <div className="reading-ai-actions">
                      <p className="detail-message">
                        {readingParseSaveStatus === 'saved'
                          ? `已保存到本地题库${readingParseResult.savedAt ? ` · ${formatSavedAt(readingParseResult.savedAt)}` : ''}`
                          : '当前 AI 阅读解析尚未保存，刷新后会丢失。'}
                      </p>
                      <button
                        className="save-button"
                        type="button"
                        disabled={
                          readingParseSaveStatus === 'saving' ||
                          readingParseSaveStatus === 'saved' ||
                          verifyStatus === 'loading'
                        }
                        onClick={onSaveReadingParse}
                      >
                        <Save size={16} />
                        {verifyStatus === 'loading'
                          ? '等待对比'
                          : readingParseSaveStatus === 'saving'
                          ? '保存中'
                          : readingParseSaveStatus === 'saved'
                            ? '已保存'
                            : '保存 AI 解析'}
                      </button>
                    </div>
                  )}
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {readingParseResult.parsedCount} / {readingParseResult.questionCount} 题已解析
                    {readingParseResult.unmatchedQuestionNos.length > 0
                      ? ` · 未匹配题号：${readingParseResult.unmatchedQuestionNos.join('、')}`
                      : ''}
                  </p>
                  {readingParseResult.articleAnalysis && (
                    <p className="detail-message" style={{ marginBottom: 12 }}>
                      脉络：{readingParseResult.articleAnalysis.framework || '待补'} ·{' '}
                      {readingParseResult.articleAnalysis.summary || '待补'}
                    </p>
                  )}
                  {readingParseResult.articleAnalysis?.keyChunks && readingParseResult.articleAnalysis.keyChunks.length > 0 && (
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
                </>
              )}

              {isOwnerView && readingParseSaveStatus === 'error' && <p className="form-error">{readingParseSaveError}</p>}
              {verifyResult && (
                <p className="detail-message">
                  {verifyResult.verifiedCount} / {verifyResult.questionCount} 题完成对比，{verifyResult.results.filter((r) => r.verdict === 'correct').length}
                  题建议正确；{verifyResult.results.filter((r) => r.verdict !== 'correct').length} 题建议复核。
                  {verifyResult.calledCount !== undefined ? ` 已调 DeepSeek：${verifyResult.calledCount} 题` : ''}
                </p>
              )}

              {verifyStatus === 'error' && <p className="form-error">{verifyError}</p>}
              {readingParseStatus === 'error' && !readingParseResult && <p className="form-error">{readingParseError}</p>}
              {isOwnerView && readingParseResult && (
                <p className="detail-message" style={{ marginTop: 12 }}>
                  Provider: {readingParseResult.provider ?? 'deepseek'} · 模型: {readingParseResult.model || DEFAULT_AI_MODEL} ·
                  推理模式: {readingParseResult.thinkingMode ? '开启' : '关闭'} ·
                  key 来源: {readingParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                  call trace: {readingParseResult.requestId || '（未返回）'}
                  {(readingParseResult.keyFingerprint || readingParseResult.keyMask)
                    ? ` · key 口令: ${readingParseResult.keyFingerprint || readingParseResult.keyMask}`
                    : ''}
                  {readingParseResult.totalLatencyMs ? ` · 全量耗时: ${readingParseResult.totalLatencyMs} ms` : ''}
                </p>
              )}
            </section>
          )}

          {selectedDetail.groupType === 'cloze' && (clozeParseResult || clozeParseStatus === 'loading' || clozeParseStatus === 'error') && (
            <section className="detail-section" aria-label="AI 完形填空解析">
              <div className="detail-section-title">
                <span>Cloze AI</span>
                <h3>AI 完形填空解析</h3>
              </div>
              {clozeParseStatus === 'loading' && (
                <p className="detail-message">AI解析中...</p>
              )}

              {clozeParseResult && (
                <>
                  {isOwnerView && (
                    <div className="reading-ai-actions">
                      <p className="detail-message">
                        {clozeParseSaveStatus === 'saved'
                          ? `已保存到本地题库${clozeParseResult.savedAt ? ` · ${formatSavedAt(clozeParseResult.savedAt)}` : ''}`
                          : '当前 AI 完形填空解析尚未保存，刷新后会丢失。'}
                      </p>
                      <button
                        className="save-button"
                        type="button"
                        disabled={
                          clozeParseSaveStatus === 'saving' ||
                          clozeParseSaveStatus === 'saved' ||
                          clozeParseStatus === 'loading'
                        }
                        onClick={onSaveClozeParse}
                      >
                        <Save size={16} />
                        {clozeParseSaveStatus === 'saving'
                          ? '保存中'
                          : clozeParseSaveStatus === 'saved'
                            ? '已保存'
                            : '保存 AI 解析'}
                      </button>
                    </div>
                  )}
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {clozeParseResult.parsedCount} / {clozeParseResult.questionCount} 题已解析
                    {clozeParseResult.answerLine ? ` · ${clozeParseResult.answerLine}` : ''}
                  </p>
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
                </>
              )}

              {isOwnerView && clozeParseSaveStatus === 'error' && <p className="form-error">{clozeParseSaveError}</p>}
              {clozeParseStatus === 'error' && !clozeParseResult && <p className="form-error">{clozeParseError}</p>}
            </section>
          )}

          {selectedDetail.groupType === 'seven_choices' &&
            (sevenChoicesParseResult || sevenChoicesParseStatus === 'loading' || sevenChoicesParseStatus === 'error') && (
            <section className="detail-section" aria-label="AI 七选五解析">
              <div className="detail-section-title">
                <span>Seven AI</span>
                <h3>AI 七选五解析</h3>
              </div>
              {sevenChoicesParseStatus === 'loading' && (
                <p className="detail-message">AI解析中...</p>
              )}

              {sevenChoicesParseResult && (
                <>
                  {isOwnerView && (
                    <div className="reading-ai-actions">
                      <p className="detail-message">
                        {sevenChoicesParseSaveStatus === 'saved'
                          ? `已保存到本地题库${sevenChoicesParseResult.savedAt ? ` · ${formatSavedAt(sevenChoicesParseResult.savedAt)}` : ''}`
                          : '当前 AI 七选五解析尚未保存，刷新后会丢失。'}
                      </p>
                      <button
                        className="save-button"
                        type="button"
                        disabled={
                          sevenChoicesParseSaveStatus === 'saving' ||
                          sevenChoicesParseSaveStatus === 'saved' ||
                          sevenChoicesParseStatus === 'loading'
                        }
                        onClick={onSaveSevenChoicesParse}
                      >
                        <Save size={16} />
                        {sevenChoicesParseSaveStatus === 'saving'
                          ? '保存中'
                          : sevenChoicesParseSaveStatus === 'saved'
                            ? '已保存'
                            : '保存 AI 解析'}
                      </button>
                    </div>
                  )}
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {sevenChoicesParseResult.parsedCount} / {sevenChoicesParseResult.questionCount} 题已解析
                    {sevenChoicesParseResult.answerLine ? ` · ${sevenChoicesParseResult.answerLine}` : ''}
                  </p>
                  {sevenChoicesParseResult.articleSummary && (
                    <p className="detail-message" style={{ marginBottom: 12 }}>
                      文章主旨：{sevenChoicesParseResult.articleSummary}
                    </p>
                  )}
                </>
              )}

              {isOwnerView && sevenChoicesParseSaveStatus === 'error' && <p className="form-error">{sevenChoicesParseSaveError}</p>}
              {sevenChoicesParseStatus === 'error' && !sevenChoicesParseResult && <p className="form-error">{sevenChoicesParseError}</p>}
              {isOwnerView && sevenChoicesParseResult && (
                <p className="detail-message" style={{ marginTop: 12 }}>
                  Provider: {sevenChoicesParseResult.provider ?? 'deepseek'} · 模型: {sevenChoicesParseResult.model || DEFAULT_AI_MODEL} ·
                  推理模式: {sevenChoicesParseResult.thinkingMode ? '开启' : '关闭'} ·
                  key 来源: {sevenChoicesParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                  call trace: {sevenChoicesParseResult.requestId || '（未返回）'}
                  {(sevenChoicesParseResult.keyFingerprint || sevenChoicesParseResult.keyMask)
                    ? ` · key 口令: ${sevenChoicesParseResult.keyFingerprint || sevenChoicesParseResult.keyMask}`
                    : ''}
                  {sevenChoicesParseResult.totalLatencyMs ? ` · 全量耗时: ${sevenChoicesParseResult.totalLatencyMs} ms` : ''}
                </p>
              )}
            </section>
          )}

          <section className="detail-section" aria-label="小题列表">
            <div className="detail-section-title">
              <span>Questions</span>
              <h3>小题与答案对比</h3>
            </div>

            {/* Difficulty Review Queue + Stats */}
            {isOwnerView && (() => {
              const reviewItems = selectedDetail.questions.map((q) => {
                const qNo = String(q.questionNo).trim()
                const rpi = readingParseByQuestionNo.get(qNo)
                const sp = rpi?.surfaceQuestion
                const sd = rpi?.synonymDifficulty
                const dp = rpi?.difficultyProfile
                const mBlockers = dp?.mainBlockers ?? []
                const effAiScore = q.aiDifficultyScore ?? dp?.finalScore ?? null
                const bucket = mapAiDifficultyScoreToFive(effAiScore)
                const calInput: CalibrationInput = {
                  aiDifficultyScore: effAiScore,
                  deepseekMappedDifficulty: bucket,
                  surfaceType: sp?.type,
                  answeringMove: sp?.answeringMove,
                  tCardId: sd?.cardId,
                  mainBlockers: mBlockers.length > 0 ? mBlockers : undefined,
                  stem: q.stem,
                }
                const preview = computeCalibrationPreview(calInput)
                return { question: q, preview, bucket }
              })

              const totalQuestions = reviewItems.length
              const confirmedCount = reviewItems.filter((r) => r.question.teacherDifficulty != null).length
              const calibrationChangedCount = reviewItems.filter((r) => r.preview && r.preview.calibratedScore !== r.preview.rawScore).length
              const highCeilingCount = reviewItems.filter((r) => r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')).length
              const t10LowCount = reviewItems.filter((r) => r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')).length

              // Most common reason
              const reasonCounts = new Map<string, number>()
              for (const r of reviewItems) {
                for (const code of r.preview?.reasons ?? []) {
                  reasonCounts.set(code, (reasonCounts.get(code) || 0) + 1)
                }
              }
              let topReason = ''
              let topReasonCount = 0
              for (const [code, count] of reasonCounts) {
                if (count > topReasonCount) { topReason = code; topReasonCount = count }
              }

              // Queue: questions needing review
              const needsReview = reviewItems.filter((r) => {
                if (r.question.teacherDifficulty == null) return true
                if (r.preview && r.preview.calibratedScore !== r.preview.rawScore) return true
                if (r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')) return true
                if (r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')) return true
                return false
              })
              const pendingCount = needsReview.length

              return (
                <div className="difficulty-review-panel">
                  <div className="difficulty-review-stats">
                    <span><strong>{totalQuestions}</strong> 总题</span>
                    <span><strong>{confirmedCount}</strong> 已确认</span>
                    <span><strong>{pendingCount}</strong> 待复核</span>
                    <span><strong>{calibrationChangedCount}</strong> 校正调整</span>
                    {highCeilingCount > 0 && <span className="watch"><strong>{highCeilingCount}</strong> 高天花板</span>}
                    {t10LowCount > 0 && <span className="watch"><strong>{t10LowCount}</strong> T10低置信</span>}
                    {topReason && <span className="reason">常见: {getReasonLabel(topReason as any)} ({topReasonCount})</span>}
                  </div>
                  {needsReview.length > 0 && (
                    <details className="difficulty-review-queue">
                      <summary>难度复核队列 ({needsReview.length} 题待处理)</summary>
                      <div className="difficulty-review-queue-list">
                        {needsReview.map((item) => {
                          const isHighCeiling = item.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')
                          const isT10 = item.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')
                          return (
                            <a
                              className={`difficulty-review-queue-item${isHighCeiling ? ' high-ceiling' : ''}${isT10 ? ' t10-low' : ''}`}
                              href={`#question-${item.question.id}`}
                              key={`review-q-${item.question.id}`}
                            >
                              <span className="review-q-no">Q{item.question.questionNo}</span>
                              <span className="review-q-stem">{compactPreview(item.question.stem, 48)}</span>
                              <span className="review-q-scores">
                                AI {item.bucket ?? '?'}
                                {item.preview && item.preview.calibratedScore !== item.preview.rawScore
                                  ? ` → 校正 ${item.preview.calibratedScore}`
                                  : ''}
                                {item.question.teacherDifficulty ? ` · 教师 ${item.question.teacherDifficulty}` : ''}
                              </span>
                              {item.preview && item.preview.reasons.length > 0 && (
                                <span className="review-q-reasons">
                                  {item.preview.reasons.slice(0, 3).map((c) => getReasonLabel(c as any)).join('、')}
                                </span>
                              )}
                              {isHighCeiling && <span className="review-q-flag high-ceiling">高天花板</span>}
                              {isT10 && <span className="review-q-flag t10">T10低置信</span>}
                            </a>
                          )
                        })}
                      </div>
                    </details>
                  )}
                </div>
              )
            })()}

            {/* Difficulty Calibration Report */}
            {isOwnerView && (() => {
              const reportItems = selectedDetail.questions.map((q) => {
                const qNo = String(q.questionNo).trim()
                const rpi = readingParseByQuestionNo.get(qNo)
                const sp = rpi?.surfaceQuestion
                const sd = rpi?.synonymDifficulty
                const dp = rpi?.difficultyProfile
                const mBlockers = dp?.mainBlockers ?? []
                const effAiScore = q.aiDifficultyScore ?? dp?.finalScore ?? null
                const bucket = mapAiDifficultyScoreToFive(effAiScore)
                const preview = computeCalibrationPreview({
                  aiDifficultyScore: effAiScore,
                  deepseekMappedDifficulty: bucket,
                  surfaceType: sp?.type,
                  answeringMove: sp?.answeringMove,
                  tCardId: sd?.cardId,
                  mainBlockers: mBlockers.length > 0 ? mBlockers : undefined,
                  stem: q.stem,
                })
                return { question: q, bucket, preview, blockers: mBlockers }
              })

              const total = reportItems.length
              // Distributions
              const aiBucketDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.bucket === s).length }))
              const teacherDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.question.teacherDifficulty === s).length }))
              const calDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.preview?.calibratedScore === s).length }))
              const teacherConfirmedCount = reportItems.filter((r) => r.question.teacherDifficulty != null).length

              // AI vs teacher comparison
              const compared = reportItems.filter((r) => r.question.teacherDifficulty != null && r.bucket != null)
              const exactCount = compared.filter((r) => r.bucket === r.question.teacherDifficulty).length
              const aiLowerCount = compared.filter((r) => r.bucket! < r.question.teacherDifficulty!).length
              const aiHigherCount = compared.filter((r) => r.bucket! > r.question.teacherDifficulty!).length
              const gapTwoCount = compared.filter((r) => Math.abs(r.bucket! - r.question.teacherDifficulty!) >= 2).length

              // Top blockers/reasons
              const reasonCounts = new Map<string, number>()
              const blockerCounts = new Map<string, number>()
              for (const r of reportItems) {
                for (const code of r.preview?.reasons ?? []) reasonCounts.set(code, (reasonCounts.get(code) || 0) + 1)
                for (const b of r.blockers) blockerCounts.set(b, (blockerCounts.get(b) || 0) + 1)
              }
              const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
              const topBlockers = [...blockerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

              // Watch list
              const watchList = reportItems.filter((r) => {
                if (r.preview && r.preview.calibratedScore !== r.preview.rawScore) return true
                if (r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')) return true
                if (r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')) return true
                if (r.question.teacherDifficulty != null && r.bucket != null && Math.abs(r.bucket - r.question.teacherDifficulty) >= 2) return true
                return false
              })

              return (
                <details className="calibration-report">
                  <summary>难度校正报告 · {total} 题 · 已确认 {teacherConfirmedCount}</summary>
                  <div className="calibration-report-body">
                    {/* Distributions */}
                    <div className="calibration-report-section">
                      <span className="calibration-report-label">分数分布</span>
                      <table className="calibration-report-table">
                        <thead>
                          <tr><th>档位</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>
                        </thead>
                        <tbody>
                          <tr><td>AI</td>{aiBucketDist.map((d) => <td key={`ai-${d.score}`}>{d.count || '-'}</td>)}</tr>
                          <tr><td>校正</td>{calDist.map((d) => <td key={`cal-${d.score}`}>{d.count || '-'}</td>)}</tr>
                          <tr><td>教师</td>{teacherConfirmedCount > 0 ? teacherDist.map((d) => <td key={`t-${d.score}`}>{d.count || '-'}</td>) : <td colSpan={5}>暂无老师确认样本</td>}</tr>
                        </tbody>
                      </table>
                    </div>

                    {/* AI vs Teacher */}
                    {compared.length > 0 && (
                      <div className="calibration-report-section">
                        <span className="calibration-report-label">AI vs 教师 ({compared.length} 题已对比)</span>
                        <div className="calibration-report-chips">
                          <span>一致 <strong>{exactCount}</strong></span>
                          <span>AI偏低 <strong>{aiLowerCount}</strong></span>
                          <span>AI偏高 <strong>{aiHigherCount}</strong></span>
                          <span className={gapTwoCount > 0 ? 'warn' : ''}>差≥2 <strong>{gapTwoCount}</strong></span>
                        </div>
                      </div>
                    )}
                    {compared.length === 0 && (
                      <div className="calibration-report-section">
                        <span className="calibration-report-label">AI vs 教师</span>
                        <span className="calibration-report-muted">暂无老师确认样本</span>
                      </div>
                    )}

                    {/* Top reasons/blockers */}
                    {(topReasons.length > 0 || topBlockers.length > 0) && (
                      <div className="calibration-report-section">
                        <span className="calibration-report-label">常见原因 / 阻断</span>
                        <div className="calibration-report-chips">
                          {topReasons.map(([code, count]) => (
                            <span key={`r-${code}`}>{getReasonLabel(code as any)} <strong>{count}</strong></span>
                          ))}
                          {topBlockers.map(([b, count]) => (
                            <span key={`b-${b}`} className="blocker">{labelOf(mainBlockerLabel, b)} <strong>{count}</strong></span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Watch list */}
                    {watchList.length > 0 && (
                      <div className="calibration-report-section">
                        <span className="calibration-report-label">关注列表 ({watchList.length})</span>
                        <div className="calibration-report-watchlist">
                          {watchList.slice(0, 12).map((item) => (
                            <a className="calibration-report-watch-item" href={`#question-${item.question.id}`} key={`rw-${item.question.id}`}>
                              <strong>Q{item.question.questionNo}</strong>
                              <span>
                                AI {item.bucket ?? '?'}
                                {item.preview && item.preview.calibratedScore !== item.preview.rawScore ? ` → ${item.preview.calibratedScore}` : ''}
                                {item.question.teacherDifficulty != null ? ` · 教师 ${item.question.teacherDifficulty}` : ''}
                              </span>
                              {item.preview?.watchFlags.map((f) => (
                                <em key={`${item.question.id}-${f.code}`}>{f.code === 'high_ceiling_watch' ? '高天花板' : 'T10低置信'}</em>
                              ))}
                              {item.question.teacherDifficulty != null && item.bucket != null && Math.abs(item.bucket - item.question.teacherDifficulty) >= 2 && (
                                <em>差≥2</em>
                              )}
                            </a>
                          ))}
                          {watchList.length > 12 && <span className="calibration-report-muted">…还有 {watchList.length - 12} 题</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )
            })()}

            <div className="question-list">
                {selectedDetail.questions.map((question) => {
                const questionNo = String(question.questionNo).trim()
                const readingParseItem = readingParseByQuestionNo.get(questionNo)
                const surfaceQuestionItem = readingParseItem?.surfaceQuestion
                const synonymDifficultyItem = readingParseItem?.synonymDifficulty
                const difficultyProfileItem = readingParseItem?.difficultyProfile
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
                const showCompareBox = Boolean(verifyItem) || verifyStatus === 'loading' || !hasSavedParse || hasSavedParseWithoutVerify
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
                const vocabBlockerWords = difficultyProfileItem?.vocabLoad?.blockerWords?.slice(0, 4) ?? []
                const mainBlockers = difficultyProfileItem?.mainBlockers ?? []
                const effectiveAiDifficultyScore =
                  question.aiDifficultyScore ?? difficultyProfileItem?.finalScore ?? null
                const difficultyDraft = difficultyDrafts[question.id] || getDifficultyDraftForQuestion(question)
                const displayDifficulty = getDisplayDifficulty(question, effectiveAiDifficultyScore)
                const aiDifficultyBucket = mapAiDifficultyScoreToFive(effectiveAiDifficultyScore)
                const difficultySource = question.teacherDifficulty
                  ? '老师确认'
                  : displayDifficulty
                    ? 'AI建议'
                    : ''
                const difficultyReasonRequired = requiresDifficultyReason(
                  question,
                  difficultyDraft,
                  effectiveAiDifficultyScore,
                )
                const difficultyStatus = difficultySaveStatus[question.id] || 'idle'
                const questionCalibrationPreview = computeCalibrationPreview({
                  aiDifficultyScore: effectiveAiDifficultyScore,
                  deepseekMappedDifficulty: aiDifficultyBucket,
                  surfaceType: surfaceQuestionItem?.type,
                  answeringMove: surfaceQuestionItem?.answeringMove,
                  tCardId: synonymDifficultyItem?.cardId,
                  mainBlockers: mainBlockers.length > 0 ? mainBlockers : undefined,
                  stem: question.stem,
                })

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

                    {isOwnerView && (
                      <div className="teacher-difficulty-card">
                        <div className="teacher-difficulty-head">
                          <span>小题难度</span>
                          <strong>
                            {displayDifficulty
                              ? `${difficultySource} ${displayDifficulty} · ${teacherDifficultyLabel[displayDifficulty]}`
                              : '未评估'}
                          </strong>
                          <em>
                            AI {effectiveAiDifficultyScore ? `${effectiveAiDifficultyScore}/10` : '未评估'}
                            {aiDifficultyBucket ? ` → ${aiDifficultyBucket}档` : ''}
                          </em>
                        </div>
                        <div className="teacher-difficulty-controls" aria-label="老师确认难度">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <button
                              className={difficultyDraft.teacherDifficulty === String(level) ? 'active' : ''}
                              key={`${question.id}-difficulty-${level}`}
                              type="button"
                              onClick={() => onUpdateDifficultyDraft(question.id, { teacherDifficulty: String(level) })}
                            >
                              {level}
                            </button>
                          ))}
                          <button
                            className="ghost"
                            type="button"
                            onClick={() =>
                              onUpdateDifficultyDraft(question.id, {
                                teacherDifficulty: '',
                                reason: '',
                                note: '',
                              })
                            }
                          >
                            清空
                          </button>
                          {aiDifficultyBucket && (
                            <button
                              className={`ghost${difficultyDraft.teacherDifficulty === String(aiDifficultyBucket) ? ' active' : ''}`}
                              type="button"
                              title={`设为AI建议 ${aiDifficultyBucket} 档`}
                              onClick={() => onUpdateDifficultyDraft(question.id, { teacherDifficulty: String(aiDifficultyBucket) })}
                            >
                              同意AI
                            </button>
                          )}
                          {questionCalibrationPreview && questionCalibrationPreview.calibratedScore !== questionCalibrationPreview.rawScore && (
                            <button
                              className={`ghost${difficultyDraft.teacherDifficulty === String(questionCalibrationPreview.calibratedScore) ? ' active' : ''}`}
                              type="button"
                              title={`设为校正建议 ${questionCalibrationPreview.calibratedScore} 档`}
                              onClick={() => onUpdateDifficultyDraft(question.id, { teacherDifficulty: String(questionCalibrationPreview.calibratedScore) })}
                            >
                              同意校正
                            </button>
                          )}
                        </div>
                        <div className="teacher-difficulty-meta">
                          <select
                            aria-label="难度偏差原因"
                            value={difficultyDraft.reason}
                            onChange={(event) => onUpdateDifficultyDraft(question.id, { reason: event.target.value })}
                          >
                            <option value="">{difficultyReasonRequired ? '选择偏差原因' : '原因可选'}</option>
                            {Object.entries(difficultyOverrideReasonLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label="难度备注"
                            placeholder="老师备注"
                            value={difficultyDraft.note}
                            onChange={(event) => onUpdateDifficultyDraft(question.id, { note: event.target.value })}
                          />
                          <button
                            className="save-button"
                            disabled={difficultyStatus === 'saving'}
                            type="button"
                            onClick={() => onSaveQuestionDifficulty(question, effectiveAiDifficultyScore)}
                          >
                            <Save size={16} />
                            {difficultyStatus === 'saving' ? '保存中' : '保存'}
                          </button>
                        </div>
                        {(difficultySaveErrors[question.id] || difficultyStatus === 'saved' || question.difficultyTaggedAt) && (
                          <p className={`teacher-difficulty-status ${difficultySaveErrors[question.id] ? 'error' : ''}`}>
                            {difficultySaveErrors[question.id] ||
                              (difficultyStatus === 'saved'
                                ? '已保存'
                                : question.difficultyTaggedAt
                                  ? `已确认 · ${question.difficultyTaggedAt}`
                                  : '')}
                          </p>
                        )}
                      </div>
                    )}

                    {isOwnerView && (() => {
                      const preview = questionCalibrationPreview
                      if (!preview) return null
                      const isT10Low = preview.watchFlags.some((f) => f.code === 't10_possible_overestimate')
                      const isHighCeiling = preview.watchFlags.some((f) => f.code === 'high_ceiling_watch')
                      return (
                        <div className={`calibration-preview-card${isT10Low ? ' low-confidence' : ''}`}>
                          <div className="calibration-preview-head">
                            <span>校正建议</span>
                            <strong>{preview.displayLabel}</strong>
                          </div>
                          {isHighCeiling && (
                            <p className="calibration-watch-flag high-ceiling">可能高天花板，需教师复核</p>
                          )}
                          {isT10Low && (
                            <p className="calibration-watch-flag t10-warning">抽象压缩样本不足，可能高估</p>
                          )}
                          {preview.reasons.length > 0 && (
                            <div className="calibration-reasons">
                              {preview.reasons.map((code) => (
                                <span key={`${question.id}-cal-${code}`}>{getReasonLabel(code)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {isOwnerView && (
                      <DifficultyProfileGrid
                        showAi={showAi}
                        questionId={question.id}
                        surfaceQuestionItem={surfaceQuestionItem}
                        difficultyProfileItem={difficultyProfileItem}
                        mainBlockers={mainBlockers}
                        vocabBlockerWords={vocabBlockerWords}
                      />
                    )}

                    {isOwnerView && showAi && synonymDifficultyItem && (
                      <div className={`synonym-difficulty-card${synonymDifficultyItem.reviewNeeded ? ' needs-review' : ''}`}>
                        <div className="synonym-difficulty-head">
                          <span>同义替换难度</span>
                          <strong>
                            {synonymDifficultyItem.cardId} · {synonymDifficultyItem.name}
                          </strong>
                          <em>
                            SOLO {synonymDifficultyItem.soloLevel} · 难度 {synonymDifficultyItem.difficultyDefault} ·{' '}
                            {Math.round(synonymDifficultyItem.confidence * 100)}%
                          </em>
                        </div>
                        <p>{synonymDifficultyItem.reason}</p>
                        <div className="synonym-difficulty-evidence">
                          {synonymDifficultyItem.evidenceSource && (
                            <span>证据来源：{synonymDifficultyItem.evidenceSource}</span>
                          )}
                          <span>原文：{synonymDifficultyItem.sourceExpression || '待补'}</span>
                          <span>选项：{synonymDifficultyItem.optionExpression || '待补'}</span>
                          {synonymDifficultyItem.boundaryCheck && (
                            <span>边界判断：{synonymDifficultyItem.boundaryCheck}</span>
                          )}
                          {synonymDifficultyItem.studentBlocker && (
                            <span>学生卡点：{synonymDifficultyItem.studentBlocker}</span>
                          )}
                          {synonymDifficultyItem.teachingMove && (
                            <span>讲评动作：{synonymDifficultyItem.teachingMove}</span>
                          )}
                        </div>
                        {((synonymDifficultyItem.boundaryFlags?.length ?? 0) > 0 ||
                          synonymDifficultyItem.reviewNeeded) && (
                          <div className="synonym-difficulty-flags">
                            {synonymDifficultyItem.boundaryFlags.map((flag) => (
                              <span key={`${question.id}-${flag}`}>{flag}</span>
                            ))}
                            {synonymDifficultyItem.reviewNeeded && <strong>需人工复核</strong>}
                          </div>
                        )}
                      </div>
                    )}

                    {showAi && readingParseItem && (
                      <div className="question-ai-block">
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
                          {readingParseItem.answer && (
                            <p>
                              <strong>AI 推荐答案：</strong>
                              {readingParseItem.answer}
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
                      </div>
                    )}
                    {showClozeAi && clozeParseItem && (
                      <div className="question-ai-block">
                        <div className="question-ai-parse">
                          <div className="question-ai-section-title">
                            <span>AI 完形填空解析</span>
                          </div>
                          <p>
                            <strong>AI 推荐答案：</strong>
                            {clozeParseItem.answer || '未返回'}
                            {clozeParseItem.answerText ? ` · ${clozeParseItem.answerText}` : ''}
                            {clozeParseItem.answerMeaning ? `（${clozeParseItem.answerMeaning}）` : ''}
                          </p>
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
                      </div>
                    )}
                    {showSevenChoicesAi && sevenChoicesParseItem && (
                      <div className="question-ai-block">
                        <div className="question-ai-parse">
                          <div className="question-ai-section-title">
                            <span>AI 七选五解析</span>
                          </div>
                          <p>
                            <strong>AI 推荐答案：</strong>
                            {sevenChoicesParseItem.answer || '未返回'}
                            {sevenChoicesParseItem.optionText ? ` · ${sevenChoicesParseItem.optionText}` : ''}
                          </p>
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
                      </div>
                    )}
                    {showGrammarAi && grammarParseItem && (
                      <div className="question-ai-block">
                        <div className="question-ai-parse">
                          <div className="question-ai-section-title">
                            <span>AI 语法填空解析</span>
                          </div>
                          <p>
                            <strong>AI 推荐答案：</strong>
                            {grammarParseItem.answer || '未返回'}
                          </p>
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
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          {selectedDetail.groupType !== 'reading' ? (
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
                {isOwnerView && (
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    Provider: {verifyResult.provider ?? 'deepseek'} · 模型: {verifyResult.model || DEFAULT_AI_MODEL} ·
                    推理模式: {verifyResult.thinkingMode ? '开启' : '关闭'} ·
                    key 来源: {verifyResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                    call trace: {verifyResult.requestId || '（未返回）'}
                    {(verifyResult.keyFingerprint || verifyResult.keyMask)
                      ? ` · key 口令: ${verifyResult.keyFingerprint || verifyResult.keyMask}`
                      : ''}
                    {verifyResult.calledCount !== undefined ? ` · 已调 DeepSeek: ${verifyResult.calledCount} 题` : ''}
                  </p>
                )}
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

          {selectedDetail.groupType === 'grammar_cloze' && (grammarParseResult || grammarParseStatus === 'loading') && (
            <section className="detail-section" aria-label="AI 语法填空解析">
              <div className="detail-section-title">
                <span>Grammar AI</span>
                <h3>AI 语法填空解析</h3>
              </div>
              {grammarParseStatus === 'loading' && (
                <p className="detail-message">AI 语法填空解析中...</p>
              )}

              {grammarParseResult && (
                <>
                  {isOwnerView && (
                    <div className="reading-ai-actions">
                      <p className="detail-message">
                        {grammarParseSaveStatus === 'saved'
                          ? `已保存到本地题库${grammarParseResult.savedAt ? ` · ${formatSavedAt(grammarParseResult.savedAt)}` : ''}`
                          : '当前 AI 语法填空解析尚未保存，刷新后会丢失。'}
                      </p>
                      <button
                        className="save-button"
                        type="button"
                        disabled={
                          grammarParseSaveStatus === 'saving' ||
                          grammarParseSaveStatus === 'saved' ||
                          grammarParseStatus === 'loading'
                        }
                        onClick={onSaveGrammarParse}
                      >
                        <Save size={16} />
                        {grammarParseSaveStatus === 'saving'
                          ? '保存中'
                          : grammarParseSaveStatus === 'saved'
                            ? '已保存'
                            : '保存 AI 解析'}
                      </button>
                    </div>
                  )}
                  <p className="detail-message" style={{ marginBottom: 12 }}>
                    {grammarParseResult.parsedCount} / {grammarParseResult.questionCount} 空已解析
                  </p>
                  {isOwnerView && (
                    <p className="detail-message" style={{ marginBottom: 12 }}>
                      Provider: {grammarParseResult.provider ?? 'deepseek'} · 模型: {grammarParseResult.model || DEFAULT_AI_MODEL} ·
                      推理模式: {grammarParseResult.thinkingMode ? '开启' : '关闭'} ·
                      key 来源: {grammarParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                      call trace: {grammarParseResult.requestId || '（未返回）'}
                      {(grammarParseResult.keyFingerprint || grammarParseResult.keyMask)
                        ? ` · key 口令: ${grammarParseResult.keyFingerprint || grammarParseResult.keyMask}`
                        : ''}
                      {grammarParseResult.totalLatencyMs ? ` · 全量耗时: ${grammarParseResult.totalLatencyMs} ms` : ''}
                    </p>
                  )}
                  {grammarParseResult.fullTranslation && (
                    <div className="parse-mapping" style={{ marginBottom: 12 }}>
                      <strong>全文翻译</strong>
                      <p>{grammarParseResult.fullTranslation}</p>
                    </div>
                  )}
                </>
              )}

              {isOwnerView && grammarParseSaveStatus === 'error' && <p className="form-error">{grammarParseSaveError}</p>}
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
