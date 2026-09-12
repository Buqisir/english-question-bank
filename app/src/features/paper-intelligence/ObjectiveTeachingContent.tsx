import type { ReactNode } from 'react'
import type { ObjectiveTeachingView } from './objectiveTeachingContentAdapter.ts'

export function ObjectiveTeachingContent({ content }: { content: ObjectiveTeachingView | null }): ReactNode {
  if (!content) return null
  return (
    <div className="pi-objective-teaching">
      {(content.discourseSummary || content.discourseItems.length > 0) && (
        <details className="pi-objective-teaching-section">
          <summary>篇章结构</summary>
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
          <summary>全文译文</summary>
          <div className="pi-objective-translation">
            {content.translationParagraphs.map((paragraph) => (
              <p key={paragraph.paragraphId} data-translation-paragraph-id={paragraph.paragraphId}>
                {paragraph.segments.map((segment, index) => segment.kinds.length > 0 ? (
                  <span
                    key={`${paragraph.paragraphId}-${index}`}
                    className="pi-objective-translation-range"
                    data-annotation-kinds={segment.kinds.join(' ')}
                  >
                    {segment.questionNos.length > 0 && <b>[{segment.questionNos.join('、')}]</b>}
                    <span>{segment.text}</span>
                  </span>
                ) : segment.text)}
              </p>
            ))}
          </div>
        </details>
      )}
      {content.longSentences.length > 0 && (
        <details className="pi-objective-teaching-section">
          <summary>长难句解析</summary>
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
