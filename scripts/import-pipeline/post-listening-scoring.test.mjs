import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { sourceReferenceScoringScopes } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { firstLineRole } from './ocr-line-roles.mjs'

// Synthetic source order: samples, transcript, then explicitly headed rubrics.
function fixture({ overview = '写作评分说明', boundary = '听力原文', task = '第一节：应用文写作（满分15分）',
  label = '二、各档次的给分范围和要求', rubric = '评分标准',
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
  const { evidenceDigest: _oldDigest, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = {
    evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)),
  }
  return input
}

test('post-listening rubric resumes capture and admission without replacing either source essay', () => {
  const input = fixture()
  const captured = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar: captured })
  assert.equal(captured.schemaVersion, 'source-references-v4')
  assert.deepEqual(captured.groups.map(group => group.essays.entries.map(entry =>
    entry.paragraphs.map(p => p.text))), [[['Our original application sample.']], [['Our original continuation sample.']]])
  assert.deepEqual(captured.groups.map(group => group.scoring.entries.flatMap(entry =>
    entry.blocks.filter(block => block.kind === 'figure').map(block => [entry.sourceLabel, block.sourceRegionId]))), [
    [['评分标准', 'answers:page-3:figure-4'],
      ['评分标准', 'answers:page-3:figure-extra']],
    [['评分标准', 'answers:page-4:figure-5']],
  ])
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

test('answer explanation remains terminal even with an exact later rubric overview', () => {
  for (const boundary of ['试题解析', '21. A 本文是一篇应用文。']) {
    assert.throws(() => captureScoringReferences(fixture({ boundary })),
      /no surviving essay anchor or explicit scoring entry/u)
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
