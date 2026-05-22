/**
 * Assembly Basket — local-only persistence helpers.
 *
 * Cut B requirement: the user's "加入草稿卷" state must survive a page
 * refresh. We persist the Assembly Basket to `localStorage` only — no
 * backend write, no Paper Set save, no `paperBlocks` snapshot.
 *
 * Persistence scope:
 *   - We persist `BasketItem[]` (the literal Assembly Basket state).
 *   - We do NOT persist `paperBlocks`. If a layout is needed at hydrate
 *     time, callers rebuild it from the basket. This keeps `basket` as
 *     the single source of truth and avoids a stale-layout class of
 *     bugs.
 *
 * Schema:
 *   key:    `assembly-basket-v1`
 *   value:  JSON.stringify({
 *             schemaVersion: 1,
 *             items: BasketItem[],
 *           })
 *
 * Validation rules — any failure returns `null` and the caller should
 * treat the basket as empty:
 *   - JSON.parse throws → discard
 *   - top-level is not a plain object → discard
 *   - schemaVersion !== 1 → discard
 *   - items is not an array → discard
 *
 * The helpers below are deliberately pure (no React, no DOM access
 * except the localStorage feature check) so the verify script can
 * exercise them through Node's strip-types ESM loader.
 */

import type { BasketItem } from '../domain/questionBank.ts'

export const ASSEMBLY_BASKET_STORAGE_KEY = 'assembly-basket-v1'
export const ASSEMBLY_BASKET_SCHEMA_VERSION = 1 as const

/**
 * Persisted shape. The wire format is intentionally narrow so future
 * schema bumps can rev `schemaVersion` without ambiguity.
 */
export type PersistedAssemblyBasket = {
  schemaVersion: typeof ASSEMBLY_BASKET_SCHEMA_VERSION
  items: BasketItem[]
}

/** Serialize basket items into the persisted JSON string. */
export function serializeAssemblyBasket(items: BasketItem[]): string {
  const payload: PersistedAssemblyBasket = {
    schemaVersion: ASSEMBLY_BASKET_SCHEMA_VERSION,
    items,
  }
  return JSON.stringify(payload)
}

/**
 * Parse a persisted JSON string into BasketItem[] under the validation
 * rules above. Returns `null` on any validation failure — callers are
 * expected to fall back to an empty basket.
 *
 * We accept `null` / `undefined` / empty string explicitly so callers
 * can pipe `localStorage.getItem(...)` through without a null check.
 */
export function parseAssemblyBasket(raw: string | null | undefined): BasketItem[] | null {
  if (raw === null || raw === undefined || raw === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (parsed === null || typeof parsed !== 'object') return null
  const payload = parsed as Record<string, unknown>

  if (payload.schemaVersion !== ASSEMBLY_BASKET_SCHEMA_VERSION) return null
  if (!Array.isArray(payload.items)) return null

  return payload.items as BasketItem[]
}

/**
 * Hydrate the basket from `window.localStorage`. Safe to call from
 * `useState` initializer in a browser environment; returns `[]` when:
 *   - SSR / no `window`
 *   - localStorage access throws (private mode quotas, etc.)
 *   - validation rejects the stored payload
 */
export function loadAssemblyBasket(): BasketItem[] {
  if (typeof window === 'undefined') return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(ASSEMBLY_BASKET_STORAGE_KEY)
  } catch {
    return []
  }
  return parseAssemblyBasket(raw) ?? []
}

/**
 * C8 PR A retires new Assembly Basket writes. Keep this function as a
 * compatibility no-op for older hook code paths while the Draft Paper
 * server entity becomes the add-to-draft source of truth. Read helpers
 * above remain active only for one-time migration.
 */
export function saveAssemblyBasket(items: BasketItem[]): void {
  void items
}
