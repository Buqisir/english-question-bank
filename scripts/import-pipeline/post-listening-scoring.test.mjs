import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { sourceReferenceScoringScopes } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { firstLineRole } from './ocr-line-roles.mjs'
import { buildSourceReferences } from './ocr-proofread.mjs'

// Synthetic source order: samples, transcript, then explicitly headed rubrics.
function fixture({ overview = '写作评分说明', boundary = '听力原文', task = '第一节：应用文写作（满分15分）',
  label = '二、各档次的给分范围和要求', rubric = '评分标准',
  continuationTask = '第二节 读后续写',
  sampleHeading = '第一节 应用文', applicationSample = ['参考范文', 'Our original application sample.'] } = {}) {
  const input = scoringFiguresFixture({ essays: false, writingHeading: [overview, task] })
  const answers = input.confirmation.documents[1]
  const evidence = input.evidence.documents[1]
  for (const [pageIndex, texts] of [
    [0, [sampleHeading, ...applicationSample,
      '第二节 读后续写', '参考范文', 'Our original continuation sample.']],
    [1, [boundary, 'Text 1', 'M: This is a synthetic recording.']],
  ]) {
    const page = answers.pages[pageIndex], proof = evidence.pages[pageIndex]
    proof.observations = texts.map((text, i) => ({
      observationId: `answers:p${pageIndex + 1}:synthetic${i}`,
      regionId: `answers:p${pageIndex + 1}:text${i}`, text,
      region: { x: .1, y: .1 + i * .07, width: .7, height: .02 },
      confidence: 1, alternatives: [],
    }))
    proof.regions = proof.observations.map(item => ({ regionId: item.regionId, kind: 'text', region: item.region }))
    proof.readingOrderEdges = proof.observations.slice(1).map((item, i) => ({
      before: proof.observations[i].observationId, after: item.observationId,
    }))
    page.orderedItems = proof.observations.map(item => ({
      itemId: `${item.observationId}:item`, text: item.text, observationIds: [item.observationId],
    }))
  }
  for (const [before, after] of [['二、各档次的给分范围和要求', label], ['评分标准', rubric]]) {
    const item = answers.pages[2].orderedItems.find(item => item.text === before)
    item.text = after
    evidence.pages[2].observations.find(observation => observation.observationId === item.observationIds[0]).text = after
  }
  const continuation = answers.pages[3].orderedItems[0]
  continuation.text = continuationTask
  evidence.pages[3].observations.find(item => item.observationId === continuation.observationIds[0]).text = continuationTask
  const { evidenceDigest: _oldDigest, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = {
    evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)),
  }
  return input
}

// Short confirmed-source excerpts; synthetic bodies avoid storing whole essays.
function textReferences(pageTexts) {
  const pages = pageTexts.map((texts, p) => ({ page: p + 1, visualClassifications: [],
    orderedItems: texts.map((text, i) => ({ text, itemId: `p${p + 1}:i${i}`, observationIds: [`p${p + 1}:w${i}`] })) }))
  const confirmation = { documents: [{ documentId: 'answers', pages }] }
  const evidence = { documents: [{ documentId: 'answers', pages: pages.map(page => ({
    observations: page.orderedItems.map((item, i) => ({ observationId: item.observationIds[0], text: item.text,
      region: { x: .1, y: .1 + i * .03, width: .7, height: .02 } })),
  })) }] }
  const materialization = { paperId: 'paper-writing-labels-test',
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: `sha256:${'a'.repeat(64)}` }],
    groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })) }
  return { confirmation, capture: () => buildSourceReferences(materialization, evidence, confirmation) }
}

