/**
 * PaperSurfacePrototype — Issue #21-A visual spike / prototype.
 *
 * This is NOT the production `PaperSurface` module. It is an isolated,
 * paper-like rendering surface activated only by `?view=paper-intelligence
 * &paperId=paper-2024-xkb1-reading&surface=paper`. Its only job is to
 * validate that we can render a 1:1-feeling 广东一模 / 高考真题 卷面 from
 * the existing PI report.json + input.json fixtures, with the required
 * 宋体 / Times New Roman font stacks, before committing to a real
 * rewrite of the production left column.
 *
 * Naming note (Issue #30 gate 1):
 *   This file used to be named `PaperPrintSurfacePrototype` and the URL
 *   used `surface=print`. The "print" naming was an A1-only placeholder
 *   that collided with the real PDF/HTML export pipeline in
 *   `server/print-renderer.mjs`. Before B-level work, the prototype is
 *   renamed to `paper` semantics — it is an on-screen paper-like surface,
 *   not a print-renderer alignment. There is intentionally NO compat
 *   branch for `surface=print`; unknown surfaces fall back to default.
 *
 * CSS strategy note (Issue #30 gate 2 — RESOLVED FOR B1: A-thin):
 *   The companion `paperSurfacePrototype.css` is prototype-only visual
 *   reference. It is NOT shared with `server/print-renderer.mjs`. As of
 *   Issue #21-B1, the team has chosen the **A-thin** strategy:
 *
 *     - Share PRIMITIVE values (font stack, colors, line heights,
 *       indents, simple grid descriptors) via
 *       `shared/papersurface/tokens.mjs`.
 *     - DO NOT share CSS text. Each surface keeps its own CSS file.
 *     - DO NOT share HTML markup or JSX.
 *     - The React prototype consumes those values via CSS custom
 *       properties on the surface root.
 *     - `server/print-renderer.mjs` is intentionally untouched in B1
 *       and still uses its own slightly-different inlined font stack;
 *       the divergence is recorded in `paperSurfaceServerCurrent`. B2
 *       must decide whether the server adopts the shared tokens, and
 *       rerun the print visual QA accordingly.
 *
 *   See `docs/paper-surface-spike-follow-up.md` for the full Gate 2
 *   resolution and the B2 follow-up.
 *
 * Hard scope:
 *   - Read-only. No basket, no draft, no export, no insight popover, no
 *     evidence line geometry, no model calls, no DB.
 *   - Bundled sample only. The component fetches the same two static
 *     JSON files the default PI surface uses, but renders a different
 *     visual treatment.
 *   - Minimum interaction: clicking a question number / question block
 *     sets a local `activeQuestionId`. A small side rail shows the
 *     active question's stem + options for sanity-check; it is NOT a
 *     reimplementation of the right Question Analysis panel.
 *
 * Anchor reservations for future B/C/D wiring:
 *   - Each section root          → `data-pi-paper-section`
 *   - Each question root         → `data-pi-question-id`
 *   - Each option label          → `data-pi-option-label`
 *   - Each evidence anchor       → `data-pi-evidence-id` /
 *                                  `data-pi-evidence-kind` (Issue #30 gate 3)
 *
 * No-op evidence anchors (Issue #30 gate 3):
 *   The prototype DOM emits real `data-pi-evidence-id` /
 *   `data-pi-evidence-kind` / `data-pi-question-id` markers wherever the
 *   adapter resolves a verbatim hit of `answerEvidence.quote` against
 *   `passageBody`. They are wrapped in a NEUTRAL `<mark>` element with
 *   no highlight class — they are visually invisible, do not connect to
 *   `activeEvidenceId`, and never trigger any popover. They exist only
 *   so the future evidence painter / line geometry can dry-run against
 *   stable selectors before painting is turned on. For questions whose
 *   support quote does not resolve verbatim (e.g. quote spans split
 *   paragraphs), a hidden placeholder anchor is emitted next to the
 *   question stem so the question still has a stable evidence target.
 *   The placeholder is NOT geometry-valid; do not use it for line
 *   dry-runs.
 *
 * Forbidden in this file (intentionally):
 *   - Importing the basket / draft modules under the workbench's paper
 *     assembly folder, or anything inside concierge / services / App.
 *   - Importing the bundled sample-question-group dataset that the
 *     workbench uses for development. The spike reads only the static
 *     PI report.json + input.json fixtures.
 *   - Importing the existing PI evidence line, popover, or geometry
 *     modules. The whole point of the spike is to prove the surface in
 *     isolation. The pure evidence ADAPTER (`./evidence`) is allowed
 *     because it has no React/DOM dependency and is the canonical
 *     source for evidence ids.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import './paperSurfacePrototype.css'
import {
  toEvidenceModel,
  type EvidenceModel,
} from '../evidence'
import type { PaperIntelligenceReport } from '../paperIntelligenceTypes'
// Issue #21-B1 / Issue #30 gate 2: A-thin CSS strategy. The prototype
// imports primitive paper-surface tokens from the shared module and
// injects them as CSS custom properties on the surface root. The
// companion CSS reads `var(--pi-paper-...)`. We do NOT share CSS text,
// HTML, or markup with `server/print-renderer.mjs` in this cut.
import { paperSurfaceTokens } from '../../../../../shared/papersurface/tokens.mjs'

/**
 * React lets you set CSS custom properties via inline `style`, but the
 * default `CSSProperties` type does not include them. We extend it
 * locally so the surface root can advertise its CSS vars without
 * widening the public API surface.
 */
