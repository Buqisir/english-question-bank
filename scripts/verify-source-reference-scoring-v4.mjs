#!/usr/bin/env node
// verify-resource: browser-render
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { sourceReferenceFiguresFixture } from '../test-fixtures/paper-import/source-reference-figures-v3/fixture.mjs'
import { assertSourceReferenceAdmission } from '../server/paper-import/sourceReferenceAdmission.mjs'
import { validateSourceReferences, sourceReferenceFigures } from '../server/paper-import/sourceReferences.mjs'
import { sourceReferenceScoringScopes } from '../server/paper-import/sourceReferenceScoringScope.mjs'
import { computeLineFacts } from './import-pipeline/ocr-line-facts.mjs'
import { matchesLineRole } from './import-pipeline/ocr-line-roles.mjs'
import { buildAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

const input = scoringFiguresFixture()
const compiled = importCanonicalCandidate(input.sourceInput)
assert.deepEqual(compiled.issues, [], 'real Canonical source compile remains closed')
Object.assign(input, { sourceDigest: compiled.candidate.source.sha256,
  candidateDigest: compiled.candidate.candidateDigest })
const sidecar = captureScoringReferences(input)
const scoring = value => value.groups[0].scoring.entries[0]
const figure = value => scoring(value).blocks.find(block => block.kind === 'figure')
const validate = value => validateSourceReferences({ ...input, sidecar: value })
const admission = value => assertSourceReferenceAdmission({ ...input, sidecar: value })
assert.equal(sidecar.schemaVersion, 'source-references-v4')
assert.deepEqual(validate(sidecar), [])
admission(sidecar)
assert.deepEqual(sourceReferenceFigures(sidecar).map(item => item.figure.sourceRegionId), [
  'answers:page-3:figure-4', 'answers:page-3:figure-extra', 'answers:page-4:figure-5',
])
const reversed = structuredClone(input)
for (const document of reversed.confirmation.documents) for (const page of document.pages) page.visualClassifications.reverse()
assert.deepEqual(sourceReferenceFigures(captureScoringReferences(reversed)).map(item => item.figure.sourceRegionId),
  sourceReferenceFigures(sidecar).map(item => item.figure.sourceRegionId), 'source sequence, never visual array order')
console.log('PASS compile → v4 scoring capture → exact PDF/image/scope admission; p03/p04 and multiple-figure source order')

for (const [name, change, code] of [
  ['duplicate figure ID', value => { figure(value).figureId = sourceReferenceFigures(value)[1].figure.figureId }, 'SOURCE_REFERENCES_ID_DUPLICATE'],
  ['duplicate source region', value => { scoring(value).blocks.push(structuredClone(figure(value))) }, 'SOURCE_REFERENCES_FIGURE_DUPLICATE'],
  ['false document SHA', value => { figure(value).source.documentSha256 = sha256('forged') }, 'SOURCE_REFERENCES_SOURCE_INVALID'],
  ['false PNG', value => { figure(value).raster.base64 = 'AAAA' }, 'SOURCE_REFERENCES_FIGURE_PNG_INVALID'],
  ['scoring images exceed entry budget', value => {
    for (let i = 0; i < 3; i++) scoring(value).blocks.push({ ...structuredClone(figure(value)), figureId: `figure:over:${i}` })
  }, 'SOURCE_REFERENCES_FIGURE_LIMIT'],
]) {
  const changed = structuredClone(sidecar)
  change(changed)
  assert(validate(changed).some(issue => issue.code === code), name)
}
for (const [name, change] of [
  ['forged sourceRegionId', value => { figure(value).sourceRegionId = 'unconfirmed' }],
  ['omitted scoring image', value => { scoring(value).blocks = scoring(value).blocks.filter(block => block !== figure(value)) }],
  ['reordered scoring blocks', value => { scoring(value).blocks.reverse() }],
  ['swapped paragraph/figure pairs', value => {
    const [a, f1, b, f2, c] = scoring(value).blocks
    scoring(value).blocks = [b, f2, a, f1, c]
  }],
  ['overlapping paragraph source ranges', value => {
    const blocks = scoring(value).blocks
    blocks[blocks.length - 1] = structuredClone(blocks[2])
    blocks.at(-1).paragraph.paragraphId += '-overlap'
  }],
  ['false scoring label', value => { scoring(value).sourceLabel = '评分原则' }],
  ['wrong Writing Task', value => {
    value.groups[1].scoring.entries.push(scoring(value))
    value.groups[0].scoring = { state: 'not_supplied', entries: [], evidence: [scoring(value).labelSource] }
  }],
  ['reassign scoring figure to essay', value => {
    const moved = figure(value)
    scoring(value).blocks = scoring(value).blocks.filter(block => block !== moved)
    const essay = value.groups[0].essays.entries[0]
    const { kind, ...raster } = moved
    essay.figures = [{ ...raster, afterParagraphId: essay.paragraphs[0].paragraphId }]
  }],
  ['downgrade v4 to v3', value => { value.schemaVersion = 'source-references-v3' }],
]) {
  const changed = structuredClone(sidecar)
  change(changed)
  assert.throws(() => admission(changed), undefined, name)
}
assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar,
  sourceInput: { ...input.sourceInput, documents: [] } }), undefined, 'missing immutable PDF bytes')
