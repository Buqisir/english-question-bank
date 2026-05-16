/**
 * Reading Evidence Annotation — observation-only helpers.
 *
 * Three pure functions live here:
 *
 *   - normalizeQuote       — canonicalise a quote string for substring
 *                             matching. Identical to the selector's old
 *                             private helper, lifted unchanged.
 *
 *   - classifyMissReason   — label a quote that the selector failed to
 *                             locate, using a closed reason vocabulary.
 *                             Pure observation — does NOT change matcher
 *                             policy or selector semantics.
 *
 *   - summarizeQuoteDiagnostics — fold a list of `ReadingAnalysisQuoteDiagnostic`
 *                             rows into stable hit/miss/reason counts the
 *                             report script can render directly.
 *
 * The matcher itself stays in the selector. This module only defines what
 * "the same observation" means once a hit/miss has been decided.
 */

import type {
  ReadingAnalysisQuoteDiagnostic,
  ReadingAnalysisQuoteReason,
} from './annotationTypes.ts'

/* ─────────────────────────── normalization ───────────────────────────── */

/**
 * Canonicalise a quote for substring matching:
 *   - trim
 *   - collapse all whitespace (incl. NBSP, CJK ideographic space) to a
 *     single ASCII space
 *   - unify curly / straight apostrophes
 *   - unify dashes (-, –, —)
 *   - lowercase
 *
 * Punctuation other than apostrophes/dashes is preserved so that
 * "decline." doesn't suddenly equal "decline?".
 *
 * Lifted byte-for-byte from the previous selector-private helper. The
 * selector re-exports this name from its own module for back-compat with
 * the existing verify script and any other callers.
 */
export function normalizeQuote(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00A0\u3000\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

/* ─────────────────────────── miss classification ────────────────────── */

/**
 * Minimal sentence shape `classifyMissReason` reads. We intentionally use
 * a structural type (rather than importing `Passage` from
 * `readingAnalysisTypes`) so this module stays decoupled from the
 * passage-render shape.
 */
export type CoverageSentenceLike = { text: string }
export type CoverageParagraphLike = { sentences: CoverageSentenceLike[] }
export type CoveragePassageLike = { paragraphs: CoverageParagraphLike[] }

/**
 * Classify a quote miss into a coarse, fixed vocabulary so the report can
 * group failures. This is OBSERVATION ONLY — selector matching is
 * unchanged.
 *
 *   - cross_sentence  : the quote contains an internal sentence terminator,
 *                        suggesting it was authored across two sentences
 *                        (e.g. "...refund. The last day...")
 *   - multiple_matches: the leading half of the quote appears in 2+
 *                        sentences and is therefore ambiguous to a
 *                        single-sentence includes() match
 *   - not_found       : default — the quote simply isn't there
 *
 * NB: the return type is the narrow miss-only subset of
 * `ReadingAnalysisQuoteReason`. Hit-side coexistence reasons
 * (`same_sentence_multi`) are decided in the selector at hit-emission
 * time.
 */
export function classifyMissReason(
  passage: CoveragePassageLike,
  quote: string,
): 'not_found' | 'cross_sentence' | 'multiple_matches' {
  const trimmed = normalizeQuote(quote)
  if (!trimmed) return 'not_found'

  // Cross-sentence: any terminator that has at least one alphabetic/CJK
  // char before AND after counts. Catches "...refund. The last day..."
  // but not trailing "... refund." (single-sentence quote with terminal
  // punctuation).
  if (/[A-Za-z\u4e00-\u9fff][.!?。！？]\s+[A-Za-z\u4e00-\u9fff]/.test(trimmed)) {
    return 'cross_sentence'
  }

  // Multiple matches: take the first ~30 normalized chars of the quote
  // and see if they appear in 2+ distinct sentences. Empty/short quotes
  // skip this branch.
  const probe = trimmed.slice(0, 30)
  if (probe.length >= 8) {
    let sentenceMatches = 0
    for (const para of passage.paragraphs) {
      for (const s of para.sentences) {
        const hay = normalizeQuote(s.text)
        if (hay.includes(probe)) {
          sentenceMatches++
          if (sentenceMatches > 1) return 'multiple_matches'
        }
      }
    }
  }

  return 'not_found'
}

/* ────────────────────── coverage summary helper ─────────────────────── */

type MissReason = Exclude<ReadingAnalysisQuoteReason, 'same_sentence_multi'>

/**
 * Aggregate counts produced by `summarizeQuoteDiagnostics`. Shape is
 * tuned for the report script's existing output (Summary section + Miss
 * Reason Breakdown table) so the refactor is byte-stable.
 */
export type ReadingAnalysisCoverageSummary = {
  /** Total number of diagnostic rows considered. */
  totalEntries: number
  /** Number of rows whose `status === 'hit'`. */
  totalHits: number
  /** Number of rows whose `status === 'miss'`. */
  totalMisses: number
  /**
   * Miss-only reason counts. Always exposes the three closed-set keys
   * even when their count is zero — the report's table always shows the
   * same three rows.
   */
  reasonCounts: Record<MissReason, number>
  /**
   * Miss rate in `[0, 1]`. Defined as `0` when there are no entries (the
   * report formats this as `"0.0%"`).
   */
  missRate: number
}

const MISS_REASONS: readonly MissReason[] = [
  'not_found',
  'cross_sentence',
  'multiple_matches',
]

/**
 * Fold a list of diagnostic rows into the coverage summary the report
 * script wants. Behavior matches the previous inline accumulator:
 *
 *   - rows with `status === 'hit'` count toward `totalHits`.
 *   - rows with `status === 'miss'` count toward `totalMisses`.
 *   - rows with `status === 'miss'` and a recognised `reason` increment
 *     `reasonCounts[reason]`. Unknown reasons are ignored (matches the
 *     `reason in reasonCounts` guard the report used to carry inline).
 *   - hit-side coexistence reasons (`same_sentence_multi`) are NOT
 *     counted in `reasonCounts`.
 *   - `missRate = totalEntries === 0 ? 0 : totalMisses / totalEntries`.
 *
 * Pure: no I/O, no formatting — the report script remains the only
 * place that decides percentage formatting / table layout.
 */
export function summarizeQuoteDiagnostics(
  diagnostics: readonly ReadingAnalysisQuoteDiagnostic[],
): ReadingAnalysisCoverageSummary {
  const reasonCounts: Record<MissReason, number> = {
    not_found: 0,
    cross_sentence: 0,
    multiple_matches: 0,
  }
  let totalHits = 0
  let totalMisses = 0
  for (const d of diagnostics) {
    if (d.status === 'hit') {
      totalHits++
    } else if (d.status === 'miss') {
      totalMisses++
      if (d.reason && isMissReason(d.reason)) {
        reasonCounts[d.reason]++
      }
    }
  }
  const totalEntries = diagnostics.length
  const missRate = totalEntries === 0 ? 0 : totalMisses / totalEntries
  return { totalEntries, totalHits, totalMisses, reasonCounts, missRate }
}

function isMissReason(reason: ReadingAnalysisQuoteReason): reason is MissReason {
  return (MISS_REASONS as readonly string[]).includes(reason)
}