type PaperSurfaceStyle = CSSProperties & Record<`--${string}`, string | number>

/* ─── Local fixture types ────────────────────────────────────────────
 *
 * We deliberately re-declare the narrow shape the prototype needs from
 * the existing report.json / input.json instead of reusing
 * `paperIntelligenceTypes` so the spike can be deleted in one rm -rf
 * without churning the production typing.
 */

type PaperSurfaceReport = {
  schemaVersion?: string
  sourcePaper: {
    paperId: string
    paperName: string
    year: number
    region: string
    section: string
  }
  passages: ReadonlyArray<{
    paperSection: string
    passageTitle: string
  }>
}

type PaperSurfaceInputOption = {
  label: string
  content: string
}

type PaperSurfaceInputQuestion = {
  questionNo: string
  stem: string
  answer?: string
  options: ReadonlyArray<PaperSurfaceInputOption>
}

type PaperSurfaceInputPassage = {
  paperSection: string
  passageTitle: string
  passageBody: string
  questions: ReadonlyArray<PaperSurfaceInputQuestion>
}

type PaperSurfaceInput = {
  sourcePaper?: PaperSurfaceReport['sourcePaper']
  passages: ReadonlyArray<PaperSurfaceInputPassage>
}

/* ─── View model ─────────────────────────────────────────────────────
 *
 * The merged view model joins the two fixtures by `paperSection`. The
 * report carries the metadata header; the input carries the prose,
 * stems, and options the prototype actually paints. If either side is
 * missing for a section, we still render whatever the input fixture
 * has, because the spike's value is in the typography, not the
 * dashboard chrome.
 */

type PaperSurfaceQuestionView = {
  questionId: string
  questionNo: string
  stem: string
  options: ReadonlyArray<PaperSurfaceInputOption>
  /**
   * For Issue #30 gate 3: the support evidence id this question would
   * paint, when the adapter resolves a verbatim hit. `null` when the
   * adapter has no support row for this question (rare, but tolerated).
   */
  supportEvidenceId: string | null
}

type PaperSurfacePassageView = {
  paperSection: string
  passageTitle: string
  passageBody: string
  questions: ReadonlyArray<PaperSurfaceQuestionView>
  /**
   * Pre-computed verbatim hits inside `passageBody` for every support
   * quote that resolved. Each segment names the evidence id, the kind,
   * and the owning question — enough for the future geometry layer to
   * dry-run against. Non-overlapping; sorted by start offset; safe to
   * use for `<mark>` segmentation.
   */
  evidenceHits: ReadonlyArray<PaperSurfaceEvidenceHit>
  /**
   * Questions whose support quote did NOT resolve verbatim against
   * `passageBody`. These get a hidden placeholder anchor next to their
   * stem so every question still has a stable evidence target. The
   * placeholders are NOT geometry-valid.
   */
  placeholderQuestionIds: ReadonlySet<string>
}

