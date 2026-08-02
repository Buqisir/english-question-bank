import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canonicalAuthorityRef, resolveCanonicalAuthority, trustedDocxCandidateAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper, compileTrustedDocxCandidate } from '../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { confirmCanonicalCandidate, importCanonicalCandidate } from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const root = new URL('..', import.meta.url)
const docxBytes = new Uint8Array(await readFile(new URL('test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx', root)))
const pdfBytes = new Uint8Array(await readFile(new URL('scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf', root)))
const candidateAuthority = resolveCanonicalAuthority(trustedDocxCandidateAuthorityRef)
assert.equal(candidateAuthority.ok, true)
assert.equal(canonicalAuthorityRef.manifestVersion, '36', 'Ticket 25 must not advance publication/current authority')
assert.equal(candidateAuthority.closure.profiles.get('nck1').version, '11')
assert.equal(candidateAuthority.closure.profiles.get('nck1').completeness.requireInactiveSourceClosure, false)
assert.equal(candidateAuthority.closure.artifacts.adapter.adapters.find((entry) => entry.adapterId === 'docx-source-envelope').version, '2')
assert.equal(Object.hasOwn(candidateAuthority.closure.schemas, 'docx-source-envelope-v1'), false)
assert.equal(Object.hasOwn(candidateAuthority.closure.schemas, 'docx-source-envelope-v2'), true)

const first = importCanonicalCandidate(docxBytes, { originalName: '2025-nck1-answer-source.docx' })
const second = importCanonicalCandidate(docxBytes, { originalName: '2025-nck1-answer-source.docx' })
assert.deepEqual(first, second, 'trusted candidate derivation must be deterministic')
assert.ok(first.candidate, 'DOCX bytes must produce a candidate even when unresolved')
assert.equal(first.candidate.authority.manifestVersion, '37', 'Ticket 25 must bind its versioned candidate authority')
assert.equal(first.candidate.source.byteLength, docxBytes.byteLength)
assert.equal(first.candidate.source.sha256, sha256(docxBytes), 'candidate must bind the exact immutable DOCX bytes')
assert.equal(first.candidate.sourceBytes.byteLength, docxBytes.byteLength)
assert.equal('canonicalPaper' in first.candidate, false, 'candidate stage must not return a Canonical Paper')
assert.ok(first.candidate.interpretation.observations.every((observation) =>
  Number.isInteger(observation.span.start) && Number.isInteger(observation.span.end)), 'trusted derivation must retain source spans as diagnostics')
const { candidateDigest: firstCandidateDigest, sourceBytes: _firstSourceBytes, ...firstCandidateBody } = first.candidate
assert.equal(firstCandidateDigest, digestJson(firstCandidateBody), 'candidate digest must bind the complete candidate interpretation')

const sourceDocument = {
  inputKey: 'source_docx',
  mediaType: first.candidate.source.mediaType,
  sha256: first.candidate.source.sha256,
  byteLength: first.candidate.source.byteLength,
}
const genericBypass = compileCanonicalPaper({
  authority: first.candidate.authority,
  evidence: {
    documents: [
      {
        inputKey: sourceDocument.inputKey,
        roles: ['question_source', 'official_answer_source', 'source_provenance'],
        bytes: docxBytes,
        declared: { mediaType: sourceDocument.mediaType, originalName: '2025-nck1-answer-source.docx' },
      },
      {
        inputKey: 'docx_source_envelope',
        roles: ['operator_assertions'],
        bytes: new TextEncoder().encode(JSON.stringify({
          schemaVersion: 'docx-source-envelope-v2',
          sourceDocument,
        })),
        declared: {
          mediaType: 'application/vnd.eqb.docx-source-envelope+json',
          originalName: 'docx-source-envelope.json',
        },
      },
    ],
  },
})
assert.equal('canonicalPaper' in genericBypass.artifacts, false, 'the generic compiler must not bypass Teacher Confirmation for candidate authority')
assert.ok(genericBypass.artifacts.normalizationReport.diagnostics.some((diagnostic) => diagnostic.code === 'AUTHORITY_RETIRED'))