const absentScope = structuredClone(input)
for (const page of absentScope.confirmation.documents[1].pages) for (const item of page.orderedItems) {
  if (item.text === '评分标准') item.text = '教师笔记'
}
assert.throws(() => captureScoringReferences(absentScope), /anchor|scoring|scope/iu, 'no scoring label cannot borrow essays')
const ambiguousOrder = structuredClone(input)
const ambiguousPage = ambiguousOrder.confirmation.documents[1].pages[2]
ambiguousPage.visualClassifications.push({ ...ambiguousPage.visualClassifications[0],
  regionId: 'answers:unordered-empty-figure', itemIds: [] })
ambiguousOrder.evidence.documents[1].pages[2].regions.push({ regionId: 'answers:unordered-empty-figure',
  kind: 'visual', region: { x: .85, y: .32, width: .1, height: .09 } })
assert.throws(() => captureScoringReferences(ambiguousOrder), /confirmed source-object order/u,
  'two images sharing an anchor cannot borrow visualClassifications array order')
for (const boundary of ['听力原文', '试题解析', '（五）样卷']) {
  const c = structuredClone(input.confirmation)
  const page = c.documents[1].pages[2]
  const anchor = page.orderedItems.find(item => item.text === '二、各档次的给分范围和要求')
  anchor.text = boundary
  assert.equal(sourceReferenceScoringScopes(c, new Set(['answers'])).get(anchor.itemId), null, boundary)
  if (boundary !== '（五）样卷') {
    const subsequent = c.documents[1].pages[3].orderedItems.at(-1)
    assert.equal(sourceReferenceScoringScopes(c, new Set(['answers'])).get(subsequent.itemId), null,
      'a later writing-like heading cannot reopen listening/analysis as official scoring')
  }
}
console.log('PASS forged regions/IDs/PNG/SHA, omissions, order, task/entry swaps, missing PDF and no scoring/boundary fail closed')

// Keep local paragraph/figure anchors valid while moving whole pairs across a
// page turn in one scoring entry. Both source pages must remain monotonic.
const crossPageInput = scoringFiguresFixture({ crossPageScoring: true })
const crossPageSidecar = captureScoringReferences(crossPageInput)
assertSourceReferenceAdmission({ ...crossPageInput, sidecar: crossPageSidecar })
const crossPageChanged = structuredClone(crossPageSidecar)
const crossPageBlocks = scoring(crossPageChanged).blocks
const p04FigureIndex = crossPageBlocks.findIndex(block => block.kind === 'figure' && block.source.locator.page === 4)
assert(p04FigureIndex > 1 && crossPageBlocks[p04FigureIndex - 1].kind === 'paragraph')
const p04Pair = crossPageBlocks.splice(p04FigureIndex - 1, 2)
const p03Pair = crossPageBlocks.splice(0, 2, ...p04Pair)
crossPageBlocks.splice(p04FigureIndex - 1, 0, ...p03Pair)
assert.throws(() => assertSourceReferenceAdmission({ ...crossPageInput, sidecar: crossPageChanged }),
  /source order|overlap/iu, 'swapped cross-page paragraph/figure pairs')
console.log('PASS paired paragraph/figure swaps within and across pages, and overlapping blocks fail closed')

