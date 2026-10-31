import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { checkWritingRoleFixture, writingOwnershipChecks } from './ocr-writing-ownership-test-helpers.mjs'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { LINE_ROLE_RULES, firstLineRole, matchesLineRole, inlineSampleParts } from './ocr-line-roles.mjs'
import { referenceLineBoundary } from './ocr-proofread.mjs'
import { sourceReferenceScoringScopes } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'

function scoringScopes(texts) {
  checkWritingRoleFixture(texts)
  return sourceReferenceScoringScopes({ documents: [{ documentId: 'answers', pages: [{
    orderedItems: texts.map((text, index) => ({ itemId: `item-${index}`, text })),
  }] }] }, new Set(['answers']))
}

test('explanation dividers use a whole matching view and preserve existing explanation prefixes', () => {
  for (const text of ['解析', '答案解析', '【解析】', '【答案解析】']) {
    for (const suffix of ['', ':', '：']) {
      const original = `　${text}${suffix}　`
      const facts = computeLineFacts({ text: original })
      assert(matchesLineRole('writing.explanations', facts, { sectionCount: 1 }), original)
      assert.equal(facts.text, original)
      assert(!matchesLineRole('writing.explanations', facts, { sectionCount: 0 }))
    }
  }
  for (const text of ['解析如下这篇范文…', '【解析】内容另见下文', '【答案补充】',
    '参考范文解析', '解 析', '【答案 解析】']) {
    assert(!matchesLineRole('writing.explanations', computeLineFacts({ text }), { sectionCount: 1 }), text)
  }
  for (const text of ['答案详解', '参考答案详解', '试题解析', '【解题导语】本文…',
    '【语篇导读】本文…', '【语篇解读】本文…']) {
    assert(matchesLineRole('writing.explanations', computeLineFacts({ text }), { sectionCount: 1 }), text)
  }
})

test('only known bracketed sample titles can authorize essays; unknown ranges block capture', t => {
  for (const text of ['【参考答案】', '[参考答案]', '【参考范文】', '[范文]', '一、【考场作文】',
    '【示例二】建议调整活动安排']) {
    assert.equal(firstLineRole('entry-kind', computeLineFacts({ text }))?.value, 'essays', text)
  }
  for (const text of ['【答案补充】', '[答案补充]', '【未知范文标题】', '一、【答案另见后页】']) {
    assert.equal(firstLineRole('entry-kind', computeLineFacts({ text })), null, text)
    // Unknown bracketed content no longer blocks; the task degrades to
    // not_supplied with a review annotation (BUB-168).
    assert(checkWritingRoleFixture([text]).groups.some(group => group.essays.state === 'not_supplied'), text)
  }
})

