import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { prepareSourceReferences, validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { sourceReferenceScoringScopes } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { sourceReferenceObjectiveFigures, sourceReferenceFigureIdentity } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceWritingLifecycle, sourceReferenceEssayTaskStates } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { nck1OcrSourceSetDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION, LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
  PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, sourceReferenceProducerVersion } from '../../server/paper-import/sourceReferenceSemantics.mjs'
import { explicitWritingHeading, isSourceReferenceExplanationStart, isReadingAnswerPair } from '../../server/paper-import/sourceReferenceWritingRules.mjs'

const line = (text, y, left = .1, width = .8) => ({ text, y, left, width })

test('the complete detailed-answer divider ends v19 capture without changing historical title semantics', () => {
  const texts = ['应用文参考范文', 'Dear Sam,', 'Our club welcomes you.', 'Yours,', 'Li Hua',
    '读后续写参考范文', 'Mia found the owner.', '【答案详解】', '21. This explanation stays outside references.']
  const lines = texts.map((text, i) => ({ ...line(text, .1 + i * .03), itemId: `detail:${i}` }))
  const result = sourceReferenceWritingLifecycle(lines, {
    materialization: { groups: [] }, answerDocument: { role: 'official_answers' },
  })
  assert.equal(result.items.get('detail:7').ended, true)
  assert.equal(result.items.get('detail:8').ended, true)
  assert.deepEqual(result.sections.get('continuation').steps.filter(step => step.action === 'body')
    .map(step => step.line.text), ['Mia found the owner.'])
  for (const version of [LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION]) {
    assert.equal(isSourceReferenceExplanationStart('【答案详解】', version), false)
  }
  for (const text of ['【答案详解 AI 指导】', '【答案详解】unknown text']) {
    assert.equal(isSourceReferenceExplanationStart(text), false, text)
  }
})

// Bare part/sections plus a variable-width answer grid reproduce the alliance
// layout without copying its passages, answers or raster assets.
const objectiveGrid = '题序 1 2 3\n答案 A B C\n题序 4 5\n答案 C A'
function bareSectionsWithObjectiveFigure() {
  const input = scoringFiguresFixture({ writingHeading: ['第四部分', '第一节'] })
  const page = input.confirmation.documents[1].pages[0]
  const proof = input.evidence.documents[1].pages[0]
  const template = proof.observations[0]
  proof.observations = ['高三英语参考答案', objectiveGrid].map((text, i) => ({
    ...structuredClone(template), observationId: `answers:p1:grid-w${i}`, regionId: `answers:p1:grid-r${i}`,
    text, region: { x: .1, y: .1 + i * .1, width: .7, height: .02 },
  }))
  const region = { regionId: 'answers:p1:objective-grid', kind: 'visual',
    region: { x: .08, y: .19, width: .75, height: .05 } }
  proof.regions = [...proof.observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region })), region]
  proof.readingOrderEdges = [{ before: proof.observations[0].observationId, after: proof.observations[1].observationId }]
  page.orderedItems = proof.observations.map((o, i) => ({
    itemId: `answers:p1:grid-i${i}`, text: o.text, observationIds: [o.observationId],
  }))
  page.visualClassifications = [{ regionId: region.regionId, classification: 'content_media',
    itemIds: [page.orderedItems[1].itemId], afterItemId: page.orderedItems[0].itemId }]
  input.confirmation.documents[1].pages[3].orderedItems[0].text = '第二节'
  input.evidence.documents[1].pages[3].observations[0].text = '第二节'
  reseal(input)
  return input
}
function objectiveFigures(input) {
  const prepared = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  return { prepared, objective: sourceReferenceObjectiveFigures(input.confirmation, new Set(['answers']), prepared.referenceFigures) }
}
function replaceGrid(input, text) {
  input.confirmation.documents[1].pages[0].orderedItems[1].text = text
  input.evidence.documents[1].pages[0].observations[1].text = text
  reseal(input)
}

