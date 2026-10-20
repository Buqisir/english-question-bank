import { parentPort, workerData } from 'node:worker_threads'
import { computeSealedReviewSubjects } from './revisionProjection.mjs'
import { compareReviewSubjects, REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'

const started = performance.now()
try {
  const { targetBuildId, storedSubjectJson, ...input } = workerData
  let storedSubject = null
  if (storedSubjectJson) {
    try { storedSubject = JSON.parse(storedSubjectJson) }
    catch { throw Object.assign(new Error('Invalid stored subject JSON'), { reasonCode: 'BASELINE_UNTRUSTED' }) }
  }
  const { baseline, target } = computeSealedReviewSubjects(input)
  const comparison = compareReviewSubjects({ baseline, target, targetBuildId, storedSubject })
  comparison.metrics = { ...comparison.metrics, elapsedMs: performance.now() - started,
    heapUsedBytes: process.memoryUsage().heapUsed }
  parentPort.postMessage({ baseline: baseline?.ok ? baseline : null, comparison })
} catch (error) {
  parentPort.postMessage({ baseline: null, comparison: {
    result: 'unknown', reasonCode: error.reasonCode || (error.code?.startsWith('E') ? 'IO_ERROR' : 'COMPUTATION_FAILED'),
    subjectDigest: null, targetBuildId: workerData.targetBuildId,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: { elapsedMs: performance.now() - started },
  } })
}
