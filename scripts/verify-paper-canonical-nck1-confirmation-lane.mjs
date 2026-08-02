import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  resolveCanonicalAuthority,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  TICKET_26_LEGACY_CAPTURE_INPUT_KIND,
  deriveTicket26LegacySource,
  resolveTicket26LegacySourceCapture,
} from '../server/paper-canonical/legacyTicket26SourceAdapter.mjs'
import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const captureRoot = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1'
const outputRoot = 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1'
const expectedPaperIds = [
  'paper-2020-i',
  'paper-2020-ii',
  'paper-2021-i',
  'paper-2021-ii',
  'paper-2022-i',
  'paper-2022-ii',
  'paper-2023-i',
  'paper-2023-ii',
  'paper-2024-i',
  'paper-2024-ii',
  'paper-2025-ii',
  'paper-960d0f8d',
  'paper-zj-2023-jan',
  'paper-zj-2024-jan',
  'paper-zj-2025-jan',
  'paper-zj-2026-jan',
]

function relativeCapturePath(paperId) {
  return `${captureRoot}/${paperId}/source-capture-v1.json`
}

function expectedArtifactPaths() {
  return [
    'lane-evidence-v1.json',
    ...expectedPaperIds.flatMap((paperId) => [
      `${paperId}/import-candidate-v1.json`,
      `${paperId}/teacher-confirmation-v1.json`,
      `${paperId}/canonical-paper-v1.json`,
    ]),
  ].sort()
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), 'utf8'))
}

async function listFiles(relativePath, prefix = '') {
  const absolutePath = path.join(rootDir, relativePath)
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await listFiles(`${relativePath}/${entry.name}`, childPrefix))
    else if (entry.isFile()) files.push(childPrefix)
    else assert.fail(`unexpected non-file output at ${childPrefix}`)
  }
  return files
}

function persistedCandidate(candidate) {
  const { sourceBytes, ...artifact } = candidate
  assert.ok(sourceBytes instanceof Uint8Array, 'the runtime candidate must contain immutable source bytes')
  return artifact
}

function candidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function expectedConfirmation(candidate) {
  return {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
}

function contentText(content) {
  return (content.blocks || [])
    .flatMap((block) => [...(block.inlines || []), ...(block.caption || [])])
    .filter((inline) => inline.kind === 'text')
    .map((inline) => inline.text)
    .join('')
}

function groupInlines(group) {
  return (group.content?.blocks || []).flatMap((block) => block.inlines || [])
}

function reconstructedLegacyNumericPassage(group) {
  const questionNoByBlankId = new Map(
    group.blankIds.map((blankId, index) => [blankId, group.questions[index]?.questionNo]),
  )
  return (group.content?.blocks || []).map((block) => (block.inlines || []).map((inline) => (
    inline.kind === 'blank_ref'
      ? `${questionNoByBlankId.get(inline.blankId)}._____`
      : inline.text || ''
  )).join('')).join('\n')
}

const authority = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
assert.equal(authority.ok, true, 'Ticket 27 must resolve the reviewed v41 private authority')
const adapterRegistry = authority.closure.artifacts.adapter
const sourceAdapter = adapterRegistry.adapters.find((entry) => entry.adapterId === 'ticket-26-legacy-source-capture')
assert.deepEqual(
  {
    registryId: adapterRegistry.id,
    registryVersion: adapterRegistry.version,
    adapterId: sourceAdapter?.adapterId,
    adapterVersion: sourceAdapter?.version,
    mediaType: sourceAdapter?.mediaType,
  },
  {
    registryId: 'source-adapters',
    registryVersion: '13',
    adapterId: 'ticket-26-legacy-source-capture',
    adapterVersion: '3',
    mediaType: 'application/vnd.eqb.ticket-26-source-capture+json',
  },
  'Ticket 27 must neither advance nor reinterpret the v41/v13 authority closure',
)

const evidence = await readJson(`${outputRoot}/lane-evidence-v1.json`)
assert.equal(evidence.schemaVersion, 'ticket-27-nck1-confirmation-lane-evidence-v1')
assert.equal(evidence.ticket, '27')
assert.equal(evidence.lane, 'nck1')
assert.equal(evidence.sourceCaptureRoot, captureRoot)
assert.deepEqual(evidence.authority, trustedLegacyCaptureCandidateAuthorityRef)
assert.deepEqual(evidence.adapter, {
  registryId: adapterRegistry.id,
  registryVersion: adapterRegistry.version,
  adapterId: sourceAdapter.adapterId,
  adapterVersion: sourceAdapter.version,
  mediaType: sourceAdapter.mediaType,
})
assert.deepEqual(evidence.membership, { paperIds: expectedPaperIds, count: 16 })
assert.deepEqual(evidence.accounting, {
  candidates: 16,
  confirmations: 16,
  canonicalPapers: 16,
  unresolved: 0,
  publications: 0,
})
assert.equal(evidence.papers.length, 16)
assert.deepEqual(evidence.papers.map(({ paperId }) => paperId), expectedPaperIds)
assert.deepEqual(await listFiles(outputRoot).then((files) => files.sort()), expectedArtifactPaths())

let numberedBlankCanonicalPaper = null
let numberedBlankSource = null
for (const paperId of expectedPaperIds) {
  const capturePath = relativeCapturePath(paperId)
  const captureBytes = new Uint8Array(await readFile(path.join(rootDir, capturePath)))
  const resolved = resolveTicket26LegacySourceCapture(captureBytes)
  assert.ok(resolved, `${paperId} must still resolve through committed Ticket 26 bytes`)
  assert.equal(resolved.paperId, paperId)
  assert.equal(resolved.capture.path, capturePath)
  assert.deepEqual(
    resolved.documents.map(({ role, mediaType, originalName }) => ({ role, mediaType, originalName })),
    [
      { role: 'asset-projection', mediaType: 'application/json', originalName: 'paper-asset.json' },
      { role: 'source-provenance', mediaType: 'application/json', originalName: 'import-meta.json' },
      { role: 'official-answer-lead', mediaType: 'application/json', originalName: 'answer-key.json' },
    ],
    `${paperId} must preserve the JSON-only legacy source boundary`,
  )

  const candidateResult = importCanonicalCandidate({
    kind: TICKET_26_LEGACY_CAPTURE_INPUT_KIND,
    sourceCaptureBytes: captureBytes,
  })
  const candidate = candidateResult.candidate
  assert.ok(candidate, `${paperId} must re-enter the candidate seam from its frozen capture`)
  assert.equal(candidate.schemaVersion, 'trusted-ticket-26-legacy-import-candidate-v1')
  assert.deepEqual(candidate.authority, trustedLegacyCaptureCandidateAuthorityRef)
  assert.equal(candidate.source.paperId, paperId)
  assert.equal(candidate.source.sha256, sha256(captureBytes))
  assert.equal(candidate.issues.length, 0)
  assert.equal(candidateResult.issues.length, 0)
  assert.deepEqual(candidate.operatorChoices, {}, `${paperId} must have no caller-authored semantic choices`)
  assert.equal(candidate.interpretation.profileId, 'nck1')
  assert.equal(candidate.candidateDigest, digestJson(candidateBody(candidate)))

  const candidatePath = `${outputRoot}/${paperId}/import-candidate-v1.json`
  const confirmationPath = `${outputRoot}/${paperId}/teacher-confirmation-v1.json`
  const canonicalPath = `${outputRoot}/${paperId}/canonical-paper-v1.json`
  const persisted = await readJson(candidatePath)
  const confirmation = await readJson(confirmationPath)
  const canonicalPaper = await readJson(canonicalPath)
  assert.deepEqual(persisted, persistedCandidate(candidate), `${paperId} persisted candidate must be a byte-source-derived replay`)
  assert.deepEqual(confirmation, expectedConfirmation(candidate), `${paperId} Teacher Confirmation must bind only the exact candidate and source`)

  const confirmationResult = confirmCanonicalCandidate(candidate, confirmation)
  assert.ok(confirmationResult.canonicalPaper, `${paperId} must close to one Canonical Paper`)
  assert.equal('unresolvedIssues' in confirmationResult, false, `${paperId} must not retain unresolved content or answer conflicts`)
  assert.equal('publication' in confirmationResult, false, `${paperId} confirmation must remain unpublished`)
  assert.deepEqual(confirmationResult.confirmation, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: confirmation.candidateDigest,
    sourceDigest: confirmation.sourceDigest,
  })
  assert.deepEqual(canonicalPaper, confirmationResult.canonicalPaper, `${paperId} canonical artifact must be the direct confirmed result`)
  assert.equal(canonicalPaper.paperPlan.paperId, paperId)
  assert.deepEqual(canonicalPaper.paperPlan.authorityRef, trustedLegacyCaptureCandidateAuthorityRef)
  assert.equal(canonicalPaper.paperPlan.completeness.status, 'complete')
  assert.ok(canonicalPaper.questionGroups.length > 0)
  assert.equal('publication' in canonicalPaper, false)
  assert.deepEqual(
    canonicalPaper.sourceCapture.documents.map(({ mediaType }) => mediaType).sort(),
    [
      'application/json',
      'application/json',
      'application/json',
      'application/vnd.eqb.ticket-26-legacy-source-envelope+json',
      'application/vnd.eqb.ticket-26-source-capture+json',
    ],
    `${paperId} confirmed capture must preserve the legacy JSON/envelope boundary without DOCX or PDF substitution`,
  )

  const evidencePaper = evidence.papers.find((paper) => paper.paperId === paperId)
  assert.ok(evidencePaper, `${paperId} must be present once in lane evidence`)
  assert.deepEqual(evidencePaper.sourceCapture, {
    relativePath: capturePath,
    sha256: candidate.source.sha256,
    byteLength: candidate.source.byteLength,
    captureId: candidate.source.captureId,
    captureDigest: candidate.source.captureDigest,
    documents: resolved.documents.map(({ role, inputKey, mediaType, originalName, sha256: documentSha256, byteLength }) => ({
      role,
      inputKey,
      mediaType,
      originalName,
      sha256: documentSha256,
      byteLength,
    })),
  })
  assert.deepEqual(evidencePaper.candidate, {
    relativePath: `${paperId}/import-candidate-v1.json`,
    fileSha256: sha256(await readFile(path.join(rootDir, candidatePath))),
    candidateDigest: candidate.candidateDigest,
  })
  assert.deepEqual(evidencePaper.confirmation, {
    relativePath: `${paperId}/teacher-confirmation-v1.json`,
    fileSha256: sha256(await readFile(path.join(rootDir, confirmationPath))),
    candidateDigest: confirmation.candidateDigest,
    sourceDigest: confirmation.sourceDigest,
  })
  assert.deepEqual(evidencePaper.canonicalPaper, {
    relativePath: `${paperId}/canonical-paper-v1.json`,
    fileSha256: sha256(await readFile(path.join(rootDir, canonicalPath))),
    canonicalPaperDigest: digestJson(canonicalPaper),
    planId: canonicalPaper.paperPlan.planId,
    groupCount: canonicalPaper.questionGroups.length,
    completeness: 'complete',
  })

  if (paperId === 'paper-960d0f8d') {
    numberedBlankCanonicalPaper = canonicalPaper
    numberedBlankSource = deriveTicket26LegacySource(captureBytes)
  }
}

