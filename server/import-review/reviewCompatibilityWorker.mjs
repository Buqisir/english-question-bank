import { parentPort, workerData } from 'node:worker_threads'
import { computeSealedReviewSubjects } from './revisionProjection.mjs'
import { compareReviewSubjects, REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import { computeReviewBuildIdentity } from './reviewBuildIdentity.mjs'

const started = performance.now()
let executionIdentity = null
try {
  const { targetBuildId, storedSubjectJson, ...input } = workerData
  const actual = computeReviewBuildIdentity({ workerModuleUrl: import.meta.url })
  executionIdentity = { targetBuildId: actual.targetBuildId, releaseRoot: actual.releaseRoot }
  if (targetBuildId !== actual.targetBuildId) {
    throw Object.assign(new Error('Worker identity differs from requested target'), { reasonCode: 'TARGET_IDENTITY_MISMATCH' })
  }
  let storedSubject = null
  if (!storedSubjectJson) {
    throw Object.assign(new Error('Original content subject is missing'), { reasonCode: 'MISSING_BASELINE' })
  }
  if (storedSubjectJson) {
    try { storedSubject = JSON.parse(storedSubjectJson) }
    catch { throw Object.assign(new Error('Invalid stored subject JSON'), { reasonCode: 'BASELINE_UNTRUSTED' }) }
  }
  const { baseline, target } = computeSealedReviewSubjects(input)
  if (computeReviewBuildIdentity({ workerModuleUrl: import.meta.url }).targetBuildId !== actual.targetBuildId) {
    throw Object.assign(new Error('Executing release changed during computation'), { reasonCode: 'TARGET_CHANGED' })
  }
  const comparison = compareReviewSubjects({ baseline, target, targetBuildId, storedSubject })
  comparison.metrics = { ...comparison.metrics, elapsedMs: performance.now() - started,
    heapUsedBytes: process.memoryUsage().heapUsed }
  parentPort.postMessage({ baseline: baseline?.ok ? baseline : null, comparison, executionIdentity })
} catch (error) {
  parentPort.postMessage({ baseline: null, executionIdentity, comparison: {
    result: 'unknown', reasonCode: error.reasonCode || (error.code === 'REVIEW_TARGET_IDENTITY_INVALID'
      ? 'TARGET_IDENTITY_INVALID' : error.code?.startsWith('E') ? 'IO_ERROR' : 'COMPUTATION_FAILED'),
    subjectDigest: null, targetBuildId: executionIdentity?.targetBuildId ?? null,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: { elapsedMs: performance.now() - started },
  } })
}
