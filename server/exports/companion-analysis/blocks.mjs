import { unofficialListeningLabel } from '../../answer-renderer.mjs'
import { partitionAnalysisText } from '../../../shared/analysis/analysisTextRanges.mjs'
import { questionMarkRuns, splitClueTail } from '../../../shared/analysis/questionMarks.mjs'
import { questionData } from './paper.mjs'
import { array, escapeHtml, exactTextRange, innerQuote, nonEmptyString, passageHtml } from './text.mjs'

export function renderOverview(text) {
  const overview = nonEmptyString(text)
  if (!overview) return ''
  return `<div class="overview"><span class="micro-heading">篇章大意</span><p>${escapeHtml(overview)}</p></div>`
}

export function renderHeadingLead(heading, firstBlock = '', ...rest) {
  return `<div class="heading-lead">${heading}${firstBlock}</div>${rest.join('')}`
}

// Marks on the printed passage and on its translation. Which question number
// goes where is one shared rule for every objective type, on paper and on
// screen: shared/analysis/questionMarks.mjs. Here it only becomes print markup.
function renderMarkedRun(text, ranges, questionNo, spanClass, { clues = true } = {}) {
  const html = questionMarkRuns(text, ranges, { questionNo, clues }).map((run) => {
    if (!run.answer && !run.clue) return escapeHtml(run.text)
    const underline = (run.clue ? ' source-underline' : '') + (run.answer ? ' answer-fill' : '')
    const idAttribute = run.annotationIds.length ? ` data-annotation-ids="${escapeHtml(run.annotationIds.join(' '))}"` : ''
    const open = `<span class="${spanClass}${underline}"${idAttribute} data-annotation-kinds="${escapeHtml(run.kinds.join(' '))}" data-question-nos="${escapeHtml(run.questionNos.join(' '))}">`
    const fill = run.before.length ? `<b class="blank-no">${escapeHtml(run.before.join('、'))}</b>` : ''
    if (!run.after.length) return `${fill}${open}${escapeHtml(run.text)}</span>`
    // The number sits outside the underlined run (so the rule stops at the
    // text) but in one unbreakable unit with the last character.
    const [head, last, rest] = splitClueTail(run.text)
    return `${fill}${open}${escapeHtml(head)}</span>`
      + `<span class="clue-tail"><span class="${spanClass}${underline}">${escapeHtml(last)}</span>`
      + `<sup class="clue-no">${escapeHtml(run.after.join(','))}</sup></span>${escapeHtml(rest)}`
  })
  // Paged.js drops text nodes that are only whitespace, so the space between
  // two marks ("absence of smog") would vanish from the page. Keep it inside
  // the end of the mark before it, where it is a plain break opportunity.
  for (let index = 1; index < html.length; index += 1) {
    if (/^[\t\n\r ]+$/u.test(html[index]) && html[index - 1].endsWith('</span>')) {
      html[index - 1] = `${html[index - 1].slice(0, -'</span>'.length)}${html[index]}</span>`
      html[index] = ''
    }
  }
  return html.join('')
}

// `clues: false` prints only the answers in the translation (grammar fill:
// its clues are English form, which the Chinese does not show).
export function renderFullTranslation(groupAnalysis, paperAsset, { clues = true } = {}) {
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
    const html = renderMarkedRun(paragraph.quote, ranges, questionNo, 'translation-annotation', { clues })
    return `<p data-translation-paragraph-id="${escapeHtml(paragraph.paragraphId)}">${html}</p>`
  })
  return `<section class="full-translation">${renderHeadingLead('<h4>全文译文</h4>', ...paragraphs)}</section>`
}

// A blank in the original passage, with the hint word that follows it in
// grammar fill ("__57__ (center)"); the completed text drops both.
const BLANK_WITH_HINT = /_{2,}\s*\d+\s*_{2,}(?:\s*[（(][^）)\n]{1,40}[）)])?/gu
const BLANK_ONLY = /_{2,}\s*\d+\s*_{2,}/gu

