import { withNck1MaterializationSourceCache } from '../paper-canonical/nck1MaterializationAdapter.mjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { readExamDate } from '../../shared/examDate.mjs'
import { OCR_NUMBERING_REPORT_VERSION, validateOcrNumberingProjection } from '../../shared/ocrNumberingProjection.mjs'
import { configuredPaperHeader, validatedPaperHeaderTitle } from '../../shared/paper-canonical/headerTitle.mjs'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import { nck1MaterializationHistoricalAuthorityRef58, nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef66, resolveCanonicalAuthority } from '../../shared/paper-canonical/authority.mjs'
import { consumerContractRefsForAuthority } from '../../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { decorateProjectedMediaPresentation } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { digestJson, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { LEGACY_LISTENING_WAVEFORM_FILE } from '../../shared/paper-canonical/listeningPlayback.mjs'
import { LISTENING_REVIEW_FILE, listeningReviewSubject, readListeningReview, readSealedListeningReview } from '../paper-import/listeningReview.mjs'
import { SOURCE_REFERENCES_FILE, parseSourceReferencesBytes } from '../paper-import/sourceReferences.mjs'
import { assertSourceReferenceAdmission, assertSealedSourceReferenceReplay } from '../paper-import/sourceReferenceAdmission.mjs'
import { PRODUCT_MANIFEST, PRODUCT_FILES, productInputDigest, readFrozenProducts } from '../paper-import/frozenProducts.mjs'
import { productFiles, sourceProductEditions } from '../paper-import/pdfProductSet.mjs'
import { productPageLimitsForManifest } from '../paper-import/pdfPageLimits.mjs'
import { studentProductPolicy } from '../draft-paper/studentProductPdf.mjs'
import { withSealedReviewSnapshot } from './sealedReviewFiles.mjs'
import { buildStoredReviewSubject, buildTargetReviewSubject, reviewSubjectBundleDigest } from './reviewSubject.mjs'
import { reviewProjectionForTrustedBaseline } from './reviewComparisonProjection.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
  assertCanonicalVisibleStructure,
} from '../../shared/paper-canonical/visibleStructure.mjs'
import {
  buildNck1AnalysisProjection,
  NCK1_LISTENING_STAGED_ANALYSIS,
  NCK1_STAGED_ANALYSIS_FILES,
} from './nck1AnalysisProjection.mjs'
import { LEGACY_NCK1_ANALYSIS_PROFILE } from '../paper-import-ai/analyzeListening.mjs'
import { validateParagraphSummaries } from '../paper-import-ai/paragraphSummaries.mjs'
import { validatePublicSearchMetadata } from '../paper-import-ai/publicSearchMetadata.mjs'
import { applySpellingReview, loadSpellingReview, summarizeSpellingReview, verifyTerminalWhitespaceSourceEvidence, SPELLING_REVIEW_FILE } from '../paper-import/spellingReview.mjs'
import { applyListeningInstructionCorrection, LISTENING_INSTRUCTION_CORRECTION_FILE } from '../paper-import/listeningInstructionCorrection.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
} from '../paper-import/nck1ImageSourceBundle.mjs'
import {
  NCK1_OCR_CONFIRMATION_FILE_NAME,
  NCK1_OCR_EVIDENCE_FILE_NAME,
  NCK1_OCR_REVIEW_CODES,
  loadNck1OcrSourceEmphasis,
  nck1OcrSourceSetDigest,
  resolveConfirmedNck1OcrEvidence,
  validateNck1OcrSourceEvidence,
} from '../paper-import/nck1OcrSourceEvidence.mjs'
import { assertListeningAudioManifest, assertListeningAudioSource } from '../paper-import/listeningAudioEvidence.mjs'
import {
  PAPER_PAGINATION_PLAN_FILE_NAME,
  productPageLimitsForPlan,
  loadPaperPaginationPlan,
  paginationSlotBindings,
} from '../paper-import/paginationPlan.mjs'
import {
  NCK1_ANALYZED_PACKAGE_INPUT_KIND,
  NCK1_ANALYZED_PACKAGE_MEDIA_TYPE,
  deriveNck1AnalyzedPackageBundle,
} from '../paper-canonical/nck1AnalyzedPackageAdapter.mjs'

export const NCK1_ANALYZED_PACKAGE_REVIEW_MANIFEST_SCHEMA_VERSION =
  'nck1-analyzed-package-review-source-v1'
export const PUBLIC_PAPER_IMPORT_PROFILE = 'public-paper-v1'
export const PARAGRAPH_SUMMARIES_FILE_NAME = 'paragraph-summaries-v1.json'
export const PUBLIC_SEARCH_METADATA_FILE_NAME = 'public-search-metadata-v1.json'

// Bound to one server-derived projection, never looked up by path across requests.
// Keep this request-local inventory out of the serialized projection contract.
const reviewBundleInventories = new WeakMap()

const paragraphSummariesSchema = JSON.parse(readFileSync(path.join(
  import.meta.dirname,
  '../../schemas/paper-import/paragraph-summaries-v1.schema.json',
), 'utf8'))
const validateParagraphSummariesSchema = new Ajv({ allErrors: true, strict: false })
  .compile(paragraphSummariesSchema)

export function nck1ImportProfile(config, { externalPackage = false } = {}) {
  const profile = config?.importProfile
  if (profile === undefined) return null
  if (externalPackage || profile !== PUBLIC_PAPER_IMPORT_PROFILE) {
    fail(`Unsupported NCK1 import profile: ${String(profile)}`, 'IMPORT_REVIEW_PROFILE_INVALID')
  }
  return profile
}

function loadParagraphSummaries(rootDir, loaded, sourceDigest, candidateDigest) {
  const filePath = resolveReviewFile(rootDir, PARAGRAPH_SUMMARIES_FILE_NAME)
  const sidecar = readJson(filePath, PARAGRAPH_SUMMARIES_FILE_NAME)
  if (!validateParagraphSummariesSchema(sidecar)) {
    fail(`Paragraph summaries schema invalid: ${validateParagraphSummariesSchema.errors?.[0]?.message || 'invalid'}`, 'PARAGRAPH_SUMMARIES_SCHEMA_INVALID')
  }
  const issues = validateParagraphSummaries({
    sidecar,
    materialization: loaded.materialization,
    sourceDigest,
    candidateDigest,
  })
  if (issues.length > 0) fail(`${issues[0].code}: ${issues[0].message}`, issues[0].code)
  const bytes = readReviewBytes(filePath)
  return { sidecar, bytes, digest: sha256(bytes) }
}

function loadPublicSearchMetadata(rootDir, loaded, sourceDigest, candidateDigest) {
  const filePath = resolveReviewFile(rootDir, PUBLIC_SEARCH_METADATA_FILE_NAME)
  if (!existsSync(filePath)) fail('public-paper-v1 requires public-search-metadata-v1.json')
  const bytes = readFileSync(filePath)
  const sidecar = JSON.parse(bytes.toString('utf8'))
  const issues = validatePublicSearchMetadata({ sidecar, materialization: loaded.materialization, sourceDigest, candidateDigest })
  if (issues.length) fail(`${issues[0].code}: ${issues[0].message}`)
  return { sidecar, bytes, digest: sha256(bytes) }
}

function fail(message, code = 'IMPORT_REVIEW_CANDIDATE_INVALID', status) {
  const error = new Error(message)
  error.code = code
  if (status !== undefined) error.status = status
  throw error
}

export function reviewMediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.mimeType]
  if (!extension) fail(`Unsupported Candidate media type: ${media.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

export function reviewMediaCandidateFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.publication?.candidate?.mimeType]
  if (!extension) fail(`Unsupported Candidate rendition type: ${media.publication?.candidate?.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}--candidate.${extension}`
}

function normalizedRelativePath(value, label) {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) fail(`${label} has an invalid relative path`, 'IMPORT_REVIEW_PATH_INVALID')
  return value
}

export function resolveReviewFile(rootDir, relativePath, label = 'Review file') {
  const normalized = normalizedRelativePath(relativePath, label)
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    fail(`${label} escapes the revision root`, 'IMPORT_REVIEW_PATH_INVALID')
  }
  return resolved
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON`)
  }
}

// Each read owns fresh bytes. Preserve the public Uint8Array contract without
// copying the Buffer; no retained Buffer alias can mutate the returned view.
function readReviewBytes(filePath) {
  const bytes = readFileSync(filePath)
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function readSealedBytes(rootDir, descriptor, label) {
  const filePath = resolveReviewFile(
    rootDir,
    normalizedRelativePath(descriptor.path, `${label} path`),
  )
  if (!existsSync(filePath)) fail(`${label} is missing`)
  const bytes = readReviewBytes(filePath)
  if (
    descriptor.sha256 !== sha256(bytes)
    || descriptor.byteLength !== bytes.byteLength
  ) fail(`${label} does not match its sealed digest`, 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
  return bytes
}

export function buildNck1AnalyzedPackageReviewSourceManifest({
  paperId,
  manifestPath,
  manifestBytes,
  members,
}) {
  const manifest = {
    schemaVersion: NCK1_ANALYZED_PACKAGE_REVIEW_MANIFEST_SCHEMA_VERSION,
    sourceKind: NCK1_ANALYZED_PACKAGE_INPUT_KIND,
    paperId,
    packageManifest: {
      path: normalizedRelativePath(manifestPath, 'package manifest path'),
      mediaType: NCK1_ANALYZED_PACKAGE_MEDIA_TYPE,
      sha256: sha256(manifestBytes),
      byteLength: manifestBytes.byteLength,
    },
    members: members.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      mediaType: member.mediaType,
      path: normalizedRelativePath(member.path, `member ${member.memberId} path`),
      sha256: sha256(member.bytes),
      byteLength: member.bytes.byteLength,
    })),
  }
  if (!paperId || new Set(manifest.members.map(({ memberId }) => memberId)).size !== members.length) {
    fail('Analyzed package Review source identity is incomplete')
  }
  return manifest
}