test('9+1 Version one/two labels end scoring and retain both complete source samples', () => {
  for (const label of ['Version one:', 'Version 1:', '一、Version one:', '(一) Version 1:']) {
    const input = textReferences([
      ['第一节 应用文写作（满分15分）', '一、评分原则', '1. 本题总分为15分，按五个档次进行评分。'],
      [label, 'Dear Mr. Smith,', 'Our study trip starts at the museum.', 'Version two:', 'Dear Mr. Smith,',
        'Our second route ends at the gallery.', 'Yours,', 'Li Hua', '第二节 读后续写', '参考范文', 'A synthetic ending.'],
    ])
    const before = structuredClone(input.confirmation)
    const { groups } = input.capture()
    const application = groups[0]
    assert.deepEqual(application.essays.entries.map(entry => entry.sourceLabel), [label, 'Version two:'])
    assert.match(application.essays.entries[0].paragraphs.map(p => p.text).join('\n'), /museum\./u)
    assert.match(application.essays.entries[1].paragraphs.map(p => p.text).join('\n'), /gallery\./u)
    assert(!/Version|Dear Mr|museum|gallery/u.test(JSON.stringify(application.scoring)))
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
    assert.equal(scopes.get('p2:i0'), null)
    assert.equal(scopes.get('p2:i1'), null)
    assert.deepEqual(input.confirmation, before)
  }
})

test('sample citations remain scoring prose through the continuation appendix', () => {
  for (const citation of ['范文1中“人物的转变合理”。', '范文2的情节符合线索。', '参考范文①中“主题积极”。']) {
    const texts = ['（二）读后续写评分参考标准', '一、原文线索分析', citation,
      '（二）Para. 2: The brothers worked together.', '三、评分侧重点总结',
      '1. 线索关联度：紧扣原文；', '2. 情节合理性：转变自然；',
      '3. 细节生动性：动作真实；', '4. 主题深化度：体现亲情。']
    const input = textReferences([['第一节 应用文', '参考范文', 'An application sample.',
      '第二节 读后续写', '参考范文', 'A continuation sample.', '听力原文', '写作评分说明', ...texts]])
    const before = structuredClone(input.confirmation)
    const scoring = input.capture().groups[1].scoring
    assert.equal(scoring.state, 'captured')
    const captured = scoring.entries.flatMap(e => e.paragraphs.map(p => p.text)).join('\n')
    for (const text of texts.slice(1)) assert(captured.includes(text), text)
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
    for (let i = 8; i < 8 + texts.length; i++) assert.equal(scopes.get(`p1:i${i}`)?.labelItemId, 'p1:i8')
    assert.deepEqual(input.confirmation, before)
  }
})

test('complete Chinese sample labels still end scoring ownership', () => {
  for (const label of ['范文1：', '范文一']) {
    const input = textReferences([['第一节 应用文', '参考范文', 'An application sample.'],
      ['第二节 读后续写', '评分标准', '评分正文。', label, 'An English sample.']])
    assert.equal(input.capture().groups[1].essays.entries[0].sourceLabel, label)
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
    assert.equal(scopes.get('p2:i2')?.labelItemId, 'p2:i1')
    assert.equal(scopes.get('p2:i3'), null, label)
    assert.equal(scopes.get('p2:i4'), null, label)
  }
})

test('scope retains text outside the producer complete entry-label grammar', () => {
  // These formerly scope-only matches never created a producer essay entry.
  // Keep both inputs and prove ownership now follows that same complete grammar.
  for (const text of ['参考范文①：', '范文２ An English sample.']) {
    const input = textReferences([['第一节 应用文', '参考范文', 'An application sample.'],
      ['第二节 读后续写', '评分标准', '评分正文。', text, 'An English sample.']])
    const output = input.capture().groups[1]
    assert.equal(output.essays.entries.length, 0)
    assert(JSON.stringify(output.scoring).includes(text))
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
    for (const itemId of ['p2:i2', 'p2:i3', 'p2:i4']) assert.equal(scopes.get(itemId)?.labelItemId, 'p2:i1')
  }
})

test('mentions of Version and versions outside the shared one-to-three grammar remain scoring prose', () => {
  for (const text of ['Version one is mentioned in the scoring guidance.', '评分时可参考 Version one 的结构。',
    'Version four:', 'Version 4:']) {
    const input = textReferences([['第一节 应用文', '评分原则', text,
      '第二节 读后续写', '参考范文', 'A synthetic ending.']])
    assert.match(JSON.stringify(input.capture().groups[0].scoring), new RegExp(text.replace(/[.]/gu, '\\.')))
    assert(sourceReferenceScoringScopes(input.confirmation, new Set(['answers'])).get('p1:i2'))
  }
})