type PaperSurfaceEvidenceHit = {
  startOffset: number
  endOffset: number
  evidenceId: string
  evidenceKind: 'support' | 'trap'
  questionId: string
  questionNo: string
}

type PaperSurfaceView = {
  paperName: string
  year: number
  region: string
  section: string
  passages: ReadonlyArray<PaperSurfacePassageView>
  totalQuestionCount: number
}

/**
 * Resolve verbatim hits of every support quote against `passageBody`.
 * Non-overlapping: if two quotes overlap, the earlier (and longer) hit
 * wins. The function is intentionally tiny and deterministic — it does
 * NOT try to recover from smart-quote / dash drift. Quote drift is the
 * audit script's job; this surface either gets a clean hit or falls
 * back to a placeholder anchor.
 */
function resolveSupportHits(args: {
  passageBody: string
  paperSection: string
  evidenceModel: EvidenceModel
  questionIds: ReadonlyMap<string, string> // questionNo → questionId
}): {
  hits: PaperSurfaceEvidenceHit[]
  placeholderQuestionIds: Set<string>
} {
  const { passageBody, paperSection, evidenceModel, questionIds } = args
  const passage = evidenceModel.passages.find(
    (p) => p.paperSection === paperSection,
  )
  const placeholderQuestionIds = new Set<string>()
  if (!passage || !passageBody) {
    if (passage) {
      for (const q of passage.questions) {
        const qid = questionIds.get(q.questionNo)
        if (qid) placeholderQuestionIds.add(qid)
      }
    }
    return { hits: [], placeholderQuestionIds }
  }

  // Collect candidate hits, longest first so a long quote wins over a
  // shorter quote it contains.
  type Candidate = PaperSurfaceEvidenceHit
  const candidates: Candidate[] = []
  for (const q of passage.questions) {
    const support = q.supportItem
    const questionId = questionIds.get(q.questionNo)
    if (!questionId) continue
    if (!support || support.quote === null) {
      placeholderQuestionIds.add(questionId)
      continue
    }
    const idx = passageBody.indexOf(support.quote)
    if (idx < 0) {
      placeholderQuestionIds.add(questionId)
      continue
    }
    candidates.push({
      startOffset: idx,
      endOffset: idx + support.quote.length,
      evidenceId: support.id,
      evidenceKind: 'support',
      questionId,
      questionNo: q.questionNo,
    })
  }

  candidates.sort((a, b) => {
    const lenDiff = b.endOffset - b.startOffset - (a.endOffset - a.startOffset)
    if (lenDiff !== 0) return lenDiff
    return a.startOffset - b.startOffset
  })

  // Non-overlap: claim ranges greedily.
  const claimed: PaperSurfaceEvidenceHit[] = []
  for (const c of candidates) {
    const overlaps = claimed.some(
      (h) => c.startOffset < h.endOffset && c.endOffset > h.startOffset,
    )
    if (overlaps) {
      placeholderQuestionIds.add(c.questionId)
      continue
    }
    claimed.push(c)
  }

  claimed.sort((a, b) => a.startOffset - b.startOffset)
  return { hits: claimed, placeholderQuestionIds }
}

