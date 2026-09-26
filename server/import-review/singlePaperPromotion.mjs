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
} from '../paper-import/storage.mjs'
import {
  buildNck1CompatibilityPackage,
  buildNck1ReviewProjection,
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

export function createSinglePaperPromotionService({
  getStore,
  openDatabase,
  paperAssetsDir,
  publish = publishUniversalNck1Import,
  afterPublish = null,
}) {
  function execute(paperId, begun) {
      const store = getStore()
      let promotion = begun.promotion
      if (begun.action === 'consumed') {
        return { status: promotion?.state || 'consumed', promotion }
      }
      const { revision } = store.projectionForRevision(promotion.revisionId)
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
      const projection = buildNck1ReviewProjection(reviewRootDir, { requireAnalyses: true })
      const confirmation = {
        schemaVersion: 'teacher-confirmation-v1',
        candidateDigest: promotion.candidateDigest,
        sourceDigest: promotion.sourceDigest,
        confirmed: true,
      }
      const materialized = materializeNck1CanonicalRequest(
        projection.sourceInput,
        confirmation,
      )
      const externalListeningReviewProof = store.mintExternalListeningPublicationProof(
        paperId,
        promotion,
      )
      const packageData = buildNck1CompatibilityPackage({
        config: projection.config,
        manifest: projection.manifest,
        materialization: projection.materialization,
        sourceProvenance: projection.sourceProvenance,
        sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion,
        analysisSidecars: projection.analysisSidecars,
        paragraphSummariesBytes: projection.paragraphSummariesBytes,
        publicSearchMetadataBytes: projection.publicSearchMetadataBytes,
        paginationPlan: projection.paginationPlan,
        paginationBindingIdentity: projection,
      })
      const db = openDatabase({ readOnly: false })
      try {
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
                if (projection.importProfile) {
                  assertPaperImportParagraphSummaries({ baseDir, packageData })
                  assertPaperImportPublicSearchMetadata({ baseDir, packageData })
                } else {
                  assertPaperImportAnalysisSidecars({
                    baseDir,
                    packageData,
                    version: promotion.assetVersion,
                  })
                }
                assertPaperImportPaginationPlan({ baseDir, packageData })
              }
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
          packageData,
        })
        if (committed) {
          const receipt = store.markPromotionPublished(paperId, promotion.promotionId, committed)
          return { status: 'idempotent', promotion: receipt, consumers: committed.consumers }
        }
        const result = publish({
          reviewRootDir,
          approvedIdentity: {
            ...promotion,
            ...(projection.importProfile
              ? {
                  importProfile: projection.importProfile,
                  paragraphSummariesDigest: projection.paragraphSummariesDigest,
                  publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
                }
              : {}),
          },
          canonicalRequest: materialized.request,
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
      } finally {
        db.close()
      }
  }
  return {
    promote(paperId, input, actor) {
      const store = getStore()
      return execute(paperId, store.beginPromotion(paperId, input, actor))
    },
    promoteScoped(paperId, requestId, secretHash, actor) {
      const store = getStore()
      return execute(paperId, store.beginScopedPromotion(paperId, requestId, secretHash, actor))
    },
  }
}
