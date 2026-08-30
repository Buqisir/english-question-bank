#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { createSourceIntakeNotifier } from '../server/source-intake/sourceIntakeNotifier.mjs'
import { createSourceIntakeRoutes } from '../server/source-intake/sourceIntakeRoutes.mjs'
import { createSourceIntakeStore } from '../server/source-intake/sourceIntakeStore.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-source-intake-'))
const dbPath = path.join(tempRoot, 'import-ops.sqlite')
const filesRoot = path.join(tempRoot, 'files')
const agentToken = 'verify-source-intake-agent-token'
const orbThreadId = 'T-11111111-1111-4111-8111-111111111111'
let clock = new Date('2026-08-30T00:00:00.000Z')

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function initializationReceipt(submission, paperId, ampThreadId = null) {
  return {
    schemaVersion: ampThreadId
      ? 'source-intake-initialization-v2'
      : 'source-intake-initialization-v1',
    submissionId: submission.id,
    submissionDigest: submission.submissionDigest,
    paperId,
    ...(ampThreadId ? { ampThreadId } : {}),
  }
}

function sendJson(response, status, body) {
  const json = JSON.stringify(body)
  response.writeHead(status, {
    'content-length': Buffer.byteLength(json),
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(json)
}

function sessionFor(request) {
  const role = request.headers['x-verify-role']
  if (role === 'owner') return { username: 'owner', role: 'owner', accountKind: 'human' }
  if (role === 'member') return { username: 'member', role: 'member', accountKind: 'human' }
  if (role === 'import_agent') {
    return { username: 'import-agent', role: 'owner', accountKind: 'import_agent' }
  }
  return null
}

async function request(origin, pathname, {
  method = 'GET',
  role = null,
  body = null,
  rawBody = null,
  headers = {},
} = {}) {
  const requestHeaders = { ...headers }
  if (role) requestHeaders['x-verify-role'] = role
  if (body !== null) requestHeaders['content-type'] = 'application/json'
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: requestHeaders,
    body: rawBody ?? (body !== null ? JSON.stringify(body) : undefined),
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || ''
  return {
    status: response.status,
    headers: response.headers,
    bytes,
    json: contentType.includes('application/json') ? JSON.parse(bytes.toString('utf8')) : null,
  }
}

async function registerAndUpload(origin, intakeId, role, fileName, bytes, ownerRole = 'owner') {
  const mediaType = fileName.endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const registered = await request(origin, `/api/source-intakes/${intakeId}/files`, {
    method: 'POST',
    role: ownerRole,
    body: {
      role,
      fileName,
      mediaType,
      sha256: digest(bytes),
      byteLength: bytes.length,
    },
  })
  assert.ok([200, 201].includes(registered.status), JSON.stringify(registered.json))
  const fileId = registered.json.file.id
  const uploaded = await request(origin, `/api/source-intakes/${intakeId}/files/${fileId}`, {
    method: 'PUT',
    role: ownerRole,
    rawBody: bytes,
    headers: {
      'content-length': String(bytes.length),
      'content-type': mediaType,
    },
  })
  return { fileId, uploaded }
}

function runSourceIntakeCli(origin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join('scripts', 'import-pipeline', 'source-intake.mjs'), ...args],
      {
        cwd: path.resolve(import.meta.dirname, '..'),
        env: {
          ...process.env,
          QUESTION_BANK_IMPORT_OPS_ORIGIN: origin,
          QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: agentToken,
          AMP_THREAD_ID: orbThreadId,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`source-intake CLI exited ${code}: ${output}`))
    })
  })
}

