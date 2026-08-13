/**
 * I18/I19 Writing Analysis Panel — right-pad card for writing group.
 *
 * Layout by taskType:
 *
 * application (I18):
 *   - 范文 / Model Answer block: full model answer with line breaks preserved.
 *   - 亮点表达 / 高分句块 list: each highlight as a card with text + note.
 *
 * continuation (I19, historical assets only):
 *   - 范文 / Model Answer block: two paragraphs with line breaks preserved.
 *   - 情节设计思路 / Continuation Design: theme one line + 第1段/第2段 design notes.
 *   - 亮点表达 / 高分句块 list: each highlight as a card with text + note.
 * New narrative continuation lecture uses ContinuationAnalysisPanel.
 *
 * Visual shell mirrors the existing analysis panels (GrammarFillAnalysisPanel,
 * ClozeAnalysisPanel) — same pi-ps-* outer containers, same section-title
 * pattern, no new design system invented.
 *
 * Owner handles visual polish post-QA; this is the "朴素能跑通" baseline.
 */

import type { ReactNode } from 'react'
import type {
  ApplicationWritingAnalysis,
  ContinuationWritingAnalysisLegacy,
  HighlightExpression,
} from '../../domain/paperAsset.ts'

type LegacyApplicationWritingAnalysis = ApplicationWritingAnalysis & {
  highlightExpressions: HighlightExpression[]
}

export type WritingAnalysisPanelProps = {
  analysis: LegacyApplicationWritingAnalysis | ContinuationWritingAnalysisLegacy
}

export function WritingAnalysisPanel({ analysis }: WritingAnalysisPanelProps): ReactNode {
  if (analysis.taskType === 'continuation') {
    return (
      <div className="pi-writing-panel">
        {/* 范文 / Model Answer */}
        <div className="pi-writing-section">
          <h4 className="pi-writing-section-title">范文 / Model Answer</h4>
          <div className="pi-writing-model-answer">
            {analysis.modelAnswer.split('\n').map((line, i) => (
              <p key={i} className="pi-writing-model-answer-line">
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* 情节设计思路 / Continuation Design */}
        <div className="pi-writing-section">
          <h4 className="pi-writing-section-title">情节设计思路 / Continuation Design</h4>
          <p className="pi-writing-continuation-theme">{analysis.continuationDesign.theme}</p>
          <ul className="pi-writing-continuation-paragraphs">
            {analysis.continuationDesign.paragraphs.map((para, i) => (
              <li key={i} className="pi-writing-continuation-paragraph-item">
                <span className="pi-writing-continuation-paragraph-label">
                  {i === 0 ? '第1段' : '第2段'}
                </span>
                <p className="pi-writing-continuation-paragraph-text">{para}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* 亮点表达 */}
        {(analysis.highlightExpressions?.length ?? 0) > 0 && (
          <div className="pi-writing-section">
            <h4 className="pi-writing-section-title">亮点表达 / 高分句块</h4>
            <ul className="pi-writing-highlights">
              {analysis.highlightExpressions.map((expr, i) => (
                <li key={i} className="pi-writing-highlight-item">
                  <p className="pi-writing-highlight-text">{expr.text}</p>
                  <p className="pi-writing-highlight-note">{expr.note}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // application branch — untouched from I18
  return (
    <div className="pi-writing-panel">
      {/* 范文 / Model Answer */}
      <div className="pi-writing-section">
        <h4 className="pi-writing-section-title">范文 / Model Answer</h4>
        <div className="pi-writing-model-answer">
          {analysis.modelAnswer.split('\n').map((line, i) => (
            <p key={i} className="pi-writing-model-answer-line">
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* 亮点表达 */}
      {(analysis.highlightExpressions?.length ?? 0) > 0 && (
        <div className="pi-writing-section">
          <h4 className="pi-writing-section-title">亮点表达 / 高分句块</h4>
          <ul className="pi-writing-highlights">
            {analysis.highlightExpressions.map((expr, i) => (
              <li key={i} className="pi-writing-highlight-item">
                <p className="pi-writing-highlight-text">{expr.text}</p>
                <p className="pi-writing-highlight-note">{expr.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
