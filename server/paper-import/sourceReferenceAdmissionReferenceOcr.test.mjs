import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadNck1OcrSourceEmphasis, loadReferenceOcrSourceBytes, resolveReferenceSourceDocuments, nck1ReferenceOcrSourceDocuments,
  NCK1_OCR_EVIDENCE_FILE_NAME, NCK1_OCR_CONFIRMATION_FILE_NAME } from './nck1OcrSourceEvidence.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceEssayTaskStates } from './sourceReferenceWritingTask.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from './sourceReferenceAdmission.mjs'
import { prepareSourceReferences } from './sourceReferences.mjs'
import { produceNck1OcrMaterialization } from './nck1OcrMaterializationProducer.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { buildSourceReferences } from '../../scripts/import-pipeline/ocr-proofread.mjs'
import { makeSyntheticNck1ImageBundleFixture } from '../../test-fixtures/paper-import/nck1-image-source-bundle-v1/fixture.mjs'

const current = 'ocr-source-references-producer-v27'
test('reference-only loader preserves Canonical v1 and ignores historical-producer beside files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-reference-ocr-loader-'))
  const dir = path.join(root, 'materialization')
  mkdirSync(dir)
  const evidenceBytes = Buffer.from(JSON.stringify({ schemaVersion: 'nck1-ocr-source-evidence-v1' }))
  const confirmationBytes = Buffer.from(JSON.stringify({ schemaVersion: 'nck1-ocr-source-confirmation-v1' }))
  const read = producerVersion => loadReferenceOcrSourceBytes(root, { producerVersion })
  try {
    assert.equal(read(current), undefined)
    writeFileSync(path.join(dir, NCK1_OCR_CONFIRMATION_FILE_NAME), confirmationBytes)
    assert.deepEqual(loadNck1OcrSourceEmphasis(root), {})
    assert.throws(() => read(current), /both retained files/u)
    assert.equal(read('ocr-source-references-producer-v25'), undefined)
    writeFileSync(path.join(dir, NCK1_OCR_EVIDENCE_FILE_NAME), evidenceBytes)
    const bytes = read(current)
    assert.deepEqual(read('ocr-source-references-producer-v26'), bytes)
    assert.deepEqual(Buffer.from(bytes.evidenceBytes), evidenceBytes)
    assert.deepEqual(Buffer.from(bytes.confirmationBytes), confirmationBytes)
    assert.deepEqual(loadNck1OcrSourceEmphasis(root), {})
    assert.equal(loadReferenceOcrSourceBytes(root, { producerVersion: current, canonicalOcrSourceBytes: bytes }), undefined)
    writeFileSync(path.join(dir, NCK1_OCR_EVIDENCE_FILE_NAME), '')
    assert.throws(() => read(current), /nonempty/u)
    assert.equal(read('ocr-source-references-producer-v25'), undefined)
    writeFileSync(path.join(dir, NCK1_OCR_EVIDENCE_FILE_NAME), JSON.stringify({ schemaVersion: 'unknown' }))
    assert.throws(() => read(current), /retained v1/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('current retained-v1 writing chooses original answer when materialization omitted renditionOf', () => {
  const bytes = Buffer.from('immutable carrier')
  const document = { documentId: 'answers', role: 'official_answers', byteLength: bytes.length, pageCount: 1,
    mediaType: 'application/vnd.eqb.nck1-image-source-bundle+json', sha256: sha256(bytes) }
  const materialization = { paperId: 'paper-test', documents: [document, { ...document, documentId: 'answers-pdf',
    mediaType: 'application/pdf' }],
  groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })) }
  const texts = ['第一节 应用文', '参考范文', 'An original application sample.',
    '第二节 读后续写', '参考范文', 'An original continuation sample.']
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v1',
    documents: [{ documentId: document.documentId, pages: [{ page: 1,
    orderedItems: texts.map((text, i) => ({ itemId: `i${i}`, text, observationIds: [`o${i}`] })),
    visualClassifications: [] }] }] }
  const evidence = { documents: [{ documentId: document.documentId, pages: [{ page: 1,
    observations: texts.map((text, i) => ({ observationId: `o${i}`, text,
      region: { x: .1, y: .1 + i * .1, width: .7, height: .02 } })), regions: [] }] }] }
  const manifest = { paperId: materialization.paperId, documents: materialization.documents.map((doc, i) =>
    ({ ...doc, ...(i ? { renditionOf: 'answers' } : {}) })) }
  const supplied = materialization.documents.map(doc => ({ documentId: doc.documentId, bytes }))
  const referenceSourceDocuments = resolveReferenceSourceDocuments(materialization, supplied, manifest)
  const before = structuredClone({ materialization, evidence, confirmation })
  assert.throws(() => prepareSourceReferenceWritingItems(materialization, evidence, confirmation), /verified Source Manifest/u)
  assert.equal(prepareSourceReferenceWritingItems(materialization, evidence, confirmation, { referenceSourceDocuments }).answerDocument.documentId, 'answers')
  for (const producerVersion of ['ocr-source-references-producer-v26', current]) {
    const states = sourceReferenceEssayTaskStates(confirmation, new Set(['answers', 'answers-pdf']),
      materialization, evidence, { producerVersion, referenceSourceDocuments })
    assert.equal(states.get('i2').task, 'application')
    assert.equal(states.get('i5').task, 'continuation')
    const captured = buildSourceReferences(materialization, evidence, confirmation,
      { referenceSourceDocuments, sourceDocuments: supplied, producerVersion })
    assert(captured.groups.every(group => group.scoring.state === 'not_supplied'))
    assert.deepEqual(captured.groups[0].scoring.evidence.map(item => item.locator.documentId), ['answers', 'answers-pdf'])
  }
  assert.throws(() => prepareSourceReferenceWritingItems(materialization, evidence, confirmation,
    { producerVersion: 'ocr-source-references-producer-v25' }), /exactly one/u)
  const captured = buildSourceReferences(materialization, evidence, confirmation,
    { referenceSourceDocuments, sourceDocuments: supplied })
  for (const group of captured.groups) {
    assert.equal(group.scoring.state, 'not_supplied')
    assert.deepEqual(group.scoring.evidence.map(item => item.locator.documentId), ['answers', 'answers-pdf'])
  }
  assert.throws(() => buildSourceReferences(materialization, evidence, confirmation,
    { sourceDocuments: supplied }), /original Source Manifest/u)
  assert.throws(() => buildSourceReferences(materialization, evidence, confirmation,
    { sourceDocuments: supplied, referenceSourceDocuments: [...referenceSourceDocuments] }), /verified Source Manifest/u)
  assert.deepEqual({ materialization, evidence, confirmation }, before)
})

