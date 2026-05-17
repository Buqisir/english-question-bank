/**
 * paperIntelligenceEvidence — pure adapter from PaperIntelligenceReport
 * (V0 schema) to a flat, UI-agnostic EvidenceModel.
 *
 * Why this module exists:
 *   The Claude reviewer guidance for the next cut is clear — DO NOT jump
 *   straight to a cross-column dotted-line UI. First nail down two things:
 *
 *     1. a single source of truth for "what counts as evidence" given a
 *        PaperIntelligenceReport, and
 *     2. a way to audit whether the model's claimed quotes actually hit
 *        the passage text verbatim.
 *
 *   This module owns (1). The audit script (`scripts/verify-paper-
 *   intelligence-evidence-audit.mjs`) owns (2) and consumes (1).
 *
 * Hard constraints (also enforced statically by the verify script):
 *   - No React, no DOM, no `window`, no `document`, no Playwright.
 *   - No fetch / no model calls / no DB.
 *   - No mutation of inputs.
 *   - Stable, deterministic ordering (the future UI relies on this).
 *
 * Stable id format:
 *   `<paperSection>-<questionNo>-correct`            for support rows
 *   `<paperSection>-<questionNo>-distractor-<label>` for trap rows
 *
 * Ordering:
 *   passages → questions (by questionIndexInPassage) → support before
 *   traps → traps by optionLabel ascending.
 */

import type {
  AdapterOptions,
  EvidenceItem,
  EvidenceModel,
  EvidenceSelector,
  PassageBodyMap,
  PassageEvidenceView,
  QuestionEvidenceView,
} from './paperIntelligenceEvidenceTypes.ts'
import type {
  DistractorItem,
  PaperIntelligenceReport,
  PassageReport,
  QuestionAnalysis,
} from '../paperIntelligenceTypes.ts'

/* ─────────────────────────── id helpers ─────────────────────────────── */

/**
 * Build the stable id for the *correct-answer* (support) evidence row.
 * Exposed so the audit script and the future UI can reconstruct ids
 * without depending on adapter internals.
 */
export function buildSupportEvidenceId(
  paperSection: string,
  questionNo: string,
): string {
  return `${paperSection}-${questionNo}-correct`
}

/**
 * Build the stable id for a distractor (trap) evidence row.
 */
export function buildTrapEvidenceId(
  paperSection: string,
  questionNo: string,
  optionLabel: string,
): string {
  return `${paperSection}-${questionNo}-distractor-${optionLabel}`
}

/* ─────────────────────────── trim helpers ───────────────────────────── */

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function safeStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : null
}

function safeNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/* ─────────────────────────── per-question build ─────────────────────── */

/**
 * Build the support EvidenceItem for one question, or `null` if the
 * report's question is missing the answerEvidence shape entirely. The
 * adapter never throws; malformed rows are just skipped from the model.
 */
function buildSupportItem(question: QuestionAnalysis): EvidenceItem | null {
  if (!question || typeof question !== 'object') return null
  const ev = question.answerEvidence
  // We tolerate missing quote/explanation by emitting nulls rather than
  // dropping the row. Audit script will flag a null-quote support row
  // as a hit failure (vs. distractor null-quote which is allowed).
  const quote = safeStringOrNull(ev?.quote)
  const explanation = safeString(ev?.explanationZh)
  return {
    id: buildSupportEvidenceId(safeString(question.paperSection), safeString(question.questionNo)),
    paperSection: safeString(question.paperSection),
    questionNo: safeString(question.questionNo),
    optionLabel: safeString(question.answer),
    evidenceKind: 'support',
    questionAnswer: safeString(question.answer),
    quote,
    explanationZh: explanation,
    distractorCategory: null,
    distractorSubtype: null,
  }
}

/**
 * Build the trap EvidenceItem for one distractor row.
 */
function buildTrapItem(
  question: QuestionAnalysis,
  distractor: DistractorItem,
): EvidenceItem {
  return {
    id: buildTrapEvidenceId(
      safeString(question.paperSection),
      safeString(question.questionNo),
      safeString(distractor.optionLabel),
    ),
    paperSection: safeString(question.paperSection),
    questionNo: safeString(question.questionNo),
    optionLabel: safeString(distractor.optionLabel),
    evidenceKind: 'trap',
    questionAnswer: safeString(question.answer),
    quote: safeStringOrNull(distractor.quote),
    explanationZh: safeString(distractor.shortReason),
    distractorCategory: safeString(distractor.category),
    distractorSubtype: safeStringOrNull(distractor.subtype),
  }
}

/**
 * Project one question into a QuestionEvidenceView. The returned view's
 * `evidenceItems` is in the canonical order: support first, then traps
 * by optionLabel ASC. This same order is preserved when the items are
 * later flattened up to the passage and model levels.
 */
