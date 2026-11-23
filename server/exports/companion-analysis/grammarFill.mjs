import { renderFullTranslation, renderGroupHeading, renderHeadingLead, renderOverview, renderQuestionHeader, renderQuestionLead, renderMarkedRun, renderSelectedLongSentences, mergedSourceParagraphs } from './blocks.mjs'
import { rangesInPiece } from '../../../shared/analysis/questionMarks.mjs'
import { grammarTopic } from './grammarTopic.mjs'
import { answerData, questionData } from './paper.mjs'
import { array, escapeHtml, nonEmptyString } from './text.mjs'

// The sentence around code points [start, end): back to the end of the
// previous sentence, on to the end of this one. A sentence ends at . ? !
// (plus closing quotes or brackets) before a space and a word that does not
// start in lower case, so "Mr. Li" and "a T.V. repairman" do not split.
function sentenceAround(points, start, end) {
  const closing = /["'”’)）]/u
  const space = /\s/u
  const stops = [0]
  points.forEach((point, index) => {
    if (!/[.?!。？！]/u.test(point)) return
    let after = index + 1
    while (after < points.length && closing.test(points[after])) after += 1
    if (after < points.length && !space.test(points[after])) return
    let next = after
    while (next < points.length && space.test(points[next])) next += 1
    if (next < points.length && /\p{Ll}/u.test(points[next])) return
    stops.push(after)
  })
  stops.push(points.length)
  let from = Math.max(...stops.filter((stop) => stop <= start))
  while (from < start && space.test(points[from])) from += 1
  return [from, Math.min(...stops.filter((stop) => stop >= end))]
}

// Clue sentences next to the answer's are taken in, so a clue a sentence
// away still shows; one further off is left to the explanation.
const SENTENCE_LIMIT = 360

// One line per question: the sentence with every blank filled, only this
// question's answer ([n], bold) and its clues (tint and superscript) marked,
// by the shared rule. The passage itself is not reprinted: this line is where
// the question is answered.
function completedSentence(merged, questionId, paperAsset) {
  for (const paragraph of merged) {
    const own = paragraph.ranges.filter(({ annotation }) =>
      annotation.kind !== 'sentence-structure' && array(annotation.questionIds).includes(questionId))
    const answer = own.find(({ annotation }) => annotation.kind === 'answer-insertion')
    if (!answer) continue
    const points = Array.from(paragraph.text)
    let [from, to] = sentenceAround(points, answer.start, answer.end)
    for (const clue of own) {
      if (clue.start >= from && clue.end <= to) continue
      const [clueFrom, clueTo] = sentenceAround(points, clue.start, clue.end)
      const wider = [Math.min(from, clueFrom), Math.max(to, clueTo)]
      if (wider[1] - wider[0] <= SENTENCE_LIMIT) [from, to] = wider
    }
    const ranges = rangesInPiece(paragraph.text, own.map((range) => ({
      ...range, annotation: { ...range.annotation, questionIds: [questionId] },
    })), from, to)
    const questionNo = (id) => questionData(paperAsset, id)?.questionNo
    const html = renderMarkedRun(points.slice(from, to).join(''), ranges, questionNo, 'source-relationship')
    return `<p class="question-stem question-stem--en" lang="en">${html}</p>`
  }
  return ''
}

export function renderGrammarFillGroup({ group, title, paperAsset, analysis, answers, openingHeadings }) {
  const groupAnalysis = analysis?.groups?.[group.groupId] || {}
  const merged = mergedSourceParagraphs(groupAnalysis, group)
  const questions = array(group.questionIds).map((questionId) => {
    const question = questionData(paperAsset, questionId)
    const authoritativeAnswer = answerData(paperAsset, questionId)?.answer
    const entry = analysis?.blanks?.[questionId]
    const answer = nonEmptyString(authoritativeAnswer)
    if (!question || !answer || !entry) return ''
    const hint = nonEmptyString(entry.hint)
    const topic = grammarTopic(entry)
    return `<section class="question question--grammar">
      ${renderQuestionLead(renderQuestionHeader(question.questionNo, answer, hint ? `提示词 ${hint}` : ''),
        (topic ? `<p class="grammar-topic"><span class="inline-label">考点</span>${escapeHtml(topic)}</p>` : '')
          + completedSentence(merged, questionId, paperAsset)
          + (entry.reason ? `<p class="analysis-prose">${escapeHtml(entry.reason)}</p>` : ''))}
    </section>`
  }).join('')
  return `<section class="analysis-group analysis-group--grammar">
    ${renderHeadingLead(openingHeadings + renderGroupHeading(title || group.title || '语法填空', answers), renderOverview(groupAnalysis.overview))}
    ${renderFullTranslation(groupAnalysis, paperAsset, { clues: false })}
    ${questions}
    ${renderSelectedLongSentences(groupAnalysis.selectedLongSentences, paperAsset)}
  </section>`
}