test('reference-only bytes cannot replace Canonical OCR or remove the native PDF guard', () => {
  const sourceInput = { documents: [], ocrSourceBytes: { evidenceBytes: new Uint8Array([1]), confirmationBytes: new Uint8Array([2]) } }
  const before = structuredClone(sourceInput)
  assert.throws(() => assertSourceReferenceAdmission({ sidecar: null, materialization: {},
    sourceInput, referenceOcrSourceBytes: {} }), /cannot override Canonical/u)
  assert.deepEqual(sourceInput, before)
  assert.throws(() => assertSourceReferenceAdmission({ sidecar: null,
    materialization: { documents: [{ role: 'official_answers', mediaType: 'application/pdf' }] },
    sourceInput: { documents: [] } }), /Native answer PDF requires complete sealed OCR bytes/u)
})

test('real retained v1 OCR captures current text without changing Canonical identity and rejects broken closure', async () => {
  const fixture = await makeSyntheticNck1ImageBundleFixture()
  const produced = produceNck1OcrMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments,
    evidence: fixture.evidence, confirmation: fixture.confirmation })
  assert.equal(produced.disposition, 'ready_for_verification')
  const materialization = produced.materialization
  const sourceInput = { kind: 'nck1-source-materialization',
    materializationBytes: Buffer.from(JSON.stringify(materialization)),
    documents: fixture.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })), media: [] }
  const original = structuredClone(sourceInput)
  const imported = importCanonicalCandidate(sourceInput)
  assert.deepEqual(imported.issues, [])
  const candidate = imported.candidate
  const referenceOcrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(fixture.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(fixture.confirmation)) }
  const hashes = Object.fromEntries(Object.entries(referenceOcrSourceBytes).map(([key, bytes]) => [key, sha256(bytes)]))
  const binding = { materialization, sourceInput, sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest, referenceOcrSourceBytes,
    referenceSourceManifest: { paperId: fixture.paperId, documents: fixture.sourceDocuments } }
  const captured = buildSourceReferences(materialization, fixture.evidence, fixture.confirmation,
    { ...binding, sourceInput: { ...sourceInput, ocrSourceBytes: referenceOcrSourceBytes },
      sourceDocuments: sourceInput.documents, producerVersion: current })
  const sidecar = { ...prepareSourceReferences({ ...binding, structuredScoring: captured.structuredScoring }),
    ...(captured.schemaVersion ? { schemaVersion: captured.schemaVersion } : {}), groups: captured.groups }
  assert.equal(sidecar.producerVersion, current)
  assert(sidecar.groups.every(group => group.essays.state === 'captured'))
  assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...binding, sidecar }))
  assert.deepEqual(structuredClone(sourceInput), original)
  const replayed = importCanonicalCandidate(sourceInput, undefined, { materializationAuthorityRef: candidate.authority })
  assert.deepEqual(replayed.candidate, candidate)
  assert.deepEqual(Object.fromEntries(Object.entries(referenceOcrSourceBytes).map(([key, bytes]) => [key, sha256(bytes)])), hashes)
  for (const [label, edit] of [
    ['source set', c => { c.sourceSetDigest = `sha256:${'0'.repeat(64)}` }],
    ['page closure', c => { c.documents[0].pages.pop() }],
    ['item closure', c => { c.documents[1].pages[0].orderedItems.pop() }],
  ]) {
    const confirmation = structuredClone(fixture.confirmation); edit(confirmation)
    assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar,
      referenceOcrSourceBytes: { ...referenceOcrSourceBytes, confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } }),
    /closure/u, label)
  }
  for (const [label, edit] of [
    ['page pixels', e => { e.documents[0].pages[0].raster.pixelWidth += 1 }],
  ]) {
    const evidence = structuredClone(fixture.evidence); edit(evidence)
    evidence.evidenceDigest = digestJson(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'evidenceDigest')))
    const confirmation = { ...fixture.confirmation, evidenceDigest: evidence.evidenceDigest }
    assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar,
      referenceOcrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)),
        confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } }), /closure/u, label)
  }
  const altered = structuredClone(sidecar); altered.groups[0].essays.entries[0].paragraphs[0].text += ' changed'
  assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar: altered }), /exactly replay/u)
  const missingRendition = { ...sourceInput, documents: sourceInput.documents.slice(0, -1) }
  assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar, sourceInput: missingRendition }), /including renditions/u)
  const changedBytes = { ...sourceInput, documents: sourceInput.documents.map((doc, index) => {
    if (index) return doc
    const bytes = new Uint8Array(doc.bytes); bytes[0] ^= 1
    return { ...doc, bytes }
  }) }
  assert.throws(() => assertSourceReferenceAdmission({ ...binding, sidecar, sourceInput: changedBytes }), /including renditions/u)
  const historical = { ...sidecar, producerVersion: 'ocr-source-references-producer-v25' }
  assertSourceReferenceAdmission({ ...binding, sidecar: historical })
  // Historical producer replay must retain the same original/rendition mapping.
  const previous = { ...sidecar, producerVersion: 'ocr-source-references-producer-v26' }
  const previousBytes = Buffer.from(JSON.stringify(previous))
  assertSealedSourceReferenceReplay({ ...binding, sourceReferencesBytes: previousBytes, receipt: {
    revisionId: 'sealed-v26-retained-v1', bundleDigest: sha256('synthetic-v26-bundle'),
    sourceReferencesDigest: sha256(previousBytes), paperId: materialization.paperId,
    sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest,
  } })
  assertSourceReferenceAdmission({ ...binding, sidecar: previous })
  // This receipt is for the new current capture.
  const bytes = Buffer.from(JSON.stringify(sidecar))
  const receipt = { revisionId: 'current-v27-test-revision', bundleDigest: digestJson({ current: true }),
    sourceReferencesDigest: sha256(bytes), paperId: materialization.paperId,
    sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest }
  assert.doesNotThrow(() => assertSealedSourceReferenceReplay({ ...binding, sourceReferencesBytes: bytes, receipt }))
  assert.throws(() => assertSealedSourceReferenceReplay({ ...binding,
    sourceReferencesBytes: Buffer.concat([bytes, Buffer.from(' ')]), receipt }), /trusted sealed/u)
  console.log(JSON.stringify({ candidateAuthority: candidate.authority, sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest, ocrBytes: hashes }))
})

