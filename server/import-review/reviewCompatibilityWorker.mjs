import { computeSealedReviewSubjects } from './revisionProjection.mjs'
import { compareReviewSubjects, REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import { computeReviewBuildIdentity } from './reviewBuildIdentity.mjs'
import { extractStoredReviewBaseline } from './reviewSubjectBackfill.mjs'
import { storedReviewRevision } from './reviewCompatibilityStore.mjs'
import { prepareReviewCompatibilityWrite } from './reviewCompatibilityWrite.mjs'
import { reviewBackfillDiagnostic } from './reviewBackfillDiagnostic.mjs'

const workerData = await new Promise(resolve => process.once('message', resolve))
const samples = []
const sampleMemory = stage => samples.push({ stage, ...process.memoryUsage() })
const send = output => {
  sampleMemory('complete')
  output.comparison.metrics = { ...output.comparison.metrics, memoryStages: samples,
    processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024 }
  process.send(output, () => process.disconnect())
}
const started = performance.now()
sampleMemory('start')
let executionIdentity = null
try {
  const { targetBuildId, storedSubjectJson, ...input } = workerData
  const actual = computeReviewBuildIdentity({ workerModuleUrl: import.meta.url })
  sampleMemory('identity')
  executionIdentity = { targetBuildId: actual.targetBuildId, releaseRoot: actual.releaseRoot }
  if (targetBuildId !== actual.targetBuildId) {
    throw Object.assign(new Error('Worker identity differs from requested target'), { reasonCode: 'TARGET_IDENTITY_MISMATCH' })
  }
  if (workerData.mode === 'backfill') {
    const baseline = extractStoredReviewBaseline(workerData.value, workerData.directory)
    const comparison = { result: 'unknown', reasonCode: 'BACKFILL_PENDING', targetBuildId,
      subjectDigest: baseline.subjectDigest }
    const writePlan = prepareReviewCompatibilityWrite(storedReviewRevision(workerData.value.revision),
      null, workerData.previous, baseline, comparison)
    if (!writePlan.subjectValues || workerData.previous.some(row => row.result !== 'unknown')) {
      throw Object.assign(new Error('Untrusted historical baseline'), { reasonCode: 'BASELINE_UNTRUSTED' })
    }
    if (computeReviewBuildIdentity({ workerModuleUrl: import.meta.url }).targetBuildId !== targetBuildId) {
      throw Object.assign(new Error('Executing release changed'), { reasonCode: 'TARGET_CHANGED' })
    }
    send({ baseline, comparison, executionIdentity, writePlan })
  } else {
    let storedSubject = null
    if (!storedSubjectJson) {
      throw Object.assign(new Error('Original content subject is missing'), { reasonCode: 'MISSING_BASELINE' })
    }
    try { storedSubject = JSON.parse(storedSubjectJson) }
    catch { throw Object.assign(new Error('Invalid stored subject JSON'), { reasonCode: 'BASELINE_UNTRUSTED' }) }
    const { baseline, target } = computeSealedReviewSubjects({ ...input, onMemory: sampleMemory })
    if (computeReviewBuildIdentity({ workerModuleUrl: import.meta.url }).targetBuildId !== actual.targetBuildId) {
      throw Object.assign(new Error('Executing release changed during computation'), { reasonCode: 'TARGET_CHANGED' })
    }
    sampleMemory('subjects')
    const comparison = compareReviewSubjects({ baseline, target, targetBuildId, storedSubject })
    comparison.metrics = { ...comparison.metrics, elapsedMs: performance.now() - started,
      heapUsedBytes: process.memoryUsage().heapUsed }
    send({ baseline: baseline?.ok ? baseline : null, comparison, executionIdentity })
  }
} catch (error) {
  send({ baseline: null, executionIdentity, comparison: {
    result: 'unknown', reasonCode: error.reasonCode || (error.code === 'LISTENING_REVIEW_INVALID'
      ? error.code : error.code === 'REVIEW_TARGET_IDENTITY_INVALID'
      ? 'TARGET_IDENTITY_INVALID' : error.code?.startsWith('E') ? 'IO_ERROR' : 'COMPUTATION_FAILED'),
    subjectDigest: null, targetBuildId: executionIdentity?.targetBuildId ?? null,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: error.pointer ? [error.pointer] : [],
    diagnostic: reviewBackfillDiagnostic(error), metrics: { elapsedMs: performance.now() - started },
  } })
}
