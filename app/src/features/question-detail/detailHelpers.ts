/**
 * Pure helpers shared between App.tsx and QuestionGroupDetailView.
 *
 * classic-retire-2-detail-view (plan step 1 + MF-2): these functions were
 * previously defined inline in App.tsx. Some are still referenced outside
 * the extracted detail branch (`compactGroupMeta`, `getDifficultyDraftForQuestion`),
 * so they live here as a single definition that both App.tsx and the new
 * component import — no duplicated copies.
 */
import type { GroupType, QuestionGroupDetail } from '../../domain/questionBank'
import { groupTypeLabel } from '../../domain/questionBank'

export type DifficultyRatingDraft = {
  teacherDifficulty: string
  reason: string
  note: string
}

export function mapAiDifficultyScoreToFive(score?: number | null) {
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) return null
  if (score <= 2) return 1
  if (score <= 3) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

export function getDisplayDifficulty(
  question: QuestionGroupDetail['questions'][number],
  aiDifficultyScore = question.aiDifficultyScore,
) {
  return question.teacherDifficulty ?? mapAiDifficultyScoreToFive(aiDifficultyScore)
}

export function getDifficultyDraftForQuestion(
  question: QuestionGroupDetail['questions'][number],
): DifficultyRatingDraft {
  return {
    teacherDifficulty: question.teacherDifficulty ? String(question.teacherDifficulty) : '',
    reason: question.difficultyOverrideReason || '',
    note: question.difficultyOverrideNote || '',
  }
}

export function requiresDifficultyReason(
  question: QuestionGroupDetail['questions'][number],
  draft: DifficultyRatingDraft,
  aiDifficultyScore = question.aiDifficultyScore,
) {
  const teacherDifficulty = Number(draft.teacherDifficulty)
  if (!Number.isInteger(teacherDifficulty)) return false
  const aiBucket = mapAiDifficultyScoreToFive(aiDifficultyScore)
  return aiBucket !== null && aiBucket !== teacherDifficulty
}

export function compactPreview(text: string, maxLength = 88) {
  const preview = text.replace(/\s+/g, ' ').trim()
  if (!preview) return '待补题干'
  return preview.length > maxLength ? `${preview.slice(0, maxLength)}...` : preview
}

export function compactGroupMeta(groupType: GroupType, questionCount: number) {
  return `${groupTypeLabel[groupType]} · ${questionCount} 题`
}

export function formatSavedAt(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}
