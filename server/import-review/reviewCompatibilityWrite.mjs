import { digestJson, stableStringify as json } from '../../shared/paper-canonical/stable.mjs'
import { REVIEW_COMPONENTS, REVIEW_SUBJECT_VERSION, validateReviewSubject } from './reviewSubject.mjs'

const error = code => Object.assign(new Error(code), { code })
const now = () => new Date().toISOString()
const subjectInsert = `INSERT INTO review_subject
  (revision_id, subject_version, origin, source_renderer_build_id, bundle_digest,
   identity_digest, consumer_digest, sidecar_digest, media_digest, products_digest, inventory_digest,
   subject_digest, subject_json, provenance_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

export function insertReviewSubject(db, revision, baseline) {
  if (!db.isTransaction) throw error('REVIEW_TRANSACTION_REQUIRED')
  if (!baseline?.ok) return
  const { subject } = baseline
  const checked = validateReviewSubject(subject)
  if (!checked.ok || checked.subjectDigest !== baseline.subjectDigest
    || subject.revisionId !== revision.id || subject.bundleDigest !== revision.bundleDigest
    || subject.sourceRendererBuildId !== revision.rendererBuildId) throw error('BASELINE_UNTRUSTED')
  const existing = checkedStoredReviewSubject(db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revision.id))
  if (existing) {
    if (json(existing.subject) !== json(subject)) throw error('BASELINE_UNTRUSTED')
    return
  }
  db.prepare(subjectInsert).run(
    revision.id, REVIEW_SUBJECT_VERSION, baseline.origin, revision.rendererBuildId, revision.bundleDigest,
    ...REVIEW_COMPONENTS.map(key => digestJson(subject.components[key])),
    checked.subjectDigest, json(subject), json(baseline.provenance), now(),
  )
}
