/**
 * readingAnalysisViewState — pure state-shaping rules for the Reading
 * Analysis route.
 *
 * Cut 4 (zero-behavior refactor): every string literal, every phase tag,
 * every fallback rule lives here so that `ReadingAnalysisDemoRoute.tsx`
 * stays a thin renderer and `useReadingAnalysisViewState.ts` stays a thin
 * lifecycle glue. Tests can exercise the entire decision tree with plain
 * objects — no React, no DOM, no jsdom.
 *
 * The rules locked in by this module match the on-screen behavior shipped
 * in Cut 3 byte-for-byte:
 *
 *   - No `groupId` AND demo alias activation → phone-box示例 fixture.
 *   - No `groupId` AND product entry         → blocked screen "缺少题组参数",
 *                                              NO fallback to示例.
 *   - `groupId` present, fetch fails         → blocked "加载失败".
 *   - `groupId` present, detail missing      → blocked "加载失败".
 *   - selector rejects                       → blocked "暂不支持该题组的阅读解析"
 *                                              with reason-specific body.
 *   - selector OK + zero located annotations → real Passage + Question,
 *                                              note "（暂无证据标注）",
 *                                              no dashed lines.
 *   - selector OK + ≥1 located annotation    → real evidence overlay,
 *                                              note possibly "（N 条提醒）".
 *
 * No phase string, no headline string, no body string, and no `note`
 * string changes vs. the previous inline implementation.
 */

import type { ReadingAnalysisFixture } from '../readingAnalysisTypes.ts'
import type {
  SelectReadingAnalysisFailureReason,
  SelectReadingAnalysisResult,
} from '../selectors/selectReadingAnalysis.ts'

/* ─────────────────────────── route query ──────────────────────────────── */

/**
 * The route inputs the view state cares about. Mirrors the inline shape
 * the route component used previously and is the structural superset of
 * `parseReadingAnalysisRoute`'s match: `source`, `groupId`, `questionNo`.
 *
 * Kept as its own type (rather than reusing `ReadingAnalysisRouteMatch`
 * directly) so that this module is decoupled from the parser — the hook
 * can supply a query without any concept of "what is the URL?".
 */
export type ReadingAnalysisRouteQuery = {
  source: 'view-param' | 'demo-alias'
  groupId: string | null
  questionNo: string | null
}

/* ─────────────────────────── view-state shape ─────────────────────────── */

/**
 * What the route should render. The `phase` string discriminator is the
 * same one the previous inline `LoadState` used; no consumer should need
 * to read more than `phase` plus the fields branched off it.
 */
export type ReadingAnalysisViewState =
  | {
      phase: 'demo' | 'real-with-evidence' | 'real-without-evidence'
      fixture: ReadingAnalysisFixture
      note: string
    }
  | {
      phase: 'blocked'
      headline: string
      body: string
    }

/* ─────────────────── failure-reason → blocked text maps ──────────────── */

/**
 * Headline copy for selector failures. Identical strings to Cut 3 — keep
 * them here so the (rare) future addition of a new failure reason has
 * exactly one place to be wired.
 */
const FAILURE_HEADLINE: Record<SelectReadingAnalysisFailureReason, string> = {
  'empty-passage': '暂不支持该题组的阅读解析',
  'no-questions': '暂不支持该题组的阅读解析',
  'question-not-found': '暂不支持该题组的阅读解析',
  'unsupported-question-type': '暂不支持该题组的阅读解析',
}

const FAILURE_BODY: Record<SelectReadingAnalysisFailureReason, string> = {
  'empty-passage': '该题组没有阅读原文，无法生成证据标注。',
  'no-questions': '该题组没有可用的题目。',
  'question-not-found': '在该题组里没有找到指定的题号。',
  'unsupported-question-type': '阅读解析当前只支持标准的四选一阅读题。',
}

/* ─────────────────────────── initial state ────────────────────────────── */

