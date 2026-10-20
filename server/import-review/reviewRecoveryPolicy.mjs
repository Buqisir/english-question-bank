// Host budgets are centralized; callers may lower, never raise, these limits.
export const REVIEW_WORKER_BUDGET = Object.freeze({ heapMb: 384, deadlineMs: 300_000, batchSize: 1, yieldMs: 5000 })
export const REVIEW_IDENTITY_BUDGET = Object.freeze({ heapMb: 384, deadlineMs: 30_000, retryMs: 60_000 })
export const REVIEW_BACKFILL_WORKER_BUDGET = Object.freeze({ heapMb: 128, deadlineMs: 30_000 })
export const REVIEW_BACKFILL_RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 900_000, 3_600_000, 14_400_000])
export const isTransientReviewFailure = reason => [
  'WORKER_TIMEOUT', 'WORKER_OOM', 'WORKER_EXIT', 'IO_ERROR',
  'LEADER_BUSY', 'ACTIVITY_PENDING', 'TARGET_CHANGED', 'TARGET_IDENTITY_PENDING',
  'TARGET_IDENTITY_UNAVAILABLE', 'TARGET_IDENTITY_INVALID', 'TARGET_IDENTITY_MISMATCH',
].includes(reason)

export function reviewCompatibilityEligibility(compatibility, rendererStale) {
  const definitive = ['equal', 'different'].includes(compatibility.result)
  return { ...compatibility,
    eligible: definitive ? compatibility.result === 'equal' : !rendererStale,
    guard: definitive ? 'content_binding' : 'legacy_renderer',
    fallback: !definitive,
    ...(!definitive ? { fallbackReason: compatibility.reasonCode, legacyRendererStale: rendererStale } : {}),
  }
}

export function reviewBackfillRetryState(rows, nowMs = Date.now()) {
  const reset = rows.findLastIndex(row => row.reason_code === 'TRANSIENT_BUDGET_RESET')
  const failures = rows.slice(reset + 1).filter(row => isTransientReviewFailure(row.reason_code))
  const exhausted = failures.length > REVIEW_BACKFILL_RETRY_DELAYS_MS.length
  const nextRetryAt = failures.length && !exhausted
    ? Date.parse(failures.at(-1).checked_at) + REVIEW_BACKFILL_RETRY_DELAYS_MS[failures.length - 1] : null
  return { transientAttempts: failures.length, exhausted, nextRetryAt,
    eligible: !exhausted && (nextRetryAt === null || nowMs >= nextRetryAt) }
}
