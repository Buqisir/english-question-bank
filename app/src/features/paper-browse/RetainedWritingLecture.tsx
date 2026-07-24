import type { ReactNode } from 'react'
import type {
  ApplicationWritingAnalysis,
  ReviewCard,
  WritingAnalysis,
} from '../../domain/paperAsset.ts'

const RETAINED_PILOT_GROUP_IDS = new Set([
  'group-2022-i-writing-application',
  'group-2024-i-writing-application',
])

export function isRetainedWritingPilotGroup(groupId: string): boolean {
  return RETAINED_PILOT_GROUP_IDS.has(groupId)
}

const REVIEW_CARD_SCALAR_FIELDS = [
  'form', 'topic', 'reader', 'person', 'tense', 'type',
  'readerWho', 'readerCares', 'readerWants', 'value',
] as const
const REVIEW_CARD_FIELDS = new Set<string>([...REVIEW_CARD_SCALAR_FIELDS, 'points'])
const REVIEW_CARD_FORBIDDEN_TEXT = /[\r\n\u0085\u000B\u000C\u2028\u2029<>*_`~#[\]]/
const REVIEW_CARD_MARKDOWN_LIST = /^(?:[-+*]|\d+[.)])\s/
const REVIEW_CARD_MARKDOWN_THEMATIC_BREAK = /^-{3,}$/

function isReviewCardText(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !REVIEW_CARD_FORBIDDEN_TEXT.test(value)
    && !REVIEW_CARD_MARKDOWN_LIST.test(value)
    && !REVIEW_CARD_MARKDOWN_THEMATIC_BREAK.test(value)
    && [...value].length <= 80
  )
}

export function isCompleteReviewCard(value: unknown): value is ReviewCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some((field) => !REVIEW_CARD_FIELDS.has(field))) return false
  if (!REVIEW_CARD_SCALAR_FIELDS.every((field) => isReviewCardText(candidate[field]))) return false
  return (
    Array.isArray(candidate.points)
    && candidate.points.length === 2
    && candidate.points.every(isReviewCardText)
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
  if (
    !lectureOpen
    || panelGroupId !== groupId
    || sourceTaskType !== 'application'
    || analysis?.taskType !== 'application'
    || typeof analysis.modelAnswer !== 'string'
    || analysis.modelAnswer.trim().length === 0
    || !isCompleteReviewCard(analysis.reviewCard)
  ) return null
  return analysis
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

function ReviewCardRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="retained-writing-card-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function RetainedReviewCard({ reviewCard }: { reviewCard: ReviewCard }): ReactNode {
  return (
    <div className="retained-writing-card">
      <section
        className="retained-writing-card-section retained-writing-card-section--basics"
        data-review-section="basics"
      >
        <h5>基础判断</h5>
        <dl>
          <ReviewCardRow label="体裁" value={reviewCard.form} />
          <ReviewCardRow label="主题" value={reviewCard.topic} />
          <ReviewCardRow label="读者" value={reviewCard.reader} />
          <ReviewCardRow label="人称" value={reviewCard.person} />
          <ReviewCardRow label="时态" value={reviewCard.tense} />
          <ReviewCardRow label="类型" value={reviewCard.type} />
        </dl>
      </section>
      <section
        className="retained-writing-card-section retained-writing-card-section--points"
        data-review-section="points"
      >
        <h5>内容要点</h5>
        <ol className="retained-writing-card-points">
          {reviewCard.points.map((point, index) => <li key={index}>{point}</li>)}
        </ol>
      </section>
      <section
        className="retained-writing-card-section retained-writing-card-section--reader"
        data-review-section="reader"
      >
        <h5>读者三问</h5>
        <dl>
          <ReviewCardRow label="是谁" value={reviewCard.readerWho} />
          <ReviewCardRow label="关心" value={reviewCard.readerCares} />
          <ReviewCardRow label="期待" value={reviewCard.readerWants} />
        </dl>
      </section>
      <section
        className="retained-writing-card-section retained-writing-card-section--value"
        data-review-section="value"
      >
        <h5>价值落点</h5>
        <p className="retained-writing-card-value">{reviewCard.value}</p>
      </section>
    </div>
  )
}
