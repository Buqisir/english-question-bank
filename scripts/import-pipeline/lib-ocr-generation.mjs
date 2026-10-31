import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { ocrReviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import { deriveOcrConfirmationRevision, assertOcrConfirmationRevision } from '../../server/import-review/finalizeComputation.mjs'

function stop(message) {
  throw Object.assign(new Error(`OCR_GENERATION_RECONCILIATION_REQUIRED: ${message}`),
    { code: 'OCR_GENERATION_RECONCILIATION_REQUIRED' })
}

// Inspection only. A plan records intent; it never substitutes for the server's
// register/finalize CAS, the exact new revision confirmation or local locks.
export async function planOcrGeneration({ paperId, origin, projection, proofreadInput, confirmationRevision, bundleManifest, reason, readRemote }) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) stop('补证理由不能为空且不得超过 2000 字')
  const status = await readRemote(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`)
  if (status?.paperId !== paperId || !Array.isArray(status.revisions) || status.promotion) stop('远端状态不明或已有发布事务')
  const base = status.revisions.find(item => item.id === status.latestRevisionId)
  if (!base || status.latest?.id !== base.id || status.latest?.state !== base.state
    || status.latest?.reviewKind !== 'ocr' || base.paperId !== paperId || base.reviewKind !== 'ocr'
    || base.state !== 'approved' || !base.finalizedAt
    || status.revisions.some(item => item.paperId !== paperId || item.reviewKind !== 'ocr'
      || (item.id !== base.id && item.state !== 'superseded'))
    || base.manifest?.paperId !== paperId || ocrReviewBundleDigest(base.manifest) !== base.bundleDigest) {
    stop('必须是当前 approved OCR，且无 Candidate、上传中或未知修订')
  }
  const remote = await readRemote(`/api/import-agent-reviews/revisions/${encodeURIComponent(base.id)}/ocr-confirmation`)
  const { receipt, confirmation } = remote || {}
  if (receipt?.schemaVersion !== 'web-import-ocr-review-confirmation-v1'
    || receipt.paperId !== paperId || receipt.revisionId !== base.id || !receipt.confirmationId
    || receipt.bundleDigest !== base.bundleDigest || confirmation?.confirmed !== true
    || digestJson(receipt.confirmation) !== digestJson(confirmation)
    || [receipt, confirmation].some(item => item.paperId !== paperId
      || item.sourceSetDigest !== base.manifest.sourceSetDigest || item.evidenceDigest !== base.manifest.evidenceDigest)) {
    stop('旧 OCR 回执与确认不完整或身份不符')
  }
  for (const key of ['sourceSetDigest', 'evidenceDigest', 'reviewStructureDigest']) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(projection[key] || '')) stop('新 OCR 投影摘要不完整')
  }
  if (projection.paperId !== paperId || projection.sourceSetDigest !== base.manifest.sourceSetDigest
    || (projection.evidenceDigest === base.manifest.evidenceDigest && !confirmationRevision)
    || proofreadInput?.confirmation?.paperId !== paperId
    || proofreadInput.confirmation.sourceSetDigest !== projection.sourceSetDigest
    || proofreadInput.confirmation.evidenceDigest !== projection.evidenceDigest) {
    stop('必须保持原 source bytes、改变 evidence，并重新编译该代 proofread input')
  }
  if (confirmationRevision) {
    try {
      assertOcrConfirmationRevision(proofreadInput.confirmation, deriveOcrConfirmationRevision({
        ...projection, expectedBaseRevisionId: base.id, confirmationRevision,
      }, { ...base, approval: receipt }))
    } catch (error) { stop(error.message) }
    if (!bundleManifest) stop('文字修订计划缺少新 bundle manifest')
  }
  return {
    schemaVersion: 'fast-ocr-generation-plan-v1', paperId, origin,
    expectedBaseRevisionId: base.id, baseBundleDigest: base.bundleDigest,
    baseConfirmationId: receipt.confirmationId, baseConfirmationDigest: digestJson(confirmation),
    baseReceiptDigest: digestJson(receipt), baseEvidenceDigest: base.manifest.evidenceDigest,
    sourceSetDigest: projection.sourceSetDigest, evidenceDigest: projection.evidenceDigest,
    reviewStructureDigest: projection.reviewStructureDigest, proofreadInputDigest: digestJson(proofreadInput),
    ...(confirmationRevision ? { confirmationRevision,
      bundleDigest: ocrReviewBundleDigest({ ...bundleManifest, expectedBaseRevisionId: base.id, confirmationRevision }) } : {}),
    reason: reason.trim(),
  }
}

export async function checkOcrGenerationPlan(plan, context) {
  if (plan?.schemaVersion !== 'fast-ocr-generation-plan-v1') stop('缺少显式新代计划')
  const current = await planOcrGeneration({ ...context, reason: plan.reason })
  if (digestJson(current) !== digestJson(plan)) stop('计划绑定已漂移；保留原计划并只读对账')
  return plan
}
