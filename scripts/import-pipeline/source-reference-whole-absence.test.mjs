import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { scoringFiguresFixture } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { importNck1ReviewCandidate, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { WHOLE_DOCUMENT_ABSENCE_KIND, wholeDocumentAbsenceSubject } from '../../server/paper-import/sourceReferenceWholeDocumentAbsence.mjs'
import { buildSourceReferences } from './ocr-proofread.mjs'

// Synthetic data and review only: this is not an independent real-page QA.
function fixture() {
  const input = scoringFiguresFixture()
  const answers = input.confirmation.documents.find(d => d.documentId === 'answers')
  const evidence = input.evidence.documents.find(d => d.documentId === 'answers')
  for (const [index, page] of answers.pages.entries()) {
    const proof = evidence.pages[index]
    const observation = proof.observations[0]
    observation.text = index === 0 ? '1. A' : `Text ${index}`
    proof.observations = [observation]
    proof.regions = [{ regionId: observation.regionId, kind: 'text', region: observation.region }]
    proof.readingOrderEdges = []
    page.orderedItems = [{ itemId: `synthetic-${index}`, observationIds: [observation.observationId], text: observation.text }]
    page.visualClassifications = []
    page.furnitureObservationIds = []
  }
  reseal(input)
  const sidecar = prepareSourceReferences(input)
  const doc = input.materialization.documents.find(d => d.role === 'official_answers')
  for (const group of sidecar.groups) for (const kind of ['essays', 'scoring']) group[kind] = {
    state: 'not_supplied', entries: [], evidence: Array.from({ length: doc.pageCount }, (_, i) => ({
      documentSha256: doc.sha256, locator: { kind: 'page_region', documentId: doc.documentId,
        page: i + 1, region: { x: 0, y: 0, width: 1, height: 1 } },
    })),
  }
  const ocr = input.sourceInput.ocrSourceBytes
  sidecar.wholeDocumentWritingAbsence = { kind: WHOLE_DOCUMENT_ABSENCE_KIND, sourceSetDigest: input.evidence.sourceSetDigest,
    evidenceSha256: sha256(ocr.evidenceBytes), confirmationSha256: sha256(ocr.confirmationBytes), authorSessionId: 'fixture-author', review: null }
  const result = wholeDocumentAbsenceSubject({ ...input, sidecar, requireReview: false })
  sidecar.wholeDocumentWritingAbsence.review = { reviewedBy: 'import_agent', reviewerSessionId: 'fixture-reviewer',
    reviewedSubjectDigest: result.subjectDigest, verdict: 'confirmed_absent',
    pages: result.subject.inventory[0].pages.map(page => ({ ...page, finding: 'Synthetic source fixture only' })) }
  return { ...input, sidecar }
}
function reseal(input) {
  const { evidenceDigest: old, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
}

for (const producerVersion of ['ocr-source-references-producer-v24', 'ocr-source-references-producer-v25']) {
test(`${producerVersion} whole-document absence retains exact sealed replay after v26 becomes current`, () => {
  const input = fixture(), sidecar = input.sidecar
  sidecar.producerVersion = producerVersion
  const { subjectDigest } = wholeDocumentAbsenceSubject({ ...input, requireReview: false })
  sidecar.wholeDocumentWritingAbsence.review.reviewedSubjectDigest = subjectDigest
  const bytes = Buffer.from(JSON.stringify(sidecar))
  const before = sha256(bytes)
  assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt: {
    revisionId: `synthetic-${producerVersion}-whole-absence`, bundleDigest: sha256('synthetic-bundle'),
    sourceReferencesDigest: sha256(bytes), paperId: sidecar.paperId,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
  } })
  assert.equal(sha256(bytes), before)
  assert.throws(() => assertSourceReferenceAdmission(input), /current producer/u)
})
}

test('sealed v25 cannot remove the absence declaration and OCR to bypass its original gate', () => {
  const input = fixture(), sidecar = input.sidecar
  sidecar.producerVersion = 'ocr-source-references-producer-v25'
  delete sidecar.wholeDocumentWritingAbsence
  delete input.sourceInput.ocrSourceBytes
  const bytes = Buffer.from(JSON.stringify(sidecar))
  assert.throws(() => assertSealedSourceReferenceReplay({ ...input, sourceReferencesBytes: bytes, receipt: {
    revisionId: 'synthetic-v25-missing-ocr', bundleDigest: sha256('synthetic-bundle'),
    sourceReferencesDigest: sha256(bytes), paperId: sidecar.paperId,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
  } }), /Whole-document PDF absence requires complete OCR/u)
})