// Rebind genuine OCR text so admission cannot reject merely stale evidence.
const explanationInput = structuredClone(input)
const explanationPage = explanationInput.confirmation.documents[1].pages[3]
const explanationItem = explanationPage.orderedItems.find(item => item.text === '—Use clear links between ideas.')
const explanationText = '21. A 本文是一篇应用文。'
explanationItem.text = explanationText
explanationInput.evidence.documents[1].pages[3].observations.find(observation =>
  observation.observationId === explanationItem.observationIds[0]).text = explanationText
const { evidenceDigest: _oldDigest, ...evidenceBody } = explanationInput.evidence
explanationInput.evidence.evidenceDigest = digestJson(evidenceBody)
explanationInput.confirmation.evidenceDigest = explanationInput.evidence.evidenceDigest
explanationInput.sourceInput.ocrSourceBytes = {
  evidenceBytes: Buffer.from(JSON.stringify(explanationInput.evidence)),
  confirmationBytes: Buffer.from(JSON.stringify(explanationInput.confirmation)),
}
assert(matchesLineRole('writing.explanations', computeLineFacts({ text: explanationText }), { sectionCount: 1 }))
const explanationSidecar = structuredClone(sidecar)
explanationSidecar.groups[1].scoring.entries[0].blocks[0].paragraph.text = explanationText
assert.throws(() => captureScoringReferences(explanationInput), /anchor|scope|section/iu,
  'producer rejects a genuine explanation image after numbered analysis')
assert.throws(() => assertSourceReferenceAdmission({ ...explanationInput, sidecar: explanationSidecar }),
  /scoring label|Writing Task/iu, 'independently authored sidecar cannot reassign explanation images to scoring')
const laterHeadings = structuredClone(explanationInput.confirmation)
laterHeadings.documents[1].pages[3].orderedItems.push(
  { itemId: 'later-task', text: '第二节（续写）' }, { itemId: 'later-score', text: '评分标准' })
const explanationScopes = sourceReferenceScoringScopes(laterHeadings, new Set(['answers']))
assert.equal(explanationScopes.get(explanationItem.itemId), null)
assert.equal(explanationScopes.get('later-score'), null,
  'later writing/scoring headings cannot reopen the numbered-analysis boundary')
console.log('PASS numbered explanation boundary closes producer and independent admission permanently')

for (const colon of ['：', ':']) for (const writingHeading of [
  [`第四部分${colon}写作\n第一节`], [`第四部分${colon}写作`, '第一节'],
]) {
  const colonInput = scoringFiguresFixture({ writingHeading })
  const colonSidecar = captureScoringReferences(colonInput)
  assertSourceReferenceAdmission({ ...colonInput, sidecar: colonSidecar })
  assert.equal(colonSidecar.groups[0].scoring.entries[0].blocks[1].kind, 'figure')
}
console.log('PASS Chinese/ASCII colon writing-part headings retain exact producer → admission ownership')

const labelInput = scoringFiguresFixture({ labelFirst: true, essays: false })
const labelSidecar = captureScoringReferences(labelInput)
assert.equal(labelSidecar.groups[0].scoring.entries[0].blocks[0].kind, 'figure')
assert.equal(labelSidecar.groups[0].essays.state, 'not_supplied')
assertSourceReferenceAdmission({ ...labelInput, sidecar: labelSidecar })
console.log('PASS actual scoring label authorizes a first figure block with no fabricated essay/paragraph')

// B can serialize/render a table followed by an image. The current v3
// confirmation resolver still rejects consumed table/image anchors (A's seam).
// Keeping that rejection is deliberate; B does not introduce afterVisual.
const tableInput = scoringFiguresFixture({ table: true })
const tableSidecar = captureScoringReferences(tableInput)
assert.deepEqual(tableSidecar.groups[0].scoring.entries[0].blocks.slice(0, 2).map(block => block.kind), ['table', 'figure'])
assert.deepEqual(validateSourceReferences({ ...tableInput, sidecar: tableSidecar }), [])
assert.throws(() => assertSourceReferenceAdmission({ ...tableInput, sidecar: tableSidecar }),
  /anchor cannot be consumed/iu, 'B must preserve the independent A boundary')
const tableHtml = buildAnswerOnlyHtml({ ...tableInput, sourceReferences: tableSidecar, includeScoring: true })
assert(tableHtml.indexOf('data-reference-table=') < tableHtml.indexOf('data-reference-figure='))
console.log('PASS v4 table → figure serialization/render order; consumed table anchor still rejected by unchanged confirmation v3')

