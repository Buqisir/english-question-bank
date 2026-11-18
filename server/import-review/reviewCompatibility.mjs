import { stableStringify } from '../../shared/paper-canonical/stable.mjs'

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
