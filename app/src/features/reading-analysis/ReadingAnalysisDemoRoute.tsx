/**
 * ReadingAnalysisDemoRoute — thin renderer for the Reading Analysis route.
 *
 * Cut 4 (zero-behavior refactor): all route-query reading, fetch /
 * sidecar / selector calls, and state-shaping rules now live in the View
 * State Module (`./viewState/`). This component only:
 *
 *   1. Asks `useReadingAnalysisViewState()` for the current state.
 *   2. Branches on `state.phase`:
 *        - `'blocked'`                          → `<ReadingAnalysisBlockedScreen ...>`
 *        - `'demo' | 'real-with-evidence' | 'real-without-evidence'`
 *                                               → `<ReadingAnalysisView ...>`
 *
 * The blocked screen DOM/CSS contract (`.reading-analysis-view`,
 * `.reading-analysis-header`, `data-ra-blocked="true"`, inline styles) is
 * preserved byte-for-byte from the previous inline implementation.
 *
 * The semantic rules (when do we show phone-box示例 / 真实数据 / 暂无证据
 * 标注 / 加载失败 / 暂不支持该题组的阅读解析) are documented next to the
 * pure module that owns them — see `./viewState/readingAnalysisViewState.ts`.
 */

import { type ReactNode } from 'react'
import { ReadingAnalysisView } from './ReadingAnalysisView.tsx'
import { useReadingAnalysisViewState } from './viewState/index.ts'

export function ReadingAnalysisDemoRoute(): ReactNode {
  const state = useReadingAnalysisViewState()

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
