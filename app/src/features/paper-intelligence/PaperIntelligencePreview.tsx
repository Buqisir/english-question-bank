/**
 * PaperIntelligencePreview — interactive teacher-facing preview of a
 * Paper Intelligence V0 report.
 *
 * V1 product rules (still in effect):
 *   - Two-column shell: passages on the left, sticky Analysis Panel on
 *     the right.
 *   - The right Analysis Panel is the SINGLE source of truth for
 *     stem / answer / distractor / synonym / back-stage fields.
 *   - V0 detail rows (`QuestionsPanel` / `DetailQuestionRow`) remain
 *     deleted.
 *   - Information density on the left stays low (LoadRow is score /
 *     label / shortReason only; key chunks are a `重要词块 · N 个`
 *     summary).
 *
 * V1 smoke-polish (still in effect):
 *   - Auto-scroll the first support highlight into view inside the
 *     LEFT scroller (`.pi-main`) when `activeQuestionId` flips.
 *   - Honors `prefers-reduced-motion`.
 *
 * V2 cross-column evidence line (this revision):
 *   - Adds a SECONDARY `activeEvidenceId` state. `activeQuestionId`
 *     is still the primary state — `activeEvidenceId` only exists to
 *     pick which evidence the dotted line connects to. When
 *     `activeQuestionId === null`, `activeEvidenceId` MUST be null.
 *   - Default `activeEvidenceId` for a freshly-activated question is
 *     that question's `supportEvidenceId`. The reviewer's contract:
 *     activating a question always seeds the line on the support
 *     evidence (the answer evidence), never on a distractor.
 *   - Clicking an evidence row in the right Analysis Panel switches
 *     `activeEvidenceId` (the support row, or any distractor row that
 *     has a non-null quote). Text-only distractors are intentionally
 *     not clickable for line purposes — they render as plain text.
 *   - Clicking the active question card again clears BOTH ids; the
 *     overlay disappears.
 *   - Clicking a different question card sets `activeQuestionId` to
 *     the new id and reseeds `activeEvidenceId` to that question's
 *     support evidence.
 *   - Only ONE line is drawn at a time. We never connect to load
 *     evidence, key chunks, the outline, the locating sentence, or
 *     back-stage fields.
 *
 * Routing: still `?view=paper-intelligence&paperId=<id>` — unchanged.
 *
 * Architecture (kept clean):
 *   - All evidence/quote logic lives in
 *     `./preview/paperIntelligencePreviewModel`. The component never
 *     calls `passageBody.indexOf` / `includes` itself.
 *   - The line overlay lives in
 *     `./preview/paperIntelligenceEvidenceLine`. We do NOT import
 *     `reading-analysis/LinkOverlay` or any reading-analysis hook —
 *     the reviewer's V1 lock-in stays in force.
 *   - This file: fetch + state + render + the two small effects
 *     (auto-scroll + activeEvidenceId reseed).
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
import { PaperIntelligenceEvidenceLine } from './preview/paperIntelligenceEvidenceLine'
import './paperIntelligence.css'

type Props = {
  paperId: string | null
  /** Set of question group ids currently in the draft basket. */
  basketIds: Set<string>
  /** Set of question group ids that the local bank can resolve. */
  availableQuestionGroupIds: Set<string>
  /** Callback to add a question group to the basket. Cut A: wired but not invoked. */
  onAddQuestionGroup: (questionGroupId: string) => void
  /** Number of items currently in the basket. */
  basketCount: number
  /** Navigate back to the workbench. Cut A: wired but not invoked. */
  onBackToWorkbench: () => void
}

/**
 * Escape a question id (e.g. `A-21`) for safe inclusion inside an
 * attribute-equals CSS selector. The model-side `buildQuestionId`
 * already restricts ids to alphanumerics, dashes, and dots, but we
 * defensively escape anything that isn't strictly word/dash so a future
 * id schema change can't accidentally break the selector.
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
 *   - the `activeQuestionId` (primary) and `activeEvidenceId`
 *     (secondary, line-only) states
 *   - the memoized preview view
 *   - the auto-scroll effect (on activeQuestionId change)
 *   - the activeEvidenceId reseed effect (on view/activeQuestionId change)
 */
