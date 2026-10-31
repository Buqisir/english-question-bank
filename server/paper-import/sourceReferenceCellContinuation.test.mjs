import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replayAdjacentPageItems, replayConfirmedScoringTable } from './sourceReferenceCellContinuation.mjs'
import { prepareSourceReferenceCellContinuations,
  refreshSourceReferenceCellContinuations, sourceReferenceCellContinuations } from './sourceReferenceCellContinuation.mjs'
import { scoringFiguresFixture } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { buildNck1OcrSourceEvidence } from './nck1OcrSourceEvidence.mjs'
import { buildSourceReferences } from '../../scripts/import-pipeline/ocr-proofread.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from './sourceReferenceAdmission.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from './sourceReferenceSemantics.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences, validateSourceReferences } from './sourceReferences.mjs'
import { makeFixture } from '../../scripts/verify-nck1-source-materialization.mjs'
import { resolveCanonicalAuthority, nck1MaterializationCandidateAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { deriveNck1AnalyzedPackageBundle } from '../paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { buildNck1ReviewProjection, loadNck1ReviewSource, importNck1ReviewCandidate } from '../import-review/revisionProjection.mjs'
import { sourceReferences as fastSourceReferences } from '../../scripts/import-pipeline/fast-import.mjs'

function fixture() {
  const input = scoringFiguresFixture()
  const rows = (documentId, page) => documentId !== 'answers' || page < 3 ? [['Synthetic index.', .1, .1, .7]]
    : page === 3 ? [
      ['第四部分 写作（满分40分）\n第一节', .1, .1, .7],
      ['参考范文', .16, .1, .7], ['Our original source sample.', .2, .1, .7],
      ['评分标准', .3, .1, .7],
      ['第五档', .6, .1, .15], ['Complete source criterion.', .6, .4, .4],
      ['第三档', .7, .1, .15], ['Original last cell,', .7, .4, .4],
    ] : [
      ['with a continued exact source line,', .1, .4, .4], ['and its final source sentence.', .13, .4, .4],
      ['第二档', .25, .1, .15], ['The next table stays independent.', .25, .4, .4],
      ['第二节 读后续写', .5, .1, .7], ['参考范文', .55, .1, .7], ['Another original sample.', .6, .1, .7],
    ]
  const engineDocuments = input.sourceDocuments.map(document => ({ documentId: document.documentId,
    pages: Array.from({ length: document.pageCount }, (_, index) => {
      const page = index + 1
      const observations = rows(document.documentId, page).map(([text, y, x, width], i) => ({
        observationId: `${document.documentId}:p${page}:w${i}`, regionId: `${document.documentId}:p${page}:text${i}`,
        text, region: { x, y, width, height: .02 }, confidence: 1, alternatives: [],
      }))
      return { page, observations, regions: [
        ...observations.map(obs => ({ regionId: obs.regionId, kind: 'text', region: obs.region })),
        ...(document.documentId === 'answers' && page >= 3 ? [{
          regionId: `answers:page-${page}:table-1`, kind: 'visual',
          region: { x: .08, y: page === 3 ? .58 : .23, width: .75, height: page === 3 ? .16 : .06 },
        }] : []),
      ], readingOrderEdges: observations.slice(1).map((obs, i) => ({
        before: observations[i].observationId, after: obs.observationId,
      })) }
    }) }))
  input.evidence = buildNck1OcrSourceEvidence({ paperId: input.materialization.paperId, documents: input.sourceDocuments,
    engine: { name: 'synthetic-cell-continuation-fixture', version: '1' }, confidenceThreshold: .97, engineDocuments })
  input.confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3', paperId: input.materialization.paperId,
    confirmed: true, sourceSetDigest: input.evidence.sourceSetDigest, evidenceDigest: input.evidence.evidenceDigest,
    documents: engineDocuments.map(document => ({ documentId: document.documentId, pages: document.pages.map(page => {
      const orderedItems = page.observations.map(obs => ({
        itemId: obs.observationId.replace(':w', ':i'), observationIds: [obs.observationId], text: obs.text,
      }))
      return { page: page.page, orderedItems, furnitureObservationIds: [],
        visualClassifications: document.documentId === 'answers' && page.page >= 3 ? [{
          regionId: `answers:page-${page.page}:table-1`, classification: 'semantic_table',
          rows: page.page === 3 ? [4, 6].map(i => ({ header: false,
            cells: [[orderedItems[i].itemId], [orderedItems[i + 1].itemId]] }))
            : [{ header: false, cells: [[orderedItems[2].itemId], [orderedItems[3].itemId]] }],
        }] : [] }
    }) })) }
  reseal(input)
  return input
}
function reseal(input) {
  const { evidenceDigest: _, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
}
const selector = { groupId: 'application', referenceId: 'source-score-app-1',
  tableId: 'source-answers-page-3-table-1', cellId: 'source-answers-page-3-table-1-r1-c1',
  documentId: 'answers', page: 4, itemIds: ['answers:p4:i0', 'answers:p4:i1'], authorSessionId: 'synthetic-author' }
function selection(input) {
  return { ...selector, groupId: input.materialization.groups.find(g => g.writingTask?.taskType === 'application').groupId }
}
function reviewed(input) {
  const prepared = prepareSourceReferenceCellContinuations(input, [selection(input)])
  for (const [index, { relation }] of sourceReferenceCellContinuations(prepared.sidecar).entries()) {
    relation.review = { reviewedBy: 'import_agent', reviewerSessionId: 'synthetic-reviewer',
      verdict: 'confirmed_continuation', reviewedSubjectDigest: prepared.requests[index].subjectDigest,
      pages: relation.pages.map(page => ({ ...page, finding: 'Synthetic binding test only; no real-paper human QA asserted' })) }
  }
  return prepared
}

for (const producerVersion of ['ocr-source-references-producer-v25', 'ocr-source-references-producer-v26']) {
test(`sealed ${producerVersion}/v6 replay uses its original producer and never rewrites committed bytes`, () => {
  const input = fixture()
  const prepared = prepareSourceReferenceCellContinuations({
    ...input, producerVersion,
  }, [selection(input)])
  for (const [index, { relation }] of sourceReferenceCellContinuations(prepared.sidecar).entries()) {
    relation.review = { reviewedBy: 'import_agent', reviewerSessionId: `synthetic-${producerVersion}-reviewer`,
      verdict: 'confirmed_continuation', reviewedSubjectDigest: prepared.requests[index].subjectDigest,
      pages: relation.pages.map(page => ({ ...page, finding: 'Synthetic historical replay fixture only' })) }
  }
  const bytes = Buffer.from(JSON.stringify(prepared.sidecar)), before = sha256(bytes)
  assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt: {
    revisionId: `synthetic-${producerVersion}-v6`, bundleDigest: sha256('synthetic-bundle'),
    sourceReferencesDigest: before, paperId: prepared.sidecar.paperId,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
  } })
  assert.equal(sha256(bytes), before)
  assertSourceReferenceAdmission({ ...input, sidecar: prepared.sidecar })
})
}

