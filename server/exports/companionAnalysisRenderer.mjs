import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'
import { projectApplicationReviewCardDisplay } from '../../shared/writing/applicationReviewCard.mjs'
import { projectContinuationAnalysisDisplay } from '../../shared/writing/continuationAnalysis.mjs'
import { partitionAnalysisText } from '../../shared/analysis/analysisTextRanges.mjs'

const ANALYSIS_FILES = Object.freeze({
  reading: 'reading-choice-analysis-v1.json',
  sevenChoices: 'seven-choices-analysis-v1.json',
  cloze: 'cloze-analysis-v1.json',
  grammarFill: 'grammar-fill-analysis-v1.json',
  writing: 'writing-analysis-v1.json',
  listening: 'listening-analysis-v1.json',
})

const HOUSE_MARK = 'EQBANK 教师解析'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/(?<=[a-zA-Z])[‘’](?=[a-zA-Z])/gu, "'")
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function assertSafePaperId(paperId) {
  const normalized = nonEmptyString(paperId)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(normalized) || normalized.includes('..')) {
    throw new Error('paperId is invalid')
  }
  return normalized
}

function cleanPaperTitle(title) {
  return nonEmptyString(title).replace(/[-—－]\s*答案版\s*$/u, '') || '英语试题'
}

function safeFileTitle(title) {
  return cleanPaperTitle(title).replace(/[\\/:*?"<>|]/gu, '-')
}

function renderParagraphs(value, className = '') {
  const paragraphs = nonEmptyString(value)
    .split(/\n\s*\n|\n/u)
    .map((part) => part.trim())
    .filter(Boolean)
  return paragraphs
    .map((paragraph) => `<p${className ? ` class="${className}"` : ''}>${escapeHtml(paragraph)}</p>`)
    .join('')
}

function renderOverview(text) {
  const overview = nonEmptyString(text)
  if (!overview) return ''
  return `<div class="overview"><span class="micro-heading">篇章大意</span><p>${escapeHtml(overview)}</p></div>`
}

function renderFullTranslation(groupAnalysis, paperAsset) {
  const text = typeof groupAnalysis?.fullTranslationZh === 'string'
    ? groupAnalysis.fullTranslationZh
    : ''
  if (!text.trim()) return ''
  const teaching = groupAnalysis?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') {
    // Explicit legacy readback: retain historical bytes, including ordinary
    // text such as "[36]". Never guess that bracketed digits are annotations.
    return `<section class="full-translation"><h4>全文译文</h4><p>${escapeHtml(text)}</p></section>`
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
    let previousNumbers = ''
    const html = parts.map((part) => {
      if (part.rangeIndices.length === 0) { previousNumbers = ''; return escapeHtml(part.text) }
      const annotations = part.rangeIndices.map((index) => ranges[index].annotation)
      const numbers = [...new Set(annotations.flatMap(({ questionIds }) =>
        array(questionIds).map(questionNo).filter(Boolean)))].sort((a, b) => Number(a) - Number(b))
      const kinds = [...new Set(annotations.map(({ kind }) => kind))]
      const showMarker = numbers.length && numbers.join(' ') !== previousNumbers
      previousNumbers = numbers.join(' ')
      return `<span class="translation-annotation" data-annotation-kinds="${escapeHtml(kinds.join(' '))}" data-question-nos="${escapeHtml(numbers.join(' '))}">${showMarker ? `<b class="translation-marker">[${numbers.map(escapeHtml).join('、')}]</b>` : ''}<span class="source-underline">${escapeHtml(part.text)}</span></span>`
    }).join('')
    return `<p data-translation-paragraph-id="${escapeHtml(paragraph.paragraphId)}">${html}</p>`
  })
  return `<section class="full-translation"><h4>全文译文</h4>${paragraphs.join('')}</section>`
}

function renderSourceRelationships(groupAnalysis, group, paperAsset) {
  const teaching = groupAnalysis?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') return ''
  const texts = [
    ...array(group?.passage?.paragraphs).map((paragraph) => ({
      textId: teaching.sourceTextId,
      paragraphId: paragraph.paragraphId,
      text: paragraph.text,
      state: 'original',
    })),
    ...array(teaching.completedSourceTexts).map((paragraph) => ({
      ...paragraph,
      state: 'completed',
    })),
  ]
  const rendered = texts.map((source) => {
    const ranges = array(teaching.annotations).flatMap((annotation) =>
      array(annotation.sourceRanges)
        .filter((range) => range.textId === source.textId
          && range.paragraphId === source.paragraphId)
        .map((range) => ({ ...range, annotation })))
    if (ranges.length === 0) return ''
    const parts = partitionAnalysisText(source.text, ranges.map(({ start, end, quote }) => ({
      start, end, quote,
    })))
    let previousNumbers = ''
    const html = parts.map((part) => {
      if (part.rangeIndices.length === 0) { previousNumbers = ''; return escapeHtml(part.text) }
      const relationships = part.rangeIndices.map((index) => ranges[index].annotation)
      const annotationIds = [...new Set(relationships.map(({ annotationId }) => annotationId))]
      const kinds = [...new Set(relationships.map(({ kind }) => kind))]
      const numbers = [...new Set(relationships.flatMap(({ questionIds }) =>
        array(questionIds).map((questionId) => questionData(paperAsset, questionId)?.questionNo).filter(Boolean)))].sort((a, b) => Number(a) - Number(b))
      const showMarker = numbers.length && numbers.join(' ') !== previousNumbers
      previousNumbers = numbers.join(' ')
      return `<span class="source-relationship source-underline" data-annotation-ids="${escapeHtml(annotationIds.join(' '))}" data-annotation-kinds="${escapeHtml(kinds.join(' '))}" data-question-nos="${escapeHtml(numbers.join(' '))}">${showMarker ? `<b class="translation-marker">[${numbers.map(escapeHtml).join('、')}]</b>` : ''}${escapeHtml(part.text)}</span>`
    }).join('')
    return `<p lang="en" data-source-text-state="${source.state}" data-source-paragraph-id="${escapeHtml(source.paragraphId)}"><span class="inline-label">${source.state === 'original' ? '原题' : '答案补全'}</span>${html}</p>`
  }).filter(Boolean)
  if (rendered.length === 0) return ''
  return `<section class="source-relationships"><h4>原文与补全关系</h4>${rendered.join('')}</section>`
}

