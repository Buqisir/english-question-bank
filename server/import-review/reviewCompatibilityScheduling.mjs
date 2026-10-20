import {
  closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync,
  unlinkSync, writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

// One slot for the entire host, not per DB, TMPDIR, user or API process. Never steal a
// stale/ambiguous leader: an operator must reconcile it after a process crash.
const root = path.join(realpathSync('/tmp'), 'eqb-review-content-v1')
const leases = new WeakSet()
function initialize() {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077)) {
    throw new Error('Review content leader ownership is ambiguous')
  }
}
export function reviewCompatibilityBusy() {
  initialize()
  return readdirSync(root).some(name => name.startsWith('activity-'))
}
export function beginReviewActivity(kind) {
  initialize()
  const file = path.join(root, `activity-${kind}-${randomUUID()}`)
  writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 })
  let active = true
  return () => { if (active) { unlinkSync(file); active = false } }
}
export function acquireReviewCompatibilityLeader() {
  initialize()
  const file = path.join(root, 'leader')
  let fd
  try { fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) }
  catch (error) { if (error.code === 'EEXIST') return null; throw error }
  closeSync(fd)
  const lease = Object.freeze({})
  leases.add(lease)
  return { lease, release() { if (leases.delete(lease) && existsSync(file)) unlinkSync(file) } }
}
export function validReviewCompatibilityLease(lease) { return leases.has(lease) }
