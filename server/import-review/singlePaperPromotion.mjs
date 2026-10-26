import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  createFileSystemCanonicalPublicationStore,
  loadCanonicalOnlyConsumers,
} from '../paper-canonical/publication.mjs'
import {
  materializeNck1CanonicalRequest,
} from '../paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  publishUniversalNck1Import,
  recoverInterruptedPaperImportPublish,
} from '../paper-import/publisher.mjs'
import {
  assertPaperImportAnalysisSidecars,
  assertPaperImportParagraphSummaries,
  assertPaperImportPublicSearchMetadata,
  assertPaperImportPaginationPlan,
  assertPaperImportSourceReferences,
} from '../paper-import/storage.mjs'
import { buildProductPreviewPayload } from './reviewSubject.mjs'
import { reviewProjectionForTrustedBaseline } from './reviewComparisonProjection.mjs'
import { reviewContentDifferences } from './reviewCompatibility.mjs'
import { inspectSealedReviewFiles } from './sealedReviewFiles.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { PAPER_PAGINATION_PLAN_FILE_NAME } from '../paper-import/paginationPlan.mjs'
import { readSourceReferencePublication } from '../paper-import/sourceReferencePublication.mjs'
import { readPublishedProducts } from '../paper-import/frozenProducts.mjs'
import { archiveReviewFiles, configuredBlobStore } from '../paper-import/blobStore.mjs'
import {
  buildNck1CompatibilityPackage,
  buildNck1SealedReviewProjection,
} from './revisionProjection.mjs'

function promotionError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function tableExists(db, name) {
  return Boolean(db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name))
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    throw promotionError('IMPORT_REVIEW_PROMOTION_ARTIFACT_MISSING', `${label} is missing`)
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw promotionError('IMPORT_REVIEW_PROMOTION_ARTIFACT_INVALID', `${label} is invalid`)
  }
}

// This is evidence for reconciling an existing target, never a new publish
// package. It uses the original preview/subject and exact sealed bytes only.
function originalPromotionEvidence(store, revision) {
  let original
  try { original = store.originalReviewEvidenceForRevision(revision.id) } catch (error) {
    const compatibility = store.compatibilityForRevision(revision.id)
    if (!compatibility.fallback || !compatibility.eligible) throw error
    // The pre-fix reconciliation path derives the package from the sealed
    // revision only after the old renderer/file/projection guards pass.
    const { projection } = store.projectionForRevision(revision.id)
    return buildNck1CompatibilityPackage({
      config: projection.config, manifest: projection.manifest,
      materialization: projection.materialization, sourceProvenance: projection.sourceProvenance,
      sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion,
      analysisSidecars: projection.analysisSidecars, paragraphSummariesBytes: projection.paragraphSummariesBytes,
      publicSearchMetadataBytes: projection.publicSearchMetadataBytes, sourceReferencesBytes: projection.sourceReferencesBytes,
      frozenProducts: projection.frozenProducts, paginationPlan: projection.paginationPlan,
      paginationBindingIdentity: projection,
    })
  }
  const { preview, subject } = original
  const bytes = relativePath => {
    const file = revision.manifest.files.find(file => file.path === relativePath)
    if (!file) return null
    const value = readFileSync(store.verifiedFileForRead(revision.id, relativePath).filePath)
    if (value.length !== file.byteLength || sha256(value) !== file.sha256) {
      throw promotionError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', 'Original promotion evidence changed')
    }
    return value
  }
  const planBytes = bytes(PAPER_PAGINATION_PLAN_FILE_NAME)
  const paginationPlan = planBytes ? JSON.parse(planBytes) : null
  return {
    paperAsset: preview.paperAsset,
    ...Object.fromEntries([
      ['readingAnalysis', 'reading-choice-analysis-v1.json'],
      ['scAnalysis', 'seven-choices-analysis-v1.json'],
      ['clozeAnalysis', 'cloze-analysis-v1.json'],
      ['grammarFillAnalysis', 'grammar-fill-analysis-v1.json'],
      ['writingAnalysis', 'writing-analysis-v1.json'],
      ['listeningAnalysis', 'listening-analysis-v1.json'],
    ].map(([key, file]) => [key, preview.analysisSidecars[file] || null])),
    paragraphSummariesBytes: bytes('paragraph-summaries-v1.json'),
    publicSearchMetadataBytes: bytes('public-search-metadata-v1.json'),
    sourceReferencesBytes: bytes('source-references-v1.json'),
    frozenProducts: subject.components.products?.manifestFile
      ? { digest: subject.components.products.manifestFile.sha256 } : null,
    paginationPlan,
    paginationPlanBinding: {
      schemaVersion: 'paper-pagination-binding-v1', paperId: revision.paperId,
      sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
      canonicalSourceDigest: null, planDigest: paginationPlan ? digestJson(paginationPlan) : null,
    },
  }
}

