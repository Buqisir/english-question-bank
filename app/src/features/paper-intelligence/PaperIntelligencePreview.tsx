/**
 * PaperIntelligencePreview — interactive teacher-facing preview of a
 * Paper Intelligence V0 report.
 *
 * Cut D1 revision: paper-like flow + option-integrated analysis.
 *
 * Left panel (paper-like flow):
 *   - Passage header (with insight chip)
 *   - Passage body (highlighted)
 *   - Questions one after another — no LoadsPanel / OutlinePanel /
 *     ChunksSummary inline between passage and questions.
 *
 * Right panel (option-integrated analysis):
 *   - Q# / type / answer header
 *   - Stem
 *   - A/B/C/D option blocks, each with:
 *     - English option text
 *     - Chinese explanation
 *     - Why correct / why wrong
 *   - Correct option block includes synonym replacement info
 *   - No repeated full evidence quote — evidence shown via left-side
 *     highlight + cross-column dotted line.
 *
 * Passage insight:
 *   - Collapsed by default. Passage header shows a chip summarizing
 *     load level, evidence density, and key chunk count.
 *   - Click chip → expand insight panel/popover.
 *   - Close via: re-click "收起洞察", × button, or Esc key.
 *   - Only one passage's insight open at a time
 *     (activeInsightSection state).
 *
 * States preserved:
 *   - activeQuestionId (PRIMARY)
 *   - activeEvidenceId (SECONDARY, line-only)
 *   - activeInsightSection: string | null (NEW, max one)
 *
 * Architecture (kept clean):
 *   - All evidence/quote logic lives in
 *     `./preview/paperIntelligencePreviewModel`. The component never
 *     calls `passageBody.indexOf` / `includes` itself.
 *   - The line overlay lives in
 *     `./preview/paperIntelligenceEvidenceLine`. We do NOT import
 *     `reading-analysis/LinkOverlay` or any reading-analysis hook.
 *   - This file: fetch + state + render + effects.
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
  onAddQuestionGroup: (questionGroupId: string) => void
  /** Number of items currently in the basket. */
  basketCount: number
  /** Navigate back to the workbench. */
  onBackToWorkbench: () => void
}

function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

