import { resolveFigureTextRegion } from '../../../shared/paper-canonical/richContent.mjs'
import { renderEvidenceQuote, renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderUnderlinedText } from './blocks.mjs'
import { answerData, passageQuote, questionData } from './paper.mjs'
import { array, escapeHtml, exactTextRange, innerQuote, nonEmptyString, withoutClosingPunctuation } from './text.mjs'
import { hasReadingLocate, passageSentences, resolveReadingLocate, stemLocateItems } from '../../paper-import-ai/readingLocate.mjs'

export function readingDistractors(entry) {
  return array(entry?.optionAnalysis).filter((option) =>
    option?.status === 'wrong'
    && option?.trap?.suspension?.level !== 'row'
    && (nonEmptyString(option?.trap?.explanation) || nonEmptyString(option?.trap?.relationNote)))
}

// 定位: where a teacher sends the class to look. The stem words that also
// occur in the clue's paragraph are the locating words; the place is that
// paragraph counted the way a teacher counts on the exam paper (titles and
// section heads are not paragraphs), or its section head when the passage is
// split into headed sections. Both come from the paper and the analysis that
// is already frozen; nothing here is new authored content.
const locatorStopwords = new Set(`a about according after all also an and any are as at be been before best but by
can could did do does doing find for found from get give had has have he her his how i if in into is it its
know learn make may mean need saw say see show take think try use
mentioned might most much not of on one or our paragraph part passage purpose refer s says she should so
something suitable tell text that the their them these they this those title to underlined us was we were
what when where which who whom whose why will with word would you your`.split(/\s+/u))
const locatorWord = /[A-Za-z][A-Za-z’'-]*/gu

function locatorKey(word) {
  const key = word.toLowerCase().replace(/[’']s$/u, '').replace(/[’']/gu, '')
  return key.length > 4 ? key.replace(/ies$/u, 'y').replace(/(?:es|s|ed|ing)$/u, '') : key
}

export function stemLocators(stem, text) {
  const inText = new Set((nonEmptyString(text).match(locatorWord) || []).map(locatorKey))
  const source = nonEmptyString(stem)
  const phrases = []
  let run = null
  for (const match of [...source.matchAll(locatorWord), { 0: '', index: source.length }]) {
    const word = match[0]
    const key = locatorKey(word)
    if (word && !locatorStopwords.has(key) && inText.has(key)) {
      run = { start: run?.start ?? match.index, end: match.index + word.length }
      continue
    }
    if (run) phrases.push(source.slice(run.start, run.end).replace(/[’']s$/u, ''))
    run = null
  }
  // Names lead: a capitalised phrase is the word a teacher circles first.
  const named = phrase => /^[A-Z]/u.test(phrase) ? 0 : 1
  return [...new Set(phrases)].sort((a, b) => named(a) - named(b)).slice(0, 3)
}

function isPassageHeading(paragraph) {
  const text = nonEmptyString(paragraph?.text).trim()
  return paragraph?.role === 'subtitle'
    || (text.length > 0 && !/[.!?。！？"”’)）:：]$/u.test(text) && text.split(/\s+/u).length <= 12)
}

// One label per paragraph: 「第 N 段」 in a plain passage; the section head in
// a passage of headed sections (with 「第 k 段」 when a section has several);
// 「标题」 and 「小标题」 for the heads themselves.
export function passagePlace(group, paragraphId) {
  const paragraphs = array(group?.passage?.paragraphs)
  const sections = []
  for (const [index, paragraph] of paragraphs.entries()) {
    if (isPassageHeading(paragraph)) {
      if (index > 0) sections.push({ heading: paragraph.text.trim(), ids: [] })
      else sections.push({ heading: '', ids: [] })
      continue
    }
    if (sections.length === 0) sections.push({ heading: '', ids: [] })
    const ids = sections.at(-1).ids
    // A paragraph cut at a page break comes in as two; the second half starts
    // in lower case and still counts as the paragraph it continues.
    if (ids.length > 0 && /^[“"‘']?[a-z]/u.test(nonEmptyString(paragraph.text).trim())) ids.push([ids.pop(), paragraph.paragraphId].flat())
    else ids.push(paragraph.paragraphId)
  }
  const headingIndex = paragraphs.findIndex(paragraph => paragraph.paragraphId === paragraphId)
  if (headingIndex >= 0 && isPassageHeading(paragraphs[headingIndex])) return headingIndex === 0 ? '标题' : '小标题'
  const headed = sections.filter(section => section.heading).length >= 2
  if (!headed) {
    const index = sections.flatMap(section => section.ids).findIndex(id => [id].flat().includes(paragraphId))
    return index >= 0 ? `第 ${index + 1} 段` : ''
  }
  for (const section of sections) {
    const index = section.ids.findIndex(id => [id].flat().includes(paragraphId))
    if (index < 0) continue
    if (!section.heading) return section.ids.length > 1 ? `开头第 ${index + 1} 段` : '开头'
    return section.ids.length > 1 ? `${section.heading} 第 ${index + 1} 段` : section.heading
  }
  return ''
}

// 定位 written by the analysis (BUB-255) takes the place of the matched words
// above when the analysis has it: the stem words it names, the 定位句, and
// the answer inside or around it.
function paragraphTexts(group) {
  return new Map(array(group?.passage?.paragraphs).map(paragraph => [paragraph.paragraphId, paragraph.text]))
}

function dataLocate(entry, question, group, correct) {
  if (!hasReadingLocate(entry)) return null
  return resolveReadingLocate({
    entry, stem: question?.stem, paragraphs: paragraphTexts(group), correctEvidence: correct?.evidence,
  }).locate
}

const OPENING_QUOTE = /^[“"‘']/u
const CLOSING_QUOTE = /[”"’']$/u

function markedHtml(text, marks) {
  const cuts = [...new Set([0, text.length, ...marks.flatMap(mark => [mark.start, mark.end])])]
    .filter(cut => cut >= 0 && cut <= text.length).sort((left, right) => left - right)
  let html = ''
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const [start, end] = [cuts[index], cuts[index + 1]]
    const inside = kind => marks.some(mark => mark.kind === kind && mark.start <= start && mark.end >= end)
    let piece = escapeHtml(text.slice(start, end))
    if (inside('cue')) piece = `<b class="locate-cue">${piece}</b>`
    if (inside('answer')) piece = `<span class="source-underline">${piece}</span>`
    html += piece
  }
  return html
}

// One excerpt in reading order: the 定位句 and the sentences that hold the
// answer, with the sentences between them kept when there is one and cut to
// "……" when there are more.
function locateExcerpt(locate, group) {
  const texts = paragraphTexts(group)
  const order = array(group?.passage?.paragraphs).map(paragraph => paragraph.paragraphId)
  const pieces = []
  const add = (paragraphId, indices) => {
    const sentences = passageSentences(texts.get(paragraphId))
    for (const index of indices) pieces.push({ paragraphId, index, ...sentences[index] })
  }
  const answerSentences = passageSentences(texts.get(locate.answer.paragraphId))
    .map((sentence, index) => ({ ...sentence, index }))
    .filter(sentence => sentence.end > locate.answer.start && sentence.start < locate.answer.end)
    .map(sentence => sentence.index)
  if (locate.answer.paragraphId === locate.paragraphId) {
    const low = Math.min(locate.sentence.index, answerSentences[0])
    const high = Math.max(locate.sentence.index, answerSentences.at(-1))
    const kept = new Set([locate.sentence.index, ...answerSentences])
    const between = []
    for (let index = low; index <= high; index += 1) if (!kept.has(index)) between.push(index)
    add(locate.paragraphId, between.length <= 1
      ? Array.from({ length: high - low + 1 }, (_, offset) => low + offset)
      : [...kept].sort((left, right) => left - right))
  } else {
    const first = order.indexOf(locate.paragraphId) <= order.indexOf(locate.answer.paragraphId)
    const target = [locate.paragraphId, [locate.sentence.index]]
    const answer = [locate.answer.paragraphId, answerSentences]
    for (const [paragraphId, indices] of first ? [target, answer] : [answer, target]) add(paragraphId, indices)
  }
  let html = ''
  pieces.forEach((piece, position) => {
    const previous = pieces[position - 1]
    const joined = previous && previous.paragraphId === piece.paragraphId && previous.index + 1 === piece.index
    let { start, end } = piece
    const paragraph = texts.get(piece.paragraphId)
    while (end > start && /\s/u.test(paragraph[end - 1])) end -= 1
    if (position === 0) while (start < end && OPENING_QUOTE.test(paragraph[start])) start += 1
    if (position === pieces.length - 1) while (end > start && CLOSING_QUOTE.test(paragraph[end - 1])) end -= 1
    const marks = []
    if (piece.paragraphId === locate.paragraphId) marks.push({ kind: 'cue', start: locate.cue.start - start, end: locate.cue.end - start })
    if (piece.paragraphId === locate.answer.paragraphId) marks.push({ kind: 'answer', start: locate.answer.start - start, end: locate.answer.end - start })
    html += `${position === 0 ? '' : joined ? ' ' : ' …… '}${markedHtml(innerQuote(paragraph.slice(start, end)), marks)}`
  })
  return { html, pieces }
}

function renderLocateQuote(locate, group, correct, underlineTexts) {
  const { html, pieces } = locateExcerpt(locate, group)
  const texts = paragraphTexts(group)
  const others = [...new Set(array(correct?.evidence).filter((evidence) => {
    const paragraph = texts.get(evidence?.paragraphId)
    const start = paragraph?.indexOf(evidence?.quote ?? '') ?? -1
    if (start < 0) return false
    const end = start + evidence.quote.length
    return !pieces.some(piece => piece.paragraphId === evidence.paragraphId && piece.start < end && piece.end > start)
  }).map(evidence => evidence.quote))]
  const quotes = [`<p lang="en">“${html}”</p>`, ...others.map(quote =>
    `<p lang="en">“${renderUnderlinedText(innerQuote(quote), underlineTexts.map(innerQuote))}”</p>`)]
  return `<div class="evidence-quote"><span class="micro-heading">原文依据</span>${quotes.join('；')}${locate.bridge
    ? `<p class="evidence-bridge">→ ${escapeHtml(locate.bridge)}</p>` : ''}</div>`
}

function renderDataLocate(locate, entry, question, group, evidence) {
  if (locate.by === 'options') return '<p class="evidence-locate"><span class="inline-label">定位</span>按选项回原文</p>'
  if (locate.by === 'passage') {
    return entry?.similarityProfile?.subtype === 'paragraph-main-idea' ? renderLocate(entry, question, group, evidence) : ''
  }
  const place = passagePlace(group, locate.paragraphId)
  return `<p class="evidence-locate"><span class="inline-label">定位</span><b lang="en">${escapeHtml(locate.sourceText)}</b>${place ? ` → ${escapeHtml(place)}` : ''}</p>`
}

function renderLocate(entry, question, group, evidence) {
  if (entry?.similarityProfile?.family === 'main-idea' && entry?.similarityProfile?.subtype !== 'paragraph-main-idea') return ''
  const paragraphIds = [...new Set(array(evidence).map(item => item?.paragraphId).filter(Boolean))]
  const places = [...new Set(paragraphIds.map(id => passagePlace(group, id)).filter(Boolean))]
  if (places.length === 0) return ''
  const paragraphText = paragraphIds.map(id => array(group?.passage?.paragraphs)
    .find(item => item.paragraphId === id)?.text).join(' ')
  const words = stemLocators(question?.stem, paragraphText)
  return `<p class="evidence-locate"><span class="inline-label">定位</span>${words.length
    ? `${words.map(word => `<b lang="en">${escapeHtml(word)}</b>`).join('、')} → ` : ''}${places.map(escapeHtml).join('、')}</p>`
}

function renderParaphrase(entry, answer) {
  const options = [...new Set(array(entry?.locationParaphrases)
    .filter(relation => relation?.sourceRole === 'correctOption' && relation?.relationType === 'paraphrase')
    .map(relation => nonEmptyString(relation.sourceText)).filter(Boolean))]
  if (options.length === 0) return ''
  return `<p class="evidence-paraphrase"><span class="inline-label">同义替换</span><b>${escapeHtml(answer)} 项</b> <span lang="en">${options.map(escapeHtml).join(' ')}</span></p>`
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
    const place = passagePlace(group, item.paragraphId)
    return `<p>${place ? `<b>${escapeHtml(place)}</b> ` : ''}${escapeHtml(item.function ? withoutClosingPunctuation(item.summary) : item.summary)}${item.function ? `${item.summary ? '；' : ''}作用：${escapeHtml(item.function)}` : ''}</p>`
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
    const locate = dataLocate(entry, question, group, correct)
    const locateItems = new Set(locate ? stemLocateItems(entry) : [])
    const relations = array(entry.locationParaphrases).filter(relation => !locateItems.has(relation))
    const underlineTexts = relations
      .map((relation) => relation?.targetText)
    const reasoning = [...new Set(relations
      .map((relation) => nonEmptyString(relation?.note)).filter(Boolean))]
    if (reasoning.length === 0 && nonEmptyString(entry.questionFocus)) reasoning.push(entry.questionFocus)
    const distractors = readingDistractors(entry).map(option => ({
      ...option, optionTranslationZh: withoutClosingPunctuation(option.optionTranslationZh),
    }))
    const [first, ...details] = [
      entry.stemTranslationZh ? `<p class="question-stem">${escapeHtml(entry.stemTranslationZh)}</p>` : '',
      locate ? renderDataLocate(locate, entry, question, group, correct?.evidence) : renderLocate(entry, question, group, correct?.evidence),
      locate?.by === 'stem' ? renderLocateQuote(locate, group, correct, underlineTexts) : renderEvidenceQuote(quotes, underlineTexts),
      renderParaphrase(entry, answer),
      ...reasoning.map((item) => `<p class="analysis-prose">${escapeHtml(item)}</p>`),
      distractors.length > 0 ? `<div class="distractor distractor--reading"><span class="micro-heading">干扰项辨析</span><div>${distractors.map((distractor) => `<p class="reading-distractor-item"><b>${escapeHtml(distractor.label)} 项</b>${distractor.optionTranslationZh ? `（${escapeHtml(distractor.optionTranslationZh)}）` : ''}：${escapeHtml(nonEmptyString(distractor.trap.explanation) || distractor.trap.relationNote)}</p>`).join('')}</div></div>` : '',
    ].filter(Boolean)
    return `<section class="question question--reading">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer), first)}
      ${details.join('')}
    </section>`
  }).join('')
  // Reading prints no passage of its own: each question quotes its clue in
  // 原文依据, and the full translation carries the same marks (Owner
  // 2026-11-21, docs/product/companion-analysis-components.md).
  return `<section class="analysis-group analysis-group--reading">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(displayTitle, answers), renderOverview(groupAnalysis.overview))}
    ${openingHeadings && array(group.questionIds).some(questionId => hasReadingLocate(analysis?.questions?.[questionId]))
    ? '<p class="locate-legend"><b class="locate-cue">粗体</b>是题干定位词，<span class="source-underline">淡绿底</span>是答案所在</p>' : ''}
    ${renderReadingDiscourse(groupAnalysis.discourseStructure, group, groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset)}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
