import test from 'node:test'
import assert from 'node:assert/strict'
import { produceNck1MaterializationFromStructures } from './nck1DocxMaterializationProducer.mjs'
import { extractDocxDocumentStructure } from '../paper-canonical/docxSourceAdapter.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { deriveOptionFigures } from '../../scripts/import-pipeline/derive-option-figures.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'

function run(change = () => {}) {
  const fixture = makeSyntheticNck1DocxFixture()
  const [question, coverage, answer] = fixture.sourceDocuments
  const questionStructure = extractDocxDocumentStructure(question.bytes)
  const answerStructure = extractDocxDocumentStructure(answer.bytes)
  const position = questionStructure.body.findIndex(item => /^29\./u.test(item.text))
  const stem = 'Which picture can illustrate the animal in paragraph 4?'
  const original = questionStructure.body[position]
  const mediaFiles = ['A', 'B', 'C', 'D'].map(label => ({
    mediaId: `media:${fixture.paperId}:option-${label.toLowerCase()}`, bytes: Buffer.from(label),
  }))
  const mediaInventory = mediaFiles.map(({ mediaId, bytes }, i) => ({
    mediaId, usage: 'content', kind: 'figure', mimeType: 'image/png', sha256: sha256(bytes),
    pixelWidth: 100, pixelHeight: 100,
    extraction: { kind: 'docx_media', documentId: question.documentId, entryName: `word/media/option-${i}.png` },
    presentation: { alignment: 'center', widthRatio: 1, spacingBefore: 'normal', spacingAfter: 'normal' },
    publication: { selection: 'source_crop', sourceSha256: sha256(bytes) },
  }))
  const items = [{ ...original, text: `29. ${stem}` }, ...mediaFiles.flatMap((file, i) => [
    { kind: 'paragraph', text: `${'ABCD'[i]}.`, sourceIndex: original.sourceIndex },
    { kind: 'paragraph', text: '', containsDrawing: true, sourceIndex: original.sourceIndex,
      materializedMedia: { mediaId: file.mediaId } },
  ])]
  change(items)
  const next = questionStructure.body.findIndex(item => /^30\./u.test(item.text))
  questionStructure.body.splice(position, next - position, ...items)
  return produceNck1MaterializationFromStructures({
    paperId: fixture.paperId, documents: fixture.sourceDocuments, question, answer, coverage,
    questionStructure, answerStructure, issues: [], mediaInventory, mediaFiles,
    codePrefix: 'NCK1_DOCX', producerVersion: 'test', reviewSchemaVersion: 'test', sourceDigest: 'test',
  })
}
const q29 = result => result.materialization.groups.flatMap(group => group.questions).find(q => q.canonicalNumber === 29)

function crop(produced) {
  // Supply a reviewed PDF parent crop, as the OCR carrier does.
  const input = structuredClone(produced.materialization)
  const pdfBytes = Buffer.from('immutable composite-image PDF fixture')
  const document = { documentId: 'option-source', role: 'question_source', mediaType: 'application/pdf',
    sha256: sha256(pdfBytes), byteLength: pdfBytes.length, pageCount: 1 }
  input.documents.push(document)
  input.schemaVersion = 'nck1-source-materialization-v2'
  const region = { x: .1, y: .7, width: .8, height: .1 }
  q29({ materialization: input }).source = { kind: 'page_region', documentId: document.documentId, page: 1, region }
  input.sourceCoverage.visuals.push({
    visualId: 'visual:parent', targetId: 'media:parent', page: 1, disposition: 'content_media', region,
  })
  const unrelated = { code: 'UNRELATED', path: 'questions.31', message: 'Retain review finding', source: null }
  input.issues = [
    // Replace the DOCX media fixture with the reviewed PDF parent, retaining
    // every producer finding about question text and options.
    ...input.issues.filter(issue => issue.path.startsWith('questions.'))
      .map(issue => ({ ...issue, code: issue.code.replace('NCK1_DOCX_', 'NCK1_OCR_') })),
    { code: 'NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS', path: 'media.media:parent' },
    unrelated,
  ]
  const plan = { documentId: document.documentId, sourceSha256: document.sha256, page: 1,
    questionNumber: 29, visualId: 'visual:parent', pagePixels: [1000, 1000],
    crops: [...'ABCD'].map((label, i) => ({ label, pixels: [100 + i * 200, 700, 150, 100] })) }
  const { materialization: output } = deriveOptionFigures({
    materialization: input, plan, document, pdfBytes,
    raster: ({ region }) => ({ bytes: Buffer.from(JSON.stringify(region)), pixelWidth: 150, pixelHeight: 100 }),
  })
  return { input, output, unrelated }
}

