import { resolveFigureTextRegion } from '../../../shared/paper-canonical/richContent.mjs'
import { renderEvidenceQuote, renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderSourceRelationships } from './blocks.mjs'
import { answerData, passageQuote, questionData } from './paper.mjs'
import { array, escapeHtml, exactTextRange, nonEmptyString, withoutClosingPunctuation } from './text.mjs'

export function readingDistractors(entry) {
  return array(entry?.optionAnalysis).filter((option) =>
    option?.status === 'wrong'
    && option?.trap?.suspension?.level !== 'row'
    && (nonEmptyString(option?.trap?.explanation) || nonEmptyString(option?.trap?.relationNote)))
}

export function renderReadingDiscourse(discourse, group, overview) {
  let summary = nonEmptyString(discourse?.summary)
  const firstSentence = summary.match(/^.+?(?:[。！？!?]|\.(?=\s))/u)?.[0]
  const overviewText = withoutClosingPunctuation(overview)
  if (withoutClosingPunctuation(summary) === overviewText) summary = ''
  else if (firstSentence && withoutClosingPunctuation(firstSentence) === overviewText) {
    summary = summary.slice(firstSentence.length).trimStart()
  }
  const paragraphs = array(discourse?.paragraphs).filter((item) =>
    nonEmptyString(item?.summary) || nonEmptyString(item?.function))
  if (!summary && paragraphs.length === 0) return ''
  const rows = paragraphs.map((item) => {
    const index = array(group.passage?.paragraphs).findIndex(({ paragraphId }) => paragraphId === item.paragraphId)
    return `<p>${index >= 0 ? `<b>第 ${index + 1} 段</b> ` : ''}${escapeHtml(item.function ? withoutClosingPunctuation(item.summary) : item.summary)}${item.function ? `${item.summary ? '；' : ''}作用：${escapeHtml(item.function)}` : ''}</p>`
  })
  if (summary) rows.unshift(`<p>${escapeHtml(summary)}</p>`)
  return `<section class="reading-discourse">${renderHeadingLead('<h4>篇章结构</h4>', ...rows)}</section>`
}

export function readingAnnexQuotes(groupAnalysis, questionId, group, figures) {
  const teaching = groupAnalysis.teachingContent
  return array(teaching?.annotations).filter(annotation => annotation.kind === 'answer-evidence'
    && annotation.questionIds.includes(questionId)).flatMap(annotation => annotation.sourceRanges.map(range => {
    if (range.regionId) {
      try {
        const region = resolveFigureTextRegion(range, figures)
        return range.quote ?? region.text
      } catch {
        return ''
      }
    }
    const paragraph = array(group.passage?.paragraphs).find(item => item.paragraphId === range.paragraphId)
    return range.textId === teaching.sourceTextId && exactTextRange(paragraph?.text, range) ? range.quote : ''
  }))
}

export function renderReadingGroup({ group, title, paperAsset, analysis, answers, figures, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const letter = nonEmptyString(title || group.title).match(/([A-D])\s*$/u)?.[1]
  const displayTitle = letter ? `阅读理解 ${letter} 篇` : (title || group.title || '阅读理解')
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.questions?.[questionId]
    if (!question || !answer || !entry) return ''
    const correct = array(entry.optionAnalysis).find((option) => option?.label === answer)
    const quotes = array(correct?.evidence).map(item => figures
      ? passageQuote(group, item.paragraphId, item.quote)
      : item.quote)
    if (figures) quotes.push(...readingAnnexQuotes(groupAnalysis, questionId, group, figures))
    const underlineTexts = array(entry.locationParaphrases)
      .map((relation) => relation?.targetText)
    const reasoning = [...new Set(array(entry.locationParaphrases)
      .map((relation) => nonEmptyString(relation?.note)).filter(Boolean))]
    if (reasoning.length === 0 && nonEmptyString(entry.questionFocus)) reasoning.push(entry.questionFocus)
    const distractors = readingDistractors(entry).map(option => ({
      ...option, optionTranslationZh: withoutClosingPunctuation(option.optionTranslationZh),
    }))
    const [first, ...details] = [
      entry.stemTranslationZh ? `<p class="question-stem">${escapeHtml(entry.stemTranslationZh)}</p>` : '',
      ...reasoning.map((item) => `<p class="analysis-prose">${escapeHtml(item)}</p>`),
      renderEvidenceQuote(quotes, underlineTexts),
      distractors.length > 0 ? `<div class="distractor distractor--reading"><span class="micro-heading">干扰项辨析</span><div>${distractors.map((distractor) => `<p class="reading-distractor-item"><b>${escapeHtml(distractor.label)} 项</b>${distractor.optionTranslationZh ? `（${escapeHtml(distractor.optionTranslationZh)}）` : ''}：${escapeHtml(nonEmptyString(distractor.trap.explanation) || distractor.trap.relationNote)}</p>`).join('')}</div></div>` : '',
    ].filter(Boolean)
    return `<section class="question question--reading">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer), first)}
      ${details.join('')}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--reading">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(displayTitle, answers), renderOverview(groupAnalysis.overview))}
    ${renderReadingDiscourse(groupAnalysis.discourseStructure, group, groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