export function PaperIntelligencePreview({
  paperId,
  basketIds: _basketIds,
  availableQuestionGroupIds: _availableQuestionGroupIds,
  onAddQuestionGroup: _onAddQuestionGroup,
  basketCount: _basketCount,
  onBackToWorkbench: _onBackToWorkbench,
}: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  /**
   * SECONDARY state: which evidence row the cross-column dotted line
   * connects to. Invariants enforced below:
   *   - `activeEvidenceId === null` whenever `activeQuestionId === null`.
   *   - When activating a question, this gets seeded to the question's
   *     support evidence id (or null if support is missing — the line
   *     just won't render).
   *   - Clicking a non-text-only distractor row updates this only;
   *     `activeQuestionId` stays put.
   */
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  /**
   * Refs the line overlay needs:
   *   - `shellRef`     → the `.pi-shell` element. The overlay sits
   *     `position:absolute; inset:0` inside this, so its viewBox
   *     covers both columns.
   *   - `mainScrollerRef` → the `.pi-main` left scroller. Used by the
   *     overlay for target lookup AND scroll-listener attachment;
   *     also used by the auto-scroll effect (V1) to scope
   *     `scrollIntoView`.
   *   - `sidePanelRef` → the `.pi-side` right panel. Used for source
   *     lookup AND scroll-listener attachment.
   */
  const shellRef = useRef<HTMLDivElement | null>(null)
  const mainScrollerRef = useRef<HTMLDivElement | null>(null)
  const sidePanelRef = useRef<HTMLElement | null>(null)

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
   * Reseed `activeEvidenceId` whenever the active question (and
   * therefore the analysis projection) changes.
   *
   * Cases:
   *   - `activeQuestionId === null` → clear the line. Invariant
   *     enforced.
   *   - `activeQuestionId` is non-null and the analysis carries a
   *     `supportEvidenceId` → seed to it.
   *   - `activeQuestionId` is non-null but support is missing (rare)
   *     → leave the line off. We do NOT auto-pick a distractor; the
   *     teacher would have to click one explicitly.
   *
   * This effect runs only when the active *question* changes, NOT
   * when the user clicks a distractor row. That click goes through
   * `setActiveEvidenceId` directly (see `handleSelectEvidence`); this
   * effect would race with that update if it were to fire on every
   * render.
   */
  useEffect(() => {
    if (!activeQuestionId) {
      setActiveEvidenceId(null)
      return
    }
    const supportId = view?.activeAnalysis?.supportEvidenceId ?? null
    setActiveEvidenceId(supportId)
    // Intentionally do NOT depend on `activeEvidenceId` — that would
    // create a feedback loop with `handleSelectEvidence`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestionId, view?.activeAnalysis?.supportEvidenceId])

  /**
   * Auto-scroll: V1 behavior preserved. When the teacher activates a
   * question, bring the first SUPPORT highlight into view inside
   * `.pi-main` only. The right Analysis Panel is sticky inside
   * `.pi-shell`, so we never bubble the scroll to the document.
   *
   * `prefers-reduced-motion`: replaces smooth scroll with `'auto'`
   * (instant). Read lazily so it tracks the user's current OS
   * preference at click time.
   */
  useEffect(() => {
    if (!activeQuestionId) return
    const scroller = mainScrollerRef.current
    if (!scroller) return
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
    // Toggle off when clicking the same row again. The reseed effect
    // will clear `activeEvidenceId` automatically when the new value
    // resolves to null.
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  /**
   * Right-panel evidence row click. We update only
   * `activeEvidenceId`; the active question stays put. The reseed
   * effect ignores this transition (it only runs when the active
   * question itself changes), so the click is a one-shot update.
   *
   * Invariant: callers MUST pass a non-null evidence id. Text-only
   * distractor rows in the Analysis Panel are rendered as plain
   * `<div>`s without a button, so they can't even reach this handler.
   */
  const handleSelectEvidence = (evidenceId: string): void => {
    if (!activeQuestionId) return // defensive — UI shouldn't allow this
    setActiveEvidenceId(evidenceId)
  }

  return (
    <div className="pi-view">
      <ReportHeader report={report} />
      <div className="pi-shell" ref={shellRef}>
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
          ref={sidePanelRef}
        >
          <AnalysisPanel
            analysis={view.activeAnalysis}
            activeEvidenceId={activeEvidenceId}
            onSelectEvidence={handleSelectEvidence}
          />
        </aside>
        {/*
         * Cross-column evidence line. Rendered last so it stacks above
         * the columns. It pointer-events: none in CSS so clicks fall
         * through to the underlying buttons / marks.
         */}
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
          return <span key={i}>{seg.text}</span>
        }
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

/* ─── Key chunks (V1: summary only) ─── */

function ChunksSummary({ chunks }: { chunks: KeyChunk[] }): ReactNode {
  const count = Array.isArray(chunks) ? chunks.length : 0
  return (
    <div className="pi-chunks">
      <h3 className="pi-chunks-title">重要词块 · {count} 个</h3>
    </div>
  )
}

/* ─── Clickable question card ─── */

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

/* ─── Right-side Analysis Panel ─── */

function AnalysisPanel(props: {
  analysis: AnalysisView | null
  activeEvidenceId: string | null
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { analysis, activeEvidenceId, onSelectEvidence } = props
  if (!analysis) {
    return <div className="pi-analysis-empty">点击左侧题目查看解析</div>
  }
  const supportSelected =
    analysis.supportEvidenceId !== null &&
    analysis.supportEvidenceId === activeEvidenceId
  const supportClass = supportSelected
    ? 'pi-analysis-evidence pi-analysis-evidence--selected'
    : 'pi-analysis-evidence'
  return (
    <div data-pi-question-id={analysis.questionId}>
      <div className="pi-analysis-head">
        <span className="pi-analysis-question-no">Q{analysis.questionNo}</span>
        <span className="pi-analysis-type">{analysis.teacherQuestionType}</span>
        <span className="pi-analysis-answer">答案 {analysis.answer}</span>
      </div>
      <p className="pi-analysis-stem">{analysis.stem}</p>

      <div className="pi-analysis-section">正确答案</div>
      {/*
       * The support evidence row is a button so it can be focused with
       * keyboard and announced to screen readers as an interactive
       * element. It only reaches `onSelectEvidence` when the question
       * actually has a support evidence id (the typical case); when
       * `supportEvidenceId === null` we render a plain `<div>` so the
       * teacher can still see the answer explanation.
       */}
      {analysis.supportEvidenceId ? (
        <button
          type="button"
          className={supportClass}
          data-pi-evidence-id={analysis.supportEvidenceId}
          data-pi-evidence-kind="support"
          data-pi-question-id={analysis.questionId}
          aria-pressed={supportSelected}
          onClick={() => onSelectEvidence(analysis.supportEvidenceId as string)}
        >
          {analysis.answerEvidenceQuote && (
            <span className="pi-analysis-evidence-quote">"{analysis.answerEvidenceQuote}"</span>
          )}
          <span>{analysis.answerEvidenceExplanationZh}</span>
        </button>
      ) : (
        <div
          className={supportClass}
          data-pi-question-id={analysis.questionId}
        >
          {analysis.answerEvidenceQuote && (
            <span className="pi-analysis-evidence-quote">"{analysis.answerEvidenceQuote}"</span>
          )}
          <span>{analysis.answerEvidenceExplanationZh}</span>
        </div>
      )}

      <div className="pi-analysis-section">干扰项分析</div>
      {analysis.distractors.length === 0 && (
        <div className="pi-analysis-distractor-text-only">无干扰项数据</div>
      )}
      {analysis.distractors.map((d) => (
        <DistractorRow
          key={d.evidenceId}
          row={d}
          questionId={analysis.questionId}
          isSelected={d.evidenceId === activeEvidenceId}
          onSelectEvidence={onSelectEvidence}
        />
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

function DistractorRow(props: {
  row: AnalysisDistractorRow
  questionId: string
  isSelected: boolean
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { row, questionId, isSelected, onSelectEvidence } = props
  const className = isSelected
    ? 'pi-analysis-distractor pi-analysis-distractor--selected'
    : 'pi-analysis-distractor'

  /*
   * Text-only distractors render as plain `<div>` — there's no quote
   * to anchor a line to, so making them clickable would imply an
   * action the overlay can't fulfill. Quoted distractors render as
   * `<button>` and update `activeEvidenceId` on click.
   */
  if (row.quoteIsTextOnly) {
    return (
      <div
        className={className}
        data-pi-evidence-id={row.evidenceId}
        data-pi-evidence-kind="trap"
        data-pi-question-id={questionId}
        data-pi-quote-text-only="true"
      >
        <div className="pi-analysis-distractor-head">
          <span className="pi-analysis-distractor-label">{row.optionLabel}</span>
          {row.category && (
            <span className="pi-analysis-distractor-cat">
              {row.category}
              {row.subtype ? ` / ${row.subtype}` : ''}
            </span>
          )}
          <span className="pi-analysis-distractor-text-only">text-only</span>
        </div>
        <span>{row.shortReason}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      className={className}
      data-pi-evidence-id={row.evidenceId}
      data-pi-evidence-kind="trap"
      data-pi-question-id={questionId}
      aria-pressed={isSelected}
      onClick={() => onSelectEvidence(row.evidenceId)}
    >
      <div className="pi-analysis-distractor-head">
        <span className="pi-analysis-distractor-label">{row.optionLabel}</span>
        {row.category && (
          <span className="pi-analysis-distractor-cat">
            {row.category}
            {row.subtype ? ` / ${row.subtype}` : ''}
          </span>
        )}
      </div>
      <span>{row.shortReason}</span>
      {row.quote && <span className="pi-analysis-distractor-quote">"{row.quote}"</span>}
    </button>
  )
}
