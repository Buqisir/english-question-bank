import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences } from './blocks.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'
import { contextChainRows, hasSevenChoicesTeachingLines } from '../../paper-import-ai/sevenChoicesTeaching.mjs'

export { contextChainRows }

// The words in bold: the analysis's 锁定词, wherever they appear in a row.
function boldLocks(value, locks) {
  const marks = []
  for (const word of [...new Set(array(locks).map((item) => nonEmptyString(item)).filter(Boolean))].sort((a, b) => b.length - a.length)) {
    let from = 0
    let at
    while ((at = value.indexOf(word, from)) !== -1) {
      if (!marks.some(([s, e]) => at < e && at + word.length > s)) { marks.push([at, at + word.length]); break }
      from = at + 1
    }
  }
  marks.sort((a, b) => a[0] - b[0])
  let html = ''
  let last = 0
  for (const [s, e] of marks) {
    html += `${escapeHtml(value.slice(last, s))}<b>${escapeHtml(value.slice(s, e))}</b>`
    last = e
  }
  return html + escapeHtml(value.slice(last))
}

export function renderContextChain(entry, optionText, group, questionNo) {
  const { before, after } = contextChainRows(entry, group?.passage?.paragraphs, questionNo)
  const row = (item, cls = '') => item ? `<div${cls}><span>${escapeHtml(item.label)}</span><p lang="en">${boldLocks(item.text, entry?.lock)}</p></div>` : ''
  return `<div class="context-chain">
    ${row(before)}
    ${row({ label: '答案', text: optionText }, ' class="context-chain-answer"')}
    ${row(after)}
  </div>`
}

// 七选五讲法 v1 (docs/product/seven-choices-methods.md): 找法, 讲解, then at most
// one 错项, which is another blank's answer.
function quoteBold(value, quotes) {
  const marks = []
  for (const quote of [...new Set(array(quotes).map((item) => nonEmptyString(item)).filter(Boolean))].sort((a, b) => b.length - a.length)) {
    const at = value.indexOf(quote)
    if (at !== -1 && !marks.some(([s, e]) => at < e && at + quote.length > s)) marks.push([at, at + quote.length])
  }
  marks.sort((a, b) => a[0] - b[0])
  let html = ''
  let last = 0
  for (const [s, e] of marks) {
    html += `${escapeHtml(value.slice(last, s))}<b lang="en">${escapeHtml(value.slice(s, e))}</b>`
    last = e
  }
  return html + escapeHtml(value.slice(last))
}

function renderTeachingLines(entry) {
  const distractors = array(entry.distractors).filter((item) => nonEmptyString(item?.text))
  return `<p class="evidence-locate"><span class="inline-label">找法</span>${quoteBold(nonEmptyString(entry.find.text), entry.find.quotes)}</p>
      <p class="analysis-prose">${escapeHtml(nonEmptyString(entry.explain))}</p>
      ${distractors.length ? `<div class="distractor">${distractors.map((item) => `<p><b>${escapeHtml(item.label)} 项</b>错在：${quoteBold(nonEmptyString(item.text), item.quotes)}</p>`).join('')}</div>` : ''}`
}

// A spare option goes under the blank it is most likely to be put in (Owner
// 2026-11-23, 放法 B), set apart from the 错项 by its tag.
// The secondary blank closes the item: the text speaks of "这一空" (the target),
// so naming another blank before it would make "这一空" read as that one.
function renderExtraAtBlank(label, extra, optionText) {
  const also = Number.isInteger(extra?.secondary) ? `也可能误填第 ${extra.secondary} 空。` : ''
  return `<div class="distractor extra-option"><p><span class="extra-tag">多余项</span><b>${escapeHtml(label)} 项</b>${optionText ? `（<span lang="en">${escapeHtml(optionText)}</span>）` : ''}${quoteBold(nonEmptyString(extra?.text), extra?.quotes)}${also}</p></div>`
}

// A spare option that fits no blank (话题项) has no blank to sit under: it closes the group.
function renderUnaimedExtras(extraOptions, optionByLabel) {
  const items = Object.entries(extraOptions).filter(([, extra]) => extra && extra.target === null && nonEmptyString(extra.text))
  if (!items.length) return ''
  return `<section class="extra-options"><p><span class="inline-label">多余选项</span></p>${items.map(([label, extra]) => {
    const optionText = optionByLabel.get(label)
    return `<p><b>${escapeHtml(label)} 项</b>${optionText ? `（<span lang="en">${escapeHtml(optionText)}</span>）` : ''}哪一空都接不实。${quoteBold(nonEmptyString(extra.text), extra.quotes)}</p>`
  }).join('')}</section>`
}

export function renderSevenChoicesGroup({ group, title, paperAsset, analysis, answers, figures, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const optionByLabel = new Map(array(group.optionBank).map((option) => [option?.label, option?.text]))
  const extraOptions = groupAnalysis.extraOptions && typeof groupAnalysis.extraOptions === 'object' ? groupAnalysis.extraOptions : {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.questions?.[questionId]
    if (!question || !answer || !entry) return ''
    const optionText = nonEmptyString(optionByLabel.get(answer))
    const chain = renderContextChain(entry, optionText, group, question.questionNo)
    const lead = renderQuestionLead(renderQuestionHeader(question.questionNo, answer), chain)
    if (hasSevenChoicesTeachingLines(entry)) {
      const extras = Object.entries(extraOptions).filter(([, extra]) => extra?.target === Number(question.questionNo))
      return `<section class="question question--seven">
      ${lead}
      ${renderTeachingLines(entry)}
      ${extras.map(([label, extra]) => renderExtraAtBlank(label, extra, optionByLabel.get(label))).join('')}
    </section>`
    }
    const distractors = array(entry.keyDistractors).filter((item) => nonEmptyString(item?.reason))
    return `<section class="question question--seven">
      ${lead}
      ${entry.optionFit?.fitSummary ? `<p class="analysis-prose">${escapeHtml(entry.optionFit.fitSummary)}</p>` : ''}
      ${distractors.length ? `<div class="distractor">${distractors.map((item) => `<p><b>${escapeHtml(item.optionLabel)} 项</b>错在：${escapeHtml(item.reason)}</p>`).join('')}</div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--seven">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '七选五', answers), renderOverview(groupAnalysis.overview))}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${questions}
    ${renderUnaimedExtras(extraOptions, optionByLabel)}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
