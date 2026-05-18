/**
 * PaperIntelligencePaperSurfaceHarness — Issue #21-C1.
 *
 * Host shell that mounts the production PaperSurface module inside the
 * Paper Intelligence route when `surface=paper` is active.
 *
 * Layout:
 *   - Left slot: PaperSurface (passage text + questions).
 *   - Right slot: existing PI analysis view (reused from PaperIntelligencePreview).
 *
 * Controlled state:
 *   - mode: hardcoded 'lecture' (reading mode lands in B4a).
 *   - lectureFocus: { kind: 'question', questionId, activeEvidenceId? }
 *     mapped from activeQuestionId.
 *   - readingFocusBySection: {} (empty, not used in C1).
 *   - annotations: [] (no annotation paint in C1).
 *   - onFocusIntent: handles 'request-lecture-focus' only; others ignored.
 *
 * Right Question Analysis:
 *   - Reuses the same data derivation (buildPreviewView) from the existing
 *     PI preview model so the teacher sees the same analysis panel.
 *
 * What this harness does NOT do:
 *   - No insight chip / popover.
 *   - No basket interaction.
 *   - No evidence line geometry.
 *   - No reading mode.
 *   - No annotation pack UI.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { buildPaperSurfaceDataFromPi } from './adapter/index.ts'
import {
  buildPreviewView,
  type AnalysisView,
} from './preview/paperIntelligencePreviewModel'
import type {
  PaperIntelligenceReport,
  QuestionOption,
} from './paperIntelligenceTypes'
import type { LectureFocus, PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'
import './paperIntelligencePaperSurfaceHarness.css'

type Props = {
  paperId: string | null
  onBackToWorkbench: () => void
}

export function PaperIntelligencePaperSurfaceHarness({
  paperId,
  onBackToWorkbench,
}: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [inputOptions, setInputOptions] = useState<Record<string, QuestionOption[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  // ─── Fetch report + input.json ───
  useEffect(() => {
    if (!paperId) {
      setError('未指定 paperId 参数。')
      setLoading(false)
      return
    }
    const reportUrl = `/reports/paper-intelligence/${paperId}/report.json`
    const inputUrl = `/reports/paper-intelligence/${paperId}/input.json`

    let cancelled = false

    async function load(): Promise<void> {
      try {
        const reportRes = await fetch(reportUrl)
        if (!reportRes.ok) throw new Error(`HTTP ${reportRes.status}`)
        const reportData = (await reportRes.json()) as PaperIntelligenceReport

        let bodiesData: Record<string, string> = {}
        let inputOptionsData: Record<string, QuestionOption[]> = {}
        try {
          const inputRes = await fetch(inputUrl)
          if (inputRes.ok) {
            const inputJson = (await inputRes.json()) as {
              passages?: Array<{
                paperSection?: string
                passageBody?: string
                questions?: Array<{
                  questionNo?: string
                  options?: Array<{ label?: string; content?: string }>
                }>
              }>
            }
            for (const p of inputJson?.passages || []) {
              if (p?.paperSection && typeof p.passageBody === 'string') {
                bodiesData[p.paperSection] = p.passageBody
              }
              if (p?.paperSection && Array.isArray(p.questions)) {
                for (const q of p.questions) {
                  if (!q?.questionNo || !Array.isArray(q.options)) continue
                  const opts: QuestionOption[] = []
                  for (const o of q.options) {
                    if (typeof o?.label === 'string' && typeof o?.content === 'string') {
                      opts.push({ label: o.label, content: o.content })
                    }
                  }
                  if (opts.length > 0) {
                    const qid = `${p.paperSection}-${q.questionNo}`
                    inputOptionsData[qid] = opts
                  }
                }
              }
            }
          }
        } catch {
          /* input.json missing is acceptable */
        }

        if (cancelled) return
        setReport(reportData)
        setBodies(bodiesData)
        setInputOptions(inputOptionsData)
        setLoading(false)
      } catch {
        if (cancelled) return
        setError(`未找到 Paper Intelligence 报告：${paperId}`)
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId])

  // ─── Build PaperSurface data props via adapter ───
  const surfaceData = useMemo(() => {
    if (!report) return null
    return buildPaperSurfaceDataFromPi({ report, bodies, inputOptions })
  }, [report, bodies, inputOptions])

  // ─── Build right-panel analysis view (reuse existing PI model) ───
  const analysisView = useMemo((): AnalysisView | null => {
    if (!report || !activeQuestionId) return null
    const view = buildPreviewView({ report, bodies, activeQuestionId, inputOptions })
    return view.activeAnalysis
  }, [report, bodies, activeQuestionId, inputOptions])

  // ─── Lecture focus (controlled) ───
  const lectureFocus: LectureFocus | null = useMemo(() => {
    if (!activeQuestionId) return null
    return { kind: 'question', questionId: activeQuestionId }
  }, [activeQuestionId])

  // ─── Focus intent handler ───
  const handleFocusIntent = useCallback((intent: PaperSurfaceFocusIntent) => {
    if (intent.kind === 'request-lecture-focus') {
      setActiveQuestionId((prev) =>
        prev === intent.questionId ? null : intent.questionId,
      )
    }
    // Other intents ignored in C1.
  }, [])

  // ─── Render ───
  if (loading) {
    return (
      <div className="pi-ps-harness">
        <div className="pi-ps-harness-topbar">
          <button type="button" className="pi-ps-harness-back" onClick={onBackToWorkbench}>
            <span aria-hidden="true">←</span> 返回工作台
          </button>
          <span className="pi-ps-harness-tagline">Paper Surface (C1)</span>
        </div>
        <div className="pi-ps-harness-loading">加载中…</div>
      </div>
    )
  }

  if (error || !report || !surfaceData) {
    return (
      <div className="pi-ps-harness">
        <div className="pi-ps-harness-topbar">
          <button type="button" className="pi-ps-harness-back" onClick={onBackToWorkbench}>
            <span aria-hidden="true">←</span> 返回工作台
          </button>
        </div>
        <div className="pi-ps-harness-error">
          <h2>未找到 Paper Intelligence 报告</h2>
          <p>{error || '报告数据为空。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pi-ps-harness">
      <div className="pi-ps-harness-topbar">
        <button type="button" className="pi-ps-harness-back" onClick={onBackToWorkbench}>
          <span aria-hidden="true">←</span> 返回工作台
        </button>
        <span className="pi-ps-harness-tagline">Paper Surface (C1)</span>
      </div>
      <div className="pi-ps-harness-shell">
        <div className="pi-ps-harness-left">
          <PaperSurface
            textMap={surfaceData.textMap}
            annotations={[]}
            evidence={surfaceData.evidence}
            questions={surfaceData.questions}
            mode="lecture"
            lectureFocus={lectureFocus}
            readingFocusBySection={{}}
            onFocusIntent={handleFocusIntent}
          />
        </div>
        <aside className="pi-ps-harness-right" aria-label="Question Analysis" aria-live="polite">
          <AnalysisPanel analysis={analysisView} />
        </aside>
      </div>
    </div>
  )
}

/* ─── Right panel: reuse existing PI analysis rendering ─── */

function AnalysisPanel({ analysis }: { analysis: AnalysisView | null }): ReactNode {
  if (!analysis) {
    return (
      <div className="pi-ps-analysis-empty">
        <p>点击左侧题目查看解析</p>
      </div>
    )
  }

  return (
    <div className="pi-ps-analysis">
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
      {analysis.answerEvidenceQuote && (
        <div className="pi-ps-analysis-evidence">
          <h4>答案依据</h4>
          <blockquote>{analysis.answerEvidenceQuote}</blockquote>
          {analysis.answerEvidenceExplanationZh && (
            <p className="pi-ps-analysis-explanation">{analysis.answerEvidenceExplanationZh}</p>
          )}
        </div>
      )}
      {analysis.distractors.length > 0 && (
        <div className="pi-ps-analysis-distractors">
          <h4>干扰项分析</h4>
          <ul>
            {analysis.distractors.map((d) => (
              <li key={d.evidenceId}>
                <span className="pi-ps-analysis-distractor-label">{d.optionLabel}.</span>
                <span>{d.shortReason}</span>
                {d.quote && <blockquote className="pi-ps-analysis-distractor-quote">{d.quote}</blockquote>}
              </li>
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