const semanticEnvelopeBypass = compileTrustedDocxCandidate({
  evidence: {
    documents: [
      {
        inputKey: sourceDocument.inputKey,
        roles: ['question_source', 'official_answer_source', 'source_provenance'],
        bytes: docxBytes,
        declared: { mediaType: sourceDocument.mediaType, originalName: '2025-nck1-answer-source.docx' },
      },
      {
        inputKey: 'docx_source_envelope',
        roles: ['operator_assertions'],
        bytes: new TextEncoder().encode(JSON.stringify({
          schemaVersion: 'docx-source-envelope-v2',
          sourceDocument,
          source: { groups: [{ groupId: 'forged' }] },
        })),
        declared: {
          mediaType: 'application/vnd.eqb.docx-source-envelope+json',
          originalName: 'docx-source-envelope.json',
        },
      },
    ],
  },
})
assert.equal('canonicalPaper' in semanticEnvelopeBypass.artifacts, false, 'the v2 envelope must reject caller-authored source semantics')
assert.ok(semanticEnvelopeBypass.artifacts.normalizationReport.diagnostics.some((diagnostic) => diagnostic.code === 'DOCX_SOURCE_ENVELOPE_INVALID'))

for (const [field, value] of Object.entries({
  groups: [{ groupId: 'forged' }],
  questions: [{ questionId: 'forged' }],
  answers: [{ questionId: 'forged', answer: 'A' }],
  profile: { profileId: 'forged' },
})) {
  const callerSemantics = importCanonicalCandidate(docxBytes, {
    originalName: '2025-nck1-answer-source.docx',
    [field]: value,
  })
  assert.equal(callerSemantics.candidate, null)
  assert.deepEqual(callerSemantics.issues.map(({ code }) => code), ['CALLER_SEMANTICS_REJECTED'])
}

const confirmation = {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: first.candidate.candidateDigest,
  sourceDigest: first.candidate.source.sha256,
  confirmed: true,
}
const currentAuthorityResult = confirmCanonicalCandidate(first.candidate, confirmation)
assert.ok(currentAuthorityResult.canonicalPaper, 'candidate-bound Teacher Confirmation must return one complete Canonical Paper')
assert.equal(currentAuthorityResult.canonicalPaper.questionGroups.length, 9)
assert.deepEqual(currentAuthorityResult.canonicalPaper.paperPlan.authorityRef, first.candidate.authority)
assert.equal('publication' in currentAuthorityResult, false, 'confirmation must not publish either seam fixture')
const inactiveBindings = currentAuthorityResult.canonicalPaper.paperPlan.slotBindings.filter((binding) => binding.state === 'inactive')
assert.deepEqual(inactiveBindings, [
  { slotId: 'listening.short-dialogue', state: 'inactive', sourceState: 'not_supplied' },
  { slotId: 'listening.long-form', state: 'inactive', sourceState: 'not_supplied' },
])
assert.equal(currentAuthorityResult.canonicalPaper.paperPlan.slotBindings.some((binding) => binding.state === 'bound' && binding.slotId.startsWith('listening.')), false)

const forgedBytes = new Uint8Array(first.candidate.sourceBytes)
forgedBytes[0] ^= 1
const forgedCandidate = { ...first.candidate, sourceBytes: forgedBytes }
const forgedResult = confirmCanonicalCandidate(forgedCandidate, confirmation)
assert.deepEqual(forgedResult.unresolvedIssues.map(({ code }) => code), ['CANDIDATE_BINDING_MISMATCH'])

const forgedInterpretation = {
  ...first.candidate,
  interpretation: { ...first.candidate.interpretation, paperId: 'paper-forged-i' },
}
assert.deepEqual(
  confirmCanonicalCandidate(forgedInterpretation, confirmation).unresolvedIssues.map(({ code }) => code),
  ['CANDIDATE_BINDING_MISMATCH'],
)