test('synthetic whole-document declaration requires exact review and source bindings', () => {
  const input = fixture()
  assertSourceReferenceAdmission(input)
  const captured = buildSourceReferences(input.materialization, input.evidence, input.confirmation, {
    absenceSidecar: input.sidecar, sourceInput: input.sourceInput,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
  })
  assert.deepEqual(captured.groups, input.sidecar.groups)
  for (const mutate of [
    x => { x.sidecar.wholeDocumentWritingAbsence.review = null },
    x => { x.sidecar.wholeDocumentWritingAbsence.review.reviewerSessionId = 'fixture-author' },
    x => { x.sidecar.wholeDocumentWritingAbsence.review.reviewedSubjectDigest = sha256('changed') },
    x => { x.sidecar.wholeDocumentWritingAbsence.review.pages.pop() },
    x => { x.sidecar.wholeDocumentWritingAbsence.review.pages[1] = structuredClone(x.sidecar.wholeDocumentWritingAbsence.review.pages[0]) },
    x => { x.sidecar.wholeDocumentWritingAbsence.review.pages[0].rasterSha256 = sha256('other') },
    x => { x.sidecar.groups[0].essays.evidence.pop() },
    x => { x.sidecar.groups[1].scoring.evidence[0].locator.region.width = .5 },
    x => { x.sidecar.groups[0].groupId = 'foreign' },
    x => { x.sidecar.sourceDigest = sha256('other') },
    x => { x.sidecar.candidateDigest = sha256('other') },
    x => { x.sidecar.materializationDigest = sha256('other') },
    x => { x.sourceInput.ocrSourceBytes.evidenceBytes = Buffer.from('{}') },
    x => { x.sourceInput.ocrSourceBytes.confirmationBytes = Buffer.from('{}') },
    x => { x.sourceInput.documents[1].bytes = Buffer.from('wrong') },
    x => { delete x.sourceInput.ocrSourceBytes },
  ]) {
    const changed = structuredClone(input)
    mutate(changed)
    assert.throws(() => assertSourceReferenceAdmission(changed))
  }
  const undeclared = structuredClone(input)
  delete undeclared.sidecar.wholeDocumentWritingAbsence
  assert.throws(() => assertSourceReferenceAdmission(undeclared), /No answer-document section found/)
})

test('explicit writing contradictions anywhere in confirmed source block the new gate', () => {
  for (const text of ['参考范文', '应用文评分细则', 'Dear Alex,', 'Paragraph 1: The rain stopped.',
    '第二节 读后续写', '写作评分说明', '第四部分 写作', 'Dear Alex',
    '范文一：支持立场', '范文二：反对立场', '2. 评分参考', '4. 评分细则',
    '（2）评分标准', '一、评分原则']) {
    const input = fixture()
    const page = input.confirmation.documents.find(d => d.documentId === 'answers').pages[3]
    const proof = input.evidence.documents.find(d => d.documentId === 'answers').pages[3]
    page.orderedItems[0].text = proof.observations[0].text = text
    reseal(input)
    input.sidecar.wholeDocumentWritingAbsence.evidenceSha256 = sha256(input.sourceInput.ocrSourceBytes.evidenceBytes)
    input.sidecar.wholeDocumentWritingAbsence.confirmationSha256 = sha256(input.sourceInput.ocrSourceBytes.confirmationBytes)
    const rejection = /writing contradiction|writing or scoring scope exists/
    assert.throws(() => wholeDocumentAbsenceSubject({ ...input, requireReview: false }), rejection, text)
    assert.throws(() => assertSourceReferenceAdmission(input), rejection, text)
    assert.throws(() => buildSourceReferences(input.materialization, input.evidence, input.confirmation, {
      absenceSidecar: input.sidecar, sourceInput: input.sourceInput,
      sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    }), rejection, text)
  }
  for (const text of ['语法填空每小题1.5分，评分时按答案给分。', '4. 评分时应考虑内容。']) {
    const input = fixture()
    const page = input.confirmation.documents.find(d => d.documentId === 'answers').pages[3]
    const proof = input.evidence.documents.find(d => d.documentId === 'answers').pages[3]
    page.orderedItems[0].text = proof.observations[0].text = text
    reseal(input)
    input.sidecar.wholeDocumentWritingAbsence.evidenceSha256 = sha256(input.sourceInput.ocrSourceBytes.evidenceBytes)
    input.sidecar.wholeDocumentWritingAbsence.confirmationSha256 = sha256(input.sourceInput.ocrSourceBytes.confirmationBytes)
    assert.doesNotThrow(() => wholeDocumentAbsenceSubject({ ...input, requireReview: false }), text)
  }
})

