import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  compileCanonicalPaper,
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import {
  nck1AnalyzedPackageCandidateAuthorityRef55,
  nck1MaterializationCandidateAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import * as nck1CanonicalRequestModule from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  deriveNck1AnalyzedPackageBundle,
  parseStrictPackageJson,
} from '../server/paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import {
  buildNck1AnalyzedPackageReviewSourceManifest,
  buildNck1CompatibilityPackage,
  buildNck1ReviewProjection,
  loadNck1ReviewSource,
} from '../server/import-review/revisionProjection.mjs'
import {
  admitCanonicalPaperImport,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const {
  admitLiveConfirmedNck1AnalyzedPackageImport,
  materializeNck1CanonicalRequest,
} = nck1CanonicalRequestModule
const encoder = new TextEncoder()

function pointerEscape(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function packageInput({ listening = false, contentMemberId = 'content', mutateContent, extraMembers = [] } = {}) {
  const content = structuredClone(makeFixture({ listening }))
  delete content.documents
  delete content.sourceCoverage
  content.schemaVersion = 'nck1-analyzed-package-content-v1'
  if (content.listening.state === 'not_supplied') {
    content.listening.evidence.kind = 'package_declares_no_listening_content'
    content.listening.evidence.documentId = contentMemberId
  }
  const continuation = content.groups.find((group) =>
    group.slotId === 'writing.continuation')
  const oldPrompt = continuation.writingTask.prompt
  const registeredPrompt = resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure.profiles.get('nck1').instructions['writing.continuation.prompt'].text
  continuation.writingTask.prompt = registeredPrompt
  continuation.blocks.find((block) =>
    block.content?.some((item) => item.text === oldPrompt)).content[0].text = registeredPrompt
  function attachPointers(value, pointer = '') {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((item, index) => attachPointers(item, `${pointer}/${index}`))
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (['page_region', 'docx_part'].includes(child?.kind)) {
        value[key] = {
          kind: 'package_json_pointer', documentId: contentMemberId, pointer,
        }
      } else attachPointers(child, `${pointer}/${pointerEscape(key)}`)
    }
  }
  attachPointers(content)
  mutateContent?.(content)
  const contentBytes = encoder.encode(JSON.stringify(content))
  const members = [
    { memberId: contentMemberId, role: 'content', mediaType: 'application/json', bytes: contentBytes },
    ...extraMembers,
  ]
  const inventory = members.map((member) => ({
    memberId: member.memberId,
    role: member.role,
    mediaType: member.mediaType,
    sha256: sha256(member.bytes),
    byteLength: member.bytes.byteLength,
  }))
  const manifestBytes = encoder.encode(JSON.stringify({
    schemaVersion: 'nck1-analyzed-package-v1',
    paperId: content.paperId,
    profileId: 'nck1',
    contentMemberId,
    members: inventory,
  }))
  return { kind: 'nck1-analyzed-package', manifestBytes, members }
}

const input = packageInput({
  extraMembers: [{
    memberId: 'analysis-reading', role: 'analysis', mediaType: 'application/json',
    bytes: encoder.encode('{"schemaVersion":"synthetic-analysis-v1","complete":true}'),
  }],
})
const imported = importCanonicalCandidate(input)
assert.deepEqual(imported.issues, [])
assert.equal(imported.candidate.schemaVersion, 'trusted-nck1-analyzed-package-import-candidate-v1')
assert.deepEqual(imported.candidate.authority, nck1AnalyzedPackageCandidateAuthorityRef55)
assert.equal(imported.candidate.authority.manifestVersion, '55')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '54')
const derivedContent = deriveNck1AnalyzedPackageBundle(input).materialization
assert.equal(derivedContent.schemaVersion, 'nck1-analyzed-package-content-v1')
assert.equal(Object.hasOwn(derivedContent, 'documents'), false)
assert.equal(Object.hasOwn(derivedContent, 'sourceCoverage'), false)
const rawAdapters = resolveCanonicalAuthority(
  nck1MaterializationCandidateAuthorityRef,
).closure.artifacts.adapter.adapters
assert.equal(rawAdapters.some((adapter) =>
  adapter.adapterId === 'nck1-analyzed-package'), false,
'immutable raw v54 adapter registry rejects analyzed-package extraction')
assert(imported.candidate.source.members.some((member) => member.role === 'analysis'))

