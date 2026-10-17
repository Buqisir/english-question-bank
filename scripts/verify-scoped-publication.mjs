#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'

import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-scoped-publication-'))
const dbPath = path.join(root, 'review.sqlite')
let renderer = 'renderer-a'
let rendererReads = 0
const digest = (character) => `sha256:${character.repeat(64)}`
const paperByRevision = new Map()
const store = createImportReviewStore({
  dbPath, filesRoot: path.join(root, 'files'), rendererBuildId: () => { rendererReads += 1; return renderer },
  projectRevision(directory) {
    const revisionId = path.basename(directory)
    return { paperId: paperByRevision.get(revisionId), sourceDigest: digest('1'),
      candidateDigest: digest('2'), visibleStructureDigest: digest('3'), analysisDigest: digest('4'),
      mediaDerivations: [] }
  },
})

function seed(paperId, suffix, state = 'approved') {
  const revisionId = `rev-00000000-0000-4000-8000-00000000000${suffix}`
  const approval = {
    schemaVersion: 'web-import-review-approval-v1', approvalId: `approval-${suffix}`,
    paperId, revisionId, sourceDigest: digest('1'), candidateDigest: digest('2'),
    visibleStructureDigest: digest('3'), analysisDigest: digest('4'), bundleDigest: digest('5'),
    rendererBuildId: renderer, approvedAt: new Date().toISOString(), approvedBy: 'owner',
  }
  const db = new DatabaseSync(dbPath)
  const now = new Date().toISOString()
  paperByRevision.set(revisionId, paperId)
  db.prepare(`INSERT INTO import_review_papers
    (paper_id, paper_name, latest_revision_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(paperId, paperId, revisionId, now, now)
  db.prepare(`INSERT INTO import_review_revisions
    (id,paper_id,revision_number,state,source_digest,candidate_digest,visible_structure_digest,bundle_digest,producer_build_id,renderer_build_id,manifest_json,approval_receipt_json,created_at,finalized_at,updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'producer', ?, ?, ?, ?, ?, ?)`)
    .run(revisionId, paperId, state, approval.sourceDigest, approval.candidateDigest,
      approval.visibleStructureDigest, approval.bundleDigest, renderer,
      JSON.stringify({ schemaVersion: 'web-import-review-bundle-v1', analysisDigest: approval.analysisDigest }),
      state === 'approved' ? JSON.stringify(approval) : null, now, now, now)
  db.close()
  return approval
}

function input(approval, secret) {
  return { requestId: `publication-request-${randomUUID()}`, revisionId: approval.revisionId,
    secretHash: sha256(secret), ttlSeconds: 300 }
}

async function routeRequest(routes, pathname, { method = 'POST', body = {}, session = null, origin = '', csrf = false } = {}) {
  const request = Readable.from([JSON.stringify(body)])
  request.method = method
  request.headers = { authorization: 'Bearer agent-token', host: 'review.test', ...(origin ? { origin } : {}),
    ...(csrf ? { 'x-eqb-csrf': 'scoped-publication' } : {}) }
  request.socket = {}
  const result = { status: null, body: null }
  const response = { writeHead(status) { result.status = status }, end(value) {
    if (value) { try { result.body = JSON.parse(value) } catch { result.body = String(value) } }
  } }
  const context = {
    ...(session ? { session } : {}),
    readJsonBody: readJsonRouteBody,
    sendJson(res, status, value) { res.writeHead(status); result.body = value; res.end() },
  }
  await runRoutes(routes, { request, response, url: new URL(pathname, 'http://review.test'), context })
  return result
}

try {
  const approval = seed('paper-scoped-a', '1')
  const other = seed('paper-scoped-b', '2')
  const awaiting = seed('paper-scoped-awaiting', '3', 'awaiting_review')
  // Unset QUESTION_BANK_BUILD_ID makes each read hash the renderer tree, so a listing reads it once.
  const readsBeforeListing = rendererReads
  const listed = store.listPapers()
  assert.equal(listed.filter((paper) => paper.reviewKind === 'candidate' && paper.rendererStale === false).length, 3)
  assert.equal(rendererReads - readsBeforeListing, 1)
  const disabledRoutes = createImportReviewRoutes({ getStore: () => store, agentToken: 'agent-token', shipToken: 'ship-token', buildPrintHtml() {} })
  const disabled = await routeRequest(disabledRoutes, '/api/import-agent-reviews/papers/paper-scoped-a/publication-requests', { body: input(approval, 'route-secret') })
  assert.equal(disabled.status, 404, 'agent token alone must not activate scoped publication')
  const enabledRoutes = createImportReviewRoutes({ getStore: () => store, agentToken: 'agent-token', shipToken: 'ship-token', buildPrintHtml() {}, scopedPublicationEnabled: true,
    promotionService: createSinglePaperPromotionService({ getStore: () => store, paperAssetsDir: path.join(root, 'assets'),
      openDatabase() { throw new Error('Consumed HTTP replay must not open the publication database') },
      publish() { throw new Error('Consumed HTTP replay must not run the publisher') },
    }),
  })
  const agentBooleanGrant = await routeRequest(enabledRoutes, '/api/import-reviews/publication-requests/missing/grant', { body: { ownerAuthorized: true } })
  assert.equal(agentBooleanGrant.status, 403, 'an Agent boolean cannot substitute for Owner session grant')
  assert.throws(() => store.registerPublicationRequest('paper-scoped-a', { ...input(approval, 'bad-ttl'), ttlSeconds: Number.NaN }, 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_TTL_INVALID')
  const awaitingRequest = store.registerPublicationRequest('paper-scoped-awaiting', input(awaiting, 'awaiting-secret'), 'import-agent-token')
  if (process.env.CAPTURE_SCOPED_PUBLICATION_HTML) {
    const page = await routeRequest(enabledRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/confirmation`, {
      method: 'GET', session: { role: 'owner', username: 'owner' },
    })
    mkdirSync(path.join(process.cwd(), '.scratch'), { recursive: true })
    writeFileSync(path.join(process.cwd(), '.scratch', 'scoped-publication.html'), page.body)
  }
  const hostile = await routeRequest(enabledRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/approve`, {
    session: { role: 'owner', username: 'owner' }, origin: 'https://evil.test', csrf: true,
  })
  assert.equal(hostile.status, 403)
  const proxiedRoutes = createImportReviewRoutes({ getStore: () => store, agentToken: 'agent-token', shipToken: 'ship-token',
    buildPrintHtml() {}, scopedPublicationEnabled: true, trustedPublicOrigin: 'https://review.example' })
  const layout = await routeRequest(proxiedRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/approve`, {
    session: { role: 'owner', username: 'owner' }, origin: 'https://review.example', csrf: true,
  })
  assert.equal(layout.status, 200, 'configured public proxy origin must support Owner layout approval')
  const duplicateLayout = await routeRequest(proxiedRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/approve`, {
    session: { role: 'owner', username: 'owner' }, origin: 'https://review.example', csrf: true,
  })
  assert.equal(duplicateLayout.body.approval.approvalId, layout.body.approval.approvalId, 'lost approval response must not mint another approval')
  const reloaded = await routeRequest(proxiedRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/confirmation`, {
    method: 'GET', session: { role: 'owner', username: 'owner' },
  })
  assert.match(reloaded.body, /id="approve" disabled/)
  assert.match(reloaded.body, /id="grant" >/, 'reload must reconstruct the separate grant action')
  assert.match(reloaded.body, /view=paper-browse&amp;paperId=/, 'preview opens the ordinary website, not OPS')
  const delegated = await routeRequest(proxiedRoutes, `/api/import-reviews/publication-requests/${awaitingRequest.requestId}/grant`, {
    session: { role: 'owner', username: 'owner' }, origin: 'https://review.example', csrf: true,
  })
  assert.equal(delegated.status, 200, 'Owner delegation is a distinct second intent')
  const awaitingRedeem = store.beginScopedPromotion('paper-scoped-awaiting', awaitingRequest.requestId,
    sha256('awaiting-secret'), 'import-agent-token')
  assert.equal(awaitingRedeem.action, 'publish')
  const pending = store.registerPublicationRequest('paper-scoped-a', input(approval, 'secret-a'), 'agent-a')
  assert.equal(store.registerPublicationRequest('paper-scoped-a', { ...input(approval, 'unused'), requestId: pending.requestId,
    secretHash: sha256('secret-a') }, 'agent-a').requestId, pending.requestId, 'registration response loss must reconcile by client request ID')
  assert.throws(() => store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_GRANT_REQUIRED')
  assert.throws(() => store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('wrong'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_FORBIDDEN')
  assert.throws(() => store.beginScopedPromotion('paper-scoped-b', pending.requestId, sha256('secret-a'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_FORBIDDEN')
  assert.throws(() => store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-b'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_FORBIDDEN')

  const expired = store.registerPublicationRequest('paper-scoped-b', input(other, 'secret-b'), 'agent-a')
  const db = new DatabaseSync(dbPath)
  db.prepare('UPDATE import_review_publication_requests SET expires_at = ? WHERE id = ?')
    .run('2000-01-01T00:00:00.000Z', expired.requestId)
  db.close()
  assert.throws(() => store.grantPublicationRequest(expired.requestId, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_EXPIRED')
  assert.equal(store.publicationRequest(expired.requestId).expired, true)
  const expiredApprove = await routeRequest(enabledRoutes, `/api/import-reviews/publication-requests/${expired.requestId}/approve`, {
    session: { role: 'owner', username: 'owner' }, origin: 'http://review.test', csrf: true,
  })
  assert.equal(expiredApprove.status, 410)
  const revoked = store.registerPublicationRequest('paper-scoped-b', input(other, 'secret-revoked'), 'agent-a')
  store.revokePublicationRequest(revoked.requestId, 'owner')
  const revokedApprove = await routeRequest(enabledRoutes, `/api/import-reviews/publication-requests/${revoked.requestId}/approve`, {
    session: { role: 'owner', username: 'owner' }, origin: 'http://review.test', csrf: true,
  })
  assert.equal(revokedApprove.body.code, 'IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_PENDING')
  assert.throws(() => store.beginScopedPromotion('paper-scoped-b', revoked.requestId, sha256('secret-revoked'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_GRANT_REQUIRED')

  store.grantPublicationRequest(pending.requestId, 'owner')
  const driftDb = new DatabaseSync(dbPath)
  driftDb.prepare('UPDATE import_review_revisions SET approval_receipt_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...approval, approvalId: 'approval-drifted' }), approval.revisionId)
  driftDb.close()
  assert.throws(() => store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_STALE')
  const restoreDb = new DatabaseSync(dbPath)
  restoreDb.prepare('UPDATE import_review_revisions SET approval_receipt_json = ? WHERE id = ?')
    .run(JSON.stringify(approval), approval.revisionId)
  restoreDb.close()
  renderer = 'renderer-b'
  assert.throws(() => store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_STALE' || error.code === 'IMPORT_REVIEW_PROMOTION_STALE')
  renderer = 'renderer-a'
  const first = store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a')
  const concurrent = store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a')
  assert.equal(first.action, 'publish')
  assert.equal(concurrent.action, 'consumed')
  assert.equal(concurrent.promotion.promotionId, first.promotion.promotionId)
  assert.equal(store.latestPromotion('paper-scoped-a').attemptCount, 1)
  assert.throws(() => store.revokePublicationRequest(pending.requestId, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_REVOCABLE', 'revoke cannot overwrite consumed state')
  const responseLoss = store.beginScopedPromotion('paper-scoped-a', pending.requestId, sha256('secret-a'), 'agent-a')
  assert.equal(responseLoss.action, 'consumed')
  assert.equal(responseLoss.promotion.state, 'publishing')
  assert.equal(store.latestPromotion('paper-scoped-a').attemptCount, 1)
  for (const [suffix, version] of [['4', 'v2'], ['5', 'v3']]) {
    const publicApproval = seed(`paper-public-${version}`, suffix)
    delete publicApproval.analysisDigest
    Object.assign(publicApproval, { importProfile: 'public-paper-v1', paragraphSummariesDigest: digest('6'), publicSearchMetadataDigest: digest('7') })
    const publicDb = new DatabaseSync(dbPath)
    publicDb.prepare('UPDATE import_review_revisions SET manifest_json = ?, approval_receipt_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...publicApproval, schemaVersion: `web-import-review-bundle-${version}` }), JSON.stringify(publicApproval), publicApproval.revisionId)
    publicDb.close()
    const publicRequest = store.registerPublicationRequest(publicApproval.paperId, input(publicApproval, 'public-secret'), 'agent-a')
    store.grantPublicationRequest(publicRequest.requestId, 'owner')
    const publicPromotion = store.beginScopedPromotion(publicApproval.paperId, publicRequest.requestId, sha256('public-secret'), 'agent-a')
    assert.equal(publicPromotion.promotion.importProfile, 'public-paper-v1', `${version} must not turn into a legacy promotion`)
    assert.equal(publicPromotion.promotion.analysisDigest, undefined)
    assert.equal(publicPromotion.promotion.paragraphSummariesDigest, digest('6'))
  }
  const raceApproval = seed('paper-scoped-race', '7')
  const raceRequest = store.registerPublicationRequest(raceApproval.paperId, input(raceApproval, 'race-secret'), 'agent-a')
  store.grantPublicationRequest(raceRequest.requestId, 'owner')
  const workerSource = `
    import { parentPort, workerData } from 'node:worker_threads';
    import { createImportReviewStore } from ${JSON.stringify(new URL('../server/import-review/importReviewStore.mjs', import.meta.url).href)};
    const store = createImportReviewStore({dbPath:workerData.dbPath, filesRoot:workerData.filesRoot, rendererBuildId:'renderer-a'});
    parentPort.once('message', () => {
      try { const value = workerData.operation === 'revoke'
        ? store.revokePublicationRequest(workerData.requestId, 'owner')
        : store.beginScopedPromotion('paper-scoped-race', workerData.requestId, workerData.secretHash, 'agent-a');
        parentPort.postMessage({ok:true, state:value.state || value.action});
      } catch(error) { parentPort.postMessage({ok:false, code:error.code, message:error.message}); }
      parentPort.close();
    });
    parentPort.postMessage('ready');`
  const workers = await Promise.all(['revoke', 'redeem'].map(operation => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), { workerData: {
      operation, dbPath, filesRoot:path.join(root, 'files'), requestId:raceRequest.requestId, secretHash:sha256('race-secret'),
    } })
    worker.once('error', reject)
    worker.once('message', () => resolve(worker))
  })))
  try {
    const outcomes = workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject) }))
    workers.forEach(worker => worker.postMessage('start'))
    const result = await Promise.all(outcomes)
    assert.equal(result.filter(item => item.ok).length, 1, 'independent DB connections must serialize revoke against redeem')
    const rejected = result.find(item => !item.ok)
    assert(['IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_REVOCABLE', 'IMPORT_REVIEW_PUBLICATION_GRANT_REQUIRED'].includes(rejected.code)
      || (rejected.code === 'ERR_SQLITE_ERROR' && /database is locked/.test(rejected.message)), JSON.stringify(result))
    // The store does not retry a competing SQLite writer. A lock rejection must
    // still leave exactly one durable outcome, never overwrite the winner.
    const retained = store.publicationRequest(raceRequest.requestId)
    assert.equal(Boolean(retained.promotion), retained.state === 'consumed')
  } finally { await Promise.all(workers.map(worker => worker.terminate())) }
  const cliPaperId = `paper-cli-${randomUUID()}`
  const cliApproval = seed(cliPaperId, '6')
  const capabilityDir = path.resolve(import.meta.dirname, '../data/import-publication-requests')
  const capabilityPath = path.join(capabilityDir, `${cliPaperId}.json`)
  let dropRegistrationResponse = true
  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const sendJson = (res, status, value) => {
      if (dropRegistrationResponse && request.method === 'POST' && url.pathname.endsWith('/publication-requests') && status === 201) {
        dropRegistrationResponse = false
        res.destroy()
        return
      }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (url.pathname === `/api/import-agent-reviews/papers/${cliPaperId}`) {
      sendJson(response, 200, { latestRevisionId: cliApproval.revisionId })
      return
    }
    await runRoutes(enabledRoutes, { request, response, url, context: { readJsonBody: readJsonRouteBody, sendJson } })
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const runCli = (...extra) => promisify(execFile)(process.execPath, [
    path.resolve(import.meta.dirname, 'import-pipeline/review.mjs'), 'request-publication', cliPaperId,
    '--revision', cliApproval.revisionId, ...extra,
  ], { env: { ...process.env, QUESTION_BANK_IMPORT_OPS_ORIGIN: `http://127.0.0.1:${httpServer.address().port}`,
    QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'agent-token' }, timeout: 30_000 })
  try {
    await assert.rejects(runCli(), /fetch failed/, 'response-loss test must lose the actual registration response')
    const retained = JSON.parse(readFileSync(capabilityPath, 'utf8'))
    assert.equal(statSync(capabilityPath).mode & 0o777, 0o600)
    const recovered = JSON.parse((await runCli()).stdout)
    assert.equal(recovered.request.requestId, retained.requestId)
    assert.equal(new URL(recovered.confirmationUrl).pathname, `/api/import-reviews/publication-requests/${retained.requestId}/confirmation`)
    await assert.rejects(runCli('--new-request'), /still live or its promotion is unresolved/)
    const expiryDb = new DatabaseSync(dbPath)
    expiryDb.prepare('UPDATE import_review_publication_requests SET expires_at = ? WHERE id = ?')
      .run('2000-01-01T00:00:00.000Z', retained.requestId)
    expiryDb.close()
    const renewed = JSON.parse((await runCli('--new-request')).stdout)
    assert.notEqual(renewed.request.requestId, retained.requestId)
    assert.deepEqual(JSON.parse(readFileSync(`${capabilityPath}.${retained.requestId}`, 'utf8')), retained)
    store.revokePublicationRequest(renewed.request.requestId, 'owner')
    const afterRevoke = JSON.parse((await runCli('--new-request')).stdout)
    assert.notEqual(afterRevoke.request.requestId, renewed.request.requestId)
    store.grantPublicationRequest(afterRevoke.request.requestId, 'owner')
    const latestCapability = JSON.parse(readFileSync(capabilityPath, 'utf8'))
    store.beginScopedPromotion(cliPaperId, latestCapability.requestId, sha256(latestCapability.requestSecret), 'import-agent-token')
    await assert.rejects(runCli('--new-request'), /still live or its promotion is unresolved/, 'UNKNOWN cannot be retired by CLI renewal')
    const redemption = await fetch(`http://127.0.0.1:${httpServer.address().port}/api/import-agent-reviews/papers/${cliPaperId}/publication-requests/${latestCapability.requestId}/redeem`, {
      method: 'POST', headers: { authorization: 'Bearer agent-token', 'content-type': 'application/json' },
      body: JSON.stringify({ requestSecret: latestCapability.requestSecret }),
    })
    assert.equal(redemption.status, 200)
    const replay = await redemption.json()
    assert.equal(replay.status, 'publishing', 'actual HTTP redemption of consumed capability is read-only')
    assert.equal(replay.promotion.attemptCount, 1)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
    for (const name of readdirSync(capabilityDir).filter((name) => name.startsWith(`${cliPaperId}.json`))) {
      rmSync(path.join(capabilityDir, name), { recursive: true, force: true })
    }
  }
  console.log('PASS scoped publication exact grant, reload, expiry/drift, redemption, CLI response-loss/renewal, and no implicit retry')
} finally {
  rmSync(root, { recursive: true, force: true })
}
