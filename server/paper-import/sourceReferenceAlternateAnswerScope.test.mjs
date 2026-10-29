import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoringFiguresFixture } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { buildSourceReferences } from '../../scripts/import-pipeline/ocr-proofread.mjs'
import { prepareSourceReferences, currentSourceReferencesSchema } from './sourceReferences.mjs'
import { assertSourceReferenceAdmission } from './sourceReferenceAdmission.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceWritingLifecycle } from './sourceReferenceWritingTask.mjs'
import { sourceReferenceScoringScopes } from './sourceReferenceScoringScope.mjs'
import { resolveAlternateAnswerScope } from './sourceReferenceAlternateAnswerScope.mjs'

const version = 'ocr-source-references-producer-v26'
const title = '2026届高中毕业班适应性练习英语听力部分录音稿'
const answer = input => input.confirmation.documents.find(document => document.documentId === 'answers')
function reseal(input) {
  const { evidenceDigest: _, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
  if (input.sidecar?.alternateAnswerScope) {
    input.sidecar.alternateAnswerScope.evidenceSha256 = sha256(input.sourceInput.ocrSourceBytes.evidenceBytes)
    input.sidecar.alternateAnswerScope.confirmationSha256 = sha256(input.sourceInput.ocrSourceBytes.confirmationBytes)
  }
}
function fixture() {
  const input = scoringFiguresFixture()
  for (const document of input.confirmation.documents) for (const page of document.pages) page.visualClassifications = []
  for (const document of input.evidence.documents) for (const page of document.pages) {
    page.regions = page.regions.filter(region => region.kind === 'text')
  }
  const page = answer(input).pages.at(-1)
  const proof = input.evidence.documents.find(document => document.documentId === 'answers').pages.at(-1)
  const extra = ['备选试题参考答案', '第一节 应用文写作', '参考范文', 'Alternate source sample.',
    '评分标准', 'Alternate scoring must never leak.', title,
    ...Array.from({ length: 10 }, (_, i) => [`Text ${i + 1}`, `M: Synthetic transcript ${i + 1}.`]).flat()]
  for (const [index, text] of extra.entries()) {
    const observation = { observationId: `answers:p4:extra-word-${index}`, regionId: `answers:p4:extra-region-${index}`,
      text, region: { x: .1, y: .6 + index * .012, width: .7, height: .01 }, confidence: 1, alternatives: [] }
    proof.observations.push(observation)
    proof.regions.push({ regionId: observation.regionId, kind: 'text', region: observation.region })
    page.orderedItems.push({ itemId: `answers:extra-${index}`, observationIds: [observation.observationId], text })
  }
  proof.readingOrderEdges = proof.observations.slice(1).map((obs, i) => ({
    before: proof.observations[i].observationId, after: obs.observationId,
  }))
  reseal(input)
  const capture = buildSourceReferences(input.materialization, input.evidence, input.confirmation, {
    sourceInput: input.sourceInput, sourceDocuments: input.sourceInput.documents,
  })
  const { groups, producerVersion, alternateAnswerScope } = capture
  input.sidecar = { ...prepareSourceReferences(input), groups, producerVersion, alternateAnswerScope }
  return input
}
function changeText(input, itemId, text) {
  for (const page of answer(input).pages) {
    const item = page.orderedItems.find(item => item.itemId === itemId)
    if (!item) continue
    item.text = text
    const proof = input.evidence.documents.find(document => document.documentId === 'answers').pages.find(p => p.page === page.page)
    proof.observations.find(obs => obs.observationId === item.observationIds[0]).text = text
  }
}
const produce = input => buildSourceReferences(input.materialization, input.evidence, input.confirmation, {
  sourceInput: input.sourceInput, sourceDocuments: input.sourceInput.documents,
})

test('no-image public admission preserves all main content and scans through the alternate interval', () => {
  const input = fixture(), before = digestJson(input)
  assert.equal(currentSourceReferencesSchema.$id, 'source-references-capture-v27')
  assertSourceReferenceAdmission(input)
  const source = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation)
  const lifecycle = sourceReferenceWritingLifecycle(source.lines, source)
  assert.deepEqual(input.sidecar.alternateAnswerScope.orderedItemIds,
    Array.from({ length: 6 }, (_, i) => `answers:extra-${i}`))
  for (const id of input.sidecar.alternateAnswerScope.orderedItemIds) {
    assert.equal(lifecycle.items.get(id).task, null)
    assert.equal(source.scoringScopes.get(id), null)
  }
  assert(lifecycle.listeningStarts.has('answers:extra-6'))
  assert.equal(digestJson(input), before)
})