test('public producer and direct admission replay the complete relation without visual early-return bypass', () => {
  const input = fixture(), pick = selection(input)
  const before = structuredClone(input)
  const capture = buildSourceReferences(input.materialization, input.evidence, input.confirmation, {
    sourceInput: input.sourceInput, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    cellContinuations: [pick],
  })
  assert.equal(capture.schemaVersion, 'source-references-v6')
  const pending = prepareSourceReferenceCellContinuations(input, [pick])
  assert.deepEqual(capture.groups, pending.sidecar.groups)
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: pending.sidecar }))
  const { sidecar } = reviewed(input)
  assert.deepEqual(validateSourceReferences({ ...input, sidecar }), [])
  assertSourceReferenceAdmission({ ...input, sidecar })
  const { entry, cell } = sourceReferenceCellContinuations(sidecar)[0]
  assert.equal(cell.text, 'Original last cell,\nwith a continued exact source line,\nand its final source sentence.')
  assert.equal(entry.blocks.length, 2)
  assert.equal(entry.blocks[1].tableId, 'source-answers-page-4-table-1')
  assert.equal(entry.blocks[1].rows[0][1].text, 'The next table stays independent.')
  assert.deepEqual(structuredClone(input), before)
  assert.equal(refreshSourceReferenceCellContinuations(input, sidecar).pending, false)
  const drift = { ...input, candidateDigest: sha256('new-candidate') }
  const refreshed = refreshSourceReferenceCellContinuations(drift, sidecar)
  assert.equal(refreshed.pending, true)
  assert.equal(sourceReferenceCellContinuations(refreshed.sidecar)[0].relation.review, null)
  const unknownReview = structuredClone(sidecar)
  sourceReferenceCellContinuations(unknownReview)[0].relation.review.fakeSignature = 'untrusted'
  assert.equal(refreshSourceReferenceCellContinuations(input, unknownReview).pending, true)
})

