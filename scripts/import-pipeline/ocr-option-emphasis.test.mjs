import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveOcrQuestionTextEmphasis } from '../../server/paper-canonical/ocrQuestionTextEmphasis.mjs'
import { mapSourceEmphasisEdits } from '../../server/paper-canonical/sourceEmphasis.mjs'
import { makeSyntheticNck1OcrFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { produceNck1OcrMaterialization } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { nck1ListeningSourceDecisionAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { upgradeOcrOptionEmphasis } from './materialization-option-emphasis.mjs'
import { reviewPrintHtml } from '../../server/import-review/reviewPagination.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { buildCanonicalReadingConsumptionSurfaceData } from '../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

const source = { kind: 'page_region', documentId: 'question', page: 1, region: { x: .1, y: .1, width: .8, height: .1 } }
const fixture = () => {
  const question = { sourceNumber: 21, stem: 'Which address?', source,
    options: ['Visit home.', 'Visit http://192.168.100.1.', 'Connect phone.', 'Enter password.'].map((text, index) => ({ label: String.fromCharCode(65 + index), text })) }
  const text = `21. ${question.stem}\n${question.options.map(option => `${option.label}. ${option.text}`).join(' ')}`
  const start = text.indexOf('http://')
  const paragraph = { kind: 'paragraph', sourceIndex: source, text, sourceEmphasis: [{ start, end: start + 20, marks: ['underline'] }] }
  return { question, paragraph, structure: { body: [paragraph] } }
}
test('literal option emphasis replays at the question anchor and keeps original UTF-16 offsets', () => {
  const { question, structure } = fixture()
  const result = resolveOcrQuestionTextEmphasis(question, structure)
  const target = result.targets.find(target => target.key === 'option:1')
  assert.deepEqual(target.ranges, [{ start: 6, end: 26, marks: ['underline'] }])
  assert.equal(target.text.slice(target.ranges[0].start, target.ranges[0].end), 'http://192.168.100.1')
  const mapped = mapSourceEmphasisEdits(target.text, target.ranges, [{ start: 0, before: 'Visit', after: 'Visits' }])
  assert.deepEqual(mapped.ranges, [{ start: 7, end: 27, marks: ['underline'] }])
  assert.throws(() => mapSourceEmphasisEdits(target.text, target.ranges, [{ start: 5, before: ' http', after: 'http' }]), /crosses a mark boundary/u)
})
test('separate option paragraphs retain repeated words and UTF-16 coordinates without text search', () => {
  const f = fixture()
  f.question.options[1].text = '😀 same same'
  const paragraph = { kind: 'paragraph', sourceIndex: { ...source, region: { ...source.region, y: .3 } },
    text: 'A. Visit home.\nB. 😀 same same\nC. Connect phone.\nD. Enter password.' }
  const start = paragraph.text.indexOf('same') + 'same '.length
  paragraph.sourceEmphasis = [{ start, end: start + 4, marks: ['bold', 'underline'] }]
  const stem = { kind: 'paragraph', sourceIndex: source, text: '21. Which address?' }
  const mapped = resolveOcrQuestionTextEmphasis(f.question, { body: [stem, paragraph] })
  assert.deepEqual(mapped.targets[2].ranges, [{ start: 8, end: 12, marks: ['bold', 'underline'] }])
  assert.equal(mapped.targets[2].text.slice(8, 12), 'same')
})
for (const [name, mutate, error] of [
  ['out-of-range span', f => { f.paragraph.sourceEmphasis[0].end = f.paragraph.text.length + 1 }, /outside/u],
  ['nonexistent option', f => { f.question.options[1].label = 'E' }, /ordered/u],
  ['forged option text', f => { f.question.options[1].text = 'Visit forged address.' }, /does not replay/u],
  ['cross-option span', f => { f.paragraph.sourceEmphasis[0].end = f.paragraph.text.indexOf('Connect') + 4 }, /crosses/u],
  ['option label span', f => { f.paragraph.sourceEmphasis[0].start = f.paragraph.text.indexOf('B.') }, /crosses/u],
  ['foreign question anchor', f => { f.question.source = { ...source, page: 2 } }, /anchor/u],
  ['duplicate question anchor', f => { f.structure.body.push(structuredClone(f.paragraph)) }, /anchor/u],
]) test(`reject ${name}`, () => {
  const f = fixture(); mutate(f)
  assert.throws(() => resolveOcrQuestionTextEmphasis(f.question, f.structure), error)
})

test('public OCR import compiles and admits sealed option marks; legacy readers and forged targets fail closed', async t => {
  const f = await makeSyntheticNck1OcrFixture()
  const confirmation = structuredClone(f.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v2'
  const item = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text.startsWith('30. Which choice fits item 30?'))
  assert(item)
  const label = /(?:^|\s)B[.．、]\s*/u.exec(item.text)
  assert(label)
  const start = label.index + label[0].length
  item.sourceEmphasis = [{ start, end: start + 3, marks: ['underline'] }]
  const produced = produceNck1OcrMaterialization({ paperId: f.paperId, documents: f.sourceDocuments,
    evidence: f.evidence, confirmation })
  const encode = value => Buffer.from(JSON.stringify(value))
  const input = { kind: 'nck1-source-materialization', materializationBytes: encode(produced.materialization),
    documents: f.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media: produced.mediaFiles || [], ocrSourceBytes: { evidenceBytes: encode(f.evidence), confirmationBytes: encode(confirmation) } }
  const baseline = Buffer.from(input.materializationBytes)
  assert(deriveNck1MaterializationBundle(input).issues.some(issue => /unmatched or unsupported|outside the supported/u.test(issue.message)))
  const upgraded = upgradeOcrOptionEmphasis(input)
  assert.deepEqual(input.materializationBytes, baseline, 'upgrade must not mutate its historical input')
  const joined = { ...input, materializationBytes: upgraded.materializationBytes }
  withNck1MaterializationSourceCache(() => {
    const imported = importCanonicalCandidate(joined)
    assert.deepEqual(imported.issues, [])
    const group = imported.candidate.interpretation.groups.find(group => group.variant.choiceOwnership?.sets?.some(set => set.questionId.endsWith(':30')))
    const option = group.variant.choiceOwnership.sets.find(set => set.questionId.endsWith(':30')).options[1]
    assert.equal(option.content.filter(node => node.marks?.includes('underline')).map(node => node.text).join(''), item.text.slice(start, start + 3))
    for (const node of option.content) assert(group.sourceSpanRefsByTarget[`content_node:${node.nodeId}`]?.length)
    const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
    assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
    const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
    assert.equal(consumption.disposition, 'ready')
    const surface = buildCanonicalReadingConsumptionSurfaceData({ consumption, groupId: group.groupId })
    assert.deepEqual(surface.surfaceData.questions.find(question => question.id.endsWith(':30')).options[1].canonicalContent,
      option.content, 'Screen surface data retains the exact marked option inlines')
    const html = reviewPrintHtml({ consumption, paperId: f.paperId, paperName: 'Synthetic option emphasis', paperAsset: {} }, 'student', buildPrintHtml)
    const markedNode = option.content.find(node => node.marks?.includes('underline'))
    assert(html.includes(`data-canonical-content-node-id="${markedNode.nodeId}" data-source-marks="underline"`),
      'Print/PDF HTML retains the exact option node and source mark')
    assert.equal(preview.compilation.artifacts.canonicalPaper.paperPlan.authorityRef.manifestVersion, '77')
    const request = materializeNck1CanonicalRequest(joined, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
      sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
    assert.equal(admitLiveConfirmedNck1MaterializationImport(request.request).compilation.disposition, 'ready')
    assert(deriveNck1MaterializationBundle(joined, nck1ListeningSourceDecisionAuthorityRef).issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
  })
  for (const [name, mutate] of [
    ['range outside sealed paragraph', (m, c) => { c.documents[0].pages.flatMap(page => page.orderedItems).find(value => value.itemId === item.itemId).sourceEmphasis[0].end = item.text.length + 1 }],
    ['nonexistent option label', m => { m.groups.find(group => group.questions.some(q => q.sourceNumber === 30)).questions.find(q => q.sourceNumber === 30).options[1].label = 'E' }],
    ['forged emphasis in materialized option', m => { m.groups.find(group => group.questions.some(q => q.sourceNumber === 30)).questions.find(q => q.sourceNumber === 30).options[1].marks = ['bold'] }],
    ['cross-option confirmed range', (m, c) => { c.documents[0].pages.flatMap(page => page.orderedItems).find(value => value.itemId === item.itemId).sourceEmphasis[0].end = item.text.indexOf('C.') + 3 }],
    ['forged unsupported mark', (m, c) => { c.documents[0].pages.flatMap(page => page.orderedItems).find(value => value.itemId === item.itemId).sourceEmphasis[0].marks = ['italic'] }],
  ]) await t.test(name, () => withNck1MaterializationSourceCache(() => {
    const m = structuredClone(upgraded.materialization), c = structuredClone(confirmation)
    mutate(m, c)
    const rejected = importCanonicalCandidate({ ...joined, materializationBytes: encode(m),
      ocrSourceBytes: { ...joined.ocrSourceBytes, confirmationBytes: encode(c) } })
    assert(rejected.issues.length, name)
    assert(!compileNck1MaterializationCandidatePreview(rejected.candidate).compilation, name)
  }))
})
