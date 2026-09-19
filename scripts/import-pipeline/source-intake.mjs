#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { assertListeningAudioManifest } from '../../server/paper-import/listeningAudioEvidence.mjs'
import { prepareNck1AnalyzedPackageReview } from '../../server/paper-import/analyzedPackage.mjs'
import { readAnalyzedPackageArchive } from '../../server/source-intake/analyzedPackageArchive.mjs'
import { parseStrictPackageJson } from '../../server/paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import { buildNck1ReviewProjection } from '../../server/import-review/revisionProjection.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { inspectNck1Materialization } from './nck1-docx-materialize.mjs'
import { invalidateParagraphSummariesForListeningSupplement } from './paragraph-summary-rebinding.mjs'
import { acquireSourceIntakeLock, maintainSourceIntakeLease, runSourceIntakeChild } from './source-intake-lease.mjs'

const inboxRoot = path.join(import.meta.dirname, 'source-intake-inbox')
const universalCli = path.join(import.meta.dirname, 'universal-nck1.mjs')
const reviewCli = path.join(import.meta.dirname, 'review.mjs')
const papersRoot = path.join(import.meta.dirname, 'papers')
const submissionIdPattern = /^submission-[a-f0-9-]{36}$/
const paperIdPattern = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/
const ampThreadIdPattern = /^T-[a-f0-9-]{36}$/

function fail(message) {
  throw new Error(message)
}

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] || null
}

function origin() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(value)) {
    fail('QUESTION_BANK_IMPORT_OPS_ORIGIN must be an http(s) origin')
  }
  return value
}

function token() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  if (!value) fail('QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN is required')
  return value
}

function ampThreadId() {
  const value = String(process.env.AMP_THREAD_ID || '').trim()
  if (value && !ampThreadIdPattern.test(value)) fail('AMP_THREAD_ID is invalid')
  return value || null
}

function validSubmissionId(submissionId) {
  if (!submissionIdPattern.test(submissionId || '')) {
    fail('A valid source-intake submissionId is required')
  }
  return submissionId
}

function submissionDirectory(submissionId) {
  validSubmissionId(submissionId)
  return path.join(inboxRoot, submissionId)
}

function receiptPath(submissionId) {
  return path.join(submissionDirectory(submissionId), 'claim.json')
}

function manifestPath(submissionId) {
  return path.join(submissionDirectory(submissionId), 'manifest.json')
}

function writePrivateJson(filePath, value) {
  const directory = path.dirname(filePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  const file = openSync(temporaryPath, 'r')
  try { fsyncSync(file) } finally { closeSync(file) }
  renameSync(temporaryPath, filePath)
  chmodSync(filePath, 0o600)
  const parent = openSync(directory, 'r')
  try { fsyncSync(parent) } finally { closeSync(parent) }
}

function readClaim(submissionId) {
  const filePath = receiptPath(submissionId)
  if (!existsSync(filePath)) fail(`Claim receipt is missing: ${submissionId}`)
  const claim = JSON.parse(readFileSync(filePath, 'utf8'))
  if (
    claim.submissionId !== submissionId
    || typeof claim.leaseToken !== 'string'
    || !claim.leaseToken
    || (claim.ampThreadId != null && !ampThreadIdPattern.test(claim.ampThreadId))
  ) fail(`Claim receipt is invalid: ${submissionId}`)
  const runtimeThreadId = ampThreadId()
  if (claim.ampThreadId && claim.ampThreadId !== runtimeThreadId) {
    fail(`Claim receipt belongs to another Amp thread: ${submissionId}`)
  }
  return claim
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function assertSubmissionDigest(submission) {
  if (
    !submission?.snapshot
    || digestJson(submission.snapshot) !== submission.submissionDigest
  ) fail(`Submission snapshot digest does not match: ${submission?.id || 'unknown'}`)
  return submission
}

async function api(pathname, init = {}, { lease = null, binary = false } = {}) {
  const threadId = ampThreadId()
  const response = await fetch(`${origin()}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      ...(lease ? { 'x-source-intake-lease': lease } : {}),
      ...(threadId ? { 'x-amp-thread-id': threadId } : {}),
      ...(init.headers || {}),
    },
  })
  if (binary && response.ok) {
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      sha256: response.headers.get('x-source-file-sha256'),
    }
  }
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    fail(`${response.status} ${body?.code || ''} ${body?.error || body || 'Source intake API failed'}`.trim())
  }
  return body
}

async function list() {
  const result = await api('/api/import-agent-source-intakes')
  console.log(JSON.stringify(result, null, 2))
}

async function claim(submissionId) {
  validSubmissionId(submissionId)
  const threadId = ampThreadId()
  const result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/claim`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaseSeconds: 1800 }),
    },
  )
  assertSubmissionDigest(result.submission)
  writePrivateJson(receiptPath(submissionId), {
    schemaVersion: threadId
      ? 'eqbank-source-intake-claim-v2'
      : 'eqbank-source-intake-claim-v1',
    submissionId,
    ...(threadId ? { ampThreadId: threadId } : {}),
    leaseToken: result.claim.leaseToken,
    leaseExpiresAt: result.claim.leaseExpiresAt,
  })
  writePrivateJson(manifestPath(submissionId), {
    schemaVersion: threadId
      ? 'eqbank-source-intake-download-v2'
      : 'eqbank-source-intake-download-v1',
    ...(threadId ? { ampThreadId: threadId } : {}),
    submission: result.submission,
    files: [],
  })
  console.log(JSON.stringify({
    submissionId,
    state: result.submission.state,
    revisionNumber: result.submission.revisionNumber,
    submissionDigest: result.submission.submissionDigest,
    leaseExpiresAt: result.claim.leaseExpiresAt,
    receipt: path.relative(process.cwd(), receiptPath(submissionId)),
  }, null, 2))
}

