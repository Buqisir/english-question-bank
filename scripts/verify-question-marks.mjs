// One rule for every question number in a passage or translation
// (shared/analysis/questionMarks.mjs): answers bold with the number in front,
// clues underlined with the number after, one number per question per place.
import assert from 'node:assert/strict'
import { questionMarkRuns } from '../shared/analysis/questionMarks.mjs'

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
// Reading has no answers in the text: every clue keeps its number.
{
  const text = '洛杉矶公羊队对阵达拉斯牛仔队'
  const runs = questionMarkRuns(text, [clue(text, '洛杉矶公羊队对阵达拉斯牛仔队', ['21'])], { questionNo })
  assert.deepEqual(numbers(runs), ['<21'])
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
console.log('Question marks: same, overlap, touch, apart, shared clue, reading, answers-only and long-sentence cases PASS')
