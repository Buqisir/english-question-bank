import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderSourceRelationships } from './blocks.mjs'
import { answerData, answerOptionText, questionData } from './paper.mjs'
import { array, escapeHtml } from './text.mjs'

export function renderClozeGroup({ group, title, paperAsset, analysis, answers, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    if (!question || !answer || !entry) return ''
    const glosses = array(entry.distractorGlosses).filter((item) => item?.optionLabel && item?.meaning)
    const reason = entry.correctFit?.reason ? `<p class="analysis-prose">${escapeHtml(entry.correctFit.reason)}</p>` : ''
    const distractors = glosses.length > 0 ? `<div class="distractor distractor--cloze"><span class="micro-heading">干扰项辨析</span><div>${glosses.map((item) => `<p class="cloze-distractor-item"><b>${escapeHtml(item.optionLabel)} ${escapeHtml(item.optionText)}</b>：${escapeHtml(item.meaning)}</p>`).join('')}</div></div>` : ''
    return `<section class="question question--cloze">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer, answerOptionText(question, answer)), reason || distractors)}
      ${reason ? distractors : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--cloze">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '完形填空', answers), renderOverview(groupAnalysis.overview))}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
