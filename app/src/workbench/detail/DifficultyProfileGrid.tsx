// H12-B PR1: read-only six-dimension reading difficulty profile card.
// Extracted verbatim from App.tsx (the `reading-profile-card` block in the
// question-detail list). Pure presentational — no state, no fetch, no reducer.
// The derived inputs (mainBlockers / vocabBlockerWords) and the showAi gate are
// computed by the caller exactly as before and passed in, so rendering stays
// byte-identical.
import type {
  ReadingParseDifficultyProfile,
  ReadingParseSurfaceQuestion,
} from '../../domain/questionBank'
import {
  answeringMoveLabel,
  blockerPositionLabel,
  blockerRoleLabel,
  difficultyProfileLevelLabel,
  infoSpanLabel,
  labelOf,
  mainBlockerLabel,
  surfaceQuestionTypeLabel,
  surfaceScopeLabel,
} from './readingProfileLabels'

type VocabBlockerWord = NonNullable<NonNullable<ReadingParseDifficultyProfile['vocabLoad']>['blockerWords']>[number]

type DifficultyProfileGridProps = {
  showAi: boolean
  questionId: string
  surfaceQuestionItem?: ReadingParseSurfaceQuestion | null
  difficultyProfileItem?: ReadingParseDifficultyProfile | null
  mainBlockers: string[]
  vocabBlockerWords: VocabBlockerWord[]
}

export function DifficultyProfileGrid({
  showAi,
  questionId: question_id,
  surfaceQuestionItem,
  difficultyProfileItem,
  mainBlockers,
  vocabBlockerWords,
}: DifficultyProfileGridProps) {
  // `question` is aliased so the moved JSX keeps its original `question.id` keys
  // byte-identical to the App.tsx source.
  const question = { id: question_id }
  if (!(showAi && (surfaceQuestionItem || difficultyProfileItem))) {
    return null
  }
  return (
    <div className="reading-profile-card">
      {surfaceQuestionItem && (
        <div className="reading-profile-head">
          <span>题型画像</span>
          <strong>{labelOf(surfaceQuestionTypeLabel, surfaceQuestionItem.type)}</strong>
          <em>{labelOf(answeringMoveLabel, surfaceQuestionItem.answeringMove)}</em>
          {surfaceQuestionItem.scope && <em>{labelOf(surfaceScopeLabel, surfaceQuestionItem.scope)}</em>}
        </div>
      )}
      {surfaceQuestionItem?.reason && <p>{surfaceQuestionItem.reason}</p>}
      {difficultyProfileItem && (
        <>
          <div className="difficulty-profile-grid" aria-label="六维难度画像">
            <span>
              <strong>词汇</strong>
              {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.vocabLoad?.level)}
            </span>
            <span>
              <strong>语法</strong>
              {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.syntaxLoad?.level)}
            </span>
            <span>
              <strong>跨度</strong>
              {labelOf(infoSpanLabel, difficultyProfileItem.infoSpan?.level)}
            </span>
            <span>
              <strong>抽象</strong>
              {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.reasoningAbstraction)}
            </span>
            <span>
              <strong>干扰</strong>
              {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.distractorStrength)}
            </span>
            <span>
              <strong>话题</strong>
              {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.topicAbstractness)}
            </span>
          </div>
          <div className="difficulty-profile-score">
            <strong>难度 {difficultyProfileItem.finalScore || '待判'}/10</strong>
            <span>{labelOf(difficultyProfileLevelLabel, difficultyProfileItem.finalLabel)}</span>
            {mainBlockers.map((blocker) => (
              <em key={`${question.id}-${blocker}`}>{labelOf(mainBlockerLabel, blocker)}</em>
            ))}
          </div>
          {difficultyProfileItem.reason && <p>{difficultyProfileItem.reason}</p>}
          {vocabBlockerWords.length > 0 && (
            <div className="vocab-blocker-list">
              {vocabBlockerWords.map((word, index) => (
                <span key={`${question.id}-${word.word}-${index}`}>
                  {word.word} · {labelOf(blockerRoleLabel, word.role)} ·{' '}
                  {labelOf(blockerPositionLabel, word.position)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
