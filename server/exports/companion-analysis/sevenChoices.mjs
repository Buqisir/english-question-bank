import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderSourceRelationships } from './blocks.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'
import { hasSevenChoicesTeachingLines, locateSevenChoicesBlank } from '../../paper-import-ai/sevenChoicesTeaching.mjs'

const SENTENCE_BREAK = /(?<=[.!?。！？]["”’)]?)\s+/
const normalize = (value) => String(value || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ')
const looseIncludes = (haystack, needle) => Boolean(needle) && normalize(haystack).includes(normalize(needle))
// A heading line: short, and either bulleted or without a full stop. Some papers bullet
// whole paragraphs (「• Before you open the book, … __37__ 2」); those are not headings.
const isHeading = (value) => value.trim().length < 80 && (/^\s*[●•]/.test(value) || !/[.!?。！？]["”’)]?\s*$/.test(value))
const tidy = (value) => String(value || '').replace(/^\s*[●•]\s*/, '').replace(/(__\d+__)\s+\d{1,2}(?=\s|$)/g, '$1')
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim()
const sentencesOf = (value) => tidy(value).split(SENTENCE_BREAK).filter(Boolean)
const onlyGap = (value) => !/[A-Za-z0-9]/.test(value.replace(/^\s*\d{1,2}(?=\s|$)/, ''))

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

// The paragraph next to the blank's own one, shown only when the analysis uses
// it: its 找法 quotes or 锁定词 come from there, or an older analysis quoted it as
// 空前 or 空后. Owner 2026-11-23: a blank at a paragraph's start shows 上段末尾,
// one at the end shows 下段开头; nothing is printed where the passage begins or ends.
function neighbourRow(paragraph, side, used) {
  if (!paragraph) return null
  const raw = String(paragraph.text || '')
  if (!used.some((quote) => looseIncludes(raw, quote))) return null
  if (isHeading(raw)) return { label: '小标题', text: tidy(raw) }
  const sentences = sentencesOf(raw)
  if (side === 'before') {
    const last = sentences.length - 1
    const at = sentences.findIndex((sentence) => used.some((quote) => looseIncludes(sentence, quote)))
    if (at === -1 || at === last) return { label: '上段末尾', text: sentences[last] }
    return { label: '上段', text: `${sentences.slice(at, at + 1).join(' ')} ……` }
  }
  const at = sentences.findIndex((sentence) => used.some((quote) => looseIncludes(sentence, quote)))
  if (at <= 0) return { label: '下段开头', text: sentences[0] }
  return { label: '下段', text: `…… ${sentences[at]}` }
}

// A quote from the blank's own paragraph; 「……」 marks words left out between it and the blank.
function ownRow(quote, side, own) {
  if (!quote) return null
  const at = normalize(own).indexOf(normalize(quote))
  if (at === -1) return null
  const gap = side === 'before' ? normalize(own).slice(at + normalize(quote).length) : normalize(own).slice(0, at)
  const text = onlyGap(gap) ? quote : side === 'before' ? `${quote} ……` : `…… ${quote}`
  return { label: side === 'before' ? '空前' : '空后', text }
}

function nearestSentence(own, side) {
  const sentences = sentencesOf(own)
  return side === 'before' ? sentences.at(-1) : sentences[0]
}

export function contextChainRows(entry, paragraphs, questionNo) {
  const evidence = entry?.contextEvidence || {}
  const beforeQuote = nonEmptyString(evidence.beforeQuote)
  const afterQuote = nonEmptyString(evidence.afterQuote)
  const located = locateSevenChoicesBlank(paragraphs, questionNo, evidence.paragraphId)
  if (!located) {
    return { before: beforeQuote ? { label: '空前', text: beforeQuote } : null, after: afterQuote ? { label: '空后', text: afterQuote } : null }
  }
  const used = [...array(entry?.find?.quotes), ...array(entry?.lock), beforeQuote, afterQuote].map((item) => nonEmptyString(item)).filter(Boolean)
  const list = array(paragraphs)
  const before = located.before
    ? ownRow(beforeQuote, 'before', located.before) || { label: '空前', text: nearestSentence(located.before, 'before') }
    : neighbourRow(list[located.index - 1], 'before', used)
  const after = located.after
    ? ownRow(afterQuote, 'after', located.after) || { label: '空后', text: nearestSentence(located.after, 'after') }
    : neighbourRow(list[located.index + 1], 'after', used)
  return { before, after }
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
function renderExtraAtBlank(label, extra, optionText) {
  const also = Number.isInteger(extra?.secondary) ? `也可能误填第 ${extra.secondary} 空。` : ''
  return `<div class="distractor extra-option"><p><span class="extra-tag">多余项</span><b>${escapeHtml(label)} 项</b>${optionText ? `（<span lang="en">${escapeHtml(optionText)}</span>）` : ''}${also}${quoteBold(nonEmptyString(extra?.text), extra?.quotes)}</p></div>`
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
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderUnaimedExtras(extraOptions, optionByLabel)}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
