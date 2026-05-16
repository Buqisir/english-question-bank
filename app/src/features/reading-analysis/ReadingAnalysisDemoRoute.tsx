/**
 * ReadingAnalysisDemoRoute — boots the Reading Analysis view from the URL.
 *
 * Cut 3 semantics (the file is still named "Demo" for branch-noise reasons,
 * but the route is now product-grade):
 *
 *   - No `groupId` AND demo alias activation → phone-box示例 fixture.
 *   - `groupId` present                       → fetchQuestionGroupDetail.
 *       · fetch failure                       → error/empty state, NO fallback to示例
 *       · detail missing / null               → error/empty state, NO fallback to示例
 *       · selector rejects                    → "暂不支持该题组的阅读解析" empty state, NO fallback to示例
 *       · selector OK + sidecar missing       → real Passage + Question, "暂无证据标注", no dashed lines
 *       · selector OK + sidecar present       → real evidence overlay (existing behavior)
 *
 *   - Default question number falls back to `detail.questions[0].questionNo`,
 *     never the hard-coded `'1'`. URL `?questionNo=` overrides.
 *
 * The route parser (`readingAnalysisRoute.ts`) is the only place that knows
 * about `?view=reading-analysis` vs `?demo=reading-analysis`. Here we just
 * consume the parsed match.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { ReadingAnalysisView } from './ReadingAnalysisView.tsx'
import { READING_ANALYSIS_FIXTURE } from './readingAnalysisFixture.ts'
import {
  parseReadingAnalysisRoute,
  type ReadingAnalysisRouteMatch,
} from './readingAnalysisRoute.ts'
import type { ReadingAnalysisFixture } from './readingAnalysisTypes.ts'
import { fetchQuestionGroupDetail } from '../../services/questionGroups.ts'
import {
  selectReadingAnalysisFromDetail,
  type SelectReadingAnalysisFailureReason,
} from './selectors/selectReadingAnalysis.ts'
import { getReadingAnalysisSidecar } from './sidecar/readingAnalysisSidecar.ts'

type RouteQuery = {
  source: 'view-param' | 'demo-alias'
  groupId: string | null
  questionNo: string | null
}

function readRouteQuery(): RouteQuery {
  if (typeof window === 'undefined') {
    return { source: 'view-param', groupId: null, questionNo: null }
  }
  const match: ReadingAnalysisRouteMatch = parseReadingAnalysisRoute(
    window.location,
  )
  if (match.kind !== 'reading-analysis') {
    // The router only mounts this route for `kind === 'reading-analysis'`.
    // If we somehow got here without a match (e.g. someone imported this
    // component directly), default to demo-alias / no group so the phone-box
    // fixture renders rather than a blank screen.
    return { source: 'demo-alias', groupId: null, questionNo: null }
  }
  return {
    source: match.source,
    groupId: match.groupId,
    questionNo: match.questionNo,
  }
}

/**
 * What is currently on screen. We split fixture-screen states from
 * blocked-screen states explicitly so the renderer never has to guess what
 * to show.
 */
type LoadState =
  | {
      // Renders ReadingAnalysisView with a fixture.
      phase: 'demo' | 'real-with-evidence' | 'real-without-evidence'
      fixture: ReadingAnalysisFixture
      note: string
    }
  | {
      // Renders the blocked / empty screen with a friendly headline + body.
      phase: 'blocked'
      headline: string
      body: string
    }

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