async function heartbeat(submissionId, seconds = 1800) {
  const claimReceipt = readClaim(submissionId)
  const result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/heartbeat`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaseSeconds: seconds }),
    },
    { lease: claimReceipt.leaseToken },
  )
  writePrivateJson(receiptPath(submissionId), {
    ...claimReceipt,
    leaseExpiresAt: result.claim.leaseExpiresAt,
  })
  return result.claim
}

function safeLocalFileName(file, index) {
  const extension = path.extname(file.fileName).toLowerCase()
  return `${String(index + 1).padStart(2, '0')}-${file.role}${extension}`
}

async function download(submissionId) {
  const claimReceipt = readClaim(submissionId)
  await heartbeat(submissionId)
  const result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}`,
    {},
    { lease: claimReceipt.leaseToken },
  )
  const submission = assertSubmissionDigest(result.submission)
  const directory = submissionDirectory(submissionId)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const files = []
  for (const [index, file] of (submission.snapshot.files || []).entries()) {
    const downloaded = await api(
      `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}`
        + `/files/${encodeURIComponent(file.id)}`,
      {},
      { lease: claimReceipt.leaseToken, binary: true },
    )
    const actualDigest = sha256(downloaded.bytes)
    if (
      downloaded.bytes.byteLength !== file.byteLength
      || actualDigest !== file.sha256
      || downloaded.sha256 !== file.sha256
    ) fail(`Downloaded bytes do not match submission snapshot: ${file.id}`)
    const localName = safeLocalFileName(file, index)
    const localPath = path.join(directory, localName)
    writeFileSync(localPath, downloaded.bytes, { mode: 0o600 })
    chmodSync(localPath, 0o600)
    files.push({
      id: file.id,
      role: file.role,
      fileName: file.fileName,
      localPath,
      mediaType: file.mediaType,
      sha256: file.sha256,
      byteLength: file.byteLength,
    })
  }
  writePrivateJson(manifestPath(submissionId), {
    schemaVersion: claimReceipt.ampThreadId
      ? 'eqbank-source-intake-download-v2'
      : 'eqbank-source-intake-download-v1',
    ...(claimReceipt.ampThreadId ? { ampThreadId: claimReceipt.ampThreadId } : {}),
    submission,
    files,
  })
  console.log(JSON.stringify({
    submissionId,
    submissionDigest: submission.submissionDigest,
    downloadedFiles: files.map(({ role, localPath, sha256: digestValue, byteLength }) => ({
      role,
      localPath,
      sha256: digestValue,
      byteLength,
    })),
  }, null, 2))
}

function readDownloadManifest(submissionId) {
  const filePath = manifestPath(submissionId)
  if (!existsSync(filePath)) fail(`Download manifest is missing: ${submissionId}`)
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  const claim = readClaim(submissionId)
  if (
    manifest.submission?.id !== submissionId
    || manifest.ampThreadId !== claim.ampThreadId
    || !Array.isArray(manifest.files)
    || manifest.files.length < 1
  ) fail(`Download manifest is incomplete: ${submissionId}`)
  assertSubmissionDigest(manifest.submission)
  const expectedFiles = (manifest.submission.snapshot.files || []).map((file) => ({
    id: file.id,
    role: file.role,
    fileName: file.fileName,
    mediaType: file.mediaType,
    sha256: file.sha256,
    byteLength: file.byteLength,
  })).sort((left, right) => left.id.localeCompare(right.id))
  const downloadedFiles = manifest.files.map((file) => ({
    id: file.id,
    role: file.role,
    fileName: file.fileName,
    mediaType: file.mediaType,
    sha256: file.sha256,
    byteLength: file.byteLength,
  })).sort((left, right) => left.id.localeCompare(right.id))
  if (JSON.stringify(downloadedFiles) !== JSON.stringify(expectedFiles)) {
    fail(`Download manifest does not contain the complete submission snapshot: ${submissionId}`)
  }
  for (const file of manifest.files) {
    if (
      !existsSync(file.localPath)
      || readFileSync(file.localPath).byteLength !== file.byteLength
      || sha256(readFileSync(file.localPath)) !== file.sha256
    ) fail(`Downloaded source file changed: ${file.localPath}`)
  }
  return manifest
}

function progressPath(submissionId) {
  return path.join(submissionDirectory(submissionId), 'automation-progress.json')
}

function readProgress(submissionId) {
  const filePath = progressPath(submissionId)
  return existsSync(filePath) ? readLocalJson(filePath, 'Automation progress') : { operations: {} }
}

function recordOperation(submissionId, operation, state, extra = {}) {
  const progress = readProgress(submissionId)
  writePrivateJson(progressPath(submissionId), {
    schemaVersion: 'source-intake-automation-progress-v1',
    submissionId,
    operations: {
      ...(progress.operations || {}),
      [operation]: { state, at: new Date().toISOString(), ...extra },
    },
  })
}

function verifiedMaterialization(paperId) {
  const paperDirectory = path.join(papersRoot, paperId)
  const manifest = readLocalJson(path.join(paperDirectory, 'universal-source-manifest.json'), 'Universal source manifest')
  return inspectNck1Materialization({ paperDir: paperDirectory, manifest })
}

