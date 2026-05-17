/**
 * PaperSurfaceSpike -- Technical spike prototype (NOT production code).
 *
 * Two-panel interactive component that renders a Paper Intelligence report
 * in a formal exam-paper layout (left) with an analysis panel (right).
 * Reuses the PI data pipeline (buildPreviewView) and evidence line overlay.
 *
 * This file can be deleted once the spike conclusions are recorded.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  buildPreviewView,
  type AnalysisView,
  type AnalysisDistractorRow,
  type PassagePreviewView,
  type PassageSegment,
  type QuestionRow,
} from '../paper-intelligence/preview/paperIntelligencePreviewModel'
import { PaperIntelligenceEvidenceLine } from '../paper-intelligence/preview/paperIntelligenceEvidenceLine'
import type { PaperIntelligenceReport, QuestionOption } from '../paper-intelligence/paperIntelligenceTypes'
import './paperSurface.css'

type InputPassage = {
  paperSection: string
  passageTitle?: string
  passageBody: string
  questions: {
    questionNo: string
    stem: string
    options: { label: string; content: string }[]
    answer: string
  }[]
}

type InputJson = {
  sourcePaper: {
    paperId: string
    paperName: string
    year: number
    region: string
    section: string
  }
  passages: InputPassage[]
}

export function PaperSurfaceSpike({ paperId }: { paperId: string | null }) {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [inputOptions, setInputOptions] = useState<Record<string, QuestionOption[]>>({})
  const [input, setInput] = useState<InputJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  const shellRef = useRef<HTMLDivElement | null>(null)
  const mainScrollerRef = useRef<HTMLDivElement | null>(null)
  const sidePanelRef = useRef<HTMLElement | null>(null)

  const effectivePaperId = paperId || 'paper-2024-xkb1-reading'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const basePath = `/reports/paper-intelligence/${effectivePaperId}`

    Promise.all([
      fetch(`${basePath}/report.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch report.json: ${r.status}`)
        return r.json() as Promise<PaperIntelligenceReport>
      }),
      fetch(`${basePath}/input.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch input.json: ${r.status}`)
        return r.json() as Promise<InputJson>
      }),
    ])
      .then(([reportData, inputData]) => {
        if (cancelled) return

        // Build bodies and inputOptions maps from input.json
        const bodiesData: Record<string, string> = {}
        const inputOptionsData: Record<string, QuestionOption[]> = {}
        for (const p of inputData.passages || []) {
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

        setReport(reportData)
        setInput(inputData)
        setBodies(bodiesData)
        setInputOptions(inputOptionsData)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [effectivePaperId])

  // Build the view model using the same pipeline as PaperIntelligencePreview
  const view = useMemo(() => {
    if (!report) return null
    return buildPreviewView({ report, bodies, activeQuestionId, inputOptions })
  }, [report, bodies, activeQuestionId, inputOptions])

  // Reseed activeEvidenceId when activeQuestionId changes
  useEffect(() => {
    if (!activeQuestionId) {
      setActiveEvidenceId(null)
      return
    }
    const supportId = view?.activeAnalysis?.supportEvidenceId ?? null
    setActiveEvidenceId(supportId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestionId, view?.activeAnalysis?.supportEvidenceId])

  const handleSelectQuestion = (id: string): void => {
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  const handleSelectEvidence = (evidenceId: string): void => {
    if (!activeQuestionId) return
    setActiveEvidenceId(evidenceId)
  }

  if (loading) {
    return <div className="ps-loading">Loading paper surface preview...</div>
  }

  if (error) {
    return <div className="ps-error">Error: {error}</div>
  }

  if (!report || !input || !view) {
    return <div className="ps-error">No data available.</div>
  }

  return (
    <div className="ps-view">
      <div className="ps-spike-banner">
        SPIKE: Paper Surface prototype. This is a technical demonstration, not production UI.
      </div>

      <header className="ps-header">
        <h1 className="ps-header-title">{report.sourcePaper.paperName}</h1>
        <p className="ps-header-subtitle">
          {report.sourcePaper.region} {report.sourcePaper.year} &mdash;{' '}
          {report.sourcePaper.section}
        </p>
        <a
          className="ps-back-link"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            window.history.replaceState(null, '', '/')
            // Spike-acceptable: full reload discards React state. Production should
            // use the PI route's state-flip pattern (piOnBackToWorkbench callback
            // with history.replaceState + state setter, no reload).
            window.location.reload()
          }}
        >
          &larr; Back to workbench
        </a>
      </header>

      <div className="ps-shell" ref={shellRef}>
        <div className="ps-main ps-paper" ref={mainScrollerRef}>
          {view.passages.map((passageView) => (
            <PsSectionBlock
              key={passageView.paperSection}
              passageView={passageView}
              activeQuestionId={activeQuestionId}
              onSelectQuestion={handleSelectQuestion}
            />
          ))}
        </div>

        <aside className="ps-side" ref={sidePanelRef}>
          <PsAnalysisPanel
            analysis={view.activeAnalysis}
            activeEvidenceId={activeEvidenceId}
            onSelectEvidence={handleSelectEvidence}
          />
        </aside>

        {/* Evidence line: best-effort rendering. The CSS for pi-line-overlay is
            duplicated in paperSurface.css (scoped to .ps-shell) to enable absolute
            positioning of the SVG overlay. Geometry may still be unstable if
            layout dimensions differ significantly from the original PI panel
            proportions, since the evidence line hook uses getBoundingClientRect
            relative to the container. The component is mounted so evidence
            connections render when DOM anchors align. */}
        <PaperIntelligenceEvidenceLine
          containerRef={shellRef}
          leftScrollerRef={mainScrollerRef}
          rightPanelRef={sidePanelRef}
          activeQuestionId={activeQuestionId}
          activeEvidenceId={activeEvidenceId}
        />
      </div>
    </div>
  )
}

