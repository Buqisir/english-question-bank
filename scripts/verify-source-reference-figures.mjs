#!/usr/bin/env node
import assert from 'node:assert/strict'
import { deflateSync, crc32 } from 'node:zlib'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences, validateSourceReferences, parseSourceReferencesBytes } from '../server/paper-import/sourceReferences.mjs'
import { sourceReferenceFiguresFixture } from '../test-fixtures/paper-import/source-reference-figures-v3/fixture.mjs'
import { decodeSourceReferencePng, SOURCE_REFERENCE_IMAGE_LIMITS as limits, assertSourceReferenceFigureReplay } from '../server/paper-import/sourceReferenceImages.mjs'
import { assertSourceReferenceAdmission } from '../server/paper-import/sourceReferenceAdmission.mjs'
import { nck1OcrEvidenceDigest, resolveConfirmedNck1OcrEvidence } from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import { resolveOcrContentVisual } from '../server/paper-import/nck1OcrContentVisuals.mjs'
import { buildAnswerOnlyHtml, buildAssembledAnswerOnlyHtml } from '../server/answer-renderer.mjs'

const materialization = makeFixture({ listening: false })
const binding = { materialization, sourceDigest: `sha256:${'c'.repeat(64)}`, candidateDigest: `sha256:${'d'.repeat(64)}` }
const sidecar = prepareSourceReferences(binding)
sidecar.schemaVersion = 'source-references-v3'
const answer = materialization.documents.find(document => document.role === 'official_answers')
const source = { documentSha256: answer.sha256, locator: { kind: 'page_region',
  documentId: answer.documentId, page: 1, region: { x: 0, y: 0, width: 1, height: 1 } } }
for (const group of sidecar.groups) for (const kind of ['essays', 'scoring']) {
  group[kind] = { state: 'not_supplied', evidence: [source], entries: [] }
}
assert.deepEqual(validateSourceReferences({ ...binding, sidecar }), [], 'v3 supports the unchanged no-figure shape')
console.log('PASS v3 supports the unchanged no-figure shape')

const input = sourceReferenceFiguresFixture(undefined, { currentCapture: true })
const entry = value => value.groups[0].essays.entries[0]
const figure = value => entry(value).figures[0]
const validate = value => validateSourceReferences({ ...input, sidecar: value })
assert.deepEqual(validate(input.sourceReferences), [])
assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar: input.sourceReferences }))
const imageProse = structuredClone(input.sourceReferences)
entry(imageProse).paragraphs.push({ ...entry(imageProse).paragraphs[0],
  paragraphId: 'paragraph:forbidden-image-text', text: 'World Smile Day',
  source: { documentSha256: input.sourceDocuments[1].sha256, locator: {
    kind: 'page_region', documentId: 'answers', page: 1,
    region: { x: 0.71, y: 0.22, width: 0.1, height: 0.02 },
  } } })
assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: imageProse }),
  { code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID' }, 'selected image observations must never reappear as prose')
const withTable = sourceReferenceFiguresFixture(undefined, { scoringTable: true, currentCapture: true })
assert.deepEqual(validateSourceReferences({ ...withTable, sidecar: withTable.sourceReferences }), [])
const tableResolved = resolveConfirmedNck1OcrEvidence({ paperId: withTable.materialization.paperId,
  documents: withTable.sourceDocuments, evidence: withTable.evidence, confirmation: withTable.confirmation })
assert.deepEqual(tableResolved.issues, [])
assert.equal(tableResolved.structures.get('answers').tables.length, 1)
assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...withTable, sidecar: withTable.sourceReferences }),
  'one official_answers PDF may contain both a reference figure and a semantic scoring table')
const imageCell = structuredClone(withTable.sourceReferences)
imageCell.groups[0].scoring.entries[0].blocks[0].rows[0][0] = {
  cellId: 'cell:forbidden-image-text', text: imageProse.groups[0].essays.entries[0].paragraphs.at(-1).text,
  source: imageProse.groups[0].essays.entries[0].paragraphs.at(-1).source,
}
assert.throws(() => assertSourceReferenceAdmission({ ...withTable, sidecar: imageCell }),
  { code: 'SOURCE_REFERENCES_CELL_CONTINUATION_INVALID' },
  'whole-sidecar table replay rejects image observations before the figure coverage check')
