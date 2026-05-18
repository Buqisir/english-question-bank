/**
 * piToPaperQuestions — pure adapter: PI report + input → PaperQuestion[].
 *
 * Issue #21-C1.
 *
 * Rules (locked by verify script):
 *   - No React. No hooks. No DOM. No fetch. No localStorage. No router.
 *   - No side effects.
 *   - PaperQuestion id uses `${paperSection}-${questionNo}` convention.
 *   - PaperQuestion does NOT include answer, explanation,
 *     distractorAnalysis, or synonymSummary.
 *   - Options map: { label, content } → { label, text }.
 */

import type { PaperQuestion, PaperQuestionOption } from '../../../../../shared/papersurface/types'
import type { PaperIntelligenceReport, QuestionOption } from '../paperIntelligenceTypes'

export type PiQuestionsInput = {
  report: PaperIntelligenceReport
  /**
   * Options from input.json keyed by questionId (`${paperSection}-${questionNo}`).
   * Used as fallback when report-side options are absent.
   */
  inputOptions?: Record<string, QuestionOption[]>
}

/**
 * Build PaperQuestion[] from a PI report.
 *
 * Question id format: `${paperSection}-${questionNo}` — matches the
 * existing PI evidence adapter convention.
 */
export function piToPaperQuestions(input: PiQuestionsInput): PaperQuestion[] {
  const { report, inputOptions } = input
  const passages = Array.isArray(report?.passages) ? report.passages : []
  const questions: PaperQuestion[] = []

  for (const passage of passages) {
    const section = passage?.paperSection
    if (!section) continue

    const passageQuestions = Array.isArray(passage.questions) ? passage.questions : []

    for (let i = 0; i < passageQuestions.length; i++) {
      const q = passageQuestions[i]
      if (!q) continue

      const questionNo = String(q.questionNo ?? '')
      if (!questionNo) continue

      const id = `${section}-${questionNo}`

      // Resolve options: prefer report-side, fallback to input.json
      const reportOptions = readOptions(q.options)
      const resolvedOptions =
        reportOptions.length > 0
          ? reportOptions
          : inputOptions?.[id]
            ? readOptions(inputOptions[id])
            : []

      const paperOptions: PaperQuestionOption[] = resolvedOptions.map((o) => ({
        label: o.label,
        text: o.content,
      }))

      questions.push({
        id,
        section,
        order: typeof q.questionIndexInPassage === 'number' ? q.questionIndexInPassage : i,
        questionNo,
        stem: typeof q.stem === 'string' ? q.stem : '',
        stemTranslation: typeof q.stemTranslation === 'string' ? q.stemTranslation : undefined,
        options: paperOptions,
      })
    }
  }

  return questions
}

/**
 * Safely read options from a possibly-absent or malformed array.
 */
function readOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return []
  const out: QuestionOption[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue
    const label = (o as { label?: unknown }).label
    const content = (o as { content?: unknown }).content
    if (typeof label === 'string' && typeof content === 'string') {
      out.push({ label, content })
    }
  }
  return out
}
