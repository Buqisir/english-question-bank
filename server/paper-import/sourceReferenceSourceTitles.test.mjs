import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { textInput, historicalTexts, qingdaoTexts } from '../../test-fixtures/paper-import/source-title-compat/fixture.mjs'
import { buildSourceReferences } from '../../scripts/import-pipeline/ocr-proofread.mjs'
import { prepareSourceReferences, sourceReferenceBlocks, validateSourceReferences } from './sourceReferences.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from './sourceReferenceAdmission.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceWritingLifecycle } from './sourceReferenceWritingTask.mjs'
import { isAnnotatedScoringLabel, isTaskLocalSampleOmission, isSourceTitleTranscriptCandidate } from './sourceReferenceWritingRules.mjs'
import { usesAlternateAnswerScope, usesCellContinuation, usesV23WritingCapabilities,
  usesExplicitWritingTitles, usesGivenTitleWritingSamples, usesComposedWritingLabels, usesTitleAbbreviation } from './sourceReferenceSemantics.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

const v26 = 'ocr-source-references-producer-v26'
const capture = (input, producerVersion) => {
  const output = buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { sourceDocuments: input.sourceInput.documents, sourceInput: input.sourceInput, producerVersion })
  return { ...prepareSourceReferences(input), producerVersion: output.producerVersion,
    ...(output.schemaVersion ? { schemaVersion: output.schemaVersion } : {}),
    ...(output.alternateAnswerScope ? { alternateAnswerScope: output.alternateAnswerScope } : {}), groups: output.groups }
}
const lifecycle = input => {
  const source = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  return sourceReferenceWritingLifecycle(source.lines, source)
}
const scopeError = { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' }
const assertDegraded = input => {
  const sidecar = capture(input)
  assert(sidecar.groups.some(group => group.essays.state === 'not_supplied' && group.scoring.state === 'not_supplied'))
  assertSourceReferenceAdmission({ ...input, sidecar })
}

test('Qingdao task omission keeps both rubrics and exact annotated label; transcript never enters scoring', () => {
  const input = textInput([qingdaoTexts]), before = structuredClone(input)
  const sidecar = capture(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
  assert.equal(sidecar.groups[0].scoring.entries[0].sourceLabel, '评分细则（格式错扣1分）：')
  assert.deepEqual(sidecar.groups.map(group => group.scoring.entries.map(entry => entry.sourceLabel)),
    [['评分细则（格式错扣1分）：'], ['评分原则', '各档次给分范围及要求：']])
  assert(sidecar.groups.every(group => group.scoring.state === 'captured'))
  assert(!JSON.stringify(sidecar.groups).includes('recording'))
  assert.deepEqual(structuredClone(input), before)
  assert.throws(() => capture(input, v26), scopeError)
})

test('Ganzhou title closes both existing essays using original adjacent Text 1', () => {
  const input = textInput([[...historicalTexts, '【听力录音稿】', 'Text 1', 'M: A synthetic recording.']])
  const sidecar = capture(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.deepEqual(sidecar.groups.map(group => group.essays.entries[0].paragraphs[0].text),
    ['An original application sample.', 'An original continuation sample.'])
  assert(lifecycle(input).listeningStarts.has('p1:i11'))
  assert.throws(() => capture(input, v26), scopeError)
})

test('new complete title permissions are exact and v27-only', () => {
  for (const [predicate, positive, negatives] of [
    [isSourceTitleTranscriptCandidate, '【听力录音稿】', ['文中提到【听力录音稿】', '【听力录音稿】附注', '英语 听力原文']],
    [isTaskLocalSampleOmission, '参考范文（略）', ['参考范文(略)但另附例文', '参考 范文(略)']],
    [isAnnotatedScoringLabel, '评分细则（格式错扣1分）：', ['评分细则(格式错扣1分):其他正文', '评分细则(格式 错扣1分):']],
  ]) {
    assert(predicate(positive))
    assert(!predicate(positive, v26))
    for (const text of negatives) assert(!predicate(text), text)
  }
})

test('near-miss titles keep every original word when already owned by a valid rubric', () => {
  const prose = ['文中提到【听力录音稿】', '【听力录音稿】附注', '英语听力原文附注',
    '参考范文(略)但另附例文', '评分细则(格式错扣1分):其他正文']
  const input = textInput([['第一节 应用文', '评分原则', ...prose,
    '第二节 读后续写', '参考范文', 'An original continuation sample.']])
  const sidecar = capture(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  const text = sidecar.groups[0].scoring.entries.flatMap(entry => entry.paragraphs.map(paragraph => paragraph.text)).join('\n')
  for (const source of prose) assert(text.includes(source), source)
})

test('invalid raw adjacency cannot be rescued by a later bare Text 1', () => {
  for (const title of ['【听力录音稿】', '英语听力原文']) {
    for (const tail of [['普通正文', 'Text 1'], ['英语参考答案 第2页（共2页）', 'Text 1'], ['Text 2', 'Text 1']]) {
      assertDegraded(textInput([[...historicalTexts, title, ...tail]]))
    }
    assertDegraded(textInput([[...historicalTexts, title], ['Text 1']]))
    for (const mutate of [
      lines => { lines.at(-1).documentId = 'another-document' },
      lines => { lines.at(-1).table = { rows: [] } },
      lines => { lines.at(-1).figure = {} },
      lines => { lines.at(-2).nextSourceItemId = 'consumed-picture-item' },
    ]) {
      const input = textInput([[...historicalTexts, title, 'Text 1']])
      const source = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
      mutate(source.lines)
      assert.throws(() => sourceReferenceWritingLifecycle(source.lines, source), scopeError)
    }
  }
})

test('new omission and scoring labels require a real current task', () => {
  for (const prefix of [[], ['第四部分 写作'], ['第四部分']]) {
    for (const label of ['参考范文（略）', '评分细则（格式错扣1分）：']) {
      assertDegraded(textInput([[...prefix, label]]))
    }
  }
  for (const lines of [
    ['第一节 应用文', '参考范文', 'A real sample.', '参考范文（略）'],
    ['第一节 应用文', '参考范文（略）', '参考范文', 'A real sample.'],
  ]) {
    // A captured sample conflicting with an explicit 范文略 degrades that task
    // rather than blocking the paper (BUB-168).
    const sidecar = capture(textInput([[...lines, '第二节 读后续写', '评分原则', '续写评分。']]))
    assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
    assert.equal(sidecar.groups[1].scoring.state, 'captured')
    assertSourceReferenceAdmission({ ...textInput([[...lines, '第二节 读后续写', '评分原则', '续写评分。']]), sidecar })
  }
})

test('an unowned source table degrades both tasks through the shared lifecycle callback', () => {
  const input = textInput([['Unowned table.', ...historicalTexts]])
  const source = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  source.lines[0].table = { tableId: 'unowned', rows: [[{ text: '评分内容' }]] }
  const affected = new Set()
  const result = sourceReferenceWritingLifecycle(source.lines, { ...source,
    onScopeError: info => affected.add(info.taskType) })
  assert.deepEqual([...affected].sort(), ['application', 'continuation'])
  assert([...result.sections.values()].every(section => section.steps.length === 0))
})

test('task omission never spills into continuation essays', () => {
  const input = textInput([['第四部分 写作', '第一节（满分15分）', '参考范文（略）',
    '评分细则（格式错扣1分）：', '应用文评分。', '第二节（满分25分）', '参考范文',
    'A real continuation sample.', '评分原则', '续写评分。']])
  const sidecar = capture(input)
  assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
  assert.equal(sidecar.groups[1].essays.state, 'captured')
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('strict transcript closure survives Text 1, explanations and later task/sample headings', () => {
  for (const tail of [
    ['应用文', '参考范文', 'A later sample.'],
    ['第四部分 写作', '第一节', '参考范文', 'A later sample.'],
    ['答案详解', '应用文参考范文', 'A later sample.'],
    ['参考范文', 'A later sample.'],
    ['写作评分说明'],
    ['写作评分说明', '第一节 应用文', '评分原则', '评分正文。'],
    ['第一节（满分25分）', '评分原则', '评分正文。'],
  ]) assertDegraded(textInput([[...historicalTexts, '英语听力原文', 'Text 1',
    'M: A synthetic recording.', ...tail]]))
})

test('only complete existing appendix proof reopens scoring after new transcript titles', () => {
  for (const prefix of [['写作评分说明', '应用文评分细则'], ['第一节（满分15分）', '评分原则']]) {
    const input = textInput([[...historicalTexts, '英语听力原文', 'Text 1', 'M: A synthetic recording.',
      ...prefix, '完整保留的附录评分正文。', '第二节（满分25分）', '评分原则', '续写附录评分正文。']])
    const sidecar = capture(input)
    assertSourceReferenceAdmission({ ...input, sidecar })
    assert(sidecar.groups.every(group => JSON.stringify(group.scoring).includes('附录评分正文')))
    assert.deepEqual(sidecar.groups.map(group => group.essays.entries.length), [1, 1])
    for (const sample of [['参考范文', 'A forbidden sample.'], ['Dear Sam,', 'A complete forbidden letter.', 'Yours,', 'Li Hua']]) {
      const items = [...input.confirmation.documents[0].pages[0].orderedItems.map(item => item.text), ...sample]
      const changed = textInput([items])
      try {
        // An unmistakable re-open still fails; structure the planner cannot
        // reconcile degrades the task instead of blocking (BUB-168).
        const degraded = capture(changed)
        assert.equal(degraded.groups[1].essays.state, 'not_supplied', sample.join('/'))
        assertSourceReferenceAdmission({ ...changed, sidecar: degraded })
      } catch (error) {
        assert.equal(error.code, 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID', sample.join('/'))
      }
    }
  }
})

test('strict closure rejects complete stance samples before transcript skipping or scoring-scope filtering', () => {
  for (const title of ['【听力录音稿】', '英语听力原文']) {
    for (const label of ['范文一：支持立场', '范文二：反对立场']) {
      for (const appendix of [[], ['写作评分说明', '应用文评分细则', '合法附录评分正文。']]) {
        const prefix = [...historicalTexts, title, 'Text 1', 'M: A synthetic recording.', ...appendix]
        const clean = textInput([[...prefix, ...(appendix.length ? ['评分原则', '后续评分正文。'] : [])]])
        const sidecar = capture(clean)
        const input = textInput([[...prefix, label, 'A late source sample.',
          ...(appendix.length ? ['评分原则', '后续评分正文。'] : [])]])
        assertDegraded(input)
        assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
          `public admission: ${title}/${label}/${appendix.length}`)
      }
    }
  }
})

test('stance labels still capture in ordinary application tasks and near misses remain rubric prose', () => {
  for (const label of ['范文一：支持立场', '范文二：反对立场']) {
    const input = textInput([['第一节 应用文', label, 'An original stance sample.',
      '第二节 读后续写', '参考范文', 'An original continuation sample.']])
    const sidecar = capture(input)
    assert.equal(sidecar.groups[0].essays.entries[0].sourceLabel, label)
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
  const prose = ['评分说明包含“范文一：支持立场”的字样。', '评分时可参考范文二：反对立场。', '文中提到范文一：支持立场']
  const input = textInput([[...historicalTexts, '英语听力原文', 'Text 1', 'M: A synthetic recording.',
    '写作评分说明', '应用文评分细则', ...prose]])
  const sidecar = capture(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  const scoring = JSON.stringify(sidecar.groups[0].scoring)
  for (const text of prose) assert(scoring.includes(text), text)
})

test('raw-adjacent scoring appendix pairs may cross pages while new transcript titles stay same-page', () => {
  for (const title of ['【听力录音稿】', '英语听力原文']) {
    for (const [heading, rubric] of [['写作评分说明', '应用文评分细则'], ['第一节（满分15分）', '评分原则']]) {
      const input = textInput([[...historicalTexts, title, 'Text 1', 'M: A synthetic recording.', heading],
        [rubric, '自然跨页的完整附录评分正文。']])
      const sidecar = capture(input)
      assertSourceReferenceAdmission({ ...input, sidecar })
      const entry = sidecar.groups[0].scoring.entries.at(-1)
      assert.equal(entry.sourceLabel, rubric)
      assert.equal(entry.labelSource.locator.page, 2)
      assert(entry.paragraphs.some(paragraph => paragraph.text === '自然跨页的完整附录评分正文。'
        && paragraph.source.locator.page === 2))
      assert.deepEqual(sidecar.groups.map(group => group.essays.entries.length), [1, 1])
    }
  }
})

test('appendix reopening rejects intervening source items, consumed gaps, figures, tables and foreign documents', () => {
  for (const [heading, rubric] of [['写作评分说明', '应用文评分细则'], ['第一节（满分15分）', '评分原则']]) {
    const prefix = [...historicalTexts, '英语听力原文', 'Text 1', 'M: A synthetic recording.']
    const clean = textInput([[...prefix, heading], [rubric, '完整附录评分正文。']])
    // Use the existing title to obtain a valid sidecar independently of the
    // new cross-page behavior, including when this test runs against the bug.
    const control = textInput([[...historicalTexts, '高三英语试题听力录音稿', 'Text 1',
      'M: A synthetic recording.', heading], [rubric, '完整附录评分正文。']])
    const sidecar = capture(control)
    for (const inserted of ['插入的源正文。', '英语参考答案 第2页（共2页）']) {
      const input = textInput([[...prefix, heading, inserted], [rubric, '完整附录评分正文。']])
      assertDegraded(input)
      assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }))
    }
    for (const mutate of [
      head => { head.nextSourceItemId = 'consumed-between-the-pair' },
      (head, next) => { next.documentId = 'foreign-document' },
      (head, next) => { next.figure = {} },
      (head, next) => { next.table = { tableId: 'consumed-rubric', rows: [[{ text: rubric }]] } },
    ]) {
      const source = prepareSourceReferenceWritingItems(clean.materialization, clean.evidence, clean.confirmation)
      const index = source.lines.findLastIndex(line => line.text === heading)
      mutate(source.lines[index], source.lines[index + 1])
      assert.throws(() => sourceReferenceWritingLifecycle(source.lines, source))
    }
  }
})

test('new transcript before first writing still permits the first real writing tasks', () => {
  const input = textInput([['英语听力原文', 'Text 1', 'M: A synthetic recording.', ...historicalTexts]])
  assertSourceReferenceAdmission({ ...input, sidecar: capture(input) })
})

test('public admission rejects deletions, task theft, false absence, labels, sources and old-version forgery', () => {
  const input = textInput([qingdaoTexts]), sidecar = capture(input)
  for (const mutate of [
    s => { s.groups[0].scoring.entries[0].paragraphs[0].text = '应用文评分第二段。' },
    s => { s.groups[1].scoring.entries.pop() },
    s => { s.groups[1].essays = s.groups[0].scoring; s.groups[0].scoring = { state: 'not_supplied',
      entries: [], evidence: s.groups[0].essays.evidence } },
    s => { s.groups[0].scoring.entries[0].sourceLabel += '字' },
    s => { s.groups[0].scoring.entries[0].labelSource.documentSha256 = sha256('wrong') },
    s => { s.groups[1].scoring.entries[0].paragraphs[0].source.locator.region.width -= .01 },
    s => { s.producerVersion = v26 },
  ]) {
    const changed = structuredClone(sidecar)
    mutate(changed)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }))
  }
})

test('all v26 capabilities stay explicit after current producer advances', () => {
  for (const capability of [usesAlternateAnswerScope, usesCellContinuation, usesV23WritingCapabilities,
    usesExplicitWritingTitles, usesGivenTitleWritingSamples, usesComposedWritingLabels, usesTitleAbbreviation]) {
    assert(capability(v26))
    assert(capability('ocr-source-references-producer-v27'))
  }
})

test('v26 alternate capture still partitions source references before its original complete transcript title', () => {
  const input = textInput([[...historicalTexts, '备选试题参考答案', '第一节 应用文', '参考范文',
    'An alternate sample.', '评分原则', 'Alternate rubric.',
    '2026届高中毕业班适应性练习英语听力部分录音稿', 'Text 1']])
  const previous = capture(input, v26), current = capture(input)
  assert.deepEqual(current.groups, previous.groups)
  assert.deepEqual(current.alternateAnswerScope, previous.alternateAnswerScope)
  assert.equal(previous.alternateAnswerScope.orderedItemIds.length, 6)
  assert(!JSON.stringify(previous.groups).includes('Alternate'))
  assert.throws(() => capture(input, 'ocr-source-references-producer-v25'), scopeError)
})

test('fixed sealed v25/v26 bytes replay without first-admission authority or mutable receipts', () => {
  const input = textInput()
  const receipts = JSON.parse(readFileSync(new URL('../../test-fixtures/paper-import/source-title-compat/receipts.json', import.meta.url)))
  for (const number of [25, 26]) {
    const bytes = readFileSync(new URL(`../../test-fixtures/paper-import/source-title-compat/sealed-v${number}.json`, import.meta.url))
    const receipt = receipts[`v${number}`]
    assert.equal(sha256(bytes), receipt.sourceReferencesDigest)
    assert.deepEqual(capture(input, `ocr-source-references-producer-v${number}`), JSON.parse(bytes))
    assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt })
    assertSourceReferenceAdmission({ ...input, sidecar: JSON.parse(bytes) })
    assert.throws(() => assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: Buffer.concat([bytes, Buffer.from(' ')]), receipt }),
      { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
    assert.throws(() => assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes,
      receipt: { ...receipt, candidateDigest: sha256('different') } }), { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  }
})

