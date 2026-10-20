#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { buildNck1ReviewProjection } from '../server/import-review/revisionProjection.mjs'
import { prepareNck1AnalyzedPackageReview } from '../server/paper-import/analyzedPackage.mjs'
import { readSourceReferencePublication } from '../server/paper-import/sourceReferencePublication.mjs'
import { validateSourceReferences } from '../server/paper-import/sourceReferences.mjs'
import { buildAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { enumerateParagraphSummaryTargets } from '../server/paper-import-ai/paragraphSummaries.mjs'
import { runRoutes } from '../server/router/index.mjs'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'
import { finalizeReviewFixture, freezeReviewFixture } from './lib/reviewPublicationFixture.mjs'
import { preflightPaper } from '../import-ops/lib/probe.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot, makeExternalAnalyzedPackage, publicMetadataFixture } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-eligibility-'))
const repository = path.resolve(import.meta.dirname, '..')
const json = (file, value) => writeFileSync(file, JSON.stringify(value))
let checks = 0
const pass = label => { checks++; console.log(`PASS ${label}`) }
const dbRun = (file, callback) => {
  const db = new DatabaseSync(file)
  try { return callback(db) } finally { db.close() }
}
let api
try {
  const release = makeReviewRelease(path.join(root, 'release'))
  const module = async name => import(pathToFileURL(path.join(release, `server/import-review/${name}.mjs`)).href)
  const { createImportReviewStore: createReleaseStore } = await module('importReviewStore')
  const { createReviewCompatibilityStore } = await module('reviewCompatibilityStore')
  let renderer = 'historical-original-renderer'
  const output = path.join(root, 'guards')
  const dbPath = path.join(output, 'review.sqlite')
  const filesRoot = path.join(output, 'files')
  const store = createReleaseStore({ dbPath, filesRoot, rendererBuildId: () => renderer })
  const native = makeReviewRoot(path.join(root, 'native'), 'paper-eligibility-native', undefined, { listening: true })
  const projection = freezeReviewFixture(native.reviewRoot)
  const fixture = finalizeReviewFixture({ directory: native.reviewRoot, output, projection, store })
  const { revision, approval } = fixture
  const opsRoot = path.join(root, 'ops')
  const opsPaper = path.join(opsRoot, 'scripts/import-pipeline/papers', revision.paperId)
  cpSync(native.reviewRoot, opsPaper, { recursive: true })
  mkdirSync(path.join(opsPaper, 'signals'), { recursive: true })
  mkdirSync(path.join(opsPaper, 'canonical-evidence'), { recursive: true })
  // Local readiness signals are fixture data. Every Review credential below
  // comes from the actual finalized store and its executing release.
  json(path.join(opsPaper, 'signals/ai-answer-check.json'), { ok: true })
  json(path.join(opsPaper, 'canonical-evidence/candidate-summary.json'), {
    paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
  })
  function assertOpsNext(action) {
    const reviewStatus = store.agentPaperStatus(revision.paperId)
    const result = preflightPaper({ repoRoot: opsRoot, paperId: revision.paperId,
      reviewStatus, reviewChecked: true, paperAssetsDir: path.join(root, 'ops-assets'),
      dbPath: path.join(root, 'ops-bank.sqlite') })
    assert.equal(result.state, 'approved', JSON.stringify(result.blockers))
    assert.deepEqual(result.review.compatibility, reviewStatus.compatibility)
    assert.equal(result.next.action, action)
    assert.equal(result.next.mutatesProduction, false)
  }
  const requestInput = secret => ({ requestId: `publication-request-${randomUUID()}`, revisionId: revision.id,
    secretHash: sha256(secret), ttlSeconds: 3600 })
  const granted = store.registerPublicationRequest(revision.paperId, requestInput('granted'), 'agent')
  store.grantPublicationRequest(granted.requestId, 'owner')
  const pending = store.registerPublicationRequest(revision.paperId, requestInput('pending'), 'agent')
  const originalApproval = JSON.stringify(store.getRevision(revision.id).approval)
  const originalRevision = JSON.stringify(store.getRevision(revision.id))
  const originalPreview = JSON.stringify(store.productPreviewForRevision(revision.id).preview)
  renderer = 'new-frontend-renderer'
  assert.equal(store.listPapers()[0].compatibility.result, 'equal')
  assert.equal(store.paperDetail(revision.paperId).rendererStale, false)
  assert.equal(store.createRevision(fixture.manifest).created, false)
  pass('different historical renderer permits equal detail/list/reuse without rewriting the revision or approval')
  assertOpsNext('accept_approval')

  const frontend = path.join(release, 'app/src/deployment.css')
  writeFileSync(frontend, 'body { color: red }')
  assert.equal(store.compatibilityForRevision(revision.id).result, 'equal')
  pass('frontend-only deployment retains current content eligibility')
  const parser = path.join(release, 'scripts/import-pipeline/lib.mjs')
  writeFileSync(parser, `${readFileSync(parser)}\n// Same output, new server target.\n`)
  const compatibility = createReviewCompatibilityStore({ dbPath, filesRoot })
  const blockedEntrances = () => {
    for (const operation of [
      () => store.approveRevision(revision.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'owner'),
      () => store.registerPublicationRequest(revision.paperId, requestInput('blocked'), 'agent'),
      () => store.grantPublicationRequest(pending.requestId, 'owner'),
      () => store.beginPromotion(revision.paperId, { ...approval, intent: 'ship' }, 'owner'),
      () => store.beginScopedPromotion(revision.paperId, granted.requestId, sha256('granted'), 'agent'),
      () => store.acquireShippingGuard(revision.paperId, approval, 'ship-agent'),
      () => store.mintExternalListeningPublicationProof(revision.paperId, approval),
      () => store.projectionForRevision(revision.id),
    ]) assert.throws(operation, { code: 'IMPORT_REVIEW_RENDERER_STALE' })
    assert.equal(dbRun(dbPath, db => db.prepare('SELECT count(*) n FROM import_review_shipping_guards').get().n), 0)
    assert.equal(dbRun(dbPath, db => db.prepare('SELECT count(*) n FROM import_review_promotions').get().n), 0)
    assert.equal(store.agentPaperStatus(revision.paperId).approval, null)
    assert.equal(JSON.stringify(store.getRevision(revision.id)), originalRevision)
    assert.equal(JSON.stringify(store.productPreviewForRevision(revision.id).preview), originalPreview)
    store.prepareProductPreview(revision.id)
  }
  assert.equal(store.compatibilityForRevision(revision.id).result, 'pending')
  blockedEntrances()
  pass('pending blocks all eight mutation/live entrances before any guard or promotion insert; original evidence stays readable')
  assertOpsNext('wait_for_content_check')
  const routes = createImportReviewRoutes({ getStore: () => store, buildPrintHtml() { throw new Error('Must not derive pending content') } })
  async function readRoute(suffix) {
    const result = { headers: {} }
    const response = { setHeader(key, value) { result.headers[key] = value },
      writeHead(status, headers) { result.status = status; Object.assign(result.headers, headers) },
      end(body) { result.body ??= body } }
    await runRoutes(routes, { request: { method: 'GET' }, response,
      url: new URL(`http://fixture/api/import-review-preview/revisions/${revision.id}/${suffix}`),
      context: { session: { role: 'owner' }, sendJson(_response, status, body) { Object.assign(result, { status, body }) } } })
    return result
  }
  for (const suffix of ['consumption', 'asset/paper-asset.json', 'products', 'pdf?edition=economy8', 'print?edition=economy8']) {
    const value = await readRoute(suffix)
    assert.equal(value.status, 200, suffix)
    if (suffix === 'consumption') assert.equal(value.headers['x-eqb-review-compatibility'], 'pending')
  }
  for (const suffix of ['pagination', 'print', 'pdf']) {
    const value = await readRoute(suffix)
    assert.equal(value.status, 409, suffix)
    assert.equal(value.body.compatibility.result, 'pending')
  }
  pass('cached payload and frozen originals remain readable; live routes expose pending and structured reason')
  const equal = await compatibility.checkRevision(revision.id)
  assert.equal(equal.comparison.result, 'equal', JSON.stringify(equal.comparison))
  assert.equal(equal.committed, true)
  assert.equal(store.compatibilityForRevision(revision.id).result, 'equal')
  assert.equal(JSON.stringify(store.getRevision(revision.id).approval), originalApproval)
  assert.equal(JSON.stringify(store.productPreviewForRevision(revision.id).preview), originalPreview)
  pass('server code change with identical output rechecks to equal without changing historical approval or preview')
  assertOpsNext('accept_approval')

  const originalPreviewRow = dbRun(dbPath, db => db.prepare(
    'SELECT * FROM import_review_product_previews WHERE revision_id=?').get(revision.id))
  dbRun(dbPath, db => db.prepare('DELETE FROM import_review_product_previews WHERE revision_id=?').run(revision.id))
  assert.equal(store.compatibilityForRevision(revision.id).reasonCode, 'MISSING_BASELINE')
  assert.equal(store.listPapers()[0].compatibility.result, 'unknown')
  for (const operation of [
    () => store.approveRevision(revision.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'owner'),
    () => store.beginPromotion(revision.paperId, { ...approval, intent: 'ship' }, 'owner'),
    () => store.acquireShippingGuard(revision.paperId, approval, 'ship-agent'),
  ]) assert.throws(operation, error => error.compatibility?.reasonCode === 'MISSING_BASELINE')
  assert.throws(() => store.prepareProductPreview(revision.id), { reasonCode: 'MISSING_BASELINE' })
  assert.equal((await readRoute('consumption')).status, 409)
  assert.equal(dbRun(dbPath, db => db.prepare('SELECT count(*) n FROM import_review_product_previews').get().n), 0)
  dbRun(dbPath, db => db.prepare(`INSERT INTO import_review_product_previews (${Object.keys(originalPreviewRow).join(',')})
    VALUES (${Object.keys(originalPreviewRow).map(() => '?').join(',')})`).run(...Object.values(originalPreviewRow)))
  assert.equal(store.compatibilityForRevision(revision.id).result, 'equal')
  pass('missing original preview invalidates cached equal for list and mutation gates; GET and prepare never recreate it')

  const projectionFile = path.join(release, 'server/import-review/revisionProjection.mjs')
  const projectionSource = readFileSync(projectionFile, 'utf8')
  writeFileSync(projectionFile, projectionSource.replace('  reviewBundleInventories.set(projection,',
    '  projection.consumption.fixtureAdditionalContent = true;\n  reviewBundleInventories.set(projection,'))
  assert.equal(store.compatibilityForRevision(revision.id).result, 'pending')
  const different = await compatibility.checkRevision(revision.id)
  assert.equal(different.comparison.result, 'different', JSON.stringify(different.comparison))
  blockedEntrances()
  pass('a new target cannot reuse old equal; actual complete-payload difference blocks every entrance')
  assertOpsNext('inspect_content_difference')
  writeFileSync(projectionFile, projectionSource)
  dbRun(dbPath, db => db.exec('DELETE FROM review_compatibility; DELETE FROM review_subject'))
  const missing = await compatibility.checkRevision(revision.id)
  assert.equal(missing.comparison.result, 'unknown')
  assert.equal(missing.comparison.reasonCode, 'MISSING_BASELINE')
  blockedEntrances()
  assert.equal(dbRun(dbPath, db => db.prepare('SELECT count(*) n FROM review_subject').get().n), 0)
  pass('missing subject becomes unknown without automatic baseline creation or renderer fallback')
  assertOpsNext('inspect_content_compatibility')
  pass('OPS probe retains approved business state and exposes real equal/pending/different/unknown without resubmit')

  for (const profile of ['external', 'public']) {
    const directory = path.join(root, profile)
    const native = makeReviewRoot(directory, `paper-eligibility-${profile}`, undefined, { listening: true })
    let source = native.reviewRoot
    if (profile === 'external') {
      const packageRoot = path.join(directory, 'package')
      makeExternalAnalyzedPackage(source, packageRoot)
      source = path.join(directory, 'external-review')
      await prepareNck1AnalyzedPackageReview({ sourcePath: packageRoot, destinationDir: source,
        expectedPaperId: `paper-eligibility-${profile}` })
    } else {
      const configPath = path.join(source, 'config.json')
      json(configPath, { ...JSON.parse(readFileSync(configPath)), importProfile: 'public-paper-v1' })
      const projection = native.projection
      json(path.join(source, 'paragraph-summaries-v1.json'), {
        schemaVersion: 'paragraph-summaries-v1', paperId: projection.paperId,
        sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
        groups: [...Map.groupBy(enumerateParagraphSummaryTargets(projection.materialization), target => target.groupId)]
          .map(([groupId, values]) => ({ groupId, paragraphs: values.map(({ paragraphId }) => ({ paragraphId, summary: `摘要 ${paragraphId}` })) })),
      })
      json(path.join(source, 'public-search-metadata-v1.json'), publicMetadataFixture(projection.materialization,
        projection.sourceDigest, projection.candidateDigest))
    }
    const projection = freezeReviewFixture(source)
    if (profile === 'external') {
      const input = { sidecar: projection.sourceReferences, materialization: projection.materialization,
        sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest, sourceInput: projection.sourceInput }
      assert.deepEqual(validateSourceReferences(input), [])
      for (const mutate of [
        source => { source.documentSha256 = sha256('wrong official member') },
        source => { source.locator.pointer = '/missing-official-reference' },
        source => { source.locator.pointer = '/__proto__' },
        source => {
          const content = projection.sourceInput.members.find(member => member.role === 'content')
          source.documentSha256 = sha256(content.bytes)
          source.locator.documentId = content.memberId
        },
      ]) {
        const sidecar = structuredClone(projection.sourceReferences)
        mutate(sidecar.groups[0].essays.evidence[0])
        assert.ok(validateSourceReferences({ ...input, sidecar }).length)
      }
      const sourceInput = structuredClone(projection.sourceInput)
      const official = sourceInput.members.find(member => member.role === 'official_answers')
      official.bytes = Buffer.from(`${Buffer.from(official.bytes)} `)
      assert.ok(validateSourceReferences({ ...input, sourceInput }).length)
      pass('external answer references reject wrong SHA, missing/inherited pointer, wrong role and altered sealed member')
    }
    const fixture = finalizeReviewFixture({ directory: source, output: path.join(directory, 'reviewed'), projection })
    const bank = path.join(directory, 'bank.sqlite')
    dbRun(bank, db => db.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8')))
    const service = createSinglePaperPromotionService({ getStore: () => fixture.store,
      openDatabase: () => new DatabaseSync(bank), paperAssetsDir: path.join(directory, 'assets'),
      blobStore: (await import('../server/paper-import/blobStore.mjs')).createBlobStore({ rootDir: path.join(directory, 'blobs') }) })
    const result = await service.promote(projection.paperId, { ...fixture.approval, intent: 'ship' }, 'synthetic-owner')
    assert.equal(result.promotion.state, 'published', JSON.stringify(result))
    const consumption = Object.values(result.consumers)[0]
    const sourceReferences = dbRun(bank, db => readSourceReferencePublication({ db, paperAssetsDir: path.join(directory, 'assets'), consumption }))
    assert.match(buildAnswerOnlyHtml(sourceReferences), /data-answer-section="keys"/)
    for (const file of projection.frozenProducts.manifest.files) assert.deepEqual(readFileSync(
      path.join(directory, 'assets', projection.paperId, 'versions/v1', file.path)), projection.frozenProducts.bytes[file.path])
    assert.equal(JSON.stringify(fixture.store.getRevision(fixture.revision.id).approval), JSON.stringify(fixture.approval))
    pass(`${profile} real finalize/equal/approval/archive/admission/writer/DB/answer-source replay preserves frozen bytes and original approval`)
  }
  const recoveryOutput = path.join(root, 'recovery')
  const recoveryDb = path.join(recoveryOutput, 'review.sqlite')
  const recoveryFiles = path.join(recoveryOutput, 'files')
  const recoveryStore = createReleaseStore({ dbPath: recoveryDb, filesRoot: recoveryFiles,
    rendererBuildId: 'historical-recovery-renderer' })
  const recoveryFixture = finalizeReviewFixture({ directory: native.reviewRoot,
    output: recoveryOutput, projection, store: recoveryStore })
  const recoveryBank = path.join(recoveryOutput, 'bank.sqlite')
  dbRun(recoveryBank, db => db.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8')))
  const { createSinglePaperPromotionService: createReleasePromotion } = await module('singlePaperPromotion')
  const recoveryAssets = path.join(recoveryOutput, 'assets')
  const interrupted = createReleasePromotion({ getStore: () => recoveryStore,
    openDatabase: () => new DatabaseSync(recoveryBank), paperAssetsDir: recoveryAssets,
    blobStore: (await import('../server/paper-import/blobStore.mjs')).createBlobStore({ rootDir: path.join(recoveryOutput, 'blobs') }),
    afterPublish() { throw new Error('forced recovery receipt loss') } })
  await assert.rejects(async () => interrupted.promote(recoveryFixture.revision.paperId,
    { ...recoveryFixture.approval, intent: 'ship' }, 'synthetic-owner'), /forced recovery receipt loss/)
  const recoveryProgram = `
    import assert from 'node:assert/strict';
    import { DatabaseSync } from 'node:sqlite';
    import { createImportReviewStore } from ${JSON.stringify(pathToFileURL(path.join(release, 'server/import-review/importReviewStore.mjs')).href)};
    import { createSinglePaperPromotionService } from ${JSON.stringify(pathToFileURL(path.join(release, 'server/import-review/singlePaperPromotion.mjs')).href)};
    const [dbPath, filesRoot, bankPath, paperAssetsDir, revisionId] = process.argv.slice(1);
    const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'new-recovery-renderer' });
    const revision = store.getRevision(revisionId);
    assert.equal(store.compatibilityForRevision(revisionId).result, 'pending');
    const result = await createSinglePaperPromotionService({ getStore: () => store,
      openDatabase: () => new DatabaseSync(bankPath), paperAssetsDir,
      publish() { throw new Error('Committed recovery cannot publish again'); }
    }).promote(revision.paperId, { ...revision.approval, intent: 'retry_ship' }, 'synthetic-owner');
    assert.equal(result.status, 'idempotent');
    assert.equal(result.promotion.state, 'published');
    assert.deepEqual(store.getRevision(revisionId).approval, revision.approval);
    const bank = new DatabaseSync(bankPath, { readOnly: true });
    assert.equal(bank.prepare('SELECT count(*) n FROM paper_asset_versions').get().n, 1);
    bank.close();
  `
  writeFileSync(projectionFile, projectionSource.replace(
    'export function buildNck1ReviewProjection(rootDir, options = {}) {',
    'export function buildNck1ReviewProjection(rootDir, options = {}) { throw new Error("Current projection must not run during recovery");'))
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', recoveryProgram, recoveryDb,
      recoveryFiles, recoveryBank, recoveryAssets, recoveryFixture.revision.id], { encoding: 'utf8', timeout: 30_000 })
  } finally { writeFileSync(projectionFile, projectionSource) }
  pass('new server with pending eligibility and failing current projection reconciles the exact committed target without republishing')

  const apiOutput = path.join(root, 'api')
  const apiFixture = finalizeReviewFixture({ directory: native.reviewRoot, output: apiOutput, projection })
  dbRun(apiFixture.dbPath, db => db.exec('DELETE FROM review_compatibility'))
  assert.equal(apiFixture.store.compatibilityForRevision(apiFixture.revision.id).result, 'pending')
  const bankPath = path.join(apiOutput, 'bank.sqlite')
  dbRun(bankPath, db => db.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8')))
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const token = randomUUID()
  let apiLog = ''
  api = spawn(process.execPath, ['server/api.mjs'], { cwd: repository, env: {
    ...process.env, QUESTION_BANK_API_PORT: String(port), QUESTION_BANK_DB: bankPath,
    USER_DATA_DB: path.join(apiOutput, 'users.sqlite'), QUESTION_BANK_BUILD_ID: 'new-frontend-renderer',
    QUESTION_BANK_IMPORT_OPS_DB: apiFixture.dbPath, QUESTION_BANK_IMPORT_OPS_ROOT: path.join(apiOutput, 'files'),
    QUESTION_BANK_PAPER_ASSET_ROOT: path.join(apiOutput, 'assets'),
    QUESTION_BANK_USER_SPACE_ROOT: path.join(apiOutput, 'user-space'),
    QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: token,
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', bytes => { apiLog += bytes })
  api.stderr.on('data', bytes => { apiLog += bytes })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API startup timed out: ${apiLog}`)), 15_000)
    const ready = () => {
      if (apiLog.includes('API listening')) { clearTimeout(timer); resolve() }
    }
    api.stdout.on('data', ready)
    api.once('error', reject)
    api.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${apiLog}`)) })
  })
  let status
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(`http://127.0.0.1:${port}/api/import-agent-reviews/papers/${apiFixture.revision.paperId}`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
    })
    assert.equal(response.status, 200, apiLog)
    status = await response.json()
    if (status.compatibility.result === 'equal') break
    await yieldFor(250)
  }
  assert.equal(status.compatibility.result, 'equal', apiLog)
  assert.equal(status.approval.approvalId, apiFixture.approval.approvalId)
  assert.equal(status.approval.rendererBuildId, apiFixture.approval.rendererBuildId)
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API shutdown timed out')), 10_000)
    api.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
  })
  api.kill('SIGTERM')
  assert.deepEqual(await exited, { code: 0, signal: null })
  assert.equal(existsSync(path.join(process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT, 'leader')), false)
  pass('real API startup automatically checks pending work; HTTP exposes equal; SIGTERM stops worker and releases host leader')
  console.log(`PASS ${checks} review eligibility checks`)
} finally {
  if (api && api.exitCode === null) api.kill('SIGTERM')
  rmSync(root, { recursive: true, force: true })
}
