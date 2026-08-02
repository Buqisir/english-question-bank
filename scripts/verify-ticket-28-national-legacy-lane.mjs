import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  TICKET_28_OUTPUT_ROOT,
  TICKET_28_PAPER_IDS,
  buildTicket28NationalLegacyArtifacts,
} from './materialize-ticket-28-national-legacy-lane.mjs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

function stableJson(value) {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`
}

function readArtifact(relativePath) {
  const bytes = readFileSync(path.join(TICKET_28_OUTPUT_ROOT, relativePath), 'utf8')
  const value = JSON.parse(bytes)
  assert.equal(bytes, stableJson(value), `${relativePath} must retain deterministic stable JSON bytes`)
  return value
}

function assertSigned(value, label) {
  assert.equal(value.artifactDigest, digestJson(withoutKey(value, 'artifactDigest')), `${label} artifact digest must bind all remaining fields`)
}

const firstReplay = buildTicket28NationalLegacyArtifacts()
const secondReplay = buildTicket28NationalLegacyArtifacts()
assert.deepEqual(secondReplay, firstReplay, 'the nine-paper lane replay must be deterministic')

const expectedFiles = new Map(firstReplay.files.map((file) => [file.relativePath, file.bytes]))
assert.equal(expectedFiles.size, 28, 'Ticket 28 must contain 27 paper artifacts plus one lane evidence artifact')
for (const [relativePath, expectedBytes] of expectedFiles) {
  assert.equal(readFileSync(path.join(TICKET_28_OUTPUT_ROOT, relativePath), 'utf8'), expectedBytes, `${relativePath} must exactly match fresh frozen-source replay`)
}

assert.deepEqual(
  readdirSync(TICKET_28_OUTPUT_ROOT).sort(),
  [...TICKET_28_PAPER_IDS, 'lane-evidence-v1.json'].sort(),
  'Ticket 28 output root must contain exactly the approved papers and lane evidence',
)

const laneEvidence = readArtifact('lane-evidence-v1.json')
assertSigned(laneEvidence, 'lane evidence')
assert.equal(laneEvidence.schemaVersion, 'ticket-28-national-legacy-lane-evidence-v1')
assert.equal(laneEvidence.status, 'PASS')
assert.equal(laneEvidence.authority.authority.manifestVersion, '41')
assert.equal(laneEvidence.authority.sourceAdapterSet.version, '13')
assert.equal(laneEvidence.authority.sourceAdapterSet.adapterId, 'ticket-26-legacy-source-capture')
assert.equal(laneEvidence.authority.sourceAdapterSet.adapterVersion, '3')
assert.deepEqual(laneEvidence.membership.approvedPaperIds, TICKET_28_PAPER_IDS)
assert.equal(laneEvidence.membership.expectedPaperCount, 9)
assert.equal(laneEvidence.accounting.candidateCount, 9)
assert.equal(laneEvidence.accounting.confirmedCanonicalPaperCount, 9)
assert.equal(laneEvidence.accounting.completeUnpublishedCanonicalPaperCount, 9)
assert.equal(laneEvidence.accounting.unresolvedPaperCount, 0)
assert.equal(laneEvidence.accounting.publicationCount, 0)
assert.equal(laneEvidence.accounting.canonicalGroupCount, 63)
assert.equal(laneEvidence.accounting.canonicalQuestionCount, 450)
assert.equal(laneEvidence.accounting.canonicalBlankCount, 315)
assert.deepEqual(laneEvidence, firstReplay.laneEvidence, 'lane accounting must bind the exact regenerated per-paper records')

for (const paperId of TICKET_28_PAPER_IDS) {
  assert.deepEqual(
    readdirSync(path.join(TICKET_28_OUTPUT_ROOT, paperId)).sort(),
    ['candidate-v1.json', 'canonical-paper-v1.json', 'teacher-confirmation-v1.json'],
    `${paperId} must contain exactly one Candidate, Confirmation, and Canonical Paper artifact`,
  )
  const candidateArtifact = readArtifact(`${paperId}/candidate-v1.json`)
  const confirmationArtifact = readArtifact(`${paperId}/teacher-confirmation-v1.json`)
  const canonicalArtifact = readArtifact(`${paperId}/canonical-paper-v1.json`)

  assertSigned(candidateArtifact, `${paperId} candidate`)
  assertSigned(confirmationArtifact, `${paperId} confirmation`)
  assertSigned(canonicalArtifact, `${paperId} canonical paper`)
  assert.equal(candidateArtifact.paperId, paperId)
  assert.equal(confirmationArtifact.paperId, paperId)
  assert.equal(canonicalArtifact.paperId, paperId)
  assert.equal(candidateArtifact.candidate.source.paperId, paperId)
  assert.equal(candidateArtifact.candidate.authority.manifestVersion, '41')
  assert.equal('sourceBytes' in candidateArtifact.candidate, false, `${paperId} candidate artifact must replay through its immutable capture, not serialized caller bytes`)
  assert.deepEqual(confirmationArtifact.teacherConfirmation, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidateArtifact.candidate.candidateDigest,
    sourceDigest: candidateArtifact.candidate.source.sha256,
    confirmed: true,
  })
  assert.equal(canonicalArtifact.candidateDigest, candidateArtifact.candidate.candidateDigest)
  assert.equal(canonicalArtifact.teacherConfirmationDigest, digestJson(confirmationArtifact.teacherConfirmation))
  assert.equal(canonicalArtifact.canonicalPaperDigest, digestJson(canonicalArtifact.canonicalPaper))
  assert.equal(canonicalArtifact.canonicalPaper.paperPlan.paperId, paperId)
  assert.equal(canonicalArtifact.canonicalPaper.paperPlan.profileRef.profileId, 'national-legacy')
  assert.equal(canonicalArtifact.canonicalPaper.paperPlan.completeness.status, 'complete')
  assert.equal(canonicalArtifact.canonicalPaper.questionGroups.length, 7)
  assert.equal('publication' in canonicalArtifact, false, `${paperId} canonical artifact must remain unpublished`)
  assert.equal('publication' in canonicalArtifact.canonicalPaper, false, `${paperId} Canonical Paper must remain unpublished`)
}

console.log(JSON.stringify({
  status: 'PASS',
  paperCount: laneEvidence.accounting.completeUnpublishedCanonicalPaperCount,
  canonicalGroupCount: laneEvidence.accounting.canonicalGroupCount,
  canonicalQuestionCount: laneEvidence.accounting.canonicalQuestionCount,
  canonicalBlankCount: laneEvidence.accounting.canonicalBlankCount,
  evidenceDigest: laneEvidence.artifactDigest,
}))
