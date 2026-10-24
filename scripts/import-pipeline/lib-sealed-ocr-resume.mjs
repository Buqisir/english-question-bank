import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { ocrReviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'

// Read-only reconciliation. Never infer a finished step from a local receipt
// alone, and never turn an inconsistent sealed generation into a new upload.
export async function reuseSealedOcrConfirmation({ paperId, paperDir, proofreadInputPath, loadProjection, readRemote }) {
  const receiptPath = path.join(paperDir, 'signals/agent-proofreading-receipt.json')
  const confirmationPath = path.join(paperDir, 'materialization/nck1-ocr-source-confirmation-v1.json')
  if (!existsSync(receiptPath) && !existsSync(confirmationPath)) return { reused: false }
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
  if (!revision || revision.paperId !== paperId || revision.reviewKind !== 'ocr'
    || revision.state !== 'approved' || !revision.finalizedAt
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
