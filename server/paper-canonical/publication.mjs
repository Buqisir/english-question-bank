import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { isBase64String } from '../../shared/paper-canonical/base64.mjs'
import { validatedPaperHeaderTitle } from '../../shared/paper-canonical/headerTitle.mjs'
import { assertListeningPlaybackUi, PUBLISHED_LISTENING_PLAYBACK_UI_FILE } from '../../shared/paper-canonical/listeningPlayback.mjs'
import { authorityRefForManifestDigest, canonicalAuthorityRef, closureRendersApplicationPromptFigures, closureRendersApplicationDrawingArea, resolveCanonicalAuthority, validateJsonSchema } from '../../shared/paper-canonical/authority.mjs'
import {
  compileCanonicalPaper,
  validateExactTransformationRecords,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  isRegisteredConfirmedCanonicalAdmission,
  isRegisteredConfirmedCanonicalPublicationAuthority,
  resolveRegisteredConfirmedCanonicalAdmission,
} from './registeredConfirmedCanonicalAdmission.mjs'
import {
  admitLiveConfirmedTrustedDocxImport,
  isLiveConfirmedTrustedDocxAdmission,
  isTrustedDocxCanonicalImportRequest,
} from './trustedDocxCanonicalRequest.mjs'
import {
  admitLiveConfirmedDocxPairImport,
  isDocxPairCanonicalImportRequest,
  isLiveConfirmedDocxPairAdmission,
} from './docxPairCanonicalRequest.mjs'
import {
  admitLiveConfirmedNck1AnalyzedPackageImport,
  admitLiveConfirmedNck1MaterializationImport,
  isNck1AnalyzedPackageCanonicalImportRequest,
  isLiveExternalListeningReviewAdmission,
  isLiveConfirmedNck1AnalyzedPackageAdmission,
  isLiveConfirmedNck1MaterializationAdmission,
  isNck1MaterializationCanonicalImportRequest,
} from './nck1MaterializationCanonicalRequest.mjs'
import {
  consumerContractRefs,
  consumerContractRefsForAuthority,
  consumerRendersReadingStemFigures,
  resolveConsumerContract,
} from '../../shared/paper-canonical/consumers.mjs'
import { decorateProjectedMediaPresentation } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { digestJson, sha256, stableStringify, stableUtf8Bytes, withoutKey } from '../../shared/paper-canonical/stable.mjs'
import {
  enrichSourceBoundListeningPlayback,
  sourceBoundFirstSectionPlayback,
} from './listeningPlaybackSourceBinding.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
  assertCanonicalVisibleStructure,
} from '../../shared/paper-canonical/visibleStructure.mjs'

const publicationFileName =
  `canonical-paper-publication-v${canonicalAuthorityRef.manifestVersion}.json`
const publicationFileNames = [
  publicationFileName,
  'canonical-paper-publication-v77.json',
  'canonical-paper-publication-v73.json',
  'canonical-paper-publication-v71.json',
  'canonical-paper-publication-v69.json',
  'canonical-paper-publication-v68.json',
  'canonical-paper-publication-v67.json',
  'canonical-paper-publication-v66.json',
  'canonical-paper-publication-v64.json',
  'canonical-paper-publication-v62.json',
  'canonical-paper-publication-v61.json',
  'canonical-paper-publication-v59.json',
  'canonical-paper-publication-v58.json',
  'canonical-paper-publication-v57.json',
  'canonical-paper-publication-v55.json',
  'canonical-paper-publication-v54.json',
  'canonical-paper-publication-v52.json',
  'canonical-paper-publication-v51.json',
  'canonical-paper-publication-v50.json',
  'canonical-paper-publication-v49.json',
  'canonical-paper-publication-v48.json',
  'canonical-paper-publication-v47.json',
  'canonical-paper-publication-v46.json',
  'canonical-paper-publication-v45.json',
  'canonical-paper-publication-v44.json',
  'canonical-paper-publication-v43.json',
  'canonical-paper-publication-v42.json',
  'canonical-paper-publication-v41.json',
  'canonical-paper-publication-v37.json',
  'canonical-paper-publication-v35.json',
  'canonical-paper-publication-v34.json',
  'canonical-paper-publication-v33.json',
  'canonical-paper-publication-v32.json',
  'canonical-paper-publication-v31.json',
  'canonical-paper-publication-v30.json',
  'canonical-paper-publication-v29.json',
  'canonical-paper-publication-v28.json',
  'canonical-paper-publication-v27.json',
  'canonical-paper-publication-v26.json',
  'canonical-paper-publication-v25.json',
  'canonical-paper-publication-v24.json',
  'canonical-paper-publication-v23.json',
  'canonical-paper-publication-v22.json',
  'canonical-paper-publication-v21.json',
  'canonical-paper-publication-v20.json',
  'canonical-paper-publication-v19.json',
  'canonical-paper-publication-v18.json',
  'canonical-paper-publication-v17.json',
  'canonical-paper-publication-v16.json',
  'canonical-paper-publication-v15.json',
  'canonical-paper-publication-v14.json',
  'canonical-paper-publication-v13.json',
  'canonical-paper-publication-v12.json',
  'canonical-paper-publication-v11.json',
  'canonical-paper-publication-v10.json',
  'canonical-paper-publication-v9.json',
  'canonical-paper-publication-v8.json',
  'canonical-paper-publication-v7.json',
  'canonical-paper-publication-v6.json',
  'canonical-paper-publication-v5.json',
  'canonical-paper-publication-v4.json',
  'canonical-paper-publication-v3.json',
  'canonical-paper-publication-v2.json',
  'canonical-paper-publication-v1.json',
]
const latestRefFileName = 'canonical-paper-publication-ref-v1.json'
const journalFileName = '.canonical-latest-swap-v1.json'
const immutablePublicationSources = new WeakMap()
const artifactPathBase = {
  source_capture: 'canonical/source-capture-v1.json',
  paper_plan: 'canonical/canonical-paper-plan-v1.json',
  question_groups: 'canonical/canonical-question-groups-v1.json',
}
const safePaperId = /^[a-z0-9][a-z0-9._-]{0,127}$/

function stableBytes(value) {
  return stableUtf8Bytes(value)
}

function readJsonBytes(bytes, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new Error(`${label} is unreadable JSON: ${error.message}`)
  }
}

function publicationError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

// Publication schemas have independent successor numbers from authority manifests.
function publicationSchemaVersion(closure) {
  return ['71', '73', '74', '75', '76', '77', '78', '79', '80'].includes(closure.authorityRef.manifestVersion) ? '70' : closure.authorityRef.manifestVersion
}

function publicationSchema(closure) {
  return closure.schemas[`canonical-paper-publication-v${publicationSchemaVersion(closure)}`]
}

function artifactPathsFor(authorityRef) {
  return {
    ...artifactPathBase,
    normalization_report: `canonical/normalization-report-v${authorityRef.manifestVersion}.json`,
  }
}

function publicationFileNameFor(authorityRef) {
  return `canonical-paper-publication-v${authorityRef.manifestVersion}.json`
}

function artifactDescriptor(role, value, artifactPaths) {
  const bytes = stableBytes(value)
  return {
    role,
    schemaVersion: value.schemaVersion,
    relativePath: artifactPaths[role],
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    bytes,
  }
}

function assertPaperId(paperId) {
  if (typeof paperId !== 'string' || !safePaperId.test(paperId) || paperId === '.' || paperId === '..') {
    throw publicationError('CANONICAL_PUBLICATION_PAPER_ID_INVALID', 'Paper id is not safe for immutable publication storage')
  }
}

function decodeBase64(encodedBytes, label) {
  if (!isBase64String(encodedBytes)) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', `${label} has invalid base64 evidence`)
  return new Uint8Array(Buffer.from(encodedBytes, 'base64'))
}

function sourceEvidenceDescriptors(sourceCapture) {
  if (!Array.isArray(sourceCapture?.documents) || sourceCapture.documents.length === 0) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Source Capture requires immutable documents')
  const documentIds = new Set()
  const relativePaths = new Set()
  return sourceCapture.documents.map((document) => {
    const ref = document?.immutableArtifactRef
    if (!document || typeof document.documentId !== 'string' || documentIds.has(document.documentId) || !ref || typeof ref.artifactId !== 'string' || typeof ref.relativePath !== 'string' || !ref.relativePath.startsWith('source-evidence/') || ref.relativePath.includes('..') || path.isAbsolute(ref.relativePath) || relativePaths.has(ref.relativePath)) {
      throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Source Capture document identity or artifact reference is invalid')
    }
    const bytes = decodeBase64(document.encodedBytes, document.documentId)
    if (bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256 || ref.byteLength !== document.byteLength || ref.sha256 !== document.sha256) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', `Source Capture document ${document.documentId} does not close its immutable bytes`)
    documentIds.add(document.documentId)
    relativePaths.add(ref.relativePath)
    return {
      documentId: document.documentId,
      artifactId: ref.artifactId,
      relativePath: ref.relativePath,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      bytes,
    }
  }).sort((left, right) => left.documentId.localeCompare(right.documentId))
}

function validateSourceCaptureIntegrity(sourceCapture, { requireEmbeddedEvidence = true } = {}) {
  if (!sourceCapture || sourceCapture.digest !== digestJson(withoutKey(withoutKey(sourceCapture, 'captureId'), 'digest'))) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_DIGEST_INVALID', 'Source Capture digest differs from its immutable content')
  const expectedCaptureId = `source-capture:${sourceCapture.digest.slice('sha256:'.length, 28)}`
  if (sourceCapture.captureId !== expectedCaptureId) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_ID_INVALID', 'Source Capture identity does not derive from its immutable content')
  if (!Array.isArray(sourceCapture.documents) || sourceCapture.documents.length === 0) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture requires immutable source documents')
  const documents = new Map()
  for (const document of sourceCapture.documents) {
    if (!document || typeof document.documentId !== 'string' || documents.has(document.documentId) || typeof document.sha256 !== 'string' || !Number.isInteger(document.byteLength) || document.byteLength < 0) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture document identity or digest is invalid')
    documents.set(document.documentId, document)
  }
  if (requireEmbeddedEvidence) sourceEvidenceDescriptors(sourceCapture)
  const spans = new Map()
  for (const span of sourceCapture.sourceSpans || []) {
    const document = documents.get(span.documentId)
    const byteRange = span.coordinate?.kind === 'byte_range'
      && Number.isInteger(span.coordinate.start)
      && Number.isInteger(span.coordinate.end)
      && span.coordinate.start >= 0
      && span.coordinate.end >= span.coordinate.start
      && span.coordinate.end <= (document?.byteLength ?? -1)
    const region = span.coordinate?.region
    const pageRegion = span.coordinate?.kind === 'page_region'
      && document?.mediaType === 'application/pdf'
      && Number.isInteger(span.coordinate.page)
      && span.coordinate.page > 0
      && region
      && ['x', 'y', 'width', 'height'].every((key) => typeof region[key] === 'number' && Number.isFinite(region[key]))
      && region.x >= 0
      && region.y >= 0
      && region.width > 0
      && region.height > 0
      && region.x + region.width <= 1
      && region.y + region.height <= 1
    if (!document || typeof span.sourceSpanId !== 'string' || spans.has(span.sourceSpanId) || span.documentDigest !== document.sha256 || (!byteRange && !pageRegion)) {
      throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture span does not resolve to immutable document bytes')
    }
    spans.set(span.sourceSpanId, span)
  }
  for (const assertion of sourceCapture.assertions || []) if (!spans.has(assertion.sourceSpanId)) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture assertion lacks a resolvable span')
  for (const observation of sourceCapture.observations || []) if (!documents.has(observation.documentId) || !spans.has(observation.sourceSpanId)) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture observation lacks immutable document lineage')
  return { documents, spans }
}