function loadNck1AnalyzedPackageReviewSource(rootDir, config, manifest) {
  const paths = [
    manifest.packageManifest?.path,
    ...(Array.isArray(manifest.members) ? manifest.members.map((member) => member.path) : []),
  ]
  if (
    manifest.sourceKind !== NCK1_ANALYZED_PACKAGE_INPUT_KIND
    || manifest.paperId !== config.paperId
    || !manifest.packageManifest
    || manifest.packageManifest.mediaType !== NCK1_ANALYZED_PACKAGE_MEDIA_TYPE
    || !Array.isArray(manifest.members)
    || manifest.members.length === 0
    || new Set(manifest.members.map(({ memberId }) => memberId)).size !== manifest.members.length
    || new Set(paths).size !== paths.length
    || paths.includes('universal-source-manifest.json')
    || paths.includes('config.json')
  ) fail('Analyzed package Review source manifest is incomplete')
  const manifestBytes = readSealedBytes(
    rootDir,
    manifest.packageManifest,
    'Analyzed package manifest',
  )
  const members = manifest.members.map((member) => ({
    memberId: member.memberId,
    role: member.role,
    mediaType: member.mediaType,
    bytes: readSealedBytes(rootDir, member, `Analyzed package member ${member.memberId}`),
  }))
  const sourceInput = {
    kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND,
    manifestBytes,
    members,
  }
  const derived = deriveNck1AnalyzedPackageBundle(sourceInput)
  if (derived.issues.length > 0 || !derived.materialization) {
    const issue = derived.issues[0]
    fail(`${issue?.code || 'ANALYZED_PACKAGE_INVALID'}: ${issue?.message || 'Package derivation failed'}`)
  }
  if (derived.manifest.paperId !== config.paperId) {
    fail('Analyzed package and Review paper identities differ')
  }
  const audioMember = manifest.members.find((member) => member.role === 'audio') || null
  return {
    config,
    manifest,
    materialization: derived.materialization,
    sourceInput,
    listeningAudioEvidence: null,
    listeningAudioBytes: audioMember
      ? members.find((member) => member.memberId === audioMember.memberId).bytes
      : null,
    analyzedPackage: derived,
    sourceProvenance: {
      kind: 'external_analyzed_package',
      reviewState: 'owner_review_required',
      manifest: structuredClone(manifest.packageManifest),
      members: manifest.members.map((member) => ({ ...structuredClone(member) })),
    },
  }
}

export function loadNck1ReviewSource(rootDir, { preparingSpelling = false, preparingListeningCorrection = false } = {}) {
  const config = readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json')
  const manifest = readJson(
    resolveReviewFile(rootDir, 'universal-source-manifest.json'),
    'universal-source-manifest.json',
  )
  if (manifest.schemaVersion === NCK1_ANALYZED_PACKAGE_REVIEW_MANIFEST_SCHEMA_VERSION) {
    return loadNck1AnalyzedPackageReviewSource(rootDir, config, manifest)
  }
  if (
    ![
      'universal-nck1-source-manifest-v1',
      'universal-nck1-source-manifest-v2',
      'universal-nck1-source-manifest-v3',
    ].includes(manifest.schemaVersion)
    || manifest.paperId !== config.paperId
    || !Array.isArray(manifest.documents)
  ) fail('Universal NCK1 source manifest is incomplete')
  const validatedListeningAudioEvidence = assertListeningAudioManifest(rootDir, manifest)
  const listeningAudioEvidence = validatedListeningAudioEvidence
    ? {
        descriptors: [...validatedListeningAudioEvidence.descriptors.values()]
          .map((descriptor) => structuredClone(descriptor)),
        asr: structuredClone(validatedListeningAudioEvidence.asr),
        check: structuredClone(validatedListeningAudioEvidence.check),
        segments: structuredClone(validatedListeningAudioEvidence.segments),
      }
    : null
  const materializationPath = resolveReviewFile(
    rootDir,
    normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
  )
  if (!existsSync(materializationPath)) fail('Source Materialization is missing')
  const materializationBytes = readReviewBytes(materializationPath)
  let materialization
  try {
    materialization = JSON.parse(new TextDecoder().decode(materializationBytes))
  } catch {
    fail('Source Materialization is not valid JSON')
  }
  if (materialization.listening?.state === 'captured' && !listeningAudioEvidence) {
    fail(
      'Captured listening requires passed audio comparison and content-safety evidence',
      'LISTENING_AUDIO_REVIEW_REQUIRED',
    )
  }
  const listeningAudio = assertListeningAudioSource(validatedListeningAudioEvidence, materialization.listening)
  const documentPathById = new Map(manifest.documents.map((document) => [
    document.documentId,
    resolveReviewFile(rootDir, normalizedRelativePath(document.path, `document ${document.documentId}`)),
  ]))
  for (const document of manifest.documents) {
    if (document.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE) continue
    const documentPath = documentPathById.get(document.documentId)
    if (!documentPath || !existsSync(documentPath)) {
      fail(`Image source bundle is unavailable: ${document.documentId}`)
    }
    assertNck1ImageBundlePageArtifacts(
      { ...document, bytes: readReviewBytes(documentPath) },
      (document.pages || []).map((page) => {
        const pagePath = resolveReviewFile(
          rootDir,
          normalizedRelativePath(page.path, `document ${document.documentId} page ${page.page}`),
        )
        if (!existsSync(pagePath)) {
          fail(`Image source page is unavailable: ${document.documentId}:${page.page}`)
        }
        return { ...page, bytes: readReviewBytes(pagePath) }
      }),
    )
  }
  const spellingReviewBytes = loadSpellingReview(rootDir, config, { preparing: preparingSpelling })
  const sourceInput = {
    kind: 'nck1-source-materialization',
    materializationBytes,
    ...(spellingReviewBytes ? { spellingReviewBytes } : {}),
    ...loadNck1OcrSourceEmphasis(rootDir),
    ...(listeningAudio ? { listeningAudio } : {}),
    documents: materialization.documents.map((document) => {
      const sourcePath = documentPathById.get(document.documentId)
      if (!sourcePath || !existsSync(sourcePath)) {
        fail(`Materialized document is unavailable: ${document.documentId}`)
      }
      return {
        documentId: document.documentId,
        bytes: readReviewBytes(sourcePath),
      }
    }),
    media: materialization.media.map((media) => {
      const relativePath = path.posix.join(
        normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
        reviewMediaFileName(media),
      )
      const mediaPath = resolveReviewFile(rootDir, relativePath)
      if (!existsSync(mediaPath)) fail(`Materialized media is unavailable: ${media.mediaId}`)
      if (!media.publication?.candidate) {
        return { mediaId: media.mediaId, bytes: readReviewBytes(mediaPath) }
      }
      const renditionPath = resolveReviewFile(
        rootDir,
        path.posix.join(
          normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
          reviewMediaCandidateFileName(media),
        ),
      )
      if (!existsSync(renditionPath)) {
        fail(`Materialized media Candidate is unavailable: ${media.mediaId}`)
      }
      return {
        mediaId: media.mediaId,
        bytes: readReviewBytes(mediaPath),
        renditionBytes: readReviewBytes(renditionPath),
      }
    }),
  }
  let reviewedMaterialization = spellingReviewBytes
    ? applySpellingReview(materializationBytes, spellingReviewBytes)
    : materialization
  if (spellingReviewBytes) {
    verifyTerminalWhitespaceSourceEvidence(materializationBytes, spellingReviewBytes, sourceInput.documents)
  }
  const correctionPath = resolveReviewFile(rootDir, LISTENING_INSTRUCTION_CORRECTION_FILE)
  if (!preparingListeningCorrection && existsSync(correctionPath)) {
    sourceInput.listeningInstructionCorrectionBytes = readReviewBytes(correctionPath)
    const corrected = applyListeningInstructionCorrection(materializationBytes,
      sourceInput.listeningInstructionCorrectionBytes, listeningAudio, reviewedMaterialization)
    const originalAudio = validatedListeningAudioEvidence?.descriptors.get('listening_audio_original')
    if (corrected.correction.originalAudioSha256 !== originalAudio?.sha256) {
      fail('Listening instruction correction does not bind the original audio', 'LISTENING_INSTRUCTION_CORRECTION_INVALID')
    }
    reviewedMaterialization = corrected.materialization
  }
  return {
    config,
    manifest,
    // Spelling reports bind the original bytes and UTF-16 coordinates. Keep
    // the validated count overlay in sourceInput for later Candidate replay,
    // but do not mix its corrected projection into a raw spelling request.
    materialization: preparingSpelling ? materialization : reviewedMaterialization,
    spellingReviewSummary: spellingReviewBytes
      ? summarizeSpellingReview(JSON.parse(new TextDecoder().decode(spellingReviewBytes)))
      : null,
    sourceInput,
    listeningAudioEvidence,
    listeningAudioBytes: null,
    analyzedPackage: null,
    sourceProvenance: {
      kind: 'captured_original_documents',
      reviewState: 'source_evidence_verified',
      documents: manifest.documents.map((document) => ({
        documentId: document.documentId,
        role: document.role,
        mediaType: document.mediaType,
        path: document.path,
        sha256: document.sha256,
        byteLength: document.byteLength,
      })),
    },
  }
}

function projectedSourceRegion(manifest, materialization, {
  visualId,
  documentId,
  page,
  region,
  disposition,
  targetId,
}) {
  const sourceDocument = materialization.documents.find((document) =>
    document.documentId === documentId)
  const manifestDocument = manifest.documents.find((document) =>
    document.documentId === documentId)
  if (!sourceDocument || !manifestDocument) {
    fail('Source visual inventory does not resolve to one captured document')
  }
  const sourcePath = normalizedRelativePath(
    manifestDocument.path,
    `document ${sourceDocument.documentId}`,
  )
  const imagePage = sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE
    ? manifestDocument.pages?.find((candidate) => candidate.page === page)
    : null
  if (sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE && !imagePage) {
    fail(`Source visual page is unavailable: ${sourceDocument.documentId}:${page}`)
  }
  return {
    visualId,
    documentId: sourceDocument.documentId,
    path: imagePage
      ? normalizedRelativePath(
          imagePage.path,
          `document ${sourceDocument.documentId} page ${page}`,
        )
      : sourcePath,
    sourceDigest: imagePage?.sha256 || sourceDocument.sha256,
    mediaType: imagePage?.mediaType || sourceDocument.mediaType,
    page,
    region: region ? structuredClone(region) : null,
    disposition,
    targetId,
    state: region ? 'paired' : 'unlocated',
  }
}

