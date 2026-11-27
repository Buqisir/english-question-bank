import { resolveFigureTextRegion } from '../../../shared/paper-canonical/richContent.mjs'
import { renderEvidenceQuote, renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderSelectedLongSentences, renderUnderlinedText } from './blocks.mjs'
import { answerData, answerOptionText, passageQuote, questionData } from './paper.mjs'
import { array, escapeHtml, exactTextRange, innerQuote, nonEmptyString, passageHtml, withoutClosingPunctuation } from './text.mjs'
import { stripTrapName } from '../../paper-import/trapNameTail.mjs'
import { PARAGRAPH_TOKEN, hasReadingLocate, passageSentences, resolveReadingLocate, sentenceOfWords, stemLocateItems } from '../../paper-import-ai/readingLocate.mjs'

// 「错在：」 then the sentence, without a trailing type label (trapNameTail.mjs).
function renderTrapReason(trap, group) {
  return `错在：${renderProse(stripTrapName(trap).text, group)}`
}

// Options that one condition rules out together carry the same sentence; they
// print as one line, 「A、B 项（…；…）错在：」, where the first of them stands.
function distractorRows(distractors) {
  const rows = new Map()
  for (const distractor of distractors) {
    const key = stripTrapName(distractor.trap).text.trim()
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push(distractor)
  }
  return [...rows.values()]
}

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
  // Short lines in a row that share one shape (Week 1 | July 8 -- 12,
  // Week 2 | July 15 -- 19: the same first two words once digits are set
  // aside) are a list, not section heads; a marked subtitle stays a head.
  const short = paragraphs.map(isPassageHeading)
  const shape = index => nonEmptyString(paragraphs[index]?.text).trim().replace(/\d+/gu, '#').split(/\s+/u).slice(0, 2).join(' ')
  const listed = index => index > 0 && ((index > 1 && short[index - 1] && shape(index - 1) === shape(index))
    || (short[index + 1] && shape(index + 1) === shape(index)))
  // A short "Label: value" line whose label comes back elsewhere in the
  // passage (Walk Duration: 6 hours, Walk Duration: 1.5 hours) is an info
  // line under a section, not a head; Walk 1: The Natural World stays a head.
  // A line with the next head glued on (Tickets: £12–£96Jodie’s Fitness
  // Summer Classes) still opens the next section.
  const label = index => {
    const text = nonEmptyString(paragraphs[index]?.text).trim()
    return /[a-z0-9][A-Z][a-z]/u.test(text) ? undefined : (text.match(/^([^:：]{2,30})[:：]\s*\S/u) || [])[1]?.trim()
  }
  const labels = paragraphs.map((_, index) => short[index] ? label(index) : undefined)
  const field = index => labels[index] !== undefined && labels.filter(other => other === labels[index]).length >= 2
  // A short last line heads nothing (Park Place, Cardiff CF10 3LN under the
  // last venue), nor does a source credit (©2026 The Pew Charitable Trusts):
  // both stay in the section above.
  const credit = index => /^[©◎]/u.test(nonEmptyString(paragraphs[index]?.text).trim())
  const heading = (paragraph, index) => short[index] && (index === 0 || paragraph?.role === 'subtitle'
    || (index < paragraphs.length - 1 && !credit(index) && !listed(index) && !field(index)))
  // On such a glued line the head is the part after the join (New Theatre in
  // Senghennydd Road, Cardiff CF24 4YEwww. shermancymru. co. ukNew Theatre);
  // the address before it is still the last line of the section above.
  const glued = index => {
    const text = nonEmptyString(paragraphs[index]?.text).trim()
    const join = [...text.matchAll(/[a-z0-9](?=[A-Z][a-z])/gu)].at(-1)
    return index > 0 && join && /\d/u.test(text.slice(0, join.index)) ? text.slice(join.index + 1).trim() : undefined
  }
  const sections = []
  for (const [index, paragraph] of paragraphs.entries()) {
    if (heading(paragraph, index)) {
      const tail = glued(index)
      if (tail && sections.length > 0) sections.at(-1).ids.push(paragraph.paragraphId)
      if (index > 0) sections.push({ heading: tail || paragraph.text.trim(), ids: [] })
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
  if (headingIndex >= 0 && heading(paragraphs[headingIndex], headingIndex) && !glued(headingIndex)) return headingIndex === 0 ? '标题' : '小标题'
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
    options: question?.options, answer: correct?.label,
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
    let piece = passageHtml(text.slice(start, end))
    if (inside('cue')) piece = `<b class="locate-cue">${piece}</b>`
    if (inside('answer')) piece = `<span class="source-underline">${piece}</span>`
    html += piece
  }
  return html
}

