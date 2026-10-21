import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

// Production keeps one host-wide slot. Only verifiers set the inherited test
// override; TMPDIR, DB path and release root never partition production locks.
const leases = new WeakSet()
const processToken = randomUUID()
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const conflicts = new Set(['EEXIST', 'ENOTEMPTY', 'ENOENT'])
function safeDirectory(file) {
  const stat = lstatSync(file)
  return stat.isDirectory() && !stat.isSymbolicLink()
    && stat.uid === process.getuid() && !(stat.mode & 0o077)
}
function initialize() {
  const productionRoot = path.join(realpathSync('/tmp'), 'eqb-review-content-v1')
  const override = process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
  if (override !== undefined && (!path.isAbsolute(override) || path.resolve(override) === productionRoot)) {
    throw new Error('Invalid isolated Review test lock root')
  }
  const root = override === undefined ? productionRoot : path.resolve(override)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!safeDirectory(root) || (override !== undefined && realpathSync(root) === productionRoot)) {
    throw new Error('Review content leader ownership is ambiguous')
  }
  return root
}
function owner(kind) {
  return { version: 1, kind, pid: process.pid, uid: process.getuid(), processToken,
    token: randomUUID(), createdAt: new Date().toISOString() }
}
function alive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) { return error.code === 'ESRCH' ? false : null }
}
function inspect(file, kind) {
  const result = { file, kind, pid: null, uid: null, alive: null }
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    result.uid = stat.uid
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077)) {
      return { ...result, state: 'unsafe', reason: 'FILE_OWNERSHIP_OR_MODE' }
    }
    if (stat.size > 4096) return { ...result, state: 'malformed', reason: 'RECORD_TOO_LARGE' }
    let record
    try { record = JSON.parse(readFileSync(fd, 'utf8')) }
    catch { return { ...result, state: 'malformed', reason: 'INVALID_JSON' } }
    if (record && Number.isInteger(record.pid) && record.pid > 0 && record.pid <= 0x7fffffff) {
      result.pid = record.pid
      result.alive = alive(record.pid)
    }
    if (!record || record.version !== 1 || record.kind !== kind || result.pid === null
      || !uuid.test(record.processToken) || !uuid.test(record.token)
      || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
      return { ...result, state: 'malformed', reason: 'INCOMPLETE_RECORD' }
    }
    if (record.uid !== stat.uid) return { ...result, state: 'unsafe', reason: 'RECORD_UID_MISMATCH' }
    return { ...result, token: record.token, processToken: record.processToken,
      state: result.alive === true ? 'live' : result.alive === false ? 'dead' : 'unknown' }
  } catch (error) {
    return { ...result, state: error.code === 'ENOENT' ? 'missing' : 'unknown', reason: error.code }
  } finally { if (fd !== undefined) closeSync(fd) }
}
function inspectRecovery(root) {
  const file = path.join(root, '.recovery')
  try {
    if (!safeDirectory(file)) return { file, kind: 'recovery', state: 'unsafe', pid: null, alive: null }
    const record = inspect(path.join(file, 'owner.json'), 'recovery')
    // A directory with missing/truncated metadata is ambiguous, never vacant.
    return { ...record, state: record.state === 'missing' ? 'malformed' : record.state }
  } catch (error) {
    return { file, kind: 'recovery', state: error.code === 'ENOENT' ? 'missing' : 'unknown',
      pid: null, alive: null, reason: error.code }
  }
}
function writeExclusive(file, record) {
  try { writeFileSync(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); return true }
  catch (error) { if (error.code === 'EEXIST') return false; throw error }
}

// Serialize only reclamation. Publish a COMPLETE nonempty directory by rename:
// rename cannot replace an existing nonempty directory. Keep a nonempty tomb
// keyed by the old owner's unique token, including on release. A delayed reader
// of that owner can then never rename a later live gate (ENOTEMPTY). Unlike a
// plain stale-file rename, this supplies an atomic contender barrier. The gate
// itself is recoverable by the same rule after a proven-dead owner.
function acquireRecovery(root) {
  const record = owner('recovery')
  const stage = path.join(root, `.recovery-stage-${record.token}`)
  const gate = path.join(root, '.recovery')
  const tomb = token => path.join(root, `.recovery-tomb-${token}`)
  mkdirSync(stage, { mode: 0o700 })
  try {
    writeExclusive(path.join(stage, 'owner.json'), record)
    for (let attempt = 0; attempt < 2; attempt++) {
      const previous = inspectRecovery(root)
      if (previous.state !== 'missing') {
        if (previous.state !== 'dead') return null
        try { renameSync(gate, tomb(previous.token)) }
        catch (error) { if (conflicts.has(error.code)) return null; throw error }
      }
      try {
        renameSync(stage, gate)
        return () => {
          if (inspectRecovery(root).token === record.token) renameSync(gate, tomb(record.token))
        }
      } catch (error) { if (!conflicts.has(error.code)) throw error }
    }
    return null
  } finally { rmSync(stage, { recursive: true, force: true }) }
}
function reap(root, file, kind) {
  const release = acquireRecovery(root)
  if (!release) return false
  try {
    // Re-read and re-probe PID under the gate; never act on an old observation.
    const current = inspect(file, kind)
    if (current.state !== 'dead') return false
    renameSync(file, path.join(root, `.reaped-${path.basename(file)}-${current.token}-${randomUUID()}`))
    return true
  } finally { release() }
}
function releaseOwned(file, record) {
  const current = inspect(file, record.kind)
  if (current.token === record.token && current.processToken === processToken && current.pid === process.pid) {
    unlinkSync(file)
  }
}
export function reviewCompatibilityLockDiagnostics() {
  const root = initialize()
  return { root, leader: inspect(path.join(root, 'leader'), 'leader'), recovery: inspectRecovery(root),
    activities: readdirSync(root).filter(name => name.startsWith('activity-'))
      .map(name => inspect(path.join(root, name), 'activity')) }
}
export function reviewCompatibilityBusy() {
  const root = initialize()
  let busy = false
  for (const name of readdirSync(root).filter(name => name.startsWith('activity-'))) {
    const file = path.join(root, name)
    const current = inspect(file, 'activity')
    if (current.state === 'missing') continue
    if (current.state === 'dead' && reap(root, file, 'activity')) continue
    if (inspect(file, 'activity').state !== 'missing') busy = true
  }
  return busy
}
export function beginReviewActivity(kind) {
  if (!/^[a-z0-9-]+$/i.test(kind)) throw new Error('Invalid Review activity kind')
  const root = initialize()
  const record = owner('activity')
  const file = path.join(root, `activity-${kind}-${record.token}`)
  writeExclusive(file, record)
  let active = true
  return () => { if (active) { releaseOwned(file, record); active = false } }
}
export function acquireReviewCompatibilityLeader() {
  const root = initialize()
  const file = path.join(root, 'leader')
  const record = owner('leader')
  if (!writeExclusive(file, record)) {
    if (inspect(file, 'leader').state === 'dead') reap(root, file, 'leader')
    // O_EXCL remains the admission authority, even when another reaper won.
    if (!writeExclusive(file, record)) return null
  }
  const lease = Object.freeze({})
  leases.add(lease)
  return { lease, release() { if (leases.delete(lease)) releaseOwned(file, record) } }
}
export function validReviewCompatibilityLease(lease) { return leases.has(lease) }