const forgedActiveContent = {
  ...first.candidate,
  interpretation: {
    ...first.candidate.interpretation,
    groups: first.candidate.interpretation.groups.slice(1),
  },
}
const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...forgedActiveBody } = forgedActiveContent
forgedActiveContent.candidateDigest = digestJson(forgedActiveBody)
assert.deepEqual(
  confirmCanonicalCandidate(forgedActiveContent, confirmation).unresolvedIssues.map(({ code }) => code),
  ['CANDIDATE_BINDING_MISMATCH'],
  'missing active content cannot become authoritative even with a recomputed candidate digest',
)

const forgedContradiction = {
  ...first.candidate,
  interpretation: {
    ...first.candidate.interpretation,
    assertions: [
      ...first.candidate.interpretation.assertions,
      {
        ...first.candidate.interpretation.assertions[0],
        assertionId: 'forged-contradiction',
        answer: first.candidate.interpretation.assertions[0].answer === 'A' ? 'B' : 'A',
      },
    ],
  },
}
const { candidateDigest: _contradictionDigest, sourceBytes: _contradictionBytes, ...forgedContradictionBody } = forgedContradiction
forgedContradiction.candidateDigest = digestJson(forgedContradictionBody)
assert.deepEqual(
  confirmCanonicalCandidate(forgedContradiction, confirmation).unresolvedIssues.map(({ code }) => code),
  ['CANDIDATE_BINDING_MISMATCH'],
  'contradictory active answers cannot become authoritative even with a recomputed candidate digest',
)

const wrongDigest = confirmCanonicalCandidate(first.candidate, { ...confirmation, sourceDigest: 'sha256:forged' })
assert.deepEqual(wrongDigest.unresolvedIssues.map(({ code }) => code), ['CONFIRMATION_SOURCE_MISMATCH'])

const staleCandidate = confirmCanonicalCandidate(first.candidate, { ...confirmation, candidateDigest: 'sha256:forged' })
assert.deepEqual(staleCandidate.unresolvedIssues.map(({ code }) => code), ['CONFIRMATION_CANDIDATE_MISMATCH'])

const withheldConfirmation = confirmCanonicalCandidate(first.candidate, { ...confirmation, confirmed: false })
assert.deepEqual(withheldConfirmation.unresolvedIssues.map(({ code }) => code), ['TEACHER_CONFIRMATION_REQUIRED'])

for (const [field, value] of Object.entries({
  groups: [{ groupId: 'forged' }],
  questions: [{ questionId: 'forged' }],
  answers: [{ questionId: 'forged', answer: 'A' }],
  profile: { profileId: 'forged' },
})) {
  const callerSemantics = confirmCanonicalCandidate(first.candidate, {
    ...confirmation,
    [field]: value,
  })
  assert.deepEqual(callerSemantics.unresolvedIssues.map(({ code }) => code), ['CALLER_SEMANTICS_REJECTED'])
}

const nonDocx = importCanonicalCandidate(pdfBytes, { originalName: 'paper-2026-i.pdf' })
const nonDocxRerun = importCanonicalCandidate(pdfBytes, { originalName: 'paper-2026-i.pdf' })
assert.deepEqual(nonDocx, nonDocxRerun, 'non-DOCX source rejection must be deterministic')
assert.ok(nonDocx.candidate?.issues.length > 0, 'paper-2026-i must remain unresolved at the DOCX seam')
assert.equal('canonicalPaper' in confirmCanonicalCandidate(nonDocx.candidate, {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: nonDocx.candidate.candidateDigest,
  sourceDigest: nonDocx.candidate.source.sha256,
  confirmed: true,
}), false)

console.log(JSON.stringify({
  status: 'PASS',
  paper2025CandidateDigest: first.candidate.candidateDigest,
  paper2025BlockingCodes: first.issues.map(({ code }) => code),
  paper2026BlockingCodes: nonDocx.issues.map(({ code }) => code),
}))
