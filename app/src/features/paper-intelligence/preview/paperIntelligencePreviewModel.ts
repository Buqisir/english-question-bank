/**
 * paperIntelligencePreviewModel — pure data layer for the interactive
 * Paper Intelligence preview (V1).
 *
 * Purpose:
 *   Take a PaperIntelligenceReport (V0 schema) + a passage-body map (from
 *   `input.json`) + the current `activeQuestionId`, and produce a flat
 *   per-passage view model the React layer can render without doing any
 *   string math itself.
 *
 * Why a separate module:
 *   - The Claude reviewer's hard rule: do NOT reuse / generalize the
 *     reading-analysis `ReadingAnalysisFixture`. Paper Intelligence keeps
 *     its own data shape so the two systems stay decoupled.
 *   - Keeps the component (`PaperIntelligencePreview.tsx`) free of any
 *     evidence matching. The component reads the model and renders.
 *   - All quote/text math lives here, in one place, easily verified.
 *
 * Hard rules (also enforced by the verify script):
 *   - No React, no DOM, no `window`, no `document`.
 *   - No fetch / no model calls / no DB.
 *   - Quote matching is verbatim only — never normalize or trim quotes.
 *     If the V0 audit (separate verify script) says a quote hits, this
 *     module's `indexOf(...)` will find it; if it doesn't, we render
 *     plain text. We do not silently fix model drift here.
 *   - Use the existing evidence adapter (`toEvidenceModel`); do not
 *     reinvent evidence extraction.
 *
 * What this module owns:
 *   - The deterministic question id ( `${paperSection}-${questionNo}` ).
 *   - Splitting `passageBody` into renderable text/highlight segments
 *     given an active question's support+trap evidence items.
 *   - A per-passage list of question rows for the left column.
 *   - A single-shot "active question" projection for the right panel.
 *
 * What this module does NOT own:
 *   - Any DOM `data-pi-*` attribute names — those live on the React
 *     side. This module returns logical fields (evidenceId, questionId,
 *     evidenceKind); the component is responsible for the attribute
 *     contract.
 *   - Anything UI-shaped (colors, classNames, scroll behavior).
 *   - Cross-column dotted-line rendering (V2; not in scope).
 */

import type {
  EvidenceItem,
  EvidenceModel,
  PassageEvidenceView,
  QuestionEvidenceView,
} from '../evidence/index.ts'
import { toEvidenceModel, selectEvidence } from '../evidence/index.ts'
import type {
  PaperIntelligenceReport,
} from '../paperIntelligenceTypes.ts'

/* ─────────────────────────── id helpers ─────────────────────────────── */

/**
 * Build the deterministic question id used everywhere in the interactive
 * preview's UI state and DOM (`<paperSection>-<questionNo>`).
 *
 * This is the single source of truth — the component, the verify
 * script, and any future test harness must round-trip through this
 * function rather than concatenating strings inline.
 */
export function buildQuestionId(paperSection: string, questionNo: string): string {
  return `${paperSection}-${questionNo}`
}

/**
 * Pull the (paperSection, questionNo) pair out of a question id. Returns
 * `null` for malformed input rather than throwing — the React layer
 * needs a total function. Question ids never start or end with `-`.
 */
export function parseQuestionId(
  id: string | null | undefined,
): { paperSection: string; questionNo: string } | null {
  if (typeof id !== 'string' || id.length === 0) return null
  const dashIndex = id.indexOf('-')
  if (dashIndex <= 0 || dashIndex === id.length - 1) return null
  return {
    paperSection: id.slice(0, dashIndex),
    questionNo: id.slice(dashIndex + 1),
  }
}

/* ─────────────────────────── segment types ──────────────────────────── */

/**
 * One renderable chunk of a passage's body. The React layer iterates a
 * list of these and emits either a plain `<span>` or a highlighted
 * `<mark data-pi-evidence-id=...>`. The model never touches DOM — it
 * only decides which substrings of `passageBody` are highlights and
 * which are plain.
 *
 * Keys:
 *   - `kind: 'text'`      — plain text, no evidence association.
 *   - `kind: 'highlight'` — verbatim quote from the active question's
 *     EvidenceModel item. Carries enough metadata for the component to
 *     wire up DOM anchors and styling without re-reading the model.
 */