test('standalone written-expression aliases share exact role, scoring and admission boundaries', () => {
  const admission = texts => assertSourceReferenceAdmission({
    sidecar: null, materialization: { documents: [{ documentId: 'answers', role: 'official_answers' }] },
    sourceInput: { ocrSourceBytes: { confirmationBytes: Buffer.from(JSON.stringify({
      documents: [{ documentId: 'answers', pages: [{ visualClassifications: [],
        orderedItems: texts.map((text, index) => ({ itemId: `item-${index}`, text })) }] }],
    })) } },
  })
  for (const heading of ['应用文', '书面表达', '书面表达:', '书面表达：']) {
    assert.equal(firstLineRole('writing-section', computeLineFacts({ text: heading }))?.value, 'application')
    assert.equal(scoringScopes([heading, '评分原则', '按内容和语言给分。']).get('item-2').taskType, 'application')
    assert.throws(() => admission([heading, '参考范文', 'Our class planted herbs.']),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
    assert.doesNotThrow(() => admission([heading, '参考范文', '略']))
  }
  for (const heading of ['书面表达需要审题', '说明：书面表达：']) {
    assert.equal(firstLineRole('writing-section', computeLineFacts({ text: heading })), null)
    assert.equal(scoringScopes([heading, '评分原则', '按内容和语言给分。']).get('item-2'), null)
    assert.doesNotThrow(() => admission([heading, '参考范文', 'Our class planted herbs.']))
  }
  for (const [application, continuation] of [
    ['第一节', '第二节'], ['应用文', '读后续写'],
  ]) {
    const scopes = scoringScopes(['书面表达：', application, '评分原则', '应用文评分正文',
      continuation, '评分原则', '续写评分正文'])
    assert.equal(scopes.get('item-3').taskType, 'application')
    assert.equal(scopes.get('item-6').taskType, 'continuation')
    assert.throws(() => admission(['书面表达：', application, '参考范文', 'Our class planted herbs.']),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
  }
})

test('parenthesized rubric titles open exact scoring entries and reject unresolved commentary', t => {
  for (const label of ['（一）评分原则：', '(一)评分原则:', '（二）各档次给分范围和要求']) {
    assert(firstLineRole('entry-label', computeLineFacts({ text: label })))
    assert.equal(firstLineRole('entry-kind', computeLineFacts({ text: label }))?.value, 'scoring')
    assert.deepEqual(scoringScopes(['第一节 应用文', label, '评分正文']).get('item-2'),
      { taskType: 'application', labelItemId: 'item-1', sourceLabel: label })
    assert.equal(scoringScopes([label, '评分正文']).get('item-1'), null, 'rubric needs a writing task')
  }
  for (const text of ['（一）评分原则如下。', '（二）各档次给分范围和要求分析', '注意：（一）评分原则：']) {
    assert.equal(firstLineRole('entry-label', computeLineFacts({ text })), null)
    assert.throws(() => scoringScopes(['第一节 应用文', text, '正文']),
      { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  }
})

test('scoring scope shares exact parenthesized task headings and numbered scoring labels with OCR roles', t => {
  for (const [heading, task] of [
    ['（二）应用文写作', 'application'], ['（三）读后续写（满分25分）', 'continuation'],
    ['（三）应用文写作', 'application'], ['（二）读后续写（满分25分）', 'continuation'],
    ['（２）应用文写作', 'application'], ['（３）读后续写（满分２５分）', 'continuation'],
    ['66. 应用文', 'application'], ['６６． 应用文', 'application'], ['67. 读后续写', 'continuation'],
  ]) for (const rawLabel of ['4. 评分细则', '４． 评分原则：']) {
    for (const text of new Set([heading, heading.normalize('NFKC')])) {
      const scopes = scoringScopes([text, rawLabel, '按内容和语言给分。'])
      assert.equal(firstLineRole('writing-section', computeLineFacts({ text }))?.value, task)
      assert.equal(firstLineRole('entry-kind', computeLineFacts({ text: rawLabel }))?.value, 'scoring')
      assert.equal(scopes.get('item-0'), null, 'a heading alone cannot authorize scoring')
      assert.deepEqual(scopes.get('item-2'), {
        taskType: task, labelItemId: 'item-1', sourceLabel: rawLabel,
      })
    }
  }
  const switched = scoringScopes([
    '（二）读后续写', '4. 评分细则', '续写评分正文',
    '（三）应用文写作', 'A source paragraph under the new task.', '４． 评分原则：', '应用文评分正文',
  ])
  assert.equal(switched.get('item-2').taskType, 'continuation')
  assert.equal(switched.get('item-4'), null, 'new task must not borrow the previous scoring label')
  assert.equal(switched.get('item-6').taskType, 'application')
  assert.throws(() => scoringScopes(['（二）读后续写', '4. 评分细则', '续写评分正文',
    '（三）应用文写作', '新标题后的无标签正文', '４． 评分原则：', '应用文评分正文']),
  { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
})

test('exact task scoring standards share ownership between source extraction and scoring admission', () => {
  for (const [heading, task] of [
    ['应用文评分标准', 'application'], ['读后续写评分标准：', 'continuation'],
    ['续写评分标准', 'continuation'], ['续写评分细则', 'continuation'],
    // 菏泽一模 answer book attaches the application rubric with a bare 附 prefix
    // and heads the continuation rubric with the compound 评分原则和评分标准.
    ['附应用文评分标准', 'application'], ['附续写评分标准', 'continuation'],
    ['读后续写评分原则和评分标准：', 'continuation'], ['应用文评分原则和评分标准', 'application'],
  ]) {
    const facts = computeLineFacts({ text: heading })
    assert.equal(firstLineRole('scoring-section', facts)?.value, task)
    assert.equal(firstLineRole('entry-kind', facts)?.value, 'scoring')
    assert(firstLineRole('entry-label', facts))
    assert.deepEqual(scoringScopes([heading, '评分正文']).get('item-1'), {
      taskType: task, labelItemId: 'item-0', sourceLabel: heading,
    })
  }
  for (const heading of ['应用文评分标准说明如下。', '续写评分标准分析', '66. 应用文需要审题。',
    '附：应用文评分标准', '附应用文评分标准分析', '附范文评分标准',
    '读后续写评分原则', '读后续写原则和评分标准', '读后续写评分原则和评分标准分析']) {
    assert.equal(firstLineRole('scoring-section', computeLineFacts({ text: heading })), null)
    assert.equal(scoringScopes([heading, '评分正文']).get('item-1'), null)
  }
})

test('scoring scope rejects numbered near misses and closes at sample and explanation boundaries', t => {
  for (const heading of ['（二）语法适用', '（三）语法填空', '（二）', '说明：（二）应用文写作',
    '（二）应用文写作需要认真审题。', '（三）读后续写评分说明如下。']) {
    assert.equal(scoringScopes([heading, '4. 评分细则', '正文']).get('item-2'), null, heading)
  }
  for (const label of ['4. 评分时应考虑要点。', '4. 【任意标签】', '正文 4. 评分细则', '100. 评分细则']) {
    assert.equal(scoringScopes(['（二）应用文写作', 'A confirmed source paragraph.', label, '正文']).get('item-3'), null, label)
  }
  for (const sample of ['2. 参考范文', '２． 作答示例', '2. One possible version', '作答示例']) {
    const scopes = scoringScopes(['（二）应用文写作', '4. 评分细则', '评分正文', sample, 'Sample text.'])
    assert(scopes.get('item-2'))
    assert.equal(scopes.get('item-3'), null, sample)
    assert.equal(scopes.get('item-4'), null, sample)
  }
  for (const boundary of ['（五）样卷', '试题解析', '听力原文']) {
    const scopes = scoringScopes(['（二）应用文写作', '4. 评分细则', boundary, '4. 评分细则', '正文'])
    assert.equal(scopes.get('item-4'), null, boundary)
    if (boundary !== '（五）样卷') {
      assert.equal(scoringScopes(['（二）应用文写作', '4. 评分细则', boundary,
        '（三）读后续写', '４． 评分原则：', '正文']).get('item-5'), null, boundary)
    }
  }
  for (const label of ['4. 评分时应考虑要点。', '正文 4. 评分细则', '100. 评分细则']) {
    assert.throws(() => scoringScopes(['（二）应用文写作', label, '正文']),
      { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  }
})

test('作答示例 is an essay label and splits from an exact section heading', () => {
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '作答示例' }))?.id, 'entry.general')
  assert.equal(firstLineRole('entry-kind', computeLineFacts({ text: '作答示例' }))?.value, 'essays')
  for (const section of ['第一节', '第二节']) {
    for (const separator of [' ', '：', ': ', '']) {
      for (const label of ['作答示例', '作答示例：', '作答示例 ：']) {
        assert.deepEqual(inlineSampleParts(`${section}${separator}${label}`), [section, label])
        assert.equal(firstLineRole('entry-label', computeLineFacts({ text: label }))?.id, 'entry.general')
      }
    }
    assert.equal(inlineSampleParts(`${section} 阅读理解 作答示例`), undefined)
    assert.equal(inlineSampleParts(`${section}：作答示例说明如下。`), undefined)
    for (const separator of ['', '：', ': ']) {
      assert.equal(inlineSampleParts(`${section}${separator}(One possible version)`), undefined)
    }
  }
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '作答示例说明如下。' })), null)
})

