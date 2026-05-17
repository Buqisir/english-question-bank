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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Lightweight, props-only projection of one Assembly Basket item that the
 * Paper Intelligence top-bar popover renders. The PI feature directory is
 * deliberately decoupled from the workbench domain types and the basket
 * draft hook, so App.tsx must pre-resolve every field a teacher needs to
 * inspect — section, passage title, question count, total score, source
 * paper name. PI never calls back with this `id`; it's only a stable React
 * key. There is no remove / reorder / select operation in this surface.
 */
export type BasketPreviewItem = {
  id: string
  paperSection: string
  passageTitle: string
  groupTypeLabel: string
  questionCount: number
  totalScore: number
  sourcePaperName: string
}

type Props = {
  paperId: string | null
  /** Set of question group ids currently in the draft basket. */
  basketIds: Set<string>
  /** Set of question group ids that the local bank can resolve. */
  availableQuestionGroupIds: Set<string>
  onAddQuestionGroup: (questionGroupId: string) => void
  /** Number of items currently in the basket. */
  basketCount: number
  /**
   * Resolved, read-only projection of the current Assembly Basket so the
   * top bar can show a preview popover. Order matches insertion order
   * (App owns ordering). Empty array → empty-state copy is shown.
   */
  basketPreviewItems: ReadonlyArray<BasketPreviewItem>
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
  basketPreviewItems,
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
        <PaperIntelligenceTopBar
          basketCount={basketCount}
          basketPreviewItems={basketPreviewItems}
          onBackToWorkbench={onBackToWorkbench}
        />
        <div className="pi-error"><p>加载中…</p></div>
      </div>
    )
  }

  if (error || !report || !view) {
    return (
      <div className="pi-view">
        <PaperIntelligenceTopBar
          basketCount={basketCount}
          basketPreviewItems={basketPreviewItems}
          onBackToWorkbench={onBackToWorkbench}
        />
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
      <PaperIntelligenceTopBar
        basketCount={basketCount}
        basketPreviewItems={basketPreviewItems}
        onBackToWorkbench={onBackToWorkbench}
      />
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



/* ─── Top bar (Cut C + Issue #20 basket preview entry) ─── */

function PaperIntelligenceTopBar({
  basketCount,
  basketPreviewItems,
  onBackToWorkbench,
}: {
  basketCount: number
  basketPreviewItems: ReadonlyArray<BasketPreviewItem>
  onBackToWorkbench: () => void
}): ReactNode {
  /*
   * Issue #20: the "草稿卷 N" badge used to be a static <span> — teachers
   * could see the count grow but had to bounce back to the workbench to
   * confirm what was actually inside. We now render it as a real button
   * that opens a lightweight read-only popover.
   *
   * Scope is deliberately narrow:
   *   - Local-only `isBasketPreviewOpen` state. It does NOT touch
   *     activeQuestionId, activeEvidenceId, activeInsightSection, the
   *     evidence line, or the route. Insight popover and basket popover
   *     are independent surfaces.
   *   - No remove / reorder / save / export. Read-only inspection.
   *   - No auto-open. The popover is closed on every mount.
   *
   * Close paths: re-click the button, click outside the popover, press Esc.
   */
  const [isBasketPreviewOpen, setIsBasketPreviewOpen] = useState(false)
  const basketButtonRef = useRef<HTMLButtonElement | null>(null)

  // Auto-close when the basket count drops to 0 from a non-zero state
  // would be counter-productive — the teacher might still want to see the
  // empty state. We leave the open state alone and let the popover render
  // its empty-state copy. The teacher closes it explicitly.

  const toggleBasketPreview = (): void => {
    setIsBasketPreviewOpen((prev) => !prev)
  }
  const closeBasketPreview = (): void => {
    setIsBasketPreviewOpen(false)
  }

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
      <button
        ref={basketButtonRef}
        type="button"
        className={
          isBasketPreviewOpen
            ? 'pi-topbar-basket pi-topbar-basket--open'
            : 'pi-topbar-basket'
        }
        onClick={toggleBasketPreview}
        aria-haspopup="dialog"
        aria-expanded={isBasketPreviewOpen}
        aria-controls="pi-basket-preview-popover"
        aria-label={`草稿卷 ${basketCount} 题，点击查看`}
        data-pi-basket-count={basketCount}
        data-pi-basket-toggle="true"
      >
        草稿卷 {basketCount}
        <span aria-hidden="true" className="pi-topbar-basket-caret">▾</span>
      </button>
      {isBasketPreviewOpen && (
        <BasketPreviewPopover
          items={basketPreviewItems}
          anchorRef={basketButtonRef}
          onClose={closeBasketPreview}
        />
      )}
    </div>
  )
}

/* ─── Issue #20: basket preview popover ─── */

/**
 * Width / spacing constants for the basket preview popover, kept in sync
 * with the matching `.pi-basket-preview-popover` rule in
 * paperIntelligence.css. If one moves, move both.
 */
const BASKET_PREVIEW_WIDTH = 320
const BASKET_PREVIEW_GAP = 6
const BASKET_PREVIEW_VIEWPORT_PAD = 12

function computeBasketPreviewPosition(
  anchorRect: DOMRect,
  viewportWidth: number,
): { top: number; left: number } {
  const top = anchorRect.bottom + BASKET_PREVIEW_GAP
  // Right-align the popover to the basket button so it grows to the left
  // (the button sits at the right edge of the top bar). Clamp into the
  // viewport so the popover never disappears past either edge.
  const desiredLeft = anchorRect.right - BASKET_PREVIEW_WIDTH
  const minLeft = BASKET_PREVIEW_VIEWPORT_PAD
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - BASKET_PREVIEW_WIDTH - BASKET_PREVIEW_VIEWPORT_PAD,
  )
  const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft)
  return { top, left }
}