function validateSourceAssetBinding(sourceCapture, sourceAsset, options) {
  const { documents } = validateSourceCaptureIntegrity(sourceCapture, options)
  const matchingDocuments = [...documents.values()].filter((document) => document.sha256 === sha256(sourceAsset))
  if (matchingDocuments.length !== 1) throw publicationError('CANONICAL_PUBLICATION_SOURCE_UNBOUND', 'Publication source asset must bind exactly one captured immutable document')
  return matchingDocuments[0]
}

function reportSemanticOrder(groups, plan, legacyAuthority) {
  if (!legacyAuthority) return groups
  const groupsById = new Map(groups.map((group) => [group?.identity?.groupId, group]))
  const ordered = []
  for (const binding of plan.slotBindings || []) {
    if (binding?.state !== 'bound') continue
    const group = groupsById.get(binding.groupRef?.groupId)
    if (!group || ordered.includes(group)) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Legacy Publication Plan does not recover one semantic order for every Canonical Group')
    ordered.push(group)
  }
  if (ordered.length !== groups.length) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Legacy Publication Plan does not close the Canonical Group order')
  return ordered
}

function validatePublicationLineage({ sourceCapture, plan, groups, normalizationReport, authorityClosure }) {
  const legacyAuthority = authorityClosure.authorityRef.manifestVersion === '1'
  const closesInactiveSource = Number(
    authorityClosure.authorityRef.manifestVersion,
  ) >= 11
  const requiresInactiveSourceClosure = closesInactiveSource
    && !isRegisteredConfirmedCanonicalPublicationAuthority(
      authorityClosure.authorityRef,
    )
  const { spans } = validateSourceCaptureIntegrity(sourceCapture, { requireEmbeddedEvidence: !legacyAuthority })
  const records = normalizationReport.transformationRecords || []
  const recordIds = new Set(records.map((record) => record.recordId))
  const acceptedLedger = validateExactTransformationRecords(records, sourceCapture, authorityClosure)
  if (recordIds.size !== records.length || acceptedLedger.diagnostics.length > 0 || acceptedLedger.records.length !== records.length || stableStringify(acceptedLedger.records) !== stableStringify(records)) {
    throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Transformation Records do not prove exact source replay')
  }
  const expectedRecordIds = plan.sourceConformance?.transformationRecordIds || []
  if (!Array.isArray(expectedRecordIds) || expectedRecordIds.length !== records.length || expectedRecordIds.some((recordId) => !recordIds.has(recordId))) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan does not close its transformation ledger')
  const reviewDecisionDigest = digestJson(normalizationReport.reviewDecisions || [])
  if (!legacyAuthority) {
    if (plan.sourceConformance?.reviewDecisionDigest !== reviewDecisionDigest || !Array.isArray(plan.sourceConformance?.reviewDecisionIds) || plan.sourceConformance.reviewDecisionIds.length !== (normalizationReport.reviewDecisions || []).length || plan.sourceConformance.reviewDecisionIds.some((decisionId, index) => decisionId !== normalizationReport.reviewDecisions[index].decisionId)) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan does not bind its explicit review decisions')
    for (const decision of normalizationReport.reviewDecisions || []) if (!Array.isArray(decision.sourceSpanRefs) || decision.sourceSpanRefs.some((sourceSpanId) => !spans.has(sourceSpanId))) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Review decision does not resolve to captured evidence')
  }
  for (const group of groups) {
    if (group.sourceMap?.captureId !== sourceCapture.captureId || !Array.isArray(group.sourceMap?.entries) || group.sourceMap.entries.some((entry) => !Array.isArray(entry.sourceSpanRefs) || entry.sourceSpanRefs.length === 0 || entry.sourceSpanRefs.some((sourceSpanId) => !spans.has(sourceSpanId)) || !Array.isArray(entry.transformationRecordIds) || entry.transformationRecordIds.some((recordId) => !recordIds.has(recordId)))) {
      throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Group source map does not close against Source Capture')
    }
    const groupSpanIds = [...new Set(group.sourceMap.entries.flatMap((entry) => entry.sourceSpanRefs))]
    const expectedFingerprint = digestJson({ captureDigest: sourceCapture.digest, sourceSpanId: groupSpanIds[0], recordIds: group.sourceMap.entries.flatMap((entry) => entry.transformationRecordIds) })
    if (group.sourceFingerprint !== expectedFingerprint) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Group source fingerprint does not match source lineage')
  }
  for (const assignment of plan.numberingAssignments || []) if (!spans.has(assignment.sourceNumberSpan)) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan numbering assignment lacks a captured source span')
  const inactiveSourceClosures = closesInactiveSource
    ? normalizationReport.inactiveSourceClosures || []
    : []
  if (requiresInactiveSourceClosure) {
    const profile = authorityClosure.profiles.get(plan.profileRef?.profileId)
    const inactiveSlots = profile
      ? profile.parts.flatMap((part) =>
          part.sections.flatMap((section) =>
            section.slots.filter((slot) =>
              slot.activation === 'inactive_source'
              && slot.sourceClosureContractRef)))
      : []
    if (
      new Set(inactiveSourceClosures.map((closure) => closure.slotId)).size
        !== inactiveSourceClosures.length
      || inactiveSourceClosures.some((closure) =>
        !inactiveSlots.some((slot) => slot.slotId === closure.slotId))
    ) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Normalization Report does not close every inactive Profile slot exactly once')
    for (const slot of inactiveSlots) {
      const closure = inactiveSourceClosures.find(
        (candidate) => candidate.slotId === slot.slotId,
      )
      const binding = plan.slotBindings.find(
        (candidate) =>
          candidate.slotId === slot.slotId && candidate.state === 'inactive',
      )
      if (binding?.sourceState === 'not_supplied') {
        if (
          closure
          || stableStringify(binding) !== stableStringify({
            slotId: slot.slotId,
            state: 'inactive',
            sourceState: 'not_supplied',
          })
        ) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', `Inactive source slot ${slot.slotId} has ambiguous not_supplied evidence`)
        continue
      }
      if (
        !closure
        || closure.status !== 'closed'
        || closure.contractRef?.id !== slot.sourceClosureContractRef?.id
        || closure.contractRef?.version !== slot.sourceClosureContractRef?.version
        || closure.questionCount !== slot.questionRule?.cardinality
        || stableStringify(closure.optionLabels) !== stableStringify(slot.questionRule?.optionLabels)
        || closure.officialAnswerCount !== slot.questionRule?.cardinality
        || closure.transcriptSegmentCount !== slot.transcriptRule?.segmentCardinality
        || closure.transcriptCoverage !== 'exactly_once'
        || (
          closure.timing?.disposition === 'supplied'
            ? (
                Object.keys(closure.timing).sort().join(',') !== 'disposition,rowCount'
                || closure.timing.rowCount !== slot.transcriptRule?.segmentCardinality
              )
            : (
                closure.timing?.disposition !== 'not_supplied'
                || Object.keys(closure.timing || {}).join(',') !== 'disposition'
              )
        )
        || !['not_supplied', 'captured_uninterpreted'].includes(closure.audio?.disposition)
        || (
          closure.audio?.disposition === 'not_supplied'
            ? Object.keys(closure.audio).join(',') !== 'disposition'
            : (
                Object.keys(closure.audio).sort().join(',') !== 'artifactRef,digest,disposition'
                || ![...sourceCapture.documents].some((document) =>
                  document.immutableArtifactRef?.artifactId === closure.audio.artifactRef
                  && document.sha256 === closure.audio.digest
                  && document.roles?.includes('audio_source'))
              )
        )
        || closure.closureDigest !== digestJson(withoutKey(closure, 'closureDigest'))
        || !Array.isArray(closure.sourceSliceRefs)
        || closure.sourceSliceRefs.length === 0
        || closure.sourceSliceRefs.some((sourceSpanId) => !spans.has(sourceSpanId))
        || !Array.isArray(closure.transformationRecordIds)
        || closure.transformationRecordIds.some((recordId) => !recordIds.has(recordId))
        || !Array.isArray(closure.sourceMap?.entries)
        || closure.sourceMap.entries.length === 0
        || closure.sourceMap.entries.some((entry) =>
          !Array.isArray(entry.sourceSpanRefs)
          || entry.sourceSpanRefs.length === 0
          || entry.sourceSpanRefs.some((sourceSpanId) => !spans.has(sourceSpanId))
          || !Array.isArray(entry.transformationRecordIds)
          || entry.transformationRecordIds.length === 0
          || entry.transformationRecordIds.some((recordId) => !recordIds.has(recordId)))
        || !binding
        || Object.hasOwn(binding, 'groupRef')
        || binding.sourceClosureRef?.reportScopeId !== closure.scopeId
        || binding.sourceClosureRef?.contractId !== closure.contractRef.id
        || binding.sourceClosureRef?.contractVersion !== closure.contractRef.version
        || binding.sourceClosureRef?.closureDigest !== closure.closureDigest
        || stableStringify(binding.sourceSliceRefs) !== stableStringify(closure.sourceSliceRefs)
      ) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', `Inactive source closure ${slot.slotId} does not bind exact captured evidence`)
    }
  }
  const semanticGroups = reportSemanticOrder(groups, plan, legacyAuthority)
  const expectedDirectSourceMap = [
    ...semanticGroups.flatMap((group) => group.sourceMap.entries),
    ...inactiveSourceClosures.flatMap(
      (closure) => closure.sourceMap?.entries || [],
    ),
  ]
  const inactiveSourceClosureDigests = inactiveSourceClosures.map(
    (closure) => closure.closureDigest,
  )
  const expectedSourceFingerprint = digestJson({
    captureDigest: sourceCapture.digest,
    groupFingerprints: semanticGroups.map((group) => group.sourceFingerprint),
    ...(closesInactiveSource ? { inactiveSourceClosureDigests } : {}),
  })
  const expectedSemanticDigest = legacyAuthority
    ? digestJson({ groups: semanticGroups.map((group) => group.semanticDigest) })
    : digestJson({
        groups: groups.map((group) => group.semanticDigest),
        reviewDecisionDigest,
        ...(closesInactiveSource ? { inactiveSourceClosureDigests } : {}),
      })
  if (normalizationReport.sourceFingerprint !== expectedSourceFingerprint || stableStringify(normalizationReport.directSourceMap) !== stableStringify(expectedDirectSourceMap) || normalizationReport.semanticDigest !== expectedSemanticDigest) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Normalization Report does not close its direct source lineage')
}