/**
 * What the route should render BEFORE any async work has resolved.
 *
 * Three cases, all identical to the previous inline `initialState`:
 *
 *   1. demo alias + no groupId   → `phase: 'demo'` with the phone-box示例 fixture.
 *   2. product entry + no groupId → blocked "缺少题组参数".
 *   3. any source + groupId      → blocked "正在加载阅读解析…" placeholder
 *                                   (NOT the demo fixture — we never want
 *                                   a real-route load to flash phone-box
 *                                   content first).
 *
 * `getInitialReadingAnalysisViewState` does NOT consume the demo fixture
 * itself; the hook injects it. This keeps the pure module independent of
 * fixture data and easy to test.
 */
export type GetInitialReadingAnalysisViewStateArgs = {
  query: ReadingAnalysisRouteQuery
  /**
   * The phone-box示例 fixture. Injected so the pure module doesn't depend
   * on the fixture import (which would otherwise pull data into every
   * test). Pass `READING_ANALYSIS_FIXTURE` from the route's call site.
   */
  demoFixture: ReadingAnalysisFixture
}

export function getInitialReadingAnalysisViewState(
  args: GetInitialReadingAnalysisViewStateArgs,
): ReadingAnalysisViewState {
  const { query, demoFixture } = args

  if (!query.groupId) {
    if (query.source === 'view-param') {
      // Product entry without a groupId is a programming error somewhere
      // upstream — but we still must not silently render the phone-box
      // fixture (the rule is: no fallback for product entries).
      return {
        phase: 'blocked',
        headline: '缺少题组参数',
        body: '阅读解析需要 ?view=reading-analysis&groupId=<id>。',
      }
    }
    // Demo alias without a groupId → phone-box fixture (developer demo).
    return {
      phase: 'demo',
      fixture: demoFixture,
      note: '示例数据',
    }
  }
  // groupId present → we're about to fetch; render the demo fixture as a
  // placeholder body would be wrong (would briefly show phone-box content
  // for a real group), so we render the blocked-screen "正在加载…" instead.
  return {
    phase: 'blocked',
    headline: '正在加载阅读解析…',
    body: `题组 ${query.groupId}`,
  }
}

/* ───────────────────────── derived (post-fetch) state ─────────────────── */

/**
 * Minimal subset of the question-group detail this module reads. We keep
 * the structural type local (rather than importing `QuestionGroupDetail`)
 * so the pure module doesn't depend on the detail's full shape — easier
 * to test with hand-rolled fixtures.
 */
export type ReadingAnalysisDetailLike = {
  id?: string
  title?: string
  passageTitle?: string
  passage?: { title?: string } | null
  questions?: Array<{ questionNo?: string }>
}

/**
 * Discriminated result of the detail fetch.
 *
 * Generic in `TDetail` so the hook can preserve the full `QuestionGroupDetail`
 * it received and hand it straight to `selectReadingAnalysisFromDetail`
 * (which requires the full type) without widening through the structural
 * `ReadingAnalysisDetailLike` shape this module reads. The default keeps
 * the pure decision functions independent of the full detail type so they
 * stay easy to test with hand-rolled fixtures (see
 * `scripts/verify-reading-analysis-view-state.mjs`).
 *
 * Read positions only — `TDetail` appears under `'ok'.detail` and is never
 * written. That makes `ReadingAnalysisFetchOutcome<Sub>` covariantly
 * assignable to `ReadingAnalysisFetchOutcome<Super>`, which is what lets
 * `deriveReadingAnalysisViewState` keep its non-generic parameter type
 * while accepting outcomes parameterised on a wider detail type.
 */
export type ReadingAnalysisFetchOutcome<
  TDetail extends ReadingAnalysisDetailLike = ReadingAnalysisDetailLike,
> =
  | { kind: 'ok'; detail: TDetail }
  | { kind: 'error'; message: string }
  | { kind: 'missing' }