async function resolvePaperId(submissionId, requested, snapshot, manifest = null) {
  const retained = [...new Set(Object.values(readProgress(submissionId).operations || {})
    .map((entry) => entry.paperId).filter(Boolean))]
  if (retained.length > 1 || (requested && retained.length && retained[0] !== requested)) {
    fail('Progress paper identity conflicts; preserve the workspace, do not choose another ID')
  }
  let expected = snapshot?.targetPaperId || null
  if (snapshot?.mode === 'analyzed_package' && !expected) {
    if (!manifest) return requested || retained[0] || null
    const archive = manifest.files.find((file) => file.role === 'analyzed_package')
    if (!archive || manifest.files.length !== 1) fail('Expected exactly one analyzed-package ZIP')
    await readAnalyzedPackageArchive(archive.localPath)
    const bytes = execFileSync('python3', ['-c',
      'import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("package.json"))',
      archive.localPath], { timeout: 60_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    expected = parseStrictPackageJson(bytes).paperId
    if (!paperIdPattern.test(expected || '')) fail('Analyzed package has no valid paperId')
  }
  const selected = requested || retained[0] || expected
    || (snapshot && (!snapshot.mode || snapshot.mode === 'new_paper')
      ? `paper-${submissionId.slice('submission-'.length)}` : null)
  if (expected && selected !== expected) fail('paperId must equal the immutable target or package identity')
  if (selected && !paperIdPattern.test(selected)) fail('A valid paperId is required')
  return selected
}

async function inspectAutomation(submissionId, paperId) {
  if (paperId && !paperIdPattern.test(paperId)) fail('Invalid --paper-id; omit it to resolve from the submission')
  paperId = await resolvePaperId(submissionId, paperId)
  const steps = []
  const progress = readProgress(submissionId)
  for (const [step, entry] of Object.entries(progress.operations || {})) {
    if (entry.state === 'unknown') return { submissionId, paperId, steps, blocked: { step, reason: 'operation_outcome_unknown', detail: entry.detail }, next: 'Reconcile the preserved outcome before clearing the failure record; do not replay automatically.' }
  }
  const claimFile = receiptPath(submissionId)
  const handedOff = progress.operations?.handoff
  if (handedOff?.state === 'completed') {
    if (handedOff.ampThreadId !== ampThreadId()) fail('Handoff receipt belongs to another Amp thread')
    return { submissionId, paperId: handedOff.paperId, steps, state: 'handed_off', next: 'review_preflight' }
  }
  if (handedOff?.state === 'started') return { submissionId, paperId, steps,
    blocked: { step: 'handoff', reason: 'operation_outcome_unknown' }, next: 'Reconcile handoff; do not replay.' }
  if (!existsSync(claimFile)) {
    if (Object.keys(progress.operations || {}).length > 0
      || existsSync(manifestPath(submissionId))
      || (paperId && existsSync(initializationReceiptPath(paperId)))) {
      return { submissionId, paperId, steps, blocked: { step: 'claim', reason: 'claim_outcome_unknown' }, next: 'Confirm the claim in the read-only source ledger before replaying.' }
    }
    const queue = await api('/api/import-agent-source-intakes')
    const queued = queue.submissions?.find((item) => item.submissionId === submissionId)
    if (!queued) return { submissionId, paperId, steps, blocked: { step: 'claim', reason: 'submission_not_visible_in_queue' }, next: 'Inspect the source ledger state; do not claim automatically.' }
    steps.push({ step: 'claim', state: 'pending', submissionDigest: queued.submissionDigest })
    return { submissionId, paperId, steps, next: 'claim' }
  }
  const claimReceipt = readClaim(submissionId)
  let current
  try {
    current = assertSubmissionDigest((await api(
      `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}`,
      {}, { lease: claimReceipt.leaseToken },
    )).submission)
  } catch (error) {
    if (!error.message.includes('SOURCE_INTAKE_CLAIM_INVALID')) throw error
    return { submissionId, paperId, steps, blocked: { step: 'lease', reason: 'claim_invalid_or_expired' },
      next: 'Reconcile the existing claim and binding read-only; never auto-reclaim or discard receipts.' }
  }
  paperId = await resolvePaperId(submissionId, paperId, current.snapshot)
  steps.push({ step: 'claim', state: 'verified', submissionDigest: current.submissionDigest })
  let manifest
  try {
    manifest = readDownloadManifest(submissionId)
    if (manifest.submission.submissionDigest !== current.submissionDigest) fail('Downloaded submission digest drifted')
    steps.push({ step: 'download', state: 'verified' })
  } catch (error) {
    const rawManifest = existsSync(manifestPath(submissionId))
      ? readLocalJson(manifestPath(submissionId), 'Download manifest') : null
    const legalPlaceholder = rawManifest
      && rawManifest.submission?.id === submissionId
      && rawManifest.submission?.submissionDigest === current.submissionDigest
      && rawManifest.ampThreadId === claimReceipt.ampThreadId
      && Array.isArray(rawManifest.files) && rawManifest.files.length === 0
      && !(rawManifest.submission.snapshot.files || []).some((file, index) =>
        existsSync(path.join(submissionDirectory(submissionId), safeLocalFileName(file, index))))
      && !progress.operations?.download
    if (progress.operations?.download?.state === 'started') return { submissionId, paperId, steps, blocked: { step: 'download', reason: 'download_outcome_unknown', detail: error.message }, next: 'Preserve the partial download and inspect it before replaying.' }
    if (legalPlaceholder) return { submissionId, paperId, steps, next: 'download' }
    return { submissionId, paperId, steps, blocked: { step: 'download', reason: 'download_evidence_invalid', detail: error.message }, next: 'Inspect the preserved download; do not overwrite it.' }
  }
  paperId = await resolvePaperId(submissionId, paperId, current.snapshot, manifest)
  if (!paperId) fail('Submission does not define a supported paper identity')
  try {
    initializationReceipt(manifest, paperId)
    steps.push({ step: 'init', state: 'verified' })
  } catch (error) {
    if (
      progress.operations?.init?.state === 'completed'
      && manifest.files.some(({ role }) => role === 'listening_audio')
    ) {
      // A progress marker cannot replace the finalized source/audio evidence.
      return { submissionId, paperId, steps, blocked: { step: 'listening_review', reason: 'awaiting_agent_content_review', detail: error.message }, next: 'Inspect staged audio and source identity; materialize the authoritative dialogue if needed, then explicitly finalize listening. Do not rerun init or ASR.' }
    }
    if (progress.operations?.init?.state === 'started') return { submissionId, paperId, steps, blocked: { step: 'init', reason: 'initialization_outcome_unknown', detail: error.message }, next: 'Inspect the preserved workspace before replaying initialization.' }
    const existingReceipt = existsSync(initializationReceiptPath(paperId))
      ? readLocalJson(initializationReceiptPath(paperId), 'Source-intake initialization receipt') : null
    if (progress.operations?.init?.state === 'completed' || existingReceipt?.submissionId === submissionId) return { submissionId, paperId, steps, blocked: { step: 'init', reason: 'initialization_evidence_invalid', detail: error.message }, next: 'Inspect completed initialization evidence; do not reinstall the workspace.' }
    const paperDirectory = path.join(papersRoot, paperId)
    if (manifest.submission.snapshot.mode !== 'analyzed_package' && existsSync(paperDirectory)) return { submissionId, paperId, steps, blocked: { step: 'init', reason: 'initialization_evidence_invalid', detail: error.message }, next: 'Inspect the existing workspace; do not overwrite it.' }
    return { submissionId, paperId, steps, next: 'init' }
  }
  const mode = manifest.submission.snapshot.mode
  if (mode === 'analyzed_package') return { submissionId, paperId, steps, state: 'source_ready', next: 'stop_before_analysis_dispatch' }
  const materialization = verifiedMaterialization(paperId)
  if (!materialization) {
    if (progress.operations?.materialize?.state === 'started') return { submissionId, paperId, steps, blocked: { step: 'materialize', reason: 'materialization_outcome_unknown' }, next: 'Inspect producer evidence before replaying the expensive operation.' }
    return { submissionId, paperId, steps, next: 'materialize' }
  }
  steps.push({ step: 'materialize', state: 'verified', ...materialization })
  if (materialization.outputState === 'agent_modified') return { submissionId, paperId, steps, blocked: { step: 'source_review', reason: 'agent_modified' }, next: 'Review the modified materialization; automation will not overwrite it.' }
  if (materialization.disposition !== 'ready_for_verification') return { submissionId, paperId, steps, blocked: { step: 'source_review', reason: materialization.disposition || 'manual_source_review_required' }, next: 'Complete the required source/OCR visual review; automation will not assert it.' }
  const config = readLocalJson(path.join(papersRoot, paperId, 'config.json'), 'Paper config')
  return {
    submissionId,
    paperId,
    steps,
    state: 'source_ready',
    importProfile: config.importProfile || null,
    next: config.importProfile === 'public-paper-v1'
      ? `node scripts/import-pipeline/review.mjs prepare-summaries ${paperId} --output <request.json>`
      : 'stop_before_analysis_dispatch',
  }
}

async function automationStatus(submissionId, paperId) {
  const status = await inspectAutomation(submissionId, paperId)
  const id = status.paperId
  const intake = `node scripts/import-pipeline/source-intake.mjs`
  const review = `node scripts/import-pipeline/review.mjs`
  status.nextCommand = null
  if (!status.blocked && ['claim', 'download', 'init', 'materialize'].includes(status.next)) {
    status.nextCommand = `${intake} continue ${submissionId}${id ? ` --paper-id ${id}` : ''}`
  }
  if (status.state === 'handed_off') status.nextCommand = `${review} preflight ${id}`
  if (status.steps.some((step) => step.step === 'init' && step.state === 'verified')
    && (!status.blocked || status.blocked.step === 'source_review')) {
    status.handoffCommand = `${intake} handoff ${submissionId} --paper-id ${id}`
    status.nextCommand = status.handoffCommand
    status.afterHandoff = `${review} preflight ${id}`
  }
  if (existsSync(receiptPath(submissionId)) && status.state !== 'handed_off') {
    const claim = readClaim(submissionId)
    status.lease = { expiresAt: claim.leaseExpiresAt,
      renewalCommand: status.blocked?.step === 'lease' ? null : `${intake} heartbeat ${submissionId}`,
      instruction: 'Renew before source/audio review and at least every 10 minutes while claimed. After verified initialization, hand off before waiting for summary/metadata generation or Review. Never automatically reacquire an expired claim.' }
  }
  if (status.blocked?.reason === 'awaiting_agent_content_review') {
    const paperDir = path.join(papersRoot, id)
    const reviewPath = path.join(submissionDirectory(submissionId), 'listening-content-review.json')
    status.tasks = [
      { action: 'materialize_authoritative_dialogue_if_missing', command: `node scripts/import-pipeline/universal-nck1.mjs materialize ${id}` },
      { action: 'review_audio_content', asrPath: path.join(paperDir, 'materialization/listening-audio/asr-v1.json'),
        sourcePath: path.join(paperDir, 'materialization/nck1-source-materialization-v1.json'), outputPath: reviewPath,
        instruction: 'Write a genuine listening-audio-content-review-v1 with import_agent identity, actual ASR digest and scope; never fabricate pass. Later audio remains unchecked.' },
      { action: 'finalize_listening_after_review', command: `${intake} finalize-listening ${submissionId} --paper-id ${id} --review ${JSON.stringify(reviewPath)}` },
      { action: 'recheck', command: `${intake} status ${submissionId}` },
    ]
  }
  return status
}

function runCaptured(args, signal) {
  const script = path.isAbsolute(args[0] || '') ? args.shift() : import.meta.filename
  return runSourceIntakeChild([script, ...args], {
    cwd: path.resolve(import.meta.dirname, '../..'), signal,
  })
}

async function continueAutomation(submissionId, paperId) {
  if (paperId && !paperIdPattern.test(paperId)) fail('Invalid --paper-id; omit it to resolve from the submission')
  const directory = submissionDirectory(submissionId)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lockPath = path.join(directory, 'continue.lock')
  let lock
  let paperLock
  let leaseKeeper = null
  const lockPaper = async () => {
    if (!paperId || paperLock) return
    try { paperLock = await acquireSourceIntakeLock(path.join(inboxRoot, `${paperId}.continue.lock`)) } catch (error) {
      if (error.message.includes('flock executable is unavailable')) throw error
      fail(`Another continue is active for paper: ${paperId}`)
    }
  }
  try {
    try { lock = await acquireSourceIntakeLock(lockPath) } catch (error) {
      if (error.message.includes('flock executable is unavailable')) throw error
      fail(`Another continue is active: ${submissionId}`)
    }
    paperId = await resolvePaperId(submissionId, paperId)
    await lockPaper()
    let status = await automationStatus(submissionId, paperId)
    if (status.blocked || status.state === 'source_ready' || status.state === 'handed_off') return status
    paperId = status.paperId
    const runStep = async (step, args) => {
      recordOperation(submissionId, step, 'started', { paperId })
      try {
        const result = await runCaptured(args, leaseKeeper?.signal)
        if (result.stderr.trim()) console.error(result.stderr.trim())
        if (leaseKeeper) {
          await leaseKeeper.stop()
          if (leaseKeeper.failure) throw leaseKeeper.failure
          leaseKeeper = null
        }
        recordOperation(submissionId, step, 'completed', { paperId })
      } catch (error) {
        if (leaseKeeper) {
          await leaseKeeper.stop()
          error = leaseKeeper.failure || error
          leaseKeeper = null
        }
        recordOperation(submissionId, step, 'unknown', { paperId, detail: error.message })
        return { failed: { step, reason: 'step_failed', detail: error.message } }
      }
      return null
    }
    if (status.next === 'claim') {
      const failure = await runStep('claim', ['claim', submissionId])
      if (failure) return { submissionId, paperId, ...failure, next: 'Inspect the claim outcome before replaying.' }
      status = await automationStatus(submissionId, paperId)
      paperId = status.paperId
    }
    if (status.next === 'download') {
      const failure = await runStep('download', ['download', submissionId])
      if (failure) return { submissionId, paperId, ...failure, next: 'Inspect the download outcome before replaying.' }
      status = await automationStatus(submissionId, paperId)
      paperId = status.paperId
    }
    if (status.blocked || status.state === 'handed_off') return status
    if (!paperId) fail('Paper identity must be resolved before initialization')
    await lockPaper()
    const maintainLease = () => maintainSourceIntakeLease(() => heartbeat(submissionId))
    if (status.next === 'init') {
      try { leaseKeeper = await maintainLease() } catch (error) {
        return { submissionId, paperId, blocked: { step: 'lease', reason: 'heartbeat_failed', detail: error.message }, next: 'Confirm the lease before any write.' }
      }
      const failure = await runStep('init', ['init', submissionId, '--paper-id', paperId])
      if (failure) return { submissionId, paperId, ...failure, next: 'Inspect initialization evidence before replaying.' }
      status = await automationStatus(submissionId, paperId)
    }
    if (status.next === 'materialize') {
      try { leaseKeeper = await maintainLease() } catch (error) {
        return { submissionId, paperId, blocked: { step: 'lease', reason: 'heartbeat_failed', detail: error.message }, next: 'Confirm the lease before any write.' }
      }
      const failure = await runStep('materialize', [universalCli, 'materialize', paperId])
      if (failure) return { submissionId, paperId, ...failure, next: 'Inspect producer evidence before replaying.' }
      status = await automationStatus(submissionId, paperId)
    }
    return status
  } finally {
    if (leaseKeeper) await leaseKeeper.stop()
    if (paperLock) await paperLock.release()
    if (lock) await lock.release()
  }
}

function initializationReceiptPath(paperId, paperDirectory = path.join(papersRoot, paperId)) {
  if (!paperIdPattern.test(paperId || '')) fail('A valid paperId is required')
  return path.join(paperDirectory, 'signals', 'source-intake-initialization.json')
}

function readLocalJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing: ${filePath}`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is invalid: ${filePath}`)
  }
}