function capturedListeningAudio(sourceCapture, groups, closure) {
  if (!['51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79', '80'].includes(closure.authorityRef.manifestVersion)) return null
  const active = groups.some((group) => group.contractRef.familyContractId === 'listening')
  const documents = sourceCapture.documents.filter((document) => document.inputKey === 'listening_audio_descriptor')
  if (!active && documents.length === 0) return null
  if (!active || documents.length !== 1) throw publicationError('LISTENING_AUDIO_UNBOUND', 'Listening requires one confirmed playback descriptor')
  const descriptor = readJsonBytes(decodeBase64(documents[0].encodedBytes, 'listening audio'), 'listening audio')
  const schema = publicationSchema(closure).properties.listeningAudio
  if (validateJsonSchema(descriptor, schema).length) throw publicationError('LISTENING_AUDIO_UNBOUND', 'Invalid playback descriptor')
  return descriptor
}

function assertPlaybackBytes(descriptor, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
    throw publicationError('LISTENING_AUDIO_BYTES_INVALID', 'Playback audio is missing or differs from the confirmed source')
  }
}

export function sealCanonicalPublication({
  compilation,
  sourceAssetVersion,
  sourceAsset,
  listeningAudioBytes = null,
  registeredConfirmationProof = null,
  trustedDocxConfirmationProof = null,
  docxPairConfirmationProof = null,
  nck1MaterializationConfirmationProof = null,
  nck1AnalyzedPackageConfirmationProof = null,
  externalListeningReviewProof = null,
  paperHeader,
}) {
  if (compilation?.disposition !== 'ready') throw publicationError('CANONICAL_PUBLICATION_BLOCKED', 'Only a complete ready compilation may be published')
  if (!(sourceAsset instanceof Uint8Array) || !Number.isInteger(sourceAssetVersion) || sourceAssetVersion < 1) throw publicationError('CANONICAL_PUBLICATION_INPUT_INVALID', 'Publication needs immutable source asset bytes and a positive version')
  const { sourceCapture, canonicalPaper, normalizationReport } = compilation.artifacts
  const authority = resolveCanonicalAuthority(canonicalPaper?.paperPlan?.authorityRef)
  if (!authority.ok) throw publicationError('CANONICAL_PUBLICATION_AUTHORITY_INVALID', 'Compilation does not bind a known authority')
  const closure = authority.closure
  if (
    closure.authorityRef.manifestDigest !== canonicalAuthorityRef.manifestDigest
    && !isRegisteredConfirmedCanonicalAdmission({
      proof: registeredConfirmationProof,
      compilation,
      sourceAsset,
    })
    && !isLiveConfirmedTrustedDocxAdmission({
      proof: trustedDocxConfirmationProof,
      compilation,
      sourceAsset,
    })
    && !isLiveConfirmedDocxPairAdmission({
      proof: docxPairConfirmationProof,
      compilation,
      sourceAsset,
    })
    && !isLiveConfirmedNck1MaterializationAdmission({
      proof: nck1MaterializationConfirmationProof,
      compilation,
      sourceAsset,
    })
    && !isLiveConfirmedNck1AnalyzedPackageAdmission({
      proof: nck1AnalyzedPackageConfirmationProof,
      compilation,
      sourceAsset,
    })
  ) throw publicationError('CANONICAL_PUBLICATION_AUTHORITY_RETIRED', 'Only the current canonical authority or one exact live Teacher-Confirmed import chain may create a new publication')
  const artifactPaths = artifactPathsFor(closure.authorityRef)
  assertPaperId(canonicalPaper?.paperPlan?.paperId)
  validateSourceCaptureIntegrity(sourceCapture)
  const sourceEvidence = sourceEvidenceDescriptors(sourceCapture)
  const listeningAudio = capturedListeningAudio(sourceCapture, canonicalPaper.questionGroups, closure)
  if (
    listeningAudio
    && closure.authorityRef.manifestVersion === '55'
    && !isLiveExternalListeningReviewAdmission({
      proof: externalListeningReviewProof,
      nck1AnalyzedPackageConfirmationProof,
      compilation,
      listeningAudioBytes,
    })
  ) {
    throw publicationError(
      'ANALYZED_PACKAGE_LISTENING_OWNER_REVIEW_REQUIRED',
      'External Listening publication requires exact live proof from the server-validated Owner playback review',
    )
  }
  if (listeningAudio) assertPlaybackBytes(listeningAudio, listeningAudioBytes)
  else if (listeningAudioBytes) throw publicationError('LISTENING_AUDIO_UNBOUND', 'Audio requires active Listening')
  const sourceAssetDigest = sha256(sourceAsset)
  const matchingDocuments = sourceCapture.documents.filter((document) => document.sha256 === sourceAssetDigest)
  if (matchingDocuments.length !== 1) throw publicationError('CANONICAL_PUBLICATION_SOURCE_UNBOUND', 'The publication source asset must be exactly one captured immutable document')
  const questionGroups = {
    schemaVersion: 'canonical-question-groups-v1',
    groups: [...canonicalPaper.questionGroups],
  }
  const descriptors = [
    artifactDescriptor('source_capture', sourceCapture, artifactPaths),
    artifactDescriptor('paper_plan', canonicalPaper.paperPlan, artifactPaths),
    artifactDescriptor('question_groups', questionGroups, artifactPaths),
    artifactDescriptor('normalization_report', normalizationReport, artifactPaths),
  ]
  const manifestBase = {
    schemaVersion: `canonical-paper-publication-v${publicationSchemaVersion(closure)}`,
    paperId: canonicalPaper.paperPlan.paperId,
    sourceAssetVersion,
    sourceAssetDigest,
    sourceAssetDocumentId: matchingDocuments[0].documentId,
    sourceEvidence: sourceEvidence.map(({ bytes: _bytes, ...descriptor }) => descriptor),
    authority: canonicalPaper.paperPlan.authorityRef,
    ...(listeningAudio ? { listeningAudio } : {}),
    ...(validatedPaperHeaderTitle(paperHeader) !== undefined
      ? { paperHeader: structuredClone(paperHeader) } : {}),
    artifacts: descriptors
      .map(({ bytes: _bytes, ...descriptor }) => descriptor)
      .sort((left, right) => left.role.localeCompare(right.role)),
  }
  const manifest = { ...manifestBase, publicationDigest: digestJson(manifestBase) }
  return {
    manifest,
    sourceAsset: new Uint8Array(sourceAsset),
    artifacts: Object.fromEntries(descriptors.map((descriptor) => [descriptor.relativePath, descriptor.bytes])),
    sourceEvidence: {
      ...Object.fromEntries(sourceEvidence.map((descriptor) => [descriptor.relativePath, descriptor.bytes])),
      ...(listeningAudio ? { [listeningAudio.relativePath]: new Uint8Array(listeningAudioBytes) } : {}),
    },
  }
}