function rawSourceVisualProjection(manifest, materialization) {
  const coverage = materialization.sourceCoverage
  const declaredVisuals = coverage.visuals.map((visual) => projectedSourceRegion(
    manifest,
    materialization,
    {
      ...visual,
      documentId: coverage.documentId,
    },
  ))
  const semanticLocators = materialization.groups.flatMap((group) => [
    ...group.blocks.map((block) => ({ targetId: block.blockId, source: block.source })),
    ...group.questions.map((question) => ({
      targetId: question.questionId,
      source: question.source,
    })),
  ]).filter(({ source }) => source?.kind === 'page_region')
  return [
    ...declaredVisuals,
    ...semanticLocators.map(({ targetId, source }) => projectedSourceRegion(
      manifest,
      materialization,
      {
        visualId: `visual:${materialization.paperId}:source-locator:${targetId}`,
        documentId: source.documentId,
        page: source.page,
        region: source.region,
        disposition: 'semantic_text',
        targetId,
      },
    )),
  ]
}

function analyzedPackageSourceVisualProjection(loaded) {
  const members = new Map(loaded.manifest.members.map((member) => [member.memberId, member]))
  return loaded.materialization.groups.flatMap((group) => [
    ...group.blocks.map((block) => ({ targetId: block.blockId, source: block.source })),
    ...group.questions.map((question) => ({
      targetId: question.questionId,
      source: question.source,
    })),
  ]).filter(({ source }) => source?.kind === 'package_json_pointer')
    .map(({ targetId, source }) => {
      const member = members.get(source.documentId)
      if (!member) fail(`Package source member is unavailable: ${source.documentId}`)
      return {
        visualId: `visual:${loaded.materialization.paperId}:package-locator:${targetId}`,
        documentId: source.documentId,
        path: normalizedRelativePath(member.path, `member ${member.memberId}`),
        sourceDigest: member.sha256,
        mediaType: member.mediaType,
        page: null,
        region: null,
        disposition: 'semantic_text',
        targetId,
        state: 'external_package_pointer',
        pointer: source.pointer,
      }
    })
}

function sourceVisualProjection(loaded) {
  return loaded.analyzedPackage
    ? analyzedPackageSourceVisualProjection(loaded)
    : rawSourceVisualProjection(loaded.manifest, loaded.materialization)
}

function primarySourceType(materialization, analyzedPackage = false) {
  if (analyzedPackage) return 'analyzed-package'
  const source = materialization.documents.find((document) =>
    ['question_source', 'question_and_answers'].includes(document.role))
  if (source?.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) return 'image'
  return source?.mediaType?.includes('wordprocessingml') ? 'docx' : 'pdf'
}

function loadReviewedListening(rootDir, loaded, candidate = null, sealedListening = null) {
  if (!existsSync(resolveReviewFile(rootDir, LISTENING_REVIEW_FILE))) return null
  const subject = listeningReviewSubject(loaded, candidate || importNck1ReviewCandidate(rootDir, loaded).candidate)
  return sealedListening
    ? readSealedListeningReview(rootDir, subject, loaded.materialization.listening.transcript,
      sealedListening.revision, sealedListening.manifest)
    : readListeningReview(rootDir, subject, loaded.materialization.listening.transcript)
}

export function importNck1ReviewCandidate(rootDir, loaded, expectedCandidateDigest = null) {
  const reviewPath = resolveReviewFile(rootDir, LISTENING_REVIEW_FILE)
  if (!expectedCandidateDigest && existsSync(reviewPath)) {
    expectedCandidateDigest = readJson(reviewPath, LISTENING_REVIEW_FILE)?.subject?.candidateDigest
    if (!/^sha256:[a-f0-9]{64}$/.test(expectedCandidateDigest || '')) {
      fail('Listening review has no exact Candidate binding', 'LISTENING_REVIEW_INVALID')
    }
  }
  let imported = importCanonicalCandidate(loaded.sourceInput)
  // A navigation-only revision must not migrate an existing paper to the new
  // default authority. Re-derive the requested identity; never trust its label.
  if (expectedCandidateDigest && imported.candidate?.candidateDigest !== expectedCandidateDigest
    && !loaded.analyzedPackage) {
    for (const materializationAuthorityRef of [nck1MaterializationHistoricalAuthorityRef66, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef58]) {
      const historical = importCanonicalCandidate(loaded.sourceInput, undefined, { materializationAuthorityRef })
      if (historical.candidate?.candidateDigest === expectedCandidateDigest) { imported = historical; break }
    }
  }
  // Keep invalid-source diagnostics distinct from an otherwise valid Candidate
  // with the wrong approval identity (publication treats those differently).
  if (!imported.candidate || imported.issues.length) return imported
  if (expectedCandidateDigest && imported.candidate?.candidateDigest !== expectedCandidateDigest) {
    fail('Stored Candidate does not match a retained authority', 'IMPORT_REVIEW_PROJECTION_MISMATCH')
  }
  return imported
}

export function reviewBundleFilePaths(rootDir, candidate = null) {
  const loaded = loadNck1ReviewSource(rootDir)
  return reviewBundleFilePathsFromSource(rootDir, loaded, candidate)
}

export function reviewBundleFilePathsForProjection(rootDir, projection) {
  const context = reviewBundleInventories.get(projection)
  if (!context || context.rootDir !== path.resolve(rootDir)) {
    return reviewBundleFilePaths(rootDir, projection?.candidate)
  }
  return context.inventory().map(file => ({ ...file }))
}

function reviewBundleFilePathsFromSource(rootDir, loaded, candidate, {
  reviewedListening = loadReviewedListening(rootDir, loaded, candidate),
  analysisValidated = false,
} = {}) {
  const { manifest, materialization } = loaded
  const playback = loaded.sourceInput.listeningAudio || loaded.analyzedPackage?.listeningAudio
  // Retain historical bundle/PDF input identities without interpreting geometry.
  // Old producers may still upload this optional, independently hashed file.
  const legacyWaveform = playback && existsSync(resolveReviewFile(rootDir, LEGACY_LISTENING_WAVEFORM_FILE))
  const importProfile = nck1ImportProfile(loaded.config, {
    externalPackage: Boolean(loaded.analyzedPackage),
  })
  if (!analysisValidated) {
    const paperAsset = buildNck1CompatibilityPaperAsset({
      config: loaded.config,
      materialization,
      sourceAssetVersion: 1,
      primarySourceType: primarySourceType(materialization, Boolean(loaded.analyzedPackage)),
      sourceProvenance: loaded.analyzedPackage ? loaded.sourceProvenance : null,
    })
    buildNck1AnalysisProjection({
      rootDir,
      materialization,
      paperAsset,
      required: !importProfile,
      requireTeachingContent: Boolean(loaded.analyzedPackage),
    })
  }
  const sourceFiles = loaded.analyzedPackage
    ? [
        {
          path: normalizedRelativePath(manifest.packageManifest.path, 'package manifest path'),
          mediaType: manifest.packageManifest.mediaType,
          role: 'analyzed_package_manifest',
        },
        ...manifest.members.map((member) => ({
          path: normalizedRelativePath(member.path, `member ${member.memberId}`),
          mediaType: member.mediaType,
          role: `analyzed_package_${member.role}`,
        })),
      ]
    : [
        {
          path: normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
          mediaType: 'application/json',
          role: 'materialization',
        },
        ...manifest.documents.map((document) => ({
          path: normalizedRelativePath(document.path, `document ${document.documentId}`),
          mediaType: document.mediaType,
          role: document.role,
        })),
        ...manifest.documents.flatMap((document) =>
          (document.pages || []).map((page) => ({
            path: normalizedRelativePath(
              page.path,
              `document ${document.documentId} page ${page.page}`,
            ),
            mediaType: page.mediaType,
            role: `${document.role}_page`,
          }))),
        ...(manifest.attachments || []).map((attachment) => ({
          path: normalizedRelativePath(
            attachment.path,
            `attachment ${attachment.attachmentId}`,
          ),
          mediaType: attachment.mediaType,
          role: attachment.role,
        })),
        ...materialization.media.flatMap((media) => [{
          path: path.posix.join(
            normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
            reviewMediaFileName(media),
          ),
          mediaType: media.mimeType,
          role: 'content_media',
        }, ...(media.publication?.candidate
          ? [{
              path: path.posix.join(
                normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
                reviewMediaCandidateFileName(media),
              ),
              mediaType: media.publication.candidate.mimeType,
              role: 'content_media_candidate',
            }]
          : [])]),
      ]
  const files = [
    { path: 'config.json', mediaType: 'application/json', role: 'config' },
    {
      path: 'universal-source-manifest.json',
      mediaType: 'application/json',
      role: 'source_manifest',
    },
    ...(existsSync(resolveReviewFile(rootDir, 'agent-ocr-correction-report-v2.json')) ? [{
      path: 'agent-ocr-correction-report-v2.json',
      mediaType: 'application/json',
      role: 'agent_ocr_correction_report',
    }] : []),
    ...(loaded.sourceInput.spellingReviewBytes ? [{
      path: SPELLING_REVIEW_FILE,
      mediaType: 'application/json',
      role: 'spelling_review',
    }] : []),
    ...(loaded.sourceInput.listeningInstructionCorrectionBytes ? [{
      path: LISTENING_INSTRUCTION_CORRECTION_FILE, mediaType: 'application/json', role: 'listening_instruction_correction',
    }] : []),
    ...(loaded.sourceInput.ocrSourceBytes
      ? [NCK1_OCR_EVIDENCE_FILE_NAME, NCK1_OCR_CONFIRMATION_FILE_NAME].map(fileName => ({
          path: `materialization/${fileName}`, mediaType: 'application/json', role: 'ocr_source_evidence',
        }))
      : []),
    ...sourceFiles,
    ...(legacyWaveform ? [{ path: LEGACY_LISTENING_WAVEFORM_FILE, mediaType: 'application/json', role: 'listening_audio_waveform' }] : []),
    ...(reviewedListening?.files || []),
    ...NCK1_STAGED_ANALYSIS_FILES
      .filter(({ path: relativePath }) => !importProfile || existsSync(resolveReviewFile(rootDir, relativePath)))
      .map(({ path: relativePath, role }) => ({
      path: relativePath,
      mediaType: 'application/json',
      role,
    })),
    ...(importProfile ? [{
      path: PARAGRAPH_SUMMARIES_FILE_NAME,
      mediaType: 'application/json',
      role: 'paragraph_summaries',
    }, {
      path: PUBLIC_SEARCH_METADATA_FILE_NAME,
      mediaType: 'application/json',
      role: 'public_search_metadata',
    }] : []),
    ...(existsSync(resolveReviewFile(rootDir, NCK1_LISTENING_STAGED_ANALYSIS.path))
      ? [{
          path: NCK1_LISTENING_STAGED_ANALYSIS.path,
          mediaType: 'application/json',
          role: NCK1_LISTENING_STAGED_ANALYSIS.role,
        }]
      : []),
    ...(existsSync(resolveReviewFile(rootDir, PAPER_PAGINATION_PLAN_FILE_NAME)) ? [{
      path: PAPER_PAGINATION_PLAN_FILE_NAME,
      mediaType: 'application/json',
      role: 'pagination_plan',
    }] : []),
    ...(existsSync(resolveReviewFile(rootDir, SOURCE_REFERENCES_FILE)) ? [{
      path: SOURCE_REFERENCES_FILE,
      mediaType: 'application/json',
      role: 'source_references',
    }] : []),
    ...(loaded.config.pdfProductsRequired || existsSync(resolveReviewFile(rootDir, PRODUCT_MANIFEST)) ? [
      { path: PRODUCT_MANIFEST, mediaType: 'application/json', role: 'pdf_products_manifest' },
      ...(loaded.config.listening === undefined ? PRODUCT_FILES : productFiles(sourceProductEditions(
        loaded.config, materialization.listening.state === 'captured' ? 2 : 0))),
    ] : []),
  ]
  const byPath = new Map()
  for (const file of files) {
    const existing = byPath.get(file.path)
    if (existing && existing.mediaType !== file.mediaType) {
      fail(`Review file has conflicting media types: ${file.path}`)
    }
    // Staged-analysis roles are the stable Review transport roles when an
    // analyzed-package member directly references the same immutable file.
    byPath.set(file.path, file.role.startsWith('analysis_') ? file : existing || file)
  }
  return [...byPath.values()]
}

