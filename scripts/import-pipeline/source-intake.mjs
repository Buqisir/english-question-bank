#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { assertListeningAudioManifest } from '../../server/paper-import/listeningAudioEvidence.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

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
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  chmodSync(filePath, 0o600)
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
  if (
    manifest.submission?.id !== submissionId
    || !Array.isArray(manifest.files)
    || manifest.files.length < 1
  ) fail(`Download manifest is incomplete: ${submissionId}`)
  assertSubmissionDigest(manifest.submission)
  for (const file of manifest.files) {
    if (
      !existsSync(file.localPath)
      || readFileSync(file.localPath).byteLength !== file.byteLength
      || sha256(readFileSync(file.localPath)) !== file.sha256
    ) fail(`Downloaded source file changed: ${file.localPath}`)
  }
  return manifest
}

function initializationReceiptPath(paperId) {
  if (!paperIdPattern.test(paperId || '')) fail('A valid paperId is required')
  return path.join(papersRoot, paperId, 'signals', 'source-intake-initialization.json')
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

function assertInitializedWorkspace(downloadManifest, paperId) {
  const paperDirectory = path.join(papersRoot, paperId)
  const config = readLocalJson(path.join(paperDirectory, 'config.json'), 'Paper config')
  const sourceManifest = readLocalJson(
    path.join(paperDirectory, 'universal-source-manifest.json'),
    'Universal source manifest',
  )
  if (config.paperId !== paperId || sourceManifest.paperId !== paperId) {
    fail(`Initialized workspace paperId does not match: ${paperId}`)
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

function recordInitialization(downloadManifest, paperId) {
  assertInitializedWorkspace(downloadManifest, paperId)
  const threadId = downloadManifest.ampThreadId || null
  const receipt = {
    schemaVersion: threadId
      ? 'source-intake-initialization-v2'
      : 'source-intake-initialization-v1',
    submissionId: downloadManifest.submission.id,
    submissionDigest: downloadManifest.submission.submissionDigest,
    paperId,
    ...(threadId ? { ampThreadId: threadId } : {}),
    recordedAt: new Date().toISOString(),
  }
  writePrivateJson(initializationReceiptPath(paperId), receipt)
  return receipt
}

function initializationReceipt(downloadManifest, paperId) {
  assertInitializedWorkspace(downloadManifest, paperId)
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
  ) fail(`Local initialization receipt does not match: ${paperId}`)
  return receipt
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
  const supplement = manifest.submission.snapshot.mode === 'listening_supplement'
  if (supplement && paperId !== manifest.submission.snapshot.targetPaperId) {
    fail('Listening supplement --paper-id must equal the immutable targetPaperId')
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
    console.log(JSON.stringify({
      submissionId,
      paperId,
      state: 'awaiting_agent_content_review',
      next: supplement
        ? `Read the complete ASR transcript, then run source-intake.mjs finalize-listening ${submissionId} --paper-id ${paperId} --review <content-review.json>`
        : `Run universal-nck1.mjs materialize ${paperId} so the source transcript/questions are available; read the complete ASR transcript; then run source-intake.mjs finalize-listening ${submissionId} --paper-id ${paperId} --review <content-review.json>`,
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
  const claimReceipt = readClaim(submissionId)
  const downloadManifest = readDownloadManifest(submissionId)
  const initialization = initializationReceipt(downloadManifest, paperId)
  const result = await api(
    `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/handoff`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, initialization }),
    },
    { lease: claimReceipt.leaseToken },
  )
  rmSync(receiptPath(submissionId), { force: true })
  console.log(JSON.stringify({
    submissionId,
    state: result.intake.state,
    paperId: result.intake.handedOffPaperId,
  }, null, 2))
}

async function main() {
  const command = process.argv[2]
  const submissionId = process.argv[3]
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
  } else {
    fail('Usage: source-intake.mjs list|claim|download|heartbeat|init|finalize-listening|needs-owner|handoff ...')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