function inspectCommittedPromotion({ db, paperAssetsDir, promotion, packageData }) {
  if (
    promotion.assetVersion === null
    || !promotion.versionName
    || !promotion.canonicalPublicationDigest
  ) return null
  if (
    !tableExists(db, 'canonical_paper_publications')
    || !tableExists(db, 'paper_asset_versions')
  ) return null
  const canonical = db.prepare(`
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
  `).get(promotion.paperId)
  if (!canonical) return null
  const expected = {
    paperId: promotion.paperId,
    versionName: promotion.versionName,
    sourceAssetVersion: promotion.assetVersion,
    publicationDigest: promotion.canonicalPublicationDigest,
  }
  if (
    canonical.paper_id !== expected.paperId
    || canonical.version_name !== expected.versionName
    || Number(canonical.source_asset_version) !== expected.sourceAssetVersion
    || canonical.publication_digest !== expected.publicationDigest
  ) {
    const target = db.prepare(`
      SELECT status FROM paper_asset_versions
      WHERE paper_id = ? AND asset_version = ?
    `).get(promotion.paperId, promotion.assetVersion)
    if (target) {
      throw promotionError(
        'IMPORT_REVIEW_PROMOTION_COMMITTED_IDENTITY_CONFLICT',
        'Promotion target exists but is not the exact Canonical current publication',
      )
    }
    return null
  }
  const asset = db.prepare(`
    SELECT asset_version, version_name, status
    FROM paper_asset_versions
    WHERE paper_id = ? AND asset_version = ?
  `).get(promotion.paperId, promotion.assetVersion)
  if (
    !asset
    || Number(asset.asset_version) !== promotion.assetVersion
    || asset.version_name !== promotion.versionName
    || asset.status !== 'published'
  ) {
    throw promotionError(
      'IMPORT_REVIEW_PROMOTION_ASSET_IDENTITY_CONFLICT',
      'Canonical current publication has no matching published paper asset',
    )
  }
  const versionDir = path.join(
    paperAssetsDir,
    promotion.paperId,
    'versions',
    promotion.versionName,
  )
  const latestDir = path.join(paperAssetsDir, promotion.paperId, 'latest')
  const versionPublicationDigest = promotion.importProfile
    ? assertPaperImportPublicSearchMetadata({ baseDir: versionDir, packageData })
    : assertPaperImportAnalysisSidecars({
        baseDir: versionDir,
        packageData,
        version: promotion.assetVersion,
      })
  const latestPublicationDigest = promotion.importProfile
    ? assertPaperImportPublicSearchMetadata({ baseDir: latestDir, packageData })
    : assertPaperImportAnalysisSidecars({
        baseDir: latestDir,
        packageData,
        version: promotion.assetVersion,
      })
  const versionPlanDigest = assertPaperImportPaginationPlan({ baseDir: versionDir, packageData })
  const latestPlanDigest = assertPaperImportPaginationPlan({ baseDir: latestDir, packageData })
  if (versionPlanDigest !== latestPlanDigest) {
    throw promotionError(
      'IMPORT_REVIEW_PROMOTION_PAGINATION_IDENTITY_CONFLICT',
      'Version and latest pagination plans disagree',
    )
  }
  if (versionPublicationDigest !== latestPublicationDigest) {
    throw promotionError(
      'IMPORT_REVIEW_PROMOTION_ARTIFACT_IDENTITY_CONFLICT',
      'Version and latest publication artifact digests disagree',
    )
  }
  const latestAsset = readJson(path.join(latestDir, 'paper-asset.json'), 'latest paper asset')
  if (
    latestAsset?.paper?.paperId !== promotion.paperId
    || Number(latestAsset?.paper?.assetVersion) !== promotion.assetVersion
  ) {
    throw promotionError(
      'IMPORT_REVIEW_PROMOTION_ASSET_IDENTITY_CONFLICT',
      'Latest paper asset differs from the promotion target',
    )
  }
  const consumers = loadCanonicalOnlyConsumers({
    ref: expected,
    store: createFileSystemCanonicalPublicationStore({ rootDir: paperAssetsDir, db }),
  })
  const products = readPublishedProducts({ db, paperAssetsDir, consumption: Object.values(consumers)[0],
    required: Boolean(packageData.frozenProducts) })
  if (products?.digest !== packageData.frozenProducts?.digest) {
    throw promotionError('IMPORT_REVIEW_PROMOTION_PRODUCT_CONFLICT', 'Published PDFs differ from the approved Review')
  }
  readSourceReferencePublication({ db, paperAssetsDir, consumption: Object.values(consumers)[0],
    expected: packageData.sourceReferencesBytes ? {
      approvalId: promotion.approvalId, revisionId: promotion.revisionId, bundleDigest: promotion.bundleDigest,
      sourceDigest: promotion.sourceDigest, candidateDigest: promotion.candidateDigest,
      sourceReferencesDigest: sha256(packageData.sourceReferencesBytes),
    } : null })
  assertPaperImportSourceReferences({ baseDir: versionDir, packageData })
  assertPaperImportSourceReferences({ baseDir: latestDir, packageData })
  return promotion.importProfile
    ? { paragraphSummariesPublicationDigest: versionPublicationDigest, consumers }
    : { analysisPublicationDigest: versionPublicationDigest, consumers }
}