export function PaperIntelligencePreview({
  paperId,
  basketIds,
  availableQuestionGroupIds,
  onAddQuestionGroup,
  basketCount,
  onBackToWorkbench,
}: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [inputOptions, setInputOptions] = useState<Record<string, import('./paperIntelligenceTypes').QuestionOption[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  /**
   * SECONDARY state: which evidence row the cross-column dotted line
   * connects to.
   */
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  /**
   * Cut D1: which passage's insight panel is currently expanded.
   * Only one at a time. null = all collapsed.
   */
  const [activeInsightSection, setActiveInsightSection] = useState<string | null>(null)

  const shellRef = useRef<HTMLDivElement | null>(null)
  const mainScrollerRef = useRef<HTMLDivElement | null>(null)
  const sidePanelRef = useRef<HTMLElement | null>(null)

  // fetch report + input.json
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
        let inputOptionsData: Record<string, import('./paperIntelligenceTypes').QuestionOption[]> = {}
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
              // Extract options from input.json for each question
              if (p?.paperSection && Array.isArray(p.questions)) {
                for (const q of p.questions) {
                  if (!q?.questionNo || !Array.isArray(q.options)) continue
                  const opts: import('./paperIntelligenceTypes').QuestionOption[] = []
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
          /* swallow */
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

  // derive view model
  const view = useMemo(() => {
    if (!report) return null
    return buildPreviewView({ report, bodies, activeQuestionId, inputOptions })
  }, [report, bodies, activeQuestionId, inputOptions])

  /**
   * Reseed activeEvidenceId when activeQuestionId changes.
   */
  useEffect(() => {
    if (!activeQuestionId) {
      setActiveEvidenceId(null)
      return
    }
    const supportId = view?.activeAnalysis?.supportEvidenceId ?? null
    setActiveEvidenceId(supportId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestionId, view?.activeAnalysis?.supportEvidenceId])

  /**
   * Auto-scroll the first support highlight into view inside .pi-main.
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

  // Toast cleanup
  useEffect(() => {
    return (): void => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [])

  /**
   * Global Esc handler: close insight panel when open.
   */
  useEffect(() => {
    if (activeInsightSection === null) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setActiveInsightSection(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeInsightSection])

  if (loading) {
    return (
      <div className="pi-view">
        <PaperIntelligenceTopBar basketCount={basketCount} onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-error"><p>加载中…</p></div>
      </div>
    )
  }

  if (error || !report || !view) {
    return (
      <div className="pi-view">
        <PaperIntelligenceTopBar basketCount={basketCount} onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-error">
          <h2>未找到 Paper Intelligence 报告</h2>
          <p>{error || '报告数据为空。'}</p>
        </div>
      </div>
    )
  }

  const handleSelectQuestion = (id: string): void => {
    // Close insight panel when user clicks a question (switching from
    // "passage judgement" mode back to "teach question" mode).
    setActiveInsightSection(null)
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  const handleSelectEvidence = (evidenceId: string): void => {
    if (!activeQuestionId) return
    setActiveEvidenceId(evidenceId)
  }

  const handleAddQuestionGroup = (questionGroupId: string, paperSection: string): void => {
    onAddQuestionGroup(questionGroupId)
    const message = `已加入草稿卷：阅读理解 ${paperSection}`
    setToastMessage(message)
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null)
      toastTimerRef.current = null
    }, 3000)
  }

  const handleToggleInsight = (paperSection: string): void => {
    setActiveInsightSection((prev) => (prev === paperSection ? null : paperSection))
  }

  return (
    <div className="pi-view">
      <PaperIntelligenceTopBar basketCount={basketCount} onBackToWorkbench={onBackToWorkbench} />
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
                basketIds={basketIds}
                availableQuestionGroupIds={availableQuestionGroupIds}
                onAddQuestionGroup={handleAddQuestionGroup}
                activeInsightSection={activeInsightSection}
                onToggleInsight={handleToggleInsight}
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
        <PaperIntelligenceEvidenceLine
          containerRef={shellRef}
          leftScrollerRef={mainScrollerRef}
          rightPanelRef={sidePanelRef}
          activeQuestionId={activeQuestionId}
          activeEvidenceId={activeEvidenceId}
        />
      </div>
      {toastMessage !== null && (
        <div className="pi-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  )
}



/* ─── Top bar (Cut C) ─── */

function PaperIntelligenceTopBar({
  basketCount,
  onBackToWorkbench,
}: {
  basketCount: number
  onBackToWorkbench: () => void
}): ReactNode {
  return (
    <div className="pi-topbar" role="navigation" aria-label="Paper Intelligence top bar">
      <button
        type="button"
        className="pi-topbar-back"
        onClick={onBackToWorkbench}
        aria-label="返回工作台"
        data-pi-back-to-workbench="true"
      >
        <span aria-hidden="true" className="pi-topbar-back-arrow">←</span>
        返回工作台
      </button>
      <span className="pi-topbar-tagline">一张卷，10 分钟看懂讲哪里</span>
      <span
        className="pi-topbar-basket"
        aria-label={`草稿卷 ${basketCount} 题`}
        data-pi-basket-count={basketCount}
      >
        草稿卷 {basketCount}
      </span>
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
      <div className="pi-disclaimer">AI 初判，需教研复核 — 不作为权威结论</div>
    </header>
  )
}

/* ─── Passage Section (Cut D1: paper-like flow) ─── */

type PassageAddState = 'addable' | 'in-basket' | 'not-bound' | 'not-found'

function resolvePassageAddState(args: {
  questionGroupId: string | undefined
  basketIds: Set<string>
  availableQuestionGroupIds: Set<string>
}): PassageAddState {
  const { questionGroupId, basketIds, availableQuestionGroupIds } = args
  if (!questionGroupId) return 'not-bound'
  if (basketIds.has(questionGroupId)) return 'in-basket'
  if (!availableQuestionGroupIds.has(questionGroupId)) return 'not-found'
  return 'addable'
}

/**
 * Compute a short insight summary string for the chip.
 * Format: "洞察：负荷轻 · 证据适中 · 词块 6"
 */
function buildInsightChipLabel(reportPassage: PassageReport): string {
  const loads = reportPassage.loads
  const avgScore =
    (loads.vocabularyChunkLoad.score +
      loads.grammarLoad.score +
      loads.discourseStructureLoad.score +
      loads.topicBackgroundLoad.score +
      loads.evidenceFindingLoad.score) /
    5
  const loadLabel = avgScore <= 2 ? '负荷轻' : avgScore <= 3.5 ? '负荷适中' : '负荷重'
  const evidenceScore = loads.evidenceFindingLoad.score
  const evidenceLabel =
    evidenceScore <= 2 ? '证据易' : evidenceScore <= 3 ? '证据适中' : '证据难'
  const chunkCount = Array.isArray(reportPassage.keyChunks) ? reportPassage.keyChunks.length : 0
  return `洞察：${loadLabel} · ${evidenceLabel} · 词块 ${chunkCount}`
}

function PassageSection(props: {
  passageView: PassagePreviewView
  reportPassage: PassageReport | undefined
  activeQuestionId: string | null
  onSelectQuestion: (id: string) => void
  basketIds: Set<string>
  availableQuestionGroupIds: Set<string>
  onAddQuestionGroup: (questionGroupId: string, paperSection: string) => void
  activeInsightSection: string | null
  onToggleInsight: (paperSection: string) => void
}): ReactNode {
  const {
    passageView,
    reportPassage,
    activeQuestionId,
    onSelectQuestion,
    basketIds,
    availableQuestionGroupIds,
    onAddQuestionGroup,
    activeInsightSection,
    onToggleInsight,
  } = props
  const questionGroupId = reportPassage?.questionGroupId
  const addState = resolvePassageAddState({
    questionGroupId,
    basketIds,
    availableQuestionGroupIds,
  })
  const insightOpen = activeInsightSection === passageView.paperSection

  return (
    <section className="pi-passage" data-pi-paper-section={passageView.paperSection}>
      <div className="pi-passage-header">
        <h2 className="pi-passage-title">
          <span className="pi-section-badge">{passageView.paperSection}</span>
          {passageView.passageTitle || `篇章 ${passageView.paperSection}`}
        </h2>
        <div className="pi-passage-header-actions">
          {reportPassage && (
            <span className="pi-insight-chip-anchor">
              <button
                type="button"
                className={insightOpen ? 'pi-insight-chip pi-insight-chip--open' : 'pi-insight-chip'}
                onClick={() => onToggleInsight(passageView.paperSection)}
                aria-expanded={insightOpen}
                aria-label={insightOpen ? '收起洞察' : buildInsightChipLabel(reportPassage)}
                data-pi-insight-chip={passageView.paperSection}
              >
                {insightOpen ? '收起洞察' : buildInsightChipLabel(reportPassage)}
              </button>
              {insightOpen && (
                <InsightPanel
                  reportPassage={reportPassage}
                  onClose={() => onToggleInsight(passageView.paperSection)}
                />
              )}
            </span>
          )}
          <span className="pi-band" data-band={passageView.bandLabel}>
            {passageView.bandLabel}
          </span>
          <PassageAddAction
            addState={addState}
            paperSection={passageView.paperSection}
            questionGroupId={questionGroupId}
            onAdd={onAddQuestionGroup}
          />
        </div>
      </div>

      <PassageBody segments={passageView.segments} />

      {/* Cut D1: NO LoadsPanel / OutlinePanel / ChunksSummary inline here.
          They moved into the InsightPanel above. */}

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



/* ─── Insight Panel (Cut D1) ─── */

/**
 * Header-anchored popover that shows loads, outline, and key chunks.
 * Positioned absolutely below the insight chip — does NOT occupy
 * document flow, so PassageBody / mark[data-pi-evidence-id] layout
 * coordinates stay stable.
 *
 * Close via: × button (rendered here), Esc (handled at top level),
 * or clicking a question card (handled in handleSelectQuestion).
 */
function InsightPanel(props: {
  reportPassage: PassageReport
  onClose: () => void
}): ReactNode {
  const { reportPassage, onClose } = props
  return (
    <div className="pi-insight-panel" data-pi-insight-panel={reportPassage.paperSection} role="dialog" aria-label="篇章洞察">
      <div className="pi-insight-panel-header">
        <span className="pi-insight-panel-title">篇章洞察</span>
        <button
          type="button"
          className="pi-insight-panel-close"
          onClick={onClose}
          aria-label="关闭洞察面板"
        >
          ×
        </button>
      </div>
      <LoadsPanel loads={reportPassage.loads} />
      <OutlinePanel outline={reportPassage.passageOutline} />
      <ChunksSummary chunks={reportPassage.keyChunks} />
    </div>
  )
}

/* ─── Cut B "加入草稿卷" action ─── */

function PassageAddAction(props: {
  addState: PassageAddState
  paperSection: string
  questionGroupId: string | undefined
  onAdd: (questionGroupId: string, paperSection: string) => void
}): ReactNode {
  const { addState, paperSection, questionGroupId, onAdd } = props

  if (addState === 'in-basket') {
    return (
      <span className="pi-passage-action-group" data-pi-add-state={addState}>
        <span className="pi-passage-action-status">已在草稿卷</span>
        <button
          type="button"
          className="pi-passage-action pi-passage-action--in-basket"
          disabled
          aria-disabled="true"
          aria-label={`已加入草稿卷：阅读理解 ${paperSection}`}
          data-pi-add-state={addState}
        >
          已加入
        </button>
      </span>
    )
  }

  if (addState === 'not-bound') {
    return (
      <button
        type="button"
        className="pi-passage-action pi-passage-action--disabled"
        disabled
        aria-disabled="true"
        title="此篇暂无题组绑定"
        aria-label="此篇暂无题组绑定"
        data-pi-add-state={addState}
      >
        暂不可加入
      </button>
    )
  }

  if (addState === 'not-found') {
    return (
      <button
        type="button"
        className="pi-passage-action pi-passage-action--disabled"
        disabled
        aria-disabled="true"
        title="本地题库未找到绑定题组"
        aria-label="本地题库未找到绑定题组"
        data-pi-add-state={addState}
      >
        题组未找到
      </button>
    )
  }

  const targetId = questionGroupId as string
  return (
    <button
      type="button"
      className="pi-passage-action pi-passage-action--addable"
      onClick={() => onAdd(targetId, paperSection)}
      aria-label={`加入草稿卷：阅读理解 ${paperSection}`}
      data-pi-add-state={addState}
      data-pi-question-group-id={targetId}
    >
      加入草稿卷
    </button>
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

/* ─── Loads (score / label / shortReason only) ─── */

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

/* ─── Key chunks (summary only) ─── */

function ChunksSummary({ chunks }: { chunks: KeyChunk[] }): ReactNode {
  const count = Array.isArray(chunks) ? chunks.length : 0
  return (
    <div className="pi-chunks">
      <h3 className="pi-chunks-title">重要词块 · {count} 个</h3>
    </div>
  )
}



/* ─── Question Card (Cut D1: lightweight active signal) ─── */

/**
 * Clickable question row in the left panel. Cut D1 changes:
 *   - No big card active highlight (background fill removed).
 *   - Lightweight active signal: left accent border + blue dot on Q#.
 *   - aria-current="true" on the active card for a11y.
 */
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
      aria-current={isActive ? 'true' : undefined}
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

/* ─── Right-side Analysis Panel (Cut D1: option-integrated) ─── */

/**
 * Option-integrated analysis panel. Instead of a "解析文档" layout,
 * each option (A/B/C/D) gets its own block showing:
 *   - English option text
 *   - Chinese explanation (why correct / why wrong)
 *   - For the correct option: synonym replacement / locating info
 *
 * Evidence quotes are NOT repeated in full here — the left-side
 * highlight + cross-column dotted line handles that. Each option
 * block carries `data-pi-evidence-id` as the line source anchor.
 */
function AnalysisPanel(props: {
  analysis: AnalysisView | null
  activeEvidenceId: string | null
  onSelectEvidence: (evidenceId: string) => void
}): ReactNode {
  const { analysis, activeEvidenceId, onSelectEvidence } = props
  if (!analysis) {
    return <div className="pi-analysis-empty">点击左侧题目查看解析</div>
  }

  // Build a map of option label → distractor row for quick lookup
  const distractorMap = new Map<string, AnalysisDistractorRow>()
  for (const d of analysis.distractors) {
    distractorMap.set(d.optionLabel, d)
  }

  // Build a map of option label → English content for quick lookup
  const optionContentMap = new Map<string, string>()
  for (const opt of analysis.optionsForDisplay) {
    optionContentMap.set(opt.label, opt.content)
  }

  // All option labels in order (A, B, C, D)
  const allLabels = ['A', 'B', 'C', 'D']

  return (
    <div data-pi-question-id={analysis.questionId}>
      <div className="pi-analysis-head">
        <span className="pi-analysis-question-no">Q{analysis.questionNo}</span>
        <span className="pi-analysis-type">{analysis.teacherQuestionType}</span>
        <span className="pi-analysis-answer">答案 {analysis.answer}</span>
      </div>
      <p className="pi-analysis-stem">{analysis.stem}</p>
      {analysis.stemTranslation && (
        <p className="pi-analysis-stem-zh">{analysis.stemTranslation}</p>
      )}

      <div className="pi-analysis-section">选项解析</div>

      {allLabels.map((label) => {
        const isCorrect = label === analysis.answer
        const distractor = distractorMap.get(label)

        if (isCorrect) {
          // Correct option block
          const evidenceId = analysis.supportEvidenceId
          const isSelected = evidenceId !== null && evidenceId === activeEvidenceId
          const blockClass = isSelected
            ? 'pi-option-block pi-option-block--correct pi-option-block--selected'
            : 'pi-option-block pi-option-block--correct'

          return (
            <button
              key={label}
              type="button"
              className={blockClass}
              data-pi-evidence-id={evidenceId ?? undefined}
              data-pi-evidence-kind="support"
              data-pi-question-id={analysis.questionId}
              data-pi-option-label={label}
              aria-pressed={isSelected}
              onClick={() => evidenceId && onSelectEvidence(evidenceId)}
            >
              <div className="pi-option-block-head">
                <span className="pi-option-block-label pi-option-block-label--correct">{label}</span>
                <span className="pi-option-block-tag--correct">正确</span>
              </div>
              <div className="pi-option-block-content">{optionContentMap.get(label) || '—'}</div>
              <div className="pi-option-block-explanation">
                {analysis.answerEvidenceExplanationZh || '—'}
              </div>
              {analysis.synonymSummary && (
                <div className="pi-option-block-synonym">
                  <span className="pi-option-block-synonym-tag">同义替换</span>
                  {analysis.synonymSummary}
                </div>
              )}
            </button>
          )
        }

        // Distractor option block
        if (!distractor) {
          // Option not in distractors (rare)
          return (
            <div key={label} className="pi-option-block">
              <div className="pi-option-block-head">
                <span className="pi-option-block-label">{label}</span>
              </div>
              <div className="pi-option-block-explanation">无分析数据</div>
            </div>
          )
        }

        const isTextOnly = distractor.quoteIsTextOnly
        const evidenceId = distractor.evidenceId
        const isSelected = evidenceId === activeEvidenceId

        if (isTextOnly) {
          // Text-only distractor: plain div, NOT a button, no line anchor
          return (
            <div
              key={label}
              className="pi-option-block pi-option-block--wrong"
              data-pi-evidence-id={evidenceId}
              data-pi-evidence-kind="trap"
              data-pi-question-id={analysis.questionId}
              data-pi-option-label={label}
              data-pi-quote-text-only="true"
            >
              <div className="pi-option-block-head">
                <span className="pi-option-block-label pi-option-block-label--wrong">{label}</span>
                {distractor.category && (
                  <span className="pi-option-block-cat">
                    {distractor.category}
                    {distractor.subtype ? ` / ${distractor.subtype}` : ''}
                  </span>
                )}
                <span className="pi-option-block-text-only">text-only</span>
              </div>
              <div className="pi-option-block-content">{optionContentMap.get(label) || '—'}</div>
              <div className="pi-option-block-explanation">
                {distractor.shortReason}
              </div>
            </div>
          )
        }

        // Quoted distractor: button, clickable for line switching
        const blockClass = isSelected
          ? 'pi-option-block pi-option-block--wrong pi-option-block--selected'
          : 'pi-option-block pi-option-block--wrong'

        return (
          <button
            key={label}
            type="button"
            className={blockClass}
            data-pi-evidence-id={evidenceId}
            data-pi-evidence-kind="trap"
            data-pi-question-id={analysis.questionId}
            data-pi-option-label={label}
            aria-pressed={isSelected}
            onClick={() => onSelectEvidence(evidenceId)}
          >
            <div className="pi-option-block-head">
              <span className="pi-option-block-label pi-option-block-label--wrong">{label}</span>
              {distractor.category && (
                <span className="pi-option-block-cat">
                  {distractor.category}
                  {distractor.subtype ? ` / ${distractor.subtype}` : ''}
                </span>
              )}
            </div>
            <div className="pi-option-block-content">{optionContentMap.get(label) || '—'}</div>
            <div className="pi-option-block-explanation">
              {distractor.shortReason}
            </div>
          </button>
        )
      })}

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
