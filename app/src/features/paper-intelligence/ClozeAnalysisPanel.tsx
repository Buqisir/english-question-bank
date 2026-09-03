/**
 * I9 Cloze Analysis Panel — right pad card for one focused blank.
 *
 * Layout (per locked decisions in plan.md, cloze-panel-polish info layering):
 *   Always-visible:
 *     - Header: blank no + pos/考点 tag (chip) + optional signature label (chip)
 *     - Answer: optionLabel badge + one-line reason
 *     - Distractor analysis list (label + optionText + contextual explanation)
 *   Collapsed by default — NAMED folds only, no anonymous「展开细节」drawer
 *   (owner decision 2026-07-08: every fold says what it holds):
 *     - 证据定位 (native <details>): evidence rows
 *       * Passage-side (signalSide != 'option'): evidence button → highlights passage
 *       * Option-side (signalSide === 'option'): in-card <mark> via renderOptionTextWithMark
 *   Not rendered: teachingNote (restates the reason; owner cut — data kept)
 *
 * Group overview / affectiveArc is rendered above the card when provided.
 */

import type { ReactNode } from 'react'
import type {
  ClozeBlankAnalysisView,
  ClozeGroupView,
} from './clozeAnalysisSurfaceAdapter.ts'

export type ClozeAnalysisPanelProps = {
  /** The blank currently focused (null = none selected yet). */
  analysis: ClozeBlankAnalysisView | null
  hasActiveQuestion: boolean
  activeEvidenceId: string | null
  groupView: ClozeGroupView | null
  onSelectEvidence: (evidenceId: string) => void
}

