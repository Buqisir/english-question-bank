import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import manifestV40 from '../standards/paper-canonical/manifest-v40.json' with { type: 'json' }
import manifestV41 from '../standards/paper-canonical/manifest-v41.json' with { type: 'json' }
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
const predecessorCapturePath = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-2020-i/source-capture-v1.json'
const capturePath = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/paper-2020-i/source-capture-v1.json'
const captureBytes = new Uint8Array(await readFile(new URL(capturePath, root)))
const predecessorBatch = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/batch-evidence.json', root), 'utf8'))
const batch = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/batch-evidence.json', root), 'utf8'))
const paper2026CapturePath = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/paper-2026-i/source-capture-v1.json'
const paper2026CaptureBytes = new Uint8Array(await readFile(new URL(paper2026CapturePath, root)))
const paper2026FrozenAssetBytes = new Uint8Array(await readFile(new URL('app/public/paper-assets/paper-2026-i/latest/paper-asset.json', root)))
const paper2026FrozenAsset = JSON.parse(new TextDecoder().decode(paper2026FrozenAssetBytes))
const paper2026FrozenAnswers = JSON.parse(await readFile(new URL('app/public/paper-assets/paper-2026-i/latest/answer-key.json', root), 'utf8'))
const paper2026FrozenFigures = JSON.parse(await readFile(new URL('app/public/paper-assets/paper-2026-i/latest/figures/manifest.json', root), 'utf8'))
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

assert.equal(predecessorBatch.batchDigest, 'sha256:f0e783ac08b9e42b606359a390360359e12e6996a1ed9d31bf82d69d959c8c41')
assert.equal(predecessorBatch.membership.frozenPaperCount, 33)
assert.deepEqual(predecessorBatch.membership.excludedPaperIds, ['paper-2025-i', 'paper-2026-i'])
assert.equal(predecessorBatch.membership.materializedPaperCount, 31)
assert.equal(predecessorBatch.membership.paperIds.length, 31)
assert.equal(new Set(predecessorBatch.membership.paperIds).size, 31)
assert.equal(predecessorBatch.membership.paperIds.includes('paper-2026-i'), false)
assert.equal(predecessorBatch.atomicBatch.mode, 'all_or_none')
assert.equal(batch.membership.frozenPaperCount, 33)
assert.equal(batch.batchDigest, 'sha256:64e0d1f4db7ff530710a3f73803a382bef6a2d10d737d926f8fbd6800f99acf5')
assert.deepEqual(batch.membership.excludedPaperIds, ['paper-2025-i'])
assert.equal(batch.membership.materializedPaperCount, 32)
assert.equal(batch.membership.paperIds.includes('paper-2026-i'), true)
assert.equal(batch.atomicBatch.mode, 'all_or_none')
assert.equal(batch.atomicBatch.preservesExistingBytes, true)
assert.deepEqual(
  batch.membership.paperIds.filter((paperId) => paperId !== 'paper-2026-i'),
  predecessorBatch.membership.paperIds,
  'v2 must add exactly paper-2026-i to the immutable predecessor membership',
)
for (const paperId of predecessorBatch.membership.paperIds) {
  const predecessorBytes = new Uint8Array(await readFile(new URL(
    `test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/${paperId}/source-capture-v1.json`,
    root,
  )))
  const v2Bytes = new Uint8Array(await readFile(new URL(
    `test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/${paperId}/source-capture-v1.json`,
    root,
  )))
  assert.deepEqual(v2Bytes, predecessorBytes, `${paperId} must retain byte-identical predecessor source capture evidence`)
}
assert.deepEqual(
  captureBytes,
  new Uint8Array(await readFile(new URL(predecessorCapturePath, root))),
  'the representative predecessor capture must remain byte-identical in v2',
)
assert.equal(sha256(paper2026CaptureBytes), 'sha256:398b386bd2a1d343a96623232d81914b5d5fb6f8308d188761bd9f224f4a84cd')

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
const legacyV41Authority = resolveCanonicalAuthority({
  manifestId: manifestV41.manifestId,
  manifestVersion: manifestV41.version,
  manifestDigest: digestJson(manifestV41),
})
assert.equal(legacyAuthority.ok, true)
assert.equal(legacyV41Authority.ok, true, 'the prior v41 authority must remain resolvable')
assert.equal(canonicalAuthorityRef.manifestVersion, '36', 'the migration source adapter must not advance current/publication authority')
assert.equal(trustedDocxCandidateAuthorityRef.manifestVersion, '37', 'the DOCX candidate seam must retain v37')
assert.equal(trustedLegacyCaptureCandidateAuthorityRef.manifestVersion, '42')
assert.equal(legacyV41Authority.closure.artifacts.adapter.adapters.find((entry) => entry.adapterId === 'ticket-26-legacy-source-capture').version, '3')
assert.equal(legacyAuthority.closure.artifacts.adapter.adapters.find((entry) => entry.adapterId === 'ticket-26-legacy-source-capture').version, '4')
assert.ok(legacyAuthority.closure.schemas['ticket-26-legacy-source-envelope-v1'])
assert.equal(Object.hasOwn(compilerModule, 'compileTrustedLegacyCaptureCandidate'), false, 'ordinary callers must not reach the privileged v42 compiler')
assert.deepEqual(Object.keys(trustedImport).sort(), ['confirmCanonicalCandidate', 'importCanonicalCandidate'])

