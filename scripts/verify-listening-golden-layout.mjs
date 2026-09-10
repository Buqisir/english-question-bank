import assert from 'node:assert/strict'
import { layoutListeningOptionSet } from '../shared/paper-canonical/abcdLayout.mjs'
import {
  listeningOpening,
  listeningSegmentCue,
  ownsCompletePaperOpening,
  projectListeningGroupPresentation,
} from '../shared/paper-canonical/listeningPresentation.mjs'

const options = (texts) => texts.map((text, index) => ({
  optionId: `o${index}`,
  label: 'ABC'[index],
  content: [{ kind: 'text', nodeId: `n${index}`, text }],
}))
assert.equal(layoutListeningOptionSet({ owner: 'question', options: options(['£1', '£2', '£3']) }).mode, 'three_columns')
assert.equal(layoutListeningOptionSet({
  owner: 'question',
  options: options(['short', 'This deliberately long option makes the complete A-C set vertical.', 'short']),
}).mode, 'one_column')

const segments = [
  { segmentId: 's6', questionIds: ['legacy-question-six', 'legacy-question-eight', 'legacy-question-nine'] },
]
const segmentQuestions = [
  { questionId: 'legacy-question-six', questionNo: 6 },
  { questionId: 'legacy-question-eight', questionNo: 8 },
  { questionId: 'legacy-question-nine', questionNo: 9 },
]
assert.equal(listeningSegmentCue(segments[0], 6, segmentQuestions), '听第6段材料，回答第6、8、9题。')
assert.equal(listeningSegmentCue({
  segmentId: 's7',
  questionIds: ['q-nine', 'q-ten', 'q-eleven'],
}, 7, [
  { questionId: 'q-nine', questionNo: 9 },
  { questionId: 'q-ten', questionNo: 10 },
  { questionId: 'q-eleven', questionNo: 11 },
]), '听第7段材料，回答第9至11题。')
const shortGroup = {
  groupType: 'listening', firstSectionPlayback: 'twice_default',
  questions: [{ questionId: 'q1', questionNo: 1 }], segments: [],
}
const twice = projectListeningGroupPresentation(shortGroup)
assert.match(twice.instruction, /每段录音播放两遍/)
assert.doesNotMatch(twice.instruction, /仅读一遍/)
const historicalNoField = projectListeningGroupPresentation({
  groupType: 'listening', questions: shortGroup.questions, segments: [],
})
assert.match(historicalNoField.instruction, /每段录音播放两遍/)
assert.equal(twice.example.answer, 'C')
assert.equal(twice.example.options.length, 3)
const once = projectListeningGroupPresentation({ ...shortGroup, firstSectionPlayback: 'once_explicit' })
assert.match(once.instruction, /仅读一遍/)
assert.equal(projectListeningGroupPresentation({
  groupType: 'listening', firstSectionPlayback: 'twice_default',
  questions: segmentQuestions, segments,
}).example, null)

const slots = [
  ['listening.short-dialogue', 'short'], ['listening.long-form', 'long'],
  ['reading.a', 'reading-a'], ['reading.b', 'reading-b'], ['reading.c', 'reading-c'],
  ['reading.d', 'reading-d'], ['reading.seven-choices', 'seven'], ['language.cloze', 'cloze'],
  ['language.grammar-fill', 'grammar'], ['writing.application', 'application'],
  ['writing.continuation', 'continuation'],
]
const consumption = { paperId: 'paper-gold', selections: slots.map(([slotId, groupId]) => ({
  familyContractId: slotId.split('.')[0], mode: 'canonical', groupIds: [groupId],
  projectedOccurrences: [{ kind: 'group', paperId: 'paper-gold', slotId, groupId }],
})) }
const completeIds = slots.map(([, groupId]) => groupId)
assert.equal(ownsCompletePaperOpening(consumption, completeIds), true)
assert.equal(ownsCompletePaperOpening(consumption, completeIds.slice(2)), true)
assert.equal(ownsCompletePaperOpening(consumption, [...completeIds, 'extra']), false)
assert.equal(ownsCompletePaperOpening({
  ...consumption, selections: [...consumption.selections].reverse(),
}, completeIds), true, 'family selection order is not visible group order')
assert.equal(ownsCompletePaperOpening(consumption, completeIds.slice(0, 3)), false)
const mixedSource = structuredClone(consumption)
mixedSource.selections.at(-1).projectedOccurrences[0].paperId = 'paper-other'
assert.equal(ownsCompletePaperOpening(mixedSource, completeIds), false)
assert.equal(ownsCompletePaperOpening(consumption, [...completeIds.slice(0, 8), completeIds[9], completeIds[8], completeIds[10]]), false)
const noListening = { ...consumption, selections: consumption.selections.slice(2) }
assert.equal(ownsCompletePaperOpening(noListening, completeIds.slice(2)), true)
assert.equal(completeIds.slice(2).length, 9)
const partial = { ...consumption, selections: consumption.selections.slice(0, 3) }
assert.equal(ownsCompletePaperOpening(partial, completeIds.slice(0, 3)), false)
assert.equal(listeningOpening.notices.length, 3)
assert.equal(listeningOpening.notices[1].startsWith('回答选择题时'), true)
assert.doesNotMatch(JSON.stringify(listeningOpening), /150分|120分钟|听力部分结束前/)
assert.doesNotMatch(JSON.stringify(listeningOpening), /transcript|correctOptionId|准考证号：\S/)
console.log('PASS listening golden layout presentation and measured A-C policy')
