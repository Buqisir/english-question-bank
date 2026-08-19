import type { MySpaceArtifact, MySpaceFolder } from '../domain/questionBank'
import { directDownloadTarget, saveBlobToTarget, type FileSaveTarget } from './fileDownload.ts'
import { apiPath, errorMessageFromResponse as readError } from './httpClient.ts'

export type MySpaceSnapshot = {
  folders: MySpaceFolder[]
  artifacts: MySpaceArtifact[]
}

export async function fetchMySpace(folderId?: string | null): Promise<MySpaceSnapshot> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
  const response = await fetch(apiPath(`/api/my-space${query}`))
  if (!response.ok) throw new Error(await readError(response, `Failed to load My Space: ${response.status}`))
  return (await response.json()) as MySpaceSnapshot
}

export async function createMySpaceFolder(name: string): Promise<MySpaceFolder> {
  const response = await fetch(apiPath('/api/my-space/folders'), {
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error(await readError(response, `Failed to create folder: ${response.status}`))
  const data = (await response.json()) as { folder: MySpaceFolder }
  return data.folder
}

export async function renameMySpaceFolder(id: string, name: string): Promise<MySpaceFolder> {
  const response = await fetch(apiPath(`/api/my-space/folders/${encodeURIComponent(id)}`), {
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!response.ok) throw new Error(await readError(response, `Failed to rename folder: ${response.status}`))
  const data = (await response.json()) as { folder: MySpaceFolder }
  return data.folder
}

export async function deleteMySpaceFolder(id: string): Promise<void> {
  const response = await fetch(apiPath(`/api/my-space/folders/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response, `Failed to delete folder: ${response.status}`))
}

export async function saveDraftPaperToMySpace(input: {
  draftPaperId: string
  folderId?: string | null
  fileName?: string
}): Promise<{ artifact: MySpaceArtifact; reusedRecentPdf: boolean }> {
  const response = await fetch(apiPath('/api/my-space/artifacts'), {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error(await readError(response, `Failed to save artifact: ${response.status}`))
  return (await response.json()) as { artifact: MySpaceArtifact; reusedRecentPdf: boolean }
}

export async function deleteMySpaceArtifact(id: string): Promise<void> {
  const response = await fetch(apiPath(`/api/my-space/artifacts/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response, `Failed to delete artifact: ${response.status}`))
}

export async function downloadMySpaceArtifact(
  artifact: MySpaceArtifact,
  target: FileSaveTarget = directDownloadTarget(),
): Promise<void> {
  const response = await fetch(apiPath(artifact.fileUrl))
  if (!response.ok) throw new Error(await readError(response, `Failed to download artifact: ${response.status}`))
  const blob = await response.blob()
  await saveBlobToTarget(blob, artifact.fileName || '英语草稿卷-学生卷.pdf', target)
}