export function loadNck1OcrReviewSource(rootDir) {
  const config = readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json')
  const manifest = readJson(
    resolveReviewFile(rootDir, 'universal-source-manifest.json'),
    'universal-source-manifest.json',
  )
  if (
    !['universal-nck1-source-manifest-v1', 'universal-nck1-source-manifest-v3'].includes(manifest.schemaVersion)
    || manifest.paperId !== config.paperId
    || !Array.isArray(manifest.documents)
  ) fail('Universal NCK1 OCR source manifest is incomplete')
  assertListeningAudioManifest(rootDir, manifest)
  const documents = manifest.documents.map((document) => {
    const filePath = resolveReviewFile(
      rootDir,
      normalizedRelativePath(document.path, `document ${document.documentId}`),
    )
    if (!existsSync(filePath)) fail(`OCR source document is unavailable: ${document.documentId}`)
    const captured = { ...document, bytes: readReviewBytes(filePath) }
    if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
      assertNck1ImageBundlePageArtifacts(captured, (document.pages || []).map((page) => {
        const pagePath = resolveReviewFile(
          rootDir,
          normalizedRelativePath(page.path, `document ${document.documentId} page ${page.page}`),
        )
        if (!existsSync(pagePath)) {
          fail(`OCR source page is unavailable: ${document.documentId}:${page.page}`)
        }
        return { ...page, bytes: readReviewBytes(pagePath) }
      }))
    }
    return captured
  })
  const evidence = readJson(
    resolveReviewFile(
      rootDir,
      path.posix.join('materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
    ),
    NCK1_OCR_EVIDENCE_FILE_NAME,
  )
  const reviewFindings = validateNck1OcrSourceEvidence({
    paperId: manifest.paperId,
    documents,
    evidence,
    includeReviewFindings: true,
  })
  const blocking = reviewFindings.filter((item) =>
    !NCK1_OCR_REVIEW_CODES.includes(item.code))
  if (blocking.length > 0) {
    const finding = blocking[0]
    // This branch means raster replay succeeded but the supplied descriptor
    // differs. A subprocess replay failure keeps its existing server status.
    const status = finding.code === 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE'
      && finding.message === 'OCR page raster no longer replays from the immutable source'
      ? 422 : undefined
    fail(`${finding.code}: ${finding.message} (${finding.path})`, finding.code, status)
  }
  return { config, manifest, documents, evidence, reviewFindings }
}