export type PassageSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'highlight'
      text: string
      evidenceId: string
      questionId: string
      evidenceKind: 'support' | 'trap'
      /** distractor optionLabel for trap rows; null for support. */
      optionLabel: string | null
    }

/* ─────────────────────────── question row ───────────────────────────── */

/**
 * Per-question row used by the left column. We pull only the fields the
 * left list needs (questionNo, stem, answer, options, type) so the row
 * model stays small and easy to read.
 *
 * `optionsForDisplay` is sorted A→D by `label`. The original report
 * does not always list options in order; left column normalizes.
 *
 * `isActive` is computed against the top-level `activeQuestionId` so the
 * component can render a `--active` modifier without having to compare
 * ids itself.
 */
export type QuestionRow = {
  questionId: string
  paperSection: string
  questionNo: string
  questionIndexInPassage: number
  stem: string
  stemTranslation: string
  answer: string
  teacherQuestionType: string
  optionsForDisplay: { label: string; content: string }[]
  isActive: boolean
}

/* ─────────────────────────── passage view ───────────────────────────── */

/**
 * Per-passage projection consumed by the left column. Carries the
 * passage-level metadata the section header needs, the rendered segment
 * list (passageBody split into text + highlight chunks for the active
 * question), and the question rows.
 *
 * `segments.length === 0` is allowed and means "passageBody was missing
 * for this section" — the component renders an inline notice instead of
 * a structured passage.
 */
export type PassagePreviewView = {
  paperSection: string
  passageTitle: string
  /** raw passageBody copied through verbatim; used as a backup. */
  passageBody: string
  /** rendered segment list for the currently active question. */
  segments: PassageSegment[]
  questions: QuestionRow[]
  /** AI initial band display string ("偏易" / "适中" / "偏难"), or "—". */
  bandLabel: string
}

/* ─────────────────────────── analysis panel ─────────────────────────── */

/**
 * One distractor row for the right panel's analysis section.
 *
 * `quoteIsTextOnly` is `true` when the underlying EvidenceItem has
 * `quote === null`. The component renders these as plain text with a
 * "text-only" hint instead of attempting any DOM anchoring.
 */
export type AnalysisDistractorRow = {
  evidenceId: string
  optionLabel: string
  category: string | null
  subtype: string | null
  shortReason: string
  quote: string | null
  quoteIsTextOnly: boolean
}

/**
 * Analysis-panel projection for the active question. The component
 * passes this to the right column; if `null`, the panel renders a
 * quiet empty state.
 */
export type AnalysisView = {
  questionId: string
  paperSection: string
  questionNo: string
  stem: string
  stemTranslation: string
  answer: string
  teacherQuestionType: string

  /** support row's id, or null when the active question has no support
   *  evidence (very rare; we still render the answer + explanation). */
  supportEvidenceId: string | null
  answerEvidenceQuote: string | null
  answerEvidenceExplanationZh: string

  /** locating / answer sentences carried from the V0 schema. We do not
   *  do any DOM anchoring on these — they ride on the right panel as
   *  context, not as evidence rows. */
  locatingSentence: string
  answerSentence: string

  distractors: AnalysisDistractorRow[]
  synonymSummary: string

  /* — back-stage labels — */
  tCard: string
  reviewNeeded: boolean
  confidence: number | null
}

/* ─────────────────────────── top-level model ─────────────────────────── */

/**
 * The whole preview view model. Built once per
 * (report + bodies + activeQuestionId) tuple.
 *
 * `evidenceModel` is exposed on the view model so the React layer can
 * use the existing adapter helpers (`selectEvidence`, etc.) without
 * having to call `toEvidenceModel` itself.
 */
