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

import { canonicalAuthorityRef, resolveCanonicalAuthority, validateJsonSchema } from '../../shared/paper-canonical/authority.mjs'
import { resolveConsumerContract } from '../../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { digestJson, sha256, stableStringify, withoutKey } from '../../shared/paper-canonical/stable.mjs'

const publicationFileName = 'canonical-paper-publication-v1.json'
const latestRefFileName = 'canonical-paper-publication-ref-v1.json'
const journalFileName = '.canonical-latest-swap-v1.json'
const artifactPaths = {
  source_capture: 'canonical/source-capture-v1.json',
  paper_plan: 'canonical/canonical-paper-plan-v1.json',
  question_groups: 'canonical/canonical-question-groups-v1.json',
  normalization_report: 'canonical/normalization-report-v1.json',
}
const safePaperId = /^[a-z0-9][a-z0-9._-]{0,127}$/

function stableBytes(value) {
  return new TextEncoder().encode(`${stableStringify(value)}\n`)
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

function artifactDescriptor(role, value) {
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
  if (typeof encodedBytes !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedBytes)) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', `${label} has invalid base64 evidence`)
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

function validateSourceCaptureIntegrity(sourceCapture) {
  if (!sourceCapture || sourceCapture.digest !== digestJson(withoutKey(withoutKey(sourceCapture, 'captureId'), 'digest'))) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_DIGEST_INVALID', 'Source Capture digest differs from its immutable content')
  const expectedCaptureId = `source-capture:${sourceCapture.digest.slice('sha256:'.length, 28)}`
  if (sourceCapture.captureId !== expectedCaptureId) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_ID_INVALID', 'Source Capture identity does not derive from its immutable content')
  sourceEvidenceDescriptors(sourceCapture)
  const documents = new Map(sourceCapture.documents.map((document) => [document.documentId, document]))
  const spans = new Map()
  for (const span of sourceCapture.sourceSpans || []) {
    const document = documents.get(span.documentId)
    if (!document || typeof span.sourceSpanId !== 'string' || spans.has(span.sourceSpanId) || span.documentDigest !== document.sha256 || !span.coordinate || span.coordinate.kind !== 'byte_range' || !Number.isInteger(span.coordinate.start) || !Number.isInteger(span.coordinate.end) || span.coordinate.start < 0 || span.coordinate.end < span.coordinate.start || span.coordinate.end > document.byteLength) {
      throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture span does not resolve to immutable document bytes')
    }
    spans.set(span.sourceSpanId, span)
  }
  for (const assertion of sourceCapture.assertions || []) if (!spans.has(assertion.sourceSpanId)) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture assertion lacks a resolvable span')
  for (const observation of sourceCapture.observations || []) if (!documents.has(observation.documentId) || !spans.has(observation.sourceSpanId)) throw publicationError('CANONICAL_PUBLICATION_CAPTURE_LINEAGE_INVALID', 'Source Capture observation lacks immutable document lineage')
  return { documents, spans }
}

function validatePublicationLineage({ sourceCapture, plan, groups, normalizationReport, normalizationRules }) {
  const { spans } = validateSourceCaptureIntegrity(sourceCapture)
  const records = normalizationReport.transformationRecords || []
  const recordIds = new Set(records.map((record) => record.recordId))
  const rulesById = new Map((normalizationRules || []).map((rule) => [`${rule.ruleId}@${rule.version}`, rule]))
  if (recordIds.size !== records.length || records.some((record) => {
    const rule = rulesById.get(`${record.ruleId}@${record.ruleVersion}`)
    const proof = rule?.operationProofs?.[record.operation]
    return !rule || !rule.allowedOperations.includes(record.operation) || !proof || proof.kind !== 'identity' || stableStringify(record.preconditions) !== stableStringify(proof.requiredPreconditions) || !Array.isArray(record.inputSourceSpanIds) || record.inputSourceSpanIds.length === 0 || record.inputSourceSpanIds.some((sourceSpanId) => !spans.has(sourceSpanId)) || stableStringify(record.before) !== stableStringify(record.after) || record.outputDigest !== digestJson(record.after)
  })) {
    throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Transformation Records do not prove exact source replay')
  }
  const expectedRecordIds = plan.sourceConformance?.transformationRecordIds || []
  if (!Array.isArray(expectedRecordIds) || expectedRecordIds.length !== records.length || expectedRecordIds.some((recordId) => !recordIds.has(recordId))) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan does not close its transformation ledger')
  const reviewDecisionDigest = digestJson(normalizationReport.reviewDecisions || [])
  if (plan.sourceConformance?.reviewDecisionDigest !== reviewDecisionDigest || !Array.isArray(plan.sourceConformance?.reviewDecisionIds) || plan.sourceConformance.reviewDecisionIds.length !== (normalizationReport.reviewDecisions || []).length || plan.sourceConformance.reviewDecisionIds.some((decisionId, index) => decisionId !== normalizationReport.reviewDecisions[index].decisionId)) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan does not bind its explicit review decisions')
  for (const decision of normalizationReport.reviewDecisions || []) if (!Array.isArray(decision.sourceSpanRefs) || decision.sourceSpanRefs.some((sourceSpanId) => !spans.has(sourceSpanId))) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Review decision does not resolve to captured evidence')
  for (const group of groups) {
    if (group.sourceMap?.captureId !== sourceCapture.captureId || !Array.isArray(group.sourceMap?.entries) || group.sourceMap.entries.some((entry) => !Array.isArray(entry.sourceSpanRefs) || entry.sourceSpanRefs.length === 0 || entry.sourceSpanRefs.some((sourceSpanId) => !spans.has(sourceSpanId)) || !Array.isArray(entry.transformationRecordIds) || entry.transformationRecordIds.some((recordId) => !recordIds.has(recordId)))) {
      throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Group source map does not close against Source Capture')
    }
    const groupSpanIds = [...new Set(group.sourceMap.entries.flatMap((entry) => entry.sourceSpanRefs))]
    const expectedFingerprint = digestJson({ captureDigest: sourceCapture.digest, sourceSpanId: groupSpanIds[0], recordIds: group.sourceMap.entries.flatMap((entry) => entry.transformationRecordIds) })
    if (group.sourceFingerprint !== expectedFingerprint) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Group source fingerprint does not match source lineage')
  }
  for (const assignment of plan.numberingAssignments || []) if (!spans.has(assignment.sourceNumberSpan)) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Canonical Plan numbering assignment lacks a captured source span')
  const expectedDirectSourceMap = groups.flatMap((group) => group.sourceMap.entries)
  const expectedSourceFingerprint = digestJson({ captureDigest: sourceCapture.digest, groupFingerprints: groups.map((group) => group.sourceFingerprint) })
  const expectedSemanticDigest = digestJson({ groups: groups.map((group) => group.semanticDigest), reviewDecisionDigest })
  if (normalizationReport.sourceFingerprint !== expectedSourceFingerprint || stableStringify(normalizationReport.directSourceMap) !== stableStringify(expectedDirectSourceMap) || normalizationReport.semanticDigest !== expectedSemanticDigest) throw publicationError('CANONICAL_PUBLICATION_LINEAGE_INVALID', 'Normalization Report does not close its direct source lineage')
}

export function sealCanonicalPublication({ compilation, sourceAssetVersion, sourceAsset }) {
  if (compilation?.disposition !== 'ready') throw publicationError('CANONICAL_PUBLICATION_BLOCKED', 'Only a complete ready compilation may be published')
  if (!(sourceAsset instanceof Uint8Array) || !Number.isInteger(sourceAssetVersion) || sourceAssetVersion < 1) throw publicationError('CANONICAL_PUBLICATION_INPUT_INVALID', 'Publication needs immutable source asset bytes and a positive version')
  const { sourceCapture, canonicalPaper, normalizationReport } = compilation.artifacts
  assertPaperId(canonicalPaper?.paperPlan?.paperId)
  validateSourceCaptureIntegrity(sourceCapture)
  const sourceEvidence = sourceEvidenceDescriptors(sourceCapture)
  const sourceAssetDigest = sha256(sourceAsset)
  const matchingDocuments = sourceCapture.documents.filter((document) => document.sha256 === sourceAssetDigest)
  if (matchingDocuments.length !== 1) throw publicationError('CANONICAL_PUBLICATION_SOURCE_UNBOUND', 'The publication source asset must be exactly one captured immutable document')
  const questionGroups = {
    schemaVersion: 'canonical-question-groups-v1',
    groups: [...canonicalPaper.questionGroups],
  }
  const descriptors = [
    artifactDescriptor('source_capture', sourceCapture),
    artifactDescriptor('paper_plan', canonicalPaper.paperPlan),
    artifactDescriptor('question_groups', questionGroups),
    artifactDescriptor('normalization_report', normalizationReport),
  ]
  const manifestBase = {
    schemaVersion: 'canonical-paper-publication-v1',
    paperId: canonicalPaper.paperPlan.paperId,
    sourceAssetVersion,
    sourceAssetDocumentId: matchingDocuments[0].documentId,
    sourceAssetDigest,
    sourceEvidence: sourceEvidence.map(({ bytes: _bytes, ...descriptor }) => descriptor),
    authority: canonicalPaper.paperPlan.authorityRef,
    artifacts: descriptors
      .map(({ bytes: _bytes, ...descriptor }) => descriptor)
      .sort((left, right) => left.role.localeCompare(right.role)),
  }
  const manifest = { ...manifestBase, publicationDigest: digestJson(manifestBase) }
  return {
    manifest,
    sourceAsset: new Uint8Array(sourceAsset),
    artifacts: Object.fromEntries(descriptors.map((descriptor) => [descriptor.relativePath, descriptor.bytes])),
    sourceEvidence: Object.fromEntries(sourceEvidence.map((descriptor) => [descriptor.relativePath, descriptor.bytes])),
  }
}

export function validateCanonicalPublicationBundle({ manifest, sourceAsset, readArtifact }) {
  const authority = resolveCanonicalAuthority(manifest?.authority)
  if (!authority.ok) throw publicationError('CANONICAL_PUBLICATION_AUTHORITY_INVALID', 'Publication authority closure is unknown or stale')
  const closure = authority.closure
  const manifestIssues = validateJsonSchema(manifest, closure.schemas['canonical-paper-publication-v1'], '$.publication')
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
  const reportIssues = validateJsonSchema(artifacts.normalization_report, closure.schemas['normalization-report-v1'], '$.report')
  if (sourceCaptureIssues.length || planIssues.length || reportIssues.length || artifacts.question_groups?.schemaVersion !== 'canonical-question-groups-v1' || !Array.isArray(artifacts.question_groups?.groups)) throw publicationError('CANONICAL_PUBLICATION_ARTIFACT_SCHEMA_INVALID', 'One or more sealed artifacts violate their exact schemas')
  if (artifacts.normalization_report.disposition !== 'ready' || artifacts.normalization_report.captureDigest !== artifacts.source_capture.digest || artifacts.paper_plan.completeness.status !== 'complete') throw publicationError('CANONICAL_PUBLICATION_SEMANTIC_CLOSURE_INVALID', 'Publication does not contain a complete ready source closure')
  const sourceEvidence = sourceEvidenceDescriptors(artifacts.source_capture)
  if (!Array.isArray(manifest.sourceEvidence) || manifest.sourceEvidence.length !== sourceEvidence.length) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Publication source evidence closure differs from Source Capture')
  for (const expected of sourceEvidence) {
    const descriptor = manifest.sourceEvidence.find((candidate) => candidate.documentId === expected.documentId)
    if (!descriptor || descriptor.artifactId !== expected.artifactId || descriptor.relativePath !== expected.relativePath || descriptor.byteLength !== expected.byteLength || descriptor.sha256 !== expected.sha256) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', 'Publication source evidence descriptor differs from Source Capture')
    const bytes = readArtifact(descriptor.relativePath)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) throw publicationError('CANONICAL_PUBLICATION_SOURCE_EVIDENCE_INVALID', `Source evidence ${descriptor.documentId} is missing or corrupt`)
  }
  const sourceAssetDocument = artifacts.source_capture.documents.find((document) => document.documentId === manifest.sourceAssetDocumentId)
  if (!sourceAssetDocument || sourceAssetDocument.sha256 !== manifest.sourceAssetDigest || sourceAssetDocument.sha256 !== sha256(sourceAsset)) throw publicationError('CANONICAL_PUBLICATION_SOURCE_UNBOUND', 'Publication source asset does not bind to captured source evidence')
  validatePublicationLineage({ sourceCapture: artifacts.source_capture, plan: artifacts.paper_plan, groups: artifacts.question_groups.groups, normalizationReport: artifacts.normalization_report, normalizationRules: closure.artifacts.normalization.rules })
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
    projected,
  }
}