function buildPaperSurfaceView(args: {
  report: PaperSurfaceReport | null
  input: PaperSurfaceInput
}): PaperSurfaceView {
  const { report, input } = args
  const header = report?.sourcePaper || input.sourcePaper || {
    paperId: '',
    paperName: '',
    year: 0,
    region: '',
    section: '',
  }

  // Build a minimum PaperIntelligenceReport-compatible shape for the
  // pure evidence adapter. We only need passages.questions (with
  // answerEvidence) for support-quote resolution; trap rows are NOT
  // painted by this prototype. If the report is absent (input-only
  // fixture), we skip evidence resolution entirely.
  const evidenceBodies: Record<string, string> = {}
  for (const p of input.passages) {
    if (p.passageBody) evidenceBodies[p.paperSection] = p.passageBody
  }
  const evidenceModel: EvidenceModel | null = report
    ? toEvidenceModel(report as unknown as PaperIntelligenceReport, {
        bodies: evidenceBodies,
      })
    : null

  const passages: PaperSurfacePassageView[] = input.passages.map((p) => {
    const questions: PaperSurfaceQuestionView[] = p.questions.map((q) => ({
      questionId: `${p.paperSection}-${q.questionNo}`,
      questionNo: q.questionNo,
      stem: q.stem,
      options: q.options,
      supportEvidenceId: null, // filled in below if adapter resolves it
    }))

    let evidenceHits: PaperSurfaceEvidenceHit[] = []
    let placeholderQuestionIds: Set<string> = new Set()

    if (evidenceModel) {
      const questionIds = new Map<string, string>()
      for (const q of questions) {
        questionIds.set(q.questionNo, q.questionId)
      }
      const resolved = resolveSupportHits({
        passageBody: p.passageBody || '',
        paperSection: p.paperSection,
        evidenceModel,
        questionIds,
      })
      evidenceHits = resolved.hits
      placeholderQuestionIds = resolved.placeholderQuestionIds

      // Tag each question with its support evidence id so the question
      // node can advertise its target even when the quote rendered into
      // the passage body owns the visible anchor.
      const evidencePassage = evidenceModel.passages.find(
        (ep) => ep.paperSection === p.paperSection,
      )
      if (evidencePassage) {
        for (const q of questions) {
          const support = evidencePassage.questions.find(
            (eq) => eq.questionNo === q.questionNo,
          )?.supportItem
          if (support) {
            ;(q as PaperSurfaceQuestionView & {
              supportEvidenceId: string | null
            }).supportEvidenceId = support.id
          }
        }
      }
    } else {
      for (const q of questions) placeholderQuestionIds.add(q.questionId)
    }

    return {
      paperSection: p.paperSection,
      passageTitle: p.passageTitle || `篇章 ${p.paperSection}`,
      passageBody: p.passageBody || '',
      questions,
      evidenceHits,
      placeholderQuestionIds,
    }
  })

  const totalQuestionCount = passages.reduce(
    (sum, passage) => sum + passage.questions.length,
    0,
  )

  return {
    paperName: header.paperName,
    year: header.year,
    region: header.region,
    section: header.section,
    passages,
    totalQuestionCount,
  }
}

/* ─── Component ──────────────────────────────────────────────────── */

export type PaperSurfacePrototypeProps = {
  /**
   * The same paperId the default PI surface receives. The spike only
   * supports the bundled sample (`paper-2024-xkb1-reading`); any other
   * id renders an explicit "spike does not have data" notice rather
   * than failing silently.
   */
  paperId: string | null
  /**
   * Caller is expected to provide a back-to-workbench handler so the
   * prototype is escapable without touching window.location itself —
   * mirrors the contract of the default PI surface.
   */
  onBackToWorkbench: () => void
}

const SPIKE_SUPPORTED_PAPER_ID = 'paper-2024-xkb1-reading'

/**
 * Issue #21-B1: the surface root advertises every shared paper-surface
 * token as a CSS custom property. The companion CSS file consumes them
 * via `var(--pi-paper-...)` instead of hardcoding values. Anything that
 * is genuinely React-only (page width on screen, active selection rail,
 * sidecar / topbar / spike chrome) stays out of this object on purpose.
 */
const paperSurfaceTokenStyle: PaperSurfaceStyle = {
  '--pi-paper-font-stack': paperSurfaceTokens.paperFontStack,
  '--pi-paper-ink': paperSurfaceTokens.paperInk,
  '--pi-paper-muted': paperSurfaceTokens.paperMuted,
  '--pi-paper-rule': paperSurfaceTokens.paperRule,
  '--pi-paper-passage-line-height': paperSurfaceTokens.passageLineHeight,
  '--pi-paper-question-line-height': paperSurfaceTokens.questionLineHeight,
  '--pi-paper-passage-indent': paperSurfaceTokens.passageIndent,
  '--pi-paper-options-grid-columns': paperSurfaceTokens.optionsGridColumns,
  '--pi-paper-options-grid-gap-x': paperSurfaceTokens.optionsGridGapX,
}

