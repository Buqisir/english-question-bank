import type { ListeningAnalysisV1 } from '../../domain/listeningAnalysis.ts'

type Props = {
  analysis: ListeningAnalysisV1
  groupQuestionIds: string[]
  activeQuestionId: string | null
}

export function ListeningAnalysisPanel({ analysis, groupQuestionIds, activeQuestionId }: Props) {
  const allowed = new Set(groupQuestionIds)
  const materials = Object.values(analysis.materials).filter((material) =>
    material.questionIds.some((questionId) => allowed.has(questionId))
    && (!activeQuestionId || material.questionIds.includes(activeQuestionId)))

  if (materials.length === 0) return <p className="paper-browse-lecture-empty">解析未发布</p>

  return (
    <div className="listening-analysis-panel">
      {materials.map((material) => {
        const questions = material.questionIds
          .filter((questionId) => allowed.has(questionId) && (!activeQuestionId || questionId === activeQuestionId))
          .map((questionId) => analysis.questions[questionId])
          .filter(Boolean)
        return (
          <section key={material.segmentId} className="listening-analysis-material">
            <h5>听力材料 {material.questionIds.map((questionId) => questionId.split(':').at(-1)).join('、')}</h5>
            <p className="listening-analysis-topic">
              {material.topic.theme} · {material.topic.themeGroup} · {material.topic.subtopic}
            </p>
            <p className="listening-analysis-summary">{material.summaryZh}</p>
            <div className="listening-analysis-text">
              <h6>听力原文</h6>
              <p lang="en">{material.transcript}</p>
              <h6>参考译文</h6>
              <p>{material.translationZh}</p>
            </div>
            {questions.map((question) => (
              <article key={question.questionId} className="listening-analysis-question">
                <header><b>{question.questionId.split(':').at(-1)}</b><span>答案 {question.officialAnswer}</span></header>
                <p>{question.stemTranslationZh}</p>
                <ol>
                  {(['A', 'B', 'C'] as const).map((label) => (
                    <li key={label}><b>{label}</b> {question.optionTranslationsZh[label]}</li>
                  ))}
                </ol>
                <blockquote lang="en">“{question.evidence.quote}”</blockquote>
                <p>{question.reasonZh}</p>
                {question.distractors?.length ? (
                  <div className="listening-analysis-distractors">
                    <b>干扰项辨析</b>
                    {question.distractors.map((item) => (
                      <p key={item.label}><b>{item.label} 项</b>：{item.explanationZh}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}
