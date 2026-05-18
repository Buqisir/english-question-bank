/**
 * PaperIntelligencePaperSurfaceHarness — Issue #21-C1 / C2 / C3.
 *
 * Host shell that mounts the production PaperSurface module inside the
 * Paper Intelligence route when `surface=paper` is active.
 *
 * Layout:
 *   - Left slot: PaperSurface (passage text + questions).
 *   - Right slot: existing PI analysis view (reused from PaperIntelligencePreview).
 *   - Cross-column dotted evidence line (C3) overlaid on the shell.
 *
 * Controlled state (host-owned):
 *   - mode: hardcoded 'lecture' (reading mode lands in B4a).
 *   - activeQuestionId: which question card is selected on the left.
 *   - activeEvidenceId (C3): which support evidence row is currently
 *     "drawing the line". Reseeded from
 *     `analysisView.supportEvidenceId` whenever activeQuestionId changes
 *     — mirrors PaperIntelligencePreview behavior. Cleared when
 *     activeQuestionId clears. The right-side analysis panel's evidence
 *     buttons can override the seeded value (e.g. to switch the line to
 *     a quoted distractor row); the harness owns the single writer.
 *   - lectureFocus: { kind: 'question', questionId, activeEvidenceId? }
 *     Built from activeQuestionId + activeEvidenceId so PaperSurface
 *     stays a dumb / data-driven renderer.
 *   - readingFocusBySection: {} (empty, not used in C1/C2/C3).
 *   - annotations: [] (no annotation paint in C1/C2/C3).
 *   - onFocusIntent: handles 'request-lecture-focus' only; others ignored.
 *
 * Right Question Analysis:
 *   - Reuses the same data derivation (buildPreviewView) from the existing
 *     PI preview model so the teacher sees the same analysis panel.
 *   - C3: emits `data-pi-evidence-id` on the support / distractor rows
 *     so the cross-column line geometry's right-side selector still
 *     resolves the host-owned `data-pi-*` namespace, exactly the way
 *     PaperIntelligencePreview does. PaperSurface (left side) does NOT
 *     emit `data-pi-*` and never will.
 *
 * Cross-column evidence line (C3 + C3.6):
 *   - Reuses the existing `PaperIntelligenceEvidenceLine` component.
 *   - Configured with `leftSelectorPreset='paper-surface'` so the left
 *     anchor lookup resolves `[data-paper-evidence-id]` (PaperSurface's
 *     neutral namespace) instead of `mark[data-pi-evidence-id]`.
 *   - Right-side selector remains `data-pi-evidence-id` because right
 *     Question Analysis is host-owned and unchanged.
 *   - C3.6: the harness derives `activeEvidenceKind: 'support' | 'trap'
 *     | null` from `analysisView` (Approach B — explicit, not DOM-read)
 *     and threads it into the line component so the dotted line stroke
 *     matches the role of the active evidence (mint green for the
 *     answer evidence; amber for a distractor source). PaperSurface
 *     paints the matching inline left highlight off the
 *     `data-paper-evidence-kind` attribute it already emits — no PI
 *     types leak into PaperSurface and PaperSurface emits no
 *     `data-pi-*`.
 *
 * What this harness does NOT do:
 *   - No insight chip / popover.
 *   - No basket interaction.
 *   - No reading mode.
 *   - No annotation pack UI.
 *   - No flip of the default PI route.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { buildPaperSurfaceDataFromPi } from './adapter/index.ts'
import {
  buildPreviewView,
  type AnalysisDistractorRow,
  type AnalysisView,
} from './preview/paperIntelligencePreviewModel'
import { PaperIntelligenceEvidenceLine } from './preview/paperIntelligenceEvidenceLine'
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

/**
 * CSS attribute escape for `querySelector` calls. The harness uses
 * the same shape as `PaperIntelligencePreview.cssAttr` so evidence ids
 * carrying punctuation (e.g. `A-32-support`) round-trip safely through
 * a selector string.
 */