const store = createSourceIntakeStore({ dbPath, filesRoot, now: () => clock })
const notifier = createSourceIntakeNotifier()
const routes = createSourceIntakeRoutes({ getStore: () => store, notifier, agentToken })
const server = createServer(async (incoming, response) => {
  const url = new URL(incoming.url || '/', `http://${incoming.headers.host}`)
  const session = sessionFor(incoming)
  const handled = await runRoutes(routes, {
    request: incoming,
    response,
    url,
    context: {
      session,
      sendJson,
      readJsonBody: readJsonRouteBody,
    },
  })
  if (!handled) sendJson(response, 404, { error: 'not_found' })
})

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const origin = `http://127.0.0.1:${address.port}`

  const memberDenied = await request(origin, '/api/source-intakes', { role: 'member' })
  assert.equal(memberDenied.status, 403, 'member cannot read private source intake ledger')

  const created = await request(origin, '/api/source-intakes', {
    method: 'POST',
    role: 'owner',
    body: {
      paperName: '2027 届高三开学考英语',
      sources: [{
        platform: 'teacher_group',
        sourceName: '高三英语教师群',
      }],
    },
  })
  assert.equal(created.status, 201)
  const intakeId = created.json.intake.id
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
  const question = await registerAndUpload(
    origin,
    intakeId,
    'question_source',
    'questions.pdf',
    pdf,
  )
  assert.equal(question.uploaded.status, 200)
  assert.equal(question.uploaded.json.intake.state, 'awaiting_answers')
  const originalQuestionPath = store.storedFilePath({
    id: question.fileId,
    intakeId,
    extension: '.pdf',
  })

  const wrongMimeReplacement = Buffer.concat([pdf, Buffer.from('\n% replacement')])
  const wrongMimeManifest = await request(origin, `/api/source-intakes/${intakeId}/files`, {
    method: 'POST',
    role: 'owner',
    body: {
      role: 'question_source',
      fileName: 'wrong-mime.pdf',
      mediaType: 'application/pdf',
      sha256: digest(wrongMimeReplacement),
      byteLength: wrongMimeReplacement.length,
    },
  })
  assert.equal(wrongMimeManifest.status, 201)
  const wrongMimeUpload = await request(
    origin,
    `/api/source-intakes/${intakeId}/files/${wrongMimeManifest.json.file.id}`,
    {
      method: 'PUT',
      role: 'owner',
      rawBody: wrongMimeReplacement,
      headers: {
        'content-length': String(wrongMimeReplacement.length),
        'content-type': 'application/octet-stream',
      },
    },
  )
  assert.equal(wrongMimeUpload.status, 415)
  assert.equal(wrongMimeUpload.json.code, 'SOURCE_INTAKE_FILE_MIME_MISMATCH')
  const afterWrongMimeReplacement = await request(origin, `/api/source-intakes/${intakeId}`, {
    role: 'owner',
  })
  assert.equal(afterWrongMimeReplacement.json.intake.state, 'awaiting_answers')
  assert.equal(afterWrongMimeReplacement.json.intake.files.length, 1)
  assert.equal(afterWrongMimeReplacement.json.intake.files[0].id, question.fileId)
  assert.deepEqual(readFileSync(originalQuestionPath), pdf)

  const invalidReplacement = Buffer.from('replacement is not a PDF')
  const replacementManifest = await request(origin, `/api/source-intakes/${intakeId}/files`, {
    method: 'POST',
    role: 'owner',
    body: {
      role: 'question_source',
      fileName: 'replacement.pdf',
      mediaType: 'application/pdf',
      sha256: digest(invalidReplacement),
      byteLength: invalidReplacement.length,
    },
  })
  assert.equal(replacementManifest.status, 201)
  const failedReplacement = await request(
    origin,
    `/api/source-intakes/${intakeId}/files/${replacementManifest.json.file.id}`,
    {
      method: 'PUT',
      role: 'owner',
      rawBody: invalidReplacement,
      headers: {
        'content-length': String(invalidReplacement.length),
        'content-type': 'application/pdf',
      },
    },
  )
  assert.equal(failedReplacement.status, 400)
  assert.equal(failedReplacement.json.code, 'SOURCE_INTAKE_FILE_MAGIC_INVALID')
  const afterFailedReplacement = await request(origin, `/api/source-intakes/${intakeId}`, {
    role: 'owner',
  })
  assert.equal(afterFailedReplacement.json.intake.state, 'awaiting_answers')
  assert.equal(afterFailedReplacement.json.intake.files.length, 1)
  assert.equal(afterFailedReplacement.json.intake.files[0].id, question.fileId)
  assert.deepEqual(readFileSync(originalQuestionPath), pdf)

  const incompleteSubmit = await request(origin, `/api/source-intakes/${intakeId}/submit`, {
    method: 'POST',
    role: 'owner',
  })
  assert.equal(incompleteSubmit.status, 409)
  assert.equal(incompleteSubmit.json.code, 'SOURCE_INTAKE_NOT_READY')

  const fakeDocx = Buffer.from('not-a-docx')
  const badManifest = await request(origin, `/api/source-intakes/${intakeId}/files`, {
    method: 'POST',
    role: 'owner',
    body: {
      role: 'official_answers',
      fileName: 'answers.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sha256: digest(fakeDocx),
      byteLength: fakeDocx.length,
    },
  })
  assert.equal(badManifest.status, 201)
  const badUpload = await request(
    origin,
    `/api/source-intakes/${intakeId}/files/${badManifest.json.file.id}`,
    {
      method: 'PUT',
      role: 'owner',
      rawBody: fakeDocx,
      headers: {
        'content-length': String(fakeDocx.length),
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    },
  )
  assert.equal(badUpload.status, 400)
  assert.equal(badUpload.json.code, 'SOURCE_INTAKE_FILE_MAGIC_INVALID')

  const answers = await registerAndUpload(
    origin,
    intakeId,
    'official_answers',
    'answers.pdf',
    pdf,
  )
  assert.equal(answers.uploaded.status, 200)
  assert.equal(answers.uploaded.json.intake.state, 'ready_for_agent')

  const submitted = await request(origin, `/api/source-intakes/${intakeId}/submit`, {
    method: 'POST',
    role: 'owner',
  })
  assert.equal(submitted.status, 201)
  assert.equal(submitted.json.intake.state, 'queued')
  assert.deepEqual(submitted.json.notification, { state: 'skipped', reason: 'not_configured' })
  const submissionId = submitted.json.submission.id

  const ownerCannotClaim = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/claim`,
    { method: 'POST', role: 'owner', body: {} },
  )
  assert.equal(ownerCannotClaim.status, 401)
  const queue = await request(origin, '/api/import-agent-source-intakes', {
    headers: { authorization: `Bearer ${agentToken}` },
  })
  assert.equal(queue.status, 200)
  assert.equal(queue.json.submissions.length, 1)

  const claim = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/claim`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${agentToken}` },
      body: { leaseSeconds: 60 },
    },
  )
  assert.equal(claim.status, 200)
  const lease = claim.json.claim.leaseToken
  const heartbeat = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/heartbeat`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${agentToken}`,
        'x-source-intake-lease': lease,
      },
      body: { leaseSeconds: 120 },
    },
  )
  assert.equal(heartbeat.status, 200)
  assert.equal(heartbeat.json.claim.leaseExpiresAt, '2026-08-30T00:02:00.000Z')
  const duplicateClaim = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/claim`,
    {
      method: 'POST',
      role: 'import_agent',
      body: { leaseSeconds: 60 },
    },
  )
  assert.equal(duplicateClaim.status, 409)
  assert.equal(duplicateClaim.json.code, 'SOURCE_INTAKE_ALREADY_CLAIMED')

  clock = new Date('2026-08-30T00:02:01.000Z')
  assert.equal(store.listQueue().some((item) => item.submissionId === submissionId), true)
  const reclaimed = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/claim`,
    {
      method: 'POST',
      role: 'import_agent',
      body: { leaseSeconds: 60 },
    },
  )
  assert.equal(reclaimed.status, 200)
  const reclaimedLease = reclaimed.json.claim.leaseToken
  assert.notEqual(reclaimedLease, lease)

  const expiredLease = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/files/${question.fileId}`,
    {
      headers: {
        authorization: `Bearer ${agentToken}`,
        'x-source-intake-lease': lease,
      },
    },
  )
  assert.equal(expiredLease.status, 403)
  const download = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/files/${question.fileId}`,
    {
      role: 'import_agent',
      headers: { 'x-source-intake-lease': reclaimedLease },
    },
  )
  assert.equal(download.status, 200)
  assert.deepEqual(download.bytes, pdf)
  assert.equal(download.headers.get('x-source-file-sha256'), digest(pdf))

  const needsOwner = await request(
    origin,
    `/api/import-agent-source-intakes/${submissionId}/needs-owner`,
    {
      method: 'POST',
      role: 'import_agent',
      headers: { 'x-source-intake-lease': reclaimedLease },
      body: { reasonCode: 'SOURCE_AMBIGUOUS', message: '请确认试卷地区。' },
    },
  )
  assert.equal(needsOwner.status, 200)
  assert.equal(needsOwner.json.intake.state, 'needs_owner')

  const replacementPdf = Buffer.from('%PDF-1.7 replacement question source')
  const replacedQuestion = await registerAndUpload(
    origin,
    intakeId,
    'question_source',
    'questions-corrected.pdf',
    replacementPdf,
  )
  assert.equal(replacedQuestion.uploaded.status, 200)
  assert.equal(replacedQuestion.uploaded.json.intake.state, 'ready_for_agent')
  assert.deepEqual(
    readFileSync(originalQuestionPath),
    pdf,
    'replacing a draft file preserves bytes frozen by the older submission',
  )

  const corrected = await request(origin, `/api/source-intakes/${intakeId}`, {
    method: 'PATCH',
    role: 'owner',
    body: {
      paperName: '2027 届成都高三开学考英语',
      sources: [{ platform: 'teacher_group', sourceName: '成都高三英语教师群' }],
    },
  })
  assert.equal(corrected.status, 200)
  assert.equal(corrected.json.intake.state, 'ready_for_agent')
  const resubmitted = await request(origin, `/api/source-intakes/${intakeId}/submit`, {
    method: 'POST',
    role: 'owner',
  })
  assert.equal(resubmitted.status, 201)
  assert.equal(resubmitted.json.submission.revisionNumber, 2)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  const snapshots = db.prepare(`
    SELECT revision_number, snapshot_json FROM source_intake_submissions
    WHERE intake_id = ? ORDER BY revision_number
  `).all(intakeId).map((row) => ({
    revisionNumber: row.revision_number,
    snapshot: JSON.parse(row.snapshot_json),
  }))
  db.close()
  assert.equal(snapshots[0].snapshot.paperName, '2027 届高三开学考英语')
  assert.equal(snapshots[1].snapshot.paperName, '2027 届成都高三开学考英语')
  assert.notEqual(
    submitted.json.submission.submissionDigest,
    resubmitted.json.submission.submissionDigest,
  )
  assert.equal(
    snapshots[1].snapshot.files.find((file) => file.role === 'question_source').sha256,
    digest(replacementPdf),
  )

  const secondClaim = await request(
    origin,
    `/api/import-agent-source-intakes/${resubmitted.json.submission.id}/claim`,
    { method: 'POST', role: 'import_agent', body: { leaseSeconds: 60 } },
  )
  assert.equal(secondClaim.status, 200)
  const handoffWithoutInitialization = await request(
    origin,
    `/api/import-agent-source-intakes/${resubmitted.json.submission.id}/handoff`,
    {
      method: 'POST',
      role: 'import_agent',
      headers: { 'x-source-intake-lease': secondClaim.json.claim.leaseToken },
      body: { paperId: 'paper-uninitialized' },
    },
  )
  assert.equal(handoffWithoutInitialization.status, 400)
  assert.equal(
    handoffWithoutInitialization.json.code,
    'SOURCE_INTAKE_INITIALIZATION_REQUIRED',
  )

  const reviewDb = new DatabaseSync(dbPath)
  reviewDb.exec(`
    CREATE TABLE IF NOT EXISTS import_review_papers (
      paper_id TEXT PRIMARY KEY,
      paper_name TEXT NOT NULL,
      latest_revision_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  reviewDb.prepare(`
    INSERT INTO import_review_papers (
      paper_id, paper_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run(
    'paper-existing-review',
    'Existing review paper',
    clock.toISOString(),
    clock.toISOString(),
  )
  reviewDb.close()
  const conflictingHandoff = await request(
    origin,
    `/api/import-agent-source-intakes/${resubmitted.json.submission.id}/handoff`,
    {
      method: 'POST',
      role: 'import_agent',
      headers: { 'x-source-intake-lease': secondClaim.json.claim.leaseToken },
      body: {
        paperId: 'paper-existing-review',
        initialization: initializationReceipt(
          resubmitted.json.submission,
          'paper-existing-review',
        ),
      },
    },
  )
  assert.equal(conflictingHandoff.status, 409)
  assert.equal(conflictingHandoff.json.code, 'SOURCE_INTAKE_PAPER_ID_CONFLICT')
  const handedOff = await request(
    origin,
    `/api/import-agent-source-intakes/${resubmitted.json.submission.id}/handoff`,
    {
      method: 'POST',
      role: 'import_agent',
      headers: { 'x-source-intake-lease': secondClaim.json.claim.leaseToken },
      body: {
        paperId: 'paper-2027-chengdu-opening',
        initialization: initializationReceipt(
          resubmitted.json.submission,
          'paper-2027-chengdu-opening',
        ),
      },
    },
  )
  assert.equal(handedOff.status, 200)
  assert.equal(handedOff.json.intake.state, 'handed_off')

  clock = new Date('2026-08-30T01:00:00.000Z')
  assert.equal(store.listQueue().length, 0)

  let webhookRequest = null
  const webhookNotifier = createSourceIntakeNotifier({
    webhookUrl: 'https://webhook.invalid/source-intake',
    webhookSecret: 'verify-secret',
    fetchImpl: async (_url, options) => {
      webhookRequest = options
      return { ok: true, status: 204 }
    },
  })
  const webhookOutcome = await webhookNotifier.notify(submitted.json.submission)
  assert.deepEqual(webhookOutcome, { state: 'sent' })
  const webhookBody = JSON.parse(webhookRequest.body)
  assert.deepEqual(Object.keys(webhookBody).sort(), [
    'event',
    'schemaVersion',
    'submissionDigest',
    'submissionId',
  ])
  assert.match(webhookRequest.headers['x-eqbank-signature'], /^sha256=[a-f0-9]{64}$/)

  const cliCreated = await request(origin, '/api/source-intakes', {
    method: 'POST',
    role: 'owner',
    body: {
      paperName: 'CLI 交接验证卷',
      sources: [{ platform: 'teacher_group', sourceName: '验证教师群' }],
    },
  })
  const cliIntakeId = cliCreated.json.intake.id
  const cliPdf = readFileSync(path.resolve(
    import.meta.dirname,
    '../test-fixtures/paper-import/paper-2026-i-canonical-pilot/paper.pdf',
  ))
  await registerAndUpload(
    origin,
    cliIntakeId,
    'question_and_answers',
    'cli-combined.pdf',
    cliPdf,
  )
  const cliSubmitted = await request(origin, `/api/source-intakes/${cliIntakeId}/submit`, {
    method: 'POST',
    role: 'owner',
  })
  const cliSubmissionId = cliSubmitted.json.submission.id
  const workerPath = `/api/import-agent-source-intakes/${cliSubmissionId}/orb-worker`
  const ownerCannotReserve = await request(origin, `${workerPath}/reserve`, {
    method: 'POST',
    role: 'owner',
    body: {
      submissionDigest: cliSubmitted.json.submission.submissionDigest,
      webhookEventId: 'webhook-owner-denied',
    },
  })
  assert.equal(ownerCannotReserve.status, 401)
  const digestMismatch = await request(origin, `${workerPath}/reserve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${agentToken}` },
    body: {
      submissionDigest: `sha256:${'f'.repeat(64)}`,
      webhookEventId: 'webhook-wrong-digest',
    },
  })
  assert.equal(digestMismatch.status, 409)
  assert.equal(digestMismatch.json.code, 'SOURCE_INTAKE_SUBMISSION_DIGEST_MISMATCH')

  const reservations = await Promise.all([
    request(origin, `${workerPath}/reserve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${agentToken}` },
      body: {
        submissionDigest: cliSubmitted.json.submission.submissionDigest,
        webhookEventId: 'webhook-concurrent-delivery',
      },
    }),
    request(origin, `${workerPath}/reserve`, {
      method: 'POST',
      role: 'import_agent',
      body: {
        submissionDigest: cliSubmitted.json.submission.submissionDigest,
        webhookEventId: 'webhook-concurrent-delivery',
      },
    }),
  ])
  assert.deepEqual(
    reservations.map((result) => result.json.worker.action).sort(),
    ['busy', 'create'],
    'concurrent duplicate deliveries receive only one create reservation',
  )
  const firstReservation = reservations.find((result) => result.json.worker.action === 'create')
    .json.worker
  clock = new Date('2026-08-30T01:05:01.000Z')
  const replacementReservation = await request(origin, `${workerPath}/reserve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${agentToken}` },
    body: {
      submissionDigest: cliSubmitted.json.submission.submissionDigest,
      webhookEventId: 'webhook-after-create-bind-crash',
    },
  })
  assert.equal(replacementReservation.status, 200)
  assert.equal(replacementReservation.json.worker.action, 'create')
  assert.notEqual(
    replacementReservation.json.worker.reservationToken,
    firstReservation.reservationToken,
  )
  const staleBind = await request(origin, `${workerPath}/bind`, {
    method: 'POST',
    headers: { authorization: `Bearer ${agentToken}` },
    body: {
      submissionDigest: cliSubmitted.json.submission.submissionDigest,
      reservationToken: firstReservation.reservationToken,
      ampThreadId: orbThreadId,
    },
  })
  assert.equal(staleBind.status, 409)
  assert.equal(staleBind.json.code, 'SOURCE_INTAKE_WORKER_RESERVATION_INVALID')
  const bound = await request(origin, `${workerPath}/bind`, {
    method: 'POST',
    role: 'import_agent',
    body: {
      submissionDigest: cliSubmitted.json.submission.submissionDigest,
      reservationToken: replacementReservation.json.worker.reservationToken,
      ampThreadId: orbThreadId,
    },
  })
  assert.equal(bound.status, 200)
  assert.equal(bound.json.worker.ampThreadId, orbThreadId)
  const resumed = await request(origin, `${workerPath}/reserve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${agentToken}` },
    body: {
      submissionDigest: cliSubmitted.json.submission.submissionDigest,
      webhookEventId: 'webhook-resume-delivery',
    },
  })
  assert.equal(resumed.json.worker.action, 'resume')
  assert.equal(resumed.json.worker.ampThreadId, orbThreadId)

  const unboundClaim = await request(
    origin,
    `/api/import-agent-source-intakes/${cliSubmissionId}/claim`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${agentToken}` },
      body: { leaseSeconds: 60 },
    },
  )
  assert.equal(unboundClaim.status, 403)
  assert.equal(unboundClaim.json.code, 'SOURCE_INTAKE_THREAD_MISMATCH')
  const concurrentClaims = await Promise.all([
    request(origin, `/api/import-agent-source-intakes/${cliSubmissionId}/claim`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${agentToken}`,
        'x-amp-thread-id': orbThreadId,
      },
      body: { leaseSeconds: 60 },
    }),
    request(origin, `/api/import-agent-source-intakes/${cliSubmissionId}/claim`, {
      method: 'POST',
      role: 'import_agent',
      headers: { 'x-amp-thread-id': orbThreadId },
      body: { leaseSeconds: 60 },
    }),
  ])
  assert.deepEqual(
    concurrentClaims.map((result) => result.status).sort(),
    [200, 409],
    'concurrent claim attempts produce exactly one active lease',
  )
  const activeBoundClaim = concurrentClaims.find((result) => result.status === 200).json.claim
  const wrongThreadHeaders = {
    authorization: `Bearer ${agentToken}`,
    'x-source-intake-lease': activeBoundClaim.leaseToken,
    'x-amp-thread-id': 'T-22222222-2222-4222-8222-222222222222',
  }
  for (const [pathname, method, bodyValue] of [
    [`/api/import-agent-source-intakes/${cliSubmissionId}`, 'GET', null],
    [`/api/import-agent-source-intakes/${cliSubmissionId}/files/${cliSubmitted.json.submission.snapshot.files[0].id}`, 'GET', null],
    [`/api/import-agent-source-intakes/${cliSubmissionId}/heartbeat`, 'POST', { leaseSeconds: 60 }],
    [`/api/import-agent-source-intakes/${cliSubmissionId}/needs-owner`, 'POST', {
      reasonCode: 'WRONG_THREAD', message: 'must fail before state change',
    }],
    [`/api/import-agent-source-intakes/${cliSubmissionId}/handoff`, 'POST', {
      paperId: 'paper-wrong-thread',
      initialization: initializationReceipt(
        cliSubmitted.json.submission,
        'paper-wrong-thread',
        'T-22222222-2222-4222-8222-222222222222',
      ),
    }],
  ]) {
    const mismatched = await request(origin, pathname, {
      method,
      headers: wrongThreadHeaders,
      ...(bodyValue ? { body: bodyValue } : {}),
    })
    assert.equal(mismatched.status, 403, `${method} ${pathname} rejects another Amp thread`)
    assert.equal(mismatched.json.code, 'SOURCE_INTAKE_THREAD_MISMATCH')
  }
  clock = new Date('2026-08-30T01:06:02.000Z')
  assert.equal(store.listQueue().some((item) => item.submissionId === cliSubmissionId), true)
  const cliInbox = path.join(
    path.resolve(import.meta.dirname, 'import-pipeline/source-intake-inbox'),
    cliSubmissionId,
  )
  const cliPaperId = `paper-source-intake-verifier-${process.pid}`
  const cliPaperDirectory = path.join(
    path.resolve(import.meta.dirname, 'import-pipeline/papers'),
    cliPaperId,
  )
  try {
    const listOutput = await runSourceIntakeCli(origin, ['list'])
    assert.match(listOutput, new RegExp(cliSubmissionId))
    const claimOutput = await runSourceIntakeCli(origin, ['claim', cliSubmissionId])
    const claimResult = JSON.parse(claimOutput)
    assert.equal(claimResult.submissionId, cliSubmissionId)
    assert.equal(claimResult.state, 'claimed')
    assert.doesNotMatch(claimOutput, /source-lease-/)
    const downloadOutput = await runSourceIntakeCli(origin, ['download', cliSubmissionId])
    const downloadResult = JSON.parse(downloadOutput)
    assert.equal(downloadResult.submissionId, cliSubmissionId)
    assert.equal(downloadResult.downloadedFiles.length, 1)
    const downloadedManifest = JSON.parse(readFileSync(path.join(cliInbox, 'manifest.json'), 'utf8'))
    assert.equal(downloadedManifest.submission.id, cliSubmissionId)
    assert.equal(downloadedManifest.ampThreadId, orbThreadId)
    assert.equal(downloadedManifest.files[0].sha256, digest(cliPdf))
    const initOutput = await runSourceIntakeCli(origin, [
      'init',
      cliSubmissionId,
      '--paper-id',
      cliPaperId,
    ])
    assert.match(initOutput, new RegExp(`INITIALIZED ${cliPaperId}`))
    const initializationReceiptFile = path.join(
      cliPaperDirectory,
      'signals/source-intake-initialization.json',
    )
    const localInitialization = JSON.parse(readFileSync(initializationReceiptFile, 'utf8'))
    assert.equal(localInitialization.submissionId, cliSubmissionId)
    assert.equal(localInitialization.submissionDigest, cliSubmitted.json.submission.submissionDigest)
    assert.equal(localInitialization.schemaVersion, 'source-intake-initialization-v2')
    assert.equal(localInitialization.ampThreadId, orbThreadId)
    const handoffOutput = await runSourceIntakeCli(origin, [
      'handoff',
      cliSubmissionId,
      '--paper-id',
      cliPaperId,
    ])
    const handoffResult = JSON.parse(handoffOutput)
    assert.deepEqual(handoffResult, {
      submissionId: cliSubmissionId,
      state: 'handed_off',
      paperId: cliPaperId,
    })
    assert.equal(existsSync(path.join(cliInbox, 'claim.json')), false)
    const handedOffDetail = await request(origin, `/api/source-intakes/${cliIntakeId}`, {
      role: 'owner',
    })
    assert.equal(handedOffDetail.json.intake.orbWorker.state, 'handed_off')
    assert.equal(handedOffDetail.json.intake.orbWorker.ampThreadId, orbThreadId)
    assert.equal(handedOffDetail.json.intake.orbWorker.paperId, cliPaperId)
  } finally {
    rmSync(cliInbox, { recursive: true, force: true })
    rmSync(cliPaperDirectory, { recursive: true, force: true })
  }

  const storedQuestion = store.fileForDownload
  assert.equal(typeof storedQuestion, 'function')
  assert.ok(readFileSync(path.join(tempRoot, 'import-ops.sqlite')).length > 0)
  console.log('PASS source intake owner, upload, queue, claim, lease, and handoff contract')
} finally {
  await new Promise((resolve) => server.close(resolve))
  rmSync(tempRoot, { recursive: true, force: true })
}