// Offset map from the original paragraph onto its completed text, or null.
// The completed text must be exactly the original with each blank replaced,
// in order, by the text of its answer-insertion range; anything else (an
// unexpected edit, a hint the completed text keeps) returns null so the caller
// prints both texts as before. Offsets are Unicode code points, as in the data.
function completedOffsetMap(original, completed, insertions) {
  const codePoints = (text) => Array.from(text).length
  // Seven-choices titles and subtitles have no blank: completed is the same text.
  if (original === completed && insertions.length === 0) return (offset) => offset
  for (const pattern of [BLANK_WITH_HINT, BLANK_ONLY]) {
    const blanks = [...original.matchAll(pattern)].map((match) => ({
      start: codePoints(original.slice(0, match.index)),
      end: codePoints(original.slice(0, match.index + match[0].length)),
    }))
    if (blanks.length === 0 || blanks.length !== insertions.length) continue
    const originalPoints = Array.from(original)
    const completedPoints = Array.from(completed)
    const segments = []
    let from = 0
    let to = 0
    let aligned = true
    for (let index = 0; index <= blanks.length; index += 1) {
      const originalEnd = index < blanks.length ? blanks[index].start : originalPoints.length
      const completedEnd = index < blanks.length ? insertions[index].start : completedPoints.length
      if (originalPoints.slice(from, originalEnd).join('') !== completedPoints.slice(to, completedEnd).join('')) {
        aligned = false
        break
      }
      segments.push({ start: from, end: originalEnd, target: to })
      if (index < blanks.length) {
        from = blanks[index].end
        to = insertions[index].end
      }
    }
    if (!aligned) continue
    return (offset) => {
      const segment = segments.find(({ start, end }) => offset >= start && offset <= end)
      return segment ? segment.target + offset - segment.start : null
    }
  }
  return null
}

function rangesOn(teaching, textId, paragraphId, text) {
  return array(teaching.annotations).flatMap((annotation) =>
    array(annotation.sourceRanges)
      .filter((range) => range.textId === textId
        && range.paragraphId === paragraphId && exactTextRange(text, range))
      .map((range) => ({ ...range, annotation })))
}

// One printed paragraph for a blank paragraph: the completed text, carrying
// both the answers (answer-insertion) and the clues and long-sentence marks
// moved over from the original. Null when any original range cannot move.
function mergedParagraph(teaching, paragraph, completed) {
  const insertions = rangesOn(teaching, completed.textId, paragraph.paragraphId, completed.text)
  const blanksFilled = insertions
    .filter(({ annotation }) => annotation.kind === 'answer-insertion')
    .sort((left, right) => left.start - right.start)
  const toCompleted = completedOffsetMap(paragraph.text, completed.text, blanksFilled)
  if (!toCompleted) return null
  const moved = []
  for (const range of rangesOn(teaching, teaching.sourceTextId, paragraph.paragraphId, paragraph.text)) {
    const start = toCompleted(range.start)
    const end = toCompleted(range.end)
    if (start === null || end === null || end <= start) return null
    moved.push({ ...range, start, end, quote: Array.from(completed.text).slice(start, end).join('') })
  }
  return { ...paragraph, text: completed.text, state: 'merged', ranges: [...moved, ...insertions] }
}

function renderRelationshipParagraph(source, label, paperAsset) {
  const questionNo = (questionId) => questionData(paperAsset, questionId)?.questionNo
  const html = renderMarkedRun(source.text, source.ranges, questionNo, 'source-relationship')
  const lead = label ? `<span class="inline-label">${label}</span>` : ''
  return `<p lang="en" data-source-text-state="${source.state}" data-source-paragraph-id="${escapeHtml(source.paragraphId)}">${lead}${html}</p>`
}