function ensureDatabaseShape(db) {
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

function setLatestRef(paths, ref) {
  const prepared = path.join(paths.paperDir, `.latest-staging-${randomUUID()}`)
  writeJson(path.join(prepared, latestRefFileName), ref)
  const previous = path.join(paths.paperDir, `.latest-previous-${randomUUID()}`)
  if (existsSync(paths.latestDir)) renameSync(paths.latestDir, previous)
  renameSync(prepared, paths.latestDir)
  return previous
}

function restoreLatest(paths, previous) {
  if (existsSync(paths.latestDir)) rmSync(paths.latestDir, { recursive: true, force: true })
  if (previous && existsSync(previous)) renameSync(previous, paths.latestDir)
}

export function recoverCanonicalPaperPublication({ rootDir, db, paperId }) {
  ensureDatabaseShape(db)
  const paths = paperPaths(rootDir, paperId)
  if (!existsSync(paths.journalPath)) return { status: 'clean' }
  const journal = readJsonFile(paths.journalPath)
  const current = currentDbRef(db, paperId)
  if (current?.publicationDigest === journal.target.publicationDigest && current.versionName === journal.target.versionName) {
    const latest = readLatestRef(paths)
    if (!latest || latest.publicationDigest !== journal.target.publicationDigest || latest.versionName !== journal.target.versionName) {
      const previous = setLatestRef(paths, journal.target)
      if (previous && existsSync(previous)) rmSync(previous, { recursive: true, force: true })
    }
    if (journal.previousLatest && existsSync(journal.previousLatest)) rmSync(journal.previousLatest, { recursive: true, force: true })
    rmSync(paths.journalPath, { force: true })
    return { status: 'post_commit_recovered' }
  }
  if (!current || current.publicationDigest === journal.previousDigest) {
    restoreLatest(paths, journal.previousLatest)
    const targetDir = path.join(paths.versionsDir, journal.target.versionName)
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
    rmSync(paths.journalPath, { force: true })
    return { status: 'pre_commit_rolled_back' }
  }
  throw publicationError('CANONICAL_PUBLICATION_RECOVERY_AMBIGUOUS', 'Journal and SQLite current reference cannot be reconciled uniquely')
}

export function publishCanonicalPaperPublication({ rootDir, db, compilation, sourceAssetVersion, sourceAsset, failurePoint = null }) {
  const sealed = sealCanonicalPublication({ compilation, sourceAssetVersion, sourceAsset })
  const { paperId } = sealed.manifest
  const paths = paperPaths(rootDir, paperId)
  mkdirSync(paths.versionsDir, { recursive: true })
  recoverCanonicalPaperPublication({ rootDir, db, paperId })
  rejectUnreconciledVersionDirectories(paths, db, paperId)
  const existing = db.prepare('SELECT version_name FROM canonical_paper_publications WHERE paper_id = ? AND source_asset_version = ? AND publication_digest = ?').get(paperId, sourceAssetVersion, sealed.manifest.publicationDigest)
  if (existing) return { status: 'idempotent', paperId, versionName: existing.version_name, publicationDigest: sealed.manifest.publicationDigest }
  const versionName = nextVersionName(paths)
  const stageDir = path.join(paths.paperDir, `.staging-${randomUUID()}`)
  let versionDir = null
  let previousLatest = null
  let committed = false
  try {
    writeBytes(path.join(stageDir, 'paper-asset.json'), sealed.sourceAsset)
    for (const [relativePath, bytes] of Object.entries(sealed.artifacts)) writeBytes(path.join(stageDir, relativePath), bytes)
    for (const [relativePath, bytes] of Object.entries(sealed.sourceEvidence)) writeBytes(path.join(stageDir, relativePath), bytes)
    writeJson(path.join(stageDir, 'canonical', publicationFileName), sealed.manifest)
    const reopenedManifest = readJsonFile(path.join(stageDir, 'canonical', publicationFileName))
    validateCanonicalPublicationBundle({
      manifest: reopenedManifest,
      sourceAsset: readFileSync(path.join(stageDir, 'paper-asset.json')),
      readArtifact: (relativePath) => readFileSync(path.join(stageDir, relativePath)),
    })
    if (failurePoint === 'before-version-rename') throw publicationError('CANONICAL_PUBLICATION_FORCED_FAILURE', 'Forced pre-rename failure')
    versionDir = path.join(paths.versionsDir, versionName)
    if (existsSync(versionDir)) throw publicationError('CANONICAL_PUBLICATION_VERSION_CONFLICT', `Immutable ${versionName} is already occupied`)
    renameSync(stageDir, versionDir)
    const previous = currentDbRef(db, paperId)
    const target = { paperId, versionName, sourceAssetVersion, publicationDigest: sealed.manifest.publicationDigest }
    const journal = { schemaVersion: 'canonical-latest-swap-journal-v1', target, previousDigest: previous?.publicationDigest || null, previousLatest: null }
    db.exec('BEGIN IMMEDIATE')
    try {
      writeJson(paths.journalPath, journal)
      previousLatest = setLatestRef(paths, target)
      journal.previousLatest = previousLatest
      writeJson(paths.journalPath, journal)
      if (failurePoint === 'after-latest-before-commit') throw publicationError('CANONICAL_PUBLICATION_FORCED_FAILURE', 'Forced pre-commit failure')
      db.prepare('UPDATE canonical_paper_publications SET is_current = 0 WHERE paper_id = ?').run(paperId)
      db.prepare('INSERT INTO canonical_paper_publications (paper_id, version_name, source_asset_version, publication_digest, is_current) VALUES (?, ?, ?, ?, 1)').run(paperId, versionName, sourceAssetVersion, sealed.manifest.publicationDigest)
      db.exec('COMMIT')
      committed = true
    } catch (error) {
      try { db.exec('ROLLBACK') } catch {}
      restoreLatest(paths, previousLatest)
      if (existsSync(paths.journalPath)) rmSync(paths.journalPath, { force: true })
      throw error
    }
    if (failurePoint === 'after-commit') throw publicationError('CANONICAL_PUBLICATION_FORCED_FAILURE', 'Forced post-commit interruption')
    if (previousLatest && existsSync(previousLatest)) rmSync(previousLatest, { recursive: true, force: true })
    rmSync(paths.journalPath, { force: true })
    return { status: 'published', paperId, versionName, publicationDigest: sealed.manifest.publicationDigest }
  } catch (error) {
    if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true })
    if (!committed && versionDir && existsSync(versionDir)) rmSync(versionDir, { recursive: true, force: true })
    throw error
  }
}

