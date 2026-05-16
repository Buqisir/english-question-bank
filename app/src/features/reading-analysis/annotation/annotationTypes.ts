/**
 * Reading Evidence Annotation — type schemas.
 *
 * Cut 5 (zero-behavior refactor) consolidates every annotation-data type
 * into this module. Before Cut 5 these lived next to the selector and the
 * sidecar loader; that worked while only one caller existed, but as soon
 * as the report script (and any future "去标注" UI) starts reading them
 * back, having two parallel definitions is a hazard.
 *
 * The module is deliberately pure TS — no React, no DOM, no Vite-only
 * runtime. Every consumer (selector, sidecar loader, report script,
 * future annotation entry-point UI) imports from here.
 *
 * Backward compatibility: the selector re-exports each of these types
 * under their old names so existing imports keep working.
 */

/* ──────────────────────────── sidecar shape ─────────────────────────── */

/** Single sidecar annotation row, after normalization. */
export type ReadingAnnotationSidecarEntry = {
  /** Question-group id this entry belongs to. */
  groupId: string
  /** Question number inside the group, normalized to a non-empty string. */
  questionNo: string
  /**
   * If the entry is option-scoped (i.e. it's the evidence/trap for a
   * specific A/B/C/D option), the canonical option letter. When omitted
   * the entry is stem-scoped.
   */
  optionLabel?: 'A' | 'B' | 'C' | 'D'
  /** What kind of annotation this is. */
  kind: 'evidence' | 'trap'
  /** The exact quoted span, as authored. Matched as a normalized substring. */
  quote: string
}

/**
 * Wrapper around a group's sidecar entries. Mirrors the on-disk JSON
 * payload shape (after normalization) and is what the selector consumes.
 */
export type ReadingAnalysisSidecar = {
  entries: ReadingAnnotationSidecarEntry[]
}

/* ─────────────────────────── manifest shape ────────────────────────── */

/**
 * Single sample entry in `app/src/features/reading-analysis/sidecar/index.json`.
 *
 * Authored by hand; consumed by the report script and the live `--real`
 * smoke. Optional fields keep the schema permissive while still locking
 * the must-have keys (`groupId`, `case`, `title`).
 */
export type ReadingAnalysisSidecarSample = {
  groupId: string
  questionNo?: string
  case: string
  title: string
  /** Free-form prose explaining what the case is meant to exercise. */
  expect?: string
}

/** Top-level shape of `sidecar/index.json`. */
export type ReadingAnalysisSidecarManifest = {
  samples: ReadingAnalysisSidecarSample[]
  /** Free-form notes the manifest may carry; not consumed programmatically. */
  _note?: string
  _observations?: Record<string, string>
}

/* ────────────────────── quote diagnostic vocabulary ────────────────── */

/**
 * Bounded vocabulary of "why a quote landed where it did". Closed set —
 * extending this enum is a breaking change for the report script and any
 * future surface that groups by reason.
 *
 *   - not_found         : the quote isn't in any sentence (default miss).
 *   - cross_sentence    : the quote spans two sentences (matcher policy
 *                          treats this as a miss).
 *   - multiple_matches  : the quote's leading window appears in 2+
 *                          sentences (ambiguous).
 *   - same_sentence_multi : informational on hits — the same sentence
 *                          already received another annotation.
 */
export type ReadingAnalysisQuoteReason =
  | 'not_found'
  | 'cross_sentence'
  | 'multiple_matches'
  | 'same_sentence_multi'

/**
 * One diagnostic entry per sidecar row. Emitted alongside the selector
 * fixture so report tooling and (future) annotation-entry UIs can read
 * coverage without re-running the matcher.
 */
export type ReadingAnalysisQuoteDiagnostic = {
  groupId: string
  questionNo: string
  optionLabel?: 'A' | 'B' | 'C' | 'D'
  kind: 'evidence' | 'trap'
  quote: string
  status: 'hit' | 'miss'
  /**
   * On a miss, why; on a hit, an optional coexistence note. The reason is
   * informational on hits — it does NOT signal that the entry was rejected.
   */
  reason?: ReadingAnalysisQuoteReason
}
