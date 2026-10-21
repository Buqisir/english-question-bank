import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { REVIEW_COMPONENTS, validateReviewSubject } from './reviewSubject.mjs'

export const REVIEW_COMPARATOR_VERSION = 'review-content-equivalence-v1'
const escapePointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1')

// Evidence contains locations only, never question text/answers. Bound output
// without silently claiming it contains every changed leaf.
export function reviewContentDifferences(before, after, limit = 128) {
  const pointers = []
  let truncated = false
  function walk(left, right, pointer) {
    if (stableStringify(left) === stableStringify(right)) return
    if (pointers.length >= limit) { truncated = true; return }
    if (left && right && typeof left === 'object' && typeof right === 'object'
      && Array.isArray(left) === Array.isArray(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        const child = `${pointer}/${escapePointer(key)}`
        if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
          if (pointers.length < limit) pointers.push(child)
          else truncated = true
        } else walk(left[key], right[key], child)
      }
      return
    }
    pointers.push(pointer || '/')
  }
  walk(before, after, '')
  return { differences: pointers, truncated }
}

// Baseline must be freshly re-extracted on every attempt; an old equal result
// or a chain of pairwise comparisons is never accepted as baseline evidence.
// targetBuildId is the verified descriptor's digest from step B, not a renderer
// ID and not an HTTP-provided label. This module supplies no cache authority.
export function compareReviewSubjects({ baseline, target, targetBuildId, storedSubject = null }) {
  const output = {
    result: 'unknown', reasonCode: 'NOT_CHECKED', subjectDigest: baseline?.subjectDigest ?? null,
    targetBuildId: targetBuildId ?? null, comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: baseline?.metrics ?? {},
  }
  const unknown = (reasonCode, differences = []) => ({ ...output, reasonCode, differences })
  if (!/^sha256:[a-f0-9]{64}$/.test(targetBuildId || '')) return unknown('TARGET_IDENTITY_INVALID')
  if (!baseline?.ok) {
    if (baseline?.reasonCode === 'SEALED_FILE_CHANGED') {
      return { ...output, result: 'different', reasonCode: 'SEALED_FILE_CHANGED',
        differences: baseline.differences || [] }
    }
    return unknown(baseline?.reasonCode || 'MISSING_BASELINE', baseline?.differences)
  }
  const checked = validateReviewSubject(baseline.subject)
  if (!checked.ok || checked.subjectDigest !== baseline.subjectDigest) return unknown('BASELINE_UNTRUSTED')
  if (storedSubject && (digestJson(storedSubject) !== checked.subjectDigest
    || !validateReviewSubject(storedSubject).ok)) return unknown('BASELINE_UNTRUSTED')
  if (!target?.ok) {
    if (target?.reasonCode === 'SEALED_FILE_CHANGED') {
      return { ...output, result: 'different', reasonCode: 'SEALED_FILE_CHANGED', differences: target.differences || [] }
    }
    return unknown(target?.reasonCode || 'TARGET_COMPUTATION_FAILED', target?.differences)
  }
  const targetChecked = validateReviewSubject(target.subject)
  if (!targetChecked.ok || targetChecked.subjectDigest !== target.subjectDigest) return unknown('TARGET_UNTRUSTED')
  for (const key of ['revisionId', 'sourceRendererBuildId', 'bundleDigest']) {
    if (baseline.subject[key] !== target.subject[key]) return unknown('TARGET_BINDING_INVALID', [`/${key}`])
  }
  const componentDigests = Object.fromEntries(REVIEW_COMPONENTS.map(key => [key, {
    baseline: digestJson(baseline.subject.components[key]), target: digestJson(target.subject.components[key]),
  }]))
  const changed = REVIEW_COMPONENTS.some(key => componentDigests[key].baseline !== componentDigests[key].target)
  const diff = changed ? reviewContentDifferences(baseline.subject.components, target.subject.components)
    : { differences: [], truncated: false }
  return { ...output, result: changed ? 'different' : 'equal',
    reasonCode: changed ? 'SUBJECT_CHANGED' : 'CONTENT_EQUAL', componentDigests,
    differences: diff.differences, metrics: { ...output.metrics, differencesTruncated: diff.truncated } }
}