test('bare sections share task ownership and a proven objective region stays only in source evidence', () => {
  const input = bareSectionsWithObjectiveFigure()
  const { prepared, objective } = objectiveFigures(input)
  assert.equal(prepared.referenceFigures.length, 4)
  assert.deepEqual([...objective], [sourceReferenceFigureIdentity(prepared.referenceFigures[0])])
  const sidecar = captureScoringReferences(input)
  assert.deepEqual(sidecar.groups.map(g => g.scoring.entries.flatMap(e => e.blocks.filter(b => b.kind === 'figure')).length), [2, 1])
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('merged second-section sample heading preserves task switch through producer and admission', () => {
  const input = scoringFiguresFixture({ writingHeading: ['第四部分', '第一节'] })
  const page = input.confirmation.documents[1].pages[3]
  const [heading, sample] = page.orderedItems.splice(0, 2)
  page.orderedItems.unshift({ ...heading, text: '第二节\n参考范文',
    observationIds: [...heading.observationIds, ...sample.observationIds] })
  reseal(input)
  const prepared = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
  assert.equal(lifecycle.items.get(heading.itemId).action, 'entry')
  assert.equal(lifecycle.taskStarts.get(heading.itemId), 'continuation')
  const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']))
  const rubric = page.orderedItems.find(item => item.text === '评分标准')
  assert.equal(scopes.get(rubric.itemId).taskType, 'continuation')
  const sidecar = captureScoringReferences(input)
  assert.deepEqual(sidecar.groups.map(g => g.scoring.entries.flatMap(e => e.blocks.filter(b => b.kind === 'figure')).length), [2, 1])
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('v21 composed source labels retain their regions, task boundaries and figure ownership through admission', () => {
  const input = scoringFiguresFixture({ writingHeading: ['第四部分 写作', '第一节 One possible version:'] })
  const pages = input.confirmation.documents[1].pages
  const proof = input.evidence.documents[1].pages
  const appHeading = pages[2].orderedItems[1]
  const removedApp = pages[2].orderedItems.splice(2, 1)[0]
  const continuation = pages[3].orderedItems[0]
  continuation.text = '第二节 One possible version:'
  proof[3].observations[0].text = continuation.text
  const removedContinuation = pages[3].orderedItems.splice(1, 1)[0]
  for (const [page, removed] of [[proof[2], removedApp], [proof[3], removedContinuation]]) {
    page.observations = page.observations.filter(observation => !removed.observationIds.includes(observation.observationId))
    page.regions = page.regions.filter(region => page.observations.some(observation => observation.regionId === region.regionId)
      || region.kind === 'visual')
    page.readingOrderEdges = page.observations.slice(1).map((observation, index) => ({
      before: page.observations[index].observationId, after: observation.observationId,
    }))
  }
  reseal(input)
  const prepared = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
  assert.equal(lifecycle.taskStarts.get(appHeading.itemId), 'application')
  assert.equal(lifecycle.taskStarts.get(continuation.itemId), 'continuation')
  const sidecar = captureScoringReferences(input)
  const essays = sidecar.groups.map(group => group.essays.entries[0])
  assert.deepEqual(essays.map(entry => entry.sourceLabel), ['One possible version:', 'One possible version:'])
  assert.deepEqual(essays.map(entry => entry.paragraphs.map(p => p.text)),
    [['Our original sample is short.'], ['Another original sample.']])
  for (const [index, item] of [appHeading, continuation].entries()) {
    assert.deepEqual(essays[index].labelSource.locator.region,
      proof[index + 2].observations.find(observation => observation.observationId === item.observationIds[0]).region)
  }
  assert.deepEqual(sidecar.groups.map(group => group.scoring.entries.flatMap(entry =>
    entry.blocks.filter(block => block.kind === 'figure')).length), [2, 1])
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('v21 rejects composed labels outside writing, and historical versions do not open them', () => {
  for (const texts of [
    ['第三部分 阅读理解', '第一节 One possible version:', 'A source paragraph.'],
    ['第二节 阅读理解', '第一节 One possible version:', 'A source paragraph.'],
    ['第一节 One possible version:', 'A source paragraph.'],
  ]) {
    const input = writingFixture(texts, [])
    assert.equal(lifeFor(input).sections.size, 0)
  }
  const input = writingFixture(['第四部分 写作', '第一节 One possible version:', 'An application.',
    '第二节 One possible version:', 'A continuation.'])
  const current = lifeFor(input)
  assert.deepEqual([...current.sections.keys()], ['application', 'continuation'])
  for (const version of [17, 18, 19, 20]) {
    const source = prepareSourceReferenceWritingItems(...input, { producerVersion: `ocr-source-references-producer-v${version}` })
    assert.equal(sourceReferenceWritingLifecycle(source.lines, source).sections.size, 0)
  }
})

test('v21 preserves earlier essays across empty and multi-version repeated bare sections', () => {
  for (const [tail, expected] of [
    [['第一节 One possible version:', '第二节'], ['First original sample.']],
    [['第一节', '第二节'], ['First original sample.']],
    [['第一节 Version two:', 'Second original sample.', '第二节'],
      ['First original sample.', 'Second original sample.']],
    [['第一节 Version two:', 'Second original sample.', '第一节 Version three:',
      'Third original sample.', '第二节'], ['First original sample.', 'Second original sample.', 'Third original sample.']],
    [['第一节', 'Version two:', 'Second original sample.', '第二节'],
      ['First original sample.', 'Second original sample.']],
  ]) {
    const input = writingFixture(['第四部分 写作', '第一节', '参考范文', 'First original sample.', ...tail], ['application'])
    const output = buildSourceReferences(...input)
    assert.deepEqual(output.groups[0].essays.entries.map(entry => entry.paragraphs[0].text), expected)
  }
})

test('v21 protects samples after explicit and named task headings across repeated sections', () => {
  for (const heading of ['应用文参考范文', '应用文']) {
    for (const [tail, expected] of [
      [['第一节 One possible version:', '第二节'], ['Original application.']],
      [['第一节 Version two:', 'Another application.', '第二节'], ['Original application.', 'Another application.']],
      [['应用文参考范文', 'Another application.', '第二节'], ['Original application.', 'Another application.']],
    ]) {
      const input = writingFixture([heading, 'Original application.', ...tail], ['application'])
      const output = buildSourceReferences(...input)
      assert.deepEqual(output.groups[0].essays.entries.map(entry => entry.paragraphs[0].text), expected)
    }
    const input = writingFixture([heading, 'Original application.', '第一节', 'Unlabeled application.', '第二节'], ['application'])
    assert.throws(() => prepareSourceReferenceWritingItems(...input), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
    // The current producer degrades the unrecognized repeated section instead
    // of blocking; admission replays the same degraded baseline (BUB-168).
    const degraded = buildSourceReferences(...input)
    assert.equal(degraded.groups[0].essays.state, 'not_supplied')
    assert(degraded.review.some(entry => /degraded to not_supplied/u.test(entry.issue)))
    const sourceInput = { documents: [], ocrSourceBytes: {
      evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
    } }
    // Admission still fails closed when degraded evidence locators cannot be
    // proven against exact source bytes.
    assert.throws(() => assertSourceReferenceAdmission({ sidecar: { schemaVersion: 'source-references-v1',
      paperId: input[0].paperId, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
      sourceDigest: sha256('a'), candidateDigest: sha256('b'), materializationDigest: digestJson(input[0]),
      groups: degraded.groups }, materialization: input[0], sourceInput,
      sourceDigest: sha256('a'), candidateDigest: sha256('b') }),
      { code: 'SOURCE_REFERENCES_SOURCE_BYTES_CHANGED' })
    const part = writingFixture([heading, 'Original application.', '第四部分 写作\n第一节',
      '参考范文', 'Another application.'], ['application'])
    assert.throws(() => prepareSourceReferenceWritingItems(...part), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  }
})

test('v21 retains a complete unlabeled letter when a later bare section supplies another sample', () => {
  const input = writingFixture(['65. A', '第一节', 'Dear Sam,', 'Our class meets tomorrow.',
    'Yours,', 'Alex', '第二节 读后续写', '参考范文', 'A short continuation.',
    '第一节 Version two:', 'Another original application.'], ['application'])
  input[0].groups.unshift({ groupId: 'objective', questions: [{ sourceNumber: 65 }] })
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups[0].essays.entries.map(entry => entry.paragraphs.map(p => p.text)),
    [['Dear Sam,', 'Our class meets tomorrow.', 'Yours,', 'Alex'], ['Another original application.']])
})

test('v21 degrades unlabeled content after a repeated bare section to not_supplied', () => {
  const input = writingFixture(['第四部分 写作', '第一节', '参考范文', 'First original sample.',
    '第一节', 'Unlabeled new sample.', '第二节'], ['application'])
  assert.throws(() => prepareSourceReferenceWritingItems(...input), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  // Current producer: degrade the unlabeled repeat instead of blocking the
  // paper; admission accepts the matching degraded sidecar (BUB-168).
  const degraded = buildSourceReferences(...input)
  assert.equal(degraded.groups[0].essays.state, 'not_supplied')
  assert(degraded.review.some(entry => /degraded to not_supplied/u.test(entry.issue)))
  const sourceInput = { documents: [], ocrSourceBytes: {
    evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
  } }
  assert.throws(() => assertSourceReferenceAdmission({ sidecar: { schemaVersion: 'source-references-v1',
    paperId: input[0].paperId, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    sourceDigest: sha256('a'), candidateDigest: sha256('b'), materializationDigest: digestJson(input[0]),
    groups: degraded.groups }, materialization: input[0], sourceInput,
    sourceDigest: sha256('a'), candidateDigest: sha256('b') }),
    { code: 'SOURCE_REFERENCES_SOURCE_BYTES_CHANGED' })
})

for (const writingHeading of [['第四部分 写作', '第一节'], ['应用文参考范文'], ['应用文']]) {
test(`v21 admission rejects omission of either repeated-section sample: ${writingHeading.join(' / ')}`, () => {
  const input = scoringFiguresFixture({ writingHeading })
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  if (writingHeading.length === 1) {
    const removed = page.orderedItems.splice(1, 1)[0]
    const observations = proof.observations.filter(item => removed.observationIds.includes(item.observationId))
    proof.observations = proof.observations.filter(item => !removed.observationIds.includes(item.observationId))
    proof.regions = proof.regions.filter(region => !observations.some(item => item.regionId === region.regionId))
  }
  const sample = page.orderedItems.find(item => item.text === 'Our original sample is short.')
  const at = page.orderedItems.indexOf(sample) + 1
  const template = proof.observations[0]
  const added = ['第一节 Version two:', 'Another original application.'].map((text, i) => ({
    ...structuredClone(template), text, observationId: `answers:repeat:w${i}`, regionId: `answers:repeat:r${i}`,
    region: { x: .1, y: .195 + i * .012, width: .7, height: .01 },
  }))
  proof.observations.splice(at, 0, ...added)
  proof.regions.push(...added.map(observation => ({ regionId: observation.regionId, kind: 'text', region: observation.region })))
  proof.readingOrderEdges = proof.observations.slice(1).map((observation, index) => ({
    before: proof.observations[index].observationId, after: observation.observationId,
  }))
  page.orderedItems.splice(at, 0, ...added.map((observation, i) => ({
    itemId: `answers:repeat:i${i}`, text: observation.text, observationIds: [observation.observationId],
  })))
  reseal(input)
  const sidecar = captureScoringReferences(input)
  assert.deepEqual(sidecar.groups[0].essays.entries.map(entry => entry.paragraphs[0].text),
    ['Our original sample is short.', 'Another original application.'])
  assertSourceReferenceAdmission({ ...input, sidecar })
  for (const missingIndex of [0, 1]) {
    const forged = structuredClone(sidecar)
    forged.groups[0].essays.entries.splice(missingIndex, 1)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: forged }),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
  }
})
}

test('v17–v20 repeated-section lifecycle retains exact pre-fix replay bytes', () => {
  const texts = ['第四部分 写作', '第一节', '参考范文', 'First original sample.',
    '第一节', '第二节', '参考范文', 'Second original sample.']
  const lines = texts.map((text, i) => ({ text, itemId: `i${i}`, page: 1, left: .1, right: .9 }))
  for (const version of [17, 18, 19, 20]) {
    const result = sourceReferenceWritingLifecycle(lines, {
      materialization: { groups: [] }, answerDocument: { role: 'official_answers' },
      producerVersion: `ocr-source-references-producer-v${version}`,
    })
    const bytes = JSON.stringify({
      sections: [...result.sections].map(([task, section]) => ({ task, steps: section.steps.map(step =>
        ({ itemId: step.line.itemId, text: step.line.text, action: step.action, state: step.state })) })),
      items: [...result.items],
    })
    assert.equal(sha256(Buffer.from(bytes)), 'sha256:51540c855b2390f60a2eb72b476639aedad511bdf4aacc679b3b23fec8467416')
  }
})

test('sealed v17–v23 references retain exact bytes; supported explicit versions admit under their own rules', () => {
  const input = scoringFiguresFixture()
  for (const version of [17, 18, 19, 20, 21, 22, 23]) {
    const sidecar = captureScoringReferences(input, { producerVersion: `ocr-source-references-producer-v${version}` })
    const sourceReferencesBytes = Buffer.from(JSON.stringify(sidecar))
    assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes, receipt: {
      revisionId: `sealed-v${version}-revision`, bundleDigest: sha256(`sealed-v${version}-bundle`),
      paperId: input.materialization.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
      sourceReferencesDigest: sha256(sourceReferencesBytes),
    } })
    if (sidecar.producerVersion) assertSourceReferenceAdmission({ ...input, sidecar })
    else assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  }
})

test('ordinary entries are not task starts and cannot restart scoring after a sample', () => {
  const rows = ['第四部分', '第一节', '参考范文', 'An original sample.',
    '评分标准', 'Source criterion.', '参考范文', 'Another original sample.',
    '评分标准', 'Another criterion.']
  const [materialization, evidence, confirmation] = fixture([rows.map((text, i) => line(text, .1 + i * .06))])
  const lines = confirmation.documents[0].pages[0].orderedItems.map(item => ({ ...item, page: 1 }))
  const lifecycle = sourceReferenceWritingLifecycle(lines, { materialization, answerDocument: { role: 'official_answers' } })
  assert.deepEqual([...lifecycle.taskStarts], [['p1-i1', 'application']])
  assert.equal(lifecycle.items.get('p1-i6').action, 'entry')
  const scopes = sourceReferenceScoringScopes(confirmation, new Set(['answers']))
  assert.equal(scopes.get('p1-i5').labelItemId, 'p1-i4')
  assert.equal(scopes.get('p1-i6'), null)
  assert.equal(scopes.get('p1-i7'), null)
  assert.equal(scopes.get('p1-i9').labelItemId, 'p1-i8')
  assert.equal(scopes.get('p1-i9').taskType, 'application')
})

for (const text of [
  '第五档（13—15分）\n内容完整，语言准确。',
  '题序 1 3\n答案 A C',
  '题序 1 2 3\n答案 A B',
  '题序 1 2\n答案 A B\n题序 2 3\n答案 C D',
  '题序 1 2\n答案 A B\n题序 4 5\n答案 C D',
  '题序 1 2\n答案 A G',
  '题序 1 2\n答案 A D',
  '题序 1 2\n答案 A B\n评分标准',
  '',
]) test(`generic answer heading cannot exempt an unproven figure: ${JSON.stringify(text)}`, () => {
  const input = bareSectionsWithObjectiveFigure()
  replaceGrid(input, text)
  assert.equal(objectiveFigures(input).objective.size, 0)
  assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
})

test('objective-shaped figure after writing starts remains a required scoring region', () => {
  const input = bareSectionsWithObjectiveFigure()
  const page = input.confirmation.documents[1].pages[3], proof = input.evidence.documents[1].pages[3]
  const visual = page.visualClassifications[0]
  const picture = page.orderedItems.find(item => visual.itemIds.includes(item.itemId))
  picture.text = objectiveGrid
  proof.observations.find(o => picture.observationIds.includes(o.observationId)).text = objectiveGrid
  reseal(input)
  assert.equal(objectiveFigures(input).objective.size, 1)
  const sidecar = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  for (const e of sidecar.groups[1].scoring.entries) e.blocks = e.blocks.filter(b => b.kind !== 'figure')
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u)
})

for (const anchor of ['高三英语参考答案', 'A', '阅读']) test(`a second unknown region cannot borrow ${anchor}'s exemption`, () => {
  const input = bareSectionsWithObjectiveFigure()
  const page = input.confirmation.documents[1].pages[0], proof = input.evidence.documents[1].pages[0]
  page.orderedItems[0].text = proof.observations[0].text = anchor
  const original = page.visualClassifications[0]
  proof.regions.push({ regionId: 'answers:p1:unknown', kind: 'visual',
    region: { x: .08, y: .5, width: .75, height: .05 } })
  page.visualClassifications.push({ ...original, regionId: 'answers:p1:unknown', itemIds: [] })
  reseal(input)
  assert.equal(objectiveFigures(input).objective.size, 1)
  assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
})

for (const anchor of ['阅读', 'A']) test(`objective marker ${anchor} cannot hide a scoring image from producer or admission`, () => {
  const input = bareSectionsWithObjectiveFigure()
  const sidecar = captureScoringReferences(input)
  input.confirmation.documents[1].pages[0].orderedItems[0].text = anchor
  input.evidence.documents[1].pages[0].observations[0].text = anchor
  replaceGrid(input, '第五档（13—15分）\n内容完整，语言准确。')
  assert.equal(objectiveFigures(input).objective.size, 0)
  assert.throws(() => captureScoringReferences(input), /no surviving essay anchor or explicit scoring entry/u)
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /one-to-one/u)
})

test('bare section plus adjacent sample cannot reopen ended explanations or listening', () => {
  for (const boundary of ['答案解析', '听力原文']) {
    const rows = ['第一节 应用文', '参考范文', 'An original sample.', boundary,
      '第二节', '参考范文', '评分标准', 'Source criterion.']
    const input = fixture([rows.map((text, i) => line(text, .1 + i * .08))])
    const scopes = sourceReferenceScoringScopes(input[2], new Set(['answers']))
    assert.equal(scopes.get('p1-i6'), null)
    assert.equal(scopes.get('p1-i7'), null)
  }
})
function fixture(pageLines) {
  const evidencePages = []
  const pages = pageLines.map((rows, p) => {
    const observations = []
    const orderedItems = rows.map(({ text, y, left, width }, n) => {
      const observationIds = Array.from({ length: 4 }, (_, k) => {
        const observationId = `p${p + 1}-r${n}-w${k}`
        observations.push({ observationId, region: { x: left + width * k / 4, y, width: width / 4, height: .02 } })
        return observationId
      })
      return { itemId: `p${p + 1}-i${n}`, text, observationIds }
    })
    evidencePages.push({ page: p + 1, observations })
    return { page: p + 1, orderedItems }
  })
  return [
    { paperId: 'paper-reference-review', documents: [{ documentId: 'answers', role: 'official_answers',
      sha256: `sha256:${'a'.repeat(64)}`, mediaType: 'application/pdf', pageCount: pages.length }],
    groups: [{ groupId: 'writing-continuation', writingTask: { taskType: 'continuation' } }] },
    { documents: [{ documentId: 'answers', pages: evidencePages }] },
    { documents: [{ documentId: 'answers', pages }] },
  ]
}
const heading = [line('第二节 读后续写', .2), line('参考范文', .24)]
for (const divider of ['解析', '答案解析', '【解析】', '【答案解析】']) {
  for (const suffix of ['', ':', '：']) test(`whole explanation heading ends essay ownership: ${divider}${suffix}`, () => {
    const input = fixture([
      [...heading, line('The first source paragraph.', .3), line('The second source paragraph.', .4, .14, .76)],
      [line(`　${divider}${suffix}　`, .1), line('A', .2), line('Reading explanation in English.', .3),
        line('第二节 读后续写', .4), line('参考范文', .5), line('A reprinted sample.', .6)],
      [line('English on the following page stays outside references.', .2)],
    ])
    const before = structuredClone(input)
    const prepared = prepareSourceReferenceWritingItems(...input)
    const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
    for (const item of input[2].documents[0].pages.slice(1).flatMap(page => page.orderedItems)) {
      assert.deepEqual(lifecycle.items.get(item.itemId),
        { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
    }
    const captured = []
    const output = buildSourceReferences(...input, { onWritingCapture: item => captured.push(item) })
    assert.deepEqual(captured, ['p1-i2', 'p1-i3'].map(itemId =>
      ({ itemId, task: 'continuation', kind: 'essays' })))
    const entries = output.groups[0].essays.entries
    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0].paragraphs.map(p => p.text),
      ['The first source paragraph.', 'The second source paragraph.'])
    assert.deepEqual(entries[0].paragraphs.map(p => p.source.locator),
      [[.3, .1, .8], [.4, .14, .76]].map(([y, x, width]) =>
        ({ kind: 'page_region', documentId: 'answers', page: 1, region: { x, y, width, height: .02 } })))
    assert.deepEqual(input, before, 'matching must preserve sealed source bytes and order')
    const scopes = sourceReferenceScoringScopes(input[2], new Set(['answers']))
    for (const item of input[2].documents[0].pages.slice(1).flatMap(page => page.orderedItems)) {
      assert.equal(scopes.get(item.itemId), null)
    }
  })
}

test('A remains legitimate essay prose before an explanation boundary', () => {
  const input = fixture([[...heading, line('A', .3), line('A complete source paragraph.', .4, .14, .76)]])
  const prepared = prepareSourceReferenceWritingItems(...input)
  const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
  assert.equal(lifecycle.items.get('p1-i2').task, 'continuation')
  assert.equal(lifecycle.items.get('p1-i2').capturing, true)
  const entry = buildSourceReferences(...input).groups[0].essays.entries[0]
  assert.equal(entry.paragraphs[0].text, 'A')
  assert.equal(entry.paragraphs[0].source.locator.region.y, .3)
})

test('explanation mentions and unknown bracketed answer titles do not authorize essay labels', () => {
  for (const text of ['解析如下这篇范文…']) {
    const input = fixture([[...heading, line('The source paragraph.', .3), line(text, .4),
      line('The next source paragraph.', .5)]])
    const prepared = prepareSourceReferenceWritingItems(...input)
    const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
    const state = lifecycle.items.get('p1-i3')
    assert.equal(state.ended, false, text)
    assert.equal(state.capturing, false, text)
    assert.notEqual(state.action, 'entry', text)
    assert.equal(lifecycle.items.get('p1-i4').task, 'continuation')
    assert.equal(lifecycle.items.get('p1-i4').capturing, false)
    const entries = buildSourceReferences(...input).groups[0].essays.entries
    assert(entries.every(entry => entry.sourceLabel !== text))
    assert.deepEqual(entries.flatMap(entry => entry.paragraphs.map(p => p.source.locator.region.y)), [.3])
  }
  for (const text of ['【答案补充】', '[答案补充]', '【参考答案补充】']) {
    const input = fixture([[...heading, line('The source paragraph.', .3), line(text, .4),
      line('The next source paragraph.', .5)]])
    assert.throws(() => {
      const source = prepareSourceReferenceWritingItems(...input)
      sourceReferenceWritingLifecycle(source.lines, source)
    }, { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' }, text)
  }
})

for (const label of ['【范文四】', '[Possible Version 2]', '【范文十二】', '[范文12]', '【One possible version 12】',
  '【范文四（80词）】', '[范文12(80词)]', '【参考范文四（80词）】']) {
  test(`numbered bracketed sample preserves label, range and ownership: ${label}`, () => {
    const input = fixture([[line('第二节 读后续写', .1), line(label, .2),
      line('A source continuation paragraph.', .3, .14, .76)]])
    const captured = []
    const output = buildSourceReferences(...input, { onWritingCapture: item => captured.push(item) })
    assert.equal(output.producerVersion, OCR_SOURCE_REFERENCES_PRODUCER_VERSION)
    assert.equal(output.groups[0].essays.entries.length, 1)
    const entry = output.groups[0].essays.entries[0]
    assert.equal(entry.sourceLabel, label)
    assert.deepEqual(entry.labelSource, { documentSha256: input[0].documents[0].sha256,
      locator: { kind: 'page_region', documentId: 'answers', page: 1,
        region: { x: .1, y: .2, width: .8, height: .02 } } })
    assert.equal(entry.paragraphs[0].text, 'A source continuation paragraph.')
    assert.equal(entry.paragraphs[0].source.locator.region.y, .3)
    assert.deepEqual(captured, [{ itemId: 'p1-i2', task: 'continuation', kind: 'essays' }])
    const prepared = prepareSourceReferenceWritingItems(...input, { producerVersion: output.producerVersion })
    assert.deepEqual(sourceReferenceWritingLifecycle(prepared.lines, prepared).items.get('p1-i2'),
      { task: 'continuation', capturing: true, ended: false, kind: 'essays', action: 'body', labelItemId: 'p1-i1' })
  })
}

test('first admission rejects missing and unknown producer versions before sealing', () => {
  const input = scoringFiguresFixture()
  const sidecar = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  for (const version of [undefined, 'ocr-source-references-producer-v16',
    'ocr-source-references-producer-v999', null]) {
    const changed = structuredClone(sidecar)
    if (version === undefined) delete changed.producerVersion
    else changed.producerVersion = version
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed,
      producerVersion: LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
      sealedDigest: sha256(Buffer.from(JSON.stringify(changed))), legacy: true }),
    { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' }, String(version))
  }
  for (const schemaVersion of ['source-references-v1', 'source-references-v2', 'source-references-v3',
    'source-references-v4', 'source-references-v5']) {
    const changed = { ...sidecar, schemaVersion }
    delete changed.producerVersion
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' }, schemaVersion)
  }
})

test('sealed v17 replay requires the exact receipt digest and source identity', () => {
  const input = scoringFiguresFixture()
  for (const document of input.confirmation.documents) for (const page of document.pages) {
    const item = page.orderedItems.find(item => item.text === '3. Additional source criterion.')
    if (item) item.text = '解析'
  }
  for (const document of input.evidence.documents) for (const page of document.pages) {
    const item = page.observations.find(item => item.text === '3. Additional source criterion.')
    if (item) item.text = '解析'
  }
  reseal(input)
  const historical = captureScoringReferences(input, { producerVersion: LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION })
  assert.equal(Object.hasOwn(historical, 'producerVersion'), false)
  assert.throws(() => sourceReferenceProducerVersion(historical), { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  assert.equal(historical.groups.flatMap(g => g.scoring.entries.flatMap(e => e.blocks)).filter(b => b.kind === 'figure').length, 3)
  const original = structuredClone(historical)
  const sourceReferencesBytes = Buffer.from(JSON.stringify(historical))
  // A pre-existing receipt is kept fixed while replay bytes are varied.
  const receipt = Object.freeze({ revisionId: 'sealed-v17-revision', bundleDigest: sha256('sealed-v17-bundle'),
    paperId: input.materialization.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    sourceReferencesDigest: sha256(sourceReferencesBytes) })
  const replay = { ...input, sourceReferencesBytes, receipt }
  assertSealedSourceReferenceReplay(replay)
  const explicitV17Bytes = Buffer.from(JSON.stringify({ ...historical, producerVersion: LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION }))
  assertSealedSourceReferenceReplay({ ...replay, sourceReferencesBytes: explicitV17Bytes,
    receipt: { ...receipt, sourceReferencesDigest: sha256(explicitV17Bytes) } })
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: historical, receipt }),
    { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  for (const bytes of [
    Buffer.concat([sourceReferencesBytes, Buffer.from('\n')]),
    Buffer.from(JSON.stringify({ ...historical, producerVersion: LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION })),
    Buffer.from(JSON.stringify({ ...historical, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION })),
  ]) assert.throws(() => assertSealedSourceReferenceReplay({ ...replay, sourceReferencesBytes: bytes }),
    { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  for (const key of ['paperId', 'sourceDigest', 'candidateDigest', 'sourceReferencesDigest']) {
    assert.throws(() => assertSealedSourceReferenceReplay({ ...replay, receipt: { ...receipt, [key]: sha256('changed') } }),
      { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  }
  assert.throws(() => assertSealedSourceReferenceReplay({ ...replay, receipt: undefined }),
    { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  const changedBinding = structuredClone(input.materialization)
  changedBinding.paperName = 'Changed source binding'
  assert.throws(() => assertSealedSourceReferenceReplay({ ...replay, materialization: changedBinding }),
    { code: 'SOURCE_REFERENCES_BINDING_STALE' })
  assert.deepEqual(historical, original)
  // The same ranges cannot claim current semantics; no external override can
  // reinterpret a bound sidecar as the caller's preferred version. The exact
  // rejection moved to sealed figure/scoring replay once soft-scope errors
  // degrade (BUB-168), but admission still refuses the mismatched claim.
  assert.throws(() => assertSourceReferenceAdmission({ ...input,
    sidecar: { ...historical, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION },
    producerVersion: LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION }),
  /Scoring figure requires its exact confirmed scoring label|SOURCE_REFERENCE_WRITING_SCOPE_INVALID/u)
  const prepared = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  const boundary = prepared.lines.find(line => line.text === '解析')
  const state = sourceReferenceWritingLifecycle(prepared.lines, prepared).items.get(boundary.itemId)
  assert.deepEqual(state, { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
})

test('source-reference semantic discriminator is explicit and rejects unknown versions', () => {
  for (const schemaVersion of ['source-references-v1', 'source-references-v2', 'source-references-v3',
    'source-references-v4', 'source-references-v5']) {
    assert.throws(() => sourceReferenceProducerVersion({ schemaVersion }),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
    assert.equal(sourceReferenceProducerVersion({ schemaVersion, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION }),
      OCR_SOURCE_REFERENCES_PRODUCER_VERSION)
  }
  for (const producerVersion of [null, '', 'v18', 'ocr-source-references-producer-v16', 'ocr-source-references-producer-v999']) {
    assert.throws(() => sourceReferenceProducerVersion({ schemaVersion: 'source-references-v4', producerVersion }),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  }
  for (const producerVersion of ['ocr-source-references-producer-v17', 'ocr-source-references-producer-v19',
    'ocr-source-references-producer-v20', 'ocr-source-references-producer-v21', 'ocr-source-references-producer-v22',
    'ocr-source-references-producer-v23', 'ocr-source-references-producer-v24', 'ocr-source-references-producer-v25',
    'ocr-source-references-producer-v26']) {
    assert.equal(sourceReferenceProducerVersion({ schemaVersion: 'source-references-v4', producerVersion }), producerVersion)
  }
})

const writingFixture = (texts, tasks = ['application', 'continuation']) => {
  const input = fixture([texts.map((text, index) => line(text, .1 + index * .025))])
  input[0].groups = tasks.map(taskType => ({ groupId: `writing-${taskType}`, writingTask: { taskType } }))
  return input
}
const lifeFor = (input, options) => {
  const source = prepareSourceReferenceWritingItems(...input, options)
  return sourceReferenceWritingLifecycle(source.lines, source)
}

test('lifecycle scope errors leave unknown writing tasks empty in producer and admission', () => {
  for (const prefix of [['参考范文（略）'], ['评分细则（格式错扣1分）：'],
    ['【听力录音稿】', 'Unconfirmed adjacency.']]) {
    const input = writingFixture([...prefix, '第一节 应用文', '参考范文', 'An application.',
      '第二节 读后续写', '参考范文', 'A continuation.'])
    const result = buildSourceReferences(...input)
    assert.deepEqual(result.groups.map(group => [group.essays.state, group.scoring.state]),
      [['not_supplied', 'not_supplied'], ['not_supplied', 'not_supplied']], prefix.join('/'))
    assert(result.review.some(entry => /degraded to not_supplied/u.test(entry.issue)))
    const states = sourceReferenceEssayTaskStates(input[2], new Set(['answers']), input[0], input[1])
    assert(![...states.values()].some(state => state.capturing))
  }
  const input = writingFixture(['第一节 应用文', '参考范文', 'An application.',
    '第四部分 写作\n第一节', '参考范文', 'An unowned repeat.',
    '第二节 读后续写', '参考范文', 'A continuation.'])
  const result = buildSourceReferences(...input)
  assert.equal(result.groups[0].essays.state, 'not_supplied')
  assert.equal(result.groups[1].essays.state, 'captured')
})

test('admission shares repeated-part degradation while preserving continuation scoring figures', () => {
  const input = scoringFiguresFixture({ writingHeading: ['第四部分 写作', '第一节'] })
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  page.visualClassifications = []
  proof.regions = proof.regions.filter(region => region.kind !== 'visual')
  page.orderedItems.at(-1).text = proof.observations.at(-1).text = '第四部分 写作\n第一节'
  reseal(input)
  const sidecar = captureScoringReferences(input)
  assert.equal(sidecar.groups[0].essays.state, 'not_supplied')
  assert.equal(sidecar.groups[0].scoring.state, 'not_supplied')
  assert.equal(sidecar.groups[1].essays.state, 'captured')
  assert.equal(sidecar.groups[1].scoring.state, 'captured')
  assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar }))
})

test('v22 ends a captured sample at adjacent reading answer pair and retains a later rubric', () => {
  const input = fixture([
    [...heading, line('The last part came', .3), line('true.', .33), line('【A篇】', .4),
      line('21-23 BAC', .43), line('【主题语境】人与社会', .46)],
    ['第二节（满分25分）', '评分标准', '按内容和语言给分。'].map((text, i) => line(text, .1 + i * .1)),
  ])
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups[0].essays.entries[0].paragraphs.map(p => p.text), ['The last part came true.'])
  assert.deepEqual(scoringTexts(output), ['按内容和语言给分。'])
  const lifecycle = lifeFor(input)
  assert.equal(lifecycle.items.get('p1-i3').capturing, true)
  assert.equal(lifecycle.items.get('p1-i4').ended, true)
  assert.equal(lifecycle.items.get('p1-i5').ended, true)
  assert.throws(() => prepareSourceReferenceWritingItems(...input, { producerVersion: 'ocr-source-references-producer-v21' }),
    /Unresolved writing reference title/u)
})

test('reading answer boundary requires the exact complete pair and a captured essay', () => {
  for (const [title, answers] of [['【A篇】', '21-23 BA'], ['【A篇】', '21-23 BAC extra'],
    ['【E篇】', '21-23 BAC'], ['[A篇]', '21-23 BAC'], ['【A篇】 extra', '21-23 BAC'],
    ['【A篇】', '23-21 BAC'], ['【A篇】', '21–23 BAC'], ['【A篇】', '21-23 BaC']]) {
    assert.equal(isReadingAnswerPair(title, answers), false, `${title} / ${answers}`)
  }
  for (const title of ['【A篇】', '【B篇】', '【C篇】', '【D篇】']) {
    assert.equal(isReadingAnswerPair(title, '21-23 BAC'), true)
  }
  for (const suffix of [['【A篇】', 'The next sentence.'], ['【A篇】', '21-23 BA'],
    ['【A篇】', 'Intervening item.', '21-23 BAC']]) {
    const input = writingFixture(['第二节 读后续写', '参考范文', 'A complete sample.', ...suffix], ['continuation'])
    assert.throws(() => lifeFor(input), /Unresolved writing reference title/u)
  }
  const outside = writingFixture(['【A篇】', '21-23 BAC'], [])
  assert.equal(lifeFor(outside).sections.size, 0)
  const noBody = writingFixture(['第二节 读后续写', '参考范文', '【A篇】', '21-23 BAC'], ['continuation'])
  assert.throws(() => lifeFor(noBody), /Unresolved writing reference title/u)
  const input = writingFixture(['第二节 读后续写', '参考范文', 'A complete sample.', '【A篇】', '21-23 BAC'], ['continuation'])
  const prepared = prepareSourceReferenceWritingItems(...input)
  const candidate = prepared.lines.find(item => item.text === '【A篇】')
  candidate.nextSourceItemId = 'intervening-source-item'
  assert.throws(() => sourceReferenceWritingLifecycle(prepared.lines, prepared), /Unresolved writing reference title/u)
})

const givenArticleTitle = 'Protect Our Campus: Say No to Graffiti'
const articleFixture = (texts, pagesAfter = []) => {
  const input = fixture([texts.map((text, i) => line(text, .15 + i * .04)), ...pagesAfter])
  input[0].groups = [
    { groupId: 'grammar', questions: [{ sourceNumber: 65 }] },
    { groupId: 'writing-application', writingTask: { taskType: 'application',
      givenSkeleton: [{ role: 'title', text: givenArticleTitle }] } },
    { groupId: 'writing-continuation', writingTask: { taskType: 'continuation' } },
  ]
  return input
}

test('answer-first given-title article and numbered continuation capture once and stop before explanations and a late empty title', () => {
  const input = articleFixture(['听力：1—5 AACBC', '阅读理解：21—23 DCB',
    '61 exhibited; 62 to observe; 63 consistency; 64 which; 65 a',
    givenArticleTitle, 'Recently, our campus has suffered damage.',
    'Let us keep our school beautiful.',
    '67. 读后续写参考例文（文章来源 Chicken soup for the teenage soul）',
    'The speaker called on me.', 'I noticed that people became kinder.', '答案详解',
    'Reading explanation stays outside.'], [
    [line('66. 应用文参考例文', .2), line('听力材料', .3), line('Text 1', .4), line('M: A transcript.', .5)],
  ])
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups.map(g => g.essays.entries.length), [1, 1])
  assert.deepEqual(output.groups[0].essays.entries[0].paragraphs.map(p => [p.role, p.text]), [
    ['title', givenArticleTitle], ['body', 'Recently, our campus has suffered damage. Let us keep our school beautiful.'],
  ])
  assert.equal(output.groups[1].essays.entries[0].sourceLabel,
    '67. 读后续写参考例文（文章来源 Chicken soup for the teenage soul）')
  assert.equal(lifeFor(input).items.get('p2-i0').ended, true)
  assert(!JSON.stringify(output.groups).includes('Reading explanation'))
  assert(!JSON.stringify(output.groups).includes('transcript'))
  const starts = []
  sourceReferenceScoringScopes(input[2], new Set(['answers']), {
    materialization: input[0], onWritingStart: (_document, itemId) => starts.push(itemId),
  })
  assert.deepEqual(starts, ['p1-i3'], 'objective listening answers cannot hide the given-title writing start')
})

test('numbered sample grammar is closed and v19 keeps its exact old heading semantics', () => {
  for (const [title, taskType] of [['66. 应用文参考例文', 'application'],
    ['67. 读后续写参考例文（文章来源 Chicken soup for the teenage soul）', 'continuation']]) {
    assert.equal(explicitWritingHeading(title)?.taskType, taskType)
    assert.equal(explicitWritingHeading(title, 'ocr-source-references-producer-v19'), null)
  }
  for (const title of ['67. 读后续写参考例文（任意尾注）', '67. 读后续写参考例文（文章来源 Broken',
    '67. 读后续写参考例文（文章来源 ）', '66. 应用文参考例文分析', '详解正文提及参考例文',
    '66. 应用文参考例文（文章来源 A book）']) assert.equal(explicitWritingHeading(title), null, title)
})

test('a late empty application heading immediately before listening retains the proven article without an explanation divider', () => {
  const input = articleFixture(['65 a', givenArticleTitle, 'A complete article.',
    '67. 读后续写参考例文', 'A complete continuation.',
    '66. 应用文参考例文', '听力材料', 'Text 1', 'M: A transcript.'])
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups.map(group => group.essays.entries.length), [1, 1])
  assert.equal(output.groups[0].essays.entries[0].paragraphs[1].text, 'A complete article.')
  assert.equal(output.groups[1].essays.entries[0].paragraphs[0].text, 'A complete continuation.')
})

test('sealed v19 references replay and admit with v19 predicates', () => {
  const input = scoringFiguresFixture()
  const producerVersion = 'ocr-source-references-producer-v19'
  const sidecar = captureScoringReferences(input, { producerVersion })
  const sourceReferencesBytes = Buffer.from(JSON.stringify(sidecar))
  assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes, receipt: {
    revisionId: 'sealed-v19-revision', bundleDigest: sha256('sealed-v19-bundle'),
    paperId: input.materialization.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    sourceReferencesDigest: sha256(sourceReferencesBytes),
  } })
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('given-title article survives independent admission and cannot be forged as absent or retitled', () => {
  const input = scoringFiguresFixture()
  const application = input.materialization.groups.find(group => group.writingTask?.taskType === 'application')
  application.writingTask.givenSkeleton = [{ role: 'title', text: givenArticleTitle }]
  input.sourceInput.materializationBytes = Buffer.from(JSON.stringify(input.materialization))
  const answerProof = input.evidence.documents.find(document => document.documentId === 'answers')
  const answerConfirmation = input.confirmation.documents.find(document => document.documentId === 'answers')
  for (const [index, page] of answerConfirmation.pages.entries()) {
    const proof = answerProof.pages[index], template = proof.observations[0]
    const texts = index === 0 ? ['65 a', givenArticleTitle, 'An original source article.',
      '67. 读后续写参考例文（文章来源 A synthetic book）', 'An original continuation.', '答案详解']
      : index === 3 ? ['66. 应用文参考例文', '听力材料', 'Text 1', 'M: A transcript.'] : ['Synthetic source index.']
    proof.observations = texts.map((text, i) => ({ ...structuredClone(template), text,
      observationId: `answers:article:p${index + 1}:w${i}`, regionId: `answers:article:p${index + 1}:r${i}`,
      region: { x: .1, y: .15 + i * .06, width: .7, height: .02 } }))
    proof.regions = proof.observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region }))
    proof.readingOrderEdges = proof.observations.slice(1).map((o, i) => ({
      before: proof.observations[i].observationId, after: o.observationId,
    }))
    page.orderedItems = proof.observations.map((o, i) => ({
      itemId: `answers:article:p${index + 1}:i${i}`, text: o.text, observationIds: [o.observationId],
    }))
    page.visualClassifications = []
  }
  reseal(input)
  const sidecar = captureScoringReferences(input)
  sidecar.schemaVersion ??= 'source-references-v1'
  assertSourceReferenceAdmission({ ...input, sidecar })
  const absent = structuredClone(sidecar)
  absent.groups[0].essays = { state: 'not_supplied', entries: [],
    evidence: [sidecar.groups[0].essays.entries[0].paragraphs[0].source] }
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: absent }),
    { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
  application.writingTask.givenSkeleton[0].text = 'A Different Task Title'
  const retitled = { ...sidecar, materializationDigest: digestJson(input.materialization) }
  input.sourceInput.materializationBytes = Buffer.from(JSON.stringify(input.materialization))
  // The retitled task no longer matches its confirmed source range; under the
  // current producer the replay degrades that task, so the sealed sidecar is
  // rejected for content drift rather than the old scope error (BUB-168).
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: retitled }),
    /preserve every confirmed sample|SOURCE_REFERENCE_WRITING_SCOPE_INVALID/u)
})

test('given-title article entry rejects unrelated titles, copied prompts, missing body and cross-explanation ownership', () => {
  const goodBody = ['An original source paragraph.', '67. 读后续写参考例文', 'A continuation sample.']
  for (const texts of [
    ['65 a', 'An Unrelated Reading Title', ...goodBody],
    ['65 a', givenArticleTitle, '注意：词数 80 左右。', ...goodBody],
    ['65 a', givenArticleTitle, '67. 读后续写参考例文', 'A continuation sample.'],
    ['64 a', givenArticleTitle, ...goodBody],
    ['65 a', '答案详解', givenArticleTitle, ...goodBody],
    ['65 a', givenArticleTitle, 'An unterminated source fragment', '67. 读后续写参考例文', 'A continuation sample.'],
    ['65 a', givenArticleTitle, 'A paragraph without a proven next boundary.'],
  ]) assert.equal(lifeFor(articleFixture(texts)).sections.has('application'), false, JSON.stringify(texts))
  const cross = articleFixture(['65 a', givenArticleTitle, 'A complete paragraph.', '答案详解', 'An explanation.'],
    [[line('66. 应用文参考例文', .2), line('听力材料', .3)]])
  // Even a late explicit heading cannot claim preceding prose across explanations.
  cross[0].groups[1].writingTask.givenSkeleton = []
  assert.throws(() => lifeFor(cross), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
})

test('v19 explicit tasks accept only full named headings and task-compatible scores', () => {
  for (const [title, taskType] of [
    ['应用文', 'application'], ['应用文写作（满分15分）：', 'application'],
    ['书面表达（满分15分）', 'application'], ['读后续写（满分25分）：', 'continuation'],
    ['应用文参考范文：', 'application'], ['读后续写参考范文：', 'continuation'],
  ]) {
    assert.equal(explicitWritingHeading(title)?.taskType, taskType, title)
    const input = writingFixture([title, 'A source paragraph.'], [taskType])
    const output = buildSourceReferences(...input)
    assert.equal(output.groups[0].essays.entries.length, 1, title)
    assert.equal(output.groups[0].essays.entries[0].paragraphs[0].text, 'A source paragraph.')
    assert.equal(lifeFor(input).taskStarts.get('p1-i0'), taskType)
  }
  for (const title of ['满分15分', '应用文（满分25分）', '读后续写（满分15分）',
    '应用文需要审题。', '67. 读后续写参考例文（任意尾注）', '68. 应用文参考例文',
    '应用文参考范文分析', '67. 应用文参考例文']) assert.equal(explicitWritingHeading(title, 'ocr-source-references-producer-v19'), null, title)
})

test('application stance labels preserve two entries with independent source ranges', () => {
  const input = writingFixture(['应用文参考范文：', '范文一：支持立场',
    'A first source paragraph.', 'Another first paragraph.', 'Last first paragraph.',
    '范文二：反对立场', 'A second source paragraph.', 'Another second paragraph.', 'Last second paragraph.',
    '读后续写参考范文：', 'The first continuation paragraph.', 'The second continuation paragraph.'])
  // Real short paragraph ends supply the geometric separation; full-width
  // fixture lines would correctly join as a single printed paragraph.
  for (const index of [2, 3, 6, 7]) {
    const ids = input[2].documents[0].pages[0].orderedItems[index].observationIds
    for (const [offset, id] of ids.entries()) {
      const observation = input[1].documents[0].pages[0].observations.find(item => item.observationId === id)
      observation.region.x = .1 + .1 * offset
      observation.region.width = .1
    }
  }
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups.map(g => g.essays.entries.length), [2, 1])
  assert.deepEqual(output.groups[0].essays.entries.map(e => e.sourceLabel), ['范文一：支持立场', '范文二：反对立场'])
  assert.deepEqual(output.groups[0].essays.entries.map(e => e.paragraphs.length), [3, 3])
  assert.notDeepEqual(output.groups[0].essays.entries[0].labelSource, output.groups[0].essays.entries[1].labelSource)
  assert.throws(() => lifeFor(writingFixture(['应用文参考范文：', '范文一：任意立场', 'A paragraph.'], ['application'])),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  assert.throws(() => lifeFor(writingFixture(['读后续写参考范文：', '范文一：支持立场', 'A paragraph.'], ['continuation'])),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  assert.equal(lifeFor(writingFixture(['范文一：支持立场', 'A paragraph.'])).sections.size, 0)
})

const applicationRubric = ['1. 内容要点：', '（1）描述使用 AI 的经历。', '（2）阐述 AI 的作用。',
  '2. 语言：符合征文特征。', '3. 阅卷原则：公正公平。', '4. 阅卷标准：要点齐全。']
test('complete application scoring sequence and continuation rubric exclude explanation ownership', () => {
  const input = writingFixture(['第一节 应用文写作', 'One possible version:', 'An official source sample.',
    ...applicationRubric, '第二节 读后续写', 'One possible version:', 'A source continuation.',
    '1. 续写思路：', '（1）AI 只是这里的中文解释。', '（注释） A quoted English fragment.',
    '2. 评分参考', '（2）关注语言逻辑。', '（3）注重意义的传达。', '(Text 1)', 'M: A transcript.'])
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups.map(g => g.essays.entries.length), [1, 1])
  assert.deepEqual(output.groups.map(g => g.scoring.entries.map(e => e.sourceLabel)), [['1. 内容要点：'], ['2. 评分参考']])
  const scoring = output.groups[0].scoring.entries.flatMap(e => e.paragraphs.map(p => p.text)).join('')
  for (const text of applicationRubric.slice(1)) assert(scoring.includes(text), text)
  const source = prepareSourceReferenceWritingItems(...input)
  const lifecycle = sourceReferenceWritingLifecycle(source.lines, source)
  const scopes = sourceReferenceScoringScopes(input[2], new Set(['answers']))
  for (const step of lifecycle.sections.get('application').steps.filter(s => s.action === 'body' && s.state.kind === 'scoring')) {
    assert.deepEqual(scopes.get(step.line.itemId), { taskType: 'application', labelItemId: 'p1-i3', sourceLabel: '1. 内容要点：' })
  }
  assert.equal(scopes.get('p1-i13'), null, 'continuation thought cannot inherit scoring')
  for (const rubric of [applicationRubric.slice(0, -1),
    [...applicationRubric.slice(0, 3), applicationRubric[4], applicationRubric[3], applicationRubric[5]],
    [...applicationRubric, applicationRubric[5]]]) {
    assert.throws(() => lifeFor(writingFixture(['第一节 应用文写作', 'A sample.', ...rubric], ['application'])),
      { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  }
})

test('same-item task omissions remain task-local and reject contradictory sample prose', () => {
  const input = writingFixture(['第一节 应用文写作（范文略）', '评分细则：', '应用文评分正文。',
    '第二节 读后续写（范文略）', '评分原则', '续写评分正文。'])
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups.map(g => g.essays.state), ['not_supplied', 'not_supplied'])
  assert.deepEqual(output.groups.map(g => g.scoring.entries[0].paragraphs[0].text), ['应用文评分正文。', '续写评分正文。'])
  assert.deepEqual([...lifeFor(input).taskStarts], [['p1-i0', 'application'], ['p1-i3', 'continuation']])
  const missing = writingFixture(['第一节 应用文写作（范文略）', '评分细则：', '应用文评分正文。', '评分原则', '续写评分正文。'])
  assert.equal(lifeFor(missing).sections.has('continuation'), false, 'missing OCR heading cannot be inferred from rubric content')
  assert.throws(() => lifeFor(writingFixture(['第一节 应用文写作（范文略）', 'A source sample.'], ['application'])),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
})

test('unresolved nonempty sample ranges fail capture and admission instead of claiming absence', () => {
  for (const [supplied, suffix] of [
    [false, ['（幼苗 and roots）']],
    [false, ['【参考范文补充说明】', 'An actual source sample.']],
    [true, ['【参考范文补充说明】', 'An actual second sample.']],
    [true, ['（幼苗 and roots）']],
    [true, ['（中文指导）', '（幼苗 and roots）']],
    [false, ['（1）借助 AI 学习。', '参考范文', 'A later resolved sample.']],
  ]) {
    const prefix = ['第二节 读后续写', '参考范文', ...(supplied ? ['A complete first sample.'] : [])]
    const input = writingFixture([...prefix, ...suffix], ['continuation'])
    const retained = writingFixture(supplied ? prefix : [...prefix, '略'], ['continuation'])
    const bytes = Buffer.from('Synthetic answer document')
    for (const value of [input, retained]) value[0].documents[0].sha256 = sha256(bytes)
    for (const page of input[2].documents[0].pages) page.visualClassifications = []
    const output = buildSourceReferences(...retained)
    const sidecar = { schemaVersion: 'source-references-v1', producerVersion: output.producerVersion,
      paperId: input[0].paperId, sourceDigest: sha256('source'), candidateDigest: sha256('candidate'),
      materializationDigest: digestJson(input[0]), groups: output.groups }
    const sourceInput = { documents: [{ ...input[0].documents[0], bytes }], ocrSourceBytes: {
      evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
    } }
    assert.throws(() => lifeFor(input), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
    // Current producer degrades the unresolved range to not_supplied instead
    // of blocking (BUB-168); the pre-degradation sidecar no longer replays.
    const degraded = buildSourceReferences(...input)
    assert.equal(degraded.groups[0].essays.state, 'not_supplied')
    assert(degraded.review.some(entry => /degraded to not_supplied/u.test(entry.issue)))
    // A sidecar captured under supplied content still cannot claim its sample
    // once the degraded replay loses it; an explicit-略 absence replays the
    // same not_supplied shape and is admitted as equivalent honest absence.
    const admit = () => assertSourceReferenceAdmission({ sidecar, materialization: input[0], sourceInput,
      sourceDigest: sidecar.sourceDigest, candidateDigest: sidecar.candidateDigest })
    if (supplied) assert.throws(admit, /preserve every confirmed sample/u)
    else admit()
  }
})

test('task ranges reject unresolved content without requiring a sample label', t => {
  for (const [task, titles] of [
    ['application', ['应用文', '应用文写作（满分15分）：', '应用文(满分15分):', '书面表达（满分15分）']],
    ['continuation', ['读后续写', '读后续写（满分25分）', '读后续写(满分25分):', '读后续写（满分25分）：']],
  ]) for (const title of titles) for (const suffix of [
    ['（幼苗 and roots）'],
    ['（中文 AI 指导）', 'An actual source sample.'],
    ['（中文指导）', '（幼苗 and roots）'],
    ['未决中文内容。'],
    ['（中文 AI 指导）', '参考范文', 'A later source sample.'],
    ['（中文 AI 指导）', '评分标准', 'A later source criterion.'],
  ]) {
    const input = writingFixture([title, ...suffix], [task])
    const retained = writingFixture([title, '略'], [task])
    const bytes = Buffer.from('Synthetic task answer document')
    for (const value of [input, retained]) {
      value[0].documents[0].sha256 = sha256(bytes)
      for (const page of value[2].documents[0].pages) page.visualClassifications = []
    }
    const output = buildSourceReferences(...retained)
    const sidecar = { schemaVersion: 'source-references-v1', producerVersion: output.producerVersion,
      paperId: input[0].paperId, sourceDigest: sha256('source'), candidateDigest: sha256('candidate'),
      materializationDigest: digestJson(input[0]), groups: output.groups }
    const sourceInput = { documents: [{ ...input[0].documents[0], bytes }], ocrSourceBytes: {
      evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
    } }
    assert.throws(() => lifeFor(input), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' }, title)
    // The current producer degrades unresolved task content to not_supplied
    // rather than blocking the paper (BUB-168).
    const degraded = buildSourceReferences(...input)
    assert.equal(degraded.groups[0].essays.state, 'not_supplied', title)
    assert(degraded.review.some(entry => /degraded to not_supplied/u.test(entry.issue)), title)
    // The retained explicit-略 sidecar and the degraded baseline are the same
    // not_supplied shape; admission accepts the equivalent honest absence.
    assertSourceReferenceAdmission({
      sidecar, materialization: input[0], sourceInput,
      sourceDigest: sidecar.sourceDigest, candidateDigest: sidecar.candidateDigest,
    })
  }
})

test('task-adjacent tables need explicit scoring ownership, including inline scoring task headings', t => {
  const input = scoringFiguresFixture({ table: true, essays: false, writingHeading: ['应用文评分细则'] })
  const page = input.confirmation.documents[1].pages[2]
  const proof = input.evidence.documents[1].pages[2]
  const removed = new Set(page.orderedItems.find(item => item.text === '评分标准').observationIds)
  page.orderedItems = page.orderedItems.filter(item => item.text !== '评分标准')
  const removedRegions = new Set(proof.observations.filter(o => removed.has(o.observationId)).map(o => o.regionId))
  proof.observations = proof.observations.filter(o => !removed.has(o.observationId))
  proof.regions = proof.regions.filter(r => !removedRegions.has(r.regionId))
  proof.readingOrderEdges = proof.observations.slice(1).map((o, i) =>
    ({ before: proof.observations[i].observationId, after: o.observationId }))
  reseal(input)
  const sidecar = captureScoringReferences(input)
  assert(sidecar.groups[0].scoring.entries.flatMap(e => e.blocks).some(b => b.kind === 'table'))
  assertSourceReferenceAdmission({ ...input, sidecar })
  // The same confirmed table under an ordinary task has no scoring owner.
  page.orderedItems[0].text = '应用文写作（满分15分）'
  proof.observations[0].text = page.orderedItems[0].text
  reseal(input)
  assert.throws(() => captureScoringReferences(input), /essay anchor|writing-task scope/u)
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: null }))
  for (const title of ['应用文（满分15分）', '读后续写（满分25分）']) {
    const prepared = prepareSourceReferenceWritingItems(...writingFixture([title, 'Source table cell.']))
    prepared.lines[1].table = { kind: 'table', rows: [[{ text: 'Source table cell.' }]] }
    assert.throws(() => sourceReferenceWritingLifecycle(prepared.lines, prepared),
      { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  }
})

test('v19 replay retains the deferred 66/67 example-title rejection', () => {
  for (const title of ['66. 应用文参考例文', '67. 读后续写参考例文',
    '67. 读后续写参考例文（文章来源 Chicken soup for the teenage soul）']) {
    const producerVersion = 'ocr-source-references-producer-v19'
    assert.equal(explicitWritingHeading(title, producerVersion), null)
    const source = prepareSourceReferenceWritingItems(...writingFixture([title, 'A source sample.']), { producerVersion })
    assert.equal(sourceReferenceWritingLifecycle(source.lines, source).sections.size, 0)
  }
})

test('empty explicit sample range cannot borrow a transcript or silently become not_supplied', () => {
  assert.throws(() => lifeFor(writingFixture(['应用文参考范文：', '(Text 1)', 'M: A transcript.'], ['application'])),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  assert.throws(() => lifeFor(writingFixture(['应用文参考范文：', '范文一：支持立场', 'A source sample.',
    '范文二：反对立场', '(Text 1)'], ['application'])),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
  const unclosedAlternate = writingFixture(['应用文参考范文：', 'A main sample.',
    '备选试题参考答案', '应用文参考范文：', 'An alternate sample.'], ['application'])
  assert.throws(() => lifeFor(unclosedAlternate),
    { code: 'SOURCE_REFERENCES_ALTERNATE_SCOPE_INVALID' })
  assert.throws(() => lifeFor(unclosedAlternate, { producerVersion: 'ocr-source-references-producer-v25' }),
    { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
})

test('admission rejects fake absence for new task headings and missing source task boundaries', () => {
  for (const texts of [
    ['应用文参考范文：', 'A confirmed sample.'],
    ['第一节 应用文写作', ...applicationRubric],
    ['第一节 应用文写作（范文略）', '评分细则', '应用文评分正文。'],
  ]) {
    const input = writingFixture(texts)
    const sourceInput = { documents: [], ocrSourceBytes: {
      evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
    } }
    // Unresolved scopes now degrade to not_supplied at the producer; a null
    // sidecar still cannot claim absence over confirmed capture states
    // (BUB-168 moved the rejection from scope to essay coverage).
    assert.throws(() => assertSourceReferenceAdmission({ sidecar: null, materialization: input[0], sourceInput }),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
  }
  const input = writingFixture(['应用文参考范文：', 'A confirmed sample.'], ['application'])
  assert.throws(() => assertSourceReferenceAdmission({ sidecar: null, materialization: input[0],
    sourceInput: { documents: [], ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(input[1])),
      confirmationBytes: Buffer.from(JSON.stringify(input[2])) } } }),
  { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
})

test('admission finds explicit tasks across separate official-answer documents', () => {
  const input = writingFixture(['第一节 应用文写作（范文略）'])
  const continuation = writingFixture(['第二节 读后续写（范文略）'])
  for (const [index, part] of continuation.entries()) {
    const document = structuredClone(part.documents[0])
    document.documentId = 'continuation-answers'
    input[index].documents.push(document)
  }
  for (const document of input[2].documents) {
    for (const page of document.pages) page.visualClassifications ??= []
  }
  const sourceInput = { documents: [], ocrSourceBytes: {
    evidenceBytes: Buffer.from(JSON.stringify(input[1])), confirmationBytes: Buffer.from(JSON.stringify(input[2])),
  } }
  assert.doesNotThrow(() => assertSourceReferenceAdmission({ sidecar: null, materialization: input[0], sourceInput }))
})

for (const heading of ['高三英语试题听力录音稿', '2026届高中毕业班适应性练习英语听力部分录音稿']) {
  test(`complete transcript heading requires adjacent Text1 and closes scoring: ${heading}`, () => {
    const input = writingFixture(['应用文', '评分原则', '评分正文。', heading, '(Text 1)', 'M: A transcript.'], ['application'])
    const output = buildSourceReferences(...input)
    assert.equal(output.groups[0].scoring.entries[0].paragraphs[0].text, '评分正文。')
    assert.equal(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get('p1-i3'), null)
    const unmatched = writingFixture(['应用文', '评分原则', '评分正文。', heading, 'A line without Text1.'], ['application'])
    assert(sourceReferenceScoringScopes(unmatched[2], new Set(['answers'])).get('p1-i3'))
  })
}

test('v18 sealed replay keeps its semantics, first admission accepts it and altered bytes fail closed', () => {
  const input = scoringFiguresFixture()
  const sidecar = captureScoringReferences(input, { producerVersion: PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION })
  assert.equal(sidecar.producerVersion, PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION)
  const sourceReferencesBytes = Buffer.from(JSON.stringify(sidecar))
  const receipt = Object.freeze({ revisionId: 'sealed-v18-revision', bundleDigest: sha256('sealed-v18-bundle'),
    paperId: input.materialization.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    sourceReferencesDigest: sha256(sourceReferencesBytes) })
  assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes, receipt })
  assertSourceReferenceAdmission({ ...input, sidecar, receipt })
  for (const bytes of [Buffer.concat([sourceReferencesBytes, Buffer.from('\n')]),
    Buffer.from(JSON.stringify({ ...sidecar, producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION }))]) {
    assert.throws(() => assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt }),
      { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  }
  assert.equal(explicitWritingHeading('应用文参考范文：', PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION), null)
  const mergedPart = writingFixture(['第四部分 写作 应用文参考范文：', 'A source sample.'], ['application'])
  const previousSource = prepareSourceReferenceWritingItems(...mergedPart,
    { producerVersion: PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION })
  assert.equal(sourceReferenceWritingLifecycle(previousSource.lines, previousSource).sections.size, 0)
  const historical = writingFixture(['第二节 读后续写', '参考范文', 'A source sample.', '范文分析', 'A'], ['continuation'])
  const before = buildSourceReferences(...historical, { producerVersion: PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION })
  const after = buildSourceReferences(...historical)
  assert.equal(before.groups[0].essays.entries.length, 2)
  assert.equal(after.groups[0].essays.entries.length, 1)
})

for (const appendix of [
  ['写作评分说明', '读后续写评分标准', '评分标准'],
  ['第二节（满分25分）', '评分标准'],
]) test(`explicit scoring appendix alone reopens after explanation: ${appendix[0]}`, () => {
  const input = fixture([
    [...heading, line('A complete source sample.', .3), line('【答案解析】：', .4)],
    [...appendix, '按内容和语言给分。', '参考范文', 'A reprinted sample.']
      .map((text, i) => line(text, .1 + i * .1)),
  ])
  const prepared = prepareSourceReferenceWritingItems(...input)
  const lifecycle = sourceReferenceWritingLifecycle(prepared.lines, prepared)
  const output = buildSourceReferences(...input)
  assert.deepEqual(output.groups[0].essays.entries.map(e => e.paragraphs.map(p => p.text)),
    [['A complete source sample.']])
  assert.deepEqual(scoringTexts(output), ['按内容和语言给分。'])
  const criterion = `p2-i${appendix.length}`
  assert.equal(lifecycle.items.get(criterion).kind, 'scoring')
  assert.equal(lifecycle.items.get(criterion).capturing, false)
  assert.equal(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get(criterion).taskType, 'continuation')
  const reprint = `p2-i${appendix.length + 2}`
  assert.equal(lifecycle.items.get(reprint).capturing, false)
  assert.equal(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get(reprint), null)
})

const scoringTexts = output => output.groups[0].scoring.entries.flatMap(e =>
  (e.paragraphs ?? e.blocks.filter(b => b.kind === 'paragraph').map(b => b.paragraph)).map(p => p.text))
function reseal(input) {
  const { evidenceDigest: _old, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
}

function adjacentEssay({ label = '参考范文', combined = false, twoEntries = false, unlabeledLetter = false } = {}) {
  const input = scoringFiguresFixture()
  if (combined) {
    input.materialization.documents[1].role = input.sourceDocuments[1].role = 'question_and_answers'
    input.evidence.sourceSetDigest = input.confirmation.sourceSetDigest = nck1OcrSourceSetDigest(input.sourceDocuments)
    input.sourceInput.materializationBytes = Buffer.from(JSON.stringify(input.materialization))
  }
  for (const document of input.confirmation.documents) for (const page of document.pages) page.visualClassifications = []
  for (const document of input.evidence.documents) for (const page of document.pages) {
    page.regions = page.regions.filter(region => region.kind !== 'visual')
  }
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  const template = proof.observations[0]
  const rows = [
    ['第四部分 写作（满分40分）\n第一节', .08, .1, .8],
    ...(unlabeledLetter ? [['评分标准', .12, .1, .35], ['注意内容完整。', .16, .1, .35],
      ['Dear Sam,', .20, .1, .35]] : [[label, .12, .1, .35]]),
    ...(twoEntries ? [['First sample closes.', .16, .1, .35], ['范文二', .20, .1, .35]] : []),
    ['Our original', .24, .1, .35], ['sample is short.', .1, .6, .3],
    ...(unlabeledLetter ? [['Yours,', .14, .6, .3], ['Alex', .18, .6, .3]]
      : [['评分标准', .4, .1, .8], ['Source criterion closes.', .44, .1, .8]]),
  ]
  proof.observations = rows.map(([text, y, x, width], i) => ({
    ...structuredClone(template), text, observationId: `answers:interior:w${i}`,
    regionId: `answers:interior:r${i}`, region: { x, y, width, height: .02 },
  }))
  proof.regions = proof.observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region }))
  proof.readingOrderEdges = proof.observations.slice(1).map((o, i) => ({
    before: proof.observations[i].observationId, after: o.observationId,
  }))
  page.orderedItems = proof.observations.map((o, i) => ({
    itemId: `answers:interior:i${i}`, observationIds: [o.observationId], text: o.text,
  }))
  reseal(input)
  const sidecar = captureScoringReferences(input)
  sidecar.schemaVersion ??= 'source-references-v1'
  return { input, sidecar }
}

test('shared capture ownership of an unlabeled letter takes precedence over an open scoring label', () => {
  const { input, sidecar } = adjacentEssay({ unlabeledLetter: true })
  const paragraph = sidecar.groups[0].essays.entries[0].paragraphs.find(p => p.role === 'body')
  assert.equal(paragraph.text, 'Our original sample is short.')
  assert.equal(paragraph.continuationSources.length, 1)
  const item = input.confirmation.documents[1].pages[2].orderedItems.find(item => item.text === 'Our original')
  assert(sourceReferenceScoringScopes(input.confirmation, new Set(['answers'])).get(item.itemId))
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('rereview P1-1 enlarged first fragment cannot include another essay entry', () => {
  const { input, sidecar } = adjacentEssay({ twoEntries: true })
  assert.equal(sidecar.groups[0].essays.entries.length, 2)
  const p = sidecar.groups[0].essays.entries[1].paragraphs[0]
  assert.equal(p.text, 'Our original sample is short.')
  assert.equal(p.continuationSources.length, 1)
  assertSourceReferenceAdmission({ ...input, sidecar })
  p.source.locator.region = { x: .1, y: .16, width: .35, height: .10 }
  p.text = 'First sample closes. 范文二 Our original sample is short.'
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /continuation.*ownership/iu)
})

test('rereview P1-1 a gap inside one fragment is rejected even when every item has the same essay owner', () => {
  const { input, sidecar } = adjacentEssay()
  assertSourceReferenceAdmission({ ...input, sidecar })
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  const first = page.orderedItems.find(item => item.text === 'Our original')
  const original = proof.observations.find(o => o.observationId === first.observationIds[0])
  const additions = [
    { text: 'Skipped source words.', x: .48, width: .05 },
    { text: 'more', x: .11, width: .2 },
  ].map(({ text, x, width }, i) => ({ ...structuredClone(original), text,
    observationId: `answers:gap:w${i}`, regionId: `answers:gap:r${i}`,
    region: { ...original.region, x, width } }))
  proof.observations.push(...additions)
  proof.regions.push(...additions.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region })))
  page.orderedItems.splice(page.orderedItems.indexOf(first) + 1, 0, ...additions.map((o, i) => ({
    itemId: `answers:gap:i${i}`, text: o.text, observationIds: [o.observationId],
  })))
  reseal(input)
  sidecar.groups[0].essays.entries[0].paragraphs[0].text = 'Our original more sample is short.'
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /continuation.*source order/iu)
})

for (const options of [
  { combined: true }, { label: '考场作文' }, { label: '参考答案' },
  { label: '(One possible version)' }, { label: '【示例二】' },
]) test(`rereview P1-${options.combined ? 2 : 3} adjacent essay accepts ${JSON.stringify(options)}`, () => {
  const { input, sidecar } = adjacentEssay(options)
  const entry = sidecar.groups[0].essays.entries[0]
  assert.equal(entry.sourceLabel, options.label ?? '参考范文')
  assert.equal(entry.paragraphs[0].text, 'Our original sample is short.')
  assert.equal(entry.paragraphs[0].continuationSources.length, 1)
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('rereview P1-3 Chinese sample citations remain rubric prose rather than entry labels', () => {
  for (const citation of ['范文1中“结构清晰”值得参考。', '范文2的衔接自然。']) {
    const input = fixture([[line('第一节 应用文', .08), line('评分标准', .12), line(citation, .16)]])
    input[0].groups[0].writingTask.taskType = 'application'
    assert(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get('p1-i2'))
    const output = buildSourceReferences(...input)
    assert.equal(output.groups[0].essays.entries.length, 0)
    assert.equal(output.groups[0].scoring.entries[0].paragraphs[0].text, citation)
  }
})

test('P1-1 admission preserves lexical hyphens while accepting whitespace after a hyphen', () => {
  const input = scoringFiguresFixture()
  const item = input.confirmation.documents[1].pages[3].orderedItems.find(i => i.text === '—Use clear links between ideas.')
  item.text = '—The employee will re-sign tomorrow; use well-known examples and AI- based feedback.'
  input.evidence.documents[1].pages[3].observations.find(o => o.observationId === item.observationIds[0]).text = item.text
  reseal(input)
  const sidecar = captureScoringReferences(input)
  const paragraph = sidecar.groups[1].scoring.entries[0].blocks.find(b => b.kind === 'paragraph').paragraph
  for (const text of [item.text, item.text.replace('AI- based', 'AI-based')]) {
    paragraph.text = text
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
  for (const [before, after] of [['re-sign', 'resign'], ['well-known', 'wellknown']]) {
    paragraph.text = item.text.replace(before, after)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /Reference text must replay/u)
  }
})

test('P1-2 same-page continuation cannot splice a foreign scoring entry across intervening source items', () => {
  const input = scoringFiguresFixture()
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  const sample = page.orderedItems.find(i => i.text === 'Our original sample is short.')
  const criterion = page.orderedItems.find(i => i.text === '4. Closing source criterion.')
  for (const [item, x, width] of [[sample, .1, .35], [criterion, .6, .3]]) {
    const observation = proof.observations.find(o => o.observationId === item.observationIds[0])
    observation.region = { ...observation.region, x, width }
    proof.regions.find(r => r.regionId === observation.regionId).region = observation.region
  }
  reseal(input)
  const sidecar = captureScoringReferences(input)
  assertSourceReferenceAdmission({ ...input, sidecar })
  const p = sidecar.groups[0].essays.entries[0].paragraphs[0]
  const score = sidecar.groups[0].scoring.entries.flatMap(e => e.blocks)
    .find(b => b.kind === 'paragraph' && b.paragraph.text === criterion.text).paragraph
  p.continuationSources = [structuredClone(score.source)]
  p.text += ` ${criterion.text}`
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /continuation.*(?:order|ownership)/iu)
})

test('P1-3 a real rubric heading beneath a repeated title survives and is reviewed', () => {
  const title = '联合考试高三英语', grade = '第五档（21—25分）'
  const input = fixture([
    [...heading, line('A complete sample.', .28), line('评分标准', .32), line('前页评分完整。', .4)],
    [line(title, .06, .25, .5), line(grade, .094, .35, .3), line('内容完整，逻辑清晰，语言准确。', .15)],
  ])
  const original = fixture([[line(title, .06, .25, .5)]])
  for (const i of [0, 1, 2]) input[i].documents.push({ ...original[i].documents[0], documentId: 'question',
    ...(i === 0 ? { role: 'question_source' } : {}) })
  const output = buildSourceReferences(...input)
  assert(scoringTexts(output).includes(grade))
  assert(output.review.some(r => r.itemId === 'p2-i1' && /subtitle.*retained/u.test(r.issue)))
})

test('P1-2 even adjacent source items cannot cross essay/scoring ownership', () => {
  const input = scoringFiguresFixture()
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  const sample = page.orderedItems.find(i => i.text === 'Our original sample is short.')
  const label = page.orderedItems.find(i => i.text === '评分标准')
  assert.equal(page.orderedItems.indexOf(label), page.orderedItems.indexOf(sample) + 1)
  for (const [item, x, width] of [[sample, .1, .35], [label, .6, .3]]) {
    const observation = proof.observations.find(o => o.observationId === item.observationIds[0])
    observation.region = { ...observation.region, x, width }
    proof.regions.find(r => r.regionId === observation.regionId).region = observation.region
  }
  reseal(input)
  const sidecar = captureScoringReferences(input)
  const p = sidecar.groups[0].essays.entries[0].paragraphs[0]
  p.source.locator.page = page.page
  p.source.locator.region = structuredClone(proof.observations.find(o => o.observationId === sample.observationIds[0]).region)
  p.text = sample.text
  const labelSource = structuredClone(p.source)
  labelSource.locator.region = structuredClone(proof.observations.find(o => o.observationId === label.observationIds[0]).region)
  p.continuationSources = [labelSource]
  p.text += ` ${label.text}`
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /continuation.*ownership/iu)
})

test('P1-2 adjacent fragments in one essay pass with or without reference figures', () => {
  const input = scoringFiguresFixture()
  const page = input.confirmation.documents[1].pages[2], proof = input.evidence.documents[1].pages[2]
  const sample = page.orderedItems.find(i => i.text === 'Our original sample is short.')
  const observation = proof.observations.find(o => o.observationId === sample.observationIds[0])
  sample.text = observation.text = 'Our original'
  observation.region = { ...observation.region, x: .1, width: .35 }
  proof.regions.find(r => r.regionId === observation.regionId).region = observation.region
  const next = { ...structuredClone(observation), observationId: 'answers:split:word',
    regionId: 'answers:split:region', text: 'sample is short.', region: { x: .6, y: .18, width: .3, height: .02 } }
  proof.observations.push(next)
  proof.regions.push({ regionId: next.regionId, kind: 'text', region: next.region })
  const second = { itemId: 'answers:split:item', text: next.text, observationIds: [next.observationId] }
  page.orderedItems.splice(page.orderedItems.indexOf(sample) + 1, 0, second)
  proof.readingOrderEdges.push({ before: observation.observationId, after: next.observationId })
  reseal(input)
  const sidecar = captureScoringReferences(input)
  const p = sidecar.groups[0].essays.entries[0].paragraphs[0]
  assert.equal(p.text, 'Our original sample is short.')
  assert.equal(p.continuationSources.length, 1)
  assertSourceReferenceAdmission({ ...input, sidecar })
  for (const document of input.confirmation.documents) for (const page of document.pages) page.visualClassifications = []
  for (const document of input.evidence.documents) for (const page of document.pages) {
    page.regions = page.regions.filter(region => region.kind !== 'visual')
  }
  for (const group of sidecar.groups) for (const entry of group.scoring.entries) {
    entry.blocks = entry.blocks.filter(block => block.kind !== 'figure')
  }
  reseal(input)
  // Removing visual classifications releases the picture's OCR text into the
  // rubric and changes paragraph boundaries. The old rubric is now incomplete.
  assert.deepEqual(validateSourceReferences({ ...input, sidecar }), [])
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), {
    code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID',
    message: 'Current references must preserve every confirmed sample, scoring paragraph, label, task and source locator',
  })
  const withoutFigures = { ...prepareSourceReferences(input), groups: captureScoringReferences(input).groups }
  assert.deepEqual(withoutFigures.groups[0].essays.entries[0].paragraphs[0], p)
  assert.deepEqual(validateSourceReferences({ ...input, sidecar: withoutFigures }), [])
  assertSourceReferenceAdmission({ ...input, sidecar: withoutFigures })
  const missingConfirmation = { ...input.sourceInput }
  delete missingConfirmation.ocrSourceBytes
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sourceInput: missingConfirmation, sidecar: withoutFigures }),
    /Native answer PDF requires complete sealed OCR bytes/u)
})

