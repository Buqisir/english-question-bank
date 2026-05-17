/**
 * PaperIntelligencePreview — interactive teacher-facing preview of a
 * Paper Intelligence V0 report (V1 layout).
 *
 * Cut summary:
 *   - Two-column shell: passages on the left, sticky Analysis Panel on
 *     the right.
 *   - Clicking a question row sets `activeQuestionId`, which highlights
 *     that question's evidence quotes inside the passage and renders
 *     the right panel.
 *   - V1 only does highlighting. No cross-column dotted lines, no
 *     animations, no auto-scroll. DOM anchors (`data-pi-*`) are placed
 *     so V2 can wire up the LinkOverlay-style system later.
 *
 * Routing: still `?view=paper-intelligence&paperId=<id>` — no new
 * demo route, no new view param. The route parser is unchanged.
 *
 * Architecture:
 *   - All evidence/quote logic lives in `./preview/paperIntelligencePreviewModel`.
 *   - That module uses the existing evidence adapter (`toEvidenceModel`,
 *     `selectEvidence`) — this component never calls passage substring
 *     lookups or any other quote-matching primitive directly.
 *   - This file: fetch + state + render. Nothing else.
 *
 * Why we kept the read-only PassageSection: the existing loads / outline /
 * key-chunks / per-question detail card carries information teachers
 * still need (篇章负荷一览, key chunks, etc.). Those continue to render
 * below the new clickable question list. The V1 cut adds interactivity
 * without removing the existing summary rows.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  PaperIntelligenceReport,
  PassageReport,
  LoadBar,
  QuestionAnalysis,
  KeyChunk,
} from './paperIntelligenceTypes'
import {
  buildPreviewView,
  buildQuestionId,
  type AnalysisDistractorRow,
  type AnalysisView,
  type PassagePreviewView,
  type PassageSegment,
  type QuestionRow,
} from './preview/paperIntelligencePreviewModel'
import './paperIntelligence.css'

type Props = {
  paperId: string | null
}

/** Top-level container. Owns:
 *   - the report fetch
 *   - the optional input.json fetch (passageBody for highlighting)
 *   - the `activeQuestionId` state
 *   - the memoized preview view (built from report+bodies+activeQuestionId)
 *
 * The component does not maintain any evidence-level active state —
 * everything keys off `activeQuestionId`. Per reviewer guidance, V1
 * does not introduce a separate `activeEvidenceId`.
 */
export function PaperIntelligencePreview({ paperId }: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  // fetch report + (best-effort) input.json with passageBody
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

        // input.json is best-effort: if it's missing, V1 still renders
        // passages and questions, just without quote highlighting.
        let bodiesData: Record<string, string> = {}
        try {
          const inputRes = await fetch(inputUrl)
          if (inputRes.ok) {
            const inputJson = (await inputRes.json()) as {
              passages?: Array<{ paperSection?: string; passageBody?: string }>
            }
            for (const p of inputJson?.passages || []) {
              if (p?.paperSection && typeof p.passageBody === 'string') {
                bodiesData[p.paperSection] = p.passageBody
              }
            }
          }
        } catch {
          /* swallow — bodiesData stays {} and component degrades gracefully */
        }

        if (cancelled) return
        setReport(reportData)
        setBodies(bodiesData)
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

  // derive view model
  const view = useMemo(() => {
    if (!report) return null
    return buildPreviewView({ report, bodies, activeQuestionId })
  }, [report, bodies, activeQuestionId])

  if (loading) {
    return (
      <div className="pi-view">
        <div className="pi-error">
          <p>加载中…</p>
        </div>
      </div>
    )
  }

  if (error || !report || !view) {
    return (
      <div className="pi-view">
        <div className="pi-error">
          <h2>未找到 Paper Intelligence 报告</h2>
          <p>{error || '报告数据为空。'}</p>
        </div>
      </div>
    )
  }

  const handleSelectQuestion = (id: string): void => {
    // toggle off when clicking the same row again so teachers can clear
    // the highlight without scrolling to the empty-state panel
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="pi-view">
      <ReportHeader report={report} />
      <div className="pi-shell">
        <div className="pi-main">
          {view.passages.map((passageView) => {
            const reportPassage = report.passages.find(
              (rp) => rp.paperSection === passageView.paperSection,
            )
            return (
              <PassageSection
                key={passageView.paperSection}
                passageView={passageView}
                reportPassage={reportPassage}
                activeQuestionId={activeQuestionId}
                onSelectQuestion={handleSelectQuestion}
              />
            )
          })}
        </div>
        <aside className="pi-side" aria-label="Analysis panel">
          <AnalysisPanel analysis={view.activeAnalysis} />
        </aside>
      </div>
    </div>
  )
}

