import {
  buildAgentOcrCorrectionReport,
  buildImportReviewProjection,
  ocrReviewBundleFilePaths,
  reviewBundleFilePaths,
  reviewBundleFilePathsForProjection,
  validateNck1OcrReviewConfirmation,
} from './revisionProjection.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { buildProductPreviewPayload, buildStoredReviewSubject } from './reviewSubject.mjs'
import { inspectSealedReviewFiles } from './sealedReviewFiles.mjs'

// Internal finalize computation only; projection comes from the strict
// constructor above, never a request body. Missing old frozen products remain
// unknown rather than creating a substitute historical baseline.
export function finalizeContentSubject(directory, revision, projection) {
  if (!revision.manifest?.files?.some(file => file.path === 'products/manifest-v1.json')) {
    return { ok: false, reasonCode: 'MISSING_FROZEN_PRODUCTS' }
  }
  const payload = buildProductPreviewPayload(revision, projection)
  const baseline = buildStoredReviewSubject({
    revision: { ...revision, state: 'awaiting_review' },
    preview: { revision_id: revision.id, bundle_digest: revision.bundleDigest,
      renderer_build_id: revision.rendererBuildId, payload_digest: digestJson(payload), payload_json: JSON.stringify(payload) },
    storedFiles: revision.manifest.files,
    fileEvidence: inspectSealedReviewFiles(directory, revision.manifest.files),
    validatedListeningReview: projection.reviewedListening,
  })
  return baseline.ok ? { ...baseline, origin: 'finalize' } : baseline
}

// Shared by the synchronous internal seam and the read-only worker.
export function finalizeProjection(directory, revision, { requireAnalyses = revision.reviewKind === 'candidate' } = {}) {
  return buildImportReviewProjection(directory, {
    reviewKind: revision.reviewKind,
    requireAnalyses,
    expectedCandidateDigest: revision.candidateDigest,
  })
}

export function finalizeInventory(directory, revision, projection = null) {
  return (revision.reviewKind === 'ocr'
    ? ocrReviewBundleFilePaths(directory)
    : projection ? reviewBundleFilePathsForProjection(directory, projection) : reviewBundleFilePaths(directory))
    .map(({ path, mediaType, role }) => `${path}\0${mediaType}\0${role}`)
    .sort()
}

export function ocrConfirmationComputation(projection, input, reviewerKind) {
  const confirmation = validateNck1OcrReviewConfirmation(projection, input?.confirmation)
  const correctionReport = reviewerKind === 'import_agent'
    ? buildAgentOcrCorrectionReport(projection, confirmation, input?.correctionNotes)
    : null
  return { confirmation, correctionReport }
}
