/**
 * I18 Writing Analysis Panel — right-pad card for writing group.
 *
 * Layout (v1, application task only):
 *   - 范文 / Model Answer block: full model answer with line breaks preserved.
 *   - 亮点表达 / 高分句块 list: each highlight as a card with text + note.
 *
 * Visual shell mirrors the existing analysis panels (GrammarFillAnalysisPanel,
 * ClozeAnalysisPanel) — same pi-ps-* outer containers, same section-title
 * pattern, no new design system invented.
 *
 * Owner handles visual polish post-QA; this is the "朴素能跑通" baseline.
 */

import type { ReactNode } from 'react'
import type { WritingAnalysis } from '../../domain/paperAsset.ts'

export type WritingAnalysisPanelProps = {
  analysis: WritingAnalysis
}

export function WritingAnalysisPanel({ analysis }: WritingAnalysisPanelProps): ReactNode {
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
      {analysis.highlightExpressions.length > 0 && (
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
