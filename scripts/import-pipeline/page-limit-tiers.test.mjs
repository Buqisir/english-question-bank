import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXTENDED_PAGE_LIMIT_AUTHORIZATION, LARGE_PAGE_LIMIT_AUTHORIZATION,
  productPageLimitsForManifest, validatePageLimitAuthorization, validateProductPageLimits,
} from '../../server/paper-import/pdfPageLimits.mjs'
import { productPlanAuthorization, productPlanVersion } from '../../server/paper-import/paginationPlan.mjs'
import { importEconomyPageLimit, largePageLimitArgs } from './lib-economy-page-allowance.mjs'

test('page limits accept baseline, +1 and the BUB-168 +2 tier only', () => {
  assert.deepEqual(validateProductPageLimits({}), {
    largeCompletePageLimit: 12, largeNoListeningPageLimit: 10, economyPageLimit: 8,
  })
  assert.equal(validateProductPageLimits({
    largeCompletePageLimit: 14, largeNoListeningPageLimit: 12, economyPageLimit: 10,
  }).largeCompletePageLimit, 14)
  assert.throws(() => validateProductPageLimits({ largeCompletePageLimit: 15 }), /12 or an explicit/)
  assert.throws(() => validateProductPageLimits({ economyPageLimit: 11 }), /8 or an explicit/)
})

test('authorization accepts BUB-138 or BUB-168, nothing else', () => {
  assert.doesNotThrow(() => validatePageLimitAuthorization(LARGE_PAGE_LIMIT_AUTHORIZATION))
  assert.doesNotThrow(() => validatePageLimitAuthorization(EXTENDED_PAGE_LIMIT_AUTHORIZATION))
  assert.throws(() => validatePageLimitAuthorization({ ...EXTENDED_PAGE_LIMIT_AUTHORIZATION, basis: 'BUB-200' }))
  assert.throws(() => validatePageLimitAuthorization(null))
})

test('plan version and authorization follow the chosen tier', () => {
  const editions = pages => ({
    largeComplete: { targetPages: pages[0] },
    largeNoListening: { targetPages: pages[1] },
    economy8: { targetPages: pages[2] },
  })
  assert.equal(productPlanVersion(editions([12, 10, 8])), 'paper-pagination-plan-v4')
  assert.equal(productPlanVersion(editions([12, 10, 9])), 'paper-pagination-plan-v5')
  for (const tier of [[13, 10, 8], [14, 10, 8], [12, 11, 8], [12, 12, 8], [12, 10, 10]]) {
    assert.equal(productPlanVersion(editions(tier)), 'paper-pagination-plan-v6', JSON.stringify(tier))
  }
  // +1 tier declares BUB-138; +2 tier declares BUB-168.
  assert.equal(productPlanAuthorization('paper-pagination-plan-v6', editions([13, 10, 8])).pageLimitAuthorization.basis, 'BUB-138')
  assert.equal(productPlanAuthorization('paper-pagination-plan-v6', editions([14, 10, 8])).pageLimitAuthorization.basis, 'BUB-168')
  assert.equal(productPlanAuthorization('paper-pagination-plan-v6', editions([12, 12, 8])).pageLimitAuthorization.basis, 'BUB-168')
  assert.equal(productPlanAuthorization('paper-pagination-plan-v6', editions([12, 10, 10])).pageLimitAuthorization.basis, 'BUB-168')
  assert.equal(productPlanAuthorization('paper-pagination-plan-v6', editions([13, 11, 9])).pageLimitAuthorization.basis, 'BUB-138')
  assert.deepEqual(productPlanAuthorization('paper-pagination-plan-v5', editions([12, 10, 9])), {})
})

test('import page-limit helpers accept and forward the extended ceilings', () => {
  assert.equal(importEconomyPageLimit('paper-x', 10), 10)
  assert.throws(() => importEconomyPageLimit('paper-x', 11), /8、9 或 10/)
  assert.deepEqual(largePageLimitArgs({ largeCompletePageLimit: 14, largeNoListeningPageLimit: 12 }),
    ['--large-complete-page-limit', '14', '--large-no-listening-page-limit', '12'])
  assert.deepEqual(largePageLimitArgs({ largeCompletePageLimit: 13, largeNoListeningPageLimit: 11 }),
    ['--large-complete-page-limit', '13', '--large-no-listening-page-limit', '11'])
  assert.deepEqual(largePageLimitArgs({ largeCompletePageLimit: 12, largeNoListeningPageLimit: 10 }), [])
})

test('frozen product manifests accept the extended authorization tier', () => {
  const manifest = pages => ({
    schemaVersion: 'paper-pdf-products-v4',
    pageLimitAuthorization: { ...EXTENDED_PAGE_LIMIT_AUTHORIZATION },
    pageLimits: { largeCompletePageLimit: pages[0], largeNoListeningPageLimit: pages[1], economyPageLimit: pages[2] },
  })
  assert.equal(productPageLimitsForManifest(manifest([14, 12, 10])).largeCompletePageLimit, 14)
  assert.throws(() => productPageLimitsForManifest({
    ...manifest([14, 12, 10]), pageLimitAuthorization: { ...LARGE_PAGE_LIMIT_AUTHORIZATION, authorizedOn: '2026-10-23' },
  }), /BUB-138 or BUB-168/)
})