test('v21 composes whole bare sections and sample labels only in writing context', () => {
  const context = { inWriting: true }
  for (const [heading, label] of [
    ['第一节', 'One possible version:'], ['第二节', 'oNe PoSsIbLe VeRsIoN：'],
    ['第一节（满分15分）', '参考范文'], ['第二节:', 'Version one:'],
    ['第一节', '（One possible version）'], ['第二节', '作答示例'],
    ['第一节', '【参考范文】'], ['第二节', '参考范文（80词）'],
  ]) for (const space of [' ', '\t', '　']) {
    const input = `${heading}${space}${label}`
    assert.deepEqual(inlineSampleParts(input, context), [heading, label], input)
    for (const version of [17, 18, 19, 20]) {
      // Legacy inline forms may already match, so compare the new-only examples.
      if (label.startsWith('One') || label.startsWith('oNe') || label === '参考范文') {
        assert.equal(inlineSampleParts(input, { ...context, producerVersion: `ocr-source-references-producer-v${version}` }), undefined, input)
      }
    }
  }
  for (const input of ['第一节 One possible version: explanation', '第一节 One possible version:正文',
    '第一节One possible version:', '第一节 One possible', '第一节 阅读理解 One possible version:',
    '第一节 【示例一】额外说明', '第一节\nOne possible version:']) {
    assert.equal(inlineSampleParts(input, context), undefined, input)
  }
  assert.equal(inlineSampleParts('第一节 One possible version:', { inWriting: false }), undefined)
})