const firstImport = importCanonicalCandidate(legacyInput(captureBytes))
const secondImport = importCanonicalCandidate(legacyInput(captureBytes))
assert.deepEqual(firstImport, secondImport, 'exact legacy capture derivation must be deterministic')
assert.ok(firstImport.candidate, 'the exact committed capture must produce an Import Candidate')
assert.equal(firstImport.candidate.schemaVersion, 'trusted-ticket-26-legacy-import-candidate-v1')
assert.equal(firstImport.candidate.authority.manifestVersion, '42')
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
assert.equal('canonicalPaper' in genericBypass.artifacts, false, 'generic compilation must not bypass Teacher Confirmation for v42')
assert.ok(genericBypass.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'AUTHORITY_RETIRED'))

const docxBytes = new Uint8Array(await readFile(new URL('test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx', root)))
const docxCandidate = importCanonicalCandidate(docxBytes, { originalName: '2025-nck1-answer-source.docx' })
assert.equal(docxCandidate.candidate?.schemaVersion, 'trusted-docx-import-candidate-v1', 'existing DOCX input must retain its source type and candidate schema')
assert.equal(docxCandidate.candidate?.authority.manifestVersion, '37', 'existing DOCX input must retain v37 authority')
const paper2026DocxAttempt = importCanonicalCandidate(
  paper2026FrozenAssetBytes,
  { originalName: 'paper-2026-i-paper-asset.json' },
)
assert.equal(paper2026DocxAttempt.candidate, null, 'paper-2026-i frozen JSON must never become a DOCX candidate')
assert.deepEqual(
  paper2026DocxAttempt.issues.map(({ code }) => code),
  ['DOCX_SOURCE_DOCUMENT_INVALID'],
  'the v37 DOCX adapter must reject paper-2026-i non-DOCX source bytes',
)

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

