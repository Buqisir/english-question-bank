import type { ApplicationWritingAnalysis, HighlightExpression, ReviewMark } from '../../domain/paperAsset.ts'

const REVIEW_GRIDS = ['type', 'cares', 'points', 'tense', 'points'] as const

function isPlainSingleLine(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\r\n]|<[^>]*>|[`*_\[\]]/.test(value) &&
    [...value].length <= limit
  )
}

function hasLiteralLogicalLineAnchor(modelAnswer: string, anchor: unknown): anchor is string {
  return typeof anchor === 'string' && anchor.length > 0 && modelAnswer.split(/\r?\n/).some((line) => line.includes(anchor))
}

export function isPublishedWritingLecture(analysis: unknown): analysis is ApplicationWritingAnalysis {
  if (!analysis || typeof analysis !== 'object') return false
  const candidate = analysis as Partial<ApplicationWritingAnalysis>
  if (candidate.taskType !== 'application' || typeof candidate.modelAnswer !== 'string') return false
  const card = candidate.reviewCard
  const marks = candidate.reviewMarks
  const expressions = candidate.highlightExpressions
  if (
    !card ||
    !Array.isArray(card.points) ||
    card.points.length !== 2 ||
    card.points.some((point) => typeof point !== 'string' || !point.trim())
  )
    return false
  if (!Array.isArray(marks) || marks.length !== 5 || !Array.isArray(expressions) || expressions.length < 3 || expressions.length > 5)
    return false
  if (
    !marks.every(
      (mark, index) =>
        mark &&
        mark.grid === REVIEW_GRIDS[index] &&
        typeof mark.note === 'string' &&
        mark.note.trim() &&
        hasLiteralLogicalLineAnchor(candidate.modelAnswer!, mark.text),
    )
  )
    return false
  const annotated = expressions.filter((expression) => expression && expression.lectureAnnotation !== undefined)
  return (
    annotated.length === 4 &&
    annotated.every((expression) => {
      const annotation = expression.lectureAnnotation
      return (
        hasLiteralLogicalLineAnchor(candidate.modelAnswer!, expression.text) &&
        annotation !== undefined &&
        isPlainSingleLine(annotation.label, 24) &&
        isPlainSingleLine(annotation.note, 28) &&
        (annotation.transferExample === undefined || isPlainSingleLine(annotation.transferExample, 52))
      )
    })
  )
}

export function reviewMarkLabel(mark: ReviewMark, index: number, analysis: ApplicationWritingAnalysis): string {
  const card = analysis.reviewCard!
  if (mark.grid === 'type') return `判型「${card.type}」`
  if (mark.grid === 'tense') return `主时态 · ${card.tense}`
  if (mark.grid === 'cares') return `读者 · ${card.readerCares}`
  if (mark.grid === 'wants') return `读者 · ${card.readerWants}`
  const pointIndex = index === 2 ? 0 : 1
  return `要点${pointIndex === 0 ? '①' : '②'} · ${card.points[pointIndex]}`
}

export function WritingAnswerBoxReview({ status, onOpen }: { status: 'available' | 'loading' | 'unavailable'; onOpen: () => void }) {
  return (
    <button type="button" className="awl-answer-trigger" onClick={onOpen}>
      {status === 'loading' ? '解析加载中…' : status === 'available' ? '点击查看范文讲评' : '解析未发布'}
    </button>
  )
}

export type LectureExpression = HighlightExpression & {
  lectureAnnotation: NonNullable<HighlightExpression['lectureAnnotation']>
}
