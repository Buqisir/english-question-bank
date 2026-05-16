/**
 * QuestionPanel — right-side question card with stem + 4 options + rationale.
 *
 * Click events:
 *   - clicking the stem area selects { kind: 'stem' }
 *   - clicking an option selects { kind: 'option', optionKey }
 *
 * Each clickable surface owns a stable data-ra-link-source so LinkOverlay can
 * resolve the SVG path's start anchor.
 */

import { type ReactNode } from 'react'
import type { ActiveSelection, Question } from './readingAnalysisTypes.ts'

export type QuestionPanelProps = {
  question: Question
  selection: ActiveSelection
  onSelect: (next: ActiveSelection) => void
}

export function QuestionPanel(props: QuestionPanelProps): ReactNode {
  const { question, selection, onSelect } = props

  const stemActive =
    selection.kind === 'stem' && selection.questionId === question.id

  return (
    <aside className="reading-analysis-question" aria-label="题卡">
      <button
        type="button"
        className={`ra-question-stem${stemActive ? ' is-active' : ''}`}
        data-ra-link-source={`q:${question.id}`}
        onClick={() => onSelect({ kind: 'stem', questionId: question.id })}
        aria-pressed={stemActive}
      >
        <span className="ra-question-stem-label">题干</span>
        <span className="ra-question-stem-text">{question.stem}</span>
      </button>

      <ul className="ra-option-list">
        {question.options.map((opt) => {
          const active =
            selection.kind === 'option' &&
            selection.questionId === question.id &&
            selection.optionKey === opt.key
          const tone = opt.correct ? 'correct' : 'wrong'
          return (
            <li key={opt.key}>
              <button
                type="button"
                className={`ra-option ra-option-${tone}${active ? ' is-active' : ''}`}
                data-ra-link-source={`q:${question.id}:${opt.key}`}
                data-ra-correct={opt.correct ? 'true' : 'false'}
                onClick={() =>
                  onSelect({
                    kind: 'option',
                    questionId: question.id,
                    optionKey: opt.key,
                  })
                }
                aria-pressed={active}
              >
                <span
                  className="ra-option-key"
                  data-ra-option-anchor={`q:${question.id}:${opt.key}`}
                >
                  {opt.key}
                </span>
                <span className="ra-option-text">{opt.text}</span>
                {active && (
                  <span className="ra-option-rationale">{opt.rationale}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="ra-question-explanation">{question.explanation}</p>
    </aside>
  )
}