function failureFromResult(result) {
  const diagnostic = result?.canonicalAdmission?.diagnostics?.[0]
    || result?.validation?.blockingIssues?.[0]
  return {
    failureCode: diagnostic?.code || `IMPORT_REVIEW_PROMOTION_${String(result?.status || 'FAILED').toUpperCase()}`,
    failureMessage: String(
      diagnostic?.message || `Single-paper publisher returned ${result?.status || 'failure'}`,
    ).slice(0, 1000),
  }
}

// End the complete projection/materialization activation before archiving or
// entering publisher. Only the second (or non-archiving) pass owns write inputs.
function preparePromotionContent({ store, paperId, promotion, revision, reviewRootDir, contentBinding, fileStorage }) {
  const projection = buildNck1SealedReviewProjection(reviewRootDir, revision, {
    requireAnalyses: true, expectedCandidateDigest: revision.candidateDigest,
  })
  const materialized = materializeNck1CanonicalRequest(projection.sourceInput, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: promotion.candidateDigest,
    sourceDigest: promotion.sourceDigest,
    confirmed: true,
  })
  const packageData = buildNck1CompatibilityPackage({
    config: projection.config,
    manifest: projection.manifest,
    materialization: projection.materialization,
    sourceProvenance: projection.sourceProvenance,
    sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion,
    analysisSidecars: projection.analysisSidecars,
    paragraphSummariesBytes: projection.paragraphSummariesBytes,
    publicSearchMetadataBytes: projection.publicSearchMetadataBytes,
    sourceReferencesBytes: projection.sourceReferencesBytes,
    frozenProducts: projection.frozenProducts,
    paginationPlan: projection.paginationPlan,
    paginationBindingIdentity: projection,
  })
  const context = store.withPromotionContentGuard(paperId, promotion.promotionId, contentBinding, value => {
    const differences = value.subject ? reviewContentDifferences(value.subject.components.consumer,
      buildProductPreviewPayload(revision, reviewProjectionForTrustedBaseline(value.subject, projection))).differences : []
    const evidence = inspectSealedReviewFiles(reviewRootDir, revision.manifest.files)
    const changed = evidence.find(file => {
      const expected = revision.manifest.files.find(item => item.path === file.path)
      return file.sha256 !== expected.sha256 || file.byteLength !== expected.byteLength
    })
    if (changed || differences.length) {
      const error = promotionError('IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', 'Projected content differs from the approved Review')
      error.reasonCode = changed ? 'SEALED_FILE_CHANGED' : 'SUBJECT_CHANGED'
      error.publicationNotWritten = true
      throw error
    }
    return value
  })
  const archiveRequired = Boolean(projection.frozenProducts && !fileStorage)
  if (archiveRequired) return { binding: context.binding, archiveRequired }
  return {
    context, archiveRequired, packageData, canonicalRequest: materialized.request,
    profileIdentity: projection.importProfile ? {
      importProfile: projection.importProfile,
      paragraphSummariesDigest: projection.paragraphSummariesDigest,
      publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
    } : {},
  }
}