export function createFileSystemCanonicalPublicationStore({ rootDir, db }) {
  return {
    readPublishedRefs(paperId, versionName = null) {
      ensureDatabaseShape(db)
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
      const filePath = path.join(paths.versionsDir, ref.versionName, 'paper-asset.json')
      return existsSync(filePath) ? readFileSync(filePath) : null
    },
  }
}

async function legacySelections({ ref, contract, familyIds, store, diagnostic }) {
  const selections = []
  for (const familyContractId of familyIds) {
    const capability = contract.families.find((entry) => entry.familyContractId === familyContractId)
    if (!capability || capability.legacyCapability === 'retired' || typeof store.projectLegacyFamily !== 'function') return null
    const projectedOccurrences = await store.projectLegacyFamily({ ref, familyContractId })
    if (!Array.isArray(projectedOccurrences)) return null
    selections.push({ mode: 'legacy', familyContractId, groupIds: [], projectedOccurrences, diagnostic })
  }
  return selections
}

function canonicalSelections(validated, contract) {
  const groupIdsByFamily = new Map()
  for (const group of validated.groups) {
    const familyId = group.contractRef.familyContractId
    const groupIds = groupIdsByFamily.get(familyId) || []
    groupIds.push(group.identity.groupId)
    groupIdsByFamily.set(familyId, groupIds)
  }
  const selections = []
  const legacyFamilies = []
  for (const [familyContractId, groupIds] of groupIdsByFamily) {
    const capability = contract.families.find((entry) => entry.familyContractId === familyContractId)
    if (!capability || !capability.canonical) {
      legacyFamilies.push(familyContractId)
      continue
    }
    selections.push({
      mode: 'canonical',
      familyContractId,
      groupIds,
      projectedOccurrences: validated.projected.nodes.filter((node) => node.kind === 'group' && groupIds.includes(node.groupId)),
    })
  }
  return { selections, legacyFamilies, allFamilyIds: [...groupIdsByFamily.keys()] }
}

