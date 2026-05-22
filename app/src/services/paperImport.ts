export type PaperImportIssue = {
  severity: 'blocking' | 'warning'
  code: string
  message: string
  fileName?: string | null
  path?: string | null
  suggestedFix?: string | null
  quote?: string
}

export type PaperImportStructureItem = {
  groupId: string
  groupType: string
  title: string
  questionIds: string[]
  paragraphCount: number
}

export type PaperImportReadingGroup = {
  groupId: string
  title: string
  questionIds: string[]
  defaultQuestionId: string | null
}

export type PaperImportValidation = {
  ok: boolean
  paperId: string | null
  assetVersion: number | null
  acceptedFiles: Array<{ fileName: string; size: number; kind: string }>
  rejectedFiles: Array<{ fileName: string; reason: string }>
  warnings: PaperImportIssue[]
  blockingIssues: PaperImportIssue[]
  structurePreview: PaperImportStructureItem[]
  readingGroups: PaperImportReadingGroup[]
  generatedAt: string
}

export type PaperImportQaLink = {
  groupId: string
  title: string
  latestHref: string
  versionHref: string
}

export type PaperImportPublishResult = {
  ok: boolean
  status: string
  validation: PaperImportValidation
  publish: null | {
    ok: boolean
    paperId: string
    assetVersion: number
    versionName: string
    qaLinks: PaperImportQaLink[]
    searchHref: string
    generatedAt: string
    latestDir?: string
    versionDir?: string
  }
}

const API_ORIGIN = 'http://127.0.0.1:8787'

function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  if (window.location.port === '5173') return path
  return `${API_ORIGIN}${path}`
}

function buildFormData(files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file, file.name)
  }
  return formData
}

async function parseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return new Error(data?.error || fallback)
}

export async function validatePaperImport(files: File[]) {
  const response = await fetch(apiPath('/api/paper-import/validate'), {
    method: 'POST',
    body: buildFormData(files),
  })
  if (!response.ok && response.status !== 422) {
    throw await parseError(response, `Failed to validate paper import: ${response.status}`)
  }
  const data = (await response.json()) as { validation: PaperImportValidation }
  return data.validation
}

export async function publishPaperImport(files: File[]) {
  const response = await fetch(apiPath('/api/paper-import/publish'), {
    method: 'POST',
    body: buildFormData(files),
  })
  if (!response.ok && response.status !== 422) {
    throw await parseError(response, `Failed to publish paper import: ${response.status}`)
  }
  return (await response.json()) as PaperImportPublishResult
}