function identityKey(value) {
  return [value.role, value.sha256, value.byteLength].join(':')
}

function analyzedPackageIdentity(downloadManifest, projection) {
  const sourceFile = downloadManifest.files.find(({ role }) => role === 'analyzed_package')
  if (!sourceFile || downloadManifest.files.length !== 1) {
    fail('Analyzed-package intake must contain exactly one ZIP')
  }
  return {
    archiveSha256: sourceFile.sha256,
    archiveByteLength: sourceFile.byteLength,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
  }
}

function assertInitializedWorkspace(
  downloadManifest,
  paperId,
  { paperDirectory = path.join(papersRoot, paperId), preparedIdentity = null } = {},
) {
  const config = readLocalJson(path.join(paperDirectory, 'config.json'), 'Paper config')
  const sourceManifest = readLocalJson(
    path.join(paperDirectory, 'universal-source-manifest.json'),
    'Universal source manifest',
  )
  if (config.paperId !== paperId || sourceManifest.paperId !== paperId) {
    fail(`Initialized workspace paperId does not match: ${paperId}`)
  }
  if (downloadManifest.submission.snapshot.mode === 'analyzed_package') {
    if (
      sourceManifest.schemaVersion !== 'nck1-analyzed-package-review-source-v1'
      || sourceManifest.sourceKind !== 'nck1-analyzed-package'
      || sourceManifest.paperId !== paperId
      || !sourceManifest.members?.some(({ memberId }) => memberId === 'package-manifest')
    ) fail(`Initialized analyzed-package workspace is incomplete: ${paperId}`)
    const projection = buildNck1ReviewProjection(paperDirectory, { requireAnalyses: true })
    const actualIdentity = analyzedPackageIdentity(downloadManifest, projection)
    if (preparedIdentity
      && JSON.stringify(actualIdentity) !== JSON.stringify(preparedIdentity)) {
      fail(`Initialized analyzed-package workspace identity changed: ${paperId}`)
    }
    return actualIdentity
  }
  const sourceDocuments = (sourceManifest.documents || [])
    .filter((document) => !document.renditionOf)
  const sourceArtifacts = [...sourceDocuments]
  if (sourceManifest.schemaVersion === 'universal-nck1-source-manifest-v2') {
    assertListeningAudioManifest(paperDirectory, sourceManifest)
    const originalAudio = sourceManifest.attachments.find((attachment) =>
      attachment.role === 'listening_audio_original')
    sourceArtifacts.push({
      role: 'listening_audio',
      sha256: originalAudio.sha256,
      byteLength: originalAudio.byteLength,
    })
  }
  const expectedIdentities = downloadManifest.files.map(identityKey).sort()
  const actualIdentities = sourceArtifacts.map(identityKey).sort()
  const supplement = downloadManifest.submission.snapshot.mode === 'listening_supplement'
  const identitiesMatch = supplement
    ? expectedIdentities.every((identity) => actualIdentities.includes(identity))
    : JSON.stringify(actualIdentities) === JSON.stringify(expectedIdentities)
  if (!identitiesMatch) {
    fail(`Initialized workspace does not use the claimed source files: ${paperId}`)
  }
  const directoryPrefix = `${path.resolve(paperDirectory)}${path.sep}`
  for (const document of sourceDocuments) {
    const filePath = path.resolve(paperDirectory, String(document.path || ''))
    if (!filePath.startsWith(directoryPrefix) || !existsSync(filePath)) {
      fail(`Initialized source file is missing: ${paperId}`)
    }
    if (statSync(filePath).isDirectory()) {
      fail(`Initialized source path is not a file: ${document.path}`)
    }
    const bytes = readFileSync(filePath)
    if (
      bytes.byteLength !== document.byteLength
      || sha256(bytes) !== document.sha256
    ) fail(`Initialized source file changed: ${document.path}`)
  }
}