function appendAfterTranscript(input, texts) {
  const page = answer(input).pages.at(-1)
  const proof = input.evidence.documents.find(document => document.documentId === 'answers').pages.at(-1)
  for (const [index, text] of texts.entries()) {
    const observation = { observationId: `answers:late-word-${index}`, regionId: `answers:late-region-${index}`,
      text, region: { x: .1, y: .925 + index * .01, width: .7, height: .005 }, confidence: 1, alternatives: [] }
    proof.observations.push(observation)
    proof.regions.push({ regionId: observation.regionId, kind: 'text', region: observation.region })
    page.orderedItems.push({ itemId: `answers:late-${index}`, observationIds: [observation.observationId], text })
  }
  proof.readingOrderEdges = proof.observations.slice(1).map((obs, i) => ({
    before: proof.observations[i].observationId, after: obs.observationId,
  }))
  reseal(input)
}

test('v26 native answer PDF requires both OCR bytes even when scope and scoring are omitted', () => {
  const input = fixture()
  delete input.sidecar.alternateAnswerScope
  for (const group of input.sidecar.groups) {
    group.essays.entries[0].paragraphs[0].text = 'Alternate source sample falsely assigned to main writing.'
    group.scoring = { state: 'not_supplied', entries: [], evidence: [group.essays.entries[0].paragraphs[0].source] }
  }
  for (const missing of ['both', 'evidenceBytes', 'confirmationBytes']) {
    const changed = structuredClone(input)
    if (missing === 'both') delete changed.sourceInput.ocrSourceBytes
    else delete changed.sourceInput.ocrSourceBytes[missing]
    assert.throws(() => assertSourceReferenceAdmission(changed),
      { code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID', message: /Native answer PDF requires complete sealed OCR bytes/u }, missing)
  }
})

test('v26 alternate scope rejects all later writing and rubric reopening across producer, scoring and admission', () => {
  const input = fixture()
  for (const texts of [
    ['第一节（满分15分）', '评分标准', 'Later main-task scoring.'],
    ['第一节 应用文写作', '参考范文', 'Later original sample.'],
    ['第二节 读后续写', '参考范文', 'Later continuation sample.'],
    ['写作评分说明'],
    ['写作评分说明', '应用文评分细则', 'Later explicit rubric.'],
    ['评分标准', 'Later standalone rubric.'],
    ['参考范文', 'Later standalone source sample.'],
    ['答案解析', '写作评分说明', '应用文评分细则', 'Later rubric after explanations.'],
  ]) {
    const changed = structuredClone(input)
    appendAfterTranscript(changed, texts)
    const rejection = { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID', message: /Alternate range cannot precede later writing or scoring/u }
    assert.throws(() => produce(changed), rejection, `producer: ${texts[0]}`)
    assert.throws(() => sourceReferenceScoringScopes(changed.confirmation, new Set(['answers']),
      { materialization: changed.materialization, producerVersion: version }), rejection, `scoring: ${texts[0]}`)
    assert.throws(() => assertSourceReferenceAdmission(changed), rejection, `admission: ${texts[0]}`)
  }
})

test('v25 and ordinary v26 retain legal post-listening rubric appendices without alternate scope', () => {
  const input = fixture()
  const page = answer(input).pages.at(-1)
  page.orderedItems = page.orderedItems.filter(item => !input.sidecar.alternateAnswerScope.orderedItemIds.includes(item.itemId))
  appendAfterTranscript(input, ['第一节（满分15分）', '评分标准', 'Later main-task scoring.'])
  for (const producerVersion of ['ocr-source-references-producer-v25', version]) {
    const scopes = sourceReferenceScoringScopes(input.confirmation, new Set(['answers']),
      { materialization: input.materialization, producerVersion })
    assert.equal(scopes.get('answers:late-2')?.taskType, 'application')
  }
})

test('independent no-image admission rejects removed content, stolen alternate prose, expanded sources and missing scope', () => {
  const input = fixture()
  for (const [name, mutate] of [
    ['delete scoring paragraph', x => x.sidecar.groups[0].scoring.entries[0].paragraphs.pop()],
    ['delete sample', x => { x.sidecar.groups[0].essays = { state: 'not_supplied', entries: [],
      evidence: [x.sidecar.groups[1].essays.entries[0].paragraphs[0].source] } }],
    ['steal alternate prose', x => { x.sidecar.groups[0].essays.entries[0].paragraphs[0].text = 'Alternate source sample.' }],
    ['expand locator', x => { x.sidecar.groups[1].scoring.entries[0].paragraphs[0].source.locator.region.height = .6 }],
    ['cross boundary locator', x => { x.sidecar.groups[1].scoring.entries[0].paragraphs[0].source.locator.region = { x: 0, y: 0, width: 1, height: 1 } }],
    ['reverse groups', x => x.sidecar.groups.reverse()],
    ['remove scope', x => { delete x.sidecar.alternateAnswerScope }],
    ['absence combination', x => { x.sidecar.wholeDocumentWritingAbsence = {} }],
    ['fake producer', x => { x.sidecar.producerVersion = 'ocr-source-references-producer-v25' }],
    ['missing OCR', x => { delete x.sourceInput.ocrSourceBytes }],
    ['wrong source PDF', x => { x.sourceInput.documents[1].bytes = Buffer.from('changed') }],
  ]) {
    const changed = structuredClone(input)
    mutate(changed)
    assert.throws(() => assertSourceReferenceAdmission(changed), undefined, name)
  }
  for (const key of ['documentId', 'documentSha256', 'evidenceSha256', 'confirmationSha256',
    'startInclusiveItemId', 'endExclusiveItemId', 'followingText1ItemId']) {
    const changed = structuredClone(input)
    changed.sidecar.alternateAnswerScope[key] = key.endsWith('Sha256') ? sha256('changed') : 'changed'
    assert.throws(() => assertSourceReferenceAdmission(changed), undefined, key)
  }
  for (const mutate of [scope => scope.orderedItemIds.reverse(), scope => scope.orderedItemIds.pop(),
    scope => scope.orderedItemIds.push(scope.orderedItemIds[0])]) {
    const changed = structuredClone(input)
    mutate(changed.sidecar.alternateAnswerScope)
    assert.throws(() => assertSourceReferenceAdmission(changed))
  }
  const missingScoring = structuredClone(input)
  missingScoring.sidecar.groups[0].scoring = { state: 'not_supplied', entries: [],
    evidence: [input.sidecar.groups[0].scoring.entries[0].paragraphs[0].source] }
  assert.throws(() => assertSourceReferenceAdmission(missingScoring),
    { code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID', message: /preserve every main sample/u })
})

test('full boundary spelling, uniqueness, raw adjacency and main-task prerequisites fail closed', () => {
  const input = fixture()
  for (const [name, mutate] of [
    ['missing start', x => changeText(x, 'answers:extra-0', '普通附录')],
    ['partial start', x => changeText(x, 'answers:extra-0', '备选参考答案')],
    ['duplicate start', x => changeText(x, 'answers:extra-2', '备选试题参考答案')],
    ['missing end', x => changeText(x, 'answers:extra-6', '普通附录')],
    ['partial end', x => changeText(x, 'answers:extra-6', '英语听力')],
    ['duplicate end', x => changeText(x, 'answers:extra-5', title)],
    ['break original Text 1 adjacency', x => changeText(x, 'answers:extra-7', '听力目录')],
    ['missing main application task', x => changeText(x, 'answers:p3:i0', '普通说明')],
    ['missing main sample', x => changeText(x, 'answers:p3:i2', '【审题重点】')],
    ['missing main scoring', x => {
      const page = answer(x).pages[2]
      for (const item of page.orderedItems.slice(3)) changeText(x, item.itemId, '【审题重点】')
    }],
    ['early alternate', x => {
      const pages = answer(x).pages
      pages[1].orderedItems.push(pages[3].orderedItems.find(item => item.itemId === 'answers:extra-0'))
      pages[3].orderedItems = pages[3].orderedItems.filter(item => item.itemId !== 'answers:extra-0')
    }],
    ['raw order changes', x => { const items = answer(x).pages.at(-1).orderedItems
      const i = items.findIndex(item => item.itemId === 'answers:extra-6'); [items[i], items[i + 1]] = [items[i + 1], items[i]] }],
    ['alternate table', x => { answer(x).pages.at(-1).visualClassifications.push({
      regionId: 'alternate-table', classification: 'semantic_table',
      rows: [{ header: false, cells: [['answers:extra-2'], ['answers:extra-3']] }],
    }) }],
    ['cross-boundary image', x => { answer(x).pages.at(-1).visualClassifications.push({
      regionId: 'cross-image', classification: 'content_media', itemIds: ['answers:extra-0'],
      afterItemId: 'answers:p4:i6',
    }) }],
  ]) {
    const changed = structuredClone(input)
    mutate(changed)
    reseal(changed)
    assert.throws(() => assertSourceReferenceAdmission(changed), undefined, name)
    // Missing/changed start has no machine-authorized exclusion. All other
    // cases must fail even before a sidecar has been authored.
    if (!['missing start', 'partial start'].includes(name)) {
      assert.throws(() => produce(changed), undefined, `producer: ${name}`)
    }
  }
  const historical = structuredClone(input)
  assert.equal(resolveAlternateAnswerScope(historical.materialization, historical.confirmation,
    { producerVersion: 'ocr-source-references-producer-v25' }), null)
  assert.throws(() => buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { producerVersion: 'ocr-source-references-producer-v25' }), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
})
