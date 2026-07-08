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
 *   - A compact left passage-structure rail (`.pi-ps-insight-rail`) sits
 *     `position: absolute` inside `.pi-ps-harness-shell` (so the
 *     existing `1fr 858px 380px` no-right-gutter grid stays unchanged
 *     and no new grid track is introduced). Replaces the prior
 *     top horizontal `.pi-ps-insight-chip-strip` after PR #52 PA
 *     review (rejected the top strip; required a left rail + warm
 *     full-bleed right analysis).
 *   - The rail collapses to 48px in the outer-left desk gutter and
 *     expands to 160px on `:hover`, `:focus-within`, or the toggle
 *     button's `[data-rail-locked]`. An active structure detail uses
 *     a viewport-clamped rail width so normal 100% browser zoom can
 *     still read the structure panel.
 *   - One structure chip per `report.passages[*].paperSection` rendered
 *     always inside the left rail (`.pi-ps-insight-rail`). The rail is
 *     always in the DOM at every viewport width. CSS media queries
 *     control rail sizing and detail mode but never unmount the rail.
 *     PA-approved rule: passage structure entry always lives on the left.
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
 *     section into view never moves the chip out of the viewport.
 *   - The active chip renders a lightweight inline structure detail
 *     inside the rail. The full load/difficulty/chunk panel was
 *     deliberately cut from PaperSurface; it belongs in a separate
 *     AI-difficulty workflow, not in the A4 reading surface.
 *   - `request-lecture-focus` clears `activeInsightSection` AND
 *     `railLocked` (matches default PI's "selecting a question card
 *     closes the structure detail"; the rail compacts back too).
 *   - matchMedia breakpoint changes clear `activeInsightSection` AND
 *     `railLocked` so a resized rail never keeps stale open state.
 *   - Right-panel evidence/distractor click does NOT clear
 *     `activeInsightSection`.
 *   - PaperSurface is unchanged. The harness does not import any
 *     new module from `shared-ui/papersurface`. PaperSurface still
 *     emits no `data-pi-*`. The chip carries a host-owned
 *     `data-pi-insight-chip="<section>"` attribute; PaperSurface is
 *     never told about structure detail or basket.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { WritingPaperPage } from './WritingPaperPage'
import { buildPaperSurfaceDataFromPi } from './adapter/index.ts'
import {
  buildPreviewView,
  type AnalysisView,
} from './preview/paperIntelligencePreviewModel'
import { PaperIntelligenceEvidenceLine } from './preview/paperIntelligenceEvidenceLine'
import { buildInsightChipLabel } from './insight/insightChipLabel'
import { HarnessInsightPanelContent } from './insight/HarnessInsightPanelContent'
import { HarnessStructureRows } from './insight/HarnessStructureRows'
import { StructureBraceOverlay } from './structureBrace'
import { LegacyAnalysisPanel } from './LegacyAnalysisPanel'
import { PaperAssetAnalysisPanel } from './PaperAssetAnalysisPanel'
import { SevenChoicesAnalysisPanel } from './SevenChoicesAnalysisPanel'
import { ClozeAnalysisPanel } from './ClozeAnalysisPanel'
import { GrammarFillAnalysisPanel } from './GrammarFillAnalysisPanel'
import { WritingAnalysisPanel } from './WritingAnalysisPanel'
import {
  buildGrammarFillAnalysisSurfaceModel,
  type GrammarFillAnalysisSurfaceModel,
  type ReviewedGrammarFillAnalysisV1,
} from './grammarFillAnalysisSurfaceAdapter.ts'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetQuestionAnalysisView,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
} from './paperAssetSurfaceAdapter.ts'
import {
  buildSevenChoicesSurfaceModel,
  type ReviewedSevenChoicesAnalysisV1,
  type SevenChoicesSurfaceModel,
} from './sevenChoicesSurfaceAdapter.ts'
import {
  buildClozePaperView,
  type ClozePaperViewModel,
} from './clozePaperViewAdapter.ts'
import {
  buildClozeAnalysisSurfaceModel,
  type ClozeAnalysisSurfaceModel,
  type ReviewedClozeAnalysisV1,
} from './clozeAnalysisSurfaceAdapter.ts'
import {
  buildGrammarFillPaperView,
  type GrammarFillPaperViewModel,
} from './grammarFillPaperViewAdapter.ts'
import {
  buildWritingPaperView,
  type WritingPaperViewModel,
} from './writingPaperViewAdapter.ts'
import {
  useSevenChoicesPaperHighlights,
} from './useSevenChoicesPaperHighlights.ts'
import {
  paperSurfaceHostInitialState,
  paperSurfaceHostInteractionReducer,
} from './paperSurfaceHostInteraction'
import type {
  PaperIntelligenceReport,
  PassageReport,
  PassageStructure,
  QuestionOption,
} from './paperIntelligenceTypes'
import type { PaperAssetV1, WritingAnalysis } from '../../domain/paperAsset.ts'
import type { PaperIntelligenceSource } from './paperIntelligenceRoute.ts'
import type { LectureFocus, PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'
import './paperIntelligencePaperSurfaceHarness.css'

type Props = {
  paperId: string | null
  /** C6a-4: explicit data source. Defaults to legacy report fixtures. */
  source?: PaperIntelligenceSource
  /** C6a-3: optional group to focus on load (from concierge entry URL). */
  groupId?: string | null
  /** C6a-3: optional question to pre-select on load (from concierge entry URL). */
  questionId?: string | null
  /** C7: optional immutable paper-asset version, e.g. v1. Missing means latest. */
  version?: string | null
  onBackToWorkbench: () => void
  shellNav: AppTopbarNav
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
  source = 'legacy-report',
  groupId: initialGroupId,
  questionId: initialQuestionId,
  version: initialVersion = null,
  onBackToWorkbench,
  shellNav,
}: Props): ReactNode {
  const [report, setReport] = useState<PaperIntelligenceReport | null>(null)
  const [shellTitle, setShellTitle] = useState<string | null>(null)
  const [paperAssetModel, setPaperAssetModel] = useState<PaperAssetSurfaceModel | null>(null)
  const [sevenChoicesModel, setSevenChoicesModel] = useState<SevenChoicesSurfaceModel | null>(null)
  const [clozeModel, setClozeModel] = useState<ClozePaperViewModel | null>(null)
  const [clozeAnalysisModel, setClozeAnalysisModel] = useState<ClozeAnalysisSurfaceModel | null>(null)
  const [grammarFillAnalysisModel, setGrammarFillAnalysisModel] = useState<GrammarFillAnalysisSurfaceModel | null>(null)
  const [grammarFillModel, setGrammarFillModel] = useState<GrammarFillPaperViewModel | null>(null)
  const [writingModel, setWritingModel] = useState<WritingPaperViewModel | null>(null)
  const [writingAnalysisModel, setWritingAnalysisModel] = useState<WritingAnalysis | null>(null)
  const [openSevenChoiceQuestionIds, setOpenSevenChoiceQuestionIds] = useState<string[]>([])
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [inputOptions, setInputOptions] = useState<Record<string, QuestionOption[]>>({})
  const [passageStructures, setPassageStructures] = useState<Record<string, PassageStructure>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hostState, dispatchHost] = useReducer(
    paperSurfaceHostInteractionReducer,
    paperSurfaceHostInitialState,
  )
  const {
    activeQuestionId,
    activeEvidenceId,
    activeOptionLabel,
    activeInsightSection,
    activeStructureTarget,
    railLocked,
    isStackedMode,
    isWideDesktop,
  } = hostState
  /**
   * C5c architecture cut: host interaction state lives behind
   * paperSurfaceHostInteractionReducer. The harness remains the DOM
   * adapter: data loading, scrollIntoView calls, refs, and JSX stay
   * local, while teacher-focus / insight / structure / rail reset
   * rules are concentrated in the reducer.
   */

  // Refs for the cross-column line geometry (C3).
  const shellRef = useRef<HTMLDivElement | null>(null)
  const leftScrollerRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLElement | null>(null)

  /**
   * C4 chip ref map. The harness renders one `<button>` per passage
   * section; each button gets a stable ref object keyed by section id
   * so the insight chip element can be programmatically accessed for
   * scroll-into-view and focus management.
   *
   * The map is keyed by `paperSection` (the same id space as
   * PaperSurface's existing `[data-paper-section]` anchor). Refs are
   * created lazily on first request and reused across renders, so
   * React's ref attribute mutates the same object.
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

  // ─── Fetch legacy PI report or C6a paper-asset source ───
  useEffect(() => {
    if (!paperId) {
      setError('未指定 paperId 参数。')
      setLoading(false)
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      setReport(null)
      setShellTitle(null)
      setPaperAssetModel(null)
      setSevenChoicesModel(null)
      setClozeAnalysisModel(null)
      setGrammarFillAnalysisModel(null)
      setWritingModel(null)
      setWritingAnalysisModel(null)
      setOpenSevenChoiceQuestionIds([])
      setBodies({})
      setInputOptions({})
      setPassageStructures({})

      try {
        if (source === 'paper-asset') {
          if (!initialGroupId) {
            throw new Error('未指定 groupId 参数。')
          }
          const assetBase = initialVersion
            ? `/paper-assets/${paperId}/versions/${initialVersion}`
            : `/paper-assets/${paperId}/latest`
          const assetUrl = `${assetBase}/paper-asset.json`
          let resolvedAssetBase = assetBase
          let assetRes = await fetch(assetUrl)
          if (!initialVersion && !assetRes.ok) {
            resolvedAssetBase = `/paper-assets/${paperId}`
            assetRes = await fetch(`${resolvedAssetBase}/paper-asset.json`)
          }
          if (!assetRes.ok) throw new Error(`没找到这份卷面（${paperId}），可能已被移除。回到找题页重新打开吧。`)

          let asset = (await assetRes.json()) as PaperAssetV1
          let group = asset.content.groups[initialGroupId]
          if (!group) {
            throw new Error(`没找到这个题组（${initialGroupId}），可能已被移除。回到找题页重新打开吧。`)
          }
          if (!cancelled) {
            setShellTitle([asset.paper.title, group.title].filter(Boolean).join(' · ') || null)
          }
          // Cloze: fetch analysis → dispatch ClozeAnalysisPanel; fallback to plain view.
          if (group.groupType === 'cloze') {
            let clozeAnalysisRes: Response | null = null
            try {
              clozeAnalysisRes = await fetch(
                `${resolvedAssetBase}/analyses/cloze-analysis-v1.json`,
              )
              if (!clozeAnalysisRes.ok) clozeAnalysisRes = null
            } catch {
              clozeAnalysisRes = null
            }
            if (clozeAnalysisRes) {
              try {
                const rawAnalysis = await clozeAnalysisRes.json()
                const analysisModel = buildClozeAnalysisSurfaceModel({
                  asset,
                  analysis: rawAnalysis as ReviewedClozeAnalysisV1,
                  groupId: initialGroupId,
                })
                if (cancelled) return
                setClozeAnalysisModel(analysisModel)
                setClozeModel(null)
                setSevenChoicesModel(null)
                setPaperAssetModel(null)
                setGrammarFillModel(null)
                setWritingModel(null)
                setWritingAnalysisModel(null)
                setReport(analysisModel.report)
                setPassageStructures(analysisModel.passageStructures)
                setLoading(false)
                return
              } catch {
                // Analysis parse/build failed — fall through to plain view.
              }
            }
            // Fallback: no analysis or parse failure → plain cloze view (I3).
            const model = buildClozePaperView({ asset, groupId: initialGroupId })
            if (cancelled) return
            setClozeModel(model)
            setClozeAnalysisModel(null)
            setSevenChoicesModel(null)
            setPaperAssetModel(null)
            setGrammarFillModel(null)
            setWritingModel(null)
            setWritingAnalysisModel(null)
            setReport(model.report)
            setPassageStructures(model.passageStructures)
            setLoading(false)
            return
          }

          // Grammar-fill: fetch analysis → dispatch GrammarFillAnalysisPanel; fallback to plain view.
          if (group.groupType === 'grammarFill') {
            let gfAnalysisRes: Response | null = null
            try {
              gfAnalysisRes = await fetch(
                `${resolvedAssetBase}/analyses/grammar-fill-analysis-v1.json`,
              )
              if (!gfAnalysisRes.ok) gfAnalysisRes = null
            } catch {
              gfAnalysisRes = null
            }
            if (gfAnalysisRes) {
              try {
                const rawAnalysis = await gfAnalysisRes.json()
                const analysisModel = buildGrammarFillAnalysisSurfaceModel({
                  asset,
                  analysis: rawAnalysis as ReviewedGrammarFillAnalysisV1,
                  groupId: initialGroupId,
                })
                if (cancelled) return
                setGrammarFillAnalysisModel(analysisModel)
                setGrammarFillModel(null)
                setClozeModel(null)
                setClozeAnalysisModel(null)
                setSevenChoicesModel(null)
                setPaperAssetModel(null)
                setWritingModel(null)
                setWritingAnalysisModel(null)
                setReport(analysisModel.report)
                setPassageStructures(analysisModel.passageStructures)
                setLoading(false)
                return
              } catch {
                // Analysis parse/build failed — fall through to plain view.
              }
            }
            // Fallback: no analysis or parse failure → plain grammar-fill view (I10).
            const model = buildGrammarFillPaperView({ asset, groupId: initialGroupId })
            if (cancelled) return
            setGrammarFillModel(model)
            setGrammarFillAnalysisModel(null)
            setClozeModel(null)
            setClozeAnalysisModel(null)
            setSevenChoicesModel(null)
            setPaperAssetModel(null)
            setWritingModel(null)
            setWritingAnalysisModel(null)
            setReport(model.report)
            setPassageStructures(model.passageStructures)
            setLoading(false)
            return
          }

          // Writing: build paper view, then optionally fetch writing-analysis-v1.json.
          // 404 / missing = graceful degradation (plain paper view, no panel).
          if (group.groupType === 'writing') {
            const model = buildWritingPaperView({ asset, groupId: initialGroupId })
            // Attempt to fetch writing analysis; failure is non-fatal.
            let resolvedWritingAnalysis: WritingAnalysis | null = null
            try {
              let writingAnalysisRes = await fetch(
                `${resolvedAssetBase}/analyses/writing-analysis-v1.json`,
              )
              if (!writingAnalysisRes.ok && resolvedAssetBase !== `/paper-assets/${paperId}`) {
                const legacyBase = `/paper-assets/${paperId}`
                writingAnalysisRes = await fetch(
                  `${legacyBase}/analyses/writing-analysis-v1.json`,
                )
              }
              if (writingAnalysisRes.ok) {
                const rawWritingAnalysis = await writingAnalysisRes.json()
                const groupEntry = rawWritingAnalysis?.groups?.[initialGroupId]
                if (groupEntry?.writing) {
                  resolvedWritingAnalysis = groupEntry.writing as WritingAnalysis
                }
              }
            } catch {
              // Network or parse error — fall through with no analysis panel.
            }
            if (cancelled) return
            setWritingModel(model)
            setWritingAnalysisModel(resolvedWritingAnalysis)
            setGrammarFillModel(null)
            setClozeModel(null)
            setSevenChoicesModel(null)
            setPaperAssetModel(null)
            setReport(model.report)
            setPassageStructures(model.passageStructures)
            setLoading(false)
            return
          }

          let analysisFile =
            group.groupType === 'sevenChoices'
              ? 'seven-choices-analysis-v1.json'
              : 'reading-choice-analysis-v1.json'
          let analysisRes = await fetch(`${resolvedAssetBase}/analyses/${analysisFile}`)
          if (!initialVersion && !analysisRes.ok && resolvedAssetBase !== `/paper-assets/${paperId}`) {
            resolvedAssetBase = `/paper-assets/${paperId}`
            const legacyAssetRes = await fetch(`${resolvedAssetBase}/paper-asset.json`)
            if (legacyAssetRes.ok) {
              asset = (await legacyAssetRes.json()) as PaperAssetV1
              group = asset.content.groups[initialGroupId]
              if (!group) {
                throw new Error(`没找到这个题组（${initialGroupId}），可能已被移除。回到找题页重新打开吧。`)
              }
              analysisFile =
                group.groupType === 'sevenChoices'
                  ? 'seven-choices-analysis-v1.json'
                  : 'reading-choice-analysis-v1.json'
              analysisRes = await fetch(`${resolvedAssetBase}/analyses/${analysisFile}`)
            }
          }
          if (!analysisRes.ok) {
            throw new Error(
              group.groupType === 'sevenChoices'
                ? `未找到已审阅七选五解析：${paperId}`
                : `未找到已审阅阅读解析：${paperId}`,
            )
          }
          const analysis = await analysisRes.json()
          const model =
            group.groupType === 'sevenChoices'
              ? buildSevenChoicesSurfaceModel({
                  asset,
                  analysis: analysis as ReviewedSevenChoicesAnalysisV1,
                  groupId: initialGroupId,
                })
              : buildPaperAssetSurfaceModel({
                  asset,
                  analysis: analysis as ReviewedReadingChoiceAnalysisV1,
                  groupId: initialGroupId,
                })
          if (cancelled) return
          if (group.groupType === 'sevenChoices') {
            setSevenChoicesModel(model as SevenChoicesSurfaceModel)
            setPaperAssetModel(null)
          } else {
            setPaperAssetModel(model as PaperAssetSurfaceModel)
            setSevenChoicesModel(null)
          }
          setReport(model.report)
          setPassageStructures(model.passageStructures)
          setLoading(false)
          return
        }

        const reportUrl = `/reports/paper-intelligence/${paperId}/report.json`
        const inputUrl = `/reports/paper-intelligence/${paperId}/input.json`
        const reportRes = await fetch(reportUrl)
        if (!reportRes.ok) throw new Error(`HTTP ${reportRes.status}`)
        const reportData = (await reportRes.json()) as PaperIntelligenceReport

        const bodiesData: Record<string, string> = {}
        const inputOptionsData: Record<string, QuestionOption[]> = {}
        const passageStructuresData: Record<string, PassageStructure> = {}
        try {
          const inputRes = await fetch(inputUrl)
          if (inputRes.ok) {
            const inputJson = (await inputRes.json()) as {
              passages?: Array<{
                paperSection?: string
                passageBody?: string
                passageStructure?: {
                  section?: string
                  paragraphs?: Array<{
                    id?: string
                    label?: string
                    text?: string
                  }>
                }
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
              // C5a: extract confirmed passageStructure
              if (p?.paperSection && p.passageStructure) {
                const ps = p.passageStructure
                if (
                  typeof ps.section === 'string' &&
                  Array.isArray(ps.paragraphs) &&
                  ps.paragraphs.length > 0
                ) {
                  const paragraphs = ps.paragraphs
                    .filter(
                      (para): para is { id: string; label: string; text: string } =>
                        typeof para.id === 'string' &&
                        typeof para.label === 'string' &&
                        typeof para.text === 'string' &&
                        para.text.trim().length > 0
                    )
                  if (paragraphs.length > 0) {
                    passageStructuresData[p.paperSection] = {
                      section: ps.section,
                      paragraphs,
                    }
                  }
                }
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
        setPassageStructures(passageStructuresData)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : `没找到这份报告（${paperId}），可能已被删除。回到找题页重新打开吧。`
        setError(msg)
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId, source, initialGroupId, initialVersion])

  // ─── C4 PR #52: viewport-mode detection ───
  //
  // Listen to both `(max-width: 1199px)` and `(min-width: 1536px)`.
  // The wide flag remains useful for diagnostics / data attributes,
  // but detail rendering is no longer gated by it. PR #52 PO QA found
  // that normal 100% browser zoom often falls in the 1200-1535px band;
  // hiding detail there made the rail look broken. The panel is now a
  // lightweight passage-structure summary that can render in every
  // non-empty rail state.
  //
  // PA-approved rule: the rail is always in the DOM. matchMedia only
  // controls detail-surface selection and CSS sizing, NOT rail mount.
  //
  // When the breakpoint crosses we close any open structure detail
  // and clear the rail lock so stale state doesn't persist across
  // viewport mode transitions.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.matchMedia !== 'function') return
    const stackedMql = window.matchMedia('(max-width: 1199px)')
    const wideDesktopMql = window.matchMedia('(min-width: 1536px)')
    // Sync once for the SSR-vs-client mismatch on first paint.
    dispatchHost({
      type: 'sync-viewport',
      isStackedMode: stackedMql.matches,
      isWideDesktop: wideDesktopMql.matches,
    })
    const onChange = (): void => {
      dispatchHost({
        type: 'sync-viewport',
        isStackedMode: stackedMql.matches,
        isWideDesktop: wideDesktopMql.matches,
      })
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

  // ─── C5b: window resize clears active Structure Brace (PO decision) ───
  //
  // PO decision for V0: resize clears the brace. Do NOT remeasure/redraw.
  // The matchMedia handler above already clears on breakpoint cross;
  // this handler covers all resize events (e.g. dragging browser edge)
  // even when no breakpoint is crossed.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = (): void => {
      dispatchHost({ type: 'resize' })
    }
    window.addEventListener('resize', onResize)
    return (): void => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // ─── C6a-3: pre-select initial question from URL params ───
  //
  // When the concierge entry passes a questionId via the URL, we fire a
  // synthetic 'request-lecture-focus' on the first render where the report
  // has loaded. The ref guard ensures it fires at most once per mount so
  // subsequent question selections by the teacher are not overridden.
  //
  // The questionId may be in paper-asset stable format (e.g. q-2024-jslk-021)
  // or PI adapter format (e.g. A-21). We check both: direct match against
  // adapter-derived IDs (${paperSection}-${questionNo}), and also check if
  // any question's questionNo appears at the end of the URL questionId
  // (for paper-asset IDs like q-2024-jslk-021 where "021" → questionNo "21").
  const initialQuestionAppliedRef = useRef(false)
  useEffect(() => {
    initialQuestionAppliedRef.current = false
  }, [paperId, source, initialGroupId, initialQuestionId])
  useEffect(() => {
    if (initialQuestionAppliedRef.current) return
    if (source === 'paper-asset') {
      if (sevenChoicesModel) {
        const candidateId =
          initialQuestionId && sevenChoicesModel.chainsByQuestionId[initialQuestionId]
            ? initialQuestionId
            : null
        initialQuestionAppliedRef.current = true
        queueMicrotask(() => {
          setOpenSevenChoiceQuestionIds(candidateId ? [candidateId] : [])
        })
        dispatchHost(
          candidateId
            ? {
                type: 'request-lecture-focus',
                questionId: candidateId,
                optionLabel: null,
                evidenceId: null,
              }
            : { type: 'clear-lecture-focus' },
        )
        return
      }
      // Cloze analysis: resolve URL questionId against analysisByQuestionId,
      // fall back to defaultQuestionId, seed first passage-side evidence.
      if (clozeAnalysisModel) {
        const candidateId =
          initialQuestionId && clozeAnalysisModel.analysisByQuestionId[initialQuestionId]
            ? initialQuestionId
            : clozeAnalysisModel.defaultQuestionId
        if (!candidateId) return
        const blankView = clozeAnalysisModel.analysisByQuestionId[candidateId] ?? null
        const firstPassageEvidence = blankView?.evidenceRows.find((r) => !r.isOptionSide) ?? null
        initialQuestionAppliedRef.current = true
        dispatchHost({
          type: 'request-lecture-focus',
          questionId: candidateId,
          optionLabel: null,
          evidenceId: firstPassageEvidence?.evidenceId ?? null,
        })
        return
      }
      // Grammar-fill analysis: resolve URL questionId, fall back to defaultQuestionId, seed first evidence.
      if (grammarFillAnalysisModel) {
        const candidateId =
          initialQuestionId && grammarFillAnalysisModel.analysisByQuestionId[initialQuestionId]
            ? initialQuestionId
            : grammarFillAnalysisModel.defaultQuestionId
        if (!candidateId) return
        const blankView = grammarFillAnalysisModel.analysisByQuestionId[candidateId] ?? null
        const firstEvidence = blankView?.evidenceRows[0] ?? null
        initialQuestionAppliedRef.current = true
        dispatchHost({
          type: 'request-lecture-focus',
          questionId: candidateId,
          optionLabel: null,
          evidenceId: firstEvidence?.evidenceId ?? null,
        })
        return
      }
      const activeReadingModel = paperAssetModel ?? clozeModel ?? grammarFillModel ?? writingModel
      if (!activeReadingModel) return
      const candidateId =
        initialQuestionId && activeReadingModel.surfaceData.questions.some((q) => q.id === initialQuestionId)
          ? initialQuestionId
          : initialGroupId
            ? activeReadingModel.defaultQuestionId
            : null
      if (!candidateId) return
      const candidateAnalysis = activeReadingModel.analysisByQuestionId[candidateId] ?? null
      const candidateAnswer = candidateAnalysis && 'answer' in candidateAnalysis ? (candidateAnalysis as PaperAssetQuestionAnalysisView).answer : null
      const candidateEvidence = candidateAnalysis && 'supportEvidenceId' in candidateAnalysis ? (candidateAnalysis as PaperAssetQuestionAnalysisView).supportEvidenceId : null
      initialQuestionAppliedRef.current = true
      dispatchHost({
        type: 'request-lecture-focus',
        questionId: candidateId,
        optionLabel: candidateAnswer,
        evidenceId: candidateEvidence,
      })
      return
    }
    if (!report) return
    if (!initialQuestionId) return
    // Try to resolve the initialQuestionId to a harness-internal question ID.
    // Harness IDs are `${paperSection}-${questionNo}`.
    let resolvedId: string | null = null
    for (const p of report.passages || []) {
      if (initialGroupId && p.questionGroupId !== initialGroupId) continue
      for (const q of p.questions || []) {
        const derivedId = `${p.paperSection}-${q.questionNo}`
        if (derivedId === initialQuestionId) {
          resolvedId = derivedId
          break
        }
        // Paper-asset stable IDs end with the zero-padded question number.
        // e.g. q-2024-jslk-021 → questionNo "21"
        const rawNo = String(q.questionNo || '')
        if (rawNo && initialQuestionId.endsWith(rawNo.padStart(3, '0'))) {
          resolvedId = derivedId
          break
        }
        if (rawNo && initialQuestionId.endsWith(rawNo)) {
          resolvedId = derivedId
          break
        }
      }
      if (resolvedId) break
    }
    if (!resolvedId) return
    initialQuestionAppliedRef.current = true
    dispatchHost({ type: 'request-lecture-focus', questionId: resolvedId })
  }, [source, sevenChoicesModel, clozeAnalysisModel, grammarFillAnalysisModel, paperAssetModel, report, initialGroupId, initialQuestionId])

  // ─── Build PaperSurface data props via adapter ───
  const surfaceData = useMemo(() => {
    if (source === 'paper-asset') {
      return sevenChoicesModel?.surfaceData ?? clozeAnalysisModel?.surfaceData ?? grammarFillAnalysisModel?.surfaceData ?? clozeModel?.surfaceData ?? grammarFillModel?.surfaceData ?? writingModel?.surfaceData ?? paperAssetModel?.surfaceData ?? null
    }
    if (!report) return null
    // C5a: buildPaperSurfaceDataFromPi will throw if passageStructure
    // is missing for any passage — this is the official hard-fail path.
    try {
      return buildPaperSurfaceDataFromPi({ report, bodies, inputOptions, passageStructures })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Surface the error so the harness renders the error state
      // instead of crashing React.
      console.error('[C5a] adapter build failed:', msg)
      return null
    }
  }, [source, sevenChoicesModel, clozeAnalysisModel, grammarFillAnalysisModel, clozeModel, grammarFillModel, writingModel, paperAssetModel, report, bodies, inputOptions, passageStructures])

  // ─── Build right-panel analysis view (reuse existing PI model) ───
  const analysisView = useMemo((): AnalysisView | null => {
    if (source === 'paper-asset') return null
    if (!report || !activeQuestionId) return null
    const view = buildPreviewView({ report, bodies, activeQuestionId, inputOptions })
    return view.activeAnalysis
  }, [source, report, bodies, activeQuestionId, inputOptions])

  const paperAssetAnalysisView = useMemo((): PaperAssetQuestionAnalysisView | null => {
    if (source !== 'paper-asset') return null
    if (sevenChoicesModel) return null
    if (clozeAnalysisModel) return null
    if (grammarFillAnalysisModel) return null
    if (!activeQuestionId) return null
    const entry = (paperAssetModel ?? clozeModel ?? grammarFillModel ?? writingModel)?.analysisByQuestionId[activeQuestionId] ?? null
    return entry && 'questionId' in entry ? (entry as PaperAssetQuestionAnalysisView) : null
  }, [source, sevenChoicesModel, clozeAnalysisModel, grammarFillAnalysisModel, paperAssetModel, clozeModel, grammarFillModel, writingModel, activeQuestionId])

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
    if (source === 'paper-asset') {
      // Cloze analysis: all evidence is uniform 'support' kind (PA MF-3.1).
      if (clozeAnalysisModel) {
        return activeEvidenceId ? 'support' : null
      }
      // Grammar-fill analysis: all evidence is uniform 'support' kind (I14 locked).
      if (grammarFillAnalysisModel) {
        return activeEvidenceId ? 'support' : null
      }
      if (sevenChoicesModel || clozeModel || grammarFillModel || writingModel) return null
      if (!activeEvidenceId) return null
      return paperAssetModel?.evidenceKindById[activeEvidenceId] ?? null
    }
    if (!activeEvidenceId || !analysisView) return null
    if (analysisView.supportEvidenceId === activeEvidenceId) return 'support'
    if (analysisView.distractors.some((d) => d.evidenceId === activeEvidenceId)) {
      return 'trap'
    }
    return null
  }, [source, clozeAnalysisModel, grammarFillAnalysisModel, sevenChoicesModel, paperAssetModel, clozeModel, grammarFillModel, writingModel, activeEvidenceId, analysisView])

  // ─── Reseed activeEvidenceId when activeQuestionId changes (C3) ───
  //
  // This mirrors the seed effect in PaperIntelligencePreview so the
  // two surfaces feel identical when the teacher selects a question:
  // the support evidence becomes the active line target by default.
  // The right-side analysis panel may override the seeded id by
  // clicking a quoted distractor row.
  useEffect(() => {
    if (!activeQuestionId) {
      dispatchHost({ type: 'seed-support-evidence', evidenceId: null })
      return
    }
    if (source === 'paper-asset') {
      if (sevenChoicesModel) return
      // Cloze analysis: seed the first passage-side evidence row for the active blank.
      if (clozeAnalysisModel) {
        const blankView = clozeAnalysisModel.analysisByQuestionId[activeQuestionId] ?? null
        const firstPassageEvidence = blankView?.evidenceRows.find((r) => !r.isOptionSide) ?? null
        dispatchHost({
          type: 'seed-support-evidence',
          evidenceId: firstPassageEvidence?.evidenceId ?? null,
        })
        return
      }
      // Grammar-fill analysis: seed the first evidence row for the active blank.
      if (grammarFillAnalysisModel) {
        const blankView = grammarFillAnalysisModel.analysisByQuestionId[activeQuestionId] ?? null
        const firstEvidence = blankView?.evidenceRows[0] ?? null
        dispatchHost({
          type: 'seed-support-evidence',
          evidenceId: firstEvidence?.evidenceId ?? null,
        })
        return
      }
      dispatchHost({
        type: 'seed-option-evidence',
        optionLabel: paperAssetAnalysisView?.answer ?? null,
        evidenceId: paperAssetAnalysisView?.supportEvidenceId ?? null,
      })
      return
    }
    const supportId =
      analysisView?.supportEvidenceId ?? null
    dispatchHost({ type: 'seed-support-evidence', evidenceId: supportId })
  }, [
    activeQuestionId,
    source,
    clozeAnalysisModel,
    grammarFillAnalysisModel,
    sevenChoicesModel,
    analysisView?.supportEvidenceId,
    paperAssetAnalysisView?.answer,
    paperAssetAnalysisView?.supportEvidenceId,
  ])

  // ─── Lecture focus (controlled, includes activeEvidenceId) ───
  const lectureFocus: LectureFocus | null = useMemo(() => {
    if (!activeQuestionId) return null
    return activeEvidenceId
      ? { kind: 'question', questionId: activeQuestionId, activeEvidenceId }
      : { kind: 'question', questionId: activeQuestionId }
  }, [activeQuestionId, activeEvidenceId])

  // ─── Focus intent handler ───
  const handleFocusIntent = useCallback(
    (intent: PaperSurfaceFocusIntent) => {
      if (intent.kind === 'request-lecture-focus') {
        // C4: clear any open structure detail when the teacher selects
        // a question card. Mirrors the default PI route's behavior in
        // PaperIntelligencePreview, where `setActiveInsightSection(null)`
        // runs on every question selection.
        // Cloze analysis: use the first passage-side evidence row for the blank.
        if (source === 'paper-asset' && clozeAnalysisModel) {
          const blankView = clozeAnalysisModel.analysisByQuestionId[intent.questionId] ?? null
          const firstPassageEvidence = blankView?.evidenceRows.find((r) => !r.isOptionSide) ?? null
          dispatchHost({
            type: 'request-lecture-focus',
            questionId: intent.questionId,
            optionLabel: null,
            evidenceId: firstPassageEvidence?.evidenceId ?? null,
          })
        } else if (source === 'paper-asset' && grammarFillAnalysisModel) {
          // Grammar-fill analysis: use the first evidence row for the blank.
          const blankView = grammarFillAnalysisModel.analysisByQuestionId[intent.questionId] ?? null
          const firstEvidence = blankView?.evidenceRows[0] ?? null
          dispatchHost({
            type: 'request-lecture-focus',
            questionId: intent.questionId,
            optionLabel: null,
            evidenceId: firstEvidence?.evidenceId ?? null,
          })
        } else {
          const nextEntry =
            source === 'paper-asset'
              ? (paperAssetModel ?? clozeModel ?? grammarFillModel ?? writingModel)?.analysisByQuestionId[intent.questionId] ?? null
              : null
          const nextAnalysis = nextEntry && 'questionId' in nextEntry ? (nextEntry as PaperAssetQuestionAnalysisView) : null
          dispatchHost({
            type: 'request-lecture-focus',
            questionId: intent.questionId,
            optionLabel: nextAnalysis?.answer ?? null,
            evidenceId: nextAnalysis?.supportEvidenceId ?? null,
          })
        }
      }
      // Other intents ignored in C1/C2/C3/C4.
    },
    [clozeAnalysisModel, grammarFillAnalysisModel, paperAssetModel, clozeModel, grammarFillModel, writingModel, source],
  )

  // ─── C4 insight chip handlers ───
  //
  // Toggle and close are intentionally simple host-owned setters.
  // Re-clicking the active chip closes the panel; clicking another
  // chip switches the panel without an intermediate "closed" state.
  const handleToggleInsight = useCallback((paperSection: string): void => {
    dispatchHost({ type: 'toggle-insight', paperSection })
  }, [])

  const handleCloseInsight = useCallback((): void => {
    dispatchHost({ type: 'close-insight' })
  }, [])

  // ─── C5b: structure target handlers ───
  //
  // Clicking `篇章` toggles whole-passage target. Clicking `Pn`
  // toggles paragraph target. Clicking the same active control clears.
  const handleStructureTarget = useCallback(
    (paperSection: string, mode: 'passage' | 'paragraph', paragraphId?: string): void => {
      dispatchHost({
        type: 'toggle-structure-target',
        paperSection,
        mode,
        paragraphId,
      })
    },
    [],
  )

  // ─── C4 PR #52 rail toggle + Esc handlers ───
  const handleToggleRailLock = useCallback((): void => {
    dispatchHost({ type: 'toggle-rail-lock' })
  }, [])

  const handleRailKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>): void => {
      if (e.key !== 'Escape') return
      // Two-phase Esc: detail first, lock second.
      // Phase 1: if a detail is open, close it but keep the rail
      // expanded (lock stays). Phase 2: if no detail is open but
      // the rail is locked, unlock it and blur so :focus-within
      // releases.
      const shouldBlur = !activeInsightSection && railLocked
      dispatchHost({ type: 'rail-escape' })
      if (shouldBlur) {
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
  // The extracted right-panel components render support / distractor rows as
  // buttons carrying `data-pi-evidence-id`. Clicking one updates the active
  // evidence id and reseats the cross-column line.
  // This is the smallest possible host-owned handler — no events
  // fired by PaperSurface, no new intent kind.
  //
  // C4 invariant: this handler does NOT clear `activeInsightSection`.
  // Insight panel and evidence selection are independent teacher
  // views — closing insight on every distractor click would force
  // teachers to re-open the panel between questions.
  const handleSelectEvidence = useCallback((evidenceId: string) => {
    dispatchHost({ type: 'select-evidence', evidenceId })
  }, [])

  const handleSelectPaperAssetOption = useCallback(
    (optionLabel: string, evidenceId: string | null) => {
      dispatchHost({ type: 'select-option-evidence', optionLabel, evidenceId })
    },
    [],
  )

  const handleToggleSevenChoiceChain = useCallback((questionId: string): void => {
    setOpenSevenChoiceQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    )
    dispatchHost({ type: 'clear-lecture-focus' })
  }, [])

  const handleShowAllSevenChoiceChains = useCallback((): void => {
    if (!sevenChoicesModel) return
    setOpenSevenChoiceQuestionIds(sevenChoicesModel.chains.map((chain) => chain.questionId))
    dispatchHost({ type: 'clear-lecture-focus' })
  }, [sevenChoicesModel])

  const handleHideAllSevenChoiceChains = useCallback((): void => {
    setOpenSevenChoiceQuestionIds([])
    dispatchHost({ type: 'clear-lecture-focus' })
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

  // ─── C5b: scroll structure target into view (instant per PA decision) ───
  useEffect(() => {
    if (!activeStructureTarget) return
    const scroller = leftScrollerRef.current
    if (!scroller) return

    const el =
      activeStructureTarget.mode === 'paragraph' && activeStructureTarget.paragraphId
        ? scroller.querySelector<HTMLElement>(
            `[data-paper-paragraph-id="${cssAttr(activeStructureTarget.paragraphId)}"]`,
          )
        : scroller.querySelector<HTMLElement>(
            `[data-paper-section="${cssAttr(activeStructureTarget.paperSection)}"]`,
          )
    if (!el) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  }, [activeStructureTarget])

  const sevenChoiceOverlay = useSevenChoicesPaperHighlights({
    enabled: !!sevenChoicesModel,
    leftScrollerRef,
    openQuestionIds: openSevenChoiceQuestionIds,
    chains: sevenChoicesModel?.chains ?? [],
  })

  // ─── Render ───
  //
  // Derive the active-passage report row and the live anchor ref for
  // the structure detail. We resolve these once per render so the JSX
  // below stays simple. `activePassage` is undefined (and the detail
  // mount is gated on it) when:
  //   - no chip is open (`activeInsightSection === null`), OR
  //   - the active section id doesn't match any rendered passage,
  //     which is a defensive guard against state drift.
  const activePassage: PassageReport | undefined =
    activeInsightSection && report
      ? report.passages.find((p) => p.paperSection === activeInsightSection)
      : undefined

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
        aria-label={isOpen ? '收起篇章结构' : chipLabel}
        data-pi-insight-chip={p.paperSection}
      >
        <span className="pi-ps-insight-chip-section" aria-hidden="true">
          {p.paperSection}
        </span>
      </button>
    )
  }

  const pageTitle = shellTitle ?? report?.sourcePaper?.paperName ?? undefined

  if (loading) {
    return (
      <div className="pi-ps-harness">
        <AppTopbar {...shellNav} pageTitle={pageTitle} onBack={onBackToWorkbench} />
        <div className="pi-ps-harness-loading">加载中…</div>
      </div>
    )
  }

  if (error || !report || !surfaceData) {
    return (
      <div className="pi-ps-harness">
        <AppTopbar {...shellNav} pageTitle={pageTitle} onBack={onBackToWorkbench} />
        <div className="pi-ps-harness-error">
          <h2>没找到这份卷面</h2>
          <p>{error || '报告数据为空，回到找题页重新打开吧。'}</p>
        </div>
      </div>
    )
  }

  const paperSurfaceEl = (
    <PaperSurface
      textMap={surfaceData.textMap}
      annotations={[]}
      evidence={surfaceData.evidence}
      questions={surfaceData.questions}
      // seven-options-on-paper: the 七选五 A-G pool, display-only.
      // `undefined` for every other source (reading/cloze/grammarFill/
      // writing) — zero render-path change for them.
      optionBank={sevenChoicesModel?.options}
      mode="lecture"
      lectureFocus={lectureFocus}
      readingFocusBySection={{}}
      onFocusIntent={handleFocusIntent}
      blankFocusMode={grammarFillAnalysisModel ? 'in-passage' : 'rail'}
    />
  )

  return (
    <div className="pi-ps-harness">
      {/* C4 PA-approved: insight entry always lives on the left rail.
         No topbar insight row at any breakpoint. */}
      <AppTopbar {...shellNav} pageTitle={pageTitle} onBack={onBackToWorkbench} />
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
          CSS media queries control its sizing:
            - >=1200px: absolute in left gutter, 48→160px, then a
              viewport-clamped structure detail width when a chip is active
            - <=1199px: position:fixed; left:0, acts as a handle/drawer

          matchMedia state annotates the current viewport mode but
          does NOT control rail mount. Chips are never double-rendered.

          INVARIANT (PR #52 PO QA Must Fix):
            data-rail-detail-open='true' is set by the same
            activeInsightSection state that renders .pi-ps-insight-detail.
            This guarantees: if rail expands beyond compact width,
            structure detail is rendered. The forbidden state (rail
            expanded + activeInsightSection set + detailCount == 0)
            cannot occur.
        */}
        <aside
          className="pi-ps-insight-rail"
          aria-label="篇章结构"
          data-rail-locked={railLocked ? 'true' : undefined}
          data-rail-detail-open={activeInsightSection ? 'true' : undefined}
          data-viewport-mode={isStackedMode ? 'stacked' : isWideDesktop ? 'wide' : 'medium'}
          onKeyDown={handleRailKeyDown}
        >
          <button
            type="button"
            className="pi-ps-insight-rail-toggle"
            onClick={handleToggleRailLock}
            aria-expanded={railLocked}
            aria-controls="pi-ps-insight-rail-list"
            aria-label={railLocked ? '收起篇章结构栏' : '展开篇章结构栏'}
          >
            <span
              className="pi-ps-insight-rail-toggle-icon"
              aria-hidden="true"
            >
              {railLocked ? '×' : '≡'}
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
                {/* Inline structure detail inside rail at every viewport. */}
                {activeInsightSection === p.paperSection && activePassage && (
                  <div
                    className="pi-ps-insight-detail"
                    id={`pi-ps-insight-panel-${p.paperSection}`}
                    role="region"
                    aria-label={`篇章结构 · ${p.paperSection}`}
                  >
                    <div className="pi-ps-insight-detail-header">
                      <span className="pi-ps-insight-detail-title">
                        篇章结构 · {p.paperSection}
                      </span>
                      <button
                        type="button"
                        className="pi-ps-insight-detail-close"
                        onClick={handleCloseInsight}
                        aria-label="关闭篇章结构面板"
                      >
                        ×
                      </button>
                    </div>
                    {/* C5b: inline clickable structure rows replace HarnessInsightPanelContent outline */}
                    {passageStructures[p.paperSection] ? (
                      <HarnessStructureRows
                        paperSection={p.paperSection}
                        paragraphs={passageStructures[p.paperSection].paragraphs}
                        passageOutline={activePassage.passageOutline}
                        activeStructureTarget={activeStructureTarget}
                        onStructureTarget={handleStructureTarget}
                      />
                    ) : (
                      <HarnessInsightPanelContent reportPassage={activePassage} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
        <div className="pi-ps-harness-left" ref={leftScrollerRef}>
          {writingModel ? (
            <WritingPaperPage pageModel={writingModel.pageModel}>{paperSurfaceEl}</WritingPaperPage>
          ) : (
            paperSurfaceEl
          )}
          {sevenChoicesModel && sevenChoiceOverlay.marks.length > 0 && (
            <div className="pi-seven-blank-overlay" aria-hidden="true">
              {sevenChoiceOverlay.marks.map((mark) => (
                <span
                  key={mark.id}
                  className={`pi-seven-clue-mark pi-seven-clue-mark--${mark.kind}`}
                  data-seven-color={mark.colorIndex}
                  style={{
                    transform: `translate(${mark.left}px, ${mark.top}px)`,
                    width: `${mark.width}px`,
                    height: `${mark.height}px`,
                  }}
                />
              ))}
            </div>
          )}
          {/* C5b: Structure Brace SVG overlay */}
          <StructureBraceOverlay
            target={activeStructureTarget}
            leftScrollerRef={leftScrollerRef}
            isStacked={isStackedMode}
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
            {sevenChoicesModel ? (
              <SevenChoicesAnalysisPanel
                options={sevenChoicesModel.options}
                chains={sevenChoicesModel.chains}
                openQuestionIds={openSevenChoiceQuestionIds}
                onToggleChain={handleToggleSevenChoiceChain}
                onShowAll={handleShowAllSevenChoiceChains}
                onHideAll={handleHideAllSevenChoiceChains}
              />
            ) : clozeAnalysisModel ? (
              <ClozeAnalysisPanel
                analysis={activeQuestionId ? (clozeAnalysisModel.analysisByQuestionId[activeQuestionId] ?? null) : null}
                hasActiveQuestion={!!activeQuestionId}
                activeEvidenceId={activeEvidenceId}
                groupView={clozeAnalysisModel.groupView}
                onSelectEvidence={handleSelectEvidence}
              />
            ) : grammarFillAnalysisModel ? (
              <GrammarFillAnalysisPanel
                analysis={activeQuestionId ? (grammarFillAnalysisModel.analysisByQuestionId[activeQuestionId] ?? null) : null}
                hasActiveQuestion={!!activeQuestionId}
                activeEvidenceId={activeEvidenceId}
                groupView={grammarFillAnalysisModel.groupView}
                onSelectEvidence={handleSelectEvidence}
              />
            ) : writingModel && writingAnalysisModel ? (
              <WritingAnalysisPanel analysis={writingAnalysisModel} />
            ) : source === 'paper-asset' ? (
              <PaperAssetAnalysisPanel
                analysis={paperAssetAnalysisView}
                hasActiveQuestion={!!activeQuestionId}
                activeOptionLabel={activeOptionLabel}
                activeEvidenceId={activeEvidenceId}
                onSelectOption={handleSelectPaperAssetOption}
                onSelectEvidence={handleSelectEvidence}
              />
            ) : (
              <LegacyAnalysisPanel
                analysis={analysisView}
                activeEvidenceId={activeEvidenceId}
                onSelectEvidence={handleSelectEvidence}
              />
            )}
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
        {!sevenChoicesModel && (
          <PaperIntelligenceEvidenceLine
            containerRef={shellRef}
            leftScrollerRef={leftScrollerRef}
            rightPanelRef={rightPanelRef}
            activeQuestionId={activeQuestionId}
            activeEvidenceId={activeEvidenceId}
            activeEvidenceKind={activeEvidenceKind}
            leftSelectorPreset="paper-surface"
          />
        )}
        {/*
          C4 UX Must Fix (PR #52 browser QA / PO QA):

          Detail surfaces by breakpoint:
            - Side-by-side (>=1200px): inline structure detail inside
              the left rail with viewport-clamped width.
            - Stacked/narrow (<=1199px): inline structure detail inside
              the fixed left drawer.

          No AnchoredPopover for passage structure. The user-visible
          expanded left area must contain the detail itself.
        */}
      </div>
    </div>
  )
}
