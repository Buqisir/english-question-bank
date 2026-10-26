import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { makeFixture } from '../verify-nck1-source-materialization.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { excludeExplanationFigure } from './source-reference-exclusion.mjs'
import { invalidateExplanationFigureDownstream } from './fast-import.mjs'
import { confirmSourceReferenceFigureExclusion } from '../../server/paper-import/sourceReferenceFigureExclusions.mjs'
import { prepareSourceReferenceWritingItems } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
import { sourceReferenceFigureIdentity } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { buildAnswerOnlyHtml } from '../../server/answer-renderer.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)) }
function fixture(paperId) {
  const input = scoringFiguresFixture(paperId ? { materialization: { ...makeFixture({ listening: false }), paperId } } : {})
  // A chart in the source index, outside every essay/scoring scope. The
  // wording deliberately carries no exclusion authority.
  const page = input.confirmation.documents[1].pages[0], proof = input.evidence.documents[1].pages[0]
  const first = page.orderedItems[0], observation = proof.observations[0]
  page.orderedItems.push({ ...first, itemId: 'answers:explanation-text', text: 'A source diagram',
    observationIds: ['answers:explanation-word'] })
  proof.observations.push({ ...observation, observationId: 'answers:explanation-word', regionId: 'answers:explanation-text-region',
    text: 'A source diagram', region: { x: .1, y: .33, width: .7, height: .02 } })
  proof.regions.push({ regionId: 'answers:explanation-text-region', kind: 'text', region: proof.observations[1].region },
    { regionId: 'answers:explanation-figure', kind: 'visual', region: { x: .08, y: .32, width: .75, height: .09 } })
  proof.readingOrderEdges.push({ before: observation.observationId, after: 'answers:explanation-word' })
  page.visualClassifications.push({ regionId: 'answers:explanation-figure', classification: 'content_media',
    itemIds: ['answers:explanation-text'], afterItemId: first.itemId })
  const { evidenceDigest: _, ...body } = input.evidence
  input.evidence.evidenceDigest = digestJson(body)
  input.confirmation.evidenceDigest = input.evidence.evidenceDigest
  input.sourceInput.ocrSourceBytes = { evidenceBytes: Buffer.from(JSON.stringify(input.evidence)),
    confirmationBytes: Buffer.from(JSON.stringify(input.confirmation)) }
  return input
}
function declaration(input) {
  const figures = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation).referenceFigures
  const figure = figures.find(figure => figure.sourceRegionId === 'answers:explanation-figure')
  return confirmSourceReferenceFigureExclusion(input.materialization, input.evidence, input.confirmation, figures, {
    figureId: figure.sourceRegionId, figureIdentitySha256: sourceReferenceFigureIdentity(figure),
    anchorItemId: figure.afterItem.itemId, reason: 'Original page reviewed: diagram explains the source, outside model answers and rubrics.',
    confirmed: true,
  })
}
function capture(input, exclusions) {
  const result = buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { sourceDocuments: input.sourceDocuments, figureExclusions: exclusions })
  return { schemaVersion: result.schemaVersion, paperId: input.materialization.paperId,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    materializationDigest: digestJson(input.materialization), groups: result.groups, figureExclusions: result.figureExclusions }
}

test('explicit explanation figure exclusion closes producer/admission and preserves all essay/scoring content and source evidence', () => {
  const input = fixture()
  const before = JSON.stringify({ evidence: input.evidence, confirmation: input.confirmation })
  assert.throws(() => capture(input, []), /no surviving essay anchor/u)
  const excluded = declaration(input)
  const sidecar = capture(input, [excluded])
  assert.equal(sidecar.schemaVersion, 'source-references-v5')
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.equal(JSON.stringify({ evidence: input.evidence, confirmation: input.confirmation }), before)
  const expected = captureScoringReferences(scoringFiguresFixture())
  // Figure IDs retain their original inventory positions, including the
  // excluded source figure; only content/ownership are compared here.
  for (const group of expected.groups) for (const entry of group.scoring.entries) {
    for (const block of entry.blocks) if (block.kind === 'figure') {
      block.figureId = block.figureId.replace(/\d+$/u, number => Number(number) + 1)
    }
  }
  assert.deepEqual(sidecar.groups, expected.groups)
  assert.equal(buildAnswerOnlyHtml({ ...input, sourceReferences: sidecar, includeScoring: true }),
    buildAnswerOnlyHtml({ ...input, sourceReferences: expected, includeScoring: true }))
  const absent = structuredClone(sidecar)
  absent.figureExclusions = []
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: absent }), /schema|fewer|items/u)
  absent.schemaVersion = 'source-references-v4'
  delete absent.figureExclusions
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: absent }), /one-to-one/u)
})

