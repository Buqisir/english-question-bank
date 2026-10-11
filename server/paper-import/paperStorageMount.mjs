import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Opt in only during the reviewed host cutover. Device names such as /dev/vdb
// can change across boots; use the filesystem UUID assigned at initialization.
// This is a guard, never a mount/format operation or an authorization to migrate.
export function assertPaperStorageMounted(roots, env = process.env) {
  const uuid = env.QUESTION_BANK_PAPER_STORAGE_UUID
  const mount = env.QUESTION_BANK_PAPER_STORAGE_MOUNT
  if (!uuid && !mount) return
  const reject = () => {
    throw Object.assign(new Error('Paper storage mount is absent or differs from its configured filesystem; no system-disk fallback'),
      { code: 'PAPER_STORAGE_MOUNT_UNAVAILABLE', status: 503 })
  }
  if (process.platform !== 'linux' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid || '')
    || !mount || !path.isAbsolute(mount) || !Array.isArray(roots) || roots.length === 0) reject()
  try {
    const device = statSync(`/dev/disk/by-uuid/${uuid}`)
    const mounted = statSync(mount)
    if (!device.isBlockDevice() || !mounted.isDirectory()
      || realpathSync(mount) !== path.resolve(mount)
      || mounted.dev !== device.rdev
      || statSync(path.dirname(path.resolve(mount))).dev === mounted.dev) reject()
    for (const root of roots) {
      if (!path.isAbsolute(root)) reject()
      let existing = root
      while (!existsSync(existing) && existing !== path.dirname(existing)) existing = path.dirname(existing)
      const parent = statSync(existing)
      if (!parent.isDirectory() || parent.dev !== device.rdev) reject()
    }
  } catch { reject() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertPaperStorageMounted(process.argv.slice(2))
    console.log(process.env.QUESTION_BANK_PAPER_STORAGE_UUID ? 'Paper storage mount verified' : 'Paper storage mount guard is not configured')
  } catch (error) {
    console.error(`${error.code}: ${error.message}`)
    process.exitCode = 1
  }
}
