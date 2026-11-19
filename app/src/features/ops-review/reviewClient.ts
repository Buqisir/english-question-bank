export const sections = {
  listening: '听力', reading: '阅读', sevenChoice: '七选五',
  cloze: '完形', grammar: '语法', writing: '写作',
} as const
export const sectionKeys = Object.keys(sections) as (keyof typeof sections)[]
export const coverageLabels = { yes: '有', no: '无', unknown: '未知' } as const
export type Coverage = keyof typeof coverageLabels

export type ReviewPaper = {
  paperId: string
  paperName: string
  latestRevisionId: string
  revisionNumber: number
  reviewKind: string
  state: string
  promotionState: string | null
  hasEarlierPublication: boolean | 'unknown'
  hasTeachingAnalyses: boolean
  hasMediaCandidates: boolean
  unresolvedCount: number
  bundleDigest: string
  rendererBuildId: string
  year: number | 'unknown'
  region: string
  sourceType: '真题' | '模拟' | 'unknown'
  analysisCoverage: Record<keyof typeof sections, Coverage>
}

export type ReviewIssue = {
  id: string
  state: string
  message: string
  resolutionNote?: string
}

export type ReviewDetail = {
  paperId: string
  latestRevisionId: string
  issues: ReviewIssue[]
  revisions: { id: string; revisionNumber: number; state: string; createdAt: string }[]
}

export const stateLabels: Record<string, string> = {
  awaiting_review: '待审核', changes_requested: '待修改', approved: '已批准',
  publishing: '发布中', published: '已发布', failed: '发布失败',
  uploading: '上传中', superseded: '已替换',
}
export const issueLabels: Record<string, string> = {
  open: '待 Agent 修改', fixed_pending_review: 'Agent 已修改，请查看新版后确认',
  closed: '已解决', dismissed: '已撤销',
}

export const endpoint = (paper: ReviewPaper) => `/api/import-reviews/papers/${encodeURIComponent(paper.paperId)}`
export const reviewKey = (paper: ReviewPaper) => JSON.stringify([paper.paperId, paper.latestRevisionId, paper.bundleDigest])

export class ReviewRequestError extends Error {
  readonly code?: string
  readonly compatibility?: {
    differences?: string[]; differencesTruncated?: boolean
  }

  constructor(message: string, code?: string, compatibility?: ReviewRequestError['compatibility']) {
    super(message)
    this.code = code
    this.compatibility = compatibility
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw new ReviewRequestError(data?.error || `请求失败（${response.status}）`, data?.code, data?.compatibility)
  }
  return data
}

export function writeReview(url: string, body: object, method: 'POST' | 'PATCH' = 'POST') {
  return request(url, {
    method, headers: { 'content-type': 'application/json', 'x-eqb-csrf': 'owner-review' },
    body: JSON.stringify(body),
  })
}
