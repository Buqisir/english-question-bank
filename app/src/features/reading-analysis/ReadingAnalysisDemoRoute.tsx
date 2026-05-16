/**
 * ReadingAnalysisDemoRoute — boots the Reading Analysis demo.
 *
 * Reads `?groupId=…&questionNo=…` (and `&demo=reading-analysis` from the outer
 * router). When `groupId` is absent or any of {fetch, selector, sidecar}
 * fails, falls back to the hardcoded `READING_ANALYSIS_FIXTURE`. A small
 * source-note line in the header tells the user which dataset is on screen.
 *
 * No retry button, no toast — this is still the V0 demo surface.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { ReadingAnalysisView } from './ReadingAnalysisView.tsx'
import { READING_ANALYSIS_FIXTURE } from './readingAnalysisFixture.ts'
import type { ReadingAnalysisFixture } from './readingAnalysisTypes.ts'
import { fetchQuestionGroupDetail } from '../../services/questionGroups.ts'
import { selectReadingAnalysisFromDetail } from './selectors/selectReadingAnalysis.ts'
import { getReadingAnalysisSidecar } from './sidecar/readingAnalysisSidecar.ts'

type DemoQuery = {
  groupId: string | null
  questionNo: string | null
}

function readDemoQuery(): DemoQuery {
  if (typeof window === 'undefined') return { groupId: null, questionNo: null }
  const params = new URLSearchParams(window.location.search)
  const groupId = (params.get('groupId') || '').trim()
  const questionNo = (params.get('questionNo') || '').trim()
  return {
    groupId: groupId || null,
    questionNo: questionNo || null,
  }
}

type LoadState =
  | { phase: 'idle'; fixture: ReadingAnalysisFixture; note: string }
  | { phase: 'loading'; fixture: ReadingAnalysisFixture; note: string }
  | { phase: 'real'; fixture: ReadingAnalysisFixture; note: string; warnings: string[] }
  | { phase: 'fallback'; fixture: ReadingAnalysisFixture; note: string }

export function ReadingAnalysisDemoRoute(): ReactNode {
  // Resolve URL query exactly once; lazy state init avoids re-reading window
  // on every render and keeps StrictMode's double-invoke safe.
  const [query] = useState<DemoQuery>(() => readDemoQuery())
  const [state, setState] = useState<LoadState>(() => {
    if (!query.groupId) {
      return { phase: 'idle', fixture: READING_ANALYSIS_FIXTURE, note: '示例数据' }
    }
    return {
      phase: 'loading',
      fixture: READING_ANALYSIS_FIXTURE,
      note: `正在加载题组 ${query.groupId}…`,
    }
  })

  useEffect(() => {
    let cancelled = false
    const { groupId, questionNo } = query
    if (!groupId) return

    ;(async () => {
      let detail
      try {
        detail = await fetchQuestionGroupDetail(groupId)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setState({
          phase: 'fallback',
          fixture: READING_ANALYSIS_FIXTURE,
          note: `示例数据（无法加载 ${groupId}：${message}）`,
        })
        return
      }
      if (cancelled) return
      if (!detail) {
        setState({
          phase: 'fallback',
          fixture: READING_ANALYSIS_FIXTURE,
          note: `示例数据（题组 ${groupId} 不存在）`,
        })
        return
      }
      const sidecar = getReadingAnalysisSidecar(groupId)
      const result = selectReadingAnalysisFromDetail({
        detail,
        sidecar,
        questionNo: questionNo ?? undefined,
      })
      if (!result.ok) {
        setState({
          phase: 'fallback',
          fixture: READING_ANALYSIS_FIXTURE,
          note: `示例数据（selector 拒绝：${result.reason}）`,
        })
        return
      }
      const titlePart =
        detail.passage?.title?.trim() || detail.passageTitle || detail.title || groupId
      const realNote =
        `真实数据：${titlePart} · 第 ${questionNo || pickFirstQuestionNo(detail)} 题` +
        (result.warnings.length > 0 ? `（${result.warnings.length} 条提醒）` : '')
      setState({
        phase: 'real',
        fixture: result.fixture,
        note: realNote,
        warnings: result.warnings,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [query])

  return <ReadingAnalysisView fixture={state.fixture} sourceNote={state.note} />
}

function pickFirstQuestionNo(
  detail: { questions?: Array<{ questionNo?: string }> } | null | undefined,
): string {
  const first = detail?.questions?.[0]?.questionNo
  return first ? String(first) : '1'
}