for (const afterTranscript of [false, true]) test(
  `Yuanchuang exact scored-section and scoring-principles pair reopens p10–12 after ${afterTranscript ? 'transcript and bracketed explanations' : 'explanations'} without reprinted samples`, () => {
  const texts = Array.from({ length: 12 }, () => [])
  texts[1] = ['第四部分 写作', '第一节 应用文', '参考范文', 'Original application sample.',
    '第二节 读后续写', '参考范文', 'Original continuation sample.']
  texts[5] = ['答案详解', '21. A 本文是一篇应用文。']
  if (afterTranscript) {
    texts[2] = ['听力部分录音稿', 'Text 1', 'M: Synthetic transcript.']
    texts[5] = ['英语试卷参考答案与解析', '第一部分 听力（共两节，满分30分）',
      '第二部分 阅读（共两节，满分50分）', '21. C【解析】细节理解题。']
  }
  texts[9] = ['第一节（满分15分）', '一、评分原则', '1. 本题总分为15分，按各档次评分标准给分。',
    '二、各档次的给分范围和要求：', '第五档（13–15分）', '完全完成了试题规定的任务。']
  texts[10] = ['第一档（1–3分）', '遗漏大部分内容要点。', '写作二', 'Reprinted continuation sample.',
    '第二节（满分25分）', '一、评分原则', '1. 本题总分为25分，按5个档次给分。']
  texts[11] = ['2. 评分时，先根据所续写短文的内容和语言确定档次。', '二、各档次的给分范围和要求：',
    '第五档（21–25分）', '情节合理，语言连贯。']
  const input = textReferences(texts)
  const before = structuredClone(input.confirmation)
  const result = input.capture()
  assert.deepEqual(result.groups.map(g => g.scoring.state), ['captured', 'captured'])
  assert.deepEqual(result.groups.map(g => g.essays.entries[0].paragraphs[0].text),
    ['Original application sample.', 'Original continuation sample.'])
  assert(!JSON.stringify(result.groups).includes('Reprinted'))
  assert.deepEqual(result.groups.map(g => [...new Set(g.scoring.entries.flatMap(e => e.paragraphs.map(p => p.source.locator.page)))]),
    [[10, 11], [11, 12]])
  const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
  assert.equal(scopes.get('p10:i2').taskType, 'application')
  assert.equal(scopes.get('p11:i3'), null)
  assert.equal(scopes.get('p12:i0').taskType, 'continuation')
  assert.deepEqual(input.confirmation, before)
})

test('spaced rubric labels reopen scoring and capture entries through the same matching view', () => {
  for (const boundary of ['听力原文', '答案详解']) {
    for (const label of ['一、评 分 原 则', '各档次　给分范围和要求']) {
      const input = textReferences([
        ['第一节 应用文', '参考范文', 'Original application sample.',
          '第二节 读后续写', '参考范文', 'Original continuation sample.', boundary],
        ['第一节（满分１５分）', label, '1. 本题总分为15分，按五个档次进行评分。', 'Content (5 points)'],
      ])
      const before = structuredClone(input.confirmation)
      const { groups } = input.capture()
      assert.equal(groups[0].scoring.state, 'captured')
      assert.equal(groups[0].scoring.entries[0].sourceLabel, label, 'matching must preserve the exact source label')
      assert.match(JSON.stringify(groups[0].scoring), /Content \(5 points\)/u)
      assert.deepEqual(groups.map(g => g.essays.entries.map(e => e.paragraphs.map(p => p.text))),
        [[['Original application sample.']], [['Original continuation sample.']]])
      const ownership = sourceReferenceScoringScopes(input.confirmation, new Set(['answers'])).get('p2:i3')
      assert.equal(ownership.taskType, 'application')
      assert.equal(ownership.sourceLabel, label)
      assert.deepEqual(input.confirmation, before)
    }
  }
})