for (const [name, mutate] of [
  ['omitted figure', value => { delete entry(value).figures }],
  ['wrong surviving anchor', value => { figure(value).afterParagraphId = entry(value).paragraphs[1].paragraphId }],
  ['changed table identity', value => { value.groups[0].scoring.entries[0].blocks[0].tableId += '-forged' }],
]) {
  const changed = structuredClone(withTable.sourceReferences)
  mutate(changed)
  assert.deepEqual(validateSourceReferences({ ...withTable, sidecar: changed }), [], name)
  assert.throws(() => assertSourceReferenceAdmission({ ...withTable, sidecar: changed }),
    { code: 'SOURCE_REFERENCES_CELL_CONTINUATION_INVALID' }, `mixed figure/table whole-sidecar replay: ${name}`)
}
console.log('PASS native reference figure plus semantic scoring table; image text, omitted figures, anchors and table identities remain replay-bound')
const unchanged = JSON.stringify(input.sourceReferences)
for (const [name, mutate, code] of [
  ['cross-entry anchor', value => { figure(value).afterParagraphId = value.groups[0].essays.entries[1].paragraphs[0].paragraphId }, 'SOURCE_REFERENCES_FIGURE_ANCHOR_INVALID'],
  ['missing/before-first anchor', value => { figure(value).afterParagraphId = 'paragraph:missing' }, 'SOURCE_REFERENCES_FIGURE_ANCHOR_INVALID'],
  ['global duplicate ID', value => { figure(value).figureId = entry(value).paragraphs[0].paragraphId }, 'SOURCE_REFERENCES_ID_DUPLICATE'],
  ['duplicate region', value => { entry(value).figures.push({ ...figure(value), figureId: 'figure:other' }) }, 'SOURCE_REFERENCES_FIGURE_DUPLICATE'],
  ['empty figures', value => { entry(value).figures = [] }, 'SOURCE_REFERENCES_SCHEMA_INVALID'],
  ['image-only entry', value => { entry(value).paragraphs = [] }, 'SOURCE_REFERENCES_FIGURE_UNSUPPORTED'],
  ['noncaptured figures', value => { value.groups[0].essays.state = 'not_supplied' }, 'SOURCE_REFERENCES_FIGURE_ANCHOR_INVALID'],
  ['foreign role', value => { figure(value).source.locator.documentId = 'paper' }, 'SOURCE_REFERENCES_FIGURE_SOURCE_INVALID'],
  ['decreasing anchors', value => {
    const first = figure(value)
    first.afterParagraphId = entry(value).paragraphs[1].paragraphId
    entry(value).figures.push({ ...structuredClone(first), figureId: 'figure:second',
      afterParagraphId: entry(value).paragraphs[0].paragraphId, sourceRegionId: 'other:region',
      source: { ...first.source, locator: { ...first.source.locator, region: { x: 0.8, y: 0.2, width: 0.1, height: 0.1 } } } })
  }, 'SOURCE_REFERENCES_FIGURE_ANCHOR_INVALID'],
]) {
  const changed = structuredClone(input.sourceReferences)
  mutate(changed)
  assert(validate(changed).some(issue => issue.code === code), name)
}
for (const schemaVersion of ['source-references-v1', 'source-references-v2']) {
  const noFigure = structuredClone(sidecar)
  noFigure.schemaVersion = schemaVersion
  assert.deepEqual(validateSourceReferences({ ...binding, sidecar: noFigure }), [])
  const before = JSON.stringify(noFigure)
  assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar: noFigure, sourceInput: {} }), {
    code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID',
    message: 'Whole-document PDF absence requires complete OCR evidence and confirmation',
  })
  assert.equal(JSON.stringify(noFigure), before, 'rejected references are not migrated')
}
console.log('PASS v1/v2 no-figure shapes unchanged; current producer rejects unconfirmed PDF absence; v3 anchors, state, IDs, region uniqueness and unsupported structures')

function pngChunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12)
  bytes.writeUInt32BE(data.length)
  bytes.write(type, 4)
  data.copy(bytes, 8)
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
  return bytes
}
function png(width, height, { brokenData = false, extra = null } = {}) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header),
    ...(extra ? [extra] : []),
    pngChunk('IDAT', brokenData ? Buffer.from('not zlib') : deflateSync(Buffer.alloc(height * (width * 4 + 1)))),
    pngChunk('IEND', Buffer.alloc(0))])
}
const raster = (bytes, width = 1, height = 1) => ({ profile: 'source-reference-pdf-crop-v1', mediaType: 'image/png',
  byteLength: bytes.length, sha256: sha256(bytes), pixelWidth: width, pixelHeight: height, base64: bytes.toString('base64') })
