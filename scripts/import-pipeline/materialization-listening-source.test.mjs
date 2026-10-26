import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { makeSyntheticNck1OcrFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { produceNck1OcrMaterialization } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { resolveConfirmedNck1OcrEvidence } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { resolveListeningSourceDecision } from '../../server/paper-import/listeningSourceDecision.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { nck1ParagraphJoinAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { planMaterializationListeningSource, applyMaterializationListeningSourcePlan } from './materialization-listening-source.mjs'
import { authorListeningSource } from './listening-source.mjs'
import { materializeNck1CanonicalRequest, admitLiveConfirmedNck1MaterializationImport,
  isLiveConfirmedNck1MaterializationAdmission } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { buildNck1ReviewConsumption } from '../../server/import-review/revisionProjection.mjs'

const encode = value => Buffer.from(JSON.stringify(value))
test('bounded author decisions replay through public OCR import/compile and reject dropped or misaddressed source', async t => {
  const f = await makeSyntheticNck1OcrFixture({ listening: true })
  const confirmation = { ...f.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v3' }
  const produced = produceNck1OcrMaterialization({ paperId: f.paperId, documents: f.sourceDocuments, evidence: f.evidence, confirmation })
  const retained = structuredClone(produced)
  assert(produced.materialization.issues.some(issue => /LISTENING/u.test(issue.code)))
  const items = confirmation.documents[1].pages.flatMap(page => page.orderedItems)
  const find = text => {
    const matches = items.filter(item => item.text.includes(text))
    assert.equal(matches.length, 1, text)
    return matches[0]
  }
  const fragment = item => ({ itemId: item.itemId })
  const heading = find('高三听力录音原文'), example = find('例如'), exampleSpeech = find('example only')
  const mixed = find('Keep every word'), end = find('应用文评分标准')
  const cut = mixed.text.indexOf('第一节')
  const input = { kind: 'nck1-source-materialization', materializationBytes: encode(produced.materialization),
    documents: f.sourceDocuments.map(d => ({ documentId: d.documentId, bytes: d.bytes })), media: [],
    ocrSourceBytes: { evidenceBytes: encode(f.evidence), confirmationBytes: encode(confirmation) } }
  const receipt = { paperId: f.paperId, revisionId: 'ocr-revision', confirmationId: 'ocr-confirmation',
    reviewerKind: 'import_agent', sourceSetDigest: confirmation.sourceSetDigest, evidenceDigest: confirmation.evidenceDigest, confirmation }
  const receiptBytes = encode(receipt)
  const options = { documentId: heading.itemId.split(':')[0], headingItemId: heading.itemId,
    startItemId: items[items.indexOf(heading) + 1].itemId, endItemId: end.itemId,
    reason: 'Reviewed original synthetic pages; example before Text 1, full speech, exact appendix start.',
    roles: [
      { role: 'example', fragments: [fragment(example), fragment(exampleSpeech)] },
      { role: 'speech', fragments: [{ itemId: mixed.itemId, start: 0, end: cut }] },
      { role: 'cue', nextTextNumber: 6, fragments: [{ itemId: mixed.itemId, start: cut, end: mixed.text.length }] },
    ] }
  const plan = planMaterializationListeningSource(input, receiptBytes, options)
  const splitSpeech = structuredClone(options)
  splitSpeech.roles[1].fragments = [
    { itemId: mixed.itemId, start: 0, end: 10 },
    { itemId: mixed.itemId, start: 10, end: cut },
  ]
  assert.equal(planMaterializationListeningSource(input, receiptBytes, splitSpeech).transcriptAfter[4].text,
    mixed.text.slice(0, cut), 'adjacent speech slices must not invent a newline or trim source whitespace')
  const applied = applyMaterializationListeningSourcePlan(input, receiptBytes, plan, { confirmed: true })
  assert.deepEqual(produced, retained, 'producer output and source generation must not be mutated')
  assert.deepEqual(applied.materialization.groups, produced.materialization.groups)
  assert.deepEqual(applied.materialization.answers, produced.materialization.answers)
  assert.deepEqual(validateNck1SourceMaterialization(applied.materialization), [])
  assert.deepEqual(applied.publicReplay.issues, [])
  assert(applied.publicReplay.compiled, JSON.stringify(applied.publicReplay))
  assert.equal(applied.materialization.listening.transcript[4].text, mixed.text.slice(0, cut))
  assert(!applied.materialization.listening.transcript.some(s => /example only|Scoring|评分|第二节到此结束/u.test(s.text)))
  const importedInput = { ...input, materializationBytes: applied.materializationBytes }
  const imported = importCanonicalCandidate(importedInput)
  assert.deepEqual(imported.issues, [])
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation)
  const consumption = buildNck1ReviewConsumption(imported.candidate, preview.compilation)
  assert.equal(consumption.authorityRef.manifestVersion, '75')
  const request = materializeNck1CanonicalRequest(importedInput, { schemaVersion: 'teacher-confirmation-v1', confirmed: true,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest })
  const admitted = admitLiveConfirmedNck1MaterializationImport(request.request)
  assert.equal(admitted.compilation.disposition, 'ready')
  assert(isLiveConfirmedNck1MaterializationAdmission(admitted))
  assert(importCanonicalCandidate(importedInput, undefined, { materializationAuthorityRef: nck1ParagraphJoinAuthorityRef }).issues.length)
  const replayContext = { decision: plan.decision, documents: f.sourceDocuments, evidence: f.evidence, confirmation,
    confirmationBytes: input.ocrSourceBytes.confirmationBytes,
    resolved: resolveConfirmedNck1OcrEvidence({ paperId: f.paperId, documents: f.sourceDocuments, evidence: f.evidence, confirmation }) }
  for (const change of [
    d => { d.roles[1].fragments[0].end-- ; d.roles[1].fragments[0].text = d.roles[1].fragments[0].text.slice(0, -1) },
    d => { d.roles[2].fragments[0].start-- ; d.roles[2].fragments[0].text = mixed.text.slice(cut - 1) },
    d => { d.roles[0].fragments.reverse() },
    d => { d.roles[0].fragments.push({ ...d.roles[1].fragments[0] }) },
    d => { d.roles[2].nextTextNumber = 7 },
    d => { d.roles[1].role = 'cue'; d.roles[1].nextTextNumber = 6 },
    d => { d.heading.itemId = 'foreign:item' },
    d => { d.end = { itemId: find('Synthetic speech 10.').itemId, text: find('Synthetic speech 10.').text } },
    d => { d.confirmationSha256 = sha256('stale') },
  ]) {
    const d = structuredClone(plan.decision); change(d)
    assert.throws(() => resolveListeningSourceDecision({ ...replayContext, decision: d }))
  }
  // Explicit UTF-16 surrogate refusal at the source-address seam, independent
  // of the platform PDF font's emoji extraction.
  const surrogate = structuredClone(replayContext)
  const chosen = surrogate.confirmation.documents[1].pages.flatMap(page => page.orderedItems).find(i => i.itemId === mixed.itemId)
  const sourceItem = surrogate.resolved.structures.get(options.documentId).body.find(i => i.text === chosen.text)
  chosen.text = 'M: 😀' + chosen.text
  sourceItem.text = chosen.text
  const d = surrogate.decision
  d.confirmationSha256 = sha256(encode(surrogate.confirmation))
  surrogate.confirmationBytes = encode(surrogate.confirmation)
  d.roles[1].fragments[0] = { itemId: mixed.itemId, start: 0, end: 4, text: chosen.text.slice(0, 4) }
  d.roles[2].fragments[0] = { itemId: mixed.itemId, start: 4, end: chosen.text.length, text: chosen.text.slice(4) }
  assert.throws(() => resolveListeningSourceDecision(surrogate), /surrogate/u)
  for (const mutate of [
    m => { m.listening.transcript[0].text += ' forged' },
    m => { m.listeningSourceDecision.roles[2].nextTextNumber = 7 },
    m => { m.schemaVersion = 'nck1-source-materialization-v8' },
  ]) {
    const m = structuredClone(applied.materialization); mutate(m)
    assert(importCanonicalCandidate({ ...input, materializationBytes: encode(m) }).issues.length)
  }
  for (const mutate of [
    i => { i.materializationBytes = encode({ ...produced.materialization, paperId: 'paper-foreign' }) },
    i => { i.documents[0].bytes = encode('stale source') },
    i => { i.ocrSourceBytes.evidenceBytes = encode({ ...f.evidence, changed: true }) },
    i => { i.ocrSourceBytes.confirmationBytes = encode({ ...confirmation, changed: true }) },
  ]) {
    const changed = structuredClone(input); mutate(changed)
    assert.throws(() => applyMaterializationListeningSourcePlan(changed, receiptBytes, plan, { confirmed: true }))
  }
  assert.throws(() => applyMaterializationListeningSourcePlan(input, receiptBytes, plan), /agent-confirmed/u)
  assert.throws(() => applyMaterializationListeningSourcePlan(input,
    encode({ ...receipt, revisionId: 'another-revision' }), plan, { confirmed: true }), /stale/u)
  const wrongQuestions = structuredClone(options)
  wrongQuestions.roles[2].questionNumbers = [18, 19, 20]
  assert.throws(() => planMaterializationListeningSource(input, receiptBytes, wrongQuestions), /boundary/u)
  const tampered = structuredClone(plan); tampered.transcriptAfter[0].text += ' forged'
  const { planDigest: _, ...tamperedBody } = tampered; tampered.planDigest = digestJson(tamperedBody)
  assert.throws(() => applyMaterializationListeningSourcePlan(input, receiptBytes, tampered, { confirmed: true }), /differs/u)

  const root = path.resolve(import.meta.dirname, '../..'), dir = path.join(root, '.scratch', `listening-cli-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const paper = path.join(dir, 'source'), output = path.join(dir, 'output')
  mkdirSync(paper, { recursive: true })
  const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, encode(value)) }
  json(path.join(paper, 'universal-source-manifest.json'), { ...f.manifest,
    documents: f.sourceDocuments.map(d => ({ ...d, bytes: undefined, path: `source/${d.documentId}.pdf` })) })
  for (const doc of f.sourceDocuments) {
    mkdirSync(path.join(paper, 'source'), { recursive: true })
    writeFileSync(path.join(paper, `source/${doc.documentId}.pdf`), doc.bytes)
  }
  writeFileSync(path.join(paper, 'materialization.json'), input.materializationBytes)
  json(path.join(paper, 'materialization/nck1-source-materialization-v1.json'), produced.materialization)
  json(path.join(paper, 'materialization/nck1-ocr-source-evidence-v1.json'), f.evidence)
  json(path.join(paper, 'materialization/nck1-ocr-source-confirmation-v1.json'), confirmation)
  json(path.join(paper, 'signals/agent-proofreading-receipt.json'), receipt)
  const before = readFileSync(path.join(paper, 'materialization/nck1-source-materialization-v1.json'))
  await assert.rejects(authorListeningSource({ command: 'apply', paperId: f.paperId, paperDir: paper,
    plan, output: path.join(paper, 'forbidden.json'), confirmed: true }), /outside/u)
  const response = await authorListeningSource({ command: 'apply', paperId: f.paperId, paperDir: paper, plan,
    output, confirmed: true })
  assert.equal(response.installed, false)
  assert(readFileSync(output).equals(applied.materializationBytes))
  assert(readFileSync(path.join(paper, 'materialization/nck1-source-materialization-v1.json')).equals(before))
  await assert.rejects(authorListeningSource({ command: 'apply', paperId: f.paperId, paperDir: paper, plan,
    output, confirmed: true }), /new/u)
  assert(existsSync(output))
})