export function ClozeAnalysisPanel({
  analysis,
  hasActiveQuestion,
  activeEvidenceId,
  groupView,
  onSelectEvidence,
}: ClozeAnalysisPanelProps): ReactNode {
  return (
    <div className="pi-cloze-panel">
      {groupView && (
        // Passage-level intro: open while no blank is focused (the natural
        // read-the-arc moment), auto-collapses to one line once a blank is
        // selected so per-blank reading never re-scrolls through it.
        <details className="pi-cloze-group-overview" open={!hasActiveQuestion}>
          <summary className="pi-cloze-group-overview-summary">文章简介</summary>
          <p className="pi-cloze-group-overview-text">{groupView.overview}</p>
          {groupView.affectiveArc && (
            <p className="pi-cloze-group-arc">{groupView.affectiveArc}</p>
          )}
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
        <div className="pi-cloze-blank-card" data-pi-question-id={analysis.questionId}>
          {/* Header */}
          <div className="pi-cloze-blank-header">
            <span className="pi-cloze-blank-no">第 {analysis.blankNo} 题</span>
            <span className="pi-cloze-tag pi-cloze-tag--pos">{analysis.pos}</span>
            {analysis.signatureLabel && (
              <span className="pi-cloze-tag pi-cloze-tag--sig">{analysis.signatureLabel}</span>
            )}
          </div>

          {/* Answer (always visible) */}
          <div className="pi-cloze-correct-fit">
            <h4 className="pi-cloze-section-title">答案解析</h4>
            <div className="pi-cloze-answer-row">
              {analysis.correctFit.optionLabel && (
                <span className="pi-cloze-answer-badge">
                  {analysis.correctFit.optionLabel}
                </span>
              )}
              <p className="pi-cloze-fit-reason">{analysis.correctFit.reason}</p>
            </div>
          </div>

          {/* Distractor analysis (always visible, compact) */}
          {analysis.distractorGlosses.length > 0 && (
            <div className="pi-cloze-distractors">
              <h4 className="pi-cloze-section-title">干扰项辨析</h4>
              <ul className="pi-cloze-distractor-list">
                {analysis.distractorGlosses.map((gloss) => (
                  <li key={gloss.optionLabel} className="pi-cloze-distractor-item">
                    <span className="pi-cloze-distractor-label">{gloss.optionLabel}.</span>
                    <span className="pi-cloze-distractor-text">{gloss.optionText}</span>
                    <span className="pi-cloze-distractor-dash" aria-hidden="true">—</span>
                    <span className="pi-cloze-distractor-meaning">{gloss.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 证据定位 — a NAMED fold (owner decision 2026-07-08: no anonymous
              「展开细节」drawer; every fold says what it holds, same idiom as
              文章简介/考点框架). Evidence text restates the answer reason —
              the fold's real value is the click-to-highlight interaction.
              key resets the open state when focus moves to another blank. */}
          {analysis.evidenceRows.length > 0 && (
            <details className="pi-cloze-evidence-fold" key={`ev-${analysis.questionId}`}>
              <summary className="pi-cloze-evidence-summary">证据定位</summary>
              <div className="pi-cloze-evidence-block">
                {analysis.evidenceRows.map((row) =>
                    row.isOptionSide ? (
                      // Option-side: in-card <mark>, no passage anchor button.
                      <div
                        key={row.evidenceId}
                        className="pi-cloze-evidence-option"
                        data-evidence-type={row.type}
                      >
                        <span className="pi-cloze-evidence-type-label">{row.typeLabel}</span>
                        <span className="pi-cloze-evidence-option-text">
                          {renderOptionTextWithMark(
                            row.signalText,
                            getOptionTextForSignal(row.signalText, analysis.optionTextByLabel),
                          )}
                        </span>
                        {row.relation && (
                          <p className="pi-cloze-evidence-relation">{row.relation}</p>
                        )}
                      </div>
                    ) : (
                      // Passage-side: clickable button that drives cross-column line.
                      <button
                        key={row.evidenceId}
                        type="button"
                        className={
                          row.evidenceId === activeEvidenceId
                            ? 'pi-cloze-evidence pi-cloze-evidence--selected'
                            : 'pi-cloze-evidence'
                        }
                        data-pi-evidence-id={row.evidenceId}
                        data-pi-evidence-kind="support"
                        data-pi-question-id={analysis.questionId}
                        aria-pressed={row.evidenceId === activeEvidenceId}
                        onClick={() => onSelectEvidence(row.evidenceId)}
                      >
                        <span className="pi-cloze-evidence-type-label">{row.typeLabel}</span>
                        <blockquote className="pi-cloze-evidence-quote">{row.signalText}</blockquote>
                        {row.relation && (
                          <p className="pi-cloze-evidence-relation">{row.relation}</p>
                        )}
                      </button>
                    ),
                  )}
              </div>
            </details>
          )}

          {/* 解题提示 (teachingNote) is deliberately NOT rendered — it
              restates the answer reason in different words every time
              (owner decision 2026-07-08, same call as grammar fill).
              The field stays in the data/adapter. */}
        </div>
      )}
    </div>
  )
}

/**
 * Find which option text contains the signal text and return a marked version.
 * Falls back to rendering the signal text directly if not found in any option.
 */
function getOptionTextForSignal(
  signalText: string,
  optionTextByLabel: Record<string, string>,
): string {
  for (const text of Object.values(optionTextByLabel)) {
    if (text.includes(signalText)) return text
  }
  return signalText
}

/**
 * Render an option text string with the signal text highlighted via <mark>.
 * Mirrors `renderOptionTextWithSignals` from SevenChoicesAnalysisPanel.tsx.
 */
function renderOptionTextWithMark(signalText: string, optionText: string): ReactNode {
  if (!signalText) return optionText
  const start = optionText.indexOf(signalText)
  if (start === -1) return optionText
  const parts: ReactNode[] = []
  if (start > 0) parts.push(optionText.slice(0, start))
  parts.push(
    <mark key="signal" className="pi-cloze-option-signal">
      {optionText.slice(start, start + signalText.length)}
    </mark>,
  )
  if (start + signalText.length < optionText.length) {
    parts.push(optionText.slice(start + signalText.length))
  }
  return parts
}
