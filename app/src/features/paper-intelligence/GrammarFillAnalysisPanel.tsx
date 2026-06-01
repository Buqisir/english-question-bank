/**
 * I14 Grammar-Fill Analysis Panel — right pad card for one focused blank.
 *
 * Layout (per locked decisions in plan.md):
 *   - Group overview above the card (grammar-fill has no affectiveArc)
 *   - Header: 第 N 题 + blankType tag (有提示词 / 无提示词) + hint (if given)
 *             + 考点 label (labelZh)
 *   - 答案: answer
 *   - 考点框架: framework.steps (ordered list) + framework.table (non-finite only)
 *              + framework.notes (muted lines)
 *   - 代入: reason
 *   - Non-finite badges: role (成分中文) + path (快路/慢路) when present
 *   - 证据定位: evidence rows as clickable buttons with data-pi-evidence-id,
 *              data-pi-evidence-kind="support", data-pi-question-id
 *              (no option-side branch — grammar fill has no options)
 *   - teachingNote
 *
 * Mirrors ClozeAnalysisPanel.tsx pattern for harness integration.
 */

import type { ReactNode } from 'react'
import type {
  GrammarFillBlankAnalysisView,
  GrammarFillGroupView,
} from './grammarFillAnalysisSurfaceAdapter.ts'
import { ROLE_LABELS, PATH_LABELS } from './grammarFillAnalysisSurfaceAdapter.ts'

export type GrammarFillAnalysisPanelProps = {
  /** The blank currently focused (null = none selected yet). */
  analysis: GrammarFillBlankAnalysisView | null
  hasActiveQuestion: boolean
  activeEvidenceId: string | null
  groupView: GrammarFillGroupView | null
  onSelectEvidence: (evidenceId: string) => void
}

export function GrammarFillAnalysisPanel({
  analysis,
  hasActiveQuestion,
  activeEvidenceId,
  groupView,
  onSelectEvidence,
}: GrammarFillAnalysisPanelProps): ReactNode {
  return (
    <div className="pi-gf-panel">
      {groupView && (
        <div className="pi-gf-group-overview">
          <p className="pi-gf-group-overview-text">{groupView.overview}</p>
        </div>
      )}

      {!hasActiveQuestion && (
        <div className="pi-ps-analysis-empty">
          <p>点击左侧空格查看解析</p>
        </div>
      )}

      {hasActiveQuestion && !analysis && (
        <div className="pi-ps-analysis-empty pi-ps-analysis-empty--unpublished">
          <p>解析未发布</p>
        </div>
      )}

      {hasActiveQuestion && analysis && (
        <div className="pi-gf-blank-card" data-pi-question-id={analysis.questionId}>
          {/* Header */}
          <div className="pi-gf-blank-header">
            <span className="pi-gf-blank-no">第 {analysis.blankNo} 题</span>
            <span className="pi-gf-blank-type-tag">
              {analysis.blankType === 'given' ? '有提示词' : '无提示词'}
            </span>
            {analysis.blankType === 'given' && analysis.hint && (
              <span className="pi-gf-blank-hint">提示词：{analysis.hint}</span>
            )}
            <span className="pi-gf-blank-facet-label">{analysis.labelZh}</span>
          </div>

          {/* Answer */}
          <div className="pi-gf-answer">
            <h4 className="pi-gf-section-title">答案</h4>
            <span className="pi-gf-answer-text">{analysis.answer}</span>
          </div>

          {/* 考点框架 */}
          <div className="pi-gf-framework">
            <h4 className="pi-gf-section-title">考点框架</h4>
            {analysis.framework.steps.length > 0 && (
              <ol className="pi-gf-framework-steps">
                {analysis.framework.steps.map((step, i) => (
                  <li key={i} className="pi-gf-framework-step">
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {analysis.framework.table && (
              <div className="pi-gf-framework-table-wrapper">
                {analysis.framework.table.caption && (
                  <p className="pi-gf-framework-table-caption">
                    {analysis.framework.table.caption}
                  </p>
                )}
                <table className="pi-gf-framework-table">
                  <thead>
                    <tr>
                      {analysis.framework.table.columns.map((col, ci) => (
                        <th key={ci} className="pi-gf-framework-table-th">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.framework.table.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="pi-gf-framework-table-td">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {analysis.framework.notes && analysis.framework.notes.length > 0 && (
              <ul className="pi-gf-framework-notes">
                {analysis.framework.notes.map((note, i) => (
                  <li key={i} className="pi-gf-framework-note">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 代入 */}
          <div className="pi-gf-reason">
            <h4 className="pi-gf-section-title">代入</h4>
            <p className="pi-gf-reason-text">{analysis.reason}</p>
          </div>

          {/* Non-finite badges: role + path (only for grammar-fill.given.verb.non-finite) */}
          {(analysis.role || analysis.path) && (
            <div className="pi-gf-nonfinite-badges">
              {analysis.role && (
                <span className="pi-gf-badge pi-gf-badge--role">
                  {ROLE_LABELS[analysis.role] ?? analysis.role}
                </span>
              )}
              {analysis.path && (
                <span className="pi-gf-badge pi-gf-badge--path">
                  {PATH_LABELS[analysis.path] ?? analysis.path}
                </span>
              )}
            </div>
          )}

          {/* Evidence rows — all passage-side (grammar fill has no options) */}
          {analysis.evidenceRows.length > 0 && (
            <div className="pi-gf-evidence-block">
              <h4 className="pi-gf-section-title">证据定位</h4>
              {analysis.evidenceRows.map((row) => (
                <button
                  key={row.evidenceId}
                  type="button"
                  className={
                    row.evidenceId === activeEvidenceId
                      ? 'pi-gf-evidence pi-gf-evidence--selected'
                      : 'pi-gf-evidence'
                  }
                  data-pi-evidence-id={row.evidenceId}
                  data-pi-evidence-kind="support"
                  data-pi-question-id={analysis.questionId}
                  aria-pressed={row.evidenceId === activeEvidenceId}
                  onClick={() => onSelectEvidence(row.evidenceId)}
                >
                  <span className="pi-gf-evidence-type-label">{row.type}</span>
                  <blockquote className="pi-gf-evidence-quote">{row.signalText}</blockquote>
                  {row.relation && (
                    <p className="pi-gf-evidence-relation">{row.relation}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Teaching note */}
          {analysis.teachingNote && (
            <div className="pi-gf-teaching-note">
              <h4 className="pi-gf-section-title">解题提示</h4>
              <p>{analysis.teachingNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
