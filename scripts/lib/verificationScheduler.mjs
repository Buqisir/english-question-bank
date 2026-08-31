function abortError(signal) {
  const error = new Error(`Verification schedule aborted${signal?.reason ? `: ${signal.reason}` : ''}`)
  error.name = 'AbortError'
  return error
}

export function createOrderedResultFlusher(flush) {
  if (typeof flush !== 'function') throw new TypeError('flush must be a function')
  const ready = new Map()
  let nextIndex = 0
  let chain = Promise.resolve()

  return async (index, result) => {
    ready.set(index, result)
    chain = chain.then(async () => {
      while (ready.has(nextIndex)) {
        const nextResult = ready.get(nextIndex)
        ready.delete(nextIndex)
        await flush(nextIndex, nextResult)
        nextIndex += 1
      }
    })
    await chain
  }
}

export function verificationSchedulingPolicy(script, source) {
  const declaredRenderResource = /^\/\/\s*verify-resource:\s*browser-render\s*$/mu.test(source)
  const renderResource = declaredRenderResource
    || /(?:chromium\.launch|withChromiumPage|chromiumPool|vivliostyle|\bsoffice\b|libreoffice)/iu.test(source)
  const fixedPorts = new Set([
    ...[...source.matchAll(/\.listen\(\s*([1-9]\d{2,4})\b/gu)].map((match) => match[1]),
    ...[...source.matchAll(/(?:const|let|var)\s+[A-Za-z_$][\w$]*[Pp]ort[\w$]*\s*=\s*([1-9]\d{2,4})\b/gu)].map((match) => match[1]),
  ])
  const sharedOfficialEvidence = /^import\s+\{[^}]*\}\s+from\s+['"][^'"]*canonicalImportPilotEvidenceRoot\.mjs['"]/mu.test(source)
  return {
    script,
    exclusive: sharedOfficialEvidence,
    resourceKeys: [
      ...(renderResource ? ['browser-render'] : []),
      ...[...fixedPorts].sort().map((port) => `port:${port}`),
    ],
  }
}

export async function runVerificationSchedule(items, {
  concurrency,
  run,
  onStart = () => {},
  onSettled = () => {},
  signal = null,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('verification concurrency must be a positive integer')
  }
  if (typeof run !== 'function') throw new TypeError('run must be a function')
  if (signal?.aborted) throw abortError(signal)

  const pending = items.map((item, index) => ({ item, index }))
  const results = Array(items.length)
  const activeResources = new Set()
  let activeCount = 0
  let fatalError = null

  return new Promise((resolve, reject) => {
    const finishIfDone = () => {
      if (activeCount > 0) return false
      if (fatalError) {
        reject(fatalError)
        return true
      }
      if (signal?.aborted) {
        reject(abortError(signal))
        return true
      }
      if (pending.length === 0) {
        resolve(results)
        return true
      }
      return false
    }

    const runnablePosition = () => {
      if (signal?.aborted || fatalError) return -1
      const barrierPosition = pending.findIndex(({ item }) => item.exclusive)
      if (barrierPosition === 0) return activeCount === 0 ? 0 : -1
      const limit = barrierPosition === -1 ? pending.length : barrierPosition
      for (let position = 0; position < limit; position += 1) {
        const resourceKeys = pending[position].item.resourceKeys || []
        if (resourceKeys.every((resourceKey) => !activeResources.has(resourceKey))) return position
      }
      return -1
    }

    const pump = () => {
      if (finishIfDone()) return
      while (activeCount < concurrency && !signal?.aborted && !fatalError) {
        const position = runnablePosition()
        if (position === -1) break
        const [{ item, index }] = pending.splice(position, 1)
        activeCount += 1
        for (const resourceKey of item.resourceKeys || []) activeResources.add(resourceKey)
        try {
          onStart(item, index)
        } catch (error) {
          fatalError = error
        }
        Promise.resolve()
          .then(() => run(item, index))
          .then(async (result) => {
            results[index] = result
            await onSettled(index, result)
          })
          .catch((error) => {
            fatalError ||= error
          })
          .finally(() => {
            activeCount -= 1
            for (const resourceKey of item.resourceKeys || []) activeResources.delete(resourceKey)
            pump()
          })
        if (item.exclusive) break
      }
      finishIfDone()
    }

    signal?.addEventListener('abort', pump, { once: true })
    pump()
  })
}
