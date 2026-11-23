import { clozeFindLabel, hasClozeTeachingLines } from '../../paper-import-ai/clozeMainLine.mjs'
import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences } from './blocks.mjs'
import { answerData, answerOptionText, questionData } from './paper.mjs'
import { passagePlace } from './reading.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'

// Bold each listed English phrase where it first appears in the line; the rest
// stays plain. Phrases that overlap a bolded one are skipped.
function boldPhrases(line, phrases) {
  const lower = line.toLowerCase()
  const spans = []
  for (const phrase of [...new Set(array(phrases).map(nonEmptyString).filter(Boolean))].sort((a, b) => b.length - a.length)) {
    const start = lower.indexOf(phrase.toLowerCase())
    if (start < 0) continue
    const end = start + phrase.length
    if (spans.some(span => start < span.end && end > span.start)) continue
    spans.push({ start, end })
  }
  spans.sort((a, b) => a.start - b.start)
  let html = ''
  let last = 0
  for (const { start, end } of spans) {
    html += `${escapeHtml(line.slice(last, start))}<b lang="en">${escapeHtml(line.slice(start, end))}</b>`
    last = end
  }
  return html + escapeHtml(line.slice(last))
}

// 题组开头：主题意义、每段一句主线、情感线（docs/product/cloze-methods.md）。
// Paragraphs with no English (the exam's own instructions) get no line.
function renderClozeMainLine(mainLine, group) {
  const theme = nonEmptyString(mainLine?.theme?.text)
  if (!theme) return ''
  const textIds = new Set(array(group?.passage?.paragraphs)
    .filter(paragraph => /[A-Za-z]{2,}/.test(nonEmptyString(paragraph?.text)))
    .map(paragraph => paragraph.paragraphId))
  const rows = [`<p><b>主题意义</b> ${boldPhrases(theme, [mainLine.theme.quote])}</p>`]
  for (const line of array(mainLine.paragraphs)) {
    const value = nonEmptyString(line?.text)
    if (!value || !textIds.has(line.paragraphId)) continue
    const place = passagePlace(group, line.paragraphId)
    rows.push(`<p>${place ? `<b>${escapeHtml(place)}</b> ` : ''}${escapeHtml(value)}</p>`)
  }
  const emotion = nonEmptyString(mainLine.emotion)
  if (emotion) rows.push(`<p><b>情感线</b> ${escapeHtml(emotion)}</p>`)
  return `<section class="cloze-main-line">${renderHeadingLead('<h4>主线</h4>', ...rows)}</section>`
}

// 脉络一行、找法一行；找法以「词性加考点名」开头，引的原文粗体。
function renderClozeTeachingLines(entry) {
  return `<p class="evidence-locate"><span class="inline-label">脉络</span>${escapeHtml(entry.context)}</p>
      <p class="evidence-locate"><span class="inline-label">找法</span><b>${escapeHtml(clozeFindLabel(entry))}</b>：${boldPhrases(entry.find.text, entry.find.quotes)}</p>`
}

// 正确项：词典义；此处指语境义。两者相同或只有一项时只印一项。
function answerGloss(fit) {
  const dict = nonEmptyString(fit?.dictMeaning)
  const meaning = nonEmptyString(fit?.meaning)
  if (dict && meaning && meaning !== dict) return `${dict}；此处指${meaning}`
  return dict || meaning
}

export function renderClozeGroup({ group, title, paperAsset, analysis, answers, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    if (!question || !answer || !entry) return ''
    const glosses = array(entry.distractorGlosses).filter((item) => item?.optionLabel && item?.meaning)
    const reason = hasClozeTeachingLines(entry)
      ? renderClozeTeachingLines(entry)
      : entry.correctFit?.reason ? `<p class="analysis-prose">${escapeHtml(entry.correctFit.reason)}</p>` : ''
    const distractors = glosses.length > 0 ? `<div class="distractor distractor--cloze"><div>${glosses.map((item) => `<p class="cloze-distractor-item"><b>${escapeHtml(item.optionLabel)} 项</b>（${escapeHtml(item.optionText)}）意为：${escapeHtml(item.meaning)}</p>`).join('')}</div></div>` : ''
    return `<section class="question question--cloze">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer, answerOptionText(question, answer), '', answerGloss(entry.correctFit)), reason || distractors)}
      ${reason ? distractors : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--cloze">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '完形填空', answers), renderOverview(groupAnalysis.overview))}
    ${renderClozeMainLine(groupAnalysis.mainLine, group)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
