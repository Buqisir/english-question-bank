/**
 * paperIntelligenceEvidenceTypes — pure type definitions for the
 * EvidenceModel produced by the adapter.
 *
 * The adapter takes a PaperIntelligenceReport (V0 schema) and projects it
 * onto a flat, UI-agnostic "evidence model" that future UI layers (the
 * cross-column dotted-line system, the per-passage analysis panel, the
 * synonym replacement view, etc.) can consume without re-reading the
 * report's nested shape.
 *
 * IMPORTANT: this module is pure data. It MUST NOT import React, DOM,
 * Playwright, the browser, or anything outside of the V0 report types.
 */

import type {
  PaperIntelligenceReport,
  PassageReport,
  QuestionAnalysis,
  DistractorItem,
} from '../paperIntelligenceTypes.ts'

/* ─────────────────────────── kinds and labels ────────────────────────── */

/**
 * Why the evidence exists.
 *
 *   - 'support' — the answer evidence quote that backs the *correct* option.
 *                 Should render as a "support" line in the future UI
 *                 (matching the existing reading-analysis convention).
 *   - 'trap'    — a distractor's quote, regardless of distractor category.
 *                 Should render as a "trap" line so the teacher can see
 *                 which surface phrase the wrong option was misreading.
 *
 * Distractors with no quote (e.g. `not_mentioned` / `common_sense_distractor`)
 * are still represented by the model, but their `evidenceKind` is `'trap'`
 * AND their `quote` is null. UI layers may choose to render these as
 * text-only badges instead of dotted lines.
 */
export type EvidenceKind = 'support' | 'trap'

/* ─────────────────────────── core evidence row ───────────────────────── */

/**
 * One concrete evidence row tied to one (passage, question, optionLabel)
 * triple. The `id` is deterministic so future UI/Playwright tests can
 * target rows without depending on array order.
 *
 * The `quote` is the verbatim string the model claimed appears in
 * `passageBody`. The adapter does not verify the claim; that is the audit
 * script's job. UI consumers should treat `quote === null` as "no
 * highlightable text — render as text-only".
 */
export type EvidenceItem = {
  /** stable id, e.g. "A-21-correct" / "A-21-distractor-A". */
  id: string

  /** which passage this belongs to (A | B | C | D). */
  paperSection: string

  /** owning question's questionNo (string, matches the report). */
  questionNo: string

  /** which option this evidence is about. The correct option appears as
   *  `evidenceKind: 'support'`; each wrong option gets its own row with
   *  `evidenceKind: 'trap'`. */
  optionLabel: string

  /** support → answer evidence; trap → distractor. */
  evidenceKind: EvidenceKind

  /** correct-answer letter for the parent question. Convenient denorm so
   *  consumers don't have to look it up. */
  questionAnswer: string

  /** the verbatim quote claimed against passageBody. May be null for
   *  trap rows whose distractor had no `quote` field (allowed by V0
   *  schema for not_mentioned / common_sense_distractor). */
  quote: string | null

  /**
   * For support rows: the V0 `answerEvidence.explanationZh`.
   * For trap rows: the distractor's `shortReason`.
   *
   * The two are different strings in the V0 schema but they play the
   * same role for the future UI (a one-line caption rendered next to the
   * highlighted span), so they are unified onto one field here.
   */
  explanationZh: string

  /* — distractor-only fields, always present but null on support rows — */

  /** distractor category (e.g. detail_word_misleading). Null on support. */
  distractorCategory: string | null

  /** detail_word_misleading subtype, or null. Null on support. */
  distractorSubtype: string | null
}

/* ─────────────────────────── passage view ────────────────────────────── */

/**
 * Adapter projection of a single passage. The original `passageBody` is
 * carried through unchanged so downstream consumers (audit script, future
 * left-column passage view) can resolve quotes against it.
 *
 * `evidenceItems` is the flattened list of all evidence rows for every
 * question in this passage. Items are emitted in a deterministic order:
 *   1. by question's `questionIndexInPassage`,
 *   2. then 'support' before 'trap',
 *   3. then by distractor `optionLabel` (A < B < C < D).
 */
export type PassageEvidenceView = {
  paperSection: string
  passageTitle: string | null
  passageBody: string | null
  evidenceItems: EvidenceItem[]
  questions: QuestionEvidenceView[]
}

/**
 * Adapter projection of a single question. Carries the headline fields
 * the analysis panel needs (stem, answer, type, back-stage labels) and a
 * pre-built `evidenceItems` list scoped to this question.
 *
 * Back-stage labels (tCard, reviewNeeded, confidence) are exposed as-is.
 * UI consumers are expected to render them with a low visual weight.
 */
export type QuestionEvidenceView = {
  paperSection: string
  questionNo: string
  questionIndexInPassage: number
  stem: string
  answer: string
  teacherQuestionType: string

  /** this question's evidence rows (same items also live in the
   *  passage's flat `evidenceItems` array). */
  evidenceItems: EvidenceItem[]

  /** convenience: the single 'support' row, if present. */
  supportItem: EvidenceItem | null

  /** convenience: the trap rows in optionLabel order. */
  trapItems: EvidenceItem[]

  /** synonymSummary, only the correct option's substitution path. */
  synonymSummary: string

  /* — back-stage labels (low visual weight in UI) — */
  tCard: string
  reviewNeeded: boolean
  confidence: number | null
}

/**
 * Top-level adapter projection of the whole report. The full ordered list
 * of passages plus a flat `evidenceItems` list across all passages
 * (useful for the global audit script, and for any future "all evidence
 * on the whole paper" view).
 */
export type EvidenceModel = {
  paperId: string
  paperName: string
  passages: PassageEvidenceView[]
  evidenceItems: EvidenceItem[]
}

/* ─────────────────────────── adapter inputs ─────────────────────────── */

/**
 * Optional locator passed to `selectEvidence()` to scope the adapter to a
 * single passage / question / option. All fields are optional; absent
 * fields mean "do not filter on this dimension".
 */
export type EvidenceSelector = {
  paperSection?: string
  questionNo?: string
  optionLabel?: string
}

/**
 * Optional companion: for the audit / verify flow we need passageBody,
 * which is NOT part of the V0 report schema. The adapter accepts it
 * through a parallel `PassageBodyMap`. Missing entries mean the adapter
 * leaves `passageBody` as null and downstream consumers (e.g. the audit
 * script) decide whether that's a failure.
 */
export type PassageBodyMap = Record<string, string>

/**
 * Adapter options. `bodies` is optional; if absent, the resulting
 * `EvidenceModel` will carry `passageBody: null` for every passage.
 */
export type AdapterOptions = {
  bodies?: PassageBodyMap
}

/* ─────────────────────────── adapter signatures ─────────────────────── */

/**
 * Signature: convert a full report + optional passage bodies into an
 * EvidenceModel. The implementation lives in `paperIntelligenceEvidence.ts`.
 */
export type ToEvidenceModelFn = (
  report: PaperIntelligenceReport,
  options?: AdapterOptions,
) => EvidenceModel

/**
 * Signature: select a subset of an existing EvidenceModel. Used by the
 * future UI to scope dotted-line rendering to one question without
 * re-running the heavy adapter.
 */
export type SelectEvidenceFn = (
  model: EvidenceModel,
  selector?: EvidenceSelector,
) => EvidenceItem[]

/* re-export the V0 nested types so consumers can import them from this
 * module without dragging in the whole report.json shape. */
export type {
  PaperIntelligenceReport,
  PassageReport,
  QuestionAnalysis,
  DistractorItem,
}
