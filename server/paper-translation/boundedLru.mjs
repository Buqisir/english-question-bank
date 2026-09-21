export function createBoundedLru({ maxBytes, maxEntries }) {
  const items = new Map()
  let bytes = 0

  function evictIfNeeded() {
    while (
      (maxEntries != null && items.size > maxEntries)
      || (maxBytes != null && bytes > maxBytes)
    ) {
      const oldest = items.keys().next().value
      if (oldest === undefined) break
      const removed = items.get(oldest)
      items.delete(oldest)
      bytes -= removed.bytes
    }
  }

  return {
    get size() {
      return items.size
    },
    get bytes() {
      return bytes
    },
    get(key) {
      const item = items.get(key)
      if (!item) return null
      items.delete(key)
      items.set(key, item)
      return item.value
    },
    set(key, value, payloadBytes) {
      const size = Math.max(1, Number(payloadBytes) || 0)
      const existing = items.get(key)
      if (existing) {
        bytes -= existing.bytes
        items.delete(key)
      }
      items.set(key, { value, bytes: size })
      bytes += size
      evictIfNeeded()
    },
    delete(key) {
      const existing = items.get(key)
      if (!existing) return
      items.delete(key)
      bytes -= existing.bytes
    },
    clear() {
      items.clear()
      bytes = 0
    },
  }
}