test('parenthesized writing headings use explicit task words rather than their ordinal', () => {
  for (const [text, task] of [
    ['（二）应用文写作', 'application'], ['（三）读后续写（满分25分）', 'continuation'],
    ['（三）应用文写作', 'application'], ['（二）读后续写（满分25分）', 'continuation'],
    ['（２）应用文写作', 'application'], ['（３）读后续写（满分２５分）', 'continuation'],
  ]) for (const variant of new Set([text, text.normalize('NFKC')])) {
    const facts = computeLineFacts({ text: variant })
    assert.equal(firstLineRole('writing-section', facts)?.value, task, variant)
    assert.equal(facts.text, variant)
  }
  for (const text of ['（二）语法适用', '（三）语法填空', '（二）', '说明：（二）应用文写作',
    '（二）应用文写作需要认真审题。', '（三）读后续写评分说明如下。']) {
    assert.equal(firstLineRole('writing-section', computeLineFacts({ text })), null, text)
  }
})

test('Arabic entry numbers are limited to exact known sample and scoring labels', () => {
  for (const [text, kind] of [
    ['2. 参考范文', 'essays'], ['4. 评分细则', 'scoring'], ['２． 作答示例', 'essays'],
    ['４． 评分原则：', 'scoring'],
  ]) for (const variant of new Set([text, text.normalize('NFKC')])) {
    const facts = computeLineFacts({ text: variant })
    assert(firstLineRole('entry-label', facts), variant)
    assert.equal(firstLineRole('entry-kind', facts)?.value, kind, variant)
  }
  for (const text of ['4. 评分时应考虑要点。', '2. 参考范文说明如下', '4. 【任意标签】',
    '4. 语法适用', '正文 2. 参考范文', '100. 评分细则']) {
    assert.equal(firstLineRole('entry-label', computeLineFacts({ text })), null, text)
  }
})

for (const rule of LINE_ROLE_RULES) {
  for (const [label, samples, expected] of [
    ['positive', rule.examples, true], ['counterexample', rule.counterExamples, false],
  ]) test(`${rule.id} ${label}`, () => {
    assert(samples.length > 0)
    for (const { context = {}, ...line } of samples) {
      assert.equal(Boolean(matchesLineRole(rule.id, computeLineFacts(line), context)), expected, line.text)
      if (/^(?:writing|entry|paragraph)\./u.test(rule.id)) {
        checkWritingRoleFixture([
          ...(context.entryKind === 'scoring' ? ['评分原则'] : context.skipping ? ['范文分析'] : []),
          line.text,
        ], line)
      }
    }
  })
}

after(() => console.log(`Writing role ownership differential: ${JSON.stringify(writingOwnershipChecks)}`))

test('comma dialogue directions require exactly one question and preserve source text', () => {
  // n085 question-source-1:item-8, including its once-only instruction.
  const source = '听下面5段对话，每段对话后有一个小题，从题中所给的A、B、C三个选项中选出最佳选项。听完每段对话后，你都有10秒钟的时间来回答有关小题和阅读下一小题，每段对话仅读一遍。'
  for (const [text, expected] of [
    [source, 'listening.short-dialogue'],
    ['听下面5段对话，每段对话后有一个小题。每段对话仅读一遍。', 'listening.short-dialogue'],
    ['听下面5段对话。每段录音读两遍。', 'listening.short-dialogue'],
    ['听下面5段对话或独白，每段对话或独白后有几个小题，选择答案。', 'listening.long-form'],
    ['听下面5段对话，每段对话后有几个小题，选择答案。', null],
    ['听下面5段对话，每段对话后有一个小题组。', null],
    ['听下面5段对话，每段对话后有一个小题或几个小题。', null],
    ['听下面5段对话，每段对话后有一个小题', null],
    ['听下面5段对话，每段对话仅读一遍。', null],
    ['听下面5段对话，每段录音后有一个小题，选择答案。', null],
    ...[',', '；', '：', '、'].map(separator =>
      [`听下面5段对话${separator}每段对话后有一个小题，选择答案。`, null]),
    ...[',', '；', '：', '、'].map(separator =>
      [`听下面5段对话，每段对话后有一个小题${separator}选择答案。`, null]),
  ]) {
    const input = { text }
    const before = structuredClone(input)
    const facts = computeLineFacts(input)
    assert.equal(firstLineRole('direction', facts)?.value ?? null, expected, text)
    assert.equal(matchesLineRole('direction.listening-short', facts), expected === 'listening.short-dialogue', text)
    assert.equal(matchesLineRole('direction.listening-long', facts), expected === 'listening.long-form', text)
    assert.equal(facts.text, text)
    assert.deepEqual(input, before)
  }
})