test('direct admission rejects missing/stale review, geometry/text/ownership/consumption/schema tampering', () => {
  const input = fixture(), { sidecar } = reviewed(input)
  const access = value => sourceReferenceCellContinuations(value)[0]
  for (const [name, mutate] of [
    ['missing review', v => { access(v).relation.review = null }],
    ['missing page', v => { access(v).relation.review.pages.pop() }],
    ['blank finding', v => { access(v).relation.review.pages[0].finding = ' ' }],
    ['wrong subject', v => { access(v).relation.review.reviewedSubjectDigest = sha256('bad') }],
    ['wrong raster', v => { access(v).relation.review.pages[1].rasterSha256 = sha256('bad') }],
    ['same session', v => { access(v).relation.review.reviewerSessionId = 'synthetic-author' }],
    ['text whitespace', v => { access(v).cell.text += ' ' }],
    ['unicode normalization', v => { access(v).cell.text = access(v).cell.text.replace('source', 'ｓｏｕｒｃｅ') }],
    ['base geometry', v => { access(v).cell.source.locator.region.x += .001 }],
    ['fragment geometry', v => { access(v).relation.fragment.source.locator.region.x += .001 }],
    ['observation geometry', v => { access(v).relation.fragment.observations[0].region.x += .001 }],
    ['base item', v => { access(v).relation.baseItemIds = ['answers:p3:i4'] }],
    ['source digest', v => { access(v).relation.evidenceSha256 = sha256('bad') }],
    ['target cell', v => { access(v).relation.transformation.target.cellId = 'foreign-cell' }],
    ['unknown field', v => { access(v).relation.review.fakeSignature = true }],
    ['unknown cell field', v => { access(v).cell.continuationSources = [] }],
    ['duplicate consume', v => { const { entry, relation } = access(v); entry.blocks.splice(1, 0, {
      kind: 'paragraph', paragraph: { paragraphId: 'forged-consumed-paragraph', role: 'body',
        source: relation.fragment.source, text: relation.fragment.text } }) }],
    ['block reorder', v => { access(v).entry.blocks.reverse() }],
    ['cross entry', v => { access(v).entry.referenceId = 'forged-entry' }],
    ['exclusion mix', v => { v.figureExclusions = [] }],
    ['chain', v => { access(v).relation.fragment.adjacentPageContinuation = {} }],
  ]) {
    const changed = structuredClone(sidecar)
    mutate(changed)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }), undefined, name)
  }
  for (const mutate of [
    x => { delete x.sourceInput.ocrSourceBytes },
    x => { x.sourceInput.documents[1].bytes = Buffer.from('changed PDF') },
    x => { x.candidateDigest = sha256('changed') },
    x => { x.materialization.groups[0].groupId += '-changed' },
  ]) {
    const changed = structuredClone(input); mutate(changed)
    assert.throws(() => assertSourceReferenceAdmission({ ...changed, sidecar }))
  }
})

