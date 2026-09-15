/**
 * recentlyOpened — the teacher's own trail of opened passages, kept in
 * `localStorage` only (same lane as `ai-thinking-mode`: personal, per-browser,
 * never sent to the server). The home「接着做」section reads it to make
 * "returning to my desk" concrete; nothing else depends on it.
 */

export type RecentlyOpenedEntry = { id: string; at: string }

/**
 * Storage key prefix; the full key is namespaced by the signed-in user's id so
 * two teachers sharing one browser never see each other's trail. Bootstrap-open
 * mode (no accounts yet) uses the fixed scope `open`.
 */
export const RECENTLY_OPENED_STORAGE_KEY_PREFIX = 'eqb-recent-groups'
export const RECENTLY_OPENED_OPEN_SCOPE = 'open'
const RECENTLY_OPENED_CAP = 12

export function recentlyOpenedStorageKey(userScope: string): string {
  return `${RECENTLY_OPENED_STORAGE_KEY_PREFIX}:${userScope}`
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readRecentlyOpened(userScope: string): RecentlyOpenedEntry[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(recentlyOpenedStorageKey(userScope)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is RecentlyOpenedEntry =>
        typeof entry === 'object' && entry !== null
        && typeof (entry as RecentlyOpenedEntry).id === 'string'
        && typeof (entry as RecentlyOpenedEntry).at === 'string',
    )
  } catch {
    return []
  }
}

/** Move `id` to the front with a fresh timestamp and return the new list. */
export function recordRecentlyOpened(userScope: string, id: string, now = new Date()): RecentlyOpenedEntry[] {
  const next = [
    { id, at: now.toISOString() },
    ...readRecentlyOpened(userScope).filter((entry) => entry.id !== id),
  ].slice(0, RECENTLY_OPENED_CAP)
  const store = storage()
  if (store) {
    try {
      store.setItem(recentlyOpenedStorageKey(userScope), JSON.stringify(next))
    } catch {
      // Quota / private-mode failures only lose the trail, never the view.
    }
  }
  return next
}

/**
 * Coarse, teacher-facing relative time. Coarse on purpose: the home row
 * needs "when did I last touch this", not a timestamp.
 */
export function relativeTimeLabel(iso: string, now = new Date()): string {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ''
  const diffMs = now.getTime() - time
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (time >= startOfToday) return '今天'
  if (time >= startOfToday - 86_400_000) return '昨天'
  const days = Math.floor((startOfToday - time) / 86_400_000) + 1
  if (days < 7) return `${days} 天前`
  const date = new Date(time)
  const yearLabel = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`
  return `${yearLabel}${date.getMonth() + 1}月${date.getDate()}日`
}