/* ─── Header ─── */

function ReportHeader({ report }: { report: PaperIntelligenceReport }): ReactNode {
  const { sourcePaper, generator, schemaVersion } = report
  return (
    <header className="pi-header">
      <h1>{sourcePaper.paperName}</h1>
      <div className="pi-header-meta">
        <span>
          {sourcePaper.year} · {sourcePaper.region}
        </span>
        <span>{sourcePaper.section}</span>
        <span>schema {schemaVersion}</span>
        <span>prompt {generator.promptVersion}</span>
        <span>model {generator.modelId || '—'}</span>
      </div>
      <div className="pi-disclaimer">AI 初判，需教研复核 — 不作为权威结论</div>
    </header>
  )
}

/* ─── Passage Section ─── */

/**
 * One passage block: header → passageBody (segmented for highlights) →
 * loads / outline / key chunks → clickable question cards →
 * (existing) read-only question detail rows.
 *
 * The clickable cards are the new V1 surface; the rest is preserved
 * from the V0 read-only preview so teachers still see the loads /
 * outline / chunks without hunting.
 */
function PassageSection(props: {
  passageView: PassagePreviewView
  reportPassage: PassageReport | undefined
  activeQuestionId: string | null
  onSelectQuestion: (id: string) => void
}): ReactNode {
  const { passageView, reportPassage, activeQuestionId, onSelectQuestion } = props
  return (
    <section className="pi-passage" data-pi-paper-section={passageView.paperSection}>
      <div className="pi-passage-header">
        <h2 className="pi-passage-title">
          <span className="pi-section-badge">{passageView.paperSection}</span>
          {passageView.passageTitle || `篇章 ${passageView.paperSection}`}
        </h2>
        <span className="pi-band" data-band={passageView.bandLabel}>
          {passageView.bandLabel}
        </span>
      </div>

      <PassageBody segments={passageView.segments} />

      {reportPassage && (
        <>
          <LoadsPanel loads={reportPassage.loads} />
          <OutlinePanel outline={reportPassage.passageOutline} />
          <ChunksPanel chunks={reportPassage.keyChunks} note={reportPassage.keyChunksNote} />
        </>
      )}

      <div className="pi-question-list">
        {passageView.questions.map((row) => (
          <QuestionCard
            key={row.questionId}
            row={row}
            isActive={row.questionId === activeQuestionId}
            onSelect={onSelectQuestion}
          />
        ))}
      </div>

      {reportPassage && (
        <QuestionsPanel
          questions={reportPassage.questions}
          activeQuestionId={activeQuestionId}
        />
      )}
    </section>
  )
}

/* ─── Passage Body (highlighted) ─── */

