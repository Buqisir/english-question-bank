import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { appendTiming } from './lib-timing.mjs'

// Only immutable, digest-checked PUTs are replayed. Manifest/finalize remain single-shot.
function retryable(error) {
  return [408, 429, 500, 502, 503, 504].includes(error.status)
    || (error instanceof TypeError && !error.status)
}

function aggregatePutMetrics(timing, metrics) {
  if (!metrics) return
  const aggregate = timing.putMetrics ||= {
    count: 0, totalMs: 0, maxTotalMs: 0, durationsMs: {}, maxDurationsMs: {},
  }
  aggregate.count++
  if (Number.isFinite(metrics.totalMs)) {
    aggregate.totalMs += metrics.totalMs
    aggregate.maxTotalMs = Math.max(aggregate.maxTotalMs, metrics.totalMs)
  }
  for (const [phase, duration] of Object.entries(metrics.durationsMs || {})) {
    if (!Number.isFinite(duration)) continue
    aggregate.durationsMs[phase] = (aggregate.durationsMs[phase] || 0) + duration
    aggregate.maxDurationsMs[phase] = Math.max(aggregate.maxDurationsMs[phase] || 0, duration)
  }
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
    if (created.metrics) timing.registerMetrics = created.metrics
    const filesByPath = new Map(manifest.files.map(file => [file.path, file]))
    const missing = [...new Set(created.missingFiles || [])].map(relativePath => {
      const file = filesByPath.get(relativePath)
      if (!file) throw new Error(`Server requested an unknown file: ${relativePath}`)
      return file
    })
    timing.reusedFiles = manifest.files.length - missing.length
    timing.reusedBytes = manifest.files.reduce((sum, file) => sum + file.byteLength, 0)
      - missing.reduce((sum, file) => sum + file.byteLength, 0)
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
              const result = await api(`${revisionPath}/files?path=${encodeURIComponent(file.path)}`, {
                method: 'PUT',
                headers: { 'content-length': String(file.byteLength), 'content-type': file.mediaType },
                body: bytes,
              })
              aggregatePutMetrics(timing, result?.metrics)
              timing.uploadedFiles++
              timing.uploadedBytes += file.byteLength
              break
            } catch (error) {
              aggregatePutMetrics(timing, error.metrics)
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
      if (result.metrics) timing.finalizeMetrics = result.metrics
      timing.completed = true
      return result
    } catch (error) {
      if (error.metrics) timing.finalizeMetrics = error.metrics
      throw error
    } finally {
      timing.finalizeSeconds = (performance.now() - finalizeStarted) / 1000
    }
  } finally {
    appendTiming(timelinePath, { ...timing, finishedAt: new Date().toISOString() })
  }
}