test('a bare scored section cannot reopen explanations without its exact score and adjacent rubric label', () => {
  for (const [heading, label] of [['第一节', '一、评分原则'], ['第一节（满分25分）', '一、评分原则'],
    ['第一节（满分15分）', '评分原则如下。'], ['第一节（满分15分）分析', '一、评分原则']]) {
    const input = textReferences([['第一节 应用文', '参考范文', 'Original application sample.',
      '第二节 读后续写', '参考范文', 'Original continuation sample.', '答案详解', heading, label, '评分正文。']])
    assert.deepEqual(input.capture().groups.map(g => g.scoring.state), ['not_supplied', 'not_supplied'])
  }
})

test('post-listening rubric resumes capture and admission without replacing either source essay', () => {
  const input = fixture()
  const captured = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar: captured })
  assert.equal(captured.schemaVersion, 'source-references-v4')
  assert.deepEqual(captured.groups.map(group => group.essays.entries.map(entry =>
    entry.paragraphs.map(p => p.text))), [[['Our original application sample.']], [['Our original continuation sample.']]])
  assert.deepEqual(captured.groups.map(group => group.scoring.entries.flatMap(entry =>
    entry.blocks.filter(block => block.kind === 'figure').map(block => [entry.sourceLabel, block.sourceRegionId]))), [
    [['二、各档次的给分范围和要求', 'answers:page-3:figure-4'],
      ['二、各档次的给分范围和要求', 'answers:page-3:figure-extra']],
    [['评分标准', 'answers:page-4:figure-5']],
  ])
})

test('post-listening scoring figure scopes retain version-specific rubric labels', () => {
  const input = fixture()
  for (const [version, label] of [
    ['ocr-source-references-producer-v22', '评分标准'],
    ['ocr-source-references-producer-v23', '二、各档次的给分范围和要求'],
    ['ocr-source-references-producer-v24', '二、各档次的给分范围和要求'],
    ['ocr-source-references-producer-v25', '二、各档次的给分范围和要求'],
  ]) {
    const scope = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']),
      { producerVersion: version, materialization: input.materialization })
    const captured = captureScoringReferences(input, { producerVersion: version })
    for (const itemId of ['answers:p3:i3', 'answers:p3:i5']) {
      assert.equal(scope.get(itemId)?.sourceLabel, label, `${version}: ${itemId}`)
    }
    const figures = captured.groups[0].scoring.entries.flatMap(entry =>
      entry.blocks.filter(block => block.kind === 'figure').map(block => [entry.sourceLabel, block.sourceRegionId]))
    assert.deepEqual(figures, [[label, 'answers:page-3:figure-4'], [label, 'answers:page-3:figure-extra']])
    if (version.endsWith('v25')) assertSourceReferenceAdmission({ ...input, sidecar: captured })
    if (version.endsWith('v23') || version.endsWith('v24')) {
      assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: captured }),
        { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
      const sourceReferencesBytes = Buffer.from(JSON.stringify(captured))
      const receipt = { revisionId: `synthetic-${version}`, bundleDigest: sha256('synthetic-bundle'),
        paperId: input.materialization.paperId, sourceDigest: input.sourceDigest,
        candidateDigest: input.candidateDigest, sourceReferencesDigest: sha256(sourceReferencesBytes) }
      assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes, receipt })
      assert.throws(() => assertSealedSourceReferenceReplay({ ...input, receipt,
        sourceReferencesBytes: Buffer.concat([sourceReferencesBytes, Buffer.from(' ')]) }),
      { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
    }
  }
})

test('admission compares retained and historically spaced source hyphens without accepting different words', () => {
  const input = fixture({ applicationSample: ['参考范文', 'We provide AI-\nbased feedback.'] })
  const captured = captureScoringReferences(input)
  const original = structuredClone(captured)
  for (const text of ['We provide AI-based feedback.', 'We provide AI- based feedback.']) {
    const sidecar = structuredClone(captured)
    sidecar.groups[0].essays.entries[0].paragraphs[0].text = text
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
  const wrong = structuredClone(captured)
  wrong.groups[0].essays.entries[0].paragraphs[0].text = 'We provide AI-based guidance.'
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: wrong }),
    /Reference text must replay surviving confirmed OCR items/u)
  const emptyFragment = structuredClone(captured)
  const paragraph = emptyFragment.groups[0].essays.entries[0].paragraphs[0]
  const continuation = structuredClone(paragraph.source)
  continuation.locator.region = { x: .999, y: .95, width: .001, height: .001 }
  paragraph.continuationSources = [continuation]
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: emptyFragment }),
    /Reference text must replay surviving confirmed OCR items/u, 'each region must replay at least one surviving item')
  assert.deepEqual(captured, original)
})