const reviewRoot = mkdtempSync(path.join(tmpdir(), 'eqb-analyzed-review-'))
try {
  const reviewInput = packageInput()
  const manifestPath = 'analyzed-package/manifest.json'
  const memberPath = 'analyzed-package/members/content.json'
  const sourceManifest = buildNck1AnalyzedPackageReviewSourceManifest({
    paperId: parseStrictPackageJson(reviewInput.manifestBytes).paperId,
    manifestPath,
    manifestBytes: reviewInput.manifestBytes,
    members: reviewInput.members.map((member) => ({ ...member, path: memberPath })),
  })
  mkdirSync(path.join(reviewRoot, 'analyzed-package/members'), { recursive: true })
  writeFileSync(path.join(reviewRoot, manifestPath), reviewInput.manifestBytes)
  writeFileSync(path.join(reviewRoot, memberPath), reviewInput.members[0].bytes)
  writeFileSync(path.join(reviewRoot, 'config.json'), JSON.stringify({
    paperId: sourceManifest.paperId,
    provenance: {
      paperName: '2026 analyzed package replay fixture',
      source: 'External analyzed package fixture',
      sourceType: '模拟题',
      year: 2026,
    },
  }))
  writeFileSync(
    path.join(reviewRoot, 'universal-source-manifest.json'),
    JSON.stringify(sourceManifest),
  )
  const loadedReview = loadNck1ReviewSource(reviewRoot)
  assert.deepEqual(loadedReview.sourceInput, reviewInput,
    'Review reconstruction returns byte-identical native adapter input')
  assert.equal(Object.hasOwn(loadedReview.materialization, 'documents'), false,
    'native Review reconstruction does not invent original documents')
  const reviewProjection = buildNck1ReviewProjection(reviewRoot)
  assert.equal(reviewProjection.paperAsset.sources.primarySourceType, 'analyzed-package')
  assert.equal(reviewProjection.sourceProvenance.reviewState, 'owner_review_required')
  assert(reviewProjection.sourceVisuals.every((visual) =>
    visual.state === 'external_package_pointer'
    && visual.path === memberPath
    && visual.pointer.startsWith('/')),
  'package JSON pointers expose their actual sealed member path without fake page regions')
  const compatibility = buildNck1CompatibilityPackage({
    config: reviewProjection.config,
    manifest: reviewProjection.manifest,
    materialization: reviewProjection.materialization,
    sourceProvenance: reviewProjection.sourceProvenance,
    sourceAssetVersion: 1,
  })
  assert.equal(compatibility.importMeta.sourceFileName, 'content.json')
  assert.equal(compatibility.importMeta.sourceProvenance.kind, 'external_analyzed_package')
  writeFileSync(path.join(reviewRoot, memberPath), encoder.encode('{"tampered":true}'))
  assert.throws(
    () => loadNck1ReviewSource(reviewRoot),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'every Review reload rejects changed package member bytes',
  )
} finally {
  rmSync(reviewRoot, { recursive: true, force: true })
}

const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
assert(preview.compilation,
  `originals-free package reaches a read-only Candidate preview: ${JSON.stringify(preview.unresolvedIssues)}`)
assert.equal(imported.candidate.interpretation.transformations.some((record) =>
  record.operation === 'profile_instruction_correction'), false,
  'already-correct continuation wording needs no fabricated before/after correction')
assert(preview.compilation.artifacts.sourceCapture.sourceSpans.every((span) =>
  span.coordinate.kind === 'byte_range'), 'package evidence never claims PDF page regions')
assert(preview.compilation.artifacts.sourceCapture.observations.some((observation) =>
  observation.value?.packageEvidence?.pointer !== undefined))

const confirmation = {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: imported.candidate.candidateDigest,
  sourceDigest: imported.candidate.source.sha256,
  confirmed: true,
}
assert(rederiveConfirmedCanonicalCandidate(imported.candidate, confirmation).compilation)
const directPackageRequest = deriveNck1AnalyzedPackageBundle(input).request
const directCompilation = compileCanonicalPaper(directPackageRequest)
assert(directCompilation.artifacts.normalizationReport.diagnostics.some((item) =>
  item.code === 'AUTHORITY_RETIRED'),
'package compiler requests cannot bypass Candidate confirmation')
const materialized = materializeNck1CanonicalRequest(input, confirmation)
const confirmedWithoutLiveAdmission = compileCanonicalPaper(materialized.request)
assert.equal(confirmedWithoutLiveAdmission.disposition, 'ready')
assert.throws(() => sealCanonicalPublication({
  compilation: confirmedWithoutLiveAdmission,
  sourceAssetVersion: 1,
  sourceAsset: input.members[0].bytes,
}), (error) => error.code === 'CANONICAL_PUBLICATION_AUTHORITY_RETIRED',
'a serializable confirmed package request cannot substitute for live rederivation proof')
const admitted = admitLiveConfirmedNck1AnalyzedPackageImport(materialized.request)
assert.deepEqual(admitted.sourceAsset, input.members[0].bytes,
  'publication sourceAsset is the actual captured content member')
