import type { DraftPaper, DraftPaperSummary, DraftPrintForm } from '../domain/questionBank'
import { directDownloadTarget, saveBlobToTarget, type FileSaveTarget } from './fileDownload.ts'
import { apiPath, decodeHeaderValue, errorMessageFromResponse as readError } from './httpClient.ts'

// print-form 收口（plan.md Forbidden 追授）：printForm 已并入 domain 的
// DraftPaperSummary（engine-rewire 合并后并行锁解除），施工期的交叉类型
// 绕行（DraftPaper & { printForm }）已退役——单一类型真源回归 questionBank.ts。
export type { DraftPrintForm } from '../domain/questionBank'

export async function fetchDraftPapers(): Promise<DraftPaperSummary[]> {
  const response = await fetch(apiPath('/api/draft-papers'))
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load draft papers: ${response.status}`))
  }
  const data = (await response.json()) as { draftPapers: DraftPaperSummary[] }
  return data.draftPapers
}

export async function fetchCurrentDraftPaper(create = true): Promise<DraftPaper> {
  const response = await fetch(apiPath(`/api/draft-papers/current${create ? '?create=1' : ''}`))
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load current draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

// similar-workbench-swap (E7): thin wrapper around the specific-draft-paper
// sibling of addGroupToCurrentDraftPaper above (`POST /api/draft-papers/:id/items`,
// already existed in server/draft-paper/draftPaperRoutes.mjs pre-cut — no
// server change here, Forbidden). Takes an explicit `insertIndex` (0-based
// slot the new item lands at) and `pageBreakBefore` so the swap drawer's
// 替换/加入 actions can place the candidate at an exact position instead of
// always appending — same options shape draftPaperStore.mjs's
// addGroupToDraftPaper/restoreDraftPaperItem already accept server-side.
export async function addGroupToDraftPaper(
  draftPaperId: string,
  groupId: string,
  options: { insertIndex?: number; pageBreakBefore?: boolean } = {},
): Promise<DraftPaper> {
  const response = await fetch(apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/items`), {
    body: JSON.stringify({ groupId, ...options }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to add group to draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function fetchDraftPaper(id: string, versionType: 'student' | 'teacher' = 'student'): Promise<DraftPaper> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(id)}?versionType=${versionType}`),
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function addGroupToCurrentDraftPaper(groupId: string): Promise<DraftPaper> {
  const response = await fetch(apiPath('/api/draft-papers/current/items'), {
    body: JSON.stringify({ groupId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to add group to draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function migrateAssemblyBasketToDraftPaper(groupIds: string[]): Promise<{
  draftPaper: DraftPaper
  migratedCount: number
  skippedCount: number
}> {
  const response = await fetch(apiPath('/api/draft-papers/migrate-assembly-basket'), {
    body: JSON.stringify({ groupIds }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to migrate assembly basket: ${response.status}`))
  }
  return (await response.json()) as {
    draftPaper: DraftPaper
    migratedCount: number
    skippedCount: number
  }
}

// draft-desk-b step3 (MF-3, plan.md "步3 — 前端吃分页 HTML + 常驻叠按钮"): the
// server-rendered (paged.js), DOM-contract-tagged (`.preview-page` +
// `data-group-id`) pagination the workbench's A4 preview iframe now consumes
// directly instead of building its own client-side pagination.
// pdfBytes is deliberately not part of this response shape (PDF export stays
// on its own route/pipeline until step4).
// print-form (plan.md Must Do 2/6): `pageBreakSuggestions` here is the real,
// pagination-derived replacement for the retired draftPaper.pageBreakSuggestions
// heuristic — see server/draft-paper/draftPaperStore.mjs's derivePageBreakSuggestions.
export async function fetchDraftPaperPagination(
  id: string,
  versionType: 'student' | 'teacher' = 'student',
): Promise<{
  paginatedHtml: string
  pageCount: number
  reused: boolean
  pageBreakSuggestions: Array<{ itemId: string; groupId: string; reason: string }>
}> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(id)}/pagination?versionType=${versionType}`),
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load draft paper pagination: ${response.status}`))
  }
  return (await response.json()) as {
    paginatedHtml: string
    pageCount: number
    reused: boolean
    pageBreakSuggestions: Array<{ itemId: string; groupId: string; reason: string }>
  }
}

