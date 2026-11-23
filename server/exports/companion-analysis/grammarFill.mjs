import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderSourceRelationships } from './blocks.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'

export function renderGrammarFillGroup({ group, title, paperAsset, analysis, answers, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const authoritativeAnswer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    const answer = nonEmptyString(authoritativeAnswer)
    if (!question || !answer || !entry) return ''
    const hint = nonEmptyString(entry.hint)
    return `<section class="question question--grammar">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer, hint ? `提示词 ${hint}` : ''),
        entry.reason ? `<p class="analysis-prose">${escapeHtml(entry.reason)}</p>` : '')}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--grammar">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '语法填空', answers), renderOverview(groupAnalysis.overview))}
    ${renderFullTranslation(groupAnalysis, paperAsset, { clues: false })}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