test('visuals and incomplete or foreign answer documents fail closed', () => {
  for (const classification of ['content_media', 'semantic_table']) {
    const input = fixture()
    input.confirmation.documents.find(d => d.documentId === 'answers').pages[3].visualClassifications
      .push({ classification, regionId: 'synthetic-visual' })
    reseal(input)
    input.sidecar.wholeDocumentWritingAbsence.evidenceSha256 = sha256(input.sourceInput.ocrSourceBytes.evidenceBytes)
    input.sidecar.wholeDocumentWritingAbsence.confirmationSha256 = sha256(input.sourceInput.ocrSourceBytes.confirmationBytes)
    assert.throws(() => wholeDocumentAbsenceSubject({ ...input, requireReview: false }))
  }
  for (const change of [
    x => { x.materialization.documents.find(d => d.role === 'official_answers').role = 'question_and_answers' },
    x => { x.materialization.documents.push({ ...x.materialization.documents.find(d => d.role === 'official_answers'), documentId: 'second' }) },
    x => { x.materialization.groups = x.materialization.groups.filter(g => g.writingTask?.taskType !== 'continuation') },
  ]) {
    const input = fixture()
    change(input)
    assert.throws(() => wholeDocumentAbsenceSubject({ ...input, requireReview: false }))
  }
})

