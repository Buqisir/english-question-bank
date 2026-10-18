import {
  buildImportReviewProjection,
  ocrReviewBundleFilePaths,
  reviewBundleFilePaths,
} from './revisionProjection.mjs'

// Shared by the synchronous internal seam and the read-only worker.
export function finalizeProjection(directory, revision) {
  return buildImportReviewProjection(directory, {
    reviewKind: revision.reviewKind,
    requireAnalyses: revision.reviewKind === 'candidate',
    expectedCandidateDigest: revision.candidateDigest,
  })
}

export function finalizeInventory(directory, revision) {
  return (revision.reviewKind === 'ocr'
    ? ocrReviewBundleFilePaths(directory)
    : reviewBundleFilePaths(directory))
    .map(({ path, mediaType, role }) => `${path}\0${mediaType}\0${role}`)
    .sort()
}