function recordInitialization(downloadManifest, paperId, {
  paperDirectory = path.join(papersRoot, paperId),
  preparedIdentity = null,
  backupPath = null,
} = {}) {
  const actualPreparedIdentity = assertInitializedWorkspace(downloadManifest, paperId, {
    paperDirectory,
    preparedIdentity,
  })
  const threadId = downloadManifest.ampThreadId || null
  const receipt = {
    schemaVersion: threadId
      ? 'source-intake-initialization-v2'
      : 'source-intake-initialization-v1',
    submissionId: downloadManifest.submission.id,
    submissionDigest: downloadManifest.submission.submissionDigest,
    paperId,
    ...(threadId ? { ampThreadId: threadId } : {}),
    ...(downloadManifest.submission.snapshot.baseRevisionId
      ? { baseRevisionId: downloadManifest.submission.snapshot.baseRevisionId }
      : {}),
    ...(actualPreparedIdentity ? { preparedIdentity: actualPreparedIdentity } : {}),
    ...(backupPath ? { previousWorkspaceBackup: backupPath } : {}),
    recordedAt: new Date().toISOString(),
  }
  writePrivateJson(initializationReceiptPath(paperId, paperDirectory), receipt)
  return receipt
}

function initializationReceipt(downloadManifest, paperId) {
  const receipt = readLocalJson(
    initializationReceiptPath(paperId),
    'Source-intake initialization receipt',
  )
  const threadId = downloadManifest.ampThreadId || null
  if (
    receipt.schemaVersion !== (threadId
      ? 'source-intake-initialization-v2'
      : 'source-intake-initialization-v1')
    || receipt.submissionId !== downloadManifest.submission.id
    || receipt.submissionDigest !== downloadManifest.submission.submissionDigest
    || receipt.paperId !== paperId
    || (threadId && receipt.ampThreadId !== threadId)
    || receipt.baseRevisionId !== downloadManifest.submission.snapshot.baseRevisionId
  ) fail(`Local initialization receipt does not match: ${paperId}`)
  const preparedIdentity = assertInitializedWorkspace(downloadManifest, paperId)
  if (preparedIdentity
    && JSON.stringify(receipt.preparedIdentity) !== JSON.stringify(preparedIdentity)) {
    fail(`Local initialization receipt does not bind the prepared package: ${paperId}`)
  }
  return receipt
}

