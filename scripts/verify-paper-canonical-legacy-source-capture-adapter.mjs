import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  trustedDocxCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import * as compilerModule from '../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  buildTicket26LegacyCompilerRequest,
  deriveTicket26LegacySource,
  resolveTicket26LegacySourceCapture,
} from '../server/paper-canonical/legacyTicket26SourceAdapter.mjs'
import * as trustedImport from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const root = new URL('..', import.meta.url)
const capturePath = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-2020-i/source-capture-v1.json'
const captureBytes = new Uint8Array(await readFile(new URL(capturePath, root)))
const batch = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/batch-evidence.json', root), 'utf8'))
const semanticOracles = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-legacy-source-adapter/semantic-oracles-v1.json', root), 'utf8'))
const { confirmCanonicalCandidate, importCanonicalCandidate } = trustedImport

function legacyInput(sourceCaptureBytes) {
  return { kind: 'ticket-26-source-capture-v1', sourceCaptureBytes }
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

function reconstructedPassage(group) {
  const questionNoByBlankId = new Map(
    group.blankIds.map((blankId, index) => [blankId, group.questions[index]?.questionNo]),
  )
  return (group.content?.blocks || []).map((block) => (block.inlines || []).map((inline) => (
    inline.kind === 'blank_ref'
      ? `__${questionNoByBlankId.get(inline.blankId)}__`
      : inline.text || ''
  )).join('')).join('\n')
}

function assertMarkerProjection(group) {
  const inlines = groupInlines(group)
  const blankRefs = inlines.filter((inline) => inline.kind === 'blank_ref')
  assert.deepEqual(
    blankRefs.map((inline) => inline.blankId),
    group.blankIds,
    `${group.groupId} must retain ordered Blank identities from its frozen question membership`,
  )
  assert.equal(new Set(blankRefs.map((inline) => inline.blankId)).size, group.blankIds.length)
  assert.equal(
    inlines.some((inline) => inline.kind === 'text' && /__\d+__/.test(inline.text)),
    false,
    `${group.groupId} must not leave a matched source marker as raw text`,
  )
  assert.equal(
    reconstructedPassage(group),
    (group.passage?.paragraphs || []).map((paragraph) => paragraph.text).join('\n'),
    `${group.groupId} marker projection must preserve all frozen passage text`,
  )
  for (const blankId of group.blankIds) {
    assert.deepEqual(
      group.sourceSpanRefsByTarget[`blank:${blankId}`],
      [group.sourceSpanId],
      `${group.groupId} ${blankId} must retain its frozen asset source span`,
    )
  }
}

function blockText(content, blockId) {
  const block = (content.blocks || []).find((candidate) => candidate.nodeId === blockId)
  return contentText({ blocks: block ? [block] : [] })
}

function observationById(source, observationId) {
  return source.observations.find((observation) => observation.observationId === observationId)
}

function candidateWithReboundDigest(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return { ...candidate, candidateDigest: digestJson(body) }
}

const resolved = resolveTicket26LegacySourceCapture(captureBytes)
assert.ok(resolved, 'the exact committed Ticket 26 capture must resolve through the trusted registry')
assert.equal(resolved.paperId, 'paper-2020-i')
assert.equal(resolved.capture.path, capturePath)
assert.deepEqual(
  resolved.documents.map(({ role, inputKey }) => ({ role, inputKey })),
  [
    { role: 'asset-projection', inputKey: 'latest_asset_projection' },
    { role: 'source-provenance', inputKey: 'latest_source_provenance' },
    { role: 'official-answer-lead', inputKey: 'latest_official_answer_lead' },
  ],
)

const source = deriveTicket26LegacySource(captureBytes)
assert.equal(source.paperId, 'paper-2020-i')
assert.equal(source.profileId, 'nck1')
assert.equal(source.sourceAssetVersion, 1)
assert.equal(source.groups.length, 9)
assert.deepEqual(
  source.groups.map((group) => ({ slotId: group.slotId, family: group.family })),
  [
    { slotId: 'reading.a', family: 'reading' },
    { slotId: 'reading.b', family: 'reading' },
    { slotId: 'reading.c', family: 'reading' },
    { slotId: 'reading.d', family: 'reading' },
    { slotId: 'reading.seven-choices', family: 'seven-choices' },
    { slotId: 'language.cloze', family: 'cloze' },
    { slotId: 'language.grammar-fill', family: 'grammar-fill' },
    { slotId: 'writing.application', family: 'application-writing' },
    { slotId: 'writing.continuation', family: 'continuation-writing' },
  ],
  'the representative paper must use only its frozen structural groups, in layout order',
)
assert.deepEqual(
  source.assertions.find((assertion) => assertion.questionId === 'q-2020-i-021'),
  {
    assertionId: 'answer:q-2020-i-021',
    questionId: 'q-2020-i-021',
    answer: 'A',
    authority: 'official',
    sourceSpanId: 'source-span:observation:ticket-26:paper-2020-i:official_answer_lead:document',
  },
  'answers must come from the frozen official answer-key document',
)
assert.equal(source.groups.find((group) => group.slotId === 'language.grammar-fill').blankIds.length, 10)
assert.equal(source.groups.find((group) => group.slotId === 'writing.application').writingTask.wordCountTarget, 80)
assert.equal(source.groups.find((group) => group.slotId === 'writing.continuation').writingTask.continuationStarters.length, 2)

const legacyAuthority = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
assert.equal(legacyAuthority.ok, true)
assert.equal(canonicalAuthorityRef.manifestVersion, '36', 'the migration source adapter must not advance current/publication authority')
assert.equal(trustedDocxCandidateAuthorityRef.manifestVersion, '37', 'the DOCX candidate seam must retain v37')
assert.equal(trustedLegacyCaptureCandidateAuthorityRef.manifestVersion, '39')
assert.equal(legacyAuthority.closure.artifacts.adapter.adapters.find((entry) => entry.adapterId === 'ticket-26-legacy-source-capture').version, '2')
assert.ok(legacyAuthority.closure.schemas['ticket-26-legacy-source-envelope-v1'])
assert.equal(Object.hasOwn(compilerModule, 'compileTrustedLegacyCaptureCandidate'), false, 'ordinary callers must not reach the privileged v39 compiler')
assert.deepEqual(Object.keys(trustedImport).sort(), ['confirmCanonicalCandidate', 'importCanonicalCandidate'])

const firstImport = importCanonicalCandidate(legacyInput(captureBytes))
const secondImport = importCanonicalCandidate(legacyInput(captureBytes))
assert.deepEqual(firstImport, secondImport, 'exact legacy capture derivation must be deterministic')
assert.ok(firstImport.candidate, 'the exact committed capture must produce an Import Candidate')
assert.equal(firstImport.candidate.schemaVersion, 'trusted-ticket-26-legacy-import-candidate-v1')
assert.equal(firstImport.candidate.authority.manifestVersion, '39')
assert.equal(firstImport.candidate.source.sha256, sha256(captureBytes))
assert.equal(firstImport.candidate.source.byteLength, captureBytes.byteLength)
assert.equal(firstImport.candidate.source.paperId, 'paper-2020-i', 'paper identity must be resolved from the trusted binding')
assert.deepEqual(
  firstImport.candidate.source.documents.map(({ role, sha256: digest, byteLength }) => ({ role, digest, byteLength })),
  resolved.documents.map(({ role, sha256: digest, byteLength }) => ({ role, digest, byteLength })),
  'candidate nested document identities must be copied only from the trusted registry',
)
assert.equal('canonicalPaper' in firstImport.candidate, false, 'candidate stage must not publish or emit Canonical Paper')
const { candidateDigest: firstCandidateDigest, sourceBytes: _firstSourceBytes, ...firstCandidateBody } = firstImport.candidate
assert.equal(firstCandidateDigest, digestJson(firstCandidateBody), 'candidate digest must bind the complete structural projection')

const genericBypass = compilerModule.compileCanonicalPaper({
  ...buildTicket26LegacyCompilerRequest(captureBytes),
  authority: trustedLegacyCaptureCandidateAuthorityRef,
})
assert.equal('canonicalPaper' in genericBypass.artifacts, false, 'generic compilation must not bypass Teacher Confirmation for v39')
assert.ok(genericBypass.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'AUTHORITY_RETIRED'))