function v2ReplayFixture() {
  // Page boundaries preserve two real paragraphs in each task's first rubric.
  // A second application rubric also makes entry order independently testable.
  const input = textInput([historicalTexts.slice(0, 6),
    ['应用文评分第二段。', '评分细则', '应用文评分第三段。', ...historicalTexts.slice(6)],
    ['续写评分第二段。']])
  const capture = buildSourceReferences(input.materialization, input.evidence, input.confirmation)
  const v1 = { ...prepareSourceReferences(input), groups: capture.groups }
  const v2 = structuredClone(v1)
  v2.schemaVersion = 'source-references-v2'
  for (const group of v2.groups) for (const entry of group.scoring.entries) {
    entry.blocks = sourceReferenceBlocks(entry)
    delete entry.paragraphs
  }
  assert.equal(v2.groups[0].scoring.entries.length, 2)
  for (const group of v2.groups) assert.equal(group.scoring.entries[0].blocks.length, 2)
  return { input, v1, v2 }
}

test('v1 prose and v2 paragraph blocks retain identical source meaning at first admission', () => {
  const { input, v1, v2 } = v2ReplayFixture()
  const before = structuredClone({ input, v1, v2 })
  assert.deepEqual(validateSourceReferences({ ...input, sidecar: v1 }), [])
  assert.deepEqual(validateSourceReferences({ ...input, sidecar: v2 }), [])
  assertSourceReferenceAdmission({ ...input, sidecar: v1 })
  assertSourceReferenceAdmission({ ...input, sidecar: v2 })
  assert.deepEqual(structuredClone({ input, v1, v2 }), before)
})

