import { validateProductPageLimits } from '../../server/paper-import/pdfPageLimits.mjs'

// Import orchestration policy; the shared renderer keeps its generic contract.
export const ECONOMY_NINE_PAGE_OWNER_DATE = '2026-10-18'
export const ECONOMY_NINE_PAGE_RULE = 'Owner 2026-10-18：不缩字排不进 8 页自动用 9 页'

export function importLargePageLimits(value = {}) {
  const limits = validateProductPageLimits({
    largeCompletePageLimit: value.largeCompletePageLimit ?? 12,
    largeNoListeningPageLimit: value.largeNoListeningPageLimit ?? 10,
  })
  return { largeCompletePageLimit: limits.largeCompletePageLimit, largeNoListeningPageLimit: limits.largeNoListeningPageLimit }
}

export function largePageLimitArgs(value) {
  return Object.entries(importLargePageLimits(value)).flatMap(([key, limit]) =>
    (key === 'largeCompletePageLimit' ? [13, 14] : [11, 12]).includes(limit)
    ? [key === 'largeCompletePageLimit' ? '--large-complete-page-limit' : '--large-no-listening-page-limit', String(limit)] : [])
}

export function importEconomyPageLimit(paperId, requested) {
  if (requested === undefined || requested === null) return 8
  if (![8, 9, 10].includes(requested)) throw new Error('省纸页数只接受 8、9 或 10')
  return requested
}

export function canRetryEconomyNinePages(report, { paperId, candidateDigest, pageLimit }) {
  return pageLimit === 8 && report?.status === 'failure' && report.paperId === paperId
    && report.candidateDigest === candidateDigest && report.edition === 'economy8'
    && report.targetPages === 8 && report.error?.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE'
}