/**
 * Shared Screen/Print-PDF/DOCX loader. It resolves one immutable publication
 * and one exact checked-in Consumer Contract before exposing a whole-family
 * consumption plan; existing consumers are intentionally not rewired here.
 */
export async function loadPaperForConsumption(request, store) {
  const consumer = resolveConsumerContract(request.consumerContract)
  if (!consumer.ok) return { disposition: 'incompatible', diagnostics: consumer.issues }
  for (let attempt = 0; attempt < 2; attempt++) {
    const refs = await store.readPublishedRefs(request.paperId, request.version)
    if (!refs.current) return { disposition: 'not_found', diagnostics: [{ code: 'PUBLICATION_NOT_FOUND' }] }
    if (!request.version && (!refs.latest || refs.current.publicationDigest !== refs.latest.publicationDigest || refs.current.versionName !== refs.latest.versionName)) continue
    const ref = refs.current
    const manifestBytes = await store.readVersionArtifact(ref, `canonical/${publicationFileName}`)
    const sourceAsset = await store.readSourceAsset(ref)
    if (!manifestBytes || !sourceAsset) continue
    try {
      const manifest = readJsonBytes(manifestBytes, publicationFileName)
      const validated = validateCanonicalPublicationBundle({
        manifest,
        sourceAsset,
        readArtifact: (relativePath) => {
          const value = store.readVersionArtifact(ref, relativePath)
          if (value instanceof Promise) throw publicationError('CANONICAL_PUBLICATION_STORE_ASYNC', 'Store artifact reads must be synchronous inside package validation')
          return value
        },
      })
      const selection = canonicalSelections(validated, consumer.contract)
      const legacy = await legacySelections({
        ref,
        contract: consumer.contract,
        familyIds: selection.legacyFamilies,
        store,
        diagnostic: { code: 'CONSUMER_FAMILY_CANONICAL_UNAVAILABLE' },
      })
      if (selection.legacyFamilies.length > 0 && !legacy) return { disposition: 'incompatible', diagnostics: [{ code: 'LEGACY_FAMILY_UNAVAILABLE' }] }
      return {
        disposition: 'ready',
        paperId: request.paperId,
        sourceAssetVersion: ref.sourceAssetVersion,
        publicationDigest: manifest.publicationDigest,
        selections: [...selection.selections, ...(legacy || [])],
        diagnostics: [],
      }
    } catch (error) {
      const familyIds = consumer.contract.families.map((entry) => entry.familyContractId)
      const legacy = await legacySelections({
        ref,
        contract: consumer.contract,
        familyIds,
        store,
        diagnostic: { code: error.code || 'PUBLICATION_INVALID', message: error.message },
      })
      if (legacy) return { disposition: 'ready', paperId: request.paperId, sourceAssetVersion: ref.sourceAssetVersion, selections: legacy, diagnostics: [{ code: error.code || 'PUBLICATION_INVALID', message: error.message }] }
      return { disposition: 'incompatible', diagnostics: [{ code: error.code || 'PUBLICATION_INVALID', message: error.message }] }
    }
  }
  return { disposition: 'retryable_unavailable', diagnostics: [{ code: 'PUBLICATION_REF_DISAGREEMENT' }] }
}

export { canonicalAuthorityRef, latestRefFileName, publicationFileName }