// Include scoring in the aggregate budget, even when each entry fits.
const many = structuredClone(sidecar)
many.groups[0].scoring.entries = Array.from({ length: 17 }, (_, i) => ({
  referenceId: `score:budget:${i}`, authority: 'source_reference', sourceLabel: null, labelSource: null,
  blocks: [{ ...structuredClone(figure(sidecar)), figureId: `fig:budget:${i}`, sourceRegionId: `region:budget:${i}` }],
}))
assert(validate(many).some(issue => issue.code === 'SOURCE_REFERENCES_FIGURE_LIMIT'))
const large = structuredClone(many)
large.groups[0].scoring.entries = large.groups[0].scoring.entries.slice(0, 5)
sourceReferenceFigures(large).forEach(({ figure }) => { figure.raster.byteLength = 2 * 1024 * 1024 })
assert(validate(large).some(issue => issue.code === 'SOURCE_REFERENCES_FIGURE_LIMIT'))
console.log('PASS scoring figures count toward sidecar image and decoded-byte budgets')

const legacy = sourceReferenceFiguresFixture()
const legacyBytes = Buffer.from(JSON.stringify(legacy.sourceReferences))
const legacySha = sha256(legacyBytes)
assert.equal(legacySha, 'sha256:a28d4e32293270549baf3d01bada57b71f94ce9f5abdc9f4a0ad1bfa7b7200ba',
  'v3 exact historical fixture bytes must not be relabeled or rewritten')
const legacyHtml = buildAnswerOnlyHtml(legacy)
assert.equal(sha256(legacyHtml), 'sha256:14611297eba4f84bd960c817351416965f30eb580ae64012a328634f1c0860f6',
  'v3 exact HTML from b06ed92c must stay unchanged')
assertSourceReferenceAdmission({ ...legacy, sidecar: legacy.sourceReferences })
assert.equal(sha256(Buffer.from(JSON.stringify(legacy.sourceReferences))), legacySha)
assert.equal(buildAnswerOnlyHtml(legacy), legacyHtml)
assert.equal(legacy.sourceReferences.schemaVersion, 'source-references-v3')
console.log(`PASS v3 frozen sidecar unchanged: ${legacySha}`)

const defaultHtml = buildAnswerOnlyHtml({ ...input, sourceReferences: sidecar })
assert(!defaultHtml.includes('data-reference-figure='))
const html = buildAnswerOnlyHtml({ ...input, sourceReferences: sidecar, includeScoring: true })
const expected = sourceReferenceFigures(sidecar).map(item => item.figure.figureId)
assert.equal((html.match(/data-reference-figure=/gu) ?? []).length, expected.length)
try {
  const output = process.env.EQB_SCORING_REFERENCES_QA_DIR
  if (output) {
    mkdirSync(output, { recursive: true })
    writeFileSync(path.join(output, 'answerOnly.html'), html)
  }
  const rendered = await renderPaginatedPaper(html, { inspect: page => page.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page_content')]
    return pages.flatMap(page => [...page.querySelectorAll('[data-reference-figure]')].map(node => {
      const img = node.querySelector('img')
      const box = img.getBoundingClientRect(), area = page.getBoundingClientRect()
      return { id: node.dataset.referenceFigure, loaded: img.complete && img.naturalWidth > 0,
        fits: box.left >= area.left - 1 && box.right <= area.right + 1 && box.top >= area.top - 1 && box.bottom <= area.bottom + 1 }
    }))
  }) })
  assert.deepEqual(rendered.inspection.map(item => item.id), expected)
  assert(rendered.inspection.every(item => item.loaded && item.fits))
  assert(rendered.pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
  if (output) {
    writeFileSync(path.join(output, 'answerOnly-screen.html'), rendered.paginatedHtml)
    writeFileSync(path.join(output, 'answerOnly.pdf'), rendered.pdfBytes)
    writeFileSync(path.join(output, 'inspection.json'), JSON.stringify(rendered.inspection, null, 2))
  }
  console.log('PASS includeScoring Screen/Print HTML → paginated DOM/PDF retain all scoring PNGs in order and inside page bounds; default hides scoring')
} finally { await closeChromiumPool() }

// The small PDF fixtures never cross 2 MiB. Exercise native PNG sizing in this
// registered CI verifier too, including Ubuntu's ImageMagick 6 warning behavior.
await import('../server/paper-import/sourceReferencePngSizing.test.mjs')
