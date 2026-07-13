import type { DraftPaper, DraftPaperSummary } from '../domain/questionBank'
import { apiPath, decodeHeaderValue, errorMessageFromResponse as readError } from './httpClient.ts'

// print-form (docs/cuts/print-form/plan.md): `printForm` is additive server
// state (draft_papers.print_form) this cut's Forbidden list does not permit
// adding to the shared `DraftPaper`/`DraftPaperSummary` domain type
// (`app/src/domain/questionBank.ts` is an engine-rewire contract point another
// cut is editing concurrently in a sibling worktree) — so it is layered on
// locally here as an intersection type instead of a source edit to that file.
// Every service function below that returns a full draft-paper record now
// returns this widened shape; DraftPaperWorkbench.tsx imports it from here
// rather than importing the bare `DraftPaper` type for its own state.
export type DraftPrintForm = 'a4' | 'a3'
export type DraftPaperWithForm = DraftPaper & { printForm: DraftPrintForm }
export type DraftPaperSummaryWithForm = DraftPaperSummary & { printForm: DraftPrintForm }

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function fetchDraftPapers(): Promise<DraftPaperSummary[]> {
  const response = await fetch(apiPath('/api/draft-papers'))
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load draft papers: ${response.status}`))
  }
  const data = (await response.json()) as { draftPapers: DraftPaperSummary[] }
  return data.draftPapers
}

export async function fetchCurrentDraftPaper(create = true): Promise<DraftPaperWithForm> {
  const response = await fetch(apiPath(`/api/draft-papers/current${create ? '?create=1' : ''}`))
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load current draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function fetchDraftPaper(id: string, versionType: 'student' | 'teacher' = 'student'): Promise<DraftPaperWithForm> {
  const response = await fetch(
    apiPath(`/api/draft-papers/${encodeURIComponent(id)}?versionType=${versionType}`),
  )
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function addGroupToCurrentDraftPaper(groupId: string): Promise<DraftPaperWithForm> {
  const response = await fetch(apiPath('/api/draft-papers/current/items'), {
    body: JSON.stringify({ groupId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to add group to draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function migrateAssemblyBasketToDraftPaper(groupIds: string[]): Promise<{
  draftPaper: DraftPaperWithForm
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
    draftPaper: DraftPaperWithForm
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

export async function updateDraftPaper(
  id: string,
  input: Partial<Pick<DraftPaper, 'title' | 'studentLabel'>> & {
    printForm?: DraftPrintForm
    items?: Array<{ id: string; pageBreakBefore: boolean }>
  },
): Promise<DraftPaperWithForm> {
  const response = await fetch(apiPath(`/api/draft-papers/${encodeURIComponent(id)}`), {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to update draft paper: ${response.status}`))
  }
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function patchDraftPaperItem(
  draftPaperId: string,
  itemId: string,
  input: { pageBreakBefore: boolean },
): Promise<DraftPaperWithForm> {
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
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function deleteDraftPaperItem(draftPaperId: string, itemId: string): Promise<{
  draftPaper: DraftPaperWithForm
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
    draftPaper: DraftPaperWithForm
    removed: { itemId: string; groupId: string; orderIndex: number; pageBreakBefore: boolean }
  }
}

export async function restoreDraftPaperItem(
  draftPaperId: string,
  input: { groupId: string; orderIndex: number; pageBreakBefore: boolean },
): Promise<DraftPaperWithForm> {
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
  const data = (await response.json()) as { draftPaper: DraftPaperWithForm }
  return data.draftPaper
}

export async function downloadDraftPaperPdf(
  draftPaperId: string,
  versionType: 'student' | 'teacher' = 'student',
): Promise<void> {
  const response = await fetch(apiPath(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/print-pdf`), {
    body: JSON.stringify({ versionType }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to export draft paper PDF: ${response.status}`))
  }
  const blob = await response.blob()
  const defaultFileName = versionType === 'teacher' ? '英语草稿卷-教师卷.pdf' : '英语草稿卷-学生卷.pdf'
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || defaultFileName
  downloadBlob(blob, fileName)
}
