// Import orchestration authorization only; the shared renderer keeps its generic contract.
export const ECONOMY_NINE_PAGE_OWNER_DATE = '2026-10-18'
const authorizedPapers = new Set([
  'paper-mock-zhejiang-hangzhou-2026-05-adaptability-test',
  'paper-mock-zhejiang-hangzhou-2026-april-three-province-joint-exam',
])

export function importEconomyPageLimit(paperId, requested) {
  if (requested === undefined || requested === null) return 8
  if (requested !== 9 || !authorizedPapers.has(paperId)) {
    throw new Error('九页省纸授权仅限 Owner 2026-10-18 指定的杭二适应性、三校三省两套卷')
  }
  return 9
}
