// Import orchestration policy; the shared renderer keeps its generic contract.
export const ECONOMY_NINE_PAGE_OWNER_DATE = '2026-10-18'
export const ECONOMY_NINE_PAGE_RULE = 'Owner 2026-10-18：不缩字排不进 8 页自动用 9 页'

export function importEconomyPageLimit(paperId, requested) {
  if (requested === undefined || requested === null) return 8
  if (![8, 9].includes(requested)) throw new Error('省纸页数只接受 8 或 9')
  return requested
}

export function canRetryEconomyNinePages(report, { paperId, candidateDigest, pageLimit }) {
  return pageLimit === 8 && report?.status === 'failure' && report.paperId === paperId
    && report.candidateDigest === candidateDigest && report.edition === 'economy8'
    && report.targetPages === 8 && report.error?.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE'
}
