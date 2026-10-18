import { Worker } from 'node:worker_threads'
import { deserialize } from 'node:v8'
import { acquireRevisionUpload } from './reviewUploadLocks.mjs'

function workerError(code, message) {
  return Object.assign(new Error(message), { code, status: 500 })
}

export function restoreFinalizeError(error) {
  return Object.assign(new Error(error.message), error)
}

export async function runFinalizeWorker(directory, revision, {
  timeoutMs = 10 * 60 * 1000,
  onPhase = () => {},
} = {}) {
  // Reuse the existing FIFO lease mechanism: at most one finalize worker in
  // this server process, including when different revisions finalize together.
  const release = await acquireRevisionUpload('import-review-finalize-worker')
  let worker
  let timeout
  try {
    worker = new Worker(new URL('./finalizeWorker.mjs', import.meta.url), {
      workerData: { directory, revision: {
        reviewKind: revision.reviewKind,
        candidateDigest: revision.candidateDigest,
      } },
    })
    return await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(workerError(
        'IMPORT_REVIEW_FINALIZE_TIMEOUT', 'Revision finalization computation timed out',
      )), timeoutMs)
      worker.on('message', message => {
        try {
          if (message.phase) onPhase(message.phase)
          else if (message.error) reject(restoreFinalizeError(message.error))
          else {
            const bytes = message.bytes
            resolve(deserialize(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)))
          }
        } catch (error) { reject(error) }
      })
      worker.once('error', reject)
      worker.once('exit', code => reject(workerError(
        'IMPORT_REVIEW_FINALIZE_WORKER_EXIT', `Revision finalization worker exited without a result (${code})`,
      )))
    })
  } finally {
    clearTimeout(timeout)
    // Do not release the process-wide slot until a timed-out worker has stopped.
    try { await worker?.terminate() } finally { release() }
  }
}
