import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderSourceRelationships } from './blocks.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'

export function renderContextChain(entry, optionText, group, questionNo) {
  const { paragraphId, beforeQuote, afterQuote } = entry.contextEvidence || {}
  const paragraph = array(group?.passage?.paragraphs).find(item => item.paragraphId === paragraphId)
  const sides = paragraph?.text.split(`__${questionNo}__`)
  const hasBlank = sides?.length === 2
  const before = group ? (hasBlank && beforeQuote && sides[0].includes(beforeQuote) ? beforeQuote : '')
    : nonEmptyString(beforeQuote) || '段首'
  const after = group ? (hasBlank && afterQuote && sides[1].includes(afterQuote) ? afterQuote : '')
    : nonEmptyString(afterQuote) || '段末'
  return `<div class="context-chain">
    ${before ? `<div><span>空前</span><p lang="en">${escapeHtml(before)}</p></div>` : ''}
    <div class="context-chain-answer"><span>答案</span><p lang="en">${escapeHtml(optionText)}</p></div>
    ${after ? `<div><span>空后</span><p lang="en">${escapeHtml(after)}</p></div>` : ''}
  </div>`
}

export function renderSevenChoicesGroup({ group, title, paperAsset, analysis, answers, figures, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const optionByLabel = new Map(array(group.optionBank).map((option) => [option?.label, option?.text]))
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.questions?.[questionId]
    if (!question || !answer || !entry) return ''
    const distractors = array(entry.keyDistractors).filter((item) => nonEmptyString(item?.reason))
    const optionText = nonEmptyString(optionByLabel.get(answer))
    return `<section class="question question--seven">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer),
        renderContextChain(entry, optionText, figures && group, question.questionNo))}
      ${entry.optionFit?.fitSummary ? `<p class="analysis-prose">${escapeHtml(entry.optionFit.fitSummary)}</p>` : ''}
      ${distractors.length ? `<div class="distractor"><span class="micro-heading">干扰项辨析</span>${distractors.map((item) => `<p><b>${escapeHtml(item.optionLabel)} 项</b>：${escapeHtml(item.reason)}</p>`).join('')}</div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--seven">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '七选五', answers), renderOverview(groupAnalysis.overview))}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