async function assertCurrentCorrectionTarget(snapshot) {
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(snapshot.targetPaperId)}`,
  )
  if (
    status.paperId !== snapshot.targetPaperId
    || status.latestRevisionId !== snapshot.baseRevisionId
    || status.latest?.id !== snapshot.baseRevisionId
  ) {
    fail('Review revision changed; start a new corrected-package upload')
  }
  if (!['awaiting_review', 'changes_requested', 'approved'].includes(status.latest.state)) {
    fail('Target revision is not available for correction')
  }
  return status
}

function analyzedPackageOutput(downloadManifest, paperId, identity, { idempotent = false } = {}) {
  return {
    submissionId: downloadManifest.submission.id,
    paperId,
    state: 'initialized_locally',
    mode: 'analyzed_package',
    ...(idempotent ? { idempotent: true } : {}),
    sourceDigest: identity.sourceDigest,
    candidateDigest: identity.candidateDigest,
    analysisDigest: identity.analysisDigest,
    next: `node scripts/import-pipeline/source-intake.mjs handoff ${downloadManifest.submission.id} --paper-id ${paperId}`,
  }
}

function provenance(snapshot) {
  return snapshot.sources.map((source) => [
    source.platform,
    source.sourceName,
    source.sourceUrl,
  ].filter(Boolean).join(': ')).join('; ')
}

async function initialize(submissionId, paperId) {
  if (!paperIdPattern.test(paperId || '')) fail('init requires --paper-id paper-…')
  const manifest = readDownloadManifest(submissionId)
  await heartbeat(submissionId)
  const mode = manifest.submission.snapshot.mode
  const supplement = mode === 'listening_supplement'
  const analyzedPackage = mode === 'analyzed_package'
  if (supplement && paperId !== manifest.submission.snapshot.targetPaperId) {
    fail('Listening supplement --paper-id must equal the immutable targetPaperId')
  }
  if (analyzedPackage
    && manifest.submission.snapshot.targetPaperId
    && paperId !== manifest.submission.snapshot.targetPaperId) {
    fail('Analyzed-package correction --paper-id must equal the immutable targetPaperId')
  }
  if (analyzedPackage) {
    if (manifest.files.length !== 1 || manifest.files[0].role !== 'analyzed_package') {
      fail('Analyzed-package intake must contain exactly one ZIP')
    }
    const correction = Boolean(manifest.submission.snapshot.baseRevisionId)
    const paperDirectory = path.join(papersRoot, paperId)
    const existingReceiptPath = initializationReceiptPath(paperId)
    const existingReceipt = existsSync(existingReceiptPath)
      ? readLocalJson(existingReceiptPath, 'Source-intake initialization receipt')
      : null
    const sameSubmissionAlreadyInstalled = existingReceipt
      && existingReceipt.submissionId === manifest.submission.id
      && existingReceipt.submissionDigest === manifest.submission.submissionDigest
    if (sameSubmissionAlreadyInstalled) {
      if (correction) await assertCurrentCorrectionTarget(manifest.submission.snapshot)
      const receipt = initializationReceipt(manifest, paperId)
      console.log(JSON.stringify(analyzedPackageOutput(
        manifest,
        paperId,
        receipt.preparedIdentity,
        { idempotent: true },
      ), null, 2))
      return
    }

    const stagingDirectory = path.join(submissionDirectory(submissionId), 'prepared-workspace')
    const backupDirectory = path.join(submissionDirectory(submissionId), 'previous-workspace')
    rmSync(stagingDirectory, { recursive: true, force: true })
    let previousMoved = false
    try {
      const result = await prepareNck1AnalyzedPackageReview({
        sourcePath: manifest.files[0].localPath,
        destinationDir: stagingDirectory,
        expectedPaperId: paperId,
      })
      const preparedIdentity = analyzedPackageIdentity(manifest, result)
      if (correction) await assertCurrentCorrectionTarget(manifest.submission.snapshot)
      if (existsSync(paperDirectory)) {
        if (!correction) fail(`Destination already exists: ${paperDirectory}`)
        if (existsSync(backupDirectory)) {
          fail(`Correction backup already exists: ${backupDirectory}`)
        }
        renameSync(paperDirectory, backupDirectory)
        previousMoved = true
      }
      recordInitialization(manifest, paperId, {
        paperDirectory: stagingDirectory,
        preparedIdentity,
        ...(previousMoved ? { backupPath: backupDirectory } : {}),
      })
      try {
        renameSync(stagingDirectory, paperDirectory)
      } catch (error) {
        if (previousMoved && !existsSync(paperDirectory) && existsSync(backupDirectory)) {
          renameSync(backupDirectory, paperDirectory)
          previousMoved = false
        }
        throw error
      }
      console.log(JSON.stringify(analyzedPackageOutput(manifest, paperId, preparedIdentity), null, 2))
    } finally {
      rmSync(stagingDirectory, { recursive: true, force: true })
      if (previousMoved && !existsSync(paperDirectory) && existsSync(backupDirectory)) {
        renameSync(backupDirectory, paperDirectory)
      }
    }
    return
  }
  const audioFiles = manifest.files.filter((file) => file.role === 'listening_audio')
  const documentFiles = manifest.files.filter((file) => file.role !== 'listening_audio')
  if (audioFiles.length > 1 || (supplement && (audioFiles.length !== 1 || documentFiles.length > 0))) {
    fail('Listening supplement must contain exactly one MP3 and no question documents')
  }
  if (supplement) {
    execFileSync(
      process.execPath,
      [reviewCli, 'hydrate', paperId],
      { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'inherit' },
    )
    invalidateParagraphSummariesForListeningSupplement(path.join(papersRoot, paperId))
  } else {
    const args = [
      universalCli,
      'init',
      paperId,
      '--paper-name',
      manifest.submission.snapshot.paperName,
      '--provenance',
      provenance(manifest.submission.snapshot),
    ]
    for (const file of documentFiles) args.push('--source', `${file.role}=${file.localPath}`)
    execFileSync(
      process.execPath,
      args,
      { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'inherit' },
    )
  }
  if (audioFiles.length === 1) {
    const args = [
      universalCli,
      'stage-listening-audio',
      paperId,
      '--audio',
      audioFiles[0].localPath,
    ]
    if (option('--asr-fixture')) args.push('--asr-fixture', option('--asr-fixture'))
    execFileSync(
      process.execPath,
      args,
      { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'inherit' },
    )
    recordOperation(submissionId, 'init', 'completed', { paperId })
    console.log(JSON.stringify({
      submissionId,
      paperId,
      state: 'awaiting_agent_content_review',
      next: supplement
        ? `Review the opening ASR sample and its scope (later content unchecked), then run source-intake.mjs finalize-listening ${submissionId} --paper-id ${paperId} --review <content-review.json>; after final materialization regenerate and verify paragraph-summaries-v1.json and public-search-metadata-v1.json before Review push`
        : `Run universal-nck1.mjs materialize ${paperId} for the authoritative question 1 dialogue; review the opening ASR sample and its scope (later content unchecked); then run source-intake.mjs finalize-listening ${submissionId} --paper-id ${paperId} --review <content-review.json>`,
    }, null, 2))
    return
  }
  recordInitialization(manifest, paperId)
  console.log(JSON.stringify({
    submissionId,
    paperId,
    state: 'initialized_locally',
    next: `node scripts/import-pipeline/source-intake.mjs handoff ${submissionId} --paper-id ${paperId}`,
  }, null, 2))
}

async function finalizeListening(submissionId, paperId) {
  if (!paperIdPattern.test(paperId || '')) {
    fail('finalize-listening requires --paper-id paper-…')
  }
  const reviewPath = option('--review')
  if (!reviewPath) fail('finalize-listening requires --review <content-review.json>')
  const manifest = readDownloadManifest(submissionId)
  await heartbeat(submissionId)
  const args = [
    universalCli,
    'finalize-listening-audio',
    paperId,
    '--review',
    reviewPath,
  ]
  if (option('--reference')) args.push('--reference', option('--reference'))
  execFileSync(
    process.execPath,
    args,
    { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'inherit' },
  )
  recordInitialization(manifest, paperId)
  console.log(JSON.stringify({
    submissionId,
    paperId,
    state: 'initialized_locally',
    next: `node scripts/import-pipeline/source-intake.mjs handoff ${submissionId} --paper-id ${paperId}`,
  }, null, 2))
}

async function needsOwner(submissionId) {
  const reasonCode = option('--code')
  const message = option('--message')
  if (!reasonCode || !message) fail('needs-owner requires --code and --message')
  const claimReceipt = readClaim(submissionId)
  const result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/needs-owner`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode, message }),
    },
    { lease: claimReceipt.leaseToken },
  )
  rmSync(receiptPath(submissionId), { force: true })
  console.log(JSON.stringify({ submissionId, state: result.intake.state }, null, 2))
}

