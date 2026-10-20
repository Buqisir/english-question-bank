import {
  buildAgentOcrCorrectionReport,
  buildImportReviewProjection,
  ocrReviewBundleFilePaths,
  reviewBundleFilePaths,
  reviewBundleFilePathsForProjection,
  validateNck1OcrReviewConfirmation,
} from './revisionProjection.mjs'

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