export function PaperSurfacePrototype({
  paperId,
  onBackToWorkbench,
}: PaperSurfacePrototypeProps): ReactNode {
  const [report, setReport] = useState<PaperSurfaceReport | null>(null)
  const [input, setInput] = useState<PaperSurfaceInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  useEffect(() => {
    if (!paperId) {
      setError('未指定 paperId 参数。')
      setLoading(false)
      return
    }
    if (paperId !== SPIKE_SUPPORTED_PAPER_ID) {
      setError(
        `精排卷面 spike 只支持样卷 ${SPIKE_SUPPORTED_PAPER_ID}，当前 paperId=${paperId}。`,
      )
      setLoading(false)
      return
    }

    let cancelled = false
    const reportUrl = `/reports/paper-intelligence/${paperId}/report.json`
    const inputUrl = `/reports/paper-intelligence/${paperId}/input.json`

    async function load(): Promise<void> {
      try {
        const [reportRes, inputRes] = await Promise.all([
          fetch(reportUrl),
          fetch(inputUrl),
        ])
        if (!inputRes.ok) {
          throw new Error(`input.json HTTP ${inputRes.status}`)
        }
        const inputData = (await inputRes.json()) as PaperSurfaceInput

        let reportData: PaperSurfaceReport | null = null
        if (reportRes.ok) {
          reportData = (await reportRes.json()) as PaperSurfaceReport
        }

        if (cancelled) return
        setReport(reportData)
        setInput(inputData)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(`加载样卷数据失败：${message}`)
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId])

  const view = useMemo<PaperSurfaceView | null>(() => {
    if (!input) return null
    return buildPaperSurfaceView({ report, input })
  }, [report, input])

  const activeQuestion = useMemo(() => {
    if (!view || !activeQuestionId) return null
    for (const passage of view.passages) {
      for (const q of passage.questions) {
        if (q.questionId === activeQuestionId) {
          return { passage, question: q }
        }
      }
    }
    return null
  }, [view, activeQuestionId])

  const handleSelectQuestion = (id: string): void => {
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  if (loading) {
    return (
      <div
        className="pi-paper-surface"
        data-pi-paper-surface="loading"
        style={paperSurfaceTokenStyle}
      >
        <PaperSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-paper-error">加载中…</div>
      </div>
    )
  }

  if (error || !view) {
    return (
      <div
        className="pi-paper-surface"
        data-pi-paper-surface="error"
        style={paperSurfaceTokenStyle}
      >
        <PaperSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-paper-error">
          <h2>精排卷面 spike</h2>
          <p>{error || '未能解析样卷数据。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pi-paper-surface"
      data-pi-paper-surface="ready"
      data-pi-paper-surface-paper-id={paperId || ''}
      style={paperSurfaceTokenStyle}
    >
      <PaperSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
      <div className="pi-paper-spike-notice" role="note">
        精排卷面 Spike / Prototype · 仅 {SPIKE_SUPPORTED_PAPER_ID} 样卷 · 不进入生产路径
      </div>
      <div className="pi-paper-layout">
        <article
          className="pi-paper-page"
          data-pi-paper-page="true"
          aria-label="精排卷面"
        >
          <PaperSurfaceHeader view={view} />
          <PaperSectionInstruction />
          <ol className="pi-paper-passages">
            {view.passages.map((passage) => (
              <PaperSurfacePassageBlock
                key={passage.paperSection}
                passage={passage}
                activeQuestionId={activeQuestionId}
                onSelectQuestion={handleSelectQuestion}
              />
            ))}
          </ol>
        </article>
        <aside
          className="pi-paper-sidecar"
          aria-label="选中题信息（spike 验证用）"
          data-pi-paper-sidecar="true"
        >
          <PaperSurfaceActiveQuestionPanel active={activeQuestion} />
        </aside>
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function PaperSurfaceTopBar({
  onBackToWorkbench,
}: {
  onBackToWorkbench: () => void
}): ReactNode {
  return (
    <div
      className="pi-paper-topbar"
      role="navigation"
      aria-label="Paper Intelligence paper surface top bar"
    >
      <button
        type="button"
        className="pi-paper-topbar-back"
        onClick={onBackToWorkbench}
        aria-label="返回工作台"
        data-pi-back-to-workbench="true"
      >
        <span aria-hidden="true">←</span> 返回工作台
      </button>
      <span className="pi-paper-topbar-title">精排卷面（Spike）</span>
    </div>
  )
}

function PaperSurfaceHeader({ view }: { view: PaperSurfaceView }): ReactNode {
  return (
    <header className="pi-paper-header">
      <h1 className="pi-paper-header-title">{view.paperName || '英语试卷样张'}</h1>
      <div className="pi-paper-header-meta">
        <span>{view.year || ''}</span>
        <span>{view.region}</span>
        <span>{view.section}</span>
      </div>
    </header>
  )
}

function PaperSectionInstruction(): ReactNode {
  /*
   * High-school 阅读理解第一节 instruction is fixed by the exam standard.
   * We hard-code the canonical sentence here so the surface looks like a
   * real paper at a glance — a teacher who scans this should immediately
   * see "this is 第一节". The spike does not parse this from the report.
   */
  return (
    <section className="pi-paper-instruction" data-pi-paper-instruction="true">
      <h2 className="pi-paper-instruction-heading">
        第二部分 阅读（共两节，满分 50 分）
      </h2>
      <h3 className="pi-paper-instruction-subheading">
        第一节（共 15 小题；每小题 2.5 分，满分 37.5 分）
      </h3>
      <p className="pi-paper-instruction-body">
        阅读下列短文，从每题所给的 A、B、C 和 D 四个选项中，选出最佳选项。
      </p>
    </section>
  )
}

function PaperSurfacePassageBlock(props: {
  passage: PaperSurfacePassageView
  activeQuestionId: string | null
  onSelectQuestion: (id: string) => void
}): ReactNode {
  const { passage, activeQuestionId, onSelectQuestion } = props
  return (
    <li
      className="pi-paper-passage"
      data-pi-paper-section={passage.paperSection}
    >
      <h3 className="pi-paper-passage-marker">
        <span className="pi-paper-passage-letter">{passage.paperSection}</span>
        <span className="pi-paper-passage-title">{passage.passageTitle}</span>
      </h3>
      <div className="pi-paper-passage-body">
        {renderPassageBody(passage.passageBody, passage.evidenceHits)}
      </div>
      <ol className="pi-paper-question-list">
        {passage.questions.map((q) => (
          <PaperSurfaceQuestionBlock
            key={q.questionId}
            question={q}
            isActive={q.questionId === activeQuestionId}
            onSelect={onSelectQuestion}
            needsPlaceholder={passage.placeholderQuestionIds.has(q.questionId)}
          />
        ))}
      </ol>
    </li>
  )
}

/**
 * Render passage body as paragraphs. The fixture stores the body as one
 * long string with no paragraph breaks; we split on `\n\n` (defensive),
 * and otherwise render the whole thing as a single paragraph. The spike
 * does NOT try to recover paragraph structure from the original PDF —
 * that is a future production-surface concern.
 *
 * Issue #30 gate 3: when `evidenceHits` is non-empty, the verbatim
 * support-quote ranges are wrapped in NEUTRAL `<mark>` elements that
 * carry `data-pi-evidence-id` / `data-pi-evidence-kind` /
 * `data-pi-question-id`. They get a `pi-paper-evidence-anchor` class
 * but NO highlight class — the marks are visually invisible. Callers
 * never connect them to `activeEvidenceId`; they exist solely as DOM
 * dry-run targets for the future evidence painter / line geometry.
 */
function renderPassageBody(
  body: string,
  evidenceHits: ReadonlyArray<PaperSurfaceEvidenceHit>,
): ReactNode {
  const trimmed = (body || '').trim()
  if (!trimmed) return null

  // If the body has natural \n\n paragraph breaks, paint each paragraph
  // separately. The verbatim hits we computed are anchored against the
  // ORIGINAL `body` (with whitespace) — to keep selectors stable, we
  // walk the original (untrimmed) body and emit the segmented output.
  // Trimming here only feeds the empty-body short-circuit above.

  if (evidenceHits.length === 0) {
    // No verbatim hits. Emit plain paragraphs.
    const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    if (paragraphs.length === 0) {
      return <p className="pi-paper-passage-paragraph">{trimmed}</p>
    }
    return paragraphs.map((para, idx) => (
      <p key={idx} className="pi-paper-passage-paragraph">
        {para}
      </p>
    ))
  }

  // We have hits. Walk the original body, splitting on each hit. We
  // don't try to honor paragraph breaks here — the fixture body for
  // this prototype is a single paragraph, and the hits are anchored to
  // its byte offsets.
  const segments: ReactNode[] = []
  let cursor = 0
  evidenceHits.forEach((hit, idx) => {
    if (hit.startOffset > cursor) {
      segments.push(body.slice(cursor, hit.startOffset))
    }
    segments.push(
      <mark
        key={`${hit.evidenceId}-${idx}`}
        className="pi-paper-evidence-anchor"
        data-pi-evidence-id={hit.evidenceId}
        data-pi-evidence-kind={hit.evidenceKind}
        data-pi-question-id={hit.questionId}
      >
        {body.slice(hit.startOffset, hit.endOffset)}
      </mark>,
    )
    cursor = hit.endOffset
  })
  if (cursor < body.length) {
    segments.push(body.slice(cursor))
  }
  return <p className="pi-paper-passage-paragraph">{segments}</p>
}

function PaperSurfaceQuestionBlock(props: {
  question: PaperSurfaceQuestionView
  isActive: boolean
  onSelect: (id: string) => void
  needsPlaceholder: boolean
}): ReactNode {
  const { question, isActive, onSelect, needsPlaceholder } = props
  return (
    <li
      className={
        isActive ? 'pi-paper-question pi-paper-question--active' : 'pi-paper-question'
      }
      data-pi-question-id={question.questionId}
      data-pi-question-no={question.questionNo}
    >
      <button
        type="button"
        className="pi-paper-question-stem-button"
        onClick={() => onSelect(question.questionId)}
        aria-pressed={isActive}
        aria-label={`选中第 ${question.questionNo} 题`}
        data-pi-question-stem-trigger="true"
      >
        <span className="pi-paper-question-no">{question.questionNo}.</span>
        <span className="pi-paper-question-stem">{question.stem}</span>
      </button>
      {needsPlaceholder && question.supportEvidenceId !== null && (
        // Issue #30 gate 3: hidden placeholder anchor for questions whose
        // support quote did NOT resolve verbatim against passageBody.
        // This anchor advertises a stable evidence id next to the
        // question stem, so future evidence wiring still has a target,
        // but it is NOT geometry-valid — the future line painter must
        // skip placeholders.
        <span
          className="pi-paper-evidence-placeholder"
          aria-hidden="true"
          data-pi-evidence-id={question.supportEvidenceId}
          data-pi-evidence-kind="support"
          data-pi-evidence-placeholder="true"
          data-pi-question-id={question.questionId}
        />
      )}
      <ol className="pi-paper-option-list">
        {question.options.map((opt) => (
          <li
            key={`${question.questionId}-${opt.label}`}
            className="pi-paper-option"
            data-pi-option-label={opt.label}
          >
            <span className="pi-paper-option-label">{opt.label}.</span>
            <span className="pi-paper-option-content">{opt.content}</span>
          </li>
        ))}
      </ol>
    </li>
  )
}

function PaperSurfaceActiveQuestionPanel(props: {
  active: { passage: PaperSurfacePassageView; question: PaperSurfaceQuestionView } | null
}): ReactNode {
  const { active } = props
  if (!active) {
    return (
      <div className="pi-paper-sidecar-empty">
        <p>点击左侧任意题号或题干，可在此查看题目基础信息。</p>
        <p className="pi-paper-sidecar-hint">
          spike 仅做最小交互验证，不复现完整 Question Analysis。
        </p>
      </div>
    )
  }
  const { passage, question } = active
  return (
    <div
      className="pi-paper-sidecar-card"
      data-pi-paper-active-question={question.questionId}
    >
      <div className="pi-paper-sidecar-meta">
        <span className="pi-paper-sidecar-section">阅读理解 {passage.paperSection}</span>
        <span className="pi-paper-sidecar-no">第 {question.questionNo} 题</span>
      </div>
      <p className="pi-paper-sidecar-stem">{question.stem}</p>
      <ol className="pi-paper-sidecar-options">
        {question.options.map((opt) => (
          <li key={opt.label} className="pi-paper-sidecar-option">
            <span className="pi-paper-sidecar-option-label">{opt.label}.</span>
            <span>{opt.content}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