test('split composite-image stem survives reviewed crops without losing text or answers', () => {
  const produced = run(items => {
    const image = items[2]
    items.splice(1, items.length - 1,
      { ...items[0], text: 'in paragraph 4?' }, image)
    items[0].text = '29. Which picture can illustrate the animal'
  })
  const stem = 'Which picture can illustrate the animal\nin paragraph 4?'
  assert.equal(q29(produced).stem, stem)
  const { input, output, unrelated } = crop(produced)
  assert.equal(q29({ materialization: output }).stem, stem)
  assert.deepEqual(output.answers, input.answers)
  assert.deepEqual(output.issues, [unrelated])
  assert.deepEqual(validateNck1SourceMaterialization({ ...output, issues: [] }), [])
})

test('an A-leading English stem continuation survives composite-image derivation', () => {
  const continuation = 'A small animal is shown in the following pictures.'
  const produced = run(items => {
    const image = items[2]
    items.splice(1, items.length - 1, { ...items[0], text: continuation }, image)
  })
  const stem = `Which picture can illustrate the animal in paragraph 4?\n${continuation}`
  assert.equal(q29(produced).stem, stem)
  const { input, output, unrelated } = crop(produced)
  assert.equal(q29({ materialization: output }).stem, stem)
  assert.deepEqual(output.answers, input.answers)
  assert.deepEqual(output.issues, [unrelated])
})

test('punctuated A–D captions with or without spaces stay outside the stem after crops', () => {
  for (const marker of [
    label => `${label}.Option caption`, label => `${label}. Option caption`,
    label => `${label}．Option caption`, label => `${label})Option caption`,
    label => `(${label})Option caption`, label => `（${label}） Option caption`,
  ]) for (const continuation of ['', 'A small animal is shown in the following pictures.']) {
    const produced = run(items => {
      for (let i = 0; i < 4; i++) items[1 + i * 2].text = marker('ABCD'[i])
      if (continuation) items.splice(1, 0, { ...items[0], text: continuation })
    })
    const stem = `Which picture can illustrate the animal in paragraph 4?${continuation ? `\n${continuation}` : ''}`
    assert.equal(q29(produced).stem, stem, marker('A'))
    assert.deepEqual(q29(produced).options, [], 'Captions must not masquerade as text-only options')
    const { input, output, unrelated } = crop(produced)
    assert.equal(q29({ materialization: output }).stem, stem)
    assert.deepEqual(output.answers, input.answers)
    assert.deepEqual(output.issues, [unrelated])
  }
})

test('a complete A–D caption group before one composite image closes the text boundary', () => {
  const produced = run(items => {
    const markers = [1, 3, 5, 7].map((index, i) => ({ ...items[index], text: `${'ABCD'[i]}.Option caption` }))
    items.splice(1, items.length - 1, ...markers, items[2])
  })
  const stem = 'Which picture can illustrate the animal in paragraph 4?'
  assert.equal(q29(produced).stem, stem)
  assert.deepEqual(q29(produced).options, [])
  const { output, unrelated } = crop(produced)
  assert.equal(q29({ materialization: output }).stem, stem)
  assert.deepEqual(output.issues, [unrelated])
})

