import '../../scripts/lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore, ocrReviewBundleDigest, validateOcrReviewBundleManifest } from '../../server/import-review/importReviewStore.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { checkOcrGenerationPlan, planOcrGeneration } from './lib-ocr-generation.mjs'
import { runOcrReview, startOcrGeneration } from './fast-import.mjs'
import { buildNck1OcrReviewProjection } from '../../server/import-review/revisionProjection.mjs'
import { nck1OcrEvidenceDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'

const identity = value => sha256(value)
const paperId = 'paper-synthetic-ocr-generation'
function manifest(evidence, base) {
  const bytes = JSON.stringify({ paperId, sourceSetDigest: identity('sources'),
    evidenceDigest: identity(evidence), reviewStructureDigest: identity(evidence + '-structure') })
  const input = { schemaVersion: 'web-import-ocr-review-bundle-v1', paperId, paperName: 'Synthetic generation',
    ...(base === undefined ? {} : { expectedBaseRevisionId: base }),
    ...JSON.parse(bytes), producerBuildId: 'synthetic', files: [{
      path: 'source/projection.json', sha256: sha256(bytes), byteLength: Buffer.byteLength(bytes),
      mediaType: 'application/json', role: 'source',
    }] }
  return { input: { ...input, bundleDigest: ocrReviewBundleDigest(input) }, bytes }
}

test('OCR base is optional, digest-bound and strictly validated; absent base keeps historical digest bytes', () => {
  const { input } = manifest('old')
  const historical = digestJson(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'bundleDigest')))
  assert.equal(input.bundleDigest, historical)
  assert.equal(Object.hasOwn(validateOcrReviewBundleManifest(input), 'expectedBaseRevisionId'), false)
  const next = manifest('new', 'rev-base').input
  assert.equal(validateOcrReviewBundleManifest(next).expectedBaseRevisionId, 'rev-base')
  assert.notEqual(next.bundleDigest, manifest('new').input.bundleDigest)
  assert.throws(() => validateOcrReviewBundleManifest({ ...next, expectedBaseRevisionId: 'rev-drift' }),
    { code: 'IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH' })
  for (const value of ['', null, 23]) {
    const invalid = manifest('new', value).input
    assert.throws(() => validateOcrReviewBundleManifest(invalid), { code: 'IMPORT_REVIEW_INPUT_INVALID' })
  }
})

