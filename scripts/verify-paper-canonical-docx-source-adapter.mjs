import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canonicalAuthorityRef, resolveCanonicalAuthority, trustedDocxCandidateAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import * as compilerModule from '../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  deriveNck1Identity,
  extractDocxDocumentText,
} from '../server/paper-canonical/docxSourceAdapter.mjs'
import * as trustedDocxImport from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const { compileCanonicalPaper } = compilerModule
const { confirmCanonicalCandidate, importCanonicalCandidate } = trustedDocxImport

const root = new URL('..', import.meta.url)
const paper2025DocxPath = 'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const semanticOracle = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-2025-i-docx-source-adapter/semantic-oracle-v1.json', root), 'utf8'))
assert.equal(semanticOracle.source.relativePath, paper2025DocxPath, 'the semantic oracle must pin the checked-in immutable source path')
const docxBytes = new Uint8Array(await readFile(new URL(paper2025DocxPath, root)))
const pdfBytes = new Uint8Array(await readFile(new URL('scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf', root)))
const candidateAuthority = resolveCanonicalAuthority(trustedDocxCandidateAuthorityRef)
assert.equal(candidateAuthority.ok, true)
assert.equal(canonicalAuthorityRef.manifestVersion, '36', 'Ticket 25 must not advance publication/current authority')
assert.equal(candidateAuthority.closure.profiles.get('nck1').version, '11')
assert.equal(candidateAuthority.closure.profiles.get('nck1').completeness.requireInactiveSourceClosure, false)
assert.equal(candidateAuthority.closure.artifacts.adapter.adapters.find((entry) => entry.adapterId === 'docx-source-envelope').version, '2')
assert.equal(Object.hasOwn(candidateAuthority.closure.schemas, 'docx-source-envelope-v1'), false)
assert.equal(Object.hasOwn(candidateAuthority.closure.schemas, 'docx-source-envelope-v2'), true)
assert.equal(Object.hasOwn(compilerModule, 'compileTrustedDocxCandidate'), false, 'ordinary callers must not reach the privileged V37 compiler')
assert.deepEqual(Object.keys(trustedDocxImport).sort(), [
  'confirmCanonicalCandidate',
  'importCanonicalCandidate',
], 'the trusted DOCX public seam must expose only import and confirmation')

function questionIdsForRange(range) {
  if (range === null) return []
  return Array.from({ length: range[1] - range[0] + 1 }, (_, index) =>
    `q-2025-i-${String(range[0] + index).padStart(3, '0')}`)
}

function contentText(content) {
  return (content.blocks || [])
    .flatMap((block) => [...(block.inlines || []), ...(block.caption || [])])
    .filter((inline) => inline.kind === 'text')
    .map((inline) => inline.text)
    .join('')
}

function expectedObjectiveAnswers() {
  const [start] = semanticOracle.semanticExpectations.objectiveQuestionRange
  return semanticOracle.semanticExpectations.officialAnswersInQuestionOrder.map((answer, index) => ({
    questionId: `q-2025-i-${String(start + index).padStart(3, '0')}`,
    answer,
  }))
}

/**
 * This is deliberately a small immutable-source oracle, not another DOCX
 * parser. It checks fixed, human/source-reviewed paper semantics against the
 * candidate while pinning the exact source file bytes and digest.
 */
function assertSourceBoundSemanticOracle(candidate) {
  const { source, semanticExpectations } = semanticOracle
  assert.equal(docxBytes.byteLength, source.byteLength)
  assert.equal(sha256(docxBytes), source.sha256)
  assert.equal(candidate.source.sha256, source.sha256)
  assert.equal(candidate.source.byteLength, source.byteLength)
  assert.equal(candidate.source.originalName, source.originalName)
  assert.equal(candidate.interpretation.paperId, semanticExpectations.paperId)
  assert.equal(candidate.interpretation.profileId, semanticExpectations.profileId)
  assert.equal(candidate.interpretation.groups.length, semanticExpectations.groups.length)
  for (const expected of semanticExpectations.groups) {
    const matchingGroups = candidate.interpretation.groups.filter((group) => group.slotId === expected.slotId)
    assert.equal(matchingGroups.length, 1, `candidate must contain exactly one ${expected.slotId} group`)
    const actual = matchingGroups[0]
    assert.equal(actual.groupId, expected.groupId)
    assert.equal(actual.family, expected.family)
    assert.deepEqual(actual.questionIds, questionIdsForRange(expected.questionRange))
    assert.ok(contentText(actual.content).includes(expected.textAnchor), `${expected.slotId} must retain its reviewed source text anchor`)
  }
  assert.deepEqual(
    candidate.interpretation.assertions.map(({ questionId, answer }) => ({ questionId, answer })),
    expectedObjectiveAnswers(),
    'candidate answers must match the reviewed immutable DOCX answer sequence',
  )
  assert.deepEqual(candidate.interpretation.inactiveSlots, semanticExpectations.inactiveSlots)
}

