import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readSync, openSync, closeSync, constants, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

export const REVIEW_TARGET_BUILD_VERSION = 'review-target-build-v1'
const defaultRoot = fileURLToPath(new URL('../../', import.meta.url))
const runtimeKeys = ['NODE_ENV', 'EQB_ANALYZED_PACKAGE_FIXTURE_ONLY']
// Include all server runtime inputs, conservatively including shared UI files.
// Uploaded data, databases, dependencies, logs and secrets are never hashed.
const roots = ['server', 'shared', 'schemas', 'prompts', 'standards']
const ignored = new Set(['node_modules', 'dist', '.git', 'data', 'uploads', 'logs', 'output', 'exports'])
const excluded = name => ignored.has(name) || name.startsWith('.') || /\.(?:sqlite(?:-wal|-shm)?|db|log|pem|key)$/.test(name)

export function computeReviewBuildIdentity({ repoRoot = defaultRoot } = {}) {
  const files = []
  function walk(relative) {
    const absolute = path.join(repoRoot, relative)
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) throw new Error(`Target build contains symlink: ${relative}`)
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        if (!excluded(name)) walk(`${relative}/${name}`)
      }
    } else if (stat.isFile()) {
      const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
      const hash = createHash('sha256')
      let byteLength = 0
      try {
        const bytes = Buffer.allocUnsafe(64 * 1024)
        let size
        while ((size = readSync(fd, bytes, 0, bytes.length, null)) > 0) {
          byteLength += size
          hash.update(bytes.subarray(0, size))
        }
      } finally { closeSync(fd) }
      files.push({ repoRelativePosixPath: relative, sha256: `sha256:${hash.digest('hex')}`, byteLength })
    }
  }
  for (const root of roots) if (existsSync(path.join(repoRoot, root))) walk(root)
  for (const name of ['package.json', 'package-lock.json', 'pnpm-lock.yaml']) {
    if (existsSync(path.join(repoRoot, name))) walk(name)
  }
  if (!files.some(file => file.repoRelativePosixPath.startsWith('server/'))) throw new Error('Missing target server tree')
  files.sort((a, b) => a.repoRelativePosixPath < b.repoRelativePosixPath ? -1 : a.repoRelativePosixPath > b.repoRelativePosixPath ? 1 : 0)
  const descriptor = { schemaVersion: REVIEW_TARGET_BUILD_VERSION, files, nodeVersion: process.version,
    runtimeConfig: Object.fromEntries(runtimeKeys.map(key => [key, process.env[key] ?? null])) }
  return Object.freeze({ ...descriptor, targetBuildId: digestJson(descriptor) })
}

// Production callers must supply the immutable release root. No arbitrary
// explicit label is accepted; development recomputes after source edits.
export function reviewBuildIdentityProvider({ repoRoot = defaultRoot, production = process.env.NODE_ENV === 'production' } = {}) {
  let cached
  return () => production ? (cached ??= computeReviewBuildIdentity({ repoRoot })) : computeReviewBuildIdentity({ repoRoot })
}