function sentenceIndices(sentences, span) {
  const indices = []
  for (const [index, sentence] of sentences.entries()) {
    if (sentence.end > span.start && sentence.start < span.end) indices.push(index)
  }
  return indices
}

// One excerpt in reading order: the 定位句 and the sentences that hold the
// answer, with the sentences between them kept when there is one and cut to
// "……" when there are more.
function locateExcerpt(locate, group) {
  const texts = paragraphTexts(group)
  const order = array(group?.passage?.paragraphs).map(paragraph => paragraph.paragraphId)
  const pieces = []
  const add = (paragraphId, sentences, indices) => {
    for (const index of indices) pieces.push({ paragraphId, index, ...sentences[index] })
  }
  const sameParagraph = locate.answer.paragraphId === locate.paragraphId
  const targetSentences = passageSentences(texts.get(locate.paragraphId))
  const answerSentences = sameParagraph ? targetSentences : passageSentences(texts.get(locate.answer.paragraphId))
  const targetIndices = sentenceIndices(targetSentences, locate.sentence)
  const answerIndices = sentenceIndices(answerSentences, locate.answer)
  if (sameParagraph) {
    const low = Math.min(targetIndices[0], answerIndices[0])
    const high = Math.max(targetIndices.at(-1), answerIndices.at(-1))
    const kept = new Set([...targetIndices, ...answerIndices])
    const between = []
    for (let index = low; index <= high; index += 1) if (!kept.has(index)) between.push(index)
    add(locate.paragraphId, targetSentences, between.length <= 1
      ? Array.from({ length: high - low + 1 }, (_, offset) => low + offset)
      : [...kept].sort((left, right) => left - right))
  } else {
    const first = order.indexOf(locate.paragraphId) <= order.indexOf(locate.answer.paragraphId)
    const target = [locate.paragraphId, targetSentences, targetIndices]
    const answer = [locate.answer.paragraphId, answerSentences, answerIndices]
    for (const selection of first ? [target, answer] : [answer, target]) add(...selection)
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
    // Two sentences in a row join with a space, or with a line break where
    // the paper starts a new line between them (a lecture's name, then its date).
    const gap = joined ? paragraph.slice(previous.start, piece.start) : ''
    const join = position === 0 ? '' : !joined ? ' …… ' : gap.includes('\u2028') ? '<br>' : ' '
    html += `${join}${markedHtml(innerQuote(paragraph.slice(start, end)), marks)}`
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
    ? `<p class="evidence-bridge">→ ${renderProse(locate.bridge, group)}</p>` : ''}</div>`
}

const SENTENCE_STEPS = ['', '一', '两']

// 句位 of the 定位句, counted the way a teacher points on the paper: 首句,
// 末句, 第 M 句. A one-sentence paragraph needs none.
function sentencePlace(group, paragraphId, index) {
  const count = passageSentences(paragraphTexts(group).get(paragraphId)).length
  if (!Number.isInteger(index) || count < 2 || index < 0 || index >= count) return ''
  return index === 0 ? '首句' : index === count - 1 ? '末句' : `第 ${index + 1} 句`
}

function placeWithSentence(group, locate) {
  const place = passagePlace(group, locate.paragraphId)
  const sentence = sentencePlace(group, locate.paragraphId, locate.sentence?.index)
  if (!place || !sentence) return place
  return /段$/u.test(place) ? `${place}${sentence}` : `${place} ${sentence}`
}

// Where the answer is when the 定位句 does not hold it, worked out from
// positions: 「前一句」「后两句」「同段前文」「下一段」「第 4 段」.
function answerWhere(locate, group) {
  if (locate.same) return ''
  const place = passagePlace(group, locate.paragraphId)
  const answerPlace = passagePlace(group, locate.answer.paragraphId)
  if (locate.answer.paragraphId !== locate.paragraphId && answerPlace !== place) {
    const number = value => Number(/^第 (\d+) 段$/u.exec(value)?.[1])
    const step = number(answerPlace) - number(place)
    return step === 1 ? '下一段' : step === -1 ? '上一段' : answerPlace || '别段'
  }
  if (locate.answer.paragraphId !== locate.paragraphId) {
    const order = array(group?.passage?.paragraphs).map(paragraph => paragraph.paragraphId)
    return order.indexOf(locate.answer.paragraphId) > order.indexOf(locate.paragraphId) ? '同段后文' : '同段前文'
  }
  const sentences = passageSentences(paragraphTexts(group).get(locate.paragraphId))
  const targetIndices = sentenceIndices(sentences, locate.sentence)
  const answerIndices = sentenceIndices(sentences, locate.answer)
  const before = answerIndices[0] < targetIndices[0]
  const step = before ? targetIndices[0] - answerIndices[0] : answerIndices.at(-1) - targetIndices.at(-1)
  if (!before && step === 1) return '下一句'
  return step <= 2 ? `${before ? '前' : '后'}${SENTENCE_STEPS[step]}句` : `同段${before ? '前' : '后'}文`
}

// Prose the analysis wrote (讲解, bridge, 错项 reasons, 找法), escaped, with
// each [[paragraphId]] printed the way this passage labels it (第 3 段, a
// section head) and each [[paragraphId|words]] with the sentence holding the
// words as well (第 3 段首句): the page counts, the analysis never does.
function renderProse(value, group) {
  const source = nonEmptyString(value)
  const texts = paragraphTexts(group)
  let html = ''
  let last = 0
  for (const match of source.matchAll(PARAGRAPH_TOKEN)) {
    const place = passagePlace(group, match[1])
    const index = match[2] === undefined ? -1 : sentenceOfWords(texts.get(match[1]), match[2])
    const sentence = place && index >= 0 ? sentencePlace(group, match[1], index) : ''
    const label = !place ? '原文' : !sentence ? place : /段$/u.test(place) ? `${place}${sentence}` : `${place} ${sentence}`
    html += escapeHtml(source.slice(last, match.index)) + escapeHtml(label)
    last = match.index + match[0].length
  }
  return html + escapeHtml(source.slice(last))
}

// The analysis's own second line under the 定位 skeleton: one move from where
// the reader lands and what to look for.
function renderFind(find, group) {
  return find ? `<span class="locate-find">${renderProse(find, group)}</span>` : ''
}

// Skeleton + second line: the skeleton is printed the same way on every
// question so the reader can scan it (the 定位词 and the paragraph, or how
// the question is checked); the second line, under it, is this question's
// own move. Why the answer follows is the bridge under the quote.
// The 定位词 in bold; when the passage words differ, an arrow to them, each
// with its gloss in muted ink: Ho’s job（Ho 的工作）→ hospital teacher（医院里的老师）.
// Passage words that are the stem's own, whole or cut short (hospital school,
// School), are not printed again.
function locateSameWords(locate) {
  return locate.sameWords ?? locate.cue.text.toLowerCase() === locate.sourceText.toLowerCase()
}

function locateWords(locate) {
  const gloss = value => value ? `<span class="locate-gloss">（${escapeHtml(value)}）</span>` : ''
  return `<b lang="en">${escapeHtml(locate.sourceText)}</b>${locateSameWords(locate) ? ''
    : `${gloss(locate.sourceZh)} → <b lang="en">${escapeHtml(locate.cue.text)}</b>${gloss(locate.cueZh)}`}`
}

function renderSkeletonLocate(locate, entry, group, evidence) {
  const note = value => `<span class="locate-note">${escapeHtml(value)}</span>`
  let find = locate.find
  let skeleton
  if (locate.by === 'options') skeleton = '核对选项'
  else if (locate.by === 'passage') {
    const named = entry?.similarityProfile?.subtype === 'paragraph-main-idea'
      ? [...new Set(array(evidence).map(item => passagePlace(group, item?.paragraphId)).filter(Boolean))] : []
    skeleton = named.length ? `看${escapeHtml(named.join('、'))}` : '看全文'
    // 看第 5 段, then a 找法 that opens on the same paragraph: say it once.
    const [only] = named.length === 1 ? array(evidence).map(item => item?.paragraphId).filter(Boolean) : []
    if (only && find.startsWith(`[[${only}]]`)) find = find.slice(`[[${only}]]`.length).replace(/^[\s，,：:]+/u, '')
  } else {
    const place = placeWithSentence(group, locate)
    // The arrow always leads on: to the passage's own words when they
    // differ, else straight to the paragraph.
    skeleton = `${locateWords(locate)}${locateSameWords(locate) && place ? ' →' : ''}${place ? note(place) : ''}`
  }
  return `<p class="evidence-locate"><span class="inline-label">定位</span>${skeleton}${renderFind(find, group)}</p>`
}

function renderDataLocate(locate, entry, question, group, evidence) {
  if (typeof locate.find === 'string') return renderSkeletonLocate(locate, entry, group, evidence)
  if (locate.by === 'options') {
    // A method name alone tells the reader nothing: say where the correct
    // option comes from, in passage order, from its own evidence.
    const order = array(group?.passage?.paragraphs).map(paragraph => paragraph.paragraphId)
    const places = [...new Set(array(evidence).map(item => item?.paragraphId).filter(id => order.includes(id))
      .sort((left, right) => order.indexOf(left) - order.indexOf(right)).map(id => passagePlace(group, id)).filter(Boolean))]
    return `<p class="evidence-locate"><span class="inline-label">定位</span>按选项回原文${places.length
      ? `<span class="locate-where">正确项出自${escapeHtml(places.join('、'))}</span>` : ''}</p>`
  }
  if (locate.by === 'passage') {
    return entry?.similarityProfile?.subtype === 'paragraph-main-idea' ? renderLocate(entry, question, group, evidence) : ''
  }
  const place = placeWithSentence(group, locate)
  // Same words in the passage: write them once. Other words: stem → passage.
  const note = value => `<span class="locate-note">${escapeHtml(value)}</span>`
  const words = `${locateWords(locate)}${locateSameWords(locate) ? note('原词') : ''}${place ? note(place) : ''}`
  const where = answerWhere(locate, group)
  return `<p class="evidence-locate"><span class="inline-label">定位</span>${words}${where
    ? `<span class="locate-where">答案不在定位句，在${escapeHtml(where)}</span>` : ''}</p>`
}

// The English stem as printed on the paper, with the 定位词 in bold when the
// question is located from the stem, then the Chinese translation in muted
// ink: the reader sees the stem words that the 定位 line and the passage
// quote pick up again.
function renderReadingStem(question, entry, locate) {
  const english = nonEmptyString(question?.stem).trim()
  const chinese = nonEmptyString(entry?.stemTranslationZh)
  if (!english) return chinese ? `<p class="question-stem">${escapeHtml(chinese)}</p>` : ''
  const cueAt = locate?.by === 'stem' ? english.indexOf(locate.sourceText) : -1
  const stemHtml = cueAt < 0 ? escapeHtml(english)
    : `${escapeHtml(english.slice(0, cueAt))}<b class="locate-cue">${escapeHtml(locate.sourceText)}</b>${escapeHtml(english.slice(cueAt + locate.sourceText.length))}`
  return `<p class="question-stem question-stem--en" lang="en">${stemHtml}</p>${chinese
    ? `<p class="question-stem-zh">${escapeHtml(chinese)}</p>` : ''}`
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

// 正确选项 (Owner 2026-11-24): the correct option as printed, its translation
// in brackets. How it matches the passage (the same words, other words, a
// summary, two places put together, one step of inference) is the first
// sentence of the 讲解 below, in plain words, never a type label.
function renderCorrectOption(question, entry, answer, translation) {
  // A paper without option text falls back on the option words the analysis
  // matched to the passage.
  const english = (answerOptionText(question, answer) || array(entry?.locationParaphrases)
    .filter(relation => relation?.sourceRole === 'correctOption' && relation?.relationType === 'paraphrase')
    .map(relation => nonEmptyString(relation.sourceText)).find(Boolean) || '').trim()
  if (!english) return ''
  return `<p class="evidence-paraphrase"><span class="inline-label">正确选项</span><b>${escapeHtml(answer)} 项</b>${translation ? `（${escapeHtml(translation)}）` : ' '}<span lang="en">${escapeHtml(english)}</span></p>`
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
      renderReadingStem(question, entry, locate),
      locate ? renderDataLocate(locate, entry, question, group, correct?.evidence) : renderLocate(entry, question, group, correct?.evidence),
      locate?.by === 'stem' ? renderLocateQuote(locate, group, correct, underlineTexts) : renderEvidenceQuote(quotes, underlineTexts),
      renderCorrectOption(question, entry, answer, withoutClosingPunctuation(correct?.optionTranslationZh)),
      ...reasoning.map((item) => `<p class="analysis-prose">${renderProse(item, group)}</p>`),
      distractors.length > 0 ? `<div class="distractor distractor--reading"><div>${distractorRows(distractors).map((row) => `<p class="reading-distractor-item"><b>${row.map(item => escapeHtml(item.label)).join('、')} 项</b>${row.some(item => item.optionTranslationZh) ? `（${row.map(item => escapeHtml(item.optionTranslationZh || '')).join('；')}）` : ''}${renderTrapReason(row[0].trap, group)}</p>`).join('')}</div></div>` : '',
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
    ? '<p class="locate-legend"><b class="locate-cue">粗体</b>是定位词，<span class="source-underline">淡绿底</span>是答案所在</p>' : ''}
    ${renderReadingDiscourse(groupAnalysis.discourseStructure, group, groupAnalysis.overview)}
    ${renderFullTranslation(groupAnalysis, paperAsset, { answersInText: false })}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