const docxBytes = new Uint8Array(await readFile(new URL('test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx', root)))
const docxCandidate = importCanonicalCandidate(docxBytes, { originalName: '2025-nck1-answer-source.docx' })
assert.equal(docxCandidate.candidate?.schemaVersion, 'trusted-docx-import-candidate-v1', 'existing DOCX input must retain its source type and candidate schema')
assert.equal(docxCandidate.candidate?.authority.manifestVersion, '37', 'existing DOCX input must retain v37 authority')

const arbitraryJson = new TextEncoder().encode(JSON.stringify({
  schemaVersion: 'source-capture-v1',
  captureId: 'source-capture:caller-authored',
  digest: 'sha256:caller-authored',
  documents: [],
  observations: [],
  sourceSpans: [],
  assertions: [],
}))
assert.deepEqual(
  importCanonicalCandidate(legacyInput(arbitraryJson)).issues.map(({ code }) => code),
  ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'],
  'arbitrary self-consistent JSON cannot become a legacy Source',
)
for (const field of ['paperId', 'path', 'profile', 'groups', 'questions', 'answers']) {
  const result = importCanonicalCandidate({ ...legacyInput(captureBytes), [field]: { forged: true } })
  assert.equal(result.candidate, null, `${field} must never be accepted from a caller-authored legacy input`)
}
assert.deepEqual(
  importCanonicalCandidate(legacyInput(captureBytes), { groups: [] }).issues.map(({ code }) => code),
  ['CALLER_SEMANTICS_REJECTED'],
  'legacy input accepts no operator semantic choices',
)