test('current analyzed-package admission accepts JSON pointers without native documents or OCR and rejects tampering', () => {
  const content = structuredClone(makeFixture({ listening: false }))
  delete content.documents
  delete content.sourceCoverage
  content.schemaVersion = 'nck1-analyzed-package-content-v1'
  content.listening.evidence = { kind: 'package_declares_no_listening_content', documentId: 'content' }
  const group = content.groups.find(g => g.slotId === 'writing.continuation')
  const oldPrompt = group.writingTask.prompt
  const prompt = resolveCanonicalAuthority(nck1MaterializationCandidateAuthorityRef)
    .closure.profiles.get('nck1').instructions['writing.continuation.prompt'].text
  group.writingTask.prompt = prompt
  group.blocks.find(block => block.content?.some(item => item.text === oldPrompt)).content[0].text = prompt
  function pointers(value, pointer = '') {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach((child, index) => pointers(child, `${pointer}/${index}`))
    for (const [key, child] of Object.entries(value)) {
      if (['page_region', 'docx_part'].includes(child?.kind)) {
        value[key] = { kind: 'package_json_pointer', documentId: 'content', pointer }
      } else pointers(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)
    }
  }
  pointers(content)
  const members = [
    { memberId: 'content', role: 'content', mediaType: 'application/json', bytes: Buffer.from(JSON.stringify(content)) },
    { memberId: 'answers', role: 'official_answers', mediaType: 'application/json',
      bytes: Buffer.from(JSON.stringify({ sample: 'A synthetic official sample.', other: 'A different source value.' })) },
  ]
  const sourceInput = { kind: 'nck1-analyzed-package', members, manifestBytes: Buffer.from(JSON.stringify({
    schemaVersion: 'nck1-analyzed-package-v1', paperId: content.paperId, profileId: 'nck1', contentMemberId: 'content',
    members: members.map(({ bytes, ...member }) => ({ ...member, sha256: sha256(bytes), byteLength: bytes.length })),
  })) }
  const imported = importCanonicalCandidate(sourceInput)
  assert.deepEqual(imported.issues, [])
  const materialization = deriveNck1AnalyzedPackageBundle(sourceInput).materialization
  const input = { materialization, sourceInput, sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest }
  const sidecar = prepareSourceReferences(input)
  const source = pointer => ({ documentSha256: sha256(members[1].bytes),
    locator: { kind: 'package_json_pointer', documentId: 'answers', pointer } })
  for (const group of sidecar.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', entries: [], evidence: [source('')] }
  }
  assert.equal(sidecar.producerVersion, 'ocr-source-references-producer-v27')
  assert.equal(materialization.documents, undefined)
  assert.equal(sourceInput.ocrSourceBytes, undefined)
  assertSourceReferenceAdmission({ ...input, sidecar })
  sidecar.groups[0].essays = { state: 'captured', evidence: [], entries: [{
    referenceId: 'package-sample', authority: 'source_reference', sourceLabel: null, labelSource: null,
    paragraphs: [{ paragraphId: 'package-sample-p1', role: 'body',
      text: 'A synthetic official sample.', source: source('/sample') }],
  }] }
  assert.deepEqual(validateSourceReferences({ ...input, sidecar }), [])
  assertSourceReferenceAdmission({ ...input, sidecar })
  for (const pointer of ['/missing', '/other']) {
    const changed = structuredClone(sidecar)
    changed.groups[0].essays.entries[0].paragraphs[0].source.locator.pointer = pointer
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }),
      { code: 'SOURCE_REFERENCES_TEXT_DISAGREES' }, pointer)
  }
  const changedInput = structuredClone(sourceInput)
  changedInput.members[1].bytes = Buffer.from('{"sample":"Tampered member"}')
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sourceInput: changedInput, sidecar }),
    { code: 'SOURCE_REFERENCES_SOURCE_INVALID' })
  assertSourceReferenceAdmission({ ...input, sidecar })
})