function renderUnderlinedText(value, underlineTexts) {
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

function renderEvidenceQuote(quotes, underlineTexts = []) {
  const uniqueQuotes = [...new Set(array(quotes).map(nonEmptyString).filter(Boolean))]
  if (uniqueQuotes.length === 0) return ''
  return `<div class="evidence-quote"><span class="micro-heading">原文依据</span>${uniqueQuotes
    .map((quote) => `<p lang="en">“${renderUnderlinedText(quote, underlineTexts)}”</p>`)
    .join('')}</div>`
}

function renderSelectedLongSentences(sentences, paperAsset) {
  const selected = array(sentences).filter((sentence) =>
    nonEmptyString(sentence?.displayText)
    && nonEmptyString(sentence?.analysisZh)
    && nonEmptyString(sentence?.translationZh))
  if (selected.length === 0) return ''
  return `<section class="long-sentences"><h4>长难句解析</h4>${selected.map((sentence) => `<article class="long-sentence" data-selected-sentence-id="${escapeHtml(sentence.sentenceId)}">
    <p class="long-sentence-related">关联题目 ${array(sentence.relatedQuestionIds).map((questionId) => questionData(paperAsset, questionId)?.questionNo).filter(Boolean).map(escapeHtml).join('、')}</p>
    <p class="long-sentence-source" lang="en">${sentence.underlineRanges !== undefined
      ? partitionAnalysisText(sentence.displayText, sentence.underlineRanges).map((part) => part.rangeIndices.length
        ? `<span class="source-underline" data-range-indices="${part.rangeIndices.join(' ')}">${escapeHtml(part.text)}</span>`
        : escapeHtml(part.text)).join('')
      : renderUnderlinedText(sentence.displayText, sentence.underlineTexts)}</p>
    <p><span class="inline-label">句子解析</span>${escapeHtml(sentence.analysisZh)}</p>
    <p><span class="inline-label">参考译文</span>${escapeHtml(sentence.translationZh)}</p>
  </article>`).join('')}</section>`
}

function renderQuestionHeader(questionNo, answer, answerText = '') {
  return `<header class="question-heading">
    <span class="question-number">${escapeHtml(questionNo)}</span>
    <span class="question-answer">${escapeHtml(answer)}</span>
    ${answerText ? `<span class="answer-text" lang="en">${escapeHtml(answerText)}</span>` : ''}
  </header>`
}

function renderListeningGroup({ group, title, paperAsset, analysis }) {
  const groupQuestionIds = new Set(array(group.questionIds))
  const materials = Object.values(analysis?.materials || {}).filter((material) =>
    array(material?.questionIds).some((questionId) => groupQuestionIds.has(questionId)))
  if (materials.length === 0) return ''
  const renderedMaterials = materials.map((material) => {
    const questions = array(material.questionIds).filter((questionId) => groupQuestionIds.has(questionId)).map((questionId) => {
      const sourceQuestion = questionData(paperAsset, questionId)
      const question = analysis?.questions?.[questionId]
      if (!sourceQuestion || !question) return ''
      const options = ['A', 'B', 'C'].map((label) =>
        `<li><b>${label}</b> ${escapeHtml(question.optionTranslationsZh?.[label])}</li>`).join('')
      const distractors = array(question.distractors)
      return `<section class="question question--listening">
        ${renderQuestionHeader(sourceQuestion.questionNo, question.officialAnswer)}
        <p class="question-stem">${escapeHtml(question.stemTranslationZh)}</p>
        <ol class="listening-options">${options}</ol>
        ${renderEvidenceQuote([question.evidence?.quote])}
        <p class="analysis-prose">${escapeHtml(question.reasonZh)}</p>
        ${distractors.length ? `<div class="distractor"><span class="micro-heading">干扰项辨析</span>${distractors.map((item) => `<p><b>${escapeHtml(item.label)} 项</b>：${escapeHtml(item.explanationZh)}</p>`).join('')}</div>` : ''}
      </section>`
    }).join('')
    return `<article class="listening-material" data-listening-segment-id="${escapeHtml(material.segmentId)}">
      <h4>听力材料 ${escapeHtml(array(material.questionIds).map((questionId) => questionData(paperAsset, questionId)?.questionNo).filter(Boolean).join('、'))}</h4>
      <p class="listening-topic">${escapeHtml(`${material.topic.theme} · ${material.topic.themeGroup} · ${material.topic.subtopic}`)}</p>
      ${renderOverview(material.summaryZh)}
      <section class="listening-transcript"><h5>听力原文</h5>${renderParagraphs(material.transcript, 'listening-source')}</section>
      <section class="listening-translation"><h5>参考译文</h5>${renderParagraphs(material.translationZh)}</section>
      ${questions}
    </article>`
  }).join('')
  return `<section class="analysis-group analysis-group--listening">
    <h3 class="group-title">${escapeHtml(title || group.title || '听力')}</h3>${renderedMaterials}
  </section>`
}

function orderedGroups(paperAsset) {
  const groups = paperAsset?.content?.groups || {}
  const parts = array(paperAsset?.layoutTree?.parts)
  if (parts.length === 0) {
    return [{
      title: '答案与解析',
      sections: [{
        title: '全部题目',
        groups: Object.values(groups).map((group) => ({ group, title: group?.title || '' })),
      }],
    }]
  }
  return parts.map((part) => ({
    title: nonEmptyString(part?.title),
    sections: array(part?.sections).map((section) => ({
      title: nonEmptyString(section?.title),
      groups: array(section?.groups).map((entry) => ({
        group: groups[entry?.groupId] || null,
        title: nonEmptyString(entry?.title),
      })).filter(({ group }) => group),
    })),
  }))
}

function questionData(paperAsset, questionId) {
  return paperAsset?.content?.questions?.[questionId] || null
}

function answerData(paperAsset, questionId) {
  return paperAsset?.answerKey?.answers?.[questionId] || null
}

function answerOptionText(question, answer) {
  return nonEmptyString(array(question?.options).find((option) => option?.label === answer)?.text)
}

function renderAnswerOverview(paperAsset) {
  const sections = []
  for (const part of orderedGroups(paperAsset)) {
    for (const section of part.sections) {
      const answers = section.groups.flatMap(({ group }) => array(group?.questionIds).map((questionId) => {
        const question = questionData(paperAsset, questionId)
        const answer = answerData(paperAsset, questionId)
        if (!question || !nonEmptyString(answer?.answer)) return ''
        return `<span class="answer-cell"><b>${escapeHtml(question.questionNo)}</b><span>${escapeHtml(answer.answer)}</span></span>`
      }).filter(Boolean))
      if (answers.length === 0) continue
      sections.push(`<section class="answer-overview-section">
        <h3>${escapeHtml(section.title)}</h3>
        <div class="answer-grid">${answers.join('')}</div>
      </section>`)
    }
  }
  return sections.join('')
}

function readingDistractors(entry) {
  return array(entry?.optionAnalysis).filter((option) =>
    option?.status === 'wrong'
    && option?.trap?.suspension?.level !== 'row'
    && (nonEmptyString(option?.trap?.explanation) || nonEmptyString(option?.trap?.relationNote)))
}

function renderReadingDiscourse(discourse) {
  const paragraphs = array(discourse?.paragraphs).filter((item) =>
    nonEmptyString(item?.summary) || nonEmptyString(item?.function))
  if (!nonEmptyString(discourse?.summary) && paragraphs.length === 0) return ''
  return `<section class="reading-discourse"><h4>篇章结构</h4>${discourse?.summary ? `<p>${escapeHtml(discourse.summary)}</p>` : ''}${paragraphs.map((item) => `<p><b>${escapeHtml(item.paragraphId)}</b> ${escapeHtml(item.summary)}${item.function ? `；作用：${escapeHtml(item.function)}` : ''}</p>`).join('')}</section>`
}

function renderReadingGroup({ group, title, paperAsset, analysis }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const letter = nonEmptyString(title || group.title).match(/([A-D])\s*$/u)?.[1]
  const displayTitle = letter ? `阅读理解 ${letter} 篇` : (title || group.title || '阅读理解')
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.questions?.[questionId]
    if (!question || !answer || !entry) return ''
    const correct = array(entry.optionAnalysis).find((option) => option?.label === answer)
    const quotes = array(correct?.evidence).map((item) => item?.quote)
    const underlineTexts = array(entry.locationParaphrases)
      .map((relation) => relation?.targetText)
    const reasoning = [...new Set(array(entry.locationParaphrases)
      .map((relation) => nonEmptyString(relation?.note)).filter(Boolean))]
    if (reasoning.length === 0 && nonEmptyString(entry.questionFocus)) reasoning.push(entry.questionFocus)
    const distractors = readingDistractors(entry)
    return `<section class="question question--reading">
      ${renderQuestionHeader(question.questionNo, answer)}
      ${entry.stemTranslationZh ? `<p class="question-stem">${escapeHtml(entry.stemTranslationZh)}</p>` : ''}
      ${reasoning.map((item) => `<p class="analysis-prose">${escapeHtml(item)}</p>`).join('')}
      ${renderEvidenceQuote(quotes, underlineTexts)}
      ${distractors.length > 0 ? `<div class="distractor distractor--reading"><span class="micro-heading">干扰项辨析</span><div>${distractors.map((distractor) => `<p class="reading-distractor-item"><b>${escapeHtml(distractor.label)} 项</b>${distractor.optionTranslationZh ? `（${escapeHtml(distractor.optionTranslationZh)}）` : ''}：${escapeHtml(nonEmptyString(distractor.trap.explanation) || distractor.trap.relationNote)}</p>`).join('')}</div></div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--reading">
    <h3 class="group-title">${escapeHtml(displayTitle)}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderReadingDiscourse(groupAnalysis.discourseStructure)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}

function renderContextChain(entry, optionText) {
  const before = nonEmptyString(entry?.contextEvidence?.beforeQuote)
  const after = nonEmptyString(entry?.contextEvidence?.afterQuote)
  return `<div class="context-chain">
    <div><span>空前</span><p lang="en">${escapeHtml(before || '段首')}</p></div>
    <div class="context-chain-answer"><span>答案</span><p lang="en">${escapeHtml(optionText)}</p></div>
    <div><span>空后</span><p lang="en">${escapeHtml(after || '段末')}</p></div>
  </div>`
}

function renderSevenChoicesGroup({ group, title, paperAsset, analysis }) {
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
      ${renderQuestionHeader(question.questionNo, answer)}
      ${renderContextChain(entry, optionText)}
      ${entry.optionFit?.fitSummary ? `<p class="analysis-prose">${escapeHtml(entry.optionFit.fitSummary)}</p>` : ''}
      ${distractors.length ? `<div class="distractor"><span class="micro-heading">干扰项辨析</span>${distractors.map((item) => `<p><b>${escapeHtml(item.optionLabel)} 项</b>：${escapeHtml(item.reason)}</p>`).join('')}</div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--seven">
    <h3 class="group-title">${escapeHtml(title || group.title || '七选五')}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}

function renderClozeGroup({ group, title, paperAsset, analysis }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const answer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    if (!question || !answer || !entry) return ''
    const glosses = array(entry.distractorGlosses).filter((item) => item?.optionLabel && item?.meaning)
    return `<section class="question question--cloze">
      ${renderQuestionHeader(question.questionNo, answer, answerOptionText(question, answer))}
      ${entry.correctFit?.reason ? `<p class="analysis-prose">${escapeHtml(entry.correctFit.reason)}</p>` : ''}
      ${glosses.length > 0 ? `<div class="distractor distractor--cloze"><span class="micro-heading">干扰项辨析</span><div>${glosses.map((item) => `<p class="cloze-distractor-item"><b>${escapeHtml(item.optionLabel)} ${escapeHtml(item.optionText)}</b>：${escapeHtml(item.meaning)}</p>`).join('')}</div></div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--cloze">
    <h3 class="group-title">${escapeHtml(title || group.title || '完形填空')}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}

function renderGrammarFillGroup({ group, title, paperAsset, analysis }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const authoritativeAnswer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    const answer = nonEmptyString(authoritativeAnswer) || nonEmptyString(entry?.answer)
    if (!question || !answer || !entry) return ''
    const hint = nonEmptyString(entry.hint)
    return `<section class="question question--grammar">
      ${renderQuestionHeader(question.questionNo, answer, hint ? `提示词 ${hint}` : '')}
      ${entry.reason ? `<p class="analysis-prose">${escapeHtml(entry.reason)}</p>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--grammar">
    <h3 class="group-title">${escapeHtml(title || group.title || '语法填空')}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${renderSourceRelationships(groupAnalysis, group, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}

function renderReviewCard(reviewCard) {
  const display = projectApplicationReviewCardDisplay(reviewCard)
  if (!display) return ''
  const row = (label, values) => `<div><dt>${escapeHtml(label)}</dt><dd>${values
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join('')}</dd></div>`
  const primaryRows = [
    ['形式', [display.form]],
    ['主题与目的', display.topicPurpose],
    ['人称', [display.person]],
    ['时态', [display.tense]],
  ]
  const readerRows = [
    ['读者与关系', display.readerRelationship],
    ['读者需要', display.readerNeeds],
    ['写作价值', [display.value]],
  ]
  return `<section class="writing-block review-card" data-review-card-version="${display.sourceVersion}">
    <h4>审题卡</h4>
    <section class="review-group"><h5>基本审题</h5><dl class="review-facts">${primaryRows.map(([label, values]) => row(label, values)).join('')}</dl></section>
    <section class="review-group"><h5>内容要点</h5><ol class="review-points">${display.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol></section>
    <section class="review-group"><h5>读者意识</h5><dl class="reader-facts">${readerRows.map(([label, values]) => row(label, values)).join('')}</dl></section>
  </section>`
}

function renderModelAnswer(answer, heading) {
  const text = nonEmptyString(answer)
  if (!text) return ''
  return `<section class="writing-block model-answer"><h4>${escapeHtml(heading)}</h4><div lang="en">${renderParagraphs(text)}</div></section>`
}

function renderContinuationModels(official, model) {
  if (!official && !model) return ''
  return `<section class="writing-block model-answer" data-continuation-section="modelAnswer"><h4>完整范文</h4>
    ${official ? `<h5>官方参考范文</h5><div lang="en">${renderParagraphs(official)}</div>` : ''}
    ${model && model !== official ? `<h5>生成参考范文</h5><div lang="en">${renderParagraphs(model)}</div>` : ''}
  </section>`
}

function statementAt(value) {
  return nonEmptyString(value?.statement) || nonEmptyString(value)
}

const evidenceSourceLabel = Object.freeze({
  instruction: '题干', material: '原文', paragraph1Starter: '段首句 1', paragraph2Starter: '段首句 2',
})

function renderContinuationEvidence(evidence) {
  const items = array(evidence)
  if (items.length === 0) return ''
  return `<ul class="continuation-evidence">${items.map((item) => `<li><b>${escapeHtml(evidenceSourceLabel[item?.source] || item?.source)}</b>：“${escapeHtml(item?.excerpt)}”</li>`).join('')}</ul>`
}

function renderGrounded(value) {
  if (!value) return ''
  return `<div class="continuation-grounded"><p>${escapeHtml(statementAt(value))}</p>${renderContinuationEvidence(value.evidence)}</div>`
}

function renderGroundedList(values) {
  return array(values).map((value) => renderGrounded(value)).join('')
}

function renderContinuationStory(story) {
  const characters = array(story.characters).map((character) => `<div class="route-paragraph"><h5>${escapeHtml(character.name)} · ${escapeHtml(character.role)}</h5>${renderGroundedList(character.establishedTraits)}${renderGroundedList(character.motivations)}${renderGrounded(character.currentState)}</div>`).join('')
  const relationships = array(story.relationships).map((item) => `<div><b>${escapeHtml(array(item.participants).join(' · '))}</b>${renderGrounded(item.currentRelation)}</div>`).join('')
  const causal = array(story.causalChain).map((item) => `<div class="route-paragraph"><h5>因果</h5>${renderGrounded(item.cause)}${renderGrounded(item.effect)}</div>`).join('')
  return `<section class="writing-block continuation-section" data-continuation-section="storyUnderstanding"><h4>原文理解</h4>
    <dl class="story-map">
      <div><dt>中心情境</dt><dd>${renderGrounded(story.centralSituation)}</dd></div>
      <div><dt>原文终点</dt><dd>${renderGrounded(story.sourceEndState)}</dd></div>
      <div><dt>叙事视角</dt><dd>${renderGrounded(story.narrativePerspective)}</dd></div>
      <div><dt>时空框架</dt><dd>${renderGrounded(story.timeAndPlaceFrame)}</dd></div>
      <div><dt>人物</dt><dd>${characters}</dd></div>
      ${relationships ? `<div><dt>关系</dt><dd>${relationships}</dd></div>` : ''}
      <div><dt>因果链</dt><dd>${causal}</dd></div>
      <div><dt>未决问题</dt><dd>${renderGrounded(story.unresolvedProblem)}</dd></div>
      <div><dt>可用线索</dt><dd>${renderGroundedList(story.usableClues)}</dd></div>
      <div><dt>意义方向</dt><dd><p>${escapeHtml({ explicit: '原文已说明', stronglyInferred: '强推断', open: '开放' }[story.meaningDirection?.confidence] || '')}</p>${renderGrounded(story.meaningDirection)}</dd></div>
      <div><dt>原文风格</dt><dd>${renderGrounded(story.sourceStyle)}</dd></div>
    </dl></section>`
}

function renderConstraints(values) {
  return array(values).map((item) => `<li>${renderGrounded(item)}</li>`).join('')
}

function renderContinuationContract(contract) {
  const paragraphs = array(contract.paragraphs).map((paragraph) => `<div class="route-paragraph"><h5>第 ${paragraph.paragraphIndex} 段约束</h5>
    ${renderGrounded(paragraph.entryState)}${renderGrounded(paragraph.starterFunction)}
    <b>必须完成</b><ul>${renderConstraints(paragraph.requiredMoves)}</ul>
    <b>退出状态</b><ul>${renderConstraints(paragraph.requiredExitState)}</ul>
    ${array(paragraph.supportedOptions).length ? `<b>可选路径</b>${renderGroundedList(paragraph.supportedOptions)}` : ''}</div>`).join('')
  return `<section class="writing-block continuation-section" data-continuation-section="continuationContract"><h4>续写约束</h4>
    <b>必须遵守</b><ul>${renderConstraints(contract.hardConstraints)}</ul>
    ${array(contract.softAffordances).length ? `<b>适宜采用</b>${renderGroundedList(contract.softAffordances)}` : ''}
    ${array(contract.openChoices).length ? `<b>创作自由</b><ul>${array(contract.openChoices).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    <b>禁止矛盾</b><ul>${renderConstraints(contract.forbiddenContradictions)}</ul>
    ${paragraphs}<b>收束要求</b><ul>${renderConstraints(contract.closureRequirements)}</ul></section>`
}

function renderDevelopmentParagraph(paragraph) {
  const emotions = array(paragraph.emotionChanges).map((item) => `<li>${escapeHtml(item.trigger)}：${escapeHtml(item.from)} → ${escapeHtml(item.to)}；${escapeHtml(item.visibleAction)}</li>`).join('')
  const relationships = array(paragraph.relationshipChanges).map((item) => `<li>${escapeHtml(array(item.participants).join(' · '))}：${escapeHtml(item.from)} → ${escapeHtml(item.to)}；${escapeHtml(item.cause)}</li>`).join('')
  const payoffs = array(paragraph.cluePayoffs).map((item) => `<li>${renderContinuationEvidence([item.clue])}<p>${escapeHtml(item.payoff)}</p></li>`).join('')
  return `<div class="route-paragraph"><h5>第 ${paragraph.paragraphIndex} 段</h5>
    <p><b>${paragraph.paragraphPurpose !== undefined ? '段落作用' : '起因'}</b>：${escapeHtml(paragraph.paragraphPurpose ?? paragraph.cause)}</p><p><b>行动</b>：${escapeHtml(paragraph.action)}</p><p><b>结果</b>：${escapeHtml(paragraph.result)}</p>
    ${renderContinuationEvidence(paragraph.sourceEvidence)}${payoffs ? `<b>线索回收</b><ul>${payoffs}</ul>` : ''}
    ${emotions ? `<b>情绪变化</b><ul>${emotions}</ul>` : ''}${relationships ? `<b>关系变化</b><ul>${relationships}</ul>` : ''}
    ${paragraph.languageReminder ? `<p><b>语言提醒</b>：${escapeHtml(paragraph.languageReminder)}</p>` : ''}
    <p><b>${paragraph.paragraphIndex === 1 ? '段间衔接' : '结尾落点'}</b>：${escapeHtml(paragraph.bridge || paragraph.ending)}</p></div>`
}

function renderLegacyContinuationDetails(legacy) {
  if (!legacy) return ''
  return `<div class="legacy-analysis-preserved"><h5>历史分析保留</h5>
    ${renderGrounded(legacy.coreTension)}${renderGroundedList(legacy.drivingMotivations)}${renderGroundedList(legacy.requiredTurningPoints)}
    ${array(legacy.eventChain).map((item) => `<p>${escapeHtml(item.cause)} → ${escapeHtml(item.event)} → ${escapeHtml(item.immediateEffect)}</p>${renderContinuationEvidence(item.evidence)}`).join('')}
    ${array(legacy.emotionLogic).map((item) => `<p>${escapeHtml(item.trigger)}：${escapeHtml(item.internalResponse)}；${escapeHtml(item.visibleAction)}</p>`).join('')}
    ${array(legacy.relationshipMovement).map((item) => `<p>${escapeHtml(array(item.participants).join(' · '))}：${escapeHtml(item.from)} → ${escapeHtml(item.to)}；${escapeHtml(item.cause)}</p>`).join('')}
    ${array(legacy.interactionMoves).map((item) => `<p>${escapeHtml(item.speaker)} → ${escapeHtml(item.listener)}：${escapeHtml(item.purpose)}；${escapeHtml(item.relationshipNeed)}；${escapeHtml(item.expectedEffect)}</p>${renderContinuationEvidence(item.evidence)}`).join('')}
    ${array(legacy.cluePayoffs).map((item) => `${renderContinuationEvidence([item.clue])}<p>${escapeHtml(item.payoff)}</p>`).join('')}
    ${array(legacy.characterActionsByParagraph).map((item) => `<p><b>第 ${item.paragraphIndex} 段人物行动</b>：${array(item.items).map(escapeHtml).join('；')}</p>`).join('')}
    <p>${escapeHtml(legacy.endingState)}</p><p>${escapeHtml(legacy.finalEffect)}</p>
    <p>${escapeHtml([legacy.languageAlignment.personAndPerspective, legacy.languageAlignment.baseTense, legacy.languageAlignment.narrativeDistanceAndRegister, legacy.languageAlignment.sourceStyleContinuity, legacy.languageAlignment.dialoguePolicy].filter(Boolean).join('；'))}</p>
    <p>${escapeHtml([
      ...array(legacy.languageAlignment.licensedTenseShifts),
      ...array(legacy.languageAlignment.cohesionPlan).map((item) => `${item.relation}：${item.use}`),
      ...array(legacy.languageAlignment.descriptionPriorities),
      ...array(legacy.languageAlignment.functionLedLanguage),
      ...array(legacy.languageAlignment.languageRisks),
    ].join('；'))}</p></div>`
}

function renderContinuationAnalysis(analysis) {
  const display = projectContinuationAnalysisDisplay(analysis)
  if (!display) return ''
  const plan = display.developmentPlan
  return `${renderContinuationStory(display.storyUnderstanding)}${renderContinuationContract(display.continuationContract)}
    <section class="writing-block continuation-section" data-continuation-section="developmentPlan"><h4>两段发展方案</h4>
      <p><b>选定路线</b>：${escapeHtml(plan.selectedRoute)}</p>${renderGroundedList(plan.routeRationale)}
      ${array(plan.paragraphs).map(renderDevelopmentParagraph).join('')}
      ${array(plan.alternatives).length ? `<b>其他可行路线</b><ul>${array(plan.alternatives).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${array(plan.qualityRisks).length ? `<b>质量风险</b><ul>${array(plan.qualityRisks).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${renderLegacyContinuationDetails(display.legacyDetails)}
    </section>`
}

function renderWritingGroup({ group, title, analysis }) {
  const writing = analysis?.groups?.[group.groupId]?.writing
  if (!writing) return ''
  const isContinuation = writing.taskType === 'continuation'
  const official = nonEmptyString(writing.officialModelAnswer)
  const model = nonEmptyString(writing.modelAnswer)
  return `<section class="analysis-group analysis-group--writing">
    <h3 class="group-title">${escapeHtml(title || group.title || (isContinuation ? '读后续写' : '应用文写作'))}</h3>
    ${isContinuation
      ? renderContinuationAnalysis(writing.continuationAnalysis)
      : renderReviewCard(writing.reviewCard)}
    ${isContinuation
      ? renderContinuationModels(official, model)
      : `${official ? renderModelAnswer(official, '原卷参考范文') : ''}${model && model !== official ? renderModelAnswer(model, official ? '讲评范文' : '参考范文') : ''}`}
  </section>`
}

function renderGroup(input) {
  switch (input.group?.groupType) {
    case 'listening':
      return renderListeningGroup({ ...input, analysis: input.analyses.listening })
    case 'reading':
      return renderReadingGroup({ ...input, analysis: input.analyses.reading })
    case 'sevenChoices':
    case 'seven_choices':
      return renderSevenChoicesGroup({ ...input, analysis: input.analyses.sevenChoices })
    case 'cloze':
      return renderClozeGroup({ ...input, analysis: input.analyses.cloze })
    case 'grammarFill':
    case 'grammar_cloze':
      return renderGrammarFillGroup({ ...input, analysis: input.analyses.grammarFill })
    case 'writing':
    case 'continuation':
      return renderWritingGroup({ ...input, analysis: input.analyses.writing })
    default:
      return ''
  }
}

function renderAnalysisBody(paperAsset, analyses) {
  return orderedGroups(paperAsset).map((part) => {
    const sections = part.sections.map((section) => {
      const groups = section.groups.map(({ group, title }) => renderGroup({
        group,
        title,
        paperAsset,
        analyses,
      })).filter(Boolean).join('')
      if (!groups) return ''
      return `<section class="paper-section"><h2 class="section-title">${escapeHtml(section.title)}</h2>${groups}</section>`
    }).filter(Boolean).join('')
    if (!sections) return ''
    return `<article class="paper-part"><h2 class="part-title">${escapeHtml(part.title)}</h2>${sections}</article>`
  }).filter(Boolean).join('')
}

export function loadCompanionAnalysisSource({ paperAssetsDir, paperId }) {
  if (!paperAssetsDir) throw new Error('paperAssetsDir is required')
  const normalizedPaperId = assertSafePaperId(paperId)
  const { baseDir, assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, normalizedPaperId)
  if (!existsSync(assetPath)) {
    const error = new Error(`Paper asset not found: ${normalizedPaperId}`)
    error.code = 'COMPANION_ANALYSIS_NOT_FOUND'
    throw error
  }
  const analyses = Object.fromEntries(Object.entries(ANALYSIS_FILES).map(([key, fileName]) => {
    const filePath = path.join(baseDir, 'analyses', fileName)
    return [key, existsSync(filePath) ? readJson(filePath) : null]
  }))
  if (!Object.values(analyses).some(Boolean)) {
    const error = new Error('这份试卷的配套解析尚未发布')
    error.code = 'COMPANION_ANALYSIS_NOT_FOUND'
    throw error
  }
  return {
    paperAsset: readJson(assetPath),
    analyses,
  }
}

export function companionAnalysisFileName(paperAsset, extension = 'pdf') {
  return `${safeFileTitle(paperAsset?.paper?.title)}-配套解析.${extension}`
}

export function buildCompanionAnalysisHtml({ paperAsset, analyses }) {
  if (!paperAsset?.paper?.paperId) throw new Error('paperAsset is required')
  const title = cleanPaperTitle(paperAsset.paper.title)
  const answerOverview = renderAnswerOverview(paperAsset)
  const analysisBody = renderAnalysisBody(paperAsset, analyses || {})
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}｜配套解析</title>
<style>
:root {
  --green: #596a58;
  --green-deep: #3b4e3d;
  --ink: #1e1e1c;
  --muted: #62625d;
  --line: #c6c6c0;
  --line-soft: #e8e8e4;
  --paper: #ffffff;
  --serif: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  --sans: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --latin: "Times New Roman", "Noto Serif", Times, serif;
}

@page {
  size: A4 portrait;
  margin: 17mm 17mm 19mm 21mm;

  @top-left {
    content: "${HOUSE_MARK}";
    color: var(--green-deep);
    font: 600 8pt/1 var(--sans);
    letter-spacing: 0.04em;
    vertical-align: bottom;
    padding-bottom: 3mm;
  }

  @top-right {
    content: string(running-section);
    color: var(--muted);
    font: 400 8pt/1 var(--sans);
    vertical-align: bottom;
    padding-bottom: 3mm;
  }

  @bottom-left {
    content: string(paper-title);
    color: var(--muted);
    font: 400 8pt/1 var(--sans);
    vertical-align: top;
    padding-top: 3mm;
  }

  @bottom-right {
    content: counter(page);
    color: var(--ink);
    font: 600 8pt/1 var(--sans);
    vertical-align: top;
    padding-top: 3mm;
  }
}

@page:left {
  margin: 17mm 21mm 19mm 17mm;
}

@page:first {
  @top-left { content: none; }
  @top-right { content: none; }
}

* {
  box-sizing: border-box;
}

html {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 9pt;
  line-height: 13.6pt;
  hanging-punctuation: first allow-end last;
  text-rendering: optimizeLegibility;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  margin: 0;
}

body::selection,
body *::selection {
  background: var(--line-soft);
  color: var(--ink);
}

p,
li,
dd {
  orphans: 3;
  widows: 3;
}

p {
  margin: 0;
}

h4,
h5 {
  break-after: avoid;
}

[lang="en"] {
  font-family: var(--latin);
}

.frontmatter {
  margin-bottom: 8mm;
}

.house-mark {
  margin: 0 0 5mm;
  color: var(--green-deep);
  font: 600 9pt/1 var(--sans);
  letter-spacing: 0.08em;
}

.frontmatter h1 {
  margin: 0;
  max-width: 142mm;
  color: var(--ink);
  font: 700 18pt/24pt var(--sans);
  letter-spacing: -0.015em;
  string-set: paper-title content();
}

.title-rule {
  display: grid;
  grid-template-columns: 18mm 1fr;
  gap: 2mm;
  margin: 8mm 0 11mm;
}

.title-rule::before,
.title-rule::after {
  height: 0;
  border-top: 0.7pt solid var(--green);
  content: "";
}

.title-rule::after {
  border-color: var(--line);
  border-top-width: 0.35pt;
}

.answer-overview > h2 {
  margin: 0 0 5mm;
  font: 700 13pt/18pt var(--sans);
}

.answer-overview-section {
  margin-top: 5mm;
  break-inside: avoid;
}

.answer-overview-section h3 {
  margin: 0 0 2mm;
  color: var(--muted);
  font: 600 8.5pt/12pt var(--sans);
}

.answer-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 0.35pt solid var(--line);
}

.answer-cell {
  display: grid;
  grid-template-columns: 8mm 1fr;
  align-items: baseline;
  gap: 2mm;
  padding: 1.8mm 2mm 1.6mm 0;
  border-bottom: 0.35pt solid var(--line-soft);
  font: 400 9pt/12pt var(--sans);
  font-variant-numeric: tabular-nums;
}

.answer-cell b {
  color: var(--muted);
  font-weight: 500;
  text-align: right;
}

.answer-cell span {
  color: var(--green-deep);
  font-weight: 700;
}

.analysis-body {
  column-count: 2;
  column-fill: auto;
  column-gap: 8mm;
  column-rule: 0.35pt solid var(--line);
}

.paper-part {
  margin-top: 0;
}

.paper-part + .paper-part {
  margin-top: 8mm;
}

.part-title {
  display: inline-block;
  margin: 0 0 4mm;
  padding: 1.2mm 2.4mm 1mm;
  border: 0.35pt solid var(--green);
  border-radius: 2px;
  color: var(--green-deep);
  font: 700 10pt/13pt var(--sans);
  string-set: running-section content();
  break-after: avoid;
}

.paper-section + .paper-section {
  margin-top: 7mm;
}

.section-title {
  margin: 0 0 3.5mm;
  color: var(--green-deep);
  font: 700 10.5pt/14pt var(--sans);
  break-after: avoid;
}

.analysis-group + .analysis-group {
  margin-top: 6mm;
}

.group-title {
  margin: 0 0 2.8mm;
  color: var(--ink);
  font: 700 10pt/14pt var(--sans);
  break-after: avoid;
}

.overview {
  display: grid;
  grid-template-columns: 14mm 1fr;
  gap: 2.5mm;
  margin: 0 0 3.5mm;
  padding: 2.2mm 0;
  border-top: 0.35pt solid var(--line);
  border-bottom: 0.35pt solid var(--line);
  break-inside: avoid;
}

.micro-heading {
  color: var(--green-deep);
  font: 600 8.5pt/12pt var(--sans);
  white-space: nowrap;
}

.source-underline {
  text-decoration-line: underline;
  text-decoration-color: var(--green);
  text-decoration-thickness: 0.55pt;
  text-underline-offset: 1.4pt;
  text-decoration-skip-ink: auto;
}

.long-sentences {
  margin-top: 5mm;
  break-inside: auto;
}

.long-sentences h4 {
  margin: 0 0 2mm;
  color: var(--green-deep);
  font: 700 9.5pt/13pt var(--sans);
  break-after: avoid;
}

.long-sentence {
  padding: 2.4mm 0;
  border-top: 0.35pt solid var(--line);
  break-inside: avoid;
}

.long-sentence p + p {
  margin-top: 1.2mm;
}

.long-sentence-related {
  color: var(--muted);
  font: 600 8.2pt/12pt var(--sans);
}

.long-sentence-source {
  color: var(--ink);
  font-size: 9.1pt;
  line-height: 14pt;
  text-align: left;
}

.inline-label {
  margin-right: 0.5em;
  color: var(--green-deep);
  font: 600 8.3pt/12pt var(--sans);
  white-space: nowrap;
}

.overview p,
.full-translation p,
.analysis-prose,
.distractor p {
  text-align: justify;
  text-wrap: pretty;
}

.question {
  margin-top: 3.6mm;
  padding-top: 2.8mm;
  border-top: 0.35pt solid var(--line-soft);
  break-inside: auto;
}

.overview + .question {
  margin-top: 0;
}

.full-translation {
  margin: 0 0 4mm;
}

.full-translation h4 {
  margin: 0 0 1.8mm;
  color: var(--ink);
  font: 700 9pt/13pt var(--sans);
  break-after: avoid;
}

.full-translation p {
  text-indent: 2em;
  text-wrap: pretty;
  white-space: pre-line;
}

.full-translation p + p {
  margin-top: 0.8mm;
}

.translation-marker {
  font-family: var(--sans);
  font-size: 8.5pt;
  font-weight: 700;
}

.question-heading {
  display: flex;
  align-items: baseline;
  gap: 2.2mm;
  margin-bottom: 1.5mm;
  font-family: var(--sans);
  break-after: avoid;
}

.question-number {
  min-width: 8mm;
  color: var(--ink);
  font-size: 10pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.question-answer {
  min-width: 6mm;
  color: var(--green-deep);
  font-size: 10pt;
  font-weight: 800;
}

.answer-text {
  color: var(--ink);
  font-size: 9pt;
  font-weight: 600;
}

.question-stem {
  margin-bottom: 1.5mm;
  font-weight: 600;
}

.analysis-prose + .evidence-quote,
.analysis-prose + .distractor,
.evidence-quote + .distractor {
  margin-top: 2.5mm;
}

.evidence-quote {
  break-inside: avoid;
}

.evidence-quote .micro-heading {
  margin-right: 2mm;
}

.evidence-quote p {
  display: inline;
  font-size: 9pt;
  line-height: 13.6pt;
}

.evidence-quote p + p::before {
  content: " ";
}

.distractor--reading .micro-heading,
.distractor--cloze .micro-heading {
  display: block;
  margin-bottom: 0.8mm;
  break-after: avoid;
}

.reading-distractor-item + .reading-distractor-item,
.cloze-distractor-item + .cloze-distractor-item {
  margin-top: 0.8mm;
}

.distractor b {
  font-family: var(--sans);
  font-weight: 600;
}

.context-chain {
  margin: 1mm 0 2.5mm;
  break-inside: avoid;
}

.context-chain > div {
  display: grid;
  grid-template-columns: 11mm 1fr;
  gap: 2mm;
}

.context-chain > div + div {
  margin-top: 0.8mm;
}

.context-chain span {
  color: var(--muted);
  font: 600 8.5pt/12pt var(--sans);
}

.context-chain-answer span,
.context-chain-answer p {
  color: var(--green-deep);
  font-weight: 600;
}

.writing-block {
  margin-top: 6mm;
}

.writing-block > h4 {
  margin: 0 0 3mm;
  padding-bottom: 2mm;
  border-bottom: 0.35pt solid var(--line);
  color: var(--ink);
  font: 700 10.5pt/15pt var(--sans);
  break-after: avoid;
}

.review-group + .review-group {
  margin-top: 4mm;
  padding-top: 3mm;
  border-top: 0.35pt solid var(--line-soft);
}

.review-group > h5 {
  margin: 0 0 1.5mm;
  color: var(--green-deep);
  font: 700 8.5pt/12pt var(--sans);
  break-after: avoid;
}

.review-facts,
.reader-facts,
.story-map {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
}

.review-facts > div,
.reader-facts > div,
.story-map > div {
  display: grid;
  grid-template-columns: 18mm 1fr;
  gap: 2mm;
  padding: 1.7mm 0;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

dt {
  color: var(--muted);
  font: 600 8.5pt/12pt var(--sans);
}

dd {
  margin: 0;
}

.review-card dd span {
  display: block;
}

.review-card dd span + span {
  margin-top: 0.8mm;
}

.review-points {
  margin: 0;
  padding-left: 5mm;
}

.review-points li + li {
  margin-top: 1mm;
}

.writing-points,
.review-value,
.selected-route,
.theme {
  margin-top: 4mm;
}

.writing-points ol,
.writing-points ul,
.route-paragraph ul {
  margin: 1.5mm 0 0;
  padding-left: 5mm;
}

.model-answer > div {
  font-size: 9.2pt;
  line-height: 14.4pt;
}

.model-answer p + p {
  margin-top: 2.2mm;
}

.expressions ol {
  margin: 0;
  padding-left: 6mm;
}

.expressions li {
  padding: 2.2mm 0 2.7mm 1mm;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

.expressions li p {
  text-wrap: pretty;
}

.expression-text {
  margin-bottom: 1mm;
  color: var(--green-deep);
  font-weight: 600;
}

.route-paragraph {
  margin-top: 4mm;
  padding-bottom: 4mm;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

.route-paragraph h5 {
  margin: 0 0 1.5mm;
  color: var(--green-deep);
  font: 700 9pt/13pt var(--sans);
}

.route-paragraph p,
.route-paragraph li {
  text-align: justify;
  text-wrap: pretty;
}

@media screen {
  html {
    background: #ededea;
  }

  body {
    width: 210mm;
    min-height: 297mm;
    margin: 12mm auto;
    padding: 17mm 17mm 19mm 21mm;
    background: var(--paper);
    box-shadow: 0 8px 24px rgba(30, 30, 28, 0.12);
  }

}

@media screen and (max-width: 210mm) {
  body {
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 16px;
    box-shadow: none;
  }

  .frontmatter {
    min-height: 0;
  }

  .frontmatter + .analysis-body {
    margin-top: 32px;
    break-before: auto;
  }

  .analysis-body {
    column-count: 1;
  }
}
</style>
</head>
<body><!--
THESIS: A compact two-column teaching companion, not an answer key squeezed into the exam; it refuses the boxed worksheet and web-card stack.
OWN-WORLD: White A4, a stable two-column publisher grid, near-black book ink, low-saturation aged pine green, serif reading lanes, sans editorial hierarchy and hairline rules.
STORY: The teacher finds authoritative answers first, then scans each narrow column in exam order through one natural evidence chain per question and fuller writing guidance where the task needs it.
FIRST VIEWPORT: House mark, paper title, a short aged-green hairline and the complete objective answer overview; teaching continues below without a forced blank cover remainder.
FORM: Owner-pinned restrained publisher and modern teacher-handbook hybrid; seed owner-publisher-companion-v0.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
--><main>
  <section class="frontmatter">
    <p class="house-mark">${HOUSE_MARK}</p>
    <h1>${escapeHtml(title)}</h1>
    <div class="title-rule" aria-hidden="true"></div>
    <section class="answer-overview">
      <h2>答案速查</h2>
      ${answerOverview}
    </section>
  </section>
  <div class="analysis-body">${analysisBody}</div>
</main></body>
</html>`
}