const alternateContentInput = packageInput({ contentMemberId: 'paper-content.v1' })
const alternateCandidate = importCanonicalCandidate(alternateContentInput)
assert.deepEqual(alternateCandidate.issues, [])
const alternateRequest = materializeNck1CanonicalRequest(alternateContentInput, {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: alternateCandidate.candidate.candidateDigest,
  sourceDigest: alternateCandidate.candidate.source.sha256,
  confirmed: true,
}).request
assert.deepEqual(
  admitLiveConfirmedNck1AnalyzedPackageImport(alternateRequest).sourceAsset,
  alternateContentInput.members[0].bytes,
  'publication resolves the declared content member, not a hard-coded fixture ID',
)
const sealed = sealCanonicalPublication({
  compilation: admitted.compilation,
  sourceAssetVersion: 1,
  sourceAsset: admitted.sourceAsset,
  nck1AnalyzedPackageConfirmationProof: admitted.proof,
})
assert.doesNotThrow(() => validateCanonicalPublicationBundle({
  manifest: sealed.manifest,
  sourceAsset: sealed.sourceAsset,
  readArtifact(relativePath) {
    return sealed.artifacts[relativePath]
      || sealed.sourceEvidence[relativePath]
  },
}), 'sealed package publication reloads from immutable artifacts')
const consumerAdmission = admitCanonicalPaperImport({
  request: materialized.request,
  sourceAssetVersion: 1,
})
assert.equal(consumerAdmission.ok, true,
  `v55 package must close Screen/Print consumers: ${JSON.stringify(consumerAdmission.diagnostics)}`)

const changedAnalysis = structuredClone(input)
changedAnalysis.members[1].bytes = encoder.encode('{"schemaVersion":"synthetic-analysis-v1","complete":false}')
assert.equal(
  rederiveConfirmedCanonicalCandidate(
    importCanonicalCandidate(changedAnalysis).candidate,
    confirmation,
  ).compilation,
  undefined,
  'analysis-member changes invalidate the prior Candidate confirmation',
)

const unrelated = packageInput({ mutateContent(content) {
  content.answers[0].authority.pointer = '/groups/0'
} })
assert(importCanonicalCandidate(unrelated).issues.some((item) =>
  item.code === 'ANALYZED_PACKAGE_POINTER_UNRELATED'))
assert.throws(() => parseStrictPackageJson(encoder.encode('{"a":1,"a":2}')), /Duplicate JSON key/u)
assert.throws(() => parseStrictPackageJson(encoder.encode('\u00a0{"a":1}')), /Invalid JSON value/u)
const prototypeKey = parseStrictPackageJson(encoder.encode('{"__proto__":{"test":true}}'))
assert.equal(Object.hasOwn(prototypeKey, '__proto__'), true)
assert.equal(Object.getPrototypeOf(prototypeKey), Object.prototype)
assert.equal(prototypeKey.test, undefined)

const copiedRawKind = { ...input, kind: 'nck1-source-materialization' }
assert.equal(importCanonicalCandidate(copiedRawKind).candidate, null,
  'analyzed package bytes cannot enter the raw materialization input kind')

const audioBytes = new Uint8Array(execFileSync('ffmpeg', [
  '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25',
  '-f', 'mp3', 'pipe:1',
]))
const listeningInput = packageInput({
  listening: true,
  extraMembers: [{
    memberId: 'listening-audio', role: 'audio', mediaType: 'audio/mpeg',
    bytes: audioBytes,
  }],
})
const listeningCandidate = importCanonicalCandidate(listeningInput)
assert.deepEqual(listeningCandidate.issues, [],
  'decodable package MP3 is measured and bound to captured Listening')