/* --- Passage Section (left panel) --- */

function PsSectionBlock(props: {
  passageView: PassagePreviewView
  activeQuestionId: string | null
  onSelectQuestion: (id: string) => void
}): ReactNode {
  const { passageView, activeQuestionId, onSelectQuestion } = props

  return (
    <section className="ps-section">
      <h2 className="ps-section-label">{passageView.paperSection}</h2>

      <div className="ps-passage-body">
        {passageView.segments.length === 0 ? (
          <span>{passageView.passageBody}</span>
        ) : (
          passageView.segments.map((seg, i) => {
            if (seg.kind === 'text') {
              return <span key={i}>{seg.text}</span>
            }
            return (
              <mark
                key={i}
                className={
                  seg.evidenceKind === 'support'
                    ? 'ps-ev-highlight ps-ev-highlight--support'
                    : 'ps-ev-highlight ps-ev-highlight--trap'
                }
                data-pi-evidence-id={seg.evidenceId}
                data-pi-question-id={seg.questionId}
                data-pi-evidence-kind={seg.evidenceKind}
                data-pi-option-label={seg.optionLabel ?? undefined}
              >
                {seg.text}
              </mark>
            )
          })
        )}
      </div>

      {passageView.questions.map((row) => {
        const isActive = row.questionId === activeQuestionId
        const maxOptionLen = Math.max(
          ...row.optionsForDisplay.map((o) => o.content.length),
          0,
        )
        const useSingleCol = maxOptionLen > 40

        return (
          <div
            key={row.questionId}
            className={`ps-question${isActive ? ' ps-question--active' : ''}`}
            onClick={() => onSelectQuestion(row.questionId)}
            data-pi-question-id={row.questionId}
          >
            <span className={`ps-question-number${isActive ? ' ps-question-number--active' : ''}`}>
              {row.questionNo}.
            </span>
            <span className="ps-question-stem">{row.stem}</span>
            <div className={`ps-options${useSingleCol ? ' ps-options--single-col' : ''}`}>
              {row.optionsForDisplay.map((opt) => (
                <div className="ps-option" key={opt.label}>
                  {opt.label}. {opt.content}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/* --- Analysis Panel (right panel) --- */

function PsAnalysisPanel(props: {
  analysis: AnalysisView | null
  activeEvidenceId: string | null
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { analysis, activeEvidenceId, onSelectEvidence } = props

  if (!analysis) {
    return <div className="ps-analysis-empty">Click a question to see analysis</div>
  }

  // Build distractor map by option label
  const distractorMap = new Map<string, AnalysisDistractorRow>()
  for (const d of analysis.distractors) {
    distractorMap.set(d.optionLabel, d)
  }

  // Build option content map
  const optionContentMap = new Map<string, string>()
  for (const opt of analysis.optionsForDisplay) {
    optionContentMap.set(opt.label, opt.content)
  }

  const allLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="ps-analysis" data-pi-question-id={analysis.questionId}>
      <div className="ps-analysis-head">
        <span className="ps-analysis-qno">Q{analysis.questionNo}</span>
        <span className="ps-analysis-type">{analysis.teacherQuestionType}</span>
        <span className="ps-analysis-answer">Answer {analysis.answer}</span>
      </div>

      <p className="ps-analysis-stem">{analysis.stem}</p>
      {analysis.stemTranslation && (
        <p className="ps-analysis-stem-zh">{analysis.stemTranslation}</p>
      )}

      <div className="ps-analysis-section-label">Option Analysis</div>

      {allLabels.map((label) => {
        const isCorrect = label === analysis.answer
        const distractor = distractorMap.get(label)

        if (isCorrect) {
          const evidenceId = analysis.supportEvidenceId
          const isSelected = evidenceId !== null && evidenceId === activeEvidenceId

          return (
            <button
              key={label}
              type="button"
              className={`ps-option-block ps-option-block--correct${isSelected ? ' ps-option-block--selected' : ''}`}
              data-pi-evidence-id={evidenceId ?? undefined}
              data-pi-evidence-kind="support"
              data-pi-question-id={analysis.questionId}
              data-pi-option-label={label}
              aria-pressed={isSelected}
              onClick={() => evidenceId && onSelectEvidence(evidenceId)}
            >
              <div className="ps-option-block-head">
                <span className="ps-option-block-label ps-option-block-label--correct">{label}</span>
                <span className="ps-option-block-tag--correct">Correct</span>
              </div>
              <div className="ps-option-block-content">{optionContentMap.get(label) || '-'}</div>
              <div className="ps-option-block-explanation">
                {analysis.answerEvidenceExplanationZh || '-'}
              </div>
              {analysis.synonymSummary && (
                <div className="ps-option-block-synonym">
                  <span className="ps-option-block-synonym-tag">Synonym</span>
                  {analysis.synonymSummary}
                </div>
              )}
            </button>
          )
        }

        // Distractor block
        if (!distractor) {
          return (
            <div
              key={label}
              className="ps-option-block"
              data-pi-question-id={analysis.questionId}
              data-pi-option-label={label}
            >
              <div className="ps-option-block-head">
                <span className="ps-option-block-label">{label}</span>
              </div>
              <div className="ps-option-block-content">{optionContentMap.get(label) || '-'}</div>
              <div className="ps-option-block-explanation">No analysis data</div>
            </div>
          )
        }

        const isTextOnly = distractor.quoteIsTextOnly
        const evidenceId = distractor.evidenceId
        const isSelected = evidenceId === activeEvidenceId

        if (isTextOnly) {
          return (
            <div
              key={label}
              className="ps-option-block ps-option-block--wrong"
              data-pi-evidence-id={evidenceId}
              data-pi-evidence-kind="trap"
              data-pi-question-id={analysis.questionId}
              data-pi-option-label={label}
              data-pi-quote-text-only="true"
            >
              <div className="ps-option-block-head">
                <span className="ps-option-block-label ps-option-block-label--wrong">{label}</span>
                {distractor.category && (
                  <span className="ps-option-block-cat">
                    {distractor.category}
                    {distractor.subtype ? ` / ${distractor.subtype}` : ''}
                  </span>
                )}
              </div>
              <div className="ps-option-block-content">{optionContentMap.get(label) || '-'}</div>
              <div className="ps-option-block-explanation">{distractor.shortReason}</div>
            </div>
          )
        }

        return (
          <button
            key={label}
            type="button"
            className={`ps-option-block ps-option-block--wrong${isSelected ? ' ps-option-block--selected' : ''}`}
            data-pi-evidence-id={evidenceId}
            data-pi-evidence-kind="trap"
            data-pi-question-id={analysis.questionId}
            data-pi-option-label={label}
            aria-pressed={isSelected}
            onClick={() => onSelectEvidence(evidenceId)}
          >
            <div className="ps-option-block-head">
              <span className="ps-option-block-label ps-option-block-label--wrong">{label}</span>
              {distractor.category && (
                <span className="ps-option-block-cat">
                  {distractor.category}
                  {distractor.subtype ? ` / ${distractor.subtype}` : ''}
                </span>
              )}
            </div>
            <div className="ps-option-block-content">{optionContentMap.get(label) || '-'}</div>
            <div className="ps-option-block-explanation">{distractor.shortReason}</div>
          </button>
        )
      })}

      <div className="ps-analysis-backstage">
        <span className="ps-analysis-backstage-tag">{analysis.tCard}</span>
        {analysis.confidence != null && (
          <span className="ps-analysis-backstage-tag">
            confidence {analysis.confidence.toFixed(2)}
          </span>
        )}
        {analysis.reviewNeeded && (
          <span className="ps-analysis-backstage-tag ps-analysis-review">Needs review</span>
        )}
      </div>
    </div>
  )
}