assert.ok(numberedBlankCanonicalPaper && numberedBlankSource, 'paper-960d0f8d must remain inside the approved lane')
const numberedGrammar = numberedBlankSource.groups.find((group) => group.slotId === 'language.grammar-fill')
assert.ok(numberedGrammar)
assert.deepEqual(
  groupInlines(numberedGrammar)
    .filter((inline) => inline.kind === 'blank_ref')
    .map((inline) => inline.blankId),
  numberedGrammar.blankIds,
  'paper-960d0f8d must retain every source-explicit numbered blank exactly once and in source order',
)
assert.equal(
  reconstructedLegacyNumericPassage(numberedGrammar),
  numberedGrammar.passage.paragraphs.map((paragraph) => paragraph.text).join('\n'),
  'paper-960d0f8d numbered markers must preserve exact visible source text',
)
assert.deepEqual(
  numberedGrammar.variant.promptBindings.map(({ blankId, provision }) => ({ blankId, provision })),
  numberedGrammar.blankIds.map((blankId) => ({ blankId, provision: 'source_proven_none' })),
  'paper-960d0f8d must not invent Grammar Fill prompts for its numbered source blanks',
)
for (const numericProse of ['25-30g a day', '800g a day', '10g per day', '3-5g every few days']) {
  assert.ok(contentText(numberedGrammar.content).includes(numericProse), `${numericProse} must remain literal source prose`)
}
assert.deepEqual(
  numberedBlankCanonicalPaper.sourceCapture.assertions
    .filter((assertion) => numberedGrammar.questionIds.includes(assertion.questionId)),
  numberedBlankSource.assertions
    .filter((assertion) => numberedGrammar.questionIds.includes(assertion.questionId)),
  'paper-960d0f8d confirmation must preserve source-bound numeric Grammar Fill answer identities',
)

console.log(JSON.stringify({
  status: 'PASS',
  candidates: 16,
  confirmations: 16,
  canonicalPapers: 16,
  unresolved: 0,
  publicationArtifacts: 0,
  numberedBlankPaper: 'paper-960d0f8d',
}))