async function handoff(submissionId, paperId) {
  if (!paperIdPattern.test(paperId || '')) fail('handoff requires --paper-id paper-…')
  mkdirSync(submissionDirectory(submissionId), { recursive: true, mode: 0o700 })
  const lock = await acquireSourceIntakeLock(path.join(submissionDirectory(submissionId), 'continue.lock'))
  let paperLock
  try {
    paperLock = await acquireSourceIntakeLock(path.join(inboxRoot, `${paperId}.continue.lock`))
    const previous = readProgress(submissionId).operations || {}
    if (Object.values(previous).some((entry) => ['unknown', 'started'].includes(entry.state))) {
      fail('Unresolved operation outcome; do not replay handoff')
    }
    if (previous.handoff?.state === 'completed') {
      if (previous.handoff.paperId !== paperId || previous.handoff.ampThreadId !== ampThreadId()) {
        fail('Handoff receipt identity mismatch')
      }
      console.log(JSON.stringify(await automationStatus(submissionId, paperId), null, 2))
      return
    }
    await performHandoff(submissionId, paperId)
  } finally {
    if (paperLock) await paperLock.release()
    await lock.release()
  }
}

async function performHandoff(submissionId, paperId) {
  const claimReceipt = readClaim(submissionId)
  const downloadManifest = readDownloadManifest(submissionId)
  const initialization = initializationReceipt(downloadManifest, paperId)
  recordOperation(submissionId, 'handoff', 'started', { paperId, ampThreadId: ampThreadId() })
  let result
  try { result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/handoff`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, initialization }),
    },
    { lease: claimReceipt.leaseToken },
  ) } catch (error) {
    recordOperation(submissionId, 'handoff', 'unknown', { paperId, detail: error.message })
    throw error
  }
  if (result.intake?.state !== 'handed_off') fail('Handoff response did not confirm completion; reconcile before retrying')
  recordOperation(submissionId, 'handoff', 'completed', { paperId, ampThreadId: ampThreadId(),
    submissionDigest: downloadManifest.submission.submissionDigest })
  rmSync(receiptPath(submissionId), { force: true })
  console.log(JSON.stringify({
    submissionId,
    state: result.intake.state,
    paperId,
    nextCommand: `node scripts/import-pipeline/review.mjs preflight ${paperId}`,
  }, null, 2))
}

async function main() {
  const command = process.argv[2]
  const submissionId = process.argv[3]
  if (process.argv.includes('--help')) {
    console.log('Usage: source-intake.mjs status|continue <submissionId> [--paper-id paper-…]\nStart with status using only submissionId; follow nextCommand. Identity is resolved from the immutable snapshot/download. handoff precedes Review push; no automatic approval, publication or reclaim.')
    return
  }
  if (command === 'list') await list()
  else if (command === 'claim') await claim(validSubmissionId(submissionId))
  else if (command === 'download') await download(validSubmissionId(submissionId))
  else if (command === 'heartbeat') {
    const result = await heartbeat(validSubmissionId(submissionId))
    console.log(JSON.stringify({ submissionId, leaseExpiresAt: result.leaseExpiresAt }, null, 2))
  } else if (command === 'init') {
    await initialize(validSubmissionId(submissionId), option('--paper-id'))
  } else if (command === 'finalize-listening') {
    await finalizeListening(validSubmissionId(submissionId), option('--paper-id'))
  } else if (command === 'needs-owner') {
    await needsOwner(validSubmissionId(submissionId))
  } else if (command === 'handoff') {
    await handoff(validSubmissionId(submissionId), option('--paper-id'))
  } else if (command === 'status') {
    console.log(JSON.stringify(await automationStatus(
      validSubmissionId(submissionId),
      option('--paper-id'),
    ), null, 2))
  } else if (command === 'continue') {
    console.log(JSON.stringify(await continueAutomation(
      validSubmissionId(submissionId),
      option('--paper-id'),
    ), null, 2))
  } else {
    fail('Usage: source-intake.mjs list|status|continue|claim|download|heartbeat|init|finalize-listening|needs-owner|handoff ...')
  }
}

main().catch((error) => {
  if (['status', 'continue'].includes(process.argv[2])) {
    console.log(JSON.stringify({
      submissionId: process.argv[3],
      failed: { step: 'inspect', reason: 'state_inspection_failed', detail: error.message },
      next: 'Preserve current evidence and resolve the inspection failure before continuing.',
    }, null, 2))
  } else console.error(error.message)
  process.exitCode = 1
})