test('recording directions require an explicit per-recording question count', () => {
  for (const [text, expected] of [
    ['听下面5段录音。每段录音后有一个小题，选择答案。', 'listening.short-dialogue'],
    ['听下面5段录音。每段录音后有几个小题，选择答案。', 'listening.long-form'],
    ['听下面5段录音。', null],
    ['听下面5段录音。每段录音播放两遍。', null],
    ['听下面5段录音。每段录音后有一个小题组。', null],
    ['听下面5段录音。每段录音后有几个小题组。', null],
    ['听下面5段录音。每段录音后有一个小题或几个小题。', null],
    ['听第6段录音，回答第6、7题。', null],
  ]) {
    const facts = computeLineFacts({ text })
    assert.equal(firstLineRole('direction', facts)?.value ?? null, expected, text)
    assert.equal(matchesLineRole('direction.listening-short', facts), expected === 'listening.short-dialogue', text)
    assert.equal(matchesLineRole('direction.listening-long', facts), expected === 'listening.long-form', text)
  }
})

test('candidate priorities are unique within each phase, preserve precedence and reject unknown rules', () => {
  assert.equal(new Set(LINE_ROLE_RULES.map(rule => rule.id)).size, LINE_ROLE_RULES.length)
  assert.equal(new Set(LINE_ROLE_RULES.map(rule => `${rule.phase}:${rule.priority}`)).size, LINE_ROLE_RULES.length)
  const facts = computeLineFacts({ text: '【评分参考答案】' })
  assert.equal(firstLineRole('entry-kind', facts).id, 'entry.scoring-kind')
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '【示例一】' })).id, 'entry.general')
  assert.throws(() => matchesLineRole('missing', facts), /Unknown line-role rule/u)
  assert.throws(() => firstLineRole('missing', facts), /Unknown line-role phase/u)
})

test('line facts preserve source text/order and distinguish normalized regions from pixel boxes', () => {
  const input = { text: '  Dear Sam,  ', page: 2, words: [
    { number: 2, text: 'Sam,', box: { left: 70, top: 50, width: 30, height: 12 } },
    { number: 1, text: 'Dear', box: { left: 10, top: 48, width: 40, height: 10 } },
  ], boxes: [
    { region: { x: .4, y: .3, width: .2, height: .02 } },
    { region: { x: .1, y: .2, width: .15, height: .03 } },
  ] }
  const before = structuredClone(input)
  const facts = computeLineFacts(input)
  assert.deepEqual(input, before)
  assert.equal(facts.text, '  Dear Sam,  ')
  assert.equal(facts.trimmed, 'Dear Sam,')
  assert.deepEqual(facts.box, { left: 10, right: 100, top: 48, bottom: 62, height: 12 })
  assert.deepEqual(facts.region, { x: .1, y: .2, width: .5, height: .12 })
  assert.equal(facts.left, .1)
  assert.equal(facts.firstObservationWidth, .15)
  assert.equal(facts.firstWordWidth, 40)
  assert(Object.isFrozen(facts))
  assert.deepEqual(facts.sortedWords.map(word => word.number), [1, 2])
  assert.doesNotThrow(() => computeLineFacts({ text: 'Dear Sam,', words: 'w1-w3' }))
})

test('a lowercase line cannot continue a short previous line', () => {
  const result = referenceLineBoundary({ role: 'body', right: .5, page: 1 },
    { text: 'and these continue that turn', left: .1, page: 1,
      boxes: [{ region: { x: .1, y: .3, width: .1, height: .02 } }] },
    { left: .1, right: .9 })
  assert.equal(result.previousShort, true)
  assert.equal(result.continues, false)
})

test('cross-page short-line comparison uses the previous margin independently of the current margin', () => {
  const previous = { role: 'body', right: .8, page: 1 }
  const line = { text: 'Unexpectedly everything changed.', left: .1, page: 2,
    boxes: [{ region: { x: .1, y: .3, width: .01, height: .02 } }] }
  const previousMargin = { left: .1, right: .82 }
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .9 }, previousMargin).previousShort, false)
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .82 }, previousMargin).previousShort, false)
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .82 }, { left: .1, right: .9 }).previousShort, true)
})
