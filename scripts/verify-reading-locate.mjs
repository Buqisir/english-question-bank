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
  q3: { locateBy: 'stem', locate: { sourceText: 'started', targetText: 'When Mia opened her bakery, she expected few customers.', targetParagraphId: 'p2', targetCue: 'opened', answerText: 'the shop was full every morning', bridgeZh: 'But 转折，实际情况和预期相反', note: '题干 started 对应原文 opened。' } },
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

ok('sentences: initials and reported speech stay in one sentence; quoted dialogue still splits', () => {
  const split = value => passageSentences(value).map(sentence => sentence.text.trim())
  assert.deepEqual(split('Curtin works in Washington, D. C., which recovers food. Last year it grew.'), [
    'Curtin works in Washington, D. C., which recovers food.', 'Last year it grew.',
  ])
  assert.deepEqual(split('The students would say, “That’s okay. Put it in the box.” Then they left.'), [
    'The students would say, “That’s okay. Put it in the box.”', 'Then they left.',
  ])
  assert.deepEqual(split('My friends shouted: “Safe! Safe! Safe!” And that mattered.'), [
    'My friends shouted: “Safe! Safe! Safe!”', 'And that mattered.',
  ])
  assert.deepEqual(split('“I am tired. Let us go.” She left. He took vitamin C. Then he slept.'), [
    '“I am tired.', 'Let us go.”', 'She left.', 'He took vitamin C.', 'Then he slept.',
  ])
  assert.deepEqual(split('He said, “Wait. I am coming.'), ['He said, “Wait.', 'I am coming.'])
  assert.deepEqual(split('Wendy said: “Residents really welcome the idea of the project. We look forward to it.”'), [
    'Wendy said: “Residents really welcome the idea of the project.', 'We look forward to it.”',
  ])
})

const resolveSentenceQuote = (paragraph, targetText, sourceText, answerText) => resolveReadingLocate({
  entry: { locateBy: 'stem', locationParaphrases: [{
    sourceRole: 'stem', relationType: 'locationCue', sourceText, targetText, targetParagraphId: 'p', answerText,
  }] },
  stem: `What does the passage say about ${sourceText}?`,
  paragraphs: new Map([['p', paragraph]]),
  correctEvidence: [{ paragraphId: 'p', quote: paragraph }],
})

ok('a full locate quote can cross consecutive initial breaks without changing sentence splits', () => {
  for (const [quote, pieces, cue, answer] of [
    ['They met Félix W. Ortiz on Friday.', ['They met Félix W.', 'Ortiz on Friday.'], 'Ortiz', 'on Friday'],
    ['John V. Atanasoff developed a computer.', ['John V.', 'Atanasoff developed a computer.'], 'Atanasoff', 'a computer'],
    ['They met John V. Smith B. Ortiz on Friday.', ['They met John V.', 'Smith B.', 'Ortiz on Friday.'], 'Ortiz', 'on Friday'],
  ]) {
    const paragraph = `It was sunny. ${quote} Everyone went home.`
    assert.deepEqual(passageSentences(paragraph).map(sentence => sentence.text.trim()), ['It was sunny.', ...pieces, 'Everyone went home.'])
    const { errors, locate: resolved } = resolveSentenceQuote(paragraph, quote, cue, answer)
    assert.deepEqual(errors, [])
    assert.equal(resolved.sentence.index, 1)
    assert.equal(paragraph.slice(resolved.sentence.start, resolved.sentence.end).trim(), quote)
    assert.equal(paragraph.slice(resolved.cue.start, resolved.cue.end), cue)
    assert.equal(resolved.same, true)
    assert.match(resolveSentenceQuote(paragraph, `${quote} Everyone went home.`, cue, answer).errors[0], /完整的一句/u)
  }
})

ok('a locate quote across initial fragments preserves double spaces and permits omitted outer quotes', () => {
  const quote = 'They met Félix W.  Ortiz on Friday.'
  const paragraph = `It was sunny. “${quote}” Everyone went home.`
  const { errors, locate } = resolveSentenceQuote(paragraph, quote, 'Ortiz', 'on Friday')
  assert.deepEqual(errors, [])
  assert.equal(paragraph.slice(locate.sentence.start, locate.sentence.end).trim(), `“${quote}”`)
  assert.equal(paragraph.slice(locate.cue.start, locate.cue.end), 'Ortiz')
})

ok('single locate quotes remain valid next to Roman numerals, plans and room labels', () => {
  for (const [first, firstCue, second, secondCue] of [
    ['She served in World War I.', 'World War I', 'Her letters survived.', 'letters'],
    ['Plan B.', 'Plan B', 'It worked.', 'worked'],
    ['We met in Room B.', 'Room B', 'The meeting began at noon.', 'meeting'],
  ]) {
    const paragraph = `${first} ${second}`
    assert.deepEqual(passageSentences(paragraph).map(sentence => sentence.text.trim()), [first, second])
    assert.deepEqual(resolveSentenceQuote(paragraph, first, firstCue, firstCue).errors, [])
    assert.deepEqual(resolveSentenceQuote(paragraph, second, secondCue, secondCue).errors, [])
  }
})

