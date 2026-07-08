/**
 * I14 Grammar-Fill Analysis Panel — right pad card for one focused blank.
 *
 * Layout (per locked decisions in plan.md, cloze-panel-polish info layering):
 *   Always-visible:
 *     - Header: 第 N 题 + blankType tag (有提示词 / 无提示词, chip) + hint (if given)
 *               + 考点 labelZh (chip)
 *     - 答案: answer badge
 *     - 代入: reason
 *     - Non-finite badges: role (成分中文) + path (快路/慢路) when present
 *   Collapsed by default — NAMED folds only, no anonymous「展开细节」drawer
 *   (owner decision 2026-07-08: every fold says what it holds):
 *     - 考点框架 (native <details>): generic per-facet framework — identical
 *       for every blank of the facet, so it folds to one line
 *     - 证据定位 (native <details>): evidence rows as clickable buttons with
 *       data-pi-evidence-id, data-pi-evidence-kind="support",
 *       data-pi-question-id (no option-side branch — grammar fill has no options)
 *   Not rendered: teachingNote (restates 代入; owner cut 2026-07-08 — data kept)
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
        // Same intro-collapse behavior as ClozeAnalysisPanel: open in the
        // empty state, one collapsed line once a blank is focused.
        <details className="pi-gf-group-overview" open={!hasActiveQuestion}>
          <summary className="pi-gf-group-overview-summary">文章简介</summary>
          <p className="pi-gf-group-overview-text">{groupView.overview}</p>
        </details>
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
            <span className="pi-gf-tag pi-gf-tag--type">
              {analysis.blankType === 'given' ? '有提示词' : '无提示词'}
            </span>
            {analysis.blankType === 'given' && analysis.hint && (
              <span className="pi-gf-blank-hint">提示词：{analysis.hint}</span>
            )}
            <span className="pi-gf-tag pi-gf-tag--facet">{analysis.labelZh}</span>
          </div>

          {/* Answer */}
          <div className="pi-gf-answer">
            <h4 className="pi-gf-section-title">答案</h4>
            <span className="pi-gf-answer-badge">{analysis.answer}</span>
          </div>

          {/* 考点框架 — generic per-facet teaching framework, identical for
              every blank of the same facet, so it must not occupy the card
              by default (owner decision 2026-07-08: fold, keep reachable for
              mid-lesson walkthroughs). key resets the native open state when
              focus moves to another blank. */}
          <details className="pi-gf-framework" key={analysis.questionId}>
            <summary className="pi-gf-framework-summary">考点框架</summary>
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
          </details>

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

          {/* 证据定位 — NAMED fold, same idiom as 文章简介/考点框架 (owner
              decision 2026-07-08: no anonymous「展开细节」drawer). All rows
              are passage-side (grammar fill has no options); the fold's real
              value is the click-to-highlight interaction. */}
          {analysis.evidenceRows.length > 0 && (
            <details className="pi-gf-evidence-fold" key={`ev-${analysis.questionId}`}>
              <summary className="pi-gf-evidence-summary">证据定位</summary>
              <div className="pi-gf-evidence-block">
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
                      <span className="pi-gf-evidence-type-label">{row.typeLabel}</span>
                      <blockquote className="pi-gf-evidence-quote">{row.signalText}</blockquote>
                      {row.relation && (
                        <p className="pi-gf-evidence-relation">{row.relation}</p>
                      )}
                    </button>
                  ))}
              </div>
            </details>
          )}

          {/* 解题提示 (teachingNote) is deliberately NOT rendered for
              grammar fill — it restates 代入 in different words every
              time (owner decision 2026-07-08). The field stays in the
              data/adapter; only the presentation drops it. */}
        </div>
      )}
    </div>
  )
}
