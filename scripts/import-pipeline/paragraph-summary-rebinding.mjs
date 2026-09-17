import { existsSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'

export function invalidateParagraphSummariesForListeningSupplement(paperDirectory) {
  const config = JSON.parse(readFileSync(path.join(paperDirectory, 'config.json'), 'utf8'))
  if (config.importProfile !== 'public-paper-v1') return null
  const files = [
    'paragraph-summaries-v1.json',
    'public-search-metadata-v1.json',
  ].map((file) => ({
    currentPath: path.join(paperDirectory, file),
    stalePath: path.join(paperDirectory, file.replace(/\.json$/, '.before-listening-supplement.json')),
  }))

  // Check every source and destination before either rename. A resumed failure
  // must stay visibly blocked rather than looking like a fully invalidated workspace.
  for (const { currentPath, stalePath } of files) {
    if (!existsSync(currentPath)) {
      throw new Error(`Hydrated public paper has no bound sidecar to rebind: ${currentPath}`)
    }
    if (existsSync(stalePath)) {
      throw new Error(`Listening supplement sidecar backup already exists: ${stalePath}`)
    }
  }
  for (const { currentPath, stalePath } of files) renameSync(currentPath, stalePath)
  return {
    staleSummaryPath: files[0].stalePath,
    staleSearchMetadataPath: files[1].stalePath,
  }
}
