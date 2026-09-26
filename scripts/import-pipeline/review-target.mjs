import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Disk-bound intent survives login-shell environment replacement. This is an
// accidental-target guard, not an authorization boundary against a local writer.
export function resolveReviewOrigin(root, environment = process.env) {
  const binding = path.join(root, '.amp/import-review-origin')
  const profile = path.join(root, '.amp/orb-profile')
  const dedicatedImport = existsSync(profile) && readFileSync(profile, 'utf8').trim() === 'import'
  if (dedicatedImport && !existsSync(binding)) {
    throw new Error('IMPORT_REVIEW_TARGET_UNBOUND: bind .amp/import-review-origin before Review access')
  }
  function parse(value) {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || url.pathname !== '/') {
      throw new Error('IMPORT_REVIEW_TARGET_INVALID: expected an exact HTTP(S) origin')
    }
    return url.origin
  }
  const actual = parse(environment.QUESTION_BANK_IMPORT_OPS_ORIGIN || '')
  if (existsSync(binding) && parse(readFileSync(binding, 'utf8').trim()) !== actual) {
    throw new Error('IMPORT_REVIEW_TARGET_MISMATCH: environment differs from disk-bound Review origin')
  }
  return actual
}
