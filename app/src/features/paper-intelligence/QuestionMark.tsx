import type { ReactNode } from 'react'
import { splitClueTail } from '../../../../shared/analysis/questionMarks.mjs'

export type QuestionMarkSegment = {
  text: string
  answer: boolean
  clue: boolean
  before: string[]
  after: string[]
  kinds: string[]
}

// One run of marked text, drawn the same way as the companion PDF
// (shared/analysis/questionMarks.mjs): the bracketed number goes in front
// where a question is answered ([41]); an answer is bold; a clue is on a pale
// tint, with a plain superscript number after its last character when it is
// apart from where its question is answered. Used by every objective type's
// translation and by the listening transcript.
export function QuestionMark({ segment }: { segment: QuestionMarkSegment }): ReactNode {
  if (!segment.answer && !segment.clue) return segment.text
  const className = ['pi-objective-mark', segment.answer && 'is-answer', segment.clue && 'is-clue']
    .filter(Boolean).join(' ')
  const number = segment.before.length > 0
    && <b className="pi-objective-mark-no">[{segment.before.join('、')}]</b>
  if (segment.after.length === 0) {
    return <>{number}<span className={className} data-annotation-kinds={segment.kinds.join(' ')}>{segment.text}</span></>
  }
  const [head, last, rest] = splitClueTail(segment.text)
  return (
    <>
      {number}
      <span className={className} data-annotation-kinds={segment.kinds.join(' ')}>{head}</span>
      <span className="pi-objective-mark-tail">
        <span className={className}>{last}</span>
        <sup className="pi-objective-mark-clue-no">{segment.after.join(',')}</sup>
      </span>
      {rest}
    </>
  )
}