assert(compileNck1MaterializationCandidatePreview(listeningCandidate.candidate).compilation)
const listeningReviewRoot = mkdtempSync(path.join(tmpdir(), 'eqb-analyzed-listening-review-'))
try {
  const manifestPath = 'analyzed-package/manifest.json'
  const reviewMembers = listeningInput.members.map((member) => ({
    ...member,
    path: `analyzed-package/${member.memberId}.${member.mediaType === 'application/json' ? 'json' : 'mp3'}`,
  }))
  const sourceManifest = buildNck1AnalyzedPackageReviewSourceManifest({
    paperId: parseStrictPackageJson(listeningInput.manifestBytes).paperId,
    manifestPath,
    manifestBytes: listeningInput.manifestBytes,
    members: reviewMembers,
  })
  mkdirSync(path.join(listeningReviewRoot, 'analyzed-package'), { recursive: true })
  writeFileSync(path.join(listeningReviewRoot, manifestPath), listeningInput.manifestBytes)
  for (const member of reviewMembers) {
    writeFileSync(path.join(listeningReviewRoot, member.path), member.bytes)
  }
  writeFileSync(path.join(listeningReviewRoot, 'config.json'), JSON.stringify({
    paperId: sourceManifest.paperId,
    provenance: {
      paperName: '2026 external listening Review fixture',
      source: 'External analyzed package fixture',
      sourceType: '模拟题',
      year: 2026,
    },
  }))
  writeFileSync(
    path.join(listeningReviewRoot, 'universal-source-manifest.json'),
    JSON.stringify(sourceManifest),
  )
  const listeningReview = buildNck1ReviewProjection(listeningReviewRoot).listeningReview
  assert.deepEqual({
    state: listeningReview.audio.state,
    path: listeningReview.audio.path,
    reviewRequired: listeningReview.audio.reviewRequired,
    hasEngine: Object.hasOwn(listeningReview.audio, 'engine'),
    hasComparison: Object.hasOwn(listeningReview.audio, 'comparison'),
    hasCheck: Object.hasOwn(listeningReview.audio, 'check'),
  }, {
    state: 'pending_external_playback_review',
    path: 'analyzed-package/listening-audio.mp3',
    reviewRequired: true,
    hasEngine: false,
    hasComparison: false,
    hasCheck: false,
  }, 'external listening exposes measured playback bytes but invents no ASR/check evidence')
} finally {
  rmSync(listeningReviewRoot, { recursive: true, force: true })
}
assert(importCanonicalCandidate(packageInput({ listening: true })).issues.some((item) =>
  item.code === 'ANALYZED_PACKAGE_LISTENING_AUDIO_REQUIRED'))
const wavBytes = new Uint8Array(execFileSync('ffmpeg', [
  '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25',
  '-f', 'wav', 'pipe:1',
]))
assert(importCanonicalCandidate(packageInput({ listening: true, extraMembers: [{
  memberId: 'listening-audio', role: 'audio', mediaType: 'audio/mpeg', bytes: wavBytes,
}] })).issues.some((item) => item.code === 'ANALYZED_PACKAGE_LISTENING_AUDIO_INVALID'),
'valid audio of the wrong actual codec must not be called MP3')
const replacedAudio = structuredClone(listeningInput)
replacedAudio.members.at(-1).bytes = encoder.encode('not mp3')
assert(importCanonicalCandidate(replacedAudio).issues.length > 0,
  'replaced audio invalidates the package inventory and cannot replay')
const listeningConfirmation = {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: listeningCandidate.candidate.candidateDigest,
  sourceDigest: listeningCandidate.candidate.source.sha256,
  confirmed: true,
}
const listeningMaterialized = materializeNck1CanonicalRequest(
  listeningInput,
  listeningConfirmation,
)
const listeningAdmitted = admitLiveConfirmedNck1AnalyzedPackageImport(
  listeningMaterialized.request,
)
assert.equal(
  Object.hasOwn(nck1CanonicalRequestModule, 'mintLiveExternalListeningReviewProof'),
  false,
  'Canonical request API exposes no plain-object external review proof mint',
)
const fabricatedExternalListeningProof = Object.freeze({
  approval: { approvedBy: 'fabricated-owner' },
})
assert.throws(() => sealCanonicalPublication({
  compilation: listeningAdmitted.compilation,
  sourceAssetVersion: 1,
  sourceAsset: listeningAdmitted.sourceAsset,
  listeningAudioBytes: audioBytes,
  nck1AnalyzedPackageConfirmationProof: listeningAdmitted.proof,
  externalListeningReviewProof: fabricatedExternalListeningProof,
}), (error) => error.code === 'ANALYZED_PACKAGE_LISTENING_OWNER_REVIEW_REQUIRED',
'fabricated serialized review objects cannot authorize external Listening publication')
assert.throws(() => sealCanonicalPublication({
  compilation: listeningAdmitted.compilation,
  sourceAssetVersion: 1,
  sourceAsset: listeningAdmitted.sourceAsset,
  listeningAudioBytes: audioBytes,
  nck1AnalyzedPackageConfirmationProof: listeningAdmitted.proof,
  externalListeningReviewProof: structuredClone(fabricatedExternalListeningProof),
}), (error) => error.code === 'ANALYZED_PACKAGE_LISTENING_OWNER_REVIEW_REQUIRED',
'cloned review data cannot authorize external Listening publication')

console.log('verify-nck1-analyzed-package-candidate: PASS')