const tiny = png(1, 1)
assert.doesNotThrow(() => decodeSourceReferencePng(raster(tiny)))
for (const [name, value] of [
  ['whitespace', { ...raster(tiny), base64: `${tiny.toString('base64')} ` }],
  ['illegal character', { ...raster(tiny), base64: '*' }],
  ['noncanonical padding bits', { ...raster(tiny), base64: 'AB==' }],
  ['missing padding', { ...raster(tiny), base64: tiny.toString('base64').replace(/=+$/u, '') }],
  ['wrong byte length', { ...raster(tiny), byteLength: tiny.length + 1 }],
  ['wrong SHA', { ...raster(tiny), sha256: sha256('another') }],
  ['wrong decoded size', { ...raster(tiny), pixelWidth: 2 }],
  ['truncation', raster(tiny.subarray(0, -1))],
  ['tail', raster(Buffer.concat([tiny, Buffer.from('tail')]))],
  ['second frame', raster(Buffer.concat([tiny, tiny]))],
  ['bad CRC', raster(Buffer.from(tiny.map((byte, index) => index === 45 ? byte ^ 1 : byte)))],
  ['invalid compressed data with valid CRC', raster(png(1, 1, { brokenData: true }))],
  ['APNG', raster(png(1, 1, { extra: pngChunk('acTL', Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])) }))],
  ...['zTXt', 'iTXt', 'iCCP'].map(type => [`compressed ${type} metadata`,
    raster(png(1, 1, { extra: pngChunk(type, Buffer.concat([Buffer.from('note\0\0'), deflateSync(Buffer.from('x'))])) }))]),
  ['dimension limit + 1', raster(png(4097, 1), 4097, 1)],
  ['pixel limit exceeded', raster(png(2000, 2001), 2000, 2001)],
]) assert.throws(() => decodeSourceReferencePng(value), { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID' }, name)
assert.doesNotThrow(() => decodeSourceReferencePng(raster(png(4096, 1), 4096, 1)))
assert.doesNotThrow(() => decodeSourceReferencePng(raster(png(2000, 2000), 2000, 2000)))
const padding = size => png(1, 1, { extra: pngChunk('tEXt', Buffer.concat([
  Buffer.from('padding\0'), Buffer.alloc(size - tiny.length - 20, 'x'),
])) })
const maximum = padding(limits.pngBytes)
assert.equal(maximum.length, limits.pngBytes)
assert.doesNotThrow(() => decodeSourceReferencePng(raster(maximum)))
assert.throws(() => decodeSourceReferencePng(raster(padding(limits.pngBytes + 1))))
console.log('PASS canonical base64; complete PNG decode; APNG, frames, truncation, CRC and tail rejection; PNG byte/dimension/pixel boundaries')

function countFixture(count, image = raster(tiny)) {
  const value = structuredClone(input.sourceReferences)
  value.groups[0].essays.entries = []
  for (let index = 0; index < count; index++) {
    const number = Math.floor(index / 4)
    if (index % 4 === 0) value.groups[0].essays.entries.push({
      ...structuredClone(entry(input.sourceReferences)), referenceId: `reference:count:${number}`,
      paragraphs: [{ ...structuredClone(entry(input.sourceReferences).paragraphs[0]), paragraphId: `paragraph:count:${number}` }],
      figures: [],
    })
    const current = value.groups[0].essays.entries.at(-1)
    current.figures.push({ ...structuredClone(figure(input.sourceReferences)), figureId: `figure:count:${index}`,
      afterParagraphId: current.paragraphs[0].paragraphId, sourceRegionId: `region:count:${index}`,
      source: { ...structuredClone(source), documentSha256: input.materialization.documents[1].sha256,
        locator: { ...source.locator, region: { x: index / 100, y: 0, width: 0.01, height: 0.01 } } },
      raster: image })
  }
  return value
}
assert.deepEqual(validate(countFixture(16)), [])
assert(validate(countFixture(17)).some(issue => issue.code === 'SOURCE_REFERENCES_FIGURE_LIMIT'))
assert.deepEqual(validate(countFixture(4, raster(maximum))), [], 'exactly 8 MiB decoded PNG bytes')
const byteOverflow = countFixture(5)
const images = byteOverflow.groups[0].essays.entries.flatMap(entry => entry.figures)
images.forEach((figure, index) => { figure.raster = raster(index < 3 ? maximum
  : index === 3 ? padding(limits.pngBytes - tiny.length + 1) : tiny) })
assert.equal(images.reduce((total, figure) => total + figure.raster.byteLength, 0), limits.totalPngBytes + 1)
assert(validate(byteOverflow).some(issue => issue.code === 'SOURCE_REFERENCES_FIGURE_LIMIT'))
const tooMany = countFixture(4)
entry(tooMany).figures.push(structuredClone(figure(tooMany)))
assert(validate(tooMany).some(issue => issue.code === 'SOURCE_REFERENCES_SCHEMA_INVALID'), 'entry limit + 1')
const small = Buffer.from(JSON.stringify(sidecar))
assert.equal(parseSourceReferencesBytes(Buffer.concat([small, Buffer.alloc(limits.jsonBytes - small.length, ' ')])).schemaVersion, 'source-references-v3')
assert.throws(() => parseSourceReferencesBytes(Buffer.concat([small, Buffer.alloc(limits.jsonBytes - small.length + 1, ' ')])),
  { code: 'SOURCE_REFERENCES_FIGURE_LIMIT' })
assert.throws(() => parseSourceReferencesBytes(small.toString('utf8') + ' '.repeat(limits.jsonBytes - small.length + 1)),
  { code: 'SOURCE_REFERENCES_FIGURE_LIMIT' })
console.log('PASS entry/sidecar counts, total decoded PNG bytes and raw JSON exact-limit boundaries')

for (const [name, change] of [
  ['missing sidecar', value => { value.sidecar = null }],
  ['v1 with confirmed answer figure', value => { value.sidecar.schemaVersion = 'source-references-v1'; delete entry(value.sidecar).figures }],
  ['v2 with confirmed answer figure', value => { value.sidecar.schemaVersion = 'source-references-v2'; delete entry(value.sidecar).figures }],
  ['omitted figure', value => { delete entry(value.sidecar).figures }],
  ['substituted regionId', value => { figure(value.sidecar).sourceRegionId = 'region:unconfirmed' }],
  ['substituted crop', value => { figure(value.sidecar).source.locator.region.x -= 0.01 }],
  ['wrong surviving anchor', value => { figure(value.sidecar).afterParagraphId = entry(value.sidecar).paragraphs[1].paragraphId }],
  ['no writing scope', value => {
    const group = value.sidecar.groups[0]
    group.essays.entries = []
    group.essays.state = 'not_supplied'
    group.essays.evidence = [source]
  }],
  ['cross-entry placement', value => {
    const group = value.sidecar.groups[0]
    group.essays.entries[1].figures = entry(value.sidecar).figures
    delete entry(value.sidecar).figures
    group.essays.entries[1].figures[0].afterParagraphId = group.essays.entries[1].paragraphs[0].paragraphId
  }],
  ['extra source figure', value => {
    const extra = structuredClone(figure(value.sidecar))
    extra.figureId = 'figure:extra'
    extra.sourceRegionId = 'region:extra'
    extra.source.locator.region.x -= 0.02
    entry(value.sidecar).figures.push(extra)
  }],
  ['missing confirmation', value => { delete value.sourceInput.ocrSourceBytes }],
  ['missing confirmed writing scope', value => {
    const confirmation = JSON.parse(Buffer.from(value.sourceInput.ocrSourceBytes.confirmationBytes).toString('utf8'))
    confirmation.documents[1].pages[0].orderedItems[0].text = 'Unrelated source heading.'
    value.sourceInput.ocrSourceBytes.confirmationBytes = Buffer.from(JSON.stringify(confirmation))
  }],
  ['move entire essay into another task', value => {
    const [application, continuation] = value.sidecar.groups
    const essay = application.essays.entries.shift()
    continuation.essays = { state: 'captured', evidence: [], entries: [essay] }
  }],
]) {
  const changed = structuredClone({ ...input, sidecar: input.sourceReferences })
  change(changed)
  assert.throws(() => assertSourceReferenceAdmission(changed), undefined, name)
}
const forged = structuredClone(figure(input.sourceReferences))
forged.raster = raster(tiny)
assert.throws(() => assertSourceReferenceFigureReplay({ figure: forged, document: input.sourceDocuments[1] }),
  { code: 'SOURCE_REFERENCES_FIGURE_SOURCE_DISAGREES' })
assert.throws(() => assertSourceReferenceFigureReplay({ figure: figure(input.sourceReferences),
  document: { ...input.sourceDocuments[1], bytes: Buffer.from('substituted PDF') } }),
{ code: 'SOURCE_REFERENCES_FIGURE_SOURCE_INVALID' })
console.log('PASS exact PDF replay, image coverage, source-region/anchor/entry mutations and v1/v2 fail-closed admission')

const resolved = resolveConfirmedNck1OcrEvidence({ paperId: input.materialization.paperId,
  documents: input.sourceDocuments, evidence: input.evidence, confirmation: input.confirmation })
assert.deepEqual(resolved.issues, [])
assert.equal(resolved.referenceFigures.length, 1)
assert.equal(resolved.contentMedia.length, 0)
assert.equal(resolved.sourceVisuals.length, 0)
const answerParagraphs = resolved.structures.get('answers').paragraphs
assert.deepEqual(answerParagraphs.map(item => item.text), [
  '第四部分 写作 第一节',
  'This is my design for World Smile Day.',
  'The design encourages kindness.',
  'Possible Version 2',
  'Another complete sample keeps its own words.',
  '第二节 读后续写（范文略）',
])
assert(!answerParagraphs.some(item => item.text === 'World Smile Day'))
const page = { ...input.confirmation.documents[1].pages[0], observations: input.evidence.documents[1].pages[0].observations }
const visual = page.visualClassifications[0]
const region = input.evidence.documents[1].pages[0].regions.find(item => item.regionId === visual.regionId)
assert.throws(() => resolveOcrContentVisual({ paperId: input.materialization.paperId,
  document: { ...input.sourceDocuments[1], role: 'question_and_answers' }, page, visual, region, claimedItems: new Set() }))
assert.equal(input.materialization.media.length, 0)
assert(!JSON.stringify(input.materialization.sourceCoverage).includes('answers:figure'))
const pure = structuredClone(page)
pure.observations = pure.observations.filter(item => !visual.itemIds.flatMap(id =>
  pure.orderedItems.find(item => item.itemId === id).observationIds).includes(item.observationId))
pure.orderedItems = pure.orderedItems.filter(item => !visual.itemIds.includes(item.itemId))
const pureFigure = resolveOcrContentVisual({ paperId: input.materialization.paperId,
  document: input.sourceDocuments[1], page: pure, visual: { ...visual, itemIds: [] }, region, claimedItems: new Set() })
assert.deepEqual(pureFigure.itemIds, [])
assert(pureFigure.referenceFigure)
const pureEvidence = structuredClone(input.evidence)
const purePage = pureEvidence.documents[1].pages[0]
purePage.observations = pure.observations
purePage.regions = purePage.regions.filter(region => region.kind !== 'text'
  || pure.observations.some(observation => observation.regionId === region.regionId))
purePage.readingOrderEdges = pure.observations.slice(1).map((observation, index) => ({
  before: pure.observations[index].observationId, after: observation.observationId,
}))
pureEvidence.evidenceDigest = nck1OcrEvidenceDigest(pureEvidence)
const pureConfirmation = structuredClone(input.confirmation)
pureConfirmation.evidenceDigest = pureEvidence.evidenceDigest
pureConfirmation.documents[1].pages[0] = {
  ...pureConfirmation.documents[1].pages[0], orderedItems: pure.orderedItems,
  visualClassifications: [{ ...visual, itemIds: [] }],
}
assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar: input.sourceReferences,
  sourceInput: { ...input.sourceInput, ocrSourceBytes: {
    evidenceBytes: Buffer.from(JSON.stringify(pureEvidence)),
    confirmationBytes: Buffer.from(JSON.stringify(pureConfirmation)),
  } } }))
