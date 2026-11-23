// One rule for every question number in a passage or translation
// (shared/analysis/questionMarks.mjs): answers bold with the number in front,
// clues tinted with the number after, one number per question per place.
import assert from 'node:assert/strict'
import { questionMarkRuns, quoteRanges, rangesInPiece } from '../shared/analysis/questionMarks.mjs'

const at = (text, quote, from = 0) => {
  const index = text.indexOf(quote, from)
  assert.ok(index >= 0, quote)
  const start = Array.from(text.slice(0, index)).length
  return { start, end: start + Array.from(quote).length, quote }
}
const answer = (text, quote, id) => ({ ...at(text, quote), annotation: { kind: 'answer-insertion', questionIds: [id], annotationId: `i${id}` } })
const clue = (text, quote, ids) => ({ ...at(text, quote), annotation: { kind: 'answer-evidence', questionIds: ids, annotationId: `e${ids.join('-')}` } })
const questionNo = (id) => id
const numbers = (runs) => runs.flatMap((run) => [...run.before.map((n) => `${n}>`), ...run.after.map((n) => `<${n}`)])

// Same span as its answer: drawn once, as the answer.
{
  const text = '我很快意识到大家不了解'
  const runs = questionMarkRuns(text, [clue(text, '很快意识到', ['41']), answer(text, '很快意识到', '41')], { questionNo })
  assert.deepEqual(numbers(runs), ['41>'])
  assert.equal(runs.find((run) => run.text === '很快意识到').clue, false)
}
// Overlapping its answer: underlined, no second number.
{
  const text = '这里没有雾霾，还有蓝天'
  const runs = questionMarkRuns(text, [clue(text, '没有雾霾', ['63']), answer(text, '没有', '63')], { questionNo })
  assert.deepEqual(numbers(runs), ['63>'])
  assert.ok(runs.some((run) => run.text === '雾霾' && run.clue))
}
// Touching its answer, only punctuation and spaces between: no second number.
{
  const text = 'revealing hidden stories. In short, AI is redefining the museum.'
  const runs = questionMarkRuns(text, [clue(text, 'revealing hidden stories', ['36']), answer(text, 'In short, AI is redefining the museum.', '36')], { questionNo })
  assert.deepEqual(numbers(runs), ['36>'])
}
// Apart from its answer: keeps its own number, after its last character.
{
  const text = 'AI can spot the slightest damage. Experts agree. This allows timely repair.'
  const runs = questionMarkRuns(text, [clue(text, 'AI can spot the slightest damage', ['38']), answer(text, 'This allows timely repair.', '38')], { questionNo })
  assert.deepEqual(numbers(runs), ['<38', '38>'])
  assert.equal(runs.find((run) => run.after.length).text, 'AI can spot the slightest damage')
}
// A clue for two questions: only the question whose answer it touches loses
// its number; the other keeps it.
{
  const text = 'the dates and frequency vary'
  const runs = questionMarkRuns(text, [clue(text, 'the dates and', ['57', '58']), answer(text, 'frequency', '57')], { questionNo })
  assert.deepEqual(numbers(runs), ['<58', '57>'])
}
// Reading and listening have no answers in the text (the answer is an option
// letter): the clue is where the question is answered, so its number goes in
// front, bracketed like an answer's, and the clue is not bold.
{
  const text = '比赛有：洛杉矶公羊队对阵达拉斯牛仔队，还有别的。'
  const runs = questionMarkRuns(text, [clue(text, '洛杉矶公羊队对阵达拉斯牛仔队', ['21', '22'])], { questionNo, answersInText: false })
  assert.deepEqual(numbers(runs), ['21>', '22>'])
  const marked = runs.find((run) => run.clue)
  assert.equal(marked.text, '洛杉矶公羊队对阵达拉斯牛仔队')
  assert.equal(marked.answer, false)
}
// Listening marks each question's verbatim quote; one that runs over two
// lines (or spoken sentences) is numbered once, where it starts.
{
  const text = 'W: Would you like a menu?\nM: Yes. Email it to me.\nW: Fine.'
  const ranges = quoteRanges(text, [
    { quote: 'Would you like a menu?\nM: Yes.', questionIds: ['10'] },
    { quote: 'not in the transcript', questionIds: ['11'] },
  ])
  assert.equal(ranges.length, 1)
  const lines = text.split('\n')
  let from = 0
  const perLine = lines.map((line) => {
    const runs = questionMarkRuns(line, rangesInPiece(text, ranges, from, from + Array.from(line).length), { questionNo, answersInText: false })
    from += Array.from(line).length + 1
    return runs
  })
  assert.deepEqual(perLine.map(numbers), [['10>'], [], []])
  assert.deepEqual(perLine.map((runs) => runs.filter((run) => run.clue).map((run) => run.text)),
    [['Would you like a menu?'], ['M: Yes.'], []])
}
// clues: false (grammar-fill translation) draws the answers only.
{
  const text = '在这里竹子野生野长，集中供暖也没有'
  const runs = questionMarkRuns(text, [clue(text, '竹子野生野长', ['56']), answer(text, '在这里', '56'), clue(text, '供暖', ['57']), answer(text, '集中', '57')], { questionNo, clues: false })
  assert.deepEqual(numbers(runs), ['56>', '57>'])
  assert.ok(runs.every((run) => !run.clue))
}
// Long-sentence marks are never drawn.
{
  const text = 'A long sentence.'
  const runs = questionMarkRuns(text, [{ ...at(text, 'A long sentence.'), annotation: { kind: 'sentence-structure', questionIds: ['56'] } }], { questionNo })
  assert.deepEqual(runs.map((run) => [run.answer, run.clue]), [[false, false]])
}
console.log('Question marks: same, overlap, touch, apart, shared clue, reading, listening quote, answers-only and long-sentence cases PASS')