export type PaperIntelligencePreviewView = {
  paperId: string
  paperName: string
  passages: PassagePreviewView[]
  /** the projection for the right column; `null` when no question is
   *  active. */
  activeAnalysis: AnalysisView | null
  /** kept around for diagnostics / tests; not consumed by the component. */
  evidenceModel: EvidenceModel
}

/* ─────────────────────────── builder inputs ─────────────────────────── */

export type PassageBodyMap = Record<string, string>

export type BuildPreviewArgs = {
  report: PaperIntelligenceReport
  bodies: PassageBodyMap
  activeQuestionId: string | null
}

/* ─────────────────────────── public builder ─────────────────────────── */

/**
 * Build the full preview view model from a report + passage bodies +
 * the current active question id.
 *
 * The function is total and pure — it does not read any global state,
 * does not throw, and does not mutate its inputs.
 */
export function buildPreviewView(args: BuildPreviewArgs): PaperIntelligencePreviewView {
  const { report, bodies, activeQuestionId } = args

  const evidenceModel = toEvidenceModel(report, { bodies })
  const reportPassages = Array.isArray(report?.passages) ? report.passages : []

  // index evidence views by paperSection for quick lookup; the adapter
  // already orders them deterministically.
  const evidenceBySection = new Map<string, PassageEvidenceView>()
  for (const ev of evidenceModel.passages) {
    evidenceBySection.set(ev.paperSection, ev)
  }

  // index report-side question objects so we can fetch options without
  // walking nested arrays repeatedly.
  type ReportOption = { label: string; content: string }
  const optionsByQuestionId = new Map<string, ReportOption[]>()
  for (const passage of reportPassages) {
    for (const q of passage?.questions || []) {
      const opts = readOptionsFromQuestion(q as unknown as Record<string, unknown>)
      optionsByQuestionId.set(
        buildQuestionId(String(passage?.paperSection || ''), String(q?.questionNo || '')),
        opts,
      )
    }
  }

  const passages: PassagePreviewView[] = []
  for (const passage of reportPassages) {
    const section = String(passage?.paperSection || '')
    if (!section) continue

    const passageBody = typeof bodies[section] === 'string' ? bodies[section] : ''
    const evidenceView = evidenceBySection.get(section)
    const questionViews = evidenceView?.questions || []

    // segments for the active question's evidence items, if the active
    // question lives in this passage.
    const segments = buildPassageSegments({
      passageBody,
      activeQuestionId,
      sectionEvidence: evidenceView,
    })

    // build question rows for the left column.
    const rows: QuestionRow[] = []
    for (const qv of questionViews) {
      const questionId = buildQuestionId(qv.paperSection, qv.questionNo)
      const opts = optionsByQuestionId.get(questionId) || []
      rows.push({
        questionId,
        paperSection: qv.paperSection,
        questionNo: qv.questionNo,
        questionIndexInPassage: qv.questionIndexInPassage,
        stem: qv.stem,
        stemTranslation: getReportQuestionField(reportPassages, section, qv.questionNo, 'stemTranslation'),
        answer: qv.answer,
        teacherQuestionType: qv.teacherQuestionType,
        optionsForDisplay: sortOptionsByLabel(opts),
        isActive: questionId === activeQuestionId,
      })
    }

    passages.push({
      paperSection: section,
      passageTitle: typeof passage?.passageTitle === 'string' ? passage.passageTitle : '',
      passageBody,
      segments,
      questions: rows,
      bandLabel: pickString(passage?.aiInitialBand?.band, '—'),
    })
  }

  // analysis-panel projection for the active question, if any.
  const activeAnalysis = buildAnalysisView({
    activeQuestionId,
    evidenceModel,
    reportPassages,
  })

  return {
    paperId: evidenceModel.paperId,
    paperName: evidenceModel.paperName,
    passages,
    activeAnalysis,
    evidenceModel,
  }
}

/* ─────────────────────────── segment building ───────────────────────── */