function candidateWithReboundDigest(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return { ...candidate, candidateDigest: digestJson(body) }
}

assert.deepEqual(
  deriveNck1Identity(extractDocxDocumentText(docxBytes)),
  { paperId: 'paper-2025-i', profileId: 'nck1' },
  'national Volume I DOCX must keep paper-YYYY-i',
)
assert.deepEqual(
  deriveNck1Identity('2024年全国高考一卷英语真题\n'),
  { paperId: 'paper-2024-i', profileId: 'nck1' },
)
assert.deepEqual(
  deriveNck1Identity('浙江省2025年1月普通高等学校招生全国统一考试英语试卷\n'),
  { paperId: 'paper-zj-2025-jan', profileId: 'nck1' },
)
assert.deepEqual(
  deriveNck1Identity('2025年浙江卷高考真题英语试卷（1月）\n'),
  { paperId: 'paper-zj-2025-jan', profileId: 'nck1' },
)
assert.deepEqual(
  deriveNck1Identity('2026年浙江卷高考真题英语试卷(1月)\n'),
  { paperId: 'paper-zj-2026-jan', profileId: 'nck1' },
)
assert.throws(
  () => deriveNck1Identity('2025年浙江卷高考真题英语试卷\n'),
  /DOCX source lacks a supported NCK1 paper identity/,
)
assert.throws(
  () => deriveNck1Identity('Some unrelated mock paper title\n'),
  /DOCX source lacks a supported NCK1 paper identity/,
)

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
assertSourceBoundSemanticOracle(first.candidate)

const synchronizedQuestionDrift = structuredClone(first.candidate)
synchronizedQuestionDrift.interpretation.groups[0].questionIds[0] = 'q-2025-i-999'
assert.throws(
  () => assertSourceBoundSemanticOracle(candidateWithReboundDigest(synchronizedQuestionDrift)),
  'a recomputed candidate digest must not self-prove a synchronized question parser error',
)

const synchronizedAnswerDrift = structuredClone(first.candidate)
synchronizedAnswerDrift.interpretation.assertions[0].answer = 'A'
assert.throws(
  () => assertSourceBoundSemanticOracle(candidateWithReboundDigest(synchronizedAnswerDrift)),
  'a recomputed candidate digest must not self-prove a synchronized answer parser error',
)

const synchronizedTextDrift = structuredClone(first.candidate)
synchronizedTextDrift.interpretation.groups[0].content.blocks[0].inlines[0].text = 'Synchronized parser drift'
assert.throws(
  () => assertSourceBoundSemanticOracle(candidateWithReboundDigest(synchronizedTextDrift)),
  'a recomputed candidate digest must not self-prove a synchronized text parser error',
)

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

const callerAuthoredFixture = makeReadyCanonicalFixture()
assert.equal(callerAuthoredFixture.source.profileId, 'nck1')
assert.ok(callerAuthoredFixture.source.groups.length > 0, 'attack fixture must contain caller-authored groups')
assert.ok(callerAuthoredFixture.source.assertions.length > 0, 'attack fixture must contain caller-authored answers')
const callerFixtureBypass = compileCanonicalPaper({
  ...callerAuthoredFixture.request,
  authority: trustedDocxCandidateAuthorityRef,
})
assert.equal('canonicalPaper' in callerFixtureBypass.artifacts, false, 'caller-authored groups, answers, and profile must not bypass Teacher Confirmation')
assert.ok(callerFixtureBypass.artifacts.normalizationReport.diagnostics.some((diagnostic) => diagnostic.code === 'AUTHORITY_RETIRED'))
const callerFixtureImport = importCanonicalCandidate(callerAuthoredFixture.sourceAsset, { originalName: 'caller-authored-canonical-fixture.json' })
assert.ok(callerFixtureImport.candidate?.issues.length > 0, 'the public DOCX seam must reject a caller-authored canonical fixture as source bytes')
assert.equal(callerFixtureImport.candidate.interpretation, null)

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
