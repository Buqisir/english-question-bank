import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { appendTiming } from './lib-timing.mjs'

// Only immutable, digest-checked PUTs are replayed. Manifest/finalize remain single-shot.
function retryable(error) {
  return [408, 429, 500, 502, 503, 504].includes(error.status)
    || (error instanceof TypeError && !error.status)
}

export async function uploadReviewBundle({
  paperDir, manifest, api, resolveReviewFile, timelinePath,
  concurrency = Number(process.env.QUESTION_BANK_IMPORT_UPLOAD_CONCURRENCY ?? 4),
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) {
    throw new Error('QUESTION_BANK_IMPORT_UPLOAD_CONCURRENCY must be an integer from 1 to 6')
  }
  const timing = { paperId: manifest.paperId, startedAt: new Date().toISOString(),
    manifestFiles: manifest.files.length, uploadedFiles: 0, uploadedBytes: 0,
    putSeconds: 0, putWallSeconds: 0, putAttempts: 0, putRetries: 0,
    finalizeSeconds: 0, putMode: concurrency === 1 ? 'serial' : 'parallel',
    putConcurrency: concurrency, completed: false }
  try {
    const created = await api('/api/import-agent-reviews/revisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifest),
    })
    const filesByPath = new Map(manifest.files.map(file => [file.path, file]))
    const missing = [...new Set(created.missingFiles || [])].map(relativePath => {
      const file = filesByPath.get(relativePath)
      if (!file) throw new Error(`Server requested an unknown file: ${relativePath}`)
      return file
    })
    const revisionPath = `/api/import-agent-reviews/revisions/${encodeURIComponent(created.revision.id)}`
    let next = 0
    let failure = null
    const worker = async () => {
      while (!failure && next < missing.length) {
        const file = missing[next++]
        try {
          const bytes = readFileSync(resolveReviewFile(paperDir, file.path))
          for (let attempt = 0; ; attempt++) {
            const started = performance.now()
            timing.putAttempts++
            try {
              await api(`${revisionPath}/files?path=${encodeURIComponent(file.path)}`, {
                method: 'PUT',
                headers: { 'content-length': String(file.byteLength), 'content-type': file.mediaType },
                body: bytes,
              })
              timing.uploadedFiles++
              timing.uploadedBytes += file.byteLength
              break
            } catch (error) {
              if (attempt >= 2 || !retryable(error)) throw error
              timing.putRetries++
            } finally {
              // Keep the existing sum-of-request-time metric; wall time is separate.
              timing.putSeconds += (performance.now() - started) / 1000
            }
            await delay(250 * 2 ** attempt)
          }
        } catch (error) {
          failure ||= error
        }
      }
    }
    const putStarted = performance.now()
    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker))
    timing.putWallSeconds = (performance.now() - putStarted) / 1000
    // Drain active workers before reporting failure or writing the final timing receipt.
    if (failure) throw failure
    const finalizeStarted = performance.now()
    try {
      const result = await api(`${revisionPath}/finalize`, { method: 'POST' })
      timing.completed = true
      return result
    } finally {
      timing.finalizeSeconds = (performance.now() - finalizeStarted) / 1000
    }
  } finally {
    appendTiming(timelinePath, { ...timing, finishedAt: new Date().toISOString() })
  }
}