export function createSinglePaperPromotionService({
  getStore,
  openDatabase,
  paperAssetsDir,
  publish = publishUniversalNck1Import,
  afterPublish = null,
  blobStore = null,
}) {
  function execute(paperId, begun, fileStorage = null, contentBinding = null) {
      contentBinding ||= begun.contentBinding
      const store = getStore()
      let promotion = begun.promotion
      if (begun.action === 'consumed') {
        return { status: promotion?.state || 'consumed', promotion }
      }
      const revision = store.getRevision(promotion.revisionId)
      if (
        revision.paperId !== paperId
        || revision.reviewKind !== 'candidate'
        || revision.state !== 'approved'
      ) {
        throw promotionError(
          'IMPORT_REVIEW_PROMOTION_STALE',
          'Promotion revision is no longer the exact approved Candidate',
        )
      }
      const reviewRootDir = store.revisionDirectory(revision.id)
      const db = openDatabase({ readOnly: false })
      try {
        const evidence = promotion.assetVersion !== null ? originalPromotionEvidence(store, revision) : null
        if (promotion.assetVersion !== null) {
          const recovery = recoverInterruptedPaperImportPublish({
            db,
            paperAssetsDir,
            paperId,
            validateCommittedAssets(targetVersion) {
              if (targetVersion !== promotion.assetVersion) {
                throw promotionError(
                  'IMPORT_REVIEW_PROMOTION_RECOVERY_TARGET_CONFLICT',
                  'Publisher journal target differs from the durable promotion target',
                )
              }
              for (const baseDir of [
                path.join(paperAssetsDir, paperId, 'versions', promotion.versionName),
                path.join(paperAssetsDir, paperId, 'latest'),
              ]) {
                if (promotion.importProfile) {
                  assertPaperImportParagraphSummaries({ baseDir, packageData: evidence })
                  assertPaperImportPublicSearchMetadata({ baseDir, packageData: evidence })
                } else {
                  assertPaperImportAnalysisSidecars({
                    baseDir,
                    packageData: evidence,
                    version: promotion.assetVersion,
                  })
                }
                assertPaperImportPaginationPlan({ baseDir, packageData: evidence })
                assertPaperImportSourceReferences({ baseDir, packageData: evidence })
              }
              // This runs before the publisher clears committed journal evidence.
              inspectCommittedPromotion({ db, paperAssetsDir, promotion, packageData: evidence })
            },
          })
          if (
            recovery.targetVersion !== undefined
            && recovery.targetVersion !== promotion.assetVersion
          ) {
            throw promotionError(
              'IMPORT_REVIEW_PROMOTION_RECOVERY_TARGET_CONFLICT',
              'Recovered publisher journal differs from the durable promotion target',
            )
          }
        }
        const committed = inspectCommittedPromotion({
          db,
          paperAssetsDir,
          promotion,
          packageData: evidence,
        })
        if (committed) {
          const receipt = store.markPromotionPublished(paperId, promotion.promotionId, committed)
          return { status: 'idempotent', promotion: receipt, consumers: committed.consumers }
        }
        // Reconciliation cannot authorize a new write. Require current content
        // eligibility before running any current projection or compiler.
        store.withPromotionContentGuard(paperId, promotion.promotionId, contentBinding, () => {})
        const { context, binding, archiveRequired, packageData, canonicalRequest, profileIdentity } = preparePromotionContent({
          store, paperId, promotion, revision, reviewRootDir, contentBinding, fileStorage,
        })
        const externalListeningReviewProof = store.mintExternalListeningPublicationProof(paperId, promotion)
        // The first context is captured before the asynchronous archive. A
        // second pass must match it exactly, including target and confirmations.
        if (archiveRequired) {
          return archiveReviewFiles({ rootDir: reviewRootDir, manifest: revision.manifest,
            blobStore: blobStore || configuredBlobStore() })
            .then(storage => execute(paperId, begun, storage, binding))
        }
        const result = publish({
          approvedReviewSubject: context.subject,
          legacyRendererBuildId: context.binding.guard === 'legacy_renderer' ? context.binding.rendererBuildId : null,
          withPreparedReviewSubject(snapshot, write) {
            return store.withPromotionContentGuard(paperId, promotion.promotionId, context.binding, current => {
              if (current.promotion.assetVersion !== snapshot.version
                || current.promotion.canonicalPublicationDigest !== snapshot.admission.sealed.manifest.publicationDigest
                || snapshot.reviewGuard !== (current.subject ? 'content_binding' : 'legacy_renderer')) {
                const error = promotionError('IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', 'Prepared publication target changed')
                error.reasonCode = 'CAS_CHANGED'
                throw error
              }
              return write()
            })
          },
          reviewRootDir,
          approvedManifest: revision.manifest,
          fileStorage,
          approvedIdentity: {
            ...promotion,
            rendererBuildId: revision.rendererBuildId,
            ...profileIdentity,
          },
          canonicalRequest,
          externalListeningReviewProof,
          db,
          paperAssetsDir,
          onPrepared(target) {
            promotion = store.recordPromotionTarget(
              paperId,
              promotion.promotionId,
              target,
            )
          },
        })
        if (!result.ok) {
          const failure = failureFromResult(result)
          const receipt = store.markPromotionFailed(
            paperId,
            promotion.promotionId,
            failure,
          )
          return { status: 'failed', promotion: receipt, failure }
        }
        if (afterPublish) afterPublish({ result, promotion })
        const committedAfterPublish = inspectCommittedPromotion({
          db,
          paperAssetsDir,
          promotion,
          packageData,
        })
        if (!committedAfterPublish) {
          throw promotionError(
            'IMPORT_REVIEW_PROMOTION_COMMIT_MISSING',
            'Publisher returned success without the exact committed promotion target',
          )
        }
        const receipt = store.markPromotionPublished(
          paperId,
          promotion.promotionId,
          committedAfterPublish,
        )
        return {
          status: result.status === 'idempotent' ? 'idempotent' : 'published',
          promotion: receipt,
          consumers: committedAfterPublish.consumers,
        }
      } catch (error) {
        // Only a comparator's explicit pre-write rejection proves this attempt
        // wrote no assets. Races, I/O failures and lost responses retain the
        // publishing state/guard for reconciliation.
        if (error.code === 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED' && error.publicationNotWritten === true) {
          try {
            store.markPromotionFailed(paperId, promotion.promotionId, {
              failureCode: error.reasonCode, failureMessage: error.message,
            })
          } catch {
            // Preserve both the original rejection and any still-held guard.
          }
        }
        throw error
      } finally {
        db.close()
      }
  }
  return {
    // Read-only, independent reconciliation. In particular this MUST NOT call
    // recoverInterruptedPaperImportPublish (which can mutate journal/files).
    inspectReceipt(paperId, promotionId) {
      const store = getStore()
      const promotion = store.operationPromotion(promotionId)
      if (!promotion || promotion.paperId !== paperId || promotion.state !== 'published') return null
      const revision = store.getRevision(promotion.revisionId)
      const db = openDatabase({ readOnly: true })
      try {
        const committed = inspectCommittedPromotion({ db, paperAssetsDir, promotion,
          packageData: originalPromotionEvidence(store, revision) })
        return committed ? { status: 'idempotent', promotion } : null
      } finally { db.close() }
    },
    promoteOwner(paperId, revisionId, input, actor, operation = null) {
      const store = getStore()
      const detail = store.paperDetail(paperId, { includeProjection: false })
      const revision = detail.latest
      if (input?.intent !== 'publish') {
        throw promotionError('IMPORT_REVIEW_PROMOTION_INTENT_INVALID', '请明确确认发布这份卷。', 400)
      }
      if (!revision || revision.id !== revisionId || revision.reviewKind !== 'candidate'
        || revision.bundleDigest !== input.bundleDigest
        || revision.rendererBuildId !== input.rendererBuildId) {
        throw promotionError('IMPORT_REVIEW_PROMOTION_STALE', '待审版本已变化，请刷新并查看当前版本。')
      }
      // A second click is a status read, never a recovery authorization. Keep
      // interrupted/failed attempts and their guards for explicit reconciliation.
      if (detail.promotion?.revisionId === revisionId) {
        return { status: detail.promotion.state, promotion: detail.promotion }
      }
      const approval = revision.approval || store.approveRevision(paperId, revisionId, {
        bundleDigest: input.bundleDigest,
        ...(revision.manifest.importProfile ? { approvalScope: 'layout_only' } : {}),
      }, actor)
      // Both calls are synchronous until the durable guard is acquired. The
      // store rechecks latest revision, content compatibility, approval and issues in its
      // transaction, including races with another process.
      return execute(paperId, store.beginPromotion(paperId, { ...approval, intent: 'ship' }, actor, operation))
    },
    promote(paperId, input, actor, operation = null) {
      const store = getStore()
      return execute(paperId, store.beginPromotion(paperId, input, actor, operation))
    },
    promoteScoped(paperId, requestId, secretHash, actor, operation = null) {
      const store = getStore()
      return execute(paperId, store.beginScopedPromotion(paperId, requestId, secretHash, actor, operation))
    },
  }
}
