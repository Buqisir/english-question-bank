import { digestJson, stableStringify as json } from '../../shared/paper-canonical/stable.mjs'
import { REVIEW_COMPONENTS, REVIEW_SUBJECT_VERSION, validateReviewSubject } from './reviewSubject.mjs'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'

const error = code => Object.assign(new Error(code), { code })
const now = () => new Date().toISOString()
const subjectInsert = `INSERT INTO review_subject
  (revision_id, subject_version, origin, source_renderer_build_id, bundle_digest,
   identity_digest, consumer_digest, sidecar_digest, media_digest, products_digest, inventory_digest,
   subject_digest, subject_json, provenance_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
const compatibilityInsert = `INSERT INTO review_compatibility
  (revision_id, target_build_id, comparator_version, attempt_no, subject_digest, bundle_digest,
   result, reason_code, evidence_digest, evidence_json, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

export function checkedStoredReviewSubject(row) {
  if (!row) return null
  const subject = JSON.parse(row.subject_json)
  const checked = validateReviewSubject(subject)
  if (!checked.ok || checked.subjectDigest !== row.subject_digest
    || subject.revisionId !== row.revision_id || subject.bundleDigest !== row.bundle_digest
    || subject.sourceRendererBuildId !== row.source_renderer_build_id
    || REVIEW_COMPONENTS.some(key => digestJson(subject.components[key]) !== row[`${key}_digest`])) {
    throw error('BASELINE_UNTRUSTED')
  }
  return { row, subject }
}

export function reviewCompatibilityAttempts(db, revisionId, targetBuildId) {
  return db.prepare(`SELECT * FROM review_compatibility
    WHERE revision_id = ? AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC`)
    .all(revisionId, targetBuildId, REVIEW_COMPARATOR_VERSION)
}

// Pure preparation: the compatibility commit path calls this inside the
// identity worker. Finalize uses the identical policy in its original transaction.
export function prepareReviewCompatibilityWrite(revision, subjectRow, previous, baseline, comparison) {
  if (!/^sha256:[a-f0-9]{64}$/.test(comparison.targetBuildId || '')
    || !['equal', 'different', 'unknown'].includes(comparison.result)) throw error('REVIEW_RESULT_INVALID')
  const plan = { subjectValues: null, compatibilityValues: null, outcome: null }
  let existing
  try { existing = checkedStoredReviewSubject(subjectRow) }
  catch {
    existing = subjectRow ? { row: subjectRow, subject: null } : null
    baseline = null
    comparison = { ...comparison, result: 'unknown', reasonCode: 'BASELINE_UNTRUSTED' }
  }
  if (baseline?.ok) {
    const checked = validateReviewSubject(baseline.subject)
    if (!checked.ok || checked.subjectDigest !== baseline.subjectDigest
      || baseline.subject.revisionId !== revision.id || baseline.subject.bundleDigest !== revision.bundleDigest
      || baseline.subject.sourceRendererBuildId !== revision.rendererBuildId) throw error('BASELINE_UNTRUSTED')
    if (existing && json(existing.subject) !== json(baseline.subject)) {
      comparison = { ...comparison, result: 'unknown', reasonCode: 'BASELINE_UNTRUSTED' }
    } else if (!existing) {
      plan.subjectValues = [
        revision.id, REVIEW_SUBJECT_VERSION, baseline.origin, revision.rendererBuildId, revision.bundleDigest,
        ...REVIEW_COMPONENTS.map(key => digestJson(baseline.subject.components[key])),
        checked.subjectDigest, json(baseline.subject), json(baseline.provenance), now(),
      ]
      existing = { row: { subject_digest: checked.subjectDigest }, subject: baseline.subject }
    }
  }
  const terminal = previous.find(row => row.result !== 'unknown')
  const subjectDigest = existing?.row.subject_digest ?? null
  if (comparison.result === 'equal' && (!subjectDigest || comparison.subjectDigest !== subjectDigest)) {
    throw error('BASELINE_UNTRUSTED')
  }
  if (terminal) {
    if (comparison.result === 'unknown' && ['WORKER_TIMEOUT', 'WORKER_OOM', 'WORKER_EXIT',
      'IO_ERROR', 'COMPUTATION_FAILED', 'TARGET_COMPUTATION_FAILED'].includes(comparison.reasonCode)) {
      plan.outcome = { appended: false, attemptNo: previous[0].attempt_no }
      return plan
    }
    if (comparison.result === terminal.result && subjectDigest === terminal.subject_digest
      && !previous.some(row => ['TERMINAL_INTEGRITY_CONFLICT', 'BASELINE_UNTRUSTED'].includes(row.reason_code))) {
      plan.outcome = { appended: false, attemptNo: terminal.attempt_no }
      return plan
    }
    comparison = { ...comparison, result: 'unknown', reasonCode: 'TERMINAL_INTEGRITY_CONFLICT' }
  }
  const attemptNo = (previous[0]?.attempt_no ?? 0) + 1
  const evidence = {
    result: comparison.result, reasonCode: comparison.reasonCode,
    componentDigests: comparison.componentDigests || {}, differences: comparison.differences || [],
    metrics: comparison.metrics || {}, publicationMappingVersion: 'review-publication-content-v1',
  }
  plan.compatibilityValues = [
    revision.id, comparison.targetBuildId, REVIEW_COMPARATOR_VERSION, attemptNo, subjectDigest,
    revision.bundleDigest, comparison.result, comparison.reasonCode, digestJson(evidence), json(evidence), now(),
  ]
  plan.outcome = { appended: true, attemptNo }
  return plan
}

// Internal trusted plan only. Callers retain job/result provenance and recheck
// the complete raw snapshot AND attempt rows under BEGIN IMMEDIATE before this.
export function applyReviewCompatibilityWrite(db, plan) {
  if (!db.isTransaction) throw error('REVIEW_TRANSACTION_REQUIRED')
  if (plan.subjectValues) db.prepare(subjectInsert).run(...plan.subjectValues)
  if (plan.compatibilityValues) db.prepare(compatibilityInsert).run(...plan.compatibilityValues)
  return plan.outcome
}