test('synthetic public capture installs atomically and verifies without replacing existing files', () => {
  const input = fixture()
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'whole-absence-public-'))
  const paper = path.join(dir, 'paper')
  mkdirSync(path.join(paper, 'materialization'), { recursive: true })
  const put = (name, content) => {
    const file = path.join(paper, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, typeof content === 'string' || content instanceof Uint8Array ? content : JSON.stringify(content))
  }
  const paperId = input.materialization.paperId
  put('config.json', { paperId, format: 'universal-nck1', importProfile: 'public-paper-v1',
    provenance: { paperName: 'Synthetic exam', source: 'Synthetic fixture', year: 2026 } })
  put('universal-source-manifest.json', { schemaVersion: 'universal-nck1-source-manifest-v1', paperId,
    profileId: 'nck1', provenance: { paperName: 'Synthetic exam', source: 'Synthetic fixture', year: 2026 },
    documents: input.materialization.documents.map(doc => ({ ...doc, path: `source/${doc.documentId}.pdf` })),
    materializationPath: 'materialization/nck1-source-materialization-v1.json', mediaDirectory: 'materialization/media' })
  put('materialization/nck1-source-materialization-v1.json', JSON.stringify(input.materialization))
  put('materialization/nck1-ocr-source-evidence-v1.json', input.sourceInput.ocrSourceBytes.evidenceBytes)
  put('materialization/nck1-ocr-source-confirmation-v1.json', input.sourceInput.ocrSourceBytes.confirmationBytes)
  for (const doc of input.sourceInput.documents) put(`source/${doc.documentId}.pdf`, doc.bytes)
  const cli = path.join(import.meta.dirname, 'answer-products.mjs')
  const run = args => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const request = path.join(dir, 'request.json')
  run(['prepare', '--paper-dir', paper, '--whole-document-writing-absence', '--author-session-id', 'fixture-author', '--output', request])
  const proposal = JSON.parse(readFileSync(request)).wholeDocumentWritingAbsenceRequest
  proposal.proposal.wholeDocumentWritingAbsence.review = { reviewedBy: 'import_agent', reviewerSessionId: 'fixture-reviewer',
    reviewedSubjectDigest: proposal.subjectDigest, verdict: 'confirmed_absent',
    pages: proposal.subject.inventory[0].pages.map(page => ({ ...page, finding: 'Synthetic fixture only' })) }
  const authorInput = path.join(dir, 'input.json'), output = path.join(dir, 'final.json')
  writeFileSync(authorInput, JSON.stringify(proposal.proposal), { flag: 'wx' })
  run(['finalize', '--paper-dir', paper, '--input', authorInput, '--output', output])
  const bytes = readFileSync(output)
  run(['verify', '--paper-dir', paper, '--references', output])
  // Deterministically simulate a replacement on a second read, without changing
  // the file or relying on a race. The validated snapshot must supply the SHA.
  const hook = path.join(dir, 'replace-on-reread.cjs'), counts = path.join(dir, 'read-count.txt')
  writeFileSync(hook, `
const fs = require('node:fs')
const { syncBuiltinESMExports } = require('node:module')
const original = fs.readFileSync
let count = 0
fs.readFileSync = function(file, ...args) {
  if (String(file) === process.env.SNAPSHOT_TEST_PATH && ++count > 1) return Buffer.from('null\\n')
  return original.call(this, file, ...args)
}
syncBuiltinESMExports()
process.on('exit', () => fs.writeFileSync(process.env.SNAPSHOT_TEST_COUNT, String(count)))
`)
  const verified = JSON.parse(execFileSync(process.execPath,
    ['--require', hook, cli, 'verify', '--paper-dir', paper, '--references', output],
    { encoding: 'utf8', env: { ...process.env, SNAPSHOT_TEST_PATH: output, SNAPSHOT_TEST_COUNT: counts } }))
  assert.equal(verified.sourceReferencesDigest, sha256(bytes))
  assert.equal(readFileSync(counts, 'utf8'), '1')
  assert.throws(() => run(['finalize', '--paper-dir', paper, '--input', authorInput, '--output', output]))
  assert.deepEqual(readFileSync(output), bytes)
  assert(existsSync(output))
  for (const [index, mutate] of [
    x => { delete x.wholeDocumentWritingAbsence },
    x => { x.wholeDocumentWritingAbsence.review.reviewerSessionId = 'fixture-author' },
    x => { x.wholeDocumentWritingAbsence.review.reviewedSubjectDigest = sha256('changed') },
    x => { x.wholeDocumentWritingAbsence.review.pages.pop() },
    x => { x.wholeDocumentWritingAbsence.review.pages[0].rasterSha256 = sha256('wrong') },
    x => { x.groups[0].essays.evidence.pop() },
    x => { x.groups[0].essays.evidence[0].documentSha256 = sha256('wrong') },
    x => { x.groups[0].essays.evidence[0].locator.page = 99 },
    x => { x.groups[0].essays.evidence[0].locator.documentId = 'paper' },
    x => { x.groups[0].essays.evidence[0].locator.region.width = .5 },
  ].entries()) {
    const invalid = structuredClone(proposal.proposal)
    mutate(invalid)
    const source = path.join(dir, `invalid-${index}.json`), target = path.join(dir, `invalid-final-${index}.json`)
    writeFileSync(source, JSON.stringify(invalid), { flag: 'wx' })
    assert.throws(() => run(['finalize', '--paper-dir', paper, '--input', source, '--output', target]))
    assert.equal(existsSync(target), false)
    assert.throws(() => run(['verify', '--paper-dir', paper, '--references', source]))
  }
  for (const [index, text] of ['范文一：支持立场', '范文二：反对立场', '2. 评分参考', '4. 评分细则'].entries()) {
    const changed = structuredClone(input)
    changed.confirmation.documents.find(d => d.documentId === 'answers').pages[3].orderedItems[0].text = text
    changed.evidence.documents.find(d => d.documentId === 'answers').pages[3].observations[0].text = text
    reseal(changed)
    put('materialization/nck1-ocr-source-evidence-v1.json', changed.sourceInput.ocrSourceBytes.evidenceBytes)
    put('materialization/nck1-ocr-source-confirmation-v1.json', changed.sourceInput.ocrSourceBytes.confirmationBytes)
    const sidecar = structuredClone(proposal.proposal)
    const loaded = loadNck1ReviewSource(paper)
    const imported = importNck1ReviewCandidate(paper, loaded)
    assert.equal(imported.issues.length, 0)
    sidecar.sourceDigest = imported.candidate.source.sha256
    sidecar.candidateDigest = imported.candidate.candidateDigest
    sidecar.wholeDocumentWritingAbsence.evidenceSha256 = sha256(changed.sourceInput.ocrSourceBytes.evidenceBytes)
    sidecar.wholeDocumentWritingAbsence.confirmationSha256 = sha256(changed.sourceInput.ocrSourceBytes.confirmationBytes)
    const source = path.join(dir, `contradiction-${index}.json`)
    writeFileSync(source, JSON.stringify(sidecar), { flag: 'wx' })
    for (const args of [
      ['prepare', '--paper-dir', paper, '--whole-document-writing-absence', '--author-session-id', 'fixture-author', '--output', path.join(dir, `contradiction-request-${index}.json`)],
      ['finalize', '--paper-dir', paper, '--input', source, '--output', path.join(dir, `contradiction-final-${index}.json`)],
      ['verify', '--paper-dir', paper, '--references', source],
    ]) {
      assert.throws(() => run(args), error => /writing contradiction/.test(String(error.stderr)), `${text}: ${args[0]}`)
    }
  }
})