test('post-listening capture reuses shared parenthesized rubric labels without changing recognition', () => {
  for (const label of ['（二）各档次给分范围和要求：', '（一）评分原则：']) {
    const input = fixture({ label })
    const captured = captureScoringReferences(input)
    assertSourceReferenceAdmission({ ...input, sidecar: captured })
    assert(firstLineRole('entry-label', computeLineFacts({ text: label })))
    assert.equal(captured.groups[0].scoring.entries[0].sourceLabel, label)
  }
})

test('a listening boundary needs an exact rubric overview before any later writing-like heading', () => {
  for (const overview of ['教师笔记', '写作评分说明如下。', '注意：写作评分说明', '第二节 读后续写']) {
    const input = fixture({ overview })
    assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
    assert.equal(sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
      .get('answers:p3:i4'), null)
  }
})

test('an overview alone, a task alone or ordinary commentary cannot authorize unrelated figures', () => {
  for (const options of [
    { task: '教师笔记' },
    { task: '第一节' },
    { rubric: '教师笔记', label: '附图' },
    { rubric: '评分时应考虑内容。', label: '二、各档次的给分范围和要求如下。' },
  ]) assert.throws(() => captureScoringReferences(fixture(options)),
    /no surviving essay anchor or explicit scoring entry/u)
})

test('answer explanation remains terminal with an overview followed by an ordinary task heading', () => {
  for (const boundary of ['试题解析', '21. A 本文是一篇应用文。']) {
    assert.throws(() => captureScoringReferences(fixture({ boundary })),
      /no surviving essay anchor or explicit scoring entry/u)
  }
})

test('a separate rubric overview followed immediately by a full task rubric reopens after explanations', () => {
  const input = fixture({ boundary: '答案详解', overview: '写作评分标准',
    task: '一、应用文各档次的给分范围和要求：', label: '（三）各档次的给分范围和要求',
    continuationTask: '二、读后续写各档次的给分范围和要求：' })
  const before = structuredClone(input.confirmation)
  const sidecar = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.deepEqual(sidecar.groups.map(group => group.scoring.state), ['captured', 'captured'])
  assert.deepEqual(sidecar.groups.map(group => group.essays.entries[0].paragraphs[0].text),
    ['Our original application sample.', 'Our original continuation sample.'])
  assert.deepEqual(input.confirmation, before)
  const absentOverview = fixture({ boundary: '答案详解', overview: '正文中提到评分。',
    task: '一、应用文各档次的给分范围和要求：',
    label: '（三）各档次的给分范围和要求',
    continuationTask: '二、读后续写各档次的给分范围和要求：' })
  assert.throws(() => assertSourceReferenceAdmission({ ...absentOverview, sidecar }),
    /exact confirmed scoring label and Writing Task/u)
})

test('mentions of scoring in explanations or an overview without an adjacent full task rubric cannot reopen', () => {
  for (const options of [
    { overview: '解析中提到写作评分标准。', task: '一、应用文各档次的给分范围和要求：' },
    { overview: '写作评分标准如下。', task: '一、应用文各档次的给分范围和要求：' },
    { overview: '写作评分标准', task: '一、应用文各档次的给分范围和要求分析' },
    { overview: '写作评分标准', task: '正文中提到评分。' },
  ]) {
    const input = fixture({ boundary: '答案详解', ...options })
    assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
    assert.equal(sourceReferenceScoringScopes(input.confirmation, new Set(['answers'])).get('answers:p3:i4'), null)
  }
})

test('independent admission rejects a sidecar whose rubric overview is absent from sealed source', () => {
  const sidecar = captureScoringReferences(fixture())
  const input = fixture({ overview: '教师笔记' })
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
    /exact confirmed scoring label and Writing Task/u)
})

