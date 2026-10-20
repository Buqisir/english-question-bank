import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { computeReviewBuildIdentity } from './reviewBuildIdentity.mjs'
import { reviewCompatibilityAttempts, prepareReviewCompatibilityWrite } from './reviewCompatibilityWrite.mjs'

try {
  const { targetBuildId, releaseRoot, metrics, files } = computeReviewBuildIdentity()
  const output = { targetBuildId, releaseRoot, metrics, paths: files.map(file => file.repoRelativePosixPath) }
  const request = workerData?.prepareWrite
  if (request?.expectedTargetBuildId === targetBuildId) {
    const db = new DatabaseSync(request.dbPath, { readOnly: true })
    try {
      db.exec('PRAGMA busy_timeout = 5000')
      output.previous = reviewCompatibilityAttempts(db, request.revision.id, targetBuildId)
    } finally { db.close() }
    output.writePlan = prepareReviewCompatibilityWrite(request.revision, request.subject, output.previous,
      request.baseline, request.comparison)
  }
  parentPort.postMessage(output)
} catch (error) {
  parentPort.postMessage({ error: error.message, code: error.code || 'REVIEW_TARGET_IDENTITY_INVALID', reasonCode: error.reasonCode })
}