ok('a no-break space in the passage matches a plain space in the stem words and in a copied sentence', () => {
  const paragraphs = new Map([['p', 'Take\u00a0a view of the hills. It is quiet.']])
  const entry = { locateBy: 'stem', locationParaphrases: [{ sourceText: 'Take a view', sourceRole: 'stem', relationType: 'locationCue', targetText: 'Take\u00a0a view of the hills.', targetParagraphId: 'p', answerText: 'of the hills', note: '原词' }] }
  const result = resolveReadingLocate({ entry, stem: 'Why Take a view here?', paragraphs, correctEvidence: [{ paragraphId: 'p', quote: 'Take\u00a0a view of the hills.' }] })
  assert.deepEqual(result.errors, [])
  const typed = structuredClone(entry)
  typed.locationParaphrases[0].targetText = 'Take a view of the hills.'
  typed.locationParaphrases[0].answerText = 'of the hills'
  const plainResult = resolveReadingLocate({ entry: typed, stem: 'Why Take a view here?', paragraphs, correctEvidence: [{ paragraphId: 'p', quote: 'Take\u00a0a view of the hills.' }] })
  assert.deepEqual(plainResult.errors, [])
  assert.equal(plainResult.locate.sentence.start, 0)
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
  assert.equal(resolve('q3').cue.text, 'opened')
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

ok('chart guard: a number the passage never writes needs a number in answerText, and runs only when options are passed', () => {
  const stem = 'How many members did the club have?'
  const options = [{ label: 'A', text: '40.' }, { label: 'B', text: '55.' }]
  const check = (passage, answerText) => {
    const entry = { locateBy: 'stem', locationParaphrases: [{ sourceRole: 'stem', relationType: 'locationCue', sourceText: 'club', targetText: passage, targetParagraphId: 'p', answerText }] }
    const base = { entry, stem, paragraphs: new Map([['p', passage]]), correctEvidence: [{ paragraphId: 'p', quote: passage }] }
    return { guarded: resolveReadingLocate({ ...base, options, answer: 'B' }).errors, plain: resolveReadingLocate(base).errors }
  }
  const chart = check('The club grew fast that year.', 'The club grew fast')
  assert.match(chart.guarded[0] ?? '', /答案多半在图表里/u)
  assert.deepEqual(chart.plain, [])
  assert.deepEqual(check('The club grew to fifty-five members.', 'fifty-five members').guarded, [])
  assert.deepEqual(check('The club had 55 members.', 'The club had 55 members').guarded, [])
})

ok('bridge guard: bridgeZh may not echo an English word that only a wrong option uses', () => {
  const passage = 'Tom asked many questions. In the end he found the answer himself.'
  const options = { A: 'He asked his teacher.', B: 'He solved it alone.' }
  const resolve = bridgeZh => resolveReadingLocate({
    entry: { locateBy: 'stem', locationParaphrases: [{ sourceRole: 'stem', relationType: 'locationCue', sourceText: 'Tom', targetText: 'Tom asked many questions.', targetParagraphId: 'p', answerText: 'he found the answer himself', bridgeZh }] },
    stem: 'What did Tom do at last?', paragraphs: new Map([['p', passage]]),
    correctEvidence: [{ paragraphId: 'p', quote: 'In the end he found the answer himself.' }], options, answer: 'B',
  }).errors
  assert.match(resolve('下一句说 teacher 没帮上')[0] ?? '', /teacher 只出现在错项里/u)
  assert.deepEqual(resolve('下一句 himself 说他自己找到答案'), [])
})

const rejects = [
  ['the whole stem as 定位词', 'q2', (entry, item) => { item.sourceText = 'Since when has Hereford been a market town?' }, /1–5 个英文词|整句题干/u],
  ['a 定位词 not copied from the stem', 'q2', (entry, item) => { item.sourceText = 'lively town' }, /从题干原样抄/u],
  ['a 定位句 that is part of a sentence', 'q2', (entry, item) => { item.targetText = 'a lively market town since 1189' }, /完整的一句/u],
  ['a 定位句 not in the passage', 'q2', (entry, item) => { item.targetText = 'Hereford is a market town.' }, /精确匹配原文/u],
  ['a bridge when the answer is in the 定位句', 'q2', (entry, item) => { item.bridgeZh = '答案就在这句' }, /不写 bridgeZh/u],
  ['no bridge when the answer is in the context', 'q1', (entry, item) => { delete item.bridgeZh }, /必须用 bridgeZh/u],
  ['different wording without targetCue', 'q3', (entry, item) => { delete item.targetCue }, /必须写 targetCue/u],
  ['a targetCue longer than 5 words', 'q3', (entry, item) => { item.targetCue = 'When Mia opened her bakery, she' }, /targetCue 必须是 1–5 个英文词/u],
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
  assert.throws(() => mergeReadingLocate(before, { questions: { q2: { ...locate.q2, questionFocus: '改了' } } }), /只写 locateBy、locate 和 findZh/u)
  assert.throws(() => mergeReadingLocate(before, { questions: { q9: locate.q2 } }), /不存在的题/u)
})

ok('找法 findZh: merged as locateFindZh, sits beside the bridge, short, one signal word, names paragraphs only as [[id]]', () => {
  const paragraphs = new Map([['p1', P1], ['p2', P2]])
  const resolve = (questionId, findZh, change = () => {}) => {
    const response = { [questionId]: structuredClone({ ...locate[questionId], findZh }) }
    change(response[questionId])
    const entry = mergeReadingLocate(analysis(), { questions: response }).questions[questionId]
    const question = group.questions.find(item => item.id === questionId)
    return resolveReadingLocate({ entry, stem: question.stem, paragraphs, correctEvidence: evidence[questionId], options: question.options, answer: question.answerKey })
  }
  const merged = mergeReadingLocate(analysis(), { questions: { q4: { locateBy: 'options', findZh: '逐项回原文对' } } })
  assert.equal(merged.questions.q4.locateFindZh, '逐项回原文对')
  assert.equal(withoutReadingLocate(merged).questions.q4.locateFindZh, undefined)
  const noBridge = r => { delete r.locate.bridgeZh }
  assert.deepEqual(resolve('q3', '往后读，看 But 后').errors, [])
  assert.equal(resolve('q3', '看[[p2]]的 But 后').locate.find, '看[[p2]]的 But 后')
  assert.match(resolve('q3', '看 But 后', noBridge).errors[0], /必须用 bridgeZh/u)
  assert.match(resolve('q3', '', noBridge).errors[0], /必须用 bridgeZh/u)
  assert.match(resolve('q3', '').errors[0], /往哪走、找什么/u)
  assert.match(resolve('q3', '看 But 后的 the shop was empty').errors[0], /英文最多/u)
  assert.match(resolve('q3', '往后读两句再看转折之后的实际情况是什么').errors[0], /不超过 16 字/u)
  assert.match(resolve('q3', '看第 2 段 But 后').errors[0], /不自己数段/u)
  assert.match(resolve('q3', '看[[p9]]的 But 后').errors[0], /不是这篇的段落/u)
  assert.match(resolve('q4', '').errors[0], /不能是空的/u)
  assert.deepEqual(resolve('q4', '逐项回[[p1]]和[[p2]]核对').errors, [])
  // Checking the options and whole-text questions get more room than one move from the stem.
  assert.deepEqual(resolve('q4', '四个说法各带人名回原文，看谁的话里写着 market town').errors, [])
  assert.match(resolve('q4', '四个说法各带一个人名回原文，逐个看谁的原话里写着 market town 和 since').errors[0], /locateBy=options 时 findZh 不超过 24 字|英文最多 3 个词/u)
  const passage = (findZh) => resolve('q4', findZh, entry => { entry.locateBy = 'passage' })
  assert.deepEqual(passage('[[p1]]写小镇从 1189 年起就是 market town，[[p2]] Dr. Melinda Knuth 讲它今天的样子；问能学到什么，就要盖住这一前一后').errors, [])
  assert.match(passage('看全文'.repeat(17)).errors[0], /locateBy=passage 时 findZh 不超过 48 字/u)
  assert.match(passage('[[p1]] one two three four five six seven eight nine').errors[0], /locateBy=passage 时 findZh 里英文最多 8 个词/u)
})

ok('strict prose (Owner 2026-11-24): glosses on a changed 定位词, marks instead of counting, no filler verdicts', () => {
  const strict = value => validate(value, { strictProse: true })
  const glossed = () => tweak('q3', (_, item) => { item.sourceZh = '开始'; item.targetCueZh = '开张' })
  assert.throws(() => strict(located()), /sourceZh 写定位词在题干里的意思/u, 'a changed 定位词 needs both glosses')
  strict(glossed())
  validate(located())
  assert.throws(() => validate(tweak('q1', (_, item) => { item.sourceZh = '大宪章' })), /写法相同时不写/u, 'the same words carry no gloss')
  assert.throws(() => validate(tweak('q3', (_, item) => { item.sourceZh = 'start'; item.targetCueZh = '开张' })), /只写中文/u)
  const prose = (note, trap) => {
    const value = glossed()
    if (note !== undefined) value.questions.q3.locationParaphrases.at(-1).note = note
    if (trap !== undefined) value.questions.q3.optionAnalysis[0].trap.explanation = trap
    return value
  }
  strict(prose('[[p2|expected few customers]]说她不抱希望，[[p2]]后面写店里天天满。'))
  assert.throws(() => strict(prose('第 2 段第 2 句说她不抱希望。')), /不自己数段数句/u)
  assert.throws(() => strict(prose('首句说她不抱希望。')), /不自己数段数句/u)
  assert.throws(() => strict(prose(undefined, '代进去读不通。')), /「读不通」这类空话/u)
  assert.throws(() => strict(prose('[[p2|no such words]]说她不抱希望。')), /原样抄，不跨句/u)
  assert.throws(() => validate(prose('[[p9]]说她不抱希望。')), /不是这篇的段落/u, 'marks are checked on every analysis')
  validate(prose('第 2 段说她不抱希望，代进去读不通。'))
})

console.log(`Reading 定位 verify PASSED: ${passed} checks`)
