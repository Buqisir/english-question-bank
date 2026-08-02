import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'
import {
  resolveCanonicalAuthority,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import { digestJson, sha256, stableStringify } from '../shared/paper-canonical/stable.mjs'

export const TICKET_28_PAPER_IDS = [
  'paper-2020-bing',
  'paper-2020-jia',
  'paper-2021-jia',
  'paper-2021-yi',
  'paper-2022-jia',
  'paper-2022-yi',
  'paper-2023-jia',
  'paper-2023-yi',
  'paper-2024-jia',
]

export const TICKET_28_OUTPUT_ROOT = 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-28-national-legacy-v1'

const sourceCaptureRoot = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1'
const batchEvidencePath = `${sourceCaptureRoot}/batch-evidence.json`
const sourceAdaptersPath = 'standards/paper-canonical/adapters/source-adapters-v13.json'
const ticketPath = 'docs/cuts/paper-canonical-unification/tickets/28-national-legacy-confirmation-lane.md'

function stableJson(value) {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`
}

function signedArtifact(body) {
  return { ...body, artifactDigest: digestJson(body) }
}

function artifactFile(relativePath, value) {
  return { relativePath, bytes: stableJson(value) }
}

function withoutSourceBytes(candidate) {
  const { sourceBytes: _sourceBytes, ...persisted } = candidate
  return persisted
}

function sourceCapturePath(paperId) {
  return `${sourceCaptureRoot}/${paperId}/source-capture-v1.json`
}

function countQuestionRefs(canonicalPaper) {
  return canonicalPaper.questionGroups.reduce(
    (count, group) => count + group.questionRefs.length,
    0,
  )
}

function countBlankRefs(canonicalPaper) {
  return canonicalPaper.questionGroups.reduce(
    (count, group) => count + group.blankRefs.length,
    0,
  )
}

function sourceAdapterAuthority() {
  const authority = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
  assert.equal(authority.ok, true, 'Ticket 28 requires the accepted private legacy authority')
  assert.equal(trustedLegacyCaptureCandidateAuthorityRef.manifestVersion, '41')

  const adapterBytes = new Uint8Array(readFileSync(sourceAdaptersPath))
  const adapterSet = JSON.parse(new TextDecoder().decode(adapterBytes))
  const adapter = adapterSet.adapters.find(
    (entry) => entry.adapterId === 'ticket-26-legacy-source-capture',
  )
  assert.ok(adapter, 'Ticket 28 requires the Ticket 26 legacy source adapter')
  assert.equal(adapterSet.version, '13')
  assert.equal(adapter.version, '3')

  return {
    authority: trustedLegacyCaptureCandidateAuthorityRef,
    sourceAdapterSet: {
      path: sourceAdaptersPath,
      sha256: sha256(adapterBytes),
      version: adapterSet.version,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      mediaType: adapter.mediaType,
    },
  }
}

function materializePaper(paperId) {
  const capturePath = sourceCapturePath(paperId)
  const sourceCaptureBytes = new Uint8Array(readFileSync(capturePath))
  const firstImport = importCanonicalCandidate({
    kind: 'ticket-26-source-capture-v1',
    sourceCaptureBytes,
  })
  const secondImport = importCanonicalCandidate({
    kind: 'ticket-26-source-capture-v1',
    sourceCaptureBytes,
  })

  assert.deepEqual(secondImport, firstImport, `${paperId} candidate replay must be deterministic`)
  assert.ok(firstImport.candidate, `${paperId} must form an Import Candidate from its frozen capture`)
  assert.deepEqual(firstImport.issues, [], `${paperId} Candidate must not retain unresolved issues`)

  const candidate = firstImport.candidate
  assert.equal(candidate.source.paperId, paperId, `${paperId} identity must derive from the capture binding`)
  assert.equal(candidate.authority.manifestVersion, '41')
  assert.equal(candidate.source.sha256, sha256(sourceCaptureBytes))
  assert.equal(candidate.source.byteLength, sourceCaptureBytes.byteLength)

  const teacherConfirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
  const firstConfirmation = confirmCanonicalCandidate(candidate, teacherConfirmation)
  const secondConfirmation = confirmCanonicalCandidate(candidate, teacherConfirmation)
  assert.deepEqual(secondConfirmation, firstConfirmation, `${paperId} confirmation replay must be deterministic`)
  assert.ok(firstConfirmation.canonicalPaper, `${paperId} must confirm to one complete Canonical Paper`)
  assert.equal('unresolvedIssues' in firstConfirmation, false, `${paperId} must not retain confirmation issues`)
  assert.equal('publication' in firstConfirmation, false, `${paperId} confirmation must remain unpublished`)

  const canonicalPaper = firstConfirmation.canonicalPaper
  assert.equal(canonicalPaper.paperPlan.paperId, paperId)
  assert.equal(canonicalPaper.paperPlan.profileRef.profileId, 'national-legacy')
  assert.equal(canonicalPaper.paperPlan.completeness.status, 'complete')
  assert.equal(canonicalPaper.questionGroups.length, 7)

  const candidateArtifact = signedArtifact({
    schemaVersion: 'ticket-28-legacy-candidate-artifact-v1',
    paperId,
    sourceCapturePath: capturePath,
    candidate: withoutSourceBytes(candidate),
  })
  const confirmationArtifact = signedArtifact({
    schemaVersion: 'ticket-28-teacher-confirmation-artifact-v1',
    paperId,
    sourceCapturePath: capturePath,
    teacherConfirmation,
  })
  const canonicalArtifact = signedArtifact({
    schemaVersion: 'ticket-28-canonical-paper-artifact-v1',
    paperId,
    sourceCapturePath: capturePath,
    candidateDigest: candidate.candidateDigest,
    teacherConfirmationDigest: digestJson(teacherConfirmation),
    canonicalPaper,
    canonicalPaperDigest: digestJson(canonicalPaper),
  })

  return {
    files: [
      artifactFile(`${paperId}/candidate-v1.json`, candidateArtifact),
      artifactFile(`${paperId}/teacher-confirmation-v1.json`, confirmationArtifact),
      artifactFile(`${paperId}/canonical-paper-v1.json`, canonicalArtifact),
    ],
    evidence: {
      paperId,
      sourceCapturePath: capturePath,
      sourceDigest: candidate.source.sha256,
      sourceByteLength: candidate.source.byteLength,
      captureId: candidate.source.captureId,
      captureDigest: candidate.source.captureDigest,
      candidateDigest: candidate.candidateDigest,
      candidateArtifactDigest: candidateArtifact.artifactDigest,
      teacherConfirmationDigest: digestJson(teacherConfirmation),
      teacherConfirmationArtifactDigest: confirmationArtifact.artifactDigest,
      canonicalPaperDigest: canonicalArtifact.canonicalPaperDigest,
      canonicalPaperArtifactDigest: canonicalArtifact.artifactDigest,
      profileId: canonicalPaper.paperPlan.profileRef.profileId,
      canonicalGroupCount: canonicalPaper.questionGroups.length,
      canonicalQuestionCount: countQuestionRefs(canonicalPaper),
      canonicalBlankCount: countBlankRefs(canonicalPaper),
      candidateIssueCodes: [],
      unresolvedIssueCodes: [],
      publicationCount: 0,
    },
  }
}

export function buildTicket28NationalLegacyArtifacts() {
  const authority = sourceAdapterAuthority()
  const papers = TICKET_28_PAPER_IDS.map(materializePaper)
  const records = papers.map((paper) => paper.evidence)
  const laneEvidence = signedArtifact({
    schemaVersion: 'ticket-28-national-legacy-lane-evidence-v1',
    ticket: {
      id: '28',
      path: ticketPath,
    },
    status: 'PASS',
    input: {
      sourceCaptureRoot,
      batchEvidencePath,
      sourceInputKind: 'ticket-26-source-capture-v1',
    },
    authority,
    membership: {
      approvedPaperIds: TICKET_28_PAPER_IDS,
      expectedPaperCount: TICKET_28_PAPER_IDS.length,
    },
    accounting: {
      candidateCount: records.length,
      confirmedCanonicalPaperCount: records.length,
      completeUnpublishedCanonicalPaperCount: records.length,
      unresolvedPaperCount: records.filter((record) => record.unresolvedIssueCodes.length > 0).length,
      publicationCount: records.reduce((count, record) => count + record.publicationCount, 0),
      canonicalGroupCount: records.reduce((count, record) => count + record.canonicalGroupCount, 0),
      canonicalQuestionCount: records.reduce((count, record) => count + record.canonicalQuestionCount, 0),
      canonicalBlankCount: records.reduce((count, record) => count + record.canonicalBlankCount, 0),
    },
    papers: records,
  })

  return {
    files: [
      ...papers.flatMap((paper) => paper.files),
      artifactFile('lane-evidence-v1.json', laneEvidence),
    ],
    laneEvidence,
  }
}

function existingFileMatches(file) {
  const target = path.join(TICKET_28_OUTPUT_ROOT, file.relativePath)
  assert.ok(existsSync(target), `existing Ticket 28 artifact is missing: ${file.relativePath}`)
  assert.equal(readFileSync(target, 'utf8'), file.bytes, `existing Ticket 28 artifact drifted: ${file.relativePath}`)
}

function writeArtifactsAtomically(files) {
  if (existsSync(TICKET_28_OUTPUT_ROOT)) {
    files.forEach(existingFileMatches)
    return 'already-materialized'
  }

  const outputParent = path.dirname(TICKET_28_OUTPUT_ROOT)
  mkdirSync(outputParent, { recursive: true })
  const stageRoot = mkdtempSync(path.join(outputParent, '.ticket-28-stage-'))
  try {
    for (const file of files) {
      const target = path.join(stageRoot, file.relativePath)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, file.bytes)
    }
    renameSync(stageRoot, TICKET_28_OUTPUT_ROOT)
  } catch (error) {
    rmSync(stageRoot, { recursive: true, force: true })
    throw error
  }
  return 'materialized'
}

function run() {
  const args = process.argv.slice(2)
  assert.deepEqual(args, ['--write'], 'usage: node scripts/materialize-ticket-28-national-legacy-lane.mjs --write')
  const artifacts = buildTicket28NationalLegacyArtifacts()
  const writeDisposition = writeArtifactsAtomically(artifacts.files)
  console.log(JSON.stringify({
    status: 'PASS',
    writeDisposition,
    paperCount: artifacts.laneEvidence.accounting.completeUnpublishedCanonicalPaperCount,
    evidenceDigest: artifacts.laneEvidence.artifactDigest,
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