test('explanation declarations reject missing confirmation, duplicate/foreign identities, source drift and scoring/essay laundering', () => {
  const input = fixture(), original = declaration(input)
  for (const edit of [
    d => { d.confirmed = false }, d => { delete d.confirmed }, d => { d.reason = ' ' },
    d => { d.figureId += '-other' }, d => { d.figureIdentitySha256 = sha256('other crop') },
    d => { d.anchorItemId += '-other' }, d => { d.sourceDocumentSha256 = sha256('other PDF') },
    d => { d.confirmationDigest = sha256('new confirmation') }, d => { d.evidenceDigest = sha256('new evidence') },
    d => { d.unknown = true },
  ]) {
    const changed = structuredClone(original); edit(changed)
    assert.throws(() => capture(input, [changed]), /Invalid explanation figure exclusion/u)
  }
  assert.throws(() => capture(input, [original, original]), /duplicate/u)
  const figures = prepareSourceReferenceWritingItems(input.materialization, input.evidence, input.confirmation).referenceFigures
  const scoring = figures.find(f => f.source.page === 3)
  assert.throws(() => confirmSourceReferenceFigureExclusion(input.materialization, input.evidence, input.confirmation, figures, {
    figureId: scoring.sourceRegionId, figureIdentitySha256: sourceReferenceFigureIdentity(scoring),
    anchorItemId: scoring.afterItem.itemId, reason: 'misclassified rubric', confirmed: true,
  }), /surviving essay or explicit scoring/u)
  const essayAnchor = input.confirmation.documents[1].pages[2].orderedItems.find(item => item.text === 'Our original sample is short.')
  const essayFigure = { ...scoring, afterItem: { ...scoring.afterItem, itemId: essayAnchor.itemId } }
  assert.throws(() => confirmSourceReferenceFigureExclusion(input.materialization, input.evidence, input.confirmation, [essayFigure], {
    figureId: essayFigure.sourceRegionId, figureIdentitySha256: sourceReferenceFigureIdentity(essayFigure),
    anchorItemId: essayAnchor.itemId, reason: 'misclassified essay', confirmed: true,
  }), /surviving essay or explicit scoring/u)
  const sidecar = capture(input, [original])
  sidecar.figureExclusions[0].anchorItemId += '-drift'
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar }), /binding changed/u)
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: capture(input, [original]),
    sourceInput: { documents: input.sourceDocuments } }), /sealed OCR/u)
})

test('explanation redo retains upstream authoring but archives references and products; Candidate and UNKNOWN reject before writes', async t => {
  const paperId = `paper-synthetic-explanation-redo-${process.pid}`
  const paper = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const work = path.join(root, 'imports/ocr-proofread', paperId), fast = path.join(work, 'fast')
  assert(!existsSync(paper) && !existsSync(work))
  t.after(() => { rmSync(paper, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) })
  const materialization = path.join(paper, 'materialization/nck1-source-materialization-v1.json')
  json(materialization, { source: 'retained' })
  const digest = sha256(readFileSync(materialization))
  const names = ['compile', 'ocr-review', 'materialize', 'spelling', 'summaries', 'search-metadata',
    'listening-review', 'ocr-correction-report', 'source-references', 'pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']
  const state = { paperId, steps: Object.fromEntries(names.map(name => [name, { finishedAt: '2026-01-01', result: { old: name } }])),
    data: {}, background: {} }
  const stateFile = path.join(fast, 'state.json')
  const snapshot = dir => Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? Object.entries(snapshot(path.join(dir, e.name))).map(([key, value]) => [`${e.name}/${key}`, value])
    : [[e.name, sha256(readFileSync(path.join(dir, e.name)))]]))
  const downstream = [path.join(paper, 'source-references-v1.json'), path.join(paper, 'products/answerOnly.pdf'),
    path.join(paper, 'pagination-plan.json'), path.join(work, 'source-references-draft.json'),
    ...['source-references-input.json', 'source-references-request.json', 'pagination/answerOnly/output.json'].map(f => path.join(fast, f))]
  downstream.forEach(file => json(file, { old: file }))
  const upstream = [materialization, path.join(paper, 'spelling-review-v1.json'),
    path.join(paper, 'agent-ocr-correction-report-v2.json'), path.join(paper, 'signals/agent-proofreading-receipt.json'),
    path.join(paper, 'materialization/nck1-ocr-source-confirmation-v1.json'),
    ...['summaries-parts/part-1.json', 'search-metadata-authored.json', 'round2.json'].map(f => path.join(fast, f))]
  upstream.slice(1).forEach(file => json(file, { keep: file }))
  for (const guarded of [
    { ...state, steps: { ...state.steps, push: { startedAt: 'unknown upload' } } },
    { ...state, data: { candidateRevisionId: 'existing Candidate' } },
  ]) {
    json(stateFile, guarded)
    const before = { paper: snapshot(paper), work: snapshot(work) }
    await assert.rejects(invalidateExplanationFigureDownstream(paperId, digest), /RECONCILIATION_REQUIRED/u)
    assert.deepEqual({ paper: snapshot(paper), work: snapshot(work) }, before)
  }
  json(stateFile, state)
  const operation = path.join(fast, 'ocr-generation-operation.json')
  json(operation, { startedAt: 'UNKNOWN' })
  const before = { paper: snapshot(paper), work: snapshot(work) }
  await assert.rejects(invalidateExplanationFigureDownstream(paperId, digest), /RECONCILIATION_REQUIRED/u)
  assert.deepEqual({ paper: snapshot(paper), work: snapshot(work) }, before)
  rmSync(operation)
  const retained = upstream.map(file => [file, readFileSync(file)])
  await assert.rejects(invalidateExplanationFigureDownstream(paperId, 'stale'), /changed/u)
  await invalidateExplanationFigureDownstream(paperId, digest)
  for (const [file, bytes] of retained) assert.deepEqual(readFileSync(file), bytes)
  for (const file of downstream) assert(!existsSync(file), file)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(stateFile)).steps), names.slice(0, 8))
  const archived = Object.values(snapshot(path.join(work, 'superseded')))
  for (const file of downstream) assert(archived.includes(sha256(JSON.stringify({ old: file }))), file)
})

