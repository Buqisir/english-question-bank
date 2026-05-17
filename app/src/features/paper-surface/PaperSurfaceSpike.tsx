/**
 * PaperSurfaceSpike — Technical spike prototype (NOT production code).
 *
 * This component demonstrates rendering a Paper Intelligence report JSON
 * in a formal exam-paper layout (A4-like, single-column, serif typography).
 * It also proves that the same DOM elements can carry data-pi-evidence-id
 * attributes for evidence line compatibility.
 *
 * This file can be deleted once the spike conclusions are recorded.
 */
import { useEffect, useState } from 'react'
import type {
  PaperIntelligenceReport,
  PassageReport,
  QuestionAnalysis,
} from '../paper-intelligence/paperIntelligenceTypes'
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
  const [input, setInput] = useState<InputJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
        setReport(reportData)
        setInput(inputData)
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

  if (loading) {
    return <div className="ps-loading">Loading paper surface preview...</div>
  }

  if (error) {
    return <div className="ps-error">Error: {error}</div>
  }

  if (!report || !input) {
    return <div className="ps-error">No data available.</div>
  }

  return (
    <div className="ps-paper">
      <div className="ps-spike-banner">
        SPIKE: Paper Surface prototype. This is a technical demonstration, not production UI.
      </div>

      <a
        className="ps-back-link"
        href="/"
        onClick={(e) => {
          e.preventDefault()
          window.history.replaceState(null, '', '/')
          window.location.reload()
        }}
      >
        &larr; Back to workbench
      </a>

      <header className="ps-header">
        <h1 className="ps-header-title">{report.sourcePaper.paperName}</h1>
        <p className="ps-header-subtitle">
          {report.sourcePaper.region} {report.sourcePaper.year} &mdash;{' '}
          {report.sourcePaper.section}
        </p>
      </header>

      {input.passages.map((inputPassage, pIdx) => {
        const reportPassage: PassageReport | undefined = report.passages[pIdx]
        return (
          <section key={inputPassage.paperSection}>
            <h2 className="ps-section-header">
              Section {inputPassage.paperSection}
              {inputPassage.passageTitle ? `: ${inputPassage.passageTitle}` : ''}
            </h2>

            <p className="ps-passage-body">{inputPassage.passageBody}</p>

            {inputPassage.questions.map((q, qIdx) => {
              const reportQuestion: QuestionAnalysis | undefined =
                reportPassage?.questions[qIdx]
              const evidenceId = reportQuestion
                ? `${effectivePaperId}-${reportQuestion.paperSection}-q${reportQuestion.questionNo}`
                : undefined

              // Determine if options are long enough to warrant single-column
              const maxOptionLen = Math.max(
                ...q.options.map((o) => o.content.length),
              )
              const useSingleCol = maxOptionLen > 40

              return (
                <div className="ps-question" key={q.questionNo}>
                  <p
                    className="ps-question-stem"
                    data-pi-question-id={reportQuestion?.questionNo}
                    data-pi-evidence-id={evidenceId}
                    data-pi-evidence-kind="stem"
                  >
                    <span className="ps-question-number">{q.questionNo}.</span>
                    {q.stem}
                  </p>
                  <ul
                    className={`ps-options${useSingleCol ? ' ps-options--single-col' : ''}`}
                  >
                    {q.options.map((opt) => (
                      <li className="ps-option" key={opt.label}>
                        <span className="ps-option-label">{opt.label}.</span>
                        {opt.content}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
