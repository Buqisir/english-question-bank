import type { ReactNode } from 'react'
import type { PaperAssetQuestionAnalysisView } from './paperAssetSurfaceAdapter.ts'

export type PaperAssetAnalysisPanelProps = {
  analysis: PaperAssetQuestionAnalysisView | null
  hasActiveQuestion: boolean
  activeOptionLabel: string | null
  activeEvidenceId: string | null
  onSelectOption: (optionLabel: string, evidenceId: string | null) => void
  onSelectEvidence: (evidenceId: string) => void
}

/**
 * C6a-4 right panel for reviewed paper-asset analysis.
 *
 * This panel consumes only `reading-choice-analysis-v1.json`. When the
 * selected question exists on the paper but the reviewed analysis slice does
 * not contain it, the panel shows "解析未发布" instead of inventing an
 * answer-key explanation or falling back to legacy sidecars.
 */
export function PaperAssetAnalysisPanel({
  analysis,
  hasActiveQuestion,
  activeOptionLabel,
  activeEvidenceId,
  onSelectOption,
  onSelectEvidence,
}: PaperAssetAnalysisPanelProps): ReactNode {
  if (!hasActiveQuestion) {
    return (
      <div className="pi-ps-analysis-empty">
        <p>点击左侧题目查看解析</p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="pi-ps-analysis-empty pi-ps-analysis-empty--unpublished">
        <p>解析未发布</p>
      </div>
    )
  }

  const activeLabel = analysis.options.some((option) => option.label === activeOptionLabel)
    ? activeOptionLabel
    : analysis.answer

  return (
    <div className="pi-ps-analysis" data-pi-question-id={analysis.questionId}>
      <div className="pi-ps-analysis-header">
        <span className="pi-ps-analysis-qno">{analysis.questionNo}</span>
        <span className="pi-ps-analysis-type">{analysis.skillLabel}</span>
        <span className="pi-ps-analysis-answer">答案 {analysis.answer}</span>
      </div>
      <div className="pi-ps-analysis-stem">
        <p>{analysis.stem}</p>
        <p className="pi-ps-analysis-stem-zh">{analysis.stemTranslationZh}</p>
      </div>
      <ul className="pi-ps-analysis-options pi-ps-analysis-options--accordion">
        {analysis.options.map((option) => {
          const isActive = option.label === activeLabel
          const isCorrect = option.status === 'correct'
          const nextEvidenceId = isCorrect
            ? analysis.supportEvidenceId
            : option.trapEvidenceRows[0]?.evidenceId ?? null
          const hasUnsupportedNoLine =
            option.trapPrimaryType === 'unsupportedClaim' && option.trapEvidenceRows.length === 0

          return (
            <li
              key={option.label}
              className={[
                'pi-ps-analysis-option-section',
                isCorrect ? 'pi-ps-analysis-option-section--correct' : 'pi-ps-analysis-option-section--wrong',
                isActive ? 'pi-ps-analysis-option-section--active' : '',
              ].filter(Boolean).join(' ')}
              data-pi-option-label={option.label}
            >
              <button
                type="button"
                className="pi-ps-analysis-option-row"
                aria-expanded={isActive}
                aria-pressed={isActive}
                onClick={() => onSelectOption(option.label, nextEvidenceId)}
              >
                <span className="pi-ps-analysis-option-label">{option.label}.</span>
                <span className="pi-ps-analysis-option-body">
                  <span className="pi-ps-analysis-option-content">{option.text}</span>
                  {option.translationZh && (
                    <span className="pi-ps-analysis-option-zh">{option.translationZh}</span>
                  )}
                </span>
                {isCorrect ? (
                  <span className="pi-ps-analysis-option-badge pi-ps-analysis-option-badge--correct">
                    ✓
                  </span>
                ) : option.trapLabel ? (
                  <span className="pi-ps-analysis-option-badge pi-ps-analysis-option-badge--trap">
                    {option.trapLabel}
                  </span>
                ) : null}
              </button>

              {isActive && (
                <div className="pi-ps-analysis-option-detail">
                  {isCorrect ? (
                    <>
                      <h4>答案依据</h4>
                      {analysis.supportEvidenceRows.map((row) => (
                        <button
                          key={row.evidenceId}
                          type="button"
                          className={
                            row.evidenceId === activeEvidenceId
                              ? 'pi-ps-analysis-evidence pi-ps-analysis-evidence--selected'
                              : 'pi-ps-analysis-evidence'
                          }
                          data-pi-evidence-id={row.evidenceId}
                          data-pi-evidence-kind="support"
                          data-pi-question-id={analysis.questionId}
                          aria-pressed={row.evidenceId === activeEvidenceId}
                          onClick={() => onSelectEvidence(row.evidenceId)}
                        >
                          <blockquote>{row.quote}</blockquote>
                        </button>
                      ))}
                      {analysis.locationParaphrases.length > 0 && (
                        <div className="pi-ps-analysis-synonym">
                          <h4>定位关系 / 同义替换</h4>
                          <ul className="pi-ps-analysis-paraphrases">
                            {analysis.locationParaphrases.map((item, index) => (
                              <li key={`${item.sourceText}-${index}`}>
                                <span>{item.sourceText}</span>
                                <span aria-hidden="true"> → </span>
                                <strong>{item.targetText}</strong>
                                {item.note && <p>{item.note}</p>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : option.trapRowSuspended ? null : (
                    <>
                      <h4>干扰解析</h4>
                      <div className="pi-ps-analysis-trap-meta">
                        {option.trapSecondaryLabel && <span>兼有：{option.trapSecondaryLabel}</span>}
                        {option.trapSubtype && <span>细分：{option.trapSubtype}</span>}
                      </div>
                      {option.trapExplanation && (
                        <p className="pi-ps-analysis-explanation">{option.trapExplanation}</p>
                      )}
                      {option.trapEvidenceRows.map((row) => (
                        <button
                          key={row.evidenceId}
                          type="button"
                          className={
                            row.evidenceId === activeEvidenceId
                              ? 'pi-ps-analysis-distractor pi-ps-analysis-distractor--selected'
                              : 'pi-ps-analysis-distractor'
                          }
                          data-pi-evidence-id={row.evidenceId}
                          data-pi-evidence-kind="trap"
                          data-pi-question-id={analysis.questionId}
                          aria-pressed={row.evidenceId === activeEvidenceId}
                          onClick={() => onSelectEvidence(row.evidenceId)}
                        >
                          <blockquote className="pi-ps-analysis-distractor-quote">
                            {row.quote}
                          </blockquote>
                        </button>
                      ))}
                      {hasUnsupportedNoLine && (
                        <p className="pi-ps-analysis-no-line">
                          原文未提及。此选项不连接原文证据线。
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {analysis.questionFocus && (
        <div className="pi-ps-analysis-question-focus">
          <h4>考点</h4>
          <p>{analysis.questionFocus}</p>
        </div>
      )}
    </div>
  )
}