const otherCapture = JSON.parse(await readFile(new URL('test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/paper-2020-bing/source-capture-v1.json', root), 'utf8'))
const swappedAnswerKey = structuredClone(captureJson)
swappedAnswerKey.documents[2] = otherCapture.documents.find((document) => document.roles[0] === 'official-answer-lead')
const swappedAnswerResult = importCanonicalCandidate(legacyInput(new TextEncoder().encode(JSON.stringify(swappedAnswerKey))))
assert.deepEqual(swappedAnswerResult.issues.map(({ code }) => code), ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'], 'a swapped official answer key must be rejected')

const paper2026CaptureJson = JSON.parse(new TextDecoder().decode(paper2026CaptureBytes))
assert.equal(paper2026CaptureJson.digest, 'sha256:0212a1e5f5cfe2b7c9e2ea0550ac1e6b029b05838324856c1356cd8c3e129a15')
const changedFigureMedia = structuredClone(paper2026CaptureJson)
const figureMediaIndex = changedFigureMedia.documents.findIndex((document) => document.roles[0] === 'figure-media')
assert.notEqual(figureMediaIndex, -1, 'paper-2026-i capture must carry its frozen PNG as figure media')
changedFigureMedia.documents[figureMediaIndex].encodedBytes = `${changedFigureMedia.documents[figureMediaIndex].encodedBytes.slice(0, -2)}AA`
assert.deepEqual(
  importCanonicalCandidate(legacyInput(new TextEncoder().encode(JSON.stringify(changedFigureMedia)))).issues.map(({ code }) => code),
  ['TICKET_26_LEGACY_CAPTURE_UNTRUSTED'],
  'a caller-substituted Figure PNG cannot become legacy source authority',
)

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
    `test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/${paperId}/source-capture-v1.json`,
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
  assert.equal(candidate.candidate.authority.manifestVersion, '42')
  return { paperId, bytes, projected, candidate: candidate.candidate }
}))
assert.equal(allSources.length, 32, 'the full Ticket 26 batch must project 32 of 32 captures')
assert.deepEqual(
  [...new Set(allSources.map(({ projected }) => projected.profileId))].sort(),
  ['national-legacy', 'nck1', 'zhejiang-legacy'],
  'one shared structural mapper must cover all three frozen profile shapes',
)