test('current PDF table admission replays baseline regardless of removable continuation or layout version', () => {
  const input = fixture(), { sidecar: continued } = reviewed(input)
  const capture = buildSourceReferences(input.materialization, input.evidence, input.confirmation)
  const baseline = { ...continued, schemaVersion: 'source-references-v2', groups: capture.groups }
  const entry = value => value.groups[0].scoring.entries[0]
  assert.deepEqual(validateSourceReferences({ ...input, sidecar: baseline }), [])
  assertSourceReferenceAdmission({ ...input, sidecar: baseline })
  for (const version of [2, 3, 4]) {
    const stripped = structuredClone(continued)
    delete sourceReferenceCellContinuations(stripped)[0].cell.adjacentPageContinuation
    stripped.schemaVersion = `source-references-v${version}`
    // Valid layouts must still reach the source replay, not merely fail schema.
    assert.deepEqual(validateSourceReferences({ ...input, sidecar: stripped }), [], `v${version}`)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: stripped }),
      { code: 'SOURCE_REFERENCES_CELL_CONTINUATION_INVALID' }, `v${version}`)
  }
  for (const [name, mutate] of [
    ['invented cell text', v => { entry(v).blocks[0].rows[1][1].text += '\nINVENTED' }],
    ['cell source drift', v => { entry(v).blocks[0].rows[1][1].source.locator.region.x += .001 }],
    ['duplicated fragment', v => {
      const block = structuredClone(entry(v).blocks[1]); block.paragraph.paragraphId += '-duplicate'
      entry(v).blocks.splice(2, 0, block)
    }],
    ['missing fragment', v => { entry(v).blocks.splice(1, 1) }],
    ['missing table', v => { entry(v).blocks.splice(0, 1) }],
    ['swapped tables', v => { entry(v).blocks.reverse() }],
  ]) {
    const changed = structuredClone(baseline); mutate(changed)
    assert.deepEqual(validateSourceReferences({ ...input, sidecar: changed }), [], name)
    assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: changed }),
      { code: 'SOURCE_REFERENCES_CELL_CONTINUATION_INVALID' }, name)
  }
  assertSourceReferenceAdmission({ ...input, sidecar: continued })
})

test('shared baseline failures degrade per task and subsequent admissions survive in the same process', () => {
  const input = fixture(), { sidecar } = reviewed(input)
  for (const [name, mutate, degradedTask] of [
    ['missing section', pages => { pages[3].orderedItems[4].text = '原有参考附注' }, 'continuation'],
    ['unscoped table', pages => { pages[2].orderedItems[3].text = '原有参考附注' }, 'continuation'],
    ['unresolved label', pages => {
      pages[3].orderedItems[5].text = '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。'
    }, 'continuation'],
  ]) {
    const changed = structuredClone(input)
    mutate(changed.confirmation.documents.find(d => d.documentId === 'answers').pages)
    reseal(changed)
    // BUB-168: unresolved reference scope degrades the affected task to
    // not_supplied instead of blocking; the earlier sidecar no longer replays.
    let degraded
    try {
      degraded = buildSourceReferences(changed.materialization, changed.evidence, changed.confirmation)
    } catch (error) {
      // Scan-stage scope errors still fail closed (they cannot be attributed
      // to a single task); degraded capture failures mark their own task.
      degraded = error
    }
    if (degraded instanceof Error) {
      assert.throws(() => assertSourceReferenceAdmission({ ...changed, sidecar }), undefined, name)
    } else {
      const degradedGroups = degraded.groups.filter(group => group.essays.state === 'not_supplied')
      assert(degradedGroups.length >= 1, `${name}: expected a degraded task, got ` +
        degraded.groups.map(group => `${group.taskType}:${group.essays.state}`).join(','))
      assert(degraded.review.some(entry => /degraded to not_supplied/u.test(entry.issue)), name)
      assert.throws(() => assertSourceReferenceAdmission({ ...changed, sidecar }), undefined, name)
    }
    assertSourceReferenceAdmission({ ...input, sidecar })
  }
})

test('proposal rejects cross-document/page/cell/entry, incomplete paragraph and cross-column selections', () => {
  const input = fixture(), pick = selection(input)
  for (const change of [
    { documentId: 'questions' }, { page: 3 }, { page: 5 },
    { cellId: 'source-answers-page-3-table-1-r0-c1' },
    { cellId: 'source-answers-page-3-table-1-r1-c0' }, { referenceId: 'foreign-entry' },
    { itemIds: ['answers:p4:i1'] }, { itemIds: ['answers:p4:i0'] },
    { itemIds: ['answers:p4:i0', 'answers:p4:i2'] },
    { itemIds: ['answers:p4:i0', 'answers:p4:i1', 'answers:p4:i2'] },
    { itemIds: ['answers:p4:i0', 'answers:p4:i0'] }, { extra: true },
  ]) assert.throws(() => prepareSourceReferenceCellContinuations(input, [{ ...pick, ...change }]))
  assert.throws(() => prepareSourceReferenceCellContinuations(input, [pick, pick]))
  for (const mutate of [
    x => { x.evidence.documents.find(d => d.documentId === 'answers').pages[3].observations[0].region.x = .1 },
    x => { x.confirmation.documents.find(d => d.documentId === 'answers').pages[3].orderedItems[0].text = '读后续写评分标准' },
    x => { x.confirmation.documents.find(d => d.documentId === 'answers').pages[3].furnitureObservationIds.push('answers:p4:w0') },
  ]) {
    const changed = structuredClone(input); mutate(changed); reseal(changed)
    assert.throws(() => prepareSourceReferenceCellContinuations(changed, [pick]))
  }
})

