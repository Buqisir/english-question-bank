import { unofficialListeningLabel } from '../../answer-renderer.mjs'
import { renderEvidenceQuote, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead } from './blocks.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, paragraphBlocks } from './text.mjs'

export function renderListeningGroup({ group, title, paperAsset, analysis, answers, openingHeadings, listeningSegmentOrder }) {
  const groupQuestionIds = new Set(array(group.questionIds))
  const questionNo = id => questionData(paperAsset, id)?.questionNo
  const materials = Object.values(analysis?.materials || {}).filter(Boolean).map((material) => {
    const questionIds = array(material.questionIds).filter(id => questionNo(id)).sort((a, b) => questionNo(a) - questionNo(b))
    return { material, questionIds, sourceOrder: listeningSegmentOrder?.get(material.segmentId) }
  }).sort((a, b) => (a.sourceOrder ?? Infinity) - (b.sourceOrder ?? Infinity)
    || (questionNo(a.questionIds[0]) ?? Infinity) - (questionNo(b.questionIds[0]) ?? Infinity))
    .map((entry, index) => ({ ...entry, segmentNo: entry.sourceOrder ?? index + 1 }))
    .filter(({ questionIds }) => questionIds.some(id => groupQuestionIds.has(id)))
  if (materials.length === 0) return ''
  const renderedMaterials = materials.map(({ material, questionIds, segmentNo }, index) => {
    const questions = questionIds.filter((questionId) => groupQuestionIds.has(questionId)).map((questionId) => {
      const sourceQuestion = questionData(paperAsset, questionId)
      const question = analysis?.questions?.[questionId]
      const answer = answerData(paperAsset, questionId)
      if (!sourceQuestion || !question || !answer?.answer) return ''
      const options = ['A', 'B', 'C'].map((label) =>
        `<li><b>${label}</b> ${escapeHtml(question.optionTranslationsZh?.[label])}</li>`).join('')
      const distractors = array(question.distractors)
      const heading = renderQuestionHeader(sourceQuestion.questionNo, answer.answer, '',
        answer.provenance === 'unofficial' ? unofficialListeningLabel : '')
      return `<section class="question question--listening">
        ${renderQuestionLead(heading, `<p class="question-stem">${escapeHtml(question.stemTranslationZh)}</p>
          <ul class="listening-options">${options}</ul>${renderEvidenceQuote([question.evidence?.quote])}`)}
        <p class="analysis-prose">${escapeHtml(question.reasonZh)}</p>
        ${distractors.length ? `<div class="distractor"><span class="micro-heading">干扰项辨析</span>${distractors.map((item) => `<p><b>${escapeHtml(item.label)} 项</b>：${escapeHtml(item.explanationZh)}</p>`).join('')}</div>` : ''}
      </section>`
    }).join('')
    const groupHeadings = index === 0 ? openingHeadings + renderGroupHeading(title || group.title || '听力', answers) : ''
    const numbers = questionIds.map(questionNo)
    const questionRange = numbers.length > 1 ? `${numbers[0]}–${numbers.at(-1)}` : numbers[0]
    const materialHeading = `<h4>第 ${segmentNo} 段材料${numbers.length ? `（第 ${escapeHtml(questionRange)} 题）` : ''}</h4>`
    const topic = `<p class="listening-topic">${escapeHtml(`${material.topic.theme}　${material.topic.themeGroup}　${material.topic.subtopic}`)}</p>`
    return `<article class="listening-material" data-listening-segment-id="${escapeHtml(material.segmentId)}">
      ${renderHeadingLead(groupHeadings + materialHeading, topic)}
      ${renderOverview(material.summaryZh)}
      <section class="listening-transcript">${renderHeadingLead('<h5>听力原文</h5>', ...paragraphBlocks(material.transcript, 'listening-source'))}</section>
      <section class="listening-translation">${renderHeadingLead('<h5>参考译文</h5>', ...paragraphBlocks(material.translationZh))}</section>
      ${questions}
    </article>`
  }).join('')
  return `<section class="analysis-group analysis-group--listening">
    ${renderedMaterials}
  </section>`
}
