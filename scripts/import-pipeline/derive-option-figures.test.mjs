import test from 'node:test'
import assert from 'node:assert/strict'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { deriveOptionFigures, optionCropRegions } from './derive-option-figures.mjs'

const pdfBytes = Buffer.from('immutable PDF fixture')
const document = { documentId: 'source', mediaType: 'application/pdf', sha256: sha256(pdfBytes), pageCount: 5 }
const plan = { documentId: 'source', sourceSha256: document.sha256, page: 5, questionNumber: 30,
  visualId: 'visual:parent', pagePixels: [1000, 1000],
  crops: ['A', 'B', 'C', 'D'].map((label, i) => ({ label, pixels: [100 + i * 200, 700, 150, 100] })) }
const materialization = { paperId: 'paper-fixture',
  groups: [{ questions: [{ canonicalNumber: 30, options: [], source: { documentId: 'source', page: 5 } }] }],
  answers: [{ canonicalNumber: 30, answer: 'B' }], media: [],
  sourceCoverage: { visuals: [{ visualId: 'visual:parent', targetId: 'media:parent', page: 5,
    disposition: 'content_media', region: { x: 0.1, y: 0.7, width: 0.8, height: 0.1 } }] },
  issues: [{ code: 'NCK1_OCR_OPTIONS_AMBIGUOUS', path: 'questions.30.options' },
    { code: 'NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS', path: 'media.media:parent' },
    { code: 'UNRELATED', path: 'questions.31' }] }
const raster = ({ region }) => ({ bytes: Buffer.from(JSON.stringify(region)), pixelWidth: 150, pixelHeight: 100 })
const derive = (overrides = {}) => deriveOptionFigures({ materialization, plan, document, pdfBytes, raster, ...overrides })

test('four disjoint page crops bind A–D, independent hashes, locators and coverage without changing answers', () => {
  const result = derive()
  const output = result.materialization
  assert.equal(output.media.length, 4)
  assert.equal(new Set(result.files.map(f => f.sha256)).size, 4)
  assert.deepEqual(output.answers, materialization.answers)
  for (const [i, option] of output.groups[0].questions[0].options.entries()) {
    const media = output.media[i]
    assert.equal(option.label, plan.crops[i].label)
    assert.deepEqual(Object.keys(option).sort(), ['figure', 'label'])
    assert.equal(option.figure.mediaId, media.mediaId)
    assert.equal(media.sha256, sha256(result.files[i].bytes))
    assert.equal(media.publication.sourceSha256, media.sha256)
    assert.deepEqual(media.extraction.region, optionCropRegions(plan)[i].region)
    assert.equal(media.extraction.documentId, 'source')
    assert.equal(media.extraction.page, 5)
    assert.equal(output.sourceCoverage.visuals[i].targetId, media.mediaId)
  }
  assert.equal(result.audit.source.sha256, document.sha256)
  assert.deepEqual(output.issues, [{ code: 'UNRELATED', path: 'questions.31' }])
  assert.equal(materialization.groups[0].questions[0].options.length, 0)
})

test('overlapping, clipped and reordered crop plans fail before rasterization', () => {
  const overlap = structuredClone(plan)
  overlap.crops[1].pixels[0] = 120
  assert.throws(() => optionCropRegions(overlap), /overlap/)
  const clipped = structuredClone(plan)
  clipped.crops[3].pixels[0] = 950
  assert.throws(() => optionCropRegions(clipped), /outside/)
  assert.throws(() => optionCropRegions({ ...plan, crops: [...plan.crops].reverse() }), /A–D/)
})

test('source hash, duplicate bytes, wrong page and mismatched raster dimensions fail closed', () => {
  assert.throws(() => derive({ pdfBytes: Buffer.from('changed PDF') }), /immutable/)
  assert.throws(() => derive({ raster: () => ({ bytes: Buffer.from('same'), pixelWidth: 150, pixelHeight: 100 }) }), /distinct/)
  assert.throws(() => derive({ plan: { ...plan, page: 4 } }), /source page/)
  assert.throws(() => derive({ raster: () => ({ bytes: Buffer.from('x'), pixelWidth: 149, pixelHeight: 100 }) }), /dimensions/)
  const outside = structuredClone(plan)
  outside.crops[0].pixels[1] = 600
  assert.throws(() => derive({ plan: outside }), /parent visual/)
})