export function ocrReviewBundleFilePaths(rootDir) {
  const { manifest } = loadNck1OcrReviewSource(rootDir)
  return [
    { path: 'config.json', mediaType: 'application/json', role: 'config' },
    {
      path: 'universal-source-manifest.json',
      mediaType: 'application/json',
      role: 'source_manifest',
    },
    {
      path: path.posix.join('materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
      mediaType: 'application/json',
      role: 'ocr_evidence',
    },
    ...manifest.documents.map((document) => ({
      path: normalizedRelativePath(document.path, `document ${document.documentId}`),
      mediaType: document.mediaType,
      role: document.renditionOf ? 'source_rendition' : document.role,
    })),
    ...(manifest.attachments || []).map((attachment) => ({
      path: normalizedRelativePath(attachment.path, `attachment ${attachment.attachmentId}`),
      mediaType: attachment.mediaType,
      role: attachment.role,
    })),
    ...manifest.documents.flatMap((document) =>
      (document.pages || []).map((page) => ({
        path: normalizedRelativePath(
          page.path,
          `document ${document.documentId} page ${page.page}`,
        ),
        mediaType: page.mediaType,
        role: `${document.role}_page`,
      }))),
  ]
}

export function buildNck1OcrReviewProjection(rootDir) {
  const loaded = loadNck1OcrReviewSource(rootDir)
  const manifestById = new Map(loaded.manifest.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const reviewDocuments = loaded.evidence.documents.map((evidenceDocument) => {
    const sourceDocument = manifestById.get(evidenceDocument.documentId)
    if (!sourceDocument || sourceDocument.renditionOf) {
      fail(`OCR evidence document is unavailable: ${evidenceDocument.documentId}`)
    }
    return {
      documentId: sourceDocument.documentId,
      role: sourceDocument.role,
      pages: evidenceDocument.pages.map((page) => {
        const imagePage = sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE
          ? sourceDocument.pages?.find((candidate) => candidate.page === page.page)
          : null
        if (sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE && !imagePage) {
          fail(`OCR source page is unavailable: ${sourceDocument.documentId}:${page.page}`)
        }
        return {
          page: page.page,
          source: {
            path: normalizedRelativePath(
              imagePage?.path || sourceDocument.path,
              `document ${sourceDocument.documentId} page ${page.page}`,
            ),
            mediaType: imagePage?.mediaType || sourceDocument.mediaType,
            sha256: imagePage?.sha256 || sourceDocument.sha256,
          },
          raster: structuredClone(page.raster),
          regions: structuredClone(page.regions),
          observations: structuredClone(page.observations),
          readingOrderEdges: structuredClone(page.readingOrderEdges),
        }
      }),
    }
  })
  return {
    ...loaded,
    reviewKind: 'ocr',
    paperId: loaded.manifest.paperId,
    paperName: loaded.config.provenance.paperName,
    sourceSetDigest: loaded.evidence.sourceSetDigest,
    evidenceDigest: loaded.evidence.evidenceDigest,
    reviewStructureDigest: digestJson({
      schemaVersion: 'web-import-ocr-review-structure-v1',
      paperId: loaded.manifest.paperId,
      sourceSetDigest: loaded.evidence.sourceSetDigest,
      evidenceDigest: loaded.evidence.evidenceDigest,
    }),
    ocrReview: {
      engine: structuredClone(loaded.evidence.engine),
      confidenceThreshold: loaded.evidence.confidenceThreshold,
      reviewFindings: structuredClone(loaded.reviewFindings),
      documents: reviewDocuments,
    },
  }
}

export function validateNck1OcrReviewConfirmation(projection, confirmation) {
  if (projection?.reviewKind !== 'ocr') {
    fail('OCR confirmation requires one OCR review projection', 'IMPORT_REVIEW_OCR_REQUIRED')
  }
  const resolved = resolveConfirmedNck1OcrEvidence({
    paperId: projection.paperId,
    documents: projection.documents,
    evidence: projection.evidence,
    confirmation,
  })
  if (resolved.issues.length > 0) {
    fail(`${resolved.issues[0].code}: ${resolved.issues[0].message}`, resolved.issues[0].code)
  }
  return confirmation
}

export function buildAgentOcrCorrectionReport(projection, confirmation, notes) {
  if (projection.config.importProfile !== 'public-paper-v1') {
    fail('Agent proofreading requires public-paper-v1', 'IMPORT_REVIEW_AGENT_OCR_PROFILE_REQUIRED')
  }
  validateNck1OcrReviewConfirmation(projection, confirmation)
  const invalid = (message) => fail(message, 'IMPORT_REVIEW_OCR_REPORT_INVALID')
  if (!Array.isArray(notes)) invalid('correctionNotes must be an array, including when no corrections are needed')
  const items = new Map()
  for (const document of confirmation.documents) {
    const evidenceDocument = projection.evidence.documents.find((entry) => entry.documentId === document.documentId)
    for (const page of document.pages) {
      const observations = evidenceDocument.pages.find((entry) => entry.page === page.page).observations
      for (const item of page.orderedItems) {
        items.set(item.itemId, {
          documentId: document.documentId, page: page.page, itemId: item.itemId,
          observationIds: item.observationIds,
          ocrText: item.observationIds.map((id) => observations.find((entry) => entry.observationId === id).text).join('\n'),
          correctedText: item.text,
        })
      }
    }
  }
  const seen = new Set()
  const entries = notes.map((note) => {
    const item = items.get(note?.itemId)
    if (!item || seen.has(note.itemId)
      || !['ocr_repair', 'source_typo', 'uncertain'].includes(note.kind)
      || typeof note.reason !== 'string' || !note.reason.trim()
      || typeof note.sourceText !== 'string' || !note.sourceText.trim()) {
      invalid('Every correction note needs a unique confirmed item, kind, sourceText and reason')
    }
    if (note.kind !== 'source_typo' && note.sourceText !== item.correctedText) {
      invalid('OCR repairs and uncertain readings must preserve the transcribed source text')
    }
    seen.add(note.itemId)
    return { ...item, kind: note.kind, sourceText: note.sourceText, reason: note.reason }
  })
  for (const item of items.values()) {
    if (item.ocrText !== item.correctedText && !seen.has(item.itemId)) {
      invalid(`Changed OCR item requires a correction note: ${item.itemId}`)
    }
  }
  return {
    schemaVersion: 'nck1-agent-proofreading-report-v1',
    paperId: projection.paperId, sourceSetDigest: projection.sourceSetDigest,
    evidenceDigest: projection.evidenceDigest, reviewedBy: 'import_agent', entries,
  }
}

function jsonPointerValue(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined
  let value = root
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
    value = value[key]
  }
  return value
}

export function validateAgentOcrCorrectionSidecar(sidecar, { materialization, paperId, documents, sourceDocuments, sourceDigest, candidateDigest }) {
  const invalid = (message) => fail(message, 'IMPORT_REVIEW_OCR_CORRECTION_REPORT_INVALID')
  if (!['agent-ocr-correction-report-v2', OCR_NUMBERING_REPORT_VERSION].includes(sidecar?.schemaVersion)
    || sidecar.paperId !== paperId
    || typeof sidecar.ocrConfirmationId !== 'string'
    || typeof sidecar.ocrRevisionId !== 'string'
    || typeof sidecar.originalSourceSetDigest !== 'string'
    || typeof sidecar.ocrEvidenceDigest !== 'string'
    || !Array.isArray(sidecar.entries)) invalid('Agent OCR correction report identity is incomplete')
  if (!sourceDigest || !candidateDigest || !documents
    || sidecar.sourceDigest !== sourceDigest || sidecar.candidateDigest !== candidateDigest
    || sidecar.originalSourceSetDigest !== nck1OcrSourceSetDigest(documents)) {
    invalid('Correction report no longer binds the current Candidate and original documents')
  }
  const actualSources = new Map((sourceDocuments || []).map((document) => [document.documentId, document.bytes]))
  if (documents.filter((document) => !document.renditionOf).some((document) => {
    const bytes = actualSources.get(document.documentId)
    return !(bytes instanceof Uint8Array) || bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256
  })) invalid('Correction report original document metadata differs from actual source bytes')
  const allowed = new Set(['ocr_misrecognition', 'source_spelling_error', 'source_layout_error'])
  for (const [index, entry] of sidecar.entries.entries()) {
    if (!allowed.has(entry?.category)
      || typeof entry.ocrItemId !== 'string'
      || typeof entry.before !== 'string'
      || typeof entry.after !== 'string'
      || typeof entry.reason !== 'string' || !entry.reason.trim()
      || typeof entry.sourceLocator?.documentId !== 'string'
      || !Number.isInteger(entry.sourceLocator?.page)
      || typeof entry.materializationTarget?.jsonPointer !== 'string') {
      invalid(`Agent OCR correction report entry ${index} is incomplete`)
    }
    if (jsonPointerValue(materialization, entry.materializationTarget.jsonPointer) !== entry.after) {
      invalid(`Agent OCR correction report entry ${index} no longer matches current Materialization`)
    }
    if (Object.hasOwn(entry, 'standardizationProjection')
      && !validateOcrNumberingProjection(sidecar, entry, materialization,
        entry.standardizationProjection?.historicalConfirmedText)) {
      invalid(`Agent OCR correction report entry ${index} has an invalid standardization projection`)
    }
  }
  return sidecar
}

export function buildImportReviewProjection(
  rootDir,
  { reviewKind = 'candidate', requireAnalyses = false, expectedCandidateDigest = null } = {},
) {
  return reviewKind === 'ocr'
    ? buildNck1OcrReviewProjection(rootDir)
    : buildNck1ReviewProjection(rootDir, { requireAnalyses, expectedCandidateDigest })
}

function visibleStructure(projected) {
  const structure = projected.nodes.flatMap((node) => {
    if (['part', 'section', 'instruction'].includes(node.kind)) {
      return [structuredClone(node)]
    }
    if (node.kind === 'group') {
      return [{
        kind: 'group',
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      }]
    }
    if (node.kind === 'answer_region') return []
    fail(`Candidate projection contains unknown node kind: ${node.kind}`)
  })
  assertCanonicalVisibleStructure(
    structure,
    projected.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => ({
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      })),
  )
  return structure
}

function mediaArtifacts(projected, sourceCapture) {
  const documents = new Map(sourceCapture.documents.map((document) => [
    document.immutableArtifactRef?.artifactId,
    document,
  ]))
  const artifacts = new Map()
  for (const occurrence of projected.nodes) {
    if (occurrence.kind !== 'group') continue
    for (const media of occurrence.media || []) {
      const document = documents.get(media.sourceArtifactRef?.artifactId)
      if (
        !document
        || document.sha256 !== media.sha256
        || document.mediaType !== media.mimeType
        || typeof document.encodedBytes !== 'string'
      ) fail(`Candidate media does not close against source bytes: ${media.mediaId}`)
      const artifact = {
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        sha256: media.sha256,
        pixelWidth: media.pixelWidth,
        pixelHeight: media.pixelHeight,
        sourceArtifactRef: media.sourceArtifactRef,
        encodedBytes: document.encodedBytes,
      }
      const existing = artifacts.get(media.mediaId)
      if (existing && stableStringify(existing) !== stableStringify(artifact)) {
        fail(`Candidate media identity is ambiguous: ${media.mediaId}`)
      }
      artifacts.set(media.mediaId, artifact)
    }
  }
  return [...artifacts.values()]
}

