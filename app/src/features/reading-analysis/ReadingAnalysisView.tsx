/**
 * ReadingAnalysisView — pure render layer for the V0 PoC.
 *
 * No fetching, no URL reading, no fixture decisions live here. The demo
 * route (or anything else later) chooses a `ReadingAnalysisFixture` and
 * passes it in.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ PassageCanvas              │ QuestionPanel           │
 *   │ (left, scrollable)         │ (right, sticky)         │
 *   └──────────────────────────────────────────────────────┘
 *
 * Click stem → support line to evidence.
 * Click correct option → support line to evidence.
 * Click wrong option → trap line to a trap span.
 * Click empty space → clear.
 */

import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { PassageCanvas } from './PassageCanvas.tsx'
import { QuestionPanel } from './QuestionPanel.tsx'
import { LinkOverlay } from './LinkOverlay.tsx'
import type {
  ActiveSelection,
  ReadingAnalysisFixture,
} from './readingAnalysisTypes.ts'
import './readingAnalysis.css'

export type ReadingAnalysisViewProps = {
  fixture: ReadingAnalysisFixture
  /** Small one-line note shown in the header — e.g. "示例数据" / "真实数据：…". */
  sourceNote?: string
}

export function ReadingAnalysisView(props: ReadingAnalysisViewProps): ReactNode {
  const { fixture, sourceNote } = props
  const { passage, annotations, question, links } = fixture
  const [selection, setSelection] = useState<ActiveSelection>({ kind: 'none' })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const passageScrollRef = useRef<HTMLDivElement | null>(null)

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
        {sourceNote && (
          <p className="reading-analysis-source-note" data-ra-source-note>
            {sourceNote}
          </p>
        )}
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
