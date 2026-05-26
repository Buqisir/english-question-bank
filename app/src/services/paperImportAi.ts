export type PaperImportAiQuestion = {
  id: string
  stem: string
  options: Record<'A' | 'B' | 'C' | 'D', string>
  answerKey: string
}

export type PaperImportAiReadingGroup = {
  groupId: string
  title: string
  order: number
  paragraphs: Array<{ id: string; text: string }>
  questions: PaperImportAiQuestion[]
}

export type PaperImportAiSkippedItem = {
  rawText: string
  reason: string
}

export type PaperImportAiParseResult = {
  paper: {
    paperId: string
    sourceFilename: string
    sourceHash: string
    answerSourceFilename: string
  }
  readingGroups: PaperImportAiReadingGroup[]
  skipped: PaperImportAiSkippedItem[]
}

export type PaperImportAiProviderId = 'deepseek-v4-pro' | 'gpt-5.5'

export type PaperImportAiAnalysisResult = {
  analysis: Record<string, unknown>
  provider: string
  model: string
  requestId: string
  latencyMs: number
}

export type PaperImportAiPublishResult = {
  ok: boolean
  status: string
  error?: string
  detail?: Record<string, unknown>
  validation?: {
    ok: boolean
    blockingIssues: Array<{ message: string; code?: string }>
    warnings: Array<{ message: string; code?: string }>
  }
  publish?: {
    paperId: string
    assetVersion: number
    versionName: string
    qaLinks: Array<{
      groupId: string
      title: string
      latestHref: string
      versionHref: string
    }>
  }
}

const API_ORIGIN = 'http://127.0.0.1:8787'

function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    return path
  }
  return `${API_ORIGIN}${path}`
}

async function parseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return new Error(data?.error || fallback)
}

export async function parsePaperImportAiDocx(file: File, answerFile?: File | null) {
  const formData = new FormData()
  formData.append('files', file, file.name)
  if (answerFile) formData.append('files', answerFile, answerFile.name)
  const response = await fetch(apiPath('/api/paper-import-ai/parse'), {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw await parseError(response, `Failed to parse paper import AI DOCX: ${response.status}`)
  }
  return (await response.json()) as PaperImportAiParseResult
}

export async function analyzePaperImportAiReadingGroup(input: {
  paper: PaperImportAiParseResult['paper']
  group: PaperImportAiReadingGroup
  providerId: PaperImportAiProviderId
}) {
  const response = await fetch(apiPath('/api/paper-import-ai/analyze'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseError(response, `Failed to analyze paper import AI group: ${response.status}`)
  }
  return (await response.json()) as PaperImportAiAnalysisResult
}

export async function publishPaperImportAiAnalysis(input: {
  file: File
  parseResult: PaperImportAiParseResult
  analysesByGroupId: Record<string, Record<string, unknown>>
}) {
  const formData = new FormData()
  formData.append('files', input.file, input.file.name)
  formData.append(
    'files',
    new Blob([
      JSON.stringify({
        parseResult: input.parseResult,
        analysesByGroupId: input.analysesByGroupId,
      }),
    ], { type: 'application/json' }),
    'paper-import-ai-publish.json',
  )
  const response = await fetch(apiPath('/api/paper-import-ai/publish'), {
    method: 'POST',
    body: formData,
  })
  const data = (await response.json().catch(() => null)) as PaperImportAiPublishResult | null
  if (!response.ok) {
    throw new Error(data?.error || data?.validation?.blockingIssues?.[0]?.message || `Failed to publish paper import AI analysis: ${response.status}`)
  }
  return data as PaperImportAiPublishResult
}
