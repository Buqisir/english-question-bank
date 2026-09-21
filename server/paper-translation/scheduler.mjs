import {
  GLOBAL_RESERVED_TPM,
  GLOBAL_RPM,
  MAX_UPSTREAM_CONCURRENT,
  QUEUE_TIMEOUT_MS,
  USER_BURST,
  USER_RPM,
} from '../../shared/paper-selection/constants.mjs'

function slidingCount(timestamps, windowMs, now) {
  const cutoff = now - windowMs
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift()
  return timestamps.length
}

function pruneReserved(reservedTokens, windowMs, now) {
  const cutoff = now - windowMs
  while (reservedTokens.length > 0 && reservedTokens[0].at < cutoff) reservedTokens.shift()
}

export function createTranslationScheduler({
  now = () => Date.now(),
} = {}) {
  const userHits = new Map()
  const globalHits = []
  const reservedTokens = []
  let inFlight = 0
  const waiters = []

  function pruneMaps() {
    if (userHits.size > 4096) {
      const cutoff = now() - 60_000
      for (const [key, stamps] of userHits) {
        slidingCount(stamps, 60_000, cutoff + 60_000)
        if (stamps.length === 0) userHits.delete(key)
      }
    }
  }

  function admitUser(userId) {
    const stamps = userHits.get(userId) || []
    const at = now()
    const recent = slidingCount(stamps, 60_000, at)
    const burstWindow = slidingCount(stamps.slice(), 3_000, at)
    if (recent >= USER_RPM || burstWindow >= USER_BURST) {
      const error = new Error('Too many translation requests')
      error.code = 'TRANSLATION_USER_RATE_LIMIT'
      error.retryable = true
      error.status = 429
      throw error
    }
    stamps.push(at)
    userHits.set(userId, stamps)
    pruneMaps()
  }

  function admitGlobalDispatch(reservedTokenCount) {
    const at = now()
    slidingCount(globalHits, 60_000, at)
    pruneReserved(reservedTokens, 60_000, at)
    const tokenSum = reservedTokens.reduce((sum, item) => sum + item.tokens, 0)
    if (globalHits.length >= GLOBAL_RPM || tokenSum + reservedTokenCount > GLOBAL_RESERVED_TPM) {
      const error = new Error('Translation is at capacity')
      error.code = 'TRANSLATION_GLOBAL_RATE_LIMIT'
      error.retryable = true
      error.status = 429
      throw error
    }
    globalHits.push(at)
    reservedTokens.push({ at, tokens: reservedTokenCount })
  }

  function pump() {
    while (waiters.length > 0 && inFlight < MAX_UPSTREAM_CONCURRENT) {
      const next = waiters.shift()
      inFlight += 1
      next.resolve(function release() {
        inFlight -= 1
        pump()
      })
    }
  }

  async function acquireSlot() {
    if (inFlight < MAX_UPSTREAM_CONCURRENT && waiters.length === 0) {
      inFlight += 1
      return function release() {
        inFlight -= 1
        pump()
      }
    }
    return await new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        const error = new Error('Translation queue timed out')
        error.code = 'TRANSLATION_QUEUE_TIMEOUT'
        error.retryable = true
        error.status = 429
        reject(error)
      }, QUEUE_TIMEOUT_MS)
      waiter.resolve = (release) => {
        clearTimeout(timer)
        resolve(release)
      }
      waiters.push(waiter)
      pump()
    })
  }

  return {
    admitUser,
    admitGlobalDispatch,
    acquireSlot,
    get inFlight() {
      return inFlight
    },
    get queued() {
      return waiters.length
    },
  }
}
