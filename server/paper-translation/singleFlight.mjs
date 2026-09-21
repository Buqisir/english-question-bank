import { MAX_INFLIGHT_KEYS } from '../../shared/paper-selection/constants.mjs'

export function createSingleFlight({ maxKeys = MAX_INFLIGHT_KEYS } = {}) {
  const inflight = new Map()

  function subscribe(key, work, signal) {
    if (inflight.has(key)) {
      return join(inflight.get(key), signal)
    }
    if (inflight.size >= maxKeys && !inflight.has(key)) {
      const error = new Error('Too many in-flight translations')
      error.code = 'TRANSLATION_INFLIGHT_LIMIT'
      error.retryable = true
      error.status = 429
      return Promise.reject(error)
    }
    const subscribers = new Set()
    const task = {
      subscribers,
      abortController: new AbortController(),
      dispatched: false,
      promise: null,
    }
    inflight.set(key, task)
    task.promise = Promise.resolve()
      .then(() => work({
        signal: task.abortController.signal,
        markDispatched() {
          task.dispatched = true
        },
        hasSubscribers() {
          return task.subscribers.size > 0
        },
      }))
      .finally(() => {
        inflight.delete(key)
      })
    return join(task, signal)
  }

  function join(task, signal) {
    return new Promise((resolve, reject) => {
      const subscriber = { resolve, reject, signal }
      task.subscribers.add(subscriber)
      const onAbort = () => {
        task.subscribers.delete(subscriber)
        const error = new Error('Translation cancelled')
        error.code = 'TRANSLATION_CANCELLED'
        error.name = 'AbortError'
        reject(error)
        if (task.subscribers.size === 0 && !task.dispatched) {
          task.abortController.abort()
        }
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      task.promise.then(
        (value) => {
          if (signal) signal.removeEventListener('abort', onAbort)
          if (task.subscribers.has(subscriber)) {
            task.subscribers.delete(subscriber)
            resolve(value)
          }
        },
        (error) => {
          if (signal) signal.removeEventListener('abort', onAbort)
          if (task.subscribers.has(subscriber)) {
            task.subscribers.delete(subscriber)
            reject(error)
          }
        },
      )
    })
  }

  return {
    subscribe,
    get size() {
      return inflight.size
    },
  }
}
