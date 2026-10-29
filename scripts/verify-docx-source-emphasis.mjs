import assert from 'node:assert/strict'
import { extractDocxDocumentParagraphs, extractDocxParagraphEmphasis } from '../server/paper-canonical/docxSourceAdapter.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { mapSourceEmphasisEdits, splitSourceEmphasis } from '../server/paper-canonical/sourceEmphasis.mjs'
import { produceNck1DocxMaterialization } from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { deriveNck1MaterializationBundle, nck1MaterializationSourceSummary } from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { nck1MaterializationHistoricalAuthorityRef54, nck1MaterializationHistoricalAuthorityRef57,
  nck1MaterializationHistoricalAuthorityRef58, nck1MaterializationHistoricalAuthorityRef66,
  nck1MaterializationCandidateAuthorityRef, resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
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
const claimedText = 'an avalanche(雪崩) claimed'
const claimedRange = [{ start: 17, end: 24, marks: ['bold'] }]
for (const version of [undefined, '3']) {
  assert.throws(() => splitSourceEmphasis(claimedText, claimedRange, 'test', version), /normalization/)
}
assert.deepEqual(splitSourceEmphasis(claimedText, claimedRange, 'test', '4'), [
  { kind: 'text', nodeId: 'test:run-1', text: 'an avalanche(雪崩) ' },
  { kind: 'text', nodeId: 'test:run-2', text: 'claimed', marks: ['bold'] },
])
for (const version of [undefined, '3', '4']) {
  assert.throws(() => splitSourceEmphasis('word（词） next', [{ start: 0, end: 4, marks: ['bold'] }], 'test', version), /normalization/)
  assert.equal(splitSourceEmphasis('word(词) , next', [{ start: 0, end: 8, marks: ['bold'] }], 'test', version)
    .map(node => node.text).join(''), 'word(词) , next')
}
for (const version of ['2', '5', '', null, 4]) {
  assert.throws(() => splitSourceEmphasis('plain', [], 'test', version), /Unknown.*version/)
}
assert.equal(splitSourceEmphasis('plain marked end', [{ start: 6, end: 12, marks: ['bold'] }], 'test').map((n) => n.text).join(''), 'plain marked end')
console.log('PASS emphasis mapping: length-changing edits before/inside/after, boundary rejection, typography closure')

const boundaryInput = (text, start, end) => {
  const f = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.replace(
    'C passage keeps one small promise.',
    `${text.slice(0, start)}</w:t></w:r>${run(text.slice(start, end), '<w:b/>')}<w:r><w:t xml:space="preserve">${text.slice(end)}`,
  ) })
  const p = produceNck1DocxMaterialization({ paperId: f.paperId, documents: f.sourceDocuments })
  assert.equal(p.disposition, 'ready_for_verification')
  return { kind: 'nck1-source-materialization', materializationBytes: new TextEncoder().encode(JSON.stringify(p.materialization)),
    documents: f.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })), media: [] }
}
const v4Input = boundaryInput(claimedText, 17, 24)
const v4Imported = importCanonicalCandidate(v4Input)
assert.deepEqual(v4Imported.issues, [])
const v4Block = v4Imported.candidate.interpretation.groups.find(group => group.slotId === 'reading.c').content.blocks[0]
assert.deepEqual(v4Block.inlines.map(({ text, marks }) => ({ text, ...(marks ? { marks } : {}) })), [
  { text: 'an avalanche(雪崩) ' }, { text: 'claimed', marks: ['bold'] },
])
assert(compileNck1MaterializationCandidatePreview(v4Imported.candidate).compilation)
assert(deriveNck1MaterializationBundle(v4Input, nck1MaterializationHistoricalAuthorityRef58)
  .issues.some(issue => /normalization/.test(issue.message)), 'DOCX must read the v3 authority rather than silently upgrading')
const historicalBoundaryInput = boundaryInput('word(词) , next', 0, 8)
// Frozen on the unmodified implementation. These bind the exact historical
// Candidate and full Preview, including interpretations, node IDs and marks.
for (const [authority, candidateDigest, previewDigest] of [
  [nck1MaterializationHistoricalAuthorityRef58, 'sha256:4c903b62e947cc6c86191996d8c6965320a778a71f055b394f2d7f47939f8021', 'sha256:378d18f98c79e36d390e49eb88c398a2dfc02c5e50b83852af8810857e7323ab'],
  [nck1MaterializationHistoricalAuthorityRef66, 'sha256:b152c26150b02cf7dcdf523e7e41dc2f3f54746ffacad0bc1c9799d959b8be6d', 'sha256:c47e3cc8ada4b8f4ef57ad48ca3b4a9b686186f979b9c7af32bcc98a0ad9f5e1'],
  [nck1MaterializationCandidateAuthorityRef, 'sha256:0fcdf5af00f9c840f6e677225d44e786cfee5c289ed1e5039543f8ec5a52ee6b', 'sha256:f4394b6ac435d0763614c31c7e1fccd6a4695df584284d3e6ca7c26f864f7f1f'],
]) {
  const bundle = deriveNck1MaterializationBundle(historicalBoundaryInput, authority)
  assert.deepEqual(bundle.issues, [])
  const body = { schemaVersion: 'trusted-nck1-materialization-import-candidate-v1', authority,
    source: nck1MaterializationSourceSummary(bundle), operatorChoices: {}, interpretation: bundle.source, issues: [] }
  assert.equal(digestJson(body), candidateDigest)
  const replay = compileNck1MaterializationCandidatePreview({ ...body, candidateDigest, sourceInput: historicalBoundaryInput })
  assert(replay.compilation?.artifacts?.canonicalPaper)
  assert.equal(digestJson(replay), previewDigest)
}
// Inject malformed registries only for a synchronous derive and restore them
// before the next check, so these probes cannot affect other authorities.
const normalization = resolveCanonicalAuthority(nck1MaterializationCandidateAuthorityRef).closure.artifacts.normalization
const originalRules = normalization.rules
const typography = originalRules.find(rule => rule.ruleId === 'canonical-visible-typography')
try {
  for (const rules of [undefined, originalRules.filter(rule => rule !== typography),
    [...originalRules, { ...typography }], originalRules.map(rule => rule === typography ? { ...rule, version: '5' } : rule)]) {
    normalization.rules = rules
    assert(deriveNck1MaterializationBundle(v4Input).issues.some(issue => /one supported canonical-visible-typography/.test(issue.message)))
  }
} finally { normalization.rules = originalRules }
assert(deriveNck1MaterializationBundle(v4Input, { ...nck1MaterializationCandidateAuthorityRef, manifestDigest: 'sha256:invalid' })
  .issues.some(issue => issue.code === 'AUTHORITY_UNAVAILABLE'))
console.log('PASS DOCX authority-bound v3/v4 admission, frozen v58/v66/v67 Candidate/Preview identity and fail-closed rule resolution')

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
await import('./import-pipeline/spelling-source-emphasis.test.mjs')
