import { unofficialListeningLabel } from '../../answer-renderer.mjs'
import { partitionAnalysisText } from '../../../shared/analysis/analysisTextRanges.mjs'
import { questionData } from './paper.mjs'
import { array, escapeHtml, exactTextRange, innerQuote, newQuestionMarkers, nonEmptyString } from './text.mjs'

export function renderOverview(text) {
  const overview = nonEmptyString(text)
  if (!overview) return ''
  return `<div class="overview"><span class="micro-heading">篇章大意</span><p>${escapeHtml(overview)}</p></div>`
}

export function renderHeadingLead(heading, firstBlock = '', ...rest) {
  return `<div class="heading-lead">${heading}${firstBlock}</div>${rest.join('')}`
}

export function renderFullTranslation(groupAnalysis, paperAsset) {
  const text = typeof groupAnalysis?.fullTranslationZh === 'string'
    ? groupAnalysis.fullTranslationZh
    : ''
  if (!text.trim()) return ''
  const teaching = groupAnalysis?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') {
    // Explicit legacy readback: retain historical bytes, including ordinary
    // text such as "[36]". Never guess that bracketed digits are annotations.
    return `<section class="full-translation">${renderHeadingLead('<h4>全文译文</h4>', `<p>${escapeHtml(text)}</p>`)}</section>`
  }
  const questionNo = (questionId) => questionData(paperAsset, questionId)?.questionNo
  const paragraphs = array(teaching.translation?.paragraphs).map((paragraph) => {
    const relationships = array(teaching.annotations).filter((annotation) =>
      array(annotation.translationRanges).some((range) =>
        range.textId === teaching.translation.textId
        && range.paragraphId === paragraph.paragraphId))
    const ranges = relationships.flatMap((annotation) => array(annotation.translationRanges)
      .filter((range) => range.textId === teaching.translation.textId
        && range.paragraphId === paragraph.paragraphId)
      .map((range) => ({ ...range, annotation })))
    const rangeValues = ranges.map(({ start, end, quote }) => ({ start, end, quote }))
    const parts = rangeValues.length ? partitionAnalysisText(paragraph.quote, rangeValues) : [{
      text: paragraph.quote,
      rangeIndices: [],
    }]
    let previousNumbers = []
    const html = parts.map((part) => {
      if (part.rangeIndices.length === 0) { previousNumbers = []; return escapeHtml(part.text) }
      const annotations = part.rangeIndices.map((index) => ranges[index].annotation)
      const numbers = [...new Set(annotations.flatMap(({ questionIds }) =>
        array(questionIds).map(questionNo).filter(Boolean)))].sort((a, b) => Number(a) - Number(b))
      const kinds = [...new Set(annotations.map(({ kind }) => kind))]
      const marker = newQuestionMarkers(numbers, previousNumbers)
      previousNumbers = numbers
      return `<span class="translation-annotation" data-annotation-kinds="${escapeHtml(kinds.join(' '))}" data-question-nos="${escapeHtml(numbers.join(' '))}">${marker}<span class="source-underline">${escapeHtml(part.text)}</span></span>`
    }).join('')
    return `<p data-translation-paragraph-id="${escapeHtml(paragraph.paragraphId)}">${html}</p>`
  })
  return `<section class="full-translation">${renderHeadingLead('<h4>全文译文</h4>', ...paragraphs)}</section>`
}

