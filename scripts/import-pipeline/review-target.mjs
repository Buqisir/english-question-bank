import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const isLocalReviewOrigin = origin => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(origin)

export async function withReviewPaperLock(lock, action) {
  mkdirSync(path.dirname(lock), { recursive: true })
  const held = () => new Error(`本卷 Review 操作已持锁，请先对账：${lock}`)
  const id = randomUUID()
  const staging = `${lock}.${id}`
  mkdirSync(staging, { mode: 0o700 })
  try {
    writeFileSync(path.join(staging, 'owner.json'), JSON.stringify({ id, pid: process.pid, host: hostname() }))
    if (existsSync(lock)) {
      let owner
      try { owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')) } catch { throw held() }
      if (owner?.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1
        || !/^[a-f0-9-]{36}$/u.test(owner.id)) throw held()
      try { process.kill(owner.pid, 0); throw held() } catch (error) {
        if (error.code !== 'ESRCH') throw held()
      }
      // A second reclaimer of this generation cannot rename a new live owner
      // over the already populated tombstone.
      renameSync(lock, `${lock}.stale-${owner.id}`)
    }
    try { renameSync(staging, lock) } catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw held()
      throw error
    }
    try { return await action() } finally { renameSync(lock, staging) }
  } finally { rmSync(staging, { recursive: true, force: true }) }
}

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

export function hydratedEvidenceBase(paperDir) {
  const file = path.join(paperDir, 'signals', 'review-restore.json')
  if (!existsSync(file)) return null
  let restore
  try {
    restore = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('Review restore binding is not valid JSON')
  }
  const revision = restore.sealedRevision
  if (!revision) return null
  const root = path.resolve(import.meta.dirname, '../..')
  const target = resolveReviewOrigin(root, { ...process.env,
    QUESTION_BANK_IMPORT_OPS_ORIGIN: process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || restore.origin })
  if (restore.schemaVersion !== 'review-restore-v1' || restore.origin !== target
    || restore.paperId !== revision.paperId || restore.revisionId !== revision.id
    || restore.bundleDigest !== revision.bundleDigest) throw new Error('Review restore binding does not match the retained revision')
  const config = path.join(paperDir, 'signals', 'review-restore-config.json')
  return { revision, ...(existsSync(config) ? { configBytes: readFileSync(config) } : {}) }
}
