/**
 * PaperIntelligencePreview — interactive teacher-facing preview of a
 * Paper Intelligence V0 report (V1 layout).
 *
 * V1 product rules (locked in by reviewer):
 *   - Two-column shell: passages on the left, sticky Analysis Panel on
 *     the right.
 *   - The right Analysis Panel is the SINGLE source of truth for
 *     stem / answer / distractor / synonym / back-stage fields. The
 *     left column shows clickable question card entrypoints ONLY.
 *   - The previous V0 expandable detail rows (`QuestionsPanel` /
 *     `DetailQuestionRow`) have been deleted to prevent the same
 *     question's content from appearing twice.
 *   - V1 only does highlighting + a small "scroll the first support
 *     highlight into view" affordance. No cross-column dotted lines,
 *     no animations, no scroll linking. DOM anchors (`data-pi-*`) stay
 *     so V2 can wire up the LinkOverlay-style system later.
 *   - Information density on the left is intentionally low:
 *       * LoadRow shows score / label / shortReason only — the
 *         per-load evidence list has been removed.
 *       * Key chunks show a `重要词块 · N 个` summary only — the full
 *         tag list is no longer rendered.
 *
 * Smoke-polish auto-scroll (this revision):
 *   - When `activeQuestionId` flips to a non-null value, an effect
 *     finds the first `<mark data-pi-evidence-kind="support"
 *     data-pi-question-id="<id>">` inside the LEFT scroller and
 *     scrolls only that scroller (not the window) so the support
 *     highlight is visible.
 *   - The left column is its own scroll container (`.pi-main` with
 *     `overflow-y: auto`), so `scrollIntoView({ block: 'nearest' })`
 *     resolves against `.pi-main` and never bubbles to the document.
 *   - Honors `prefers-reduced-motion`: under reduced motion the scroll
 *     uses `behavior: 'auto'` (instant); otherwise `'smooth'`.
 *   - Effect runs only when `activeQuestionId` actually changes; when
 *     it goes back to null we do NOT scroll.
 *
 * Routing: still `?view=paper-intelligence&paperId=<id>` — no new
 * demo route, no new view param. The route parser is unchanged.
 *
 * Architecture:
 *   - All evidence/quote logic lives in `./preview/paperIntelligencePreviewModel`.
 *   - That module uses the existing evidence adapter (`toEvidenceModel`,
 *     `selectEvidence`) — this component never calls passage substring
 *     lookups or any other quote-matching primitive directly.
 *   - This file: fetch + state + render + the small auto-scroll effect.
 *   - Active state is just `activeQuestionId`. Per reviewer guidance,
 *     V1 does not introduce a separate `activeEvidenceId`.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  PaperIntelligenceReport,
  PassageReport,
  LoadBar,
  KeyChunk,
} from './paperIntelligenceTypes'
import {
  buildPreviewView,
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

/**
 * Escape a question id (e.g. `A-21`) for safe inclusion inside an
 * attribute-equals CSS selector. The model-side `buildQuestionId`
 * already restricts ids to alphanumerics, dashes, and dots, but we
 * defensively escape anything that isn't strictly word/dash so a future
 * id schema change can't accidentally break the selector.
 *
 * `CSS.escape` is preferred when available; the manual fallback handles
 * older runtimes (and the smoke-test sandbox).
 */
function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

/** Top-level container. Owns:
 *   - the report fetch
 *   - the optional input.json fetch (passageBody for highlighting)
 *   - the `activeQuestionId` state
 *   - the memoized preview view (built from report+bodies+activeQuestionId)
 */
export function PaperIntelligencePreview({ paperId }: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  /**
   * Ref to the left scroll container (`.pi-main`). The auto-scroll
   * effect uses this to scope `scrollIntoView` to the left column only.
   * If the ref is detached for any reason (e.g. error state), the effect
   * is a no-op — we never fall back to scrolling the window.
   */
  const mainScrollerRef = useRef<HTMLDivElement | null>(null)

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

  /**
   * Auto-scroll: when the teacher activates a question, bring the
   * first SUPPORT highlight into view inside the left scroller.
   *
   * Why support specifically: the support quote is the answer
   * evidence, so it's the single most useful thing a teacher wants to
   * see right after clicking. Trap quotes are secondary; the right
   * Analysis Panel already lists them with their own captions.
   *
   * Why scope the scroll to `.pi-main`:
   *   - The right Analysis Panel is sticky inside `.pi-shell`. We do
   *     NOT want to scroll the page just because a teacher clicked a
   *     question card — that would push the whole report header
   *     offscreen.
   *   - `.pi-main` carries `overflow-y: auto` (see CSS), so
   *     `scrollIntoView({ block: 'nearest' })` resolves against
   *     `.pi-main` and never against the document scroller.
   *
   * `prefers-reduced-motion`: when set, animation-style smooth scroll
   * is replaced with `behavior: 'auto'` (instant). The query is read
   * lazily inside the effect so it stays in sync with the user's
   * current OS preference at the moment the click happens.
   *
   * The effect intentionally does nothing when `activeQuestionId`
   * goes back to null (toggled off): collapsing into an empty panel
   * shouldn't yank the passage view around.
   */
  useEffect(() => {
    if (!activeQuestionId) return
    const scroller = mainScrollerRef.current
    if (!scroller) return
    // Find the first support highlight for this question. Only the
    // `<mark>` elements we render carry the `data-pi-evidence-kind`
    // attribute, so the selector is unambiguous.
    const target = scroller.querySelector<HTMLElement>(
      `[data-pi-question-id="${cssAttr(activeQuestionId)}"][data-pi-evidence-kind="support"]`,
    )
    if (!target) return
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [activeQuestionId, view])

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
        <div className="pi-main" ref={mainScrollerRef}>
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
        <aside
          className="pi-side"
          aria-label="Analysis panel"
          aria-live="polite"
          role="region"
        >
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
 * loads / outline / key-chunks summary → clickable question cards.
 *
 * The clickable cards are the V1 left-column entrypoint. Per-question
 * details (stem / distractor breakdown / synonym / back-stage labels)
 * live ONLY in the right Analysis Panel — there is no expandable detail
 * row here in V1.
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
          <ChunksSummary chunks={reportPassage.keyChunks} />
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

/* ─── Loads (V1: score / label / shortReason only) ─── */

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

/**
 * V1 LoadRow: shows score cells + label + shortReason. The previous V0
 * "引文 / 收起" toggle and per-load evidence list have been removed —
 * load-level evidence items are no longer surfaced on this page (the
 * right Analysis Panel is the single home for evidence quotes).
 */
function LoadRow({ label, bar }: { label: string; bar: LoadBar }): ReactNode {
  return (
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
    </div>
  )
}

/* ─── Outline ─── */

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

/* ─── Key chunks (V1: summary only, no expanded list) ─── */

/**
 * V1 deliberately collapses the previous 8–12 tag list down to a single
 * `重要词块 · N 个` summary line. Teachers who want the full chunk list
 * can ask for it later — V1 keeps the left column low-density.
 */
function ChunksSummary({ chunks }: { chunks: KeyChunk[] }): ReactNode {
  const count = Array.isArray(chunks) ? chunks.length : 0
  return (
    <div className="pi-chunks">
      <h3 className="pi-chunks-title">重要词块 · {count} 个</h3>
    </div>
  )
}

/* ─── Clickable question card (V1 left-column entrypoint) ─── */

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

/* ─── Right-side Analysis Panel (V1: only home for question detail) ─── */

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