function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
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
  /**
   * SECONDARY state (C3): which evidence row the cross-column dotted
   * line connects to. Mirrors the role of `activeEvidenceId` in
   * PaperIntelligencePreview. Reseeded from the active question's
   * support evidence whenever activeQuestionId changes; cleared when
   * activeQuestionId clears.
   */
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  // Refs for the cross-column line geometry (C3).
  const shellRef = useRef<HTMLDivElement | null>(null)
  const leftScrollerRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLElement | null>(null)

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

  // ─── Derive activeEvidenceKind (Issue #21-C3.6) ───
  //
  // Approach B: the harness explicitly resolves the role of the active
  // evidence by reading its own analysisView (the data layer the right
  // panel already consumes). PaperSurface stays dumb; the cross-column
  // line component is told the kind through a prop, not by sniffing
  // the active right-panel row's DOM attribute.
  //
  // Resolution order:
  //   - 'support' — activeEvidenceId equals analysisView.supportEvidenceId
  //   - 'trap'    — activeEvidenceId matches a quoted distractor's
  //                 evidenceId on analysisView.distractors. Text-only
  //                 distractors still appear here, but the harness
  //                 never makes them the active line target (the
  //                 right-panel row is non-clickable for them), so in
  //                 practice the matched distractor will be a quoted
  //                 one whenever the line geometry resolves.
  //   - null      — no active evidence id, no analysisView, or the id
  //                 doesn't resolve to a known role. Downstream the
  //                 line palette falls back to its support-style green
  //                 default and PaperSurface paints no kind-specific
  //                 highlight (the active <mark> already carries
  //                 `data-paper-evidence-kind` from PaperSurface, so
  //                 the inline left highlight stays correct on its
  //                 own).
  const activeEvidenceKind = useMemo<'support' | 'trap' | null>(() => {
    if (!activeEvidenceId || !analysisView) return null
    if (analysisView.supportEvidenceId === activeEvidenceId) return 'support'
    if (analysisView.distractors.some((d) => d.evidenceId === activeEvidenceId)) {
      return 'trap'
    }
    return null
  }, [activeEvidenceId, analysisView])

  // ─── Reseed activeEvidenceId when activeQuestionId changes (C3) ───
  //
  // This mirrors the seed effect in PaperIntelligencePreview so the
  // two surfaces feel identical when the teacher selects a question:
  // the support evidence becomes the active line target by default.
  // The right-side analysis panel may override the seeded id by
  // clicking a quoted distractor row.
  useEffect(() => {
    if (!activeQuestionId) {
      setActiveEvidenceId(null)
      return
    }
    const supportId = analysisView?.supportEvidenceId ?? null
    setActiveEvidenceId(supportId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestionId, analysisView?.supportEvidenceId])

  // ─── Lecture focus (controlled, includes activeEvidenceId) ───
  const lectureFocus: LectureFocus | null = useMemo(() => {
    if (!activeQuestionId) return null
    return activeEvidenceId
      ? { kind: 'question', questionId: activeQuestionId, activeEvidenceId }
      : { kind: 'question', questionId: activeQuestionId }
  }, [activeQuestionId, activeEvidenceId])

  // ─── Focus intent handler ───
  const handleFocusIntent = useCallback((intent: PaperSurfaceFocusIntent) => {
    if (intent.kind === 'request-lecture-focus') {
      setActiveQuestionId((prev) =>
        prev === intent.questionId ? null : intent.questionId,
      )
    }
    // Other intents ignored in C1/C2/C3.
  }, [])

  // ─── Right-side evidence click handler (C3) ───
  //
  // The internal AnalysisPanel below renders the support / distractor
  // rows as buttons carrying `data-pi-evidence-id`. Clicking one
  // updates the active evidence id and reseats the cross-column line.
  // This is the smallest possible host-owned handler — no events
  // fired by PaperSurface, no new intent kind.
  const handleSelectEvidence = useCallback((evidenceId: string) => {
    if (!evidenceId) return
    setActiveEvidenceId(evidenceId)
  }, [])

  // ─── Auto-scroll active evidence into the PaperSurface scroller (C3) ───
  //
  // Mirrors the auto-scroll effect in PaperIntelligencePreview but
  // targets the neutral `[data-paper-evidence-id]` anchor PaperSurface
  // emits on the LEFT side. We resolve the target inside the harness's
  // own left scroller (`.pi-ps-harness-left`), which is the only
  // overflowing ancestor between the anchor and the viewport.
  // `prefers-reduced-motion` toggles `behavior` between 'smooth' (default)
  // and 'auto' (instant) so the OS-level setting is honored.
  useEffect(() => {
    if (!activeEvidenceId) return
    const scroller = leftScrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-evidence-id="${cssAttr(activeEvidenceId)}"]`,
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
  }, [activeEvidenceId])

  // ─── Render ───
  if (loading) {
    return (
      <div className="pi-ps-harness">
        <div className="pi-ps-harness-topbar">
          <button type="button" className="pi-ps-harness-back" onClick={onBackToWorkbench}>
            <span aria-hidden="true">←</span> 返回工作台
          </button>
          <span className="pi-ps-harness-tagline">Paper Surface (C3)</span>
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
        <span className="pi-ps-harness-tagline">Paper Surface (C3)</span>
      </div>
      <div
        className="pi-ps-harness-shell"
        ref={shellRef}
        data-pi-active-evidence-kind={activeEvidenceKind ?? undefined}
      >
        <div className="pi-ps-harness-left" ref={leftScrollerRef}>
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
        <aside
          className="pi-ps-harness-right"
          aria-label="Question Analysis"
          aria-live="polite"
          ref={rightPanelRef}
        >
          <AnalysisPanel
            analysis={analysisView}
            activeEvidenceId={activeEvidenceId}
            onSelectEvidence={handleSelectEvidence}
          />
        </aside>
        {/*
          Cross-column dotted evidence line (C3).
          Reuses the existing PaperIntelligenceEvidenceLine component
          but with `leftSelectorPreset='paper-surface'` so the left
          anchor lookup resolves PaperSurface's neutral
          `[data-paper-evidence-id]`. Right selector remains
          `data-pi-evidence-id` because right Question Analysis is
          host-owned and unchanged.
        */}
        <PaperIntelligenceEvidenceLine
          containerRef={shellRef}
          leftScrollerRef={leftScrollerRef}
          rightPanelRef={rightPanelRef}
          activeQuestionId={activeQuestionId}
          activeEvidenceId={activeEvidenceId}
          activeEvidenceKind={activeEvidenceKind}
          leftSelectorPreset="paper-surface"
        />
      </div>
    </div>
  )
}

/* ─── Right panel: reuse existing PI analysis rendering ─── */

/**
 * Right-panel analysis renderer.
 *
 * C3 widens this from C1's read-only display to a clickable
 * surface. Each rendered row carries `data-pi-evidence-id` (the
 * host-owned PI namespace) so the cross-column line geometry's
 * right-side selector resolves them; clicking a row updates
 * `activeEvidenceId` via `onSelectEvidence`. The internal classes
 * (`pi-ps-analysis-*`) stay harness-local and are styled in
 * `paperIntelligencePaperSurfaceHarness.css`; no styles leak from
 * `paperIntelligence.css` into this surface.
 *
 * Text-only distractors (no quote) intentionally render as a plain
 * `<div>` rather than a `<button>` — the cross-column line cannot
 * anchor to a row whose evidence has no left-side range, so making
 * the row clickable would be a dead control.
 */
function AnalysisPanel({
  analysis,
  activeEvidenceId,
  onSelectEvidence,
}: {
  analysis: AnalysisView | null
  activeEvidenceId: string | null
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  if (!analysis) {
    return (
      <div className="pi-ps-analysis-empty">
        <p>点击左侧题目查看解析</p>
      </div>
    )
  }

  return (
    <div className="pi-ps-analysis" data-pi-question-id={analysis.questionId}>
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
      {analysis.answerEvidenceQuote && analysis.supportEvidenceId && (
        <SupportEvidenceRow
          evidenceId={analysis.supportEvidenceId}
          questionId={analysis.questionId}
          quote={analysis.answerEvidenceQuote}
          explanationZh={analysis.answerEvidenceExplanationZh}
          isSelected={analysis.supportEvidenceId === activeEvidenceId}
          onSelectEvidence={onSelectEvidence}
        />
      )}
      {analysis.distractors.length > 0 && (
        <div className="pi-ps-analysis-distractors">
          <h4>干扰项分析</h4>
          <ul>
            {analysis.distractors.map((d) => (
              <DistractorRow
                key={d.evidenceId}
                row={d}
                questionId={analysis.questionId}
                isSelected={d.evidenceId === activeEvidenceId}
                onSelectEvidence={onSelectEvidence}
              />
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

function SupportEvidenceRow(props: {
  evidenceId: string
  questionId: string
  quote: string
  explanationZh: string
  isSelected: boolean
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { evidenceId, questionId, quote, explanationZh, isSelected, onSelectEvidence } = props
  const className = isSelected
    ? 'pi-ps-analysis-evidence pi-ps-analysis-evidence--selected'
    : 'pi-ps-analysis-evidence'
  return (
    <button
      type="button"
      className={className}
      data-pi-evidence-id={evidenceId}
      data-pi-evidence-kind="support"
      data-pi-question-id={questionId}
      aria-pressed={isSelected}
      onClick={() => onSelectEvidence(evidenceId)}
    >
      <h4>答案依据</h4>
      <blockquote>{quote}</blockquote>
      {explanationZh && (
        <p className="pi-ps-analysis-explanation">{explanationZh}</p>
      )}
    </button>
  )
}

function DistractorRow(props: {
  row: AnalysisDistractorRow
  questionId: string
  isSelected: boolean
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { row, questionId, isSelected, onSelectEvidence } = props

  // Text-only distractors: there is no left-side anchor for the line
  // to connect to, so the row stays a plain <div>. The
  // `data-pi-evidence-id` is still emitted so future cuts (e.g. a
  // text-only badge target) can resolve the row, but no click
  // handler is wired.
  if (row.quoteIsTextOnly) {
    return (
      <li
        className="pi-ps-analysis-distractor"
        data-pi-evidence-id={row.evidenceId}
        data-pi-evidence-kind="trap"
        data-pi-question-id={questionId}
        data-pi-quote-text-only="true"
      >
        <span className="pi-ps-analysis-distractor-label">{row.optionLabel}.</span>
        <span>{row.shortReason}</span>
      </li>
    )
  }

  const className = isSelected
    ? 'pi-ps-analysis-distractor pi-ps-analysis-distractor--selected'
    : 'pi-ps-analysis-distractor'
  return (
    <li>
      <button
        type="button"
        className={className}
        data-pi-evidence-id={row.evidenceId}
        data-pi-evidence-kind="trap"
        data-pi-question-id={questionId}
        aria-pressed={isSelected}
        onClick={() => onSelectEvidence(row.evidenceId)}
      >
        <span className="pi-ps-analysis-distractor-label">{row.optionLabel}.</span>
        <span>{row.shortReason}</span>
        {row.quote && (
          <blockquote className="pi-ps-analysis-distractor-quote">{row.quote}</blockquote>
        )}
      </button>
    </li>
  )
}
