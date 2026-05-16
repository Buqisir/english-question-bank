/**
 * ReadingAnalysisView — V0 PoC for the "题目 ↔ 原文证据虚线" loop.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ PassageCanvas              │ QuestionPanel           │
 *   │ (left, scrollable)         │ (right, sticky)         │
 *   └──────────────────────────────────────────────────────┘
 *   The whole view is the LinkOverlay's coordinate root.
 *
 * Click the stem → support line to evidence.
 * Click the correct option → support line to evidence.
 * Click a wrong option → trap line to a trap span.
 * Click empty space → clear.
 *
 * Hardcoded fixture, no backend, no `QuestionGroupDetail` integration.
 */

import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { PassageCanvas } from './PassageCanvas.tsx'
import { QuestionPanel } from './QuestionPanel.tsx'
import { LinkOverlay } from './LinkOverlay.tsx'
import { READING_ANALYSIS_FIXTURE } from './readingAnalysisFixture.ts'
import type { ActiveSelection } from './readingAnalysisTypes.ts'
import './readingAnalysis.css'

export function ReadingAnalysisView(): ReactNode {
  const [selection, setSelection] = useState<ActiveSelection>({ kind: 'none' })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const passageScrollRef = useRef<HTMLDivElement | null>(null)
  const { passage, annotations, question, links } = READING_ANALYSIS_FIXTURE

  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // Only clear when the click landed on the bare background — not on a
    // sentence span, a question button, or any clickable child.
    if (
      target.closest(
        'button, a, input, textarea, select, [role="button"], .ra-sentence',
      )
    ) {
      return
    }
    setSelection({ kind: 'none' })
  }

  return (
    <div
      ref={containerRef}
      className="reading-analysis-view"
      onClick={handleBackgroundClick}
    >
      <header className="reading-analysis-header">
        <h1 className="reading-analysis-title">阅读题目分析（PoC）</h1>
        <p className="reading-analysis-sub">
          点击题干或选项查看证据虚线。点击空白可清空。
        </p>
      </header>
      <div className="reading-analysis-grid">
        <div ref={passageScrollRef} className="reading-analysis-passage-scroller">
          <PassageCanvas passage={passage} annotations={annotations} />
          {/* Spacer so we can actually scroll inside the panel for the smoke check. */}
          <div className="ra-passage-spacer" aria-hidden="true" />
        </div>
        <div className="reading-analysis-question-pane">
          <QuestionPanel
            question={question}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      </div>
      <LinkOverlay
        containerRef={containerRef}
        scrollRefs={[passageScrollRef]}
        selection={selection}
        links={links}
        annotations={annotations}
      />
    </div>
  )
}