/**
 * Inputs to `deriveReadingAnalysisViewState`. The hook performs the actual
 * fetch / sidecar / selector calls, then hands the results to this pure
 * function for the final shape decision.
 */
export type DeriveReadingAnalysisViewStateArgs = {
  query: ReadingAnalysisRouteQuery
  fetchOutcome: ReadingAnalysisFetchOutcome
  /**
   * Selector result. May be `null` when the upstream short-circuited (i.e.
   * the fetch failed or returned no detail), in which case this argument
   * is ignored. Callers SHOULD pass `null` rather than a fake selector
   * result in that case so the function reads naturally.
   */
  selectorResult: SelectReadingAnalysisResult | null
}

export function deriveReadingAnalysisViewState(
  args: DeriveReadingAnalysisViewStateArgs,
): ReadingAnalysisViewState {
  const { query, fetchOutcome, selectorResult } = args

  // The hook only invokes this function when `query.groupId` is truthy
  // (the demo-alias / product-entry-no-groupId branches are decided in
  // `getInitialReadingAnalysisViewState`). We guard anyway to keep the
  // function total.
  if (!query.groupId) {
    return {
      phase: 'blocked',
      headline: '缺少题组参数',
      body: '阅读解析需要 ?view=reading-analysis&groupId=<id>。',
    }
  }

  if (fetchOutcome.kind === 'error') {
    return {
      phase: 'blocked',
      headline: '加载失败',
      body: `无法加载题组 ${query.groupId}：${fetchOutcome.message}`,
    }
  }

  if (fetchOutcome.kind === 'missing') {
    return {
      phase: 'blocked',
      headline: '加载失败',
      body: `题组 ${query.groupId} 不存在。`,
    }
  }

  // fetchOutcome.kind === 'ok' from here on.
  const detail = fetchOutcome.detail

  if (!selectorResult) {
    // Defensive: the hook should always pass a selector result for an OK
    // fetch. Treat this as "loading" so we never render stale state.
    return {
      phase: 'blocked',
      headline: '正在加载阅读解析…',
      body: `题组 ${query.groupId}`,
    }
  }

  if (!selectorResult.ok) {
    return {
      phase: 'blocked',
      headline: FAILURE_HEADLINE[selectorResult.reason],
      body: FAILURE_BODY[selectorResult.reason],
    }
  }

  const fixture = selectorResult.fixture
  const effectiveQuestionNo = query.questionNo ?? pickFirstQuestionNo(detail)
  const titlePart = pickTitlePart(detail, query.groupId)

  // The selector accepts a missing sidecar and yields zero annotations.
  // We treat that as "real Passage + Question, but explicitly note that
  // there is no evidence annotation yet". In practice we either had no
  // sidecar at all OR the sidecar entries all failed to locate; both
  // present the same UX: real material, no dashed lines, friendly note.
  if (fixture.annotations.length === 0) {
    return {
      phase: 'real-without-evidence',
      fixture,
      note: `真实数据：${titlePart} · 第 ${effectiveQuestionNo} 题（暂无证据标注）`,
    }
  }

  const warningSuffix =
    selectorResult.warnings.length > 0
      ? `（${selectorResult.warnings.length} 条提醒）`
      : ''

  return {
    phase: 'real-with-evidence',
    fixture,
    note: `真实数据：${titlePart} · 第 ${effectiveQuestionNo} 题${warningSuffix}`,
  }
}

/* ───────────────────────────── helpers ────────────────────────────────── */

function pickFirstQuestionNo(detail: ReadingAnalysisDetailLike): string {
  const first = detail.questions?.[0]?.questionNo
  return first ? String(first) : '1'
}

function pickTitlePart(
  detail: ReadingAnalysisDetailLike,
  groupId: string,
): string {
  const passageTitle = detail.passage?.title?.trim()
  if (passageTitle) return passageTitle
  if (detail.passageTitle) return detail.passageTitle
  if (detail.title) return detail.title
  return groupId
}