export function renderSourceRelationships(groupAnalysis, group, paperAsset) {
  const teaching = groupAnalysis?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') return ''
  const reading = group.groupType === 'reading'
  const sevenChoices = ['sevenChoices', 'seven_choices'].includes(group.groupType)
  const original = array(group?.passage?.paragraphs).map((paragraph) => ({
    ...paragraph, textId: teaching.sourceTextId, state: 'original',
  }))
  const completed = array(teaching.completedSourceTexts)
  const completedByParagraph = new Map(completed.map((paragraph) => [paragraph.paragraphId, paragraph]))
  const completedInOrder = sevenChoices ? original.flatMap((paragraph) => {
    const block = completedByParagraph.get(paragraph.paragraphId)
    if (block) return [{ ...paragraph, ...block }]
    return /__\d+__/u.test(paragraph.text) ? [] : [paragraph]
  }) : completed
  const texts = [...original, ...completedInOrder.map((paragraph) => ({ ...paragraph, state: 'completed' }))]
  const rendered = texts.map((source) => {
    const ranges = array(teaching.annotations).flatMap((annotation) =>
      array(annotation.sourceRanges)
        .filter((range) => range.textId === source.textId
          && range.paragraphId === source.paragraphId && exactTextRange(source.text, range))
        .map((range) => ({ ...range, annotation })))
    if (!sevenChoices && ranges.length === 0) return ''
    const parts = partitionAnalysisText(source.text, ranges.map(({ start, end, quote }) => ({
      start, end, quote,
    })))
    let previousNumbers = []
    const html = parts.map((part) => {
      if (part.rangeIndices.length === 0) { previousNumbers = []; return escapeHtml(part.text) }
      const relationships = part.rangeIndices.map((index) => ranges[index].annotation)
      const annotationIds = [...new Set(relationships.map(({ annotationId }) => annotationId))]
      const kinds = [...new Set(relationships.map(({ kind }) => kind))]
      const numbers = [...new Set(relationships.flatMap(({ questionIds }) =>
        array(questionIds).map((questionId) => questionData(paperAsset, questionId)?.questionNo).filter(Boolean)))].sort((a, b) => Number(a) - Number(b))
      const marker = newQuestionMarkers(numbers, previousNumbers)
      previousNumbers = numbers
      return `${marker}<span class="source-relationship source-underline" data-annotation-ids="${escapeHtml(annotationIds.join(' '))}" data-annotation-kinds="${escapeHtml(kinds.join(' '))}" data-question-nos="${escapeHtml(numbers.join(' '))}">${escapeHtml(part.text)}</span>`
    }).join('')
    const label = reading ? '原文' : source.state === 'original' ? '原题' : '答案补全'
    return `<p lang="en" data-source-text-state="${source.state}" data-source-paragraph-id="${escapeHtml(source.paragraphId)}"><span class="inline-label">${label}</span>${html}</p>`
  }).filter(Boolean)
  if (rendered.length === 0) return ''
  return `<section class="source-relationships">${renderHeadingLead(reading ? '<h4>原文证据段落</h4>' : '<h4>原文与补全关系</h4>', ...rendered)}</section>`
}

export function renderUnderlinedText(value, underlineTexts) {
  const text = nonEmptyString(value)
  const candidates = [...new Set(array(underlineTexts).map(nonEmptyString).filter(Boolean))]
    .map((underlineText) => ({
      start: text.indexOf(underlineText),
      end: text.indexOf(underlineText) + underlineText.length,
      text: underlineText,
    }))
    .filter(({ start, text: underlineText }) =>
      start >= 0 && start === text.lastIndexOf(underlineText))
    .sort((left, right) => left.start - right.start)
  const spans = []
  for (const candidate of candidates) {
    if (spans.length === 0 || candidate.start >= spans.at(-1).end) spans.push(candidate)
  }
  if (spans.length === 0) return escapeHtml(text)
  let cursor = 0
  let html = ''
  for (const span of spans) {
    html += escapeHtml(text.slice(cursor, span.start))
    html += `<span class="source-underline">${escapeHtml(text.slice(span.start, span.end))}</span>`
    cursor = span.end
  }
  return `${html}${escapeHtml(text.slice(cursor))}`
}

export function renderEvidenceQuote(quotes, underlineTexts = []) {
  const uniqueQuotes = [...new Set(array(quotes).map(nonEmptyString).filter(Boolean))]
  if (uniqueQuotes.length === 0) return ''
  return `<div class="evidence-quote"><span class="micro-heading">原文依据</span>${uniqueQuotes
    .map((quote) => `<p lang="en">“${renderUnderlinedText(innerQuote(quote), underlineTexts.map(innerQuote))}”</p>`)
    .join('；')}</div>`
}

