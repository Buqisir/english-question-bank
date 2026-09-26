import assert from 'node:assert/strict'
import { extractDocxDocumentParagraphs, extractDocxParagraphEmphasis } from '../server/paper-canonical/docxSourceAdapter.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { mapSourceEmphasisEdits, splitSourceEmphasis } from '../server/paper-canonical/sourceEmphasis.mjs'
import { produceNck1DocxMaterialization } from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { deriveNck1MaterializationBundle, nck1MaterializationSourceSummary } from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { nck1MaterializationHistoricalAuthorityRef54, nck1MaterializationHistoricalAuthorityRef57 } from '../shared/paper-canonical/authority.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { admitCanonicalPaperImport } from '../server/paper-canonical/publication.mjs'
import { buildNck1ReviewConsumption } from '../server/import-review/revisionProjection.mjs'

const run = (text, properties = '') => `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
const paragraphs = [
  run('😀 same ') + run('ob', '<w:b/><w:u w:val="single"/>') + run('stacle', '<w:b/><w:u/>') + run(' same obstacle.'),
  run('whole ', '<w:b/>') + run('marked', '<w:b/><w:u/>') + run(' paragraph', '<w:b/>'),
  run('all decorated', '<w:b/><w:u/>'),
  run('plain ') + run('disabled', '<w:b w:val="0"/><w:u w:val="none"/>') + run(' tail'),
  run('plain ') + run('historic', '<w:rPrChange><w:rPr><w:b/><w:u/></w:rPr></w:rPrChange>') + run(' tail'),
]
const fixture = makeSyntheticNck1DocxFixture({
  transformXml: (xml) => xml.replace('<w:body>', `<w:body>${paragraphs.map((p) => `<w:p>${p}</w:p>`).join('')}`),
})
const bytes = fixture.sourceDocuments[0].bytes
const before = extractDocxDocumentParagraphs(bytes)
const extracted = extractDocxParagraphEmphasis(bytes)
assert.deepEqual(extracted[0], {
  sourceIndex: 1, text: '😀 same obstacle same obstacle.', exact: true,
  ranges: [{ start: 8, end: 16, marks: ['bold', 'underline'] }],
})
assert.deepEqual(extracted[1].ranges, [{ start: 6, end: 12, marks: ['underline'] }])
for (const p of extracted.slice(2, 5)) assert.deepEqual(p.ranges, [])
assert.deepEqual(extractDocxDocumentParagraphs(bytes), before)
assert.equal(extracted.length, before.length)
assert.deepEqual(extracted.map((p) => p.text), before.map((p) => p.text))
console.log('PASS DOCX emphasis: exact UTF-16 ranges, repeated/split words, independent whole-paragraph suppression, explicit off, historical properties, unchanged legacy extraction')

const mapped = mapSourceEmphasisEdits('a obstcle after', [{ start: 2, end: 9, marks: ['underline'] }], [
  { start: 0, before: 'a', after: 'an' },
  { start: 2, before: 'obstcle', after: 'obstacle' },
  { start: 10, before: 'after', after: 'afterward' },
])
assert.deepEqual(mapped, { text: 'an obstacle afterward', ranges: [{ start: 3, end: 11, marks: ['underline'] }] })
assert.deepEqual(splitSourceEmphasis(mapped.text, mapped.ranges, 'test'), [
  { kind: 'text', nodeId: 'test:run-1', text: 'an ' },
  { kind: 'text', nodeId: 'test:run-2', text: 'obstacle', marks: ['underline'] },
  { kind: 'text', nodeId: 'test:run-3', text: ' afterward' },
])
assert.throws(() => mapSourceEmphasisEdits('a obstacle', [{ start: 2, end: 10, marks: ['bold'] }], [
  { start: 0, before: 'a obstacle', after: 'an obstacle' },
]), /crosses a mark boundary/)
assert.throws(() => splitSourceEmphasis('word（词） next', [{ start: 0, end: 4, marks: ['bold'] }], 'test'), /normalization/)
assert.equal(splitSourceEmphasis('plain marked end', [{ start: 6, end: 12, marks: ['bold'] }], 'test').map((n) => n.text).join(''), 'plain marked end')
console.log('PASS emphasis mapping: length-changing edits before/inside/after, boundary rejection, typography closure')

const semanticFixture = makeSyntheticNck1DocxFixture({ transformXml: (xml) => xml.replace(
  'C passage keeps one small promise.',
  `C passage keeps one </w:t></w:r>${run('small', '<w:b/><w:u/>')}<w:r><w:t xml:space="preserve"> promise.`,
) })
const produced = produceNck1DocxMaterialization({ paperId: semanticFixture.paperId, documents: semanticFixture.sourceDocuments })
assert.equal(produced.disposition, 'ready_for_verification')
const input = { kind: 'nck1-source-materialization', materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
  documents: semanticFixture.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })), media: [] }
const current = importCanonicalCandidate(input)
assert.deepEqual(current.issues, [])
const reading = (source) => source.groups.find((g) => g.slotId === 'reading.c').content.blocks[0]
assert.deepEqual(reading(current.candidate.interpretation).inlines.map(({ text, marks }) => ({ text, ...(marks ? { marks } : {}) })), [
  { text: 'C passage keeps one ' }, { text: 'small', marks: ['bold', 'underline'] }, { text: ' promise.' },
])
const preview = compileNck1MaterializationCandidatePreview(current.candidate)
assert(preview.compilation?.artifacts?.canonicalPaper, JSON.stringify(preview.unresolvedIssues))
const consumption = buildNck1ReviewConsumption(current.candidate, preview.compilation)
const continuation = consumption.selections.find((s) => s.familyContractId === 'continuation-writing')
assert.deepEqual(continuation.projectedOccurrenceDigests, continuation.projectedOccurrences.map((occurrence) => ({
  groupId: occurrence.groupId, digest: digestJson(occurrence),
})))
for (const authority of [nck1MaterializationHistoricalAuthorityRef54, nck1MaterializationHistoricalAuthorityRef57]) {
  const old = deriveNck1MaterializationBundle(input, authority)
  assert.deepEqual(old.issues, [])
  assert.deepEqual(reading(old.source).inlines, [{ kind: 'text', nodeId: `text:${reading(old.source).nodeId}:1`, text: 'C passage keeps one small promise.' }])
  const body = { schemaVersion: 'trusted-nck1-materialization-import-candidate-v1', authority,
    source: nck1MaterializationSourceSummary(old), operatorChoices: {}, interpretation: old.source, issues: [] }
  const historical = { ...body, candidateDigest: digestJson(body), sourceInput: input }
  const replay = compileNck1MaterializationCandidatePreview(historical)
  assert(replay.compilation?.artifacts?.canonicalPaper, JSON.stringify(replay.unresolvedIssues))
  assert.equal(buildNck1ReviewConsumption(historical, replay.compilation).authorityRef.manifestVersion, authority.manifestVersion)
  const admission = admitCanonicalPaperImport({ sourceAssetVersion: 1, request: { ...old.request,
    nck1MaterializationConfirmation: { schemaVersion: 'teacher-confirmation-v1',
      candidateDigest: historical.candidateDigest, sourceDigest: historical.source.sha256, confirmed: true } } })
  assert.equal(admission.ok, true, JSON.stringify(admission.diagnostics))
  assert.equal(admission.sealed.manifest.authority.manifestVersion, authority.manifestVersion)
}
console.log('PASS source-native Candidate and Canonical marks; v54/v57 unmarked compilation and publication admission replay remain valid')