// The data anchors clues to the original passage and answers to the completed
// passage (docs/cuts/analyzed-package-intake/contract-v1-design.md), so the
// old print showed every annotated paragraph twice: 原题, then 答案补全. Print
// needs only one: each paragraph appears once, completed where it had blanks,
// with the clue underlines and the filled answers (bold) on the same line.
// A paragraph whose texts do not line up exactly keeps the old pair.
export function renderSourceRelationships(groupAnalysis, group, paperAsset) {
  const teaching = groupAnalysis?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') return ''
  const sevenChoices = ['sevenChoices', 'seven_choices'].includes(group.groupType)
  const completedByParagraph = new Map(array(teaching.completedSourceTexts)
    .map((paragraph) => [paragraph.paragraphId, paragraph]))
  // Long-sentence marks are not printed in the passage, so they alone do not
  // make a paragraph worth printing.
  const printable = (ranges) => sevenChoices
    || ranges.some(({ annotation }) => annotation.kind !== 'sentence-structure')
  const rendered = array(group?.passage?.paragraphs).flatMap((paragraph) => {
    const original = {
      ...paragraph,
      state: 'original',
      ranges: rangesOn(teaching, teaching.sourceTextId, paragraph.paragraphId, paragraph.text),
    }
    const block = completedByParagraph.get(paragraph.paragraphId)
    if (!block) {
      if (!printable(original.ranges)) return []
      return [renderRelationshipParagraph(original, '', paperAsset)]
    }
    const completed = { ...block, state: 'completed' }
    const merged = mergedParagraph(teaching, paragraph, completed)
    if (merged) {
      if (!printable(merged.ranges)) return []
      return [renderRelationshipParagraph(merged, '', paperAsset)]
    }
    completed.ranges = rangesOn(teaching, block.textId, paragraph.paragraphId, block.text)
    return [original, completed]
      .filter((source) => printable(source.ranges))
      .map((source) => renderRelationshipParagraph(source, source.state === 'original' ? '原题' : '答案补全', paperAsset))
  })
  if (rendered.length === 0) return ''
  return `<section class="source-relationships">${renderHeadingLead('<h4>原文</h4>', ...rendered)}</section>`
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
  if (spans.length === 0) return passageHtml(text)
  let cursor = 0
  let html = ''
  for (const span of spans) {
    html += passageHtml(text.slice(cursor, span.start))
    html += `<span class="source-underline">${passageHtml(text.slice(span.start, span.end))}</span>`
    cursor = span.end
  }
  return `${html}${passageHtml(text.slice(cursor))}`
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

// Answers are separated by column alignment, never by a dot between them.
export function renderAnswerCells(answers) {
  return answers.map(({ questionId, number, value }) =>
    `<span class="answer-cell" data-question-id="${escapeHtml(questionId)}"><b>${escapeHtml(number)}</b> <span>${escapeHtml(value)}</span></span>`).join('')
}

// The answer table reads like the answer sheet a class fills in: five
// questions to a block, the numbers on a pale band, the answers under them.
export function renderAnswerRuns(answers) {
  const runs = []
  for (let index = 0; index < answers.length; index += 5) runs.push(answers.slice(index, index + 5))
  return runs.map(run => `<div class="answer-run">${renderAnswerCells(run)}</div>`).join('')
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
      <div class="answer-grid${textAnswers ? ' answer-grid--text' : ''}">${renderAnswerRuns(answers)}</div>
    </section>`
  }).join('')
}

// The running head names the group and its question range, set from the
// group's own heading so a teacher flipping pages can find "question 26".
export function runningGroupLabel(title, answers = []) {
  const numbers = answers.map(({ number }) => number)
  const range = numbers.length > 1 ? `${numbers[0]}–${numbers.at(-1)}` : numbers[0]
  return range === undefined ? title : `${title}　${range}`
}

export function renderGroupHeading(title, answers) {
  const heading = `<h3 class="group-title" data-running="${escapeHtml(runningGroupLabel(title, answers))}">${escapeHtml(title)}</h3>`
  if (!answers.length) return heading
  const label = answers.some(({ provenance }) => provenance === 'unofficial')
    ? unofficialListeningLabel : '答案'
  return `<header class="group-heading">
    ${heading}
    <div class="group-key"><span>${label}</span><div class="group-key-answers${answers.every(({ value }) => Array.from(String(value ?? '')).length <= 1) ? ' group-key-answers--letters' : ''}">${renderAnswerCells(answers)}</div></div>
  </header>`
}
