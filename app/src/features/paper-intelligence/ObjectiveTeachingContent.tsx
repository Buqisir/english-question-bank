import type { ReactNode } from 'react'
import type { ObjectiveTeachingView } from './objectiveTeachingContentAdapter.ts'
import { DisclosureIcon } from '../../icons/MotionIcons'
import { iconMotionInput } from '../../icons/motionInput'
import { splitClueTail } from '../../../../shared/analysis/questionMarks.mjs'

type TranslationSegment = ObjectiveTeachingView['translationParagraphs'][number]['segments'][number]

// The same marks as the companion PDF (shared/analysis/questionMarks.mjs): an
// answer is bold with its number in front, as on the exam paper; a clue is
// underlined with its number after its last character.
function TranslationSegmentMark({ segment }: { segment: TranslationSegment }): ReactNode {
  if (!segment.answer && !segment.clue) return segment.text
  const className = ['pi-objective-mark', segment.answer && 'is-answer', segment.clue && 'is-clue']
    .filter(Boolean).join(' ')
  const number = segment.before.length > 0
    && <b className="pi-objective-mark-no">{segment.before.join('、')}</b>
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

export function ObjectiveTeachingContent({ content }: { content: ObjectiveTeachingView | null }): ReactNode {
  if (!content) return null
  if (content.unavailable) return <p className="pi-ps-analysis-empty">这组讲评暂不可用</p>
  return (
    <div className="pi-objective-teaching">
      {(content.discourseSummary || content.discourseItems.length > 0) && (
        <details className="pi-objective-teaching-section">
          <summary {...iconMotionInput}><DisclosureIcon kind="branch" size={12} />篇章结构</summary>
          <div className="pi-objective-discourse">
            {content.discourseSummary && <p>{content.discourseSummary}</p>}
            {content.discourseItems.map((item) => (
              <p key={item.id}><b>{item.label}</b>{item.summary}{item.functionText && `；作用：${item.functionText}`}</p>
            ))}
          </div>
        </details>
      )}
      {content.translationParagraphs.length > 0 && (
        <details className="pi-objective-teaching-section">
          <summary {...iconMotionInput}><DisclosureIcon kind="branch" size={12} />全文译文</summary>
          <div className="pi-objective-translation">
            {content.translationParagraphs.map((paragraph) => (
              <p key={paragraph.paragraphId} data-translation-paragraph-id={paragraph.paragraphId}>
                {paragraph.segments.map((segment, index) => (
                  <TranslationSegmentMark key={`${paragraph.paragraphId}-${index}`} segment={segment} />
                ))}
              </p>
            ))}
          </div>
        </details>
      )}
      {content.longSentences.length > 0 && (
        <details className="pi-objective-teaching-section">
          <summary {...iconMotionInput}><DisclosureIcon kind="branch" size={12} />长难句解析</summary>
          <div className="pi-objective-long-sentences">
            {content.longSentences.map((sentence) => (
              <article key={sentence.sentenceId} data-selected-sentence-id={sentence.sentenceId}>
                {sentence.questionNos.length > 0 && <small>关联题目 {sentence.questionNos.join('、')}</small>}
                <p lang="en">{sentence.segments.map((segment, index) => segment.underlined
                  ? <u key={index}>{segment.text}</u>
                  : segment.text)}</p>
                <p><b>句子解析</b>{sentence.analysisZh}</p>
                <p><b>参考译文</b>{sentence.translationZh}</p>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
