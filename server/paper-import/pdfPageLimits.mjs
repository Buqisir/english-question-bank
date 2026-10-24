export const DEFAULT_PRODUCT_PAGE_LIMITS = Object.freeze({
  largeCompletePageLimit: 12, largeNoListeningPageLimit: 10, economyPageLimit: 8,
})
export const LARGE_PAGE_LIMIT_AUTHORIZATION = Object.freeze({
  authorizedBy: 'Owner', authorizedOn: '2026-10-24', basis: 'BUB-138',
})

export function validateProductPageLimits(options) {
  for (const [key, baseline] of Object.entries(DEFAULT_PRODUCT_PAGE_LIMITS)) {
    if (![baseline, baseline + 1].includes(options[key] === undefined ? baseline : options[key])) {
      throw new Error(`${key} only accepts ${baseline} or an explicit ${baseline + 1} ceiling`)
    }
  }
  return { ...DEFAULT_PRODUCT_PAGE_LIMITS, ...options }
}

export function validatePageLimitAuthorization(value) {
  if (!value || Object.keys(value).sort().join() !== Object.keys(LARGE_PAGE_LIMIT_AUTHORIZATION).sort().join()
    || Object.entries(LARGE_PAGE_LIMIT_AUTHORIZATION).some(([key, expected]) => value[key] !== expected)) {
    throw new Error('Page limit authorization must identify Owner 2026-10-24 BUB-138')
  }
}

export function productPageLimitsForManifest(manifest) {
  if (manifest.schemaVersion === 'paper-pdf-products-v4') {
    validatePageLimitAuthorization(manifest.pageLimitAuthorization)
    if (!manifest.pageLimits || Object.keys(manifest.pageLimits).sort().join()
      !== Object.keys(DEFAULT_PRODUCT_PAGE_LIMITS).sort().join()) throw new Error('Explicit product page limits are required')
    const limits = validateProductPageLimits(manifest.pageLimits)
    if (limits.largeCompletePageLimit === 12 && limits.largeNoListeningPageLimit === 10) {
      throw new Error('v4 requires an explicit large-edition allowance')
    }
    if (manifest.economyPageLimit !== undefined) throw new Error('v4 stores economy limit in pageLimits')
    return limits
  }
  if (manifest.pageLimits !== undefined || manifest.pageLimitAuthorization !== undefined) {
    throw new Error('Historical product manifests cannot declare large-edition allowances')
  }
  return validateProductPageLimits({ economyPageLimit:
    ['paper-pdf-products-v2', 'paper-pdf-products-v3'].includes(manifest.schemaVersion) ? manifest.economyPageLimit : 8 })
}