test('incomplete or reordered labels keep boundary and options ambiguity after crops', () => {
  for (const change of [
    items => { items[1].text = 'A.Option caption'; items.splice(3) },
    items => { items[3].text = 'C.' },
    items => { items.splice(3, 0, { ...items[0], text: 'This line might still belong to the stem.' }) },
  ]) {
    let expectedStem
    const produced = run(items => {
      change(items)
      expectedStem = items.filter(item => item.text).map(item => item.text).join('\n').replace(/^29\. /u, '')
    })
    const boundary = produced.materialization.issues.find(issue =>
      issue.code === 'NCK1_DOCX_STEM_OPTIONS_BOUNDARY_AMBIGUOUS')
    assert(boundary, 'Unproven boundaries require source review')
    assert(produced.materialization.issues.some(issue => issue.code === 'NCK1_DOCX_OPTIONS_AMBIGUOUS'))
    const stem = q29(produced).stem
    assert.equal(stem, expectedStem, 'All uncertain source text must remain available for review')
    const { output } = crop(produced)
    assert.equal(q29({ materialization: output }).stem, stem)
    assert(output.issues.some(issue => issue.code === 'NCK1_OCR_STEM_OPTIONS_BOUNDARY_AMBIGUOUS'))
    assert(output.issues.some(issue => issue.code === 'NCK1_OCR_OPTIONS_AMBIGUOUS'))
    assert.deepEqual(output.answers, produced.materialization.answers)
  }
})

test('stem illustrations still allow a following complete text-only A–D options block', () => {
  const result = run(items => {
    const stem = items[0]
    const image = items[2]
    items.splice(0, items.length, stem, image, image, {
      ...stem, text: 'A. A small animal. B. A large animal. C. A bird. D. A fish.',
    })
  })
  assert.equal(q29(result).stem, 'Which picture can illustrate the animal in paragraph 4?')
  assert.deepEqual(q29(result).options.map(option => option.text),
    ['A small animal.', 'A large animal.', 'A bird.', 'A fish.'])
  assert(!result.review.required.some(issue => issue.path === 'questions.29.options'))
})

test('standalone punctuated labels bind only with the complete ordered image structure', () => {
  for (const marker of [label => `${label}．`, label => `${label})`, label => `(${label})`]) {
    const produced = run(items => {
      for (let i = 0; i < 4; i++) items[1 + i * 2].text = marker('ABCD'[i])
    })
    assert.deepEqual(produced.review.required, [])
    assert.equal(q29(produced).stem, 'Which picture can illustrate the animal in paragraph 4?')
    assert.deepEqual(q29(produced).options.map(option => option.label), ['A', 'B', 'C', 'D'])
  }
})

test('explicit A–D image options retain media, source coverage and the Xiamen-shaped stem', () => {
  const result = run()
  assert.deepEqual(result.review.required, [])
  assert.equal(result.materialization.schemaVersion, 'nck1-source-materialization-v3')
  assert.equal(q29(result).stem, 'Which picture can illustrate the animal in paragraph 4?')
  assert.deepEqual(q29(result).options.map(option => option.label), ['A', 'B', 'C', 'D'])
  assert.deepEqual(q29(result).options.map(option => option.figure.mediaId), result.mediaFiles.map(file => file.mediaId))
  assert.equal(result.materialization.media.length, 4)
  assert.equal(result.materialization.sourceCoverage.visuals.filter(v => v.disposition === 'content_media').length, 4)
})

test('unlabelled composite, missing or reordered images stay blocked without losing the stem', () => {
  for (const change of [
    items => items.splice(1, 7),
    items => { items.splice(4, 1) },
    items => { items[3].text = 'C.' },
    items => { items[4].materializedMedia = items[2].materializedMedia },
  ]) {
    const result = run(change)
    assert(result.review.required.some(issue => issue.code === 'NCK1_DOCX_OPTIONS_AMBIGUOUS'))
    assert.equal(q29(result).options.length, 0)
    assert.match(q29(result).stem, /^Which picture/u)
  }
})