function mediaDerivationProjection(sourceCapture) {
  const documents = new Map(sourceCapture.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const candidates = new Map(sourceCapture.observations
    .filter((observation) => observation.kind === 'media_derivation_candidate')
    .map((observation) => [observation.value?.mediaId, observation]))
  return sourceCapture.observations
    .filter((observation) =>
      observation.kind === 'source_media'
      && observation.value?.presentation
      && observation.value?.publication)
    .map((observation) => {
      const source = documents.get(observation.documentId)
      const candidateObservation = candidates.get(observation.value.mediaId)
      const candidateDocument = candidateObservation
        ? documents.get(candidateObservation.documentId)
        : null
      if (
        !source
        || typeof source.encodedBytes !== 'string'
        || source.sha256 !== observation.value.sha256
        || (
          candidateObservation
          && (
            !candidateDocument
            || typeof candidateDocument.encodedBytes !== 'string'
            || candidateDocument.sha256
              !== candidateObservation.value?.candidate?.sha256
          )
        )
      ) fail(`Media derivation does not close against immutable bytes: ${observation.value.mediaId}`)
      return {
        mediaId: observation.value.mediaId,
        presentation: structuredClone(observation.value.presentation),
        presentationDigest: digestJson(observation.value.presentation),
        publication: structuredClone(observation.value.publication),
        source: {
          mimeType: source.mediaType,
          sha256: source.sha256,
          pixelWidth: observation.value.pixelWidth,
          pixelHeight: observation.value.pixelHeight,
          encodedBytes: source.encodedBytes,
        },
        ...(candidateObservation
          ? {
              candidate: {
                ...structuredClone(candidateObservation.value.candidate),
                encodedBytes: candidateDocument.encodedBytes,
              },
            }
          : {}),
      }
    })
}

export function buildNck1ReviewConsumption(candidate, compilation) {
  const { sourceCapture, canonicalPaper } = compilation.artifacts
  const authority = resolveCanonicalAuthority(canonicalPaper.paperPlan.authorityRef)
  if (!authority.ok) fail('Candidate preview authority is unavailable')
  const projectedResult = projectCanonicalPaper({
    plan: canonicalPaper.paperPlan,
    groups: canonicalPaper.questionGroups,
    sourceCapture,
    authorityClosure: authority.closure,
  })
  const projected = {
    ...projectedResult,
    nodes: decorateProjectedMediaPresentation(
      projectedResult.nodes,
      sourceCapture,
    ),
  }
  const groupsByFamily = new Map()
  for (const group of canonicalPaper.questionGroups) {
    const familyContractId = group.contractRef.familyContractId
    const groupIds = groupsByFamily.get(familyContractId) || []
    groupIds.push(group.identity.groupId)
    groupsByFamily.set(familyContractId, groupIds)
  }
  const selections = [...groupsByFamily].map(([familyContractId, groupIds]) => {
    const projectedOccurrences = projected.nodes.filter(
      (node) => node.kind === 'group' && groupIds.includes(node.groupId),
    )
    return {
      mode: 'canonical',
      familyContractId,
      groupIds,
      projectedOccurrences,
      ...([
        'listening',
        'seven-choices',
        'cloze',
        'grammar-fill',
        ...(['49', '50', '51', '52', '54', '55', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79', '80'].includes(
          canonicalPaper.paperPlan.authorityRef.manifestVersion,
        )
          ? ['continuation-writing']
          : []),
      ].includes(familyContractId) || projectedOccurrences.some(occurrence => occurrence.sourcePresentation !== undefined)
        ? {
            projectedOccurrenceDigests: projectedOccurrences.map((occurrence) => ({
              groupId: occurrence.groupId,
              digest: digestJson(occurrence),
            })),
          }
        : {}),
    }
  })
  const structure = visibleStructure(projected)
  const consumption = {
    disposition: 'ready',
    paperId: canonicalPaper.paperPlan.paperId,
    sourceAssetVersion: candidate.interpretation.sourceAssetVersion,
    sourceAssetDigest: candidate.source.sha256,
    authorityRef: structuredClone(canonicalPaper.paperPlan.authorityRef),
    profileRef: structuredClone(canonicalPaper.paperPlan.profileRef),
    consumerContractRef: structuredClone(consumerContractRefsForAuthority(canonicalPaper.paperPlan.authorityRef).screen),
    visibleStructure: structure,
    visibleStructureDigest: digestJson(structure),
    selections,
    mediaArtifacts: mediaArtifacts(projected, sourceCapture),
    diagnostics: [],
  }
  assertCanonicalConsumptionVisibleStructure(consumption)
  return consumption
}

function compatibilityText(
  blocks,
  questionNoByBlankId = new Map(),
  family = null,
) {
  return blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => {
      let text = ''
      for (const [index, inline] of block.content.entries()) {
        if (inline.kind === 'text') {
          text += inline.text
          continue
        }
        const marker = `__${questionNoByBlankId.get(inline.blankId)}__`
        if (family !== 'grammar-fill') {
          text += marker
          continue
        }
        const nextInline = block.content[index + 1]
        const prefix = /[\p{L}\p{N}_]$/u.test(text) ? ' ' : ''
        const suffix =
          nextInline?.kind === 'text'
          && /^(?:[\p{L}\p{N}_]|\()/u.test(nextInline.text)
            ? ' '
            : ''
        text += `${prefix}${marker}${suffix}`
      }
      return text
    })
    .join('\n')
}

export function buildNck1CompatibilityPaperAsset({
  config,
  materialization,
  sourceAssetVersion,
  primarySourceType = 'pdf',
  sourceProvenance = null,
}) {
  const groupTypes = {
    reading: 'reading',
    'seven-choices': 'sevenChoices',
    cloze: 'cloze',
    'grammar-fill': 'grammarFill',
    'application-writing': 'writing',
    'continuation-writing': 'writing',
  }
  const groups = {}
  const questions = {}
  const blanks = {}
  const writingTasks = {}
  const answerKey = {}
  const answers = new Map(materialization.answers.map((answer) => [answer.questionId, answer]))
  const listeningGroups = materialization.listening.state === 'captured'
    ? [
        { slotId: 'listening.short-dialogue', from: 1, to: 5 },
        { slotId: 'listening.long-form', from: 6, to: 20 },
      ]
    : []
  const listeningAnswers = new Map((materialization.listening.answers || []).map((answer) => [
    answer.canonicalNumber,
    answer,
  ]))
  for (const spec of listeningGroups) {
    const groupId = `group:${materialization.paperId}:${spec.slotId}`
    const listeningQuestions = materialization.listening.questions.filter((question) =>
      question.canonicalNumber >= spec.from && question.canonicalNumber <= spec.to)
    const questionIds = listeningQuestions.map((question) =>
      `question:listening:${question.canonicalNumber}`)
    groups[groupId] = {
      groupId,
      groupType: 'listening',
      title: spec.slotId,
      questionIds,
    }
    for (const question of listeningQuestions) {
      const questionId = `question:listening:${question.canonicalNumber}`
      const answer = listeningAnswers.get(question.canonicalNumber)
      questions[questionId] = {
        questionId,
        questionNo: question.canonicalNumber,
        groupId,
        stem: question.stem,
        options: question.options.map(({ label, text }) => ({ label, text })),
      }
      if (answer) {
        answerKey[questionId] = {
          questionId,
          questionNo: question.canonicalNumber,
          answer: answer.value,
        }
      }
    }
  }
  for (const group of materialization.groups) {
    const questionIds = group.questions.map((question) => question.questionId)
    const blankIds = group.questions.map((question) => question.blankId).filter(Boolean)
    const questionNoByBlankId = new Map(group.questions
      .filter((question) => question.blankId)
      .map((question) => [question.blankId, question.canonicalNumber]))
    const writingTaskId = group.writingTask ? `writing-task:${group.groupId}` : undefined
    groups[group.groupId] = {
      groupId: group.groupId,
      groupType: groupTypes[group.family],
      title: group.slotId,
      questionIds,
      ...(blankIds.length > 0 ? { blankIds } : {}),
      ...(writingTaskId ? { writingTaskId } : {}),
      passage: {
        paragraphs: group.blocks
          .filter((block) => block.kind === 'paragraph')
          .map((block) => ({
            paragraphId: block.blockId,
            ...(group.family === 'seven-choices'
              ? { role: block.role }
              : {}),
            text: compatibilityText(
              [block],
              questionNoByBlankId,
              group.family,
            ),
          })),
      },
      ...(group.optionBank.length > 0
        ? { optionBank: group.optionBank.map(({ label, text }) => ({ label, text })) }
        : {}),
    }
    for (const question of group.questions) {
      questions[question.questionId] = {
        questionId: question.questionId,
        questionNo: question.canonicalNumber,
        groupId: group.groupId,
        stem: question.stem,
        ...(question.options.length > 0
          ? { options: question.options.map(({ label, text }) => ({ label, text })) }
          : {}),
        ...(question.blankId ? { blankId: question.blankId } : {}),
      }
      if (question.blankId) {
        blanks[question.blankId] = {
          blankId: question.blankId,
          groupId: group.groupId,
          questionId: question.questionId,
          ...(question.prompt ? { prompt: question.prompt } : {}),
        }
      }
      const answer = answers.get(question.questionId)
      if (answer) {
        answerKey[question.questionId] = {
          questionId: question.questionId,
          questionNo: question.canonicalNumber,
          answer: answer.value,
        }
      }
    }
    if (group.writingTask) {
      writingTasks[writingTaskId] = {
        writingTaskId,
        groupId: group.groupId,
        taskType: group.writingTask.taskType,
        title: group.slotId,
        instruction: group.writingTask.prompt,
        wordCountTarget: group.writingTask.wordCountTarget,
        ...(group.writingTask.material.length > 0
          ? { materialText: group.writingTask.material.join('\n') }
          : {}),
        ...(group.writingTask.starters.length > 0
          ? { continuationStarters: group.writingTask.starters }
          : {}),
        ...(group.writingTask.officialModelAnswer
          ? { officialModelAnswer: group.writingTask.officialModelAnswer }
          : {}),
      }
    }
  }
  return {
    schemaVersion: 'paper-asset-v1',
    paper: {
      paperId: materialization.paperId,
      title: config.provenance.paperName,
      subject: 'English',
      source: config.provenance.source,
      assetVersion: sourceAssetVersion,
      status: 'draft',
    },
    sources: {
      primarySourceType,
      sourceType: configuredSourceType(config, materialization.paperId),
      ...(sourceProvenance ? { provenance: structuredClone(sourceProvenance) } : {}),
    },
    layoutTree: { parts: [] },
    content: {
      blocks: [
        ...listeningGroups.map(({ slotId }) => ({
          type: 'group',
          groupId: `group:${materialization.paperId}:${slotId}`,
        })),
        ...materialization.groups.map((group) => ({ type: 'group', groupId: group.groupId })),
      ],
      groups,
      questions,
      ...(Object.keys(blanks).length > 0 ? { blanks } : {}),
      ...(Object.keys(writingTasks).length > 0 ? { writingTasks } : {}),
    },
    answerKey: { answers: answerKey },
    analysis: {},
  }
}

function listeningReviewProjection(
  materialization,
  listeningAudioEvidence,
  listeningAnalysis = null,
  analyzedPackage = null,
  sourceProvenance = null,
) {
  if (materialization.listening.state !== 'captured') return null
  const answers = new Map(materialization.listening.answers.map((answer) => [
    answer.canonicalNumber,
    answer.value,
  ]))
  return {
    questions: materialization.listening.questions.map((question) => ({
      questionId: `question:listening:${question.canonicalNumber}`,
      questionNo: question.canonicalNumber,
      officialAnswer: answers.get(question.canonicalNumber),
      transcriptSegments: materialization.listening.transcript
        .filter((segment) => segment.questionNumbers.includes(question.canonicalNumber))
        .map((segment) => ({
          segmentId: segment.segmentId,
          text: segment.text,
          questionNumbers: [...segment.questionNumbers],
        })),
      analysis: listeningAnalysis?.questions?.[`question:listening:${question.canonicalNumber}`] || null,
    })),
    audio: analyzedPackage
      ? {
          state: 'included_in_candidate_review',
          durationSeconds: analyzedPackage.listeningAudio.durationSeconds,
          playbackAudioSha256: analyzedPackage.listeningAudio.sha256,
          mediaType: analyzedPackage.listeningAudio.mediaType,
          path: sourceProvenance.members.find((member) => member.role === 'audio')?.path,
          reviewRequired: true,
          transcriptSegmentCount: materialization.listening.transcript.length,
          questionCount: materialization.listening.questions.length,
          answerCount: materialization.listening.answers.length,
        }
      : listeningAudioEvidence?.segments
        ? {
            state: listeningAudioEvidence.segments.state,
            durationSeconds: listeningAudioEvidence.segments.durationSeconds,
            playbackAudioSha256: listeningAudioEvidence.segments.playbackAudioSha256,
            contentValidation: 'not_performed',
            candidates: structuredClone(listeningAudioEvidence.segments.candidates),
          }
      : {
          durationSeconds: listeningAudioEvidence.asr.durationSeconds,
          engine: structuredClone(listeningAudioEvidence.asr.engine),
          playbackAudioSha256: listeningAudioEvidence.check.playbackAudioSha256,
          asrSha256: listeningAudioEvidence.check.asrSha256,
          comparison: structuredClone(listeningAudioEvidence.check.comparison),
          ...(listeningAudioEvidence.check.scope ? {
            scope: structuredClone(listeningAudioEvidence.check.scope),
            summary: listeningAudioEvidence.check.summary,
          } : {}),
          contentSafety: {
            verdict: listeningAudioEvidence.check.contentSafety.verdict,
            reviewedAt: listeningAudioEvidence.check.contentSafety.reviewedAt,
            ...(listeningAudioEvidence.check.contentSafety.scope ? {
              scope: structuredClone(listeningAudioEvidence.check.contentSafety.scope),
            } : {}),
          },
        },
    materials: listeningAnalysis?.materials || {},
  }
}

function configuredSourceType(config, paperId) {
  const sourceType = config.provenance?.sourceType
    || (paperId.startsWith('paper-mock-') ? '模拟题' : '真题')
  if (!['真题', '模拟题', '校本题', '自编题'].includes(sourceType)) {
    fail(`Unsupported sourceType: ${sourceType}`)
  }
  return sourceType
}

function configuredYear(config, paperId) {
  const explicit = Number(config.provenance?.year)
  if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2100) {
    return explicit
  }
  const inferred = Number(
    /(?:19|20)\d{2}/.exec(
      `${paperId} ${config.provenance?.paperName || ''}`,
    )?.[0],
  )
  if (!Number.isInteger(inferred)) {
    fail('Universal NCK1 compatibility metadata requires a factual year')
  }
  return inferred
}