export function validateCanonicalPublicationBundle({ manifest, sourceAsset, readArtifact }) {
  const authority = resolveCanonicalAuthority(manifest?.authority)
  if (!authority.ok) throw publicationError('CANONICAL_PUBLICATION_AUTHORITY_INVALID', 'Publication authority closure is unknown or stale')
  const closure = authority.closure
  const artifactPaths = artifactPathsFor(closure.authorityRef)
  // Strict optional envelope extension: validate it separately without changing
  // any historical authority schema. The full manifest still enters the digest.
  validatedPaperHeaderTitle(manifest.paperHeader)
  const manifestIssues = validateJsonSchema(withoutKey(manifest, 'paperHeader'), publicationSchema(closure), '$.publication')
  if (manifestIssues.length > 0) throw publicationError('CANONICAL_PUBLICATION_SCHEMA_INVALID', JSON.stringify(manifestIssues))
  if (manifest.publicationDigest !== digestJson(withoutKey(manifest, 'publicationDigest'))) throw publicationError('CANONICAL_PUBLICATION_DIGEST_INVALID', 'Publication manifest digest differs')
  assertPaperId(manifest.paperId)
  if (!(sourceAsset instanceof Uint8Array) || sha256(sourceAsset) !== manifest.sourceAssetDigest) throw publicationError('CANONICAL_PUBLICATION_SOURCE_STALE', 'Source asset bytes do not match the sealed publication')
  const expectedRoles = Object.keys(artifactPaths).sort()
  if (manifest.artifacts.length !== expectedRoles.length || manifest.artifacts.map((item) => item.role).sort().join(',') !== expectedRoles.join(',')) throw publicationError('CANONICAL_PUBLICATION_ARTIFACT_CLOSURE', 'Publication requires every canonical artifact exactly once')
  const artifacts = {}
  for (const descriptor of manifest.artifacts) {
    if (descriptor.relativePath !== artifactPaths[descriptor.role] || descriptor.relativePath.includes('..') || path.isAbsolute(descriptor.relativePath)) throw publicationError('CANONICAL_PUBLICATION_PATH_INVALID', `Invalid artifact path for ${descriptor.role}`)
    const bytes = readArtifact(descriptor.relativePath)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) throw publicationError('CANONICAL_PUBLICATION_ARTIFACT_DIGEST_INVALID', `Artifact ${descriptor.role} is missing or corrupt`)
    artifacts[descriptor.role] = readJsonBytes(bytes, descriptor.role)
  }
  const sourceCaptureIssues = validateJsonSchema(artifacts.source_capture, closure.schemas['source-capture-v1'], '$.sourceCapture')
  const planIssues = validateJsonSchema(artifacts.paper_plan, closure.schemas['canonical-paper-plan-v1'], '$.plan')
  const reportIssues = validateJsonSchema(artifacts.normalization_report, closure.schemas[`normalization-report-v${publicationSchemaVersion(closure)}`], '$.report')
  if (sourceCaptureIssues.length || planIssues.length || reportIssues.length || artifacts.question_groups?.schemaVersion !== 'canonical-question-groups-v1' || !Array.isArray(artifacts.question_groups?.groups)) throw publicationError('CANONICAL_PUBLICATION_ARTIFACT_SCHEMA_INVALID', 'One or more sealed artifacts violate their exact schemas')
  const listeningAudio = capturedListeningAudio(artifacts.source_capture, artifacts.question_groups.groups, closure)
  if (digestJson(listeningAudio) !== digestJson(manifest.listeningAudio || null)) throw publicationError('LISTENING_AUDIO_UNBOUND', 'Publication audio differs from the confirmed source')
  if (listeningAudio) assertPlaybackBytes(listeningAudio, readArtifact(listeningAudio.relativePath))
  if (artifacts.normalization_report.disposition !== 'ready' || artifacts.normalization_report.captureDigest !== artifacts.source_capture.digest || artifacts.paper_plan.completeness.status !== 'complete') throw publicationError('CANONICAL_PUBLICATION_SEMANTIC_CLOSURE_INVALID', 'Publication does not contain a complete ready source closure')
  const legacyAuthority = closure.authorityRef.manifestVersion === '1'
  const sourceAssetDocument = validateSourceAssetBinding(
    artifacts.source_capture,
    sourceAsset,
    { requireEmbeddedEvidence: !legacyAuthority },
  )
  validatePublicationLineage({ sourceCapture: artifacts.source_capture, plan: artifacts.paper_plan, groups: artifacts.question_groups.groups, normalizationReport: artifacts.normalization_report, authorityClosure: closure })
  if (closure.authorityRef.manifestVersion === '1') {
    let projected
    try {
      projected = projectCanonicalPaper({ plan: artifacts.paper_plan, groups: artifacts.question_groups.groups, sourceCapture: artifacts.source_capture, authorityClosure: closure })
    } catch (error) {
      throw publicationError('CANONICAL_PUBLICATION_PROJECTION_INVALID', error.message)
    }
    return {
      manifest,
      sourceCapture: artifacts.source_capture,
      plan: artifacts.paper_plan,
      groups: artifacts.question_groups.groups,
      normalizationReport: artifacts.normalization_report,
      sourceAssetDocument,
      projected,
    }
  }
  const sourceEvidence = sourceEvidenceDescriptors(artifacts.source_capture)
  if (!Array.isArray(manifest.sourceEvidence) || manifest.sourceEvidence.length !== sourceEvidence.length) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Publication source evidence closure differs from Source Capture')
  for (const expected of sourceEvidence) {
    const descriptor = manifest.sourceEvidence.find((candidate) => candidate.documentId === expected.documentId)
    if (!descriptor || descriptor.artifactId !== expected.artifactId || descriptor.relativePath !== expected.relativePath || descriptor.byteLength !== expected.byteLength || descriptor.sha256 !== expected.sha256) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Publication source evidence descriptor differs from Source Capture')
    const bytes = readArtifact(descriptor.relativePath)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', `Source evidence ${descriptor.documentId} is missing or corrupt`)
  }
  if (
    sourceAssetDocument.documentId !== manifest.sourceAssetDocumentId
    || sourceAssetDocument.sha256 !== manifest.sourceAssetDigest
    || sourceAssetDocument.sha256 !== sha256(sourceAsset)
    || sourceAssetDocument.byteLength !== sourceAsset.byteLength
  ) throw publicationError('CANONICAL_PUBLICATION_SOURCE_UNBOUND', 'Publication source asset does not bind to captured source evidence')
  let projected
  try {
    projected = projectCanonicalPaper({ plan: artifacts.paper_plan, groups: artifacts.question_groups.groups, sourceCapture: artifacts.source_capture, authorityClosure: closure })
  } catch (error) {
    throw publicationError('CANONICAL_PUBLICATION_PROJECTION_INVALID', error.message)
  }
  return {
    manifest,
    sourceCapture: artifacts.source_capture,
    plan: artifacts.paper_plan,
    groups: artifacts.question_groups.groups,
    normalizationReport: artifacts.normalization_report,
    sourceAssetDocument,
    projected,
  }
}

export function ensureCanonicalPublicationDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_paper_publications (
      paper_id TEXT NOT NULL,
      version_name TEXT NOT NULL,
      source_asset_version INTEGER NOT NULL,
      publication_digest TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (paper_id, version_name),
      UNIQUE (paper_id, source_asset_version, publication_digest)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_paper_publications_current
      ON canonical_paper_publications (paper_id, is_current);
  `)
}

export function recordCanonicalPublicationCurrent(db, ref) {
  ensureCanonicalPublicationDatabaseShape(db)
  db.prepare(
    'UPDATE canonical_paper_publications SET is_current = 0 WHERE paper_id = ?',
  ).run(ref.paperId)
  db.prepare(
    'INSERT INTO canonical_paper_publications (paper_id, version_name, source_asset_version, publication_digest, is_current) VALUES (?, ?, ?, ?, 1)',
  ).run(
    ref.paperId,
    ref.versionName,
    ref.sourceAssetVersion,
    ref.publicationDigest,
  )
}

export function selectCanonicalPublicationCurrent(db, ref) {
  ensureCanonicalPublicationDatabaseShape(db)
  db.prepare(
    'UPDATE canonical_paper_publications SET is_current = 0 WHERE paper_id = ?',
  ).run(ref.paperId)
  const selected = db.prepare(
    'UPDATE canonical_paper_publications SET is_current = 1 WHERE paper_id = ? AND version_name = ? AND source_asset_version = ? AND publication_digest = ?',
  ).run(
    ref.paperId,
    ref.versionName,
    ref.sourceAssetVersion,
    ref.publicationDigest,
  )
  if (selected.changes !== 1) {
    throw publicationError(
      'CANONICAL_PUBLICATION_ROLLBACK_TARGET_CONFLICT',
      'Rollback target no longer matches its recorded immutable identity',
    )
  }
}

function paperPaths(rootDir, paperId) {
  assertPaperId(paperId)
  const paperDir = path.join(rootDir, paperId)
  return {
    paperDir,
    versionsDir: path.join(paperDir, 'versions'),
    latestDir: path.join(paperDir, 'latest'),
    journalPath: path.join(paperDir, journalFileName),
  }
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function currentDbRef(db, paperId, versionName = null) {
  const row = versionName
    ? db.prepare('SELECT paper_id, version_name, source_asset_version, publication_digest FROM canonical_paper_publications WHERE paper_id = ? AND version_name = ?').get(paperId, versionName)
    : db.prepare('SELECT paper_id, version_name, source_asset_version, publication_digest FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1').get(paperId)
  return row
    ? {
        paperId: row.paper_id,
        versionName: row.version_name,
        sourceAssetVersion: row.source_asset_version,
        publicationDigest: row.publication_digest,
      }
    : null
}

function nextVersionName(paths) {
  if (!existsSync(paths.versionsDir)) return 'v1'
  const versions = readdirSync(paths.versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.slice(1)))
  return `v${versions.length === 0 ? 1 : Math.max(...versions) + 1}`
}

function rejectUnreconciledVersionDirectories(paths, db, paperId) {
  if (!existsSync(paths.versionsDir)) return
  const knownVersions = new Set(
    db.prepare('SELECT version_name FROM canonical_paper_publications WHERE paper_id = ?').all(paperId).map((row) => row.version_name),
  )
  for (const entry of readdirSync(paths.versionsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && /^v\d+$/.test(entry.name) && !knownVersions.has(entry.name)) {
      throw publicationError('CANONICAL_PUBLICATION_VERSION_CONFLICT', `Unreconciled immutable version ${entry.name} exists for ${paperId}`)
    }
  }
}

function writeBytes(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, bytes)
}

function writeJson(filePath, value) {
  writeBytes(filePath, stableBytes(value))
}

function readLatestRef(paths) {
  const refPath = path.join(paths.latestDir, latestRefFileName)
  return existsSync(refPath) ? readJsonFile(refPath) : null
}

function makeLatestSwap(paths) {
  return {
    preparedLatest: path.join(
      paths.paperDir,
      `.latest-staging-${randomUUID()}`,
    ),
    previousLatest: path.join(
      paths.paperDir,
      `.latest-previous-${randomUUID()}`,
    ),
    hadLatest: existsSync(paths.latestDir),
  }
}

function setLatestRef(
  paths,
  ref,
  swap = makeLatestSwap(paths),
  failurePoint = null,
) {
  const { preparedLatest, previousLatest, hadLatest } = swap
  writeJson(path.join(preparedLatest, latestRefFileName), ref)
  if (hadLatest) renameSync(paths.latestDir, previousLatest)
  if (failurePoint === 'during-latest-swap') {
    throw publicationError(
      'CANONICAL_PUBLICATION_FORCED_FAILURE',
      'Forced failure during latest swap',
    )
  }
  renameSync(preparedLatest, paths.latestDir)
}

function samePublicationRef(left, right) {
  return Boolean(
    left
    && right
    && left.paperId === right.paperId
    && left.versionName === right.versionName
    && left.sourceAssetVersion === right.sourceAssetVersion
    && left.publicationDigest === right.publicationDigest,
  )
}

function rollbackLatestRefSwap(paths, journal) {
  if (journal.preparedLatest && existsSync(journal.preparedLatest)) {
    rmSync(journal.preparedLatest, { recursive: true, force: true })
  }
  if (journal.previousLatest && existsSync(journal.previousLatest)) {
    if (existsSync(paths.latestDir)) {
      rmSync(paths.latestDir, { recursive: true, force: true })
    }
    renameSync(journal.previousLatest, paths.latestDir)
    return
  }
  const latest = readLatestRef(paths)
  if (journal.hadLatest) {
    if (!samePublicationRef(latest, journal.previous)) {
      throw publicationError(
        'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
        'The byte-preserved previous latest Publication cannot be recovered',
      )
    }
    return
  }
  if (!latest) return
  if (!samePublicationRef(latest, journal.target)) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Unexpected latest Publication appeared during recovery',
    )
  }
  rmSync(paths.latestDir, { recursive: true, force: true })
}

function cleanupRecoveryPaths(paths, journal) {
  for (const candidate of [
    journal.preparedLatest,
    journal.previousLatest,
    journal.stageDir,
  ]) {
    if (candidate && existsSync(candidate)) {
      rmSync(candidate, { recursive: true, force: true })
    }
  }
  rmSync(paths.journalPath, { force: true })
}

function makeRecoveryJournal({
  paths,
  operation,
  target,
  previous,
  stageDir = null,
}) {
  const latestSwap = makeLatestSwap(paths)
  return {
    schemaVersion: 'canonical-latest-swap-journal-v1',
    operation,
    target,
    previous: previous || null,
    previousDigest: previous?.publicationDigest || null,
    stageDir,
    previousLatest: latestSwap.previousLatest,
    preparedLatest: latestSwap.preparedLatest,
    hadLatest: latestSwap.hadLatest,
  }
}

function validateRecoveryRef(ref, paperId, label) {
  if (
    !ref
    || ref.paperId !== paperId
    || !/^v[1-9]\d*$/.test(ref.versionName)
    || !Number.isInteger(ref.sourceAssetVersion)
    || ref.sourceAssetVersion < 1
    || !/^sha256:[a-f0-9]{64}$/.test(ref.publicationDigest)
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      `${label} does not contain one exact Publication identity`,
    )
  }
  return ref
}

function readRecoveryJournal(paths, paperId) {
  let journal
  try {
    journal = readJsonFile(paths.journalPath)
  } catch {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal is unreadable',
    )
  }
  const operation = journal.operation || 'publish'
  if (
    journal.schemaVersion !== 'canonical-latest-swap-journal-v1'
    || !['publish', 'rollback'].includes(operation)
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal has an unknown protocol',
    )
  }
  const target = validateRecoveryRef(journal.target, paperId, 'Recovery target')
  const previous = journal.previous
    ? validateRecoveryRef(journal.previous, paperId, 'Recovery predecessor')
    : null
  if (
    journal.previous
    && journal.previousDigest !== journal.previous.publicationDigest
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery predecessor digest disagrees with its identity',
    )
  }
  if (
    journal.previousLatest !== null
    && typeof journal.previousLatest !== 'string'
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal has an invalid previous-latest path',
    )
  }
  if (typeof journal.previousLatest === 'string') {
    const previousLatest = path.resolve(journal.previousLatest)
    if (
      path.dirname(previousLatest) !== paths.paperDir
      || !/^\.latest-previous-[a-f0-9-]+$/.test(path.basename(previousLatest))
    ) {
      throw publicationError(
        'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
        'Publication recovery journal points outside its paper directory',
      )
    }
  }
  if (
    journal.preparedLatest !== undefined
    && (
      typeof journal.preparedLatest !== 'string'
      || path.dirname(path.resolve(journal.preparedLatest)) !== paths.paperDir
      || !/^\.latest-staging-[a-f0-9-]+$/.test(
        path.basename(journal.preparedLatest),
      )
    )
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal has an invalid prepared-latest path',
    )
  }
  if (
    journal.hadLatest !== undefined
    && typeof journal.hadLatest !== 'boolean'
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal has an invalid prior-latest state',
    )
  }
  if (
    journal.stageDir !== undefined
    && journal.stageDir !== null
    && (
      typeof journal.stageDir !== 'string'
      || path.dirname(path.resolve(journal.stageDir)) !== paths.paperDir
      || !/^\.staging-[a-f0-9-]+$/.test(path.basename(journal.stageDir))
    )
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
      'Publication recovery journal has an invalid staged-version path',
    )
  }
  return {
    ...journal,
    operation,
    target,
    previous,
    stageDir: journal.stageDir || null,
  }
}

export function recoverCanonicalPaperPublication({ rootDir, db, paperId }) {
  ensureCanonicalPublicationDatabaseShape(db)
  const paths = paperPaths(rootDir, paperId)
  if (!existsSync(paths.journalPath)) return { status: 'clean' }
  const journal = readRecoveryJournal(paths, paperId)
  const current = currentDbRef(db, paperId)
  if (samePublicationRef(current, journal.target)) {
    loadCanonicalOnlyConsumers({
      ref: journal.target,
      store: createFileSystemCanonicalPublicationStore({ rootDir, db }),
    })
    const latest = readLatestRef(paths)
    if (!samePublicationRef(latest, journal.target)) {
      const recoverySwap = makeLatestSwap(paths)
      setLatestRef(paths, journal.target, recoverySwap)
      if (existsSync(recoverySwap.previousLatest)) {
        rmSync(recoverySwap.previousLatest, { recursive: true, force: true })
      }
    }
    cleanupRecoveryPaths(paths, journal)
    return { status: 'post_commit_recovered' }
  }
  const matchesPrevious = journal.previous
    ? samePublicationRef(current, journal.previous)
    : (
        (!current && journal.previousDigest === null)
        || current?.publicationDigest === journal.previousDigest
      )
  if (matchesPrevious) {
    rollbackLatestRefSwap(paths, journal)
    const targetDir = path.join(paths.versionsDir, journal.target.versionName)
    if (journal.operation === 'publish' && existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
    cleanupRecoveryPaths(paths, journal)
    return { status: 'pre_commit_rolled_back' }
  }
  throw publicationError('CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS', 'Journal and SQLite current reference cannot be reconciled uniquely')
}

function runJournaledCanonicalRefSwap({
  paths,
  db,
  journal,
  failurePoint,
  commitCurrent,
  validateCommitted,
}) {
  const targetDir = path.join(paths.versionsDir, journal.target.versionName)
  let committed = false
  let transactionStarted = false
  writeJson(paths.journalPath, journal)
  try {
    if (journal.stageDir) {
      if (existsSync(targetDir)) {
        throw publicationError(
          'CANONICAL_PUBLICATION_VERSION_CONFLICT',
          `Immutable ${journal.target.versionName} is already occupied`,
        )
      }
      renameSync(journal.stageDir, targetDir)
    }
    if (failurePoint === 'after-version-rename-crash') {
      const error = publicationError(
        'CANONICAL_PUBLICATION_FORCED_CRASH',
        'Forced crash after immutable version rename',
      )
      error.preserveRecoveryState = true
      throw error
    }
    db.exec('BEGIN IMMEDIATE')
    transactionStarted = true
    setLatestRef(paths, journal.target, {
      preparedLatest: journal.preparedLatest,
      previousLatest: journal.previousLatest,
      hadLatest: journal.hadLatest,
    }, failurePoint)
    if (failurePoint === 'after-latest-before-commit') {
      throw publicationError(
        'CANONICAL_PUBLICATION_FORCED_FAILURE',
        'Forced pre-commit failure',
      )
    }
    commitCurrent()
    db.exec('COMMIT')
    transactionStarted = false
    committed = true
    if (failurePoint === 'after-commit') {
      throw publicationError(
        'CANONICAL_PUBLICATION_FORCED_FAILURE',
        'Forced post-commit interruption',
      )
    }
    const validated = validateCommitted()
    cleanupRecoveryPaths(paths, journal)
    return validated
  } catch (error) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK') } catch {}
    }
    if (!committed && !error.preserveRecoveryState) {
      try {
        rollbackLatestRefSwap(paths, journal)
        if (journal.operation === 'publish' && existsSync(targetDir)) {
          rmSync(targetDir, { recursive: true, force: true })
        }
        cleanupRecoveryPaths(paths, journal)
      } catch (recoveryError) {
        throw publicationError(
          'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
          `Pre-commit recovery failed: ${recoveryError.message}`,
        )
      }
    }
    throw error
  }
}

function candidateStore(sealed, ref) {
  const manifestFileName = publicationFileNameFor(sealed.manifest.authority)
  return {
    readPublishedRefs() {
      return { current: ref, latest: ref }
    },
    readVersionArtifact(_ref, relativePath) {
      if (relativePath === `canonical/${manifestFileName}`) {
        return stableBytes(sealed.manifest)
      }
      return sealed.artifacts[relativePath]
        || sealed.sourceEvidence[relativePath]
        || null
    },
    readSourceAsset() {
      return sealed.sourceAsset
    },
  }
}

export function loadCanonicalOnlyConsumers({ ref, store }) {
  const consumers = {}
  for (const consumerId of Object.keys(
    consumerContractRefs,
  )) {
    const consumption = loadPaperForConsumptionSync({
      paperId: ref.paperId,
      version: ref.versionName,
      consumerId,
    }, store)
    if (
      consumption.disposition !== 'ready'
      || consumption.selections.length === 0
      || consumption.selections.some((selection) => selection.mode !== 'canonical')
    ) {
      const diagnostic = consumption.diagnostics?.[0]
      throw publicationError(
        diagnostic?.code || 'CANONICAL_IMPORT_CONSUMER_UNAVAILABLE',
        diagnostic?.message
          || `${consumerId} cannot consume every required canonical family`,
      )
    }
    consumers[consumerId] = consumption
  }
  return consumers
}

function admissionFailure(compilation, error = null) {
  const reportDiagnostics =
    compilation?.artifacts?.normalizationReport?.diagnostics
  const diagnostics = Array.isArray(reportDiagnostics)
    && reportDiagnostics.length > 0
    ? reportDiagnostics
    : Array.isArray(error?.diagnostics) && error.diagnostics.length > 0
      ? error.diagnostics
      : [{
        code: error?.code || 'CANONICAL_IMPORT_ADMISSION_INVALID',
        message: error instanceof Error ? error.message : String(error),
      }]
  return {
    ok: false,
    status: 'admission_failed',
    disposition: compilation?.disposition || 'unsupported',
    diagnostics,
    artifacts: compilation?.artifacts
      ? {
          sourceCapture: compilation.artifacts.sourceCapture,
          normalizationReport: compilation.artifacts.normalizationReport,
        }
      : undefined,
  }
}

/**
 * Pure write latch for new imports. Compilation, complete Publication sealing,
 * and both supported Consumer Contracts must agree before a caller may touch
 * database or filesystem state.
 */
export function admitCanonicalPaperImport({
  request,
  sourceAssetVersion,
  sourceAsset,
  listeningAudioBytes = null,
  registeredConfirmation,
  externalListeningReviewProof = null,
  paperHeader,
}) {
  let compilation
  let effectiveSourceAsset = sourceAsset
  let registeredConfirmationProof = null
  let trustedDocxConfirmationProof = null
  let docxPairConfirmationProof = null
  let nck1MaterializationConfirmationProof = null
  let nck1AnalyzedPackageConfirmationProof = null
  try {
    if (registeredConfirmation !== undefined) {
      if (request !== undefined || sourceAsset !== undefined) {
        throw publicationError(
          'CANONICAL_PUBLICATION_REGISTERED_INPUT_INVALID',
          'Registered confirmation admission resolves its own source and does not accept an import request or source override',
        )
      }
      const registered = resolveRegisteredConfirmedCanonicalAdmission(
        registeredConfirmation,
      )
      compilation = registered.compilation
      effectiveSourceAsset = registered.sourceAsset
      registeredConfirmationProof = registered.proof
    } else if (isNck1AnalyzedPackageCanonicalImportRequest(request)) {
      const admitted = admitLiveConfirmedNck1AnalyzedPackageImport(request)
      compilation = admitted.compilation
      effectiveSourceAsset = admitted.sourceAsset
      nck1AnalyzedPackageConfirmationProof = admitted.proof
    } else if (isNck1MaterializationCanonicalImportRequest(request)) {
      const admitted = admitLiveConfirmedNck1MaterializationImport(request)
      compilation = admitted.compilation
      effectiveSourceAsset = admitted.sourceAsset
      nck1MaterializationConfirmationProof = admitted.proof
      if (sourceAsset !== undefined) {
        const supplied = sourceAsset instanceof Uint8Array
          ? sourceAsset
          : null
        if (!supplied || sha256(supplied) !== sha256(admitted.sourceAsset)) {
          throw publicationError(
            'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
            'NCK1 materialization admission source asset must be the exact request materialization bytes',
          )
        }
      }
    } else if (isDocxPairCanonicalImportRequest(request)) {
      const admitted = admitLiveConfirmedDocxPairImport(request)
      compilation = admitted.compilation
      effectiveSourceAsset = admitted.sourceAsset
      docxPairConfirmationProof = admitted.proof
      if (sourceAsset !== undefined) {
        const supplied = sourceAsset instanceof Uint8Array
          ? sourceAsset
          : null
        if (!supplied || sha256(supplied) !== sha256(admitted.sourceAsset)) {
          throw publicationError(
            'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
            'DOCX pair admission source asset must be the exact request question_docx bytes',
          )
        }
      }
    } else if (isTrustedDocxCanonicalImportRequest(request)) {
      const admitted = admitLiveConfirmedTrustedDocxImport(request)
      compilation = admitted.compilation
      effectiveSourceAsset = admitted.sourceAsset
      trustedDocxConfirmationProof = admitted.proof
      if (sourceAsset !== undefined) {
        const supplied = sourceAsset instanceof Uint8Array
          ? sourceAsset
          : null
        if (!supplied || sha256(supplied) !== sha256(admitted.sourceAsset)) {
          throw publicationError(
            'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
            'Trusted DOCX admission source asset must be the exact request source_docx bytes',
          )
        }
      }
    } else {
      compilation = compileCanonicalPaper(request)
    }
  } catch (error) {
    return admissionFailure(compilation, error)
  }
  if (compilation.disposition !== 'ready') {
    return admissionFailure(compilation)
  }
  try {
    const sealed = sealCanonicalPublication({
      compilation,
      sourceAssetVersion,
      sourceAsset: effectiveSourceAsset,
      listeningAudioBytes,
      registeredConfirmationProof,
      trustedDocxConfirmationProof,
      docxPairConfirmationProof,
      nck1MaterializationConfirmationProof,
      nck1AnalyzedPackageConfirmationProof,
      externalListeningReviewProof,
      paperHeader,
    })
    const ref = {
      paperId: sealed.manifest.paperId,
      versionName: `v${sourceAssetVersion}`,
      sourceAssetVersion,
      publicationDigest: sealed.manifest.publicationDigest,
    }
    const consumers = loadCanonicalOnlyConsumers({
      ref,
      store: candidateStore(sealed, ref),
    })
    return {
      ok: true,
      status: 'ready',
      disposition: 'ready',
      compilation,
      sealed,
      consumers,
    }
  } catch (error) {
    return admissionFailure(compilation, error)
  }
}

export function publishCanonicalPaperPublication({
  rootDir,
  db,
  request,
  sourceAssetVersion,
  sourceAsset,
  registeredConfirmation,
  failurePoint = null,
}) {
  const admission = admitCanonicalPaperImport({
    request,
    sourceAssetVersion,
    sourceAsset,
    registeredConfirmation,
  })
  if (!admission.ok) return admission
  const { sealed } = admission
  const { paperId } = sealed.manifest
  const paths = paperPaths(rootDir, paperId)
  mkdirSync(paths.versionsDir, { recursive: true })
  recoverCanonicalPaperPublication({ rootDir, db, paperId })
  rejectUnreconciledVersionDirectories(paths, db, paperId)
  const existingIdentity = db.prepare(
    'SELECT version_name, publication_digest FROM canonical_paper_publications WHERE paper_id = ? AND source_asset_version = ?',
  ).all(paperId, sourceAssetVersion)
  const existing = existingIdentity.find(
    (row) => row.publication_digest === sealed.manifest.publicationDigest,
  )
  if (
    existingIdentity.some(
      (row) => row.publication_digest !== sealed.manifest.publicationDigest,
    )
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_IDENTITY_CONFLICT',
      `Source asset version ${sourceAssetVersion} is already bound to another Publication digest`,
    )
  }
  if (existing) {
    const ref = {
      paperId,
      versionName: existing.version_name,
      sourceAssetVersion,
      publicationDigest: sealed.manifest.publicationDigest,
    }
    const consumers = loadCanonicalOnlyConsumers({
      ref,
      store: createFileSystemCanonicalPublicationStore({ rootDir, db }),
    })
    return {
      status: 'idempotent',
      paperId,
      versionName: existing.version_name,
      publicationDigest: sealed.manifest.publicationDigest,
      consumers,
    }
  }
  const versionName = nextVersionName(paths)
  const stageDir = path.join(paths.paperDir, `.staging-${randomUUID()}`)
  try {
    writeBytes(path.join(stageDir, 'paper-asset.json'), sealed.sourceAsset)
    for (const [relativePath, bytes] of Object.entries(sealed.artifacts)) writeBytes(path.join(stageDir, relativePath), bytes)
    for (const [relativePath, bytes] of Object.entries(sealed.sourceEvidence)) writeBytes(path.join(stageDir, relativePath), bytes)
    const manifestFileName = publicationFileNameFor(sealed.manifest.authority)
    writeJson(path.join(stageDir, 'canonical', manifestFileName), sealed.manifest)
    const reopenedManifest = readJsonFile(path.join(stageDir, 'canonical', manifestFileName))
    validateCanonicalPublicationBundle({
      manifest: reopenedManifest,
      sourceAsset: readFileSync(path.join(stageDir, 'paper-asset.json')),
      readArtifact: (relativePath) => readFileSync(path.join(stageDir, relativePath)),
    })
    if (failurePoint === 'before-version-rename') throw publicationError('CANONICAL_PUBLICATION_FORCED_FAILURE', 'Forced pre-rename failure')
    const previous = currentDbRef(db, paperId)
    const target = { paperId, versionName, sourceAssetVersion, publicationDigest: sealed.manifest.publicationDigest }
    const journal = makeRecoveryJournal({
      paths,
      operation: 'publish',
      target,
      previous,
      stageDir,
    })
    const consumers = runJournaledCanonicalRefSwap({
      paths,
      db,
      journal,
      failurePoint,
      commitCurrent: () => recordCanonicalPublicationCurrent(db, target),
      validateCommitted: () => loadCanonicalOnlyConsumers({
        ref: target,
        store: createFileSystemCanonicalPublicationStore({ rootDir, db }),
      }),
    })
    return {
      status: 'published',
      paperId,
      versionName,
      publicationDigest: sealed.manifest.publicationDigest,
      consumers,
    }
  } catch (error) {
    if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true })
    throw error
  }
}

export function rollbackCanonicalPaperPublication({
  rootDir,
  db,
  paperId,
  versionName,
  failurePoint = null,
}) {
  ensureCanonicalPublicationDatabaseShape(db)
  const paths = paperPaths(rootDir, paperId)
  recoverCanonicalPaperPublication({ rootDir, db, paperId })
  const target = currentDbRef(db, paperId, versionName)
  if (!target) {
    throw publicationError(
      'CANONICAL_PUBLICATION_ROLLBACK_TARGET_NOT_FOUND',
      `Rollback target ${versionName} is not a recorded immutable Publication`,
    )
  }
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const consumers = loadCanonicalOnlyConsumers({ ref: target, store })
  const previous = currentDbRef(db, paperId)
  if (
    previous?.versionName === target.versionName
    && previous.publicationDigest === target.publicationDigest
  ) {
    const latest = readLatestRef(paths)
    if (!samePublicationRef(latest, target)) {
      throw publicationError(
        'CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS',
        'Rollback target is current in SQLite but latest does not bind the same Publication',
      )
    }
    return {
      status: 'idempotent',
      paperId,
      versionName,
      publicationDigest: target.publicationDigest,
      consumers,
    }
  }

  const journal = makeRecoveryJournal({
    paths,
    operation: 'rollback',
    target,
    previous,
  })
  const committedConsumers = runJournaledCanonicalRefSwap({
    paths,
    db,
    journal,
    failurePoint,
    commitCurrent: () => selectCanonicalPublicationCurrent(db, target),
    validateCommitted: () => loadCanonicalOnlyConsumers({
      ref: target,
      store,
    }),
  })
  return {
    status: 'rolled_back',
    paperId,
    versionName,
    publicationDigest: target.publicationDigest,
    consumers: committedConsumers,
  }
}

export function createFileSystemCanonicalPublicationStore({ rootDir, db }) {
  return {
    readPublishedRefs(paperId, versionName = null) {
      ensureCanonicalPublicationDatabaseShape(db)
      const paths = paperPaths(rootDir, paperId)
      const current = currentDbRef(db, paperId, versionName)
      const latest = versionName ? current : readLatestRef(paths)
      return { current, latest }
    },
    readVersionArtifact(ref, relativePath) {
      const paths = paperPaths(rootDir, ref.paperId)
      if (typeof ref.versionName !== 'string' || !/^v\d+$/.test(ref.versionName) || typeof relativePath !== 'string' || relativePath.includes('..') || path.isAbsolute(relativePath)) return null
      const filePath = path.join(paths.versionsDir, ref.versionName, relativePath)
      return existsSync(filePath) ? readFileSync(filePath) : null
    },
    readSourceAsset(ref) {
      const paths = paperPaths(rootDir, ref.paperId)
      if (typeof ref.versionName !== 'string' || !/^v\d+$/.test(ref.versionName)) return null
      const versionDir = path.join(paths.versionsDir, ref.versionName)
      for (const relativePath of [
        'canonical/source-asset.bin',
        'paper-asset.json',
      ]) {
        const filePath = path.join(versionDir, relativePath)
        if (existsSync(filePath)) return readFileSync(filePath)
      }
      return null
    },
  }
}

function sourceOwnedApplicationInstructions(validated, sourceAsset) {
  if (validated.plan.paperId !== 'paper-2026-i') return new Map()
  let sourceCapture
  try {
    sourceCapture = JSON.parse(new TextDecoder().decode(sourceAsset))
  } catch {
    return new Map()
  }
  if (sourceCapture?.schemaVersion !== 'source-capture-v1') return new Map()
  const assetObservation = sourceCapture.observations?.find(
    (observation) => observation?.value?.role === 'asset-projection',
  )
  const assetDocument = sourceCapture.documents?.find(
    (document) => document.documentId === assetObservation?.documentId,
  )
  if (
    !assetDocument
    || typeof assetDocument.encodedBytes !== 'string'
  ) return new Map()
  const assetBytes = Buffer.from(assetDocument.encodedBytes, 'base64')
  if (
    assetBytes.byteLength !== assetDocument.byteLength
    || sha256(assetBytes) !== assetDocument.sha256
  ) {
    throw publicationError(
      'CANONICAL_PUBLICATION_SOURCE_ASSET_INVALID',
      'Ticket 26 asset-projection source evidence is corrupt',
    )
  }
  const asset = readJsonBytes(assetBytes, 'Ticket 26 asset-projection source evidence')
  const blocks = asset?.content?.blocks
  if (asset?.schemaVersion !== 'paper-asset-v1' || !Array.isArray(blocks)) return new Map()
  const instructionsByGroupId = new Map()
  for (const occurrence of validated.projected.nodes) {
    if (
      occurrence?.kind !== 'group'
      || occurrence.familyContractId !== 'application-writing'
      || occurrence.writingMode !== 'legacy_opaque'
      || occurrence.groupId !== 'group-2026-i-writing-application'
      || typeof occurrence.groupId !== 'string'
      || typeof occurrence.writingTaskId !== 'string'
    ) continue
    const groupIndex = blocks.findIndex(
      (block) => block?.type === 'group' && block.groupId === occurrence.groupId,
    )
    const instruction = blocks[groupIndex + 1]
    const response = blocks[groupIndex + 2]
    if (
      groupIndex < 0
      || instruction?.type !== 'instruction'
      || typeof instruction.text !== 'string'
      || instruction.text.length === 0
      || response?.type !== 'answerBox'
      || response.writingTaskId !== occurrence.writingTaskId
    ) {
      throw publicationError(
        'CANONICAL_PUBLICATION_SOURCE_ASSET_INVALID',
        `Legacy Application Writing ${occurrence.groupId} lacks one source-owned instruction before its response box`,
      )
    }
    instructionsByGroupId.set(occurrence.groupId, [{
      sourceBlockIndex: groupIndex + 1,
      text: instruction.text,
    }])
  }
  return instructionsByGroupId
}

function canonicalSelections(validated, contract, sourceAsset) {
  if (validated.groups.some(group => group.variant?.response?.drawingArea)
    && !closureRendersApplicationDrawingArea(resolveCanonicalAuthority(
      authorityRefForManifestDigest(contract.authorityManifestDigest)).closure)) {
    throw publicationError(
      'CANONICAL_CONSUMER_APPLICATION_DRAWING_AREA_UNAVAILABLE',
      'This paper requires a consumer that preserves the source-backed Application Writing drawing area',
    )
  }
  const stemFigureGroups = validated.groups.filter(group =>
    group.variant.family === 'reading' && group.variant.questions.some(question => question.stemFigures !== undefined))
  if (stemFigureGroups.length && (!consumerRendersReadingStemFigures({
    id: contract.consumerId, version: contract.version, digest: contract.contractDigest,
  }) || stemFigureGroups.some(group => !contract.families.some(entry =>
    entry.familyContractId === 'reading'
      && entry.version === group.contractRef.familyContractVersion
      && entry.digest === group.contractRef.familyContractDigest)))) {
    throw publicationError('CANONICAL_CONSUMER_STEM_FIGURE_UNAVAILABLE',
      'Reading stem figures require the exact successor family and renderer capability')
  }
  if (validated.groups.some(group => group.sourcePresentation !== undefined)
    && Number(authorityRefForManifestDigest(contract.authorityManifestDigest)?.manifestVersion) < 62) {
    throw publicationError(
      'CANONICAL_CONSUMER_SOURCE_PRESENTATION_UNAVAILABLE',
      'This paper requires a consumer that preserves source directions and listening example presence',
    )
  }
  if (validated.groups.some(group => group.contractRef.familyContractId === 'application-writing'
    && group.content.blocks.some(block => block.kind === 'figure'))
    && !closureRendersApplicationPromptFigures(resolveCanonicalAuthority(
      authorityRefForManifestDigest(contract.authorityManifestDigest)).closure)) {
    throw publicationError(
      'CANONICAL_CONSUMER_APPLICATION_PROMPT_FIGURE_UNAVAILABLE',
      'This paper requires a consumer that renders source-backed Application Writing prompt figures',
    )
  }
  const applicationInstructions = sourceOwnedApplicationInstructions(
    validated,
    sourceAsset,
  )
  const firstSectionPlayback = sourceBoundFirstSectionPlayback(sourceAsset)
  const groupIdsByFamily = new Map()
  for (const group of validated.groups) {
    const familyId = group.contractRef.familyContractId
    const groupIds = groupIdsByFamily.get(familyId) || []
    groupIds.push(group.identity.groupId)
    groupIdsByFamily.set(familyId, groupIds)
  }
  const selections = []
  for (const [familyContractId, groupIds] of groupIdsByFamily) {
    const capability = contract.families.find((entry) => entry.familyContractId === familyContractId)
    if (!capability || !capability.canonical) {
      throw publicationError(
        'CANONICAL_CONSUMER_FAMILY_UNAVAILABLE',
        `Consumer Contract cannot project canonical family ${familyContractId}`,
      )
    }
    const projectedOccurrences = decorateProjectedMediaPresentation(
      validated.projected.nodes
        .filter((node) => node.kind === 'group' && groupIds.includes(node.groupId))
        .map((occurrence) => {
          const sourceOwnedInstructions = applicationInstructions.get(
            occurrence.groupId,
          )
          const decoratedOccurrence = sourceOwnedInstructions
            ? { ...occurrence, sourceOwnedInstructions }
            : occurrence
          return enrichSourceBoundListeningPlayback(
            decoratedOccurrence,
            firstSectionPlayback,
          )
        }),
      validated.sourceCapture,
    )
    selections.push({
      mode: 'canonical',
      familyContractId,
      groupIds,
      projectedOccurrences,
      ...(
        (
          familyContractId === 'listening'
        )
        || projectedOccurrences.some(occurrence => occurrence.sourcePresentation !== undefined)
        || (
          familyContractId === 'seven-choices'
          && ['47', '48', '49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79', '80'].includes(validated.plan.authorityRef.manifestVersion)
        )
        || (
          familyContractId === 'cloze'
          && Number(validated.plan.authorityRef.manifestVersion) >= 18
        )
        || (
          familyContractId === 'grammar-fill'
          && Number(validated.plan.authorityRef.manifestVersion) >= 20
        )
        || (
          familyContractId === 'continuation-writing'
          && ['49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79', '80'].includes(validated.plan.authorityRef.manifestVersion)
        )
        ? {
            projectedOccurrenceDigests: projectedOccurrences.map(
              (occurrence) => ({
                groupId: occurrence.groupId,
                digest: digestJson(occurrence),
              }),
            ),
          }
        : {}),
    })
  }
  return { selections, allFamilyIds: [...groupIdsByFamily.keys()] }
}

function canonicalVisibleStructure(validated) {
  const visibleStructure = validated.projected.nodes.flatMap((node) => {
    if (
      node.kind === 'part'
      || node.kind === 'section'
      || node.kind === 'instruction'
    ) return [structuredClone(node)]
    if (node.kind === 'group') {
      return [{
        kind: 'group',
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      }]
    }
    if (node.kind === 'answer_region') return []
    throw publicationError(
      'CANONICAL_CONSUMPTION_REJECTED',
      `Projected visible structure has unknown node kind ${node.kind}`,
    )
  })
  assertCanonicalVisibleStructure(
    visibleStructure,
    validated.projected.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => ({
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      })),
  )
  return visibleStructure
}

function canonicalMediaArtifacts(validated) {
  const documentsByArtifactId = new Map(
    validated.sourceCapture.documents.map((document) => [
      document.immutableArtifactRef?.artifactId,
      document,
    ]),
  )
  const mediaById = new Map()
  for (const occurrence of validated.projected.nodes) {
    if (occurrence?.kind !== 'group') continue
    for (const media of occurrence.media || []) {
      const document = documentsByArtifactId.get(
        media.sourceArtifactRef?.artifactId,
      )
      if (
        !document
        || document.sha256 !== media.sha256
        || document.mediaType !== media.mimeType
        || typeof document.encodedBytes !== 'string'
      ) {
        throw publicationError(
          'CANONICAL_PUBLICATION_MEDIA_CLOSURE_INVALID',
          `Canonical media ${media.mediaId} does not resolve to immutable source bytes`,
        )
      }
      const existing = mediaById.get(media.mediaId)
      const artifact = {
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        sha256: media.sha256,
        pixelWidth: media.pixelWidth,
        pixelHeight: media.pixelHeight,
        sourceArtifactRef: media.sourceArtifactRef,
        encodedBytes: document.encodedBytes,
      }
      if (existing && stableStringify(existing) !== stableStringify(artifact)) {
        throw publicationError(
          'CANONICAL_PUBLICATION_MEDIA_CLOSURE_INVALID',
          `Canonical media identity ${media.mediaId} is ambiguous`,
        )
      }
      mediaById.set(media.mediaId, artifact)
    }
  }
  return [...mediaById.values()]
}

function selectPublishedRef(request, refs) {
  if (!refs.current) {
    return {
      disposition: 'not_found',
      diagnostics: [{ code: 'PUBLICATION_NOT_FOUND' }],
    }
  }
  if (
    !request.version
    && (
      !refs.latest
      || refs.current.publicationDigest !== refs.latest.publicationDigest
      || refs.current.versionName !== refs.latest.versionName
    )
  ) return { disposition: 'retry' }
  return { disposition: 'selected', ref: refs.current }
}

function validateConsumptionPublication({
  ref,
  manifestBytes,
  manifestFileName,
  sourceAsset,
  store,
  contract,
}) {
  const manifest = readJsonBytes(manifestBytes, manifestFileName)
  if (manifest.publicationDigest !== ref.publicationDigest) {
    throw publicationError('CANONICAL_PUBLICATION_DIGEST_INVALID', 'Publication manifest differs from the exact selected version digest')
  }
  const validated = validateCanonicalPublicationBundle({
    manifest,
    sourceAsset,
    readArtifact: (relativePath) => {
      const value = store.readVersionArtifact(ref, relativePath)
      if (value instanceof Promise) {
        throw publicationError(
          'CANONICAL_PUBLICATION_STORE_ASYNC',
          'Store artifact reads must be synchronous inside package validation',
        )
      }
      return value
    },
  })
  let playbackUi = null
  if (manifest.listeningAudio) {
    try {
      const bytes = store.readVersionArtifact(ref, PUBLISHED_LISTENING_PLAYBACK_UI_FILE)
      if (bytes) {
        const { digest, ...value } = readJsonBytes(bytes, 'listening playback UI')
        if (digest !== digestJson(value)) throw new Error('Listening playback UI digest mismatch')
        playbackUi = assertListeningPlaybackUi(value, manifest.listeningAudio.sha256, manifest.listeningAudio.durationSeconds)
      }
    } catch {
      // A missing/corrupt playback derivative cannot invalidate paper meaning
      // or supply unchecked timings. Historical browser playback remains available.
    }
  }
  let paperSourceType = null
  const paperHeaderTitle = validatedPaperHeaderTitle(manifest.paperHeader)
  try {
    const paperAssetBytes = store.readVersionArtifact(ref, 'paper-asset.json')
    if (paperAssetBytes) {
      const asset = readJsonBytes(paperAssetBytes, 'paper asset')
      paperSourceType = asset.sources?.sourceType
      // Compatibility metadata is not bound for Universal NCK1. It cannot
      // enable or override the approved publication-envelope title.
    }
  } catch {
    // Canonical-only historical publications need not have a compatibility asset.
  }
  return {
    manifest,
    selection: { ...canonicalSelections(validated, contract, sourceAsset), ...(playbackUi ? { playbackUi } : {}),
      ...(paperHeaderTitle !== undefined ? { paperHeaderTitle } : {}),
      ...(['真题', '模拟题', '校本题', '自编题'].includes(paperSourceType) ? { paperSourceType } : {}) },
    visibleStructure: canonicalVisibleStructure(validated),
    profileRef: structuredClone(validated.plan.profileRef),
    mediaArtifacts: canonicalMediaArtifacts(validated),
    publicationSource: Object.freeze({
      paperId: manifest.paperId,
      sourceAssetVersion: ref.sourceAssetVersion,
      publicationDigest: manifest.publicationDigest,
      authorityRef: Object.freeze(structuredClone(manifest.authority)),
      documentId: validated.sourceAssetDocument.documentId,
      mediaType: validated.sourceAssetDocument.mediaType,
      sha256: validated.sourceAssetDocument.sha256,
      byteLength: validated.sourceAssetDocument.byteLength,
    }),
  }
}

function readyConsumption(
  request,
  ref,
  manifest,
  canonical,
  visibleStructure,
  profileRef,
  mediaArtifacts,
  publicationSource,
) {
  const consumption = {
    disposition: 'ready',
    paperId: request.paperId,
    sourceAssetVersion: ref.sourceAssetVersion,
    publicationDigest: manifest.publicationDigest,
    ...(
      Number(manifest.authority.manifestVersion) >= 23
        ? { consumerContractRef: structuredClone(request.consumerContract) }
        : {}
    ),
    ...(
      // Preserve the byte-pinned pre-v18 Consumption Plan shape.
      Number(manifest.authority.manifestVersion) >= 18
        ? {
            sourceAssetDigest: manifest.sourceAssetDigest,
            authorityRef: structuredClone(manifest.authority),
          }
        : {}
    ),
    selections: canonical.selections,
    ...(canonical.paperSourceType ? { paperSourceType: canonical.paperSourceType } : {}),
    ...(canonical.paperHeaderTitle !== undefined ? { paperHeaderTitle: canonical.paperHeaderTitle } : {}),
    ...(manifest.listeningAudio ? {
      listeningAudio: {
        ...manifest.listeningAudio,
        url: `/paper-assets/${encodeURIComponent(request.paperId)}/versions/v${ref.sourceAssetVersion}/${manifest.listeningAudio.relativePath}`,
        ...(canonical.playbackUi || {}),
      },
    } : {}),
    ...(
      Number(manifest.authority.manifestVersion) >= 30
        ? { visibleStructure }
        : {}
    ),
    ...(
      Number(manifest.authority.manifestVersion) >= 31
        ? {
            profileRef,
            visibleStructureDigest: digestJson(visibleStructure),
          }
        : {}
    ),
    mediaArtifacts,
    diagnostics: [],
  }
  if (Number(manifest.authority.manifestVersion) >= 31) {
    assertCanonicalConsumptionVisibleStructure(consumption)
  }
  const immutableConsumption = Object.freeze(consumption)
  if (publicationSource) {
    immutablePublicationSources.set(immutableConsumption, publicationSource)
  }
  return immutableConsumption
}

/**
 * Returns the exact Publication source identity produced while this canonical
 * consumption was validated. Renderers use this opaque provenance instead of
 * caller-owned source mirrors or raw-asset format guesses.
 */
export function immutablePublicationSourceForConsumption(consumption) {
  return immutablePublicationSources.get(consumption) || null
}

function publicationDiagnostic(error) {
  return {
    code: error.code || 'PUBLICATION_INVALID',
    message: error.message,
  }
}

function consumptionRequestForPublication(request, manifestBytes) {
  if (request.consumerContract) return request
  const manifest = readJsonBytes(manifestBytes, 'consumer authority selection')
  return { ...request,
    consumerContract: consumerContractRefsForAuthority(manifest.authority)[request.consumerId],
  }
}

/**
 * Shared Screen/Print-PDF loader. It resolves one immutable publication
 * and one exact checked-in Consumer Contract before exposing a whole-family
 * consumption plan; existing consumers are intentionally not rewired here.
 */
export async function loadPaperForConsumption(request, store) {
  const consumer = resolveConsumerContract(request.consumerContract || consumerContractRefs[request.consumerId])
  if (!consumer.ok) return { disposition: 'incompatible', diagnostics: consumer.issues }
  for (let attempt = 0; attempt < 2; attempt++) {
    const refs = await store.readPublishedRefs(request.paperId, request.version)
    const selected = selectPublishedRef(request, refs)
    if (selected.disposition === 'not_found') return selected
    if (selected.disposition === 'retry') continue
    const ref = selected.ref
    let manifestBytes = null
    let manifestFileName = null
    for (const candidate of publicationFileNames) {
      manifestBytes = await store.readVersionArtifact(ref, `canonical/${candidate}`)
      if (manifestBytes) {
        manifestFileName = candidate
        break
      }
    }
    const sourceAsset = await store.readSourceAsset(ref)
    if (!manifestBytes || !sourceAsset) continue
    try {
      const selectedRequest = consumptionRequestForPublication(request, manifestBytes)
      const selectedConsumer = resolveConsumerContract(selectedRequest.consumerContract)
      const {
        manifest,
        selection,
        visibleStructure,
        profileRef,
        mediaArtifacts,
        publicationSource,
      } = validateConsumptionPublication({
        ref,
        manifestBytes,
        manifestFileName,
        sourceAsset,
        store,
        contract: selectedConsumer.contract,
      })
      return readyConsumption(
        selectedRequest,
        ref,
        manifest,
        selection,
        visibleStructure,
        profileRef,
        mediaArtifacts,
        publicationSource,
      )
    } catch (error) {
      const diagnostic = publicationDiagnostic(error)
      return { disposition: 'incompatible', diagnostics: [diagnostic] }
    }
  }
  return { disposition: 'retryable_unavailable', diagnostics: [{ code: 'PUBLICATION_REF_DISAGREEMENT' }] }
}

/**
 * Production consumers use synchronous filesystem/database stores. This
 * companion keeps their public render/export boundaries synchronous while
 * preserving the exact validation and whole-family selection performed by the
 * async loader above. Async legacy projectors are intentionally rejected.
 */
export function loadPaperForConsumptionSync(request, store) {
  const consumer = resolveConsumerContract(request.consumerContract || consumerContractRefs[request.consumerId])
  if (!consumer.ok) return { disposition: 'incompatible', diagnostics: consumer.issues }
  for (let attempt = 0; attempt < 2; attempt++) {
    const refs = store.readPublishedRefs(request.paperId, request.version)
    const selected = selectPublishedRef(request, refs)
    if (selected.disposition === 'not_found') return selected
    if (selected.disposition === 'retry') continue
    const ref = selected.ref
    let manifestBytes = null
    let manifestFileName = null
    for (const candidate of publicationFileNames) {
      manifestBytes = store.readVersionArtifact(ref, `canonical/${candidate}`)
      if (manifestBytes) {
        manifestFileName = candidate
        break
      }
    }
    const sourceAsset = store.readSourceAsset(ref)
    if (!manifestBytes || !sourceAsset) continue
    try {
      const selectedRequest = consumptionRequestForPublication(request, manifestBytes)
      const selectedConsumer = resolveConsumerContract(selectedRequest.consumerContract)
      const {
        manifest,
        selection,
        visibleStructure,
        profileRef,
        mediaArtifacts,
        publicationSource,
      } = validateConsumptionPublication({
        ref,
        manifestBytes,
        manifestFileName,
        sourceAsset,
        store,
        contract: selectedConsumer.contract,
      })
      return readyConsumption(
        selectedRequest,
        ref,
        manifest,
        selection,
        visibleStructure,
        profileRef,
        mediaArtifacts,
        publicationSource,
      )
    } catch (error) {
      // Public synchronous consumers are strict: an admitted-but-invalid
      // publication is incompatible and never re-enters legacy projection.
      const diagnostic = publicationDiagnostic(error)
      return {
        disposition: 'incompatible',
        diagnostics: [diagnostic],
      }
    }
  }
  return { disposition: 'retryable_unavailable', diagnostics: [{ code: 'PUBLICATION_REF_DISAGREEMENT' }] }
}

export { canonicalAuthorityRef, latestRefFileName, publicationFileName }