console.log('PASS exact item/observation consumption; identical prose survives; reference-only routing; pure visual; combined source rejection')

const html = buildAnswerOnlyHtml(input)
assert.equal((html.match(/data-reference-figure=/gu) ?? []).length, 1)
assert(html.includes(`${entry(input.sourceReferences).paragraphs[0].text}</p><figure`))
const group = input.materialization.groups.find(group => group.writingTask?.taskType === 'application')
const item = source => ({ source, detail: { paperId: source.materialization.paperId,
  id: source.materialization.groups.find(group => group.writingTask?.taskType === 'application').groupId, questions: [] } })
const other = structuredClone(input)
other.materialization.paperId = 'paper-other-figure-source'
other.materialization.groups.forEach(group => { group.groupId = `other:${group.groupId}` })
other.sourceReferences.groups.forEach(group => { group.groupId = `other:${group.groupId}` })
other.sourceReferences.paperId = other.materialization.paperId
other.sourceReferences.materializationDigest = digestJson(other.materialization)
const assembled = buildAssembledAnswerOnlyHtml({ paperName: input.paperName, items: [item(input), item(other)] })
const ids = [...assembled.matchAll(/id="(reference-figure-[^"]+)"/gu)].map(match => match[1])
assert.equal(ids.length, 2)
assert.equal(new Set(ids).size, 2)
assert.equal(input.sourceReferences.groups[0].groupId, group.groupId)
assert.equal(JSON.stringify(input.sourceReferences), unchanged, 'rendering does not migrate or mutate sidecars')
console.log('PASS single/assembled answerOnly insertion and source-namespaced duplicate figure IDs')
await import('./verify-source-reference-raster-limits.mjs')
