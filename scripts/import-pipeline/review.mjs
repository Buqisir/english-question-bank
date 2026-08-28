#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { materializeNck1CanonicalRequest } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { loadCanonicalImportRequest } from '../../server/paper-canonical/importRequest.mjs'
import { reviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import {
  buildNck1ReviewProjection,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../../server/import-review/revisionProjection.mjs'
import { publishUniversalNck1Import } from '../../server/paper-import/publisher.mjs'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const papersRoot = path.join(import.meta.dirname, 'papers')

function fail(message) {
  throw new Error(message)
}

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] || null
}

function paperDirectory(paperId) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')) {
    fail('A valid paperId is required')
  }
  return path.join(papersRoot, paperId)
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

async function api(pathname, init = {}) {
  const response = await fetch(`${origin()}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      ...(init.headers || {}),
    },
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    fail(`${response.status} ${body?.code || ''} ${body?.error || body || 'Review API failed'}`.trim())
  }
  return body
}

function producerBuildId() {
  if (process.env.QUESTION_BANK_BUILD_ID) return process.env.QUESTION_BANK_BUILD_ID
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown-build'
  }
}

function fileDescriptors(paperDir) {
  return reviewBundleFilePaths(paperDir).map((file) => {
    const bytes = readFileSync(resolveReviewFile(paperDir, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
}

function reviewManifest(paperDir, projection, resolvesIssueIds = [], buildId = producerBuildId()) {
  const manifest = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    producerBuildId: buildId,
    files: fileDescriptors(paperDir),
    resolvesIssueIds,
  }
  return { ...manifest, bundleDigest: reviewBundleDigest(manifest) }
}

function resolvedIssueIds() {
  return String(option('--resolves') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function pushRevision(paperId) {
  const paperDir = paperDirectory(paperId)
  const projection = buildNck1ReviewProjection(paperDir)
  const manifest = reviewManifest(paperDir, projection, resolvedIssueIds())
  const created = await api('/api/import-agent-reviews/revisions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(manifest),
  })
  for (const relativePath of created.missingFiles || []) {
    const file = manifest.files.find((candidate) => candidate.path === relativePath)
    if (!file) fail(`Server requested an unknown file: ${relativePath}`)
    await api(
      `/api/import-agent-reviews/revisions/${encodeURIComponent(created.revision.id)}`
        + `/files?path=${encodeURIComponent(relativePath)}`,
      {
        method: 'PUT',
        headers: {
          'content-length': String(file.byteLength),
          'content-type': file.mediaType,
        },
        body: readFileSync(resolveReviewFile(paperDir, relativePath)),
      },
    )
  }
  const finalized = await api(
    `/api/import-agent-reviews/revisions/${encodeURIComponent(created.revision.id)}/finalize`,
    { method: 'POST' },
  )
  console.log(JSON.stringify({
    paperId,
    revisionId: finalized.revision.id,
    revisionNumber: finalized.revision.revisionNumber,
    state: finalized.revision.state,
    bundleDigest: finalized.revision.bundleDigest,
  }, null, 2))
}

async function status(paperId) {
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  console.log(JSON.stringify(result, null, 2))
}

async function reply(paperId, issueId) {
  const message = option('--message')
  if (!issueId || !message) fail('reply requires <paperId> <issueId> --message <text>')
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`
      + `/issues/${encodeURIComponent(issueId)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    },
  )
  console.log(JSON.stringify({
    paperId: result.paperId,
    issueId,
    messages: result.issueMessages.filter((item) => item.issueId === issueId),
  }, null, 2))
}

function exactFileDescriptors(localFiles, approvedFiles) {
  const comparable = (files) => files
    .map(({ path: filePath, sha256: digest, byteLength, mediaType, role }) => ({
      path: filePath,
      sha256: digest,
      byteLength,
      mediaType,
      role,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return stableStringify(comparable(localFiles)) === stableStringify(comparable(approvedFiles))
}

async function approvedLocalReview(paperId) {
  const paperDir = paperDirectory(paperId)
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const approval = status.approval
  if (!approval || status.latest?.state !== 'approved') {
    fail(`${paperId} has no current approved revision`)
  }
  const projection = buildNck1ReviewProjection(paperDir)
  for (const [actual, expected, label] of [
    [projection.sourceDigest, approval.sourceDigest, 'sourceDigest'],
    [projection.candidateDigest, approval.candidateDigest, 'candidateDigest'],
    [projection.visibleStructureDigest, approval.visibleStructureDigest, 'visibleStructureDigest'],
  ]) {
    if (actual !== expected) fail(`Local ${label} no longer matches web approval`)
  }
  const localManifest = reviewManifest(
    paperDir,
    projection,
    [],
    approval.producerBuildId,
  )
  if (
    !exactFileDescriptors(localManifest.files, status.latest.manifest.files)
    || localManifest.bundleDigest !== approval.bundleDigest
  ) fail('Local review bundle no longer matches web approval')
  return { paperDir, status, approval, projection }
}

async function accept(paperId) {
  const {
    paperDir,
    approval,
    projection,
  } = await approvedLocalReview(paperId)

  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  const materialized = materializeNck1CanonicalRequest(projection.sourceInput, confirmation)
  const outputDir = path.join(paperDir, 'canonical-evidence')
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'candidate-summary.json'), `${JSON.stringify({
    paperId,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
  }, null, 2)}\n`)
  writeFileSync(
    path.join(outputDir, 'web-review-approval-v1.json'),
    `${JSON.stringify(approval, null, 2)}\n`,
  )
  for (const [fileName, bytes] of materialized.outputs) {
    writeFileSync(path.join(outputDir, fileName), bytes)
  }
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), `${JSON.stringify({
    schemaVersion: 'web-import-review-qa-accepted-v1',
    acceptedAt: approval.approvedAt,
    by: approval.approvedBy,
    approvalId: approval.approvalId,
    revisionId: approval.revisionId,
    sourceDigest: approval.sourceDigest,
    candidateDigest: approval.candidateDigest,
    visibleStructureDigest: approval.visibleStructureDigest,
    bundleDigest: approval.bundleDigest,
  }, null, 2)}\n`)
  console.log(`ACCEPTED ${paperId}: exact web approval materialized; no publish or deployment was run`)
}

function requiredJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing; run review.mjs accept first`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON`)
  }
}

function assertAcceptedReceipts(paperDir, approval, projection) {
  const evidenceDir = path.join(paperDir, 'canonical-evidence')
  const qaAccepted = requiredJson(
    path.join(paperDir, 'signals', 'qa-accepted.json'),
    'signals/qa-accepted.json',
  )
  const webApproval = requiredJson(
    path.join(evidenceDir, 'web-review-approval-v1.json'),
    'canonical-evidence/web-review-approval-v1.json',
  )
  const confirmation = requiredJson(
    path.join(evidenceDir, 'teacher-confirmation-v1.json'),
    'canonical-evidence/teacher-confirmation-v1.json',
  )
  if (qaAccepted.schemaVersion !== 'web-import-review-qa-accepted-v1') {
    fail('signals/qa-accepted.json has an unsupported schemaVersion')
  }
  for (const [actual, expected, label] of [
    [qaAccepted.approvalId, approval.approvalId, 'qa approvalId'],
    [qaAccepted.revisionId, approval.revisionId, 'qa revisionId'],
    [qaAccepted.sourceDigest, approval.sourceDigest, 'qa sourceDigest'],
    [qaAccepted.candidateDigest, approval.candidateDigest, 'qa candidateDigest'],
    [qaAccepted.visibleStructureDigest, approval.visibleStructureDigest, 'qa visibleStructureDigest'],
    [qaAccepted.bundleDigest, approval.bundleDigest, 'qa bundleDigest'],
  ]) {
    if (actual !== expected) fail(`${label} no longer matches current web approval`)
  }
  if (stableStringify(webApproval) !== stableStringify(approval)) {
    fail('Saved web approval no longer matches current web approval')
  }
  const expectedConfirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  if (stableStringify(confirmation) !== stableStringify(expectedConfirmation)) {
    fail('Saved Teacher Confirmation no longer matches the approved local Candidate')
  }
  const answerCheck = requiredJson(
    path.join(paperDir, 'signals', 'ai-answer-check.json'),
    'signals/ai-answer-check.json',
  )
  if (answerCheck.ok !== true) fail('AI Answer Transcription Check has not passed')
  return {
    qaAccepted,
    canonicalRequest: loadCanonicalImportRequest(
      path.join(evidenceDir, 'canonical-import-request.json'),
    ),
  }
}

function publicationReceiptIsCurrent({
  db,
  paperAssetsDir,
  paperId,
  receipt,
}) {
  const latestPath = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  if (!existsSync(latestPath)) return false
  const latest = requiredJson(latestPath, 'published latest paper-asset.json')
  const version = Number(receipt.assetVersion)
  const assetRow = db.prepare(
    `
    SELECT status
    FROM paper_asset_versions
    WHERE paper_id = ? AND asset_version = ?
    `,
  ).get(paperId, version)
  const canonicalRow = db.prepare(
    `
    SELECT publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND source_asset_version = ? AND is_current = 1
    `,
  ).get(paperId, version)
  return latest.paper?.assetVersion === version
    && assetRow?.status === 'published'
    && canonicalRow?.publication_digest === receipt.canonicalPublicationDigest
}

function publicationReceiptMatchesApproval(receipt, approval) {
  return receipt?.schemaVersion === 'universal-nck1-local-publication-v1'
    && receipt.approvalId === approval.approvalId
    && receipt.revisionId === approval.revisionId
    && receipt.sourceDigest === approval.sourceDigest
    && receipt.candidateDigest === approval.candidateDigest
    && receipt.visibleStructureDigest === approval.visibleStructureDigest
    && receipt.bundleDigest === approval.bundleDigest
    && Number.isInteger(receipt.assetVersion)
    && receipt.assetVersion > 0
    && receipt.versionName === `v${receipt.assetVersion}`
    && typeof receipt.canonicalPublicationDigest === 'string'
}

async function publish(paperId) {
  const {
    paperDir,
    approval,
    projection,
  } = await approvedLocalReview(paperId)
  const { canonicalRequest } = assertAcceptedReceipts(
    paperDir,
    approval,
    projection,
  )
  const dbPath = process.env.QUESTION_BANK_DB
    || path.join(root, 'data/question-bank.sqlite')
  const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    || path.join(root, 'app/public/paper-assets')
  const receiptPath = path.join(paperDir, 'signals', 'locally-published.json')
  const existingReceipt = existsSync(receiptPath)
    ? requiredJson(receiptPath, 'signals/locally-published.json')
    : null
  const db = new DatabaseSync(dbPath, { readOnly: false })
  try {
    if (existingReceipt?.approvalId === approval.approvalId) {
      if (
        !publicationReceiptMatchesApproval(existingReceipt, approval)
        || !publicationReceiptIsCurrent({
          db,
          paperAssetsDir,
          paperId,
          receipt: existingReceipt,
        })
      ) fail('Existing local publication receipt does not match approval or committed current state')
      console.log(`ALREADY PUBLISHED ${paperId} ${existingReceipt.versionName}: ready_to_ship; no deployment was run`)
      return
    }
    const result = publishUniversalNck1Import({
      reviewRootDir: paperDir,
      approvedIdentity: approval,
      canonicalRequest,
      db,
      paperAssetsDir,
    })
    if (!result.ok) {
      const diagnostics = result.canonicalAdmission?.diagnostics || []
      fail(diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')
        || `Universal NCK1 publish failed: ${result.status}`)
    }
    const receipt = {
      schemaVersion: 'universal-nck1-local-publication-v1',
      publishedAt: new Date().toISOString(),
      approvalId: approval.approvalId,
      revisionId: approval.revisionId,
      sourceDigest: approval.sourceDigest,
      candidateDigest: approval.candidateDigest,
      visibleStructureDigest: approval.visibleStructureDigest,
      bundleDigest: approval.bundleDigest,
      assetVersion: result.publish.assetVersion,
      versionName: result.publish.versionName,
      canonicalPublicationDigest: result.publish.canonicalPublicationDigest,
    }
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(`PUBLISHED ${paperId} ${receipt.versionName}: ready_to_ship; no deployment was run`)
  } finally {
    db.close()
  }
}

async function releaseShipGuard(paperId, guardId) {
  if (!guardId || !process.argv.includes('--owner-said-abort-ship')) {
    fail(
      'release-ship-guard requires <paperId> <guardId> --owner-said-abort-ship '
        + 'after confirming the old push process is no longer running',
    )
  }
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`
      + `/shipping-guards/${encodeURIComponent(guardId)}`,
    { method: 'DELETE' },
  )
  console.log(JSON.stringify({ paperId, guardId, ...result }, null, 2))
}

async function main() {
  const [command, paperId, issueId] = process.argv.slice(2)
  if (command === 'push') await pushRevision(paperId)
  else if (command === 'status') await status(paperId)
  else if (command === 'reply') await reply(paperId, issueId)
  else if (command === 'accept') await accept(paperId)
  else if (command === 'publish') await publish(paperId)
  else if (command === 'release-ship-guard') await releaseShipGuard(paperId, issueId)
  else fail(
    'Usage: review.mjs push <paperId> [--resolves issue-1,issue-2] | '
      + 'status <paperId> | reply <paperId> <issueId> --message <text> | '
      + 'accept <paperId> | publish <paperId> | '
      + 'release-ship-guard <paperId> <guardId> --owner-said-abort-ship',
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