/**
 * Produce a renderable segment list for one passage given the active
 * question id and the passage's evidence view.
 *
 * Algorithm:
 *   1. If passageBody is empty, return an empty list (component shows
 *      a notice).
 *   2. If no question is active, OR the active question is in a
 *      different passage, OR the active question has no evidence rows
 *      with non-null quotes, return a single text segment with the
 *      whole passageBody.
 *   3. Otherwise, find verbatim non-overlapping matches for each
 *      relevant evidence row's quote. When two candidates overlap, the
 *      earlier-listed evidence wins (the adapter sorts support before
 *      traps, so support always beats traps; among traps, the smaller
 *      optionLabel wins).
 *   4. Walk passageBody once, emitting text segments around each
 *      highlight span.
 */
export function buildPassageSegments(args: {
  passageBody: string
  activeQuestionId: string | null
  sectionEvidence: PassageEvidenceView | undefined
}): PassageSegment[] {
  const { passageBody, activeQuestionId, sectionEvidence } = args

  if (!passageBody) return []
  if (!activeQuestionId || !sectionEvidence) {
    return [{ kind: 'text', text: passageBody }]
  }

  // restrict to evidence items belonging to the active question only
  const relevant = sectionEvidence.evidenceItems.filter(
    (it) => buildQuestionId(it.paperSection, it.questionNo) === activeQuestionId,
  )
  if (relevant.length === 0) {
    return [{ kind: 'text', text: passageBody }]
  }

  // collect all (start, end, evidenceItem) candidates from indexOf
  type Candidate = {
    start: number
    end: number
    /** index in `relevant` — the adapter's deterministic order is
     *  support first, then traps by optionLabel ASC. We use this as the
     *  tiebreaker when two candidates overlap. */
    sourceOrder: number
    item: EvidenceItem
  }
  const candidates: Candidate[] = []
  for (let i = 0; i < relevant.length; i++) {
    const item = relevant[i]
    if (typeof item.quote !== 'string' || item.quote.length === 0) continue
    let from = 0
    while (from <= passageBody.length) {
      const idx = passageBody.indexOf(item.quote, from)
      if (idx === -1) break
      candidates.push({
        start: idx,
        end: idx + item.quote.length,
        sourceOrder: i,
        item,
      })
      from = idx + Math.max(1, item.quote.length) // forward scan; allow next, separate occurrence
    }
  }

  if (candidates.length === 0) {
    return [{ kind: 'text', text: passageBody }]
  }

  // resolve overlaps: greedy by start, longer-first as a secondary
  // sort, source-order-first as a tertiary tiebreaker. After pick, skip
  // any candidate that overlaps the chosen span.
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    const aLen = a.end - a.start
    const bLen = b.end - b.start
    if (aLen !== bLen) return bLen - aLen // prefer longer span at same start
    return a.sourceOrder - b.sourceOrder
  })

  const chosen: Candidate[] = []
  let cursor = 0
  for (const c of candidates) {
    if (c.start < cursor) continue // overlaps a chosen span
    chosen.push(c)
    cursor = c.end
  }

  // emit segments
  const out: PassageSegment[] = []
  let pos = 0
  for (const c of chosen) {
    if (c.start > pos) {
      out.push({ kind: 'text', text: passageBody.slice(pos, c.start) })
    }
    out.push({
      kind: 'highlight',
      text: passageBody.slice(c.start, c.end),
      evidenceId: c.item.id,
      questionId: buildQuestionId(c.item.paperSection, c.item.questionNo),
      evidenceKind: c.item.evidenceKind,
      optionLabel: c.item.evidenceKind === 'trap' ? c.item.optionLabel : null,
    })
    pos = c.end
  }
  if (pos < passageBody.length) {
    out.push({ kind: 'text', text: passageBody.slice(pos) })
  }
  return out
}

/* ─────────────────────────── analysis panel ─────────────────────────── */

/**
 * Build the right-panel projection for the active question. Returns
 * `null` when no question is active or when the active question id
 * does not resolve to anything in the EvidenceModel.
 */
