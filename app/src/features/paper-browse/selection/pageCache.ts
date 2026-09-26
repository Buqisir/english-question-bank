import {
  PAGE_CACHE_MAX_BYTES,
  PAGE_CACHE_MAX_ENTRIES,
} from '../../../../../shared/paper-selection/constants.mjs'

type Entry = {
  value: unknown
  bytes: number
}

export function createPageTranslationCache() {
  const items = new Map<string, Entry>()
  let bytes = 0

  function evict() {
    while (items.size > PAGE_CACHE_MAX_ENTRIES || bytes > PAGE_CACHE_MAX_BYTES) {
      const oldest = items.keys().next().value
      if (oldest === undefined) break
      const removed = items.get(oldest)
      items.delete(oldest)
      if (removed) bytes -= removed.bytes
    }
  }

  return {
    get<T>(key: string): T | null {
      const item = items.get(key)
      if (!item) return null
      items.delete(key)
      items.set(key, item)
      return item.value as T
    },
    set(key: string, value: unknown) {
      const size = Math.max(1, JSON.stringify(value).length)
      const existing = items.get(key)
      if (existing) {
        bytes -= existing.bytes
        items.delete(key)
      }
      items.set(key, { value, bytes: size })
      bytes += size
      evict()
    },
    clear() {
      items.clear()
      bytes = 0
    },
  }
}
