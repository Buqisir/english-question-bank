#!/usr/bin/env node
// 定位 for reading questions (BUB-255): sentence split, the validator rules
// and the 定位补全 merge that must leave every other field untouched.
import assert from 'node:assert/strict'
import { validateReadingAnalysisShape } from '../server/paper-import-ai/analyzeReading.mjs'
import {
  bridgeUnits, mergeReadingLocate, passageSentences, resolveReadingLocate, withoutReadingLocate,
} from '../server/paper-import-ai/readingLocate.mjs'

let passed = 0
const ok = (name, fn) => {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

const P1 = 'Hereford has remained a lively market town since 1189. The Hereford Cathedral is the most impressive building in town. It’s also home to an ancient library. One of the four original copies of the Magna Carta is displayed there.'
const P2 = '“Plants are in fashion right now,” says Dr. Melinda Knuth, a researcher. When Mia opened her bakery, she expected few customers. But the opposite happened: the shop was full every morning.'
const group = {
  groupId: 'group-locate-reading-a',
  title: 'Reading A',
  paragraphs: [{ id: 'p1', text: P1 }, { id: 'p2', text: P2 }],
  questions: [
    { id: 'q1', stem: 'Where can you find an original copy of the Magna Carta?', options: { A: 'a', B: 'b', C: 'In Hereford Cathedral.', D: 'd' }, answerKey: 'C' },
    { id: 'q2', stem: 'Since when has Hereford been a market town?', options: { A: '1189.', B: 'b', C: 'c', D: 'd' }, answerKey: 'A' },
    { id: 'q3', stem: 'How was the bakery when it started?', options: { A: 'a', B: 'b', C: 'c', D: 'Busy.' }, answerKey: 'D' },
    { id: 'q4', stem: 'What can we learn from the text?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answerKey: 'B' },
  ],
}
const evidence = {
  q1: [{ paragraphId: 'p1', quote: 'The Hereford Cathedral is the most impressive building in town. It’s also home to an ancient library. One of the four original copies of the Magna Carta is displayed there.' }],
  q2: [{ paragraphId: 'p1', quote: 'Hereford has remained a lively market town since 1189.' }],
  q3: [{ paragraphId: 'p2', quote: 'But the opposite happened: the shop was full every morning.' }],
  q4: [{ paragraphId: 'p2', quote: 'says Dr. Melinda Knuth' }],
}
const locate = {
  q1: { locateBy: 'stem', locate: { sourceText: 'Magna Carta', targetText: 'One of the four original copies of the Magna Carta is displayed there.', targetParagraphId: 'p1', answerText: 'The Hereford Cathedral', bridgeZh: 'there 指前两句的 Hereford Cathedral', note: '题干 Magna Carta 原词出现在第 1 段。' } },
  q2: { locateBy: 'stem', locate: { sourceText: 'market town', targetText: 'Hereford has remained a lively market town since 1189.', targetParagraphId: 'p1', answerText: 'since 1189', note: '题干 market town 原词出现在第 1 段。' } },
  q3: { locateBy: 'stem', locate: { sourceText: 'started', targetText: 'When Mia opened her bakery, she expected few customers.', targetParagraphId: 'p2', targetCue: 'opened', answerText: 'the shop was full every morning', bridgeZh: 'But 转折，答案在后一句', note: '题干 started 对应原文 opened。' } },
  q4: { locateBy: 'options' },
}

function analysis() {
  return {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: 'paper-locate',
    sourceAssetVersion: 1,
    targetGroups: [group.groupId],
    meta: { generatedBy: 'external-ai', promptVersion: 'reading-choice-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [group.groupId]: { overview: '介绍集市小镇。' } },
    questions: Object.fromEntries(group.questions.map(question => [question.id, {
      skill: { primary: 'detail' },
      questionFocus: '找细节。',
      stemTranslationZh: '题干翻译',
      optionAnalysis: ['A', 'B', 'C', 'D'].map(label => label === question.answerKey
        ? { label, status: 'correct', evidence: evidence[question.id] }
        : { label, status: 'wrong', trap: { primaryType: 'unsupportedClaim', explanation: `${label} 项原文没有。` } }),
      locationParaphrases: [{ sourceText: question.options[question.answerKey], sourceRole: 'correctOption', targetText: evidence[question.id][0].quote, targetParagraphId: evidence[question.id][0].paragraphId, relationType: 'paraphrase', note: '对应原文。' }],
    }])),
  }
}

const paper = { paperId: 'paper-locate' }
const validate = (value, options = {}) => validateReadingAnalysisShape(value, { paper, group, ...options })
const located = () => mergeReadingLocate(analysis(), { questions: locate })
const tweak = (questionId, change) => {
  const value = located()
  change(value.questions[questionId], value.questions[questionId].locationParaphrases[0])
  return value
}

ok('sentences: "Dr." and a lower-case continuation stay in one sentence', () => {
  assert.deepEqual(passageSentences(P2).map(sentence => sentence.text.trim()), [
    '“Plants are in fashion right now,” says Dr. Melinda Knuth, a researcher.',
    'When Mia opened her bakery, she expected few customers.',
    'But the opposite happened: the shop was full every morning.',
  ])
  assert.equal(passageSentences('Don’t beat yourself up if one (or a few!) doesn’t make it. Try again.').length, 2)
})

ok('bridge length counts Chinese characters and English words once each', () => {
  assert.equal(bridgeUnits('there 指前两句的 Hereford Cathedral'), 8)
})

ok('a valid 定位 passes the validator, and an analysis without it still passes', () => {
  validate(located())
  validate(analysis())
})

ok('required 定位 rejects an analysis without locateBy', () => {
  assert.throws(() => validate(analysis(), { requireLocate: true }), /q1: locateBy 必须是/u)
  validate(located(), { requireLocate: true })
})

ok('same sentence vs context is computed from positions', () => {
  const paragraphs = new Map(group.paragraphs.map(paragraph => [paragraph.id, paragraph.text]))
  const resolve = questionId => resolveReadingLocate({
    entry: located().questions[questionId], stem: group.questions.find(q => q.id === questionId).stem, paragraphs, correctEvidence: evidence[questionId],
  }).locate
  assert.equal(resolve('q2').same, true)
  assert.equal(resolve('q1').same, false)
  assert.equal(P1.slice(resolve('q1').cue.start, resolve('q1').cue.end), 'Magna Carta')
  assert.equal(P2.slice(resolve('q3').cue.start, resolve('q3').cue.end), 'opened')
})

ok('the cue is matched as a whole word ("it" is not found inside "lit")', () => {
  const paragraph = 'He lit candles to make it seem warm.'
  const { locate: found } = resolveReadingLocate({
    entry: { locateBy: 'stem', locationParaphrases: [{ sourceRole: 'stem', relationType: 'locationCue', sourceText: 'it', targetText: paragraph, targetParagraphId: 'x', answerText: 'make it seem warm' }] },
    stem: 'What does the underlined word “it” refer to?',
    paragraphs: new Map([['x', paragraph]]),
    correctEvidence: [{ paragraphId: 'x', quote: paragraph }],
  })
  assert.equal(found.cue.start, paragraph.indexOf(' it ') + 1)
})

const rejects = [
  ['the whole stem as 定位词', 'q2', (entry, item) => { item.sourceText = 'Since when has Hereford been a market town?' }, /1–5 个英文词|整句题干/u],
  ['a 定位词 not copied from the stem', 'q2', (entry, item) => { item.sourceText = 'lively town' }, /从题干原样抄/u],
  ['a 定位句 that is part of a sentence', 'q2', (entry, item) => { item.targetText = 'a lively market town since 1189' }, /完整的一句/u],
  ['a 定位句 not in the passage', 'q2', (entry, item) => { item.targetText = 'Hereford is a market town.' }, /精确匹配原文/u],
  ['a bridge when the answer is in the 定位句', 'q2', (entry, item) => { item.bridgeZh = '答案就在这句' }, /不写 bridgeZh/u],
  ['no bridge when the answer is in the context', 'q1', (entry, item) => { delete item.bridgeZh }, /必须用 bridgeZh/u],
  ['different wording without targetCue', 'q3', (entry, item) => { delete item.targetCue }, /必须写 targetCue/u],
  ['an answerText outside the correct evidence', 'q2', (entry, item) => { item.answerText = 'the most impressive building' }, /落在正确项已有的原文依据/u],
  ['a stem locating item on an options question', 'q4', entry => { entry.locationParaphrases.unshift({ ...located().questions.q2.locationParaphrases[0] }) }, /locateBy=options 时不写/u],
  ['two stem locating items', 'q2', entry => { entry.locationParaphrases.push({ ...entry.locationParaphrases[0] }) }, /恰好有一项/u],
  ['a bridge longer than 25 units', 'q1', (entry, item) => { item.bridgeZh = 'there 指的是前面两句话里面提到的那座城里最引人注目的建筑 Hereford Cathedral 大教堂' }, /不超过 25 字/u],
]
for (const [name, questionId, change, pattern] of rejects) {
  ok(`validator rejects ${name}`, () => assert.throws(() => validate(tweak(questionId, change)), pattern))
}

ok('定位补全 changes nothing but 定位, and replaces an earlier stem locating item', () => {
  const before = analysis()
  before.questions.q2.locationParaphrases.push({ sourceText: 'Since when has Hereford been a market town?', sourceRole: 'stem', targetText: 'Hereford has remained a lively market town since 1189.', targetParagraphId: 'p1', relationType: 'locationCue', note: '旧定位' })
  const merged = mergeReadingLocate(before, { questions: locate })
  assert.equal(merged.questions.q2.locationParaphrases.filter(item => item.sourceRole === 'stem').length, 1)
  assert.equal(merged.questions.q2.locationParaphrases[0].sourceText, 'market town')
  assert.deepEqual(withoutReadingLocate(merged), withoutReadingLocate(before))
  assert.throws(() => mergeReadingLocate(before, { questions: { q2: { ...locate.q2, questionFocus: '改了' } } }), /只写 locateBy 和 locate/u)
  assert.throws(() => mergeReadingLocate(before, { questions: { q9: locate.q2 } }), /不存在的题/u)
})

console.log(`Reading 定位 verify PASSED: ${passed} checks`)