/**
 * Read-only popover that lists the items currently in the Assembly Basket.
 *
 * Portal strategy mirrors `InsightPanel`: render into `document.body` so
 * the popover escapes the top bar's flex layout and any future stacking
 * traps. Positioning is recomputed on scroll (capture phase, to catch
 * inner scrollers) and resize so the popover keeps tracking the basket
 * button when the page reflows.
 *
 * Close paths handled here:
 *   - Esc keydown.
 *   - Mousedown outside both the popover and the anchor button. We use
 *     mousedown rather than click so the close fires before the anchor
 *     button's own click handler would otherwise re-open the popover.
 *
 * Re-clicking the basket button itself is handled at the top-bar level
 * (the button's onClick toggles `isBasketPreviewOpen`); we explicitly skip
 * outside-click handling when the event target is inside the anchor so
 * the toggle closes cleanly without a double-flip.
 */
function BasketPreviewPopover(props: {
  items: ReadonlyArray<BasketPreviewItem>
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}): ReactNode {
  const { items, anchorRef, onClose } = props
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const update = (): void => {
      const rect = anchor.getBoundingClientRect()
      const vw =
        typeof window !== 'undefined'
          ? window.innerWidth || document.documentElement.clientWidth
          : 1024
      setPosition(computeBasketPreviewPosition(rect, vw))
    }
    update()

    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return (): void => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef])

  // Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Outside-click closes. We bind on mousedown so the close runs before
  // the basket button's onClick re-opens the popover when the click
  // happens on the anchor itself.
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current && popoverRef.current.contains(target)) return
      if (anchorRef.current && anchorRef.current.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorRef, onClose])

  if (typeof document === 'undefined') return null
  if (!position) return null

  const isEmpty = items.length === 0

  return createPortal(
    <div
      ref={popoverRef}
      id="pi-basket-preview-popover"
      className="pi-basket-preview-popover"
      role="dialog"
      aria-label="草稿卷预览"
      data-pi-basket-popover="true"
      data-pi-basket-popover-empty={isEmpty ? 'true' : 'false'}
      style={{ top: position.top, left: position.left }}
    >
      <div className="pi-basket-preview-header">
        <span className="pi-basket-preview-title">草稿卷</span>
        <span className="pi-basket-preview-summary">
          {isEmpty ? '尚未加入题组' : `已加入 ${items.length} 个题组`}
        </span>
      </div>
      {isEmpty ? (
        <div className="pi-basket-preview-empty" data-pi-basket-empty-state="true">
          <p>草稿卷还是空的</p>
          <p className="pi-basket-preview-empty-hint">
            在篇章标题处点击「加入草稿卷」后会显示在这里
          </p>
        </div>
      ) : (
        <ul className="pi-basket-preview-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="pi-basket-preview-item"
              data-pi-basket-item-id={item.id}
            >
              <div className="pi-basket-preview-item-title">
                <span className="pi-basket-preview-item-section">{item.paperSection}</span>
                <span className="pi-basket-preview-item-passage">{item.passageTitle}</span>
              </div>
              <div className="pi-basket-preview-item-meta">
                <span>{item.groupTypeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{item.questionCount}题</span>
                <span aria-hidden="true">·</span>
                <span>{formatBasketScore(item.totalScore)}分</span>
              </div>
              {item.sourcePaperName && (
                <div className="pi-basket-preview-item-source">{item.sourcePaperName}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  )
}

/**
 * Format a basket score so whole numbers stay clean ("8") and half-point
 * scores read as "7.5" rather than "7.50". Keeps the popover compact.
 */
function formatBasketScore(score: number): string {
  if (!Number.isFinite(score)) return '0'
  if (Number.isInteger(score)) return String(score)
  return score.toFixed(1).replace(/\.0$/, '')
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
              <InsightChipAndPanel
                paperSection={passageView.paperSection}
                reportPassage={reportPassage}
                insightOpen={insightOpen}
                onToggle={() => onToggleInsight(passageView.paperSection)}
              />
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
 * Chip + popover panel pair.
 *
 * Portal strategy (QA #19 fix):
 *   The popover is rendered into `document.body` via `createPortal`
 *   and uses `position: fixed` coordinates derived from the chip's
 *   `getBoundingClientRect()`. This deliberately bypasses two
 *   stacking / clipping traps in the surrounding layout:
 *
 *     1. The left passage column (`.pi-main`) is its own scroll
 *        container (`overflow-y: auto`). Per CSS overflow rules, a
 *        non-`visible` `overflow-y` clamps `overflow-x` to `auto`
 *        too, so an `position: absolute` popover anchored inside
 *        `.pi-main` would be clipped horizontally as soon as it
 *        extends beyond the column edge or vertically as soon as it
 *        runs past the scroller's viewport.
 *
 *     2. The right Analysis Panel (`.pi-side`) is `position: sticky`
 *        which establishes its own stacking context. Even bumping
 *        the popover's z-index to a large number does not let an
 *        element inside `.pi-main`'s stacking context paint above a
 *        sibling sticky stacking context. Portaling to `<body>`
 *        sidesteps that entirely — there is no longer a competing
 *        ancestor stacking context, so a single high z-index wins.
 *
 *   We recompute coordinates on every scroll (capture phase, to
 *   catch the inner `.pi-main` scroller as well as the document /
 *   window) and on resize, so the popover tracks the chip while the
 *   teacher scrolls. When the chip leaves the viewport we leave the
 *   panel where it is — closing on scroll-out would be fighting the
 *   teacher; the Esc key, the × button and re-clicking the chip
 *   remain the explicit close paths.
 */
function InsightChipAndPanel(props: {
  paperSection: string
  reportPassage: PassageReport
  insightOpen: boolean
  onToggle: () => void
}): ReactNode {
  const { paperSection, reportPassage, insightOpen, onToggle } = props
  const chipRef = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className={insightOpen ? 'pi-insight-chip pi-insight-chip--open' : 'pi-insight-chip'}
        onClick={onToggle}
        aria-expanded={insightOpen}
        aria-label={insightOpen ? '收起洞察' : buildInsightChipLabel(reportPassage)}
        data-pi-insight-chip={paperSection}
      >
        {insightOpen ? '收起洞察' : buildInsightChipLabel(reportPassage)}
      </button>
      {insightOpen && (
        <InsightPanel
          reportPassage={reportPassage}
          chipRef={chipRef}
          onClose={onToggle}
        />
      )}
    </>
  )
}

/**
 * Panel width used by the position calculator. Kept in sync with
 * `.pi-insight-panel { width: 360px }` in paperIntelligence.css. If
 * one moves, move both.
 */
const INSIGHT_PANEL_WIDTH = 360
const INSIGHT_PANEL_GAP = 4
const INSIGHT_PANEL_VIEWPORT_PAD = 16

type InsightPanelPosition = { top: number; left: number }

function computeInsightPanelPosition(
  chipRect: DOMRect,
  viewportWidth: number,
): InsightPanelPosition {
  const top = chipRect.bottom + INSIGHT_PANEL_GAP
  // Prefer left-aligning to the chip; clamp into the viewport so the
  // popover never disappears past the right edge on narrow widths.
  const desiredLeft = chipRect.left
  const maxLeft = Math.max(
    INSIGHT_PANEL_VIEWPORT_PAD,
    viewportWidth - INSIGHT_PANEL_WIDTH - INSIGHT_PANEL_VIEWPORT_PAD,
  )
  const left = Math.min(Math.max(desiredLeft, INSIGHT_PANEL_VIEWPORT_PAD), maxLeft)
  return { top, left }
}

/**
 * Header-anchored popover that shows loads, outline, and key chunks.
 * Renders into `document.body` via Portal so it escapes the left
 * column's overflow clipping and the right panel's sticky stacking
 * context. See `InsightChipAndPanel` for the rationale.
 *
 * Close via: × button (rendered here), Esc (handled at top level),
 * or clicking a question card (handled in handleSelectQuestion).
 */
function InsightPanel(props: {
  reportPassage: PassageReport
  chipRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}): ReactNode {
  const { reportPassage, chipRef, onClose } = props
  const [position, setPosition] = useState<InsightPanelPosition | null>(null)

  useLayoutEffect(() => {
    const chip = chipRef.current
    if (!chip) return

    const update = (): void => {
      const rect = chip.getBoundingClientRect()
      const vw =
        typeof window !== 'undefined'
          ? window.innerWidth || document.documentElement.clientWidth
          : 1024
      setPosition(computeInsightPanelPosition(rect, vw))
    }
    update()

    // Capture-phase scroll listener catches inner scrollers
    // (`.pi-main`, sticky panels, etc.) that don't bubble scroll to
    // window. Resize keeps the clamp accurate when the layout reflows.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return (): void => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [chipRef])

  if (typeof document === 'undefined') return null
  if (!position) {
    // First paint: layout effect hasn't measured yet. Render nothing
    // so the panel doesn't flash at (0,0). The effect runs
    // synchronously before paint, so this branch is effectively
    // unreachable in the browser, but keeps SSR / tests safe.
    return null
  }

  return createPortal(
    <div
      className="pi-insight-panel"
      data-pi-insight-panel={reportPassage.paperSection}
      role="dialog"
      aria-label="篇章洞察"
      style={{ top: position.top, left: position.left }}
    >
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
    </div>,
    document.body,
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