test('synthetic public CLI build → prepare → authored record → finalize → admission → Review projection', async () => {
  const input = fixture()
  const scratch = path.resolve(import.meta.dirname, '../../.scratch/n180')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'public-')), paper = path.join(dir, 'paper')
  const put = (name, content) => {
    const file = path.join(paper, name); mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, typeof content === 'string' || content instanceof Uint8Array ? content : JSON.stringify(content))
  }
  const paperId = input.materialization.paperId
  put('config.json', { paperId, format: 'universal-nck1', listening: 'absent-by-exam-design',
    provenance: { paperName: 'Synthetic cell continuation', source: 'Synthetic fixture', year: 2026 } })
  put('universal-source-manifest.json', { schemaVersion: 'universal-nck1-source-manifest-v1', paperId,
    profileId: 'nck1', provenance: { paperName: 'Synthetic cell continuation', source: 'Synthetic fixture', year: 2026 },
    documents: input.materialization.documents.map(doc => ({ ...doc, path: `source/${doc.documentId}.pdf` })),
    materializationPath: 'materialization/nck1-source-materialization-v1.json', mediaDirectory: 'materialization/media' })
  put('materialization/nck1-source-materialization-v1.json', input.materialization)
  put('materialization/nck1-ocr-source-evidence-v1.json', input.sourceInput.ocrSourceBytes.evidenceBytes)
  put('materialization/nck1-ocr-source-confirmation-v1.json', input.sourceInput.ocrSourceBytes.confirmationBytes)
  for (const doc of input.sourceInput.documents) put(`source/${doc.documentId}.pdf`, doc.bytes)
  const cli = path.resolve(import.meta.dirname, '../../scripts/import-pipeline/answer-products.mjs')
  const run = args => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const selectors = path.join(dir, 'selectors.json'), request = path.join(dir, 'request.json')
  writeFileSync(selectors, JSON.stringify([selection(input)]))
  run(['prepare', '--paper-dir', paper, '--adjacent-cell-continuations', selectors, '--output', request])
  const authored = JSON.parse(readFileSync(request)).adjacentPageCellContinuationRequest
  assert.equal(authored.status, 'awaiting_independent_source_page_review')
  const pendingFile = path.join(dir, 'pending.json')
  writeFileSync(pendingFile, JSON.stringify(authored.proposal))
  const missing = path.join(dir, 'missing-review-final.json')
  assert.throws(() => run(['finalize', '--paper-dir', paper, '--input', pendingFile, '--output', missing]))
  assert.equal(existsSync(missing), false)
  const ctx = { paperId, paperDir: paper, work: path.join(dir, 'work'), fast: path.join(dir, 'work/fast') }
  mkdirSync(ctx.fast, { recursive: true })
  const draftPath = path.join(ctx.work, 'source-references-draft.json')
  writeFileSync(draftPath, JSON.stringify(authored.proposal))
  const calls = []
  const execute = async (_ctx, label, args) => {
    calls.push(label)
    // Capture was already exercised through the public build above. Every
    // prepare/finalize below uses the real CLI against this isolated workspace.
    if (label === 'references') return { producerVersion: 'ocr-source-references-producer-v25', outline: [] }
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  }
  await assert.rejects(() => fastSourceReferences(ctx, execute), /待独立双页原图审核/u)
  assert.deepEqual(calls, ['references', 'answer-products-prepare'])
  assert.equal(existsSync(path.join(paper, 'source-references-v1.json')), false)
  assert.equal(existsSync(path.join(ctx.fast, 'source-references-input.json')), false)
  // Hand-authored synthetic record follows v24's offline binding model. It
  // exercises the format; no claim of real source QA or reviewer authentication.
  const { relation } = sourceReferenceCellContinuations(authored.proposal)[0]
  relation.review = { reviewedBy: 'import_agent', reviewerSessionId: 'synthetic-cli-reviewer',
    reviewedSubjectDigest: authored.requests[0].subjectDigest, verdict: 'confirmed_continuation',
    pages: relation.pages.map(page => ({ ...page, finding: 'Synthetic CLI binding fixture only' })) }
  const source = path.join(dir, 'authored.json'), output = path.join(paper, 'source-references-v1.json')
  writeFileSync(source, JSON.stringify(authored.proposal))
  run(['finalize', '--paper-dir', paper, '--input', source, '--output', output])
  const exact = readFileSync(output)
  run(['verify', '--paper-dir', paper, '--references', output])
  assert.throws(() => run(['finalize', '--paper-dir', paper, '--input', source, '--output', output]))
  assert.deepEqual(readFileSync(output), exact)
  const loaded = loadNck1ReviewSource(paper), imported = importNck1ReviewCandidate(paper, loaded)
  assert.deepEqual(imported.issues, [])
  assertSourceReferenceAdmission({ sidecar: authored.proposal, materialization: loaded.materialization,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest,
    sourceInput: loaded.sourceInput })
  const projection = buildNck1ReviewProjection(paper)
  assert.equal(projection.sourceReferencesDigest, sha256(exact))
  assert.equal(sourceReferenceCellContinuations(projection.sourceReferences)[0].cell.text,
    'Original last cell,\nwith a continued exact source line,\nand its final source sentence.')
  writeFileSync(draftPath, JSON.stringify(authored.proposal))
  calls.length = 0
  await fastSourceReferences(ctx, execute)
  assert.deepEqual(calls, ['references', 'answer-products-prepare', 'answer-products-finalize'])
  assert.deepEqual(readFileSync(output), exact)
  const resume = path.join(dir, 'resume.json')
  run(['prepare', '--paper-dir', paper, '--adjacent-cell-sidecar', source, '--output', resume])
  assert.equal(JSON.parse(readFileSync(resume)).adjacentPageCellContinuationRequest.status, 'review_record_retained')
  relation.review.reviewedSubjectDigest = sha256('drift')
  writeFileSync(source, JSON.stringify(authored.proposal))
  const stale = path.join(dir, 'stale-request.json')
  run(['prepare', '--paper-dir', paper, '--adjacent-cell-sidecar', source, '--output', stale])
  const retreated = JSON.parse(readFileSync(stale)).adjacentPageCellContinuationRequest
  assert.equal(retreated.status, 'awaiting_independent_source_page_review')
  assert.equal(sourceReferenceCellContinuations(retreated.proposal)[0].relation.review, null)
  assert.throws(() => run(['verify', '--paper-dir', paper, '--references', source]))
  writeFileSync(draftPath, JSON.stringify(authored.proposal))
  calls.length = 0
  await assert.rejects(() => fastSourceReferences(ctx, execute), /待独立双页原图审核/u)
  assert.deepEqual(calls, ['references', 'answer-products-prepare'])
  assert.deepEqual(readFileSync(output), exact, 'pending drift preserves prior finalized bytes')
})

