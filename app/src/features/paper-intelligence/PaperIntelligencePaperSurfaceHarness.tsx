/**
 * PaperIntelligencePaperSurfaceHarness — Issue #21-C1 / C2 / C3 / C4.
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
 * What this harness does NOT do (after C4):
 *   - No basket interaction.
 *   - No reading mode.
 *   - No annotation pack UI.
 *   - No flip of the default PI route.
 *
 * What C4 ADDS to the harness (host-only, PaperSurface stays dumb):
 *   - A compact left insight rail (`.pi-ps-insight-rail`) sits
 *     `position: absolute` inside `.pi-ps-harness-shell` (so the
 *     existing `1fr 858px 380px` no-right-gutter grid stays unchanged
 *     and no new grid track is introduced). Replaces the prior
 *     top horizontal `.pi-ps-insight-chip-strip` after PR #52 PA
 *     review (rejected the top strip; required a left rail + warm
 *     full-bleed right analysis).
 *   - The rail collapses to 48px in the outer-left desk gutter and
 *     expands to 160px on `:hover`, `:focus-within`, or the toggle
 *     button's `[data-rail-locked]`. At 1536px+ only, an active
 *     inline detail expands the rail to 240px.
 *   - One insight chip per `report.passages[*].paperSection` rendered
 *     always inside the left rail (`.pi-ps-insight-rail`). The rail is
 *     always in the DOM at every viewport width. CSS media queries
 *     control rail sizing and detail mode but never unmount the rail.
 *     PA-approved rule: insight entry always lives on the left.
 *   - The right analysis aside paints a warm cream full-bleed
 *     background via `.pi-ps-harness-right::before` reaching to the
 *     viewport's right edge while the actual analysis text stays
 *     inside `.pi-ps-harness-right-inner` at `max-width: 400px`.
 *   - `activeInsightSection: string | null` state, max one open at a
 *     time.
 *   - `railLocked: boolean` state, toggled by the rail's leading
 *     button (a real `<button>` with `aria-expanded` / `aria-controls`).
 *   - Clicking a chip aligns the matching `[data-paper-section]`
 *     PaperSurface section root into the left scroller (this is the
 *     only DOM read against PaperSurface and it uses the existing
 *     section anchor — no new `data-paper-*` is introduced). Because
 *     the rail lives outside `.pi-ps-harness-left`, scrolling a
 *     section into view never moves the chip out of the viewport,
 *     so the popover anchor stays onscreen.
 *   - On wide desktop, the active chip renders inline detail inside
 *     the rail. Below 1536px, the active topbar chip mounts an
 *     `<AnchoredPopover>` (reused unchanged from
 *     `preview/AnchoredPopover.tsx`) whose body is the harness-local
 *     `<HarnessInsightPanelContent />`.
 *   - `request-lecture-focus` clears `activeInsightSection` AND
 *     `railLocked` (matches default PI's "selecting a question card
 *     closes the insight popover"; the rail compacts back too).
 *   - matchMedia breakpoint changes clear `activeInsightSection` AND
 *     `railLocked` so the popover anchor cannot resolve to a node
 *     about to unmount.
 *   - Right-panel evidence/distractor click does NOT clear
 *     `activeInsightSection`.
 *   - PaperSurface is unchanged. The harness does not import any
 *     new module from `shared-ui/papersurface`. PaperSurface still
 *     emits no `data-pi-*`. The chip carries a host-owned
 *     `data-pi-insight-chip="<section>"` attribute; PaperSurface is
 *     never told about insights, popovers, or basket.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { buildPaperSurfaceDataFromPi } from './adapter/index.ts'
import {
  buildPreviewView,
  type AnalysisDistractorRow,
  type AnalysisView,
} from './preview/paperIntelligencePreviewModel'
import { PaperIntelligenceEvidenceLine } from './preview/paperIntelligenceEvidenceLine'
import { AnchoredPopover } from './preview/AnchoredPopover'
import { buildInsightChipLabel } from './insight/insightChipLabel'
import { buildInsightChipShortLabel } from './insight/insightChipShortLabel'
import { HarnessInsightPanelContent } from './insight/HarnessInsightPanelContent'
import type {
  PaperIntelligenceReport,
  PassageReport,
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

  /**
   * C4: which passage's insight popover is currently expanded.
   * Max one open at a time. Cleared by `request-lecture-focus`
   * (selecting a question card) and by re-clicking the same chip.
   * NOT cleared by right-panel evidence / distractor selection
   * (insight + evidence are independent teacher views).
   */
  const [activeInsightSection, setActiveInsightSection] = useState<string | null>(null)

  /**
   * C4 PR #52 PA must-fix: left insight rail expansion lock.
   *
   * The rail is normally collapsed (48px). Hovering or moving focus
   * into the rail soft-expands it via CSS (`:hover` /
   * `:focus-within`). A teacher who wants the rail pinned can click
   * the leading toggle button, which sets `railLocked = true` and
   * the harness paints `data-rail-locked="true"` on the aside so the
   * CSS keeps it expanded without hover / focus.
   *
   * Esc inside the rail clears the lock and any active popover.
   * `request-lecture-focus` (selecting a question card) also clears
   * the lock so picking a question compacts the rail back.
   * matchMedia breakpoint changes clear the lock too — the rail is
   * gone in stacked mode and the lock should not re-engage when the
   * teacher resizes back to desktop.
   */
  const [railLocked, setRailLocked] = useState<boolean>(false)

  /**
   * C4 PR #52 PA must-fix: viewport-mode detection for rail vs
   * topbar chip-row conditional rendering.
   *
   * Q1 decision (PA-approved): `matchMedia` + state conditional
   * render. Chips are NEVER double-rendered — exactly one
   * `<button data-pi-insight-chip="...">` exists in the DOM at a
   * time, so the popover's anchorRef cannot resolve to the wrong
   * element on breakpoint cross.
   *
   * SSR seed is `false` so the desktop tree is the default; the
   * mount effect below syncs to the real `matchMedia` value and
   * subscribes to changes.
   */
  const [isStackedMode, setIsStackedMode] = useState<boolean>(false)
  const [isWideDesktop, setIsWideDesktop] = useState<boolean>(false)

  // Refs for the cross-column line geometry (C3).
  const shellRef = useRef<HTMLDivElement | null>(null)
  const leftScrollerRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLElement | null>(null)

  /**
   * C4 chip ref map. The harness renders one `<button>` per passage
   * section; each button gets a stable ref object keyed by section id
   * so the AnchoredPopover anchorRef can stay a single object that
   * always points at the currently-active chip.
   *
   * The map is keyed by `paperSection` (the same id space as
   * PaperSurface's existing `[data-paper-section]` anchor). Refs are
   * created lazily on first request and reused across renders, so
   * React's ref attribute mutates the same object the popover reads
   * from.
   */
  type ChipRef = { current: HTMLButtonElement | null }
  const chipRefMap = useRef<Map<string, ChipRef>>(new Map())
  const getChipRef = useCallback((paperSection: string): ChipRef => {
    let ref = chipRefMap.current.get(paperSection)
    if (!ref) {
      ref = { current: null }
      chipRefMap.current.set(paperSection, ref)
    }
    return ref
  }, [])

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

  // ─── C4 PR #52: viewport-mode detection ───
  //
  // Listen to both `(max-width: 1199px)` and `(min-width: 1536px)`.
  // The 240px inline rail detail is only geometrically safe at >=1536px.
  // Between 1200px and 1535px the rail uses short labels and
  // AnchoredPopover for detail. At <=1199px the rail becomes a fixed
  // left handle with a drawer detail.
  //
  // PA-approved rule: the rail is always in the DOM. matchMedia only
  // controls detail-surface selection and CSS sizing, NOT rail mount.
  //
  // When the breakpoint crosses we close any open insight detail/popover
  // and clear the rail lock so stale state doesn't persist across
  // viewport mode transitions.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.matchMedia !== 'function') return
    const stackedMql = window.matchMedia('(max-width: 1199px)')
    const wideDesktopMql = window.matchMedia('(min-width: 1536px)')
    // Sync once for the SSR-vs-client mismatch on first paint.
    setIsStackedMode(stackedMql.matches)
    setIsWideDesktop(wideDesktopMql.matches)
    const onChange = (): void => {
      setIsStackedMode(stackedMql.matches)
      setIsWideDesktop(wideDesktopMql.matches)
      setActiveInsightSection(null)
      setRailLocked(false)
    }
    if (typeof stackedMql.addEventListener === 'function') {
      stackedMql.addEventListener('change', onChange)
      wideDesktopMql.addEventListener('change', onChange)
      return (): void => {
        stackedMql.removeEventListener('change', onChange)
        wideDesktopMql.removeEventListener('change', onChange)
      }
    }
    // Older Safari / pre-2019 fallback.
    stackedMql.addListener(onChange)
    wideDesktopMql.addListener(onChange)
    return (): void => {
      stackedMql.removeListener(onChange)
      wideDesktopMql.removeListener(onChange)
    }
  }, [])

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
      // C4: clear any open insight popover when the teacher selects
      // a question card. Mirrors the default PI route's behavior in
      // PaperIntelligencePreview, where `setActiveInsightSection(null)`
      // runs on every question selection.
      setActiveInsightSection(null)
      // C4 PR #52: also collapse the rail back to compact so the
      // teacher's eye returns to the question card without a stale
      // expanded rail competing for attention. The lock is a teacher
      // intent ("pin the rail"), and starting question discussion
      // implicitly cancels that intent.
      setRailLocked(false)
      setActiveQuestionId((prev) =>
        prev === intent.questionId ? null : intent.questionId,
      )
    }
    // Other intents ignored in C1/C2/C3/C4.
  }, [])

  // ─── C4 insight chip handlers ───
  //
  // Toggle and close are intentionally simple host-owned setters.
  // Re-clicking the active chip closes the panel; clicking another
  // chip switches the panel without an intermediate "closed" state.
  const handleToggleInsight = useCallback((paperSection: string): void => {
    setActiveInsightSection((prev) =>
      prev === paperSection ? null : paperSection,
    )
  }, [])

  const handleCloseInsight = useCallback((): void => {
    setActiveInsightSection(null)
  }, [])

  // ─── C4 PR #52 rail toggle + Esc handlers ───
  const handleToggleRailLock = useCallback((): void => {
    setRailLocked((prev) => !prev)
  }, [])

  const handleRailKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>): void => {
      if (e.key !== 'Escape') return
      // Two-phase Esc: detail first, lock second.
      // Phase 1: if a detail is open, close it but keep the rail
      // expanded (lock stays). Phase 2: if no detail is open but
      // the rail is locked, unlock it and blur so :focus-within
      // releases.
      if (activeInsightSection) {
        setActiveInsightSection(null)
        return
      }
      if (railLocked) {
        setRailLocked(false)
        const target = e.target as HTMLElement | null
        if (target && typeof target.blur === 'function') {
          target.blur()
        }
      }
    },
    [activeInsightSection, railLocked],
  )

  // ─── Right-side evidence click handler (C3) ───
  //
  // The internal AnalysisPanel below renders the support / distractor
  // rows as buttons carrying `data-pi-evidence-id`. Clicking one
  // updates the active evidence id and reseats the cross-column line.
  // This is the smallest possible host-owned handler — no events
  // fired by PaperSurface, no new intent kind.
  //
  // C4 invariant: this handler does NOT clear `activeInsightSection`.
  // Insight panel and evidence selection are independent teacher
  // views — closing insight on every distractor click would force
  // teachers to re-open the panel between questions.
  const handleSelectEvidence = useCallback((evidenceId: string) => {
    if (!evidenceId) return
    setActiveEvidenceId(evidenceId)
  }, [])

  // ─── C4 align active insight section with [data-paper-section] ───
  //
  // When the teacher opens an insight chip we scroll the matching
  // PaperSurface section root into view inside `.pi-ps-harness-left`,
  // so the chip and the passage it describes stay visually aligned.
  // We resolve the section root through the existing
  // `[data-paper-section]` anchor (PaperSurface's neutral namespace);
  // no new `data-paper-*` attribute is introduced.
  // `prefers-reduced-motion` toggles `behavior` between 'smooth' and
  // 'auto' so the OS-level setting is honored.
  useEffect(() => {
    if (!activeInsightSection) return
    const scroller = leftScrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-section="${cssAttr(activeInsightSection)}"]`,
    )
    if (!target) return
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      block: 'start',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [activeInsightSection])

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
  //
  // Derive the active-passage report row and the live anchor ref for
  // the insight popover. We resolve these once per render so the JSX
  // below stays simple. `activePassage` is undefined (and the popover
  // mount is gated on it) when:
  //   - no chip is open (`activeInsightSection === null`), OR
  //   - the active section id doesn't match any rendered passage,
  //     which is a defensive guard against state drift.
  const activePassage: PassageReport | undefined =
    activeInsightSection && report
      ? report.passages.find((p) => p.paperSection === activeInsightSection)
      : undefined
  const activeChipRef: ChipRef | null = activeInsightSection
    ? getChipRef(activeInsightSection)
    : null

  /**
   * Render a single insight chip. Always rendered inside the left
   * rail (`.pi-ps-insight-rail`).
   *
   * PA-approved rule: insight entry always lives on the left.
   * The rail is always in the DOM; CSS controls sizing per breakpoint.
   * Chips are never double-rendered.
   */
  const renderInsightChip = (p: PassageReport): ReactNode => {
    const isOpen = activeInsightSection === p.paperSection
    const chipLabel = buildInsightChipLabel(p)
    const shortLabel = buildInsightChipShortLabel(p)
    return (
      <button
        key={p.paperSection}
        ref={getChipRef(p.paperSection) as RefObject<HTMLButtonElement>}
        type="button"
        className={
          isOpen
            ? 'pi-ps-insight-chip pi-ps-insight-chip--open'
            : 'pi-ps-insight-chip'
        }
        onClick={() => handleToggleInsight(p.paperSection)}
        aria-expanded={isOpen}
        aria-controls={`pi-ps-insight-panel-${p.paperSection}`}
        aria-label={isOpen ? '收起洞察' : chipLabel}
        data-pi-insight-chip={p.paperSection}
      >
        <span className="pi-ps-insight-chip-section" aria-hidden="true">
          {p.paperSection}
        </span>
        <span className="pi-ps-insight-chip-text">{shortLabel}</span>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="pi-ps-harness">
        <div className="pi-ps-harness-topbar">
          <button type="button" className="pi-ps-harness-back" onClick={onBackToWorkbench}>
            <span aria-hidden="true">←</span> 返回工作台
          </button>
          <span className="pi-ps-harness-tagline">Paper Surface (C4)</span>
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
        {/* C4 PA-approved: insight entry always lives on the left rail.
           No topbar insight row at any breakpoint. */}
        <span className="pi-ps-harness-tagline">Paper Surface (C4)</span>
      </div>
      <div
        className="pi-ps-harness-shell"
        ref={shellRef}
        data-pi-active-evidence-kind={activeEvidenceKind ?? undefined}
      >
        {/*
          C4 PA-approved — left insight rail (always rendered).

          The rail is `position: absolute; left:0; top:0; bottom:0`
          inside `.pi-ps-harness-shell` (which is already
          `position: relative`), so it does NOT consume a grid
          column and the existing `1fr 858px 380px` shell is
          unchanged.

          The rail is always in the DOM at every viewport width.
          CSS media queries control its sizing and detail mode:
            - >=1536px: absolute in left gutter, 48→160→240px
            - 1200–1535px: absolute left, 48→120–140px, short labels
            - <=1199px: position:fixed; left:0, acts as a handle/drawer

          matchMedia state still controls WHICH detail surface is
          used (inline vs AnchoredPopover vs left drawer) but NOT
          the rail mount. Chips are never double-rendered.
        */}
        <aside
          className="pi-ps-insight-rail"
          aria-label="篇章洞察"
          data-rail-locked={railLocked ? 'true' : undefined}
          data-rail-detail-open={
            activeInsightSection ? 'true' : undefined
          }
          data-viewport-mode={isStackedMode ? 'stacked' : isWideDesktop ? 'wide' : 'medium'}
          onKeyDown={handleRailKeyDown}
        >
          <button
            type="button"
            className="pi-ps-insight-rail-toggle"
            onClick={handleToggleRailLock}
            aria-expanded={railLocked}
            aria-controls="pi-ps-insight-rail-list"
            aria-label={railLocked ? '收起洞察栏' : '展开洞察栏'}
          >
            <span
              className="pi-ps-insight-rail-toggle-icon"
              aria-hidden="true"
            >
              {railLocked ? '×' : '≡'}
            </span>
            <span className="pi-ps-insight-chip-text">
              {railLocked ? '收起' : '洞察'}
            </span>
          </button>
          <div
            className="pi-ps-insight-rail-list"
            id="pi-ps-insight-rail-list"
            role="group"
          >
            {report.passages.map((p) => (
              <div key={p.paperSection}>
                {renderInsightChip(p)}
                {/* Wide desktop (>=1536px): inline detail inside rail */}
                {isWideDesktop && activeInsightSection === p.paperSection && activePassage && (
                  <div
                    className="pi-ps-insight-detail"
                    id={`pi-ps-insight-panel-${p.paperSection}`}
                    role="region"
                    aria-label={`篇章洞察 · ${p.paperSection}`}
                  >
                    <div className="pi-ps-insight-detail-header">
                      <span className="pi-ps-insight-detail-title">
                        篇章洞察 · {p.paperSection}
                      </span>
                      <button
                        type="button"
                        className="pi-ps-insight-detail-close"
                        onClick={handleCloseInsight}
                        aria-label="关闭洞察面板"
                      >
                        ×
                      </button>
                    </div>
                    <HarnessInsightPanelContent reportPassage={activePassage} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
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
          {/*
            C4 PR #52 PA must-fix — readable analysis content.

            The aside paints its warm full-bleed background via the
            `::before` pseudo-element (extending to the viewport's
            right edge with `right: calc(-1 * (100vw - 100%))`);
            the actual
            text content stays inside this inner wrapper at
            `max-width: 400px` with a soft warm hairline on the
            content's left edge so the panel reads as a notebook
            page, not an edge-to-edge stripe.
          */}
          <div className="pi-ps-harness-right-inner">
            <AnalysisPanel
              analysis={analysisView}
              activeEvidenceId={activeEvidenceId}
              onSelectEvidence={handleSelectEvidence}
            />
          </div>
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
        {/*
          C4 PA-approved: left-side detail surfaces for non-wide viewports.

          Medium desktop (1200–1535px): AnchoredPopover anchored to the
          rail chip. The popover opens to the right of the rail and must
          not cover white paper body text.

          Stacked/narrow (<=1199px): same AnchoredPopover mechanism but
          styled as a left-side drawer via CSS.

          Wide desktop (>=1536px): inline detail inside the rail (above).
          AnchoredPopover is NOT mounted on wide desktop.
        */}
        {!isWideDesktop && activePassage && activeChipRef && (
          <AnchoredPopover
            anchorRef={activeChipRef as unknown as RefObject<HTMLElement | null>}
            open={activeInsightSection !== null}
            onClose={handleCloseInsight}
            id={`pi-ps-insight-panel-${activePassage.paperSection}`}
            role="dialog"
            ariaLabel="篇章洞察"
            className="pi-ps-insight-panel"
            widthPx={isStackedMode ? 220 : 320}
            gapPx={4}
            viewportPaddingPx={16}
            align="start"
            closeOnEscape
            dataAttributes={{
              'data-pi-insight-panel': activePassage.paperSection,
              'data-pi-insight-mode': isStackedMode ? 'drawer' : 'popover',
            }}
          >
            <div className="pi-ps-insight-panel-header">
              <span className="pi-ps-insight-panel-title">
                篇章洞察 · {activePassage.paperSection}
              </span>
              <button
                type="button"
                className="pi-ps-insight-panel-close"
                onClick={handleCloseInsight}
                aria-label="关闭洞察面板"
              >
                ×
              </button>
            </div>
            <HarnessInsightPanelContent reportPassage={activePassage} />
          </AnchoredPopover>
        )}
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