function PassageBody({ segments }: { segments: PassageSegment[] }): ReactNode {
  if (segments.length === 0) {
    return (
      <div className="pi-passage-body pi-passage-body-empty">
        原文未提供（input.json 缺失）
      </div>
    )
  }
  return (
    <div className="pi-passage-body">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          // plain text run; no DOM anchors needed
          return <span key={i}>{seg.text}</span>
        }
        // highlight span — these are the V2 dotted-line anchors.
        const className =
          seg.evidenceKind === 'support'
            ? 'pi-ev-highlight pi-ev-highlight--support'
            : 'pi-ev-highlight pi-ev-highlight--trap'
        return (
          <mark
            key={i}
            className={className}
            data-pi-evidence-id={seg.evidenceId}
            data-pi-question-id={seg.questionId}
            data-pi-evidence-kind={seg.evidenceKind}
            data-pi-option-label={seg.optionLabel ?? undefined}
          >
            {seg.text}
          </mark>
        )
      })}
    </div>
  )
}

/* ─── Loads (unchanged from V0) ─── */

const LOAD_KEYS: { key: keyof import('./paperIntelligenceTypes').PassageLoads; label: string }[] = [
  { key: 'vocabularyChunkLoad', label: '词汇词块' },
  { key: 'grammarLoad', label: '语法' },
  { key: 'discourseStructureLoad', label: '语篇结构' },
  { key: 'topicBackgroundLoad', label: '主题背景' },
  { key: 'evidenceFindingLoad', label: '证据寻找' },
]

function LoadsPanel({
  loads,
}: {
  loads: import('./paperIntelligenceTypes').PassageLoads
}): ReactNode {
  return (
    <div className="pi-loads">
      <h3 className="pi-loads-title">篇章负荷</h3>
      {LOAD_KEYS.map(({ key, label }) => {
        const bar = loads[key] as LoadBar | undefined
        if (!bar) return null
        return <LoadRow key={key} label={label} bar={bar} />
      })}
    </div>
  )
}

