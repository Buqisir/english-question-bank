import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveOcrQuestionTextEmphasis } from '../../server/paper-canonical/ocrQuestionTextEmphasis.mjs'
import { mapSourceEmphasisEdits } from '../../server/paper-canonical/sourceEmphasis.mjs'
import { makeSyntheticNck1OcrFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { produceNck1OcrMaterialization } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { nck1ListeningSourceDecisionAuthorityRef, nck1OcrOptionEmphasisAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewConsumption, buildNck1ReviewProjection } from '../../server/import-review/revisionProjection.mjs'
import { makeOptionEmphasisMediaFixture, writeOptionEmphasisMediaReviewFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/option-emphasis-media.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport, isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { sealCanonicalPublication, validateCanonicalPublicationBundle, publishCanonicalPaperPublication } from '../../server/paper-canonical/publication.mjs'
import { upgradeOcrOptionEmphasis } from './materialization-option-emphasis.mjs'
import { reviewPrintHtml } from '../../server/import-review/reviewPagination.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { buildCanonicalReadingConsumptionSurfaceData } from '../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

async function assertScreenMarkup(model) {
  const { createServer } = await import('../../app/node_modules/vite/dist/node/index.js')
  const { createElement } = await import('../../app/node_modules/react/index.js')
  const { renderToStaticMarkup } = await import('../../app/node_modules/react-dom/server.node.js')
  // Dependency trees may be shared read-only between worktrees.
  const cacheDir = mkdtempSync(path.join(tmpdir(), 'eqb-option-emphasis-vite-'))
  let vite
  try {
    vite = await createServer({ root: path.resolve('app'), cacheDir, server: { middlewareMode: true } })
    const { PaperSurface } = await vite.ssrLoadModule('/src/shared-ui/papersurface/PaperSurface.tsx')
    const html = renderToStaticMarkup(createElement(PaperSurface, {
      ...model.surfaceData, annotations: [], evidence: [], canonicalReadingBlocks: model.richBlocks,
      canonicalReadingPassageLetter: model.passageLetter, canonicalReadingSemanticSignature: model.semanticDigest,
      mode: 'lecture', lectureFocus: null, readingFocusBySection: {}, onFocusIntent() {},
    }))
    const marked = model.surfaceData.questions.flatMap(q => q.options)
      .flatMap(o => o.canonicalContent).find(node => node.marks?.includes('underline'))
    assert(html.includes(`data-canonical-content-node-id="${marked.nodeId}" data-source-marks="underline"`),
      'actual PaperSurface option DOM must consume the same source marks as Print/PDF')
  } finally {
    try { await vite?.close() } finally { rmSync(cacheDir, { recursive: true, force: true }) }
  }
}

const source = { kind: 'page_region', documentId: 'question', page: 1, region: { x: .1, y: .1, width: .8, height: .1 } }
test('OCR body and option splits use their authority typography version while preserving historical boundaries', async () => {
  const f = await makeSyntheticNck1OcrFixture()
  for (const [text, start, end, accepted] of [
    ['an avalanche(雪崩) claimed', 17, 24, true],
    ['word(词) , next', 0, 8, true],
    ['word（词） next', 0, 4, false],
  ]) {
    const confirmation = structuredClone(f.confirmation)
    confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v2'
    const items = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    const body = items.find(item => item.text === 'A passage keeps one small promise.')
    assert(body)
    body.text = text
    body.sourceEmphasis = [{ start, end, marks: ['bold'] }]
    const question = items.find(item => item.text.startsWith('30. Which choice fits item 30?'))
    assert(question)
    question.text = question.text.replace(/B[.．、]\s*.*?(?=\s+C[.．、])/u, `B. ${text}`)
    const optionStart = question.text.indexOf('B. ') + 3
    question.sourceEmphasis = [{ start: optionStart + start, end: optionStart + end, marks: ['underline'] }]
    const produced = produceNck1OcrMaterialization({ paperId: f.paperId, documents: f.sourceDocuments,
      evidence: f.evidence, confirmation })
    assert.equal(produced.disposition, 'ready_for_verification', JSON.stringify(produced.issues))
    const encode = value => Buffer.from(JSON.stringify(value))
    const input = { kind: 'nck1-source-materialization',
      materializationBytes: encode({ ...produced.materialization, schemaVersion: 'nck1-source-materialization-v11' }),
      documents: f.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
      media: produced.mediaFiles || [], ocrSourceBytes: { evidenceBytes: encode(f.evidence), confirmationBytes: encode(confirmation) } }
    const imported = importCanonicalCandidate(input)
    const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
    if (!accepted) {
      assert(imported.issues.some(issue => /normalization/.test(issue.message)))
      assert(!preview.compilation)
      continue
    }
    assert.deepEqual(imported.issues, [])
    assert(preview.compilation?.artifacts?.canonicalPaper, JSON.stringify(preview.unresolvedIssues))
    const groups = imported.candidate.interpretation.groups
    const bodyInlines = groups.find(group => group.slotId === 'reading.a').content.blocks[0].inlines
    const option = groups.flatMap(group => group.variant.choiceOwnership?.sets || [])
      .find(set => set.questionId.endsWith(':30')).options[1]
    for (const [inlines, mark] of [[bodyInlines, 'bold'], [option.content, 'underline']]) {
      assert.equal(inlines.map(node => node.text).join(''), text)
      assert.equal(inlines.filter(node => node.marks?.includes(mark)).map(node => node.text).join(''), text.slice(start, end))
    }
  }
})
test('a consumed body emphasis mapping failure stays blocking under the current authority', async () => {
  const f = await makeSyntheticNck1OcrFixture()
  const confirmation = structuredClone(f.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v2'
  const body = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text === 'A passage keeps one small promise.')
  assert(body)
  body.text = 'A passage keeps one small promise.'
  body.sourceEmphasis = [{ start: 2, end: 9, marks: ['underline'] }]
  const produced = produceNck1OcrMaterialization({ paperId: f.paperId, documents: f.sourceDocuments,
    evidence: f.evidence, confirmation })
  assert.equal(produced.disposition, 'ready_for_verification', JSON.stringify(produced.issues))
  const encode = value => Buffer.from(JSON.stringify(value))
  const input = { kind: 'nck1-source-materialization',
    materializationBytes: encode(produced.materialization),
    documents: f.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media: produced.mediaFiles || [], ocrSourceBytes: { evidenceBytes: encode(f.evidence), confirmationBytes: encode(confirmation) } }
  // Mutating the confirmed text after production makes the materialized body
  // text differ from the marked paragraph: this entered the consumption path
  // and must keep blocking instead of silently dropping the underline.
  const mismatched = structuredClone(confirmation)
  const target = mismatched.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.itemId === body.itemId)
  target.text = 'A passage keeps one small promise differently.'
  const derived = deriveNck1MaterializationBundle({ ...input,
    ocrSourceBytes: { ...input.ocrSourceBytes, confirmationBytes: encode(mismatched) } },
    nck1InImageOptionLabelsV2AuthorityRef)
  assert(derived.issues.some(issue => issue.code === 'MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED'
    && /does not match the exact materialized text/u.test(issue.message)), JSON.stringify(derived.issues))
  assert.equal((derived.warnings || []).length, 0)
})
test('unmatched emphasis under a historical authority stays a hard issue, not a drop', async () => {
  const f = await makeSyntheticNck1OcrFixture()
  const confirmation = structuredClone(f.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v2'
  // Emphasis on a paragraph no canonical surface consumes (the passage letter
  // heading): current authority drops it with a warning; replaying the same
  // bytes under the input-selected historical authority must keep failing.
  const heading = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text === 'A' && item.itemId.endsWith(':item-5'))
  assert(heading)
  heading.sourceEmphasis = [{ start: 0, end: 1, marks: ['bold'] }]
  const produced = produceNck1OcrMaterialization({ paperId: f.paperId, documents: f.sourceDocuments,
    evidence: f.evidence, confirmation })
  assert.equal(produced.disposition, 'ready_for_verification', JSON.stringify(produced.issues))
  const encode = value => Buffer.from(JSON.stringify(value))
  const materialization = { ...produced.materialization, schemaVersion: 'nck1-source-materialization-v11' }
  const input = { kind: 'nck1-source-materialization', materializationBytes: encode(materialization),
    documents: f.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media: produced.mediaFiles || [], ocrSourceBytes: { evidenceBytes: encode(f.evidence), confirmationBytes: encode(confirmation) } }
  const historical = deriveNck1MaterializationBundle(input, nck1OcrOptionEmphasisAuthorityRef)
  assert(historical.issues.some(issue => issue.code === 'MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED'),
    JSON.stringify(historical.issues))
  const current = deriveNck1MaterializationBundle(input, nck1InImageOptionLabelsV2AuthorityRef)
  assert.deepEqual(current.issues, [])
  assert(current.warnings?.some(warning => warning.code === 'MATERIALIZATION_SOURCE_EMPHASIS_DROPPED'),
    JSON.stringify(current.warnings))
})
test('public v11 option emphasis preserves non-default media through capture, Review and publication readback', async () => {
  const f = await makeOptionEmphasisMediaFixture()
  const upgraded = upgradeOcrOptionEmphasis(f.input)
  const input = { ...f.input, materializationBytes: upgraded.materializationBytes }
  const imported = importCanonicalCandidate(input)
  assert.deepEqual(imported.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const captured = preview.compilation.artifacts.sourceCapture.observations
    .find(observation => observation.kind === 'source_media' && observation.value.mediaId === f.media.mediaId)
  assert.deepEqual(captured.value.presentation, f.media.presentation)
  assert.deepEqual(captured.value.publication, f.media.publication)
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-option-emphasis-media-'))
  const db = new DatabaseSync(':memory:')
  try {
    writeOptionEmphasisMediaReviewFixture(rootDir, f, upgraded.materializationBytes)
    const review = buildNck1ReviewProjection(rootDir)
    const derivation = review.mediaDerivations.find(media => media.mediaId === f.media.mediaId)
    assert(derivation, 'actual Review must keep the source media derivation')
    assert.deepEqual(derivation.presentation, f.media.presentation)
    assert.deepEqual(derivation.publication, f.media.publication)
    const assertMedia = consumption => {
      const occurrences = consumption.selections.flatMap(selection => selection.projectedOccurrences)
      const media = occurrences.flatMap(occurrence => occurrence.media).find(media => media.mediaId === f.media.mediaId)
      assert.deepEqual(media.presentation, f.media.presentation)
      const marked = consumption.selections.filter(selection => selection.familyContractId === 'reading')
        .flatMap(selection => selection.groupIds).flatMap(groupId =>
          buildCanonicalReadingConsumptionSurfaceData({ consumption, groupId }).surfaceData.questions)
        .flatMap(question => question.options).flatMap(option => option.canonicalContent || [])
        .filter(node => node.marks?.includes('underline'))
      assert(marked.some(node => node.text === f.emphasizedText), 'media and option marks must coexist')
    }
    assertMedia(review.consumption)
    const request = materializeNck1CanonicalRequest(input, { schemaVersion: 'teacher-confirmation-v1',
      confirmed: true, sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
    const publication = publishCanonicalPaperPublication({ rootDir: path.join(rootDir, 'publication'),
      db, request: request.request, sourceAssetVersion: 1 })
    assert.equal(publication.status, 'published', JSON.stringify(publication.diagnostics))
    for (const consumer of ['screen', 'print_pdf']) {
      assert.equal(publication.consumers[consumer].disposition, 'ready')
      assertMedia(publication.consumers[consumer])
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
})
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
for (const [name, separator, punctuation] of [
  ['line-start bare', '\n', ''], ['double-space bare', '  ', ''], ['tab bare', '\t', ''],
  ['CRLF bare', '\r\n', ''], ['ASCII dot', ' ', '.'], ['fullwidth dot', ' ', '．'],
  ['ideographic comma', ' ', '、'],
]) test(`producer label syntax replays ${name}, with and without emphasis`, () => {
  for (const marked of [false, true]) {
    const f = fixture()
    f.paragraph.text = `21. ${f.question.stem}${f.question.options.map(option =>
      `${separator}${option.label}${punctuation} ${option.text}`).join('')}`
    const start = f.paragraph.text.indexOf('http://')
    f.paragraph.sourceEmphasis = marked ? [{ start, end: start + 20, marks: ['underline'] }] : []
    const mapped = resolveOcrQuestionTextEmphasis(f.question, f.structure)
    assert.equal(mapped.targets[2].text, f.question.options[1].text)
    assert.deepEqual(mapped.targets[2].ranges, marked ? [{ start: 6, end: 26, marks: ['underline'] }] : [])
  }
})
for (const [name, change] of [
  ['single-space bare labels', text => text.replaceAll('. ', ' ').replace(/^21 /u, '21. ')],
  ['missing label', text => text.replace('B.', '')],
  ['misordered bare labels', text => text.replace('B.', 'E')],
  ['changed option text', text => text.replace('Connect phone.', 'Connect tablet.')],
]) test(`producer label replay rejects ${name}`, () => {
  const f = fixture()
  f.paragraph.text = change(f.paragraph.text)
  f.paragraph.sourceEmphasis = []
  assert.throws(() => resolveOcrQuestionTextEmphasis(f.question, f.structure), /does not replay/u)
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
  const unmarked = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text.startsWith('29. Which choice fits item 29?'))
  assert(unmarked)
  unmarked.text = unmarked.text.replace(/\s([A-D])[.．、]\s*/gu, '\n$1 ')
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
  let screenModel
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
    screenModel = surface
    assert.deepEqual(surface.surfaceData.questions.find(question => question.id.endsWith(':30')).options[1].canonicalContent,
      option.content, 'Screen surface data retains the exact marked option inlines')
    const html = reviewPrintHtml({ consumption, paperId: f.paperId, paperName: 'Synthetic option emphasis', paperAsset: {} }, 'student', buildPrintHtml)
    const markedNode = option.content.find(node => node.marks?.includes('underline'))
    assert(html.includes(`data-canonical-content-node-id="${markedNode.nodeId}" data-source-marks="underline"`),
      'Print/PDF HTML retains the exact option node and source mark')
    assert.equal(preview.compilation.artifacts.canonicalPaper.paperPlan.authorityRef.manifestVersion, '77')
    const request = materializeNck1CanonicalRequest(joined, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
      sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
    const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
    assert.equal(admitted.compilation.disposition, 'ready')
    assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
    const sealed = sealCanonicalPublication({ compilation: admitted.compilation, sourceAsset: admitted.sourceAsset,
      sourceAssetVersion: 1, nck1MaterializationConfirmationProof: admitted.proof })
    const published = validateCanonicalPublicationBundle({ manifest: sealed.manifest, sourceAsset: sealed.sourceAsset,
      readArtifact: path => sealed.artifacts[path] ?? sealed.sourceEvidence[path] })
    assert.equal(published.manifest.authority.manifestVersion, '77')
    const publishedOption = published.groups.find(g => g.identity.groupId === group.groupId)
      .variant.choiceOwnership.sets.find(set => set.questionId.endsWith(':30')).options[1]
    assert.deepEqual(publishedOption.content, option.content, 'full publication preserves exact source-marked option')
    const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-option-emphasis-publication-'))
    const db = new DatabaseSync(':memory:')
    try {
      const publication = publishCanonicalPaperPublication({ rootDir, db, request: request.request, sourceAssetVersion: 1 })
      assert.equal(publication.status, 'published', JSON.stringify(publication.diagnostics))
      assert.equal(publication.consumers.screen.disposition, 'ready')
      assert.equal(publication.consumers.print_pdf.disposition, 'ready')
    } finally {
      db.close()
      rmSync(rootDir, { recursive: true, force: true })
    }
    assert(deriveNck1MaterializationBundle(joined, nck1ListeningSourceDecisionAuthorityRef).issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
  })
  await assertScreenMarkup(screenModel)
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
