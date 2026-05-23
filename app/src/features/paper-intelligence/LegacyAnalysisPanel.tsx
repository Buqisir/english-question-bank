import type { ReactNode } from 'react'
import type {
  AnalysisDistractorRow,
  AnalysisView,
} from './preview/paperIntelligencePreviewModel'

export type LegacyAnalysisPanelProps = {
  analysis: AnalysisView | null
  activeEvidenceId: string | null
  onSelectEvidence: (evidenceId: string) => void
}

/**
 * Right-panel analysis renderer for legacy Paper Intelligence reports.
 *
 * Each rendered row carries `data-pi-evidence-id` (the host-owned PI namespace)
 * so the cross-column line geometry's right-side selector resolves them.
 */
export function LegacyAnalysisPanel({
  analysis,
  activeEvidenceId,
  onSelectEvidence,
}: LegacyAnalysisPanelProps): ReactNode {
  if (!analysis) {
    return (
      <div className="pi-ps-analysis-empty">
        <p>点击左侧题目查看解析</p>
      </div>
    )
  }

  return (
    <div className="pi-ps-analysis" data-pi-question-id={analysis.questionId}>
      <div className="pi-ps-analysis-header">
        <span className="pi-ps-analysis-qno">{analysis.questionNo}</span>
        <span className="pi-ps-analysis-type">{analysis.teacherQuestionType || '—'}</span>
        <span className="pi-ps-analysis-answer">答案 {analysis.answer}</span>
      </div>
      <div className="pi-ps-analysis-stem">
        <p>{analysis.stem}</p>
        {analysis.stemTranslation && (
          <p className="pi-ps-analysis-stem-zh">{analysis.stemTranslation}</p>
        )}
      </div>
      {analysis.optionsForDisplay.length > 0 && (
        <ul className="pi-ps-analysis-options">
          {analysis.optionsForDisplay.map((opt) => (
            <li
              key={opt.label}
              className={
                opt.label === analysis.answer
                  ? 'pi-ps-analysis-option pi-ps-analysis-option--correct'
                  : 'pi-ps-analysis-option'
              }
            >
              <span className="pi-ps-analysis-option-label">{opt.label}.</span>
              <span className="pi-ps-analysis-option-content">{opt.content}</span>
            </li>
          ))}
        </ul>
      )}
      {analysis.answerEvidenceQuote && analysis.supportEvidenceId && (
        <SupportEvidenceRow
          evidenceId={analysis.supportEvidenceId}
          questionId={analysis.questionId}
          quote={analysis.answerEvidenceQuote}
          explanationZh={analysis.answerEvidenceExplanationZh}
          isSelected={analysis.supportEvidenceId === activeEvidenceId}
          onSelectEvidence={onSelectEvidence}
        />
      )}
      {analysis.distractors.length > 0 && (
        <div className="pi-ps-analysis-distractors">
          <h4>干扰项分析</h4>
          <ul>
            {analysis.distractors.map((d) => (
              <DistractorRow
                key={d.evidenceId}
                row={d}
                questionId={analysis.questionId}
                isSelected={d.evidenceId === activeEvidenceId}
                onSelectEvidence={onSelectEvidence}
              />
            ))}
          </ul>
        </div>
      )}
      {analysis.synonymSummary && (
        <div className="pi-ps-analysis-synonym">
          <h4>同义替换</h4>
          <p>{analysis.synonymSummary}</p>
        </div>
      )}
    </div>
  )
}

function SupportEvidenceRow(props: {
  evidenceId: string
  questionId: string
  quote: string
  explanationZh: string
  isSelected: boolean
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { evidenceId, questionId, quote, explanationZh, isSelected, onSelectEvidence } = props
  const className = isSelected
    ? 'pi-ps-analysis-evidence pi-ps-analysis-evidence--selected'
    : 'pi-ps-analysis-evidence'
  return (
    <button
      type="button"
      className={className}
      data-pi-evidence-id={evidenceId}
      data-pi-evidence-kind="support"
      data-pi-question-id={questionId}
      aria-pressed={isSelected}
      onClick={() => onSelectEvidence(evidenceId)}
    >
      <h4>答案依据</h4>
      <blockquote>{quote}</blockquote>
      {explanationZh && (
        <p className="pi-ps-analysis-explanation">{explanationZh}</p>
      )}
    </button>
  )
}

function DistractorRow(props: {
  row: AnalysisDistractorRow
  questionId: string
  isSelected: boolean
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { row, questionId, isSelected, onSelectEvidence } = props

  // Text-only distractors: there is no left-side anchor for the line to connect
  // to, so the row stays a plain <div>.
  if (row.quoteIsTextOnly) {
    return (
      <li
        className="pi-ps-analysis-distractor"
        data-pi-evidence-id={row.evidenceId}
        data-pi-evidence-kind="trap"
        data-pi-question-id={questionId}
        data-pi-quote-text-only="true"
      >
        <span className="pi-ps-analysis-distractor-label">{row.optionLabel}.</span>
        <span>{row.shortReason}</span>
      </li>
    )
  }

  const className = isSelected
    ? 'pi-ps-analysis-distractor pi-ps-analysis-distractor--selected'
    : 'pi-ps-analysis-distractor'
  return (
    <li>
      <button
        type="button"
        className={className}
        data-pi-evidence-id={row.evidenceId}
        data-pi-evidence-kind="trap"
        data-pi-question-id={questionId}
        aria-pressed={isSelected}
        onClick={() => onSelectEvidence(row.evidenceId)}
      >
        <span className="pi-ps-analysis-distractor-label">{row.optionLabel}.</span>
        <span>{row.shortReason}</span>
        {row.quote && (
          <blockquote className="pi-ps-analysis-distractor-quote">{row.quote}</blockquote>
        )}
      </button>
    </li>
  )
}
