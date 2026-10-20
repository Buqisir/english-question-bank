import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readSync, realpathSync, rmSync, writeSync,
} from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { inspectReviewFileSync, validReviewRelativePath } from './reviewSubject.mjs'

const sameNode = (a, b) => a.dev === b.dev && a.ino === b.ino
function reject() {
  throw Object.assign(new Error('Unsafe or changed sealed file'), { reasonCode: 'SEALED_PATH_UNSAFE' })
}

// Keep directory descriptors open and check their identities again after the
// read. O_NOFOLLOW rejects the leaf; every absolute ancestor is checked too.
// The snapshot is private and is the only input subsequently read by projection.
function openRegular(filePath) {
  const absolute = path.resolve(filePath)
  const parents = []
  let current = path.parse(absolute).root
  let fd
  try {
    for (const part of path.relative(current, path.dirname(absolute)).split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      const before = lstatSync(current)
      if (!before.isDirectory() || before.isSymbolicLink()) reject()
      const descriptor = openSync(current, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      parents.push({ path: current, fd: descriptor, stat: fstatSync(descriptor) })
      if (!sameNode(before, parents.at(-1).stat)) reject()
    }
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || !sameNode(stat, lstatSync(absolute))) reject()
    return {
      fd,
      verify() {
        const after = fstatSync(fd)
        if (!sameNode(stat, lstatSync(absolute)) || stat.size !== after.size
          || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) reject()
        for (const parent of parents) {
          const actual = lstatSync(parent.path)
          if (!actual.isDirectory() || actual.isSymbolicLink() || !sameNode(parent.stat, actual)) reject()
        }
      },
      close() { closeSync(fd); for (const parent of parents.reverse()) closeSync(parent.fd) },
    }
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    for (const parent of parents.reverse()) closeSync(parent.fd)
    if (error.code === 'ELOOP') error.reasonCode = 'SEALED_PATH_UNSAFE'
    if (error.code === 'ENOENT') error.reasonCode = 'MISSING_EVIDENCE'
    throw error
  }
}

export function inspectSealedReviewFiles(directory, files, { snapshot = null } = {}) {
  const evidence = []
  const seen = new Set()
  for (const file of files) {
    if (!validReviewRelativePath(file.path) || seen.has(file.path)) reject()
    seen.add(file.path)
    const source = openRegular(path.join(directory, file.path))
    let output
    try {
      if (snapshot) {
        const destination = path.join(snapshot, file.path)
        mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
        output = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
      }
      function* chunks() {
        const buffer = Buffer.allocUnsafe(64 * 1024)
        let size
        while ((size = readSync(source.fd, buffer, 0, buffer.length, null)) > 0) {
          const chunk = buffer.subarray(0, size)
          if (output !== undefined) {
            let written = 0
            while (written < size) written += writeSync(output, chunk, written, size - written)
          }
          yield chunk
        }
      }
      evidence.push(inspectReviewFileSync(file, chunks()))
      source.verify()
    } finally {
      if (output !== undefined) closeSync(output)
      source.close()
    }
  }
  return evidence
}

export function withSealedReviewSnapshot(directory, files, callback) {
  const snapshot = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-content-'))
  try {
    const fileEvidence = inspectSealedReviewFiles(directory, files, { snapshot })
    return callback({ directory: snapshot, fileEvidence })
  } finally { rmSync(snapshot, { recursive: true, force: true }) }
}