test('historical producers v17–24 retain exact sealed replay and admit under their own rules', () => {
  const input = fixture()
  for (let version = 17; version <= 24; version++) {
    const producerVersion = `ocr-source-references-producer-v${version}`
    const capture = buildSourceReferences(input.materialization, input.evidence, input.confirmation, { producerVersion })
    const sidecar = { schemaVersion: 'source-references-v2', producerVersion,
      paperId: input.materialization.paperId, sourceDigest: input.sourceDigest,
      candidateDigest: input.candidateDigest, materializationDigest: digestJson(input.materialization), groups: capture.groups }
    const bytes = Buffer.from(JSON.stringify(sidecar))
    const receipt = { revisionId: 'synthetic-sealed-revision', bundleDigest: sha256('synthetic-bundle'),
      sourceReferencesDigest: sha256(bytes), paperId: input.materialization.paperId,
      sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest }
    assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt })
    assertSourceReferenceAdmission({ ...input, sidecar })
    assert.throws(() => assertSealedSourceReferenceReplay({ ...input,
      sourceReferencesBytes: Buffer.concat([bytes, Buffer.from(' ')]), receipt }))
  }
})

test('current producer and sealed v24/v25/v26 preserve v23 scoring headings and chart capture', () => {
  const input = scoringFiguresFixture({ scoringIntro: true })
  const versions = [...['v23', 'v24', 'v25', 'v26'].map(version => `ocr-source-references-producer-${version}`),
    OCR_SOURCE_REFERENCES_PRODUCER_VERSION]
  const captures = versions.map(producerVersion => buildSourceReferences(input.materialization, input.evidence,
    input.confirmation, { sourceDocuments: input.sourceDocuments, producerVersion }))
  assert.equal(captures[0].schemaVersion, 'source-references-v4')
  assert.deepEqual(captures[0].groups, captures[1].groups)
  assert.deepEqual(captures[1].groups, captures[2].groups)
  assert.deepEqual(captures[2].groups, captures[3].groups)
  assert.deepEqual(captures[3].groups, captures[4].groups)
  assert.equal(captures[2].groups[0].scoring.entries[0].sourceLabel, '二、各档次的给分范围和要求')
  const sidecar = { schemaVersion: 'source-references-v4', producerVersion: versions.at(-1),
    paperId: input.materialization.paperId, sourceDigest: input.sourceDigest,
    candidateDigest: input.candidateDigest, materializationDigest: digestJson(input.materialization), groups: captures.at(-1).groups }
  for (const producerVersion of versions.slice(1, -1)) {
    const historical = { ...sidecar, producerVersion }
    const bytes = Buffer.from(JSON.stringify(historical)), before = sha256(bytes)
    assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt: {
      revisionId: `synthetic-chart-${producerVersion}`, bundleDigest: sha256('synthetic-bundle'), sourceReferencesDigest: before,
      paperId: sidecar.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    } })
    assert.equal(sha256(bytes), before)
    assertSourceReferenceAdmission({ ...input, sidecar: historical })
  }
  assertSourceReferenceAdmission({ ...input, sidecar })
})