function buildAnalysisView(args: {
  activeQuestionId: string | null
  evidenceModel: EvidenceModel
  reportPassages: PaperIntelligenceReport['passages']
}): AnalysisView | null {
  const { activeQuestionId, evidenceModel, reportPassages } = args
  if (!activeQuestionId) return null
  const parsed = parseQuestionId(activeQuestionId)
  if (!parsed) return null

  // locate the matching question view in the evidence model
  const passage = evidenceModel.passages.find((p) => p.paperSection === parsed.paperSection)
  if (!passage) return null
  const qv: QuestionEvidenceView | undefined = passage.questions.find(
    (q) => q.questionNo === parsed.questionNo,
  )
  if (!qv) return null

  // analysis quote rows: the active question's distractor (trap) items,
  // in evidenceItems order so the right panel matches the left highlights.
  const trapRows: AnalysisDistractorRow[] = qv.trapItems.map((t) => ({
    evidenceId: t.id,
    optionLabel: t.optionLabel,
    category: t.distractorCategory,
    subtype: t.distractorSubtype,
    shortReason: t.explanationZh,
    quote: t.quote,
    quoteIsTextOnly: t.quote === null,
  }))

  return {
    questionId: activeQuestionId,
    paperSection: qv.paperSection,
    questionNo: qv.questionNo,
    stem: qv.stem,
    stemTranslation: getReportQuestionField(
      reportPassages,
      qv.paperSection,
      qv.questionNo,
      'stemTranslation',
    ),
    answer: qv.answer,
    teacherQuestionType: qv.teacherQuestionType,
    supportEvidenceId: qv.supportItem?.id ?? null,
    answerEvidenceQuote: qv.supportItem?.quote ?? null,
    answerEvidenceExplanationZh: qv.supportItem?.explanationZh ?? '',
    locatingSentence: qv.locatingSentence,
    answerSentence: qv.answerSentence,
    distractors: trapRows,
    synonymSummary: qv.synonymSummary,
    tCard: qv.tCard,
    reviewNeeded: qv.reviewNeeded,
    confidence: qv.confidence,
  }
}

/* ─────────────────────────── small helpers ──────────────────────────── */

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/**
 * Read `options` off a report-side QuestionAnalysis. The V0 schema does
 * not formally include `options` on QuestionAnalysis (it lives on the
 * input side), but in practice the report sometimes carries them and
 * sometimes does not. We take whatever shape we get and normalize.
 *
 * If a question has no options on the report side, the left column will
 * still render the stem; options just won't appear. The interactive UI
 * does not treat that as an error — V1 only requires stems to be
 * clickable.
 */
function readOptionsFromQuestion(q: Record<string, unknown>): { label: string; content: string }[] {
  const raw = q?.options
  if (!Array.isArray(raw)) return []
  const out: { label: string; content: string }[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue
    const label = (o as { label?: unknown }).label
    const content = (o as { content?: unknown }).content
    if (typeof label !== 'string' || typeof content !== 'string') continue
    out.push({ label, content })
  }
  return out
}

function sortOptionsByLabel(options: { label: string; content: string }[]): { label: string; content: string }[] {
  return options.slice().sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

/**
 * Lookup helper for fields that exist on the report's QuestionAnalysis
 * but are not surfaced through QuestionEvidenceView (e.g. stemTranslation).
 * Returns `''` when the field is missing — the React layer can decide
 * whether to render or skip.
 */
function getReportQuestionField(
  passages: PaperIntelligenceReport['passages'],
  paperSection: string,
  questionNo: string,
  field: string,
): string {
  if (!Array.isArray(passages)) return ''
  for (const p of passages) {
    if (!p || p.paperSection !== paperSection) continue
    const qs = Array.isArray(p.questions) ? p.questions : []
    for (const q of qs) {
      if (q?.questionNo !== questionNo) continue
      const v = (q as unknown as Record<string, unknown>)[field]
      if (typeof v === 'string') return v
      return ''
    }
  }
  return ''
}

/* ─────────────────────────── re-exports ─────────────────────────────── */

// re-export the evidence-adapter helpers so consumers get a single
// import surface.
export { selectEvidence, toEvidenceModel }
export type { EvidenceItem, EvidenceModel }