test('an answer-first application heading preserves its labeled sample without a writing-part heading', () => {
  for (const sampleHeading of ['应用文', '应用文：', '应用文:']) {
    const input = fixture({ sampleHeading })
    const sidecar = captureScoringReferences(input)
    const application = sidecar.groups[0].essays
    assert.equal(application.state, 'captured')
    assert.deepEqual(application.entries.map(entry => entry.paragraphs.map(p => p.text)),
      [['Our original application sample.']])
    assert.equal(application.entries[0].sourceLabel, '参考范文')
    assert.equal(application.entries[0].labelSource.locator.page, 1)
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
})

test('admission rejects false not_supplied for a confirmed labeled sample, including books without figures', () => {
  for (const withoutFigures of [false, true]) {
    const input = fixture()
    const sidecar = captureScoringReferences(input)
    const essays = sidecar.groups[0].essays
    essays.evidence = [essays.entries[0].labelSource]
    essays.state = 'not_supplied'
    essays.entries = []
    if (withoutFigures) {
      for (const document of input.confirmation.documents) for (const page of document.pages) {
        page.visualClassifications = page.visualClassifications.filter(visual => visual.classification !== 'content_media')
      }
      input.sourceInput.ocrSourceBytes.confirmationBytes = Buffer.from(JSON.stringify(input.confirmation))
      for (const group of sidecar.groups) for (const entry of group.scoring.entries) {
        entry.blocks = entry.blocks.filter(block => block.kind !== 'figure')
      }
    }
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
  }
})

test('answer-first application samples printed as omitted or actually absent stay not_supplied', () => {
  for (const applicationSample of [['参考范文', '略'], ['参考范文', '（略）'],
    ['One possible version:'], ['One possible version:', 'One possible version:'], []]) {
    const input = fixture({ sampleHeading: '应用文', applicationSample })
    const sidecar = captureScoringReferences(input)
    assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
    assert.deepEqual(sidecar.groups[0].essays.entries, [])
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
  assert.equal(firstLineRole('writing-section', computeLineFacts({ text: '应用文需要审题。' })), null)
})

const otherTaskHeadings = ['第二节 阅读理解', '第二节（阅读理解）', '（三）语法填空',
  '(三)语法填空（共10小题，满分15分）', '三、完形填空', '3. 七选五']

test('producer closes resumed scoring at other task headings instead of capturing their images', () => {
  for (const label of otherTaskHeadings) {
    const input = fixture({ label })
    assert.throws(() => captureScoringReferences(input),
      /no surviving essay anchor or explicit scoring entry/u, label)
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
    assert.equal(scopes.get('answers:p3:i3'), null, label)
    assert.equal(scopes.get('answers:p3:i5'), null, label)
  }
})

test('independent admission rejects other-task images assigned to the resumed writing rubric', () => {
  const original = captureScoringReferences(fixture())
  for (const label of otherTaskHeadings) {
    const input = fixture({ label })
    const sidecar = structuredClone(original)
    sidecar.groups[0].scoring.entries[0].sourceLabel = label
    for (const block of sidecar.groups[0].scoring.entries[0].blocks) {
      if (block.kind === 'paragraph') {
        block.paragraph.text = block.paragraph.text.replace('二、各档次的给分范围和要求', label)
      }
    }
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
      /exact confirmed scoring label and Writing Task/u, label)
  }
})

test('a listening boundary after an empty sample label cannot become essay text at admission', () => {
  for (const boundary of ['Text 1', '(Text 1)', '录音原文', '听力原文']) {
    const input = fixture({ sampleHeading: '应用文',
      applicationSample: ['One possible version:', boundary, 'M: This is a synthetic recording.'] })
    const sidecar = captureScoringReferences(input)
    assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
    assert.deepEqual(sidecar.groups[0].essays.entries, [])
    assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar }), boundary)
  }
})

const firstWritingHeadings = [
  ['第四部分 写作（满分40分）\n第一节'],
  ['第四部分 写作', '第一节'],
  ['第一节（应用文）'],
]

function listeningFirstFixture(writingHeading) {
  const input = scoringFiguresFixture({ writingHeading })
  input.confirmation.documents[1].pages[0].orderedItems[0].text = '听力原文'
  input.evidence.documents[1].pages[0].observations[0].text = '听力原文'
  const { evidenceDigest: _oldDigest, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = {
    evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)),
  }
  return input
}

