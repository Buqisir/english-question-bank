import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { sourceReferenceScoringScopes } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { nck1OcrSourceSetDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'

const line = (text, y, left = .1, width = .8) => ({ text, y, left, width })
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
const scoringTexts = output => output.groups[0].scoring.entries.flatMap(e =>
  (e.paragraphs ?? e.blocks.filter(b => b.kind === 'paragraph').map(b => b.paragraph)).map(p => p.text))
function reseal(input) {
  const { evidenceDigest: _old, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
}

function adjacentEssay({ label = '参考范文', combined = false, twoEntries = false } = {}) {
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
    [label, .12, .1, .35],
    ...(twoEntries ? [['First sample closes.', .16, .1, .35], ['范文二', .20, .1, .35]] : []),
    ['Our original', .24, .1, .35], ['sample is short.', .1, .6, .3],
    ['评分标准', .4, .1, .8], ['Source criterion closes.', .44, .1, .8],
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
  p.continuationSources = [structuredClone(sidecar.groups[0].scoring.entries[0].labelSource)]
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
  assertSourceReferenceAdmission({ ...input, sidecar })
  const missingConfirmation = { ...input.sourceInput }
  delete missingConfirmation.ocrSourceBytes
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sourceInput: missingConfirmation, sidecar }),
    /continuation requires sealed confirmation/u)
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
