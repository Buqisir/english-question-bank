import { partitionAnalysisText } from './analysisTextRanges.mjs'

// Where a question number goes in a passage or its translation. One rule for
// every objective type, on paper (the companion PDF) and on screen (the
// teaching panels). The bracketed number comes first: it tells the reader
// where each question is answered.
// - an answer (answer-insertion) is bold, with its number in brackets in
//   front, where the exam paper had the blank: "[41] realization". The big
//   number says "question 41 is answered here";
// - where the text holds no answers (reading, listening: the answer is an
//   option letter), the clue is where the question is answered, so it takes
//   the bracketed number in front instead, on the pale tint
//   (`answersInText: false`);
// - a clue (answer-evidence) sits on a pale tint, with a plain superscript
//   number after its last character. The small number says "this is the
//   evidence for question 38";
// - one number per question in one place: a clue that is exactly its own
//   answer is not drawn (the answer already says it); a clue that overlaps its
//   answer, or touches it with only spaces and punctuation between, keeps its
//   tint but not its number ("41 很快意识到 41" and "stories.³⁶ 36 In
//   short" printed one question twice);
// - long-sentence marks (sentence-structure) are not drawn: 长难句解析 quotes
//   the sentence with its own 关联题目.
// `clues: false` leaves clues out altogether. Grammar fill uses it for the
// translation: its clues are English form (plenty of → plural), which Chinese
// does not show, and the data mostly anchors them to the answer's own words.

const BETWEEN_TOUCHING = /^[\s\p{P}]*$/u
const CJK_CLOSING = /[。，、；：！？）」』”’]/u

// Where a clue's number attaches: to its last character, so a line never
// starts with a bare number, and in Chinese before closing punctuation, as
// citation marks do (GB/T 7714): 一座岛²²。 not 一座岛。²²
// Returns [text before the last character, the last character, what follows].
export function splitClueTail(text) {
  const points = Array.from(text)
  let tailAt = points.length - 1
  while (tailAt > 0 && CJK_CLOSING.test(points[tailAt])) tailAt -= 1
  return [points.slice(0, tailAt).join(''), points[tailAt] ?? '', points.slice(tailAt + 1).join('')]
}

function relation(points, clue, answer) {
  if (clue.start === answer.start && clue.end === answer.end) return 'same'
  if (clue.start < answer.end && answer.start < clue.end) return 'near'
  const gap = clue.end <= answer.start
    ? points.slice(clue.end, answer.start)
    : points.slice(answer.end, clue.start)
  return BETWEEN_TOUCHING.test(gap.join('')) ? 'near' : 'apart'
}

// ranges: [{ start, end, quote, annotation: { kind, questionIds, annotationId } }]
// questionNo: questionId → printed number (string), or undefined.
// Returns the text cut into runs; each run says what to draw on it.
export function questionMarkRuns(text, ranges, { questionNo = () => undefined, clues = true, answersInText = true } = {}) {
  const points = Array.from(text)
  // Anything that is neither an answer nor a long-sentence mark is a clue.
  const drawable = ranges.filter(({ annotation }) => annotation.kind === 'answer-insertion'
    || (clues && annotation.kind !== 'sentence-structure'))
  const answers = drawable.filter(({ annotation }) => annotation.kind === 'answer-insertion')
  const shown = []
  for (const range of drawable) {
    const questionIds = range.annotation.questionIds ?? []
    if (range.annotation.kind === 'answer-insertion') {
      shown.push({ ...range, front: questionIds, numbered: [] })
      continue
    }
    if (!answersInText) {
      shown.push({ ...range, front: questionIds, numbered: [] })
      continue
    }
    const kept = []
    const numbered = []
    for (const questionId of questionIds) {
      const own = answers.filter(({ annotation }) => (annotation.questionIds ?? []).includes(questionId))
      const relations = own.map((answer) => relation(points, range, answer))
      if (relations.includes('same')) continue
      kept.push(questionId)
      if (!relations.includes('near')) numbered.push(questionId)
    }
    if (kept.length > 0) shown.push({ ...range, front: [], numbered })
  }
  const numbersOf = (list, key) => [...new Set(list.flatMap((range) =>
    range[key].map(questionNo).filter(Boolean)))]
    .sort((a, b) => Number(a) - Number(b))
  return partitionAnalysisText(text, shown.map(({ start, end, quote }) => ({ start, end, quote })))
    .map((part) => {
      const on = part.rangeIndices.map((index) => shown[index])
      const answer = on.filter(({ annotation }) => annotation.kind === 'answer-insertion')
      const clue = on.filter(({ annotation }) => annotation.kind !== 'answer-insertion')
      return {
        text: part.text,
        start: part.start,
        end: part.end,
        answer: answer.length > 0,
        clue: clue.length > 0,
        // bracketed number where an answer (or, with no answers in the text,
        // a clue) starts
        before: numbersOf(on.filter((range) => range.start === part.start), 'front'),
        // plain number after a clue, where that clue ends
        after: numbersOf(clue.filter((range) => range.end === part.end), 'numbered'),
        annotationIds: [...new Set(on.map(({ annotation }) => annotation.annotationId).filter(Boolean))],
        kinds: [...new Set(on.map(({ annotation }) => annotation.kind))],
        questionNos: [...new Set(on.flatMap(({ annotation }) => (annotation.questionIds ?? [])
          .map(questionNo).filter(Boolean)))].sort((a, b) => Number(a) - Number(b)),
      }
    })
}

// Listening has no annotation ranges, only each question's verbatim quote.
// quotes: [{ quote, questionIds }] → ranges on `text` (code points) at each
// quote's first occurrence; a quote that is not in the text is skipped.
export function quoteRanges(text, quotes) {
  return quotes.flatMap(({ quote, questionIds }) => {
    const index = quote ? text.indexOf(quote) : -1
    if (index < 0) return []
    const start = Array.from(text.slice(0, index)).length
    return [{ start, end: start + Array.from(quote).length, quote,
      annotation: { kind: 'answer-evidence', questionIds } }]
  })
}

// The ranges of a whole text that fall in one piece of it (a line, a spoken
// sentence), [from, to) in code points, shifted to the piece. A quote that
// runs on from an earlier piece keeps its tint there but not its number: the
// number goes once, where the quote starts.
export function rangesInPiece(text, ranges, from, to) {
  const points = Array.from(text)
  return ranges.flatMap((range) => {
    const start = Math.max(range.start, from)
    const end = Math.min(range.end, to)
    if (start >= end) return []
    return [{ start: start - from, end: end - from, quote: points.slice(start, end).join(''),
      annotation: { ...range.annotation, questionIds: range.start >= from ? range.annotation.questionIds : [] } }]
  })
}