test('producer accepts the first explicit writing heading after an earlier transcript', () => {
  for (const writingHeading of firstWritingHeadings) {
    const input = listeningFirstFixture(writingHeading)
    const sidecar = captureScoringReferences(input)
    assert.deepEqual(sidecar.groups.map(group => group.essays.entries.flatMap(entry =>
      entry.paragraphs.map(p => p.text))), [['Our original sample is short.'], ['Another original sample.']])
    assert.equal(sidecar.groups.flatMap(group => group.scoring.entries.flatMap(entry =>
      entry.blocks.filter(block => block.kind === 'figure'))).length, 3)
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
})

test('independent admission accepts scoring at the first writing heading after a transcript', () => {
  for (const writingHeading of firstWritingHeadings) {
    const sidecar = captureScoringReferences(scoringFiguresFixture({ writingHeading }))
    const input = listeningFirstFixture(writingHeading)
    assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar }))
  }
})

test('singular and plural possible-version labels capture only their following sample body', () => {
  for (const label of ['One possible version:', 'One possible versions:']) {
    const input = fixture({ applicationSample: [label, 'Our original application sample.'] })
    const sidecar = captureScoringReferences(input)
    const essays = sidecar.groups[0].essays
    assert.equal(essays.state, 'captured')
    assert.equal(essays.entries[0].sourceLabel, label)
    assert.deepEqual(essays.entries[0].paragraphs.map(p => p.text), ['Our original application sample.'])
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
})

test('singular and plural possible-version labels without a sample body stay not_supplied', () => {
  for (const label of ['One possible version:', 'One possible versions:']) {
    for (const tail of [[], ['略'], [label], ['Text 1', 'M: This is a synthetic recording.']]) {
      const input = fixture({ applicationSample: [label, ...tail] })
      const sidecar = captureScoringReferences(input)
      assert.equal(sidecar.groups[0].essays.state, 'not_supplied', `${label} ${tail}`)
      assert.deepEqual(sidecar.groups[0].essays.entries, [])
      assertSourceReferenceAdmission({ ...input, sidecar })
    }
  }
})

test('admission rejects false not_supplied for plural possible-version samples too', () => {
  const input = fixture({ applicationSample: ['One possible versions:', 'Our original application sample.'] })
  const sidecar = captureScoringReferences(input)
  const essays = sidecar.groups[0].essays
  essays.evidence = [essays.entries[0].labelSource ?? essays.entries[0].paragraphs[0].source]
  essays.state = 'not_supplied'
  essays.entries = []
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
    { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
})

function withObjectiveFigures(input, { pageIndex = 0, anchors = ['听力', 'C'], prefixTexts = [],
  pictureText = '题序 21 22\n答案 A D' } = {}) {
  const page = input.confirmation.documents[1].pages[pageIndex]
  const proof = input.evidence.documents[1].pages[pageIndex]
  proof.observations = anchors.flatMap((text, index) => [
    { observationId: `objective:${index}:anchor`, regionId: `objective:${index}:anchor-region`, text,
      region: { x: .1, y: .1 + index * .2, width: .6, height: .02 }, confidence: 1, alternatives: [] },
    { observationId: `objective:${index}:picture`, regionId: `objective:${index}:picture-region`,
      text: pictureText,
      region: { x: .1, y: .15 + index * .2, width: .6, height: .02 }, confidence: 1, alternatives: [] },
  ])
  proof.observations.unshift(...prefixTexts.map((text, index) => ({
    observationId: `objective:prefix:${index}`, regionId: `objective:prefix-region:${index}`, text,
    region: { x: .1, y: .02 + index * .03, width: .6, height: .02 }, confidence: 1, alternatives: [],
  })))
  proof.regions = proof.observations.map(item => ({ regionId: item.regionId, kind: 'text', region: item.region }))
  proof.readingOrderEdges = proof.observations.slice(1).map((item, index) => ({
    before: proof.observations[index].observationId, after: item.observationId,
  }))
  page.orderedItems = proof.observations.map(item => ({
    itemId: `${item.observationId}:item`, text: item.text, observationIds: [item.observationId],
  }))
  page.visualClassifications = anchors.map((_, index) => {
    const regionId = `answers:page-${pageIndex + 1}:objective-${index}`
    proof.regions.push({ regionId, kind: 'visual',
      region: { x: .08, y: .14 + index * .2, width: .75, height: .06 } })
    return { regionId, classification: 'content_media',
      itemIds: [`objective:${index}:picture:item`], afterItemId: `objective:${index}:anchor:item` }
  })
  const { evidenceDigest: _oldDigest, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
  return input
}

test('Nanchang objective figures before writing stay source evidence and preserve all consumed scoring figures', () => {
  const input = withObjectiveFigures(scoringFiguresFixture())
  const before = structuredClone(input)
  const result = buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { sourceDocuments: input.sourceDocuments })
  assert.equal(result.review.filter(item => /objective answer figure/u.test(item.issue)).length, 2)
  assert.deepEqual(structuredClone(input), before)
  const sidecar = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.equal(sidecar.groups.flatMap(group => group.scoring.entries.flatMap(entry =>
    entry.blocks.filter(block => block.kind === 'figure'))).length, 3)
  const missingScoring = structuredClone(sidecar)
  missingScoring.groups[0].scoring.entries[0].blocks =
    missingScoring.groups[0].scoring.entries[0].blocks.filter(block => block.kind !== 'figure')
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: missingScoring }),
    /one-to-one/u, 'objective exclusion must not hide omitted real scoring figures')
})

