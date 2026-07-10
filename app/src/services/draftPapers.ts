import type { DraftPaper, DraftPaperSummary } from '../domain/questionBank'
import { apiPath, decodeHeaderValue, errorMessageFromResponse as readError } from './httpClient.ts'

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

export async function fetchCurrentDraftPaper(create = true): Promise<DraftPaper> {
  const response = await fetch(apiPath(`/api/draft-papers/current${create ? '?create=1' : ''}`))
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load current draft paper: ${response.status}`))
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

export async function updateDraftPaper(
  id: string,
  input: Partial<Pick<DraftPaper, 'title' | 'studentLabel'>> & {
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