test('v2 block replay still rejects text, labels, ids, order, task ownership and source locator changes', () => {
  const { input, v2 } = v2ReplayFixture()
  const entry = sidecar => sidecar.groups[0].scoring.entries[0]
  for (const [name, change] of [
    ['text', sidecar => { entry(sidecar).blocks[0].paragraph.text += ' invented content' }],
    ['label', sidecar => { entry(sidecar).sourceLabel = '评分原则' }],
    ['entry id', sidecar => { entry(sidecar).referenceId += '-forged' }],
    ['paragraph id', sidecar => { entry(sidecar).blocks[0].paragraph.paragraphId += '-forged' }],
    ['paragraph role', sidecar => { entry(sidecar).blocks[0].paragraph.role = 'title' }],
    ['one of two paragraphs omitted', sidecar => { entry(sidecar).blocks.shift() }],
    ['duplicate content with unique id', sidecar => {
      const duplicate = structuredClone(entry(sidecar).blocks[0])
      duplicate.paragraph.paragraphId += '-duplicate'
      entry(sidecar).blocks.push(duplicate)
    }],
    ['entry order', sidecar => { sidecar.groups[0].scoring.entries.reverse() }],
    ['block order within entry', sidecar => { entry(sidecar).blocks.reverse() }],
    ['entry ownership across legal groups', sidecar => {
      const [application, continuation] = sidecar.groups
      ;[application.scoring.entries[0], continuation.scoring.entries[0]] =
        [continuation.scoring.entries[0], application.scoring.entries[0]]
    }],
    ['paragraph source', sidecar => { entry(sidecar).blocks[0].paragraph.source.locator.region.x += .01 }],
    ['label source', sidecar => { entry(sidecar).labelSource.locator.region.y += .01 }],
    ['group order', sidecar => { sidecar.groups.reverse() }],
  ]) {
    const changed = structuredClone(v2)
    change(changed)
    assert.notDeepEqual(changed, v2, name)
    assert.deepEqual(validateSourceReferences({ ...input, sidecar: changed }), [], name)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }), {
      code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID',
      message: 'Current references must preserve every confirmed sample, scoring paragraph, label, task and source locator',
    }, name)
  }
})

test('v2 malformed containers, duplicate ids and foreign groups retain their earlier admission errors', () => {
  const { input, v2 } = v2ReplayFixture()
  const entry = sidecar => sidecar.groups[0].scoring.entries[0]
  for (const [name, change, code] of [
    ['empty blocks', sidecar => { entry(sidecar).blocks = [] }, 'SOURCE_REFERENCES_SCHEMA_INVALID'],
    ['duplicate id', sidecar => { entry(sidecar).blocks.push(structuredClone(entry(sidecar).blocks[0])) },
      'SOURCE_REFERENCES_ID_DUPLICATE'],
    ['foreign group', sidecar => { sidecar.groups[0].groupId = sidecar.groups[1].groupId },
      'SOURCE_REFERENCES_GROUP_FOREIGN'],
    ['dual paragraphs and blocks', sidecar => {
      entry(sidecar).paragraphs = entry(sidecar).blocks.map(block => structuredClone(block.paragraph))
    }, 'SOURCE_REFERENCES_SCHEMA_INVALID'],
  ]) {
    const changed = structuredClone(v2)
    change(changed)
    assert(validateSourceReferences({ ...input, sidecar: changed }).some(issue => issue.code === code), name)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }), { code }, name)
  }
})