const doc = { documentId: 'answers', role: 'official_answers', mediaType: 'application/pdf', sha256: 'sha256:fixture' }
const observation = (id, x, y) => ({ observationId: id, region: { x, y, width: .1, height: .02 } })
const item = id => ({ itemId: id, observationIds: [`o-${id}`], text: id })

test('replays the confirmed base table and next-page items without modifying inputs', () => {
  const page = { page: 3, orderedItems: [item('a'), item('b')],
    visualClassifications: [{ classification: 'semantic_table', regionId: 'answers:page-3:table-1',
      rows: [{ cells: [['a'], ['b']] }] }] }
  const proof = { page: 3, observations: [observation('o-a', .1, .2), observation('o-b', .3, .2)] }
  const table = { tableId: 'source-answers-page-3-table-1', rows: [[{}, {}]] }
  const before = structuredClone({ doc, page, proof, table })
  const base = replayConfirmedScoringTable({ document: doc, confirmationPage: page, evidencePage: proof, table })
  assert.deepEqual(base.rows[0].map(cell => cell.text), ['a', 'b'])
  const next = { page: 4, orderedItems: [item('c'), item('d'), item('e')], furnitureObservationIds: [],
    visualClassifications: [{ classification: 'semantic_table', rows: [{ cells: [['e']] }] }] }
  const nextProof = { page: 4, observations: [observation('o-c', .3, .1), observation('o-d', .3, .2), observation('o-e', .3, .3)] }
  const result = replayAdjacentPageItems({ document: doc, basePage: page, page: next,
    evidencePage: nextProof, itemIds: ['c', 'd'] })
  assert.equal(result.text, 'c\nd')
  assert.deepEqual(result.observationIds, ['o-c', 'o-d'])
  assert.deepEqual({ doc, page, proof, table }, before)
  for (const ids of [['d'], ['c', 'e'], ['c', 'c'], ['c', 'd', 'e'], []]) {
    assert.throws(() => replayAdjacentPageItems({ document: doc, basePage: page, page: next,
      evidencePage: nextProof, itemIds: ids }), /Scoring cell continuation/u)
  }
  assert.throws(() => replayAdjacentPageItems({ document: doc, basePage: { page: 2 }, page: next,
    evidencePage: nextProof, itemIds: ['c'] }), /immediately following/u)
})
