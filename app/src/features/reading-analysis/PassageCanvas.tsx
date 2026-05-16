/**
 * PassageCanvas — left-side reading passage with paragraph numbers, sentence
 * spans, and inline annotation marks (evidence / trap).
 *
 * Each sentence is wrapped in a <span data-ra-sentence-id="…"> so that
 * LinkOverlay can resolve a TextAnchor to a real DOM rect for SVG routing.
 */

import { type ReactNode } from 'react'
import type {
  Passage,
  ReadingAnnotation,
} from './readingAnalysisTypes.ts'

export type PassageCanvasProps = {
  passage: Passage
  annotations: ReadingAnnotation[]
}

export function PassageCanvas(props: PassageCanvasProps): ReactNode {
  const { passage, annotations } = props

  // Group annotations by sentenceId for O(1) lookup while we render sentences.
  const bySentence = new Map<string, ReadingAnnotation[]>()
  for (const ann of annotations) {
    const list = bySentence.get(ann.target.sentenceId) ?? []
    list.push(ann)
    bySentence.set(ann.target.sentenceId, list)
  }

  return (
    <article className="reading-analysis-passage" aria-label="阅读原文">
      <header className="ra-passage-header">
        <h2 className="ra-passage-title">{passage.title}</h2>
      </header>
      <ol className="ra-paragraph-list">
        {passage.paragraphs.map((p, idx) => (
          <li key={p.id} className="ra-paragraph">
            <span className="ra-paragraph-num" aria-hidden="true">
              P{idx + 1}
            </span>
            <p className="ra-paragraph-body">
              {p.sentences.map((s) => {
                const anns = bySentence.get(s.id) ?? []
                const evidence = anns.find((a) => a.kind === 'evidence')
                const trap = anns.find((a) => a.kind === 'trap')
                const className = ['ra-sentence']
                if (evidence) className.push('ra-highlight-evidence')
                if (trap) className.push('ra-highlight-trap')
                const anchorId = evidence?.target.id ?? trap?.target.id
                return (
                  <span
                    key={s.id}
                    className={className.join(' ')}
                    data-ra-sentence-id={s.id}
                    data-ra-anchor-id={anchorId}
                    data-ra-kind={evidence ? 'evidence' : trap ? 'trap' : undefined}
                  >
                    {s.text}{' '}
                  </span>
                )
              })}
            </p>
          </li>
        ))}
      </ol>
    </article>
  )
}
