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
  if (!Array.isArray(revision.manifest?.files)
    || !revision.manifest.files.some(file => file?.path === 'products/manifest-v1.json')) {
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

function revisionInvalid(message) {
  throw Object.assign(new Error(message), { code: 'IMPORT_REVIEW_OCR_GENERATION_INVALID', status: 409 })
}

export function validateOcrConfirmationRevision(value) {
  if (!value || typeof value.baseRevisionId !== 'string' || !value.baseRevisionId.trim()
    || !/^sha256:[a-f0-9]{64}$/u.test(value.baseConfirmationDigest || '')
    || !Array.isArray(value.entries) || !value.entries.length) revisionInvalid('Invalid OCR text revision declaration')
  const seen = new Set()
  for (const entry of value.entries) {
    if (!Number.isInteger(entry?.page) || entry.page < 1
      || typeof entry.itemId !== 'string' || !entry.itemId.trim() || seen.has(entry.itemId)
      || typeof entry.before !== 'string' || typeof entry.after !== 'string' || !entry.after.trim()
      || entry.before === entry.after || typeof entry.basis !== 'string' || !entry.basis.trim()) {
      revisionInvalid('OCR revision entries require unique items, exact before/after text and source basis')
    }
    seen.add(entry.itemId)
  }
  return structuredClone(value)
}

// Derive from the immutable original receipt, including after its revision is superseded.
export function deriveOcrConfirmationRevision(manifest, base) {
  const declaration = validateOcrConfirmationRevision(manifest.confirmationRevision)
  const receipt = base?.approval, confirmation = receipt?.confirmation
  if (declaration.baseRevisionId !== manifest.expectedBaseRevisionId || base?.id !== declaration.baseRevisionId
    || receipt?.schemaVersion !== 'web-import-ocr-review-confirmation-v1' || !receipt.confirmationId
    || receipt.revisionId !== base.id || receipt.bundleDigest !== base.bundleDigest
    || !confirmation?.confirmed || digestJson(confirmation) !== declaration.baseConfirmationDigest
    || [receipt, confirmation, base.manifest].some(value => value?.paperId !== manifest.paperId
      || value.sourceSetDigest !== manifest.sourceSetDigest || value.evidenceDigest !== manifest.evidenceDigest)) {
    revisionInvalid('OCR text revision does not match its original confirmation receipt')
  }
  const expected = structuredClone(confirmation)
  for (const entry of declaration.entries) {
    const matches = expected.documents.flatMap(document => document.pages
      .flatMap(page => page.orderedItems.map(item => ({ page: page.page, item }))))
      .filter(({ item }) => item.itemId === entry.itemId)
    if (matches.length !== 1 || matches[0].page !== entry.page || matches[0].item.text !== entry.before) {
      revisionInvalid('OCR revision before text or page does not match the confirmed item')
    }
    matches[0].item.text = entry.after
  }
  return expected
}

export function assertOcrConfirmationRevision(confirmation, expected) {
  if (expected && digestJson(confirmation) !== digestJson(expected)) {
    revisionInvalid('OCR confirmation must contain exactly the declared text replacements')
  }
}

export function ocrConfirmationComputation(projection, input, reviewerKind, expectedConfirmation = null) {
  assertOcrConfirmationRevision(input?.confirmation, expectedConfirmation)
  const confirmation = validateNck1OcrReviewConfirmation(projection, input?.confirmation)
  const correctionReport = reviewerKind === 'import_agent'
    ? buildAgentOcrCorrectionReport(projection, confirmation, input?.correctionNotes)
    : null
  return { confirmation, correctionReport }
}