export function renderSelectedLongSentences(sentences, paperAsset) {
  const selected = array(sentences).filter((sentence) =>
    nonEmptyString(sentence?.displayText)
    && nonEmptyString(sentence?.analysisZh)
    && nonEmptyString(sentence?.translationZh))
  if (selected.length === 0) return ''
  const blocks = selected.map((sentence) => {
    const related = array(sentence.relatedQuestionIds).map((questionId) => questionData(paperAsset, questionId)?.questionNo).filter(Boolean)
    return `<article class="long-sentence" data-selected-sentence-id="${escapeHtml(sentence.sentenceId)}">
    ${related.length ? `<p class="long-sentence-related">关联题目 ${related.map(escapeHtml).join('、')}</p>` : ''}
    <p class="long-sentence-source" lang="en">${sentence.underlineRanges !== undefined
      ? partitionAnalysisText(sentence.displayText, sentence.underlineRanges).map((part) => part.rangeIndices.length
        ? `<span class="source-underline" data-range-indices="${part.rangeIndices.join(' ')}">${escapeHtml(part.text)}</span>`
        : escapeHtml(part.text)).join('')
      : renderUnderlinedText(sentence.displayText, sentence.underlineTexts)}</p>
    <p><span class="inline-label">句子解析</span>${escapeHtml(sentence.analysisZh)}</p>
    <p><span class="inline-label">参考译文</span>${escapeHtml(sentence.translationZh)}</p>
  </article>`
  })
  return `<section class="long-sentences">${renderHeadingLead('<h4>长难句解析</h4>', ...blocks)}</section>`
}

export function renderQuestionHeader(questionNo, answer, answerText = '', provenanceLabel = '') {
  return `<header class="question-heading">
    <span class="question-number">${escapeHtml(questionNo)}</span>
    <span class="question-answer">${escapeHtml(answer)}</span>
    ${answerText ? `<span class="answer-text" lang="en">${escapeHtml(answerText)}</span>` : ''}
    ${provenanceLabel ? `<small>${escapeHtml(provenanceLabel)}</small>` : ''}
  </header>`
}

export function renderQuestionLead(heading, content) {
  return `<div class="question-lead">${heading}${content || ''}</div>`
}

export const overviewLabels = {
  listening: '听力',
  reading: '阅读',
  sevenChoices: '七选五',
  seven_choices: '七选五',
  cloze: '完形',
  grammarFill: '语法填空',
  grammar_cloze: '语法填空',
}

export function renderAnswerCells(answers, separated = false) {
  return answers.map(({ questionId, number, value }, index) => {
    const prefix = index && separated ? '<span class="answer-separator" aria-hidden="true">·</span> ' : ''
    return `<span class="answer-cell" data-question-id="${escapeHtml(questionId)}">${prefix}<b>${escapeHtml(number)}</b> <span>${escapeHtml(value)}</span></span>`
  }).join('')
}

export function renderAnswerOverview(parts) {
  const rows = new Map()
  for (const part of parts) {
    for (const section of part.sections) {
      for (const { group, title, answers } of section.groups) {
        if (!answers.length) continue
        const label = overviewLabels[group.groupType] || title || group.title || '其它'
        if (!rows.has(label)) rows.set(label, [])
        rows.get(label).push(...answers)
      }
    }
  }
  return Array.from(rows, ([label, answers]) => {
    const unofficial = answers.some(({ provenance }) => provenance === 'unofficial')
    const textAnswers = label === '语法填空' || answers.some(({ value }) => !/^[A-Z]$/u.test(value.trim()))
    return `<section class="answer-overview-section">
      <h3>${escapeHtml(label)}${unofficial ? `<small>${unofficialListeningLabel}</small>` : ''}</h3>
      <div class="answer-grid${textAnswers ? ' answer-grid--text' : ''}">${renderAnswerCells(answers)}</div>
    </section>`
  }).join('')
}

export function renderGroupHeading(title, answers) {
  const heading = `<h3 class="group-title">${escapeHtml(title)}</h3>`
  if (!answers.length) return heading
  const label = answers.some(({ provenance }) => provenance === 'unofficial')
    ? unofficialListeningLabel : '答案'
  return `<header class="group-heading">
    ${heading}
    <div class="group-key"><span>${label}</span><div class="group-key-answers">${renderAnswerCells(answers, true)}</div></div>
  </header>`
}