async function fixture(run) {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(path.join(scratch, 'ocr-generation-'))
  const dbPath = path.join(root, 'review.sqlite')
  const store = createImportReviewStore({ dbPath, filesRoot: path.join(root, 'files'), rendererBuildId: 'synthetic',
    projectRevision: directory => JSON.parse(readFileSync(path.join(directory, 'source/projection.json'), 'utf8')) })
  const upload = (created, bundle) => {
    const file = bundle.input.files[0]
    const target = store.fileForUpload(created.revision.id, file.path)
    mkdirSync(path.dirname(target.destination), { recursive: true })
    writeFileSync(target.destination, bundle.bytes)
    store.completeFileUpload(created.revision.id, file.path, file)
  }
  const sql = fn => { const db = new DatabaseSync(dbPath); try { return fn(db) } finally { db.close() } }
  try {
    const old = manifest('old'), created = store.createRevision(old.input)
    upload(created, old)
    store.finalizeRevision(created.revision.id)
    // This fixture isolates revision/CAS transactions; the actual confirmation
    // route and immutable historical receipt are covered by the OCR verifier.
    sql(db => db.prepare("UPDATE import_review_revisions SET state = 'approved' WHERE id = ?").run(created.revision.id))
    await run({ store, upload, sql, base: created.revision.id })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('explicit OCR successor registers/finalizes once and duplicate exact requests reuse its revision', () => fixture(({ store, upload, base }) => {
  const next = manifest('new', base)
  const created = store.createRevision(next.input)
  assert.equal(store.createRevision(next.input).revision.id, created.revision.id)
  upload(created, next)
  assert.equal(store.finalizeRevision(created.revision.id).state, 'awaiting_review')
  assert.equal(store.getRevision(base).state, 'superseded')
  assert.equal(store.createRevision(next.input).revision.id, created.revision.id)
  assert.equal(store.finalizeRevision(created.revision.id).state, 'awaiting_review')
}))

test('OCR base registration rejects drift, unchanged evidence, changed sources and a Candidate in any state', () => fixture(({ store, sql, base }) => {
  assert.throws(() => store.createRevision(manifest('new', 'rev-drift').input), { code: 'IMPORT_REVIEW_BASE_REVISION_STALE' })
  assert.throws(() => store.createRevision(manifest('old', base).input), { code: 'IMPORT_REVIEW_OCR_GENERATION_INVALID' })
  const changed = { ...manifest('new', base).input, sourceSetDigest: identity('different sources') }
  changed.bundleDigest = ocrReviewBundleDigest(changed)
  assert.throws(() => store.createRevision(changed), { code: 'IMPORT_REVIEW_OCR_GENERATION_INVALID' })
  for (const state of ['uploading', 'awaiting_review', 'approved', 'superseded']) {
    sql(db => db.prepare('UPDATE import_review_revisions SET manifest_json = ?, state = ? WHERE id = ?')
      .run(JSON.stringify({ ...manifest('old').input, schemaVersion: 'web-import-review-bundle-v1' }), state, base))
    assert.throws(() => store.createRevision(manifest('new', base).input), { code: 'IMPORT_REVIEW_OCR_GENERATION_INVALID' })
    assert.equal(store.getRevision(base).state, state)
  }
}))

test('OCR finalize CAS refuses a concurrently changed latest; it preserves both generations', () => fixture(({ store, upload, sql, base }) => {
  const next = manifest('new', base), created = store.createRevision(next.input)
  upload(created, next)
  sql(db => db.prepare('UPDATE import_review_papers SET latest_revision_id = ? WHERE paper_id = ?').run('rev-raced', paperId))
  assert.throws(() => store.finalizeRevision(created.revision.id), { code: 'IMPORT_REVIEW_BASE_REVISION_STALE' })
  assert.equal(store.getRevision(base).state, 'approved')
  assert.equal(store.getRevision(created.revision.id).state, 'uploading')
}))

test('OCR finalize refuses a Candidate registered after its initial base check', () => fixture(({ store, upload, sql, base }) => {
  const next = manifest('new', base), created = store.createRevision(next.input)
  upload(created, next)
  const competitor = store.createRevision(manifest('competitor').input)
  sql(db => db.prepare('UPDATE import_review_revisions SET manifest_json = ? WHERE id = ?')
    .run(JSON.stringify({ schemaVersion: 'web-import-review-bundle-v1' }), competitor.revision.id))
  assert.throws(() => store.finalizeRevision(created.revision.id), { code: 'IMPORT_REVIEW_OCR_GENERATION_INVALID' })
  assert.equal(store.getRevision(base).state, 'approved')
  assert.equal(store.getRevision(competitor.revision.id).state, 'uploading')
}))

function planningFixture() {
  const baseManifest = manifest('old').input
  const base = { id: 'rev-base', paperId, reviewKind: 'ocr', state: 'approved', finalizedAt: '2026-10-26',
    bundleDigest: baseManifest.bundleDigest, manifest: baseManifest }
  const confirmation = { confirmed: true, paperId, sourceSetDigest: baseManifest.sourceSetDigest, evidenceDigest: baseManifest.evidenceDigest }
  const receipt = { schemaVersion: 'web-import-ocr-review-confirmation-v1', paperId, revisionId: base.id,
    confirmationId: 'ocr-confirmation-base', bundleDigest: base.bundleDigest,
    sourceSetDigest: baseManifest.sourceSetDigest, evidenceDigest: baseManifest.evidenceDigest, confirmation }
  const status = { paperId, latest: base, latestRevisionId: base.id, revisions: [base] }
  const projection = JSON.parse(manifest('new').bytes)
  const proofreadInput = { confirmation: { ...confirmation, evidenceDigest: projection.evidenceDigest } }
  const calls = []
  const context = { paperId, origin: 'http://127.0.0.1:9999', projection, proofreadInput, reason: '新区域原图补证',
    readRemote: async url => { calls.push(url); return url.endsWith('/ocr-confirmation') ? { receipt, confirmation } : status } }
  return { context, calls, status, base, receipt, confirmation }
}

test('explicit plan binds original receipt, source bytes, new evidence, input, origin and reason with reads only', async () => {
  const { context, calls } = planningFixture()
  const plan = await planOcrGeneration(context)
  assert.equal(plan.expectedBaseRevisionId, 'rev-base')
  assert.equal(calls.length, 2)
  assert.equal(await checkOcrGenerationPlan(plan, context), plan)
  for (const changed of [
    { origin: 'https://other.invalid' },
    { proofreadInput: { ...context.proofreadInput, correctionNotes: [] } },
    { projection: { ...context.projection, reviewStructureDigest: identity('drift') } },
  ]) await assert.rejects(() => checkOcrGenerationPlan(plan, { ...context, ...changed }),
    { code: 'OCR_GENERATION_RECONCILIATION_REQUIRED' })
  await assert.rejects(() => checkOcrGenerationPlan(null, context), { code: 'OCR_GENERATION_RECONCILIATION_REQUIRED' })
})

test('planning fails closed on no evidence change, changed sources, remote drift, Candidate, UNKNOWN and invalid receipts', async () => {
  for (const mutate of [
    f => { f.context.projection.evidenceDigest = f.base.manifest.evidenceDigest },
    f => { f.context.projection.sourceSetDigest = identity('changed') },
    f => { f.status.latestRevisionId = 'rev-other' },
    f => { f.status.revisions.push({ ...f.base, id: 'rev-candidate', reviewKind: 'candidate' }) },
    f => { f.status.revisions.push({ ...f.base, id: 'rev-uploading', state: 'uploading' }) },
    f => { f.status.promotion = { state: 'published' } },
    f => { f.receipt.confirmationId = '' },
    f => { f.context.reason = '' },
  ]) {
    const f = planningFixture()
    mutate(f)
    await assert.rejects(() => planOcrGeneration(f.context), { code: 'OCR_GENERATION_RECONCILIATION_REQUIRED' })
  }
  await assert.rejects(() => planOcrGeneration({ ...planningFixture().context,
    readRemote: async () => { throw new Error('UNKNOWN response loss') } }), /UNKNOWN response loss/)
})

async function fastFixture(run) {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const directory = mkdtempSync(path.join(scratch, 'fast-ocr-generation-'))
  const f = planningFixture(), plan = await planOcrGeneration(f.context)
  const ctx = { paperId, paperDir: path.join(directory, 'paper'), work: path.join(directory, 'work'),
    fast: path.join(directory, 'work/fast'), statePath: path.join(directory, 'work/fast/state.json'),
    state: { paperId, steps: { compile: { finishedAt: 'old' }, 'ocr-review': { finishedAt: 'old' },
      materialize: { finishedAt: 'old' }, spelling: { finishedAt: 'old' } },
      background: {}, data: { listeningSegmentAttempt: { attempt: 'old-must-not-rebind' } } } }
  const retained = {
    'paper/signals/agent-proofreading-receipt.json': JSON.stringify(f.receipt),
    'paper/materialization/nck1-ocr-source-confirmation-v1.json': JSON.stringify(f.confirmation),
    'paper/materialization/nck1-ocr-source-evidence-v1.json': 'new immutable evidence',
    'paper/agent-ocr-correction-report-v2.json': 'old report',
    'paper/canonical-evidence/teacher-confirmation-v1.json': 'old candidate confirmation',
    'work/ocr-correction-entries.json': 'old entries',
    'work/fast/summaries-parts/part-1.json': 'old authored summaries',
    'work/fast/listening-segment-attempts/old/rule-result.json': 'old attempt',
    'plan.json': JSON.stringify(plan),
  }
  for (const [file, value] of Object.entries(retained)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    writeFileSync(path.join(directory, file), value)
  }
  try { await run({ ctx, planPath: path.join(directory, 'plan.json'), retained, directory }) }
  finally { rmSync(directory, { recursive: true, force: true }) }
}

test('fast explicit generation archives old installs/entries/authored parts, forgets dependent steps and confirms exact new revision', () => fastFixture(async ({ ctx, planPath, retained }) => {
  let inspections = 0
  await startOcrGeneration(ctx, planPath, async () => { inspections++ })
  assert.equal(inspections, 1)
  assert.equal(ctx.state.steps.compile.finishedAt, 'old')
  assert.equal(ctx.state.steps['ocr-review'], undefined)
  assert.equal(ctx.state.steps.materialize, undefined)
  assert.equal(ctx.state.data.listeningSegmentAttempt, undefined)
  assert.equal(readFileSync(path.join(ctx.paperDir, 'materialization/nck1-ocr-source-evidence-v1.json'), 'utf8'), 'new immutable evidence')
  const history = readdirSync(path.join(ctx.work, 'superseded'))
  for (const name of ['agent-proofreading-receipt.json', 'nck1-ocr-source-confirmation-v1.json', 'ocr-correction-entries.json']) {
    const file = history.find(file => file.endsWith(name))
    assert(file, `${name} retained`)
    const source = Object.keys(retained).find(file => file.endsWith(name))
    assert.equal(readFileSync(path.join(ctx.work, 'superseded', file), 'utf8'), retained[source])
  }
  assert.equal(existsSync(path.join(ctx.fast, 'summaries-parts')), false)
  assert.equal(readFileSync(path.join(ctx.fast, 'listening-segment-attempts/old/rule-result.json'), 'utf8'), 'old attempt')
  const calls = []
  assert.deepEqual(await runOcrReview(ctx, planPath, async (context, label, argv) => {
    calls.push({ label, argv })
    return label === 'push-ocr' ? { revisionId: 'rev-new-exact' } : {}
  }), { revisionId: 'rev-new-exact' })
  assert.deepEqual(calls.map(item => item.label), ['push-ocr', 'proofread-ocr', 'pull-ocr'])
  assert.equal(calls[0].argv.at(-1), planPath)
  assert(calls.slice(1).every(({ argv }) => argv[argv.indexOf('--revision') + 1] === 'rev-new-exact'))
  assert.equal(existsSync(path.join(ctx.fast, 'ocr-generation.lock')), false)
  assert(JSON.parse(readFileSync(path.join(ctx.fast, 'ocr-generation-operation.json'))).completedAt)
}))

test('fast generation UNKNOWN retains lock/intent; repeat never reaches another upload', () => fastFixture(async ({ ctx, planPath }) => {
  await startOcrGeneration(ctx, planPath, async () => {})
  let uploads = 0
  await assert.rejects(() => runOcrReview(ctx, planPath, async () => { uploads++; throw new Error('UNKNOWN') }), /UNKNOWN/)
  await assert.rejects(() => startOcrGeneration(ctx, planPath, async () => { throw new Error('must not reach network') }),
    /OCR_GENERATION_RECONCILIATION_REQUIRED/)
  assert.equal(uploads, 1)
  assert(existsSync(path.join(ctx.fast, 'ocr-generation.lock')))
  assert.equal(JSON.parse(readFileSync(path.join(ctx.fast, 'ocr-generation-operation.json'))).completedAt, undefined)
}))

test('fast generation refuses local submission evidence before inspecting or archiving anything', () => fastFixture(async ({ ctx, planPath }) => {
  ctx.state.steps.push = { startedAt: 'UNKNOWN' }
  await assert.rejects(() => startOcrGeneration(ctx, planPath, async () => { throw new Error('must not inspect') }),
    /SOURCE_REFERENCES_RECONCILIATION_REQUIRED/)
  assert(existsSync(path.join(ctx.paperDir, 'signals/agent-proofreading-receipt.json')))
  assert.equal(existsSync(path.join(ctx.fast, 'ocr-generation-operation.json')), false)
}))

test('ordinary fast OCR still invokes exact sealed reuse and preserves its result without upload', async () => {
  const calls = [], sealed = { reused: true, revisionId: 'rev-existing', confirmationId: 'existing' }
  const result = await runOcrReview({ paperId, fast: '/unused', work: '/unused' }, null,
    async (ctx, label) => { calls.push(label); return sealed })
  assert.equal(result, sealed)
  assert.deepEqual(calls, ['reuse-ocr'])
})

test('real OCR source projection, finalize and Agent confirmation create a successor while preserving the historical receipt', async () => {
  const previous = process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
  process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = '1'
  const { writeSyntheticSource, reviewManifest, uploadRevision } = await import('../verify-import-review-ocr-confirmation.mjs')
  if (previous === undefined) delete process.env.EQB_OCR_REVIEW_FIXTURE_ONLY
  else process.env.EQB_OCR_REVIEW_FIXTURE_ONLY = previous
  const root = mkdtempSync(path.resolve(import.meta.dirname, '../../.scratch/ocr-generation-real-'))
  const staging = path.join(root, 'staging')
  try {
    const fixture = writeSyntheticSource(staging)
    const configPath = path.join(staging, 'config.json')
    writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath)), importProfile: 'public-paper-v1' }))
    const store = createImportReviewStore({ dbPath: path.join(root, 'review.sqlite'),
      filesRoot: path.join(root, 'files'), rendererBuildId: 'synthetic-real-ocr' })
    const oldManifest = reviewManifest(staging), old = store.createRevision(oldManifest)
    uploadRevision(store, old, staging, oldManifest.files)
    const oldRevision = await store.finalizeUploadedRevision(old.revision.id)
    const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v1', paperId: oldManifest.paperId,
      sourceSetDigest: fixture.evidence.sourceSetDigest, evidenceDigest: fixture.evidence.evidenceDigest, confirmed: true,
      documents: fixture.evidence.documents.map(document => ({ documentId: document.documentId,
        pages: document.pages.map(page => ({ page: page.page,
          orderedItems: page.observations.map(observation => ({ itemId: `item:${observation.observationId}`,
            observationIds: [observation.observationId], text: observation.text })),
          furnitureObservationIds: [], visualClassifications: page.regions.filter(region => region.kind === 'visual')
            .map(region => ({ regionId: region.regionId, classification: 'furniture' })) })) })) }
    const oldReceipt = await store.confirmUploadedOcrRevision(oldManifest.paperId, oldRevision.id,
      { bundleDigest: oldManifest.bundleDigest, confirmation, correctionNotes: [] }, 'synthetic-agent', { reviewerKind: 'import_agent' })
    const historical = JSON.stringify(store.getRevision(oldRevision.id).approval)
    const evidence = structuredClone(fixture.evidence)
    evidence.documents[0].pages[0].observations[0].text += ' restored heading'
    evidence.evidenceDigest = nck1OcrEvidenceDigest(evidence)
    writeFileSync(path.join(staging, 'materialization/nck1-ocr-source-evidence-v1.json'), JSON.stringify(evidence))
    const newConfirmation = structuredClone(confirmation)
    newConfirmation.evidenceDigest = evidence.evidenceDigest
    newConfirmation.documents[0].pages[0].orderedItems[0].text = evidence.documents[0].pages[0].observations[0].text
    const proofreadInput = { confirmation: newConfirmation, correctionNotes: [] }
    const context = { paperId: oldManifest.paperId, origin: 'http://127.0.0.1:9999',
      projection: buildNck1OcrReviewProjection(staging), proofreadInput, reason: 'Supplement a source heading',
      readRemote: async url => url.endsWith('/ocr-confirmation')
        ? { receipt: oldReceipt, confirmation: oldReceipt.confirmation } : store.agentPaperStatus(oldManifest.paperId) }
    const plan = await planOcrGeneration(context)
    await checkOcrGenerationPlan(plan, context)
    const nextManifest = { ...reviewManifest(staging), expectedBaseRevisionId: plan.expectedBaseRevisionId }
    nextManifest.bundleDigest = ocrReviewBundleDigest(nextManifest)
    const next = store.createRevision(nextManifest)
    uploadRevision(store, next, staging, nextManifest.files)
    const nextRevision = await store.finalizeUploadedRevision(next.revision.id)
    const nextReceipt = await store.confirmUploadedOcrRevision(oldManifest.paperId, nextRevision.id,
      { ...proofreadInput, bundleDigest: nextManifest.bundleDigest }, 'synthetic-agent', { reviewerKind: 'import_agent' })
    assert.equal(nextReceipt.revisionId, next.revision.id)
    assert.equal(nextReceipt.evidenceDigest, evidence.evidenceDigest)
    assert.notEqual(nextReceipt.confirmationId, oldReceipt.confirmationId)
    assert.equal(store.getRevision(old.revision.id).state, 'superseded')
    assert.equal(JSON.stringify(store.getRevision(old.revision.id).approval), historical)
    assert.equal(store.createRevision(nextManifest).revision.id, next.revision.id)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
