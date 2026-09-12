import type { ReactNode } from 'react'
import type {
  ApplicationWritingAnalysis,
  ReviewCard,
  WritingAnalysis,
} from '../../domain/paperAsset.ts'
import {
  isCompleteApplicationReviewCard,
  projectApplicationReviewCardDisplay,
} from '../../../../shared/writing/applicationReviewCard.mjs'

export function isCompleteReviewCard(value: unknown): value is ReviewCard {
  return isCompleteApplicationReviewCard(value)
}

export function hasCompleteApplicationLecturePayload(payload: {
  sourceTaskType: string | undefined
  analysis: WritingAnalysis | undefined
}): payload is {
  sourceTaskType: 'application'
  analysis: ApplicationWritingAnalysis
} {
  const { sourceTaskType, analysis } = payload
  return (
    sourceTaskType === 'application'
    && analysis?.taskType === 'application'
    && typeof analysis.modelAnswer === 'string'
    && analysis.modelAnswer.trim().length > 0
    && isCompleteReviewCard(analysis.reviewCard)
  )
}

export function getRetainedWritingLecture({
  lectureOpen,
  panelGroupId,
  groupId,
  sourceTaskType,
  analysis,
}: {
  lectureOpen: boolean
  panelGroupId: string | null
  groupId: string
  sourceTaskType: string | undefined
  analysis: WritingAnalysis | undefined
}): ApplicationWritingAnalysis | null {
  const payload = { sourceTaskType, analysis }
  if (
    !lectureOpen
    || panelGroupId !== groupId
    || !hasCompleteApplicationLecturePayload(payload)
  ) return null
  return payload.analysis
}

function RetainedModelAnswerSection({
  label,
  answer,
  source,
}: {
  label: string
  answer: string
  source: 'ai' | 'official'
}): ReactNode {
  return (
    <section className="retained-writing-answer-section" data-model-answer-source={source}>
      <h4 className="retained-writing-answer-label">{label}</h4>
      <div className="retained-writing-answer-copy">
        {answer.split('\n').map((line, index) => (
          <p key={index} className="retained-writing-answer-line">{line}</p>
        ))}
      </div>
    </section>
  )
}

export function RetainedModelAnswer({
  modelAnswer,
  officialModelAnswer,
}: {
  modelAnswer: string
  officialModelAnswer?: string
}): ReactNode {
  const hasOfficialModelAnswer = typeof officialModelAnswer === 'string'
    && officialModelAnswer.trim().length > 0
  return (
    <div className="retained-writing-answer">
      <RetainedModelAnswerSection label="AI 参考范文" answer={modelAnswer} source="ai" />
      {hasOfficialModelAnswer && (
        <RetainedModelAnswerSection
          label="官方范文"
          answer={officialModelAnswer}
          source="official"
        />
      )}
    </div>
  )
}

function ReviewCardRow({ label, values }: { label: string; values: string[] }): ReactNode {
  return (
    <div className="retained-writing-card-row">
      <dt>{label}</dt>
      <dd className="retained-writing-card-row-values">
        {values.map((value, index) => <span key={index}>{value}</span>)}
      </dd>
    </div>
  )
}

export function RetainedReviewCard({ reviewCard }: { reviewCard: ReviewCard }): ReactNode {
  const display = projectApplicationReviewCardDisplay(reviewCard)
  if (!display) return null
  return (
    <div className="retained-writing-card" data-review-card-version={display.sourceVersion}>
      <section
        className="retained-writing-card-section retained-writing-card-section--basics"
        data-review-section="basics"
      >
        <h5>基本审题</h5>
        <dl>
          <ReviewCardRow label="形式" values={[display.form]} />
          <ReviewCardRow label="主题与目的" values={display.topicPurpose} />
          <ReviewCardRow label="人称" values={[display.person]} />
          <ReviewCardRow label="时态" values={[display.tense]} />
        </dl>
      </section>
      <section
        className="retained-writing-card-section retained-writing-card-section--points"
        data-review-section="points"
      >
        <h5>内容要点</h5>
        <ol className="retained-writing-card-points">
          {display.points.map((point, index) => <li key={index}>{point}</li>)}
        </ol>
      </section>
      <section
        className="retained-writing-card-section retained-writing-card-section--reader"
        data-review-section="reader"
      >
        <h5>读者意识</h5>
        <dl>
          <ReviewCardRow label="读者与关系" values={display.readerRelationship} />
          <ReviewCardRow label="读者需要" values={display.readerNeeds} />
          <ReviewCardRow label="写作价值" values={[display.value]} />
        </dl>
      </section>
    </div>
  )
}
