/**
 * PaperIntelligencePreview — readonly teacher-facing preview of a
 * Paper Intelligence V0 report.
 *
 * This component:
 *   - Fetches a static JSON report from public/reports/
 *   - Renders passage loads, AI band, questions with evidence
 *   - Is purely read-only: no DB writes, no model calls, no mutations
 *
 * Entry: `?view=paper-intelligence&paperId=<id>`
 */

import { useEffect, useState, type ReactNode } from 'react'
import type {
  PaperIntelligenceReport,
  PassageReport,
  LoadBar,
  QuestionAnalysis,
  KeyChunk,
} from './paperIntelligenceTypes'
import './paperIntelligence.css'

type Props = {
  paperId: string | null
}

export function PaperIntelligencePreview({ paperId }: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!paperId) {
      setError('未指定 paperId 参数。')
      setLoading(false)
      return
    }
    const url = `/reports/paper-intelligence/${paperId}/report.json`
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setReport(data as PaperIntelligenceReport)
        setLoading(false)
      })
      .catch(() => {
        setError(`未找到 Paper Intelligence 报告：${paperId}`)
        setLoading(false)
      })
  }, [paperId])

  if (loading) {
    return (
      <div className="pi-view">
        <div className="pi-error">
          <p>加载中…</p>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="pi-view">
        <div className="pi-error">
          <h2>未找到 Paper Intelligence 报告</h2>
          <p>{error || '报告数据为空。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pi-view">
      <ReportHeader report={report} />
      <div className="pi-content">
        {report.passages.map((passage) => (
          <PassageSection key={passage.paperSection} passage={passage} />
        ))}
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
        <span>{sourcePaper.year} · {sourcePaper.region}</span>
        <span>{sourcePaper.section}</span>
        <span>schema {schemaVersion}</span>
        <span>prompt {generator.promptVersion}</span>
        <span>model {generator.modelId || '—'}</span>
      </div>
      <div className="pi-disclaimer">
        AI 初判，需教研复核 — 不作为权威结论
      </div>
    </header>
  )
}

/* ─── Passage Section ─── */

function PassageSection({ passage }: { passage: PassageReport }): ReactNode {
  return (
    <section className="pi-passage">
      <div className="pi-passage-header">
        <h2 className="pi-passage-title">
          <span className="pi-section-badge">{passage.paperSection}</span>
          {passage.passageTitle || `篇章 ${passage.paperSection}`}
        </h2>
        <span className="pi-band" data-band={passage.aiInitialBand.band}>
          {passage.aiInitialBand.band}
        </span>
      </div>
      <LoadsPanel loads={passage.loads} />
      <OutlinePanel outline={passage.passageOutline} />
      <ChunksPanel chunks={passage.keyChunks} note={passage.keyChunksNote} />
      <QuestionsPanel questions={passage.questions} />
    </section>
  )
}

/* ─── Loads ─── */

const LOAD_KEYS: { key: keyof import('./paperIntelligenceTypes').PassageLoads; label: string }[] = [
  { key: 'vocabularyChunkLoad', label: '词汇词块' },
  { key: 'grammarLoad', label: '语法' },
  { key: 'discourseStructureLoad', label: '语篇结构' },
  { key: 'topicBackgroundLoad', label: '主题背景' },
  { key: 'evidenceFindingLoad', label: '证据寻找' },
]

function LoadsPanel({ loads }: { loads: import('./paperIntelligenceTypes').PassageLoads }): ReactNode {
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

/* ─── Outline ─── */

function OutlinePanel({ outline }: { outline: import('./paperIntelligenceTypes').PassageOutline }): ReactNode {
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

/* ─── Chunks ─── */

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

/* ─── Questions ─── */

function QuestionsPanel({ questions }: { questions: QuestionAnalysis[] }): ReactNode {
  return (
    <div className="pi-questions">
      {questions.map((q) => (
        <QuestionCard key={q.questionNo} question={q} />
      ))}
    </div>
  )
}

function QuestionCard({ question }: { question: QuestionAnalysis }): ReactNode {
  const [expanded, setExpanded] = useState(false)
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
          <span className="pi-distractor-category">{d.category}{d.subtype ? ` / ${d.subtype}` : ''}</span>
          <span> — {d.shortReason}</span>
          {d.quote && (
            <span style={{ display: 'block', marginTop: 2 }}>
              <span className="pi-quote">"{d.quote}"</span>
            </span>
          )}
        </div>
      ))}

      <div className="pi-synonym">
        同义替换：{q.synonymSummary}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
        surfaceType: {q.surfaceType} · answeringMove: {q.answeringMove}
        {q.boundaryFlags.length > 0 && ` · boundary: ${q.boundaryFlags.join(', ')}`}
        {q.confidence != null && ` · confidence: ${q.confidence}`}
      </div>
    </div>
  )
}