const altered = new Uint8Array(captureBytes)
altered[altered.byteLength - 1] ^= 1
assert.equal(resolveTicket26LegacySourceCapture(altered), null, 'changed capture bytes cannot self-authenticate')

const captureJson = JSON.parse(new TextDecoder().decode(captureBytes))
const changedNestedBytes = structuredClone(captureJson)
changedNestedBytes.documents[0].encodedBytes = `${changedNestedBytes.documents[0].encodedBytes.slice(0, -2)}AA`
const changedNestedResult = importCanonicalCandidate(legacyInput(new TextEncoder().encode(JSON.stringify(changedNestedBytes))))
assert.deepEqual(changedNestedResult.issues.map(({ code }) => code), ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'], 'changed nested document bytes must be rejected even when outer JSON remains well-formed')

const changedRole = structuredClone(captureJson)
changedRole.documents[2].roles = ['asset-projection']
const changedRoleResult = importCanonicalCandidate(legacyInput(new TextEncoder().encode(JSON.stringify(changedRole))))
assert.deepEqual(changedRoleResult.issues.map(({ code }) => code), ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'], 'changed nested source roles must be rejected')

const otherCapture = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-2020-bing/source-capture-v1.json', root), 'utf8'))
const swappedAnswerKey = structuredClone(captureJson)
swappedAnswerKey.documents[2] = otherCapture.documents.find((document) => document.roles[0] === 'official-answer-lead')
const swappedAnswerResult = importCanonicalCandidate(legacyInput(new TextEncoder().encode(JSON.stringify(swappedAnswerKey))))
assert.deepEqual(swappedAnswerResult.issues.map(({ code }) => code), ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'], 'a swapped official answer key must be rejected')

for (const oracle of semanticOracles.oracles) {
  const oracleBytes = new Uint8Array(await readFile(new URL(oracle.source.relativePath, root)))
  const oracleCandidate = importCanonicalCandidate(legacyInput(oracleBytes)).candidate
  assert.ok(oracleCandidate, `${oracle.paperId} source-bound oracle must form a candidate`)
  assert.equal(oracleBytes.byteLength, oracle.source.byteLength)
  assert.equal(sha256(oracleBytes), oracle.source.sha256)
  assert.equal(oracleCandidate.source.sha256, oracle.source.sha256)
  assert.equal(oracleCandidate.source.byteLength, oracle.source.byteLength)
  assert.equal(oracleCandidate.interpretation.paperId, oracle.paperId)
  assert.equal(oracleCandidate.interpretation.profileId, oracle.profileId)
  assert.deepEqual(
    oracleCandidate.interpretation.groups.map(({ slotId, family }) => ({ slotId, family })),
    oracle.familySlots,
    `${oracle.paperId} must retain its reviewed complete family-slot shape`,
  )
  const group = oracleCandidate.interpretation.groups.find((candidate) => candidate.slotId === oracle.group.slotId)
  assert.deepEqual(
    { groupId: group?.groupId, family: group?.family },
    { groupId: oracle.group.groupId, family: oracle.group.family },
    `${oracle.paperId} must retain its reviewed group identity`,
  )
  assert.ok(group.questionIds.includes(oracle.group.questionId), `${oracle.paperId} must retain its reviewed question`)
  assert.ok(contentText(group.content).includes(oracle.group.textAnchor), `${oracle.paperId} must retain its reviewed source text anchor`)
  assert.equal(
    oracleCandidate.interpretation.assertions.find((assertion) => assertion.questionId === oracle.group.questionId)?.answer,
    oracle.officialAnswer,
    `${oracle.paperId} must take the reviewed answer from its frozen answer-key bytes`,
  )
}

const synchronizedDrift = structuredClone(firstImport.candidate)
synchronizedDrift.interpretation.groups[0].questionIds[0] = 'q-forged-001'
const synchronizedConfirmation = confirmCanonicalCandidate(candidateWithReboundDigest(synchronizedDrift), {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: candidateWithReboundDigest(synchronizedDrift).candidateDigest,
  sourceDigest: firstImport.candidate.source.sha256,
  confirmed: true,
})
assert.deepEqual(synchronizedConfirmation.unresolvedIssues.map(({ code }) => code), ['CANDIDATE_BINDING_MISMATCH'], 'a recomputed candidate digest cannot make synchronized semantic drift authoritative')

const allSources = await Promise.all(batch.membership.paperIds.map(async (paperId) => {
  const bytes = new Uint8Array(await readFile(new URL(
    `test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/${paperId}/source-capture-v1.json`,
    root,
  )))
  const trusted = resolveTicket26LegacySourceCapture(bytes)
  assert.ok(trusted, `${paperId} must resolve only through the committed batch`)
  const projected = deriveTicket26LegacySource(bytes)
  assert.equal(projected.paperId, paperId)
  assert.ok(projected.groups.length > 0, `${paperId} must project its frozen structural groups`)
  assert.ok(projected.assertions.length > 0, `${paperId} must project frozen official answers`)
  const candidate = importCanonicalCandidate(legacyInput(bytes))
  assert.ok(candidate.candidate, `${paperId} must enter the shared candidate seam`)
  assert.equal(candidate.candidate.source.paperId, paperId, `${paperId} identity must come from the trusted registry`)
  assert.equal(candidate.candidate.authority.manifestVersion, '39')
  return { paperId, bytes, projected, candidate: candidate.candidate }
}))
assert.equal(allSources.length, 31, 'the full Ticket 26 batch must project 31 of 31 captures')
assert.deepEqual(
  [...new Set(allSources.map(({ projected }) => projected.profileId))].sort(),
  ['national-legacy', 'nck1', 'zhejiang-legacy'],
  'one shared structural mapper must cover all three frozen profile shapes',
)

const sourceByPaperId = new Map(allSources.map((entry) => [entry.paperId, entry.projected]))
for (const paperId of ['paper-2020-i', 'paper-2020-bing', 'paper-zj-2020-jan']) {
  const projected = sourceByPaperId.get(paperId)
  for (const slotId of ['reading.seven-choices', 'language.cloze', 'language.grammar-fill']) {
    assertMarkerProjection(
      projected.groups.find((group) => group.slotId === slotId),
    )
  }
}

const nck1Source = sourceByPaperId.get('paper-2020-i')
const nck1Grammar = nck1Source.groups.find((group) => group.slotId === 'language.grammar-fill')
const grammarBlankId = 'blank-2020-i-058'
const grammarBlankPosition = groupInlines(nck1Grammar).findIndex(
  (inline) => inline.kind === 'blank_ref' && inline.blankId === grammarBlankId,
)
assert.equal(
  groupInlines(nck1Grammar)[grammarBlankPosition + 1]?.text,
  ' (form)',
  'a source prompt remains the immediate sibling of its grammar Blank even when the following source byte is NBSP',
)
assert.deepEqual(
  nck1Grammar.sourceSpanRefsByTarget[`prompt_provision:${grammarBlankId}`],
  [`source-span:observation:ticket-26:paper-2020-i:grammar-fill-prompt:${grammarBlankId}`],
)

const nck1Application = nck1Source.groups.find((group) => group.slotId === 'writing.application')
assert.deepEqual(
  nck1Application.variant,
  {
    family: 'application-writing',
    mode: 'legacy_opaque',
    writingTaskId: nck1Application.writingTask.writingTaskId,
    sourceTaskType: 'application',
    contentBlockRefs: nck1Application.content.blocks.map((block) => block.nodeId),
    wordCountTarget: nck1Application.writingTask.wordCountTarget,
    wordCountTargetCertainty: 'explicit_legacy_field',
    wordCountScope: 'unspecified',
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'generic_response_box',
      answerRegionRef: 'writing.application-box',
      ownership: 'product',
    },
  },
  'Application Writing must preserve its complete source stream without inventing rich semantic roles',
)
assert.deepEqual(
  nck1Application.content.blocks.map((block) => block.nodeId),
  nck1Application.passage.paragraphs.map((paragraph) => paragraph.paragraphId),
  'Application Writing must retain the frozen paragraph structure without classifying it as prompt or answer-region content',
)
assert.ok(contentText(nck1Application.content).includes('A Cross-Country Running Race'))
assert.equal(
  nck1Application.sourceSpanId,
  'source-span:observation:ticket-26:paper-2020-i:asset_projection:document',
)
assert.equal(
  nck1Source.observations.some((observation) => observation.kind.startsWith('application_')),
  false,
  'the adapter must not manufacture application absence, word-count, or response observations',
)
const applicationGroups = allSources.flatMap(({ paperId, projected }) => projected.groups
  .filter((group) => group.family === 'application-writing')
  .map((group) => ({ paperId, group })))
assert.equal(applicationGroups.length, 22)
for (const { paperId, group } of applicationGroups) {
  assert.equal(group.writingTask?.taskType, 'application', `${paperId} must retain its explicit task type`)
  for (const field of ['situation', 'contentRequirements', 'givenSkeleton', 'response', 'answerRegion']) {
    assert.equal(
      Object.hasOwn(group.writingTask, field),
      false,
      `${paperId} frozen writingTask has no structurally labelled ${field} field`,
    )
  }
}

const nck1Continuation = nck1Source.groups.find((group) => group.slotId === 'writing.continuation')
assert.equal(nck1Continuation.variant.writingTaskId, nck1Continuation.writingTask.writingTaskId)
assert.equal(nck1Continuation.variant.mode, 'legacy_opaque')
assert.equal(nck1Continuation.variant.wordCountTarget, nck1Continuation.writingTask.wordCountTarget)
assert.equal(nck1Continuation.variant.wordCountScope, 'unspecified')
assert.deepEqual(
  nck1Continuation.variant.sourceStarterBlockRefs.map((blockId) => blockText(
    nck1Continuation.content,
    blockId,
  )),
  nck1Continuation.writingTask.continuationStarters,
  'Continuation source starter-array entries must be retained without response-bound placement claims',
)
assert.equal(
  nck1Source.observations.some((observation) => observation.kind.startsWith('continuation_')),
  false,
  'the adapter must not manufacture Continuation word-count, starter, absence, or response observations',
)

const nationalSource = sourceByPaperId.get('paper-2020-bing')
assert.deepEqual(
  Object.keys(nationalSource.inactiveSlots).sort(),
  ['listening.long-form', 'listening.short-dialogue', 'writing.guided-writing', 'writing.short-error-correction'],
)
for (const refs of Object.values(nationalSource.inactiveSlots)) {
  assert.deepEqual(refs, [nationalSource.groups[0].sourceSpanId])
}

const unmatchedMarkerSource = sourceByPaperId.get('paper-960d0f8d')
const unmatchedGrammar = unmatchedMarkerSource.groups.find((group) => group.slotId === 'language.grammar-fill')
assert.equal(groupInlines(unmatchedGrammar).filter((inline) => inline.kind === 'blank_ref').length, 0)
assert.ok(contentText(unmatchedGrammar.content).includes('56._____'))

const ambiguousStarterSource = sourceByPaperId.get('paper-zj-2022-jun')
const ambiguousContinuation = ambiguousStarterSource.groups.find((group) => group.slotId === 'writing.continuation')
assert.equal(ambiguousContinuation.variant.mode, 'legacy_opaque')
assert.equal(ambiguousContinuation.variant.sourceStarterBlockRefs.length, 3)
assert.deepEqual(
  ambiguousContinuation.variant.sourceStarterBlockRefs.map((blockId) => blockText(
    ambiguousContinuation.content,
    blockId,
  )),
  ambiguousContinuation.writingTask.continuationStarters,
  'a three-entry frozen starter field must be preserved whole rather than guessed into response starters',
)

const confirmation = {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: firstImport.candidate.candidateDigest,
  sourceDigest: firstImport.candidate.source.sha256,
  confirmed: true,
}
const confirmationResult = confirmCanonicalCandidate(firstImport.candidate, confirmation)
assert.equal(
  Number(Boolean(confirmationResult.canonicalPaper)) + Number(Array.isArray(confirmationResult.unresolvedIssues)),
  1,
  'confirmed legacy input must yield exactly one Canonical Paper or one unresolved result, never a partial paper',
)
assert.equal('publication' in confirmationResult, false, 'Teacher Confirmation must not publish')
assert.ok(confirmationResult.canonicalPaper, 'opaque Application Writing confirms as one complete Canonical Paper')
assert.ok(confirmationResult.canonicalPaper.sourceCapture, 'confirmation carries the exact compiled Source Capture for downstream projection')
assert.deepEqual(
  confirmCanonicalCandidate(firstImport.candidate, { ...confirmation, sourceDigest: 'sha256:forged' }).unresolvedIssues.map(({ code }) => code),
  ['CONFIRMATION_SOURCE_MISMATCH'],
)
assert.deepEqual(
  confirmCanonicalCandidate(firstImport.candidate, { ...confirmation, candidateDigest: 'sha256:forged' }).unresolvedIssues.map(({ code }) => code),
  ['CONFIRMATION_CANDIDATE_MISMATCH'],
)
assert.deepEqual(
  confirmCanonicalCandidate(firstImport.candidate, { ...confirmation, confirmed: false }).unresolvedIssues.map(({ code }) => code),
  ['TEACHER_CONFIRMATION_REQUIRED'],
)

const confirmations = allSources.map(({ paperId, candidate }) => {
  const result = confirmCanonicalCandidate(candidate, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  })
  return {
    paperId,
    result,
    ...(result.canonicalPaper
      ? { disposition: 'canonical' }
      : { disposition: 'unresolved', codes: [...new Set(result.unresolvedIssues.map(({ code }) => code))].sort() }),
  }
})
assert.deepEqual(
  confirmations
    .filter((item) => item.disposition === 'unresolved')
    .map(({ paperId, codes }) => ({ paperId, codes })),
  [
    {
      paperId: 'paper-960d0f8d',
      codes: [
        'GRAMMAR_FILL_PROMPT_SOURCE_DISAGREEMENT',
        'REFERENCE_BLANK_OCCURRENCE',
      ],
    },
    {
      paperId: 'paper-zj-2020-jul',
      codes: [
        'GROUP_CARDINALITY_MISMATCH',
        'GROUP_NUMBERING_RANGE_MISMATCH',
      ],
    },
  ],
  'the measured full batch retains only the unrelated frozen grammar and reading/profile conflicts',
)
assert.equal(confirmations.filter((item) => item.disposition === 'canonical').length, 29)
assert.equal(confirmations.filter((item) => item.disposition === 'unresolved').length, 2)
const dryRun = process.argv.includes('--dry-run')
const unresolved = dryRun ? confirmations : []
const unresolvedPaperIds = unresolved.filter((item) => item.disposition === 'unresolved').map((item) => item.paperId)
const unresolvedByCodeSet = Object.values(unresolved
  .filter((item) => item.disposition === 'unresolved')
  .reduce((groups, item) => {
    const key = item.codes.join('|')
    const current = groups[key] || { codes: item.codes, paperIds: [] }
    current.paperIds.push(item.paperId)
    groups[key] = current
    return groups
  }, {}))

console.log(JSON.stringify({
  status: 'PASS',
  paperId: source.paperId,
  groupCount: source.groups.length,
  candidateAccounting: { candidates: allSources.length, expected: 31 },
  ...(dryRun ? { unresolvedPaperIds, unresolvedByCodeSet } : {}),
}))
