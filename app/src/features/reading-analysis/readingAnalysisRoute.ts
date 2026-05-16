/**
 * readingAnalysisRoute — single source of truth for the Reading Analysis
 * route surface (Cut 3).
 *
 * Why this module exists:
 *   Before Cut 3 the route was a hidden `?demo=reading-analysis` toggle, so
 *   `?demo=reading-analysis` strings and `groupType === 'reading'` checks
 *   were sprinkled across `main.tsx`, the demo route component, and any
 *   would-be entry-point UI. Cut 3 introduces a real product entry from the
 *   concierge desk, and at that point we need ONE place that decides:
 *
 *     - "is this group eligible to open Reading Analysis?"
 *     - "what URL should the entry point link to?"
 *     - "did the current page URL ask us to boot Reading Analysis?"
 *
 *   No `?demo=reading-analysis` literals or `groupType === 'reading'` checks
 *   should live in UI files. They live here.
 *
 * URL surface:
 *   - `?view=reading-analysis&groupId=<id>[&questionNo=<no>]`  — product entry
 *   - `?demo=reading-analysis[&...]`                            — dev/demo alias
 *   - `#reading-analysis`                                       — dev/demo alias
 *
 * The dev/demo aliases are kept on purpose so that the existing fixture and
 * smoke flows (which deep-link via `?demo=reading-analysis`) stay green. The
 * product entry intentionally does NOT depend on the demo alias.
 */

/* ─────────────────────────── eligibility ─────────────────────────────── */

/**
 * The minimal contract the helper consumes from a group card. We accept a
 * structural type so that this module is decoupled from the full
 * `QuestionGroupCard` import (and so the verify script can test it without
 * pulling React/TSX dependencies in).
 */
export type ReadingAnalysisCandidate = {
  /** Group's question-bank discriminator. Only `'reading'` groups are eligible. */
  groupType: string
  /** Number of questions in the group. We never enter on an empty group. */
  questionCount: number
}

/**
 * Returns true iff the concierge desk should show the 阅读解析 entry for
 * this group. The rule is intentionally fixed and obvious so reviewers don't
 * need to search for variants:
 *
 *     groupType === 'reading' && questionCount > 0
 *
 * Future expansion (e.g. seven-choices) MUST update this predicate, never
 * the call sites.
 */
export function isReadingAnalysisCandidate(
  group: ReadingAnalysisCandidate | null | undefined,
): boolean {
  if (!group) return false
  if (group.groupType !== 'reading') return false
  if (typeof group.questionCount !== 'number') return false
  if (!(group.questionCount > 0)) return false
  return true
}

/* ─────────────────────────── href builder ────────────────────────────── */

export type BuildReadingAnalysisHrefArgs = {
  /** Required. Identifies which group the analysis view should load. */
  groupId: string
  /**
   * Optional explicit question number (e.g. `'2'`). When omitted, the route
   * falls back to `detail.questions[0].questionNo` at load time. Only emit
   * a `&questionNo=` segment when the caller actually has a value.
   */
  questionNo?: string | number | null
}

/**
 * Build the canonical product-entry URL. Always uses
 * `?view=reading-analysis&groupId=<id>` and only appends `&questionNo=<no>`
 * when a non-empty value is supplied. The href is relative on purpose — the
 * caller is always inside the SPA, and using a relative URL keeps the smoke
 * tests host-agnostic.
 *
 * Implementation notes:
 *   - We use `URLSearchParams` so the values are correctly encoded for any
 *     id shape (uuid, slug, CJK, etc.).
 *   - Booleans / `null` / `undefined` / empty strings on `questionNo` all
 *     collapse to "don't emit the param".
 */
export function buildReadingAnalysisHref(
  args: BuildReadingAnalysisHrefArgs,
): string {
  const params = new URLSearchParams()
  params.set('view', 'reading-analysis')
  params.set('groupId', String(args.groupId))
  const questionNo = normalizeQuestionNoParam(args.questionNo)
  if (questionNo !== null) {
    params.set('questionNo', questionNo)
  }
  return `?${params.toString()}`
}

function normalizeQuestionNoParam(
  value: string | number | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const stringified = String(value).trim()
  if (stringified === '') return null
  return stringified
}

/* ─────────────────────────── route parser ────────────────────────────── */

/**
 * Result of parsing the current page URL. The shape is deliberately small so
 * `main.tsx` can switch on `kind` without re-reading `window.location`.
 */
export type ReadingAnalysisRouteMatch =
  | { kind: 'app' }
  | {
      kind: 'reading-analysis'
      /**
       * Where the activation came from. The product entry must NOT depend on
       * `'demo-alias'` — components that need to behave differently for the
       * hidden demo (e.g. "show phone-box fixture when no groupId") should
       * branch on `source === 'demo-alias'`.
       */
      source: 'view-param' | 'demo-alias'
      groupId: string | null
      questionNo: string | null
    }

/**
 * Minimal `Location`-like shape so we can unit-test this without DOM.
 * `URL`, `Location`, and `URLSearchParams`-friendly objects all conform.
 */
export type ReadingAnalysisLocationLike = {
  search: string
  hash: string
}

/**
 * Decide what the current URL is asking the app to render.
 *
 * Activation precedence (matters because URLs may carry both signals during
 * a transitional period):
 *   1. `?view=reading-analysis`        → product entry  (`source: 'view-param'`)
 *   2. `?demo=reading-analysis` or `#reading-analysis` → dev alias (`source: 'demo-alias'`)
 *   3. anything else                    → main app (`{kind: 'app'}`)
 *
 * `groupId` and `questionNo` are read from the same query string regardless
 * of which activation matched.
 */
export function parseReadingAnalysisRoute(
  location: ReadingAnalysisLocationLike,
): ReadingAnalysisRouteMatch {
  const params = new URLSearchParams(location.search || '')
  const groupId = trimOrNull(params.get('groupId'))
  const questionNo = trimOrNull(params.get('questionNo'))

  if (params.get('view') === 'reading-analysis') {
    return { kind: 'reading-analysis', source: 'view-param', groupId, questionNo }
  }
  if (params.get('demo') === 'reading-analysis') {
    return { kind: 'reading-analysis', source: 'demo-alias', groupId, questionNo }
  }
  if ((location.hash || '') === '#reading-analysis') {
    return { kind: 'reading-analysis', source: 'demo-alias', groupId, questionNo }
  }
  return { kind: 'app' }
}

function trimOrNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
