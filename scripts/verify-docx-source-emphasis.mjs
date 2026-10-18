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
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { prepareSpellingReview, applySpellingReview, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
import { loadSpellingSourceEmphasis } from './import-pipeline/spelling-source-emphasis.mjs'

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

// Exercise the actual auto CLI, including source-run extraction and unchanged
// notes, rather than only duplicating the boundary predicate in a unit test.
const autoFixture = makeSyntheticNck1DocxFixture({ transformXml: xml => xml
  .replace('A passage keeps one small promise.',
    `😀 </w:t></w:r>${run('Bath', '<w:b/>')}<w:r><w:t xml:space="preserve"> — City.`)
  .replace('B passage keeps one small promise.',
    `😀 </w:t></w:r>${run('Bath', '<w:b/>')}<w:r><w:t xml:space="preserve"> — City. Plain — Text.`)
  .replace('C passage keeps one small promise.',
    `😀 </w:t></w:r>${run('Inside — Mark', '<w:b/>')}<w:r><w:t xml:space="preserve"> Outside — Text.`),
})
const autoProduced = produceNck1DocxMaterialization({ paperId: autoFixture.paperId, documents: autoFixture.sourceDocuments })
assert.equal(autoProduced.disposition, 'ready_for_verification')
const autoDir = mkdtempSync(path.join(tmpdir(), 'eqb-spelling-emphasis-'))
try {
  const materializationBytes = new TextEncoder().encode(JSON.stringify(autoProduced.materialization))
  writeFileSync(path.join(autoDir, 'materialization.json'), materializationBytes)
  writeFileSync(path.join(autoDir, 'config.json'), JSON.stringify({ paperId: autoFixture.paperId, spellingReview: TEXT_REVIEW_POLICY }))
  writeFileSync(path.join(autoDir, 'universal-source-manifest.json'), JSON.stringify({
    ...autoFixture.manifest, materializationPath: 'materialization.json', mediaDirectory: 'media',
    documents: autoProduced.materialization.documents.map(document => ({ ...document, path: `${document.documentId}.bin` })),
  }))
  for (const document of autoFixture.sourceDocuments) writeFileSync(path.join(autoDir, `${document.documentId}.bin`), document.bytes)
  mkdirSync(path.join(autoDir, 'flags'))
  const request = { paperId: autoFixture.paperId, materialization: autoProduced.materialization,
    report: prepareSpellingReview(materializationBytes, TEXT_REVIEW_POLICY) }
  writeFileSync(path.join(autoDir, 'request.json'), JSON.stringify(request))
  const cli = (...args) => JSON.parse(execFileSync(process.execPath,
    [path.join(import.meta.dirname, 'import-pipeline/text-review-parts.mjs'), 'auto', path.join(autoDir, 'request.json'),
      '--paper-dir', autoDir, '--flags', path.join(autoDir, 'flags'), ...args], { encoding: 'utf8' }))
  const summary = cli('--output', path.join(autoDir, 'review.json'))
  const review = JSON.parse(readFileSync(path.join(autoDir, 'review.json'), 'utf8'))
  const targetFor = text => review.targets.find(target => target.before === text)
  const crossing = targetFor('😀 Bath — City.')
  assert.equal(crossing.decision, 'unchanged')
  assert.deepEqual(crossing.corrections, [])
  assert.equal(crossing.note, '跨强调边界，保留原排印')
  const mixed = targetFor('😀 Bath — City. Plain — Text.')
  assert.equal(mixed.decision, 'correct')
  assert.equal(mixed.corrections.length, 1)
  assert.equal(mixed.corrections[0].before, 'Plain — Text')
  assert(mixed.note.includes('跨强调边界，保留原排印'))
  const insideOutside = targetFor('😀 Inside — Mark Outside — Text.')
  assert.equal(insideOutside.corrections.length, 2)
  assert.equal(summary.skippedMechanical.length, 2)
  assert.deepEqual(summary.crossingAgentCorrections, [])
  const effective = applySpellingReview(materializationBytes, new TextEncoder().encode(JSON.stringify(review)))
  const ranges = loadSpellingSourceEmphasis(autoDir, request)
  for (const target of review.targets) {
    const mapped = mapSourceEmphasisEdits(target.before, ranges.get(target.jsonPointer) || [], target.corrections)
    const actual = target.jsonPointer.slice(1).split('/').reduce((node, key) => node[key], effective)
    assert.equal(mapped.text, actual)
  }
  // A reviewer-authored correction crossing the same mark stays visible and
  // is reported, so auto cannot silently discard a semantic correction.
  writeFileSync(path.join(autoDir, 'flags', 'agent.json'), JSON.stringify({ flags: [
    { quote: 'Bath', after: 'Bathe', category: 'spelling', reason: '测试明确拼写修正' },
  ] }))
  // Place the mark boundary inside the word for this independent source case.
  const agentFixture = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.replace(
    'A passage keeps one small promise.',
    `</w:t></w:r>${run('Ba', '<w:b/>')}<w:r><w:t xml:space="preserve">th word.`,
  ) })
  const agentProduced = produceNck1DocxMaterialization({ paperId: agentFixture.paperId, documents: agentFixture.sourceDocuments })
  const agentBytes = new TextEncoder().encode(JSON.stringify(agentProduced.materialization))
  writeFileSync(path.join(autoDir, 'materialization.json'), agentBytes)
  for (const document of agentFixture.sourceDocuments) writeFileSync(path.join(autoDir, `${document.documentId}.bin`), document.bytes)
  writeFileSync(path.join(autoDir, 'universal-source-manifest.json'), JSON.stringify({
    ...agentFixture.manifest, materializationPath: 'materialization.json', mediaDirectory: 'media',
    documents: agentProduced.materialization.documents.map(document => ({ ...document, path: `${document.documentId}.bin` })),
  }))
  writeFileSync(path.join(autoDir, 'request.json'), JSON.stringify({
    paperId: agentFixture.paperId, materialization: agentProduced.materialization,
    report: prepareSpellingReview(agentBytes, TEXT_REVIEW_POLICY),
  }))
  const agentSummary = cli('--output', path.join(autoDir, 'agent-review.json'))
  assert.equal(agentSummary.crossingAgentCorrections.length, 1)
  const agentReview = JSON.parse(readFileSync(path.join(autoDir, 'agent-review.json'), 'utf8'))
  assert.equal(agentReview.targets.find(target => target.before === 'Bath word.').corrections.length, 1)
} finally {
  rmSync(autoDir, { recursive: true, force: true })
}
console.log('PASS auto spelling: crossing mechanical edits skipped with unchanged note, mixed edits retained, inside/outside unchanged, UTF-16 coordinates, agent corrections retained and reported')

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