function buildQuestionView(question: QuestionAnalysis): QuestionEvidenceView | null {
  if (!question || typeof question !== 'object') return null
  const support = buildSupportItem(question)

  const distractors = Array.isArray(question.distractorAnalysis)
    ? question.distractorAnalysis
    : []

  // sort distractors by optionLabel ASC for deterministic output
  const sortedDistractors = [...distractors].sort((a, b) => {
    const al = safeString(a?.optionLabel)
    const bl = safeString(b?.optionLabel)
    return al < bl ? -1 : al > bl ? 1 : 0
  })

  const trapItems = sortedDistractors
    .filter((d): d is DistractorItem => Boolean(d) && typeof d === 'object')
    .map((d) => buildTrapItem(question, d))

  const evidenceItems: EvidenceItem[] = []
  if (support) evidenceItems.push(support)
  evidenceItems.push(...trapItems)

  return {
    paperSection: safeString(question.paperSection),
    questionNo: safeString(question.questionNo),
    questionIndexInPassage:
      typeof question.questionIndexInPassage === 'number'
        ? question.questionIndexInPassage
        : 0,
    stem: safeString(question.stem),
    answer: safeString(question.answer),
    teacherQuestionType: safeString(question.teacherQuestionType),
    evidenceItems,
    supportItem: support,
    trapItems,
    synonymSummary: safeString(question.synonymSummary),
    tCard: safeString(question.tCard),
    reviewNeeded: Boolean(question.reviewNeeded),
    confidence: safeNumberOrNull(question.confidence),
  }
}

/* ─────────────────────────── per-passage build ─────────────────────── */

/**
 * Project one passage into a PassageEvidenceView. Questions are sorted
 * by `questionIndexInPassage` ASC so id-based UI tests can rely on a
 * stable order.
 */
function buildPassageView(
  passage: PassageReport,
  bodies: PassageBodyMap | undefined,
): PassageEvidenceView {
  const section = safeString(passage.paperSection)
  const passageBody = bodies && Object.prototype.hasOwnProperty.call(bodies, section)
    ? safeStringOrNull(bodies[section])
    : null

  const sortedQuestions = (Array.isArray(passage.questions) ? passage.questions : [])
    .slice()
    .sort(
      (a, b) =>
        (typeof a?.questionIndexInPassage === 'number' ? a.questionIndexInPassage : 0) -
        (typeof b?.questionIndexInPassage === 'number' ? b.questionIndexInPassage : 0),
    )

  const questionViews: QuestionEvidenceView[] = []
  const flatItems: EvidenceItem[] = []
  for (const q of sortedQuestions) {
    const view = buildQuestionView(q)
    if (!view) continue
    questionViews.push(view)
    flatItems.push(...view.evidenceItems)
  }

  return {
    paperSection: section,
    passageTitle: safeStringOrNull(passage.passageTitle),
    passageBody,
    evidenceItems: flatItems,
    questions: questionViews,
  }
}

/* ─────────────────────────── public API ──────────────────────────────── */

/**
 * Convert a PaperIntelligenceReport into an EvidenceModel.
 *
 * The function is total — it never throws on malformed input. Missing
 * passages, questions, or fields turn into empty arrays / null fields so
 * the audit script can report concrete failures rather than dying.
 *
 * `options.bodies` is the place to pass in original passage text (from
 * `input.json`). If omitted, the resulting model carries `passageBody:
 * null` and downstream consumers (audit) will treat this as "cannot
 * verify quote hit".
 */
export function toEvidenceModel(
  report: PaperIntelligenceReport,
  options?: AdapterOptions,
): EvidenceModel {
  if (!report || typeof report !== 'object') {
    return {
      paperId: '',
      paperName: '',
      passages: [],
      evidenceItems: [],
    }
  }

  const sourcePaper = report.sourcePaper || ({} as PaperIntelligenceReport['sourcePaper'])
  const bodies = options?.bodies

  const passages = Array.isArray(report.passages) ? report.passages : []
  const passageViews: PassageEvidenceView[] = []
  const flatItems: EvidenceItem[] = []
  for (const p of passages) {
    if (!p || typeof p !== 'object') continue
    const view = buildPassageView(p, bodies)
    passageViews.push(view)
    flatItems.push(...view.evidenceItems)
  }

  return {
    paperId: safeString(sourcePaper.paperId),
    paperName: safeString(sourcePaper.paperName),
    passages: passageViews,
    evidenceItems: flatItems,
  }
}

/**
 * Filter the flat `evidenceItems` of an EvidenceModel by an optional
 * locator. Returns a new array; never mutates the model.
 *
 * - selector absent / empty → returns the full list unchanged.
 * - selector with paperSection → only items in that passage.
 * - selector with questionNo  → only items for that question.
 * - selector with optionLabel → only items for that option.
 *
 * All three may be combined.
 */
export function selectEvidence(
  model: EvidenceModel,
  selector?: EvidenceSelector,
): EvidenceItem[] {
  if (!model || typeof model !== 'object') return []
  const items = Array.isArray(model.evidenceItems) ? model.evidenceItems : []
  if (!selector) return items.slice()

  const wantSection = safeStringOrNull(selector.paperSection)
  const wantQuestion = safeStringOrNull(selector.questionNo)
  const wantOption = safeStringOrNull(selector.optionLabel)

  return items.filter((it) => {
    if (wantSection !== null && it.paperSection !== wantSection) return false
    if (wantQuestion !== null && it.questionNo !== wantQuestion) return false
    if (wantOption !== null && it.optionLabel !== wantOption) return false
    return true
  })
}