// reorder-suggest (docs/cuts/reorder-suggest/plan.md 施工契约 2/3): the
// verified-order verdict `getReorderSuggestion` (draftPaperStore.mjs)
// produces — null means "no candidate order zeroed out every 跨页断篇",
// never a false-positive placeholder. `order` is the full item-id sequence
// to PATCH via updateDraftPaper's existing `items` field (persistItems in
// DraftPaperWorkbench.tsx reuses that same PATCH, never a bespoke reorder
// endpoint). Kept local to this service file rather than domain/questionBank.ts
// (this cut's Forbidden list keeps `domain` out of scope) — the shape is a
// server-response DTO, not a shared domain concept.
export type ReorderSuggestion = {
  order: string[]
  move: { kind: 'swap' | 'front' | 'end'; itemId: string; otherItemId?: string }
  brokenGroupId: string
} | null

export async function fetchReorderSuggestion(
  id: string,
  versionType: 'student' | 'teacher' = 'student',
): Promise<ReorderSuggestion> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(id)}/reorder-suggestion?versionType=${versionType}`),
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load reorder suggestion: ${response.status}`))
  }
  const data = (await response.json()) as { suggestion: ReorderSuggestion }
  return data.suggestion
}

export async function updateDraftPaper(
  id: string,
  input: Partial<Pick<DraftPaper, 'title' | 'studentLabel'>> & {
    printForm?: DraftPrintForm
    items?: Array<{ id: string; pageBreakBefore: boolean }>
  },
): Promise<DraftPaper> {
  const response = await fetch(apiPath(`/api/draft-papers/${encodeURIComponent(id)}`), {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to update draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function patchDraftPaperItem(
  draftPaperId: string,
  itemId: string,
  input: { pageBreakBefore: boolean },
): Promise<DraftPaper> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/items/${encodeURIComponent(itemId)}`),
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to update draft item: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function deleteDraftPaperItem(draftPaperId: string, itemId: string): Promise<{
  draftPaper: DraftPaper
  removed: { itemId: string; groupId: string; orderIndex: number; pageBreakBefore: boolean }
}> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/items/${encodeURIComponent(itemId)}`),
    { method: 'DELETE' },
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to delete draft item: ${response.status}`))
  }
  return (await response.json()) as {
    draftPaper: DraftPaper
    removed: { itemId: string; groupId: string; orderIndex: number; pageBreakBefore: boolean }
  }
}

export async function restoreDraftPaperItem(
  draftPaperId: string,
  input: { groupId: string; orderIndex: number; pageBreakBefore: boolean },
): Promise<DraftPaper> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/items/restore`),
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to restore draft item: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaper }
  return data.draftPaper
}

export async function downloadDraftPaperPdf(
  draftPaperId: string,
  versionType: 'student' | 'teacher' = 'student',
  target: FileSaveTarget = directDownloadTarget(),
  pageLayout: 'natural' | 'friendly8' | 'friendly10' | 'long10' | 'long12' | 'largeComplete' | 'largeNoListening' | 'economy8' = 'natural',
): Promise<{ crossingGroupCount: number; splitOptionBankCount: number; fontSizePt: number }> {
  const response = await fetch(apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/print-pdf`), {
    body: JSON.stringify({ versionType, pageLayout }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to export draft paper PDF: ${response.status}`))
  }
  const blob = await response.blob()
  const defaultFileName = versionType === 'teacher' ? '英语草稿卷-教师卷.pdf' : '英语草稿卷-学生卷.pdf'
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || defaultFileName
  await saveBlobToTarget(blob, fileName, target)
  return {
    fontSizePt: Number(response.headers.get('x-paper-font-size-pt') || 0),
    crossingGroupCount: Number(response.headers.get('x-paper-crossing-group-count') || 0),
    splitOptionBankCount: Number(response.headers.get('x-paper-split-option-bank-count') || 0),
  }
}