export function ReadingAnalysisDemoRoute(): ReactNode {
  // Resolve URL once. Lazy state init keeps StrictMode's double-invoke safe.
  const [query] = useState<RouteQuery>(() => readRouteQuery())
  const [state, setState] = useState<LoadState>(() => initialState(query))

  useEffect(() => {
    if (!query.groupId) return
    let cancelled = false

    ;(async () => {
      let detail
      try {
        detail = await fetchQuestionGroupDetail(query.groupId!)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setState({
          phase: 'blocked',
          headline: '加载失败',
          body: `无法加载题组 ${query.groupId}：${message}`,
        })
        return
      }
      if (cancelled) return

      if (!detail) {
        setState({
          phase: 'blocked',
          headline: '加载失败',
          body: `题组 ${query.groupId} 不存在。`,
        })
        return
      }

      const sidecar = getReadingAnalysisSidecar(query.groupId!)
      // Only pass `questionNo` to the selector when the URL provided one,
      // so the selector falls back to the first question naturally.
      const selectorInput =
        query.questionNo === null
          ? { detail, sidecar }
          : { detail, sidecar, questionNo: query.questionNo }
      const result = selectReadingAnalysisFromDetail(selectorInput)

      if (!result.ok) {
        setState({
          phase: 'blocked',
          headline: FAILURE_HEADLINE[result.reason],
          body: FAILURE_BODY[result.reason],
        })
        return
      }

      // Effective question number, used only for the source-note string.
      // `result.fixture.question` already reflects the right question; here
      // we just want the number to display.
      const effectiveQuestionNo =
        query.questionNo ?? pickFirstQuestionNo(detail)

      const titlePart =
        detail.passage?.title?.trim() ||
        detail.passageTitle ||
        detail.title ||
        query.groupId

      // The selector accepts a missing sidecar and yields zero annotations.
      // We treat that as "real Passage + Question, but explicitly note that
      // there is no evidence annotation yet". In practice we either had no
      // sidecar at all OR the sidecar entries all failed to locate; both
      // present the same UX: real material, no dashed lines, friendly note.
      const hasEvidence = result.fixture.annotations.length > 0
      if (!hasEvidence) {
        setState({
          phase: 'real-without-evidence',
          fixture: result.fixture,
          note: `真实数据：${titlePart} · 第 ${effectiveQuestionNo} 题（暂无证据标注）`,
        })
        return
      }

      const warningSuffix =
        result.warnings.length > 0
          ? `（${result.warnings.length} 条提醒）`
          : ''
      setState({
        phase: 'real-with-evidence',
        fixture: result.fixture,
        note: `真实数据：${titlePart} · 第 ${effectiveQuestionNo} 题${warningSuffix}`,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [query])

  if (state.phase === 'blocked') {
    return (
      <ReadingAnalysisBlockedScreen
        headline={state.headline}
        body={state.body}
      />
    )
  }

  return <ReadingAnalysisView fixture={state.fixture} sourceNote={state.note} />
}

/* ───────────────────────── initial state helper ──────────────────────── */

function initialState(query: RouteQuery): LoadState {
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
      fixture: READING_ANALYSIS_FIXTURE,
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

function pickFirstQuestionNo(
  detail: { questions?: Array<{ questionNo?: string }> } | null | undefined,
): string {
  const first = detail?.questions?.[0]?.questionNo
  return first ? String(first) : '1'
}

/* ─────────────────────────── empty / error screen ────────────────────── */

type ReadingAnalysisBlockedScreenProps = {
  headline: string
  body: string
}

/**
 * Minimal blocked / loading / error surface. Reuses the same view-level CSS
 * class so it sits inside the same chrome as the real analysis view (header
 * bar with the title, body fills the rest). No new CSS file — the visuals
 * are deliberately plain so the message is the focus.
 */
function ReadingAnalysisBlockedScreen(
  props: ReadingAnalysisBlockedScreenProps,
): ReactNode {
  return (
    <div className="reading-analysis-view" data-ra-blocked="true">
      <header className="reading-analysis-header">
        <h1 className="reading-analysis-title">阅读解析</h1>
      </header>
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '32px',
          maxWidth: 640,
          margin: '0 auto',
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{props.headline}</h2>
        <p style={{ color: '#444', lineHeight: 1.6 }}>{props.body}</p>
      </div>
    </div>
  )
}