const sourceByPaperId = new Map(allSources.map((entry) => [entry.paperId, entry.projected]))
const paper2026Entry = allSources.find((entry) => entry.paperId === 'paper-2026-i')
const paper2026Resolved = resolveTicket26LegacySourceCapture(paper2026CaptureBytes)
assert.ok(paper2026Entry, 'paper-2026-i must enter the same 32-paper legacy source batch')
assert.ok(paper2026Resolved, 'paper-2026-i must resolve only through its exact v2 capture bytes')
assert.equal(paper2026Resolved.capture.path, paper2026CapturePath)
assert.deepEqual(
  paper2026Resolved.documents.map(({ role, inputKey, mediaType }) => ({ role, inputKey, mediaType })),
  [
    { role: 'asset-projection', inputKey: 'latest_asset_projection', mediaType: 'application/json' },
    { role: 'source-provenance', inputKey: 'latest_source_provenance', mediaType: 'application/json' },
    { role: 'official-answer-lead', inputKey: 'latest_official_answer_lead', mediaType: 'application/json' },
    { role: 'figure-inventory', inputKey: 'latest_figure_inventory', mediaType: 'application/json' },
    { role: 'figure-media', inputKey: 'latest_figure_media_fig_paper_2026_i_reading_a_table_1', mediaType: 'image/png' },
  ],
  'paper-2026-i must carry only its exact frozen JSON source documents plus declared figure inventory and PNG',
)
const paper2026Source = paper2026Entry.projected
assert.equal(paper2026Source.profileId, 'nck1')
assert.equal(paper2026Source.groups.length, 9)
assert.equal(paper2026Source.assertions.length, 45)
assert.deepEqual(
  paper2026Source.groups.map((group) => group.groupId),
  paper2026FrozenAsset.layoutTree.parts
    .flatMap((part) => part.sections)
    .flatMap((section) => section.groups)
    .map((group) => group.groupId),
  'paper-2026-i must retain frozen legacy group order',
)
for (const answer of Object.values(paper2026FrozenAnswers.answers)) {
  assert.equal(
    paper2026Source.assertions.find((candidate) => candidate.questionId === answer.questionId)?.answer,
    answer.answer,
    `${answer.questionId} must remain bound to the exact frozen official answer key`,
  )
}
const paper2026ReadingA = paper2026Source.groups.find((group) => group.groupId === 'group-2026-i-reading-a')
const paper2026Figure = paper2026FrozenFigures.figures[0]
const paper2026FigureDocument = paper2026Resolved.documents.find((document) => document.role === 'figure-media')
const paper2026InventoryDocument = paper2026Resolved.documents.find((document) => document.role === 'figure-inventory')
const paper2026FigureMediaSpan = paper2026Resolved.captureValue.observations.find((observation) => observation.documentId === paper2026FigureDocument.documentId && observation.kind === 'immutable_source_document').sourceSpanId
const paper2026FigureInventorySpan = paper2026Resolved.captureValue.observations.find((observation) => observation.documentId === paper2026InventoryDocument.documentId && observation.kind === 'immutable_source_document').sourceSpanId
const paper2026FigureBlock = paper2026ReadingA.content.blocks.find((block) => block.kind === 'figure')
assert.deepEqual(
  paper2026FigureBlock,
  {
    kind: 'figure',
    nodeId: `figure:${paper2026Figure.figureId}`,
    mediaId: paper2026Figure.figureId,
    caption: [{
      kind: 'text',
      nodeId: `text:figure:${paper2026Figure.figureId}:caption`,
      text: paper2026Figure.caption,
    }],
  },
  'the frozen marker must become one opaque Figure, not invented table rows or cells',
)
assert.deepEqual(
  paper2026ReadingA.media,
  [{
    mediaId: paper2026Figure.figureId,
    mimeType: 'image/png',
    sha256: paper2026FigureDocument.sha256,
    pixelWidth: 1780,
    pixelHeight: 348,
    sourceArtifactRef: { artifactId: paper2026FigureDocument.immutableArtifactRef.artifactId },
  }],
  'the Figure media must close the exact frozen PNG bytes and dimensions',
)
const frozenReadingAParagraph = paper2026FrozenAsset.content.groups['group-2026-i-reading-a'].passage.paragraphs[2]
assert.equal(
  blockText(paper2026ReadingA.content, frozenReadingAParagraph.paragraphId),
  frozenReadingAParagraph.text.slice(paper2026Figure.placeholderMarker.length),
  'the Figure marker replacement must preserve every remaining frozen paragraph character and order',
)
assert.equal(contentText(paper2026ReadingA.content).includes(paper2026Figure.placeholderMarker), false)
assert.deepEqual(
  paper2026ReadingA.sourceSpanRefsByTarget[`media:${paper2026Figure.figureId}`],
  [paper2026FigureMediaSpan, paper2026FigureInventorySpan],
  'Figure media must be source-mapped to its exact PNG and frozen inventory declaration',
)
assert.deepEqual(
  paper2026ReadingA.sourceSpanRefsByTarget[`content_node:figure:${paper2026Figure.figureId}`],
  [paper2026ReadingA.sourceSpanId, paper2026FigureInventorySpan, paper2026FigureMediaSpan],
  'Figure placement must bind the legacy marker, inventory declaration, and PNG source spans',
)
assert.deepEqual(
  paper2026Entry.candidate.source.documents.map(({ role, sha256: digest, byteLength }) => ({ role, digest, byteLength })),
  paper2026Resolved.documents.map(({ role, sha256: digest, byteLength }) => ({ role, digest, byteLength })),
  'paper-2026-i Candidate must consume only the exact trusted capture documents',
)
const legacyV40Authority = resolveCanonicalAuthority({
  manifestId: manifestV40.manifestId,
  manifestVersion: manifestV40.version,
  manifestDigest: digestJson(manifestV40),
})
assert.equal(legacyV40Authority.ok, true, 'the prior v40 authority must remain available')
const zhejiangV9Profile = legacyV40Authority.closure.profiles.get('zhejiang-legacy')
assert.equal(zhejiangV9Profile.version, '9', 'v41 must preserve the prior Zhejiang v9 authority')
assert.deepEqual(
  zhejiangV9Profile.parts
    .flatMap((part) => part.sections)
    .find((section) => section.sectionId === 'reading.choice')
    .slots
    .map((slot) => slot.questionCardinality),
  [
    { kind: 'exact', count: 3 },
    { kind: 'one_of', counts: [3, 4] },
    { kind: 'one_of', counts: [3, 4] },
  ],
  'the historical v9 3/4/3-compatible profile remains immutable',
)
const zhejiangProfile = legacyAuthority.closure.profiles.get('zhejiang-legacy')
assert.equal(zhejiangProfile.version, '10')
const zhejiangReadingChoice = zhejiangProfile.parts
  .flatMap((part) => part.sections)
  .find((section) => section.sectionId === 'reading.choice')