function LoadRow({ label, bar }: { label: string; bar: LoadBar }): ReactNode {
  const [showEvidence, setShowEvidence] = useState(false)
  const hasEvidence = bar.evidenceItems.length > 0
  return (
    <div>
      <div className="pi-load-row">
        <span className="pi-load-label">{label}</span>
        <div className="pi-load-bar">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="pi-load-cell"
              data-filled={i <= bar.score ? 'true' : undefined}
              data-high={i <= bar.score && bar.score >= 4 ? 'true' : undefined}
            />
          ))}
        </div>
        <span className="pi-load-score">{bar.label}</span>
        <span className="pi-load-reason">{bar.shortReason}</span>
        {hasEvidence && (
          <button
            className="pi-load-evidence-toggle"
            onClick={() => setShowEvidence(!showEvidence)}
          >
            {showEvidence ? '收起' : '引文'}
          </button>
        )}
      </div>
      {showEvidence && hasEvidence && (
        <ul className="pi-load-evidence-list">
          {bar.evidenceItems.map((ev, i) => (
            <li key={i} className="pi-load-evidence-item">
              <span className="pi-quote">"{ev.quote}"</span>
              {ev.note && <span> — {ev.note}</span>}
              {ev.paragraph != null && <span> (¶{ev.paragraph})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─── Outline & Chunks (unchanged from V0) ─── */

function OutlinePanel({
  outline,
}: {
  outline: import('./paperIntelligenceTypes').PassageOutline
}): ReactNode {
  return (
    <div className="pi-outline">
      <p className="pi-outline-idea">{outline.mainIdea}</p>
      <ol className="pi-outline-layers">
        {outline.logicalLayers.map((layer, i) => (
          <li key={i}>{layer}</li>
        ))}
      </ol>
    </div>
  )
}

function ChunksPanel({ chunks, note }: { chunks: KeyChunk[]; note?: string }): ReactNode {
  return (
    <div className="pi-chunks">
      <h3 className="pi-chunks-title">重要词块{note ? ` · ${note}` : ''}</h3>
      <div className="pi-chunk-list">
        {chunks.map((chunk, i) => (
          <span key={i} className="pi-chunk-tag">
            <span className="pi-chunk-surface">{chunk.surface}</span>
            <span className="pi-chunk-meta">
              {chunk.kind === 'word' && chunk.ipa && `${chunk.ipa} `}
              {chunk.kind === 'word' && chunk.pos && `${chunk.pos} `}
              {chunk.meaning}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── New: clickable question card ─── */

function QuestionCard(props: {
  row: QuestionRow
  isActive: boolean
  onSelect: (id: string) => void
}): ReactNode {
  const { row, isActive, onSelect } = props
  const className = isActive
    ? 'pi-question-card pi-question-card--active'
    : 'pi-question-card'
  return (
    <button
      type="button"
      className={className}
      data-pi-question-id={row.questionId}
      data-pi-paper-section={row.paperSection}
      data-pi-question-no={row.questionNo}
      aria-pressed={isActive}
      onClick={() => onSelect(row.questionId)}
    >
      <div className="pi-question-card-head">
        <span className="pi-question-card-no">Q{row.questionNo}</span>
        <span className="pi-question-type">{row.teacherQuestionType}</span>
        <span className="pi-question-answer">答案 {row.answer}</span>
      </div>
      <p className="pi-question-card-stem">{row.stem}</p>
      {row.optionsForDisplay.length > 0 && (
        <div className="pi-question-card-options">
          {row.optionsForDisplay.map((opt) => (
            <span key={opt.label} className="pi-question-card-option">
              <span className="pi-question-card-option-label">{opt.label}</span>
              <span>{opt.content}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

/* ─── Existing: per-question detail (V0) ─── */

function QuestionsPanel({
  questions,
  activeQuestionId,
}: {
  questions: QuestionAnalysis[]
  activeQuestionId: string | null
}): ReactNode {
  // The detail rows still ship below the clickable cards so teachers
  // can see distractor reasons + tCard etc. without depending on the
  // right panel. We open the row when its question is the active one.
  return (
    <div className="pi-questions">
      {questions.map((q) => {
        const id = buildQuestionId(q.paperSection, q.questionNo)
        return <DetailQuestionRow key={q.questionNo} question={q} forceExpanded={id === activeQuestionId} />
      })}
    </div>
  )
}

function DetailQuestionRow({
  question,
  forceExpanded,
}: {
  question: QuestionAnalysis
  forceExpanded: boolean
}): ReactNode {
  const [expanded, setExpanded] = useState(forceExpanded)
  // sync with active question — when user clicks a question card, expand
  // its detail row; when they click another, collapse this one.
  useEffect(() => {
    setExpanded(forceExpanded)
  }, [forceExpanded])
  const q = question
  return (
    <div className="pi-question">
      <div className="pi-question-header" onClick={() => setExpanded(!expanded)}>
        <span className="pi-question-no">Q{q.questionNo}</span>
        <span className="pi-question-type">{q.teacherQuestionType}</span>
        <span className="pi-question-answer">答案 {q.answer}</span>
        <span className="pi-question-backend">
          <span className="pi-tcard">{q.tCard}</span>
          {q.reviewNeeded && <span className="pi-review-badge">需复核</span>}
        </span>
        <span className="pi-question-expand">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && <QuestionDetail question={q} />}
    </div>
  )
}

function QuestionDetail({ question }: { question: QuestionAnalysis }): ReactNode {
  const q = question
  return (
    <div className="pi-question-detail">
      <p className="pi-q-stem">{q.stem}</p>
      <p className="pi-q-translation">{q.stemTranslation}</p>

      <div className="pi-q-section">定位句 & 答案句</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0' }}>
        定位：<span className="pi-quote">{q.locatingSentence}</span>
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0' }}>
        答案：<span className="pi-quote">{q.answerSentence}</span>
      </p>

      <div className="pi-q-section">正确答案证据</div>
      <div className="pi-evidence-box">
        <span className="pi-quote">"{q.answerEvidence.quote}"</span>
        <span className="pi-explanation">{q.answerEvidence.explanationZh}</span>
      </div>

      <div className="pi-q-section">干扰项分析</div>
      {q.distractorAnalysis.map((d, i) => (
        <div key={i} className="pi-distractor">
          <span className="pi-distractor-label">{d.optionLabel}</span>
          <span className="pi-distractor-category">
            {d.category}
            {d.subtype ? ` / ${d.subtype}` : ''}
          </span>
          <span> — {d.shortReason}</span>
          {d.quote && (
            <span style={{ display: 'block', marginTop: 2 }}>
              <span className="pi-quote">"{d.quote}"</span>
            </span>
          )}
        </div>
      ))}

      <div className="pi-synonym">同义替换：{q.synonymSummary}</div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
        surfaceType: {q.surfaceType} · answeringMove: {q.answeringMove}
        {q.boundaryFlags.length > 0 && ` · boundary: ${q.boundaryFlags.join(', ')}`}
        {q.confidence != null && ` · confidence: ${q.confidence}`}
      </div>
    </div>
  )
}

/* ─── New: right-side Analysis Panel ─── */

function AnalysisPanel({ analysis }: { analysis: AnalysisView | null }): ReactNode {
  if (!analysis) {
    return <div className="pi-analysis-empty">点击左侧题目查看解析</div>
  }
  return (
    <div data-pi-question-id={analysis.questionId}>
      <div className="pi-analysis-head">
        <span className="pi-analysis-question-no">Q{analysis.questionNo}</span>
        <span className="pi-analysis-type">{analysis.teacherQuestionType}</span>
        <span className="pi-analysis-answer">答案 {analysis.answer}</span>
      </div>
      <p className="pi-analysis-stem">{analysis.stem}</p>

      <div className="pi-analysis-section">正确答案</div>
      <div
        className="pi-analysis-evidence"
        data-pi-evidence-id={analysis.supportEvidenceId ?? undefined}
        data-pi-question-id={analysis.questionId}
      >
        {analysis.answerEvidenceQuote && (
          <span className="pi-analysis-evidence-quote">"{analysis.answerEvidenceQuote}"</span>
        )}
        <span>{analysis.answerEvidenceExplanationZh}</span>
      </div>

      <div className="pi-analysis-section">干扰项分析</div>
      {analysis.distractors.length === 0 && (
        <div className="pi-analysis-distractor-text-only">无干扰项数据</div>
      )}
      {analysis.distractors.map((d) => (
        <DistractorRow key={d.evidenceId} row={d} questionId={analysis.questionId} />
      ))}

      <div className="pi-analysis-section">同义替换</div>
      <div className="pi-analysis-synonym">{analysis.synonymSummary || '—'}</div>

      <div className="pi-analysis-backstage">
        <span className="pi-analysis-backstage-tag">{analysis.tCard}</span>
        {analysis.confidence != null && (
          <span className="pi-analysis-backstage-tag">
            confidence {analysis.confidence.toFixed(2)}
          </span>
        )}
        {analysis.reviewNeeded && (
          <span className="pi-analysis-backstage-tag pi-analysis-review">需复核</span>
        )}
      </div>
    </div>
  )
}

function DistractorRow({
  row,
  questionId,
}: {
  row: AnalysisDistractorRow
  questionId: string
}): ReactNode {
  return (
    <div
      className="pi-analysis-distractor"
      data-pi-evidence-id={row.evidenceId}
      data-pi-question-id={questionId}
    >
      <div className="pi-analysis-distractor-head">
        <span className="pi-analysis-distractor-label">{row.optionLabel}</span>
        {row.category && (
          <span className="pi-analysis-distractor-cat">
            {row.category}
            {row.subtype ? ` / ${row.subtype}` : ''}
          </span>
        )}
        {row.quoteIsTextOnly && (
          <span className="pi-analysis-distractor-text-only">text-only</span>
        )}
      </div>
      <span>{row.shortReason}</span>
      {row.quote && <span className="pi-analysis-distractor-quote">"{row.quote}"</span>}
    </div>
  )
}
