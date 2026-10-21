import {
  closeSync, constants, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { matchingReviewProcess, reviewProcessGroupMembers } from './reviewProcessTree.mjs'

// Production keeps one host-wide slot. Only verifiers set the inherited test
// override; TMPDIR, DB path and release root never partition production locks.
const leases = new WeakSet()
const leaseRecords = new WeakMap()
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
    if (kind === 'leader' && activeCompatibilityWork(root, current.token).length) return false
    renameSync(file, path.join(root, `.reaped-${path.basename(file)}-${current.token}-${randomUUID()}`))
    return true
  } finally { release() }
}
function releaseOwned(file, record) {
  const current = inspect(file, record.kind)
  if (current.token === record.token && current.processToken === processToken && current.pid === process.pid) {
    if (record.kind === 'leader' && activeCompatibilityWork(path.dirname(file), record.token).length) return
    unlinkSync(file)
  }
}
export function reviewCompatibilityLockDiagnostics() {
  const root = initialize()
  return { root, leader: inspect(path.join(root, 'leader'), 'leader'), recovery: inspectRecovery(root),
    promotion: inspectPromotionReservation(),
    activities: readdirSync(root).filter(name => name.startsWith('activity-'))
      .map(name => inspect(path.join(root, name), 'activity')) }
}
export function reviewCompatibilityBusy() {
  const root = initialize()
  if (inspectPromotionReservation().state !== 'missing') return true
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
export function acquireReviewCompatibilityLeader({ promotionToken = null } = {}) {
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
  leaseRecords.set(lease, record)
  // All callers (scanner, one-shot compatibility, automatic/manual backfill)
  // acquire this same leader BEFORE checking reservation. Never reap a
  // promotion based on its original API PID; the executor can outlive it.
  const reservation = inspectPromotionReservation()
  if (reservation.state !== 'missing' && !(reservation.state === 'reserved' && promotionToken === reservation.token)) {
    leases.delete(lease)
    releaseOwned(file, record)
    return null
  }
  return { lease, release() { if (leases.delete(lease)) releaseOwned(file, record) } }
}
export function validReviewCompatibilityLease(lease) { return leases.has(lease) }

function activeCompatibilityWork(root, token) {
  return readdirSync(root).filter(name => name.startsWith(`.compatibility-work-${token}-`))
    .sort().map(name => path.join(root, name))
}
function readCompatibilityWorker(directory) {
  if (!safeDirectory(directory)) throw new Error('Unsafe compatibility work evidence')
  const fd = openSync(path.join(directory, 'worker.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > 4096 || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Unsafe compatibility worker')
    const identity = JSON.parse(readFileSync(fd, 'utf8'))
    if (!Number.isInteger(identity?.pid) || identity.pid <= 0 || identity.pid > 0x7fffffff
      || typeof identity.bootId !== 'string' || !identity.bootId
      || typeof identity.startId !== 'string' || !identity.startId) throw new Error('Invalid compatibility worker')
    return identity
  } finally { closeSync(fd) }
}
// Reserve BEFORE fork. A parent-PID reap must never hide an independent
// scanner/backfill executor. Missing worker metadata is a blocked spawn window.
export function beginReviewCompatibilityWork(lease) {
  if (!validReviewCompatibilityLease(lease)) throw new Error('Invalid compatibility lease')
  const record = leaseRecords.get(lease)
  const root = initialize()
  if (activeCompatibilityWork(root, record.token).length) return null
  const id = randomUUID()
  const directory = path.join(root, `.compatibility-work-${record.token}-${id}`)
  mkdirSync(directory, { mode: 0o700 })
  durableRecord(path.join(directory, 'launch.json'), { version: 1, leaderToken: record.token, createdAt: new Date().toISOString() })
  syncDirectory(root)
  return {
    record(identity) {
      durableRecord(path.join(directory, 'worker.json'), identity)
      syncDirectory(directory)
    },
    async finish({ notStarted = false, pid } = {}) {
      if (notStarted) {
        // The live parent knows it never sent business input and has reaped
        // its own child. Still require the detached group to be empty.
        if (pid && (await reviewProcessGroupMembers(pid)).length) return false
      } else {
        const identity = readCompatibilityWorker(directory)
        if (await matchingReviewProcess(identity) !== 'dead'
          || (await reviewProcessGroupMembers(identity.pid)).length) return false
      }
      renameSync(directory, path.join(root, `.compatibility-closed-${id}`))
      syncDirectory(root)
      return true
    },
  }
}
// Reclaim only a proven-dead owner AND every recorded worker/group. Never kill
// a live compatibility job to admit publishing, and never guess across fork.
export async function reconcileDeadReviewCompatibilityLeader() {
  const root = initialize()
  const file = path.join(root, 'leader')
  const before = inspect(file, 'leader')
  if (before.state !== 'dead') return false
  const jobs = activeCompatibilityWork(root, before.token)
  if (!jobs.length) return false
  let identities
  try {
    identities = jobs.map(readCompatibilityWorker)
    for (const identity of identities) {
      if (await matchingReviewProcess(identity) !== 'dead'
        || (await reviewProcessGroupMembers(identity.pid)).length) return false
    }
  } catch { return false }
  const release = acquireRecovery(root)
  if (!release) return false
  try {
    const current = inspect(file, 'leader')
    if (current.state !== 'dead' || current.token !== before.token
      || JSON.stringify(activeCompatibilityWork(root, before.token)) !== JSON.stringify(jobs)) return false
    for (let i = 0; i < jobs.length; i++) {
      if (JSON.stringify(readCompatibilityWorker(jobs[i])) !== JSON.stringify(identities[i])) return false
    }
    for (const job of jobs) renameSync(job, path.join(root, `.compatibility-orphan-closed-${randomUUID()}`))
    renameSync(file, path.join(root, `.reaped-leader-${current.token}-${randomUUID()}`))
    syncDirectory(root)
    return true
  } finally { release() }
}

function syncDirectory(directory) {
  const fd = openSync(directory, constants.O_RDONLY)
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function durableRecord(file, record) {
  const fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try { writeFileSync(fd, JSON.stringify(record)); fsyncSync(fd) } finally { closeSync(fd) }
}
export function inspectPromotionReservation() {
  const root = initialize()
  const directory = path.join(root, 'promotion')
  try {
    if (!safeDirectory(directory)) return { state: 'unsafe' }
    const file = path.join(directory, 'reservation.json')
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let record
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) return { state: 'unsafe' }
      record = JSON.parse(readFileSync(fd, 'utf8'))
    } finally { closeSync(fd) }
    if (record.version !== 1 || !uuid.test(record.token) || !uuid.test(record.operationId)
      || typeof record.dbIdentity !== 'string' || !path.isAbsolute(record.dbIdentity)
      || typeof record.releaseIdentity !== 'string') return { state: 'malformed' }
    // Active pointer replacements are atomic; the original record and each
    // handoff remain append-only evidence. Only explicit retry changes it.
    let active
    try {
      const fd = openSync(path.join(directory, 'active.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) return { state: 'unsafe' }
        active = JSON.parse(readFileSync(fd, 'utf8'))
      } finally { closeSync(fd) }
    }
    catch (error) { if (error.code !== 'ENOENT') return { state: 'malformed' } }
    if (active) {
      if (active.token !== record.token || !uuid.test(active.operationId)
        || active.dbIdentity !== record.dbIdentity || active.releaseIdentity !== record.releaseIdentity) return { state: 'malformed' }
      record = active
    }
    return { state: 'reserved', ...record }
  } catch (error) {
    // A published reservation directory with missing metadata is ambiguous.
    if (error.code === 'ENOENT') {
      try { lstatSync(directory); return { state: 'malformed' } }
      catch (missing) { if (missing.code === 'ENOENT') return { state: 'missing' } }
    }
    return { state: 'unknown', reasonCode: error.code || 'INVALID_JSON' }
  }
}
export function reservePromotionSlot(lease, { operationId, dbIdentity, releaseIdentity }) {
  if (!validReviewCompatibilityLease(lease) || inspectPromotionReservation().state !== 'missing') return null
  const root = initialize()
  const token = randomUUID()
  const stage = path.join(root, `.promotion-stage-${token}`)
  mkdirSync(stage, { mode: 0o700 })
  const record = { version: 1, token, operationId, dbIdentity: realpathSync(dbIdentity),
    releaseIdentity, createdAt: new Date().toISOString() }
  try {
    durableRecord(path.join(stage, 'reservation.json'), record)
    syncDirectory(stage)
    renameSync(stage, path.join(root, 'promotion'))
    syncDirectory(root)
    return record
  } finally { rmSync(stage, { recursive: true, force: true }) }
}
// Append-only process evidence. No truncation window in the sole slot record.
export function recordPromotionSlotProcess(token, role, identity) {
  if (!/^(supervisor|executor)(?:-inspect-[a-f0-9-]{36})?$/.test(role)) throw new Error('Invalid promotion process role')
  const reservation = inspectPromotionReservation()
  if (reservation.state !== 'reserved' || reservation.token !== token) throw new Error('Promotion reservation mismatch')
  const directory = path.join(initialize(), 'promotion')
  durableRecord(path.join(directory, `${reservation.operationId}-${role}.json`), identity)
  syncDirectory(directory)
}
export function readPromotionSlotProcess(token, role) {
  const reservation = inspectPromotionReservation()
  if (reservation.state !== 'reserved' || reservation.token !== token) return null
  if (!/^(supervisor|executor)(?:-inspect-[a-f0-9-]{36})?$/.test(role)) throw new Error('Invalid promotion process role')
  const file = path.join(initialize(), 'promotion', `${reservation.operationId}-${role}.json`)
  try {
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > 4096 || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Unsafe process evidence')
      const record = JSON.parse(readFileSync(fd, 'utf8'))
      if (!record || !Number.isInteger(record.pid) || record.pid < 1 || record.pid > 0x7fffffff
        || typeof record.bootId !== 'string' || !record.bootId
        || typeof record.startId !== 'string' || !record.startId) throw new Error('Malformed process evidence')
      return record
    } finally { closeSync(fd) }
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
export function promotionSlotProcessRecords(token) {
  const reservation = inspectPromotionReservation()
  if (reservation.state !== 'reserved' || reservation.token !== token) throw new Error('Promotion reservation mismatch')
  const directory = path.join(initialize(), 'promotion')
  return readdirSync(directory).filter(name => name.startsWith(`${reservation.operationId}-`))
    .map(name => readPromotionSlotProcess(token, name.slice(37, -5)))
}
export function handoffPromotionSlot(lease, token, operationId) {
  const current = inspectPromotionReservation()
  if (!validReviewCompatibilityLease(lease) || current.state !== 'reserved'
    || current.token !== token || !uuid.test(operationId)) throw new Error('Invalid promotion slot handoff')
  const directory = path.join(initialize(), 'promotion')
  const record = { version: 1, token, operationId, dbIdentity: current.dbIdentity,
    releaseIdentity: current.releaseIdentity, createdAt: new Date().toISOString() }
  durableRecord(path.join(directory, `handoff-${operationId}.json`), { ...record, previousOperationId: current.operationId })
  const stage = path.join(directory, `.active-${operationId}`)
  durableRecord(stage, record)
  renameSync(stage, path.join(directory, 'active.json'))
  syncDirectory(directory)
  return {
    ...record,
    rollback() {
      const active = inspectPromotionReservation()
      if (!validReviewCompatibilityLease(lease) || active.state !== 'reserved'
        || active.token !== token || active.operationId !== operationId) throw new Error('Invalid promotion handoff rollback')
      // Only the live admission stack, before any fork and with no new DB row,
      // may undo its pointer. A crashed stack leaves the ambiguous gap fenced.
      const previous = { ...record, operationId: current.operationId, createdAt: current.createdAt }
      durableRecord(path.join(directory, `rollback-${operationId}.json`), previous)
      const restore = path.join(directory, `.rollback-${operationId}`)
      durableRecord(restore, previous)
      renameSync(restore, path.join(directory, 'active.json'))
      syncDirectory(directory)
    },
  }
}
// Only terminal durable reconciliation plus proven process-tree exit can call
// this seam. Preserve the complete directory as a nonempty audit tombstone.
export function releasePromotionSlot(token) {
  const current = inspectPromotionReservation()
  if (current.state !== 'reserved' || current.token !== token) return false
  const root = initialize()
  renameSync(path.join(root, 'promotion'), path.join(root, `.promotion-closed-${token}`))
  syncDirectory(root)
  return true
}
export function closedPromotionSlot(token, operationId, dbIdentity) {
  if (!uuid.test(token) || !uuid.test(operationId)) return false
  const directory = path.join(initialize(), `.promotion-closed-${token}`)
  const read = name => {
    const fd = openSync(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > 4096 || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Unsafe closed receipt')
      return JSON.parse(readFileSync(fd, 'utf8'))
    } finally { closeSync(fd) }
  }
  try {
    if (!safeDirectory(directory)) return false
    const original = read('reservation.json')
    let active
    try { active = read('active.json') } catch (error) { if (error.code !== 'ENOENT') return false }
    const current = active || original
    return original.token === token && current.token === token
      && current.operationId === operationId && current.dbIdentity === dbIdentity
  } catch { return false }
}