export function buildNck1CompatibilityPackage({
  config,
  manifest,
  materialization,
  sourceProvenance = null,
  sourceAssetVersion = 1,
  analysisSidecars = {},
  paragraphSummariesBytes = null,
  publicSearchMetadataBytes = null,
  sourceReferencesBytes = null,
  sourceReferenceApproval = null,
  frozenProducts = null,
  pdfProductApproval = null,
  paginationPlan = null,
  paginationBindingIdentity = null,
}) {
  const externalPackage = sourceProvenance?.kind === 'external_analyzed_package'
  const sourceDocument = externalPackage
    ? manifest.members.find((member) => member.role === 'content')
    : materialization.documents.find((document) =>
      ['question_source', 'question_and_answers'].includes(document.role))
  const manifestDocument = externalPackage
    ? sourceDocument
    : manifest.documents.find((document) =>
      document.documentId === sourceDocument?.documentId)
  if (!sourceDocument || !manifestDocument) {
    fail('NCK1 compatibility metadata requires one authoritative content source')
  }
  const sourceFileSha256 = String(sourceDocument.sha256 || '').replace(/^sha256:/, '')
  if (!/^[a-f0-9]{64}$/.test(sourceFileSha256)) {
    fail('NCK1 authoritative content source digest is invalid')
  }
  const sourceType = configuredSourceType(config, materialization.paperId)
  const examDate = readExamDate(config.provenance, { required: Boolean(config.pdfProductsRequired || frozenProducts) })
  const year = configuredYear(config, materialization.paperId)
  const defaultTags = Array.isArray(config.provenance?.defaultTags)
    ? config.provenance.defaultTags
    : [sourceType, String(year)]
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config,
    materialization,
    sourceAssetVersion,
    primarySourceType: primarySourceType(materialization, externalPackage),
    sourceProvenance: externalPackage ? sourceProvenance : null,
  })
  const answerKey = {
    schemaVersion: 'answer-key-v1',
    paperId: materialization.paperId,
    sourceAssetVersion,
    answers: structuredClone(paperAsset.answerKey.answers),
  }
  const analysisByFamily = {
    reading: analysisSidecars['reading-choice-analysis-v1.json'],
    'seven-choices': analysisSidecars['seven-choices-analysis-v1.json'],
    cloze: analysisSidecars['cloze-analysis-v1.json'],
    'grammar-fill': analysisSidecars['grammar-fill-analysis-v1.json'],
  }
  const familyLabel = {
    reading: '阅读理解',
    'seven-choices': '七选五',
    cloze: '完形填空',
    'grammar-fill': '语法填空',
  }
  const importMetaGroups = Object.fromEntries(materialization.groups
    .filter(({ family }) => analysisByFamily[family])
    .map((group) => [group.groupId, {
      groupId: group.groupId,
      difficulty: '中',
      summary: analysisByFamily[group.family]?.groups?.[group.groupId]?.overview
        || paperAsset.content.groups[group.groupId]?.title
        || familyLabel[group.family],
      tags: [familyLabel[group.family]],
      displayTitleOverride: paperAsset.content.groups[group.groupId]?.title
        || familyLabel[group.family],
    }]))
  return {
    paperAsset,
    ...(config.headerTitle !== undefined ? { paperHeader: configuredPaperHeader(config) } : {}),
    answerKey,
    readingAnalysis: analysisSidecars['reading-choice-analysis-v1.json'] || null,
    scAnalysis: analysisSidecars['seven-choices-analysis-v1.json'] || null,
    clozeAnalysis: analysisSidecars['cloze-analysis-v1.json'] || null,
    grammarFillAnalysis: analysisSidecars['grammar-fill-analysis-v1.json'] || null,
    writingAnalysis: analysisSidecars['writing-analysis-v1.json'] || null,
    listeningAnalysis: analysisSidecars['listening-analysis-v1.json'] || null,
    paragraphSummariesBytes,
    publicSearchMetadataBytes,
    sourceReferencesBytes,
    sourceReferenceApproval,
    frozenProducts,
    pdfProductApproval,
    importMeta: {
      schemaVersion: 'import-meta-v1',
      paperId: materialization.paperId,
      sourceFileName: path.basename(manifestDocument.path),
      sourceFileSha256,
      ...(externalPackage ? { sourceProvenance: structuredClone(sourceProvenance) } : {}),
      paper: {
        year,
        ...(examDate ? { month: examDate.month } : {}),
        region: config.provenance?.region || config.provenance.source,
        paperName: config.provenance.paperName,
        examCode: materialization.paperId.replace(/^paper-/, ''),
        subject: 'English',
        sourceType,
        defaultTags,
      },
      groups: importMetaGroups,
    },
    sourceAssetDigest: sourceFileSha256,
    paginationPlan: paginationPlan ? structuredClone(paginationPlan) : null,
    paginationPlanBinding: paginationBindingIdentity ? {
      schemaVersion: 'paper-pagination-binding-v1',
      paperId: materialization.paperId,
      sourceDigest: paginationBindingIdentity.sourceDigest,
      canonicalSourceDigest: null,
      candidateDigest: paginationBindingIdentity.candidateDigest,
      planDigest: paginationPlan ? digestJson(paginationPlan) : null,
    } : null,
  }
}

export function buildNck1ReviewProjection(rootDir, options = {}) {
  return buildNck1ReviewProjectionInternal(rootDir, options, readFrozenProducts)
}