test('P1-4 a centered Chinese grade cannot prove its own column is full', () => {
  const input = fixture([[...heading, line('A complete sample.', .28), line('评分标准', .32),
    line('第五档（21—25分）', .4, .35, .3), line('内容完整，逻辑清楚，语言准确。', .45)]])
  assert.deepEqual(scoringTexts(buildSourceReferences(...input)),
    ['第五档（21—25分）', '内容完整，逻辑清楚，语言准确。'])
})

for (const label of ['范文一（83词）', '参考范文（80词）', '范文 1']) {
  test(`P1-5 complete sample label clears scoring and retains its figure: ${label}`, () => {
    const input = fixture([[line('第一节 应用文', .08), line('评分标准', .11), line(label, .15),
      line('Our source design is useful.', .2, .1, .5), line('Picture words', .23, .73, .1),
      line('Another paragraph begins here.', .3, .14, .46)]])
    input[0].groups[0].writingTask.taskType = 'application'
    const bytes = productPdfBytes(1, 'Synthetic label figure source')
    input[0].documents[0].sha256 = sha256(bytes)
    const region = { regionId: 'answers:figure:review', kind: 'visual', region: { x: .7, y: .195, width: .15, height: .07 } }
    input[1].documents[0].pages[0].regions = [region]
    input[2].documents[0].pages[0].visualClassifications = [{ regionId: region.regionId,
      classification: 'content_media', itemIds: ['p1-i4'], afterItemId: 'p1-i3' }]
    assert.equal(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get('p1-i3'), null)
    const output = buildSourceReferences(...input, { sourceDocuments: [{ documentId: 'answers', bytes }] })
    assert.equal(output.groups[0].essays.entries[0].sourceLabel, label)
    assert.equal(output.groups[0].essays.entries[0].figures.length, 1)
    input[2].documents[0].pages[0].orderedItems[2].text = '范文1中“结构清晰”值得参考。'
    assert(sourceReferenceScoringScopes(input[2], new Set(['answers'])).get('p1-i3'))
  })
}

for (const points of [
  ['a. relevance to the task', 'b. coherence and cohesion', 'c. grammatical accuracy'],
  ['a) relevance to the task', 'b) coherence and cohesion', 'c) grammatical accuracy'],
  ['(a) relevance to the task', '(b) coherence and cohesion', '(c) grammatical accuracy'],
]) test(`P2 lowercase lettered rubric boundaries survive: ${points[0]}`, () => {
  const input = fixture([[...heading, line('A complete sample.', .28), line('评分标准', .32),
    ...points.map((text, i) => line(text, .4 + i * .05, i ? .14 : .1, i ? .35 : .3))]])
  assert.deepEqual(scoringTexts(buildSourceReferences(...input)), points)
})