test('explicit author command requires confirmation, preserves external source bytes and writes only a validated new preview', async t => {
  const directory = path.join(root, '.scratch', `explanation-cli-${process.pid}`)
  assert(!existsSync(directory))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = fixture(), paperDir = path.join(directory, 'paper')
  const materialization = input.materialization, paperId = materialization.paperId
  const documents = input.sourceDocuments.map((document, i) => {
    const file = `sources/${i}.pdf`; mkdirSync(path.join(paperDir, 'sources'), { recursive: true })
    writeFileSync(path.join(paperDir, file), document.bytes)
    const { bytes: _, ...entry } = document
    return { ...entry, path: file }
  })
  json(path.join(paperDir, 'universal-source-manifest.json'), { documents })
  for (const [file, value] of [['nck1-source-materialization-v1.json', materialization],
    ['nck1-ocr-source-evidence-v1.json', input.evidence], ['nck1-ocr-source-confirmation-v1.json', input.confirmation]]) {
    json(path.join(paperDir, 'materialization', file), value)
  }
  const d = declaration(input), output = path.join(directory, 'preview.json')
  const args = { paperDir, output, figureId: d.figureId, figureIdentitySha256: d.figureIdentitySha256,
    anchorItemId: d.anchorItemId, reason: d.reason }
  await assert.rejects(excludeExplanationFigure(paperId, args), /agent-confirmed/u)
  assert(!existsSync(output))
  await assert.rejects(excludeExplanationFigure(paperId, { ...args, output: undefined, confirmed: true }), /External/u)
  assert.equal((await excludeExplanationFigure(paperId, { ...args, confirmed: true })).mode, 'preview')
  const draft = JSON.parse(readFileSync(output))
  assert.equal(draft.sourceDigest, null)
  assert.deepEqual(draft.figureExclusions, [d])
  await assert.rejects(excludeExplanationFigure(paperId, { ...args, confirmed: true }), /new preview/u)
  assert.deepEqual(JSON.parse(readFileSync(path.join(paperDir, 'materialization/nck1-source-materialization-v1.json'))), materialization)
})

test('author CLI application survives the next production references command without reusing old draft content', async t => {
  const paperId = `paper-synthetic-explanation-install-${process.pid}`
  const paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const work = path.join(root, 'imports/ocr-proofread', paperId)
  assert(!existsSync(paperDir) && !existsSync(work))
  t.after(() => { rmSync(paperDir, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) })
  const input = fixture(paperId), d = declaration(input)
  const documents = input.sourceDocuments.map((document, i) => {
    const file = `sources/${i}.pdf`
    mkdirSync(path.join(paperDir, 'sources'), { recursive: true })
    writeFileSync(path.join(paperDir, file), document.bytes)
    const { bytes: _, ...entry } = document
    return { ...entry, path: file }
  })
  json(path.join(paperDir, 'universal-source-manifest.json'), { documents })
  for (const [file, value] of [['nck1-source-materialization-v1.json', input.materialization],
    ['nck1-ocr-source-evidence-v1.json', input.evidence], ['nck1-ocr-source-confirmation-v1.json', input.confirmation]]) {
    json(path.join(paperDir, 'materialization', file), value)
  }
  json(path.join(work, 'source-references-draft.json'), { paperId, groups: ['OLD_REFERENCE_CONTENT'] })
  const cli = path.join(root, 'scripts/import-pipeline/ocr-proofread.mjs')
  execFileSync(process.execPath, [cli, 'exclude-explanation-figure', paperId, '--figure', d.figureId,
    '--figure-sha256', d.figureIdentitySha256, '--anchor', d.anchorItemId, '--reason', d.reason, '--agent-confirmed'],
  { cwd: root, stdio: 'pipe' })
  const draftFile = path.join(work, 'source-references-draft.json')
  const installed = readFileSync(draftFile)
  execFileSync(process.execPath, [cli, 'references', paperId], { cwd: root, stdio: 'pipe' })
  assert.deepEqual(readFileSync(draftFile), installed)
  assert(!installed.includes('OLD_REFERENCE_CONTENT'))
  const result = JSON.parse(installed)
  assert.deepEqual(result.figureExclusions, [d])
  assertSourceReferenceAdmission({ ...input, sidecar: { ...result, sourceDigest: input.sourceDigest,
    candidateDigest: input.candidateDigest, materializationDigest: digestJson(input.materialization) } })
})