// Server replay path only: revision is loaded from the persisted Review store,
// not supplied as a draft option. Its existing manifest owns the sealed digest.
function sealedReferenceReceipt(revision, manifest = revision.manifest) {
  const descriptor = manifest.files.find(file => file.path === SOURCE_REFERENCES_FILE)
  if (!descriptor) return null
  const revisionId = revision.id ?? revision.revisionId
  const persistedApproval = revision.schemaVersion === 'web-import-review-approval-v1' && revision.approvalId
  if (!revisionId || (!revision.state && !persistedApproval) || revision.state === 'uploading'
    || revision.bundleDigest !== manifest.bundleDigest
    || reviewSubjectBundleDigest(manifest) !== revision.bundleDigest
    || ['paperId', 'sourceDigest', 'candidateDigest'].some(key => revision[key] !== manifest[key])) {
    fail('Untrusted sealed source-reference revision', 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID')
  }
  return { revisionId, bundleDigest: revision.bundleDigest,
    paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
    sourceReferencesDigest: descriptor.sha256 }
}

export function buildNck1SealedReviewProjection(rootDir, revision, { manifest = revision.manifest, ...options } = {}) {
  return buildNck1ReviewProjectionInternal(rootDir,
    { ...options, expectedCandidateDigest: revision.candidateDigest }, readFrozenProducts,
    sealedReferenceReceipt(revision, manifest), { revision, manifest })
}

// Only this entry constructs the private product reader. There is no public
// skip-pdfinfo option and callers cannot supply projection/listening objects.
export function computeSealedReviewSubjects({ directory, revision, preview, storedFiles, onMemory = () => {} }) {
  return withSealedReviewSnapshot(directory, revision.manifest.files, snapshot => {
    const { fileEvidence } = snapshot
    onMemory('sealed-snapshot')
    let baseline = buildStoredReviewSubject({ revision, preview, storedFiles, fileEvidence })
    const changed = fileEvidence.find(file => {
      const expected = revision.manifest.files.find(item => item.path === file.path)
      return file.sha256 !== expected.sha256 || file.byteLength !== expected.byteLength
    })
    if (changed) return { baseline: { ok: false, reasonCode: 'SEALED_FILE_CHANGED', differences: [changed.path] }, target: null }
    // Sealed hashes and JSON syntax are already checked. The target reopens its
    // own snapshot; retain canonical JSON digests instead of a second full parse
    // of every image bundle/materialization throughout compilation.
    for (const file of fileEvidence) if (Object.hasOwn(file, 'json') && file.path !== PRODUCT_MANIFEST) {
      file.jsonDigest = digestJson(file.json)
      delete file.json
    }
    onMemory('compacted-evidence')
    try {
      const products = fileEvidence.find(file => file.path === PRODUCT_MANIFEST)
      const readSealedProducts = (_root, options) => {
        const manifest = products?.json
        if (!manifest || manifest.inputDigest !== options.inputDigest
          || sourceProductEditions(options.config, options.listeningCount).length !== manifest.files.length) {
          fail('Sealed product input identity differs')
        }
        const pageLimits = productPageLimitsForManifest(manifest)
        for (const key of Object.keys(pageLimits)) {
          if (options[key] !== undefined && options[key] !== pageLimits[key]) fail('Sealed product page limit differs')
        }
        for (const file of manifest.files) {
          const edition = path.basename(file.path, '.pdf')
          if (edition === 'answerOnly') continue
          const policy = studentProductPolicy(edition, 2, pageLimits)
          if (policy.atMost ? file.pageCount > policy.targetPages : file.pageCount !== policy.targetPages) {
            fail('Sealed product page count differs')
          }
        }
        // Byte hashes and all product descriptors are checked by subject
        // extraction. No PDF bytes are materialized or returned to the API.
        return { manifest, digest: products.sha256, bytes: {} }
      }
      const projection = buildNck1ReviewProjectionInternal(snapshot.directory,
        { requireAnalyses: true, expectedCandidateDigest: revision.candidateDigest }, readSealedProducts,
        sealedReferenceReceipt(revision), { revision, manifest: revision.manifest })
      onMemory('projection')
      baseline = buildStoredReviewSubject({ revision, preview, storedFiles, fileEvidence,
        validatedListeningReview: projection.reviewedListening })
      const expected = reviewBundleFilePathsForProjection(snapshot.directory, projection)
      const inventory = expected.map(file => ({
        ...file, sha256: fileEvidence.find(item => item.path === file.path)?.sha256,
        byteLength: fileEvidence.find(item => item.path === file.path)?.byteLength,
      }))
      if (!baseline.ok) return { baseline, target: { ok: false, reasonCode: 'BASELINE_UNTRUSTED' } }
      const comparisonProjection = reviewProjectionForTrustedBaseline(baseline.subject, projection)
      const target = buildTargetReviewSubject({ revision, projection: comparisonProjection, inventory, fileEvidence })
      if (target.ok) target.provenance.source = 'current-validated-projection-with-declared-consumer-comparison'
      return { baseline, target }
    } catch {
      return { baseline, target: { ok: false, reasonCode: 'TARGET_COMPUTATION_FAILED' } }
    }
  })
}

function buildNck1ReviewProjectionInternal(rootDir, options = {}, readProducts, referenceReceipt = null, sealedListening = null) {
  return withNck1MaterializationSourceCache(() => buildNck1ReviewProjectionUncached(rootDir, options, readProducts, referenceReceipt, sealedListening))
}

function buildNck1ReviewProjectionUncached(rootDir, {
  requireAnalyses = false,
  analysisProfile = LEGACY_NCK1_ANALYSIS_PROFILE,
  expectedCandidateDigest = null,
} = {}, readProducts, referenceReceipt, sealedListening) {
  const loaded = loadNck1ReviewSource(rootDir)
  const imported = importNck1ReviewCandidate(rootDir, loaded, expectedCandidateDigest)
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const reviewedListening = loadReviewedListening(rootDir, loaded, imported.candidate, sealedListening)
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) {
    const issue = preview.unresolvedIssues?.[0]
    fail(`${issue?.code || 'CANDIDATE_PREVIEW_INVALID'}: ${issue?.message || 'Candidate preview compilation failed'}`)
  }
  const consumption = buildNck1ReviewConsumption(
    preview.candidate,
    preview.compilation,
  )
  const importProfile = nck1ImportProfile(loaded.config, {
    externalPackage: Boolean(loaded.analyzedPackage),
  })
  const mediaDerivations = mediaDerivationProjection(
    preview.compilation.artifacts.sourceCapture,
  )
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config: loaded.config,
    materialization: loaded.materialization,
    sourceAssetVersion: preview.candidate.interpretation.sourceAssetVersion,
    primarySourceType: primarySourceType(
      loaded.materialization,
      Boolean(loaded.analyzedPackage),
    ),
    sourceProvenance: loaded.analyzedPackage ? loaded.sourceProvenance : null,
  })
  const analysisProjection = buildNck1AnalysisProjection({
    rootDir,
    materialization: loaded.materialization,
    paperAsset,
    sourceAssetVersion: preview.candidate.interpretation.sourceAssetVersion,
    required: requireAnalyses && !importProfile,
    analysisProfile,
    requireTeachingContent: Boolean(loaded.analyzedPackage),
  })
  const sourceVisuals = sourceVisualProjection(loaded)
  const paragraphSummaries = importProfile
    ? loadParagraphSummaries(rootDir, loaded, preview.candidate.source.sha256, preview.candidate.candidateDigest)
    : null
  const publicSearchMetadata = importProfile
    ? loadPublicSearchMetadata(rootDir, loaded, preview.candidate.source.sha256, preview.candidate.candidateDigest)
    : null
  const referencesPath = resolveReviewFile(rootDir, SOURCE_REFERENCES_FILE)
  const sourceReferencesBytes = existsSync(referencesPath) ? readFileSync(referencesPath) : null
  const sourceReferences = sourceReferencesBytes ? parseSourceReferencesBytes(sourceReferencesBytes) : null
  const referenceBinding = {
    sidecar: sourceReferences,
    materialization: loaded.materialization,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    sourceInput: loaded.sourceInput,
  }
  if (referenceReceipt) assertSealedSourceReferenceReplay({ ...referenceBinding,
    sourceReferencesBytes, receipt: referenceReceipt })
  else assertSourceReferenceAdmission(referenceBinding)
  const slotBindings = paginationSlotBindings(consumption)
  // Historical analyzed packages without a PDF commitment retain their separate
  // source contract. Raw-source and product workspaces must declare absence.
  const hasProductManifest = existsSync(resolveReviewFile(rootDir, PRODUCT_MANIFEST))
  if (!loaded.analyzedPackage || loaded.config.pdfProductsRequired || loaded.config.listening !== undefined
    || hasProductManifest) {
    sourceProductEditions(loaded.config, slotBindings.filter(entry => entry.familyContractId === 'listening').length)
  }
  const paginationPlan = loadPaperPaginationPlan(rootDir, {
    paperId: loaded.materialization.paperId,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    slotBindings,
    sourceHasListening: slotBindings.some((entry) => entry.familyContractId === 'listening'),
  })
  const correctionReportPath = resolveReviewFile(rootDir, 'agent-ocr-correction-report-v2.json')
  const ocrCorrectionReport = existsSync(correctionReportPath)
    ? validateAgentOcrCorrectionSidecar(
        readJson(correctionReportPath, 'agent-ocr-correction-report-v2.json'),
        {
          materialization: loaded.sourceInput.spellingReviewBytes
            ? JSON.parse(new TextDecoder().decode(loaded.sourceInput.materializationBytes))
            : loaded.materialization,
          paperId: loaded.materialization.paperId,
          documents: loaded.manifest.documents,
          sourceDocuments: loaded.sourceInput.documents,
          sourceDigest: preview.candidate.source.sha256, candidateDigest: preview.candidate.candidateDigest,
        },
      )
    : null
  const examDate = readExamDate(loaded.config.provenance, { required: Boolean(loaded.config.pdfProductsRequired
    || existsSync(resolveReviewFile(rootDir, PRODUCT_MANIFEST))) })
  let bundleFiles
  const inventory = () => bundleFiles ||= reviewBundleFilePathsFromSource(rootDir, loaded, imported.candidate, {
    reviewedListening,
    // Inventory historically requires analyses for legacy bundles even when
    // a Screen projection did not, and checks sourceAssetVersion 1. Reuse only
    // an equivalent (or stricter) analysis validation.
    analysisValidated: (requireAnalyses || Boolean(importProfile))
      && preview.candidate.interpretation.sourceAssetVersion === 1,
  })
  const frozenProducts = existsSync(resolveReviewFile(rootDir, PRODUCT_MANIFEST))
    ? readProducts(rootDir, { inputDigest: productInputDigest(rootDir, inventory(), reviewedListening),
        config: loaded.config, listeningCount: slotBindings.filter(entry => entry.familyContractId === 'listening').length,
        ...productPageLimitsForPlan(paginationPlan?.plan) }) : null
  if (frozenProducts && !sourceReferences) {
    fail('四款 PDF 必须保留完整的源参考答案捕获；不能只提交答案 PDF')
  }
  if (frozenProducts && (frozenProducts.manifest.paperId !== loaded.materialization.paperId
    || frozenProducts.manifest.paperName !== loaded.config.provenance.paperName
    || digestJson(frozenProducts.manifest.examDate) !== digestJson(examDate))) fail('Frozen PDF identity differs from Review')
  const projection = {
    ...loaded,
    frozenProducts,
    reviewedListening,
    paperId: loaded.materialization.paperId,
    paperName: loaded.config.provenance.paperName,
    examDate,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    visibleStructureDigest: consumption.visibleStructureDigest,
    candidate: preview.candidate,
    compilation: preview.compilation,
    consumption: { ...consumption, paperSourceType: configuredSourceType(loaded.config, loaded.materialization.paperId),
      ...(loaded.config.headerTitle !== undefined
        ? { paperHeaderTitle: validatedPaperHeaderTitle(configuredPaperHeader(loaded.config)) } : {}) },
    mediaDerivations,
    paperAsset,
    sourceVisuals,
    sourceProvenance: loaded.sourceProvenance,
    listeningReview: listeningReviewProjection(
      loaded.materialization,
      loaded.listeningAudioEvidence,
      analysisProjection?.sidecars?.['listening-analysis-v1.json'],
      loaded.analyzedPackage,
      loaded.sourceProvenance,
    ),
    analysisSidecars: analysisProjection?.sidecars || {},
    analysisDigest: analysisProjection?.digest || null,
    importProfile,
    paragraphSummaries: paragraphSummaries?.sidecar || null,
    paragraphSummariesBytes: paragraphSummaries?.bytes || null,
    paragraphSummariesDigest: paragraphSummaries?.digest || null,
    publicSearchMetadata: publicSearchMetadata?.sidecar || null,
    publicSearchMetadataBytes: publicSearchMetadata?.bytes || null,
    publicSearchMetadataDigest: publicSearchMetadata?.digest || null,
    sourceReferences,
    sourceReferencesBytes,
    sourceReferencesDigest: sourceReferencesBytes ? sha256(sourceReferencesBytes) : null,
    ocrCorrectionReport,
    paginationPlan: paginationPlan?.plan || null,
    paginationPlanDigest: paginationPlan?.digest || null,
    paginationSlotBindings: slotBindings,
  }
  reviewBundleInventories.set(projection, { rootDir: path.resolve(rootDir), inventory })
  return projection
}

export function printConsumption(screenConsumption) {
  return {
    ...structuredClone(screenConsumption),
    consumerContractRef: structuredClone(consumerContractRefsForAuthority(screenConsumption.authorityRef).print_pdf),
  }
}
