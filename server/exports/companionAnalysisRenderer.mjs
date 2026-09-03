import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const ANALYSIS_FILES = Object.freeze({
  reading: 'reading-choice-analysis-v1.json',
  sevenChoices: 'seven-choices-analysis-v1.json',
  cloze: 'cloze-analysis-v1.json',
  grammarFill: 'grammar-fill-analysis-v1.json',
  writing: 'writing-analysis-v1.json',
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

function renderFullTranslation(text) {
  const paragraphs = nonEmptyString(text)
    .split(/\n\s*\n|\n/u)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return ''
  return `<section class="full-translation"><h4>全文译文</h4>${paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\[(\d{1,3})\]/gu, '<b class="translation-marker">[$1]</b>')}</p>`)
    .join('')}</section>`
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

function renderSelectedLongSentences(sentences) {
  const selected = array(sentences).filter((sentence) =>
    nonEmptyString(sentence?.displayText)
    && nonEmptyString(sentence?.analysisZh)
    && nonEmptyString(sentence?.translationZh))
  if (selected.length === 0) return ''
  return `<section class="long-sentences"><h4>长难句解析</h4>${selected.map((sentence) => `<article class="long-sentence">
    <p class="long-sentence-source" lang="en">${renderUnderlinedText(sentence.displayText, sentence.underlineTexts)}</p>
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
    const reasoning = nonEmptyString(array(entry.locationParaphrases)[0]?.note)
      || nonEmptyString(entry.questionFocus)
    const distractors = readingDistractors(entry)
    return `<section class="question question--reading">
      ${renderQuestionHeader(question.questionNo, answer)}
      ${entry.stemTranslationZh ? `<p class="question-stem">${escapeHtml(entry.stemTranslationZh)}</p>` : ''}
      ${reasoning ? `<p class="analysis-prose">${escapeHtml(reasoning)}</p>` : ''}
      ${renderEvidenceQuote(quotes, underlineTexts)}
      ${distractors.length > 0 ? `<div class="distractor distractor--reading"><span class="micro-heading">干扰项辨析</span><div>${distractors.map((distractor) => `<p class="reading-distractor-item"><b>${escapeHtml(distractor.label)} 项</b>${distractor.optionTranslationZh ? `（${escapeHtml(distractor.optionTranslationZh)}）` : ''}：${escapeHtml(nonEmptyString(distractor.trap.explanation) || distractor.trap.relationNote)}</p>`).join('')}</div></div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--reading">
    <h3 class="group-title">${escapeHtml(displayTitle)}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis.fullTranslationZh)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences)}
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
    const distractor = array(entry.keyDistractors)[0]
    const optionText = nonEmptyString(optionByLabel.get(answer))
    return `<section class="question question--seven">
      ${renderQuestionHeader(question.questionNo, answer)}
      ${renderContextChain(entry, optionText)}
      ${entry.optionFit?.fitSummary ? `<p class="analysis-prose">${escapeHtml(entry.optionFit.fitSummary)}</p>` : ''}
      ${distractor?.reason ? `<div class="distractor"><span class="micro-heading">干扰项辨析</span><p><b>${escapeHtml(distractor.optionLabel)} 项</b>：${escapeHtml(distractor.reason)}</p></div>` : ''}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--seven">
    <h3 class="group-title">${escapeHtml(title || group.title || '七选五')}</h3>
    ${renderOverview(groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis.fullTranslationZh)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences)}
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
    ${renderFullTranslation(groupAnalysis.fullTranslationZh)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences)}
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
    ${renderFullTranslation(groupAnalysis.fullTranslationZh)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences)}
  </section>`
}

function renderReviewCard(reviewCard) {
  if (!reviewCard || typeof reviewCard !== 'object') return ''
  const primaryRows = [
    ['体裁', reviewCard.form],
    ['主题', reviewCard.topic],
    ['读者', reviewCard.reader],
    ['人称', reviewCard.person],
    ['时态', reviewCard.tense],
    ['类型', reviewCard.type],
  ].filter(([, value]) => nonEmptyString(value))
  const readerRows = [
    ['读者是谁', reviewCard.readerWho],
    ['读者关心', reviewCard.readerCares],
    ['读者期待', reviewCard.readerWants],
  ].filter(([, value]) => nonEmptyString(value))
  return `<section class="writing-block review-card">
    <h4>审题卡</h4>
    <dl class="review-facts">${primaryRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    ${array(reviewCard.points).length > 0 ? `<div class="writing-points"><span class="micro-heading">内容要点</span><ol>${array(reviewCard.points).map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol></div>` : ''}
    ${readerRows.length > 0 ? `<dl class="reader-facts">${readerRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
    ${reviewCard.value ? `<p class="review-value"><b>写作价值</b>：${escapeHtml(reviewCard.value)}</p>` : ''}
  </section>`
}

function renderModelAnswer(answer, heading) {
  const text = nonEmptyString(answer)
  if (!text) return ''
  return `<section class="writing-block model-answer"><h4>${escapeHtml(heading)}</h4><div lang="en">${renderParagraphs(text)}</div></section>`
}

function renderHighlightExpressions(items) {
  const expressions = array(items).filter((item) => item?.text && item?.note)
  if (expressions.length === 0) return ''
  return `<section class="writing-block expressions"><h4>精选表达</h4><ol>${expressions.map((item) => `<li><p class="expression-text" lang="en">${escapeHtml(item.text)}</p><p>${escapeHtml(item.note)}</p></li>`).join('')}</ol></section>`
}

function renderLegacyContinuationDesign(design) {
  if (!design || typeof design !== 'object') return ''
  return `<section class="writing-block continuation-route"><h4>续写路线</h4>
    ${design.theme ? `<p class="theme"><b>主题</b>：${escapeHtml(design.theme)}</p>` : ''}
    ${array(design.paragraphs).map((paragraph, index) => `<div class="route-paragraph"><h5>第 ${index + 1} 段</h5><p>${escapeHtml(paragraph)}</p></div>`).join('')}
  </section>`
}

function statementAt(value) {
  return nonEmptyString(value?.statement) || nonEmptyString(value)
}

function renderContinuationAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return ''
  const story = analysis.storyUnderstanding || {}
  const contract = analysis.continuationContract || {}
  const blueprint = analysis.paragraphBlueprint || {}
  const storyRows = [
    ['故事核心', statementAt(story.centralSituation)],
    ['原文终点', statementAt(story.sourceEndState)],
    ['待解问题', statementAt(story.unresolvedProblem)],
    ['主题方向', statementAt(story.meaningDirection)],
  ].filter(([, value]) => value)
  const boundaries = [
    ...array(contract.hardConstraints).map((item) => statementAt(item)),
    ...array(contract.forbiddenContradictions).map((item) => statementAt(item)),
  ].filter(Boolean)
  return `<section class="writing-block continuation-route"><h4>故事地图与续写边界</h4>
    ${storyRows.length > 0 ? `<dl class="story-map">${storyRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
    ${boundaries.length > 0 ? `<div class="writing-points"><span class="micro-heading">必须守住</span><ul>${boundaries.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    ${blueprint.selectedRoute ? `<p class="selected-route"><b>选定路线</b>：${escapeHtml(blueprint.selectedRoute)}</p>` : ''}
    ${array(blueprint.paragraphs).map((paragraph, index) => `<div class="route-paragraph"><h5>第 ${paragraph?.paragraphIndex || index + 1} 段</h5>${paragraph?.narrativeFunction ? `<p>${escapeHtml(paragraph.narrativeFunction)}</p>` : ''}${array(paragraph?.eventMoves).length > 0 ? `<ul>${array(paragraph.eventMoves).map((move) => `<li>${escapeHtml(move)}</li>`).join('')}</ul>` : ''}${paragraph?.stateChange ? `<p><b>状态变化</b>：${escapeHtml(paragraph.stateChange)}</p>` : ''}</div>`).join('')}
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
      ? (writing.continuationAnalysis
          ? renderContinuationAnalysis(writing.continuationAnalysis)
          : renderLegacyContinuationDesign(writing.continuationDesign))
      : renderReviewCard(writing.reviewCard)}
    ${official ? renderModelAnswer(official, '原卷参考范文') : ''}
    ${model && model !== official ? renderModelAnswer(model, official ? '讲评范文' : '参考范文') : ''}
    ${renderHighlightExpressions(writing.highlightExpressions)}
  </section>`
}

function renderGroup(input) {
  switch (input.group?.groupType) {
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

[lang="en"] {
  font-family: var(--latin);
}

.frontmatter {
  min-height: 250mm;
}

.house-mark {
  margin: 0 0 17mm;
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

.frontmatter + .analysis-body {
  break-before: page;
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
</style>
</head>
<body><!--
THESIS: A compact two-column teaching companion, not an answer key squeezed into the exam; it refuses the boxed worksheet and web-card stack.
OWN-WORLD: White A4, a stable two-column publisher grid, near-black book ink, low-saturation aged pine green, serif reading lanes, sans editorial hierarchy and hairline rules.
STORY: The teacher finds authoritative answers first, then scans each narrow column in exam order through one natural evidence chain per question and fuller writing guidance where the task needs it.
FIRST VIEWPORT: House mark, paper title, a short aged-green hairline and the complete objective answer overview; analysis begins on the next sheet.
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