assert.ok(zhejiangReadingChoice)
assert.deepEqual(
  zhejiangReadingChoice.slots.map((slot) => ({
    slotId: slot.slotId,
    questionCardinality: slot.questionCardinality,
    numberingRule: slot.numberingRule,
    scoringRule: slot.scoringRule,
  })),
  [
    {
      slotId: 'reading.a',
      questionCardinality: { kind: 'one_of', counts: [3, 4] },
      numberingRule: { end: 23, kind: 'range', start: 21 },
      scoringRule: { kind: 'per_question', points: 2.5 },
    },
    {
      slotId: 'reading.b',
      questionCardinality: { kind: 'one_of', counts: [3, 4] },
      numberingRule: { end: 26, kind: 'range', start: 24 },
      scoringRule: { kind: 'per_question', points: 2.5 },
    },
    {
      slotId: 'reading.c',
      questionCardinality: { kind: 'one_of', counts: [3, 4] },
      numberingRule: { end: 30, kind: 'range', start: 27 },
      scoringRule: { kind: 'per_question', points: 2.5 },
    },
  ],
  'Zhejiang v10 derives all three reading groups from one contiguous 21-30 authority',
)
const permittedZhejiangLayouts = zhejiangReadingChoice.slots[0].questionCardinality.counts.flatMap((a) =>
  zhejiangReadingChoice.slots[1].questionCardinality.counts.flatMap((b) =>
    zhejiangReadingChoice.slots[2].questionCardinality.counts.map((c) => [a, b, c])),
).filter((counts) => (
  zhejiangReadingChoice.slots[0].numberingRule.start + counts.reduce((total, count) => total + count, 0) - 1
    === zhejiangReadingChoice.slots.at(-1).numberingRule.end
))
assert.deepEqual(
  permittedZhejiangLayouts,
  [[3, 3, 4], [3, 4, 3], [4, 3, 3]],
  'the contiguous authority must reject every non-observed Zhejiang reading permutation',
)
for (const { paperId, counts } of [
  { paperId: 'paper-zj-2020-jan', counts: [3, 3, 4] },
  { paperId: 'paper-zj-2021-jun', counts: [3, 4, 3] },
  { paperId: 'paper-zj-2020-jul', counts: [4, 3, 3] },
]) {
  const reading = sourceByPaperId.get(paperId).groups.filter((group) => group.family === 'reading')
  assert.deepEqual(reading.map((group) => group.questionIds.length), counts, `${paperId} must retain its frozen Zhejiang reading layout`)
  assert.deepEqual(
    reading.flatMap((group) => group.questions.map((question) => question.questionNo)),
    [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    `${paperId} must retain one contiguous 21-30 reading number sequence`,
  )
  assert.equal(
    reading.reduce((total, group) => total + group.questionIds.length * 2.5, 0),
    zhejiangReadingChoice.score,
    `${paperId} must close the Zhejiang reading section at 25 points`,
  )
}
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
assert.equal(applicationGroups.length, 23)
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
const unmatchedMarkerCandidate = allSources.find(({ paperId }) => paperId === 'paper-960d0f8d').candidate
assert.deepEqual(
  unmatchedMarkerCandidate.interpretation.assertions
    .filter((assertion) => unmatchedGrammar.questionIds.includes(assertion.questionId)),
  unmatchedMarkerSource.assertions
    .filter((assertion) => unmatchedGrammar.questionIds.includes(assertion.questionId)),
  'numeric Grammar Fill projection must retain the frozen answer identities',
)
assert.deepEqual(
  groupInlines(unmatchedGrammar)
    .filter((inline) => inline.kind === 'blank_ref')
    .map((inline) => inline.blankId),
  unmatchedGrammar.blankIds,
  'a frozen numeric-marker Grammar Fill source must bind each source-declared Blank once and in source order',
)
assert.equal(
  reconstructedLegacyNumericPassage(unmatchedGrammar),
  unmatchedGrammar.passage.paragraphs.map((paragraph) => paragraph.text).join('\n'),
  'numeric Grammar Fill marker projection must preserve the exact frozen visible source text',
)
assert.deepEqual(
  unmatchedGrammar.variant.promptBindings.map(({ blankId, provision }) => ({ blankId, provision })),
  unmatchedGrammar.blankIds.map((blankId) => ({ blankId, provision: 'source_proven_none' })),
  'the numeric-marker source must not manufacture Grammar Fill prompts',
)
for (const numericProse of ['25-30g a day', '800g a day', '10g per day', '3-5g every few days']) {
  assert.ok(
    contentText(unmatchedGrammar.content).includes(numericProse),
    `unrelated numeric prose ${numericProse} must remain literal text rather than becoming a Blank`,
  )
}

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
  [],
  'the bounded legacy source adaptations must close every frozen Ticket 26 paper without unresolved output',
)
assert.equal(confirmations.filter((item) => item.disposition === 'canonical').length, 32)
assert.equal(confirmations.filter((item) => item.disposition === 'unresolved').length, 0)
for (const { paperId, result } of confirmations) {
  assert.equal(
    Number(Boolean(result.canonicalPaper)) + Number(Array.isArray(result.unresolvedIssues)),
    1,
    `${paperId} must remain all-or-none after Teacher Confirmation`,
  )
  assert.equal(
    result.canonicalPaper?.paperPlan?.completeness?.status,
    'complete',
    `${paperId} must form one complete Canonical Paper`,
  )
  assert.equal(
    'publication' in result,
    false,
    `${paperId} confirmation must remain unpublished`,
  )
}
const unmatchedMarkerConfirmation = confirmations.find(({ paperId }) => paperId === 'paper-960d0f8d').result
assert.deepEqual(
  unmatchedMarkerConfirmation.canonicalPaper.sourceCapture.assertions
    .filter((assertion) => unmatchedGrammar.questionIds.includes(assertion.questionId)),
  unmatchedMarkerSource.assertions
    .filter((assertion) => unmatchedGrammar.questionIds.includes(assertion.questionId)),
  'Teacher Confirmation must preserve the numeric Grammar Fill answer identities',
)
const paper2026Confirmation = confirmations.find(({ paperId }) => paperId === 'paper-2026-i').result
assert.ok(paper2026Confirmation.canonicalPaper, 'paper-2026-i exact source must confirm to one complete unpublished Canonical Paper')
assert.equal(paper2026Confirmation.canonicalPaper.paperPlan.completeness.status, 'complete')
assert.equal('publication' in paper2026Confirmation, false)
assert.deepEqual(
  {
    trustedLegacyJson: confirmations.filter((item) => item.disposition === 'canonical').length,
    trustedDocxV37: Number(Boolean(docxCandidate.candidate)),
  },
  { trustedLegacyJson: 32, trustedDocxV37: 1 },
  'zero-write accounting must close 32 legacy JSON inputs plus the sole v37 DOCX seam input',
)
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
  candidateAccounting: { candidates: allSources.length, expected: 32, combinedTrustedInputs: allSources.length + Number(Boolean(docxCandidate.candidate)) },
  ...(dryRun ? { unresolvedPaperIds, unresolvedByCodeSet } : {}),
}))
