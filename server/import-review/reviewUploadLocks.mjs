import { createHash, randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function busy() {
  return Object.assign(new Error('Revision upload is busy; retry after the active upload completes'), {
    code: 'IMPORT_REVIEW_UPLOAD_BUSY', status: 409,
  })
}

// These locks coordinate local server processes too. Never reclaim a live or
// ambiguous owner; a dead process can leave an installed file to reconcile.
function removeDeadOwner(file) {
  let pid
  try { pid = Number(readFileSync(file, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return true
    throw error
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return false } catch (error) {
    if (error.code !== 'ESRCH') return false
  }
  try { unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return true
}

function lock(file) {
  const temporary = `${file}.owner-${randomUUID()}`
  writeFileSync(temporary, String(process.pid), { flag: 'wx', mode: 0o600 })
  try {
    try { linkSync(temporary, file) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!removeDeadOwner(file)) throw busy()
      // Gate reclamation is serialized by the store's short DB transaction;
      // path reclamation is serialized by the held revision gate.
      linkSync(temporary, file)
    }
  } finally { unlinkSync(temporary) }
  return () => unlinkSync(file)
}

export function revisionUploadGate(directory, { finalizing = false } = {}) {
  const root = path.join(directory, '.upload-locks')
  mkdirSync(root, { recursive: true })
  const release = lock(path.join(root, 'gate'))
  try {
    if (finalizing) {
      for (const name of readdirSync(root)) {
        if (/^[a-f0-9]{64}$/.test(name) && !removeDeadOwner(path.join(root, name))) throw busy()
      }
    }
    return { release, fileLock(relativePath) {
      const key = createHash('sha256').update(relativePath).digest('hex')
      return lock(path.join(root, key))
    } }
  } catch (error) {
    release()
    throw error
  }
}
