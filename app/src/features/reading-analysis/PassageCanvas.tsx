/**
 * PassageCanvas — left-side reading passage with paragraph numbers, sentence
 * spans, and inline annotation marks (evidence / trap).
 *
 * This component is now strictly a renderer. All quote-location, normalization,
 * same-sentence ordering, and overlap-fallback rules live in
 * `./evidenceLinking/quoteAnchors.ts`. We call `planSentenceRender(...)` per
 * sentence and walk the returned segments + fallback metadata.
 *
 * The data attributes we emit (sentence id and quote anchor) come from the
 * shared `anchorKeys` module so the LinkOverlay reader and PassageCanvas
 * writer can never drift.
 */

import { type ReactNode } from 'react'
import {
  ATTR_QUOTE_ANCHOR,
  ATTR_SENTENCE_ID,
  formatQuoteTargetKey,
  formatSentenceTargetKey,
  planSentenceRender,
  type SentenceRenderPlan,
} from './evidenceLinking/index.ts'
import type {
  ReadingAnnotation,
  PassageSentence,
  Passage,
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
              {p.sentences.map((s) => renderSentence(s, bySentence.get(s.id) ?? []))}
            </p>
          </li>
        ))}
      </ol>
    </article>
  )
}

function renderSentence(
  sentence: PassageSentence,
  anns: ReadingAnnotation[],
): ReactNode {
  const plan = planSentenceRender(sentence, anns)

  const sentenceClasses = ['ra-sentence']
  if (plan.fallback.hasEvidence) sentenceClasses.push('ra-highlight-evidence')
  if (plan.fallback.hasTrap) sentenceClasses.push('ra-highlight-trap')

  return (
    <span
      key={sentence.id}
      className={sentenceClasses.join(' ')}
      {...{ [ATTR_SENTENCE_ID]: formatSentenceTargetKey(sentence.id) }}
      data-ra-anchor-id={plan.fallback.anchorId}
      data-ra-kind={plan.fallback.kind}
    >
      {renderSegments(plan)}{' '}
    </span>
  )
}

function renderSegments(plan: SentenceRenderPlan): ReactNode[] {
  const out: ReactNode[] = []
  let textCursor = 0
  let markCursor = 0
  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i]
    if (seg.kind === 'text') {
      out.push(<span key={`t${textCursor++}`}>{seg.text}</span>)
    } else {
      out.push(
        <mark
          key={`m${markCursor++}-${seg.annotationId}`}
          className={
            seg.annotationKind === 'evidence'
              ? 'ra-quote-mark ra-quote-mark-evidence'
              : 'ra-quote-mark ra-quote-mark-trap'
          }
          {...{ [ATTR_QUOTE_ANCHOR]: formatQuoteTargetKey(seg.annotationId) }}
          data-ra-kind={seg.annotationKind}
        >
          {seg.text}
        </mark>,
      )
    }
  }
  return out
}