// All mutations must fail at the public admission boundary before pixel replay.
test('retained-v1 public admission rejects unproved PDF relationships before OCR replay', () => {
  const bytes = Buffer.from('carrier')
  const make = () => {
    const original = { documentId: 'answers', role: 'official_answers',
      mediaType: 'application/vnd.eqb.nck1-image-source-bundle+json',
      sha256: sha256(bytes), byteLength: bytes.length, pageCount: 1 }
    const pdf = { ...original, documentId: 'answers-pdf', mediaType: 'application/pdf' }
    return { sidecar: null, materialization: { paperId: 'paper-test', documents: [original, pdf] },
      sourceInput: { documents: [original, pdf].map(doc => ({ documentId: doc.documentId, bytes })) },
      referenceSourceManifest: { paperId: 'paper-test', documents: [original, { ...pdf, renditionOf: original.documentId }] },
      referenceOcrSourceBytes: {
        evidenceBytes: Buffer.from(JSON.stringify({ schemaVersion: 'nck1-ocr-source-evidence-v1' })),
        confirmationBytes: Buffer.from(JSON.stringify({ schemaVersion: 'nck1-ocr-source-confirmation-v1' })),
      } }
  }
  for (const [label, mutate] of [
    ['missing manifest', x => { delete x.referenceSourceManifest }],
    ['same-role PDF without relationship', x => { delete x.referenceSourceManifest.documents[1].renditionOf }],
    ['dangling target', x => { x.referenceSourceManifest.documents[1].renditionOf = 'missing' }],
    ['PDF target', x => { x.referenceSourceManifest.documents[1].renditionOf = 'answers-pdf' }],
    ['role mismatch', x => { x.referenceSourceManifest.documents[1].role = x.materialization.documents[1].role = 'questions' }],
    ['page mismatch', x => { x.referenceSourceManifest.documents[1].pageCount = x.materialization.documents[1].pageCount = 2 }],
    ['missing original', x => {
      x.materialization.documents.shift(); x.referenceSourceManifest.documents.shift(); x.sourceInput.documents.shift()
    }],
    ['conflicting materialization target', x => { x.materialization.documents[1].renditionOf = 'different' }],
    ['manifest SHA', x => { x.referenceSourceManifest.documents[1].sha256 = `sha256:${'0'.repeat(64)}` }],
    ['manifest byteLength', x => { x.referenceSourceManifest.documents[1].byteLength++ }],
    ['manifest document ID', x => { x.referenceSourceManifest.documents[1].documentId = 'other' }],
    ['duplicate manifest document', x => { x.referenceSourceManifest.documents[1] = x.referenceSourceManifest.documents[0] }],
    ...['scoring', 'alternate'].map(kind => [`independent ${kind} PDF`, x => {
      const extraBytes = Buffer.from(`${kind} source content`)
      const extra = { ...x.materialization.documents[1], documentId: `${kind}-pdf`,
        sha256: sha256(extraBytes), byteLength: extraBytes.length }
      x.materialization.documents.push(extra)
      x.referenceSourceManifest.documents.push({ ...extra })
      x.sourceInput.documents.push({ documentId: extra.documentId, bytes: extraBytes })
    }]),
  ]) {
    const input = make(); mutate(input)
    assert.throws(() => assertSourceReferenceAdmission(input), { code: 'SOURCE_REFERENCES_RENDITION_INVALID' }, label)
  }
})

test('v2 and v3 document selection retains the existing explicit-rendition rule', () => {
  const documents = [
    { documentId: 'image', mediaType: 'application/vnd.eqb.nck1-image-source-bundle+json' },
    { documentId: 'independent', mediaType: 'application/pdf' },
    { documentId: 'copy', mediaType: 'application/pdf', renditionOf: 'image' },
  ]
  for (const version of [2, 3]) {
    assert.deepEqual(nck1ReferenceOcrSourceDocuments(documents,
      { schemaVersion: `nck1-ocr-source-confirmation-v${version}` }), documents.slice(0, 2))
  }
})
