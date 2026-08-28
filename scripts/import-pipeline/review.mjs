#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { materializeNck1CanonicalRequest } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { reviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import {
  buildNck1ReviewProjection,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../../server/import-review/revisionProjection.mjs'
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

async function accept(paperId) {
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
  else if (command === 'release-ship-guard') await releaseShipGuard(paperId, issueId)
  else fail(
    'Usage: review.mjs push <paperId> [--resolves issue-1,issue-2] | '
      + 'status <paperId> | reply <paperId> <issueId> --message <text> | accept <paperId> | '
      + 'release-ship-guard <paperId> <guardId> --owner-said-abort-ship',
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
