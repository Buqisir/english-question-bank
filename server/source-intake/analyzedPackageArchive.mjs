import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const archiveCli = path.resolve(import.meta.dirname, '../../scripts/import-pipeline/analyzed-package-archive.py')

// This validates transport only. Content admission and Owner Review remain
// separate mandatory stages; an archive receipt cannot authorize publication.
export async function readAnalyzedPackageArchive(archivePath, { destination } = {}) {
  const args = ['-B', archiveCli, archivePath]
  if (destination) args.push('--destination', destination)
  let output
  try {
    output = await execute('python3', args, { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
  } catch (cause) {
    let detail
    try { detail = JSON.parse(cause.stdout) } catch { /* Process failures have no JSON receipt. */ }
    const error = new Error(detail?.message || 'Could not validate package archive', { cause })
    error.code = 'ANALYZED_PACKAGE_ARCHIVE_INVALID'
    error.status = detail?.ok === false ? 400 : 500
    throw error
  }
  const result = JSON.parse(output.stdout)
  if (result.ok !== true || result.stage !== 'archive' || !Array.isArray(result.files)) {
    throw new Error('Archive validator returned an invalid receipt')
  }
  return result
}