test('objective-looking figures after the first writing task still fail closed in producer and admission', () => {
  for (const sampleHeading of ['第一节 应用文', '第一节', '第一节 作答示例']) {
    const base = fixture({ sampleHeading })
    const continuation = base.confirmation.documents[1].pages[0].orderedItems
      .find(item => item.text === '第二节 读后续写')
    continuation.text = '第二节'
    base.evidence.documents[1].pages[0].observations
      .find(item => item.observationId === continuation.observationIds[0]).text = '第二节'
    const input = withObjectiveFigures(base, { pageIndex: 1 })
    assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u,
      sampleHeading)
    const sidecar = captureScoringReferences(fixture({ sampleHeading }))
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u, sampleHeading)
  }
})

test('ordinary sentence anchors before writing cannot silently discard a reference figure', () => {
  const input = withObjectiveFigures(scoringFiguresFixture(), { anchors: ['An ordinary sentence.'],
    pictureText: 'Synthetic unknown reference chart' })
  assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
  const sidecar = captureScoringReferences(scoringFiguresFixture())
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u)
})

for (const heading of ['写作评分说明', '写作评分标准', '评分细则', '评分标准',
  '一、评分原则', '（二）评分要求', '写 作 评 分 说 明：']) {
  test(`C-anchored figure after ${heading} stays fail-closed before a later writing task`, () => {
    const input = withObjectiveFigures(scoringFiguresFixture(), { anchors: ['C'], prefixTexts: [heading] })
    assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
    const sidecar = captureScoringReferences(scoringFiguresFixture())
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u)
  })
}

for (const heading of ['4. 评分细则', '【评分标准】']) {
  for (const boundary of ['producer', 'admission']) {
    test(`C-anchored figure after ${heading}: ${boundary} rejects omitted scoring figure`, () => {
      const input = withObjectiveFigures(scoringFiguresFixture(), { anchors: ['C'], prefixTexts: [heading] })
      if (boundary === 'producer') {
        assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
      } else {
        const sidecar = captureScoringReferences(scoringFiguresFixture())
        assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u)
      }
    })
  }
}

test('an ordinary sentence mentioning a scoring heading does not become an exclusion cutoff', () => {
  const input = withObjectiveFigures(scoringFiguresFixture(), {
    anchors: ['C'], prefixTexts: ['本段提到写作评分说明，但不是评分标题。'],
  })
  const result = buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { sourceDocuments: input.sourceDocuments })
  assert.equal(result.review.filter(item => /objective answer figure/u.test(item.issue)).length, 1)
  assertSourceReferenceAdmission({ ...input, sidecar: captureScoringReferences(input) })
})
