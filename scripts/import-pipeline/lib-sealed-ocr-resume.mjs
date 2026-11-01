import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { ocrReviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'

// Read-only reconciliation. Never infer a finished step from a local receipt
// alone, and never turn an inconsistent sealed generation into a new upload.
export async function reuseSealedOcrConfirmation({ paperId, paperDir, proofreadInputPath, loadProjection, readRemote }) {
  const receiptPath = path.join(paperDir, 'signals/agent-proofreading-receipt.json')
  const confirmationPath = path.join(paperDir, 'materialization/nck1-ocr-source-confirmation-v1.json')
  const hasReceipt = existsSync(receiptPath), hasConfirmation = existsSync(confirmationPath)
  if (!hasReceipt || !hasConfirmation) {
    const stop = (code, message, cause) => {
      throw Object.assign(new Error(`Sealed OCR differs: ${message}`, { cause }), { code })
    }
    const unknown = cause => stop('SEALED_OCR_REMOTE_UNKNOWN',
      `远端 OCR 状态不明，停止上传。先只读运行 node scripts/import-pipeline/review.mjs status ${paperId} 对账。`, cause)
    const noPaper = Symbol('typed-paper-not-found')
    let status
    try {
      // The CLI maps only the API's typed IMPORT_REVIEW_NOT_FOUND 404 to
      // this sentinel. A 200/null response is still unknown, never absence.
      status = await readRemote(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
        { allowNotFound: true, notFoundValue: noPaper })
    } catch (error) { unknown(error) }
    if (status !== noPaper) {
      if (status?.paperId !== paperId || !Array.isArray(status.revisions)
        || status.revisions.some(item => !item || item.paperId !== paperId
          || typeof item.id !== 'string' || !item.id || typeof item.state !== 'string'
          || !['ocr', 'candidate'].includes(item.reviewKind))) unknown()
      const latest = status.revisions.find(item => item.id === status.latestRevisionId)
      if (status.revisions.length
        ? !latest || status.latest?.id !== latest.id || status.latest?.reviewKind !== latest.reviewKind
        : status.latestRevisionId !== null || status.latest !== null) unknown()
      const ocr = status.revisions.find(item => item.reviewKind === 'ocr')
      if (ocr) {
        if (ocr.state === 'approved') stop('SEALED_OCR_PULL_REQUIRED',
          `远端已有 approved OCR ${ocr.id}，停止上传。先运行 node scripts/import-pipeline/review.mjs pull-ocr-confirmation ${paperId} --revision ${ocr.id}，再续跑。`)
        stop('SEALED_OCR_RECONCILIATION_REQUIRED',
          `远端已有 OCR ${ocr.id}（${ocr.state}），停止上传。保留证据并先只读对账，不要重新 push-ocr。`)
      }
    }
    if (hasReceipt || hasConfirmation) stop('SEALED_OCR_LOCAL_INCOMPLETE',
      '本地 OCR 收据或确认安装不完整；停止上传，保留现有文件并人工对账。')
    return { reused: false }
  }
  const fail = () => { throw new Error('Sealed OCR differs or is incomplete; preserve evidence and reconcile before push-ocr') }
  if (!existsSync(receiptPath) || !existsSync(confirmationPath) || !existsSync(proofreadInputPath)) fail()
  const read = file => JSON.parse(readFileSync(file, 'utf8'))
  const receipt = read(receiptPath), confirmation = read(confirmationPath), input = read(proofreadInputPath)
  if (!receipt.revisionId || !receipt.confirmationId || receipt.paperId !== paperId
    || receipt.schemaVersion !== 'web-import-ocr-review-confirmation-v1'
    || receipt.reviewerKind !== 'import_agent' || confirmation.confirmed !== true) fail()
  const projection = await loadProjection()
  const status = await readRemote(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`)
  const revision = status.revisions?.find(item => item.id === receipt.revisionId)
    || (status.latest?.id === receipt.revisionId ? status.latest : null)
  const supersededByCandidate = revision?.state === 'superseded' && status.revisions?.some(item =>
    item.paperId === paperId && item.reviewKind === 'candidate' && item.finalizedAt
    && item.state !== 'uploading' && item.revisionNumber > revision.revisionNumber)
    && !status.revisions.some(item => item.paperId === paperId && item.reviewKind === 'ocr'
      && item.finalizedAt && item.revisionNumber > revision.revisionNumber)
  if (!revision || revision.paperId !== paperId || revision.reviewKind !== 'ocr'
    || (revision.state !== 'approved' && !supersededByCandidate) || !revision.finalizedAt
    || revision.bundleDigest !== receipt.bundleDigest || revision.manifest?.paperId !== paperId
    || ocrReviewBundleDigest(revision.manifest) !== receipt.bundleDigest) fail()
  const remote = await readRemote(`/api/import-agent-reviews/revisions/${encodeURIComponent(receipt.revisionId)}/ocr-confirmation`)
  if (digestJson(remote.receipt) !== digestJson(receipt)
    || digestJson(remote.confirmation) !== digestJson(confirmation)
    || digestJson(receipt.confirmation) !== digestJson(confirmation)
    || digestJson(input.confirmation) !== digestJson(confirmation)) fail()
  for (const key of ['sourceSetDigest', 'evidenceDigest']) {
    if (typeof projection[key] !== 'string' || !projection[key].startsWith('sha256:')
      || [receipt, confirmation, revision.manifest].some(value => value[key] !== projection[key])) fail()
  }
  return { reused: true, revisionId: receipt.revisionId, confirmationId: receipt.confirmationId }
}
